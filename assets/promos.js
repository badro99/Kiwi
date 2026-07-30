/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PROMOTIONS — window.KiwiPromos
 * ---------------------------------------------------------------------------
 * Le moteur de promotions de la boutique. Une promotion n'est PAS une remise :
 * une remise est un geste (la gérante accorde −10 % à cette cliente-ci, sur ce
 * ticket-là) ; une promotion est une RÈGLE que le magasin pose une fois et qui
 * s'applique toute seule, à tous les articles qu'elle vise, pendant toute sa
 * durée, sans que personne au comptoir ait à s'en souvenir.
 *
 * C'est pour ça que ce fichier existe à côté d'assets/pos-boutique.js plutôt
 * que dedans : les règles de prix doivent être lisibles et vérifiables SANS
 * navigateur (voir tools/promos-test.js). Aucun DOM ici, uniquement la règle.
 *
 * ── Ce qu'une promotion peut viser ────────────────────────────────────────
 *   tout      · tout le magasin
 *   rayon     · un ou plusieurs rayons
 *   produits  · des articles choisis un par un
 *   avant     · tout ce qui est entré en stock avant une date  (déstockage)
 *   stock     · tout ce qui descend à N pièces ou moins        (fins de série)
 *
 * ── LA RÈGLE QUI COMPTE : deux promotions sur un même article ─────────────
 * Elles ne s'additionnent JAMAIS. Le prix le PLUS BAS pour la cliente gagne,
 * et lui seul. C'est le seul arbitrage qu'une caissière peut défendre devant
 * quelqu'un qui a lu les deux affiches en vitrine : « c'est la meilleure des
 * deux qui s'applique ». Prendre la dernière créée, ou les cumuler, produit un
 * prix que personne ne sait expliquer — et, en cumulé, des tickets à zéro.
 * À prix égal, c'est la plus ancienne qui l'emporte : l'affichage ne saute pas
 * quand le commerçant crée une promotion équivalente.
 *
 * La remise gérante, elle, reste possible PAR-DESSUS le prix promo (c'est un
 * geste d'autorité, le refuser en silence serait pire) — mais pos-boutique.js
 * l'affiche alors ligne à ligne, les deux baisses nommées séparément.
 *
 * Les prix sont des ENTIERS de dirhams, comme partout ailleurs dans la caisse.
 * Une promotion ne peut pas descendre un prix sous zéro.
 *
 * Persistance : par magasin (comme le catalogue), et remontée au serveur via
 * assets/cloud-doc.js — une promotion posée depuis le bureau doit atteindre le
 * comptoir, et une caisse qui l'ignore vendrait au prix fort pendant que la
 * vitrine annonce −30 %.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEMO_VENUE = 'maisonMansour';
  var keyFor = function (v) { return 'kiwi:bqPromos:v1:' + v; };
  var VENUE = DEMO_VENUE;
  var KEY = keyFor(VENUE);

  var db = null;              /* { v, promos:[], deleted:[] } */
  var subs = new Set();
  var doc = null;             /* poignée cloud-doc */
  var batching = 0, dirty = false;

  function blank() { return { v: 1, promos: [], deleted: [] }; }

  function load() {
    if (db) return db;
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      db = (raw && typeof raw === 'object' && Array.isArray(raw.promos)) ? raw : blank();
      if (!Array.isArray(db.deleted)) db.deleted = [];
    } catch (_) { db = blank(); }
    return db;
  }

  function commit() {
    if (batching) { dirty = true; return; }
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {}
    subs.forEach(function (fn) { try { fn(); } catch (_) {} });
    if (doc && doc.push) { try { doc.push(); } catch (_) {} }
  }
  function batch(fn) {
    batching++;
    try { fn(); } finally {
      batching--;
      if (!batching && dirty) { dirty = false; commit(); }
    }
  }

  function use(venueId) {
    var v = venueId || DEMO_VENUE;
    if (v === VENUE) return;
    VENUE = v; KEY = keyFor(v); db = null;
    load();
    subs.forEach(function (fn) { try { fn(); } catch (_) {} });
  }

  /* ───────────────────────── normalisation ─────────────────────────
     Tout ce qui entre — saisie d'écran, document venu du serveur, copie
     restaurée d'une version antérieure — repasse par ici. Une promotion mal
     formée ne doit pas pouvoir fausser un prix : à la moindre valeur illisible
     on retombe sur quelque chose d'inoffensif (0 %, aucune cible). */
  var KINDS = ['percent', 'amount', 'fixed'];
  var SCOPES = ['tout', 'rayon', 'produits', 'avant', 'stock'];
  var seq = 0;

  function newId() {
    seq++;
    return 'pr_' + Math.random().toString(36).slice(2, 8) + seq.toString(36);
  }
  function num(v, dflt) { var n = +v; return Number.isFinite(n) ? n : (dflt || 0); }
  function str(v) { return String(v == null ? '' : v); }

  function normalize(p) {
    p = p || {};
    var kind = KINDS.indexOf(p.kind) >= 0 ? p.kind : 'percent';
    var value = Math.max(0, Math.round(num(p.value, 0)));
    if (kind === 'percent') value = Math.min(100, value);
    var sc = (p.scope && typeof p.scope === 'object') ? p.scope : {};
    var type = SCOPES.indexOf(sc.type) >= 0 ? sc.type : 'tout';
    var scope = { type: type };
    if (type === 'rayon' || type === 'produits') {
      scope.ids = Array.isArray(sc.ids) ? sc.ids.map(str).filter(Boolean) : [];
    }
    /* `avant` sans date ne vise RIEN (et non pas « tout ») : une cible vide qui
       se lit comme le magasin entier, c'est le magasin bradé par accident. */
    if (type === 'avant') scope.before = num(sc.before, 0);
    if (type === 'stock') scope.max = Math.max(0, Math.round(num(sc.max, 0)));
    return {
      id: str(p.id) || newId(),
      name: str(p.name).slice(0, 80) || 'Promotion',
      badge: str(p.badge).slice(0, 24),
      kind: kind,
      value: value,
      scope: scope,
      from: num(p.from, 0) || 0,          /* 0 = démarre tout de suite */
      to: num(p.to, 0) || 0,              /* 0 = sans date de fin */
      paused: !!p.paused,
      createdAt: num(p.createdAt, 0) || Date.now(),
      updatedAt: num(p.updatedAt, 0) || Date.now(),
    };
  }

  /* Le libellé porté par l'article en rayon. Dérivé quand le commerçant n'a
     rien écrit, pour qu'une pastille ne soit jamais vide sur une carte. */
  function badgeOf(p) {
    if (p.badge) return p.badge;
    if (p.kind === 'percent') return '−' + p.value + ' %';
    if (p.kind === 'amount') return '−' + p.value + ' MAD';
    return p.value + ' MAD';
  }

  /* ───────────────────────── état dans le temps ─────────────────────────
     Jamais stocké : un état rangé en base est un état qui ment dès le
     lendemain matin. On le recalcule à chaque lecture, à partir des dates. */
  function status(p, now) {
    now = now || Date.now();
    if (p.paused) return 'paused';
    if (p.to && now > p.to) return 'ended';
    if (p.from && now < p.from) return 'scheduled';
    return 'active';
  }
  var isRunning = function (p, now) { return status(p, now) === 'active'; };

  function list() { load(); return db.promos.map(normalize); }
  function get(id) { load(); var p = db.promos.find(function (x) { return x.id === id; }); return p ? normalize(p) : null; }
  function active(now) { return list().filter(function (p) { return isRunning(p, now); }); }

  function save(patch) {
    load();
    var next = normalize(patch);
    next.updatedAt = Date.now();
    var i = db.promos.findIndex(function (x) { return x.id === next.id; });
    if (i >= 0) { next.createdAt = num(db.promos[i].createdAt, next.createdAt); db.promos[i] = next; }
    else db.promos.push(next);
    /* Ressusciter une promotion supprimée ailleurs : on lève la pierre tombale,
       sinon la fusion suivante la re-supprimerait dans le dos du commerçant. */
    db.deleted = db.deleted.filter(function (d) { return d.id !== next.id; });
    commit();
    return next;
  }

  /* Une suppression laisse une trace datée. Sans elle, la caisse d'à côté
     renverrait la promotion effacée au prochain échange, indéfiniment — c'est
     exactement ce qui arrivait aux articles de stock.js avant `delItems`. */
  function remove(id) {
    load();
    var before = db.promos.length;
    db.promos = db.promos.filter(function (x) { return x.id !== id; });
    if (db.promos.length === before) return false;
    db.deleted.push({ id: id, at: Date.now() });
    commit();
    return true;
  }
  function setPaused(id, val) {
    load();
    var p = db.promos.find(function (x) { return x.id === id; });
    if (!p) return null;
    p.paused = !!val;
    p.updatedAt = Date.now();
    commit();
    return normalize(p);
  }

  /* ───────────────────────── la cible ─────────────────────────
     `item` est un article du catalogue tel que KiwiBoutiqueCatalog.compat() le
     rend : { id, rayon, price, cost, createdAt, sizes }. `stock` est passé à
     part parce que la caisse tient une projection vivante (les articles retenus
     par le ticket en cours) que le catalogue ne connaît pas encore. */
  function stockOf(item) {
    if (!item || !item.sizes) return 0;
    return Object.keys(item.sizes).reduce(function (s, k) { return s + (+item.sizes[k] || 0); }, 0);
  }

  function matches(p, item, stock) {
    if (!p || !item) return false;
    var sc = p.scope || {};
    if (sc.type === 'tout') return true;
    if (sc.type === 'rayon') return (sc.ids || []).indexOf(item.rayon) >= 0;
    if (sc.type === 'produits') return (sc.ids || []).indexOf(item.id) >= 0;
    if (sc.type === 'avant') return !!sc.before && !!item.createdAt && item.createdAt < sc.before;
    if (sc.type === 'stock') {
      var n = (stock == null) ? stockOf(item) : stock;
      /* Un article épuisé ne porte pas d'affiche « fin de série » : la pastille
         promettrait un prix sur une étagère vide. */
      return n > 0 && n <= (sc.max || 0);
    }
    return false;
  }

  function applyTo(p, price) {
    var base = Math.max(0, Math.round(num(price, 0)));
    var out = base;
    if (p.kind === 'percent') out = Math.round(base * (100 - p.value) / 100);
    else if (p.kind === 'amount') out = base - p.value;
    else out = p.value;                       /* prix fixe */
    return Math.max(0, Math.min(base, Math.round(out)));   /* jamais négatif, jamais plus cher */
  }

  /* Le prix effectif d'un article, et la promotion qui l'explique.
     Rend null quand rien ne s'applique — l'appelant garde alors son prix
     catalogue, ce qui est le comportement d'avant ce fichier. */
  function priceFor(item, opts) {
    opts = opts || {};
    if (!item) return null;
    var now = opts.now || Date.now();
    var stock = opts.stock;
    var was = Math.max(0, Math.round(num(item.price, 0)));
    var best = null;
    list().forEach(function (p) {
      if (!isRunning(p, now)) return;
      if (!matches(p, item, stock)) return;
      var price = applyTo(p, was);
      if (price >= was) return;               /* une promotion qui ne baisse rien n'existe pas */
      if (!best
          || price < best.price
          || (price === best.price && p.createdAt < best.promo.createdAt)) {
        best = { price: price, was: was, off: was - price, promo: p, badge: badgeOf(p) };
      }
    });
    return best;
  }

  /* Ce que la promotion coûterait au magasin sur un catalogue donné — la
     réponse que le commerçant veut AVANT d'enregistrer, pas après. `under` est
     le nombre d'articles qui passeraient sous leur prix d'achat : déstocker à
     perte est une décision légitime, la prendre sans le savoir ne l'est pas. */
  function preview(p, items, opts) {
    opts = opts || {};
    var norm = normalize(p);
    var out = { count: 0, under: 0, from: 0, to: 0, sample: [] };
    (items || []).forEach(function (item) {
      if (!matches(norm, item, opts.stockOf ? opts.stockOf(item) : null)) return;
      var was = Math.max(0, Math.round(num(item.price, 0)));
      var price = applyTo(norm, was);
      if (price >= was) return;
      out.count++;
      out.from += was;
      out.to += price;
      var cost = Math.round(num(item.cost, 0));
      if (cost > 0 && price < cost) out.under++;
      if (out.sample.length < 8) out.sample.push({ id: item.id, name: item.name, was: was, price: price, under: cost > 0 && price < cost });
    });
    return out;
  }

  /* ───────────────────────── fusion multi-caisses ─────────────────────────
     mergeDefault() de cloud-doc.js unit les listes par identifiant mais garde
     TOUJOURS notre version en cas de conflit : la promotion corrigée au bureau
     n'atteindrait jamais le comptoir. On arbitre donc par `updatedAt`, et deux
     suppressions s'additionnent au lieu de s'annuler (même raison que
     `delItems` dans assets/stock.js). */
  function merge(mine, theirs) {
    if (!theirs) return mine;
    if (!mine) return theirs;
    var tomb = Object.create(null);
    var deleted = [];
    [mine.deleted, theirs.deleted].forEach(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (d) {
        if (!d || !d.id) return;
        var at = num(d.at, 0);
        if (!tomb[d.id] || at > tomb[d.id]) tomb[d.id] = at;
      });
    });
    Object.keys(tomb).forEach(function (id) { deleted.push({ id: id, at: tomb[id] }); });

    var by = Object.create(null);
    [mine.promos, theirs.promos].forEach(function (arr) {
      (Array.isArray(arr) ? arr : []).forEach(function (raw) {
        var p = normalize(raw);
        var cur = by[p.id];
        if (!cur || p.updatedAt > cur.updatedAt) by[p.id] = p;
      });
    });
    var promos = Object.keys(by)
      .map(function (id) { return by[id]; })
      /* Une pierre tombale ne l'emporte que si elle est POSTÉRIEURE à la
         dernière modification : sinon rouvrir une promotion supprimée hier
         serait impossible. */
      .filter(function (p) { return !(tomb[p.id] && tomb[p.id] >= p.updatedAt); })
      .sort(function (a, b) { return a.createdAt - b.createdAt; });

    return { v: 1, promos: promos, deleted: deleted };
  }

  function isEmpty(d) {
    return !d || (!(d.promos && d.promos.length) && !(d.deleted && d.deleted.length));
  }

  function cloud(slugFn) {
    if (doc || !window.KiwiCloudDoc) return doc;
    doc = window.KiwiCloudDoc.attach({
      /* Must match functions/api/store.js. `promos` was rejected as an unknown
       * feature, so rules appeared locally but never reached another device. */
      feature: 'promotions',
      slug: slugFn || window.KiwiCloudDoc.currentSlug,
      localKey: function () { return VENUE; },
      read: function () { load(); return db; },
      write: function (d) {
        db = (d && Array.isArray(d.promos)) ? d : blank();
        if (!Array.isArray(db.deleted)) db.deleted = [];
        try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) {}
        subs.forEach(function (fn) { try { fn(); } catch (_) {} });
      },
      merge: merge,
      isEmpty: isEmpty,
    });
    return doc;
  }

  function stats(now) {
    var all = list();
    var n = now || Date.now();
    return {
      total: all.length,
      active: all.filter(function (p) { return status(p, n) === 'active'; }).length,
      scheduled: all.filter(function (p) { return status(p, n) === 'scheduled'; }).length,
      paused: all.filter(function (p) { return status(p, n) === 'paused'; }).length,
      ended: all.filter(function (p) { return status(p, n) === 'ended'; }).length,
    };
  }

  window.KiwiPromos = {
    use: use, currentVenue: function () { return VENUE; }, demoVenue: DEMO_VENUE,
    load: load, batch: function (fn) { load(); batch(fn); },
    subscribe: function (fn) { load(); subs.add(fn); return function () { subs.delete(fn); }; },
    list: list, get: get, active: active, save: save, remove: remove, setPaused: setPaused,
    status: status, isRunning: isRunning, badgeOf: badgeOf, normalize: normalize,
    matches: matches, applyTo: applyTo, priceFor: priceFor, preview: preview, stockOf: stockOf,
    merge: merge, isEmpty: isEmpty, cloud: cloud, stats: stats,
    reset: function () { db = blank(); commit(); },
  };
})();
