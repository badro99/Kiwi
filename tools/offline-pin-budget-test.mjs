import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const read = f => fs.readFileSync(f, 'utf8');
const storage = new Map();
let now = 1800000000000, derivations = 0;
const merchant = 'budget-fixture', code = String(1230 + 4), wrong = String(9000 + 9);
function load() {
  const ctx = { console, TextEncoder, Uint8Array, toast() {}, activeVenue: () => ({ merchant }),
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    crypto: { getRandomValues: b => webcrypto.getRandomValues(b), subtle: {
      importKey: (...a) => webcrypto.subtle.importKey(...a),
      deriveBits: (...a) => { derivations++; return webcrypto.subtle.deriveBits(...a); }
    } }, KiwiTrustedClock: { now: () => now, rolledBack: () => false } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext((fs.existsSync('assets/caisse-pairing/offline-budget.js') ? read('assets/caisse-pairing/offline-budget.js') : '') + read('assets/caisse-pairing/offline-codes.js'), ctx);
  return ctx;
}
let c = load();
const remember = () => c.rememberOfflinePin(merchant, code, { id: 'fixture', role: 'manager' });
const check = (value = wrong, store = merchant) => c.verifyOfflinePin(store, value);
await remember();
for (let i=0;i<5;i++) assert.equal(await check(), null);
let count = derivations;
assert.equal(await check(code), null, 'right code refused during lockout');
assert.equal(derivations, count, 'locked code performs no PBKDF2');
assert.equal(c.offlineBudget.check(merchant), 30, 'a locked attempt is refused without lengthening the delay');
c = load();
assert.equal(c.offlineBudget.check(merchant), 30, 'fresh VM retains budget');
now -= 100000;
assert.equal(c.offlineBudget.check(merchant), 30, 'rollback cannot shorten delay');
now += 160000;
assert.ok(await check(code), 'right code accepted after delay');
assert.equal(c.offlineBudget.check(merchant), 0, 'correct code resets');
for (let i=0;i<5;i++) await check();
assert.equal(c.offlineBudget.check(merchant), 30, 'correct code reset failure count');
assert.equal(c.offlineBudget.check('another-store'), 0, 'store isolation');
for (const seconds of [60,120,240,480,900,900]) {
 now += c.offlineBudget.check(merchant)*1000;
 await check();
 assert.equal(c.offlineBudget.check(merchant), seconds, 'further wrong code doubles, capped at 15 min');
}
await remember();
assert.equal(c.offlineBudget.check(merchant), 0, 'server-proven code resets');
assert.ok(await check(code));
for (let i=0;i<4;i++) await check();
assert.ok(await check(code), 'four failures do not lock; success resets streak');
console.log('✓ offline PIN budget: threshold, no derivation, exponential cap, reload, rollback, store isolation and both resets');
