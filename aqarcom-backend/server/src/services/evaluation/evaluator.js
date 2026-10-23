/**
 * Evaluator — tries the primary engine, falls back on any error/timeout and labels the result
 * with the engine that actually produced it (FR-19, BR-17).
 */
const logger = require('../../utils/logger');
const { RemoteWsmEngine, FallbackEngine } = require('./engines');

let primary = new RemoteWsmEngine();
let fallback = new FallbackEngine();

async function evaluate(bids, weights, topN = 5) {
  try {
    const results = await primary.rank(bids, weights, topN);
    return { engine: primary.name, results };
  } catch (e) {
    const reason = e.code === 'ECONNABORTED' ? 'timeout' : e.code || e.message;
    logger.warn(`Scoring service unavailable (${reason}) — using fallback evaluator`);
    const results = await fallback.rank(bids, weights, topN);
    return { engine: fallback.name, results, fallbackReason: String(reason).slice(0, 200) };
  }
}

/** Test / configuration hook to swap strategies. */
function setEngines({ primary: p, fallback: f } = {}) {
  if (p) primary = p;
  if (f) fallback = f;
}

module.exports = { evaluate, setEngines };
