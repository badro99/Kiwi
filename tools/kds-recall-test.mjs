#!/usr/bin/env node
import caisseTestSource from './caisse-test-source.cjs';
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · RAPPELER UN BON MARQUÉ PRÊT PAR ERREUR (serveur)
 *
 * Un doigt sur « Prête » au coup de feu, et le bon quittait l'écran de la
 * cuisine. FROM interdit `ready → accepted` (une étape ne se défait pas en
 * silence) : le rappel est donc un geste NOMMÉ (`status: 'recall'`), journalisé,
 * marqué sur chaque ligne rappelée. Ce test le joue contre le vrai
 * functions/api/order/queue.js, sur une vraie base SQLite construite depuis
 * schema.sql.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import { tillToken, TILL_COOKIE } from '../functions/auth/_lib.js';
import * as queue from '../functions/api/order/queue.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_SECRET = 'kds-recall-test-secret';
const MERCHANT = 'recall-bistro';

let failures = 0;
function check(label, condition, detail) {
  if (condition) { console.log(`  ✓ ${label}`); return; }
  failures++;
  console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`);
}

function makeDB() {
  const db = new DatabaseSync(':memory:');
  const raw = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
  for (const stmt of raw.replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  const facade = { _db: db };
  facade.prepare = (query) => {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = db.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: db.prepare(query).all(...args) }; },
      run() {
        const r = db.prepare(query).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
    };
    return st;
  };
  facade.batch = async (statements) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = [];
      for (const statement of statements) result.push(await statement.run());
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch (_) {}
      throw error;
    }
  };
  return facade;
}

const db = makeDB();
const env = { DB: db, AUTH_SECRET };
const sql = db._db;
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)')
  .run(MERCHANT, JSON.stringify({ orderpro: true }), 'Recall Bistro', Date.now());
const cookie = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, MERCHANT)}`;

async function post(body) {
  const req = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ merchant: MERCHANT, ...body }),
  });
  const res = await queue.onRequestPost({ request: req, env, waitUntil() {} });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

let seq = 0;
function seedOrder({ status, lines, readyCourse }) {
  seq++;
  const id = `ord-recall-test-${String(seq).padStart(4, '0')}`;
  const ts = Date.now() - 60_000;
  sql.prepare(`INSERT INTO orders (id, merchant, number, mode, table_no, total, lines, status, created_ts, updated_ts)
               VALUES (?, ?, ?, 'table', '7', 100, ?, ?, ?, ?)`)
    .run(id, MERCHANT, 40 + seq, JSON.stringify(lines), status, ts, ts);
  if (readyCourse) {
    sql.prepare(`INSERT INTO order_course (merchant, order_id, order_number, accepted_ts, sent_ts, ready_ts, created_ts, updated_ts)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(MERCHANT, id, 40 + seq, ts, ts, ts + 30_000, ts, ts);
  }
  return id;
}
const row = (id) => sql.prepare('SELECT status, lines, updated_ts FROM orders WHERE id = ?').get(id);
const linesOf = (id) => JSON.parse(row(id).lines);
const events = (id) => sql.prepare(
  "SELECT event, detail FROM operational_events WHERE merchant = ? AND command_id = ? AND event = 'order-recalled'"
).all(MERCHANT, id);

const kitchen = (name) => ({ id: 'it-' + name, name, qty: 1, unitPrice: 50, station: 'cuisine' });
const bar = (name) => ({ id: 'it-' + name, name, qty: 1, unitPrice: 20, station: 'bar' });

console.log('■ KDS recall (tools/kds-recall-test.mjs)');

console.log('\n■ 1. The generic transition still refuses ready → accepted');
{
  const id = seedOrder({ status: 'ready', lines: [kitchen('Tajine')] });
  const r = await post({ id, status: 'accepted' });
  check('status: accepted on a ready order stays a 409', r.status === 409, JSON.stringify(r));
  check('the order is still ready', row(id).status === 'ready');
}

console.log('\n■ 2. Recalling a whole ticket marked ready by mistake');
{
  const id = seedOrder({ status: 'ready', lines: [kitchen('Tajine'), kitchen('Couscous')], readyCourse: true });
  const before = row(id).updated_ts;
  const r = await post({ id, status: 'recall' });
  check('recall answers 200 with recalled:true', r.status === 200 && r.data.ok && r.data.recalled === true, JSON.stringify(r));
  check('the answer carries status accepted', r.data.status === 'accepted');
  check('the order is back in preparation', row(id).status === 'accepted');
  const lines = linesOf(id);
  check('every line is no longer stationReady', lines.every((l) => l.stationReady === false));
  check('every line carries recalledAt, stamped with the new revision',
    lines.every((l) => l.recalledAt === row(id).updated_ts));
  check('updated_ts moved forward so polls pick it up', row(id).updated_ts > before);
  check('the answer echoes the rewritten lines', Array.isArray(r.data.lines) && r.data.lines.length === 2
    && r.data.lines.every((l) => l.recalledAt > 0));
  const ev = events(id);
  check('one order-recalled audit row is written', ev.length === 1, JSON.stringify(ev));
  check('the audit names the previous status', ev[0] && JSON.parse(ev[0].detail).previousStatus === 'ready');
  const course = sql.prepare('SELECT ready_ts FROM order_course WHERE merchant = ? AND order_id = ?').get(MERCHANT, id);
  check('the prep-time stat forgets the false "ready"', course && course.ready_ts === null, JSON.stringify(course));

  const again = await post({ id, status: 'ready' });
  check('the kitchen can mark it ready again for real', again.status === 200 && row(id).status === 'ready', JSON.stringify(again));
}

console.log('\n■ 3. Station-scoped recall leaves the other station alone');
{
  const id = seedOrder({ status: 'ready', lines: [kitchen('Pastilla'), bar('Thé')] });
  const r = await post({ id, status: 'recall', station: 'bar' });
  check('bar recall answers 200', r.status === 200, JSON.stringify(r));
  const lines = linesOf(id);
  const tea = lines.find((l) => l.station === 'bar');
  const pastilla = lines.find((l) => l.station === 'cuisine');
  check('only the bar line is recalled', tea.stationReady === false && tea.recalledAt > 0);
  check('the kitchen line is written as done (it was)', pastilla.stationReady === true && !pastilla.recalledAt);
  check('the order goes back to accepted', row(id).status === 'accepted');
  const rebump = await post({ id, status: 'ready', station: 'bar' });
  check('when the bar re-finishes, the order is ready again without the kitchen re-bumping',
    rebump.status === 200 && rebump.data.status === 'ready' && row(id).status === 'ready', JSON.stringify(rebump));
}

console.log('\n■ 4. A station that finished its part on a still-open ticket');
{
  const id = seedOrder({ status: 'accepted', lines: [{ ...kitchen('Harira'), stationReady: true }, bar('Jus')] });
  const r = await post({ id, status: 'recall', station: 'cuisine' });
  check('recalling the kitchen part of an accepted order is allowed', r.status === 200, JSON.stringify(r));
  const harira = linesOf(id).find((l) => l.station === 'cuisine');
  check('the kitchen line is back to not ready', harira.stationReady === false && harira.recalledAt > 0);
  check('the bar line is untouched (it was never done)', linesOf(id).find((l) => l.station === 'bar').stationReady !== true);
  const nothing = await post({ id, status: 'recall', station: 'bar' });
  check('recalling a station that never finished is a 409 not-ready', nothing.status === 409 && nothing.data.error === 'not-ready', JSON.stringify(nothing));
}

console.log('\n■ 5. What a recall must refuse');
{
  const served = seedOrder({ status: 'served', lines: [kitchen('Brochettes')] });
  const r1 = await post({ id: served, status: 'recall' });
  check('a served order cannot be recalled (the plate left)', r1.status === 409 && row(served).status === 'served', JSON.stringify(r1));
  const rejected = seedOrder({ status: 'rejected', lines: [kitchen('Brochettes')] });
  const r2 = await post({ id: rejected, status: 'recall' });
  check('a rejected order cannot be recalled', r2.status === 409 && row(rejected).status === 'rejected', JSON.stringify(r2));
  const ready = seedOrder({ status: 'ready', lines: [kitchen('Salade')] });
  const r3 = await post({ id: ready, status: 'recall', station: 'bar' });
  check('a station absent from the ticket is a 400', r3.status === 400 && r3.data.error === 'station-not-on-order', JSON.stringify(r3));
  check('and changes nothing', row(ready).status === 'ready' && events(ready).length === 0);
  const r4 = await post({ id: 'ord-recall-test-missing', status: 'recall' });
  check('an unknown order is a 404', r4.status === 404, JSON.stringify(r4));
}

console.log('\n■ 6. Another tenant cannot recall our tickets');
{
  const id = seedOrder({ status: 'ready', lines: [kitchen('Rfissa')] });
  const other = `${TILL_COOKIE}=${await tillToken(AUTH_SECRET, 'someone-else')}`;
  const req = new Request('https://kiwi-os.com/api/order/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: other },
    body: JSON.stringify({ merchant: MERCHANT, id, status: 'recall' }),
  });
  const res = await queue.onRequestPost({ request: req, env, waitUntil() {} });
  check('a till paired to another merchant gets a 403', res.status === 403);
  check('the order is still ready', row(id).status === 'ready');
}

console.log('\n■ 7. Every surface that bumps a ticket can take it back');
{
  const caisse = caisseTestSource(fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8'));
  const cuisine = fs.readFileSync(path.join(ROOT, 'kiwi-cuisine.html'), 'utf8');
  check('the caisse KDS has kdsRecall', /function kdsRecall\(/.test(caisse));
  check('kdsRecall pushes the named recall gesture', /function kdsRecall[\s\S]{0,1600}opPush\(o,\s*'recall'/.test(caisse));
  check('the caisse poll honours a recall from another screen', /recalledAt/.test(caisse) && /recallSeen/.test(caisse));
  check('kiwi-cuisine.html offers Rappeler on finished tickets', /data-recall=/.test(cuisine));
  check('kiwi-cuisine.html sends status recall', /sendBump\([^)]*'recall'/.test(cuisine));
}

console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ KDS recall holds');
process.exit(failures ? 1 : 0);
