/**
 * Authentication module — FR-01 (register/login JWT), FR-03 (password reset by one-time code),
 * FR-04 (failed-login logging + temporary lock), OI-02 (access + refresh tokens).
 */
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { User, LoginAttempt, PasswordReset, RefreshToken } = require('../models');
const { ACCOUNT_STATUS, NOTIFICATION_TYPES, ROLES, VERIFICATION_STATUS } = require('../config/constants');
const mail = require('./mail.service');
const notifications = require('./notification.service');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
// Used to equalise response time when the email does not exist (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
const GENERIC_LOGIN_ERROR = 'البريد الإلكتروني أو كلمة المرور غير صحيحة'; // deliberately generic (SRS 3-1, TC-14)

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, typ: 'access' }, env.jwt.accessSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwt.accessTtl,
  });
}

async function issueTokens(user, userAgent) {
  const accessToken = signAccessToken(user);
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + env.jwt.refreshTtlDays * 86400000);
  await RefreshToken.create({ user: user._id, tokenHash: sha256(refreshToken), expiresAt, userAgent });
  const decoded = jwt.decode(accessToken);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: decoded.exp - decoded.iat, // seconds
    refreshExpiresAt: expiresAt.toISOString(),
  };
}

async function register(data, userAgent) {
  const exists = await User.exists({ email: data.email.toLowerCase() });
  if (exists) throw ApiError.conflict('EMAIL_TAKEN', 'البريد الإلكتروني مستخدم مسبقاً', { field: 'email' });
  if (data.role === ROLES.CONTRACTOR && !data.companyName) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'اسم الشركة / المكتب الهندسي مطلوب للمتعهد', { fields: [{ field: 'companyName' }] });
  }
  const passwordHash = await bcrypt.hash(data.password, env.bcryptRounds);
  const user = await User.create({
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    whatsapp: data.whatsapp || data.phone,
    city: data.city,
    companyName: data.companyName,
    role: data.role,
    // privileged roles start pending — only an admin can activate them from the dashboard
    status: env.approvalRoles.includes(data.role) ? ACCOUNT_STATUS.PENDING : ACCOUNT_STATUS.ACTIVE,
    passwordHash,
    verificationStatus: VERIFICATION_STATUS.NONE,
  });
  const tokens = await issueTokens(user, userAgent);
  return { user, tokens };
}

async function login({ email, password }, { ip, userAgent }) {
  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select('+passwordHash +failedLoginCount +lockUntil');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    await LoginAttempt.create({ email: normalized, success: false, reason: 'bad_credentials', ip, userAgent });
    throw ApiError.unauthorized('INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    await LoginAttempt.create({ email: normalized, user: user._id, success: false, reason: 'locked', ip, userAgent });
    const retryAfterSeconds = Math.ceil((user.lockUntil - Date.now()) / 1000);
    throw ApiError.locked('ACCOUNT_LOCKED', `تم حظر الحساب مؤقتاً بسبب تكرار محاولات الدخول الفاشلة. حاول بعد ${Math.ceil(retryAfterSeconds / 60)} دقيقة`, {
      retryAfterSeconds,
    });
  }

  const okPwd = await bcrypt.compare(password, user.passwordHash);
  if (!okPwd) {
    await LoginAttempt.create({ email: normalized, user: user._id, success: false, reason: 'bad_credentials', ip, userAgent });
    const failed = (user.failedLoginCount || 0) + 1;
    const update = { failedLoginCount: failed };
    if (failed >= env.login.maxFailedAttempts) {
      update.lockUntil = new Date(Date.now() + env.login.lockMinutes * 60000);
      update.failedLoginCount = 0;
      await User.updateOne({ _id: user._id }, update);
      await notifications.notify(user._id, {
        type: NOTIFICATION_TYPES.ACCOUNT_LOCKED,
        title: 'تم حظر حسابك مؤقتاً',
        body: `رُصدت ${failed} محاولات دخول فاشلة متتالية، فحُظر الحساب لمدة ${env.login.lockMinutes} دقيقة. إن لم تكن أنت، فننصح بإعادة تعيين كلمة المرور.`,
      });
      mail
        .send({
          to: user.email,
          subject: 'عقاركم — تنبيه أمني: حظر مؤقت للحساب',
          text: `رُصدت محاولات دخول فاشلة متكررة إلى حسابك، فحُظر مؤقتاً لمدة ${env.login.lockMinutes} دقيقة.`,
        })
        .catch(() => {});
      throw ApiError.locked('ACCOUNT_LOCKED', `تم حظر الحساب مؤقتاً بسبب تكرار محاولات الدخول الفاشلة. حاول بعد ${env.login.lockMinutes} دقيقة`, {
        retryAfterSeconds: env.login.lockMinutes * 60,
      });
    }
    await User.updateOne({ _id: user._id }, update);
    throw ApiError.unauthorized('INVALID_CREDENTIALS', GENERIC_LOGIN_ERROR);
  }

  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    await LoginAttempt.create({ email: normalized, user: user._id, success: false, reason: 'suspended', ip, userAgent });
    throw ApiError.forbidden('ACCOUNT_SUSPENDED', 'تم إيقاف هذا الحساب من قبل إدارة المنصة');
  }
  if (user.status === ACCOUNT_STATUS.REJECTED) {
    await LoginAttempt.create({ email: normalized, user: user._id, success: false, reason: 'rejected', ip, userAgent });
    const reason = user.statusReview && user.statusReview.reason;
    throw ApiError.forbidden('ACCOUNT_REJECTED', `تم رفض طلب تفعيل هذا الحساب${reason ? ': ' + reason : ''}`);
  }
  // a PENDING account may log in (the app shows a "waiting for approval" screen) but has no privileges

  await User.updateOne({ _id: user._id }, { failedLoginCount: 0, $unset: { lockUntil: 1 }, lastLoginAt: new Date() });
  await LoginAttempt.create({ email: normalized, user: user._id, success: true, ip, userAgent });
  const fresh = await User.findById(user._id);
  const tokens = await issueTokens(fresh, userAgent);
  return { user: fresh, tokens };
}

/** Refresh-token rotation: each refresh token is single-use. */
async function refresh(refreshToken, userAgent) {
  const rec = await RefreshToken.findOne({ tokenHash: sha256(refreshToken) });
  if (!rec || rec.revokedAt || rec.expiresAt < new Date()) {
    throw ApiError.unauthorized('REFRESH_INVALID', 'انتهت الجلسة، يرجى تسجيل الدخول من جديد');
  }
  const user = await User.findById(rec.user);
  if (!user || [ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.REJECTED].includes(user.status)) throw ApiError.unauthorized('REFRESH_INVALID', 'انتهت الجلسة، يرجى تسجيل الدخول من جديد');
  rec.revokedAt = new Date();
  await rec.save();
  return { user, tokens: await issueTokens(user, userAgent) };
}

async function logout(refreshToken) {
  if (!refreshToken) return;
  await RefreshToken.updateOne({ tokenHash: sha256(refreshToken), revokedAt: { $exists: false } }, { revokedAt: new Date() });
}

/** FR-03 step 1 — always answers the same way whether or not the email exists. */
async function forgotPassword(email) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) return;
  await PasswordReset.updateMany({ user: user._id, usedAt: { $exists: false } }, { usedAt: new Date() }); // invalidate older codes
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await PasswordReset.create({
    user: user._id,
    codeHash: sha256(`${user.id}:${code}`),
    expiresAt: new Date(Date.now() + env.passwordReset.codeTtlMinutes * 60000),
  });
  await mail.sendPasswordResetCode(user.email, user.fullName, code, env.passwordReset.codeTtlMinutes);
}

/** FR-03 step 2 — verify the one-time code and set the new password. */
async function resetPassword({ email, code, newPassword }) {
  const invalid = ApiError.badRequest('RESET_CODE_INVALID', 'رمز التحقق غير صالح أو منتهي الصلاحية', { field: 'code' });
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw invalid;
  const rec = await PasswordReset.findOne({ user: user._id, usedAt: { $exists: false } }).sort({ createdAt: -1 });
  if (!rec || rec.expiresAt < new Date() || rec.attempts >= env.passwordReset.maxAttempts) throw invalid;
  if (rec.codeHash !== sha256(`${user.id}:${code}`)) {
    rec.attempts += 1;
    await rec.save();
    throw invalid;
  }
  rec.usedAt = new Date();
  await rec.save();
  const passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await User.updateOne({ _id: user._id }, { passwordHash, failedLoginCount: 0, $unset: { lockUntil: 1 } });
  await RefreshToken.updateMany({ user: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة', { field: 'currentPassword' });
  }
  user.passwordHash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}

async function updateProfile(userId, patch) {
  await User.updateOne({ _id: userId }, patch, { runValidators: true });
  return User.findById(userId);
}

module.exports = { register, login, refresh, logout, forgotPassword, resetPassword, changePassword, updateProfile, issueTokens };
