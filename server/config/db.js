// server/config/db.js
// MongoDB connection configuration using Mongoose with connection state tracking
import dns from 'node:dns';
import mongoose from 'mongoose';

// Track connection diagnostics
export const dbState = {
    status: 'disconnected', // 'disconnected', 'connecting', 'connected', 'failed'
    lastError: null,
    connectedAt: null,
    host: null,
    name: null
};

// Apply public DNS workaround only in local non-production environments when needed for SRV lookups
if (process.env.NODE_ENV !== 'production' && process.env.DISABLE_PUBLIC_DNS !== 'true') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

/**
 * Redact MongoDB credentials or full connection strings from log/error text.
 * Never expose username, password, or complete URI in logs.
 * @param {string} text
 * @returns {string}
 */
export const redactMongoCredentials = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/(mongodb(?:\+srv)?:\/\/)([^/\s@]+)@/gi, '$1***:***@');
};

export const connectDB = async () => {
    const isProduction = process.env.NODE_ENV === 'production';
    const mongoURI = process.env.MONGO_URI || (isProduction ? '' : 'mongodb://127.0.0.1:27017/renthub');

    if (!mongoURI) {
        dbState.status = 'failed';
        dbState.lastError = 'MONGO_URI environment variable is missing.';
        throw new Error('FATAL: MONGO_URI environment variable is required in production.');
    }

    dbState.status = 'connecting';

    try {
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: isProduction ? 10000 : 5000
        });

        dbState.status = 'connected';
        dbState.lastError = null;
        dbState.connectedAt = new Date().toISOString();
        dbState.host = conn.connection.host;
        dbState.name = conn.connection.name;

        console.log(`[RentHub DB] MongoDB Connected successfully (${conn.connection.name || 'database'})`);
        return conn;
    } catch (error) {
        const safeMessage = redactMongoCredentials(error.message || 'Connection failed');
        dbState.status = 'failed';
        dbState.lastError = safeMessage;
        dbState.host = null;
        dbState.name = null;

        console.error(`[RentHub DB ERROR] Could not establish connection to MongoDB.`);
        console.error(`[RentHub DB DETAILS] Error: ${safeMessage}`);
        if (!isProduction) {
            console.warn(`[RentHub DB ACTION REQUIRED] Ensure MongoDB is running or configure MONGO_URI in server/.env`);
        }

        if (isProduction) {
            throw new Error(`MongoDB connection failed in production: ${safeMessage}`);
        }
        return null;
    }
};

// Monitor connection events
mongoose.connection.on('disconnected', () => {
    if (dbState.status === 'connected') {
        dbState.status = 'disconnected';
    }
});

mongoose.connection.on('reconnected', () => {
    dbState.status = 'connected';
});

export default connectDB;
