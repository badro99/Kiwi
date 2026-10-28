/* VAT by rate for one business day. Callers supply the day's normalised rows
 * (the ones the day report already counts) and the merchant's default rate.
 * Money stays in integer centimes. A line without a rate takes the merchant's
 * default rate; with no default it lands under "rate unknown" (rate: null) and
 * is never guessed. Pure: no clock, no storage, no DOM.
 *
 * Row: { amount (MAD, signed), kind, lines: [{ total, rate? }] | null }
 * opts: { defaultRate: number|null, included: boolean (prices carry the VAT) }
 * Result: { v, included, defaultRate, rows: [{ rate, baseC, htC, vatC, ttcC }],
 *           totals: { htC, vatC, ttcC, unknownC, allC } }
 * `baseC` is the amount the till recorded for that rate: it is what merges. */
const toC = function (n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100); }
const goodRate = function (v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  const r = Number(v);
  return Number.isFinite(r) && r >= 0 && r <= 100 ? Math.round(r * 100) / 100 : null;
}
/* Half up on the magnitude, so a refund mirrors its sale to the centime. */
const divRound = function (num, den) {
  const sign = num < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(num) * 2 + den) / (2 * den));
}
/* Largest remainder: the parts add up to `total` exactly. */
const split = function (total, weights) {
  const sum = weights.reduce(function (a, b) { return a + b; }, 0);
  if (!(sum > 0)) return null;
  const sign = total < 0 ? -1 : 1, mag = Math.abs(total);
  const parts = weights.map(function (w, i) {
    const exact = mag * w;
    return { i: i, v: Math.floor(exact / sum), rem: exact % sum };
  });
  let left = mag - parts.reduce(function (a, p) { return a + p.v; }, 0);
  parts.slice().sort(function (a, b) { return b.rem - a.rem || a.i - b.i; }).forEach(function (p) {
    if (left > 0) { p.v++; left--; }
  });
  return parts.map(function (p) { return p.v * sign; });
}
const settle = function (rate, baseC, included) {
  if (rate == null) return { rate: null, baseC: baseC, htC: null, vatC: null, ttcC: baseC };
  const bp = Math.round(rate * 100);
  if (included) {
    const htC = divRound(baseC * 10000, 10000 + bp);
    return { rate: rate, baseC: baseC, htC: htC, vatC: baseC - htC, ttcC: baseC };
  }
  const vatC = divRound(baseC * bp, 10000);
  return { rate: rate, baseC: baseC, htC: baseC, vatC: vatC, ttcC: baseC + vatC };
}
const finish = function (byRate, included, defaultRate) {
  const keys = Object.keys(byRate).filter(function (k) { return k !== 'unknown'; })
    .sort(function (a, b) { return Number(a) - Number(b); });
  if (byRate.unknown) keys.push('unknown');
  const rows = keys.map(function (k) {
    return settle(k === 'unknown' ? null : Number(k), byRate[k], included);
  });
  const totals = { htC: 0, vatC: 0, ttcC: 0, unknownC: 0, allC: 0 };
  rows.forEach(function (r) {
    if (r.rate == null) { totals.unknownC += r.ttcC; } else {
      totals.htC += r.htC; totals.vatC += r.vatC; totals.ttcC += r.ttcC;
    }
    totals.allC += r.ttcC;
  });
  return { v: 1, included: included, defaultRate: defaultRate, rows: rows, totals: totals };
}
const keyOf = function (rate) { return rate == null ? 'unknown' : String(rate); }
export const dayVat = function (rows, opts) {
  const o = opts || {};
  const included = o.included !== false;
  const defaultRate = goodRate(o.defaultRate);
  const byRate = Object.create(null);
  const put = function (rate, c) { const k = keyOf(rate); byRate[k] = (byRate[k] || 0) + c; };
  (rows || []).forEach(function (row) {
    if (!row) return;
    const magC = Math.abs(toC(row.amount));
    if (!magC) return;
    const neg = row.kind === 'refund' || Number(row.amount) < 0;
    const totalC = neg ? -magC : magC;
    const lines = (row.lines || []).filter(function (l) { return l && Number(l.total) > 0; });
    const weights = lines.map(function (l) { return toC(l.total); });
    const parts = lines.length ? split(totalC, weights) : null;
    if (!parts) { put(defaultRate, totalC); return; }
    lines.forEach(function (l, i) {
      const own = goodRate(l.rate);
      put(own != null ? own : defaultRate, parts[i]);
    });
  });
  return finish(byRate, included, defaultRate);
}
/* Two services of the same business day: add the recorded amounts per rate and
 * settle again, so rounding never accumulates. */
export const mergeDayVat = function (a, b) {
  if (!a || !b) return a || b || null;
  const byRate = Object.create(null);
  [a, b].forEach(function (v) {
    (v.rows || []).forEach(function (r) { const k = keyOf(r.rate); byRate[k] = (byRate[k] || 0) + (Number(r.baseC) || 0); });
  });
  return finish(byRate, a.included !== false, a.defaultRate != null ? a.defaultRate : b.defaultRate);
}
