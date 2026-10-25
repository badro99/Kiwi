// Fast-tier contracts for _routes.json, functions/_middleware.js and hot pollers.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const ts = require('../app/node_modules/typescript');
const root = resolve(import.meta.dirname, '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const routes = JSON.parse(read('_routes.json'));
assert.equal(routes.version, 1);
assert.deepEqual(routes.include, ['/*']);
assert.deepEqual(routes.exclude, ['/assets/*', '/_next/*', '/images/*', '/model/*', '/draco/*',
  '/icon.svg', '/favicon.ico', '/apple-icon.png', '/kiwi-sw.js', '/dashboard.webmanifest',
  '/manifest.webmanifest', '/cuisine.webmanifest', '/serveur.webmanifest', '/robots.txt',
  '/sitemap.xml', '/downloads/kiwi-print-bridge.apk']);
assert(routes.include.length + routes.exclude.length <= 100);
const matches = (rule, path) => new RegExp('^' + rule.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$').test(path);
const excluded = path => routes.exclude.some(rule => matches(rule, path));
for (const path of ['/assets/app.js', '/assets/fonts/font.woff2', '/assets/icons/icon.svg', '/_next/static/app.js', '/kiwi-sw.js']) assert(excluded(path), path);
for (const path of ['/', '/fr/', '/fr/index.html', '/dashboard', '/dashboard.html', '/kiwi-caisse', '/kiwi-caisse.html', '/kiwi-cuisine', '/kiwi-serveur', '/order', '/OrderPro', '/app/private', '/__unlock', '/__operator', '/auth/login', '/api/feed', '/api/config', '/api/store', '/api/me', '/api/print/jobs', '/api/sale']) assert(!excluded(path), path);
for (const rule of routes.exclude) assert(rule.length <= 100);
for (const header of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Referrer-Policy: strict-origin-when-cross-origin', 'Strict-Transport-Security: max-age=31536000; includeSubDomains']) assert(read('_headers').includes(header));
console.log('✓ static exclusions, HTML/API inclusion and response headers');

// Follow actual named calls and import aliases from GET handlers, not whole
// modules: employee POST login legitimately shares a module with its GET poll.
const modules = new Map();
function moduleOf(file) {
  file = resolve(file);
  if (modules.has(file)) return modules.get(file);
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const mod = { file, source, functions: new Map(), imports: new Map() };
  modules.set(file, mod);
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith('.')) {
      const target = resolve(dirname(file), node.moduleSpecifier.text);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) mod.imports.set(item.name.text, [target, (item.propertyName || item.name).text]);
    }
    if (ts.isFunctionDeclaration(node) && node.name) mod.functions.set(node.name.text, node);
    if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) if (decl.initializer && ts.isIdentifier(decl.name)) mod.functions.set(decl.name.text, decl.initializer);
  }
  return mod;
}
function walk(file, name, seen = new Set(), trail = []) {
  const id = file + ':' + name;
  if (seen.has(id)) return;
  seen.add(id);
  const mod = moduleOf(file);
  const node = mod.functions.get(name);
  if (!node) {
    const imported = mod.imports.get(name);
    if (imported) walk(...imported, seen, trail);
    return;
  }
  if (ts.isIdentifier(node)) { walk(file, node.text, seen, trail); return; }
  const next = [...trail, name];
  assert(!['pbkdf2', 'hashPassword', 'verifyPassword'].includes(name), next.join(' → '));
  function visit(child) {
    if (ts.isCallExpression(child)) {
      const expr = child.expression;
      assert(!(ts.isPropertyAccessExpression(expr) && ['deriveBits', 'deriveKey'].includes(expr.name.text)), next.join(' → '));
      if (ts.isIdentifier(expr)) walk(file, expr.text, seen, next);
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
}
const pollers = ['feed.js', 'config.js', 'store.js', 'me.js', 'print/jobs.js', 'employee.js', 'order/queue.js', 'team/live.js', 'service/events.js', 'operations.js', 'menu.js', 'inventory/movements.js', 'cash-sessions.js', 'sales-summary.js'];
for (const route of pollers) {
  const file = resolve(root, 'functions/api', route);
  assert(existsSync(file), route);
  assert(moduleOf(file).functions.has('onRequestGet'), route);
  walk(file, 'onRequestGet');
}
// Prove the graph guard catches an indirect credential call.
const fake = resolve(root, 'functions/api/cpu-fixture.js');
modules.set(fake, { ...moduleOf(resolve(root, 'functions/api/feed.js')), functions: new Map([
  ['onRequestGet', ts.createSourceFile(fake, 'function onRequestGet(){ helper(); }', ts.ScriptTarget.Latest, true).statements[0]],
  ['helper', ts.createSourceFile(fake, 'function helper(){ verifyPassword(); }', ts.ScriptTarget.Latest, true).statements[0]],
  ['verifyPassword', ts.createSourceFile(fake, 'function verifyPassword(){}', ts.ScriptTarget.Latest, true).statements[0]],
]) });
assert.throws(() => walk(fake, 'onRequestGet'), /verifyPassword/);
console.log('✓ polling GET call graphs exclude PBKDF2, including indirect calls');

// Cache concurrent imports, rotate secrets and verify real HMAC compatibility.
let imports = 0;
const subtle = new Proxy(webcrypto.subtle, { get(target, key) {
  if (key === 'deriveBits' || key === 'deriveKey') return () => { throw new Error('polling-pbkdf2'); };
  if (key === 'importKey') return (...args) => { imports++; return target.importKey(...args); };
  const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
} });
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle, getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
const { hmacKey } = await import('../functions/auth/_crypto.js');
const secret = webcrypto.randomUUID();
const keys = await Promise.all(Array.from({ length: 20 }, () => hmacKey(secret)));
assert(keys.every(key => key === keys[0]));
assert.equal(imports, 1);
const message = new TextEncoder().encode('cpu-test');
const signature = await subtle.sign('HMAC', keys[0], message);
assert(await subtle.verify('HMAC', await hmacKey(secret), signature, message));
assert.notEqual(await hmacKey(webcrypto.randomUUID()), keys[0]);
console.log('✓ HMAC single-flight cache and secret rotation');

// Exercise the middleware's GET branches too: its POST unlock/operator branches
// intentionally verify credentials, so a whole-function call graph is too broad.
const { onRequest } = await import('../functions/_middleware.js');
const { makeSession } = await import('../functions/auth/_lib.js');
const token = await makeSession('cpu-synthetic-account', secret);
let derivations = 0;
// Count even if production deliberately catches a crypto failure.
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { subtle: new Proxy(subtle, {
  get(target, key) { if (key === 'deriveBits' || key === 'deriveKey') return () => { derivations++; throw new Error('polling-pbkdf2'); }; return target[key]; }
}) } });
const DB = { prepare() { return { bind() { return this; }, async first() { return null; }, async all() { return { results: [] }; }, async run() { return { meta: { changes: 0 } }; } }; } };
for (const route of pollers) for (const cookie of ['', 'kiwi_sess=' + token]) {
  await onRequest({ request: new Request('https://kiwi-os.com/api/' + route.replace(/\.js$/, '') + '?merchant=cpu-synthetic', { headers: { Cookie: cookie } }), env: { DB, AUTH_SECRET: secret }, next: async () => new Response('{}') });
}
assert.equal(derivations, 0);
console.log('✓ middleware anonymous/revoked-session polling branches never derive passwords');
const { DateTimeFormat } = await import('../functions/api/_cached-clock.js');
const options = { timeZone: 'Africa/Casablanca', hour: '2-digit', hourCycle: 'h23' };
assert.equal(new DateTimeFormat('en-GB', options), new DateTimeFormat('en-GB', { ...options }));
assert.equal(new DateTimeFormat('en-GB', options).format(1790856000000), '12');
console.log('✓ shared Intl formatter cache preserves zone-law correction');

// SQLite plans use the new ranges even with no matching jobs/refunds. No live DB.
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec(read('schema.sql'));
for (const [sql, index, values] of [
  ['SELECT 1 FROM print_jobs WHERE merchant = ? AND created_ts > ? LIMIT 1', 'idx_print_jobs_recent', ['synthetic', 0]],
  ["UPDATE print_jobs SET status='expired' WHERE merchant=? AND status='queued' AND expires_ts <= ?", 'idx_print_jobs_expiry', ['synthetic', 0]],
  ["UPDATE print_jobs SET status='uncertain' WHERE merchant=? AND status='claimed' AND claimed_ts <= ?", 'idx_print_jobs_claimed', ['synthetic', 0]],
  ["SELECT id FROM sales WHERE merchant IN (?, ?) AND void_ts IS NULL AND COALESCE(amount_cents, amount * 100) < 0", 'idx_sales_linked_refunds', ['synthetic', 'synthetic']],
  ["SELECT sale_id FROM sale_audit WHERE merchant=? AND action='refund' AND note=?", 'idx_sale_audit_refund_note', ['synthetic', 'synthetic']],
]) {
  const plan = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...values).map(row => row.detail).join(' ');
  assert(plan.includes(index), plan);
}
db.close();
console.log('✓ schema.sql / migrations/0016_cpu_polling_indexes.sql: five bounded query plans');
