/**
 * Property module — FR-05 (publish), FR-06 (edit / soft delete, owner or admin only — BR-03),
 * FR-07 (coordinates + map pins — BR-04), FR-08 (search, filters, sorting), FR-09 (favorites),
 * FR-25 / BR-05 (owner phone only for signed-in users), BR-06 (hidden content excluded).
 */
const mongoose = require('mongoose');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const fileStore = require('../utils/fileStore');
const { Property, Favorite } = require('../models');
const { ROLES, CONTENT_STATUS, ALLOWED_IMAGE_MIME } = require('../config/constants');

const PUBLIC_IMAGE_PREFIX = '/files/';
const oid = (id) => new mongoose.Types.ObjectId(String(id));

const isOwnerOrAdmin = (property, user) =>
  user && (user.role === ROLES.ADMIN || String(property.owner._id || property.owner) === String(user._id));

/** Shape a property for the API. Adds flat lat/lng, owner contact (BR-05), favorite flag. */
function present(p, { viewer, isFavorite = false } = {}) {
  const o = typeof p.toJSON === 'function' ? p.toJSON() : { ...p, id: String(p._id) };
  delete o._id;
  delete o.__v;
  const [lng, lat] = (o.location && o.location.coordinates) || [];
  o.latitude = lat;
  o.longitude = lng;
  o.images = (o.media || []).filter((m) => m.kind === 'image').sort((a, b) => a.order - b.order).map((m) => ({ id: String(m._id || m.id), url: env.publicBaseUrl + m.url }));
  o.thumbnailUrl = o.images[0] ? o.images[0].url : null;
  (o.media || []).forEach((m) => {
    m.id = String(m._id || m.id);
    delete m._id;
    delete m.path;
    if (m.url && m.url.startsWith('/')) m.url = env.publicBaseUrl + m.url;
  });

  const ownerDoc = o.owner && typeof o.owner === 'object' ? o.owner : null;
  const ownerId = ownerDoc ? String(ownerDoc.id || ownerDoc._id) : String(o.owner);
  if (viewer) {
    // BR-05: phone & WhatsApp only for signed-in users → app builds tel: / wa.me links (FR-25)
    o.owner = ownerDoc
      ? { id: ownerId, fullName: ownerDoc.fullName, phone: ownerDoc.phone, whatsapp: ownerDoc.whatsapp || ownerDoc.phone }
      : { id: ownerId };
    o.contactLocked = false;
  } else {
    o.owner = ownerDoc ? { id: ownerId, fullName: ownerDoc.fullName } : { id: ownerId };
    o.contactLocked = true;
  }
  o.isFavorite = !!isFavorite;
  o.isMine = !!viewer && String(viewer._id) === ownerId;
  if (!(viewer && (viewer.role === ROLES.ADMIN || o.isMine))) {
    delete o.moderation;
    delete o.deletedBy;
  }
  return o;
}

function toLocation({ latitude, longitude }) {
  if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
    // BR-04 — no listing without a geographic location
    throw ApiError.badRequest('LOCATION_REQUIRED', 'يجب تحديد موقع العقار على الخريطة قبل النشر', {
      fields: [{ field: 'latitude' }, { field: 'longitude' }],
    });
  }
  return { type: 'Point', coordinates: [Number(longitude), Number(latitude)] };
}

async function create(user, data) {
  const { latitude, longitude, ...rest } = data;
  return Property.create({ ...rest, owner: user._id, location: toLocation({ latitude, longitude }) });
}

async function loadEditable(id, user) {
  const p = await Property.findById(id);
  if (!p || p.status === CONTENT_STATUS.DELETED) throw ApiError.notFound('PROPERTY_NOT_FOUND', 'الإعلان غير موجود');
  if (!isOwnerOrAdmin(p, user)) throw ApiError.forbidden('NOT_PROPERTY_OWNER', 'لا يمكن تعديل الإعلان إلا من قبل مالكه أو مدير النظام');
  return p;
}

async function update(id, user, data) {
  const p = await loadEditable(id, user);
  const { latitude, longitude, ...rest } = data;
  Object.assign(p, rest);
  if (latitude !== undefined || longitude !== undefined) {
    const [curLng, curLat] = p.location.coordinates;
    p.location = toLocation({ latitude: latitude ?? curLat, longitude: longitude ?? curLng });
  }
  await p.save();
  return p;
}

/** FR-06 / CN-08 — soft delete only. */
async function remove(id, user) {
  const p = await loadEditable(id, user);
  p.status = CONTENT_STATUS.DELETED;
  p.deletedAt = new Date();
  p.deletedBy = user._id;
  await p.save();
}

async function addImages(id, user, files) {
  const p = await loadEditable(id, user);
  if (!files || files.length === 0) throw ApiError.badRequest('NO_FILES', 'لم يتم إرفاق أي صورة', { field: 'images' });
  if (p.media.filter((m) => m.kind === 'image').length + files.length > env.propertyImages.maxCount) {
    throw ApiError.badRequest('TOO_MANY_IMAGES', `الحد الأقصى لعدد الصور هو ${env.propertyImages.maxCount}`, { field: 'images' });
  }
  let order = p.media.length;
  for (const f of files) {
    const real = fileStore.sniffType(f.buffer);
    if (!ALLOWED_IMAGE_MIME[real]) throw ApiError.unsupported('UNSUPPORTED_FILE_TYPE', 'الملف المرفوع ليس صورة صالحة (JPG, PNG, WEBP)', { field: 'images' });
    const rel = await fileStore.savePublic(fileStore.SUBDIRS.propertyImages, f.buffer, ALLOWED_IMAGE_MIME[real]);
    p.media.push({ kind: 'image', url: PUBLIC_IMAGE_PREFIX + rel, path: rel, order: order++ });
  }
  await p.save();
  return p;
}

async function removeImage(id, imageId, user) {
  const p = await loadEditable(id, user);
  const m = p.media.id(imageId);
  if (!m) throw ApiError.notFound('IMAGE_NOT_FOUND', 'الصورة غير موجودة');
  if (m.path) await fileStore.remove(m.path);
  m.deleteOne();
  await p.save();
  return p;
}

async function getById(id, viewer) {
  const p = await Property.findById(id).populate('owner', 'fullName phone whatsapp');
  if (!p) throw ApiError.notFound('PROPERTY_NOT_FOUND', 'الإعلان غير موجود');
  const privileged = isOwnerOrAdmin(p, viewer);
  // BR-06: hidden/deleted content invisible to the public
  if (p.status !== CONTENT_STATUS.ACTIVE && !privileged) throw ApiError.notFound('PROPERTY_NOT_FOUND', 'الإعلان غير موجود');
  if (!privileged) await Property.updateOne({ _id: p._id }, { $inc: { viewsCount: 1 } });
  const isFavorite = viewer ? !!(await Favorite.exists({ user: viewer._id, property: p._id })) : false;
  return present(p, { viewer, isFavorite });
}

function buildFilter(q) {
  const f = { status: CONTENT_STATUS.ACTIVE }; // BR-06
  if (q.city) f.city = q.city;
  if (q.district) f.district = q.district;
  if (q.propertyType) f.propertyType = Array.isArray(q.propertyType) ? { $in: q.propertyType } : q.propertyType;
  if (q.purpose) f.purpose = q.purpose;
  if (q.currency) f.currency = q.currency;
  const range = (min, max) => {
    const r = {};
    if (min !== undefined) r.$gte = min;
    if (max !== undefined) r.$lte = max;
    return Object.keys(r).length ? r : undefined;
  };
  const price = range(q.minPrice, q.maxPrice);
  const area = range(q.minArea, q.maxArea);
  const rooms = range(q.minRooms, q.maxRooms);
  if (price) f.price = price;
  if (area) f.area = area;
  if (rooms) f.rooms = rooms;
  if (q.q) {
    const rx = new RegExp(q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ title: rx }, { description: rx }, { district: rx }, { address: rx }];
  }
  return f;
}

async function favoritesSet(viewer, ids) {
  if (!viewer || ids.length === 0) return new Set();
  const favs = await Favorite.find({ user: viewer._id, property: { $in: ids } }).select('property');
  return new Set(favs.map((f) => String(f.property)));
}

/** FR-08 — sort = newest | price_asc | price_desc | nearest (requires latitude & longitude). */
async function search(q, { skip, limit }, viewer) {
  const filter = buildFilter(q);
  let items;
  let total;

  if (q.sort === 'nearest') {
    if (q.latitude === undefined || q.longitude === undefined) {
      throw ApiError.badRequest('LOCATION_REQUIRED', 'الترتيب حسب الأقرب يتطلب موقعك الحالي', { fields: [{ field: 'latitude' }, { field: 'longitude' }] });
    }
    const near = { type: 'Point', coordinates: [q.longitude, q.latitude] };
    const geoNear = { near, distanceField: 'distanceMeters', spherical: true, query: filter };
    if (q.radiusKm) geoNear.maxDistance = q.radiusKm * 1000;
    const [rows, countRows] = await Promise.all([
      Property.aggregate([{ $geoNear: geoNear }, { $skip: skip }, { $limit: limit }]),
      Property.aggregate([{ $geoNear: geoNear }, { $count: 'n' }]),
    ]);
    const ownerIds = rows.map((r) => r.owner);
    const owners = await mongoose.model('User').find({ _id: { $in: ownerIds } }).select('fullName phone whatsapp');
    const byId = new Map(owners.map((u) => [String(u._id), u]));
    items = rows.map((r) => {
      const ow = byId.get(String(r.owner));
      return { ...r, owner: ow ? { _id: ow._id, id: String(ow._id), fullName: ow.fullName, phone: ow.phone, whatsapp: ow.whatsapp } : r.owner };
    });
    total = countRows[0] ? countRows[0].n : 0;
  } else {
    const sort = q.sort === 'price_asc' ? { price: 1, createdAt: -1 } : q.sort === 'price_desc' ? { price: -1, createdAt: -1 } : { createdAt: -1 };
    [items, total] = await Promise.all([
      Property.find(filter).sort(sort).skip(skip).limit(limit).populate('owner', 'fullName phone whatsapp'),
      Property.countDocuments(filter),
    ]);
  }

  const favs = await favoritesSet(viewer, items.map((p) => p._id));
  const out = items.map((p) => {
    const o = present(p, { viewer, isFavorite: favs.has(String(p._id)) });
    if (p.distanceMeters !== undefined) o.distanceMeters = Math.round(p.distanceMeters);
    return o;
  });
  return { items: out, total };
}

/** FR-07 — lightweight pins inside the visible map bounds. */
async function mapPins(q) {
  const filter = buildFilter(q);
  filter.location = {
    $geoWithin: {
      $box: [
        [q.swLng, q.swLat],
        [q.neLng, q.neLat],
      ],
    },
  };
  const rows = await Property.find(filter)
    .select('title price currency purpose propertyType location media city area rooms')
    .limit(q.limit || 300)
    .lean();
  return rows.map((p) => {
    const img = (p.media || []).find((m) => m.kind === 'image');
    return {
      id: String(p._id),
      title: p.title,
      price: p.price,
      currency: p.currency,
      purpose: p.purpose,
      propertyType: p.propertyType,
      city: p.city,
      area: p.area,
      rooms: p.rooms,
      latitude: p.location.coordinates[1],
      longitude: p.location.coordinates[0],
      thumbnailUrl: img ? env.publicBaseUrl + img.url : null,
    };
  });
}

async function listMine(user, { skip, limit }, status) {
  const f = { owner: user._id, status: { $ne: CONTENT_STATUS.DELETED } };
  if (status && status !== CONTENT_STATUS.DELETED) f.status = status;
  const [items, total] = await Promise.all([
    Property.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'fullName phone whatsapp'),
    Property.countDocuments(f),
  ]);
  return { items: items.map((p) => present(p, { viewer: user })), total };
}

/** FR-25 — dedicated contact endpoint (signed-in only). Returns ready-to-open intents for Android. */
async function contact(id) {
  const p = await Property.findOne({ _id: id, status: CONTENT_STATUS.ACTIVE }).populate('owner', 'fullName phone whatsapp');
  if (!p) throw ApiError.notFound('PROPERTY_NOT_FOUND', 'الإعلان غير موجود');
  const phone = p.owner.phone;
  const wa = (p.owner.whatsapp || phone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(`مرحباً، أستفسر عن إعلانك في عقاركم: ${p.title}`);
  return {
    ownerName: p.owner.fullName,
    phone,
    whatsapp: p.owner.whatsapp || phone,
    telUri: `tel:${phone}`,
    whatsappUrl: `https://wa.me/${wa}?text=${text}`,
  };
}

// ---------- Favorites (FR-09) ----------
async function addFavorite(user, propertyId) {
  const p = await Property.findOne({ _id: propertyId, status: CONTENT_STATUS.ACTIVE });
  if (!p) throw ApiError.notFound('PROPERTY_NOT_FOUND', 'الإعلان غير موجود');
  await Favorite.updateOne({ user: user._id, property: p._id }, { $setOnInsert: { user: user._id, property: p._id } }, { upsert: true });
}

async function removeFavorite(user, propertyId) {
  await Favorite.deleteOne({ user: user._id, property: oid(propertyId) });
}

async function listFavorites(user, { skip, limit }) {
  const favs = await Favorite.find({ user: user._id }).sort({ createdAt: -1 }).populate({
    path: 'property',
    populate: { path: 'owner', select: 'fullName phone whatsapp' },
  });
  // hidden/deleted listings disappear from the wishlist view as well (BR-06)
  const visible = favs.filter((f) => f.property && f.property.status === CONTENT_STATUS.ACTIVE);
  const page = visible.slice(skip, skip + limit);
  return {
    items: page.map((f) => ({ ...present(f.property, { viewer: user, isFavorite: true }), favoritedAt: f.createdAt })),
    total: visible.length,
  };
}

module.exports = {
  present,
  create,
  update,
  remove,
  addImages,
  removeImage,
  getById,
  search,
  mapPins,
  listMine,
  contact,
  addFavorite,
  removeFavorite,
  listFavorites,
};
