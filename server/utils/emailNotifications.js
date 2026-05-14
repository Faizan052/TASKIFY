const { sendWelcomeEmail, sendNewPasswordEmail, sendTaskStageEmail, sendAccountApprovalEmail, sendAccountRejectionEmail } = require('./emailService');

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

const trySendTaskStageEmail = async ({ email, name, roleLabel, taskTitle, message, errorMessage }) => {
    try {
        await sendTaskStageEmail({ email, userName: name, roleLabel, taskTitle, message });
    } catch (error) {
        logFailure(errorMessage || 'Failed to send task stage email:', error);
    }
};

const trySendAccountApprovalEmail = async ({ email, name, errorMessage }) => {
    try {
        await sendAccountApprovalEmail({ email, userName: name });
    } catch (error) {
        logFailure(errorMessage || 'Failed to send account approval email:', error);
    }
};

const trySendAccountRejectionEmail = async ({ email, name, reason, errorMessage }) => {
    try {
        await sendAccountRejectionEmail({ email, userName: name, reason });
    } catch (error) {
        logFailure(errorMessage || 'Failed to send account rejection email:', error);
    }
};

module.exports = {
    trySendWelcomeEmail,
    trySendNewPasswordEmail,
    trySendTaskStageEmail,
    trySendAccountApprovalEmail,
    trySendAccountRejectionEmail
};
