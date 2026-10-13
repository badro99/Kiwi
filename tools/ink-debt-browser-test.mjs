#!/usr/bin/env node
/* Dette `background: var(--ink)` · ce qui se peint vraiment, pas ce qui est écrit.
 *
 * Dans les deux climats sombres (html[data-theme="dark"] hérité, et le skin
 * Vexel par défaut en mode sombre) --ink devient clair : un fond posé en
 * `background: var(--ink)` devient une dalle claire, et un texte clair posé
 * dessus disparaît. Le correctif durable est --inverse-surface / --inverse-ink
 * (tokens.css) ; cette suite le tient sur ce qui est affiché.
 *
 * Quatre climats (clair/sombre × skin Vexel/hérité), quatre surfaces
 * (Accueil, barre latérale, tiroir Commandes, Paramètres) :
 *   · en sombre, aucun élément dont le fond peint est clair (luminance > 0,6)
 *     ne porte un texte clair (luminance > 0,6) ;
 *   · en clair, les sélecteurs de dalles sombres corrigés gardent un fond
 *     sombre (un correctif de thème ne doit pas éclaircir le mode clair) ;
 *   · le tiroir Commandes n'a pas d'onglets (retirés le 2026-10-13).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('fixture has no service worker'); return; }
  if (pathname.startsWith('/api/')) {
    res.writeHead(pathname === '/api/me' ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(pathname === '/api/me' ? '{"authenticated":false}' : '{"error":"not-found"}');
    return;
  }
  const p = path.resolve(root, '.' + (pathname === '/' ? '/dashboard.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('ink-debt', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* Dalles sombres voulues dans les deux climats : chacune posait autrefois son
 * fond sur le jeton d'encre. Chaque sélecteur est instancié dans la page (la
 * vraie feuille de style s'applique) puis mesuré, qu'il soit à l'écran ou non :
 * en clair il doit rester une dalle sombre, en sombre il ne doit jamais porter
 * un texte clair sur fond clair. */
const DARK_SLABS = [
  '.menu-pill-cat.on', '.kds-stationhead', '.kds-push', '.b-promo-seg.on', '.calc', '.kx-pill.on', '.sc-pill.on', '.sc-prof-av.vip',
  '.ma-map-section', '.simple-btn', '.mode-tg button.on', '.help-bubble', '.ai-chat-card', '.btn-primary', '.card-dark',
  '.kx-filter-chip.on', '.fa-kpdisplay', '.kb.primary', '.kup-card.is-current .kup-badge', '.pl-qr', '.kiwi-st-chip.solid',
  '.kit-act-accept', '.demo-bar', '.sidebar', '.hai-tooltip', '.timeline-day.today', '.btn-slim.primary', '.drp-btn-go',
  '.cf-doc-pill.on', '.st-venue-pill.on', '.st-cat-pill.on', '.st-kpi-tip .st-tt', '.st-cell-var .st-tt',
];

/* Deux sélecteurs que les skins 2026 / Vexel repeignent en verre clair en mode
 * clair, par-dessus la règle de base : ce que la règle de base dit n'y est pas
 * ce qui s'affiche, donc pas de contrainte « reste sombre » en clair. */
const GLASS_IN_LIGHT = ['.sc-pill.on', '.timeline-day.today'];

/* Couleurs lues dans la page. Le navigateur rend `rgb()`/`rgba()` mais aussi
 * `color(srgb r g b / a)` (valeurs 0 à 1) pour un fond translucide : les deux
 * sont lues, puis les couches translucides sont composées du bas vers le haut. */
const PAGE_COLOR = `
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const parse = (s) => {
    s = s || '';
    const m = s.match(/-?[\\d.]+/g) || [];
    if (s.startsWith('color(')) return [Math.round(+m[0] * 255), Math.round(+m[1] * 255), Math.round(+m[2] * 255), m[3] === undefined ? 1 : +m[3]];
    return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]];
  };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const gradStop = (img) => { if (!img || img.indexOf('gradient(') < 0) return null; for (const c of img.match(/(?:rgba?|color)\\([^)]*\\)/g) || []) { const p = parse(c); if (p[3] >= 0.6) return p; } return null; };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  /* Fond effectif : les couches de la racine à l'élément, composées. */
  const effBg = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const g = gradStop(cs.backgroundImage);
      const p = g || parse(cs.backgroundColor);
      if (p[3] > 0.01) layers.push(p);
      if (p[3] >= 0.99) break;
    }
    let acc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
`;

/* Mesure dans la page : fond effectif clair sous un texte direct clair. */
function scan(helpers) {
  const { parse, lum, effBg } = new Function(helpers + 'return { parse, lum, effBg };')();
  const visible = (el, cs) => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const hasText = (el) => { for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; };
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const lightOnLight = [];
  let scanned = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (!visible(el, cs) || !hasText(el)) continue;
    const bg = effBg(el);
    scanned++;
    const fg = parse(cs.color);
    if (fg[3] > 0.5 && lum(bg) > 0.6 && lum(fg) > 0.6) lightOnLight.push(`${label(el)} bg=rgb(${bg.slice(0, 3).map(Math.round)}) fg=${cs.color} «${el.textContent.trim().slice(0, 24)}»`);
  }
  return { scanned, lightOnLight };
}

/* Instancie chaque sélecteur (« .a .b.c ») dans un conteneur hors mise en page
 * et lit ce qui se peint : fond effectif, texte, luminances. Une règle qui
 * n'existe pas encore (feuille injectée à l'ouverture d'un écran) laisse le
 * fond propre transparent : la dalle est alors `unstyled`, et ignorée. */
function probe(helpers, selectors) {
  const { parse, lum, effBg } = new Function(helpers + 'return { parse, lum, effBg };')();
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px';
  document.body.appendChild(host);
  const out = [];
  for (const sel of selectors) {
    let parent = host, leaf = null;
    for (const part of sel.split(/\s+/)) {
      const m = part.match(/^([a-z0-9]*)((?:\.[\w-]+)*)$/i);
      const el = document.createElement(m[1] || 'div');
      el.className = m[2].split('.').filter(Boolean).join(' ');
      parent.appendChild(el); parent = el; leaf = el;
    }
    leaf.textContent = 'Texte';
    const cs = getComputedStyle(leaf);
    const own = parse(cs.backgroundColor);
    const bg = effBg(leaf);
    const fg = parse(cs.color);
    out.push({ sel, own: cs.backgroundColor, ownAlpha: own[3], bg: `rgb(${bg.slice(0, 3).map(Math.round)})`, fg: cs.color, bgLum: lum(bg), fgLum: lum(fg), hasImage: cs.backgroundImage !== 'none' });
  }
  host.remove();
  return out;
}

const CLIMATES = [
  { name: 'clair · skin Vexel', dark: false, vexel: true },
  { name: 'clair · héritage', dark: false, vexel: false },
  { name: 'sombre · skin Vexel', dark: true, vexel: true },
  { name: 'sombre · héritage', dark: true, vexel: false },
];

async function open(t, ctx, climate) {
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width: 1440, height: 900 });
  page.setDefaultNavigationTimeout(90000);
  await page.evaluateOnNewDocument((c) => {
    try {
      localStorage.setItem('kiwiOnboarded', '1');
      localStorage.setItem('kiwiDashTheme', c.dark ? 'dark' : 'light');
      localStorage.setItem('kiwiDesignVexel', c.vexel ? '1' : '0');
    } catch (_) {}
  }, climate);
  t.step(`open dashboard · ${climate.name}`);
  await page.goto(`${base}/dashboard.html`, { waitUntil: 'load' });
  const skip = await page.waitForSelector('.kiwi-lock-skip', { visible: true, timeout: 8000 }).catch(() => null);
  if (skip) await skip.click();
  await page.waitForFunction(() => !document.querySelector('.app')?.classList.contains('kw-app-hidden'), { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('.sidebar nav a[data-nav="accueil"]', { timeout: 20000 });
  await sleep(800);
  const painted = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), vexel: document.body.classList.contains('design-vexel') }));
  check(climate.dark ? painted.theme === 'dark' : painted.theme !== 'dark', `${climate.name}: climat peint = ${painted.theme}`);
  check(painted.vexel === climate.vexel, `${climate.name}: skin Vexel ${climate.vexel ? 'actif' : 'coupé'}`);
  return page;
}

async function surfaces(t, page, climate, collect) {
  const run = async (label) => {
    t.step(`scan ${label} · ${climate.name}`);
    await sleep(500);
    collect(label, await page.evaluate(scan, PAGE_COLOR));
  };
  await run('Accueil');
  await page.click('.sidebar nav a[data-nav="transactions"]');
  await page.waitForFunction(() => document.body.classList.contains('page-genpage') && window.Kiwi?.activePage === 'transactions', { timeout: 15000 });
  await run('Commandes');
  const tabs = await page.evaluate(() => document.querySelectorAll('.tx-tab, [data-tx-tab], [data-tx-pane="rec"], [data-tx-pane="fra"]').length);
  check(tabs === 0, `${climate.name}: le tiroir Commandes n'a ni onglets ni panneaux Réconciliation / Anti-fraude`);
  await page.click('.sidebar nav a[data-nav="accueil"]');
  await page.waitForFunction(() => window.Kiwi?.activePage === 'accueil', { timeout: 15000 });
  await page.evaluate(() => window.Kiwi.handlers.settings && window.Kiwi.handlers.settings());
  await page.waitForFunction(() => window.Kiwi?.activePage === 'settings' || !!document.querySelector('.kiwi-modal, .kiwi-drawer, .dash-genpage'), { timeout: 15000 }).catch(() => {});
  await run('Paramètres');
}

try {
  for (const climate of CLIMATES) {
    await S.run(climate.name, async (t) => {
      const ctx = await browser.createBrowserContext();
      t.defer(() => ctx.close());
      const page = await open(t, ctx, climate);
      await surfaces(t, page, climate, (label, r) => {
        check(r.scanned > 20, `${climate.name} · ${label}: ${r.scanned} éléments à fond peint et texte mesurés`);
        if (climate.dark) {
          assert.deepEqual(r.lightOnLight.slice(0, 6), [], `${climate.name} · ${label}: texte clair sur fond clair`);
          console.log(`  ✓ ${climate.name} · ${label}: aucun texte clair sur fond clair`);
        }
      });
      t.step(`probe ${DARK_SLABS.length} dalles · ${climate.name}`);
      const slabs = await page.evaluate(probe, PAGE_COLOR, DARK_SLABS);
      if (process.env.INK_DUMP) fs.writeFileSync(`${process.env.INK_DUMP}-${climate.name.replace(/\W+/g, '_')}.json`, JSON.stringify(slabs, null, 1));
      /* Une dalle dont la règle n'est pas encore chargée (feuille injectée à
       * l'ouverture d'un écran) a un fond propre transparent : rien à mesurer. */
      const painted = slabs.filter((x) => x.ownAlpha > 0.05 || x.hasImage);
      check(painted.length >= 25, `${climate.name}: ${painted.length} dalles sur ${DARK_SLABS.length} ont un fond peint à mesurer`);
      if (climate.dark) {
        const bad = painted.filter((x) => x.bgLum > 0.6 && x.fgLum > 0.6).map((x) => `${x.sel} fond ${x.bg} texte ${x.fg}`);
        assert.deepEqual(bad, [], `${climate.name}: dalle claire sous un texte clair`);
        check(true, `${climate.name}: aucune des ${painted.length} dalles n'est claire sous un texte clair`);
      } else {
        const bad = painted.filter((x) => !GLASS_IN_LIGHT.includes(x.sel) && x.bgLum > 0.35).map((x) => `${x.sel} fond ${x.bg}`);
        assert.deepEqual(bad, [], `${climate.name}: une dalle sombre est devenue claire en mode clair`);
        check(true, `${climate.name}: les dalles mesurées restent sombres en mode clair`);
      }
    });
  }
} finally {
  server.close();
}
await S.finish();
