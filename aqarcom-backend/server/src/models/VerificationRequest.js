/** Engineering verification request (FR-22 → FR-24). Files are stored encrypted. */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const verificationDocSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: ['engineers_syndicate', 'commercial_register', 'other'],
      required: true,
    },
    originalName: String,
    mimeType: String,
    sizeBytes: Number,
    storageKey: { type: String, required: true },
    sha256: String,
  },
  { _id: true }
);

const verificationRequestSchema = new mongoose.Schema(
  {
    contractor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    documents: { type: [verificationDocSchema], validate: (v) => v.length > 0 },
    notes: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    // SRS 6-3 — reviewer id and review date stored with every decision
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: Date,
    rejectionReason: String,
  },
  { timestamps: true }
);
verificationRequestSchema.plugin(toJSONPlugin);
verificationRequestSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    (ret.documents || []).forEach((d) => {
      d.id = d._id ? d._id.toString() : d.id;
      delete d._id;
      delete d.storageKey;
    });
    return ret;
  },
});

module.exports = mongoose.model('VerificationRequest', verificationRequestSchema);
