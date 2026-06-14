const express = require("express");
const router = express.Router();
const { getAll, create, update, remove } = require("../controllers/category.controller");
const { authenticate, authorize } = require("../middlewares/auth.middleware"); 

router.get("/", authenticate, getAll);
router.post("/", authenticate, authorize("Admin"), create);
router.put("/:id", authenticate, authorize("Admin"), update);
router.delete("/:id", authenticate, authorize("Admin"), remove)

module.exports = router;