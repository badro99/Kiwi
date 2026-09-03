#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · intake archive test — le coffre privé des pièces déposées.
 *
 * La route /api/ai/intake-archive sert métadonnées paginées + octets PDF
 * sous session propriétaire stricte, sans URL R2 publique, sans clé cliente,
 * sans hash/empreinte/contenu dans les métadonnées. Cette suite exécute la
 * VRAIE route (extraite de functions/api/ai/intake-archive.js, imports
 * neutralisés) contre des sosies D1/R2, avec les VRAIS json/readCookie de
 * functions/auth/_lib.js — seuls readSession/tenantFor sont simulés.
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

const EXPECTED = 13;
let checks = 0;
process.on('unhandledRejection', (error) => { console.error(error); process.exit(1); });
async function check(name, fn) {
  await fn();
  checks += 1;
  process.stdout.write('  ok ' + checks + ' - ' + name + '\n');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routeSrc = fs.readFileSync(path.join(root, 'functions/api/ai/intake-archive.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(root, 'functions/auth/_lib.js'), 'utf8');
const stockSrc = fs.readFileSync(path.join(root, 'assets/stock.js'), 'utf8');

/* ── Vrais json/readCookie (sans dépendances), session simulée ───────────── */
function grabAuth(re, what) {
  const m = authSrc.match(re);
  assert.ok(m, 'extractable auth: ' + what);
  return m[0].replace(/^export\s+/gm, '');
}
const SESSIONS = { 'sess-a': { aid: 'a1' }, 'sess-b': { aid: 'b1' } };
const OWNED = { a1: ['demo-tenant'], b1: ['second-souk'] };
function aidOf(cookie) {
  const raw = String(cookie || '');
  const m = raw.match(/(?:^|;\s*)kiwi_sess=([^;]+)/);
  const key = m ? m[1].trim() : raw.trim();
  const s = SESSIONS[key];
  return s ? s.aid : null;
}
const routePrelude = [
  grabAuth(/export const SESS_COOKIE = [^\n]+\n/, 'SESS_COOKIE'),
  grabAuth(/export function readCookie\(request, name\) \{[\s\S]*?\n\}/, 'readCookie'),
  grabAuth(/export function json\(obj, status, extraHeaders\) \{[\s\S]*?\n\}/, 'json'),
  `const __SESSIONS = ${JSON.stringify(SESSIONS)};`,
  `const __OWNED = ${JSON.stringify(OWNED)};`,
  'const __aidOf = (cookie) => { const raw = String(cookie || ""); const m = raw.match(/(?:^|;\\s*)kiwi_sess=([^;]+)/); const key = m ? m[1].trim() : raw.trim(); const s = __SESSIONS[key]; return s ? s.aid : null; };',
  'const readSession = async (cookie) => { const aid = __aidOf(cookie); return aid ? { aid } : null; };',
  `const tenantFor = async (request, env, asked) => {
     const aid = __aidOf(request.headers.get('Cookie'));
     if (!aid) return '';
     const want = String(asked || '');
     return ((__OWNED[aid] || []).includes(want)) ? want : '';
   };`,
  'const ensureIntakeSchema = async () => {};',
].join('\n');
const route = new Function(routePrelude + '\n' + routeSrc
  .split('\n')
  .filter((l) => !/^import\s/.test(l))
  .join('\n')
  .replace(/^export\s+/gm, '') + '\nreturn { onRequestGet };'
)();

/* ── Sosies D1/R2 ───────────────────────────────────────────────────────── */
function makeWorld() {
  const docs = new Map(); // merchant|docId -> ligne complète
  const r2 = new Map();   // key -> bytes
  const DB = {
    prepare(sql) {
      const s = String(sql);
      const stmt = (...args) => {
        if (/FROM intake_docs WHERE merchant = \? AND \(created_ts </.test(s)) {
          const [merchant, ts, ts2, id, n] = args;
          const rows = Array.from(docs.values())
            .filter((r) => r.merchant === merchant && (r.created_ts < ts || (r.created_ts === ts2 && r.doc_id < id)))
            .sort((a, b) => (b.created_ts - a.created_ts) || (b.doc_id < a.doc_id ? -1 : 1))
            .slice(0, n);
          return { results: rows };
        }
        if (/FROM intake_docs WHERE merchant = \? ORDER BY/.test(s)) {
          const [merchant, n] = args;
          const rows = Array.from(docs.values())
            .filter((r) => r.merchant === merchant)
            .sort((a, b) => (b.created_ts - a.created_ts) || (b.doc_id < a.doc_id ? -1 : 1))
            .slice(0, n);
          return { results: rows };
        }
        if (/FROM intake_docs WHERE merchant = \? AND doc_id = \?/.test(s)) {
          return docs.get(args[0] + '|' + args[1]) || null;
        }
        throw new Error('unexpected sql: ' + s.slice(0, 70));
      };
      return { bind: (...a) => ({ first: async () => stmt(...a), run: async () => stmt(...a), all: async () => stmt(...a) }) };
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
  };
  return { docs, r2, env: { DB, MEDIA, AUTH_SECRET: 'test-secret' } };
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
function get(url, sess) {
  const headers = sess ? { Cookie: 'kiwi_sess=' + sess } : {};
  return { request: new Request(url, { headers }) };
}

await check('owner lists own metadata with the exact safe projection', async () => {
  const w = makeWorld();
  seedDoc(w, 'demo-tenant', DOC_A);
  const res = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant', 'sess-a'), env: w.env });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.docs.length, 1);
  const keys = Object.keys(body.docs[0]).sort();
  assert.deepEqual(keys, ['createdTs', 'docId', 'docType', 'hasObject', 'mime', 'size', 'status', 'updatedTs']);
  assert.equal(body.docs[0].docId, DOC_A);
  assert.equal(body.nextCursor, null);
});

await check('no session means 401, unknown tenant means 401', async () => {
  const w = makeWorld();
  seedDoc(w, 'demo-tenant', DOC_A);
  const r1 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant', null), env: w.env });
  assert.equal(r1.status, 401);
  assert.equal((await r1.json()).error, 'unauthorized');
  const r2 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=nope', 'sess-a'), env: w.env });
  assert.equal(r2.status, 401);
});

await check('cross-merchant isolation on list and bytes', async () => {
  const w = makeWorld();
  seedDoc(w, 'demo-tenant', DOC_A);
  seedDoc(w, 'second-souk', DOC_B);
  const list = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=second-souk', 'sess-b'), env: w.env });
  const ids = (await list.json()).docs.map((d) => d.docId);
  assert.deepEqual(ids, [DOC_B]);
  const cross = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=second-souk&docId=' + DOC_A, 'sess-b'), env: w.env });
  assert.equal(cross.status, 404);
  assert.equal((await cross.json()).error, 'missing-object');
});

await check('owner reads own bytes with private no-store headers', async () => {
  const w = makeWorld();
  seedDoc(w, 'demo-tenant', DOC_A);
  const res = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_A, 'sess-a'), env: w.env });
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
  seedDoc(w, 'demo-tenant', DOC_A);
  const res = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_A + '&download=1', 'sess-a'), env: w.env });
  assert.equal(res.status, 200);
  const disp = String(res.headers.get('Content-Disposition') || '');
  assert.ok(disp.startsWith('attachment;'));
  assert.ok(!disp.includes(DOC_A) || disp.includes(DOC_A.slice(0, 12)), 'filename carries at most the short id');
  assert.ok(!disp.includes('deadbeef'), 'no fingerprint in filename');
});

await check('missing object states: no row, pending upload, lost bytes, tampered key', async () => {
  const w = makeWorld();
  const r1 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_A, 'sess-a'), env: w.env });
  assert.equal(r1.status, 404);
  seedDoc(w, 'demo-tenant', DOC_A, { has_object: 0 });
  w.r2.delete('intake/demo-tenant/' + DOC_A + '.pdf');
  const r2 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_A, 'sess-a'), env: w.env });
  assert.equal(r2.status, 404);
  assert.equal((await r2.json()).error, 'missing-object');
  seedDoc(w, 'demo-tenant', DOC_B, { has_object: 1, r2_key: 'intake/demo-tenant/elsewhere.pdf' });
  const r3 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_B, 'sess-a'), env: w.env });
  assert.equal(r3.status, 404);
  w.r2.delete('intake/demo-tenant/' + DOC_A + '.pdf');
  seedDoc(w, 'demo-tenant', DOC_A, { has_object: 1 });
  w.r2.delete('intake/demo-tenant/' + DOC_A + '.pdf');
  const r4 = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=' + DOC_A, 'sess-a'), env: w.env });
  assert.equal(r4.status, 404);
});

await check('storage-unavailable and bad inputs are explicit', async () => {
  const w = makeWorld();
  seedDoc(w, 'demo-tenant', DOC_A);
  const noMedia = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant', 'sess-a'), env: { DB: w.env.DB, AUTH_SECRET: 'x' } });
  assert.equal(noMedia.status, 503);
  assert.equal((await noMedia.json()).error, 'storage-unavailable');
  const badDoc = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&docId=zzz', 'sess-a'), env: w.env });
  assert.equal(badDoc.status, 400);
  const badCur = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&cursor=bogus', 'sess-a'), env: w.env });
  assert.equal(badCur.status, 400);
  assert.equal((await badCur.json()).error, 'bad-cursor');
});

await check('pagination is bounded, deterministic and lossless', async () => {
  const w = makeWorld();
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const hex = ('' + i).padStart(64, String.fromCharCode(97 + (i % 6)));
    ids.push(hex);
    seedDoc(w, 'demo-tenant', hex, { created_ts: 1788000000000 + (i < 3 ? 0 : i), size: 1000 + i });
  }
  const huge = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&limit=999', 'sess-a'), env: w.env });
  assert.equal((await huge.json()).docs.length, 5);
  const seen = [];
  let cursor = null;
  for (let page = 0; page < 4; page++) {
    const r = await route.onRequestGet({ ...get('https://t/api/ai/intake-archive?merchant=demo-tenant&limit=2' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), 'sess-a'), env: w.env });
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
