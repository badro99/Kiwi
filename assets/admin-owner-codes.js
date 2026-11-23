/* Kiwi · console opérateur · un nouveau code propriétaire alors qu'il en existe un.
 *
 * Le remplacer (le patron a changé de nom et de code) ou l'ajouter à côté (un
 * associé). Remplacer retire les autres lignes propriétaire, dans le même lot,
 * au journal (functions/api/admin/pins.js › replaceOwner). Le formulaire des
 * codes (kiwi-admin.html) demande ici s'il faut remplacer ; ce fichier absent,
 * il ajoute à côté, comme avant. Aucun code ne passe par ici : seulement les
 * intitulés des lignes déjà publiées. */
(function () {
  'use strict';
  var ownerish = function (role) { return /propri|owner|patron|direction/i.test(String(role || '')); };

  async function askReplace(store, merchant, role) {
    if (!ownerish(role)) return false;
    var current = [];
    try { current = (await store.pins(merchant)) || []; } catch (_) { current = []; }
    if (!current.some(function (p) { return ownerish(p.role); })) return false;
    return window.confirm(window.KiwiAdminI18n.text('Remplacer le code propriétaire actuel ? OK : l’ancien ne fonctionnera plus. Annuler : les deux restent.'));
  }

  window.KiwiAdminOwnerCodes = Object.freeze({ askReplace: askReplace });
})();
