const Booking = require("../models/Booking");
const Car = require("../models/Car");
const Payment = require("../models/Payment");
const User = require("../models/User");
const { createNotification } = require("../services/notificationService");
const { sendEmail } = require("../services/emailService");
const { sendSMS } = require("../services/smsService");
const { calculateTotal } = require("../utils/priceCalculator");
const { getIo } = require("../socket");

// ─── HELPERS ───
const hasActiveBookings = async (carId) => {
  const count = await Booking.countDocuments({
    car: carId,
    status: { $in: ["pending", "confirmed", "active"] },
  });
  return count > 0;
};

const getBadgeTier = (count) => {
  if (count >= 50) return "platinum";
  if (count >= 20) return "gold";
  if (count >= 10) return "silver";
  return "bronze";
};

// ─── CREATE BOOKING ───
exports.createBooking = async (req, res, next) => {
  try {
    const {
      carId,
      pickupDate,
      dropoffDate,
      pickupTime,
      dropoffTime,
      pickupLocation,
      dropoffLocation,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      extras,
      couponCode,
      paymentMethod,
      driverDetails,
    } = req.body;

    const pickup = new Date(pickupDate);
    const dropoff = new Date(dropoffDate);

    if (dropoff <= pickup) {
      return res
        .status(400)
        .json({ message: "Dropoff date must be after pickup date" });
    }
    const days = Math.ceil((dropoff - pickup) / (1000 * 60 * 60 * 24));
    if (days < 1) {
      return res
        .status(400)
        .json({ message: "Minimum rental period is 1 day" });
    }

    // 1. Auto-repair
    const car = await Car.findById(carId);
    if (!car) return res.status(404).json({ message: "Car not found" });
    if (car.status === "rented") {
      const active = await hasActiveBookings(carId);
      if (!active) {
        car.status = "available";
        await car.save();
      }
    }

    // 2. Overlap check
    const overlapping = await Booking.findOne({
      car: carId,
      status: { $in: ["pending", "confirmed", "active"] },
      $and: [
        { pickupDate: { $lt: dropoff } },
        { dropoffDate: { $gt: pickup } },
      ],
    });

    if (overlapping) {
      if (
        overlapping.user.toString() === req.user.id &&
        overlapping.status === "pending"
      ) {
        overlapping.status = "cancelled";
        await overlapping.save();
      } else {
        return res.status(400).json({
          message: "Car is already booked for the selected dates.",
          existingBooking: overlapping._id,
        });
      }
    }

    // 3. Atomically mark car as rented
    const updatedCar = await Car.findOneAndUpdate(
      { _id: carId, status: "available", isActive: true },
      { status: "rented" },
      { new: true },
    );
    if (!updatedCar) {
      return res
        .status(400)
        .json({ message: "Car is not available for booking" });
    }

    // 4. Calculate total
    const { total, tax, discount } = await calculateTotal(
      updatedCar,
      pickup,
      dropoff,
      extras || [],
      couponCode,
    );

    // 5. Create booking
    const booking = new Booking({
      user: req.user.id,
      car: carId,
      pickupLocation,
      dropoffLocation,
      pickupLat: pickupLat || null,
      pickupLng: pickupLng || null,
      dropoffLat: dropoffLat || null,
      dropoffLng: dropoffLng || null,
      pickupDate: pickup,
      dropoffDate: dropoff,
      pickupTime,
      dropoffTime,
      totalCost: total,
      tax,
      discount,
      extras: extras || [],
      status: "pending",
      paymentStatus: "pending",
      driverDetails: driverDetails || {},
      paymentMethod: paymentMethod || "pay_on_arrival",
    });

    await booking.save();

    // 6. Create payment record
    const payment = new Payment({
      booking: booking._id,
      user: req.user.id,
      amount: total,
      method: paymentMethod || "pay_on_arrival",
      status: "pending",
    });
    await payment.save();
    booking.paymentId = payment._id;
    await booking.save();

    await booking.populate("car", "make model images");

    // 7. Notify staff
    const io = getIo();
    io.to("staff").emit("newBooking", booking);

    // 8. Notify user
    try {
      await sendEmail({
        to: req.user.email,
        subject: "Booking Confirmation",
        html: `<p>Your booking #${booking._id} is pending confirmation.</p>`,
      });
      await sendSMS(req.user.phone, `Booking #${booking._id} received.`);
      await createNotification(
        req.user.id,
        "Booking Created",
        `Booking for ${updatedCar.make} ${updatedCar.model} is pending.`,
      );
    } catch (notifyErr) {
      console.error("Notification error:", notifyErr);
    }

    res.status(201).json({
      booking: {
        _id: booking._id,
        car: booking.car,
        totalCost: booking.totalCost,
        status: booking.status,
      },
      payment: {
        _id: payment._id,
        amount: payment.amount,
        status: payment.status,
      },
    });
  } catch (error) {
    if (req.body.carId) {
      try {
        await Car.findByIdAndUpdate(req.body.carId, { status: "available" });
      } catch (revertErr) {
        console.error("Failed to revert car status:", revertErr);
      }
    }
    next(error);
  }
};

// ─── GET MY BOOKINGS ───
exports.getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ user: req.user.id })
      .populate("car", "make model images licensePlate dailyRate")
      .populate("user", "name email phone profilePicture badge")
      .sort({ createdAt: -1 });
    res.json(bookings);
  } catch (error) {
    next(error);
  }
};

// ─── GET BOOKING BY ID ───
exports.getBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("user", "name email phone profilePicture badge")
      .populate("car", "make model images licensePlate dailyRate");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (
      booking.user._id.toString() !== req.user.id &&
      !["staff", "admin"].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json(booking);
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE BOOKING (USER/ADMIN) ───
// In updateBooking function:

exports.updateBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Authorization: user or admin
    if (booking.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    const isAdmin = req.user.role === "admin";

    // ── Admin can update anything, but we still lock payment method if paid ──
    if (booking.paymentStatus === "paid") {
      // If payment already received, prevent changing paymentMethod
      if (
        req.body.paymentMethod &&
        req.body.paymentMethod !== booking.paymentMethod
      ) {
        return res
          .status(400)
          .json({
            message: "Cannot change payment method after payment is received.",
          });
      }
    }

    // Allowed fields for user (and admin if not locked)
    const allowedUpdates = [
      "pickupDate",
      "dropoffDate",
      "pickupTime",
      "dropoffTime",
      "pickupLocation",
      "dropoffLocation",
      "pickupLat",
      "pickupLng",
      "dropoffLat",
      "dropoffLng",
      "extras",
      "driverDetails",
    ];
    // Allow admin to update status and paymentStatus
    if (isAdmin) {
      allowedUpdates.push("status", "paymentStatus");
      // Admin can update paymentMethod if not paid yet
      if (booking.paymentStatus !== "paid" && req.body.paymentMethod) {
        booking.paymentMethod = req.body.paymentMethod;
      }
    }

    allowedUpdates.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "pickupDate" || field === "dropoffDate") {
          booking[field] = new Date(req.body[field]);
        } else {
          booking[field] = req.body[field];
        }
      }
    });

    // If admin changes status to 'active', also set paymentStatus to 'paid' if not already
    if (
      isAdmin &&
      req.body.status === "active" &&
      booking.paymentStatus !== "paid"
    ) {
      booking.paymentStatus = "paid";
    }

    // If admin marks as completed, handle car status and badge
    if (
      isAdmin &&
      req.body.status === "completed" &&
      booking.status !== "completed"
    ) {
      // ... (as before)
    }

    await booking.save();
    await booking.populate("car");

    // Notify user
    await createNotification(
      booking.user,
      "Booking Updated",
      `Your booking #${booking._id} has been updated.`,
    );
    // ... (email/sms)

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE BOOKING STATUS (STAFF/ADMIN) ───
exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id).populate("car user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // If status is 'active', automatically mark payment as paid
    if (status === "active" && booking.paymentStatus !== "paid") {
      booking.paymentStatus = "paid";
    }

    if (status === "confirmed" && booking.status === "pending") {
      await Car.findByIdAndUpdate(booking.car._id, { status: "rented" });
    }
    if (
      (status === "cancelled" || status === "completed") &&
      booking.status !== "cancelled"
    ) {
      await Car.findByIdAndUpdate(booking.car._id, { status: "available" });
    }

    if (status === "completed" && booking.status !== "completed") {
      const user = await User.findById(booking.user._id);
      if (user) {
        const oldBadge = user.badge;
        user.bookingCount += 1;
        user.badge = getBadgeTier(user.bookingCount);
        await user.save();
        if (user.badge !== oldBadge) {
          await createNotification(
            user._id,
            "🏆 Badge Upgrade!",
            `🎉 Congratulations! You've reached **${user.badge}** tier!`,
          );
          await sendEmail({
            to: user.email,
            subject: "Badge Upgrade!",
            html: `<p>Congratulations! You've reached ${user.badge} tier!</p>`,
          });
          await sendSMS(user.phone, `🎉 You reached ${user.badge} tier!`);
        }
      }
    }

    booking.status = status;
    await booking.save();

    await createNotification(
      booking.user._id,
      "Booking Status Updated",
      `Your booking #${booking._id} status changed to ${status}.`,
    );
    await sendEmail({
      to: booking.user.email,
      subject: "Booking Status Updated",
      html: `<p>Your booking for ${booking.car?.make || "car"} ${booking.car?.model || ""} is now ${status}.</p>`,
    });
    await sendSMS(
      booking.user.phone,
      `Booking #${booking._id} is now ${status}.`,
    );

    const io = getIo();
    io.to(`user_${booking.user._id}`).emit("bookingStatus", booking);
    io.to("staff").emit("bookingUpdated", booking);

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

// ─── CANCEL BOOKING (CUSTOMER) ───
exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("car user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not your booking" });
    }
    if (booking.status === "completed" || booking.status === "cancelled") {
      return res.status(400).json({ message: "Cannot cancel" });
    }

    const now = new Date();
    const pickup = new Date(booking.pickupDate);
    const diffHours = (pickup - now) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return res
        .status(400)
        .json({ message: "Cannot cancel within 24 hours of pickup" });
    }

    booking.status = "cancelled";
    await booking.save();
    await Car.findByIdAndUpdate(booking.car, { status: "available" });

    if (booking.paymentStatus === "paid") {
      booking.paymentStatus = "refunded";
      await booking.save();
    }

    await createNotification(
      booking.user._id,
      "Booking Cancelled",
      `Your booking #${booking._id} has been cancelled.`,
    );
    await sendEmail({
      to: booking.user.email,
      subject: "Booking Cancelled",
      html: `<p>Your booking for ${booking.car?.make || "car"} ${booking.car?.model || ""} has been cancelled.</p>`,
    });
    await sendSMS(booking.user.phone, `Booking #${booking._id} cancelled.`);

    res.json({ message: "Booking cancelled" });
  } catch (error) {
    next(error);
  }
};

// ─── ADMIN CANCEL BOOKING ───
exports.adminCancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("car user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status === "completed" || booking.status === "cancelled") {
      return res.status(400).json({ message: "Cannot cancel this booking" });
    }

    booking.status = "cancelled";
    if (booking.paymentStatus === "paid") {
      booking.paymentStatus = "refunded";
      console.log(`🔄 Admin refunded booking ${booking._id}`);
    }
    await booking.save();
    await Car.findByIdAndUpdate(booking.car, { status: "available" });

    await createNotification(
      booking.user._id,
      "Booking Cancelled by Admin",
      `Your booking #${booking._id} has been cancelled by admin.`,
    );
    await sendEmail({
      to: booking.user.email,
      subject: "Booking Cancelled by Admin",
      html: `<p>Your booking for ${booking.car?.make || "car"} ${booking.car?.model || ""} has been cancelled by admin.</p>`,
    });

    res.json({ message: "Booking cancelled and refunded (if paid)" });
  } catch (error) {
    next(error);
  }
};

// ─── CLEANUP PENDING BOOKINGS ───
exports.cleanupPendingBookings = async (req, res, next) => {
  try {
    const { carId } = req.params;
    const result = await Booking.updateMany(
      { car: carId, status: "pending" },
      { status: "cancelled" },
    );
    await Car.findByIdAndUpdate(carId, { status: "available" });
    res.json({
      message: `Cleaned up ${result.modifiedCount} pending bookings`,
    });
  } catch (error) {
    next(error);
  }
};
// @desc    Mark booking as returned (admin) and calculate final cost
// @route   PUT /api/v1/bookings/admin/return/:id
// @access  Admin
exports.markReturned = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("car user");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "active") {
      return res
        .status(400)
        .json({ message: "Only active bookings can be marked returned." });
    }

    const now = new Date();
    const dropoff = new Date(booking.dropoffDate);
    let penalty = 0;
    let overdueHours = 0;
    if (now > dropoff) {
      const diffMs = now - dropoff;
      overdueHours = Math.ceil(diffMs / (1000 * 60 * 60));
      const hourlyRate = booking.car.dailyRate / 24;
      penalty = hourlyRate * 1.5 * overdueHours;
      penalty = parseFloat(penalty.toFixed(2));
    }

    booking.status = "completed";
    booking.returnedAt = now;
    booking.overdueHours = overdueHours;
    booking.penaltyAmount = penalty;
    booking.reminderSent = true; // no further reminders
    await booking.save();

    // Update car status
    await Car.findByIdAndUpdate(booking.car._id, { status: "available" });

    // Update user badge count (already done in status change, but we do it again)
    const user = await User.findById(booking.user._id);
    if (user) {
      user.bookingCount += 1;
      user.badge = getBadgeTier(user.bookingCount);
      await user.save();
      // Notify user about badge upgrade if changed
    }

    // Notify user
    await createNotification(
      booking.user._id,
      "Rental Completed",
      `Your rental of ${booking.car.make} has been returned.`,
    );
    if (penalty > 0) {
      await createNotification(
        booking.user._id,
        "Late Fee Applied",
        `Late fee of ${penalty} ETB applied for ${overdueHours} hour(s) over time.`,
      );
    }

    res.json({ message: "Car returned successfully", booking });
  } catch (error) {
    next(error);
  }
};
