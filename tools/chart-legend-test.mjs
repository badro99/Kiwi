#!/usr/bin/env node
/* chart-legend-test · the revenue chart legend (design 2027 §10.22, stage 5),
 * on <k-chart> in a real Chromium.
 *
 *   node tools/chart-legend-test.mjs
 *
 * What it holds, on a day whose baseline peaks in the morning:
 *   · the legend sits in the band reserved at the top of the plot
 *     (ceil(8 + 17.55 x f): 26 at factor 1, 32 at 1.35), at the start edge,
 *     at the right in a right-to-left page;
 *   · no point of either line enters the band;
 *   · the top gridline is the band edge, labelled with the maximum it stands
 *     for, at the end edge; round steps below it, one within 18 left out;
 *   · a solid swatch for today and a dashed one with the baseline in its own
 *     key (yesterday at, or last weekday at);
 *   · no baseline: one swatch and compare.no_data; empty: chart.empty;
 *   · no page error. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };
const norm = (s) => String(s || '').replace(/[\s  ]+/g, ' ').trim();

/* The kit preview carries the dashboard kit (dashboard.js, its strings). Each
   case draws a fresh <k-chart> at 600 wide on a 1366 window (plot 240). */
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.setViewport({ width: 1366, height: 1000 });
await page.setBypassServiceWorker(true);
await page.setRequestInterception(true);
page.on('request', (r) => { const u = r.url(); return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort(); });
// coverage: surface=shell-kit locale=en viewport=desktop
await page.goto(base + '/kit.html', { waitUntil: 'load' });
await page.waitForFunction(() => !!customElements.get('k-chart') && !!window.KiwiFormat, { timeout: 20000 });

/* A cumulative day: today to 17:39 (12.65 h after a 05:00 cutoff), and a
   morning-heavy yesterday that reaches its whole day, 30,100, by 07:00. */
const hours = Array.from({ length: 25 }, (_, h) => h);
const SERIES = {
  today: hours.filter((h) => h <= 12).map((h) => ({ h, v: Math.round(19174 * h / 12.65) })).concat([{ h: 12.65, v: 19174 }]),
  baseline: hours.map((h) => ({ h, v: h >= 2 ? 30100 : Math.round(30100 * h / 2) })),
  cutoff: 5, nowH: 12.65, baselineKey: 'yesterday', baselineTime: '17:39', delta: -1127,
};

const draw = (opts) => page.evaluate(async (o) => {
  document.querySelectorAll('.clt').forEach((n) => n.remove());
  const wrap = document.createElement('div');
  wrap.className = 'clt';
  wrap.style.cssText = 'width:600px;position:relative;';
  /* The text size is the page's (the type tokens are computed on :root). */
  if (o.scale) document.documentElement.style.setProperty('--type-scale', String(o.scale));
  else document.documentElement.style.removeProperty('--type-scale');
  if (o.rtl) wrap.dir = 'rtl';
  const c = document.createElement('k-chart');
  wrap.appendChild(c);
  document.body.appendChild(wrap);
  if (c.syncDir) c.syncDir();
  c.series = o.series;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const R = c.shadowRoot, plot = R.querySelector('.plot'), svg = R.querySelector('svg'), lg = R.querySelector('.lg');
  const pr = plot.getBoundingClientRect(), sr = svg.getBoundingClientRect(), lr = lg.getBoundingClientRect();
  const nums = (d) => (d || '').match(/-?\d+(\.\d+)?/g) || [];
  const ys = [...R.querySelectorAll('path.ln, path.bl')].flatMap((p) => { const n = nums(p.getAttribute('d')).map(Number); return n.filter((_, i) => i % 2 === 1); });
  const grids = [...R.querySelectorAll('line.grid:not(.base)')].map((l) => +l.getAttribute('y1'));
  const labels = [...R.querySelectorAll('text.gl')].map((x) => x.textContent);
  const band = Math.ceil(8 + 17.55 * (o.scale || 1));
  return {
    band, ys, grids, labels, legend: lg.textContent, swatches: lg.querySelectorAll('.sw').length, dashed: lg.querySelectorAll('.sw.d').length,
    lg: { left: lr.left - pr.left, right: pr.right - lr.right, top: lr.top - sr.top, bottom: lr.bottom - sr.top },
    labelAnchor: (R.querySelector('text.gl') || { getAttribute: () => '' }).getAttribute('text-anchor'),
    note: (R.querySelector('.em') || {}).textContent || '', aria: plot.getAttribute('aria-label') || '',
  };
}, opts);

console.log('chart-legend-test');
try {
  let v = await draw({ series: SERIES });
  check(v.band === 26 && v.lg.top >= 0 && v.lg.bottom <= v.band, `the legend sits in the reserved band at the top (band ${v.band}, legend ${v.lg.top.toFixed(1)} to ${v.lg.bottom.toFixed(1)})`);
  check(Math.abs(v.lg.left) < 1, 'at the start edge (left in a left-to-right page)');
  check(v.ys.length > 0 && v.ys.every((y) => y >= v.band - 0.05), `no point of either line enters the band, even a baseline that peaks at 07:00 (top point ${Math.min(...v.ys).toFixed(1)})`);
  check(Math.abs(v.grids[0] - v.band) < 0.05 && v.labels[0] === '30.1K' && v.labelAnchor === 'end', `the top gridline is the band edge, labelled with the maximum it stands for, at the end edge (${v.labels[0]})`);
  check(v.labels.join(',') === '30.1K,10K,20K', `round steps below it, one within 18 of the band edge left out (${v.labels.join(', ')})`);
  check(v.swatches === 2 && v.dashed === 1 && v.legend === 'TodayYesterday at 17:39', `a solid swatch for today, a dashed one named by its own key (${v.legend})`);
  check(/^Revenue today, .* down .* Busiest hour/.test(v.aria), 'the chart is described by chart.summary_down');

  v = await draw({ series: Object.assign({}, SERIES, { baselineKey: 'weekday', weekday: 'Monday' }) });
  check(v.legend === 'TodayLast Monday at 17:39', `a weekday baseline names its day (${v.legend})`);

  v = await draw({ series: SERIES, scale: 1.35 });
  check(v.band === 32 && v.lg.bottom <= v.band && v.ys.every((y) => y >= v.band - 0.05), `at 1.35 the band grows to 32 and still holds the legend (${v.lg.bottom.toFixed(1)})`);

  v = await draw({ series: SERIES, rtl: true });
  check(Math.abs(v.lg.right) < 1 && v.labelAnchor === 'start' && v.ys.every((y) => y >= v.band - 0.05), 'in a right-to-left page the legend starts at the right and the labels sit at the left');

  v = await draw({ series: Object.assign({}, SERIES, { baseline: null, delta: null }) });
  check(v.swatches === 1 && v.legend === 'Today' && /No comparison yet/.test(v.note) && /^Revenue today, .*Busiest hour/.test(v.aria) && !/ (down|up) |level with/.test(v.aria), `no baseline: one swatch, compare.no_data and chart.summary_none (${norm(v.aria)})`);

  v = await draw({ series: { today: [{ h: 0, v: 0 }, { h: 3, v: 0 }], baseline: null, cutoff: 5, nowH: 3 } });
  check(v.labels.length === 0 && /No sales yet today/.test(v.note), `empty: no gridline labels, chart.empty (${v.note})`);
  check(errors.length === 0, 'no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
  await ctx.close();
} finally {
  await browser.close().catch(() => {});
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
console.log(`✓ chart-legend-test · ${checks} checks`);
