/** Specifications book (دفتر الشروط) — one row per version; versions are never deleted (BR-14). */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const tenderDocumentSchema = new mongoose.Schema(
  {
    tender: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    version: { type: Number, required: true, min: 1 },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    sizeMb: { type: Number, required: true, max: 20 },
    storageKey: { type: String, required: true, select: false },
    sha256: { type: String },
    note: { type: String, maxlength: 2000 }, // clarification text for this version (FR-15)
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
tenderDocumentSchema.index({ tender: 1, version: 1 }, { unique: true });
tenderDocumentSchema.plugin(toJSONPlugin, { hidden: ['storageKey'] });

module.exports = mongoose.model('TenderDocument', tenderDocumentSchema);
