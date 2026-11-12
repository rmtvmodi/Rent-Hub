// server/seeder/provisionAdmin.js
// Secure CLI utility to provision a production Administrator account without hardcoded credentials.
// Usage (set environment variables securely in your shell/host):
//   ADMIN_NAME="Platform Admin" ADMIN_EMAIL="admin@yourdomain.com" ADMIN_PASSWORD="<strong-password>" node seeder/provisionAdmin.js

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import User from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const EMAIL_REGEX = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/;

function validateAdminInput({ name, email, password }) {
    if (!name || !name.trim()) {
        throw new Error('ADMIN_NAME environment variable is required.');
    }
    if (!email || !EMAIL_REGEX.test(email.trim())) {
        throw new Error('ADMIN_EMAIL environment variable must be a valid email address.');
    }
    if (!password || typeof password !== 'string') {
        throw new Error('ADMIN_PASSWORD environment variable is required.');
    }
    if (password.length < 12) {
        throw new Error('ADMIN_PASSWORD must be at least 12 characters long.');
    }
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /\d/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);
    if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
        throw new Error('ADMIN_PASSWORD must include uppercase, lowercase, numeric, and special characters.');
    }
    if (password.toLowerCase().includes('admin123') || password.toLowerCase().includes('password')) {
        throw new Error('ADMIN_PASSWORD must not contain common weak patterns.');
    }
}

export async function provisionAdmin() {
    const name = process.env.ADMIN_NAME;
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    const phone = process.env.ADMIN_PHONE || '';

    validateAdminInput({ name, email, password });

    await connectDB();
    if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection is not ready.');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
        console.error(`[Provision Admin] Refused: An account with email '${normalizedEmail}' already exists (role: ${existing.role}).`);
        process.exitCode = 1;
        return;
    }

    const admin = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password,
        role: 'admin',
        phone: phone.trim(),
        isActive: true
    });

    console.log(`[Provision Admin] Administrator account created successfully (id: ${admin._id.toString()}, email: ${admin.email}).`);
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('provisionAdmin.js');
if (isDirectRun) {
    provisionAdmin()
        .catch((err) => {
            console.error(`[Provision Admin Error] ${err.message}`);
            process.exitCode = 1;
        })
        .finally(async () => {
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }
        });
}
