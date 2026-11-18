#!/usr/bin/env node
/* Plancher navigateur · un navigateur trop ancien voit un écran clair, jamais
 * un tableau de bord à moitié chargé sous un verrou décroché.
 *
 * Santos Store, 18 nov. 2026 (photo du propriétaire) : sur le PC Windows 10 du
 * comptoir, l'ancien Edge (EdgeHTML) ne comprend ni `?.` ni `??` (Chrome 80) ni
 * `inset` (Chrome 87). Aucun script du tableau de bord ne s'exécutait : la page
 * restait sur sa maquette (« Café Atlas », +3 724 MAD), et l'écran du code à
 * 4 chiffres, posé en `position:fixed; inset:0`, se réduisait à un carré en
 * haut à gauche, la page visible derrière.
 *
 * Deux garde-fous, éprouvés ici sur leur vrai code :
 *  1. le script en ligne `kiwi-browser-floor` de dashboard.html et de
 *     kiwi-caisse.html (identique dans les deux) : sous le plancher, il cache
 *     toute la page et dit d'ouvrir Kiwi dans Chrome ou le nouvel Edge ;
 *  2. le verrou `.kiwi-lock` couvre l'écran sans `inset` (top/right/bottom/left),
 *     pour un navigateur qui exécute les scripts mais ignore `inset`.
 *   node tools/browser-floor-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
let passed = 0;
const ok = async (label, fn) => { await fn(); passed++; console.log('  ✓ ' + label); };

function floorScript(file) {
  const m = read(file).match(/<script>\/\* kiwi-browser-floor[\s\S]*?<\/script>/);
  if (!m) throw new Error(file + ' has no kiwi-browser-floor script');
  return m[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
}
const DASH = floorScript('dashboard.html');

/* A parser that rejects ES2020 syntax, as EdgeHTML 18 does. */
function OldFunction(...args) {
  const body = String(args[args.length - 1]);
  if (/\?\.|\?\?/.test(body)) throw new SyntaxError('Expected identifier');
  return Function(...args);
}

/* A page being parsed: head present, body not yet (or already) there. */
function page({ old, lang = null, bodyReady = false }) {
  const listeners = {};
  const el = (tag) => ({
    tag, children: [], attrs: {}, className: '', dir: '', innerHTML: '', text: '',
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
  });
  const head = el('head'), html = el('html');
  const document = {
    documentElement: html, head, body: bodyReady ? el('body') : null,
    createElement: el,
    createTextNode: (t) => ({ text: t }),
    querySelector: (sel) => (sel === '.kiwi-too-old-msg' && document.body
      ? document.body.children.find((c) => c.className === 'kiwi-too-old-msg') || null : null),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  const localStorage = { getItem: (k) => (k === 'kiwiLang' ? lang : null) };
  const ctx = vm.createContext({ document, localStorage });
  if (old) ctx.Function = OldFunction;
  vm.runInContext(DASH, ctx);
  const domReady = () => { if (!document.body) document.body = el('body'); (listeners.DOMContentLoaded || []).forEach((f) => f()); };
  const css = () => head.children.filter((c) => c.tag === 'style').map((s) => s.children.map((t) => t.text).join('')).join('');
  const msg = () => (document.body ? document.body.children.filter((c) => c.className === 'kiwi-too-old-msg') : []);
  return { document, domReady, css, msg };
}

await ok('the dashboard and the till carry the same floor', async () => {
  assert.equal(floorScript('kiwi-caisse.html'), DASH);
});

await ok('the floor runs before any other script and is plain ES5', async () => {
  for (const f of ['dashboard.html', 'kiwi-caisse.html']) {
    const html = read(f);
    const at = html.indexOf('/* kiwi-browser-floor');
    const firstSrc = html.indexOf('<script src=');
    assert.ok(at > 0 && at < firstSrc, f + ': the floor comes before the first <script src>');
  }
  /* No arrow, let/const, template, ?. or ?? outside the probe string itself. */
  const code = DASH.replace(/'[^']*\?\.[^']*'/, "''");
  assert.doesNotMatch(code, /=>|\blet\b|\bconst\b|`|\?\.|\?\?/);
});

await ok('an old browser: the whole page is hidden at once, before the body is parsed', async () => {
  const p = page({ old: true });
  assert.match(p.css(), /body>\*:not\(\.kiwi-too-old-msg\)\{display:none!important\}/);
  assert.equal(p.msg().length, 0, 'no body yet');
  p.domReady();
  const [m] = p.msg();
  assert.ok(m, 'the message is shown once the body exists');
  assert.equal(m.attrs.role, 'alert');
  assert.match(m.innerHTML, /trop ancien/);
  assert.match(m.innerHTML, /Chrome/);
  assert.match(m.innerHTML, /href="https:\/\/www\.google\.com\/chrome\/"/);
  p.domReady();
  assert.equal(p.msg().length, 1, 'shown once');
});

await ok('an old browser in Arabic or English reads it in its own language', async () => {
  const ar = page({ old: true, lang: 'ar', bodyReady: true });
  const [m] = ar.msg();
  assert.equal(m.dir, 'rtl');
  assert.match(m.innerHTML, /[؀-ۿ]/);
  const en = page({ old: true, lang: 'en', bodyReady: true });
  assert.match(en.msg()[0].innerHTML, /too old/);
});

await ok('a current browser: nothing is added, nothing hidden', async () => {
  const p = page({ old: false });
  p.domReady();
  assert.equal(p.css(), '');
  assert.equal(p.msg().length, 0);
});

/* 2 · The lock covers the screen in a browser that drops `inset`. */
await ok('the code screen covers the whole viewport even where `inset` is unknown', async () => {
  let puppeteer;
  try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); } catch (_) {}
  const bin = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  assert.ok(puppeteer, 'puppeteer-core (npm --prefix app ci)');
  /* What EdgeHTML / Chrome < 87 sees: every `inset` declaration dropped. */
  const shell = read('assets/dashboard-shell.css').replace(/(^|[;{\s])inset\s*:/g, '$1x-inset:');
  const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
  try {
    const tab = await browser.newPage();
    await tab.setViewport({ width: 1280, height: 800 });
    await tab.setContent('<!doctype html><html><head><style>' + shell + '</style></head><body>'
      + '<div class="kiwi-lock" data-kiwi-lock><div class="kiwi-lock-inner"><div class="kiwi-lock-title">Bienvenue</div></div></div>'
      + '<div class="app" style="height:2000px">page</div></body></html>');
    const r = await tab.$eval('.kiwi-lock', (n) => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    assert.deepEqual(r, { x: 0, y: 0, w: 1280, h: 800 });
    const top = await tab.evaluate(() => document.elementFromPoint(1270, 790).closest('[data-kiwi-lock]') !== null);
    assert.ok(top, 'the far corner belongs to the lock, not to the page');
  } finally { await browser.close(); }
});

console.log(`browser-floor: ${passed} passed`);
