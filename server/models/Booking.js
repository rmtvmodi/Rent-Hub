// server/models/Booking.js
// Booking Schema: rental lifecycle, date overlap verification, late fee calculations

import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'A customer reference is required']
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'A product reference is required']
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'An owner reference is required']
    },
    start_date: {
        type: Date,
        required: [true, 'Rental start date is required']
    },
    end_date: {
        type: Date,
        required: [true, 'Rental end date is required'],
        validate: {
            validator: function (value) {
                return !this.start_date || value >= this.start_date;
            },
            message: 'Rental end date must be on or after the start date'
        }
    },
    total_price: {
        type: Number,
        required: [true, 'Total rental price is required'],
        min: [0, 'Total price cannot be negative']
    },
    status: {
        type: String,
        enum: [
            'Requested',
            'Accepted',
            'Paid',
            'Active Rental',
            'Return Requested',
            'Completed',
            'Cancelled',
            'Rejected'
        ],
        default: 'Requested'
    },
    status_history: [
        {
            status: { type: String, required: true },
            changed_at: { type: Date, default: Date.now },
            changed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            note: { type: String, default: '' }
        }
    ],
    payment_status: {
        type: String,
        enum: ['Unpaid', 'Paid'],
        default: 'Unpaid'
    },
    payment_method: {
        type: String,
        default: ''
    },
    late_fee: {
        type: Number,
        default: 0,
        min: [0, 'Late fee cannot be negative']
    },
    return_date: {
        type: Date
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.booking_id = ret._id.toString();
            ret.customer_id = ret.customer ? (ret.customer._id ? ret.customer._id.toString() : ret.customer.toString()) : undefined;
            ret.product_id = ret.product ? (ret.product._id ? ret.product._id.toString() : ret.product.toString()) : undefined;
            ret.owner_id = ret.owner ? (ret.owner._id ? ret.owner._id.toString() : ret.owner.toString()) : undefined;
            // Format dates as YYYY-MM-DD for straightforward frontend display
            if (ret.start_date instanceof Date) ret.start_date = ret.start_date.toISOString().split('T')[0];
            if (ret.end_date instanceof Date) ret.end_date = ret.end_date.toISOString().split('T')[0];
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual booking_id for compatibility with frontend code
bookingSchema.virtual('booking_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

// Critical Indexes for fast conflict detection and dashboard queries
bookingSchema.index({ product: 1, status: 1, start_date: 1, end_date: 1 });
bookingSchema.index({ customer: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });

/**
 * Backend Booking Overlap Verification
 * Returns conflicting active booking if found, or null if dates are clear.
 */
bookingSchema.statics.checkOverlap = async function (productId, startDate, endDate, excludeBookingId = null) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const query = {
        product: productId,
        status: { $nin: ['Cancelled', 'Rejected', 'Completed'] },
        start_date: { $lte: end },
        end_date: { $gte: start }
    };

    if (excludeBookingId) {
        query._id = { $ne: excludeBookingId };
    }

    return await this.findOne(query);
};

/**
 * Allowed status transition validation helper
 */
bookingSchema.methods.canTransitionTo = function (nextStatus) {
    const transitions = {
        'Requested': ['Accepted', 'Rejected', 'Cancelled'],
        'Accepted': ['Paid', 'Cancelled'],
        'Paid': ['Active Rental', 'Return Requested', 'Completed'],
        'Active Rental': ['Return Requested', 'Completed'],
        'Return Requested': ['Completed'],
        'Completed': [],
        'Cancelled': [],
        'Rejected': []
    };
    return (transitions[this.status] || []).includes(nextStatus);
};

export const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
