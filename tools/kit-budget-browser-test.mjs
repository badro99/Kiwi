#!/usr/bin/env node
/* Kiwi · kit-budget-browser-test · the root census and the 200-tile render
 * budget (spec §19, §20.6).
 *
 * Root census. Two compositions built from the kit as the hero frames use it:
 * Home (§18.1: nav, date button, compare, range segmented, chart, KPI grid,
 * list, tab capsule) and the till's bill frame (§18.3: rail, search field,
 * Enter amount, category segmented, menu grid, bill panel, sync indicator).
 * Every shadow root in the page is counted, nested ones included; each frame
 * must stay inside §20.6's count for it, and the page inside §19's 60. The gallery is not a hero frame: it puts every
 * component on one page and is reported, not held.
 *
 * Render budget. §19 asks for a 200-tile menu's first render in ≤ 16 ms of
 * style recalculation and ≤ 50 ms in all, on iOS 15.8 on an iPhone 6s. That
 * device run belongs to the capture harness and is NOT what this suite
 * measures. Here, as a proxy that fails early on a regression, Chromium with
 * the CPU throttled 4× renders the same menu five times on a fresh element;
 * the median of the warm runs must fit the same two numbers. The first run
 * also pays for compiling the component and building its stylesheet; it is
 * held to 100 ms and printed, since on a device that cost lands on the first
 * menu a cashier opens. A pass here says the kit did not get slower; it does
 * not say iOS 15.8 is inside budget.
 *
 *   node tools/kit-budget-browser-test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { kitBrowser, settle, ROOT } from './kit-browser.mjs';
import { suite } from './browser-trace.mjs';

console.log('kit-budget-browser-test');
const kitHtml = fs.readFileSync(path.join(ROOT, 'kit.html'), 'utf8');
const scripts = [...kitHtml.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => !/gallery\.js/.test(s));
const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="kiwi-sprite" content="${/name="kiwi-sprite" content="([^"]+)"/.exec(kitHtml)[1]}">
<link rel="stylesheet" href="${/href="(assets\/kit\/tokens-2027\.css[^"]*)"/.exec(kitHtml)[1]}">
<link rel="stylesheet" href="${/href="(assets\/kit\/kit\.css[^"]*)"/.exec(kitHtml)[1]}"></head><body>`;
const tail = (fixture) => `${scripts.map((s) => `<script src="${s}"></script>`).join('\n')}
<script>
  const $ = (s) => document.querySelector(s);
  const menu = (n) => { const secs = []; for (let s = 0; s * 25 < n; s++) { const items = []; for (let i = 0; i < 25 && s * 25 + i < n; i++) items.push({ id: 's' + s + 'i' + i, name: 'Tajine ' + (s * 25 + i), price: 25 + i * 5, options: i % 4 === 1 }); secs.push({ id: 'c' + s, title: 'Category ' + (s + 1), items }); } return secs; };
  window.__menu = menu;
  ${fixture}
  document.body.setAttribute('data-ready', '');
</script></body></html>`;

const home = head + `
<k-page-header id="nav" heading="Amira Cafe"></k-page-header>
<k-date-button id="date"></k-date-button>
<k-compare id="cmp" delta="-1127" delta-kind="money" polarity="up-good" baseline="vs yesterday at 17:39"></k-compare>
<k-segmented id="range" label="Range"></k-segmented>
<k-chart id="chart"></k-chart>
<k-kpi-grid id="kpi"></k-kpi-grid>
<k-list id="list" label="Orders"></k-list>
<k-tabbar id="tabs"></k-tabbar>` + tail(`
  $('#range').options = [{ value: 'today', label: 'Today' }, { value: 'd7', label: '7 days' }, { value: 'd30', label: '30 days' }];
  $('#chart').series = { today: [{ h: 5, v: 0 }, { h: 12, v: 9000 }], baseline: [{ h: 5, v: 0 }, { h: 24, v: 20000 }], cutoff: 5, nowH: 12, baselineKey: 'yesterday', baselineTime: '17:39', delta: -1127 };
  $('#kpi').tiles = [{ key: 'orders', label: 'Orders', value: '86', delta: 4 }, { key: 'avg_ticket', label: 'Basket', value: '222.95', delta: -13 }, { key: 'card_share', label: 'Card', value: '82', delta: 1, deltaKind: 'pts' }, { key: 'returning', label: 'Returning', value: '31', delta: 2 }];
  $('#list').rows = [1, 2, 3].map((i) => ({ id: 'o' + i, icon: 'payments', title: 'Table ' + i, value: '230.00 MAD' }));
  $('#tabs').items = [{ id: 'home', icon: 'home', label: 'Home' }, { id: 'orders', icon: 'receipt_long', label: 'Orders' }, { id: 'more', icon: 'more_horiz', label: 'More' }];
`);

const till = head + `
<k-rail id="rail"></k-rail>
<k-field id="search" label="Search"></k-field>
<k-button id="amount" variant="secondary" label="Enter amount"></k-button>
<k-segmented id="cats" label="Categories"></k-segmented>
<k-menu-grid id="menu"></k-menu-grid>
<div style="height:640px"><k-bill id="bill"></k-bill></div>
<k-badge id="sync" label="Synced"></k-badge>` + tail(`
  $('#rail').items = [{ id: 'till', icon: 'point_of_sale', label: 'Till' }, { id: 'orders', icon: 'receipt_long', label: 'Orders' }];
  $('#cats').options = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ value: 'c' + i, label: 'Category ' + i }));
  $('#menu').sections = menu(200);
  $('#bill').bill = { title: 'Table 4', lines: [1, 2, 3, 4, 5].map((i) => ({ id: 'l' + i, qty: i, name: 'Harira', price: 30 })), total: 450 };
`);

const bench = head + `<div id="host"></div>` + tail('');

const kb = await kitBrowser('kit-budget', { '/__kit-home.html': home, '/__kit-till.html': till, '/__kit-bench.html': bench });
const s = suite('kit-budget', { browser: kb.browser });
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

const census = (page) => page.evaluate(() => {
  const per = {};
  let n = 0;
  const walk = (root) => root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) { n++; per[el.localName] = (per[el.localName] || 0) + 1; walk(el.shadowRoot); }
  });
  walk(document);
  return { n, per };
});

/* §20.6's count for the frame, and what the kit nests by design on top of it. */
for (const [label, url, spec] of [['Home', '/__kit-home.html', 8], ['Till, bill', '/__kit-till.html', 7]]) {
  await s.run(label, async (t) => {
    const page = t.watch(await kb.open(url, { width: 1180, height: 820 }));
    const c = await census(page);
    const nested = Object.entries(c.per).filter(([k]) => !['k-page-header', 'k-date-button', 'k-compare', 'k-segmented', 'k-chart', 'k-kpi-grid', 'k-list', 'k-tabbar', 'k-rail', 'k-field', 'k-button', 'k-menu-grid', 'k-bill', 'k-badge'].includes(k) || c.per[k] > 1);
    console.log(`    ${label}: ${c.n} roots · ${Object.entries(c.per).map(([k, v]) => k + (v > 1 ? '×' + v : '')).join(', ')}`);
    check(c.n <= spec, `${label}: ${c.n} shadow roots, within §20.6's ${spec}${nested.length ? ' (nested: ' + nested.map(([k, v]) => k + '×' + v).join(', ') + ')' : ''}`);
    check(c.n <= 60, `${label}: inside §19's 60 per page`);
    if (url === '/__kit-till.html') {
      const tiles = await page.evaluate(() => document.querySelector('#menu').shadowRoot.querySelectorAll('.tile').length);
      check(tiles === 200 && !c.per['k-menu-tile'], `the menu grid holds its 200 tiles in its one root (${tiles})`);
    }
    check(page.__errors.length === 0, `${label}: no page errors`);
  });
}

await s.run('the gallery, reported', async (t) => {
  const page = t.watch(await kb.open('/kit.html'));
  const c = await census(page);
  console.log(`    gallery: ${c.n} roots across every component (not a hero frame; §19's 60 applies to product pages)`);
  check(c.n > 0, `the gallery's census runs (${c.n})`);
  /* §19, kit CSS inside the shadow roots ≤ 18 KB gzip: every distinct sheet
     the gallery's roots adopt (or hold as a <style> below iOS 16.4), which is
     every component type, read back from the browser as it parsed it. */
  const sheets = await page.evaluate(() => {
    const seen = new Set();
    const walk = (root) => root.querySelectorAll('*').forEach((el) => {
      const sr = el.shadowRoot;
      if (!sr) return;
      (sr.adoptedStyleSheets || []).forEach((sh) => seen.add([...sh.cssRules].map((r) => r.cssText).join('\n')));
      sr.querySelectorAll('style').forEach((st) => seen.add(st.textContent));
      walk(sr);
    });
    walk(document);
    return [...seen];
  });
  const bytes = zlib.gzipSync(sheets.join('\n'), { level: 9 }).length;
  check(sheets.length >= 30 && bytes <= 18 * 1024, `kit CSS inside the roots: ${sheets.length} sheets, ${(bytes / 1024).toFixed(1)} KB gzip, budget 18 KB`);
});

await s.run('200-tile menu render, Chromium 4× CPU proxy', async (t) => {
  const page = t.watch(await kb.open('/__kit-bench.html', { width: 1180, height: 820 }));
  const cdp = await page.target().createCDPSession();
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const runs = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { document.getElementById('host').innerHTML = ''; });
    await settle(page, 80);
    const before = await metric();
    const total = await page.evaluate(() => {
      const t0 = performance.now();
      const g = document.createElement('k-menu-grid');
      document.getElementById('host').appendChild(g);
      g.sections = window.__menu(200);
      g.shadowRoot.querySelector('.tile').getBoundingClientRect();
      document.body.offsetHeight;
      return performance.now() - t0;
    });
    const after = await metric();
    runs.push({ total, style: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000, layout: (after.LayoutDuration - before.LayoutDuration) * 1000 });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const warm = runs.slice(1);                                  /* the first run compiles the component */
  const med = (k) => warm.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(warm.length / 2)];
  const style = med('style'), total = med('total'), layout = med('layout');
  console.log(`    median of ${warm.length}: style ${style.toFixed(1)} ms · layout ${layout.toFixed(1)} ms · total ${total.toFixed(1)} ms (first run ${runs[0].total.toFixed(1)} ms)`);
  check(style <= 16, `style recalculation ${style.toFixed(1)} ms ≤ 16 ms (Chromium proxy; the iOS 15.8 device run is the capture harness's)`);
  check(total <= 50, `render ${total.toFixed(1)} ms ≤ 50 ms in all, warm median (Chromium proxy)`);
  check(runs[0].total <= 100, `cold first render, compile included, ${runs[0].total.toFixed(1)} ms ≤ 100 ms (Chromium proxy; over §19's 50 is reported, not hidden)`);
  check(page.__errors.length === 0, 'no page errors');
});

await kb.close();
console.log(`✓ kit-budget-browser-test · ${checks} contrôles`);
await s.finish();
