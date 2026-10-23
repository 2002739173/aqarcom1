/** Dashboard entry point — login, hash router, sidebar badges. */
import { auth, api } from './api.js';
import { $, $$, esc, L, toast, closeDrawer, drawerOpen } from './ui.js';
import { renderOverview } from './pages/overview.js';
import { renderApprovals, renderUsers } from './pages/users.js';
import { renderVerifications } from './pages/verifications.js';
import { renderProperties, renderTenders } from './pages/content.js';

const ROUTES = {
  overview: { title: 'نظرة عامة', render: renderOverview },
  approvals: { title: 'طلبات تفعيل الحسابات', render: renderApprovals },
  users: { title: 'إدارة المستخدمين', render: renderUsers },
  verifications: { title: 'التوثيق الهندسي', render: renderVerifications },
  properties: { title: 'الإعلانات العقارية', render: renderProperties },
  tenders: { title: 'المناقصات', render: renderTenders },
};

function parseHash() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  return { name: ROUTES[path] ? path : 'overview', params: Object.fromEntries(new URLSearchParams(query || '')) };
}

async function route() {
  if (!auth.isLoggedIn) return showLogin();
  closeDrawer();
  $('#sidebar').classList.remove('open');
  const { name, params } = parseHash();
  const r = ROUTES[name];
  $('#page-title').textContent = r.title;
  document.title = `${r.title} — عقاركم`;
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const page = $('#page');
  page.innerHTML = '';
  await r.render(page, params);
  page.focus({ preventScroll: true });
}

async function refreshCounts() {
  try {
    const s = await api('GET', '/admin/stats');
    const set = (id, v) => {
      const el = $(id);
      el.hidden = !v;
      el.textContent = v;
    };
    set('#badge-approvals', s.users.pendingApproval);
    set('#badge-verifications', s.users.pendingVerifications);
  } catch (_) { /* ignore */ }
  try {
    const m = await api('GET', '/meta');
    $('#server-time').textContent = `توقيت الخادم: ${new Date(m.serverTime).toLocaleString('ar-SY', { timeStyle: 'short', dateStyle: 'short' })}`;
  } catch (_) { /* ignore */ }
}

function showLogin() {
  $('#app-view').hidden = true;
  $('#login-view').hidden = false;
  $('#login-form input[name=email]').focus();
}

function showApp() {
  const u = auth.user;
  $('#me').innerHTML = `<b>${esc(u.fullName)}</b><span class="ltr">${esc(u.email)}</span>`;
  $('#login-view').hidden = true;
  $('#app-view').hidden = false;
  refreshCounts();
  route();
}

/* ---------- events ---------- */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  $('#login-error').textContent = '';
  btn.disabled = true;
  try {
    await auth.login(f.email.value.trim(), f.password.value);
    f.reset();
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await auth.logout();
  location.hash = '#/overview';
  showLogin();
});

$('#refresh-btn').addEventListener('click', () => { refreshCounts(); route(); });
$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#drawer-backdrop').addEventListener('click', closeDrawer);
document.addEventListener('click', (e) => { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen() && $('#modal').hidden) closeDrawer(); });
document.addEventListener('counts:refresh', refreshCounts);
window.addEventListener('hashchange', route);

auth.onSessionExpired(() => {
  toast('انتهت الجلسة، يرجى تسجيل الدخول من جديد', 'err');
  showLogin();
});

setInterval(() => { if (auth.isLoggedIn) refreshCounts(); }, 60000);

if (auth.isLoggedIn) showApp();
else showLogin();
