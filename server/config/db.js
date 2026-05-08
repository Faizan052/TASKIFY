const mongoose = require('mongoose');

const LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/taskify';

const connectDB = async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const preferredUri = LOCAL_MONGO_URI;

    try {
        const conn = await mongoose.connect(preferredUri);
        if (!isProd) {
            console.log(`MongoDB Connected: ${conn.connection.host}`);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;