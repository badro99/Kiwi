/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ORDERPRO INBOX (assets/orderpro-inbox.js) — the CAISSE half of OrderPro.
 * ---------------------------------------------------------------------------
 * Orders placed on a customer's phone land here. The till polls its own merchant
 * slug over WiFi (GET /api/order/queue) and shows what came in; staff ACCEPT an
 * order and only then does it become a kitchen ticket. That decision is human by
 * design — nothing auto-accepts, and no timeout ever promotes an order, because
 * a ticket the kitchen never saw is worse than a customer who waited to be told.
 *
 * The relay is the network and nothing else: the phone and the till share no
 * browser, no storage and no Bluetooth. With no backend deployed the poll fails
 * soft, the chip simply never appears, and the caisse behaves exactly as today.
 *
 * Only ever runs on a PAIRED terminal (a real store bound to a real merchant),
 * so the pitch demo verticals never see it.
 *
 * Load order (kiwi-caisse.html): AFTER caisse-pairing.js.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var POLL_MS = 6000;
  var state = { orders: {}, sessions: [], closedSessions: [], expired: [], since: 0, open: false, timer: null, seen: {}, expiryWarned: {}, updating: {} };

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  /* Le client règle 17,50 MAD (la carte accepte les centimes) : la carte de
     commande de la caisse affichait « 18 », un arrondi à l'entier. La caissière
     annonçait donc un montant que le client ne devait pas. Centimes seulement
     s'il y en a. */
  function fmt(n) {
    var v = Math.round((Number(n) || 0) * 100) / 100;
    var o = Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    try { return (window.KiwiNumber?.format(v, o) ?? v.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', o)); } catch (_) { return String(v); }
  }
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  function paired() { try { return !!(window.KiwiCaissePairing && KiwiCaissePairing.isPaired && KiwiCaissePairing.isPaired()); } catch (_) { return false; } }
  /* Le commerce de CET appareil, tel que l'appairage l'a fixé · le même que
   * kitchen-relay.js, qui porte les requêtes. Jamais kiwiLiveMerchant d'abord :
   * c'est la clé que la console opérateur réécrit pour le commerce qu'elle
   * ouvre, et la caisse d'à côté se mettait à relever SA file (ticket #0142). */
  function merchant() {
    if (!paired()) return '';
    try {
      if (window.KiwiKitchenRelay && window.KiwiKitchenRelay.merchant) return window.KiwiKitchenRelay.merchant() || '';
    } catch (_) {}
    try {
      var pv = JSON.parse(ls('kiwiPairedVenue') || 'null');
      if (pv && pv.merchant) return String(pv.merchant);
    } catch (_) {}
    return ls('kiwiLiveMerchant') || '';
  }
  /* Ce que la boîte a relevé appartient au commerce qui l'a répondu. Si le
   * commerce change (ré-appairage, même dans un autre onglet), rien de l'ancien
   * ne doit rester · ni ses commandes, ni ses places, ni son curseur, sinon le
   * pont les repasse à la caisse au tour suivant comme s'ils étaient d'ici. */
  var stateMerchant = '';
  function ownState(m) {
    if (m === stateMerchant) return;
    stateMerchant = m;
    state.orders = {}; state.sessions = []; state.closedSessions = []; state.expired = [];
    state.since = 0; state.seen = {}; state.expiryWarned = {}; state.updating = {};
  }

  var ICON = {
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  };

  /* ── styles ───────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('kop-css')) return;
    var s = document.createElement('style');
    s.id = 'kop-css';
    s.textContent = [
      '#kop-chip{position:fixed;right:18px;bottom:82px;z-index:930;display:inline-flex;align-items:center;gap:9px;',
      'background:var(--atlas,#0B6E4F);color:#fff;border:0;border-radius:999px;padding:12px 18px 12px 15px;',
      'font:600 .9rem/1 "Inter Tight",Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 26px rgba(11,110,79,.34);',
      'transition:transform .15s,box-shadow .15s;}',
      '#kop-chip:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(11,110,79,.42);}',
      '#kop-chip svg{width:19px;height:19px;color:var(--mint,#7DF2B0);}',
      '#kop-chip .kop-badge{background:var(--mint,#7DF2B0);color:var(--riad,#053B2C);font-size:.72rem;font-weight:700;border-radius:999px;padding:1px 7px;min-width:18px;text-align:center;}',
      '#kop-chip.is-new{animation:kop-pulse 1.1s ease-in-out infinite;}',
      '.shell>.main{position:relative;}',
      '.shell>.main>#kop-chip{position:absolute;right:24px;bottom:22px;z-index:30;}',
      '@keyframes kop-pulse{0%,100%{box-shadow:0 8px 26px rgba(11,110,79,.34)}50%{box-shadow:0 8px 34px rgba(125,242,176,.75)}}',
      '@media (max-width:600px){#kop-chip{right:12px;bottom:74px;padding:11px 15px 11px 13px;}#kop-chip .kop-lbl{display:none;}}',
      /* panel */
      '#kop-root{position:fixed;inset:0;z-index:941;background:var(--paper,#F7F5F0);display:flex;flex-direction:column;',
      'font-family:"Inter Tight",Inter,system-ui,sans-serif;color:var(--ink,#0A0F0D);animation:kop-fade .2s ease;}',
      '@keyframes kop-fade{from{opacity:0}to{opacity:1}}',
      '#kop-root .kop-head{display:flex;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid rgba(10,15,13,.08);background:var(--surface);}',
      '#kop-root .kop-x{margin-left:auto;width:44px;height:44px;min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(10,15,13,.1);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--ink,#0A0F0D);touch-action:manipulation;-webkit-tap-highlight-color:transparent;}',
      '#kop-root .kop-x svg{width:22px;height:22px;}',
      '#kop-root .kop-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 22px 40px;}',
      '#kop-root .kop-sec{font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--atlas,#0B6E4F);margin:22px 0 10px;}',
      '#kop-root .kop-sec:first-child{margin-top:0;}',
      '#kop-root .kop-card{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:15px 17px;margin-bottom:11px;box-shadow:0 1px 2px rgba(10,15,13,.04);}',
      '#kop-root .kop-card.pending{border-color:rgba(11,110,79,.45);box-shadow:0 4px 16px rgba(11,110,79,.12);}',
      '#kop-root .kop-top{display:flex;align-items:center;gap:8px;margin-bottom:9px;flex-wrap:wrap;}',
      '#kop-root .kop-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:1.15rem;font-weight:600;}',
      '#kop-root .kop-where{font-size:.82rem;font-weight:600;color:var(--riad,#053B2C);background:var(--mint-soft,#E6FBEF);padding:4px 10px;border-radius:999px;}',
      '#kop-root button.kop-where-btn{border:0;cursor:pointer;touch-action:manipulation;transition:transform .1s,box-shadow .1s;}',
      '#kop-root button.kop-where-btn:hover{transform:translateY(-1px);box-shadow:0 2px 6px rgba(11,110,79,.2);}',
      '#kop-root .kop-server{font-size:.78rem;font-weight:600;color:var(--ink,#0A0F0D);opacity:.75;background:rgba(10,15,13,.06);padding:3px 8px;border-radius:6px;}',
      '#kop-root .kop-time{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:.78rem;font-weight:600;color:rgba(10,15,13,.65);background:rgba(10,15,13,.04);padding:3px 8px;border-radius:6px;}',
      '#kop-root .kop-time.is-late{color:#b0402f;background:rgba(176,64,47,.1);font-weight:700;}',
      '#kop-root .kop-total{margin-left:auto;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:1rem;font-weight:600;}',
      '#kop-root .kop-line{display:flex;gap:9px;font-size:.9rem;padding:3px 0;color:var(--ink,#0A0F0D);}',
      '#kop-root .kop-line .q{font-family:"JetBrains Mono",ui-monospace,monospace;color:var(--atlas,#0B6E4F);font-weight:600;min-width:24px;}',
      '#kop-root .kop-line .o{color:rgba(10,15,13,.55);font-size:.82rem;}',
      '#kop-root .kop-formula-parts{margin-left:26px;margin-top:2px;margin-bottom:6px;border-left:2px solid rgba(11,110,79,.18);padding-left:10px;}',
      '#kop-root .kop-formula-part{display:flex;gap:6px;font-size:.84rem;padding:2px 0;color:rgba(10,15,13,.78);}',
      '#kop-root .kop-part-bullet{color:var(--atlas,#0B6E4F);font-weight:700;}',
      '#kop-root .kop-slot{color:rgba(10,15,13,.5);font-size:.78rem;}',
      '#kop-root .kop-opt-badge{display:inline-block;background:rgba(11,110,79,.09);color:var(--atlas,#0B6E4F);font-size:.74rem;font-weight:600;padding:1px 6px;border-radius:4px;vertical-align:middle;margin-left:4px;}',
      '#kop-root .kop-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:13px;}',
      '#kop-root .kop-btn{flex:1;border:0;border-radius:11px;padding:12px;font:600 .92rem/1 inherit;cursor:pointer;}',
      '#kop-root .kop-btn.go{background:var(--atlas,#0B6E4F);color:#fff;}',
      '#kop-root .kop-btn.send{background:var(--mint-soft,#E6FBEF);color:var(--riad,#053B2C);border:1px solid rgba(11,110,79,.22);}',
      '#kop-root .kop-btn.ghost{background:var(--surface);border:1px solid rgba(10,15,13,.14);color:rgba(10,15,13,.65);}',
      '#kop-root .kop-btn.ghost:hover{color:var(--danger,#b0402f);border-color:var(--danger,#b0402f);}',
      '#kop-root .kop-btn.kop-print{flex:0 0 auto;min-width:86px;}',
      '#kop-root .kop-empty{text-align:center;color:rgba(10,15,13,.5);font-size:.92rem;padding:60px 20px;line-height:1.6;}',
      /* La provenance et l'adresse. Une commande de livraison sans elles renvoie
         le comptoir vers la tablette du prestataire — ce qui annule tout le
         bénéfice de l'imprimer ici. */
      '#kop-root .kop-src{font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;' +
        'color:var(--atlas,#0B6E4F);background:rgba(11,110,79,.09);padding:3px 8px;border-radius:6px;}',
      '#kop-root .kop-cust{margin-top:9px;padding-top:9px;border-top:1px dashed rgba(10,15,13,.14);' +
        'font-size:.85rem;line-height:1.5;color:rgba(10,15,13,.72);}',
      '#kop-root .kop-cust b{font-weight:600;color:var(--ink,#0A0F0D);}',
      '#kop-root .kop-cust .tel{font-family:"JetBrains Mono",ui-monospace,monospace;}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ── network ──────────────────────────────────────────────────────────── */
  /* Rend le nombre de commandes EN ATTENTE découvertes par cet appel, ou -1
   * quand la question n'a pas pu être posée (pas de magasin, module coupé,
   * hors ligne) — un « Rafraîchir » ne doit pas annoncer « 0 nouvelle » alors
   * qu'il n'a parlé à personne. */
  function pull() {
    var m = merchant();
    if (!m) return Promise.resolve(-1);
    ownState(m);
    /* Module coupé ⇒ aucun CLIENT ne peut commander (functions/api/menu.js et
     * /api/order refusent déjà). Ce fut longtemps la preuve que la file était
     * vide par construction — elle ne l'est plus : depuis que la caisse pose
     * ses propres bons de cuisine dans cette même file (voir
     * assets/kitchen-relay.js), c'est par elle que le comptoir apprend qu'un
     * plat est prêt sur la tablette de la cuisine. Ne pas sonder aurait rendu
     * le relais à sens unique : les bons partaient, les « prêt » ne revenaient
     * jamais.
     * On sonde donc aussi quand la page EST une caisse à écran cuisine
     * (window.KiwiCaisseKitchen). Une caisse boutique ou spa, elle, continue de
     * se taire : elle n'a ni cuisine ni commandes clients. */
    if (!orderProOn() && !hasKitchen()) { chip(); return Promise.resolve(-1); }
    if (!window.KiwiKitchenRelay || !window.KiwiKitchenRelay.pullAll) return Promise.resolve(-1);
    return window.KiwiKitchenRelay.pullAll(state.since)
      .then(function (j) {
        if (!j || !j.ok) return -1;
        /* Même règle qu'au passe (kiwi-cuisine.html) : `ordersAvailable:false`
           veut dire « la base n'a pas su répondre », pas « il n'y a rien ».
           La différence coûte cher ici · `state.sessions` et `state.expired`
           sont RECONSTRUITS à neuf à chaque tour, donc une lecture ratée
           éteignait d'un coup toutes les places téléphone du comptoir. On
           garde l'état précédent et on rend le même -1 qu'une réponse
           illisible. */
        if (j.ordersAvailable === false) return -1;
        if (merchant() !== m) return -1;   // le commerce a changé pendant la requête
        state.since = j.now || state.since;
        var fresh = 0, freshFloor = 0, freshWaiter = 0, waiterName = '';
        var delta = j.orders || [];
        var cancelled = Array.isArray(j.cancelledTickets) ? j.cancelledTickets : [];
        cancelled.forEach(function (ticket) {
          if (ticket && ticket.id) delete state.orders[ticket.id];
        });
        delta.forEach(function (o) {
          if (!state.seen[o.id] && o.status === 'pending') { fresh++; if (onFloor(o)) freshFloor++; if (o.staff || o.channel === 'serveur') { freshWaiter++; waiterName = o.server || waiterName; } state.seen[o.id] = 1; }
          if (o.status === 'archived') delete state.orders[o.id];
          else state.orders[o.id] = o;
        });
        state.sessions = j.sessions || [];
        state.closedSessions = j.closedSessions || [];
        state.expired = j.expired || [];
        /* One coherent lifecycle snapshot per poll. Passing the rejected rows
         * through a second ingest used to run the same terminal cleanup twice
         * in one tick; worse, older API payloads had no status and could be
         * reconstructed between both passes. Normalise at this trust boundary
         * too, so a mixed-version deployment still converges safely. */
        var terminal = cancelled.map(function (ticket) {
          return Object.assign({}, ticket, { status: 'rejected' });
        });
        bridge(delta.concat(terminal));
        if (fresh) announce(fresh, freshFloor === fresh, freshWaiter === fresh ? waiterName : null);
        warnExpiring();
        warnDegraded(j.degraded);
        verifyCloses();
        paint();
        if (!polling && !document.hidden && state.timer) {
          clearTimeout(state.timer);
          state.timer = setTimeout(pollInbox, POLL_MS);
        }
        return fresh;
      })
      .catch(function () { return -1; });   /* no backend / offline → keep the last picture */
  }

  /* ── Le pont vers la caisse ───────────────────────────────────────────────
   * Ce fichier savait afficher les commandes dans SON panneau, et c'est tout :
   * « Accepter · envoyer en cuisine » postait l'état au serveur sans que rien
   * n'apparaisse jamais sur l'écran cuisine ni sur le tableau À emporter. La
   * raison était mécanique — kdsOrders, kdsPaint, renderVrapBoard sont des
   * déclarations locales du script en ligne de kiwi-caisse.html, invisibles
   * depuis un fichier séparé — et la caisse expose maintenant la porte.
   * Absente (autre page, ancienne version), on ne fait rien : le panneau
   * continue de fonctionner seul, exactement comme avant. */
  function bridge(delta) {
    try {
      if (!window.KiwiCaisseKitchen) return;
      var all = Object.keys(state.orders).map(function (k) { return state.orders[k]; });
      window.KiwiCaisseKitchen.ingest(delta, all, state.sessions, state.closedSessions, state.expired);
    } catch (_) {}
  }

  function setStatus(id, status, extra) {
    var m = merchant();
    if (!m) return Promise.resolve(null);
    if (state.updating[id]) return Promise.resolve(null);
    /* Remettre la commande au client ne demande PLUS de code.
     *
     * Le geste arrive au coup de feu, une main tient le sachet, et il se répète
     * à chaque commande : quatre chiffres à ce moment-là, c'est la caisse qui
     * ralentit le comptoir sans rien protéger. Remettre ne déplace pas d'argent
     * — la commande est déjà payée quand elle arrive ici — et n'efface rien :
     * l'état avance de `ready` à `served`, la ligne descend dans l'historique,
     * et le journal garde l'événement `takeout-handover` (avec l'acteur connu
     * de la caisse s'il y en a un, vide sinon, exactement comme les sessions
     * antérieures au proof).
     *
     * « Annuler » garde son code. C'est la vraie asymétrie : l'annulation fait
     * disparaître une commande, produit des `kitchen_voids` et touche au
     * paiement. Elle reste nominative. */
    var needsTillActor = status === 'rejected'
      && !(extra && (extra.actorProof || extra.pinAuthorized));
    if (needsTillActor && !window.KiwiAuthorizeTillAction) return Promise.resolve(null);
    if (needsTillActor && window.KiwiAuthorizeTillAction) {
      return new Promise(function (resolve) {
        var action = 'Annuler la commande';
        /* Rejeter une commande en ligne est une écriture serveur sans file
         * d'attente : hors connexion le pavé ne prend aucun code (il dit que
         * rien n'a changé), et fermé sans approbation il rend la main au bouton. */
        var o = state.orders[id];
        if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'reject_online', key: 'act.reject_online', args: { order: o && o.number != null ? 'N°' + o.number : String(id) } });
        window.KiwiAuthorizeTillAction(action, function (who) {
          resolve(setStatus(id, status, Object.assign({}, extra, { actorProof: who && who.actorProof || '', pinAuthorized: true })));
        }, {
          needsServer: true,
          onCancel: function () { resolve({ ok: false, cancelled: true }); },
        });
      });
    }
    /* A request is not a kitchen ticket. Keep the pending card visible until
     * the server confirms it. Mutating `prev` here made rollback impossible:
     * it was the same object already stored in state.orders. */
    state.updating[id] = true;
    paint();
    var body = { merchant: m, id: id, status: status };
    // Le serveur affecté à la table, posé au moment de l'acceptation, et le
    // paiement d'un retrait au comptoir : deux informations que SEULE la caisse
    // détient à cet instant, et qui doivent voyager avec la transition.
    if (extra && extra.server) body.server = extra.server;
    if (extra && extra.actorProof) body.actorProof = extra.actorProof;
    if (extra && extra.paid) body.paid = true;
    if (extra && extra.station) body.station = extra.station;
    function warnUnconfirmed(httpStatus) {
      if (status === 'rejected') return; // the refusal button shows its own detailed error
      if (extra && extra.quiet) return;  // the 2027 till's card says it itself (till-online.js)
      try {
        var stack = document.getElementById('toast-stack');
        if (!stack) return;
        var el = document.createElement('div'); el.className = 'toast';
        el.textContent = httpStatus === 403
          ? 'Action refusée · vérifiez l’appairage de cette caisse'
          : 'Action non confirmée · la commande reste en attente · réessayez';
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 5500);
        setTimeout(function () { el.remove(); }, 5800);
      } catch (_) {}
    }
    return fetch('/api/order/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        j = j && typeof j === 'object' ? j : {};
        j.httpStatus = r.status;
        return j;
      });
    })
      .then(function (j) {
        if (j && j.ok) {
          var current = state.orders[id];
          if (current) {
            if (status === 'cooking') {
              (current.lines || []).forEach(function (line) {
                if (!(extra && extra.station) || line.station === extra.station) line.stationAccepted = true;
              });
            } else if (status === 'ready' && extra && extra.station) {
              (current.lines || []).forEach(function (line) {
                if (line.station === extra.station) line.stationReady = true;
              });
              if ((current.lines || []).length
                  && current.lines.every(function (line) { return line.stationReady === true; })) current.status = 'ready';
            } else current.status = status;
            if (j.status) current.status = j.status;
            if (Array.isArray(j.lines)) current.lines = j.lines;
            if (extra && extra.paid) current.paid = true;
            if (status === 'rejected' || status === 'archived') delete state.orders[id];
          }
          /* `pending` n'est pas encore un bon de cuisine. Le papier ne doit
           * sortir que sur l'appareil qui a réellement obtenu la transition
           * pending → accepted du serveur — pas sur chaque caisse qui sonde la
           * file, et surtout pas à l'arrivée de la commande OrderPro. */
          if (status === 'accepted') {
            try {
              if (window.KiwiCaisseKitchen && window.KiwiCaisseKitchen.confirmAccepted) {
                window.KiwiCaisseKitchen.confirmAccepted(current, extra || {});
              }
            } catch (_) {}
          }
          bridge(current ? [current] : []);
          return j;
        }
        /* Failure leaves the card untouched. A concurrent poll may already
         * have received a newer server state; never restore a stale object. */
        warnUnconfirmed(j && j.httpStatus);
        return j;
      })
      .catch(function () { warnUnconfirmed(0); return { error: 'network-error', httpStatus: 0 }; })
      .finally(function () { delete state.updating[id]; paint(); });
  }

  /* ── L'addition est réglée : on coupe le téléphone ───────────────────────
   * kiwi-caisse.html émet l'évènement depuis markPaid() — le point de passage
   * commun à la carte, aux espèces et à l'addition partagée — et l'appel réseau
   * vit ici. Une vente ne doit jamais attendre le réseau, ni échouer parce
   * qu'il est tombé : la session se refermera au pire à son expiration. */
  /* ── Une fermeture non confirmée n'est pas une fermeture ─────────────────
   * Ce POST partait en aveugle : toute réponse HTTP (403, 500, même `closed: 0`
   * dans un `ok:true`) passait par le même `.then`, et le réseau tombé par le
   * même `.catch` vide. La caisse, elle, avait déjà tout éteint en local — et
   * le sondage suivant rallumait la table, indéfiniment. La table ne fermait
   * jamais, en silence.
   *
   * On attend donc la PREUVE : la visite absente des sessions ouvertes au
   * sondage suivant. Sinon on rejoue (la fermeture est idempotente), cinq fois
   * au plus, puis on le DIT au lieu de laisser la table se rallumer toute
   * seule toute la soirée. */
  var CLOSE_CHANNEL = 'restaurant-visit-close';
  var closeSending = false;
  function normCloseTable(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/^table\s*/, '').replace(/^t(?=\d+$)/, '');
  }
  function closeSession(detail) {
    var m = merchant();
    if (!m || !detail) return;
    var body = { merchant: m, closedBy: detail.why || 'settle' };
    if (detail.actorProof) body.actorProof = detail.actorProof;
    var key = '';
    if (detail.session) { body.closeSession = detail.session; key = 's:' + detail.session; }
    else if (detail.table && detail.expectedSession) {
      body.closeTable = String(detail.table);
      body.expectedSession = String(detail.expectedSession);
      if (detail.expectedRevision != null) body.expectedRevision = Number(detail.expectedRevision);
      key = 's:' + body.expectedSession;
    }
    else return;
    var offline = window.KiwiOffline;
    /* La file locale refuse la fermeture (stockage de la tablette en panne) :
     * on l'envoie quand même, tout de suite. Avant, elle n'était jamais
     * envoyée, et la table restait ouverte côté serveur. */
    function sendNow(err) {
      reportCloseStore(err);
      return fetch('/api/order/queue', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return typeof response.json === 'function' ? response.json().catch(function () { return null; }) : null;
      }).then(function (answer) { warnOwed(body, answer); }).catch(closeStorageWarning);
    }
    if (!offline) return sendNow(new Error('KiwiOffline unavailable'));
    offline.enqueue(CLOSE_CHANNEL, m, body, { id: 'close:' + m + ':' + key })
      .then(function () { return flushCloses(); }, sendNow);
  }
  /* Le serveur ne solde que ce que les tickets de la visite ont payé : une
   * commande arrivée pendant l'encaissement reste due (owedCents). La table
   * est libérée ici, donc on le dit tout de suite, avec la table et le
   * montant, une seule fois par visite même si la fermeture est rejouée. */
  var owedWarned = {};
  function warnOwed(payload, answer) {
    try {
      var cents = Math.round(Number(answer && answer.owedCents) || 0);
      var session = payload && payload.closeSession ? String(payload.closeSession) : '';
      if (cents <= 0 || !session || owedWarned[session]) return;
      owedWarned[session] = 1;
      var table = '';
      var known = state.orders || {};
      Object.keys(known).some(function (id) {
        var o = known[id];
        if (o && String(o.session || '') === session && o.table) { table = String(o.table); return true; }
        return false;
      });
      var amount = (cents % 100 ? (cents / 100).toFixed(2).replace('.', ',') : String(cents / 100)) + ' MAD';
      var stack = document.getElementById('toast-stack');
      if (!stack) return;
      var el = document.createElement('div'); el.className = 'toast';
      el.textContent = (table ? 'Table ' + normCloseTable(table) + ' · ' : '') + amount +
        ' restent dus : une commande est arrivée après l’addition';
      stack.appendChild(el);
      setTimeout(function () { el.classList.add('fade'); }, 12000);
      setTimeout(function () { el.remove(); }, 12300);
    } catch (_) {}
  }
  /* Le stockage local a refusé : on garde la vraie erreur (console d'erreurs,
   * une fois toutes les 10 min), sans alerter le comptoir pour un problème
   * qu'il ne peut pas régler et qui n'a rien empêché. */
  var closeStoreReportedAt = 0;
  function reportCloseStore(err) {
    if (Date.now() - closeStoreReportedAt < 600000) return;
    closeStoreReportedAt = Date.now();
    try { if (window.KiwiReportError) window.KiwiReportError(err || new Error('outbox failed'), 'outbox:' + CLOSE_CHANNEL); } catch (_) {}
  }
  /* L'alerte n'existe plus que pour le cas qui compte : la fermeture n'a pu
   * être ni gardée ni envoyée. Une seule à l'écran, en avertissement (plus la
   * coche verte d'un succès), et elle s'efface. */
  function closeStorageWarning(err) {
    try { window.dispatchEvent(new CustomEvent('kiwi:outbox', { detail: { type: 'storage-error', channel: CLOSE_CHANNEL } })); } catch (_) {}
    reportCloseStore(err);
    try {
      var stack = document.getElementById('toast-stack');
      if (stack && !document.getElementById('kop-close-warn')) {
        var el = document.createElement('div'); el.className = 'toast is-warn'; el.id = 'kop-close-warn';
        el.setAttribute('role', 'alert');
        el.textContent = 'Fermeture de table non envoyée · vérifiez la connexion de cette caisse';
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 12000);
        setTimeout(function () { el.remove(); }, 12300);
      }
    } catch (_) {}
  }
  function closeIsOpen(body) {
    var openIds = {}, seated = {};
    (state.sessions || []).forEach(function (s) {
      if (!s) return;
      if (s.id) openIds[String(s.id)] = 1;
      if (s.table) seated[normCloseTable(s.table)] = 1;
    });
    return body.closeSession ? !!openIds[String(body.closeSession)]
      : !!seated[normCloseTable(body.closeTable)];
  }
  function verifyCloses() {
    var m = merchant(), offline = window.KiwiOffline;
    if (!m || !offline) return;
    offline.list(CLOSE_CHANNEL, m).then(function (rows) {
      return Promise.all(rows.map(function (row) {
        return closeIsOpen(row.payload) ? null : offline.acknowledge(row.id);
      }));
    }).then(function () { flushCloses(); }).catch(reportCloseStore);
  }
  function flushCloses() {
    var m = merchant(), offline = window.KiwiOffline;
    if (!m || !offline || closeSending || navigator.onLine === false) return Promise.resolve();
    closeSending = true;
    return offline.claim(CLOSE_CHANNEL, m).then(function (row) {
      if (!row) return;
      return fetch('/api/order/queue', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row.payload),
      }).then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return typeof response.json === 'function' ? response.json().catch(function () { return null; }) : null;
      }).then(function (answer) {
        warnOwed(row.payload, answer);
        state.since = 0;
        return pull().then(function (fresh) {
          if (fresh < 0 || closeIsOpen(row.payload)) throw new Error('close-unconfirmed');
          return offline.acknowledge(row.id, row.leaseToken);
        });
      }).catch(function (error) {
        return offline.reject(row.id, row.leaseToken, { error: String(error.message || error) });
      });
    }).catch(reportCloseStore).finally(function () { closeSending = false; });
  }

  /* ── attention: a new order must not be missable on a busy counter ────── */
  /* `waiter` : le nom du serveur quand TOUTES les nouvelles commandes viennent
   * d'un téléphone de serveur (features.serveurValidation) ; null sinon. */
  function announce(n, floorOnly, waiter) {
    var kit = kitOnline();
    var chip = document.getElementById('kop-chip');
    if (chip) { chip.classList.add('is-new'); setTimeout(function () { chip.classList.remove('is-new'); }, 6000); }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        var ctx = new Ctx();
        [880, 1174].forEach(function (f, i) {
          var osc = ctx.createOscillator(), g = ctx.createGain();
          osc.type = 'sine'; osc.frequency.value = f;
          var t0 = ctx.currentTime + i * 0.16;
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.13, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
          osc.connect(g); g.connect(ctx.destination);
          osc.start(t0); osc.stop(t0 + 0.32);
        });
        setTimeout(function () { try { ctx.close(); } catch (_) {} }, 900);
      }
    } catch (_) {}
    /* The 2027 till draws the arrival itself: its toast, the Takeaway badge's
     * pop and ring (till-online.js). The tones above stay the same. */
    if (kit) { try { window.KiwiTillOnline.arrived(n, floorOnly, waiter); } catch (_) {} return; }
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) {
        var el = document.createElement('div'); el.className = 'toast';
        el.innerHTML = '<div style="font-weight:600">' + n + ' nouvelle' + (n > 1 ? 's' : '') + ' commande' + (n > 1 ? 's' : '') + '</div>' +
                       '<div style="opacity:.7;font-size:.85em;margin-top:2px">' + (waiter == null ? 'Depuis le téléphone d\'un client'
                         : (waiter ? 'De ' + String(waiter).replace(/[<>&"]/g, '') : 'D\'un serveur') + ' · à valider à la caisse') + '</div>';
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 2600);
        setTimeout(function () { el.remove(); }, 2900);
      }
    } catch (_) {}
  }

  /* ── Une attente qui vieillit doit crier plus fort, pas s'éteindre ────────
   * `announce()` ne sonne qu'à l'arrivée. En coup de feu, personne ne lève
   * les yeux à temps, et à trente minutes le TTL tranche en silence : la
   * commande disparaît sans que le comptoir ait jamais su qu'elle mourait.
   * Passé vingt minutes sans décision, on prévient UNE fois par commande
   * (le rechargement ré-avertit — c'est voulu : une attente qui survit au
   * rechargement est exactement celle qu'il faut revoir). */
  var EXPIRY_WARN_MS = 20 * 60 * 1000;
  function warnExpiring() {
    try {
      var nowTs = Date.now();
      Object.keys(state.orders).forEach(function (id) {
        var o = state.orders[id];
        if (!o || o.status !== 'pending' || state.expiryWarned[id]) return;
        var age = nowTs - Number(o.created_ts || nowTs);
        if (!(age > EXPIRY_WARN_MS)) return;
        state.expiryWarned[id] = 1;
        var left = Math.max(1, Math.round((30 * 60 * 1000 - age) / 60000));
        var waiter = !!o.staff || o.channel === 'serveur';   // n'expire pas : on rappelle qu'elle attend (le relais la rend `kiwi` + staff)
        if (kitOnline()) { try { window.KiwiTillOnline.expiring(o, left, waiter); } catch (_) {} return; }
        var label = (o.number != null ? 'N°' + o.number : 'commande') +
          (o.mode === 'table' && o.table ? ' · Table ' + o.table : ' · À emporter');
        try {
          var stack = document.getElementById('toast-stack');
          if (stack) {
            var el = document.createElement('div'); el.className = 'toast';
            el.textContent = waiter ? label + ' · commande de ' + (o.server || 'serveur') + ' attend la validation depuis 20 min'
              : label + ' en attente depuis 20 min · expire dans ~' + left + ' min';
            stack.appendChild(el);
            setTimeout(function () { el.classList.add('fade'); }, 5000);
            setTimeout(function () { el.remove(); }, 5300);
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  /* ── Une base non migrée ment sur les paiements : le dire ─────────────────
   * Quand il manque `paid_ts`, le sondage répond `paid:false` pour TOUTES les
   * commandes et l'écriture du timbre tombe dans le repli « état seul » : le
   * comptoir affiche « impayé » sur des commandes réglées, et rien ne le
   * signale — le faux impayé parfait. Le serveur le DIT déjà à chaque sondage
   * (`degraded`), personne ne l'écoutait. Une fois par chargement, on l'affiche
   * avec le remède exact, au lieu de laisser douter de chaque encaissement. */
  function warnDegraded(degraded) {
    try {
      if (!Array.isArray(degraded) || !degraded.length || state.degradedWarned) return;
      state.degradedWarned = 1;
      var stack = document.getElementById('toast-stack');
      if (stack) {
        var el = document.createElement('div'); el.className = 'toast';
        el.textContent = 'Base à migrer (' + degraded.join(', ') +
          ') · statuts de paiement non fiables · lancer node tools/d1-schema.mjs';
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 8000);
        setTimeout(function () { el.remove(); }, 8300);
      }
    } catch (_) {}
  }

  /* Une commande en ligne sur une table vit sur le plan de salle : pastille
   * « à accepter » sur la table, lignes OrderPro dans son addition, accord et
   * encaissement à la table (caisse-app.js ingest). La liste « Commandes en
   * ligne » de l'onglet À emporter (caisse 2027) ne la montre donc pas
   * (propriétaire, 23 nov. 2026 : « OP-8 · Table 4 » sous À emporter). Seule
   * une table absente du plan y reste, pour que la commande ne se perde pas. */
  function onFloor(o) {
    if (!o || o.mode !== 'table' || o.table == null || o.table === '') return false;
    try { var K = window.KiwiCaisseKitchen; return !!(K && typeof K.onFloor === 'function' && K.onFloor(o.table)); } catch (_) { return false; }
  }
  function away(o) { return !onFloor(o); }

  /* ── render ───────────────────────────────────────────────────────────── */
  function list(status) {
    var closedSet = {};
    (state.closedSessions || []).forEach(function (s) {
      var id = s && typeof s === 'object' ? s.id : s;
      if (id) closedSet[String(id)] = 1;
    });
    return Object.keys(state.orders)
      .map(function (k) { return state.orders[k]; })
      .filter(function (o) {
        if (!o || o.status !== status) return false;
        // Jamais de commandes internes de la caisse dans la boîte "Commandes clients"
        if (o.channel === 'caisse') return false;
        // Une commande sur table déjà réglée ou dont la session est close est achevée
        if (o.mode === 'table') {
          if (o.paid && (status === 'accepted' || status === 'pending')) return false;
          // Prise par un serveur : elle vit sur le plan de salle, pas ici (Browse, 21 nov.)
          if (o.staff) return false;
          if (o.session && closedSet[String(o.session)]) return false;
        }
        return true;
      })
      .sort(function (a, b) { return (a.created_ts || 0) - (b.created_ts || 0); });
  }

  /* D'où vient cette commande. 'kiwi' est le téléphone d'un client : c'est le
   * cas normal, il ne mérite pas de pastille. Les autres viennent d'un canal
   * extérieur, et la brigade doit pouvoir le lire d'un coup d'œil. */
  var SRC = { shopify: 'Shopify', glovo: 'Glovo', yassir: 'Yassir', generic: 'Canal extérieur' };

  function custHtml(o) {
    var c = o.customer;
    if (!c) return '';
    var bits = [];
    if (c.name) bits.push('<b>' + esc(c.name) + '</b>');
    if (c.phone) bits.push('<span class="tel">' + esc(c.phone) + '</span>');
    var head = bits.join(' · ');
    var addr = c.address ? '<div>' + esc(c.address) + '</div>' : '';
    var note = c.note ? '<div>' + esc(c.note) + '</div>' : '';
    if (!head && !addr && !note) return '';
    return '<div class="kop-cust">' + (head ? '<div>' + head + '</div>' : '') + addr + note + '</div>';
  }

  function serverInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    return ((parts[0][0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase();
  }

  function orderRef(o) {
    var n = String((o && o.number) || 0);
    if (o && o.channel === 'kiwi') {
      var employeePrefix = serverInitials(o.server);
      if (employeePrefix) return employeePrefix + '-' + n;
      return (o.mode === 'takeout' ? 'OPD-' : 'OP-') + n;
    }
    return n;
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var min = Math.max(0, Math.floor((Date.now() - Number(ts)) / 60000));
    if (min < 1) return 'à l\'instant';
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var rem = min % 60;
    return h + 'h' + (rem ? (rem < 10 ? '0' : '') + rem : '');
  }

  function clockTime(ts) {
    if (!ts) return '';
    try {
      var d = new Date(Number(ts));
      var hh = d.getHours();
      var mm = d.getMinutes();
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    } catch (_) { return ''; }
  }

  function cleanLineNote(note) {
    if (!note) return '';
    return String(note).replace(/^\[.*?\]\s*(·\s*)?/, '').trim();
  }

  function linesHtml(o) {
    var raw = o.lines || [];
    if (!raw.length) return '';

    var formulas = {};
    var formulaParts = {};
    raw.forEach(function (l) {
      if (l.kind === 'formula' && l.formulaUid) formulas[l.formulaUid] = l;
      if (l.kind === 'formula-part' && l.formulaUid) {
        if (!formulaParts[l.formulaUid]) formulaParts[l.formulaUid] = [];
        formulaParts[l.formulaUid].push(l);
      }
    });

    var html = [];
    raw.forEach(function (l) {
      if (l.kind === 'formula-part' && l.formulaUid && formulas[l.formulaUid]) return;

      var note = cleanLineNote(l.note);
      var opts = l.options ? ' <span class="kop-opt-badge">' + esc(l.options) + '</span>' : '';
      var noteSpan = note ? ' <span class="o">· ' + esc(note) + '</span>' : '';

      if (l.kind === 'formula' && l.formulaUid && formulaParts[l.formulaUid]) {
        var parts = formulaParts[l.formulaUid];
        var partsHtml = parts.map(function (p) {
          var pNote = cleanLineNote(p.note);
          var pOpts = p.options ? ' <span class="kop-opt-badge">' + esc(p.options) + '</span>' : '';
          var pNoteSpan = pNote ? ' <span class="o">· ' + esc(pNote) + '</span>' : '';
          var slot = p.slotLabel ? '<span class="kop-slot">' + esc(p.slotLabel) + ' : </span>' : '';
          return '<div class="kop-formula-part"><span class="kop-part-bullet">↳</span><span>' +
            slot + esc(p.name || '') + pOpts + pNoteSpan + '</span></div>';
        }).join('');

        html.push(
          '<div class="kop-line kop-line-parent">' +
            '<span class="q">' + (l.qty || 1) + '×</span>' +
            '<span class="kop-item-name">' + esc(l.name || '') + opts + noteSpan + '</span>' +
          '</div>' +
          '<div class="kop-formula-parts">' + partsHtml + '</div>'
        );
      } else {
        html.push(
          '<div class="kop-line">' +
            '<span class="q">' + (l.qty || 1) + '×</span>' +
            '<span>' + esc(l.name || '') + opts + noteSpan + '</span>' +
          '</div>'
        );
      }
    });

    return html.join('');
  }

  function cardHtml(o) {
    var where = o.mode === 'table'
      ? '<button type="button" class="kop-where kop-where-btn" data-kop-table="' + esc(o.id) + '" title="Voir la table sur le plan">Table ' + esc(o.table || '?') + '</button>'
      : '<span class="kop-where">' + (o.mode === 'delivery' ? 'Livraison' : 'À emporter') + '</span>';
    var src = o.channel && o.channel !== 'kiwi'
      ? '<span class="kop-src">' + esc(SRC[o.channel] || o.channel) + '</span>' : '';
    var serverHtml = o.server ? '<span class="kop-server" title="Serveur">Serveur : ' + esc(o.server) + '</span>' : '';

    var elapsedMin = o.created_ts ? Math.floor((Date.now() - Number(o.created_ts)) / 60000) : 0;
    var isLate = o.status !== 'ready' && o.status !== 'served' && elapsedMin >= 15;
    var timeHtml = o.created_ts
      ? '<span class="kop-time' + (isLate ? ' is-late' : '') + '">' +
          clockTime(o.created_ts) + ' · ' + timeAgo(o.created_ts) + '</span>'
      : '';

    var lines = linesHtml(o);
    var pay = !o.paid
      ? '<button class="kop-btn go" data-kop-pay="' + esc(o.id) + '">Encaisser</button>'
      : '';
    var cancel = !o.paid
      ? '<button class="kop-btn ghost" data-kop-rej="' + esc(o.id) + '">' +
          (o.status === 'pending' ? 'Refuser' : 'Annuler') + '</button>'
      : '';

    var acts = state.updating[o.id]
      ? '<div class="kop-acts"><button class="kop-btn" disabled>Enregistrement…</button></div>'
      : o.status === 'pending'
      ? '<div class="kop-acts">' +
          cancel +
          '<button class="kop-btn send" data-kop-acc="' + esc(o.id) + '">Envoyer en cuisine</button>' + pay +
        '</div>'
      : (o.status === 'accepted'
          ? '<div class="kop-acts">' + cancel + '<button class="kop-btn send" data-kop-ready="' + esc(o.id) + '">Marquer prêt</button>' + pay + '</div>'
          : (o.status === 'ready'
              ? '<div class="kop-acts">' + cancel + '<button class="kop-btn send" data-kop-served="' + esc(o.id) + '">' +
                (o.mode === 'table' ? 'Servie' : 'Remise au client') + '</button>' + pay + '</div>'
              : ''));
    return '<div class="kop-card ' + esc(o.status) + '">' +
      '<div class="kop-top"><span class="kop-num">' + orderRef(o) + '</span>' +
      where + serverHtml + src + timeHtml +
      '<span class="kop-total">' + fmt(o.total) + ' MAD</span></div>' +
      lines + custHtml(o) + glovoHtml(o) + acts + '</div>';
  }

  function paint() {
    chip();
    if (!state.open) return;
    var body = document.getElementById('kop-body');
    if (!body) return;
    var pending = list('pending'), cooking = list('accepted'), ready = list('ready');
    if (!pending.length && !cooking.length && !ready.length) {
      body.innerHTML = glovoBar() + '<div class="kop-empty">Aucune commande pour le moment.<br>Les commandes passées depuis le téléphone d\'un client arrivent ici.</div>';
      return;
    }
    body.innerHTML = glovoBar() +
      (pending.length ? '<div class="kop-sec">À accepter</div>' + pending.map(cardHtml).join('') : '') +
      (cooking.length ? '<div class="kop-sec">En cuisine</div>' + cooking.map(cardHtml).join('') : '') +
      (ready.length ? '<div class="kop-sec">Prêtes</div>' + ready.map(cardHtml).join('') : '');
  }

  /* Order Pro est une option payante : la pastille « Commandes » ne doit exister
   * que chez un commerçant à qui l'opérateur l'a ouverte. Sinon la caisse porte
   * en permanence un bouton qui n'ouvre qu'un écran vide promettant « les
   * commandes passées depuis le téléphone d'un client arrivent ici » — une
   * fonction qu'il n'a pas, présentée comme une fonction qu'il attend.
   *
   * Même règle que orderpro-panel.js côté tableau de bord : la clé doit valoir
   * `true` explicitement. Config pas encore arrivée ⇒ pas de pastille, et le
   * prochain passage (poll, ou l'événement kiwi-config) la fait apparaître. Sans
   * backend il n'y a de toute façon aucune file à relever. */
  function orderProOn() {
    try { return !!(window.KiwiConfig && window.KiwiConfig.features
      && window.KiwiConfig.features.orderpro === true); } catch (_) { return false; }
  }

  /* Cette page a-t-elle un écran cuisine ? C'est la caisse restaurant/café qui
   * expose ce pont (kiwi-caisse.html). Il sert ici à décider s'il vaut la peine
   * de relever la file : une caisse qui envoie des bons en cuisine doit
   * apprendre quand ils sont prêts, même sans Order Pro. */
  function hasKitchen() { return !!window.KiwiCaisseKitchen; }

  /* Under the 2027 till the online orders live in the Takeaway tab
   * (assets/kit/till-online.js): no chip, and the section is drawn there. */
  function kitOnline() {
    try { return !!(window.KiwiTillOnline && window.KiwiTillOnline.active()); } catch (_) { return false; }
  }

  function chip() {
    if (kitOnline()) {
      var old = document.getElementById('kop-chip'); if (old) old.remove();
      try { window.KiwiTillOnline.paint(); } catch (_) {}
      return;
    }
    if (!merchant() || !orderProOn()) { var ex = document.getElementById('kop-chip'); if (ex) ex.remove(); return; }
    css();
    var b = document.getElementById('kop-chip');
    if (!b) {
      b = document.createElement('button'); b.id = 'kop-chip'; b.type = 'button';
      b.addEventListener('click', open);
    }
    // Keep the order-entry panel clear: this belongs to the ordering workspace,
    // not above the bill controls on the right.
    var main = document.querySelector('.shell > .main');
    (main || document.body).appendChild(b);
    var n = list('pending').length;
    b.innerHTML = ICON.bell + '<span class="kop-lbl">Commandes</span>' + (n ? '<span class="kop-badge">' + n + '</span>' : '');
  }

  function open() {
    css();
    state.open = true;
    var root = document.getElementById('kop-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'kop-root';
      root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Commandes OrderPro');
      document.body.appendChild(root);
      root.addEventListener('click', function (e) {
        if (e.target === root) { close(); return; }
        var t = e.target.closest('[data-kop-acc],[data-kop-pay],[data-kop-rej],[data-kop-ready],[data-kop-served],[data-kop-print],[data-kop-table],#kop-close');
        if (!t) return;
        if (t.id === 'kop-close') { close(); return; }
        if (t.dataset.kopTable) {
          try {
            if (window.KiwiCaisseKitchen && window.KiwiCaisseKitchen.checkoutOrder
                && window.KiwiCaisseKitchen.checkoutOrder(t.dataset.kopTable)) close();
          } catch (_) {}
        } else if (t.dataset.kopPrint) {
          try {
            if (window.KiwiCaisseKitchen && window.KiwiCaisseKitchen.printOrder) {
              window.KiwiCaisseKitchen.printOrder(t.dataset.kopPrint);
            }
          } catch (_) {}
        } else if (t.dataset.kopPay) {
          try {
            if (window.KiwiCaisseKitchen && window.KiwiCaisseKitchen.checkoutOrder
                && window.KiwiCaisseKitchen.checkoutOrder(t.dataset.kopPay)) close();
          } catch (_) {}
        } else if (t.dataset.kopAcc) {
          /* Accepter une commande en salle, c'est aussi décider AU NOM DE QUI
           * elle part : le bon de cuisine porte le serveur affecté à la table,
           * et seule la caisse connaît cette affectation à cet instant. */
          var o = state.orders[t.dataset.kopAcc];
          var srv = '';
          try {
            if (window.KiwiCaisseKitchen && o && o.mode === 'table') {
              srv = window.KiwiCaisseKitchen.serverFor(o.table) || '';
            }
          } catch (_) {}
          setStatus(t.dataset.kopAcc, 'accepted', { server: srv });
        } else if (t.dataset.kopRej) {
          var rejectButton = t;
          if (rejectButton.disabled) return;
          rejectButton.disabled = true;
          rejectButton.textContent = 'Annulation…';
          setStatus(t.dataset.kopRej, 'rejected').then(function (result) {
            if (result && result.ok) {
              /* Pull from zero immediately: pending badges, the table bill and
               * the phone-facing terminal state must agree before the cashier
               * can press “Annuler mesa”. The operation is idempotent. */
              state.since = 0;
              return pull();
            }
            if (result && result.cancelled) { paint(); return null; }
            var message = result && result.httpStatus === 403
              ? 'Annulation refusée · vérifiez l’appairage de cette caisse'
              : 'Annulation non enregistrée · réessayez';
            try {
              var stack = document.getElementById('toast-stack');
              if (stack) {
                var notice = document.createElement('div'); notice.className = 'toast'; notice.textContent = message;
                stack.appendChild(notice);
                setTimeout(function () { notice.classList.add('fade'); }, 5500);
                setTimeout(function () { notice.remove(); }, 5800);
              }
            } catch (_) {}
            paint();
            return null;
          });
        }
        else if (t.dataset.kopReady) setStatus(t.dataset.kopReady, 'ready');
        else if (t.dataset.kopServed) setStatus(t.dataset.kopServed, 'served');
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && state.open) close();
      });
    }
    root.style.display = 'flex';
    root.innerHTML =
      '<div class="kop-head"><h2>Commandes clients</h2>' +
        '<button class="kop-x" id="kop-close" aria-label="Fermer">' + ICON.close + '</button></div>' +
      '<div class="kop-body" id="kop-body"></div>';
    paint();
    pull();
  }

  function close() {
    state.open = false;
    var root = document.getElementById('kop-root');
    if (root) root.style.display = 'none';
  }

  /* Request pacing: pending kitchen work keeps its fast fallback. */
  var pollDelay = POLL_MS, pollSignature = null, polling = false, pollAgain = false;
  /* LA CAISSE QUI IMPRIME LA CUISINE NE S'ENDORT PAS (Pasta Corner, 17 nov.).
   * Le ralentissement des appareils inactifs (bb2babdde, 25 oct.) espaçait la
   * relève jusqu'à 2 min sur un comptoir calme, 5 min derrière l'écran de
   * verrouillage : la première commande du téléphone serveur après un creux
   * attendait autant avant de sortir en cuisine, et le badge passait à
   * « Inactif ». Le poste choisi comme hub d'impression (le choix de
   * l'opérateur, assets/kitchen-print-queue.js · HUB_KEY) garde donc la relève
   * de 6 s. Un commerce que le serveur dit calme reste plafonné par
   * KiwiPoll.delay (10 min) : seuls les clients actifs paient ces lectures. */
  function printHub() {
    try {
      var c = JSON.parse(localStorage.getItem('kiwiKitchenPrintHubV1') || 'null');
      var m = merchant();
      return !!(c && c.enabled === true && m && c.merchant === m);
    } catch (_) { return false; }
  }
  function pollInbox() {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    if (document.hidden) return;
    if (polling) { pollAgain = true; return; }
    polling = true;
    Promise.resolve(pull()).then(function () {
      var next = JSON.stringify([merchant(), state.orders, state.sessions, state.closedSessions, state.expired]);
      var pending = Object.keys(state.orders).some(function (id) {
        return /^(pending|accepted|cooking|preparing|ready)$/.test(state.orders[id].status);
      });
      var hub = printHub();
      pollDelay = pending || hub || next !== pollSignature ? POLL_MS : Math.min(120000, pollDelay * 2);
      var gate = document.getElementById('pin-screen');
      var closed = document.getElementById('clockin-screen');
      var locked = function (el) { return el && el.style.display !== 'none'; };
      if (!pending && !hub && (locked(gate) || locked(closed))) pollDelay = 300000;
      pollSignature = next;
    }).catch(function () { pollDelay = Math.min(printHub() ? 30000 : 120000, pollDelay * 2); }).then(function () {
      polling = false;
      if (!document.hidden) state.timer = setTimeout(pollInbox, window.KiwiPoll?.delay(pollAgain ? 0 : pollDelay) ?? (pollAgain ? 0 : pollDelay));
      pollAgain = false;
    });
  }
  function wakeInbox() { pollDelay = POLL_MS; pollInbox(); }
  function start() {
    chip();
    wakeInbox();
  }
  document.addEventListener('visibilitychange', wakeInbox);
  /* Onglet caché (YouTube sur la tablette…) : la relève s'arrête, donc le
   * comptoir laisse une marque « absente » qui garde Order Pro ouvert pendant
   * les horaires publiés (functions/api/order/_guest-sessions.js › deskAway). */
  /* Toujours cachée : la marque (valable 2 h) est renouvelée toutes les 2 h,
   * un peu avant l'échéance. Une tablette éteinte ne renouvelle plus rien. */
  var awayTimer = null;
  function markAway() {
    var m = document.hidden && orderProOn() && merchant();
    if (m) fetch('/api/order/queue', { method: 'POST', keepalive: true, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: m, away: true }) }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    clearInterval(awayTimer); awayTimer = null;
    if (document.hidden) { markAway(); awayTimer = setInterval(markAway, 115 * 60 * 1000); }
  });
  document.addEventListener('kiwi:request-wake', wakeInbox);
  window.addEventListener('focus', wakeInbox);
  window.addEventListener('online', wakeInbox);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  // Pairing can happen after load (the pad is redeemed live) — pick it up.
  window.addEventListener('storage', function (e) {
    /* Changement d'établissement : le curseur d'AVANT ne veut plus rien dire,
       et le garder ferait manquer tout l'historique du nouveau commerce. On
       repart de zéro — même resynchronisation volontaire que ci-dessus. */
    if (e.key === 'kiwiPaired' || e.key === 'kiwiLiveMerchant') { state.since = 0; chip(); wakeInbox(); }
  });
  // La config arrive après le premier passage : c'est elle qui décide si cette
  // caisse a Order Pro, donc on repeint dès qu'elle est là (allumage immédiat,
  // sans attendre le prochain tour de poll).
  document.addEventListener('kiwi-config', function () { chip(); wakeInbox(); });

  /* L'addition réglée coupe le téléphone. L'évènement vient de markPaid() dans
   * kiwi-caisse.html — le seul point de passage commun à la carte, aux espèces
   * et à l'addition partagée. */
  document.addEventListener('kiwi-table-released', function (e) {
    var d = e && e.detail;
    if (d) {
      Object.keys(state.orders).forEach(function (id) {
        var o = state.orders[id];
        if (!o || o.mode !== 'table') return;
        if (d.session ? String(o.session) === String(d.session) :
            (d.table && normCloseTable(o.table) === normCloseTable(d.table))) {
          // A reset closes the visit, not a payment. Keep the recorded paid flag.
          if (d.why === 'settle') o.paid = true;
          if (o.session && state.closedSessions.indexOf(String(o.session)) < 0) {
            state.closedSessions.push(String(o.session));
          }
        }
      });
      paint();
    }
    closeSession(e.detail);
  });

  /* ── Glovo à la caisse (22 nov. 2026) ──────────────────────────────────────
   * Ce que Glovo sait d'une commande et que la caisse doit voir ou dire : le
   * coursier l'a récupérée (webhook picked_up), l'heure où il est attendu, « prête
   * dans 5/10/15 min » (adjust_preparation_time, coursiers Glovo seulement), et,
   * pour une adresse Marketplace (vos livreurs), « Livrée » une fois partie. Plus
   * la fermeture temporaire de l'adresse, qui demande le code d'un responsable :
   * le serveur le vérifie (functions/api/channel/glovo/till.js), la caisse ne
   * compare rien et ne garde pas le code.
   * Une seule source : GET /api/channel/glovo/till. La carte classique (cardHtml)
   * et la carte 2027 (assets/kit/till-online.js) appellent glovoHtml / glovoBar.
   * Un magasin sans adresse Glovo ne demande qu'une fois toutes les 10 minutes. */
  var GLV = { merchant: '', stores: [], orders: {}, sig: '', timer: null, busy: {}, note: {} };
  var GLV_T = {
    fr: { open: 'Glovo ouvert', closed: 'Glovo fermé jusqu’à {t}', close: 'Fermer', reopen: 'Rouvrir Glovo',
      picked: 'Récupérée par le coursier · {t}', expected: 'Coursier attendu · {t}', due: 'Promise pour {t}', courier: 'Coursier {n}', bundle: 'Groupée avec {n} autre(s)', ready: 'Prête dans',
      road: 'En livraison · vos livreurs', left: 'partie à {t}', delivered: 'Livrée',
      code: 'Code d’un responsable', why: 'Fermer ou rouvrir Glovo demande le code d’un responsable.',
      ok: 'Valider', cancel: 'Annuler', sent: 'Envoyé à Glovo', badCode: 'Code incorrect.',
      notManager: 'Ce code n’est pas celui d’un responsable.', slow: 'Trop d’essais. Réessayez dans un instant.',
      glovo: 'Glovo n’a pas confirmé. Réessayez.', off: 'Glovo n’est pas encore activé pour Kiwi.', taken: 'Le coursier l’a déjà récupérée.' },
    en: { open: 'Glovo open', closed: 'Glovo closed until {t}', close: 'Close', reopen: 'Reopen Glovo',
      picked: 'Picked up by the courier · {t}', expected: 'Courier expected · {t}', due: 'Promised for {t}', courier: 'Courier {n}', bundle: 'Bundled with {n} other(s)', ready: 'Ready in',
      road: 'Out for delivery · your riders', left: 'left at {t}', delivered: 'Delivered',
      code: 'Manager code', why: 'Closing or reopening Glovo needs a manager code.',
      ok: 'Confirm', cancel: 'Cancel', sent: 'Sent to Glovo', badCode: 'Wrong code.',
      notManager: 'This code is not a manager’s.', slow: 'Too many tries. Try again in a moment.',
      glovo: 'Glovo did not confirm. Try again.', off: 'Glovo is not switched on for Kiwi yet.', taken: 'The courier already has it.' },
    ar: { open: 'Glovo مفتوح', closed: 'Glovo مغلق إلى {t}', close: 'أغلق', reopen: 'افتح Glovo من جديد',
      picked: 'أخذها الموصّل · {t}', expected: 'الموصّل يصل · {t}', due: 'موعدها {t}', courier: 'الموصّل {n}', bundle: 'مجمّعة مع {n} أخرى', ready: 'جاهزة بعد',
      road: 'في الطريق · مع موصّليكم', left: 'خرجت {t}', delivered: 'وصلت',
      code: 'رمز المسؤول', why: 'إغلاق Glovo أو فتحه من جديد يحتاج رمز مسؤول.',
      ok: 'تأكيد', cancel: 'إلغاء', sent: 'وصل الطلب إلى Glovo', badCode: 'الرمز غير صحيح.',
      notManager: 'هذا الرمز ليس لمسؤول.', slow: 'محاولات كثيرة. حاول بعد لحظة.',
      glovo: 'Glovo لم يؤكد. حاول مرة أخرى.', off: 'Glovo غير مفعّل بعد مع Kiwi.', taken: 'الموصّل أخذها من قبل.' },
  };
  function glvT() {
    var l = String((document.documentElement && document.documentElement.lang) || '').slice(0, 2);
    return GLV_T[l] || GLV_T.fr;
  }
  function glvAt(iso) { var t = Date.parse(iso || ''); return isFinite(t) ? clockTime(t) : ''; }
  function glvBtn(kind, key, label, extra, cls) {
    return '<button type="button" class="kgl-btn' + (cls ? ' ' + cls : '') + '" data-kgl="' + kind + '" data-kgl-key="' + esc(key) + '"' +
      (extra || '') + (GLV.busy[kind + ':' + key] ? ' disabled aria-busy="true"' : '') + '>' + esc(label) + '</button>';
  }
  function glvNote(key) {
    var n = GLV.note[key];
    return n && n.until > Date.now() ? '<span class="kgl-note' + (n.bad ? ' is-bad' : '') + '" role="status">' + esc(n.text) + '</span>' : '';
  }
  function glovoHtml(o) {
    var g = o && GLV.orders[o.id];
    if (!g || g.cancelled) return '';
    var T = glvT(), info = [], acts = '';
    if (g.pickedUpTs) info.push(T.picked.replace('{t}', clockTime(g.pickedUpTs)));
    else if (!g.marketplace && !g.pickup) {
      /* Deux heures différentes : celle que Glovo prévoit pour le coursier, et
       * celle que la caisse a promise en acceptant (« Prête dans »). */
      if (g.courierEta) info.push(T.expected.replace('{t}', glvAt(g.courierEta)));
      if (g.pickupAt) info.push(T.due.replace('{t}', glvAt(g.pickupAt)));
      if (g.courier && g.courier.name) info.push(T.courier.replace('{n}', g.courier.name));
      if (g.bundled) info.push(T.bundle.replace('{n}', g.bundled));
      if (o.status === 'accepted') {
        acts = '<span class="kgl-lbl">' + esc(T.ready) + '</span>' + [5, 10, 15].map(function (n) {
          return glvBtn('prep', o.id, n + ' min', ' data-kgl-min="' + n + '"');
        }).join('');
      }
    }
    var note = glvNote('o:' + o.id);
    if (!info.length && !acts && !note) return '';
    var tel = !g.pickedUpTs && g.courier && /^\+?[0-9 ]{6,20}$/.test(g.courier.phone || '') ? g.courier.phone.replace(/ /g, '') : '';
    if (tel) acts = '<a class="kgl-btn" href="tel:' + esc(tel) + '">' + esc(tel) + '</a>' + acts;
    return '<div class="kgl">' + (info.length ? '<span class="kgl-info">' + esc(info.join(' · ')) + '</span>' : '') +
      (acts ? '<span class="kgl-acts">' + acts + '</span>' : '') + note + '</div>';
  }
  function glovoBar() {
    if (!GLV.stores.length) return '';
    var T = glvT(), many = GLV.stores.length > 1;
    var rows = GLV.stores.map(function (st) {
      var closed = !!st.closingUntil;
      var acts = closed ? glvBtn('reopen', st.storeId, T.reopen)
        : '<span class="kgl-lbl">' + esc(T.close) + '</span>' + [[30, '30 min'], [60, '1 h'], [180, '3 h']].map(function (d) {
          return glvBtn('close', st.storeId, d[1], ' data-kgl-min="' + d[0] + '"');
        }).join('');
      return '<div class="kgl-store' + (closed ? ' is-closed' : '') + '"><span class="kgl-dot" aria-hidden="true"></span>' +
        '<b>' + esc(closed ? T.closed.replace('{t}', glvAt(st.closingUntil)) : T.open) + '</b>' +
        (many ? '<code>' + esc(st.storeId) + '</code>' : '') + '<span class="kgl-acts">' + acts + '</span>' + glvNote('s:' + st.storeId) + '</div>';
    });
    var road = Object.keys(GLV.orders).map(function (k) { return GLV.orders[k]; })
      .filter(function (g) { return g.marketplace && g.outTs && !g.deliveredTs && !g.cancelled; });
    var roadHtml = road.length ? '<div class="kgl-road"><div class="kgl-h">' + esc(T.road) + '</div>' + road.map(function (g) {
      var o = state.orders[g.kiwiOrderId];
      return '<div class="kgl-row"><span>' + esc(o ? orderRef(o) : (g.code || g.kiwiOrderId)) + ' · ' + esc(T.left.replace('{t}', clockTime(g.outTs))) + '</span>' +
        glvBtn('delivered', g.kiwiOrderId, T.delivered, '', 'is-go') + glvNote('o:' + g.kiwiOrderId) + '</div>';
    }).join('') + '</div>' : '';
    return '<div class="kgl-bar">' + rows.join('') + roadHtml + '</div>';
  }
  function glvSchedule(ms) {
    clearTimeout(GLV.timer);
    GLV.timer = setTimeout(glvLoad, window.KiwiPoll?.delay(ms) ?? ms);
  }
  function glvRepaint() { var sig = JSON.stringify([GLV.stores, GLV.orders, GLV.busy, GLV.note]); if (sig !== GLV.sig) { GLV.sig = sig; paint(); } }
  function glvLoad() {
    var m = merchant();
    if (!m || !orderProOn()) { glvSchedule(120000); return; }
    if (m !== GLV.merchant) { GLV.merchant = m; GLV.stores = []; GLV.orders = {}; GLV.busy = {}; GLV.note = {}; }
    if (document.hidden) return;
    if (GLV.inflight) { GLV.again = true; return; }
    GLV.inflight = true;
    fetch('/api/channel/glovo/till?merchant=' + encodeURIComponent(m), { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok || merchant() !== m) return;
        GLV.stores = Array.isArray(j.stores) ? j.stores : [];
        GLV.orders = {};
        (Array.isArray(j.orders) ? j.orders : []).forEach(function (g) { if (g && g.kiwiOrderId) GLV.orders[g.kiwiOrderId] = g; });
        glvRepaint();
      })
      .catch(function () {})
      .then(function () {
        GLV.inflight = false;
        if (GLV.again) { GLV.again = false; glvLoad(); return; }
        var live = Object.keys(GLV.orders).some(function (k) { var g = GLV.orders[k]; return !g.cancelled && !g.deliveredTs && !(g.pickedUpTs && !g.marketplace); });
        glvSchedule(!GLV.stores.length ? 600000 : live ? 20000 : 60000);
      });
  }
  function glvSay(key, text, bad) { GLV.note[key] = { text: text, bad: !!bad, until: Date.now() + 6000 }; glvRepaint(); setTimeout(glvRepaint, 6100); }
  function glvError(j) {
    var T = glvT(), e = String((j && j.error) || '');
    if (e === 'pin-invalid' || e === 'invalid-pin' || e === 'bad-pin') return T.badCode;
    if (e === 'manager-required') return T.notManager;
    if (e === 'rate-limited' || e === 'rate-local' || e === 'too-many') return T.slow;
    if (e === 'not-configured') return T.off;
    if (e === 'already-picked-up') return T.taken;
    return T.glovo;
  }
  function glvPost(key, body, onRefused) {
    var m = merchant();
    if (!m) return;
    var noteKey = (key.indexOf('close:') === 0 || key.indexOf('reopen:') === 0 ? 's:' : 'o:') + key.slice(key.indexOf(':') + 1);
    GLV.busy[key] = true; glvRepaint();
    body.merchant = m;
    fetch('/api/channel/glovo/till', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok && j && j.ok, j: j, status: r.status }; }); })
      .catch(function () { return { ok: false, j: {} }; })
      .then(function (out) {
        delete GLV.busy[key];
        /* La preuve du responsable en poste n'a pas suffi : le champ du code, comme avant. */
        if (!out.ok && typeof onRefused === 'function' && (out.status === 401 || out.status === 403)) { glvRepaint(); onRefused(); return; }
        glvSay(noteKey, out.ok ? glvT().sent : glvError(out.j), !out.ok);
        glvLoad();
      });
    body.pin = '';
  }
  /* Le code d'un responsable, pour fermer ou rouvrir. Il part au serveur dans
   * la requête et nulle part ailleurs : champ masqué, vidé à la fermeture. */
  function glvAskCode(go, noShift) {
    /* Un gérant ou un propriétaire tient la caisse : sa preuve de poste remplace
       le code (assets/staff-perms-till.js) ; refusée, le champ du code s'ouvre. */
    var shift = { code: '' };
    if (!noShift) try { document.dispatchEvent(new CustomEvent('kiwi-shift-code', { detail: shift })); } catch (_) {}
    if (shift.code) { go(shift.code, function () { glvAskCode(go, true); }); return; }
    var T = glvT(), old = document.getElementById('kgl-code');
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.id = 'kgl-code'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'kgl-code-t');
    var node = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    var form = node('form', 'kgl-dlg'), title = node('b', null, T.code), input = node('input'), row = node('div', 'kgl-dlg-a');
    var no = node('button', 'kgl-btn', T.cancel), yes = node('button', 'kgl-btn is-go', T.ok);
    title.id = 'kgl-code-t'; no.type = 'button'; no.setAttribute('data-kgl-x', ''); yes.type = 'submit';
    input.type = 'password'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.maxLength = 8; input.setAttribute('aria-label', T.code);
    row.appendChild(no); row.appendChild(yes);
    form.appendChild(title); form.appendChild(node('p', null, T.why)); form.appendChild(input); form.appendChild(row);
    wrap.appendChild(form);
    document.body.appendChild(wrap);
    function done() { input.value = ''; wrap.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(); } }
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', function (e) { if (e.target === wrap || (e.target.closest && e.target.closest('[data-kgl-x]'))) done(); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = String(input.value || '').replace(/\D/g, '');
      if (pin.length < 4) { input.focus(); return; }
      done(); go(pin);
    });
    setTimeout(function () { input.focus(); }, 0);
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('button[data-kgl]') : null;
    if (!b || b.disabled) return;
    var kind = b.getAttribute('data-kgl'), key = b.getAttribute('data-kgl-key') || '', min = Number(b.getAttribute('data-kgl-min')) || 0;
    if (GLV.busy[kind + ':' + key]) return;
    if (kind === 'prep') glvPost('prep:' + key, { action: 'prep', orderId: key, minutes: min });
    else if (kind === 'delivered') glvPost('delivered:' + key, { action: 'delivered', orderId: key });
    else if (kind === 'close') glvAskCode(function (pin, refused) { glvPost('close:' + key, { action: 'close', storeId: key, minutes: min, pin: pin }, refused); });
    else if (kind === 'reopen') glvAskCode(function (pin, refused) { glvPost('reopen:' + key, { action: 'reopen', storeId: key, pin: pin }, refused); });
  });
  function glvWake() { if (!document.hidden && GLV.merchant) glvLoad(); }
  document.addEventListener('visibilitychange', glvWake);
  document.addEventListener('kiwi:request-wake', glvWake);
  window.addEventListener('focus', glvWake);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { glvSchedule(1500); });
  else glvSchedule(1500);
  (function glvCss() {
    var s = document.createElement('style');
    s.textContent = [
      '.kgl{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:9px;padding:8px 10px;border-radius:10px;',
      'background:color-mix(in srgb,var(--atlas,#0B6E4F) 7%,transparent);font-size:.84rem;line-height:1.35;}',
      '.kgl-info{font-weight:600;}',
      '.kgl-acts{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;}',
      '.kgl-lbl{font-size:.8rem;opacity:.72;}',
      '.kgl-btn{min-height:40px;padding:0 12px;border-radius:9px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);',
      'background:var(--surface,#F7F5F0);color:inherit;font:600 .86rem/1 inherit;cursor:pointer;touch-action:manipulation;}',
      '.kgl-btn.is-go{background:var(--atlas,#0B6E4F);border-color:transparent;color:var(--paper,#F7F5F0);}',
      '.kgl-btn[disabled]{opacity:.55;cursor:default;}',
      'a.kgl-btn{display:inline-flex;align-items:center;text-decoration:none;color:inherit;font-variant-numeric:tabular-nums;direction:ltr;}',
      '.kgl-btn:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px;}',
      '.kgl-note{flex-basis:100%;font-size:.8rem;font-weight:600;color:var(--atlas,#0B6E4F);}',
      '.kgl-note.is-bad{color:var(--danger,#B0402F);}',
      '.kgl-bar{display:flex;flex-direction:column;gap:8px;margin:0 0 14px;padding:10px 12px;border-radius:12px;',
      'border:1px solid color-mix(in srgb,var(--atlas,#0B6E4F) 22%,transparent);background:color-mix(in srgb,var(--atlas,#0B6E4F) 4%,transparent);}',
      '.kgl-store,.kgl-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;}',
      '.kgl-store b{font-size:.92rem;}',
      '.kgl-store code{font:500 .74rem "JetBrains Mono",ui-monospace,monospace;opacity:.7;}',
      '.kgl-store .kgl-acts,.kgl-row .kgl-btn{margin-inline-start:auto;}',
      '.kgl-dot{width:9px;height:9px;border-radius:50%;background:var(--atlas,#0B6E4F);flex:0 0 auto;}',
      '.kgl-store.is-closed .kgl-dot{background:var(--danger,#B0402F);}',
      '.kgl-road{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px dashed color-mix(in srgb,currentColor 16%,transparent);}',
      '.kgl-h{font-size:.74rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.7;}',
      '#kgl-code{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(10,15,13,.42);padding:16px;}',
      '.kgl-dlg{width:min(360px,100%);display:flex;flex-direction:column;gap:10px;padding:20px;border-radius:16px;',
      'background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 18px 48px rgba(10,15,13,.28);font-family:"Inter Tight",Inter,system-ui,sans-serif;}',
      '.kgl-dlg b{font-size:1.05rem;}',
      '.kgl-dlg p{margin:0;font-size:.88rem;opacity:.75;line-height:1.45;}',
      '.kgl-dlg input{min-height:52px;padding:0 14px;border-radius:12px;border:1px solid rgba(10,15,13,.18);font:600 1.4rem/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.3em;text-align:center;background:#FFFDFA;color:inherit;}',
      '.kgl-dlg input:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px;}',
      '.kgl-dlg-a{display:flex;gap:8px;justify-content:flex-end;}',
      '.kgl-dlg-a .kgl-btn{min-height:44px;padding:0 16px;}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  })();

  window.KiwiOrderInbox = {
    open: open, close: close, refresh: pull,
    orders: function () { return state.orders; },
    sessions: function () { return state.sessions; },
    // La caisse pilote les transitions depuis l'écran cuisine et le tableau
    // À emporter ; c'est le même chemin réseau, pas un second à maintenir.
    setStatus: setStatus,
    merchant: merchant,
    // The 2027 till's Takeaway tab draws the same three lists the overlay
    // does, with the same order reference; nothing while Order Pro is off.
    groups: function () {
      if (!merchant() || !orderProOn()) return { pending: [], accepted: [], ready: [] };
      return { pending: list('pending').filter(away), accepted: list('accepted').filter(away), ready: list('ready').filter(away) };
    },
    // Les commandes de tables à accepter, pour la pastille Salle du rail 2027.
    floorPending: function () {
      if (!merchant() || !orderProOn()) return 0;
      return list('pending').filter(onFloor).length;
    },
    ref: orderRef,
    glovoHtml: glovoHtml,
    glovoBar: glovoBar,
  };
})();
