const windows = new Map();

const defaultKeyGenerator = (req) => req.ip || req.headers['x-forwarded-for'] || 'global';

const createRateLimiter = ({
    windowMs = 15 * 60 * 1000,
    max = 10,
    keyGenerator = defaultKeyGenerator,
    statusCode = 429,
    message = 'Too many requests, please try again later.'
} = {}) => {
    return (req, res, next) => {
        const key = String(keyGenerator(req) || 'global');
        const now = Date.now();
        const windowStart = now - windowMs;

        const current = windows.get(key) || [];
        const recent = current.filter((timestamp) => timestamp > windowStart);

        if (recent.length >= max) {
            res.status(statusCode);
            return next(new Error(message));
        }

        recent.push(now);
        windows.set(key, recent);

        // Opportunistic cleanup of very old entries.
        if (windows.size > 5000) {
            for (const [storedKey, timestamps] of windows.entries()) {
                const filtered = timestamps.filter((timestamp) => timestamp > windowStart);
                if (filtered.length === 0) {
                    windows.delete(storedKey);
                } else {
                    windows.set(storedKey, filtered);
                }
            }
        }

        return next();
    };
};

module.exports = {
    createRateLimiter
};
