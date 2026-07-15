const express = require("express");
const router = express.Router();
const {
  getUsers,
  updateUserRole,
  toggleUserActive,
  revenueReport,
  utilisationReport,
  getUserBookings,
  getBookedCars,
  getAllBookings,
} = require("../controllers/adminController");
const { protect, authorize } = require("../middlewares/auth");

router.use(protect, authorize("admin"));

// User management
router.get("/users", getUsers);
router.put("/users/:id/role", updateUserRole);
router.put("/users/:id/toggle", toggleUserActive);

// Reports
router.get("/reports/revenue", revenueReport);
router.get("/reports/utilisation", utilisationReport);
router.get("/users/:userId/bookings", getUserBookings);

router.get("/booked-cars", getBookedCars);
router.get("/bookings", getAllBookings);
router.get("/booked-cars", getBookedCars);
module.exports = router;
