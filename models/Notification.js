const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["booking", "payment", "promotion", "system"] },
    isRead: { type: Boolean, default: false },
    link: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Notification", notificationSchema);
