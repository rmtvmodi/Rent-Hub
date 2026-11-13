// server/middleware/uploadMiddleware.js
// Multer memory storage configuration for streaming uploads directly to Cloudinary

import multer from 'multer';

// In-memory storage: files are never written to the server's local disk
const storage = multer.memoryStorage();

// Allowed image MIME types
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
        cb(null, true);
    } else {
        const err = new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
        err.statusCode = 400;
        cb(err, false);
    }
};

export const uploadImages = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB per file
        files: 5 // Maximum 5 files per upload
    },
    fileFilter
});

export default uploadImages;
