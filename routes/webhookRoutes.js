const express = require("express");
const { Chapa } = require("chapa-nodejs");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const Car = require("../models/Car");

const router = express.Router();

const chapa = new Chapa({
  secretKey: process.env.CHAPA_SECRET_KEY,
  webhookSecret: process.env.CHAPA_WEBHOOK_SECRET,
});

router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-chapa-signature"];
    const rawBody = JSON.stringify(req.body);
    const isValid = chapa.verifyWebhook(rawBody, signature);

    if (!isValid) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body;
    console.log("📩 Webhook received:", event.event);

    // Handle different event types
    if (event.event === "charge.success") {
      const tx_ref = event.tx_ref;
      const payment = await Payment.findOne({ transactionId: tx_ref });

      if (payment) {
        payment.status = "success";
        await payment.save();

        const booking = await Booking.findById(payment.booking);
        if (booking) {
          booking.paymentStatus = "paid";
          booking.status = "confirmed";
          await booking.save();
          await Car.findByIdAndUpdate(booking.car, { status: "rented" });
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(500);
  }
});

module.exports = router;
