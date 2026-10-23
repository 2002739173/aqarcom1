const router = require('express').Router();
const c = require('../controllers/notification.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators');

router.use(authenticate);
router.get('/', validate(v.common.notifications, 'query'), c.list);
router.get('/unread-count', c.unreadCount);
router.post('/read-all', c.markAllRead);
router.post('/:id/read', c.markRead);

module.exports = router;
