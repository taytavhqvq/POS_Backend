const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { success, error } = require("../utils/response");

const isValidPhone = (phone) => /^\d{8}$/.test(phone);

const register = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !isValidPhone(phone)) {
            return error(res, "Phone number must be 8 digits", 400);
        }

        if (!password || password.length < 6) {
            return error(res, "Password must be at least 6 characters", 400);
        }

        const existing = await db.query("SELECT cid FROM customer WHERE phone = $1", [phone]);

        if (existing.rows.length > 0) {
            return error(res, "This phone number is already registered", 409);
        }

        const hashed = await bcrypt.hash(password, 10);

        // username = phone
        const result = await db.query(
            `INSERT INTO customer (username, password, phone)
            VALUES ($1, $2, $3)
            RETURNING cid, username, phone`,
            [phone, hashed, phone]
        );

        return success(res, result.rows[0], "Registration successful", 201);
    } catch (err) {
        if (err.code == "23505") return error(res, "This phone number is already registered", 409);
        return error(res, err.message);
    }
};

// เข้าสู่ระบบ (ใช้เบอร์โทร + password)
const login = async (req, res) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return error(res, "Please enter your phone number and password", 400);
        }

        const result = await db.query("SELECT * FROM customer WHERE phone = $1", [phone]);
        if (result.rows.length === 0) {
            return error(res, "Incorrect phone number or password", 401);
        }

        const customer = result.rows[0];
        const isMatch = await bcrypt.compare(password, customer.password);
        if (!isMatch) {
            return error(res, "Incorrect phone number or password", 401);
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
        }, "Login succesful");
    } catch (err) {
        return error(res, err.message);
    }
};

const me = async (req, res) => {
    try {
        const result = await db.query("SELECT cid, phone FROM customer WHERE cid = $1", [req.user.cid]);
        if (result.rows.length === 0) return error(res, "Customer not found", 401);
        return success(res, result.rows[0]);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { register, login, me };