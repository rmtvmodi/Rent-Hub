// server/controllers/notifController.js
// In-App Notification Controller: Retrieval, Read status toggles, and deletion

import mongoose from 'mongoose';
import Notification from '../models/Notification.js';

/**
 * @desc    Get all notifications for logged-in user + unread counter
 * @route   GET /api/notifications
 * @access  Private (Authenticated)
 */
export const getMyNotifications = async (req, res, next) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const unreadCount = await Notification.countDocuments({
            user: req.user._id,
            read: false
        });

        res.status(200).json({
            success: true,
            unreadCount,
            count: notifications.length,
            notifications
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mark a specific notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private (Authenticated - must own notification)
 */
export const markAsRead = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
        }

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }

        // Ownership verification
        if (notification.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this notification.'
            });
        }

        notification.read = true;
        await notification.save();

        res.status(200).json({
            success: true,
            message: 'Notification marked as read.',
            notification
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Mark all user notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private (Authenticated)
 */
export const markAllAsRead = async (req, res, next) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, read: false },
            { $set: { read: true } }
        );

        res.status(200).json({
            success: true,
            message: 'All notifications marked as read.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete a notification
 * @route   DELETE /api/notifications/:id
 * @access  Private (Authenticated - must own notification)
 */
export const deleteNotification = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
        }

        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found.' });
        }

        if (notification.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized.' });
        }

        await Notification.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Notification deleted.'
        });
    } catch (error) {
        next(error);
    }
};
