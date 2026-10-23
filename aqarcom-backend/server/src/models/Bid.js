/** Associative entity CONTRACTOR ↔ TENDER (ERD v1.2). FR-12, FR-16 */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const bidSchema = new mongoose.Schema(
  {
    tender: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true },
    contractor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // bids.total_price / bids.duration_days — both strictly positive (SRS 6-2)
    totalPrice: { type: Number, required: true, min: 0.01 },
    durationDays: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'مدة التنفيذ يجب أن تكون عدداً صحيحاً من الأيام' },
    },
    notes: { type: String, maxlength: 3000 },
    // server timestamp of (last) submission — used for tie-breaking (BR-19)
    submittedAt: { type: Date, required: true },
    // bids.is_withdrawn — withdrawn bids stay stored and are excluded from scoring (BR-15)
    isWithdrawn: { type: Boolean, default: false },
    withdrawnAt: Date,
    outcome: { type: String, enum: ['pending', 'won', 'lost'], default: 'pending' },
    history: [
      {
        _id: false,
        totalPrice: Number,
        durationDays: Number,
        at: Date,
      },
    ],
  },
  { timestamps: true }
);
bidSchema.index({ tender: 1, contractor: 1, isWithdrawn: 1 });
bidSchema.index({ tender: 1, isWithdrawn: 1 });
bidSchema.index({ contractor: 1, createdAt: -1 });
bidSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Bid', bidSchema);
