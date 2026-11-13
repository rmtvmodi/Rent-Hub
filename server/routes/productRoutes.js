// server/routes/productRoutes.js
// Routes for Product marketplace, owner inventory management, and moderation

import express from 'express';
import {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    toggleAvailability,
    deleteProduct,
    getMyProducts,
    moderateProductApproval,
    uploadProductImages
} from '../controllers/productController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import uploadImages from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getProducts);
router.get('/owner/my', protect, authorize('owner', 'customer', 'admin'), getMyProducts);
router.get('/owner/listings', protect, authorize('owner', 'customer', 'admin'), getMyProducts);
router.get('/:id', getProductById);

// Owner / Customer / Admin product operations
router.post('/upload', protect, authorize('owner', 'customer', 'admin'), uploadImages.array('images', 5), uploadProductImages);
router.post('/', protect, authorize('owner', 'customer', 'admin'), createProduct);
router.put('/:id', protect, authorize('owner', 'customer', 'admin'), updateProduct);
router.patch('/:id/availability', protect, authorize('owner', 'customer', 'admin'), toggleAvailability);
router.delete('/:id', protect, authorize('owner', 'customer', 'admin'), deleteProduct);

// Admin-only product approval
router.patch('/:id/approval', protect, authorize('admin'), moderateProductApproval);

export default router;
