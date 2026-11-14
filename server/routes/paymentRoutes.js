// server/routes/paymentRoutes.js
// Routes for simulated payment processing, receipts, and admin payment audits

import express from 'express';
import {
    processPayment,
    getMyPayments,
    getAllPayments,
    getPaymentById
} from '../controllers/paymentController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.post('/', authorize('customer', 'owner'), processPayment);
router.get('/my', authorize('customer', 'owner'), getMyPayments);
router.get('/', authorize('admin'), getAllPayments);
router.get('/:id', getPaymentById);

export default router;
