/** Content moderation — properties and tenders (FR-27): hide / delete / restore with a reason, audit history. */
import { api, qs } from '../api.js';
import { esc, $, L, pill, dt, day, n, money, toast, ask, openDrawer, pager, loading, empty, errorBox } from '../ui.js';
import { openUser } from './users.js';

const MOD = {
  hide: { label: 'إخفاء', cls: 'btn--warn', from: ['active'] },
  delete: { label: 'حذف', cls: 'btn--danger', from: ['active', 'hidden'] },
  restore: { label: 'استعادة', cls: 'btn--approve', from: ['hidden', 'deleted'] },
};

function modButtons(item, statusField) {
  const st = item[statusField];
  return Object.entries(MOD)
    .filter(([, m]) => m.from.includes(st))
    .map(([k, m]) => `<button class="btn ${m.cls} btn--sm" data-mod="${k}" data-id="${esc(item.id)}">${m.label}</button>`)
    .join('');
}

async function moderate(kind, item, action, after) {
  const m = MOD[action];
  await ask({
    title: `${m.label}: ${item.title}`,
    text: action === 'restore' ? 'سيعود المحتوى للظهور في نتائج البحث.' : 'يُستبعد المحتوى من نتائج البحث فوراً ويبقى سجله محفوظاً، ويصل السبب لصاحبه.',
    okText: m.label,
    okClass: m.cls,
    reason: true,
    reasonRequired: true,
    reasonLabel: 'السبب (يصل لصاحب المحتوى)',
    onConfirm: async (reason) => {
      await api('POST', `/admin/${kind === 'property' ? 'properties' : 'tenders'}/${item.id}/moderate`, { action, reason });
      toast(`تم: ${m.label}`, 'ok');
      if (after) await after();
    },
  });
}

async function historyHtml(kind, id) {
  try {
    const h = await api('GET', `/admin/${kind === 'property' ? 'properties' : 'tenders'}/${id}/moderation-history`);
    if (!h.length) return '<p class="muted small" style="margin:0">لا توجد إجراءات إشرافية.</p>';
    return `<ul class="timeline">${h.map((x) => `<li><b>${esc(L.action[x.action] || x.action)}</b> — ${dt(x.createdAt)}<br><span class="muted">${esc(x.admin ? x.admin.fullName : '')} · ${esc(x.reason)}</span></li>`).join('')}</ul>`;
  } catch (e) {
    return `<p class="muted small">${esc(e.message)}</p>`;
  }
}

/* ---------------- properties ---------------- */

async function openProperty(p, after) {
  const body = openDrawer('إعلان عقاري', loading());
  const [lng, lat] = (p.location && p.location.coordinates) || [];
  const imgs = (p.media || []).filter((m) => m.kind === 'image');
  body.innerHTML = `
    <div class="card card-pad">
      <div style="font-weight:800;font-size:17px;margin-bottom:6px">${esc(p.title)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${pill(p.status, 'content')} <span class="role">${esc(L.propertyType[p.propertyType] || p.propertyType)}</span> <span class="role">${esc(L.purpose[p.purpose] || p.purpose)}</span></div>
    </div>
    ${p.moderation && p.moderation.reason ? `<div class="callout callout--red"><b>سبب آخر إجراء:</b> ${esc(p.moderation.reason)}</div>` : ''}
    <div class="row-actions" style="justify-content:flex-start">${modButtons(p, 'status')}</div>
    ${imgs.length ? `<div class="thumbs">${imgs.map((m) => `<img src="${esc(m.url)}" alt="" loading="lazy">`).join('')}</div>` : ''}
    <div class="card card-pad"><dl class="kv">
      <dt>السعر</dt><dd>${esc(money(p.price, p.currency))}</dd>
      <dt>المساحة</dt><dd>${n(p.area)} م²</dd>
      <dt>الغرف</dt><dd>${n(p.rooms)}</dd>
      <dt>الموقع</dt><dd>${esc([p.city, p.district, p.address].filter(Boolean).join(' · '))}</dd>
      <dt>الإحداثيات</dt><dd><span class="ltr">${lat ?? '—'}, ${lng ?? '—'}</span></dd>
      <dt>المالك</dt><dd>${p.owner ? `<button class="link-btn" data-user="${esc(p.owner._id || p.owner.id)}">${esc(p.owner.fullName)}</button>` : '—'}</dd>
      <dt>المشاهدات</dt><dd>${n(p.viewsCount)}</dd>
      <dt>تاريخ النشر</dt><dd>${dt(p.createdAt)}</dd>
    </dl>${p.description ? `<p style="margin:12px 0 0;white-space:pre-wrap">${esc(p.description)}</p>` : ''}</div>
    <div class="card card-pad"><h4 class="section-title">السجل الإشرافي</h4><div id="hist">${loading()}</div></div>`;
  body.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => moderate('property', p, b.dataset.mod, after)));
  const ub = body.querySelector('[data-user]');
  if (ub) ub.addEventListener('click', () => openUser(ub.dataset.user));
  $('#hist', body).innerHTML = await historyHtml('property', p.id);
}

export async function renderProperties(root) {
  const state = { status: '', page: 1 };
  root.innerHTML = `
    <div class="toolbar">
      <div class="tabs" id="tabs">
        <button data-s="" class="on">الكل</button>
        <button data-s="active">ظاهرة</button>
        <button data-s="hidden">مخفية</button>
        <button data-s="deleted">محذوفة</button>
      </div>
      <span class="muted small">الأحدث أولاً — لمراجعة الإعلانات المطروحة حديثاً</span>
    </div>
    <div class="card"><div class="table-wrap" id="table"></div></div>`;

  const load = async () => {
    const t = $('#table', root);
    t.innerHTML = loading();
    let res;
    try {
      res = await api('GET', `/admin/review-queue${qs({ type: 'property', status: state.status, page: state.page, limit: 20 })}`);
    } catch (e) {
      t.innerHTML = errorBox(e);
      return;
    }
    if (!res.data.length) {
      t.innerHTML = empty('لا توجد إعلانات');
      return;
    }
    t.innerHTML = `<table>
      <thead><tr><th>الإعلان</th><th>النوع / الغرض</th><th>السعر</th><th>المالك</th><th>الحالة</th><th>النشر</th><th class="actions">إجراءات</th></tr></thead>
      <tbody>${res.data.map((p) => `
        <tr>
          <td><button class="link-btn" data-open="${esc(p.id)}">${esc(p.title)}</button><span class="sub">${esc([p.city, p.district].filter(Boolean).join(' · '))}</span></td>
          <td>${esc(L.propertyType[p.propertyType] || p.propertyType)}<span class="sub">${esc(L.purpose[p.purpose] || p.purpose)}</span></td>
          <td class="num">${esc(money(p.price, p.currency))}</td>
          <td>${esc(p.owner ? p.owner.fullName : '—')}</td>
          <td>${pill(p.status, 'content')}</td>
          <td class="num">${day(p.createdAt)}</td>
          <td class="actions"><div class="row-actions">${modButtons(p, 'status')}</div></td>
        </tr>`).join('')}</tbody></table>${pager(res.meta)}`;
    const byId = new Map(res.data.map((p) => [p.id, p]));
    t.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openProperty(byId.get(b.dataset.open), load)));
    t.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => moderate('property', byId.get(b.dataset.id), b.dataset.mod, load)));
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

/* ---------------- tenders ---------------- */

async function openTender(t, after) {
  const body = openDrawer('مناقصة', loading());
  body.innerHTML = `
    <div class="card card-pad">
      <div style="font-weight:800;font-size:17px;margin-bottom:6px">${esc(t.title)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${pill(t.status, 'tender')} ${pill(t.visibility, 'content')} <span class="role">${esc(L.tenderType[t.tenderType] || t.tenderType)}</span></div>
    </div>
    ${t.moderation && t.moderation.reason ? `<div class="callout callout--red"><b>سبب آخر إجراء:</b> ${esc(t.moderation.reason)}</div>` : ''}
    <div class="row-actions" style="justify-content:flex-start">${modButtons(t, 'visibility')}</div>
    <div class="card card-pad"><dl class="kv">
      <dt>صاحب المشروع</dt><dd>${t.owner ? `<button class="link-btn" data-user="${esc(t.owner._id || t.owner.id)}">${esc(t.owner.fullName)}</button>` : '—'}</dd>
      <dt>المدينة</dt><dd>${esc(t.city || '—')}</dd>
      <dt>الأوزان</dt><dd>السعر ${n(t.priceWeight)}% · المدة ${n(t.durationWeight)}%</dd>
      <dt>موعد الإغلاق</dt><dd>${dt(t.deadline)}${t.extensionUsed ? ' <span class="muted">(مُمدَّد)</span>' : ''}</dd>
      <dt>العروض الفعّالة</dt><dd>${n(t.activeBidsCount)}</dd>
      <dt>إصدار دفتر الشروط</dt><dd>${n(t.currentDocumentVersion)}</dd>
      ${t.evaluation && t.evaluation.engine ? `<dt>محرك الفرز</dt><dd>${t.evaluation.engine === 'wsm' ? 'خدمة WSM (Python)' : 'المقيّم الاحتياطي'} — ${dt(t.evaluation.evaluatedAt)}</dd>` : ''}
      <dt>تاريخ الإنشاء</dt><dd>${dt(t.createdAt)}</dd>
    </dl>${t.description ? `<p style="margin:12px 0 0;white-space:pre-wrap">${esc(t.description)}</p>` : ''}</div>
    <div class="card card-pad"><h4 class="section-title">قائمة الترشيح (أفضل 5)</h4><div id="sl">${loading()}</div></div>
    <div class="card card-pad"><h4 class="section-title">السجل الإشرافي</h4><div id="hist">${loading()}</div></div>`;
  body.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => moderate('tender', t, b.dataset.mod, after)));
  const ub = body.querySelector('[data-user]');
  if (ub) ub.addEventListener('click', () => openUser(ub.dataset.user));

  const sl = $('#sl', body);
  try {
    const s = await api('GET', `/tenders/${t.id}/shortlist`);
    sl.innerHTML = s.results.length
      ? `<div class="table-wrap"><table><thead><tr><th>#</th><th>المتعهد</th><th>السعر</th><th>المدة</th><th>النتيجة</th></tr></thead><tbody>${s.results
          .map((r) => `<tr${s.awardedBidId === r.bidId ? ' style="background:var(--emerald-50)"' : ''}><td class="num">${r.rank}</td>
            <td>${esc(r.contractor ? r.contractor.companyName || r.contractor.fullName : '—')}${s.awardedBidId === r.bidId ? ' <span class="pill pill--awarded">مُرسّى</span>' : ''}</td>
            <td class="num">${esc(money(r.totalPrice))}</td><td class="num">${n(r.durationDays)} يوم</td><td class="num"><b>${n(r.scorePercent)}%</b></td></tr>`)
          .join('')}</tbody></table></div>`
      : '<p class="muted small" style="margin:0">لا توجد نتائج.</p>';
  } catch (e) {
    sl.innerHTML = `<p class="muted small" style="margin:0">${esc(e.code === 'SHORTLIST_NOT_READY' ? 'تظهر قائمة الترشيح بعد إغلاق المناقصة.' : e.message)}</p>`;
  }
  $('#hist', body).innerHTML = await historyHtml('tender', t.id);
}

export async function renderTenders(root) {
  const state = { visibility: '', status: '', page: 1 };
  root.innerHTML = `
    <div class="toolbar">
      <div class="tabs" id="tabs">
        <button data-s="" class="on">الكل</button>
        <button data-s="active">ظاهرة</button>
        <button data-s="hidden">مخفية</button>
        <button data-s="deleted">محذوفة</button>
      </div>
      <div class="filters">
        <select id="f-status"><option value="">كل مراحل المناقصة</option>${Object.entries(L.tender).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      </div>
    </div>
    <div class="card"><div class="table-wrap" id="table"></div></div>`;

  const load = async () => {
    const tb = $('#table', root);
    tb.innerHTML = loading();
    let res;
    try {
      res = await api('GET', `/admin/review-queue${qs({ type: 'tender', status: state.visibility, tenderStatus: state.status, page: state.page, limit: 20 })}`);
    } catch (e) {
      tb.innerHTML = errorBox(e);
      return;
    }
    const rows = res.data;
    if (!rows.length) {
      tb.innerHTML = empty('لا توجد مناقصات');
      return;
    }
    tb.innerHTML = `<table>
      <thead><tr><th>المناقصة</th><th>النوع</th><th>صاحب المشروع</th><th>المرحلة</th><th>الظهور</th><th>الإغلاق</th><th class="actions">إجراءات</th></tr></thead>
      <tbody>${rows.map((t) => `
        <tr>
          <td><button class="link-btn" data-open="${esc(t.id)}">${esc(t.title)}</button><span class="sub">${esc(t.city || '')}</span></td>
          <td>${esc(L.tenderType[t.tenderType] || t.tenderType)}</td>
          <td>${esc(t.owner ? t.owner.fullName : '—')}</td>
          <td>${pill(t.status, 'tender')}</td>
          <td>${pill(t.visibility, 'content')}</td>
          <td class="num">${dt(t.deadline)}</td>
          <td class="actions"><div class="row-actions">${modButtons(t, 'visibility')}</div></td>
        </tr>`).join('')}</tbody></table>${pager(res.meta)}`;
    const byId = new Map(res.data.map((t) => [t.id, t]));
    tb.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openTender(byId.get(b.dataset.open), load)));
    tb.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => moderate('tender', byId.get(b.dataset.id), b.dataset.mod, load)));
    tb.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { state.page = +b.dataset.page; load(); }));
  };
  $('#tabs', root).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    root.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    state.visibility = b.dataset.s;
    state.page = 1;
    load();
  });
  $('#f-status', root).addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
  await load();
}
