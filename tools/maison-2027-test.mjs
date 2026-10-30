#!/usr/bin/env node
/* La caisse maison (art de table) porte la MÊME peau 2027 que la boutique.
 *
 * Le propriétaire, 2026-10-30, sur la caisse « art de table by amira » :
 * « elle n'est clairement pas sur la peau 2027 ; la maison ressemble à la
 * boutique, fais-la ressembler à la boutique ». La maison est un fork de la
 * boutique au préfixe mz- ; sa peau est donc la peau de la boutique, traduite.
 * Ce banc tient cette traduction, pour qu'une correction faite d'un côté ne
 * soit pas oubliée de l'autre :
 *
 * 1. LA FEUILLE EST LA MÊME. pos-maison-2027.css = pos-boutique-2027.css au
 *    préfixe près (bq- → mz-, #pos-boutique → #pos-maison), puis la section
 *    « LA MAISON EN PLUS ». Chaque règle est portée par le drapeau, sans
 *    couleur en dur.
 * 2. LE KIT EST LE MÊME. Le rail, le tiroir Plus, la feuille du fond
 *    d'ouverture, le pied du ticket et la barre de recherche de
 *    pos-maison/kit-2027.js sont ceux de la boutique, au préfixe près.
 * 3. C'EST BRANCHÉ. Le fond d'ouverture se compte sur <k-cash-count>, le rail
 *    est monté au montage, la recherche est sur la barre de vente et sur
 *    l'Inventaire, chaque icône existe au sprite, et la feuille est dans la
 *    porte 2027 de kiwi-caisse.html et dans le précache, à la même estampille.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else fails.push(what); };

/* ── 1 · la feuille ─────────────────────────────────────────────────────── */
const toMz = (s) => s.replace(/#pos-boutique/g, '#pos-maison').replace(/bq-/g, 'mz-');
const bqCss = read('assets/pos-boutique-2027.css');
const mzCss = read('assets/pos-maison-2027.css');
const body = (css) => css.slice(css.indexOf('*/') + 2);
const EXTRA = '/* ═══════════════ LA MAISON EN PLUS';
const cut = mzCss.indexOf(EXTRA);
check(cut > 0, 'pos-maison-2027.css a perdu sa section « LA MAISON EN PLUS »');
check(strip(body(mzCss).slice(0, cut - mzCss.indexOf('*/') - 2)).trim() === strip(toMz(body(bqCss))).trim(),
  'pos-maison-2027.css ne suit plus pos-boutique-2027.css : reporter la règle changée (préfixe mz-), ou la mettre dans « LA MAISON EN PLUS »');

const GATE = 'html[data-skin-2027="till"]';
const topLevelSplit = (list) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const code = strip(mzCss);
const selectors = code.split('}').map((b) => b.split('{')[0].trim()).filter(Boolean)
  .flatMap(topLevelSplit).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d+%)$/.test(s));
check(selectors.length > 40, `trop peu de sélecteurs lus (${selectors.length})`);
for (const sel of selectors) check(sel.startsWith(GATE), `« ${sel} » n'est pas porté par ${GATE} : drapeau éteint, la maison doit être intacte`);
for (const hit of code.match(/(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\()/g) || []) {
  check(false, `couleur en dur « ${hit} » dans pos-maison-2027.css : jetons --k-* seulement`);
}

/* ── 2 · le kit ─────────────────────────────────────────────────────────── */
const bqKit = read('assets/pos-boutique/kit-2027.js').replace(/bq/g, 'mz').replace(/Bq/g, 'Mz').replace(/BQ_/g, 'MZ_');
const mzKit = read('assets/pos-maison/kit-2027.js');
const fnBody = (src, name) => {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return '';
  const end = src.indexOf('\n}\n', at);
  return end < 0 ? '' : src.slice(at, end + 2);
};
for (const fn of ['mzKitRailPaint', 'mzMoreTarget', 'mzMoreActs', 'mzKitMorePaint', 'mzKitRail', 'mzKitTicketEmpty', 'mzKitScanBar', 'mzKitSellScroll']) {
  /* Seul écart voulu : la valeur du rail passe par mzRailValue (Mouvements et casse restent sur Inventaire). */
  const a = fnBody(bqKit, fn), b = fnBody(mzKit, fn).replace(/mzRailValue\(cur\)/g, "(cur && cur.dataset.mzView) || 'vente'");
  check(a !== '' && a === b, `${fn} de la maison ne suit plus celui de la boutique (pos-boutique/kit-2027.js) : reporter la correction`);
}
/* Deux écarts voulus, et seulement eux. */
check(fnBody(mzKit, 'mzKitOpenSheet') === fnBody(bqKit, 'mzKitOpenSheet').replace('#mzci-chips', '#bqci-chips'),
  "la feuille du fond d'ouverture de la maison ne suit plus celle de la boutique (seul écart : les pastilles #bqci-chips héritées)");
check(fnBody(mzKit, 'mzKitTicketFoot').replace(/\n\s*\/\*[^\n]*\*\/\n/, '\n').replace("  if (typeof o.onRemise === 'function') sec.appendChild(mk('remise'", "  sec.appendChild(mk('remise'") === fnBody(bqKit, 'mzKitTicketFoot'),
  'le pied du ticket de la maison ne suit plus celui de la boutique (seul écart : pas de Remise sans o.onRemise)');
check(/\['fournisseurs', '[a-z_0-9]+'\]/.test(mzKit) && /\['livraisons', '[a-z_0-9]+'\]/.test(mzKit),
  'Fournisseurs ou Livraisons n\'ont plus de place dans Plus : la vue deviendrait injoignable sous la peau');
/* Mouvements de stock et Déclarer casse s'ouvrent depuis l'Inventaire (propriétaire, 2026-10-30). */
const inv = read('assets/pos-maison/inventory.js');
check(/id="mzi-moves"/.test(inv) && /switchView\('mouvements'\)/.test(inv) && /id="mzi-casse"/.test(inv) && /switchView\('casse'\)/.test(inv),
  'Mouvements de stock ou Déclarer casse n\'ont plus leur bouton dans l\'Inventaire : la vue deviendrait injoignable');
check(/MZ_PARENT = \{ mouvements: 'inventaire', casse: 'inventaire' \}/.test(mzKit), 'le rail ne reste plus sur Inventaire pendant Mouvements ou Déclarer casse');
check(/data-mz-back-inv/.test(inv) && /data-mz-back-inv/.test(read('assets/pos-maison/sales.js')), 'Mouvements ou Déclarer casse ont perdu leur retour « ← Inventaire »');
const sprite = read('assets/icons/material/sprite.till.svg');
for (const [, ic] of mzKit.matchAll(/\['[^']+', '([a-z_0-9]+)'\],/g)) {
  check(new RegExp('id="' + ic + '"').test(sprite), `l'icône « ${ic} » manque à sprite.till.svg : le rail ou le tiroir dessinerait un vide`);
}

/* ── 3 · branché ────────────────────────────────────────────────────────── */
const mz = read('assets/pos-maison.js');
check(/mzKitRail\(root, \$, icons, mzKitReady\(\)/.test(mz), 'le rail du kit n\'est plus monté par pos-maison.js');
check(/function mzKitFloat\b/.test(mzKit) && /if \(!mzKitReady\(\)\) return false;/.test(mzKit) && /setAttribute\('mode', 'open'\)/.test(mzKit),
  "le fond d'ouverture de la maison ne se compte plus sur <k-cash-count mode=\"open\">, ou ne retombe plus sur les pastilles drapeau éteint");
check(/mzKitFloat\(el,/.test(mz), 'mzKitFloat n\'est pas appelé par « Ouvrir la caisse »');
check(/wireSellSearch\(\$\('\.mz-sell-scan', root\), sellEan\)/.test(mz), 'la recherche n\'est plus montée sur la barre de vente');
check((mz.match(/mzKitRailPaint\(\)/g) || []).length >= 2, 'le rail ne se repeint plus au changement de vue ou de pastille');
check(/mzKitTicketFoot\(el,/.test(read('assets/pos-maison/sales.js')), 'le pied du ticket du kit n\'est plus monté');
check(/mzInvSearch\(\$\('\.mzi-scan', panel\)/.test(read('assets/pos-maison/inventory.js')), "la recherche de l'Inventaire n'est plus montée");

const caisse = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const tag = caisse.match(/assets\/pos-maison-2027\.css\?v=(\d+)/);
check(!!tag, 'pos-maison-2027.css n\'est pas chargée par la porte 2027 de kiwi-caisse.html');
const gate = caisse.indexOf('data-skin-2027');
check(tag && gate > 0 && caisse.indexOf('pos-maison-2027.css') > gate && caisse.indexOf('pos-maison-2027.css') - caisse.indexOf('pos-boutique-2027.css') < 400,
  'pos-maison-2027.css doit être chargée dans la porte 2027, à côté de pos-boutique-2027.css');
check(tag && sw.includes(`/assets/pos-maison-2027.css?v=${tag[1]}`), 'le précache du service worker ne porte pas pos-maison-2027.css à la même estampille');
const kitTag = mz.match(/pos-maison\/kit-2027\.js\?v=(\d+)/);
check(kitTag && sw.includes(`/assets/pos-maison/kit-2027.js?v=${kitTag[1]}`), 'le précache ne porte pas pos-maison/kit-2027.js à la même estampille');

if (fails.length) {
  console.error(`maison-2027-test: ${fails.length} échec(s)`);
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`maison-2027-test: ${pass} vérifications, la maison porte la peau de la boutique`);
