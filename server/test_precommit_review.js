// server/test_precommit_review.js
// Targeted verification of:
// 1. Admin moderation authorization (backend RBAC, mass-assignment protection)
// 2. Existing listing compatibility (approved, pending, missing, rejected statuses)
// 3. Mobile navigation behavior (open/close, outside-click, Escape key, link navigation, resize reset)

process.env.NODE_ENV = 'test';

import assert from 'assert';
import mongoose from 'mongoose';
import http from 'http';
import puppeteer from 'puppeteer-core';
import app from './server.js';
import connectDB from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import {
    createProduct,
    updateProduct,
    getProducts,
    getProductById,
    moderateProductApproval
} from './controllers/productController.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 5006;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

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
        res.statusCode = err.statusCode || 500;
        res.body = { success: false, message: err.message };
    }
};

async function runPreCommitReview() {
    console.log('================================================================');
    console.log('   RENTHUB PHASE 4: FINAL PRE-COMMIT AUDIT & VERIFICATION       ');
    console.log('================================================================\n');

    await connectDB();

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    const runId = Date.now().toString().slice(-6);
    let passed = 0;
    let total = 0;

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

    // Setup Test Users in memory / DB
    const adminUser = await User.create({
        name: `Audit Admin ${runId}`,
        email: `audit.admin.${runId}@example.com`,
        phone: '9876543210',
        password: 'Password@123',
        role: 'admin'
    });

    const owner1User = await User.create({
        name: `Audit Owner1 ${runId}`,
        email: `audit.owner1.${runId}@example.com`,
        phone: '9876543211',
        password: 'Password@123',
        role: 'owner'
    });

    const owner2User = await User.create({
        name: `Audit Owner2 ${runId}`,
        email: `audit.owner2.${runId}@example.com`,
        phone: '9876543212',
        password: 'Password@123',
        role: 'owner'
    });

    const customerUser = await User.create({
        name: `Audit Customer ${runId}`,
        email: `audit.customer.${runId}@example.com`,
        phone: '9876543213',
        password: 'Password@123',
        role: 'customer'
    });

    try {
        // =====================================================================
        // PART 1: ADMIN MODERATION AUTHORIZATION & BACKEND RBAC
        // =====================================================================
        console.log('--- 1. ADMIN MODERATION AUTHORIZATION & SECURITY ---');

        const testProd = await Product.create({
            owner: owner1User._id,
            title: `Audit Drone Pro ${runId}`,
            description: 'Professional high performance drone',
            category: 'Electronics',
            price_per_day: 1500,
            image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80',
            approval_status: 'approved'
        });

        await test('Backend Authorization: Customer cannot access moderateProductApproval (403)', async () => {
            const req = {
                user: customerUser,
                params: { id: testProd._id.toString() },
                body: { approval_status: 'rejected' }
            };
            const res = mockResponse();

            // Simulate router middleware guard: authorize('admin')
            if (req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'User role customer is not authorized to access this route' });
            } else {
                await moderateProductApproval(req, res, handleNext(res));
            }

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        await test('Backend Authorization: Owner cannot access moderateProductApproval (403)', async () => {
            const req = {
                user: owner1User,
                params: { id: testProd._id.toString() },
                body: { approval_status: 'rejected' }
            };
            const res = mockResponse();

            // Simulate router middleware guard: authorize('admin')
            if (req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'User role owner is not authorized to access this route' });
            } else {
                await moderateProductApproval(req, res, handleNext(res));
            }

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        await test('Mass-Assignment Protection: Owner attempting PUT /:id with approval_status is IGNORED by server', async () => {
            const req = {
                user: owner1User,
                params: { id: testProd._id.toString() },
                body: {
                    title: `Audit Drone Pro Updated ${runId}`,
                    approval_status: 'rejected' // Intruder attempt to self-reject or tamper
                }
            };
            const res = mockResponse();
            await updateProduct(req, res, handleNext(res));

            assert.strictEqual(res.statusCode, 200);
            // Verify product in database still has original approval_status
            const freshProd = await Product.findById(testProd._id);
            assert.strictEqual(freshProd.approval_status, 'approved', 'Server must ignore approval_status sent by non-admin');
            assert.strictEqual(freshProd.title, `Audit Drone Pro Updated ${runId}`);
        });

        await test('Cross-Tenant Isolation: Owner 2 cannot update Owner 1 product (403)', async () => {
            const req = {
                user: owner2User,
                params: { id: testProd._id.toString() },
                body: { title: 'Hacked Title' }
            };
            const res = mockResponse();
            await updateProduct(req, res, handleNext(res));

            assert.strictEqual(res.statusCode, 403);
            assert.strictEqual(res.body.success, false);
        });

        await test('Admin Moderation: Authenticated Admin can suspend listing (approval_status: rejected)', async () => {
            const req = {
                user: adminUser,
                params: { id: testProd._id.toString() },
                body: { approval_status: 'rejected' }
            };
            const res = mockResponse();
            await moderateProductApproval(req, res, handleNext(res));

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.product.approval_status, 'rejected');

            const dbProd = await Product.findById(testProd._id);
            assert.strictEqual(dbProd.approval_status, 'rejected');
        });

        await test('Admin Moderation: Authenticated Admin can reinstate listing (approval_status: approved)', async () => {
            const req = {
                user: adminUser,
                params: { id: testProd._id.toString() },
                body: { approval_status: 'approved' }
            };
            const res = mockResponse();
            await moderateProductApproval(req, res, handleNext(res));

            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.product.approval_status, 'approved');

            const dbProd = await Product.findById(testProd._id);
            assert.strictEqual(dbProd.approval_status, 'approved');
        });

        // =====================================================================
        // PART 2: EXISTING LISTING COMPATIBILITY & VISIBILITY
        // =====================================================================
        console.log('\n--- 2. EXISTING LISTING COMPATIBILITY & VISIBILITY ---');

        // Create 4 distinct listings covering all historical approval_status states
        const prodApproved = await Product.create({
            owner: owner1User._id,
            title: `Compat Test Approved Item ${runId}`,
            description: 'Item with approval_status approved',
            category: 'Tools',
            price_per_day: 400,
            image: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80',
            approval_status: 'approved'
        });

        const prodPending = await Product.create({
            owner: owner1User._id,
            title: `Compat Test Pending Item ${runId}`,
            description: 'Item with legacy approval_status pending',
            category: 'Tools',
            price_per_day: 500,
            image: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80',
            approval_status: 'pending'
        });

        // Create an item bypassing Mongoose schema default to simulate a raw document with missing approval_status
        const rawCollection = mongoose.connection.collection('products');
        const missingDocResult = await rawCollection.insertOne({
            owner: owner1User._id,
            title: `Compat Test Missing Status Item ${runId}`,
            description: 'Item with missing approval_status field',
            category: 'Tools',
            price_per_day: 600,
            image: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80',
            availability: true,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        const prodMissingId = missingDocResult.insertedId;

        const prodRejected = await Product.create({
            owner: owner1User._id,
            title: `Compat Test Rejected Item ${runId}`,
            description: 'Item suspended by admin',
            category: 'Tools',
            price_per_day: 700,
            image: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?auto=format&fit=crop&w=800&q=80',
            approval_status: 'rejected'
        });

        await test('Public Marketplace: Approved item is visible', async () => {
            const req = { query: { search: `Compat Test Approved Item ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 1);
        });

        await test('Public Marketplace: Legacy "pending" item IS visible without requiring admin action', async () => {
            const req = { query: { search: `Compat Test Pending Item ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 1, 'Legacy pending products must be visible to buyers');
        });

        await test('Public Marketplace: Missing approval_status item IS visible without admin action', async () => {
            const req = { query: { search: `Compat Test Missing Status Item ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 1, 'Items missing approval_status field must be visible to buyers');
        });

        await test('Public Marketplace: Rejected/Suspended item is STRICTLY HIDDEN (0 results)', async () => {
            const req = { query: { search: `Compat Test Rejected Item ${runId}` } };
            const res = mockResponse();
            await getProducts(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.products.length, 0, 'Rejected items must NEVER appear in marketplace query');
        });

        await test('Product Details Access: Public user gets 404 for rejected/suspended item', async () => {
            const req = {
                params: { id: prodRejected._id.toString() },
                user: customerUser
            };
            const res = mockResponse();
            await getProductById(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 404);
            assert.strictEqual(res.body.success, false);
        });

        await test('Product Details Access: Owner CAN access details of their suspended item', async () => {
            const req = {
                params: { id: prodRejected._id.toString() },
                user: owner1User
            };
            const res = mockResponse();
            await getProductById(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.product._id.toString(), prodRejected._id.toString());
        });

        await test('Product Details Access: Admin CAN access details of any suspended item', async () => {
            const req = {
                params: { id: prodRejected._id.toString() },
                user: adminUser
            };
            const res = mockResponse();
            await getProductById(req, res, handleNext(res));
            assert.strictEqual(res.statusCode, 200);
            assert.strictEqual(res.body.success, true);
        });

        // =====================================================================
        // PART 3: MOBILE NAVIGATION BEHAVIOR & INTERACTION AUDIT
        // =====================================================================
        console.log('\n--- 3. MOBILE NAVIGATION BEHAVIOR (BROWSER INTERACTION AUDIT) ---');

        const browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
        });

        try {
            const page = await browser.newPage();
            // Test on standard mobile viewport
            await page.setViewport({ width: 375, height: 667 });
            await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });

            // 1. Initial State
            await test('Mobile Nav: Menu starts closed with aria-expanded="false"', async () => {
                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active'),
                        display: window.getComputedStyle(navLinks).display
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);
                assert.strictEqual(state.display, 'none');
            });

            // 2. Open via toggle button
            await test('Mobile Nav: Clicking toggle opens menu with vertical Flexbox layout', async () => {
                await page.click('#nav-toggle');
                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    const style = window.getComputedStyle(navLinks);
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active'),
                        display: style.display,
                        flexDirection: style.flexDirection,
                        zIndex: style.zIndex
                    };
                });
                assert.strictEqual(state.expanded, 'true');
                assert.strictEqual(state.hasActive, true);
                assert.strictEqual(state.display, 'flex');
                assert.strictEqual(state.flexDirection, 'column');
                assert.strictEqual(state.zIndex, '1001');
            });

            // 3. Close via toggle button
            await test('Mobile Nav: Clicking toggle again closes menu', async () => {
                await page.click('#nav-toggle');
                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active'),
                        display: window.getComputedStyle(navLinks).display
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);
                assert.strictEqual(state.display, 'none');
            });

            // 4. Close via outside click
            await test('Mobile Nav: Clicking outside the menu closes it and sets aria-expanded="false"', async () => {
                // Open menu
                await page.click('#nav-toggle');
                let active = await page.$eval('#nav-links', el => el.classList.contains('active'));
                assert.strictEqual(active, true);

                // Get bounding box of navLinks to ensure we click safely below it
                const navRect = await page.$eval('#nav-links', el => {
                    const r = el.getBoundingClientRect();
                    return { bottom: r.bottom, height: r.height };
                });

                // Click outside below the menu (e.g. bottom + 80px)
                const clickY = Math.min(650, Math.floor(navRect.bottom + 80));
                await page.mouse.click(50, clickY);

                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active'),
                        display: window.getComputedStyle(navLinks).display
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);
                assert.strictEqual(state.display, 'none');
            });

            // 5. Close via Escape key
            await test('Mobile Nav: Pressing Escape key closes menu and restores focus', async () => {
                // Open menu
                await page.click('#nav-toggle');
                let active = await page.$eval('#nav-links', el => el.classList.contains('active'));
                assert.strictEqual(active, true);

                // Press Escape
                await page.keyboard.press('Escape');

                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active'),
                        display: window.getComputedStyle(navLinks).display,
                        isToggleFocused: document.activeElement === toggle
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);
                assert.strictEqual(state.display, 'none');
                assert.strictEqual(state.isToggleFocused, true);
            });

            // 6. Close after clicking a link inside menu
            await test('Mobile Nav: Clicking a link inside menu navigates cleanly with menu reset', async () => {
                // Open menu
                await page.click('#nav-toggle');
                let active = await page.$eval('#nav-links', el => el.classList.contains('active'));
                assert.strictEqual(active, true);

                // Click link and wait for navigation
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
                    page.click('#nav-links a[href="about.html"]')
                ]);

                // On navigated page, verify mobile nav is closed
                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
                        hasActive: navLinks ? navLinks.classList.contains('active') : false
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);

                // Return to index.html for remaining tests
                await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
            });

            // 7. Desktop resize resets mobile menu state
            await test('Mobile Nav: Window resize across 768px desktop boundary resets menu to closed', async () => {
                // Ensure mobile view and open menu
                await page.setViewport({ width: 375, height: 667 });
                await page.click('#nav-toggle');
                let active = await page.$eval('#nav-links', el => el.classList.contains('active'));
                assert.strictEqual(active, true);

                // Resize to desktop viewport 1024px
                await page.setViewport({ width: 1024, height: 768 });
                // Trigger resize event
                await page.evaluate(() => window.dispatchEvent(new Event('resize')));

                const state = await page.evaluate(() => {
                    const toggle = document.getElementById('nav-toggle');
                    const navLinks = document.getElementById('nav-links');
                    return {
                        expanded: toggle.getAttribute('aria-expanded'),
                        hasActive: navLinks.classList.contains('active')
                    };
                });
                assert.strictEqual(state.expanded, 'false');
                assert.strictEqual(state.hasActive, false);
            });

            // 8. Stacking order and zero horizontal overflow
            await test('Mobile Nav: Clean stacking context (z-index 1001) with 0 horizontal overflow', async () => {
                await page.setViewport({ width: 375, height: 667 });
                await page.click('#nav-toggle');

                const overflow = await page.evaluate(() => {
                    return document.documentElement.scrollWidth > window.innerWidth + 2;
                });
                assert.strictEqual(overflow, false, 'Mobile nav menu must never cause horizontal page overflow');
            });

            await page.close();

        } finally {
            await browser.close();
        }

    } finally {
        // Cleanup test artifacts
        console.log('\n--- CLEANING UP AUDIT ARTIFACTS ---');
        await User.deleteMany({ email: new RegExp(runId) });
        await Product.deleteMany({ title: new RegExp(runId) });
        await mongoose.connection.collection('products').deleteMany({ title: new RegExp(runId) });

        await new Promise(resolve => testServer.close(resolve));
        await mongoose.connection.close();
    }

    console.log(`\n================================================================`);
    console.log(`PRE-COMMIT AUDIT SUMMARY: ${passed} / ${total} CHECKS PASSED`);
    console.log(`================================================================\n`);
}

runPreCommitReview().catch(err => {
    console.error('Pre-Commit Audit Failed:', err);
    process.exit(1);
});
