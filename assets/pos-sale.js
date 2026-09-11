/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · POS SALE — le journal partagé des quinze métiers.
 * ---------------------------------------------------------------------------
 * Chaque module assets/pos-<métier>.js encaissait dans une variable de closure
 * et rien d'autre. Une boulangerie vendait toute la journée : le compteur du
 * comptoir montait, le tableau de bord de la patronne restait à 0 MAD, et le
 * moindre rechargement (mise à jour PWA, batterie, onglet tué par iOS) effaçait
 * la recette. Seule la boutique (pos-boutique.js) persistait, et la caisse
 * restaurant via recordSale() dans kiwi-caisse.html.
 *
 * Ce module est le point de passage unique. Un métier appelle :
 *
 *   KiwiPosSale.record('epicerie', {
 *     total: 84.5, method: 'especes', label: 'Pain +3 art.', ref: 'T-642',
 *     lines: [{ name, qty, total }],           // facultatif
 *   });
 *
 * et il obtient DEUX choses, celles qui manquaient :
 *
 *  1. LE SERVEUR — miroir vers /api/sale via KiwiLive.postSale(). C'est ce qui
 *     fait apparaître la vente sur « En direct » et dans les KPI du tableau de
 *     bord. File d'attente hors-ligne comprise (live-link.js) : une vente prise
 *     sans réseau part dès le retour du réseau, elle n'est jamais perdue.
 *  2. LE JOURNAL LOCAL — kiwi:posDay:<métier>, filtré sur aujourd'hui. C'est ce
 *     qui permet au terminal de retrouver SA journée après un rechargement, sans
 *     attendre le serveur. Préfixe `kiwi:` : purgé au changement de compte
 *     (TENANT_PREFIXES dans identity.js), et le filtre « aujourd'hui » fait
 *     basculer le compteur tout seul — à la bascule de la JOURNÉE COMMERCIALE
 *     (KiwiDayReport), la même que le rapport Z, pas à minuit.
 *
 * LA DÉMO N'ÉCRIT RIEN. pvReal() faux ⇒ record() ne persiste pas et ne poste
 * pas : les quinze démos gardent exactement le comportement d'avant, chiffres
 * d'amorçage compris. C'est volontaire — la démo doit rester identique au bit
 * près, et une démo qui posterait des ventes polluerait les livres d'un vrai
 * commerçant signé sur le même navigateur.
 *
 * Un encaissement différé (« payer plus tard », méthode null, montant nul) n'est
 * PAS une recette : record() le refuse. Le module rappellera quand l'argent
 * rentre vraiment, au moment du solde.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PREFIX = 'kiwi:posDay:';
  var MAX_ROWS = 800;          /* garde-fou mémoire : ~une journée très chargée */

  function paired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  /* Vrai commerce = session hébergée OU terminal appairé. Même règle que les
     modules métier (pvReal) et que pos-boutique.js (isDemoStore), pour qu'un
     seul et même terminal ne soit jamais « réel » ici et « démo » là-bas. */
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!window.KiwiPlatform?.isPaired?.() || !!paired(); }
    catch (_) { return !!paired(); }
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  /* « Aujourd'hui » veut dire LA JOURNÉE COMMERCIALE, pas la date du calendrier.
   * Un restaurant qui ferme à 01h voyait son journal de comptoir se vider au
   * milieu du service : la vente de 00h05 tombait dans une nouvelle journée, le
   * compteur du terminal repartait de zéro, et le rapport Z — qui compte, lui,
   * depuis la bascule — annonçait un autre chiffre pour la même soirée. Deux
   * nombres pour un seul tiroir, et c'est le comptoir qui contredit la caisse.
   *
   * La bascule est celle de KiwiDayReport : réglée par le commerçant, ou déduite
   * de ses horaires. S'il n'est pas chargé (un module métier monté seul, un
   * test), on retombe sur minuit — l'ancien comportement, jamais pire. */
  function isToday(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return false;
    try {
      var R = window.KiwiDayReport;
      if (R && R.businessDay && R.today) return R.businessDay(d.getTime()) === R.today();
    } catch (_) {}
    return sameDay(d, new Date());
  }

  function key(vertical) { return PREFIX + String(vertical || 'pos'); }

  /* ─── QUI a encaissé cette ligne ───
   * Le journal est indexé par MÉTIER (kiwi:posDay:epicerie), pas par
   * établissement. Deux commerces servis depuis le même navigateur — le cas
   * courant quand un propriétaire ouvre sa boutique et son restaurant, ou
   * quand un terminal de démonstration change de mains — écrivaient donc dans
   * la même clé, et l'assistant les additionnait pour classer les produits.
   * Le classement d'un commerce contenait les ventes de l'autre.
   *
   * Chaque ligne porte maintenant son locataire. Le lecteur (assets/agent-data.js)
   * ne retient que les siennes ; il n'y a plus rien à déduire de la clé. */
  var TENANTS_KEY = 'kiwi:posTenants';
  function tenant() {
    /* A till changes owner by PAIRING. The dashboard/session live target may be
       stale for a tick during re-pairing, so the device binding must win. */
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return pm;
      }
      var pv = paired();
      if (pv && pv.merchant) return String(pv.merchant).slice(0, 64);
    } catch (_) {}
    try {
      if (window.KiwiLive && window.KiwiLive.merchant) {
        var m = window.KiwiLive.merchant();
        if (m) return String(m).slice(0, 64);
      }
    } catch (_) {}
    return '';
  }
  /* La liste des locataires que CE navigateur a vus encaisser. Elle sert à une
     seule décision, chez le lecteur : une ligne écrite avant ce changement ne
     porte pas de locataire, et on ne peut l'attribuer honnêtement que s'il n'y
     en a jamais eu qu'un — le même raisonnement que preSplitBucket() côté
     serveur. Deux locataires ⇒ la ligne anonyme est écartée plutôt que
     devinée. */
  function noteTenant(t) {
    if (!t) return;
    try {
      var a = JSON.parse(localStorage.getItem(TENANTS_KEY) || '[]');
      if (!Array.isArray(a)) a = [];
      if (a.indexOf(t) === -1) { a.push(t); localStorage.setItem(TENANTS_KEY, JSON.stringify(a.slice(-8))); }
    } catch (_) {}
  }

  function read(vertical) {
    /* La démo ne LIT pas le journal, pas seulement elle n'y écrit pas. Un
       terminal qui a servi à un vrai commerce puis revient en démo (démo de
       vente, appairage retiré, session fermée) retrouvait sinon la recette
       réelle ajoutée par-dessus les chiffres d'amorçage : 2 831 MAD au lieu
       des 2 560 MAD attendus. La démo doit rester identique au bit près,
       quoi qu'il traîne dans le stockage. */
    if (!isReal()) return [];
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(key(vertical)) || '[]'); } catch (_) { return []; }
    if (!Array.isArray(raw)) return [];
    /* Le journal d'hier n'est pas le compteur d'aujourd'hui. Defence in depth:
       the pairing purge is the primary boundary, but a damaged/legacy browser
       must still never total a row explicitly owned by another merchant. */
    var who = tenant(), seen = [];
    try { seen = JSON.parse(localStorage.getItem(TENANTS_KEY) || '[]'); if (!Array.isArray(seen)) seen = []; } catch (_) { seen = []; }
    return raw.filter(function (s) {
      if (!(s && +s.total > 0 && isToday(s.ts))) return false;
      if (s.m) return !!who && s.m === who;
      /* Pre-tenant rows are safe only while this browser has known at most this
         one tenant. Once it has seen two, guessing would be a data leak. */
      return !!who && (seen.length === 0 || (seen.length === 1 && seen[0] === who));
    });
  }
  function write(vertical, rows) {
    try { localStorage.setItem(key(vertical), JSON.stringify(rows.slice(-MAX_ROWS))); } catch (_) {}
  }

  /* Les métiers parlent français ('especes', 'carte', 'virement'…), le serveur
     parle le vocabulaire des terminaux (cash|card|wallet). Traduire ici plutôt
     que dans quinze modules : une vente au virement comptée comme espèces
     fausserait la répartition des encaissements du tableau de bord. */
  var METHOD_MAP = {
    especes: 'cash', espece: 'cash', cash: 'cash', liquide: 'cash',
    carte: 'card', card: 'card', tpe: 'card', cb: 'card',
    virement: 'wallet', transfer: 'wallet', wallet: 'wallet',
    glovo: 'wallet', online: 'wallet', enligne: 'wallet',
    cheque: 'wallet', qr: 'qr', tap: 'tap',
    split: 'split', mixed: 'split', partage: 'split',
    credit: 'credit', ardoise: 'credit', acompte: 'credit',
    room: 'room', folio: 'room', chambre: 'room',
  };
  function normMethod(m) {
    /* NFD d'abord. Sans ça « chèque » se réduisait à « chque », introuvable
       dans la table, et retombait sur le défaut 'cash' : un règlement par
       chèque était compté en espèces dans la répartition des encaissements et
       dans le tiroir du rapport de clôture. « espèces » → « espces » tombait
       sur le même défaut et donnait la bonne réponse par accident, ce qui est
       exactement pourquoi ça n'a jamais été vu. */
    var k = String(m == null ? '' : m).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z]/g, '');
    return METHOD_MAP[k] || 'cash';
  }

  /* The canonical browser-side sale line.  Long property names keep vertical
   * modules readable; live-link compacts them for its offline queue and the API
   * stores the equivalent short-key wire form.  Legacy callers that only know
   * name/qty/total continue to produce the exact same useful subset. */
  function cleanLine(l) {
    l = l || {};
    var qty = Math.round(Math.max(0, Math.min(1000000, +(l.qty ?? l.q ?? l.quantity) || 0)) * 1000) / 1000;
    var o = {
      name: String(l.name ?? l.n ?? 'Article').slice(0, 60),
      qty: qty || 1,
      total: Math.round(Math.max(0, Math.min(100000000, +(l.total ?? l.t) || 0)) * 100) / 100,
    };
    var cat = String(l.cat ?? l.category ?? l.c ?? '').slice(0, 40);
    var itemId = String(l.itemId ?? l.item_id ?? l.i ?? l.id ?? '').slice(0, 80);
    var variantId = String(l.variantId ?? l.variant_id ?? l.v ?? '').slice(0, 80);
    var unit = String(l.unit ?? l.u ?? '').slice(0, 24);
    var kind = String(l.kind ?? l.kd ?? '').slice(0, 24);
    var recipe = String(l.recipeVersionId ?? l.recipe_version_id ?? l.r ?? '').slice(0, 80);
    if (cat) o.cat = cat;
    if (itemId) o.itemId = itemId;
    if (variantId) o.variantId = variantId;
    if (unit) o.unit = unit;
    if (kind) o.kind = kind;
    if (recipe) o.recipeVersionId = recipe;
    var cost = +(l.unitCost ?? l.unit_cost ?? l.k);
    if (Number.isFinite(cost) && cost >= 0 && cost <= 10000000) o.unitCost = Math.round(cost * 100) / 100;
    var rawOptions = l.options ?? l.optionDeltas ?? l.option_deltas ?? l.o;
    if (Array.isArray(rawOptions)) {
      var options = rawOptions.slice(0, 16).map(function (x) {
        if (typeof x === 'string') return { id: x.slice(0, 80), qty: 1 };
        var id = String((x && (x.id ?? x.i ?? x.itemId)) || '').slice(0, 80);
        var q = Math.round(Math.max(-1000000, Math.min(1000000, +(x && (x.qty ?? x.q ?? x.quantity)) || 0)) * 1000) / 1000;
        return id ? { id: id, qty: q || 1 } : null;
      }).filter(Boolean);
      if (options.length) o.options = options;
    }
    return o;
  }

  /* ─────────────────────────── l'API ─────────────────────────── */

  /* record(vertical, sale) → l'entrée journalisée, ou null si rien n'a été pris.
     Ne jette jamais : un encaissement réussi ne doit pas échouer parce que le
     stockage est plein ou que le miroir tombe. */
  function record(vertical, sale) {
    if (!sale) return null;
    var total = Math.round((+sale.total || 0) * 100) / 100;
    /* Montant nul ou négatif ⇒ ce n'est pas une recette. Les différés
       ('payer plus tard') et les avoirs passent par là et sont ignorés. */
    if (!(total > 0)) return null;
    if (!isReal()) return null;                 /* la démo reste en mémoire */

    var at = sale.at instanceof Date ? sale.at : new Date();
    var who = tenant();
    if (!who) return null;                       /* never create an ownerless taking */
    noteTenant(who);
    var entry = {
      ts: at.getTime(),
      total: total,
      m: who,                                    /* le locataire, voir tenant() */
      method: normMethod(sale.method),
      raw: sale.method == null ? '' : String(sale.method),   /* le mot du métier, pour le journal local */
      label: String(sale.label || 'Vente').slice(0, 80),
      /* Central stamping covers every métier, including older modules that
         forgot to call stamp() themselves. This is idempotent for the newer
         ones and prevents two tills' ticket #42 sharing one server id. */
      ref: stamp(String(sale.ref || '').slice(0, 32)),
    };
    var saleChannel = String(sale.channel || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
    if (saleChannel) entry.channel = saleChannel;
    if (Array.isArray(sale.lines) && sale.lines.length) {
      entry.lines = sale.lines.slice(0, 40).map(cleanLine);
    }
    if (Array.isArray(sale.parts) && sale.parts.length) {
      entry.parts = sale.parts.slice(0, 8).map(function (p) {
        return {
          method: normMethod(p && p.method),
          amount: Math.round(Math.max(0, Math.min(100000000, +(p && p.amount) || 0)) * 100) / 100,
          clientId: String((p && p.clientId) || '').slice(0, 80),
          authorization: String((p && p.authorization) || '').slice(0, 80),
        };
      }).filter(function (p) { return p.amount > 0; });
    }

    var rows = read(vertical);
    rows.push(entry);
    write(vertical, rows);

    /* Miroir serveur — c'est LUI qui alimente le tableau de bord. Enveloppé :
       une panne du miroir ne doit jamais casser la vente au comptoir. */
    try {
      if (window.KiwiLive && window.KiwiLive.isOn && window.KiwiLive.isOn()) {
        var queued = window.KiwiLive.postSale({
          amount: total, method: entry.method, label: entry.label,
          ref: entry.ref, time: at, channel: entry.channel || '',
          /* Le détail du panier suit la vente. Il était construit juste
             au-dessus et restait sur ce terminal : le serveur ne recevait que
             {montant, moyen, libellé}, et le libellé est un RÉSUMÉ de ticket
             (« Pain +3 art. »). Résultat, « quel est mon produit le plus
             vendu » n'avait de réponse que si la caisse tournait dans le même
             navigateur que le tableau de bord — jamais le cas quand la caisse
             est au comptoir et le tableau de bord dans l'arrière-boutique. */
          lines: entry.lines || null,
        });
        /* Linked ledgers (hotel folios today, other append-only journals
           tomorrow) need the exact idempotency key that /api/sale receives.
           Returning it here avoids rebuilding live-link's stableId recipe in
           every vertical and keeps retries attached to one financial row. */
        if (queued && queued.id) entry.saleId = String(queued.id);
      }
    } catch (_) {}

    /* Stock truth is written from the same immutable sale-line payload. The
       movement IDs derive from the ticket reference, so a reload/replay can
       never consume the same item twice. Services are ignored by the engine. */
    try { window.KiwiInventoryConsumption?.record?.(entry); } catch (_) {}

    return entry;
  }

  /* today(vertical) → les ventes d'aujourd'hui déjà encaissées sur ce terminal.
     À appeler au montage pour reconstruire les compteurs de la journée. */
  function today(vertical) { return read(vertical); }

  /* dropRefs(refs) → retire du journal local les ventes que la console
     opérateur a sorties des livres.

     Le compteur du comptoir est ce que le commerçant a sous les yeux. Une vente
     d'essai passée pendant l'installation, retirée côté serveur, y resterait
     jusqu'à minuit — sur l'écran même où on vient de lui promettre le contraire.
     assets/live-link.js appelle ceci avec les références que /api/feed renvoie
     (voir watchVoids).

     Par RÉFÉRENCE de ticket, parce que c'est la seule clé que la caisse et le
     serveur partagent : la caisse ne connaît pas les curseurs du flux, et
     `ts + montant` confondrait deux ventes identiques de la même seconde.
     Balaye les quinze journaux métier, pas seulement celui en cours : un
     terminal partagé (le pressing derrière la boulangerie) en tient plusieurs,
     et on ne sait pas d'ici lequel a encaissé la ligne.

     Les références sont ÉTIQUETÉES par terminal (stamp() plus bas : « T-642 »
     devient « T-642-A7 »), et c'est la forme étiquetée qui est partie au
     serveur. On compare donc les deux sens — sinon une caisse ne reconnaîtrait
     pas sa propre vente. */
  /* matcher(refs) → une fonction « cette référence est-elle dans la liste ? ».
     Sortie d'ici parce que la boutique en a besoin aussi : elle tient son propre
     journal (kiwi:bqDay, une semaine, avec le détail des déclinaisons) et doit
     reconnaître les mêmes références pour rendre le stock d'une vente sortie des
     livres. Deux comparateurs pour une même règle, c'est un jour où l'un des
     deux ne connaîtra pas l'étiquette de terminal. Renvoie null si la liste est
     vide — l'appelant n'a alors rien à faire. */
  function matcher(refs) {
    if (!refs || !refs.length) return null;
    var want = {};
    refs.forEach(function (r) {
      var s = String(r || '').trim();
      if (s) want[s] = 1;
    });
    if (!Object.keys(want).length) return null;
    return function (ref) {
      var s = String(ref || '').trim();
      if (!s) return false;
      if (want[s]) return true;
      /* La référence locale peut être nue là où le serveur a la version
         étiquetée, et inversement selon l'ordre des versions. */
      if (want[stamp(s)]) return true;
      var bare = s.replace(new RegExp('-' + deviceTag() + '$'), '');
      return !!want[bare];
    };
  }

  function dropRefs(refs) {
    if (!isReal()) return 0;
    var hit = matcher(refs);
    if (!hit) return 0;
    var gone = 0;
    var dropped = [];
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
    } catch (_) { return 0; }
    keys.forEach(function (k) {
      var rows = null;
      try { rows = JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return; }
      if (!Array.isArray(rows) || !rows.length) return;
      var kept = rows.filter(function (s) {
        var out = !!(s && hit(s.ref));
        if (out) dropped.push(s);
        return !out;
      });
      if (kept.length === rows.length) return;
      gone += rows.length - kept.length;
      try { localStorage.setItem(k, JSON.stringify(kept)); } catch (_) {}
    });
    /* La vente a consommé du stock en entrant (record() plus haut écrit les
       mouvements). La sortir des livres sans rendre ces articles laissait
       l'inventaire plus bas que le réel — définitivement, puisque rien d'autre
       ne repasse par là. Le contre-mouvement porte un identifiant dérivé du
       mouvement d'origine : rejouer l'annulation ne le rend pas deux fois. */
    dropped.forEach(function (s) {
      try { window.KiwiInventoryConsumption?.reverse?.(s.ref, 'Vente sortie des livres'); } catch (_) {}
    });
    /* Les modules métier reconstruisent leurs compteurs depuis today()/totals()
       au montage. Un signal leur dit de recompter sans qu'on ait à connaître
       leurs quinze internes ; ceux qui ne l'écoutent pas seront justes au
       prochain rendu, jamais faux. */
    if (gone) {
      try { document.dispatchEvent(new CustomEvent('kiwi-pos-voided', { detail: { count: gone } })); } catch (_) {}
    }
    return gone;
  }

  /* totals(vertical) → { total, cash, card, other, count } — le calcul que les
     quinze modules referaient sinon chacun de leur côté. */
  function totals(vertical) {
    var t = { total: 0, cash: 0, card: 0, other: 0, count: 0 };
    read(vertical).forEach(function (s) {
      var a = +s.total || 0;
      t.total += a; t.count++;
      if (s.method === 'cash') t.cash += a;
      else if (s.method === 'card') t.card += a;
      else t.other += a;
    });
    t.total = Math.round(t.total * 100) / 100;
    t.cash = Math.round(t.cash * 100) / 100;
    t.card = Math.round(t.card * 100) / 100;
    t.other = Math.round(t.other * 100) / 100;
    return t;
  }

  /* nextSeq(vertical, floor) → le prochain numéro de ticket, repris AU-DELÀ du
     dernier numéro déjà encaissé aujourd'hui. Sans ça, un rechargement remet le
     compteur à sa valeur initiale et deux tickets différents portent le même
     numéro — ce qu'une caisse ne peut pas se permettre. Les références non
     numériques (P-1045, MM-1208…) sont lues sur leur partie chiffrée. */
  function nextSeq(vertical, floor) {
    var max = 0;
    read(vertical).forEach(function (s) {
      var n = parseInt(String(s.ref || '').replace(/^\D+/, ''), 10);
      if (n > max) max = n;
    });
    var base = +floor || 0;
    return max >= base ? max + 1 : base;
  }

  /* ─── serveur → caisse : une seule journée, un seul livre ────────────────
   * record() above already makes every specialist till WRITE the canonical
   * server ledger. Reading only kiwi:posDay:<métier> nevertheless left a
   * second till, an employee checkout or an OrderPro payment invisible in the
   * first till's « aujourd'hui » counters. The dashboard was right while the
   * counter beside the cash drawer was lower — exactly the discrepancy a
   * shared ledger is supposed to prevent.
   *
   * Reconcile by immutable receipt identity (server id/cursor, then printed
   * reference). Never replace the local journal wholesale: an offline taking
   * may still be waiting in KiwiLive's outbox and must remain visible locally.
   * The union is therefore safe in both directions: server rows repair other
   * devices; unsent local rows survive until their idempotent POST lands. */
  var syncing = {};
  var activeVertical = '';
  var activeTimer = null;
  var ACTIVE_MS = 5000, HIDDEN_MS = 30000;

  function dayStart(slug) {
    try {
      var R = window.KiwiDayReport;
      if (R && R.today && R.dayBounds) return R.dayBounds(R.today(slug), slug).from;
    } catch (_) {}
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  function sameReceipt(a, b) {
    if (!a || !b) return false;
    if (a.saleId && b.saleId && String(a.saleId) === String(b.saleId)) return true;
    if (a.cursor && b.cursor && Number(a.cursor) === Number(b.cursor)) return true;
    var ar = String(a.ref || '').trim(), br = String(b.ref || '').trim();
    if (!ar || !br) return false;
    if (ar === br) return true;
    try { return !!matcher([br])(ar); } catch (_) { return false; }
  }
  function fromServer(s, who) {
    if (!s || !(+s.amount > 0)) return null;
    var row = {
      ts: Number(s.ts) || Date.now(), total: Math.round(+s.amount * 100) / 100,
      m: who, method: normMethod(s.method), raw: String(s.method || ''),
      label: String(s.label || 'Vente').slice(0, 80),
      ref: String(s.ref || '').slice(0, 64),
      saleId: String(s.id || '').slice(0, 80), cursor: Number(s.cursor) || 0,
    };
    var channel = String(s.channel || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
    if (channel) row.channel = channel;
    if (Array.isArray(s.lines) && s.lines.length) row.lines = s.lines.slice(0, 40).map(cleanLine);
    return row;
  }
  function ingest(vertical, sales, who) {
    if (!isReal() || !who || who !== tenant() || !Array.isArray(sales)) return { changed: 0, added: 0 };
    noteTenant(who);
    var rows = read(vertical), changed = 0, added = 0;
    sales.forEach(function (sale) {
      var incoming = fromServer(sale, who);
      if (!incoming || !isToday(incoming.ts)) return;
      var at = -1;
      for (var i = 0; i < rows.length; i++) { if (sameReceipt(rows[i], incoming)) { at = i; break; } }
      if (at < 0) { rows.push(incoming); changed++; added++; return; }
      /* The server is authoritative for financial fields; preserve local-only
         split-payment metadata until the API carries it too. */
      var keep = rows[at];
      var before = JSON.stringify([keep.ts, keep.total, keep.m, keep.method, keep.raw,
        keep.label, keep.ref, keep.saleId, keep.cursor, keep.channel, keep.lines]);
      ['ts','total','m','method','raw','label','ref','saleId','cursor','channel','lines'].forEach(function (k) {
        if (incoming[k] !== undefined) keep[k] = incoming[k];
      });
      var after = JSON.stringify([keep.ts, keep.total, keep.m, keep.method, keep.raw,
        keep.label, keep.ref, keep.saleId, keep.cursor, keep.channel, keep.lines]);
      if (before !== after) changed++;
    });
    if (changed) write(vertical, rows);
    return { changed: changed, added: added };
  }
  function sync(vertical, notify) {
    vertical = String(vertical || '');
    var who = tenant();
    if (!vertical || !who || !isReal() || typeof fetch !== 'function') return Promise.resolve({ changed: 0, added: 0 });
    var slot = who + ':' + vertical;
    if (syncing[slot]) return syncing[slot];
    var url = '/api/feed?merchant=' + encodeURIComponent(who) + '&from=' + encodeURIComponent(dayStart(who));
    syncing[slot] = fetch(url, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || (data.merchant && String(data.merchant) !== who)) return { changed: 0, added: 0 };
        var removed = 0;
        var voidRefs = [];
        if (Array.isArray(data.voided) && data.voided.length) {
          voidRefs = data.voided.map(function (v) { return v && v.r; }).filter(Boolean);
          removed = dropRefs(voidRefs);
        }
        /* /api/feed may legitimately return the append-only sale row and its
           later void marker in one response. A void is the final accounting
           state, so never re-import that receipt from the historical rows. */
        var voidHit = matcher(voidRefs);
        var liveSales = (data.sales || []).filter(function (sale) {
          return !(voidHit && sale && voidHit(sale.ref));
        });
        var result = ingest(vertical, liveSales, who);
        result.removed = removed;
        /* The first pull must repaint after each métier restores its own saved
           snapshot. Later polls stay silent unless the canonical day changed,
           otherwise a five-second refresh would steal focus from cashiers. */
        if (notify || result.changed || removed) {
          try {
            document.dispatchEvent(new CustomEvent('kiwi-pos-sales-synced', {
              detail: { vertical: vertical, merchant: who, changed: result.changed,
                added: result.added, removed: removed, totals: totals(vertical) },
            }));
          } catch (_) {}
        }
        return result;
      }).catch(function () { return { changed: 0, added: 0 }; })
      .then(function (result) { delete syncing[slot]; return result; }, function (error) { delete syncing[slot]; throw error; });
    return syncing[slot];
  }
  function activeDelay() {
    try { return document.hidden ? HIDDEN_MS : ACTIVE_MS; } catch (_) { return ACTIVE_MS; }
  }
  function armActive(ms) {
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = activeVertical ? setTimeout(function tick() {
      sync(activeVertical).then(function () { armActive(activeDelay()); });
    }, ms == null ? activeDelay() : ms) : null;
  }
  function activate(vertical) {
    activeVertical = String(vertical || '');
    if (!activeVertical) return Promise.resolve({ changed: 0, added: 0 });
    var job = sync(activeVertical, true);
    armActive(activeDelay());
    return job;
  }
  function deactivate() {
    activeVertical = '';
    if (activeTimer) clearTimeout(activeTimer);
    activeTimer = null;
  }
  try {
    document.addEventListener('visibilitychange', function () { if (activeVertical && !document.hidden) armActive(0); });
    window.addEventListener('focus', function () { if (activeVertical) armActive(0); });
    window.addEventListener('online', function () { if (activeVertical) armActive(0); });
  } catch (_) {}

  /* ─── identifiant de terminal ───
   * Le compteur de tickets vit dans le stockage LOCAL : deux caisses du même
   * commerce partent donc du même numéro et impriment toutes les deux « T-642 »
   * le même jour. Deux ventes différentes, un seul numéro : c'est un problème
   * de tenue de livres, et la numérotation d'une caisse doit être unique.
   * On suffixe donc chaque référence par une étiquette stable et courte, propre
   * au terminal (2 caractères, tirés une fois puis conservés). « T-642-A7 » et
   * « T-642-K3 » ne se confondent plus.
   * Ce choix reste HORS-LIGNE : une caisse sans réseau doit continuer à
   * encaisser, donc pas d'aller-retour serveur pour obtenir un numéro. Une
   * séquence fiscale unique délivrée par le serveur est un autre débat (et une
   * décision réglementaire) — voir le rapport. */
  var TAG_KEY = 'kiwi:posDevice';
  var _tag = null;
  function deviceTag() {
    if (_tag) return _tag;
    try {
      _tag = localStorage.getItem(TAG_KEY) || '';
      if (!/^[A-Z0-9]{2}$/.test(_tag)) {
        var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sans I/O/0/1 : illisibles sur un ticket
        var b = new Uint8Array(2);
        (crypto.getRandomValues ? crypto.getRandomValues(b) : (b[0] = 7, b[1] = 13));
        _tag = A[b[0] % A.length] + A[b[1] % A.length];
        localStorage.setItem(TAG_KEY, _tag);
      }
    } catch (_) { _tag = 'XX'; }
    return _tag;
  }
  /* stamp('T-642') → 'T-642-A7'. Idempotent : une référence déjà étiquetée
     n'est pas ré-étiquetée (le solde d'une commande reprend sa référence). */
  function stamp(ref) {
    var s = String(ref == null ? '' : ref);
    if (!s) return '';
    var tag = deviceTag();
    return new RegExp('-' + tag + '$').test(s) ? s : (s + '-' + tag);
  }

  window.KiwiPosSale = {
    record: record, today: today, totals: totals, nextSeq: nextSeq,
    isReal: isReal, deviceTag: deviceTag, stamp: stamp, dropRefs: dropRefs,
    refMatcher: matcher, cleanLine: cleanLine,
    ingest: ingest, sync: sync, activate: activate, deactivate: deactivate,
  };
})();
