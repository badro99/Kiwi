/* briefing#B0 · un jour malformé ou à l'horloge folle ne domine pas l'historique.
 * Passe par le VRAI assets/briefing-persistence.js (mergeDocs puis safeDoc). */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createPersistence } = require('../assets/briefing-persistence.js');
const mem = new Map();
const p = createPersistence({
  slug: () => 'fixture', localKey: () => 'k', validSettings: (s) => s || {}, render() {}, compute() {}, isReal: () => false,
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) }, limits: {}, canDispatch: () => false,
});
const now = Date.now();
const day = (over) => Object.assign({ id: 'a', venue: 'fixture', day: '2026-11-01', updatedAt: now - 1000, lines: [] }, over);
const merged = (days) => p.mergeDocs({ days }, { days: [] }).days;

// horloge de l'avenir lointain : ramenée à l'horloge de confiance, donc un enregistrement honnête plus tardif gagne
let out = merged([day({ id: 'honest', updatedAt: now + 60000 }), day({ id: 'future', updatedAt: now + 9e12 })]);
assert.equal(out.length, 1);
assert.equal(out[0].id, 'honest', 'l\u2019horloge folle ne domine pas l\u2019historique');

// forme : jour illisible, id absent, lines pas un tableau, updatedAt non numérique
out = merged([day({ day: 'tomorrow' }), day({ id: '' }), day({ id: 'b', lines: 'x' }), day({ id: 'c', day: '2026-11-02', updatedAt: 'zz' })]);
assert.deepEqual(out.map((r) => r.id), ['c'], 'seul l’enregistrement bien formé reste');
assert.equal(out[0].updatedAt, 0);

// un enregistrement honnête plus récent bat un futur absurde ramené à maintenant
out = merged([day({ id: 'fut', updatedAt: now + 9e12 })]);
assert.ok(out[0].updatedAt <= now + 1000);
console.log('briefing-day-records · ok');
