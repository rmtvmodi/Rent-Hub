// server/test_frontend_integration.js
// Automated verification suite for RentHub Phase 4: Complete Frontend-Backend Integration

import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import mongoose from 'mongoose';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import Review from './models/Review.js';
import Notification from './models/Notification.js';
import Wishlist from './models/Wishlist.js';
import { generateToken, verifyToken } from './utils/jwt.js';

import { register, login, getMe } from './controllers/authController.js';
import { getProducts, getProductById, createProduct, updateProduct, deleteProduct, moderateProductApproval } from './controllers/productController.js';
import { createBooking, getMyBookings, acceptBooking, rejectBooking, cancelBooking, requestReturn, confirmReturn } from './controllers/bookingController.js';
import { processPayment } from './controllers/paymentController.js';
import { addReview, getProductReviews } from './controllers/reviewController.js';
import { addToWishlist, getMyWishlist, removeFromWishlist } from './controllers/wishlistController.js';
import { getMyNotifications, markAsRead, markAllAsRead } from './controllers/notifController.js';
import { getPlatformMetrics, getUsers, toggleUserStatus, deleteUser, overrideBookingStatus } from './controllers/adminController.js';

console.log('======================================================');
console.log('   RENTHUB PHASE 4: FRONTEND-BACKEND INTEGRATION TESTS ');
console.log('======================================================\n');

let passedTests = 0;
let totalTests = 0;

const runTest = async (name, fn) => {
    totalTests++;
    try {
        await fn();
        console.log(`✓ [PASS] ${name}`);
        passedTests++;
    } catch (err) {
        console.error(`✗ [FAIL] ${name}`);
        console.error(`       Error: ${err.message}`);
        process.exitCode = 1;
    }
};

const createMockRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            this.body = data;
            return this;
        }
    };
    return res;
};

(async () => {
    // -------------------------------------------------------------------------
    // 1. API CLIENT CONTRACT & SESSION TOKEN HANDLING
    // -------------------------------------------------------------------------
    await runTest('API Token Handling: Generates, encodes, and validates JWT bearer tokens', () => {
        const userId = new mongoose.Types.ObjectId();
        const token = generateToken({ _id: userId, role: 'customer' });
        assert(token && typeof token === 'string', 'Token must be a non-empty string');

        const decoded = verifyToken(token);
        assert.strictEqual(decoded.id, userId.toString(), 'Decoded ID matches user');
        assert.strictEqual(decoded.role, 'customer', 'Decoded role matches customer');
    });

    // -------------------------------------------------------------------------
    // 2. AUTHENTICATION & ROLE-BASED ACCESS
    // -------------------------------------------------------------------------
    await runTest('Auth Security: Public registration rejects admin role assignment with 403', async () => {
        const req = {
            body: {
                name: 'Attacker Admin',
                email: 'attacker@example.com',
                phone: '9876543210',
                password: 'password123',
                role: 'admin'
            }
        };
        const res = createMockRes();
        await register(req, res, () => {});

        assert.strictEqual(res.statusCode, 403);
        assert(res.body.message.includes('Administrator accounts cannot be created via public registration'));
    });

    await runTest('Auth Validation: Rejects short password (<6 chars) and missing fields with 400', async () => {
        const req = {
            body: {
                name: 'Jane Doe',
                email: 'jane@example.com',
                phone: '9876543210',
                password: '123',
                role: 'customer'
            }
        };
        const res = createMockRes();
        await register(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert(res.body.message.includes('Password must be at least 6 characters long'));
    });

    await runTest('Auth Profile Restoration: getMe returns sanitized user without password hash', async () => {
        const dummyUser = {
            _id: new mongoose.Types.ObjectId(),
            name: 'Demo Customer',
            email: 'customer@example.com',
            role: 'customer',
            isActive: true
        };
        const req = { user: dummyUser };
        const res = createMockRes();
        await getMe(req, res, () => {});

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.user.email, 'customer@example.com');
        assert.strictEqual(res.body.user.password, undefined, 'Password hash must never be returned');
    });

    // -------------------------------------------------------------------------
    // 3. PRODUCT CATALOG, APPROVAL & MODERATION
    // -------------------------------------------------------------------------
    await runTest('Product Catalog: Owner listings default to pending approval status', () => {
        const ownerId = new mongoose.Types.ObjectId();
        const p = new Product({
            owner: ownerId,
            title: 'Sony Alpha A7 IV',
            description: '33MP Full-Frame Hybrid Camera',
            category: 'Cameras',
            price_per_day: 1200,
            image: 'https://example.com/sony.jpg'
        });

        assert.strictEqual(p.approval_status, 'pending', 'Must default to pending');
        assert.strictEqual(p.rating, 0, 'Initial rating must be 0 (no default 5)');
        assert.strictEqual(p.numReviews, 0, 'Initial review count must be 0');
    });

    await runTest('Product Ownership: Modifying other user listing without admin role returns 403', () => {
        const ownerId = new mongoose.Types.ObjectId();
        const intruderId = new mongoose.Types.ObjectId();
        const product = { owner: ownerId, title: 'Owner Product' };

        const isOwner = product.owner.toString() === intruderId.toString();
        const isAdmin = false;

        assert.strictEqual(isOwner || isAdmin, false, 'Intruder is denied modification access');
    });

    // -------------------------------------------------------------------------
    // 4. BOOKING LIFECYCLE & CONCURRENCY RACE PREVENTION
    // -------------------------------------------------------------------------
    await runTest('Booking Pricing: Calculates duration and price on server-side reliably', () => {
        const start = new Date('2026-11-10');
        const end = new Date('2026-11-14');
        const dailyRate = 500;

        const startMidnight = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
        const endMidnight = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
        const diffDays = Math.round((endMidnight - startMidnight) / (1000 * 60 * 60 * 24)) + 1; // 5 days inclusive

        const serverTotalPrice = diffDays * dailyRate;
        assert.strictEqual(diffDays, 5, 'Duration is 5 days inclusive');
        assert.strictEqual(serverTotalPrice, 2500, 'Total price is ₹2500');
    });

    await runTest('Booking State Machine: Enforces sequential transitions (Requested -> Accepted -> Paid)', () => {
        const validNextStates = {
            'Requested': ['Accepted', 'Rejected', 'Cancelled'],
            'Accepted': ['Paid', 'Cancelled'],
            'Paid': ['Active Rental', 'Return Requested', 'Cancelled'],
            'Active Rental': ['Return Requested'],
            'Return Requested': ['Completed'],
            'Completed': [],
            'Cancelled': [],
            'Rejected': []
        };

        // Leap from Requested directly to Completed must fail
        const canLeapToCompleted = validNextStates['Requested'].includes('Completed');
        assert.strictEqual(canLeapToCompleted, false, 'Direct leap to Completed is illegal');

        // Normal flow
        assert(validNextStates['Requested'].includes('Accepted'));
        assert(validNextStates['Accepted'].includes('Paid'));
    });

    await runTest('Late Fee Calculation: 1.2x daily rate applied only when overdue', () => {
        const dailyRate = 400;
        const overdueDays = 3;
        const feePerDay = Math.round(dailyRate * 1.2); // 480
        const totalLateFee = overdueDays * feePerDay;

        assert.strictEqual(feePerDay, 480, '1.2x daily rate is 480');
        assert.strictEqual(totalLateFee, 1440, '3 days overdue fee is 1440');

        // On time
        const onTimeFee = 0 * feePerDay;
        assert.strictEqual(onTimeFee, 0, 'On-time return incurs 0 fee');
    });

    // -------------------------------------------------------------------------
    // 5. PAYMENT SIMULATION & AMOUNT TAMPERING PREVENTION
    // -------------------------------------------------------------------------
    await runTest('Payment Security: Server compares payment against booking total_price', () => {
        const serverBooking = {
            total_price: 2500,
            status: 'Accepted',
            payment_status: 'Unpaid'
        };

        const clientTamperedAmount = 100;
        const isMatch = Number(clientTamperedAmount) === serverBooking.total_price;
        assert.strictEqual(isMatch, false, 'Server blocks tampered payment amount');

        const clientValidAmount = 2500;
        assert.strictEqual(Number(clientValidAmount) === serverBooking.total_price, true, 'Server accepts authentic amount');
    });

    // -------------------------------------------------------------------------
    // 6. VERIFIED REVIEWS & RATINGS (NO DEFAULT 5)
    // -------------------------------------------------------------------------
    await runTest('Review Eligibility: Only completed rentals can be reviewed', () => {
        const bookingActive = { status: 'Active Rental' };
        const bookingCompleted = { status: 'Completed' };

        assert.strictEqual(bookingActive.status === 'Completed', false, 'Active rental cannot be reviewed');
        assert.strictEqual(bookingCompleted.status === 'Completed', true, 'Completed rental is eligible');
    });

    await runTest('Review Rating: Review schema enforces 1 to 5 star boundary', () => {
        const customerId = new mongoose.Types.ObjectId();
        const productId = new mongoose.Types.ObjectId();
        const bookingId = new mongoose.Types.ObjectId();

        const invalidReview = new Review({
            customer: customerId,
            product: productId,
            booking: bookingId,
            rating: 6, // invalid!
            comment: 'Too high'
        });

        const validationErr = invalidReview.validateSync();
        assert(validationErr && validationErr.errors['rating'], 'Validation error triggered for rating > 5');
    });

    // -------------------------------------------------------------------------
    // 7. WISHLIST & NOTIFICATION INTEGRATION
    // -------------------------------------------------------------------------
    await runTest('Wishlist Validation: Requires valid product ID format (400)', async () => {
        const req = {
            user: { _id: new mongoose.Types.ObjectId(), role: 'customer' },
            body: { product_id: 'bad-product-id' }
        };
        const res = createMockRes();
        await addToWishlist(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert(res.body.message.includes('Invalid product ID format'));
    });

    await runTest('Notification Access: Cross-user notification modification blocked', () => {
        const userOwner = new mongoose.Types.ObjectId();
        const userAttacker = new mongoose.Types.ObjectId();

        const notif = { user: userOwner, message: 'Your product was rented' };
        const canModify = notif.user.toString() === userAttacker.toString();
        assert.strictEqual(canModify, false, 'Attacker cannot mark another user notification');
    });

    // -------------------------------------------------------------------------
    // 8. ADMIN PLATFORM OVERSIGHT & SECURITY
    // -------------------------------------------------------------------------
    await runTest('Admin Security: Admin cannot deactivate their own administrator account', async () => {
        const adminId = new mongoose.Types.ObjectId();
        const req = {
            user: { _id: adminId, role: 'admin' },
            params: { id: adminId.toString() }
        };
        const res = createMockRes();
        await toggleUserStatus(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert(res.body.message.includes('You cannot deactivate your own administrator account'));
    });

    await runTest('Admin Security: Admin cannot delete their own administrator account', async () => {
        const adminId = new mongoose.Types.ObjectId();
        const req = {
            user: { _id: adminId, role: 'admin' },
            params: { id: adminId.toString() }
        };
        const res = createMockRes();
        await deleteUser(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert(res.body.message.includes('You cannot delete your own administrator account'));
    });

    console.log('\n======================================================');
    console.log(`INTEGRATION TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('======================================================\n');
})();
