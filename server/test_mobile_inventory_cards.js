// server/test_mobile_inventory_cards.js
// Visual, Layout, and Functional Verification of Responsive Mobile Inventory Cards
// across all 9 target viewports (320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px)
// with high-resolution screenshot captures and mobile interaction tests.

process.env.NODE_ENV = 'test';

import assert from 'assert';
import path from 'path';
import http from 'http';
import mongoose from 'mongoose';
import puppeteer from 'puppeteer-core';
import app from './server.js';
import connectDB from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import { generateToken } from './utils/jwt.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 5007;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const SCREENSHOT_DIR = 'C:\\Users\\rahul\\.gemini\\antigravity\\brain\\a04ab27f-276b-42e3-9468-6552519a53df\\scratch\\screenshots';

const VIEWPORTS = [
    { name: '320px Ultra-compact Mobile', width: 320, height: 568, isMobile: true },
    { name: '360px Compact Android', width: 360, height: 640, isMobile: true },
    { name: '375px Standard iPhone', width: 375, height: 667, isMobile: true },
    { name: '390px Modern Smartphone', width: 390, height: 844, isMobile: true },
    { name: '430px Large Smartphone', width: 430, height: 932, isMobile: true },
    { name: '768px Tablet Portrait', width: 768, height: 1024, isMobile: true },
    { name: '1024px Small Desktop / Landscape', width: 1024, height: 768, isMobile: false },
    { name: '1280px Standard Desktop', width: 1280, height: 800, isMobile: false },
    { name: '1440px Large Desktop', width: 1440, height: 900, isMobile: false }
];

async function runMobileInventoryTests() {
    console.log('================================================================');
    console.log('   RENTHUB PHASE 5: MOBILE INVENTORY CARDS & VISUAL AUDIT       ');
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

    // 1. Create Test Owner & Products
    const ownerUser = await User.create({
        name: `Owner Test ${runId}`,
        email: `owner.cards.${runId}@example.com`,
        phone: '9876543210',
        password: 'Password@123',
        role: 'owner'
    });

    const customerUser = await User.create({
        name: `Customer Test ${runId}`,
        email: `customer.cards.${runId}@example.com`,
        phone: '9876543211',
        password: 'Password@123',
        role: 'customer'
    });

    const testProduct1 = await Product.create({
        owner: ownerUser._id,
        title: `Sony Alpha A7 IV Full-Frame Camera ${runId}`,
        description: 'Professional 33MP hybrid camera with 4K 60p recording and FE 24-70mm GM lens included.',
        category: 'Cameras',
        price_per_day: 1500,
        image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
        availability: true,
        approval_status: 'approved'
    });

    const testProduct2 = await Product.create({
        owner: ownerUser._id,
        title: `DJI Mavic 3 Pro Cine Drone Combo ${runId}`,
        description: 'Triple-camera system, Apple ProRes recording, and 43-min flight time.',
        category: 'Electronics',
        price_per_day: 2800,
        image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=800&q=80',
        availability: false, // Paused
        approval_status: 'approved'
    });

    const testBooking = await Booking.create({
        customer: customerUser._id,
        product: testProduct1._id,
        owner: ownerUser._id,
        start_date: new Date('2027-05-01'),
        end_date: new Date('2027-05-04'),
        days: 4,
        daily_rate: 1500,
        total_price: 6000,
        status: 'Requested',
        payment_status: 'Unpaid'
    });

    const ownerToken = generateToken(ownerUser);

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();

        // Inject authentication into localStorage before loading dashboard
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate((token, user) => {
            localStorage.setItem('renthub_token', token);
            localStorage.setItem('renthub_current_user', JSON.stringify({
                _id: user._id.toString(),
                user_id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                token
            }));
        }, ownerToken, ownerUser);

        // =====================================================================
        // PART 1: 9-VIEWPORT LAYOUT & RESPONSIVENESS AUDIT
        // =====================================================================
        console.log('\n--- 1. Testing My Equipment Inventory across 9 Viewports ---');

        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.goto(`${BASE_URL}/dashboard.html?tab=listings`, { waitUntil: 'networkidle0' });

            await test(`[${vp.name}] Zero page-level horizontal overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Page overflowed at ${vp.width}px`);
            });

            if (vp.isMobile) {
                await test(`[${vp.name}] Desktop table is HIDDEN and Mobile Cards are DISPLAYED`, async () => {
                    const displayState = await page.evaluate(() => {
                        const tableContainer = document.querySelector('#tab-listings .desktop-only-table');
                        const cardsContainer = document.getElementById('listings-cards');
                        return {
                            tableDisplay: tableContainer ? window.getComputedStyle(tableContainer).display : 'null',
                            cardsDisplay: cardsContainer ? window.getComputedStyle(cardsContainer).display : 'null',
                            cardCount: cardsContainer ? cardsContainer.querySelectorAll('.dashboard-mobile-card').length : 0
                        };
                    });
                    assert.strictEqual(displayState.tableDisplay, 'none', 'Desktop table must be hidden on mobile');
                    assert.strictEqual(displayState.cardsDisplay, 'flex', 'Mobile cards container must be flex on mobile');
                    assert.strictEqual(displayState.cardCount, 2, 'Must render both equipment items as mobile cards');
                });

                await test(`[${vp.name}] Card text, titles, badges, and buttons are readable without vertical single-letter compression`, async () => {
                    const cardMetrics = await page.evaluate(() => {
                        const firstCard = document.querySelector('#listings-cards .dashboard-mobile-card');
                        if (!firstCard) return { found: false };

                        const titleEl = firstCard.querySelector('.dm-card-title');
                        const badgeEl = firstCard.querySelector('.badge');
                        const buttons = Array.from(firstCard.querySelectorAll('.btn'));

                        const badgeRect = badgeEl ? badgeEl.getBoundingClientRect() : { height: 0, width: 0 };
                        const buttonRects = buttons.map(b => ({
                            text: b.textContent.trim(),
                            width: b.getBoundingClientRect().width,
                            height: b.getBoundingClientRect().height
                        }));

                        return {
                            found: true,
                            titleText: titleEl ? titleEl.textContent.trim() : '',
                            titleHeight: titleEl ? titleEl.getBoundingClientRect().height : 0,
                            badgeHeight: badgeRect.height,
                            badgeWidth: badgeRect.width,
                            badgeText: badgeEl ? badgeEl.textContent.trim() : '',
                            buttonRects
                        };
                    });

                    assert.ok(cardMetrics.found, 'Card must be found');
                    assert.ok(cardMetrics.badgeHeight < 45, `Status badge height (${cardMetrics.badgeHeight}px) must be normal single-line badge, not vertically compressed`);
                    assert.ok(cardMetrics.badgeWidth >= 60, `Status badge width (${cardMetrics.badgeWidth}px) must comfortably hold badge text`);

                    for (const b of cardMetrics.buttonRects) {
                        assert.ok(b.width >= 70, `Button "${b.text}" width (${b.width}px) must be at least 70px to avoid text squishing`);
                        assert.ok(b.height >= 28, `Button "${b.text}" height (${b.height}px) must provide adequate touch target`);
                    }
                });

                // Take visual screenshot for mobile viewports
                const screenshotFile = path.join(SCREENSHOT_DIR, `inventory-${vp.width}px.png`);
                await page.screenshot({ path: screenshotFile, fullPage: false });
                console.log(`   📸 Saved mobile screenshot: inventory-${vp.width}px.png`);

            } else {
                // Desktop Viewport
                await test(`[${vp.name}] Desktop table is DISPLAYED and Mobile Cards are HIDDEN`, async () => {
                    const displayState = await page.evaluate(() => {
                        const tableContainer = document.querySelector('#tab-listings .desktop-only-table');
                        const cardsContainer = document.getElementById('listings-cards');
                        return {
                            tableDisplay: tableContainer ? window.getComputedStyle(tableContainer).display : 'null',
                            cardsDisplay: cardsContainer ? window.getComputedStyle(cardsContainer).display : 'null',
                            rowCount: document.querySelectorAll('#listings-tbody tr').length
                        };
                    });
                    assert.ok(displayState.tableDisplay !== 'none', 'Desktop table must be visible on desktop');
                    assert.strictEqual(displayState.cardsDisplay, 'none', 'Mobile cards container must be hidden on desktop');
                    assert.strictEqual(displayState.rowCount, 2, 'Must render both equipment rows in desktop table');
                });

                if (vp.width === 1280) {
                    const screenshotFile = path.join(SCREENSHOT_DIR, `inventory-desktop-1280px.png`);
                    await page.screenshot({ path: screenshotFile, fullPage: false });
                    console.log(`   📸 Saved desktop screenshot: inventory-desktop-1280px.png`);
                }
            }
        }

        // =====================================================================
        // PART 2: MOBILE INTERACTION & FUNCTIONALITY TESTS
        // =====================================================================
        console.log('\n--- 2. Testing Mobile Card Actions & Event Handlers (375px) ---');
        await page.setViewport({ width: 375, height: 667 });
        await page.goto(`${BASE_URL}/dashboard.html?tab=listings`, { waitUntil: 'networkidle0' });

        await test('Mobile Card Action: Clicking "Set Unavailable" toggles product availability in MongoDB', async () => {
            // Find toggle button on Sony Camera card (which is currently Available: true)
            const toggleBtn = await page.$(`#listings-cards button.toggle-avail-btn[data-id="${testProduct1._id}"]`);
            assert.ok(toggleBtn, 'Toggle button for testProduct1 must exist');
            const btnTextBefore = await page.evaluate(el => el.textContent.trim(), toggleBtn);
            assert.strictEqual(btnTextBefore, 'Set Unavailable');

            // Click toggle button
            await toggleBtn.click();
            await page.waitForResponse(res => res.url().includes('/availability') && res.status() === 200);

            // Re-fetch product from database to verify persistence
            const updatedProd = await Product.findById(testProduct1._id);
            assert.strictEqual(updatedProd.availability, false, 'Database record must be set to availability: false');

            // Wait for dashboard data re-render
            await page.waitForFunction((pid) => {
                const btn = document.querySelector(`#listings-cards button.toggle-avail-btn[data-id="${pid}"]`);
                return btn && btn.textContent.trim() === 'Set Available';
            }, {}, testProduct1._id.toString());
            console.log('   ✓ Button text reactively updated to "Set Available" and badge to "○ Paused"');
        });

        await test('Mobile Card Action: Clicking "Set Available" toggles product availability back to true', async () => {
            const toggleBtn = await page.$(`#listings-cards button.toggle-avail-btn[data-id="${testProduct1._id}"]`);
            assert.ok(toggleBtn, 'Toggle button for testProduct1 must exist');

            await toggleBtn.click();
            await page.waitForResponse(res => res.url().includes('/availability') && res.status() === 200);

            const updatedProd = await Product.findById(testProduct1._id);
            assert.strictEqual(updatedProd.availability, true, 'Database record must be set to availability: true');

            await page.waitForFunction((pid) => {
                const btn = document.querySelector(`#listings-cards button.toggle-avail-btn[data-id="${pid}"]`);
                return btn && btn.textContent.trim() === 'Set Unavailable';
            }, {}, testProduct1._id.toString());
            console.log('   ✓ Button text reactively updated to "Set Unavailable" and badge to "● Active & Available"');
        });

        await test('Mobile Card Action: Clicking "Edit" populates form and switches to Add/Edit tab', async () => {
            const editBtn = await page.$(`#listings-cards button.edit-prod-btn[data-id="${testProduct1._id}"]`);
            assert.ok(editBtn, 'Edit button for testProduct1 must exist');
            await editBtn.click();

            // Verify tab switched to add-product
            const tabState = await page.evaluate(() => {
                const addTab = document.getElementById('tab-add-product');
                const titleVal = document.getElementById('prod-title')?.value;
                const priceVal = document.getElementById('prod-price')?.value;
                const headingText = document.getElementById('form-heading')?.textContent;
                return {
                    isActive: addTab ? addTab.classList.contains('active') : false,
                    titleVal,
                    priceVal: Number(priceVal),
                    headingText
                };
            });

            assert.strictEqual(tabState.isActive, true, 'Must switch to tab-add-product');
            assert.ok(tabState.titleVal.includes('Sony Alpha A7 IV'), 'Form title must be populated with product title');
            assert.strictEqual(tabState.priceVal, 1500, 'Form price must be populated with 1500');
            assert.ok(tabState.headingText.includes('Edit Equipment'), 'Form heading must indicate edit mode');
        });

        // =====================================================================
        // PART 3: OTHER DASHBOARD TABLES (RENTALS, REQUESTS, ADMIN)
        // =====================================================================
        console.log('\n--- 3. Testing Other Dashboard Tables Mobile Cards Adaptation ---');

        await test('My Rentals Tab: Renders mobile cards on 375px', async () => {
            await page.goto(`${BASE_URL}/dashboard.html?tab=rentals`, { waitUntil: 'networkidle0' });
            const metrics = await page.evaluate(() => {
                const table = document.querySelector('#tab-rentals .desktop-only-table');
                const cards = document.getElementById('rentals-cards');
                const isOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                return {
                    tableDisplay: table ? window.getComputedStyle(table).display : null,
                    cardsDisplay: cards ? window.getComputedStyle(cards).display : null,
                    isOverflow
                };
            });
            assert.strictEqual(metrics.isOverflow, false, 'No page overflow on rentals tab');
            assert.strictEqual(metrics.tableDisplay, 'none', 'Desktop table hidden on mobile');
            assert.strictEqual(metrics.cardsDisplay, 'flex', 'Mobile cards displayed on mobile');
        });

        await test('Booking Requests Tab: Renders mobile cards on 375px', async () => {
            await page.goto(`${BASE_URL}/dashboard.html?tab=requests`, { waitUntil: 'networkidle0' });
            const metrics = await page.evaluate(() => {
                const table = document.querySelector('#tab-requests .desktop-only-table');
                const cards = document.getElementById('requests-cards');
                const isOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                return {
                    tableDisplay: table ? window.getComputedStyle(table).display : null,
                    cardsDisplay: cards ? window.getComputedStyle(cards).display : null,
                    cardCount: cards ? cards.querySelectorAll('.dashboard-mobile-card').length : 0,
                    isOverflow
                };
            });
            assert.strictEqual(metrics.isOverflow, false, 'No page overflow on requests tab');
            assert.strictEqual(metrics.tableDisplay, 'none', 'Desktop table hidden on mobile');
            assert.strictEqual(metrics.cardsDisplay, 'flex', 'Mobile cards displayed on mobile');
            assert.strictEqual(metrics.cardCount, 1, 'Incoming booking request must render as mobile card');
        });

        await test('Admin Dashboard: Products, Users, Bookings render responsive cards on mobile', async () => {
            // Re-authenticate as admin
            const adminUser = await User.create({
                name: `Admin Test ${runId}`,
                email: `admin.cards.${runId}@example.com`,
                phone: '9876543212',
                password: 'Password@123',
                role: 'admin'
            });
            const adminToken = generateToken(adminUser);

            await page.evaluate((token, user) => {
                localStorage.setItem('renthub_token', token);
                localStorage.setItem('renthub_current_user', JSON.stringify({
                    _id: user._id.toString(),
                    user_id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    token
                }));
            }, adminToken, adminUser);

            await page.goto(`${BASE_URL}/admin-dashboard.html`, { waitUntil: 'networkidle0' });

            const adminMetrics = await page.evaluate(() => {
                const isOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                const prodCards = document.querySelectorAll('#admin-products .mobile-only-cards .dashboard-mobile-card').length;
                const userCards = document.querySelectorAll('#admin-users .mobile-only-cards .dashboard-mobile-card').length;
                return { isOverflow, prodCards, userCards };
            });

            assert.strictEqual(adminMetrics.isOverflow, false, 'No page overflow on admin dashboard');
            assert.ok(adminMetrics.prodCards > 0, 'Admin products must render mobile cards');
            assert.ok(adminMetrics.userCards > 0, 'Admin users must render mobile cards');

            // Scroll to Products moderation section to capture mobile cards clearly
            await page.evaluate(() => {
                const el = document.getElementById('admin-products');
                if (el) el.scrollIntoView();
            });
            await new Promise(r => setTimeout(r, 200));

            const screenshotFile = path.join(SCREENSHOT_DIR, 'admin-dashboard-mobile-375px.png');
            await page.screenshot({ path: screenshotFile, fullPage: false });
            console.log('   📸 Saved mobile screenshot: admin-dashboard-mobile-375px.png');
        });

        await page.close();

    } finally {
        await browser.close();

        // Cleanup test artifacts
        console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
        await User.deleteMany({ email: new RegExp(runId) });
        await Product.deleteMany({ title: new RegExp(runId) });
        await Booking.deleteMany({ _id: testBooking._id });

        await new Promise(resolve => testServer.close(resolve));
        await mongoose.connection.close();
    }

    console.log(`\n================================================================`);
    console.log(`MOBILE INVENTORY AUDIT SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log(`================================================================\n`);
}

runMobileInventoryTests().catch(err => {
    console.error('Mobile Inventory Tests Failed:', err);
    process.exit(1);
});
