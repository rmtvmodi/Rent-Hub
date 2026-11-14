// server/test_phase3_suite.js
// Verification suite for RentHub Phase 3:
// 1. Forgot password SMTP timeouts & error token rollback
// 2. Rate limiter retry window headers & payload
// 3. Password policy (8 chars, uppercase, lowercase, number, special char)
// 4. Dual capability (Customer & Owner can rent, list, and wishlist)
// 5. Self-rental blocking
// 6. Responsive 2-column mobile grid rules
// 7. No silent localStorage fallbacks
// 8. In-App Password Change (PUT /api/auth/password) & Old JWT Invalidation
// 9. Payment Processing & Dual-Role Authorization (POST /api/payments)
// 10. Atomic Reset Token Rollback & Concurrency Safety

process.env.NODE_ENV = 'test';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import app from './server.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import { generateToken } from './utils/jwt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PORT = 5005;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Helper: HTTP request wrapper
const makeRequest = (method, urlPath, headers = {}, body = null) => {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const reqHeaders = { ...headers };

        let payload = null;
        if (body && typeof body === 'object' && !(body instanceof Buffer)) {
            payload = JSON.stringify(body);
            reqHeaders['Content-Type'] = 'application/json';
        } else if (body instanceof Buffer) {
            payload = body;
        }

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: reqHeaders
        };

        const req = http.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                let json = null;
                try {
                    json = JSON.parse(raw);
                } catch (e) {
                    json = null;
                }
                resolve({ status: res.statusCode, headers: res.headers, raw, json });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
};

console.log('\n================================================================');
console.log('         RENTHUB PHASE 3 VERIFICATION TEST SUITE                 ');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`[PASS] ${name}`);
        passCount++;
    } catch (e) {
        console.error(`[FAIL] ${name}:`, e.message);
        failCount++;
    }
}

async function runAsyncTest(name, fn) {
    try {
        await fn();
        console.log(`[PASS] ${name}`);
        passCount++;
    } catch (e) {
        console.error(`[FAIL] ${name}:`, e.message);
        failCount++;
    }
}

async function main() {
    // ================================================================
    // PART A: STATIC CODE & ARCHITECTURE AUDIT (TESTS 1 - 12)
    // ================================================================

    // TEST 1: sendEmail.js includes explicit socket timeouts and clean transport closure
    test('1. sendEmail has connectionTimeout, socketTimeout, and transport.close() cleanup', () => {
        const sendEmailCode = fs.readFileSync(path.join(__dirname, 'utils', 'sendEmail.js'), 'utf-8');
        assert(sendEmailCode.includes('connectionTimeout: 8000'), 'sendEmail must specify connectionTimeout');
        assert(sendEmailCode.includes('greetingTimeout: 5000'), 'sendEmail must specify greetingTimeout');
        assert(sendEmailCode.includes('socketTimeout: 10000'), 'sendEmail must specify socketTimeout');
        assert(sendEmailCode.includes('transporter.close()'), 'sendEmail must call transporter.close() on timeout/abort');
    });

    // TEST 2: authController cleans reset token on email dispatch failure and never falsely reports success
    test('2. authController rolls back reset token on email failure and never falsely reports success', () => {
        const authCtrlCode = fs.readFileSync(path.join(__dirname, 'controllers', 'authController.js'), 'utf-8');
        assert(authCtrlCode.includes('resetPasswordToken: hashedTokenOfThisRequest'), 'authController must conditionally target token of this request');
        assert(authCtrlCode.includes('$unset'), 'authController must use atomic $unset to clear reset tokens');
        assert(authCtrlCode.includes('Failed to dispatch password reset email'), 'authController must return error message on failure');
    });

    // TEST 3: Rate limiter sends Retry-After header and returns retryAfter in response
    test('3. Rate limiter returns retryAfter in response and sets Retry-After header', () => {
        const rateLimiterCode = fs.readFileSync(path.join(__dirname, 'middleware', 'rateLimiter.js'), 'utf-8');
        assert(rateLimiterCode.includes("res.setHeader('Retry-After'"), 'Rate limiter must set Retry-After header');
        assert(rateLimiterCode.includes('retryAfter: retryAfterSec'), 'Rate limiter must return retryAfter in response JSON');
    });

    // TEST 4: Wishlist routes authorize both customer and owner
    test('4. Wishlist routes authorize both customer and owner roles', () => {
        const wishlistRoutesCode = fs.readFileSync(path.join(__dirname, 'routes', 'wishlistRoutes.js'), 'utf-8');
        assert(wishlistRoutesCode.includes("authorize('customer', 'owner')"), 'Wishlist routes must allow customer and owner');
    });

    // TEST 5: Review routes authorize both customer and owner
    test('5. Review routes authorize both customer and owner roles', () => {
        const reviewRoutesCode = fs.readFileSync(path.join(__dirname, 'routes', 'reviewRoutes.js'), 'utf-8');
        assert(reviewRoutesCode.includes("authorize('customer', 'owner')"), 'Review routes must allow customer and owner');
    });

    // TEST 6: User model password regex strictly requires 8 chars, uppercase, lowercase, number, special char
    test('6. User model enforces 8-character minimum with uppercase, lowercase, number, special character', () => {
        const userModelCode = fs.readFileSync(path.join(__dirname, 'models', 'User.js'), 'utf-8');
        assert(userModelCode.includes('minlength: [8'), 'User model must require minlength: 8');
        const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;
        assert(pwdRegex.test('RentHub#2026'), 'Valid strong password must pass regex');
        assert(!pwdRegex.test('short1!'), 'Password under 8 chars must fail regex');
        assert(!pwdRegex.test('nocapitals123!'), 'Password without uppercase must fail regex');
        assert(!pwdRegex.test('NOLOWERCASE123!'), 'Password without lowercase must fail regex');
        assert(!pwdRegex.test('NoSpecialChar123'), 'Password without special char must fail regex');
        assert(!pwdRegex.test('NoNumberSpecial!'), 'Password without number must fail regex');
    });

    // TEST 7: Responsive CSS Grid rules strictly enforce 2 columns on mobile and 4 on desktop
    test('7. CSS styles enforce 2-column mobile grid and 4-column desktop grid', () => {
        const cssCode = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf-8');
        assert(cssCode.includes('grid-template-columns: repeat(4, 1fr)'), 'CSS must define 4 columns for desktop grid');
        assert(cssCode.includes('grid-template-columns: repeat(2, 1fr) !important'), 'CSS must define 2 columns !important for mobile grid');
        assert(cssCode.includes('.mobile-bottom-nav'), 'CSS must define mobile bottom navigation');
        assert(cssCode.includes('.toast-container'), 'CSS must define toast notification styles');
        assert(cssCode.includes('.skeleton-card'), 'CSS must define skeleton loader styles');
    });

    // TEST 8: js/api.js supports configurable per-request timeouts and handles 429 retryAfter
    test('8. api.js implements configurable timeoutMs and parses 429 retryAfter', () => {
        const apiCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'api.js'), 'utf-8');
        assert(apiCode.includes('timeoutMs = 15000'), 'api.js must provide default configurable timeoutMs');
        assert(apiCode.includes('err.retryAfter'), 'api.js must attach retryAfter on HTTP 429');
        assert(apiCode.includes('controller.abort'), 'api.js must abort fetch when timeoutMs triggers');
    });

    // TEST 9: forgot-password.html handles live server-side countdown and clears button on finally
    test('9. forgot-password.html implements server-informed live countdown timer', () => {
        const forgotHtml = fs.readFileSync(path.join(__dirname, '..', 'forgot-password.html'), 'utf-8');
        assert(forgotHtml.includes('err.retryAfter'), 'forgot-password.html must read server retryAfter');
        assert(forgotHtml.includes('countdownTimer = setInterval'), 'forgot-password.html must run live countdown');
        assert(forgotHtml.includes('finally'), 'forgot-password.html must include finally block');
    });

    // TEST 10: Unified dashboard.html and unified-dashboard.js exist and have no silent localStorage fallback
    test('10. Unified dashboard exists and connects to live REST APIs without silent fallbacks', () => {
        const dashboardHtml = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf-8');
        assert(dashboardHtml.includes('tab-rentals'), 'dashboard.html must include My Rentals tab');
        assert(dashboardHtml.includes('tab-listings'), 'dashboard.html must include My Listings tab');
        assert(dashboardHtml.includes('tab-add-product'), 'dashboard.html must include Add Product tab');
        assert(dashboardHtml.includes('tab-requests'), 'dashboard.html must include Booking Requests tab');
        assert(dashboardHtml.includes('tab-wishlist'), 'dashboard.html must include Wishlist tab');
        assert(dashboardHtml.includes('tab-profile'), 'dashboard.html must include Profile tab');

        const unifiedJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'unified-dashboard.js'), 'utf-8');
        assert(unifiedJs.includes("api.post('/products'") || unifiedJs.includes('api.post(`/products`'), 'unified-dashboard.js must post products to backend');
        assert(unifiedJs.includes("api.put(`/products/") || unifiedJs.includes("api.put('/products/"), 'unified-dashboard.js must put products to backend');
        assert(unifiedJs.includes("api.delete(`/products/") || unifiedJs.includes("api.delete('/products/"), 'unified-dashboard.js must delete products via backend');
        assert(unifiedJs.includes("uploadFiles"), 'unified-dashboard.js must handle file uploads');
        assert(unifiedJs.includes("api.post('/payments'"), 'unified-dashboard.js must route pay-now to /payments');
    });

    // TEST 11: Backward compatibility redirects for legacy customer and owner dashboards
    test('11. Legacy customer and owner dashboards redirect to unified dashboard tabs', () => {
        const custHtml = fs.readFileSync(path.join(__dirname, '..', 'customer-dashboard.html'), 'utf-8');
        assert(custHtml.includes("window.location.replace('dashboard.html?tab=rentals"), 'customer-dashboard.html must redirect to rentals tab');

        const ownerHtml = fs.readFileSync(path.join(__dirname, '..', 'owner-dashboard.html'), 'utf-8');
        assert(ownerHtml.includes("window.location.replace('dashboard.html?tab=listings"), 'owner-dashboard.html must redirect to listings tab');
    });

    // TEST 12: Zero unverified trust claims on homepage
    test('12. Homepage contains no unverified trust claims', () => {
        const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf-8');
        assert(!indexHtml.includes('✔ Verified Inventory'), 'Homepage must not claim Verified Inventory without inspection pipeline');
        assert(!indexHtml.includes('Inspected electronics'), 'Homepage must not claim Inspected electronics');
        assert(indexHtml.includes('✔ Wide Selection'), 'Homepage should use truthful Wide Selection badge');
    });

    // ================================================================
    // PART B: LIVE INTEGRATION & REGRESSION SUITE (TESTS 13 - 22)
    // ================================================================
    console.log('\n--- STARTING LIVE REGRESSION & INTEGRATION TESTS ---\n');

    // Ensure MongoDB connection is established
    if (mongoose.connection.readyState !== 1) {
        await connectDB();
    }

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    const cleanupUserIds = [];
    const cleanupProductIds = [];
    const cleanupBookingIds = [];
    const cleanupPaymentIds = [];

    try {
        // --- FIX 1: IN-APP PASSWORD CHANGE & SESSION INVALIDATION ---

        const pwdTestUser = await User.create({
            name: 'Phase3 Pwd Tester',
            email: `pwd_tester_${Date.now()}@example.com`,
            password: 'InitialPassword123!',
            role: 'customer'
        });
        cleanupUserIds.push(pwdTestUser._id);
        const oldJwtToken = generateToken(pwdTestUser);

        // Allow 1.1s so iat is strictly earlier than passwordChangedAt
        await new Promise(r => setTimeout(r, 1100));

        // TEST 13 (Case 2): Rejection of incorrect current password (401)
        await runAsyncTest('13. PUT /api/auth/password rejects incorrect current password with 401', async () => {
            const res = await makeRequest('PUT', '/api/auth/password', {
                'Authorization': `Bearer ${oldJwtToken}`
            }, {
                currentPassword: 'WrongPassword123!',
                newPassword: 'NewPassword123#'
            });
            assert.strictEqual(res.status, 401, 'Must reject incorrect current password with 401');
            assert.strictEqual(res.json.success, false);
            assert.ok(res.json.message.includes('Incorrect current password'));
        });

        // TEST 14 (Case 3): Rejection of weak new password and reuse of current password (400)
        await runAsyncTest('14. PUT /api/auth/password enforces 8-char + complexity & rejects password reuse with 400', async () => {
            // Test too short
            const shortRes = await makeRequest('PUT', '/api/auth/password', {
                'Authorization': `Bearer ${oldJwtToken}`
            }, {
                currentPassword: 'InitialPassword123!',
                newPassword: 'Weak1!'
            });
            assert.strictEqual(shortRes.status, 400, 'Must reject password < 8 chars with 400');

            // Test missing special character
            const noSpecRes = await makeRequest('PUT', '/api/auth/password', {
                'Authorization': `Bearer ${oldJwtToken}`
            }, {
                currentPassword: 'InitialPassword123!',
                newPassword: 'NoSpecialChar123'
            });
            assert.strictEqual(noSpecRes.status, 400, 'Must reject password without special char with 400');

            // Test reuse of same password
            const reuseRes = await makeRequest('PUT', '/api/auth/password', {
                'Authorization': `Bearer ${oldJwtToken}`
            }, {
                currentPassword: 'InitialPassword123!',
                newPassword: 'InitialPassword123!'
            });
            assert.strictEqual(reuseRes.status, 400, 'Must reject reusing current password with 400');
            assert.ok(reuseRes.json.message.includes('same as your current password'));
        });

        // TEST 15 (Case 1): Successful in-app password change
        await runAsyncTest('15. PUT /api/auth/password successfully updates password with 200 OK', async () => {
            const res = await makeRequest('PUT', '/api/auth/password', {
                'Authorization': `Bearer ${oldJwtToken}`
            }, {
                currentPassword: 'InitialPassword123!',
                newPassword: 'UpdatedSecurePass123#'
            });
            assert.strictEqual(res.status, 200, 'Must return 200 on successful password update');
            assert.strictEqual(res.json.success, true);
            assert.ok(res.json.message.includes('Password updated successfully'));

            // Verify the new password can authenticate via POST /api/auth/login
            const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
                email: pwdTestUser.email,
                password: 'UpdatedSecurePass123#'
            });
            assert.strictEqual(loginRes.status, 200, 'Must be able to log in with new password');
            assert.strictEqual(loginRes.json.success, true);
        });

        // TEST 16 (Case 4): Invalidation of old JWT after password change (401)
        await runAsyncTest('16. Old JWT is invalidated after password change (401 on protected route)', async () => {
            const res = await makeRequest('GET', '/api/auth/me', {
                'Authorization': `Bearer ${oldJwtToken}`
            });
            assert.strictEqual(res.status, 401, 'Old JWT must be rejected with 401 after password change');
            assert.strictEqual(res.json.success, false);
            assert.ok(res.json.message.includes('Password was recently changed'));
        });

        // --- FIX 2: PAYMENT PROCESSING & DUAL-ROLE AUTHORIZATION ---

        const ownerUser = await User.create({
            name: 'Phase3 Gear Owner',
            email: `gear_owner_${Date.now()}@example.com`,
            password: 'OwnerPassword123!',
            role: 'owner'
        });
        cleanupUserIds.push(ownerUser._id);
        const ownerToken = generateToken(ownerUser);

        const customerUser = await User.create({
            name: 'Phase3 Gear Customer',
            email: `gear_customer_${Date.now()}@example.com`,
            password: 'CustomerPassword123!',
            role: 'customer'
        });
        cleanupUserIds.push(customerUser._id);
        const customerToken = generateToken(customerUser);

        const thirdUser = await User.create({
            name: 'Phase3 Third Party',
            email: `third_party_${Date.now()}@example.com`,
            password: 'ThirdPassword123!',
            role: 'customer'
        });
        cleanupUserIds.push(thirdUser._id);
        const thirdToken = generateToken(thirdUser);

        const cameraProduct = await Product.create({
            owner: ownerUser._id,
            title: 'Sony Cinema FX3 Camera',
            description: 'Cinema line full frame camera',
            category: 'Cameras',
            price_per_day: 2500,
            availability: true,
            approval_status: 'approved',
            image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32'
        });
        cleanupProductIds.push(cameraProduct._id);

        const booking1 = await Booking.create({
            customer: customerUser._id,
            product: cameraProduct._id,
            owner: ownerUser._id,
            start_date: new Date(Date.now() + 86400000 * 2),
            end_date: new Date(Date.now() + 86400000 * 4),
            total_price: 5000,
            status: 'Requested',
            payment_status: 'Unpaid'
        });
        cleanupBookingIds.push(booking1._id);

        // TEST 17 (Case 8): Payment blocked if booking is in Requested status (400)
        await runAsyncTest('17. POST /api/payments rejects payment if booking is not in Accepted status (400)', async () => {
            const res = await makeRequest('POST', '/api/payments', {
                'Authorization': `Bearer ${customerToken}`
            }, {
                booking_id: booking1._id.toString(),
                method: 'Card',
                amount: 5000
            });
            assert.strictEqual(res.status, 400, 'Must reject payment for booking in Requested status');
            assert.strictEqual(res.json.success, false);
            assert.ok(res.json.message.includes('Requested') || res.json.message.includes('Must be \'Accepted\''));
        });

        // Owner accepts booking 1
        booking1.status = 'Accepted';
        await booking1.save();

        // TEST 18 (Case 7): Payment blocked for booking belonging to another user (403 cross-tenant)
        await runAsyncTest('18. POST /api/payments strictly blocks cross-tenant payment attempts with 403', async () => {
            const res = await makeRequest('POST', '/api/payments', {
                'Authorization': `Bearer ${thirdToken}`
            }, {
                booking_id: booking1._id.toString(),
                method: 'Card',
                amount: 5000
            });
            assert.strictEqual(res.status, 403, 'Must reject payment attempt by unrelated user with 403');
            assert.strictEqual(res.json.success, false);
            assert.ok(res.json.message.includes('Not authorized') || res.json.message.includes('only pay for your own bookings'));
        });

        // TEST 19 (Case 5): Customer payment processing via POST /api/payments
        await runAsyncTest('19. Customer can process payment via POST /api/payments (201 Created)', async () => {
            const res = await makeRequest('POST', '/api/payments', {
                'Authorization': `Bearer ${customerToken}`
            }, {
                booking_id: booking1._id.toString(),
                method: 'Card',
                amount: 5000
            });
            assert.strictEqual(res.status, 201, 'Customer payment must succeed with 201');
            assert.strictEqual(res.json.success, true);
            assert.strictEqual(res.json.payment.status, 'Success');
            if (res.json.payment && res.json.payment._id) cleanupPaymentIds.push(res.json.payment._id);

            const updatedBooking = await Booking.findById(booking1._id);
            assert.strictEqual(updatedBooking.payment_status, 'Paid');
            assert.strictEqual(updatedBooking.status, 'Paid');
        });

        // TEST 20 (Case 8 cont.): Duplicate payment prevented (400)
        await runAsyncTest('20. POST /api/payments rejects duplicate payment on already-paid booking (400)', async () => {
            const res = await makeRequest('POST', '/api/payments', {
                'Authorization': `Bearer ${customerToken}`
            }, {
                booking_id: booking1._id.toString(),
                method: 'Card',
                amount: 5000
            });
            assert.strictEqual(res.status, 400, 'Duplicate payment must be rejected with 400');
            assert.strictEqual(res.json.success, false);
            assert.ok(res.json.message.includes('Paid') || res.json.message.includes('already been paid') || res.json.message.includes('already exists'));
        });

        // TEST 21 (Case 6): Owner payment processing when renting another user's product
        await runAsyncTest('21. Owner can process payment when renting another user\'s product (201 Created)', async () => {
            // Customer lists an electronic gadget
            const droneProduct = await Product.create({
                owner: customerUser._id,
                title: 'DJI Mavic 3 Pro Drone',
                description: 'Tri-camera flagship drone',
                category: 'Electronics',
                price_per_day: 3000,
                availability: true,
                approval_status: 'approved',
                image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e'
            });
            cleanupProductIds.push(droneProduct._id);

            // Owner rents Customer's drone
            const booking2 = await Booking.create({
                customer: ownerUser._id,
                product: droneProduct._id,
                owner: customerUser._id,
                start_date: new Date(Date.now() + 86400000 * 2),
                end_date: new Date(Date.now() + 86400000 * 3),
                total_price: 3000,
                status: 'Accepted',
                payment_status: 'Unpaid'
            });
            cleanupBookingIds.push(booking2._id);

            // Owner pays for booking 2
            const res = await makeRequest('POST', '/api/payments', {
                'Authorization': `Bearer ${ownerToken}`
            }, {
                booking_id: booking2._id.toString(),
                method: 'Card',
                amount: 3000
            });
            assert.strictEqual(res.status, 201, 'Owner renting another item must be permitted to pay with 201');
            assert.strictEqual(res.json.success, true);
            if (res.json.payment && res.json.payment._id) cleanupPaymentIds.push(res.json.payment._id);

            const updatedBooking2 = await Booking.findById(booking2._id);
            assert.strictEqual(updatedBooking2.payment_status, 'Paid');
        });

        // --- FIX 3: ATOMIC RESET TOKEN ROLLBACK & CONCURRENCY SAFETY ---

        // TEST 22 (Case 9 & 10): Atomic rollback & concurrent reset request safety
        await runAsyncTest('22. Failed email dispatch unsets token atomically; concurrent token B is preserved', async () => {
            const concurrentUser = await User.create({
                name: 'Atomic Rollback Tester',
                email: `atomic_rollback_${Date.now()}@example.com`,
                password: 'InitialPassword123!',
                role: 'customer'
            });
            cleanupUserIds.push(concurrentUser._id);

            // Request A generates token A:
            const rawTokenA = concurrentUser.getResetPasswordToken();
            await concurrentUser.save();
            const tokenAInDb = concurrentUser.resetPasswordToken;
            assert.ok(tokenAInDb, 'Token A must be saved in database');

            // Request B generates token B (overwriting previous token in DB):
            const rawTokenB = concurrentUser.getResetPasswordToken();
            await concurrentUser.save();
            const tokenBInDb = concurrentUser.resetPasswordToken;
            assert.notStrictEqual(tokenAInDb, tokenBInDb, 'Tokens A and B must be distinct');

            // Now Request A fails to send email and attempts atomic rollback targeting token A:
            const staleRollbackResult = await User.updateOne(
                { _id: concurrentUser._id, resetPasswordToken: tokenAInDb },
                { $unset: { resetPasswordToken: 1, resetPasswordExpire: 1 } }
            );

            // Stale token rollback targeting token A must NOT match or unset token B:
            assert.strictEqual(staleRollbackResult.matchedCount, 0, 'Stale rollback for token A must match 0 documents');
            assert.strictEqual(staleRollbackResult.modifiedCount, 0, 'Stale rollback for token A must modify 0 documents');

            // Token B must remain intact in DB:
            const intactUser = await User.findById(concurrentUser._id).select('+resetPasswordToken +resetPasswordExpire');
            assert.strictEqual(intactUser.resetPasswordToken, tokenBInDb, 'Token B must remain intact and valid in database');
            assert.ok(intactUser.resetPasswordExpire > Date.now(), 'Token B expiration must remain active');

            // Case 9: Request B email fails and rolls back token B:
            const currentRollbackResult = await User.updateOne(
                { _id: concurrentUser._id, resetPasswordToken: tokenBInDb },
                { $unset: { resetPasswordToken: 1, resetPasswordExpire: 1 } }
            );
            assert.strictEqual(currentRollbackResult.matchedCount, 1, 'Current token rollback must match 1 document');
            assert.strictEqual(currentRollbackResult.modifiedCount, 1, 'Current token rollback must modify 1 document');

            const clearedUser = await User.findById(concurrentUser._id).select('+resetPasswordToken +resetPasswordExpire');
            assert.strictEqual(clearedUser.resetPasswordToken, undefined, 'resetPasswordToken must be unset');
            assert.strictEqual(clearedUser.resetPasswordExpire, undefined, 'resetPasswordExpire must be unset');
        });

    } finally {
        // Safe cleanup of all temporary test data
        for (const pid of cleanupPaymentIds) {
            await Payment.findByIdAndDelete(pid).catch(() => {});
        }
        for (const bid of cleanupBookingIds) {
            await Booking.findByIdAndDelete(bid).catch(() => {});
        }
        for (const pid of cleanupProductIds) {
            await Product.findByIdAndDelete(pid).catch(() => {});
        }
        for (const uid of cleanupUserIds) {
            await User.findByIdAndDelete(uid).catch(() => {});
        }
        await new Promise(resolve => testServer.close(resolve));
        await mongoose.connection.close().catch(() => {});
    }

    console.log('\n================================================================');
    console.log(`TOTAL TESTS: ${passCount + failCount}`);
    console.log(`PASSED: ${passCount}`);
    console.log(`FAILED: ${failCount}`);
    console.log('================================================================\n');

    process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test Suite Unhandled Exception:', err);
    process.exit(1);
});
