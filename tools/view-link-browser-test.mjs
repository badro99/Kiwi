#!/usr/bin/env node
/* Lien de vue (assets/view-link.js) dans le vrai dashboard.html, au vrai clic.
 *
 *   · ouvrir une page de la barre latérale l'écrit dans l'adresse
 *     (#/<page>?r=<période>), changer de période aussi, revenir à l'accueil
 *     l'efface ;
 *   · une adresse #/<page>?r=<période> rouvre cette page sur cette période,
 *     dans un navigateur neuf, et l'accueil qui se peint au démarrage ne
 *     l'efface pas ;
 *   · une adresse inconnue ou malformée est ignorée, sans erreur ;
 *   · le bouton « copier le lien » n'existe que sur une page, copie l'adresse
 *     exacte, et parle la langue de l'interface ;
 *   · aucun chiffre ni nom n'entre dans l'adresse. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
/* /dashboard sert l'écran de connexion du vrai gate (functions/_middleware.js),
 * pour vérifier qu'un lien reçu avant connexion survit à la connexion. */
const gate = await import(pathToFileURL(path.join(root, 'functions/_middleware.js')).href);
const server = http.createServer(async (req, res) => {
  if (new URL(req.url, 'http://local').pathname === '/dashboard') {
    const r = await gate.onRequest({ request: new Request('http://127.0.0.1' + req.url), env: { AUTH_SECRET: 'test-secret-not-real' }, next: () => new Response('next'), waitUntil() {} });
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(await r.text()); return;
  }
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(hash = '', lang = 'fr') {
  const ctx = await browser.createBrowserContext();
  await ctx.overridePermissions(base, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewport({ width: 1366, height: 900 });
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
    try { localStorage.setItem('kiwiLang', lang); localStorage.setItem('kiwiDateRange', 'septJours'); } catch (_) {}
  }, lang);
  // coverage: surface=dashboard locale=fr viewport=desktop
  // coverage: surface=dashboard locale=ar viewport=desktop
  await page.goto(base + '/dashboard.html' + hash, { waitUntil: 'load' });
  await page.waitForFunction(() => document.readyState === 'complete' && window.KiwiViewLink && window.Kiwi && window.Kiwi.handlers, { timeout: 20000 });
  await sleep(1200);
  /* Les boutons d'accueil de la démo ramènent à l'accueil : on ne les touche
   * que sans lien, sinon le test défait ce qu'il vérifie. */
  if (hash) return { ctx, page, problems };
  const explore = await page.$('.kob-root [data-explore]');
  if (explore) { await explore.click(); await sleep(900); }
  const skip = await page.$('[data-kiwi-skip]');
  if (skip) { await skip.click(); await sleep(600); }
  return { ctx, page, problems };
}
const state = (page) => page.evaluate(() => ({ hash: location.hash, active: window.Kiwi.activePage, range: window.KiwiDateRange.getDateRange(), btn: (() => { const b = document.querySelector('.view-link-btn'); return b ? { hidden: b.hidden, label: b.getAttribute('aria-label'), svg: !!b.querySelector('svg') } : null; })() }));

{
  // coverage: surface=dashboard locale=fr viewport=desktop
  const { ctx, page, problems } = await open();
  let s = await state(page);
  check(s.hash === '' && s.btn && s.btn.hidden, 'on the dashboard the address carries nothing and the copy button is hidden');

  await page.click('.sidebar nav a[data-nav="equipe"]');
  await sleep(900);
  s = await state(page);
  check(s.active === 'equipe' && s.hash === '#/equipe?r=septJours', `opening Équipe writes it in the address (${s.hash})`);
  check(s.btn && !s.btn.hidden && s.btn.svg && s.btn.label === 'Copier le lien de cette vue', 'the copy button appears, with a Material icon and a French label');

  await page.evaluate(() => window.KiwiDateRange.setDateRange('trenteJours'));
  await sleep(300);
  s = await state(page);
  check(s.hash === '#/equipe?r=trenteJours', `changing the period updates the address (${s.hash})`);

  await page.click('.view-link-btn');
  await sleep(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip === base + '/dashboard.html#/equipe?r=trenteJours', `the button copies the exact address (${clip})`);
  check(/^[\x21-\x7e]+$/.test(clip) && !/MAD|\d{3,}(?!\d*$)/.test(clip.replace(base, '')), 'the address holds identifiers only, no figure, no name');
  const toast = await page.evaluate(() => document.body.innerText.includes('Lien copié'));
  check(toast, 'a toast confirms the copy');

  await page.click('.sidebar nav a[data-nav="accueil"]');
  await sleep(700);
  s = await state(page);
  check(s.hash === '' && s.active === 'accueil' && s.btn.hidden, 'back to the dashboard, the address is clean again and the button hides');
  check(problems.length === 0, 'no page error' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}

{
  // coverage: surface=dashboard-equipe locale=fr viewport=desktop
  const { ctx, page, problems } = await open('#/equipe?r=trenteJours');
  await page.waitForFunction(() => window.Kiwi.activePage === 'equipe', { timeout: 15000 }).catch(() => {});
  await sleep(800);
  const s = await state(page);
  check(s.active === 'equipe', 'a link opens its page in a fresh browser');
  check(s.range === 'trenteJours', 'and its period, over the one the browser had saved');
  check(s.hash === '#/equipe?r=trenteJours', 'the dashboard painting first does not erase the address');
  check(problems.length === 0, 'no page error on restore' + (problems.length ? ': ' + problems[0] : ''));
  await ctx.close();
}

for (const bad of ['#/../../etc?r=x', '#/nopage-here?r=septJours', '#/equipe?r=<script>', '#garbage']) {
  // coverage: surface=dashboard locale=fr viewport=desktop
  const { ctx, page, problems } = await open(bad);
  await sleep(bad.startsWith('#/nopage') ? 4500 : 1500);
  const s = await state(page);
  const ok = bad === '#/nopage-here?r=septJours' ? (s.active === 'accueil' && s.hash === '') : bad === '#/equipe?r=<script>' ? (s.active === 'equipe' && s.range === 'septJours' && s.hash === '#/equipe?r=septJours') : s.active === 'accueil';
  check(ok && problems.length === 0, `a malformed or unknown address is ignored, not guessed (${bad} → ${s.active}, ${s.hash || 'no hash'})`);
  await ctx.close();
}

{
  // coverage: surface=dashboard locale=ar viewport=desktop
  const { ctx, page } = await open('', 'ar');
  await page.click('.sidebar nav a[data-nav="equipe"]');
  await sleep(900);
  const s = await state(page);
  check(s.btn.label === 'نسخ رابط هذه الصفحة', 'in Arabic the button speaks Arabic');
  await ctx.close();
}

{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url().endsWith('/auth/login')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    return r.url().startsWith(base) ? r.continue() : r.abort();
  });
  for (const [hash, kept] of [['#/finance?r=trenteJours', true], ['#/finance?r=x"><img', false], ['#elsewhere', false]]) {
    await page.goto(base + '/dashboard' + hash, { waitUntil: 'load' });
    await page.waitForSelector('#li-email');
    await page.type('#li-email', 'test@example.test');
    await page.type('#li-pass', 'not-a-real-password');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#form-login .go')]);
    const u = new URL(page.url());
    check(kept ? u.pathname === '/dashboard' && u.hash === hash : u.hash === '', `sign-in ${kept ? 'keeps' : 'drops'} ${hash} (${u.pathname}${u.search}${u.hash})`);
  }
  await ctx.close();
}

await browser.close();
server.close();
console.log(`view-link: ${checks} passed`);
