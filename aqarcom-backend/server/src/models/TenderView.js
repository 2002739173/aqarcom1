/**
 * Associative entity USER ↔ TENDER (ERD v1.2). Records who viewed a tender or
 * downloaded its specifications book, so they can be notified of new versions (FR-15, TC-12).
 */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const tenderViewSchema = new mongoose.Schema(
  {
    tender: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    firstViewedAt: { type: Date, default: Date.now },
    lastViewedAt: { type: Date, default: Date.now },
    downloadedVersions: { type: [Number], default: [] },
  },
  { timestamps: false }
);
tenderViewSchema.index({ tender: 1, user: 1 }, { unique: true });
tenderViewSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('TenderView', tenderViewSchema);
