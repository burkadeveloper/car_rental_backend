const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    car: { type: mongoose.Schema.Types.ObjectId, ref: "Car", required: true },
    pickupLocation: { type: String, required: true },
    dropoffLocation: { type: String, required: true },
    pickupDate: { type: Date, required: true },
    dropoffDate: { type: Date, required: true },
    pickupTime: { type: String, required: true }, // "HH:mm"
    dropoffTime: { type: String, required: true },
    totalCost: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "active", "completed", "cancelled"],
      default: "pending",
    },
    driverDetails: {
      name: String,
      licenseNumber: String,
      phone: String,
    },
    extras: [String],
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    pickupLat: { type: Number, default: null },
    pickupLng: { type: Number, default: null },
    dropoffLat: { type: Number, default: null },
    dropoffLng: { type: Number, default: null },
    paymentMethod: { type: String, default: "pay_on_arrival" },
  },
  {
    // ... existing fields ...
    penaltyAmount: { type: Number, default: 0 },
    overdueHours: { type: Number, default: 0 },
    returnedAt: { type: Date },
    reminderSent: { type: Boolean, default: false }, // avoid duplicate emails
  },

  { timestamps: true },
);

// Ensure car is not double‑booked (application‑level, not DB)
module.exports = mongoose.model("Booking", bookingSchema);
