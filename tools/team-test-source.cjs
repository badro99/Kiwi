/* Le code de la page Équipe tient en deux fichiers depuis le 22 octobre :
 * assets/team.js (roster, éditeur de membre, codes publiés vers la caisse) et
 * assets/team-hours.js (heures, planning, paie), sorti de team.js bloc par
 * bloc, à l'identique. Les tests qui lisent la source pour y chercher une
 * fonction ou un motif lisent les deux, dans l'ordre de chargement : une
 * fonction déplacée reste trouvée, et une interdiction (« aucun toast ne
 * cite un code ») couvre aussi la moitié paie. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const FILES = ['assets/team.js', 'assets/team-hours.js'];
module.exports = function teamSource() {
  return FILES.map((rel) => fs.readFileSync(path.join(root, rel), 'utf8')).join('\n');
};
module.exports.FILES = FILES;
