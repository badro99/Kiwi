#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES SURFACES DU PERSONNEL PARLENT LA LANGUE DU PRODUIT
 * ---------------------------------------------------------------------------
 * Un audit de design a trouvé, sur l'écran du passe et sur la salle, une
 * famille d'écarts qui ne cassent rien et ne s'affichent nulle part : la page
 * rend 200, la console reste vide, et le produit se met simplement à ressembler
 * à deux produits. Tous venaient de la même cause — des JETONS RECOPIÉS.
 * Le même nom, une autre valeur, dans un fichier qui ne charge pas la source.
 *
 * Ce que ce contrôle tient, et pourquoi chaque ligne existe :
 *
 *  1 · Fontes — la cuisine redéfinissait --mono sur JetBrains Mono, que
 *      assets/tokens.css écarte explicitement (« le même zéro clair que les
 *      codes-barres imprimés ; garder JetBrains Mono hors de ce jeton évite son
 *      zéro pointé sous Windows »). L'horloge murale et toutes les quantités
 *      tournaient donc dans une fonte que le tableau de bord refuse.
 *
 *  2 · Neutres tièdes — assets/tokens.css n'a AUCUN gris à chroma nulle :
 *      l'échelle --n-* est tiède de bout en bout. La cuisine en avait inventé
 *      quatre (#E5E5E5 #EEEEEE #4A4A4A #6B6B6B), et c'est ce qui lui donnait
 *      son air d'utilitaire posé à côté du produit.
 *
 *  3 · Palette étrangère — la bannière d'annulation portait six valeurs de la
 *      palette par défaut de Tailwind, dont un SECOND rouge à côté du rouge
 *      d'alerte maison.
 *
 *  4 · section{padding:96px} — assets/tokens.css porte un sélecteur d'élément
 *      nu destiné aux pages vitrines. Les trois colonnes du passe sont des
 *      <section> : chacune portait près de 200 px de vide, sur un écran mural.
 *      Le reset `*` de la page a une spécificité de 0 et perdait contre lui.
 *
 *  5 · Jetons qui peignent ET qui encrent — --forest-deep servait de fin de
 *      dégradé (peinture) et de couleur de pastille (encre). En clair les deux
 *      sens veulent un vert sombre, donc rien ne se voyait ; la nuit les
 *      sépare, et la pastille « Table 12 » tombait à 2,59:1.
 *
 *  6 · Le climat et la langue — le passe était le seul écran sans nuit et sans
 *      traduction, alors que c'est celui qu'on lit à deux mètres, la nuit, en
 *      cuisine.
 *
 *  7 · Timbres — la cuisine chargeait assets/tokens.css SANS ?v=. Une
 *      modification des jetons n'atteignait donc jamais une tablette déjà
 *      ouverte : URL identique au byte près, et le service worker sert tiède.
 * ═══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const TOKENS = read('assets/tokens.css');
const CUISINE = read('kiwi-cuisine.html');
const SERVEUR = read('kiwi-serveur.html');
/* Sans commentaires : le cartouche de ce fichier CITE la phrase qu'il a
   corrigée, et un contrôle qui lit les notes repart en rouge sur sa propre
   documentation. On interroge ce qui s'applique, jamais ce qui raconte. */
const LANDING_TOKENS = read('assets/landing/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');

let pass = 0;
function ok(v, msg) {
  if (!v) { console.error('  ✗ ' + msg); process.exitCode = 1; return false; }
  pass++; return true;
}

/* Le bloc <style> d'une page, sans les commentaires : on interroge ce qui
   PEINT, pas ce qui raconte. Les notes de ce dépôt citent volontiers les
   valeurs qu'elles ont chassées, et un contrôle qui lit les commentaires
   repart en rouge sur sa propre documentation. */
function styleOf(src) {
  const m = src.match(/<style>([\s\S]*?)<\/style>/);
  return (m ? m[1] : '').replace(/\/\*[\s\S]*?\*\//g, '');
}
const CUISINE_CSS = styleOf(CUISINE);
const SERVEUR_CSS = styleOf(SERVEUR);

/* Déclarations seules — la partie droite d'une propriété CSS, jamais une
   définition de jeton (`--x: #abc`) ni un commentaire. */
function declaredHexes(css) {
  const out = [];
  for (const line of css.split('\n')) {
    if (/^\s*--[a-z0-9-]+\s*:/i.test(line)) continue;
    for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) out.push(m[0].toUpperCase());
  }
  return out;
}

function tokenValue(css, name) {
  const m = css.match(new RegExp('^\\s*' + name + '\\s*:\\s*([^;]+);', 'm'));
  return m ? m[1].trim() : null;
}

/* ── 1 · les fontes viennent de la source, pas d'une copie ────────────────── */
console.log('\n  1 · fontes partagées');
for (const [label, css] of [['cuisine', CUISINE_CSS], ['serveur', SERVEUR_CSS]]) {
  for (const tok of ['--sans', '--serif', '--mono', '--arabic']) {
    const local = tokenValue(css, tok);
    if (local === null) { pass++; continue; }           // pas redéfini = idéal
    ok(local === tokenValue(TOKENS, tok),
      `${label} redéfinit ${tok} avec une valeur qui diverge de assets/tokens.css `
      + `(local « ${local} » / source « ${tokenValue(TOKENS, tok)} »)`);
  }
}
/* JetBrains Mono est nommément écarté du produit. Il ne doit revenir ni par un
   jeton ni par une requête Google Fonts — la demander sans l'utiliser reste
   une fonte téléchargée pour rien sur une tablette en 3G. */
for (const [label, src] of [['cuisine', CUISINE], ['serveur', SERVEUR]]) {
  ok(!/JetBrains\+?%?20?Mono/i.test(src.replace(/<!--[\s\S]*?-->/g, '')),
    `${label} charge encore JetBrains Mono, que assets/tokens.css écarte de --mono`);
}

/* ── 2 · pas de gris froid inventé ────────────────────────────────────────── */
console.log('  2 · neutres tièdes');
const isCold = (hex) => {
  if (hex.length !== 7) return false;
  const [r, g, b] = [1, 3, 5].map((i) => hex.slice(i, i + 2));
  return r === g && g === b;
};
for (const [label, css] of [['cuisine', CUISINE_CSS], ['serveur', SERVEUR_CSS]]) {
  const cold = [...new Set(declaredHexes(css).filter(isCold))]
    /* #FFFFFF reste licite comme ENCRE sur une dalle sombre — l'interdit de la
       charte porte sur le blanc franc en FOND. */
    .filter((h) => h !== '#FFFFFF');
  ok(cold.length === 0,
    `${label} déclare ${cold.length} gris à chroma nulle (${cold.join(' ')}) — `
    + `l'échelle --n-* de assets/tokens.css est tiède de bout en bout`);
}
ok(declaredHexes(TOKENS.replace(/\/\*[\s\S]*?\*\//g, '')).filter(isCold).length === 0,
  'assets/tokens.css a lui-même acquis un gris froid — la référence de ce contrôle a bougé');

/* ── 3 · pas de palette étrangère ─────────────────────────────────────────── */
console.log('  3 · palette de marque seule');
const TAILWIND = ['#FEF2F2', '#FCA5A5', '#991B1B', '#DC2626', '#D1D5DB', '#374151',
  '#EF4444', '#F87171', '#6B7280', '#9CA3AF', '#111827', '#3B82F6'];
for (const [label, css] of [['cuisine', CUISINE_CSS], ['serveur', SERVEUR_CSS]]) {
  const found = [...new Set(declaredHexes(css))].filter((h) => TAILWIND.includes(h));
  ok(found.length === 0,
    `${label} contient ${found.length} valeur(s) de la palette par défaut de Tailwind `
    + `(${found.join(' ')}) — la marque a ses propres jetons`);
}

/* ── 4 · le piège du sélecteur d'élément nu ───────────────────────────────── */
console.log('  4 · section{padding} neutralisé');
ok(/^\s*section\s*\{[^}]*padding/m.test(TOKENS),
  'assets/tokens.css ne porte plus section{padding} — ce contrôle vise un piège disparu, '
  + 'retirez-le ou corrigez-le plutôt que de le laisser passer à vide');
ok(/\.col\s*\{[^}]*padding:\s*0/.test(CUISINE_CSS),
  'kiwi-cuisine.html : .col ne remet pas padding:0. Les colonnes du passe sont des '
  + '<section> et héritent des 96px de assets/tokens.css — près de 200px volés à un écran mural');

/* ── 5 · un jeton, un rôle ────────────────────────────────────────────────── */
console.log('  5 · peinture et encre séparées');
{
  /* --forest-deep est la PEINTURE (fin de dégradé). Aucune règle ne doit s'en
     servir comme couleur de texte : c'est ce qui a rendu « Table 12 » illisible
     la nuit. */
  const inkUse = [...CUISINE_CSS.matchAll(/(^|[;{]\s*)color:\s*var\(--forest-deep\)/g)];
  ok(inkUse.length === 0,
    `kiwi-cuisine.html utilise --forest-deep comme ENCRE ${inkUse.length} fois. `
    + `Ce jeton peint ; l'encre est --forest-ink, qui s'éclaircit la nuit`);
  ok(/--forest-ink\s*:/.test(CUISINE_CSS), 'kiwi-cuisine.html a perdu --forest-ink');
}

/* ── 6 · climat et langue ─────────────────────────────────────────────────── */
console.log('  6 · nuit et traductions du passe');
ok(/html\[data-theme="dark"\]/.test(CUISINE_CSS),
  'kiwi-cuisine.html a perdu son climat de nuit');
ok(/localStorage\.getItem\('kiwiTheme'\)/.test(CUISINE),
  "kiwi-cuisine.html ne lit plus kiwiTheme — le climat doit être posé AVANT la première peinture");
{
  const langs = ['fr', 'en', 'ar'];
  const dict = CUISINE.match(/var DICT = \{[\s\S]*?\n  \};/);
  ok(!!dict, 'kiwi-cuisine.html a perdu son dictionnaire');
  if (dict) {
    const keysOf = (l) => {
      const b = dict[0].match(new RegExp('\\n    ' + l + ': \\{([\\s\\S]*?)\\n    \\},'));
      return b ? [...b[1].matchAll(/'([a-z][a-zA-Z.]*)':/g)].map((m) => m[1]) : [];
    };
    const fr = keysOf('fr');
    ok(fr.length > 30, `le dictionnaire FR ne porte que ${fr.length} clés`);
    for (const l of langs.slice(1)) {
      const missing = fr.filter((k) => !keysOf(l).includes(k));
      ok(missing.length === 0,
        `${l} : ${missing.length} clé(s) manquante(s) (${missing.slice(0, 4).join(', ')}) — `
        + `une clé absente retombe en français au milieu d'un écran arabe`);
    }
  }
  /* Une raison d'annulation est une CLÉ persistée par la caisse : on traduit
     son libellé, jamais le jeton lui-même. */
  ok(/known\.indexOf\(va\.reason\)/.test(CUISINE),
    "kiwi-cuisine.html traduit les raisons d'annulation sans garder la clé persistée intacte");
}

/* ── 7 · les timbres ──────────────────────────────────────────────────────── */
console.log('  7 · timbres de version');
{
  const stamp = (src, asset) => {
    const m = src.match(new RegExp(asset.replace(/[./]/g, '\\$&') + '\\?v=(\\d+)'));
    return m ? m[1] : null;
  };
  const dash = stamp(read('dashboard.html'), 'assets/tokens.css');
  const cuis = stamp(CUISINE, 'assets/tokens.css');
  ok(cuis !== null,
    'kiwi-cuisine.html charge assets/tokens.css SANS ?v= : une modification des jetons '
    + "n'atteindra jamais une tablette déjà ouverte (URL identique, service worker tiède)");
  ok(cuis === dash,
    `le timbre de assets/tokens.css diverge entre les coquilles `
    + `(tableau de bord ${dash} / cuisine ${cuis}) — deux surfaces sur deux copies du même fichier`);
}

/* ── 8 · le fichier de jetons satellite ne se prétend plus universel ──────── */
console.log('  8 · portée des jetons satellites');
ok(!/single source of truth/i.test(LANDING_TOKENS),
  'assets/landing/tokens.css se déclare encore « single source of truth » alors qu\'il ne sert '
  + 'que les pages légales — et qu\'il en existe trois');
for (const tok of ['--font-display', '--font-body']) {
  ok(/Inter Tight/.test(tokenValue(LANDING_TOKENS, tok) || ''),
    `assets/landing/tokens.css ${tok} n'est pas aligné sur Inter Tight : un commerçant qui `
    + `clique « Conditions » depuis l'application change de police en chemin`);
}

console.log(`\n  ✓ ${pass} contrôles de parité de surface\n`);
