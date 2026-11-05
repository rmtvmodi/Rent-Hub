// server/controllers/authController.js
// Authentication controllers: Registration, Login, and Current Session Profile

import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

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

        // 4. Generate JWT token
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

export default {
    register,
    login,
    getMe,
    logout
};
