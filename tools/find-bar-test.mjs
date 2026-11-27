/* Find bar (27 nov. 2026) · assets/find-bar.mjs
 * « Search bar needed » (Jon's Burgers) : la grille des prix de livraison, les
 * recettes et la nutrition gagnent une barre de recherche. Cette suite tient la
 * recherche (sans accents, mots dans n'importe quel ordre, une faute permise
 * sur les mots longs) et le balisage que chaque écran pose.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const F = await import(pathToFileURL(path.join(ROOT, 'assets/find-bar.mjs')).href);
let n = 0;
const yes = (q, t) => { assert.equal(F.matches(q, t), true, `« ${q} » trouve « ${t} »`); n++; };
const no = (q, t) => { assert.equal(F.matches(q, t), false, `« ${q} » ne trouve pas « ${t} »`); n++; };

yes('', 'Tacos Indien');
yes('tac', 'Tacos Indien');
yes('TACOS', 'Tacos Indien');
yes('creme brulee', 'Crème brûlée Desserts');
yes('burger chees', 'Cheese burger');
yes('blue indien', 'Tacos Indien Blue Tacos');
yes('tacos marocian', 'Tacos Marocain');
yes('indein', 'Tacos Indien');
yes('bang', 'Tacos Bang-Bang');
yes("jon's", "JON'S BURGERS");
yes('jon’s', "Jon's Burgers");
yes('خبز', 'خبز بلدي');
no('pizza', 'Tacos Indien');
no('miel', 'Tacos Indien');
no('pain', 'Tacos Main');          // pas de faute permise sous cinq lettres
no('tacos pizza', 'Tacos Indien'); // chaque mot doit se trouver

/* Le balisage : une barre par liste longue, chaque ligne cherchable. */
const delivery = read('assets/delivery.js');
assert.match(delivery, /data-find-scope><div class="kdl-find-bar" data-find="delivery-prices"/);
assert.match(delivery, /<tr data-find-row data-find-text=/);
assert.match(delivery, /data-find-group><th colspan=/);
assert.match(delivery, /import\('\/assets\/find-bar\.mjs\?v=\d+'\)/);
assert.doesNotMatch(delivery, /!it\.archived && num\(it\.price\) != null/, 'un plat sans prix en salle reste dans la grille');
const ws = read('assets/restaurant-menu-workspace.js');
assert.match(ws, /findSlot\('recipes',items\.length\)/);
assert.match(ws, /findSlot\('nutrition',list\.length\)/);
assert.equal((ws.match(/data-find-row data-find-text/g) || []).length, 2);
for (const f of ['assets/delivery.js', 'assets/restaurant-menu-workspace.js']) {
  const stamp = read(f).match(/find-bar\.mjs\?v=(\d+)/)[1];
  assert.ok(read('kiwi-sw.js').includes(`'/assets/find-bar.mjs?v=${stamp}'`), f + ' : la barre est en cache hors ligne');
}
n += 12;
console.log(`find-bar: ${n} checks passed`);
