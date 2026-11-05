// server/models/Notification.js
// Notification Schema: persistent in-app notifications for rental events

import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Notification must target a specific user'],
        index: true
    },
    message: {
        type: String,
        required: [true, 'Notification message is required'],
        trim: true
    },
    type: {
        type: String,
        enum: ['booking', 'approval', 'review', 'info'],
        default: 'info'
    },
    read: {
        type: Boolean,
        default: false
    },
    link: {
        type: String,
        default: ''
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.notification_id = ret._id.toString();
            ret.user_id = ret.user ? (ret.user._id ? ret.user._id.toString() : ret.user.toString()) : undefined;
            ret.date = ret.createdAt;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual notification_id for compatibility with frontend code
notificationSchema.virtual('notification_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
