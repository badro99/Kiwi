#!/usr/bin/env node
/* Kiwi · sync-ledger-browser-test — the till and the dashboard tell one story.
 *   node tools/sync-ledger-browser-test.mjs
 *
 * The most repeated ticket class: « le tableau de bord ne correspond pas à la
 * caisse » (#77, #96, #98 restaurants, #154 app vs web) and #142, where Pasta
 * Corner's orders showed inside Amira Cafe. Each was patched where it showed.
 * This suite measures the whole loop instead, on the real product:
 *
 *   tools/kiwi-local-stack.mjs (every Pages Function + a D1 shim over sqlite,
 *   fresh database per run) · two merchants created through the real signup
 *   and onboarding wizard · counter tablets paired through the dashboard's
 *   own hand-off · sales rung with real clicks: cash, card, split, refund,
 *   void, a sale taken offline and replayed, a sale across the 05:00 business
 *   day boundary.
 *
 * Then it asserts, to the centime, that the dashboard's Home KPIs, its
 * Transactions list and its day report equal the till's own totals and the
 * sales the suite actually rang, and that a second merchant paired on the same
 * tablet sees none of the first one's money, on its till or its dashboard.
 *
 * Synthetic data only: the database is a temp file, the merchants are
 * `TEST KIWI …` accounts created here, the staff codes are random per run and
 * never printed (browser-trace secret handles). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { suite, secret, InfraError } from './browser-trace.mjs';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let puppeteer;
try { puppeteer = createRequire(path.join(ROOT, 'app/package.json'))('puppeteer-core'); }
catch { console.log('○ sync-ledger not run: puppeteer-core unavailable (not counted as passed)'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ sync-ledger not run: Chromium unavailable (not counted as passed)'); process.exit(process.env.CI ? 1 : 0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERBOSE = !!process.env.KIWI_SYNC_VERBOSE;
const log = (...a) => { if (VERBOSE) console.log('   ·', ...a); };

/* ── the local stack ──────────────────────────────────────────────────── */
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function startStack() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiwi-sync-ledger-'));
  const dbFile = path.join(dir, 'd1.sqlite');
  const child = spawn(process.execPath, ['--no-warnings', path.join(ROOT, 'tools/kiwi-local-stack.mjs'), '--reset'], {
    cwd: ROOT, env: { ...process.env, KIWI_STACK_PORT: String(port), KIWI_STACK_DB: dbFile }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const errors = [];
  child.stderr.on('data', (d) => { const s = String(d); errors.push(s); if (VERBOSE) process.stderr.write('[stack] ' + s); });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new InfraError('local stack did not start in 30 s')), 30000);
    child.stdout.on('data', (d) => { if (/Kiwi local stack/.test(String(d))) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new InfraError('local stack exited ' + code + ': ' + errors.join('').slice(-400))); });
  });
  const db = new DatabaseSync(dbFile, { timeout: 10000 });
  return {
    base: `http://localhost:${port}`, db, errors,
    stop() { try { db.close(); } catch (_) {} child.kill('SIGTERM'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} },
  };
}

const stack = await startStack();
const base = stack.base;
const browser = await puppeteer.launch({
  executablePath: bin, headless: true,
  args: ['--no-sandbox', '--lang=fr-FR', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost'],
});
/* Two halves, so each stays well inside check.js's five minutes per suite:
 * the restaurant + OrderPro scenarios here, the boutique ones in
 * sync-ledger-boutique-browser-test.mjs (which sets KIWI_SYNC_PART). */
const PART = process.env.KIWI_SYNC_PART === 'boutique' ? 'boutique' : 'resto';
const S = suite(PART === 'boutique' ? 'sync-ledger-boutique' : 'sync-ledger', { browser });
process.on('exit', () => { try { stack.stop(); } catch (_) {} });

/* ── one merchant: account, store, codes ──────────────────────────────── */
const digits = () => String(crypto.randomInt(1000, 9999));
function merchant(label, type) {
  const raw = digits();
  return {
    label, type,
    email: `${label}.${crypto.randomBytes(3).toString('hex')}@sync.test`,
    password: 'local-' + crypto.randomBytes(9).toString('base64url'),
    business: `TEST KIWI ${label[0].toUpperCase() + label.slice(1)} Sync`,
    pin: secret(label + '-owner-code', raw),
    _pin: raw,                      // typed on keypads only, never logged
    slug: '',
  };
}

/* Every page gets the hosted experience (no localhost demo), no print dialog
 * and no service worker: the SW serves a shell, and this suite tests code. */
async function preparePage(t, page, viewport = { width: 1180, height: 820 }) {
  t.watch(page);
  await page.setViewport(viewport);
  await page.setBypassServiceWorker(true);
  /* The store is in Casablanca; the machine running this suite may not be.
   * Without this a 04:57 sale lands on the wrong side of the 05:00 turn. */
  await page.emulateTimezone('Africa/Casablanca');
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('kiwiDemos', '0'); localStorage.setItem('kiwiLang', 'fr'); } catch (_) {}
    try { window.print = () => {}; } catch (_) {}
    try { Object.defineProperty(navigator.serviceWorker, 'register', { value: () => new Promise(() => {}), configurable: true }); } catch (_) {}
  });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(60000);
  return page;
}
async function api(page, method, url, body) {
  return page.evaluate(async (m, u, b) => {
    const r = await fetch(u, { method: m, credentials: 'same-origin', headers: b ? { 'content-type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    return { status: r.status, body: j };
  }, method, url, body || null);
}
async function signIn(page, m) {
  if (!/^http/.test(page.url())) await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  const r = await api(page, 'POST', '/auth/login', { email: m.email, password: m.password });
  if (r.status !== 200) throw new Error(`sign-in ${m.label}: ${r.status} ${JSON.stringify(r.body)}`);
}
/* A till re-renders under its pollers: a button found a moment ago can be
 * replaced before the tap lands. Find it again, as a finger would. */
async function clickSel(page, sel) {
  for (let i = 0; ; i++) {
    const el = await page.waitForSelector(sel, { visible: true });
    try { await el.click(); return; } catch (e) {
      if (i >= 4 || !/detached|not clickable|not an Element|no longer|Node is either/i.test(e.message)) throw e;
      await sleep(300);
    }
  }
}
async function typeDigits(page, keySel, value) {
  for (const d of value) { await clickSel(page, keySel.replace('%', d)); await sleep(90); }
}

/* Signup, then the real onboarding wizard, then the operator's activation
 * (the store is born `pending`; tools/kiwi-local-stack.mjs --seed does the
 * same). */
async function createMerchant(t, ctx, m) {
  const page = await preparePage(t, await ctx.newPage());
  t.step(`${m.label}: sign up`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  const r = await api(page, 'POST', '/auth/signup', { email: m.email, password: m.password, name: 'Test ' + m.label, business: m.business });
  if (r.status !== 200) throw new Error(`signup ${m.label}: ${r.status} ${JSON.stringify(r.body)}`);
  t.step(`${m.label}: onboarding wizard`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // Commencer
  await clickSel(page, `[data-type="${m.type}"]`);
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // business
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // how many stores
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // team size
  await sleep(250); await clickSel(page, '.kob-btn.primary[data-go="next"]'); // priorities
  await sleep(250);
  const pin = await page.waitForSelector('[data-pin-code="0"]', { visible: true });
  await pin.click(); await pin.type(m._pin);
  await clickSel(page, '.kob-btn.primary[data-go="next"]');                 // Presque fini
  await clickSel(page, '[data-finish]');
  await page.waitForFunction(() => !!localStorage.getItem('kiwiLiveMerchant') && localStorage.getItem('kiwiOnboarded') === '1', { timeout: 30000 });
  m.slug = await page.evaluate(() => localStorage.getItem('kiwiLiveMerchant'));
  await page.waitForFunction(async (slug) => {
    const r = await fetch('/api/config?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin' });
    return r.ok;
  }, { timeout: 15000 }, m.slug);
  const n = stack.db.prepare("UPDATE merchant_config SET status = 'active', plan = 'pro' WHERE merchant = ?").run(m.slug).changes;
  if (!n) throw new Error(`${m.label}: store ${m.slug} was not created`);
  log(m.label, 'store', m.slug);
  return page;
}

/* The counter tablet opens its till the way the dashboard's « Ouvrir la caisse
 * sur cet appareil » does (assets/caisse-link.js handOff): name the store in
 * kiwiPairHandoff, open kiwi-caisse.html?pair=1, and let the till pair itself
 * from the owner's session. */
async function pairTill(t, page, m) {
  t.step(`pair the tablet to ${m.label}`);
  await signIn(page, m);
  await page.evaluate((h) => localStorage.setItem('kiwiPairHandoff', JSON.stringify({ ...h, ts: Date.now() })),
    { merchant: m.slug, type: m.type, name: m.business, subtype: '', location: '' });
  await page.goto(base + '/kiwi-caisse.html?pair=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((slug) => {
    try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null')?.merchant === slug; } catch (_) { return false; }
  }, { timeout: 30000 }, m.slug);
  await unlockTill(t, page, m);
}
async function unlockTill(t, page, m) {
  t.step(`${m.label}: staff code on the till`);
  /* The keypad can be drawn twice while the paired till boots: wait for it to
   * hold still, and start the code again if it is redrawn under the fingers. */
  for (let attempt = 0; ; attempt++) {
    await page.waitForSelector('[data-cpp="1"]', { visible: true, timeout: 45000 });
    await sleep(1500);
    try { await typeDigits(page, '[data-cpp="%"]', m._pin); break; } catch (e) {
      if (attempt >= 1) throw e;
      t.step(`${m.label}: keypad redrawn, code again`);
    }
  }
  /* Either the drawer asks for its opening float, or the keypad goes away. */
  const next = await until(page, () => {
    const float = [...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^300 MAD$/.test(b.textContent.trim()));
    const shown = (sel) => [...document.querySelectorAll(sel)].some((b) => b.offsetWidth);
    return { ok: float || shown('[data-mode="vrap"]') || shown('#bq-today'), float };
  }, null, 30000);
  if (next.float) {
    t.step(`${m.label}: opening float`);
    /* The tap on « 300 MAD » can land on a button the till is about to redraw:
     * pick the float until « Ouvrir la caisse » is really enabled. */
    const openEnabled = () => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^Ouvrir la caisse$/.test(b.textContent.trim()) && !b.disabled));
    for (let i = 0; i < 8 && !(await openEnabled()); i++) {
      try { await clickText(page, 'button', /^300 MAD$/); } catch (_) {}
      await sleep(700);
    }
    await clickText(page, 'button, [role=button], .clockin-btn', /^Ouvrir la caisse$/);
    const open = await until(page, () => ({ ok: !([...document.querySelectorAll('button')].some((b) => b.offsetWidth && /^300 MAD$/.test(b.textContent.trim()))) }), null, 20000);
    if (!open.ok) throw new Error(`${m.label}: the till never opened after the float`);
    await sleep(800);
  }
}
async function clickText(page, scope, re) {
  for (let i = 0; i < 6; i++) {
    if (await markText(page, scope, re)) {
      const el = await page.$('[data-sl-tap]');
      try { if (el && await el.isVisible()) { await el.click(); return; } } catch (_) {}
    }
    await sleep(600);
  }
  throw new Error('nothing to click matching ' + re);
}
/* Tag the first visible element whose text matches, so a re-render between
 * finding and tapping is retried by clickText, not mistaken for a failure. */
async function markText(page, scope, re) {
  return page.evaluate((s, src) => {
    const rx = new RegExp(src);
    const el = [...document.querySelectorAll(s)].find((x) => x.offsetWidth && rx.test(x.textContent.replace(/\s+/g, ' ').trim()));
    document.querySelectorAll('[data-sl-tap]').forEach((x) => x.removeAttribute('data-sl-tap'));
    if (el) el.setAttribute('data-sl-tap', '1');
    return !!el;
  }, scope, re.source);
}

/* ── money, read off the screen ───────────────────────────────────────── */
/* "1 234,56 MAD", "− 20,4 MAD", "-20,40", "64MAD" → centimes. */
function cents(text) {
  if (text == null) return NaN;
  const t = String(text).replace(/[    ]/g, '').replace(/MAD|DH|DHS/gi, '').replace(/[−–]/g, '-');
  const m = /(-?)(\d+)(?:,(\d{1,2}))?/.exec(t);
  if (!m) return NaN;
  const dec = (m[3] || '').padEnd(2, '0');
  return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number(dec || 0));
}
const mad = (c) => (c / 100).toFixed(2).replace('.', ',');
/* The value printed right after a label in a block of innerText. */
function after(text, label, nth = 0) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  let seen = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (label instanceof RegExp ? label.test(lines[i]) : lines[i].toLowerCase() === label.toLowerCase()) {
      if (seen++ === nth) return lines[i + 1];
    }
  }
  return null;
}
const findings = [];
/* Each scenario reports every mismatch it sees, then fails once with all of
 * them: one wrong figure must not hide the next. */
async function scenario(name, body) {
  if ((PART === 'boutique') !== name.startsWith('boutique ·')) return;
  await S.run(name, async (t) => {
    const before = findings.length;
    await body(t);
    const mine = findings.slice(before);
    if (mine.length) throw new Error(mine.length + ' mismatch(es): ' + mine.join(' | '));
  });
}
function check(ok, msg, detail) {
  if (ok) { console.log('  ✓ ' + msg); return true; }
  findings.push(msg + (detail ? ' · ' + detail : ''));
  console.log('  ✗ ' + msg + (detail ? ' · ' + detail : ''));
  return false;
}
function eqCents(actual, expected, msg) {
  return check(actual === expected, `${msg} = ${mad(expected)} MAD`, `screen says ${Number.isNaN(actual) ? 'nothing' : mad(actual) + ' MAD'}`);
}
async function until(page, fn, arg, timeout = 20000) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = await page.evaluate(fn, arg); if (last && last.ok) return last; } catch (_) {}
    await sleep(500);
  }
  return last || { ok: false };
}

/* ── a virtual clock for every page of one tablet or dashboard ─────────── */
/* Business days turn at 05:00 (two clocks, CLAUDE.md §5). The only honest way
 * to ring a sale at 04:57 and another at 05:02 is to move the browser's Date,
 * for the till AND the dashboard that reads it. The server keeps its clock:
 * /api/sale accepts a past device time as the sale time, as it does for an
 * offline till that replays its queue. */
async function setClock(page, atMs) {
  const offset = atMs == null ? 0 : atMs - Date.now();
  if (page.__slClock) { try { await page.removeScriptToEvaluateOnNewDocument(page.__slClock); } catch (_) {} }
  const patch = (off) => {
    window.__slOffset = off;
    if (window.__slDatePatched) return;
    window.__slDatePatched = true;
    const Real = Date, realNow = Real.now.bind(Real);
    function D(...a) {
      if (!new.target) return new Real(realNow() + (window.__slOffset || 0)).toString();
      return a.length ? new Real(...a) : new Real(realNow() + (window.__slOffset || 0));
    }
    D.prototype = Real.prototype;
    D.now = () => realNow() + (window.__slOffset || 0);
    D.parse = Real.parse; D.UTC = Real.UTC;
    Object.setPrototypeOf(D, Real);
    window.Date = D;
  };
  page.__slClock = (await page.evaluateOnNewDocument(patch, offset)).identifier;
  try { await page.evaluate(patch, offset); } catch (_) {}
}
/* Casablanca civil time, computed by the BROWSER's time-zone data, never by
 * Node's: Morocco left UTC+1 for UTC+0 on 2026-09-20, Chrome 155 knows it and
 * Node 24 (tz 2026b) does not. The till reads the browser's clock, so the
 * suite must too. */
const ZONE = 'Africa/Casablanca';
async function casaTime(page, day, hh, mm) {
  return page.evaluate((zone, day, hh, mm) => {
    const guess = Date.parse(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    for (let off = -3; off <= 3; off++) {
      const t = guess - off * 3600000;
      const [h, m] = fmt.format(t).split(':').map(Number);
      if (h === hh && m === mm) return t;
    }
    return guess;
  }, ZONE, day, hh, mm);
}
async function casaDay(page, ms) {
  return page.evaluate((zone, ms) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms), ZONE, ms);
}
async function casaHHMM(page, ms) {
  return page.evaluate((zone, ms) => new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms), ZONE, ms);
}

/* ── the restaurant till ──────────────────────────────────────────────── */
async function restoGreetGone(page) {
  await page.waitForFunction(() => !!document.querySelector('[data-mode="vrap"]') && document.querySelector('[data-mode="vrap"]').offsetWidth > 0, { timeout: 30000 });
  await sleep(2500);    // « Bonsoir … » greeting veil
}
async function restoTakeaway(page) {
  await clickSel(page, '[data-mode="vrap"]');
  await sleep(500);
  const fresh = await page.$('#vrap-new-order');
  if (fresh && await fresh.evaluate((e) => e.offsetWidth > 0)) { await fresh.click(); await sleep(500); }
}
async function restoAdd(page, items) {
  for (const id of items) { await clickSel(page, `.menu-item[data-menu-id="${id}"]`); await sleep(250); }
}
async function restoSale(t, page, items, tender) {
  t.step(`till: ${items.join('+')} · ${typeof tender === 'string' ? tender : 'split'}`);
  await restoTakeaway(page);
  await restoAdd(page, items);
  const before = await txCount(page);
  if (tender === 'cash') {
    await clickSel(page, '#pay-charge');
    await clickSel(page, '[data-set="exact"]');
    await clickSel(page, '#cash-confirm');
  } else if (tender === 'card') {
    await clickSel(page, '#pay-card');
    await clickSel(page, '#card-confirm');
  } else {
    await clickSel(page, '#pay-split');
    await clickSel(page, `[data-parts="${tender.length}"]`);
    await clickSel(page, '#split-launch');
    for (let i = 0; i < tender.length; i++) {
      await clickSel(page, `[data-pay-part="${i}"][data-pay-method="${tender[i] === 'card' ? 'carte' : 'cash'}"]`);
      if (tender[i] === 'card') await clickSel(page, '#card-confirm');
      else { await clickSel(page, '[data-set="exact"]'); await clickSel(page, '#cash-confirm'); }
      await sleep(700);
    }
    const done = await page.$('#split-done-close');
    if (done && await done.evaluate((e) => e.offsetWidth > 0)) await done.click();
  }
  const parts = typeof tender === 'string' ? 1 : tender.length;
  await page.waitForFunction((n) => {
    const m = /(\d+)/.exec((document.getElementById('stat-txns-card') || {}).innerText || '');
    return m && +m[1] >= n;
  }, { timeout: 15000 }, before + parts);
  await sleep(400);
}
async function txCount(page) {
  return page.evaluate(() => { const m = /(\d+)/.exec((document.getElementById('stat-txns-card') || {}).innerText || ''); return m ? +m[1] : 0; });
}
async function managerCode(page, m) {
  await page.waitForSelector('[data-mgr="1"]', { visible: true });
  await typeDigits(page, '[data-mgr="%"]', m._pin);
}
async function restoRefund(t, page, m, nthFromTop, amountText) {
  t.step(`till: refund ${amountText}`);
  await clickSel(page, '[data-action="remboursement"]');
  await page.waitForSelector('[data-rf-id]', { visible: true });
  const ids = await page.$$eval('[data-rf-id]', (els) => els.map((e) => e.getAttribute('data-rf-id')));
  await clickSel(page, `[data-rf-id="${ids[nthFromTop]}"]`);
  const amt = await page.waitForSelector('#rf-amount', { visible: true });
  await amt.click({ clickCount: 3 }); await amt.type(amountText);
  await clickSel(page, '[data-rf-reason="Plat retourné"]');
  await clickSel(page, '#rf-confirm');
  await managerCode(page, m);
  await sleep(2000);
}
async function restoVoid(t, page, m) {
  t.step('till: void the last sale');
  await clickSel(page, '[data-action="cancel-sale"]');
  await clickSel(page, '[data-kx-rp="0"]');
  await clickSel(page, '[data-kx-rp-cancel]');
  const pin = await page.waitForSelector('[data-kx-rp-pin]', { visible: true });
  await pin.click(); await pin.type(m._pin);
  await clickSel(page, '[data-kx-rp-confirm]');
  await sleep(2000);
}
/* The till's own « Rapport du jour », Résumé tab. */
async function restoReport(page) {
  await clickSel(page, '#stat-txns-card');
  await clickSel(page, '[data-rp-tab="resume"]');
  await sleep(500);
  const text = await page.$eval('#journal-drawer', (e) => e.innerText);
  await clickSel(page, '#journal-drawer-close');
  await sleep(300);
  const pay = text.slice(text.search(/MOYENS DE PAIEMENT/i));
  return {
    text,
    net: cents(after(text, 'NET APRÈS REMBOURSEMENTS')),
    tx: Number(after(text, 'TRANSACTIONS')),
    basket: cents(after(text, 'TICKET MOYEN')),
    gross: cents(after(text, 'VENTES AVANT REMBOURSEMENTS')),
    card: cents(after(pay, 'Carte')) || 0,
    cash: cents(after(pay, 'Espèces')) || 0,
    refunds: /Remboursements \(\d+\)/.test(text) ? Math.abs(cents(after(text, /^Remboursements \(\d+\)$/))) : 0,
  };
}

/* ── the dashboard ────────────────────────────────────────────────────── */
async function openDashboard(t, page, m) {
  t.step(`${m.label}: dashboard`);
  await page.goto(base + '/dashboard.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kiwi-pin-input]', { timeout: 30000 });
  await sleep(800);
  await page.evaluate(() => document.querySelector('[data-kiwi-pin-input]').focus());
  for (const d of m._pin) { await page.keyboard.press(d); await sleep(120); }
  await page.waitForFunction(() => !document.querySelector('[data-kiwi-lock]') || document.querySelector('[data-kiwi-lock]').classList.contains('is-unlocking') || getComputedStyle(document.querySelector('[data-kiwi-lock]')).display === 'none', { timeout: 20000 }).catch(() => {});
  await page.waitForSelector('[data-kpi="tx"]', { visible: true, timeout: 30000 });
  await sleep(1500);
}
async function dashNav(page, nav) {
  await clickSel(page, `[data-nav="${nav}"]`);
  await sleep(1800);
}
/* Home: the KPI band, the revenue hero and the payment ring, once they stop
 * animating and show `expectTx` sales (the feed polls every few seconds). */
async function dashHome(page, expectTx) {
  await dashNav(page, 'accueil');
  const read = () => page.evaluate(() => {
    const v = (sel) => { const e = document.querySelector(sel); return e ? e.textContent : null; };
    return {
      tx: v('[data-kpi="tx"] [data-kpi-val]'), basket: v('[data-kpi="panier"] [data-kpi-val]'),
      net: v('[data-kpi="revenue"] [data-kpi-val]'), hero: v('[data-rev-hero-val]'),
      mix: v('[data-mix-center-amt]'),
    };
  });
  const t0 = Date.now();
  let a = await read(), b;
  while (Date.now() - t0 < 25000) {
    await sleep(1200);
    b = await read();
    if (JSON.stringify(a) === JSON.stringify(b) && (expectTx == null || Number(String(b.tx).replace(/\D/g, '')) === expectTx)) break;
    a = b;
  }
  b = b || a;
  return { raw: b, tx: Number(String(b.tx).replace(/\D/g, '')), basket: cents(b.basket), net: cents(b.net), hero: cents(b.hero), mix: cents(b.mix) };
}
/* A real store has no demo goal or demo takings on its Home: « 28 000 »,
 * « 27 512,50 » and the demo's day-before comparison belong to the sample café. */
async function demoLeaks(page) {
  const text = await page.$eval('main', (e) => e.innerText);
  return ['27 512', '28 000', '3 724'].filter((n) => text.replace(/[\u00a0\u202f]/g, ' ').includes(n));
}
async function dashTransactions(page) {
  await dashNav(page, 'transactions');
  const text = await page.$eval('main', (e) => e.innerText);
  const m = /(\d+)\s+VENTES?\s+·/i.exec(text);
  return {
    text, count: m ? Number(m[1]) : NaN,
    gross: cents(after(text, 'Encaissements')),
    refunds: Math.abs(cents(after(text, 'Remboursements'))) || 0,
    net: cents(after(text, 'Net encaissé')),
  };
}
async function dashReport(page, offset) {
  await dashNav(page, 'rapport');
  await clickSel(page, `[data-dr-day-offset="${offset}"]`);
  await sleep(1800);
  const text = await page.$eval('main', (e) => e.innerText);
  const pay = text.slice(Math.max(0, text.search(/MOYENS DE PAIEMENT/i)));
  return {
    text, empty: /Aucune vente ce jour-là/.test(text),
    net: cents(after(text, 'NET DU JOUR')), tx: Number(after(text, 'TRANSACTIONS')),
    basket: cents(after(text, 'TICKET MOYEN')), gross: cents(after(text, 'VENTES AVANT REMBOURSEMENTS')),
    card: cents(after(pay, 'Carte')) || 0, cash: cents(after(pay, 'Espèces')) || 0,
  };
}
/* Compare one surface's reading with the ledger of what was rung. */
function compare(where, got, want) {
  if ('tx' in got && got.tx != null) check(got.tx === want.tx, `${where} · transactions = ${want.tx}`, `screen says ${got.tx}`);
  if ('gross' in got) eqCents(got.gross, want.gross, `${where} · sales before refunds`);
  if ('refunds' in got) eqCents(got.refunds, want.refunds, `${where} · refunds`);
  if ('net' in got) eqCents(got.net, want.net, `${where} · net`);
  if ('basket' in got) eqCents(got.basket, want.basket, `${where} · average ticket`);
  if ('card' in got) eqCents(got.card, want.card, `${where} · card, net`);
  if ('cash' in got) eqCents(got.cash, want.cash, `${where} · cash, net`);
}
/* What the suite rang, as the till's own report should total it. */
function ledger(rows) {
  const sales = rows.filter((r) => r.kind === 'sale');
  const refunds = rows.filter((r) => r.kind === 'refund');
  const gross = sales.reduce((s, r) => s + r.cents, 0);
  const ref = refunds.reduce((s, r) => s + r.cents, 0);
  const by = (k) => sales.filter((r) => r.method === k).reduce((s, r) => s + r.cents, 0) - refunds.filter((r) => r.method === k).reduce((s, r) => s + r.cents, 0);
  return { tx: sales.length, gross, refunds: ref, net: gross - ref, basket: sales.length ? Math.round(gross / sales.length) : 0, card: by('card'), cash: by('cash') };
}

/* ── the run ──────────────────────────────────────────────────────────── */
const RESTO = merchant('resto', 'restaurant');
const NIGHT = merchant('nuit', 'restaurant');
const BOUT = merchant('boutique', 'boutique');
const MENU = { cats: [{ id: 'c1', name: 'Plats' }], items: [
  { id: 'i1', name: 'Tajine poulet', price: 72.5, catId: 'c1' },
  { id: 'i2', name: 'Couscous', price: 85, catId: 'c1' },
  { id: 'i3', name: 'Thé menthe', price: 12.25, catId: 'c1' },
] };
/* The second restaurant's carte must be its own: /api/menu refuses a carte made
 * of another store's dishes (functions/api/_tenant-guard.js, the 26/09 God Mode
 * incident), and it is right to. */
const MENU_N = { cats: [{ id: 'nc1', name: 'Carte' }], items: [
  { id: 'n1', name: 'Tajine kefta', price: 72.5, catId: 'nc1' },
  { id: 'n2', name: 'Pastilla', price: 85, catId: 'nc1' },
  { id: 'n3', name: 'Café noir', price: 12.25, catId: 'nc1' },
] };
const PRICE = { i1: 7250, i2: 8500, i3: 1225, n1: 7250, n2: 8500, n3: 1225 };
const sum = (ids) => ids.reduce((s, id) => s + PRICE[id], 0);
const owners = {};

const MINE = PART === 'boutique' ? [BOUT] : [RESTO, NIGHT];
await S.run(`setup · ${MINE.length === 1 ? 'one merchant' : 'two merchants'} through signup and the wizard`, async (t) => {
  for (const m of MINE) {
    const ctx = await browser.createBrowserContext();
    owners[m.label] = { ctx, page: await createMerchant(t, ctx, m) };
  }
  for (const [m, menu] of [[RESTO, MENU], [NIGHT, MENU_N]]) {
    if (!MINE.includes(m)) continue;
    const pub = await api(owners[m.label].page, 'POST', '/api/menu', { merchant: m.slug, type: 'restaurant', data: menu });
    if (pub.status !== 200) throw new Error(`menu publish ${m.label}: ${pub.status} ${JSON.stringify(pub.body)}`);
  }
  console.log(`  ✓ ${MINE.length} store(s) created and activated (${MINE.map((m) => m.slug).join(', ')})`);
});
if (MINE.some((m) => !m.slug)) { await S.finish(); }

const tabletCtx = await browser.createBrowserContext();
let tablet;
const restoRows = [];

await scenario('restaurant · cash, card, split, refund, void and an offline sale', async (t) => {
  tablet = await preparePage(t, await tabletCtx.newPage());
  await pairTill(t, tablet, RESTO);
  await restoGreetGone(tablet);

  await restoSale(t, tablet, ['i1', 'i3'], 'cash');
  restoRows.push({ kind: 'sale', method: 'cash', cents: sum(['i1', 'i3']) });
  await restoSale(t, tablet, ['i2', 'i2'], 'card');
  restoRows.push({ kind: 'sale', method: 'card', cents: sum(['i2', 'i2']) });
  await restoSale(t, tablet, ['i2', 'i3'], ['card', 'cash']);
  const half = sum(['i2', 'i3']);
  restoRows.push({ kind: 'sale', method: 'card', cents: Math.ceil(half / 2) }, { kind: 'sale', method: 'cash', cents: half - Math.ceil(half / 2) });
  // refund 20,40 on the card sale of 170 (third row from the top of the list)
  await restoRefund(t, tablet, RESTO, 2, '20.40');
  restoRows.push({ kind: 'refund', method: 'card', cents: 2040 });
  await restoSale(t, tablet, ['i3'], 'cash');
  await restoVoid(t, tablet, RESTO);
  t.step('till: offline sale');
  await tablet.setOfflineMode(true);
  await restoSale(t, tablet, ['i1'], 'card');
  restoRows.push({ kind: 'sale', method: 'card', cents: PRICE.i1 });
  await sleep(1500);
  await tablet.setOfflineMode(false);
  t.step('till: back online, the queue drains');
  await tablet.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(5000);

  const want = ledger(restoRows);
  const till = await restoReport(tablet);
  compare('till report', till, want);
  const server = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(RESTO.slug);
  check(Number(server.c) === want.net && Number(server.n) === want.tx + 1, `server ledger · ${want.tx} sales + 1 refund, net ${mad(want.net)} MAD`, `D1 has ${server.n} rows, ${mad(Number(server.c))} MAD`);

  const dash = owners.resto.page;
  await openDashboard(t, dash, RESTO);
  const home = await dashHome(dash, want.tx);
  compare('dashboard home', { tx: home.tx, basket: home.basket, net: home.net }, want);
  eqCents(home.hero, want.net, 'dashboard home · revenue hero');
  eqCents(home.mix, want.net, 'dashboard home · payment ring (MAD encaissé)');
  { const leaks = await demoLeaks(dash); check(!leaks.length, 'dashboard home · no demo figure on a real store', leaks.join(', ')); }
  const tx = await dashTransactions(dash);
  compare('dashboard transactions', { tx: tx.count, gross: tx.gross, refunds: tx.refunds, net: tx.net }, want);
  const rep = await dashReport(dash, 0);
  compare('dashboard day report', { tx: rep.tx, gross: rep.gross, net: rep.net, basket: rep.basket, card: rep.card, cash: rep.cash }, want);
});

await scenario('same tablet, second restaurant · sees none of the first one, and the 05:00 turn', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenario');
  const realNow = Date.now();
  const day = await casaDay(tablet, realNow - 6 * 3600000);
  const prevDay = await casaDay(tablet, Date.parse(day + 'T12:00:00Z') - 86400000);
  await setClock(tablet, await casaTime(tablet, day, 4, 56));
  await signIn(tablet, NIGHT);
  await pairTill(t, tablet, NIGHT);
  await restoGreetGone(tablet);
  check(await txCount(tablet) === 0, `${NIGHT.label}'s till starts at 0 transactions on the re-paired tablet`, `it shows ${await txCount(tablet)}`);
  const empty = await restoReport(tablet);
  check(!(empty.net > 0) && !(empty.gross > 0), `${NIGHT.label}'s till report carries none of ${RESTO.label}'s money`, `net ${mad(empty.net || 0)} · gross ${mad(empty.gross || 0)}`);

  await restoSale(t, tablet, ['n2'], 'cash');                  // 04:57 → yesterday's business day
  await setClock(tablet, await casaTime(tablet, day, 5, 2));
  await restoSale(t, tablet, ['n3'], 'card');                  // 05:02 → today
  const before = { kind: 'sale', method: 'cash', cents: PRICE.n2 };
  const afterTurn = { kind: 'sale', method: 'card', cents: PRICE.n3 };
  const rows = stack.db.prepare('SELECT ts, amount_cents FROM sales WHERE merchant = ? ORDER BY ts').all(NIGHT.slug);
  const seen = [];
  for (const r of rows) seen.push({ hm: await casaHHMM(tablet, r.ts), day: await casaDay(tablet, r.ts) });
  check(rows.length === 2 && seen[0].hm < '05:00' && seen[1].hm >= '05:00' && seen[0].day === day && seen[1].day === day,
    'server · the two sales keep their till times, either side of 05:00', seen.map((x) => x.hm + ' ' + x.day).join(', '));
  const cut = await tablet.evaluate((slug) => ({ cutoff: window.KiwiDayReport?.cutoff?.(slug), today: window.KiwiDayReport?.today?.(slug) }), NIGHT.slug);
  check(cut.cutoff === 5 && cut.today === day, `till · business day turns at 05:00 and today is ${day}`, JSON.stringify(cut));
  const till = await restoReport(tablet);
  compare('till report after 05:00', till, ledger([afterTurn]));

  const dash = owners.nuit.page;
  await setClock(dash, await casaTime(dash, day, 5, 6));
  await openDashboard(t, dash, NIGHT);
  const dcut = await dash.evaluate((slug) => ({ cutoff: window.KiwiDayReport?.cutoff?.(slug), today: window.KiwiDayReport?.today?.(slug) }), NIGHT.slug);
  check(dcut.cutoff === 5 && dcut.today === day, `dashboard · business day turns at 05:00 and today is ${day}`, JSON.stringify(dcut));
  const home = await dashHome(dash, 1);
  compare('dashboard home (today)', { tx: home.tx, net: home.net }, ledger([afterTurn]));
  const repToday = await dashReport(dash, 0);
  compare('dashboard day report (today)', { tx: repToday.tx, net: repToday.net }, ledger([afterTurn]));
  const repPrev = await dashReport(dash, 1);
  compare(`dashboard day report (${prevDay})`, { tx: repPrev.tx, net: repPrev.net }, ledger([before]));

  /* #142: the first restaurant's dashboard still has every sale, none moved. */
  const resto = await dashTransactions(owners.resto.page);
  compare(`${RESTO.label} dashboard after the tablet moved`, { tx: resto.count, net: resto.net }, ledger(restoRows));
  const leak = stack.db.prepare('SELECT COUNT(*) AS n FROM sales WHERE merchant = ?').get(NIGHT.slug);
  check(Number(leak.n) === 2, `server · ${NIGHT.label} holds exactly its own 2 sales`, `D1 has ${leak.n}`);
});

const bqCtx = await browser.createBrowserContext();
let bq;
const bqRows = [];
const BQ_ITEMS = [
  { name: 'TEST Chemise lin', price: 249 },
  { name: 'TEST Foulard', price: 90 },
  { name: 'TEST Ceinture', price: 158 },
];
const BQ = Object.fromEntries(BQ_ITEMS.map((it) => [it.name, it.price * 100]));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* « dim. 19 oct. · 12:04 · 3 ventes · 678 MAD aujourd'hui » */
async function bqHead(page) {
  const s = await page.$eval('#bq-today', (e) => e.textContent);
  const m = /(\d+)\s+ventes?\s+·\s+(.+?)\s*MAD/.exec(s);
  return { raw: s, tx: m ? Number(m[1]) : NaN, net: m ? cents(m[2]) : NaN };
}
/* The till's own receipts, compared with the server by z-reconciliation.js.
   The boutique till never sent this comparison (Santos Store: 211 sales in two
   weeks, no row in z_reconciliations), so a receipt that never arrived was
   seen by nobody. The row is written by /api/z-reconciliation; poll it until
   the till's last snapshot has been compared. */
async function zMatched(t, slug, count, cents, label) {
  t.step(label);
  let row = null;
  for (let i = 0; i < 45; i++) {
    try {
      row = stack.db.prepare('SELECT status, reported_count, reported_cents, server_count, server_cents, missing_count, mismatch_count FROM z_reconciliations WHERE merchant = ? ORDER BY updated_ts DESC LIMIT 1').get(slug);
    } catch (_) { row = null; }
    if (row && row.status === 'matched' && Number(row.reported_count) === count && Number(row.reported_cents) === cents) break;
    await sleep(1000);
  }
  check(!!row && row.status === 'matched' && Number(row.reported_count) === count && Number(row.reported_cents) === cents
    && Number(row.server_count) === count && Number(row.server_cents) === cents,
    `${label} · ${count} receipts, ${mad(cents)} MAD, matched`,
    row ? `z row ${row.status}: till ${row.reported_count} / ${mad(Number(row.reported_cents))} MAD, server ${row.server_count} / ${mad(Number(row.server_cents))} MAD, missing ${row.missing_count}, mismatched ${row.mismatch_count}` : 'no z_reconciliations row for this store');
}

/* One ticket on the boutique till: tap each article, add it, validate, pay. A
 * split takes « 50 % » on the first tender and the rest on the second. */
async function bqSale(t, page, names, tender) {
  const parts = Array.isArray(tender) ? tender : [tender];
  t.step(`boutique: ${names.join(' + ')} · ${parts.join(' + ')}`);
  const n0 = (await bqHead(page)).tx;
  for (const name of names) {
    await clickText(page, '[data-bq-item]', new RegExp(reEsc(name)));
    await sleep(500);
    await clickSel(page, '#bq-sheet-add');
    await sleep(500);
  }
  await clickSel(page, '#bq-validate');
  await sleep(900);
  if (parts.length > 1) { await clickSel(page, '[data-bq-share="0.5"]'); await sleep(400); }
  for (const p of parts) {
    await clickSel(page, p === 'card' ? '[data-bq-m="carte"]' : '[data-bq-m="especes"]');
    await sleep(600);
    await clickSel(page, p === 'card' ? '#bq-card-ok' : '#bq-cash-ok');
    await sleep(1000);
  }
  /* The receipt screen either waits for « Nouvelle vente » or has already
   * closed itself; the head count below is the proof the sale was booked. */
  const done = await page.waitForSelector('#bq-pay-done', { visible: true, timeout: 4000 }).catch(() => null);
  if (done) { try { await done.click(); } catch (_) {} }
  await sleep(600);
  const head = await until(page, (n) => {
    const m = /(\d+)\s+ventes?/.exec(document.querySelector('#bq-today')?.textContent || '');
    return { ok: !!m && Number(m[1]) === n, n: m && Number(m[1]) };
  }, n0 + 1);
  if (!head.ok) throw new Error(`boutique till did not count the sale (${n0} → ${head.n})`);
}
/* The till's own end of day: « Clôture de caisse », read, then back to work. */
async function bqCloture(page) {
  await clickSel(page, '#bq-close-day');
  await sleep(1800);
  const text = await page.evaluate(() => [...document.querySelectorAll('.modal-veil.is-open, [role=dialog]')]
    .filter((e) => e.offsetWidth).map((e) => e.innerText).join('\n'));
  await clickText(page, 'button', /^Continuer le service$/);
  await sleep(600);
  return {
    text, tx: Number(after(text, 'Transactions')), net: cents(after(text, 'Total encaissé')),
    card: cents(after(text, 'dont Carte')) || 0, cash: cents(after(text, 'dont Espèces')) || 0,
    basket: cents(after(text, 'Ticket moyen')),
  };
}

await scenario('boutique · cash, card, split and an offline sale', async (t) => {
  bq = await preparePage(t, await bqCtx.newPage());
  await pairTill(t, bq, BOUT);
  t.step('boutique catalogue');
  /* Seed once the sale screen is up: the till pulls its catalogue on open,
   * and an article added before that pull is replaced by it. */
  await bq.waitForSelector('#bq-today', { visible: true, timeout: 30000 });
  await bq.waitForFunction(() => !!window.KiwiBoutiqueCatalog, { timeout: 30000 });
  await sleep(3000);
  await bq.evaluate((items) => {
    const C = window.KiwiBoutiqueCatalog;
    items.forEach((it) => {
      const p = C.addProduct({ name: it.name, priceMAD: it.price, kind: 'taille' });
      C.addVariant({ productId: p.id, colorId: 'noir', size: 'M', stock: 20 });
    });
  }, BQ_ITEMS);
  const shelfReady = await until(bq, (n) => ({ ok: document.querySelectorAll('[data-bq-item]').length >= n }), BQ_ITEMS.length, 30000);
  if (!shelfReady.ok) throw new Error('the three test articles never reached the boutique till');

  await bqSale(t, bq, ['TEST Chemise lin'], 'cash');
  bqRows.push({ kind: 'sale', method: 'cash', cents: BQ['TEST Chemise lin'] });
  await bqSale(t, bq, ['TEST Foulard'], 'card');
  bqRows.push({ kind: 'sale', method: 'card', cents: BQ['TEST Foulard'] });
  /* 50 % of 339 in whole dirhams: 169 on the card, the 170 left in cash. */
  await bqSale(t, bq, ['TEST Chemise lin', 'TEST Foulard'], ['card', 'cash']);
  bqRows.push({ kind: 'sale', method: 'card', cents: 16900 }, { kind: 'sale', method: 'cash', cents: 17000 });
  t.step('boutique: offline sale');
  await bq.setOfflineMode(true);
  await bqSale(t, bq, ['TEST Ceinture'], 'card');
  bqRows.push({ kind: 'sale', method: 'card', cents: BQ['TEST Ceinture'] });
  await sleep(1500);
  await bq.setOfflineMode(false);
  await bq.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(6000);

  /* The split is one ticket in two tenders: it counts once. */
  const want = { ...ledger(bqRows), tx: 4 };
  want.basket = Math.round(want.gross / want.tx);
  const head = await bqHead(bq);
  compare('boutique till header', { tx: head.tx, net: head.net }, want);
  const clo = await bqCloture(bq);
  compare('boutique till clôture', { tx: clo.tx, net: clo.net, card: clo.card, cash: clo.cash, basket: clo.basket }, want);
  const server = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(BOUT.slug);
  check(Number(server.c) === want.net && Number(server.n) === want.tx, `server ledger · ${want.tx} boutique sales, ${mad(want.net)} MAD`, `D1 has ${server.n} rows, ${mad(Number(server.c))} MAD`);
  await zMatched(t, BOUT.slug, want.tx, want.net, 'boutique till · its receipts reconciled with the server');

  const dash = owners.boutique.page;
  await openDashboard(t, dash, BOUT);
  const home = await dashHome(dash, want.tx);
  compare('boutique dashboard home', { tx: home.tx, basket: home.basket, net: home.net }, want);
  eqCents(home.hero, want.net, 'boutique dashboard home · revenue hero');
  eqCents(home.mix, want.net, 'boutique dashboard home · payment ring (MAD encaissé)');
  const tx = await dashTransactions(dash);
  compare('boutique dashboard transactions', { tx: tx.count, gross: tx.gross, net: tx.net }, want);
  const rep = await dashReport(dash, 0);
  compare('boutique dashboard day report', { tx: rep.tx, gross: rep.gross, net: rep.net, basket: rep.basket, card: rep.card, cash: rep.cash }, want);

  if (process.env.KIWI_SYNC_HOLD) {
    fs.writeFileSync(process.env.KIWI_SYNC_HOLD, JSON.stringify({ ws: browser.wsEndpoint(), base, slugs: [RESTO.slug, NIGHT.slug, BOUT.slug], pins: process.env.KIWI_SYNC_HOLD_PINS ? [RESTO._pin, NIGHT._pin, BOUT._pin] : null }));
    console.log('HOLD', browser.wsEndpoint());
    await new Promise(() => {});
  }
});

/* A return in the boutique is never cash: it is an exchange or a store credit
 * (avoir). Sale A (90 cash) to a named client, returned for a 90 credit with a
 * manager code, then sale B (249) paid 90 by that credit and 159 in cash. The
 * money kept is 90 + 159 = 249, the goods kept are the 249 shirt: every surface
 * must say so, and the credit-paid part must not count as new takings. */
async function bqAttachClient(t, page, client, create) {
  t.step(`boutique: client ${client.name}${create ? ' (new card)' : ''}`);
  await clickSel(page, '#bq-tk-client');
  await page.waitForFunction(() => {
    const v = document.querySelector('#bq-client-veil');
    return v && v.classList.contains('is-open') && v.getAnimations().every((a) => a.playState === 'finished');
  }, { timeout: 8000 }).catch(() => {});
  if (create) {
    await clickSel(page, '#bq-cl-new');
    const name = await page.waitForSelector('#bq-cl-name', { visible: true });
    await name.click({ clickCount: 3 }); await name.type(client.name);
    const tel = await page.waitForSelector('#bq-cl-tel', { visible: true });
    await tel.click({ clickCount: 3 }); await tel.type(client.phone);
    await clickSel(page, '#bq-cl-create');
  } else {
    const q = await page.waitForSelector('#bq-cl-q', { visible: true });
    await q.type(client.phone);
    await sleep(500);
    await clickText(page, '[data-bq-cl]', new RegExp(reEsc(client.name)));
  }
  await sleep(700);
}
async function bqCart(page, names) {
  for (const name of names) {
    await clickText(page, '[data-bq-item]', new RegExp(reEsc(name)));
    await sleep(500);
    await clickSel(page, '#bq-sheet-add');
    await sleep(500);
  }
}
async function bqWaitCount(page, n) {
  const head = await until(page, (want) => {
    const m = /(\d+)\s+ventes?/.exec(document.querySelector('#bq-today')?.textContent || '');
    return { ok: !!m && Number(m[1]) === want, n: m && Number(m[1]) };
  }, n);
  if (!head.ok) throw new Error(`boutique till did not count the sale (${head.n} instead of ${n})`);
}
async function bqFinishReceipt(page) {
  const done = await page.waitForSelector('#bq-pay-done', { visible: true, timeout: 4000 }).catch(() => null);
  if (done) { try { await done.click(); } catch (_) {} }
  await sleep(600);
}

await scenario('boutique · a return for store credit, then the credit spent', async (t) => {
  const client = { name: 'TEST Cliente Avoir', phone: '0611223344' };
  const n0 = (await bqHead(bq)).tx;

  t.step('boutique: sale A, TEST Foulard, cash, to a named client');
  await bqCart(bq, ['TEST Foulard']);
  await bqAttachClient(t, bq, client, true);
  await clickSel(bq, '#bq-validate');
  await sleep(900);
  await clickSel(bq, '[data-bq-m="especes"]');
  await sleep(600);
  await clickSel(bq, '#bq-cash-ok');
  await sleep(1000);
  await bqFinishReceipt(bq);
  await bqWaitCount(bq, n0 + 1);
  bqRows.push({ kind: 'sale', method: 'cash', cents: BQ['TEST Foulard'] });
  await sleep(5000); // the sale reaches the server before a credit can be issued against it

  t.step('boutique: return TEST Foulard for a store credit');
  await clickSel(bq, '[data-bq-view="echanges"]');
  await sleep(900);
  const rq = await bq.waitForSelector('#bq-ret-q', { visible: true });
  await rq.type(client.phone);
  await sleep(900);
  await clickText(bq, '[data-bq-pick]', /TEST Foulard/);
  await sleep(500);
  await clickSel(bq, '[data-bq-motif="Taille"]');
  await sleep(400);
  await clickSel(bq, '[data-bq-do-avoir]');
  await managerCode(bq, BOUT);
  const issued = await until(bq, () => {
    const m = /AV-[A-Z0-9-]+/.exec(document.querySelector('[data-bq-panel="echanges"]')?.innerText || '');
    return { ok: !!m, code: m && m[0] };
  }, null, 20000);
  check(!!issued.ok, 'boutique till · the return issues a store credit', 'no AV- code on the Échanges page');
  const head1 = await bqHead(bq);
  const want1 = { ...ledger(bqRows), tx: n0 + 1 };
  compare('boutique till header after the return', { tx: head1.tx, net: head1.net }, want1);

  t.step('boutique: sale B, TEST Chemise lin, the credit then cash');
  /* The credit voucher stays on screen until the cashier closes it. */
  await clickSel(bq, '#bq-avoir-veil [data-bq-close]');
  await sleep(600);
  await clickSel(bq, '[data-bq-view="vente"]');
  await sleep(800);
  await bqCart(bq, ['TEST Chemise lin']);
  await bqAttachClient(t, bq, client, false);
  await clickSel(bq, '#bq-validate');
  await sleep(900);
  await clickSel(bq, '[data-bq-m="avoir"]');
  await sleep(700);
  if (issued.code) await clickSel(bq, `[data-bq-av-use="${issued.code}"]`);
  else await clickSel(bq, '[data-bq-av-use]');
  await sleep(1200);
  await clickSel(bq, '[data-bq-m="especes"]');
  await sleep(600);
  const due = await bq.$eval('#bq-cash-in', (e) => e.value).catch(() => '');
  eqCents(cents(due), BQ['TEST Chemise lin'] - BQ['TEST Foulard'], 'boutique till · cash due after the credit');
  await clickSel(bq, '#bq-cash-ok');
  await sleep(1000);
  await bqFinishReceipt(bq);
  await bqWaitCount(bq, n0 + 2);
  bqRows.push({ kind: 'sale', method: 'cash', cents: BQ['TEST Chemise lin'] - BQ['TEST Foulard'] });
  await sleep(6000);

  const want = { ...ledger(bqRows), tx: n0 + 2 };
  want.basket = Math.round(want.gross / want.tx);
  const head = await bqHead(bq);
  compare('boutique till header after the credit is spent', { tx: head.tx, net: head.net }, want);
  const clo = await bqCloture(bq);
  compare('boutique till clôture after a return for credit', { tx: clo.tx, net: clo.net, card: clo.card, cash: clo.cash }, want);
  const server = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(BOUT.slug);
  check(Number(server.c) === want.net, `server ledger · ${mad(want.net)} MAD kept after a return for credit`, `D1 sums ${mad(Number(server.c))} MAD over ${server.n} rows`);
  await zMatched(t, BOUT.slug, want.tx, want.net, 'boutique till · receipts reconciled after a return for credit');

  const dash = owners.boutique.page;
  await openDashboard(t, dash, BOUT);
  const home = await dashHome(dash, null);
  eqCents(home.net, want.net, 'boutique dashboard home · revenue after a return for credit');
  eqCents(home.hero, want.net, 'boutique dashboard home · revenue hero after a return for credit');
  eqCents(home.mix, want.net, 'boutique dashboard home · payment ring after a return for credit');
  const tx = await dashTransactions(dash);
  eqCents(tx.net, want.net, 'boutique dashboard transactions · net after a return for credit');
  const rep = await dashReport(dash, 0);
  compare('boutique dashboard day report after a return for credit', { net: rep.net, card: rep.card, cash: rep.cash }, want);
});

/* Santos Store opened its till on 17 October and never pressed « Clôture ».
 * The boutique shift lives in the till's storage until it is closed, and
 * every save in service filed the report under the day the shift OPENED,
 * filled with TODAY's sales: the report builder kept the ones of the opening
 * day, found none, and wrote 0 over the 17th, while the days that sold had no
 * report at all. Production, 20 October: 318 sales in 30 days, 2 reports. */
async function serverDays(slug) {
  const row = stack.db.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'dayreports'").get(slug);
  try { return (JSON.parse(row && row.data || '{}').days) || {}; } catch (_) { return {}; }
}
await scenario('boutique · a shift left open overnight files today under today', async (t) => {
  if (!bq) throw new Error('no boutique till from the previous scenarios');
  const day = await bq.evaluate(() => window.KiwiDayReport.businessDay(Date.now()));
  const yesterday = await bq.evaluate((d) => window.KiwiDayReport.shiftDay(d, -1), day);
  const before = await serverDays(BOUT.slug);
  const hadYesterday = Object.prototype.hasOwnProperty.call(before, yesterday);

  t.step('boutique: the shift was opened yesterday and never closed');
  await bq.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('kiwi:bqShift') || 'null') || { openedBy: '', float: 300 };
    s.openedAt = Date.now() - 30 * 3600000;
    localStorage.setItem('kiwi:bqShift', JSON.stringify(s));
  });
  await bq.reload({ waitUntil: 'load' });
  /* The shift is still open, so the till skips its opening float: only the
     staff code stands between the reload and the sale screen. */
  t.step('boutique: staff code after the reload');
  const gate = await until(bq, () => ({ ok: !!document.querySelector('[data-cpp="1"]')?.offsetWidth || !!document.querySelector('#bq-today')?.offsetWidth,
    keypad: !!document.querySelector('[data-cpp="1"]')?.offsetWidth }), null, 45000);
  if (gate.keypad) { await sleep(1500); await typeDigits(bq, '[data-cpp="%"]', BOUT._pin); }
  await bq.waitForSelector('#bq-today', { visible: true, timeout: 30000 });
  await until(bq, () => ({ ok: document.querySelectorAll('[data-bq-item]').length >= 3 }), null, 30000);
  await sleep(1500);

  await bqSale(t, bq, ['TEST Ceinture'], 'cash');
  bqRows.push({ kind: 'sale', method: 'cash', cents: BQ['TEST Ceinture'] });
  const head = await bqHead(bq);
  await bq.evaluate(() => { try { window.KiwiDayReport.flush(); } catch (_) {} });
  let days = {};
  for (let i = 0; i < 30; i++) {
    days = await serverDays(BOUT.slug);
    if (days[day] && Number(days[day].txns) === head.tx) break;
    await sleep(1000);
  }
  check(!!days[day] && Number(days[day].txns) === head.tx, `server · today's report (${day}) counts the ${head.tx} sales the till shows`,
    days[day] ? `it says ${days[day].txns}` : 'there is no report for today');
  eqCents(Math.round(Number(days[day] && days[day].net) * 100), head.net, `server · today's report net`);
  check(hadYesterday || !days[yesterday], `server · no empty report written for ${yesterday}, the day the shift opened`,
    days[yesterday] ? `${days[yesterday].txns} transaction(s), ${days[yesterday].net} MAD` : '');
});

/* The boutique till announced nothing to cash_session_events: Santos Store had
 * no opening and no close on record in two weeks of trading. Close the till
 * for real, counting the drawer, and read what the server kept: the opening,
 * the close with counted, expected and gap, and the closing Z comparison. */
await scenario('boutique · the close reaches the cash register ledger', async (t) => {
  if (!bq) throw new Error('no boutique till from the previous scenarios');
  t.step('boutique: open the close, count 100 MAD, close the till');
  await clickSel(bq, '#bq-close-day');
  await bq.waitForSelector('#bqclo-count', { visible: true, timeout: 15000 });
  await bq.type('#bqclo-count', '100');
  await sleep(400);
  await clickSel(bq, '#bqclo-close');
  await sleep(2500);
  let rows = [];
  for (let i = 0; i < 40; i++) {
    rows = stack.db.prepare('SELECT session_id, event_type, expected_cents, counted_cents, gap_cents FROM cash_session_events WHERE merchant = ? ORDER BY occurred_ts').all(BOUT.slug);
    if (rows.some((r) => r.event_type === 'close')) break;
    await bq.evaluate(() => { try { window.dispatchEvent(new Event('online')); } catch (_) {} });
    await sleep(1000);
  }
  const close = rows.filter((r) => r.event_type === 'close').pop();
  const open = close && rows.find((r) => r.event_type === 'open' && r.session_id === close.session_id);
  check(!!open, 'cash register ledger · the boutique shift\'s opening is on record', `events: ${rows.map((r) => r.event_type + ':' + r.session_id).join(', ') || 'none'}`);
  check(!!close && Number(close.counted_cents) === 10000, 'cash register ledger · the close carries the 100 MAD counted', close ? `counted ${close.counted_cents}` : 'no close event');
  check(!!close && Number(close.gap_cents) === Number(close.counted_cents) - Number(close.expected_cents),
    'cash register ledger · gap = counted − expected', close ? `expected ${close.expected_cents}, gap ${close.gap_cents}` : 'no close event');
  let z = null;
  for (let i = 0; i < 30; i++) {
    try { z = stack.db.prepare('SELECT status, result_json FROM z_reconciliations WHERE merchant = ? ORDER BY updated_ts DESC LIMIT 1').get(BOUT.slug); } catch (_) { z = null; }
    if (z && JSON.parse(z.result_json || '{}').closed === true && z.status === 'matched') break;
    await sleep(1000);
  }
  check(!!z && z.status === 'matched' && JSON.parse(z.result_json || '{}').closed === true,
    'boutique till · the closing Z comparison is on record, matched', z ? `status ${z.status}, closed ${JSON.parse(z.result_json || '{}').closed}` : 'no row');
});

/* A guest orders from the table's QR page (OrderPro), the till accepts the
 * order and cashes it. Pastilla 85 + Café noir 12,25: a dish with centimes,
 * because a 14,50 café was once charged 15 (Q1). The guest page, the till, the
 * server and the dashboard must all say 97,25. */
/* A guest scans the QR code of a table, orders a Pastilla and a black coffee,
 * and the till accepts the order from its inbox and cashes it in cash. Returns
 * the stored order row and the guest context (closed by the caller). */
async function qrOrderCashedAtTill(t, tableNo, want, opts = {}) {
  const tx0 = await txCount(tablet);
  t.step(`guest: table ${tableNo}, Pastilla + Café noir, send`);
  const guestCtx = await browser.createBrowserContext();
  const guest = await preparePage(t, await guestCtx.newPage(), { width: 390, height: 844 });
  await guest.goto(base + `/OrderPro.html?s=${encodeURIComponent(NIGHT.slug)}&t=${tableNo}`, { waitUntil: 'load' });
  await guest.waitForSelector('[data-add="n2"]', { visible: true, timeout: 20000 });
  await clickSel(guest, '[data-add="n2"]');
  await sleep(500);
  await clickSel(guest, '[data-add="n3"]');
  await sleep(500);
  const cartTotal = await guest.$eval('#cart-total', (e) => e.textContent).catch(() => '');
  eqCents(cents(cartTotal), want, 'guest page · the cart says 97,25');
  await clickSel(guest, '#cart-pill');
  await sleep(700);
  const grand = await guest.$eval('#cart-grand', (e) => e.textContent).catch(() => '');
  eqCents(cents(grand), want, 'guest page · the order total before sending');
  await clickSel(guest, '#send-btn');
  let order = null;
  for (let i = 0; i < 30 && !order; i++) {
    order = stack.db.prepare("SELECT * FROM orders WHERE merchant = ? AND mode = 'table' ORDER BY created_ts DESC LIMIT 1").get(NIGHT.slug);
    if (!order) await sleep(500);
  }
  check(!!order, 'server · the QR order is stored', 'no row in orders');
  if (order) {
    const cols = Object.keys(order);
    const stored = order.total_cents != null ? Number(order.total_cents) : Math.round(Number(order.total) * 100);
    eqCents(stored, want, `server · the stored order total (${cols.includes('total_cents') ? 'total_cents' : 'total'})`);
  }

  t.step('till: the inbox shows the order, accept it, cash it');
  await tablet.waitForSelector('#kop-chip', { visible: true, timeout: 30000 });
  await until(tablet, () => ({ ok: /\d/.test(document.getElementById('kop-chip')?.textContent || '') }), null, 30000);
  await clickSel(tablet, '#kop-chip');
  const card = await tablet.waitForSelector('.kop-card', { visible: true, timeout: 20000 }).catch(() => null);
  if (!card) {
    const body = await tablet.evaluate(() => {
      const c = document.getElementById('kop-chip'); const r = c && c.getBoundingClientRect();
      const top = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { chip: c?.textContent, rect: r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        top: top && (top.id || top.className || top.tagName), root: !!document.getElementById('kop-root'), body: document.getElementById('kop-body')?.innerText };
    });
    throw new Error('the till inbox shows no order card · ' + JSON.stringify(body).slice(0, 400));
  }
  const acc = await tablet.$('[data-kop-acc]');
  if (acc) { await clickSel(tablet, '[data-kop-acc]'); await sleep(1500); }
  if (opts.markReady && order) {
    t.step('till: mark the order ready, the guest phone must say so');
    await tablet.waitForSelector(`[data-kop-ready="${order.id}"]`, { visible: true, timeout: 20000 });
    await clickSel(tablet, `[data-kop-ready="${order.id}"]`);
    let st = '';
    for (let i = 0; i < 20 && st !== 'ready'; i++) {
      st = stack.db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id)?.status || '';
      if (st !== 'ready') await sleep(500);
    }
    check(st === 'ready', 'server · the order is ready', st);
    const told = await guest.waitForFunction(() => /Prête|prête/.test(document.body.innerText || ''), { timeout: 30000 }).then(() => true).catch(() => false);
    check(told, 'guest page · the phone shows the order is ready', (await guest.evaluate(() => document.body.innerText.slice(0, 160)).catch(() => '')).replace(/\s+/g, ' '));
  }
  await tablet.waitForSelector('[data-kop-pay]', { visible: true, timeout: 20000 });
  await clickSel(tablet, '[data-kop-pay]');
  await sleep(1500);
  await clickSel(tablet, '#pay-charge');
  await clickSel(tablet, '[data-set="exact"]');
  await clickSel(tablet, '#cash-confirm');
  await tablet.waitForFunction((n) => {
    const m = /(\d+)/.exec((document.getElementById('stat-txns-card') || {}).innerText || '');
    return m && +m[1] >= n;
  }, { timeout: 15000 }, tx0 + 1);
  await sleep(5000);

  return { order, guestCtx };
}

await scenario('restaurant · a QR order from the table, accepted and cashed at the till', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenarios');
  stack.db.prepare("UPDATE merchant_config SET features = json_set(COALESCE(features, '{}'), '$.orderpro', json('true')) WHERE merchant = ?").run(NIGHT.slug);
  const on = stack.db.prepare('SELECT features FROM merchant_config WHERE merchant = ?').get(NIGHT.slug);
  if (!on || !/"orderpro":true/.test(on.features || '')) throw new Error('OrderPro could not be switched on for ' + NIGHT.slug);
  const want = PRICE.n2 + PRICE.n3;
  const sales0 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);

  /* The owner has drawn one table, number 4, and printed its QR code. */
  const plan = { zones: [{ id: 'z1', name: 'Salle' }], tables: [{ id: 'tb4', num: '4', zone: 'z1', shape: 'round', covers: 2, x: 20, y: 20, w: 10, h: 10 }], staff: [] };
  stack.db.prepare("INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, 'floorplan', ?, 1, ?)").run(NIGHT.slug, JSON.stringify(plan), Date.now());

  t.step('till: reload so the order inbox and the floor plan load');
  await tablet.reload({ waitUntil: 'load' });
  await unlockTill(t, tablet, NIGHT);      // a reload locks the till behind the staff code
  await restoGreetGone(tablet);
  const tableNo = '4';
  await tablet.waitForFunction(() => !!document.querySelector('[data-table="4"]'), { timeout: 15000 })
    .catch(() => { throw new Error('the till never drew table 4 from the server floor plan'); });

  const { order, guestCtx } = await qrOrderCashedAtTill(t, tableNo, want, { markReady: true });

  const sales1 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  check(Number(sales1.n) === Number(sales0.n) + 1, 'server · the QR order became exactly one sale', `${sales0.n} → ${sales1.n}`);
  eqCents(Number(sales1.c) - Number(sales0.c), want, 'server · the sale is 97,25');
  const paid = stack.db.prepare('SELECT status, paid_ts FROM orders WHERE id = ?').get(order && order.id);
  check(!!(paid && paid.paid_ts), 'server · the order is marked paid', JSON.stringify(paid));

  const afterTurn = { kind: 'sale', method: 'card', cents: PRICE.n3 };
  const qr = { kind: 'sale', method: 'cash', cents: want };
  const till = await restoReport(tablet);
  compare('till report after the QR order', till, ledger([afterTurn, qr]));
  const dash = owners.nuit.page;
  await openDashboard(t, dash, NIGHT);
  const home = await dashHome(dash, 2);
  compare('dashboard home after the QR order', { tx: home.tx, net: home.net }, ledger([afterTurn, qr]));
  const rep = await dashReport(dash, 0);
  compare('dashboard day report after the QR order', { tx: rep.tx, net: rep.net, card: rep.card, cash: rep.cash }, ledger([afterTurn, qr]));
  await guestCtx.close();
});

/* The QR code on table 9 still says 9, but the owner's plan only has table 4:
 * a table renumbered after the codes were printed, or a restaurant that never
 * drew its plan. The server takes the order (by design), the kitchen gets it,
 * and the till has to be able to take the money. It used to answer « Table
 * introuvable sur le plan » and the only way out was to cancel a meal already
 * eaten. */
await scenario('restaurant · a QR order from a table the floor plan does not have is still cashed', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenarios');
  const want = PRICE.n2 + PRICE.n3;
  const sales0 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  const onPlan = await tablet.evaluate(() => !!document.querySelector('[data-table="9"]'));
  check(!onPlan, 'till · table 9 is not on the floor plan', 'the plan drew a table 9');

  const { order, guestCtx } = await qrOrderCashedAtTill(t, '9', want);

  const sales1 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  check(Number(sales1.n) === Number(sales0.n) + 1, 'server · the off-plan order became exactly one sale', `${sales0.n} → ${sales1.n}`);
  eqCents(Number(sales1.c) - Number(sales0.c), want, 'server · the off-plan sale is 97,25');
  const paid = stack.db.prepare('SELECT status, paid_ts, session_id FROM orders WHERE id = ?').get(order && order.id);
  check(!!(paid && paid.paid_ts), 'server · the off-plan order is marked paid', JSON.stringify(paid));
  if (paid && paid.session_id) {
    let visit = null;
    for (let i = 0; i < 20; i++) {
      visit = stack.db.prepare('SELECT status FROM table_sessions WHERE id = ?').get(paid.session_id);
      if (visit && visit.status !== 'open') break;
      await sleep(500);
    }
    check(!!visit && visit.status !== 'open', 'server · the table 9 visit is closed once paid', JSON.stringify(visit));
  }

  const afterTurn = { kind: 'sale', method: 'card', cents: PRICE.n3 };
  const qr = { kind: 'sale', method: 'cash', cents: want };
  const till = await restoReport(tablet);
  compare('till report after the off-plan order', till, ledger([afterTurn, qr, qr]));
  const dash = owners.nuit.page;
  await openDashboard(t, dash, NIGHT);
  const home = await dashHome(dash, 3);
  compare('dashboard home after the off-plan order', { tx: home.tx, net: home.net }, ledger([afterTurn, qr, qr]));
  const rep = await dashReport(dash, 0);
  compare('dashboard day report after the off-plan order', { tx: rep.tx, net: rep.net, card: rep.card, cash: rep.cash }, ledger([afterTurn, qr, qr]));
  await guestCtx.close();
});

/* One guest, one visit, two orders, at a table the plan does not have. Cashing
 * the first at the counter must not close the visit: closing it as « settle »
 * stamps every order of the session paid, and the second plate would leave
 * free. The visit closes with the last payment. */
await scenario('restaurant · two QR orders on one off-plan visit, cashed one at a time', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenarios');
  const sales0 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  const t0 = Date.now() - 1000;

  t.step('guest: table 11, a black coffee, send, then add a Pastilla and send again');
  const guestCtx = await browser.createBrowserContext();
  const guest = await preparePage(t, await guestCtx.newPage(), { width: 390, height: 844 });
  await guest.goto(base + `/OrderPro.html?s=${encodeURIComponent(NIGHT.slug)}&t=11`, { waitUntil: 'load' });
  async function send(dish) {
    await guest.waitForSelector(`[data-add="${dish}"]`, { visible: true, timeout: 20000 });
    await clickSel(guest, `[data-add="${dish}"]`);
    await sleep(500);
    await clickSel(guest, '#cart-pill');
    await sleep(700);
    await clickSel(guest, '#send-btn');
    await guest.waitForSelector('#restart-btn', { visible: true, timeout: 20000 });
  }
  await send('n3');
  await clickSel(guest, '#restart-btn');
  await sleep(700);
  await send('n2');
  let rows = [];
  for (let i = 0; i < 30 && rows.length < 2; i++) {
    rows = stack.db.prepare("SELECT id, session_id, paid_ts FROM orders WHERE merchant = ? AND mode = 'table' AND table_no = '11' AND created_ts >= ? ORDER BY created_ts, number").all(NIGHT.slug, t0);
    if (rows.length < 2) await sleep(500);
  }
  check(rows.length === 2, 'server · two orders stored for table 11', String(rows.length));
  if (rows.length !== 2) return;
  check(!!rows[0].session_id && rows[0].session_id === rows[1].session_id, 'server · both orders belong to one visit', JSON.stringify(rows));
  const visit = rows[0].session_id;

  async function cash(id) {
    await tablet.waitForSelector('#kop-chip', { visible: true, timeout: 30000 });
    const shown = await tablet.$eval(`[data-kop-pay="${id}"]`, (e) => !!(e.offsetParent && e.getBoundingClientRect().width)).catch(() => false);
    if (!shown) await clickSel(tablet, '#kop-chip');
    await tablet.waitForSelector(`[data-kop-pay="${id}"]`, { visible: true, timeout: 20000 }).catch(async () => {
      const seen = await tablet.evaluate((oid) => {
        const o = (window.KiwiOrderInbox && KiwiOrderInbox.orders && KiwiOrderInbox.orders()) || {};
        const mine = o[oid];
        return { chip: document.getElementById('kop-chip')?.textContent, open: !!document.querySelector('#kop-root.is-open, #kop-root[open]'),
          body: (document.getElementById('kop-body')?.innerText || '').slice(0, 300),
          order: mine ? { status: mine.status, paid: mine.paid, session: mine.session } : null };
      }, id);
      throw new Error(`the till inbox offers no Encaisser for ${id} · ${JSON.stringify(seen)}`);
    });
    if (await tablet.$(`[data-kop-acc="${id}"]`)) { await clickSel(tablet, `[data-kop-acc="${id}"]`); await sleep(1500); }
    const tx = await txCount(tablet);
    await tablet.waitForSelector(`[data-kop-pay="${id}"]`, { visible: true, timeout: 20000 });
    await clickSel(tablet, `[data-kop-pay="${id}"]`);
    await sleep(1500);
    await clickSel(tablet, '#pay-charge');
    await clickSel(tablet, '[data-set="exact"]');
    await clickSel(tablet, '#cash-confirm');
    await tablet.waitForFunction((n) => {
      const m = /(\d+)/.exec((document.getElementById('stat-txns-card') || {}).innerText || '');
      return m && +m[1] >= n;
    }, { timeout: 15000 }, tx + 1);
    await sleep(5000);
  }
  const paidOf = (id) => stack.db.prepare('SELECT paid_ts FROM orders WHERE id = ?').get(id)?.paid_ts || null;
  const visitStatus = () => stack.db.prepare('SELECT status FROM table_sessions WHERE id = ?').get(visit)?.status || '';

  t.step('till: cash the first order only');
  await cash(rows[0].id);
  check(!!paidOf(rows[0].id), 'server · the first order is paid', '');
  check(!paidOf(rows[1].id), 'server · the second order is NOT stamped paid by the first payment', String(paidOf(rows[1].id)));
  check(visitStatus() === 'open', 'server · the visit stays open while something is owed', visitStatus());

  t.step('till: cash the second order');
  await cash(rows[1].id);
  check(!!paidOf(rows[1].id), 'server · the second order is paid', '');
  let st = '';
  for (let i = 0; i < 20 && (st = visitStatus()) === 'open'; i++) await sleep(500);
  check(st && st !== 'open', 'server · the visit closes with the last payment', st);

  const sales1 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  check(Number(sales1.n) === Number(sales0.n) + 2, 'server · two sales for two orders', `${sales0.n} → ${sales1.n}`);
  eqCents(Number(sales1.c) - Number(sales0.c), PRICE.n2 + PRICE.n3, 'server · the two sales add up to 97,25');
  await guestCtx.close();
});

/* #141: « the invoice in the cashier app never renders ». The till journal has
 * an A4 invoice icon on every sale. Tap it on the off-plan QR sale, skip the
 * customer form, and the invoice must be numbered by the server, open as a
 * document carrying the sale's total, and come back with the SAME number when
 * tapped again: an invoice number is a legal sequence, not a counter of taps. */
await scenario('restaurant · an A4 invoice from the till journal', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenarios');
  const want = PRICE.n2 + PRICE.n3;
  const count = () => Number(stack.db.prepare('SELECT COUNT(*) AS n FROM sale_invoices WHERE merchant = ?').get(NIGHT.slug).n);
  const n0 = count();

  t.step('till: open the journal and tap the invoice icon of the 97,25 sale');
  await clickSel(tablet, '#stat-txns-card');
  await tablet.waitForSelector('[data-jr-invoice]', { visible: true, timeout: 15000 });
  const saleId = await tablet.evaluate(() => {
    const row = [...document.querySelectorAll('.jr-entry')].find((r) => /97[,.]25/.test(r.querySelector('.jr-entry-amount')?.textContent || ''));
    return row ? row.getAttribute('data-jr-id') : '';
  });
  if (!saleId) throw new Error('the journal shows no 97,25 sale');

  async function tapInvoice() {
    const popup = new Promise((resolve) => tablet.once('popup', resolve));
    await clickSel(tablet, `[data-jr-invoice="${saleId}"]`);
    const skip = await tablet.waitForSelector('[data-inv-cust-skip]', { visible: true, timeout: 4000 }).catch(() => null);
    if (skip) await clickSel(tablet, '[data-inv-cust-skip]');
    const win = await Promise.race([popup, sleep(8000).then(() => null)]);
    let html = '';
    for (let i = 0; i < 20 && !/F-\d{4}-/.test(html); i++) {
      if (win) html = await win.content().catch(() => '');
      if (!/F-\d{4}-/.test(html)) {
        html = await tablet.evaluate(() => document.querySelector('.kiwi-invoice-preview iframe')?.srcdoc || '').catch(() => '') || html;
      }
      if (!/F-\d{4}-/.test(html)) await sleep(500);
    }
    if (win) await win.close().catch(() => {});
    await tablet.evaluate(() => document.querySelector('.kiwi-invoice-preview button:last-of-type')?.click()).catch(() => {});
    return html;
  }

  const first = await tapInvoice();
  const num1 = (/F-\d{4}-\d+/.exec(first) || [])[0] || '';
  check(!!num1, 'till invoice · the document opens with a server number', first ? first.replace(/\s+/g, ' ').slice(0, 200) : 'nothing opened');
  check(/97[,.]25/.test(first), 'till invoice · the document carries the 97,25 total', num1);
  check(count() === n0 + 1, 'server · one invoice row for the sale', `${n0} → ${count()}`);

  t.step('till: tap the same invoice again');
  const again = await tapInvoice();
  const num2 = (/F-\d{4}-\d+/.exec(again) || [])[0] || '';
  check(num2 === num1, 'till invoice · a second tap reopens the same number', `${num1} then ${num2}`);
  check(count() === n0 + 1, 'server · still one invoice row after the second tap', `${n0} → ${count()}`);
  await tablet.keyboard.press('Escape').catch(() => {});
});

/* The other half of QR ordering: no table. The guest orders « à emporter »,
 * gets a number, pays at the counter; the kitchen gets it only once paid, the
 * phone rings when it is ready, the counter hands it over. Every screen must
 * then count it once. */
await scenario('restaurant · a QR takeaway order, paid at the counter, ready, handed over', async (t) => {
  if (!tablet) throw new Error('no tablet from the previous scenarios');
  const want = PRICE.n2 + PRICE.n3;
  const sales0 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  const t0 = Date.now() - 1000;

  t.step('guest: takeaway, Pastilla + Café noir, send');
  const guestCtx = await browser.createBrowserContext();
  const guest = await preparePage(t, await guestCtx.newPage(), { width: 390, height: 844 });
  await guest.goto(base + `/OrderPro.html?s=${encodeURIComponent(NIGHT.slug)}&mode=emporter`, { waitUntil: 'load' });
  await guest.waitForSelector('[data-add="n2"]', { visible: true, timeout: 20000 });
  await clickSel(guest, '[data-add="n2"]');
  await sleep(500);
  await clickSel(guest, '[data-add="n3"]');
  await sleep(500);
  await clickSel(guest, '#cart-pill');
  await sleep(700);
  await clickSel(guest, '#send-btn');
  await guest.waitForSelector('#cashier-number-digits', { visible: true, timeout: 20000 });
  const shownNo = (await guest.$eval('#cashier-number-digits', (e) => e.textContent).catch(() => '')).trim();
  let order = null;
  for (let i = 0; i < 30 && !order; i++) {
    order = stack.db.prepare("SELECT * FROM orders WHERE merchant = ? AND mode = 'takeout' AND created_ts >= ? ORDER BY created_ts DESC LIMIT 1").get(NIGHT.slug, t0);
    if (!order) await sleep(500);
  }
  check(!!order, 'server · the takeaway order is stored', 'no row');
  if (!order) return;
  check(shownNo === 'OPD-' + order.number, 'guest page · the number to announce at the counter', `${shownNo} for ${order.number}`);
  check(order.status === 'pending', 'server · nothing goes to the kitchen before payment', order.status);

  const statusOf = () => stack.db.prepare('SELECT status, paid_ts FROM orders WHERE id = ?').get(order.id) || {};
  async function inboxTap(attr) {
    const sel = `[${attr}="${order.id}"]`;
    const shown = await tablet.$eval(sel, (e) => !!(e.offsetParent && e.getBoundingClientRect().width)).catch(() => false);
    if (!shown) await clickSel(tablet, '#kop-chip');
    await tablet.waitForSelector(sel, { visible: true, timeout: 20000 });
    await clickSel(tablet, sel);
  }

  t.step('till: cash the order from the inbox');
  const tx = await txCount(tablet);
  await inboxTap('data-kop-pay');
  await sleep(1500);
  await clickSel(tablet, '#pay-charge');
  await clickSel(tablet, '[data-set="exact"]');
  await clickSel(tablet, '#cash-confirm');
  await tablet.waitForFunction((n) => {
    const m = /(\d+)/.exec((document.getElementById('stat-txns-card') || {}).innerText || '');
    return m && +m[1] >= n;
  }, { timeout: 15000 }, tx + 1);
  let st = {};
  for (let i = 0; i < 20 && !(st = statusOf()).paid_ts; i++) await sleep(500);
  check(!!st.paid_ts, 'server · the takeaway order is paid', JSON.stringify(st));
  check(st.status === 'accepted', 'server · paid, it goes to the kitchen', st.status);
  await clickSel(tablet, '.modal-veil.is-open [data-close], #pay-success-close').catch(() => {});
  await tablet.keyboard.press('Escape').catch(() => {});
  await sleep(800);

  t.step('till: mark it ready, the phone must ring');
  await inboxTap('data-kop-ready');
  for (let i = 0; i < 20 && (st = statusOf()).status !== 'ready'; i++) await sleep(500);
  check(st.status === 'ready', 'server · the takeaway order is ready', st.status);
  const ready = await guest.waitForSelector('#ready-number', { visible: true, timeout: 30000 }).then(() => true).catch(() => false);
  check(ready, 'guest page · the ready screen shows', (await guest.evaluate(() => document.body.innerText.slice(0, 160)).catch(() => '')).replace(/\s+/g, ' '));

  t.step('till: hand it over');
  await inboxTap('data-kop-served');
  for (let i = 0; i < 20 && !['served', 'archived'].includes((st = statusOf()).status); i++) await sleep(500);
  check(['served', 'archived'].includes(st.status), 'server · handed over', st.status);
  const warned = await tablet.evaluate(() => [...document.querySelectorAll('#toast-stack .toast')].map((e) => e.textContent).filter((x) => /non confirmée|refusée/.test(x)));
  check(!warned.length, 'till · the handover is not reported as failed', warned.join(' | '));
  const open = await tablet.$eval('#kop-close', (e) => !!e.offsetParent).catch(() => false);
  if (open) { await clickSel(tablet, '#kop-close'); await sleep(500); }
  await sleep(4000);

  const sales1 = stack.db.prepare('SELECT COUNT(*) AS n, SUM(COALESCE(amount_cents, amount * 100)) AS c FROM sales WHERE merchant = ? AND void_ts IS NULL').get(NIGHT.slug);
  check(Number(sales1.n) === Number(sales0.n) + 1, 'server · the takeaway order became exactly one sale', `${sales0.n} → ${sales1.n}`);
  eqCents(Number(sales1.c) - Number(sales0.c), want, 'server · the takeaway sale is 97,25');

  const rows = [
    { kind: 'sale', method: 'card', cents: PRICE.n3 },
    { kind: 'sale', method: 'cash', cents: want }, { kind: 'sale', method: 'cash', cents: want },
    { kind: 'sale', method: 'cash', cents: PRICE.n3 }, { kind: 'sale', method: 'cash', cents: PRICE.n2 },
    { kind: 'sale', method: 'cash', cents: want },
  ];
  const till = await restoReport(tablet);
  compare('till report after the takeaway order', till, ledger(rows));
  const dash = owners.nuit.page;
  await openDashboard(t, dash, NIGHT);
  const home = await dashHome(dash, rows.length);
  compare('dashboard home after the takeaway order', { tx: home.tx, net: home.net }, ledger(rows));
  const rep = await dashReport(dash, 0);
  compare('dashboard day report after the takeaway order', { tx: rep.tx, net: rep.net, card: rep.card, cash: rep.cash }, ledger(rows));
  await guestCtx.close();
});

await S.finish();
