const { generateOTP, sendPasswordResetOTP } = require('./utils/emailService');

(async () => {
  console.log('\n=== Testing Password Reset Flow (Dev Mode) ===\n');
  
  // Simulate HR user requesting password reset
  const otp = generateOTP();
  console.log('Generated OTP:', otp);
  
  try {
    await sendPasswordResetOTP('hr@example.com', otp, 'HR User');
    console.log('\n✅ Password reset OTP would be sent to hr@example.com');
  } catch (err) {
    console.error('Error:', err);
  }

  // Simulate Manager user requesting password reset
  const otp2 = generateOTP();
  console.log('\nGenerated OTP for Manager:', otp2);
  
  try {
    await sendPasswordResetOTP('manager@example.com', otp2, 'Manager User');
    console.log('\n✅ Password reset OTP would be sent to manager@example.com');
  } catch (err) {
    console.error('Error:', err);
  }

  console.log('\n=== Test Complete ===\n');
})();
