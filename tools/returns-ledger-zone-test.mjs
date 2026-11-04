#!/usr/bin/env node
// Le registre des retours date un remboursement du soir selon la loi des fuseaux du Maroc,
// même sur un navigateur dont la table des fuseaux est ancienne (UTC+1 après le 20 septembre 2026).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const staleDTF = function (locale, opts) {
  const zone = opts && opts.timeZone;
  return new Intl.DateTimeFormat(locale, zone === 'Africa/Casablanca' ? { ...opts, timeZone: 'Etc/GMT-1' } : opts);
};
staleDTF.supportedLocalesOf = Intl.DateTimeFormat.supportedLocalesOf;
// Le navigateur ancien : ni Intl ni toLocaleDateString ne connaissent la loi.
const realToLocale = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function (locale, opts) { return new staleDTF(locale, opts).format(this); };
const sandbox = vm.createContext({ Intl: { ...Intl, DateTimeFormat: staleDTF }, Date, console, Object, Number, Math });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/kit/haptics.js'), 'utf8'), sandbox, { filename: 'haptics.js' });
globalThis.window = { KiwiZoneLaw: sandbox.KiwiZoneLaw, KiwiDayReport: { timezone: () => 'Africa/Casablanca' } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { returnRows } = await import(pathToFileURL(path.join(ROOT, 'assets/returns-ledger.js')).href);
const late = Date.parse('2026-10-22T23:30:00Z'); // 23:30 au Maroc (UTC+0), 00:30 le 23 pour une table ancienne
const rows = returnRows([{ id: 'R1', ts: late, amount: 10, items: [{ name: 'X', qty: 1, amount: 10 }] }], (fr) => fr);
assert.equal(rows.length, 1);
assert.equal(rows[0].d, '22/10/2026', 'un remboursement de 23 h 30 reste dans sa journée sur une table de fuseaux ancienne');
const before = Date.parse('2026-09-19T23:30:00Z'); // avant le changement : UTC+1, donc déjà le 20
assert.equal(returnRows([{ id: 'R2', ts: before, amount: 5 }], (fr) => fr)[0].d, '20/09/2026', 'avant le 20 septembre 2026 la loi ancienne s applique');
Date.prototype.toLocaleDateString = realToLocale;
console.log('✓ returns-ledger-zone : date des retours selon la loi des fuseaux');
