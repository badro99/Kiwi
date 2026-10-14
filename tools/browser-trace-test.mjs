#!/usr/bin/env node
/* browser-trace · proves tools/browser-trace.mjs in a real Chromium:
 *   · a failed test leaves trace.md (cleanup deferred until after it) with its steps, every main-frame load and
 *     the script that started it, console errors, uncaught exceptions, failed
 *     requests and 4xx/5xx, the screen and the accessibility tree;
 *   · an assertion is exit 1, a navigation timeout is exit 3 (the environment);
 *   · a secret prints as <secret:name> everywhere, is typed for real, and
 *     after it is typed the page takes no screenshot and the trace has none;
 *   · a screenshot baseline is written once, matches itself, fails on a real
 *     change with expected / actual / diff on disk, and is rewritten on
 *     KIWI_UPDATE_SNAPSHOTS=1.
 *   node tools/browser-trace-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import util from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-trace-'));
process.env.KIWI_RESULTS_DIR = path.join(tmp, 'results');
process.env.KIWI_SCREENSHOT_DIR = path.join(tmp, 'shots');
delete process.env.KIWI_UPDATE_SNAPSHOTS;
const T = await import(pathToFileURL(path.join(root, 'tools/browser-trace.mjs')).href);

const PAGES = {
  '/app': `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Banc</title></head><body style="margin:0;background:#F7F5F0">
<h1>Caisse de banc</h1><button type="button">Encaisser</button><label>Code <input id="code" type="password"></label>
<div id="box" style="width:120px;height:60px;background:#0B6E4F"></div>
<script>
console.error('le total ne tombe pas juste');
fetch('/missing.json');
fetch('/boom');
setTimeout(() => { throw new Error('cassé après le chargement'); }, 0);
if (!sessionStorage.getItem('again')) { sessionStorage.setItem('again', '1'); setTimeout(function reloadOnce() { location.reload(); }, 50); }
</script></body></html>`,
  '/plain': `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#F7F5F0">
<div id="box" style="width:120px;height:60px;background:#0B6E4F"></div><label>Code <input id="code" type="password"></label></body></html>`,
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x').pathname;
  if (u === '/boom') { res.writeHead(500); res.end('no'); return; }
  if (u === '/slow') return; /* never answers */
  const body = PAGES[u];
  res.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' });
  res.end(body || '');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox'] });
const quiet = (fn) => async (...a) => { const log = console.log; console.log = () => {}; try { return await fn(...a); } finally { console.log = log; } };

let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

try {
  /* 1 · A product failure leaves a full trace. */
  {
    const s = T.suite('banc', { browser });
    let ctx;
    const ok = await quiet(s.run)('le total du ticket', async (t) => {
      ctx = await browser.createBrowserContext();
      t.defer(() => ctx.close());
      const page = t.watch(await ctx.newPage());
      t.step('ouvrir la caisse');
      await page.goto(base + '/app');
      await new Promise((r) => setTimeout(r, 1200));
      t.step('vérifier le total');
      assert.equal('12,00 MAD', '15,00 MAD', 'le total affiché');
    });
    check(ok === false, 'a failing test reports failure without stopping the suite');
    const dir = fs.readdirSync(s.resultsDir).map((d) => path.join(s.resultsDir, d))[0];
    const trace = fs.readFileSync(path.join(dir, 'trace.md'), 'utf8');
    check(/# ✗ banc › le total du ticket/.test(trace) && /\*\*product\*\* \(exit 1/.test(trace), 'trace.md names the test and calls it a product failure');
    check(/1\. ouvrir la caisse/.test(trace) && /2\. vérifier le total/.test(trace), 'the named steps are listed in order');
    check(/Main-frame loads \(2\)/.test(trace) && /started by `reloadOnce@app:/.test(trace), 'both main-frame loads are listed, the second with the script that started it');
    check(/le total ne tombe pas juste/.test(trace) && /\*\*uncaught\*\*.*cassé après le chargement/.test(trace), 'console errors and uncaught exceptions are in the trace, with their step');
    check(/- 404 GET .*\/missing\.json/.test(trace) && /- 500 GET .*\/boom/.test(trace), '4xx and 5xx answers are in the trace');
    check(fs.existsSync(path.join(dir, 'screen.png')) && /!\[screen at failure\]\(screen\.png\)/.test(trace), 'the screen at failure is saved and linked');
    check(/button "Encaisser"/.test(trace), 'the accessibility tree at failure is in the trace');
    check(!browser.browserContexts().includes(ctx), 'cleanup passed to t.defer() ran after the trace, not before it');
    check(await s.finish({ exit: false }) === 1, 'an assertion failure makes the suite exit 1');
  }

  /* 2 · The environment is exit 3. */
  {
    const s = T.suite('banc-env', { browser });
    await quiet(s.run)('une page qui ne répond pas', async (t) => {
      const page = t.watch(await browser.newPage());
      await page.goto(base + '/slow', { timeout: 800 });
    });
    check(T.classify(new Error('Navigation timeout of 800 ms exceeded')) === 'infra' && T.classify(new assert.AssertionError({ message: 'x' })) === 'product', 'timeouts are the environment, assertions are the product');
    check(await s.finish({ exit: false }) === 3, 'a suite that only failed on the environment exits 3');
    const dir = fs.readdirSync(s.resultsDir).map((d) => path.join(s.resultsDir, d))[0];
    check(/\*\*environment\*\* \(exit 3/.test(fs.readFileSync(path.join(dir, 'trace.md'), 'utf8')), 'its trace says environment, not product');
  }

  /* 3 · Secrets are handles. */
  {
    const FAKE = 'banc-pas-un-vrai-code-7731';
    const pin = T.secret('code-caisse', FAKE);
    check(String(pin) === '<secret:code-caisse>' && `${pin}` === '<secret:code-caisse>' && JSON.stringify({ pin }) === '{"pin":"<secret:code-caisse>"}' && util.inspect(pin) === '<secret:code-caisse>', 'a secret prints as <secret:name> through String, templates, JSON and inspect');
    check(T.redact(`code tapé : ${FAKE}.`) === 'code tapé : <secret:code-caisse>.', 'redact() replaces a known value');
    check(T.secretFromEnv('absent', 'KIWI_BANC_NO_SUCH_VAR') === null, 'a secret missing from the environment is null, so a suite can skip');
    await assert.rejects(() => T.fillSecret(null, '#code', FAKE), /secret\(\) handle/);
    check(true, 'fillSecret refuses a plain string');

    const s = T.suite('banc-secret', { browser });
    const lines = [];
    const log = console.log; console.log = (m) => lines.push(String(m));
    let typed = '';
    try {
      await s.run('le code ne fuit pas', async (t) => {
        const page = t.watch(await browser.newPage());
        await page.goto(base + '/plain');
        await T.fillSecret(page, '#code', pin);
        typed = await page.$eval('#code', (e) => e.value);
        await page.evaluate((v) => console.error('saisi : ' + v), typed);
        await assert.rejects(() => T.expectScreenshot(t, page, 'après le code'), /refused, a secret was typed/);
        throw new Error('échec volontaire, valeur ' + typed);
      });
    } finally { console.log = log; }
    check(typed === FAKE, 'fillSecret typed the real value into the field');
    const dir = fs.readdirSync(s.resultsDir).map((d) => path.join(s.resultsDir, d))[0];
    const trace = fs.readFileSync(path.join(dir, 'trace.md'), 'utf8');
    check(!trace.includes(FAKE) && /saisi : <secret:code-caisse>/.test(trace) && /valeur <secret:code-caisse>/.test(trace), 'the value appears nowhere in the trace, the console line and the error are redacted');
    check(!fs.existsSync(path.join(dir, 'screen.png')) && /No screenshot: a secret was typed/.test(trace), 'after a secret fill the trace has no screenshot');
    check(!lines.join('\n').includes(FAKE), 'and nothing printed to the terminal holds the value');
  }

  /* 4 · Screenshot baselines. */
  {
    const s = T.suite('banc-visuel', { browser });
    const notices = [];
    let page;
    const passed = await quiet(s.run)('la pastille', async (t) => {
      const n = t.notice; t.notice = (m) => { notices.push(m); n(m); };
      page = t.watch(await browser.newPage());
      await page.setViewport({ width: 300, height: 120 });
      await page.goto(base + '/plain');
      const box = await page.$('#box');
      const first = await T.expectScreenshot(t, box, 'boîte verte');
      assert.ok(first.written, 'first run writes the baseline');
      const again = await T.expectScreenshot(t, box, 'boîte verte');
      assert.ok(!again.written && again.ratio === 0, 'second run matches');
    });
    const file = path.join(process.env.KIWI_SCREENSHOT_DIR, 'banc-visuel', `boite-verte-${os.platform()}.png`);
    check(passed && fs.existsSync(file) && notices.some((m) => /new screenshot baseline/.test(m)), 'a missing baseline is written with a notice, then the same screen matches it');

    let failure = null;
    await quiet(s.run)('la pastille a changé', async (t) => {
      t.watch(page);
      await page.evaluate(() => { document.getElementById('box').style.background = '#7DF2B0'; });
      try { await T.expectScreenshot(t, await page.$('#box'), 'boîte verte'); } catch (e) { failure = e; throw e; }
    });
    check(failure && /no longer matches .*7200 pixels changed \(100\.00 %/.test(failure.message), 'a real change fails the comparison and says how much changed');
    const dir = fs.readdirSync(s.resultsDir).map((d) => path.join(s.resultsDir, d)).find((d) => /a-change/.test(d));
    check(['boite-verte-expected.png', 'boite-verte-actual.png', 'boite-verte-diff.png'].every((f) => fs.existsSync(path.join(dir, f))), 'expected, actual and diff are left in the results folder');

    await quiet(s.run)('la pastille a changé de taille', async (t) => {
      await page.evaluate(() => { document.getElementById('box').style.width = '80px'; });
      try { await T.expectScreenshot(t, await page.$('#box'), 'boîte verte'); } catch (e) { failure = e; throw e; }
    });
    check(/size 80×60 instead of 120×60/.test(failure.message), 'a size change says so');

    process.env.KIWI_UPDATE_SNAPSHOTS = '1';
    const updated = await quiet(s.run)('mise à jour voulue', async (t) => {
      const r = await T.expectScreenshot(t, await page.$('#box'), 'boîte verte');
      assert.ok(r.written);
    });
    delete process.env.KIWI_UPDATE_SNAPSHOTS;
    const after = await quiet(s.run)('après la mise à jour', async (t) => {
      const r = await T.expectScreenshot(t, await page.$('#box'), 'boîte verte');
      assert.ok(!r.written && r.ratio === 0);
    });
    check(updated && after, 'KIWI_UPDATE_SNAPSHOTS=1 rewrites the baseline, and the next run matches it');

    const a = Buffer.from(await page.screenshot({ clip: { x: 0, y: 0, width: 40, height: 40 } }));
    const r = await T.diffPngs(browser, a, a);
    check(r.changed === 0 && r.ratio === 0 && typeof r.diff === 'string', 'diffPngs on identical images finds nothing');
  }

  console.log(`\nbrowser-trace-test: ${checks} checks green`);
} finally {
  await browser.close().catch(() => {});
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
