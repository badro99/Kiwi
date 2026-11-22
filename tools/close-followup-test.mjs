#!/usr/bin/env node
/* Le suivi de clôture (fin de assets/z-reconciliation.js) · owner, 22 Nov 2026.
 *   node tools/close-followup-test.mjs
 *
 * « Il faut laisser fermer, et le lendemain prévenir. » Une clôture ne bloque
 * plus sur un écart ni sur un Z non protégé : elle laisse un mot pour
 * l'ouverture suivante. Ce test tient la règle du mot, sans navigateur :
 * ce qui compte comme un problème, ce qui est gardé, et « Vu » qui l'efface. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const whole = fs.readFileSync(new URL('../assets/z-reconciliation.js', import.meta.url), 'utf8');
const at = whole.indexOf("/* LE MOT POUR L'OUVERTURE SUIVANTE");
assert.ok(at > 0, 'the close follow-up ships at the end of z-reconciliation.js');
const source = whole.slice(at);
function load() {
  const store = new Map();
  const window = {};
  const listeners = {};
  const document = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  const ctx = vm.createContext({
    window, document, Date, JSON, Math, Number, String, Array, Object, Intl,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  });
  vm.runInContext(source, ctx, { filename: 'close-followup.js' });
  return { F: window.KiwiCloseFollowUp, store, listeners };
}

const { F, listeners } = load();
assert.ok(F && typeof F.record === 'function', 'the module exposes KiwiCloseFollowUp');
assert.doesNotMatch(source, /KiwiCaisseLang|KiwiLive|KiwiDayReport/, 'it reads no other module: the tills announce, it listens');

/* The tills never call it: they announce the close on document. */
listeners['kiwi:till-closed']({ detail: { slug: 'evt-shop', day: '2026-11-22', closedAt: 9, gapCents: -2000 } });
assert.equal(F.pending('evt-shop').length, 1, 'a « kiwi:till-closed » event is kept');
assert.equal(typeof listeners['kiwi:till-opening'], 'function', 'and the opening is listened for');
listeners['kiwi:till-closed']({ detail: null });   // a malformed event is ignored, never thrown

F.record({ slug: 'browse', day: '2026-11-20', closedAt: 1, gapCents: -300, zIssue: null });
assert.equal(F.pending('browse').length, 0, 'a gap of 3 MAD is within the drawer’s green line: nothing to say');

F.record({ slug: 'browse', day: '2026-11-21', closedAt: 2, gapCents: -9100, reason: 'unrecorded', zIssue: null, by: 'Mohammed' });
let p = F.pending('browse');
assert.equal(p.length, 1, 'a 91 MAD shortfall is kept for the next opening');
assert.equal(p[0].gapCents, -9100);
assert.equal(p[0].reason, 'unrecorded');

F.record({ slug: 'browse', day: '2026-11-22', closedAt: 3, gapCents: 0, zIssue: 'unprotected', zReason: 'timeout' });
p = F.pending('browse');
assert.equal(p.length, 2, 'an unprotected Z is a problem too, and the older one is not lost');
assert.equal(p[0].day, '2026-11-22', 'newest first');

assert.equal(F.pending('other-shop').length, 0, 'one store’s notes never show on another');
F.record({ slug: '', day: '2026-11-22', gapCents: -5000 });
assert.equal(F.pending('').length, 0, 'a close without a store is not kept');

for (let i = 0; i < 20; i++) F.record({ slug: 'busy', day: '2026-10-' + String(i + 1).padStart(2, '0'), closedAt: i, gapCents: -1000 });
assert.ok(F.pending('busy').length <= 7, 'at most a week of unseen closes is kept');

const msg = F.text(p[1], 'fr');
assert.match(msg.title, /clôture/i);
assert.match(msg.lines.join(' '), /manquait 91,00 MAD/, 'the shortfall is said in plain words, with its amount');
assert.match(msg.lines.join(' '), /mouvement de caisse non saisi/, 'with the reason that was given');
assert.doesNotMatch(JSON.stringify(F.text(p[0], 'fr')) + JSON.stringify(F.text(p[1], 'en')) + JSON.stringify(F.text(p[1], 'ar')), /—/, 'no em dash in any language');
assert.match(F.text(p[1], 'en').lines.join(' '), /91\.00 MAD short/);
assert.ok(/[؀-ۿ]/.test(F.text(p[1], 'ar').title), 'Arabic has its own words');

F.acknowledge('browse');
assert.equal(F.pending('browse').length, 0, '« Vu » clears the store’s notes');
assert.equal(F.pending('busy').length > 0, true, 'and only that store’s');

console.log('✓ close-followup-test : une clôture laisse un mot pour l’ouverture suivante, « Vu » l’efface');
