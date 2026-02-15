const User = require('../models/User');
const Admin = require('../models/Admin');

const normalizeEmail = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const normalizeUsername = (value) => {
    if (typeof value !== 'string') return '';
    return value.trim().toLowerCase();
};

const assertUniqueIdentity = async ({ email = '', username = '', excludeUserId = null, excludeAdminId = null }) => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedUsername = normalizeUsername(username);

    if (normalizedEmail) {
        const userQuery = { email: normalizedEmail };
        if (excludeUserId) {
            userQuery._id = { $ne: excludeUserId };
        }
        const existingUser = await User.findOne(userQuery).select('_id');
        if (existingUser) {
            throw new Error('Email already exists in user records');
        }

        const adminQuery = { email: normalizedEmail };
        if (excludeAdminId) {
            adminQuery._id = { $ne: excludeAdminId };
        }
        const existingAdmin = await Admin.findOne(adminQuery).select('_id');
        if (existingAdmin) {
            throw new Error('Email already exists in admin records');
        }
    }

    if (normalizedUsername) {
        const adminQuery = { username: normalizedUsername };
        if (excludeAdminId) {
            adminQuery._id = { $ne: excludeAdminId };
        }
        const existingAdminByUsername = await Admin.findOne(adminQuery).select('_id');
        if (existingAdminByUsername) {
            throw new Error('Username already exists in admin records');
        }
    }
};

module.exports = {
    normalizeEmail,
    normalizeUsername,
    assertUniqueIdentity
};
