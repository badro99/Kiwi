#!/usr/bin/env node
/* wallet-carte-browser-test · the /carte loyalty-card page in Chromium, over the
 * real wallet routes (functions/api/wallet/) and a seeded node:sqlite D1.
 *
 *   node tools/wallet-carte-browser-test.mjs
 *
 * What this holds:
 *   · counter stand: the button waits for consent, the first name lands on the
 *     card while it is typed, a new number gets its card (web offer, since no
 *     Wallet secrets are set), and the same number again is sent to the till
 *     without a card, a name or a balance;
 *   · receipt QR: the visit lands as the first stamp, once; the same receipt
 *     a second time says it was already added;
 *   · the web card: the shop's stamps and the till QR, and the balance reads
 *     "3 / 8" left to right even in Arabic (KIWI_LOCALES=fr,ar);
 *   · no page error anywhere. */
import { suite } from './browser-trace.mjs';
import { forLocales } from './test-locales.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { walletDb } from './wallet-d1-shim.mjs';
import * as enroll from '../functions/api/wallet/enroll.js';
import * as card from '../functions/api/wallet/card.js';
import * as strip from '../functions/api/wallet/strip/[[path]].js';
import { issueCard } from '../functions/api/wallet/_store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

/* ── the shop, its client and a receipt ── */
const { DB, sql } = walletDb();
const put = sql.prepare('INSERT INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?,?,?,1,1)');
put.run('pasta-corner', 'fidelity', JSON.stringify({ model: 'visit', visit: { target: 10, reward: '1 plat offert' } }));
put.run('pasta-corner', 'wallet', JSON.stringify({ on: true, name: 'Pasta Corner', color: '#B3261E', bg: '#FFF8F0' }));
put.run('santos-demo', 'fidelity', JSON.stringify({ model: 'visit', visit: { target: 8, reward: '−20 % sur la pièce' } }));
put.run('santos-demo', 'wallet', JSON.stringify({ on: true, name: 'Santos Store', color: '#F7F5F0', bg: '#0A0F0D' }));
sql.prepare("INSERT INTO clients (merchant, id, name, phone, stamps, updated_ts, srv_ts) VALUES ('santos-demo','s3','Yassine','0622222222',3,1,1)").run();
const SALE = 'sale-ref-0a1b2c3d-856f-e05a-4a18-ae36-d2d316c27700';
sql.prepare('INSERT INTO sales (id, merchant, amount, amount_cents, method, ref, ts) VALUES (?,?,?,?,?,?,?)').run(SALE, 'pasta-corner', 120, 12000, 'cash', '43015', Date.now() - 3600_000);
const santosCard = await issueCard(DB, { merchant: 'santos-demo', clientId: 's3', platform: 'web' });
const env = { DB, AUTH_SECRET: 'wallet-carte-browser-test' };

/* ── a small Pages stand-in: the wallet routes, /carte, and static files ── */
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
let ip = 0;
const server = http.createServer(async (rq, rs) => {
  try {
    const u = new URL(rq.url, 'http://' + rq.headers.host);
    const chunks = []; for await (const c of rq) chunks.push(c);
    /* every page gets its own address, so the sign-up budget (12 an hour per
       address) never decides a scenario */
    const request = new Request(u, { method: rq.method, headers: { ...rq.headers, 'CF-Connecting-IP': '10.0.0.' + (rq.headers['x-test-ip'] || ++ip) }, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : Buffer.concat(chunks) });
    const ctx = (params = {}) => ({ request, env, params, waitUntil() {} });
    let out = null;
    if (u.pathname === '/api/wallet/enroll') out = await (rq.method === 'POST' ? enroll.onRequestPost : enroll.onRequestGet)(ctx());
    else if (u.pathname === '/api/wallet/card') out = await card.onRequestGet(ctx());
    else if (u.pathname.startsWith('/api/wallet/strip/')) out = await strip.onRequestGet(ctx({ path: u.pathname.slice(18).split('/') }));
    if (out) { rs.writeHead(out.status, Object.fromEntries(out.headers)); rs.end(Buffer.from(await out.arrayBuffer())); return; }
    const file = u.pathname === '/carte' || u.pathname.startsWith('/carte/') ? 'carte.html' : decodeURIComponent(u.pathname.slice(1));
    const p = path.resolve(root, file);
    if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
    fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
  } catch (e) { rs.writeHead(500); rs.end(String(e && e.stack || e)); }
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const tests = suite('wallet-carte', { browser });

async function open(t, url) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.defer(() => assert.deepEqual(errors, [], 'no page error'));
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await page.goto(base + url, { waitUntil: 'load' });
  return page;
}
const heading = (page) => page.$eval('#wc-panel h1', (h) => h.textContent);
const text = (page, sel) => page.$eval(sel, (n) => n.textContent.trim());
async function signUp(page, name, phone) {
  await page.waitForSelector('#wc-panel form input[type=checkbox]');
  const [nameIn, phoneIn] = await page.$$('#wc-panel form input:not([type=checkbox])');
  await nameIn.type(name);
  await phoneIn.type(phone);
  await page.click('#wc-panel form input[type=checkbox]');
  await page.click('#wc-panel form button[type=submit]');
}

await tests.run('fr · stand: a new number gets its card, the same number again is sent to the till', async (t) => {
  // coverage: surface=carte locale=fr viewport=phone
  const page = await open(t, '/carte/pasta-corner?lang=fr');
  t.step('the reward is sold up front; a tap without consent says why and sends nothing; the first name lands on the card as it is typed');
  await page.waitForSelector('#wc-panel form');
  assert.match(await text(page, '#wc-panel .wc-offer'), /1 plat offert au bout de 10 passages\./);
  await page.click('#wc-panel form button[type=submit]');
  assert.match(await text(page, '#wc-panel form .wc-err'), /Cochez la case/);
  assert.equal(await text(page, '#wc-balance'), '0 / 10');
  assert.equal(await page.$$eval('#wc-stamps .wc-stamp', (s) => s.length), 10, 'ten discs for a ten-stamp card');
  const [nameIn] = await page.$$('#wc-panel form input:not([type=checkbox])');
  await nameIn.type('Salma Idrissi');
  assert.equal(await text(page, '#wc-first'), 'Salma', 'the first name, alone, on the card');
  await nameIn.click({ clickCount: 3 }); await page.keyboard.press('Backspace');

  t.step('sign up');
  await signUp(page, 'Salma', '0677889900');
  await page.waitForFunction(() => /prête/.test(document.querySelector('#wc-panel h1').textContent));
  const href = await page.$eval('#wc-panel a.wc-btn', (a) => a.getAttribute('href'));
  assert.match(href, /^http:\/\/127\.0\.0\.1:\d+\/carte\/pasta-corner\/[a-z0-9]{24}\?t=[a-z0-9]{32}$/, 'the web card link');
  assert.equal(await page.$$eval('#wc-panel a.wc-btn:not([href^="https://wa.me"])', (a) => a.length), 1, 'no Wallet button without the Wallet secrets');
  assert.match(await page.$eval('#wc-panel a[href^="https://wa.me"]', (a) => decodeURIComponent(a.href)), /Ma carte fidélité Pasta Corner : http:\/\/127\.0\.0\.1:\d+\/carte\/pasta-corner\//, 'the WhatsApp link carries the web card');

  t.step('the web card shows the stamps and the till code');
  await page.goto(href, { waitUntil: 'load' });
  await page.waitForSelector('#wc-qr svg');
  assert.equal(await text(page, '#wc-first'), 'Salma');
  assert.equal(await text(page, '#wc-balance'), '0 / 10');

  t.step('back on the stand, this phone finds its card again; "not me" opens the form');
  const again = t.watch(await page.browserContext().newPage());
  await again.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await again.goto(base + '/carte/pasta-corner?lang=fr', { waitUntil: 'load' });
  await again.waitForFunction(() => /Votre carte/.test(document.querySelector('#wc-panel h1')?.textContent || ''));
  await again.click('#wc-panel .wc-link');

  t.step('the same number again gets no card, no name, no balance');
  await signUp(again, 'Quelqu’un', '06 77 88 99 00');
  await again.waitForSelector('#wc-panel .wc-note');
  assert.match(await text(again, '#wc-panel .wc-note'), /déjà une carte chez Pasta Corner/);
  assert.equal(await again.$$eval('#wc-panel a', (a) => a.length), 0, 'no card link');
  assert.equal(await text(again, '#wc-balance'), '0 / 10', 'the card still shows the program, not her balance');
  assert.equal(await text(again, '#wc-first'), 'Quelqu’un', 'only what this visitor typed');
});

await tests.run('fr · receipt: the visit lands as the first stamp, once', async (t) => {
  const page = await open(t, `/carte/pasta-corner?r=${SALE}&lang=fr`);
  await page.waitForSelector('#wc-panel .wc-note');
  assert.match(await text(page, '#wc-panel .wc-note'), /vaut un tampon/);
  await signUp(page, 'Karim', '0611223344');
  await page.waitForFunction(() => /prête/.test(document.querySelector('#wc-panel h1').textContent));
  assert.match(await text(page, '#wc-panel .wc-note'), /Tampon ajouté/);
  assert.equal(await text(page, '#wc-balance'), '1 / 10');
  assert.equal(await page.$$eval('#wc-stamps .wc-stamp.is-on', (s) => s.length), 1, 'one disc filled');

  t.step('the same receipt again');
  const again = await open(t, `/carte/pasta-corner?r=${SALE}&lang=fr`);
  await again.waitForSelector('#wc-panel .wc-note');
  assert.match(await text(again, '#wc-panel .wc-note'), /déjà été ajouté/);
  const n = sql.prepare("SELECT COUNT(*) AS n FROM client_purchase_events WHERE merchant = 'pasta-corner'").get().n;
  assert.equal(n, 1, 'one purchase event for one receipt');
});

for (const lang of forLocales(['fr', 'ar'])) {
  await tests.run(`${lang} · web card: the shop's stamps, the till code, a balance read left to right`, async (t) => {
    const page = await open(t, `/carte/santos-demo/${santosCard.serial}?t=${santosCard.authToken}&lang=${lang}`);
    await page.waitForSelector('#wc-qr svg');
    const s = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      balance: document.getElementById('wc-balance').textContent,
      balanceDir: getComputedStyle(document.getElementById('wc-balance')).direction,
      rewardBidi: getComputedStyle(document.getElementById('wc-reward')).unicodeBidi,
      stamps: document.querySelectorAll('#wc-stamps .wc-stamp').length,
      on: document.querySelectorAll('#wc-stamps .wc-stamp.is-on').length,
      bg: getComputedStyle(document.getElementById('wc-card')).backgroundColor,
    }));
    assert.equal(s.dir, lang === 'ar' ? 'rtl' : '');
    assert.equal(s.balance, '3 / 8');
    assert.equal(s.balanceDir, 'ltr', 'numbers read left to right in every language');
    assert.equal(s.rewardBidi, 'plaintext', "the shop's own words keep their own direction");
    assert.deepEqual([s.stamps, s.on], [8, 3]);
    assert.equal(s.bg, 'rgb(3, 26, 19)', "Kiwi's Nuit green, whatever colour the shop once chose");
  });
}

server.close();
await tests.finish();
