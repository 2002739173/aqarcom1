/**
 * API client for the admin dashboard.
 * The dashboard is served by the backend itself (/dashboard), so the API lives on the same origin.
 * To host the dashboard elsewhere, set window.AQARCOM_API before loading app.js.
 */
const BASE = (window.AQARCOM_API || `${location.origin}/api/v1`).replace(/\/$/, '');
const KEY = 'aqarcom_admin_session';

let session = null;
try {
  session = JSON.parse(sessionStorage.getItem(KEY) || 'null');
} catch (_) {
  session = null;
}
let onExpired = () => {};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function save(s) {
  session = s;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch (_) { /* storage unavailable — keep in memory */ }
}

export const auth = {
  get user() { return session && session.user; },
  get isLoggedIn() { return !!(session && session.accessToken); },
  onSessionExpired(fn) { onExpired = fn; },

  async login(email, password) {
    const data = await raw('POST', '/auth/login', { email, password }, false);
    if (data.user.role !== 'admin') {
      // do not keep a non-admin session around
      await raw('POST', '/auth/logout', { refreshToken: data.refreshToken }, false).catch(() => {});
      throw new ApiError(403, 'NOT_ADMIN', 'هذا الحساب ليس حساب مدير نظام');
    }
    save({ user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.user;
  },

  async logout() {
    if (session) await raw('POST', '/auth/logout', { refreshToken: session.refreshToken }, false).catch(() => {});
    save(null);
  },
};

let refreshing = null;
async function refresh() {
  if (!session || !session.refreshToken) return false;
  if (!refreshing) {
    refreshing = raw('POST', '/auth/refresh', { refreshToken: session.refreshToken }, false)
      .then((d) => {
        save({ user: d.user, accessToken: d.accessToken, refreshToken: d.refreshToken });
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function raw(method, path, body, withAuth = true, { blob = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (withAuth && session) headers.Authorization = `Bearer ${session.accessToken}`;
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (_) {
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم');
  }
  if (blob && res.ok) return res.blob();
  let json = null;
  try { json = await res.json(); } catch (_) { /* non-JSON */ }
  if (!res.ok || !json || json.success === false) {
    const e = (json && json.error) || {};
    throw new ApiError(res.status, e.code || `HTTP_${res.status}`, e.message || `خطأ ${res.status}`, e.details);
  }
  return json.meta ? { data: json.data, meta: json.meta } : json.data;
}

/** Authenticated request with one automatic token refresh on 401. */
export async function api(method, path, body, opts) {
  try {
    return await raw(method, path, body, true, opts);
  } catch (e) {
    if (e.status === 401 && (await refresh())) return raw(method, path, body, true, opts);
    if (e.status === 401) {
      save(null);
      onExpired();
    }
    throw e;
  }
}

/** Build a query string skipping empty values. */
export function qs(params) {
  const p = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
}
