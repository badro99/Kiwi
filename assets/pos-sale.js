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
    virement: 'transfer', versement: 'transfer', transfer: 'transfer', wallet: 'wallet',
    glovo: 'wallet', online: 'wallet', enligne: 'wallet',
    cheque: 'cheque', qr: 'qr', tap: 'tap',
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
  /* Au-delà de 40 lignes, conserver chaque centime dans une ligne de solde. */
  function foldLines(lines) {
    if (!Array.isArray(lines) || lines.length <= 40) return lines;
    var rest = lines.slice(39);
    return lines.slice(0, 39).concat([{
      name: rest.length + ' autres articles',
      qty: rest.reduce(function (n, l) { return n + Math.max(0, Number(l && l.qty) || 0); }, 0),
      total: rest.reduce(function (n, l) { return n + Math.round((Number(l && l.total) || 0) * 100); }, 0) / 100,
    }]);
  }
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

  /* A settled caisse sale prints its customer receipt at the payment boundary.
   * The print queue keeps the original job across a printer outage and dedupes
   * it by sale identity; a dashboard reconciliation must never print again. */
  function printCustomerReceipt(vertical, entry, sale, rows) {
    if (!entry || !/^(cash|card|wallet|qr|tap|split)$/.test(entry.method)) return;
    var K = window.KiwiReceipt;
    if (!K || typeof K.build !== 'function') return;
    var doc;
    try {
      doc = K.build({
        ref: entry.ref, ts: entry.ts,
        lines: entry.lines && entry.lines.length ? entry.lines : [{ name: entry.label, qty: 1, total: entry.total }],
        total: entry.total, method: entry.method,
        received: sale.received, change: sale.change,
        customer: sale.customer || null,
      });
    } catch (_) { return; }
    try { if (K.snapshot) { entry.rc = K.snapshot(doc); write(vertical, rows); } } catch (_) {}
    try {
      var queue = window.KiwiKitchenPrint;
      if (queue && typeof queue.enqueueReceipt === 'function') {
        var id = entry.saleId || ('pos:' + vertical + ':' + entry.ref + ':' + entry.ts);
        queue.enqueueReceipt(id, doc, 'original');
        return;
      }
      if (typeof K.print === 'function') Promise.resolve(K.print(doc)).catch(function () {});
    } catch (_) { /* The paid sale remains in the local ledger for reprinting. */ }
  }

  /* ── le client de la vente en cours (#0168) ───────────────────────────
     Les métiers qui encaissent par record() n'avaient aucun moyen de dire À
     QUI ils vendaient : la fiche client existait (assets/clients-book.js),
     mais ne recevait jamais un achat de ces comptoirs. Le carnet attache une
     fiche ici ; la prochaine vente encaissée la crédite (montant, articles,
     ticket, moyen), puis la fiche se détache · une vente = un passage. */
  var saleClient = null;
  function announceClient() {
    try { window.dispatchEvent(new CustomEvent('kiwi:pos-sale-client', { detail: saleClient })); } catch (_) {}
  }
  function attachClient(c) {
    saleClient = c && c.id ? { id: String(c.id).slice(0, 80), name: String(c.name || c.phone || '').slice(0, 80) } : null;
    /* Changer de client — ou le détacher — désarme la récompense : elle est
       demandée pour une personne et pour une vente, jamais héritée. */
    armed = null;
    announceClient();
    return saleClient;
  }
  function attachedClient() { return saleClient; }
  /* ── LA RÉCOMPENSE SUR LES DOUZE AUTRES COMPTOIRS ───────────────────────
   * Boutique, maison et la caisse restaurant posent la remise sur le ticket et
   * brûlent la carte toutes seules. Les douze métiers qui encaissent par
   * record() n'avaient rien : une carte pleine ne pouvait être remise qu'en
   * ouvrant la fiche du client et en appuyant sur « Offrir la récompense ·
   * réinitialiser ». Un geste à la main, oublié la moitié du temps, et le seul
   * chemin qui pouvait retirer les points deux fois.
   *
   * Ici la récompense s'ARME sur le client attaché : rien n'est retiré tant que
   * l'argent n'est pas rentré. La vente encaissée la brûle, nommée d'après elle
   * — donc une vente, une récompense, quoi qu'il arrive ensuite. Un client
   * détaché désarme : on ne retire jamais des points pour une remise qui n'a
   * pas été donnée.
   *
   * Ce que ces comptoirs ne savent pas encore faire : baisser leur propre
   * total. Aucun n'a de remise (pos-epicerie.js ne connaît pas le mot). Le
   * montant est donc ANNONCÉ au caissier, qui l'applique à la main ; leur
   * donner une vraie ligne de remise est un chantier à part. */
  var armed = null;   /* { clientId, label, kind, value, points, stamps } */
  var OWNS_REWARD = /(^|\s)is-pos-(boutique|maison|librairie)(\s|$)/;

  /* CE QUE LA CARTE DONNE, CE QU'ELLE COÛTE.
   * La récompense est une phrase écrite par le commerçant — « −12 % », « 1
   * offert », « 50 MAD de remise » — que chaque écran relisait à sa façon : la
   * caisse restaurant rendait même 10 % quand la phrase ne portait aucun chiffre
   * (« un thé offert »), une remise que personne n'avait écrite. Et le COÛT en
   * points n'était dit nulle part, alors que c'est lui que le commerçant cherche
   * au moment de donner la remise : la fiche annonçait « réinitialiser » quand le
   * moteur retire le seuil, si bien qu'un client à 1 289 points croyait tout
   * perdre au lieu d'en garder 289.
   * `kind: 'gift'` existe pour ça : on n'invente pas de chiffre là où il n'y en
   * a pas. Lecture pure, lue aussi par la fiche client (clients-book.js). */
  function rewardRead(c, cfg) {
    if (!c || !cfg || !cfg.model || cfg.auto) return null;
    var n = function (v, d) { var x = Math.round(Number(v)); return x > 0 ? x : d; };
    var out = { ready: false, kind: 'gift', value: 0, label: '', item: '', points: 0, stamps: 0 };
    if (cfg.model === 'amount') {
      out.points = n(cfg.amount && cfg.amount.threshold, 100);
      out.ready = (Number(c.points) || 0) >= out.points;
      out.label = String((cfg.amount && cfg.amount.reward) || '−10 %');
      var pct = out.label.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (pct) { out.kind = 'percent'; out.value = Number(pct[1].replace(',', '.')); return out; }
      var mad = out.label.match(/(\d+(?:[.,]\d+)?)\s*(?:MAD|DH|dh|درهم)/);
      if (mad) { out.kind = 'amount'; out.value = Number(mad[1].replace(',', '.')); }
      return out;
    }
    var product = cfg.model === 'product';
    out.kind = 'free';
    out.stamps = n(product ? (cfg.product && cfg.product.target) : (cfg.visit && cfg.visit.target), 10);
    out.ready = (Number(c.stamps) || 0) >= out.stamps;
    out.label = String((product ? (cfg.product && cfg.product.reward) : (cfg.visit && cfg.visit.reward)) || '1 offert');
    out.item = product ? String((cfg.product && cfg.product.item) || '') : '';
    return out;
  }
  /* QUI DONNE LA REMISE. Boutique, maison, librairie et la caisse restaurant la
     posent sur leur ticket ; la fiche client ne doit pas offrir un second bouton
     pour les mêmes points, sinon deux chemins retirent deux fois (Amira Café,
     28/10/2026). `hasNote` est vrai quand la caisse restaurant tient une note. */
  function rewardTillOwns(hasNote) {
    try {
      if (window.KiwiSaleReward || hasNote) return true;
      return OWNS_REWARD.test((document.body && document.body.className) || '');
    } catch (_) { return false; }
  }
  /* La vente en cours, quand c'est bien CE client qui y est attaché. */
  function rewardOnSale(id) {
    try {
      if (OWNS_REWARD.test((document.body && document.body.className) || '')) return null;
      var a = attachedClient();
      if (!a || a.id !== id || !rewardOf(id)) return null;
      return { armed: !!armedReward(), arm: function (on) { return armReward(on); } };
    } catch (_) { return null; }
  }
  function rewardOf(id) {
    var KC = window.KiwiClients;
    if (!KC || !KC.get || !KC.config || !id) return null;
    try { var rw = rewardRead(KC.get(id), KC.config()); return rw && rw.ready ? rw : null; } catch (_) { return null; }
  }
  /* Ce que le comptoir peut proposer pour le client de la vente en cours. */
  function readyReward() {
    var c = saleClient;
    return c ? rewardOf(c.id) : null;
  }
  function armedReward() {
    var c = saleClient;
    return (armed && c && armed.clientId === c.id) ? armed : null;
  }
  function armReward(on) {
    var c = saleClient;
    var rw = on && c ? rewardOf(c.id) : null;
    armed = rw ? { clientId: c.id, label: rw.label, kind: rw.kind, value: rw.value,
      points: rw.points, stamps: rw.stamps } : null;
    announceClient();
    return armed;
  }
  function creditClient(entry) {
    var c = saleClient;
    if (!c) return;
    var give = armedReward();
    saleClient = null;
    armed = null;
    announceClient();
    var KC = window.KiwiClients;
    if (!entry || !KC || typeof KC.recordPurchase !== 'function') return;
    try {
      var res = KC.recordPurchase(c.id, {
        amount: entry.total, method: entry.raw || entry.method,
        saleRef: entry.ref, saleId: entry.saleId || '', eventRef: entry.saleId || entry.ref,
        createdAt: entry.ts,
        items: (entry.lines || []).map(function (l) { return { name: l.name, qty: l.qty, total: l.total, id: l.itemId || l.pid || '' }; }),
      });
      if (res && !res.replayed) entry.clientId = c.id;
    } catch (_) {}
    /* L'achat d'abord, la remise ensuite : la visite doit compter avant que la
       carte ne reparte, sinon le passage qui la remplit se perd. */
    if (!give || typeof KC.redeem !== 'function' || typeof KC.redemptionRef !== 'function') return;
    try {
      KC.redeem(c.id, null, { ref: KC.redemptionRef(c.id, entry.saleId || entry.ref) });
      entry.rewardLabel = give.label;
    } catch (_) {}
  }

  /* ─────────────────────────── l'API ─────────────────────────── */

  /* #0166 · a paid sale ends the ticket. On a phone the ticket sheet folds
     back to the sale grid (pos-mobile.js listens). Every register reaches
     record(), so announcing it here covers all of them, demo included. */
  function ticketDone(total, method) {
    try {
      var roots = document.querySelectorAll('.vx-root');
      for (var i = 0; i < roots.length; i++) roots[i].dispatchEvent(new CustomEvent('vx-ticket-done', { bubbles: false }));
    } catch (_) {}
    /* The paid moment and its success haptic in the native app (native-runtime.js). */
    try { window.dispatchEvent(new CustomEvent('kiwi:sale-paid', { detail: { total: total, method: method || '' } })); } catch (_) {}
  }

  /* businessDayKey(date) → AAAAMMJJ du jour d'activité, la journée de la caisse
     coupant à 5 h et non à minuit : un ticket de 02:00 appartient à la veille. */
  function businessDayKey(d) {
    var t = new Date((d instanceof Date ? d.getTime() : Date.now()) - 5 * 3600000);
    return String(t.getFullYear() * 10000 + (t.getMonth() + 1) * 100 + t.getDate());
  }

  /* record(vertical, sale) → l'entrée journalisée, ou null si rien n'a été pris.
     Ne jette jamais : un encaissement réussi ne doit pas échouer parce que le
     stockage est plein ou que le miroir tombe. */
  function record(vertical, sale) {
    if (!sale) return null;
    var total = Math.round((+sale.total || 0) * 100) / 100;
    /* Montant nul ou négatif ⇒ ce n'est pas une recette. Les différés
       ('payer plus tard') et les avoirs passent par là et sont ignorés. */
    if (!(total > 0)) return null;
    ticketDone(total, sale.method);
    if (!isReal()) return null;                 /* la démo reste en mémoire */

    var at = sale.at instanceof Date ? sale.at : new Date();
    var who = tenant();
    if (!who) return null;                       /* never create an ownerless taking */
    noteTenant(who);
    var entry = {
      ts: at.getTime(),
      total: total,
      tipCents: Math.max(0, Math.round(Number(sale.tipCents) || 0)),
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
      entry.lines = sale.lines.map(cleanLine);
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

    /* The business day this ticket was rung in (5 h boundary, see
       businessDayKey). It joins the server id seed (live-link stableId) so the
       numbering restart of a new day never reuses an earlier day's id, yet the
       same sale keeps one id across every retry: it is fixed here, once. */
    entry.idDay = businessDayKey(at);

    var rows = read(vertical);
    rows.push(entry);
    write(vertical, rows);

    /* Miroir serveur — c'est LUI qui alimente le tableau de bord. Enveloppé :
       une panne du miroir ne doit jamais casser la vente au comptoir. */
    try {
      if (window.KiwiLive && window.KiwiLive.isOn && window.KiwiLive.isOn()) {
        replayHeld();
        var payload = {
          amount: total, tip: entry.tipCents / 100, method: entry.method, label: entry.label,
          ref: entry.ref, time: at, channel: entry.channel || '', idDay: entry.idDay,
          /* Le détail du panier suit la vente. Il était construit juste
             au-dessus et restait sur ce terminal : le serveur ne recevait que
             {montant, moyen, libellé}, et le libellé est un RÉSUMÉ de ticket
             (« Pain +3 art. »). Résultat, « quel est mon produit le plus
             vendu » n'avait de réponse que si la caisse tournait dans le même
             navigateur que le tableau de bord — jamais le cas quand la caisse
             est au comptoir et le tableau de bord dans l'arrière-boutique. */
          // Garder le détail local pour le reçu et le stock, borner seulement le miroir.
          lines: foldLines(entry.lines) || null,
        };
        /* Le reçu et le serveur gardent la même ventilation, mais seulement quand
           le serveur peut l'accepter telle quelle : de l'argent reçu (espèces,
           carte, virement, chèque) qui fait exactement le ticket. Une part sur
           l'ardoise rend le montant reçu inférieur au ticket, et /api/sale
           refuserait la vente entière (400) : elle part alors comme avant, sans
           ventilation, plutôt que d'être perdue. */
        var MONEY = { cash: 1, card: 1, transfer: 1, cheque: 1 };
        var wireParts = (entry.parts || []).map(function (p) { return { method: p.method, amountCents: Math.round(p.amount * 100) }; });
        var wireSum = wireParts.reduce(function (n, p) { return n + p.amountCents; }, 0);
        var wireMethod = wireParts.length > 1 ? 'split' : (wireParts[0] && wireParts[0].method);
        if (wireParts.length && wireParts.every(function (p) { return MONEY[p.method] && p.amountCents > 0; })
            && wireSum === Math.round(total * 100) && wireMethod === entry.method) {
          payload.paymentParts = wireParts;
          payload.ticketAmountCents = wireSum;
        }
        var queued = window.KiwiLive.postSale(payload);
        holdSale(payload, queued, who);
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

    creditClient(entry);
    /* saleId and clientId are only known after the first write; without this
       one the local row could never be matched to its server twin (reprint,
       dedupe) unless a receipt happened to print. */
    if (entry.saleId || entry.clientId) write(vertical, rows);

    printCustomerReceipt(vertical, entry, sale, rows);

    return entry;
  }

  /* ─── Une vente que la file de Live Link refuse repart ───
     postSale() répond {ok:true, queued:true} quand sa file a pris la vente. Un
     refus (stockage plein, caisse réappairée en plein service, commerce pas
     encore résolu au démarrage) était ignoré : la vente restait au comptoir et
     n'atteignait jamais le serveur, comme à la boutique jusqu'au 21 octobre
     (retail-sale-hold.js). Le journal du jour ne peut pas la garder : il ne
     relit que les lignes du jour et se réécrit à la vente suivante. Elle va
     donc dans sa propre file, avec le commerce où elle a été encaissée : le
     garde de postSale() ne la poste que là. postSale() en dérive le même
     identifiant, un renvoi ne compte jamais deux fois. */
  var HELD_KEY = 'kiwi:posHeld';
  function heldRead() {
    try { var a = JSON.parse(localStorage.getItem(HELD_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
  }
  // Ne jamais effacer une ancienne recette qui attend encore son envoi.
  function heldWrite(a) {
    try {
      if (a.length) localStorage.setItem(HELD_KEY, JSON.stringify(a));
      else localStorage.removeItem(HELD_KEY);
    } catch (_) {}
  }
  function holdSale(payload, res, who) {
    if (!payload || (res && res.ok === true && res.queued === true)) return false;
    var unresolved = false;
    try { unresolved = !(window.KiwiLive.merchant && window.KiwiLive.merchant()); } catch (_) { unresolved = true; }
    if (!((res && res.ok === false) || (!res && unresolved))) return false;
    var held = heldRead().filter(function (h) { return h && h.ref !== payload.ref; });
    held.push(Object.assign({}, payload, {
      merchant: payload.merchant || who || undefined,
      time: +new Date(payload.time || Date.now()),
    }));
    heldWrite(held);
    return true;
  }
  function replayHeld() {
    if (!isReal()) return 0;
    var Live = window.KiwiLive;
    if (!Live || !Live.postSale || !Live.isOn || !Live.isOn()) return 0;
    var held = heldRead();
    if (!held.length) return 0;
    var left = [], sent = 0;
    held.forEach(function (h) {                  /* la plus ancienne d'abord : la file garde l'ordre */
      var res = null;
      try { res = Live.postSale(Object.assign({}, h, { time: new Date(h.time) })); } catch (_) {}
      if (res && res.ok === true && res.queued === true) sent++;
      else left.push(h);
    });
    if (left.length !== held.length) heldWrite(left);
    return sent;
  }
  function heldCount() { return heldRead().length; }
  try {
    /* unref : sous Node (tests en vm) ces minuteries ne retiennent pas le processus. */
    var t0 = setTimeout(function () { try { replayHeld(); } catch (_) {} }, 4000);
    var t1 = setInterval(function () { try { if (heldRead().length) replayHeld(); } catch (_) {} }, 60000);
    if (t0 && t0.unref) t0.unref();
    if (t1 && t1.unref) t1.unref();
    window.addEventListener('online', function () { try { replayHeld(); } catch (_) {} });
  } catch (_) {}

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
      tipCents: Math.max(0, Math.round(Number(s.tipCents) || 0)),
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
    syncing[slot] = feedDay(url, { headers: { Accept: 'application/json' } })
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

  /* Une journée du flux (/api/feed?from=) s'arrête à 2 000 lignes : le serveur le
     dit (`truncated`) et donne la clé de la page plus ancienne (`before`). Les
     écrans qui additionnent la journée (caisses boutique et maison, synchro des
     ventes, réimpression, Vendus, contrôle du Z) la lisaient comme complète.
     Cette lecture suit les pages (20 000 lignes au plus) et rend UNE réponse ;
     si une page manque ou si la borne est atteinte, `truncated` reste vrai. */
  function feedDay(url, init) {
    var pages = 0, all = [], first = null;
    function more(u) {
      return fetch(u, init).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !Array.isArray(j.sales)) return first ? Object.assign({}, first, { sales: all, truncated: true }) : j;
        first = first || j;
        all = all.concat(j.sales);
        if (j.truncated && j.before && ++pages < 10) return more(url + '&bt=' + j.before.ts + '&bc=' + j.before.cursor);
        return Object.assign({}, first, { sales: all, truncated: !!j.truncated });
      }, function (e) { if (first) return Object.assign({}, first, { sales: all, truncated: true }); throw e; });
    }
    return more(url);
  }

  window.KiwiPosSale = {
    feedDay: feedDay, foldLines: foldLines,
    record: record, businessDayKey: businessDayKey, today: today, totals: totals, nextSeq: nextSeq,
    isReal: isReal, deviceTag: deviceTag, stamp: stamp, dropRefs: dropRefs,
    refMatcher: matcher, cleanLine: cleanLine,
    attachClient: attachClient, attachedClient: attachedClient,
    readyReward: readyReward, armReward: armReward, armedReward: armedReward,
    rewardRead: rewardRead, rewardTillOwns: rewardTillOwns, rewardOnSale: rewardOnSale,
    ingest: ingest, sync: sync, activate: activate, deactivate: deactivate,
    replayHeld: replayHeld, heldCount: heldCount,
  };
})();
