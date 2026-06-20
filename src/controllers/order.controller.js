const db = require("../config/database");
const { success, error } = require("../utils/response");

// Helper: ตัด stock แบบ FIFO จาก tbbatch (เรียงตามวันหมดอายุก่อน)
// คืนค่า array ของ { batchid, qty } ที่ถูกตัด (อาจมีหลาย batch)
const deductStockFIFO = async (client, proid, qtyNeeded) => {
    const batches = await client.query(
        `SELECT batchid, remaining_qty FROM tbbatch
        WHERE proid = $1 AND remaining_qty > 0
        ORDER BY expiry_date ASC NULLS LAST, batchid ASC
        FOR UPDATE`,
        [proid]
    );

    let remaining = qtyNeeded;
    const deductions = [];

    for (const batch of batches.rows) {
        if (remaining <= 0) break;
        const take = Math.min(batch.remaining_qty, remaining);

        await client.query(
            `UPDATE tbbatch SET remaining_qty = remaining_qty - $1 WHERE batchid = $2`,
            [take, batch.batchid]
        );

        deductions.push({ batchid: batch.batchid, qty: take });
        remaining -= take;
    }

    if (remaining > 0) {
        throw new Error(`Product proid=${proid} is out of stock (short by ${remaining} units)`);
    }

    return deductions;
};

// Helper: คำนวณ total + ดึงราคาขายปัจจุบันของแต่ละ item
const calculateItemsWithPrice = async (client, items) => {
    let total = 0;
    const itemsWithPrice = [];

    for (const item of items) {
        const { proid, uid, qty } = item;
        if (!proid || !uid || !qty || qty <= 0) {
            throw new Error("Incorrect product information (proid, uid, qty)");
        }

        const priceResult = await client.query(
            `SELECT saleprice, qty_base FROM tbproduct_units WHERE proid = $1 AND uid = $2`,
            [proid, uid]
        );

        if (priceResult.rows.length === 0) {
            throw new Error(`Product not found proid=${proid}, uid=${uid}`);
        }

        const { saleprice, qty_base } = priceResult.rows[0];
        const lineTotal = saleprice * qty;
        total += lineTotal;

        itemsWithPrice.push({ proid, uid, qty, qtyInBase: qty * qty_base, saleprice });
    }

    return { total, itemsWithPrice };
};

// ขายหน้าร้าน (พนักงาน) - ตัด stock ทันที
// body: { payment_method, items: [{ proid, uid, qty }] }
const createWalkIn = async (req, res) => {
    const client = await db.connect();
    try {
        const { payment_method, items } = req.body;

        if (!payment_method || !['ເງີນສົດ','ເງີນໂອນ'].includes(payment_method)) {
            return error(res, "Please select a payment method (Cash or Transfer)", 400);
        }

        if (!items || items.length === 0) {
            return error(res, "Please select at least 1 item", 400);
        }

        await client.query("BEGIN");

        const { total, itemsWithPrice } = await calculateItemsWithPrice(client, items);

        const orderCode = `WI-${Date.now()}`;
        const orderResult = await client.query(
            `INSERT INTO tborders (cid, userid, order_code, type, total, status, payment_method, created_at)
            VALUES (NULL, $1, $2, 'Walk-in', $3, 'ຈ່າຍສຳເລັດ', $4, NOW()) RETURNING *`,
            [req.user.userid, orderCode, total, payment_method]
        );
        const order = orderResult.rows[0];

         // ตัด stock ทันที (Walk-in จ่ายสดแล้ว)
        for (const item of itemsWithPrice) {
            const deductions = await deductStockFIFO(client, item.proid, item.qtyInBase);

            // insert tborder_items 1 แถวต่อ 1 batch ที่ถูกตัด
            for (const d of deductions) {
                await client.query(
                    `INSERT INTO tborder_items (orderid, proid, batchid, qty)
                    VALUES ($1, $2, $3, $4)`,
                    [order.orderid, item.proid, d.batchid, d.qty]
                );
            }

            // ลด tbstock.qty (ของจริงในคลังลดลง) - balance ไม่ลด (เก็บยอดสะสมของเดือน)
            await client.query(
                `UPDATE tbstock SET qty = qty - $1 WHERE proid = $2`,
                [item.qtyInBase, item.proid]
            );
        }

        await client.query("COMMIT");
        return success(res, order, "Sale successful", 201);
    } catch (err) {
        await client.query("ROLLBACK");
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// ลูกค้าสั่งผ่าน mobile app - ยังไม่ตัด stock
// body: { payment_method, items: [{ proid, uid, qty }] }
const createOnline = async (req, res) => {
    const client = await db.connect();
    try {
        const { items } = req.body;

        if (!items || items.length === 0) {
            return error(res, "Please select at least 1 item", 400);
        }

        await client.query("BEGIN");

        const { total, itemsWithPrice } = await calculateItemsWithPrice(client, items);

        // เช็คว่า stock พอไหม (เช็คเฉยๆ ยังไม่ตัดจริง)
        for (const item of itemsWithPrice) {
            const stockCheck = await client.query(
                `SELECT qty FROM tbstock WHERE proid = $1`, [item.proid]
            );

            if (stockCheck.rows.length === 0 || stockCheck.rows[0].qty < item.qtyInBase) {
                throw new Error(`Product proid=${item.proid} is out of stock`);
            }
        }

        const orderCode = `ON-${Date.now()}`;

        const orderResult = await client.query(
            `INSERT INTO tborders (cid, userid, order_code, type, total, status, payment_method, created_at)
            VALUES ($1, NULL, $2, 'Online', $3, 'ລໍຖ້າຢືນຢັນການຊຳລະ', 'ເງີນໂອນ', NOW()) RETURNING *`,
            [req.user.cid, orderCode, total]
        );
        const order = orderResult.rows[0];

        for (const item of itemsWithPrice) {
            await client.query(
                `INSERT INTO tborder_items (orderid, proid, batchid, qty)
                VALUES ($1, $2, NULL, $3)`,
                [order.orderid, item.proid, item.qtyInBase]
            );
        }

        await client.query("COMMIT");
        return success(res, order, "Order successful. Please upload your payment slip", 201);
    } catch (err) {
        await client.query("ROLLBACK");
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// ดูออเดอร์ทั้งหมด (Admin/Staff)
const getAll = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT o.*, c.username AS customer_name, u.username AS staff_name
            FROM tborders o
            LEFT JOIN customer c ON o.cid = c.cid
            INNER JOIN "user" u ON o.userid = u.userid
            ORDER BY o.orderid DESC
        `);
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await db.query(`
            SELECT o.*, c.username AS customer_name, u.username AS staff_name
            FROM tborders o
            LEFT JOIN customer c ON o.cid = c.cid
            INNER JOIN "user" u ON o.userid = u.userid
            WHERE o.orderid = $1
        `, [id]);

        if (order.rows.length === 0) return error(res, "Order not found", 404);

        const items = await db.query(`
            SELECT oi.itemid, oi.proid, pr.proname, oi.batchid, oi.qty
            FROM tborder_items oi
            INNER JOIN tbproducts pr ON oi.proid = pr.proid
            WHERE oi.orderid = $1
        `, [id]); 

        return success(res, { ...order.rows[0], items: items.rows });
    } catch (err) {
        return error(res, err.message);
    }
}

module.exports = { createWalkIn, createOnline, getAll, getOne, deductStockFIFO };