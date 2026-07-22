const db = require('../config/database');
const { success, error } = require('../utils/response');
const { createNotification } = require('../utils/notification');

// Helper: ตัด stock แบบ FIFO จาก tbbatch (หน่วยฐานเสมอ)
// แค่ลด remaining_qty ใน tbbatch ไม่ต้อง return อะไรไปใช้ใน tborder_items แล้ว
const deductStockFIFO = async (client, proid, qtyNeededInBase) => {
    const batches = await client.query(
        `SELECT batchid, remaining_qty FROM tbbatch
        WHERE proid = $1 AND remaining_qty > 0
        ORDER BY expiry_date ASC NULLS LAST, batchid ASC
        FOR UPDATE`,
        [proid]
    );

    let remaining = qtyNeededInBase;

    for (const batch of batches.rows) {
        if (remaining <= 0) break;
        const take = Math.min(batch.remaining_qty, remaining);
        await client.query(
            `UPDATE tbbatch SET remaining_qty = remaining_qty - $1 WHERE batchid = $2`,
            [take, batch.batchid]
        );
        remaining -= take;
    }

    if (remaining > 0) {
        throw new Error(`Product proid=${proid} has insufficient stock (short by ${remaining} base units)`);
    }
};

// Helper: คำนวณราคา + แปลงหน่วยฐาน
const calculateItemsWithPrice = async (client, items) => {
    let total = 0;
    const itemsWithPrice = [];

    for (const item of items) {
        const { proid, uid, qty } = item;
        if (!proid || !uid || !qty || qty <= 0) {
            throw new Error('Incorrect product information (proid, uid, qty)');
        }

        const priceResult = await client.query(
            `SELECT saleprice, qty_base FROM tbproduct_units WHERE proid = $1 AND uid = $2`,
            [proid, uid]
        );
        if (priceResult.rows.length === 0) {
            throw new Error(`Product not found proid=${proid}, uid=${uid}`);
        }

        const { saleprice, qty_base } = priceResult.rows[0];
        total += saleprice * qty;

        itemsWithPrice.push({
            proid,
            uid,
            qty,                          // หน่วยขายจริง (เช่น 1 แพ็ค) -> เก็บลง tborder_items
            qtyInBase: qty * qty_base,    // หน่วยฐาน (เช่น 6 ขวด) -> ใช้ตัด stock เท่านั้น
            unit_price: saleprice,
        });
    }

    return { total, itemsWithPrice };
};

// Helper: ดึงข้อมูลครบสำหรับโชว์บิล (ใช้ร่วมกันทั้ง walk-in/online/getOne)
const buildReceiptData = async (orderid) => {
    const order = await db.query(`
        SELECT o.*, c.phone AS customer_phone, u.username AS staff_name
        FROM tborders o
        LEFT JOIN customer c ON o.cid = c.cid
        LEFT JOIN "user" u ON o.userid = u.userid
        WHERE o.orderid = $1
    `, [orderid]);

    const items = await db.query(`
        SELECT pr.proname, un.uname, oi.qty, oi.unit_price,
            (oi.qty * oi.unit_price) AS line_total
        FROM tborder_items oi
        INNER JOIN tbproducts pr ON oi.proid = pr.proid
        INNER JOIN tbunit un ON oi.uid = un.uid
        WHERE oi.orderid = $1
        ORDER BY oi.itemid
    `, [orderid]);

    return { ...order.rows[0], items: items.rows };
};

const checkStock = async (client, proid, io) => {
    const stock = await client.query(
        `SELECT qty, level FROM tbstock WHERE proid = $1`, [proid]
    );
    if (stock.rows.length === 0) return;

    const { qty, level } = stock.rows[0];
    const prod = await client.query(`SELECT proname FROM tbproducts WHERE proid = $1`, [proid]);
    const proname = prod.rows[0].proname;

    if (qty === 0) {
        // เช็คว่าแจ้ง out_of_stock ของสินค้านี้ไปแล้วหรือยัง
        // ถ้ายอด stock กลับมา > 0 แล้ว (ซื้อเข้า) notification เก่าจะถูก resolve อัตโนมัติ
        const exists = await db.query(`
            SELECT 1 FROM tbnotifications
            WHERE type = 'out_of_stock' AND ref_id = $1
                AND is_read = false
            LIMIT 1
        `, [proid]);

        if (exists.rows.length === 0) {
            await createNotification(io, 'out_of_stock', `Product "${proname}" is out of stock`, proid);
        }

    } else if (level > 0 && qty <= level) {
        // เช็คว่าแจ้ง low_stock ของสินค้านี้ไปแล้วหรือยัง (ที่ยังไม่ได้อ่าน)
        const exists = await db.query(`
            SELECT 1 FROM tbnotifications
            WHERE type = 'low_stock' AND ref_id = $1
                AND is_read = false
            LIMIT 1
        `, [proid]);

        if (exists.rows.length === 0) {
            await createNotification(io, 'low_stock', `Product "${proname}" is running low (${qty} units remaining)`, proid);
        }
    }
};

// POST /api/orders/walk-in
const createWalkIn = async (req, res) => {
    const client = await db.connect();
    try {
        const { payment_method, items } = req.body;

        if (!payment_method || !['ເງີນສົດ', 'ເງີນໂອນ'].includes(payment_method)) {
            return error(res, 'Select Payment Method (ເງີນສົດ or ເງີນໂອນ)', 400);
        }
        if (!items || items.length === 0) {
            return error(res, 'Please add at least 1 item', 400);
        }

        await client.query('BEGIN');

        const { total, itemsWithPrice } = await calculateItemsWithPrice(client, items);

        const orderCode = `WI-${Date.now()}`;
        const orderResult = await client.query(
            `INSERT INTO tborders (cid, userid, order_code, type, total, status, payment_method, created_at)
            VALUES (NULL, $1, $2, 'Walk-in', $3, 'ຈ່າຍສຳເລັດ', $4, NOW()) RETURNING *`,
            [req.user.userid, orderCode, total, payment_method]
        );
        const order = orderResult.rows[0];

        for (const item of itemsWithPrice) {
            // ตัด stock จริงเป็นหน่วยฐาน (อาจตัดจากหลาย batch ภายใน - ไม่ต้องรู้รายละเอียดในบิล)
            await deductStockFIFO(client, item.proid, item.qtyInBase);

            // insert บิล 1 แถวต่อ 1 รายการที่ลูกค้าสั่ง (ตามหน่วยที่ขายจริง)
            await client.query(
                `INSERT INTO tborder_items (orderid, proid, uid, qty, unit_price)
                VALUES ($1, $2, $3, $4, $5)`,
                [order.orderid, item.proid, item.uid, item.qty, item.unit_price]
            );

            await client.query(`UPDATE tbstock SET qty = qty - $1 WHERE proid = $2`, [item.qtyInBase, item.proid]);
            await checkStock(client, item.proid, req.app.locals.io);
        }

        await client.query('COMMIT');

        

        const receipt = await buildReceiptData(order.orderid);
        return success(res, receipt, 'Sale Successful', 201);
    } catch (err) {
        await client.query('ROLLBACK');
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// POST /api/orders/online - ยังไม่ตัด stock จนกว่า admin verify
const createOnline = async (req, res) => {
    const client = await db.connect();
    try {
        const { items } = req.body;

        if (!items || items.length === 0) {
            return error(res, 'Please add at least 1 item', 400);
        }

        await client.query('BEGIN');

        const { total, itemsWithPrice } = await calculateItemsWithPrice(client, items);

        // เช็คว่า stock พอไหม (เช็คเฉยๆ ยังไม่ตัดจริง)
        for (const item of itemsWithPrice) {
            const stockCheck = await client.query(`SELECT qty FROM tbstock WHERE proid = $1`, [item.proid]);
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
            // บันทึกบิลไว้ก่อน แต่ยังไม่ตัด stock จริง (ตัดตอน verify)
            await client.query(
                `INSERT INTO tborder_items (orderid, proid, uid, qty, unit_price)
                VALUES ($1, $2, $3, $4, $5)`,
                [order.orderid, item.proid, item.uid, item.qty, item.unit_price]
            );
        }

        await client.query('COMMIT');

        const receipt = await buildReceiptData(order.orderid);
        return success(res, receipt, 'Order successful Please upload payment receipt', 201);
    } catch (err) {
        await client.query('ROLLBACK');
        return error(res, err.message);
    } finally {
        client.release();
    }
};



// GET /api/orders - ค้นหา/filter ประวัติการขาย
const getAll = async (req, res) => {
    try {
        const { order_code, type, total, date, include_items } = req.query;
        let conditions = ["o.status = 'ຈ່າຍສຳເລັດ'"];   // บังคับกรองเฉพาะบิลที่ขายสำเร็จแล้วเท่านั้น
        let params = [];
        let i = 1;

        if (order_code) {
            conditions.push(`o.order_code ILIKE $${i++}`);
            params.push(`%${order_code}%`);
        }
        if (type) {
            conditions.push(`o.type = $${i++}`);
            params.push(type);
        }
        if (total) {
            conditions.push(`o.total = $${i++}`);
            params.push(total);
        }
        if (date) {
            conditions.push(`DATE(o.created_at) = $${i++}`);
            params.push(date);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        const result = await db.query(`
            SELECT o.orderid, o.order_code, o.type, o.payment_method, o.total, o.status, o.created_at,
                    c.phone AS customer_phone, u.username AS staff_name
            FROM tborders o
            LEFT JOIN customer c ON o.cid = c.cid
            LEFT JOIN "user" u ON o.userid = u.userid
            ${whereClause}
            ORDER BY o.orderid DESC
        `, params);
        
        if (include_items === 'true' && result.rows.length > 0) {
            const orderIds = result.rows.map(o => o.orderid);
            const items = await db.query(`
                SELECT oi.orderid, pr.proname, un.uname, oi.qty, oi.unit_price,
                    (oi.qty * oi.unit_price) AS line_total
                FROM tborder_items oi
                JOIN tbproducts pr ON oi.proid = pr.proid
                JOIN tbunit un ON oi.uid = un.uid
                WHERE oi.orderid = ANY($1)
                ORDER BY oi.itemid
            `, [orderIds]);

            const data = result.rows.map(order => ({
                ...order,
                items: items.rows.filter(item => item.orderid === order.orderid)
            }));
            return success(res, data);
        }

        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

// GET /api/orders/:id - รายละเอียด/ใบเสร็จ
const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const exists = await db.query(`SELECT orderid FROM tborders WHERE orderid = $1`, [id]);
        if (exists.rows.length === 0) return error(res, 'Order not found', 404);

        const receipt = await buildReceiptData(id);
        return success(res, receipt);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { createWalkIn, createOnline, getAll, getOne, deductStockFIFO, checkStock };