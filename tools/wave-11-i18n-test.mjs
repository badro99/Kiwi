#!/usr/bin/env node
/* Vague 11 · groupe E : la langue et les mots que lit le commerçant.
 *   node tools/wave-11-i18n-test.mjs [sync|briefing|onboarding]
 * Chaque cas exécute le vrai code (vm ou route), jamais une regex seule. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import coreTestSource from './core-test-source.cjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const job = process.argv[2];
let count = 0;
const ok = (label) => { count++; console.log('✓ ' + label); };

/* ── sync#1 · le toast d'une vente Live Link ──────────────────────────────── */
function liveToast(lang, sale) {
  const memory = new Map([['kiwiLang', lang]]);
  const localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
  const document = { readyState: 'loading', documentElement: { lang }, addEventListener() {}, querySelectorAll: () => [], dispatchEvent() {} };
  const window = { document, localStorage, addEventListener() {}, dispatchEvent() {} };
  const ctx = { window, document, localStorage, Intl, console, CustomEvent: function () {} };
  vm.runInNewContext(read('assets/i18n.js'), ctx);
  const toasts = [];
  window.Kiwi = { toast: (title, opts) => toasts.push({ title, desc: opts && opts.desc }) };
  const parts = ['assets/live-link/parts/signals.js', 'assets/live-link/parts/feed.js'].map(read).join('\n');
  const notify = vm.runInNewContext('(function () {\n' + parts + '\nreturn notifySale;\n})()', { window, document, localStorage, console });
  notify(sale);
  return toasts[0];
}
if (!job || job === 'sync') {
  const sale = { amount: 12.5, amountCents: 1250, method: 'card', label: '' };
  const fr = liveToast('fr', sale), en = liveToast('en', sale), ar = liveToast('ar', sale);
  assert.equal(fr.title, 'Vente encaissée · 12,50 MAD');
  assert.equal(en.title, 'Sale received · 12.50 MAD');
  assert.equal(ar.title, 'تم تحصيل بيع · 12,50 MAD');
  assert.equal(en.desc, 'Card · live');
  assert.equal(ar.desc, 'بطاقة · مباشر');
  assert.equal(fr.desc, 'Carte · en direct');
  const refund = liveToast('en', { amount: -1250.4, amountCents: -125040, method: 'cash', label: 'Table 4' });
  assert.equal(refund.title, 'Refund recorded · −1,250.40 MAD');
  assert.equal(refund.desc, 'Cash · Table 4');
  assert.equal(liveToast('fr', { amount: 1250, method: 'cash' }).title.replace(/\s/g, ' '), 'Vente encaissée · 1 250 MAD', 'a whole amount stays whole');
  ok('sync#1 sale and refund toasts speak the owner language with the exact amount');
}

/* ── briefing#0, #1, #2 ────────────────────────────────────────────────────── */
function briefing(lang = 'en') {
  const card = { parentNode: {}, innerHTML: '', closest: () => null, querySelector: () => null };
  const listeners = {}, message = { textContent: '' };
  const document = { readyState: 'loading', documentElement: { lang }, addEventListener: (k, f) => (listeners[k] ||= []).push(f),
    querySelector: (sel) => sel === '[data-briefing-card]' ? card : null, getElementById: () => message, createElement: () => ({ setAttribute() {} }) };
  const memory = new Map(), localStorage = { getItem: (k) => memory.get(k) || null, setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) };
  const window = { KiwiEnv: { isReal: () => true }, KiwiAgentTier: () => 'owner', KiwiCloudDoc: { currentSlug: () => 'fixture' }, addEventListener() {} };
  vm.runInNewContext(read('assets/briefing.js'), { window, document, localStorage, console, Date, Intl, setTimeout, clearTimeout });
  return { B: window.KiwiBriefing, T: window.KiwiBriefing._test, listeners, message, card, document };
}
if (!job || job === 'briefing') {
  { // briefing#0 · the card names the threshold the merchant set
    const { B, T } = briefing();
    assert.equal(B.setSettings({ share: 7.5, multiple: 3 }), true);
    const c = T.cancellationRateRule({ current: { total: 100, cancellations: 30, reasons: {}, actors: {} }, baselineRates: [2, 2, 2] });
    assert.ok(c.copy.fr.includes('au moins 7,5 % et 3× la référence'), c.copy.fr);
    assert.ok(c.copy.en.includes('at least 7.5% and 3× baseline'), c.copy.en);
    assert.ok(c.copy.ar.includes('7,5٪') && c.copy.ar.includes('3×'), c.copy.ar);
    const d = T.discountShareRule({ current: { gross: 10000, discount: 3000, discountedCount: 3, actors: {} }, baselineShares: [2, 2, 2] });
    assert.ok(d.copy.fr.includes('au moins 7,5 % et 3× la référence') && d.copy.en.includes('at least 7.5% and 3× baseline'), d.copy.en);
    for (const l of [c, d]) assert.doesNotMatch(l.copy.fr + l.copy.en + l.copy.ar, /au moins 5 %|at least 5%|2× la référence|2× baseline|ضعف المرجع/);
    assert.equal(B.setSettings({ lateMultiple: 2, lateMinutes: 10 }), true);
    const day = '2026-10-26', base = Date.UTC(2026, 9, 26, 10), orders = [
      ...Array.from({ length: 3 }, (_, i) => ({ merchant: 'fixture', sent_ts: base + i, ready_ts: base + i + 40 * 60000 })),
      ...Array.from({ length: 5 }, (_, i) => ({ merchant: 'fixture', sent_ts: base - 86400000 + i, ready_ts: base - 86400000 + i + 10 * 60000 }))];
    const late = T.lateOrdersRule({ ready: true, day, orders, endAt: base + 3600000, businessDay: (ts) => new Date(ts).toISOString().slice(0, 10) });
    assert.ok(late[0].copy.fr.includes('alerte à 2× et +10 min') && late[0].copy.en.includes('alert at 2x and +10 min'), late[0].copy.en);
    ok('briefing#0 cancellation, discount and timing cards name the threshold in force');
  }
  { // briefing#1 · bounds that mean something, and edits that order themselves
    const { B, T } = briefing();
    assert.equal(B.setSettings({ samples: 5 }), false, 'only four comparable weeks exist: five would silence three rules');
    assert.equal(B.setSettings({ samples: 4 }), true);
    const c = T.cancellationRateRule({ current: { total: 100, cancellations: 30, reasons: {}, actors: {} }, baselineRates: [2, 2, 2, 2] });
    assert.ok(c, 'the highest accepted sample count still lets the rule speak');
    // A device whose clock runs ahead wrote last week; a later edit must still win.
    const ahead = Date.now() + 30 * 86400000;
    T.write({ days: [], settings: { share: 9 }, settingsAt: ahead, settingsFieldsAt: { share: ahead } });
    assert.equal(B.setSettings({ share: 6 }), true);
    const mine = T.read();
    assert.ok(mine.settingsFieldsAt.share > ahead, 'the new edit is stamped after the one it replaces');
    assert.equal(T.mergeDocs(mine, { days: [], settings: { share: 9 }, settingsAt: ahead, settingsFieldsAt: { share: ahead } }).settings.share, 6);
    ok('briefing#1 sample bound matches the four comparable weeks; later edits win over a fast clock');
  }
  { // briefing#2 · the evidence footer speaks plainly in each language
    for (const lang of ['fr', 'en', 'ar']) {
      const { B, T, card } = briefing(lang);
      const rows = [
        T.cancellationRateRule({ day: '2026-10-26', current: { total: 100, cancellations: 30, reasons: {}, actors: {} }, baselineRates: [2, 2, 2] }),
        T.discountShareRule({ day: '2026-10-26', current: { gross: 10000, discount: 3000, discountedCount: 3, actors: {} }, baselineShares: [2, 2, 2] }),
        T.cashGapRule({ ready: true, merchant: 'fixture', day: '2026-10-26', businessDay: () => '2026-10-26', events: [{ merchant: 'fixture', event_type: 'close', opened_ts: 1, gap_cents: -12550 }] }),
        T.lowStockRule({ items: [{ id: 'x', name: 'X', tracked: true, balance: 1, threshold: 5 }] }),
      ];
      T.compute(rows.map((r) => () => r));
      T.render();
      const text = card.innerHTML.replace(/<[^>]+>/g, ' ');
      assert.doesNotMatch(text, /sale_void_history|discount_amount_cents|gross_amount_cents|cash_session_events|KiwiSales|KiwiInventory|centimes|سنتيم/, lang + ': ' + text);
      if (lang !== 'fr') assert.doesNotMatch(text, /mêmes jours|Seuils|seuil|Écart/, lang + ': ' + text);
      if (lang === 'fr') assert.ok(text.includes('Écart de caisse (MAD) 100') && text.includes('-125,50 MAD'), text);
      if (lang === 'en') assert.ok(text.includes('Cash gap (MAD) 100') && text.includes('previous 4 weeks'), text);
      if (lang === 'ar') assert.ok(text.includes('العتبات') && text.includes('الأسابيع الأربعة'), text);
      const reply = B.reply('morning briefing', { lang });
      assert.doesNotMatch(reply.stats.map((s) => s.h).join(' '), /sale_void_history|cash_session_events|KiwiInventory/);
    }
    // The cash limit is set in dirhams on screen and stored in centimes.
    const { B, T, listeners, card } = briefing('fr');
    T.render();
    assert.match(card.innerHTML, /data-briefing-limit="cashCents"[^>]*step="0\.01"[^>]*value="100"/);
    const attrs = {};
    const input = { value: '250,5'.replace(',', '.'), getAttribute: (k) => k === 'data-briefing-limit' ? 'cashCents' : null, setAttribute: (k, v) => { attrs[k] = v; } };
    listeners.change.forEach((f) => f({ target: input }));
    assert.equal(attrs['aria-invalid'], 'false');
    assert.equal(B.settings().cashCents, 25050);
    input.value = '1.234'; listeners.change.forEach((f) => f({ target: input }));
    assert.equal(attrs['aria-invalid'], 'true', 'a fraction of a centime is refused');
    ok('briefing#2 footers use plain words in FR, EN and AR; the cash limit reads in MAD');
  }
  { // briefing#1 · the server keeps only bounded settings
    const { onRequestPost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/store.js')).href);
    const { makeSession, sessionCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
    const AUTH_SECRET = 'wave-11-briefing-secret-0123456789', SHOP = 'w11-briefing-shop', now = Date.now();
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT, business TEXT, salt TEXT, hash TEXT, created_ts INTEGER, status TEXT, session_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merchant_config (merchant TEXT PRIMARY KEY, features TEXT, plan TEXT, type TEXT, account_id TEXT, name TEXT, status TEXT, updated_ts INTEGER, till_epoch INTEGER NOT NULL DEFAULT 0);
CREATE TABLE store_docs (merchant TEXT, feature TEXT, data TEXT, rev INTEGER, updated_ts INTEGER, PRIMARY KEY (merchant, feature));
CREATE TABLE staff_pins (id TEXT PRIMARY KEY, merchant TEXT, pin TEXT, name TEXT, role TEXT, created_ts INTEGER);`);
    db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-1','o@example.test','B','s','h',?,'active')`).run(now);
    db.prepare(`INSERT INTO merchant_config (merchant,features,plan,type,account_id,name,status,updated_ts) VALUES (?, '{}','pro','restaurant','acc-1','B','active',?)`).run(SHOP, now);
    const DB = { prepare(q) { const st = db.prepare(q); return { bind(...p) { return { async first() { return st.get(...p); }, async all() { return { results: st.all(...p) }; }, async run() { const r = st.run(...p); return { meta: { changes: r.changes }, success: true }; } }; } }; }, async batch(s) { return Promise.all(s); } };
    const owner = sessionCookie(await makeSession('acc-1', AUTH_SECRET));
    const data = { days: [], settings: { samples: 12, share: 7, cashCents: 0.5, salesDrop: 20, bogus: 3 }, settingsAt: now, settingsFieldsAt: { samples: now, share: now, cashCents: now, salesDrop: now, bogus: now } };
    const res = await onRequestPost({ request: new Request('https://k/api/store', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner }, body: JSON.stringify({ feature: 'briefing', merchant: SHOP, data }) }), env: { AUTH_SECRET, DB } });
    assert.equal(res.status, 200, await res.clone().text());
    const stored = JSON.parse(db.prepare(`SELECT data FROM store_docs WHERE merchant=? AND feature='briefing'`).get(SHOP).data);
    assert.deepEqual(stored.settings, { share: 7, salesDrop: 20 });
    assert.deepEqual(Object.keys(stored.settingsFieldsAt).sort(), ['salesDrop', 'share']);
    // The browser and the server hold the same bounds.
    const { BRIEFING_LIMITS } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_briefing-settings.js')).href);
    const block = read('assets/briefing.js').match(/briefing-limits:begin[^\n]*\n([\s\S]*?)\n  \/\* briefing-limits:end/)[1];
    const { limits, integer } = vm.runInNewContext('(function () {\n' + block + '\nreturn { limits: LIMITS, integer: INTEGER };\n})()');
    assert.deepEqual(Object.keys(BRIEFING_LIMITS).sort(), Object.keys(limits).sort());
    for (const [k, spec] of Object.entries(limits)) assert.deepEqual([BRIEFING_LIMITS[k].min, BRIEFING_LIMITS[k].max, BRIEFING_LIMITS[k].integer], [spec[1], spec[2], integer[k] === true], k);
    ok('briefing#1 the server drops settings outside the bounds the browser enforces');
  }
}

/* ── onboarding#1 · the Plus plan and the plan-limit refusal ──────────────── */
if (!job || job === 'onboarding') {
  const cache = new Map();
  const storage = { getItem: (k) => cache.get(k) ?? null, setItem: (k, v) => cache.set(k, String(v)), removeItem: (k) => cache.delete(k) };
  const node = () => ({ classList: { add() {}, remove() {}, contains: () => false }, style: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
  const document = { readyState: 'complete', body: node(), documentElement: node(), addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], createElement: node };
  const window = { document, localStorage: storage, location: { pathname: '/offline', search: '', hostname: 'localhost' }, addEventListener() {}, dispatchEvent() {} };
  window.window = window;
  vm.runInNewContext(coreTestSource.readFileSync(path.join(ROOT, 'assets/venues.js'), 'utf8'), { window, document, localStorage: storage, location: window.location, console, Date, Math, JSON, Map, Set, Promise, Array, Object, String, Number, RegExp, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {} });
  window.KiwiMe = { business: 'First' };
  let asked = 0;
  window.KiwiConfig = { newStore() { asked++; return Promise.resolve(true); } };
  assert.ok(await window.KiwiVenue.createVenue({ name: 'First', type: 'boutique' }), 'the first store is created');
  asked = 0; Object.assign(window.KiwiConfig, { plan: 'plus', planExplicit: true });
  let thrown = null;
  try { await window.KiwiVenue.createVenue({ name: 'Second', type: 'boutique', throwOnError: true }); } catch (e) { thrown = e; }
  assert.equal(asked, 0, 'a Plus account is refused on the device, like Basic and Pro');
  assert.equal(thrown && thrown.code, 'plan-limit-exceeded');

  const source = read('assets/onboarding.js');
  const body = source.slice(source.indexOf('      const reason ='), source.indexOf('      if (kit) return { error: failed }'));
  for (const [lang, expected] of [['fr', 'Votre forfait couvre un seul établissement'], ['en', 'Your plan covers one business'], ['ar', 'باقتك تشمل مؤسسة واحدة']]) {
    const text = vm.runInNewContext(body + '\nfailed', { submitError: thrown, tr: (o) => o[lang] });
    assert.ok(text.includes(expected) && !/Reconnectez|Sign in again|سجّل الدخول/.test(text), text);
  }
  // The server path: a 403 plan-limit body reaches the wizard with its code.
  const start = read('assets/merchant-config.js').indexOf('  function registerNewStore(');
  const mc = read('assets/merchant-config.js');
  const register = vm.runInNewContext(mc.slice(start, mc.indexOf('  /* Push this store', start)) + '\nregisterNewStore', {
    slugMerchant: () => 'second', window: {}, freshDrop() {},
    postRaw: async () => ({ ok: false, status: 403, json: async () => ({ error: 'plan-limit-exceeded', limit: 'venues', max: 1, tier: 'plus' }) }),
  });
  await assert.rejects(register({ name: 'Second', throwOnError: true }), (e) => e.status === 403 && e.code === 'plan-limit-exceeded');
  const authText = vm.runInNewContext(body + '\nfailed', { submitError: { status: 403 }, tr: (o) => o.en });
  assert.ok(authText.includes('Sign in again'), 'a real authorisation refusal still asks to sign in');
  ok('onboarding#1 Plus is capped on the device and a plan limit is never shown as a sign-in problem');
}
console.log(`wave-11-i18n-test: ${count} groups passed`);
