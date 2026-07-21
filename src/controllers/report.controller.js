const db = require('../config/database');
const { success, error } = require('../utils/response');

const getSalesReport = async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        // default: ถ้าไม่ส่งวันที่มา → ดึงข้อมูลเดือนปัจจุบัน
        const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
        const to = date_to || new Date().toISOString().split('T')[0];

        // 1. ยอดรวมทั้งหมด
        const summary = await db.query(`
            SELECT
                COUNT(*) AS total_orders,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(created_at) BETWEEN $1 AND $2
        `, [from, to]);

        // 2. แยกตามประเภท (Walk-in / Online)
        const byType = await db.query(`
            SELECT
                type,
                COUNT(*) AS total_orders,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(created_at) BETWEEN $1 AND $2
            GROUP BY type
            ORDER BY type
        `, [from, to]);

        // 3. แยกตามวิธีชำระเงิน (Cash / โอน)
        const byPayment = await db.query(`
            SELECT
                payment_method,
                COUNT(*) AS total_orders,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(created_at) BETWEEN $1 AND $2
            GROUP BY payment_method
            ORDER BY payment_method
        `, [from, to]);

        // 4. ยอดขายรายวัน (สำหรับกราฟ)
        const dailySales = await db.query(`
            SELECT
                DATE(created_at) AS date,
                COUNT(*) AS total_orders,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tborders
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(created_at) BETWEEN $1 AND $2
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        `, [from, to]);

        return success(res, {
            period: { from, to },
            summary: summary.rows[0],
            by_type: byType.rows,
            by_payment: byPayment.rows,
            daily_sales: dailySales.rows,
        });
    } catch (err) {
        return error(res, err.message);
    }
};

const getTopProducts = async (req, res) => {
    try {
        const { date_from, date_to } = req.query;
        const limit = parseInt(req.query.limit) || 10;

        const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
        const to = date_to || new Date().toISOString().split('T')[0];

        const result = await db.query(`
            SELECT
                p.proid,
                p.proname,
                c.catname AS category,
                SUM(oi.qty) AS total_qty_sold,
                SUM(oi.qty * oi.unit_price) AS total_amount
            FROM tborder_items oi
            JOIN tborders o ON oi.orderid = o.orderid
            JOIN tbproducts p ON oi.proid = p.proid
            LEFT JOIN tbcategory c ON p.catid = c.catid
            WHERE o.status = 'ຈ່າຍສຳເລັດ'
                AND DATE(o.created_at) BETWEEN $1 AND $2
            GROUP BY p.proid, p.proname, c.catname
            ORDER BY total_qty_sold DESC
            LIMIT $3
        `, [from, to, limit]);

        return success(res, {
            period: { from, to },
            top_products: result.rows,
        });
    } catch (err) {
        return error(res, err.message);
    }
};

const getPurchaseReport = async (req, res) => {
    try {
        const { date_from, date_to } = req.query;

        const from = date_from || new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
        const to = date_to || new Date().toISOString().split('T')[0];

        // ยอดรวมการจัดซื้อ
        const summary = await db.query(`
            SELECT
                COUNT(*) AS total_purchases,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tbpurchase
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(purchasedate) BETWEEN $1 AND $2
            `, [from, to]);

        // แยกตามซัพพลายเออร์
        const bySupplier = await db.query(`
            SELECT
                s.comname AS supplier_name,
                COUNT(*) AS total_purchases,
                COALESCE(SUM(p.total), 0) AS total_amount
            FROM tbpurchase p
            JOIN tbsupplier s ON p.supid = s.supid
            WHERE p.status = 'ຈ່າຍສຳເລັດ'
                AND DATE(p.purchasedate) BETWEEN $1 AND $2
            GROUP BY s.comname
            ORDER BY total_amount DESC
            `, [from, to]);

        // รายการสินค้าที่ซื้อเข้าในช่วงนี้
        const purchasedItems = await db.query(`
            SELECT
                pr.proname,
                u.uname AS unit,
                SUM(pi.pack_qty) AS total_qty,
                SUM(pi.pack_qty * pi.cost_price) AS total_cost
            FROM tbpurchase_items pi
            JOIN tbpurchase p ON pi.purchaseid = p.purchaseid
            JOIN tbproducts pr ON pi.proid = pr.proid
            JOIN tbunit u ON pi.uid = u.uid
            WHERE p.status = 'ຈ່າຍສຳເລັດ'
                AND DATE(p.purchasedate) BETWEEN $1 AND $2
            GROUP BY pr.proname, u.uname
            ORDER BY total_cost DESC
            `, [from, to]);

        // ยอดจัดซื้อรายวัน (สำหรับกราฟ)
        const dailyPurchases = await db.query(`
            SELECT
                DATE(purchasedate) AS date,
                COUNT(*) AS total_purchases,
                COALESCE(SUM(total), 0) AS total_amount
            FROM tbpurchase
            WHERE status = 'ຈ່າຍສຳເລັດ'
                AND DATE(purchasedate) BETWEEN $1 AND $2
            GROUP BY DATE(purchasedate)
            ORDER BY DATE(purchasedate) ASC
            `, [from, to]);

        return success(res, {
            period: { from, to },
            summary: summary.rows[0],
            by_supplier: bySupplier.rows,
            purchased_items: purchasedItems.rows,
            daily_purchases: dailyPurchases.rows,
        });
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getSalesReport, getTopProducts, getPurchaseReport };