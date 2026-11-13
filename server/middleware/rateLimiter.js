// server/middleware/rateLimiter.js
// In-memory sliding window rate limiter for security-sensitive endpoints

/**
 * Creates an in-memory rate limiting middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time frame for which requests are checked (in ms)
 * @param {number} options.max - Maximum number of connections during windowMs
 * @param {string} options.message - Error message when rate limit is exceeded
 */
export const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 10,
    message = 'Too many requests. Please try again later.'
} = {}) => {
    const hits = new Map();

    // Periodic sweep every 5 minutes to prevent memory leak
    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [key, record] of hits.entries()) {
            if (now > record.resetTime) {
                hits.delete(key);
            }
        }
    }, 5 * 60 * 1000);

    // Unref so cleanup interval does not block process shutdown/tests
    if (cleanupInterval.unref) {
        cleanupInterval.unref();
    }

    return (req, res, next) => {
        // Derive client key from IP / X-Forwarded-For
        const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown')
            .toString()
            .split(',')[0]
            .trim();
        const key = `${req.baseUrl}${req.path}_${ip}`;
        const now = Date.now();

        let record = hits.get(key);
        if (!record || now > record.resetTime) {
            record = {
                count: 1,
                resetTime: now + windowMs
            };
            hits.set(key, record);
            return next();
        }

        record.count += 1;

        if (record.count > max) {
            const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
            res.setHeader('Retry-After', retryAfterSec);
            return res.status(429).json({
                success: false,
                message
            });
        }

        next();
    };
};

export default createRateLimiter;
