#!/usr/bin/env node
import { forLocales } from '../test-locales.mjs';
/* tools/design-capture/capture.mjs — screenshot matrix for the design audit.
 *
 * Drives DEMO surfaces only, through a real Chrome (puppeteer-core from
 * app/node_modules), and writes
 *
 *     <out>/<surface>/<device>-<theme>-<lang>.png
 *     <out>/manifest.jsonl          one JSON line per frame, appended
 *
 * Read tools/design-capture/README.md first. Short version:
 *
 *   node tools/design-capture/capture.mjs --list
 *   node tools/design-capture/capture.mjs --cluster dashboard
 *   node tools/design-capture/capture.mjs --surface dashboard.orders --devices iphone --themes dark --langs en
 *
 * Safety rules baked in (do not weaken them):
 *   - only the repo's own static files are served, on 127.0.0.1;
 *   - every request that is not 127.0.0.1 / data: / blob: (plus Google Fonts
 *     unless --offline) is aborted, kiwi-os.com and *.pages.dev included;
 *   - /api/* and /auth/* answer 404 `{}` locally, so nothing is ever signed in;
 *   - the only codes typed are the public demo till codes, resolved at run time
 *     from assets/pos-dispatch.js, pressed on the on-screen keypad, never logged.
 *
 * Does not edit repo files, does not touch git.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DEFAULT_OUT = path.resolve(ROOT, '..', 'kiwi-design-audit', 'shots');
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];

/* ── devices ─────────────────────────────────────────────────────────────
 * `native` devices look like the Capacitor app: stubbed bridge, host insets,
 * the web bundle from tools/build-app-www.mjs. iPad insets: the native tab
 * bar is hidden above 900 pt wide (KiwiNativeShell.swift), so tab height 0.   */
export const DEVICES = {
  iphone:        { w: 440,  h: 956,  dsf: 3, mobile: true,  touch: true,  native: true,  safe: { top: 62, bottom: 34, tab: 106 } },
  'iphone-se':   { w: 375,  h: 667,  dsf: 2, mobile: true,  touch: true,  native: true,  safe: { top: 20, bottom: 0,  tab: 83 } },
  ipad:          { w: 1032, h: 1376, dsf: 2, mobile: false, touch: true,  native: true,  safe: { top: 24, bottom: 20, tab: 0 } },
  'ipad-land':   { w: 1376, h: 1032, dsf: 2, mobile: false, touch: true,  native: true,  safe: { top: 24, bottom: 20, tab: 0 } },
  desktop:       { w: 1440, h: 900,  dsf: 2, mobile: false, touch: false, native: false },
};
const LANGS_DEFAULT = ['fr', 'en', 'ar'];
const THEMES = ['light', 'dark'];

/* ── per-app storage contract ────────────────────────────────────────────
 * What each app reads BEFORE first paint to pick a language / theme / role.
 * `lang` maps the requested language onto the stored value.                   */
const APPS = {
  dashboard: { langKeys: ['kiwiLang'], themeKeys: ['kiwiDashTheme'], role: 'dashboard' },
  caisse:    { langKeys: ['kiwiCaisseLang'], themeKeys: ['kiwiCaisseTheme'], role: 'caisse' },
  serveur:   { langKeys: ['kiwi-employee-language:demo'], themeKeys: ['kiwiTheme'], role: 'equipe' },
  cuisine:   { langKeys: [], themeKeys: ['kiwiTheme'], role: 'cuisine' },
  orderpro:  { langKeys: ['orderProLang'], themeKeys: ['kiwiTheme'], role: null },
  order:     { langKeys: [], themeKeys: ['kiwiTheme'], role: null },
  static:    { langKeys: ['kiwiLang'], themeKeys: ['kiwiTheme'], role: null },
  shell:     { langKeys: [], themeKeys: [], role: null },
};

/* ── arguments ─────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const o = { jobs: 3, settle: 600, timeout: 25000, frameTimeout: 150000 };
  const bool = new Set(['force', 'list', 'dry', 'offline', 'debug', 'help', 'keepWww']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (bool.has(key)) { o[key] = true; continue; }
    const v = argv[++i];
    if (v === undefined) throw new Error(`${a} needs a value`);
    o[key] = v;
  }
  for (const k of ['jobs', 'settle', 'timeout', 'frameTimeout']) o[k] = Number(o[k]);
  return o;
}
const csv = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : null);

/* ── static servers ──────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

let gateModule = null;
async function renderGate(lang) {
  /* The real sign-in screen is rendered by functions/_middleware.js. Calling
   * its onRequest with a dummy env (no D1, a throwaway secret, no cookie) makes
   * it answer with the account gate HTML and does nothing else. The form is
   * never submitted. */
  if (!gateModule) {
    const emit = process.emitWarning;
    process.emitWarning = () => {};
    try { gateModule = await import(pathToFileURL(path.join(ROOT, 'functions', '_middleware.js')).href); }
    finally { process.emitWarning = emit; }
  }
  const request = new Request(`http://127.0.0.1/dashboard?lang=${encodeURIComponent(lang)}`);
  const res = await gateModule.onRequest({ request, env: { AUTH_SECRET: 'render-only-not-a-secret' }, next: async () => new Response('next'), waitUntil() {}, params: {}, data: {} });
  return res.text();
}

function startServer(rootDir, { gate = false } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let p = decodeURIComponent(u.pathname);
      if (gate && p === '/__gate') {
        const html = await renderGate(u.searchParams.get('lang') || 'fr');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html); return;
      }
      if (p.startsWith('/api/') || p.startsWith('/auth/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return;
      }
      let file = path.join(rootDir, p);
      if (!file.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
      let st = fs.existsSync(file) ? fs.statSync(file) : null;
      if (st && st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) ? fs.statSync(file) : null; }
      if (!st && fs.existsSync(file + '.html')) { file += '.html'; st = fs.statSync(file); }
      if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500); res.end(String(e && e.message || e)); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` })));
}

/* ── demo till codes: resolved from the public registry, never printed ──── */
function demoCodeFor(vertical) {
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'pos-dispatch.js'), 'utf8');
  const re = new RegExp(`'(\\d{4})'\\s*:\\s*\\{\\s*id:\\s*'${vertical}'`);
  const m = src.match(re);
  if (!m) throw new Error(`no demo till code registered for vertical "${vertical}"`);
  return m[1];
}

/* ── in-page init (runs before any page script) ──────────────────────────── */
function initScript(cfg) {
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  for (const k of cfg.langKeys) set(k, cfg.lang);
  for (const k of cfg.themeKeys) set(k, cfg.theme);
  if (cfg.setKiwiTheme) set('kiwiTheme', cfg.theme);
  if (cfg.native) {
    set('kiwiNativeLocale', cfg.lang);
    if (cfg.role) set('kiwiAppRole', cfg.role);
    const noop = () => Promise.resolve({});
    const plug = new Proxy({}, { get: (_, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: () => plug }) };
    window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { window.__host = v; } } } };
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.documentElement.style;
      s.setProperty('--kiwi-host-safe-top', cfg.safe.top + 'px');
      s.setProperty('--kiwi-host-safe-bottom', cfg.safe.bottom + 'px');
      s.setProperty('--kiwi-host-tab-height', cfg.safe.tab + 'px');
    });
  }
}

/* ── step runner ─────────────────────────────────────────────────────────
 * Every step is { do, ...args, optional?, timeout? }. See README for the list. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* In-page: first element matching selector (+ optional text regex), visible
 * ones preferred. Returns a JSHandle or null. */
async function find(page, step) {
  const handle = await page.evaluateHandle(({ selector, text, any }) => {
    const re = text ? new RegExp(text, 'i') : null;
    const all = [...document.querySelectorAll(selector)].filter((e) => !re || re.test(e.textContent || e.getAttribute('aria-label') || ''));
    const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    return all.find(vis) || (any ? all[0] : null) || null;
  }, { selector: step.selector, text: step.text || '', any: step.any !== false && !step.visible });
  const el = handle.asElement();
  if (!el) { await handle.dispose(); return null; }
  return el;
}

async function waitForVisible(page, step, timeout) {
  await page.waitForFunction(({ selector, text }) => {
    const re = text ? new RegExp(text, 'i') : null;
    return [...document.querySelectorAll(selector)].some((e) => {
      if (re && !re.test(e.textContent || e.getAttribute('aria-label') || '')) return false;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }, { timeout, polling: 100 }, { selector: step.selector, text: step.text || '' });
}

function describe(step) {
  const bits = [step.do];
  for (const k of ['to', 'selector', 'text', 'path', 'vertical', 'ms', 'key', 'n', 'label']) if (step[k] !== undefined) bits.push(`${k}=${step[k]}`);
  if (step.js) bits.push('js=' + String(step.js).replace(/\s+/g, ' ').slice(0, 60));
  return bits.join(' ');
}

const BOOTS = [
  /* dashboard demo: first-run wizard -> "explore the demo" -> owner lock -> skip.
   * Same entry the native tests use (.kob-root [data-explore], [data-kiwi-skip]).
   * Implemented as the dashEnter op: the buttons exist in the HTML before their
   * handlers are wired, so it keeps clicking until the screen really reacts. */
  { do: 'dashEnter' },
  { do: 'waitFor', selector: '.hero-today, .vexel-compose, .sidebar nav a[data-nav]', timeout: 15000 },
  { do: 'wait', ms: 1800 },
];
const BOOT_TILL = [
  /* till demo: the clock-in screen is the landing; its button opens the shift. */
  { do: 'waitFor', selector: '#clockin-btn', timeout: 15000 },
  { do: 'wait', ms: 600 },
  /* no opening float is preselected: pick one before the button enables */
  { do: 'click', selector: '#ci-float-chips [data-float="500"]' },
  { do: 'click', selector: '#clockin-btn' },
  /* the shell lands on the takeaway builder after the greeting flash (~3 s) */
  { do: 'waitFor', selector: 'body.is-unlocked .menu-item', timeout: 25000 },
  { do: 'wait', ms: 1500 },
];
const BOOT_MACROS = { 'dashboard-demo': BOOTS, 'till-demo': BOOT_TILL, none: [] };

/* Show the till keypad, calling the app's own reset until its script has loaded. */
async function showTillKeypad(page, total) {
  const until = Date.now() + total;
  while (Date.now() < until) {
    await page.evaluate(() => { if (typeof window.__kiwiPinReset === 'function') window.__kiwiPinReset(); });
    try {
      await page.waitForFunction(() => {
        const pin = document.querySelector('#pin-screen'); const key = document.querySelector('#pin-screen .pin-key');
        return !!pin && !!key && getComputedStyle(pin).display !== 'none' && key.getBoundingClientRect().width > 0;
      }, { timeout: 1500, polling: 100 });
      return;
    } catch (_) { /* script not ready yet */ }
  }
  throw new Error('till keypad never appeared');
}

async function runStep(ctx, rawStep) {
  const { page, timeout, deviceCfg } = ctx;
  /* {lang} and {theme} inside any string field are filled in per frame */
  const step = Object.fromEntries(Object.entries(rawStep).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/\{lang\}/g, ctx.lang).replace(/\{theme\}/g, ctx.theme) : v]));
  const t = step.timeout || timeout;
  switch (step.do) {
    case 'goto': {
      const url = /^https?:/.test(step.path) ? step.path : ctx.base + step.path;
      await page.goto(url, { waitUntil: step.waitUntil || 'load', timeout: Math.max(t, 45000) });
      await page.waitForNetworkIdle({ idleTime: 600, timeout: 6000 }).catch(() => {});
      return;
    }
    case 'wait': await sleep(step.ms || 500); return;
    case 'waitFor': await waitForVisible(page, step, t); return;
    case 'waitGone':
      await page.waitForFunction((s) => !document.querySelector(s) || ![...document.querySelectorAll(s)].some((e) => e.getBoundingClientRect().width > 0), { timeout: t, polling: 100 }, step.selector);
      return;
    case 'click': {
      const el = await find(page, step);
      if (!el) throw new Error(`click: nothing matches ${step.selector}${step.text ? ` /${step.text}/` : ''}`);
      await page.evaluate((e) => e.click(), el); await el.dispose();
      return;
    }
    case 'tap': { // a real pointer event at the element's centre
      const el = await find(page, { ...step, any: false });
      if (!el) throw new Error(`tap: no visible element matches ${step.selector}`);
      await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));
      try { await el.click(); }
      catch (_) { await sleep(500); try { await el.click(); } catch (__) { await page.evaluate((e) => e.click(), el); } }
      await el.dispose();
      return;
    }
    case 'hover': {
      const el = await find(page, { ...step, any: false });
      if (!el) throw new Error(`hover: no visible element matches ${step.selector}`);
      await el.hover(); await el.dispose(); return;
    }
    case 'type': {
      const el = await find(page, step);
      if (!el) throw new Error(`type: nothing matches ${step.selector}`);
      await el.focus(); await el.type(String(step.value), { delay: 20 }); await el.dispose(); return;
    }
    case 'key': await page.keyboard.press(step.key); return;
    case 'eval': {
      const r = await page.evaluate(`(async () => { ${step.js} })()`);
      if (step.expect !== undefined && r !== step.expect) throw new Error(`eval returned ${JSON.stringify(r)}, expected ${JSON.stringify(step.expect)}`);
      return;
    }
    case 'scroll': {
      await page.evaluate(({ selector, to }) => {
        const el = selector ? document.querySelector(selector) : (document.scrollingElement || document.documentElement);
        if (!el) return;
        const top = to === 'bottom' ? el.scrollHeight : (to === 'top' || to == null ? 0 : Number(to));
        el.scrollTo ? el.scrollTo({ top, behavior: 'instant' }) : (el.scrollTop = top);
      }, { selector: step.selector || '', to: step.to });
      return;
    }
    case 'scrollThrough': // trigger lazy / reveal-on-scroll content before a full-page shot
      await page.evaluate(async () => {
        const el = document.scrollingElement || document.documentElement;
        const step = Math.max(300, innerHeight * 0.7);
        for (let y = 0; y < el.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); }
        window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 300));
      });
      return;
    case 'nav': { // dashboard sidebar page, by data-nav key or data-action
      const ok = await page.evaluate((to) => {
        const sels = [`.sidebar nav a[data-nav="${to}"]`, `#kw-sidebar nav a[data-nav="${to}"]`, `.sidebar nav a[data-action="${to}"]`, `[data-nav="${to}"]`];
        for (const s of sels) { const e = document.querySelector(s); if (e) { e.click(); return true; } }
        return false;
      }, step.to);
      if (!ok) throw new Error(`nav: no sidebar entry "${step.to}" (not offered on this venue?)`);
      await sleep(step.ms || 1400);
      return;
    }
    case 'host': // native host navigate (tab bar route), phone / iPad shell only
      await page.evaluate((id) => window.KiwiNativeHostAction && window.KiwiNativeHostAction({ action: 'navigate', id }), step.to);
      await sleep(step.ms || 1400); return;
    case 'dashEnter': {
      const start = Date.now(); const until = start + 40000;
      const state = () => page.evaluate(() => {
        const vis = (e) => !!e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
        const lock = document.querySelector('[data-kiwi-lock]');
        return { kob: vis(document.querySelector('.kob-root')), lock: vis(lock) && !lock.classList.contains('is-unlocking'), app: vis(document.querySelector('.sidebar nav a[data-nav], .kw-hamburger')) };
      });
      let seen = false;
      while (Date.now() < until) {
        const st = await state();
        if (st.kob) { seen = true; await page.evaluate(() => document.querySelector('.kob-root [data-explore]')?.click()); await sleep(900); }
        else if (st.lock) { seen = true; if (step.stopAtLock) return; await page.evaluate(() => document.querySelector('[data-kiwi-skip]')?.click()); }
        else if (seen || (st.app && Date.now() > start + 4000)) break;
        await sleep(300);
      }
      const end = await state();
      if (end.kob || end.lock) throw new Error('dashEnter: still on the first-run wizard / lock screen after 40 s');
      await sleep(900);
      return;
    }
    case 'tillLock': // show the till's keypad (the same call the app's "Verrouiller" makes)
      await showTillKeypad(page, t); return;
    case 'demoCode': { // press a public demo till code on the on-screen keypad
      const code = demoCodeFor(step.vertical);
      for (let attempt = 0; attempt < 3; attempt++) {
        await showTillKeypad(page, 10000);
        await sleep(attempt ? 600 : 900);
        let typed = true;
        for (const d of code) {
          const el = await find(page, { selector: `#pin-pad [data-pin="${d}"]` });
          if (!el) { typed = false; break; }
          await page.evaluate((e) => e.click(), el); await el.dispose(); await sleep(120);
        }
        if (!typed) continue;
        try { await page.waitForSelector('body.is-pos.is-unlocked', { timeout: 9000 }); return; } catch (_) { /* handlers or vertical script not ready: try again */ }
      }
      throw new Error(`demoCode: vertical "${step.vertical}" did not open after 3 tries`);
    }
    case 'demoPin': { // any demo code that is not a registered vertical, pressed on the on-screen keypad
      const sel = step.kind === 'team' ? (d) => `#pin-keypad [data-key="${d}"]` : (d) => `#pin-pad [data-pin="${d}"]`;
      const done = step.kind === 'team' ? '#screen-clockin.is-active' : '#clockin-screen.is-visible';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (step.kind !== 'team') await showTillKeypad(page, 10000);
        await sleep(attempt ? 1200 : 1500); // the keypad is in the HTML before its handlers are wired
        for (const d of '1111') {
          const el = await find(page, { selector: sel(d) });
          if (!el) throw new Error('demoPin: keypad not on screen');
          await page.evaluate((e) => e.click(), el); await el.dispose(); await sleep(140);
        }
        try { await page.waitForSelector(done, { timeout: 4000 }); return; } catch (_) { /* handlers were not ready: press again */ }
      }
      throw new Error('demoPin: the app did not accept the demo code');
    }
    case 'setViewport': // e.g. rotate: {w,h}
      await page.setViewport({ width: step.w, height: step.h, deviceScaleFactor: deviceCfg.dsf, isMobile: deviceCfg.mobile, hasTouch: deviceCfg.touch });
      await sleep(400); return;
    default: throw new Error(`unknown step "${step.do}"`);
  }
}

/* ── frame probes ────────────────────────────────────────────────────── */
const PROBE = () => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; };
  const w = innerWidth, h = innerHeight;
  let overlay = false;
  /* Composite every background under a point, back to front. A full-viewport
   * translucent layer (modal scrim, blur veil) marks the frame as "overlay": the
   * theme can then only be judged from the <html> attribute, not from pixels. */
  const paint = (x, y) => {
    const stack = document.elementsFromPoint(x, y);
    let base = null;
    const layers = [];
    for (const e of stack) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (!c || c.a === 0) continue;
      if (c.a < 0.95) {
        const r = e.getBoundingClientRect();
        if (r.width >= w * 0.9 && r.height >= h * 0.9 && c.a >= 0.2) overlay = true;
      }
      layers.push(c);
      if (c.a >= 0.99) { base = c; break; }
    }
    let col = base || { r: 255, g: 255, b: 255, a: 1 };
    for (let i = (base ? layers.length - 2 : layers.length - 1); i >= 0; i--) {
      const l = layers[i];
      col = { r: l.r * l.a + col.r * (1 - l.a), g: l.g * l.a + col.g * (1 - l.a), b: l.b * l.a + col.b * (1 - l.a), a: 1 };
    }
    return (0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b) / 255;
  };
  const pts = [[w * 0.5, h * 0.5], [w * 0.12, h * 0.85], [w * 0.88, h * 0.15], [w * 0.5, h * 0.92]];
  const lum = pts.reduce((s, [x, y]) => s + paint(x, y), 0) / pts.length;
  const de = document.documentElement;
  return {
    lang: de.lang || '', dir: de.dir || getComputedStyle(document.body).direction || '',
    dataTheme: de.getAttribute('data-theme') || '', caisseTheme: de.getAttribute('data-caisse-theme') || '',
    lum: Math.round(lum * 100) / 100, overlay,
    fonts: document.fonts ? document.fonts.check('16px "Inter Tight"') : null,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    title: document.title,
  };
};
const KILL_CSS = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:0s!important;transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}`;

function judge(surface, device, theme, lang, p) {
  const w = [];
  const wantRtl = lang === 'ar';
  if (surface.langCheck !== false) {
    if (wantRtl && p.dir !== 'rtl') w.push(`language: expected dir=rtl, page reports "${p.dir}"`);
    if (!wantRtl && p.dir === 'rtl') w.push(`language: expected ltr, page is rtl`);
    if (p.lang && !p.lang.toLowerCase().startsWith(lang) && surface.app !== 'caisse') w.push(`language: <html lang="${p.lang}"> does not match ${lang}`);
  }
  if (surface.themeFixed === undefined && surface.themeCheck !== false) {
    /* attribute the app itself uses, when it has one */
    if (surface.app === 'dashboard' && p.dataTheme && p.dataTheme !== theme) w.push(`theme: asked ${theme}, <html data-theme="${p.dataTheme}">`);
    if (surface.app === 'caisse' && (p.caisseTheme === 'dark') !== (theme === 'dark')) w.push(`theme: asked ${theme}, till attribute is "${p.caisseTheme || 'light'}"`);
    /* pixels: skipped under a modal scrim, where the page behind is dimmed */
    if (!p.overlay) {
      if (theme === 'dark' && p.lum > 0.55) w.push(`theme: asked dark, painted luminance ${p.lum}`);
      if (theme === 'light' && p.lum < 0.4) w.push(`theme: asked light, painted luminance ${p.lum}`);
    }
  }
  if (p.fonts === false) w.push('font: Inter Tight is not loaded (check network allowlist)');
  if (p.overflowX > 1 && device !== 'desktop') w.push(`layout: horizontal overflow ${p.overflowX}px`);
  return w;
}

/* ── one frame ───────────────────────────────────────────────────────── */
async function captureFrame(env, surface, device, theme, lang, outFile) {
  const dev = DEVICES[device];
  const app = APPS[surface.app] || APPS.static;
  const useNative = !!(dev.native && surface.native);
  const base = useNative ? env.native.base : env.web.base;
  const rec = { surface: surface.id, cluster: surface.cluster, device, theme, lang, url: '', steps: [], ok: false, error: null, warnings: [], blocked: 0, host: useNative ? 'native-bundle' : 'web', file: path.relative(env.out, outFile) };
  const t0 = Date.now();
  const context = await env.browser.createBrowserContext();
  const page = await context.newPage();
  const consoleErrors = [];
  try {
    const dsf = surface.fullPage ? Math.min(dev.dsf, 1) : dev.dsf;
    await page.setViewport({ width: dev.w, height: dev.h, deviceScaleFactor: dsf, isMobile: dev.mobile, hasTouch: dev.touch });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.setRequestInterception(true);
    const localOrigins = { web: new URL(env.web.base).origin, native: new URL(env.native.base).origin };
    page.on('request', (r) => {
      const u = r.url();
      if (/^(data|blob|about):/.test(u)) { r.continue(); return; }
      /* Compare parsed origins, not string prefixes: "http://127.0.0.1:8123@evil"
         starts with the local base but is another host. */
      let o = null; try { o = new URL(u); } catch (_) {}
      if (!o || o.username || o.password) { rec.blocked++; r.abort(); return; }
      if (o.origin === localOrigins.web || o.origin === localOrigins.native) { r.continue(); return; }
      if (!env.opts.offline && /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(o.hostname)) { r.continue(); return; }
      rec.blocked++; r.abort();
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e.message || e).slice(0, 160)));
    await page.evaluateOnNewDocument(initScript, {
      lang, theme, native: useNative, role: app.role, safe: dev.safe || { top: 0, bottom: 0, tab: 0 },
      langKeys: app.langKeys, themeKeys: app.themeKeys, setKiwiTheme: surface.app === 'static',
    });

    /* entry */
    let entry = surface.entry;
    if (surface.localePaths) entry = surface.localePaths[lang] || surface.localePaths.fr;
    const sep = entry.includes('?') ? '&' : '?';
    if (surface.langQuery) entry += `${sep}${surface.langQuery}=${lang}`;
    const ctx = { page, base, timeout: env.opts.timeout, deviceCfg: dev, lang, theme };
    rec.url = base + entry;
    /* 'load' plus a best-effort idle: networkidle alone never settles when a page
     * keeps polling (blocked production calls retry), and a loaded machine blows the budget. */
    await page.goto(rec.url, { waitUntil: surface.waitUntil || 'load', timeout: Math.max(env.opts.timeout, 45000) });
    await page.waitForNetworkIdle({ idleTime: 600, timeout: 6000 }).catch(() => {});
    rec.steps.push(`goto ${entry}`);

    const plan = [...(BOOT_MACROS[surface.boot || 'none'] || []), ...(surface.steps || [])];
    for (const step of plan) {
      /* A step may be limited to some devices / langs / themes via only: {device:[…]}. */
      if (step.only) {
        if (step.only.device && !step.only.device.includes(device)) continue;
        if (step.only.lang && !step.only.lang.includes(lang)) continue;
        if (step.only.theme && !step.only.theme.includes(theme)) continue;
      }
      const label = describe(step);
      try {
        /* a page may reload itself once while booting: retry a step whose context vanished */
        for (let attempt = 0; ; attempt++) {
          try { await runStep(ctx, step); break; }
          catch (e) {
            if (attempt < 3 && /context was destroyed|Cannot find context|does not belong to the document|Target closed|navigat/i.test(String(e.message))) { await sleep(1200); continue; }
            throw e;
          }
        }
        if (step.then) await sleep(step.then);
        rec.steps.push(label);
      }
      catch (e) {
        if (step.optional) { rec.steps.push(label + ' (skipped: ' + String(e.message).split('\n')[0].slice(0, 80) + ')'); continue; }
        throw new Error(`step "${label}": ${String(e.message).split('\n')[0]}`);
      }
    }

    /* settle, then freeze motion, then measure, then shoot. A page that reloads
     * itself under us (seen once on the till) gets two more tries. */
    for (let attempt = 0; ; attempt++) {
      try {
        await sleep(env.opts.settle);
        await page.addStyleTag({ content: KILL_CSS });
        await sleep(180);
        const probe = await page.evaluate(PROBE);
        rec.warnings = judge(surface, device, theme, lang, probe);
        if (probe.title) rec.title = probe.title;
        if (consoleErrors.length) rec.pageErrors = consoleErrors.slice(0, 3);
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        await page.screenshot({ path: outFile, type: 'png', fullPage: !!surface.fullPage });
        break;
      } catch (e) {
        if (attempt < 2 && /context was destroyed|Cannot find context|navigat/i.test(String(e.message))) { rec.warnings.push('page reloaded itself while settling; retried'); await sleep(1500); continue; }
        throw e;
      }
    }
    rec.sha1 = crypto.createHash('sha1').update(fs.readFileSync(outFile)).digest('hex').slice(0, 12);
    rec.ok = true;
  } catch (e) {
    rec.error = String(e && e.message || e).split('\n')[0].slice(0, 300);
    try {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      await page.screenshot({ path: outFile.replace(/\.png$/, '.failed.png'), type: 'png' });
    } catch (_) {}
  } finally {
    rec.ms = Date.now() - t0;
    rec.timestamp = new Date().toISOString();
    await context.close().catch(() => {});
  }
  return rec;
}

/* ── main ────────────────────────────────────────────────────────────── */
export function loadSurfaces() {
  const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'surfaces.json'), 'utf8'));
  return raw;
}

function planFrames(catalog, opts) {
  const wantDevices = csv(opts.devices);
  const wantThemes = csv(opts.themes) || THEMES;
  const wantLangs = csv(opts.langs);
  const ids = csv(opts.surface);
  const surfaces = catalog.surfaces.filter((s) => (ids ? ids.includes(s.id) : true) && (opts.cluster ? s.cluster === opts.cluster : true));
  const frames = [];
  for (const s of surfaces) {
    if (s.status === 'blocked') continue;
    const devices = (wantDevices || s.devices || ['iphone', 'ipad', 'desktop']).filter((d) => DEVICES[d] && (!s.devices || s.devices.includes(d)));
    const langs = forLocales((wantLangs || s.langs || LANGS_DEFAULT).filter((l) => !s.langs || s.langs.includes(l)));
    const themes = s.themeFixed ? [s.themeFixed] : wantThemes;
    for (const d of devices) for (const t of themes) for (const l of langs) frames.push({ s, d, t, l });
  }
  return frames;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const catalog = loadSurfaces();
  if (opts.help || (!opts.list && !opts.cluster && !opts.surface)) {
    console.log(`usage: node tools/design-capture/capture.mjs --cluster <name> [--surface <id[,id]>] [--devices iphone,ipad,desktop] [--themes light,dark] [--langs fr,en,ar] [--out <dir>] [--force] [--jobs 3] [--dry] [--list]\nclusters: ${[...new Set(catalog.surfaces.map((s) => s.cluster))].join(', ')}\ndevices: ${Object.keys(DEVICES).join(', ')}`);
    process.exit(opts.help ? 0 : 1);
  }
  if (opts.list) {
    for (const s of catalog.surfaces) console.log(`${s.cluster.padEnd(10)} ${s.id.padEnd(34)} ${(s.status || 'ok').padEnd(8)} ${(s.devices || []).join(',')}  ${s.title}`);
    return;
  }
  const out = path.resolve(opts.out || DEFAULT_OUT);
  const frames = planFrames(catalog, opts);
  if (!frames.length) { console.error('no frames match those filters (blocked surfaces are skipped; see --list)'); process.exit(1); }
  const todo = frames.filter(({ s, d, t, l }) => opts.force || !fs.existsSync(path.join(out, s.id, `${d}-${t}-${l}.png`)));
  console.log(`${frames.length} frames planned, ${frames.length - todo.length} already on disk, ${todo.length} to capture -> ${out}`);
  if (opts.dry) { for (const f of todo) console.log(`  ${f.s.id}/${f.d}-${f.t}-${f.l}`); return; }
  if (!todo.length) return;
  fs.mkdirSync(out, { recursive: true });

  const chrome = process.env.KIWI_CHROMIUM_BIN || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) throw new Error('no Chrome found (set KIWI_CHROMIUM_BIN)');
  const req = createRequire(path.join(ROOT, 'app', 'package.json'));
  const puppeteer = req('puppeteer-core');

  /* servers: the repo as plain web, and the native bundle if any frame needs it */
  const web = await startServer(ROOT, { gate: true });
  let native = { base: 'http://127.0.0.1:0', server: null };
  let wwwDir = null;
  if (todo.some(({ s, d }) => DEVICES[d].native && s.native)) {
    wwwDir = opts.www ? path.resolve(opts.www) : fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-design-capture-www-'));
    if (!opts.www) {
      const { build } = await import(pathToFileURL(path.join(ROOT, 'tools', 'build-app-www.mjs')).href);
      const res = build({ out: wwwDir, quiet: true });
      if (!res || (res.errors && res.errors.length)) throw new Error('native bundle build failed: ' + ((res && res.errors) || []).join(' ; '));
    }
    native = await startServer(wwwDir);
    console.log(`native bundle: ${wwwDir}`);
  }
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--hide-scrollbars', '--force-color-profile=srgb'] });
  const env = { browser, web, native, out, opts };
  const manifest = path.join(out, 'manifest.jsonl');
  let okCount = 0, failed = [];
  const queue = [...todo];
  const worker = async () => {
    while (queue.length) {
      const { s, d, t, l } = queue.shift();
      const file = path.join(out, s.id, `${d}-${t}-${l}.png`);
      let timer;
      const guard = new Promise((resolve) => { timer = setTimeout(() => resolve({ surface: s.id, cluster: s.cluster, device: d, theme: t, lang: l, url: '', steps: [], ok: false, error: `frame exceeded ${opts.frameTimeout / 1000}s (page hung or machine overloaded; try --jobs 1)`, warnings: [], blocked: 0, host: '?', file: path.relative(out, file), ms: opts.frameTimeout, timestamp: new Date().toISOString() }), opts.frameTimeout); });
      let rec = await Promise.race([captureFrame(env, s, d, t, l, file), guard]);
      /* a tab that crashed under load: one clean retry in a fresh context */
      if (!rec.ok && /Not attached|Target closed|Session closed|crashed|Connection closed/i.test(rec.error || '')) {
        rec = await Promise.race([captureFrame(env, s, d, t, l, file), guard]);
        rec.warnings = (rec.warnings || []).concat('frame was retried once after the page crashed');
      }
      clearTimeout(timer);
      fs.appendFileSync(manifest, JSON.stringify(rec) + '\n');
      if (rec.ok) okCount++; else failed.push(rec);
      const warn = rec.warnings.length ? `  ! ${rec.warnings.join(' | ')}` : '';
      console.log(`${rec.ok ? 'ok  ' : 'FAIL'} ${s.id}/${d}-${t}-${l} (${rec.ms} ms)${rec.ok ? '' : '  ' + rec.error}${warn}`);
    }
  };
  try { await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.jobs, 8)) }, worker)); }
  finally {
    await browser.close();
    web.server.close(); if (native.server) native.server.close();
    if (wwwDir && !opts.www && !opts.keepWww) fs.rmSync(wwwDir, { recursive: true, force: true });
  }
  console.log(`done: ${okCount} ok, ${failed.length} failed. manifest: ${manifest}`);
  if (failed.length) process.exitCode = 2;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
}
export { captureFrame, startServer, planFrames, parseArgs, DEVICES as _DEVICES };
