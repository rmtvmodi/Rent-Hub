// server/config/db.js
// MongoDB connection configuration using Mongoose with connection state tracking

import mongoose from 'mongoose';

// Track connection diagnostics
export const dbState = {
    status: 'disconnected', // 'disconnected', 'connecting', 'connected', 'failed'
    lastError: null,
    connectedAt: null,
    host: null,
    name: null
};

export const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/renthub';
    dbState.status = 'connecting';

    try {
        const conn = await mongoose.connect(mongoURI, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout for friendly dev feedback
        });

        dbState.status = 'connected';
        dbState.lastError = null;
        dbState.connectedAt = new Date().toISOString();
        dbState.host = conn.connection.host;
        dbState.name = conn.connection.name;

        console.log(`[RentHub DB] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
        return conn;
    } catch (error) {
        dbState.status = 'failed';
        dbState.lastError = error.message;
        dbState.host = null;
        dbState.name = null;

        console.warn(`[RentHub DB WARNING] Could not establish live connection to MongoDB at: ${mongoURI}`);
        console.warn(`[RentHub DB DETAILS] Error: ${error.message}`);
        console.warn(`[RentHub DB ACTION REQUIRED] If using local MongoDB, ensure MongoDB service is started (e.g. net start MongoDB).`);
        console.warn(`                              If using cloud database, supply your MongoDB Atlas connection string in server/.env`);
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
