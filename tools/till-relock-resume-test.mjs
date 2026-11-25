// Caisse · « Changer de caissier » pendant un service ouvert.
// Jon's Burgers (25 Nov 2026): after « Changer de caissier » and a code, the
// till went blank and taps hit the hidden menu. The lock drops `is-unlocked`
// and reopens the pad; the code then ran unlockApp(), which brings back the
// « ouverture de caisse » screen. That screen was hidden for good when the
// service opened (inline display:none), so nothing showed and `is-unlocked`
// never came back. With a service already open, a code must take the new
// cashier straight back into the shell, and never reopen the service.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../assets/caisse/shift.js', import.meta.url), 'utf8');
const start = src.indexOf('    function operatorCaisseRequested()');
assert.ok(start > 0, 'unlockApp and its helper found in assets/caisse/shift.js');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };

function run(shiftOpenedAt) {
  const timers = [];
  const classes = () => { const s = new Set(); return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c), has: s }; };
  const clockin = { classList: classes(), style: {}, setAttribute() {} };
  const pinScreen = { classList: classes(), style: {} };
  const calls = [];
  const ctx = vm.createContext({
    pinScreen, shiftOpenedAt, calls,
    document: { getElementById: (id) => (id === 'clockin-screen' ? clockin : null), dispatchEvent: () => calls.push('opening') },
    CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
    location: { search: '' }, sessionStorage: { getItem: () => null },
    $$: () => [], currentMerchantSlug: () => 'demo',
    setTimeout: (fn, ms) => timers.push([ms, fn]),
    enterShellDirectly: () => calls.push('shell'),
  });
  vm.runInContext(`${src.slice(start)}\nthis.unlockApp = unlockApp;`, ctx);
  ctx.unlockApp();
  timers.sort((a, b) => a[0] - b[0]).forEach(([, fn]) => fn());
  return { calls, clockin, pinScreen };
}

const first = run(null);
ok(first.clockin.classList.contains('is-visible') && first.calls.includes('opening') && !first.calls.includes('shell'),
  'with no service open, the code still leads to « ouverture de caisse »');

const again = run(new Date());
ok(again.calls.includes('shell'), 'with a service open, the code goes straight back into the till');
ok(!again.clockin.classList.contains('is-visible') && !again.calls.includes('opening'),
  'with a service open, « ouverture de caisse » is not shown again and no opening is announced');
ok(again.pinScreen.classList.contains('is-leaving'), 'the pad still fades out the usual way');

console.log(`\n✓ ${checks} till relock resume controls passed`);
