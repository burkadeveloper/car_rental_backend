const logger = require("../utils/logger");

exports.errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  const status = err.status || 500;
  const message = err.message || "Server Error";
  res.status(status).json({ message });
};
