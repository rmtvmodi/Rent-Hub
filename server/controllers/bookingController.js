// server/controllers/bookingController.js
// Booking Lifecycle Controller: Overlap verification, atomic reservations, price calculations, and state transitions

import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Product from '../models/Product.js';
import { createNotification } from '../utils/notify.js';

// In-process Mutex queue per product to serialize simultaneous booking overlap checks
const productBookingLocks = new Map();

const acquireProductLock = async (productId) => {
    const key = productId.toString();
    while (productBookingLocks.has(key)) {
        await productBookingLocks.get(key);
    }
    let resolveLock;
    const promise = new Promise((resolve) => {
        resolveLock = resolve;
    });
    productBookingLocks.set(key, promise);
    return () => {
        productBookingLocks.delete(key);
        resolveLock();
    };
};

/**
 * Helper to calculate rental duration in days and total price server-side
 */
const calculateServerPrice = (startDate, endDate, dailyPrice) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set to midnight UTC for clean calendar day calculation
    const startMidnight = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endMidnight = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    
    const diffTime = endMidnight - startMidnight;
    const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1); // inclusive days
    return {
        days: diffDays,
        totalPrice: diffDays * dailyPrice
    };
};

/**
 * @desc    Create a new rental booking request
 * @route   POST /api/bookings
 * @access  Private (Customer only)
 */
export const createBooking = async (req, res, next) => {
    try {
        const { product_id, start_date, end_date } = req.body;

        if (!product_id || !start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Please provide product_id, start_date, and end_date.'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(product_id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const start = new Date(start_date);
        const end = new Date(end_date);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start or end date format.' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (start < today) {
            return res.status(400).json({
                success: false,
                message: 'Rental start date cannot be in the past.'
            });
        }

        if (end < start) {
            return res.status(400).json({
                success: false,
                message: 'Rental end date must be on or after start date.'
            });
        }

        // Fetch product
        const product = await Product.findById(product_id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        if (product.approval_status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'This product is not approved for rental.'
            });
        }

        if (!product.availability) {
            return res.status(400).json({
                success: false,
                message: 'This product is currently marked unavailable by the owner.'
            });
        }

        // Prevent self-rental
        if (product.owner.toString() === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot rent your own product.'
            });
        }

        // Check for date collisions with active bookings
        const conflict = await Booking.checkOverlap(product._id, start, end);
        if (conflict) {
            return res.status(409).json({
                success: false,
                message: `Dates conflict with an existing reservation (${conflict.start_date.toISOString().split('T')[0]} to ${conflict.end_date.toISOString().split('T')[0]}). Please choose different dates.`
            });
        }

        // Compute total price server-side (Never trust client-supplied total_price)
        const { days, totalPrice } = calculateServerPrice(start, end, product.price_per_day);

        // Acquire in-process mutex lock for this specific product to serialize simultaneous requests
        const releaseLock = await acquireProductLock(product._id);
        let booking;
        try {
            // Re-verify overlap inside the critical section
            const conflictCritical = await Booking.checkOverlap(product._id, start, end);
            if (conflictCritical) {
                return res.status(409).json({
                    success: false,
                    message: `Dates conflict with an existing reservation (${conflictCritical.start_date.toISOString().split('T')[0]} to ${conflictCritical.end_date.toISOString().split('T')[0]}). Please choose different dates.`
                });
            }

            // Atomic reservation creation
            booking = await Booking.create({
                customer: req.user._id,
                product: product._id,
                owner: product.owner,
                start_date: start,
                end_date: end,
                total_price: totalPrice,
                status: 'Requested',
                payment_status: 'Unpaid',
                status_history: [
                    {
                        status: 'Requested',
                        changed_at: new Date(),
                        changed_by: req.user._id,
                        note: `Booking request for ${days} day(s) at ₹${product.price_per_day}/day.`
                    }
                ]
            });

            // Deterministic collision resolution: If two concurrent bookings overlap across multi-process,
            // yield to the document with the smaller _id and roll back the later one
            const concurrentCollision = await Booking.findOne({
                _id: { $lt: booking._id },
                product: product._id,
                status: { $nin: ['Cancelled', 'Rejected'] },
                start_date: { $lte: end },
                end_date: { $gte: start }
            });

            if (concurrentCollision) {
                // Collision detected! Rollback created booking immediately
                await Booking.findByIdAndDelete(booking._id);
                return res.status(409).json({
                    success: false,
                    message: 'Dates conflict with another simultaneous reservation request. Please select different dates.'
                });
            }
        } finally {
            releaseLock();
        }

        // Notify product owner
        await createNotification({
            user: product.owner,
            message: `New booking request #${booking._id.toString().slice(-6)} for "${product.title}" from ${req.user.name}.`,
            type: 'booking',
            link: 'owner-dashboard.html'
        });

        res.status(201).json({
            success: true,
            message: 'Booking request submitted successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get bookings for logged-in user (Customer: rentals, Owner: incoming requests)
 * @route   GET /api/bookings/my
 * @access  Private (Authenticated)
 */
export const getMyBookings = async (req, res, next) => {
    try {
        let filter = {};
        const asRole = req.query.role || req.query.as;

        if (asRole === 'customer') {
            filter = { customer: req.user._id };
        } else if (asRole === 'owner') {
            filter = { owner: req.user._id };
        } else if (req.user.role === 'customer') {
            filter = { customer: req.user._id };
        } else if (req.user.role === 'owner') {
            filter = { owner: req.user._id };
        } else if (req.user.role === 'admin') {
            // Admins can view all or filter by query params
            filter = {};
        }

        const bookings = await Booking.find(filter)
            .populate('product', 'title image category price_per_day availability')
            .populate('customer', 'name email phone')
            .populate('owner', 'name email phone')
            .sort({ createdAt: -1 });

        // Auto-sync lifecycle: If status is 'Paid' and start_date has arrived, auto-transition to 'Active Rental'
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const b of bookings) {
            if (b.status === 'Paid' && b.payment_status === 'Paid') {
                const bStart = new Date(b.start_date);
                bStart.setHours(0, 0, 0, 0);
                if (today >= bStart) {
                    b.status = 'Active Rental';
                    b.status_history.push({
                        status: 'Active Rental',
                        changed_at: new Date(),
                        note: 'Automated lifecycle sync: Rental start date reached.'
                    });
                    await b.save();
                }
            }
        }

        res.status(200).json({
            success: true,
            count: bookings.length,
            bookings
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get booking details by ID
 * @route   GET /api/bookings/:id
 * @access  Private (Involved Customer, Owner, or Admin)
 */
export const getBookingById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id)
            .populate('product', 'title image category price_per_day availability')
            .populate('customer', 'name email phone')
            .populate('owner', 'name email phone');

        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Authorization check: User must be customer, owner, or admin
        const isCustomer = booking.customer._id.toString() === req.user._id.toString();
        const isOwner = booking.owner._id.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';

        if (!isCustomer && !isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this booking.'
            });
        }

        res.status(200).json({
            success: true,
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Owner accepts booking request
 * @route   PATCH /api/bookings/:id/accept
 * @access  Private (Owner only)
 */
export const acceptBooking = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product', 'title');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        // Ownership verification
        if (booking.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to manage this booking.' });
        }

        if (booking.status !== 'Requested') {
            return res.status(400).json({
                success: false,
                message: `Cannot accept booking currently in '${booking.status}' status.`
            });
        }

        booking.status = 'Accepted';
        booking.status_history.push({
            status: 'Accepted',
            changed_at: new Date(),
            changed_by: req.user._id,
            note: 'Owner accepted booking request.'
        });
        await booking.save();

        // Notify customer
        await createNotification({
            user: booking.customer,
            message: `Your booking request for "${booking.product.title}" was accepted! You can now proceed to payment.`,
            type: 'booking',
            link: 'customer-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Booking accepted successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Owner rejects booking request
 * @route   PATCH /api/bookings/:id/reject
 * @access  Private (Owner only)
 */
export const rejectBooking = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product', 'title');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to reject this booking.' });
        }

        if (booking.status !== 'Requested') {
            return res.status(400).json({
                success: false,
                message: `Cannot reject booking currently in '${booking.status}' status.`
            });
        }

        booking.status = 'Rejected';
        booking.status_history.push({
            status: 'Rejected',
            changed_at: new Date(),
            changed_by: req.user._id,
            note: reason || 'Owner declined booking request.'
        });
        await booking.save();

        // Notify customer
        await createNotification({
            user: booking.customer,
            message: `Your booking request for "${booking.product.title}" was declined by the owner.`,
            type: 'booking',
            link: 'customer-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Booking rejected.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Customer cancels booking (Permitted only before payment)
 * @route   PATCH /api/bookings/:id/cancel
 * @access  Private (Customer only)
 */
export const cancelBooking = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product', 'title');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.customer.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized to cancel this booking.' });
        }

        // Enforce cancellation rules
        if (!['Requested', 'Accepted'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel booking with '${booking.status}' status. For active rentals, please request a return.`
            });
        }

        booking.status = 'Cancelled';
        booking.status_history.push({
            status: 'Cancelled',
            changed_at: new Date(),
            changed_by: req.user._id,
            note: 'Customer cancelled booking prior to payment.'
        });
        await booking.save();

        // Notify owner
        await createNotification({
            user: booking.owner,
            message: `Booking request for "${booking.product.title}" was cancelled by the customer.`,
            type: 'booking',
            link: 'owner-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Owner marks item as handed over (Paid -> Active Rental)
 * @route   PATCH /api/bookings/:id/handover
 * @access  Private (Owner only)
 */
export const markHandedOver = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product', 'title');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized.' });
        }

        if (booking.status !== 'Paid') {
            return res.status(400).json({
                success: false,
                message: `Cannot mark handover for booking in '${booking.status}' status (must be 'Paid').`
            });
        }

        booking.status = 'Active Rental';
        booking.status_history.push({
            status: 'Active Rental',
            changed_at: new Date(),
            changed_by: req.user._id,
            note: 'Item handed over to customer.'
        });
        await booking.save();

        await createNotification({
            user: booking.customer,
            message: `Owner has confirmed equipment handover for "${booking.product.title}". Your rental is now active!`,
            type: 'booking',
            link: 'customer-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Equipment marked as handed over.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Customer initiates product return request
 * @route   PATCH /api/bookings/:id/request-return
 * @access  Private (Customer only)
 */
export const requestReturn = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product', 'title');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.customer.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized.' });
        }

        if (booking.status !== 'Active Rental') {
            return res.status(400).json({
                success: false,
                message: `Return can only be requested for an 'Active Rental' (Current: '${booking.status}').`
            });
        }

        booking.status = 'Return Requested';
        booking.status_history.push({
            status: 'Return Requested',
            changed_at: new Date(),
            changed_by: req.user._id,
            note: 'Customer requested return of equipment.'
        });
        await booking.save();

        await createNotification({
            user: booking.owner,
            message: `Customer has requested return for "${booking.product.title}". Please inspect and confirm receipt.`,
            type: 'booking',
            link: 'owner-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Return request submitted to the owner.',
            booking
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Owner marks product as returned & assesses late fee
 * @route   PATCH /api/bookings/:id/return
 * @access  Private (Owner only)
 */
export const confirmReturn = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const booking = await Booking.findById(id).populate('product');
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        if (booking.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized.' });
        }

        if (!['Active Rental', 'Return Requested'].includes(booking.status)) {
            return res.status(400).json({
                success: false,
                message: `Cannot confirm return for booking in '${booking.status}' status.`
            });
        }

        // Server-side Late Fee Calculation
        const returnDate = new Date();
        const dueDate = new Date(booking.end_date);
        dueDate.setHours(23, 59, 59, 999);

        let lateFee = 0;
        let overdueDays = 0;

        if (returnDate > dueDate) {
            const diffTime = returnDate.getTime() - dueDate.getTime();
            overdueDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            const dailyRate = booking.product ? booking.product.price_per_day : 500;
            const lateFeePerDay = Math.round(dailyRate * 1.2);
            lateFee = overdueDays * lateFeePerDay;
        }

        booking.status = 'Completed';
        booking.return_date = returnDate;
        booking.late_fee = lateFee;
        booking.status_history.push({
            status: 'Completed',
            changed_at: returnDate,
            changed_by: req.user._id,
            note: overdueDays > 0
                ? `Item returned ${overdueDays} day(s) late. Assessed late fee: ₹${lateFee}.`
                : 'Item returned on time. Zero late fees.'
        });
        await booking.save();

        // Release product availability back to true
        if (booking.product) {
            await Product.findByIdAndUpdate(booking.product._id, { availability: true });
        }

        // Notify customer
        await createNotification({
            user: booking.customer,
            message: `Return confirmed for "${booking.product.title}". Rental completed.${lateFee > 0 ? ' Assessed late fee: ₹' + lateFee : ' Returned on time!'} Thank you!`,
            type: 'booking',
            link: 'customer-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: 'Rental completed successfully.',
            booking,
            lateFeeAssessment: {
                overdueDays,
                lateFee
            }
        });
    } catch (error) {
        next(error);
    }
};
