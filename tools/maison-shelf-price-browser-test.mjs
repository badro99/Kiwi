#!/usr/bin/env node
/* Caisse Maison · le prix en rayon, au dirham inférieur, de la grille au ticket.
 *
 * Décision propriétaire (2026-10-19) : la caisse compte en dirhams entiers et
 * n'encaisse jamais plus que le prix affiché. tools/money-properties-test.mjs
 * le prouve sur les fonctions de prix ; cette suite le vérifie là où la
 * cliente le voit, par de vrais clics : la grille, la fiche variante, la ligne
 * du ticket et le bouton « Encaisser » doivent dire le même chiffre.
 *
 * Trois articles du catalogue de démo, repris au prix qui posait problème :
 *   · un vase à 249,90 : la caisse affichait et encaissait 250 ;
 *   · un service vendu à la pièce à 84,90 : 85 ;
 *   · un service dont le prix à la pièce est resté vide (null, 1 100 / 12) :
 *     la fiche annonçait « 0 MAD » la pièce, le ticket en encaissait 92.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const maisonRev = JSON.parse(fs.readFileSync(path.join(root, 'tools/asset-stamps.json'), 'utf8'))['assets/pos-maison.js'].v;
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* Le même montage que tools/maison-caisse-browser-test.mjs : la vraie caisse
   Maison, ses vraies feuilles et le vrai moteur de promotions, sans serveur. */
const PAGE = `<!doctype html><html><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/assets/tokens.css">
  <link rel="stylesheet" href="/assets/caisse-dna.css">
  <link rel="stylesheet" href="/assets/pos-maison.css">
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0);font-family:Arial,sans-serif}
    button,input{font:inherit} button{border:0} .vx-screen{display:flex} .modal-veil{display:none}.modal-veil.is-open{display:flex}
  </style>
  <script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiPosDispatch={register:s=>window.__maisonSpec=s,lock:()=>{}};</script>
  <script src="/assets/caisse-dna.js"></script>
  <script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
  <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
  <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
  <script src="/assets/boutique-catalog-parts.js"></script><script src="/assets/boutique-catalog.js"></script><script src="/assets/promo-rules.js"></script><script src="/assets/promos.js"></script>
  <script src="/assets/sold-insights.js"></script><script type="module" src="/assets/pos-maison.js?v=${maisonRev}"></script>
</head><body class="is-pos-maison"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-maison"></div>
  <script type="module">import "/assets/pos-maison.js?v=${maisonRev}";window.__maisonSpec.mount(document.getElementById('pos-maison'));</script>
</body></html>`;
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(PAGE); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('maison-shelf-price', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const flat = (s) => String(s).replace(/[  \s]+/g, ' ').trim();
const mad = (s) => +String(s).replace(/[^0-9]/g, '');

try {
  await S.run('prix arrondis vers le bas, fiche = ticket', async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    t.step('open the demo Maison till');
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('#pos-maison .mz-view.is-on', { visible: true, timeout: 15000 });

    t.step('price three demo items the way a merchant types them');
    const ids = await page.evaluate(() => {
      const cat = window.KiwiBoutiqueCatalog;
      const all = cat.listProducts({});
      const by = (name) => all.find((p) => p.name.indexOf(name) === 0);
      const vase = by('Vase céramique'), fes = by('Service 18 pièces Fès'), zel = by('Service 12 pièces Zellige');
      cat.updateProduct(vase.id, { priceMAD: 249.9 });
      cat.updateProduct(fes.id, { piecePriceMAD: 84.9 });
      cat.updateProduct(zel.id, { priceMAD: 1100, piecePriceMAD: null });
      return { vase: vase.id, fes: fes.id, zel: zel.id };
    });
    await page.waitForFunction((id) => /249/.test(document.querySelector(`[data-mz-item="${id}"] .mz-card-price`)?.textContent || ''), { timeout: 5000 }, ids.vase).catch(() => {});
    const text = async (sel) => flat(await page.$eval(sel, (e) => e.textContent));
    const openItem = async (id) => {
      await page.click(`[data-mz-item="${id}"]`);
      await page.waitForSelector('#mz-sheet-veil.is-open #mz-sheet-total', { visible: true });
    };
    const addAndClose = async () => {
      await page.click('#mz-sheet-add');
      await page.waitForFunction(() => !document.querySelector('#mz-sheet-veil.is-open'));
    };
    const lastLine = () => text('#mz-tk-lines .mz-line:last-child .mz-line-price');

    check(await text(`[data-mz-item="${ids.vase}"] .mz-card-price`) === '249 MAD', 'grille : le vase à 249,90 affiche 249 MAD');
    const before = mad(await text('.mz-tk-total .val'));

    t.step('vase 249,90 · sheet then ticket');
    await openItem(ids.vase);
    check(await text('#mz-sheet-total') === '249 MAD' && await text('#mz-sheet-cta') === '249 MAD', 'fiche : 249 MAD');
    await addAndClose();
    check(await lastLine() === '249 MAD', 'ticket : la ligne du vase encaisse 249 MAD, pas 250');
    check(mad(await text('.mz-tk-total .val')) - before === 249, 'ticket : le total monte de 249');

    for (const [id, label, piece] of [[ids.fes, 'Fès Bleu, pièce à 84,90', 84], [ids.zel, 'Zellige, prix à la pièce vide (1 100 / 12)', 91]]) {
      t.step(label);
      await openItem(id);
      await page.click('#mz-format-seg [data-mz-format="piece"]');
      await page.waitForFunction(() => document.querySelector('#mz-format-seg [data-mz-format="piece"]')?.classList.contains('on'));
      const seg = await text('#mz-format-seg [data-mz-format="piece"] small');
      check(seg === `${piece} MAD` && await text('#mz-sheet-total') === `${piece} MAD`, `${label} : la fiche annonce ${piece} MAD la pièce`);
      await page.click('#mz-qty-plus');
      await sleep(80);
      const sheetTwo = await text('#mz-sheet-cta');
      check(sheetTwo === `${piece * 2} MAD`, `${label} : deux pièces sur la fiche = ${piece * 2} MAD`);
      await addAndClose();
      check(await lastLine() === sheetTwo, `${label} : le ticket dit ce que la fiche a dit (${sheetTwo})`);
    }

    t.step('ticket total and pay button');
    const total = await text('.mz-tk-total .val');
    check(mad(total) - before === 249 + 2 * 84 + 2 * 91, 'le total monte de 249 + 2 × 84 + 2 × 91 = 599 MAD');
    check((await text('#mz-validate')).endsWith(total), '« Encaisser » annonce le même total');
    check(!errors.length, 'aucune erreur dans la page' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  });
} finally {
  server.close();
}
await S.finish();
