const router = require('express').Router();
const c = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const v = require('../validators');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/stats', c.stats); // FR-28
router.get('/review-queue', validate(v.admin.queue, 'query'), c.queue); // FR-27

router.post('/properties/:id/moderate', validate(v.admin.moderate), c.moderateProperty);
router.get('/properties/:id/moderation-history', c.propertyHistory);
router.post('/tenders/:id/moderate', validate(v.admin.moderate), c.moderateTender);
router.get('/tenders/:id/moderation-history', c.tenderHistory);

router.get('/users', validate(v.admin.users, 'query'), c.users);
router.get('/users/:id', c.user);
// approve | reject | suspend | reactivate — the only way an account gains privileges
router.post('/users/:id/:action(approve|reject|suspend|reactivate)', validate(v.admin.userAction), c.userAction);
router.post('/users/:id/role', validate(v.admin.changeRole), c.changeRole);
router.post('/users/:id/status', validate(v.admin.userStatus), c.setUserStatus);

// engineering verification (FR-24)
router.get('/verifications', validate(v.admin.verifications, 'query'), c.verifications);
router.get('/verifications/:id', c.verification);
router.get('/verifications/:id/documents/:docId', c.verificationDocument);
router.post('/verifications/:id/decision', validate(v.admin.verificationDecision), c.decideVerification);

module.exports = router;
