#!/usr/bin/env node
/* Un plan de salle modifié pendant des mois reste enregistrable.
 *
 * Deux appareils modifient le même plan (déplacements, renumérotations, places,
 * tables supprimées puis recréées) pendant plus de 200 jours simulés, avec des
 * modifications concurrentes sur les mêmes champs entre deux échanges. Chaque
 * échange passe par la vraie fusion (assets/field-merge.js › floorStamp /
 * floorMerge) et, régulièrement, par la vraie route d'écriture du document
 * (functions/api/store.js, feature floorplan, sur node:sqlite).
 *
 * Tenu : les deux appareils convergent ; les métadonnées restent bornées
 * (4 versions vues par champ, 50 conflits au journal, marques de suppression
 * retirées 90 jours après) ; chaque écriture est acceptée par le serveur ; une
 * copie restée hors ligne longtemps ne gagne pas en silence (conflit noté).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/field-merge.js'), 'utf8'), ctx, { filename: 'field-merge.js' });
vm.runInContext('globalThis.__clock = 0; Date.now = () => globalThis.__clock;', ctx);
const FM = ctx.KiwiFieldMerge;
const setClock = (t) => { ctx.__clock = t; };
const plain = (x) => JSON.parse(JSON.stringify(x));

const { onRequestPost: storePost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
const { tillToken } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

/* The real store route on an in-memory D1. */
const AUTH_SECRET = 'floorplan-long-run-secret-0123456789';
const SHOP = 'amira-cafe-banc-long';
const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, till_epoch INTEGER NOT NULL DEFAULT 0, updated_ts INTEGER);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
`);
db.prepare(`INSERT INTO accounts VALUES ('acc-1','o@amira.ma','Amira Cafe','s','h',?,'active',0)`).run(Date.now());
db.prepare(`INSERT INTO merchant_config VALUES (?, '{}','pro','restaurant','acc-1','Amira Cafe','active',0,?)`).run(SHOP, Date.now());
const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const st = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = st.get(...p); return row === undefined ? null : row; },
      async all() { return { results: st.all(...p) }; },
      async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
} };
const till = `kiwi_till=${await tillToken(AUTH_SECRET, SHOP)}`;
// Each save names the revision it builds on, like the till (compare-and-swap).
const save = async (data) => {
  const row = db.prepare(`SELECT rev FROM store_docs WHERE merchant=? AND feature='floorplan'`).get(SHOP);
  return storePost({ request: new Request('https://k/api/store', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: till, 'CF-Connecting-IP': '10.0.0.3' },
    body: JSON.stringify({ feature: 'floorplan', merchant: SHOP, data, baseRev: row ? row.rev : 0 }) }), env });
};

/* A seeded generator so a red run reproduces. */
let seed = 1106;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
const pick = (a) => a[Math.floor(rand() * a.length)];

const DAY = 864e5, T0 = Date.UTC(2026, 0, 5);
let nextId = 0;
const table = (zone) => ({ id: 't' + (nextId++).toString(36), zone, num: String(nextId), seats: 4, x: 40, y: 40, type: 'round4' });
const zones = ['zsalle', 'zterrasse', 'zetage'].map((id, i) => ({ id, name: ['Salle', 'Terrasse', 'Étage'][i], room: { w: 900, h: 600 } }));
const start = { zones, tables: Array.from({ length: 60 }, (_, i) => table(zones[i % 3].id)), objects: [], rooms: [] };

function edit(doc) {
  const out = plain(doc);
  const t = pick(out.tables);
  const r = rand();
  if (r < 0.45) { t.x = Math.round(rand() * 860); t.y = Math.round(rand() * 560); }
  else if (r < 0.65) t.seats = 2 + Math.floor(rand() * 6);
  else if (r < 0.8) t.num = String(1 + Math.floor(rand() * 99));
  else if (r < 0.9) { out.tables = out.tables.filter((x) => x !== t); out.tables.push(table(pick(zones).id)); }
  else pick(out.zones).name = pick(['Salle', 'Grande salle', 'Patio', 'Terrasse', 'Étage', 'Mezzanine']);
  return out;
}
const write = (prev, next, at) => { setClock(at); return plain(FM.floorStamp(next, prev)); };
const exchange = (a, b) => plain(FM.floorMerge(a, b));
const content = (d) => { const { fieldEdits, ...rest } = d; return JSON.stringify(rest); };

setClock(T0);
let A = plain(FM.floorStamp(start, {}));
let B = plain(A);
let clock = T0;
const ROUNDS = +process.env.ROUNDS || 480;
let maxBytes = 0, saves = 0;
for (let round = 1; round <= ROUNDS; round++) {
  clock += 11.5 * 3600e3; // half a day a round: about 230 days in all
  A = write(A, edit(A), clock);
  B = write(B, edit(B), clock + 1); // both edit between exchanges: same-field conflicts happen
  if (round % 3 === 0) { const m = exchange(A, B); A = plain(m); B = plain(exchange(B, A)); }
  if (round % 80 === 0) {
    const bytes = JSON.stringify(A).length;
    maxBytes = Math.max(maxBytes, bytes);
    const res = await save(A);
    assert.equal(res.status, 200, `round ${round}: the plan stays saveable (${bytes} bytes) : ${res.status} ${await res.clone().text()}`);
    saves++;
  }
}
const final = exchange(A, B), finalB = exchange(B, A);
assert.equal(content(final), content(finalB), 'both devices converge on the same plan');
assert.deepEqual(final.fieldEdits.fields, finalB.fieldEdits.fields, 'and on the same registers');

const fields = final.fieldEdits.fields;
const newest = Math.max(...fields.map((f) => f[1]));
assert.ok(fields.every((f) => f[3].length <= 4), 'each field remembers at most 4 superseded versions');
assert.ok(final.fieldEdits.conflicts.length <= 50, 'the conflict journal keeps its 50 latest entries');
assert.ok(final.fieldEdits.conflicts.length > 0, 'concurrent edits of the same field were journaled');
assert.ok(fields.filter((f) => f[4]).every((f) => newest - f[1] <= 90 * DAY), 'no deletion marker older than 90 days remains');
assert.ok(maxBytes < 200000, `the document stays far under the 400 000-byte store cap (peak ${maxBytes})`);

const res = await save(final);
assert.equal(res.status, 200);
const stored = JSON.parse(db.prepare(`SELECT data FROM store_docs WHERE merchant=? AND feature='floorplan'`).get(SHOP).data);
assert.equal(stored.fieldEdits.fields.length, fields.length, 'the store keeps the bounded registers whole');

/* A copy left offline for a long time does not win silently: its edit is older,
 * so the current value stays, and the clash is journaled for review. */
const stale = plain(A);
const target = stale.tables[0].id;
for (let i = 0; i < 40; i++) { clock += 3600e3; A = write(A, (() => { const d = plain(A); d.tables.find((t) => t.id === target).x = i; return d; })(), clock); }
const staleEdit = plain(stale); staleEdit.tables.find((t) => t.id === target).x = 777;
const staleNext = write(stale, staleEdit, clock - 30 * 3600e3);
const back = exchange(A, staleNext);
assert.equal(back.tables.find((t) => t.id === target).x, 39, 'the newer value is kept');
assert.ok(back.fieldEdits.conflicts.some((c) => JSON.parse(c.field).includes('x') && c.value === 777), 'the stale value is journaled, not lost silently');

console.log(`✓ floorplan-long-run · ${ROUNDS} rounds over ~${Math.round((clock - T0) / DAY)} days, ${saves + 1} store writes accepted, peak ${maxBytes} bytes, metadata bounded, devices converge`);
