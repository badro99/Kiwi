import { DateTimeFormat } from './_zone-law.js';
// GET /api/sales-summary?merchant=<slug>&from=<ms>&to=<ms>
//
// A store's sales, already added up per business day, so the dashboard can
// show a long period without holding every sale of it in the browser.
//
// Same scope as /api/feed: the store comes from entitledMerchant() (owner
// session for one of its own stores, a named operator, or a demo slug), plus
// the account's pre-split bucket when unambiguous (_sales-scope.js). Voided
// rows are left out, exactly as the feed leaves them out.
//
// Shape of one business day:
//   { day: 'YYYY-MM-DD', from, to,                    // that day's [from, to) in ms
//     count, cents,                                   // positive sales
//     methods: { <method>: { count, cents } },        // every positive sale by its method
//     whole:   { <method>: cents },                   // positive sales WITHOUT a tender split
//     hours:   { <0-23>: cents },                     // positive sales by hour, store clock
//     refundCount, refundCents,                       // negative rows, as positive amounts
//     refunds: { <method>: cents },
//     tipCents,                                       // tips entered at payment (outside cents)
//     channels: { <channel>: { count, cents } } }     // positive sales by recorded channel ('' = none)
// plus `splits`: the split-tender sales as compact rows ({ ts, cents, method,
// parts }), because sharing one sale across tenders uses the dashboard's own
// tender rules and the server must not keep a second copy of them.
//
// Amounts are integer centimes. A sale's centimes are amount_cents when
// present, else amount × 100 rounded the way assets/live-link.js rounds it,
// so a day here equals the same day computed from the feed.

import { json, entitledMerchant } from '../auth/_lib.js';
import { legacyBucketFor } from './_sales-scope.js';
import { businessDate, businessBoundary, addBusinessDays, merchantZone, merchantCutoff } from './_business-day.js';

export const MAX_SPAN_DAYS = 400;
const DAY = 86400000;

const hourClocks = new Map();
function hourOf(ts, zone) {
  if (!hourClocks.has(zone)) {
    hourClocks.set(zone, new DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }));
  }
  const h = Number(hourClocks.get(zone).formatToParts(ts).find((p) => p.type === 'hour').value);
  return h >= 0 && h < 24 ? h : 0;
}

export function saleCents(row) {
  if (row.amount_cents != null && Number.isFinite(Number(row.amount_cents))) return Math.round(Number(row.amount_cents));
  return Math.round((Number(row.amount || 0) + Number.EPSILON) * 100);
}

function validParts(raw) {
  let parts;
  try { parts = JSON.parse(raw || 'null'); } catch (_) { return null; }
  if (!Array.isArray(parts)) return null;
  const clean = parts.slice(0, 8).map((p) => ({
    method: String((p && p.method) || '').slice(0, 16),
    amountCents: Math.round(Number(p && p.amountCents)),
  })).filter((p) => /^[a-z-]{1,16}$/.test(p.method) && Number.isSafeInteger(p.amountCents) && p.amountCents > 0);
  return clean.length ? clean : null;
}

/* Pure: rows → per-day buckets. Exported for the parity test. */
export function summarize(rows, from, to, cutoff, zone) {
  const days = new Map();
  for (let d = businessDate(from, cutoff, zone), guard = 0; guard <= MAX_SPAN_DAYS + 2; d = addBusinessDays(d, 1), guard++) {
    const start = businessBoundary(d, cutoff, zone);
    if (start >= to) break;
    days.set(d, {
      /* A day the window only partly covers reports the part it counted. */
      day: d, from: Math.max(start, from), to: Math.min(businessBoundary(addBusinessDays(d, 1), cutoff, zone), to),
      count: 0, cents: 0, methods: {}, whole: {}, hours: {}, refundCount: 0, refundCents: 0, refunds: {},
      tipCents: 0, channels: {},
    });
  }
  const splits = [];
  for (const row of rows) {
    const ts = Number(row.ts) || 0;
    if (ts < from || ts >= to) continue;
    const bucket = days.get(businessDate(ts, cutoff, zone));
    if (!bucket) continue;
    const cents = saleCents(row);
    const method = String(row.method || '');
    if (cents < 0) {
      bucket.refundCount++; bucket.refundCents += -cents;
      bucket.refunds[method] = (bucket.refunds[method] || 0) + -cents;
      continue;
    }
    bucket.count++; bucket.cents += cents;
    const m = bucket.methods[method] || (bucket.methods[method] = { count: 0, cents: 0 });
    m.count++; m.cents += cents;
    const tip = Math.round(Number(row.tip_cents));
    if (Number.isSafeInteger(tip) && tip > 0) bucket.tipCents += tip;
    const channel = String(row.channel || '').slice(0, 24);
    const c = bucket.channels[channel] || (bucket.channels[channel] = { count: 0, cents: 0 });
    c.count++; c.cents += cents;
    const h = hourOf(ts, zone);
    bucket.hours[h] = (bucket.hours[h] || 0) + cents;
    const parts = validParts(row.payment_parts);
    if (parts) splits.push({ ts, cents, method, parts });
    else bucket.whole[method] = (bucket.whole[method] || 0) + cents;
  }
  return { days: [...days.values()], splits };
}

async function readRows(env, merchant, legacy, from, to) {
  const shapes = [
    'SELECT ts, amount, amount_cents, method, payment_parts, tip_cents, channel FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL',
    /* Older schemas: no tip column, no tender split column, or no centimes / void columns. */
    'SELECT ts, amount, amount_cents, method, payment_parts, channel FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL',
    'SELECT ts, amount, amount_cents, method FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ? AND void_ts IS NULL',
    'SELECT ts, amount, method FROM sales WHERE merchant IN (?, ?) AND ts >= ? AND ts < ?',
  ];
  let lastError = null;
  for (const sql of shapes) {
    try {
      const rs = await env.DB.prepare(sql).bind(merchant, legacy || merchant, from, to).all();
      return (rs && rs.results) || [];
    } catch (e) { lastError = e; }
  }
  throw lastError || new Error('db');
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').slice(0, 64);
  const from = Math.floor(Number(url.searchParams.get('from')));
  const to = Math.floor(Number(url.searchParams.get('to')));
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from <= 0 || to <= from) {
    return json({ error: 'range' }, 400);
  }
  /* 400 business days, plus the hour a daylight-saving change can add to them. */
  if (to - from > MAX_SPAN_DAYS * DAY + 2 * 3600000) return json({ error: 'range-too-long', maxDays: MAX_SPAN_DAYS }, 400);
  if (!env || !env.DB) return json({ merchant: '', days: [], splits: [] });

  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant) return json({ merchant: '', days: [], splits: [] }, 403);
  const legacy = await legacyBucketFor(request, env, merchant);
  const [zone, cutoff] = await Promise.all([merchantZone(env, merchant), merchantCutoff(env, merchant)]);

  let rows;
  try { rows = await readRows(env, merchant, legacy, from, to); }
  catch (_) { return json({ merchant, error: 'db', days: [], splits: [] }, 500); }

  const { days, splits } = summarize(rows, from, to, cutoff, zone);
  return json({ merchant, zone, cutoff, from, to, days, splits, generatedAt: Date.now() });
}
