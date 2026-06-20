const express = require('express');
const router = express.Router();
const { getAllBatches } = require('../controllers/purchase.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/', authenticate, authorize('Admin'), getAllBatches);

module.exports = router;