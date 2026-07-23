const db = require('../config/database');
const { createNotification } = require('./notification');

const EXPIRY_MINUTES = 30;

// ยกเลิกออเดอร์ online ที่ค้างเกิน 30 นาที และยังไม่เคยอัปโหลดสลิปเลย
const checkPendingOrders = async (io) => {
    try {
        const expired = await db.query(`
            SELECT o.orderid, o.order_code
            FROM tborders o
            WHERE o.type = 'Online'
                AND o.status = 'ລໍຖ້າຢືນຢັນການຊຳລະ'
                AND o.created_at < NOW() - INTERVAL '${EXPIRY_MINUTES} minutes'
                AND NOT EXISTS (
                    SELECT 1 FROM tbpayments p WHERE p.orderid = o.orderid
                )
        `);

        for (const order of expired.rows) {
            await db.query(
                `UPDATE tborders SET status = 'ຍົກເລີກ' WHERE orderid = $1`,
                [order.orderid]
            );

            await createNotification(
                io,
                'order_auto_cancelled',
                `Order ${order.order_code} ຖືກຍົກເລີກອັດຕະໂນມັດ (ບໍ່ສົ່ງຮູບການໂອນເງີນໃນ ${EXPIRY_MINUTES} ນາທີ)`,
                order.orderid
            );
        }

        if (expired.rows.length > 0) {
            console.log(`ຍົກເລີກອໍເດີທີ່ລໍຖ້າດຳເນີນການອັດຕະໂນມັດ ${expired.rows.length} ລາຍການເມື່ອ: ${new Date().toLocaleString()}`);
        }
    } catch (err) {
        console.error('Order expiry check error:', err.message);
    }
};

const startOrderExpiryChecker = (io) => {
    checkPendingOrders(io);
    setInterval(() => checkPendingOrders(io), 2 * 60 * 1000);
};

module.exports = { startOrderExpiryChecker };