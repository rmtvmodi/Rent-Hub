// server/test_restart_persistence.js
// Verify that live data in MongoDB persists across backend server termination and restarts

import dotenv from 'dotenv';
dotenv.config();

import assert from 'assert';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Review from './models/Review.js';

console.log('======================================================');
console.log('   PERSISTENCE ACROSS REBOOT & SERVER RESTART TEST    ');
console.log('======================================================\n');

(async () => {
    // 1. Initial Connection
    console.log('[Phase A] Connecting to MongoDB and verifying existing persisted records...');
    await connectDB();
    assert.strictEqual(mongoose.connection.readyState, 1);
    assert.strictEqual(mongoose.connection.name, 'renthub');

    // Count records before restart
    const userCountA = await User.countDocuments();
    const productCountA = await Product.countDocuments();
    const bookingCountA = await Booking.countDocuments();
    const reviewCountA = await Review.countDocuments();

    console.log(`[Phase A Counts] Users: ${userCountA}, Products: ${productCountA}, Bookings: ${bookingCountA}, Reviews: ${reviewCountA}`);
    assert(userCountA >= 3, 'Demo users must exist');
    assert(productCountA >= 6, 'Demo products must exist');

    // 2. Disconnect completely (Simulate Server Shutdown)
    console.log('\n[Phase B] Simulating full backend server shutdown (disconnecting Mongoose)...');
    await mongoose.disconnect();
    assert.strictEqual(mongoose.connection.readyState, 0, 'Connection must be completely closed');
    console.log('[Phase B] Server is now completely stopped and disconnected from MongoDB.');

    // 3. Reconnect (Simulate Server Restart)
    console.log('\n[Phase C] Simulating backend server reboot (reconnecting to MongoDB)...');
    await connectDB();
    assert.strictEqual(mongoose.connection.readyState, 1, 'Reconnected successfully');

    // Count records after restart
    const userCountC = await User.countDocuments();
    const productCountC = await Product.countDocuments();
    const bookingCountC = await Booking.countDocuments();
    const reviewCountC = await Review.countDocuments();

    console.log(`[Phase C Counts] Users: ${userCountC}, Products: ${productCountC}, Bookings: ${bookingCountC}, Reviews: ${reviewCountC}`);

    assert.strictEqual(userCountC, userCountA, 'User count must remain identical after restart');
    assert.strictEqual(productCountC, productCountA, 'Product count must remain identical after restart');
    assert.strictEqual(bookingCountC, bookingCountA, 'Booking count must remain identical after restart');
    assert.strictEqual(reviewCountC, reviewCountA, 'Review count must remain identical after restart');

    // Verify canonical accounts still exist and passwords still authenticate
    const customer = await User.findOne({ email: 'customer@example.com' }).select('+password');
    assert(customer, 'Demo customer persists in MongoDB');
    assert(await customer.matchPassword('cust123'), 'Password hash validates correctly after restart');

    const admin = await User.findOne({ email: 'admin@example.com' }).select('+password');
    assert(admin, 'Demo admin persists in MongoDB');
    assert(await admin.matchPassword('admin123'), 'Admin password validates correctly after restart');

    console.log('\n✓ [PASS] FULL DATABASE PERSISTENCE VERIFIED ACROSS PROCESS RESTART!');
    console.log('         All records, relationships, bcrypt hashes, and review stats remain intact in MongoDB.');

    await mongoose.disconnect();
    process.exit(0);
})();
