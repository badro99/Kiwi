#!/usr/bin/env node
/* Catalogue spreadsheet · rules, .xlsx and the batch route.
 *
 *   · re-price maths: percent, amount, set, step rounding up / down / nearest,
 *     skip counters (no cost, rounded to zero, unchanged);
 *   · diff detection: only changed fields leave, numbers compared in centimes;
 *   · .xlsx: what write() produces, read() gives back cell for cell, and a
 *     DEFLATED file with shared strings (what Excel saves) reads too;
 *   · import analysis: required, not a number, duplicate barcode / SKU,
 *     unknown category, new / updated / unchanged;
 *   · POST /api/catalog/batch on a real schema: owner only (a paired till, a
 *     stranger, an employee and a manager are refused), another account's
 *     store never touched, all or nothing on a bad row, conflicts refused, a
 *     retry writes nothing, the barcode and SKU uniqueness, money with three
 *     decimals refused, a sale landing between read and write kept, a split
 *     (large) catalogue, and the carte of a restaurant written exactly once;
 *   · hostile workbooks: a zip bomb and a row 300 000 000 are refused fast;
 *   · the browser side, run for real in a sandbox: one carte save is one
 *     network write (the menu store adopts the answer, it does not republish),
 *     and price lists leave only after the batch succeeded.
 *   node tools/catalog-bulk-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(ROOT, 'assets/pages-pro/catalog-bulk/rules.js')).href);
await import(pathToFileURL(path.join(ROOT, 'assets/pages-pro/catalog-bulk/xlsx.js')).href);
const B = globalThis.KiwiBulkRules, X = globalThis.KiwiXlsx;
const { onRequestPost: batchPost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/catalog/batch.js')).href);
const { tillToken, makeSession, sessionCookie, employeeToken, employeeCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);
const { packCatalog, runCatalogWrite, loadParts } = await import(pathToFileURL(path.join(ROOT, 'functions/api/_catalog-parts.js')).href);

let fails = 0, passed = 0;
function ok(label, cond, detail) {
  if (cond) { passed++; return; }
  fails++;
  console.log(`  ✗ ${label}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ── numbers and rounding ─────────────────────────────────────────────── */
eq('parse "1 234,50"', B.parseNumber('1 234,50'), 1234.5);
eq('parse "1.234,50"', B.parseNumber('1.234,50'), 1234.5);
eq('parse "12,5 MAD"', B.parseNumber('12,5 MAD'), 12.5);
eq('parse Arabic digits', B.parseNumber('٨٩'), 89);
eq('parse empty is null', B.parseNumber(''), null);
ok('parse "abc" is NaN', Number.isNaN(B.parseNumber('abc')));
eq('round 12.30 to 0.5 nearest', B.roundTo(12.3, 0.5, 'nearest'), 12.5);
eq('round 12.24 to 0.5 nearest', B.roundTo(12.24, 0.5, 'nearest'), 12);
eq('round 12.25 to 0.5 nearest (half up)', B.roundTo(12.25, 0.5, 'nearest'), 12.5);
eq('round 41 to 5 up', B.roundTo(41, 5, 'up'), 45);
eq('round 44.99 to 5 down', B.roundTo(44.99, 5, 'down'), 40);
eq('round 45 to 5 up stays', B.roundTo(45, 5, 'up'), 45);
eq('round 0.1+0.2 to 1 down (no float drift)', B.roundTo(0.1 + 0.2, 1, 'down'), 0);
eq('round to 1 nearest', B.roundTo(158.5, 1, 'nearest'), 159);
eq('no step keeps centimes', B.roundTo(10.006, 0, 'nearest'), 10.01);

/* ── re-price ─────────────────────────────────────────────────────────── */
const tajines = [
  { id: 'a', name: 'Tajine kefta', price: 65, cost: 22 },
  { id: 'b', name: 'Tajine poulet', price: 70, cost: 0 },
  { id: 'c', name: 'Tajine agneau', price: 95, cost: 40 },
];
eq('+5 % on price, nearest 1 MAD', B.reprice(tajines, { basis: 'price', op: 'pct', value: 5, step: 1, mode: 'nearest' }).rows.map((r) => r.next), [68, 74, 100]);
eq('+5 % up to 5 MAD', B.reprice(tajines, { basis: 'price', op: 'pct', value: 5, step: 5, mode: 'up' }).rows.map((r) => r.next), [70, 75, 100]);
eq('−10 % down to 0.5', B.reprice(tajines, { basis: 'price', op: 'pct', value: -10, step: 0.5, mode: 'down' }).rows.map((r) => r.next), [58.5, 63, 85.5]);
eq('+3 MAD amount', B.reprice(tajines, { basis: 'price', op: 'amt', value: 3, step: 0, mode: 'nearest' }).rows.map((r) => r.next), [68, 73, 98]);
const onCost = B.reprice(tajines, { basis: 'cost', op: 'pct', value: 200, step: 5, mode: 'up' });
eq('cost ×3 up to 5: rows', onCost.rows.map((r) => [r.id, r.next]), [['a', 70], ['c', 120]]);
eq('cost basis skips an item with no cost', onCost.skipped['no-basis'], 1);
const setTo = B.reprice(tajines, { basis: 'price', op: 'set', value: 70, step: 0, mode: 'nearest' });
eq('set to 70: one already there', [setTo.rows.length, setTo.skipped.same], [2, 1]);
eq('−200 MAD rounds to zero and is skipped', B.reprice(tajines, { basis: 'price', op: 'amt', value: -200, step: 0 }).skipped.zero, 3);
eq('delta carried', B.reprice([tajines[0]], { basis: 'price', op: 'amt', value: 2.5, step: 0 }).rows[0].delta, 2.5);
eq('margin', B.margin(100, 60), 40);
eq('margin without cost', B.margin(100, 0), null);

/* ── diff ─────────────────────────────────────────────────────────────── */
const orig = [{ id: 'p1', name: 'Jean', price: 299, cost: 120, sellable: true }, { id: 'p2', name: 'Veste', price: 450, cost: 0, sellable: true }];
eq('diff: only changed fields, numbers in centimes', B.diff(orig, { p1: { price: '299,00', cost: 125 }, p2: { name: 'Veste ' } }, ['name', 'price', 'cost']),
  [{ id: 'p1', set: { cost: 125 }, was: { cost: 120 } }]);
eq('diff: unknown row ignored', B.diff(orig, { zz: { price: 1 } }), []);
eq('checkValue price required', B.checkValue('boutique', 'price', '', null), { error: 'required' });
eq('checkValue price not a number', B.checkValue('boutique', 'price', '12abc', null), { error: 'not-a-number' });
eq('checkValue lowStock whole', B.checkValue('boutique', 'lowStock', '2,5', null), { error: 'not-whole' });
eq('checkValue category unknown', B.checkValue('menu', 'category', 'c9', { categories: new Set(['c1']) }), { error: 'unknown-category' });
eq('checkValue sellable "non"', B.checkValue('menu', 'sellable', 'non', null), { value: false });
eq('checkValue name too long', B.checkValue('menu', 'name', 'x'.repeat(121), null), { error: 'too-long' });
eq('menu has no barcode field', B.checkValue('menu', 'barcode', '123', null), { error: 'unknown-field' });

/* ── money is never rounded in silence ────────────────────────────────── */
eq('« 1,234 » for a price is refused, not stored as 1,23', B.checkValue('boutique', 'price', '1,234'), { error: 'too-many-decimals' });
eq('…a cost too', B.checkValue('boutique', 'cost', '0,125'), { error: 'too-many-decimals' });
eq('spreadsheet float noise is still two decimals', B.checkValue('boutique', 'price', 19.990000000000002), { value: 19.99 });
eq('« 1 234 » is a thousand', B.checkValue('boutique', 'price', '1 234'), { value: 1234 });
eq('a 90 % move and a price under cost are both asked about', B.riskyChanges([
  { id: 'a', set: { price: 1.23 } }, { id: 'b', set: { price: 50 } }, { id: 'c', set: { cost: 80 } }, { id: 'd', set: { price: 110 } },
], [{ id: 'a', price: 1200, cost: 600 }, { id: 'b', price: 60, cost: 55 }, { id: 'c', price: 70, cost: 30 }, { id: 'd', price: 100, cost: 40 }]).map((x) => [x.id, x.code]),
[['a', 'big-change'], ['b', 'below-cost'], ['c', 'below-cost']]);

/* ── shelf endings, the 10 MAD step and the margin guard ──────────────── */
eq('endings ,90 ,99 and « ends in 9 »', [B.endTo(123.4, '90', 'nearest'), B.endTo(123.4, '99', 'up'), B.endTo(123.4, '9', 'nearest'), B.endTo(124.5, '9', 'down')], [123.9, 123.99, 119, 119]);
eq('10 MAD step', B.roundTo(143, 10, 'nearest'), 140);
eq('a re-price can end in ,90', B.reprice([{ id: 'a', name: 'A', price: 100 }], { basis: 'price', op: 'pct', value: 7, ending: '90', mode: 'up' }).rows[0].next, 107.9);
const cheap = B.reprice([{ id: 'a', name: 'A', price: 8, cost: 7 }, { id: 'b', name: 'B', price: 100, cost: 80 }], { basis: 'cost', op: 'pct', value: -50, step: 1, mode: 'nearest' });
eq('cost −50 % is flagged under cost, never hidden', [cheap.rows.map((r) => [r.next, r.flag]), cheap.flagged['below-cost']], [[[4, 'below-cost'], [40, 'below-cost']], 2]);
const guarded = B.reprice([{ id: 'a', name: 'A', price: 8, cost: 7 }], { basis: 'cost', op: 'pct', value: -50, step: 1, mode: 'nearest', minMargin: 20 });
eq('a minimum margin lifts the price to keep it (rounded up)', [guarded.rows[0].next, guarded.rows[0].lifted, guarded.rows[0].flag], [9, true, '']);
eq('a thin margin is flagged', B.reprice([{ id: 'a', name: 'A', price: 10, cost: 9 }], { basis: 'price', op: 'amt', value: 0.5, step: 0, mode: 'nearest' }).rows[0].flag, 'low-margin');

/* ── rounding never works against the operation (cafés: 3 to 15 MAD) ─── */
const cafe3 = [{ id: 'e', name: 'Eau', price: 4 }, { id: 't', name: 'Thé', price: 15 }, { id: 'j', name: 'Tajine', price: 70 }];
const run = (value, ending, mode) => {
  const out = B.reprice(cafe3, { basis: 'price', op: 'pct', value, step: ending ? 0 : 1, ending, mode });
  return out.rows.map((r) => r.id + ':' + r.next + (r.flag ? '!' + r.flag : '')).concat(Object.entries(out.skipped).filter(([, n]) => n).map(([k, n]) => k + '×' + n)).join(' ');
};
eq('+5 %, ends in 9, nearest: up the scale, flagged when it overshoots (never 70 → 69, never 4 → 9)', run(5, '9', 'nearest'), 'e:4.9!over-rounded t:19!over-rounded j:79!over-rounded');
eq('+5 %, ends in 9, up', run(5, '9', 'up'), 'e:4.9!over-rounded t:19!over-rounded j:79!over-rounded');
eq('+5 %, ends in 9, down: every row would fall, so none moves', run(5, '9', 'down'), 'against×3');
eq('+5 %, ,90 nearest', run(5, '90', 'nearest'), 'e:4.9!over-rounded t:15.9 j:73.9');
eq('+5 %, ,90 down', run(5, '90', 'down'), 'j:72.9 against×2');
eq('+5 %, ,99 nearest', run(5, '99', 'nearest'), 'e:4.99!over-rounded t:15.99 j:73.99');
eq('+5 %, ,99 down', run(5, '99', 'down'), 'j:72.99 against×2');
eq('+5 %, 1 MAD nearest', run(5, '', 'nearest'), 't:16 j:74 same×1');
eq('+5 %, 1 MAD up', run(5, '', 'up'), 'e:5!over-rounded t:16 j:74');
eq('−5 %, ends in 9, nearest: 15 goes to 9, not up to 19', run(-5, '9', 'nearest'), 'e:3.9 t:9!over-rounded j:69');
eq('−5 %, ends in 9, up', run(-5, '9', 'up'), 'e:3.9 j:69 against×1');
eq('−5 %, ends in 9, down', run(-5, '9', 'down'), 'e:2.9!over-rounded t:9!over-rounded j:59!over-rounded');
eq('−5 %, ,90 nearest', run(-5, '90', 'nearest'), 'e:3.9 t:13.9 j:66.9');
eq('−5 %, ,90 up', run(-5, '90', 'up'), 'e:3.9 t:14.9 j:66.9');
eq('−5 %, ,99 nearest', run(-5, '99', 'nearest'), 'e:3.99 t:13.99 j:66.99');
eq('−5 %, 1 MAD down', run(-5, '', 'down'), 'e:3!over-rounded t:14 j:66');
eq('an ending finer than nothing: under 1 MAD the row is skipped and counted', B.reprice([{ id: 'x', name: 'Sucre', price: 0.5 }], { basis: 'price', op: 'pct', value: 10, ending: '90', mode: 'nearest' }).skipped['too-small'], 1);
eq('the preview knows what rounding did', (({ requested, delta, rounded }) => [requested, delta, rounded])(B.reprice(cafe3, { basis: 'price', op: 'pct', value: 5, ending: '9', mode: 'nearest' }).rows[2]), [3.5, 9, true]);
{
  let wrong = 0, unflagged = 0, n = 0;
  for (let p = 1; p <= 400; p += 0.75) for (const value of [-30, -10, -5, -2, 2, 5, 10, 30]) for (const ending of ['', '9', '90', '99']) for (const mode of ['nearest', 'up', 'down']) for (const step of [0.5, 1, 5, 10]) {
    if (ending && step !== 1) continue;
    const res = B.repriceOne({ price: p }, { basis: 'price', op: 'pct', value, step, ending, mode });
    if (res.skip) continue;
    n++;
    if (Math.sign(res.next - p) !== Math.sign(value)) wrong++;
    if (Math.abs(res.next - p) > 2 * Math.abs(res.requested) + 1e-9 && res.flag !== 'over-rounded') unflagged++;
  }
  eq(`over ${n} prices × rules: none moves against the operation, every overshoot is flagged`, [wrong, unflagged], [0, 0]);
}

/* ── CSV formulas never reach a spreadsheet live ──────────────────────── */
eq('formula-like text is neutralised, numbers are not', [B.safeCell('=HYPERLINK("x")'), B.safeCell('@cmd'), B.safeCell('+33'), B.safeCell('-20% promo'), B.safeCell(-5), B.safeCell('-5'), B.safeCell('Thé')], ["'=HYPERLINK(\"x\")", "'@cmd", "'+33", "'-20% promo", '-5', '-5', 'Thé']);
eq('a CSV written by someone else is neutralised with its own delimiter', B.safeCsv('nom;prix\n=1+1;12,5\n'), "nom;prix\r\n'=1+1;12,5");
eq('the importer takes the apostrophe off again', [B.restoreCell("'=1+1"), B.restoreCell("l'atelier"), B.restoreCell(12)], ['=1+1', "l'atelier", 12]);

/* ── TSV clipboard ────────────────────────────────────────────────────── */
eq('TSV from Excel with a quoted newline', B.parseTsv('A\t"b\nc"\t3\r\nD\tE\t4\r\n'), [['A', 'b\nc', '3'], ['D', 'E', '4']]);
eq('TSV round trip', B.parseTsv(B.toTsv([['x\ty', 'q"'], ['1', '']])), [['x\ty', 'q"'], ['1', '']]);
eq('CSV with semicolons', B.parseCsv('nom;prix\nThé;12,5\n'), [['nom', 'prix'], ['Thé', '12,5']]);

/* ── .xlsx round trip ─────────────────────────────────────────────────── */
const sheet = [
  ['ID Kiwi', 'Nom*', 'Prix de vente*', 'En vente'],
  ['p1', 'Jean « 501 » & co <slim>', 299.5, true],
  ['p2', 'قفطان', 1200, false],
  ['', 'Ligne\navec retour', 0, ''],
];
const bytes = X.write(sheet, { sheet: 'Inventaire' });
ok('xlsx is a zip', bytes[0] === 0x50 && bytes[1] === 0x4b);
const back = await X.read(bytes);
eq('xlsx round trip: same cells', back.rows, [sheet[0], sheet[1], sheet[2], ['', 'Ligne\navec retour', 0]]);
eq('xlsx round trip: sheet name', back.sheet, 'Inventaire');
eq('xlsx writes the same bytes twice', Buffer.from(X.write(sheet)).equals(Buffer.from(X.write(sheet))), true);
eq('column names', [X._colName(0), X._colName(25), X._colName(26), X._colName(701)], ['A', 'Z', 'AA', 'ZZ']);

/* A file as Excel saves it: DEFLATED entries, shared strings with a rich-text
   run, a gap in the row, a namespace prefix and a formula string. */
async function deflate(text) {
  const s = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function zipDeflated(files) {
  const enc = new TextEncoder(); const parts = [], central = []; let offset = 0;
  for (const f of files) {
    const nb = enc.encode(f.name);
    const h = Buffer.alloc(30 + nb.length);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(X._crc32(f.raw), 14); h.writeUInt32LE(f.data.length, 18); h.writeUInt32LE(f.raw.length, 22); h.writeUInt16LE(nb.length, 26); Buffer.from(nb).copy(h, 30);
    const c = Buffer.alloc(46 + nb.length);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(X._crc32(f.raw), 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(offset, 42); Buffer.from(nb).copy(c, 46);
    parts.push(h, Buffer.from(f.data)); central.push(c); offset += h.length + f.data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const xmlFiles = {
  'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="x" xmlns:r="r"><sheets><sheet name="Feuil1" sheetId="1" r:id="rId7"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId7" Type="t" Target="/xl/worksheets/data.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Nom</t></si><si><r><t>Thé </t></r><r><rPr><b/></rPr><t xml:space="preserve">à la menthe</t></r></si><si><t>Prix &amp; TVA</t></si></sst>',
  'xl/worksheets/data.xml': '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="C1" t="s"><x:v>2</x:v></x:c></x:row>'
    + '<x:row r="3"><x:c r="A3" t="s"><x:v>1</x:v></x:c><x:c r="B3" t="str"><x:f>A3</x:f><x:v>calc</x:v></x:c><x:c r="C3"><x:v>12.5</x:v></x:c><x:c r="D3" t="b"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>',
};
const enc = new TextEncoder();
const zipped = zipDeflated(await Promise.all(Object.entries(xmlFiles).map(async ([name, text]) => ({ name, raw: enc.encode(text), data: await deflate(text) }))));
const excel = await X.read(zipped);
eq('deflated Excel file: shared strings, rich text, gaps, prefixes', excel.rows, [['Nom', '', 'Prix & TVA'], [], ['Thé à la menthe', 'calc', 12.5, true]]);
let notZip = '';
try { await X.read(new TextEncoder().encode('nom,prix\n')); } catch (e) { notZip = e.message; }
eq('a CSV given as xlsx is refused', notZip, 'not-a-zip');

/* Hostile workbooks. Each must fail fast, with its own reason, never by
   inflating gigabytes or allocating a 300-million-row array. */
const sheetFiles = (sheet) => ({ 'xl/workbook.xml': xmlFiles['xl/workbook.xml'], 'xl/_rels/workbook.xml.rels': xmlFiles['xl/_rels/workbook.xml.rels'], 'xl/worksheets/data.xml': sheet });
const build = async (files, lie) => zipDeflated(await Promise.all(Object.entries(files).map(async ([name, text]) => {
  const raw = enc.encode(text);
  return { name, raw: lie && name.includes('worksheets') ? raw.subarray(0, 64) : raw, data: await deflate(text) };
})));
const reason = async (bytes, opts) => { const t = Date.now(); try { await X.read(bytes, opts); return ['read', Date.now() - t]; } catch (e) { return [e.message, Date.now() - t]; } };
const bombXml = '<worksheet><sheetData>' + ' '.repeat(4 * 1024 * 1024) + '</sheetData></worksheet>';
const bomb = await build(sheetFiles(bombXml));
ok('a 4 MB expansion is a small file (the bomb shape)', bomb.length < 40000, bomb.length);
eq('declared sizes over the budget: refused before inflating', (await reason(bomb, { bytes: 1024 * 1024 }))[0], 'too-big');
const liar = await build(sheetFiles(bombXml), true);
eq('sizes that lie: the stream is cut at the budget', (await reason(liar, { bytes: 1024 * 1024 }))[0], 'too-big');
let [why, ms] = await reason(await build(sheetFiles('<worksheet><sheetData><row r="300000000"><c r="A300000000" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>')));
ok('row 300 000 000 is refused in well under a second', why === 'too-many-rows' && ms < 1000, [why, ms]);
[why, ms] = await reason(await build(sheetFiles('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nom</t></is></c><c r="XFD1" t="inlineStr"><is><t>far</t></is></c></row><row r="1048576" s="3"/></sheetData></worksheet>')));
const tidy = await X.read(await build(sheetFiles('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nom</t></is></c><c r="XFD1" t="inlineStr"><is><t>far</t></is></c></row><row r="1048576" s="3"/></sheetData></worksheet>')));
eq('an empty formatted last row and a far column are dropped, not allocated', tidy.rows, [['Nom']]);
eq('the default budget is 30 MB, 5 000 rows, 64 columns', [X.LIMITS.bytes, X.LIMITS.rows, X.LIMITS.cols], [30 * 1024 * 1024, 5001, 64]);

/* ── import analysis ──────────────────────────────────────────────────── */
const existing = [
  { id: 'p1', name: 'Jean 501', sku: 'J501', barcode: '6111000000017', price: 299, cost: 120, lowStock: 2, category: 'c1', sellable: true },
  { id: 'p2', name: 'Veste lin', sku: '', barcode: '', price: 450, cost: 0, lowStock: 0, category: 'c1', sellable: true, multi: true },
];
const imp = B.analyseImport([
  ['ID Kiwi', 'Nom*', 'SKU', 'Code-barres', 'Prix de vente*', 'Catégorie'],
  ['p1', 'Jean 501', 'J501', '6111000000017', '299', 'Pantalons'],
  ['', 'Jean 501', '', '', '319', 'Pantalons'],
  ['', 'Chemise', 'CH1', '', 'douze', 'Chemises'],
  ['', 'Short', 'CH1', '', '150', ''],
  ['', '', '', '', '20', ''],
  ['', 'Ceinture', '', '6111000000017', '90', ''],
  ['', 'Bob', '', '', '80', ''],
  ['p2', 'Veste lin', '', '6111000000999', '450', 'Pantalons'],
], { kind: 'boutique', categories: [{ id: 'c1', name: 'Pantalons' }], existing });
const st = imp.rows.map((r) => [r.line, r.status, r.errors]);
eq('import: two lines on the same article are both refused', [st[0][1], st[0][2].name, st[1][2].name], ['error', 'duplicate', 'duplicate']);
eq('import: not a number + unknown category', st[2][2], { price: 'not-a-number', category: 'unknown-category', sku: 'duplicate' });
eq('import: same SKU twice in the file', st[3][2].sku, 'duplicate');
eq('import: name required', st[4][2].name, 'required');
eq('import: a new article with a code already used', st[5][2].barcode, 'duplicate');
eq('import: a clean new line', [st[6][1], st[6][2]], ['new', {}]);
eq('import: barcode on a multi-variant article', st[7][2].barcode, 'multi-variant');
const imp2 = B.analyseImport([['Nom', 'Prix'], ['Jean 501', '299'], ['Veste lin', '460']], { kind: 'boutique', categories: [], existing });
eq('import: unchanged and updated', imp2.rows.map((r) => r.status), ['unchanged', 'updated']);
eq('import: counts', imp2.counts, { new: 0, updated: 1, unchanged: 1, error: 0 });
eq('import: no name column', B.analyseImport([['prix'], ['3']], { kind: 'menu', existing: [] }).error, 'no-name-column');

/* ── the batch route on a real schema ─────────────────────────────────── */
const AUTH_SECRET = 'catalog-bulk-secret-0123456789abcd';
const now = Date.now();
const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8'));
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-s','o@santos.test','Santos Store','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-x','o@other.test','Other Shop','s','h',?,'active')`).run(now);
db.prepare(`INSERT INTO accounts (id,email,business,salt,hash,created_ts,status) VALUES ('acc-c','o@cafe.test','Cafe Riad','s','h',?,'active')`).run(now);
const shop = (merchant, account, type) => db.prepare(
  `INSERT INTO merchant_config (merchant,features,type,account_id,name,status,till_epoch,updated_ts) VALUES (?,'{}',?,?,?,'active',0,?)`,
).run(merchant, type, account, merchant, now);
shop('santos-store', 'acc-s', 'boutique');
shop('other-shop', 'acc-x', 'boutique');
shop('cafe-riad', 'acc-c', 'cafe');
const env = { AUTH_SECRET, DB: {
  prepare(q) {
    const s = db.prepare(q);
    return { bind(...p) { return {
      async first() { const row = s.get(...p); return row === undefined ? null : row; },
      async all() { return { results: s.all(...p) }; },
      async run() { const r = s.run(...p); return { meta: { changes: r.changes }, success: true }; },
    }; } };
  },
  async batch(stmts) {
    db.exec('BEGIN');
    try { const out = []; for (const st2 of stmts) out.push(await st2.run()); db.exec('COMMIT'); return out; }
    catch (error) { try { db.exec('ROLLBACK'); } catch (_) {} throw error; }
  },
} };
const cookieOf = async (aid) => sessionCookie(await makeSession(aid, AUTH_SECRET)).split(';')[0];
const owner = await cookieOf('acc-s'), stranger = await cookieOf('acc-x'), cafe = await cookieOf('acc-c');
const till = `kiwi_till=${await tillToken(AUTH_SECRET, 'santos-store')}`;
const post = async (body, cookie = owner) => {
  const res = await batchPost({ request: new Request('https://k/api/catalog/batch', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'CF-Connecting-IP': '10.0.0.9' }, body: JSON.stringify(body) }), env, waitUntil() {} });
  return { status: res.status, body: await res.json() };
};
const T0 = now - 86400000;
const doc = (name) => ({
  v: 1, seq: 3, removed: {}, moves: [],
  categories: [{ id: 'c1', name: 'Pantalons', color: 'atlas', order: 0, metaAt: T0 }, { id: 'c2', name: 'Vestes', color: 'riad', order: 1, metaAt: T0 }],
  products: [
    { id: 'p1', name, categoryId: 'c1', priceMAD: 299, cost: 120, sku: 'J501', metaAt: T0, createdAt: T0 },
    { id: 'p2', name: 'Veste lin', categoryId: 'c2', priceMAD: 450, cost: 200, sku: '', metaAt: T0, createdAt: T0 },
    { id: 'p3', name: 'Short', categoryId: 'c1', priceMAD: 150, cost: 60, sku: 'SH1', metaAt: T0, createdAt: T0 },
  ],
  variants: [
    { id: 'v1', productId: 'p1', colorId: 'bleu', size: '32', base: 4, baseAt: T0, stock: 4, metaAt: T0, barcodes: [{ code: '2000000000015', type: 'ean13', primary: true, at: T0 }] },
    { id: 'v2a', productId: 'p2', colorId: 'noir', size: 'M', base: 1, baseAt: T0, stock: 1, metaAt: T0, barcodes: [] },
    { id: 'v2b', productId: 'p2', colorId: 'noir', size: 'L', base: 1, baseAt: T0, stock: 1, metaAt: T0, barcodes: [] },
    { id: 'v3', productId: 'p3', colorId: 'beige', size: 'U', base: 2, baseAt: T0, stock: 2, metaAt: T0, barcodes: [{ code: '6111000000017', type: 'imported', primary: true, at: T0 }] },
  ],
});
const put = (m, data, rev = 5) => db.prepare('INSERT OR REPLACE INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)').run(m, JSON.stringify(data), rev, now);
const row = (m) => { const r = db.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').get(m); return { rev: r.rev, data: JSON.parse(r.data) }; };
const prod = (d, id) => d.products.find((p) => p.id === id);
const vari = (d, id) => d.variants.find((v) => v.id === id);
put('santos-store', doc('Jean 501'));
put('other-shop', doc('Jean de quelqu’un d’autre'));

let r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { price: 319 }, was: { price: 299 } }] }, till);
eq('a paired till cannot bulk re-price', r.status, 401);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { price: 1 } }] }, stranger);
eq('another account is refused on this store', r.status, 401);
eq('…and nothing moved', prod(row('santos-store').data, 'p1').priceMAD, 299);
r = await post({ kind: 'boutique', merchant: 'other-shop', rows: [{ id: 'p1', set: { price: 1 } }] });
eq('the owner cannot write another merchant’s store', r.status, 401);
eq('…whose catalogue is untouched', prod(row('other-shop').data, 'p1').priceMAD, 299);

r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [
  { id: 'p1', set: { price: 319, lowStock: 3 }, was: { price: 299, lowStock: 0 } },
  { id: 'p2', set: { price: 'abc' }, was: { price: 450 } },
  { id: 'nope', set: { price: 10 } },
] });
eq('a bad row refuses the whole batch', [r.status, r.body.error, r.body.issues.map((i) => i.code).sort()], [422, 'invalid', ['not-a-number', 'not-found']]);
eq('…all or nothing', [row('santos-store').rev, prod(row('santos-store').data, 'p1').priceMAD], [5, 299]);

const batch1 = { kind: 'boutique', merchant: 'santos-store', opId: 'op-1', rows: [
  { id: 'p1', set: { price: 319, lowStock: 3, sellable: true }, was: { price: 299, lowStock: 0, sellable: true } },
  { id: 'p2', set: { price: 470, category: 'c1', sellable: false }, was: { price: 450, category: 'c2', sellable: true } },
] };
r = await post(batch1);
eq('the batch saves the changed rows', [r.status, r.body.updated, r.body.rev], [200, 2, 6]);
let saved = row('santos-store').data;
eq('prices, alert, category, archive stored', [prod(saved, 'p1').priceMAD, prod(saved, 'p1').reorderLevel, prod(saved, 'p2').priceMAD, prod(saved, 'p2').categoryId, prod(saved, 'p2').archived], [319, 3, 470, 'c1', true]);
ok('the touched record carries a newer clock', prod(saved, 'p1').metaAt > T0 && prod(saved, 'p3').metaAt === T0);
eq('stock never moves', saved.variants.map((v) => v.stock), [4, 1, 1, 2]);
r = await post(batch1);
eq('the same request again is idempotent: no write', [r.status, r.body.updated, r.body.unchanged, row('santos-store').rev], [200, 0, 2, 6]);

r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p3', set: { price: 160 }, was: { price: 140 } }] });
eq('a value changed elsewhere since the grid loaded is a conflict', [r.status, r.body.error, r.body.conflicts], [409, 'conflict', [{ id: 'p3', field: 'price', current: 150 }]]);
eq('…and is not written', prod(row('santos-store').data, 'p3').priceMAD, 150);

r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p3', set: { sku: 'j-501' }, was: { sku: 'SH1' } }] });
eq('a SKU another article holds (case, dashes ignored) is refused', [r.status, r.body.issues[0]], [422, { id: 'p3', field: 'sku', code: 'duplicate' }]);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { barcode: '6111000000017' }, was: { barcode: '2000000000015' } }] });
eq('a barcode another article holds is refused', [r.status, r.body.issues[0].code], [422, 'duplicate']);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p2', set: { barcode: '6111000000555' }, was: { barcode: '' } }] });
eq('a barcode on a multi-variant article is refused', r.body.issues && r.body.issues[0].code, 'multi-variant');
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { barcode: '6111000000888' }, was: { barcode: '2000000000015' } }] });
saved = row('santos-store').data;
eq('a new label code becomes primary, the Kiwi code stays as alias', vari(saved, 'v1').barcodes.map((b) => [b.code, b.primary]), [['6111000000888', true], ['2000000000015', false]]);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p3', set: { barcode: '6111000000024' }, was: { barcode: '6111000000017' } }] });
saved = row('santos-store').data;
eq('a corrected typed code retires the old one', [vari(saved, 'v3').barcodes.map((b) => b.code), Object.keys(vari(saved, 'v3').barcodeRemoved)], [['6111000000024'], ['6111000000017']]);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { category: 'c9' } }] });
eq('an unknown category is refused', r.body.issues && r.body.issues[0].code, 'unknown-category');
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { stock: 99 } }] });
eq('a field outside the grid is refused', [r.status, r.body.error], [400, 'unknown-field']);
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { price: 1 } }, { id: 'p1', set: { price: 2 } }] });
eq('the same row twice is refused', r.body.error, 'duplicate-row');

r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { price: '1,234' }, was: { price: 319 } }] });
eq('three decimals on money are refused by the server too', [r.status, r.body.issues && r.body.issues[0].code], [422, 'too-many-decimals']);

/* Employees and managers work at the till; bulk edits are the owner's. */
const empCookie = async (staffId) => employeeCookie(await employeeToken(AUTH_SECRET, { merchant: 'santos-store', staffId })).split(';')[0];
db.prepare(`INSERT OR REPLACE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES ('santos-store', 'team', ?, 1, ?)`).run(JSON.stringify({ members: [{ id: 'emp-1', name: 'Caissière', role: 'cashier' }, { id: 'emp-2', name: 'Gérant', role: 'manager' }] }), now);
const revBefore = row('santos-store').rev;
for (const [who, cookie] of [['an employee', await empCookie('emp-1')], ['a manager', await empCookie('emp-2')], ['a manager at a paired till', (await empCookie('emp-2')) + '; ' + till]]) {
  r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p1', set: { price: 1 }, was: { price: 319 } }] }, cookie);
  eq(who + ' cannot bulk edit', r.status, 401);
}
eq('…and nothing was written', row('santos-store').rev, revBefore);

/* A sale lands between the route's read and its write: the compare-and-swap
   loses, the route reads again and writes on top of the sale. */
let race = null;
const realPrepare = env.DB.prepare;
env.DB.prepare = (q) => {
  const st = realPrepare(q);
  if (!race || !/^SELECT data, rev FROM catalogs/.test(q)) return st;
  return { bind(...p) { const b = st.bind(...p); return { ...b, async first() { const got = await b.first(); const fn = race; race = null; if (fn) fn(); return got; } }; } };
};
race = () => {
  const cur = row('santos-store');
  const v3 = vari(cur.data, 'v3'); v3.base = 1; v3.stock = 1; v3.baseAt = Date.now(); v3.metaAt = Date.now();
  prod(cur.data, 'p2').name = 'Veste lin (dernière)'; prod(cur.data, 'p2').metaAt = Date.now();
  put('santos-store', cur.data, cur.rev + 1);
};
const revRace = row('santos-store').rev;
r = await post({ kind: 'boutique', merchant: 'santos-store', rows: [{ id: 'p3', set: { price: 165 }, was: { price: 150 } }] });
saved = row('santos-store').data;
eq('the write that lost the race retries and lands', [r.status, r.body.rev, prod(saved, 'p3').priceMAD], [200, revRace + 2, 165]);
eq('…on top of the sale and the other edit, both kept', [vari(saved, 'v3').stock, prod(saved, 'p2').name], [1, 'Veste lin (dernière)']);
env.DB.prepare = realPrepare;

/* A split catalogue (over 1.5 MB: products and variants in catalog_parts). */
shop('big-shop', 'acc-s', 'boutique');
const big = { v: 1, seq: 1, removed: {}, moves: [], categories: [{ id: 'c1', name: 'Tout', color: 'atlas', order: 0, metaAt: T0 }], products: [], variants: [] };
for (let i = 0; i < 4200; i++) {
  big.products.push({ id: 'b' + i, name: 'Article ' + i + ' ' + 'x'.repeat(100), categoryId: 'c1', priceMAD: 100 + i, cost: 50, sku: 'B' + i, metaAt: T0, createdAt: T0 });
  big.variants.push({ id: 'bv' + i, productId: 'b' + i, colorId: 'noir', size: 'U', base: 3, baseAt: T0, stock: 3, metaAt: T0, barcodes: [{ code: String(2000000000000 + i), type: 'ean13', primary: true, at: T0 }] });
}
const packed = packCatalog(big);
db.prepare('INSERT INTO catalogs (merchant,data,rev,updated_ts) VALUES (?,?,?,?)').run('big-shop', '{}', 1, now);
await runCatalogWrite(env.DB, 'big-shop', packed, env.DB.prepare('UPDATE catalogs SET data = ?, rev = ? WHERE merchant = ?').bind(packed.head, 2, 'big-shop'), false);
ok('the fixture is really split', packed.parts.length > 1, packed.parts.length);
r = await post({ kind: 'boutique', merchant: 'big-shop', rows: [{ id: 'b2400', set: { price: 999 }, was: { price: 2500 } }, { id: 'b7', set: { name: 'Article sept' }, was: { name: big.products[7].name } }] });
const bigRow = await loadParts(env.DB, 'big-shop', db.prepare('SELECT data, rev FROM catalogs WHERE merchant = ?').get('big-shop'));
const bigDoc = JSON.parse(bigRow.data);
eq('a split catalogue is edited in place', [r.status, r.body.updated, bigRow.split, bigRow.rev], [200, 2, true, 3]);
eq('…every article and variant still there, the edits in', [bigDoc.products.length, bigDoc.variants.length, prod(bigDoc, 'b2400').priceMAD, prod(bigDoc, 'b7').name, prod(bigDoc, 'b4199').priceMAD], [4200, 4200, 999, 'Article sept', 4299]);
eq('…and only the current generation of parts remains', db.prepare('SELECT COUNT(DISTINCT gen) AS n FROM catalog_parts WHERE merchant = ?').get('big-shop').n, 1);

/* The carte of a restaurant. */
const menu = { cats: [{ id: 'cat1', name: 'Tajines', sub: [] }, { id: 'cat2', name: 'Boissons', sub: [] }],
  items: [{ id: 'it1', name: 'Tajine kefta', price: 65, catId: 'cat1', avail: true }, { id: 'it2', name: 'Thé', price: 12, catId: 'cat2', avail: true },
    { id: 'it3', name: 'Ancien plat', price: 50, catId: 'cat1', archived: true }] };
db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)').run('cafe-riad', 'Cafe Riad', 'cafe', JSON.stringify(menu), now - 1000);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 70 } }] });
eq('another merchant cannot write this carte', r.status, 401);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it3', set: { price: 70 } }] }, cafe);
eq('an archived dish is not in the grid', r.body.issues && r.body.issues[0].code, 'not-found');
let menuWrites = 0;
const prepMenu = env.DB.prepare;
env.DB.prepare = (q) => { if (/^UPDATE menus/.test(q)) menuWrites++; return prepMenu(q); };
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 68.5, sellable: false }, was: { price: 65, sellable: true } }, { id: 'it2', set: { category: 'cat1' }, was: { category: 'cat2' } }] }, cafe);
env.DB.prepare = prepMenu;
eq('one carte save is exactly one write', menuWrites, 1);
eq('…and answers with the carte it wrote, for the dashboard to adopt', [r.body.menu && r.body.menu.items.find((i) => i.id === 'it1').price, r.body.merchant], [68.5, 'cafe-riad']);
const mrow = db.prepare('SELECT data, updated_ts FROM menus WHERE merchant = ?').get('cafe-riad');
const m2 = JSON.parse(mrow.data);
eq('the carte is re-priced, paused and moved', [r.status, r.body.updated, m2.items[0].price, m2.items[0].avail, m2.items[1].catId], [200, 2, 68.5, false, 'cat1']);
ok('the carte revision moved', mrow.updated_ts > now - 1000 && r.body.updatedTs === mrow.updated_ts);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 68.5 }, was: { price: 65 } }] }, cafe);
eq('a retried carte save writes nothing', [r.status, r.body.updated, db.prepare('SELECT updated_ts FROM menus WHERE merchant = ?').get('cafe-riad').updated_ts], [200, 0, mrow.updated_ts]);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { barcode: '1' } }] }, cafe);
eq('a carte has no barcode column', r.body.error, 'unknown-field');
r = await post({ kind: 'boutique', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 1 } }] }, cafe);
eq('a restaurant has no boutique catalogue to patch', r.status, 409);

/* ── « Fixer à … MAD » is the typed price, never rounded or given an ending ─ */
{
  const cafe4 = [{ id: 'e', price: 4 }, { id: 't', price: 15 }, { id: 'j', price: 70 }, { id: 'n', price: 19 }];
  for (const [ending, step, mode] of [['9', 0, 'nearest'], ['90', 0, 'up'], ['99', 0, 'down'], ['', 5, 'up'], ['', 10, 'down']]) {
    const out = B.reprice(cafe4, { basis: 'price', op: 'set', value: 12, step, ending, mode });
    eq(`set to 12 MAD with ${ending ? 'ending ' + ending : 'step ' + step} ${mode}: every row is 12,00, none flagged`, out.rows.map((r) => [r.id, r.next, r.flag]), [['e', 12, ''], ['t', 12, ''], ['j', 12, ''], ['n', 12, '']]);
  }
  eq('set to 12,35 keeps its centimes', B.repriceOne({ price: 4 }, { basis: 'price', op: 'set', value: 12.35, step: 1, ending: '9', mode: 'up' }).next, 12.35);
}

/* ── « Revoir les prix » does not drop the warning ───────────────────────── */
{
  /* The re-price flagged Eau (4 → 4,90, over-rounded) and Tajine (under cost);
     the merchant chose « Revoir » and later presses a plain « Enregistrer ». */
  const rows = [{ id: 'e', price: 4, cost: 0 }, { id: 't', price: 15, cost: 0 }, { id: 'j', price: 70, cost: 80 }];
  const held = new Map([
    ['e', { id: 'e', code: 'over-rounded', old: 4, next: 4.9, requested: 0.2 }],
    ['j', { id: 'j', code: 'below-cost', old: 70, next: 73.9, cost: 80 }],
  ]);
  const plain = [{ id: 'e', set: { price: 4.9 } }, { id: 't', set: { price: 15.9 } }, { id: 'j', set: { price: 73.9 } }];
  const all = B.riskyChanges(plain, rows).concat(B.heldRisky(plain, rows, held));
  eq('plain save after « Revoir »: the over-rounded row is asked about again, the under-cost row once', all.map((x) => x.id + ':' + x.code).sort(), ['e:over-rounded', 'j:below-cost']);
  eq('a cell typed over since the re-price is judged as a normal edit', B.heldRisky([{ id: 'e', set: { price: '5' } }], rows, held), []);
  eq('a price typed with a comma still matches what the rounding gave', B.heldRisky([{ id: 'e', set: { price: '4,90' } }], rows, held).map((x) => x.code), ['over-rounded']);
  eq('nothing held, nothing added', B.heldRisky(plain, rows, null), []);
  /* The page wires it: the declined re-price save keeps the map and flags the
     cells, the plain save adds heldRisky, a successful save forgets it. */
  const page = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/catalog-bulk/page.js'), 'utf8');
  ok('page: a plain save adds the held re-price warnings', /riskyChanges\(c\.patches, S\.data\.rows\)\.concat\(stillRisky\(c\.patches\)\)/.test(page));
  ok('page: « Revoir » flags the re-priced cells', /S\.repriceRisky\.forEach\(\(x\) => \{ flags\[x\.id\] = \{ price: why\(x\) \}; \}\)/.test(page));
  ok('page: a successful save forgets them', /if \(res\.ok\) \{\s*S\.repriceRisky = null;/.test(page));
}

/* ── the old importer takes the export's apostrophe off too ───────────── */
{
  const win = {}; const box = { window: win, document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ style: {} }) }, console, setTimeout, clearTimeout };
  win.window = win; vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/catalog-import.js'), 'utf8'), box, { filename: 'catalog-import.js' });
  const parsed = win.KiwiCatalogImport.parse(B.safeCsv('produit;prix\n=HYPERLINK("x");12\n-20% robe;8\nl\'atelier;5\n'));
  eq('both import paths agree: « \'=… » comes back as « =… », an apostrophe inside a word stays', parsed.rows.map((r) => r[0]), ['=HYPERLINK("x")', '-20% robe', "l'atelier"]);
}

/* ── the browser side, for real, in a sandbox ─────────────────────────── */
/* The real menu store (assets/menu-catalog.js and its parts) and the real
   assets/pages-pro/catalog-bulk/source.js run together. A store that tells its
   subscribers about every set() is what makes a republish visible here: the
   old path (re-applying the saved values through updateItem) published the
   whole carte again from the old revision. */
const require = createRequire(import.meta.url);
const menuSource = require('./menu-catalog-test-source.cjs').runtimeSource();
const bulkSource = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/catalog-bulk/source.js'), 'utf8');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
function browser({ batchAnswer, priceLists } = {}) {
  const CAFE = { id: 'v-cf', name: 'Amira Café', slug: 'amira-cafe', type: 'restaurant', subtype: 'cafe' };
  const server = { seq: 4, langs: ['fr', 'ar', 'en'], kitchenId: '', stations: [], cats: [{ id: 'cat_1', name: 'Boissons', sub: [] }],
    items: [{ id: 'it_1', name: 'Café', price: 10, catId: 'cat_1', avail: true }, { id: 'it_2', name: 'Thé', price: 12, catId: 'cat_1', avail: true }] };
  const w = { calls: [], mem: Object.create(null), handlers: [], order: [] };
  const subs = [];
  const store = { define() { return {
    get(vid) { const k = vid || CAFE.id; return w.mem[k] || (w.mem[k] = { seq: 0, cats: [], items: [], stations: [], kitchenId: '' }); },
    set(data, vid) { const k = vid || CAFE.id; w.mem[k] = data; subs.forEach((fn) => fn(k)); return data; },
    update(fn, vid) { const k = vid || CAFE.id; const d = this.get(k); const n = fn(d); return this.set(n === undefined ? d : n, k); },
    subscribe(fn) { subs.push(fn); return () => {}; },
    loadExample() {}, clear() {}, isEmpty(vid) { const d = this.get(vid); return !(d.items || []).length; }, hasData(vid) { return !this.isEmpty(vid); },
  }; } };
  const fetchStub = (url, init) => {
    const u = String(url), method = (init && init.method) || 'GET';
    let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) {}
    w.calls.push({ url: u, method, body }); w.order.push(method + ' ' + u.split('?')[0]);
    if (method === 'GET' && u.startsWith('/api/menu')) return Promise.resolve({ ok: true, json: () => Promise.resolve({ merchant: 'amira-cafe', menu: server, updatedTs: 1234 }) });
    if (u === '/api/catalog/batch') { const a = batchAnswer(body); return Promise.resolve({ ok: a.status === 200, status: a.status, json: () => Promise.resolve(a.body) }); }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, updatedTs: 9999 }) });
  };
  const win = {
    KiwiEnv: { isReal: () => true }, KiwiI18n: { getLang: () => 'fr' },
    KiwiConfig: { features: {}, type: 'cafe', loaded: true, storeSlug: () => 'amira-cafe' },
    KiwiVenue: { isCustom: () => true, getCurrentVenueData: () => CAFE, getVenueData: () => CAFE, slugOf: () => 'amira-cafe', subscribe() {}, showMenu() {}, refreshMenu() {} },
    KiwiOrderProPanel: { enabled: () => true },
    Kiwi: { handlers: {}, appPage() {}, toast() {} },
    KiwiBulkRules: B, KiwiStore: store,
    KiwiPriceLists: priceLists,
    addEventListener(evt, fn) { w.handlers.push({ evt, fn }); },
    dispatchEvent(e) { w.handlers.filter((h) => h.evt === e.type).forEach((h) => h.fn(e)); return true; },
  };
  const doc = { readyState: 'loading', documentElement: { lang: 'fr', getAttribute: () => 'fr' }, head: { appendChild() {} },
    body: { classList: { contains: () => false, add() {}, remove() {} }, appendChild() {} }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild() {}, remove() {} }), addEventListener() {}, dispatchEvent() {} };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const ctx = { window: win, document: doc, fetch: fetchStub, console: { warn() {}, log() {}, error() {} }, CustomEvent,
    setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, Math, JSON, String, Number, Object, Array, RegExp, Intl, Map, Set };
  win.window = win; win.document = doc; win.fetch = fetchStub; win.setTimeout = setTimeout; win.CustomEvent = CustomEvent;
  vm.createContext(ctx);
  vm.runInContext(menuSource, ctx, { filename: 'menu-catalog.js' });
  w.handlers.filter((h) => h.evt === 'load').forEach((h) => h.fn());
  vm.runInContext(bulkSource, ctx, { filename: 'source.js' });
  w.win = win; w.server = server;
  w.posts = (p) => w.calls.filter((c) => c.method === 'POST' && c.url.startsWith(p));
  return w;
}
const written = (body) => ({ ...JSON.parse(JSON.stringify(body)) });
{
  /* Control: the old path, one updateItem on a read carte, publishes. If this
     fails the harness can no longer see a republish and the next block proves nothing. */
  const w = browser({ batchAnswer: () => ({ status: 500, body: {} }) });
  await sleep(1400);
  w.win.KiwiMenuStore.updateItem('it_1', { price: 11 });
  await sleep(1100);
  eq('control: a plain edit publishes the carte once, from revision 1234', w.posts('/api/menu').map((c) => c.body.expectedUpdatedTs), [1234]);
}
{
  const w = browser({ batchAnswer: (body) => {
    const menu = written(w.server); menu.items[0].price = body.rows[0].set.price;
    return { status: 200, body: { ok: true, merchant: 'amira-cafe', updatedTs: 5000, updated: 1, unchanged: 0, menu } };
  } });
  await sleep(1400);
  const res = await w.win.KiwiBulkSource.save('menu', [{ id: 'it_1', set: { price: 12.5 }, was: { price: 10 } }], []);
  await sleep(1100);
  eq('one carte save from the sheet is ONE network write', [res.ok, w.posts('/api/catalog/batch').length, w.posts('/api/menu').length], [true, 1, 0]);
  eq('…the store already shows the saved price', w.mem['v-cf'].items.find((i) => i.id === 'it_1').price, 12.5);
  w.win.KiwiMenuStore.updateItem('it_2', { price: 13 });
  await sleep(1100);
  eq('…and the next edit publishes from the new revision, not a stale one', w.posts('/api/menu').map((c) => c.body.expectedUpdatedTs), [5000]);
}
{
  /* Price lists leave only after the batch is written, never before a refusal. */
  const setCalls = [];
  const lists = { list: async () => [], prices: async () => new Map(), setPrices: async (rows) => { setCalls.push(rows); } };
  let answer = { status: 409, body: { error: 'conflict', conflicts: [{ id: 'it_1', field: 'price', current: 11 }] } };
  const w = browser({ batchAnswer: () => answer, priceLists: lists });
  await sleep(1400);
  let res = await w.win.KiwiBulkSource.save('menu', [{ id: 'it_1', set: { price: 12 }, was: { price: 10 } }], [{ listId: 'pl-a', itemId: 'it_1', price: 9.5 }]);
  eq('a refused batch leaves the price lists untouched', [res.ok, !!res.conflicts, setCalls.length], [false, true, 0]);
  answer = { status: 422, body: { error: 'invalid', issues: [{ id: 'it_1', field: 'price', code: 'too-many-decimals' }] } };
  res = await w.win.KiwiBulkSource.save('menu', [{ id: 'it_1', set: { price: '1,234' }, was: { price: 10 } }], [{ listId: 'pl-a', itemId: 'it_1', price: 9.5 }]);
  eq('…an invalid one too', [res.ok, setCalls.length], [false, 0]);
  answer = { status: 200, body: { ok: true, merchant: 'amira-cafe', updatedTs: 6000, updated: 1, unchanged: 0, menu: w.server } };
  w.order.length = 0;
  res = await w.win.KiwiBulkSource.save('menu', [{ id: 'it_1', set: { price: 12 }, was: { price: 10 } }], [{ listId: 'pl-a', itemId: 'it_1', price: 9.5 }]);
  eq('a written batch is followed by its price lists, in centimes', [res.ok, res.lists, setCalls[0]], [true, 1, [{ itemKey: 'it_1', listId: 'pl-a', price: 950 }]]);
  ok('…the batch went first', w.order[0] === 'POST /api/catalog/batch', w.order);
}

{
  /* 0 MAD in a price list: the lists refuse it unless it is marked « offert »
     (feat/inyad-pricelists, zero-price). The sheet asks first, then sends
     free: true; a refusal comes back with its code, never as a bare failure. */
  const setCalls = [];
  const fail = (code) => { const e = new Error(code); e.code = code; return e; };
  const lists = { list: async () => [], prices: async () => new Map(), setPrices: async (rows) => {
    setCalls.push(rows);
    if (rows.some((r) => r.price === 0 && r.free !== true)) throw fail('zero-price');
    return { ok: true, written: rows.length, removed: 0 };
  } };
  const ok200 = { status: 200, body: { ok: true, merchant: 'amira-cafe', updatedTs: 7000, updated: 0, unchanged: 0, menu: null } };
  const w = browser({ batchAnswer: () => ok200, priceLists: lists });
  await sleep(1400);
  let res = await w.win.KiwiBulkSource.save('menu', [], [{ listId: 'pl-a', itemId: 'it_1', price: 0, free: true }, { listId: 'pl-a', itemId: 'it_2', price: 8 }]);
  eq('a confirmed « offert » 0 leaves with free: true, the other row without it', [res.ok, res.lists, setCalls[0]], [true, 2, [{ itemKey: 'it_1', listId: 'pl-a', price: 0, free: true }, { itemKey: 'it_2', listId: 'pl-a', price: 800 }]]);
  res = await w.win.KiwiBulkSource.save('menu', [], [{ listId: 'pl-a', itemId: 'it_1', price: '0' }]);
  eq('an unconfirmed 0 is refused, and the refusal says why', [res.ok, res.listsFailed, res.listsError, setCalls[1]], [true, true, 'zero-price', [{ itemKey: 'it_1', listId: 'pl-a', price: 0 }]]);
  res = await w.win.KiwiBulkSource.save('menu', [], [{ listId: 'pl-a', itemId: 'it_1', price: 9, free: true }]);
  eq('free is only ever sent with a 0', setCalls[2], [{ itemKey: 'it_1', listId: 'pl-a', price: 900 }]);
  /* The page: asks « 0 MAD = offert ? » before the save, a « non » makes the
     cell an error with its reason, and a failed list write flags every list
     cell of that save with the reason instead of one generic toast. */
  const page = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/catalog-bulk/page.js'), 'utf8');
  ok('page: a 0 in a list asks before saving and sends free', /zeros\.length && !opts\.isUndo && !\(await confirmFree\(zeros\)\)/.test(page) && /zeros\.forEach\(\(x\) => \{ x\.free = true; \}\)/.test(page));
  ok('page: « non » turns the cell into a zero-price error shown in the footer', /S\.zeroRefused\.add\(/.test(page) && /n === 0 && S\.zeroRefused && S\.zeroRefused\.has\(row\.id \+ '\|' \+ key\)\) return 'zero-price'/.test(page) && /'zero-price': \(\) => L\('0 MAD refusé comme offert/.test(page));
  ok('page: a list failure flags each list cell with its reason', /c\.lists\.forEach\(\(x\) => \{ \(flags\[x\.itemId\] = flags\[x\.itemId\] \|\| \{\}\)\['pl:' \+ x\.listId\] = why; \}\)/.test(page) && /listWhy\(res\.listsError/.test(page));
  ok('page: the old generic price-list toast is gone', !page.includes('Les tarifs n’ont pas pu être enregistrés'));
  const grid = fs.readFileSync(path.join(ROOT, 'assets/pages-pro/catalog-bulk/grid.js'), 'utf8');
  ok('typing in a refused cell again (even 0) takes the « non » back, so the next save asks again', /o\.onChange\(applied\)/.test(grid) && /applied\.forEach\(\(a\) => S\.zeroRefused\.delete\(a\.id \+ '\|' \+ a\.key\)\)/.test(page));
}

console.log(`catalog-bulk: ${passed} passed, ${fails} failed`);
if (fails) process.exit(1);
