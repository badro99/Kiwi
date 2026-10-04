#!/usr/bin/env node
// #102 · the till's Clients page reads like its neighbours (KPI strip, segment tabs, one list card).
// #105 · a customer's boutique credit and returned pieces show on their profile and at checkout.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', {
  paths: [path.join(ROOT, 'app'), ROOT, ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)],
}));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium is required for the Clients page regression');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const caisseInlineCss = [...fs.readFileSync(path.join(ROOT, 'kiwi-caisse.html'), 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
  .map((match) => match[1]).join('\n');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/caisse-inline.css"><link rel="stylesheet" href="/assets/caisse-dna.css">
      <link rel="stylesheet" href="/assets/pos-boutique.css"><link rel="stylesheet" href="/assets/caisse-skin.css">
      <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0)}button,input{font:inherit}.vx-screen{display:flex}</style>
      <script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiPosDispatch={register:s=>window.__spec=s,lock:()=>{}};</script>
      <script>window.__fixtureClientPairing=JSON.parse(localStorage.getItem('kiwi:fixture:client-pairing')||'null');window.KiwiCaissePairing={isPaired:()=>!!window.__fixtureClientPairing,pairedVenue:()=>window.__fixtureClientPairing};</script>
      <script src="/assets/caisse-dna.js"></script><script src="/assets/caisse-lang.js"></script><script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
      <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
      <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
      <script src="/assets/boutique-catalog.js"></script><script src="/assets/sold-insights.js"></script><script src="/assets/pos-boutique.js"></script>
      </head><body class="is-pos-boutique"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-boutique"></div>
      <script>window.__spec.mount(document.getElementById('pos-boutique'));window.KiwiCaisseDna.enhance(document.getElementById('pos-boutique'),'boutique');</script></body></html>`);
    return;
  }
  if (pathname === '/caisse-inline.css') { res.writeHead(200, { 'Content-Type': TYPES['.css'] }); res.end(caisseInlineCss); return; }
  if (pathname.startsWith('/api/')) { res.writeHead(404); res.end('{}'); return; }
  const file = path.resolve(ROOT, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1280, height: 860 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiClients && KiwiClients.list().length > 0);
  // A real return at this till: the shirt of ticket 11502 came back as credit AV-2032.
  await page.evaluate(() => {
    const bookId = KiwiClients.bookId();
    const key = 'kiwi:clients:v1:' + bookId;
    const book = JSON.parse(localStorage.getItem(key));
    // Component identity only: keep the original demo till/catalogue boot.
    window.__fixtureClientPairing = { merchant: bookId, venueId: 'fixture-boutique', type: 'boutique' };
    localStorage.setItem('kiwi:fixture:client-pairing', JSON.stringify(window.__fixtureClientPairing));
    const client = book.list.find((c) => c.id === 'd2');
    client.history = [{ ref: '11502', ts: Date.now() - 3600e3, amount: 280, method: 'espèces',
      items: [{ name: 'Normal Shirt', qty: 1, total: 90 }, { name: 'Black jean', qty: 1, total: 190 }] }];
    localStorage.setItem(key, JSON.stringify(book));
    localStorage.setItem('kiwi:bqAvoirs', JSON.stringify([{ code: 'AV-2032', amount: 90, balance: 90, holderId: 'd2', holderName: client.name,
      motif: 'Changement d’avis, retour 11502', at: new Date().toISOString(), until: new Date(Date.now() + 90 * 864e5).toISOString(), from: '11502',
      lines: [{ name: 'Normal Shirt', qty: 1 }] }]));
    localStorage.setItem('kiwi:bqReturns', JSON.stringify({ m: bookId, list: [{ id: 'RET-1', ts: Date.now(), saleRef: '11502', kind: 'avoir',
      amount: 90, reference: 'AV-2032', items: [{ name: 'Normal Shirt', qty: 1, amount: 90 }] }] }));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-bq-view="clientes"]', { visible: true });
  await page.waitForFunction(() => document.querySelector('[data-bq-view="clientes"][data-kcb-redirect]'));
  await page.click('[data-bq-view="clientes"]');
  await page.waitForSelector('#kcb-root .kcb-row', { visible: true });

  const layout = await page.evaluate(() => ({
    title: document.querySelector('#kcb-root .kcb-top h2').textContent,
    kpis: document.querySelectorAll('#kcb-strip .kx-kpi').length,
    tabs: document.querySelectorAll('#kcb-segs .kx-tab').length,
    on: document.querySelector('#kcb-segs .kx-tab.on')?.getAttribute('data-seg'),
    cols: !!document.querySelector('#kcb-root .kcb-cols'),
    rows: document.querySelectorAll('#kcb-root .kcb-row').length,
    kpiLabelPx: parseFloat(getComputedStyle(document.querySelector('#kcb-strip .l')).fontSize),
    credit: document.querySelector('.kcb-row[data-id="d2"] .kcb-credit')?.textContent || '',
  }));
  ok(layout.title === 'Clients' && layout.kpis === 4 && layout.cols, '#102 page has a title, four KPIs and a column header');
  ok(layout.tabs === 5 && layout.on === 'all', '#102 segment tabs start on « Tous »');
  ok(layout.kpiLabelPx <= 11, '#102 KPI labels use the 10px uppercase scale of Vendus');
  ok(/avoir 90/.test(layout.credit), '#105 the list flags a customer holding a boutique credit');
  await page.click('#kcb-segs .kx-tab[data-seg="win"]');
  const dormant = await page.$$eval('#kcb-root .kcb-row', (rows) => rows.length);
  ok(dormant >= 1 && dormant < layout.rows, '#102 a segment tab filters the list');
  await page.click('#kcb-segs .kx-tab[data-seg="all"]');

  await page.click('.kcb-row[data-id="d2"]');
  await page.waitForFunction(() => /AV-2032/.test(document.querySelector('#kcb-credit-history')?.innerText || ''));
  const profile = await page.evaluate(() => ({
    credits: document.querySelector('#kcb-credit-history').innerText,
    history: document.querySelector('#kcb-sheet').innerText,
    struck: [...document.querySelectorAll('#kcb-sheet .kcb-struck')].map((n) => n.textContent),
  }));
  ok(/solde 90 MAD/i.test(profile.credits) && !/Aucun avoir/.test(profile.credits), '#105 the profile lists the credit issued at this till');
  ok(/1× Normal Shirt/.test(profile.credits), '#105 the credit names the returned piece');
  ok(/Retourné · 1× Normal Shirt · avoir AV-2032 · 90 MAD/.test(profile.history), '#105 the purchase history shows the return');
  ok(profile.struck.length === 1 && /Normal Shirt/.test(profile.struck[0]), '#105 only the returned piece is struck through');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.click('[data-bq-view="vente"]');
  await page.waitForSelector('#bq-tk-client', { visible: true });
  await page.click('#bq-tk-client');
  await page.waitForSelector('[data-bq-cl="c2"] .av', { visible: true });
  const chip = await page.$eval('[data-bq-cl="c2"] .av', (el) => ({ text: el.textContent, px: parseFloat(getComputedStyle(el).fontSize), bg: getComputedStyle(el).backgroundColor }));
  ok(/Avoir/.test(chip.text) && chip.px >= 12 && chip.bg !== 'rgba(0, 0, 0, 0)', '#105 the checkout picker shows the credit as a readable chip');
  await page.click('#bq-clientm [data-bq-close]');
  await page.waitForSelector('#bq-client-veil.is-open', { hidden: true });

  // #0153: type into the real carnet. Language changes use its existing rail
  // controls; query markup remains escaped before the text-node translation.
  const query = "Aïcha d'atelier · Total <img src=x> $& {n}";
  for (const [lang, expected] of [
    ['en', 'No results for'], ['ar', 'لا توجد نتائج عن'], ['fr', 'Aucun résultat pour'],
  ]) {
    await page.waitForSelector('[data-kcl="' + lang + '"]', { visible: true });
    await page.click('[data-kcl="' + lang + '"]');
    await page.waitForFunction(selected => window.KiwiCaisseLang.get() === selected, {}, lang);
    const locale = { en: 'en-GB', ar: 'ar-MA', fr: 'fr-FR' }[lang];
    try {
      await page.waitForFunction(locale => {
        const expected = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
        return document.querySelector('.kiwi-dna-clock-date')?.textContent.replace(/[\u2066\u2069]/g, '') === expected;
      }, { timeout: 5000 }, locale);
    } catch (error) {
      const actual = await page.evaluate(locale => ({ language: KiwiCaisseLang.get(),
        actual: document.querySelector('.kiwi-dna-clock-date')?.textContent,
        expected: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) }), locale);
      throw new Error('Rail date did not localize: ' + JSON.stringify(actual), { cause: error });
    }
    ok(true, '#0152 ' + lang + ': rail date follows the language immediately');
    await page.click('#bq-tk-client');
    await page.waitForSelector('#bq-cl-q', { visible: true });
    await page.evaluate(() => { window.__clientSearchInput = document.querySelector('#bq-cl-q'); });
    await page.type('#bq-cl-q', query);
    const clientPrefix = { en: 'No customer for', ar: 'لا يوجد عميل باسم', fr: 'Aucune fiche pour' }[lang];
    await page.waitForFunction(prefix => document.querySelector('#bq-clientm .bq-empty')?.textContent.startsWith(prefix), {}, clientPrefix);
    ok(await page.$eval('#bq-cl-q', el => el.type === 'text' && el.enterKeyHint === 'search'), '#0153 ' + lang + ': full text keyboard with Search action');
    ok(await page.evaluate(() => window.__clientSearchInput === document.querySelector('#bq-cl-q') && document.activeElement === window.__clientSearchInput),
      '#0153 ' + lang + ': rapid typing retains the live focused input');
    await page.click('#bq-cl-new');
    const createLabel = { en: 'Create profile', ar: 'إنشاء الملف', fr: 'Créer la fiche' }[lang];
    await page.waitForFunction(label => document.querySelector('#bq-cl-create')?.textContent.includes(label), {}, createLabel);
    ok(await page.$eval('#bq-clientm', (el, query) => !el.querySelector('img') && !el.querySelector('#bq-cl-q') && el.querySelector('#bq-cl-name').value === query, query),
      '#0153 ' + lang + ': ticket query escaped and form localized');
    ok(await page.$eval('#bq-clientm', el => ['bq-cl-name', 'bq-cl-tel'].every(id => el.querySelector('label').closest('.bq-cl-form').querySelector('#' + id)?.closest('label')?.querySelector('span')?.textContent.trim())),
      '#0160 ' + lang + ': customer fields keep visible labels after typing');
    await page.click('#bq-clientm [data-bq-close]');
    await page.click('[data-bq-view="clientes"]');
    await page.waitForSelector('#kcb-q', { visible: true });
    await page.click('#kcb-q', { clickCount: 3 });
    await page.type('#kcb-q', query);
    try {
      await page.waitForFunction(prefix => document.querySelector('#kcb-list .kcb-empty b')?.textContent.startsWith(prefix), {}, expected);
    } catch (error) {
      const actual = await page.evaluate(() => ({ language: window.KiwiCaisseLang.get(), query: document.querySelector('#kcb-q')?.value,
        message: document.querySelector('#kcb-list')?.textContent, errors: window.KiwiErrors?.list() }));
      throw new Error(lang + ' search did not localize: ' + JSON.stringify(actual), { cause: error });
    }
    const search = await page.$eval('#kcb-list', el => ({
      text: el.textContent.replace(/[\u2066\u2069]/g, ''), images: el.querySelectorAll('img').length,
    }));
    ok(search.text.includes(query) && search.images === 0, '#0153 ' + lang + ': query is literal, escaped and localized');
    await page.click('[data-bq-view="vente"]');
  }
  ok(!errors.length, 'no page errors: ' + errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}
console.log(`✓ Clients page and boutique credits · ${checks} checks`);
