/* Minimal logger. Never pass passwords, tokens or reset codes to it (NFR-02). */
const env = require('../config/env');

const ts = () => new Date().toISOString();
const silent = env.isTest;

module.exports = {
  info: (...a) => !silent && console.log(`[${ts()}] INFO `, ...a),
  warn: (...a) => !silent && console.warn(`[${ts()}] WARN `, ...a),
  error: (...a) => !silent && console.error(`[${ts()}] ERROR`, ...a),
  debug: (...a) => !silent && !env.isProd && console.log(`[${ts()}] DEBUG`, ...a),
};
