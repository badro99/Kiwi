// /api/pay-statements — payroll advances and the archive of numbered pay statements.
//
//   GET  ?merchant=slug&id=<statementId>                    → { statement }   (reprint)
//   GET  ?merchant=slug&periodStart=D&periodEnd=D[&after=C] → { advances, statements, nextCursor }  (pages of 500, oldest first)
//   GET  ?merchant=slug[&before=C]                          → { statements, nextCursor }  (pages of 100, newest first)
//   A cursor is `issued_ts.year.seq`; nextCursor is null on the last page.
//   POST { merchant, action:'advances', periodStart, periodEnd, advances:{ memberId: cents } }
//   POST { merchant, action:'issue', periodStart, periodEnd, requestId, rows:[…], replacesId? }
//
// Ruling 5 (owner, 4 Nov 2026): a statement is an immutable document with a
// number RP-YYYY-NNNN, sequential per merchant and calendar year. The number is
// allocated inside the INSERT itself (MAX(seq)+1 for the merchant and year), in
// the same D1 batch as the rows it numbers, and a unique index on
// (merchant, year, seq) refuses a duplicate: two concurrent issues can never
// share a number, and a number is only consumed by a statement that exists.
// A collision cancels the whole batch and the allocation is replayed.
// Triggers refuse UPDATE and DELETE on the archive. A correction is a NEW
// statement with replaces_id; a statement is replaced at most once.
// Salary is private: only the owner session (or a named operator) reads or
// writes, never a till, an employee or another merchant's account.
import { entitledMerchant, namedOperatorId, activeAccountSession } from '../auth/_lib.js';
import { merchantZone } from './_business-day.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const DAY = /^20\d\d-\d\d-\d\d$/;
const ID = /^[A-Za-z0-9:_.-]{1,64}$/;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const MAX_ROWS = 200;
const MAX_ATTEMPTS = 8;
// ps- + requestId (64) + - + memberId (64): the longest id a valid request can build.
const ID_MAX = 140;
const PAGE = 500;
const MAX_CENTS = 100000000000;

const yearFormats = new Map();
/* Calendar year of `ts` in the merchant's zone: the series rolls over at the
 * merchant's midnight, never the Worker's (UTC). */
export function issueYear(ts, zone) {
  let fmt = yearFormats.get(zone);
  if (!fmt) { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric' }); yearFormats.set(zone, fmt); }
  return Number(fmt.format(ts));
}

export function formatNumber(year, seq) { return `RP-${year}-${String(seq).padStart(4, '0')}`; }

const validDay = (d) => {
  if (typeof d !== 'string' || !DAY.test(d)) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
};
const cents = (n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_CENTS;
const CURSOR = /^(\d{1,15})\.(\d{4})\.(\d{1,9})$/;
const cursorOf = (row) => `${row.issued_ts}.${row.year}.${row.seq}`;
const text = (v, max) => String(v == null ? '' : v).slice(0, max);

async function ownerMerchant(request, env, asked) {
  const want = text(asked, 64);
  if (!want) return '';
  let got = '';
  try { got = await entitledMerchant(request, env, want); } catch (_) { return ''; }
  return got && got === want ? got : '';
}
/* Qui a émis : « owner:<id du compte> » ou « operator:<id de l'opérateur> ». Le
 * préfixe reste « owner » / « operator » (rôle), la suite nomme la personne. Un
 * bulletin émis ne peut plus être corrigé : son auteur doit être écrit dès
 * l'émission. Si l'identité ne se lit pas, on garde le rôle seul plutôt que
 * d'inventer un nom. */
async function actorOf(request, env) {
  try {
    const op = await namedOperatorId(request, env);
    if (op) return text('operator:' + op, 100);
  } catch (_) { /* owner */ }
  try {
    const session = await activeAccountSession(request, env);
    if (session && session.aid) return text('owner:' + session.aid, 100);
  } catch (_) { /* rôle seul */ }
  return 'owner';
}

function view(row, replacedById) {
  let snapshot = {};
  try { snapshot = JSON.parse(row.snapshot) || {}; } catch (_) { snapshot = {}; }
  return {
    id: row.id, number: row.number, year: Number(row.year), seq: Number(row.seq),
    memberId: row.member_id, memberName: row.member_name,
    periodStart: row.period_start, periodEnd: row.period_end,
    grossCents: Number(row.gross_cents), advanceCents: Number(row.advance_cents), netCents: Number(row.net_cents),
    rated: Number(row.rated) ? 1 : 0, issuedTs: Number(row.issued_ts), issuedBy: row.issued_by,
    replacesId: row.replaces_id || null, replacedById: replacedById || null, snapshot,
  };
}
const COLUMNS = 'id, year, seq, number, member_id, member_name, period_start, period_end, gross_cents, advance_cents, net_cents, rated, snapshot, replaces_id, issued_ts, issued_by';

async function withReplacements(DB, merchant, rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => '?').join(',');
  const next = (await DB.prepare(`SELECT id, replaces_id FROM pay_statements WHERE merchant = ? AND replaces_id IN (${marks})`)
    .bind(merchant, ...ids).all()).results || [];
  const by = new Map(next.map((r) => [r.replaces_id, r.id]));
  return rows.map((r) => view(r, by.get(r.id)));
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  const url = new URL(request.url);
  const merchant = await ownerMerchant(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  try {
    const id = url.searchParams.get('id');
    if (id) {
      const row = await env.DB.prepare(`SELECT ${COLUMNS} FROM pay_statements WHERE merchant = ? AND id = ?`).bind(merchant, text(id, ID_MAX)).first();
      if (!row) return json({ error: 'not-found' }, 404);
      return json({ statement: (await withReplacements(env.DB, merchant, [row]))[0] });
    }
    const start = url.searchParams.get('periodStart'), end = url.searchParams.get('periodEnd');
    if (start || end) {
      if (!validDay(start) || !validDay(end)) return json({ error: 'bad-period' }, 400);
      const adv = (await env.DB.prepare('SELECT member_id, advance_cents FROM pay_advances WHERE merchant = ? AND period_start = ? AND period_end = ?')
        .bind(merchant, start, end).all()).results || [];
      const cur = url.searchParams.get('after') ? CURSOR.exec(url.searchParams.get('after')) : null;
      if (url.searchParams.get('after') && !cur) return json({ error: 'bad-cursor' }, 400);
      const page = (await env.DB.prepare(`SELECT ${COLUMNS} FROM pay_statements WHERE merchant = ? AND period_start = ? AND period_end = ?${cur ? ' AND (issued_ts, year, seq) > (?, ?, ?)' : ''} ORDER BY issued_ts, year, seq LIMIT ${PAGE + 1}`)
        .bind(merchant, start, end, ...(cur ? [Number(cur[1]), Number(cur[2]), Number(cur[3])] : [])).all()).results || [];
      const rows = page.slice(0, PAGE);
      return json({ advances: Object.fromEntries(adv.map((r) => [r.member_id, Number(r.advance_cents)])), statements: await withReplacements(env.DB, merchant, rows), nextCursor: page.length > PAGE ? cursorOf(rows[rows.length - 1]) : null });
    }
    const before = url.searchParams.get('before') ? CURSOR.exec(url.searchParams.get('before')) : null;
    if (url.searchParams.get('before') && !before) return json({ error: 'bad-cursor' }, 400);
    const page = (await env.DB.prepare(`SELECT ${COLUMNS} FROM pay_statements WHERE merchant = ?${before ? ' AND (issued_ts, year, seq) < (?, ?, ?)' : ''} ORDER BY issued_ts DESC, year DESC, seq DESC LIMIT 101`)
      .bind(merchant, ...(before ? [Number(before[1]), Number(before[2]), Number(before[3])] : [])).all()).results || [];
    const rows = page.slice(0, 100);
    return json({ statements: await withReplacements(env.DB, merchant, rows), nextCursor: page.length > 100 ? cursorOf(rows[rows.length - 1]) : null });
  } catch (_) { return json({ error: 'db-read-failed' }, 503); }
}

function upsertAdvance(DB, merchant, start, end, memberId, advance, now, by) {
  return DB.prepare(`INSERT INTO pay_advances (merchant, period_start, period_end, member_id, advance_cents, updated_ts, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (merchant, period_start, period_end, member_id) DO UPDATE SET advance_cents = excluded.advance_cents, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`)
    .bind(merchant, start, end, memberId, advance, now, by);
}

const isCollision = (err) => /UNIQUE constraint failed|constraint/i.test(String((err && err.message) || err || ''));

function cleanRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) return null;
  const seen = new Set(), out = [];
  for (const r of rows) {
    const memberId = String(r && r.memberId || '');
    if (!ID.test(memberId) || seen.has(memberId)) return null;
    seen.add(memberId);
    const gross = r.grossCents, advance = r.advanceCents, net = r.netCents;
    if (!cents(gross) || !cents(advance) || !Number.isSafeInteger(net) || net !== gross - advance) return null;
    const rated = r.rated ? 1 : 0;
    if (rated && advance > gross) return null;
    const rate = r.rateCents == null ? null : r.rateCents;
    if (rate !== null && !cents(rate)) return null;
    if (!cents(r.baseCents)) return null;
    const hours = Number(r.hours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 100000) return null;
    out.push({ memberId, memberName: text(r.memberName, 120), gross, advance, net, rated, rate, base: r.baseCents, hours });
  }
  return out;
}

/* Issues one numbered statement per row. `now` and the year are the caller's:
 * tests pin them, the route passes the Worker clock and the merchant's zone. */
export async function issueStatements(env, merchant, input, ctx) {
  const { start, end, rows, replacesId, requestId, now, year, by, venueName, ice } = ctx;
  const ids = rows.map((r) => (requestId ? `ps-${requestId}-${r.memberId}` : `ps-${crypto.randomUUID()}`));
  const stmts = [];
  rows.forEach((r, i) => {
    const snapshot = JSON.stringify({ venueName, ice, hours: r.hours, rateCents: r.rate, baseCents: r.base, grossCents: r.gross, advanceCents: r.advance, netCents: r.net, rated: r.rated });
    stmts.push(env.DB.prepare(`INSERT INTO pay_statements (id, merchant, year, seq, number, member_id, member_name, period_start, period_end,
        gross_cents, advance_cents, net_cents, rated, snapshot, replaces_id, issued_ts, issued_by)
      SELECT ?, ?, ?, n, 'RP-' || CAST(? AS INTEGER) || '-' || printf('%04d', n), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      FROM (SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM pay_statements WHERE merchant = ? AND year = ?)`)
      .bind(ids[i], merchant, year, year, r.memberId, r.memberName, start, end, r.gross, r.advance, r.net, r.rated, snapshot, replacesId || null, now, by, merchant, year));
    stmts.push(upsertAdvance(env.DB, merchant, start, end, r.memberId, r.advance, now, by));
  });
  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try { await env.DB.batch(stmts); last = null; break; }
    catch (err) {
      last = err;
      if (!isCollision(err)) throw err;
      /* The same request already landed (a retry after an unreadable reply):
       * return what is stored, issue nothing new. */
      if (requestId) {
        const marks = ids.map(() => '?').join(',');
        const have = (await env.DB.prepare(`SELECT ${COLUMNS} FROM pay_statements WHERE merchant = ? AND id IN (${marks})`).bind(merchant, ...ids).all()).results || [];
        if (have.length === ids.length) return { rows: have, replayed: true };
      }
      if (/replaces/i.test(String(err && err.message))) throw Object.assign(new Error('already-replaced'), { code: 'already-replaced' });
    }
  }
  if (last) throw Object.assign(new Error('number-allocation-failed'), { code: 'number-allocation-failed' });
  const marks = ids.map(() => '?').join(',');
  const stored = (await env.DB.prepare(`SELECT ${COLUMNS} FROM pay_statements WHERE merchant = ? AND id IN (${marks})`).bind(merchant, ...ids).all()).results || [];
  const order = new Map(ids.map((id, i) => [id, i]));
  stored.sort((a, b) => order.get(a.id) - order.get(b.id));
  return { rows: stored, replayed: false };
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB) return json({ error: 'no-db' }, 503);
  let b;
  try { b = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await ownerMerchant(request, env, b && b.merchant);
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
  const start = b.periodStart, end = b.periodEnd;
  if (!validDay(start) || !validDay(end) || end < start || (Date.parse(end) - Date.parse(start)) > 62 * 86400000) return json({ error: 'bad-period' }, 400);
  const by = await actorOf(request, env);
  const now = Date.now();

  if (b.action === 'advances') {
    const entries = Object.entries(b.advances && typeof b.advances === 'object' && !Array.isArray(b.advances) ? b.advances : {});
    if (!entries.length || entries.length > MAX_ROWS || entries.some(([id, c]) => !ID.test(id) || !cents(c))) return json({ error: 'bad-advances' }, 400);
    try { await env.DB.batch(entries.map(([id, c]) => upsertAdvance(env.DB, merchant, start, end, id, c, now, by))); }
    catch (_) { return json({ error: 'db-write-failed' }, 503); }
    return json({ ok: true, advances: Object.fromEntries(entries) });
  }

  if (b.action !== 'issue') return json({ error: 'bad-action' }, 400);
  const rows = cleanRows(b.rows);
  if (!rows) return json({ error: 'bad-rows' }, 400);
  const requestId = b.requestId == null ? '' : String(b.requestId);
  if (requestId && !REQUEST_ID.test(requestId)) return json({ error: 'bad-request-id' }, 400);
  const replacesId = b.replacesId == null ? '' : text(b.replacesId, ID_MAX);
  try {
    if (replacesId) {
      if (rows.length !== 1) return json({ error: 'correction-is-one-statement' }, 400);
      const old = await env.DB.prepare('SELECT member_id, period_start, period_end FROM pay_statements WHERE merchant = ? AND id = ?').bind(merchant, replacesId).first();
      if (!old) return json({ error: 'replaces-not-found' }, 404);
      if (old.member_id !== rows[0].memberId || old.period_start !== start || old.period_end !== end) return json({ error: 'replaces-mismatch' }, 409);
    }
    const venue = b.venue && typeof b.venue === 'object' ? b.venue : {};
    const zone = await merchantZone(env, merchant);
    const out = await issueStatements(env, merchant, b, { start, end, rows, replacesId, requestId, now, year: issueYear(now, zone), by,
      venueName: text(venue.name, 120), ice: /^\d{1,20}$/.test(String(venue.ice || '')) ? String(venue.ice) : '' });
    return json({ ok: true, replayed: out.replayed, statements: await withReplacements(env.DB, merchant, out.rows) });
  } catch (err) {
    if (err && err.code === 'already-replaced') return json({ error: 'already-replaced' }, 409);
    if (err && err.code === 'number-allocation-failed') return json({ error: 'number-allocation-failed' }, 503);
    return json({ error: 'db-write-failed' }, 503);
  }
}
