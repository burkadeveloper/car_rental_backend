const express = require("express");
const router = express.Router();
const authRoutes = require("./authRoutes");
const carRoutes = require("./carRoutes");
const bookingRoutes = require("./bookingRoutes");
const paymentRoutes = require("./paymentRoutes");
const adminRoutes = require("./adminRoutes");
const reviewRoutes = require("./reviewRoutes");
const couponRoutes = require("./couponRoutes");
const ticketRoutes = require("./ticketRoutes");
const notificationRoutes = require("./notificationRoutes");

router.use("/auth", authRoutes);
router.use("/cars", carRoutes);
router.use("/bookings", bookingRoutes);
router.use("/payments", paymentRoutes);
router.use("/admin", adminRoutes);
router.use("/reviews", reviewRoutes);
router.use("/coupons", couponRoutes);
router.use("/tickets", ticketRoutes);
router.use("/notifications", notificationRoutes);

module.exports = router;
