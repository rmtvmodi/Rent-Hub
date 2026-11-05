// server/models/Wishlist.js
// Wishlist Schema: customer-saved gear and equipment

import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Customer reference is required']
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Product reference is required']
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.wishlist_id = ret._id.toString();
            ret.customer_id = ret.customer ? (ret.customer._id ? ret.customer._id.toString() : ret.customer.toString()) : undefined;
            ret.product_id = ret.product ? (ret.product._id ? ret.product._id.toString() : ret.product.toString()) : undefined;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual wishlist_id for compatibility with frontend code
wishlistSchema.virtual('wishlist_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

// Prevent duplicate wishlist saves for same customer and product
wishlistSchema.index({ customer: 1, product: 1 }, { unique: true });

export const Wishlist = mongoose.model('Wishlist', wishlistSchema);
export default Wishlist;
