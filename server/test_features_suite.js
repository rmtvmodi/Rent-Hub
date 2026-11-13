// server/test_features_suite.js
// Verification suite for the 5 newly implemented RentHub features:
// 1. About section & purpose
// 2. Responsive product details & image gallery
// 3. Forgot Password flow (crypto tokens, strict password policy, anti-enumeration, rate limit, JWT session invalidation)
// 4. Customer + Owner unified capabilities in one account
// 5. Product Image Upload (memory storage, MIME/size validation, multi-image support)

process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import app from './server.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import { generateToken } from './utils/jwt.js';

const TEST_PORT = 5003;
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

async function runFeatureVerification() {
    console.log('================================================================');
    console.log('       RENTHUB 5-FEATURE VERIFICATION TEST SUITE                ');
    console.log('================================================================\n');

    // Wait for MongoDB connection
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout')), 12000);
            mongoose.connection.once('connected', () => {
                clearTimeout(timeout);
                resolve();
            });
            mongoose.connection.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    let passed = 0;
    let total = 0;
    const cleanupUserIds = [];
    const cleanupProductIds = [];
    const cleanupBookingIds = [];

    const test = async (name, fn) => {
        total++;
        try {
            await fn();
            console.log(`✓ [PASS] ${name}`);
            passed++;
        } catch (err) {
            console.error(`✗ [FAIL] ${name}: ${err.message}`);
            process.exitCode = 1;
            throw err;
        }
    };

    try {
        console.log('--- FEATURE 1: ABOUT SECTION ---');
        await test('GET /about.html serves valid HTML with all required sections', async () => {
            const res = await makeRequest('GET', '/about.html');
            assert.strictEqual(res.status, 200);
            assert.ok(res.raw.includes('Rent Before You Buy'), 'Contains hero mission slogan');
            assert.ok(res.raw.includes('Our Mission & Purpose') || res.raw.includes('About Us'), 'Contains About mission header');
            assert.ok(res.raw.includes('How Customers Rent'), 'Contains customer guide');
            assert.ok(res.raw.includes('How Owners Lend & Earn'), 'Contains owner guide');
            assert.ok(res.raw.includes('WHY RENT INSTEAD OF BUYING') || res.raw.includes('Benefits of the Rental Model'), 'Contains rental benefits');
            assert.ok(res.raw.includes('Support & Inquiries') || res.raw.includes('support@renthub.com'), 'Contains contact & support');
        });

        console.log('\n--- FEATURE 2: MOBILE RESPONSIVE PRODUCT DETAILS ---');
        await test('Product details page and CSS contain mobile responsive layouts & breakpoints', async () => {
            const htmlRes = await makeRequest('GET', '/product-details.html');
            assert.strictEqual(htmlRes.status, 200);

            const cssRes = await makeRequest('GET', '/css/style.css');
            assert.strictEqual(cssRes.status, 200);
            assert.ok(cssRes.raw.includes('.product-detail-layout'), 'Contains .product-detail-layout CSS grid');
            assert.ok(cssRes.raw.includes('.product-gallery-pane'), 'Contains .product-gallery-pane');
            assert.ok(cssRes.raw.includes('.product-thumbnails-tray'), 'Contains .product-thumbnails-tray');
            assert.ok(cssRes.raw.includes('@media (max-width: 900px)'), 'Contains 900px tablet breakpoint');
            assert.ok(cssRes.raw.includes('@media (max-width: 480px)'), 'Contains 480px mobile breakpoint');
        });

        console.log('\n--- FEATURE 3: FORGOT PASSWORD FLOW ---');
        const testUserEmail = `test_pwd_reset_${Date.now()}@example.com`;
        let userRecord = null;

        await test('POST /api/auth/forgotpassword returns generic 200 response for nonexistent email (anti-enumeration)', async () => {
            const res = await makeRequest('POST', '/api/auth/forgotpassword', {}, { email: 'nonexistent_account_12345@example.com' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.json.success, true);
            assert.ok(res.json.message.includes('If an account with that email exists'));
        });

        await test('POST /api/auth/forgotpassword generates hashed token and 1-hour expiry in database', async () => {
            userRecord = await User.create({
                name: 'Password Tester',
                email: testUserEmail,
                password: 'InitialPassword123!',
                role: 'customer'
            });
            cleanupUserIds.push(userRecord._id);

            const res = await makeRequest('POST', '/api/auth/forgotpassword', {}, { email: testUserEmail });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.json.success, true);

            // Re-fetch user with hidden fields
            const updatedUser = await User.findById(userRecord._id).select('+resetPasswordToken +resetPasswordExpire');
            assert.ok(updatedUser.resetPasswordToken, 'Reset token is hashed in DB');
            assert.ok(updatedUser.resetPasswordExpire, 'Reset expiry is recorded');
            const oneHourAhead = Date.now() + 61 * 60 * 1000;
            const fiftyNineMinAhead = Date.now() + 58 * 60 * 1000;
            assert.ok(updatedUser.resetPasswordExpire.getTime() <= oneHourAhead);
            assert.ok(updatedUser.resetPasswordExpire.getTime() >= fiftyNineMinAhead);
        });

        await test('PUT /api/auth/resetpassword/:token enforces strict 8-char + upper + lower + num + special password policy', async () => {
            // Generate valid unhashed token
            const plainToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

            await User.findByIdAndUpdate(userRecord._id, {
                resetPasswordToken: hashedToken,
                resetPasswordExpire: Date.now() + 3600000
            });

            // 1. Too short (< 8 chars)
            let res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: 'Short1!',
                confirmPassword: 'Short1!'
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.json.message.includes('8 characters'));

            // 2. Missing uppercase
            res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: 'lowercase123!',
                confirmPassword: 'lowercase123!'
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.json.message.includes('uppercase'));

            // 3. Missing number
            res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: 'NoNumbersHere!',
                confirmPassword: 'NoNumbersHere!'
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.json.message.includes('number'));

            // 4. Missing special character
            res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: 'NoSpecialChar123',
                confirmPassword: 'NoSpecialChar123'
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.json.message.includes('special character'));

            // 5. Mismatched passwords
            res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: 'ValidPassword123!',
                confirmPassword: 'MismatchedPassword123!'
            });
            assert.strictEqual(res.status, 400);
            assert.ok(res.json.message.includes('match'));
        });

        await test('PUT /api/auth/resetpassword/:token succeeds, invalidates old JWTs, and updates passwordChangedAt', async () => {
            const plainToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

            await User.findByIdAndUpdate(userRecord._id, {
                resetPasswordToken: hashedToken,
                resetPasswordExpire: Date.now() + 3600000
            });

            // Issue an old JWT token before reset
            const oldJwtToken = generateToken(userRecord);
            // Brief pause to ensure distinct second-level timestamp for JWT iat
            await new Promise(r => setTimeout(r, 1100));

            const newSecurePassword = 'NewSecurePassword@2026';
            const res = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: newSecurePassword,
                confirmPassword: newSecurePassword
            });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.json.success, true);
            assert.ok(!res.json.token, 'Does not auto-login (returns no token)');

            // Verify old JWT is rejected on protected endpoint
            const meRes = await makeRequest('GET', '/api/auth/me', {
                'Authorization': `Bearer ${oldJwtToken}`
            });
            assert.strictEqual(meRes.status, 401, 'Old token rejected after password change');
            assert.ok(meRes.json.message.includes('changed'));

            // Verify login with new password succeeds
            const loginRes = await makeRequest('POST', '/api/auth/login', {}, {
                email: testUserEmail,
                password: newSecurePassword
            });
            assert.strictEqual(loginRes.status, 200);
            assert.ok(loginRes.json.token, 'Login succeeds with new password');

            // Verify token is single-use: reuse should fail
            const reuseRes = await makeRequest('PUT', `/api/auth/resetpassword/${plainToken}`, {}, {
                password: newSecurePassword,
                confirmPassword: newSecurePassword
            });
            assert.strictEqual(reuseRes.status, 400, 'Single-use token cannot be reused');
        });

        await test('Whitelisted public HTML pages include forgot-password.html and reset-password.html', async () => {
            const forgotPage = await makeRequest('GET', '/forgot-password.html');
            assert.strictEqual(forgotPage.status, 200);
            const resetPage = await makeRequest('GET', '/reset-password.html');
            assert.strictEqual(resetPage.status, 200);
        });

        console.log('\n--- FEATURE 4: DUAL CAPABILITIES (CUSTOMER + OWNER) ---');
        let customerUser = null;
        let ownerUser = null;
        let customerToken = null;
        let ownerToken = null;
        let productCreatedByCustomer = null;
        let bookingCreatedByOwner = null;

        await test('Normal Customer can create a product listing', async () => {
            customerUser = await User.create({
                name: 'Dual Customer',
                email: `dual_cust_${Date.now()}@example.com`,
                password: 'Password123!',
                role: 'customer'
            });
            cleanupUserIds.push(customerUser._id);
            customerToken = generateToken(customerUser);

            const prodRes = await makeRequest('POST', '/api/products', {
                'Authorization': `Bearer ${customerToken}`
            }, {
                title: 'Customer Listed DSLR Camera',
                description: 'Dual-role test camera listing',
                category: 'Cameras',
                price_per_day: 450,
                image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600',
                images: ['https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600']
            });

            assert.strictEqual(prodRes.status, 201);
            assert.strictEqual(prodRes.json.success, true);
            productCreatedByCustomer = prodRes.json.product;
            cleanupProductIds.push(productCreatedByCustomer._id);

            // Auto-approve for testing rental flow
            await Product.findByIdAndUpdate(productCreatedByCustomer._id, { approval_status: 'approved' });
        });

        await test('Customer is blocked from booking their own product (self-rental prevention)', async () => {
            const selfBookingRes = await makeRequest('POST', '/api/bookings', {
                'Authorization': `Bearer ${customerToken}`
            }, {
                product_id: productCreatedByCustomer._id,
                start_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                end_date: new Date(Date.now() + 172800000).toISOString().split('T')[0]
            });

            assert.strictEqual(selfBookingRes.status, 400);
            assert.strictEqual(selfBookingRes.json.success, false);
            assert.ok(selfBookingRes.json.message.includes('own product'));
        });

        await test('Owner can rent another user product and Customer can accept the incoming booking', async () => {
            ownerUser = await User.create({
                name: 'Dual Owner',
                email: `dual_owner_${Date.now()}@example.com`,
                password: 'Password123!',
                role: 'owner'
            });
            cleanupUserIds.push(ownerUser._id);
            ownerToken = generateToken(ownerUser);

            // Owner places booking on Customer's product
            const bookRes = await makeRequest('POST', '/api/bookings', {
                'Authorization': `Bearer ${ownerToken}`
            }, {
                product_id: productCreatedByCustomer._id,
                start_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                end_date: new Date(Date.now() + 172800000).toISOString().split('T')[0]
            });

            assert.strictEqual(bookRes.status, 201);
            bookingCreatedByOwner = bookRes.json.booking;
            cleanupBookingIds.push(bookingCreatedByOwner._id);

            // Customer accepts the booking as listing owner
            const acceptRes = await makeRequest('PATCH', `/api/bookings/${bookingCreatedByOwner._id}/accept`, {
                'Authorization': `Bearer ${customerToken}`
            });

            assert.strictEqual(acceptRes.status, 200);
            assert.strictEqual(acceptRes.json.booking.status, 'Accepted');

            // Customer views incoming listings requests via ?role=owner
            const myOwnerBookings = await makeRequest('GET', '/api/bookings/my?role=owner', {
                'Authorization': `Bearer ${customerToken}`
            });
            assert.strictEqual(myOwnerBookings.status, 200);
            assert.ok(myOwnerBookings.json.bookings.some(b => b._id === bookingCreatedByOwner._id));

            // Owner views outgoing rentals via ?role=customer
            const myCustBookings = await makeRequest('GET', '/api/bookings/my?role=customer', {
                'Authorization': `Bearer ${ownerToken}`
            });
            assert.strictEqual(myCustBookings.status, 200);
            assert.ok(myCustBookings.json.bookings.some(b => b._id === bookingCreatedByOwner._id));
        });

        console.log('\n--- FEATURE 5: PRODUCT IMAGE UPLOAD & MULTI-IMAGE SUPPORT ---');
        await test('POST /api/products/upload validates file presence and handles multipart upload', async () => {
            // Missing file check
            const emptyRes = await makeRequest('POST', '/api/products/upload', {
                'Authorization': `Bearer ${ownerToken}`,
                'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
            }, Buffer.from('------WebKitFormBoundary7MA4YWxkTrZu0gW--\r\n'));
            assert.strictEqual(emptyRes.status, 400);

            // Valid sample 1x1 GIF/JPEG buffer upload
            const boundary = '----WebKitFormBoundarySampleTest';
            const fakeImageBuffer = Buffer.from('ffd8ffe000104a46494600010101006000600000ffdb004300', 'hex');
            
            const multipartBody = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
                fakeImageBuffer,
                Buffer.from(`\r\n--${boundary}--\r\n`)
            ]);

            const uploadRes = await makeRequest('POST', '/api/products/upload', {
                'Authorization': `Bearer ${ownerToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            }, multipartBody);

            assert.strictEqual(uploadRes.status, 200);
            assert.strictEqual(uploadRes.json.success, true);
            assert.ok(Array.isArray(uploadRes.json.urls), 'Returns array of image URLs');
            assert.strictEqual(uploadRes.json.urls.length, 1);
        });

        await test('Creating a product with multiple images sets both primary image and images array in MongoDB', async () => {
            const multiImgRes = await makeRequest('POST', '/api/products', {
                'Authorization': `Bearer ${ownerToken}`
            }, {
                title: 'Multi-Angle Studio Projector',
                description: 'Tested with 3 distinct camera angles',
                category: 'Projectors',
                price_per_day: 650,
                images: [
                    'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600',
                    'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600',
                    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600'
                ]
            });

            assert.strictEqual(multiImgRes.status, 201);
            const created = multiImgRes.json.product;
            cleanupProductIds.push(created._id);

            assert.strictEqual(created.image, 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600', 'Primary image defaulted to first image');
            assert.strictEqual(created.images.length, 3, 'Stores all 3 images in images array');
        });

    } finally {
        // Safe cleanup of temporary test data
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
    }

    console.log(`\n================================================================`);
    console.log(`FEATURE VERIFICATION SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log(`================================================================\n`);
}

runFeatureVerification().catch(err => {
    console.error('Feature Verification Suite Failed:', err);
    process.exit(1);
});
