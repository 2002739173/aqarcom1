/** Uniform response envelope consumed by the Android `ApiResponse<T>` class:
 *  { success: true, data, meta? }  |  { success: false, error: { code, message, details? } }
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, meta, status = 200) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
};

const created = (res, data) => ok(res, data, undefined, 201);

/** Parse ?page=&limit= with sane bounds. */
const pagination = (query, defLimit = 20, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const pageMeta = ({ page, limit }, total) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit) || 0,
});

module.exports = { asyncHandler, ok, created, pagination, pageMeta };
