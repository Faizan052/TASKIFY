const nodemailer = require('nodemailer');

// Helper for development logging
const isDev = process.env.NODE_ENV !== 'production';
const logDev = (message) => {
    if (isDev) console.log(message);
};

// Create transporter based on environment variables
const createTransporter = () => {
    const config = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    };

    if (!config.auth.user || !config.auth.pass) {
        if (isDev) console.warn('⚠️ SMTP credentials not configured. Email sending will be simulated.');
        return null;
    }

    return nodemailer.createTransport(config);
};

// Generate 6-digit OTP
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp, userName = 'User') => {
    const transporter = createTransporter();
    
    if (!transporter) {
        logDev(`📧 OTP EMAIL (Dev): ${email} - Code: ${otp}`);
        return { success: true, message: 'OTP logged to console (dev mode)' };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Your OTP Code for Registration',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">🎯 TASKIFY</h1>
                        <p style="margin: 10px 0 0 0;">Email Verification</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName}!</h2>
                        <p>Thank you for registering with TASKIFY. To complete your registration, please use the following One-Time Password (OTP):</p>
                        
                        <div class="otp-box">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">Your OTP Code</p>
                            <div class="otp-code">${otp}</div>
                            <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px;">This code will expire in 10 minutes</p>
                        </div>

                        <div class="warning">
                            <strong>⚠️ Security Notice:</strong>
                            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>Never share this code with anyone</li>
                                <li>TASKIFY will never ask for your OTP via phone or email</li>
                                <li>If you didn't request this code, please ignore this email</li>
                            </ul>
                        </div>

                        <p>If you have any questions, feel free to contact our support team.</p>
                        
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ OTP email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending OTP email:', error);
        throw new Error('Failed to send OTP email. Please check your email configuration.');
    }
};

// Send Welcome Email (optionally include temporary password)
const sendWelcomeEmail = async (email, userName, role, password = null) => {
    const transporter = createTransporter();
    
    if (!transporter) {
        logDev(`📧 WELCOME EMAIL (Dev): ${email}${password ? ' - Password: ' + password : ''}`);
        return { success: true };
    }

    const roleEmojis = {
        admin: '👑',
        hr: '👥',
        manager: '👔',
        developer: '💻',
        designer: '🎨',
        tester: '🔍',
        client: '🤝'
    };

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Welcome to TASKIFY! 🎉',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .welcome-box { background: white; border-radius: 10px; padding: 25px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .feature { display: inline-block; width: 45%; margin: 10px 2%; padding: 15px; background: #f3f4f6; border-radius: 8px; }
                    .btn { display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; margin: 15px 0; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0; font-size: 48px;">🎯</h1>
                        <h1 style="margin: 10px 0;">Welcome to TASKIFY!</h1>
                        <p style="margin: 10px 0; font-size: 18px;">Your project management journey starts here</p>
                    </div>
                    <div class="content">
                        <div class="welcome-box">
                            <h2>Hello ${userName}! ${roleEmojis[role] || '👋'}</h2>
                            <p>We're thrilled to have you join TASKIFY as a <strong>${role.charAt(0).toUpperCase() + role.slice(1)}</strong>!</p>
                            <p>Your account has been successfully created and you're all set to start collaborating with your team.</p>
                        </div>

                        ${password ? `
                        <div style="background:white;border:2px solid #e6eefc;padding:20px;border-radius:8px;margin:20px 0;">
                            <h3 style="margin:0 0 10px 0;">Account Credentials</h3>
                            <p style="margin:0;">Username: <strong>${email}</strong></p>
                            <p style="margin:5px 0 0 0;">Password: <strong style="word-break:break-all;">${password}</strong></p>
                            <p style="margin:10px 0 0 0;font-size:13px;color:#6b7280;">Please change your password after first login for security.</p>
                        </div>
                        ` : ''}

                        <h3 style="color: #667eea;">🚀 What's Next?</h3>
                        <div style="margin: 20px 0;">
                            <div class="feature">
                                <strong>📋 View Tasks</strong><br>
                                <small>Access and manage your assigned tasks</small>
                            </div>
                            <div class="feature">
                                <strong>👥 Collaborate</strong><br>
                                <small>Work with your team seamlessly</small>
                            </div>
                            <div class="feature">
                                <strong>📊 Track Progress</strong><br>
                                <small>Monitor your project status in real-time</small>
                            </div>
                            <div class="feature">
                                <strong>💬 Communicate</strong><br>
                                <small>Stay connected with team messaging</small>
                            </div>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" class="btn">Go to Dashboard</a>
                        </div>

                        <div style="background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <strong>💡 Pro Tip:</strong> Complete your profile to help your team recognize you better!
                        </div>
                        
                        <div class="footer">
                            <p>Need help getting started? Contact our support team anytime.</p>
                            <p style="margin-top: 20px;"><strong>Happy Task Managing!</strong><br>The TASKIFY Team</p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Welcome email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending welcome email:', error);
        return { success: false };
    }
};

// Send Password Reset OTP
const sendPasswordResetOTP = async (email, otp, userName = 'User') => {
    const transporter = createTransporter();
    
    if (!transporter) {
        logDev(`📧 PASSWORD RESET OTP (Dev): ${email} - OTP: ${otp}`);
        return { success: true };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Password Reset OTP 🔒',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .otp-box { background: white; border: 2px dashed #ef4444; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0; }
                    .otp-code { font-size: 36px; font-weight: bold; color: #ef4444; letter-spacing: 8px; }
                    .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">🔒 TASKIFY</h1>
                        <p style="margin: 10px 0 0 0;">Password Reset Request</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName}!</h2>
                        <p>We received a request to reset your password. To proceed with the password reset, please use the following One-Time Password (OTP):</p>
                        
                        <div class="otp-box">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">Your Reset OTP</p>
                            <div class="otp-code">${otp}</div>
                            <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px;">This code will expire in 10 minutes</p>
                        </div>

                        <div class="warning">
                            <strong>⚠️ Security Alert:</strong>
                            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>If you didn't request this password reset, please ignore this email</li>
                                <li>Never share this code with anyone, including TASKIFY support</li>
                                <li>This OTP can only be used once</li>
                            </ul>
                        </div>

                        <p>After verifying the OTP, you'll be able to set a new password for your account.</p>
                        
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Security Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Password reset OTP sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending password reset OTP:', error);
        throw new Error('Failed to send password reset OTP.');
    }
};

// Send Password Changed Confirmation
const sendPasswordChangedEmail = async (email, userName = 'User') => {
    const transporter = createTransporter();
    
    if (!transporter) {
        logDev(`📧 PASSWORD CHANGED EMAIL (Dev): ${email}`);
        return { success: true };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Password Successfully Changed ✅',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .success-box { background: #d1fae5; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; border-radius: 5px; }
                    .info-box { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0; font-size: 48px;">✅</h1>
                        <h1 style="margin: 10px 0;">Password Changed</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName}!</h2>
                        
                        <div class="success-box">
                            <strong>✓ Your password has been successfully changed!</strong>
                        </div>

                        <div class="info-box">
                            <p><strong>🕐 Changed on:</strong> ${new Date().toLocaleString()}</p>
                            <p><strong>🔒 Status:</strong> Active and Secure</p>
                        </div>

                        <p>You can now use your new password to log in to your TASKIFY account.</p>

                        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;">
                            <strong>⚠️ Didn't make this change?</strong><br>
                            If you didn't change your password, please contact our support team immediately to secure your account.
                        </div>
                        
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Security Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Password changed email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending password changed email:', error);
        return { success: false };
    }
};

// Send New Password to HR/Manager
const sendNewPasswordEmail = async (email, userName, newPassword, role) => {
    const transporter = createTransporter();
    
    if (!transporter) {
        logDev(`📧 NEW PASSWORD EMAIL (Dev): ${email} - Password: ${newPassword}`);
        return { success: true };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Your New Password 🔑',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .password-box { background: white; border: 2px solid #667eea; border-radius: 10px; padding: 25px; text-align: center; margin: 20px 0; }
                    .password { font-size: 24px; font-weight: bold; color: #667eea; letter-spacing: 2px; background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 10px 0; word-break: break-all; }
                    .warning { background: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 5px; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">🔑 TASKIFY</h1>
                        <p style="margin: 10px 0 0 0;">Password Reset Completed</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName}!</h2>
                        <p>Your password has been reset by your ${role === 'manager' ? 'HR' : 'Administrator'}. Here is your new temporary password:</p>
                        
                        <div class="password-box">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">Your New Password</p>
                            <div class="password">${newPassword}</div>
                            <p style="margin: 10px 0 0 0; color: #6b7280; font-size: 12px;">⚠️ Please save this password securely</p>
                        </div>

                        <div class="warning">
                            <strong>🔒 Important Security Steps:</strong>
                            <ol style="margin: 10px 0 0 0; padding-left: 20px;">
                                <li>Save this password immediately in a secure location</li>
                                <li>We recommend changing this password after your first login</li>
                                <li>Never share your password with anyone</li>
                                <li>Use a strong, unique password for your account</li>
                            </ol>
                        </div>

                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" style="display: inline-block; padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px;">Login to TASKIFY</a>
                        </div>
                        
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ New password email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending new password email:', error);
        return { success: false };
    }
};

const sendTaskStageEmail = async ({ email, userName = 'Team member', roleLabel = 'Team', taskTitle, message }) => {
    const transporter = createTransporter();

    if (!transporter) {
        logDev(`📧 TASK STAGE EMAIL (Dev): ${email} - ${taskTitle} - ${message}`);
        return { success: true };
    }

    const safeTaskTitle = taskTitle || 'your task';
    const safeMessage = message || 'Task status has been updated.';

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `TASKIFY - Update for ${safeTaskTitle}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #0ea5e9 0%, #0f766e 100%); color: white; padding: 28px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .card { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                    .tag { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">TASKIFY</h1>
                        <p style="margin: 8px 0 0 0;">Workflow Update</p>
                    </div>
                    <div class="content">
                        <p>Hello ${userName} (${roleLabel}),</p>
                        <div class="card">
                            <div class="tag">Task Update</div>
                            <h2 style="margin: 12px 0 6px 0;">${safeTaskTitle}</h2>
                            <p style="margin: 0;">${safeMessage}</p>
                        </div>
                        <p>Please log in to TASKIFY to view details and next steps.</p>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" style="display: inline-block; padding: 10px 22px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px;">Open Dashboard</a>
                        </div>
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Task stage email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending task stage email:', error);
        return { success: false };
    }
};

const sendAccountApprovalEmail = async ({ email, userName = 'User' }) => {
    const transporter = createTransporter();

    if (!transporter) {
        logDev(`📧 ACCOUNT APPROVAL EMAIL (Dev): ${email}`);
        return { success: true };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Your Account is Approved ✅',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .card { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0; font-size: 36px;">Welcome to TASKIFY</h1>
                        <p style="margin: 8px 0 0 0;">Your account is now active</p>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName}!</h2>
                        <div class="card">
                            <p>Congratulations! Your registration has been approved by HR.</p>
                            <p>You can now log in to your TASKIFY dashboard and start collaborating.</p>
                        </div>
                        <div style="text-align: center; margin: 24px 0;">
                            <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}" style="display: inline-block; padding: 12px 24px; background: #22c55e; color: white; text-decoration: none; border-radius: 8px;">Open Dashboard</a>
                        </div>
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Account approval email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending account approval email:', error);
        return { success: false };
    }
};

const sendAccountRejectionEmail = async ({ email, userName = 'User', reason = '' }) => {
    const transporter = createTransporter();

    if (!transporter) {
        logDev(`📧 ACCOUNT REJECTION EMAIL (Dev): ${email}`);
        return { success: true };
    }

    const mailOptions = {
        from: `"TASKIFY" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'TASKIFY - Registration Update',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
                    .card { background: white; border-radius: 10px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
                    .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0; font-size: 32px;">Registration Update</h1>
                    </div>
                    <div class="content">
                        <h2>Hello ${userName},</h2>
                        <div class="card">
                            <p>We are sorry to inform you that your registration was not approved at this time.</p>
                            ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                            <p>You will not be able to log in with this account. If you believe this is a mistake, please contact HR for assistance.</p>
                        </div>
                        <div class="footer">
                            <p>Best regards,<br><strong>TASKIFY Team</strong></p>
                            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                            <p style="font-size: 12px;">This is an automated email. Please do not reply to this message.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        logDev(`✅ Account rejection email sent to ${email}`);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ Error sending account rejection email:', error);
        return { success: false };
    }
};

module.exports = {
    generateOTP,
    sendOTPEmail,
    sendWelcomeEmail,
    sendPasswordResetOTP,
    sendPasswordChangedEmail,
    sendNewPasswordEmail,
    sendTaskStageEmail,
    sendAccountApprovalEmail,
    sendAccountRejectionEmail
};
