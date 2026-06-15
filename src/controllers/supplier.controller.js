const db = require("../config/database");
const { success, error } = require("../utils/response");

// Helper: validate comtel = ตัวเลข 8 หลัก
const isValidComtel = (comtel) => /^\d{8}$/.test(comtel);

const getAll = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM tbsupplier ORDER BY supid");
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query("SELECT * FROM tbsupplier WHERE supid = $1", [id]);
        if (result.rows.length === 0) return error(res, "Supplier not found", 404);
        return success(res, result.rows[0]);
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    try {
        const { comname, comtel, email, contactname, location, note } = req.body;

        if (!comname || comname.trim() === "") {
            return error(res, "Please provide a company name", 400);
        }
        if (comtel && !isValidComtel(comtel)) {
            return error(res, "The phone number must be an 8-digit number", 400);
        }

        const result = await db.query(
            `INSERT INTO tbsupplier (comname, comtel, email, contactname, location, note)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [comname, comtel, email, contactname, location, note]
        );
        return success(res, result.rows[0], "Insert supplier successful", 201)
    } catch (err) {
        return error(res, err.message);
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { comname, comtel, email, contactname, location, note } = req.body;

        if (!comname || comname.trim() === "") {
            return error(res, "Please provide a company name", 400);
        }
        if (comtel && !isValidComtel(comtel)) {
            return error(res, "The phone number must be an 8-digit number", 400);
        }

        const result = await db.query(
            `UPDATE tbsupplier SET comname = $1, comtel = $2, email = $3, contactname = $4, location = $5, note = $6
            WHERE supid = $7 RETURNING *`,
            [comname, comtel, email, contactname, location, note, id]
        );
        if (result.rows.length === 0) return error(res, "Supplier not found", 404);
        return success(res, result.rows[0], "Update supplier successful");
    } catch (err) {
        return error(res, err.message);
    }
};

// ลบ (ถ้าไม่มีใบสั่งซื้ออ้างถึง)
const remove = async (req, res) => {
    try {
        const { id } = req.params;

        const check = await db.query("SELECT 1 FROM tbpurchase WHERE supid = $1 LIMIT 1", [id]);
        if (check.rows.length > 0) {
            return error(res, "This cannot be deleted because there is an existing purchase order from this supplier", 409);
        }

        const result = await db.query("DELETE FROM tbsupplier WHERE supid = $1 RETURNING *", [id]);
        if (result.rows.length === 0) return error(res, "Supplier not found", 404);
        return success(res, null, "Delete supplier successful");
    } catch (err) {
        return error(res, err.message)
    }
};

module.exports = { getAll, getOne, create, update, remove };