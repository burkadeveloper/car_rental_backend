const Redis = require("ioredis");
const logger = require("../utils/logger");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error("Redis connection failed after 10 retries.");
      return null; // stop retrying
    }
    return Math.min(times * 100, 3000);
  },
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error("Redis error:", err));

module.exports = redis;
