// GET /api/comptable/books?month=YYYY-MM            (ou)
// GET /api/comptable/books?from=YYYY-MM-DD&to=YYYY-MM-DD   (jours d'activité, bornes incluses)
//
// Les livres d'UN établissement, en lecture seule, pour son expert-comptable.
// Le magasin n'est jamais un paramètre : il vient de l'accès prouvé par le
// cookie `kiwi_acct` (voir _lib.js). Aucune écriture, aucun DDL, aucun repli.
//
// Même jour d'activité que le reste du produit (functions/api/_business-day.js :
// coupure à 05:00 par défaut, fuseau de la caisse), mêmes règles de lecture que
// month-report.js / z-reconciliation.js / cash-sessions.js / invoice.js :
//   · une vente annulée (void_ts) sort des chiffres et se liste à part ;
//   · un remboursement est une ligne négative (sale/refund.js) ;
//   · le montant fait foi en centimes, les anciennes lignes en dirhams entiers.
//
// Rien de ce qui ressemble à un identifiant de personnel, un code, un téléphone
// n'est sélectionné : chaque section est une projection explicite. Les noms de
// client ne sortent que de la facture, qui les porte légalement.

import { json } from '../../auth/_lib.js';
import { merchantZone, merchantCutoff, businessBoundary, businessDate, addBusinessDays } from '../_business-day.js';
import { authAccountant } from './_lib.js';

const MAX_DAYS = 93;
const SALES_CAP = 20000;
const INVOICE_CAP = 5000;
const EVENT_CAP = 5000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^(20\d{2})-(0[1-9]|1[0-2])$/;

function validDay(day) {
  if (!DAY_RE.test(day)) return false;
  const t = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === day;
}
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
const cents = (row) => (row.amount_cents == null ? Math.round(Number(row.amount) * 100) : Number(row.amount_cents));
const ordinal = (map, key) => { if (!map.has(key)) map.set(key, map.size + 1); return map.get(key); };

async function columnsOf(db, table) {
  try {
    const res = await db.prepare(`PRAGMA table_info(${table})`).all();
    return new Set(((res && res.results) || []).map((c) => c.name));
  } catch (_) { return new Set(); }
}

function localClock(zone) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  return (ts) => fmt.format(ts);
}

/* Répartition d'un encaissement par moyen de paiement. Un ticket réglé en
 * plusieurs moyens (payment_parts, commerce) se répartit sur ses parts quand
 * elles retombent exactement sur le montant ; sinon il garde son moyen. */
function methodParts(row, amountCents) {
  let parts = null;
  if (row.payment_parts) {
    try {
      const raw = JSON.parse(row.payment_parts);
      if (Array.isArray(raw)) {
        parts = raw
          .map((p) => ({ method: String(p && p.method || '').slice(0, 16), cents: Math.round(Number(p && p.amountCents)) }))
          .filter((p) => /^[a-z-]{1,16}$/.test(p.method) && Number.isFinite(p.cents) && p.cents > 0);
      }
    } catch (_) { parts = null; }
  }
  if (parts && parts.length > 1 && parts.reduce((s, p) => s + p.cents, 0) === amountCents) return parts;
  return null;
}
function addTo(map, key, value) { map[key] = (map[key] || 0) + value; }

async function readSales(db, merchant, fromTs, toTs, cutoff, zone) {
  const cols = await columnsOf(db, 'sales');
  const pick = ['id', 'amount', 'amount_cents', 'method', 'ref', 'ts', 'channel', 'payment_parts', 'tip_cents', 'void_ts', 'void_reason']
    .filter((c) => cols.has(c));
  const res = await db.prepare(
    `SELECT ${pick.join(', ')} FROM sales WHERE merchant = ? AND ts >= ? AND ts < ? ORDER BY ts, id LIMIT ${SALES_CAP + 1}`
  ).bind(merchant, fromTs, toTs).all();
  let rows = (res && res.results) || [];
  const truncated = rows.length > SALES_CAP;
  if (truncated) rows = rows.slice(0, SALES_CAP);

  const clock = localClock(zone);
  const journal = [], refunds = [], voids = [];
  const days = new Map();
  const summary = { grossCents: 0, refundsCents: 0, netCents: 0, count: 0, refundCount: 0, voidCount: 0, voidCents: 0, tipsCents: 0, byMethod: {} };
  const dayOf = (d) => {
    if (!days.has(d)) days.set(d, { day: d, count: 0, grossCents: 0, refundsCents: 0, netCents: 0, byMethod: {} });
    return days.get(d);
  };

  for (const row of rows) {
    const amountCents = cents(row);
    if (!Number.isFinite(amountCents)) continue;
    const ts = Number(row.ts);
    const day = businessDate(ts, cutoff, zone);
    const time = clock(ts);
    const method = String(row.method || '').slice(0, 16);
    if (row.void_ts) {
      summary.voidCount++; summary.voidCents += Math.abs(amountCents);
      voids.push({ day, time, ref: String(row.ref || '').slice(0, 40), method, amountCents, reason: String(row.void_reason || '').slice(0, 24), voidedTs: Number(row.void_ts) });
      continue;
    }
    const isRefund = amountCents < 0;
    const parts = methodParts(row, amountCents);
    const tip = row.tip_cents == null ? 0 : Math.max(0, Math.round(Number(row.tip_cents)) || 0);
    const entry = {
      day, time, ref: String(row.ref || '').slice(0, 40), kind: isRefund ? 'refund' : 'sale',
      method, parts, amountCents, channel: String(row.channel || '').slice(0, 24), tipCents: tip,
    };
    journal.push(entry);
    const d = dayOf(day);
    d.netCents += amountCents;
    summary.netCents += amountCents;
    if (isRefund) {
      d.refundsCents += -amountCents; summary.refundsCents += -amountCents;
      summary.refundCount++;
      refunds.push({ day, time, ref: entry.ref, method, amountCents });
    } else {
      d.count++; summary.count++;
      d.grossCents += amountCents; summary.grossCents += amountCents;
      summary.tipsCents += tip;
    }
    if (parts) parts.forEach((p) => { addTo(d.byMethod, p.method, p.cents); addTo(summary.byMethod, p.method, p.cents); });
    else { addTo(d.byMethod, method, amountCents); addTo(summary.byMethod, method, amountCents); }
  }
  return { summary, days, journal, refunds, voids, truncated };
}

async function readInvoices(db, merchant, fromTs, toTs, cutoff, zone) {
  const res = await db.prepare(
    `SELECT seq, number, customer, snapshot, created_ts FROM sale_invoices
      WHERE merchant = ? AND created_ts >= ? ORDER BY seq LIMIT ${INVOICE_CAP + 1}`
  ).bind(merchant, fromTs).all();
  let rows = (res && res.results) || [];
  const truncated = rows.length > INVOICE_CAP;
  if (truncated) rows = rows.slice(0, INVOICE_CAP);
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) : null; };
  const invoices = [];
  const vat = { source: 'invoices', byRate: {}, htCents: 0, tvaCents: 0, ttcCents: 0, invoiceCount: 0 };
  for (const row of rows) {
    let snap = null, cust = null;
    try { snap = JSON.parse(row.snapshot); } catch (_) {}
    try { cust = row.customer ? JSON.parse(row.customer) : null; } catch (_) {}
    snap = snap && typeof snap === 'object' ? snap : {};
    const issuedTs = Number(snap.issuedTs) || Number(row.created_ts);
    if (!(issuedTs >= fromTs && issuedTs < toTs)) continue;
    const totals = snap.totals && typeof snap.totals === 'object' ? snap.totals : {};
    const ht = num(totals.ht), tva = num(totals.tva), ttc = num(totals.ttc);
    const rate = Number(snap.tvaRate);
    const tvaRate = Number.isFinite(rate) && rate >= 0 ? rate : null;
    invoices.push({
      seq: Number(row.seq), number: String(row.number || ''), day: businessDate(issuedTs, cutoff, zone), issuedTs,
      customer: cust ? { name: String(cust.name || '').slice(0, 80), ice: String(cust.ice || '').slice(0, 15), if: String(cust.if || '').slice(0, 30) } : null,
      htCents: ht, tvaCents: tva, ttcCents: ttc, tvaRate,
    });
    if (ttc != null) {
      vat.invoiceCount++; vat.ttcCents += ttc;
      if (ht != null) vat.htCents += ht;
      if (tva != null) vat.tvaCents += tva;
      const key = tvaRate == null ? 'inconnu' : String(tvaRate);
      const bucket = vat.byRate[key] || (vat.byRate[key] = { htCents: 0, tvaCents: 0, ttcCents: 0, count: 0 });
      bucket.count++; bucket.ttcCents += ttc;
      if (ht != null) bucket.htCents += ht;
      if (tva != null) bucket.tvaCents += tva;
    }
  }
  return { invoices, vat, truncated };
}

async function readCash(db, merchant, fromTs, toTs, cutoff, zone) {
  const res = await db.prepare(
    `SELECT session_id, terminal_id, event_type, expected_cents, counted_cents, gap_cents,
            movement_kind, movement_amount_cents, movement_reason, opened_ts, occurred_ts
       FROM cash_session_events
      WHERE merchant = ? AND session_id IN (
        SELECT session_id FROM cash_session_events WHERE merchant = ? AND occurred_ts >= ? AND occurred_ts < ?)
      ORDER BY occurred_ts LIMIT ${EVENT_CAP + 1}`
  ).bind(merchant, merchant, fromTs, toTs).all();
  let rows = (res && res.results) || [];
  const truncated = rows.length > EVENT_CAP;
  if (truncated) rows = rows.slice(0, EVENT_CAP);
  const terminals = new Map(), sessions = new Map();
  for (const e of rows) {
    const key = e.terminal_id + '\u0000' + e.session_id;
    if (!sessions.has(key)) {
      sessions.set(key, {
        terminal: ordinal(terminals, e.terminal_id), openedTs: Number(e.opened_ts) || 0,
        openingCents: null, movements: [], handovers: 0, closedTs: null, expectedCents: null, countedCents: null, gapCents: null,
      });
    }
    const s = sessions.get(key);
    const t = Number(e.occurred_ts);
    if (e.event_type === 'open') { s.openingCents = e.expected_cents == null ? null : Number(e.expected_cents); s.openedTs = Number(e.opened_ts) || t; }
    else if (e.event_type === 'movement') {
      s.movements.push({ ts: t, kind: String(e.movement_kind || ''), amountCents: Number(e.movement_amount_cents) || 0, reason: String(e.movement_reason || '').slice(0, 120) });
    } else if (e.event_type === 'handover') s.handovers++;
    else if (e.event_type === 'close') {
      s.closedTs = t; s.expectedCents = e.expected_cents == null ? null : Number(e.expected_cents);
      s.countedCents = e.counted_cents == null ? null : Number(e.counted_cents); s.gapCents = e.gap_cents == null ? null : Number(e.gap_cents);
    }
  }
  const list = [...sessions.values()].sort((a, b) => a.openedTs - b.openedTs).map((s) => ({
    ...s, day: businessDate(s.openedTs || fromTs, cutoff, zone),
  }));
  return { sessions: list, truncated };
}

async function readZ(db, merchant, fromDay, toDay) {
  const res = await db.prepare(
    `SELECT business_day, terminal_id, reported_count, reported_cents, server_count, server_cents,
            missing_count, missing_cents, mismatch_count, extra_count, status, updated_ts
       FROM z_reconciliations WHERE merchant = ? AND business_day >= ? AND business_day <= ?
      ORDER BY business_day, updated_ts LIMIT 2000`
  ).bind(merchant, fromDay, toDay).all();
  const terminals = new Map();
  return ((res && res.results) || []).map((r) => ({
    day: String(r.business_day), terminal: ordinal(terminals, r.terminal_id),
    reportedCount: Number(r.reported_count) || 0, reportedCents: Number(r.reported_cents) || 0,
    serverCount: Number(r.server_count) || 0, serverCents: Number(r.server_cents) || 0,
    missingCount: Number(r.missing_count) || 0, missingCents: Number(r.missing_cents) || 0,
    mismatchCount: Number(r.mismatch_count) || 0, extraCount: Number(r.extra_count) || 0,
    status: String(r.status || '').slice(0, 16), updatedTs: Number(r.updated_ts) || 0,
  }));
}

/* Une section absente (table pas encore créée en production) est dite
 * « non enregistrée », jamais comptée comme vide : zéro et « on ne sait pas »
 * ne se lisent pas pareil dans un dossier comptable. */
async function section(fn) {
  try { return { status: 'ok', ...(await fn()) }; }
  catch (err) {
    if (/no such table/i.test(String(err && err.message || err))) return { status: 'not-recorded' };
    return { status: 'unavailable' };
  }
}

export async function onRequest({ request, env }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: 'read-only', message: 'Espace comptable : lecture seule.' }, 405, { Allow: 'GET, HEAD' });
  }
  const auth = await authAccountant(request, env);
  if (auth.response) return auth.response;
  const { merchant } = auth.access;
  const db = env.DB;

  const url = new URL(request.url);
  /* Le magasin vient de l'accès, jamais de la requête. Un client qui en nomme
   * un autre n'est pas réorienté en silence : il est refusé. */
  const asked = url.searchParams.get('merchant');
  if (asked && asked !== merchant) return json({ error: 'forbidden-merchant' }, 403);
  let zone, cutoff;
  try { zone = await merchantZone(env, merchant); cutoff = await merchantCutoff(env, merchant); }
  catch (_) { return json({ error: 'unavailable' }, 503); }

  let from, to, month = '';
  if (url.searchParams.get('from') || url.searchParams.get('to')) {
    from = String(url.searchParams.get('from') || ''); to = String(url.searchParams.get('to') || '');
    if (!validDay(from) || !validDay(to) || to < from) return json({ error: 'invalid-range' }, 400);
  } else {
    month = String(url.searchParams.get('month') || businessDate(Date.now(), cutoff, zone).slice(0, 7));
    if (!MONTH_RE.test(month)) return json({ error: 'invalid-month' }, 400);
    ({ from, to } = monthRange(month));
  }
  const dayCount = Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
  if (dayCount > MAX_DAYS) return json({ error: 'range-too-large', maxDays: MAX_DAYS }, 400);
  const fromTs = businessBoundary(from, cutoff, zone);
  const toTs = businessBoundary(addBusinessDays(to, 1), cutoff, zone);

  let store = { name: merchant, type: '' };
  try {
    const info = await db.prepare('SELECT name, type FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    if (info) store = { name: String(info.name || merchant).slice(0, 80), type: String(info.type || '').slice(0, 24) };
  } catch (_) {}

  const sales = await section(() => readSales(db, merchant, fromTs, toTs, cutoff, zone));
  const inv = await section(() => readInvoices(db, merchant, fromTs, toTs, cutoff, zone));
  const cash = await section(() => readCash(db, merchant, fromTs, toTs, cutoff, zone));
  const z = await section(async () => ({ rows: await readZ(db, merchant, from, to) }));

  const dayList = [];
  if (sales.status === 'ok') {
    for (let i = 0; i < dayCount; i++) {
      const d = addBusinessDays(from, i);
      dayList.push(sales.days.get(d) || { day: d, count: 0, grossCents: 0, refundsCents: 0, netCents: 0, byMethod: {} });
    }
  }

  return json({
    ok: true,
    readOnly: true,
    merchant,
    store,
    accessLabel: auth.access.label,
    accessExpiresTs: auth.access.expiresTs,
    range: { month, from, to, fromTs, toTs, zone, cutoffHour: cutoff, days: dayCount },
    sales: sales.status !== 'ok' ? { status: sales.status } : {
      status: 'ok', truncated: sales.truncated,
      summary: sales.summary, days: dayList, journal: sales.journal, refunds: sales.refunds, voids: sales.voids,
    },
    invoices: inv.status !== 'ok' ? { status: inv.status } : { status: 'ok', truncated: inv.truncated, rows: inv.invoices },
    vat: inv.status !== 'ok' ? { status: inv.status } : {
      status: 'ok', ...inv.vat,
      note: 'Calculée à partir des factures émises uniquement. Les tickets de caisse ne portent pas de taux.',
    },
    cash: cash.status !== 'ok' ? { status: cash.status } : { status: 'ok', truncated: cash.truncated, sessions: cash.sessions },
    z: z.status !== 'ok' ? { status: z.status } : { status: 'ok', rows: z.rows },
  });
}
