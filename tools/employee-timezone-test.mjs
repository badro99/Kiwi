#!/usr/bin/env node
import serveurTestSource from './serveur-test-source.cjs';
// Ticket #92: staff dates and timestamps follow the store's IANA zone, not
// Casablanca or the employee device's zone, including across a live rollover.
import fs from 'node:fs';
import vm from 'node:vm';
import { businessDate } from '../functions/api/_business-day.js';

let pass = 0, fail = 0;
function check(value, label) { if (value) { pass++; } else { fail++; console.error('  ✗ ' + label); } }
const at = Date.parse('2026-09-26T12:30:00Z'); // Auckland: 27th; Casablanca: 26th.
const src = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
for (const file of ['functions/api/employee.js', 'functions/api/team/live.js']) {
  const code = src(file);
  const match = code.match(/function dateKey\([^)]*\) \{[\s\S]*?\n\}/);
  check(Boolean(match), file + ' exposes date key logic');
  if (match) {
    const dateKey = vm.runInNewContext(`(${match[0]})`, { Intl, Date, businessDate });
    check(dateKey(at, 'Pacific/Auckland') === '2026-09-27', file + ' uses the store date');
    check(dateKey(at, 'Africa/Casablanca') === '2026-09-26', file + ' preserves Casablanca fallback');
  }
  check(code.includes('merchantZone(env, merchant)'), file + ' reads the merchant zone');
}
const employee = src('functions/api/employee.js');
check(/planningState\(teamRow\.data, me\.id, me\.role \|\| me\.department, zone\)/.test(employee), 'planning filters on store date');
check(/pointedHours\(attendanceRow\.data, me\.id, auth\.pin\.id, zone\)/.test(employee), 'employee hours keyed to store date');
check(/pointedHours\(\{ entries: \[changedEntry\] \}, memberId, auth\.pin\.id, zone\)/.test(employee), 'clock-out hours persisted on store date');
check(/store: \{[^\n]*timezone: zone/.test(employee), 'employee client receives store zone');
const live = src('functions/api/team/live.js');
check(/pointedHours\(attendance\.data, Date\.now\(\), zone[,)]/.test(live), 'manager hours keyed to store date');

function browser(file, apiName, data) {
  const code = src(file).replace(/\}\)\(\);\s*$/, `window.__tzTest = { dateKey: typeof dateKey === 'function' ? dateKey : null, todayKey: typeof todayKey === 'function' ? todayKey : null, timeLabel: typeof timeLabel === 'function' ? timeLabel : null, nextShift: typeof nextShift === 'function' ? nextShift : null, futureSchedule: typeof futureSchedule === 'function' ? futureSchedule : null, setData: d => { lastData = d; } };})();`);
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [at])); } static now() { return at; } }
  const window = { addEventListener() {} };
  const document = { addEventListener() {}, documentElement: { lang: 'fr' } };
  vm.runInNewContext(code, { window, document, Date: TestDate, Intl, String, Object, Array, Number, setTimeout, setInterval() {} });
  window.__tzTest.setData(data);
  return window.__tzTest;
}
const data = { store: { timezone: 'Pacific/Auckland' }, schedule: { '2026-09-26': { start: '09:00', end: '17:00' }, '2026-09-27': { start: '09:00', end: '17:00' } } };
const trade = browser('assets/employee-trade-shell.js', 'trade', data);
check(trade.dateKey() === '2026-09-27', 'trade workspace rolls to store date without reload');
check(trade.nextShift(data).day === '2026-09-27', 'trade next shift drops yesterday');
check(trade.timeLabel(at) === new Intl.DateTimeFormat('fr-FR', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' }).format(at), 'trade timestamps use store time');
check(/setInterval\(redrawOnDayChange, 60000\)/.test(src('assets/employee-trade-shell.js')), 'trade workspace redraws after midnight while open');
const planning = browser('assets/employee-planning.js', 'planning', data);
check(planning.todayKey() === '2026-09-27', 'planning rolls to store date without reload');
check(planning.futureSchedule().length === 1 && planning.futureSchedule()[0].day === '2026-09-27', 'planning hides past store day');
check(/setInterval\(redrawOnDayChange, 60000\)/.test(src('assets/employee-planning.js')), 'planning redraws after midnight while open');
const waiter = serveurTestSource(src('kiwi-serveur.html'));
const tick = waiter.match(/    function tickClock\(\) \{[\s\S]*?\n    \}\n    tickClock\(\);/);
check(Boolean(tick), 'waiter app has a live clock');
if (tick) {
  let now = Date.parse('2026-10-25T00:59:00Z'); // Berlin summer: 02:59.
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const fields = Object.fromEntries(['#ci-time','#ci-date'].map(key => [key, { textContent:'' }]));
  const ctx = vm.createContext({ Date:TestDate, Intl, employeeLocale:()=>'fr-FR', $:key=>fields[key] });
  vm.runInContext(`let employeeStoreZone='Europe/Berlin'; ${tick[0].replace(/\n    tickClock\(\);$/, '')}; tickClock();`, ctx);
  check(fields['#ci-time'].textContent === '02:59', 'waiter clock shows store summer time');
  now = Date.parse('2026-10-25T01:01:00Z'); // Same page, Berlin winter: 02:01.
  vm.runInContext('tickClock()', ctx);
  check(fields['#ci-time'].textContent === '02:01', 'waiter clock follows DST rollback without reload');
  vm.runInContext("employeeStoreZone='Pacific/Auckland'; tickClock()", ctx);
  check(fields['#ci-time'].textContent === new Intl.DateTimeFormat('fr-FR',{timeZone:'Pacific/Auckland',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now), 'waiter clock follows refreshed store zone without reload');
}
check(waiter.includes('employeeStoreZone = data.store && data.store.timezone'), 'waiter refresh updates zone from server payload');
check(waiter.includes('const monday = employeeCivilDate()') && waiter.includes('const key = employeeCivilKey(d)'), 'waiter schedule uses store-local civil keys');
check(waiter.includes('hmap[employeeCivilKey(d)]'), 'waiter weekly hours do not convert civil days through UTC');
check(waiter.includes('shiftStart.toLocaleTimeString(employeeLocale(), { timeZone: (globalThis.KiwiZoneLaw?.effectiveZone((employeeStoreZone'), 'pointage start is shown in store time');
console.log(`employee timezone: ${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
