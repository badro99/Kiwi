#!/usr/bin/env node
/* The PIN lock and the greeting after it · what they say must be true.
 *
 * 2026-10-12. At 00:12 the greeting said « Bonjour Amira, bonne journée. »
 * over « AMIRA BOUTIQUE · SERVICE OUVERT »: a morning wish at midnight, a
 * service nobody had opened, and the account's first shop while the dashboard
 * opened on another. identity.js re-wrote it in French over any language. The
 * lock was a frosted white card with a Feather icon, said « Saisis ton », and
 * the phone tab bar floated, live, above it.
 *   node tools/lock-greeting-truth-test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const html = read('dashboard.html');
const vexel = read('assets/design-vexel.css');
const identity = read('assets/identity.js');
const i18n = read('assets/i18n.js');
const pwa = read('assets/pwa-update.js');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}

const ctlStart = html.indexOf('<!-- PIN lock + greeting flash controller -->');
const ctl = html.slice(html.indexOf('<script>', ctlStart) + 8, html.indexOf('</script>', ctlStart));
const lockHtml = html.slice(html.indexOf('<div class="kiwi-lock" data-kiwi-lock>'), html.indexOf('One-time greeting flash'));
const greetHtml = html.slice(html.indexOf('<div class="kiwi-greet" data-kiwi-greet'), html.indexOf('<div class="kiwi-greet" data-kiwi-greet') + 600);
const LOGOUT_D = 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h280v80H200Zm440-160-55-58 102-102H360v-80h327L585-622l55-58 200 200-200 200Z';

/* The composer, lifted out of the controller and run for real. */
const composerSrc = ctl.slice(ctl.indexOf('  const GREET_T = {'), ctl.indexOf('  function isNativeShell()'));
const sandbox = { store: () => null, document: { documentElement: { lang: 'fr' } }, out: null };
vm.createContext(sandbox);
try { vm.runInContext(composerSrc + '\nout = { GREET_T, daySlot, helloText, wishText, firstName };', sandbox); } catch (_) {}
const G = sandbox.out || {};
const at = (h, m = 0) => new Date(2026, 9, 12, h, m);

console.log('greeting · the words follow the clock and the language');
ok('composer found in the controller', () => assert.ok(G && typeof G.helloText === 'function'));
ok('00:12 is night: « Bonsoir Amira, bonne fin de soirée. », never « bonne journée »', () => {
  assert.equal(G.helloText('Amira Benali', 'fr', at(0, 12)), 'Bonsoir Amira,');
  assert.equal(G.wishText('fr', at(0, 12)), 'bonne fin de soirée.');
});
ok('09:00 morning · 14:00 afternoon · 19:30 evening', () => {
  assert.equal(G.helloText('Amira', 'fr', at(9)), 'Bonjour Amira,');
  assert.equal(G.wishText('fr', at(9)), 'bonne journée.');
  assert.equal(G.wishText('fr', at(14)), 'bon après-midi.');
  assert.equal(G.helloText('', 'fr', at(19, 30)), 'Bonsoir,');
  assert.equal(G.wishText('fr', at(19, 30)), 'bonne soirée.');
});
ok('slot edges: 04:59 night, 05:00 morning, 12:00 afternoon, 18:00 evening, 22:00 night', () => {
  assert.deepEqual([at(4, 59), at(5), at(12), at(18), at(22)].map(G.daySlot), [3, 0, 1, 2, 3]);
});
ok('EN and AR carry all four slots; AR uses the Arabic comma', () => {
  for (const l of ['fr', 'en', 'ar']) {
    assert.equal(G.GREET_T[l].hello.length, 4, l);
    assert.equal(G.GREET_T[l].wish.length, 4, l);
  }
  assert.equal(G.helloText('Amira', 'en', at(20)), 'Good evening Amira,');
  assert.equal(G.helloText('Amira', 'ar', at(8)), 'صباح الخير Amira،');
});
ok('no em dash in any greeting copy', () => assert.ok(!/—/.test(JSON.stringify(G.GREET_T))));
ok('a role is not a name: « Propriétaire test » greets nobody, « Amira Benali » greets Amira', () => {
  assert.equal(G.firstName('Propriétaire test'), '');
  assert.equal(G.firstName('Owner'), '');
  assert.equal(G.firstName('المالك'), '');
  assert.equal(G.firstName('Amira Benali'), 'Amira');
});

console.log('greeting · what the pill claims');
ok('no « service ouvert » is written anywhere any more', () => {
  assert.ok(!/['"`][^'"`]*service ouvert['"`]/.test(identity), 'identity.js');
  assert.ok(!/['"`][^'"`]*service ouvert['"`]/.test(ctl), 'controller');
  assert.ok(!/service ouvert<\/div>/.test(greetHtml), 'markup');
});
ok('the status comes from the shop\'s own opening hours, and only when they are set', () => {
  assert.match(ctl, /H\.summary\(Date\.now\(\), undefined, lang\)/);
  assert.match(ctl, /s\.tone !== 'unset'/);
});
ok('the place is the store the dashboard opens on before the account\'s first shop', () => {
  const fn = ctl.slice(ctl.indexOf('function greetPlace()'), ctl.indexOf('function greetStatus('));
  assert.ok(fn.indexOf('getCurrentVenueData') > -1 && fn.indexOf('getCurrentVenueData') < fn.indexOf('KiwiMe'));
  assert.match(fn, /if \(scopedView\(\)\) return '';/);
});
ok('the demo name and shop only on a demo session', () => {
  assert.match(ctl, /accountName\(\) \|\| \(demo \? 'Rachid' : ''\)/);
  assert.match(ctl, /greetPlace\(\) \|\| \(demo \? 'Café Atlas' : ''\)/);
});
ok('the pill hides itself when there is nothing true to say', () => {
  assert.match(greetHtml, /data-kiwi-greet-sub hidden><\/div>/);
  assert.match(html, /\.kiwi-greet-sub\[hidden\] \{ display: none !important; \}/);
});
ok('the overlay carries no data-i18n, so i18n.js cannot put « Hello Rachid, » back', () => {
  assert.match(greetHtml, /<span data-greet-hello>/);
  assert.match(greetHtml, /<em data-greet-wish>/);
  assert.ok(!/data-i18n="dash\.(hello|day)"/.test(greetHtml));
});
ok('the person whose code opened the door is the one greeted (not overwritten by the owner)', () => {
  assert.match(ctl, /if \(hit\.name\) greetState\.who = String\(hit\.name\);/);
  assert.match(ctl, /greetState\.who \|\| accountName\(\)/);
});
ok('identity.js asks the controller for the words instead of writing French', () => {
  assert.ok(!/'Bonjour ' \+ first \+ ','/.test(identity));
  assert.match(identity, /__kiwiLock\.helloText/);
  assert.match(identity, /__kiwiLock\.setGreetPlace\(id\.business\)/);
});
ok('EN/AR dash.day are sentences, not « good day? »', () => {
  assert.ok(!i18n.includes("'dash.day': 'good day?'"));
  assert.ok(!i18n.includes("'dash.day': 'كيف يومك؟'"));
});

console.log('greeting · timing and motion');
ok('the greeting ends by 1.9 s and is gone at 2.5 s', () => {
  const u = ctl.slice(ctl.indexOf('  function unlock() {'), ctl.indexOf('  /* ── Skip control'));
  assert.match(u, /\}, 1900\);/);
  assert.match(u, /\}, 2500\);/);
  assert.ok(!/\}, 2600\);|\}, 3200\);/.test(u), 'old 2.6 s / 3.2 s timeline');
});
ok('any key (not a bare modifier) skips the greeting once the door is open', () => {
  assert.match(ctl, /if \(unlocked && !done && greet\.classList\.contains\('is-visible'\)\) \{/);
  assert.match(ctl, /Shift\|Control\|Alt\|Meta\|CapsLock/);
});
ok('the wish wipes in with a clip-path (stable layout), no typewriter caret', () => {
  assert.match(html, /\.kiwi-greet h1 \.em-clip \{[^}]*clip-path: inset\(/);
  assert.ok(!/is-typing/.test(html + vexel), 'caret class still present');
  assert.ok(!/naturalW/.test(ctl));
});
ok('reduced motion shows the sentence whole', () => {
  assert.match(html, /prefers-reduced-motion: reduce\)[\s\S]{0,400}\.kiwi-greet h1 \.em-clip \{ transition: none; clip-path: none; \}/);
  assert.match(ctl, /if \(reduceMotion && emClip\) emClip\.classList\.add\('is-revealed'\)/);
});
ok('the headline is upright 600 without a neon glow, and wraps on a phone', () => {
  const r = vexel.slice(vexel.indexOf('body.design-vexel .kiwi-greet h1 {'), vexel.indexOf('body.design-vexel .kiwi-greet h1 em {'));
  assert.match(r, /font-weight: 600;/);
  assert.match(r, /text-shadow: none;/);
  assert.match(r, /white-space: normal;/);
  assert.ok(!/rgba\(0, 255, 174/.test(r));
});

console.log('lock · the card and its copy');
ok('the lock says « Entrez votre », like the native app, not « Saisis ton »', () => {
  assert.match(lockHtml, /Entrez votre <b>code à 4 chiffres<\/b>/);
  assert.ok(!/Saisis ton/.test(html));
});
ok('« Changer de compte » uses the Material logout icon, in FR, EN and AR', () => {
  assert.ok(lockHtml.includes(LOGOUT_D));
  assert.equal(i18n.split(LOGOUT_D).length - 1, 2);
  assert.ok(!/points="16 17 21 12 16 7"/.test(lockHtml + i18n), 'Feather polyline');
});
ok('web card: opaque warm bone, no frosted glass, no pure white', () => {
  const r = vexel.slice(vexel.indexOf('html:not(.kiwi-native) body.design-vexel .kiwi-lock-inner {'));
  const rule = r.slice(0, r.indexOf('}'));
  assert.match(rule, /background: #FFFDFA;/);
  assert.match(rule, /backdrop-filter: none;/);
});
ok('the shared card rule still serves onboarding and auth untouched', () => {
  assert.match(vexel, /:is\(html\.design-vexel, body\.design-vexel\) :is\(\.kiwi-lock-inner, \.kob-card, \.vx-auth-card\) \{/);
});
ok('the lock names the shop it opens (web only; the native app writes its own title)', () => {
  assert.match(ctl, /function paintLockTitle\(\) \{\n\s+if \(!lockTitle \|\| !lock\.isConnected \|\| isNativeShell\(\)\) return;/);
});
ok('PIN cells: named transitions (no `transition: all`), a caret only while focused', () => {
  const cell = vexel.slice(vexel.indexOf('body.design-vexel .kiwi-pin-cell {'), vexel.indexOf('body.design-vexel[data-vexel-mode="dark"] .kiwi-pin-cell,'));
  assert.ok(!/transition: all/.test(cell));
  assert.match(vexel, /\.kiwi-lock-pin\.is-focused \.kiwi-pin-cell\.is-active::after/);
  assert.match(ctl, /c\.classList\.toggle\('is-active', i === val\.length\)/);
});
ok('cells shrink to fit a 360 px phone instead of overflowing the card', () => {
  assert.match(vexel, /\.kiwi-pin-cell \{\n  flex: 1 1 0;\n  min-width: 0;\n  width: auto;\n  max-width: 64px;/);
});
ok('a failed code restores the help line in the language it was showing', () => {
  assert.match(ctl, /if \(!helpEl\.classList\.contains\('is-error'\)\) helpHTML = helpEl\.innerHTML;/);
});
ok('the phone tab bar is gone while the gate owns the screen', () => {
  assert.match(html, /html\.kiwi-gate-up \.kw-tabbar \{ display: none !important; \}/);
  for (const where of ['function skipToApp()', '  function unlock() {', '  function unlockOnboard() {']) {
    const body = ctl.slice(ctl.indexOf(where), ctl.indexOf('\n  }\n', ctl.indexOf(where)));
    assert.match(body, /gate\(false\)/, where);
  }
  assert.match(ctl, /hide\(\) \{[^}]*gate\(false\)/);
  assert.match(ctl, /show\(\) \{[^}]*gate\(true\)/);
});

console.log('update notice');
ok('« Nouvelle version prête » speaks EN and AR and stays on one line', () => {
  assert.match(pwa, /en: \{ ready: 'New version ready', go: 'Refresh'/);
  assert.match(pwa, /ar: \{ ready: 'إصدار جديد جاهز', go: 'تحديث'/);
  assert.match(pwa, /white-space:nowrap/);
});
ok('the update pill waits behind an open modal, sheet or code screen instead of covering its buttons', () => {
  assert.match(pwa, /document\.querySelectorAll\('\.kiwi-backdrop, \[aria-modal="true"\], dialog\[open\]'\)/);
  // the till keeps its dialogs in the page: only a visible, clickable one counts
  assert.match(pwa, /if \(!el\.getClientRects\(\)\.length\) continue;/);
  assert.match(pwa, /if \(cs\.visibility === 'hidden' \|\| cs\.pointerEvents === 'none'\) continue;/);
  assert.match(pwa, /new MutationObserver\(queue\)\.observe\(/);
  assert.match(pwa, /appendChild\(button\);\n    keepClear\(button\);/);
});
ok('the pill draws a Material icon, not a « ↻ » text glyph', () => {
  assert.ok(!/↻/.test(pwa));
  assert.match(pwa, /var REFRESH_ICON = '<svg viewBox="0 -960 960 960"/);
});

console.log(`\nlock-greeting-truth: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
