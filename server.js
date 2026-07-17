require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { createServer } = require("http");
const cron = require("node-cron");

const { initSocket } = require("./socket");
const routes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const logger = require("./utils/logger");
const connectDB = require("./config/database");
const Booking = require("./models/Booking");
const Car = require("./models/Car");
const { createNotification } = require("./services/notificationService");
// ✅ Import email and SMS services directly
const { sendEmail } = require("./services/emailService");
const { sendSMS } = require("./services/smsService");

const app = express();
const server = createServer(app);
initSocket(server);

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use("/api/v1", apiLimiter);

// Routes
app.use("/api/v1", routes);

// Health check
app.get("/health", (req, res) => res.send("OK"));

// ──────────────── AUTO-CANCEL BOOKINGS (CRON JOB) ────────────────
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // 1. Cancel unpaid non-pay-on-arrival bookings older than 1 hour
    const regularBookings = await Booking.find({
      status: "pending",
      paymentMethod: { $ne: "pay_on_arrival" },
      paymentStatus: { $ne: "paid" },
      createdAt: { $lt: oneHourAgo },
    }).populate("user car");

    for (const booking of regularBookings) {
      booking.status = "cancelled";
      await booking.save();
      await Car.findByIdAndUpdate(booking.car, { status: "available" });

      await createNotification(
        booking.user._id,
        "Booking Cancelled (Unpaid)",
        `Your booking #${booking._id} was cancelled because payment was not completed within 1 hour.`,
      );
      await sendEmail({
        to: booking.user.email,
        subject: "Booking Cancelled – Unpaid",
        html: `<p>Your booking for ${booking.car?.make || "car"} ${booking.car?.model || ""} was cancelled because payment was not completed within 1 hour.</p>`,
      });
      await sendSMS(
        booking.user.phone,
        `Booking #${booking._id} cancelled – unpaid.`,
      );
      console.log(`⏰ Auto-cancelled booking ${booking._id} (unpaid after 1h)`);
    }

    // 2. Cancel pay-on-arrival bookings where pickup time has passed and still unpaid
    const poaBookings = await Booking.find({
      status: "pending",
      paymentMethod: "pay_on_arrival",
      paymentStatus: { $ne: "paid" },
      pickupDate: { $lt: now },
    }).populate("user car");

    for (const booking of poaBookings) {
      booking.status = "cancelled";
      await booking.save();
      await Car.findByIdAndUpdate(booking.car, { status: "available" });

      await createNotification(
        booking.user._id,
        "Booking Cancelled (Pay on Arrival)",
        `Your booking #${booking._id} was cancelled because you did not complete payment by the pickup time.`,
      );
      await sendEmail({
        to: booking.user.email,
        subject: "Booking Cancelled – Pay on Arrival",
        html: `<p>Your booking for ${booking.car?.make || "car"} ${booking.car?.model || ""} was cancelled because payment was not completed by the pickup time.</p>`,
      });
      await sendSMS(
        booking.user.phone,
        `Booking #${booking._id} cancelled – payment deadline missed.`,
      );
      console.log(
        `⏰ Auto-cancelled pay-on-arrival booking ${booking._id} (pickup time passed)`,
      );
    }

    if (regularBookings.length || poaBookings.length) {
      console.log(
        `✅ Auto-cancelled ${regularBookings.length + poaBookings.length} bookings`,
      );
    }
  } catch (err) {
    console.error("❌ Auto-cancel cron error:", err);
  }
});

console.log("✅ Auto-cancel cron job started (runs every minute)");
// ─── OVERDUE RENTALS & REMINDERS ───
cron.schedule("*/30 * * * *", async () => {
  try {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    );

    // 1. Send reminder emails for active bookings ending within 24h
    const upcomingReturn = await Booking.find({
      status: "active",
      dropoffDate: { $gte: now, $lte: twentyFourHoursFromNow },
      reminderSent: false,
    }).populate("user car");

    for (const booking of upcomingReturn) {
      // Send reminder email
      await sendEmail({
        to: booking.user.email,
        subject: "Car Return Reminder",
        html: `
          <p>Dear ${booking.user.name},</p>
          <p>Your rental of <strong>${booking.car.make} ${booking.car.model}</strong> is due for return on <strong>${booking.dropoffDate.toLocaleString()}</strong>.</p>
          <p>Please return the car on time to avoid late fees.</p>
        `,
      });
      await sendSMS(
        booking.user.phone,
        `Reminder: Return ${booking.car.make} by ${booking.dropoffDate.toLocaleString()}`,
      );
      booking.reminderSent = true;
      await booking.save();
    }

    // 2. Handle overdue active rentals (dropoff time passed and not returned)
    const overdueBookings = await Booking.find({
      status: "active",
      dropoffDate: { $lt: now },
    }).populate("user car");

    for (const booking of overdueBookings) {
      // Calculate overdue hours
      const diffMs = now - new Date(booking.dropoffDate);
      const hoursOverdue = Math.ceil(diffMs / (1000 * 60 * 60));
      booking.overdueHours = hoursOverdue;

      // Penalty: hourly rate (dailyRate / 24) * 1.5 (penalty multiplier)
      const hourlyRate = booking.car.dailyRate / 24;
      const penalty = hourlyRate * 1.5 * hoursOverdue;
      booking.penaltyAmount = parseFloat(penalty.toFixed(2));

      // Mark as overdue (keep status active, but we'll add a flag)
      // We could change status to 'overdue' but let's keep active to allow admin to mark return.
      // We'll just set penalty.
      await booking.save();

      // Send notification to admin and user about overdue
      await createNotification(
        booking.user._id,
        "Rental Overdue",
        `Your rental of ${booking.car.make} ${booking.car.model} is overdue. Late fees of ${penalty} ETB have been applied.`,
      );
      await createNotification(
        "admin", // Notify staff? We'll need a system user or admin group.
        `Booking ${booking._id} overdue`,
        `User ${booking.user.name} hasn't returned ${booking.car.make} ${booking.car.model}. Penalty: ${penalty} ETB.`,
      );
    }
  } catch (err) {
    console.error("❌ Overdue check cron error:", err);
  }
});
console.log("✅ Overdue & reminder cron job started (runs every 30 minutes)");
// Error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
