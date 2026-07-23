const db = require("../config/database");
const { success, error } = require("../utils/response");

// ดูแจ้งเตือนทั้งหมด (อ่านแล้ว + ยังไม่อ่าน)
const getAll = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT * FROM tbnotifications ORDER BY created_at DESC`
        );
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

// นับจำนวนที่ยังไม่อ่าน (สำหรับไอคอน 🔔) 
const getUnreadCount = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT COUNT(*) AS unread FROM tbnotifications WHERE is_read = false`
        );
        return success(res, { unread: parseInt(result.rows[0].unread) });
    } catch (err) {
        return error(res, err.message);
    }
};

// กดอ่านแจ้งเตือน
const markRead = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `UPDATE tbnotifications SET is_read = true WHERE notifid = $1 RETURNING *`, [id]
        );
        if (result.rows.length === 0) return error(res, 'ບໍ່ມີຂໍ້ມູນແຈ້ງເຕືອນ', 404);
        return success(res, result.rows[0], 'ອ່ານແຈ້ງເຕືອນ');
    } catch (err) {
        return error(res, err.message);
    }
};

// กดอ่านทั้งหมด
const markAllRead = async (req, res) => {
    try {
        await db.query(`UPDATE tbnotifications SET is_read = true WHERE is_read = false`);
        return success(res, null, 'ອ່ານແຈ້ງເຕືອນທັງໝົດ');
    } catch (err) {
        return error(res, err.message);
    }
};

module.exports = { getAll, getUnreadCount, markRead, markAllRead };