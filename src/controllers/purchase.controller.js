const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, s.comname AS supplier_name, u.username AS created_by
            FROM tbpurchase p
            INNER JOIN tbsupplier s ON p.supid = s.supid
            INNER JOIN "user" u ON p.userid = u.userid
            ORDER BY p.purchaseid DESC
        `);
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;

        const purchase = await db.query(`
            SELECT p.*, s.comname AS supplier_name, u.username AS created_by
            FROM tbpurchase p
            INNER JOIN tbsupplier s ON p.supid = s.supid
            INNER JOIN "user" u ON p.userid = u.userid
            WHERE p.purchaseid = $1
        `, [id]);

        if (purchase.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນໃບສັ່ງຊື້", 404);

        const items = await db.query(`
            SELECT pi.itemid, pi.proid, pr.proname, pi.uid, un.uname,
                pi.pack_qty, pi.cost_price,
                b.batchid, b.lot_name, b.initial_qty, b.remaining_qty, b.expiry_date
                FROM tbpurchase_items pi
                INNER JOIN tbproducts pr ON pi.proid = pr.proid
                INNER JOIN tbunit un ON pi.uid = un.uid
                LEFT JOIN tbbatch b ON b.purchaseid = pi.purchaseid AND b.proid = pi.proid
                WHERE pi.purchaseid = $1
        `, [id]);

        return success(res, { ...purchase.rows[0], items: items.rows });
    } catch (err) {
        return error(res, err.message);
    }
};

// body: { supid, note, items: [{ proid, uid, pack_qty, cost_price, lot_name, expiry_date }] }
const create = async (req, res) => {
    const client = await db.connect();
    try {
        const { supid, note, items } = req.body;

        // validation พื้นฐาน
        if (!supid) return error(res, "ກະລຸນາເລືອກຜູ້ສະໜອງ", 400);
        if (!items || items.length === 0) return error(res, "ກະລຸນາເລືອກສິນຄ້າຢ່າງໜ້ອຍ 1 ລາຍການ", 400);

        for (const item of items) {
            if (!item.proid || !item.uid || !item.pack_qty || item.cost_price == null) {
                return error(res, "ປ້ອນຂໍ້ມູນສິນຄ້າບໍ່ຄົບຖ້ວນ", 400);
            }
            if (item.pack_qty <= 0) return error(res, "ຈຳນວນຕ້ອງຫລາຍກວ່າ 0", 400);
        }

        await client.query("BEGIN");

        // 1. สร้างใบสั่งซื้อหลัก
        const purchaseResult = await client.query(`
            INSERT INTO tbpurchase (supid, userid, purchasedate, note, status)
            VALUES ($1, $2, CURRENT_DATE, $3, 'ຍັງບໍ່ໄດ້ຈ່າຍ') RETURNING *`,
            [supid, req.user.userid, note || null]
        );
        const purchase = purchaseResult.rows[0];

        let purchaseTotal = 0;

        // 2. วนทุกรายการสินค้าที่สั่ง
        for (const item of items) {
            const { proid, uid, pack_qty, cost_price, lot_name, expiry_date } = item;

            purchaseTotal += pack_qty * cost_price;

            // 2.1 หา qty_base ของหน่วยนี้ จาก tbproduct_units
            const unitResult = await client.query(
                `SELECT qty_base FROM tbproduct_units WHERE proid = $1 AND uid = $2`,
                [proid, uid]
            );
            if (unitResult.rows.length === 0) {
                throw new Error(`ບໍ່ມີຂໍ້ມູນຫົວໜ່ວຍສຳຫລັບສິນຄ້ານີ້ ກະລຸນາກວດສອບຂໍ້ມູນສິນຄ້າ`);
            }
            const qtyBase = unitResult.rows[0].qty_base;

            // 2.2 คำนวณจำนวนเป็นหน่วยฐาน
            const qtyInBase = pack_qty * qtyBase;

            // 2.3 insert tbpurchase_items (เก็บตามหน่วยที่สั่งจริง)
            await client.query(
                `INSERT INTO tbpurchase_items (purchaseid, proid, uid, pack_qty, cost_price)
                VALUES ($1, $2, $3, $4, $5)`,
                [purchase.purchaseid, proid, uid, pack_qty, cost_price]
            );

            // 2.4 insert tbbatch (เก็บเป็นหน่วยฐานแล้ว)
            await client.query(
                `INSERT INTO tbbatch (purchaseid, proid, lot_name, initial_qty, remaining_qty, expiry_date)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [purchase.purchaseid, proid, lot_name || null, qtyInBase, qtyInBase, expiry_date || null] 
            );

            // 2.5 update tbstock (บวกหน่วยฐานเข้า qty และ balance)
            // ใช้ ON CONFLICT เผื่อ proid นี้ยังไม่มี record ใน tbstock (กรณีสินค้าเก่าที่สร้างไว้ก่อน Step 8 มี init stock อยู่แล้ว ปกติจะมี record อยู่)
            await client.query(
                `UPDATE tbstock SET qty = qty + $1, balance = balance + $1 WHERE proid = $2`,
                [qtyInBase, proid]
            );
        }

        await client.query(
            `UPDATE tbpurchase SET total = $1 WHERE purchaseid = $2`,
            [purchaseTotal, purchase.purchaseid]
        );

        await client.query("COMMIT");
        return success(res, purchase, "ເພີ້ມຂໍ້ມູນໃບສັ່ງຊື້ສຳເລັດ", 201)
    } catch (err) {
        await client.query("ROLLBACK");
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// เปลี่ยนสถานะเป็น "จ่ายสำเร็จแล้ว
const updateStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const check = await db.query("SELECT status FROM tbpurchase WHERE purchaseid = $1", [id]);
        if (check.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນໃບສັ່ງຊື້", 404);
        if (check.rows[0].status === 'ຈ່າຍສຳເລັດ') {
            return error(res, "ໃບສັ່ງຊື້ນີ້ໄດ້ຈ່າຍເງິນສຳເລັດແລ້ວ", 400);
        }

        const result = await db.query(
            `UPDATE tbpurchase SET status = 'ຈ່າຍສຳເລັດ' WHERE purchaseid = $1 RETURNING *`,
            [id]
        );
        return success(res, result.rows[0], "ແກ້ໄຂສະຖານະເປັນ ຈ່າຍສຳເລັດ");
    } catch (err) {
        return error(res, err.message);
    }
};

// ดู batch/lot ทั้งหมด (Admin) - ตัวที่ยังเหลืออยู่ขึ้นก่อน ตัวที่หมดแล้วไปอยู่ล่างสุด
const getAllBatches = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT b.batchid, b.purchaseid, pr.proname, b.lot_name,
                    b.initial_qty, b.remaining_qty, b.expiry_date,
                    s.level
            FROM tbbatch b
            INNER JOIN tbproducts pr ON b.proid = pr.proid
            LEFT JOIN tbstock s ON b.proid = s.proid
            ORDER BY
                CASE WHEN b.remaining_qty > 0 THEN 0 ELSE 1 END,
                b.expiry_date ASC NULLS LAST,
                b.batchid ASC
        `);
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getAll, getOne, create, updateStatus, getAllBatches };