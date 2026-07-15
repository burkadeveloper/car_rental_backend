const User = require("../models/User");

/**
 * Middleware to check if user has completed required profile fields
 * Should be used before any booking-related routes
 */
const requireCompleteProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const requiredFields = ["phone", "driverLicense", "idNumber", "address"];
    const missing = requiredFields.filter(
      (field) => !user[field] || user[field].trim() === "",
    );

    if (missing.length > 0) {
      return res.status(403).json({
        message: "Please complete your profile before booking.",
        missingFields: missing,
        redirect: "/profile/complete",
      });
    }

    // Optional: check if phone is verified (if you require verification)
    if (!user.isPhoneVerified) {
      return res.status(403).json({
        message: "Please verify your phone number before booking.",
        redirect: "/profile/complete",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireCompleteProfile;
