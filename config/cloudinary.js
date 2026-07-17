const cloudinary = require("cloudinary").v2;
const logger = require("../utils/logger");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Optional: verify connection on startup
try {
  // Test by uploading a small dummy string (won't actually store)
  cloudinary.uploader.upload(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    { folder: "test" },
    (error, result) => {
      if (error) logger.error("Cloudinary test failed:", error.message);
      else logger.info("Cloudinary configured successfully");
    },
  );
} catch (err) {
  // ignore
}

module.exports = cloudinary;
