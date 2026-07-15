const express = require("express");
const router = express.Router();
const {
  initiatePayment,
  webhook,
} = require("../controllers/paymentController");
const { protect } = require("../middlewares/auth");

// Initiate payment (protected)
router.post("/initiate", protect, initiatePayment);

// Webhook (no auth – verified by signature)
router.post("/webhook/:gateway", webhook);

module.exports = router;
