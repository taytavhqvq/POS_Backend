const db = require('../config/database');
const { createNotification } = require('./notification');

// ===== Reset balance ทุกต้นเดือน =====
const resetMonthlyBalance = async () => {
    try {
        await db.query(`UPDATE tbstock SET balance = 0`);
        console.log(`Monthly balance reset: ${new Date().toLocaleString()}`);
    } catch (err) {
        console.error('Monthly balance reset error:', err.message);
    }
};

// เช็คว่าตอนนี้เป็นวันที่ 1 ของเดือนไหม
const isFirstDayOfMonth = () => new Date().getDate() === 1;

// ตรวจสอบ batch ที่ใกล้หมดอายุ/หมดอายุแล้ว
// รัน 1 ครั้งต่อวัน (ตอนเปิด server และทุกๆ 24 ชั่วโมง)
const checkExpiry = async (io) => {
    try {
        // reset balance ถ้าเป็นวันที่ 1 ของเดือน
        if (isFirstDayOfMonth()) {
            await resetMonthlyBalance();
        }
        
        // 1. หมดอายุแล้ว (expiry_date < วันนี้) และยังมีของเหลืออยู่
        const expired = await db.query(`
            SELECT b.batchid, b.lot_name, b.expiry_date, p.proname
            FROM tbbatch b
            JOIN tbproducts p ON b.proid = p.proid
            WHERE b.expiry_date < CURRENT_DATE
                AND b.remaining_qty > 0
        `);
        for (const batch of expired.rows) {

            const expiryDate = new Date(batch.expiry_date).toLocaleDateString('en-GB');
            // เช็คว่าแจ้งเตือน 'expired' ของ batch นี้มีอยู่แล้วหรือยัง (กันแจ้งซ้ำ)
            const exists = await db.query(
                `SELECT 1 FROM tbnotifications WHERE type = 'expired' AND ref_id = $1 LIMIT 1`,
                [batch.batchid]
            );
            if (exists.rows.length === 0) {
                await createNotification(
                io, 'expired',
                `Product "${batch.proname}" Lot ${batch.lot_name} has expired (${expiryDate})`,
                batch.batchid
                );
            }
        }

        // 2. ใกล้หมดอายุ - เช็ค 3 ระดับ: 2 เดือน, 1 เดือน, 1 อาทิตย์
        const levels = [
            { days: 60, label: '2 ເດືອນ', type: 'expiring_60d' },
            { days: 30, label: '1 ເດືອນ', type: 'expiring_30d' },
            { days: 7,  label: '1 ອາທິດ', type: 'expiring_7d' },
        ];

        for (const level of levels) {
            const batches = await db.query(`
                SELECT b.batchid, b.lot_name, b.expiry_date, p.proname
                FROM tbbatch b
                JOIN tbproducts p ON b.proid = p.proid
                WHERE b.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${level.days} days'
                AND b.remaining_qty > 0
            `);

            for (const batch of batches.rows) {

                const expiryDate = new Date(batch.expiry_date).toLocaleDateString('en-GB');
                
                // กันแจ้งซ้ำ: เช็คว่า type นี้ + ref_id นี้มีอยู่แล้วไหม
                const exists = await db.query(
                    `SELECT 1 FROM tbnotifications WHERE type = $1 AND ref_id = $2 LIMIT 1`,
                    [level.type, batch.batchid]
                );
                if (exists.rows.length === 0) {
                    await createNotification(
                        io, level.type,
                        `Product "${batch.proname}" Lot ${batch.lot_name} expires in ${level.label} (${expiryDate})`,
                        batch.batchid
                    );
                }
            }
        }

        console.log(`Expiry check completed: ${new Date().toLocaleString()}`);
    } catch (err) {
        console.error('Expiry check error:', err.message);
    }
};

// เริ่ม scheduled job (รันทันทีตอน server start แล้วรันทุก 24 ชั่วโมง)
const startExpiryChecker = (io) => {
    checkExpiry(io); // รันทันทีตอน server เริ่ม
    setInterval(() => checkExpiry(io), 24 * 60 * 60 * 1000); // ทุก 24 ชั่วโมง
};

module.exports = { startExpiryChecker };