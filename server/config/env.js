// server/config/env.js
// Startup environment validation and CORS origin parsing for production and development

import { validateJwtSecret } from '../utils/jwt.js';

const DEV_DEFAULT_ORIGINS = [
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5000'
];

/**
 * Normalize an origin URL by trimming whitespace and removing trailing slashes.
 * @param {string} url
 * @returns {string}
 */
export const normalizeOrigin = (url) => {
    if (!url || typeof url !== 'string') return '';
    return url.trim().replace(/\/+$/, '');
};

/**
 * Parse allowed CORS origins from CLIENT_URL environment variable.
 * In development/test, falls back to local dev origins when CLIENT_URL is unset.
 * In production, never falls back to localhost origins.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export const parseAllowedOrigins = (env = process.env) => {
    const isProduction = env.NODE_ENV === 'production';
    const rawClientUrl = env.CLIENT_URL;

    if (rawClientUrl && typeof rawClientUrl === 'string' && rawClientUrl.trim()) {
        return rawClientUrl
            .split(',')
            .map(normalizeOrigin)
            .filter(Boolean);
    }

    return isProduction ? [] : [...DEV_DEFAULT_ORIGINS];
};

/**
 * Validate critical environment variables required in production.
 * Throws descriptive errors without printing secret values.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const validateProductionEnv = (env = process.env) => {
    const isProduction = env.NODE_ENV === 'production';
    if (!isProduction) {
        return { valid: true, warnings: [] };
    }

    const errors = [];
    const warnings = [];

    // 1. Validate MONGO_URI
    const mongoUri = env.MONGO_URI ? env.MONGO_URI.trim() : '';
    if (!mongoUri) {
        errors.push('MONGO_URI is required in production.');
    } else if (!/^mongodb(\+srv)?:\/\//i.test(mongoUri)) {
        errors.push('MONGO_URI must be a valid mongodb:// or mongodb+srv:// connection string.');
    } else if (/(?:localhost|127\.0\.0\.1)/i.test(mongoUri)) {
        errors.push('MONGO_URI must not point to localhost or 127.0.0.1 in production.');
    }

    // 2. Validate JWT_SECRET strength and non-default requirement
    try {
        validateJwtSecret(env.JWT_SECRET, true);
    } catch (jwtErr) {
        errors.push(jwtErr.message);
    }

    // 3. Validate PORT if explicitly provided
    if (env.PORT !== undefined && env.PORT !== '') {
        const parsedPort = Number(env.PORT);
        if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
            errors.push('PORT must be a valid TCP port number between 1 and 65535.');
        }
    }

    // 4. Validate CLIENT_URL for CORS
    const origins = parseAllowedOrigins(env);
    if (origins.length === 0) {
        warnings.push('CLIENT_URL is not configured in production. Cross-origin browser requests will be blocked (same-origin requests remain allowed).');
    } else {
        for (const origin of origins) {
            if (origin === '*') {
                errors.push('CLIENT_URL must not contain wildcard "*" when credentials are enabled.');
                continue;
            }
            try {
                const parsed = new URL(origin);
                if (!['http:', 'https:'].includes(parsed.protocol)) {
                    errors.push(`CLIENT_URL entry "${origin}" must use http:// or https://.`);
                }
                if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
                    errors.push(`CLIENT_URL entry "${origin}" must not use localhost or 127.0.0.1 in production.`);
                }
            } catch (e) {
                errors.push(`CLIENT_URL entry "${origin}" is not a valid URL.`);
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Production environment validation failed:\n - ${errors.join('\n - ')}`);
    }

    return { valid: true, warnings };
};

export default {
    normalizeOrigin,
    parseAllowedOrigins,
    validateProductionEnv
};
