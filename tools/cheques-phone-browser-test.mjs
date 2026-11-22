#!/usr/bin/env node
/* Chèques et effets sur un téléphone (390 px), en français puis en arabe.
 *
 *   node tools/cheques-phone-browser-test.mjs
 *
 * Le premier juge a vu la page s'étirer à 728 px : la grille .cq-wrap n'avait
 * pas de piste minmax(0,1fr) et la rangée de puces clientes poussait tout le
 * reste (cartes, « Nouveau chèque », CSV, filtres, liste) hors de l'écran, à
 * gauche en arabe. Ici, sur le vrai tableau de bord de démonstration :
 *   · la page ne défile pas de côté et rien ne croise un bord, sauf dans un
 *     ruban qui défile lui-même (puces, statuts) ;
 *   · les cartes, « Nouveau chèque », CSV, les statuts et chaque ligne sont
 *     entiers à l'écran ;
 *   · les fenêtres (nouveau chèque, fiche, bordereau de la semaine) ne
 *     glissent pas de côté.
 * Un seul navigateur, deux passages l'un après l'autre. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(root, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable — browser assertions not executed'); process.exit(process.env.CI ? 1 : 0); }

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
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

/* Tout ce qui croise un bord de l'écran, sauf dans un ruban qui défile lui-même à l'écran. */
const spills = (page) => page.evaluate(() => {
  const W = innerWidth, out = [];
  const shown = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05; };
  const reachable = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) {
        const r = p.getBoundingClientRect();
        if (r.right <= W + 1 && r.left >= -1) return true;
      }
    }
    return false;
  };
  for (const el of document.querySelectorAll('.cq-wrap *, .kiwi-modal *')) {
    if (!el.getClientRects().length || !shown(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    if (((b.right > W + 2 && b.left < W) || (b.left < -2 && b.right > 0)) && !reachable(el)) {
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} [${Math.round(b.left)}…${Math.round(b.right)}] "${(el.textContent || '').trim().slice(0, 30)}"`);
    }
  }
  return { docW: document.documentElement.scrollWidth, W, out };
});
/* Ces éléments-là sont entiers à l'écran (le bouton, la carte, la ligne : pas seulement visibles en partie). */
const whole = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.getClientRects().length)
  .map((e) => { const b = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 24), l: Math.round(b.left), r: Math.round(b.right), ok: b.left >= -1 && b.right <= innerWidth + 1 }; }), sel);
const sheetSlides = (page) => page.evaluate(() => [...document.querySelectorAll('.kiwi-modal, .kiwi-modal-body, .kiwi-modal-foot, [role="dialog"]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 20 && getComputedStyle(el).visibility !== 'hidden'; })
  .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => `${el.className} ${el.scrollWidth}/${el.clientWidth}`));
const act = (page, action, arg) => page.evaluate((a, g) => {
  const b = document.createElement('button'); b.hidden = true; b.dataset.action = a; if (g) b.dataset.arg = g;
  document.body.appendChild(b); b.click(); b.remove();
}, action, arg || '');
const closeModals = async (page) => { for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(150); } };

const S = suite('cheques-phone', { browser });
try {
  for (const lang of ['fr', 'ar']) {
    await S.run(`cheques page at 390 px · ${lang}`, async (tr) => {
      const ctx = await browser.createBrowserContext(); tr.defer(() => ctx.close());
      const page = tr.watch(await ctx.newPage());
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        const u = r.url();
        if (u.startsWith(base + '/api/')) return r.respond({ status: 503, contentType: 'application/json', body: '{"error":"offline"}' });
        return u.startsWith(base) || u.startsWith('data:') ? r.continue() : r.abort();
      });
      await page.evaluateOnNewDocument((l) => {
        try { localStorage.setItem('kiwiSkipOnboard', '1'); localStorage.setItem('kiwiLang', l); } catch (_) {}
        try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
      }, lang);
      page.setDefaultNavigationTimeout(60000);
      // coverage: surface=dashboard locale=fr viewport=phone
      // coverage: surface=dashboard locale=ar viewport=phone
      tr.step('open the demo dashboard on a phone');
      await page.goto(base + '/dashboard.html', { waitUntil: 'load' });
      await sleep(1500);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !!document.querySelector('[data-kpi-band] .kpi-m'), { timeout: 30000 });
      await sleep(500);

      tr.step('open Chèques et effets');
      await act(page, 'nav-cheques', 'all');
      await page.waitForSelector('.cq-wrap .cq-row', { timeout: 15000 });
      await sleep(600);
      const dir = await page.evaluate(() => getComputedStyle(document.body).direction);
      check(dir === (lang === 'ar' ? 'rtl' : 'ltr'), `${lang}: page reads ${dir}`);
      const s1 = await spills(page);
      check(s1.docW <= s1.W + 1, `${lang}: the page does not scroll sideways (${s1.docW} px for ${s1.W})`);
      check(!s1.out.length, `${lang}: nothing of the portfolio crosses an edge${s1.out.length ? ' · ' + s1.out.slice(0, 6).join(' | ') : ''}`);
      for (const [sel, what] of [['.cq-kpi', 'every card'], ['.cq-tools .cq-btn', '« Nouveau chèque », CSV and the slip button'], ['.cq-search', 'the search'], ['.cq-row', 'every cheque row'], ['.cq-filters select, .cq-filters input', 'the filters'], ['.cq-month', 'the six months']]) {
        const list = await whole(page, sel);
        const bad = list.filter((x) => !x.ok);
        check(list.length && !bad.length, `${lang}: ${what} whole on screen (${list.length})${bad.length ? ' · ' + JSON.stringify(bad.slice(0, 3)) : ''}`);
      }
      const strips = await page.evaluate(() => [...document.querySelectorAll('.cq-parties, .cq-pills')].map((e) => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right) }; }));
      check(strips.every((b) => b.l >= -1 && b.r <= 391), `${lang}: the customer chips and the status pills scroll inside the screen, not the page`);

      tr.step('new cheque sheet');
      await act(page, 'chq-new');
      await page.waitForSelector('[data-cq-new]', { timeout: 8000 });
      await sleep(400);
      const s2 = await spills(page), sl2 = await sheetSlides(page);
      check(!s2.out.length && !sl2.length, `${lang}: the new-cheque sheet fits (${s2.out.concat(sl2).slice(0, 4).join(' | ') || 'ok'})`);
      check(await page.$('[data-cq-new] select[name="client"]') !== null, `${lang}: the sheet offers the customer cards`);
      await closeModals(page);

      tr.step('detail of a bounced cheque');
      const bounced = await page.evaluate(() => { const r = [...document.querySelectorAll('.cq-row')].find((x) => x.querySelector('.cq-chip.bad')); return r ? r.getAttribute('data-arg') : ''; });
      check(!!bounced, `${lang}: the demo shows a bounced cheque`);
      await act(page, 'chq-open', bounced);
      await page.waitForSelector('.cq-sheet', { timeout: 8000 });
      await sleep(400);
      const s3 = await spills(page), sl3 = await sheetSlides(page);
      check(!s3.out.length && !sl3.length, `${lang}: the cheque sheet fits (${s3.out.concat(sl3).slice(0, 4).join(' | ') || 'ok'})`);
      const sheet = await page.evaluate(() => document.querySelector('.cq-sheet').innerText);
      check(!/Propriétaire|Gérant/.test(sheet) || lang === 'fr', `${lang}: the history names roles in the page language`);
      check(/https:\/\/wa\.me\//.test(await page.evaluate(() => document.querySelector('.cq-sheet').innerHTML)), `${lang}: a WhatsApp draft is offered on the bounced debt`);
      await closeModals(page);

      tr.step('one-tap slip from « À remettre cette semaine »');
      await act(page, 'chq-slip', 'week');
      await page.waitForSelector('[data-cq-slip]', { timeout: 8000 });
      await sleep(300);
      const ticked = await page.evaluate(() => document.querySelectorAll('[data-cq-slip] input[type=checkbox]:checked').length);
      check(ticked >= 1, `${lang}: the week's cheques are ticked (${ticked})`);
      const s4 = await spills(page), sl4 = await sheetSlides(page);
      check(!s4.out.length && !sl4.length, `${lang}: the slip sheet fits (${s4.out.concat(sl4).slice(0, 4).join(' | ') || 'ok'})`);
      await closeModals(page);
      check(!errors.length, `${lang}: no page error${errors.length ? ' · ' + errors.slice(0, 2).join(' | ') : ''}`);
    });
  }
} finally {
  server.close();
}
await S.finish();
console.log(`cheques-phone: ${checks} checks green`);
