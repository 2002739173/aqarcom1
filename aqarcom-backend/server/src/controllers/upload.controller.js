const { asyncHandler, ok, created } = require('../utils/http');
const ApiError = require('../utils/ApiError');
const svc = require('../services/upload.service');

module.exports = {
  init: asyncHandler(async (req, res) => created(res, await svc.init(req.user, req.body))),
  /** Chunk body: multipart field "chunk" OR raw application/octet-stream. */
  putChunk: asyncHandler(async (req, res) => {
    const buffer = req.file ? req.file.buffer : Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer) throw ApiError.badRequest('NO_CHUNK', 'لم يتم إرسال بيانات الجزء', { field: 'chunk' });
    ok(res, await svc.putChunk(req.params.id, req.user, parseInt(req.params.index, 10), buffer));
  }),
  status: asyncHandler(async (req, res) => ok(res, await svc.status(req.params.id, req.user))),
};
