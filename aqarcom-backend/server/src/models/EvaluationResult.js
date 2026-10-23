/** Shortlist rows produced by the scoring engine (FR-17 → FR-19). Kept forever with the engine name (BR-17). */
const mongoose = require('mongoose');
const { EVALUATION_ENGINE } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const evaluationResultSchema = new mongoose.Schema(
  {
    tender: { type: mongoose.Schema.Types.ObjectId, ref: 'Tender', required: true, index: true },
    bid: { type: mongoose.Schema.Types.ObjectId, ref: 'Bid', required: true },
    contractor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rank: { type: Number, required: true, min: 1, max: 5 }, // evaluation_results.rank
    score: { type: Number, required: true },
    normalizedPrice: Number, // r_p(i) = min(p) / p(i)
    normalizedDuration: Number, // r_d(i) = min(d) / d(i)
    totalPrice: Number,
    durationDays: Number,
    weights: { price: Number, duration: Number },
    engine: { type: String, enum: Object.values(EVALUATION_ENGINE), required: true },
    evaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
evaluationResultSchema.index({ tender: 1, rank: 1 }, { unique: true });
evaluationResultSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('EvaluationResult', evaluationResultSchema);
