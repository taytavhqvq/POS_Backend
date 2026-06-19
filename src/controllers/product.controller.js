const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        // Admin เห็นทั้งหมด เรียง active ก่อน
        // Staff/Customer เห็นแค่ active
        const isAdmin = req.user.state === "Admin";
        const whereClause = isAdmin ? "" : "WHERE p.is_active = true";

        // ดึงสินค้าที่ is_active = true พร้อม join หมวดหมู่
        const products = await db.query(`
            SELECT p.proid, p.barcode, p.proname, p.createdate, p.is_active, c.catid, c.catname
            FROM tbproducts p
            LEFT JOIN tbcategory c 
            ON p.catid = c.catid
            ${whereClause}
            ORDER BY p.is_active DESC, p.proid ASC
        `);

        // ดึงหน่วย/ราคาทั้งหมด แล้วเอามาแมพกับสินค้าแต่ละตัว
        const units = await db.query(`
            SELECT pu.conid, pu.proid, pu.uid, u.uname, pu.qty_base, pu.imprice, pu.saleprice
            FROM tbproduct_units pu
            JOIN tbunit u
            ON pu.uid = u.uid
        `);

        // รวมข้อมูล: แต่ละสินค้า จะมี array "units"
        const data = products.rows.map(p => ({
            ...p,
            units: units.rows.filter(u => u.proid === p.proid)
        }));

        return success(res, data);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.state === "Admin";

        // Admin เห็นได้ทุกตัว, Staff/Customer เห็นแค่ active
        const whereClause = isAdmin
            ? "WHERE p.proid = $1"
            : "WHERE p.proid = $1 AND p.is_active = true"

        const product = await db.query(`
            SELECT p.proid, p.barcode, p.proname, p.createdate, p.is_active, c.catid, c.catname
            FROM tbproducts p
            LEFT JOIN tbcategory c
            ON p.catid = c.catid
            ${whereClause}
        `, [id]);

        if (product.rows.length === 0) {
            return error(res, "Product not found", 404);
        }

        const units = await db.query(`
            SELECT pu.conid, pu.uid, u.uname, pu.qty_base, pu.imprice, pu.saleprice
            FROM tbproduct_units pu
            INNER JOIN tbunit u
            ON pu.uid = u.uid
            WHERE pu.proid = $1
        `, [id]);

        return success(res, { ...product.rows[0], units: units.rows });
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    const client = await db.connect();
    try {
        const { barcode, proname, catid, units } = req.body;

        // validation พื้นฐาน
        if (!barcode || !proname) {
            return error(res, "Please provide barcode and product name", 400);
        }
        if (!units || units.length === 0) {
            return error(res, "Please specify the unit and price for at least one unit", 400);
        }

        await client.query("BEGIN");   // เริ่ม transaction

        // is_active = false เสมอ ต้องให้ Admin เปิดเองทีหลัง
        // 1. insert สินค้าหลัก
        const productResult = await client.query(`
            INSERT INTO tbproducts (barcode, proname, catid, createdate, is_active)
            VALUES ($1, $2, $3, CURRENT_DATE, false) RETURNING *`,
            [barcode, proname, catid]
        );
        const newProduct = productResult.rows[0];

        // 2. insert หน่วย/ราคา ทุกตัวที่ส่งมา
        for (const u of units) {
            await client.query(
                `INSERT INTO tbproduct_units (proid, uid, qty_base, imprice, saleprice)
                VALUES ($1, $2, $3, $4, $5)`,
                [newProduct.proid, u.uid, u.qty_base, u.imprice, u.saleprice]
            );
        }

        // 3. สร้าง stock record เริ่มต้น (qty=0)
        await client.query(
            `INSERT INTO tbstock (proid, qty, balance, level) VALUES ($1, 0, 0, 0)`,
            [newProduct.proid]
        );

        await client.query("COMMIT");   // สำเร็จทั้งหมด → commit

        return success(res, newProduct, "Insert product successful", 201);
    } catch (err) {
        await client.query("ROLLBACK");   // ถ้า error ตรงไหน → ย้อนกลับทั้งหมด

        if (err.code === "23505") {
            return error(res, "This barcode already exists", 409);
        }
        return error(res, err.message);
    } finally {
        client.release();    // คืน connection กลับ pool เสมอ
    }
};

// Helper: เช็คว่าสินค้านี้เคยถูกขายไปแล้วหรือยัง
const hasBeenSold = async (proid) => {
    const result = await db.query(
        `SELECT 1 FROM tborder_items WHERE proid = $1 LIMIT 1`,
        [proid]
    );
    return result.rows.length > 0;
};

const update = async (req, res) => {
    const client = await db.connect();
    try {
        const { id } = req.params;
        const { barcode, proname, catid, units, is_active } = req.body;

        const sold = await hasBeenSold(id);

        await client.query('BEGIN');

        let result;

        if (sold) {
            // เคยขายแล้ว → แก้ได้แค่ is_active เท่านั้น
            if (is_active === undefined) {
                await client.query('ROLLBACK');
                client.release();
                return error(res, "This product already has a sales history; only the 'is_active' status can be modified", 403);
            }
            result = await client.query(
                `UPDATE tbproducts SET is_active = $1 WHERE proid = $2 RETURNING *`,
                [is_active, id]
            );
            } else {
            // ยังไม่เคยขาย → แก้ได้ทุก field
            result = await client.query(
                `UPDATE tbproducts SET barcode=$1, proname=$2, catid=$3, is_active=$4
                WHERE proid=$5 RETURNING *`,
                [barcode, proname, catid, is_active, id]
            );

            if (units && units.length > 0) {
                await client.query('DELETE FROM tbproduct_units WHERE proid = $1', [id]);
                for (const u of units) {
                    await client.query(
                        `INSERT INTO tbproduct_units (proid, uid, qty_base, imprice, saleprice)
                        VALUES ($1, $2, $3, $4, $5)`,
                        [id, u.uid, u.qty_base, u.imprice, u.saleprice]
                    );
                }
            }
        }

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return error(res, 'Product not found', 404);
        }

        await client.query('COMMIT');
        return success(res, result.rows[0], 'Update product successful');
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') return error(res, 'Barcode already exists', 409);
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// ยังไม่เคยขาย -> ลบจริง (hard delete)
// เคยขายแล้ว -> set is_active = false (soft delete)
const remove = async (req, res) => {
    try {
        const { id } = req.params;

        const sold = await hasBeenSold(id);

        if (sold) {
            // soft delete
            const result = await db.query(
                `UPDATE tbproducts SET is_active = false WHERE proid = $1 RETURNING *`,
                [id]
            );
            if (result.rows.length === 0) return error(res, "Product not found", 404);
            return success(res, null, "Sales of this product have been discontinued (The product information cannot be deleted because it has sales history)");
        } else {
            // hard delete - ต้องลบ tbproduct_units และ tbstock ก่อน เพราะมี FK
            const client = await db.connect();
            try {
                await client.query("BEGIN");
                await client.query("DELETE FROM tbproduct_units WHERE proid = $1", [id]);
                await client.query("DELETE FROM tbstock WHERE proid = $1", [id]);
                const result = await client.query(
                    `DELETE FROM tbproducts WHERE proid = $1 RETURNING *`, [id]
                );
                if (result.rows.length === 0) {
                    await client.query("ROLLBACK");
                    client.release();
                    return error(res, "Product not found", 404);
                }
                await client.query("COMMIT");
                client.release();
                return success(res, null, "Delete product successful");
            } catch (err) {
                await client.query("ROLLBACK");
                client.release();
                throw e;
            }
        }
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getAll, getOne, create, update, remove };