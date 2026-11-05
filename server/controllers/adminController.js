// server/controllers/adminController.js
// Admin Governance Controller: Platform metrics, user management, account toggles, inventory & order oversight

import mongoose from 'mongoose';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';

/**
 * @desc    Get aggregate platform metrics
 * @route   GET /api/admin/metrics
 * @access  Private (Admin only)
 */
export const getPlatformMetrics = async (req, res, next) => {
    try {
        const totalUsers = await User.countDocuments();
        const customerCount = await User.countDocuments({ role: 'customer' });
        const ownerCount = await User.countDocuments({ role: 'owner' });

        const totalProducts = await Product.countDocuments();
        const approvedProducts = await Product.countDocuments({ approval_status: 'approved' });
        const pendingProducts = await Product.countDocuments({ approval_status: 'pending' });
        const rejectedProducts = await Product.countDocuments({ approval_status: 'rejected' });

        const totalBookings = await Booking.countDocuments();
        const activeRentals = await Booking.countDocuments({ status: { $in: ['Active Rental', 'Return Requested'] } });
        const completedBookings = await Booking.countDocuments({ status: 'Completed' });

        const totalReviews = await Review.countDocuments();

        // Calculate platform simulated volume in ₹
        const volumeStats = await Payment.aggregate([
            { $match: { status: 'Success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const platformVolume = volumeStats.length > 0 ? volumeStats[0].total : 0;

        res.status(200).json({
            success: true,
            metrics: {
                users: {
                    total: totalUsers,
                    customers: customerCount,
                    owners: ownerCount
                },
                products: {
                    total: totalProducts,
                    approved: approvedProducts,
                    pending: pendingProducts,
                    rejected: rejectedProducts
                },
                bookings: {
                    total: totalBookings,
                    activeRentals,
                    completed: completedBookings
                },
                reviews: {
                    total: totalReviews
                },
                platformVolume
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    List all registered users with search, role filter, and pagination
 * @route   GET /api/admin/users
 * @access  Private (Admin only)
 */
export const getUsers = async (req, res, next) => {
    try {
        const { search, role, page = 1, limit = 50 } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { email: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        if (role && ['customer', 'owner', 'admin'].includes(role)) {
            query.role = role;
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, parseInt(limit, 10) || 50);
        const skip = (pageNum - 1) * limitNum;

        const total = await User.countDocuments(query);
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: users.length,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
            currentPage: pageNum,
            users
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get user profile by ID
 * @route   GET /api/admin/users/:id
 * @access  Private (Admin only)
 */
export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
        }

        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.status(200).json({
            success: true,
            user
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update permitted user fields (e.g. role, phone)
 * @route   PATCH /api/admin/users/:id
 * @access  Private (Admin only)
 */
export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, phone, role } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID.' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Prevent self-demotion
        if (user._id.toString() === req.user._id.toString() && role && role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'You cannot demote your own active administrator account.'
            });
        }

        if (name) user.name = name.trim();
        if (phone !== undefined) user.phone = phone.trim();
        if (role && ['customer', 'owner', 'admin'].includes(role)) {
            user.role = role;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'User details updated.',
            user: {
                user_id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Disable or reactivate a user account
 * @route   PATCH /api/admin/users/:id/status
 * @access  Private (Admin only)
 */
export const toggleUserStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body || {};

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID.' });
        }

        // Prevent self-deactivation
        if (id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot deactivate your own administrator account.'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        user.isActive = isActive !== undefined ? Boolean(isActive) : !user.isActive;
        await user.save();

        res.status(200).json({
            success: true,
            message: `User account has been ${user.isActive ? 'activated' : 'deactivated'}.`,
            isActive: user.isActive,
            user: {
                user_id: user._id.toString(),
                email: user.email,
                isActive: user.isActive
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Permanently delete a user account
 * @route   DELETE /api/admin/users/:id
 * @access  Private (Admin only)
 */
export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID.' });
        }

        // Prevent self-deletion
        if (id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot delete your own administrator account.'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        await User.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: `User '${user.email}' deleted successfully.`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all marketplace products for admin inspection (any approval status)
 * @route   GET /api/admin/products
 * @access  Private (Admin only)
 */
export const getAllProductsAdmin = async (req, res, next) => {
    try {
        const { status, category, search } = req.query;
        const query = {};

        if (status && ['approved', 'pending', 'rejected'].includes(status)) {
            query.approval_status = status;
        }

        if (category) {
            query.category = category;
        }

        if (search) {
            query.title = { $regex: search.trim(), $options: 'i' };
        }

        const products = await Product.find(query)
            .populate('owner', 'name email phone')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all platform bookings for admin inspection
 * @route   GET /api/admin/bookings
 * @access  Private (Admin only)
 */
export const getAllBookingsAdmin = async (req, res, next) => {
    try {
        const { status } = req.query;
        const query = status ? { status } : {};

        const bookings = await Booking.find(query)
            .populate('product', 'title category price_per_day image')
            .populate('customer', 'name email phone')
            .populate('owner', 'name email phone')
            .sort({ createdAt: -1 });

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
 * @desc    Admin override of booking status
 * @route   PATCH /api/admin/bookings/:id/status
 * @access  Private (Admin only)
 */
export const overrideBookingStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, note } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID.' });
        }

        const validStatuses = [
            'Requested', 'Accepted', 'Paid', 'Active Rental',
            'Return Requested', 'Completed', 'Cancelled', 'Rejected'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}.`
            });
        }

        const booking = await Booking.findById(id);
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found.' });
        }

        booking.status = status;
        booking.status_history.push({
            status,
            changed_at: new Date(),
            changed_by: req.user._id,
            note: note || `Administrative override to '${status}'.`
        });
        await booking.save();

        res.status(200).json({
            success: true,
            message: `Booking status overridden to '${status}'.`,
            booking
        });
    } catch (error) {
        next(error);
    }
};
