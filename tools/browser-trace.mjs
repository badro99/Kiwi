/* Kiwi · browser-trace.mjs — what a failed browser test leaves behind.
 *
 * Our browser suites (tools/*-browser-test.mjs) print one assertion line when
 * they fail, and check.js keeps the last eight. That is rarely enough: a wrong
 * figure, a second page load, a request that 404'd, an uncaught error three
 * steps earlier all look the same from there. Borrowed from the trace page of
 * tester-army/e2e (Apache-2.0, ideas only, no code copied), adapted to
 * puppeteer-core and to this repo's zero-dependency rule.
 *
 * Four things, one import:
 *
 *   1 · Traces. `watch(page)` records the main-frame loads (with the script
 *       that started each one), console errors and warnings, uncaught
 *       exceptions, failed requests and 4xx/5xx answers, and the steps you
 *       name. When a test run through `run()` throws, it writes
 *       `.kiwi/results/<suite>/<test>/trace.md` with all of it, the
 *       screenshot at failure and the accessibility tree, and prints
 *       `✗ trace <path>` so check.js shows where to look.
 *
 *   2 · Exit codes that say whose fault it is. 1 = the product failed an
 *       assertion. 3 = the environment: no Chromium, a launch or navigation
 *       timeout, a closed target, a refused connection. check-guard.js runs a
 *       suite that exits 3 a second time before calling it red, because those
 *       are what a loaded machine produces.
 *
 *   3 · Secrets as handles. `secret(name, value)` / `secretFromEnv(name, VAR)`
 *       give an object with no way to print its value: String(), JSON and
 *       util.inspect all show `<secret:name>`. `fillSecret()` types it; from
 *       then on that page takes no screenshot (the app may echo the value
 *       anywhere), and every trace, log line and error message passes through
 *       `redact()`. For staff codes on Amira Cafe (CLAUDE.md §6): the value
 *       comes from the environment, never from a file in this repo.
 *
 *   4 · Screenshot baselines. `expectScreenshot(t, pageOrElement, 'name')`
 *       compares against `tools/__screenshots__/<suite>/<name>-<platform>.png`.
 *       The diff runs in Chromium itself (two canvases), so no PNG library is
 *       needed. A mismatch fails and leaves expected / actual / diff in the
 *       results folder; KIWI_UPDATE_SNAPSHOTS=1 rewrites the baseline. A
 *       platform with no baseline yet gets one written and a notice, not a
 *       red run: fonts render differently per OS, and the gate must not go
 *       red on a new machine.
 *
 * Usage:
 *   import { suite } from './browser-trace.mjs';
 *   const s = suite('pwa-first-install', { browser });
 *   await s.run('first visit', async (t) => {
 *     const ctx = await browser.createBrowserContext();
 *     t.defer(() => ctx.close());          // after the trace, not before
 *     const page = t.watch(await ctx.newPage());
 *     t.step('open the dashboard');
 *     ...
 *   });
 *   await s.finish();   // exits 0, 1 or 3
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import util from 'node:util';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const RESULTS = () => process.env.KIWI_RESULTS_DIR || path.join(ROOT, '.kiwi', 'results');
const SHOTS = () => process.env.KIWI_SCREENSHOT_DIR || path.join(ROOT, 'tools', '__screenshots__');

/* ── Secrets ───────────────────────────────────────────────────────────── */

const VALUES = new WeakMap();
const KNOWN = new Map();          // value -> name, for redaction
const kind = Symbol('kiwi.secret');

export function secret(name, value) {
  if (!name || typeof value !== 'string' || !value) throw new Error(`secret ${name || '?'}: no value`);
  const label = `<secret:${name}>`;
  const handle = Object.freeze({
    [kind]: true,
    name,
    toString: () => label,
    toJSON: () => label,
    [util.inspect.custom]: () => label,
    [Symbol.toPrimitive]: () => label,
  });
  VALUES.set(handle, value);
  KNOWN.set(value, name);
  return handle;
}

/* The value lives in the environment (a shell variable, a keychain read into
 * one), never in a file this repo tracks. Missing: null, so a suite can skip
 * the part that needs it instead of failing on someone else's machine. */
export function secretFromEnv(name, envVar) {
  const v = process.env[envVar];
  return v ? secret(name, v) : null;
}

export const isSecret = (x) => !!(x && x[kind]);

export function redact(text) {
  let s = String(text == null ? '' : text);
  /* Longest first, so a value that contains another is replaced whole. */
  for (const [value, name] of [...KNOWN].sort((a, b) => b[0].length - a[0].length)) {
    if (value) s = s.split(value).join(`<secret:${name}>`);
  }
  return s;
}

const PIXELS_OFF = new WeakSet();

/* Types the secret into `selector` (a CSS selector or an ElementHandle). The
 * page then refuses screenshots for the rest of its life. */
export async function fillSecret(page, selector, handle) {
  if (!isSecret(handle)) throw new Error('fillSecret takes a secret() handle, not a plain string');
  PIXELS_OFF.add(page);
  const el = typeof selector === 'string' ? await page.waitForSelector(selector, { visible: true, timeout: 15000 }) : selector;
  await el.click();
  await el.type(VALUES.get(handle));
}

export const pixelsAllowed = (page) => !PIXELS_OFF.has(page);

/* ── Watching a page ───────────────────────────────────────────────────── */

const LIMITS = { console: 100, problems: 200, requests: 100 };

function frameLabel(c) {
  return `${c.functionName || '?'}@${String(c.url || '').split('/').pop().split('?')[0]}:${c.lineNumber}`;
}

function watchPage(page, steps) {
  const rec = { page, loads: [], console: [], problems: [], requests: [] };
  const at = () => (steps.length ? steps[steps.length - 1].name : '(before the first step)');
  const push = (list, max, item) => { if (list.length < max) list.push(item); };
  page.on('request', (r) => {
    try {
      if (!r.isNavigationRequest() || r.frame() !== page.mainFrame()) return;
      const st = ((r.initiator() || {}).stack || {}).callFrames || [];
      rec.loads.push({ url: r.url(), by: st.slice(0, 4).map(frameLabel).join(' < ') || 'browser', step: at() });
    } catch (_) {}
  });
  page.on('console', (m) => {
    const type = m.type();
    const item = { type, text: m.text(), step: at() };
    if (type === 'error' || type === 'warn' || type === 'warning') push(rec.problems, LIMITS.problems, item);
    else push(rec.console, LIMITS.console, item);
  });
  page.on('pageerror', (e) => push(rec.problems, LIMITS.problems, { type: 'uncaught', text: e && e.message || String(e), step: at() }));
  page.on('requestfailed', (r) => push(rec.requests, LIMITS.requests, { status: 'failed', method: r.method(), url: r.url(), why: (r.failure() || {}).errorText || '', step: at() }));
  page.on('response', (r) => {
    const status = r.status();
    if (status >= 400) push(rec.requests, LIMITS.requests, { status, method: r.request().method(), url: r.url(), step: at() });
  });
  return rec;
}

/* ── Error classes ─────────────────────────────────────────────────────── */

/* The environment, not the product: worth one more try on a quieter machine. */
const INFRA = [
  /Navigation timeout of \d+ ms exceeded/i,
  /Timed out after waiting \d+ms/i,
  /Failed to launch the browser process/i,
  /Chromium required|Chromium unavailable|puppeteer-core unavailable/i,
  /Target closed|Session closed|Connection closed|Protocol error .*(Target|Session)/i,
  /net::ERR_CONNECTION_REFUSED|ECONNREFUSED|EADDRINUSE/,
  /browser has disconnected/i,
];
export class InfraError extends Error {}
export function classify(err) {
  if (err instanceof InfraError) return 'infra';
  const text = `${err && err.name || ''} ${err && err.message || err}`;
  return INFRA.some((re) => re.test(text)) ? 'infra' : 'product';
}

/* ── Traces ────────────────────────────────────────────────────────────── */

/* Short inside the repo, absolute outside it. */
const shown = (p) => { const r = path.relative(process.cwd(), p); return r.startsWith('..') ? p : r; };
const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'test';
const fence = (s) => '```text\n' + s + '\n```';

async function within(ms, p) {
  let timer;
  try { return await Promise.race([p, new Promise((_, no) => { timer = setTimeout(() => no(new Error('timeout')), ms); })]); }
  finally { clearTimeout(timer); }
}

function axText(node, depth = 0, out = [], max = 400) {
  if (!node || out.length >= max) return out;
  const bits = [node.role, node.name ? JSON.stringify(node.name) : '', node.value != null && node.value !== '' ? `= ${JSON.stringify(String(node.value))}` : '', node.checked ? '[checked]' : '', node.disabled ? '[disabled]' : ''].filter(Boolean);
  if (node.role !== 'none' && node.role !== 'generic' || node.name) out.push('  '.repeat(depth) + bits.join(' '));
  for (const c of node.children || []) axText(c, depth + 1, out, max);
  return out;
}

async function writeTrace(dir, { suiteName, testName, err, kind: klass, steps, pages, ms }) {
  fs.mkdirSync(dir, { recursive: true });
  const L = [];
  L.push(`# ✗ ${suiteName} › ${testName}`, '');
  L.push(`${klass === 'infra' ? '**environment** (exit 3: the machine, Chromium or the server, not the product)' : '**product** (exit 1: an assertion failed)'} · ${(ms / 1000).toFixed(1)} s`, '');
  L.push(fence(redact(err && (err.stack || err.message) || String(err)).split('\n').slice(0, 12).join('\n')), '');
  L.push('## Steps', '');
  if (!steps.length) L.push('(none named)');
  steps.forEach((s, i) => L.push(`${i + 1}. ${redact(s.name)} · +${((s.at - steps[0].at) / 1000).toFixed(1)} s`));
  L.push('');
  for (const [i, rec] of pages.entries()) {
    const p = rec.page;
    const tag = pages.length > 1 ? ` ${i + 1}` : '';
    L.push(`## Page${tag}`, '');
    let url = '';
    try { url = p.url(); } catch (_) {}
    L.push(`At: ${redact(url) || '(closed)'}`, '');
    L.push(`### Main-frame loads (${rec.loads.length})`, '');
    rec.loads.forEach((l, j) => L.push(`${j + 1}. ${redact(l.url)} · started by \`${l.by}\` · during « ${redact(l.step)} »`));
    L.push('');
    const probs = rec.problems.slice(0, 50);
    L.push(`### App errors and warnings (${rec.problems.length})`, '');
    if (!probs.length) L.push('(none)');
    probs.forEach((x) => L.push(`- **${x.type}** · « ${redact(x.step)} » · ${redact(x.text).slice(0, 400)}`));
    L.push('');
    L.push(`### Failed requests and 4xx/5xx (${rec.requests.length})`, '');
    if (!rec.requests.length) L.push('(none)');
    rec.requests.slice(0, 50).forEach((x) => L.push(`- ${x.status} ${x.method} ${redact(x.url)}${x.why ? ' · ' + x.why : ''} · « ${redact(x.step)} »`));
    L.push('');
    if (p.isClosed && p.isClosed()) { L.push('(page closed before the failure: no screen)', ''); continue; }
    if (!pixelsAllowed(p)) {
      L.push('### Screen at failure', '', 'No screenshot: a secret was typed on this page, and the app may show it anywhere.', '');
    } else {
      try {
        const file = `screen${tag.trim() ? '-' + tag.trim() : ''}.png`;
        await within(5000, p.screenshot({ path: path.join(dir, file) }));
        L.push('### Screen at failure', '', `![screen at failure](${file})`, '');
      } catch (_) { L.push('### Screen at failure', '', '(the page did not answer within 5 s)', ''); }
    }
    try {
      const tree = await within(5000, p.accessibility.snapshot({ interestingOnly: true }));
      const lines = axText(tree);
      if (lines.length) L.push('### Accessibility tree at failure', '', fence(redact(lines.join('\n'))), '');
    } catch (_) {}
  }
  const file = path.join(dir, 'trace.md');
  fs.writeFileSync(file, L.join('\n') + '\n');
  return file;
}

/* ── Screenshot comparison, inside Chromium ────────────────────────────── */

/* Compares two PNG buffers. `threshold` is the per-channel difference (0-255)
 * a pixel may have before it counts as changed. Returns the count, the ratio
 * and a diff PNG: changed pixels in red over a faded copy of the actual. */
export async function diffPngs(browser, expected, actual, { threshold = 32 } = {}) {
  const ctx = browser.defaultBrowserContext ? browser.defaultBrowserContext() : browser;
  const page = await ctx.newPage();
  try {
    return await page.evaluate(async (a, b, thr) => {
      const load = (b64) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error('not a PNG')); im.src = 'data:image/png;base64,' + b64; });
      const [ea, eb] = await Promise.all([load(a), load(b)]);
      if (ea.width !== eb.width || ea.height !== eb.height) return { sizeMismatch: true, expected: [ea.width, ea.height], actual: [eb.width, eb.height], changed: ea.width * ea.height, ratio: 1, diff: null };
      const w = ea.width, h = ea.height;
      const px = (im) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0); return g.getImageData(0, 0, w, h).data; };
      const da = px(ea), db = px(eb);
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const og = out.getContext('2d'); const od = og.createImageData(w, h);
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
        if (d > thr) { changed++; od.data[i] = 230; od.data[i + 1] = 30; od.data[i + 2] = 40; od.data[i + 3] = 255; }
        else { const y = (db[i] * 0.3 + db[i + 1] * 0.59 + db[i + 2] * 0.11) | 0; od.data[i] = od.data[i + 1] = od.data[i + 2] = 200 + (y >> 3); od.data[i + 3] = 255; }
      }
      og.putImageData(od, 0, 0);
      return { sizeMismatch: false, changed, ratio: changed / (w * h), diff: out.toDataURL('image/png').split(',')[1] };
    }, expected.toString('base64'), actual.toString('base64'), threshold);
  } finally { await page.close().catch(() => {}); }
}

const platformKey = () => (process.env.KIWI_SCREENSHOT_PLATFORM || os.platform());

/* ── The suite ─────────────────────────────────────────────────────────── */

export function suite(suiteName, { browser = null } = {}) {
  let failed = 0, infra = 0, passed = 0;
  const notices = [];
  const resultsDir = path.join(RESULTS(), slug(suiteName));

  async function run(testName, fn) {
    const steps = [];
    const pages = [];
    const deferred = [];
    const t = {
      suite: suiteName,
      name: testName,
      browser,
      dir: path.join(resultsDir, `${slug(testName)}-${crypto.createHash('sha1').update(testName).digest('hex').slice(0, 8)}`),
      watch(page) { pages.push(watchPage(page, steps)); return page; },
      step(name) { steps.push({ name, at: Date.now() }); },
      recorder(page) { return pages.find((r) => r.page === page) || null; },
      loads(page) { const r = t.recorder(page); return r ? r.loads : []; },
      notice(msg) { notices.push(msg); console.log('  ○ ' + redact(msg)); },
      /* Cleanup that must wait for the trace (closing a context, a page):
         a `finally` inside the test body would close the page before its
         screen is captured. Runs last-in first-out, pass or fail. */
      defer(fn) { deferred.push(fn); },
    };
    const cleanup = async () => { while (deferred.length) { try { await deferred.pop()(); } catch (_) {} } };
    const t0 = Date.now();
    try {
      await fn(t);
      passed++;
      await cleanup();
      return true;
    } catch (err) {
      const klass = classify(err);
      if (klass === 'infra') infra++; else failed++;
      console.log(`  ✗ ${redact(testName)} · ${redact(err && err.message || err).split('\n')[0]}`);
      try {
        const file = await writeTrace(t.dir, { suiteName, testName, err, kind: klass, steps, pages, ms: Date.now() - t0 });
        console.log(`  ✗ trace ${shown(file)}`);
      } catch (e) { console.log(`  ✗ (no trace written: ${e.message})`); }
      await cleanup();
      return false;
    }
  }

  async function finish({ exit = true } = {}) {
    const code = failed ? 1 : infra ? 3 : 0;
    console.log(`\n${suiteName}: ${passed} passed${failed ? `, ${failed} failed` : ''}${infra ? `, ${infra} failed on the environment` : ''}`);
    if (exit) { process.exitCode = code; if (browser) await browser.close().catch(() => {}); process.exit(code); }
    return code;
  }

  return { run, finish, resultsDir, get counts() { return { passed, failed, infra }; } };
}

/* Fails the test (by throwing) when the screen or element no longer matches
 * its baseline. `target` is a Page or an ElementHandle. */
export async function expectScreenshot(t, target, name, { threshold = 32, maxDiffRatio = 0.002, page = null } = {}) {
  const owner = page || (typeof target.goto === 'function' ? target : (target.frame && typeof target.frame.page === 'function' ? target.frame.page() : null));
  if (owner && !pixelsAllowed(owner)) throw new Error(`expectScreenshot(${name}): refused, a secret was typed on this page`);
  if (!t.browser) throw new Error('expectScreenshot needs suite(name, { browser })');
  const file = `${slug(name)}-${platformKey()}.png`;
  const baseline = path.join(SHOTS(), slug(t.suite), file);
  const actual = Buffer.from(await target.screenshot({ type: 'png' }));
  const update = process.env.KIWI_UPDATE_SNAPSHOTS === '1';
  if (!fs.existsSync(baseline) || update) {
    fs.mkdirSync(path.dirname(baseline), { recursive: true });
    const existed = fs.existsSync(baseline);
    if (existed && update) {
      const r = await diffPngs(t.browser, fs.readFileSync(baseline), actual, { threshold });
      if (!r.sizeMismatch && r.ratio <= maxDiffRatio) return { written: false, ratio: r.ratio };
    }
    fs.writeFileSync(baseline, actual);
    t.notice(`${existed ? 'updated' : 'new'} screenshot baseline ${shown(baseline)}: look at it, then commit it`);
    return { written: true, ratio: 0 };
  }
  const r = await diffPngs(t.browser, fs.readFileSync(baseline), actual, { threshold });
  if (!r.sizeMismatch && r.ratio <= maxDiffRatio) return { written: false, ratio: r.ratio };
  fs.mkdirSync(t.dir, { recursive: true });
  const base = slug(name);
  fs.writeFileSync(path.join(t.dir, `${base}-expected.png`), fs.readFileSync(baseline));
  fs.writeFileSync(path.join(t.dir, `${base}-actual.png`), actual);
  if (r.diff) fs.writeFileSync(path.join(t.dir, `${base}-diff.png`), Buffer.from(r.diff, 'base64'));
  const what = r.sizeMismatch ? `size ${r.actual.join('×')} instead of ${r.expected.join('×')}` : `${r.changed} pixels changed (${(r.ratio * 100).toFixed(2)} %, allowed ${(maxDiffRatio * 100).toFixed(2)} %)`;
  throw new Error(`screenshot « ${name} » no longer matches ${shown(baseline)}: ${what}. Expected, actual and diff are in ${shown(t.dir)}; if the change is intended, rerun with KIWI_UPDATE_SNAPSHOTS=1`);
}
