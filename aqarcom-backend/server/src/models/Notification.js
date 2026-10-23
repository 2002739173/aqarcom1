/** In-app notification store — the source of truth even when push delivery fails (SRS 2-1). */
const mongoose = require('mongoose');
const { NOTIFICATION_TYPES } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    readAt: Date,
    pushSent: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('Notification', notificationSchema);
