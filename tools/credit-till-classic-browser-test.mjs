#!/usr/bin/env node
/* Garde : sur la caisse CLASSIQUE (kiwi-caisse.html sans la peau 2027, qui ne
 * charge pas le kit), une vente à crédit au-delà du plafond ouvre quand même le
 * pavé du kit (<k-pin-pad> dans <k-sheet>, chargés à la demande par
 * assets/credit-book/till-credit.js), et l'accord d'un responsable passe :
 * les touches du pavé, cliquées pour de vrai, envoient le code à
 * /api/credit/till et nulle part ailleurs. Le serveur est simulé : aucun vrai
 * code, aucune vraie boutique. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

/* L'adresse du module telle que la caisse l'importe (estampille comprise). */
const maison = fs.readFileSync(path.join(root, 'assets/pos-maison/checkout.js'), 'utf8');
const moduleUrl = '/assets/credit-book/' + maison.match(/till-credit\.js\?v=\d+/)[0];

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + (pathname === '/' ? '/kiwi-caisse.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('credit-till-classic', { browser });
const check = (ok, msg) => { if (!ok) throw new Error(msg); console.log('  ✓ ' + msg); };

await S.run('caisse classique : plafond dépassé, pavé du kit chargé à la demande, accord du responsable', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1024, height: 768 });
  const posted = [];
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== '127.0.0.1') return r.abort();
    if (!u.pathname.startsWith('/api/')) return r.continue();
    const body = r.postData() ? JSON.parse(r.postData()) : null;
    if (body) posted.push({ path: u.pathname, body });
    const reply = (status, json) => r.respond({ status, contentType: 'application/json', body: JSON.stringify(json) });
    if (u.pathname !== '/api/credit/till') return reply(503, { error: 'offline-fixture' });
    if (r.method() === 'GET') return reply(200, { ok: true, limits: { 'carnet:k-fixture': 10000 } });
    if (body.action === 'check') return reply(200, { ok: true, limited: true, over: true, afterCents: 15000, limitCents: 10000, approved: false });
    return reply(200, { ok: true, limited: true, over: true, afterCents: 15000, limitCents: 10000, approved: true, approvedBy: { name: 'TEST KIWI Manager', role: 'Manager' } });
  });
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  const before = await page.evaluate(() => ({ skin: document.documentElement.getAttribute('data-skin-2027'), pad: !!customElements.get('k-pin-pad'), sheet: !!customElements.get('k-sheet') }));
  check(!before.skin && !before.pad && !before.sheet, `la caisse classique ne charge pas le kit (${JSON.stringify(before)})`);
  await page.evaluate((url) => {
    localStorage.setItem('kiwiPairedVenue', JSON.stringify({ merchant: 'till-fixture' }));
    window.__gate = import(url).then((C) => C.creditGate({ merchant: 'till-fixture', source: 'carnet', customer: 'k-fixture', name: 'TEST KIWI', amountCents: 5000 }));
  }, moduleUrl);
  await page.waitForFunction(() => !!document.querySelector('k-sheet k-pin-pad') && !!customElements.get('k-pin-pad')
    && !!document.querySelector('k-pin-pad').shadowRoot?.querySelector('[data-key="5"]'), { timeout: 15000 });
  const box = await page.evaluate(() => { const r = document.querySelector('k-pin-pad').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  check(box.w > 150 && box.h > 150, `le pavé est peint (${box.w} × ${box.h})`);
  const code = String(1000 + Math.floor(Math.random() * 9000));
  for (const d of code) {
    const key = await page.evaluateHandle((digit) => document.querySelector('k-pin-pad').shadowRoot.querySelector(`[data-key="${digit}"]`), d);
    await key.click();
  }
  const out = await page.evaluate(() => window.__gate);
  check(out && out.ok === true, `l'accord du responsable laisse passer la vente (${JSON.stringify(out)})`);
  const carriers = posted.filter((p) => JSON.stringify(p.body).includes(code));
  check(carriers.length === 1 && carriers[0].path === '/api/credit/till' && carriers[0].body.action === 'approve', 'le code ne part qu’à /api/credit/till');
  const gone = await page.evaluate(() => !document.querySelector('k-sheet'));
  check(gone, 'le pavé se ferme une fois l’accord donné');
});

await browser.close();
server.close();
S.finish();
