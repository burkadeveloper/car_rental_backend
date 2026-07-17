const express = require("express");
const router = express.Router();
const {
  getUsers,
  updateUserRole,
  toggleUserActive,
  getUserDetails, // new
  getCarBookings, // new
  getUserBookings,
  getBookedCars,
  getAllBookings,
  revenueReport,
  utilisationReport,
  exportRevenueReport,
  dashboardStats,
  getPendingVerifications,
  approveVerification,
  rejectVerification,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middlewares/auth");

router.use(protect, authorize("admin"));

// Users
router.get("/users", getUsers);
router.get("/users/:userId", getUserDetails); // new
router.put("/users/:id/role", updateUserRole);
router.put("/users/:id/toggle", toggleUserActive);
router.get("/users/:userId/bookings", getUserBookings);

// Cars
router.get("/cars/:carId/bookings", getCarBookings); // new

// Bookings
router.get("/bookings", getAllBookings);
router.get("/booked-cars", getBookedCars);

// Reports
router.get("/reports/revenue", revenueReport);
router.get("/reports/utilisation", utilisationReport);
router.get("/reports/revenue/export", exportRevenueReport);

// Verifications
router.get("/verifications/pending", getPendingVerifications);
router.put("/verifications/:userId/approve", approveVerification);
router.put("/verifications/:userId/reject", rejectVerification);

// Dashboard
router.get("/dashboard/stats", dashboardStats);

module.exports = router;
