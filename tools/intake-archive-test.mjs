#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake archive test — le coffre privé des pièces déposées.
 *
 * La route /api/ai/intake-archive sert métadonnées paginées + octets PDF
 * sous session propriétaire stricte (ownerMerchant, jamais tenantFor : un
 * cookie de caisse valide ne doit ni élargir ni détourner l'autorité de la
 * session), sans URL R2 publique, sans clé cliente, sans hash/empreinte/
 * contenu dans les métadonnées. Cette suite exécute la VRAIE route avec le
 * VRAI code auth — sessions, caisse et opérateur signés puis vérifiés pour
 * de vrai (makeSession/readSession, tillToken/isTillFor, operatorToken/
 * namedOperatorId), vrai ownerMerchant, vrai tenantFor pour la preuve de
 * non-vacuité — contre des sosies D1/R2.
 * Le rendu du coffre (vrai renderScanArchive de assets/stock.js) est exercé
 * en FR/EN/AR avec les vrais dictionnaires.
 *
 *   node tools/intake-archive-test.mjs
 * ═══════════════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const EXPECTED = 17;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routeSrc = fs.readFileSync(path.join(root, 'functions/api/ai/intake-archive.js'), 'utf8');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

/* ── Vrai code auth + vraies routes, sosies D1/R2 ────────────────────────── */
const auth = await import(path.join(root, 'functions/auth/_lib.js'));
const priv = await import(path.join(root, 'functions/api/_private.js'));
const archive = await import(path.join(root, 'functions/api/ai/intake-archive.js'));

const SECRET = 'archive-owner-test-secret-32bytes!';
const A = 'cafe-atlas';
const A2 = 'atlas-branch';
const B = 'maison-rivale';
const SUSP = 'cafe-suspended';
const PEND = 'cafe-pending';
const SOLO = 'cafe-solo';
const LIBRE = 'cafe-libre';

function makeWorld() {
  const accounts = new Map([
    ['acc-owner-a', { business: 'Café Atlas' }],
    ['acc-owner-b', { business: 'Maison Rivale' }],
    ['acc-solo', { business: 'Café Solo' }],
    ['acc-claimant', { business: 'Café Libre' }],
  ]);
  const merchants = new Map([
    [A, { account_id: 'acc-owner-a', status: 'active', till_epoch: 0 }],
    [A2, { account_id: 'acc-owner-a', status: 'active', till_epoch: 0 }],
    [B, { account_id: 'acc-owner-b', status: 'active', till_epoch: 0 }],
    [SUSP, { account_id: 'acc-owner-a', status: 'suspended', till_epoch: 0 }],
    [PEND, { account_id: 'acc-owner-a', status: 'pending', till_epoch: 0 }],
    [LIBRE, { account_id: 'acc-solo', status: 'active', till_epoch: 0 }],
  ]);
  const operators = new Map([['op1', {}]]);
  const docs = new Map(); // merchant|docId -> ligne complète
  const r2 = new Map();   // key -> bytes
  const DB = {
    prepare(rawSql) {
      const q = String(rawSql).replace(/\s+/g, ' ').trim();
      const intList = (merchant, pred, n) => Array.from(docs.values())
        .filter((r) => r.merchant === merchant && pred(r))
        .sort((x, y) => (y.created_ts - x.created_ts) || (y.doc_id < x.doc_id ? -1 : 1))
        .slice(0, n);
      const exec = (args) => {
        if (q.startsWith('SELECT business FROM accounts')) return accounts.get(String(args[0])) || null;
        if (q.startsWith('SELECT account_id FROM merchant_config')) {
          const row = merchants.get(String(args[0]));
          return row ? { account_id: row.account_id } : null;
        }
        if (q.startsWith('SELECT status FROM merchant_config')) {
          const row = merchants.get(String(args[0]));
          return row ? { status: row.status } : null;
        }
        if (q.startsWith('SELECT till_epoch FROM merchant_config')) {
          const row = merchants.get(String(args[0]));
          return row ? { till_epoch: row.till_epoch } : null;
        }
        if (q.startsWith('SELECT id FROM operators')) {
          return operators.has(String(args[0])) ? { id: String(args[0]) } : null;
        }
        if (/FROM intake_docs WHERE merchant = \? AND \(created_ts </.test(q)) {
          const [merchant, ts, ts2, id, n] = args;
          return intList(merchant, (r) => r.created_ts < ts || (r.created_ts === ts2 && r.doc_id < id), n);
        }
        if (/FROM intake_docs WHERE merchant = \? ORDER BY/.test(q)) {
          return intList(args[0], () => true, args[1]);
        }
        if (/FROM intake_docs WHERE merchant = \? AND doc_id = \?/.test(q)) {
          return docs.get(args[0] + '|' + args[1]) || null;
        }
        return null; // CREATE TABLE and anything else: accepted, no rows
      };
      const api = (...args) => ({
        run: async () => ({ success: true, meta: { changes: 0 } }),
        first: async () => exec(args),
        all: async () => {
          const v = exec(args);
          return { results: Array.isArray(v) ? v : (v ? [v] : []) };
        },
      });
      return Object.assign(api(), { bind: (...a) => api(...a) });
    },
  };
  const MEDIA = {
    put: async (key, bytes) => { r2.set(String(key), bytes); },
    get: async (key) => {
      if (!r2.has(String(key))) return null;
      const bytes = r2.get(String(key));
      return {
        body: bytes,
        httpEtag: '"test-etag"',
        writeHttpMetadata: (h) => { h.set('Content-Type', 'application/pdf'); },
      };
    },
    delete: async (key) => { r2.delete(String(key)); },
  };
  return { docs, r2, env: { DB, MEDIA, AUTH_SECRET: SECRET } };
}
function seedDoc(world, merchant, docId, over = {}) {
  const row = Object.assign({
    merchant, doc_id: docId, mime: 'application/pdf', size: 12345,
    r2_key: 'intake/' + merchant + '/' + docId + '.pdf', has_object: 1,
    status: 'received', doc_type: 'supplier_invoice', source: 'stock-scan',
    posting_hash: 'deadbeef'.repeat(8), posting_count: 2,
    created_ts: 1788000000000, updated_ts: 1788000000000,
  }, over);
  world.docs.set(merchant + '|' + docId, row);
  world.r2.set(row.r2_key, new TextEncoder().encode('%PDF-1.4 fake ' + docId.slice(0, 8)));
  return row;
}
const DOC_A = 'a'.repeat(64);
const DOC_B = 'b'.repeat(64);
async function sessCookie(aid) {
  return `${auth.SESS_COOKIE}=${await auth.makeSession(aid, SECRET)}`;
}
async function tillCookie(merchant) {
  return `${auth.TILL_COOKIE}=${await auth.tillToken(SECRET, merchant, 0)}`;
}
async function opCookies() {
  return `kiwi_op=${await auth.operatorToken(SECRET)}; kiwi_op_id=${await auth.operatorIdToken(SECRET, 'op1')}`;
}
function get(url, ...cookies) {
  const jar = cookies.filter(Boolean).join('; ');
  return { request: new Request(url, { headers: jar ? { Cookie: jar } : {} }) };
}

await check('mixed cookies denied on listing, and the setup is non-vacuous', async () => {
  const w = makeWorld();
  seedDoc(w, B, DOC_B);
  const sessA = await sessCookie('acc-owner-a');
  const tillB = await tillCookie(B);
  const req = get('https://t/api/ai/intake-archive?merchant=' + B, sessA, tillB).request;
  // Preuve de non-vacuité : le VRAI tenantFor honore la caisse et rend B.
  assert.equal(await priv.tenantFor(req, w.env, B, { strict: true }), B);
  const res = await archive.onRequestGet({ request: req, env: w.env });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'missing-object');
});

await check('mixed cookies denied on bytes too', async () => {
  const w = makeWorld();
  seedDoc(w, B, DOC_B);
  const cookie = await sessCookie('acc-owner-a') + '; ' + await tillCookie(B);
  const res = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B + '&docId=' + DOC_B, cookie), env: w.env });
  assert.equal(res.status, 404);
});

await check('owner session wins over a foreign till on its own store', async () => {
  const w = makeWorld();
  seedDoc(w, B, DOC_B);
  const cookie = await sessCookie('acc-owner-b') + '; ' + await tillCookie(A);
  const list = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B, cookie), env: w.env });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).docs.map((d) => d.docId), [DOC_B]);
  const bytes = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B + '&docId=' + DOC_B, cookie), env: w.env });
  assert.equal(bytes.status, 200);
});

await check('till alone, operator alone, and unknown stores fail closed', async () => {
  const w = makeWorld();
  seedDoc(w, B, DOC_B);
  const r1 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B, await tillCookie(B)), env: w.env });
  assert.equal(r1.status, 401);
  const r2 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B, await opCookies()), env: w.env });
  assert.equal(r2.status, 401);
  const r3 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B + '&docId=' + DOC_B, await opCookies()), env: w.env });
  assert.equal(r3.status, 401);
  const r4 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + B, await sessCookie('acc-owner-a'), await opCookies()), env: w.env });
  assert.equal(r4.status, 404);
  const r5 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=boutique-fantome', await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(r5.status, 404);
  assert.equal((await r5.json()).error, 'missing-object');
});

await check('owned secondary store allowed; registry claim beats account slug', async () => {
  const w = makeWorld();
  seedDoc(w, A2, DOC_A);
  const ok = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A2, await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(ok.status, 200);
  const denied = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + LIBRE, await sessCookie('acc-claimant')), env: w.env });
  assert.equal(denied.status, 404);
  seedDoc(w, LIBRE, DOC_B);
  const allowed = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + LIBRE, await sessCookie('acc-solo')), env: w.env });
  assert.equal(allowed.status, 200);
});

await check('legacy mono-store fallback allows the unclaimed, reads stay open when suspended', async () => {
  const w = makeWorld();
  seedDoc(w, SOLO, DOC_A);
  const ok = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + SOLO, await sessCookie('acc-solo')), env: w.env });
  assert.equal(ok.status, 200);
  seedDoc(w, SUSP, DOC_A);
  seedDoc(w, PEND, DOC_B);
  const s = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + SUSP, await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(s.status, 200);
  const p = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + PEND, await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(p.status, 200);
});

await check('owner lists own metadata with the exact safe projection', async () => {
  const w = makeWorld();
  seedDoc(w, A, DOC_A);
  const res = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A, await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.docs.length, 1);
  const keys = Object.keys(body.docs[0]).sort();
  assert.deepEqual(keys, ['createdTs', 'docId', 'docType', 'hasObject', 'mime', 'size', 'status', 'updatedTs']);
  assert.equal(body.docs[0].docId, DOC_A);
  assert.equal(body.nextCursor, null);
});

await check('owner reads own bytes with private no-store headers', async () => {
  const w = makeWorld();
  seedDoc(w, A, DOC_A);
  const res = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_A, await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.ok(String(res.headers.get('Content-Disposition') || '').startsWith('inline;'));
  const text = await res.text();
  assert.ok(text.includes('%PDF-1.4 fake'));
});

await check('download flag switches to attachment without leaking internals', async () => {
  const w = makeWorld();
  seedDoc(w, A, DOC_A);
  const res = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_A + '&download=1', await sessCookie('acc-owner-a')), env: w.env });
  assert.equal(res.status, 200);
  const disp = String(res.headers.get('Content-Disposition') || '');
  assert.ok(disp.startsWith('attachment;'));
  assert.ok(!disp.includes(DOC_A) || disp.includes(DOC_A.slice(0, 12)), 'filename carries at most the short id');
  assert.ok(!disp.includes('deadbeef'), 'no fingerprint in filename');
});

await check('missing object states: no row, pending upload, lost bytes, tampered key', async () => {
  const w = makeWorld();
  const sess = await sessCookie('acc-owner-a');
  const r1 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_A, sess), env: w.env });
  assert.equal(r1.status, 404);
  seedDoc(w, A, DOC_A, { has_object: 0 });
  w.r2.delete('intake/' + A + '/' + DOC_A + '.pdf');
  const r2 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_A, sess), env: w.env });
  assert.equal(r2.status, 404);
  assert.equal((await r2.json()).error, 'missing-object');
  seedDoc(w, A, DOC_B, { has_object: 1, r2_key: 'intake/' + A + '/elsewhere.pdf' });
  const r3 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_B, sess), env: w.env });
  assert.equal(r3.status, 404);
  seedDoc(w, A, DOC_A, { has_object: 1 });
  w.r2.delete('intake/' + A + '/' + DOC_A + '.pdf');
  const r4 = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=' + DOC_A, sess), env: w.env });
  assert.equal(r4.status, 404);
});

await check('storage-unavailable and bad inputs are explicit', async () => {
  const w = makeWorld();
  seedDoc(w, A, DOC_A);
  const sess = await sessCookie('acc-owner-a');
  const sessX = `${auth.SESS_COOKIE}=${await auth.makeSession('acc-owner-a', 'x')}`;
  const noMedia = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A, sessX), env: { DB: w.env.DB, AUTH_SECRET: 'x' } });
  assert.equal(noMedia.status, 503);
  assert.equal((await noMedia.json()).error, 'storage-unavailable');
  const badDoc = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&docId=zzz', sess), env: w.env });
  assert.equal(badDoc.status, 400);
  const badCur = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&cursor=bogus', sess), env: w.env });
  assert.equal(badCur.status, 400);
  assert.equal((await badCur.json()).error, 'bad-cursor');
});

await check('pagination is bounded, deterministic and lossless', async () => {
  const w = makeWorld();
  const sess = await sessCookie('acc-owner-a');
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const hex = ('' + i).padStart(64, String.fromCharCode(97 + (i % 6)));
    ids.push(hex);
    seedDoc(w, A, hex, { created_ts: 1788000000000 + (i < 3 ? 0 : i), size: 1000 + i });
  }
  const huge = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&limit=999', sess), env: w.env });
  assert.equal((await huge.json()).docs.length, 5);
  const seen = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const r = await archive.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=' + A + '&limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), sess), env: w.env });
    const b = await r.json();
    for (const d of b.docs) seen.push(d.docId);
    cursor = b.nextCursor;
    if (!cursor) break;
  }
  assert.equal(cursor, null);
  assert.deepEqual([...new Set(seen)].sort(), [...ids].sort());
  assert.equal(seen.length, 5);
});

/* ── Rendu du coffre : vrai code, vrais dictionnaires ───────────────────── */
function grabStock(re, what) {
  const m = stockSrc.match(re);
  assert.ok(m, 'extractable stock: ' + what);
  return m[0];
}
const renderPrelude = [
  grabStock(/  const STOCK_MATERIAL_ICONS = \{[\s\S]*?\n  \};/, 'STOCK_MATERIAL_ICONS'),
  grabStock(/  const svg = [^\n]+\n/, 'svg'),
  grabStock(/  const esc = [^\n]+\n/, 'esc'),
  grabStock(/  const STR = \{[\s\S]*?\n  \};/, 'STR'),
  grabStock(/  const lang = [^\n]+\n/, 'lang'),
  grabStock(/  const t = \(k, \.\.\.args\) => \{[\s\S]*?\n  \};/, 't'),
].join('\n');
const RENDER_FNS = ['stIntakeMerchant', 'stArchiveUrl', 'stFmtSize', 'stFmtArcDate', 'stArcTypeLabel', 'stArcStatusLabel', 'renderScanArchive'];
function extractRender(name) {
  const m = stockSrc.match(new RegExp('  (?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  assert.ok(m, 'stock render extractable: ' + name);
  return m[0];
}
const renderSrc = renderPrelude + '\n' + RENDER_FNS.map(extractRender).join('\n');
function renderCtx(lg) {
  const win = { KiwiI18n: { getLang: () => lg }, Kiwi: { venue: () => 'demo-tenant' } };
  win.window = win;
  const ctx = vm.createContext({
    window: win, console,
    Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, RegExp, Error, Promise,
  });
  vm.runInContext(renderSrc + '\n;window.__arc = { ' + RENDER_FNS.join(',') + ', t };', ctx, { filename: 'stock-archive-render.js' });
  return ctx;
}
const arcDocs = () => ([
  { docId: DOC_A, docType: 'supplier_invoice', status: 'confirmed', mime: 'application/pdf', size: 1572864, hasObject: true, createdTs: 1788000000000, updatedTs: 1788000000000, supplier: 'Evil Corp<script>', total: 99999, posting_hash: 'deadbeef'.repeat(8) },
  { docId: DOC_B, docType: 'weird<script>type', status: 'received', mime: 'application/pdf', size: 512, hasObject: false, createdTs: 1788000001000, updatedTs: 1788000001000 },
]);

await check('archive renders FR/EN/AR with RTL-safe ids, dates and sizes', async () => {
  const fr = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'ready', docs: arcDocs() })})`, renderCtx('fr'));
  const en = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'ready', docs: arcDocs() })})`, renderCtx('en'));
  const ar = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'ready', docs: arcDocs() })})`, renderCtx('ar'));
  assert.ok(fr.includes('Documents fournisseurs') && fr.includes('Facture fournisseur'), 'FR copy');
  assert.ok(en.includes('Supplier documents') && en.includes('Supplier invoice'), 'EN copy');
  assert.ok(ar.includes('مستندات الموردين') && ar.includes('فاتورة مورد'), 'AR copy');
  for (const [name, html] of [['fr', fr], ['en', en], ['ar', ar]]) {
    assert.ok(html.includes('<bdi dir="ltr"'), name + ': ids/dates/sizes isolated LTR (house RTL pattern)');
  }
  assert.ok(!/<div[^>]*dir="ltr"[^>]*>/.test(ar.replace(/<bdi dir="ltr">/g, '')), 'AR layout never forced LTR outside numeric isolation');
  assert.ok(ar.includes('رجوع'), 'AR back action translated');
});

await check('archive invents nothing and gates viewing on hasObject', async () => {
  const ctx = renderCtx('fr');
  const html = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'ready', docs: arcDocs() })})`, ctx);
  assert.ok(!html.includes('Evil Corp'), 'no supplier names: D1 does not retain them');
  assert.ok(!html.includes('99999'), 'no totals: D1 does not retain them');
  assert.ok(!html.includes('deadbeef'), 'no fingerprints in markup');
  assert.ok(html.includes(DOC_A.slice(0, 12)), 'shortened identifier shown');
  const visible = html.replace(/href="[^"]*"/g, '');
  assert.ok(!visible.includes(DOC_A.slice(12)), 'full hash never shown outside link targets');
  const views = (html.match(/intake-archive\?merchant=/g) || []).length;
  assert.equal(views, 2, 'view+download links only for the archived row');
  assert.ok(html.includes('Envoi en cours'), 'pending row states the truth');
  assert.ok(html.includes('weird&lt;script&gt;type'), 'unknown types escaped, not dropped');
});

await check('archive states: loading, empty, unavailable, retry', async () => {
  const ctx = renderCtx('en');
  const loading = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'loading', docs: [] })})`, ctx);
  assert.ok(loading.includes('Loading'), 'loading state');
  const empty = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'empty', docs: [] })})`, ctx);
  assert.ok(empty.includes('No documents filed yet'), 'empty state');
  const down = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'unavailable', docs: [] })})`, ctx);
  assert.ok(down.includes('Archive unavailable') && down.includes('data-stock-arc-retry'), 'unavailable state with retry');
  const arDown = vm.runInContext(`window.__arc.renderScanArchive(${JSON.stringify({ status: 'unavailable', docs: [] })})`, renderCtx('ar'));
  assert.ok(arDown.includes('الأرشيف غير متاح'), 'unavailable state translated');
});

await check('POST is explicitly rejected on the read-only archive route', async () => {
  const src = routeSrc;
  assert.ok(/export async function onRequestPost\(\) \{\s*\n?\s*return json\(\{ error: 'method-not-allowed' \}, 405\);/.test(src), 'explicit 405, no silent write path');
});

await check('size formatting is locale-aware and never raw bytes', async () => {
  const fr = vm.runInContext(`window.__arc.stFmtSize(1572864)`, renderCtx('fr'));
  const en = vm.runInContext(`window.__arc.stFmtSize(1572864)`, renderCtx('en'));
  assert.equal(fr, '1,5 Mo');
  assert.equal(en, '1.5 MB');
  assert.equal(vm.runInContext(`window.__arc.stFmtSize(512)`, renderCtx('fr')), '512 o');
});

assert.equal(checks, EXPECTED, 'expected ' + EXPECTED + ' executed checks, got ' + checks);
process.stdout.write('intake-archive-test: ' + checks + ' checks passed\n');
