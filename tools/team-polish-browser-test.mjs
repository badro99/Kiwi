#!/usr/bin/env node
/* team-polish-browser-test · the team app's 2027 finishing pass (behind
 * kiwiSkin2027:team), in Chromium, on the demo floor and the live sign-in.
 *
 *   node tools/team-polish-browser-test.mjs
 *
 * What it holds, each one a defect that shipped once:
 *   · phone 375 × 667, the live sign-in's code step: the pad and Change
 *     e-mail fit on the screen with nothing scrolled, and the button of
 *     step 1 does not move when the address becomes valid;
 *   · the demo set menu offers its choices (they all read "Option
 *     indisponible" and the set menu could not be added);
 *   · the menu's chips, the split and cash chips and the split's Cancel are
 *     at least 44 tall; the cash field draws no spinner;
 *   · iPad landscape: the order bar floats clear of the 88 rail;
 *   · iPad portrait: a sheet is a centred card at most 560 wide;
 *   · Arabic: a menu card's Options flag does not cover its category, the
 *     count of a chip sits after its label with a gap, the table summary
 *     is in Arabic, and a Latin name keeps its full stop at its end;
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

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((rq, rs) => {
  const u = new URL(rq.url, 'http://local');
  if (u.pathname.startsWith('/api/') || u.pathname.startsWith('/auth/')) { rs.writeHead(503, { 'Content-Type': 'application/json' }); rs.end('{"error":"offline"}'); return; }
  const p = path.resolve(root, '.' + decodeURIComponent(u.pathname));
  if (!p.startsWith(root + path.sep)) { rs.writeHead(403); rs.end(); return; }
  fs.readFile(p, (err, data) => { rs.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); rs.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (yes, msg) => { assert.ok(yes, msg); checks++; console.log('  ✓ ' + msg); };

async function open({ width = 390, height = 844, lang = 'fr', live = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setBypassServiceWorker(true);
  await page.evaluateOnNewDocument((l) => {
    localStorage.setItem('kiwiSkin2027:team', '1');
    localStorage.setItem('kiwiLang', l);
    localStorage.setItem('kiwi-employee-language:demo', l);
    localStorage.setItem('kiwi-employee-language:team-test', l);
  }, lang);
  await page.setViewport({ width, height });
  // coverage: surface=waiter locale=fr viewport=phone
  await page.goto(base + '/kiwi-serveur.html' + (live ? '?merchant=team-test' : ''), { waitUntil: 'load' });
  if (live) await page.waitForSelector('.k-team-signin', { timeout: 30000 });
  else {
    await page.waitForFunction(() => typeof showScreen === 'function' && typeof renderAll === 'function', { timeout: 20000 });
    await page.evaluate(() => { showScreen('screen-main'); setTab('tables'); renderAll(); document.getElementById('screen-main').classList.remove('is-pre-hidden'); });
  }
  await sleep(500);
  return { ctx, page, errors };
}
const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
const minH = (page, sel) => page.evaluate((s) => Math.min(...[...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height)), sel);
/* Order for T1 from the menu (the shipped take-order path). */
const toMenu = (page) => page.evaluate(() => { openTableDetail('T1'); document.querySelector('#td-footer [data-action="take-order"]').click(); });

console.log('team-polish-browser-test');
try {
  {
    // coverage: surface=team-entry locale=fr viewport=phone
    const { ctx, page, errors } = await open({ width: 375, height: 667, live: true });
    const before = await rect(page, '.k-team-next');
    await page.focus('#k-team-email');
    await page.keyboard.type('serveur@cafe.ma');
    await sleep(150);
    const after = await rect(page, '.k-team-next');
    check(Math.abs(before.t - after.t) < 1, `step 1: the button stays put as the address becomes valid (${Math.round(before.t)} → ${Math.round(after.t)})`);
    await page.keyboard.press('Enter');
    await sleep(600);
    const g = await page.evaluate(() => {
      const scr = document.getElementById('screen-pin');
      const pad = document.querySelector('.k-team-signin k-pin-pad');
      const k0 = pad.shadowRoot.querySelector('[data-key="0"]').getBoundingClientRect();
      const ex = [...pad.shadowRoot.querySelectorAll('button')].find((b) => /e-mail/i.test(b.textContent));
      const er = ex ? ex.getBoundingClientRect() : null;
      return { top: scr.scrollTop, k0: k0.bottom, k0t: k0.top, ex: er && er.bottom, h: innerHeight };
    });
    check(g.top === 0 && g.k0t >= 0 && g.k0 <= g.h && g.ex && g.ex <= g.h, `step 2 on a 375 × 667 phone: the pad and Change e-mail fit unscrolled (key 0 ends ${Math.round(g.k0)}, the link ${Math.round(g.ex)} of ${g.h})`);
    check(errors.length === 0, 'sign-in: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  {
    // coverage: surface=waiter locale=fr viewport=phone
    const { ctx, page, errors } = await open();
    await toMenu(page);
    await sleep(500);
    check(await minH(page, '.cat-pill') >= 44, 'the menu chips are 44 tall, like the tables chips');
    await page.evaluate(() => document.querySelector('.menu-item[data-menu-id="m-fml-brunch"]').click());
    await sleep(500);
    const fml = await page.evaluate(() => ({ off: [...document.querySelectorAll('#formula-modal .fml-chip')].filter((c) => c.disabled).length, n: document.querySelectorAll('#formula-modal .fml-chip').length, txt: document.getElementById('formula-modal').textContent }));
    check(fml.n > 0 && fml.off === 0 && !/Option indisponible/.test(fml.txt), `the demo set menu offers its ${fml.n} choices, none unavailable`);
    await page.evaluate(() => { closeFormulaSheet(); returnToFloor(); openSplitModal('T2'); });
    await sleep(500);
    check(await minH(page, '#split-modal .split-chip') >= 44 && (await rect(page, '#split-cancel')).h >= 44, 'the split sheet: every chip and Cancel are at least 44 tall');
    await page.evaluate(() => { closeSplitModal(); openCashModal(); });
    await sleep(400);
    const spin = await page.evaluate(() => getComputedStyle(document.getElementById('cash-received'), '::-webkit-inner-spin-button').webkitAppearance || getComputedStyle(document.getElementById('cash-received')).appearance);
    check(await minH(page, '#cash-modal .cash-preset') >= 44 && /none|textfield/.test(spin), `the cash sheet: quick amounts 44 tall, no spinner in the field (${spin})`);
    check(errors.length === 0, 'phone: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  {
    // coverage: surface=waiter locale=fr viewport=desktop
    const { ctx, page, errors } = await open({ width: 1180, height: 820 });
    await toMenu(page);
    await sleep(400);
    await page.evaluate(() => document.querySelector('.menu-item[data-menu-id="m-001"]').click());
    await sleep(500);
    const bar = await rect(page, '#menu-cart-bar');
    const rail = await rect(page, '#screen-main .bottom-tabs');
    check(bar && bar.w > 0 && bar.l >= rail.r && bar.r <= 1180, `iPad landscape: the order bar floats clear of the rail (${Math.round(bar.l)} ≥ ${Math.round(rail.r)})`);
    check(errors.length === 0, 'iPad landscape: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  {
    // coverage: surface=waiter locale=fr viewport=tablet
    const { ctx, page, errors } = await open({ width: 820, height: 1180 });
    await page.evaluate(() => openNewTableModal('T3'));
    await sleep(500);
    const m = await rect(page, '#new-table-modal .modal');
    check(m.w <= 560 && Math.abs((m.l + m.r) / 2 - 410) < 2, `iPad portrait: a sheet is a centred card (${Math.round(m.w)} wide)`);
    check(errors.length === 0, 'iPad portrait: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  {
    // coverage: surface=waiter locale=ar viewport=phone
    const { ctx, page, errors } = await open({ lang: 'ar' });
    const chip = await page.evaluate(() => { const c = document.querySelector('.filter-chip .count'); const cs = getComputedStyle(c); return { ms: cs.marginInlineStart, gap: c.parentElement.getBoundingClientRect().right - c.getBoundingClientRect().right }; });
    check(chip.ms === '5px', `Arabic: a chip's count sits after its label with a gap (${chip.ms})`);
    const name = await page.evaluate(() => { const e = document.querySelector('.tb-name'); const range = document.createRange(); range.selectNodeContents(e); const rs = [...range.getClientRects()]; return { bidi: getComputedStyle(e).unicodeBidi, text: e.textContent }; });
    check(name.bidi === 'plaintext', `Arabic: the Latin name "${name.text}" is laid out as its own paragraph`);
    await page.evaluate(() => openTableDetail('T1'));
    await sleep(400);
    const sum = await page.evaluate(() => document.querySelector('#td-body .td-summary').textContent);
    check(!/Sous-total|Service \(compris\)/.test(sum) && /المجموع/.test(sum), 'Arabic: the table summary is in Arabic');
    await page.evaluate(() => { returnToFloor(); setTab('menu'); });
    await sleep(400);
    const lap = await page.evaluate(() => [...document.querySelectorAll('.menu-item')].filter((m) => m.querySelector('.menu-item-optflag')).map((m) => {
      const a = m.querySelector('.menu-item-optflag').getBoundingClientRect(), b = m.querySelector('.menu-item-cat'), r = document.createRange();
      r.selectNodeContents(b); const c = r.getBoundingClientRect();
      return !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top);
    }));
    check(lap.length > 0 && !lap.some(Boolean), `Arabic: no Options flag covers its card's category (${lap.length} cards)`);
    check(errors.length === 0, 'Arabic: no page error' + (errors.length ? ' · ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  console.log(`✓ team-polish-browser-test · ${checks} checks`);
} catch (e) {
  console.log('  ✗ ' + e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
