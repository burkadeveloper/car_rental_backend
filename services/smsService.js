const twilio = require("twilio");
const logger = require("../utils/logger");

let client = null;
const fromNumber = process.env.TWILIO_PHONE || "";

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );
  } catch (err) {
    logger.warn("Twilio init failed:", err.message);
  }
} else {
  logger.warn("Twilio credentials missing – SMS will be logged only.");
}

exports.sendSMS = async (to, message) => {
  if (!client || !fromNumber) {
    logger.info(`SMS (simulated) to ${to}: ${message}`);
    return { sid: "mock-" + Date.now() };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to,
    });
    logger.info(`SMS sent to ${to}: ${result.sid}`);
    return result;
  } catch (error) {
    logger.error(`SMS error: ${error.message}`);
    // Fallback: log the message and return a mock
    logger.info(`SMS (fallback) to ${to}: ${message}`);
    return { sid: "fallback-" + Date.now() };
  }
};
