const db = require("../config/database");
const { success, error } = require("../utils/response");

const getAll = async (req, res) => {
    try {
        // Admin เห็นทั้งหมด เรียง active ก่อน
        // Staff/Customer เห็นแค่ active
        const isAdmin = req.user.state === "Admin";
        const whereClause = isAdmin ? "" : "WHERE p.is_active = true";

        // ดึงสินค้าที่ is_active = true พร้อม join หมวดหมู่
        const products = await db.query(`
            SELECT p.proid, p.proname, p.createdate, p.is_active, p.image_url, c.catname
            FROM tbproducts p
            LEFT JOIN tbcategory c 
            ON p.catid = c.catid
            ${whereClause}
            ORDER BY p.is_active DESC, p.proid ASC
        `);

        // ดึงหน่วย/ราคาทั้งหมด แล้วเอามาแมพกับสินค้าแต่ละตัว
        const units = await db.query(`
            SELECT pu.conid, pu.proid, pu.uid, u.uname, pu.barcode, pu.qty_base, pu.imprice, pu.saleprice
            FROM tbproduct_units pu
            JOIN tbunit u
            ON pu.uid = u.uid
        `);

        // รวมข้อมูล: แต่ละสินค้า จะมี array "units"
        const data = products.rows.map(p => ({
            ...p,
            units: units.rows.filter(u => u.proid === p.proid)
        }));

        return success(res, data);
    } catch (err) {
        return error(res, err.message);
    }
};

const getOne = async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.state === "Admin";

        // Admin เห็นได้ทุกตัว, Staff/Customer เห็นแค่ active
        const whereClause = isAdmin
            ? "WHERE p.proid = $1"
            : "WHERE p.proid = $1 AND p.is_active = true"

        const product = await db.query(`
            SELECT p.proid, p.proname, p.createdate, p.is_active, p.image_url, c.catname
            FROM tbproducts p
            LEFT JOIN tbcategory c
            ON p.catid = c.catid
            ${whereClause}
        `, [id]);

        if (product.rows.length === 0) {
            return error(res, "Product not found", 404);
        }

        const units = await db.query(`
            SELECT pu.conid, pu.uid, u.uname, pu.barcode, pu.qty_base, pu.imprice, pu.saleprice
            FROM tbproduct_units pu
            INNER JOIN tbunit u
            ON pu.uid = u.uid
            WHERE pu.proid = $1
        `, [id]);

        return success(res, { ...product.rows[0], units: units.rows });
    } catch (err) {
        return error(res, err.message);
    }
};

const create = async (req, res) => {
    const client = await db.connect();
    try {
        const { proname, catid, units } = req.body;

        // validation พื้นฐาน
        if (!proname) {
            return error(res, "ກະລຸນາປ້ອນຊື່ສິນຄ້າ", 400);
        }
        if (!units || units.length === 0) {
            return error(res, "ກະລຸນາລະບຸຫົວໜ່ວຍ ແລະ ລາຄາສຳລັບຫົວໜ່ວຍຢ່າງໜ້ອຍ 1 ລາຍການ", 400);
        }

        const imageUrl = req.file ? `/uploads/products/${req.file.filename}` : null;
        
        await client.query("BEGIN");   // เริ่ม transaction

        // is_active = false เสมอ ต้องให้ Admin เปิดเองทีหลัง
        // 1. insert สินค้าหลัก
        const productResult = await client.query(`
            INSERT INTO tbproducts (proname, catid, createdate, is_active, image_url)
            VALUES ($1, $2, CURRENT_DATE, false, $3) RETURNING *`,
            [proname, catid, imageUrl]
        );
        const newProduct = productResult.rows[0];

        // 2. insert หน่วย/ราคา ทุกตัวที่ส่งมา
        const parsedUnits = typeof units === 'string' ? JSON.parse(units) : units;
        for (const u of parsedUnits) {
            await client.query(
                `INSERT INTO tbproduct_units (proid, uid, barcode, qty_base, imprice, saleprice)
                VALUES ($1, $2, $3, $4, $5, $6)`,
                [newProduct.proid, u.uid, u.barcode || null, u.qty_base, u.imprice, u.saleprice]
            );
        }

        // 3. สร้าง stock record เริ่มต้น (qty=0)
        await client.query(
            `INSERT INTO tbstock (proid, qty, balance, level) VALUES ($1, 0, 0, 0)`,
            [newProduct.proid]
        );

        await client.query("COMMIT");   // สำเร็จทั้งหมด → commit

        return success(res, newProduct, "ເພີ້ມຂໍ້ມູນສິນຄ້າສຳເລັດ", 201);
    } catch (err) {
        await client.query("ROLLBACK");   // ถ้า error ตรงไหน → ย้อนกลับทั้งหมด

        // if (err.code === "23505") {
        //     return error(res, "Barcode ນີ້ມີໃນລະບົບແລ້ວ", 409);
        // }
        return error(res, err.message);
    } finally {
        client.release();    // คืน connection กลับ pool เสมอ
    }
};

// Helper: เช็คว่าสินค้านี้เคยถูกขายไปแล้วหรือยัง
const hasBeenSold = async (proid) => {
    const result = await db.query(
        `SELECT 1 FROM tborder_items WHERE proid = $1 LIMIT 1`,
        [proid]
    );
    return result.rows.length > 0;
};

const update = async (req, res) => {
    const client = await db.connect();
    try {
        const { id } = req.params;
        const { proname, catid, units } = req.body;

        const imageUrl = req.file
            ? `/uploads/products/${req.file.filename}`
            : req.body.image_url || null;

        const sold = await hasBeenSold(id);

        // if (sold) {
        //     //client.release();
        //     return error(res, "ສິນຄ້ານີ້ມີປະຫວັດການຂາຍແລ້ວ ແລະ ບໍ່ສາມາດແກ້ໄຂໄດ້", 403);
        // }
        if (sold) {
            // ข้อมูลสินค้าเดิม
            const oldProduct = await client.query(
                `SELECT catid
                FROM tbproducts
                WHERE proid=$1`,
                [id]
            );

            // หน่วยเดิม
            const oldUnits = await client.query(
                `SELECT uid, barcode, qty_base
                FROM tbproduct_units
                WHERE proid=$1
                ORDER BY uid`,
                [id]
            );

            // 1. ห้ามเปลี่ยนหมวด
            if (oldProduct.rows[0].catid != catid) {
                return error(res,
                    "ບໍ່ສາມາດແກ້ໄຂໝວດໝູ່ໄດ້",403);
            }

            // 2. ห้ามเพิ่ม/ลบหน่วย
            if (units.length != oldUnits.rows.length) {
                return error(res,
                    "ບໍ່ສາມາດເພີ່ມ ຫຼື ລົບຫົວໜ່ວຍໄດ້",403);
            }

            // 3. ห้ามเปลี่ยน uid barcode qty_base
            for(let i=0;i<units.length;i++){

                const old = oldUnits.rows[i];
                const now = units[i];

                if(
                    old.uid != now.uid ||
                    old.barcode != now.barcode ||
                    Number(old.qty_base) != Number(now.qty_base)
                ){
                    return error(res,
                        "ບໍ່ສາມາດແກ້ໄຂຫົວໜ່ວຍ, Barcode ຫຼື ຈຳນວນຕໍ່ຫົວໜ່ວຍໄດ້",
                        403
                    );
                }
            }
        }

        await client.query('BEGIN');

        const result = await client.query(
            `UPDATE tbproducts SET proname=$1, catid=$2 WHERE proid=$3 RETURNING *`,
            [proname, catid, id]
        );

        if (units && units.length > 0) {
            await client.query('DELETE FROM tbproduct_units WHERE proid = $1', [id]);
            for (const u of units) {
                await client.query(
                    `INSERT INTO tbproduct_units (proid, uid, barcode, qty_base, imprice, saleprice)
                    VALUES ($1, $2, $3, $4, $5, $6)`,
                    [id, u.uid, u.barcode || null, u.qty_base, u.imprice, u.saleprice]
                );
            }
        }

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            //client.release();
            return error(res, 'ບໍ່ມີຂໍ້ມູນສິນຄ້າ', 404);
        }

        await client.query('COMMIT');
        return success(res, result.rows[0], 'ແກ້ໄຂຂໍ້ມູນສິນຄ້າສຳເລັດ');
    } catch (err) {
        await client.query('ROLLBACK');
        // if (err.code === '23505') return error(res, 'Barcode ນີ້ມີໃນລະບົບແລ້ວ', 409);
        return error(res, err.message);
    } finally {
        client.release();
    }
};

const updateActiveStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (is_active === undefined) {
            return error(res, 'ກະລຸນາເລືອກສະຖານະ', 400);
        }

        const result = await db.query(
            `UPDATE tbproducts SET is_active = $1 WHERE proid = $2 RETURNING *`,
            [is_active, id]
        );

        if (result.rows.length === 0) return error(res, 'ບໍ່ມີຂໍ້ມູນສິນຄ້າ', 404);
        return success(res, result.rows[0], 'ແກ້ໄຂສະຖານະສິນຄ້າສຳເລັດ');
    } catch (err) {
        return error(res, err.message);
    }
};

// ยังไม่เคยขาย -> ลบจริง (hard delete)
// เคยขายแล้ว -> set is_active = false (soft delete)
const remove = async (req, res) => {
    try {
        const { id } = req.params;

        const sold = await hasBeenSold(id);

        if (sold) {
            // soft delete
            const result = await db.query(
                `UPDATE tbproducts SET is_active = false WHERE proid = $1 RETURNING *`,
                [id]
            );
            if (result.rows.length === 0) return error(res, "ບໍ່ມີຂໍ້ມູນສິນຄ້າ", 404);
            return success(res, null, "ສິນຄ້ານີ້ໄດ້ປິດໃຊ້ງານໄປແລ້ວ ແຕ່ບໍ່ສາມາດລົບໄດ້ເນື່ອງຈາກມີປະຫວັດການຂາຍ");
        } else {
            // hard delete - ต้องลบ tbproduct_units และ tbstock ก่อน เพราะมี FK
            const client = await db.connect();
            try {
                await client.query("BEGIN");
                await client.query("DELETE FROM tbproduct_units WHERE proid = $1", [id]);
                await client.query("DELETE FROM tbstock WHERE proid = $1", [id]);
                const result = await client.query(
                    `DELETE FROM tbproducts WHERE proid = $1 RETURNING *`, [id]
                );
                if (result.rows.length === 0) {
                    await client.query("ROLLBACK");
                    client.release();
                    return error(res, "ບໍ່ມີຂໍ້ມູນສິນຄ້າ", 404);
                }
                await client.query("COMMIT");
                client.release();
                return success(res, null, "ລົບຂໍ້ມູນສິນຄ້າສຳເລັດ");
            } catch (err) {
                await client.query("ROLLBACK");
                client.release();
                throw err; 
            }
        }
    } catch (err) {
        return error(res, err.message);
    }
};

const getByBarcode = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT p.proid, p.proname, c.catname,
                    pu.conid, pu.uid, u.uname, pu.barcode,
                    pu.qty_base, pu.imprice, pu.saleprice,
                    s.qty AS stock_qty
            FROM tbproduct_units pu
            JOIN tbproducts p ON pu.proid = p.proid
            JOIN tbunit u ON pu.uid = u.uid
            LEFT JOIN tbcategory c ON p.catid = c.catid
            LEFT JOIN tbstock s ON p.proid = s.proid
            WHERE pu.barcode = $1
                AND p.is_active = true
        `, [req.params.barcode]);

        if (result.rows.length === 0) return error(res, 'ບໍ່ມີຂໍ້ມູນສິນຄ້າ', 404);
        return success(res, result.rows[0]);
    } catch (err) {
        return error(res, err.message);
    }
};

const uploadImage = async (req, res) => {
    try {
        if (!req.file) return error(res, 'ກະລຸນາອັບໂຫຼດຮູບພາບ', 400);

        const { id } = req.params;
        const imageUrl = `/uploads/products/${req.file.filename}`;

        const result = await db.query(
            `UPDATE tbproducts SET image_url = $1 WHERE proid = $2 RETURNING *`,
            [imageUrl, id]
        );
        if (result.rows.length === 0) return error(res, 'ບໍ່ມີຂໍ້ມູນສິນຄ້າ', 404);

        return success(res, { image_url: imageUrl }, 'ອັບໂຫຼດຮູບພາບສຳເລັດ');
    } catch (err) {
        return error(res, err.message);
    }
};
module.exports = { getAll, getOne, create, update, remove, getByBarcode, uploadImage, updateActiveStatus };