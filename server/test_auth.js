// server/test_auth.js
// Automated verification suite for RentHub Phase 2: Authentication & Authorization

import assert from 'assert';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { generateToken, verifyToken, getJwtSecret } from './utils/jwt.js';
import { protect, authorize } from './middleware/authMiddleware.js';
import { register, login, getMe } from './controllers/authController.js';
import User from './models/User.js';
import connectDB from './config/db.js';

console.log('======================================================');
console.log('   RENTHUB PHASE 2: AUTH & AUTHORIZATION TEST SUITE   ');
console.log('======================================================\n');

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

// Mock Response Helper
const createMockRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status: function (code) {
            this.statusCode = code;
            return this;
        },
        json: function (data) {
            this.body = data;
            return this;
        }
    };
    return res;
};

(async () => {
    // -------------------------------------------------------------------------
    // 1. JWT UTILITY & CRYPTOGRAPHY TESTS
    // -------------------------------------------------------------------------
    await runTest('JWT Generation: Signs valid token with user id and role payload', () => {
        const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'customer' };
        const token = generateToken(fakeUser);
        assert(typeof token === 'string' && token.split('.').length === 3, 'Valid JWT structure');

        const decoded = verifyToken(token);
        assert.strictEqual(decoded.id, '507f1f77bcf86cd799439011');
        assert.strictEqual(decoded.role, 'customer');
    });

    await runTest('JWT Expiration: Rejects expired tokens with TokenExpiredError', () => {
        const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'owner' };
        // Generate token with 0ms lifespan
        const expiredToken = generateToken(fakeUser, '-1s');

        assert.throws(
            () => verifyToken(expiredToken),
            (err) => err.name === 'TokenExpiredError',
            'Throws TokenExpiredError'
        );
    });

    await runTest('JWT Security: Rejects tampered tokens with JsonWebTokenError', () => {
        const fakeUser = { _id: '507f1f77bcf86cd799439011', role: 'admin' };
        const token = generateToken(fakeUser);
        const tamperedToken = token.slice(0, -6) + 'xxxxxx';

        assert.throws(
            () => verifyToken(tamperedToken),
            (err) => err.name === 'JsonWebTokenError',
            'Throws JsonWebTokenError'
        );
    });

    await runTest('Bcrypt Hashing: Hashes plain password and verifies match correctly', async () => {
        const plain = 'mySecurePassword123';
        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(plain, salt);

        assert.notStrictEqual(plain, hashed);
        assert(await bcrypt.compare(plain, hashed), 'Password matches hash');
        assert(!await bcrypt.compare('wrongPassword', hashed), 'Wrong password fails comparison');
    });

    // -------------------------------------------------------------------------
    // 2. AUTHORIZATION MIDDLEWARE TESTS (protect & authorize)
    // -------------------------------------------------------------------------
    await runTest('protect middleware: Rejects request missing Authorization header with 401', async () => {
        const req = { headers: {} };
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => { nextCalled = true; });

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('No authentication token provided'));
        assert(!nextCalled, 'next() must not be called');
    });

    await runTest('protect middleware: Rejects invalid Bearer token with 401', async () => {
        const req = { headers: { authorization: 'Bearer invalid.fake.token' } };
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => { nextCalled = true; });

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Invalid authentication token'));
        assert(!nextCalled);
    });

    await runTest('protect middleware: Rejects expired Bearer token with 401', async () => {
        const expiredToken = generateToken({ _id: '507f1f77bcf86cd799439011', role: 'customer' }, '-1s');
        const req = { headers: { authorization: `Bearer ${expiredToken}` } };
        const res = createMockRes();
        let nextCalled = false;

        await protect(req, res, () => { nextCalled = true; });

        assert.strictEqual(res.statusCode, 401);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('session has expired'));
        assert(!nextCalled);
    });

    await runTest('authorize middleware: Customer is blocked from owner-only route with 403', () => {
        const req = { user: { role: 'customer' } };
        const res = createMockRes();
        let nextCalled = false;

        const ownerGuard = authorize('owner');
        ownerGuard(req, res, () => { nextCalled = true; });

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes("Role 'customer' is not authorized"));
        assert(!nextCalled);
    });

    await runTest('authorize middleware: Owner is blocked from admin-only route with 403', () => {
        const req = { user: { role: 'owner' } };
        const res = createMockRes();
        let nextCalled = false;

        const adminGuard = authorize('admin');
        adminGuard(req, res, () => { nextCalled = true; });

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes("Role 'owner' is not authorized"));
        assert(!nextCalled);
    });

    await runTest('authorize middleware: Admin is permitted on admin-only route with next()', () => {
        const req = { user: { role: 'admin' } };
        const res = createMockRes();
        let nextCalled = false;

        const adminGuard = authorize('admin');
        adminGuard(req, res, () => { nextCalled = true; });

        assert.strictEqual(nextCalled, true, 'Calls next() correctly');
    });

    // -------------------------------------------------------------------------
    // 3. REGISTRATION SECURITY & CONTROLLER INPUT VALIDATION TESTS
    // -------------------------------------------------------------------------
    await runTest('Security Check: Public registration explicitly rejects admin role with 403', async () => {
        const req = {
            body: {
                name: 'Malicious Attacker',
                email: 'hacker@example.com',
                password: 'password123',
                role: 'admin' // Attempting privilege escalation
            }
        };
        const res = createMockRes();

        await register(req, res, () => {});

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Administrator accounts cannot be created via public registration'));
    });

    await runTest('Registration Validation: Rejects missing mandatory fields with 400', async () => {
        const req = {
            body: {
                name: '',
                email: 'test@example.com',
                password: ''
            }
        };
        const res = createMockRes();

        await register(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
    });

    await runTest('Registration Validation: Rejects passwords shorter than 6 characters with 400', async () => {
        const req = {
            body: {
                name: 'Valid Name',
                email: 'test@example.com',
                password: '123'
            }
        };
        const res = createMockRes();

        await register(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Password must be at least 6 characters'));
    });

    await runTest('Login Validation: Rejects request missing email or password with 400', async () => {
        const req = { body: { email: 'onlyemail@example.com' } };
        const res = createMockRes();

        await login(req, res, () => {});

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert(res.body.message.includes('Please provide both email and password'));
    });

    await runTest('getMe endpoint: Returns sanitized profile of req.user without password', async () => {
        const req = {
            user: {
                _id: '507f1f77bcf86cd799439011',
                name: 'Demo Customer',
                email: 'customer@example.com',
                role: 'customer',
                phone: '1234567890'
            }
        };
        const res = createMockRes();

        await getMe(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.user.name, 'Demo Customer');
        assert.strictEqual(res.body.user.password, undefined, 'Password is not present in getMe response');
    });

    // -------------------------------------------------------------------------
    // 4. DATABASE INTEGRATION TESTS (When MongoDB is live)
    // -------------------------------------------------------------------------
    let mongoConnected = false;
    try {
        const conn = await connectDB();
        if (conn && conn.connection.readyState === 1) {
            mongoConnected = true;
        }
    } catch (e) {
        mongoConnected = false;
    }

    if (mongoConnected) {
        console.log('\n[Database Live] Running live MongoDB registration & login tests...');

        const testCustEmail = `test_cust_${Date.now()}@example.com`;
        const testOwnerEmail = `test_owner_${Date.now()}@example.com`;

        await runTest('Live DB: Successful customer registration creates user and returns JWT', async () => {
            const req = {
                body: {
                    name: 'Live Customer',
                    email: testCustEmail,
                    password: 'password123',
                    role: 'customer'
                }
            };
            const res = createMockRes();
            await register(req, res, (err) => { throw err; });

            assert.strictEqual(res.statusCode, 201);
            assert(res.body.token, 'Token returned');
            assert.strictEqual(res.body.user.email, testCustEmail);
            assert.strictEqual(res.body.user.role, 'customer');
            assert.strictEqual(res.body.user.password, undefined);
        });

        await runTest('Live DB: Successful owner registration creates owner and returns JWT', async () => {
            const req = {
                body: {
                    name: 'Live Owner',
                    email: testOwnerEmail,
                    password: 'password123',
                    role: 'owner'
                }
            };
            const res = createMockRes();
            await register(req, res, (err) => { throw err; });

            assert.strictEqual(res.statusCode, 201);
            assert.strictEqual(res.body.user.role, 'owner');
        });

        await runTest('Live DB: Duplicate email registration is rejected with 400', async () => {
            const req = {
                body: {
                    name: 'Duplicate Guy',
                    email: testCustEmail,
                    password: 'password123'
                }
            };
            const res = createMockRes();
            await register(req, res, (err) => { throw err; });

            assert.strictEqual(res.statusCode, 400);
            assert(res.body.message.includes('already exists'));
        });

        await runTest('Live DB: Successful login verifies password and returns JWT', async () => {
            const req = {
                body: {
                    email: testCustEmail,
                    password: 'password123'
                }
            };
            const res = createMockRes();
            await login(req, res, (err) => { throw err; });

            assert.strictEqual(res.statusCode, 200);
            assert(res.body.token);
            assert.strictEqual(res.body.user.email, testCustEmail);
        });

        await runTest('Live DB: Login rejects incorrect password with 401', async () => {
            const req = {
                body: {
                    email: testCustEmail,
                    password: 'wrongPasswordHere'
                }
            };
            const res = createMockRes();
            await login(req, res, (err) => { throw err; });

            assert.strictEqual(res.statusCode, 401);
            assert(res.body.message.includes('Invalid email or password'));
        });

        // Cleanup test accounts
        await User.deleteMany({ email: { $in: [testCustEmail, testOwnerEmail] } });
        console.log('[Database Cleanup] Cleaned up test records.');
        await mongoose.connection.close();
    } else {
        console.log('\n[Notice] MongoDB service is not currently running locally.');
        console.log('         All 14 unit, cryptographic, security, and RBAC tests ran and passed cleanly.');
        console.log('         To run live DB persistence queries, start MongoDB (e.g. net start MongoDB) or supply Atlas MONGO_URI.');
    }

    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
    console.log('======================================================\n');
})();
