/** Overview — aggregate indicators only (FR-28), plus shortcuts to what needs attention. */
import { api } from '../api.js';
import { esc, L, n, errorBox, loading } from '../ui.js';

function bars(obj, labels, color = '') {
  const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<p class="muted small" style="padding:16px 20px;margin:0">لا توجد بيانات بعد.</p>';
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return `<div class="bars">${entries.map(([k, v]) => `
    <div class="bar-row">
      <span>${esc((labels && labels[k]) || k)}</span>
      <div class="bar-track"><div class="bar-fill ${color}" style="width:${Math.max(3, (v / max) * 100)}%"></div></div>
      <span class="num">${n(v)}</span>
    </div>`).join('')}</div>`;
}

export async function renderOverview(root) {
  root.innerHTML = loading();
  let s;
  try {
    s = await api('GET', '/admin/stats');
  } catch (e) {
    root.innerHTML = errorBox(e);
    return;
  }
  const activeProps = (s.properties.byStatus && s.properties.byStatus.active) || 0;
  const openTenders = (s.tenders.byStatus && s.tenders.byStatus.open) || 0;

  root.innerHTML = `
    <div class="grid grid-4">
      <div class="card stat ${s.users.pendingApproval ? 'stat--alert' : ''}">
        <span class="stat-label">حسابات بانتظار الموافقة</span>
        <span class="stat-value">${n(s.users.pendingApproval)}</span>
        <a href="#/approvals">مراجعة الطلبات ←</a>
      </div>
      <div class="card stat ${s.users.pendingVerifications ? 'stat--alert' : ''}">
        <span class="stat-label">طلبات توثيق هندسي معلّقة</span>
        <span class="stat-value">${n(s.users.pendingVerifications)}</span>
        <a href="#/verifications">مراجعة الوثائق ←</a>
      </div>
      <div class="card stat">
        <span class="stat-label">المستخدمون</span>
        <span class="stat-value">${n(s.users.total)}</span>
        <span class="stat-foot">${n(s.users.newLast30Days)} جديد خلال 30 يوماً</span>
      </div>
      <div class="card stat">
        <span class="stat-label">العروض المقدَّمة</span>
        <span class="stat-value">${n(s.bids.total)}</span>
        <span class="stat-foot">${n(s.bids.active)} فعّال · ${n(s.bids.withdrawn)} مسحوب · متوسط ${n(s.bids.averageActivePerTender)} لكل مناقصة</span>
      </div>
    </div>

    <div class="grid grid-4" style="margin-top:16px">
      <div class="card stat"><span class="stat-label">إعلانات ظاهرة</span><span class="stat-value">${n(activeProps)}</span><span class="stat-foot">من أصل ${n(s.properties.total)}</span></div>
      <div class="card stat"><span class="stat-label">مناقصات مفتوحة</span><span class="stat-value">${n(openTenders)}</span><span class="stat-foot">من أصل ${n(s.tenders.total)}</span></div>
      <div class="card stat"><span class="stat-label">فرز بخدمة WSM</span><span class="stat-value">${n((s.tenders.evaluationsByEngine || {}).wsm || 0)}</span><span class="stat-foot">خدمة Python</span></div>
      <div class="card stat"><span class="stat-label">فرز بالمقيّم الاحتياطي</span><span class="stat-value">${n((s.tenders.evaluationsByEngine || {}).fallback || 0)}</span><span class="stat-foot">عند تعذّر خدمة الفرز</span></div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h3>المستخدمون حسب الدور</h3></div>${bars(s.users.byRole, L.role)}</div>
      <div class="card"><div class="card-head"><h3>المستخدمون حسب حالة الحساب</h3></div>${bars(s.users.byStatus, L.account, 'gold')}</div>
      <div class="card"><div class="card-head"><h3>المناقصات حسب الحالة</h3></div>${bars(s.tenders.byStatus, L.tender)}</div>
      <div class="card"><div class="card-head"><h3>الإعلانات الظاهرة حسب الغرض</h3></div>${bars(s.properties.activeByPurpose, L.purpose, 'emerald')}</div>
      <div class="card"><div class="card-head"><h3>الإعلانات الظاهرة حسب النوع</h3></div>${bars(s.properties.activeByType, L.propertyType, 'emerald')}</div>
      <div class="card"><div class="card-head"><h3>المتعهدون حسب التوثيق</h3></div>${bars(s.users.contractorsByVerification, L.verification, 'gold')}</div>
    </div>
    <p class="muted small" style="margin-top:14px">مؤشرات تجميعية فقط دون بيانات شخصية (FR-28). آخر تحديث: ${new Date(s.generatedAt).toLocaleString('ar-SY')}</p>`;
}
