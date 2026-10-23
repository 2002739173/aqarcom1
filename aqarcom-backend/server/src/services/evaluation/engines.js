/**
 * Strategy pattern (SRS 10-1): swapping the scoring engine is swapping an object.
 *  - RemoteWsmEngine → Python FastAPI service (internal network, timeout — CN-04). Read-only, no DB access (BR-16).
 *  - FallbackEngine  → in-core JS implementation of the same WSM (FR-19).
 */
const axios = require('axios');
const env = require('../../config/env');
const { EVALUATION_ENGINE } = require('../../config/constants');
const { rankBids } = require('./wsm');

class RemoteWsmEngine {
  constructor({ url = env.scoring.url, timeoutMs = env.scoring.timeoutMs, apiKey = env.scoring.apiKey } = {}) {
    this.name = EVALUATION_ENGINE.WSM;
    this.http = axios.create({ baseURL: url, timeout: timeoutMs, headers: { 'X-Internal-Key': apiKey } });
  }

  async rank(bids, weights, topN) {
    const { data } = await this.http.post('/v1/evaluate', {
      bids: bids.map((b) => ({ id: String(b.id), price: b.price, duration: b.duration, submitted_at: new Date(b.submittedAt).toISOString() })),
      weights: { price: weights.price, duration: weights.duration },
      top_n: topN,
    });
    if (!data || !Array.isArray(data.results)) throw new Error('malformed scoring response');
    return data.results.map((r) => ({
      id: r.id,
      rank: r.rank,
      score: r.score,
      normalizedPrice: r.normalized_price,
      normalizedDuration: r.normalized_duration,
      price: r.price,
      duration: r.duration,
      submittedAt: r.submitted_at,
    }));
  }
}

class FallbackEngine {
  constructor() {
    this.name = EVALUATION_ENGINE.FALLBACK;
  }

  async rank(bids, weights, topN) {
    return rankBids(bids, weights, topN);
  }
}

module.exports = { RemoteWsmEngine, FallbackEngine };
