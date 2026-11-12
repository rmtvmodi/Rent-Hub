// server/utils/jwt.js
// Cryptographic JSON Web Token (JWT) generation and verification utilities

import jwt from 'jsonwebtoken';

const DEV_FALLBACK_SECRET = 'renthub_super_secret_jwt_key_development_change_in_production_2026';

const KNOWN_WEAK_SECRET_PATTERNS = [
    DEV_FALLBACK_SECRET,
    'secret',
    'changeme',
    'jwt_secret',
    'your_jwt_secret',
    'test_secret',
    'change_in_production',
    'replace-with',
    'placeholder'
];

/**
 * Check whether a JWT secret is a known placeholder, development default, or too short.
 * @param {string} secret
 * @returns {boolean}
 */
export const isWeakJwtSecret = (secret) => {
    if (!secret || typeof secret !== 'string') return true;
    const trimmed = secret.trim();
    if (trimmed.length < 32) return true;
    const lower = trimmed.toLowerCase();
    return KNOWN_WEAK_SECRET_PATTERNS.some((pattern) => lower.includes(pattern));
};

/**
 * Validate JWT_SECRET configuration.
 * In production, strictly requires a strong, non-default secret (>= 32 characters).
 * @param {string} [secret]
 * @param {boolean} [forceStrict]
 * @returns {string}
 */
export const validateJwtSecret = (secret = process.env.JWT_SECRET, forceStrict = process.env.NODE_ENV === 'production') => {
    if (forceStrict) {
        if (!secret || typeof secret !== 'string' || !secret.trim()) {
            throw new Error('FATAL: JWT_SECRET environment variable is missing in production.');
        }
        if (secret.trim() === DEV_FALLBACK_SECRET || isWeakJwtSecret(secret)) {
            throw new Error('FATAL: JWT_SECRET is too weak or uses a known development/placeholder secret in production. Provide a unique random secret of at least 32 characters.');
        }
        return secret.trim();
    }
    return (secret && typeof secret === 'string' && secret.trim()) ? secret.trim() : DEV_FALLBACK_SECRET;
};

/**
 * Retrieve the JWT Secret from environment variables.
 * In development/test, provides a fallback if not specified; in production, strictly requires a strong JWT_SECRET.
 */
export const getJwtSecret = () => {
    return validateJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV === 'production');
};

/**
 * Generate a signed JWT token (HS256) for an authenticated user.
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
        algorithm: 'HS256',
        expiresIn: expiry
    });
};

/**
 * Verify an HS256-signed JWT token.
 * @param {string} token - The raw JWT token string
 * @returns {Object} Decoded payload ({ id, role, iat, exp })
 * @throws {Error} TokenExpiredError or JsonWebTokenError
 */
export const verifyToken = (token) => {
    if (!token) {
        throw new Error('No token provided.');
    }
    const secret = getJwtSecret();
    return jwt.verify(token, secret, {
        algorithms: ['HS256']
    });
};

export default {
    generateToken,
    verifyToken,
    getJwtSecret,
    validateJwtSecret,
    isWeakJwtSecret
};
