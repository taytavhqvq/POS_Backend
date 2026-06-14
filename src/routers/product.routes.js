const express = require('express');
const router = express.Router();
const { getAll, getOne, create, update, remove } = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get("/", authenticate, getAll);
router.get("/:id", authenticate, getOne);
router.post("/", authenticate, authorize("Admin"), create);
router.put("/:id", authenticate, authorize("Admin"), update);
router.delete("/:id", authenticate, authorize("Admin"), remove);

module.exports = router;