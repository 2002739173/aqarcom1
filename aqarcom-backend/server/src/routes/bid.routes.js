const router = require('express').Router();
const c = require('../controllers/bid.controller');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const v = require('../validators');

router.use(authenticate, authorize(ROLES.CONTRACTOR));

router.get('/mine', validate(v.bid.mine, 'query'), c.mine);
router.patch('/:id', validate(v.bid.update), c.update);
router.post('/:id/withdraw', c.withdraw);

module.exports = router;
