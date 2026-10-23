const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const env = require('../config/env');

const notFound = (req, res, next) => next(ApiError.notFound('ROUTE_NOT_FOUND', `المسار غير موجود: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let e = err;

  if (e instanceof mongoose.Error.ValidationError) {
    const fields = Object.values(e.errors).map((x) => ({ field: x.path, message: x.message }));
    e = ApiError.badRequest('VALIDATION_ERROR', 'بيانات غير صالحة: ' + fields.map((f) => f.field).join('، '), { fields });
  } else if (e instanceof mongoose.Error.CastError) {
    e = ApiError.badRequest('INVALID_ID', `قيمة غير صالحة للحقل ${e.path}`, { field: e.path });
  } else if (e && e.code === 11000) {
    const field = Object.keys(e.keyPattern || e.keyValue || {})[0];
    e = ApiError.conflict('DUPLICATE', field === 'email' ? 'البريد الإلكتروني مستخدم مسبقاً' : 'العنصر موجود مسبقاً', { field });
  } else if (e && e.type === 'entity.parse.failed') {
    e = ApiError.badRequest('INVALID_JSON', 'صيغة JSON غير صالحة');
  } else if (!(e instanceof ApiError)) {
    logger.error(e);
    e = new ApiError(500, 'INTERNAL_ERROR', 'حدث خطأ غير متوقع في الخادم');
    if (!env.isProd) e.details = { debug: err && err.message };
  }

  const body = { success: false, error: { code: e.code, message: e.message } };
  if (e.details) body.error.details = e.details;
  res.status(e.status).json(body);
};

module.exports = { notFound, errorHandler };
