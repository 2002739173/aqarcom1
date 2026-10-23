/**
 * Tender module — FR-10 (create + weights), FR-11 (spec book ≤ 20 MB, PDF/Word), FR-14 (one extension),
 * FR-15 (versioned spec book + notify), lifecycle (draft → open → evaluating → shortlist_ready → awarded,
 * plus closed_no_bids and cancelled).
 */
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const fileStore = require('../utils/fileStore');
const { Tender, TenderDocument, TenderView, Bid } = require('../models');
const { ROLES, TENDER_STATUS, CONTENT_STATUS, NOTIFICATION_TYPES, ALLOWED_DOC_MIME } = require('../config/constants');
const notifications = require('./notification.service');

const MB = 1024 * 1024;
const now = () => new Date(); // the server clock is the only authority (BR-11 / CN-06)

const isOwner = (t, user) => user && String(t.owner._id || t.owner) === String(user._id);
const isAdmin = (user) => user && user.role === ROLES.ADMIN;

function present(t, { viewer, myBid, currentDocument } = {}) {
  const o = t.toJSON();
  const ownerDoc = t.owner && t.owner.fullName ? t.owner : null;
  o.owner = ownerDoc ? { id: String(ownerDoc._id), fullName: ownerDoc.fullName, companyName: ownerDoc.companyName } : { id: String(t.owner) };
  if (o.location && o.location.coordinates && o.location.coordinates.length === 2) {
    o.latitude = o.location.coordinates[1];
    o.longitude = o.location.coordinates[0];
  }
  const serverTime = now();
  o.serverTime = serverTime.toISOString();
  o.secondsRemaining = t.status === TENDER_STATUS.OPEN ? Math.max(0, Math.floor((t.deadline - serverTime) / 1000)) : 0;
  o.isMine = isOwner(t, viewer);
  if (!(o.isMine || isAdmin(viewer))) {
    // BR-12: contractors never learn about competitors' bids
    delete o.activeBidsCount;
    delete o.moderation;
    delete o.frozenWeights;
  }
  if (viewer && viewer.role === ROLES.CONTRACTOR) {
    o.myBid = myBid ? myBid.toJSON() : null;
    o.canBid = t.status === TENDER_STATUS.OPEN && t.deadline > serverTime && !myBid;
  }
  if (currentDocument !== undefined) o.currentDocument = currentDocument ? currentDocument.toJSON() : null;
  return o;
}

function assertWeights(priceWeight, durationWeight) {
  // BR-07 — exactly 100, integers
  if (!Number.isInteger(priceWeight) || !Number.isInteger(durationWeight) || priceWeight + durationWeight !== 100) {
    throw ApiError.badRequest('WEIGHTS_INVALID', 'مجموع وزن السعر ووزن المدة يجب أن يساوي 100% تماماً', {
      fields: [{ field: 'priceWeight' }, { field: 'durationWeight' }],
      suggestion: Number.isInteger(priceWeight) && priceWeight >= 0 && priceWeight <= 100 ? { priceWeight, durationWeight: 100 - priceWeight } : undefined,
    });
  }
}

function assertFutureDeadline(deadline) {
  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime()) || deadline <= now()) {
    throw ApiError.badRequest('DEADLINE_INVALID', 'موعد الإغلاق يجب أن يكون لاحقاً للحظة النشر', { field: 'deadline' });
  }
}

async function loadOwned(id, user) {
  const t = await Tender.findById(id);
  if (!t || t.visibility === CONTENT_STATUS.DELETED) throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  if (!isOwner(t, user)) throw ApiError.forbidden('NOT_TENDER_OWNER', 'هذه المناقصة ليست لك');
  return t;
}

async function create(user, data) {
  assertWeights(data.priceWeight, data.durationWeight);
  const deadline = new Date(data.deadline);
  assertFutureDeadline(deadline);
  const { latitude, longitude, ...rest } = data;
  const doc = { ...rest, deadline, originalDeadline: deadline, owner: user._id, status: TENDER_STATUS.DRAFT };
  if (latitude !== undefined && longitude !== undefined) doc.location = { type: 'Point', coordinates: [longitude, latitude] };
  return Tender.create(doc);
}

async function update(id, user, data) {
  const t = await loadOwned(id, user);
  if (![TENDER_STATUS.DRAFT, TENDER_STATUS.OPEN].includes(t.status)) {
    throw ApiError.conflict('TENDER_LOCKED', 'لا يمكن تعديل المناقصة في حالتها الحالية');
  }
  const { latitude, longitude, deadline, priceWeight, durationWeight, ...rest } = data;

  if (priceWeight !== undefined || durationWeight !== undefined) {
    const pw = priceWeight ?? t.priceWeight;
    const dw = durationWeight ?? t.durationWeight;
    assertWeights(pw, dw);
    // BR-08: weights cannot change retroactively once bids exist
    if (t.status === TENDER_STATUS.OPEN && (await Bid.exists({ tender: t._id, isWithdrawn: false }))) {
      throw ApiError.conflict('WEIGHTS_FROZEN', 'لا يمكن تعديل الأوزان بعد ورود عروض على المناقصة');
    }
    t.priceWeight = pw;
    t.durationWeight = dw;
  }
  if (deadline !== undefined) {
    if (t.status !== TENDER_STATUS.DRAFT) throw ApiError.conflict('USE_EXTEND', 'لتغيير موعد الإغلاق بعد النشر استخدم التمديد');
    const d = new Date(deadline);
    assertFutureDeadline(d);
    t.deadline = d;
    t.originalDeadline = d;
  }
  if (t.status === TENDER_STATUS.OPEN && rest.tenderType && rest.tenderType !== t.tenderType) {
    throw ApiError.conflict('TENDER_LOCKED', 'لا يمكن تغيير نوع المناقصة بعد نشرها');
  }
  Object.assign(t, rest);
  if (latitude !== undefined && longitude !== undefined) t.location = { type: 'Point', coordinates: [longitude, latitude] };
  await t.save();
  return t;
}

async function publish(id, user) {
  const t = await loadOwned(id, user);
  if (t.status !== TENDER_STATUS.DRAFT) throw ApiError.conflict('INVALID_STATE', 'يمكن نشر المسودات فقط');
  if (t.visibility !== CONTENT_STATUS.ACTIVE) throw ApiError.conflict('TENDER_HIDDEN', 'المناقصة محجوبة من قبل الإدارة');
  assertWeights(t.priceWeight, t.durationWeight);
  assertFutureDeadline(t.deadline);
  if (t.currentDocumentVersion < 1) {
    throw ApiError.badRequest('DOCUMENT_REQUIRED', 'يجب رفع دفتر الشروط قبل نشر المناقصة', { field: 'file' });
  }
  t.status = TENDER_STATUS.OPEN;
  t.publishedAt = now();
  t.originalDeadline = t.deadline;
  await t.save();
  return t;
}

async function interestedUserIds(tenderId, excludeId) {
  const [views, bids] = await Promise.all([TenderView.find({ tender: tenderId }).select('user'), Bid.find({ tender: tenderId }).select('contractor')]);
  const ids = new Set([...views.map((v) => String(v.user)), ...bids.map((b) => String(b.contractor))]);
  if (excludeId) ids.delete(String(excludeId));
  return [...ids];
}

/** FR-14 / BR-13 — single extension, only later than the current deadline, only before it passes. */
async function extend(id, user, newDeadlineRaw) {
  const t = await loadOwned(id, user);
  const newDeadline = new Date(newDeadlineRaw);
  if (t.status !== TENDER_STATUS.OPEN || t.deadline <= now()) throw ApiError.conflict('TENDER_NOT_OPEN', 'لا يمكن التمديد إلا لمناقصة مفتوحة قبل موعد إغلاقها');
  if (t.extensionUsed) throw ApiError.conflict('EXTENSION_ALREADY_USED', 'صلاحية التمديد تُمنح مرة واحدة فقط لكل مناقصة وقد استُخدمت');
  if (Number.isNaN(newDeadline.getTime()) || newDeadline <= t.deadline) {
    throw ApiError.badRequest('EXTENSION_INVALID', 'الموعد الجديد يجب أن يكون لاحقاً لموعد الإغلاق الحالي؛ لا يُسمح بتقصير المدة', { field: 'deadline' });
  }
  // atomic guard against double extension
  const updated = await Tender.findOneAndUpdate(
    { _id: t._id, extensionUsed: false, status: TENDER_STATUS.OPEN },
    { deadline: newDeadline, extensionUsed: true, extendedAt: now() },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('EXTENSION_ALREADY_USED', 'صلاحية التمديد تُمنح مرة واحدة فقط لكل مناقصة وقد استُخدمت');
  const ids = await interestedUserIds(t._id, user._id);
  await notifications.notifyMany(ids, {
    type: NOTIFICATION_TYPES.TENDER_EXTENDED,
    title: 'تمديد موعد إغلاق مناقصة',
    body: `تم تمديد موعد إغلاق مناقصة «${t.title}» حتى ${newDeadline.toISOString()}`,
    data: { tenderId: String(t._id), deadline: newDeadline.toISOString() },
  });
  return updated;
}

async function cancel(id, user, reason) {
  const t = await loadOwned(id, user);
  const cancellable = [TENDER_STATUS.DRAFT, TENDER_STATUS.OPEN, TENDER_STATUS.SHORTLIST_READY];
  const updated = await Tender.findOneAndUpdate(
    { _id: t._id, status: { $in: cancellable } },
    { status: TENDER_STATUS.CANCELLED, cancelledAt: now(), cancelReason: reason },
    { new: true }
  );
  if (!updated) throw ApiError.conflict('TENDER_LOCKED', 'لا يمكن إلغاء المناقصة في حالتها الحالية');
  const bidders = await Bid.find({ tender: t._id, isWithdrawn: false }).distinct('contractor');
  await notifications.notifyMany(bidders, {
    type: NOTIFICATION_TYPES.TENDER_CANCELLED,
    title: 'إلغاء مناقصة',
    body: `أُلغيت مناقصة «${t.title}» من قبل صاحب المشروع${reason ? ': ' + reason : ''}`,
    data: { tenderId: String(t._id) },
  });
  return updated;
}

// ---------- Specification book (FR-11, FR-15) ----------
async function addDocument(id, user, { buffer, originalName, note }) {
  const t = await loadOwned(id, user);
  if (![TENDER_STATUS.DRAFT, TENDER_STATUS.OPEN].includes(t.status)) {
    throw ApiError.conflict('TENDER_LOCKED', 'لا يمكن تعديل دفتر الشروط بعد إغلاق المناقصة');
  }
  if (t.status === TENDER_STATUS.OPEN && t.deadline <= now()) throw ApiError.conflict('TENDER_CLOSED', 'انتهى موعد إغلاق المناقصة');
  if (!buffer || buffer.length === 0) throw ApiError.badRequest('NO_FILE', 'لم يتم إرفاق دفتر الشروط', { field: 'file' });
  if (buffer.length > env.tenderDocMaxMb * MB) {
    throw ApiError.tooLarge('FILE_TOO_LARGE', `حجم الملف يتجاوز الحد الأقصى المسموح (${env.tenderDocMaxMb} ميغابايت). الصيغ المقبولة: PDF, Word`, { maxMb: env.tenderDocMaxMb });
  }
  const realType = fileStore.sniffType(buffer);
  if (!ALLOWED_DOC_MIME[realType]) {
    throw ApiError.unsupported('UNSUPPORTED_FILE_TYPE', 'صيغة الملف غير مقبولة. الصيغ المقبولة: PDF, Word', { field: 'file', allowed: ['pdf', 'doc', 'docx'] });
  }

  const { storageKey, sha256 } = await fileStore.saveEncrypted(fileStore.SUBDIRS.tenderDocs, buffer);
  // atomic version bump — previous versions are kept (BR-14)
  const bumped = await Tender.findOneAndUpdate({ _id: t._id }, { $inc: { currentDocumentVersion: 1 } }, { new: true });
  const doc = await TenderDocument.create({
    tender: t._id,
    version: bumped.currentDocumentVersion,
    originalName,
    mimeType: realType,
    sizeBytes: buffer.length,
    sizeMb: Math.round((buffer.length / MB) * 100) / 100,
    storageKey,
    sha256,
    note,
    uploadedBy: user._id,
  });

  if (doc.version > 1 && bumped.status === TENDER_STATUS.OPEN) {
    // TC-12 — notify everyone who viewed / downloaded / bid
    const ids = await interestedUserIds(t._id, user._id);
    await notifications.notifyMany(ids, {
      type: NOTIFICATION_TYPES.TENDER_DOCUMENT_UPDATED,
      title: 'إصدار جديد من دفتر الشروط',
      body: `صدر الإصدار رقم ${doc.version} من دفتر شروط مناقصة «${t.title}»${note ? ': ' + note : ''}`,
      data: { tenderId: String(t._id), version: doc.version },
    });
  }
  return doc;
}

async function listDocuments(id, viewer) {
  const t = await getVisibleTender(id, viewer);
  return TenderDocument.find({ tender: t._id }).sort({ version: -1 });
}

async function downloadDocument(id, version, viewer) {
  const t = await getVisibleTender(id, viewer);
  const q = { tender: t._id };
  if (version) q.version = version;
  const doc = await TenderDocument.findOne(q).sort({ version: -1 }).select('+storageKey');
  if (!doc) throw ApiError.notFound('DOCUMENT_NOT_FOUND', 'دفتر الشروط غير موجود');
  const buffer = await fileStore.readDecrypted(doc.storageKey);
  if (viewer.role === ROLES.CONTRACTOR) {
    await TenderView.updateOne(
      { tender: t._id, user: viewer._id },
      { $setOnInsert: { firstViewedAt: now() }, $set: { lastViewedAt: now() }, $addToSet: { downloadedVersions: doc.version } },
      { upsert: true }
    );
  }
  return { doc, buffer };
}

// ---------- Reading ----------
/** Returns a tender the viewer may see, or throws 404. Drafts & moderated tenders only for owner/admin. */
async function getVisibleTender(id, viewer) {
  const t = await Tender.findById(id).populate('owner', 'fullName companyName');
  if (!t) throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  const privileged = isOwner(t, viewer) || isAdmin(viewer);
  if (!privileged && (t.status === TENDER_STATUS.DRAFT || t.visibility !== CONTENT_STATUS.ACTIVE)) {
    throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  }
  return t;
}

async function getById(id, viewer) {
  // lazy close: if the deadline already passed, close it now rather than waiting for the cron tick
  const lifecycle = require('./lifecycle.service'); // eslint-disable-line global-require
  await lifecycle.closeIfDue(id);
  const t = await getVisibleTender(id, viewer);
  let myBid = null;
  if (viewer.role === ROLES.CONTRACTOR) {
    myBid = await Bid.findOne({ tender: t._id, contractor: viewer._id, isWithdrawn: false });
    await TenderView.updateOne(
      { tender: t._id, user: viewer._id },
      { $setOnInsert: { firstViewedAt: now() }, $set: { lastViewedAt: now() } },
      { upsert: true }
    );
  }
  const currentDocument = await TenderDocument.findOne({ tender: t._id }).sort({ version: -1 });
  return present(t, { viewer, myBid, currentDocument });
}

const PUBLIC_STATUSES = [TENDER_STATUS.OPEN, TENDER_STATUS.SHORTLIST_READY, TENDER_STATUS.AWARDED, TENDER_STATUS.CLOSED_NO_BIDS, TENDER_STATUS.EVALUATING];

async function list(q, { skip, limit }, viewer) {
  const f = { visibility: CONTENT_STATUS.ACTIVE };
  f.status = q.status && PUBLIC_STATUSES.includes(q.status) ? q.status : TENDER_STATUS.OPEN;
  if (q.tenderType) f.tenderType = q.tenderType;
  if (q.city) f.city = q.city;
  if (q.q) {
    const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ title: rx }, { description: rx }];
  }
  const sort = q.sort === 'deadline' ? { deadline: 1 } : { publishedAt: -1, createdAt: -1 };
  const [items, total] = await Promise.all([
    Tender.find(f).sort(sort).skip(skip).limit(limit).populate('owner', 'fullName companyName'),
    Tender.countDocuments(f),
  ]);
  let myBids = new Map();
  if (viewer.role === ROLES.CONTRACTOR && items.length) {
    const bids = await Bid.find({ contractor: viewer._id, isWithdrawn: false, tender: { $in: items.map((t) => t._id) } });
    myBids = new Map(bids.map((b) => [String(b.tender), b]));
  }
  return { items: items.map((t) => present(t, { viewer, myBid: myBids.get(String(t._id)) || null })), total };
}

async function listMine(user, q, { skip, limit }) {
  const f = { owner: user._id, visibility: { $ne: CONTENT_STATUS.DELETED } };
  if (q.status) f.status = q.status;
  const [items, total] = await Promise.all([
    Tender.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName companyName'),
    Tender.countDocuments(f),
  ]);
  return { items: items.map((t) => present(t, { viewer: user })), total };
}

module.exports = {
  present,
  create,
  update,
  publish,
  extend,
  cancel,
  addDocument,
  listDocuments,
  downloadDocument,
  getVisibleTender,
  getById,
  list,
  listMine,
};
