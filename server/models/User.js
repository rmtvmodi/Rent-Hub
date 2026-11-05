// server/models/User.js
// User Schema: authentication, role-based access control, password hashing, account status

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide your full name'],
        trim: true,
        maxlength: [60, 'Name cannot exceed 60 characters']
    },
    email: {
        type: String,
        required: [true, 'Please provide an email address'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
            'Please provide a valid email address'
        ]
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password must be at least 6 characters long'],
        select: false // Excluded from query results by default
    },
    role: {
        type: String,
        enum: {
            values: ['customer', 'owner', 'admin'],
            message: 'Role must be either customer, owner, or admin'
        },
        default: 'customer'
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true // Allows administrators to deactivate/reactivate accounts
    }
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.user_id = ret._id.toString();
            delete ret.password;
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});

// Virtual user_id for seamless compatibility with frontend code
userSchema.virtual('user_id').get(function () {
    return this._id ? this._id.toString() : undefined;
});

// Pre-save middleware to hash password with bcrypt if modified
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Instance method to compare plain password against hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
    if (!this.password) return false;
    return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
export default User;
