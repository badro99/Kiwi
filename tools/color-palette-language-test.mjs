#!/usr/bin/env node
/* Couleurs · le nom se LIT dans la langue de l'écran, il s'ENREGISTRE en
 * français. Conduit dans un vrai navigateur sur assets/color-palette.js tel
 * qu'il est livré, puis contrôle les points d'appel du tableau de bord.
 *
 * 2026-10-12. Sous EN et AR, le sélecteur de couleurs de la fiche produit
 * disait « Noir », « Bleu », « Couleur personnalisée #4A67D6 », « Plus de
 * couleurs », « Choisir », et sa légende demandait à un téléphone de
 * « survoler » une pastille, ce qu'aucun doigt ne fait. La palette portait
 * pourtant déjà ses noms anglais et arabes ; personne ne les lisait.
 */
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import pagesProSource from './pages-pro-test-source.cjs'; // pages-pro.js en quatre fichiers depuis le 22 octobre 2026

const root = process.env.KIWI_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
assert.ok(bin, 'Chromium required for the colour picker');

const page = (lang) => `<!doctype html><html lang="${lang}"${lang === 'ar' ? ' dir="rtl"' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#F7F5F0"><div id="host"></div>
<script src="/assets/color-palette.js"></script>
<script>
window.__changes = [];
document.getElementById('host').innerHTML = KiwiColors.picker('bqx-color', 'noir', { optional: true, custom: true });
document.addEventListener('kc:change', (e) => __changes.push(e.detail));
</script></body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(page(u.searchParams.get('lang') || 'fr')); return; }
  const f = path.join(root, decodeURIComponent(u.pathname));
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', 'text/javascript');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await puppeteer.launch({executablePath: bin, headless: true, args: ['--no-sandbox']});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open(lang, viewport = {width: 1024, height: 700}) {
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(viewport);
  await p.goto(base + '?lang=' + lang);
  await p.waitForSelector('[data-kc-picker]');
  return {ctx, p};
}
const attr = (p, sel, a) => p.$eval(sel, (e, a) => e.getAttribute(a), a);

try {
  /* A · anglais, bureau */
  {
    const {ctx, p} = await open('en');
    check(await attr(p, '[data-kc-color="noir"]', 'title') === 'Black' && await attr(p, '[data-kc-color="bleu"]', 'aria-label') === 'Blue', 'swatches are named in English under English');
    check(await attr(p, '[data-kc-picker]', 'aria-label') === 'Colour', 'the group is « Colour »');
    check(await p.$eval('[data-kc-cap]', (e) => e.textContent) === 'Black', 'the caption names the selection in English');
    check(await attr(p, '[data-kc-cap]', 'data-kc-empty') === 'Hover a swatch to read its name', 'with a mouse, the hint says hover');
    check(await attr(p, '[data-kc-more]', 'title') === 'More colours' && await p.$eval('[data-kc-apply]', (e) => e.textContent) === 'Choose', 'the custom colour controls read English');
    await p.click('[data-kc-color="rouge"]');
    await pause(60);
    const sel = await p.evaluate(() => KiwiColors.selection(document.getElementById('host')));
    check(sel.id === 'rouge' && sel.label === 'Rouge', 'what is stored stays the French label (« Rouge »), the key reports read');
    check(await p.evaluate(() => KiwiColors.nameOf(KiwiColors.selection(document.getElementById('host')))) === 'Red', 'and a selection read back for the screen says « Red », not « Rouge »');
    await p.click('[data-kc-more]');
    await p.$eval('[data-kc-hex-input]', (e) => { e.value = '#4A67D6'; });
    await p.click('[data-kc-apply]');
    await pause(60);
    const custom = await p.evaluate(() => ({ s: KiwiColors.selection(document.getElementById('host')), d: __changes[__changes.length - 1], t: document.querySelector('[data-kc-color="custom-4a67d6"]').getAttribute('title') }));
    check(custom.t === 'Custom colour #4A67D6', 'an unnamed custom colour reads « Custom colour #4A67D6 »');
    check(custom.s.label === 'Couleur personnalisée #4A67D6' && custom.d.label === 'Couleur personnalisée #4A67D6', 'and is stored under its French generic name, as before');
    const api = await p.evaluate(() => ({ name: KiwiColors.name('noir'), label: KiwiColors.label('noir') }));
    check(api.name === 'Black' && api.label === 'Noir', 'KiwiColors.name reads, KiwiColors.label stays the stored key');
    await ctx.close();
  }

  /* B · arabe, téléphone tactile */
  {
    const {ctx, p} = await open('ar', {width: 375, height: 760, isMobile: true, hasTouch: true});
    check(await attr(p, '[data-kc-color="noir"]', 'title') === 'أسود' && await attr(p, '[data-kc-picker]', 'aria-label') === 'اللون', 'swatches and group are named in Arabic under Arabic');
    const hover = await p.evaluate(() => matchMedia('(hover: none)').matches);
    check(hover && await attr(p, '[data-kc-cap]', 'data-kc-empty') === 'المس لونًا لاختياره', 'on a touch phone the hint says tap, not hover');
    check(await attr(p, '[data-kc-hex-input]', 'dir') === 'ltr', 'the hex code stays left to right inside an Arabic page');
    await ctx.close();
  }

  /* C · français : rien ne change pour le français */
  {
    const {ctx, p} = await open('fr');
    check(await attr(p, '[data-kc-color="noir"]', 'title') === 'Noir' && await attr(p, '[data-kc-cap]', 'data-kc-empty') === 'Survolez une pastille pour lire son nom', 'French reads exactly as it did');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* D · le tableau de bord lit les noms, imprime et enregistre les libellés */
{
  const pp = pagesProSource();
  check(!/k\.picker\('bqx-color', sel, Object\.assign\(\{ optional: true, custom: true, label: 'Couleur' \}/.test(pp), 'the product sheet no longer forces a French group label on the picker');
  check(/function _bqxColorName\(c\)/.test(pp) && /function _bqxVarName\(v\)/.test(pp), 'the sheet has a read name next to the stored label');
  check(!/<span>\$\{_esc\(shown\.label\)\}<\/span>/.test(pp) && !/swatch\((?:shown|color|f\.color), \{ name: (?:shown|color|f\.color)\.label \}\)/.test(pp), 'no colour on the sheet is printed from its stored label');
  check(/BC\(\)\.printLabels\(\[label\], \{ copies \}\); \}, _bqxVarLabel\(hit\.v\), 1\);/.test(pp), 'a printed tag still carries the stored label');
  check(/colorLabel: f\.color\.label, colorHex: f\.color\.hex/.test(pp) && /colorLabel: color && color\.label/.test(pp), 'a new or edited variant still stores the French label');
}
console.log(`\ncolor-palette-language: ${checks} passed, 0 failed`);
