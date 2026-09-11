#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake posting test — l'idempotence au niveau d'écriture.
 *
 * Le garde client ne suffit pas : deux appareils peuvent lire `received`
 * ensemble, et une confirmation interrompue peut rejouer. Ce qui ferme ces
 * fenêtres, c'est l'empreinte atomiquement figée avant écriture puis la
 * convergence des écritures elles-mêmes — ids primaires déterministes et
 * upsert à chaque couche. Cette suite l'exécute POUR DE VRAI :
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

const EXPECTED = 16;
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
const movementsSrc = fs.readFileSync(path.join(root, 'functions/api/inventory/movements.js'), 'utf8');

/* ── Vraie route /api/inventory/movements (sosies D1, session simulée) ──────
 * Le sosie D1 honore le contrat réel : PRIMARY KEY globale sur id,
 * INSERT OR IGNORE, séquences par marchand. Les lignes stockées portent les
 * colonnes snake_case exactes (dont unit_cost_rate) — c'est la transformation
 * réelle POST → stockage → GET qui est exercée, pas un écho d'objets. */
const movementsRt = new Function(
  'const json = (body, status) => ({ status: status || 200, body });\n' +
  'const tenantFor = async (req, env, asked) => (asked ? String(asked) : null);\n' +
  'const entitledMerchant = async (req, env, merchant) => merchant;\n' +
  'const resolveInventoryUnitScope = async () => ({ scoped: false, allowed: true, permitsMovementLocation: () => true, effectiveMovementLocation: (loc) => loc || \'principal\', storageLocations: () => [], projectLocation: (l) => l, metadata: () => ({}) });\n' +
  'const scopeSql = () => ({ clause: \'\', values: [] });\n' +
  movementsSrc
    .split('\n')
    .filter((l) => !/^import\s/.test(l))
    .join('\n')
    .replace(/^export\s+/gm, '') +
  '\nreturn { onRequestPost, onRequestGet };'
)();

/* ── Vrai code route /api/ai/intake (sosies D1/R2, session simulée) ───────── */
const intakeRt = new Function(
  'const json = (body, status) => ({ status: status || 200, body });\n' +
  'const tenantFor = async (req, env, asked) => (asked ? String(asked) : null);\n' +
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
  const movRows = new Map(); // id -> ligne snake_case, comme D1 (PK globale)
  const movCols = new Set(['id', 'merchant', 'item_id', 'variant_id', 'location_id', 'qty_milli', 'reason', 'unit_cost_cents', 'currency', 'ref_type', 'ref_id', 'note', 'actor', 'occurred_ts', 'srv_ts', 'reversal_of', 'meta', 'created_ts']);
  const seq = new Map();
  const DB = {
    prepare(sql) {
      const s = String(sql);
      const stmt = (...args) => {
        const expectedBinds = (s.match(/\?/g) || []).length;
        if (args.length !== expectedBinds) throw new Error('D1_BIND_MISMATCH: expected ' + expectedBinds + ', got ' + args.length);
        if (/CREATE TABLE IF NOT EXISTS intake_docs/.test(s)) return {};
        if (/INSERT OR IGNORE INTO intake_docs/.test(s)) {
          const [merchant, docId, mime, size, r2key, docType, source, cts, uts] = args;
          const k = merchant + '|' + docId;
          const isNew = !docs.has(k);
          if (isNew) docs.set(k, { merchant, doc_id: docId, mime, size, r2_key: r2key, has_object: 1, status: 'received', doc_type: docType, source, posting_hash: '', posting_count: 0, created_ts: cts, updated_ts: uts });
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
        if (/UPDATE intake_docs SET posting_hash/.test(s)) {
          const [postingHash, lineCount, uts, merchant, docId, requiredHash, requiredCount] = args;
          const row = docs.get(merchant + '|' + docId);
          const allowed = !!row && row.has_object === 1 && row.status === 'received'
            && (!row.posting_hash || (row.posting_hash === requiredHash && row.posting_count === requiredCount));
          if (!allowed) return { meta: { changes: 0 } };
          if (!row.posting_hash) { row.posting_hash = postingHash; row.posting_count = lineCount; }
          row.updated_ts = uts;
          return { meta: { changes: 1 } };
        }
        if (/SELECT COUNT\(\*\) AS n FROM inventory_movements/.test(s)) {
          const [merchant, refId] = args;
          const n = Array.from(movRows.values()).filter((r) => r.merchant === merchant
            && r.ref_id === refId && r.reason === 'receipt' && String(r.id).startsWith('mov-intake-')).length;
          return { n };
        }
        throw new Error('unexpected intake sql: ' + s);
      };
      const api = (...args) => ({
        run: async () => stmt(...args),
        first: async () => stmt(...args),
        all: async () => stmt(...args),
      });
      return Object.assign(api(), { bind: (...a) => api(...a) });
    },
  };
  const movDB = {
    prepare(sql) {
      const s = String(sql);
      // Forme D1 : prepare(sql).run() sans bind (DDL) ou .bind(...).run()/.first()/.all().
      const api = (...args) => ({
        run: async () => stmt(...args),
        first: async () => stmt(...args),
        all: async () => stmt(...args),
      });
      const stmt = (...args) => {
        const expectedBinds = (s.match(/\?/g) || []).length;
        if (args.length !== expectedBinds) throw new Error('D1_BIND_MISMATCH: expected ' + expectedBinds + ', got ' + args.length);
        if (/CREATE TABLE IF NOT EXISTS inventory_movements/.test(s)) return {};
        if (/ALTER TABLE inventory_movements ADD COLUMN unit_cost_rate/.test(s)) {
          if (movCols.has('unit_cost_rate')) throw new Error('duplicate column name: unit_cost_rate');
          movCols.add('unit_cost_rate');
          return {};
        }
        if (/CREATE TABLE IF NOT EXISTS inventory_sync_sequences/.test(s)) return {};
        if (/CREATE INDEX IF NOT EXISTS/.test(s)) return {};
        if (/INSERT OR IGNORE INTO inventory_sync_sequences/.test(s)) {
          if (!seq.has(args[0])) seq.set(args[0], 0);
          return { meta: { changes: 1 } };
        }
        if (/UPDATE inventory_sync_sequences/.test(s)) {
          const [now, , merchant] = args;
          const cur = seq.get(merchant) || 0;
          const nv = cur >= now ? cur + 1 : now;
          seq.set(merchant, nv);
          return { value: nv };
        }
        if (/FROM inventory_movements WHERE id IN \(/.test(s)) {
          const merchant = args[args.length - 1];
          const ids = args.slice(0, -1);
          return { results: ids.filter((id) => movRows.has(id) && movRows.get(id).merchant !== merchant).map((id) => ({ id })) };
        }
        if (/INSERT OR IGNORE INTO inventory_movements/.test(s)) {
          const cols = s.slice(s.indexOf('(') + 1, s.indexOf(')')).split(',').map((c) => c.trim());
          const row = {};
          cols.forEach((c, i) => { row[c] = args[i]; });
          if (movRows.has(row.id)) return { meta: { changes: 0 } };
          movRows.set(row.id, row);
          return { meta: { changes: 1 } };
        }
        if (/SELECT srv_ts AS cursor FROM inventory_movements WHERE id = \? AND merchant = \?/.test(s)) {
          const row = movRows.get(args[0]);
          return (row && row.merchant === args[1]) ? { cursor: row.srv_ts } : null;
        }
        if (/FROM inventory_movements\s+WHERE merchant = \? AND srv_ts > \?/.test(s)) {
          const [merchant, since, limit] = args;
          const rows = Array.from(movRows.values())
            .filter((r) => r.merchant === merchant && Number(r.srv_ts || 0) > Number(since || 0))
            .sort((a, b) => Number(a.srv_ts) - Number(b.srv_ts))
            .slice(0, Number(limit || 500));
          return { results: rows };
        }
        throw new Error('unexpected movements sql: ' + s.slice(0, 80));
      };
      return Object.assign(api(), { bind: (...a) => api(...a) });
    },
  };
  const intakeEnv = { DB };
  const movEnv = { DB: movDB, AUTH_SECRET: 'test-secret' };
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
  // Le registre local pousse vers la VRAIE route (transformation sanitize →
  // stockage → projection exercée, dont le taux ×1e-4 et le rejet 409).
  async function movementsFetch(url, opts = {}) {
    const u = String(url);
    const method = String(opts.method || 'GET').toUpperCase();
    const wrap = (r) => ({ ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body });
    if (method === 'POST') {
      const r = await movementsRt.onRequestPost({ request: new Request(abs(u), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: opts.body }), env: movEnv });
      return wrap(r);
    }
    const r = await movementsRt.onRequestGet({ request: new Request(abs(u)), env: movEnv });
    return wrap(r);
  }
  async function fetch(url, opts = {}) {
    const u = String(url);
    if (u.includes('/api/ai/intake')) return intakeFetch(url, opts);
    if (u.includes('/api/inventory/movements')) return movementsFetch(url, opts);
    throw new Error('unexpected fetch: ' + u);
  }
  return { docs, movRows, fetch };
}

/* ── Un appareil = un contexte vm (vrai registre + vraie compta + vrai noyau) */
const STOCK_FNS = ['stIntakeHash', 'stSha256Hex', 'stIntakePostingLines', 'stIntakePostingCanonical', 'stIntakePostingFingerprint', 'stIntakePrepare', 'stIntakePostingIds', 'stIntakeSupplierId', 'stIntakePostGuard', 'stIntakeMerchant', 'stIntakeServerStatus', 'stIntakeMarkOnce', 'stIntakePostedHas', 'stIntakePostedAdd', 'stIntakeOutboxRead', 'stIntakeOutboxWrite', 'stIntakePostAll'];
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
    Kiwi: { venue: () => merchant }, // le client envoie son marchand ; la session est simulée par tenantFor
    KiwiStore: { define() { return { get: () => procState, update: (fn) => fn(procState) }; } },
    KiwiVenue: { getPlan: () => 'ultra' },
    KiwiConfig: { plan: 'ultra' },
    KiwiCost: { setItemCost: (id, cost, by) => { costs.push({ id, cost, by }); } },
    addEventListener() {},
    dispatchEvent() { return true; },
  };
  win.window = win;
  win.crypto = globalThis.crypto;
  const ctx = vm.createContext({
    window: win, localStorage, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise, TextEncoder,
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

await check('posting ids are merchant-scoped, deterministic and collision-free per line', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  const call = (m, n) => dev.run(`window.__intake.stIntakePostingIds(${JSON.stringify(m)}, ${JSON.stringify(DOC)}, ${n}).then(JSON.stringify)`);
  const a = await call('demo-tenant', 2);
  const b = await call('demo-tenant', 2);
  assert.equal(a, b);
  const ids = JSON.parse(a);
  assert.equal(ids.receiptId, RECEIPT_ID);
  assert.equal(ids.invoiceId, INVOICE_ID);
  assert.equal(ids.movementIds.length, 2);
  assert.ok(ids.movementIds[0] !== ids.movementIds[1]);
  assert.match(ids.movementIds[0], /^mov-intake-[0-9a-f]{20}-0$/);
  // Même PDF, autre marchand → ids disjoints (table globale, pas de collision).
  const idsC = JSON.parse(await call('second-souk', 2));
  assert.ok(!ids.movementIds.includes(idsC.movementIds[0]));
  assert.ok(!idsC.movementIds.includes(ids.movementIds[0]));
  // Valeur exacte : SHA-256('demo-tenant\n<doc>\n0')[0:20].
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('demo-tenant\n' + DOC + '\n0'));
  const hex = Array.from(new Uint8Array(digest)).map((x) => x.toString(16).padStart(2, '0')).join('');
  assert.equal(ids.movementIds[0], 'mov-intake-' + hex.slice(0, 20) + '-0');
  const s1 = await dev.run(`window.__intake.stIntakeSupplierId('Coopérative Taliouine')`);
  const s2 = await dev.run(`window.__intake.stIntakeSupplierId('  coopérative taliouine ')`);
  assert.equal(s1, s2);
});

await check('posting fingerprint is deterministic and line-order sensitive', async () => {
  const shared = makeShared();
  const dev = makeDevice(shared, 'demo-tenant');
  const original = postCtx();
  const reordered = postCtx();
  reordered.lines.reverse();
  const cacheVariant = postCtx();
  cacheVariant.lines[0].cardSupplierId = 'another-local-card';
  cacheVariant.lines[0].cardRank = 9;
  const a = await dev.run(`window.__intake.stIntakePostingFingerprint(${JSON.stringify(original)} )`);
  const b = await dev.run(`window.__intake.stIntakePostingFingerprint(${JSON.stringify(original)} )`);
  const c = await dev.run(`window.__intake.stIntakePostingFingerprint(${JSON.stringify(reordered)} )`);
  const d = await dev.run(`window.__intake.stIntakePostingFingerprint(${JSON.stringify(cacheVariant)} )`);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a, d, 'derived supplier-card cache state is not part of reviewed payload');
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
  const expectIds = JSON.parse(await dev.run(`window.__intake.stIntakePostingIds('demo-tenant', ${JSON.stringify(DOC)}, 2).then(JSON.stringify)`));
  jseq(moves.map((m) => m.id).sort(), expectIds.movementIds.slice().sort());
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
  assert.equal(shared.movRows.size, 2);
  for (const id of shared.movRows.keys()) assert.match(id, /^mov-intake-[0-9a-f]{20}-[01]$/);
  const safranRow = Array.from(shared.movRows.values()).find((r) => r.item_id === 'safran');
  assert.equal(safranRow.unit_cost_rate, 45);
  assert.equal(safranRow.unit_cost_cents, 0);
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

/* ── Pannes contrôlées en cours d'écriture ─────────────────────────────────
 * On arme le registre local pour lever après la réception (0 mouvement
 * persisté) puis après le mouvement N=0 (1 mouvement persisté) : la reprise
 * doit converger dans les deux cas, sans jamais dupliquer. */
async function armAddFault(dev, failAfter) {
  await dev.run(`window.__fault = { n: 0, failAfter: ${failAfter} };
if (!window.__realAdd) window.__realAdd = window.KiwiInventory.add;
const realAddForFault = window.__realAdd.bind(window.KiwiInventory);
window.KiwiInventory.add = function (m) { window.__fault.n++; if (window.__fault.n > window.__fault.failAfter) throw new Error('fault-injected-add'); return realAddForFault(m); };`);
}
async function disarmAddFault(dev) {
  await dev.run(`window.KiwiInventory.add = window.__realAdd;`);
}

await check('fault after receipt creation: retry posts exactly once', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  await armAddFault(dev, 0);
  await assert.rejects(dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`), /fault-injected-add/);
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 0);
  await disarmAddFault(dev);
  const out = await confirmSequence(dev, shared, DOC);
  assert.equal(out, 'posted');
  assert.equal(dev.procState.receipts.length, 1);
  assert.equal(dev.procState.invoices.length, 1);
  assert.equal(dev.K.history('flour').length + dev.K.history('safran').length, 2);
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('offline ledger cannot confirm; reconnect syncs before sealing', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  await dev.run(`navigator.onLine = false`);
  await assert.rejects(
    dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`),
    /intake-movement-sync-required/
  );
  assert.equal(shared.movRows.size, 0);
  assert.equal(await dev.run(`window.__intake.stIntakeMarkOnce(${JSON.stringify(DOC)})`), false);
  assert.equal(shared.docs.get('demo-tenant|' + DOC).status, 'received');
  await dev.run(`navigator.onLine = true`);
  assert.equal(await confirmSequence(dev, shared, DOC), 'posted');
  assert.equal(shared.movRows.size, 2);
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('fault after movement 0: retry does not duplicate the persisted row', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  await armAddFault(dev, 1);
  await assert.rejects(dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`), /fault-injected-add/);
  assert.equal(dev.K.history('flour').length, 1);
  assert.equal(dev.K.history('safran').length, 0);
  await disarmAddFault(dev);
  const out = await confirmSequence(dev, shared, DOC);
  assert.equal(out, 'posted');
  assert.equal(dev.K.history('flour').length, 1);
  assert.equal(dev.K.history('safran').length, 1);
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('changed retry after movement 0 is refused before it can mix indexed lines', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const dev = makeDevice(shared, 'demo-tenant');
  await armAddFault(dev, 1);
  await assert.rejects(dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(postCtx()).replace(/</g, '\\u003c')})`), /fault-injected-add/);
  await disarmAddFault(dev);
  const changed = postCtx();
  changed.lines.reverse();
  await assert.rejects(
    dev.run(`window.__intake.stIntakePostAll(${JSON.stringify(changed).replace(/</g, '\\u003c')})`),
    /intake-posting-conflict/
  );
  assert.equal(dev.K.history('flour').length, 1);
  assert.equal(dev.K.history('safran').length, 0);
  assert.equal(shared.docs.get('demo-tenant|' + DOC).status, 'received');
  assert.equal(await dev.run(`window.__intake.stIntakeMarkOnce(${JSON.stringify(DOC)})`), false, 'partial server state cannot be confirmed');
  assert.equal(shared.docs.get('demo-tenant|' + DOC).status, 'received');
  // Le brouillon original reste rejouable et converge ensuite normalement.
  assert.equal(await confirmSequence(dev, shared, DOC), 'posted');
  assert.equal(dev.K.balance('flour'), 5);
  assert.equal(dev.K.balance('safran'), 1000);
});

await check('two devices with divergent reviews elect one payload before either writes', async () => {
  const shared = makeShared();
  await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: 'demo-tenant', action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  const devA = makeDevice(shared, 'demo-tenant');
  const devB = makeDevice(shared, 'demo-tenant');
  const a = postCtx();
  const b = postCtx();
  b.lines.reverse();
  const results = await Promise.allSettled([
    devA.run(`window.__intake.stIntakePostAll(${JSON.stringify(a).replace(/</g, '\\u003c')})`),
    devB.run(`window.__intake.stIntakePostAll(${JSON.stringify(b).replace(/</g, '\\u003c')})`),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && /posting-conflict/.test(String(r.reason))).length, 1);
  await Promise.all([devA.K.sync(), devB.K.sync()]);
  assert.equal(shared.movRows.size, 2);
  jseq(Array.from(shared.movRows.values()).map((r) => r.item_id).sort(), ['flour', 'safran']);
  assert.match(shared.docs.get('demo-tenant|' + DOC).posting_hash, /^[0-9a-f]{64}$/);
  assert.equal(shared.docs.get('demo-tenant|' + DOC).status, 'received');
});

await check('same PDF on a second merchant: disjoint ids accepted, foreign ids rejected, rate-first read', async () => {
  const shared = makeShared();
  for (const m of ['demo-tenant', 'second-souk']) {
    await shared.fetch('https://t/api/ai/intake', { method: 'POST', body: JSON.stringify({ merchant: m, action: 'commit', sha256: DOC, mime: 'application/pdf', size: 10, docType: 'supplier_invoice', source: 's' }) });
  }
  const devA = makeDevice(shared, 'demo-tenant');
  assert.equal(await confirmSequence(devA, shared, DOC), 'posted');
  const devC = makeDevice(shared, 'second-souk');
  assert.equal(await confirmSequence(devC, shared, DOC), 'posted');
  assert.equal(shared.movRows.size, 4);
  assert.equal(devC.K.balance('flour'), 5);
  // Id d'un autre marchand sous notre nom : 409, rien d'écrit.
  const aIds = JSON.parse(await devA.run(`window.__intake.stIntakePostingIds('demo-tenant', ${JSON.stringify(DOC)}, 2).then(JSON.stringify)`));
  const forged = await shared.fetch('https://t/api/inventory/movements', { method: 'POST', body: JSON.stringify({ merchant: 'second-souk', movements: [{ id: aIds.movementIds[0], itemId: 'flour', qty: 1, reason: 'receipt' }] }) });
  assert.equal(forged.status, 409);
  assert.equal((await forged.json()).error, 'id-conflict');
  assert.equal(shared.movRows.size, 4);
  // Lecture : le taux prime sur les centimes, de bout en bout via la route.
  const g = await shared.fetch('https://t/api/inventory/movements?merchant=demo-tenant&since=0', {});
  const gj = await g.json();
  const s = gj.movements.find((m) => m.itemId === 'safran');
  assert.equal(s.unitCost, 0.0045);
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('intake-posting-test: ' + checks + ' checks passed\n');
