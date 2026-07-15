const User = require("../models/User");
const Booking = require("../models/Booking");
const Car = require("../models/Car");
const Payment = require("../models/Payment");
const ExcelJS = require("exceljs");
const { createNotification } = require("../services/notificationService");
const { sendEmail } = require("../services/emailService");
const { sendSMS } = require("../services/smsService");

// ===========================
// USER MANAGEMENT
// ===========================

/**
 * @desc    Get all users (admin)
 * @route   GET /api/v1/admin/users
 * @access  Admin
 */
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password -refreshToken");
    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user role
 * @route   PUT /api/v1/admin/users/:id/role
 * @access  Admin
 */
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ["customer", "staff", "admin"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true },
    ).select("-password -refreshToken");

    if (!user) return res.status(404).json({ message: "User not found" });

    await createNotification(
      user._id,
      "Role Updated",
      `Your role has been changed to ${role}.`,
    );
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: "Role Updated",
        html: `<p>Your account role has been changed to <strong>${role}</strong>.</p>`,
      });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Toggle user active status
 * @route   PUT /api/v1/admin/users/:id/toggle
 * @access  Admin
 */
exports.toggleUserActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    await createNotification(
      user._id,
      "Account Status Updated",
      `Your account has been ${user.isActive ? "activated" : "deactivated"}.`,
    );

    res.json({
      message: `User ${user.isActive ? "activated" : "deactivated"}`,
      isActive: user.isActive,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get booking history for a specific user (admin)
 * @route   GET /api/v1/admin/users/:userId/bookings
 * @access  Admin
 */
exports.getUserBookings = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const bookings = await Booking.find({ user: userId })
      .populate("car", "make model images licensePlate")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

// ===========================
// BOOKED CARS (CURRENT RENTALS)
// ===========================

/**
 * @desc    Get all currently booked cars with user info
 * @route   GET /api/v1/admin/booked-cars
 * @access  Admin
 */
exports.getBookedCars = async (req, res, next) => {
  try {
    const bookings = await Booking.find({
      status: { $in: ["confirmed", "active"] },
    })
      .populate("car", "make model images licensePlate dailyRate")
      .populate("user", "name email phone profilePicture badge bookingCount")
      .sort({ pickupDate: 1 });

    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

// ===========================
// REPORTS
// ===========================

/**
 * @desc    Get revenue report with chart data
 * @route   GET /api/v1/admin/reports/revenue
 * @access  Admin
 */
exports.revenueReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const start = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();

    // Ensure end date is end of day
    end.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      status: "completed",
      paymentStatus: "paid",
      createdAt: { $gte: start, $lte: end },
    }).populate("car", "make model");

    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalCost, 0);
    const totalBookings = bookings.length;
    const totalUsers = await User.countDocuments();

    // Group by date for chart
    const chartMap = {};
    bookings.forEach((b) => {
      const date = b.createdAt.toISOString().split("T")[0];
      chartMap[date] = (chartMap[date] || 0) + b.totalCost;
    });
    const chartData = Object.keys(chartMap)
      .sort()
      .map((date) => ({ date, revenue: chartMap[date] }));

    res.json({
      revenue: totalRevenue,
      totalBookings,
      totalUsers,
      chartData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get fleet utilisation report
 * @route   GET /api/v1/admin/reports/utilisation
 * @access  Admin
 */
exports.utilisationReport = async (req, res, next) => {
  try {
    const totalCars = await Car.countDocuments({ isActive: true });
    const rentedCars = await Booking.distinct("car", {
      status: { $in: ["confirmed", "active"] },
    });
    const rented = rentedCars.length;
    const utilisation =
      totalCars > 0 ? ((rented / totalCars) * 100).toFixed(2) : 0;

    res.json({
      totalCars,
      rented,
      utilisation: utilisation + "%",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export revenue report as Excel
 * @route   GET /api/v1/admin/reports/revenue/export
 * @access  Admin
 */
exports.exportRevenueReport = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const start = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      status: "completed",
      paymentStatus: "paid",
      createdAt: { $gte: start, $lte: end },
    })
      .populate("car", "make model licensePlate")
      .populate("user", "name email");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Revenue Report");

    sheet.columns = [
      { header: "Booking ID", key: "id", width: 20 },
      { header: "Car", key: "car", width: 20 },
      { header: "License Plate", key: "plate", width: 15 },
      { header: "Customer", key: "customer", width: 20 },
      { header: "Email", key: "email", width: 25 },
      { header: "Total (ETB)", key: "total", width: 15 },
      { header: "Date", key: "date", width: 20 },
    ];

    bookings.forEach((b) => {
      sheet.addRow({
        id: b._id,
        car: b.car ? `${b.car.make} ${b.car.model}` : "N/A",
        plate: b.car ? b.car.licensePlate : "N/A",
        customer: b.user ? b.user.name : "N/A",
        email: b.user ? b.user.email : "N/A",
        total: b.totalCost,
        date: b.createdAt.toLocaleDateString(),
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=revenue-${Date.now()}.xlsx`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

// ===========================
// DASHBOARD STATS (OPTIONAL)
// ===========================

/**
 * @desc    Get admin dashboard summary stats
 * @route   GET /api/v1/admin/dashboard/stats
 * @access  Admin
 */
exports.dashboardStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalCars = await Car.countDocuments({ isActive: true });
    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: "pending" });
    const activeRentals = await Booking.countDocuments({
      status: { $in: ["confirmed", "active"] },
    });
    const completedBookings = await Booking.countDocuments({
      status: "completed",
    });

    // Revenue for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthRevenue = await Booking.aggregate([
      {
        $match: {
          status: "completed",
          paymentStatus: "paid",
          createdAt: { $gte: startOfMonth, $lte: now },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalCost" } } },
    ]);

    res.json({
      totalUsers,
      totalCars,
      totalBookings,
      pendingBookings,
      activeRentals,
      completedBookings,
      monthlyRevenue: monthRevenue[0]?.total || 0,
    });
  } catch (error) {
    next(error);
  }
};
// Add this method to adminController.js

// @desc    Get all bookings (admin)
// @route   GET /api/v1/admin/bookings
// @access  Admin
exports.getAllBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate("user", "name email phone profilePicture")
      .populate("car", "make model images licensePlate dailyRate")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};
