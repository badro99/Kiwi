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

const EXPECTED = 14;
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

await check('duplicates stop, confirm marks, flag defaults off', () => {
  assert.match(stockSrc, /status === 'confirmed'[\s\S]{0,400}mScanDupDone/);
  assert.match(stockSrc, /stIntakeMark\(docId, 'confirmed'\)/);
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

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('intake-slice1-test: ' + checks + ' checks passed\n');
