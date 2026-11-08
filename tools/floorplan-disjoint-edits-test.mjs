#!/usr/bin/env node
/* floor#B2 · deux appareils éditent la MÊME table sur des champs différents
 * (l'un la déplace, l'autre change ses couverts) : la fusion garde les deux.
 * Vrai pdsStampPlan + vrai pdsMergePlans + vrai KiwiFieldMerge, dans les deux
 * ordres de fusion, avec la table seule d'un côté. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE = fs.readFileSync(path.join(ROOT, 'assets/floorplan-core.js'), 'utf8');
function grab(src, start) {
  const i = src.indexOf(start); assert.ok(i >= 0, start + ' introuvable');
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); }
  throw new Error('unbalanced');
}
let clock = Date.parse('2026-11-01T10:00:00Z');
const realNow = Date.now; Date.now = () => clock;
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/field-merge.js'), 'utf8'), ctx);
vm.runInContext('globalThis.__t = 0; Date.now = () => globalThis.__t;', ctx);
const FM = ctx.KiwiFieldMerge;
const CLOCKSRC = CORE.match(/let PDS_HLC = [^;]+;/)[0] + '\n' + CORE.match(/const PDS_CLOCK_AHEAD = [^;]+;/)[0] + '\n' + ['pdsSane', 'pdsSeenMax', 'pdsTick'].map((n) => grab(CORE, 'function ' + n + '(')).join('\n') + '\n';
const F = new Function('KiwiFieldMerge',
  'const PDS_GONE_TTL = 30 * 24 * 3600 * 1000;\n' + CLOCKSRC + CORE.match(/const PDS_STAMP_SKIP = [^;]+;/)[0] + '\n'
  + ['pdsGoneOf', 'pdsMergePlans', 'pdsCanon', 'pdsStampPlan'].map((n) => grab(CORE, 'function ' + n + '(')).join('\n')
  + '\nreturn { pdsMergePlans, pdsStampPlan };')(FM);
const set = (t) => { clock = t; ctx.__t = t; };
const plain = (x) => JSON.parse(JSON.stringify(x));
const union = (mine, theirs) => {
  const seen = new Set(); const o = Object.assign({}, theirs, mine);
  ['tables', 'elements', 'zones'].forEach((k) => { seen.clear(); const out = []; [mine[k], theirs[k]].forEach((arr) => (arr || []).forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } })); o[k] = out; });
  return o;
};
const T0 = Date.parse('2026-11-01T10:00:00Z');
set(T0);
const base = F.pdsStampPlan(plain({ zones: [{ id: 'z1', name: 'Salle' }], elements: [], tables: [{ id: 't1', num: '1', x: 100, y: 100, seats: 4, status: 'free', zone: 'z1' }] }), null);
const edit = (doc, at, fn) => { set(at); const next = plain(doc); fn(next.tables[0]); return F.pdsStampPlan(next, JSON.stringify(doc)); };
const A = edit(base, T0 + 5000, (t) => { t.x = 400; t.y = 250; });          // l'appareil A déplace la table
const B = edit(base, T0 + 9000, (t) => { t.seats = 6; });                   // l'appareil B change les couverts, plus tard
for (const m of [F.pdsMergePlans(plain(A), plain(B), union), F.pdsMergePlans(plain(B), plain(A), union)]) {
  const t = m.tables.find((x) => x.id === 't1');
  assert.equal(t.seats, 6, 'les couverts de B sont gardés');
  assert.equal(t.x, 400, 'le déplacement de A est gardé');
  assert.equal(t.y, 250);
}
// même instant, champs différents : encore les deux
const A2 = edit(base, T0 + 7000, (t) => { t.num = '12'; });
const B2 = edit(base, T0 + 7000, (t) => { t.seats = 2; });
for (const m of [F.pdsMergePlans(plain(A2), plain(B2), union), F.pdsMergePlans(plain(B2), plain(A2), union)]) {
  const t = m.tables[0];
  assert.equal(t.num, '12'); assert.equal(t.seats, 2);
}
Date.now = realNow;
console.log('floorplan-disjoint-edits · ok');
