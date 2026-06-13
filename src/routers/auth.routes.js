const express = require("express");
const router = express.Router();
const { login } = require("../controllers/auth.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { success } = require("../utils/response");

router.post("/login", login);

// route ทดสอบ: ต้อง login ก่อนถึงเรียกได้
router.get("/me", authenticate, (req, res) => {
    return success(res, req.user, "User info retrieved successfully");
});

module.exports = router;