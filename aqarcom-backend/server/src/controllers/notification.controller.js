const { asyncHandler, ok, pagination, pageMeta } = require('../utils/http');
const ApiError = require('../utils/ApiError');
const svc = require('../services/notification.service');

module.exports = {
  list: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total, unread } = await svc.list(req.user._id, { ...pg, unreadOnly: req.validatedQuery.unreadOnly });
    ok(res, items, { ...pageMeta(pg, total), unread });
  }),
  unreadCount: asyncHandler(async (req, res) => {
    const { unread } = await svc.list(req.user._id, { skip: 0, limit: 1 });
    ok(res, { unread });
  }),
  markRead: asyncHandler(async (req, res) => {
    const n = await svc.markRead(req.user._id, req.params.id);
    if (!n) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود');
    ok(res, n);
  }),
  markAllRead: asyncHandler(async (req, res) => ok(res, { updated: await svc.markAllRead(req.user._id) })),
};
