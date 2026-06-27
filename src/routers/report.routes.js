const express = require('express');
const router = express.Router();
const { getSalesReport, getTopProducts } = require('../controllers/report.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/sales', authenticate, authorize('Admin'), getSalesReport);
router.get('/top-products', authenticate, authorize('Admin'), getTopProducts);

module.exports = router;