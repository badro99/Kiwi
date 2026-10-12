#!/usr/bin/env node
/* « Vérifier la caisse » (assets/caisse-doctor.js), au vrai clic.
 *
 * Une page d'essai charge le module tel qu'expédié, avec les vraies icônes, et
 * des doublures des modules de la caisse (KiwiLive, KiwiPrinter, KiwiPlatform)
 * dont on règle l'état. Le serveur d'essai sert /api/menu avec l'en-tête Date
 * qu'on choisit. On prouve :
 *   · tout va bien → chaque ligne le dit, sans bouton inutile ;
 *   · une horloge à 10 min, trois ventes coincées depuis 20 min, aucune
 *     imprimante → trois lignes bloquantes, chacune avec le bon bouton, et le
 *     bouton fait ce qu'il dit (renvoyer, ouvrir le réglage) ;
 *   · hors ligne → « hors ligne », et l'horloge « inconnue », jamais « juste » ;
 *   · l'imprimante n'est que sondée : rien n'est imprimé ;
 *   · en arabe, l'écran parle arabe. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

let skewMs = 0;
let menuItems = 12;
const HARNESS = (lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>.kds-screen{display:none;position:fixed;inset:0}.kds-screen.is-open{display:block}</style></head>
<body><div class="quick-actions"><button data-action="fin-service">Fin de service</button></div>
<script>
  window.__calls = { flush: 0, retry: 0, setup: 0, print: 0 };
  window.__state = { paired: true, queue: { pending: 0, blocked: 0, total: 0, storageError: false, oldestPendingAt: 0 }, printer: 'bt' };
  window.KiwiPlatform = { pairedVenue: () => window.__state.paired ? { merchant: 'amira-cafe', name: 'Amira Cafe' } : null };
  window.KiwiLive = { merchant: () => 'amira-cafe', queueStatus: () => window.__state.queue, flush: () => { window.__calls.flush++; }, retryBlockedSales: () => { window.__calls.retry++; } };
  window.KiwiPrinter = {
    btConnected: () => window.__state.printer === 'bt', usbConnected: () => false,
    isConfigured: () => window.__state.printer !== 'none',
    ping: () => Promise.resolve(window.__state.printer === 'bridge' ? { version: '1.6.0' } : null),
    relayProbe: () => Promise.resolve({ provisioned: false }),
    openSetup: () => { window.__calls.setup++; },
    printReceipt: () => { window.__calls.print++; }, printBytes: () => { window.__calls.print++; },
  };
</script>
<script src="/assets/material-icons.js"></script>
<script src="/assets/caisse-doctor.js"></script></body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/' || u.pathname === '/ar') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(HARNESS(u.pathname === '/ar' ? 'ar' : 'fr')); }
  if (u.pathname === '/api/menu') {
    res.writeHead(200, { 'content-type': 'application/json', date: new Date(Date.now() + skewMs).toUTCString() });
    return res.end(JSON.stringify({ menu: { items: Array.from({ length: menuItems }, (_, i) => ({ id: 'i' + i })) } }));
  }
  if (u.pathname.startsWith('/assets/')) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(path.join(root, u.pathname.slice(1)))); }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function openPage(pathname = '/', setup) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(base + pathname, { waitUntil: 'load' });
  if (setup) await page.evaluate(setup);
  await page.click('#open-caisse-doctor');
  await page.waitForFunction(() => document.querySelector('#kd-list[aria-busy="false"] .kd-row'), { timeout: 20000 });
  const rows = await page.$$eval('.kd-row', (rs) => Object.fromEntries(rs.map((r) => [r.dataset.check, { level: r.dataset.level, text: r.querySelector('p').textContent, fix: r.querySelector('.kd-fix') && r.querySelector('.kd-fix').textContent, icon: !!r.querySelector('.kd-ic svg') }])));
  return { ctx, page, rows, problems };
}

{
  skewMs = 0; menuItems = 12;
  const { ctx, page, rows, problems } = await openPage('/');
  const btn = await page.$eval('#open-caisse-doctor', (b) => ({ label: b.textContent.trim(), svg: !!b.querySelector('svg'), before: b.nextElementSibling && b.nextElementSibling.dataset.action }));
  check(btn.label === 'Vérifier la caisse' && btn.svg && btn.before === 'fin-service', 'the button sits before « Fin de service », with the Material stethoscope');
  check(rows.net.level === 'ok' && /En ligne · le serveur répond en \d+ ms\./.test(rows.net.text), 'connection: online, with the measured time');
  check(rows.pair.level === 'ok' && rows.pair.text === 'Caisse appairée à Amira Cafe.', 'pairing: names the business');
  check(rows.queue.level === 'ok' && !rows.queue.fix, 'sales queue: empty, no button');
  check(rows.print.level === 'ok' && rows.print.text === 'Imprimante Bluetooth connectée.', 'printer: Bluetooth connected');
  check(rows.clock.level === 'ok', 'clock: right when the server agrees');
  check(rows.menu.level === 'ok' && rows.menu.text === '12 articles chargés.', 'menu: counts what the server serves');
  check(['ok', 'warn', 'unknown'].includes(rows.app.level) && ['ok', 'warn', 'unknown', 'bad'].includes(rows.store.level), 'version and storage give a verdict, never a crash');
  check(Object.values(rows).every((r) => r.icon), 'every line has its Material status icon');
  const calls = await page.evaluate(() => window.__calls);
  check(calls.print === 0, 'nothing was printed by the check');
  check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}

{
  skewMs = 10 * 60 * 1000;
  const { ctx, page, rows, problems } = await openPage('/', () => {
    window.__state.queue = { pending: 3, blocked: 0, total: 3, storageError: false, oldestPendingAt: Date.now() - 20 * 60 * 1000 };
    window.__state.printer = 'none';
  });
  check(rows.clock.level === 'bad' && /10 min d’écart/.test(rows.clock.text) && /5 h/.test(rows.clock.text), 'a 10-minute clock is blocking, and says why (the 5 am till day)');
  check(rows.queue.level === 'bad' && rows.queue.text === '3 ventes en attente d’envoi, la plus ancienne depuis 20 min.' && rows.queue.fix === 'Renvoyer maintenant', 'three sales stuck for 20 min are blocking, with « Renvoyer maintenant »');
  check(rows.print.level === 'bad' && rows.print.fix === 'Régler l’imprimante', 'no printer is blocking, with « Régler l’imprimante »');
  await page.click('.kd-row[data-check="queue"] .kd-fix');
  await new Promise((r) => setTimeout(r, 200));
  check((await page.evaluate(() => window.__calls.flush)) === 1, '« Renvoyer maintenant » flushes the queue');
  await page.waitForFunction(() => document.querySelector('#kd-list[aria-busy="false"] .kd-row'), { timeout: 20000 });
  await page.click('.kd-row[data-check="print"] .kd-fix');
  check((await page.evaluate(() => window.__calls.setup)) === 1, '« Régler l’imprimante » opens the printer setup');
  check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}

{
  skewMs = 0;
  const { ctx, rows } = await openPage('/', () => {
    window.__state.queue = { pending: 0, blocked: 2, total: 2, storageError: false, oldestPendingAt: 0 };
    window.__state.printer = 'bridge';
  });
  check(rows.queue.level === 'bad' && /2 ventes refusées/.test(rows.queue.text) && rows.queue.fix === 'Renvoyer maintenant', 'refused sales are blocking and offer a retry');
  check(rows.print.level === 'ok' && rows.print.text === 'Relais d’impression joignable · version 1.6.0.', 'a reachable bridge reports its version');
  await ctx.close();
}

{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.setOfflineMode(true);
  await page.click('#open-caisse-doctor');
  await page.waitForFunction(() => document.querySelector('#kd-list[aria-busy="false"] .kd-row'), { timeout: 20000 });
  const rows = await page.$$eval('.kd-row', (rs) => Object.fromEntries(rs.map((r) => [r.dataset.check, { level: r.dataset.level, text: r.querySelector('p').textContent }])));
  check(rows.net.level === 'bad' && /Les ventes restent sur cet appareil/.test(rows.net.text), 'offline: blocking, and says the sales are kept');
  check(rows.clock.level === 'unknown', 'offline: the clock is « unknown », never « right »');
  await ctx.close();
}

{
  skewMs = 0;
  const { ctx, page, rows } = await openPage('/ar');
  const head = await page.$eval('#kd-title', (h) => h.textContent);
  check(head === 'فحص الصندوق' && rows.pair.text === 'الصندوق مربوط بـ Amira Cafe.', 'in Arabic the screen speaks Arabic');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`caisse-doctor: ${checks} passed`);
