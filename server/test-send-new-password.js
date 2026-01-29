const { sendNewPasswordEmail } = require('./utils/emailService');

(async () => {
  try {
    const res = await sendNewPasswordEmail('devtest@example.com', 'Dev Tester', 'NewTempPass!234', 'admin');
    console.log('sendNewPasswordEmail result:', res);
  } catch (err) {
    console.error('Error calling sendNewPasswordEmail:', err);
  }
})();
