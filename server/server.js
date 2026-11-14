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
import { parseAllowedOrigins, normalizeOrigin, validateProductionEnv } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables from server/.env regardless of working directory
dotenv.config({ path: path.join(__dirname, '.env') });

const isDirectRun = Boolean(
    process.argv[1] && (
        process.argv[1].endsWith('server.js') ||
        process.argv[1].endsWith('server')
    )
);
const shouldStartServer = (isDirectRun || process.env.START_SERVER === 'true') && process.env.NODE_ENV !== 'test';

// Validate critical production environment variables at startup
if (process.env.NODE_ENV === 'production') {
    try {
        const { warnings } = validateProductionEnv(process.env);
        warnings.forEach((w) => console.warn(`[RentHub Env Warning] ${w}`));
    } catch (envError) {
        console.error(`[RentHub Startup Error] ${envError.message}`);
        process.exit(1);
    }
}

// Route Imports
import authRoutes from './routes/authRoutes.js';
import productRoutes from './routes/productRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import wishlistRoutes from './routes/wishlistRoutes.js';
import notifRoutes from './routes/notifRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Connect to MongoDB Database (in production direct run, exit cleanly if DB fails)
const dbInitPromise = connectDB().catch((err) => {
    if (process.env.NODE_ENV === 'production' && shouldStartServer) {
        console.error(`[RentHub Startup Error] ${err.message}`);
        process.exit(1);
    }
    return null;
});

const app = express();
app.set('trust proxy', 1);

// Configure CORS for production and development origins
app.use(cors((req, callback) => {
    const origin = req.headers.origin;
    const isProduction = process.env.NODE_ENV === 'production';
    const allowedOrigins = parseAllowedOrigins(process.env);
    const corsBase = {
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    };

    if (!origin) {
        return callback(null, { ...corsBase, origin: true });
    }

    const normalized = normalizeOrigin(origin);
    if (allowedOrigins.includes(normalized)) {
        return callback(null, { ...corsBase, origin: true });
    }

    // Allow same-origin requests when Express serves both frontend and API on the same host
    const requestHost = req.get('host');
    if (requestHost) {
        try {
            if (new URL(normalized).host === requestHost) {
                return callback(null, { ...corsBase, origin: true });
            }
        } catch (e) {
            // Invalid Origin URL falls through to rejection
        }
    }

    if (!isProduction) {
        return callback(null, { ...corsBase, origin: true }); // Dev-friendly fallback
    }

    const corsErr = new Error('Origin blocked by CORS policy.');
    corsErr.status = 403;
    return callback(corsErr);
}));

// Body Parser Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// HTTP Request Logger Middleware
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
}

// Serve environment-backed frontend API configuration before static /js assets
app.get('/js/config.js', (req, res) => {
    const publicApiUrl = (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(
        `// Dynamically served frontend runtime configuration\n` +
        `export const FRONTEND_CONFIG = Object.freeze({\n` +
        `    apiUrl: ${JSON.stringify(publicApiUrl)},\n` +
        `    devApiUrl: 'http://localhost:5000/api',\n` +
        `    devStaticPorts: ['5500', '8000', '3000', '5173', '4173']\n` +
        `});\n`
    );
});

// Restrict static file serving exclusively to public frontend CSS and JS directories
app.use('/css', express.static(path.join(rootDir, 'css'), { dotfiles: 'deny' }));
app.use('/js', express.static(path.join(rootDir, 'js'), { dotfiles: 'deny' }));

// Whitelist only the public HTML pages (never expose server/, .env, seeder/, docs/, or scratch/)
const ALLOWED_HTML_PAGES = new Set([
    'index.html',
    'about.html',
    'products.html',
    'product-details.html',
    'login.html',
    'register.html',
    'forgot-password.html',
    'reset-password.html',
    'dashboard.html',
    'customer-dashboard.html',
    'owner-dashboard.html',
    'admin-dashboard.html',
    'payment.html'
]);

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
// Accurately reports HTTP 200 when DB is connected and HTTP 503 when disconnected/failed
app.get('/api/health', (req, res) => {
    const readyStateMap = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    const isProduction = process.env.NODE_ENV === 'production';
    const currentMongooseState = readyStateMap[mongoose.connection.readyState] || 'unknown';
    const computedState = dbState.status === 'failed' ? 'failed' : currentMongooseState;
    const isDbHealthy = mongoose.connection.readyState === 1 && dbState.status !== 'failed';

    res.status(isDbHealthy ? 200 : 503).json({
        status: isDbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        database: {
            status: computedState,
            readyState: mongoose.connection.readyState,
            ...(isProduction ? {} : { host: dbState.host || mongoose.connection.host || 'none' }),
            name: dbState.name || mongoose.connection.name || 'none',
            lastError: isProduction
                ? (dbState.lastError ? 'Database connection unavailable' : null)
                : dbState.lastError
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

// Explicitly serve whitelisted root HTML pages only
app.get('/:page', (req, res, next) => {
    if (ALLOWED_HTML_PAGES.has(req.params.page)) {
        return res.sendFile(path.join(rootDir, req.params.page));
    }
    return next();
});

// 404 Route Handler for undefined endpoints and non-public paths
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} not found on this server.`
    });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    if (process.env.NODE_ENV !== 'test') {
        console.error(`[Server Error] ${isProduction ? err.message : (err.stack || err.message)}`);
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

    const statusCode = err.status || 500;
    const safeMessage = (isProduction && statusCode >= 500)
        ? 'Internal Server Error'
        : (err.message || 'Internal Server Error');

    res.status(statusCode).json({
        success: false,
        message: safeMessage
    });
});

const PORT = Number(process.env.PORT) || 5000;

let serverInstance = null;
if (shouldStartServer) {
    if (process.env.NODE_ENV === 'production') {
        await dbInitPromise;
    }
    serverInstance = app.listen(PORT, () => {
        const mode = process.env.NODE_ENV || 'development';
        const location = mode === 'production' ? `port ${PORT}` : `http://localhost:${PORT}`;
        console.log(`[RentHub Server] Running on ${location} in ${mode} mode`);
    });
}
export const server = serverInstance;

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error(`[Unhandled Rejection] ${err.message}`);
});

export default app;
