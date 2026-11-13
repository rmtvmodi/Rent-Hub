// server/utils/cloudinary.js
// Cloudinary configuration and memory buffer streaming helper

import { v2 as cloudinary } from 'cloudinary';

// Check if Cloudinary credentials are set in environment
export const isCloudinaryConfigured = () => {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
};

// Initialize Cloudinary SDK if credentials exist
if (isCloudinaryConfigured()) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
}

/**
 * Upload an image buffer directly to Cloudinary using streaming (no disk write).
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {Object} [options] - Additional Cloudinary upload parameters
 * @returns {Promise<Object>} - Cloudinary upload result
 */
export const uploadImageStream = (buffer, options = {}) => {
    if (!isCloudinaryConfigured()) {
        const error = new Error('Cloudinary credentials are not configured.');
        error.code = 'CLOUDINARY_NOT_CONFIGURED';
        return Promise.reject(error);
    }

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: 'renthub_products',
                resource_type: 'image',
                allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
                transformation: [
                    { width: 1200, height: 800, crop: 'limit' },
                    { quality: 'auto' }
                ],
                ...options
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }
                resolve(result);
            }
        );

        uploadStream.end(buffer);
    });
};

export default {
    isCloudinaryConfigured,
    uploadImageStream
};
