const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        const result = await db.query("SELECT * FROM tbcategory ORDER BY catid");
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    try {
        const { catname } = req.body;
        
        if(!catname || catname.trim() === "") {
            return error(res, "Please provide a category name", 400);
        }
        const result = await db.query(
            "INSERT INTO tbcategory (catname) VALUES ($1) RETURNING *",
            [catname] 
        );
        return success(res, result.rows[0], "Insert category successful", 201);
    } catch (err) {
        if (err.code === "23505") {
            return error(res, "This category name already exists", 409);
        }
        return error(res, err.message);
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { catname } = req.body;

        if (!catname || catname.trim() === "") {
            return error(res, "Please provide a category name", 400);
        }

        const result = await db.query(
            `UPDATE tbcategory SET catname = $1 WHERE catid = $2 RETURNING *`,
            [catname, id]
        );

        if (result.rows.length === 0) {
            return error(res, "Category not found", 404);
        }

        return success(res, result.rows[0], "Update category successful");
    } catch (err) {
        if (err.code === "23505") {
            return error(res, "This category name already exists", 409);
        }
        return error(res, err.message);
    }
};

const remove = async (req, res) => {
    try {
        const { id } = req.params;

        // เช็คว่ามีสินค้าตัวไหนใช้ category นี้อยู่ไหม
        const check = await db.query(
            `SELECT 1 FROM tbproducts WHERE catid = $1 LIMIT 1`,
            [id]
        );
        if (check.rows.length > 0) {
            return error(res, "Cannot be deleted because there are already products in this category", 409);
        }

        const result = await db.query(
            `DELETE FROM tbcategory WHERE catid = $1 RETURNING *`,
            [id]
        );
        if (result.rows.length === 0) {
            return error(res, "Category not fonud", 404);
        }
        return success(res, null, "Delete category successful");
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getAll, create, update, remove };