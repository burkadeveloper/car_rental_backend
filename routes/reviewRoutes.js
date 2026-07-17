const express = require("express");
const router = express.Router();
const {
  createReview,
  getCarReviews,
} = require("../controllers/reviewController");
const { protect } = require("../middlewares/auth");

router.get("/car/:carId", getCarReviews);
router.post("/", protect, createReview);

module.exports = router;
