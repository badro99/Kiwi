#!/usr/bin/env node
/* Tickets en attente, boutique et maison, peau 2027 (assets/retail-open-tickets.js).
 * Vraie démo, vrais clics, tablette : mettre un ticket de côté, le voir dans la
 * liste, le reprendre au même total, en supprimer un, et la fusion des listes
 * de deux caisses (la tombe gagne, la plus récente gagne, les vieilles tombes partent).
 *   node tools/open-tickets-browser-test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assert = (yes, msg, got) => { if (!yes) throw new Error(msg + (got !== undefined ? ' · reçu : ' + JSON.stringify(got) : '')); console.log('  ✓ ' + msg); };

/* La fusion, sans navigateur. */
const { mergeLists } = await import(pathToFileURL(path.join(root, 'assets/retail-open-tickets.js')).href);
{
  const now = Date.now();
  const a = [{ id: 'x', at: now, upd: now, total: 10 }, { id: 'y', at: now - 5, upd: now - 5, total: 20 }];
  const b = [{ id: 'x', upd: now, gone: 1 }, { id: 'y', at: now - 5, upd: now + 1, total: 25 }, { id: 'z', upd: now - 4 * 864e5, gone: 1 }];
  const m = mergeLists(a, b);
  assert(m.find((e) => e.id === 'x').gone === 1, 'fusion : à égalité, la tombe gagne (un ticket repris ailleurs ne revient pas)');
  assert(m.find((e) => e.id === 'y').total === 25, 'fusion : la version la plus récente gagne');
  assert(!m.some((e) => e.id === 'z'), 'fusion : une tombe de plus de trois jours part');
}

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('open-tickets', { browser });
const mad = (txt) => Number(String(txt || '').replace(/[^0-9,.-]/g, '').replace(',', '.'));
const shots = process.env.KIWI_OTK_SHOTS || '';

const TILLS = {
  boutique: { card: '.bq-card', add: '#bq-sheet-veil.is-open #bq-sheet-add:not([disabled]), #bq-sheet-add:not([disabled])', hold: '#bq-kit-tkacts k-button[data-bq-tk-act="hold"]', total: '#bq-ticket .bq-tk-total .val', ready: () => document.querySelector('.bq-card') },
  maison: { card: '[data-mz-item]', add: '#mz-sheet-veil.is-open #mz-sheet-add:not([disabled])', hold: '#mz-kit-tkacts k-button[data-mz-tk-act="hold"]', total: '#pos-maison .mz-tk-total .val', ready: () => document.querySelector('[data-mz-item]') },
};

async function till(t, id) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await pinTradingHour(page);
  await page.setViewport({ width: 1024, height: 768 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument(() => {
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try { localStorage.setItem('kiwiSkin2027:till', '1'); } catch (_) {}
  });
  /* KIWI_OTK_LANG=ar : les mêmes écrans en arabe, pour les captures (les libellés vérifiés sont français). */
  if (process.env.KIWI_OTK_LANG) await page.evaluateOnNewDocument((l) => { try { localStorage.setItem('kiwiCaisseLang', l); } catch (_) {} }, process.env.KIWI_OTK_LANG);
  t.step('open the demo ' + id + ' till');
  await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 20000 });
  await page.evaluate((v) => window.KiwiPosDispatch.unlockById(v), id);
  await page.waitForFunction(TILLS[id].ready, { timeout: 20000 });
  await sleep(700);
  return page;
}
async function click(page, sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 6000 });
  const box = await (await page.$(sel)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(250);
}
async function addItem(page, id, nth) {
  const T = TILLS[id];
  const cards = await page.$$(T.card);
  const box = await cards[nth % cards.length].boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector(T.add, { visible: true, timeout: 6000 });
  await sleep(200);
  await click(page, T.add);
  await sleep(300);
}
const total = (page, id) => page.$eval(TILLS[id].total, (e) => e.textContent).then(mad);
const label = (page, id) => page.$eval(TILLS[id].hold, (e) => e.getAttribute('label') + (e.hasAttribute('disabled') ? ' [off]' : ''));
let L = '';
const lines = (page) => page.evaluate(() => { const v = document.querySelector('#pos-boutique.is-on, #pos-maison.is-on'); return v ? v.querySelectorAll('.bq-tk-line, .mz-tk-line, [data-line]').length : -1; });

for (const id of ['boutique', 'maison']) {
  // coverage: surface=caisse-boutique locale=fr viewport=tablet
  await S.run(id + ' : mettre en attente, voir, reprendre au même total', async (t) => {
    const page = await till(t, id);
    /* La démo ouvre sur un ticket déjà commencé : on y ajoute un article. */
    await addItem(page, id, 1);
    const before = await total(page, id);
    assert(before > 0, id + ' : le ticket porte des articles, total ' + before);
    assert((L = await label(page, id)) === 'Mettre en attente', id + ' : ticket plein, le bouton propose « Mettre en attente »', L);
    t.step('hold the sale');
    await click(page, TILLS[id].hold);
    assert((await total(page, id)) === 0, id + ' : le ticket courant est vidé');
    assert((L = await label(page, id)) === 'Tickets en attente · 1', id + ' : le bouton compte un ticket en attente', L);
    t.step('open the held sales sheet');
    await click(page, TILLS[id].hold);
    await page.waitForSelector('.kotk-sheet .kotk-card', { visible: true, timeout: 5000 });
    const card = await page.$eval('.kotk-sheet .kotk-card', (c) => ({ total: c.querySelector('.kotk-total').textContent, items: c.querySelector('.kotk-items').textContent }));
    assert(mad(card.total) === before, id + ' : la carte porte le total du ticket (' + card.total + ')');
    assert(/^\d+ articles? · \S/.test(card.items), id + ' : la carte compte et nomme les articles (' + card.items + ')', card.items);
    if (shots) await page.screenshot({ path: path.join(shots, id + '-sheet.png') });
    t.step('resume it');
    await click(page, '.kotk-sheet .kotk-card k-button[data-otk="open"]');
    await page.waitForFunction(() => !document.querySelector('.kotk-sheet'), { timeout: 5000 });
    await sleep(300);
    assert((await total(page, id)) === before, id + ' : le ticket repris revient au même total');
    assert((L = await label(page, id)) === 'Mettre en attente', id + ' : plus rien en attente, le ticket est de retour', L);
    if (shots) await page.screenshot({ path: path.join(shots, id + '-resumed.png') });
  });

  // coverage: surface=caisse-boutique locale=fr viewport=tablet
  await S.run(id + ' : supprimer un ticket en attente demande deux touches', async (t) => {
    const page = await till(t, id);
    await addItem(page, id, 2);
    await click(page, TILLS[id].hold);
    await click(page, TILLS[id].hold);
    await page.waitForSelector('.kotk-sheet .kotk-card', { visible: true, timeout: 5000 });
    await click(page, '.kotk-sheet .kotk-card k-button[data-otk="del"]');
    const armed = await page.$eval('.kotk-sheet .kotk-card k-button[data-otk="del"]', (b) => b.getAttribute('label'));
    assert(armed === 'Confirmer', id + ' : la première touche arme la suppression', armed);
    await click(page, '.kotk-sheet .kotk-card k-button[data-otk="del"]');
    await page.waitForSelector('.kotk-sheet .kotk-empty', { visible: true, timeout: 5000 });
    assert(true, id + ' : la seconde touche supprime, la liste est vide');
    await page.keyboard.press('Escape');
    await sleep(500);
    assert((L = await label(page, id)) === 'Aucun ticket en attente [off]', id + ' : le pied revient à zéro', L);
  });
}

await S.finish();
server.close();
