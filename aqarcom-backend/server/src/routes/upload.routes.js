/** Resumable chunked upload for large spec books (NFR-01). */
const express = require('express');
const c = require('../controllers/upload.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const env = require('../config/env');
const { authenticate, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const v = require('../validators');

const router = express.Router();
router.use(authenticate, authorize(ROLES.PROJECT_OWNER));

const rawChunk = express.raw({ type: 'application/octet-stream', limit: `${env.chunkSizeMaxMb}mb` });
const chunkBody = (req, res, next) => (req.is('multipart/form-data') ? upload.chunk(req, res, next) : rawChunk(req, res, next));

router.post('/', validate(v.upload.init), c.init);
router.get('/:id', c.status);
router.put('/:id/chunks/:index', chunkBody, c.putChunk);

module.exports = router;
