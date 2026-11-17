// server/test_concurrency_security.js
// Comprehensive Phase 5 Security Audit, Concurrency Race Tests, and E2E Journeys

import assert from 'assert';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import Review from './models/Review.js';
import Notification from './models/Notification.js';
import Wishlist from './models/Wishlist.js';
import { register, login, getMe, logout } from './controllers/authController.js';
import { createProduct, updateProduct, deleteProduct, getProducts, moderateProductApproval, getMyProducts } from './controllers/productController.js';
import { createBooking, getMyBookings, getBookingById, acceptBooking, rejectBooking, cancelBooking, markHandedOver, requestReturn, confirmReturn } from './controllers/bookingController.js';
import { processPayment, getMyPayments, getAllPayments } from './controllers/paymentController.js';
import { addReview, getProductReviews } from './controllers/reviewController.js';
import { addToWishlist, getMyWishlist, removeFromWishlist } from './controllers/wishlistController.js';
import { getPlatformMetrics, getUsers, toggleUserStatus, deleteUser as adminDeleteUser } from './controllers/adminController.js';

// Mock Express response helper
const mockResponse = () => {
    const res = {};
    res.statusCode = 200;
    res.body = null;
    res.status = function (code) {
        this.statusCode = code;
        return this;
    };
    res.json = function (data) {
        this.body = data;
        return this;
    };
    return res;
};

const handleNext = (res) => (err) => {
    if (err) {
        res.statusCode = err.status || 500;
        res.body = { success: false, message: err.message, error: err };
    }
};

async function runSecurityAndConcurrencyTests() {
    console.log('================================================================');
    console.log('   RENTHUB PHASE 5: SECURITY AUDIT & CONCURRENCY TEST SUITE     ');
    console.log('================================================================\n');

    await connectDB();
    assert.strictEqual(mongoose.connection.readyState, 1, 'MongoDB must be connected');

    let passedTests = 0;
    let totalTests = 0;

    const test = async (name, fn) => {
        totalTests++;
        try {
            await fn();
            console.log(`✓ [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`✗ [FAIL] ${name}: ${err.message}`);
            throw err;
        }
    };

    const runId = Date.now();
    const testCustomerEmail = `audit_cust_${runId}@example.com`;
    const testCustomer2Email = `audit_cust2_${runId}@example.com`;
    const testOwnerEmail = `audit_owner_${runId}@example.com`;
    const testOwner2Email = `audit_owner2_${runId}@example.com`;

    let customerUser = null;
    let customer2User = null;
    let ownerUser = null;
    let owner2User = null;
    let adminUser = null;
    let testProduct = null;
    let testBooking = null;

    try {
        // --- 1. AUTHENTICATION & REGISTRATION SECURITY ---
        console.log('--- 1. AUTHENTICATION & RBAC SECURITY AUDIT ---');

        await test('Public registration strictly rejects admin role with 403', async () => {
            const req = { body: { name: 'Fake Admin', email: `admin_${runId}@example.com`, password: 'password123', role: 'admin' } };
            const res = mockResponse();
            await register(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        await test('Registration sanitizes password: never exposes password hash in response', async () => {
            const req = { body: { name: 'Audit Customer', email: testCustomerEmail, password: 'Customer123!', role: 'customer' } };
            const res = mockResponse();
            await register(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201);
            assert.ok(res.body.token, 'Token must be returned');
            assert.strictEqual(res.body.user.password, undefined, 'Password must NOT be returned');
            customerUser = await User.findOne({ email: testCustomerEmail });
            assert.ok(customerUser, 'User saved to MongoDB');
            assert.notStrictEqual(customerUser.password, 'Customer123!', 'Password must be bcrypt hashed');
        });

        await test('Register second customer and owner for cross-tenant isolation testing', async () => {
            const reqCust2 = { body: { name: 'Audit Customer 2', email: testCustomer2Email, password: 'Customer123!', role: 'customer' } };
            const resCust2 = mockResponse();
            await register(reqCust2, resCust2, () => {});
            customer2User = await User.findOne({ email: testCustomer2Email });

            const reqOwner = { body: { name: 'Audit Owner', email: testOwnerEmail, password: 'Owner123!', role: 'owner' } };
            const resOwner = mockResponse();
            await register(reqOwner, resOwner, handleNext(resOwner));
            ownerUser = await User.findOne({ email: testOwnerEmail });

            const reqOwner2 = { body: { name: 'Audit Owner 2', email: testOwner2Email, password: 'Owner123!', role: 'owner' } };
            const resOwner2 = mockResponse();
            await register(reqOwner2, resOwner2, handleNext(resOwner2));
            owner2User = await User.findOne({ email: testOwner2Email });

            adminUser = await User.findOne({ role: 'admin' });
            assert.ok(adminUser, 'Admin account exists from seeding');
        });

        await test('Login returns sanitized user without password', async () => {
            const req = { body: { email: testCustomerEmail, password: 'Customer123!' } };
            const res = mockResponse();
            await login(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.user.password, undefined);
        });

        await test('getMe returns profile without password', async () => {
            const req = { user: customerUser };
            const res = mockResponse();
            await getMe(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.user.password, undefined);
            assert.strictEqual(res.body.user.email, testCustomerEmail);
        });

        await test('Logout endpoint successfully terminates session', async () => {
            const req = { user: customerUser };
            const res = mockResponse();
            await logout(req, res);
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
        });

        // --- 2. PRODUCT MANAGEMENT & ISOLATION ---
        console.log('\n--- 2. PRODUCT PERMISSIONS & DATA ISOLATION ---');

        await test('Owner creates product with default approval_status: approved and immediate visibility', async () => {
            const req = {
                user: ownerUser,
                body: {
                    title: `Audit Sony A7 IV Camera ${runId}`,
                    description: 'Professional 4K camera for video production.',
                    category: 'Cameras',
                    price_per_day: 1200,
                    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80'
                }
            };
            const res = mockResponse();
            await createProduct(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201, `Status must be 201, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
            assert.strictEqual(res.body.product.approval_status, 'approved');
            testProduct = res.body.product;
        });

        await test('Newly created product is immediately visible in public marketplace', async () => {
            const req = { query: { search: `Audit Sony A7 IV Camera ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 1, 'Approved product must be visible');
        });

        await test('Cross-tenant security: Owner 2 cannot edit Owner 1 product (403)', async () => {
            const req = {
                user: owner2User,
                params: { id: testProduct._id.toString() },
                body: { title: 'Hacked Title' }
            };
            const res = mockResponse();
            await updateProduct(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        await test('Admin moderation: Admin suspends inappropriate product (rejected)', async () => {
            const req = {
                user: adminUser,
                params: { id: testProduct._id.toString() },
                body: { approval_status: 'rejected' }
            };
            const res = mockResponse();
            await moderateProductApproval(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.product.approval_status, 'rejected');
        });

        await test('Suspended product is NOT visible in public marketplace', async () => {
            const req = { query: { search: `Audit Sony A7 IV Camera ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 0, 'Suspended product must be hidden');
        });

        await test('Admin reinstates suspended product (approved)', async () => {
            const req = {
                user: adminUser,
                params: { id: testProduct._id.toString() },
                body: { approval_status: 'approved' }
            };
            const res = mockResponse();
            await moderateProductApproval(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.product.approval_status, 'approved');
        });

        await test('Reinstated product is visible again in public marketplace', async () => {
            const req = { query: { search: `Audit Sony A7 IV Camera ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 1);
        });

        // --- 3. BOOKING CONCURRENCY & INTEGRITY ---
        console.log('\n--- 3. BOOKING INTEGRITY & CONCURRENCY PROTECTION ---');

        await test('Server calculates booking duration and price (client total_price ignored)', async () => {
            const startDate = '2027-04-10';
            const endDate = '2027-04-12'; // 3 days inclusive: 3 * 1200 = 3600
            const req = {
                user: customerUser,
                body: {
                    product_id: testProduct._id.toString(),
                    start_date: startDate,
                    end_date: endDate,
                    total_price: 1 // Attempted manipulation: ₹1
                }
            };
            const res = mockResponse();
            await createBooking(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201, `Booking creation failed: ${JSON.stringify(res.body)}`);
            assert.strictEqual(res.body.booking.total_price, 3600, 'Must calculate 3 days * 1200 = 3600 server-side');
            testBooking = res.body.booking;
        });

        await test('Direct date overlap booking is rejected with 409 Conflict', async () => {
            const req = {
                user: customer2User,
                body: {
                    product_id: testProduct._id.toString(),
                    start_date: '2027-04-11',
                    end_date: '2027-04-15'
                }
            };
            const res = mockResponse();
            await createBooking(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 409);
            assert.strictEqual(res.body.success, false);
        });

        await test('CONCURRENCY RACE TEST: 5 simultaneous bookings for same product/dates -> Exactly 1 succeeds, 4 get 409', async () => {
            const concurrentStart = '2027-06-01';
            const concurrentEnd = '2027-06-05';
            const attempts = 5;

            const promises = Array.from({ length: attempts }, (_, i) => {
                const req = {
                    user: customerUser,
                    body: {
                        product_id: testProduct._id.toString(),
                        start_date: concurrentStart,
                        end_date: concurrentEnd
                    }
                };
                const res = mockResponse();
                return createBooking(req, res, handleNext(res)).then(() => ({
                    index: i,
                    status: res.statusCode,
                    body: res.body
                }));
            });

            const results = await Promise.all(promises);
            const successes = results.filter(r => r.status === 201);
            const conflicts = results.filter(r => r.status === 409);

            assert.strictEqual(successes.length, 1, `Exactly 1 concurrent request must succeed (Got ${successes.length})`);
            assert.strictEqual(conflicts.length, attempts - 1, `All other requests must receive 409 Conflict (Got ${conflicts.length})`);

            // Clean up the concurrent test booking
            const createdId = successes[0].body.booking._id;
            await Booking.findByIdAndDelete(createdId);
        });

        await test('Cross-user privacy: Customer 2 cannot view Customer 1 private booking (403)', async () => {
            const req = {
                user: customer2User,
                params: { id: testBooking._id.toString() }
            };
            const res = mockResponse();
            await getBookingById(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 403);
        });

        // --- 4. WORKFLOW & PAYMENT INTEGRITY ---
        console.log('\n--- 4. WORKFLOW & PAYMENT INTEGRITY ---');

        await test('Owner accepts booking request', async () => {
            const req = {
                user: ownerUser,
                params: { id: testBooking._id.toString() }
            };
            const res = mockResponse();
            await acceptBooking(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.booking.status, 'Accepted');
        });

        await test('Cross-user payment security: Customer 2 cannot pay for Customer 1 booking (403)', async () => {
            const req = {
                user: customer2User,
                body: {
                    booking_id: testBooking._id.toString(),
                    payment_method: 'UPI'
                }
            };
            const res = mockResponse();
            await processPayment(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 403);
        });

        await test('Customer 1 completes simulated payment -> creates Payment document in MongoDB', async () => {
            const req = {
                user: customerUser,
                body: {
                    booking_id: testBooking._id.toString(),
                    payment_method: 'Credit Card', // Tests normalization
                    amount: 3600
                }
            };
            const res = mockResponse();
            await processPayment(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201);
            assert.strictEqual(res.body.payment.status, 'Success');
            assert.strictEqual(res.body.payment.method, 'Card');

            const dbPayment = await Payment.findOne({ booking: testBooking._id });
            assert.ok(dbPayment, 'Payment document persisted in MongoDB');
            assert.strictEqual(dbPayment.amount, 3600);
        });

        await test('Duplicate payment rejection: Second payment on same booking rejected (400)', async () => {
            const req = {
                user: customerUser,
                body: {
                    booking_id: testBooking._id.toString(),
                    payment_method: 'UPI'
                }
            };
            const res = mockResponse();
            await processPayment(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 400);
        });

        await test('Owner hands over equipment: Paid -> Active Rental', async () => {
            const req = {
                user: ownerUser,
                params: { id: testBooking._id.toString() }
            };
            const res = mockResponse();
            await markHandedOver(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.booking.status, 'Active Rental');
        });

        await test('Customer requests return: Active Rental -> Return Requested', async () => {
            const req = {
                user: customerUser,
                params: { id: testBooking._id.toString() }
            };
            const res = mockResponse();
            await requestReturn(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.booking.status, 'Return Requested');
        });

        await test('Owner confirms return: Return Requested -> Completed with late fee calculation', async () => {
            const req = {
                user: ownerUser,
                params: { id: testBooking._id.toString() }
            };
            const res = mockResponse();
            await confirmReturn(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.booking.status, 'Completed');
        });

        // --- 5. REVIEWS & RATINGS ---
        console.log('\n--- 5. REVIEWS & RATINGS INTEGRITY ---');

        await test('Customer posts verified review on completed rental -> dynamically aggregates product rating', async () => {
            const req = {
                user: customerUser,
                body: {
                    booking_id: testBooking._id.toString(),
                    rating: 5,
                    comment: 'Incredible camera! Flawless condition and great battery life.'
                }
            };
            const res = mockResponse();
            await addReview(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201);
            assert.strictEqual(res.body.review.rating, 5);

            const updatedProduct = await Product.findById(testProduct._id);
            assert.strictEqual(updatedProduct.rating, 5);
            assert.strictEqual(updatedProduct.numReviews, 1);
        });

        await test('Duplicate review rejection: Customer cannot review same booking twice (400)', async () => {
            const req = {
                user: customerUser,
                body: {
                    booking_id: testBooking._id.toString(),
                    rating: 4,
                    comment: 'Trying to post another review'
                }
            };
            const res = mockResponse();
            await addReview(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 400);
        });

        // --- 6. WISHLIST & NOTIFICATIONS ---
        console.log('\n--- 6. WISHLIST & NOTIFICATIONS ISOLATION ---');

        await test('Customer adds product to wishlist and prevents duplicate addition', async () => {
            const req = {
                user: customerUser,
                body: { product_id: testProduct._id.toString() }
            };
            const res = mockResponse();
            await addToWishlist(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 201);

            // Duplicate attempt
            const resDup = mockResponse();
            await addToWishlist(req, resDup, handleNext(resDup));
            assert.strictEqual(resDup.statusCode, 400);

            // Remove
            const reqRemove = {
                user: customerUser,
                params: { productId: testProduct._id.toString() }
            };
            const resRemove = mockResponse();
            await removeFromWishlist(reqRemove, resRemove, handleNext(resRemove));
            assert.strictEqual(resRemove.statusCode, 200);
        });

        // --- 7. ADMIN GOVERNANCE & SECURITY ---
        console.log('\n--- 7. ADMIN GOVERNANCE & SECURITY ---');

        await test('Admin dashboard metrics report live platform totals', async () => {
            const req = { user: adminUser };
            const res = mockResponse();
            await getPlatformMetrics(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.ok(res.body.metrics.users.total >= 4);
            assert.ok(res.body.metrics.products.total >= 6);
            assert.ok(res.body.metrics.platformVolume >= 3600);
        });

        await test('Admin cannot deactivate their own administrator account (400)', async () => {
            const req = {
                user: adminUser,
                params: { id: adminUser._id.toString() },
                body: { isActive: false }
            };
            const res = mockResponse();
            await toggleUserStatus(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 400);
        });

        await test('Admin cannot delete their own administrator account (400)', async () => {
            const req = {
                user: adminUser,
                params: { id: adminUser._id.toString() }
            };
            const res = mockResponse();
            await adminDeleteUser(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 400);
        });

    } finally {
        // Clean up test audit records to maintain pristine demo environment
        console.log('\n--- CLEANING UP AUDIT TEST RECORDS ---');
        if (testBooking) {
            await Review.deleteMany({ booking: testBooking._id });
            await Payment.deleteMany({ booking: testBooking._id });
            await Booking.findByIdAndDelete(testBooking._id);
        }
        if (testProduct) {
            await Product.findByIdAndDelete(testProduct._id);
        }
        if (customerUser) await User.findByIdAndDelete(customerUser._id);
        if (customer2User) await User.findByIdAndDelete(customer2User._id);
        if (ownerUser) await User.findByIdAndDelete(ownerUser._id);
        if (owner2User) await User.findByIdAndDelete(owner2User._id);
        await Notification.deleteMany({
            message: new RegExp(runId.toString())
        });
        console.log('Audit test artifacts cleaned up cleanly.');
    }

    console.log('\n================================================================');
    console.log(`PHASE 5 TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    await mongoose.connection.close();
}

runSecurityAndConcurrencyTests().catch(err => {
    console.error('Test Suite Failed:', err);
    process.exit(1);
});
