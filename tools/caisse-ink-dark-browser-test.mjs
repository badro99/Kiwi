#!/usr/bin/env node
/* Caisse en mode nuit · les boutons posés sur `background: var(--ink)`.
 *
 * Dans kiwi-caisse.html, html[data-caisse-theme="dark"] retourne --ink en clair
 * (#F2F5F3). Un bouton qui garde un texte blanc fixe sur ce fond tombe à 1,1:1 :
 * « Payer par carte » (part d'une addition scindée) et « Message à toute
 * l'équipe » avaient ce défaut, le garde-fou de check.js ne regardant que le
 * dashboard et les feuilles partagées. Cette suite instancie chaque bouton
 * « encre » de la caisse avec les vraies feuilles de style et mesure le
 * contraste réel du texte sur son fond, nuit et jour : au moins 4,5:1.
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
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('fixture has no service worker'); return; }
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
  const p = path.resolve(root, '.' + (pathname === '/' ? '/kiwi-caisse.html' : pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('caisse-ink-dark', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* Chaque bouton « encre » de la caisse : { parent, tag, id, cls }. Les trois
 * premiers peignent --ink en fond avec un texte blanc ; .cat-pill.is-active est
 * repeint par caisse-skin.css, le contrôle garde ce repeint honnête. */
const INK_BUTTONS = [
  { label: '.split-part-btn.carte', tag: 'button', cls: 'split-part-btn carte' },
  { label: '.team-broadcast button', parent: 'team-broadcast', tag: 'button' },
  { label: '#pay-card.pay-icon', tag: 'button', id: 'pay-card', cls: 'pay-icon' },
  { label: '.cat-pill.is-active', tag: 'button', cls: 'cat-pill is-active' },
];

function measure(buttons) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const parse = (s) => {
    s = s || '';
    const m = s.match(/-?[\d.]+/g) || [];
    if (s.startsWith('color(')) return [Math.round(+m[0] * 255), Math.round(+m[1] * 255), Math.round(+m[2] * 255), m[3] === undefined ? 1 : +m[3]];
    return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]];
  };
  const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const effBg = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (p[3] > 0.01) layers.push(p);
      if (p[3] >= 0.99) break;
    }
    let acc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px';
  document.body.appendChild(host);
  const out = [];
  for (const b of buttons) {
    let parent = host;
    if (b.parent) { const p = document.createElement('div'); p.className = b.parent; host.appendChild(p); parent = p; }
    const el = document.createElement(b.tag);
    if (b.id) el.id = b.id;
    if (b.cls) el.className = b.cls;
    el.textContent = 'Texte';
    parent.appendChild(el);
    const cs = getComputedStyle(el);
    const bg = effBg(el), fg = parse(cs.color);
    const hi = Math.max(lum(bg), lum(fg)), lo = Math.min(lum(bg), lum(fg));
    out.push({ label: b.label, ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, bg: bg.slice(0, 3).map(Math.round).join(','), fg: cs.color });
  }
  host.remove();
  return out;
}

try {
  for (const dark of [true, false]) {
    await S.run(dark ? 'nuit' : 'jour', async (t) => {
      const ctx = await browser.createBrowserContext();
      t.defer(() => ctx.close());
      const page = t.watch(await ctx.newPage());
      await page.setViewport({ width: 1280, height: 800 });
      page.setDefaultNavigationTimeout(90000);
      await page.evaluateOnNewDocument((d) => { try { if (d) localStorage.setItem('kiwiCaisseTheme', 'dark'); else localStorage.removeItem('kiwiCaisseTheme'); } catch (_) {} }, dark);
      t.step(`open caisse · ${dark ? 'nuit' : 'jour'}`);
      // coverage: surface=caisse-entry locale=fr viewport=desktop
      await page.goto(`${base}/kiwi-caisse.html`, { waitUntil: 'load' });
      await sleep(2500);
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-caisse-theme'));
      check(dark ? theme === 'dark' : theme !== 'dark', `thème peint : ${theme || 'jour'}`);
      t.step('measure ink buttons');
      const res = await page.evaluate(measure, INK_BUTTONS);
      for (const r of res) {
        assert.ok(r.ratio >= 4.5, `${dark ? 'nuit' : 'jour'} · ${r.label} : texte ${r.fg} sur fond rgb(${r.bg}) = ${r.ratio}:1, il faut au moins 4,5:1`);
        console.log(`  ✓ ${dark ? 'nuit' : 'jour'} · ${r.label} : ${r.ratio}:1`);
      }
    });
  }
} finally {
  server.close();
}
await S.finish();
