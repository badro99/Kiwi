#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * guest-redirect-test · stage 3c: one guest-ordering app.
 *
 * A table QR printed before stage 3c reads /kiwi-order.html?merchant=<slug>
 * &table=N. It must open OrderPro (/order, the NFC short link) with the same
 * store and table, through the server (functions/_middleware.js, a 302) and,
 * where no middleware runs, through the page itself. Without ?merchant the
 * page is the local pitch demo and stays. New QR codes (assets/order-qr.js)
 * print the /order link directly.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const middleware = await import(path.join(ROOT, 'functions/_middleware.js'));
let pass = 0, fail = 0;
const ok = (yes, msg) => { if (yes) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };

const BASE = 'https://kiwi-os.com';
async function run(method, p) {
  let nexted = null;
  const res = await middleware.onRequest({
    request: new Request(BASE + p, { method, headers: { 'CF-Connecting-IP': '10.4.4.4' } }),
    env: { AUTH_SECRET: 'guest-redirect-secret' },
    next: async (req) => { nexted = req ? new URL(req.url) : true; return new Response('page', { status: 200 }); },
  });
  return { status: res.status, location: res.headers.get('Location') || '', nexted };
}

console.log('■ the server');
let r = await run('GET', '/kiwi-order.html?merchant=cafe-nord&table=7');
ok(r.status === 302 && r.location === '/order?s=cafe-nord&t=7' && !r.nexted, `a printed table QR is sent to /order with its store and table (${r.status} ${r.location})`);
r = await run('GET', '/kiwi-order?merchant=cafe-nord');
ok(r.status === 302 && r.location === '/order?s=cafe-nord', `the clean URL, a venue QR without a table (${r.location})`);
r = await run('HEAD', '/kiwi-order.html?merchant=cafe-nord&table=12b');
ok(r.status === 302 && r.location === '/order?s=cafe-nord&t=12', `HEAD too, and the table keeps only its digits (${r.location})`);
r = await run('GET', '/kiwi-order.html?merchant=' + encodeURIComponent('café & co'));
ok(r.status === 302 && new URL(r.location, BASE).searchParams.get('s') === 'café & co', 'a slug with reserved characters arrives intact');
r = await run('GET', '/kiwi-order.html');
ok(r.status === 200 && r.nexted, 'without ?merchant the pitch demo is served, not redirected');
r = await run('GET', '/kiwi-order.html?table=4');
ok(r.status === 200 && r.nexted, 'the demo with a table stays too');
r = await run('POST', '/kiwi-order.html?merchant=cafe-nord');
ok(r.status !== 302, 'only reads are redirected');
r = await run('GET', '/order?s=cafe-nord&t=7');
ok(r.status === 200 && r.nexted && r.nexted.pathname === '/OrderPro' && r.nexted.search === '?s=cafe-nord&t=7', 'and /order opens OrderPro with the query untouched');

console.log('■ the page, where no middleware runs');
const html = fs.readFileSync(path.join(ROOT, 'kiwi-order.html'), 'utf8');
const first = html.match(/<script>([\s\S]*?)<\/script>/);
ok(first && html.indexOf(first[0]) < html.indexOf('<meta name="viewport"'), 'the redirect is the first script of the head');
function page(search) {
  const went = [];
  vm.runInNewContext(first[1], { URLSearchParams, location: { search, replace: (u) => went.push(u) } });
  return went;
}
ok(JSON.stringify(page('?merchant=cafe-nord&table=7')) === JSON.stringify(['OrderPro.html?s=cafe-nord&t=7']), 'a real store goes to OrderPro.html with its store and table');
ok(page('?table=3').length === 0 && page('').length === 0, 'the demo stays');

console.log('■ new QR codes');
const qr = fs.readFileSync(path.join(ROOT, 'assets/order-qr.js'), 'utf8');
ok(/let u = origin \+ '\/order\?s=' \+ encodeURIComponent\(biz\(\)\.slug\);\s*if \(table\) u \+= '&t=' \+ encodeURIComponent\(table\);/.test(qr), 'a real store prints /order?s=<slug>&t=N');
ok(/if \(!isReal\(\)\) return origin \+ '\/kiwi-order\.html'/.test(qr), 'the local demo still prints the demo page');

console.log(fail ? `guest-redirect-test: ${fail} failed, ${pass} passed` : `✓ guest-redirect-test · ${pass} checks`);
process.exit(fail ? 1 : 0);
