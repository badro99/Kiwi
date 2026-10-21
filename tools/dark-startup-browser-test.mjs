#!/usr/bin/env node
/* Garde : le démarrage du tableau de bord en sombre (2026-10-22).
 *
 * Les compteurs animés (animateNumber, assets/dateRange.js) réécrivaient leur
 * HTML à chaque image : de nouveaux éléments soixante fois par seconde, et en
 * sombre chacun repassait par dark-fixes.js. Mesuré sur la démo : 2 372 passes
 * de contraste au démarrage, environ 1 s de fil principal pour dark-fixes et
 * 0,9 s de plus pour dateRange. Les chiffres sont maintenant mis à jour sur
 * place (paintNumber) tant que la forme du HTML ne change pas.
 *
 *  1 · un démarrage en sombre ne recrée plus les éléments des compteurs ;
 *  2 · les compteurs animés finissent sur les mêmes valeurs que sans animation ;
 *  3 · paintNumber (le vrai code, extrait du fichier) ne laisse jamais un
 *      chiffre périmé : réécriture par un autre code, « … », étiquette sombre.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  const p = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = suite('dark-startup', { browser });

async function dashboard(t, { reducedMotion = false, theme = 'dark' } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1440, height: 900 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await pinTradingHour(page, 15);
  await page.evaluateOnNewDocument((theme) => {
    try { localStorage.setItem('kiwiDashTheme', theme); localStorage.setItem('kiwiTheme', theme); } catch (_) {}
    /* Compte les éléments de compteur créés pendant le démarrage. */
    window.__counterSpans = 0;
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        const hit = (x) => x.matches && x.matches('.rev-hero-cur, .cents');
        if (hit(n)) window.__counterSpans++;
        if (n.querySelectorAll) window.__counterSpans += n.querySelectorAll('.rev-hero-cur, .cents').length;
      }
    }).observe(document, { childList: true, subtree: true });
  }, theme);
  t.step('open dashboard (' + theme + (reducedMotion ? ', reduced motion' : '') + ')');
  await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
  await page.waitForFunction((th) => (document.documentElement.getAttribute('data-theme') || 'light') === th, { timeout: 15000 }, theme);
  await sleep(4000);
  return page;
}

const readCounters = (page) => page.evaluate(() => [...document.querySelectorAll('[data-rev-hero-val], [data-kpi-val], .kpi-v, .rev-hero-amt')]
  .map((el) => el.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));

/* Le temps de recalcul des styles, sombre contre clair, dans la même exécution :
 * indépendant de la vitesse de la machine. Mesuré le 2026-10-22 : 7,9 fois plus
 * en sombre avant (2,9 s contre 0,37 s), 2 fois après (0,39 s contre 0,20 s). */
await S.run('a dark start restyles the page about as often as a light one', async (t) => {
  const recalc = async (theme) => { const page = await dashboard(t, { theme }); return (await page.metrics()).RecalcStyleDuration * 1000; };
  const light = await recalc('light');
  const dark = await recalc('dark');
  const limit = Math.max(3.5 * light, light + 400);
  if (dark > limit) throw new Error(`style recalc in dark ${Math.round(dark)} ms vs light ${Math.round(light)} ms (limit ${Math.round(limit)} ms)`);
  console.log(`  ✓ style recalc: dark ${Math.round(dark)} ms, light ${Math.round(light)} ms`);
});

await S.run('a dark start does not rebuild the counters every frame', async (t) => {
  const page = await dashboard(t);
  const spans = await page.evaluate(() => window.__counterSpans);
  /* Avant : plusieurs centaines (une paire d'éléments par image et par compteur). */
  if (spans > 40) throw new Error(`counter elements created during a dark start: ${spans}, expected at most 40`);
  console.log(`  ✓ counter elements created during a dark start: ${spans}`);
});

await S.run('animated counters end on the same values as without animation', async (t) => {
  const animated = await readCounters(await dashboard(t));
  const still = await readCounters(await dashboard(t, { reducedMotion: true }));
  if (!animated.length) throw new Error('no counter found on the dashboard');
  if (JSON.stringify(animated) !== JSON.stringify(still)) {
    throw new Error('counters differ\n animated: ' + animated.slice(0, 6).join(' / ') + '\n still:    ' + still.slice(0, 6).join(' / '));
  }
  console.log(`  ✓ ${animated.length} counters match with and without animation`);
});

await S.run('paintNumber never leaves a stale figure', async (t) => {
  const src = fs.readFileSync(path.join(root, 'assets/dateRange.js'), 'utf8');
  const a = src.indexOf('  const numberShape = ');
  const b = src.indexOf('  function animateNumber(el, from, to');
  if (a < 0 || b < 0) throw new Error('paintNumber not found in assets/dateRange.js');
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setContent('<!doctype html><html><body></body></html>');
  const out = await page.evaluate((code) => {
    const paintNumber = new Function(code + '\nreturn paintNumber;')();
    const el = document.createElement('div');
    document.body.appendChild(el);
    const r = {};
    paintNumber(el, '1 200<span class="cur">MAD</span>');
    const span = el.querySelector('span');
    const text = el.firstChild;
    paintNumber(el, '1 350<span class="cur">MAD</span>');
    r.inPlace = el.querySelector('span') === span && el.firstChild === text;
    r.afterInPlace = el.textContent;
    /* Une étiquette sombre posée par dark-fixes ne casse pas la réutilisation. */
    span.classList.add('dkfix-text');
    paintNumber(el, '1 400<span class="cur">MAD</span>');
    r.keptTag = el.querySelector('span') === span && span.classList.contains('dkfix-text');
    r.afterTag = el.textContent;
    /* Un autre code réécrit le compteur directement, puis l'animation reprend. */
    el.innerHTML = '9<span class="cur">MAD</span>';
    paintNumber(el, '1 400<span class="cur">MAD</span>');
    r.afterForeign = el.textContent;
    /* Le chargement du registre écrit « … ». */
    el.textContent = '…';
    paintNumber(el, '1 400<span class="cur">MAD</span>');
    r.afterPlaceholder = el.textContent;
    /* La forme change (un signe en plus) : réécriture complète, valeur juste. */
    paintNumber(el, '<b>−</b>12<span class="cur">MAD</span>');
    r.afterShape = el.textContent;
    return r;
  }, src.slice(a, b));
  const expect = { inPlace: true, afterInPlace: '1 350MAD', keptTag: true, afterTag: '1 400MAD', afterForeign: '1 400MAD', afterPlaceholder: '1 400MAD', afterShape: '−12MAD' };
  for (const [k, v] of Object.entries(expect)) {
    if (out[k] !== v) throw new Error(`${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(out[k])}`);
  }
  console.log('  ✓ digits update in place; foreign rewrites, placeholders and shape changes always repaint');
});

server.close();
await S.finish();
