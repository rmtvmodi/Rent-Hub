// server/routes/bookingRoutes.js
// Routes for Booking creation, lifecycle transitions, and returns

import express from 'express';
import {
    createBooking,
    getMyBookings,
    getBookingById,
    acceptBooking,
    rejectBooking,
    cancelBooking,
    markHandedOver,
    requestReturn,
    confirmReturn
} from '../controllers/bookingController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All booking routes require authentication
router.use(protect);

router.post('/', authorize('customer'), createBooking);
router.get('/my', getMyBookings);
router.get('/:id', getBookingById);

// Owner operations
router.patch('/:id/accept', authorize('owner', 'admin'), acceptBooking);
router.patch('/:id/reject', authorize('owner', 'admin'), rejectBooking);
router.patch('/:id/handover', authorize('owner', 'admin'), markHandedOver);
router.patch('/:id/return', authorize('owner', 'admin'), confirmReturn);

// Customer operations
router.patch('/:id/cancel', authorize('customer', 'admin'), cancelBooking);
router.patch('/:id/request-return', authorize('customer'), requestReturn);

export default router;
