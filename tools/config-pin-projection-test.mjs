#!/usr/bin/env node
/* Le code à quatre chiffres ne quitte pas la base.
 *
 * /api/config sert le ROSTER d'une boutique — qui y travaille — et servait
 * autrefois le code de chacun avec. Chaque caisse, chaque tableau de bord et
 * chaque extension installée sur le navigateur du magasin détenait donc le
 * credential qui ouvre le tiroir-caisse, et trois surfaces le comparaient
 * elles-mêmes dans la page.
 *
 * Ce garde-fou tient les deux moitiés du contrat, parce qu'une seule ne suffit
 * pas : le serveur ne doit pas SÉLECTIONNER le code, et le client ne doit pas
 * l'ATTENDRE. Une régression d'un seul côté est silencieuse — la page continue
 * de fonctionner, elle compare simplement `undefined` et refuse tout le monde,
 * ou pire, quelqu'un « répare » ça en remettant la colonne dans le SELECT.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let fails = 0;
function ok(label, cond, detail) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${label}`); return; }
  fails++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `\n      ${detail}` : ''}`);
}

console.log('\n\x1b[1mProjection des codes personnel — /api/config\x1b[0m');

/* ── 1. Le serveur ne lit pas la colonne ─────────────────────────────────────
 * On regarde les SELECT visant staff_pins dans le seul fichier qui sert cette
 * réponse. La liste des colonnes est comparée telle qu'elle est écrite : c'est
 * la seule forme qui compte, puisque D1 rend exactement ce qu'on lui demande. */
const config = read('functions/api/config.js');
/* Le groupe de colonnes ne peut traverser ni un autre SELECT ni un autre FROM,
   sinon un SELECT d'une table voisine avale la moitié du fichier. */
const COLS = /SELECT\s+((?:(?!\bSELECT\b|\bFROM\b)[\s\S])*?)\s+FROM\s+staff_pins/gi;
const columnsOf = (src) => [...src.matchAll(COLS)].map((m) => m[1].replace(/\s+/g, ' ').trim());
/* `p.pin`, `pin`, `staff_pins.pin` — une colonne nommée pin, quel que soit son
   préfixe de table, et jamais le mot « pin » dans un identifiant plus long. */
const selectsPin = (cols) => /(^|[\s,])(?:[a-z_]+\.)?pin(?=$|[\s,])/i.test(cols);

const selects = columnsOf(config);
ok('functions/api/config.js interroge bien staff_pins', selects.length >= 2,
  `${selects.length} SELECT trouvé(s)`);
for (const cols of selects) {
  ok(`SELECT « ${cols} » ne demande pas le code`, !selectsPin(cols), cols);
}

/* Un SELECT * ramènerait la colonne sans jamais la nommer. */
ok('aucun SELECT * sur staff_pins', !/SELECT\s+\*\s+FROM\s+staff_pins/i.test(config));

/* La réponse GET elle-même : `pins` sort d'un .filter() sur les lignes lues,
 * jamais d'un objet reconstruit qui rajouterait le code au passage. */
ok('la réponse GET ne fabrique pas de champ pin',
  !/pins\s*[:=][^;\n]*\bpin\s*:/.test(config));

/* ── 2. Le client ne l'attend pas ────────────────────────────────────────────
 * Les quatre surfaces qui comparaient un code frappé à une liste reçue. */
const surfaces = {
  'assets/merchant-config.js': read('assets/merchant-config.js'),
  'assets/caisse-pairing.js': read('assets/caisse-pairing.js'),
  'kiwi-caisse.html': read('kiwi-caisse.html'),
  'kiwi-serveur.html': read('kiwi-serveur.html'),
};
/* dashboard.html garde une lecture de `x.code || x.pin` : c'est `kiwiPins`,
 * l'écriture de l'assistant d'installation dans CE navigateur, pas la réponse
 * du serveur. On vérifie donc chez lui que la source est bien localStorage. */
const dash = read('dashboard.html');
ok('dashboard.html ne tire plus de code de KiwiConfig',
  !/\(kc\.seenPins[^\n]*\)\.forEach\(add\)/.test(dash) && !/kc\.pins[^\n]*\)\.forEach\(add\)/.test(dash));
ok('dashboard.html soumet le code frappé à /api/pin/verify',
  /fetch\('\/api\/pin\/verify'/.test(dash));

for (const [file, src] of Object.entries(surfaces)) {
  /* Une comparaison d'un code frappé contre une propriété .pin d'un élément de
     liste — la forme exacte qui vient de disparaître de trois fichiers. */
  ok(`${file} ne compare aucun code contre une liste reçue`,
    !/\bp\.pin\b|\bpins\[[^\]]+\]\.pin\b|\(p\.pin \|\| p\.code\)/.test(src),
    (src.match(/.*(\bp\.pin\b|pins\[[^\]]+\]\.pin).*/) || [''])[0].trim());
}

/* ── 3. Le remplaçant existe et il est gardé ─────────────────────────────────
 * Retirer le code de la réponse n'a de sens que si la question « ce code est-il
 * le bon ? » a un autre endroit où se poser. */
const lib = read('functions/auth/_lib.js');
ok('le vérificateur par boutique existe', /export async function verifyStaffPin\(/.test(lib));
ok('le vérificateur par COMPTE existe (la porte du dashboard)',
  /export async function verifyAccountPin\(/.test(lib));
ok('le vérificateur par compte est limité en tentatives',
  /verifyAccountPin\([\s\S]*?limitCheck\(request, env, 'pin:account'/.test(lib));
ok('le vérificateur par compte est dérivé de la session, pas d’un paramètre',
  /verifyAccountPin\(request, env, pin\)/.test(lib)
  && /verifyAccountPin\([\s\S]*?readSession\(readCookie\(request, SESS_COOKIE\)/.test(lib));
/* Les vérificateurs comparent le code dans le WHERE ; ils ne le RAMÈNENT pas. */
const libSelects = columnsOf(lib.slice(lib.indexOf('export async function verifyStaffPin')));
ok('les vérificateurs interrogent staff_pins', libSelects.length >= 2,
  `${libSelects.length} SELECT trouvé(s)`);
for (const cols of libSelects) {
  ok(`vérificateur — SELECT « ${cols} » ne ramène pas le code`, !selectsPin(cols), cols);
}

const verify = read('functions/api/pin/verify.js');
ok('/api/pin/verify route les deux formes (boutique et compte)',
  /verifyStaffPin\(/.test(verify) && /verifyAccountPin\(/.test(verify));
ok('/api/pin/verify ne renvoie jamais le code reçu',
  !/\bpin\s*:\s*pin\b/.test(verify) && !/\bpin\s*,\s*$/m.test(verify.slice(verify.indexOf('return json'))));

if (fails) {
  console.log(`\n\x1b[31m✗ ${fails} contrôle(s) échoué(s).\x1b[0m`);
  process.exit(1);
}
console.log('\n\x1b[32m✓ projection des codes : le serveur ne les lit pas, le client ne les attend pas.\x1b[0m');
