// server/routes/adminRoutes.js
// Routes for Platform Administration, Metrics, and Governance

import express from 'express';
import {
    getPlatformMetrics,
    getUsers,
    getUserById,
    updateUser,
    toggleUserStatus,
    deleteUser,
    getAllProductsAdmin,
    getAllBookingsAdmin,
    overrideBookingStatus
} from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Strict security: All admin routes require valid JWT and 'admin' role
router.use(protect);
router.use(authorize('admin'));

// Metrics
router.get('/metrics', getPlatformMetrics);

// User Governance
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.patch('/users/:id', updateUser);
router.patch('/users/:id/status', toggleUserStatus);
router.delete('/users/:id', deleteUser);

// Inventory & Bookings Oversight
router.get('/products', getAllProductsAdmin);
router.get('/bookings', getAllBookingsAdmin);
router.patch('/bookings/:id/status', overrideBookingStatus);

export default router;
