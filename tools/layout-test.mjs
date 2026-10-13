#!/usr/bin/env node
/* layout-test · assets/kit/layout.js against spec §13.
 *
 *   · the till width rule (§13.3), one row per band, with every example the
 *     spec gives (iPad mini portrait 744 -> menu 424 and 2 columns, ...);
 *   · the menu column formula min(4, floor((pane - 48 + 16) / (168 + 16)));
 *   · the height rule for payment (§13.3, §18.3): 1018, 578, 514 and below,
 *     and the device table (every landscape iPad is compact, every portrait
 *     iPad is regular);
 *   · size classes: the bill pane is regular at every width, the rail compact;
 *   · the 6-line head block: at most six lines, no layout read, and, run alone
 *     against a stubbed matchMedia and then in a real Chromium, it sets
 *     html[data-k-width] exactly as widthClass() says at every width, and
 *     keeps it current when the viewport changes.
 *   node tools/layout-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SRC = fs.readFileSync(path.join(root, 'assets/kit/layout.js'), 'utf8');
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };
console.log('layout-test');

check(typeof globalThis.window === 'undefined', 'the test runs with no window');
const L = require(path.join(root, 'assets/kit/layout.js'));
check(globalThis.KiwiLayout === L, 'requiring the file in Node runs the head block as a no-op and publishes KiwiLayout');

/* ── bands ─────────────────────────────────────────────────────────────── */
{
  const at = (w) => L.widthClass(w);
  const cases = [[0, 'xs'], [375, 'xs'], [599, 'xs'], [599.5, 'xs'], [600, 'sm'], [744, 'sm'], [767, 'sm'], [768, 'md'], [834, 'md'], [999, 'md'], [1000, 'lg'], [1032, 'lg'], [1179, 'lg'], [1180, 'xl'], [1376, 'xl']];
  for (const [w, c] of cases) assert.equal(at(w), c, `${w} -> ${c}`);
  check(true, 'widthClass: xs < 600, sm 600, md 768, lg 1000, xl 1180');
  assert.deepEqual({ ...L.BREAKS }, { sm: 600, md: 768, lg: 1000, xl: 1180 });
  check(L.widthClass(NaN) === 'xs' && L.widthClass(undefined) === 'xs', 'an unknown width is the phone class, never a crash');
}

/* ── §13.3 · the till ──────────────────────────────────────────────────── */
{
  const t = (w, h) => L.tillLayout(w, h);
  const phone = t(375);
  check(phone.nav === 'capsule' && phone.capsule === 'full' && phone.railWidth === 0 && phone.billMode === 'sheet' && phone.menuWidth === 375 && phone.menuColumns === 2, '< 600: tab capsule, full-width menu in 2 columns, the bill as a sheet');
  check(t(599).billMode === 'sheet' && t(599).menuColumns === 2, '599 is still a phone');

  const mini = t(744);
  check(mini.nav === 'capsule' && mini.capsule === 'menu' && mini.railWidth === 0 && mini.billWidth === 320 && mini.menuWidth === 424 && mini.menuColumns === 2, '744 (iPad mini portrait): capsule over the menu pane only, bill 320, menu 424, 2 columns');
  check(t(600).billWidth === 320 && t(767).billWidth === 320 && t(600).nav === 'capsule', '600 to 767: bill 320');

  const air = t(834);
  check(air.nav === 'rail' && air.capsule === null && air.railWidth === 88 && air.billWidth === 320 && air.menuWidth === 426 && air.menuColumns === 2, '834 (iPad 11 portrait): rail 88, bill 320, menu 426, 2 columns');
  check(t(768).nav === 'rail' && t(999).billWidth === 320, '768 to 999: rail 88, bill 320');

  const p13 = t(1032);
  check(p13.railWidth === 88 && p13.billWidth === 360 && p13.menuWidth === 584 && p13.menuColumns === 3, '1032 (iPad 13 portrait): bill 360, menu 584, 3 columns');
  const mini2 = t(1133);
  check(mini2.billWidth === 360 && mini2.menuWidth === 685 && mini2.menuColumns === 3, '1133 (iPad mini landscape): bill 360, menu 685, 3 columns');
  check(t(1000).billWidth === 360 && t(1179).billWidth === 360, '1000 to 1179: bill 360');

  const l11 = t(1210);
  check(l11.billWidth === 432 && l11.menuWidth === 690 && l11.menuColumns === 3, '1210 (iPad 11 landscape): bill 432, menu 690, 3 columns');
  const l13 = t(1376);
  check(l13.billWidth === 432 && l13.menuWidth === 856 && l13.menuColumns === 4, '1376 (iPad 13 landscape): menu 856, 4 columns');
  check(t(1180).billWidth === 432, '1180 and up: bill 432');

  for (const w of [600, 744, 834, 1032, 1133, 1210, 1376]) {
    const x = t(w);
    assert.equal(x.railWidth + x.menuWidth + x.billWidth, w, `${w}: rail + menu + bill = viewport`);
  }
  check(true, 'rail + menu + bill add up to the viewport at every example width');
  check(t(834).billSize === 'regular' && t(375).billSize === 'regular' && t(834).railSize === 'compact', 'the bill pane is regular at every width, the rail always compact');

  /* Columns: the formula, and its cap. */
  const f = (pane) => Math.min(4, Math.floor((pane - 48 + 16) / (168 + 16)));
  for (let pane = 200; pane <= 1200; pane += 7) assert.equal(L.menuColumns(pane), Math.max(1, f(pane)), `pane ${pane}`);
  check(true, 'menuColumns = min(4, floor((pane - 48 + 16) / 184)), never below 1');
  check(L.menuColumns(10000) === 4 && L.menuColumns(0) === 1, 'at most 4, at least 1');
  check(L.menuColumns(399) === 1 && L.menuColumns(400) === 2 && L.menuColumns(583) === 2 && L.menuColumns(584) === 3 && L.menuColumns(767) === 3 && L.menuColumns(768) === 4, 'the column breaks fall at panes of 400, 584 and 768');
  check(L.tillLayout(600).menuWidth === 280 && L.tillLayout(600).menuColumns === 1, 'at 600 the formula gives 1 column (menu 280); the spec states the rule, not a floor of 2');
}

/* ── §13.3 · height rule for payment ───────────────────────────────────── */
{
  const f = L.paymentForm;
  check(f(1018).form === 'regular' && f(1017).form === 'compact', 'H >= 1018 is regular, 1017 is compact');
  check(f(578).form === 'compact' && f(578).keyHeight === 72 && f(577).form === 'compact-short' && f(577).keyHeight === 56, '578 is the last compact form, 577 steps the keys down to 56');
  check(f(514).form === 'compact-short' && f(514).scrollsPage === false && f(513).scrollsPage === true && f(513).pageMinHeight === 514, '514 still fits; below it the page keeps min-height 514 and scrolls as a whole');
  check(f(1018).keyHeight === 72 && f(1018).scrollsPage === false, 'the regular form has 72-tall keys and no page scroll');
  const devices = [
    ['iPad Pro 13 landscape', 1376, 1032, 432, 'regular'], ['iPad Air 13 landscape', 1366, 1024, 432, 'regular'],
    ['iPad Pro 11 (M4) landscape', 1210, 834, 432, 'compact'], ['iPad Pro 11 earlier landscape', 1194, 834, 432, 'compact'],
    ['iPad Air 11 / iPad 10 landscape', 1180, 820, 432, 'compact'], ['iPad mini landscape', 1133, 744, 360, 'compact'],
    ['iPad 13 portrait', 1032, 1376, 360, 'regular'], ['iPad 11 portrait', 834, 1210, 320, 'regular'], ['iPad mini portrait', 744, 1133, 320, 'regular'],
  ];
  for (const [name, w, h, bill, form] of devices) {
    const x = L.tillLayout(w, h);
    assert.equal(x.billWidth, bill, `${name} bill ${x.billWidth}`);
    assert.equal(x.payment.form, form, `${name} form ${x.payment.form}`);
  }
  check(true, 'the device table of §18.3: bill pane and payment form for nine iPad viewports');
  check(L.tillLayout(1024, undefined).payment === undefined, 'no height, no payment form (the height is optional)');
}

/* ── hosts, dashboard, kitchen ─────────────────────────────────────────── */
{
  check(L.hostSize('bill', 300) === 'regular' && L.hostSize('rail', 1376) === 'compact', 'hostSize: bill regular, rail compact, whatever the width');
  check(L.hostSize('segmented', 375) === 'compact' && L.hostSize('segmented', 834) === 'regular', 'any other host: compact on a phone, regular from 600');
  const el = { a: {}, getAttribute(k) { return this.a[k] ?? null; }, setAttribute(k, v) { this.a[k] = v; } };
  check(L.setSize(el, 'compact') && el.a.size === 'compact' && !L.setSize(el, 'huge') && el.a.size === 'compact' && !L.setSize(null, 'compact'), 'setSize accepts compact and regular only');
  check(L.sidebarWidth('ipad') === 280 && L.sidebarWidth('desktop') === 248, 'dashboard sidebar: 280 on iPad, 248 on desktop');
  assert.deepEqual(L.kpiSpans(4, 2), [1, 1, 1, 1]);
  assert.deepEqual(L.kpiSpans(3, 2), [1, 1, 2]);
  assert.deepEqual(L.kpiSpans(5, 2), [1, 1, 1, 1, 2]);
  assert.deepEqual(L.kpiSpans(5, 4), [1, 1, 1, 1, 1]);
  check(true, 'KPI 2 x 2: an odd count makes the last tile full width');
  check(L.kdsRootPx('S') === 20 && L.kdsRootPx('M') === 24 && L.kdsRootPx('L') === 28 && L.kdsRootPx('X') === 24, 'kitchen root font size: S 20, M 24, L 28');
}

/* ── the head block ────────────────────────────────────────────────────── */
const block = SRC.split('/* head:begin */')[1].split('/* head:end */')[0].trim();
{
  const lines = block.split('\n').filter((l) => l.trim());
  check(lines.length <= 6, `the head block is ${lines.length} lines (at most 6)`);
  check(!/innerWidth|clientWidth|offsetWidth|scrollWidth|getBoundingClientRect|ResizeObserver|getComputedStyle/.test(block), 'it reads no layout: matchMedia listeners only');
  check(/data-k-width/.test(block) && /1180/.test(block) && /1000/.test(block) && /768/.test(block) && /600/.test(block), 'it sets data-k-width from the four breakpoints');

  function fakeWindow(width) {
    const lists = [];
    const win = {
      width,
      document: { documentElement: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } } },
      matchMedia(q) {
        const min = +/min-width:(\d+)px/.exec(q)[1];
        const mql = { min, listeners: [], get matches() { return win.width >= min; }, addEventListener(t, fn) { if (t === 'change') this.listeners.push(fn); } };
        lists.push(mql);
        return mql;
      },
      resize(w) { win.width = w; lists.forEach((m) => m.listeners.forEach((fn) => fn())); },
    };
    return win;
  }
  const run = (win) => { vm.runInNewContext(block.replace("typeof window === 'object' ? window : null", 'win'), { win }); return win.document.documentElement.attrs['data-k-width']; };
  for (const w of [0, 320, 375, 599, 600, 744, 767, 768, 834, 999, 1000, 1133, 1179, 1180, 1376, 2560]) {
    assert.equal(run(fakeWindow(w)), L.widthClass(w), `width ${w}`);
  }
  check(true, 'run against a stubbed matchMedia, it agrees with widthClass() at 16 widths');
  const win = fakeWindow(375);
  run(win);
  win.resize(834);
  assert.equal(win.document.documentElement.attrs['data-k-width'], 'md');
  win.resize(1376);
  assert.equal(win.document.documentElement.attrs['data-k-width'], 'xl');
  win.resize(500);
  assert.equal(win.document.documentElement.attrs['data-k-width'], 'xs');
  check(true, 'and it keeps the attribute current when the width changes');
  assert.doesNotThrow(() => vm.runInNewContext(block.replace("typeof window === 'object' ? window : null", 'null'), {}));
  check(true, 'with no window it does nothing');
}

/* ── a real Chromium: real matchMedia, real viewport changes ───────────── */
{
  let puppeteer;
  try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
  catch { console.log('  ○ puppeteer-core unavailable, browser half skipped'); }
  const bin = process.env.KIWI_CHROMIUM_BIN || process.env.CHROME_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
  if (puppeteer && !bin) console.log('  ○ Chromium unavailable, browser half skipped');
  if (puppeteer && bin) {
    const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const s = suite('layout', { browser });
    await s.run('the head block sets data-k-width from a real matchMedia', async (t) => {
      const page = t.watch(await browser.newPage());
      t.defer(() => page.close());
      await page.setViewport({ width: 375, height: 800 });
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"><title>banc</title></head><body></body></html>');
      await page.addScriptTag({ content: block });
      const read = () => page.evaluate(() => document.documentElement.getAttribute('data-k-width'));
      const widths = [375, 599, 600, 744, 767, 768, 834, 999, 1000, 1133, 1179, 1180, 1376, 599];
      for (const w of widths) {
        await page.setViewport({ width: w, height: 800 });
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        assert.equal(await read(), L.widthClass(w), `viewport ${w}`);
      }
      console.log(`  ✓ real Chromium: ${widths.length} viewport changes, the attribute followed each one with no reload`);
      await page.setContent('<!doctype html><html><head><meta charset="utf-8"><title>banc</title></head><body></body></html>');
      await page.addScriptTag({ path: path.join(root, 'assets/kit/layout.js') });
      assert.equal(await page.evaluate(() => typeof KiwiLayout.tillLayout), 'function');
      assert.equal(await read(), L.widthClass(599), 'the whole file, loaded as a script, runs the same block');
      console.log('  ✓ the whole file loaded as a script runs the same block and publishes window.KiwiLayout');
    });
    await s.finish();
  }
}
console.log('\n✓ layout-test');
