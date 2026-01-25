# Email OTP Setup Guide

## Overview
The TASKIFY system uses email-based OTP (One-Time Password) verification for user registration to ensure valid email addresses.

## How It Works
1. User enters registration details (name, email, password, role)
2. System validates email format and sends a 6-digit OTP to the email
3. OTP is valid for 10 minutes
4. User enters OTP to complete registration
5. Account is created only after successful OTP verification

## Configuration

### For Development (Console Logging)
If you don't configure SMTP settings, OTPs will be logged to the console. This is useful for local development.

**No configuration needed!** Just start the server and check console output for OTP codes.

### For Production (Email Sending)

#### Option 1: Gmail Setup (Recommended for testing)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password:**
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Copy the 16-character password

3. **Add to .env file:**
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

#### Option 2: Other SMTP Services

**SendGrid:**
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

**Outlook/Hotmail:**
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

**Custom SMTP:**
```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
```

## Security Notes

- OTPs expire after 10 minutes
- MongoDB TTL index automatically deletes expired OTPs
- Each new OTP request invalidates previous ones for the same email
- OTP is deleted immediately after successful registration
- Email addresses are validated and normalized (lowercase, trimmed)

## Testing

### Development Mode (No Email)
1. Start server without SMTP configuration
2. Register a user
3. Check console output for: `OTP Code: 123456`
4. Use the displayed OTP to complete registration

### Production Mode (With Email)
1. Configure SMTP settings in `.env`
2. Register with a real email address
3. Check email inbox for OTP
4. Complete registration with received OTP

## Troubleshooting

**OTP not received:**
- Check spam/junk folder
- Verify SMTP credentials are correct
- Check server console for error messages
- Try development mode to verify system works

**"Failed to send OTP":**
- SMTP credentials may be incorrect
- Gmail: Ensure App Password is used, not regular password
- Check internet connection
- Verify SMTP_HOST and SMTP_PORT are correct

**"Invalid or expired OTP":**
- OTP expires after 10 minutes
- Request a new OTP by clicking "Resend OTP"
- Ensure you're entering all 6 digits correctly

## API Endpoints

### Send OTP
```
POST /api/user/send-otp
POST /api/admin/send-otp

Body: {
  "email": "user@example.com",
  "name": "User Name",
  "role": "developer" // for user only
}

Response: {
  "message": "OTP sent to your email. Please check your inbox.",
  "email": "user@example.com"
}
```

### Register with OTP
```
POST /api/user/register
POST /api/admin/register

Body: {
  "name": "User Name",
  "email": "user@example.com",
  "password": "SecurePass123",
  "role": "developer", // for user only
  "otp": "123456"
}

Response: {
  "_id": "...",
  "name": "User Name",
  "email": "user@example.com",
  "role": "developer",
  "message": "Registration successful"
}
```

## Database Schema

### OTP Collection
```javascript
{
  email: String,           // Lowercase, trimmed email
  otp: String,            // 6-digit numeric code
  userType: String,       // 'admin' or 'user'
  verified: Boolean,      // Always false (deleted on verification)
  expiresAt: Date,        // Auto-set to 10 minutes from creation
  createdAt: Date,        // Auto-generated
  updatedAt: Date         // Auto-generated
}
```

TTL Index: Documents auto-delete when `expiresAt` is reached.
