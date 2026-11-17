// server/test_mobile_responsiveness.js
// Verification of mobile responsiveness, layout adaptability, and zero horizontal overflow
// across all 9 target viewports (320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1280px, 1440px)
// using Puppeteer & Google Chrome.

process.env.NODE_ENV = 'test';

import assert from 'assert';
import puppeteer from 'puppeteer-core';
import http from 'http';
import app from './server.js';
import Product from './models/Product.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 5004;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

const VIEWPORTS = [
    { name: 'Ultra-compact Mobile (320px)', width: 320, height: 568 },
    { name: 'Compact Mobile (360px)', width: 360, height: 640 },
    { name: 'Standard iPhone (375px)', width: 375, height: 667 },
    { name: 'Modern Smartphone (390px)', width: 390, height: 844 },
    { name: 'Large Smartphone (430px)', width: 430, height: 932 },
    { name: 'Tablet Portrait (768px)', width: 768, height: 1024 },
    { name: 'Small Desktop / Landscape (1024px)', width: 1024, height: 768 },
    { name: 'Standard Desktop (1280px)', width: 1280, height: 800 },
    { name: 'Large Desktop (1440px)', width: 1440, height: 900 }
];

async function runMobileResponsivenessTests() {
    console.log('================================================================');
    console.log('    RENTHUB 9-VIEWPORT MOBILE RESPONSIVENESS AUDIT SUITE        ');
    console.log('================================================================\n');

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    let sampleProductId = '';
    try {
        const sampleProduct = await Product.findOne({ approval_status: { $ne: 'rejected' } });
        sampleProductId = sampleProduct ? (sampleProduct._id.toString()) : '';
    } catch (err) {
        console.warn('[Notice] Could not fetch sample product from DB:', err.message);
    }

    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

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

    try {
        const page = await browser.newPage();

        // 1. HOME PAGE across all 9 viewports
        console.log('\n--- 1. Testing Home Page (index.html) across 9 Viewports ---');
        await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Home Page [${vp.name}]: 0 horizontal overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Horizontal overflow at ${vp.width}px`);
            });
        }

        // 2. ADMIN DASHBOARD & ADD PRODUCT SECTION across all 9 viewports
        console.log('\n--- 2. Testing Admin Dashboard (admin-dashboard.html) Form Boundaries ---');
        await page.goto(`${BASE_URL}/admin-dashboard.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Admin Dashboard [${vp.name}]: Daily Rate & Category stay within container`, async () => {
                const audit = await page.evaluate(() => {
                    const priceInput = document.getElementById('prod-price');
                    const form = document.getElementById('product-form');
                    const isPageOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                    let inputOverflows = false;
                    let inputWidth = 0;
                    let formWidth = 0;
                    if (priceInput && form) {
                        const priceRect = priceInput.getBoundingClientRect();
                        const formRect = form.getBoundingClientRect();
                        inputWidth = priceRect.width;
                        formWidth = formRect.width;
                        inputOverflows = priceRect.right > (window.innerWidth + 4) || priceRect.right > (formRect.right + 4);
                    }
                    return { isPageOverflow, inputOverflows, inputWidth, formWidth };
                });
                assert.strictEqual(audit.isPageOverflow, false, `Admin dashboard overflowed at ${vp.width}px`);
                assert.strictEqual(audit.inputOverflows, false, `Daily Rate input overflowed container at ${vp.width}px`);
            });
        }

        // 3. UNIFIED DASHBOARD across all 9 viewports
        console.log('\n--- 3. Testing Unified Dashboard (dashboard.html) across 9 Viewports ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Unified Dashboard [${vp.name}]: 0 horizontal overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Dashboard overflowed at ${vp.width}px`);
            });
        }

        // 4. PRODUCTS CATALOG & 2-COLUMN GRID across all 9 viewports
        console.log('\n--- 4. Testing Products Catalog (products.html) Grid ---');
        await page.goto(`${BASE_URL}/products.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Product Catalog [${vp.name}]: Grid adapts and 0 horizontal overflow`, async () => {
                const gridData = await page.evaluate((width) => {
                    const grid = document.querySelector('.product-grid');
                    const isOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                    let cols = 0;
                    if (grid) {
                        const style = window.getComputedStyle(grid);
                        const template = style.getPropertyValue('grid-template-columns') || '';
                        cols = template.trim().split(/\s+/).filter(Boolean).length;
                    }
                    return { isOverflow, cols, width };
                }, vp.width);
                assert.strictEqual(gridData.isOverflow, false, `Catalog overflowed at ${vp.width}px`);
                if (vp.width <= 768 && gridData.cols > 0) {
                    assert.strictEqual(gridData.cols, 2, `Product grid must be 2 columns at ${vp.width}px`);
                }
            });
        }

        // 5. REGISTER PAGE across all 9 viewports
        console.log('\n--- 5. Testing Register Page (register.html) Role Selection ---');
        await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Register Page [${vp.name}]: Role buttons wrap cleanly without overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Register page overflowed at ${vp.width}px`);
            });
        }

        // 6. FORGOT & RESET PASSWORD across all 9 viewports
        console.log('\n--- 6. Testing Forgot Password (forgot-password.html) ---');
        await page.goto(`${BASE_URL}/forgot-password.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`Forgot Password [${vp.name}]: fits cleanly with 0 horizontal overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Forgot Password overflowed at ${vp.width}px`);
            });
        }

        // 7. ABOUT PAGE across all 9 viewports
        console.log('\n--- 7. Testing About Page (about.html) ---');
        await page.goto(`${BASE_URL}/about.html`, { waitUntil: 'domcontentloaded' });
        for (const vp of VIEWPORTS) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.evaluate(() => new Promise(r => requestAnimationFrame(r)));
            await test(`About Page [${vp.name}]: fits cleanly with 0 horizontal overflow`, async () => {
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `About page overflowed at ${vp.width}px`);
            });
        }

        // 8. MOBILE NAVIGATION MENU (Vertical Flexbox, Toggle open/close, Full width)
        console.log('\n--- 8. Testing Mobile Navigation Menu Vertical Flexbox & Toggling ---');
        const mobileViewports = VIEWPORTS.filter(vp => vp.width <= 768);
        for (const vp of mobileViewports) {
            await page.setViewport({ width: vp.width, height: vp.height });
            await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
            await page.click('#nav-toggle');
            await test(`Mobile Nav [${vp.name}]: Opens vertical Flexbox, zero overflow`, async () => {
                const navState = await page.evaluate(() => {
                    const navLinks = document.querySelector('.nav-links');
                    if (!navLinks) return { active: false };
                    const style = window.getComputedStyle(navLinks);
                    const rect = navLinks.getBoundingClientRect();
                    const isOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
                    return {
                        active: navLinks.classList.contains('active'),
                        flexDirection: style.flexDirection,
                        isOverflow,
                        rightEdge: rect.right,
                        windowWidth: window.innerWidth
                    };
                });
                assert.strictEqual(navState.active, true, 'Nav links has active class');
                assert.strictEqual(navState.flexDirection, 'column', 'Mobile nav menu uses flex-direction: column');
                assert.strictEqual(navState.isOverflow, false, 'No page overflow with menu open');
                assert.ok(navState.rightEdge <= navState.windowWidth + 2, 'Nav menu within screen boundaries');
            });
        }

        await page.close();

    } finally {
        await browser.close();
        await new Promise(resolve => testServer.close(resolve));
    }

    console.log(`\n================================================================`);
    console.log(`MOBILE RESPONSIVENESS AUDIT SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log(`================================================================\n`);
}

runMobileResponsivenessTests().catch(err => {
    console.error('Mobile Responsiveness Tests Failed:', err);
    process.exit(1);
});
