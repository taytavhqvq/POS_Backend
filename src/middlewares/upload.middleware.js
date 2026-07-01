const multer = require('multer');
const path = require('path');

// ===== Slip Upload =====
const slipStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/slips/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `slip_${req.params.orderid}_${Date.now()}${ext}`);
    },
});

// ===== Product Image Upload =====
const productStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/products/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `product_${req.params.id || Date.now()}_${Date.now()}${ext}`);
    },
});

const imageFilter = (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files (jpg, png, webp) are allowed'), false);
};

const uploadSlip = multer({
    storage: slipStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadProduct = multer({
    storage: productStorage,
    fileFilter: imageFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { uploadSlip, uploadProduct };