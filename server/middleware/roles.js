const roleRequired = (...allowedRoles) => {
    return (req, res, next) => {
        // protect middleware should have set req.user and req.isAdmin
        if (req.isAdmin) return next();
        if (!req.user) {
            res.status(401);
            return next(new Error('Not authorized'));
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403);
            return next(new Error('Forbidden: insufficient role'));
        }
        return next();
    };
};

module.exports = { roleRequired };
