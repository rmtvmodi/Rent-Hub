// server/controllers/wishlistController.js
// Wishlist Controller: User saved gear, duplicate prevention, and removal

import mongoose from 'mongoose';
import Wishlist from '../models/Wishlist.js';
import Product from '../models/Product.js';

/**
 * @desc    Get current authenticated user's wishlist
 * @route   GET /api/wishlists
 * @access  Private (Customer only)
 */
export const getMyWishlist = async (req, res, next) => {
    try {
        const wishlistItems = await Wishlist.find({ customer: req.user._id })
            .populate({
                path: 'product',
                select: 'title category price_per_day image availability rating numReviews owner',
                populate: { path: 'owner', select: 'name' }
            })
            .sort({ createdAt: -1 });

        // Filter out any entries where product was deleted
        const activeItems = wishlistItems.filter(item => item.product !== null);

        res.status(200).json({
            success: true,
            count: activeItems.length,
            wishlist: activeItems
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Add product to current user's wishlist
 * @route   POST /api/wishlists
 * @access  Private (Customer only)
 */
export const addToWishlist = async (req, res, next) => {
    try {
        const { product_id } = req.body;

        if (!product_id) {
            return res.status(400).json({ success: false, message: 'Please provide product_id.' });
        }

        if (!mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const product = await Product.findById(product_id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        // Prevent duplicate wishlist save
        const existing = await Wishlist.findOne({
            customer: req.user._id,
            product: product._id
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'Product is already in your wishlist.'
            });
        }

        const wishlistItem = await Wishlist.create({
            customer: req.user._id,
            product: product._id
        });

        res.status(201).json({
            success: true,
            message: 'Product added to wishlist.',
            item: wishlistItem
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Remove product from current user's wishlist
 * @route   DELETE /api/wishlists/:productId
 * @access  Private (Customer only)
 */
export const removeFromWishlist = async (req, res, next) => {
    try {
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const deleted = await Wishlist.findOneAndDelete({
            customer: req.user._id,
            product: productId
        });

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Product was not in your wishlist.'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product removed from wishlist.'
        });
    } catch (error) {
        next(error);
    }
};
