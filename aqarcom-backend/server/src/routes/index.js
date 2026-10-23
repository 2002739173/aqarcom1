const router = require('express').Router();
const { PROPERTY_TYPES, LISTING_PURPOSES, TENDER_TYPES, TENDER_STATUS, REGISTRABLE_ROLES } = require('../config/constants');
const env = require('../config/env');

router.use('/auth', require('./auth.routes'));
router.use('/properties', require('./property.routes'));
router.use('/tenders', require('./tender.routes'));
router.use('/bids', require('./bid.routes'));
router.use('/uploads', require('./upload.routes'));
router.use('/verification', require('./verification.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/admin', require('./admin.routes'));

/** Lookup values for Android spinners / filters, plus the authoritative server time (BR-11). */
router.get('/meta', (req, res) =>
  res.json({
    success: true,
    data: {
      serverTime: new Date().toISOString(),
      roles: REGISTRABLE_ROLES,
      propertyTypes: PROPERTY_TYPES,
      listingPurposes: LISTING_PURPOSES,
      currencies: ['SYP', 'USD'],
      tenderTypes: TENDER_TYPES,
      tenderStatuses: Object.values(TENDER_STATUS),
      limits: {
        tenderDocMaxMb: env.tenderDocMaxMb,
        propertyImagesMax: env.propertyImages.maxCount,
        propertyImageMaxMb: env.propertyImages.maxSizeMb,
        verificationDocMaxMb: env.verificationDocMaxMb,
        uploadChunkMaxMb: env.chunkSizeMaxMb,
      },
    },
  })
);

module.exports = router;
