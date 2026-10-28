#!/usr/bin/env node
/* La page publique de réservation : « Retrouver ma réservation », dans un vrai
 * navigateur (note 13, booking#2).
 *
 * Une cliente qui a perdu son lien de gestion (autre téléphone, navigateur
 * vidé, pas d'e-mail) n'avait aucun moyen de retrouver sa réservation. Le
 * panneau latéral porte maintenant un petit formulaire : code de réservation
 * + téléphone ou e-mail de la réservation. On vérifie, sur téléphone :
 *   · le formulaire est là, ses champs ont un nom accessible, dans la langue
 *     de la page, et il revient après un changement de langue ;
 *   · tout se fait au clavier : ouvrir, saisir, valider ;
 *   · un code et un contact qui concordent ouvrent la réservation (lien de
 *     gestion), un mauvais contact laisse la page et dit pourquoi ;
 *   · la page de gestion elle-même ne montre pas le formulaire.
 * L'API est simulée ; le serveur réel est couvert par
 * tools/booking-properties-test.mjs. */
import { suite } from './browser-trace.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const CODE = 'R-1A2B3C4D', PHONE = '0612345678', TOKEN = 'a'.repeat(32);
const posts = [];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  const send = (code, body) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(body)); };
  if (u.pathname === '/api/booking' && rq.method === 'POST') {
    let raw = '';
    rq.on('data', (c) => { raw += c; });
    rq.on('end', () => {
      const b = JSON.parse(raw || '{}');
      posts.push(b);
      const digits = String(b.contact || '').replace(/\D/g, '');
      if (b.action === 'recover' && String(b.code).toUpperCase() === CODE && (digits === PHONE || digits === '212' + PHONE.slice(1))) return send(200, { ok: true, code: CODE, manageToken: TOKEN });
      send(404, { error: 'not-found' });
    });
    return;
  }
  if (u.pathname === '/api/booking') {
    if (u.searchParams.get('manage')) return send(200, { ok: true, booking: { code: CODE, status: 'confirmed', startAt: Date.now() + 864e5, partySize: 2 }, name: 'Hammam Test', tz: 'Africa/Casablanca' });
    return send(200, { name: 'Hammam Test', tz: 'Africa/Casablanca', hoursSet: true, services: [{ id: 's1', name: 'Hammam', duration: 60, price: 200 }] });
  }
  if (u.pathname.startsWith('/api/')) return send(404, { error: 'none' });
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
const tests = suite('booking-recover', { browser });

async function open(t, query = '?merchant=hammam-test') {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument(() => { localStorage.setItem('kiwiBookingLang', 'fr'); });
  // coverage: surface=booking locale=fr viewport=phone
  await page.goto(base + '/booking.html' + query, { waitUntil: 'load' });
  return page;
}
const labels = (page) => page.$$eval('.bk-recover input', (els) => els.map((el) => (el.labels && el.labels[0] ? el.labels[0].textContent.trim() : '')));

await tests.run('fr-phone-form-keyboard-and-match', async (t) => {
  const page = await open(t);
  await page.waitForSelector('.bk-aside .bk-recover summary');
  assert.equal(await page.$eval('.bk-recover summary', (s) => s.textContent.trim()), 'Retrouver ma réservation');
  assert.deepEqual(await labels(page), ['Code de réservation', 'Téléphone ou e-mail de la réservation']);
  const box = await page.$eval('.bk-recover summary', (s) => { const r = s.getBoundingClientRect(); return { h: r.height, w: r.width }; });
  assert.ok(box.h >= 44, 'the summary is a 44 px touch target (' + box.h + ')');

  // Keyboard only: focus the summary, open it, fill both fields, a wrong contact first.
  await page.focus('.bk-recover summary');
  await page.keyboard.press('Enter');
  assert.equal(await page.$eval('.bk-recover', (d) => d.open), true, 'Enter opens the form');
  await page.keyboard.press('Tab');
  await page.keyboard.type(CODE.toLowerCase());
  await page.keyboard.press('Tab');
  await page.keyboard.type('06 99 99 99 99');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Aucune réservation/.test(document.querySelector('.bk-recover-msg').textContent));
  assert.equal(new URL(page.url()).searchParams.get('manage'), null, 'a miss stays on the page');
  assert.equal(await page.$eval('.bk-recover button', (b) => b.disabled), false, 'a miss gives the button back');

  // Fix the contact (international form) and send again with Enter.
  await page.$eval('.bk-recover input[name="contact"]', (el) => { el.value = ''; el.focus(); });
  await page.keyboard.type('+212 6 12 34 56 78');
  await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.keyboard.press('Enter')]);
  const u = new URL(page.url());
  assert.equal(u.searchParams.get('manage'), TOKEN, 'a match opens the booking');
  assert.equal(u.searchParams.get('merchant'), 'hammam-test');
  const sent = posts.filter((b) => b.action === 'recover');
  assert.equal(sent.at(-1).merchant, 'hammam-test');
  assert.equal(await page.$('.bk-recover'), null, 'the manage page does not show the form');
});

await tests.run('fr-to-ar-phone-form-follows-language', async (t) => {
  const page = await open(t);
  await page.waitForSelector('.bk-aside .bk-recover');
  await page.click('[data-lang="ar"]');
  await page.waitForFunction(() => document.documentElement.lang === 'ar' && document.querySelector('.bk-aside .bk-recover summary') && document.querySelector('.bk-aside .bk-recover summary').textContent.trim() === 'استرجاع حجزي');
  assert.deepEqual(await labels(page), ['رمز الحجز', 'الهاتف أو البريد الإلكتروني المستعمل في الحجز']);
  assert.equal(await page.$$eval('.bk-recover', (els) => els.length), 1, 'one form after a re-render');
});

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
await tests.finish();
