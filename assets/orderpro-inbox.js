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
  var state = { orders: {}, sessions: [], since: 0, open: false, timer: null, seen: {} };

  function esc(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function fmt(n) { try { return (Math.round(n) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(n) || 0); } }
  function ls(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }

  function paired() { try { return !!(window.KiwiCaissePairing && KiwiCaissePairing.isPaired && KiwiCaissePairing.isPaired()); } catch (_) { return false; } }
  function merchant() { return paired() ? (ls('kiwiLiveMerchant') || '') : ''; }

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
      '#kop-root .kop-head h2{margin:0;font-size:1.15rem;font-weight:700;letter-spacing:-.01em;}',
      '#kop-root .kop-x{margin-left:auto;width:38px;height:38px;border-radius:11px;border:1px solid rgba(10,15,13,.1);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--ink,#0A0F0D);}',
      '#kop-root .kop-x svg{width:18px;height:18px;}',
      '#kop-root .kop-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 22px 40px;}',
      '#kop-root .kop-sec{font-size:.72rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--atlas,#0B6E4F);margin:22px 0 10px;}',
      '#kop-root .kop-sec:first-child{margin-top:0;}',
      '#kop-root .kop-card{background:var(--surface);border:1px solid rgba(10,15,13,.08);border-radius:16px;padding:15px 17px;margin-bottom:11px;box-shadow:0 1px 2px rgba(10,15,13,.04);}',
      '#kop-root .kop-card.pending{border-color:rgba(11,110,79,.45);box-shadow:0 4px 16px rgba(11,110,79,.12);}',
      '#kop-root .kop-top{display:flex;align-items:baseline;gap:10px;margin-bottom:9px;}',
      '#kop-root .kop-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:1.15rem;font-weight:600;}',
      '#kop-root .kop-where{font-size:.82rem;font-weight:600;color:var(--riad,#053B2C);background:var(--mint-soft,#E6FBEF);padding:4px 10px;border-radius:999px;}',
      '#kop-root .kop-total{margin-left:auto;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:1rem;font-weight:600;}',
      '#kop-root .kop-line{display:flex;gap:9px;font-size:.9rem;padding:3px 0;color:var(--ink,#0A0F0D);}',
      '#kop-root .kop-line .q{font-family:"JetBrains Mono",ui-monospace,monospace;color:var(--atlas,#0B6E4F);font-weight:600;min-width:24px;}',
      '#kop-root .kop-line .o{color:rgba(10,15,13,.55);font-size:.82rem;}',
      '#kop-root .kop-acts{display:flex;gap:8px;margin-top:13px;}',
      '#kop-root .kop-btn{flex:1;border:0;border-radius:11px;padding:12px;font:600 .92rem/1 inherit;cursor:pointer;}',
      '#kop-root .kop-btn.go{background:var(--atlas,#0B6E4F);color:#fff;}',
      '#kop-root .kop-btn.ghost{background:var(--surface);border:1px solid rgba(10,15,13,.14);color:rgba(10,15,13,.65);}',
      '#kop-root .kop-btn.ghost:hover{color:var(--danger,#b0402f);border-color:var(--danger,#b0402f);}',
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
    return fetch('/api/order/queue?merchant=' + encodeURIComponent(m) + '&since=' + state.since, {
      headers: { Accept: 'application/json' }, cache: 'no-store',
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.ok) return -1;
        state.since = j.now || state.since;
        var fresh = 0;
        var delta = j.orders || [];
        delta.forEach(function (o) {
          if (!state.seen[o.id] && o.status === 'pending') { fresh++; state.seen[o.id] = 1; }
          state.orders[o.id] = o;
        });
        state.sessions = j.sessions || [];
        bridge(delta);
        if (fresh) announce(fresh);
        paint();
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
      window.KiwiCaisseKitchen.ingest(delta, all, state.sessions);
    } catch (_) {}
  }

  function setStatus(id, status, extra) {
    var m = merchant();
    if (!m) return Promise.resolve(null);
    var prev = state.orders[id];
    // Optimistic, then reconciled by the next poll: the till must feel instant.
    if (prev) {
      if (status === 'rejected') delete state.orders[id];
      else prev.status = status;
      paint();
    }
    var body = { merchant: m, id: id, status: status };
    // Le serveur affecté à la table, posé au moment de l'acceptation, et le
    // paiement d'un retrait au comptoir : deux informations que SEULE la caisse
    // détient à cet instant, et qui doivent voyager avec la transition.
    if (extra && extra.server) body.server = extra.server;
    if (extra && extra.paid) body.paid = true;
    return fetch('/api/order/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.ok) { bridge([]); return j; }
        /* Refus du serveur. Un 409 « bad-transition » n'est PAS une panne :
         * c'est une autre caisse qui a fait le geste avant nous. Remettre
         * l'état d'avant serait alors faux dans l'autre sens — le prochain
         * sondage tranchera avec la vérité du serveur. */
        if (prev) { state.orders[id] = prev; paint(); }
        return j;
      })
      .catch(function () { if (prev) { state.orders[id] = prev; paint(); } return null; });
  }

  /* ── L'addition est réglée : on coupe le téléphone ───────────────────────
   * kiwi-caisse.html émet l'évènement depuis markPaid() — le point de passage
   * commun à la carte, aux espèces et à l'addition partagée — et l'appel réseau
   * vit ici. Une vente ne doit jamais attendre le réseau, ni échouer parce
   * qu'il est tombé : la session se refermera au pire à son expiration. */
  function closeSession(detail) {
    var m = merchant();
    if (!m || !detail) return;
    var body = { merchant: m, closedBy: detail.why || 'settle' };
    if (detail.session) body.closeSession = detail.session;
    else if (detail.table) body.closeTable = String(detail.table);
    else return;
    fetch('/api/order/queue', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function () { state.since = 0; return pull(); }).catch(function () {});
  }

  /* ── attention: a new order must not be missable on a busy counter ────── */
  function announce(n) {
    var chip = document.getElementById('kop-chip');
    if (chip) { chip.classList.add('is-new'); setTimeout(function () { chip.classList.remove('is-new'); }, 6000); }
    try { if (navigator.vibrate) navigator.vibrate([40, 60, 40]); } catch (_) {}
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
    try {
      var stack = document.getElementById('toast-stack');
      if (stack) {
        var el = document.createElement('div'); el.className = 'toast';
        el.innerHTML = '<div style="font-weight:600">' + n + ' nouvelle' + (n > 1 ? 's' : '') + ' commande' + (n > 1 ? 's' : '') + '</div>' +
                       '<div style="opacity:.7;font-size:.85em;margin-top:2px">Depuis le téléphone d\'un client</div>';
        stack.appendChild(el);
        setTimeout(function () { el.classList.add('fade'); }, 2600);
        setTimeout(function () { el.remove(); }, 2900);
      }
    } catch (_) {}
  }

  /* ── render ───────────────────────────────────────────────────────────── */
  function list(status) {
    return Object.keys(state.orders)
      .map(function (k) { return state.orders[k]; })
      .filter(function (o) { return o.status === status; })
      .sort(function (a, b) { return a.created_ts - b.created_ts; });
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

  function cardHtml(o) {
    var where = o.mode === 'table' ? 'Table ' + esc(o.table || '?')
      : (o.mode === 'delivery' ? 'Livraison' : 'À emporter');
    var src = o.channel && o.channel !== 'kiwi'
      ? '<span class="kop-src">' + esc(SRC[o.channel] || o.channel) + '</span>' : '';
    var lines = (o.lines || []).map(function (l) {
      return '<div class="kop-line"><span class="q">' + (l.qty || 1) + '×</span><span>' + esc(l.name || '') +
        (l.options ? ' <span class="o">' + esc(l.options) + '</span>' : '') +
        (l.note ? ' <span class="o">— ' + esc(l.note) + '</span>' : '') + '</span></div>';
    }).join('');
    var acts = o.status === 'pending'
      ? '<div class="kop-acts">' +
          '<button class="kop-btn ghost" data-kop-rej="' + esc(o.id) + '">Refuser</button>' +
          '<button class="kop-btn go" data-kop-acc="' + esc(o.id) + '">Accepter · envoyer en cuisine</button>' +
        '</div>'
      : (o.status === 'accepted'
          ? '<div class="kop-acts"><button class="kop-btn go" data-kop-ready="' + esc(o.id) + '">Marquer prêt</button></div>'
          : (o.status === 'ready'
              /* Le point final. Sans lui, une commande restait « prête » pour
               * toujours : le téléphone du client ne recevait jamais son
               * remerciement, et la file gardait une ligne que plus personne
               * n'avait à traiter. */
              ? '<div class="kop-acts"><button class="kop-btn go" data-kop-served="' + esc(o.id) + '">' +
                (o.mode === 'table' ? 'Servie' : 'Remise au client') + '</button></div>'
              : ''));
    return '<div class="kop-card ' + esc(o.status) + '">' +
      '<div class="kop-top"><span class="kop-num">#' + String(o.number || 0).padStart(3, '0') + '</span>' +
      '<span class="kop-where">' + where + '</span>' + src +
      '<span class="kop-total">' + fmt(o.total) + ' MAD</span></div>' +
      lines + custHtml(o) + acts + '</div>';
  }

  function paint() {
    chip();
    if (!state.open) return;
    var body = document.getElementById('kop-body');
    if (!body) return;
    var pending = list('pending'), cooking = list('accepted'), ready = list('ready');
    if (!pending.length && !cooking.length && !ready.length) {
      body.innerHTML = '<div class="kop-empty">Aucune commande pour le moment.<br>Les commandes passées depuis le téléphone d\'un client arrivent ici.</div>';
      return;
    }
    body.innerHTML =
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

  function chip() {
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
        var t = e.target.closest('[data-kop-acc],[data-kop-rej],[data-kop-ready],[data-kop-served],#kop-close');
        if (!t) return;
        if (t.id === 'kop-close') { close(); return; }
        if (t.dataset.kopAcc) {
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
        } else if (t.dataset.kopRej) setStatus(t.dataset.kopRej, 'rejected');
        else if (t.dataset.kopReady) setStatus(t.dataset.kopReady, 'ready');
        else if (t.dataset.kopServed) setStatus(t.dataset.kopServed, 'served');
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

  /* ── start ────────────────────────────────────────────────────────────── */
  function start() {
    if (state.timer) clearInterval(state.timer);
    chip();
    pull();
    state.timer = setInterval(pull, POLL_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  // Pairing can happen after load (the pad is redeemed live) — pick it up.
  window.addEventListener('storage', function (e) {
    if (e.key === 'kiwiPaired' || e.key === 'kiwiLiveMerchant') { state.since = 0; chip(); pull(); }
  });
  // La config arrive après le premier passage : c'est elle qui décide si cette
  // caisse a Order Pro, donc on repeint dès qu'elle est là (allumage immédiat,
  // sans attendre le prochain tour de poll).
  document.addEventListener('kiwi-config', function () { chip(); pull(); });

  /* L'addition réglée coupe le téléphone. L'évènement vient de markPaid() dans
   * kiwi-caisse.html — le seul point de passage commun à la carte, aux espèces
   * et à l'addition partagée. */
  document.addEventListener('kiwi-table-released', function (e) { closeSession(e.detail); });

  window.KiwiOrderInbox = {
    open: open, close: close, refresh: pull,
    orders: function () { return state.orders; },
    sessions: function () { return state.sessions; },
    // La caisse pilote les transitions depuis l'écran cuisine et le tableau
    // À emporter ; c'est le même chemin réseau, pas un second à maintenir.
    setStatus: setStatus,
    merchant: merchant,
  };
})();
