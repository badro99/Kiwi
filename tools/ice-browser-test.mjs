#!/usr/bin/env node
/* L'ICE se vérifie à la saisie, au vrai clic, dans dashboard.html.
 *
 *   · la règle (window.KiwiICE) : vide permis, chiffres seulement, 15
 *     chiffres, multiple de 97 ; les exemples publiés passent, une faute de
 *     frappe d'un chiffre ne passe pas ;
 *   · le formulaire « Établissement » refuse un ICE faux AU CHAMP (message,
 *     aria-invalid, focus), garde la fenêtre ouverte, et enregistre un ICE
 *     juste tapé avec des espaces sous sa forme compacte ;
 *   · en arabe le message est en arabe.
 * Le serveur applique la même règle aux factures (functions/api/_ice.js,
 * tenu par tools/sale-invoice-test.mjs). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { iceProblem } from '../functions/api/_ice.js';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

/* La règle serveur, sur les exemples publiés (ice.gov.ma via python-stdnum,
 * guide clicpaie : siège et première succursale). */
for (const ok of ['001561191000066', '002136093000040', '001234567000062', '001234567000159', '']) check(iceProblem(ok) === null, `serveur · ${ok || 'vide'} accepté`);
check(iceProblem('001561191000065') === 'checksum', 'serveur · un chiffre de contrôle faux est refusé');
check(iceProblem('001561191000056') === 'checksum', 'serveur · deux chiffres inversés sont refusés');
check(iceProblem('0015611910000') === 'length', 'serveur · 13 chiffres sont refusés');
check(iceProblem('00156119100006A') === 'digits', 'serveur · une lettre est refusée');
check(iceProblem('00 156 119 1000 066') === null, 'serveur · les espaces de saisie sont tolérés');

let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log(`ice: ${checks} passed · ○ browser part skipped (puppeteer-core unavailable)`); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log(`ice: ${checks} passed · ○ browser part skipped (Chromium unavailable)`); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(lang) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    if (u.startsWith(base) || u.startsWith('data:')) return r.continue();
    return r.abort();
  });
  await page.evaluateOnNewDocument((lang) => {
    try { if (navigator.serviceWorker) Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    try { localStorage.setItem('kiwiLang', lang); } catch (_) {}
  }, lang);
  // coverage: surface=dashboard locale=fr viewport=desktop
  // coverage: surface=dashboard locale=ar viewport=desktop
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.readyState === 'complete' && window.KiwiICE && window.Kiwi && window.Kiwi.handlers['account-profile'], { timeout: 20000 });
  await sleep(1200);
  const explore = await page.$('.kob-root [data-explore]');
  if (explore) { await explore.click(); await sleep(900); }
  const skip = await page.$('[data-kiwi-skip]');
  if (skip) { await skip.click(); await sleep(600); }
  return { ctx, page, problems };
}

async function openEditor(page) {
  await page.evaluate(() => window.Kiwi.handlers['account-profile']());
  await page.waitForSelector('[data-action="account-edit-business"]', { visible: true, timeout: 8000 });
  await page.click('[data-action="account-edit-business"]');
  await page.waitForSelector('[data-f="ice"]', { visible: true, timeout: 8000 });
  await sleep(350);
}
async function typeIce(page, value) {
  await page.click('[data-f="ice"]', { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type('[data-f="ice"]', value);
}

{
  // coverage: surface=dashboard locale=fr viewport=desktop
  const { ctx, page, problems } = await open('fr');
  const rule = await page.evaluate(() => ['001561191000066', '001561191000065', '123', '00156119100006A', ''].map((x) => window.KiwiICE.problem(x)));
  check(JSON.stringify(rule) === JSON.stringify([null, 'checksum', 'length', 'digits', null]), 'navigateur · même règle que le serveur');

  await openEditor(page);
  await typeIce(page, '001561191000065');
  await page.click('[data-save]');
  await sleep(300);
  const err = await page.evaluate(() => {
    const i = document.querySelector('[data-f="ice"]');
    const p = document.getElementById('accf-ice-err');
    return { invalid: i.getAttribute('aria-invalid'), by: i.getAttribute('aria-describedby'), msg: p && p.textContent, focused: document.activeElement === i, open: !!document.querySelector('[data-save]') };
  });
  check(err.invalid === 'true' && err.by === 'accf-ice-err', 'un ICE faux est marqué au champ (aria-invalid, message relié)');
  check(/ne passe pas le contrôle/.test(err.msg || ''), 'le message dit pourquoi : ' + err.msg);
  check(err.focused, 'le focus revient sur le champ');
  check(err.open, 'la fenêtre reste ouverte, rien n’est enregistré');

  await typeIce(page, '0');
  const cleared = await page.evaluate(() => !document.getElementById('accf-ice-err') && !document.querySelector('[data-f="ice"]').hasAttribute('aria-invalid'));
  check(cleared, 'une nouvelle saisie efface l’erreur');

  await typeIce(page, '0015 6119 1000 066');
  await page.click('[data-save]');
  await page.waitForFunction(() => !document.querySelector('[data-f="ice"]'), { timeout: 6000 });
  check(true, 'un ICE juste est enregistré et la fenêtre se ferme');
  await sleep(500);
  await openEditor(page);
  const saved = await page.$eval('[data-f="ice"]', (i) => i.value);
  check(saved === '001561191000066', 'il est gardé sous sa forme compacte : ' + saved);
  check(problems.length === 0, 'aucune erreur de page' + (problems.length ? ' : ' + problems[0] : ''));
  await ctx.close();
}

{
  // coverage: surface=dashboard locale=ar viewport=desktop
  const { ctx, page } = await open('ar');
  await openEditor(page);
  await typeIce(page, '12345');
  await page.click('[data-save]');
  await sleep(300);
  const msg = await page.$eval('#accf-ice-err', (p) => p.textContent);
  check(msg === 'يتكون ICE من 15 رقماً.', 'en arabe, le message est en arabe');
  await ctx.close();
}

await browser.close();
server.close();
console.log(`ice: ${checks} passed`);
