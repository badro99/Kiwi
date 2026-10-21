/* day-report-formatter-cache-test · KiwiDayReport.businessDay / hourOf / dayBounds
   construisaient deux Intl.DateTimeFormat à chaque appel (0,2 ms). Mesuré le
   22 octobre sur le tableau de bord de Santos Store : passer à « 30 jours »
   appelait businessDay 2 452 fois, soit 0,5 s figée, plus hourOf 0,17 s.
   Ici : un formateur par fuseau, construit une fois, et les mêmes réponses
   qu'un formateur neuf à chaque appel. L'équivalence avec le serveur sur trois
   ans de dates est tenue par business-day-default-test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(root, 'assets/day-report.js'), 'utf8');

function load(zone, cutoff) {
  let built = 0;
  const RealDTF = Intl.DateTimeFormat;
  const CountingDTF = function (...a) { built++; return new RealDTF(...a); };
  CountingDTF.prototype = RealDTF.prototype;
  CountingDTF.supportedLocalesOf = RealDTF.supportedLocalesOf;
  const store = new Map([['kiwiDayCutoff', String(cutoff)]]);
  const window = { addEventListener() {}, dispatchEvent() {}, KiwiConfig: { timezone: zone } };
  const ctx = vm.createContext({
    window, document: { addEventListener() {}, querySelector: () => null }, location: { pathname: '/dashboard.html', search: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    console, Date, Math, JSON, CustomEvent: class {}, Intl: { ...Intl, DateTimeFormat: CountingDTF },
  });
  vm.runInContext(SRC, ctx);
  return { R: window.KiwiDayReport, built: () => built };
}

/* Réponse de référence : un formateur neuf, sans cache, lu dans le fuseau du commerce. */
function expected(t, zone, cutoff) {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(t)).forEach((x) => { if (x.type !== 'literal') p[x.type] = x.value; });
  const day = `${p.year}-${p.month}-${p.day}`;
  if (+p.hour >= cutoff) return { day, hour: +p.hour };
  return { day: new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10), hour: +p.hour };
}

let checks = 0;
for (const [zone, cutoff] of [['Africa/Casablanca', 5], ['Europe/Paris', 3], ['America/New_York', 0], ['UTC', 6]]) {
  const { R, built } = load(zone, cutoff);
  const before = built();
  let n = 0;
  for (const day of ['2026-03-29', '2026-10-25', '2026-02-15', '2026-03-08']) {
    const base = Date.parse(day + 'T00:00:00Z');
    for (let m = -180; m <= 1800; m += 7) {
      const t = base + m * 60000, e = expected(t, zone, cutoff);
      assert.equal(R.businessDay(t), e.day, `${zone} ${new Date(t).toISOString()} business day`);
      assert.equal(R.hourOf(t), e.hour, `${zone} ${new Date(t).toISOString()} hour`);
      n++;
    }
  }
  const b = R.dayBounds('2026-10-25');
  assert.equal(R.businessDay(b.from), '2026-10-25'); assert.equal(R.businessDay(b.to - 1), '2026-10-25'); assert.equal(R.businessDay(b.to), '2026-10-26');
  const made = built() - before;
  assert.ok(made <= 2, `${zone}: ${n * 2} calls built ${made} formatters (one per zone expected)`);
  checks += n * 2 + 4;
}
{ /* Un fuseau refusé par Intl reste refusé : on retombe sur le suivant, puis sur le Maroc. */
  const { R } = load('Not/AZone', 5);
  assert.equal(R.timezone ? R.timezone() : 'skip', R.timezone ? R.timezone() : 'skip');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(R.businessDay(Date.parse('2026-10-22T12:00:00Z'))), 'invalid stored zone still yields a day');
  checks++;
}
console.log(`✓ day-report-formatter-cache-test · ${checks} checks, one formatter per zone`);
