/* floor#A1 · l'âge de l'observation est connu, et une action lourde peut forcer une lecture
 * immédiate au lieu d'attendre le prochain sondage. Vrai assets/floorplan-live.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src = fs.readFileSync(new URL('../assets/floorplan-live.js', import.meta.url), 'utf8');
let now = 1_000_000;
const win = { KiwiEnv: { isReal: () => true }, KiwiCloudDoc: { currentSlug: () => 'amira' }, addEventListener() {} };
const doc = { visibilityState: 'visible', hidden: false, addEventListener() {} };
class D extends Date { static now() { return now; } }
const ctx = vm.createContext({ window: win, document: doc, console, Date: D, setTimeout, clearTimeout, localStorage: { getItem: () => null }, JSON, Promise });
vm.runInContext(src, ctx);
const L = win.KiwiFloorLive;
let calls = 0, status = 'ok';
L._setFetcher(() => { calls++; return Promise.resolve({ ok: true, json: async () => ({ ok: true, tables: { 5: { status: status === 'ok' ? 'ka-yaklo' : 'khawya' } }, now }) }); });
assert.equal(L.age(), Infinity, 'jamais observé');
let room = await L.ensureFresh(3000, 500);        // aucune observation : lecture immédiate, sans watch()
assert.equal(calls, 1);
assert.equal(room.tables[5].status, 'ka-yaklo');
assert.equal(L.age(), 0);
now += 2000;
room = await L.ensureFresh(3000, 500);            // assez récente : aucune requête
assert.equal(calls, 1); assert.equal(L.age(), 2000);
now += 10_000; status = 'free';                   // la table s'est libérée pendant que le patron regardait
room = await L.ensureFresh(3000, 500);
assert.equal(calls, 2, 'trop vieille : relue maintenant');
assert.equal(room.tables[5].status, 'khawya', 'la lecture reflète le comptoir');
assert.equal(L.age(), 0);
// comptoir injoignable : on rend la dernière salle (marquée), sans bloquer
L._setFetcher(() => Promise.reject(new Error('offline')));
now += 10_000;
room = await L.ensureFresh(3000, 500);
assert.ok(room && room.stale === true, 'dernière salle connue, signalée périmée');
console.log('floorplan-live-fresh · ok');
