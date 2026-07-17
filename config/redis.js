const Redis = require("ioredis");
const logger = require("../utils/logger");
const dns = require("dns");
const net = require("net");

const host = process.env.REDIS_HOST || "grown-ray-138974.upstash.io";
const port = parseInt(process.env.REDIS_PORT || 6379);

console.log("🔍 Resolving host:", host);
dns.lookup(host, (err, address, family) => {
  if (err) {
    console.error("❌ DNS lookup failed:", err);
  } else {
    console.log("✅ DNS resolved:", address, "family:", family);
    // Try a simple TCP connection
    const socket = net.createConnection({ host, port }, () => {
      console.log("✅ TCP connection succeeded to", host, port);
      socket.destroy();
    });
    socket.on("error", (err) => {
      console.error("❌ TCP connection failed:", err.message);
    });
  }
});
// Build connection options
let redisOptions = {
  db: process.env.REDIS_DB || 0,
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error("Redis connection failed after 10 retries.");
      return null;
    }
    return Math.min(times * 100, 3000);
  },
};

// If REDIS_URL is set, use it (supports rediss://)
if (process.env.REDIS_URL) {
  redisOptions.url = process.env.REDIS_URL;
  // ioredis automatically enables TLS when using rediss://
} else {
  // Fallback to individual env vars
  redisOptions.host = process.env.REDIS_HOST || "localhost";
  redisOptions.port = process.env.REDIS_PORT || 6379;
  redisOptions.password = process.env.REDIS_PASSWORD || undefined;

  // Enable TLS if connecting to Upstash (or any non-localhost host)
  if (redisOptions.host && !redisOptions.host.includes("localhost")) {
    redisOptions.tls = {};
  }
}
console.log(
  "🔍 REDIS_URL from env:",
  process.env.REDIS_URL ? "SET ✅" : "MISSING ❌",
);
const redis = new Redis(redisOptions);

redis.on("connect", () => logger.info("✅ Redis connected"));
redis.on("error", (err) => logger.error("Redis error:", err));

module.exports = redis;
