const db = require("../config/database");

// สร้างแจ้งเตือนลง DB แล้ว emit socket ไปหา Admin ทันที
const createNotification = async (io, type, message, ref_id = null) => {
    try {
        const result = await db.query(
            `INSERT INTO tbnotifications (type, message, ref_id, created_at)
            VALUES ($1, $2, $3, NOW())
            RETURNING *`,
            [type, message, ref_id]
        );
        const notif = result.rows[0];

        // emit ไปหาทุกคนในห้อง 'admin' ทันที
        if (io) {
            io.to('admin').emit('notification', notif);
        }

        return notif;
    } catch (err) {
        console.error("createNotification error:", err.message);
    }
};

module.exports = { createNotification };