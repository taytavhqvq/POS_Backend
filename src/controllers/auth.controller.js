const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { success, error } = require("../utils/response");

const login = async (req, res) => {
    try{
        const { username, password } = req.body;

        const result = await db.query(`SELECT * FROM "user" WHERE username = $1`, [username]);
        if (result.rows.length === 0) {
            return error(res, "Username or Password is incorrect", 401);
        }

        const user = result.rows[0];

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return error(res, "Username or Password is incorrect", 401);
        }

        const token = jwt.sign(
            { userid: user.userid, username: user.username, state: user.state },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        return success(res, {
            token,
            user: { userid: user.userid, username: user.username, state: user.state }
        }, "Login successful");
    } catch(err) {
        return error(res, err.message);
    }
};

module.exports = { login };

