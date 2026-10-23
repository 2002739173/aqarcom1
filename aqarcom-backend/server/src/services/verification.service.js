/**
 * Engineering verification — FR-22 (upload syndicate certificate / commercial register, encrypted store),
 * FR-23 / BR-09 (no bidding until verified), FR-24 / BR-10 (manual admin decision, mandatory rejection reason).
 */
const ApiError = require('../utils/ApiError');
const fileStore = require('../utils/fileStore');
const { User, VerificationRequest } = require('../models');
const { VERIFICATION_STATUS, NOTIFICATION_TYPES } = require('../config/constants');
const notifications = require('./notification.service');

const ACCEPTED = { 'application/pdf': true, 'image/jpeg': true, 'image/png': true, 'image/webp': true };

async function submit(contractor, filesByField, notes) {
  if (contractor.verificationStatus === VERIFICATION_STATUS.VERIFIED) {
    throw ApiError.conflict('ALREADY_VERIFIED', 'حسابك موثّق مسبقاً');
  }
  if (contractor.verificationStatus === VERIFICATION_STATUS.PENDING) {
    throw ApiError.conflict('VERIFICATION_PENDING', 'لديك طلب توثيق قيد المراجعة');
  }
  const entries = Object.entries(filesByField || {}).flatMap(([docType, files]) => files.map((f) => ({ docType, f })));
  if (entries.length === 0) {
    throw ApiError.badRequest('NO_FILES', 'يجب إرفاق شهادة نقابة المهندسين أو السجل التجاري', {
      fields: [{ field: 'engineers_syndicate' }, { field: 'commercial_register' }],
    });
  }
  if (!entries.some((e) => e.docType === 'engineers_syndicate' || e.docType === 'commercial_register')) {
    throw ApiError.badRequest('MAIN_DOC_REQUIRED', 'يجب إرفاق شهادة نقابة المهندسين أو السجل التجاري على الأقل');
  }

  const documents = [];
  for (const { docType, f } of entries) {
    const real = fileStore.sniffType(f.buffer);
    if (!ACCEPTED[real]) throw ApiError.unsupported('UNSUPPORTED_FILE_TYPE', 'الوثيقة يجب أن تكون PDF أو صورة (JPG, PNG)', { field: docType });
    const { storageKey, sha256 } = await fileStore.saveEncrypted(fileStore.SUBDIRS.verification, f.buffer);
    documents.push({ docType, originalName: f.originalname, mimeType: real, sizeBytes: f.size, storageKey, sha256 });
  }

  const reqDoc = await VerificationRequest.create({ contractor: contractor._id, documents, notes });
  await User.updateOne({ _id: contractor._id }, { verificationStatus: VERIFICATION_STATUS.PENDING });
  return reqDoc;
}

async function myStatus(contractor) {
  const latest = await VerificationRequest.findOne({ contractor: contractor._id }).sort({ createdAt: -1 });
  return { verificationStatus: contractor.verificationStatus, latestRequest: latest };
}

async function list({ status }, { skip, limit }) {
  const f = {};
  if (status) f.status = status;
  const [items, total] = await Promise.all([
    VerificationRequest.find(f).sort({ createdAt: 1 }).skip(skip).limit(limit).populate('contractor', 'fullName companyName email phone city'),
    VerificationRequest.countDocuments(f),
  ]);
  return { items, total };
}

async function getById(id) {
  const r = await VerificationRequest.findById(id).populate('contractor', 'fullName companyName email phone city').populate('reviewedBy', 'fullName');
  if (!r) throw ApiError.notFound('VERIFICATION_NOT_FOUND', 'طلب التوثيق غير موجود');
  return r;
}

async function downloadDocument(id, docId) {
  const r = await VerificationRequest.findById(id);
  if (!r) throw ApiError.notFound('VERIFICATION_NOT_FOUND', 'طلب التوثيق غير موجود');
  const d = r.documents.id(docId);
  if (!d) throw ApiError.notFound('DOCUMENT_NOT_FOUND', 'الوثيقة غير موجودة');
  return { doc: d, buffer: await fileStore.readDecrypted(d.storageKey) };
}

/** BR-10 — called only from the admin endpoint; there is no automatic approval path. */
async function decide(id, admin, { decision, reason }) {
  if (decision === 'reject' && (!reason || !reason.trim())) {
    throw ApiError.badRequest('REASON_REQUIRED', 'سبب الرفض إلزامي', { field: 'reason' });
  }
  const status = decision === 'approve' ? 'approved' : 'rejected';
  const r = await VerificationRequest.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { status, reviewedBy: admin._id, reviewedAt: new Date(), rejectionReason: decision === 'reject' ? reason.trim() : undefined },
    { new: true }
  );
  if (!r) throw ApiError.conflict('ALREADY_REVIEWED', 'تمت مراجعة هذا الطلب مسبقاً أو أنه غير موجود');

  const userStatus = decision === 'approve' ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.REJECTED;
  await User.updateOne({ _id: r.contractor }, { verificationStatus: userStatus });
  await notifications.notify(r.contractor, {
    type: decision === 'approve' ? NOTIFICATION_TYPES.VERIFICATION_APPROVED : NOTIFICATION_TYPES.VERIFICATION_REJECTED,
    title: decision === 'approve' ? 'تم اعتماد توثيق حسابك' : 'تم رفض طلب التوثيق',
    body: decision === 'approve' ? 'أصبح بإمكانك الآن تقديم العروض على المناقصات.' : `سبب الرفض: ${reason.trim()}. يمكنك تصحيح الوثائق وإعادة التقديم.`,
    data: { verificationRequestId: String(r._id), reason: decision === 'reject' ? reason.trim() : '' },
  });
  return r;
}

module.exports = { submit, myStatus, list, getById, downloadDocument, decide };
