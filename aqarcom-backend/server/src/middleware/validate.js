/** Joi validation — returns 400 with the offending field names (SRS 3-1: errors identify the missing field). */
const ApiError = require('../utils/ApiError');

const validate =
  (schema, source = 'body') =>
  (req, res, next) => {
    const { value, error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const fields = error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
      return next(ApiError.badRequest('VALIDATION_ERROR', 'بيانات غير صالحة: ' + fields.map((f) => f.field).join('، '), { fields }));
    }
    if (source === 'query') {
      // req.query is a getter in Express 5-style setups; keep a validated copy
      req.validatedQuery = value;
    } else {
      req[source] = value;
    }
    next();
  };

module.exports = validate;
