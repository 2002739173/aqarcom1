/**
 * Accounts: approval queue + full user management.
 * This is the ONLY place where an account is activated (approve), rejected, suspended,
 * reactivated or has its role changed — the backend refuses these actions from anywhere else.
 */
import { api, qs } from '../api.js';
import { esc, $, L, pill, roleTag, dt, day, n, toast, ask, openDrawer, closeDrawer, pager, loading, empty, errorBox, debounce, initials } from '../ui.js';

/* ---------------- account actions (shared) ---------------- */

const ACTIONS = {
  approve: { label: 'موافقة وتفعيل', cls: 'btn--approve', reason: false, from: ['pending', 'rejected'],
    confirm: (u) => `سيحصل «${u.fullName}» على كامل صلاحيات دور ${L.role[u.role]}.` },
  reject: { label: 'رفض', cls: 'btn--danger', reason: true, from: ['pending'],
    confirm: (u) => `لن يتمكن «${u.fullName}» من تسجيل الدخول. سيصله سبب الرفض.` },
  suspend: { label: 'إيقاف', cls: 'btn--warn', reason: true, from: ['active', 'pending'],
    confirm: (u) => `سيُسجَّل خروج «${u.fullName}» من كل الأجهزة ويُمنع من الدخول.` },
  reactivate: { label: 'إعادة تفعيل', cls: 'btn--approve', reason: false, from: ['suspended'],
    confirm: (u) => `سيستعيد «${u.fullName}» صلاحياته.` },
};

export function actionButtons(u, { size = 'btn--sm', include = Object.keys(ACTIONS) } = {}) {
  if (u.role === 'admin') return '<span class="muted small">حساب مدير</span>';
  return include
    .filter((a) => ACTIONS[a].from.includes(u.status))
    .map((a) => `<button class="btn ${ACTIONS[a].cls} ${size}" data-act="${a}" data-id="${esc(u.id)}">${ACTIONS[a].label}</button>`)
    .join('');
}

export async function runAction(action, user, after) {
  const a = ACTIONS[action];
  await ask({
    title: `${a.label}: ${user.fullName}`,
    text: a.confirm(user),
    okText: a.label,
    okClass: a.cls === 'btn--danger' ? 'btn--danger' : a.cls === 'btn--warn' ? 'btn--warn' : 'btn--approve',
    reason: true,
    reasonRequired: a.reason,
    reasonLabel: a.reason ? 'السبب (يصل للمستخدم)' : 'ملاحظة',
    onConfirm: async (reason) => {
      await api('POST', `/admin/users/${user.id}/${action}`, { reason });
      toast(`تم: ${a.label} — ${user.fullName}`, 'ok');
      document.dispatchEvent(new CustomEvent('counts:refresh'));
      if (after) await after();
    },
  });
}

async function changeRole(user, after) {
  const options = ['user', 'property_owner', 'project_owner', 'contractor']
    .filter((r) => r !== user.role)
    .map((r) => `<option value="${r}">${L.role[r]}</option>`)
    .join('');
  await ask({
    title: `تغيير دور: ${user.fullName}`,
    text: `الدور الحالي: ${L.role[user.role]}. سيُطلب من المستخدم تسجيل الدخول من جديد.`,
    extraHtml: `<label class="field"><span>الدور الجديد</span><select id="new-role">${options}</select></label>`,
    okText: 'تغيير الدور',
    reason: true,
    reasonRequired: true,
    onConfirm: async (reason, extra) => {
      const role = $('#new-role', extra).value;
      await api('POST', `/admin/users/${user.id}/role`, { role, reason });
      toast('تم تغيير الدور', 'ok');
      if (after) await after();
    },
  });
}

/* ---------------- user drawer ---------------- */

export async function openUser(id, onChange) {
  const body = openDrawer('تفاصيل الحساب', loading());
  const reload = async () => {
    let d;
    try {
      d = await api('GET', `/admin/users/${id}`);
    } catch (e) {
      body.innerHTML = errorBox(e);
      return;
    }
    const u = d.user;
    const rev = u.statusReview;
    body.innerHTML = `
      <div class="card card-pad" style="display:flex;gap:14px;align-items:center">
        <div class="avatar">${initials(u.fullName)}</div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:17px">${esc(u.fullName)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${roleTag(u.role)} ${pill(u.status, 'account')}
            ${u.role === 'contractor' ? pill(u.verificationStatus, 'verification') : ''}</div>
        </div>
      </div>

      ${u.status === 'pending' ? `<div class="callout">هذا الحساب لا يملك أي صلاحية حتى توافق عليه من هنا.</div>` : ''}
      ${rev && rev.reason && ['rejected', 'suspended'].includes(u.status) ? `<div class="callout callout--red"><b>السبب:</b> ${esc(rev.reason)}</div>` : ''}

      <div class="row-actions" style="justify-content:flex-start">
        ${actionButtons(u, { size: '' })}
        ${u.role !== 'admin' ? `<button class="btn btn--ghost" data-role-change>تغيير الدور</button>` : ''}
      </div>

      <div class="card card-pad">
        <h4 class="section-title">البيانات</h4>
        <dl class="kv">
          <dt>البريد</dt><dd><span class="ltr">${esc(u.email)}</span></dd>
          <dt>الهاتف</dt><dd><span class="ltr">${esc(u.phone)}</span></dd>
          ${u.whatsapp ? `<dt>واتساب</dt><dd><span class="ltr">${esc(u.whatsapp)}</span></dd>` : ''}
          ${u.companyName ? `<dt>الشركة / المكتب</dt><dd>${esc(u.companyName)}</dd>` : ''}
          ${u.city ? `<dt>المدينة</dt><dd>${esc(u.city)}</dd>` : ''}
          <dt>تاريخ التسجيل</dt><dd>${dt(u.createdAt)}</dd>
          <dt>آخر دخول</dt><dd>${dt(u.lastLoginAt)}</dd>
          ${rev && rev.at ? `<dt>آخر قرار إداري</dt><dd>${esc(L.action[rev.action] || rev.action || '')} — ${dt(rev.at)}${rev.by ? ' — ' + esc(rev.by.fullName) : ''}</dd>` : ''}
        </dl>
      </div>

      <div class="counts">
        <div><b class="num">${n(d.counts.properties)}</b><span class="muted small">إعلانات</span></div>
        <div><b class="num">${n(d.counts.tenders)}</b><span class="muted small">مناقصات</span></div>
        <div><b class="num">${n(d.counts.bids)}</b><span class="muted small">عروض</span></div>
      </div>

      ${d.latestVerification ? `
      <div class="card card-pad">
        <h4 class="section-title">آخر طلب توثيق هندسي</h4>
        <p style="margin:0 0 8px">${pill(d.latestVerification.status, 'verification')} <span class="muted small">— ${dt(d.latestVerification.createdAt)}</span></p>
        <a href="#/verifications" data-close-drawer>فتح صفحة التوثيق ←</a>
      </div>` : ''}

      <div class="card card-pad">
        <h4 class="section-title">سجل القرارات الإدارية</h4>
        ${d.history.length ? `<ul class="timeline">${d.history.map((h) => `
          <li><b>${esc(L.action[h.action] || h.action)}</b> — ${dt(h.createdAt)}<br>
          <span class="muted">${esc(h.admin ? h.admin.fullName : '')}${h.reason && h.reason !== '—' ? ' · ' + esc(h.reason) : ''}</span></li>`).join('')}</ul>`
          : '<p class="muted small" style="margin:0">لا توجد قرارات بعد.</p>'}
      </div>

      <div class="card card-pad">
        <h4 class="section-title">آخر محاولات الدخول</h4>
        ${d.loginAttempts.length ? `<ul class="timeline">${d.loginAttempts.map((a) => `
          <li>${a.success ? '✓ ناجحة' : '✕ فاشلة' + (a.reason ? ` (${esc(a.reason)})` : '')} — ${dt(a.createdAt)} <span class="muted ltr">${esc(a.ip || '')}</span></li>`).join('')}</ul>`
          : '<p class="muted small" style="margin:0">لا توجد محاولات مسجلة.</p>'}
      </div>`;

    body.querySelectorAll('[data-act]').forEach((b) =>
      b.addEventListener('click', () => runAction(b.dataset.act, u, async () => { await reload(); if (onChange) onChange(); }))
    );
    const rc = body.querySelector('[data-role-change]');
    if (rc) rc.addEventListener('click', () => changeRole(u, async () => { await reload(); if (onChange) onChange(); }));
    body.querySelectorAll('[data-close-drawer]').forEach((a) => a.addEventListener('click', closeDrawer));
  };
  await reload();
}

/* ---------------- approvals page ---------------- */

export async function renderApprovals(root) {
  const state = { role: '', page: 1 };
  root.innerHTML = `
    <div class="toolbar">
      <div class="filters">
        <select id="f-role">
          <option value="">كل الأدوار</option>
          <option value="property_owner">مالك عقار</option>
          <option value="project_owner">صاحب مشروع</option>
          <option value="contractor">متعهد</option>
          <option value="user">مستخدم فردي</option>
        </select>
      </div>
    </div>
    <p class="muted small" style="margin-top:-4px">الحسابات الجديدة بأدوار ذات صلاحيات لا تحصل على أي صلاحية حتى توافق عليها هنا. يصل للمستخدم إشعار بالقرار.</p>
    <div id="list"></div>`;

  const load = async () => {
    const list = $('#list', root);
    list.innerHTML = loading();
    let res;
    try {
      res = await api('GET', `/admin/users${qs({ status: 'pending', role: state.role, page: state.page, limit: 20 })}`);
    } catch (e) {
      list.innerHTML = errorBox(e);
      return;
    }
    if (!res.data.length) {
      list.innerHTML = `<div class="card">${empty('لا توجد طلبات تفعيل معلّقة', ' — كل الحسابات تمت مراجعتها.')}</div>`;
      return;
    }
    list.innerHTML = `<div class="approval-list">${res.data.map((u) => `
      <div class="card approval">
        <div class="avatar">${initials(u.fullName)}</div>
        <div>
          <h4><button class="link-btn" data-open="${esc(u.id)}">${esc(u.fullName)}</button> ${roleTag(u.role)}</h4>
          <div class="meta">
            <span class="ltr">${esc(u.email)}</span>
            <span class="ltr">${esc(u.phone)}</span>
            ${u.companyName ? `<span>${esc(u.companyName)}</span>` : ''}
            ${u.city ? `<span>${esc(u.city)}</span>` : ''}
            <span>سجّل ${day(u.createdAt)}</span>
            ${u.role === 'contractor' ? `<span>التوثيق: ${esc(L.verification[u.verificationStatus])}</span>` : ''}
          </div>
        </div>
        <div class="row-actions">
          <button class="btn btn--approve" data-act="approve" data-id="${esc(u.id)}">موافقة وتفعيل</button>
          <button class="btn btn--danger" data-act="reject" data-id="${esc(u.id)}">رفض</button>
        </div>
      </div>`).join('')}</div>
      <div class="card" style="margin-top:12px">${pager(res.meta)}</div>`;

    const byId = new Map(res.data.map((u) => [u.id, u]));
    list.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.act, byId.get(b.dataset.id), load)));
    list.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openUser(b.dataset.open, load)));
    list.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { state.page = +b.dataset.page; load(); }));
  };

  $('#f-role', root).addEventListener('change', (e) => { state.role = e.target.value; state.page = 1; load(); });
  await load();
}

/* ---------------- users page ---------------- */

export async function renderUsers(root, params = {}) {
  const state = { q: '', role: params.role || '', status: params.status || '', page: 1 };
  root.innerHTML = `
    <div class="toolbar">
      <div class="filters">
        <input type="search" id="f-q" placeholder="بحث بالاسم أو البريد أو الشركة" />
        <select id="f-role">
          <option value="">كل الأدوار</option>
          ${Object.entries(L.role).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <select id="f-status">
          <option value="">كل الحالات</option>
          ${Object.entries(L.account).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="card"><div class="table-wrap" id="table"></div></div>`;
  $('#f-role', root).value = state.role;
  $('#f-status', root).value = state.status;

  const load = async () => {
    const t = $('#table', root);
    t.innerHTML = loading();
    let res;
    try {
      res = await api('GET', `/admin/users${qs({ q: state.q, role: state.role, status: state.status, page: state.page, limit: 20 })}`);
    } catch (e) {
      t.innerHTML = errorBox(e);
      return;
    }
    if (!res.data.length) {
      t.innerHTML = empty('لا يوجد مستخدمون مطابقون');
      return;
    }
    t.innerHTML = `<table>
      <thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>التوثيق</th><th>التسجيل</th><th class="actions">إجراءات</th></tr></thead>
      <tbody>${res.data.map((u) => `
        <tr>
          <td><button class="link-btn" data-open="${esc(u.id)}">${esc(u.fullName)}</button><span class="sub ltr">${esc(u.email)}</span></td>
          <td>${roleTag(u.role)}</td>
          <td>${pill(u.status, 'account')}</td>
          <td>${u.role === 'contractor' ? pill(u.verificationStatus, 'verification') : '<span class="muted">—</span>'}</td>
          <td class="num">${day(u.createdAt)}</td>
          <td class="actions"><div class="row-actions">${actionButtons(u)}</div></td>
        </tr>`).join('')}</tbody></table>${pager(res.meta)}`;

    const byId = new Map(res.data.map((u) => [u.id, u]));
    t.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => runAction(b.dataset.act, byId.get(b.dataset.id), load)));
    t.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openUser(b.dataset.open, load)));
    t.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { state.page = +b.dataset.page; load(); }));
  };

  $('#f-q', root).addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }));
  $('#f-role', root).addEventListener('change', (e) => { state.role = e.target.value; state.page = 1; load(); });
  $('#f-status', root).addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; load(); });
  await load();
}
