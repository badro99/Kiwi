/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG · le journal du stock
 * ---------------------------------------------------------------------------
 * Une partie de window.KiwiBoutiqueCatalog (assets/boutique-catalog.js), sortie
 * du fichier principal telle quelle : le stock comme journal (socle + mouvements),
 * son repli (compaction), les suppressions datées, et la fusion de deux copies
 * du catalogue. Aucun réseau ici, aucun écouteur : des règles sur un document.
 *
 * Ce fichier ne fait que DÉCLARER des fabriques (celle-ci, puis `sync` et `csv`
 * plus bas) ; c'est boutique-catalog.js qui les appelle, avec l'état qu'il
 * possède (`core.db`). À charger AVANT boutique-catalog.js.
 *
 * Les deux moitiés de ce fichier (journal du stock, puis échanges avec le
 * serveur et export) étaient deux fichiers ; réunies telles quelles pour tenir
 * le nombre de <script src> des coquilles (tools/file-size-ratchet-test.mjs).
 * ═══════════════════════════════════════════════════════════════════════════ */
window.__kiwiBoutiqueCatalogParts = window.__kiwiBoutiqueCatalogParts || {};
window.__kiwiBoutiqueCatalogParts.ledger = function (core) {
  'use strict';

  /* ═══ LE STOCK EST UN JOURNAL, PAS UN NOMBRE ════════════════════════════════
   *
   * Première version : chaque déclinaison portait `stock`, un nombre, et la
   * fusion gardait celui de l'appareil local. Un onglet resté ouvert
   * réécrasait donc le stock vendu par la caisse, indéfiniment (cf. 4 078).
   *
   * Deuxième version : `stockAt`, un horodatage, et la fusion gardait le plus
   * récent. Ça règle l'écrasement par un document périmé — mais pas le vrai
   * problème du comptage à deux mains : DEUX VENTES SIMULTANÉES NE S'ADDITIONNENT
   * PAS. La caisse vend 2 (10 → 8), le tableau de bord en vend 1 (10 → 9) dans
   * la même minute ; « le plus récent gagne » retient 8 ou 9, jamais 7. Un
   * article part sans sortir du stock, et personne ne peut le voir.
   *
   * Un nombre absolu ne PEUT pas fusionner : il dit où l'on est arrivé, pas ce
   * qui s'est passé. Deux personnes qui décrivent leur arrivée ne se
   * réconcilient pas ; deux personnes qui décrivent leurs PAS, si.
   *
   * D'où ce modèle, à deux étages :
   *
   *   · UN SOCLE. `base` + `baseAt` — un comptage ABSOLU, posé par un geste qui
   *     affirme un état : création de la déclinaison, inventaire physique,
   *     saisie directe d'une quantité. Il ANNULE tout ce qui précède : quand on
   *     compte les cartons à la main, l'historique d'avant ne discute pas.
   *
   *   · DES MOUVEMENTS. `db.moves` — une vente, un retour, une réception, un
   *     ±1 au comptoir : chacun est une écriture IMMUABLE, avec un id unique
   *     par appareil, un delta et un instant. Deux appareils qui vendent en
   *     même temps produisent deux mouvements DIFFÉRENTS, donc l'union les
   *     garde tous les deux, donc les deux ventes comptent. Idempotent : le
   *     même mouvement reçu deux fois reste un mouvement.
   *
   * `stock` continue d'exister, matérialisé (socle + somme des mouvements
   * postérieurs). Les cent lecteurs de `v.stock` — grilles, ruptures, valeur
   * d'inventaire, étiquettes, recherche — n'ont pas à savoir tout ceci. Seuls
   * les ÉCRIVAINS et la fusion changent.
   *
   * COMPACTION. Un journal qui ne se vide jamais finit par peser plus que le
   * catalogue. Les mouvements de plus de MOVE_DAYS jours sont donc REPLIÉS dans
   * le socle — jamais jetés : `base += Σ deltas`, `baseAt = leur dernier
   * instant`. Le stock matérialisé ne bouge pas d'une unité. Et comme la règle
   * de fusion ne retient que les mouvements POSTÉRIEURS au socle le plus
   * récent, un appareil qui a compacté et un appareil qui ne l'a pas encore
   * fait arrivent au même nombre.
   * ══════════════════════════════════════════════════════════════════════════ */
  var MOVE_DAYS = 45;
  var MOVE_MAX = 12000;

  /* L'appareil, pour que deux mouvements nés à la même milliseconde sur deux
     comptoirs ne portent jamais le même id — c'est tout ce qui empêche l'union
     de prendre deux ventes pour une. */
  var DEV = null;
  function devId() {
    if (DEV) return DEV;
    try {
      DEV = localStorage.getItem('kiwiCatalogDev');
      if (!DEV) {
        DEV = Math.random().toString(36).slice(2, 8);
        localStorage.setItem('kiwiCatalogDev', DEV);
      }
    } catch (e) { DEV = DEV || Math.random().toString(36).slice(2, 8); }
    return DEV;
  }
  var moveSeq = 0;
  function moveId() {
    /* devId is shared by every tab through localStorage, while moveSeq is local
       to one page. Add entropy so two tabs moving stock in the same millisecond
       cannot generate the same id and make the merge discard one real sale. */
    moveSeq++;
    var random = '';
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint32Array(2); window.crypto.getRandomValues(bytes);
        random = bytes[0].toString(36) + bytes[1].toString(36);
      }
    } catch (e) {}
    if (!random) random = Math.random().toString(36).slice(2, 10);
    return devId() + '-' + Date.now().toString(36) + '-' + moveSeq + '-' + random;
  }

  /* ── une horloge qui ne rend jamais deux fois le même instant ─────────────
     La règle de fusion est stricte : un mouvement ne compte que s'il est
     POSTÉRIEUR au socle. Or créer une déclinaison puis la vendre peut tomber
     dans la même milliseconde — au comptoir avec une douchette, ce n'est pas
     une hypothèse d'école. Le mouvement était alors réputé antérieur au socle,
     donc ignoré : la vente disparaissait sans un mot. Un compteur monotone
     suffit à rendre l'ordre des écritures locales indiscutable. */
  /* Et une horloge qui n'écrit jamais SOUS ce qu'elle a déjà vu (horloge
     hybride). La fusion arbitre l'édition (`metaAt`, `mediaAt`), le comptage
     (`baseAt`) et la frontière des mouvements par ces instants ; pris tels quels
     sur l'horloge de l'appareil, un comptoir en retard de trois heures datait
     son inventaire physique SOUS les ventes qu'il venait de recevoir d'un poste
     à l'heure : la fusion recomptait ces ventes par-dessus son comptage, et sa
     correction de fiche cédait devant celle qu'il venait de lire. Chaque
     instant rendu ici est donc au moins le plus grand instant connu + 1 : tout
     ce que porte le document chargé (relu au démarrage, adopté d'un autre
     onglet ou du serveur) et tout ce que mergeDocs a reçu de l'autre côté. Un
     geste fait APRÈS avoir vu celui d'un autre appareil passe après lui, quelle
     que soit l'heure affichée. Les champs restent des nombres : un document
     d'avant se fusionne comme avant.
     Garde-fou : un instant vu qui n'est pas un nombre fini, ou qui dépasse de
     plus de 24 h l'heure de cet appareil (un poste réglé en 2099, un document
     abîmé), ne fait PAS avancer l'horloge ; sinon un seul appareil faux
     entraînait tous les comptoirs dans son futur, pour toujours. La fiche reste
     dans les données et la fusion l'arbitre comme avant. */
  var lastNow = 0;
  var seenDoc = null;
  var CLOCK_AHEAD = 24 * 3600 * 1000;
  function observe(t) { t = +t; if (t > lastNow && isFinite(t) && t <= Date.now() + CLOCK_AHEAD) lastNow = t; }
  function observeDoc(doc) {
    if (!doc || typeof doc !== 'object') return;
    var at = function (x) { observe(x); };
    ['categories', 'products', 'variants'].forEach(function (k) {
      (Array.isArray(doc[k]) ? doc[k] : []).forEach(function (e) {
        if (!e) return;
        at(e.metaAt); at(e.mediaAt); at(e.baseAt); at(e.stockAt);
        (Array.isArray(e.barcodes) ? e.barcodes : []).forEach(function (b) { if (b) at(b.at); });
        var rm = e.barcodeRemoved;
        if (rm && typeof rm === 'object') Object.keys(rm).forEach(function (c) { at(rm[c]); });
      });
    });
    (Array.isArray(doc.moves) ? doc.moves : []).forEach(function (m) { if (m) at(m.at); });
    var gone = doc.removed;
    if (gone && typeof gone === 'object') Object.keys(gone).forEach(function (id) { at(gone[id]); });
  }
  function now() {
    /* Un document qui vient d'être posé (chargement, autre onglet, serveur) :
       ses instants comptent comme vus. Relu une fois par document, pas à
       chaque écriture : un import de mille lignes ne le parcourt pas mille fois. */
    if (core.db && core.db !== seenDoc) { seenDoc = core.db; observeDoc(core.db); }
    var t = Date.now();
    if (t <= lastNow && isFinite(lastNow) && lastNow <= t + CLOCK_AHEAD) t = lastNow + 1;
    lastNow = t;
    return t;
  }

  /* Le socle d'une déclinaison, tolérant des deux formes antérieures : un
     document d'avant ce modèle n'a pas de `base` (son `stock` EST son socle) et
     peut ne porter qu'un `stockAt`. Sans cette lecture-là, la première fusion
     après déploiement remettrait tout le monde à zéro. */
  function baseOf(v) { return v && v.base != null ? (+v.base || 0) : Math.max(0, +(v && v.stock) || 0); }
  function baseAtOf(v) { return +(v && (v.baseAt || v.stockAt)) || 0; }

  /* stock = socle + tout ce qui s'est passé DEPUIS le socle. */
  function materialize(doc, vid) {
    var vs = (doc.variants || []).filter(function (v) { return v && (!vid || v.id === vid); });
    if (!vs.length) return;
    var by = Object.create(null);
    vs.forEach(function (v) { by[v.id] = { v: v, n: baseOf(v), at: baseAtOf(v) }; });
    (doc.moves || []).forEach(function (m) {
      var slot = m && by[m.vid];
      if (!slot) return;
      if ((+m.at || 0) <= slot.at) return;      // antérieur au comptage : replié
      slot.n += (+m.d || 0);
    });
    Object.keys(by).forEach(function (id) {
      var s = by[id];
      /* Le socle n'est PAS recalculé ici — seul un comptage (setAbsolute) ou une
         compaction le déplace. On ne fait que normaliser une déclinaison d'avant
         ce modèle, pour qu'elle cesse d'être ambiguë. */
      if (s.v.base == null) { s.v.base = baseOf(s.v); s.v.baseAt = s.at; }
      s.v.stock = Math.max(0, Math.round(s.n));
    });
  }

  /* ── LE JOURNAL, S'IL Y EN A UN ────────────────────────────────────────────
   * Le stock d'une boutique bouge par une dizaine de chemins : la caisse, un
   * import CSV, un comptage, un ±1 sur une fiche, une fusion. Demander à chacun
   * d'écrire aussi son mouvement au registre durable, c'est se garantir qu'un
   * chemin oublié fera bouger le stock sans laisser de trace — et c'est
   * exactement ce qu'il ne faut pas.
   * On prévient donc ICI, au seul endroit par lequel un stock change vraiment.
   * Le journal est OPTIONNEL : tant que personne ne le pose (assets/maison-stock-
   * movements.js le fait pour le métier « maison »), rien ne change pour les
   * autres métiers. Et il ne rend jamais la main au catalogue : ce qu'il écrit,
   * il l'écrit ailleurs. */
  function journal(entry) {
    var J = typeof window !== 'undefined' && window.KiwiStockJournal;
    if (!J || typeof J.record !== 'function') return;
    try { J.record(entry); } catch (_) {}
  }

  /* Un geste qui AFFIRME un état : comptage physique, saisie directe, création.
     Il repose le socle et rend caducs les mouvements d'avant. */
  function setAbsolute(v, n, why) {
    if (!v) return v;
    var was = Math.max(0, +v.stock || 0);
    v.base = Math.max(0, n | 0);
    v.baseAt = now();
    v.stock = v.base;
    /* Poser un état EST un mouvement, même si l'arithmétique du catalogue ne le
       range pas dans `moves` : quelqu'un a déclaré que le compte n'était pas le
       bon. Sans cette ligne, un comptage physique restait le seul geste capable
       de changer un stock sans rien raconter. */
    if (v.stock !== was) {
      journal({
        id: 'abs-' + v.id + '-' + v.baseAt, variant: v, at: v.baseAt,
        delta: v.stock - was, before: was, after: v.stock, why: why || 'comptage',
      });
    }
    /* Les mouvements de cette déclinaison antérieurs au comptage ne servent
       plus à rien ici — la règle de fusion les ignore déjà, autant ne pas les
       traîner. Ceux des AUTRES déclinaisons ne bougent pas. */
    if (Array.isArray(core.db.moves)) {
      core.db.moves = core.db.moves.filter(function (m) { return !m || m.vid !== v.id || (+m.at || 0) > v.baseAt; });
    }
    return v;
  }

  /* Un geste qui RACONTE un événement : vente, retour, réception, ±1. */
  function move(v, d, why, extra) {
    if (!v || !(d = d | 0)) return v;
    if (!Array.isArray(core.db.moves)) core.db.moves = [];
    const entry = { id: moveId(), vid: v.id, d: d, at: now(), why: String(why || 'ajust').slice(0, 16) };
    if (extra && typeof extra === 'object') {
      if (extra.actor) entry.actor = String(extra.actor).slice(0, 64);
      if (extra.ref) entry.ref = String(extra.ref).slice(0, 64);
    }
    const before = Math.max(0, +v.stock || 0);
    core.db.moves.push(entry);
    materialize(core.db, v.id);
    journal({
      id: entry.id, variant: v, at: entry.at, delta: d,
      before: before, after: Math.max(0, +v.stock || 0),
      why: entry.why, actor: entry.actor || '', ref: entry.ref || '',
    });
    return v;
  }

  /* Replie ce qui est vieux dans le socle, et borne le journal. Rien n'est
     perdu : un mouvement replié a été ADDITIONNÉ au socle avant d'être retiré. */
  function compact(doc) {
    var moves = Array.isArray(doc.moves) ? doc.moves.filter(Boolean) : [];
    if (!moves.length) { doc.moves = []; return doc; }
    var cutoff = Date.now() - MOVE_DAYS * 86400000;
    /* Un mouvement antérieur au socle de sa déclinaison est déjà replié : il ne
       pourra plus jamais changer un stock. Le garder ferait grossir le document
       à chaque comptage physique, sans effet. */
    var socles = Object.create(null);
    (doc.variants || []).forEach(function (v) { if (v && v.id) socles[v.id] = baseAtOf(v); });
    moves = moves.filter(function (m) { return !(m.vid in socles) || (+m.at || 0) > socles[m.vid]; });
    if (!moves.length) { doc.moves = []; return doc; }
    /* Trop de mouvements : on replie aussi les plus anciens au-delà du plafond,
       sinon un très gros commerce ferait grossir le document sans fin. */
    moves.sort(function (a, b) { return (+a.at || 0) - (+b.at || 0); });
    var over = Math.max(0, moves.length - MOVE_MAX);
    var byId = Object.create(null);
    (doc.variants || []).forEach(function (v) { if (v && v.id) byId[v.id] = v; });
    var keep = [];
    var folded = Object.create(null);
    moves.forEach(function (m, i) {
      var old = (+m.at || 0) <= cutoff || i < over;
      var v = byId[m.vid];
      if (!old || !v) {
        if (!old) {
          var keepEntry = {
            id: String(m.id || '').slice(0, 64),
            vid: String(m.vid || '').slice(0, 40),
            d: (+m.d || 0),
            at: (+m.at || 0),
            why: String(m.why || 'ajust').slice(0, 16),
          };
          if (m.actor) keepEntry.actor = String(m.actor).slice(0, 64);
          if (m.ref) keepEntry.ref = String(m.ref).slice(0, 64);
          keep.push(keepEntry);
        }
        return;
      }
      if ((+m.at || 0) <= baseAtOf(v)) return;              // déjà replié
      var slot = folded[v.id] || (folded[v.id] = { d: 0, at: baseAtOf(v) });
      slot.d += (+m.d || 0);
      slot.at = Math.max(slot.at, +m.at || 0);
    });
    Object.keys(folded).forEach(function (id) {
      var v = byId[id], f = folded[id];
      if (!v || !f) return;
      /* `stock` is clamped for display; the ledger base is not. Remembering an
         oversold deficit is what keeps a later return from inventing stock. */
      v.base = baseOf(v) + f.d;
      v.baseAt = f.at;
    });
    doc.moves = keep;
    return doc;
  }

  /* ── une suppression est un FAIT, pas un vide ──────────────────────────────
     On note l'id et l'instant. Rien ne relit cette carte en local (le tableau
     est déjà filtré) : elle n'existe que pour la fusion, et c'est précisément
     là qu'elle manquait. Bornée à 180 jours — au-delà, l'autre appareil a
     forcément resynchronisé, et une carte qui ne se vide jamais finit par peser
     plus lourd que le catalogue. */
  var TOMB_DAYS = 180;
  function tomb(ids) {
    if (!core.db.removed) core.db.removed = {};
    var t = now();
    (Array.isArray(ids) ? ids : [ids]).forEach(function (id) { if (id) core.db.removed[id] = t; });
  }
  function pruneTombs(map) {
    var out = Object.create(null);
    var floor = Date.now() - TOMB_DAYS * 86400000;
    Object.keys(map || {}).forEach(function (id) {
      var t = +map[id] || 0;
      if (t > floor) out[id] = t;
    });
    return out;
  }

  /* Ce que la dernière fusion a appris, et de qui. `mine` vrai = nous portons
     quelque chose que le serveur n'a pas, donc il faut remonter. `theirs` vrai =
     nous venons d'apprendre quelque chose. Lu par pull() pour ne PAS republier un
     document auquel nous n'avons rien ajouté — voir la note là-bas. */
  var ahead = { mine: false, theirs: false };

  function mergeDocs(mine, theirs) {
    ahead = { mine: false, theirs: false };
    /* Tout ce que l'autre côté porte a été VU, y compris ce que la fusion va
       écarter : le prochain geste d'ici se datera au-dessus. */
    observeDoc(mine); observeDoc(theirs);
    /* Les suppressions des deux côtés, réunies : celle que l'autre appareil a
       faite compte autant que la nôtre. */
    const gone = pruneTombs(Object.assign(
      Object.create(null), (theirs && theirs.removed) || {}, (mine && mine.removed) || {}
    ));
    /* Une suppression que nous portons et qu'ils n'ont pas est exactement ce
       qu'il faut leur transmettre — sans ce test, un pull « propre » la garderait
       pour lui et l'article resterait vivant sur l'autre comptoir. */
    Object.keys(gone).forEach((id) => {
      if (!((theirs && theirs.removed) || {})[id]) ahead.mine = true;
    });
    const out = {
      v: 1, categories: [], products: [], variants: [],
      seq: Math.max(+(mine && mine.seq) || 0, +(theirs && theirs.seq) || 0),
      removed: gone,
    };
    ['categories', 'products', 'variants'].forEach((k) => {
      const seen = Object.create(null);
      const list = [];
      /* Ce que l'autre côté connaît déjà. Sert uniquement à savoir si NOUS
         portons du neuf — sans quoi pull() ne peut pas décider s'il a quelque
         chose à remonter. */
      const theirIds = Object.create(null);
      ((theirs && theirs[k]) || []).forEach((e) => { if (e && e.id) theirIds[e.id] = 1; });
      const take = (e) => {
        if (!e || !e.id) return;
        if (gone[e.id]) return;                     // supprimé ici ou là-bas
        if (!seen[e.id]) { seen[e.id] = 1; list.push(e); ahead.theirs = true; return; }
        /* Connu des deux côtés. L'enregistrement local est gardé — le nom, le
           prix, la couleur, les codes-barres sont de l'ÉDITION, et la dernière
           main qui a tapé est devant l'écran.
           Le SOCLE, lui, n'est pas de l'édition : c'est un comptage. Le plus
           récent des deux gagne, parce qu'un inventaire physique fait ce matin
           n'a pas à céder devant un chiffre d'hier. Les MOUVEMENTS ne sont
           arbitrés nulle part ici : ils sont réunis plus bas, tous. */
        const kept = seen[e.id];
        const mineMetaAt = +(kept && kept.metaAt) || 0;
        const theirMetaAt = +(e && e.metaAt) || 0;
        if (k === 'categories') {
          if (theirMetaAt > mineMetaAt) {
            ['name', 'color', 'order', 'metaAt'].forEach((f) => { kept[f] = e[f]; });
            ahead.theirs = true;
          } else if (mineMetaAt > theirMetaAt) ahead.mine = true;
          return;
        }
        if (k === 'products') {
          /* Product media is edited on the dashboard but consumed on caisse.
             A caisse that already knew the product used to keep its older blank
             `photo` forever because local metadata always won the merge. Keep a
             small media clock so upload, replacement and removal all propagate.
             Legacy documents have no clock: in that one migration case, a real
             URL beats a blank value. */
          const mineAt = +kept.mediaAt || 0;
          const theirAt = +e.mediaAt || 0;
          const mineMedia = !!(kept.photo || kept.video);
          const theirMedia = !!(e.photo || e.video);
          const differs = String(kept.photo || '') !== String(e.photo || '')
            || String(kept.video || '') !== String(e.video || '');
          const fields = ['legacyId', 'name', 'categoryId', 'priceMAD', 'cost', 'art', 'kind', 'flag', 'grad',
            'marque', 'format', 'servicePieces', 'piecePriceMAD', 'motif', 'fragile', 'ownership', 'consignor',
            'supplierId', 'parLevel', 'reorderLevel', 'sku', 'createdAt', 'archived', 'metaAt'];
          if (theirMetaAt > mineMetaAt) {
            fields.forEach((f) => {
              if (e[f] === undefined) delete kept[f]; else kept[f] = e[f];
            });
            ahead.theirs = true;
          } else if (mineMetaAt > theirMetaAt) ahead.mine = true;
          if (theirAt > mineAt || (!mineAt && !theirAt && !mineMedia && theirMedia)) {
            kept.photo = String(e.photo || '');
            kept.video = String(e.video || '');
            if (theirAt) kept.mediaAt = theirAt;
            ahead.theirs = true;
          } else if (differs && (mineAt > theirAt || mineMedia)) {
            ahead.mine = true;
          }
          return;
        }
        if (k !== 'variants') return;
        const variantFields = ['productId', 'colorId', 'colorFamily', 'colorSource', 'colorSourceHex', 'colorWas',
          'colorLabel', 'colorHex', 'size', 'sku', 'note', 'metaAt'];
        if (theirMetaAt > mineMetaAt) {
          variantFields.forEach((f) => {
            if (e[f] === undefined) delete kept[f]; else kept[f] = e[f];
          });
          ahead.theirs = true;
        } else if (mineMetaAt > theirMetaAt) ahead.mine = true;

        /* Barcode additions are a union. Timestamped removals cross devices and
           beat older additions, so scanning a label on one till cannot be undone
           by a stale copy from another. */
        const removed = Object.assign({}, kept.barcodeRemoved || {});
        Object.keys(e.barcodeRemoved || {}).forEach((code) => {
          removed[code] = Math.max(+removed[code] || 0, +e.barcodeRemoved[code] || 0);
        });
        const codes = Object.create(null);
        ;(kept.barcodes || []).concat(e.barcodes || []).forEach((b) => {
          if (!b || !b.code) return;
          const prior = codes[b.code];
          if (!prior || (+b.at || 0) > (+prior.at || 0)) codes[b.code] = Object.assign({}, b);
        });
        const mergedCodes = Object.keys(codes).map((code) => codes[code])
          .filter((b) => (+removed[b.code] || 0) < (+b.at || 0) || (!(+removed[b.code] || 0) && !b.at));
        if (JSON.stringify(mergedCodes) !== JSON.stringify(kept.barcodes || [])) ahead.theirs = true;
        kept.barcodes = mergedCodes;
        kept.barcodeRemoved = removed;

        if (baseAtOf(e) > baseAtOf(kept)) {
          kept.base = baseOf(e);
          kept.baseAt = baseAtOf(e);
          ahead.theirs = true;
        } else if (baseAtOf(kept) > baseAtOf(e)) { ahead.mine = true; }
      };
      /* Deux passes, pour que la seconde puisse RETROUVER l'enregistrement gardé
         et non seulement savoir qu'il existe. */
      ((mine && mine[k]) || []).forEach((e) => {
        if (!e || !e.id || gone[e.id] || seen[e.id]) return;
        seen[e.id] = e;
        list.push(e);
        if (!theirIds[e.id]) ahead.mine = true;   // créé ici, inconnu là-bas
      });
      ((theirs && theirs[k]) || []).forEach(take);
      out[k] = list;
    });

    /* ── LES MOUVEMENTS : UNE UNION, PAS UN ARBITRAGE ────────────────────────
       C'est ici que deux ventes simultanées s'additionnent enfin. Chaque
       mouvement porte un id unique par appareil ; réunir les deux journaux par
       id garde donc les deux ventes, et recevoir deux fois le même mouvement ne
       le compte qu'une fois. Rien à départager : un événement qui a eu lieu a
       eu lieu. */
    const byMove = Object.create(null);
    const theirMove = Object.create(null);
    ((theirs && theirs.moves) || []).forEach((m) => { if (m && m.id) theirMove[m.id] = m; });
    ((mine && mine.moves) || []).forEach((m) => {
      if (!m || !m.id) return;
      byMove[m.id] = m;
      if (!theirMove[m.id]) ahead.mine = true;   // une vente d'ici qu'ils ignorent
    });
    Object.keys(theirMove).forEach((id) => {
      if (!byMove[id]) { byMove[id] = theirMove[id]; ahead.theirs = true; }
      else if (byMove[id].why === 'reserve' && theirMove[id].why === 'vente') {
        byMove[id] = theirMove[id]; ahead.theirs = true;
      }
    });
    out.moves = Object.keys(byMove).map((id) => byMove[id])
      .filter((m) => !gone[m.vid]);   // les mouvements d'un article supprimé s'en vont avec lui

    // Une déclinaison dont le produit a été supprimé des deux côtés n'a plus de
    // parent : elle deviendrait un article fantôme, invendable et invisible.
    const alive = Object.create(null);
    out.products.forEach((p) => { alive[p.id] = 1; });
    out.variants = out.variants.filter((v) => alive[v.productId]);

    /* Replier le vieux, puis recalculer : le stock affiché est TOUJOURS le socle
       plus les mouvements postérieurs, jamais un nombre qu'on se serait
       transmis. C'est ce qui rend la fusion reproductible — deux appareils
       partis des mêmes deux journaux arrivent au même stock. */
    compact(out);
    materialize(out);
    return out;
  }

  return {
    MOVE_MAX, now, baseAtOf, materialize, journal, setAbsolute, move, compact, tomb, mergeDocs,
    get ahead() { return ahead; },
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG · les échanges avec le serveur et l'export
 * ---------------------------------------------------------------------------
 * Une partie de window.KiwiBoutiqueCatalog (assets/boutique-catalog.js), sortie
 * du fichier principal telle quelle :
 *   · sync : la copie serveur (/api/catalog), les réservations de stock d'un
 *     encaissement, le stock des autres établissements (/api/stock/lookup) et
 *     les réveils (retour sur l'onglet, retour du réseau, fermeture de page) ;
 *   · csv : l'export du catalogue.
 *
 * Cette moitié ne fait que DÉCLARER deux fabriques ; c'est boutique-catalog.js
 * qui les appelle, chacune à l'endroit où ce code se trouvait, avec l'état
 * qu'il possède (`core.db`, `core.VENUE`) et le journal (la fabrique `ledger`
 * ci-dessus).
 * ═══════════════════════════════════════════════════════════════════════════ */
window.__kiwiBoutiqueCatalogParts = window.__kiwiBoutiqueCatalogParts || {};
window.__kiwiBoutiqueCatalogParts.sync = function (core, ledger) {
  'use strict';
  const { DEMO_VENUE, load, persist, notify, dropIndex, migrate, commit, varById } = core;
  const { mergeDocs, materialize, journal, now, baseAtOf } = ledger;

  /* ═════════════════ LE FILET — une copie serveur sur laquelle retomber ══════
   * Jusqu'ici ce catalogue ne vivait QUE dans le localStorage du navigateur qui
   * l'avait saisi. Une fenêtre privée fermée, un deuxième appareil, un cache
   * vidé, et l'inventaire n'existait plus nulle part : rien n'en gardait copie.
   * Un commerçant ne peut pas ressaisir son stock à chaque fois qu'il change de
   * navigateur — ce n'est pas un réglage d'affichage, c'est son magasin.
   *
   * Le stock est donc miroité vers /api/catalog, qui n'est lisible qu'en
   * prouvant son identité sur CE magasin (session du compte, caisse appairée ou
   * opérateur — jamais public, contrairement à /api/menu). Le tableau de bord et
   * la caisse écrivent déjà sous le même slug de boutique : ils tombent
   * naturellement sur le même document.
   *
   * Trois règles, dans cet ordre de priorité :
   *
   *  1. NE JAMAIS PERDRE DE STOCK. Toute panne — hors ligne, 500, table pas
   *     encore migrée, session expirée — est avalée : la copie locale reste la
   *     vérité de travail et la remontée est retentée au prochain enregistrement.
   *     La caisse continue de vendre dans un sous-sol sans réseau.
   *  2. NE JAMAIS ÉCRASER L'AUTRE APPAREIL. On envoie la révision sur laquelle on
   *     s'est basé ; si le serveur a bougé entre-temps il refuse (409) et renvoie
   *     sa copie. On fusionne et on repropose.
   *  3. NE JAMAIS POUSSER AVANT D'AVOIR LU. Un navigateur neuf a un catalogue
   *     vide ; s'il poussait en premier il effacerait le vrai stock.
   *
   * Fusion : union par id, plus deux arbitrages qui manquaient et qui ont coûté
   * cher à un vrai commerçant le 30/07/2026 — son stock revenait indéfiniment à
   * 4 078 unités quoi qu'il vende ou supprime.
   *
   *  · UNE SUPPRESSION EST UN FAIT, PAS UN VIDE. « Union par id, rien ne
   *    disparaît jamais » paraît prudent sur un inventaire, et c'est faux : une
   *    ABSENCE ne se distingue pas d'une IGNORANCE. L'appareil qui supprime un
   *    article se retrouve simplement à ne plus l'avoir, la copie serveur l'a
   *    encore, la fusion le rend — puis le repousse au serveur. La suppression
   *    n'était pas perdue, elle était ANNULÉE, et le geste ne pouvait pas
   *    aboutir un seul jour. D'où `removed` : la carte des ids supprimés, avec
   *    l'instant. Les ids ne sont jamais réattribués (nextId monte), donc un id
   *    marqué supprimé est supprimé, des deux côtés.
   *
   *  · LE COMPTE LE PLUS RÉCENT GAGNE, PAS LE COMPTE LOCAL. « cet appareil
   *    d'abord » se juge depuis chaque appareil : la caisse vend, son compte
   *    baisse ; l'onglet tableau de bord resté ouvert garde l'ancien, et quand
   *    c'est LUI qui pousse, c'est l'ancien qui gagne. Les deux se renvoyaient
   *    le même document (révision 165 en production, pour un catalogue de 41
   *    déclinaisons) et le stock ne bougeait plus. Chaque écriture de quantité
   *    horodate donc `stockAt`, et la fusion prend la plus récente des deux.
   *    Un document d'avant ce correctif n'a pas d'horodatage : il compte pour le
   *    plus ancien, donc la première vente qui suit le remet dans le vrai.
   *
   * Le reste des champs (nom, prix, couleur, codes-barres) suit toujours l'appareil
   * local : c'est de l'édition, pas du comptage, et la dernière main qui a tapé
   * est là, devant l'écran. */
  const REV_KEY = (slug) => 'kiwiCatalogRev:v1:' + slug;
  const DIRTY_KEY = (slug) => 'kiwiCatalogDirty:v1:' + slug;
  /* `dirty` : ce navigateur porte une écriture que le serveur n'a pas encore
     acceptée. Posé par commit() (toute mutation locale passe par là), levé
     seulement quand le serveur a dit oui. C'est ce drapeau, avec `ahead.mine`,
     qui empêche un appareil sans rien à dire de republier en boucle. */
  const cloud = { rev: 0, read: Object.create(null), timer: null, busy: false, again: false, tries: 0, last: 0, dirty: false };

  // La démo (Maison Mansour) ne quitte jamais ce navigateur : elle est semée
  // localement et n'appartient à aucun compte.
  function cloudOn() {
    try {
      if (!core.VENUE || core.VENUE === DEMO_VENUE) return false;
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      /* Une caisse APPAIRÉE est un appareil réel, même sans session du
         propriétaire. KiwiEnv ne voit que la session/le domaine : sur la
         tablette du magasin il répondait donc faux, cloudBind() ne lisait
         jamais /api/catalog, et le stock restait celui d'un vieux localStorage
         pendant que le dashboard et God mode affichaient la copie serveur.

         On n'ouvre que LE magasin lié à ce terminal. Le serveur revérifie le
         cookie httpOnly kiwi_till dans /api/catalog ; ce test client décide
         seulement s'il faut tenter la synchro, il n'accorde aucun accès. */
      const pairedMerchant = window.KiwiPlatform?.pairedMerchant?.() || (JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null') || {}).merchant;
      return !!(pairedMerchant && String(pairedMerchant) === String(core.VENUE));
    } catch (e) { return false; }
  }
  function readRev(slug) {
    try { return parseInt(localStorage.getItem(REV_KEY(slug)) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function writeRev(slug, rev) {
    try { localStorage.setItem(REV_KEY(slug), String(rev || 0)); } catch (e) {}
  }
  function dirtyToken(slug) {
    try { return localStorage.getItem(DIRTY_KEY(slug)); } catch (e) { return null; }
  }
  function markCatalogDirty() {
    cloud.dirty = true;
    try {
      const token = Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
      localStorage.setItem(DIRTY_KEY(core.VENUE), token);
      return token;
    } catch (e) { return null; }
  }
  function clearCatalogDirty(slug, token) {
    try {
      if (!token || localStorage.getItem(DIRTY_KEY(slug)) === token) {
        localStorage.removeItem(DIRTY_KEY(slug));
      }
    } catch (e) {}
    cloud.dirty = !!dirtyToken(slug);
  }

  /* Le compteur d'EAN-13 maison vit dans UNE clé locale (assets/barcode.js). Un
   * deuxième appareil qui reçoit le catalogue du premier démarre à zéro et
   * rééditerait exactement les mêmes codes — deux articles différents sous le
   * même code-barres, que la douchette ne pourrait plus départager. On remonte
   * donc le compteur au-dessus du plus grand code maison déjà présent. */
  function healSeq() {
    try {
      let max = 0;
      (core.db.variants || []).forEach((v) => ((v && v.barcodes) || []).forEach((b) => {
        const m = /^20(\d{10})\d$/.exec(String((b && b.code) || ''));
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
      }));
      if (!max) return;
      // barcode.js lit une clé fixe ; pages-pro.js en reporte une par magasin.
      // On remonte les deux, sinon le compteur repart selon la surface ouverte.
      ['kiwiBarcodeSeq:maisonMansour', 'kiwiBarcodeSeq:' + core.VENUE].forEach((K) => {
        const cur = parseInt(localStorage.getItem(K) || '0', 10) || 0;
        if (max > cur) localStorage.setItem(K, String(max));
      });
    } catch (e) {}
  }

  /* Lit la copie serveur et la réconcilie avec la locale. `first` = tout premier
   * contact pour ce magasin : c'est le seul cas où un catalogue local vide est
   * remplacé en bloc (le navigateur neuf adopte le magasin). Ensuite on fusionne
   * toujours, pour ne pas jeter ce qui vient d'être saisi ici. */
  function pull(first) {
    const slug = core.VENUE;
    if (!cloudOn()) return Promise.resolve(false);
    return fetch('/api/catalog?merchant=' + encodeURIComponent(slug), {
      headers: { Accept: 'application/json' },
    })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        // Le commerçant a changé de magasin pendant l'aller-retour : cette
        // réponse concerne l'inventaire d'une autre boutique, on la jette.
        if (!res || slug !== core.VENUE) return false;
        /* Only a valid server document satisfies "read before write". A 500 used
           to become `null` but still set cloud.read, licensing the next local
           mutation to overwrite a server copy this browser had never seen. */
        cloud.read[slug] = 1;
        cloud.last = Date.now();
        cloud.dirty = cloud.dirty || !!dirtyToken(slug);

        const serverRev = +res.rev || 0;
        const theirs = res.data;
        load();
        const mineEmpty = !(core.db.products && core.db.products.length);
        const theirsEmpty = !(theirs && theirs.products && theirs.products.length);

        if (theirsEmpty) {
          // Rien en ligne : c'est ce navigateur qui fait référence.
          cloud.rev = serverRev;
          if (!mineEmpty) schedulePush(0);
          return false;
        }
        cloud.rev = serverRev;
        if (!mineEmpty && readRev(slug) === serverRev) {
          /* Same revision does not mean "nothing to do" when a prior offline
             push failed. The local movement is still dirty and must leave now
             that the server is reachable again. */
          if (cloud.dirty) schedulePush(0);
          healSeq();
          return false;
        }

        const adopt = first && mineEmpty;
        core.db = adopt ? theirs : mergeDocs(core.db, theirs);
        dropIndex();
        migrate();   // la copie serveur peut venir d'un build antérieur aux familles
        persist(); writeRev(slug, serverRev); healSeq(); notify();
        /* ── NE PAS REPUBLIER CE QU'ON VIENT DE LIRE ──────────────────────────
           On repoussait après CHAQUE fusion, systématiquement. Un appareil qui
           n'avait rien changé republiait donc le document qu'il venait de
           recevoir : le serveur incrémentait sa révision, l'autre appareil
           relisait, refusionnait, republiait à son tour. C'est cette boucle qui
           a porté le document d'un client à la révision 165 pour 41 articles —
           et c'est sous ce bruit que l'écrasement du stock passait inaperçu.
           On ne remonte donc que si nous portons vraiment quelque chose que le
           serveur n'a pas : une vente, une création, une suppression, un
           comptage plus récent. mergeDocs vient de le dire. */
        if (!adopt && (cloud.dirty || ledger.ahead.mine)) schedulePush(0);
        return true;
      })
      .catch(() => false);   // hors ligne → la copie locale reste la vérité
  }

  /* Un refus 413 du serveur (functions/api/catalog.js : « catalog-too-large »
     ou « moves-uncompacted »). Un seul avertissement par borne et par page : la
     remontée suivante retombera sur le même refus tant que rien ne change. */
  const tooLargeSaid = Object.create(null);
  function tooLarge(j) {
    const field = String(j.field || j.error || 'catalog');
    cloud.refused = { error: String(j.error || 'too-large'), field, max: +j.max || 0, count: +j.count || 0 };
    if (tooLargeSaid[field]) return;
    tooLargeSaid[field] = 1;
    let lang = 'fr';
    try { lang = localStorage.getItem('kiwiLang') || (document.documentElement && document.documentElement.lang) || 'fr'; } catch (_) {}
    const L = lang === 'en' ? 1 : lang === 'ar' ? 2 : 0;
    const max = String(+j.max || 0).replace(/\B(?=(\d{3})+(?!\d))/g, L === 1 ? ',' : ' ');
    const what = ({
      products: ['produits', 'products', 'منتج'],
      variants: ['déclinaisons', 'variants', 'متغير'],
      categories: ['catégories', 'categories', 'فئة'],
    }[field] || ['mouvements de stock', 'stock movements', 'حركة مخزون'])[L];
    const title = ['Catalogue non synchronisé', 'Catalogue not synced', 'لم تتم مزامنة الكتالوج'][L];
    const desc = [
      'Plus de ' + max + ' ' + what + ' : le serveur refuse ce catalogue. Tout reste sur cet appareil. Archivez ou supprimez des articles, puis réessayez.',
      'More than ' + max + ' ' + what + ': the server refuses this catalogue. Everything stays on this device. Archive or delete items, then try again.',
      'أكثر من ' + max + ' ' + what + ': الخادم يرفض هذا الكتالوج. تبقى كل البيانات على هذا الجهاز. أرشف بعض المنتجات أو احذفها ثم أعد المحاولة.',
    ][L];
    try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(title, { type: 'error', force: true, desc }); } catch (_) {}
    try { window.dispatchEvent && window.dispatchEvent(new CustomEvent('kiwi:catalog-refused', { detail: cloud.refused })); } catch (_) {}
  }

  function schedulePush(delay) {
    if (!cloudOn()) return;
    if (!cloud.dirty || !dirtyToken(core.VENUE)) markCatalogDirty();
    if (cloud.timer) clearTimeout(cloud.timer);
    cloud.timer = setTimeout(pushNow, delay == null ? 900 : delay);
  }

  function pushNow(opts) {
    cloud.timer = null;
    if (!cloudOn()) return;
    const slug = core.VENUE;
    // Règle 3 : jamais pousser avant d'avoir lu, sinon un navigateur neuf efface.
    if (!cloud.read[slug]) { pull(true); return; }
    if (cloud.busy) { cloud.again = true; return; }
    const sentDirty = dirtyToken(slug);
    cloud.busy = true;
    fetch('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: slug, baseRev: cloud.rev, data: core.db }),
      // L'onglet peut se fermer juste après une vente : keepalive laisse la
      // requête partir quand même.
      keepalive: !!(opts && opts.keepalive),
    })
      .then((r) => r.json().then((j) => ({ status: r.status, j })).catch(() => ({ status: r.status, j: null })))
      .then((res) => {
        if (slug !== core.VENUE) return;
        if (res.status === 200 && res.j && res.j.ok) {
          cloud.rev = Math.max(cloud.rev, +res.j.rev || 0);
          writeRev(slug, cloud.rev);
          /* Accepté : plus rien à remonter. Levé ICI et nulle part ailleurs — un
             drapeau baissé sur un envoi refusé perdrait la vente silencieusement. */
          clearCatalogDirty(slug, sentDirty);
          cloud.tries = 0;
          if (cloud.refused) { cloud.refused = null; Object.keys(tooLargeSaid).forEach((k) => { delete tooLargeSaid[k]; }); }
          return;
        }
        // 409 : le serveur a bougé (ou a refusé un envoi vide). Il nous rend sa
        // copie — on fusionne et on repropose, quelques fois au plus pour ne
        // jamais tourner en rond si l'autre appareil écrit en continu.
        if (res.status === 409 && res.j && res.j.data && cloud.tries < 3) {
          cloud.tries++;
          core.db = mergeDocs(core.db, res.j.data);
          dropIndex();
          migrate();
          cloud.rev = +res.j.rev || 0;
          persist(); writeRev(slug, cloud.rev); healSeq(); notify();
          cloud.again = true;
        }
        // 413 : le catalogue dépasse une borne du serveur. Rien n'a été écrit en
        // ligne ; la copie locale reste entière, le drapeau « à remonter » aussi.
        // Le serveur ne tronque plus en silence : on le dit au commerçant.
        if (res.status === 413) { tooLarge(res.j || {}); return; }
        // 401 / 503 / 500 → on garde tout en local et on retentera plus tard.
      })
      .catch(() => { /* hors ligne : la vente continue, la remontée attendra */ })
      .then(() => {
        cloud.busy = false;
        if (cloud.again) { cloud.again = false; schedulePush(400); }
      });
  }

  /* A checkout reservation is a small server-side compare-and-swap against the
     current catalogue. Unlike the background full-document mirror, it returns a
     definite answer before payment: either these exact variants are held, or the
     till must not collect money. Network failure remains an explicit offline
     fallback; a real stock refusal never does. */
  function saleStockAction(action, ref, lines) {
    load();
    if (!cloudOn() || typeof fetch !== 'function') return Promise.resolve({ ok: false, offline: true });
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 4500) : null;
    return fetch('/api/catalog', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: core.VENUE, stockAction: action, ref: String(ref || '').slice(0, 64), lines: lines || [] }),
      signal: controller ? controller.signal : undefined,
    }).then((r) => r.json().then((j) => ({ status: r.status, j })).catch(() => ({ status: r.status, j: null })))
      .then((res) => {
        if (res.status === 200 && res.j && res.j.ok && res.j.data) {
          core.db = mergeDocs(core.db, res.j.data);
          dropIndex(); migrate(); materialize(core.db);
          cloud.rev = Math.max(cloud.rev, +res.j.rev || 0);
          writeRev(core.VENUE, cloud.rev); persist(); healSeq(); notify();
          if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          return { ok: true };
        }
        if (res.status === 409 && res.j && res.j.error === 'stock-insufficient') {
          if (res.j.data) {
            core.db = mergeDocs(core.db, res.j.data); dropIndex(); migrate(); materialize(core.db);
            cloud.rev = Math.max(cloud.rev, +res.j.rev || 0); writeRev(core.VENUE, cloud.rev); persist(); notify();
            if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          }
          return { ok: false, issue: res.j.issue || null };
        }
        /* The till can legitimately have a durable local catalogue before the
           shared catalogue table is available (freshly paired shop, migration
           still rolling out, or the first background upload not accepted yet).
           Those replies are explicit non-writes: no server hold exists, so the
           established offline checkout path is safe and will publish the sale
           with its idempotency reference later. Treating every 409/503 as an
           ambiguous hold blocked a stocked shop at “Vérification du stock…”. */
        const reason = (res.j && res.j.error) || '';
        if ((res.status === 409 && reason === 'catalog-missing')
            || (res.status === 503 && (reason === 'unmigrated' || reason === 'not-configured'))) {
          return { ok: false, offline: true, reason };
        }
        if (res.status === 409) {
          if (res.j && res.j.data) {
            core.db = mergeDocs(core.db, res.j.data); dropIndex(); migrate(); materialize(core.db);
            cloud.rev = Math.max(cloud.rev, +res.j.rev || 0); writeRev(core.VENUE, cloud.rev); persist(); notify();
            if (ledger.ahead.mine) { markCatalogDirty(); schedulePush(0); }
          }
          return { ok: false, fatal: true, reason: (res.j && res.j.error) || 'stock-contention' };
        }
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          return { ok: false, fatal: true, reason: (res.j && res.j.error) || 'stock-action-refused' };
        }
        /* Once a request was sent, a lost/5xx response is ambiguous: Cloudflare
           may have committed the hold before the connection broke. Never fall
           back to a second local debit. Retrying the same ref is idempotent. */
        return { ok: false, fatal: true, uncertain: true, reason: reason || ('http-' + res.status) };
      }).catch(() => ({ ok: false, fatal: true, uncertain: true, reason: 'network-uncertain' }))
      .finally(() => { if (timeout) clearTimeout(timeout); });
  }

  function reserveSale(ref, lines) { return saleStockAction('reserve', ref, lines); }
  function confirmSale(ref) {
    /* Confirm locally first. If the network disappears after the card terminal
       approves, the next catalogue push carries `vente`, never an ambiguous hold. */
    let touched = false;
    (core.db.moves || []).forEach((m) => {
      if (m && m.ref === ref && m.why === 'reserve') {
        m.why = 'vente'; touched = true;
        /* La réservation n'entre pas au registre (TRANSIENT dans
           maison-stock-movements.js) et la renommer ne bouge aucun stock : la
           vente confirmée n'y entrait donc jamais. C'est ici qu'elle devient une
           sortie de marchandise, c'est ici qu'on la raconte. */
        const v = varById(m.vid);
        if (v) {
          const d = +m.d || 0, after = Math.max(0, +v.stock || 0);
          journal({ id: m.id, variant: v, at: +m.at || now(), delta: d, before: Math.max(0, after - d), after,
            why: 'vente', actor: m.actor || '', ref: m.ref || '' });
        }
      }
    });
    if (touched) commit();
    return saleStockAction('confirm', ref);
  }
  function releaseSale(ref) {
    /* Release locally before asking the server. If Wi-Fi dies between opening and
       cancelling payment, the inverse movement remains durable and retries through
       the ordinary catalogue mirror. IDs match the server action, so both routes
       arriving is still exactly one release. */
    const held = (core.db.moves || []).filter((m) => m && m.ref === ref && m.why === 'reserve');
    const paid = (core.db.moves || []).some((m) => m && m.ref === ref && m.why === 'vente');
    if (!paid && held.length) {
      let at = now();
      held.forEach((m) => {
        const id = 'rel-' + String(m.id).slice(0, 60);
        if ((core.db.moves || []).some((x) => x && x.id === id)) return;
        const v = varById(m.vid); at = Math.max(at + 1, baseAtOf(v) + 1, (+m.at || 0) + 1);
        core.db.moves.push({ id, vid: m.vid, d: -(+m.d || 0), at, why: 'release', ref: String(ref).slice(0, 64) });
      });
      materialize(core.db); commit();
    }
    return saleStockAction('release', ref);
  }

  /* ─── « et dans l'autre boutique ? » ──────────────────────────────────────
   *
   * Un commerçant à deux magasins scanne un article à Casa pour une cliente qui
   * veut du 40 : il ne reste que du 38 ici. La réponse — « il y en a trois à
   * Marrakech » — existait déjà dans D1, sous le même compte, mais rien ne la
   * demandait. Le vendeur téléphonait, ou renonçait.
   *
   * Le serveur (functions/api/stock/lookup.js) répond pour TOUS les magasins du
   * compte d'un coup, et c'est lui qui décide lesquels : la liste des
   * établissements vit dans le localStorage de ce navigateur, la lui faire
   * confiance laisserait n'importe qui nommer le magasin qu'il veut lire.
   *
   * Trois précautions, parce que ceci se déclenche sur un SCAN — le geste qui
   * doit rester instantané :
   *   · jamais bloquant. Le scan affiche le stock local immédiatement ; ce qui
   *     revient d'ici ne fait que compléter le panneau, plus tard.
   *   · `cloudOn()`, comme le reste de la synchro : une session de démonstration
   *     n'appelle rien, et un magasin de démo ne peut pas en interroger un vrai.
   *   · un compte MONO-magasin arrête de demander. La première réponse dit
   *     combien de magasins existent ; s'il n'y a que celui-ci, `solo` se pose et
   *     les scans suivants n'atteignent plus le réseau du tout. */
  const cross = { solo: false, cache: Object.create(null), inflight: Object.create(null) };

  function crossStock(opts) {
    opts = opts || {};
    const code = String(opts.code || '').trim();
    const q = String(opts.q || '').trim();
    if (!code && q.length < 2) return Promise.resolve(null);
    if (!cloudOn()) return Promise.resolve(null);
    // Un seul établissement sur ce compte : la question n'a pas de sens.
    if (cross.solo && !opts.force) return Promise.resolve(null);

    const slug = core.VENUE;
    /* La référence entre dans la clé du cache : le propriétaire vient peut-être
       de la poser depuis le tableau de bord sur un article scanné il y a dix
       secondes, et servir la réponse d'avant lui montrerait « rien ailleurs »
       juste après avoir fait le geste censé y remédier. */
    const key = slug + '|' + (code ? 'c:' + code : 'q:' + q.toLowerCase())
      + '|s:' + String(opts.sku || '').trim().toLowerCase();
    // Deux scans du même code à quelques secondes d'intervalle (l'employé
    // rescanne pour montrer l'écran à la cliente) ne font qu'un appel.
    const hit = cross.cache[key];
    if (hit && Date.now() - hit.at < 30000) return Promise.resolve(hit.res);
    if (cross.inflight[key]) return cross.inflight[key];

    /* La référence commune part AVEC le code. Le code seul ne suffit pas : une
     * étiquette imprimée ici ne veut rien dire dans l'autre magasin, et c'est
     * précisément le cas du commerçant qui étiquette lui-même sa marchandise.
     * Le serveur essaie le code d'abord (le plus sûr quand c'est un vrai
     * code fabricant) et retombe sur la référence. */
    const sku = String(opts.sku || '').trim();
    const url = '/api/stock/lookup?from=' + encodeURIComponent(slug)
      + (code ? '&code=' + encodeURIComponent(code) : '&q=' + encodeURIComponent(q))
      + (sku ? '&sku=' + encodeURIComponent(sku) : '');

    const p = fetch(url, { headers: { Accept: 'application/json' } })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        // Le magasin actif a changé pendant l'aller-retour : cette réponse parle
        // d'ailleurs, on la jette plutôt que de l'afficher sous le mauvais nom.
        if (slug !== core.VENUE) return null;
        if (!res || !res.ok || !Array.isArray(res.stores)) return null;
        if (res.stores.length <= 1) { cross.solo = true; return null; }
        const out = {
          code: res.code || '',
          // Seulement les AUTRES : le magasin où l'on se tient est déjà à l'écran.
          stores: res.stores.filter((s) => s && !s.self),
        };
        cross.cache[key] = { at: Date.now(), res: out };
        return out;
      })
      .catch(() => null)      // hors ligne → le scan local a déjà répondu
      .then((v) => { delete cross.inflight[key]; return v; });

    cross.inflight[key] = p;
    return p;
  }

  // Changer de magasin invalide tout : « l'autre boutique » ne désigne plus les
  // mêmes, et un compte solo ici peut être multi-magasins là.
  function crossReset() {
    cross.solo = false;
    cross.cache = Object.create(null);
    cross.inflight = Object.create(null);
  }

  // Le magasin actif vient de changer (ou la page vient de s'ouvrir) : on lit sa
  // copie serveur une fois.
  function cloudBind() {
    const slug = core.VENUE;
    if (!cloudOn() || cloud.read[slug]) return;
    cloud.dirty = !!dirtyToken(slug);
    pull(true);
  }

  /* Revenir sur l'onglet est le moment où l'on veut voir ce que l'AUTRE appareil
   * a fait — la caisse a vendu pendant qu'on regardait ailleurs. On relit, sans
   * marteler le serveur. */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!cloudOn() || Date.now() - cloud.last < 20000) return;
    pull(false);
  });

  /* An offline stock movement must not wait for a second sale to reach D1.
     Browser `online` is only a wake-up hint; pushNow still handles failures and
     revision conflicts safely. */
  window.addEventListener('online', () => {
    if (!cloudOn()) return;
    if (cloud.dirty) schedulePush(0);
    else if (Date.now() - cloud.last >= 20000) pull(false);
  });

  /* A till can stay visible for an entire shift. Visibility-only refresh meant
     two open tills never learned about each other's sales. Poll only hosted real
     pages, only while visible, and retain the existing 20 s floor. */
  if (window.location && typeof window.setInterval === 'function') {
    window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !cloudOn() || cloud.busy) return;
      if (Date.now() - cloud.last >= 20000) pull(false);
    }, 20000);
  }

  // Une modification en attente ne doit pas mourir avec l'onglet.
  window.addEventListener('pagehide', () => {
    if (cloud.timer) { clearTimeout(cloud.timer); cloud.timer = null; pushNow({ keepalive: true }); }
  });

  return {
    cloud, DIRTY_KEY, markCatalogDirty, schedulePush, pull, cloudBind,
    reserveSale, confirmSale, releaseSale, crossStock, crossReset,
  };
};

window.__kiwiBoutiqueCatalogParts.csv = function (core) {
  'use strict';
  const { catById, variantsOf, COLOR_BY_ID, famOf } = core;

  /* ───────────────── CSV export (simple) ─────────────────
     `couleur` is the general family, the same word the merchant sees on screen,
     so a report reads like the shop does. `couleur_saisie` carries the original
     shade when there was one — a re-import or an accountant looking at last
     season's records still finds "Bleu nuit" next to its Bleu. */
  /* Le `cout` fait partie de l'export, sinon la boucle « exporter → corriger
     dans Excel → réimporter » perdrait silencieusement le prix d'achat de tout
     le stock — et avec lui la valorisation et la marge. L'import lit cette
     colonne (BOUTIQUE_COLS.cout dans assets/catalog-import.js) : les deux bouts
     doivent bouger ensemble. */
  function exportCsv() {
    const rows = [['produit', 'categorie', 'couleur', 'couleur_saisie', 'taille', 'prix_mad', 'cout', 'stock', 'code_barres', 'type']];
    core.db.products.filter((p) => !p.archived).forEach((p) => {
      const cat = catById(p.categoryId);
      variantsOf(p.id).forEach((v) => {
        const fam = COLOR_BY_ID(famOf(v));
        (v.barcodes.length ? v.barcodes : [{ code: '', type: '' }]).forEach((b) => {
          rows.push([p.name, cat ? cat.name : '', fam ? fam.label : v.colorLabel, v.colorSource || '', v.size, p.priceMAD, p.cost || '', v.stock, b.code, b.type]);
        });
      });
    });
    const cell = (c) => {
      let s = String(c == null ? '' : c);
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return rows.map((r) => r.map(cell).join(',')).join('\n');
  }

  return { exportCsv };
};

/* Second puits local, uniquement quand localStorage refuse. Les opérations
 * sont sérialisées ; les documents en attente sont remplacés par le dernier
 * de CHAQUE clé, jamais par celui d'une autre boutique. */
window.__kiwiBoutiqueCatalogParts.well = function () {
  'use strict';
  let opening, tail = Promise.resolve();
  const pending = new Map(), copies = new Set();
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      try {
        const r = window.indexedDB.open('kiwi-catalog', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('docs');
        r.onsuccess = () => resolve(r.result);
        r.onerror = r.onblocked = () => reject(new Error('catalog storage unavailable'));
      } catch (e) { reject(e); }
    });
    return opening;
  }
  function transaction(key, action, value) {
    return open().then(db => new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('docs', action === 'get' ? 'readonly' : 'readwrite');
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = tx.onabort = () => reject(new Error('catalog storage transaction failed'));
        const store = tx.objectStore('docs');
        const r = action === 'put' ? store.put(value, key) : store[action](key);
        r.onsuccess = () => { result = r.result; };
      } catch (e) { reject(e); }
    }));
  }
  function enqueue(fn) { const job = tail.then(fn); tail = job.catch(() => {}); return job; }
  function save(key, doc, done, owner) {
    if (doc == null && !copies.has(key)) return;
    if (doc != null) copies.add(key);
    const job = { doc: doc == null ? null : JSON.parse(JSON.stringify(doc)), done, owner: String(owner || '') };
    if (pending.has(key)) { pending.set(key, job); return; }
    pending.set(key, job);
    enqueue(() => {
      const next = pending.get(key); pending.delete(key);
      return transaction(key, next.doc == null ? 'delete' : 'put', { doc: next.doc, at: Date.now(), owner: next.owner })
        .then(() => { if (next.doc == null && !pending.has(key)) copies.delete(key); next.done(true); }, () => next.done(false));
    });
  }
  return { read: key => enqueue(() => transaction(key, 'get').then(copy => { if (copy) copies.add(key); return copy; })), save };
};
