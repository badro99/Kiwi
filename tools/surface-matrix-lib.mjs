// Shared harness for the surface-matrix suites: a static server, a demo
// browser, one page per locale and screen size, and the same four checks per
// destination (html lang, text direction, no sideways scroll, axe-core).
// Reviewed demo visits only: no merchant session, no staff code.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { pinTradingHour } from './demo-clock.mjs';

export const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SIZES = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  tablet: { width: 1024, height: 768, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  phone: { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

/* Starts the server and the browser, or exits 0 with a skip line when the
   dev dependencies or Chromium are missing (the gate refuses that case). */
export async function harness(name) {
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
  const server = http.createServer((rq, res) => {
    const p = path.resolve(root, '.' + decodeURIComponent(new URL(rq.url, 'http://local').pathname));
    if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(p, (err, data) => {
      res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(err ? '' : data);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  const S = suite(name, { browser });
  const close = async () => { await browser.close().catch(() => {}); server.close(); };
  return { S, base, browser, baseline, axeSource, close };
}

/* A demo page in a fresh context, API answering offline, the service worker
   kept out, the clock pinned to a trading hour. */
export async function demoPage(h, locale, viewport, extraStorage = {}, routes = {}) {
  const ctx = await h.browser.createBrowserContext();
  const page = await ctx.newPage();
  await pinTradingHour(page);
  await page.setViewport(SIZES[viewport]);
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', async (r) => {
    const u = r.url();
    const key = r.method() + ' ' + new URL(u).pathname;
    if (u.startsWith(h.base + '/api/') && Object.hasOwn(routes, key)) {
      const route = routes[key];
      const result = typeof route === 'function' ? await route(r) : { body: route };
      return r.respond({ status: result.status ?? 200, contentType: 'application/json', body: JSON.stringify(result.body) });
    }
    if (u.startsWith(h.base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
    return u.startsWith(h.base + '/') || u.startsWith('data:') ? r.continue() : r.abort();
  });
  await page.evaluateOnNewDocument((lang, extra) => {
    localStorage.setItem('kiwiLang', lang);
    localStorage.setItem('kiwiCaisseLang', lang);
    localStorage.setItem('kiwiSkipOnboard', '1');
    localStorage.setItem('kiwiSkin2027:dashboard', '1');
    for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, locale, extraStorage);
  return { ctx, page };
}

/* Isolated synthetic real session. Route keys match method + pathname (query
   parameters remain available on the Puppeteer request passed to a handler).
   Plain values are JSON bodies; handlers return { status, body } or
   { abort: 'internetdisconnected' } for an actual transport failure. */
export async function realPage(h, locale, viewport, routes, extraStorage = {}) {
  const ctx = await h.browser.createBrowserContext();
  const page = await ctx.newPage();
  await pinTradingHour(page);
  await page.setViewport(SIZES[viewport]);
  await page.setBypassServiceWorker(true);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = new URL(req.url());
    if (url.origin === h.base && url.pathname.startsWith('/api/')) {
      const key = req.method() + ' ' + url.pathname;
      const route = Object.hasOwn(routes, key) ? routes[key] : undefined;
      const result = typeof route === 'function' ? await route(req)
        : route === undefined ? { status: 503, body: { error: 'offline' } }
          : { status: 200, body: route };
      if (result.abort) return req.abort(result.abort);
      return req.respond({ status: result.status ?? 200, contentType: 'application/json', body: JSON.stringify(result.body) });
    }
    return url.origin === h.base || url.protocol === 'data:' ? req.continue() : req.abort();
  });
  await page.evaluateOnNewDocument((lang, extra) => {
    localStorage.setItem('kiwiLang', lang);
    localStorage.setItem('kiwiCaisseLang', lang);
    localStorage.setItem('kiwiSkipOnboard', '1');
    localStorage.setItem('kiwiSkin2027:dashboard', '1');
    localStorage.setItem('kiwiLiveMerchant', 'matrix-real');
    for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value);
    localStorage.setItem('kiwiDemos', '0');
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  }, locale, extraStorage);
  return { ctx, page };
}

/* One dashboard per locale and size, reused across its destinations: the
   sidebar is how a merchant moves between them, so the walk is the real one. */
export function dashboardWalker(h) {
  const pages = new Map();
  const REGION = { transactions: '.dash-genpage', rapport: '.dash-genpage', terminaux: '.dash-genpage', payroll: '.dash-genpage', reservations: '.dash-genpage', tables: '.dash-genpage', stock: '.dash-stock' };
  async function dashboard(t, locale, viewport) {
    const key = locale + '|' + viewport;
    if (!pages.has(key)) {
      const opened = (async () => {
        const { page } = await demoPage(h, locale, viewport);
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
        return page;
      })();
      pages.set(key, opened);
      opened.catch(() => pages.delete(key));
    }
    return pages.get(key);
  }
  return {
    /* Opens destination `surface` (dashboard-<nav>) through its sidebar link. */
    async open(t, surface, locale, viewport) {
      const page = t.watch(await dashboard(t, locale, viewport));
      const nav = surface.slice('dashboard-'.length);
      t.step('open destination ' + nav);
      // Leave the previous destination's sheet or drawer the way a person does.
      await page.keyboard.press('Escape');
      await page.evaluate(() => { document.querySelectorAll('.kiwi-backdrop .kiwi-modal-close').forEach((b) => b.click()); });
      await sleep(250);
      await page.evaluate((id) => {
        const a = document.querySelector('[data-nav="' + id + '"]');
        if (!a) throw new Error('missing sidebar destination ' + id);
        a.click();
      }, nav);
      await page.waitForFunction((id) => window.Kiwi && window.Kiwi.activePage === id, { timeout: 15000 }, nav);
      // On a phone the floor plan gives way to the table-assignment drawer.
      const region = nav === 'tables' && viewport === 'phone' ? '.kiwi-drawer[role="dialog"]' : REGION[nav] || '#kw-main';
      await page.waitForSelector(region, { visible: true, timeout: 20000 });
      await sleep(900);
      return { page, region };
    },
  };
}

/* The four checks, against a per-cell axe baseline that may only go down. */
export async function verify(h, t, { page, region }, key, locale) {
  t.step('check locale, visible surface and page width');
  const state = await page.evaluate((selector) => {
    const el = [...document.querySelectorAll(selector)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || document.querySelector(selector);
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
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
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(h.axeSource);
  const found = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'],
    });
    return result.violations.filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, count: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => {
        // Contrast failures name their colours, so the fix needs no second probe.
        const d = v.id === 'color-contrast' && n.any && n.any[0] && n.any[0].data;
        return n.target.join(' ') + (d && d.fgColor ? ` (${d.fgColor} on ${d.bgColor}, ${d.contrastRatio}:1)` : '');
      }) }));
  });
  assert.ok(Object.hasOwn(h.baseline, key), 'missing a11y baseline key ' + key);
  const was = h.baseline[key];
  for (const v of found) if (!(v.id in was) || v.count > was[v.id]) failures.push(`axe ${v.id}: ${v.count} nodes, baseline ${was[v.id] || 0}; ${v.targets.join(' | ')}`);
  for (const [id, n] of Object.entries(was)) if ((found.find((v) => v.id === id)?.count || 0) < n) console.log(`  ! ${key}: ${id} decreased, lower the baseline`);
  assert.equal(failures.length, 0, failures.join('\n'));
  console.log(`  ✓ ${key}: locale, visible surface, overflow and axe`);
}

/* A till in a fresh demo page. The restaurant opens through the normal
   float-and-clock-in flow; every other trade through the dispatcher, the same
   call a paired store uses, and the credit book from the épicerie's tab. */
export async function openTill(h, t, surface, locale, viewport) {
  const { ctx, page } = await demoPage(h, locale, viewport);
  t.defer(() => ctx.close());
  t.watch(page);
  t.step('load the demo till');
  await page.goto(h.base + '/kiwi-caisse.html', { waitUntil: 'load', timeout: 60000 });
  if (surface === 'caisse-restaurant') {
    await page.waitForSelector('.ci-float-chip[data-float="300"]', { visible: true, timeout: 30000 });
    await sleep(600);
    await page.click('.ci-float-chip[data-float="300"]');
    await page.waitForFunction(() => !document.getElementById('clockin-btn').disabled);
    await page.click('#clockin-btn');
    await page.waitForFunction(() => document.body.classList.contains('is-unlocked'), { timeout: 20000 });
    await page.waitForSelector('.view.is-active', { visible: true, timeout: 20000 });
    await sleep(900);
    return { page, region: '.view.is-active' };
  }
  const id = surface === 'credit-book' ? 'epicerie' : surface.slice('caisse-'.length);
  await page.waitForFunction(() => window.KiwiPosDispatch, { timeout: 30000 });
  await sleep(500);
  t.step('open the ' + id + ' till');
  await page.evaluate((v) => window.KiwiPosDispatch.unlockById(v), id);
  // The dispatcher mounts the trade after its two-second greeting.
  await page.waitForSelector(`#pos-${id}.is-on`, { visible: true, timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('.kiwi-greet.is-visible'), { timeout: 8000 });
  if (surface === 'credit-book') {
    t.step('open the credit book');
    await page.waitForSelector('[data-ep-view="carnet"]', { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-ep-view="carnet"]').click());
    await page.waitForSelector('[data-ep-ard="k1"]', { visible: true, timeout: 8000 });
  }
  await sleep(700);
  return { page, region: `#pos-${id}` };
}
