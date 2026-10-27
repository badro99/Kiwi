#!/usr/bin/env node
import { forLocales } from './test-locales.mjs';
/* Skin matrix · the layered skins (shipped, Design 2026/iOS 27 underneath,
 * Design 2027 on top), the two themes, the text direction and the screen size
 * meet in the browser, never in a source file: a rule that is right in one
 * combination can hide a control, paint a dark page light or turn a label
 * italic in another (tenth blind rating, skins#2).
 *
 * For the dashboard, the restaurant till and the boutique till, in each skin
 * (shipped, 2027), theme (light, dark) and size (phone, tablet, desktop), in
 * French (Arabic too with KIWI_LOCALES=fr,ar, owner rule of 26 October):
 *   1. what the page paints matches the theme it says (measured, not the flag);
 *   2. the text direction follows the language;
 *   3. no visible control is transparent, and no visible text is italic
 *      (brand rule; the three depicted exceptions of CLAUDE.md §4 aside);
 *   4. each control's skin-sensitive computed style (display, visibility,
 *      opacity, colours, family, weight, style, radius, direction) matches the
 *      reviewed fingerprint in tools/skin-matrix-baseline.json. A CSS edit
 *      that moves another skin, theme or size shows up here, by name.
 *      KIWI_UPDATE_SKIN_BASELINE=1 rewrites the cells that ran, after review.
 * Demo data, clock pinned, no merchant, no staff code. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { harness, demoPage, sleep, root } from './surface-matrix-lib.mjs';

const BASELINE = path.join(root, 'tools', 'skin-matrix-baseline.json');
const UPDATE = process.env.KIWI_UPDATE_SKIN_BASELINE === '1';
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { version: 1, cells: {} };
const h = await harness('skin-matrix');

const SURFACES = ['dashboard', 'caisse-restaurant', 'caisse-boutique'];
const SKINS = ['shipped', '2027'];
const THEMES = ['light', 'dark'];
const SIZES = ['phone', 'tablet', 'desktop'];

function storageFor(surface, skin, theme) {
  const till = surface !== 'dashboard';
  return {
    'kiwiSkin2027:dashboard': !till && skin === '2027' ? '1' : '0',
    'kiwiSkin2027:till': till && skin === '2027' ? '1' : '0',
    ...(till ? (theme === 'dark' ? { kiwiCaisseTheme: 'dark' } : {}) : { kiwiDashTheme: theme }),
  };
}

async function open(t, surface, skin, theme, locale, size) {
  const { ctx, page } = await demoPage(h, locale, size, storageFor(surface, skin, theme));
  t.defer(() => ctx.close());
  t.watch(page);
  if (theme === 'light' && surface !== 'dashboard') await page.evaluateOnNewDocument(() => { try { localStorage.removeItem('kiwiCaisseTheme'); } catch (_) {} });
  if (surface === 'dashboard') {
    t.step('load the demo dashboard');
    await page.goto(h.base + '/dashboard.html', { waitUntil: 'load', timeout: 60000 });
    await sleep(1500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d|استكشف/.test(x.textContent));
      if (b) b.click();
    });
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-nav="transactions"]', { timeout: 30000 });
    await sleep(1200);
    return { page, region: 'body' };
  }
  t.step('load the demo till');
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  if (surface === 'caisse-restaurant' && skin === '2027') {
    /* The 2027 till counts the opening float on the kit's count sheet. */
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-k-till') && !!document.getElementById('clockin-btn'), { timeout: 30000 });
    await sleep(400);
    await page.evaluate(() => document.getElementById('clockin-btn').click());
    await page.waitForFunction(() => { const c = document.querySelector('k-sheet k-cash-count'); return c && c.shadowRoot && c.shadowRoot.querySelector('[data-kp-key="3"]'); }, { timeout: 15000 });
    const tap = (sel) => page.evaluate((q) => {
      const el = document.querySelector('k-sheet k-cash-count').shadowRoot.querySelector(q);
      if (!el) return false;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, composed: true }));
      el.click();
      return true;
    }, sel);
    for (const k of ['3', '0', '0']) { await tap(`[data-kp-key="${k}"]`); await sleep(80); }
    await tap('[data-w="commit"]');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await page.waitForSelector('.view.is-active', { visible: true, timeout: 20000 });
    await sleep(900);
    return { page, region: 'body' };
  }
  if (surface === 'caisse-restaurant') {
    await page.waitForSelector('.ci-float-chip[data-float="300"]', { visible: true, timeout: 30000 });
    await sleep(600);
    await page.click('.ci-float-chip[data-float="300"]');
    await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled);
    await page.click('#clockin-btn');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await page.waitForSelector('.view.is-active', { visible: true, timeout: 20000 });
    await sleep(900);
    return { page, region: 'body' };
  }
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(500);
  t.step('open the boutique till');
  await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
  await page.waitForSelector('#pos-boutique.is-on', { visible: true, timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.kiwi-greet.is-visible'), { timeout: 8000 });
  await sleep(700);
  return { page, region: 'body' };
}

/* Runs in the page: the probes, the painted background, the direction. */
function measure() {
  const visible = (e) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight * 3;
  };
  const lum = (rgb) => {
    const m = String(rgb).match(/[\d.]+/g); if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map((x) => { const c = Number(x) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const painted = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const bg = getComputedStyle(e).backgroundColor, m = String(bg).match(/[\d.]+/g);
      if (m && (m.length < 4 || Number(m[3]) > 0.5)) return bg;
    }
    return 'rgb(255, 255, 255)';
  };
  const points = [[0.5, 0.5], [0.15, 0.85], [0.85, 0.85], [0.5, 0.2]];
  const shades = points.map(([x, y]) => lum(painted(document.elementFromPoint(innerWidth * x, innerHeight * y) || document.body)));
  const depicted = '.bl-script, .plogo.telquel, [class*="kandisky"], [data-depicted-italic]';
  const sel = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [data-action], h1, h2, h3';
  const counts = Object.create(null), probes = [], italic = [], clear = [];
  /* Kit components (Design 2027) render inside open shadow roots. */
  const all = [];
  const walk = (scope) => {
    for (const e of scope.querySelectorAll('*')) {
      if (e.matches(sel)) all.push(e);
      if (e.shadowRoot) walk(e.shadowRoot);
    }
  };
  walk(document);
  for (const e of all.filter(visible).slice(0, 160)) {
    const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '';
    const name = e.id || e.getAttribute('data-action') || e.getAttribute('data-nav') || e.getAttribute('data-i18n') || cls;
    const base = e.tagName.toLowerCase() + (name ? '#' + name : '');
    counts[base] = (counts[base] || 0) + 1;
    const key = base + ':' + counts[base];
    const s = getComputedStyle(e);
    probes.push([key, [s.display, s.visibility, Number(s.opacity).toFixed(2), s.color, s.backgroundColor,
      s.fontFamily.split(',')[0].trim().replace(/["']/g, ''), s.fontWeight, s.fontStyle, s.borderTopLeftRadius, s.direction].join('|')]);
    if (s.fontStyle === 'italic' && e.textContent.trim() && !e.closest(depicted)) italic.push(key);
    if (Number(s.opacity) < 0.05 && !e.matches('h1,h2,h3') && !e.closest('[aria-hidden="true"]')) clear.push(key);
  }
  return { shades, probes, italic, clear, dir: getComputedStyle(document.body).direction, htmlDir: document.documentElement.dir };
}

const short = (v) => crypto.createHash('sha1').update(v).digest('hex').slice(0, 8);
const cells = [];
for (const locale of forLocales(['fr', 'ar'])) for (const surface of SURFACES) for (const skin of SKINS) for (const theme of THEMES) for (const size of SIZES) cells.push({ locale, surface, skin, theme, size });
const fresh = {};
let drift = 0;

/* Two pages at a time: the gate already runs three browser suites side by side. */
const queue = cells.slice();
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const id = `${c.surface} · ${c.skin} · ${c.theme} · ${c.locale} · ${c.size}`;
    const key = `${c.surface}|${c.skin}|${c.theme}|${c.locale}|${c.size}`;
    await h.S.run(id, async (t) => {
      const { page } = await open(t, c.surface, c.skin, c.theme, c.locale, c.size);
      t.step('measure the painted theme, direction and control styles');
      const m = await page.evaluate(measure);
      const shades = m.shades.filter((x) => x != null);
      const mean = shades.reduce((a, x) => a + x, 0) / Math.max(1, shades.length);
      const problems = [];
      if (c.theme === 'dark' && mean > 0.3) problems.push(`dark theme paints light (mean luminance ${mean.toFixed(2)})`);
      if (c.theme === 'light' && mean < 0.3) problems.push(`light theme paints dark (mean luminance ${mean.toFixed(2)})`);
      const dir = c.locale === 'ar' ? 'rtl' : 'ltr';
      if (m.htmlDir !== dir || m.dir !== dir) problems.push(`direction ${m.htmlDir}/${m.dir}, expected ${dir}`);
      if (m.italic.length) problems.push(`italic text: ${m.italic.slice(0, 6).join(', ')}`);
      if (m.clear.length) problems.push(`transparent controls: ${m.clear.slice(0, 6).join(', ')}`);
      if (m.probes.length < 5) problems.push(`only ${m.probes.length} visible controls: the page did not paint`);
      const now = Object.fromEntries(m.probes.map(([k, v]) => [k, short(v)]));
      fresh[key] = now;
      const was = baseline.cells[key];
      if (!UPDATE) {
        if (!was) problems.push(`no reviewed fingerprint for ${key}: review it, then KIWI_UPDATE_SKIN_BASELINE=1 (KIWI_LOCALES=fr,ar for Arabic)`);
        else {
          const prev = Object.fromEntries(was.split(',').filter(Boolean).map((x) => x.split('=')));
          const changed = Object.keys(now).filter((k) => k in prev && prev[k] !== now[k]);
          const added = Object.keys(now).filter((k) => !(k in prev));
          const gone = Object.keys(prev).filter((k) => !(k in now));
          if (changed.length || added.length || gone.length) {
            drift++;
            const values = Object.fromEntries(m.probes);
            problems.push(`computed styles moved: ${changed.length} changed, ${added.length} new, ${gone.length} gone. `
              + changed.slice(0, 5).map((k) => `${k} now ${values[k]}`).join(' ; ')
              + (added.length ? ` · new ${added.slice(0, 4).join(', ')}` : '') + (gone.length ? ` · gone ${gone.slice(0, 4).join(', ')}` : '')
              + '. If intended: KIWI_UPDATE_SKIN_BASELINE=1');
          }
        }
      }
      assert.equal(problems.length, 0, problems.join('\n'));
      console.log(`  ✓ ${id}: ${m.probes.length} controls, luminance ${mean.toFixed(2)}`);
    });
  }
}
try {
  await Promise.all([worker(), worker()]);
  if (UPDATE) {
    for (const [k, v] of Object.entries(fresh)) baseline.cells[k] = Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([a, b]) => a + '=' + b).join(',');
    const sorted = Object.fromEntries(Object.entries(baseline.cells).sort(([a], [b]) => (a < b ? -1 : 1)));
    fs.writeFileSync(BASELINE, JSON.stringify({ version: 1, cells: sorted }, null, 1) + '\n');
    console.log(`  ✓ fingerprints written for ${Object.keys(fresh).length} cells`);
  }
  console.log(`skin-matrix: ${cells.length} combinations${drift ? `, ${drift} with moved styles` : ''}`);
} finally {
  await h.close();
  await h.S.finish();
}
