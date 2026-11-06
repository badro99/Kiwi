/* Stock · les exports CSV (inventaires, pertes) datent en heure civile du magasin.
 *
 * r20 : toISOString() écrivait l'heure UTC, et le nom du fichier portait le jour UTC.
 * Un gérant à l'étranger, ou une saisie près de la frontière du jour, lisait dans
 * l'export une heure qui n'était pas celle de ses écrans. Les vraies fabriques
 * assets/stock/counts.js et assets/stock/loss.js tournent ici avec un faux pont ;
 * le fuseau du magasin vient de KiwiDayReport.timezone(), la loi de zone de
 * assets/kit/haptics.js corrige la base de fuseaux (Maroc UTC+0 depuis le
 * 20 septembre 2026), et le fichier créé est lu. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SOURCES = Object.fromEntries(['stock/loss.js', 'stock/counts.js'].map((f) => [f, fs.readFileSync(new URL(`../assets/${f}`, import.meta.url), 'utf8')]));
const zoneLaw = (() => { const root = {}; new Function('globalThis', fs.readFileSync(new URL('../assets/kit/haptics.js', import.meta.url), 'utf8').split('/* KiwiHaptics')[0])(root); return root.KiwiZoneLaw; })();

function boot(file, zone, rows, now = Date.now()) {
  const FixedDate = class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } };
  const out = { csv: '', name: '' };
  const part = {};
  const S = new Proxy({ stWasteDateRange: 'tout', stWasteFilterReason: 'all', stWasteSearch: '', stCountDateFilter: 'tout', stCountStatusFilter: 'all', stCountSearch: '', stCountsCache: rows.counts || [],
    ct: (k) => (/^csv(Waste|Counts)$/.test(k) ? ['when', 'x'] : k.startsWith('csv') && k.endsWith('File') ? 'export' : k), ctWho: (v) => v || '', ctRole: (v) => v || '', ctStore: (v) => v || '', ctUnit: (v) => v || '', ctReason: () => '', ctWasteNote: (v) => v || '', ctReviewNote: (v) => v || '',
    getInv: () => [{ id: '501', name: 'Tomate', unit: 'kg', costPerUnit: 3 }], esc: String, lang: () => 'fr', stCountHistory: () => [] },
  { get: (t, k) => (k in t ? t[k] : () => undefined) });
  const win = {
    KiwiStockInternal: { install: (name, factory) => { part.api = factory(S); } },
    KiwiDayReport: { timezone: () => zone, dayBounds: () => ({ from: 0 }), businessDay: () => 'd' },
    KiwiInventory: { history: () => rows.waste || [] },
    KiwiZoneLaw: zoneLaw, KiwiVenue: {}, Kiwi: {}, KiwiBoutiqueCatalog: {},
  };
  win.window = win;
  const ctx = vm.createContext({ window: win, Intl, Date: FixedDate, Math, Number, String, JSON, Array, Object, Set, Map, isFinite, console,
    document: { createElement: () => { const a = { click() { out.name = a.download; } }; return a; }, body: { appendChild() {}, removeChild() {} }, getElementById: () => null, querySelector: () => null },
    Blob: class { constructor(p) { out.csv = p.join(''); } }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, setTimeout: () => 0 });
  vm.runInContext(SOURCES[file], ctx);
  return { api: part.api, out };
}

const TS = Date.UTC(2026, 9, 12, 23, 30); /* 12 oct 23:30 UTC */
const waste = [{ id: '9001', itemId: '501', qty: -2, reason: 'waste', refType: 'waste', occurredTs: TS, unitCost: 3, note: '', actor: 'Moi', meta: { wasteReason: 'perime' } }];
const counts = [{ id: 'c1', status: 'applied', storeName: 'Principal', employeeName: 'A', employeeRole: 'Admin', submittedAt: TS, totalLines: 1, totalVarianceCostMAD: 1, absVarianceCostMAD: 1, reviewerName: '', reviewDecision: '', reviewNote: '', lines: [] }];

for (const [file, fn] of [['stock/loss.js', 'exportWasteCsv'], ['stock/counts.js', 'exportCountsCsv']]) {
  /* Tokyo : 23:30 UTC est déjà le 13 au matin, 08:30:00 sur les écrans du magasin. */
  let { api, out } = boot(file, 'Asia/Tokyo', { waste, counts }, TS);
  api[fn]();
  assert.match(out.csv, /2026-10-13 08:30:00/, `${file}: Tokyo store sees 08:30 on the 13th, not the UTC stamp`);
  assert.ok(!/2026-10-12 23:30:00/.test(out.csv), `${file}: the UTC stamp is gone`);
  assert.match(out.name, /-2026-10-13\.csv$/, `${file}: file name carries the store day (13th in Tokyo)`);
  /* Maroc : UTC+0 depuis le 20 septembre 2026, même avec une base de fuseaux périmée (+1) : jamais 00:30. */
  ({ api, out } = boot(file, 'Africa/Casablanca', { waste, counts }, TS));
  api[fn]();
  assert.match(out.csv, /2026-10-12 23:30:00/, `${file}: Casablanca keeps UTC+0 under the zone law`);
  assert.match(out.name, /-2026-10-12\.csv$/, `${file}: and the 12th for the file name`);
}
console.log('✓ stock exports: timestamps are the store civil time, zone law applied');
