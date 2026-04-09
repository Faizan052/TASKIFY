const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Admin = require('../models/Admin');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { generateOTP, sendPasswordResetOTP, sendPasswordChangedEmail } = require('../utils/emailService');
const { validateEmail, validatePassword } = require('../utils/validation');
const { normalizeEmail } = require('../utils/identity');
const { createRateLimiter } = require('../middleware/rateLimit');

const GENERIC_FORGOT_PASSWORD_RESPONSE = {
    message: 'If an account exists for this email, an OTP has been sent.',
    requiresOTP: true
};

const forgotPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => `${req.ip || 'ip'}:forgot:${normalizeEmail(req.body?.email || '')}`,
    message: 'Too many password reset requests. Please try again in a few minutes.'
});

const verifyOtpLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 12,
    keyGenerator: (req) => `${req.ip || 'ip'}:verify:${normalizeEmail(req.body?.email || '')}`,
    message: 'Too many OTP verification attempts. Please wait and try again.'
});

const resetPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 6,
    keyGenerator: (req) => `${req.ip || 'ip'}:reset:${normalizeEmail(req.body?.email || '')}`,
    message: 'Too many password reset attempts. Please try again later.'
});

// Step 1: Request Password Reset (Send OTP or Create Request)
router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
    const { email } = req.body;

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        res.status(400);
        throw new Error(emailValidation.error);
    }

    const trimmedEmail = normalizeEmail(emailValidation.email);

    // Check if user is admin
    const admin = await Admin.findOne({ email: trimmedEmail });
    if (admin) {
        // Admin: Send OTP directly
        const otp = generateOTP();
        
        // Delete any existing password reset requests for this email
        await PasswordReset.deleteMany({ email: trimmedEmail });

        // Create password reset request
        await PasswordReset.create({
            email: trimmedEmail,
            userType: 'admin',
            otp,
            status: 'otp-sent'
        });

        // Send OTP email
        await sendPasswordResetOTP(trimmedEmail, otp, admin.username || 'Admin');

        return res.json(GENERIC_FORGOT_PASSWORD_RESPONSE);
    }

    // Check if user exists
    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
        return res.json(GENERIC_FORGOT_PASSWORD_RESPONSE);
    }

    // All users (including HR and Manager): Send OTP directly
    const otp = generateOTP();
    
    await PasswordReset.deleteMany({ email: trimmedEmail });

    await PasswordReset.create({
        email: trimmedEmail,
        userType: 'user',
        role: user.role,
        otp,
        status: 'otp-sent',
        otpAttempts: 0,
        lockUntil: null
    });

    await sendPasswordResetOTP(trimmedEmail, otp, user.name);

    res.json(GENERIC_FORGOT_PASSWORD_RESPONSE);
}));

// Step 2: Verify OTP
router.post('/verify-reset-otp', verifyOtpLimiter, asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!otp) {
        res.status(400);
        throw new Error('OTP is required');
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        res.status(400);
        throw new Error(emailValidation.error);
    }

    const trimmedEmail = normalizeEmail(emailValidation.email);

    // Find the latest OTP request for this email
    const resetRequest = await PasswordReset.findOne({
        email: trimmedEmail,
        status: 'otp-sent'
    }).sort({ createdAt: -1 });

    if (!resetRequest || (resetRequest.expiresAt && resetRequest.expiresAt <= new Date())) {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    if (resetRequest.lockUntil && resetRequest.lockUntil > new Date()) {
        res.status(429);
        throw new Error('Too many invalid OTP attempts. Please request a new OTP.');
    }

    if (resetRequest.otp !== otp.trim()) {
        resetRequest.otpAttempts = (resetRequest.otpAttempts || 0) + 1;
        if (resetRequest.otpAttempts >= 5) {
            resetRequest.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
        }
        await resetRequest.save();
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    // Update status to verified
    resetRequest.status = 'otp-verified';
    resetRequest.otpAttempts = 0;
    resetRequest.lockUntil = null;
    await resetRequest.save();

    res.json({
        message: 'OTP verified successfully. You can now reset your password.',
        email: trimmedEmail,
        userType: resetRequest.userType
    });
}));

// Step 3: Reset Password
router.post('/reset-password', resetPasswordLimiter, asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body;

    const passwordValidation = validatePassword(newPassword, { minLength: 8 });
    if (!passwordValidation.valid) {
        res.status(400);
        throw new Error(passwordValidation.error);
    }

    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        res.status(400);
        throw new Error(emailValidation.error);
    }

    const trimmedEmail = normalizeEmail(emailValidation.email);

    // Find verified password reset request
    const resetRequest = await PasswordReset.findOne({
        email: trimmedEmail,
        status: 'otp-verified',
        expiresAt: { $gt: new Date() }
    });

    if (!resetRequest) {
        res.status(400);
        throw new Error('No verified reset request found. Please verify OTP first.');
    }

    // Update password based on user type
    if (resetRequest.userType === 'admin') {
        const admin = await Admin.findOne({ email: trimmedEmail });
        if (!admin) {
            res.status(404);
            throw new Error('Admin not found');
        }

        admin.password = newPassword;
        await admin.save();

        // Send confirmation email
        await sendPasswordChangedEmail(trimmedEmail, admin.username);

    } else {
        const user = await User.findOne({ email: trimmedEmail });
        if (!user) {
            res.status(404);
            throw new Error('User not found');
        }

        user.password = newPassword;
        await user.save();

        // Send confirmation email
        await sendPasswordChangedEmail(trimmedEmail, user.name);
    }

    // Update reset request status
    resetRequest.status = 'completed';
    await resetRequest.save();

    // Delete the reset request after successful password change
    await PasswordReset.deleteOne({ _id: resetRequest._id });

    res.json({
        message: 'Password reset successfully. You can now login with your new password.'
    });
}));

module.exports = router;
