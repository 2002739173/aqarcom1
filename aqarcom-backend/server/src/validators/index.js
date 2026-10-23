/** Joi request schemas — server-side enforcement of SRS 6-2 field constraints. */
const Joi = require('joi');
const { REGISTRABLE_ROLES, PROPERTY_TYPES, LISTING_PURPOSES, TENDER_TYPES, TENDER_STATUS, CONTENT_STATUS, ROLES } = require('../config/constants');

const objectId = Joi.string().hex().length(24);
const password = Joi.string().min(8).max(128).pattern(/[A-Za-z]/).pattern(/\d/).messages({
  'string.pattern.base': 'كلمة المرور يجب أن تحتوي على حروف وأرقام',
  'string.min': 'كلمة المرور يجب ألا تقل عن 8 محارف',
});
const phone = Joi.string().pattern(/^\+?[0-9]{7,15}$/).messages({ 'string.pattern.base': 'رقم الهاتف غير صالح' });
const lat = Joi.number().min(-90).max(90);
const lng = Joi.number().min(-180).max(180);
const page = { page: Joi.number().integer().min(1), limit: Joi.number().integer().min(1).max(100) };

const auth = {
  register: Joi.object({
    fullName: Joi.string().trim().min(2).max(120).required(),
    email: Joi.string().email().required(),
    phone: phone.required(),
    whatsapp: phone,
    password: password.required(),
    role: Joi.string().valid(...REGISTRABLE_ROLES).required(),
    companyName: Joi.string().trim().max(200),
    city: Joi.string().trim().max(80),
  }),
  login: Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() }),
  refresh: Joi.object({ refreshToken: Joi.string().required() }),
  logout: Joi.object({ refreshToken: Joi.string() }),
  forgot: Joi.object({ email: Joi.string().email().required() }),
  reset: Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().pattern(/^\d{6}$/).required(),
    newPassword: password.required(),
  }),
  changePassword: Joi.object({ currentPassword: Joi.string().required(), newPassword: password.required() }),
  updateProfile: Joi.object({
    fullName: Joi.string().trim().min(2).max(120),
    phone,
    whatsapp: phone,
    companyName: Joi.string().trim().max(200),
    city: Joi.string().trim().max(80),
  }).min(1),
  deviceToken: Joi.object({ token: Joi.string().required(), platform: Joi.string().valid('android').default('android') }),
};

const propertyBase = {
  title: Joi.string().trim().min(3).max(150),
  description: Joi.string().trim().max(5000).allow(''),
  propertyType: Joi.string().valid(...PROPERTY_TYPES),
  purpose: Joi.string().valid(...LISTING_PURPOSES),
  price: Joi.number().min(0),
  currency: Joi.string().valid('SYP', 'USD'),
  area: Joi.number().min(1),
  rooms: Joi.number().integer().min(0).max(100),
  bathrooms: Joi.number().integer().min(0).max(50),
  floor: Joi.number().integer().min(-5).max(200),
  city: Joi.string().trim().max(80),
  district: Joi.string().trim().max(120).allow(''),
  address: Joi.string().trim().max(300).allow(''),
  latitude: lat,
  longitude: lng,
};

const property = {
  create: Joi.object({
    ...propertyBase,
    title: propertyBase.title.required(),
    propertyType: propertyBase.propertyType.required(),
    purpose: propertyBase.purpose.required(),
    price: propertyBase.price.required(),
    area: propertyBase.area.required(),
    city: propertyBase.city.required(),
    latitude: lat.required().messages({ 'any.required': 'يجب تحديد موقع العقار على الخريطة' }),
    longitude: lng.required().messages({ 'any.required': 'يجب تحديد موقع العقار على الخريطة' }),
  }),
  update: Joi.object(propertyBase).min(1),
  search: Joi.object({
    ...page,
    q: Joi.string().trim().max(100),
    city: Joi.string().trim(),
    district: Joi.string().trim(),
    propertyType: Joi.alternatives(Joi.string().valid(...PROPERTY_TYPES), Joi.array().items(Joi.string().valid(...PROPERTY_TYPES))),
    purpose: Joi.string().valid(...LISTING_PURPOSES),
    currency: Joi.string().valid('SYP', 'USD'),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    minArea: Joi.number().min(0),
    maxArea: Joi.number().min(0),
    minRooms: Joi.number().integer().min(0),
    maxRooms: Joi.number().integer().min(0),
    sort: Joi.string().valid('newest', 'price_asc', 'price_desc', 'nearest').default('newest'),
    latitude: lat,
    longitude: lng,
    radiusKm: Joi.number().min(0.1).max(500),
  }),
  map: Joi.object({
    swLat: lat.required(),
    swLng: lng.required(),
    neLat: lat.required(),
    neLng: lng.required(),
    propertyType: Joi.string().valid(...PROPERTY_TYPES),
    purpose: Joi.string().valid(...LISTING_PURPOSES),
    minPrice: Joi.number().min(0),
    maxPrice: Joi.number().min(0),
    city: Joi.string().trim(),
    limit: Joi.number().integer().min(1).max(500),
  }),
  mine: Joi.object({ ...page, status: Joi.string().valid(CONTENT_STATUS.ACTIVE, CONTENT_STATUS.HIDDEN) }),
};

const weight = Joi.number().integer().min(0).max(100);
const tender = {
  create: Joi.object({
    title: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().trim().max(10000).allow(''),
    tenderType: Joi.string().valid(...TENDER_TYPES).required(),
    city: Joi.string().trim().max(80),
    address: Joi.string().trim().max(300).allow(''),
    latitude: lat,
    longitude: lng,
    property: objectId,
    estimatedBudget: Joi.number().min(0),
    priceWeight: weight.required(),
    durationWeight: weight.required(),
    deadline: Joi.date().iso().required(),
  }).and('latitude', 'longitude'),
  update: Joi.object({
    title: Joi.string().trim().min(3).max(200),
    description: Joi.string().trim().max(10000).allow(''),
    tenderType: Joi.string().valid(...TENDER_TYPES),
    city: Joi.string().trim().max(80),
    address: Joi.string().trim().max(300).allow(''),
    latitude: lat,
    longitude: lng,
    estimatedBudget: Joi.number().min(0),
    priceWeight: weight,
    durationWeight: weight,
    deadline: Joi.date().iso(),
  })
    .min(1)
    .and('latitude', 'longitude'),
  extend: Joi.object({ deadline: Joi.date().iso().required() }),
  cancel: Joi.object({ reason: Joi.string().trim().max(500).allow('') }),
  award: Joi.object({ bidId: objectId.required() }),
  documentMeta: Joi.object({ note: Joi.string().trim().max(2000).allow(''), uploadId: objectId }),
  list: Joi.object({
    ...page,
    q: Joi.string().trim().max(100),
    status: Joi.string().valid(...Object.values(TENDER_STATUS)),
    tenderType: Joi.string().valid(...TENDER_TYPES),
    city: Joi.string().trim(),
    sort: Joi.string().valid('newest', 'deadline').default('newest'),
  }),
};

const bid = {
  submit: Joi.object({
    totalPrice: Joi.number().greater(0).max(1e13).required().messages({ 'number.greater': 'السعر الإجمالي يجب أن يكون أكبر من الصفر' }),
    durationDays: Joi.number().integer().min(1).max(36500).required().messages({ 'number.min': 'مدة التنفيذ يجب أن تكون يوماً واحداً على الأقل' }),
    notes: Joi.string().trim().max(3000).allow(''),
  }),
  update: Joi.object({
    totalPrice: Joi.number().greater(0).max(1e13),
    durationDays: Joi.number().integer().min(1).max(36500),
    notes: Joi.string().trim().max(3000).allow(''),
  }).min(1),
  mine: Joi.object({ ...page, includeWithdrawn: Joi.boolean() }),
};

const upload = {
  init: Joi.object({
    fileName: Joi.string().trim().max(255).required(),
    mimeType: Joi.string().required(),
    totalSize: Joi.number().integer().min(1).required(),
    chunkSize: Joi.number().integer().min(64 * 1024).required(),
  }),
};

const admin = {
  moderate: Joi.object({ action: Joi.string().valid('hide', 'delete', 'restore').required(), reason: Joi.string().trim().min(3).max(1000).required() }),
  verificationDecision: Joi.object({ decision: Joi.string().valid('approve', 'reject').required(), reason: Joi.string().trim().max(1000).allow('') }),
  userStatus: Joi.object({ suspend: Joi.boolean().required(), reason: Joi.string().trim().min(3).max(1000).required() }),
  users: Joi.object({
    ...page,
    role: Joi.string().valid(...Object.values(ROLES)),
    status: Joi.string().valid('pending', 'active', 'rejected', 'suspended'),
    verificationStatus: Joi.string().valid('none', 'pending', 'verified', 'rejected'),
    q: Joi.string().trim().max(100),
  }),
  userAction: Joi.object({ reason: Joi.string().trim().max(1000).allow('') }),
  changeRole: Joi.object({ role: Joi.string().valid(...REGISTRABLE_ROLES).required(), reason: Joi.string().trim().min(3).max(1000).required() }),
  queue: Joi.object({
    ...page,
    type: Joi.string().valid('property', 'tender').default('property'),
    status: Joi.string().valid(...Object.values(CONTENT_STATUS)),
    tenderStatus: Joi.string().valid(...Object.values(TENDER_STATUS)),
  }),
  verifications: Joi.object({ ...page, status: Joi.string().valid('pending', 'approved', 'rejected') }),
};

const common = {
  pageOnly: Joi.object(page),
  notifications: Joi.object({ ...page, unreadOnly: Joi.boolean() }),
};

module.exports = { objectId, auth, property, tender, bid, upload, admin, common };
