#!/usr/bin/env node
import retailSource from './pos-retail-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { suite } from './browser-trace.mjs';
const ROOT = path.resolve(import.meta.dirname, '..');
const source = retailSource(fs.readFileSync(process.env.KIWI_SHIFT_SOURCE || path.join(ROOT, 'assets/repeat-sale-guard.js'), 'utf8'));
let checks = 0;
const ok = (v, m) => { assert.ok(v, m); checks++; };
function harness(throwing = false) {
  const timers = new Map(), store = new Map();
  let seq = 0, busy = false, now = Date.parse('2026-10-21T12:00:00Z');
  const host = { isConnected: true, children: [], getClientRects: () => [1], querySelector: () => null, appendChild(el) { this.children.push(el); } };
  const document = { querySelector: () => busy, createElement: () => ({ dataset: {}, style: {}, setAttribute() {}, append(...children) { this.children = children; }, remove() { host.children = host.children.filter(x => x !== this); } }) };
  const win = { localStorage: { getItem(k) { if (throwing) throw Error('blocked'); return store.get(k); }, setItem(k,v) { if (throwing) throw Error('blocked'); store.set(k,v); } } };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { window: win, document, Date: Clock, setInterval: f => { timers.set(++seq, f); return seq; }, clearInterval: n => timers.delete(n) });
  ok(win.KiwiShiftNudge, 'shared nudge namespace exists (fails on old code)');
  const day = ts => new Date(ts - 5*3600000).toISOString().slice(0,10);
  let openedAt = now - 86400000, opened = 0;
  const options = { host, scope: 'boutique@fixture', openedAt: () => openedAt, businessDay: day, isBusy: () => busy, open: () => opened++ };
  return { host, win, options, store, tick: () => [...timers.values()].forEach(f => f()), setBusy: b => { busy = b; }, setNow: t => { now = t; }, setAt: t => { openedAt = t; }, opened: () => opened };
}
for (const throwing of [false, true]) {
  const h = harness(throwing), G = h.win.KiwiShiftNudge;
  h.setAt(Date.parse('2026-10-21T06:00:00Z')); G.check(h.options);
  ok(!h.host.children.length, 'today does not show');
  h.setAt(Date.parse('2026-10-21T04:59:00Z')); h.setBusy(true); h.tick();
  ok(!h.host.children.length, 'busy waits even across the 5h cutoff');
  h.setBusy(false); h.tick(); ok(h.host.children.length === 1, 'earlier business day shows once idle');
  h.host.children[0].children[1].children[1].onclick(); h.tick();
  ok(!h.host.children.length, 'Later suppresses the same business day');
  G.check(h.options); ok(!h.host.children.length, 'rechecking preserves dismissal');
  h.setNow(Date.parse('2026-10-22T04:59:00Z')); h.tick(); ok(!h.host.children.length, 'still same business day before 5h');
  h.setNow(Date.parse('2026-10-22T05:00:00Z')); h.tick(); ok(h.host.children.length === 1, 'next business day shows again');
  h.setBusy(true); h.tick(); ok(!h.host.children.length, 'notice hides when payment starts');
  h.setBusy(false); h.tick(); h.host.children[0].children[1].children[0].onclick(); ok(h.opened() === 1, 'close action invokes existing sheet callback');
  h.setAt(0); h.tick(); ok(!h.host.children.length, 'closed shift removes notice');
}
const require = createRequire(import.meta.url);
let puppeteer;
try { puppeteer = require(require.resolve('puppeteer-core', { paths: [path.join(ROOT, 'app'), ROOT] })); } catch (_) {}
const executablePath = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(fs.existsSync);
if (!puppeteer || !executablePath || process.env.KIWI_SHIFT_UNIT_ONLY) {
  console.log(`✓ shift-age nudge: ${checks} VM checks (browser skipped)`); process.exit(0);
}
const fixture = spawn(process.execPath, [path.join(ROOT, 'tools/retail-ui-fixture.mjs')], { cwd: ROOT, stdio: ['ignore','pipe','pipe'] });
let browser;
try {
  const base = await new Promise((resolve,reject) => {
    let out = '', err = '';
    const timer = setTimeout(() => reject(Error('fixture startup: ' + err)), 15000);
    fixture.stdout.on('data', c => { out += c; const m = out.match(/KIWI_RETAIL_UI_QA_READY (\{[^\n]+\})/); if (m) { clearTimeout(timer); resolve(JSON.parse(m[1]).base); } });
    fixture.stderr.on('data', c => { err += c; });
    fixture.once('exit', c => { clearTimeout(timer); reject(Error('fixture exited ' + c + ': ' + err)); });
  });
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const s = suite('shift-age-nudge', { browser });
  await s.run('persisted boutique shift', async t => {
    const page = t.watch(await browser.newPage());
    await page.setViewport({ width:1280, height:900 });
    await page.setRequestInterception(true);
    page.on('request', async req => {
      if (req.url() === base + '/boutique.html') {
        const html = await (await fetch(req.url())).text();
        // A synthetic real-session fixture exercises the actual restore, not a
        // replacement of the production shift code. All requests stay loopback.
        await req.respond({ status:200, contentType:'text/html', body:html.replace('isReal:()=>false','isReal:()=>true') });
      } else if (process.env.KIWI_SHIFT_OLD_TILL && req.url().includes('/assets/pos-boutique.js')) {
        await req.respond({ status:200, contentType:'text/javascript', body:retailSource(fs.readFileSync(process.env.KIWI_SHIFT_OLD_TILL,'utf8')) });
      } else await (req.url().startsWith(base + '/') || req.url().startsWith('data:') ? req.continue() : req.abort());
    });
    await page.goto(base + '/boutique.html', { waitUntil:'load' });
    await page.evaluate(() => localStorage.setItem('kiwi:bqShift', JSON.stringify({ openedAt:Date.now()-30*3600000, openedBy:'Fixture', float:100, sid:'fixture-shift', openSent:true })));
    await page.reload({ waitUntil:'load' });
    await page.waitForSelector('#kiwi-shift-age-nudge', { visible:true, timeout:6000 });
    ok(await page.$eval('#kiwi-shift-age-nudge', e => e.innerText.includes('Caisse ouverte depuis le')), 'persisted 30h shift shows notice');
    await page.click('[data-shift-later]');
    ok(!await page.$('#kiwi-shift-age-nudge'), 'Later hides notice');
    await page.reload({ waitUntil:'load' });
    await new Promise(r => setTimeout(r, 1200));
    ok(!await page.$('#kiwi-shift-age-nudge'), 'dismissal survives reload');
    await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('kiwi:shiftAgeLater:')).forEach(k => localStorage.removeItem(k)));
    await page.reload({ waitUntil:'load' });
    await page.waitForSelector('[data-shift-close]', { visible:true, timeout:6000 });
    await page.click('[data-shift-close]');
    await page.waitForSelector('#bq-cloture.is-open', { visible:true, timeout:6000 });
    ok(await page.$('#bqclo-count'), 'existing cash-count closing sheet opens');
  });
  console.log(`shift-age nudge: ${checks} assertions`);
  process.exitCode = await s.finish({ exit:false });
} finally { if (browser) await browser.close(); fixture.kill(); }
