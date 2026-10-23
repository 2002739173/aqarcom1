const { asyncHandler, ok, created } = require('../utils/http');
const svc = require('../services/verification.service');

module.exports = {
  submit: asyncHandler(async (req, res) => created(res, await svc.submit(req.user, req.files, req.body.notes))),
  me: asyncHandler(async (req, res) => ok(res, await svc.myStatus(req.user))),
};
