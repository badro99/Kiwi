#!/usr/bin/env node
/* tools/menu-i18n-test.mjs — la carte dans la langue de chacun, sans perdre
 * celle du patron (assets/menu-i18n.js v2, 2026-08-22).
 *
 * Ce que la suite tient, et pourquoi :
 *  · le résolveur : une traduction fraîche s'affiche, une traduction périmée
 *    (le patron a renommé) retombe sur le canonique, une correction manuelle
 *    n'est jamais écrasée par la machine, l'index fait marcher t(str) pour les
 *    surfaces qui ne tiennent qu'un libellé, et il n'y a PLUS de substitution
 *    mot à mot (« Strawberry lait » est exactement le bug qu'on enterre) ;
 *  · needs()/apply() : seul ce qui manque part chez Kiwi AI, et une
 *    « traduction » vers l'arabe sans lettre arabe est refusée ;
 *  · la même empreinte dans kiwi-order.html et OrderPro.html que dans
 *    menu-i18n.js — sinon toute traduction y serait « périmée » ;
 *  · functions/api/menu.js laisse passer i18n (bornes, langues connues, m) ;
 *  · l'import (scan) ne traduit plus : il recopie la langue d'origine ;
 *  · le workspace ne RÉÉCRIT plus les libellés avec la traduction, traduit
 *    automatiquement ce qui manque, et porte l'onglet « Traductions » ;
 *  · chaque surface résout l'affichage ; les tickets restent canoniques.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { failures++; console.log(`  ✗ ${m}`); };
const assert = (c, m) => (c ? ok(m) : bad(m));

console.log('menu-i18n-test');

/* ── résolveur dans une fausse fenêtre ─────────────────────────────────── */
function loadResolver() {
  const w = { localStorage: { getItem: () => null }, document: { documentElement: { lang: 'fr' } } };
  w.window = w;
  vm.runInContext(read('assets/menu-i18n.js'), vm.createContext(w), { filename: 'menu-i18n.js' });
  return w.KiwiMenuI18n;
}
const M = loadResolver();
assert(M && typeof M.name === 'function' && typeof M.needs === 'function' && typeof M.apply === 'function', 'KiwiMenuI18n expose name/desc/t/index/needs/apply/setManual/clear/summary');
assert(M.LANGS.join(',') === 'fr,ar,en' && M.EXTRA.length === 20, 'langues : le noyau reste fr/ar/en et la liste client porte 20 langues');
const venueLangs = M.langs({ langs: ['es', 'zh-CN', 'xx', 'es', 'he'] });
assert(venueLangs.join(',') === 'fr,ar,en,es,zh-Hans,he', 'langs : noyau en tête, codes canoniques, dédoublonnage et inconnus écartés');
assert(M.asLang('zh-TW') === 'zh-Hant' && M.asLang('es-MX') === 'es', 'asLang : BCP-47 régional résolu vers la langue proposée');
assert(M.rtl('ar') && M.rtl('he') && !M.rtl('es'), 'RTL : arabe et hébreu seulement dans la sélection actuelle');
assert(M.autoPick(venueLangs, ['zh-TW', 'es-ES']) === 'es' && M.autoPick(M.langs({ langs:['zh-Hant'] }), ['zh-HK']) === 'zh-Hant', 'autoPick : premier choix navigateur disponible, variantes chinoises comprises');
const serverLangs = read('functions/api/_menu-langs.js');
const clientLangs = read('assets/menu-i18n.js');
for (const key of ['CORE', 'EXTRA', 'RTL']) {
  const sm = serverLangs.match(new RegExp(`export const ${key} = (\\[[^;]+\\]);`));
  const cm = clientLangs.match(new RegExp(`const ${key} = (\\[[^;]+\\]);`));
  assert(sm && cm && sm[1] === cm[1], `${key} : listes serveur et client identiques octet pour octet`);
}
assert(!/const WORDS = \{/.test(read('assets/menu-i18n.js')), 'plus de table de substitution mot à mot (WORDS)');

const it = { id: 'it1', name: 'Tajine poulet', desc: 'citron confit' };
const d = {
  cats: [{ id: 'c1', name: 'Plats', sub: [{ id: 's1', name: 'Tajines' }] }],
  items: [it, { id: 'it2', name: 'Msemen', desc: '' }],
  opts: [{ id: 'g1', name: 'Cuisson', choices: [{ id: 'x1', name: 'Bien cuit' }] }],
};
assert(M.hash('a', 'bc') !== M.hash('ab', 'c'), 'hash : nom et description ne se confondent pas');
const need0 = M.needs(d, ['ar', 'en']);
assert(need0.ar.count === 6 && need0.en.count === 6 && need0.ar.items.length === 2 && need0.ar.cats[0].sub.length === 1, 'needs : tout manque au départ (6 entrées par langue)');
const n = M.apply(d, 'ar', {
  cats: [{ id: 'c1', name: 'أطباق', sub: [{ id: 's1', name: 'طواجن' }] }],
  items: [{ id: 'it1', name: 'طاجين دجاج', desc: 'ليمون مخلل' }, { id: 'it2', name: 'Msemen' }],
  opts: [{ id: 'g1', name: 'درجة الطهي', choices: [{ id: 'x1', name: 'مطهو جيدا' }] }],
});
assert(n === 5, `apply : 5 traductions écrites, "Msemen" sans lettre arabe refusée (${n})`);
assert(M.name(it, 'ar') === 'طاجين دجاج' && M.desc(it, 'ar') === 'ليمون مخلل', 'name/desc : traduction fraîche affichée');
assert(M.name(it, 'fr') === 'Tajine poulet' && M.name(it, 'en') === 'Tajine poulet', 'langue non traduite : canonique');
assert(it.name === 'Tajine poulet', 'le libellé canonique n’est JAMAIS remplacé');
M.index(d);
assert(M.t('Plats', 'ar') === 'أطباق' && M.t('Bien cuit', 'ar') === 'مطهو جيدا', 't(str) retrouve l’entité par son libellé (catégorie, choix)');
assert(M.t('Hot Drinks', 'fr') === 'Boissons chaudes', 'mini-dictionnaire : correspondance exacte conservée');
assert(M.t('Strawberry milk shake', 'fr') === 'Strawberry milk shake', 'aucune substitution partielle (« Strawberry lait » est mort)');
assert(M.needs(d, ['ar']).ar.count === 1 && M.needs(d, ['ar']).ar.items[0].id === 'it2', 'needs après apply : seul Msemen reste à traduire en arabe');
it.name = 'Tajine poulet XL';
assert(M.status(it, 'ar') === 'stale' && M.name(it, 'ar') === 'Tajine poulet XL', 'renommer périme la traduction → canonique affiché');
assert(M.needs(d, ['ar']).ar.items.some((x) => x.id === 'it1'), 'une traduction périmée repart en traduction');
M.setManual(it, 'ar', 'طاجين XL');
assert(M.status(it, 'ar') === 'manual' && M.apply(d, 'ar', { items: [{ id: 'it1', name: 'zzz' }] }) === 0 && M.name(it, 'ar') === 'طاجين XL', 'une correction manuelle n’est jamais écrasée par la machine');
assert(M.needs(d, ['ar'], { force: true }).ar.items.every((x) => x.id !== 'it1'), 'force : retraduit tout SAUF les corrections manuelles');
assert(M.needs(d, ['ar'], { force: 'all' }).ar.items.some((x) => x.id === 'it1'), 'force:"all" : même les corrections');
M.clear(d, 'ar', true);
assert(M.status(it, 'ar') === 'manual' && M.status(d.cats[0], 'ar') === 'missing', 'clear(keepManual) garde les corrections, retire le reste');
const s = M.summary(d);
assert(s.ar.total === 6 && s.ar.manual === 1 && s.ar.missing === 5, 'summary : comptes par statut');
const loc = M.item({ id: 'x', name: 'A', desc: 'B', i18n: { en: { name: 'A-en', desc: 'B-en', h: M.hash('A', 'B') } } }, 'en');
assert(loc.name === 'A-en' && loc.desc === 'B-en' && loc._src.name === 'A', 'item() : copie localisée, canonique dans _src');

/* ── même empreinte sur la page QR et OrderPro ─────────────────────────── */
for (const page of ['kiwi-order.html', 'OrderPro.html']) {
  const src = read(page);
  const m = src.match(/function menuHash\(name, desc\) \{[\s\S]*?\n    \}/);
  assert(!!m, `${page} : menuHash inlinée`);
  if (m) {
    const ctx = vm.createContext({});
    vm.runInContext(m[0] + '; this.h = menuHash;', ctx);
    const same = ['Tajine poulet', 'Msemen', 'Latte'].every((nm) => ctx.h(nm, 'd') === M.hash(nm, 'd') && ctx.h(nm) === M.hash(nm));
    assert(same, `${page} : même empreinte que menu-i18n.js`);
  }
  assert(/function menuTr\(e, l\)[\s\S]*?x\.h !== menuHash\(e\.name, e\.desc\)/.test(src), `${page} : menuTr vérifie la fraîcheur`);
}
assert(/const x = menuTr\(it, l\);\s*MENU_I18N\[l\]\[it\.id\] = x \?/.test(read('kiwi-order.html')), 'kiwi-order.html : MENU_I18N rempli depuis it.i18n (repli canonique)');
assert(/MENU_I18N\.fr = names; MENU_I18N\.en = namesEn; MENU_I18N\.ar = namesAr;/.test(read('OrderPro.html')), 'OrderPro.html : en/ar remplis depuis it.i18n');
assert(/menuTr\(c, currentLang\) \|\| c\)\.name/.test(read('kiwi-order.html')) && /menuTr\(c, currentLang\) \|\| c\)\.name/.test(read('OrderPro.html')), 'onglets de catégories localisés sur les deux pages client');

/* ── serveur : la liste blanche laisse passer i18n ─────────────────────── */
const mw = await import(new URL('../functions/api/menu.js', import.meta.url).href);
const san = mw.sanitizeMenu({
  langs: ['es', 'zh-CN', 'xx', 'es'],
  cats: [{ id: 'c', name: 'Plats', i18n: { ar: { name: 'أطباق', h: 'abc' }, es: { name: 'Platos', h: 'def' }, xx: { name: 'no' } }, sub: [{ id: 's', name: 'T', i18n: { en: { name: 'Tajines', h: '1', m: 1 } } }] }],
  items: [{ id: 'i', name: 'Tajine', price: 50, catId: 'c', i18n: { en: { name: 'Chicken tajine', desc: 'd'.repeat(500), h: 'zz' }, ar: { name: '' } } }],
  opts: [{ id: 'g', name: 'Cuisson', i18n: { en: { name: 'Doneness', h: 'q' } }, choices: [{ id: 'x', name: 'Bien cuit', i18n: { en: { name: 'Well done', h: 'r' } }, emoji: '', price: 0 }] }],
});
assert(typeof mw.sanitizeMenu === 'function', 'functions/api/menu.js exporte sanitizeMenu');
assert(san.langs.join(',') === 'fr,ar,en,es,zh-Hans', 'menu.langs passe, noyau en tête, doublons et langue inconnue écartés');
assert(san.cats[0].i18n && san.cats[0].i18n.ar.name === 'أطباق' && san.cats[0].i18n.es.name === 'Platos' && !san.cats[0].i18n.xx, 'cat.i18n passe pour les langues proposées, inconnue écartée');
assert(san.cats[0].sub[0].i18n.en.m === 1, 'sub.i18n passe, drapeau manuel conservé');
assert(san.items[0].i18n.en.desc.length === 400 && !san.items[0].i18n.ar, 'item.i18n : description bornée à 400, entrée sans nom écartée');
assert(san.opts[0].i18n.en.name === 'Doneness' && san.opts[0].choices[0].i18n.en.name === 'Well done', 'opts et choix : i18n passe');
assert(!mw.sanitizeMenu({ items: [{ id: 'i', name: 'A', price: 1 }] }).items[0].i18n, 'sans i18n en entrée, pas de clé i18n en sortie (additif)');

/* ── prompts ─────────────────────────────────────────────────────────── */
const imp = read('functions/api/ai/menu-import.js');
assert(/ne traduis rien/.test(imp) && !/traduis NATURELLEMENT/.test(imp), 'menu-import : le scan recopie la langue d’origine, ne traduit plus');
const tr = read('functions/api/ai/menu-translate.js');
assert(/DÉJÀ dans la langue cible est recopié tel quel/.test(tr) && /exactement les mêmes identifiants/.test(tr), 'menu-translate : recopie l’identique, aucune omission');

/* ── store ───────────────────────────────────────────────────────────── */
const cat = read('assets/menu-catalog.js');
assert(/function setI18n\(lang, res, opts\)/.test(cat) && /function setI18nEntry\(kind, id, subId, lang, patch\)/.test(cat) && /function clearI18n\(lang, keepManual\)/.test(cat), 'menu-catalog : setI18n / setI18nEntry / clearI18n');
assert(/setI18n, setI18nEntry, clearI18n,/.test(cat), 'menu-catalog : exportés sur window.KiwiMenuStore');

/* ── workspace ───────────────────────────────────────────────────────── */
const ws = read('assets/restaurant-menu-workspace.js');
assert(!/TRANSLATE_DICT|applyLocalTranslation|openTranslateModal|translateTextDirect/.test(ws), 'workspace : le modal qui ÉCRASAIT les libellés a disparu');
assert(!/S\(\)\.updateItem\(it\.id, \{ name: it\.name, desc: it\.desc \}\)/.test(ws), 'workspace : aucune traduction n’est écrite dans name/desc');
assert(/async function ensureTranslations\(o\)/.test(ws) && /S\(\)\.setI18n\(lang,data,\{force:o\.force\|\|false\}\)/.test(ws), 'workspace : ensureTranslations dépose la réponse via setI18n');
assert(/M\.needs\(d,targets,\{force:o\.force\|\|false\}\)/.test(ws), 'workspace : seules les entrées manquantes/périmées des langues configurées partent (needs)');
assert(!/I18N_LANG_NAMES/.test(ws) && /M\.NAMES\[l\]\|\|l/.test(ws), 'workspace : l’en-tête du tableau lit les noms de langue dans KiwiMenuI18n.NAMES (un identifiant fantôme ne casse qu’au rendu, l’onglet paraît mort)');
assert(/H\['rmw-i18n-add'\]/.test(ws) && /H\['rmw-i18n-remove'\]/.test(ws) && /menuLangFeature\(\)/.test(ws), 'workspace : ajout/retrait unitaire derrière features.menuLangs');
assert(/function scheduleAutoTranslate\(\)/.test(ws) && /S\(\)\.subscribe\(scheduleAutoTranslate\);/.test(ws), 'workspace : traduction automatique 2,5 s après un changement de carte');
assert(/if\(!realSession\(\)\)\{/.test(ws), 'workspace : rien ne part sur le réseau hors session réelle');
assert(/if\(res\.status===429\)\{failed='quota';break;\}/.test(ws) && /i18nCooldown=Date\.now\(\)\+/.test(ws), 'workspace : quota et erreurs → pause, pas de boucle');
assert(/\['i18n', ui\('tabI18n'\), 'languages'\]/.test(ws) && /i18n:i18nPanel/.test(ws), 'workspace : onglet « Traductions »');
assert(/data-action="rmw-i18n-fill"/.test(ws) && /H\['rmw-i18n-fill'\]=\(\)=>ensureTranslations/.test(ws) && /H\['rmw-i18n-redo'\]/.test(ws), 'workspace : « Traduire ce qui manque » / « Tout retraduire » branchés');
assert(/e\.target\.matches\('\[data-rmw-i18n\]'\)\)\{onI18nEdit\(e\.target\);\}/.test(ws) && /S\(\)\.setI18nEntry\(k\.kind,k\.id,k\.sub\|\|null,k\.lang,patch\)/.test(ws), 'workspace : une cellule corrigée passe par setI18nEntry (manuel)');
assert(!/data-action="rmw-menu-translate" style="display:none;"/.test(ws), 'workspace : plus de bouton caché');
for (const l of ['en', 'ar', 'fr']) assert(new RegExp(`    ${l}: \\{[\\s\\S]*?tabI18n: '`).test(ws), `workspace : clés UI i18n en ${l}`);

/* ── surfaces ────────────────────────────────────────────────────────── */
const caisse = read('kiwi-caisse.html');
assert(/i18n: it\.i18n \|\| null,/.test(caisse) && /carteState\.catI18n = catI18n;/.test(caisse) && /window\.KiwiMenuI18n\.index\(\{ cats: cats, items: allItems/.test(caisse), 'caisse : i18n projeté et index posé à la relecture de la carte');
assert(/function menuName\(m\)/.test(caisse) && /<span class="menu-item-name">\$\{escTeam\(menuName\(m\)\)\}<\/span>/.test(caisse), 'caisse : tuile dans la langue de la caisse');
assert(/\$\{escTeam\(catLabelL\(c\)\)\}<span class="count mono">/.test(caisse) && /escTeam\(subLabelL\(m\) \|\| catLabelL\(m\.cat\)/.test(caisse), 'caisse : pastilles de catégorie et sous-catégorie localisées');
assert((caisse.match(/rp-item-name">\$\{lineName\(l\)\}/g) || []).length === 4, 'caisse : les 4 rendus de ligne de note localisés (affichage seulement)');
assert(/KiwiCaisseLang\.subscribe\(function \(\) \{ try \{ renderCatPills\(\); renderMenu\(\); renderCart\(\); \}/.test(caisse), 'caisse : re-rendu au changement de langue');
const serveur = read('kiwi-serveur.html');
assert(/i18n: it\.i18n \|\| null,/.test(serveur) && /window\.KiwiMenuI18n\.index\(\{ cats, items: allItems/.test(serveur), 'serveur : i18n projeté et index posé');
assert(/window\.KiwiMenuI18n\.name\(it, employeeLanguage\)/.test(serveur) && /const svLineName = /.test(serveur) && (serveur.match(/svLineName\(l\)/g) || []).length >= 4, 'serveur : grille et lignes de commande dans la langue de l’employé');
const cuisine = read('kiwi-cuisine.html');
assert(/<script src="assets\/menu-i18n\.js\?v=\d+" defer><\/script>/.test(cuisine) && /window\.KiwiMenuI18n\.index\(j\.menu\)/.test(cuisine), 'cuisine : charge menu-i18n.js et indexe la carte');
assert(/esc\(l\.name\) \+ kdsTr\(l\.name\)/.test(cuisine) && /\.tk-tr \{/.test(cuisine), 'cuisine : canonique du chef d’abord, traduction dessous');
for (const f of ['assets/kitchen-print-queue.js', 'assets/food-production-print.js', 'assets/escpos.js']) {
  assert(!/KiwiMenuI18n/.test(read(f)), `${f} : les tickets restent canoniques`);
}

// Chaque clé littérale ui('…') / stateUi('…') de l'atelier doit exister dans les
// trois dictionnaires UI_I18N : ui() rend la clé brute quand elle manque, et
// « standalone », « formulaOnly », « archive » sont restés affichés tels quels
// pendant des semaines sans qu'aucun test ne rougisse.
{
  const used = new Set([...ws.matchAll(/\b(?:ui|stateUi)\('([A-Za-z0-9_]+)'/g)].map((m) => m[1]).filter((k) => k !== 'i18nStatus'));
  for (const lang of ['en', 'ar', 'fr']) {
    const start = ws.indexOf(`    ${lang}: {`);
    const end = lang === 'fr' ? ws.indexOf('\n  };', start) : ws.indexOf('\n    },', start);
    const block = ws.slice(start, end);
    const missing = [...used].filter((k) => !new RegExp(`^\\s*${k}:`, 'm').test(block));
    assert(start > 0 && end > start && missing.length === 0, `UI_I18N.${lang} : clés ui() sans libellé → ${missing.join(', ') || 'aucune'}`);
  }
  assert(/:has\(\.rmw-formula-builder:not\(\[hidden\]\)\)/.test(ws) && !/:has\(\.rmw-formula-builder\)/.test(ws), 'éditeur d’article : la largeur 1120 px ne vaut que si le constructeur de formule est visible, pas pour tout article');
}

// Pied de carte : la pastille nutrition compacte (point + mot, kcal si complet),
// jamais la pastille longue « Nutrition incomplète » qui passait sous Disponible.
assert(/groupe\(s\) d’options`\}\$\{nutritionCardPill\(x\)\}<\/span>/.test(ws) && /\.mi-card-foot>span:first-child\{[^}]*overflow:hidden;text-overflow:ellipsis/.test(ws) && !/· \$\{nutritionPill\(x\)\}<\/span><span class="mi-card-acts"/.test(ws), 'carte article : pastille nutrition compacte dans le pied, premier span tronqué au lieu de déborder sous le bouton Disponible');

console.log(failures ? `\nmenu-i18n-test : ${failures} échec(s)` : '\nmenu-i18n-test : tout passe');
process.exit(failures ? 1 : 0);
