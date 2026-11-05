// server/controllers/paymentController.js
// Simulated Payment Controller: Payment verification, transaction recording, and booking status sync

import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Booking from '../models/Booking.js';
import { createNotification } from '../utils/notify.js';

/**
 * @desc    Process simulated checkout payment for an accepted booking
 * @route   POST /api/payments
 * @access  Private (Customer only)
 */
export const processPayment = async (req, res, next) => {
    try {
        const booking_id = req.body.booking_id || req.body.booking;
        let method = req.body.method || req.body.payment_method;
        const amount = req.body.amount;

        if (method === 'Credit Card' || method === 'Debit Card') method = 'Card';
        if (method === 'Wallet' || method === 'Cash') method = 'UPI';
        if (method === 'NetBanking') method = 'Net Banking';

        if (!booking_id || !method) {
            return res.status(400).json({
                success: false,
                message: 'Please provide booking_id and payment method (Card, UPI, or Net Banking).'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(booking_id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
        }

        if (!['Card', 'UPI', 'Net Banking'].includes(method)) {
            return res.status(400).json({
                success: false,
                message: "Method must be 'Card', 'UPI', or 'Net Banking'."
            });
        }

        const booking = await Booking.findById(booking_id).populate('product');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Ownership verification: Only the customer who made the booking can pay
        if (booking.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized: You can only pay for your own bookings.'
            });
        }

        // Status check: Booking must be in 'Accepted' status to accept payment
        if (booking.status !== 'Accepted') {
            return res.status(400).json({
                success: false,
                message: `Cannot pay for booking in '${booking.status}' status (Must be 'Accepted' by owner).`
            });
        }

        if (booking.payment_status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'This booking has already been paid.'
            });
        }

        // Check for duplicate payment record
        const existingPayment = await Payment.findOne({ booking: booking._id, status: 'Success' });
        if (existingPayment) {
            return res.status(400).json({
                success: false,
                message: 'A successful payment record already exists for this booking.'
            });
        }

        // Validate payment amount against server-side booking total price
        // (Never trust a client-supplied amount or success flag)
        const expectedAmount = booking.total_price;
        if (amount !== undefined && Number(amount) !== expectedAmount) {
            return res.status(400).json({
                success: false,
                message: `Payment amount mismatch: Expected ₹${expectedAmount}, received ₹${amount}.`
            });
        }

        // Generate unique simulated transaction reference
        const refId = `SIM-${method.toUpperCase()}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Create Payment record
        const payment = await Payment.create({
            booking: booking._id,
            customer: req.user._id,
            amount: expectedAmount,
            method,
            reference_id: refId,
            status: 'Success',
            is_simulated: true,
            simulated_gateway_notes: 'Academic simulated checkout transaction. Verified on server.'
        });

        // Determine if rental start date is today or in the future
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(booking.start_date);
        startDate.setHours(0, 0, 0, 0);

        const nextStatus = today >= startDate ? 'Active Rental' : 'Paid';

        // Update booking state
        booking.payment_status = 'Paid';
        booking.payment_method = method;
        booking.status = nextStatus;
        booking.status_history.push({
            status: nextStatus,
            changed_at: new Date(),
            changed_by: req.user._id,
            note: `Simulated ${method} payment of ₹${expectedAmount} verified (Ref: ${refId}).`
        });
        await booking.save();

        // Notify both Customer and Owner
        await createNotification({
            user: booking.customer,
            message: `Payment of ₹${expectedAmount} confirmed for "${booking.product.title}". Status is now ${nextStatus}.`,
            type: 'booking',
            link: 'customer-dashboard.html'
        });

        await createNotification({
            user: booking.owner,
            message: `Payment received for booking "${booking.product.title}" (₹${expectedAmount} via ${method}).`,
            type: 'booking',
            link: 'owner-dashboard.html'
        });

        res.status(201).json({
            success: true,
            message: 'Simulated payment completed and recorded successfully.',
            payment,
            booking: {
                booking_id: booking._id.toString(),
                status: booking.status,
                payment_status: booking.payment_status,
                payment_method: booking.payment_method
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get customer's simulated payment history
 * @route   GET /api/payments/my
 * @access  Private (Customer only)
 */
export const getMyPayments = async (req, res, next) => {
    try {
        const payments = await Payment.find({ customer: req.user._id })
            .populate({
                path: 'booking',
                select: 'start_date end_date status total_price product',
                populate: { path: 'product', select: 'title image category' }
            })
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: payments.length,
            payments
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all platform payments (Admin only)
 * @route   GET /api/payments
 * @access  Private (Admin only)
 */
export const getAllPayments = async (req, res, next) => {
    try {
        const payments = await Payment.find()
            .populate('customer', 'name email phone')
            .populate({
                path: 'booking',
                select: 'start_date end_date status total_price product owner',
                populate: [
                    { path: 'product', select: 'title category' },
                    { path: 'owner', select: 'name email' }
                ]
            })
            .sort({ createdAt: -1 });

        const totalVolume = payments.reduce((sum, p) => sum + (p.status === 'Success' ? p.amount : 0), 0);

        res.status(200).json({
            success: true,
            count: payments.length,
            totalVolume,
            payments
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single payment receipt
 * @route   GET /api/payments/:id
 * @access  Private (Customer who paid / Admin)
 */
export const getPaymentById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid payment ID.' });
        }

        const payment = await Payment.findById(id)
            .populate('customer', 'name email phone')
            .populate('booking');

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment record not found.' });
        }

        if (payment.customer._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to view this receipt.' });
        }

        res.status(200).json({
            success: true,
            payment
        });
    } catch (error) {
        next(error);
    }
};
