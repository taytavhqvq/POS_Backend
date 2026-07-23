// Middleware สำหรับตรวจสอบ JWT Token
// ใช้ป้องกัน API ที่ต้อง login ก่อนเรียก เช่น สร้างออเดอร์, ดูสต็อก

const jwt = require("jsonwebtoken");
const { error } = require("../utils/response");

// ตรวจสอบว่ามี token และ token ถูกต้องไหม
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;  // รูปแบบ: "Bearer xxxxx"

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return error(res, "ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນ", 401);
    }

    const token = authHeader.split(" ")[1];   // ตัดคำว่า "Bearer " ออก เหลือแค่ token

    try {
        // verify token ด้วย secret key เดียวกับที่ใช้สร้างตอน login
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;    // เก็บข้อมูล user ไว้ใช้ใน controller ถัดไป (userid, username, state)
        next();     // ผ่าน ไปต่อได้
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return error(res, "Token ໝົດອາຍຸ ກະລຸນາເຂົ້າສູ່ລະບົບອີກຄັ້ງ", 401);
        }
        return error(res, "Invalid token", 401);
    }
};

// ตรวจสอบสิทธิ์ว่าเป็น role ที่กำหนดไหม เช่น authorize('Admin')
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.state)) {
            return error(res, "ທ່ານບໍ່ມີສິດໃນການເຂົ້າເຖິງລະບົບ", 403);
        }
        next();
    };
};

const authenticateCustomer = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return error(res, 'ກະລຸນາເຂົ້າສູ່ລະບົບກ່ອນໃຊ້ງານ', 401);
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== "customer") {
            return error(res, "Token ບໍ່ຖືກຕ້ອງສຳລັບລູກຄ້າຄົນນີ້", 403);
        }

        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return error(res, "Token ໝົດອາຍຸ ກະລຸນາເຂົ້າສູ່ລະບົບອີກຄັ້ງ", 401);
        }
        return error(res, "Invalid token", 401);
    }
};

module.exports = { authenticate, authorize, authenticateCustomer };