// Test email sending
require('dotenv').config();
const { sendOTPEmail } = require('./server/utils/emailService');

const testEmail = async () => {
    console.log('📧 Testing Email Configuration...\n');
    console.log('SMTP Settings:');
    console.log('- Host:', process.env.SMTP_HOST);
    console.log('- Port:', process.env.SMTP_PORT);
    console.log('- User:', process.env.SMTP_USER);
    console.log('- Pass:', process.env.SMTP_PASS ? '✓ Configured' : '✗ Missing');
    console.log('\nSending test OTP...\n');

    try {
        const result = await sendOTPEmail(
            'taskify52@gmail.com', // Sending to the same Gmail to test
            '123456',
            'Test User'
        );
        console.log('\n✅ Success!', result);
        console.log('\n📬 Check taskify52@gmail.com inbox for the test email!');
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
};

testEmail();
