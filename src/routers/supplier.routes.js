const express = require("express");
const router = express.Router();
const { getAll, getOne, create, update, remove } = require("../controllers/supplier.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware");

router.get("/", authenticate, authorize("Admin"), getAll);
router.get("/:id", authenticate, authorize("Admin"), getOne);
router.post("/", authenticate, authorize("Admin"), create);
router.put("/:id", authenticate, authorize("Admin"), update);
router.delete("/:id", authenticate, authorize("Admin"), remove);

module.exports = router;