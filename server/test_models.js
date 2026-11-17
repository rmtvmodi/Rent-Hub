// server/test_models.js
// Verification script to validate all 7 Phase 1 Mongoose Schemas & Virtuals

import assert from 'assert';
import mongoose from 'mongoose';
import User from './models/User.js';
import Product from './models/Product.js';
import Booking from './models/Booking.js';
import Payment from './models/Payment.js';
import Review from './models/Review.js';
import Notification from './models/Notification.js';
import Wishlist from './models/Wishlist.js';

console.log('--- STARTING PHASE 1 MONGOOSE MODELS VERIFICATION ---');

// 1. User Model
const userDoc = new User({
    name: 'Test Customer',
    email: 'customer@example.com',
    password: 'password123',
    role: 'customer'
});
assert.strictEqual(userDoc.name, 'Test Customer');
assert.strictEqual(userDoc.role, 'customer');
assert.strictEqual(userDoc.user_id, userDoc._id.toString(), 'User virtual user_id works');
console.log('✓ [PASS] User Model & Virtuals verified');

// 2. Product Model
const productDoc = new Product({
    owner: userDoc._id,
    title: 'Sony Alpha A7 IV',
    description: 'Professional camera',
    category: 'Cameras',
    price_per_day: 850,
    image: 'https://example.com/camera.jpg'
});
assert.strictEqual(productDoc.approval_status, 'approved', 'Rule: approval_status defaults to approved');
assert.strictEqual(productDoc.availability, true);
assert.strictEqual(productDoc.product_id, productDoc._id.toString(), 'Product virtual product_id works');
console.log('✓ [PASS] Product Model & Defaults verified (approved and published immediately by default)');

// 3. Booking Model
const start = new Date('2026-11-10');
const end = new Date('2026-11-15');
const bookingDoc = new Booking({
    customer: userDoc._id,
    product: productDoc._id,
    owner: userDoc._id,
    start_date: start,
    end_date: end,
    total_price: 4250
});
assert.strictEqual(bookingDoc.status, 'Requested');
assert.strictEqual(bookingDoc.booking_id, bookingDoc._id.toString(), 'Booking virtual booking_id works');
assert(bookingDoc.canTransitionTo('Accepted'), 'Booking can transition to Accepted');
assert(bookingDoc.canTransitionTo('Rejected'), 'Booking can transition to Rejected');
assert(!bookingDoc.canTransitionTo('Completed'), 'Booking cannot jump directly from Requested to Completed');
console.log('✓ [PASS] Booking Model, Dates & State Transition rules verified');

// 4. Payment Model
const paymentDoc = new Payment({
    booking: bookingDoc._id,
    customer: userDoc._id,
    amount: 4250,
    method: 'UPI',
    reference_id: 'SIM-UPI-TEST-123'
});
assert.strictEqual(paymentDoc.is_simulated, true, 'Payment is explicitly simulated');
assert.strictEqual(paymentDoc.payment_id, paymentDoc._id.toString(), 'Payment virtual payment_id works');
console.log('✓ [PASS] Payment Model & Simulated flag verified');

// 5. Review Model
const reviewDoc = new Review({
    customer: userDoc._id,
    product: productDoc._id,
    booking: bookingDoc._id,
    rating: 5,
    comment: 'Exceptional camera quality!'
});
assert.strictEqual(reviewDoc.rating, 5);
assert.strictEqual(reviewDoc.review_id, reviewDoc._id.toString(), 'Review virtual review_id works');
console.log('✓ [PASS] Review Model verified');

// 6. Notification Model
const notifDoc = new Notification({
    user: userDoc._id,
    message: 'Your booking has been approved',
    type: 'booking'
});
assert.strictEqual(notifDoc.read, false);
assert.strictEqual(notifDoc.notification_id, notifDoc._id.toString(), 'Notification virtual notification_id works');
console.log('✓ [PASS] Notification Model verified');

// 7. Wishlist Model
const wishDoc = new Wishlist({
    customer: userDoc._id,
    product: productDoc._id
});
assert.strictEqual(wishDoc.wishlist_id, wishDoc._id.toString(), 'Wishlist virtual wishlist_id works');
console.log('✓ [PASS] Wishlist Model verified');

console.log('\n========================================');
console.log('ALL 7 MONGOOSE MODELS VERIFIED SUCCESSFULLY');
console.log('========================================\n');
process.exit(0);
