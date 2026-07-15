const redis = require("../config/redis"); // adjust path if needed

/**
 * Get value from cache
 */
exports.cacheGet = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Cache get error:", error);
    return null;
  }
};

/**
 * Set value in cache with TTL (seconds)
 */
exports.cacheSet = async (key, value, ttl = 60) => {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (error) {
    console.error("Cache set error:", error);
  }
};

/**
 * Delete all keys matching a pattern (e.g., 'cars:*')
 */
exports.cacheDel = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (error) {
    console.error("Cache delete error:", error);
  }
};
