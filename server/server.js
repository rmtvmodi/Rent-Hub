// server/server.js
// RentHub Backend API Server Entrypoint

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB, { dbState } from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Route Imports
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import notifRoutes from './routes/notifRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB Database
connectDB();

const app = express();

// Configure CORS for development origins
const allowedOrigins = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(',').map(url => url.trim())
    : [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:8000',
        'http://127.0.0.1:8000',
        'http://localhost:3000'
    ];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        if (process.env.NODE_ENV === 'production') {
            return callback(new Error('Origin blocked by CORS policy.'));
        }
        return callback(null, true); // Dev-friendly fallback
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parser Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logger Middleware
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// Serve static frontend files (HTML, CSS, JS, images)
app.use(express.static(rootDir));

// Base Route
app.get('/', (req, res) => {
    if (req.accepts('html')) {
        return res.sendFile(path.join(rootDir, 'index.html'));
    }
    res.json({
        name: 'RentHub REST API',
        tagline: 'Rent Before You Buy',
        version: '1.0.0',
        status: 'online',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            products: '/api/products',
            bookings: '/api/bookings',
            payments: '/api/payments',
            reviews: '/api/reviews',
            wishlists: '/api/wishlists',
            notifications: '/api/notifications',
            admin: '/api/admin'
        }
    });
});

// System Health Check Endpoint
// Accurately reports: 'connected', 'connecting', 'disconnected', 'failed'
app.get('/api/health', (req, res) => {
    const readyStateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    const currentMongooseState = readyStateMap[mongoose.connection.readyState] || 'unknown';
    const computedState = dbState.status === 'failed' ? 'failed' : currentMongooseState;

    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: {
            status: computedState,
            readyState: mongoose.connection.readyState,
            host: dbState.host || mongoose.connection.host || 'none',
            name: dbState.name || mongoose.connection.name || 'none',
            lastError: dbState.lastError
        },
        uptime: `${Math.floor(process.uptime())}s`,
        node_version: process.version,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Mount Marketplace API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/wishlists', wishlistRoutes);
app.use('/api/notifications', notifRoutes);
app.use('/api/admin', adminRoutes);

// 404 Route Handler for undefined endpoints
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} not found on this server.`
    });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    if (process.env.NODE_ENV !== 'test') {
        console.error(`[Server Error] ${err.stack || err.message}`);
    }

    // Mongoose duplicate key error
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue || {})[0] || 'field';
        return res.status(400).json({
            success: false,
            message: `A record with that ${field} already exists.`
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(val => val.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }

    // Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: `Invalid ID format: '${err.value}'.`
        });
    }

    // Default 500 internal server error
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 5000;

let serverInstance = null;
const isDirectRun = process.argv[1] && (
    process.argv[1].endsWith('server.js') || 
    process.argv[1].endsWith('server')
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
    serverInstance = app.listen(PORT, () => {
        console.log(`[RentHub Server] Running on http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
}
export const server = serverInstance;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error(`[Unhandled Rejection] ${err.message}`);
});

export default app;
