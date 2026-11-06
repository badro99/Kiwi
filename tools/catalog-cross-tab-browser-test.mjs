/* Catalogue boutique · récupération dans un vrai navigateur : l'écriture locale
 * échoue, un autre onglet modifie le catalogue, et le marchand récupère sans
 * boîte bloquante. Chromium charge le vrai catalogue ; localStorage refuse
 * l'écriture ; un événement « storage » arrive ; aucune boîte de dialogue ne
 * s'ouvre, les modifications restent, le toast de marque porte un bouton
 * « Synchroniser » qu'on clique avec un vrai pointeur, et ce clic seul lance
 * la synchronisation vers le serveur. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const require = createRequire(new URL('../app/package.json', import.meta.url));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.error('Chromium unavailable'); process.exit(3); }
const read = (f) => fs.readFileSync(f, 'utf8');
const requests = [];
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) { requests.push(url.pathname); res.writeHead(503, { 'content-type': 'application/json' }); res.end('{}'); return; }
  const file = path.join(process.cwd(), url.pathname === '/blank.html' ? 'tools/fixtures/blank.html' : url.pathname.slice(1));
  if (url.pathname === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html lang="fr"><body><div id="toasts"></div></body></html>'); return; }
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': /\.m?js$/.test(file) ? 'text/javascript' : 'text/plain' }); res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
/* Le vrai écouteur du tableau de bord, extrait de assets/pages-pro-boutique.js. */
const pro = read('assets/pages-pro-boutique.js');
const handlerAt = pro.indexOf("window.addEventListener('kiwi:catalog-conflict'");
const handler = pro.slice(handlerAt, pro.indexOf('\n});\n', handlerAt) + 5);
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const S = suite('catalog-cross-tab', { browser });
await S.run('failed local write then a cross-tab update', async (t) => {
  const context = await browser.createBrowserContext(); t.defer(() => context.close());
  const page = t.watch(await context.newPage());
  let dialogs = 0; page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
  await page.goto(base + '/blank.html');
  await page.evaluate(() => {
    window.KiwiEnv = { isReal: () => true };
    window.toast = (msg, o) => { const b = document.createElement('div'); b.id = 'toast'; b.textContent = msg; if (o && o.action) { const a = document.createElement('button'); a.id = 'toast-action'; a.textContent = o.action.label; a.style.cssText = 'min-width:120px;min-height:44px'; a.onclick = o.action.onClick; b.appendChild(a); } document.getElementById('toasts').appendChild(b); };
  });
  for (const f of ['color-palette', 'boutique-catalog-parts', 'boutique-catalog']) await page.addScriptTag({ url: `${base}/assets/${f}.js` });
  await page.addScriptTag({ content: handler });
  await page.evaluate(() => {
    const K = window.KiwiBoutiqueCatalog; K.use('conflict-b');
    Storage.prototype.setItem = function () { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); };
    window.__p = K.addProduct({ name: 'Article local', priceMAD: 100 });
    window.dispatchEvent(new StorageEvent('storage', { key: K._key, newValue: JSON.stringify({ products: [], variants: [], categories: [] }) }));
  });
  await page.waitForSelector('#toast-action');
  assert.equal(dialogs, 0, 'no blocking dialog');
  const kept = await page.evaluate(() => window.KiwiBoutiqueCatalog.listProducts().some((p) => p.id === window.__p.id));
  assert.ok(kept, 'local edits are still there');
  await new Promise((r) => setTimeout(r, 400));
  const before = requests.length;
  await page.click('#toast-action');
  await new Promise((r) => setTimeout(r, 600));
  assert.ok(requests.length > before, 'the button starts the synchronisation (a request reaches the server)');
  assert.equal(dialogs, 0);
});
await browser.close();
server.close();
await S.finish();
