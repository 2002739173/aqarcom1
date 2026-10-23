/** Shared UI helpers: escaping, labels, toasts, confirm/reason modal, drawer, pagination. */

/** Escape every piece of user-provided text before putting it in HTML. */
export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const L = {
  role: { user: 'مستخدم فردي', property_owner: 'مالك عقار', project_owner: 'صاحب مشروع', contractor: 'متعهد', admin: 'مدير النظام' },
  account: { pending: 'بانتظار الموافقة', active: 'مفعّل', rejected: 'مرفوض', suspended: 'موقوف' },
  verification: { none: 'غير مقدَّم', pending: 'قيد المراجعة', verified: 'موثّق', rejected: 'مرفوض', approved: 'معتمد' },
  content: { active: 'ظاهر', hidden: 'مخفي', deleted: 'محذوف' },
  tender: {
    draft: 'مسودة', open: 'مفتوحة', evaluating: 'قيد الفرز', shortlist_ready: 'قائمة الترشيح جاهزة',
    awarded: 'مُرسّاة', closed_no_bids: 'منتهية دون عروض', cancelled: 'ملغاة',
  },
  tenderType: { construction: 'عمار', finishing: 'إكساء', partnership: 'مشاركة' },
  purpose: { sale: 'بيع', rent: 'إيجار', investment: 'استثمار' },
  propertyType: {
    apartment: 'شقة', house: 'بيت', villa: 'فيلا', land: 'أرض', shop: 'محل', office: 'مكتب',
    building: 'بناء', farm: 'مزرعة', warehouse: 'مستودع',
  },
  docType: { engineers_syndicate: 'شهادة نقابة المهندسين', commercial_register: 'السجل التجاري', other: 'وثيقة أخرى' },
  action: {
    approve: 'موافقة وتفعيل', reject: 'رفض', suspend: 'إيقاف', unsuspend: 'إعادة تفعيل', role_change: 'تغيير الدور',
    hide: 'إخفاء', delete: 'حذف', restore: 'استعادة',
  },
};

export const pill = (value, group) => `<span class="pill pill--${esc(value)}">${esc((L[group] && L[group][value]) || value)}</span>`;
export const roleTag = (r) => `<span class="role">${esc(L.role[r] || r)}</span>`;

const fmtDate = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium', timeStyle: 'short' });
const fmtDay = new Intl.DateTimeFormat('ar-SY', { dateStyle: 'medium' });
export const dt = (v) => (v ? fmtDate.format(new Date(v)) : '—');
export const day = (v) => (v ? fmtDay.format(new Date(v)) : '—');
export const n = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('ar-SY'));
export const money = (v, cur) => (v === undefined || v === null ? '—' : `${Number(v).toLocaleString('en-US')} ${cur || ''}`.trim());
export const initials = (name) => esc(String(name || '؟').trim().charAt(0));

/* ---------- toasts ---------- */
export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'toast--' + kind : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ---------- modal (confirm + optional reason) ---------- */
/**
 * @returns {Promise<string|null>} the reason text (or '' when not asked), or null if cancelled.
 * `onConfirm(reason)` may throw an ApiError — the message is shown inside the modal and it stays open.
 */
export function ask({ title, text = '', okText = 'تأكيد', okClass = 'btn--primary', reason = false, reasonRequired = false, reasonLabel = 'السبب', extraHtml = '', onConfirm }) {
  const modal = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  $('#modal-extra').innerHTML = extraHtml;
  $('#modal-reason-wrap').hidden = !reason;
  $('#modal-reason-label').textContent = reasonLabel + (reasonRequired ? ' (إلزامي)' : ' (اختياري)');
  const ta = $('#modal-reason');
  ta.value = '';
  $('#modal-error').textContent = '';
  const ok = $('#modal-ok');
  ok.textContent = okText;
  ok.className = `btn ${okClass}`;
  modal.hidden = false;
  (reason ? ta : ok).focus();

  return new Promise((resolve) => {
    const close = (val) => {
      modal.hidden = true;
      ok.onclick = null;
      $('#modal-cancel').onclick = null;
      modal.onclick = null;
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    $('#modal-cancel').onclick = () => close(null);
    modal.onclick = (e) => { if (e.target === modal) close(null); };
    ok.onclick = async () => {
      const r = ta.value.trim();
      if (reason && reasonRequired && r.length < 3) {
        $('#modal-error').textContent = 'يرجى كتابة السبب (3 أحرف على الأقل)';
        ta.focus();
        return;
      }
      if (!onConfirm) return close(r);
      ok.disabled = true;
      try {
        await onConfirm(r, $('#modal-extra'));
        close(r);
      } catch (e) {
        $('#modal-error').textContent = e.message || 'حدث خطأ';
      } finally {
        ok.disabled = false;
      }
    };
  });
}

/* ---------- drawer ---------- */
export function openDrawer(title, html) {
  $('#drawer-title').textContent = title;
  $('#drawer-body').innerHTML = html;
  $('#drawer').hidden = false;
  $('#drawer-backdrop').hidden = false;
  return $('#drawer-body');
}
export function closeDrawer() {
  $('#drawer').hidden = true;
  $('#drawer-backdrop').hidden = true;
}
export const drawerOpen = () => !$('#drawer').hidden;

/* ---------- pagination footer ---------- */
export function pager(meta) {
  if (!meta || meta.totalPages <= 1) return meta ? `<div class="pager"><span>${n(meta.total)} نتيجة</span><span></span></div>` : '';
  return `<div class="pager">
    <span>صفحة ${n(meta.page)} من ${n(meta.totalPages)} — ${n(meta.total)} نتيجة</span>
    <span>
      <button class="btn btn--ghost btn--sm" data-page="${meta.page - 1}" ${meta.page <= 1 ? 'disabled' : ''}>السابق</button>
      <button class="btn btn--ghost btn--sm" data-page="${meta.page + 1}" ${meta.page >= meta.totalPages ? 'disabled' : ''}>التالي</button>
    </span>
  </div>`;
}

export const loading = () => '<div class="loading">جارٍ التحميل…</div>';
export const empty = (title, sub = '') => `<div class="empty"><b>${esc(title)}</b>${esc(sub)}</div>`;
export const errorBox = (e) => `<div class="empty"><b>تعذّر تحميل البيانات</b>${esc(e.message)}</div>`;

/** Debounce for search inputs. */
export function debounce(fn, ms = 350) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
