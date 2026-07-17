const Review = require("../models/Review");
const Booking = require("../models/Booking");

// @desc    Create review
// @route   POST /api/v1/reviews
// @access  Private (customer)
exports.createReview = async (req, res, next) => {
  try {
    const { carId, bookingId, rating, comment } = req.body;
    // Check booking exists and is completed
    const booking = await Booking.findOne({
      _id: bookingId,
      user: req.user.id,
      status: "completed",
    });
    if (!booking)
      return res
        .status(400)
        .json({ message: "You can only review completed rentals" });

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) return res.status(400).json({ message: "Already reviewed" });

    const review = await Review.create({
      user: req.user.id,
      car: carId,
      booking: bookingId,
      rating,
      comment,
    });
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};

// @desc    Get reviews for car
// @route   GET /api/v1/reviews/car/:carId
// @access  Public
exports.getCarReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({
      car: req.params.carId,
      isApproved: true,
    })
      .populate("user", "name")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};
