#!/usr/bin/env node
/* La page QR ne traduit jamais en direct : elle lit les langues publiées,
 * choisit celle du navigateur et résout la carte déjà traduite. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let pass = 0;
const fail = [];
const ok = (cond, label) => { if (cond) pass++; else fail.push(label); };
const html = read('kiwi-order.html');

ok(/assets\/menu-i18n\.js\?v=\d+/.test(html) && /assets\/order-ui-langs\.js\?v=\d+/.test(html), 'la page charge le résolveur et le dictionnaire statique');
ok(/id="lang-picker"[^>]*data-lens-demo><\/div>/.test(html) && /configuredLangs\.map/.test(html), 'le sélecteur est construit depuis la liste publiée');
ok(/payload\.menuLangs === true \? MENU_LANG\.langs\(menu\)/.test(html), 'les langues supplémentaires sont derrière le flag public');
ok(/navigator\.languages/.test(html) && /MENU_LANG\.autoPick/.test(html) && /kiwiOrderLang/.test(html), 'choix navigateur au premier passage puis préférence mémorisée');
ok(/const M = window\.KiwiMenuI18n;[\s\S]*?M\.name\(e, l\)[\s\S]*?M\.desc\(e, l\)/.test(html), 'noms et descriptions passent par KiwiMenuI18n');
ok(!/fetch\([^\n]*menu-translate/.test(html) && !/\/api\/ai\/menu-translate/.test(html), 'aucun appel modèle sur la page client');

const world = {}; world.window = world;
vm.runInNewContext(read('assets/order-ui-langs.js'), world, { filename:'order-ui-langs.js' });
const dict = world.KiwiOrderUiLangs || {};
ok(Object.keys(dict).length === 20, 'dictionnaire statique présent pour les 20 langues supplémentaires');
ok(Object.keys(dict.es || {}).length === 40 && dict['zh-Hans'].cart_title === '您的订单', '40 libellés fixes par langue, dont espagnol et chinois simplifié');
ok(/I18N\[currentLang\]\[key\][\s\S]*I18N\.en\[key\]/.test(html), 'toute clé absente retombe sur l’anglais');

const middleware = read('functions/_middleware.js');
ok(/path === '\/kiwi-order\.html'/.test(middleware) && /path === '\/api\/menu'/.test(middleware), 'page QR et lecture de carte restent publiques');
ok(!/path === '\/api\/ai\/menu-translate'/.test(middleware), 'la traduction AI ne devient pas une route publique');

if (fail.length) {
  fail.forEach((label) => console.log(`  ✗ ${label}`));
  console.log(`\norder-langs-test : ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`✓ langues de la page QR (${pass} contrôles : publication, sélection, repli, frontière publique)`);
