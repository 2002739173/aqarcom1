/**
 * Weighted Sum Model — pure function, identical maths to the Python scoring service.
 * Used directly as the in-core FALLBACK evaluator (FR-19).
 *
 *   r_p(i) = min(p) / p(i)          r_d(i) = min(d) / d(i)      (both criteria are "cost" type)
 *   S(i)   = wp · r_p(i) + wd · r_d(i)                           (wp + wd = 1)
 *
 * Ordering: S descending; ties (|ΔS| ≤ 1e-9) → lower price first, then earlier submission (BR-19).
 *
 * @param {Array<{id:string, price:number, duration:number, submittedAt:string|Date}>} bids
 * @param {{price:number, duration:number}} weights  integer percentages summing to 100
 * @param {number} topN
 * @returns {Array<{id, rank, score, normalizedPrice, normalizedDuration, price, duration, submittedAt}>}
 */
const EPS = 1e-9;

function rankBids(bids, weights, topN = 5) {
  if (!Array.isArray(bids) || bids.length === 0) return [];
  if (weights.price + weights.duration !== 100) throw new Error('weights must sum to 100');
  const wp = weights.price / 100;
  const wd = weights.duration / 100;

  const minP = Math.min(...bids.map((b) => b.price));
  const minD = Math.min(...bids.map((b) => b.duration));

  const scored = bids.map((b) => {
    if (!(b.price > 0) || !(b.duration > 0)) throw new Error(`invalid bid values for ${b.id}`);
    const rp = minP / b.price;
    const rd = minD / b.duration;
    return {
      id: String(b.id),
      price: b.price,
      duration: b.duration,
      submittedAt: new Date(b.submittedAt).toISOString(),
      normalizedPrice: rp,
      normalizedDuration: rd,
      score: wp * rp + wd * rd,
    };
  });

  scored.sort((a, b) => {
    if (Math.abs(a.score - b.score) > EPS) return b.score - a.score;
    if (a.price !== b.price) return a.price - b.price;
    return new Date(a.submittedAt) - new Date(b.submittedAt);
  });

  return scored.slice(0, topN).map((s, i) => ({ ...s, rank: i + 1 }));
}

module.exports = { rankBids };
