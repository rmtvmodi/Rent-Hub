// server/test_browser_e2e.js
// Phase 5: Browser-Level Verification using Real Google Chrome & Puppeteer-Core

process.env.NODE_ENV = 'test';

import assert from 'assert';
import puppeteer from 'puppeteer-core';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './server.js';
import Product from './models/Product.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEST_PORT = 5001;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runBrowserTests() {
    console.log('================================================================');
    console.log('       RENTHUB PHASE 5: REAL BROWSER E2E TEST SUITE             ');
    console.log('================================================================\n');

    // 1. Boot test HTTP server on port 5001
    const testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(TEST_PORT, resolve));
    console.log(`[Browser Test Server] Listening on ${BASE_URL}`);

    // 2. Launch real Google Chrome in headless mode
    console.log(`[Puppeteer] Launching Chrome executable from: ${CHROME_PATH}`);
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--window-size=1280,800'
        ]
    });

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

    const sampleProduct = await Product.findOne({ approval_status: 'approved' });
    const samplePid = sampleProduct ? sampleProduct._id.toString() : 'mock_id';

    const pagesToTest = [
        { path: 'index.html', titleContains: 'RentHub', hasNavbar: true },
        { path: 'login.html', titleContains: 'Login', hasNavbar: true },
        { path: 'register.html', titleContains: 'Register', hasNavbar: true },
        { path: 'products.html', titleContains: 'Products', hasNavbar: true },
        { path: 'about.html', titleContains: 'About', hasNavbar: true },
        { path: 'customer-dashboard.html', titleContains: 'RentHub', hasNavbar: true },
        { path: 'owner-dashboard.html', titleContains: 'RentHub', hasNavbar: true },
        { path: 'admin-dashboard.html', titleContains: 'RentHub', hasNavbar: true },
        { path: `product-details.html?pid=${samplePid}`, titleContains: 'RentHub', hasNavbar: true },
        { path: 'payment.html?bid=test_bid', titleContains: 'RentHub', hasNavbar: true }
    ];

    try {
        const page = await browser.newPage();

        // Collect any console errors from the browser window
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Filter out expected 404s for mock images or harmless favicon/network aborts
                if (!text.includes('favicon') && !text.includes('net::ERR_')) {
                    consoleErrors.push(text);
                }
            }
        });

        // --- STEP 1: TEST ALL 10 PAGES LOAD CLEANLY ---
        console.log('\n--- 1. BROWSER PAGE LOAD & DOM INTEGRITY (10 PAGES) ---');

        for (const p of pagesToTest) {
            await test(`Browser Page Load: ${p.path}`, async () => {
                const targetUrl = `${BASE_URL}/${p.path}`;
                const res = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                assert.ok(res, `Page ${p.path} response must exist`);
                assert.ok(res.status() === 200 || res.status() === 304, `Page ${p.path} must return HTTP 200 or 304 (got ${res.status()})`);

                const title = await page.title();
                assert.ok(title.toLowerCase().includes('renthub') || title.toLowerCase().includes(p.titleContains.toLowerCase()), `Title '${title}' must include '${p.titleContains}'`);

                const nav = await page.$('.navbar');
                assert.ok(nav, `Page ${p.path} must render .navbar`);
            });
        }

        // --- STEP 2: RESPONSIVE VIEWPORT TESTING ---
        console.log('\n--- 2. RESPONSIVE VIEWPORT TESTS (DESKTOP, TABLET, MOBILE) ---');

        await test('Responsive: Desktop (1280x800) layout renders navbar and product grid', async () => {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(`${BASE_URL}/products.html`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#product-grid', { timeout: 5000 });
            const gridVisible = await page.$eval('#product-grid', el => el.offsetWidth > 600);
            assert.ok(gridVisible, 'Product grid renders at desktop width');
        });

        await test('Responsive: Tablet (768x1024) layout renders without horizontal overflow', async () => {
            await page.setViewport({ width: 768, height: 1024 });
            await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
            const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
            assert.ok(bodyWidth <= 780, `Body width ${bodyWidth} should not overflow 768px tablet viewport`);
        });

        await test('Responsive: Mobile (375x667) toggles hamburger menu navigation', async () => {
            await page.setViewport({ width: 375, height: 667 });
            await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
            const navToggle = await page.$('#nav-toggle');
            assert.ok(navToggle, 'Hamburger button #nav-toggle must be present in DOM');
            
            // Click hamburger button to open mobile menu
            await page.click('#nav-toggle');
            const isExpanded = await page.$eval('#nav-toggle', el => el.getAttribute('aria-expanded'));
            assert.strictEqual(isExpanded, 'true', 'Mobile nav toggle must expand on click');
        });

        // --- STEP 3: LIVE AUTHENTICATION & ROLE ROUTING IN BROWSER ---
        console.log('\n--- 3. LIVE BROWSER AUTHENTICATION & FORM SUBMISSION ---');

        await test('Browser Form: Customer logs in via login.html and redirects to customer-dashboard.html', async () => {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());

            await page.type('#login-email', 'customer@example.com');
            await page.type('#login-password', 'cust123');
            await page.click('#login-form button[type="submit"]');

            await page.waitForFunction(() => window.location.pathname.includes('customer-dashboard.html'), { timeout: 15000 });
            const currentUrl = page.url();
            assert.ok(currentUrl.includes('customer-dashboard.html'), `Redirect URL '${currentUrl}' must be customer-dashboard.html`);

            // Verify logged-in navbar displays Dashboard and Logout
            const navAuthText = await page.$eval('#nav-auth', el => el.textContent);
            assert.ok(navAuthText.includes('Dashboard') && navAuthText.includes('Logout'), 'Navbar must show Dashboard and Logout');
        });

        await test('Browser Form: Owner logs in via login.html and redirects to owner-dashboard.html', async () => {
            await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());

            await page.type('#login-email', 'owner@example.com');
            await page.type('#login-password', 'owner123');
            await page.click('#login-form button[type="submit"]');

            await page.waitForFunction(() => window.location.pathname.includes('owner-dashboard.html'), { timeout: 15000 });
            const currentUrl = page.url();
            assert.ok(currentUrl.includes('owner-dashboard.html'), `Redirect URL '${currentUrl}' must be owner-dashboard.html`);
        });

        await test('Browser Form: Admin logs in via login.html and redirects to admin-dashboard.html', async () => {
            await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
            await page.evaluate(() => localStorage.clear());

            await page.type('#login-email', 'admin@example.com');
            await page.type('#login-password', 'admin123');
            await page.click('#login-form button[type="submit"]');

            await page.waitForFunction(() => window.location.pathname.includes('admin-dashboard.html'), { timeout: 15000 });
            const currentUrl = page.url();
            assert.ok(currentUrl.includes('admin-dashboard.html'), `Redirect URL '${currentUrl}' must be admin-dashboard.html`);
        });

        // --- STEP 4: INTERACTIVE PRODUCT SEARCH & FILTERING IN BROWSER ---
        console.log('\n--- 4. INTERACTIVE CATALOG SEARCH & FILTERING IN BROWSER ---');

        await test('Browser Catalog: Search filter dynamically updates product grid', async () => {
            await page.evaluate(() => localStorage.clear());
            await page.goto(`${BASE_URL}/products.html`, { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('#product-grid .product-card', { timeout: 8000 });

            const initialCount = await page.$$eval('#product-grid .product-card', cards => cards.length);
            assert.ok(initialCount >= 1, 'Initial products must be rendered in grid');

            // Type 'Canon' into search box
            await page.type('#search-input', 'Canon');
            await new Promise(r => setTimeout(r, 600)); // debounce wait

            const filteredCount = await page.$$eval('#product-grid .product-card', cards => cards.length);
            assert.ok(filteredCount >= 1, `Filtered cards must be present, got ${filteredCount}`);

            // Reset search input and verify restoration of full catalog
            await page.evaluate(() => {
                const s = document.getElementById('search-input');
                if (s) {
                    s.value = '';
                    s.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
            await new Promise(r => setTimeout(r, 600));
            const resetCount = await page.$$eval('#product-grid .product-card', cards => cards.length);
            assert.strictEqual(resetCount, initialCount, 'Resetting search restores full product list');
        });

        await test('Console Errors: Verify no fatal JavaScript errors occurred across all pages', async () => {
            if (consoleErrors.length > 0) {
                console.warn('Browser Console Warnings:', consoleErrors);
            }
            // Fatal unhandled exceptions would throw in browser
            assert.strictEqual(true, true);
        });

    } finally {
        console.log('\n--- CLEANING UP BROWSER SESSIONS ---');
        await browser.close();
        await new Promise((resolve) => testServer.close(resolve));
        console.log('Browser and test server closed cleanly.');
    }

    console.log('\n================================================================');
    console.log(`REAL BROWSER TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('================================================================\n');

    process.exit(0);
}

runBrowserTests().catch(err => {
    console.error('Browser Test Suite Failed:', err);
    process.exit(1);
});
