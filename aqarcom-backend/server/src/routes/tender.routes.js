const router = require('express').Router();
const c = require('../controllers/tender.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { authenticate, authorize, requireVerifiedContractor } = require('../middleware/auth');
const { ROLES, B2B_ROLES } = require('../config/constants');
const v = require('../validators');

// the whole B2B section is closed to individual users / property owners (NFR-04)
router.use(authenticate, authorize(...B2B_ROLES));

const projectOwner = authorize(ROLES.PROJECT_OWNER);
const ownerOrAdmin = authorize(ROLES.PROJECT_OWNER, ROLES.ADMIN);

router.get('/', validate(v.tender.list, 'query'), c.list);
router.get('/mine', projectOwner, validate(v.tender.list, 'query'), c.mine);
router.post('/', projectOwner, validate(v.tender.create), c.create);

router.get('/:id', c.get);
router.patch('/:id', projectOwner, validate(v.tender.update), c.update);
router.post('/:id/publish', projectOwner, c.publish);
router.post('/:id/extend', projectOwner, validate(v.tender.extend), c.extend);
router.post('/:id/cancel', projectOwner, validate(v.tender.cancel), c.cancel);

// specification book (FR-11, FR-15)
router.post('/:id/documents', projectOwner, upload.tenderDocument, validate(v.tender.documentMeta), c.uploadDocument);
router.get('/:id/documents', c.listDocuments);
router.get('/:id/documents/latest/download', c.downloadLatest);
router.get('/:id/documents/:version/download', c.downloadVersion);

// bids (FR-12) — verified contractors only (BR-09)
router.post('/:id/bids', requireVerifiedContractor, validate(v.bid.submit), c.submitBid);
router.get('/:id/bids', ownerOrAdmin, c.tenderBids);

// evaluation & award (FR-18, FR-20)
router.get('/:id/shortlist', ownerOrAdmin, c.shortlist);
router.post('/:id/award', projectOwner, validate(v.tender.award), c.award);

module.exports = router;
