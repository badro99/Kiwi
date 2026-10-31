/* Reference and split run through the public demo dispatcher, with one cash sale. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { suite } from './browser-trace.mjs';
const root = path.resolve(import.meta.dirname, '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('ENV: puppeteer-core unavailable'); process.exit(3); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium'].find(fs.existsSync);
if (!bin) { console.log('ENV: Chromium unavailable'); process.exit(3); }
let reference = true;
/* Comme pos-maison-split-test : la parité avec le fichier d'avant le découpage
   ne vaut que tant que les parties sont celles du découpage. Depuis, la caisse a
   changé exprès (livraisons et Acomptes au rail, 30 oct. 2026) : la vente en
   espèces de la caisse découpée reste prouvée, la comparaison est historique. */
const splitMap = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/pos-maison/split.json'), 'utf8'));
const pristine = Object.entries(splitMap.splitFiles).every(([file, hash]) => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') === hash);
const original = file => gunzipSync(fs.readFileSync(path.join(root, 'tools/fixtures/pos-maison', file))).toString();
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  try {
    const frozen = reference && ({ '/assets/pos-maison.js': 'original.js.gz', '/assets/pos-dispatch.js': 'dispatcher.js.gz' })[url.pathname];
    const data = frozen ? original(frozen) : fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' })[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); }
catch (error) { console.error('ENV: loopback unavailable:', error.code); process.exit(3); }
let browser;
try { browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }); }
catch (error) { server.close(); console.error('ENV:', error.message); process.exit(3); }
const S = suite('pos-maison-split', { browser });
try {
  await S.run('demo-sale-reference-parity', async t => {
    const capture = async before => {
      reference = before;
      const context = await browser.createBrowserContext();
      try {
        const page = t.watch(await context.newPage());
        await page.setViewport({ width: 1440, height: 1000 });
        await page.setBypassServiceWorker(true);
        await page.evaluateOnNewDocument(() => {
          const NativeDate = Date, now = new NativeDate('2026-10-22T12:00:00Z').getTime();
          window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
          let uuid = 0; Object.defineProperty(crypto, 'randomUUID', { value: () => '00000000-0000-4000-8000-' + String(++uuid).padStart(12, '0') });
          let seed = 12345; Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        });
        t.step(before ? 'Original demo till' : 'Split demo till');
        // coverage: surface=caisse-entry locale=fr viewport=desktop
        await page.goto(`http://127.0.0.1:${server.address().port}/kiwi-caisse.html?demo=1`, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.KiwiPosDispatch && !!window.KiwiPosReprint);
        await page.evaluate(() => {
          const provide = window.KiwiPosReprint.provide;
          window.KiwiPosReprint.provide = function(id, fn) { if (id === 'maison') window.__maisonProvider = fn; return provide.call(this, id, fn); };
          window.KiwiPosDispatch.unlockById('maison');
        });
        await page.waitForSelector('#pos-maison.is-on .mz-view.is-on', { visible: true, timeout: 15000 });
        /* Le sélecteur de langue est greffé par caisse-lang.js juste après le rendu. */
        await page.waitForSelector('#pos-maison .kcl', { timeout: 5000 });
        const initial = await page.$eval('#pos-maison', el => el.innerHTML);
        const existing = await page.evaluate(() => window.__maisonProvider().map(s => s.ref));
        await page.click('[data-mz-item]');
        await page.waitForSelector('#mz-sheet-veil.is-open #mz-sheet-add:not([disabled])');
        await page.click('#mz-sheet-add');
        await page.click('#mz-validate');
        await page.waitForSelector('[data-mz-m="especes"]', { visible: true });
        await page.click('[data-mz-m="especes"]');
        await page.waitForSelector('#mz-cash-ok', { visible: true });
        await page.click('#mz-cash-ok');
        /* Une vente en espèces sans livraison ferme la fenêtre et imprime le reçu :
           il n'y a pas d'écran « C'est encaissé » à attendre. */
        await page.waitForFunction((n) => !document.querySelector('#mz-pay-veil.is-open') && window.__maisonProvider().length === n + 1, { timeout: 15000 }, existing.length);
        const result = await page.evaluate(() => ({ html: document.querySelector('#pos-maison').innerHTML, sales: window.__maisonProvider(), storage: Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])) }));
        assert.equal(result.sales.length, existing.length + 1, 'exactly one completed sale');
        const added = result.sales.filter(s => !existing.includes(s.ref));
        assert.equal(added.length, 1); assert.ok(added[0].total > 0);
        assert.equal(added[0].raw, 'espèces');
        /* Le poste tire un identifiant d'appareil au hasard (« 6U », « KQ »), gardé dans
           kiwi:posDevice et imprimé sur le reçu : seul champ qui change d'un chargement à l'autre, découpé ou non. */
        const devId = (o) => JSON.parse(JSON.stringify(o).replace(/"terminal":"[^"]*"/g, '"terminal":"*"').replace(/"kiwi:posDevice":"[A-Z0-9]{2}"/g, '"kiwi:posDevice":"*"').replace(/\\"terminal\\":\\"[^\\"]*\\"/g, '\\"terminal\\":\\"*\\"'));
        /* Le fichier d'origine dessinait l'icône d'un produit au trait ; depuis le
           28 octobre 2026 la caisse montre une photo (retail-photos.js). Ce test
           prouve le découpage, pas l'image : les deux valent « une image produit ». */
        const art = (h) => h.replace(/<svg class="mz-art"[\s\S]*?<\/svg>|<img class="mz-(?:art|product)-photo"[^>]*>/g, '<art/>');
        return devId({ initial: art(initial), ...result, html: art(result.html) });
      } finally { await context.close(); }
    };
    const after = await capture(false);
    if (pristine) assert.deepEqual(after, await capture(true), 'rendered till, cash receipt, sales and storage match original');
    else console.log('  · parts changed since the split: live cash sale proven, original parity is historical (as pos-maison-split-test)');
  });
} finally { await browser.close(); server.close(); }
await S.finish();
