/* Les pages de la barre latérale tiennent en quatre fichiers depuis le
 * 22 octobre 2026, chargés à la suite par dashboard.html, sections recopiées
 * à l'octet depuis l'ancien pages-pro.js :
 *   assets/pages-pro-office.js       section 1 (accueil … réservations)
 *   assets/pages-pro.js              restaurant (plan de salle, carte, cuisine,
 *                                    stock) et le registre des pages au premier usage
 *   assets/pages-pro-boutique.js     inventaire et catégories boutique
 *   assets/pages-pro-spa-starter.js  clients du spa et pages de départ
 * Les tests qui lisent la source pour y chercher une fonction ou un motif, ou
 * qui l'exécutent dans vm, lisent les quatre dans l'ordre de chargement : une
 * fonction déplacée reste trouvée, et une interdiction couvre tout le code. */
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const FILES = ['assets/pages-pro-office.js', 'assets/pages-pro.js', 'assets/pages-pro-boutique.js', 'assets/pages-pro-spa-starter.js'];
module.exports = function pagesProSource(base = root) {
  return FILES.map((rel) => fs.readFileSync(path.join(base, rel), 'utf8')).join('\n');
};
module.exports.FILES = FILES;
