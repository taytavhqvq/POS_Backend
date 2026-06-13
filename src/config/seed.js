require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./database");

const seed = async () => {
    const username = "admin";
    const plainPassword = "admin1234";
    const hashed = await bcrypt.hash(plainPassword, 10);

    await db.query(
        `INSERT INTO "user" (username, password, state) VALUES ($1, $2, $3)`,
        [username, hashed, "Admin"] 
    );

    console.log("Admin user created:", username, "/", plainPassword);
    process.exit(0);
};

seed()

