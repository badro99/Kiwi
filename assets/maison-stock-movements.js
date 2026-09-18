/* Kiwi · Maison — MOUVEMENTS DE STOCK
 * ═══════════════════════════════════════════════════════════════════════════
 * Le catalogue boutique (assets/boutique-catalog.js) sait déjà COMBIEN il reste :
 * un socle plus des mouvements, fusionnés entre appareils. Ce qu'il ne sait pas
 * dire, c'est POURQUOI. Ses mouvements portent un motif de seize caractères, pas
 * d'employé, pas de source, pas d'avant/après — et ils sont REPLIÉS dans le socle
 * au bout de 45 jours, parce qu'un document de catalogue qui grossit sans fin
 * finit par ne plus passer la synchro. Le jour où un commerçant demande où sont
 * passées douze pièces, il n'y a plus rien à lire.
 *
 * Le registre durable, lui, existe déjà aussi : `inventory_movements` en D1
 * (functions/api/inventory/movements.js), append-only, jamais replié, servi par
 * assets/inventory-ledger.js qui écrit en local d'abord et rejoue ensuite. Ce
 * module est le pont entre les deux :
 *
 *   · le CATALOGUE reste la vérité du stock (la caisse et la fusion en dépendent) ;
 *   · le REGISTRE devient la vérité de l'HISTOIRE — type, quantité avant/après,
 *     employé, source, référence, fournisseur, note, horodatage.
 *
 * Et surtout : le catalogue prévient ce module à CHAQUE changement de stock,
 * quelle qu'en soit l'origine (vente, réception, import, comptage, ±1 au
 * comptoir, correction du tableau de bord). Un stock ne peut donc plus bouger
 * sans laisser d'écriture — c'est le crochet `window.KiwiStockJournal`, pas la
 * discipline des appelants, qui le garantit.
 *
 * Rien de tout cela ne s'allume ailleurs : le journal ne s'enregistre que pour
 * le métier « maison ». Restaurant, hôtel et les autres boutiques gardent
 * exactement le comportement qu'ils avaient. */
(function () {
  'use strict';

  var LEDGER = function () { return window.KiwiInventory || null; };
  var CAT = function () { return window.KiwiBoutiqueCatalog || null; };

  /* ── LE VOCABULAIRE ───────────────────────────────────────────────────────
   * Chaque type dit trois choses : le SENS (entrée/sortie), le motif du registre
   * serveur (`reason`, contraint par la liste fermée de movements.js) et le mot
   * que lit le commerçant. `why` est ce que le catalogue écrit dans son propre
   * journal court — c'est par lui qu'on retrouve le type d'un mouvement venu du
   * catalogue (une vente écrite par la caisse, par exemple).
   * `manual: true` = un humain décide. Ces gestes-là demandent une autorisation
   * (voir `may()`), les autres sont la conséquence d'une vente ou d'un scan. */
  var TYPES = [
    // ── entrées ──────────────────────────────────────────────────────────
    { id: 'initial',        dir: 1,  reason: 'opening',         why: 'initial',   label: 'Stock initial',         entry: true },
    { id: 'reception',      dir: 1,  reason: 'receipt',         why: 'reception', label: 'Réception fournisseur', entry: true, supplier: true, manual: true },
    { id: 'reassort',       dir: 1,  reason: 'receipt',         why: 'reassort',  label: 'Réassort',              entry: true, supplier: true, manual: true },
    { id: 'retour-client',  dir: 1,  reason: 'sale-reversal',   why: 'retour',    label: 'Retour client',         entry: true },
    { id: 'remboursement',  dir: 1,  reason: 'sale-reversal',   why: 'remb',      label: 'Remboursement',         entry: true },
    { id: 'transfert-in',   dir: 1,  reason: 'transfer-in',     why: 'transf-in', label: 'Transfert reçu',        entry: true, manual: true },
    { id: 'correction-in',  dir: 1,  reason: 'manual',          why: 'corr+',     label: 'Correction · entrée',   entry: true, manual: true },
    { id: 'comptage-in',    dir: 1,  reason: 'count',           why: 'comptage',  label: 'Comptage · écart positif', entry: true },
    // ── sorties ──────────────────────────────────────────────────────────
    { id: 'vente',          dir: -1, reason: 'sale',            why: 'vente',     label: 'Vente' },
    { id: 'casse',          dir: -1, reason: 'loss',            why: 'casse',     label: 'Article abîmé',         manual: true },
    { id: 'perte',          dir: -1, reason: 'loss',            why: 'perte',     label: 'Perte',                 manual: true },
    { id: 'echantillon',    dir: -1, reason: 'gift',            why: 'echant',    label: 'Échantillon',           manual: true },
    { id: 'usage-interne',  dir: -1, reason: 'staff-meal',      why: 'interne',   label: 'Usage interne',         manual: true },
    { id: 'retour-fourn',   dir: -1, reason: 'supplier-return', why: 'retour-f',  label: 'Retour fournisseur',    supplier: true, manual: true },
    { id: 'transfert-out',  dir: -1, reason: 'transfer-out',    why: 'transf-out', label: 'Transfert envoyé',     manual: true },
    { id: 'correction-out', dir: -1, reason: 'manual',          why: 'corr-',     label: 'Correction · sortie',   manual: true },
    { id: 'comptage-out',   dir: -1, reason: 'count',           why: 'comptage',  label: 'Comptage · écart négatif' },
  ];
  var BY_ID = Object.create(null);
  var BY_WHY = Object.create(null);
  TYPES.forEach(function (t) {
    BY_ID[t.id] = t;
    if (!BY_WHY[t.why]) BY_WHY[t.why] = t;
  });

  /* Les mouvements que le catalogue écrit sous un motif à lui. Une réservation
   * de paiement n'est PAS un mouvement de marchandise : elle tient le stock le
   * temps du terminal bancaire et se transforme en vente ou se relâche. Elle
   * n'entre donc pas au registre — sinon chaque paiement carte y laisserait
   * deux lignes contradictoires. */
  var TRANSIENT = { reserve: 1, release: 1 };

  function typeById(id) { return BY_ID[String(id || '')] || null; }
  function types() { return TYPES.slice(); }

  /* Le type d'un mouvement venu du catalogue : le motif d'abord (« vente »,
   * « reception »…), le SENS ensuite. Un motif inconnu reste une correction —
   * jamais une vente, qui mentirait sur la recette. */
  function typeForMove(why, delta) {
    var w = String(why || '').split(' ')[0];
    var t = BY_WHY[w];
    if (t && (delta === 0 || (delta > 0) === (t.dir > 0))) return t;
    if (w === 'comptage') return delta > 0 ? BY_ID['comptage-in'] : BY_ID['comptage-out'];
    return delta > 0 ? BY_ID['correction-in'] : BY_ID['correction-out'];
  }

  /* ── QUI A LE DROIT ───────────────────────────────────────────────────────
   * Le serveur tranche pour de bon (movements.js n'accepte un motif
   * discrétionnaire que du propriétaire, d'un opérateur nommé, ou d'une caisse
   * qui présente un code manager vérifié). Ici on ne fait que ne pas proposer un
   * bouton qui serait refusé. */
  function staff() {
    try { return window.KiwiStaff || null; } catch (_) { return null; }
  }
  function role() { var p = staff(); return p && p.role ? String(p.role).toLowerCase() : ''; }
  function actorName() {
    var p = staff();
    if (p && p.name) return String(p.name).slice(0, 64);
    try {
      var o = window.KiwiCaissePairing && window.KiwiCaissePairing.lastOperator && window.KiwiCaissePairing.lastOperator();
      if (o && o.name) return String(o.name).slice(0, 64);
    } catch (_) {}
    return '';
  }

  function onDashboard() { return !!(window.Kiwi && window.Kiwi.appPage); }
  function may(typeId) {
    var t = typeById(typeId);
    if (!t) return false;
    if (!t.manual) return true;
    if (onDashboard()) return true;             // session propriétaire au tableau de bord
    /* Au comptoir, un gérant peut agir seul ; un caissier peut le demander et
       faire autoriser par un responsable (voir `requestManual`). */
    return true;
  }
  /* Au comptoir, TOUT motif discrétionnaire demande la capacité signée — y
   * compris quand c'est la gérante qui tient la caisse. Ce n'est pas une
   * méfiance : le serveur ne connaît qu'un cookie de caisse, il ne peut pas
   * distinguer qui est devant l'écran, et une écriture qu'il refuserait
   * resterait coincée dans la file. Le code frappé est ce qui prouve la
   * personne, et il ne quitte jamais D1. */
  function needsApproval(typeId) {
    var t = typeById(typeId);
    return !!(t && t.manual && !onDashboard());
  }

  /* ── ÉCRITURE AU REGISTRE ─────────────────────────────────────────────────
   * Un mouvement de catalogue et sa ligne de registre partagent le MÊME id :
   * rejouer deux fois (deux onglets, une fusion, un retour de synchro) n'écrit
   * qu'une ligne, côté navigateur comme côté D1. */
  function ledgerId(moveId) { return 'mz-' + String(moveId || '').slice(0, 70); }

  function variantLabel(v) {
    if (!v) return '';
    var bits = [];
    if (v.size) bits.push(String(v.size));
    if (v.colorLabel) bits.push(String(v.colorLabel));
    return bits.join(' · ');
  }

  /* Ce que le registre garde en propre : tout ce que le serveur ne modélise pas
   * en colonnes (avant/après, type lisible, source, fournisseur, libellés). Les
   * libellés sont recopiés à l'instant du mouvement — un produit renommé ou
   * supprimé six mois plus tard laisse quand même une ligne lisible. */
  function metaFor(entry) {
    var meta = {
      module: 'maison', type: entry.type, before: entry.before, after: entry.after,
      source: entry.source || 'dashboard',
    };
    if (entry.product) meta.product = String(entry.product).slice(0, 80);
    if (entry.categoryId) meta.categoryId = String(entry.categoryId).slice(0, 40);
    if (entry.category) meta.category = String(entry.category).slice(0, 60);
    if (entry.variant) meta.variant = String(entry.variant).slice(0, 60);
    if (entry.size) meta.size = String(entry.size).slice(0, 24);
    if (entry.color) meta.color = String(entry.color).slice(0, 40);
    if (entry.supplier) meta.supplier = String(entry.supplier).slice(0, 80);
    return meta;
  }

  /* Le crochet du catalogue. Il reçoit TOUT changement de stock — y compris ceux
   * qu'aucun appel de ce module n'a provoqués — et en fait une ligne de registre.
   * Il ne relance jamais le catalogue : pas de boucle possible. */
  function fromCatalog(change) {
    var L = LEDGER();
    if (!L || !change || !change.variant) return null;
    var delta = Math.round(+change.delta || 0);
    if (!delta) return null;
    if (TRANSIENT[String(change.why || '').split(' ')[0]]) return null;
    var cat = CAT();
    var v = change.variant;
    /* getProduct() rend une FICHE (produit + variantes + catégorie), pas le
       produit : lire `.name` dessus donnait une ligne sans nom et sans rayon. */
    var card = null, p = null, c = null;
    try { card = cat && cat.getProduct ? cat.getProduct(v.productId) : null; } catch (_) {}
    p = card ? card.product : null;
    c = card ? card.category : null;
    var t = change.type ? typeById(change.type) : null;
    if (!t) t = typeForMove(change.why, delta);
    var occurred = Math.max(1, Math.round(+change.at || Date.now()));
    return L.add({
      id: ledgerId(change.id || ('cat-' + occurred + '-' + v.id)),
      itemId: v.productId, variantId: v.id,
      qty: delta, reason: t.reason,
      unitCost: p && p.cost != null ? +p.cost : null,
      refType: change.refType || (change.ref ? 'sale' : t.id),
      refId: change.ref || '',
      note: String(change.note || '').slice(0, 500),
      actor: String(change.actor || '').slice(0, 100),
      occurredTs: occurred,
      meta: metaFor({
        type: t.id, before: change.before, after: change.after,
        source: change.source || (onDashboard() ? 'dashboard' : 'caisse'),
        product: p ? p.name : '', categoryId: p ? p.categoryId : '', category: c ? c.name : '',
        variant: variantLabel(v), size: v.size, color: v.colorLabel, supplier: change.supplier,
      }),
    });
  }

  /* ── LE GESTE MÉTIER ──────────────────────────────────────────────────────
   * Un seul chemin pour « je sors trois pièces pour casse » : on bouge le
   * catalogue, il rappelle `fromCatalog`, le registre reçoit la ligne complète.
   * L'appelant ne compose jamais la ligne lui-même — c'est ce qui empêche un
   * mouvement d'exister sans que le stock ait bougé, et l'inverse. */
  function record(opts) {
    opts = opts || {};
    var cat = CAT();
    var t = typeById(opts.type);
    if (!cat || !t) return { ok: false, reason: 'type' };
    var qty = Math.abs(Math.trunc(+opts.qty || 0));
    if (!qty) return { ok: false, reason: 'quantite' };
    if (!may(t.id)) return { ok: false, reason: 'non-autorise' };
    var v = null;
    try { v = (cat.listVariants(opts.productId) || []).find(function (x) { return x.id === opts.variantId; }) || null; } catch (_) {}
    if (!v && opts.variantId && cat._doc) {
      try { v = (cat._doc().variants || []).find(function (x) { return x.id === opts.variantId; }) || null; } catch (_) {}
    }
    if (!v) return { ok: false, reason: 'variante-introuvable' };
    var before = Math.max(0, +v.stock || 0);
    if (t.dir < 0 && before < qty) return { ok: false, reason: 'stock-insuffisant', before: before };
    pending = {
      type: t.id, note: opts.note || '', supplier: opts.supplier || '',
      source: opts.source || (onDashboard() ? 'dashboard' : 'caisse'),
      actor: opts.actor || actorName(), refType: t.id,
    };
    lastRow = null;
    try {
      cat.adjustStock(v.id, t.dir * qty, t.why, { actor: pending.actor, ref: opts.ref || '' });
    } finally { pending = null; }
    return { ok: true, before: before, after: before + t.dir * qty, type: t.id, row: lastRow };
  }

  /* Ce que le geste en cours veut dire, le temps d'un aller-retour dans le
   * catalogue. Le crochet est synchrone : il lit ceci et le repose aussitôt. */
  var pending = null;
  var lastRow = null;   // la ligne de registre que le dernier geste vient d'écrire

  /* ── LECTURE ──────────────────────────────────────────────────────────────
   * Le registre local contient tous les métiers d'un même établissement
   * (l'économat d'un restaurant écrit dans la même table). On ne rend donc que
   * les lignes de ce module. */
  function decorate(row) {
    var meta = (row && row.meta) || {};
    var t = typeById(meta.type) || typeForMove('', +row.qty || 0);
    return {
      id: row.id, at: +row.occurredTs || 0, qty: +row.qty || 0,
      type: t ? t.id : 'correction-in', typeLabel: t ? t.label : '—',
      dir: (+row.qty || 0) >= 0 ? 1 : -1,
      before: meta.before == null ? null : +meta.before,
      after: meta.after == null ? null : +meta.after,
      productId: row.itemId, product: meta.product || '',
      categoryId: meta.categoryId || '', category: meta.category || '',
      variantId: row.variantId, variant: meta.variant || '',
      size: meta.size || '', color: meta.color || '',
      actor: row.actor || '', source: meta.source || '', supplier: meta.supplier || '',
      ref: row.refId || '', note: row.note || '', reason: row.reason,
      pending: !(+row.cursor > 0),
    };
  }

  function all() {
    var L = LEDGER();
    if (!L) return [];
    return L.history().filter(function (r) {
      return r && r.meta && r.meta.module === 'maison';
    }).map(decorate);
  }

  function list(filter) {
    filter = filter || {};
    var q = String(filter.q || '').trim().toLowerCase();
    return all().filter(function (m) {
      if (filter.from && m.at < +filter.from) return false;
      if (filter.to && m.at > +filter.to) return false;
      if (filter.productId && m.productId !== filter.productId) return false;
      if (filter.variantId && m.variantId !== filter.variantId) return false;
      if (filter.categoryId && m.categoryId !== filter.categoryId) return false;
      if (filter.type && m.type !== filter.type) return false;
      if (filter.dir && m.dir !== +filter.dir) return false;
      if (filter.actor && m.actor !== filter.actor) return false;
      if (filter.supplier && m.supplier !== filter.supplier) return false;
      if (filter.source && m.source !== filter.source) return false;
      if (q) {
        var hay = [m.product, m.variant, m.actor, m.supplier, m.ref, m.note, m.typeLabel].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return b.at - a.at; });
  }

  function productHistory(productId, limit) {
    var rows = list({ productId: productId });
    return limit ? rows.slice(0, limit) : rows;
  }

  /* Les valeurs proposées par les filtres : celles qui existent VRAIMENT dans le
   * journal de ce magasin, jamais une liste théorique. */
  function facets() {
    var rows = all();
    var out = { actors: [], suppliers: [], types: [], categories: [] };
    var seen = { actors: {}, suppliers: {}, types: {}, categories: {} };
    rows.forEach(function (m) {
      if (m.actor && !seen.actors[m.actor]) { seen.actors[m.actor] = 1; out.actors.push(m.actor); }
      if (m.supplier && !seen.suppliers[m.supplier]) { seen.suppliers[m.supplier] = 1; out.suppliers.push(m.supplier); }
      if (m.type && !seen.types[m.type]) { seen.types[m.type] = 1; out.types.push(m.type); }
      if (m.categoryId && !seen.categories[m.categoryId]) {
        seen.categories[m.categoryId] = 1; out.categories.push({ id: m.categoryId, name: m.category || m.categoryId });
      }
    });
    out.actors.sort(); out.suppliers.sort();
    return out;
  }

  function totals(rows) {
    var t = { entries: 0, exits: 0, count: rows.length, pieces: 0 };
    rows.forEach(function (m) {
      if (m.qty > 0) t.entries += m.qty; else t.exits += -m.qty;
      t.pieces += Math.abs(m.qty);
    });
    return t;
  }

  /* ── BRANCHEMENT ──────────────────────────────────────────────────────────
   * Le catalogue n'appelle ce journal que s'il est posé. On ne le pose que pour
   * « maison » : les autres métiers gardent leur comportement au bit près. */
  function isMaison() {
    try {
      if (window.KiwiStoreTemplates && window.KiwiStoreTemplates.currentTrade
          && String(window.KiwiStoreTemplates.currentTrade()) === 'maison') return true;
    } catch (_) {}
    try {
      var v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (v && String(v.subtype || '') === 'maison') return true;
    } catch (_) {}
    try { return String(localStorage.getItem('kiwiBizType') || '') === 'maison'; } catch (_) { return false; }
  }

  function attach() {
    if (window.KiwiStockJournal && window.KiwiStockJournal.__maison) return true;
    window.KiwiStockJournal = {
      __maison: true,
      /* Appelé par assets/boutique-catalog.js APRÈS que le stock a bougé. */
      record: function (change) {
        try {
          if (pending) {
            change = Object.assign({}, change, {
              type: pending.type, note: change.note || pending.note,
              supplier: pending.supplier, source: pending.source,
              actor: change.actor || pending.actor, refType: pending.refType,
            });
          }
          /* `record()` lit cette ligne juste après son adjustStock : c'est elle
             que requestManual fait autoriser puis envoie. Rendue sans être
             retenue, le comptoir ne demandait jamais le code responsable et
             chaque mouvement déclaré restait refusé sur la tablette. */
          lastRow = fromCatalog(change);
          return lastRow;
        } catch (_) { return null; }
      },
    };
    return true;
  }
  function enable() { return attach(); }
  function autoAttach() { if (isMaison()) attach(); }

  /* ── LE COMPTOIR QUI DÉCLARE UNE CASSE ────────────────────────────────────
   * La file du registre (inventory-ledger.js) poste sans autorisation : un motif
   * discrétionnaire envoyé par une caisse reviendrait en 403 et resterait coincé
   * à retenter toutes les vingt secondes. Un mouvement déclaré au comptoir part
   * donc TOUT DE SUITE, avec la capacité signée par le code du responsable, et
   * on acquitte la file avec le curseur rendu par le serveur.
   * Hors ligne, on refuse : une déclaration de perte qu'on ne peut pas faire
   * autoriser n'est pas une déclaration, et on préfère le dire à l'employé
   * plutôt que de bouger le stock sur la foi d'un accord jamais vérifié. */
  function pushApproved(row, approval) {
    var L = LEDGER();
    if (!L || !row) return Promise.resolve({ ok: false, reason: 'registre' });
    return fetch('/api/inventory/movements', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant: L.merchant(), movements: [row], approval: approval || '',
        terminalId: L.terminalId(),
      }),
    }).then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.j || !res.j.ok) {
          return { ok: false, reason: (res.j && res.j.error) || ('http-' + res.status) };
        }
        var accepted = (res.j.accepted || [])[0];
        L.acknowledge([Object.assign({}, row, { cursor: accepted ? accepted.cursor : 1 })]);
        return { ok: true };
      })
      .catch(function () { return { ok: false, reason: 'reseau' }; });
  }

  /* Le geste complet, côté caisse : on prépare le mouvement, on le fait
   * autoriser s'il le faut, on l'envoie. `undo` existe parce que le stock a
   * déjà bougé quand le serveur refuse — on remet alors la marchandise là où
   * elle était, avec un contre-mouvement qui se raconte lui aussi. */
  function undo(result, typeId) {
    var t = typeById(typeId);
    if (!result || !result.ok || !t) return;
    var back = t.dir > 0 ? (t.entry ? 'correction-out' : 'correction-out') : 'correction-in';
    record({
      variantId: result.row && result.row.variantId, type: back,
      qty: Math.abs(result.after - result.before),
      note: 'Annulation · autorisation refusée', source: 'caisse',
    });
  }

  function requestManual(opts) {
    opts = opts || {};
    var res = record(opts);
    if (!res.ok) return Promise.resolve(res);
    if (!needsApproval(opts.type) || !res.row) return Promise.resolve(res);
    var ask = window.requireManager;
    if (typeof ask !== 'function') return Promise.resolve(res);
    var t = typeById(opts.type);
    return new Promise(function (resolve) {
      var settled = false;
      ask(t.label + ' · ' + Math.abs(res.after - res.before) + ' pièce(s)', function () {
        settled = true;
        var mgr = null;
        try { mgr = window.KiwiCaissePairing && window.KiwiCaissePairing.lastManager(); } catch (_) {}
        pushApproved(res.row, (mgr && mgr.approval) || '').then(function (out) {
          if (!out.ok) { undo(res, opts.type); resolve({ ok: false, reason: out.reason }); return; }
          resolve(Object.assign({}, res, { approvedBy: (mgr && mgr.name) || '' }));
        });
      }, { kind: 'inventory', movementIds: [res.row.id] });
      /* Le pavé refermé sans code validé : le mouvement n'a jamais été
         autorisé, donc la marchandise revient d'où elle vient. On surveille la
         fermeture du pavé plutôt qu'un délai fixe — le responsable prend le
         temps qu'il prend. */
      var watch = setInterval(function () {
        if (settled) { clearInterval(watch); return; }
        var modal = document.getElementById('manager-modal');
        if (modal && modal.classList.contains('is-open')) return;
        clearInterval(watch);
        settled = true; undo(res, opts.type); resolve({ ok: false, reason: 'non-autorise' });
      }, 400);
    });
  }

  window.KiwiMaisonStock = {
    types: types, typeById: typeById, typeForMove: typeForMove,
    record: record, requestManual: requestManual, pushApproved: pushApproved,
    needsApproval: needsApproval, list: list, all: all, productHistory: productHistory,
    facets: facets, totals: totals, may: may, actorName: actorName,
    enable: enable, isMaison: isMaison, _decorate: decorate, _fromCatalog: fromCatalog,
  };

  autoAttach();
  try {
    if (window.KiwiVenue && window.KiwiVenue.subscribe) window.KiwiVenue.subscribe(autoAttach);
  } catch (_) {}
}());
