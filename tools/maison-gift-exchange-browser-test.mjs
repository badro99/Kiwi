#!/usr/bin/env node
/* Caisse Maison · échange sans ticket, par de vrais clics sur la caisse de démo.
 *
 * Une cliente rapporte un cadeau en double, sans ticket. La caissière ouvre
 * « Échange sans ticket » depuis la page des retours, retrouve l'article au
 * clavier, puis ce qu'elle emporte. Décision propriétaire (23 nov. 2026) :
 * échange contre marchandise uniquement, donc
 *   · emporter moins cher que ce qui revient est bloqué (« il reste … à choisir ») ;
 *   · même valeur : échange direct, sans encaissement ;
 *   · plus cher : la différence passe par la feuille de paiement normale.
 * Le stock suit : ce qui revient remonte, ce qui part descend.
 * docs/specs/2026-11-23-maison-echange-sans-ticket.md */
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

/* Le même montage que tools/maison-shelf-price-browser-test.mjs. */
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
const S = suite('maison-gift-exchange', { browser });
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
const flat = (s) => String(s).replace(/[  \s]+/g, ' ').trim();
const mad = (s) => Math.round(parseFloat(String(s).replace(/[  \s]/g, '').replace(',', '.').replace(/[^0-9.]/g, '')) * 100) / 100;

try {
  await S.run('échange sans ticket · bloqué, direct, puis avec différence', async (t) => {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // coverage: surface=caisse-maison locale=fr viewport=desktop
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('#pos-maison .mz-view.is-on', { visible: true, timeout: 15000 });

    t.step('three whole demo items: a cheap gift, its same-price twin, a dearer one');
    const ids = await page.evaluate(async (rev) => {
      const m = await import('/assets/pos-maison.js?v=' + rev);
      const price = (id) => m.lineDeal({ pid: id, isPiece: false, remise: 0 }).price;
      const whole = Object.values(m.P).filter((p) => Object.keys(p.sizes || {}).length === 1 && m.stockOf(p) >= 3 && !(p.servicePieces > 1));
      whole.sort((a, b) => price(a.id) - price(b.id));
      const gift = whole[0];
      const dear = whole.find((p) => price(p.id) > price(gift.id));
      /* Le jumeau de même valeur : on aligne son prix sur celui du cadeau. */
      const twin = whole.find((p) => p.id !== gift.id && p.id !== dear.id);
      window.KiwiBoutiqueCatalog.updateProduct(twin.id, { priceMAD: price(gift.id) });
      return { gift: gift.id, giftName: gift.name, twin: twin.id, twinName: twin.name, dear: dear.id, dearName: dear.name };
    }, maisonRev);
    const stock = (id) => page.evaluate(async (rev, pid) => { const m = await import('/assets/pos-maison.js?v=' + rev); return m.stockOf(m.P[pid]); }, maisonRev, id);
    const text = async (sel) => flat(await page.$eval(sel, (e) => e.textContent));

    t.step('open « Échange sans ticket » from the returns page');
    await page.click('[data-mz-view="echanges"]');
    await page.waitForSelector('[data-mz-gift-exch]', { visible: true, timeout: 5000 });
    await page.click('[data-mz-gift-exch]');
    await page.waitForSelector('#mz-gx-veil.is-open #mz-gx-q', { visible: true, timeout: 5000 });
    check(true, 'la feuille s’ouvre depuis la page des retours');

    const find = async (name) => {
      await page.click('#mz-gx-q', { clickCount: 3 });
      await page.keyboard.press('Backspace');
      /* La référence tapée sans tirets, espaces ni accents, comme on la lit vite. */
      await page.type('#mz-gx-q', name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 14));
    };

    t.step('the gift comes back, a cheaper item would leave: blocked');
    const s0 = { gift: await stock(ids.gift), twin: await stock(ids.twin), dear: await stock(ids.dear) };
    await find(ids.giftName);
    await page.waitForSelector(`[data-gx-back="${ids.gift}"]`, { visible: true, timeout: 5000 });
    await page.click(`[data-gx-back="${ids.gift}"]`);
    await page.waitForSelector(`#mz-gx-back [data-gx-line="${ids.gift}"]`, { timeout: 3000 });
    const remaining = await text('#mz-gx-diff');
    check(/Il reste/.test(remaining), 'sans article emporté : « ' + remaining + ' »');
    check(await page.$eval('#mz-gx-go', (b) => b.disabled), 'le bouton de règlement est bloqué');

    t.step('same value leaves: direct exchange, stock both ways');
    await find(ids.twinName);
    await page.waitForSelector(`[data-gx-out="${ids.twin}"]`, { visible: true, timeout: 5000 });
    await page.click(`[data-gx-out="${ids.twin}"]`);
    await page.waitForFunction(() => !document.querySelector('#mz-gx-go').disabled, { timeout: 3000 });
    check(/échange direct/i.test(await text('#mz-gx-diff')), 'même valeur annoncée : « ' + await text('#mz-gx-diff') + ' »');
    await page.click('#mz-gx-go');
    await page.waitForFunction(() => !document.querySelector('#mz-gx-veil.is-open'), { timeout: 5000 });
    check(await stock(ids.gift) === s0.gift + 1, 'le cadeau remonte en stock (+1)');
    check(await stock(ids.twin) === s0.twin - 1, 'l’article emporté descend (−1)');

    t.step('a dearer item: the difference goes through the payment sheet');
    const s1 = { gift: await stock(ids.gift), dear: await stock(ids.dear) };
    await page.click('[data-mz-gift-exch]');
    await page.waitForSelector('#mz-gx-veil.is-open #mz-gx-q', { visible: true });
    check(!(await page.$(`#mz-gx-back [data-gx-line]`)), 'la feuille repart vide');
    await find(ids.giftName);
    await page.waitForSelector(`[data-gx-back="${ids.gift}"]`, { visible: true });
    await page.click(`[data-gx-back="${ids.gift}"]`);
    await find(ids.dearName);
    await page.waitForSelector(`[data-gx-out="${ids.dear}"]`, { visible: true });
    await page.click(`[data-gx-out="${ids.dear}"]`);
    await page.waitForFunction(() => !document.querySelector('#mz-gx-go').disabled, { timeout: 3000 });
    const diff = mad(await text('#mz-gx-diff .amt'));
    const want = await page.evaluate(async (rev, a, b) => {
      const m = await import('/assets/pos-maison.js?v=' + rev);
      const p = (id) => m.lineDeal({ pid: id, isPiece: false, remise: 0 }).price;
      return Math.round((p(b) - p(a)) * 100) / 100;
    }, maisonRev, ids.gift, ids.dear);
    check(diff === want, `différence annoncée ${diff} = prix emporté − prix rendu (${want})`);
    await page.click('#mz-gx-go');
    await page.waitForSelector('#mz-paym [data-mz-m="especes"]', { visible: true, timeout: 8000 });
    check(new RegExp(String(want).replace('.', '[.,]')).test(flat(await page.$eval('#mz-paym', (e) => e.textContent)).replace(/\s/g, '')), 'la feuille de paiement demande la différence');
    await page.click('#mz-paym [data-mz-m="especes"]');
    await page.waitForSelector('#mz-cash-in', { visible: true, timeout: 5000 });
    await page.click('#mz-cash-in', { clickCount: 3 });
    await page.type('#mz-cash-in', String(Math.ceil(want)));
    await page.click('#mz-cash-ok');
    await page.waitForFunction(async (rev, pid, before) => {
      const m = await import('/assets/pos-maison.js?v=' + rev); return m.stockOf(m.P[pid]) === before - 1;
    }, { timeout: 8000 }, maisonRev, ids.dear, s1.dear);
    check(await stock(ids.gift) === s1.gift + 1, 'payé : le cadeau remonte en stock');
    check(await stock(ids.dear) === s1.dear - 1, 'payé : l’article plus cher sort du stock');
    const rec = await page.evaluate(async (rev) => { const m = await import('/assets/pos-maison.js?v=' + rev); const s = m.SALES[0]; return s && { kind: s.kind, total: s.total, lines: s.lines.length }; }, maisonRev);
    check(rec && rec.kind === 'echange' && Math.round(rec.total * 100) === Math.round(want * 100), 'le journal porte une vente « échange » de la seule différence');

    check(!errors.length, 'aucune erreur dans la page' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  });
} finally {
  server.close();
}
await S.finish();
