const express = require('express');
const router = express.Router();
const { register, login, me } = require('../controllers/customer.controller');
const { authenticateCustomer } = require('../middlewares/auth.middleware');

router.post('/register', register);   // public
router.post('/login', login);         // public
router.get('/me', authenticateCustomer, me);

module.exports = router;