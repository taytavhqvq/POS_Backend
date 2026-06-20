const express = require("express");
const router = express.Router();
const { uploadSlip, getPending, verify, reject } = require("../controllers/payment.controller");
const { authenticate, authorize, authenticateCustomer } = require('../middlewares/auth.middleware');
const upload = require("../middlewares/upload.middleware");

router.post('/upload/:orderid', authenticateCustomer, upload.single('slip'), uploadSlip);

router.get('/pending', authenticate, authorize('Admin'), getPending);
router.patch('/:paymentid/verify', authenticate, authorize('Admin'), verify);
router.patch('/:paymentid/reject', authenticate, authorize('Admin'), reject);

module.exports = router;