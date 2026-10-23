/**
 * Authentication & RBAC (FR-02, BR-02).
 *  - Missing / invalid / expired JWT  → 401
 *  - Valid token but insufficient role → 403
 */
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { User } = require('../models');
const { ACCOUNT_STATUS, VERIFICATION_STATUS, ROLES } = require('../config/constants');

function extractToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.accessSecret, { algorithms: ['HS256'] });
  } catch (e) {
    if (e.name === 'TokenExpiredError') throw ApiError.unauthorized('TOKEN_EXPIRED', 'انتهت صلاحية الجلسة، يرجى تحديث الرمز أو تسجيل الدخول');
    throw ApiError.unauthorized('TOKEN_INVALID', 'رمز المصادقة غير صالح');
  }
  if (payload.typ !== 'access') throw ApiError.unauthorized('TOKEN_INVALID', 'رمز المصادقة غير صالح');
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('TOKEN_INVALID', 'رمز المصادقة غير صالح');
  if (user.status === ACCOUNT_STATUS.SUSPENDED) throw ApiError.forbidden('ACCOUNT_SUSPENDED', 'تم إيقاف هذا الحساب من قبل إدارة المنصة');
  if (user.status === ACCOUNT_STATUS.REJECTED) throw ApiError.forbidden('ACCOUNT_REJECTED', 'تم رفض طلب تفعيل هذا الحساب من قبل إدارة المنصة');
  return user;
}

/** Requires a valid access token. */
const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) throw ApiError.unauthorized('TOKEN_MISSING', 'يجب تسجيل الدخول');
    req.user = await resolveUser(token);
    next();
  } catch (e) {
    next(e);
  }
};

/** Attaches req.user when a valid token is present; otherwise continues as a visitor. */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch (_) {
    req.user = undefined;
  }
  next();
};

const pendingError = () =>
  new ApiError(403, 'ACCOUNT_PENDING_APPROVAL', 'حسابك بانتظار موافقة إدارة المنصة؛ ستصلك رسالة فور تفعيله', {
    accountStatus: ACCOUNT_STATUS.PENDING,
  });

/**
 * Role gate — 403 when the role is not in the list, and 403 ACCOUNT_PENDING_APPROVAL while the
 * account has not been approved from the admin dashboard (privileges are granted only there).
 */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    if (req.user.status !== ACCOUNT_STATUS.ACTIVE) return next(pendingError());
    next();
  };

/** Same as authorize() but lets a pending account through (e.g. contractor uploading documents for review). */
const authorizeAllowPending =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

/** BR-09 / FR-23 — contractor must be verified before bidding. */
const requireVerifiedContractor = (req, res, next) => {
  if (!req.user || req.user.role !== ROLES.CONTRACTOR) return next(ApiError.forbidden());
  if (req.user.verificationStatus !== VERIFICATION_STATUS.VERIFIED) {
    return next(
      new ApiError(403, 'CONTRACTOR_NOT_VERIFIED', 'لا يمكنك تقديم عروض قبل اعتماد توثيق حسابك', {
        verificationStatus: req.user.verificationStatus,
        redirect: 'verification',
      })
    );
  }
  next();
};

module.exports = { authenticate, optionalAuth, authorize, authorizeAllowPending, requireVerifiedContractor };
