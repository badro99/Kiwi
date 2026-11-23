#!/usr/bin/env node
/* Caisse Maison · remise à la marocaine, comme la boutique (propriétaire,
 * 2026-11-23) : % , prix convenu ou −MAD, à l'article et au ticket. Le calcul
 * est celui de la boutique (pos-boutique/bargain.js), branché par
 * pos-maison/ticket-remise.js. Vraie caisse Maison, vrais clics.
 *   node tools/maison-bargain-browser-test.mjs */
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
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
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
const S = suite('maison-bargain', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const flat = (s) => String(s).replace(/[  \s]+/g, ' ').trim();
const mad = (s) => Math.round(parseFloat(String(s).replace(/[  \s]/g, '').replace(',', '.').replace(/[^0-9.]/g, '')) * 100) / 100;

try {
  await S.run('prix convenu, −MAD, plancher et ticket entier', async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    t.step('open the demo Maison till');
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('#pos-maison .mz-view.is-on', { visible: true, timeout: 15000 });

    t.step('two demo items at known prices');
    const ids = await page.evaluate(() => {
      const cat = window.KiwiBoutiqueCatalog;
      const all = cat.listProducts({});
      const vase = all.find((p) => p.name.indexOf('Vase céramique') === 0);
      const zel = all.find((p) => p.name.indexOf('Service 12 pièces Zellige') === 0);
      cat.updateProduct(vase.id, { priceMAD: 249.9 });
      cat.updateProduct(zel.id, { priceMAD: 1100 });
      return { vase: vase.id, zel: zel.id };
    });
    await page.waitForFunction((id) => /249/.test(document.querySelector(`[data-mz-item="${id}"] .mz-card-price`)?.textContent || ''), { timeout: 5000 }, ids.vase).catch(() => {});
    const text = async (sel) => flat(await page.$eval(sel, (e) => e.textContent));
    const total = async () => mad(await text('.mz-tk-total .val'));
    const openItem = async (id) => {
      await page.click(`[data-mz-item="${id}"]`);
      await page.waitForSelector('#mz-sheet-veil.is-open #mz-sheet-total', { visible: true });
      /* Le service se vend entier ici : la fiche peut s'ouvrir « à la pièce ». */
      const whole = await page.$('#mz-format-seg [data-mz-format="service"]:not(.on)');
      if (whole) { await whole.click(); await sleep(150); }
    };
    const typeIn = async (sel, txt) => {
      await page.click(sel);
      await page.$eval(sel, (i) => { i.value = ''; });
      await page.keyboard.type(txt);
      await sleep(150);
    };
    const addAndClose = async () => {
      await page.click('#mz-sheet-add');
      await page.waitForFunction(() => !document.querySelector('#mz-sheet-veil.is-open'));
      await sleep(150);
    };
    const t0 = await total();

    t.step('item sheet · Prix convenu');
    await openItem(ids.vase);
    check(await page.$$eval('#mz-bargain [data-bq-bmode]', (b) => b.map((x) => x.textContent).join('|')) === '%|Prix convenu|−MAD', 'la fiche propose % | Prix convenu | −MAD');
    check(await page.$$eval('#mz-bargain [data-mz-rem]', (b) => b.length) > 1, 'les pastilles de pourcentage restent sous « % »');
    await page.click('#mz-bargain [data-bq-bmode="price"]');
    await typeIn('#mz-bargain [data-bq-bval]', '210');
    const pv = await text('#mz-bargain .bq-bargain-pv');
    check(/249,90.*→.*210/.test(pv), `la fiche annonce 249,90 → 210 (« ${pv} »)`);
    check(mad(await text('#mz-sheet-total')) === 210, 'le total de la fiche dit 210 MAD');
    await addAndClose();
    check(Math.round((await total() - t0) * 100) === 21000, 'le ticket monte de 210 MAD exactement');
    check(await page.$$eval('#mz-tk-lines .mz-line', (ls) => ls.some((l) => /Prix convenu/.test(l.textContent) && l.querySelector('.mz-line-price .was'))), 'la ligne porte « Prix convenu » et barre le prix affiché');
    const auth = await page.evaluate(() => { const s = window.__maisonSpec; return s && s.state ? s.state.ticket.remiseAuth : null; });
    if (auth) check(auth.mode === 'price' && auth.value === 210, 'le geste garde son mode et son chiffre');

    t.step('item sheet · sous le prix minimum');
    await openItem(ids.zel);
    await page.click('#mz-bargain [data-bq-bmode="price"]');
    await typeIn('#mz-bargain [data-bq-bval]', '500');
    check(!(await page.$eval('#mz-sheet-add', (b) => b.disabled)), 'sous le plancher, l\'ajout reste possible');
    check(/quand même/i.test(await text('#mz-sheet-add-t')), 'le bouton dit « Vendre quand même »');
    check(/minimum/i.test(await text('#mz-bargain .bq-bargain-pv')), 'la caisse nomme le prix minimum');

    t.step('item sheet · −MAD');
    await page.click('#mz-bargain [data-bq-bmode="amount"]');
    await typeIn('#mz-bargain [data-bq-bval]', '100');
    check(mad(await text('#mz-sheet-total')) === 1000, '1 100 − 100 : la fiche dit 1 000 MAD');
    check(/Ajouter/.test(await text('#mz-sheet-add-t')), 'au-dessus du plancher, le bouton redit « Ajouter au ticket »');
    await addAndClose();
    check(Math.round((await total() - t0) * 100) === 121000, 'le ticket monte de 210 + 1 000 MAD');

    t.step('ticket · Prix convenu pour le tout');
    const before = await total();
    const target = Math.round(before * 0.95);
    const remBtn = (await page.$('#mz-tk-remise')) ? '#mz-tk-remise' : '[data-bq-tk-act="remise"], [data-mz-tk-act="remise"]';
    await page.click(remBtn);
    await page.waitForSelector('#mz-tkrem-bargain [data-bq-bmode="price"]', { visible: true, timeout: 5000 });
    check(!(await page.$eval('#mz-tkrem-foot', (f) => f.offsetParent)), 'sous « % », pas de bouton « Appliquer » : une pastille suffit');
    await page.click('#mz-tkrem-bargain [data-bq-bmode="price"]');
    await typeIn('#mz-tkrem-bargain [data-bq-bval]', String(target));
    check(!(await page.$eval('#mz-tkrem-apply', (b) => b.disabled)), 'le total convenu est accepté');
    await page.click('#mz-tkrem-apply');
    await sleep(300);
    check(Math.round(await total() * 100) === target * 100, `le ticket vaut exactement ${target} MAD (avant ${before})`);

    t.step('ticket · une pièce ajoutée après part à son prix');
    const n0 = await page.$$eval('#mz-tk-lines .mz-line', (l) => l.length);
    await page.$$eval('#mz-tk-lines .mz-line', (ls) => { ls.find((l) => /Vase céramique/.test(l.textContent)).querySelector('[data-mz-plus]').id = 'mz-test-plus'; });
    await page.click('#mz-test-plus');
    await sleep(250);
    check(await page.$$eval('#mz-tk-lines .mz-line', (l) => l.length) === n0 + 1, '« + » sur une ligne convenue pour le ticket ouvre une nouvelle ligne');
    check(Math.round((await total() - target) * 100) === 24990, 'cette pièce coûte son prix affiché, 249,90');

    t.step('ticket · retour au pourcentage');
    await page.click(remBtn);
    await page.waitForSelector('#mz-tkrem-chips [data-mz-tkrem="0"]', { visible: true, timeout: 5000 });
    await page.click('#mz-tkrem-chips [data-mz-tkrem="0"]');
    await sleep(300);
    check(Math.round((await total() - t0) * 100) === 24990 * 2 + 110000, '« Sans » efface les prix convenus : 2 × 249,90 + 1 100');
    check(!errors.length, 'aucune erreur dans la page' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  });
} finally {
  server.close();
}
await S.finish();
