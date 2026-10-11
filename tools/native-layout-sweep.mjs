#!/usr/bin/env node
/* Phone layout sweep of the native app: every owner page in every demo store
 * type, every till trade, in light and dark, French, English and Arabic.
 * Local bundle, stubbed native plugins, demo data only: no account, no code,
 * no request leaves the machine.
 *
 * Each screen gets a full-page screenshot and a list of layout findings:
 *   spill          text running out of its own box (a column squeezed to nothing)
 *   overlap        text drawn over other text or over an icon/image
 *   squeezed       a sentence forced into a column narrower than ~90 px
 *   clipped        text cut off by its box without an ellipsis
 *   offscreen      content wider than the phone (outside horizontal scrollers)
 *   page-overflow  the whole page scrolls sideways
 *   white-in-dark  a near-white panel in dark mode
 *   small-target   a control smaller than 36 × 36 pt
 *   tiny-text      text under 10.5 px
 *   card-in-card   a bordered card nested directly in another card
 *
 *   node tools/native-layout-sweep.mjs [--out DIR] [--only owner|till|gates]
 *        [--venues cafeAtlas,maisonMansour] [--trades boutique,spa] [--langs fr,en,ar]
 *        [--themes light,dark] [--pages returns,inventory] [--no-shots]
 *   node tools/native-layout-sweep.mjs --only script --script flow.mjs [--entry owner|till] …
 *        (see sweepScript: walk any deeper screen and capture() it)
 *
 * Writes DIR/report.json and DIR/shots/*.png, prints a summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from './build-app-www.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const list = (name, def) => String(arg(name, def)).split(',').map((s) => s.trim()).filter(Boolean);
const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-sweep-'))));
const shotsDir = path.join(out, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });
const only = arg('only', '');
const venues = list('venues', 'cafeAtlas,maisonMansour,spaBahia');
const trades = list('trades', 'restaurant,pressing,boutique,spa,hotel,fastfood,boulangerie,pizzeria,traiteur,foodtruck,epicerie,pharmacie,librairie,fleuriste,coiffure,gym,autre,maison');
const langs = list('langs', 'fr,en,ar');
const themes = list('themes', 'light,dark');
const pagesFilter = list('pages', '');
const noShots = argv.includes('--no-shots');

const require = createRequire(path.join(root, 'app/package.json'));
const puppeteer = require('puppeteer-core');
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) throw new Error('Chromium required');
const www = path.join(out, 'www');
build({ out: www, quiet: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.resolve(www, '.' + new URL(req.url, 'http://local').pathname);
  if (!p.startsWith(www + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'], protocolTimeout: 120000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* A trade opens behind a 2-3 s welcome greeting (pos-dispatch.js). Shooting
   before it leaves captures the greeting, not the register. */
const greetGone = async (page) => {
  await sleep(600);
  try { await page.waitForFunction(() => !document.querySelector('.kiwi-greet'), { timeout: 8000 }); } catch {}
  await sleep(500);
};
const report = [];

async function phone(lang, theme) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) r.abort(); else r.continue(); });
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument((lang) => {
    localStorage.setItem('kiwiNativeLocale', lang);
    localStorage.setItem('kiwi-employee-language:demo', lang);
    localStorage.setItem('kiwiLang', lang);
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/\(\s*hover\s*:\s*none\s*\)/.test(q)
      ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
      : mm(q));
    const noop = () => Promise.resolve({});
    const plug = new Proxy({}, { get: (_, k) => (k === 'addListener' ? () => ({ remove() {} }) : noop) });
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy({}, { get: () => plug }) };
    window.webkit = { messageHandlers: { kiwiShell: { postMessage(v) { window.__host = v; } } } };
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.documentElement.style;
      s.setProperty('--kiwi-host-safe-top', '62px'); s.setProperty('--kiwi-host-safe-bottom', '34px'); s.setProperty('--kiwi-host-tab-height', '106px');
    });
  }, lang);
  return { page, context };
}

/* Runs in the page. Returns findings for the current screen. */
function audit() {
  const vw = innerWidth, vh = innerHeight, findings = [];
  const seen = new Set();
  const dark = document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.vexelMode === 'dark' || document.documentElement.dataset.caisseTheme === 'dark';
  const name = (el) => {
    if (!el || el.nodeType !== 1) return '';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter((c) => !/^is-|^on$/.test(c)).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };
  const pathOf = (el) => { const parts = []; let n = el; for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) parts.unshift(name(n)); return parts.join(' > '); };
  const add = (kind, el, detail) => {
    const key = kind + '|' + pathOf(el);
    if (seen.has(key)) return;
    seen.add(key);
    const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    findings.push({ kind, where: pathOf(el), text: el ? String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70) : '', box: r ? [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)] : null, detail });
  };
  /* Shown at all: no display:none / hidden / transparent ancestor. A box of
     zero width still shows its text (overflow visible), which is exactly the
     collapsed-column bug, so size is not part of this test. */
  const shown = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      if (n.hasAttribute('hidden')) return false;
    }
    return true;
  };
  const visible = (el) => { if (!shown(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const scrollerX = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return n;
    }
    return null;
  };
  const rgba = (s) => { const m = (s || '').match(/[\d.]+/g) || []; return [+m[0] || 0, +m[1] || 0, +m[2] || 0, m[3] === undefined ? 1 : +m[3]]; };
  const inFixedChrome = (el) => !!el.closest('.kiwi-native-offline,.kiwi-sync-pill,.kiwi-paid,.kw-toast,#toast-stack,.kiwi-toast');

  if (document.documentElement.scrollWidth > vw + 1) findings.push({ kind: 'page-overflow', where: 'html', text: '', box: null, detail: { scrollWidth: document.documentElement.scrollWidth } });

  /* Glyph boxes of every visible text node. */
  const glyphs = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const range = document.createRange();
  const visCache = new Map();
  const isVis = (el) => { if (!visCache.has(el)) visCache.set(el, visible(el)); return visCache.get(el); };
  const shownCache = new Map();
  const isShown = (el) => { if (!shownCache.has(el)) shownCache.set(el, shown(el)); return shownCache.get(el); };
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TITLE)$/.test(el.tagName) || el.closest('svg') || !isShown(el)) continue;
    const cs = getComputedStyle(el);
    if (+cs.opacity < 0.05 || cs.color.endsWith(', 0)')) continue;
    range.selectNodeContents(t);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    /* Parked off the screen (a closed drawer, the hidden sidebar): not seen. */
    if (!rects.length || rects.every((r) => r.right <= 0 || r.left >= vw)) continue;
    for (const r of rects) glyphs.push({ el, r, text: t.nodeValue });
    /* spill: the words run outside the box that should hold them (a grid
       column squeezed to nothing, a fixed width too narrow) and nothing clips
       them, so they paint over whatever sits next door. */
    const box = el.getBoundingClientRect();
    const right = Math.max(...rects.map((r) => r.right)), left = Math.min(...rects.map((r) => r.left));
    if ((right > box.right + 6 || left < box.left - 6) && !/hidden|clip/.test(cs.overflowX) && t.nodeValue.trim().length > 1) add('spill', el, { box: Math.round(box.width), text: Math.round(right - left) });
    /* tiny text */
    if (parseFloat(cs.fontSize) < 10.5 && t.nodeValue.trim().length > 2 && !inFixedChrome(el)) add('tiny-text', el, { size: cs.fontSize });
    /* squeezed sentence */
    const er = el.getBoundingClientRect();
    const words = t.nodeValue.trim().split(/\s+/).length;
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.25;
    /* A tappable list row carries role=button too: only a control the size
       of a button excuses a narrow label, not a whole row. */
    const ctl = el.closest('button,a,[role=button],.chip,.pill,nav,[class*=tab],[class*=pill]');
    if (words >= 3 && er.width < 92 && er.height / lh >= 2.6 && (!ctl || ctl.getBoundingClientRect().width >= 220)) add('squeezed', el, { width: Math.round(er.width), lines: Math.round(er.height / lh) });
    /* clipped */
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && /hidden|clip/.test(cs.overflowX + cs.overflow) && cs.textOverflow !== 'ellipsis' && !el.closest('[class*=marquee],[class*=ticker]')) add('clipped', el, { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
  }

  /* Icons and images. */
  const media = [...document.querySelectorAll('body svg, body img, body [class*="thumb"], body i[style*="--kno-icon"]')]
    .filter((m) => !m.parentElement || !m.parentElement.closest('svg'))
    .filter((m) => isVis(m))
    .map((m) => ({ el: m, r: m.getBoundingClientRect() }))
    .filter((m) => m.r.width >= 8 && m.r.width <= 140 && m.r.height >= 8 && m.r.height <= 140);

  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const layerOf = (el) => { for (let n = el; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
  /* Text over text: compare glyph boxes in nearby rows only. */
  glyphs.sort((a, b) => a.r.top - b.r.top);
  for (let i = 0; i < glyphs.length; i++) {
    const a = glyphs[i];
    for (let j = i + 1; j < glyphs.length && glyphs[j].r.top < a.r.bottom; j++) {
      const b = glyphs[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (layerOf(a.el) !== layerOf(b.el)) continue;
      const area = inter(a.r, b.r);
      if (area > Math.min(a.r.width * a.r.height, b.r.width * b.r.height) * 0.25 && area > 12) add('overlap', a.el, { with: pathOf(b.el), withText: b.text.trim().slice(0, 40) });
    }
  }
  /* Text over an icon or image that is not its own. */
  for (const g of glyphs) {
    for (const m of media) {
      if (m.el.contains(g.el) || g.el.contains(m.el) || m.el.closest('button,a,[role=button],label') === g.el.closest('button,a,[role=button],label') && g.el.closest('button,a,[role=button],label')) continue;
      if (layerOf(g.el) !== layerOf(m.el)) continue;
      const area = inter(g.r, m.r);
      if (area > 30 && area > g.r.width * g.r.height * 0.15) add('overlap', g.el, { withIcon: pathOf(m.el) });
    }
  }

  const all = [...document.querySelectorAll('body *')];
  for (const el of all) {
    if (!isVis(el) || inFixedChrome(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.left >= vw) continue;
    const cs = getComputedStyle(el);
    /* offscreen */
    if ((r.right > vw + 2 || r.left < -2) && r.width < vw * 3 && !scrollerX(el) && cs.position !== 'fixed' && !el.closest('[aria-hidden="true"]')) {
      const hasText = (el.innerText || '').trim().length > 0;
      if (hasText && el.children.length < 6) add('offscreen', el, { left: Math.round(r.left), right: Math.round(r.right) });
    }
    /* white in dark */
    if (dark) {
      const bg = rgba(cs.backgroundColor);
      if (bg[3] > 0.85 && Math.min(bg[0], bg[1], bg[2]) >= 232 && r.width >= 40 && r.height >= 30 && !el.closest('.gk-qr,.kc-sw,mark,.btn-slim,[class*=qr],[class*=swatch],canvas')) add('white-in-dark', el, { bg: cs.backgroundColor });
    }
    /* small targets */
    if (el.matches('button,[role="button"],a[href],[data-action],input[type=checkbox],input[type=radio],select') && !el.closest('[aria-hidden="true"]')) {
      const small = r.width < 36 || r.height < 36;
      const inline = el.tagName === 'A' && cs.display === 'inline';
      if (small && !inline && r.width > 0) add('small-target', el, { w: Math.round(r.width), h: Math.round(r.height) });
    }
    /* card in card */
    const isCard = (n) => { const s = getComputedStyle(n); return parseFloat(s.borderTopLeftRadius) >= 12 && (parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none') && Math.max(parseFloat(s.paddingTop), parseFloat(s.paddingLeft)) >= 8; };
    if (r.width > vw * 0.5 && r.height > 60 && isCard(el)) {
      const parent = el.parentElement, grand = parent && parent.parentElement;
      const host = [parent, grand].find((n) => n && n !== document.body && isCard(n));
      if (host && host.getBoundingClientRect().width - r.width < 60) add('card-in-card', el, { inside: pathOf(host) });
    }
  }
  return findings;
}

async function capture(page, meta) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.kob-root,.drawer-body,.kiwi-modal-body').forEach((n) => { n.scrollTop = 0; }); });
  await sleep(250);
  let findings = [];
  if (process.env.SWEEP_PROBE) { try { console.log(await page.evaluate(new Function(process.env.SWEEP_PROBE))); } catch (e) { console.log('probe error', e.message); } }
  try { findings = await page.evaluate(audit); } catch (e) { findings = [{ kind: 'audit-error', where: '', text: String(e.message).slice(0, 200) }]; }
  const file = [meta.role, meta.store, meta.lang, meta.theme, meta.page].join('__').replace(/[^a-z0-9_.-]+/gi, '-') + '.png';
  if (!noShots) { try { await page.screenshot({ path: path.join(shotsDir, file), fullPage: true }); } catch (_) {} }
  report.push({ ...meta, shot: noShots ? null : 'shots/' + file, findings });
  const counts = findings.reduce((m, f) => { m[f.kind] = (m[f.kind] || 0) + 1; return m; }, {});
  console.log(`  ${meta.role}/${meta.store}/${meta.lang}/${meta.theme}/${meta.page}: ${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ') || 'clean'}`);
}

async function setTheme(page, theme) {
  await page.evaluate((theme) => {
    const h = document.documentElement;
    h.dataset.theme = theme; h.dataset.vexelMode = theme;
    try { localStorage.setItem('kiwiTheme', theme); } catch (_) {}
  }, theme);
  await sleep(400);
}

/* ── Owner dashboard: every destination in every demo store type ───────── */
async function sweepOwner() {
  for (const lang of langs) for (const theme of themes) for (const venue of venues) {
    const { page, context } = await phone(lang, theme);
    try {
      await page.goto(base + '/dashboard.html', { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('.kob-root [data-explore]', { timeout: 30000 });
      await page.click('.kob-root [data-explore]'); await sleep(1200);
      try { await page.click('[data-kiwi-skip]'); } catch (_) {}
      await sleep(2000);
      if (venue !== 'cafeAtlas') { await page.evaluate((v) => window.KiwiVenue && window.KiwiVenue.setVenue(v), venue); await sleep(1500); }
      await setTheme(page, theme);
      const navs = await page.evaluate(() => [...new Set([...document.querySelectorAll('#kw-sidebar [data-nav]')].map((n) => n.getAttribute('data-nav')))]);
      const pages = ['accueil', 'transactions', 'rapport', 'clients'].concat(navs.filter((n) => !['accueil', 'transactions', 'rapport', 'clients'].includes(n)));
      for (const id of pages) {
        if (pagesFilter.length && !pagesFilter.includes(id)) continue;
        try {
          const ok = await page.evaluate((id) => {
            if (['accueil', 'transactions', 'rapport', 'clients'].includes(id) && window.KiwiNativeHostAction) { window.KiwiNativeHostAction({ action: 'navigate', id }); return true; }
            const link = document.querySelector('#kw-sidebar [data-nav="' + id + '"]');
            if (!link) return false;
            link.click();
            return true;
          }, id);
          if (!ok) continue;
          await sleep(1300);
          await page.evaluate(() => { document.body.classList.remove('nav-open', 'kw-menu-open', 'kiwi-native-menu-open'); });
          await capture(page, { role: 'owner', store: venue, lang, theme, page: id });
          /* close any drawer the page opened so the next one starts clean */
          await page.evaluate(() => { document.querySelectorAll('.kiwi-drawer-backdrop,.kiwi-backdrop').forEach((n) => n.remove()); });
        } catch (e) { report.push({ role: 'owner', store: venue, lang, theme, page: id, error: String(e.message).slice(0, 200), findings: [] }); }
      }
    } catch (e) {
      report.push({ role: 'owner', store: venue, lang, theme, page: '*', error: String(e.message).slice(0, 200), findings: [] });
    } finally { await context.close(); }
  }
}

/* ── Till: the restaurant service and every trade register ──────────────── */
async function sweepTill() {
  for (const lang of langs) for (const theme of themes) {
    for (const trade of trades) {
      const { page, context } = await phone(lang, theme);
      try {
        await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1500);
        await page.evaluate((theme) => { document.documentElement.setAttribute('data-caisse-theme', theme); try { localStorage.setItem('kiwiCaisseTheme', theme); } catch (_) {} }, theme);
        if (trade === 'restaurant') {
          await capture(page, { role: 'till', store: trade, lang, theme, page: 'open-till' });
          await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Ouvrir la caisse|Open till|فتح الصندوق/i.test(x.textContent)); if (b) b.click(); });
          await sleep(1800);
          await capture(page, { role: 'till', store: trade, lang, theme, page: 'service' });
          for (const mode of ['salle', 'vrap', 'waitlist']) {
            const ok = await page.evaluate((m) => { const b = document.querySelector('.mode-pill[data-mode="' + m + '"]'); if (!b || b.disabled) return false; b.click(); return true; }, mode);
            if (!ok) continue;
            await sleep(900);
            await capture(page, { role: 'till', store: trade, lang, theme, page: 'mode-' + mode });
          }
        } else {
          const ok = await page.evaluate((t) => { if (!window.KiwiPosDispatch || !window.KiwiPosDispatch.unlockById) return false; window.KiwiPosDispatch.unlockById(t); return true; }, trade);
          if (!ok) throw new Error('KiwiPosDispatch unavailable');
          await greetGone(page);
          await capture(page, { role: 'till', store: trade, lang, theme, page: 'register' });
          /* every tab inside the register */
          const tabs = await page.evaluate(() => {
            const rootEl = document.querySelector('.vx-root') || document.body;
            return [...rootEl.querySelectorAll('[role="tab"],[data-vx-tab],[data-tab],[data-view],[data-section]')]
              .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
              .slice(0, 12).map((b, i) => { b.setAttribute('data-sweep-tab', String(i)); return (b.textContent || '').trim().slice(0, 24) || 'tab' + i; });
          });
          for (let i = 0; i < tabs.length; i++) {
            const clicked = await page.evaluate((i) => { const b = document.querySelector('[data-sweep-tab="' + i + '"]'); if (!b) return false; b.click(); return true; }, i);
            if (!clicked) continue;
            await sleep(900);
            await capture(page, { role: 'till', store: trade, lang, theme, page: 'tab-' + tabs[i] });
          }
        }
      } catch (e) {
        report.push({ role: 'till', store: trade, lang, theme, page: '*', error: String(e.message).slice(0, 200), findings: [] });
      } finally { await context.close(); }
    }
  }
}

/* ── Entry gates: setup, kitchen, team ──────────────────────────────────── */
async function sweepGates() {
  for (const lang of langs) for (const theme of themes) {
    for (const [file, label] of [['index.html', 'setup'], ['kiwi-cuisine.html', 'kitchen-gate'], ['kiwi-serveur.html', 'team-gate'], ['dashboard.html', 'owner-welcome']]) {
      const { page, context } = await phone(lang, theme);
      try {
        await page.goto(base + '/' + file, { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1500);
        await capture(page, { role: 'gate', store: '-', lang, theme, page: label });
      } catch (e) { report.push({ role: 'gate', store: '-', lang, theme, page: label, error: String(e.message).slice(0, 200), findings: [] }); }
      finally { await context.close(); }
    }
  }
}

/* ── Scripted flows: --only script --script FILE [--entry owner|till]
   [--venues V] [--trades T]. FILE is an ES module whose default export gets
   { page, capture(name), sleep, lang, theme, store } once the demo owner (or
   the trade's register) is open, and walks any deeper screen it likes. */
async function sweepScript() {
  const file = path.resolve(arg('script', ''));
  if (!file || !fs.existsSync(file)) throw new Error('--script FILE required');
  const flow = (await import('file://' + file)).default;
  const entry = arg('entry', 'owner');
  const stores = entry === 'till' ? trades : venues;
  for (const lang of langs) for (const theme of themes) for (const store of stores) {
    const { page, context } = await phone(lang, theme);
    const role = entry;
    try {
      if (entry === 'till') {
        await page.goto(base + '/kiwi-caisse.html', { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(1500);
        await page.evaluate((theme) => { document.documentElement.setAttribute('data-caisse-theme', theme); }, theme);
        if (store === 'restaurant') {
          await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Ouvrir la caisse|Open till|فتح الصندوق/i.test(x.textContent)); if (b) b.click(); });
        } else {
          await page.evaluate((t) => window.KiwiPosDispatch && window.KiwiPosDispatch.unlockById(t), store);
        }
        await greetGone(page);
      } else {
        await page.goto(base + '/dashboard.html', { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('.kob-root [data-explore]', { timeout: 30000 });
        await page.click('.kob-root [data-explore]'); await sleep(1200);
        try { await page.click('[data-kiwi-skip]'); } catch (_) {}
        await sleep(2000);
        if (store !== 'cafeAtlas') { await page.evaluate((v) => window.KiwiVenue && window.KiwiVenue.setVenue(v), store); await sleep(1500); }
        await setTheme(page, theme);
      }
      await flow({ page, sleep, lang, theme, store, capture: (name) => capture(page, { role, store, lang, theme, page: name }) });
    } catch (e) {
      report.push({ role, store, lang, theme, page: 'script', error: String(e.message).slice(0, 300), findings: [] });
    } finally { await context.close(); }
  }
}

try {
  if (only === 'script') await sweepScript();
  if (!only || only === 'gates') await sweepGates();
  if (!only || only === 'owner') await sweepOwner();
  if (!only || only === 'till') await sweepTill();
} finally {
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const totals = {};
  for (const s of report) for (const f of s.findings || []) totals[f.kind] = (totals[f.kind] || 0) + 1;
  console.log(`\nnative-layout-sweep: ${report.length} screens · ${Object.entries(totals).map(([k, v]) => k + ' ' + v).join(' · ') || 'no findings'} · errors ${report.filter((s) => s.error).length}`);
  console.log('report: ' + path.join(out, 'report.json'));
}
