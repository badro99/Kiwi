#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * order-basic-test · the basic page (design 2027 §4.1, stage 3c).
 *
 * A guest browser below the guest minimum is sent by OrderPro's skin check to
 * /order/basic (functions/order/basic.js): the public menu as a plain list,
 * its prices, and `ordering.basic`. Run against the real GET /api/menu on an
 * in-memory SQLite built from schema.sql, and the real middleware.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const basic = await import(pathToFileURL(path.join(ROOT, 'functions/order/basic.js')).href);
const middleware = await import(pathToFileURL(path.join(ROOT, 'functions/_middleware.js')).href);
let pass = 0, fail = 0;
const ok = (yes, msg) => { if (yes) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

console.log('■ the strings are the bundle’s');
const world = {};
for (const l of ['en', 'fr', 'ar']) vm.runInNewContext(read(`assets/kit/strings/ordering.${l}.js`), { self: world, globalThis: world });
for (const l of ['en', 'fr', 'ar']) {
  ok(basic.STR[l].basic === world.__kiwiStrings['ordering.' + l]['ordering.basic'], `ordering.basic in ${l} is the strings bundle’s, word for word`);
}

console.log('■ the page, on the real menu');
const sql = new DatabaseSync(':memory:');
for (const stmt of read('schema.sql').replace(/--[^\n]*/g, '').split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
const DB = {
  prepare(query) {
    let args = [];
    const st = {
      bind(...a) { args = a.map((v) => (v === undefined ? null : v)); return st; },
      first() { const r = sql.prepare(query).get(...args); return r === undefined ? null : r; },
      all() { return { results: sql.prepare(query).all(...args) }; },
      run() { const r = sql.prepare(query).run(...args); return { success: true, meta: { changes: r.changes } }; },
    };
    return st;
  },
};
const env = { DB, AUTH_SECRET: 'order-basic-secret' };
const menu = {
  cats: [{ id: 'plats', name: 'Plats' }, { id: 'boissons', name: 'Boissons' }],
  items: [
    { id: 'tajine', catId: 'plats', name: 'Tajine <b>kefta</b>', desc: 'Boulettes, œuf', price: 65 },
    { id: 'cafe', catId: 'boissons', name: 'Café crème', desc: '', price: 14.5 },
    { id: 'gone', catId: 'boissons', name: 'Jus du jour', desc: '', price: 18, avail: false },
  ],
};
sql.prepare('INSERT INTO menus (merchant, name, type, data, updated_ts) VALUES (?, ?, ?, ?, ?)')
  .run('basic-cafe', 'Café <Nord>', 'restaurant', JSON.stringify(menu), Date.now());

async function get(query, lang) {
  const res = await basic.onRequestGet({ request: new Request('https://kiwi-os.com/order/basic' + query, { headers: { 'Accept-Language': lang } }), env });
  return { status: res.status, type: res.headers.get('Content-Type') || '', html: await res.text() };
}
let r = await get('?s=basic-cafe&t=4', 'fr-FR,fr;q=0.9');
ok(r.status === 200 && /text\/html/.test(r.type), 'it answers HTML');
ok(!/<script/i.test(r.html), 'with no script at all');
ok(r.html.includes('Ce navigateur ne permet pas de commander ici.'), 'it says ordering.basic, in French for a French browser');
ok(r.html.includes('<h1>Café &lt;Nord&gt;</h1>') && r.html.includes('Tajine &lt;b&gt;kefta&lt;/b&gt;') && !r.html.includes('<b>kefta</b>'), 'the store’s and the dish’s names are escaped');
ok(/<bdi dir="ltr">14,50<\/bdi> MAD/.test(r.html) && /<bdi dir="ltr">65<\/bdi> MAD/.test(r.html), 'prices read as the app writes them (14,50 MAD, 65 MAD)');
ok(!r.html.includes('Jus du jour'), 'an unavailable dish is left out');
ok(r.html.indexOf('<h2>Plats</h2>') < r.html.indexOf('<h2>Boissons</h2>') && r.html.includes('Table 4'), 'by category, in the menu’s order, with the table');
r = await get('?s=basic-cafe', 'ar-MA,ar;q=0.9,fr;q=0.5');
ok(/<html lang="ar" dir="rtl">/.test(r.html) && r.html.includes('اعرض هذه القائمة على الموظفين للطلب') && /<bdi dir="ltr">14,50<\/bdi> درهم/.test(r.html), 'in Arabic, right to left, numbers kept left to right');
r = await get('?s=basic-cafe', 'en-GB,en;q=0.9');
ok(/<bdi dir="ltr">14\.50<\/bdi> MAD/.test(r.html) && r.html.includes('This browser can&#39;t place orders here.'), 'in English, with a decimal point');
r = await get('?s=nobody', 'fr');
ok(r.status === 200 && r.html.includes('Cette carte n&#39;est pas encore publiée.'), 'a store with no menu says so, it does not fail');

console.log('■ the route is public');
const mw = await middleware.onRequest({
  request: new Request('https://kiwi-os.com/order/basic?s=basic-cafe', { headers: { 'CF-Connecting-IP': '10.5.5.5' } }),
  env: { AUTH_SECRET: 'order-basic-secret' },
  next: async () => new Response('page', { status: 200 }),
});
ok(mw.status === 200 && (await mw.text()) === 'page', 'the middleware lets a guest with no account through');

console.log('■ OrderPro sends an old browser there, and only with the skin on');
const page = read('OrderPro.html');
const head = page.match(/<script>\s*\(function \(d, q\) \{[\s\S]*?<\/script>/);
ok(!!head && page.indexOf(head[0]) < page.indexOf('<title>'), 'the check is in the head');
function boot({ search = '', stored = null, supports = true, mark = null } = {}) {
  const went = [], wrote = [], attrs = {};
  const ctx = {
    location: { search, replace: (u) => went.push(u) },
    localStorage: { getItem: (k) => (k === 'kiwiSkin2027:ordering' ? stored : null) },
    CSS: { supports: () => supports },
    document: { documentElement: { getAttribute: (k) => (k === 'data-store-skin' ? mark : null), setAttribute: (k, v) => { attrs[k] = v; } }, write: (h) => wrote.push(h) },
  };
  ctx.window = ctx;
  vm.runInNewContext(head[0].replace(/^<script>|<\/script>$/g, ''), ctx);
  return { went, wrote: wrote.join(''), attrs };
}
let b = boot({ search: '?s=x&t=2' });
ok(!b.went.length && !b.wrote && !Object.keys(b.attrs).length, 'flag off: nothing happens, even in an old browser');
b = boot({ search: '?s=x&t=2', supports: false });
ok(!b.went.length, 'flag off, old browser: the shipped page, as today');
b = boot({ search: '?s=x&t=2&skin=2027', supports: false });
ok(b.went.join() === '/order/basic?s=x&t=2&skin=2027', 'flag on, below the guest minimum: the basic page, same store and table');
b = boot({ search: '?s=x', stored: '1' });
ok(b.attrs['data-skin-2027'] === 'ordering' && b.attrs['data-theme'] === 'light'
  && /assets\/kit\/tokens-2027\.css\?v=\d+/.test(b.wrote) && /assets\/kit\/ordering\.css\?v=\d+/.test(b.wrote) && !/<script/.test(b.wrote),
  'flag on: the kit’s tokens and the skin’s sheet, no script');
b = boot({ search: '?s=x&t=2', mark: '2027' });
ok(b.attrs['data-skin-2027'] === 'ordering' && /assets\/kit\/ordering\.css\?v=\d+/.test(b.wrote), 'a store the operator switched on: the skin, with no flag in the browser');
b = boot({ search: '?s=x&t=2', mark: '2027', supports: false });
ok(b.went.join() === '/order/basic?s=x&t=2', 'that store, below the guest minimum: the basic page');

console.log('■ the server marks the page for a store switched on (features.skin2027)');
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)').run('skin-cafe', JSON.stringify({ orderpro: true, skin2027: true }), 'Skin', Date.now());
sql.prepare('INSERT INTO merchant_config (merchant, features, name, updated_ts) VALUES (?, ?, ?, ?)').run('plain-cafe', JSON.stringify({ orderpro: true, skin2027: false }), 'Plain', Date.now());
const PAGE = '<!doctype html>\n<html lang="fr">\n<head></head><body>OrderPro</body></html>';
async function serve(url, { method = 'GET', headers = {} } = {}) {
  const asked = [];
  const res = await middleware.onRequest({
    request: new Request(url, { method, headers: { 'CF-Connecting-IP': '10.5.5.6', ...headers } }),
    env: { DB, AUTH_SECRET: 'order-basic-secret' },
    next: async (req) => {
      asked.push(req || null);
      return new Response(method === 'HEAD' ? null : PAGE, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"page-1"', 'Cache-Control': 'public, max-age=0' } });
    },
  });
  return { res, html: method === 'HEAD' ? '' : await res.text(), asked };
}
let s1 = await serve('https://kiwi-os.com/order?s=skin-cafe&t=4', { headers: { 'If-None-Match': '"page-1"' } });
ok(s1.html.includes('<html data-store-skin="2027" lang="fr">') && s1.html.split('data-store-skin').length === 2, '/order for that store: <html data-store-skin="2027">, once');
ok(s1.asked[0] && new URL(s1.asked[0].url).pathname === '/OrderPro' && new URL(s1.asked[0].url).search === '?s=skin-cafe&t=4', 'still the rewrite to /OrderPro, query untouched');
ok(s1.asked[0] && !s1.asked[0].headers.get('If-None-Match') && !s1.res.headers.get('ETag'), 'a copy cached before the switch cannot come back as a 304 without the mark');
s1 = await serve('https://kiwi-os.com/OrderPro?s=skin-cafe');
ok(s1.html.includes('data-store-skin="2027"'), '/OrderPro for that store: marked too');
for (const [url, why] of [
  ['https://kiwi-os.com/order?s=plain-cafe&t=4', 'a store with skin2027 false'],
  ['https://kiwi-os.com/order?s=nobody', 'a store with no row'],
  ['https://kiwi-os.com/order?s=demo', 'the demo'],
  ['https://kiwi-os.com/order', 'no store'],
]) {
  const r2 = await serve(url, { headers: { 'If-None-Match': '"page-1"' } });
  ok(r2.html === PAGE && r2.asked[0] && r2.asked[0].headers.get('If-None-Match') === '"page-1"', why + ': the page untouched, its cache too');
}
const headReq = await serve('https://kiwi-os.com/order?s=skin-cafe', { method: 'HEAD' });
ok(headReq.res.status === 200 && headReq.res.headers.get('ETag') === '"page-1"', 'a HEAD request is passed through');
const broken = await middleware.onRequest({
  request: new Request('https://kiwi-os.com/order?s=skin-cafe', { headers: { 'CF-Connecting-IP': '10.5.5.7' } }),
  env: { DB: { prepare() { throw new Error('d1 down'); } }, AUTH_SECRET: 'order-basic-secret' },
  next: async () => new Response(PAGE, { status: 200, headers: { 'Content-Type': 'text/html' } }),
});
ok((await broken.text()) === PAGE, 'the database down: the shipped page, never an error');
const admin = read('kiwi-admin.html');
ok(/\{ key:'skin2027', label:'Commande client · design 2027', off:true,/.test(admin), 'kiwi-admin: the operator switch, off unless set (an option, like Coût simple)');

console.log(fail ? `order-basic-test: ${fail} failed, ${pass} passed` : `✓ order-basic-test · ${pass} checks`);
process.exit(fail ? 1 : 0);
