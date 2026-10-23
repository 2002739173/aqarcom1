/** Clean JSON output: `_id` → `id`, drop `__v` and any field listed in `hidden`. */
function toJSONPlugin(schema, opts = {}) {
  const hidden = opts.hidden || [];
  const transform = (doc, ret) => {
    ret.id = ret._id ? ret._id.toString() : ret.id;
    delete ret._id;
    delete ret.__v;
    hidden.forEach((f) => delete ret[f]);
    return ret;
  };
  schema.set('toJSON', { virtuals: false, transform });
  schema.set('toObject', { virtuals: false, transform });
}

module.exports = { toJSONPlugin };
