// server/models/Payment.js
// Payment Schema: simulated escrow checkout records, transaction audit log

import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    booking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        required: [true, 'Payment must be associated with a valid booking']
    },
    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Customer reference is required']
    },
    amount: {
        type: Number,
        required: [true, 'Payment amount in ₹ is required'],
        min: [0, 'Payment amount cannot be negative']
    },
    method: {
        type: String,
        required: [true, 'Payment method is required'],
        enum: {
            values: ['Card', 'UPI', 'Net Banking'],
            message: '{VALUE} is not a supported simulated payment method'
        }
    },
    reference_id: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['Success', 'Failed', 'Pending'],
        default: 'Success'
    },
    is_simulated: {
        type: Boolean,
        default: true // Explicitly flags this as an educational simulated payment
    },
    simulated_gateway_notes: {
        type: String,
        default: 'RentHub Simulated Payment Gateway (Academic Demonstration Only - No Real Funds Transferred)'
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.payment_id = ret._id.toString();
            ret.booking_id = ret.booking ? (ret.booking._id ? ret.booking._id.toString() : ret.booking.toString()) : undefined;
            ret.customer_id = ret.customer ? (ret.customer._id ? ret.customer._id.toString() : ret.customer.toString()) : undefined;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual payment_id for compatibility with frontend code
paymentSchema.virtual('payment_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

paymentSchema.index({ booking: 1 });
paymentSchema.index({ customer: 1, createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
