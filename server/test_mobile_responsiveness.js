// server/test_mobile_responsiveness.js
// Verification of mobile responsiveness, layout adaptability, and zero horizontal overflow
// across real mobile and tablet viewports using Puppeteer & Google Chrome

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
    { name: 'Ultra-compact Mobile (320x568)', width: 320, height: 568 },
    { name: 'Standard iPhone (375x667)', width: 375, height: 667 },
    { name: 'Modern Smartphone (390x844)', width: 390, height: 844 },
    { name: 'Large Smartphone (430x932)', width: 430, height: 932 },
    { name: 'Tablet Portrait (768x1024)', width: 768, height: 1024 },
    { name: 'Desktop Baseline (1280x800)', width: 1280, height: 800 }
];

async function runMobileResponsivenessTests() {
    console.log('================================================================');
    console.log('    RENTHUB REAL BROWSER MOBILE RESPONSIVENESS TEST SUITE       ');
    console.log('================================================================\n');

    const testServer = http.createServer(app);
    await new Promise(resolve => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    // Find any approved product for testing product details page
    const sampleProduct = await Product.findOne({ approval_status: 'approved' });
    const sampleProductId = sampleProduct ? (sampleProduct._id.toString()) : '';

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

        for (const vp of VIEWPORTS) {
            console.log(`\n--- Testing Viewport: ${vp.name} ---`);
            await page.setViewport({ width: vp.width, height: vp.height });

            // 1. About Page Overflow Check
            await test(`[${vp.width}px] About Page renders with 0 horizontal overflow`, async () => {
                await page.goto(`${BASE_URL}/about.html`, { waitUntil: 'domcontentloaded' });
                const overflow = await page.evaluate(() => {
                    return document.documentElement.scrollWidth > window.innerWidth + 2;
                });
                assert.strictEqual(overflow, false, `Page must not overflow viewport width of ${vp.width}px`);
            });

            // 2. Product Details Page Responsive Stack & Overflow Check
            if (sampleProductId) {
                await test(`[${vp.width}px] Product Details page stacks gallery and eliminates horizontal scroll`, async () => {
                    await page.goto(`${BASE_URL}/product-details.html?id=${sampleProductId}`, { waitUntil: 'networkidle0' });
                    const metrics = await page.evaluate(() => {
                        const layout = document.querySelector('.product-detail-layout');
                        const mainImg = document.querySelector('.product-gallery-main-img');
                        const isOverflowing = document.documentElement.scrollWidth > window.innerWidth + 2;
                        return {
                            hasLayout: Boolean(layout),
                            hasMainImg: Boolean(mainImg),
                            isOverflowing,
                            scrollWidth: document.documentElement.scrollWidth,
                            innerWidth: window.innerWidth
                        };
                    });

                    assert.strictEqual(metrics.isOverflowing, false, `Horizontal overflow detected: scrollWidth=${metrics.scrollWidth} > innerWidth=${metrics.innerWidth}`);
                    if (metrics.hasMainImg) {
                        const imgWidth = await page.$eval('.product-gallery-main-img', el => el.offsetWidth);
                        assert.ok(imgWidth <= vp.width, `Image width ${imgWidth}px must not exceed viewport ${vp.width}px`);
                    }
                });
            }

            // 3. Forgot Password & Reset Password Form Responsiveness
            await test(`[${vp.width}px] Forgot Password page fits cleanly on screen`, async () => {
                await page.goto(`${BASE_URL}/forgot-password.html`, { waitUntil: 'domcontentloaded' });
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false);
            });

            // 4. Products Catalog 2-Column Mobile Grid Check
            await test(`[${vp.width}px] Products Catalog renders 2 columns on mobile and zero overflow`, async () => {
                await page.goto(`${BASE_URL}/products.html`, { waitUntil: 'domcontentloaded' });
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

                assert.strictEqual(gridData.isOverflow, false, `Products page must not horizontally overflow at ${vp.width}px`);
                if (vp.width <= 768 && gridData.cols > 0) {
                    assert.strictEqual(gridData.cols, 2, `Product grid must compute exactly 2 columns on mobile at ${vp.width}px, got ${gridData.cols}`);
                }
            });

            // 5. Unified Dashboard Responsiveness
            await test(`[${vp.width}px] Unified Dashboard fits without horizontal scroll`, async () => {
                await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
                const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
                assert.strictEqual(overflow, false, `Dashboard must not horizontally overflow at ${vp.width}px`);
            });
        }

        await page.close();

    } finally {
        await browser.close();
        await new Promise(resolve => testServer.close(resolve));
    }

    console.log(`\n================================================================`);
    console.log(`MOBILE RESPONSIVENESS TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log(`================================================================\n`);
}

runMobileResponsivenessTests().catch(err => {
    console.error('Mobile Responsiveness Tests Failed:', err);
    process.exit(1);
});
