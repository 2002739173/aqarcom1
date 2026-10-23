/**
 * Bids — FR-12 (verified contractor submits price + days), FR-13 / BR-11 (server-clock cut-off),
 * FR-16 / BR-15 (withdraw, record kept), FR-26 (notify tender owner), BR-12 (no peeking at competitors).
 */
const ApiError = require('../utils/ApiError');
const { Tender, Bid } = require('../models');
const { TENDER_STATUS, CONTENT_STATUS, NOTIFICATION_TYPES, ROLES } = require('../config/constants');
const notifications = require('./notification.service');
const lifecycle = require('./lifecycle.service');

/** Loads a tender and asserts it accepts bid operations *right now* by the server clock. */
async function loadOpenTender(tenderId) {
  const t = await Tender.findById(tenderId);
  if (!t || t.visibility !== CONTENT_STATUS.ACTIVE || t.status === TENDER_STATUS.DRAFT) {
    throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  }
  const serverNow = new Date();
  if (t.status !== TENDER_STATUS.OPEN || t.deadline <= serverNow) {
    if (t.status === TENDER_STATUS.OPEN) await lifecycle.closeIfDue(t._id); // close it immediately
    throw ApiError.conflict('TENDER_CLOSED', 'انتهى موعد إغلاق المناقصة حسب توقيت الخادم؛ لا يمكن تقديم العروض أو تعديلها أو سحبها', {
      deadline: t.deadline.toISOString(),
      serverTime: serverNow.toISOString(),
    });
  }
  return t;
}

async function submit(tenderId, contractor, { totalPrice, durationDays, notes }) {
  const t = await loadOpenTender(tenderId);
  if (String(t.owner) === String(contractor._id)) throw ApiError.forbidden('OWN_TENDER', 'لا يمكنك تقديم عرض على مناقصتك');
  const existing = await Bid.findOne({ tender: t._id, contractor: contractor._id, isWithdrawn: false });
  if (existing) throw ApiError.conflict('BID_EXISTS', 'لديك عرض فعّال على هذه المناقصة؛ يمكنك تعديله أو سحبه', { bidId: existing.id });

  const bid = await Bid.create({
    tender: t._id,
    contractor: contractor._id,
    totalPrice,
    durationDays,
    notes,
    submittedAt: new Date(),
  });

  // re-check after write: if the deadline passed in between, the bid must not count (race guard)
  const fresh = await Tender.findById(t._id);
  if (fresh.status !== TENDER_STATUS.OPEN || fresh.deadline <= bid.submittedAt) {
    await Bid.deleteOne({ _id: bid._id });
    throw ApiError.conflict('TENDER_CLOSED', 'انتهى موعد إغلاق المناقصة حسب توقيت الخادم');
  }
  await Tender.updateOne({ _id: t._id }, { $inc: { activeBidsCount: 1 } });

  await notifications.notify(t.owner, {
    type: NOTIFICATION_TYPES.NEW_BID,
    title: 'عرض جديد على مناقصتك',
    body: `ورد عرض جديد على مناقصة «${t.title}».`,
    data: { tenderId: String(t._id) }, // no price / contractor details before closing (fair competition)
  });
  return bid;
}

async function loadOwnActiveBid(bidId, contractor) {
  const bid = await Bid.findById(bidId);
  if (!bid || String(bid.contractor) !== String(contractor._id)) throw ApiError.notFound('BID_NOT_FOUND', 'العرض غير موجود');
  if (bid.isWithdrawn) throw ApiError.conflict('BID_WITHDRAWN', 'تم سحب هذا العرض مسبقاً');
  return bid;
}

async function update(bidId, contractor, patch) {
  const bid = await loadOwnActiveBid(bidId, contractor);
  await loadOpenTender(bid.tender); // FR-13
  bid.history.push({ totalPrice: bid.totalPrice, durationDays: bid.durationDays, at: bid.submittedAt });
  if (patch.totalPrice !== undefined) bid.totalPrice = patch.totalPrice;
  if (patch.durationDays !== undefined) bid.durationDays = patch.durationDays;
  if (patch.notes !== undefined) bid.notes = patch.notes;
  bid.submittedAt = new Date(); // a modified offer counts as submitted now (tie-break BR-19)
  await bid.save();
  return bid;
}

/** FR-16 — withdraw before closing; the record stays (BR-15) and is excluded from scoring. */
async function withdraw(bidId, contractor) {
  const bid = await loadOwnActiveBid(bidId, contractor);
  await loadOpenTender(bid.tender); // FR-13
  const r = await Bid.updateOne({ _id: bid._id, isWithdrawn: false }, { isWithdrawn: true, withdrawnAt: new Date() });
  if (r.modifiedCount) await Tender.updateOne({ _id: bid.tender }, { $inc: { activeBidsCount: -1 } });
  return Bid.findById(bid._id);
}

async function listMine(contractor, { skip, limit }, { includeWithdrawn } = {}) {
  const f = { contractor: contractor._id };
  if (!includeWithdrawn) f.isWithdrawn = false;
  const [items, total] = await Promise.all([
    Bid.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('tender', 'title status deadline tenderType city awardedBid'),
    Bid.countDocuments(f),
  ]);
  return {
    items: items.map((b) => {
      const o = b.toJSON();
      if (b.tender && b.tender._id) {
        o.tender = {
          id: String(b.tender._id),
          title: b.tender.title,
          status: b.tender.status,
          deadline: b.tender.deadline,
          tenderType: b.tender.tenderType,
          city: b.tender.city,
        };
      }
      return o;
    }),
    total,
  };
}

/** Tender owner (or admin) sees full bids only after closing (fairness, BR-12). */
async function listForTender(tenderId, user) {
  const t = await Tender.findById(tenderId);
  if (!t) throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  if (String(t.owner) !== String(user._id) && user.role !== ROLES.ADMIN) throw ApiError.forbidden('NOT_TENDER_OWNER', 'هذه المناقصة ليست لك');
  if (t.status === TENDER_STATUS.OPEN || t.status === TENDER_STATUS.DRAFT) {
    return { visible: false, activeBidsCount: t.activeBidsCount, items: [] };
  }
  const items = await Bid.find({ tender: t._id }).sort({ submittedAt: 1 }).populate('contractor', 'fullName companyName');
  return {
    visible: true,
    activeBidsCount: items.filter((b) => !b.isWithdrawn).length,
    items: items.map((b) => {
      const o = b.toJSON();
      o.contractor = b.contractor ? { id: String(b.contractor._id), fullName: b.contractor.fullName, companyName: b.contractor.companyName } : null;
      return o;
    }),
  };
}

module.exports = { submit, update, withdraw, listMine, listForTender };
