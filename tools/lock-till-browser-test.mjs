#!/usr/bin/env node
/* lock-till-browser-test · « Ouvrir la caisse » on the dashboard PIN lock, for
 * an account that owns several stores (assets/lock-till.js), in Chromium.
 *
 *   node tools/lock-till-browser-test.mjs
 *
 * Owner, 30 Oct 2026: with several stores, the button asks which till to
 * open. The page is the real lock card cut from dashboard.html with the real
 * tokens, lock styles, kit lens, caisse-link.js and lock-till.js; only the
 * identity (KiwiEnv, KiwiMe) is stubbed. What this holds:
 *   · the card turns into a list of the account's stores, the one on screen
 *     first and marked, each with its city and trade; the code field is gone;
 *   · arrow keys move the selection, Enter opens the selected store's till:
 *     the hand-off names that store with its own trade (a pressing never
 *     opens as a boutique), an opening ticket prints, then the till loads;
 *   · a digit opens that row at once; a click on a row too;
 *   · Escape (and « Retour au code ») gives the code back, title restored;
 *   · one store only: no list, the ticket, then that store's till;
 *   · no page error. */
import { suite } from './browser-trace.mjs';
import { forLocales } from './test-locales.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dash = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const lockStart = dash.indexOf('<div class="kiwi-lock" data-kiwi-lock>');
const lockEnd = dash.indexOf('<!-- One-time greeting flash');
assert.ok(lockStart > 0 && lockEnd > lockStart, 'the lock card is found in dashboard.html');
const lockHtml = dash.slice(lockStart, lockEnd);
/* The dashboard's own styles, every skin layer included, without its scripts:
   the lock looks exactly as it does in production (body.design-vexel). */
const head = dash.slice(dash.indexOf('<head>'), dash.indexOf('</head>'));
const styles = [...head.matchAll(/<link rel="stylesheet"[^>]*>|<style[\s\S]*?<\/style>/g)].map((m) => m[0].replace(/href="(?!https?:|\/)/, 'href="/')).join('\n');
const asset = (name) => { const m = dash.match(new RegExp('(assets/' + name.replace(/[.]/g, '\\.') + '\\?v=[^"]+)"')); return m ? m[1] : 'assets/' + name; };
for (const f of ['caisse-link.js', 'pages/dashboard-loader.js']) assert.ok(dash.includes('src="' + asset(f) + '"'), f + ' is loaded by dashboard.html');
/* No tag of its own (the dashboard's script count is pinned): the first-use
   loader fetches it while the lock is on screen, at the stamp the offline
   shell precaches. */
assert.ok(!/src="assets\/lock-till\.js/.test(dash), 'lock-till.js has no script tag of its own');
const loaderSrc = fs.readFileSync(path.join(root, 'assets/pages/dashboard-loader.js'), 'utf8');
const lockUrl = (loaderSrc.match(/'(assets\/lock-till\.js\?v=\d+)'/) || [])[1];
assert.ok(lockUrl, 'the dashboard loader names lock-till.js');
assert.ok(fs.readFileSync(path.join(root, 'kiwi-sw.js'), 'utf8').includes("'/" + lockUrl + "'"), 'the offline shell precaches the same stamp');

const STORES = [
  { merchant: 'amira-pressing', name: 'Amira Pressing', type: 'pressing', city: 'Rabat' },
  { merchant: 'amira-boutique', name: 'Amira Boutique', type: 'boutique', city: 'Casablanca' },
  { merchant: 'amira-cafe', name: 'Amira Cafe', type: 'cafe', city: 'Casablanca' },
];
const fixture = (lang, stores) => `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${styles}
<script>
  try { localStorage.setItem('kiwiLang', ${JSON.stringify(lang)}); } catch (_) {}
  window.KiwiEnv = { isReal: () => true, demosAllowed: false };
  window.KiwiMe = { business: 'Amira Boutique', type: 'boutique', stores: ${JSON.stringify(stores)} };
  window.Kiwi = { handlers: {} };
</script></head><body class="design-vexel" data-vexel-mode="light">${lockHtml}
<script src="/${asset('kit/lens.js')}"></script>
<script src="/${asset('caisse-link.js')}"></script>
<script src="/${asset('pages/dashboard-loader.js')}"></script>
</body></html>`;

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname === '/lock') {
    const one = u.searchParams.get('one') === '1';
    rs.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    rs.end(fixture(u.searchParams.get('lang') || 'fr', one ? [STORES[1]] : STORES));
    return;
  }
  if (u.pathname === '/kiwi-caisse.html') { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end('<!doctype html><title>till</title>'); return; }
  if (u.pathname.startsWith('/api/')) { rs.writeHead(401, { 'Content-Type': 'application/json' }); rs.end('{}'); return; }
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
const tests = suite('lock-till', { browser });

const view = (page) => page.evaluate(() => {
  const inner = document.querySelector('.kiwi-lock-inner');
  const rows = [...document.querySelectorAll('.klt-row')];
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  return {
    mode: inner.getAttribute('data-klt'),
    title: document.querySelector('.kiwi-lock-title').textContent.trim(),
    pin: shown(document.querySelector('.kiwi-lock-pin')),
    rows: rows.map((r) => ({ name: r.querySelector('b').textContent, sub: (r.querySelector('small') || {}).textContent || '',
      here: !!r.querySelector('.klt-here'), on: r.classList.contains('on'), h: Math.round(r.getBoundingClientRect().height) })),
    ticket: !!document.querySelector('.klt-ticket'),
    handoff: JSON.parse(localStorage.getItem('kiwiPairHandoff') || 'null'),
    path: location.pathname + location.search,
  };
});
const open = async (t, lang, one) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.defer(() => assert.deepEqual(errors, [], 'no page error'));
  await page.setViewport({ width: 1280, height: 860 });
  await page.goto(`${base}/lock?lang=${lang}${one ? '&one=1' : ''}`, { waitUntil: 'load' });
  return page;
};

for (const lang of forLocales(['fr', 'en', 'ar'])) {
  await tests.run(`${lang} · several stores: the lock asks which till, the keys pick, the ticket prints`, async (t) => {
    const page = await open(t, lang);
    t.step('the button turns the card into the store list');
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-row');
    let v = await view(page);
    assert.equal(v.mode, 'choose');
    assert.equal(v.pin, false, 'the code field is hidden while choosing');
    assert.deepEqual(v.rows.map((r) => r.name), ['Amira Boutique', 'Amira Cafe', 'Amira Pressing'], 'the store on screen first, then by name');
    assert.ok(v.rows[0].here && !v.rows[1].here, 'the store on screen is marked');
    assert.ok(v.rows[2].sub.includes('Rabat'), 'each row says its city');
    assert.ok(v.rows.every((r) => r.h >= 44), 'rows are 44 px targets');
    assert.equal(v.handoff, null, 'nothing is handed off before a choice');
    if (lang === 'fr') await page.screenshot({ path: path.join(root, '.kiwi', 'lock-till-choose.png') }).catch(() => {});

    t.step('Escape gives the code back');
    const title = v.title;
    await page.keyboard.press('Escape');
    v = await view(page);
    assert.equal(v.mode, null); assert.equal(v.rows.length, 0); assert.equal(v.pin, true);
    assert.notEqual(v.title, title, 'the original title is back');

    t.step('arrows move, Enter opens the pressing with its own trade');
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-row');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    v = await view(page);
    assert.deepEqual(v.rows.map((r) => r.on), [false, false, true]);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.klt-ticket');
    v = await view(page);
    assert.equal(v.handoff.merchant, 'amira-pressing');
    assert.equal(v.handoff.type, 'pressing', 'the pressing till, not the boutique one');
    assert.equal(v.handoff.name, 'Amira Pressing');
    if (lang === 'fr') {
      await new Promise((r) => setTimeout(r, 700));
      await page.screenshot({ path: path.join(root, '.kiwi', 'lock-till-ticket.png') }).catch(() => {});
    }
    await page.waitForFunction(() => location.pathname === '/kiwi-caisse.html', { timeout: 4000 });
    assert.equal(new URL(page.url()).search, '?pair=1');
  });

  await tests.run(`${lang} · a digit or a click opens that store at once`, async (t) => {
    let page = await open(t, lang);
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-row');
    await page.keyboard.press('2');
    await page.waitForSelector('.klt-ticket');
    let v = await view(page);
    assert.equal(v.handoff.merchant, 'amira-cafe');
    assert.equal(v.handoff.type, 'cafe');
    await page.waitForFunction(() => location.pathname === '/kiwi-caisse.html', { timeout: 4000 });

    page = await open(t, lang);
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-row');
    await page.click('.klt-back');
    v = await view(page);
    assert.equal(v.mode, null, '« Retour au code » closes the list');
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-row');
    const rows = await page.$$('.klt-row');
    await rows[0].click();
    await page.waitForSelector('.klt-ticket');
    v = await view(page);
    assert.equal(v.handoff.merchant, 'amira-boutique', 'the store on screen keeps its venue hand-off');
    assert.equal(v.handoff.type, 'boutique');
  });

  await tests.run(`${lang} · one store: no list, the ticket, then its till`, async (t) => {
    const page = await open(t, lang, true);
    await page.click('.kiwi-lock-caisse');
    await page.waitForSelector('.klt-ticket');
    const v = await view(page);
    assert.equal(v.rows.length, 0);
    assert.equal(v.handoff.merchant, 'amira-boutique');
    await page.waitForFunction(() => location.pathname === '/kiwi-caisse.html', { timeout: 4000 });
  });
}

server.close();
await tests.finish();
