const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    userType: {
        type: String,
        required: true,
        enum: ['admin', 'user', 'hr-request', 'manager-request']
    },
    role: {
        type: String,
        enum: ['admin', 'hr', 'manager', 'developer', 'designer', 'tester', 'client']
    },
    otp: {
        type: String
    },
    otpAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },
    newPassword: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'otp-sent', 'otp-verified', 'completed'],
        default: 'pending'
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'requestedByModel'
    },
    requestedByModel: {
        type: String,
        enum: ['User', 'Admin']
    },
    processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'processedByModel'
    },
    processedByModel: {
        type: String,
        enum: ['User', 'Admin']
    },
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    }
}, {
    timestamps: true
});

// Auto-delete expired password resets
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordReset = mongoose.model('PasswordReset', passwordResetSchema);

module.exports = PasswordReset;
