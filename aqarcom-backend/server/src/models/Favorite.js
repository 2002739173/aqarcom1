/** Associative entity USER ↔ PROPERTY (ERD v1.2 — no many-to-many). FR-09 */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const favoriteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
favoriteSchema.index({ user: 1, property: 1 }, { unique: true });
favoriteSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Favorite', favoriteSchema);
