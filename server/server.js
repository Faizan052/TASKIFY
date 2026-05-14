const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

const app = express();

// Small hardening/perf tweak
app.disable('x-powered-by');

// Baseline security headers (helmet-style lightweight hardening)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// CORS - allow client origin(s)
const allowedOrigins = (process.env.CLIENT_URL || '').split(',').map(value => value.trim()).filter(Boolean);
allowedOrigins.push('http://localhost:5173', 'http://localhost:3000');
const uniqueOrigins = Array.from(new Set(allowedOrigins));
const allowAllOrigins = process.env.CORS_ALLOW_ALL === 'true' || process.env.NODE_ENV !== 'production';
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const isOriginAllowed = (origin) => {
    if (!origin) return true;
    if (allowAllOrigins) return true;
    if (uniqueOrigins.length === 0) return true;
    if (uniqueOrigins.includes(origin)) return true;
    if (localhostPattern.test(origin)) return true;
    return false;
};

app.use(cors({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            return callback(null, origin || true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded assets (cacheable but not immutable)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
    etag: true,
    lastModified: true,
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');

        const normalized = String(filePath || '').toLowerCase();
        const isArchive = normalized.endsWith('.zip') || normalized.endsWith('.rar') || normalized.endsWith('.7z');
        if (isArchive) {
            res.setHeader('Content-Disposition', 'attachment');
        }

        if (process.env.NODE_ENV === 'production') {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/hr', require('./routes/hrRoutes'));
app.use('/api/manager', require('./routes/managerRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

// If a built client exists, serve it (production). This allows you to build the
// React app into `client/dist` and let Express serve the static files.
if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(__dirname, '..', 'client', 'dist')
    app.use(express.static(clientDist, {
        etag: true,
        lastModified: true,
        // Vite outputs hashed asset filenames under /assets. Cache those aggressively.
        setHeaders: (res, filePath) => {
            const normalized = String(filePath || '').replace(/\\/g, '/')
            if (normalized.endsWith('/index.html')) {
                res.setHeader('Cache-Control', 'no-cache')
                return
            }

            if (normalized.includes('/assets/')) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
                return
            }

            // Other static files (icons, manifest, etc)
            res.setHeader('Cache-Control', 'public, max-age=3600')
        }
    }))

    // Serve index.html for unknown routes (SPA fallback)
    app.get('*', (req, res) => {
        // Don't override API routes
        if (req.path.startsWith('/api/')) return res.status(404).end()
        res.setHeader('Cache-Control', 'no-cache')
        res.sendFile(path.join(clientDist, 'index.html'))
    })
}

// Root route - provide a safe landing page in all environments.
app.get('/', (req, res) => {
    const clientDistIndex = path.join(__dirname, '..', 'client', 'dist', 'index.html')
    const legacyViewsIndex = path.join(__dirname, '..', 'views', 'index.html')

    if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDistIndex)) {
        return res.sendFile(clientDistIndex)
    }

    if (fs.existsSync(legacyViewsIndex)) {
        return res.sendFile(legacyViewsIndex)
    }

    return res.status(200).json({
        ok: true,
        message: 'TASKIFY backend is running',
        api: ['/api/admin', '/api/user', '/api/hr', '/api/manager']
    })
})

// Error handler
app.use((err, req, res, _next) => {
    if (err) {
        const name = err.name || 'Error';
        const url = req.originalUrl || req.url || '';
        console.error(`[${name}] ${req.method} ${url} -> ${err.message}`);
    }
    if (err && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
            message: 'File is too large. Maximum upload size is 500 MB.'
        });
        return;
    }

    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const DEFAULT_PORT = parseInt(process.env.PORT, 10) || 3000;

const listenWithPortFallback = (appInstance, initialPort, maxAttempts = 10) => {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const tryListen = (port) => {
            const server = appInstance.listen({ port, host: '0.0.0.0' }, () => {
                resolve({ server, port });
            });

            server.on('error', (err) => {
                if (err && err.code === 'EADDRINUSE' && attempts < maxAttempts) {
                    attempts += 1;
                    const nextPort = port + 1;
                    console.warn(`Port ${port} is already in use. Trying ${nextPort}...`);
                    return tryListen(nextPort);
                }
                reject(err);
            });
        };

        tryListen(initialPort);
    });
};

const start = async () => {
    try {
        await connectDB();
        const { port: portToUse } = await listenWithPortFallback(app, DEFAULT_PORT);
        process.env.PORT = portToUse;
        const url = `http://localhost:${portToUse}`;
        console.log(`Environment PORT=${process.env.PORT || '(not set)'} -> Server running on ${url}`);
        console.log(`Open ${url} in your browser (clickable in many terminals)`);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};

start();