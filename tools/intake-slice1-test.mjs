#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake slice 1 test — « dépose un papier, il se range tout seul ».
 *
 * Garde : le registre d'entrée (commit idempotent par empreinte, archive R2
 * privée, pré-filtre identité, statut confirmed uniquement sur confirmation
 * humaine) + le correctif taux-4-décimales d'invoice.js.
 *
 * Discipline : le comportement est EXÉCUTÉ depuis le code livré (fonctions
 * extraites des fichiers, jamais réimplémentées) ; le câblage est vérifié en
 * statique sur ces mêmes fichiers.
 *
 *   node tools/intake-slice1-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = 22;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const intakeSrc = fs.readFileSync(path.join(root, 'functions/api/ai/intake.js'), 'utf8');
const invoiceSrc = fs.readFileSync(path.join(root, 'functions/api/ai/invoice.js'), 'utf8');
const quotaSrc = fs.readFileSync(path.join(root, 'functions/api/ai/_quota.js'), 'utf8');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

/* Les routes sont des modules ESM sans effets de bord au chargement : on
 * retire les imports et on évalue le reste pour obtenir les vraies fonctions. */
function loadRoute(src, names, prelude) {
  const bare = (prelude ? prelude + '\n' : '') + src
    .split('\n')
    .filter((l) => !/^import\s/.test(l) && !/^export\s*\{[^}]*\};?\s*$/.test(l))
    .join('\n')
    .replace(/^export\s+/gm, '');
  return new Function(bare + '\nreturn { ' + names.join(', ') + ' };')();
}
const intake = loadRoute(intakeSrc, ['containsIdentityHints', 'validateCommitBody', 'isPdfBytes', 'publicDoc', 'DOC_TYPES_V1', 'DOC_STATUSES_V1', 'MAX_PDF_BYTES'], 'const DAILY_CAPS = { intake: 100 };');
const invoice = loadRoute(invoiceSrc, ['validateInvoiceData']);

await check('identity pre-screen catches passports, CIN and police sheets', () => {
  assert.equal(intake.containsIdentityHints('Passeport marocain N° X123'), true);
  assert.equal(intake.containsIdentityHints('Moroccan passport'), true);
  assert.equal(intake.containsIdentityHints('CIN : AB123456'), true);
  assert.equal(intake.containsIdentityHints('Carte nationale d’identité'), true);
  assert.equal(intake.containsIdentityHints('FICHE DE POLICE — hôtel'), true);
  assert.equal(intake.containsIdentityHints('جواز السفر'), true);
  assert.equal(intake.containsIdentityHints('بطاقة التعريف الوطنية'), true);
});

await check('identity pre-screen does not flag real supplier invoices', () => {
  assert.equal(intake.containsIdentityHints('Facture N° F-2026-118 · Coopérative Taliouine · ICE 002345678000012 · Total 4 520,00 MAD'), false);
  assert.equal(intake.containsIdentityHints('Bon de livraison BL-77 · Lait UHT 24 briques · 228,00 MAD'), false);
  assert.equal(intake.containsIdentityHints('médecin traitant'), false);
  assert.equal(intake.containsIdentityHints(''), false);
});

await check('commit body accepts one well-formed PDF deposit', () => {
  const v = intake.validateCommitBody({ sha256: 'a'.repeat(64), mime: 'application/pdf', size: 123456, docType: 'supplier_invoice', source: 'stock-scan' });
  assert.deepEqual(v, { sha256: 'a'.repeat(64), mime: 'application/pdf', size: 123456, docType: 'supplier_invoice', source: 'stock-scan' });
});

await check('commit body rejects bad hash, type, size and unknown doc types', () => {
  const good = { sha256: 'b'.repeat(64), mime: 'application/pdf', size: 100, docType: 'supplier_invoice', source: 's' };
  assert.equal(intake.validateCommitBody({ ...good, sha256: 'xyz' }), null);
  assert.equal(intake.validateCommitBody({ ...good, mime: 'image/jpeg' }), null);
  assert.equal(intake.validateCommitBody({ ...good, size: 0 }), null);
  assert.equal(intake.validateCommitBody({ ...good, size: 11 * 1024 * 1024 }), null);
  assert.equal(intake.validateCommitBody({ ...good, docType: 'passport' }), null);
  assert.equal(intake.validateCommitBody({ ...good, docType: 'expense_receipt' }), null);
  assert.equal(intake.validateCommitBody(null), null);
});

await check('PDF magic check accepts %PDF and refuses images', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]).buffer;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).buffer;
  assert.equal(intake.isPdfBytes(pdf), true);
  assert.equal(intake.isPdfBytes(png), false);
  assert.equal(intake.isPdfBytes(null), false);
});

await check('no auto-file path: draft exits are received and confirmed only', () => {
  assert.deepEqual(intake.DOC_STATUSES_V1, ['received', 'confirmed']);
  assert.deepEqual(intake.DOC_TYPES_V1, ['supplier_invoice']);
});

await check('public projection exposes status only, never document content', () => {
  const doc = intake.publicDoc({ doc_id: 'x', status: 'received', doc_type: 'supplier_invoice', source: 'stock-scan', mime: 'application/pdf', size: 5, has_object: 1, created_ts: 7, updated_ts: 8 });
  assert.deepEqual(Object.keys(doc).sort(), ['createdTs', 'docId', 'docType', 'hasObject', 'mime', 'size', 'source', 'status', 'updatedTs']);
});

await check('unit cost is a 4-decimal rate: 0.0045 MAD/g survives extraction', () => {
  const v = invoice.validateInvoiceData({ lines: [{ label: 'Safran', qty: 1000, unit: 'g', unitCost: 0.0045, total: 4.5 }] });
  assert.equal(v.lines[0].unitCost, 0.0045);
});

await check('net-price rule preserved at 4 decimals: 2 x 780, total 1482 → 741', () => {
  const v = invoice.validateInvoiceData({ lines: [{ label: 'Service', qty: 2, unit: 'pièce', unitCost: 780, total: 1482 }] });
  assert.equal(v.lines[0].unitCost, 741);
  assert.equal(v.lines[0].grossUnitCost, 780);
});

await check('intake quota kind registered and metered', () => {
  assert.match(quotaSrc, /intake:\s*100/);
  assert.match(intakeSrc, /quotaOk\(env,\s*who,\s*'intake',\s*DAILY_CAP\)/);
});

await check('tenant isolation and silence: strict tenantFor everywhere, no logging', () => {
  assert.equal((intakeSrc.match(/tenantFor\(request, env, .* \{ strict: true \}\)/g) || []).length >= 3, true);
  assert.doesNotMatch(intakeSrc, /console\.(log|info|warn|error)/);
  assert.match(intakeSrc, /cacheControl:\s*'private, no-store'/);
});

await check('client runs the identity screen before any upload or model call', () => {
  const m = stockSrc.match(/function stIntakeIdHint\(text\) \{[\s\S]*?\n  \}/);
  assert.ok(m, 'client pre-screen extractable and self-contained');
  const fn = new Function(m[0] + '; return stIntakeIdHint;')();
  assert.equal(fn('Passeport N° X1'), true);
  assert.equal(fn('جواز السفر'), true);
  assert.equal(fn('Facture F-118 · Total 228,00 MAD'), false);
  const branch = stockSrc.slice(stockSrc.indexOf('if (isPdf) {'), stockSrc.indexOf("kind: 'text'"));
  assert.ok(branch.indexOf('stIntakeIdHint(text)') < branch.indexOf('stIntakeCommit('), 'screen before commit');
  assert.ok(branch.indexOf('stIntakeCommit(') < branch.indexOf('/api/ai/invoice'), 'registry before extraction');
});

await check('duplicates stop, confirm marks via outbox, flag defaults off', () => {
  assert.match(stockSrc, /status === 'confirmed'[\s\S]{0,400}mScanDupDone/);
  assert.match(stockSrc, /stIntakeMarkOnce\(intakeDocId\)/);
  assert.doesNotMatch(stockSrc, /stIntakeMark\(docId, 'confirmed'\)/);
  assert.match(stockSrc, /wireIntakeStop\(\)/);
  assert.match(stockSrc, /localStorage\.getItem\('kiwiIntake1'\) === '1'/);
  for (const k of ['mScanIdTitle', 'mScanIdBody', 'mScanDupT', 'mScanDupDone', 'mScanArchived', 'mScanResume']) {
    assert.equal((stockSrc.match(new RegExp('\\b' + k + ':', 'g')) || []).length, 3, k + ' defined in FR, EN and AR');
  }
});

await check('propose-never-post wording survives in the review screen', () => {
  assert.match(stockSrc, /Le document reste à vérifier/);
  assert.match(stockSrc, /data-stock-intake-doc/);
});

/* ── Fenêtres de panne : exécution réelle de la route sur sosies ──────────
 * D1 et R2 sont des sosies en mémoire qui respectent le contrat (INSERT OR
 * IGNORE idempotent, R2 qui peut tomber) ; la route tourne VRAIMENT
 * (onRequestPost/Put/Get extraits du fichier livré), avec de vrais objets
 * Request et un vrai SHA-256. */
const harnessSrc = intakeSrc
  .split('\n')
  .filter((l) => !/^import\s/.test(l) && !/^export\s*\{[^}]*\};?\s*$/.test(l))
  .join('\n')
  .replace(/^export\s+/gm, '');
const harnessPrelude = `
const json = (body, status) => ({ status: status || 200, body });
const tenantFor = async (req, env, asked) => (asked ? String(asked) : null);
const quotaOk = async () => true;
const DAILY_CAPS = { intake: 100 };
`;
const harness = new Function(harnessPrelude + harnessSrc + '\nreturn { onRequestPost, onRequestPut, onRequestGet };')();

function makeDoubles() {
  const docs = new Map();
  const r2 = new Map();
  const flags = { r2Fails: false };
  const DB = {
    prepare(sql) {
      const s = String(sql);
      // Forme réelle de D1 : prepare(sql).bind(...).first()/.run().
      const stmt = (...args) => {
        if (/INSERT OR IGNORE INTO intake_docs/.test(s)) {
          const [merchant, docId, mime, size, r2key, docType, source, cts, uts] = args;
          const k = merchant + '|' + docId;
          const isNew = !docs.has(k);
          if (isNew) docs.set(k, { merchant, doc_id: docId, mime, size, r2_key: r2key, has_object: 0, status: 'received', doc_type: docType, source, created_ts: cts, updated_ts: uts });
          return { meta: { changes: isNew ? 1 : 0 } };
        }
        if (/SELECT \* FROM intake_docs/.test(s)) {
          const [merchant, docId] = args;
          return docs.get(merchant + '|' + docId) || null;
        }
        if (/UPDATE intake_docs SET status/.test(s)) {
          const [status, uts, merchant, docId] = args;
          const row = docs.get(merchant + '|' + docId);
          if (!row) return { meta: { changes: 0 } };
          row.status = status; row.updated_ts = uts;
          return { meta: { changes: 1 } };
        }
        if (/UPDATE intake_docs SET r2_key/.test(s)) {
          const [key, uts, merchant, docId] = args;
          const row = docs.get(merchant + '|' + docId);
          if (!row) return { meta: { changes: 0 } };
          row.r2_key = key; row.has_object = 1; row.updated_ts = uts;
          return { meta: { changes: 1 } };
        }
        throw new Error('unexpected sql: ' + s);
      };
      return { bind: (...args) => ({ first: async () => stmt(...args), run: async () => stmt(...args) }) };
    },
  };
  const MEDIA = {
    put: async (key, bytes) => { if (flags.r2Fails) throw new Error('r2-down'); r2.set(key, bytes); },
    delete: async (key) => { r2.delete(key); },
  };
  return { docs, r2, flags, env: { DB, MEDIA } };
}
const pdfBytes = (seed) => new TextEncoder().encode('%PDF-1.4 dépôt test ' + seed + ' — facture 228,00 MAD').buffer;
async function realSha(buffer) {
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function postReq(body) {
  return new Request('https://kiwi.test/api/ai/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
function putReq(merchant, docId, buffer) {
  return new Request('https://kiwi.test/api/ai/intake?merchant=' + encodeURIComponent(merchant) + '&docId=' + encodeURIComponent(docId), {
    method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: buffer,
  });
}
const MERCHANT = 'demo-tenant';

await check('happy path on live route code: commit, verified upload, confirm, read-back', async () => {
  const h = makeDoubles();
  const bytes = pdfBytes('ok');
  const sha = await realSha(bytes);
  const c = await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'commit', sha256: sha, mime: 'application/pdf', size: bytes.byteLength, docType: 'supplier_invoice', source: 'stock-scan' }), env: h.env });
  assert.equal(c.status, 200);
  assert.equal(c.body.duplicate, false);
  const u = await harness.onRequestPut({ request: putReq(MERCHANT, sha, bytes), env: h.env });
  assert.equal(u.status, 200);
  assert.equal(h.r2.size, 1);
  const m = await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'mark', docId: sha, status: 'confirmed' }), env: h.env });
  assert.equal(m.status, 200);
  assert.equal(m.body.doc.status, 'confirmed');
  const g = await harness.onRequestGet({ request: new Request('https://kiwi.test/api/ai/intake?merchant=' + MERCHANT + '&docId=' + sha), env: h.env });
  assert.equal(g.body.doc.status, 'confirmed');
  assert.equal(g.body.doc.hasObject, true);
});

await check('hash mismatch refused before R2: bytes never attach to the wrong draft', async () => {
  const h = makeDoubles();
  const good = pdfBytes('good');
  const evil = pdfBytes('evil-different-bytes-padded!!');
  const sha = await realSha(good);
  // Même longueur exigée par le contrôle de taille : on aligne les longueurs.
  const evilSized = evil.slice(0, good.byteLength);
  assert.equal(evilSized.byteLength, good.byteLength);
  await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'commit', sha256: sha, mime: 'application/pdf', size: good.byteLength, docType: 'supplier_invoice', source: 's' }), env: h.env });
  const u = await harness.onRequestPut({ request: putReq(MERCHANT, sha, evilSized), env: h.env });
  assert.equal(u.status, 400);
  assert.equal(u.body.error, 'hash-mismatch');
  assert.equal(h.r2.size, 0);
});

await check('concurrent commits converge: one 200-new, one 200-duplicate, never 503', async () => {
  const h = makeDoubles();
  const bytes = pdfBytes('race');
  const sha = await realSha(bytes);
  const payload = { merchant: MERCHANT, action: 'commit', sha256: sha, mime: 'application/pdf', size: bytes.byteLength, docType: 'supplier_invoice', source: 's' };
  const [a, b] = await Promise.all([
    harness.onRequestPost({ request: postReq(payload), env: h.env }),
    harness.onRequestPost({ request: postReq(payload), env: h.env }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  const flags = [a.body.duplicate, b.body.duplicate].sort();
  assert.deepEqual(flags, [false, true]);
});

await check('R2 down: upload 500 leaves no object, confirm blocked with 409', async () => {
  const h = makeDoubles();
  h.flags.r2Fails = true;
  const bytes = pdfBytes('r2down');
  const sha = await realSha(bytes);
  await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'commit', sha256: sha, mime: 'application/pdf', size: bytes.byteLength, docType: 'supplier_invoice', source: 's' }), env: h.env });
  const u = await harness.onRequestPut({ request: putReq(MERCHANT, sha, bytes), env: h.env });
  assert.equal(u.status, 500);
  assert.equal(h.r2.size, 0);
  const m = await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'mark', docId: sha, status: 'confirmed' }), env: h.env });
  assert.equal(m.status, 409);
  assert.equal(m.body.error, 'not-archived');
  const g = await harness.onRequestGet({ request: new Request('https://kiwi.test/api/ai/intake?merchant=' + MERCHANT + '&docId=' + sha), env: h.env });
  assert.equal(g.body.doc.status, 'received');
});

await check('sealed drafts stay sealed: re-upload after confirm 409, unknown doc 404, no tenant 401', async () => {
  const h = makeDoubles();
  const bytes = pdfBytes('sealed');
  const sha = await realSha(bytes);
  await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'commit', sha256: sha, mime: 'application/pdf', size: bytes.byteLength, docType: 'supplier_invoice', source: 's' }), env: h.env });
  await harness.onRequestPut({ request: putReq(MERCHANT, sha, bytes), env: h.env });
  await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'mark', docId: sha, status: 'confirmed' }), env: h.env });
  const re = await harness.onRequestPut({ request: putReq(MERCHANT, sha, bytes), env: h.env });
  assert.equal(re.status, 409);
  const ghost = await harness.onRequestPost({ request: postReq({ merchant: MERCHANT, action: 'mark', docId: 'f'.repeat(64), status: 'confirmed' }), env: h.env });
  assert.equal(ghost.status, 404);
  const anon = await harness.onRequestPost({ request: postReq({ merchant: '', action: 'commit', sha256: sha, mime: 'application/pdf', size: 1, docType: 'supplier_invoice', source: 's' }), env: h.env });
  assert.equal(anon.status, 401);
});

/* ── Garde anti-repost côté client, exécutée ─────────────────────────────── */
function extractClient(name) {
  const m = stockSrc.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'client helper extractable: ' + name);
  return m[0];
}
function clientScope(win, ...names) {
  const src = names.map(extractClient).join('\n');
  return new Function('window', src + '; return { ' + names.join(', ') + ' };')(win);
}
const memStore = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); } };
};

await check('post guard never reposts: local posted and server confirmed both block', () => {
  const { stIntakePostGuard: guard } = clientScope(undefined, 'stIntakePostGuard');
  assert.equal(guard(false, ''), 'ok');
  assert.equal(guard(false, 'received'), 'ok');
  assert.equal(guard(false, 'confirmed'), 'duplicate-server');
  assert.equal(guard(true, ''), 'duplicate-local');
  assert.equal(guard(true, 'confirmed'), 'duplicate-local');
});

await check('outbox and posted-set round-trip per merchant namespace', () => {
  const store = memStore();
  const win = { localStorage: store, Kiwi: undefined };
  const { stIntakeOutboxRead: read, stIntakeOutboxWrite: write, stIntakePostedHas: has, stIntakePostedAdd: add } =
    clientScope(win, 'stIntakeMerchant', 'stIntakeOutboxKey', 'stIntakePostedKey', 'stIntakeOutboxRead', 'stIntakeOutboxWrite', 'stIntakePostedHas', 'stIntakePostedAdd');
  assert.deepEqual(read(), []);
  assert.equal(has('abc'), false);
  write([{ docId: 'abc', ts: 1 }]);
  assert.deepEqual(read(), [{ docId: 'abc', ts: 1 }]);
  add('abc');
  assert.equal(has('abc'), true);
  //_namespaced_: un autre établissement ne voit rien.
  const win2 = { localStorage: memStore(), Kiwi: undefined };
  assert.equal(clientScope(win2, 'stIntakeMerchant', 'stIntakePostedKey', 'stIntakePostedHas').stIntakePostedHas('abc'), false);
});

await check('confirm path ordered: guard and single-owner core before any stock write', () => {
  const confirmZone = stockSrc.slice(stockSrc.indexOf("querySelector('[data-stock-scan-confirm]')"), stockSrc.indexOf('stSaveOverlay();\n      // Guichet unique'));
  assert.ok(confirmZone.indexOf('stIntakePostGuard(') > 0, 'guard present on the confirm path');
  assert.ok(confirmZone.includes('stIntakePostGuard('), 'guard consulted on confirm');
  assert.ok(confirmZone.includes('stIntakeServerStatus('), 'server status consulted on confirm');
  assert.ok(confirmZone.indexOf('stIntakePostGuard(') < confirmZone.indexOf('stIntakePostAll('), 'guard before posting core');
  const intakeBranch = confirmZone.slice(confirmZone.indexOf('if (intakeDocId) {'), confirmZone.indexOf('} else {'));
  assert.ok(intakeBranch.includes('stIntakePostAll('), 'intake path posts through the core');
  assert.ok(!intakeBranch.includes('receiveDirect(') && !intakeBranch.includes('moveStock('), 'no direct writes on the intake path: one owner');
  assert.match(stockSrc, /function stIntakePostAll\(ctx\)/, 'single-owner posting core exists');
  assert.match(stockSrc, /stIntakePostingIds\(docId/, 'core derives deterministic ids');
  assert.ok(stockSrc.indexOf('stIntakeMarkOnce(intakeDocId)') > stockSrc.indexOf('stSaveOverlay();\n      // Guichet unique'), 'mark after stock write');
  assert.match(stockSrc, /renderRealReceiptReview\(\{ supplier: null, intakeDocId \}\)/, 'manual fallback preserves doc context');
  assert.match(intakeSrc, /INSERT OR IGNORE INTO intake_docs/, 'commit converges on concurrent inserts');
  assert.match(intakeSrc, /error: 'not-archived'/, 'confirm requires the archived object');
  assert.match(intakeSrc, /error: 'hash-mismatch'/, 'upload binds bytes to docId');
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS intake_docs/, 'canonical schema carries intake_docs');
  assert.ok(fs.existsSync(path.join(root, 'migrations', '2026-09-03-intake-docs.sql')), 'migration ships with the route');
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('intake-slice1-test: ' + checks + ' checks passed\n');
