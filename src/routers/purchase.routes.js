const express = require("express");
const router = express.Router();
const { getAll, getOne, create, updateStatus } = require("../controllers/purchase.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

router.get("/", authenticate, authorize("Admin"), getAll);
router.get("/:id", authenticate, authorize("Admin"), getOne);
router.post("/", authenticate, authorize("Admin"), create);
router.patch("/:id/status", authenticate, authorize("Admin"), updateStatus);

module.exports = router;