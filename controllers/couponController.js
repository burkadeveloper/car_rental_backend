const Coupon = require("../models/Coupon");
const User = require("../models/User");

// @desc    Create a coupon
// @route   POST /api/v1/coupons
// @access  Admin
exports.createCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.create(req.body);
    res.status(201).json(coupon);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all coupons
// @route   GET /api/v1/coupons
// @access  Admin
exports.getCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (error) {
    next(error);
  }
};

// @desc    Get single coupon
// @route   GET /api/v1/coupons/:id
// @access  Admin
exports.getCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (error) {
    next(error);
  }
};

// @desc    Update coupon
// @route   PUT /api/v1/coupons/:id
// @access  Admin
exports.updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete coupon
// @route   DELETE /api/v1/coupons/:id
// @access  Admin
exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (error) {
    next(error);
  }
};

// @desc    Validate coupon for booking (with tier eligibility)
// @route   POST /api/v1/coupons/validate
// @access  Private
exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, bookingTotal } = req.body;
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
    if (!coupon) {
      return res
        .status(404)
        .json({ valid: false, message: "Invalid or expired coupon" });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res
        .status(400)
        .json({ valid: false, message: "Coupon usage limit reached" });
    }

    // Check min booking amount
    if (coupon.minBookingAmount && bookingTotal < coupon.minBookingAmount) {
      return res.status(400).json({
        valid: false,
        message: `Minimum booking amount ${coupon.minBookingAmount} required`,
      });
    }

    // Check user eligibility by badge tier
    if (coupon.eligibleTiers && coupon.eligibleTiers.length > 0) {
      const user = await User.findById(req.user.id);
      if (!user || !coupon.eligibleTiers.includes(user.badge)) {
        return res.status(400).json({
          valid: false,
          message: `This coupon is only for ${coupon.eligibleTiers.join(", ")} members.`,
        });
      }
    }

    // Check if coupon is user‑specific
    if (coupon.user && coupon.user.toString() !== req.user.id) {
      return res.status(400).json({
        valid: false,
        message: "This coupon is not valid for your account.",
      });
    }

    // Calculate discount
    let discount = coupon.discountValue;
    if (coupon.discountType === "percentage") {
      discount = (bookingTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    }

    res.json({
      valid: true,
      discount,
      type: coupon.discountType,
      code: coupon.code,
    });
  } catch (error) {
    next(error);
  }
};
