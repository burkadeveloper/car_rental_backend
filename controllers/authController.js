const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendEmail } = require("../services/emailService");
const { sendSMS } = require("../services/smsService");
const { createNotification } = require("../services/notificationService");
const logger = require("../utils/logger");

// ─── HELPERS ───
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );
  return { accessToken, refreshToken };
};

const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie("token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// ─── EMAIL VERIFICATION ───
const sendVerificationEmail = async (user) => {
  const token = crypto.randomBytes(20).toString("hex");
  user.emailVerificationToken = token;
  user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  await user.save();
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  await sendEmail({
    to: user.email,
    subject: "Email Verification",
    html: `<p>Please verify your email by clicking <a href="${verifyUrl}">here</a>. This link expires in 24 hours.</p>`,
  });
};

// ─── REGISTER ───
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    console.log("📝 Registration attempt:", email);

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Create user
    const user = new User({ name, email, password, phone });
    await user.save();
    console.log("✅ User created:", user._id);

    // Send verification email
    try {
      await sendVerificationEmail(user);
      console.log("📧 Verification email sent to:", email);
    } catch (emailError) {
      console.error("❌ Email send error:", emailError.message);
      // Still return success, but user can request resend later
    }

    res.status(201).json({
      message: "Registration successful. Please verify your email.",
      userId: user._id,
    });
  } catch (error) {
    console.error("❌ Registration error:", error);
    next(error);
  }
};
// ─── EMAIL VERIFICATION CALLBACK ───
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });
    if (!user)
      return res.status(400).json({ message: "Invalid or expired token" });

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.json({ message: "Email verified successfully. You can now login." });
  } catch (error) {
    next(error);
  }
};

// ─── LOGIN ───
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (!user.isEmailVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email first." });
    }

    if (!(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive)
      return res.status(403).json({ message: "Account disabled" });

    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── GOOGLE OAUTH CALLBACK ───
exports.googleCallback = async (req, res, next) => {
  try {
    const { id, displayName, emails } = req.user;
    const email = emails[0].value;

    let user = await User.findOne({ googleId: id });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = id;
      } else {
        user = new User({
          googleId: id,
          name: displayName,
          email,
          phone: "",
          isEmailVerified: true,
          password: undefined,
        });
      }
      await user.save();
    }

    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save();
    }

    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    // Redirect to frontend (will check profile completeness)
    res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
  } catch (error) {
    next(error);
  }
};

// ─── PHONE VERIFICATION (Send OTP) ───
exports.sendPhoneOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const user = req.user;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneVerificationCode = code;
    user.phoneVerificationExpires = Date.now() + 10 * 60 * 1000;
    user.phone = phone;
    await user.save();

    await sendSMS(phone, `Your verification code is: ${code}`);
    res.json({ message: "OTP sent to your phone" });
  } catch (error) {
    next(error);
  }
};

exports.verifyPhone = async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = req.user;
    if (
      user.phoneVerificationCode !== code ||
      user.phoneVerificationExpires < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    user.isPhoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpires = undefined;
    await user.save();

    res.json({ message: "Phone verified successfully" });
  } catch (error) {
    next(error);
  }
};

// ─── PROFILE COMPLETENESS ───
exports.isProfileComplete = (user) => {
  const required = [
    "profilePicture",
    "driverLicense",
    "idNumber",
    "address",
    "phone",
  ];
  for (const field of required) {
    if (!user[field]) return false;
  }
  return true;
};

// ─── UPDATE PROFILE ───
exports.updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "phone",
      "driverLicense",
      "idNumber",
      "address",
      "profilePicture",
    ];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    res.json(user);
  } catch (error) {
    next(error);
  }
};

// ─── MIDDLEWARE: require complete profile ───
exports.requireCompleteProfile = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!exports.isProfileComplete(user)) {
    return res.status(403).json({
      message:
        "Please complete your profile (profile picture, ID, license, address, phone) before booking.",
      redirect: "/profile/complete",
    });
  }
  next();
};

// ─── REFRESH TOKEN ───
exports.refreshToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken)
      return res.status(401).json({ message: "No refresh token" });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: "Invalid refresh token" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    user.refreshToken = newRefreshToken;
    await user.save();

    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// ─── LOGOUT ───
exports.logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res.clearCookie("token");
    res.clearCookie("refreshToken");
    res.json({ message: "Logged out" });
  } catch (error) {
    next(error);
  }
};

// ─── GET CURRENT USER ───
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(
      "-password -refreshToken",
    );
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

// ─── UPDATE PROFILE PICTURE ───
exports.updateProfilePicture = async (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No image provided" });
    const { uploadToCloudinary } = require("../services/cloudinaryService");
    const result = await uploadToCloudinary(req.file.buffer);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profilePicture: result.secure_url },
      { new: true },
    ).select("-password -refreshToken");
    res.json(user);
  } catch (error) {
    next(error);
  }
};

// ─── FORGOT PASSWORD ───
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const token = crypto.randomBytes(20).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await sendEmail({
      to: user.email,
      subject: "Password Reset",
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 10 minutes.</p>`,
    });

    res.json({ message: "Reset email sent" });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user)
      return res.status(400).json({ message: "Invalid or expired token" });

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
};
// ─── UPLOAD LICENSE IMAGE ───
exports.uploadLicenseImage = async (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No image provided" });
    const { uploadToCloudinary } = require("../services/cloudinaryService");
    const result = await uploadToCloudinary(req.file.buffer);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { driverLicenseImage: result.secure_url },
      { new: true },
    ).select("-password -refreshToken");
    res.json(user);
  } catch (error) {
    next(error);
  }
};

// ─── UPLOAD ID IMAGE ───
exports.uploadIdImage = async (req, res, next) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "No image provided" });
    const { uploadToCloudinary } = require("../services/cloudinaryService");
    const result = await uploadToCloudinary(req.file.buffer);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { idImage: result.secure_url },
      { new: true },
    ).select("-password -refreshToken");
    res.json(user);
  } catch (error) {
    next(error);
  }
};
exports.updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      "name",
      "phone",
      "driverLicense",
      "idNumber",
      "address",
      "profilePicture",
    ];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");
    res.json(user);
  } catch (error) {
    next(error);
  }
};
exports.isProfileComplete = (user) => {
  const required = [
    "phone",
    "driverLicense",
    "driverLicenseImage",
    "idNumber",
    "idImage",
    "address",
  ];
  for (const field of required) {
    if (!user[field]) return false;
  }
  return true;
};
exports.sendPhoneOTP = async (req, res, next) => {
  try {
    const { phone } = req.body;
    const user = req.user;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneVerificationCode = code;
    user.phoneVerificationExpires = Date.now() + 10 * 60 * 1000;
    user.phone = phone;
    await user.save();

    // Try to send SMS; if it fails, we still return success
    try {
      await sendSMS(phone, `Your verification code is: ${code}`);
    } catch (smsErr) {
      logger.warn(`SMS send failed, but code generated: ${code}`);
      // For development, return the code in response (remove in production)
      return res.status(200).json({
        message: "OTP sent (but SMS failed). Check server logs for code.",
        code, // ⚠️ remove this in production
      });
    }

    res.json({ message: "OTP sent to your phone" });
  } catch (error) {
    next(error);
  }
};
exports.verifyPhone = async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = req.user;
    if (
      user.phoneVerificationCode !== code ||
      user.phoneVerificationExpires < Date.now()
    ) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    user.isPhoneVerified = true;
    user.phoneVerificationCode = undefined;
    user.phoneVerificationExpires = undefined;
    await user.save();

    res.json({ message: "Phone verified successfully" });
  } catch (error) {
    next(error);
  }
};
