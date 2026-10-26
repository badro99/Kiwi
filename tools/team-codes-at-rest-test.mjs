#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · les codes du roster Équipe ne restent pas en clair sur le disque.
 *
 *   node tools/team-codes-at-rest-test.mjs
 *
 * assets/team.js rangeait chaque salarié, `pinCode` et `password` compris, dans
 * localStorage (`kiwiTeamV2:custom`) : n'importe quel navigateur où le patron a
 * ouvert Équipe en gardait tous les codes lisibles (CLAUDE.md §6). Le patron
 * doit pourtant continuer de LES LIRE sur la page, c'est voulu
 * (functions/api/store.js › stripTeamCodes).
 *
 * Le piège n'est pas la lecture, c'est le renvoi : la remontée du roster
 * (staff_pins, le document `team` d'où l'app employé tire ses accès) REMPLACE ce
 * que le serveur porte par ce que le navigateur envoie. Un navigateur qui a
 * oublié des codes les effacerait chez le serveur. Ce banc tient donc les deux
 * moitiés :
 *   1 · le disque ne garde un code que tant que le serveur ne l'a pas ;
 *   2 · tant qu'un code attendu n'est pas revenu, RIEN ne part.
 * Les fonctions testées sont celles de team.js et de cloud-doc.js, extraites des
 * fichiers livrés, pas des copies.
 * ═══════════════════════════════════════════════════════════════════════════ */
import teamTestSource from './team-test-source.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEAM = teamTestSource();
const CLOUD = fs.readFileSync(path.join(ROOT, 'assets/cloud-doc.js'), 'utf8');

let passed = 0;
const failures = [];
function ok(label, fn) {
  try { fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failures.push(label); console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
}
async function okAsync(label, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${label}`); }
  catch (e) { failures.push(label); console.log(`  ✗ ${label}\n      ${String(e.message).split('\n')[0]}`); }
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

/* Les valeurs d'essai : fabriquées pour ce banc, jamais de vrais codes. */
const C1 = '4821', C2 = '7390', C3 = '1357';
const roster = () => [
  { id: 'm1', firstName: 'Sara', pinCode: C1, password: C1 },
  { id: 'm2', firstName: 'Omar', pinCode: C2, password: C2 },
  { id: 'm3', firstName: 'Lina', password: C3, pinCode: '' },
];
const raw = (v) => JSON.stringify(v);
const hasAnyCode = (v) => [C1, C2, C3].some((c) => raw(v).includes(`"${c}"`));

console.log('■ Team codes at rest (tools/team-codes-at-rest-test.mjs)');

/* ── 1 · les fonctions de team.js, telles que livrées ──────────────────── */
console.log('1 · le disque ne garde que ce que le serveur n\'a pas');
const ctx = vm.createContext({});
vm.runInContext([
  grab(TEAM, 'function isCode('), grab(TEAM, 'function memberCode('), grab(TEAM, 'function codeUnresolved('),
  grab(TEAM, 'function rosterHasUnresolved('), grab(TEAM, 'function diskMembers('), grab(TEAM, 'function outboundMembers('),
  grab(TEAM, 'function fillCodes('), grab(TEAM, 'function applyServerCodes('),
  'this.F = { isCode, memberCode, codeUnresolved, rosterHasUnresolved, diskMembers, outboundMembers, fillCodes, applyServerCodes };',
].join('\n'), ctx);
const F = ctx.F;

ok('memberCode lit pinCode d\'abord, puis password, et refuse ce qui n\'est pas quatre chiffres', () => {
  assert.equal(F.memberCode({ pinCode: C1, password: C2 }), C1);
  assert.equal(F.memberCode({ pinCode: '', password: C2 }), C2);
  assert.equal(F.memberCode({ pinCode: '12', password: 'abcdefghijkl' }), '');
  assert.equal(F.memberCode(null), '');
});
ok('un code que le serveur n\'a pas ne quitte JAMAIS le disque (jamais de perte)', () => {
  const disk = F.diskMembers(roster(), {});
  assert.equal(raw(disk), raw(roster()));
});
ok('un code confirmé par le serveur est ôté du disque ; son salarié porte hasCode, jamais le code', () => {
  const disk = F.diskMembers(roster(), { m1: C1, m2: C2, m3: C3 });
  assert.ok(!hasAnyCode(disk), raw(disk));
  assert.ok(disk.every((m) => m.hasCode === true && !('pinCode' in m) && !('password' in m)));
  assert.equal(disk[0].firstName, 'Sara');
});
ok('seuls les codes confirmés partent : le serveur a l\'ancien code → le nouveau reste', () => {
  const r = roster(); r[0].pinCode = r[0].password = '9999';
  const disk = F.diskMembers(r, { m1: C1, m2: C2 });
  assert.equal(disk[0].pinCode, '9999');
  assert.ok(!('pinCode' in disk[1]));
  assert.equal(disk[2].password, C3);
});
ok('la mémoire n\'est jamais touchée par la copie disque', () => {
  const r = roster(); F.diskMembers(r, { m1: C1, m2: C2, m3: C3 });
  assert.equal(r[0].pinCode, C1);
});
ok('hasCode ne voyage pas : outboundMembers l\'ôte, le reste est identique', () => {
  const out = F.outboundMembers([{ id: 'a', hasCode: true, firstName: 'A' }, { id: 'b', firstName: 'B' }]);
  assert.equal(raw(out), raw([{ id: 'a', firstName: 'A' }, { id: 'b', firstName: 'B' }]));
});

console.log('2 · un code attendu qui n\'est pas revenu bloque tout départ');
ok('un salarié hasCode sans code est « non résolu » ; avec code, ou sans drapeau, non', () => {
  assert.equal(F.codeUnresolved({ id: 'a', hasCode: true }), true);
  assert.equal(F.codeUnresolved({ id: 'a', hasCode: true, pinCode: C1 }), false);
  assert.equal(F.codeUnresolved({ id: 'a' }), false);
  assert.equal(F.rosterHasUnresolved([{ id: 'a' }, { id: 'b', hasCode: true }]), true);
  assert.equal(F.rosterHasUnresolved([]), false);
});
ok('la fusion rend le code que seul l\'autre côté porte, et ne touche pas un code que nous avons', () => {
  const mine = [{ id: 'm1', hasCode: true }, { id: 'm2', pinCode: '1111', password: '1111' }];
  const theirs = [{ id: 'm1', pinCode: C1, password: C1 }, { id: 'm2', pinCode: C2, password: C2 }];
  const out = F.fillCodes(mine, theirs);
  assert.equal(out[0].pinCode, C1);
  assert.equal(out[1].pinCode, '1111');
  assert.equal(out[0].hasCode, true);
});
ok('la copie serveur (patron) rend les codes aux salariés qui les attendent et note ce que le serveur détient', () => {
  const r = F.applyServerCodes([{ id: 'm1', hasCode: true }, { id: 'm2', hasCode: true }], roster(), {});
  assert.equal(r.members[0].pinCode, C1);
  assert.equal(r.members[1].pinCode, C2);
  assert.equal(raw({ ...r.serverCodes }), raw({ m1: C1, m2: C2, m3: C3 }));
  assert.equal(F.rosterHasUnresolved(r.members), false);
});
ok('une copie expurgée (compte non patron) ne résout rien et n\'efface aucun drapeau', () => {
  const redacted = roster().map(({ pinCode, password, ...rest }) => rest);
  const r = F.applyServerCodes([{ id: 'm1', hasCode: true }], redacted, {});
  assert.equal(F.rosterHasUnresolved(r.members), true);
  assert.equal(raw({ ...r.serverCodes }), "{}");
});
ok('une copie lisible qui n\'a PAS de code pour lui lâche son drapeau (sinon il bloquerait pour toujours)', () => {
  const server = roster().slice(0, 2);   // m3 absent de la copie
  const r = F.applyServerCodes([{ id: 'm1', hasCode: true }, { id: 'm3', hasCode: true }], server, {});
  assert.equal(r.members[0].pinCode, C1);
  assert.ok(!('hasCode' in r.members[1]));
  assert.equal(F.rosterHasUnresolved(r.members), false);
});

/* ── 3 · la vie d'un roster sur trois sessions, serveur simulé ─────────── */
console.log('3 · trois sessions : migration, rechargement, panne');
await okAsync('migration du clair → disque propre → rechargement non résolu → hydratation rend tout', async () => {
  const server = { doc: { members: roster() } };               // le serveur a déjà ces codes
  /* session 1 : l'ancien blob en clair est chargé, le serveur confirme */
  let memory = roster();
  let serverCodes = {};
  ({ members: memory, serverCodes } = F.applyServerCodes(memory, server.doc.members, serverCodes));
  const disk1 = F.diskMembers(memory, serverCodes);
  assert.ok(!hasAnyCode(disk1), 'disque propre après la première hydratation');
  /* session 2 : on recharge depuis le disque */
  let memory2 = JSON.parse(raw(disk1));
  assert.equal(F.rosterHasUnresolved(memory2), true, 'non résolu : rien ne doit partir');
  let sc2 = {};
  ({ members: memory2, serverCodes: sc2 } = F.applyServerCodes(memory2, server.doc.members, sc2));
  assert.equal(F.rosterHasUnresolved(memory2), false);
  assert.equal(raw(memory2.map(F.memberCode)), raw([C1, C2, C3]), 'les codes sont revenus, identiques');
});
await okAsync('serveur injoignable : rien n\'est résolu, et ce qui part ne perd aucun code', async () => {
  const disk = F.diskMembers(roster(), { m1: C1, m2: C2, m3: C3 });
  const memory = JSON.parse(raw(disk));
  assert.equal(F.rosterHasUnresolved(memory), true);
  /* publishPins / la remontée testent exactement ce prédicat avant de partir */
});
await okAsync('un code créé en session et pas encore accepté reste sur le disque, puis part dès que le serveur l\'accepte', async () => {
  const memory = roster().concat([{ id: 'm4', firstName: 'Neo', pinCode: '2468', password: '2468' }]);
  let serverCodes = { m1: C1, m2: C2, m3: C3 };
  assert.equal(F.diskMembers(memory, serverCodes)[3].pinCode, '2468');
  serverCodes = { ...serverCodes, m4: '2468' };            // onPushed vient de le noter
  assert.ok(!('pinCode' in F.diskMembers(memory, serverCodes)[3]));
});

/* ── 4 · les branchements dans team.js ────────────────────────────────── */
console.log('4 · les branchements');
const persistSrc = grab(TEAM, 'function persistTeams(');
ok('persistTeams écrit diskMembers(…, serverCodes), jamais le roster brut', () => {
  assert.match(persistSrc, /out\.byVenue\[k\] = diskMembers\(root\.byVenue\[k\], serverCodes\);/);
  assert.doesNotMatch(persistSrc, /out\.byVenue\[k\] = root\.byVenue\[k\]/);
});
const pubSrc = grab(TEAM, 'function publishPins(');
ok('publishPins ne publie rien tant qu\'un salarié attend son code', () => {
  assert.match(pubSrc, /if \(rosterHasUnresolved\(roster\)\) return;/);
  assert.ok(pubSrc.indexOf('rosterHasUnresolved(roster)') < pubSrc.indexOf('window.KiwiConfig.syncPins(pins)'));
});
ok('la remontée du document : canPush bloque, onPushed note ce que le serveur a accepté, read() ôte hasCode', () => {
  assert.match(TEAM, /canPush: \(\) => \{[\s\S]*?rosterHasUnresolved\(window\.__kiwiTeamV2\.byVenue\[k\]\)[\s\S]*?heldPush = true/);
  assert.match(TEAM, /onPushed: \(doc\) => \{[\s\S]*?serverCodes\[m\.id\] = c;[\s\S]*?persistTeams\(\)/);
  assert.match(TEAM, /members: outboundMembers\(root\.byVenue\[k\] \|\| \[\]\)/);
});
ok('la fusion rend les codes (fillCodes) et l\'hydratation passe par une lecture directe, pas par pull', () => {
  assert.match(TEAM, /members: fillCodes\(members, theirs && theirs\.members\),/);
  assert.match(grab(TEAM, 'function hydrateCodes('), /fetchDeadline\('\/api\/store\?feature=team&merchant='/);
  assert.match(grab(TEAM, 'function teamCloudBind('), /c\.bind\(\)\)\.then\(\(\) => hydrateCodes\(\)\)\.then\(\(\) => publishPins\(\)\)/);
});
ok('modifier un salarié dont le code n\'est pas revenu ne lui en invente pas un nouveau', () => {
  assert.match(TEAM, /\(prev && prev\.hasCode \? '' : makeCode\(\)\)/);
  assert.match(TEAM, /\.\.\.\(\(!code && prev && prev\.hasCode && !memberCode\(prev\)\) \? \{ hasCode: true \} : \{\}\)/);
});
ok('aucun autre endroit de team.js n\'écrit le roster brut dans localStorage', () => {
  const writes = TEAM.match(/localStorage\.setItem\(LS_TEAM[^)]*\)/g) || [];
  assert.equal(writes.length, 1);
  assert.match(persistSrc, /localStorage\.setItem\(LS_TEAM, JSON\.stringify\(out\)\)/);
});

/* ── 5 · cloud-doc.js : le crochet canPush, tel que livré ──────────────── */
console.log('5 · cloud-doc : un document retenu ne part pas');
function browser(store, fetchImpl) {
  const listeners = Object.create(null);
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }, key: (i) => Array.from(store.keys())[i] || null, get length() { return store.size; },
  };
  const document = { visibilityState: 'visible', addEventListener(t, f) { (listeners[t] || (listeners[t] = [])).push(f); } };
  const window = { document, localStorage, KiwiEnv: { isReal: () => true }, addEventListener(t, f) { (listeners[t] || (listeners[t] = [])).push(f); } };
  window.window = window;
  new Function('window', 'document', 'localStorage', 'fetch', 'setTimeout', 'clearTimeout', CLOUD)(window, document, localStorage, fetchImpl, setTimeout, clearTimeout);
  return window;
}
const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

await okAsync('canPush faux : aucun POST, 423 « held », la marque « modifié » reste ; vrai : le document part et onPushed le reçoit', async () => {
  const store = new Map();
  let allow = false, posts = [], pushed = [];
  const win = browser(store, (url, opts) => {
    if (opts && opts.method === 'POST') { posts.push(JSON.parse(opts.body)); return Promise.resolve(resp(200, { ok: true, rev: 5 })); }
    return Promise.resolve(resp(200, { rev: 4, data: { members: [{ id: 'm1' }] } }));
  });
  let doc = { members: [{ id: 'm1', pinCode: C1 }] };
  const h = win.KiwiCloudDoc.attach({
    feature: 'team', slug: () => 'shop', read: () => doc, write: (d) => { doc = d; },
    canPush: () => allow, onPushed: (d) => pushed.push(d),
  });
  await h.pull(true);
  const held = await h.pushNow();
  assert.equal(held.status, 423);
  assert.equal(posts.length, 0, 'rien n\'est parti');
  assert.ok([...store.keys()].some((k) => k.startsWith('kiwiDocDirty:v1:')), 'la marque « modifié » reste');
  allow = true;
  const sent = await h.pushNow();
  assert.equal(sent.ok, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].data.members[0].pinCode, C1);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].members[0].id, 'm1');
});
await okAsync('sans crochet, cloud-doc se comporte comme avant (aucune régression pour les autres documents)', async () => {
  const store = new Map();
  let posts = 0;
  const win = browser(store, (url, opts) => (opts && opts.method === 'POST'
    ? (posts++, Promise.resolve(resp(200, { ok: true, rev: 2 })))
    : Promise.resolve(resp(200, { rev: 1, data: { a: 1 } }))));
  let doc = { a: 1 };
  const h = win.KiwiCloudDoc.attach({ feature: 'receipt', slug: () => 'shop', read: () => doc, write: (d) => { doc = d; } });
  await h.pull(true);
  const r = await h.pushNow();
  assert.equal(r.ok, true);
  assert.equal(posts, 1);
});

if (failures.length) { console.log(`\n✗ ${failures.length} failure(s)`); process.exit(1); }
console.log(`\n✓ ${passed} controls green`);
