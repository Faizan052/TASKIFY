const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');

const protect = async (req, res, next) => {
    let token;

    try {
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Check if the token belongs to an admin
            const admin = await Admin.findById(decoded.id).select('-password');
            if (admin) {
                req.user = admin;
                req.isAdmin = true;
                return next();
            }

            // Check if the token belongs to a user
            const user = await User.findById(decoded.id).select('-password');
            if (user) {
                req.user = user;
                req.isAdmin = false;
                return next();
            }

            res.status(401);
            return next(new Error('Not authorized'));
        }

        res.status(401);
        return next(new Error('Not authorized, no token'));
    } catch (error) {
        res.status(401);
        return next(new Error('Not authorized, token failed'));
    }
};

const adminOnly = (req, res, next) => {
    if (req.isAdmin) {
        return next();
    }
    res.status(403);
    return next(new Error('Not authorized as admin'));
};

module.exports = { protect, adminOnly };