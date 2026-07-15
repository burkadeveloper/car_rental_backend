const express = require("express");
const passport = require("../config/passport");
const {
  register,
  login,
  verifyEmail,
  googleCallback,
  sendPhoneOTP,
  verifyPhone,
  updateProfile,
  uploadLicenseImage,
  uploadIdImage,
  refreshToken,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  updateProfilePicture,
} = require("../controllers/authController");
const { protect } = require("../middlewares/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ─── Registration & Login ───
router.post("/register", register);
router.post("/login", login);
router.get("/verify-email/:token", verifyEmail);

// ─── Google OAuth ───
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login",
  }),
  googleCallback,
);

// ─── Phone Verification ───
router.post("/send-otp", protect, sendPhoneOTP);
router.post("/verify-otp", protect, verifyPhone);

// ─── Profile & File Uploads ───
router.put("/profile", protect, updateProfile);
router.put(
  "/profile-picture",
  protect,
  upload.single("image"),
  updateProfilePicture,
);
router.put(
  "/upload-license",
  protect,
  upload.single("image"),
  uploadLicenseImage,
);
router.put("/upload-id", protect, upload.single("image"), uploadIdImage);

// ─── Token & Auth ───
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);

// ─── Password Reset ───
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
