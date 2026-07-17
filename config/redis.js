const { Redis } = require("@upstash/redis");
const logger = require("../utils/logger");

// Use environment variables (set in Render)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Or simply: const redis = Redis.fromEnv();

// Emulate event emitters for compatibility with existing code
redis.on = (event, callback) => {
  if (event === "connect") {
    // Since REST is always connected, call immediately
    setImmediate(() => callback());
  }
  if (event === "error") {
    // No error unless misconfigured
  }
  return redis;
};

redis.emit = () => {}; // stub

redis.on("connect", () => logger.info("✅ Redis connected (via Upstash REST)"));
redis.on("error", (err) => logger.error("Redis error:", err));

module.exports = redis;
