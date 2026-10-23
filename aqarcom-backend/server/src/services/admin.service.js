/**
 * Platform administration — FR-27 (hide / delete with reason, notify owner, excluded from search — BR-06, BR-20)
 * and FR-28 (aggregate indicators only, no personal data).
 */
const ApiError = require('../utils/ApiError');
const { User, Property, Tender, Bid, EvaluationResult, ModerationLog, VerificationRequest, LoginAttempt, RefreshToken } = require('../models');
const { CONTENT_STATUS, NOTIFICATION_TYPES, ROLES, ACCOUNT_STATUS, REGISTRABLE_ROLES } = require('../config/constants');
const notifications = require('./notification.service');

const ACTION_TO_STATUS = { hide: CONTENT_STATUS.HIDDEN, delete: CONTENT_STATUS.DELETED, restore: CONTENT_STATUS.ACTIVE };
const ACTION_TEXT = { hide: 'إخفاء', delete: 'حذف', restore: 'استعادة' };
const ACTION_NOTIFY = {
  hide: NOTIFICATION_TYPES.CONTENT_HIDDEN,
  delete: NOTIFICATION_TYPES.CONTENT_DELETED,
  restore: NOTIFICATION_TYPES.CONTENT_RESTORED,
};

async function moderate(targetType, id, admin, { action, reason }) {
  if (!ACTION_TO_STATUS[action]) throw ApiError.badRequest('INVALID_ACTION', 'إجراء غير صالح', { field: 'action' });
  if (!reason || !reason.trim()) throw ApiError.badRequest('REASON_REQUIRED', 'سبب الإجراء إلزامي', { field: 'reason' });

  const Model = targetType === 'property' ? Property : Tender;
  const statusField = targetType === 'property' ? 'status' : 'visibility';
  const doc = await Model.findById(id);
  if (!doc) throw ApiError.notFound('NOT_FOUND', 'العنصر غير موجود');

  doc[statusField] = ACTION_TO_STATUS[action]; // soft change only — record kept (BR-20)
  doc.moderation = { reason: reason.trim(), by: admin._id, at: new Date() };
  if (targetType === 'property' && action === 'delete') {
    doc.deletedAt = new Date();
    doc.deletedBy = admin._id;
  }
  await doc.save();
  await ModerationLog.create({ admin: admin._id, targetType, targetId: doc._id, action, reason: reason.trim() });

  const label = targetType === 'property' ? 'إعلانك' : 'مناقصتك';
  await notifications.notify(doc.owner, {
    type: ACTION_NOTIFY[action],
    title: `تم ${ACTION_TEXT[action]} ${label} من قبل الإدارة`,
    body: `«${doc.title}» — السبب: ${reason.trim()}`,
    data: { targetType, targetId: String(doc._id), reason: reason.trim() },
  });
  return doc;
}

/** FR-27 review queue — newest listings & tenders. */
async function reviewQueue({ type = 'property', status, tenderStatus }, { skip, limit }) {
  if (type === 'tender') {
    const f = {};
    if (status) f.visibility = status;
    if (tenderStatus) f.status = tenderStatus;
    const [items, total] = await Promise.all([
      Tender.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName email'),
      Tender.countDocuments(f),
    ]);
    return { items, total };
  }
  const f = {};
  if (status) f.status = status;
  const [items, total] = await Promise.all([
    Property.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName email'),
    Property.countDocuments(f),
  ]);
  return { items, total };
}

async function moderationHistory(targetType, id) {
  return ModerationLog.find({ targetType, targetId: id }).sort({ createdAt: -1 }).populate('admin', 'fullName');
}

async function listUsers({ role, status, q, verificationStatus }, { skip, limit }) {
  const f = {};
  if (verificationStatus) f.verificationStatus = verificationStatus;
  if (role) f.role = role;
  if (status) f.status = status;
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ fullName: rx }, { email: rx }, { companyName: rx }];
  }
  const [items, total] = await Promise.all([User.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments(f)]);
  return { items, total };
}

// ---------------- Account management (dashboard only) ----------------

const ROLE_AR = {
  user: 'مستخدم فردي',
  property_owner: 'مالك عقار',
  project_owner: 'صاحب مشروع',
  contractor: 'متعهد / شركة هندسية',
  admin: 'مدير النظام',
};

/**
 * Allowed transitions — the ONLY way an account gains or loses privileges.
 *   approve    : pending | rejected            → active
 *   reject     : pending                       → rejected   (reason required)
 *   suspend    : active | pending              → suspended  (reason required)
 *   reactivate : suspended                     → active
 */
const TRANSITIONS = {
  approve: { from: [ACCOUNT_STATUS.PENDING, ACCOUNT_STATUS.REJECTED], to: ACCOUNT_STATUS.ACTIVE, log: 'approve', reasonRequired: false },
  reject: { from: [ACCOUNT_STATUS.PENDING], to: ACCOUNT_STATUS.REJECTED, log: 'reject', reasonRequired: true },
  suspend: { from: [ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.PENDING], to: ACCOUNT_STATUS.SUSPENDED, log: 'suspend', reasonRequired: true },
  reactivate: { from: [ACCOUNT_STATUS.SUSPENDED], to: ACCOUNT_STATUS.ACTIVE, log: 'unsuspend', reasonRequired: false },
};

const STATUS_NOTICE = {
  approve: { type: NOTIFICATION_TYPES.ACCOUNT_APPROVED, title: 'تم تفعيل حسابك', body: (r) => `وافقت إدارة عقاركم على حسابك بصفة ${ROLE_AR[r]}. يمكنك الآن استخدام جميع الصلاحيات.` },
  reject: { type: NOTIFICATION_TYPES.ACCOUNT_REJECTED, title: 'تم رفض طلب تفعيل الحساب', body: (r, reason) => `السبب: ${reason}` },
  suspend: { type: NOTIFICATION_TYPES.ACCOUNT_SUSPENDED, title: 'تم إيقاف حسابك', body: (r, reason) => `السبب: ${reason}` },
  reactivate: { type: NOTIFICATION_TYPES.ACCOUNT_REACTIVATED, title: 'تمت إعادة تفعيل حسابك', body: () => 'يمكنك الآن استخدام حسابك من جديد.' },
};

async function changeAccountStatus(id, admin, action, reason) {
  const t = TRANSITIONS[action];
  if (!t) throw ApiError.badRequest('INVALID_ACTION', 'إجراء غير صالح', { field: 'action' });
  const why = (reason || '').trim();
  if (t.reasonRequired && !why) throw ApiError.badRequest('REASON_REQUIRED', 'سبب الإجراء إلزامي', { field: 'reason' });

  const u = await User.findById(id);
  if (!u) throw ApiError.notFound('USER_NOT_FOUND', 'المستخدم غير موجود');
  if (u.role === ROLES.ADMIN) throw ApiError.forbidden('CANNOT_MODERATE_ADMIN', 'لا يمكن تغيير حالة حساب مدير');
  if (!t.from.includes(u.status)) {
    throw ApiError.conflict('INVALID_TRANSITION', `لا يمكن تنفيذ هذا الإجراء على حساب حالته الحالية «${u.status}»`, { currentStatus: u.status });
  }

  const res = await User.updateOne(
    { _id: u._id, status: { $in: t.from } }, // atomic: two admins cannot act on the same account at once
    { status: t.to, statusReview: { by: admin._id, at: new Date(), reason: why || undefined, action } }
  );
  const updated = res.modifiedCount ? await User.findById(u._id) : null;
  if (!updated) throw ApiError.conflict('INVALID_TRANSITION', 'تغيّرت حالة الحساب للتو، حدّث الصفحة');

  if (t.to === ACCOUNT_STATUS.SUSPENDED || t.to === ACCOUNT_STATUS.REJECTED) {
    // force logout on every device
    await RefreshToken.updateMany({ user: u._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  }
  await ModerationLog.create({ admin: admin._id, targetType: 'user', targetId: u._id, action: t.log, reason: why || '—' });
  const n = STATUS_NOTICE[action];
  await notifications.notify(u._id, { type: n.type, title: n.title, body: n.body(u.role, why), data: { accountStatus: t.to } });
  return updated;
}

/** Backwards-compatible endpoint: { suspend: true|false, reason } */
async function setUserStatus(id, admin, { suspend, reason }) {
  return changeAccountStatus(id, admin, suspend ? 'suspend' : 'reactivate', reason);
}

/** Change a user's role (never to/from admin). The account must be re-approved if the new role requires it. */
async function changeRole(id, admin, { role, reason }) {
  if (!REGISTRABLE_ROLES.includes(role)) throw ApiError.badRequest('INVALID_ROLE', 'دور غير صالح', { field: 'role' });
  if (!reason || !reason.trim()) throw ApiError.badRequest('REASON_REQUIRED', 'سبب الإجراء إلزامي', { field: 'reason' });
  const u = await User.findById(id);
  if (!u) throw ApiError.notFound('USER_NOT_FOUND', 'المستخدم غير موجود');
  if (u.role === ROLES.ADMIN) throw ApiError.forbidden('CANNOT_MODERATE_ADMIN', 'لا يمكن تغيير دور مدير');
  if (u.role === role) throw ApiError.badRequest('SAME_ROLE', 'المستخدم يحمل هذا الدور أصلاً', { field: 'role' });
  const patch = { role, statusReview: { by: admin._id, at: new Date(), reason: reason.trim(), action: 'role_change' } };
  if (role !== ROLES.CONTRACTOR) patch.verificationStatus = 'none';
  await User.updateOne({ _id: u._id }, patch);
  const updated = await User.findById(u._id);
  await RefreshToken.updateMany({ user: u._id, revokedAt: { $exists: false } }, { revokedAt: new Date() }); // new token carries new role
  await ModerationLog.create({ admin: admin._id, targetType: 'user', targetId: u._id, action: 'role_change', reason: `${u.role} → ${role}: ${reason.trim()}` });
  await notifications.notify(u._id, {
    type: NOTIFICATION_TYPES.ROLE_CHANGED,
    title: 'تم تغيير صفة حسابك',
    body: `أصبحت صفة حسابك: ${ROLE_AR[role]}. يرجى تسجيل الدخول من جديد.`,
    data: { role },
  });
  return updated;
}

/** Full user profile for the dashboard drawer. */
async function getUserDetails(id) {
  const u = await User.findById(id).populate('statusReview.by', 'fullName');
  if (!u) throw ApiError.notFound('USER_NOT_FOUND', 'المستخدم غير موجود');
  const [properties, tenders, bids, verification, history, loginAttempts] = await Promise.all([
    Property.countDocuments({ owner: u._id, status: { $ne: CONTENT_STATUS.DELETED } }),
    Tender.countDocuments({ owner: u._id }),
    Bid.countDocuments({ contractor: u._id }),
    VerificationRequest.findOne({ contractor: u._id }).sort({ createdAt: -1 }),
    ModerationLog.find({ targetType: 'user', targetId: u._id }).sort({ createdAt: -1 }).limit(20).populate('admin', 'fullName'),
    LoginAttempt.find({ user: u._id }).sort({ createdAt: -1 }).limit(10),
  ]);
  return { user: u, counts: { properties, tenders, bids }, latestVerification: verification, history, loginAttempts };
}

const groupCount = async (Model, field, match = {}) => {
  const rows = await Model.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id === null || r._id === undefined ? 'unknown' : String(r._id), r.n]));
};

/** FR-28 — aggregate counters only. */
async function stats() {
  const since30 = new Date(Date.now() - 30 * 86400000);
  const [
    usersTotal,
    usersByRole,
    contractorsByVerification,
    newUsers30d,
    usersByStatus,
    propertiesTotal,
    propertiesByStatus,
    propertiesByPurpose,
    propertiesByType,
    tendersTotal,
    tendersByStatus,
    tendersByType,
    bidsTotal,
    bidsWithdrawn,
    evaluationsByEngine,
    pendingVerifications,
  ] = await Promise.all([
    User.countDocuments({}),
    groupCount(User, 'role'),
    groupCount(User, 'verificationStatus', { role: ROLES.CONTRACTOR }),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    groupCount(User, 'status'),
    Property.countDocuments({}),
    groupCount(Property, 'status'),
    groupCount(Property, 'purpose', { status: CONTENT_STATUS.ACTIVE }),
    groupCount(Property, 'propertyType', { status: CONTENT_STATUS.ACTIVE }),
    Tender.countDocuments({}),
    groupCount(Tender, 'status'),
    groupCount(Tender, 'tenderType'),
    Bid.countDocuments({}),
    Bid.countDocuments({ isWithdrawn: true }),
    groupCount(Tender, 'evaluation.engine', { 'evaluation.engine': { $exists: true } }),
    VerificationRequest.countDocuments({ status: 'pending' }),
  ]);
  const tendersWithBids = await Bid.distinct('tender', { isWithdrawn: false });
  const shortlistRows = await EvaluationResult.countDocuments({});
  return {
    users: {
      total: usersTotal,
      byRole: usersByRole,
      byStatus: usersByStatus,
      pendingApproval: usersByStatus.pending || 0,
      newLast30Days: newUsers30d,
      contractorsByVerification,
      pendingVerifications,
    },
    properties: { total: propertiesTotal, byStatus: propertiesByStatus, activeByPurpose: propertiesByPurpose, activeByType: propertiesByType },
    tenders: { total: tendersTotal, byStatus: tendersByStatus, byType: tendersByType, evaluationsByEngine },
    bids: {
      total: bidsTotal,
      active: bidsTotal - bidsWithdrawn,
      withdrawn: bidsWithdrawn,
      averageActivePerTender: tendersWithBids.length ? Math.round(((bidsTotal - bidsWithdrawn) / tendersWithBids.length) * 100) / 100 : 0,
      shortlistedRows: shortlistRows,
    },
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { moderate, reviewQueue, moderationHistory, listUsers, setUserStatus, changeAccountStatus, changeRole, getUserDetails, stats };
