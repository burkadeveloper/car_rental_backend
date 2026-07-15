const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Car = require("../models/Car");
const {
  stripePayment,
  chapaPayment,
  telebirrPayment,
} = require("../services/paymentService");
const { createNotification } = require("../services/notificationService");

// @desc    Initiate payment
// @route   POST /api/v1/payments/initiate
// @access  Private
exports.initiatePayment = async (req, res, next) => {
  try {
    const { bookingId, method } = req.body;

    const booking = await Booking.findById(bookingId).populate("car");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Already paid" });
    }

    const payment = await Payment.findOne({ booking: bookingId });
    if (!payment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    let response;
    switch (method) {
      case "stripe":
        response = await stripePayment(payment.amount, booking, req.user);
        break;
      case "chapa":
        response = await chapaPayment(payment.amount, booking, req.user);
        break;
      case "telebirr":
        response = await telebirrPayment(payment.amount, booking, req.user);
        break;
      default:
        return res.status(400).json({ message: "Invalid payment method" });
    }

    // Update payment record with transaction ID
    payment.method = method;
    payment.transactionId = response.transactionId;
    await payment.save();

    // Return redirect URL
    res.json({
      redirectUrl: response.url,
      transactionId: response.transactionId,
    });
  } catch (error) {
    // Pass the error with its message to the client
    res
      .status(400)
      .json({ message: error.message || "Payment initiation failed" });
  }
};

// @desc    Webhook handler for payment gateways
exports.webhook = async (req, res, next) => {
  try {
    const { gateway } = req.params;
    // For Chapa, we need to verify the signature (omitted for brevity)
    // Usually you'd verify the webhook secret

    const { tx_ref, status, meta } = req.body;

    // Find payment by transaction ID
    const payment = await Payment.findOne({ transactionId: tx_ref });
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    // Update payment status
    payment.status = status === "success" ? "success" : "failed";
    await payment.save();

    if (status === "success") {
      const booking = await Booking.findById(payment.booking);
      if (booking) {
        booking.paymentStatus = "paid";
        booking.status = "confirmed";
        await booking.save();
        await Car.findByIdAndUpdate(booking.car, { status: "rented" });
        await createNotification(
          booking.user,
          "Payment Successful",
          "Your booking is confirmed.",
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(500);
  }
};
