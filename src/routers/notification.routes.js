const express = require('express');
const router = express.Router();
const { getAll, getUnreadCount, markRead, markAllRead } = require('../controllers/notification.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

router.get('/', authenticate, authorize('Admin'), getAll);
router.get('/unread/count', authenticate, authorize('Admin'), getUnreadCount);
router.patch('/read-all', authenticate, authorize('Admin'), markAllRead);
router.patch('/:id/read', authenticate, authorize('Admin'), markRead);

module.exports = router;