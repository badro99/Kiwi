#!/usr/bin/env node
/* Ticket #0147(b) · The floating "open caisse" launcher must never sit on an
 * entry, lock or pairing gate.
 *
 * Two root causes guarded here:
 * 1. ensureChip() placed the chip for any real merchant without checking the
 *    gate (dashReady() existed but was never called).
 * 2. dashReady()'s lock test used `lock.offsetParent !== null`, which is
 *    ALWAYS null for position:fixed overlays — so it could never see the
 *    visible PIN lock.
 *
 *   node tools/caisse-chip-gate-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(path.join(ROOT, 'assets/caisse-link.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

ok('ensureChip gates on dashReady and removes a placed chip', () => {
  const m = src.match(/function ensureChip\([^)]*\)\s*\{([\s\S]{0,700})/);
  assert.ok(m, 'ensureChip found');
  assert.ok(/dashReady\(\)/.test(m[1]), 'must consult dashReady()');
  assert.ok(/removeChild/.test(m[1]), 'must remove a chip placed before the gate closed');
});

ok('lock visibility does not rely on offsetParent (null for fixed overlays)', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/offsetParent\s*!==?\s*null/.test(code), 'offsetParent null-check must be gone');
  assert.ok(/getClientRects\(\)/.test(code), 'must use rects for fixed-overlay visibility');
});

ok('chip re-evaluates on unlock and on lock moves', () => {
  assert.ok(/kiwi:dashboard-unlocked/.test(src), 'must re-place after unlock');
  assert.ok(/MutationObserver/.test(src), 'must watch the lock node for re-locks');
});

/* 2026-10 · The listener sat on `document` while dashboard.html dispatches the
 * unlock on `window`, so it never fired: after any code unlock the launcher was
 * gone, and on a new store (Terminaux off) it is the only way to pair a till.
 * Naming the event is not enough — the target is what matters. */
ok('unlock listener is attached where dashboard.html dispatches it (window)', () => {
  const dash = readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8');
  assert.ok(/window\.dispatchEvent\(new Event\('kiwi:dashboard-unlocked'\)\)/.test(dash),
    'dashboard.html still dispatches the unlock on window');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(/window\.addEventListener\('kiwi:dashboard-unlocked'/.test(code),
    'caisse-link.js must listen on window');
});

/* 2026-10 · "Caisse connectée" came from local pairing memory alone: green with
 * the till switched off (while Plan de salle said "hors ligne"), and "Connecter
 * la caisse" beside a till paired from an iPad and ringing. The chip now reads
 * the till's heartbeat that /api/feed carries. Run the real functions. */
{
  const vm = await import('node:vm');
  const grab = (name) => {
    const i = src.indexOf('function ' + name + '(');
    let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
    }
    return '';
  };
  /* The chip's words come from the panel's own three-language table. */
  const devT = (() => { const i = src.indexOf('var DEV_T = {'); let d = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1) + ';'; }
    return ''; })();
  const run = ({ paired, presence, lang = 'fr' }) => {
    const chip = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, t: { textContent: '' }, querySelector() { return this.t; } };
    const ctx = vm.createContext({
      window: { KiwiTillPresence: presence },
      document: { getElementById: () => chip, documentElement: { lang } },
      localStorage: { getItem: (k) => (k === 'kiwiLang' ? lang : null) },
      currentBiz: () => ({ merchant: 'cafe' }),
      isPaired: () => paired,
    });
    vm.runInContext(grab('devLang') + '\n' + devT + '\n' + grab('dt') + '\n' + grab('tillPresence') + '\n' + grab('updateChip') + '\nupdateChip();', ctx);
    return chip.attrs['data-state'] + ' ' + chip.t.textContent;
  };
  ok('fresh heartbeat → connected, even if paired from another device', () =>
    assert.equal(run({ paired: false, presence: { merchant: 'cafe', seen: 1, fresh: true } }), 'on Caisse connectée'));
  ok('stale heartbeat → "Caisse hors ligne", even if paired in this browser', () =>
    assert.equal(run({ paired: true, presence: { merchant: 'cafe', seen: 1, fresh: false } }), 'away Caisse hors ligne'));
  ok('no heartbeat ever (boutique/spa tills never poll) → local memory decides', () => {
    assert.equal(run({ paired: true, presence: { merchant: 'cafe', seen: 0, fresh: false } }), 'on Caisse connectée');
    assert.equal(run({ paired: false, presence: null }), 'off Connecter la caisse');
  });
  ok('another store\'s heartbeat is ignored', () =>
    assert.equal(run({ paired: false, presence: { merchant: 'other', seen: 1, fresh: true } }), 'off Connecter la caisse'));
  ok('the chip speaks the dashboard language (English, Arabic)', () => {
    assert.equal(run({ paired: false, presence: { merchant: 'cafe', seen: 1, fresh: true }, lang: 'en' }), 'on Till connected');
    assert.equal(run({ paired: true, presence: { merchant: 'cafe', seen: 1, fresh: false }, lang: 'en' }), 'away Till offline');
    assert.equal(run({ paired: false, presence: null, lang: 'ar' }), 'off ربط الصندوق');
  });
  const live = readFileSync(path.join(ROOT, 'assets/live-link.js'), 'utf8');
  const feed = readFileSync(path.join(ROOT, 'functions/api/feed.js'), 'utf8');
  ok('/api/feed returns the till heartbeat and live-link publishes it', () => {
    assert.ok(/SELECT seen_ts FROM order_desk WHERE merchant = \?/.test(feed));
    assert.ok(/json\(\{ sales: rows, cursor, merchant, voided, tillSeen, now: Date\.now\(\) \}\)/.test(feed));
    assert.ok(/publishTill\(tenant, data\.tillSeen, data\.now\)/.test(live));
    assert.ok(/kiwi:till-presence/.test(src), 'the chip listens for presence updates');
  });
}

console.log(`\ncaisse-chip-gate: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
