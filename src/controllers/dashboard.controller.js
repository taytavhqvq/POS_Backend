const db = require('../config/database');
const { success, error } = require('../utils/response');

// GET /api/dashboard
const getDashboard = async (req, res) => {
    try {
        // รัน query ทั้งหมดพร้อมกัน (ไม่รอทีละตัว)
        const [
            todaySales,
            monthlySales,
            pendingVerify,
            outOfStock,
            lowStock,
            expiredBatches,
            salesChart,
        ] = await Promise.all([

        // ส่วนที่ 1: ยอดขายวันนี้
        db.query(`
            SELECT
            COUNT(*) AS total_orders,
            COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
            AND DATE(created_at) = CURRENT_DATE
        `),

        // ส่วนที่ 2: ยอดขายเดือนนี้
        db.query(`
            SELECT
            COUNT(*) AS total_orders,
            COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
            AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
        `),

        // ส่วนที่ 1: order รอ verify ทั้งหมด (ไม่จำกัดวัน)
        db.query(`
            SELECT COUNT(*) AS total
            FROM tborders
            WHERE status = 'ລໍຖ້າຢືນຢັນການຊຳລະ'
        `),

        // ส่วนที่ 3: สินค้าหมด (qty = 0)
        db.query(`
            SELECT COUNT(*) AS total
            FROM tbstock
            WHERE qty = 0
        `),

        // ส่วนที่ 3: สินค้าใกล้หมด (qty <= level และ level > 0)
        db.query(`
            SELECT COUNT(*) AS total
            FROM tbstock
            WHERE level > 0 AND qty <= level AND qty > 0
        `),

        // ส่วนที่ 3: batch ที่หมดอายุแล้ว (expiry_date < วันนี้ และยังมีของเหลือ)
        db.query(`
            SELECT COUNT(*) AS total
            FROM tbbatch
            WHERE expiry_date < CURRENT_DATE
            AND remaining_qty > 0
        `),

        // ส่วนที่ 4: ยอดขาย 7 วันล่าสุด (สำหรับกราฟ)
        db.query(`
            SELECT
            DATE(created_at) AS date,
            COUNT(*) AS total_orders,
            COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
            AND DATE(created_at) >= CURRENT_DATE - INTERVAL '6 days'
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `),
        ]);

        // เติมวันที่ขาดหายในกราฟ (ถ้าวันไหนไม่มียอดขาย จะไม่มีแถวใน DB → ต้องเติม 0 ให้ครบ 7 วัน)
        const chartData = fillMissingDays(salesChart.rows, 7);

        return success(res, {
            today: {
                total_orders: parseInt(todaySales.rows[0].total_orders),
                total_amount: parseFloat(todaySales.rows[0].total_amount),
                pending_verify: parseInt(pendingVerify.rows[0].total),
            },
            this_month: {
                total_orders: parseInt(monthlySales.rows[0].total_orders),
                total_amount: parseFloat(monthlySales.rows[0].total_amount),
            },
            alerts: {
                out_of_stock: parseInt(outOfStock.rows[0].total),
                low_stock: parseInt(lowStock.rows[0].total),
                expired_batches: parseInt(expiredBatches.rows[0].total),
            },
            sales_chart: chartData,
        });
    } catch (err) {
        return error(res, err.message);
    }
};

// Helper: เติมวันที่ขาดหายให้ครบ N วัน (ถ้าวันไหนไม่มียอดขายให้ใส่ 0)
const fillMissingDays = (rows, days) => {
    const result = [];
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const found = rows.find(r => {
            const rowDate = new Date(r.date).toISOString().split('T')[0];
            return rowDate === dateStr;
        });

        result.push({
        date: dateStr,
            total_orders: found ? parseInt(found.total_orders) : 0,
            total_amount: found ? parseFloat(found.total_amount) : 0,
        });
    }

    return result;
};

module.exports = { getDashboard };