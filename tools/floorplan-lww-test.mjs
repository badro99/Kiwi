#!/usr/bin/env node
/* ═════════════════════════════════════════════════════════════════
 * Kiwi · plan de salle : la fusion est « dernier écrivain gagnant » par élément.
 *
 *   node tools/floorplan-lww-test.mjs
 *
 * pdsMergePlans (assets/floorplan-core.js) faisait l'union par identifiant avec
 * CET appareil prioritaire : un appareil resté sur une vieille copie annulait, à
 * sa prochaine fusion, la table qu'un autre venait de déplacer. Les éléments
 * (tables, éléments de décor, zones) portent maintenant `updatedAt`, posé par
 * pdsStampPlan à chaque vraie modification ; à identifiant égal, le plus récent
 * gagne, un horodatage absent vaut 0 (le plus ancien), et à égalité l'appareil
 * local garde la main comme avant. C'est de la LOGIQUE de fusion : rien ne
 * change à l'écran. Fonctions extraites du fichier livré.
 * ═════════════════════════════════════════════════════════════════ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = fs.readFileSync(path.join(ROOT, 'assets/floorplan-core.js'), 'utf8');
const PAGES = fs.readFileSync(path.join(ROOT, 'assets/pages-pro.js'), 'utf8');

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
const F = new Function(
  'const PDS_GONE_TTL = 30 * 24 * 3600 * 1000;\n'
  + CORE.match(/const PDS_STAMP_SKIP = [^;]+;/)[0] + '\n'
  + ['pdsGoneOf', 'pdsMergePlans', 'pdsCanon', 'pdsStampPlan'].map((n) => grab(CORE, 'function ' + n + '(')).join('\n')
  + '\nreturn { pdsMergePlans, pdsStampPlan };'
)();

/* l'union par défaut de cloud-doc.js : cet appareil prioritaire */
const union = (mine, theirs) => {
  const seen = new Set(); const out = [];
  const take = (arr) => (arr || []).forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } });
  const o = Object.assign({}, theirs, mine);
  ['tables', 'elements', 'zones'].forEach((k) => { seen.clear(); out.length = 0; take(mine[k]); take(theirs[k]); o[k] = out.slice(); });
  return o;
};
const plan = (tables, extra) => Object.assign({ zones: [{ id: 'z1', name: 'Salle' }], tables, elements: [], staff: [] }, extra || {});
const T = (id, x, updatedAt, extra) => Object.assign({ id, x, y: 0, status: 'free' }, updatedAt == null ? {} : { updatedAt }, extra || {});
const byId = (p, id) => p.tables.find((t) => t.id === id);

ok('appareil périmé : la table déplacée ailleurs plus récemment n’est PAS revertie', () => {
  const stale = plan([T('t1', 100, 1000)]);           // vieille copie locale
  const server = plan([T('t1', 500, 2000)]);          // déplacée ailleurs, plus tard
  const m = F.pdsMergePlans(stale, server, union);
  assert.equal(byId(m, 't1').x, 500);
});
ok('appareil à jour : sa propre modification récente l’emporte sur la copie serveur', () => {
  const m = F.pdsMergePlans(plan([T('t1', 700, 3000)]), plan([T('t1', 500, 2000)]), union);
  assert.equal(byId(m, 't1').x, 700);
});
ok('horodatage absent = le plus ancien (un plan d’avant le correctif cède à un plan daté)', () => {
  assert.equal(byId(F.pdsMergePlans(plan([T('t1', 100)]), plan([T('t1', 500, 5)]), union), 't1').x, 500);
  assert.equal(byId(F.pdsMergePlans(plan([T('t1', 100, 5)]), plan([T('t1', 500)]), union), 't1').x, 100);
});
ok('aucun horodatage des deux côtés : cet appareil garde la main, comme avant', () => {
  assert.equal(byId(F.pdsMergePlans(plan([T('t1', 100)]), plan([T('t1', 500)]), union), 't1').x, 100);
});
ok('égalité : cet appareil garde la main', () => {
  assert.equal(byId(F.pdsMergePlans(plan([T('t1', 100, 7)]), plan([T('t1', 500, 7)]), union), 't1').x, 100);
});
ok('le statut de service reste celui de CET appareil quand la copie de l’autre gagne', () => {
  const mine = plan([T('t1', 100, 1000, { status: 'occupied', since: 42 })]);
  const theirs = plan([T('t1', 500, 2000, { status: 'free' })]);
  const t = byId(F.pdsMergePlans(mine, theirs, union), 't1');
  assert.equal(t.x, 500); assert.equal(t.status, 'occupied'); assert.equal(t.since, 42);
});
ok('les tables d’un seul côté sont toujours conservées (union), l’ordre local est gardé', () => {
  const m = F.pdsMergePlans(plan([T('t1', 1, 1), T('t2', 2, 1)]), plan([T('t2', 9, 5), T('t3', 3, 1)]), union);
  assert.deepEqual(m.tables.map((t) => t.id), ['t1', 't2', 't3']);
  assert.equal(byId(m, 't2').x, 9);
});
ok('éléments de décor et zones suivent la même règle', () => {
  const mine = plan([T('t1', 1, 1)], { elements: [{ id: 'e1', x: 1, updatedAt: 10 }], zones: [{ id: 'z1', name: 'Vieux nom', updatedAt: 10 }] });
  const theirs = plan([T('t1', 1, 1)], { elements: [{ id: 'e1', x: 99, updatedAt: 20 }], zones: [{ id: 'z1', name: 'Terrasse', updatedAt: 20 }] });
  const m = F.pdsMergePlans(mine, theirs, union);
  assert.equal(m.elements[0].x, 99); assert.equal(m.zones[0].name, 'Terrasse');
});
ok('les pierres tombales et l’époque fonctionnent toujours', () => {
  const mine = plan([T('t1', 1, 9)], { gone: { t2: Date.now() } });
  const m = F.pdsMergePlans(mine, plan([T('t1', 1, 1), T('t2', 2, 1)]), union);
  assert.deepEqual(m.tables.map((t) => t.id), ['t1']);
  const e = F.pdsMergePlans(plan([T('t1', 1, 9), T('tX', 1, 9)]), plan([T('t1', 2, 1)], { epoch: 1 }), union);
  assert.equal(e.tables.length, 1); assert.equal(e.epoch, 1);
});
ok('les réglages d’affichage restent ceux de l’appareil', () => {
  const m = F.pdsMergePlans(plan([T('t1', 1, 1)], { mode: 'assign', snap: false }), plan([T('t1', 2, 9)], { mode: 'layout', snap: true }), union);
  assert.equal(m.mode, 'assign'); assert.equal(m.snap, false);
});

/* ── horodatage (pdsStampPlan) ──────────────────────────────────────────── */
const stamped = (prev, next) => F.pdsStampPlan(next, JSON.stringify(prev));
ok('une table déplacée reçoit un horodatage plus récent', () => {
  const prev = plan([T('t1', 100, 1000)]);
  const next = plan([T('t1', 160, 1000)]);
  assert.ok(byId(stamped(prev, next), 't1').updatedAt > 1000);
});
ok('une table non modifiée garde le sien ; un changement de statut live ne compte pas', () => {
  const prev = plan([T('t1', 100, 1000), T('t2', 5, 1000)]);
  const next = plan([T('t1', 100, 1000, { status: 'occupied', since: 5 }), T('t2', 5, 1000)]);
  const s = stamped(prev, next);
  assert.equal(byId(s, 't1').updatedAt, 1000); assert.equal(byId(s, 't2').updatedAt, 1000);
});
ok('un plan d’avant le correctif n’est pas daté tant qu’on n’y touche pas', () => {
  const prev = plan([T('t1', 100), T('t2', 5)]);
  const next = plan([T('t1', 100), T('t2', 6)]);
  const s = stamped(prev, next);
  assert.equal(byId(s, 't1').updatedAt, undefined);   // inchangé : reste « le plus ancien »
  assert.ok(byId(s, 't2').updatedAt > 0);             // modifié : daté
});
ok('une table créée est datée ; une copie arrivée déjà datée n’est pas redatée', () => {
  const s = stamped(plan([]), plan([T('t9', 1), T('tS', 1, 777)]));
  assert.ok(byId(s, 't9').updatedAt > 0); assert.equal(byId(s, 'tS').updatedAt, 777);
});
ok('l’ordre des clés ne fait pas une modification (ouvrir la page ne date rien)', () => {
  const prev = { zones: [], tables: [{ id: 't1', x: 1, y: 2, updatedAt: 50 }], elements: [], staff: [] };
  const next = { zones: [], tables: [{ y: 2, id: 't1', updatedAt: 50, x: 1 }], elements: [], staff: [] };
  assert.equal(stamped(prev, next).tables[0].updatedAt, 50);
});
ok('une copie ancienne éditée reste plus ancienne qu’une copie plus récente d’ailleurs', () => {
  // l'appareil périmé ouvre la page (rien ne change) puis fusionne : il ne gagne pas
  const stale = stamped(plan([T('t1', 100, 1000)]), plan([T('t1', 100, 1000)]));
  const m = F.pdsMergePlans(stale, plan([T('t1', 500, 2000)]), union);
  assert.equal(byId(m, 't1').x, 500);
});

/* ── câblage ─────────────────────────────────────────────────────────────── */
ok('pdsWriteLocal date les modifications locales, pas la copie qui vient du serveur', () => {
  const w = grab(PAGES, 'function pdsWriteLocal(state, noStamp)');
  assert.ok(/!noStamp && typeof pdsStampPlan === 'function'/.test(w) && /pdsStampPlan\(state, localStorage\.getItem\(k0\)\)/.test(w));
  assert.ok(/d = pdsSyncStaff\(d\);\s*pdsWriteLocal\(d, true\);/.test(PAGES), 'écriture venant du serveur : sans horodatage');
  assert.ok(/pdsWriteLocal\(pdsLive, true\);/.test(PAGES), 'resynchronisation du personnel : sans horodatage');
});
ok('KiwiFloorCore expose stamp', () => assert.ok(/stamp: pdsStampPlan/.test(CORE)));

console.log(`\n${failed ? '✗' : '✓'} floorplan-lww : ${passed} ok, ${failed} en échec`);
process.exit(failed ? 1 : 0);
