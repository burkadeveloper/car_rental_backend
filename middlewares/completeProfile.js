const User = require("../models/User");

const requireCompleteProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1. Check required fields
    const required = [
      "phone",
      "driverLicense",
      "driverLicenseImage",
      "idNumber",
      "idImage",
      "address",
    ];
    const missing = required.filter(
      (field) => !user[field] || user[field].trim() === "",
    );
    if (missing.length > 0) {
      return res.status(403).json({
        message: "Please complete your profile before booking.",
        missingFields: missing,
        redirect: "/profile/complete",
      });
    }

    // 2. Check phone verification
    if (!user.isPhoneVerified) {
      return res.status(403).json({
        message: "Please verify your phone number before booking.",
        redirect: "/profile/complete",
      });
    }

    // 3. Check admin verification
    if (user.verificationStatus !== "approved") {
      let msg = "Your account is not verified by admin. ";
      if (user.verificationStatus === "pending") {
        msg += "Your verification is pending. Please wait for admin approval.";
      } else if (user.verificationStatus === "rejected") {
        msg += `Reason: ${user.verificationMessage || "Please resubmit your documents."}`;
      } else {
        msg += "Please submit your documents for verification.";
      }
      return res.status(403).json({
        message: msg,
        verificationStatus: user.verificationStatus,
        redirect: "/profile/complete",
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireCompleteProfile;
