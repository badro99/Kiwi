#!/usr/bin/env node
/* Captures d'écran des pages Fonctionnalités (kiwi-os.com/fr/fonctionnalites/).
 *
 *   node tools/capture-feature-shots.mjs                 (tout, FR EN AR)
 *   node tools/capture-feature-shots.mjs caisse-carnet   (une seule scène)
 *   node tools/capture-feature-shots.mjs --og            (les images de partage seulement)
 *
 * Outil manuel, pas un test : il réécrit assets/features/*.webp et
 * assets/features/og-*.png. Chaque image vient des surfaces de DÉMO livrées
 * (caisse démo, tableau de bord démo, commande QR de Café Atlas), jamais d'un
 * compte marchand : /api répond 503, aucune requête ne sort de la machine, et
 * l'horloge est figée à 15 h (tools/demo-clock.mjs) pour que « aujourd'hui »
 * ne dépende pas de l'heure de la capture.
 *
 * Les captures sont prises en 2x puis compressées en WebP par cwebp, en
 * baissant la qualité jusqu'à passer sous 120 Ko. Les images de partage
 * (1200 × 630) suivent la règle des guides : PNG en palette de 256 couleurs,
 * sous 200 Ko, pour que WhatsApp affiche l'aperçu (commit 973b6fa31).
 *
 * Aucun média tiers : la carte démo de Café Atlas joue des clips repris
 * d'autres créateurs (assets/media/menu-demo/, filigranes visibles). Ils ne
 * vont pas sur une page de vente. La capture sert donc
 * assets/orderpro-demo.js sans ses champs `video` (sans toucher au fichier) :
 * OrderPro rend alors sa propre illustration de repli, comme pour Noss-noss.
 * Toute requête vers assets/media/ est en plus refusée, et chaque capture liste
 * les images qu'elle a chargées pour qu'on puisse les relire.
 *
 * Il faut puppeteer-core (npm --prefix app ci), Chrome, cwebp et python3 avec
 * Pillow. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pinTradingHour } from './demo-clock.mjs';
import { FEATURE_PAGES, FEATURE_HUB, FEATURE_LOCALES } from '../content/features/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'features');
const MAX_BYTES = 120 * 1024;
const args = process.argv.slice(2);
const OG_ONLY = args.includes('--og');
const only = args.filter((a) => !a.startsWith('--'));
const req = createRequire(path.join(ROOT, 'app/package.json'));
const puppeteer = req('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-feature-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4' };
const server = http.createServer((rq, res) => {
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  let file = path.resolve(ROOT, '.' + pathname);
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });

const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844, mobile: true };

async function open(url, storage, { width, height, mobile = false }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.ctx = ctx;
  await pinTradingHour(page);
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile });
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }]);
  await page.setRequestInterception(true);
  page.media = new Set();
  page.on('request', (r) => {
    const u = r.url();
    if (['image', 'media'].includes(r.resourceType()) && u.startsWith(base)) page.media.add(decodeURI(new URL(u).pathname));
    if (u.startsWith(base + '/assets/media/')) return r.abort();
    if (new URL(u).pathname === '/assets/orderpro-demo.js') {
      const body = fs.readFileSync(path.join(ROOT, 'assets', 'orderpro-demo.js'), 'utf8').replace(/video: MEDIA \+ '[^']+',?\s*/g, '');
      if (/video:/.test(body)) throw new Error('orderpro-demo.js : un clip de démo reste dans la carte capturée');
      return r.respond({ status: 200, contentType: 'text/javascript', body });
    }
    if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(base) || u.startsWith('data:') || u.startsWith('blob:') ? r.continue() : r.abort();
  });
  page.on('pageerror', (e) => console.log('    page error:', String(e.message).slice(0, 140)));
  await page.evaluateOnNewDocument((items) => {
    Object.entries(items).forEach(([k, v]) => localStorage.setItem(k, v));
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, storage);
  await page.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  return page;
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await sleep(500);
}

/* PNG 2x → WebP sous 120 Ko : la qualité baisse par paliers ; si elle tombe
 * sous 55 sans passer, l'image est réduite à 1,5x. */
function toWebp(png, name) {
  const target = path.join(OUT, name + '.webp');
  for (const scale of [1, 0.75]) {
    for (const q of [78, 72, 66, 60, 55]) {
      const resize = scale === 1 ? [] : ['-resize', String(Math.round(dims(png).w * scale)), '0'];
      const r = spawnSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv', ...resize, png, '-o', target]);
      if (r.status !== 0) throw new Error('cwebp failed for ' + name + ': ' + r.stderr);
      const size = fs.statSync(target).size;
      if (size <= MAX_BYTES) { console.log(`  ✓ ${name}.webp ${Math.round(size / 1024)} Ko (q${q}${scale === 1 ? '' : ', 1,5x'})`); return; }
    }
  }
  throw new Error(name + '.webp reste au-dessus de 120 Ko');
}
function dims(png) {
  const b = fs.readFileSync(png);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
async function shoot(page, name) {
  await settle(page);
  const png = path.join(TMP, name + '.png');
  const clips = await page.evaluate(() => document.querySelectorAll('.dish-media video, .dish-media img, video[src], video[poster]').length);
  if (clips) throw new Error(`${name} : ${clips} média(s) de plat encore à l'écran`);
  await page.screenshot({ path: png });
  toWebp(png, name);
  const images = [...page.media].filter((p) => !/^\/assets\/(icons|landing|kit)\//.test(p) && !p.endsWith('.svg'));
  if (images.length) console.log(`    images chargées : ${images.join(', ')}`);
  await page.ctx.close();
}

const lang = (locale) => ({ kiwiLang: locale, kiwiCaisseLang: locale, orderProLang: locale });
const DEMO_DASH = (locale) => ({ kiwiSkin2027: '1', 'kiwiSkin2027:dashboard': '1', kiwiSkipOnboard: '1', ...lang(locale) });

async function till(locale, vertical) {
  const page = await open('/kiwi-caisse.html', lang(locale), DESK);
  await page.waitForFunction(() => !!window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(600);
  if (vertical) {
    await page.evaluate((v) => window.KiwiPosDispatch.unlockById(v), vertical);
    await page.waitForSelector('#pos-' + vertical + '.is-on, [data-ep-view]', { visible: true, timeout: 20000 });
    await sleep(1200);
  }
  return page;
}
const clickText = (page, scope, texts) => page.evaluate((s, list) => {
  const hits = [];
  for (const t of list) {
    const leaf = [...document.querySelectorAll(s + ' *')].find((e) => e.children.length === 0 && e.textContent.trim() === t && e.getBoundingClientRect().width);
    const target = leaf && (leaf.closest('button, [role="button"], [data-id], [data-item], [data-pid]') || leaf);
    if (target) { target.click(); hits.push(t); }
  }
  return hits;
}, scope, texts);

async function dashboard(locale) {
  const page = await open('/dashboard.html', DEMO_DASH(locale), { width: 1440, height: 900 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d|استكشف/.test(x.textContent)); if (b) b.click(); });
  await sleep(800);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
  await sleep(1200);
  return page;
}

async function orderpro(locale) {
  const page = await open('/OrderPro.html?s=demo', lang(locale), PHONE);
  await page.waitForSelector('#screen-mode.is-active', { timeout: 15000 });
  await sleep(2600);
  await page.click('[data-mode="takeout"]');
  await page.waitForSelector('#screen-menu.is-active [data-add="cappuccino"]', { timeout: 15000 });
  await sleep(900);
  return page;
}

/* Une scène = une capture, rejouée dans chaque langue. */
const SCENES = {
  'caisse-restaurant': async (locale) => {
    const page = await till(locale);
    await page.waitForFunction(() => typeof doOpenService === 'function', { timeout: 30000 });
    await page.evaluate(() => doOpenService());
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await sleep(1000);
    for (const id of ['takeaway']) await page.evaluate((x) => { const b = document.querySelector(`[data-id="${x}"]`); if (b) b.click(); }, id);
    await sleep(500);
    /* Trois plats à emporter : une salade, deux harira, un tajine. */
    await page.evaluate(async () => {
      /* La grille se redessine à chaque ajout : on relit les tuiles à chaque fois. */
      const tiles = () => [...document.querySelectorAll('.menu-grid .menu-item[data-menu-id]')].filter((t) => t.getBoundingClientRect().width);
      for (const i of [0, 2, 2, 6]) { const t = tiles()[i]; if (t) { t.click(); await new Promise((r) => setTimeout(r, 500)); } }
    });
    await sleep(800);
    await shoot(page, `caisse-restaurant-${locale}`);
  },
  'caisse-ouverture': async (locale) => {
    const page = await till(locale);
    await page.waitForSelector('#clockin-btn', { visible: true, timeout: 20000 });
    await sleep(900);
    await shoot(page, `caisse-ouverture-${locale}`);
  },
  'caisse-boutique': async (locale) => {
    const page = await till(locale, 'boutique');
    await shoot(page, `caisse-boutique-${locale}`);
  },
  'caisse-carnet': async (locale) => {
    const page = await till(locale, 'epicerie');
    await page.evaluate(() => document.querySelector('[data-ep-view="carnet"]').click());
    await page.waitForSelector('[data-ep-ard="k1"]', { timeout: 8000 });
    await shoot(page, `caisse-carnet-${locale}`);
  },
  'caisse-journee': async (locale) => {
    const page = await till(locale, 'epicerie');
    await page.evaluate(() => document.querySelector('[data-ep-view="journee"]').click());
    await sleep(1200);
    await shoot(page, `caisse-journee-${locale}`);
  },
  'stock-tableau': async (locale) => {
    const page = await dashboard(locale);
    await page.evaluate(() => { location.hash = '#/stock'; });
    await sleep(2600);
    await shoot(page, `stock-tableau-${locale}`);
  },
  'stock-inventaire': async (locale) => {
    const page = await till(locale, 'boutique');
    await page.evaluate(() => document.querySelector('#bq-nav .bq-nav-it[data-bq-view="inventaire"]').click());
    await sleep(1400);
    await shoot(page, `stock-inventaire-${locale}`);
  },
  'stock-variantes': async (locale) => {
    const page = await till(locale, 'boutique');
    /* La fiche du deuxième caftan : stock par taille, couleurs, remise. */
    await page.evaluate(() => { const c = [...document.querySelectorAll('#pos-boutique [data-pid], #pos-boutique .bq-card')].filter((x) => x.getBoundingClientRect().width); if (c[1]) c[1].click(); });
    await sleep(1400);
    await shoot(page, `stock-variantes-${locale}`);
  },
  'stock-reassort': async (locale) => {
    const page = await till(locale, 'epicerie');
    await page.evaluate(() => document.querySelector('[data-ep-view="stock"]').click());
    await sleep(1200);
    await shoot(page, `stock-reassort-${locale}`);
  },
  'orderpro-menu': async (locale) => {
    const page = await orderpro(locale);
    await shoot(page, `orderpro-menu-${locale}`);
  },
  'orderpro-options': async (locale) => {
    const page = await orderpro(locale);
    await page.tap('[data-add="cappuccino"]');
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 5000 });
    await sleep(900);
    await shoot(page, `orderpro-options-${locale}`);
  },
  'orderpro-panier': async (locale) => {
    const page = await orderpro(locale);
    await page.tap('[data-add="cappuccino"]');
    await page.waitForSelector('#custom-sheet.is-open', { timeout: 5000 });
    await page.evaluate(() => document.getElementById('custom-add-btn').click());
    await page.waitForFunction(() => !document.querySelector('#custom-sheet.is-open'), { timeout: 5000 });
    await sleep(500);
    await page.evaluate(() => document.querySelector('[data-add="sparkling"]').click());
    await sleep(800);
    await sleep(600);
    await page.evaluate(() => document.getElementById('cart-pill').click());
    await page.waitForSelector('#cart-sheet.is-open', { timeout: 5000 });
    await sleep(900);
    await shoot(page, `orderpro-panier-${locale}`);
  },
};

if (!OG_ONLY) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, scene] of Object.entries(SCENES)) {
    if (only.length && !only.includes(name)) continue;
    for (const locale of FEATURE_LOCALES) {
      try { await scene(locale); } catch (error) { console.log(`  ✗ ${name}-${locale}: ${error.message.split('\n')[0]}`); }
    }
  }
}

/* Images de partage 1200 × 630 : titre de la page et une capture du produit,
 * sur le fond des guides. */
async function ogImage(entry, locale) {
  const page = entry.pages[locale];
  const shotFile = path.join(OUT, entry.og.shot.replace('{locale}', locale) + '.webp');
  const shot = 'data:image/webp;base64,' + fs.readFileSync(shotFile).toString('base64');
  const rtl = locale === 'ar';
  const phone = entry.og.phone;
  const html = `<!doctype html><html lang="${locale}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<link rel="stylesheet" href="${base}/assets/fonts/legacy-faces.css"><style>
@font-face{font-family:"Inter Tight";src:url("${base}/assets/fonts/inter-tight-latin.woff2") format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0}html,body{width:1200px;height:630px;overflow:hidden}
body{background:radial-gradient(900px 520px at ${rtl ? '15%' : '85%'} 20%,#0B4D38 0%,#06231a 45%,#050706 80%);color:#F2F5F3;font-family:${rtl ? '"IBM Plex Sans Arabic",' : ''}"Inter Tight",system-ui,sans-serif;position:relative}
.copy{position:absolute;top:64px;${rtl ? 'right' : 'left'}:72px;width:${phone ? 640 : 520}px}
.eyebrow{display:flex;align-items:center;gap:12px;font-size:20px;letter-spacing:${rtl ? '0' : '.08em'};text-transform:uppercase;color:#7DF2B0}
.eyebrow i{width:12px;height:12px;border-radius:50%;background:#7DF2B0}
h1{margin-top:34px;font-size:${rtl ? 54 : 58}px;line-height:1.12;font-weight:400;letter-spacing:${rtl ? '0' : '-.03em'}}
h1 b{font-weight:400;color:#7DF2B0}
.foot{position:absolute;bottom:56px;${rtl ? 'right' : 'left'}:72px;font-size:22px;color:rgba(242,245,243,.75)}
.shot{position:absolute;${rtl ? 'left' : 'right'}:${phone ? 96 : -40}px;top:${phone ? 60 : 110}px;border-radius:${phone ? 38 : 18}px;overflow:hidden;border:1px solid rgba(242,245,243,.18);box-shadow:0 30px 80px rgba(0,0,0,.55)}
.shot img{display:block;${phone ? 'width:300px' : 'width:640px'}}
</style></head><body><div class="copy"><div class="eyebrow"><i></i>${entry.og.eyebrow[locale]}</div><h1>${entry.og.title[locale]}</h1></div>
<div class="foot">${entry.og.foot[locale]}</div><div class="shot"><img src="${shot}" alt=""></div></body></html>`;
  const tab = await browser.newPage();
  await tab.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await tab.setContent(html, { waitUntil: 'load' });
  await tab.evaluate(async () => { await document.fonts.ready; });
  await sleep(300);
  const raw = path.join(TMP, `og-${entry.id}-${locale}.png`);
  await tab.screenshot({ path: raw });
  await tab.close();
  const target = path.join(ROOT, page.image);
  const py = spawnSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB").quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[2], optimize=True)', raw, target], { encoding: 'utf8' });
  if (py.status !== 0) throw new Error('quantize failed: ' + py.stderr);
  const size = fs.statSync(target).size;
  if (size > 200 * 1024) throw new Error(`${page.image} pèse ${Math.round(size / 1024)} Ko (> 200)`);
  console.log(`  ✓ ${page.image} ${Math.round(size / 1024)} Ko`);
}
if (!only.length || OG_ONLY) {
  for (const entry of [FEATURE_HUB, ...FEATURE_PAGES]) {
    for (const locale of FEATURE_LOCALES) {
      try { await ogImage(entry, locale); } catch (error) { console.log(`  ✗ og ${entry.id}-${locale}: ${error.message}`); }
    }
  }
}

await browser.close();
server.close();
fs.rmSync(TMP, { recursive: true, force: true });
