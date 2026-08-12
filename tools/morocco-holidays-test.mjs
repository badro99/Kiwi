import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../assets/morocco-holidays.js',import.meta.url),'utf8');
const context=vm.createContext({console,Date,Object,String,Array,Number});
vm.runInContext(source,context,{filename:'morocco-holidays.js'});
const C=context.KiwiMoroccoCalendar;

assert.equal(C.info('2026-01-14','fr').label,'Nouvel An amazigh');
assert.equal(C.info('2027-01-14','ar').label,'رأس السنة الأمازيغية');
assert.equal(C.info('2026-10-31','en').label,'Unity Day');
assert.equal(C.info('2026-08-12','fr'),null);
assert.equal(C.between(['2026-08-12','2026-08-14'],'fr').length,1);
assert.equal(C.religiousNames('fr').includes('Aïd Al-Fitr'),true);
assert.equal(C.info('2026-08-14','fr').payroll,'review');

console.log('morocco-holidays-test: 7 controls passed');
