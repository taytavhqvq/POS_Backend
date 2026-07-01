const express = require('express');
const router = express.Router();
const { getAll, getOne, create, update, remove, getByBarcode, uploadImage } = require('../controllers/product.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { uploadProduct } = require('../middlewares/upload.middleware');

router.get('/barcode/:barcode', authenticate, getByBarcode);
router.get("/", authenticate, getAll);
router.get("/:id", authenticate, getOne);

router.post("/", authenticate, authorize("Admin"), create);
router.put("/:id", authenticate, authorize("Admin"), update);

router.patch('/:id/image', authenticate, authorize('Admin'), uploadProduct.single('image'), uploadImage);

router.delete("/:id", authenticate, authorize("Admin"), remove);

module.exports = router;