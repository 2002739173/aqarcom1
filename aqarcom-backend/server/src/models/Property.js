const mongoose = require('mongoose');
const { PROPERTY_TYPES, LISTING_PURPOSES, CONTENT_STATUS } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const moderationSchema = new mongoose.Schema(
  {
    reason: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: Date,
  },
  { _id: false }
);

/**
 * Media is a typed list (image now; video / 3d_tour later) so new media kinds
 * can be added without a structural change (NFR-07).
 */
const mediaSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video', '3d_tour'], default: 'image' },
    url: { type: String, required: true },
    path: { type: String }, // storage path for files we host
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const propertySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 5000 },
    propertyType: { type: String, enum: PROPERTY_TYPES, required: true },
    purpose: { type: String, enum: LISTING_PURPOSES, required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: ['SYP', 'USD'], default: 'USD' },
    area: { type: Number, required: true, min: 1 }, // m²
    rooms: { type: Number, min: 0, default: 0 },
    bathrooms: { type: Number, min: 0, default: 0 },
    floor: { type: Number },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    address: { type: String, trim: true },
    // FR-07 / BR-04 — GeoJSON point [lng, lat], mandatory at publish time
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: (c) => Array.isArray(c) && c.length === 2 && c[0] >= -180 && c[0] <= 180 && c[1] >= -90 && c[1] <= 90,
          message: 'إحداثيات غير صالحة',
        },
      },
    },
    media: { type: [mediaSchema], default: [] },
    // CN-08 / BR-20 — soft delete & moderation
    status: { type: String, enum: Object.values(CONTENT_STATUS), default: CONTENT_STATUS.ACTIVE, index: true },
    moderation: moderationSchema,
    deletedAt: Date,
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

propertySchema.index({ location: '2dsphere' });
propertySchema.index({ status: 1, city: 1, propertyType: 1, purpose: 1, price: 1 });
propertySchema.index({ status: 1, createdAt: -1 });
propertySchema.index({ area: 1 });
propertySchema.index({ rooms: 1 });
propertySchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Property', propertySchema);
