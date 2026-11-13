// server/routes/authRoutes.js
// Authentication & session routes for RentHub

import express from 'express';
import { register, login, getMe, logout, forgotPassword, resetPassword } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Strict rate limiter for password reset requests (5 attempts per 15 minutes)
const passwordResetLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password reset requests from this IP. Please try again after 15 minutes.'
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgotpassword', passwordResetLimiter, forgotPassword);
router.put('/resetpassword/:token', passwordResetLimiter, resetPassword);

// Protected routes (Requires valid Bearer JWT)
router.get('/me', protect, getMe);

export default router;
