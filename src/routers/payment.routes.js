const express = require("express");
const router = express.Router();
const { uploadSlip: uploadSlipController, getPending, verify, reject } = require("../controllers/payment.controller");
const { authenticate, authorize, authenticateCustomer } = require('../middlewares/auth.middleware');
const { uploadSlip: uploadSlipMiddleware } = require('../middlewares/upload.middleware');

router.post('/upload/:orderid', authenticateCustomer, uploadSlipMiddleware.single('image'), uploadSlipController);

router.get('/pending', authenticate, authorize('Admin'), getPending);
router.patch('/:paymentid/verify', authenticate, authorize('Admin'), verify);
router.patch('/:paymentid/reject', authenticate, authorize('Admin'), reject);

module.exports = router;