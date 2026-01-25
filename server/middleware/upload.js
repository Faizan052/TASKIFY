const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadsRoot = path.join(__dirname, '..', 'uploads');

const ensureUploadsDir = () => {
    if (!fs.existsSync(uploadsRoot)) {
        fs.mkdirSync(uploadsRoot, { recursive: true });
    }
};

ensureUploadsDir();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsRoot);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
        cb(null, `${timestamp}-${safeName}`);
    }
});

const allowedMime = [
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-rar',
    'application/rar',
    'application/x-compressed',
    'application/octet-stream',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html',
    'text/css',
    'application/javascript',
    'text/javascript',
    'application/x-javascript',
    'application/json',
    'application/xml',
    'text/plain',
    'image/png',
    'image/jpeg'
];

const allowByExtension = (filename) => {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return (
        lower.endsWith('.rar') ||
        lower.endsWith('.zip') ||
        lower.endsWith('.7z') ||
        lower.endsWith('.css') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.endsWith('.js') ||
        lower.endsWith('.map') ||
        lower.endsWith('.scss') ||
        lower.endsWith('.less') ||
        lower.endsWith('.txt')
    );
};

const fileFilter = (req, file, cb) => {
    if (allowedMime.includes(file.mimetype) || allowByExtension(file.originalname)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        // Accept larger archives (e.g. multi-stage RAR uploads)
        fileSize: 200 * 1024 * 1024
    }
});

module.exports = upload;
