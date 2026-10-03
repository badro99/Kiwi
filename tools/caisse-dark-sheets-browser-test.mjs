#!/usr/bin/env node
// #0156 / #0160: render the real boutique sheets with the real caisse palette.
// Browser regression only, not native touch proof or production merchant proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { paintedActionColours } from './painted-png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] }));
const executablePath = process.env.KIWI_CHROMIUM_BIN || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(fs.existsSync);
assert.ok(executablePath, 'Chromium required');
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-dark-sheets-'));
let browser, checks = 0, expectsDark = true;
const failures = [];
function check(value, label) {
  checks++;
  if (!value) { failures.push(label); console.error('✗ ' + label); }
}
function rgb(css) {
  const parts = css.match(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi)?.map(Number);
  assert.ok(parts?.length >= 3, 'Expected computed RGB: ' + css);
  // Chromium preserves color-mix() as color(srgb ...), whose channels are
  // normalized to 0..1. rgb()/rgba() channels are already in 0..255.
  const scale = /^color\(srgb\s/.test(css) ? 255 : 1;
  return [...parts.slice(0, 3).map(channel => channel * scale), parts[3] ?? 1];
}
assert.deepEqual(rgb('rgb(10, 15, 13)'), [10, 15, 13, 1]);
assert.deepEqual(rgb('rgba(10, 15, 13, 0.6)'), [10, 15, 13, .6]);
assert.deepEqual(rgb('color(srgb 1 0.5 0 / 0.6)'), [255, 127.5, 0, .6]);
function over(a, b) { return a.slice(0, 3).map((c, i) => c * a[3] + b[i] * (1 - a[3])); }
function luminance(a) {
  const f = a.slice(0, 3).map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
async function inspect(page, selector, label, { action = false, painted = false, control = false, darkSurface = expectsDark, frameSample = false } = {}) {
  await page.waitForSelector(selector, { visible: true });
  // Sample the settled surface, not an intermediate opacity in a 300 ms card
  // entrance. Do not disable animations or change the application stylesheet.
  await page.waitForFunction(selector => {
    for (let el = document.querySelector(selector); el; el = el.parentElement) {
      if (el.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect.getTiming().iterations))) return false;
    }
    return true;
  }, {}, selector);
  const paint = await page.$eval(selector, (el) => {
    const css = getComputedStyle(el), layers = [];
    for (let p = el; p; p = p.parentElement) layers.push(getComputedStyle(p).backgroundColor);
    return { foreground: css.color, layers, border: css.borderTopColor, borderWidth: parseFloat(css.borderTopWidth),
      gradient: css.backgroundImage, visible: el.getClientRects().length > 0, opacity: css.opacity,
      forest: css.getPropertyValue('--forest'), actionFill: css.getPropertyValue('--caisse-action-fill') };
  });
  let bg = [247, 245, 240];
  for (const color of paint.layers.reverse()) bg = over(rgb(color), bg);
  const foreground = over(rgb(paint.foreground), bg);
  const ratio = contrast(foreground, bg);
  // A primary action is deliberately a bright brand plate, so test its actual
  // ink/fill instead of requiring the action itself to have a dark background.
  if (!action) check(paint.visible && (darkSurface ? luminance(bg) < .12 : luminance(bg) > .7),
    label + ': ' + (darkSurface ? 'dark' : 'warm light') + ' surface, got ' + JSON.stringify(bg));
  check(ratio >= 4.5, label + ': text contrast ' + ratio.toFixed(2) + ':1 (' + paint.foreground + ')' +
    (ratio < 4.5 ? ' styles=' + JSON.stringify(paint) : ''));
  if (action || painted) {
    const element = await page.$(selector);
    // Element screenshots can scroll a fixed popover and move its anchor
    // between the style read and capture. Sample that action from the original
    // full frame, without asking the renderer to scroll or crop the element.
    const shotPath = path.join(shots, label.replace(/[^a-z0-9-]+/gi, '-') + '.png');
    const cssBounds = frameSample ? await element.boundingBox() : null;
    const scale = page.viewport()?.deviceScaleFactor || 1;
    const bounds = cssBounds ? Object.fromEntries(Object.entries(cssBounds).map(([key, value]) => [key, value * scale])) : null;
    const bytes = frameSample ? await page.screenshot({ type: 'png', path: shotPath, captureBeyondViewport: false })
      : await element.screenshot({ type: 'png', path: shotPath });
    const colours = paintedActionColours(bytes, foreground, bounds);
    const paintedRatio = contrast(colours.foreground, colours.background);
    check(paintedRatio >= 4.5, label + ': PAINTED text contrast ' + paintedRatio.toFixed(2) + ':1 ' + JSON.stringify(colours));
    if (action) {
      let parent = [247, 245, 240];
      for (const color of paint.layers.slice(0, -1)) parent = over(rgb(color), parent);
      check(contrast(colours.background, parent) >= 3, label + ': action boundary must clear 3:1');
    }
  }
  if (control) {
    const edge = paint.borderWidth ? over(rgb(paint.border), bg) : bg;
    check(contrast(edge, bg) >= 3, label + ': control edge contrast ' + contrast(edge, bg).toFixed(2) + ':1');
    const placeholder = await page.$eval(selector, el => {
      if (!el.matches('input,textarea') || !el.placeholder) return null;
      const style = getComputedStyle(el, '::placeholder');
      return { foreground: style.color, opacity: Number(style.opacity) };
    });
    if (placeholder) {
      const colour = rgb(placeholder.foreground); colour[3] *= placeholder.opacity;
      const placeholderRatio = contrast(over(colour, bg), bg);
      check(placeholderRatio >= 4.5, label + ': placeholder contrast ' + placeholderRatio.toFixed(2) + ':1');
    }
  }
  if (!action) {
    const runs = await page.$eval(selector, root => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), out = [];
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        if (el.closest('svg,script,style,:disabled,[aria-hidden="true"]') || !el.getClientRects().length) continue;
        const css = getComputedStyle(el), layers = [];
        if (css.visibility !== 'visible') continue;
        for (let p = el; p; p = p.parentElement) layers.push(getComputedStyle(p).backgroundColor);
        out.push({ text: node.textContent.trim().slice(0, 50), foreground: css.color, layers,
          large: parseFloat(css.fontSize) >= (parseInt(css.fontWeight) >= 700 ? 18.66 : 24) });
      }
      return out;
    });
    for (const run of runs) {
      let surface = [247, 245, 240];
      for (const color of run.layers.reverse()) surface = over(rgb(color), surface);
      const ratio = contrast(over(rgb(run.foreground), surface), surface);
      check(ratio >= (run.large ? 3 : 4.5), label + ': label "' + run.text + '" contrast ' + ratio.toFixed(2) + ':1');
    }
  }
  return { bg, ratio, paint };
}
try {
  const base = await new Promise((resolve, reject) => {
    let output = '', errors = '';
    const timer = setTimeout(() => reject(new Error('Fixture timeout: ' + errors)), 15000);
    fixture.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/);
      if (match) { clearTimeout(timer); resolve(JSON.parse(match[1]).base); }
    });
    fixture.stderr.on('data', chunk => { errors += chunk; });
    fixture.once('exit', code => { clearTimeout(timer); reject(new Error('Fixture exited ' + code + ': ' + errors)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const [name, attrs] of [
    ['light', {}],
    ['caisse', { 'data-caisse-theme': 'dark' }],
    ['legacy', { 'data-theme': 'dark' }],
    ['vexel', { 'data-vexel-mode': 'dark' }],
    ['legacy-with-light-flags', { 'data-theme': 'dark', 'data-caisse-theme': 'light', 'data-vexel-mode': 'light' }],
  ]) {
    expectsDark = Object.values(attrs).includes('dark');
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() !== 'GET' && request.method() !== 'HEAD') writes.push(request.url()); });
    await page.setViewport({ width: 1280, height: 860 });
    // Demo sales are seeded 24–170 minutes before Date.now(). At midnight
    // they correctly belong to Yesterday, not the default Today filter.
    // Freeze only this synthetic fixture's wall clock at local noon; leave
    // real timers, transitions, date filters and production data untouched.
    await page.evaluateOnNewDocument(() => {
      const RealDate = Date, noon = new RealDate(2026, 9, 2, 12).getTime();
      globalThis.Date = class extends RealDate {
        constructor(...args) { super(...(args.length ? args : [noon])); }
        static now() { return noon; }
      };
    });
    await page.evaluateOnNewDocument(flags => document.addEventListener('DOMContentLoaded', () => {
      for (const [key, value] of Object.entries(flags)) document.documentElement.setAttribute(key, value);
    }), attrs);
    await page.goto(base + '/boutique.html', { waitUntil: 'load' });
    await page.addScriptTag({path:path.join(ROOT,'assets/lucide.min.js')});
    const forest = await page.$eval('html', el => getComputedStyle(el).getPropertyValue('--forest').trim());
    check(forest === (expectsDark ? '#17B98A' : '#0B6E4F'),
      name + ': the fixture loads the actual inline caisse palette, not missing/default tokens');
    await inspect(page, '.kiwi-dna-nav-label', name + ' invariant Ink rail label', { darkSurface: true });
    await page.waitForSelector('#bq-tk-client', { visible: true });
    await page.click('#bq-tk-client');
    await inspect(page, '#bq-clientm', name + ' client search');
    await inspect(page, '#bq-clientm .modal-subtle', name + ' search help');
    await page.type('#bq-cl-q', "Personne d'atelier");
    await inspect(page, '#bq-clientm .bq-empty', name + ' client empty');
    await page.click('#bq-cl-new');
    await inspect(page, '#bq-cl-name', name + ' client name field', { control: true });
    await inspect(page, '#bq-cl-create', name + ' client create action', { action: true });
    await page.click('#bq-cl-name', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.click('#bq-cl-create');
    await inspect(page, '#toast-stack .toast', name + ' missing name notification');
    await inspect(page, '#toast-stack .toast-title', name + ' notification label');
    await page.click('#bq-clientm [data-bq-close]');
    await page.click('#bq-tk-reset');
    await page.click('[data-bq-item="prod_2"]');
    await inspect(page, '#bq-sheetm', name + ' product sheet');
    await inspect(page, '#bq-sheet-add', name + ' product action', { action: true });
    await page.click('[data-bq-rem="5"]');
    await inspect(page, '#bq-approvem', name + ' discount approval');
    await page.click('#bq-approvem [data-bq-close]');
    await page.click('#bq-sheet-add');
    await page.click('#bq-validate');
    await page.waitForSelector('[data-bq-m="especes"]', { visible: true });
    await inspect(page, '#bq-paym', name + ' payment methods');
    await page.click('[data-bq-m="especes"]');
    await inspect(page, '#bq-paym .cash-input-label', name + ' cash label');
    await inspect(page, '#bq-cash-ok', name + ' cash action', { action: true });
    await page.click('#bq-paym [data-bq-close]');
    await page.click('#bq-validate');
    await page.waitForSelector('[data-bq-m="carte"]', { visible: true });
    await page.click('[data-bq-m="carte"]');
    await inspect(page, '#bq-paym', name + ' card sheet');
    await inspect(page, '#bq-card-ok', name + ' card action', { action: true });
    await inspect(page, '#bq-reader-status.is-success', name + ' card ready status', {painted:true,frameSample:true});
    await page.click('#bq-paym [data-bq-close]');
    await page.click('[data-bq-view="echanges"]');
    await page.waitForSelector('[data-bq-pick]', { visible: true });
    await page.click('[data-bq-pick]');
    await inspect(page, '[data-bq-do-avoir]', name + ' return action', { action: true });
    await page.click('[data-bq-view="inventaire"]');
    await inspect(page, '#bqi-count', name + ' inventory action', { action: true });
    await page.click('#bqi-intake');
    await inspect(page, '#bq-invmm', name + ' stock intake');
    await page.click('#bqx-done');
    await page.click('[data-bq-view="scan"]');
    await page.click('#bq-scan-diag');
    await inspect(page, '#bq-invmm', name + ' scan diagnostic');
    await page.click('#bq-invmm button[data-inv-x]');
    await page.click('[data-bq-view="clientes"]');
    await inspect(page, '#kcb-add', name + ' customer book create action', { action: true });
    await page.click('#kcb-add');
    await inspect(page, '#kcb-sheet .kcb-card', name + ' customer book form');
    for (const field of ['name', 'phone', 'email', 'bday', 'gender', 'city', 'address', 'notes']) {
      await inspect(page, '#kcb-f-' + field + (field === 'gender' ? ' + .kiwi-select .kiwi-select-trigger' : ''),
        name + ' customer book ' + field, { control: true });
    }
    const birthday = await page.$eval('#kcb-f-bday', el => {
      const style = getComputedStyle(el), box = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect();
      return { minWidth: style.minWidth, appearance: style.appearance, minHeight: style.minHeight, height: box.height,
        fits: box.left >= parent.left - 1 && box.right <= parent.right + 1 };
    });
    check(birthday.minWidth === '0px' && birthday.appearance === 'none' && birthday.fits,
      name + ': birthday field cannot use the iOS intrinsic width to overflow its column');
    check(birthday.minHeight === '48px' && birthday.height >= 48,
      name + ': an empty iOS birthday field keeps the full-height touch target');
    const dropdown = await page.$eval('#kcb-f-gender', el => {
      const trigger = el.nextElementSibling?.querySelector('.kiwi-select-trigger');
      return { hiddenNative: el.classList.contains('kiwi-select-native'),
        height: trigger?.getBoundingClientRect().height,
        iconCount: trigger?.querySelectorAll('.kiwi-select-chevron svg').length,
        labelled: trigger?.getAttribute('aria-label').startsWith(el.labels[0]?.textContent + ':'),
        duplicateIcon: getComputedStyle(el.parentElement, '::after').content !== 'none' };
    });
    check(dropdown.hiddenNative && dropdown.height >= 48,
      name + ': the ACTUAL visible Kiwi dropdown stays a full-height touch target');
    check(dropdown.iconCount === 1 && !dropdown.duplicateIcon,
      name + ': the visible dropdown has exactly one Material chevron');
    check(dropdown.labelled, name + ': the dropdown is labelled by its field, not generic Choose');
    await inspect(page, '#kcb-f-save', name + ' customer book save action', { action: true });
    await page.click('#kcb-f-save');
    const validation = await page.$eval('#toast-stack .toast:last-child', el => ({
      warning: el.classList.contains('is-warn'), role: el.getAttribute('role')
    }));
    check(validation.warning && validation.role === 'alert',
      name + ': blank customer validation is an announced warning, never a success checkmark');
    // The desktop backdrop is display:none; the phone stylesheet enables it.
    // Keep this a real pointer journey at the SE width, not value-only proof.
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2 });
    await page.click('#kcb-f-gender + .kiwi-select .kiwi-select-trigger');
    await inspect(page, '.kiwi-select-popover', name + ' actual dropdown options');
    await inspect(page, '.kiwi-select-option[aria-selected="true"]', name + ' selected dropdown action', { action: true, frameSample: true });
    await page.click('.kiwi-select-option[data-option-index="1"]');
    check(await page.$eval('#kcb-f-gender', el => el.value) === 'Femme',
      name + ': an actual option tap updates the original form value');
    await page.click('#kcb-f-cancel');
    check(await page.$eval('#kcb-sheet', el => getComputedStyle(el).display === 'none'),
      name + ': a REAL Cancel tap must close the form after dropdown selection; an invisible backdrop cannot swallow it');
    check(errors.length === 0, name + ': no page errors: ' + errors.join(' | '));
    check(writes.length === 0, name + ': read-only UI pass');
    await context.close();
  }
  console.log('Screenshot checks: ' + shots);
  assert.equal(failures.length, 0, failures.length + ' rendered sheet contrast regressions');
  console.log('✓ Caisse sheets · ' + checks + ' rendered checks in light and all three dark theme systems');
} finally {
  if (browser) await browser.close();
  fixture.kill('SIGTERM');
}
