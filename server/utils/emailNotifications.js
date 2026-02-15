const { sendWelcomeEmail, sendNewPasswordEmail } = require('./emailService');

const isDev = process.env.NODE_ENV !== 'production';

const logFailure = (message, error) => {
    if (isDev) {
        console.log(message, error);
    }
};

const trySendWelcomeEmail = async ({ email, name, role, password, errorMessage }) => {
    try {
        await sendWelcomeEmail(email, name, role, password);
    } catch (error) {
        logFailure(errorMessage || 'Welcome email failed:', error);
    }
};

const trySendNewPasswordEmail = async ({ email, name, password, role, errorMessage }) => {
    try {
        await sendNewPasswordEmail(email, name, password, role);
    } catch (error) {
        logFailure(errorMessage || 'Failed to send updated credentials email:', error);
    }
};

module.exports = {
    trySendWelcomeEmail,
    trySendNewPasswordEmail
};
