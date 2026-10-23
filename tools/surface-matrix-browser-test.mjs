#!/usr/bin/env node
// Reviewed demo visits, isolated per cell. No merchant session or staff code.
// French-leak's collector is private to its executable suite: not duplicated here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer, axeSource;
try {
  puppeteer = req('puppeteer-core');
  axeSource = fs.readFileSync(req.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.log('○ skip: puppeteer-core or axe-core unavailable, browser assertions not executed');
  process.exit(process.env.CI ? 1 : 0);
}
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable, browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'tools/a11y-baseline.json'), 'utf8'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((rq, res) => {
  const p = path.resolve(root, '.' + decodeURIComponent(new URL(rq.url, 'http://local').pathname));
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => {
    res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(err ? '' : data);
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const S = suite('surface-matrix', { browser });

  // An open includes entering the actual destination, not just loading its shell.
  async function open(t, surface, locale, viewport) {
    const ctx = await browser.createBrowserContext();
    t.defer(() => ctx.close());
    const page = t.watch(await ctx.newPage());
    await pinTradingHour(page);
    await page.setViewport({ width: viewport === 'tablet' ? 1024 : 390, height: viewport === 'tablet' ? 768 : 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.setBypassServiceWorker(true);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
      return u.startsWith(base + '/') || u.startsWith('data:') ? r.continue() : r.abort();
    });
    await page.evaluateOnNewDocument((lang) => {
      localStorage.setItem('kiwiLang', lang);
      localStorage.setItem('kiwiCaisseLang', lang);
      localStorage.setItem('kiwiSkipOnboard', '1');
      localStorage.setItem('kiwiSkin2027:dashboard', '1');
      try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
    }, locale);
    const till = surface.startsWith('caisse-');
    t.step('load the demo shell');
    await page.goto(base + (till ? '/kiwi-caisse.html' : '/dashboard.html'), { waitUntil: 'load', timeout: 60000 });
    let region;
    if (surface === 'caisse-boutique') {
      await page.waitForFunction(() => window.KiwiPosDispatch && window.KiwiBoutiqueCatalog, { timeout: 30000 });
      await page.evaluate(() => window.KiwiPosDispatch.unlockById('boutique'));
      await page.waitForSelector('.bq-card', { visible: true, timeout: 20000 });
      region = '.vx-screen.is-on.kiwi-dna';
    } else if (till) {
      // Normal demo opening flow, as in french-leak-browser-test.mjs.
      await page.waitForSelector('.ci-float-chip[data-float="300"]', { visible: true, timeout: 30000 });
      await sleep(600);
      await page.click('.ci-float-chip[data-float="300"]');
      await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled);
      await page.click('#clockin-btn');
      await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
      // The phone opens on takeaway, the tablet on the floor: whichever view is active.
      region = '.view.is-active';
    } else {
      await sleep(1500);
      // Use the demo entry CTA when present, as the a11y suite does.
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button,a')].find((x) => /Explorer la d|Explore the d/.test(x.textContent));
        if (b) b.click();
      });
      await page.keyboard.press('Escape');
      // The KPI band is folded away at phone width; wait for the sidebar destinations instead.
      await page.waitForSelector('[data-nav="transactions"]', { timeout: 30000 });
      await sleep(1500);
      const nav = surface.slice('dashboard-'.length);
      t.step('open destination ' + nav);
      await page.evaluate((id) => {
        const a = document.querySelector('[data-nav="' + id + '"]');
        if (!a) throw new Error('missing sidebar destination ' + id);
        a.click();
      }, nav);
      region = nav === 'stock' ? '.dash-stock' : '.dash-genpage';
    }
    await page.waitForSelector(region, { visible: true, timeout: 20000 });
    await sleep(1000);
    return { page, region };
  }

  async function verify(t, { page, region }, key, locale) {
    t.step('check locale, visible surface and page width');
    const state = await page.evaluate((selector) => {
      const el = document.querySelector(selector), r = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { lang: document.documentElement.lang, dir: document.documentElement.dir,
        width: document.documentElement.scrollWidth, viewport: innerWidth,
        visible: r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && style.visibility !== 'hidden' && Number(style.opacity) > 0 };
    }, region);
    const failures = [];
    if (state.lang !== locale) failures.push(`html lang=${state.lang}, expected ${locale}`);
    if (state.dir !== (locale === 'ar' ? 'rtl' : 'ltr')) failures.push(`html dir=${state.dir}, expected ${locale === 'ar' ? 'rtl' : 'ltr'}`);
    if (state.width > state.viewport + 1) failures.push(`horizontal overflow: ${state.width} > ${state.viewport} + 1`);
    if (!state.visible) failures.push(`surface region not visible: ${region}`);
    t.step('run axe-core against the whole document');
    await page.evaluate(axeSource);
    const found = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'],
      });
      return result.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
        .map((v) => ({ id: v.id, count: v.nodes.length, targets: v.nodes.slice(0, 2).map((n) => n.target.join(' ')) }));
    });
    assert.ok(Object.hasOwn(baseline, key), 'missing a11y baseline key ' + key);
    const was = baseline[key];
    for (const v of found) if (!(v.id in was) || v.count > was[v.id]) failures.push(`axe ${v.id}: ${v.count} nodes, baseline ${was[v.id] || 0}; ${v.targets.join(' | ')}`);
    for (const [id, n] of Object.entries(was)) if ((found.find((v) => v.id === id)?.count || 0) < n) console.log(`  ! ${key}: ${id} decreased, lower the baseline`);
    assert.equal(failures.length, 0, failures.join('\n'));
    console.log(`  ✓ ${key}: locale, visible surface, overflow and axe`);
  }

  await S.run('caisse-restaurant · fr · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=phone
    const cell = await open(t, 'caisse-restaurant', 'fr', 'phone');
    await verify(t, cell, 'matrix-caisse-restaurant-fr-phone', 'fr');
  });

  await S.run('caisse-restaurant · fr · tablet', async (t) => {
    // coverage: surface=caisse-restaurant locale=fr viewport=tablet
    const cell = await open(t, 'caisse-restaurant', 'fr', 'tablet');
    await verify(t, cell, 'matrix-caisse-restaurant-fr-tablet', 'fr');
  });

  await S.run('caisse-restaurant · en · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=en viewport=phone
    const cell = await open(t, 'caisse-restaurant', 'en', 'phone');
    await verify(t, cell, 'matrix-caisse-restaurant-en-phone', 'en');
  });

  await S.run('caisse-restaurant · ar · phone', async (t) => {
    // coverage: surface=caisse-restaurant locale=ar viewport=phone
    const cell = await open(t, 'caisse-restaurant', 'ar', 'phone');
    await verify(t, cell, 'matrix-caisse-restaurant-ar-phone', 'ar');
  });

  await S.run('caisse-boutique · fr · phone', async (t) => {
    // coverage: surface=caisse-boutique locale=fr viewport=phone
    const cell = await open(t, 'caisse-boutique', 'fr', 'phone');
    await verify(t, cell, 'matrix-caisse-boutique-fr-phone', 'fr');
  });

  await S.run('caisse-boutique · en · phone', async (t) => {
    // coverage: surface=caisse-boutique locale=en viewport=phone
    const cell = await open(t, 'caisse-boutique', 'en', 'phone');
    await verify(t, cell, 'matrix-caisse-boutique-en-phone', 'en');
  });

  await S.run('caisse-boutique · ar · phone', async (t) => {
    // coverage: surface=caisse-boutique locale=ar viewport=phone
    const cell = await open(t, 'caisse-boutique', 'ar', 'phone');
    await verify(t, cell, 'matrix-caisse-boutique-ar-phone', 'ar');
  });

  await S.run('dashboard-transactions · fr · phone', async (t) => {
    // coverage: surface=dashboard-transactions locale=fr viewport=phone
    const cell = await open(t, 'dashboard-transactions', 'fr', 'phone');
    await verify(t, cell, 'matrix-dashboard-transactions-fr-phone', 'fr');
  });

  await S.run('dashboard-transactions · en · phone', async (t) => {
    // coverage: surface=dashboard-transactions locale=en viewport=phone
    const cell = await open(t, 'dashboard-transactions', 'en', 'phone');
    await verify(t, cell, 'matrix-dashboard-transactions-en-phone', 'en');
  });

  await S.run('dashboard-transactions · ar · phone', async (t) => {
    // coverage: surface=dashboard-transactions locale=ar viewport=phone
    const cell = await open(t, 'dashboard-transactions', 'ar', 'phone');
    await verify(t, cell, 'matrix-dashboard-transactions-ar-phone', 'ar');
  });

  await S.run('dashboard-payroll · fr · tablet', async (t) => {
    // coverage: surface=dashboard-payroll locale=fr viewport=tablet
    const cell = await open(t, 'dashboard-payroll', 'fr', 'tablet');
    await verify(t, cell, 'matrix-dashboard-payroll-fr-tablet', 'fr');
  });

  await S.run('dashboard-payroll · en · phone', async (t) => {
    // coverage: surface=dashboard-payroll locale=en viewport=phone
    const cell = await open(t, 'dashboard-payroll', 'en', 'phone');
    await verify(t, cell, 'matrix-dashboard-payroll-en-phone', 'en');
  });

  await S.run('dashboard-payroll · ar · phone', async (t) => {
    // coverage: surface=dashboard-payroll locale=ar viewport=phone
    const cell = await open(t, 'dashboard-payroll', 'ar', 'phone');
    await verify(t, cell, 'matrix-dashboard-payroll-ar-phone', 'ar');
  });

  await S.run('dashboard-stock · fr · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=fr viewport=phone
    const cell = await open(t, 'dashboard-stock', 'fr', 'phone');
    await verify(t, cell, 'matrix-dashboard-stock-fr-phone', 'fr');
  });

  await S.run('dashboard-stock · en · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=en viewport=phone
    const cell = await open(t, 'dashboard-stock', 'en', 'phone');
    await verify(t, cell, 'matrix-dashboard-stock-en-phone', 'en');
  });

  await S.run('dashboard-stock · ar · phone', async (t) => {
    // coverage: surface=dashboard-stock locale=ar viewport=phone
    const cell = await open(t, 'dashboard-stock', 'ar', 'phone');
    await verify(t, cell, 'matrix-dashboard-stock-ar-phone', 'ar');
  });

  process.exitCode = await S.finish({ exit: false });
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}
