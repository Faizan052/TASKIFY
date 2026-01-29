const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const { generateOTP, sendPasswordResetOTP, sendPasswordChangedEmail, sendNewPasswordEmail } = require('../utils/emailService');

// Step 1: Request Password Reset (Send OTP or Create Request)
router.post('/forgot-password', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        res.status(400);
        throw new Error('Email is required');
    }

    const trimmedEmail = email.trim().toLowerCase();

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

        return res.json({
            message: 'OTP sent to your email',
            email: trimmedEmail,
            userType: 'admin',
            userName: admin.username || 'Admin',
            role: 'admin',
            requiresOTP: true
        });
    }

    // Check if user exists
    const user = await User.findOne({ email: trimmedEmail });
    if (!user) {
        res.status(404);
        throw new Error('No account found with this email');
    }

    // All users (including HR and Manager): Send OTP directly
    const otp = generateOTP();
    
    await PasswordReset.deleteMany({ email: trimmedEmail });

    await PasswordReset.create({
        email: trimmedEmail,
        userType: 'user',
        role: user.role,
        otp,
        status: 'otp-sent'
    });

    await sendPasswordResetOTP(trimmedEmail, otp, user.name);

    res.json({
        message: 'OTP sent to your email',
        email: trimmedEmail,
        userType: 'user',
        userName: user.name,
        role: user.role,
        requiresOTP: true
    });
}));

// Step 2: Verify OTP
router.post('/verify-reset-otp', asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        res.status(400);
        throw new Error('Email and OTP are required');
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Find password reset request
    const resetRequest = await PasswordReset.findOne({
        email: trimmedEmail,
        otp: otp.trim(),
        status: 'otp-sent',
        expiresAt: { $gt: new Date() }
    });

    if (!resetRequest) {
        res.status(400);
        throw new Error('Invalid or expired OTP');
    }

    // Update status to verified
    resetRequest.status = 'otp-verified';
    await resetRequest.save();

    res.json({
        message: 'OTP verified successfully. You can now reset your password.',
        email: trimmedEmail,
        userType: resetRequest.userType
    });
}));

// Step 3: Reset Password
router.post('/reset-password', asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body;

    if (!email || !newPassword) {
        res.status(400);
        throw new Error('Email and new password are required');
    }

    if (newPassword.length < 8) {
        res.status(400);
        throw new Error('Password must be at least 8 characters');
    }

    const trimmedEmail = email.trim().toLowerCase();

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
