#!/usr/bin/env node
/* La peau 2027 de la boutique ne change que la peinture.
 *
 * Le propriétaire a posé la contrainte le 2026-10-27, après avoir vu la peau
 * casser des choses au café : « faire une version boutique de la nouvelle peau,
 * sans changer ni enlever de boutons ou de fonctionnalités ». La caisse
 * boutique a sept vues, un ticket, les échanges, les avoirs, les acomptes et
 * l'inventaire — trois mois de corrections de clients vivent dedans.
 *
 * Le cadre 2027 du restaurant (assets/caisse/till-frame.js) masque la barre
 * livrée et ré-expose ses commandes depuis TILL_KIT_MORE, une liste de
 * sélecteurs écrits à la main. Une ligne dont le sélecteur ne correspond plus
 * est retirée SANS ERREUR : c'est comme ça que « envoyer en cuisine » a
 * disparu. On ne fait donc pas ça à la boutique. On repeint le livré, et ce
 * banc tient cette promesse mécaniquement.
 *
 * 1. AUCUN JS. Si un jour quelqu'un ajoute une branche 2027 dans le JS de la
 *    boutique, un bouton peut redevenir injoignable. Le banc l'interdit.
 * 2. TOUT EST PORTÉ. Chaque sélecteur de la feuille commence par le drapeau :
 *    éteint, la boutique est exactement celle qui est livrée.
 * 3. PAS DE COULEUR EN DUR. Uniquement des jetons --k-*, sinon le mode sombre
 *    ment (règle K1 du kit).
 * 4. LE RAIL EST COUVERT. C'est la panne qu'on vient de réparer : le rail livré
 *    est SOMBRE et porte de l'encre blanche en dur. La peau passe le sol au
 *    papier. Toute règle du rail qui garde du blanc devient invisible — c'est
 *    exactement ce qui est arrivé aux pastilles du fond d'ouverture
 *    (.ci-float-chip, blanc sur blanc sur la tablette d'Amira). Le banc relit
 *    pos-boutique.css, retrouve TOUT CE QUI PORTE DU BLANC dans la famille du
 *    rail, et exige que la feuille 2027 reprenne chacune de ces classes. Un
 *    blanc ajouté demain au rail fera rougir ce banc.
 * 5. C'EST CÂBLÉ. La feuille est dans la porte 2027 de kiwi-caisse.html et dans
 *    le précache du service worker, avec la MÊME estampille, sinon la tablette
 *    hors ligne sert une version et le réseau une autre.
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

const SKIN = 'assets/pos-boutique-2027.css';
const skin = read(SKIN);
const skinCode = strip(skin);
const shipped = strip(read('assets/pos-boutique.css'));

/* ── 1 · la boutique n'ADOPTE PAS le cadre 2027 ───────────────────────────── */
/* C'est l'interdit qui compte. KiwiTillFrame masque la barre livrée et ré-expose
 * ses commandes depuis une liste de sélecteurs écrits à la main qui laisse
 * tomber une ligne SANS ERREUR : c'est comme ça qu'« envoyer en cuisine » a
 * disparu. La boutique a sept vues ; elle garde les siennes.
 * UNE seule chose est permise au JS du métier : ouvrir la feuille de comptage
 * du kit pour le fond d'ouverture, parce que la boutique dessine son propre
 * écran d'ouverture (#bq-clockin) et ne passe donc pas par openService(). Elle
 * n'ajoute aucun bouton et n'en retire aucun — elle remplace un parcours de
 * saisie par celui du restaurant. Le banc la borne. */
const jsFiles = ['assets/pos-boutique.js',
  ...fs.readdirSync(path.join(ROOT, 'assets/pos-boutique')).map((f) => 'assets/pos-boutique/' + f)]
  .filter((p) => p.endsWith('.js'));
check(jsFiles.length >= 4, `le dossier pos-boutique/ est introuvable ou vide (${jsFiles.length} fichier(s))`);
for (const f of jsFiles) {
  const src = read(f);
  for (const needle of ['KiwiTillFrame', 'data-k-till', 'TILL_KIT_MORE']) {
    check(!src.includes(needle),
      `${f} parle de « ${needle} » : la boutique ne doit pas adopter le cadre 2027, elle garde ses sept vues`);
  }
}
/* La seule branche 2027 tolérée, et seulement dans le fichier du métier. */
const bq = read('assets/pos-boutique.js');
for (const f of jsFiles.filter((x) => x !== 'assets/pos-boutique.js')) {
  check(!read(f).includes('data-skin-2027'), `${f} ne doit porter aucune branche 2027`);
}
check((bq.match(/data-skin-2027/g) || []).length === 1,
  'la branche 2027 de la boutique doit tenir en UN test de drapeau (bqKitSkin), pas se répandre dans le métier');
check(/function bqKitSkin\b/.test(bq) && /function bqKitFloat\b/.test(bq),
  'bqKitSkin/bqKitFloat ont disparu : le fond d\'ouverture ne se compte plus sur le kit');
check(/k-cash-count/.test(bq) && /mode', 'open'|mode", "open/.test(bq.replace(/\s/g, '')) || /setAttribute\('mode', 'open'\)/.test(bq),
  'la feuille d\'ouverture doit être <k-cash-count mode="open">, la même que la caisse restaurant');
/* Drapeau éteint, le parcours livré doit rester atteignable : la feuille rend
   false et le bouton retombe sur les pastilles. */
check(/if \(!bqKitSkin\(\)\) return false;/.test(bq),
  'bqKitFloat doit rendre false quand le drapeau est éteint, sinon la boutique livrée perd son fond d\'ouverture');
check(/bqKitFloat\(el,/.test(bq), 'bqKitFloat n\'est pas appelé par le bouton « Ouvrir la caisse »');

/* ── 2 · chaque sélecteur est porté par le drapeau ────────────────────────── */
const GATE = 'html[data-skin-2027="till"]';
/* Découper sur les virgules de PREMIER NIVEAU seulement : `:is(a, b)` est un
   seul sélecteur, et le couper en deux ferait rougir ce banc à tort. */
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
const selectors = skinCode
  .split('}')
  .map((b) => b.split('{')[0].trim())
  .filter(Boolean)
  .flatMap(topLevelSplit)
  .filter((s) => s && !s.startsWith('@'));
check(selectors.length > 40, `trop peu de sélecteurs lus (${selectors.length}) : le découpage du banc est cassé`);
for (const sel of selectors) {
  check(sel.startsWith(GATE), `« ${sel} » ne commence pas par ${GATE} : drapeau éteint, la boutique doit être intacte`);
}

/* ── 3 · pas de couleur en dur ────────────────────────────────────────────── */
const RAW = /(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\()/g;
for (const hit of skinCode.match(RAW) || []) {
  check(false, `couleur en dur « ${hit} » dans ${SKIN} : seuls les jetons --k-* gardent le mode sombre honnête`);
}

/* ── 4 · tout le blanc du rail est repris ─────────────────────────────────── */
const RAIL_FAMILY = ['bq-rail', 'bq-brand', 'bq-venue', 'bq-venue-name', 'bq-venue-sub',
  'bq-nav', 'bq-nav-it', 'bq-nav-badge', 'bq-rail-foot', 'bq-lock', 'bq-net',
  'bq-net-dot', 'bq-net-label', 'bq-net-queue'];
const WHITE = /#fff\b|#ffffff\b|rgba?\(\s*255\s*,\s*255\s*,\s*255/i;
const railWhite = new Set();
for (const block of shipped.split('}')) {
  const [sel, body] = block.split('{');
  if (!sel || !body || !WHITE.test(body)) continue;
  for (const cls of RAIL_FAMILY) {
    if (new RegExp('\\.' + cls + '\\b').test(sel)) railWhite.add(cls);
  }
}
check(railWhite.size >= 8,
  `seulement ${railWhite.size} classe(s) du rail portent du blanc : le rail livré a changé, relire ce banc`);
for (const cls of railWhite) {
  check(new RegExp('\\.' + cls + '\\b').test(skinCode),
    `.${cls} porte du blanc en dur sur le rail sombre livré, et la peau 2027 ne la reprend pas : blanc sur blanc`);
}

/* ── 5 · câblage et estampilles ───────────────────────────────────────────── */
const html = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const stamps = JSON.parse(read('tools/asset-stamps.json'));
const inHtml = html.match(/assets\/pos-boutique-2027\.css\?v=(\d+)/);
const inSw = sw.match(/\/assets\/pos-boutique-2027\.css\?v=(\d+)/);
check(!!inHtml, 'la feuille n\'est pas écrite par la porte 2027 de kiwi-caisse.html');
check(!!inSw, 'la feuille n\'est pas dans le précache de kiwi-sw.js : la tablette hors ligne perdrait la peau');
if (inHtml && inSw) {
  check(inHtml[1] === inSw[1],
    `estampilles divergentes : ?v=${inHtml[1]} dans la page, ?v=${inSw[1]} dans le service worker`);
  const sealed = stamps[SKIN] && String(stamps[SKIN].v);
  check(sealed === inHtml[1], `le manifeste scelle ?v=${sealed}, la page écrit ?v=${inHtml[1]}`);
}
/* La porte 2027 est le SEUL endroit qui charge la feuille : si elle apparaissait
   dans une balise ordinaire, la boutique livrée la recevrait aussi. */
check((html.match(/pos-boutique-2027\.css/g) || []).length === 1,
  'la feuille est citée plus d\'une fois dans kiwi-caisse.html : une seule porte, celle du drapeau');

for (const f of fails) console.log('  ✗ ' + f);
if (fails.length) { console.log(`\n✗ ${fails.length} échec(s) · ${pass} vert(s)`); process.exit(1); }
console.log(`✓ ${pass} contrôles verts · la boutique n'adopte pas le cadre, son fond d'ouverture se compte sur le kit, et tout le rail est repris`);
