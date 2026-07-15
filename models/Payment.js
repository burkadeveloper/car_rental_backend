const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: [
        "stripe",
        "paypal",
        "chapa",
        "telebirr",
        "bank_transfer",
        "cash",
        "pay_on_arrival",
      ],
      default: "pay_on_arrival",
    },
    transactionId: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "refunded"],
      default: "pending",
    },
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", paymentSchema);
