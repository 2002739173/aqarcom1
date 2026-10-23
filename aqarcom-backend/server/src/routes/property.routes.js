const router = require('express').Router();
const c = require('../controllers/property.controller');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const { ROLES } = require('../config/constants');
const v = require('../validators');

const publisher = authorize(ROLES.PROPERTY_OWNER, ROLES.ADMIN);

// public browsing (visitors allowed; phone hidden for them — BR-05)
router.get('/', optionalAuth, validate(v.property.search, 'query'), c.search);
router.get('/map', optionalAuth, validate(v.property.map, 'query'), c.map);

// favorites (FR-09) — any signed-in user
router.get('/favorites', authenticate, validate(v.common.pageOnly, 'query'), c.favorites);

// owner's own listings
router.get('/mine', authenticate, publisher, validate(v.property.mine, 'query'), c.mine);

router.post('/', authenticate, publisher, validate(v.property.create), c.create);
router.get('/:id', optionalAuth, c.get);
router.patch('/:id', authenticate, publisher, validate(v.property.update), c.update);
router.delete('/:id', authenticate, publisher, c.remove);

router.post('/:id/images', authenticate, publisher, upload.propertyImages, c.addImages);
router.delete('/:id/images/:imageId', authenticate, publisher, c.removeImage);

router.get('/:id/contact', authenticate, c.contact); // FR-25
router.post('/:id/favorite', authenticate, c.addFavorite);
router.delete('/:id/favorite', authenticate, c.removeFavorite);

module.exports = router;
