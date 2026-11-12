// server/middleware/authMiddleware.js
// Authentication verification & Role-Based Access Control (RBAC) middleware

import { verifyToken } from '../utils/jwt.js';
import User from '../models/User.js';

/**
 * Route protection middleware.
 * Verifies the incoming Bearer JWT, fetches the user from the database (excluding password),
 * and attaches the authenticated user document to req.user.
 */
export const protect = async (req, res, next) => {
    let token;

    // 1. Extract Bearer token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1]?.trim();
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No authentication token provided.'
        });
    }

    try {
        // 2. Cryptographically verify token signature and expiry
        const decoded = verifyToken(token);

        // 3. Fetch authenticated user from database (excluding password hash)
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'The user belonging to this token no longer exists.'
            });
        }

        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Access denied.'
            });
        }

        // 4. Attach verified user to request object
        req.user = user;
        return next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Your session has expired. Please log in again.'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid authentication token.'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Authentication failed. Please log in.'
        });
    }
};

/**
 * Role-Based Access Control (RBAC) middleware generator.
 * Restricts access to specific user roles (e.g., 'owner', 'admin').
 * @param  {...string} roles - Permitted roles (e.g. 'owner', 'admin')
 */
export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required prior to authorization.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Role '${req.user.role}' is not authorized to access this resource.`
            });
        }

        return next();
    };
};

export default {
    protect,
    authorize
};
