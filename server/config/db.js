const mongoose = require('mongoose');

const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/taskify';

const shouldFallbackToLocal = (error) => {
    const message = String(error && error.message ? error.message : '').toLowerCase();
    return (
        message.includes('enotfound') ||
        message.includes('querysrv') ||
        message.includes('eai_again') ||
        message.includes('timed out')
    );
};

const connectDB = async () => {
    const envUri = process.env.MONGODB_URI;
    const isProd = process.env.NODE_ENV === 'production';
    const preferredUri = envUri || LOCAL_MONGO_URI;

    try {
        if (!envUri && isProd) {
            console.warn('MONGODB_URI is not set; falling back to local MongoDB URI.');
        }
        const conn = await mongoose.connect(preferredUri);
        if (!isProd) {
            console.log(`MongoDB Connected: ${conn.connection.host}`);
        }
    } catch (error) {
        // In development, if hosted DNS/remote URI is unavailable, fallback to local DB.
        if (!isProd && envUri && shouldFallbackToLocal(error)) {
            console.warn(`Primary MongoDB URI failed (${error.message}). Falling back to local MongoDB at ${LOCAL_MONGO_URI}.`);
            try {
                const localConn = await mongoose.connect(LOCAL_MONGO_URI);
                console.log(`MongoDB Connected (local fallback): ${localConn.connection.host}`);
                return;
            } catch (fallbackError) {
                console.error(`Local MongoDB fallback failed: ${fallbackError.message}`);
                process.exit(1);
            }
        }

        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;