#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake posting test — l'idempotence au niveau d'écriture.
 *
 * Le garde client ne suffit pas : deux appareils peuvent lire `received`
 * ensemble, et une confirmation interrompue peut rejouer. Ce qui ferme ces
 * fenêtres, c'est la convergence des écritures elles-mêmes — ids primaires
 * déterministes et upsert à chaque couche. Cette suite l'exécute POUR DE VRAI :
 * le vrai inventory-ledger.js, le vrai procurement.js et le vrai noyau
 * stIntakePostAll de stock.js tournent dans un contexte vm par appareil
 * (localStorage séparé = deux appareils), avec des sosies partagés pour la
 * route /api/ai/intake (vrai code) et le serveur des mouvements (contrat
 * INSERT OR IGNORE de functions/api/inventory/movements.js).
 *
 *   node tools/intake-posting-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 9;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
// Comparaison inter-règnes vm : les objets d'un contexte ont un autre
// prototype — on compare leur forme sérialisée, jamais la référence.
function jseq(actual, expected, msg) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
}
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledgerSrc = fs.readFileSync(path.join(root, 'assets/inventory-ledger.js'), 'utf8');
const procurementSrc = fs.readFileSync(path.join(root, 'assets/procurement.js'), 'utf8');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');
const intakeSrc = fs.readFileSync(path.join(root, 'functions/api/ai/intake.js'), 'utf8');

/* ── Vrai code route /api/ai/intake (sosies D1/R2, session simulée) ───────── */
const intakeRt = new Function(
  'const json = (body, status) => ({ status: status || 200, body });\n' +
  "const tenantFor = async () => 'demo-tenant';\n" + // session gérant simulée
  'const DAILY_CAPS = { intake: 100 };\n' +
  'const quotaOk = async () => true;\n' +
  intakeSrc
    .split('\n')
    .filter((l) => !/^import\s/.test(l) && !/^export\s*\{[^}]*\};?\s*$/.test(l))
    .join('\n')
    .replace(/^export\s+/gm, '') +
  '\nreturn { onRequestPost, onRequestGet };'
)();

function makeShared() {
  const docs = new Map();
  const serverMoves = new Map();
  let cursor = 0;
  const DB = {
    prepare(sql) {
      const s = String(sql);
      const stmt = (...args) => {
        if (/INSERT OR IGNORE INTO intake_docs/.test(s)) {
          const [merchant, docId, mime, size, r2key, docType, source, cts, uts] = args;
          const k = merchant + '|' + docId;
          const isNew = !docs.has(k);
          if (isNew) docs.set(k, { merchant, doc_id: docId, mime, size, r2_key: r2key, has_object: 1, status: 'received', doc_type: docType, source, created_ts: cts, updated_ts: uts });
          return { meta: { changes: isNew ? 1 : 0 } };
        }
        if (/SELECT \* FROM intake_docs/.test(s)) {
          return docs.get(args[0] + '|' + args[1]) || null;
        }
        if (/UPDATE intake_docs SET status/.test(s)) {
          const row = docs.get(args[2] + '|' + args[3]);
          if (!row) return { meta: { changes: 0 } };
          row.status = args[0]; row.updated_ts = args[1];
          return { meta: { changes: 1 } };
        }
        throw new Error('unexpected sql: ' + s);
      };
      return { bind: (...a) => ({ first: async () => stmt(...a), run: async () => stmt(...a) }) };
    },
  };
  const intakeEnv = { DB };
  const abs = (u) => (String(u).startsWith('http') ? String(u) : 'https://test.invalid' + (String(u).startsWith('/') ? String(u) : '/' + String(u)));
  async function intakeFetch(url, opts = {}) {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    const wrap = (r) => ({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
    if (method === 'POST') {
      const r = await intakeRt.onRequestPost({ request: new Request(abs(u), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: opts.body }), env: intakeEnv });
      return wrap(r);
    }
    const r = await intakeRt.onRequestGet({ request: new Request(abs(u)), env: intakeEnv });
    return wrap(r);
  }
  // Contrat serveur des mouvements : INSERT OR IGNORE sur l'id (movements.js).
  async function movementsFetch(url, opts = {}) {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    if (method === 'POST') {
      const body = JSON.parse(String(opts.body || '{}'));
      const accepted = [];
      for (const m of body.movements || []) {
        if (!serverMoves.has(m.id)) serverMoves.set(m.id, m);
        accepted.push({ id: m.id, cursor: ++cursor });
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, accepted, scope: {}, merchant: body.merchant }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, movements: [], cursor, scope: {}, more: false }) };
  }
  async function fetch(url, opts = {}) {
    const u = String(url);
    if (u.includes('/api/ai/intake')) return intakeFetch(url, opts);
    if (u.includes('/api/inventory/movements')) return movementsFetch(url, opts);
    throw new Error('unexpected fetch: ' + u);
  }
  return { docs, serverMoves, fetch };
}

/* ── Un appareil = un contexte vm (vrai registre + vraie compta + vrai noyau) */
const STOCK_FNS = ['stIntakeHash', 'stIntakePostingIds', 'stIntakeSupplierId', 'stIntakePostGuard', 'stIntakeMerchant', 'stIntakeServerStatus', 'stIntakeMarkOnce', 'stIntakePostedHas', 'stIntakePostedAdd', 'stIntakeOutboxRead', 'stIntakeOutboxWrite', 'stIntakePostAll'];
function extractStock(name) {
  const m = stockSrc.match(new RegExp('  (?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'stock helper extractable: ' + name);
  return m[0];
}
const stockCoreSrc = STOCK_FNS.map(extractStock).join('\n');

function makeDevice(shared, merchant) {
  const ls = new Map();
  const localStorage = {
    getItem: (k) => (ls.has(String(k)) ? ls.get(String(k)) : null),
    setItem: (k, v) => { ls.set(String(k), String(v)); },
    removeItem: (k) => { ls.delete(String(k)); },
  };
  const costs = [];
  const procState = { suppliers: [], orders: [], receipts: [], invoices: [], seq: 0 };
  const win = {
    KiwiEnv: { isReal: () => true },
    KiwiCloudDoc: { currentSlug: () => merchant },
    KiwiStore: { define() { return { get: () => procState, update: (fn) => fn(procState) }; } },
    KiwiVenue: { getPlan: () => 'ultra' },
    KiwiConfig: { plan: 'ultra' },
    KiwiCost: { setItemCost: (id, cost, by) => { costs.push({ id, cost, by }); } },
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  win.window = win;
  const ctx = vm.createContext({
    window: win, localStorage, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
    setTimeout: () => 0, setInterval: () => 0,
    CustomEvent: function (t, d) { this.type = t; this.detail = d && d.detail; },
    crypto: globalThis.crypto,
    fetch: shared.fetch,
    navigator: { onLine: true },
  });
  vm.runInContext(ledgerSrc, ctx, { filename: 'inventory-ledger.js' });
  vm.runInContext(procurementSrc, ctx, { filename: 'procurement.js' });
  vm.runInContext(stockCoreSrc + '\n;window.__intake = { ' + STOCK_FNS.join(',') + ' };', ctx, { filename: 'stock-intake-core.js' });
  const api = (expr) => vm.runInContext('window.__intake.' + expr, ctx);
  return {
    ctx, win, costs, procState,
    K: win.KiwiInventory,
    P: win.KiwiProcurement,
    call: (fn, arg) => api(fn + '(' + JSON.stringify(arg ?? null).replace(/</g, '\\u003c') + ')'),
    run: (code) => vm.runInContext(code, ctx),
  };
}

const DOC = 'a'.repeat(60) + 'beef';
const RECEIPT_ID = 'grn-intake-' + DOC.slice(0, 16);
const INVOICE_ID = 'invdoc-intake-' + DOC.slice(0, 16);
function ctxLines() {
  return [
    { itemId: 'flour', name: 'Farine T55', qty: 5, unit: 'sac', unitCost: 150, updateCost: true, dlc: '', cardSupplierId: 'sup-x', cardRank: 1 },
    { itemId: 'safran', name: 'Safran', qty: 1000, unit: 'g', unitCost: 0.0045, updateCost: false, dlc: '', cardSupplierId: 'sup-x', cardRank: 1 },
  ];
}
function postCtx() {
  return { docId: DOC, supplierName: 'Coopérative Taliouine', externalRef: 'F-118', receivedAt: 1788000000000, issuedAt: 1788000000000, source: 'pdf', lines: ctxLines() };
}
// La séquence exacte du handler : garde → écritures → scellé → marquage.
async function confirmSequence(dev, shared, docId) {
  const guard = await dev.run(`(async () => window.__intake.stIntakePostGuard(window.__intake.stIntakePostedHas(${JSON.stringify(docId)}), await window.__intake.stIntakeServerStatus(${JSON.stringify(docId)})))()`);
  if (guard !== 'ok') return guard;
  await dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`);
  await dev.run(`window.__intake.stIntakePostedAdd(${JSON.stringify(docId)})`);
  const marked = await dev.run(`window.__intake.stIntakeMarkOnce(${JSON.stringify(docId)})`);
  await dev.K.sync();
  return marked ? 'posted' : 'mark-pending';
}

await check('posting ids are deterministic and collision-free per line', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  const a = await dev.run(`JSON.stringify(window.__intake.stIntakePostingIds(${JSON.stringify(DOC)}, 2))`);
  const b = await dev.run(`JSON.stringify(window.__intake.stIntakePostingIds(${JSON.stringify(DOC)}, 2))`);
  assert.equal(a, b);
  const ids = JSON.parse(a);
  assert.equal(ids.receiptId, RECEIPT_ID);
  assert.equal(ids.invoiceId, INVOICE_ID);
  assert.deepEqual(ids.movementIds, ['mov-intake-' + DOC.slice(0, 16) + '-0', 'mov-intake-' + DOC.slice(0, 16) + '-1']);
  const s1 = await dev.run(`window.__intake.stIntakeSupplierId('Coopérative Taliouine')`);
  const s2 = await dev.run(`window.__intake.stIntakeSupplierId('  coopérative taliouine ')`);
  assert.equal(s1, s2);
});

await check('one device, full sequence: one receipt, one invoice, one movement per line, stock once', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  const out = await confirmSequence(dev, shared, DOC);
  assert.equal(out, 'posted');
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.procState.receipts[0].id, RECEIPT_ID);
  assert.equal(dev.procState.invoices.length, 1);
  assert.equal(dev.procState.invoices[0].id, INVOICE_ID);
  assert.equal(dev.procState.invoices[0].receiptId, RECEIPT_ID);
  const moves = dev.K.history('flour').concat(dev.K.history('safran'));
  assert.equal(moves.length, 2);
  jseq(moves.map((m) => m.id).sort(), ['mov-intake-' + DOC.slice(0, 16) + '-0', 'mov-intake-' + DOC.slice(0, 16) + '-1']);
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
  const safran = moves.find((m) => m.itemId === 'safran');
  assert.equal(safran.unitCost, 0.0045);
  jseq(dev.costs, [{ id: 'flour', cost: 150, by: 'Coopérative Taliouine' }]);
});

await check('same device retry after clean confirm changes nothing', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  assert.equal(await confirmSequence(dev, shared, DOC), 'posted');
  const guard = await confirmSequence(dev, shared, DOC);
  assert.ok(guard === 'duplicate-local' || guard === 'duplicate-server');
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.procState.invoices.length, 1);
  assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 2);
  assert.equal(dev.K.balance('flour'), 5);
});

await check('interruption before postedAdd: retry completes exactly once', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  // Premier passage tué entre les écritures et le scellé local.
  await dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`);
  await dev.K.sync();
  assert.equal(dev.run(`window.__intake.stIntakePostedHas(${JSON.stringify(DOC)})`), false);
  // Reprise : garde ouverte (ni posté localement, ni confirmé), tout converge.
  const out = await confirmSequence(dev, shared, DOC);
  assert.equal(out, 'posted');
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.procState.invoices.length, 1);
  assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 2);
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('interruption mid-writes then concurrent second device: still singletons everywhere', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const devA = makeDevice(shared, 'demo-tenant');
  const devB = makeDevice(shared, 'demo-tenant');
  // A écrit (puis meurt avant scellé/marquage) pendant que B confirme en parallèle.
  const postSrc = `window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`;
  await Promise.all([devA.run(postSrc), confirmSequence(devB, shared, DOC)]);
  await devA.K.sync();
  // A se réveille et rejoue : tout est déjà là, rien ne se duplique.
  const outA = await confirmSequence(devA, shared, DOC);
  assert.ok(outA === 'posted' || outA === 'duplicate-server');
  for (const [name, dev] of [['A', devA], ['B', devB]]) {
    assert.equal(dev.procState.receipts.length, 1, name + ': one receipt');
    assert.equal(dev.procState.receipts[0].id, RECEIPT_ID, name + ': same receipt id');
    assert.equal(dev.procState.invoices.length, 1, name + ': one invoice');
    assert.equal(dev.procState.invoices[0].id, INVOICE_ID, name + ': same invoice id');
    assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 2, name + ': one movement per line');
    assert.equal(dev.K.balance('flour'), 5, name + ': stock once');
    assert.equal(dev.K.balance('safran'), 1000, name + ': stock once');
  }
  assert.equal(shared.serverMoves.size, 2);
  assert.deepEqual(Array.from(shared.serverMoves.keys()).sort(), ['mov-intake-' + DOC.slice(0, 16) + '-0', 'mov-intake-' + DOC.slice(0, 16) + '-1']);
  const row = shared.docs.get('demo-tenant|' + DOC);
  assert.equal(row && row.status, 'confirmed');
});

await check('without docId the core refuses: only the legacy path can write', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  // Sans docId le noyau refuse : l'ancien chemin reste le seul possible.
  const err = await dev.run(`window.__intake.stIntakePostAll({ docId: '', lines: [] }).then(() => 'no-throw', (e) => String((e && e.message) || e))`);
  assert.match(err, /intake-doc-required/);
  const err2 = await dev.run(`window.__intake.stIntakePostAll({ docId: ${JSON.stringify(DOC)}, lines: [] }).then(() => 'no-throw', (e) => String((e && e.message) || e))`);
  assert.match(err2, /intake-lines-required/);
});

await check('intake registry still converges under the posting suite', async () => {
  const shared = makeShared();
  const payload = { merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' };
  const [a, b] = await Promise.all([
    shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify(payload) }),
    shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify(payload) }),
  ]);
  const flags = [(await a.json()).duplicate, (await b.json()).duplicate].sort();
  assert.deepEqual(flags, [false, true]);
});

await check('procurement legacy writes keep working with random ids', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  const r1 = await dev.run(`window.KiwiProcurement.receiveDirect({ supplierId: 's1', externalRef: 'BL-1', lines: [{ itemId: 'flour', qty: 1, unitCost: 8 }] })`);
  const r2 = await dev.run(`window.KiwiProcurement.receiveDirect({ supplierId: 's1', externalRef: 'BL-2', lines: [{ itemId: 'flour', qty: 1, unitCost: 8 }] })`);
  assert.ok(r1.id && r2.id && r1.id !== r2.id);
  assert.equal(dev.run(`window.KiwiProcurement.doc().receipts.length`), 2);
});

await check('invoice 4dp rate survives procurement cleaning into the ledger', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  await dev.run(`window.KiwiProcurement.receiveDirect({ receiptId: 'grn-probe', supplierId: 's1', lines: [{ itemId: 'safran', qty: 100, unitCost: 0.0045 }] })`);
  const kept = await dev.run(`window.KiwiProcurement.doc().receipts[0].lines[0].unitCost`);
  assert.equal(kept, 0.0045);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('intake-posting-test: ' + checks + ' checks passed\n');
