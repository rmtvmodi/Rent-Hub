// server/models/Product.js
// Product Schema: marketplace listings, categories, availability, admin approval moderation

import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'A product must be linked to an Owner']
    },
    title: {
        type: String,
        required: [true, 'Please provide a product title'],
        trim: true,
        maxlength: [120, 'Title cannot exceed 120 characters']
    },
    description: {
        type: String,
        required: [true, 'Please provide a detailed product description'],
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    category: {
        type: String,
        required: [true, 'Please select a category'],
        enum: {
            values: ['Electronics', 'Cameras', 'Laptops', 'Bicycles', 'Projectors', 'Tools', 'Gaming'],
            message: '{VALUE} is not a supported rental category'
        }
    },
    price_per_day: {
        type: Number,
        required: [true, 'Please enter a daily rental rate in ₹'],
        min: [1, 'Daily rental price must be at least ₹1']
    },
    availability: {
        type: Boolean,
        default: true
    },
    approval_status: {
        type: String,
        enum: ['approved', 'pending', 'rejected'],
        default: 'pending' // Rule: New owner-created products must default to 'pending'
    },
    image: {
        type: String,
        required: [true, 'Please provide an image URL'],
        trim: true
    },
    images: [{
        type: String,
        trim: true
    }],
    rating: {
        type: Number,
        default: 0, // Requirement: Do not use default 5 for products without reviews
        min: 0,
        max: 5
    },
    numReviews: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.product_id = ret._id.toString();
            ret.owner_id = ret.owner ? (ret.owner._id ? ret.owner._id.toString() : ret.owner.toString()) : undefined;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual product_id for compatibility with frontend code
productSchema.virtual('product_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

// Indexes for high-performance marketplace filtering and full-text search
productSchema.index({ approval_status: 1, availability: 1 });
productSchema.index({ category: 1, price_per_day: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ title: 'text', description: 'text', category: 'text' });

export const Product = mongoose.model('Product', productSchema);
export default Product;
