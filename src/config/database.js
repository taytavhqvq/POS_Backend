require("dotenv").config();
const { Pool } = require("pg");
// Pool = เก็บ connection หลายๆอันไว้ใช้ซ้ำ ไม่ต้องเปิด-ปิดทุกครั้งที่ query

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

pool.connect()
    .then(client => {
        console.log("Database connectedd successfully");
        client.release(); // ปล่อย connection กลับไปที่ pool
    })
    .catch(err => {
        console.error("Database connection failed:", err.message);
    });

module.exports = pool;