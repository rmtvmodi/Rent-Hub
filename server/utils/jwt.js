// server/utils/jwt.js
// Cryptographic JSON Web Token (JWT) generation and verification utilities

import jwt from 'jsonwebtoken';

/**
 * Retrieve the JWT Secret from environment variables.
 * In development, provides a fallback if not specified; in production, strictly requires JWT_SECRET.
 */
export const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET environment variable is missing in production!');
    }
    return secret || 'renthub_super_secret_jwt_key_development_change_in_production_2026';
};

/**
 * Generate a signed JWT token for an authenticated user.
 * @param {Object} user - The user document or object ({ _id or id, role })
 * @param {string} [expiresIn] - Optional custom expiry (defaults to process.env.JWT_EXPIRE or '7d')
 * @returns {string} Signed JWT token
 */
export const generateToken = (user, expiresIn) => {
    if (!user || (!user._id && !user.id)) {
        throw new Error('Cannot generate token: user ID is missing.');
    }

    const payload = {
        id: user._id ? user._id.toString() : user.id.toString(),
        role: user.role || 'customer'
    };

    const secret = getJwtSecret();
    const expiry = expiresIn || process.env.JWT_EXPIRE || '7d';

    return jwt.sign(payload, secret, {
        expiresIn: expiry
    });
};

/**
 * Synchronously or asynchronously verify a JWT token.
 * @param {string} token - The raw JWT token string
 * @returns {Object} Decoded payload ({ id, role, iat, exp })
 * @throws {Error} TokenExpiredError or JsonWebTokenError
 */
export const verifyToken = (token) => {
    if (!token) {
        throw new Error('No token provided.');
    }
    const secret = getJwtSecret();
    return jwt.verify(token, secret);
};

export default {
    generateToken,
    verifyToken,
    getJwtSecret
};
