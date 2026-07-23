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
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("token", accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax", // ✅ FIXED: cross-site cookies
    maxAge: 15 * 60 * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax", // ✅ FIXED: cross-site cookies
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

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      phone,
    });
    await user.save();
    console.log("✅ User created:", user._id);

    try {
      await sendVerificationEmail(user);
      console.log("📧 Verification email sent to:", email);
    } catch (emailError) {
      console.error("❌ Email send error:", emailError.message);
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
// ─── LOGIN ───
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log("🔐 Login attempt for email:", email);

    // ✅ Select password explicitly
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      console.log("❌ User not found:", email);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log("👤 User found:", user.email);
    console.log(
      "🔑 Stored hash (first 20 chars):",
      user.password ? user.password.substring(0, 20) : "none",
    );

    const isMatch = await user.matchPassword(password);
    console.log("🔑 Password match:", isMatch);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isEmailVerified) {
      return res
        .status(403)
        .json({ message: "Please verify your email first." });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is disabled" });
    }

    const { accessToken, refreshToken } = generateTokens(user);
    user.refreshToken = refreshToken;
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    // Remove password before sending response
    user.password = undefined;

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        verificationStatus: user.verificationStatus,
        profilePicture: user.profilePicture,
        driverLicense: user.driverLicense,
        driverLicenseImage: user.driverLicenseImage,
        idNumber: user.idNumber,
        idImage: user.idImage,
        address: user.address,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
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

    res.redirect(`${process.env.FRONTEND_URL}/auth-success`);
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

// ─── SUBMIT FOR VERIFICATION ───
exports.submitVerification = async (req, res, next) => {
  try {
    const user = req.user;
    const required = [
      "phone",
      "driverLicense",
      "driverLicenseImage",
      "idNumber",
      "idImage",
      "address",
    ];
    const missing = required.filter((f) => !user[f] || user[f].trim() === "");
    if (missing.length > 0) {
      return res.status(400).json({
        message: "Please complete all required fields before submitting.",
        missing,
      });
    }
    if (!user.isPhoneVerified) {
      return res
        .status(400)
        .json({ message: "Please verify your phone number first." });
    }

    if (user.verificationStatus === "pending") {
      return res
        .status(400)
        .json({ message: "Your verification is already pending." });
    }
    if (user.verificationStatus === "approved") {
      return res.status(400).json({ message: "You are already verified." });
    }

    user.verificationStatus = "pending";
    user.verificationMessage = "";
    await user.save();

    res.json({
      message:
        "Verification request submitted. Please wait for admin approval.",
      status: "pending",
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET VERIFICATION STATUS ───
exports.getVerificationStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select(
      "verificationStatus verificationMessage",
    );
    res.json(user);
  } catch (error) {
    next(error);
  }
};
