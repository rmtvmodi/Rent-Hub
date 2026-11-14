// server/routes/wishlistRoutes.js
// Routes for Customer Saved Wishlist Items

import express from 'express';
import {
    getMyWishlist,
    addToWishlist,
    removeFromWishlist
} from '../controllers/wishlistController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);
router.use(authorize('customer', 'owner'));

router.get('/', getMyWishlist);
router.post('/', addToWishlist);
router.delete('/:productId', removeFromWishlist);

export default router;
