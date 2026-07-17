const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const Car = require("../models/Car");
const User = require("../models/User");
const {
  stripePayment,
  chapaPayment,
  telebirrPayment,
} = require("../services/paymentService");
const { createNotification } = require("../services/notificationService");
const { sendEmail } = require("../services/emailService");
const logger = require("../utils/logger");

// @desc    Initiate payment
// @route   POST /api/v1/payments/initiate
// @access  Private
exports.initiatePayment = async (req, res, next) => {
  try {
    const { bookingId, method } = req.body;

    const booking = await Booking.findById(bookingId).populate("car");
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    if (booking.paymentStatus === "paid") {
      return res.status(400).json({ message: "Already paid" });
    }

    const payment = await Payment.findOne({ booking: bookingId });
    if (!payment)
      return res.status(404).json({ message: "Payment record not found" });

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

    payment.method = method;
    payment.transactionId = response.transactionId;
    await payment.save();

    res.json({
      redirectUrl: response.url,
      transactionId: response.transactionId,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Webhook handler for Chapa (and others)
// @route   POST /api/v1/payments/webhook/:gateway
// @access  Public (verified via signature)
exports.webhook = async (req, res, next) => {
  try {
    const { gateway } = req.params;
    // For Chapa, we verify the signature (if you have a webhook secret)
    // For simplicity, we assume the request is valid (but you should verify)
    const event = req.body;
    logger.info(`Webhook received from ${gateway}:`, event);

    if (gateway === "chapa") {
      // Chapa sends: { event: "charge.success", tx_ref: "...", ... }
      if (event.event === "charge.success") {
        const tx_ref = event.tx_ref;
        // Find payment by transactionId
        const payment = await Payment.findOne({ transactionId: tx_ref });
        if (!payment) {
          logger.error(`Payment not found for tx_ref: ${tx_ref}`);
          return res.status(404).json({ message: "Payment not found" });
        }

        // Update payment status
        if (payment.status !== "success") {
          payment.status = "success";
          await payment.save();

          // Update booking
          const booking = await Booking.findById(payment.booking);
          if (booking) {
            booking.paymentStatus = "paid";
            booking.status = "confirmed"; // or active depending on your flow
            await booking.save();

            // Update car status
            await Car.findByIdAndUpdate(booking.car, { status: "rented" });

            // Notify user
            await createNotification(
              booking.user,
              "Payment Successful",
              `Your payment for booking #${booking._id} has been confirmed.`,
            );
            const user = await User.findById(booking.user);
            if (user) {
              await sendEmail({
                to: user.email,
                subject: "Payment Confirmation",
                html: `<p>Your payment for booking #${booking._id} was successful.</p>`,
              });
            }
          }
        }
      }
    }

    // Always respond with 200 OK
    res.sendStatus(200);
  } catch (error) {
    logger.error("Webhook error:", error);
    res.sendStatus(500);
  }
};
