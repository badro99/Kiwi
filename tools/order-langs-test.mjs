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
/* La page QR est OrderPro depuis l'étape 3c (kiwi-order.html y redirige) ;
   sa logique de langues vit dans assets/orderpro-menu.js. */
const html = read('OrderPro.html');
const om = read('assets/orderpro-menu.js');

ok(/data-lazy="menu-i18n" src="assets\/menu-i18n\.js\?v=\d+"/.test(html) && /data-lazy="ui-langs" src="assets\/order-ui-langs\.js\?v=\d+"/.test(html), 'la page charge à la demande le résolveur et le dictionnaire statique');
ok(/id="lang-picker"/.test(html) && /OM\.picker\(currentLang\)/.test(html) && /function picker\(current\)[\s\S]*?var order = list\.slice\(\)/.test(om), 'le sélecteur est construit depuis la liste publiée');
ok(/res\.menuLangs === true && menu && Array\.isArray\(menu\.langs\)/.test(om), 'les langues supplémentaires sont derrière le flag public');
ok(/navigator\.languages/.test(om) && /m\.autoPick\(list, nav\)/.test(om) && /localStorage\.setItem\('orderProLang', lang\)/.test(html) && /localStorage\.getItem\('kiwiOrderLang'\)/.test(html), 'choix navigateur au premier passage puis préférence mémorisée (l’ancienne clé reste lue)');
ok(/function tr\(e, l\) \{[\s\S]*?m\.name\(e, l\), desc: m\.desc\(e, l\)/.test(om), 'noms et descriptions passent par KiwiMenuI18n');
ok(![html, om].some((src) => /fetch\([^\n]*menu-translate/.test(src) || /\/api\/ai\/menu-translate/.test(src)), 'aucun appel modèle sur la page client');

const world = {}; world.window = world;
vm.runInNewContext(read('assets/order-ui-langs.js'), world, { filename:'order-ui-langs.js' });
const dict = world.KiwiOrderUiLangs || {};
ok(Object.keys(dict).length === 20, 'dictionnaire statique présent pour les 20 langues supplémentaires');
ok(Object.keys(dict.es || {}).length === 40 && dict['zh-Hans'].cart_title === '您的订单', '40 libellés fixes par langue, dont espagnol et chinois simplifié');
ok(/\(I18N\[currentLang\] && I18N\[currentLang\]\[key\]\) \?\? \(extra \? I18N\.en\[key\] : undefined\)/.test(html) && /Object\.assign\(\{\}, I18N\.en, extra\[l\]\)/.test(om), 'toute clé absente retombe sur l’anglais');

for (const [lang, label] of [['fr', 'Valeurs nutritionnelles'], ['en', 'Nutrition facts'], ['ar', 'القيم الغذائية']]) {
  ok(om.includes(`nutrition_title: '${label}'`), `titre nutrition présent en ${lang}`);
}
ok(/function nutritionSummary\(item, t\) \{\s*var n = item && item\.nutrition;\s*if \(!n\) return '';/.test(om), 'aucune ligne nutrition n’est rendue sans données');
ok(/function nutritionSummary\(item, t\)[\s\S]*?<bdi dir="ltr">[\s\S]*?function nutritionDetail/.test(om), 'les nombres de la carte sont isolés du RTL');
ok(/function nutritionDetail\(item, t\)[\s\S]*nutrient_energy[\s\S]*nutrient_salt[\s\S]*nutrition_indicative/.test(om), 'le détail porte les six valeurs et la mention hors options');
ok(/it\.nutritionComplete === true && it\.nutrition/.test(html), 'seules les valeurs complètes entrent dans le modèle client');
ok(/if \(item && \(\(item\.options && item\.options\.length > 0\) \|\| item\.nutrition\)\)\s*\{\s*openCustomizer\(item\);/.test(html), 'un plat sans option ouvre aussi sa fiche détaillée');

const middleware = read('functions/_middleware.js');
ok(/path === '\/OrderPro\.html' \|\| path === '\/OrderPro'/.test(middleware) && /path === '\/api\/menu'/.test(middleware), 'page QR et lecture de carte restent publiques');
ok(!/path === '\/api\/ai\/menu-translate'/.test(middleware), 'la traduction AI ne devient pas une route publique');

if (fail.length) {
  fail.forEach((label) => console.log(`  ✗ ${label}`));
  console.log(`\norder-langs-test : ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`✓ langues de la page QR (${pass} contrôles : publication, sélection, repli, frontière publique)`);
