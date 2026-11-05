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
    moderateProductApproval
} from '../controllers/productController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/', getProducts);
router.get('/owner/my', protect, authorize('owner', 'admin'), getMyProducts);
router.get('/owner/listings', protect, authorize('owner', 'admin'), getMyProducts);
router.get('/:id', getProductById);

// Owner / Admin product operations
router.post('/', protect, authorize('owner', 'admin'), createProduct);
router.put('/:id', protect, authorize('owner', 'admin'), updateProduct);
router.patch('/:id/availability', protect, authorize('owner', 'admin'), toggleAvailability);
router.delete('/:id', protect, authorize('owner', 'admin'), deleteProduct);

// Admin-only product approval
router.patch('/:id/approval', protect, authorize('admin'), moderateProductApproval);

export default router;
