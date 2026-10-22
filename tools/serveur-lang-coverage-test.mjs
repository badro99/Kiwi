#!/usr/bin/env node
import serveurTestSource from './serveur-test-source.cjs';
/* L'app serveur (kiwi-serveur.html) en anglais et en arabe : plus un mot de
 * français sur ce que le serveur voit.
 *
 * Le 2026-10-21, un serveur réglé en anglais ouvrait une table et lisait
 * « Fermer la table », « Changer table », « Fusionner », « Commande pour T4 »,
 * « Voir la commande » ; toute la fenêtre de partage d'addition, le motif
 * d'annulation d'un plat, le déplacement et la fusion de table restaient en
 * français, et les info-bulles (title) n'étaient jamais traduites. Le
 * traducteur existait : il manquait les entrées.
 *
 * Ce test lit le vrai dictionnaire et les vrais motifs (assets/serveur-lang.js)
 * et le vrai traducteur de la page, puis exige :
 *   1. que chaque texte français du balisage statique (hors <script>/<style>)
 *      et chaque aria-label / title / placeholder se traduise en anglais ET
 *      en arabe, sauf les exemples de démonstration que le code remplace ;
 *   2. que les phrases composées à l'exécution (liste RUNTIME) se traduisent ;
 *   3. que l'anglais et l'arabe aient exactement les mêmes clés ;
 *   4. que l'observateur suive aussi les attributs, title compris ;
 *   5. qu'aucun confirm() ne parte en français brut (le navigateur l'affiche
 *      lui-même, hors du traducteur du DOM). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = serveurTestSource(fs.readFileSync(path.join(root, 'kiwi-serveur.html'), 'utf8'));
const fails = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fails.push(msg); };

const lang = fs.readFileSync(path.join(root, 'assets', 'serveur-lang.js'), 'utf8');
function slice(text, startToken, endToken) {
  const a = text.indexOf(startToken);
  if (a < 0) throw new Error('introuvable : ' + startToken);
  const b = text.indexOf(endToken, a);
  return text.slice(a, b + endToken.length);
}
const dictSrc = slice(lang, 'const EMPLOYEE_TRANSLATIONS = {', '\n  };');
const patSrc = slice(lang, 'const EMPLOYEE_PATTERNS = [', '\n  ];');
const fnSrc = slice(page, 'function employeeTranslation(value) {', '\n    }');
const ctx = { employeeLanguage: 'fr' };
vm.createContext(ctx);
vm.runInContext(`${dictSrc}\n${patSrc}\n${fnSrc}\nthis.EMPLOYEE_TRANSLATIONS = EMPLOYEE_TRANSLATIONS; this.tr = employeeTranslation; this.setLang = (l) => { employeeLanguage = l; };`, ctx);
const tr = (s, lang) => { ctx.setLang(lang); return ctx.tr(s); };

/* 3. mêmes clés des deux côtés */
const en = Object.keys(ctx.EMPLOYEE_TRANSLATIONS.en), ar = Object.keys(ctx.EMPLOYEE_TRANSLATIONS.ar);
const enOnly = en.filter((k) => !(k in ctx.EMPLOYEE_TRANSLATIONS.ar)), arOnly = ar.filter((k) => !(k in ctx.EMPLOYEE_TRANSLATIONS.en));
ok(!enOnly.length && !arOnly.length, `anglais et arabe ont des clés différentes · en seul : ${enOnly.slice(0, 5).join(' | ')} · ar seul : ${arOnly.slice(0, 5).join(' | ')}`);

/* 1. le balisage statique */
const FR = /[àâçéèêëîïôûùüÿœ’]|\b(?:le|la|les|des|du|une|pour|avec|sur|dans|aux|au|et|pas|vos|votre|cette|est|Annuler|Ouvrir|Fermer|Tout|Choisissez|Rattacher|Ajouter|Motif|Plat|Perte|Erreur|Changement|Fusionner|Déplacer|Valider|Payer|Encaisser|Pourboire|Nouvelle|Nouveau|Commande|couverts?|Aucun|Aucune|Partager|Parts?|Combien)\b/;
/* Exemples de démonstration écrits dans le balisage et toujours remplacés par
   le code avant d'être vus (rendu, ouverture de fenêtre, connexion). */
const PLACEHOLDERS = new Set([
  'Bonjour Yassir,', '7 tables ce soir · bon service', 'Bonjour Yassir!', '1× Plat', 'Demain · Mercredi',
  'En cours · 45 mn', 'T2 · 2 couverts', '2 parts ·, chacun', 'Français',
  'Café Atlas', 'Serveur Confirmé', 'Réglez 12 tables ce soir',
]);
const markup = page
  .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<head\b[\s\S]*?<\/head>/i, ' ');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const statics = new Set();
for (const m of markup.matchAll(/>([^<>]+)</g)) {
  const t = decode(m[1]).replace(/\s+/g, ' ').trim();
  if (t.length > 2 && /\p{L}{2}/u.test(t) && FR.test(t)) statics.add(t);
}
for (const m of markup.matchAll(/\s(?:aria-label|title|placeholder)="([^"]+)"/g)) {
  const t = decode(m[1]).trim();
  if (/\p{L}{2}/u.test(t) && FR.test(t)) statics.add(t);
}
let staticCount = 0;
for (const s of statics) {
  if (PLACEHOLDERS.has(s)) continue;
  staticCount++;
  for (const lang of ['en', 'ar']) ok(tr(s, lang) !== s, `balisage non traduit en ${lang} : « ${s} »`);
}
ok(staticCount > 60, `le balayage du balisage ne trouve que ${staticCount} textes : l'extraction est cassée`);

/* 2. phrases composées à l'exécution */
const RUNTIME = [
  'Commande pour T4', '4 couverts · ajoutez des articles ci-dessous', '1 couvert · ajoutez des articles ci-dessous',
  'Fusionner avec T5', 'Déplacer vers T7', 'Fusionner', 'Déplacer', 'Tout', 'Nouvelle table',
  'Aucun article, appuyez sur', 'pour ouvrir le menu.', 'Fermer la table', 'Annuler toute la table', 'Changer table',
  'Voir la commande', 'Installer l’app', 'Détail de la table', 'Rafraîchir',
  '3 parts · 40,00 MAD chacun', 'Split en cours · 1/3 réglées', '2 / 3 réglées', '/ 2 restants · 30 MAD chacun',
  '1 article à attribuer', '4 articles à attribuer', 'Réglé · Carte', 'Réglé · Espèces',
  'Vérification des notes indisponible', 'Vérification indisponible', 'Note rouverte · règlement au comptoir', 'Note rouverte',
  'Note A12 rouverte en caisse', 'Partie à régler : 120,00 MAD. Les autres parties déjà payées restent réglées.',
  'Commande OrderPro à valider · 85 MAD', 'Commande K-14 en attente', 'commande K-14 prête',
  'Serveur · Pairs Bistro', 'Caissier · Pairs Bistro', 'Départ autorisé · Salma', 'Arrivée autorisée · Salma', 'Prise en cours par Karim', 'prend la commande sur cette table',
  'Table T4 annulée · 2 commandes retirées · cuisine prévenue', 'Table T4 annulée · 1 commande retirée · cuisine prévenue',
  'Table T4 annulée · cuisine prévenue · plan en cours de synchronisation', "Table T4 · envoyez d'abord la commande en cuisine",
  'Demande de l’eau', 'Demande du pain', 'Demande des serviettes', 'Demande de débarrasser',
  'Clients installé · menus à apporter', 'Clients installé · 4 pers. · menus à apporter', 'Famille Alami installé · 4 pers. · menus à apporter',
  'Table ouverte · commande en cours', 'Paiement en cours', 'Addition réglée', 'Table libérée',
  'Annuler un Tajine kefta', 'Note cuisine · sans oignon', '1 à 3 choix', '89 MAD · Choisissez la formule et ses options', 'Ajouter · 89 MAD',
  'Tables servies', 'Tables réglées', 'Revenu encaissé', 'Ticket moyen', 'Durée du service', 'Vitesse moyenne / table',
  'Carte du soir', 'Fin de service', 'Ce soir', 'Partager', 'Plus tard', 'Copié', 'bon service.', 'Bonjour,',
  'Lancer le split', 'Encaisser les parts', 'Annuler le split', 'Tout khlass!', "L'addition est soldée · choukran",
  'Carte approuvée', 'Approchez la carte ou le téléphone', 'Même chose pour tous', 'Aucun client trouvé.',
  'Pointage enregistré sur ce téléphone · envoi dès le retour du réseau', 'Pointage du téléphone envoyé',
  'Pointage du téléphone refusé · voyez avec votre responsable',
];
for (const s of RUNTIME) for (const lang of ['en', 'ar']) {
  const out = tr(s, lang);
  ok(out !== s, `phrase d'exécution non traduite en ${lang} : « ${s} »`);
  if (lang === 'ar') ok(!/[àâçéèêëîïôûùüÿœ]|\b(?:couverts?|réglées?|commandes?|chacun|cuisine|prévenue|pers)\b/.test(out), `l'arabe garde du français : « ${s} » → « ${out} »`);
}

/* 4. les attributs sont observés, title compris */
ok(/const EMPLOYEE_I18N_ATTRS = \[[^\]]*'title'[^\]]*\]/.test(page), "title n'est pas dans les attributs traduits");
ok(/attributes: true, attributeFilter: EMPLOYEE_I18N_ATTRS/.test(page), "l'observateur ne suit pas les attributs : un aria-label réécrit au rendu reste en français");
ok(/mutation\.type === 'attributes'\) translateEmployeeAttrs\(mutation\.target\)/.test(page), "l'observateur ne traduit pas l'attribut qui vient de changer");

/* La page lit les deux listes du fichier, chargé avant elle et sans defer. */
ok(/<script src="assets\/serveur-lang\.js\?v=\d+"><\/script>/.test(page) && page.indexOf('assets/serveur-lang.js') < page.indexOf('window.KiwiServeurLang.translations'),
  "assets/serveur-lang.js n'est pas chargé, ou pas avant le script qui le lit");

/* 5. aucun confirm() en français brut */
const rawConfirms = [...page.matchAll(/confirm\((`|'|")[^`'"]*[A-Za-zÀ-ÿ]/g)].map((m) => page.slice(m.index, m.index + 70));
ok(!rawConfirms.length, `confirm() en français brut : ${rawConfirms.join(' | ')}`);

if (fails.length) {
  console.error(`✗ app serveur · ${fails.length} manque(s) de traduction sur ${checks} vérifications`);
  for (const f of fails.slice(0, 40)) console.error('  · ' + f);
  if (fails.length > 40) console.error(`  … et ${fails.length - 40} de plus`);
  process.exit(1);
}
console.log(`✓ app serveur en anglais et en arabe : ${staticCount} textes du balisage et ${RUNTIME.length} phrases d'exécution traduits, attributs observés (${checks} vérifications)`);
