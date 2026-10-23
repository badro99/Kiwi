#!/usr/bin/env node
/* icon-render-test · design 2027 §8, "How a symbol is referenced (the revision 5
 * preview bug)".
 *
 * Each <symbol> keeps Material's viewBox "0 -960 960 960". The element that
 * references it is
 *     <svg width="1em" height="1em" aria-hidden="true"><use href="#name" width="100%" height="100%"/></svg>
 * and carries NO viewBox of its own. With a second viewBox on the outer <svg>,
 * the <use> is laid out at y 0 to 960 inside a view that spans -960 to 0, the
 * glyph paints off-canvas and the icon is an empty box, with no error anywhere.
 *
 * "tools/icon-render-test.mjs loads the kit gallery and the preview and fails
 *  when any k-icon (or preview icon) has a <use> whose client rect does not
 *  intersect its <svg>'s rect with an area above zero."
 *
 * Three pages are loaded in Chromium:
 *   · every generated sprite (assets/icons/material/sprite.<surface>.svg),
 *     referenced from outside the file the way a shell will, one icon per symbol;
 *   · the spec's preview (docs/specs/kiwi-design-2027-preview.html);
 *   · the kit gallery (kit.html) once stage 2 lands it; until then a notice.
 * and a control page that draws the bug on purpose, which the same measurement
 * must flag, so the test is seen to be able to fail.
 *
 *   node tools/icon-render-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const require = createRequire(import.meta.url);
const sprite = require('./build-icon-sprite.js');
const ICONS = 'assets/icons/material';

/* The symbol ids of each sprite, read from the files the shell will serve. */
const sprites = fs.readdirSync(path.join(root, ICONS)).filter((f) => /^sprite\.[a-z0-9-]+\.svg$/.test(f)).sort().map((f) => ({
  file: f, ids: [...fs.readFileSync(path.join(root, ICONS, f), 'utf8').matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]),
}));

const GOOD = (href) => `<svg width="24" height="24" aria-hidden="true"><use href="${href}" width="100%" height="100%"/></svg>`;
const BAD = (href) => `<svg width="24" height="24" viewBox="0 -960 960 960" aria-hidden="true"><use href="${href}" width="100%" height="100%"/></svg>`;
const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>icons</title><style>body{margin:16px;background:#F7F5F0;color:#0A0F0D}svg{display:inline-block;margin:4px;vertical-align:top;overflow:hidden}</style></head><body>${body}</body></html>`;

const FIXTURE = {
  '/__icons/sprites.html': page(sprites.map((s) => `<section data-sprite="${s.file}">${s.ids.map((id) => GOOD(`/${ICONS}/${s.file}?v=1#${id}`)).join('')}</section>`).join('')),
  /* The bug on purpose: the same icons with the outer viewBox the spec bans. */
  '/__icons/control.html': page(sprites.map((s) => `<section>${s.ids.map((id) => BAD(`/${ICONS}/${s.file}?v=1#${id}`)).join('')}</section>`).join('')),
};

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (FIXTURE[pathname]) { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end(FIXTURE[pathname]); return; }
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end(); return; }
  if (pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not-found"}'); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('icon-render', { browser });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (yes, msg) => { assert.ok(yes, msg); console.log('  ✓ ' + msg); };

/* Runs in the page. Every <svg> that draws an icon (a direct <use> child), in
   the document and inside open shadow roots (the kit's <k-icon> keeps its svg in
   one). Returns what was measured and what failed. */
function measureIcons() {
  const icons = [];
  const walk = (rootNode) => {
    rootNode.querySelectorAll('svg').forEach((svg) => {
      const use = [...svg.children].find((c) => c.localName === 'use');
      if (use) icons.push({ svg, use });
    });
    rootNode.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) walk(el.shadowRoot); });
  };
  walk(document);
  const out = { total: icons.length, hidden: 0, measured: 0, bad: [], viewBox: [] };
  for (const { svg, use } of icons) {
    const a = svg.getBoundingClientRect();
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    if (a.width === 0 || a.height === 0) { out.hidden++; continue; } // not laid out (display:none): nothing to compare
    out.measured++;
    if (svg.hasAttribute('viewBox')) out.viewBox.push(href);
    const b = use.getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (!(w > 0 && h > 0 && w * h > 0)) out.bad.push(`${href}  svg ${Math.round(a.left)},${Math.round(a.top)} ${Math.round(a.width)}x${Math.round(a.height)}  use ${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}`);
  }
  return out;
}

async function load(t, url, { settle = 600 } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const p = t.watch(await ctx.newPage());
  await p.setViewport({ width: 1100, height: 900 });
  t.step('open ' + url);
  // coverage: surface=shell-kit locale=en viewport=tablet
  await p.goto(base + url, { waitUntil: 'load', timeout: 60000 });
  /* External <use> references arrive after load: wait until every icon has a non-empty box, or give up and measure. */
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const pending = await p.evaluate(() => [...document.querySelectorAll('svg > use')].filter((u) => { const r = u.getBoundingClientRect(); return u.ownerSVGElement && u.ownerSVGElement.getBoundingClientRect().width > 0 && r.width === 0 && r.height === 0; }).length);
    if (!pending) break;
    await sleep(100);
  }
  await sleep(settle);
  return p;
}

try {
  /* 1 · every generated sprite, referenced from outside, the way the shell will */
  await S.run('every sprite draws its icons inside their box', async (t) => {
    check(sprites.length > 0 && sprites.every((s) => s.ids.length > 0), `${sprites.length} sprite(s) to draw: ${sprites.map((s) => `${s.file} (${s.ids.length})`).join(', ')}`);
    const p = await load(t, '/__icons/sprites.html');
    const r = await p.evaluate(measureIcons);
    const expected = sprites.reduce((n, s) => n + s.ids.length, 0);
    assert.equal(r.measured, expected, `measured ${r.measured} of ${expected} icons (${r.hidden} not laid out)`);
    assert.deepEqual(r.bad, [], 'icons whose <use> does not intersect their <svg>:\n' + r.bad.join('\n'));
    check(true, `${r.measured} sprite icons: every <use> rect intersects its <svg> rect with an area above zero`);
    assert.deepEqual(r.viewBox, [], 'referencing <svg> carries a viewBox');
    check(true, 'none of the referencing <svg> elements carries a viewBox of its own');
    /* and they paint: the first icon of each sprite has ink in its box */
    const ink = await p.evaluate(async () => {
      const out = [];
      for (const s of document.querySelectorAll('section[data-sprite]')) {
        const svg = s.querySelector('svg');
        const r = svg.getBoundingClientRect();
        out.push({ file: s.dataset.sprite, w: r.width, h: r.height });
      }
      return out;
    });
    for (const i of ink) {
      const shot = await (await p.$(`section[data-sprite="${i.file}"] svg`)).screenshot({ encoding: 'base64' });
      const painted = await p.evaluate(async (b64) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const bg = [d[0], d[1], d[2]];
        let n = 0; for (let k = 0; k < d.length; k += 4) if (Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 60) n++;
        return n;
      }, shot);
      assert.ok(painted > 20, `${i.file}: the first icon paints nothing (${painted} inked pixels)`);
    }
    check(true, `the first icon of each of the ${ink.length} sprite(s) paints ink (the box is not empty)`);
  });

  /* 2 · the control: the banned markup must be flagged */
  await S.run('the revision 5 bug is detected', async (t) => {
    const p = await load(t, '/__icons/control.html');
    const r = await p.evaluate(measureIcons);
    assert.ok(r.measured > 0, 'the control measured nothing');
    assert.equal(r.bad.length, r.measured, `the control should fail every icon: ${r.bad.length} of ${r.measured} flagged`);
    assert.equal(r.viewBox.length, r.measured, 'and every control <svg> carries a viewBox');
    check(true, `the banned markup (outer viewBox) is flagged on all ${r.measured} control icons: the measurement can fail`);
  });

  /* 3 · the spec's preview */
  const preview = '/docs/specs/kiwi-design-2027-preview.html';
  if (fs.existsSync(path.join(root, preview))) {
    await S.run('the preview draws its icons inside their box', async (t) => {
      const p = await load(t, preview, { settle: 1200 });
      const r = await p.evaluate(measureIcons);
      assert.ok(r.total > 50, `only ${r.total} preview icons found`);
      assert.ok(r.measured > 0, 'no preview icon was laid out');
      assert.deepEqual(r.bad, [], 'preview icons whose <use> does not intersect their <svg>:\n' + r.bad.slice(0, 12).join('\n'));
      assert.deepEqual(r.viewBox, [], 'preview icons whose referencing <svg> carries a viewBox');
      check(true, `${r.measured} preview icons laid out (${r.hidden} in hidden frames): every <use> intersects its <svg>, none carries a viewBox`);
    });
  }

  /* 4 · the kit gallery */
  if (fs.existsSync(path.join(root, 'kit.html'))) {
    await S.run('the kit gallery draws every k-icon inside its box', async (t) => {
      const p = await load(t, '/kit.html', { settle: 1200 });
      const r = await p.evaluate(measureIcons);
      assert.ok(r.measured > 0, 'the gallery drew no icon');
      assert.deepEqual(r.bad, [], 'k-icon whose <use> does not intersect its <svg>:\n' + r.bad.slice(0, 12).join('\n'));
      assert.deepEqual(r.viewBox, [], 'k-icon whose <svg> carries a viewBox');
      check(true, `${r.measured} kit gallery icons: every <use> intersects its <svg>, none carries a viewBox`);
    });
  } else console.log('  ○ kit.html does not exist yet (stage 2): the gallery is not loaded; the sprites and the preview are');
} finally {
  server.close();
}
await S.finish();
