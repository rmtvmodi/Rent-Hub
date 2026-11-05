// server/utils/notify.js
// Utility helper to dispatch in-app notifications cleanly

import Notification from '../models/Notification.js';

/**
 * Creates an in-app notification for a user.
 * Avoids duplicate notifications for the exact same event within a 1-minute window.
 * 
 * @param {Object} options
 * @param {string|ObjectId} options.user - Target User ID
 * @param {string} options.message - Notification message text
 * @param {string} [options.type='info'] - 'booking' | 'approval' | 'review' | 'info'
 * @param {string} [options.link=''] - Associated URL or action route
 * @returns {Promise<Document|null>}
 */
export const createNotification = async ({ user, message, type = 'info', link = '' }) => {
    if (!user || !message) return null;

    try {
        // Prevent duplicate spam within 60 seconds
        const oneMinuteAgo = new Date(Date.now() - 60000);
        const existing = await Notification.findOne({
            user,
            message,
            createdAt: { $gte: oneMinuteAgo }
        });

        if (existing) {
            return existing;
        }

        return await Notification.create({
            user,
            message,
            type,
            link
        });
    } catch (error) {
        console.error('[Notification Helper Error]', error.message);
        return null;
    }
};

export default createNotification;
