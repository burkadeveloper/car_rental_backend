const cloudinary = require("../config/cloudinary");
const logger = require("../utils/logger");

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Optional upload options
 * @returns {Promise<Object>} Cloudinary result
 */
exports.uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "car_rental",
        ...options,
      },
      (error, result) => {
        if (error) {
          logger.error("Cloudinary upload error:", error);
          reject(error);
        } else {
          resolve(result);
        }
      },
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete an image from Cloudinary by URL
 * @param {string} imageUrl - The secure_url
 * @returns {Promise<Object>} Deletion result
 */
exports.deleteFromCloudinary = (imageUrl) => {
  if (!imageUrl) return Promise.resolve({ result: "ok" });
  const parts = imageUrl.split("/");
  const uploadIndex = parts.indexOf("upload");
  if (uploadIndex === -1) throw new Error("Invalid Cloudinary URL");
  const publicIdWithExt = parts.slice(uploadIndex + 2).join("/");
  const publicId = publicIdWithExt.split(".")[0];
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        logger.error("Cloudinary delete error:", error);
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
};
