const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        const result = await db.query(
            `SELECT userid, username, state FROM "user" ORDER BY userid`
        );
        return success(res, result.rows);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query(
            `SELECT userid, username, state FROM "user" WHERE userid = $1`,
            [id]
        );
        if (result.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນພະນັກງານ", 404);
        return success(res, result.rows[0]);
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || username.trim() === "") return error(res, "ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້", 400);
        if (!password || password.length < 6) return error(res, "ລະຫັດຜ່ານຕ້ອງມີຕົວອັກສອນຢ່າງໜ້ອຍ 6 ໂຕ", 400);

        const hashed = await bcrypt.hash(password, 10);
        const result = await db.query(
            `INSERT INTO "user" (username, password, state) VALUES ($1, $2, 'Staff')
            RETURNING userid, username, state`,
            [username, hashed]
        );

        return success(res, result.rows[0], "ເພີ້ມຂໍ້ມູນພະນັກງານສຳເລັດ", 201);
    } catch (err) {
        if (err.code === "23505") return error(res, "ຊື່ຜູ້ໃຊ້ນີ້ມີໃນລະບົບແລ້ວ", 409);
        return error(res, err.message);
    }
};

const update = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password } = req.body; // ตัด state ออกจาก body

        if (parseInt(id) === req.user.userid) {
            return error(res, 'ບໍ່ສາມາດແກ້ໄຂຂໍ້ມູນຂອງຕົວເອງໄດ້', 403);
        }

        if (!username || username.trim() === '') return error(res, 'ກະລຸນາປ້ອນຊື່ຜູ້ໃຊ້', 400);

        // เช็คว่า user ที่จะแก้ไขเป็น Admin ไหม — ถ้าใช่ไม่อนุญาต (Admin ต้องแก้ผ่าน DB เท่านั้น)
        const target = await db.query(`SELECT state FROM "user" WHERE userid = $1`, [id]);
        if (target.rows.length === 0) return error(res, 'ບໍ່ມີຂໍ້ມູນພະນັກງານ', 404);
        if (target.rows[0].state === 'Admin') {
            return error(res, 'ບໍ່ສາມາດແກ້ໄຂຂໍ້ມູນ Admin ໄດ້', 403);
        }

        let query, params;
        if (password) {
            if (password.length < 6) return error(res, 'ລະຫັດຜ່ານຕ້ອງມີຕົວອັກສອນຢ່າງໜ້ອຍ 6 ໂຕ', 400);
            const hashed = await bcrypt.hash(password, 10);
            query = `UPDATE "user" SET username=$1, password=$2 WHERE userid=$3 RETURNING userid, username, state`;
            params = [username, hashed, id];
        } else {
            query = `UPDATE "user" SET username=$1 WHERE userid=$2 RETURNING userid, username, state`;
            params = [username, id];
        }

        const result = await db.query(query, params);
        return success(res, result.rows[0], 'ແກ້ໄຂຂໍ້ມູນພະນັກງານສຳເລັດ');
    } catch (err) {
        if (err.code === '23505') return error(res, 'ຊື່ຜູ້ໃຊ້ນີ້ມີໃນລະບົບແລ້ວ', 409);
        return error(res, err.message);
    }
};

const remove = async (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id) === req.user.userid) {
            return error(res, 'ບໍ່ສາມາດລົບຂໍ້ມູນຂອງຕົວເອງໄດ້', 403);
        }

        const result = await db.query(
            `DELETE FROM "user" WHERE userid = $1 RETURNING userid`, [id]
        );
        if (result.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນພະນັກງານ", 404);

        return success(res, null, "ລົບຂໍ້ມູນພະນັກງານສຳເລັດ")
    } catch (err) {
        if (err.code === '23503') {
            return error(res, 'ບໍ່ສາມາດລົບຂໍ້ມູນພະນັກງານທີ່ມີປະຫວັດການຂາຍໄດ້', 409);
        }
        return error(res, err.message);
    }
};

module.exports = { getAll, getOne, create, update, remove };