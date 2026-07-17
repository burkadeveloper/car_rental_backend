const mongoose = require("mongoose");

const carSchema = new mongoose.Schema(
  {
    make: { type: String, required: true },
    model: { type: String, required: true },
    year: { type: Number, required: true },
    licensePlate: { type: String, required: true, unique: true },
    color: String,
    fuelType: {
      type: String,
      enum: ["Petrol", "Diesel", "Electric", "Hybrid"],
    },
    transmission: { type: String, enum: ["Automatic", "Manual"] },
    seatingCapacity: { type: Number, min: 1 },
    dailyRate: { type: Number, required: true, min: 0 },
    weeklyRate: { type: Number, min: 0 },
    securityDeposit: { type: Number, required: true, min: 0 },
    description: {
      en: { type: String, default: "" },
      am: { type: String, default: "" },
    },
    currentLocation: {
      type: String,
      default: "",
    },
    features: [String],
    images: [String],
    status: {
      type: String,
      enum: ["available", "rented", "maintenance"],
      default: "available",
    },
    mileage: { type: Number, default: 0 },
    location: { type: String, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Index for search
carSchema.index({ location: 1, status: 1, dailyRate: 1 });

module.exports = mongoose.model("Car", carSchema);
