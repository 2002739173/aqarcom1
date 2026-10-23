/**
 * Multipart upload handling (multer, in-memory). Files are then sniffed by magic bytes
 * in the service layer and either encrypted (documents) or saved publicly (images).
 */
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { ALLOWED_DOC_MIME, ALLOWED_IMAGE_MIME } = require('../config/constants');

const MB = 1024 * 1024;

const make = ({ maxMb, allowed, maxFiles }) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * MB, files: maxFiles },
    fileFilter: (req, file, cb) => {
      if (!allowed[file.mimetype]) {
        return cb(
          ApiError.unsupported('UNSUPPORTED_FILE_TYPE', 'صيغة الملف غير مقبولة', {
            field: file.fieldname,
            allowed: Object.values(allowed),
          })
        );
      }
      cb(null, true);
    },
  });

const tenderDocUpload = make({ maxMb: env.tenderDocMaxMb, allowed: ALLOWED_DOC_MIME, maxFiles: 1 });
const propertyImagesUpload = make({
  maxMb: env.propertyImages.maxSizeMb,
  allowed: ALLOWED_IMAGE_MIME,
  maxFiles: env.propertyImages.maxCount,
});
const verificationUpload = make({
  maxMb: env.verificationDocMaxMb,
  allowed: { 'application/pdf': 'pdf', ...ALLOWED_IMAGE_MIME },
  maxFiles: 5,
});
const chunkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.chunkSizeMaxMb * MB, files: 1 } });

/** Translate multer errors into our ApiError format (TC-11: clear message with the limit & formats). */
const wrap = (mw, ctx) => (req, res, next) =>
  mw(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        ApiError.tooLarge('FILE_TOO_LARGE', `حجم الملف يتجاوز الحد الأقصى المسموح (${ctx.maxMb} ميغابايت). الصيغ المقبولة: ${ctx.formats}`, {
          maxMb: ctx.maxMb,
          allowed: ctx.formats,
        })
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest('TOO_MANY_FILES', 'عدد الملفات يتجاوز الحد المسموح', { field: err.field }));
    }
    next(err);
  });

module.exports = {
  tenderDocument: wrap(tenderDocUpload.single('file'), { maxMb: env.tenderDocMaxMb, formats: 'PDF, Word' }),
  propertyImages: wrap(propertyImagesUpload.array('images', env.propertyImages.maxCount), {
    maxMb: env.propertyImages.maxSizeMb,
    formats: 'JPG, PNG, WEBP',
  }),
  verificationDocs: wrap(
    verificationUpload.fields([
      { name: 'engineers_syndicate', maxCount: 2 },
      { name: 'commercial_register', maxCount: 2 },
      { name: 'other', maxCount: 2 },
    ]),
    { maxMb: env.verificationDocMaxMb, formats: 'PDF, JPG, PNG' }
  ),
  chunk: wrap(chunkUpload.single('chunk'), { maxMb: env.chunkSizeMaxMb, formats: 'binary chunk' }),
};
