/**
 * Tender closing, evaluation and awarding — FR-13, FR-17, FR-18, FR-19, FR-20, FR-21.
 *
 *  open ──(deadline, server clock)──▶ no active bids ──▶ closed_no_bids   (TC-06, never enters evaluating)
 *                                   └▶ evaluating ──▶ shortlist_ready ──(award)──▶ awarded
 *
 * Every transition is a conditional atomic update, so the cron job, lazy closing and
 * concurrent requests can never process the same tender twice.
 */
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { Tender, Bid, EvaluationResult } = require('../models');
const { TENDER_STATUS, NOTIFICATION_TYPES, ROLES } = require('../config/constants');
const notifications = require('./notification.service');
const evaluator = require('./evaluation/evaluator');

const STUCK_EVALUATION_MS = 2 * 60 * 1000;

async function close(tender) {
  const at = new Date();
  const activeBids = await Bid.countDocuments({ tender: tender._id, isWithdrawn: false });
  const nextStatus = activeBids === 0 ? TENDER_STATUS.CLOSED_NO_BIDS : TENDER_STATUS.EVALUATING;

  // BR-08 — weights are frozen at the moment of closing
  const closed = await Tender.findOneAndUpdate(
    { _id: tender._id, status: TENDER_STATUS.OPEN, deadline: { $lte: at } },
    {
      status: nextStatus,
      closedAt: at,
      frozenWeights: { price: tender.priceWeight, duration: tender.durationWeight, frozenAt: at },
    },
    { new: true }
  );
  if (!closed) return null; // someone else closed it, or it was extended meanwhile

  if (nextStatus === TENDER_STATUS.CLOSED_NO_BIDS) {
    await notifications.notify(closed.owner, {
      type: NOTIFICATION_TYPES.TENDER_CLOSED_NO_BIDS,
      title: 'انتهت المناقصة دون عروض',
      body: `أُغلقت مناقصة «${closed.title}» دون ورود أي عرض فعّال.`,
      data: { tenderId: String(closed._id) },
    });
    return closed;
  }
  return evaluate(closed);
}

/** FR-17 / FR-19 — score all active (non-withdrawn) bids with the frozen weights; persist the top 5. */
async function evaluate(tender) {
  const bids = await Bid.find({ tender: tender._id, isWithdrawn: false }).lean();
  const weights = tender.frozenWeights && tender.frozenWeights.price !== undefined
    ? { price: tender.frozenWeights.price, duration: tender.frozenWeights.duration }
    : { price: tender.priceWeight, duration: tender.durationWeight };

  const input = bids.map((b) => ({ id: String(b._id), price: b.totalPrice, duration: b.durationDays, submittedAt: b.submittedAt }));
  const { engine, results, fallbackReason } = await evaluator.evaluate(input, weights, env.shortlistSize);
  const byId = new Map(bids.map((b) => [String(b._id), b]));
  const evaluatedAt = new Date();

  await EvaluationResult.deleteMany({ tender: tender._id }); // idempotent re-run (stuck recovery)
  await EvaluationResult.insertMany(
    results.map((r) => ({
      tender: tender._id,
      bid: r.id,
      contractor: byId.get(String(r.id)).contractor,
      rank: r.rank,
      score: r.score,
      normalizedPrice: r.normalizedPrice,
      normalizedDuration: r.normalizedDuration,
      totalPrice: r.price,
      durationDays: r.duration,
      weights,
      engine, // BR-17
      evaluatedAt,
    }))
  );

  const done = await Tender.findOneAndUpdate(
    { _id: tender._id, status: TENDER_STATUS.EVALUATING },
    {
      status: TENDER_STATUS.SHORTLIST_READY,
      evaluation: { engine, evaluatedAt, bidsConsidered: bids.length, fallbackReason },
    },
    { new: true }
  );
  if (done) {
    await notifications.notify(done.owner, {
      type: NOTIFICATION_TYPES.SHORTLIST_READY,
      title: 'قائمة الترشيح جاهزة',
      body: `أُغلقت مناقصة «${done.title}» وفُرزت ${bids.length} عروض. أفضل ${results.length} عروض بانتظار قرارك.`,
      data: { tenderId: String(done._id), engine },
    });
  }
  return done;
}

/** Close one tender if its deadline passed (used for lazy closing on read / bid attempts). */
async function closeIfDue(tenderId) {
  const t = await Tender.findOne({ _id: tenderId, status: TENDER_STATUS.OPEN, deadline: { $lte: new Date() } });
  if (!t) return null;
  try {
    return await close(t);
  } catch (e) {
    logger.error('closeIfDue failed', e);
    return null;
  }
}

/** Cron entry point — close every tender whose deadline has passed and recover stuck evaluations. */
async function runScheduledTick() {
  const due = await Tender.find({ status: TENDER_STATUS.OPEN, deadline: { $lte: new Date() } }).limit(200);
  for (const t of due) {
    try {
      await close(t);
    } catch (e) {
      logger.error(`closing tender ${t._id} failed`, e);
    }
  }
  // reliability (SRS 5-1): a tender must never remain in an intermediate state
  const stuck = await Tender.find({ status: TENDER_STATUS.EVALUATING, closedAt: { $lte: new Date(Date.now() - STUCK_EVALUATION_MS) } }).limit(50);
  for (const t of stuck) {
    try {
      await evaluate(t);
    } catch (e) {
      logger.error(`re-evaluating tender ${t._id} failed`, e);
    }
  }
  return { closed: due.length, recovered: stuck.length };
}

/** FR-18 — shortlist visible to the tender owner (TC-08: anyone else → 403) or an admin. */
async function getShortlist(tenderId, user) {
  const t = await Tender.findById(tenderId);
  if (!t) throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  if (String(t.owner) !== String(user._id) && user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('NOT_TENDER_OWNER', 'لا يمكنك استعراض قائمة ترشيح مناقصة ليست لك');
  }
  if ([TENDER_STATUS.DRAFT, TENDER_STATUS.OPEN].includes(t.status)) {
    throw ApiError.conflict('SHORTLIST_NOT_READY', 'قائمة الترشيح تظهر بعد إغلاق المناقصة');
  }
  const rows = await EvaluationResult.find({ tender: t._id }).sort({ rank: 1 }).populate('contractor', 'fullName companyName phone email');
  const bidNotes = await Bid.find({ _id: { $in: rows.map((r) => r.bid) } }).select('notes submittedAt');
  const notesById = new Map(bidNotes.map((b) => [String(b._id), b]));
  return {
    tenderId: String(t._id),
    status: t.status,
    engine: t.evaluation ? t.evaluation.engine : rows[0] && rows[0].engine,
    evaluatedAt: t.evaluation ? t.evaluation.evaluatedAt : null,
    bidsConsidered: t.evaluation ? t.evaluation.bidsConsidered : rows.length,
    weights: t.frozenWeights ? { price: t.frozenWeights.price, duration: t.frozenWeights.duration } : { price: t.priceWeight, duration: t.durationWeight },
    awardedBidId: t.awardedBid ? String(t.awardedBid) : null,
    results: rows.map((r) => {
      const b = notesById.get(String(r.bid));
      return {
        rank: r.rank,
        bidId: String(r.bid),
        score: r.score,
        scorePercent: Math.round(r.score * 10000) / 100,
        normalizedPrice: r.normalizedPrice,
        normalizedDuration: r.normalizedDuration,
        totalPrice: r.totalPrice,
        durationDays: r.durationDays,
        engine: r.engine,
        submittedAt: b ? b.submittedAt : null,
        notes: b ? b.notes : null,
        contractor: r.contractor
          ? { id: String(r.contractor._id), fullName: r.contractor.fullName, companyName: r.contractor.companyName, phone: r.contractor.phone, email: r.contractor.email }
          : null,
      };
    }),
  };
}

/** FR-20 / BR-18 — award to a shortlisted bid; final and irreversible (TC-13). FR-21 notifications. */
async function award(tenderId, user, bidId) {
  const t = await Tender.findById(tenderId);
  if (!t) throw ApiError.notFound('TENDER_NOT_FOUND', 'المناقصة غير موجودة');
  if (String(t.owner) !== String(user._id)) throw ApiError.forbidden('NOT_TENDER_OWNER', 'هذه المناقصة ليست لك');
  if (t.status === TENDER_STATUS.AWARDED) throw ApiError.conflict('TENDER_ALREADY_AWARDED', 'تم إرساء هذه المناقصة مسبقاً وهي مقفلة نهائياً');
  if (t.status !== TENDER_STATUS.SHORTLIST_READY) throw ApiError.conflict('INVALID_STATE', 'لا يمكن الإرساء إلا بعد جهوزية قائمة الترشيح');

  const inShortlist = await EvaluationResult.findOne({ tender: t._id, bid: bidId });
  if (!inShortlist) throw ApiError.badRequest('BID_NOT_SHORTLISTED', 'يجب أن يقع الإرساء على عرض من قائمة الترشيح حصراً', { field: 'bidId' });

  const awarded = await Tender.findOneAndUpdate(
    { _id: t._id, status: TENDER_STATUS.SHORTLIST_READY },
    { status: TENDER_STATUS.AWARDED, awardedBid: bidId, awardedAt: new Date() },
    { new: true }
  );
  if (!awarded) throw ApiError.conflict('TENDER_ALREADY_AWARDED', 'تم إرساء هذه المناقصة مسبقاً وهي مقفلة نهائياً');

  await Bid.updateOne({ _id: bidId }, { outcome: 'won' });
  await Bid.updateMany({ tender: t._id, _id: { $ne: bidId }, isWithdrawn: false }, { outcome: 'lost' });

  const winner = await Bid.findById(bidId);
  await notifications.notify(winner.contractor, {
    type: NOTIFICATION_TYPES.BID_WON,
    title: 'مبروك! تم إرساء المناقصة عليك',
    body: `اختار صاحب المشروع عرضك في مناقصة «${t.title}».`,
    data: { tenderId: String(t._id), bidId: String(bidId) },
  });
  const losers = await Bid.find({ tender: t._id, _id: { $ne: bidId }, isWithdrawn: false }).distinct('contractor');
  await notifications.notifyMany(losers, {
    type: NOTIFICATION_TYPES.BID_LOST,
    title: 'نتيجة مناقصة',
    body: `نشكر مشاركتك في مناقصة «${t.title}». نعتذر، فقد تم الإرساء على عرض آخر.`,
    data: { tenderId: String(t._id) },
  });
  return awarded;
}

module.exports = { close, evaluate, closeIfDue, runScheduledTick, getShortlist, award };
