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
 *   · POST /api/catalog/batch on a real schema: owner only (a paired till and a
 *     stranger are refused), another account's store never touched, all or
 *     nothing on a bad row, conflicts refused, a retry writes nothing, the
 *     barcode and SKU uniqueness, and the carte of a restaurant.
 *   node tools/catalog-bulk-test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import(pathToFileURL(path.join(ROOT, 'assets/pages-pro/catalog-bulk/rules.js')).href);
await import(pathToFileURL(path.join(ROOT, 'assets/pages-pro/catalog-bulk/xlsx.js')).href);
const B = globalThis.KiwiBulkRules, X = globalThis.KiwiXlsx;
const { onRequestPost: batchPost } = await import(pathToFileURL(path.join(ROOT, 'functions/api/catalog/batch.js')).href);
const { tillToken, makeSession, sessionCookie } = await import(pathToFileURL(path.join(ROOT, 'functions/auth/_lib.js')).href);

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

/* The carte of a restaurant. */
const menu = { cats: [{ id: 'cat1', name: 'Tajines', sub: [] }, { id: 'cat2', name: 'Boissons', sub: [] }],
  items: [{ id: 'it1', name: 'Tajine kefta', price: 65, catId: 'cat1', avail: true }, { id: 'it2', name: 'Thé', price: 12, catId: 'cat2', avail: true },
    { id: 'it3', name: 'Ancien plat', price: 50, catId: 'cat1', archived: true }] };
db.prepare('INSERT INTO menus (merchant,name,type,data,updated_ts) VALUES (?,?,?,?,?)').run('cafe-riad', 'Cafe Riad', 'cafe', JSON.stringify(menu), now - 1000);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 70 } }] });
eq('another merchant cannot write this carte', r.status, 401);
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it3', set: { price: 70 } }] }, cafe);
eq('an archived dish is not in the grid', r.body.issues && r.body.issues[0].code, 'not-found');
r = await post({ kind: 'menu', merchant: 'cafe-riad', rows: [{ id: 'it1', set: { price: 68.5, sellable: false }, was: { price: 65, sellable: true } }, { id: 'it2', set: { category: 'cat1' }, was: { category: 'cat2' } }] }, cafe);
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

console.log(`catalog-bulk: ${passed} passed, ${fails} failed`);
if (fails) process.exit(1);
