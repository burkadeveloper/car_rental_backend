const express = require("express");
const router = express.Router();
const {
  createCoupon,
  getCoupons,
  getCoupon,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/couponController");
const { protect, authorize } = require("../middlewares/auth");

// Public validation (any logged-in user)
router.post("/validate", protect, validateCoupon);

// Admin only routes
router.use(protect, authorize("admin"));
router.route("/").get(getCoupons).post(createCoupon);
router.route("/:id").get(getCoupon).put(updateCoupon).delete(deleteCoupon);

module.exports = router;
