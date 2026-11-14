// server/routes/reviewRoutes.js
// Routes for Verified Customer Reviews and Admin Moderation

import express from 'express';
import {
    addReview,
    getProductReviews,
    updateReview,
    deleteReview,
    getAllReviews
} from '../controllers/reviewController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route to view product reviews
router.get('/product/:productId', getProductReviews);

// Authenticated customer & moderation routes
router.use(protect);

router.post('/', authorize('customer', 'owner'), addReview);
router.put('/:id', authorize('customer', 'owner'), updateReview);
router.delete('/:id', deleteReview); // Customer (own) or Admin (moderation)
router.get('/', authorize('admin'), getAllReviews);

export default router;
