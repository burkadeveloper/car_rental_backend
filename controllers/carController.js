const Car = require("../models/Car");
const Booking = require("../models/Booking");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require("../services/cloudinaryService");
const { cacheGet, cacheSet, cacheDel } = require("../utils/cache");
const jwt = require("jsonwebtoken");

// Helper: parse features from string or JSON
const parseFeatures = (features) => {
  if (!features) return [];
  try {
    return JSON.parse(features);
  } catch (e) {
    return features
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }
};

// Helper: extract user from token (without blocking)
const getUserFromToken = (req) => {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded; // contains { id, role }
  } catch (e) {
    return null;
  }
};

// @desc    Get all cars with filters
// @route   GET /api/v1/cars
// @access  Public (but we check token for admin/staff)
exports.getCars = async (req, res, next) => {
  try {
    const {
      location,
      startDate,
      endDate,
      minPrice,
      maxPrice,
      fuel,
      transmission,
      seating,
      search,
    } = req.query;
    const filter = { isActive: true };

    // 🔍 Extract user from token (if any)
    const user = getUserFromToken(req);
    const isAdminOrStaff =
      user && (user.role === "admin" || user.role === "staff");

    // Debug logs (visible in terminal)
    console.log("🔍 getCars - user from token:", user ? user.role : "guest");
    console.log("🔍 isAdminOrStaff:", isAdminOrStaff);

    // If NOT admin/staff, only show available cars
    if (!isAdminOrStaff) {
      filter.status = "available";
    }
    // else: admin/staff see all statuses (no filter)

    // Apply other filters
    if (location) filter.location = { $regex: location, $options: "i" };
    if (fuel) filter.fuelType = fuel;
    if (transmission) filter.transmission = transmission;
    if (seating) filter.seatingCapacity = { $gte: parseInt(seating) };
    if (minPrice || maxPrice) {
      filter.dailyRate = {};
      if (minPrice) filter.dailyRate.$gte = parseInt(minPrice);
      if (maxPrice) filter.dailyRate.$lte = parseInt(maxPrice);
    }
    if (search) {
      filter.$or = [
        { make: { $regex: search, $options: "i" } },
        { model: { $regex: search, $options: "i" } },
      ];
    }

    // Cache key includes role to separate admin/customer views
    const cacheKey = `cars:${JSON.stringify(req.query)}:${user ? user.role : "guest"}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return res.json(JSON.parse(cached));

    let cars = await Car.find(filter).sort({ dailyRate: 1 });

    // Availability filtering by date (if dates provided)
    if (startDate && endDate) {
      const bookedCars = await Booking.distinct("car", {
        status: { $in: ["confirmed", "active"] },
        $or: [
          {
            pickupDate: { $lte: new Date(endDate), $gte: new Date(startDate) },
          },
          {
            dropoffDate: { $lte: new Date(endDate), $gte: new Date(startDate) },
          },
        ],
      });
      cars = cars.filter((car) => !bookedCars.includes(car._id.toString()));
    }

    await cacheSet(cacheKey, JSON.stringify(cars), 60);
    res.json(cars);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single car by ID
// @route   GET /api/v1/cars/:id
// @access  Public
exports.getCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car || !car.isActive)
      return res.status(404).json({ message: "Car not found" });
    res.json(car);
  } catch (error) {
    next(error);
  }
};

// @desc    Create a new car (Admin/Staff)
// @route   POST /api/v1/cars
// @access  Admin/Staff (uses protect middleware)
exports.createCar = async (req, res, next) => {
  try {
    const carData = { ...req.body };
    if (req.body.features) carData.features = parseFeatures(req.body.features);
    if (req.files && req.files.length) {
      const uploadPromises = req.files.map((file) =>
        uploadToCloudinary(file.buffer),
      );
      const uploadResults = await Promise.all(uploadPromises);
      carData.images = uploadResults.map((u) => u.secure_url);
    }
    const car = await Car.create(carData);
    await cacheDel("cars:*");
    res.status(201).json(car);
  } catch (error) {
    next(error);
  }
};

// @desc    Update car (Admin/Staff)
// @route   PUT /api/v1/cars/:id
// @access  Admin/Staff
exports.updateCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Car not found" });
    const updateData = { ...req.body };
    if (req.body.features)
      updateData.features = parseFeatures(req.body.features);
    if (req.files && req.files.length) {
      await Promise.all(
        car.images.map((img) => deleteFromCloudinary(img).catch(() => {})),
      );
      const uploadPromises = req.files.map((file) =>
        uploadToCloudinary(file.buffer),
      );
      const uploadResults = await Promise.all(uploadPromises);
      updateData.images = uploadResults.map((u) => u.secure_url);
    }
    const updated = await Car.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });
    await cacheDel("cars:*");
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// @desc    Soft delete car
// @route   DELETE /api/v1/cars/:id
// @access  Admin/Staff
exports.deleteCar = async (req, res, next) => {
  try {
    const car = await Car.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!car) return res.status(404).json({ message: "Car not found" });
    await cacheDel("cars:*");
    res.json({ message: "Car deactivated" });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanent delete (admin only)
exports.permanentDeleteCar = async (req, res, next) => {
  try {
    const car = await Car.findById(req.params.id);
    if (!car) return res.status(404).json({ message: "Car not found" });
    await Promise.all(
      car.images.map((img) => deleteFromCloudinary(img).catch(() => {})),
    );
    await car.remove();
    await cacheDel("cars:*");
    res.json({ message: "Car permanently deleted" });
  } catch (error) {
    next(error);
  }
};
