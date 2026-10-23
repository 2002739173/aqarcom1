const { asyncHandler, ok, pagination, pageMeta } = require('../utils/http');
const svc = require('../services/bid.service');

module.exports = {
  mine: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await svc.listMine(req.user, pg, req.validatedQuery);
    ok(res, items, pageMeta(pg, total));
  }),
  update: asyncHandler(async (req, res) => ok(res, await svc.update(req.params.id, req.user, req.body))),
  withdraw: asyncHandler(async (req, res) => ok(res, await svc.withdraw(req.params.id, req.user))),
};
