/** Engineering verification (FR-22 → FR-24): view encrypted documents, approve / reject with a mandatory reason. */
import { api, qs } from '../api.js';
import { esc, $, L, pill, dt, toast, ask, openDrawer, closeDrawer, pager, loading, empty, errorBox } from '../ui.js';
import { openUser } from './users.js';

async function viewDoc(reqId, doc) {
  try {
    const blob = await api('GET', `/admin/verifications/${reqId}/documents/${doc.id}`, undefined, { blob: true });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast(e.message, 'err');
  }
}

async function decide(r, decision, after) {
  const approve = decision === 'approve';
  await ask({
    title: approve ? 'اعتماد التوثيق' : 'رفض طلب التوثيق',
    text: approve
      ? `سيصبح «${r.contractor.companyName || r.contractor.fullName}» متعهداً موثّقاً ويمكنه تقديم العروض.`
      : 'سيصل سبب الرفض للمتعهد ويمكنه إعادة التقديم.',
    okText: approve ? 'اعتماد' : 'رفض',
    okClass: approve ? 'btn--approve' : 'btn--danger',
    reason: !approve,
    reasonRequired: !approve,
    reasonLabel: 'سبب الرفض',
    onConfirm: async (reason) => {
      await api('POST', `/admin/verifications/${r.id}/decision`, { decision, reason });
      toast(approve ? 'تم اعتماد التوثيق' : 'تم رفض الطلب', 'ok');
      document.dispatchEvent(new CustomEvent('counts:refresh'));
      closeDrawer();
      if (after) await after();
    },
  });
}

async function openRequest(id, after) {
  const body = openDrawer('طلب توثيق هندسي', loading());
  let r;
  try {
    r = await api('GET', `/admin/verifications/${id}`);
  } catch (e) {
    body.innerHTML = errorBox(e);
    return;
  }
  const c = r.contractor || {};
  body.innerHTML = `
    <div class="card card-pad">
      <dl class="kv">
        <dt>المتعهد</dt><dd><button class="link-btn" data-user="${esc(c.id || c._id)}">${esc(c.fullName)}</button></dd>
        <dt>الشركة</dt><dd>${esc(c.companyName || '—')}</dd>
        <dt>البريد</dt><dd><span class="ltr">${esc(c.email)}</span></dd>
        <dt>الهاتف</dt><dd><span class="ltr">${esc(c.phone)}</span></dd>
        <dt>الحالة</dt><dd>${pill(r.status, 'verification')}</dd>
        <dt>تاريخ الطلب</dt><dd>${dt(r.createdAt)}</dd>
        ${r.reviewedAt ? `<dt>تاريخ المراجعة</dt><dd>${dt(r.reviewedAt)} — ${esc(r.reviewedBy ? r.reviewedBy.fullName : '')}</dd>` : ''}
        ${r.rejectionReason ? `<dt>سبب الرفض</dt><dd>${esc(r.rejectionReason)}</dd>` : ''}
        ${r.notes ? `<dt>ملاحظات المتعهد</dt><dd>${esc(r.notes)}</dd>` : ''}
      </dl>
    </div>
    <div>
      <h4 class="section-title">الوثائق المرفوعة (مخزّنة مشفّرة)</h4>
      <div class="doc-list">${r.documents.map((d) => `
        <div class="doc"><span>${esc(L.docType[d.docType] || d.docType)}<span class="sub muted">${esc(d.originalName || '')} · ${Math.round((d.sizeBytes || 0) / 1024)} KB</span></span>
        <button class="btn btn--ghost btn--sm" data-doc="${esc(d.id)}">عرض</button></div>`).join('')}</div>
    </div>
    ${r.status === 'pending' ? `
      <div class="callout">قرار التوثيق يدوي حصراً (BR-10): افحص الوثائق بصرياً قبل الاعتماد.</div>
      <div class="row-actions" style="justify-content:flex-start">
        <button class="btn btn--approve" data-decide="approve">اعتماد التوثيق</button>
        <button class="btn btn--danger" data-decide="reject">رفض مع السبب</button>
      </div>` : ''}`;
  body.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', () => viewDoc(r.id, r.documents.find((d) => d.id === b.dataset.doc))));
  body.querySelectorAll('[data-decide]').forEach((b) => b.addEventListener('click', () => decide(r, b.dataset.decide, after)));
  const ub = body.querySelector('[data-user]');
  if (ub) ub.addEventListener('click', () => openUser(ub.dataset.user));
}

export async function renderVerifications(root) {
  const state = { status: 'pending', page: 1 };
  root.innerHTML = `
    <div class="toolbar">
      <div class="tabs" id="tabs">
        <button data-s="pending" class="on">قيد المراجعة</button>
        <button data-s="approved">معتمدة</button>
        <button data-s="rejected">مرفوضة</button>
        <button data-s="">الكل</button>
      </div>
    </div>
    <div class="card"><div class="table-wrap" id="table"></div></div>`;

  const load = async () => {
    const t = $('#table', root);
    t.innerHTML = loading();
    let res;
    try {
      res = await api('GET', `/admin/verifications${qs({ status: state.status, page: state.page, limit: 20 })}`);
    } catch (e) {
      t.innerHTML = errorBox(e);
      return;
    }
    if (!res.data.length) {
      t.innerHTML = empty('لا توجد طلبات');
      return;
    }
    t.innerHTML = `<table>
      <thead><tr><th>المتعهد</th><th>الوثائق</th><th>الحالة</th><th>تاريخ الطلب</th><th class="actions"></th></tr></thead>
      <tbody>${res.data.map((r) => `
        <tr>
          <td><b>${esc(r.contractor ? r.contractor.companyName || r.contractor.fullName : '—')}</b><span class="sub">${esc(r.contractor ? r.contractor.fullName : '')}</span></td>
          <td>${r.documents.map((d) => esc(L.docType[d.docType] || d.docType)).join('، ')}</td>
          <td>${pill(r.status, 'verification')}</td>
          <td class="num">${dt(r.createdAt)}</td>
          <td class="actions"><button class="btn btn--primary btn--sm" data-open="${esc(r.id)}">مراجعة</button></td>
        </tr>`).join('')}</tbody></table>${pager(res.meta)}`;
    t.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openRequest(b.dataset.open, load)));
    t.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { state.page = +b.dataset.page; load(); }));
  };

  $('#tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    root.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    state.status = b.dataset.s;
    state.page = 1;
    load();
  });
  await load();
}
