#!/usr/bin/env node
// Deux tables ICU simulées, les vraies bornes et la vraie route Z, sans socket.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fixture } from './server-money-fixture.mjs';
const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const serverLaw = read('functions/api/_zone-law.js');
const browser = read('assets/kit/haptics.js');
const body = serverLaw.replace(/^export .*;\n/gm, '');
assert.ok(browser.includes(body), 'identical law table, probe and formatter implementation in both twins');
const CUT = Date.parse('2026-09-20T01:00:00Z'), HOUR = 3600000;
let checks = 1;
for (const page of ['dashboard.html', 'kiwi-caisse.html', 'kiwi-serveur.html', 'kiwi-cuisine.html', 'OrderPro.html', 'booking.html', 'kiwi-admin.html', 'order-tv.html', 'reset.html', 'kit.html']) {
  const html = read(page);
  assert.match(html, /<script src="assets\/kit\/haptics\.js\?v=\d+"><\/script>/, page + ': unconditional law bundle'); checks++;
}
function modeledIntl(stale) {
  function DTF(locale, opts) {
    const zone = opts?.timeZone;
    if (!['Africa/Casablanca', 'Africa/El_Aaiun'].includes(zone)) return new Intl.DateTimeFormat(locale, opts);
    const old = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'Etc/GMT-1' });
    const law = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' });
    const select = t => stale || +(t === undefined ? Date.now() : t) < CUT ? old : law;
    return { format: t => select(t).format(t), formatToParts: t => select(t).formatToParts(t), resolvedOptions: () => ({ ...old.resolvedOptions(), timeZone: zone }) };
  }
  DTF.supportedLocalesOf = Intl.DateTimeFormat.supportedLocalesOf;
  return { ...Intl, DateTimeFormat: DTF };
}
const f = await fixture(fileURLToPath(new URL('../', import.meta.url)));
try {
  for (const stale of [true, false]) {
    const intl = modeledIntl(stale);
    const s = vm.createContext({ Intl: intl, Date });
    vm.runInContext(body + read('functions/api/_business-day.js').replace(/^import .*;\n/gm, '').replace(/export /g, ''), s);
    const b = vm.createContext({ Intl: intl, Date, console, location: { pathname: '/dashboard.html', search: '' }, document: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, KiwiConfig: { timezone: 'Africa/Casablanca' } });
    b.window = b; b.addEventListener = () => {};
    for (const p of ['assets/kit/haptics.js', 'assets/kit/format.js', 'assets/kit/business-day.js', 'assets/kit/ledger.js', 'assets/day-report.js']) vm.runInContext(read(p), b, { filename: p });
    for (const z of ['Africa/Casablanca', 'Africa/El_Aaiun']) {
      assert.equal(s.effectiveZone(z, CUT - 1), z);
      assert.equal(s.effectiveZone(z, CUT), stale ? 'UTC' : z);
      assert.equal(b.KiwiZoneLaw.effectiveZone(z, CUT), stale ? 'UTC' : z); checks += 3;
      for (const [day, start] of [['2026-09-19', '04'], ['2026-09-20', '05'], ['2026-10-22', '05']]) {
        const expected = Date.parse(day + 'T' + start + ':00:00Z');
        assert.equal(s.businessBoundary(day, 5, z), expected);
        assert.equal(b.KiwiBusinessDay.businessBoundary(day, 5, z), expected);
        assert.equal(b.KiwiLedger._businessDate(expected - 1, 5, z), b.KiwiBusinessDay.addBusinessDays(day, -1));
        assert.equal(s.businessDate(expected - 1, 5, z), b.KiwiBusinessDay.addBusinessDays(day, -1));
        assert.equal(s.businessDate(expected, 5, z), day); checks += 5;
      }
    }
    b.KiwiFormat.configure({ zone: 'Africa/Casablanca' });
    assert.equal(b.KiwiFormat.time(CUT), '01:00'); assert.equal(b.KiwiFormat.time(CUT - HOUR), '01:00'); checks += 2;
    const R = b.KiwiDayReport;
    const canonicalZone = R.timezone(); assert.equal(canonicalZone, 'Africa/Casablanca'); checks++;
    for (const day of ['2026-09-19', '2026-09-20', '2026-10-22']) {
      const from = s.businessBoundary(day), to = s.businessBoundary(s.addBusinessDays(day, 1));
      assert.equal(R.dayBounds(day).from, from); assert.equal(R.dayBounds(day).to, to);
      for (let t = from; t < to; t += 15 * 60000) {
        const offset = t < CUT ? HOUR : 0;
        assert.equal(R.hourOf(t), new Date(t + offset).getUTCHours());
        assert.equal(R.businessDay(t), day); checks += 2;
      }
      const samples = Array.from({ length: (to - from) / HOUR }, (_, i) => ({ id: 'hour-' + i, ts: from + i * HOUR, amount: 1, method: 'cash' }));
      const report = R.build({ day, sales: samples, store: { type: 'boutique' }, categoryIndex: {} });
      assert.equal(report.net, samples.length);
      assert.equal(report.hours.reduce((sum, h) => sum + h.net, 0), samples.length);
      const expectedHours = new Map();
      for (const sale of samples) { const h = new Date(sale.ts + (sale.ts < CUT ? HOUR : 0)).getUTCHours(); expectedHours.set(h, (expectedHours.get(h) || 0) + 1); }
      assert.equal(report.hours.length, expectedHours.size);
      for (const slot of report.hours) assert.equal(slot.net, expectedHours.get(slot.h)); checks += 3 + report.hours.length;
      // Le corps réel de /api/z-reconciliation lit les bornes de chaque twin simulé.
      await f.reset();
      const ts = to - 1, id = 'zone-law-sale';
      f.sql.prepare('INSERT INTO sales(id,merchant,amount,amount_cents,method,ts) VALUES(?,?,1,100,\'cash\',?)').run(id, f.merchant, ts);
      const route = vm.createContext({ Request, Response, console, Date, crypto, isTillFor: async () => true, tillVerification: async () => ({ ok: true, legacy: true }),
        businessDate: s.businessDate, businessBoundary: s.businessBoundary, addBusinessDays: s.addBusinessDays,
        merchantZone: async () => 'Africa/Casablanca', merchantCutoff: async () => 5 });
      vm.runInContext(read('functions/api/z-reconciliation.js').replace(/^import .*;\n/gm, '').replace(/export /g, ''), route);
      const response = await route.onRequestPost({ env: f.env, request: new Request('https://kiwi.test/api/z-reconciliation', { method: 'POST', body: JSON.stringify({ merchant: f.merchant, day, terminalId: 'till', cutoff: 5, count: 1, totalCents: 100, sales: [{ id, amountCents: 100, method: 'cash' }] }) }) });
      const result = await response.json();
      assert.equal(result.status, 'matched', JSON.stringify(result)); assert.equal(result.serverCents, 100); checks += 2;
    }
    assert.equal(R.dayBounds('2026-09-19').to - R.dayBounds('2026-09-19').from, 25 * HOUR); checks++;
    assert.equal(s.effectiveZone('Europe/Paris', CUT), 'Europe/Paris'); checks++;
    const fmt = new b.KiwiZoneLaw.DateTimeFormat('en-GB', { timeZone: 'Africa/Casablanca', hour: '2-digit', hourCycle: 'h23' });
    assert.equal(fmt.format(CUT - HOUR), '01'); assert.equal(fmt.format(CUT), '01'); checks += 2;
  }
} finally { f.close(); }
console.log(`✓ zone-law: ${checks} checks; stale/current ICU, twins, cutover fold, browser/server bounds, ledger, day-report hour slots and real Z route`);
