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
    'text/plain',
    'image/png',
    'image/jpeg'
];

const allowedExtensions = new Set([
    '.rar', '.zip', '.7z', '.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'
]);

const allowByExtension = (filename) => {
    if (!filename) return false;
    const ext = path.extname(String(filename).toLowerCase());
    return allowedExtensions.has(ext);
};

const fileFilter = (req, file, cb) => {
    const extAllowed = allowByExtension(file.originalname);
    const mimeAllowed = allowedMime.includes(file.mimetype);
    if (extAllowed && mimeAllowed) {
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
        fileSize: 500 * 1024 * 1024
    }
});

module.exports = upload;
