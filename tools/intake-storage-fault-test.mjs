#!/usr/bin/env node
/* Kiwi · intake storage fault test — a supplier invoice survives a crash at
 * every write boundary.
 *
 * Depositing a PDF and posting its stock crosses two stores: the private
 * object store (R2, the original kept as the accounting record) and the
 * database (D1: the intake register and the stock ledger). A phone can lose
 * power or signal between any two writes. This suite runs the REAL routes
 * (/api/ai/intake, /api/inventory/movements) with the real auth code on a
 * REAL SQLite database built from schema.sql (D1 is SQLite), and a bucket
 * that writes real files to a temp directory. It stops the flow at each write
 * boundary, replays it the way the till does, and checks after every step:
 *   · an object exists in the bucket exactly when its register row says
 *     has_object = 1 (no orphan file, no row pointing at nothing);
 *   · the stock ledger holds each received line once, never twice;
 *   · a document is confirmed only once all its lines are in the ledger.
 * The other intake suites prove the same protocol against in-memory doubles;
 * this one proves it against storage that really writes.
 *
 *   node tools/intake-storage-fault-test.mjs
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
import { onRequestPost as intakePost, onRequestPut as intakePut, onRequestGet as intakeGet } from '../functions/api/ai/intake.js';
import { onRequestPost as movementsPost } from '../functions/api/inventory/movements.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const box = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-intake-fault-'));
let checks = 0;
const ok = (name) => { checks++; console.log('  ✓ ' + name); };

/* A bucket that really writes files. A put lands atomically (temp file, then
 * rename), like an object store. `fail` arms one fault by operation name. */
function fileBucket(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const fault = new Map();
  const file = (key) => path.join(dir, encodeURIComponent(key));
  return {
    fail(op, times = 1) { fault.set(op, times); },
    trip(op) { const n = fault.get(op) || 0; if (n > 0) { fault.set(op, n - 1); throw new Error('bucket ' + op + ' fault'); } },
    async put(key, bytes) {
      this.trip('put');
      const tmp = file(key) + '.part';
      fs.writeFileSync(tmp, Buffer.from(bytes));
      fs.renameSync(tmp, file(key));
    },
    async delete(key) { this.trip('delete'); fs.rmSync(file(key), { force: true }); },
    async get(key) { try { return { arrayBuffer: async () => fs.readFileSync(file(key)) }; } catch (_) { return null; } },
    keys() { return fs.readdirSync(dir).filter((f) => !f.endsWith('.part')).map(decodeURIComponent).sort(); },
  };
}

/* The database with one-shot faults: a statement matching a pattern throws
 * instead of running, as when the connection drops mid-request. */
function faultyDb(DB) {
  const armed = [];
  return {
    arm(re) { armed.push(re); },
    db: {
      prepare(query) {
        const st = DB.prepare(query);
        const hit = () => { const i = armed.findIndex((re) => re.test(query)); if (i < 0) return false; armed.splice(i, 1); return true; };
        const wrap = (fn) => (...a) => { if (hit()) throw new Error('D1 fault'); return fn(...a); };
        const out = {
          bind(...v) { st.bind(...v); return out; },
          run: wrap(() => st.run()), first: wrap(() => st.first()), all: wrap(() => st.all()),
        };
        return out;
      },
      batch: (...a) => DB.batch(...a),
    },
  };
}

const f = await fixture(ROOT);
async function ownerHeaders(extra = {}) {
  const { makeSession, SESS_COOKIE } = await import('../functions/auth/_lib.js');
  return { Cookie: `${SESS_COOKIE}=${await makeSession('money-owner', 'fake-server-money-secret')}`, ...extra };
}
const HEAD = await ownerHeaders();
const bucket = fileBucket(path.join(box, 'r2'));
const faults = faultyDb(f.DB);
const env = { ...f.env, DB: faults.db, MEDIA: bucket };
const M = f.merchant;

const post = async (route, body) => {
  const request = new Request('https://kiwi.test/api/' + route, { method: 'POST', headers: { ...HEAD, 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: M, ...body }) });
  const res = await (route === 'ai/intake' ? intakePost : movementsPost)({ request, env });
  return { status: res.status, body: await res.json() };
};
const put = async (docId, bytes) => {
  const request = new Request(`https://kiwi.test/api/ai/intake?merchant=${M}&docId=${docId}`, { method: 'PUT', headers: { ...HEAD, 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length) }, body: bytes });
  const res = await intakePut({ request, env });
  return { status: res.status, body: await res.json() };
};
const get = async (docId) => {
  const request = new Request(`https://kiwi.test/api/ai/intake?merchant=${M}&docId=${docId}`, { headers: HEAD });
  const res = await intakeGet({ request, env });
  return { status: res.status, body: await res.json() };
};

function pdf(seed) { return Buffer.from('%PDF-1.4\n% kiwi intake fault ' + seed + '\n%%EOF\n'); }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rowOf = (docId) => f.sql.prepare('SELECT * FROM intake_docs WHERE merchant=? AND doc_id=?').get(M, docId);
const ledger = (docId) => f.sql.prepare("SELECT id, item_id, qty_milli FROM inventory_movements WHERE merchant=? AND ref_id=? AND reason='receipt' ORDER BY id").all(M, 'grn-intake-' + docId.slice(0, 16));
const keyOf = (docId) => 'intake/' + M + '/' + docId + '.pdf';

/* The invariant every step must leave true, whatever was interrupted. */
function consistent(label) {
  const rows = f.sql.prepare('SELECT doc_id, has_object, status, posting_count FROM intake_docs WHERE merchant=?').all(M);
  const objects = bucket.keys();
  for (const r of rows) {
    const there = objects.includes(keyOf(r.doc_id));
    assert.equal(there, Number(r.has_object) === 1, `${label}: ${r.doc_id.slice(0, 8)} has_object=${r.has_object} but object ${there ? 'present' : 'absent'}`);
    if (r.status === 'confirmed') assert.equal(ledger(r.doc_id).length, Number(r.posting_count), `${label}: confirmed with a partial ledger`);
  }
  for (const k of objects) assert.ok(rows.some((r) => keyOf(r.doc_id) === k), `${label}: orphan object ${k}`);
  const ids = f.sql.prepare("SELECT id, COUNT(*) AS n FROM inventory_movements WHERE merchant=? GROUP BY id HAVING n > 1").all(M);
  assert.equal(ids.length, 0, `${label}: a stock line was written twice`);
}

/* The till's protocol, step by step (assets/stock/intake.js): commit, upload,
 * prepare the reviewed draft, post its lines, confirm. Movement ids are
 * derived from merchant + document + line index, so a replay rewrites the
 * same ids. */
function movementsFor(docId, lines) {
  return lines.map((l, i) => ({
    id: 'mov-intake-' + sha(M + '\n' + docId + '\n' + i).slice(0, 20) + '-' + i,
    itemId: l.item, reason: 'receipt', qty: l.qty, unitCost: l.cost,
    refType: 'receipt', refId: 'grn-intake-' + docId.slice(0, 16), occurredTs: 1_790_000_000_000,
  }));
}
const commit = (docId, size) => post('ai/intake', { action: 'commit', sha256: docId, mime: 'application/pdf', size, docType: 'supplier_invoice', source: 'fault-test' });
const prepare = (docId, lines) => post('ai/intake', { action: 'prepare', docId, postingHash: sha('draft:' + docId + JSON.stringify(lines)), lineCount: lines.length });
const confirm = (docId) => post('ai/intake', { action: 'mark', docId, status: 'confirmed' });
const postLines = (moves) => post('inventory/movements', { movements: moves });

const LINES = [{ item: 'farine-t55', qty: 25, cost: 7.5 }, { item: 'sucre', qty: 10, cost: 9 }, { item: 'beurre', qty: 4, cost: 82 }];

try {
  /* 1 · the register insert drops: nothing written anywhere, a retry starts clean. */
  {
    const bytes = pdf(1), id = sha(bytes);
    faults.arm(/INSERT OR IGNORE INTO intake_docs/);
    assert.equal((await commit(id, bytes.length)).status, 503);
    assert.equal(rowOf(id), undefined); consistent('commit dropped');
    const again = await commit(id, bytes.length);
    assert.equal(again.status, 200); assert.equal(again.body.duplicate, false); consistent('commit retried');
    ok('commit interrupted: no row, no object; the retry registers the document once');
  }

  /* 2 · the object write fails: the row stays without object, the retry archives it. */
  const bytes2 = pdf(2), id2 = sha(bytes2);
  {
    await commit(id2, bytes2.length);
    bucket.fail('put');
    assert.equal((await put(id2, bytes2)).status, 500);
    assert.equal(Number(rowOf(id2).has_object), 0); consistent('put failed');
    assert.equal((await put(id2, bytes2)).status, 200);
    assert.equal(Number(rowOf(id2).has_object), 1); consistent('put retried');
    ok('upload interrupted before the object lands: register says no object, the retry archives it');
  }

  /* 3 · the object lands, then the register update drops: the route removes
   *     the object again, so nothing points nowhere; the retry archives it. */
  {
    const bytes = pdf(3), id = sha(bytes);
    await commit(id, bytes.length);
    faults.arm(/UPDATE intake_docs SET r2_key/);
    assert.equal((await put(id, bytes)).status, 503);
    assert.equal(bucket.keys().includes(keyOf(id)), false, 'compensating delete ran'); consistent('register update dropped');
    assert.equal((await put(id, bytes)).status, 200); consistent('upload retried');
    ok('object written then register update lost: the object is withdrawn, the retry archives it once');
  }

  /* 4 · same, and the withdrawal fails too: one stray file under the
   *     document's own key, which the next upload of that document adopts. */
  {
    const bytes = pdf(4), id = sha(bytes);
    await commit(id, bytes.length);
    faults.arm(/UPDATE intake_docs SET r2_key/); bucket.fail('delete');
    assert.equal((await put(id, bytes)).status, 503);
    assert.equal(bucket.keys().includes(keyOf(id)), true);
    assert.equal(Number(rowOf(id).has_object), 0);
    const status = await get(id);
    assert.equal(status.body.doc.hasObject, false, 'the till sees the upload as not done and retries it');
    assert.throws(() => consistent('double fault'), /has_object=0 but object present/, 'the stray object is visible to the invariant');
    assert.equal((await put(id, bytes)).status, 200);
    consistent('stray object adopted');
    assert.equal(bucket.keys().filter((k) => k === keyOf(id)).length, 1);
    ok('object written, register update and withdrawal both lost: the retry overwrites the same key and nothing is left orphaned');
  }

  /* 5 · prepare drops: no posting fingerprint, the lines cannot be confirmed. */
  {
    faults.arm(/UPDATE intake_docs SET posting_hash/);
    assert.equal((await prepare(id2, LINES)).status, 503);
    assert.equal(rowOf(id2).posting_hash, ''); consistent('prepare dropped');
    assert.equal((await confirm(id2)).status, 409);
    assert.equal((await prepare(id2, LINES)).status, 200); consistent('prepare retried');
    ok('draft fingerprint interrupted: confirmation refused until the fingerprint is set');
  }

  /* 6 · the phone dies after posting one of three lines: confirmation is
   *     refused, the replay of all three writes the missing two only. */
  {
    const moves = movementsFor(id2, LINES);
    assert.equal((await postLines(moves.slice(0, 1))).status, 200);
    assert.equal(ledger(id2).length, 1);
    const early = await confirm(id2);
    assert.equal(early.status, 409); assert.equal(early.body.error, 'not-posted'); consistent('partial ledger');
    faults.arm(/INSERT OR IGNORE INTO inventory_movements|INSERT INTO inventory_movements/);
    assert.equal((await postLines(moves)).status, 503, 'the replay itself drops once');
    assert.equal(ledger(id2).length, 1, 'a dropped batch writes nothing'); consistent('replay dropped');
    assert.equal((await postLines(moves)).status, 200);
    assert.equal((await postLines(moves)).status, 200, 'a duplicate replay is accepted and ignored');
    const rows = ledger(id2);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => Number(r.qty_milli)).sort((a, b) => a - b), [4000, 10000, 25000]);
    consistent('ledger complete');
    ok('posting interrupted after one line: confirmation refused, replays write each line exactly once');
  }

  /* 7 · the confirmation write drops after every line is in: the retry seals
   *     it, and a late replay of the lines changes nothing. */
  {
    faults.arm(/UPDATE intake_docs SET status/);
    assert.equal((await confirm(id2)).status, 503);
    assert.equal(rowOf(id2).status, 'received'); consistent('confirm dropped');
    assert.equal((await confirm(id2)).status, 200);
    assert.equal(rowOf(id2).status, 'confirmed');
    assert.equal((await postLines(movementsFor(id2, LINES))).status, 200);
    assert.equal(ledger(id2).length, 3);
    assert.equal((await put(id2, bytes2)).status, 409, 'a confirmed original cannot be replaced');
    assert.equal((await commit(id2, bytes2.length)).body.duplicate, true, 'depositing the same paper again is reported, not re-registered');
    consistent('confirmed');
    ok('confirmation interrupted: the retry seals it, later replays add no stock and cannot replace the original');
  }

  /* 8 · a different correction of the same paper cannot slip in after the
   *     first fingerprint, so two devices never mix their lines. */
  {
    const bytes = pdf(8), id = sha(bytes);
    await commit(id, bytes.length); await put(id, bytes);
    assert.equal((await prepare(id, LINES)).status, 200);
    const other = await prepare(id, LINES.slice(0, 2));
    assert.equal(other.status, 409); assert.equal(other.body.error, 'posting-conflict');
    consistent('conflicting draft');
    ok('a second device with a different draft is refused before it writes a line');
  }
} finally {
  fs.rmSync(box, { recursive: true, force: true });
}

console.log(`\n  ✓ intake storage faults: ${checks} interruption scenarios, storage consistent after every step`);
