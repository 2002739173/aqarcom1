const { asyncHandler, ok, pagination, pageMeta } = require('../utils/http');
const admin = require('../services/admin.service');
const verification = require('../services/verification.service');

module.exports = {
  stats: asyncHandler(async (req, res) => ok(res, await admin.stats())),
  queue: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await admin.reviewQueue(req.validatedQuery, pg);
    ok(res, items, pageMeta(pg, total));
  }),
  moderateProperty: asyncHandler(async (req, res) => ok(res, await admin.moderate('property', req.params.id, req.user, req.body))),
  moderateTender: asyncHandler(async (req, res) => ok(res, await admin.moderate('tender', req.params.id, req.user, req.body))),
  propertyHistory: asyncHandler(async (req, res) => ok(res, await admin.moderationHistory('property', req.params.id))),
  tenderHistory: asyncHandler(async (req, res) => ok(res, await admin.moderationHistory('tender', req.params.id))),
  users: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await admin.listUsers(req.validatedQuery, pg);
    ok(res, items, pageMeta(pg, total));
  }),
  setUserStatus: asyncHandler(async (req, res) => ok(res, await admin.setUserStatus(req.params.id, req.user, req.body))),
  user: asyncHandler(async (req, res) => ok(res, await admin.getUserDetails(req.params.id))),
  userAction: asyncHandler(async (req, res) =>
    ok(res, await admin.changeAccountStatus(req.params.id, req.user, req.params.action, req.body.reason))
  ),
  changeRole: asyncHandler(async (req, res) => ok(res, await admin.changeRole(req.params.id, req.user, req.body))),

  verifications: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await verification.list(req.validatedQuery, pg);
    ok(res, items, pageMeta(pg, total));
  }),
  verification: asyncHandler(async (req, res) => ok(res, await verification.getById(req.params.id))),
  verificationDocument: asyncHandler(async (req, res) => {
    const { doc, buffer } = await verification.downloadDocument(req.params.id, req.params.docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName || 'document')}`);
    res.end(buffer);
  }),
  decideVerification: asyncHandler(async (req, res) => ok(res, await verification.decide(req.params.id, req.user, req.body))),
};
