/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG · le rayon et la réserve
 * ---------------------------------------------------------------------------
 * Une partie de window.KiwiBoutiqueCatalog (assets/boutique-catalog.js),
 * chargée après assets/boutique-catalog-parts.js (qui crée le registre) et
 * avant lui. La caisse charge les deux en un seul fichier,
 * assets/boutique-catalog-till.js (cat parts + shelf). Facultative : sans elle, le catalogue s'écrit en entier
 * dans le stockage rapide, comme avant.
 *
 * Pourquoi. Un catalogue repris d'une autre caisse traîne des milliers de
 * références épuisées. La Maison en Vogue (20 nov. 2026) : 2 948 articles dont
 * 2 442 à zéro, 2,5 Mo de JSON, dans un stockage rapide (localStorage) de
 * ~5 M caractères qu'il partage avec les ventes et le carnet clients. Plein,
 * l'écriture échouait, la caisse restait sur une vieille copie de 91 articles.
 *
 * Le découpage. Au-delà de SPLIT_AT, le stockage rapide ne garde que le RAYON :
 * les articles en stock, les services et les articles sans déclinaison, avec
 * leurs déclinaisons, les catégories, les suppressions et le journal (~430 Ko
 * chez Vogue). Il porte la marque `_shelf`. Le catalogue COMPLET part dans la
 * réserve : IndexedDB (base « kiwi-catalog », la même que le secours), sans
 * plafond pratique. À l'ouverture la caisse dessine le rayon tout de suite ;
 * la réserve rejoint la mémoire quelques millisecondes plus tard.
 *
 * Les trois règles qui rendent ça sûr (assets/boutique-catalog-parts.js) :
 *   1. `partial` : tant que la mémoire n'a que le rayon, rien ne remonte au
 *      serveur. Le serveur reçoit toujours le document ENTIER ; le rayon seul
 *      effacerait en ligne tout ce qui est épuisé. pushNow() relit d'abord.
 *   2. pull() ne conclut jamais « déjà à jour » sur le rayon seul : sans
 *      réserve lisible (navigateur nettoyé), la copie serveur complète revient.
 *   3. Le serveur lui-même refuse un envoi qui omet des articles sans les avoir
 *      supprimés (functions/api/catalog.js, « items-omitted ») : un onglet
 *      d'avant ce découpage qui lirait un rayon ne peut rien effacer.
 *
 * La réserve n'est réécrite que depuis une mémoire complète. Chaque réécriture
 * réussie touche FULL_KEY pour que les autres onglets la relisent.
 * tools/catalog-shelf-split-test.mjs.
 * ═══════════════════════════════════════════════════════════════════════════ */
window.__kiwiBoutiqueCatalogParts.shelf = function () {
  'use strict';
  const SPLIT_AT = 1000000;
  const FULL_KEY = (key) => 'kiwiCatalogFull:' + key;

  /* Le rayon : ce qui peut se vendre. Un article sans déclinaison ou un
     service reste (son stock ne se lit pas sur ses déclinaisons). */
  function shelfOf(doc) {
    const vs = doc.variants || [], live = new Set(), hasVar = new Set();
    vs.forEach((v) => { if (!v) return; hasVar.add(v.productId); if ((+v.stock || 0) > 0) live.add(v.productId); });
    const keep = (p) => p && (p.format === 'service' || !hasVar.has(p.id) || live.has(p.id));
    const products = (doc.products || []).filter(keep);
    const ids = new Set(products.map((p) => p.id));
    return Object.assign({}, doc, {
      products, variants: vs.filter((v) => v && ids.has(v.productId)),
      _shelf: { cold: (doc.products || []).length - products.length },
    });
  }

  /* Ce qui s'écrit dans le stockage rapide. Une mémoire partielle s'écrit
     toujours en rayon : elle ne doit jamais passer pour un catalogue entier. */
  function text(doc, partial) {
    const full = JSON.stringify(doc);
    if (!partial && full.length <= SPLIT_AT) return { text: full, split: false };
    return { text: JSON.stringify(shelfOf(doc)), split: true };
  }

  /* Le catalogue complet dans la réserve. `done(kept)` dit si elle a pris ;
     un succès prévient les autres onglets. Rend `ok` (l'écriture rapide). */
  function keep(well, key, doc, owner, done, ok) {
    well.save(key, doc, (kept) => {
      done(kept);
      if (kept) { try { localStorage.setItem(FULL_KEY(key), Date.now().toString(36)); } catch (e) {} }
    }, owner);
    return ok;
  }

  return { SPLIT_AT, FULL_KEY, shelfOf, text, keep };
};
