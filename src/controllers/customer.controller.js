const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { success, error } = require("../utils/response");

const isValidPhone = (phone) => /^\d{8}$/.test(phone);

const register = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !isValidPhone(phone)) {
            return error(res, "ໝາຍເລກໂທລະສັບຕ້ອງມີ 8 ໂຕ", 400);
        }

        if (!password || password.length < 6) {
            return error(res, "ລະຫັດຜ່ານຕ້ອງມີຕົວອັກສອນຢ່າງໜ້ອຍ 6 ໂຕ", 400);
        }

        const existing = await db.query("SELECT cid FROM customer WHERE phone = $1", [phone]);

        if (existing.rows.length > 0) {
            return error(res, "ເບີໂທລະສັບນີ້ມີໃນລະບົບແລ້ວ", 409);
        }

        const hashed = await bcrypt.hash(password, 10);

        // username = phone
        const result = await db.query(
            `INSERT INTO customer (username, password, phone)
            VALUES ($1, $2, $3)
            RETURNING cid, username, phone`,
            [phone, hashed, phone]
        );

        return success(res, result.rows[0], "ລົງທະບຽນສຳເລັດ", 201);
    } catch (err) {
        if (err.code == "23505") return error(res, "ເບີໂທລະສັບນີ້ມີໃນລະບົບແລ້ວ", 409);
        return error(res, err.message);
    }
};

// เข้าสู่ระบบ (ใช้เบอร์โทร + password)
const login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return error(res, "ກະລຸນາປ້ອນເບີໂທລະສັບ ແລະ ລະຫັດຜ່ານຂອງທ່ານ", 400);
        }

        const result = await db.query("SELECT * FROM customer WHERE phone = $1", [phone]);
        if (result.rows.length === 0) {
            return error(res, "ເບີໂທລະສັບ ຫຼື ລະຫັດຜ່ານ ບໍ່ຖືກຕ້ອງ", 401);
        }

        const customer = result.rows[0];
        const isMatch = await bcrypt.compare(password, customer.password);
        if (!isMatch) {
            return error(res, "ເບີໂທລະສັບ ຫຼື ລະຫັດຜ່ານ ບໍ່ຖືກຕ້ອງ", 401);
        }

        // role: 'customer' เพื่อให้ middleware แยกแยะจาก token ของ user (พนักงาน)
        const token = jwt.sign(
            { cid: customer.cid, phone: customer.phone, role: "customer" },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        return success(res, {
            token,
            customer: { cid: customer.cid, phone: customer.phone }
        }, "ເຂົ້າສູ່ລະບົບສຳເລັດ");
    } catch (err) {
        return error(res, err.message);
    }
};

const me = async (req, res) => {
    try {
        const result = await db.query("SELECT cid, phone FROM customer WHERE cid = $1", [req.user.cid]);
        if (result.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນລູກຄ້າ", 401);
        return success(res, result.rows[0]);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { register, login, me };