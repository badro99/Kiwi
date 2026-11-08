/* briefing#A2 · on traite une carte, puis le commerce courant change pendant que
 * l'envoi au serveur est encore en cours. Vrai assets/briefing-persistence.js :
 * - la sauvegarde annonce l'échec (venue-changed), pas un succès ;
 * - la note « à renvoyer » reste en place pour le commerce d'origine ;
 * - rien de la carte ne fuit dans le document de l'autre commerce ;
 * - revenir sur le commerce d'origine retrouve la carte traitée. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createPersistence } = require('../assets/briefing-persistence.js');
const mem = new Map();
let venue = 'amira', releaseBind, pushes = 0;
const cloud = { bind: () => new Promise((res) => { releaseBind = res; }), pushNow: () => { pushes++; return Promise.resolve({ ok: true }); } };
const P = createPersistence({
  slug: () => venue, localKey: () => 'briefing:' + venue, validSettings: (s) => s || {}, render() {}, compute() {}, isReal: () => true,
  localStorage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) },
  limits: {}, canDispatch: () => false, cloudDoc: () => ({ attach: () => cloud }),
});
P.attachCloud();
const now = Date.now();
P.writeLocal({ days: [{ id: 'd1', venue: 'amira', day: '2026-11-08', updatedAt: now, lines: [], handled: { c1: now } }] });
const pending = P.save();                     // sauvegarde lancée, liaison au serveur pas encore faite
await new Promise((r) => setTimeout(r, 5));
venue = 'pasta';                              // le commerce courant change pendant le délai
releaseBind();
const result = await pending;
assert.equal(result.ok, false, 'un envoi dont le commerce a changé n\u2019est pas un succès');
assert.equal(result.error, 'cloud-unconfirmed');
assert.equal(pushes, 0, 'rien n\u2019est poussé sous le mauvais commerce');
assert.ok(mem.get('briefing:amira:cloud-save'), 'la note « à renvoyer » du commerce d\u2019origine reste');
assert.equal(P.own().days.length, 0, 'le commerce courant ne voit pas la carte de l\u2019autre');
assert.ok(!mem.get('briefing:pasta'), 'rien n\u2019est écrit sous la clé de l\u2019autre commerce');
venue = 'amira';
const back = P.own();
assert.equal(back.days.length, 1);
assert.ok(back.days[0].handled.c1, 'la carte traitée est retrouvée au retour');
console.log('briefing-venue-switch-save · ok');
