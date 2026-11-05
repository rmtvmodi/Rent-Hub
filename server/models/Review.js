// server/models/Review.js
// Review Schema: verified rental customer reviews & rating aggregation

import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Customer reference is required']
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Product reference is required']
    },
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: [true, 'Booking reference is required to verify rental completion'],
        unique: true // Strictly guarantees only one review per rental booking
    },
    rating: {
        type: Number,
        required: [true, 'Please provide a star rating from 1 to 5'],
        min: [1, 'Rating must be at least 1 star'],
        max: [5, 'Rating cannot exceed 5 stars']
    },
    comment: {
        type: String,
        required: [true, 'Please provide review comments'],
        trim: true,
        minlength: [3, 'Review comment must be at least 3 characters long'],
        maxlength: [600, 'Review comment cannot exceed 600 characters']
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.review_id = ret._id.toString();
            ret.customer_id = ret.customer ? (ret.customer._id ? ret.customer._id.toString() : ret.customer.toString()) : undefined;
            ret.product_id = ret.product ? (ret.product._id ? ret.product._id.toString() : ret.product.toString()) : undefined;
            ret.booking_id = ret.booking ? (ret.booking._id ? ret.booking._id.toString() : ret.booking.toString()) : undefined;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual review_id for compatibility with frontend code
reviewSchema.virtual('review_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

reviewSchema.index({ product: 1, createdAt: -1 });

/**
 * Static aggregation helper to compute average star rating and review count
 */
reviewSchema.statics.getAverageRating = async function (productId) {
    if (mongoose.connection.readyState !== 1) {
        // If DB is offline / not connected, return default empty stats safely without buffering timeout
        return { average: 0, avg: 0, count: 0, text: 'No reviews yet' };
    }

    const stats = await this.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(productId) } },
        {
            $group: {
                _id: '$product',
                count: { $sum: 1 },
                avg: { $avg: '$rating' }
            }
        }
    ]);

    if (stats.length > 0) {
        const avg = parseFloat(stats[0].avg.toFixed(1));
        const count = stats[0].count;
        return { average: avg, avg: avg, count: count, text: `${avg} ★ (${count})` };
    }
    // Requirement: Do not use default 5 for products without reviews
    return { average: 0, avg: 0, count: 0, text: 'No reviews yet' };
};

export const Review = mongoose.model('Review', reviewSchema);
export default Review;
