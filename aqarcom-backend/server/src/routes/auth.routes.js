const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const c = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const v = require('../validators').auth;

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: env.isTest ? 10000 : 100, standardHeaders: true, legacyHeaders: false });

router.post('/register', authLimiter, validate(v.register), c.register);
router.post('/login', authLimiter, validate(v.login), c.login);
router.post('/refresh', authLimiter, validate(v.refresh), c.refresh);
router.post('/logout', validate(v.logout), c.logout);
router.post('/forgot-password', authLimiter, validate(v.forgot), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(v.reset), c.resetPassword);

router.get('/me', authenticate, c.me);
router.patch('/me', authenticate, validate(v.updateProfile), c.updateMe);
router.post('/change-password', authenticate, validate(v.changePassword), c.changePassword);
router.post('/device-token', authenticate, validate(v.deviceToken), c.registerDevice);
router.delete('/device-token', authenticate, validate(v.deviceToken), c.removeDevice);

module.exports = router;
