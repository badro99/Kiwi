/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE CATALOG · le journal du stock
 * ---------------------------------------------------------------------------
 * Une partie de window.KiwiBoutiqueCatalog (assets/boutique-catalog.js), sortie
 * du fichier principal telle quelle : le stock comme journal (socle + mouvements),
 * son repli (compaction), les suppressions datées, et la fusion de deux copies
 * du catalogue. Aucun réseau ici, aucun écouteur : des règles sur un document.
 *
 * Ce fichier ne fait que DÉCLARER une fabrique ; c'est boutique-catalog.js qui
 * l'appelle, avec l'état qu'il possède (`core.db`). À charger AVANT
 * boutique-catalog.js, comme assets/boutique-catalog-io.js.
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
  var lastNow = 0;
  function now() {
    var t = Date.now();
    if (t <= lastNow) t = lastNow + 1;
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
