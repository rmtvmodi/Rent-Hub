// server/test_production_readiness.js
// Security & Production-Readiness Verification Suite

process.env.NODE_ENV = 'test';

import assert from 'assert';
import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from './server.js';
import User from './models/User.js';
import { dbState, redactMongoCredentials } from './config/db.js';
import { validateProductionEnv, parseAllowedOrigins } from './config/env.js';
import { validateJwtSecret, generateToken, verifyToken } from './utils/jwt.js';

const TEST_PORT = 5002;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runProductionReadinessTests() {
    console.log('================================================================');
    console.log('     RENTHUB PRODUCTION READINESS & SECURITY TEST SUITE         ');
    console.log('================================================================\n');

    // Wait briefly for Mongoose connection triggered by server.js import
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('MongoDB connection timed out')), 12000);
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
    await new Promise((resolve) => testServer.listen(TEST_PORT, '127.0.0.1', resolve));

    let passed = 0;
    let total = 0;
    const tempUserEmails = [];

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
        // ---------------------------------------------------------------------
        // 1. STATIC FILE EXPOSURE RESTRICTIONS
        // ---------------------------------------------------------------------
        console.log('--- 1. STATIC FILE EXPOSURE RESTRICTIONS ---');

        const restrictedPaths = [
            '/server/server.js',
            '/server/.env',
            '/server/.env.example',
            '/server/package.json',
            '/server/config/db.js',
            '/server/utils/jwt.js',
            '/server/seeder/seeder.js',
            '/server/seeder/provisionAdmin.js',
            '/README.md',
            '/DEMO_WALKTHROUGH.md',
            '/PROJECT_PRESENTATION.md',
            '/VIVA_PREPARATION.md',
            '/scratch/run_full_test_suite.mjs',
            '/.gitignore'
        ];

        for (const p of restrictedPaths) {
            await test(`Restricted path returns 404: ${p}`, async () => {
                const res = await fetch(`${BASE_URL}${p}`);
                assert.strictEqual(res.status, 404, `Expected 404 for ${p}, got ${res.status}`);
            });
        }

        const allowedPaths = [
            '/',
            '/index.html',
            '/login.html',
            '/products.html',
            '/css/style.css',
            '/js/api.js',
            '/js/config.js'
        ];

        for (const p of allowedPaths) {
            await test(`Allowed public asset returns 200: ${p}`, async () => {
                const res = await fetch(`${BASE_URL}${p}`);
                assert.strictEqual(res.status, 200, `Expected 200 for ${p}, got ${res.status}`);
            });
        }

        // ---------------------------------------------------------------------
        // 2. DEMO CREDENTIALS & OFFLINE AUTH FALLBACK REMOVAL
        // ---------------------------------------------------------------------
        console.log('\n--- 2. FRONTEND CREDENTIAL EXPOSURE & OFFLINE FALLBACK ---');

        await test('login.html does not expose Quick Demo Accounts or passwords', async () => {
            const res = await fetch(`${BASE_URL}/login.html`);
            const html = await res.text();
            assert.ok(!html.includes('Quick Demo Accounts'), 'Quick Demo Accounts box must be removed');
            assert.ok(!html.includes('cust123') && !html.includes('owner123') && !html.includes('admin123'), 'Demo passwords must not appear in login.html');
        });

        await test('js/storage.js does not contain hardcoded demo users or passwords', async () => {
            const res = await fetch(`${BASE_URL}/js/storage.js`);
            const js = await res.text();
            assert.ok(!js.includes('customer@example.com'), 'Must not contain customer@example.com');
            assert.ok(!js.includes('owner@example.com'), 'Must not contain owner@example.com');
            assert.ok(!js.includes('admin@example.com'), 'Must not contain admin@example.com');
            assert.ok(!js.includes('admin123'), 'Must not contain demo admin password');
        });

        await test('js/auth.js has no offline localStorage authentication fallback', async () => {
            const res = await fetch(`${BASE_URL}/js/auth.js`);
            const js = await res.text();
            assert.ok(!js.includes('findUserByEmail'), 'Offline findUserByEmail login fallback must be removed');
            assert.ok(!js.includes('localUser.password'), 'Offline plaintext password check must be removed');
        });

        await test('js/api.js uses environment/origin config without hardcoded :5000 restriction', async () => {
            const res = await fetch(`${BASE_URL}/js/api.js`);
            const js = await res.text();
            assert.ok(!js.includes("origin.includes(':5000')"), 'Must not restrict same-origin /api to port 5000');
            assert.ok(js.includes("return '/api'"), 'Must default to /api for same-origin deployments');
        });

        // ---------------------------------------------------------------------
        // 3. MONGODB URI REDACTION & HEALTH ENDPOINT
        // ---------------------------------------------------------------------
        console.log('\n--- 3. MONGODB REDACTION & HEALTH ENDPOINT ---');

        await test('redactMongoCredentials masks embedded Atlas username and password', () => {
            const sample = 'Failed connecting to mongodb+srv://sampleuser:VerySecretPass99@cluster0.mongodb.net/renthub';
            const redacted = redactMongoCredentials(sample);
            assert.ok(!redacted.includes('sampleuser'), 'Username must be redacted');
            assert.ok(!redacted.includes('VerySecretPass99'), 'Password must be redacted');
            assert.ok(redacted.includes('mongodb+srv://***:***@cluster0.mongodb.net/renthub'), 'Host structure preserved safely');
        });

        await test('GET /api/health returns 200 healthy when DB is connected', async () => {
            const res = await fetch(`${BASE_URL}/api/health`);
            const body = await res.json();
            assert.strictEqual(res.status, 200);
            assert.strictEqual(body.status, 'healthy');
            assert.strictEqual(body.database.status, 'connected');
        });

        await test('GET /api/health returns 503 unhealthy when DB status is failed', async () => {
            const prevStatus = dbState.status;
            const prevError = dbState.lastError;
            try {
                dbState.status = 'failed';
                dbState.lastError = 'Simulated outage';
                const res = await fetch(`${BASE_URL}/api/health`);
                const body = await res.json();
                assert.strictEqual(res.status, 503);
                assert.strictEqual(body.status, 'unhealthy');
                assert.strictEqual(body.database.status, 'failed');
            } finally {
                dbState.status = prevStatus;
                dbState.lastError = prevError;
            }
        });

        // ---------------------------------------------------------------------
        // 4. JWT SECRET VALIDATION & HS256 RESTRICTION
        // ---------------------------------------------------------------------
        console.log('\n--- 4. JWT SECRET VALIDATION & ALGORITHM HARDENING ---');

        await test('validateJwtSecret rejects empty, short, and known dev secrets in production', () => {
            assert.throws(() => validateJwtSecret('', true), /missing/i);
            assert.throws(() => validateJwtSecret('short_secret', true), /too weak/i);
            assert.throws(
                () => validateJwtSecret('renthub_super_secret_jwt_key_development_change_in_production_2026', true),
                /too weak/i
            );
            assert.throws(() => validateJwtSecret('your_jwt_secret_placeholder_1234567890', true), /too weak/i);

            const strongSecret = crypto.randomBytes(48).toString('hex');
            assert.strictEqual(validateJwtSecret(strongSecret, true), strongSecret);
        });

        await test('verifyToken rejects unsigned alg:none JWT tokens', () => {
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
            const payload = Buffer.from(JSON.stringify({ id: '507f1f77bcf86cd799439011', role: 'admin' })).toString('base64url');
            const unsignedToken = `${header}.${payload}.`;
            assert.throws(() => verifyToken(unsignedToken));
        });

        await test('verifyToken accepts valid HS256 token signed by generateToken', () => {
            const token = generateToken({ _id: '507f1f77bcf86cd799439011', role: 'customer' });
            const decodedHeader = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
            assert.strictEqual(decodedHeader.alg, 'HS256');
            const decoded = verifyToken(token);
            assert.strictEqual(decoded.role, 'customer');
        });

        // ---------------------------------------------------------------------
        // 5. PRODUCTION ENVIRONMENT VALIDATION & CORS
        // ---------------------------------------------------------------------
        console.log('\n--- 5. PRODUCTION ENV VALIDATION & CORS ---');

        await test('validateProductionEnv rejects localhost MONGO_URI, weak JWT_SECRET, wildcard/localhost CORS', () => {
            const strongSecret = crypto.randomBytes(32).toString('hex');

            assert.throws(() => validateProductionEnv({
                NODE_ENV: 'production',
                MONGO_URI: 'mongodb://127.0.0.1:27017/renthub',
                JWT_SECRET: strongSecret
            }), /localhost or 127\.0\.0\.1/i);

            assert.throws(() => validateProductionEnv({
                NODE_ENV: 'production',
                MONGO_URI: 'mongodb+srv://user:pass@cluster0.mongodb.net/renthub',
                JWT_SECRET: 'weak',
                CLIENT_URL: 'https://renthub.example.com'
            }), /too weak/i);

            assert.throws(() => validateProductionEnv({
                NODE_ENV: 'production',
                MONGO_URI: 'mongodb+srv://user:pass@cluster0.mongodb.net/renthub',
                JWT_SECRET: strongSecret,
                CLIENT_URL: '*'
            }), /wildcard/i);

            assert.throws(() => validateProductionEnv({
                NODE_ENV: 'production',
                MONGO_URI: 'mongodb+srv://user:pass@cluster0.mongodb.net/renthub',
                JWT_SECRET: strongSecret,
                CLIENT_URL: 'http://localhost:5500'
            }), /localhost/i);

            const ok = validateProductionEnv({
                NODE_ENV: 'production',
                MONGO_URI: 'mongodb+srv://user:pass@cluster0.mongodb.net/renthub?retryWrites=true&w=majority',
                JWT_SECRET: strongSecret,
                CLIENT_URL: 'https://renthub.example.com/'
            });
            assert.strictEqual(ok.valid, true);
        });

        await test('parseAllowedOrigins normalizes trailing slashes and omits localhost in production', () => {
            const prodEmpty = parseAllowedOrigins({ NODE_ENV: 'production' });
            assert.deepStrictEqual(prodEmpty, []);

            const prodConfigured = parseAllowedOrigins({
                NODE_ENV: 'production',
                CLIENT_URL: ' https://app.renthub.example/ , https://admin.renthub.example '
            });
            assert.deepStrictEqual(prodConfigured, ['https://app.renthub.example', 'https://admin.renthub.example']);
        });

        await test('CORS blocks unknown Origin with 403 and allows configured Origin in production mode', async () => {
            const prevEnv = process.env.NODE_ENV;
            const prevClientUrl = process.env.CLIENT_URL;
            try {
                process.env.NODE_ENV = 'production';
                process.env.CLIENT_URL = 'https://renthub.example.com';

                const blockedRes = await fetch(`${BASE_URL}/api/products`, {
                    headers: { Origin: 'https://evil-attacker.example' }
                });
                assert.strictEqual(blockedRes.status, 403);

                const allowedRes = await fetch(`${BASE_URL}/api/products`, {
                    headers: { Origin: 'https://renthub.example.com' }
                });
                assert.strictEqual(allowedRes.status, 200);
                assert.strictEqual(allowedRes.headers.get('access-control-allow-origin'), 'https://renthub.example.com');

                const sameOriginRes = await fetch(`${BASE_URL}/api/products`, {
                    headers: { Origin: BASE_URL }
                });
                assert.strictEqual(sameOriginRes.status, 200);
            } finally {
                process.env.NODE_ENV = prevEnv;
                if (prevClientUrl === undefined) {
                    delete process.env.CLIENT_URL;
                } else {
                    process.env.CLIENT_URL = prevClientUrl;
                }
            }
        });

        // ---------------------------------------------------------------------
        // 6. DEACTIVATED ACCOUNT ENFORCEMENT
        // ---------------------------------------------------------------------
        console.log('\n--- 6. DEACTIVATED ACCOUNT ENFORCEMENT ---');

        await test('Deactivated account is rejected on both login (403) and protected endpoints (403)', async () => {
            const tempEmail = `deactivated_test_${Date.now()}@example.com`;
            tempUserEmails.push(tempEmail);
            const tempPass = 'SecureTest#2026!';

            const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Temp Security Test User',
                    email: tempEmail,
                    password: tempPass,
                    role: 'customer'
                })
            });
            assert.strictEqual(regRes.status, 201);
            const regBody = await regRes.json();
            const token = regBody.token;
            assert.ok(token);

            // Verify token works while active
            const meActiveRes = await fetch(`${BASE_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            assert.strictEqual(meActiveRes.status, 200);

            // Deactivate user in DB
            await User.findOneAndUpdate({ email: tempEmail }, { isActive: false });

            // Existing valid JWT must now be rejected with 403
            const meDeactivatedRes = await fetch(`${BASE_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            assert.strictEqual(meDeactivatedRes.status, 403);

            // Fresh login attempt must also be rejected with 403
            const loginDeactivatedRes = await fetch(`${BASE_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: tempEmail, password: tempPass })
            });
            assert.strictEqual(loginDeactivatedRes.status, 403);
        });
    } finally {
        if (tempUserEmails.length > 0 && mongoose.connection.readyState === 1) {
            await User.deleteMany({ email: { $in: tempUserEmails } });
        }
        await new Promise((resolve) => testServer.close(resolve));
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    }

    console.log('\n================================================================');
    console.log(`PRODUCTION READINESS TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
    console.log('================================================================\n');
}

runProductionReadinessTests().catch((err) => {
    console.error('Production Readiness Test Suite Failed:', err);
    process.exit(1);
});
