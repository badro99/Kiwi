#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * Kiwi · le roster de l'ancien compte ne revient pas après la purge.
 *
 *   node tools/team-roster-purge-test.mjs
 *
 * team.js lit `kiwiTeamV2:custom` à l'exécution du script, AVANT que /api/me ait
 * répondu. Quand un AUTRE compte se connecte, identity.js purge le stockage puis
 * recharge… mais `pagehide → saveCustomTeams → persistTeams` réécrivait entre-
 * temps le roster de l'ancien compte (codes d'équipe compris) dans le stockage
 * du nouveau. Le banc exécute les fonctions livrées de team.js, de
 * tenant-purge.js et d'identity.js (pas des copies) et tient trois règles :
 *   1 · pendant une purge, rien ne s'écrit (le drapeau précède tout effacement) ;
 *   2 · le roster rangé est estampillé du compte ; celui d'un autre n'est pas lu ;
 *   3 · un roster en mémoire qui n'est plus celui du compte courant ne s'écrit pas.
 * Les valeurs d'essai sont fabriquées pour ce banc, jamais de vrais codes.
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEAM = (await import('./team-owners-test-source.cjs')).default.originalFile('assets/team.js');
const PURGE = fs.readFileSync(path.join(ROOT, 'assets/tenant-purge.js'), 'utf8');
const IDENT = fs.readFileSync(path.join(ROOT, 'assets/identity.js'), 'utf8');

let passed = 0, failed = 0;
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failed++; console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
function grab(src, start) {
  const i = src.indexOf(start);
  assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
  throw new Error('unbalanced ' + start);
}

function memStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m,
  };
}

/* team.js, tel que livré : seules les dépendances lointaines sont remplacées. */
function load(ls, win) {
  const code = [
    "const LS_TEAM = 'kiwiTeamV2:custom';",
    'const DEMO_TYPE_KEYS = new Set(); const TRANSIENT_KEYS = new Set(["scoped", "own"]);',
    'const persistableTeamKey = (k) => !DEMO_TYPE_KEYS.has(k) && !TRANSIENT_KEYS.has(k);',
    'const serverCodes = {}; function diskMembers(m) { return m; }',
    'function cleanLocks(x) { return x || {}; } function cleanRemoved(x) { return x || []; }',
    'let afterCalls = 0, pushCalls = 0; function afterTeamChange() { afterCalls++; } function teamCloudPush() { pushCalls++; }',
    grab(TEAM, 'function teamAccount()'),
    TEAM.match(/let ROSTER_ACCOUNT = teamAccount\(\);/)[0],
    grab(TEAM, 'function rosterWriteBlocked()'),
    grab(TEAM, 'function loadCustomTeams()'),
    grab(TEAM, 'function persistTeams()'),
    grab(TEAM, 'function saveCustomTeams()'),
    'return { loadCustomTeams, persistTeams, saveCustomTeams, calls: () => ({ afterCalls, pushCalls }) };',
  ].join('\n');
  return new Function('localStorage', 'window', code)(ls, win);
}
const root = () => ({ byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} });
const rosterA = (acct) => JSON.stringify({ account: acct, byVenue: { v1: [{ id: 'm1', firstName: 'Sara', pinCode: '0000' }] }, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} });

ok('compte A : le roster rangé pour A se charge', () => {
  const ls = memStore({ kiwiAccountKey: 'a@example.test', 'kiwiTeamV2:custom': rosterA('a@example.test') });
  const win = { __kiwiTeamV2: root() };
  load(ls, win).loadCustomTeams();
  assert.equal(win.__kiwiTeamV2.byVenue.v1.length, 1);
});

ok('purge en cours : pagehide ne réécrit pas l’ancien roster', () => {
  const ls = memStore({ kiwiAccountKey: 'a@example.test', 'kiwiTeamV2:custom': rosterA('a@example.test') });
  const win = { __kiwiTeamV2: root() };
  const T = load(ls, win); T.loadCustomTeams();
  /* ce que fait identity.js › reconcileAccount : drapeau, nouvelle clé, purge */
  win.__kiwiTenantPurging = true;
  ls.setItem('kiwiAccountKey', 'b@example.test');
  ls.removeItem('kiwiTeamV2:custom');
  T.saveCustomTeams();            // pagehide
  T.persistTeams();
  assert.equal(ls.getItem('kiwiTeamV2:custom'), null);
  assert.deepEqual(T.calls(), { afterCalls: 0, pushCalls: 0 }, 'ni publication des codes ni remontée serveur');
});

ok('sans drapeau, un roster qui n’est plus celui du compte courant ne s’écrit pas non plus', () => {
  const ls = memStore({ kiwiAccountKey: 'a@example.test', 'kiwiTeamV2:custom': rosterA('a@example.test') });
  const win = { __kiwiTeamV2: root() };
  const T = load(ls, win); T.loadCustomTeams();
  ls.setItem('kiwiAccountKey', 'b@example.test');       // une autre fenêtre a changé de compte
  ls.removeItem('kiwiTeamV2:custom');
  T.saveCustomTeams();
  assert.equal(ls.getItem('kiwiTeamV2:custom'), null);
});

ok('le roster d’un autre compte n’est pas lu', () => {
  const ls = memStore({ kiwiAccountKey: 'b@example.test', 'kiwiTeamV2:custom': rosterA('a@example.test') });
  const win = { __kiwiTeamV2: root() };
  load(ls, win).loadCustomTeams();
  assert.equal(Object.keys(win.__kiwiTeamV2.byVenue).length, 0);
});

ok('une sauvegarde ordinaire estampille le compte et reste lisible au rechargement', () => {
  const ls = memStore({ kiwiAccountKey: 'A@Example.test' });
  const win = { __kiwiTeamV2: root() };
  win.__kiwiTeamV2.byVenue.v1 = [{ id: 'm2', firstName: 'Omar' }];
  const T = load(ls, win); T.saveCustomTeams();
  const stored = JSON.parse(ls.getItem('kiwiTeamV2:custom'));
  assert.equal(stored.account, 'a@example.test');
  const win2 = { __kiwiTeamV2: root() };
  load(ls, win2).loadCustomTeams();
  assert.equal(win2.__kiwiTeamV2.byVenue.v1[0].id, 'm2');
  assert.deepEqual(T.calls(), { afterCalls: 1, pushCalls: 1 });
});

ok('première ouverture sans compte connu : l’écriture reste permise, puis le compte s’installe', () => {
  const ls = memStore({});
  const win = { __kiwiTeamV2: root() };
  win.__kiwiTeamV2.byVenue.v1 = [{ id: 'm3' }];
  const T = load(ls, win);
  T.saveCustomTeams();
  assert.ok(ls.getItem('kiwiTeamV2:custom'), 'écrit');
  ls.setItem('kiwiAccountKey', 'first@example.test');   // identity.js pose la clé à la première connexion
  T.saveCustomTeams();
  assert.equal(JSON.parse(ls.getItem('kiwiTeamV2:custom')).account, 'first@example.test');
});

ok('tenant-purge.js : purge() lève le drapeau AVANT d’effacer quoi que ce soit', () => {
  const ls = memStore({ kiwiAccountKey: 'a@example.test', kiwiBizName: 'X', 'kiwiTeamV2:custom': rosterA('a@example.test') });
  let flagAtFirstRemoval;
  const win = {};
  const ctx = { window: win, localStorage: Object.assign({}, ls, {
    removeItem: (k) => { if (flagAtFirstRemoval === undefined) flagAtFirstRemoval = win.__kiwiTenantPurging; ls.removeItem(k); },
    get length() { return ls.length; }, key: ls.key, getItem: ls.getItem,
  }) };
  vm.runInNewContext(PURGE, ctx);
  win.KiwiTenantPurge.purge();
  assert.equal(flagAtFirstRemoval, true);
  assert.equal(ls.getItem('kiwiTeamV2:custom'), null);
  assert.equal(ls.getItem('kiwiAccountKey'), 'a@example.test', 'la clé de compte est préservée');
});

ok('identity.js : le drapeau est posé avant la nouvelle kiwiAccountKey', () => {
  const body = grab(IDENT, 'function reconcileAccount(me)');
  const flag = body.indexOf('window.__kiwiTenantPurging = true');
  const key = body.indexOf("localStorage.setItem('kiwiAccountKey', email)");
  assert.ok(flag > 0 && key > flag, `flag@${flag} key@${key}`);
});

console.log(`\n${failed ? '✗' : '✓'} team-roster-purge : ${passed} ok, ${failed} en échec`);
process.exit(failed ? 1 : 0);
