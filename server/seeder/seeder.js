// server/seeder/seeder.js
// Database seeder script for RentHub development demo data

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import Product from '../models/Product.js';
import Booking from '../models/Booking.js';
import Payment from '../models/Payment.js';
import Review from '../models/Review.js';
import Notification from '../models/Notification.js';
import Wishlist from '../models/Wishlist.js';

// Load environment variables
dotenv.config();

// Safety Rule: Never run demo seeding in production
if (process.env.NODE_ENV === 'production') {
    console.error('[Seeder Error] Demo seeding is strictly disabled in production environments.');
    process.exit(1);
}

// Canonical Demo Accounts matching project specifications
const demoUsers = [
    {
        name: 'Demo Customer',
        email: 'customer@example.com',
        password: 'cust123', // Mongoose pre-save hook will hash this exactly once
        role: 'customer',
        phone: '1234567890'
    },
    {
        name: 'Demo Owner',
        email: 'owner@example.com',
        password: 'owner123',
        role: 'owner',
        phone: '0987654321'
    },
    {
        name: 'Demo Admin',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin', // Admin is exclusively seeded via this secure script
        phone: '5555555555'
    }
];

// Initial Demo Products matching frontend catalog
const demoProducts = [
    {
        title: 'Dell Latitude 7420 Laptop',
        category: 'Laptops',
        description: 'Intel i7 11th Gen, 16GB RAM, 512GB NVMe SSD, FHD display. Perfect for productivity and coding.',
        price_per_day: 800,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    },
    {
        title: 'Canon EOS 90D DSLR Camera',
        category: 'Cameras',
        description: '32.5 MP APS-C sensor, 4K video, dual pixel AF. Includes 18-135mm lens, battery and bag.',
        price_per_day: 1200,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    },
    {
        title: 'Trek Marlin 7 Mountain Bike',
        category: 'Bicycles',
        description: 'Lightweight aluminum frame, RockShox Judy fork, Shimano 1x10 drivetrain, hydraulic disc brakes.',
        price_per_day: 400,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    },
    {
        title: 'Epson Home Cinema 1080p Projector',
        category: 'Projectors',
        description: '3,400 lumens color and white brightness, HDMI inputs, built-in speaker. Ideal for movies and gaming.',
        price_per_day: 700,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    },
    {
        title: 'PlayStation 5 Console (Disc Edition)',
        category: 'Gaming',
        description: 'Ultra-high speed SSD, ray tracing, 4K 120Hz support. Includes 2 DualSense wireless controllers.',
        price_per_day: 1000,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    },
    {
        title: 'Bosch Cordless Hammer Drill Kit',
        category: 'Tools',
        description: '18V brushless motor, 2-speed gearbox, 20+2 clutch settings. Includes 2 Li-ion batteries and charger.',
        price_per_day: 350,
        availability: true,
        approval_status: 'approved',
        image: 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80',
        rating: 0,
        numReviews: 0
    }
];

export const seedData = async () => {
    try {
        await connectDB();

        console.log('[Seeder] Starting safe demo data seeding...');

        // 1. Seed Demo Users (Safe Upsert - prevents duplicates and preserves existing passwords)
        const userMap = {};
        for (const u of demoUsers) {
            let existing = await User.findOne({ email: u.email.toLowerCase() });
            if (!existing) {
                existing = await User.create(u);
                console.log(`[Seeder] Created demo user: ${u.email} (${u.role})`);
            } else {
                console.log(`[Seeder] Existing demo user preserved: ${u.email} (${u.role})`);
            }
            userMap[u.role] = existing;
        }

        // 2. Seed Demo Products linked to the Owner
        const ownerUser = userMap['owner'];
        const customerUser = userMap['customer'];

        if (ownerUser) {
            for (const prod of demoProducts) {
                const existingProd = await Product.findOne({ title: prod.title });
                if (!existingProd) {
                    await Product.create({
                        ...prod,
                        owner: ownerUser._id
                    });
                    console.log(`[Seeder] Created demo product: "${prod.title}"`);
                } else {
                    console.log(`[Seeder] Existing product preserved: "${prod.title}"`);
                }
            }
        }

        // 3. Seed sample completed booking & verified review for demonstration if not exists
        if (customerUser && ownerUser) {
            const sampleProduct = await Product.findOne({ title: 'Canon EOS 90D DSLR Camera' });
            if (sampleProduct) {
                let sampleBooking = await Booking.findOne({ product: sampleProduct._id, customer: customerUser._id });
                if (!sampleBooking) {
                    sampleBooking = await Booking.create({
                        customer: customerUser._id,
                        product: sampleProduct._id,
                        owner: ownerUser._id,
                        start_date: new Date('2026-10-01'),
                        end_date: new Date('2026-10-04'),
                        total_price: 3600,
                        status: 'Completed',
                        payment_status: 'Paid',
                        payment_method: 'UPI',
                        return_date: new Date('2026-10-04')
                    });

                    // Add verified review
                    await Review.create({
                        customer: customerUser._id,
                        product: sampleProduct._id,
                        booking: sampleBooking._id,
                        rating: 5,
                        comment: 'Excellent camera condition! Battery and 18-135mm lens worked flawlessly.'
                    });

                    // Recalculate rating
                    const stats = await Review.getAverageRating(sampleProduct._id);
                    await Product.findByIdAndUpdate(sampleProduct._id, {
                        rating: stats.average,
                        numReviews: stats.count
                    });

                    console.log('[Seeder] Created verified review sample for Canon EOS 90D.');
                }
            }
        }

        console.log('[Seeder] Demo data synchronization completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error(`[Seeder Error] Failed to seed database: ${error.message}`);
        process.exit(1);
    }
};

export const destroyData = async () => {
    try {
        await connectDB();
        console.log('[Seeder] Clearing all database collections...');
        await User.deleteMany();
        await Product.deleteMany();
        await Booking.deleteMany();
        await Payment.deleteMany();
        await Review.deleteMany();
        await Notification.deleteMany();
        await Wishlist.deleteMany();
        console.log('[Seeder] All database records cleared.');
        process.exit(0);
    } catch (error) {
        console.error(`[Seeder Error] Failed to destroy data: ${error.message}`);
        process.exit(1);
    }
};

// Handle CLI execution arguments: node seeder/seeder.js -d (destroy) or default (seed)
if (process.argv[1] && process.argv[1].endsWith('seeder.js')) {
    if (process.argv[2] === '-d' || process.argv[2] === '--destroy') {
        destroyData();
    } else {
        seedData();
    }
}
