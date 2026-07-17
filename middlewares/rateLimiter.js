const rateLimit = require("express-rate-limit");

// Global limiter – increased for general traffic
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // allow 500 requests per 15 min
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin‑specific limiter – much higher for dashboard heavy usage
exports.adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000, // generous limit for admin
  message: { message: "Too many admin requests." },
});

// Booking limiter – as before
exports.bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { message: "Too many booking requests." },
});

// Auth limiter – strict
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { message: "Too many authentication attempts." },
});
