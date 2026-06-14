const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM tbunit ORDER BY uid");
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    try {
        const { uname } = req.body;

        if (!uname || uname.trim() === "") {
            return error(res, "Please provide a unit name", 400);
        }
        const result = await db.query(
            "INSERT INTO tbunit (uname) VALUES ($1) RETURNING *",
            [uname]
        );
        return success(res, result.rows, "Insert unit successful", 201);
    } catch (err) {
        if (err.code === "23505") {
            return error(res, "This unit name already exists", 409);
        }
        return error(res, err.message);
    }
};  

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { uname } = req.body;

        if (!uname || uname.trim() === "") {
            return error(res, "Please provide a unit name", 400);
        }

        const result = await db.query(
            `UPDATE tbunit SET uname = $1 WHERE uid = $2 RETURNING *`,
            [uname, id]
        );
        if (result.rows.length === 0) {
            return error(res, "Unit not found", 404);
        }

        return success(res, result.rows[0], "Update unit successful");
    } catch (err) {
        if (err.code === "23505") {
            return error(res, "This unit name already exists", 409);
        }
        return error(res, err.message);
    }
};

const remove = async (req, res) => {
    try {
        const { id } = req.params;

        // เช็คว่ามีสินค้าตัวไหนใช้หน่วยนี้อยู่ใน tbproduct_units ไหม
        const check = await db.query(
            `SELECT 1 FROM tbproduct_units WHERE uid = $1 LIMIT 1`,
            [id]
        );
        if (check.rows.length > 0) {
            return error(res, "Cannot be deleted because there are already products in this unit", 409);
        }

        const result = await db.query(
            `DELETE FROM tbunit WHERE uid = $1 RETURNING *`,
            [id]
        );
        if (result.rows.lenght === 0) {
            return error(res, "Unit not found", 404);
        }

        return success(res, null, "Delete unit successful");
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getAll, create, update, remove };