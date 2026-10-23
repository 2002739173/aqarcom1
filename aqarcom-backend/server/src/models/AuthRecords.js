/** Authentication-related collections: login attempts (FR-04), password resets (FR-03), refresh tokens (OI-02). */
const mongoose = require('mongoose');
const { toJSONPlugin } = require('./plugins');

const loginAttemptSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true, trim: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    success: { type: Boolean, required: true },
    reason: { type: String }, // bad_credentials | locked | suspended
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
loginAttemptSchema.index({ user: 1, createdAt: -1 });
loginAttemptSchema.plugin(toJSONPlugin);

const passwordResetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    codeHash: { type: String, required: true }, // the one-time code is hashed, never stored in clear
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);
passwordResetSchema.plugin(toJSONPlugin, { hidden: ['codeHash'] });

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: String,
  },
  { timestamps: true }
);
refreshTokenSchema.plugin(toJSONPlugin, { hidden: ['tokenHash'] });

module.exports = {
  LoginAttempt: mongoose.model('LoginAttempt', loginAttemptSchema),
  PasswordReset: mongoose.model('PasswordReset', passwordResetSchema),
  RefreshToken: mongoose.model('RefreshToken', refreshTokenSchema),
};
