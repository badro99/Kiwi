#!/usr/bin/env node
/* Stock · les écrans de comptage et de pertes affichent l'heure civile du magasin.
 *
 * ctWhen (assets/stock.js) date chaque comptage et chaque perte à l'écran. Il lit
 * le fuseau du magasin (KiwiDayReport.timezone) et la loi de zone par le vrai
 * KiwiDayReport.civilParts (assets/day-report.js, zone law de assets/kit/haptics.js),
 * pas l'horloge de l'appareil : un gérant en voyage lit l'heure de sa boutique,
 * la même que dans l'export CSV. Sans magasin connu, l'appareil reste la règle.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const zoneLaw = (() => { const root = {}; new Function('globalThis', read('assets/kit/haptics.js').split('/* KiwiHaptics')[0])(root); return root.KiwiZoneLaw; })();
const civilParts = (() => {
  const src = read('assets/day-report.js');
  const from = src.indexOf('  var FORMATTERS = Object.create(null);'), to = src.indexOf('\n  }\n', src.indexOf('  function civilParts(')) + 4;
  return new Function('globalThis', 'DEFAULT_TIMEZONE', src.slice(from, to) + '\nreturn civilParts;')({ KiwiZoneLaw: zoneLaw }, 'Africa/Casablanca');
})();
const stock = read('assets/stock.js');
const start = stock.indexOf('  function ctWhen(ts) {'), end = stock.indexOf('\n  }\n', start) + 4;
assert.ok(start > 0, 'ctWhen lives in assets/stock.js');

function ctWhenFor(win, language = 'fr') {
  const ctx = vm.createContext({ window: win, Date, Intl, Number, String, lang: () => language });
  vm.runInContext(stock.slice(start, end) + '\nthis.ctWhen = ctWhen;', ctx);
  return ctx.ctWhen;
}
const at = Date.parse('2026-10-12T23:30:00Z');

// Tokyo store, device anywhere: 08:30 on the 13th, in the screen's locale.
const tokyo = { KiwiDayReport: { timezone: () => 'Asia/Tokyo', civilParts }, KiwiNumber: { locale: () => 'fr-FR' } };
assert.deepEqual({ ...ctWhenFor(tokyo)(at) }, { date: '13/10/2026', time: '08:30' }, 'a Tokyo store reads its own civil time');
assert.deepEqual({ ...ctWhenFor({ ...tokyo, KiwiNumber: { locale: () => 'en-GB' } }, 'en')(at) }, { date: '13/10/2026', time: '08:30' });

// Casablanca since 20 September 2026 is UTC+0 (zone law), whatever the runtime tzdata says.
const casa = { KiwiDayReport: { timezone: () => 'Africa/Casablanca', civilParts }, KiwiNumber: { locale: () => 'fr-FR' } };
assert.deepEqual({ ...ctWhenFor(casa)(at) }, { date: '12/10/2026', time: '23:30' }, 'Morocco reads UTC+0, not a stale +01');

// Without a day report (a page that does not load it), the device clock is still used.
const device = ctWhenFor({ KiwiNumber: { locale: () => 'fr-FR' } })(at);
const local = new Date(at);
assert.equal(device.time, local.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
assert.equal(device.date, local.toLocaleDateString('fr-FR'));

console.log('✓ stock screens: counts and losses show the store civil time (zone law), device clock only without a store');
