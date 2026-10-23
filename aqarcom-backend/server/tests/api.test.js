/**
 * End-to-end API tests mapped to the SRS acceptance cases (TC-01 → TC-14).
 * Requires a running MongoDB (MONGO_URI_TEST) and, optionally, the scoring service (SCORING_SERVICE_URL).
 */
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';
process.env.STORAGE_DIR = require('path').join(__dirname, '.storage');
process.env.BCRYPT_ROUNDS = '10';

const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const fileStore = require('../src/utils/fileStore');
const { Tender, User, Bid } = require('../src/models');
const lifecycle = require('../src/services/lifecycle.service');
const evaluator = require('../src/services/evaluation/evaluator');
const { RemoteWsmEngine } = require('../src/services/evaluation/engines');
const mail = require('../src/services/mail.service');

const MONGO = process.env.MONGO_URI_TEST || 'mongodb://127.0.0.1:27017/aqarcom_test';
const API = '/api/v1';
const PDF = Buffer.from('%PDF-1.4\n% AqarCom test spec book\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c70000000049454e44ae426082', 'hex');

jest.setTimeout(60000);

const users = {};
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

async function register(role, extra = {}, opts = {}) {
  const email = `${role}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@test.sy`;
  const res = await request(app)
    .post(`${API}/auth/register`)
    .send({ fullName: `Test ${role}`, email, phone: '+963944000111', password: 'Passw0rd!', role, ...extra });
  expect(res.status).toBe(201);
  const u = { ...res.body.data.user, token: res.body.data.accessToken, refreshToken: res.body.data.refreshToken, email };
  if (users.admin && !opts.keepPending && role !== 'user') {
    expect(u.status).toBe('pending');
    const a = await request(app).post(`${API}/admin/users/${u.id}/approve`).set(auth(users.admin)).send({});
    expect(a.status).toBe(200);
    u.status = 'active';
  }
  return u;
}

async function makeAdmin() {
  const u = await register('user');
  await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(u.id) }, { $set: { role: 'admin' } });
  return u;
}

async function verifyContractor(c) {
  const sub = await request(app)
    .post(`${API}/verification`)
    .set(auth(c))
    .attach('engineers_syndicate', PDF, { filename: 'cert.pdf', contentType: 'application/pdf' });
  expect(sub.status).toBe(201);
  const dec = await request(app)
    .post(`${API}/admin/verifications/${sub.body.data.id}/decision`)
    .set(auth(users.admin))
    .send({ decision: 'approve' });
  expect(dec.status).toBe(200);
}

async function createOpenTender(owner, weights = { priceWeight: 60, durationWeight: 40 }) {
  const t = await request(app)
    .post(`${API}/tenders`)
    .set(auth(owner))
    .send({ title: 'إكساء شقة في المزة', tenderType: 'finishing', city: 'دمشق', deadline: new Date(Date.now() + 3600e3).toISOString(), ...weights });
  expect(t.status).toBe(201);
  const d = await request(app).post(`${API}/tenders/${t.body.data.id}/documents`).set(auth(owner)).attach('file', PDF, { filename: 'spec.pdf', contentType: 'application/pdf' });
  expect(d.status).toBe(201);
  const p = await request(app).post(`${API}/tenders/${t.body.data.id}/publish`).set(auth(owner));
  expect(p.status).toBe(200);
  return p.body.data;
}

const expireDeadline = (id) => Tender.updateOne({ _id: id }, { deadline: new Date(Date.now() - 1000) });

beforeAll(async () => {
  await mongoose.connect(MONGO);
  await mongoose.connection.db.dropDatabase();
  await fileStore.ensureDirs();
  users.admin = await makeAdmin();
  users.owner = await register('project_owner');
  users.owner2 = await register('project_owner');
  users.landlord = await register('property_owner');
  users.seeker = await register('user');
  users.c1 = await register('contractor', { companyName: 'شركة البناء الأولى' });
  users.c2 = await register('contractor', { companyName: 'شركة الإكساء' });
  users.c3 = await register('contractor', { companyName: 'مكتب هندسي' });
  users.pending = await register('contractor', { companyName: 'قيد المراجعة' });
  await verifyContractor(users.c1);
  await verifyContractor(users.c2);
  await verifyContractor(users.c3);
});

afterAll(async () => {
  await mongoose.disconnect();
  require('fs').rmSync(process.env.STORAGE_DIR, { recursive: true, force: true });
});

describe('Auth (FR-01 → FR-04)', () => {
  test('password is stored as bcrypt hash, never returned (NFR-02)', async () => {
    const raw = await User.collection.findOne({ email: users.seeker.email });
    expect(raw.passwordHash).toMatch(/^\$2[aby]\$1\d\$/);
    expect(JSON.stringify(users.seeker)).not.toContain('passwordHash');
  });

  test('admin role cannot be self-registered', async () => {
    const r = await request(app).post(`${API}/auth/register`).send({ fullName: 'x', email: 'x@x.sy', phone: '+963944000111', password: 'Passw0rd!', role: 'admin' });
    expect(r.status).toBe(400);
  });

  test('missing / invalid token → 401, wrong role → 403 (FR-02)', async () => {
    expect((await request(app).get(`${API}/auth/me`)).status).toBe(401);
    expect((await request(app).get(`${API}/auth/me`).set({ Authorization: 'Bearer abc' })).status).toBe(401);
    expect((await request(app).get(`${API}/tenders`).set(auth(users.seeker))).status).toBe(403); // NFR-04
  });

  test('refresh token rotation', async () => {
    const r = await request(app).post(`${API}/auth/refresh`).send({ refreshToken: users.seeker.refreshToken });
    expect(r.status).toBe(200);
    const again = await request(app).post(`${API}/auth/refresh`).send({ refreshToken: users.seeker.refreshToken });
    expect(again.status).toBe(401);
    users.seeker.token = r.body.data.accessToken;
  });

  test('password reset by one-time code (FR-03)', async () => {
    const u = await register('user');
    const f = await request(app).post(`${API}/auth/forgot-password`).send({ email: u.email });
    expect(f.status).toBe(200);
    const code = mail._lastDevMail().text.match(/\d{6}/)[0];
    expect((await request(app).post(`${API}/auth/reset-password`).send({ email: u.email, code: '000000', newPassword: 'NewPassw0rd' })).status).toBe(400);
    expect((await request(app).post(`${API}/auth/reset-password`).send({ email: u.email, code, newPassword: 'NewPassw0rd' })).status).toBe(200);
    // one-time: second use fails
    expect((await request(app).post(`${API}/auth/reset-password`).send({ email: u.email, code, newPassword: 'NewPassw0rd2' })).status).toBe(400);
    expect((await request(app).post(`${API}/auth/login`).send({ email: u.email, password: 'NewPassw0rd' })).status).toBe(200);
  });

  test('TC-14 — too many failed logins → temporary lock, generic message', async () => {
    const u = await register('user');
    const bad = await request(app).post(`${API}/auth/login`).send({ email: u.email, password: 'wrong' });
    const unknown = await request(app).post(`${API}/auth/login`).send({ email: 'nobody@test.sy', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message); // does not reveal which field is wrong
    let last;
    for (let i = 0; i < 4; i++) last = await request(app).post(`${API}/auth/login`).send({ email: u.email, password: 'wrong' });
    expect(last.status).toBe(423);
    const correct = await request(app).post(`${API}/auth/login`).send({ email: u.email, password: 'Passw0rd!' });
    expect(correct.status).toBe(423); // still locked even with the right password
    const notes = await request(app).get(`${API}/notifications`).set(auth(u));
    expect(notes.body.data.some((n) => n.type === 'account_locked')).toBe(true);
  });
});

describe('Account approval from the dashboard only', () => {
  test('privileged account starts pending and has no privileges until approved', async () => {
    const u = await register('property_owner', {}, { keepPending: true });
    expect(u.status).toBe('pending');
    const body = { title: 'شقة', propertyType: 'apartment', purpose: 'sale', price: 1, area: 50, city: 'دمشق', latitude: 33.5, longitude: 36.3 };
    const blocked = await request(app).post(`${API}/properties`).set(auth(u)).send(body);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
    expect((await request(app).post(`${API}/admin/users/${u.id}/approve`).set(auth(users.landlord)).send({})).status).toBe(403);
    const ok = await request(app).post(`${API}/admin/users/${u.id}/approve`).set(auth(users.admin)).send({});
    expect(ok.body.data.status).toBe('active');
    expect((await request(app).post(`${API}/properties`).set(auth(u)).send(body)).status).toBe(201);
    const n = await request(app).get(`${API}/notifications`).set(auth(u));
    expect(n.body.data.some((x) => x.type === 'account_approved')).toBe(true);
  });

  test('individual users are active immediately', async () => {
    const u = await register('user');
    expect(u.status).toBe('active');
  });

  test('pending contractor can still upload verification documents', async () => {
    const c = await register('contractor', { companyName: 'x' }, { keepPending: true });
    const r = await request(app).post(`${API}/verification`).set(auth(c)).attach('engineers_syndicate', PDF, { filename: 'c.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(201);
  });

  test('reject requires reason, blocks login; suspend / reactivate; invalid transitions', async () => {
    const u = await register('project_owner', {}, { keepPending: true });
    expect((await request(app).post(`${API}/admin/users/${u.id}/reject`).set(auth(users.admin)).send({})).status).toBe(400);
    expect((await request(app).post(`${API}/admin/users/${u.id}/reject`).set(auth(users.admin)).send({ reason: 'بيانات غير مكتملة' })).status).toBe(200);
    const login = await request(app).post(`${API}/auth/login`).send({ email: u.email, password: 'Passw0rd!' });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_REJECTED');
    expect((await request(app).post(`${API}/admin/users/${u.id}/reactivate`).set(auth(users.admin)).send({})).status).toBe(409);

    const v = await register('property_owner');
    expect((await request(app).post(`${API}/admin/users/${v.id}/suspend`).set(auth(users.admin)).send({ reason: 'مخالفة' })).status).toBe(200);
    expect((await request(app).get(`${API}/auth/me`).set(auth(v))).body.error.code).toBe('ACCOUNT_SUSPENDED');
    expect((await request(app).post(`${API}/admin/users/${v.id}/reactivate`).set(auth(users.admin)).send({})).status).toBe(200);
    const d = await request(app).get(`${API}/admin/users/${v.id}`).set(auth(users.admin));
    expect(d.body.data.history.map((h) => h.action)).toEqual(['unsuspend', 'suspend', 'approve']);
  });

  test('admin changes a role', async () => {
    const u = await register('user');
    const r = await request(app).post(`${API}/admin/users/${u.id}/role`).set(auth(users.admin)).send({ role: 'property_owner', reason: 'طلب المستخدم' });
    expect(r.status).toBe(200);
    expect(r.body.data.role).toBe('property_owner');
    expect((await request(app).post(`${API}/admin/users/${u.id}/role`).set(auth(users.admin)).send({ role: 'admin', reason: 'xxx' })).status).toBe(400);
  });
});

describe('Properties (FR-05 → FR-09, FR-25, FR-27)', () => {
  let prop;
  test('publish requires a location (BR-04)', async () => {
    const r = await request(app).post(`${API}/properties`).set(auth(users.landlord)).send({ title: 'شقة', propertyType: 'apartment', purpose: 'sale', price: 50000, area: 120, city: 'دمشق' });
    expect(r.status).toBe(400);
  });

  test('owner publishes a listing with images', async () => {
    const r = await request(app)
      .post(`${API}/properties`)
      .set(auth(users.landlord))
      .send({ title: 'شقة مفروشة في المالكي', propertyType: 'apartment', purpose: 'rent', price: 400, currency: 'USD', area: 140, rooms: 3, city: 'دمشق', latitude: 33.5138, longitude: 36.2765 });
    expect(r.status).toBe(201);
    prop = r.body.data;
    expect(prop.latitude).toBeCloseTo(33.5138);
    const img = await request(app).post(`${API}/properties/${prop.id}/images`).set(auth(users.landlord)).attach('images', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(img.status).toBe(200);
    expect(img.body.data.images).toHaveLength(1);
  });

  test('only owner or admin may edit (BR-03)', async () => {
    const other = await register('property_owner');
    expect((await request(app).patch(`${API}/properties/${prop.id}`).set(auth(other)).send({ price: 1 })).status).toBe(403);
    expect((await request(app).patch(`${API}/properties/${prop.id}`).set(auth(users.landlord)).send({ price: 450 })).status).toBe(200);
  });

  test('individual user cannot publish listings', async () => {
    expect((await request(app).post(`${API}/properties`).set(auth(users.seeker)).send({})).status).toBe(403);
  });

  test('TC-09 — visitor sees details without owner phone', async () => {
    const pub = await request(app).get(`${API}/properties/${prop.id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.contactLocked).toBe(true);
    expect(pub.body.data.owner.phone).toBeUndefined();
    expect((await request(app).get(`${API}/properties/${prop.id}/contact`)).status).toBe(401);
    const signed = await request(app).get(`${API}/properties/${prop.id}`).set(auth(users.seeker));
    expect(signed.body.data.owner.phone).toBe('+963944000111');
    const c = await request(app).get(`${API}/properties/${prop.id}/contact`).set(auth(users.seeker));
    expect(c.body.data.whatsappUrl).toMatch(/^https:\/\/wa\.me\/963944000111/);
  });

  test('search with filters and sorting (FR-08)', async () => {
    await request(app).post(`${API}/properties`).set(auth(users.landlord)).send({ title: 'أرض زراعية', propertyType: 'land', purpose: 'sale', price: 90000, area: 2000, city: 'ريف دمشق', latitude: 33.6, longitude: 36.4 });
    const r = await request(app).get(`${API}/properties`).query({ city: 'دمشق', minRooms: 2, maxPrice: 1000, sort: 'price_asc' });
    expect(r.status).toBe(200);
    expect(r.body.data.map((p) => p.id)).toContain(prop.id);
    expect(r.body.meta.total).toBe(1);
  });

  test('favorites (FR-09)', async () => {
    expect((await request(app).post(`${API}/properties/${prop.id}/favorite`).set(auth(users.seeker))).status).toBe(200);
    const f = await request(app).get(`${API}/properties/favorites`).set(auth(users.seeker));
    expect(f.body.data[0].id).toBe(prop.id);
    expect(f.body.data[0].isFavorite).toBe(true);
  });

  test('TC-10 — admin hides a listing: gone from search, record kept, owner notified', async () => {
    const m = await request(app).post(`${API}/admin/properties/${prop.id}/moderate`).set(auth(users.admin)).send({ action: 'hide', reason: 'صور مخالفة' });
    expect(m.status).toBe(200);
    const s = await request(app).get(`${API}/properties`).query({ city: 'دمشق' });
    expect(s.body.data.map((p) => p.id)).not.toContain(prop.id);
    expect((await request(app).get(`${API}/properties/${prop.id}`)).status).toBe(404);
    expect((await request(app).get(`${API}/properties/${prop.id}`).set(auth(users.landlord))).status).toBe(200); // record kept
    const n = await request(app).get(`${API}/notifications`).set(auth(users.landlord));
    expect(n.body.data[0].type).toBe('content_hidden');
    expect(n.body.data[0].body).toContain('صور مخالفة');
  });

  test('soft delete (FR-06 / CN-08)', async () => {
    const r = await request(app).post(`${API}/properties`).set(auth(users.landlord)).send({ title: 'محل تجاري', propertyType: 'shop', purpose: 'rent', price: 200, area: 40, city: 'حلب', latitude: 36.2, longitude: 37.15 });
    expect((await request(app).delete(`${API}/properties/${r.body.data.id}`).set(auth(users.landlord))).status).toBe(200);
    const raw = await mongoose.connection.db.collection('properties').findOne({ _id: new mongoose.Types.ObjectId(r.body.data.id) });
    expect(raw.status).toBe('deleted');
  });
});

describe('Tenders, bids, evaluation (FR-10 → FR-24)', () => {
  test('TC-03 — weights must sum to 100 (BR-07)', async () => {
    const r = await request(app)
      .post(`${API}/tenders`)
      .set(auth(users.owner))
      .send({ title: 'عمار بناء', tenderType: 'construction', priceWeight: 70, durationWeight: 40, deadline: new Date(Date.now() + 3600e3).toISOString() });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('WEIGHTS_INVALID');
    expect(r.body.error.details.suggestion).toEqual({ priceWeight: 70, durationWeight: 30 });
  });

  test('TC-11 — spec book over 20 MB is rejected with limit & formats', async () => {
    const t = await request(app).post(`${API}/tenders`).set(auth(users.owner)).send({ title: 'مناقصة كبيرة', tenderType: 'construction', priceWeight: 50, durationWeight: 50, deadline: new Date(Date.now() + 3600e3).toISOString() });
    const big = Buffer.concat([PDF, Buffer.alloc(25 * 1024 * 1024)]);
    const r = await request(app).post(`${API}/tenders/${t.body.data.id}/documents`).set(auth(users.owner)).attach('file', big, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(413);
    expect(r.body.error.message).toContain('20');
    expect(r.body.error.message).toContain('PDF');
    const txt = await request(app).post(`${API}/tenders/${t.body.data.id}/documents`).set(auth(users.owner)).attach('file', Buffer.from('hello'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(txt.status).toBe(415);
    // cannot publish without a spec book
    expect((await request(app).post(`${API}/tenders/${t.body.data.id}/publish`).set(auth(users.owner))).body.error.code).toBe('DOCUMENT_REQUIRED');
  });

  test('resumable chunked upload (NFR-01)', async () => {
    const t = await request(app).post(`${API}/tenders`).set(auth(users.owner)).send({ title: 'رفع مجزأ', tenderType: 'construction', priceWeight: 50, durationWeight: 50, deadline: new Date(Date.now() + 3600e3).toISOString() });
    const file = Buffer.concat([PDF, Buffer.alloc(300 * 1024, 7)]);
    const chunkSize = 128 * 1024;
    const init = await request(app).post(`${API}/uploads`).set(auth(users.owner)).send({ fileName: 'دفتر.pdf', mimeType: 'application/pdf', totalSize: file.length, chunkSize });
    expect(init.status).toBe(201);
    const id = init.body.data.id;
    const n = init.body.data.totalChunks;
    // upload chunks out of order, skip the 2nd one ("connection lost")
    for (const i of [0, 2]) {
      const r = await request(app).put(`${API}/uploads/${id}/chunks/${i}`).set(auth(users.owner)).set('Content-Type', 'application/octet-stream').send(file.subarray(i * chunkSize, (i + 1) * chunkSize));
      expect(r.status).toBe(200);
    }
    const st = await request(app).get(`${API}/uploads/${id}`).set(auth(users.owner));
    expect(st.body.data.missingChunks).toEqual([1]);
    await request(app).put(`${API}/uploads/${id}/chunks/1`).set(auth(users.owner)).set('Content-Type', 'application/octet-stream').send(file.subarray(chunkSize, 2 * chunkSize));
    expect(n).toBe(3);
    const done = await request(app).post(`${API}/tenders/${t.body.data.id}/documents`).set(auth(users.owner)).send({ uploadId: id });
    expect(done.status).toBe(201);
    expect(done.body.data.version).toBe(1);
    const dl = await request(app).get(`${API}/tenders/${t.body.data.id}/documents/latest/download`).set(auth(users.owner)).buffer(true).parse((res, cb) => {
      const parts = [];
      res.on('data', (c) => parts.push(c));
      res.on('end', () => cb(null, Buffer.concat(parts)));
    });
    expect(Buffer.compare(dl.body, file)).toBe(0); // decrypted file equals the original
  });

  test('TC-01 — unverified contractor cannot bid', async () => {
    const t = await createOpenTender(users.owner);
    const r = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.pending)).send({ totalPrice: 1000, durationDays: 30 });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('CONTRACTOR_NOT_VERIFIED');
    expect(r.body.error.details.redirect).toBe('verification');
    expect(await Bid.countDocuments({ contractor: users.pending.id })).toBe(0);
  });

  test('FR-24 — rejection requires a reason and notifies the contractor', async () => {
    const sub = await request(app).post(`${API}/verification`).set(auth(users.pending)).attach('commercial_register', PNG, { filename: 'reg.png', contentType: 'image/png' });
    expect(sub.status).toBe(201);
    expect((await request(app).post(`${API}/admin/verifications/${sub.body.data.id}/decision`).set(auth(users.admin)).send({ decision: 'reject' })).status).toBe(400);
    const ok = await request(app).post(`${API}/admin/verifications/${sub.body.data.id}/decision`).set(auth(users.admin)).send({ decision: 'reject', reason: 'الوثيقة غير واضحة' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.reviewedBy).toBeDefined();
    const me = await request(app).get(`${API}/verification/me`).set(auth(users.pending));
    expect(me.body.data.verificationStatus).toBe('rejected');
  });

  test('full cycle: bids → TC-02 cut-off → WSM shortlist → TC-08 → award → TC-13', async () => {
    const t = await createOpenTender(users.owner, { priceWeight: 60, durationWeight: 40 });
    const b1 = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 100000, durationDays: 120 });
    const b2 = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c2)).send({ totalPrice: 80000, durationDays: 150 });
    const b3 = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c3)).send({ totalPrice: 120000, durationDays: 90 });
    [b1, b2, b3].forEach((b) => expect(b.status).toBe(201));

    // duplicate bid rejected; BR-12 contractor cannot see competitors
    expect((await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 1, durationDays: 1 })).status).toBe(409);
    const view = await request(app).get(`${API}/tenders/${t.id}`).set(auth(users.c1));
    expect(view.body.data.activeBidsCount).toBeUndefined();
    expect(view.body.data.myBid.totalPrice).toBe(100000);
    expect((await request(app).get(`${API}/tenders/${t.id}/bids`).set(auth(users.c1))).status).toBe(403);
    // FR-26 owner notified
    const notes = await request(app).get(`${API}/notifications`).set(auth(users.owner));
    expect(notes.body.data.filter((n) => n.type === 'new_bid' && n.data.tenderId === t.id)).toHaveLength(3);
    // owner cannot see bid contents before closing
    const early = await request(app).get(`${API}/tenders/${t.id}/bids`).set(auth(users.owner));
    expect(early.body.data.visible).toBe(false);
    expect(early.body.data.activeBidsCount).toBe(3);

    // TC-02 — after server-time deadline nothing can be submitted / changed / withdrawn
    await expireDeadline(t.id);
    const late = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.pending)).send({ totalPrice: 1, durationDays: 1 });
    expect(late.status).toBe(403); // unverified anyway
    const lateEdit = await request(app).patch(`${API}/bids/${b1.body.data.id}`).set(auth(users.c1)).send({ totalPrice: 50 });
    expect(lateEdit.status).toBe(409);
    expect(lateEdit.body.error.code).toBe('TENDER_CLOSED');
    expect((await request(app).post(`${API}/bids/${b1.body.data.id}/withdraw`).set(auth(users.c1))).status).toBe(409);

    // the late attempt closed & evaluated the tender lazily
    const sl = await request(app).get(`${API}/tenders/${t.id}/shortlist`).set(auth(users.owner));
    expect(sl.status).toBe(200);
    expect(sl.body.data.results.map((r) => r.bidId)).toEqual([b2.body.data.id, b3.body.data.id, b1.body.data.id]); // .84, .80, .78
    expect(sl.body.data.results[0].score).toBeCloseTo(0.84, 9);
    expect(sl.body.data.weights).toEqual({ price: 60, duration: 40 });
    expect(['wsm', 'fallback']).toContain(sl.body.data.engine);

    // TC-08 — another project owner gets 403 despite having the right role
    expect((await request(app).get(`${API}/tenders/${t.id}/shortlist`).set(auth(users.owner2))).status).toBe(403);

    // award only from shortlist (BR-18)
    expect((await request(app).post(`${API}/tenders/${t.id}/award`).set(auth(users.owner)).send({ bidId: new mongoose.Types.ObjectId().toString() })).status).toBe(400);
    const aw = await request(app).post(`${API}/tenders/${t.id}/award`).set(auth(users.owner)).send({ bidId: b2.body.data.id });
    expect(aw.status).toBe(200);
    expect(aw.body.data.status).toBe('awarded');
    // TC-13 — second award refused
    const aw2 = await request(app).post(`${API}/tenders/${t.id}/award`).set(auth(users.owner)).send({ bidId: b1.body.data.id });
    expect(aw2.status).toBe(409);
    // FR-21 — winner + losers notified
    const w = await request(app).get(`${API}/notifications`).set(auth(users.c2));
    expect(w.body.data.some((n) => n.type === 'bid_won')).toBe(true);
    const l = await request(app).get(`${API}/notifications`).set(auth(users.c1));
    expect(l.body.data.some((n) => n.type === 'bid_lost')).toBe(true);
  });

  test('TC-04 — extension allowed once, never shorter', async () => {
    const t = await createOpenTender(users.owner);
    const shorter = await request(app).post(`${API}/tenders/${t.id}/extend`).set(auth(users.owner)).send({ deadline: new Date(Date.now() + 60e3).toISOString() });
    expect(shorter.status).toBe(400);
    const ok = await request(app).post(`${API}/tenders/${t.id}/extend`).set(auth(users.owner)).send({ deadline: new Date(Date.now() + 7200e3).toISOString() });
    expect(ok.status).toBe(200);
    expect(ok.body.data.extensionUsed).toBe(true);
    const again = await request(app).post(`${API}/tenders/${t.id}/extend`).set(auth(users.owner)).send({ deadline: new Date(Date.now() + 9000e3).toISOString() });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('EXTENSION_ALREADY_USED');
  });

  test('TC-05 — scoring service down → fallback engine labelled "fallback"', async () => {
    evaluator.setEngines({ primary: new RemoteWsmEngine({ url: 'http://127.0.0.1:1', timeoutMs: 500 }) });
    const t = await createOpenTender(users.owner, { priceWeight: 30, durationWeight: 70 });
    await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 500, durationDays: 10 });
    await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c2)).send({ totalPrice: 400, durationDays: 20 });
    await expireDeadline(t.id);
    await lifecycle.runScheduledTick();
    const sl = await request(app).get(`${API}/tenders/${t.id}/shortlist`).set(auth(users.owner));
    expect(sl.body.data.status).toBe('shortlist_ready');
    expect(sl.body.data.engine).toBe('fallback');
    expect(sl.body.data.results.every((r) => r.engine === 'fallback')).toBe(true);
    // c1: .3*.8 + .7*1 = .94 ; c2: .3*1 + .7*.5 = .65
    expect(sl.body.data.results[0].score).toBeCloseTo(0.94, 9);
    evaluator.setEngines({ primary: new RemoteWsmEngine() });
  });

  test('TC-06 — no bids → closed_no_bids without evaluating, owner notified', async () => {
    const t = await createOpenTender(users.owner);
    await expireDeadline(t.id);
    await lifecycle.runScheduledTick();
    const r = await request(app).get(`${API}/tenders/${t.id}`).set(auth(users.owner));
    expect(r.body.data.status).toBe('closed_no_bids');
    expect(r.body.data.evaluation && r.body.data.evaluation.engine).toBeFalsy();
    const n = await request(app).get(`${API}/notifications`).set(auth(users.owner));
    expect(n.body.data.some((x) => x.type === 'tender_closed_no_bids' && x.data.tenderId === t.id)).toBe(true);
  });

  test('TC-07 — ties: lower price first, then earliest submission (BR-19)', async () => {
    const t = await createOpenTender(users.owner, { priceWeight: 50, durationWeight: 50 });
    const a = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 200, durationDays: 100 });
    const b = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c2)).send({ totalPrice: 100, durationDays: 200 });
    const c = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c3)).send({ totalPrice: 100, durationDays: 200 });
    await expireDeadline(t.id);
    await lifecycle.runScheduledTick();
    const sl = await request(app).get(`${API}/tenders/${t.id}/shortlist`).set(auth(users.owner));
    expect(sl.body.data.results.map((r) => r.bidId)).toEqual([b.body.data.id, c.body.data.id, a.body.data.id]);
  });

  test('FR-16 — withdrawn bid is kept and excluded from scoring', async () => {
    const t = await createOpenTender(users.owner);
    const a = await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 10, durationDays: 10 });
    await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c2)).send({ totalPrice: 20, durationDays: 20 });
    const w = await request(app).post(`${API}/bids/${a.body.data.id}/withdraw`).set(auth(users.c1));
    expect(w.status).toBe(200);
    expect(w.body.data.isWithdrawn).toBe(true);
    await expireDeadline(t.id);
    await lifecycle.runScheduledTick();
    const sl = await request(app).get(`${API}/tenders/${t.id}/shortlist`).set(auth(users.owner));
    expect(sl.body.data.results).toHaveLength(1);
    expect(await Bid.countDocuments({ _id: a.body.data.id })).toBe(1);
  });

  test('TC-12 — new spec book version keeps old one and notifies viewers', async () => {
    const t = await createOpenTender(users.owner);
    await request(app).get(`${API}/tenders/${t.id}/documents/latest/download`).set(auth(users.c3));
    const v2 = await request(app).post(`${API}/tenders/${t.id}/documents`).set(auth(users.owner)).field('note', 'تعديل البند 4').attach('file', PDF, { filename: 'spec-v2.pdf', contentType: 'application/pdf' });
    expect(v2.status).toBe(201);
    expect(v2.body.data.version).toBe(2);
    const list = await request(app).get(`${API}/tenders/${t.id}/documents`).set(auth(users.c3));
    expect(list.body.data.map((d) => d.version)).toEqual([2, 1]);
    const n = await request(app).get(`${API}/notifications`).set(auth(users.c3));
    expect(n.body.data.some((x) => x.type === 'tender_document_updated' && x.data.version === 2)).toBe(true);
  });

  test('weights frozen once bids exist (BR-08)', async () => {
    const t = await createOpenTender(users.owner);
    await request(app).post(`${API}/tenders/${t.id}/bids`).set(auth(users.c1)).send({ totalPrice: 10, durationDays: 10 });
    const r = await request(app).patch(`${API}/tenders/${t.id}`).set(auth(users.owner)).send({ priceWeight: 10, durationWeight: 90 });
    expect(r.status).toBe(409);
  });
});

describe('Admin (FR-28)', () => {
  test('stats are aggregate only', async () => {
    const r = await request(app).get(`${API}/admin/stats`).set(auth(users.admin));
    expect(r.status).toBe(200);
    expect(r.body.data.users.total).toBeGreaterThan(5);
    expect(JSON.stringify(r.body.data)).not.toMatch(/@test\.sy/);
    expect((await request(app).get(`${API}/admin/stats`).set(auth(users.owner))).status).toBe(403);
  });
});
