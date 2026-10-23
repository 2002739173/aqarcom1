const mongoose = require('mongoose');
const { TENDER_TYPES, TENDER_STATUS, CONTENT_STATUS, EVALUATION_ENGINE } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const tenderSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 10000 },
    tenderType: { type: String, enum: TENDER_TYPES, required: true },
    city: { type: String, trim: true },
    address: { type: String, trim: true },
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
    // optional link to a property listed on the platform ("buy land then tender its construction")
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
    estimatedBudget: { type: Number, min: 0 },

    // FR-10 / BR-07 — integer weights 0..100 summing to exactly 100
    priceWeight: { type: Number, required: true, min: 0, max: 100 },
    durationWeight: { type: Number, required: true, min: 0, max: 100 },

    // tenders.deadline — UTC; server clock is the only authority (BR-11)
    deadline: { type: Date, required: true, index: true },
    originalDeadline: { type: Date },
    // tenders.extension_used — false → true once, never back (BR-13)
    extensionUsed: { type: Boolean, default: false },
    extendedAt: Date,

    status: { type: String, enum: Object.values(TENDER_STATUS), default: TENDER_STATUS.DRAFT, index: true },
    publishedAt: Date,
    closedAt: Date,

    // BR-08 — weights snapshot taken at the moment of closing
    frozenWeights: {
      price: Number,
      duration: Number,
      frozenAt: Date,
    },

    // evaluation metadata (BR-17)
    evaluation: {
      engine: { type: String, enum: Object.values(EVALUATION_ENGINE) },
      evaluatedAt: Date,
      bidsConsidered: Number,
      fallbackReason: String,
    },

    awardedBid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid' },
    awardedAt: Date,
    cancelledAt: Date,
    cancelReason: String,

    currentDocumentVersion: { type: Number, default: 0 },
    activeBidsCount: { type: Number, default: 0 },

    // moderation (FR-27 / BR-06 / BR-20) — independent of the lifecycle status
    visibility: { type: String, enum: Object.values(CONTENT_STATUS), default: CONTENT_STATUS.ACTIVE, index: true },
    moderation: {
      reason: String,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: Date,
    },
  },
  { timestamps: true }
);

tenderSchema.index({ status: 1, deadline: 1 });
tenderSchema.index({ visibility: 1, status: 1, createdAt: -1 });
tenderSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Tender', tenderSchema);
