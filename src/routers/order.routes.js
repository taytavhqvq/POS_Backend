const express = require('express');
const router = express.Router();
const { createWalkIn, createOnline, getAll, getOne, getStatusCounts } = require('../controllers/order.controller');
const { authenticate, authorize, authenticateCustomer } = require('../middlewares/auth.middleware');

router.post('/walk-in', authenticate, authorize('Admin', 'Staff'), createWalkIn);
router.post('/online', authenticateCustomer, createOnline);

router.get('/', authenticate, authorize('Admin', 'Staff'), getAll);
router.get('/status-counts', authenticate, authorize('Admin', 'Staff'), getStatusCounts);
router.get('/:id', authenticate, authorize('Admin', 'Staff'), getOne);

module.exports = router;