const mongoose = require('mongoose');
const { ROLES, VERIFICATION_STATUS, ACCOUNT_STATUS } = require('../config/constants');
const { toJSONPlugin } = require('./plugins');

const deviceTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    platform: { type: String, default: 'android' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    // NFR-02 / BR-01 — only the bcrypt hash is stored, never returned
    passwordHash: { type: String, required: true, select: false },
    // changeable only by an admin from the dashboard (admin.service.changeRole)
    role: { type: String, enum: Object.values(ROLES), required: true },
    // users.verification_status — "verified" is required to bid (BR-09)
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.NONE,
    },
    companyName: { type: String, trim: true }, // contractors
    city: { type: String, trim: true },
    avatarUrl: { type: String },
    status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.ACTIVE, index: true },
    // last admin decision on the account (approve / reject / suspend / reactivate / role change)
    statusReview: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: Date,
      reason: String,
      action: String,
    },
    // FR-04 — temporary lock after too many failed logins
    failedLoginCount: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
    deviceTokens: { type: [deviceTokenSchema], default: [], select: false },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, verificationStatus: 1 });
userSchema.plugin(toJSONPlugin, { hidden: ['passwordHash', 'failedLoginCount', 'lockUntil', 'deviceTokens'] });

module.exports = mongoose.model('User', userSchema);
