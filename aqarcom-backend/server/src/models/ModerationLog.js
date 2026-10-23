/** Audit trail of every admin moderation action (FR-27, BR-20). */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const moderationLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: ['property', 'tender', 'user'], required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['hide', 'delete', 'restore', 'suspend', 'unsuspend', 'approve', 'reject', 'role_change'], required: true },
    reason: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
moderationLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
moderationLogSchema.plugin(toJSONPlugin);

module.exports = mongoose.model('ModerationLog', moderationLogSchema);
