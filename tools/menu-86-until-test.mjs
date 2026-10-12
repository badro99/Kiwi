/* « Épuisé jusqu'à 18 h » — a timed 86, end to end.
 *
 * 1 · The server rule (functions/api/menu.js › sanitizeMenu / availUntilOf):
 *     a future end is kept, a passed one makes the dish available again for
 *     every reader, an end more than seven days out is dropped (the 86 stays,
 *     without an invented return date), and an available dish carries none.
 * 2 · The endpoint contract (functions/api/menu/availability.js).
 * 3 · The till screen (assets/caisse-menu-availability.js) with real clicks:
 *     switching a dish off asks for how long, each choice posts the right
 *     instant, cancelling posts nothing, switching back on asks nothing.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { sanitizeMenu, availUntilOf } from '../functions/api/menu.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed += 1; };

/* ── 1 · server rule ─────────────────────────────────────────────────── */
const NOW = Date.UTC(2026, 9, 12, 13, 0, 0);
const H = 3600e3;
const menuOf = (items) => ({ cats: [{ id: 'c', name: 'Plats' }], items });
const one = (it) => sanitizeMenu(menuOf([{ id: 'x', name: 'Tajine', price: 90, catId: 'c', ...it }]), NOW).items[0];

let it = one({ avail: false, availUntil: NOW + 2 * H });
ok(it.avail === false && it.availUntil === NOW + 2 * H, 'a future end keeps the dish hidden and travels with it');
it = one({ avail: false, availUntil: NOW - 1 });
ok(it.avail === true && !('availUntil' in it), 'a passed end makes the dish available again, for every reader');
it = one({ avail: false, availUntil: NOW });
ok(it.avail === true, 'the end instant itself is already available');
it = one({ avail: false, availUntil: NOW + 8 * 24 * H });
ok(it.avail === false && !('availUntil' in it), 'an end beyond seven days is dropped, the 86 stays without a made-up return');
it = one({ avail: true, availUntil: NOW + H });
ok(it.avail === true && !('availUntil' in it), 'an available dish never carries an end');
it = one({ avail: false, availUntil: 'demain' });
ok(it.avail === false && !('availUntil' in it), 'a non-numeric end is ignored');
it = one({ avail: false });
ok(it.avail === false && !('availUntil' in it), 'a plain 86 is unchanged');
ok(availUntilOf({ avail: false, availUntil: NOW + H }, NOW) === NOW + H, 'availUntilOf reads the end');
ok(availUntilOf({ avail: true, availUntil: NOW + H }, NOW) === null, 'availUntilOf ignores an available dish');
const defaultNow = sanitizeMenu(menuOf([{ id: 'y', name: 'Thé', price: 15, catId: 'c', avail: false, availUntil: Date.now() - 1000 }])).items[0];
ok(defaultNow.avail === true, 'sanitizeMenu defaults to the real clock');

/* ── 2 · endpoint contract ───────────────────────────────────────────── */
const api = read('functions/api/menu/availability.js');
ok(/body\.available \|\| !Number\.isFinite\(until\) \|\| until <= now \|\| until - now > 7 \* 24 \* 3600 \* 1000/.test(api),
  'the endpoint refuses an end on a re-enable, a past end and one beyond seven days');
ok(/if \(until != null\) item\.availUntil = until;\s*else delete item\.availUntil;/.test(api), 'a re-enable or a plain 86 clears any previous end');
ok(/sanitizeMenu\(JSON\.parse\(row\.data\), now\)/.test(api), 'the endpoint resolves expired ends with the same clock it validates with');

/* ── 3 · the till screen, real clicks ────────────────────────────────── */
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log(`menu-86-until: ${passed} passed · ○ browser part skipped (puppeteer-core unavailable)`); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log(`menu-86-until: ${passed} passed · ○ browser part skipped (Chromium unavailable)`); process.exit(process.env.CI ? 1 : 0); }

const HARNESS = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>.kds-screen{display:none;position:fixed;inset:0}.kds-screen.is-open{display:block}</style></head>
<body><nav class="rail-links"><button id="open-kds">Cuisine</button></nav>
<script>window.KiwiConfig={type:'restaurant',storeSlug:()=>'amira-cafe'};window.Kiwi={toast:(m)=>{window.__toasts=(window.__toasts||[]).concat(m);}};</script>
<script src="/assets/caisse-menu-availability.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HARNESS); }
  if (req.url.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(read(req.url.split('?')[0].slice(1))); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const s = suite('menu-86-until', { browser });

await s.run('switching a dish off asks for how long', async (t) => {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  const posts = [];
  const menu = { cats: [{ id: 'c', name: 'Plats' }], items: [
    { id: 'taj', name: 'Tajine poulet', price: 90, catId: 'c', avail: true },
    { id: 'pas', name: 'Pastilla', price: 120, catId: 'c', avail: true },
    { id: 'the', name: 'Thé à la menthe', price: 15, catId: 'c', avail: true },
  ], formulaItems: [] };
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/api/menu/availability')) {
      const body = JSON.parse(req.postData() || '{}');
      posts.push(body);
      const item = menu.items.find((x) => x.id === body.itemId);
      item.avail = body.available;
      if (body.until) item.availUntil = body.until; else delete item.availUntil;
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, until: body.until || null }) });
    }
    if (u.includes('/api/menu?')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ menu: JSON.parse(JSON.stringify(menu)) }) });
    return req.continue();
  });
  t.step('open the till menu screen');
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.click('#open-menu-availability');
  await page.waitForSelector('[data-km-toggle="taj"]');

  t.step('switch the tajine off: a choice appears, nothing is posted yet');
  await page.click('[data-km-toggle="taj"]');
  await page.waitForSelector('#km-sheet:not([hidden])');
  const title = await page.$eval('#km-sheet-title', (e) => e.textContent);
  ok(title === 'Masquer « Tajine poulet »', 'the sheet names the dish');
  ok(posts.length === 0, 'opening the choice posts nothing');

  t.step('cancel: nothing posted, the dish is still on');
  await page.click('[data-km-until="cancel"]');
  ok(await page.$eval('#km-sheet', (e) => e.hidden), 'cancel closes the sheet');
  ok(posts.length === 0, 'cancel posts nothing');
  ok(await page.$eval('[data-km-toggle="taj"]', (e) => e.classList.contains('on')), 'the dish stays available after cancel');

  t.step('« Pendant 1 heure »');
  await page.click('[data-km-toggle="taj"]');
  await page.waitForSelector('#km-sheet:not([hidden])');
  const before = await page.evaluate(() => Date.now());
  await page.click('[data-km-until="hour"]');
  await page.waitForFunction(() => document.querySelector('[data-km-toggle="taj"]') && !document.querySelector('[data-km-toggle="taj"]').classList.contains('on') && !document.querySelector('[data-km-toggle="taj"]').disabled);
  ok(posts.length === 1 && posts[0].available === false, 'one post, switching the dish off');
  ok(Math.abs(posts[0].until - (before + 3600e3)) < 5000, 'the end is one hour from now');
  const meta = await page.$eval('[data-km-toggle="taj"]', (b) => b.closest('.km-card').querySelector('.km-back')?.textContent || '');
  const expect = await page.evaluate((u) => { const d = new Date(u); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }, posts[0].until);
  ok(meta.endsWith('à ' + expect) && meta.startsWith('Revient'), 'the card says when the dish comes back: ' + meta);
  ok((await page.evaluate(() => window.__toasts.slice(-1)[0])).includes('revient'), 'the toast says it comes back');

  t.step('« Jusqu’à » a chosen time');
  await page.click('[data-km-toggle="pas"]');
  await page.waitForSelector('#km-sheet:not([hidden])');
  await page.$eval('#km-until-clock', (e) => { e.value = '23:45'; });
  await page.click('#km-sheet-time button[type="submit"]');
  await page.waitForFunction(() => !document.querySelector('[data-km-toggle="pas"]').classList.contains('on'));
  const want = await page.evaluate(() => window.KiwiMenuAvailability.nextClock('23:45', Date.now()));
  ok(posts[1].itemId === 'pas' && Math.abs(posts[1].until - want) < 60e3, 'the chosen time is posted as its next occurrence');

  t.step('« Jusqu’à nouvel ordre »: no end');
  await page.click('[data-km-toggle="the"]');
  await page.waitForSelector('#km-sheet:not([hidden])');
  await page.click('[data-km-until="none"]');
  await page.waitForFunction(() => !document.querySelector('[data-km-toggle="the"]').classList.contains('on'));
  ok(posts[2].itemId === 'the' && !('until' in posts[2]), 'a plain 86 posts no end');
  ok(!(await page.$eval('[data-km-toggle="the"]', (b) => !!b.closest('.km-card').querySelector('.km-back'))), 'a plain 86 shows no return time');

  t.step('switch the tajine back on: no question asked');
  await page.click('[data-km-toggle="taj"]');
  await page.waitForFunction(() => document.querySelector('[data-km-toggle="taj"]').classList.contains('on'));
  ok(await page.$eval('#km-sheet', (e) => e.hidden), 'switching on asks nothing');
  ok(posts[3].itemId === 'taj' && posts[3].available === true && !('until' in posts[3]), 'switching on clears the end');

  t.step('the end-of-service and clock helpers follow the 5 h day');
  const r = await page.evaluate(() => {
    const A = window.KiwiMenuAvailability;
    const at = (h, m) => { const d = new Date(2026, 9, 12, h, m, 0, 0); return d.getTime(); };
    const hm = (ms) => { const d = new Date(ms); return [d.getDate(), d.getHours(), d.getMinutes()]; };
    return {
      night: hm(A.endOfService(at(3, 0))),
      noon: hm(A.endOfService(at(12, 0))),
      five: hm(A.endOfService(at(5, 0))),
      later: hm(A.nextClock('18:00', at(12, 0))),
      earlier: hm(A.nextClock('09:00', at(12, 0))),
      bad: A.nextClock('25:00', at(12, 0)),
      today: A.returnLabel(at(18, 0), at(12, 0)),
      tomorrow: A.returnLabel(at(18, 0) + 86400e3, at(12, 0)),
    };
  });
  ok(String(r.night) === '12,5,0', 'at 3 h the service ends at 5 h the same night');
  ok(String(r.noon) === '13,5,0', 'at noon the service ends at 5 h next morning');
  ok(String(r.five) === '13,5,0', 'at 5 h sharp the next service end is tomorrow');
  ok(String(r.later) === '12,18,0', '18:00 asked at noon is today');
  ok(String(r.earlier) === '13,9,0', '09:00 asked at noon is tomorrow');
  ok(r.bad === null, 'an impossible time is refused');
  ok(r.today === 'Revient à 18:00' && r.tomorrow === 'Revient demain à 18:00', 'the return label says today or tomorrow');
});

await browser.close();
server.close();
console.log(`menu-86-until: ${passed} passed`);
await s.finish();
