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

// Customer operations (accessible to customer and owner, not admin)
router.post('/', authorize('customer', 'owner'), createBooking);
router.get('/my', getMyBookings);
router.get('/:id', getBookingById);

// Owner operations (authorized for the listing owner, whether customer or owner role, or admin)
router.patch('/:id/accept', authorize('owner', 'customer', 'admin'), acceptBooking);
router.patch('/:id/reject', authorize('owner', 'customer', 'admin'), rejectBooking);
router.patch('/:id/handover', authorize('owner', 'customer', 'admin'), markHandedOver);
router.patch('/:id/return', authorize('owner', 'customer', 'admin'), confirmReturn);

// Customer operations (cancellation & return request)
router.patch('/:id/cancel', authorize('customer', 'owner', 'admin'), cancelBooking);
router.patch('/:id/request-return', authorize('customer', 'owner'), requestReturn);

export default router;
