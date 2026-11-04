// Shopify panel transport: every request is bounded, and a server detail or an
// unknown code never reaches the merchant raw (gaps r14 #153 and #154).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'assets/channel-link.js');
const src = fs.readFileSync(FILE, 'utf8');
let passed = 0, failed = 0;
const ok = (cond, label) => { if (cond) { passed++; console.log('  ✓ ' + label); } else { failed++; console.log('  ✗ ' + label); } };

console.log('■ channel-link · bounded requests, no raw server text');
ok(!/(^|[^A-Za-z.])fetch\(/m.test(src), 'no unbounded fetch( left in the panel');

const start = src.indexOf('  var SHOP = {');
const end = src.indexOf('  function shopApi(');
const shopApiEnd = src.indexOf('\n  }\n', end) + 4;
const block = src.slice(start, src.indexOf('  function toast(')) + src.slice(src.indexOf('  function shopStr()'), shopApiEnd);

function load(lang) {
  const ctx = vm.createContext({ LANG: () => lang, JSON, Object, String, Error });
  new vm.Script(block + '\nthis.shopError = shopError; this.shopApi = shopApi; this.SHOP = SHOP;',
    { filename: FILE, importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER }).runInContext(ctx);
  return ctx;
}

const realFetch = globalThis.fetch, realTimeout = globalThis.setTimeout;
try {
  for (const lang of ['fr', 'en', 'ar']) {
    const c = load(lang), s = c.SHOP[lang];
    // A Shopify call that never answers: the deadline fires instead of hanging the panel.
    globalThis.fetch = () => new Promise(() => {});
    globalThis.setTimeout = (fn) => realTimeout(fn, 0);
    let err = null;
    try { await c.shopApi('status'); } catch (e) { err = e; }
    globalThis.setTimeout = realTimeout;
    ok(err && err.message === 'request-timeout', lang + ': a silent network ends in request-timeout');
    ok(c.shopError(err && err.message) === s.timeout && !!s.timeout, lang + ': and the merchant reads the timeout sentence');

    // An HTTP error carrying a code and a French detail: the code wins, the detail never shows.
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'no-linked-variants', detail: 'Aucune variante liée côté serveur' }) });
    err = null;
    try { await c.shopApi('activate'); } catch (e) { err = e; }
    ok(err && err.message === 'no-linked-variants', lang + ': the error code travels, not the server detail');
    ok(c.shopError(err.message) === s.noLinks, lang + ': known codes map to their sentence');
    ok(c.shopError('Stock Shopify à synchroniser') === s.error, lang + ': unknown or French server text becomes the generic sentence');
    ok(c.shopError(s.invalid) === s.invalid, lang + ': a sentence already translated passes as is');
  }
} finally {
  globalThis.fetch = realFetch; globalThis.setTimeout = realTimeout;
}

console.log(failed ? `\n✗ ${failed} failed` : `\n✓ ${passed} channel-link deadline checks green`);
process.exit(failed ? 1 : 0);
