const { asyncHandler, ok, created, pagination, pageMeta } = require('../utils/http');
const ApiError = require('../utils/ApiError');
const svc = require('../services/tender.service');
const lifecycle = require('../services/lifecycle.service');
const bids = require('../services/bid.service');
const uploads = require('../services/upload.service');

const sendFile = (res, { doc, buffer }) => {
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
  res.setHeader('X-Document-Version', String(doc.version || ''));
  res.end(buffer);
};

module.exports = {
  list: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await svc.list(req.validatedQuery, pg, req.user);
    ok(res, items, pageMeta(pg, total));
  }),
  mine: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await svc.listMine(req.user, req.validatedQuery, pg);
    ok(res, items, pageMeta(pg, total));
  }),
  get: asyncHandler(async (req, res) => ok(res, await svc.getById(req.params.id, req.user))),
  create: asyncHandler(async (req, res) => created(res, svc.present(await svc.create(req.user, req.body), { viewer: req.user }))),
  update: asyncHandler(async (req, res) => ok(res, svc.present(await svc.update(req.params.id, req.user, req.body), { viewer: req.user }))),
  publish: asyncHandler(async (req, res) => ok(res, svc.present(await svc.publish(req.params.id, req.user), { viewer: req.user }))),
  extend: asyncHandler(async (req, res) => ok(res, svc.present(await svc.extend(req.params.id, req.user, req.body.deadline), { viewer: req.user }))),
  cancel: asyncHandler(async (req, res) => ok(res, svc.present(await svc.cancel(req.params.id, req.user, req.body.reason), { viewer: req.user }))),

  /** Direct multipart upload (field "file") OR assemble a completed resumable upload (body.uploadId). */
  uploadDocument: asyncHandler(async (req, res) => {
    let input;
    if (req.file) {
      input = { buffer: req.file.buffer, originalName: req.file.originalname };
    } else if (req.body.uploadId) {
      const f = await uploads.consume(req.body.uploadId, req.user);
      input = { buffer: f.buffer, originalName: f.fileName };
    } else {
      throw ApiError.badRequest('NO_FILE', 'لم يتم إرفاق دفتر الشروط', { field: 'file' });
    }
    created(res, await svc.addDocument(req.params.id, req.user, { ...input, note: req.body.note }));
  }),
  listDocuments: asyncHandler(async (req, res) => ok(res, await svc.listDocuments(req.params.id, req.user))),
  downloadLatest: asyncHandler(async (req, res) => sendFile(res, await svc.downloadDocument(req.params.id, null, req.user))),
  downloadVersion: asyncHandler(async (req, res) =>
    sendFile(res, await svc.downloadDocument(req.params.id, parseInt(req.params.version, 10), req.user))
  ),

  shortlist: asyncHandler(async (req, res) => ok(res, await lifecycle.getShortlist(req.params.id, req.user))),
  award: asyncHandler(async (req, res) => ok(res, svc.present(await lifecycle.award(req.params.id, req.user, req.body.bidId), { viewer: req.user }))),

  submitBid: asyncHandler(async (req, res) => created(res, await bids.submit(req.params.id, req.user, req.body))),
  tenderBids: asyncHandler(async (req, res) => ok(res, await bids.listForTender(req.params.id, req.user))),
};
