// server/controllers/authController.js
// Authentication controllers: Registration, Login, and Current Session Profile

import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';
import sendEmail from '../utils/sendEmail.js';

/**
 * @desc    Register a new user (Customer or Owner)
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = async (req, res, next) => {
    try {
        const { name, email, password, role, phone } = req.body;

        // 1. Mandatory fields validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide full name, email address, and password.'
            });
        }

        // 2. Email format validation
        const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address.'
            });
        }

        // 3. Password strength requirement
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long.'
            });
        }

        // 4. SECURITY RULE: Strictly reject public registration with 'admin' role
        if (role && role.toLowerCase() === 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Administrator accounts cannot be created via public registration.'
            });
        }

        // 5. Sanitize role assignment (Permit only 'customer' and 'owner', default to 'customer')
        let assignedRole = 'customer';
        if (role) {
            const normalizedRole = role.toLowerCase().trim();
            if (['customer', 'owner'].includes(normalizedRole)) {
                assignedRole = normalizedRole;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Invalid account role. Must be either 'customer' or 'owner'."
                });
            }
        }

        // 6. Duplicate email verification
        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await User.findOne({ email: normalizedEmail });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with that email address already exists.'
            });
        }

        // 7. Create user record (Password is hashed by Mongoose pre-save hook)
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password,
            role: assignedRole,
            phone: phone ? phone.trim() : ''
        });

        // 8. Generate JWT token
        const token = generateToken(user);

        // 9. Return safe response without password hash
        return res.status(201).json({
            success: true,
            message: 'User registered successfully.',
            token,
            user: {
                user_id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Authenticate user & retrieve JWT token
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // 1. Validate incoming credentials presence
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both email and password.'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // 2. Explicitly query user with password field (normally hidden by select: false)
        const user = await User.findOne({ email: normalizedEmail }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        // 3. Cryptographically verify password against bcrypt hash
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        // 4. Reject deactivated user accounts
        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact an administrator.'
            });
        }

        // 5. Generate JWT token
        const token = generateToken(user);

        // 5. Return sanitized profile and token
        return res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: {
                user_id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                phone: user.phone
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Retrieve profile of the currently authenticated user
 * @route   GET /api/auth/me
 * @access  Private (Requires valid JWT)
 */
export const getMe = async (req, res) => {
    return res.status(200).json({
        success: true,
        user: {
            user_id: req.user._id.toString(),
            name: req.user.name,
            email: req.user.email,
            role: req.user.role,
            phone: req.user.phone
        }
    });
};

/**
 * @desc    Log out current session
 * @route   POST /api/auth/logout
 * @access  Public / Private
 */
export const logout = async (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Logged out successfully.'
    });
};

/**
 * @desc    Initiate password reset (generic response prevents email enumeration)
 * @route   POST /api/auth/forgotpassword
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an email address.'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail, isActive: true });

        // Generic response string used in all paths to prevent email enumeration
        const genericMessage = 'If an account with that email exists, password reset instructions have been sent.';

        if (!user) {
            return res.status(200).json({
                success: true,
                message: genericMessage
            });
        }

        // Generate unhashed reset token and save hashed version to DB
        const resetToken = user.getResetPasswordToken();
        await user.save({ validateBeforeSave: false });

        // Construct reset link based on request origin or environment configuration (supports both FRONTEND_URL and CLIENT_URL)
        const configuredOrigin = process.env.FRONTEND_URL || process.env.CLIENT_URL;
        const clientOrigin = req.headers.origin || (configuredOrigin ? configuredOrigin.split(',')[0].trim() : '') || 'http://localhost:5000';
        const resetUrl = `${clientOrigin.replace(/\/$/, '')}/reset-password.html?token=${resetToken}`;

        const subject = 'RentHub - Password Reset Request';
        const message = `Hello ${user.name},\n\nYou requested a password reset for your RentHub account.\n\nPlease click the link below or copy and paste it into your browser within 1 hour:\n\n${resetUrl}\n\nIf you did not request this, please disregard this email and your password will remain unchanged.\n\nBest regards,\nThe RentHub Team`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0A0F1A; color: #F1F5F9; border-radius: 8px;">
                <h2 style="color: #7C6CF2; margin-bottom: 20px;">RentHub – Rent Before You Buy</h2>
                <p>Hello <strong>${user.name}</strong>,</p>
                <p>You requested a password reset for your RentHub account.</p>
                <p style="margin: 25px 0;">
                    <a href="${resetUrl}" style="background-color: #7C6CF2; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
                </p>
                <p style="color: #94A3B8; font-size: 0.9rem;">This link is valid for <strong>1 hour</strong>. If you did not request this, no action is needed.</p>
                <hr style="border: 0; border-top: 1px solid #1E293B; margin: 25px 0;" />
                <p style="color: #64748B; font-size: 0.8rem;">RentHub Platform Security</p>
            </div>
        `;

        try {
            await sendEmail({
                email: user.email,
                subject,
                message,
                html
            });
        } catch (mailError) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });

            return res.status(500).json({
                success: false,
                message: 'Failed to dispatch password reset email. Please try again later.'
            });
        }

        return res.status(200).json({
            success: true,
            message: genericMessage
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Reset password using cryptographically verified token
 * @route   PUT /api/auth/resetpassword/:token
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password, confirmPassword } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Reset token is required.'
            });
        }

        if (!password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both new password and confirmation password.'
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match.'
            });
        }

        // Strict password policy validation:
        // >= 8 chars, uppercase, lowercase, digit, special character
        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters long.'
            });
        }
        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one uppercase letter.'
            });
        }
        if (!/[a-z]/.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one lowercase letter.'
            });
        }
        if (!/[0-9]/.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one number.'
            });
        }
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least one special character.'
            });
        }

        // Hash incoming token to match database SHA-256 hash
        const hashedToken = crypto
            .createHash('sha256')
            .update(token)
            .digest('hex');

        // Locate active user with non-expired token
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpire: { $gt: Date.now() },
            isActive: true
        }).select('+password');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired password reset token. Please request a new link.'
            });
        }

        // Set new password (will be hashed by pre-save hook)
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        // Invalidate prior JWT tokens
        user.passwordChangedAt = new Date();

        await user.save();

        // Require re-authentication for maximum security (no auto-login)
        return res.status(200).json({
            success: true,
            message: 'Password reset successful. Please log in with your new password.'
        });
    } catch (error) {
        next(error);
    }
};

export default {
    register,
    login,
    getMe,
    logout,
    forgotPassword,
    resetPassword
};
