const router = require('express').Router();
const c = require('../controllers/verification.controller');
const upload = require('../middleware/upload');
const { authenticate, authorizeAllowPending } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

// pending contractors may upload documents so the admin can review them before approving the account
router.use(authenticate, authorizeAllowPending(ROLES.CONTRACTOR));

// multipart fields: engineers_syndicate, commercial_register, other (+ optional text field "notes")
router.post('/', upload.verificationDocs, c.submit);
router.get('/me', c.me);

module.exports = router;
