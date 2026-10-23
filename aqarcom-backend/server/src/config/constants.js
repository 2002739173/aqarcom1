/** Enumerations shared across the codebase (SRS 6-2). */

const ROLES = Object.freeze({
  USER: 'user', // مستخدم فردي / باحث عن عقار
  PROPERTY_OWNER: 'property_owner', // مالك عقار
  PROJECT_OWNER: 'project_owner', // صاحب مشروع
  CONTRACTOR: 'contractor', // متعهد / شركة هندسية
  ADMIN: 'admin', // مدير النظام (لا يُنشأ عبر التسجيل)
});

/** Roles a visitor may pick when registering (FR-01). */
const REGISTRABLE_ROLES = [ROLES.USER, ROLES.PROPERTY_OWNER, ROLES.PROJECT_OWNER, ROLES.CONTRACTOR];

/** Roles allowed into the B2B tenders section (NFR-04 — hidden from individual users). */
const B2B_ROLES = [ROLES.PROJECT_OWNER, ROLES.CONTRACTOR, ROLES.ADMIN];

const VERIFICATION_STATUS = Object.freeze({
  NONE: 'none',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
});

/**
 * Account lifecycle. New accounts with a privileged role start as PENDING and get no privileges
 * until an administrator approves them from the admin dashboard — the only place this can happen.
 */
const ACCOUNT_STATUS = Object.freeze({
  PENDING: 'pending', // بانتظار موافقة الإدارة
  ACTIVE: 'active', // مفعّل
  REJECTED: 'rejected', // مرفوض
  SUSPENDED: 'suspended', // موقوف
});

const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'land', 'shop', 'office', 'building', 'farm', 'warehouse'];
const LISTING_PURPOSES = ['sale', 'rent', 'investment'];

/** Content status — shared by properties and tenders moderation (BR-06, BR-20). */
const CONTENT_STATUS = Object.freeze({ ACTIVE: 'active', HIDDEN: 'hidden', DELETED: 'deleted' });

const TENDER_TYPES = ['construction', 'finishing', 'partnership']; // عمار / إكساء / مشاركة

/** Tender lifecycle — the seven states of the state diagram (Figure 4). */
const TENDER_STATUS = Object.freeze({
  DRAFT: 'draft', // مسودة
  OPEN: 'open', // مفتوحة
  EVALUATING: 'evaluating', // قيد الفرز
  SHORTLIST_READY: 'shortlist_ready', // قائمة الترشيح جاهزة
  AWARDED: 'awarded', // مُرسّاة
  CLOSED_NO_BIDS: 'closed_no_bids', // منتهية دون عروض
  CANCELLED: 'cancelled', // ملغاة
});

const EVALUATION_ENGINE = Object.freeze({ WSM: 'wsm', FALLBACK: 'fallback' });

const NOTIFICATION_TYPES = Object.freeze({
  NEW_BID: 'new_bid', // FR-26
  BID_WON: 'bid_won', // FR-21
  BID_LOST: 'bid_lost', // FR-21
  TENDER_CLOSED_NO_BIDS: 'tender_closed_no_bids', // TC-06
  SHORTLIST_READY: 'shortlist_ready', // FR-18
  TENDER_DOCUMENT_UPDATED: 'tender_document_updated', // FR-15
  TENDER_EXTENDED: 'tender_extended', // FR-14
  TENDER_CANCELLED: 'tender_cancelled',
  VERIFICATION_APPROVED: 'verification_approved', // FR-24
  VERIFICATION_REJECTED: 'verification_rejected', // FR-24
  CONTENT_HIDDEN: 'content_hidden', // FR-27
  CONTENT_DELETED: 'content_deleted', // FR-27
  CONTENT_RESTORED: 'content_restored',
  ACCOUNT_LOCKED: 'account_locked', // FR-04
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  ACCOUNT_SUSPENDED: 'account_suspended',
  ACCOUNT_REACTIVATED: 'account_reactivated',
  ROLE_CHANGED: 'role_changed',
});

const ALLOWED_DOC_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const ALLOWED_IMAGE_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = {
  ROLES,
  REGISTRABLE_ROLES,
  B2B_ROLES,
  VERIFICATION_STATUS,
  ACCOUNT_STATUS,
  PROPERTY_TYPES,
  LISTING_PURPOSES,
  CONTENT_STATUS,
  TENDER_TYPES,
  TENDER_STATUS,
  EVALUATION_ENGINE,
  NOTIFICATION_TYPES,
  ALLOWED_DOC_MIME,
  ALLOWED_IMAGE_MIME,
};
