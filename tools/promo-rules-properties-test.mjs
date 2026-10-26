/* Comparaison des moteurs historiques figés avec assets/promos.js et assets/menu-promos.js. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const fc = createRequire(new URL('../app/package.json', import.meta.url))('fast-check');
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
function engine(old) {
  const window = {}, localStorage = { getItem: () => null };
  const ctx = vm.createContext({ window, localStorage, console });
  vm.runInContext(read('assets/kit/haptics.js'), ctx);
  if (!old) vm.runInContext(read('assets/promo-rules.js'), ctx);
  for (const f of ['promos.js', 'menu-promos.js']) vm.runInContext(read((old ? 'tools/fixtures/promo-rules/' : 'assets/') + f), ctx);
  return window;
}
const old = engine(true), shared = engine(false);
const plain = x => JSON.parse(JSON.stringify(x));
const time = fc.integer({ min: Date.UTC(2026, 8, 1), max: Date.UTC(2027, 5, 1) });
const hour = fc.oneof(fc.constantFrom('', 'invalid', '05:00', '22:00', '01:00'), fc.integer({ min: 0, max: 1439 }).map(n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`));
const promo = fc.record({
  id: fc.constant('p'), name: fc.constant('Promotion'), all: fc.constant(true),
  kind: fc.constantFrom('percent', 'amount', 'fixed', 'unknown'),
  value: fc.oneof(fc.integer({ min: -1000, max: 100000 }).map(n => n / 100), fc.constantFrom('bad', null, '12.345', 0.495)),
  days: fc.array(fc.integer({ min: -1, max: 8 })), start: hour, end: hour,
  paused: fc.constantFrom(false, true, 1, 'false'), createdAt: fc.constant(1), updatedAt: fc.constant(1)
});
fc.assert(fc.property(promo, time, fc.integer({ min: 0, max: 1000000 }), (p, now, cents) => {
  for (const surface of ['boutique', 'menu']) {
    const raw = { ...p, from: surface === 'menu' ? '2026-10-16' : Date.UTC(2026, 9, 16), to: surface === 'menu' ? '2027-02-01' : Date.UTC(2027, 1, 1) };
    const a = surface === 'menu' ? old.KiwiMenuPromos.sanitize([raw]) : [old.KiwiPromos.normalize(raw)];
    const b = surface === 'menu' ? shared.KiwiMenuPromos.sanitize([raw]) : [shared.KiwiPromos.normalize(raw)];
    assert.deepEqual(plain(b), plain(a));
    if (!a.length) continue;
    if (surface === 'boutique') {
      assert.equal(shared.KiwiPromos.status(b[0], now), old.KiwiPromos.status(a[0], now));
      assert.equal(shared.KiwiPromos.applyTo(b[0], cents / 100), old.KiwiPromos.applyTo(a[0], cents / 100));
    } else {
      assert.equal(shared.KiwiMenuPromos.isActive(b[0], now), old.KiwiMenuPromos.isActive(a[0], now));
      assert.deepEqual(plain(shared.KiwiMenuPromos.resolve(b, { itemId: 'x' }, cents / 100, now)), plain(old.KiwiMenuPromos.resolve(a, { itemId: 'x' }, cents / 100, now)));
    }
  }
}), { numRuns: 2500, seed: 20261026 });
assert.ok(Object.isFrozen(shared.KiwiPromoRules));
console.log('✓ 2500 promotions générées : normalisation, calendrier et prix historiques préservés');

// Hand-computed oracle, independent of both historical implementations.
// 26 October 2026 is Monday; the configured Casablanca zone law is UTC, cutoff 05:00 local.
for (const [kind,value,base,want] of [
  ['percent',15,1.45,1.23], ['percent',50,.05,.03],
  ['amount',.27,1.34,1.07], ['fixed',1.23,2.99,1.23],
  ['amount',10,1.34,0], ['fixed',10,1.34,1.34]
]) {
  const p = shared.KiwiPromoRules.normalize({kind,value},'menu');
  assert.equal(shared.KiwiPromoRules.price(p,base,'menu'),want,`centime oracle ${kind}/${base}`);
}
const calendar = {days:[1],start:'22:00',end:'02:00',from:'2026-10-26',to:'2026-10-26'};
for (const [iso,want] of [
  ['2026-10-26T04:59:59Z','scheduled'], // Sunday business date
  ['2026-10-26T05:00:00Z','waiting'],
  ['2026-10-26T21:59:59Z','waiting'],
  ['2026-10-26T22:00:00Z','active'],
  ['2026-10-27T01:59:59Z','active'],
  ['2026-10-27T02:00:00Z','waiting'],
  ['2026-10-27T04:59:59Z','waiting'],
  ['2026-10-27T05:00:00Z','ended']
]) assert.equal(shared.KiwiPromoRules.status(calendar,Date.parse(iso),'menu'),want,`calendar oracle ${iso}`);
assert.equal(shared.KiwiPromoRules.price({kind:'percent',value:15},1.45,'boutique'),0,'whole-MAD boutique shelf policy unchanged');
console.log('✓ independent centime and business-cutoff oracles');
