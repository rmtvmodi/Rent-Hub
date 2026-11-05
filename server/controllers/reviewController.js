// server/controllers/reviewController.js
// Review & Rating Controller: Verified review submission, aggregation, and moderation

import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Booking from '../models/Booking.js';
import Product from '../models/Product.js';
import { createNotification } from '../utils/notify.js';

/**
 * Helper to sync product average rating and review count in Product collection
 */
const syncProductRating = async (productId) => {
    const stats = await Review.getAverageRating(productId);
    await Product.findByIdAndUpdate(productId, {
        rating: stats.average,
        numReviews: stats.count
    });
    return stats;
};

/**
 * @desc    Submit a verified customer review for a completed rental
 * @route   POST /api/reviews
 * @access  Private (Customer only)
 */
export const addReview = async (req, res, next) => {
    try {
        const { booking_id, rating, comment } = req.body;

        if (!booking_id || rating === undefined || !comment) {
            return res.status(400).json({
                success: false,
                message: 'Please provide booking_id, star rating (1-5), and comment.'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(booking_id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const numRating = Number(rating);
        if (isNaN(numRating) || numRating < 1 || numRating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be an integer between 1 and 5.'
            });
        }

        const booking = await Booking.findById(booking_id).populate('product');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Eligibility Check 1: User must be the customer who rented
        if (booking.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized: You can only review your own rental bookings.'
            });
        }

        // Eligibility Check 2: Rental must be fully 'Completed'
        if (booking.status !== 'Completed') {
            return res.status(400).json({
                success: false,
                message: `Cannot review rental in '${booking.status}' status. Only 'Completed' rentals are eligible for verified reviews.`
            });
        }

        // Eligibility Check 3: Check duplicate review for this booking
        const existingReview = await Review.findOne({ booking: booking._id });
        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already submitted a review for this rental booking.'
            });
        }

        const review = await Review.create({
            customer: req.user._id,
            product: booking.product._id,
            booking: booking._id,
            rating: Math.round(numRating),
            comment: comment.trim()
        });

        // Sync product rating
        const newRatingStats = await syncProductRating(booking.product._id);

        // Notify product owner
        await createNotification({
            user: booking.owner,
            message: `New ${Math.round(numRating)}★ review on "${booking.product.title}" from ${req.user.name}.`,
            type: 'review',
            link: `product-details.html?pid=${booking.product._id}`
        });

        res.status(201).json({
            success: true,
            message: 'Verified review submitted successfully.',
            review,
            newRatingStats
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all reviews for a specific product
 * @route   GET /api/reviews/product/:productId
 * @access  Public
 */
export const getProductReviews = async (req, res, next) => {
    try {
        const { productId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID.' });
        }

        const reviews = await Review.find({ product: productId })
            .populate('customer', 'name')
            .sort({ createdAt: -1 });

        const stats = await Review.getAverageRating(productId);

        res.status(200).json({
            success: true,
            count: reviews.length,
            ratingStats: stats,
            reviews
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update customer's own review
 * @route   PUT /api/reviews/:id
 * @access  Private (Author only)
 */
export const updateReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid review ID.' });
        }

        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        // Ownership check
        if (review.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this review.' });
        }

        if (rating !== undefined) {
            const num = Number(rating);
            if (num < 1 || num > 5) {
                return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
            }
            review.rating = Math.round(num);
        }

        if (comment) review.comment = comment.trim();

        await review.save();

        const newStats = await syncProductRating(review.product);

        res.status(200).json({
            success: true,
            message: 'Review updated successfully.',
            review,
            newStats
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete review (Author or Admin)
 * @route   DELETE /api/reviews/:id
 * @access  Private (Author / Admin)
 */
export const deleteReview = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid review ID.' });
        }

        const review = await Review.findById(id);
        if (!review) {
            return res.status(404).json({ success: false, message: 'Review not found.' });
        }

        const isAuthor = review.customer.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this review.' });
        }

        const productId = review.product;
        await Review.findByIdAndDelete(id);

        // Recalculate product rating
        const newStats = await syncProductRating(productId);

        res.status(200).json({
            success: true,
            message: 'Review deleted successfully.',
            newStats
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all reviews across platform for admin moderation
 * @route   GET /api/reviews
 * @access  Private (Admin only)
 */
export const getAllReviews = async (req, res, next) => {
    try {
        const reviews = await Review.find()
            .populate('customer', 'name email')
            .populate('product', 'title category')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: reviews.length,
            reviews
        });
    } catch (error) {
        next(error);
    }
};
