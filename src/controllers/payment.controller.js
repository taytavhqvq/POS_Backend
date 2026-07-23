const db = require("../config/database");
const { success, error } = require("../utils/response");
const { createNotification } = require('../utils/notification');

// ใช้ deductStockFIFO เดิมจาก order.controller.js — import มาใช้ซ้ำ
const { deductStockFIFO, checkStock } = require("./order.controller");

const logPaymentAction = async (paymentid, action, actor_type, actor_id, note = null) => {
    await db.query(
        `INSERT INTO tbpayment_logs (paymentid, action, actor_type, actor_id, note, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())`,
        [paymentid, action, actor_type, actor_id, note]
    );
};

// ลูกค้าอัปโหลด/อัปโหลดซ้ำสลิป
const uploadSlip = async (req, res) => {
    try {
        const { orderid } = req.params;

        if (!req.file) return error(res, "ກະລຸນາອັບໂຫຼດຮູບການໂອນເງີນ", 400);

        const order = await db.query(
            `SELECT * FROM tborders WHERE orderid = $1 AND cid = $2`,
            [orderid, req.user.cid]
        );
        if (order.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນອໍເດີ", 404);
        if (order.rows[0].type !== 'Online') return error(res, "ອໍເດີນີ້ບໍ່ແມ່ນການສັ່ງຊື້ອອນລາຍ", 400);
        if (order.rows[0].status === 'ຈ່າຍສຳເລັດ') return error(res, "ອໍເດີນີ້ໄດ້ຮັບການຈ່າຍເງິນສຳເລັດແລ້ວ", 400);
        if (order.rows[0].status === 'ຍົກເລີກ') return error(res, "ອໍເດີນີ້ຖືກຍົກເລີກແລ້ວ ແລະ ບໍ່ສາມາດອັບໂຫຼດຮູບການໂອນເງີນໃໝ່ໄດ້", 400);

        const slipUrl = `/uploads/slips/${req.file.filename}`;

        const existing = await db.query(`
                SELECT * FROM tbpayments WHERE orderid = $1
            `, [orderid]);

        let paymentId;
        let isReupload = false;

        if (existing.rows.length > 0) {
            await db.query(
                `UPDATE tbpayments
                SET slip_image_url = $1,
                    slip_uploaded_at = NOW(),
                    verified_by = NULL,
                    verified_at = NULL,
                    reject_reason = NULL
                WHERE orderid = $2`,
                [slipUrl, orderid]
            );

            paymentId = existing.rows[0].paymentid;
            isReupload = true;
        } else {
            const result = await db.query(
                `INSERT INTO tbpayments
                    (orderid, slip_image_url, slip_uploaded_at, created_at)
                VALUES ($1, $2, NOW(), NOW())
                RETURNING paymentid`,
                [orderid, slipUrl]
            );

            paymentId = result.rows[0].paymentid;
        }

        await logPaymentAction(
            paymentId,
            'uploaded', 'customer', req.user.cid,
            'Slip uploaded/re-uploaded'
        );

        await db.query(`UPDATE tborders SET status = 'ລໍຖ້າຢືນຢັນການຊຳລະ' WHERE orderid = $1`,[orderid]);

        const io = req.app.locals.io;
        await createNotification(
            io,
            'new_order',
            isReupload
                ? `ລູກຄ້າໄດ້ອັບໂຫຼດຮູບການໂອນເງີນຄືນໃໝ່ແລ້ວ, Order ID: ${order.rows[0].order_code}`
                : `ອັບໂຫຼດຮູບການໂອນເງີນໃໝ່ແລ້ວ, Order ID: ${order.rows[0].order_code} ຍອດລວມ ${order.rows[0].total} ກີບ`,
            orderid
        );

        return success(res, { slip_url: slipUrl }, "ອັບໂຫຼດຮູບການໂອນເງີນສຳເລັດແລ້ວ ກຳລັງລໍຖ້າການຢືນຢັນ");
    } catch (err) {
        return error(res, err.message);
    }
};

const getPending = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.*, o.order_code, o.total, o.cid, c.phone AS customer_phone
            FROM tbpayments p
            INNER JOIN tborders o ON p.orderid = o.orderid
            INNER JOIN customer c ON o.cid = c.cid
            WHERE o.status = 'ລໍຖ້າຢືນຢັນການຊຳລະ'
            ORDER BY p.slip_uploaded_at ASC
        `);
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

// Admin อนุมัติ → ตัด stock จริง
const verify = async (req, res) => {
    const client = await db.connect();
    try {
        const { paymentid } = req.params;

        const payment = await client.query(`SELECT * FROM tbpayments WHERE paymentid = $1`, [paymentid]);
        if (payment.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນບັນທຶກການຈ່າຍເງິນ", 404);

        const orderid = payment.rows[0].orderid;
        const order = await client.query(`SELECT * FROM tborders WHERE orderid = $1`, [orderid]);
        if (order.rows[0].status !== 'ລໍຖ້າຢືນຢັນການຊຳລະ') {
            return error(res, "ອໍເດີນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະການຢືນຢັນທີ່ລໍຖ້າຢູ່", 400);
        }

        await client.query("BEGIN");

        // ดึงรายการที่ยังไม่ตัด stock (online order ที่ยัง pending อยู่)
        const items = await client.query(`
            SELECT oi.proid, oi.uid, oi.qty, pu.qty_base
            FROM tborder_items oi
            JOIN tbproduct_units pu ON oi.proid = pu.proid AND oi.uid = pu.uid
            WHERE oi.orderid = $1
            `, [orderid]);

        try {
            for (const item of items.rows) {
                const qtyInBase = item.qty * item.qty_base;
                await deductStockFIFO(client, item.proid, qtyInBase);
                await client.query(`UPDATE tbstock SET qty = qty - $1 WHERE proid = $2`, [qtyInBase, item.proid]);
                const io = req.app.locals.io;
                await checkStock(client, item.proid, io);
            }
        } catch (stockErr) {
            // สินค้าไม่พอ → rollback การตัด stock ทั้งหมด แล้วเปลี่ยนเป็น "ปฏิเสธ" อัตโนมัติ
            await client.query("ROLLBACK");

            await db.query(
                `UPDATE tbpayments SET verified_by = $1, verified_at = NOW(), reject_reason = $2 WHERE paymentid = $3`,
                [req.user.userid, 'Out of stock. Please contact support', paymentid]
            );
            await db.query(`UPDATE tborders SET status = 'ປະຕິເສດ' WHERE orderid = $1`, [orderid]);

            return error(res, "ໝົດສະຕັອກ ການສັ່ງຊື້ຖືກຍົກເລີກໂດຍອັດຕະໂນມັດ", 409);
        }

        // อัปเดต order: ใส่ userid ของ Admin ที่ verify + status สำเร็จ
        await client.query(
            `UPDATE tborders SET userid = $1, status = 'ຈ່າຍສຳເລັດ' WHERE orderid = $2`,
            [req.user.userid, orderid]
        );

        // อัปเดต payment record
        await client.query(
            `UPDATE tbpayments SET verified_by = $1, verified_at = NOW(), reject_reason = NULL WHERE paymentid = $2`,
            [req.user.userid, paymentid]
        );

        await client.query("COMMIT");

        await logPaymentAction(paymentid, 'approved', 'admin', req.user.userid);

        return success(res, null, "ການຈ່າຍເງິນໄດ້ຮັບການອະນຸມັດສຳເລັດແລ້ວ ອັບເດດສະຕັອກແລ້ວ");
    } catch (err) {
        await client.query("ROLLBACK");
        return error(res, err.message);
    } finally {
        client.release();
    }
};

// Admin ปฏิเสธ พร้อมเหตุผล
// action: 'resubmit' = ปฏิเสธชั่วคราว ให้ลูกค้าส่งสลิปใหม่ได้ (เช่น รูปไม่ชัด)
//         'cancel'   = ยกเลิกถาวร ลูกค้าส่งสลิปใหม่ไม่ได้อีก (เช่น สงสัยทุจริต)
const reject = async (req, res) => {
    try {
        const { paymentid } = req.params;
        const { reason, action } = req.body;

        if (!reason || reason.trim() === "") {
            return error(res, "ກະລຸນາໃສ່ເຫດຜົນສຳລັບການປະຕິເສດ", 400);
        }

        if (!action || !['resubmit', 'cancel'].includes(action)) {
            return error(res, "ກະລຸນາລະບຸການກະທຳ: 'ສົ່ງຄືນໃໝ່' ຫຼື 'ຍົກເລີກ'", 400);
        }

        const payment = await db.query(`SELECT * FROM tbpayments WHERE paymentid = $1`, [paymentid]);
        if (payment.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນບັນທຶກການຈ່າຍເງິນ", 404);

        const orderid = payment.rows[0].orderid;

        await db.query(
            `UPDATE tbpayments SET verified_by = $1, verified_at = NOW(), reject_reason = $2 WHERE paymentid = $3`,
            [req.user.userid, reason, paymentid]
        );

        // resubmit -> ปะติเสด (ให้ส่งใหม่ได้), cancel -> ยกเลิก (ถาวร)
        const newStatus = action === 'cancel' ? 'ຍົກເລີກ' : 'ປະຕິເສດ';
        await db.query(`UPDATE tborders SET status = $1 WHERE orderid = $2`, [newStatus, orderid]);

        await logPaymentAction(
            paymentid,
            action === 'cancel' ? 'cancelled' : 'rejected',
            'admin', req.user.userid, reason
        );

        return success(
            res, null,
            action === 'cancel' ? "ອໍເດີຖືກຍົກເລີກຢ່າງຖາວອນແລ້ວ" : "ການຈ່າຍເງິນຖືກປະຕິເສດ ລູກຄ້າສາມາດສົ່ງໃໝ່ໄດ້"
        );
    } catch (err) {
        return error(res, err.message);
    }
};

const getLogs = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT l.*, o.order_code
            FROM tbpayment_logs l
            JOIN tbpayments p ON l.paymentid = p.paymentid
            JOIN tborders o ON p.orderid = o.orderid
            WHERE l.paymentid = $1
            ORDER BY l.created_at ASC
            `, [req.params.paymentid]);
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { uploadSlip, getPending, verify, reject, getLogs };