#!/usr/bin/env node
/* Économat : la file hors ligne face à une vraie mise à niveau d'IndexedDB (r21 economat#A2).
 *
 * Dans un vrai navigateur : une demande dont la réponse est illisible (incertaine) attend dans la file ;
 * une version plus récente de l'application (un autre onglet) ouvre la même base en version 2 ; la file
 * ne doit pas la bloquer ; après rechargement, la demande est toujours là et repart avec la MÊME clé de
 * commande, une seule fois confirmée. Prouve : la vraie base IndexedDB de Chromium, un vrai rechargement.
 * Ne prouve pas : la mise en veille du système. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const posts = [];
let answer = 'lost';
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/probe.html') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end('<!doctype html><meta charset="utf-8"><title>probe</title><body>probe</body>'); return; }
  if (u.pathname === '/api/inventory/internal-requests' && rq.method === 'POST') {
    let raw = '';
    rq.on('data', (c) => { raw += c; });
    rq.on('end', () => {
      posts.push(JSON.parse(raw || '{}'));
      if (answer === 'lost') { rs.writeHead(200, { 'Content-Type': 'text/plain' }); rs.end('<<unreadable>>'); return; }
      rs.writeHead(200, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify({ ok: true, request: { revision: 1 } }));
    });
    return;
  }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('economat-storage-upgrade', { browser });

await tests.run('uncertain-request-survives-db-upgrade-and-reload', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setBypassServiceWorker(true);
  await page.goto(base + '/probe.html', { waitUntil: 'load' });
  const body = { action: 'create', id: 'up-1', unitId: 'rooftop', idempotencyKey: 'ui:up-1:create', lines: [{ itemId: 'cola', unit: 'bouteille', qtyRequested: 2 }] };

  t.step('queue a request whose answer is unreadable');
  const first = await page.evaluate(async (b) => {
    const api = await import('/assets/hotel-economat-api.js');
    await api.enqueueRequest(b, 'hotel-up');
    await api.replay('hotel-up', true);
    const rows = await api.snapshot('hotel-up');
    return rows.map((r) => ({ state: r.state, error: r.error, key: r.body.idempotencyKey }));
  }, body);
  assert.deepEqual(first.map((r) => r.state), ['pending'], 'an unreadable 2xx stays queued');
  assert.equal(first[0].error, 'invalid-response');

  t.step('a newer build upgrades the same database while this tab still holds its connection');
  const upgrade = await page.evaluate(() => new Promise((resolve) => {
    const timer = setTimeout(() => resolve('blocked'), 3000);
    const r = indexedDB.open('kiwi-economat-outbox', 2);
    r.onupgradeneeded = () => { /* stores are kept */ };
    r.onsuccess = () => { clearTimeout(timer); r.result.close(); resolve('upgraded'); };
    r.onerror = () => { clearTimeout(timer); resolve('error'); };
  }));
  assert.equal(upgrade, 'upgraded', 'the outbox lets go of its connection instead of blocking the upgrade');

  t.step('reload: the same request is still owed, and goes out once under the same key');
  answer = 'ok';
  await page.reload({ waitUntil: 'load' });
  const after = await page.evaluate(async () => {
    const api = await import('/assets/hotel-economat-api.js');
    const before = (await api.snapshot('hotel-up')).map((r) => ({ state: r.state, key: r.body.idempotencyKey }));
    await api.replay('hotel-up', true);
    const rows = (await api.snapshot('hotel-up')).map((r) => ({ state: r.state, key: r.body.idempotencyKey }));
    return { before, rows };
  });
  assert.deepEqual(after.before, [{ state: 'pending', key: 'ui:up-1:create' }], 'the upgraded database still holds the request');
  assert.deepEqual(after.rows, [{ state: 'sent', key: 'ui:up-1:create' }]);
  const creates = posts.filter((p) => p.action === 'create');
  assert.ok(creates.length >= 2, 'the lost answer was retried (' + creates.length + ' creates)');
  assert.equal(new Set(creates.map((p) => p.idempotencyKey)).size, 1, 'with the same command key');
  assert.equal(posts.filter((p) => p.action === 'submit').length, 1, 'and submitted once');
});

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await tests.finish();
