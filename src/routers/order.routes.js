const express = require('express');
const router = express.Router();
const { createWalkIn, createOnline, getAll, getOne } = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Walk-in: พนักงาน/Admin ขายหน้าร้าน
router.post('/walk-in', authenticate, authorize('Admin', 'Staff'), createWalkIn);

// Online: รอ Customer Auth (Step ถัดไป) ถึงจะทดสอบได้จริง
router.post('/online', authenticate, createOnline);

// ดูออเดอร์ - Admin/Staff เท่านั้น
router.get('/', authenticate, authorize('Admin', 'Staff'), getAll);
router.get('/:id', authenticate, authorize('Admin', 'Staff'), getOne);

module.exports = router;