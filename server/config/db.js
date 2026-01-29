const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const mongoUri = 'mongodb://127.0.0.1:27017/taskify';
        if (process.env.MONGODB_URI) {
            console.warn('Ignoring MONGODB_URI. Using local MongoDB at mongodb://127.0.0.1:27017/taskify');
        }
        const conn = await mongoose.connect(mongoUri);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`MongoDB Connected: ${conn.connection.host}`);
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;