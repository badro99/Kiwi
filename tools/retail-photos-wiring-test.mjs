/* The boutique and Maison tills' wiring to the shared product photos
 * (assets/retail-photos.js). Text only, by design: these are the repository's
 * own shape (an import stamp the offline shell must precache, the icon lists
 * of two product forms, the stylesheets that size the photo, the generation
 * kit). What a product SHOWS is run, not read, in retail-product-art-test.mjs. */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const shipped = fs.readdirSync(new URL('../assets/retail-photos/', import.meta.url)).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
const problems = [];
const need = (cond, msg) => { if (!cond) problems.push(msg); };

/* The generation kit lists exactly the shipped photos. */
const kit = Object.values(JSON.parse(read('tools/dish-photos/retail-sheets.json'))).flat().map((x) => x[0]).sort();
need(JSON.stringify(kit) === JSON.stringify(shipped), 'retail-sheets.json lists exactly the shipped photos');

const sw = read('kiwi-sw.js');
for (const [till, dir] of [['boutique', 'pos-boutique'], ['maison', 'pos-maison']]) {
  const sales = read(`assets/${dir}/sales.js`);
  const at = sales.indexOf('const ICON_KEYS = [');
  const keys = [...sales.slice(at, sales.indexOf('];', at)).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  need(keys.length >= 50, till + ': the picker list was read');
  for (const k of keys) need(shipped.includes(k), `${till}: picker icon ${k} has a photo`);
  need(!/const ART = \{/.test(sales) && !/<svg class="(bq|mz)-art"/.test(sales), till + ': the line-drawing map is gone');
  const stamp = (sales.match(/retail-photos\.js\?v=(\d+)/) || [])[1];
  need(stamp, till + ': imports the photo module with a stamp');
  need(sw.includes('/assets/retail-photos.js?v=' + stamp), till + ': the offline shell precaches the same stamp');
  for (const f of ['sales.js', 'checkout.js', 'inventory.js']) need(!/artOf\([\w.]+\.art\)/.test(read(`assets/${dir}/${f}`)), `${till}/${f} passes the product, not only its icon key`);
  const artOf = sales.slice(sales.indexOf('const artOf'), sales.indexOf('const artOf') + 300);
  need(/p\.photo\s*\?/.test(artOf), till + ': a merchant photo wins over ours');
}
need(/photoImg\(p, 'mz-art-photo', 'tag'[,)]/.test(read('assets/pos-maison/sales.js')), 'the Maison falls back to the price tag, not a hanger');
for (const dir of ['pos-boutique', 'pos-maison']) need(read(`assets/${dir}/sales.js`).includes('artOf(p, ln.color)'), dir + ': a ticket line shows the colour that was sold');
for (const f of ['search.js', 'inv-tools.js']) need(!/artOf\(r\.art\)/.test(read('assets/pos-boutique/' + f)), 'boutique/' + f + ' passes the row');
need(/\.bq-art-photo \{[^}]*object-fit: contain/.test(read('assets/pos-boutique.css')), 'the boutique stylesheet sizes the photo');
need(read('assets/pos-boutique-2027.css').includes('.bq-card-art .bq-art-photo'), 'the 2027 tile sizes the photo like a restaurant dish');
need(/\.mz-art-photo \{[^}]*object-fit: contain/.test(read('assets/pos-maison.css')), 'the Maison stylesheet sizes the photo');

assert.deepEqual(problems, [], problems.join('\n'));
console.log('✓ retail photos wiring: boutique and Maison');
