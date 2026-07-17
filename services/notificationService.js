const Notification = require("../models/Notification");
const { sendEmail } = require("./emailService");
const { sendSMS } = require("./smsService");
const { getIo } = require("../socket");
const logger = require("../utils/logger");

/**
 * Create an in-app notification and push via socket
 */
exports.createNotification = async (
  userId,
  title,
  message,
  type = "system",
  link = "",
) => {
  try {
    if (!userId) return null;
    const notification = new Notification({
      user: userId,
      title,
      message,
      type,
      link,
    });
    await notification.save();
    const io = getIo();
    io.to(`user_${userId}`).emit("newNotification", notification);
    return notification;
  } catch (error) {
    logger.error("Notification error:", error);
    return null;
  }
};

/**
 * Send combined notification (email + SMS + in-app)
 */
exports.sendCombinedNotification = async (
  user,
  title,
  message,
  type = "system",
) => {
  try {
    await exports.createNotification(user._id, title, message, type);
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: title,
        html: `<p>${message}</p>`,
      });
    }
    if (user.phone) {
      await sendSMS(user.phone, `${title}: ${message}`);
    }
  } catch (error) {
    logger.error("Combined notification error:", error);
  }
};
