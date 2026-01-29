const { sendWelcomeEmail } = require('./utils/emailService');

(async () => {
  try {
    const res = await sendWelcomeEmail('devtest@example.com', 'Dev Tester', 'manager', 'TempPass123!');
    console.log('sendWelcomeEmail result:', res);
  } catch (err) {
    console.error('Error calling sendWelcomeEmail:', err);
  }
})();
