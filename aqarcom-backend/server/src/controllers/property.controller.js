const { asyncHandler, ok, created, pagination, pageMeta } = require('../utils/http');
const svc = require('../services/property.service');

module.exports = {
  search: asyncHandler(async (req, res) => {
    const q = req.validatedQuery;
    const pg = pagination(q);
    const { items, total } = await svc.search(q, pg, req.user);
    ok(res, items, pageMeta(pg, total));
  }),
  map: asyncHandler(async (req, res) => ok(res, await svc.mapPins(req.validatedQuery))),
  mine: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await svc.listMine(req.user, pg, req.validatedQuery.status);
    ok(res, items, pageMeta(pg, total));
  }),
  get: asyncHandler(async (req, res) => ok(res, await svc.getById(req.params.id, req.user))),
  create: asyncHandler(async (req, res) => {
    const p = await svc.create(req.user, req.body);
    created(res, svc.present(await p.populate('owner', 'fullName phone whatsapp'), { viewer: req.user }));
  }),
  update: asyncHandler(async (req, res) => {
    const p = await svc.update(req.params.id, req.user, req.body);
    ok(res, svc.present(await p.populate('owner', 'fullName phone whatsapp'), { viewer: req.user }));
  }),
  remove: asyncHandler(async (req, res) => {
    await svc.remove(req.params.id, req.user);
    ok(res, { deleted: true });
  }),
  addImages: asyncHandler(async (req, res) => {
    const p = await svc.addImages(req.params.id, req.user, req.files);
    ok(res, svc.present(await p.populate('owner', 'fullName phone whatsapp'), { viewer: req.user }));
  }),
  removeImage: asyncHandler(async (req, res) => {
    const p = await svc.removeImage(req.params.id, req.params.imageId, req.user);
    ok(res, svc.present(await p.populate('owner', 'fullName phone whatsapp'), { viewer: req.user }));
  }),
  contact: asyncHandler(async (req, res) => ok(res, await svc.contact(req.params.id))),
  favorites: asyncHandler(async (req, res) => {
    const pg = pagination(req.validatedQuery);
    const { items, total } = await svc.listFavorites(req.user, pg);
    ok(res, items, pageMeta(pg, total));
  }),
  addFavorite: asyncHandler(async (req, res) => {
    await svc.addFavorite(req.user, req.params.id);
    ok(res, { propertyId: req.params.id, isFavorite: true });
  }),
  removeFavorite: asyncHandler(async (req, res) => {
    await svc.removeFavorite(req.user, req.params.id);
    ok(res, { propertyId: req.params.id, isFavorite: false });
  }),
};
