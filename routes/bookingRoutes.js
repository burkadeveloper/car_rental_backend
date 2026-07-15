const express = require("express");
const router = express.Router();
const {
  createBooking,
  getMyBookings,
  getBooking,
  updateBooking,
  updateBookingStatus,
  cancelBooking,
  adminCancelBooking,
  cleanupPendingBookings,
  markReturned,
} = require("../controllers/bookingController");
const { protect, authorize } = require("../middlewares/auth");
const requireCompleteProfile = require("../middlewares/completeProfile");

router.use(protect);

// ── Create: require complete profile ──
router.post("/", requireCompleteProfile, createBooking);

// ── Update: no profile check (allow admin and user) ──
router.put("/:id", updateBooking);

router.get("/", getMyBookings);
router.get("/:id", getBooking);
router.put("/:id/status", authorize("staff", "admin"), updateBookingStatus);
router.put("/:id/cancel", cancelBooking);

// Admin-only
router.put("/admin/cancel/:id", authorize("admin"), adminCancelBooking);
router.put("/admin/cleanup/:carId", authorize("admin"), cleanupPendingBookings);
router.put("/admin/return/:id", authorize("admin"), markReturned);

module.exports = router;
