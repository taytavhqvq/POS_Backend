const multer = require("multer");
const path = require("path");

// เก็บไฟล์สลิปไว้ที่ uploads/slips/ ตั้งชื่อไฟล์ใหม่กันชนกัน
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/slips/'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `slip_${req.params.orderid}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});

// รับเฉพาะไฟล์รูปภาพ
const fileFilter = (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files (jpg, png, webp) are allowed", false))
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;