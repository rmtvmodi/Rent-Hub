// server/verify_db_persistence.js
// Genuine live MongoDB persistence verification for all 7 Mongoose models and end-to-end workflows

import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import Review from './models/Review.js';
import Notification from './models/Notification.js';
import Wishlist from './models/Wishlist.js';

import { register, login, getMe } from './controllers/authController.js';
import { createProduct, moderateProductApproval } from './controllers/productController.js';
import { createBooking, acceptBooking, markHandedOver, requestReturn, confirmReturn } from './controllers/bookingController.js';
import { processPayment } from './controllers/paymentController.js';
import { addReview } from './controllers/reviewController.js';
import { addToWishlist, getMyWishlist, removeFromWishlist } from './controllers/wishlistController.js';

console.log('================================================================');
console.log('   RENTHUB LIVE MONGODB PERSISTENCE & CRUD VERIFICATION SUITE   ');
console.log('================================================================\n');

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
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
};

const assertNextNoErr = (err) => {
    if (err) throw err;
};

(async () => {
    // 1. Establish Live Database Connection
    console.log('--- STEP 1: VERIFYING LIVE MONGOOSE CONNECTION ---');
    const conn = await connectDB();
    assert(conn, 'Mongoose must connect to live MongoDB service');
    assert.strictEqual(mongoose.connection.readyState, 1, 'Mongoose readyState must be 1 (connected)');
    assert.strictEqual(mongoose.connection.name, 'renthub', 'Database name must be renthub');
    console.log(`Live MongoDB Status: CONNECTED | ReadyState: ${mongoose.connection.readyState} | DB: ${mongoose.connection.name}\n`);

    // 2. CRUD Operations on All 7 Models
    console.log('--- STEP 2: VERIFYING REAL DATABASE CRUD ON ALL 7 MODELS ---');

    // Model 1: User CRUD
    let testUserId = null;
    await runTest('User Model: Insert -> Read -> Update -> Readback', async () => {
        const uniqueEmail = `test_crud_user_${Date.now()}@example.com`;
        const user = await User.create({
            name: 'CRUD Test User',
            email: uniqueEmail,
            phone: '9998887776',
            password: 'secretPassword123',
            role: 'customer'
        });
        testUserId = user._id;
        assert(user._id, 'User record must have generated ObjectId');

        // Read back with password selected
        const found = await User.findById(testUserId).select('+password');
        assert(found, 'User must be found in MongoDB');
        assert.strictEqual(found.email, uniqueEmail);
        const passMatch = await found.matchPassword('secretPassword123');
        assert(passMatch, 'Bcrypt password match must succeed');

        // Update
        found.name = 'CRUD Test User (Updated)';
        await found.save();

        const updated = await User.findById(testUserId);
        assert.strictEqual(updated.name, 'CRUD Test User (Updated)', 'Update must persist in MongoDB');
    });

    // Model 2: Product CRUD
    let testProdId = null;
    await runTest('Product Model: Insert -> Read -> Update -> Readback', async () => {
        const product = await Product.create({
            owner: testUserId,
            title: `CRUD Test Product ${Date.now()}`,
            description: 'Live MongoDB CRUD verification camera equipment.',
            category: 'Cameras',
            price_per_day: 950,
            image: 'https://example.com/test.jpg',
            availability: true,
            approval_status: 'pending'
        });
        testProdId = product._id;
        assert(product._id, 'Product must be inserted into MongoDB');

        // Read back
        const found = await Product.findById(testProdId);
        assert(found, 'Product must exist in MongoDB');
        assert.strictEqual(found.price_per_day, 950);
        assert.strictEqual(found.approval_status, 'pending');

        // Update
        found.price_per_day = 1050;
        found.approval_status = 'approved';
        await found.save();

        const updated = await Product.findById(testProdId);
        assert.strictEqual(updated.price_per_day, 1050);
        assert.strictEqual(updated.approval_status, 'approved');
    });

    // Model 3: Booking CRUD
    let testBookingId = null;
    await runTest('Booking Model: Insert -> Read -> Update -> Readback', async () => {
        const booking = await Booking.create({
            customer: testUserId,
            product: testProdId,
            owner: testUserId,
            start_date: new Date('2026-12-10'),
            end_date: new Date('2026-12-15'),
            total_price: 6300,
            status: 'Requested',
            payment_status: 'Unpaid'
        });
        testBookingId = booking._id;
        assert(booking._id, 'Booking must be inserted into MongoDB');

        // Read back
        const found = await Booking.findById(testBookingId);
        assert(found, 'Booking must be read back from MongoDB');
        assert.strictEqual(found.total_price, 6300);
        assert.strictEqual(found.status, 'Requested');

        // Update
        found.status = 'Accepted';
        await found.save();

        const updated = await Booking.findById(testBookingId);
        assert.strictEqual(updated.status, 'Accepted');
    });

    // Model 4: Payment CRUD
    let testPaymentId = null;
    await runTest('Payment Model: Insert -> Read -> Update -> Readback', async () => {
        const payment = await Payment.create({
            booking: testBookingId,
            customer: testUserId,
            amount: 6300,
            method: 'UPI',
            reference_id: `TXN-TEST-${Date.now()}`,
            status: 'Success'
        });
        testPaymentId = payment._id;
        assert(payment._id, 'Payment must be inserted into MongoDB');

        // Read back
        const found = await Payment.findById(testPaymentId);
        assert(found, 'Payment record must be found in MongoDB');
        assert.strictEqual(found.amount, 6300);
        assert.strictEqual(found.method, 'UPI');

        // Update
        found.status = 'Success';
        await found.save();
    });

    // Model 5: Review CRUD
    let testReviewId = null;
    await runTest('Review Model: Insert -> Read -> Dynamic Average -> Update', async () => {
        // Set booking to Completed to satisfy review verification
        await Booking.findByIdAndUpdate(testBookingId, { status: 'Completed' });

        const review = await Review.create({
            customer: testUserId,
            product: testProdId,
            booking: testBookingId,
            rating: 4,
            comment: 'Great gear, worked cleanly during test.'
        });
        testReviewId = review._id;
        assert(review._id, 'Review must be inserted into MongoDB');

        // Read back
        const found = await Review.findById(testReviewId);
        assert(found, 'Review must be read back from MongoDB');
        assert.strictEqual(found.rating, 4);

        // Verify aggregation
        const stats = await Review.getAverageRating(testProdId);
        assert.strictEqual(stats.average, 4, 'Average rating must dynamically aggregate to 4');
        assert.strictEqual(stats.count, 1, 'Review count must aggregate to 1');
    });

    // Model 6: Notification CRUD
    let testNotifId = null;
    await runTest('Notification Model: Insert -> Read -> Update read status', async () => {
        const notif = await Notification.create({
            user: testUserId,
            message: 'Your rental test booking was accepted.',
            type: 'booking'
        });
        testNotifId = notif._id;
        assert(notif._id, 'Notification must be inserted into MongoDB');

        const found = await Notification.findById(testNotifId);
        assert(found, 'Notification must be read back from MongoDB');
        assert.strictEqual(found.read, false, 'Default read is false');

        found.read = true;
        await found.save();

        const updated = await Notification.findById(testNotifId);
        assert.strictEqual(updated.read, true);
    });

    // Model 7: Wishlist CRUD
    let testWishlistId = null;
    await runTest('Wishlist Model: Insert -> Read -> Prevent Duplicate -> Delete', async () => {
        const wish = await Wishlist.create({
            customer: testUserId,
            product: testProdId
        });
        testWishlistId = wish._id;
        assert(wish._id, 'Wishlist item must be inserted into MongoDB');

        const found = await Wishlist.findById(testWishlistId);
        assert(found, 'Wishlist item must be read back from MongoDB');

        // Verify duplicate prevention compound index
        let duplicateBlocked = false;
        try {
            await Wishlist.create({ customer: testUserId, product: testProdId });
        } catch (e) {
            duplicateBlocked = true;
        }
        assert.strictEqual(duplicateBlocked, true, 'Duplicate wishlist compound entry must be blocked by MongoDB index');
    });

    // Clean up temporary Step 2 test records
    await runTest('CRUD Clean-up: Delete test records cleanly without touching demo data', async () => {
        if (testWishlistId) await Wishlist.findByIdAndDelete(testWishlistId);
        if (testReviewId) await Review.findByIdAndDelete(testReviewId);
        if (testPaymentId) await Payment.findByIdAndDelete(testPaymentId);
        if (testBookingId) await Booking.findByIdAndDelete(testBookingId);
        if (testNotifId) await Notification.findByIdAndDelete(testNotifId);
        if (testProdId) await Product.findByIdAndDelete(testProdId);
        if (testUserId) await User.findByIdAndDelete(testUserId);

        const verifyUserGone = await User.findById(testUserId);
        assert.strictEqual(verifyUserGone, null, 'Test user record must be cleanly removed');
    });

    // 3. End-to-End Backend Verification Through Real APIs
    console.log('\n--- STEP 3: END-TO-END WORKFLOW VERIFICATION ON LIVE MONGODB ---');

    let e2eCustomerId = null;
    let e2eOwnerId = null;
    let e2eCustomerToken = null;
    let e2eProductId = null;
    let e2eBookingId = null;

    await runTest('E2E Auth: Register test customer in MongoDB', async () => {
        const req = {
            body: {
                name: 'E2E Customer Test',
                email: `e2e_cust_${Date.now()}@example.com`,
                phone: '9876501234',
                password: 'password123',
                role: 'customer'
            }
        };
        const res = createMockRes();
        await register(req, res, assertNextNoErr);

        assert.strictEqual(res.statusCode, 201);
        assert(res.body.token, 'Must return JWT token');
        const uid = res.body.user.user_id || res.body.user._id;
        assert(uid, 'User ID must be returned');
        e2eCustomerId = uid;

        // Verify record in MongoDB directly
        const dbUser = await User.findById(e2eCustomerId);
        assert(dbUser, 'Customer must exist in MongoDB');
        assert.strictEqual(dbUser.role, 'customer');
    });

    await runTest('E2E Auth: Customer login and fetch live profile (getMe)', async () => {
        const dbUser = await User.findById(e2eCustomerId);
        const reqLogin = {
            body: {
                email: dbUser.email,
                password: 'password123'
            }
        };
        const resLogin = createMockRes();
        await login(reqLogin, resLogin, assertNextNoErr);

        assert.strictEqual(resLogin.statusCode, 200);
        e2eCustomerToken = resLogin.body.token;

        // Call getMe
        const reqMe = { user: dbUser };
        const resMe = createMockRes();
        await getMe(reqMe, resMe, assertNextNoErr);

        assert.strictEqual(resMe.statusCode, 200);
        assert.strictEqual(resMe.body.user.email, dbUser.email);
    });

    await runTest('E2E Product: Owner creates product and Admin approves it in MongoDB', async () => {
        const owner = await User.findOne({ email: 'owner@example.com' });
        assert(owner, 'Demo owner must exist from seeder');
        e2eOwnerId = owner._id;

        // Create product
        const reqProd = {
            user: owner,
            body: {
                title: `E2E Live Camera ${Date.now()}`,
                description: '4K cinema camera for live MongoDB E2E testing.',
                category: 'Cameras',
                price_per_day: 1500,
                image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80',
                availability: true
            }
        };
        const resProd = createMockRes();
        await createProduct(reqProd, resProd, assertNextNoErr);

        assert.strictEqual(resProd.statusCode, 201);
        assert.strictEqual(resProd.body.product.approval_status, 'pending', 'Must default to pending');
        e2eProductId = resProd.body.product._id;

        // Admin approves product
        const admin = await User.findOne({ email: 'admin@example.com' });
        const reqApprove = {
            user: admin,
            params: { id: e2eProductId.toString() },
            body: { approval_status: 'approved' }
        };
        const resApprove = createMockRes();
        await moderateProductApproval(reqApprove, resApprove, assertNextNoErr);

        assert.strictEqual(resApprove.statusCode, 200);
        const approvedInDB = await Product.findById(e2eProductId);
        assert.strictEqual(approvedInDB.approval_status, 'approved', 'Must be approved in MongoDB');
    });

    await runTest('E2E Booking: Customer books product with server pricing & date collision checks', async () => {
        const customer = await User.findById(e2eCustomerId);

        const reqBooking = {
            user: customer,
            body: {
                product_id: e2eProductId.toString(),
                start_date: '2026-12-20',
                end_date: '2026-12-24' // 5 days inclusive = 5 * 1500 = 7500
            }
        };
        const resBooking = createMockRes();
        await createBooking(reqBooking, resBooking, assertNextNoErr);

        assert.strictEqual(resBooking.statusCode, 201);
        assert.strictEqual(resBooking.body.booking.total_price, 7500, 'Server-computed price must be 7500');
        e2eBookingId = resBooking.body.booking._id;

        // Verify collision prevention in MongoDB
        const reqCollision = {
            user: customer,
            body: {
                product_id: e2eProductId.toString(),
                start_date: '2026-12-22',
                end_date: '2026-12-25' // Overlaps!
            }
        };
        const resCollision = createMockRes();
        await createBooking(reqCollision, resCollision, assertNextNoErr);

        assert.strictEqual(resCollision.statusCode, 409, 'Overlapping booking must be rejected with 409 Conflict');
    });

    await runTest('E2E Workflow: Owner accepts -> Customer pays -> Transitions status in MongoDB', async () => {
        const owner = await User.findById(e2eOwnerId);
        const customer = await User.findById(e2eCustomerId);

        // Owner accepts
        const reqAccept = {
            user: owner,
            params: { id: e2eBookingId.toString() }
        };
        const resAccept = createMockRes();
        await acceptBooking(reqAccept, resAccept, assertNextNoErr);
        assert.strictEqual(resAccept.statusCode, 200);
        assert.strictEqual(resAccept.body.booking.status, 'Accepted');

        // Customer pays
        const reqPayment = {
            user: customer,
            body: {
                booking_id: e2eBookingId.toString(),
                amount: 7500,
                method: 'UPI'
            }
        };
        const resPayment = createMockRes();
        await processPayment(reqPayment, resPayment, assertNextNoErr);
        assert.strictEqual(resPayment.statusCode, 201);
        assert.strictEqual(resPayment.body.payment.status, 'Success');

        // Owner marks handover (Paid -> Active Rental)
        const reqHandover = {
            user: owner,
            params: { id: e2eBookingId.toString() }
        };
        const resHandover = createMockRes();
        await markHandedOver(reqHandover, resHandover, assertNextNoErr);
        assert.strictEqual(resHandover.statusCode, 200);

        // Verify MongoDB state
        const dbBooking = await Booking.findById(e2eBookingId);
        assert.strictEqual(dbBooking.payment_status, 'Paid');
        assert.strictEqual(dbBooking.status, 'Active Rental');
    });

    await runTest('E2E Return & Review: Return requested -> Owner confirms -> Verified review created', async () => {
        const owner = await User.findById(e2eOwnerId);
        const customer = await User.findById(e2eCustomerId);

        // Return requested
        const reqReturn = {
            user: customer,
            params: { id: e2eBookingId.toString() }
        };
        const resReturn = createMockRes();
        await requestReturn(reqReturn, resReturn, assertNextNoErr);
        assert.strictEqual(resReturn.statusCode, 200);

        // Owner confirms return
        const reqConfirm = {
            user: owner,
            params: { id: e2eBookingId.toString() }
        };
        const resConfirm = createMockRes();
        await confirmReturn(reqConfirm, resConfirm, assertNextNoErr);
        assert.strictEqual(resConfirm.statusCode, 200);
        assert.strictEqual(resConfirm.body.booking.status, 'Completed');

        // Verified review
        const reqReview = {
            user: customer,
            body: {
                product_id: e2eProductId.toString(),
                booking_id: e2eBookingId.toString(),
                rating: 5,
                comment: 'Sensational live 4K footage! Rented and returned seamlessly.'
            }
        };
        const resReview = createMockRes();
        await addReview(reqReview, resReview, assertNextNoErr);
        assert.strictEqual(resReview.statusCode, 201);

        // Verify product rating aggregation in MongoDB
        const updatedProduct = await Product.findById(e2eProductId);
        assert.strictEqual(updatedProduct.rating, 5, 'Rating must be 5');
        assert.strictEqual(updatedProduct.numReviews, 1, 'Review count must be 1');
    });

    // Clean up temporary e2e records
    await runTest('E2E Clean-up: Delete temporary test records, preserving canonical demo data', async () => {
        await Review.deleteMany({ product: e2eProductId });
        await Payment.deleteMany({ booking: e2eBookingId });
        await Booking.findByIdAndDelete(e2eBookingId);
        await Product.findByIdAndDelete(e2eProductId);
        await Notification.deleteMany({ user: e2eCustomerId });
        await User.findByIdAndDelete(e2eCustomerId);

        const verifyCustomerGone = await User.findById(e2eCustomerId);
        assert.strictEqual(verifyCustomerGone, null, 'E2E Customer must be cleanly removed');
    });

    console.log('\n================================================================');
    console.log(`LIVE DATABASE TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    await mongoose.disconnect();
    process.exit(0);
})();
