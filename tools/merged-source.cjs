/* Plusieurs petits scripts ont été réunis dans un voisin chargé par les mêmes
 * coquilles, à la suite et dans le même ordre (22 octobre 2026), pour rendre
 * des places de <script src> aux coquilles plafonnées. Chaque ancien fichier y
 * est précédé d'une ligne repère :
 *   /* ── Ci-dessous, l'ancien assets/NOM.js (réuni ici le …, corps inchangé). ── *\/
 * Les tests qui exécutaient un ancien fichier seul (dans vm, avec un bac à
 * sable taillé pour lui) en reprennent exactement le corps : du repère au
 * repère suivant, ou à la fin du fichier.
 *
 *   mergedPart('assets/hours-ui.js', 'assets/morocco-holidays.js')
 *   mergedPart('assets/orderpro-panel.js')   // la partie d'origine, avant le premier repère
 */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const MARK = '/* ── Ci-dessous, ';

module.exports = function mergedPart(file, old) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  let start = 0;
  if (old) {
    const at = src.indexOf(MARK + "l'ancien " + old + ' ');
    if (at < 0) throw new Error(`${file} ne contient pas l'ancien ${old}`);
    start = src.indexOf('\n', at) + 1;
  } else if (src.startsWith(MARK)) {
    throw new Error(`${file} commence par un repère : nommez la partie voulue`);
  }
  const next = src.indexOf('\n' + MARK, start);
  return next < 0 ? src.slice(start) : src.slice(start, next + 1);
};
