import { suite } from './browser-trace.mjs';
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname.startsWith('/api/')) { rs.writeHead(503, { 'Content-Type': 'application/json' }); rs.end('{"error":"offline"}'); return; }
  if (u.pathname === '/auth/logout') { rs.writeHead(303, { Location: '/' }); rs.end(); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((resolve) => {
  server.once('error', () => { console.error('Browser test server unavailable in this environment'); process.exit(3); });
  server.listen(0, '127.0.0.1', resolve);
});
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });

const tests = suite('onboarding-recovery', { browser });
const notes = {
  fr: 'Brouillon non enregistré sur cet appareil',
  en: 'Draft not saved on this device',
  ar: 'لم تُحفظ المسودة على هذا الجهاز',
};
async function open(t, lang, viewport, refused = false) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((lang, refused) => {
    localStorage.setItem('kiwiLang', lang);
    localStorage.removeItem('kiwiSkin2027:dashboard');
    if (refused) Storage.prototype.setItem = function () { throw new DOMException('blocked', 'QuotaExceededError'); };
  }, lang, refused);
  // coverage: surface=onboarding locale=fr viewport=tablet
  await page.goto(base + '/dashboard.html?onboarding=1', { waitUntil: 'load' });
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  });
  await page.waitForSelector('.kob-root.kob-in');
  assert.ok(await page.evaluate(() => performance.getEntriesByType('resource').some(r => new URL(r.name).pathname === '/assets/onboarding-data.js')));
  return page;
}
const next = async page => { await page.click('.kob-foot .primary[data-go="next"]'); };
const fill = async (page, field, value) => {
  await page.$eval(`[data-f="${field}"]`, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
};
for (const lang of ['fr', 'en', 'ar']) {
  for (const [device, viewport] of Object.entries({ phone: { width: 390, height: 844, isMobile: true }, tablet: { width: 820, height: 1180 } })) {
    await tests.run(`${lang}-${device}-recovery`, async t => {
      // coverage: surface=onboarding locale=fr viewport=phone
      // coverage: surface=onboarding locale=fr viewport=tablet
      // coverage: surface=onboarding locale=en viewport=phone
      // coverage: surface=onboarding locale=en viewport=tablet
      // coverage: surface=onboarding locale=ar viewport=phone
      // coverage: surface=onboarding locale=ar viewport=tablet
      const page = await open(t, lang, viewport);
      t.step('fill the first steps and leave at locations');
      await next(page);
      await fill(page, 'ownerName', 'Salma'); await next(page);
      await fill(page, 'bizName', 'Commerce Rabat'); await page.click('[data-type="boutique"]'); await next(page);
      await fill(page, 'city', 'Rabat'); await next(page);
      const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kiwiOnboardingDraft:v1')));
      assert.equal(before.step, 4);
      t.step('reload and recover step and answers');
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('.kob-root.kob-in');
      const restored = await page.evaluate(() => {
        const state = window.KiwiOnboarding.kit.state;
        const btn = document.querySelector('.kob-foot .primary[data-go="next"]');
        btn.focus(); const rect = btn.getBoundingClientRect();
        return { step: state.step, ownerName: state.ownerName, bizName: state.bizName, city: state.city, typeId: state.typeId,
          dir: document.documentElement.dir, overflow: document.documentElement.scrollWidth > innerWidth,
          visible: rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= innerHeight,
          focused: document.activeElement === btn && !btn.disabled && btn.tabIndex >= 0 };
      });
      for (const key of ['step', 'ownerName', 'bizName', 'city', 'typeId']) assert.equal(restored[key], before[key], key);
      assert.equal(restored.dir, lang === 'ar' ? 'rtl' : 'ltr');
      assert.equal(restored.overflow, false); assert.ok(restored.visible); assert.ok(restored.focused);
      await page.click('.kob-foot [data-go="back"]');
      assert.equal(await page.$eval('[data-f="city"]', el => el.value), 'Rabat');
      await page.click('.kob-foot [data-go="back"]');
      assert.equal(await page.$eval('[data-f="bizName"]', el => el.value), 'Commerce Rabat');
      assert.ok(await page.$('[data-type="boutique"].sel'));
      await page.click('.kob-foot [data-go="back"]');
      assert.equal(await page.$eval('[data-f="ownerName"]', el => el.value), 'Salma');
    });
    await tests.run(`${lang}-${device}-storage-refused`, async t => {
      // coverage: surface=onboarding locale=fr viewport=phone
      // coverage: surface=onboarding locale=fr viewport=tablet
      // coverage: surface=onboarding locale=en viewport=phone
      // coverage: surface=onboarding locale=en viewport=tablet
      // coverage: surface=onboarding locale=ar viewport=phone
      // coverage: surface=onboarding locale=ar viewport=tablet
      const page = await open(t, lang, viewport, true);
      await page.waitForSelector('[data-draft-note]');
      assert.ok((await page.$eval('[data-draft-note]', el => el.textContent)).startsWith(notes[lang]));
    });
  }
}
await browser.close();
server.closeAllConnections();
await new Promise(resolve => server.close(resolve));
await tests.finish();
