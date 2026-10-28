  /* ── launcher chip ─────────────────────────────────────────────────────── */
  function ensureChip() {
    if (tillLocked() && isOpen()) close();
    if (!shouldShow()) { var ex = document.getElementById('kcb-chip'); if (ex) ex.remove(); return; }
    css();
    var b = document.getElementById('kcb-chip');
    if (!b) {
      b = document.createElement('button'); b.id = 'kcb-chip'; b.type = 'button';
      b.addEventListener('click', open);
      document.body.appendChild(b);
    }
    var n = KC.count();
    b.innerHTML = ICON.users + '<span class="kcb-lbl">' + (hospitalityMode() ? 'Hospitality+' : 'Clients') + '</span>' + (n ? '<span class="kcb-badge">' + n + '</span>' : '');
  }

  /* ── root panel ────────────────────────────────────────────────────────── */
  var state = { q: '', seg: 'all' };
  /* Inset the panel to the caisse working area — right of the nav rail, below the
   * top bar — so the caisse sidebar + top bar stay visible (the "Plan d'sala" look
   * the owner asked for) instead of a full-viewport takeover. Café/resto exposes a
   * 280px .sidebar; pos verticals a vertical nav rail. Unknown layouts fall back to
   * full-bleed (inset:0) so nothing is ever hidden. */
  /* La barre latérale, pas la LISTE de boutons qu'elle contient.
   *
   * On mesurait le `<nav>` trouvé par le sélecteur. Dans la caisse boutique ce
   * `<nav class="bq-nav">` est imbriqué dans `<aside class="bq-rail">` sous le
   * logo et le bloc établissement : son bord haut est à ~270 px du sommet. Le
   * carnet héritait donc de ce 270 px et s'ouvrait à mi-hauteur, décalé, en
   * laissant dépasser l'écran de vente au-dessus de lui — alors que toutes les
   * autres pages du métier occupent la zone de travail entière.
   *
   * On remonte donc les ancêtres tant qu'on reste sur une bande verticale de
   * largeur comparable, et on garde la plus haute. Une caisse dont le `<nav>`
   * EST déjà le rail ne bouge pas d'un pixel : son parent est la page, trop
   * large, et la boucle s'arrête tout de suite. */
  function railBox(el) {
    var best = el.getBoundingClientRect();
    var p = el.parentElement;
    while (p && p !== document.body && p.nodeType === 1) {
      var r = p.getBoundingClientRect();
      if (r.width > best.width * 1.6) break;      // ce n'est plus une bande, c'est la page
      if (r.height > best.height) best = r;
      p = p.parentElement;
    }
    return best;
  }

  function panelInset() {
    var res = { left: 0, top: 0, right: 0, bottom: 0 };
    try {
      /* `#bq-kit-rail` est le rail 2027 de la boutique, comme `#kit-rail` est
         celui du restaurant : il DOIT être nommé ici. Sans lui, le seul
         candidat restant était `<nav class="bq-nav">` — que la peau 2027
         réduit à une largeur nulle pour éteindre la barre livrée. Une bande
         de 0 px passait les deux tests (plus haute que large, collée au bord
         gauche), le carnet héritait d'un retrait nul, s'ouvrait en plein
         écran PAR-DESSUS le rail, et la caissière n'avait plus aucun moyen
         de quitter la page Clientes (propriétaire, 2026-10-28). D'où aussi le
         refus des rails sans largeur : une barre qui ne peint rien n'est pas
         la barre, et mieux vaut le plein écran franc qu'un retrait faux. */
      var rail = null, cands = document.querySelectorAll('#kit-rail, #bq-kit-rail, .sidebar, nav[class$="-nav"]');
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i]; if (el.offsetParent === null) continue;
        var rr = railBox(el);
        if (rr.width < 8) continue;                 // une barre éteinte n'est pas la barre
        // a vertical rail hugging a screen edge (taller than wide), not a top bar
        if (rr.height > rr.width * 1.4 && (rr.left < 60 || rr.right > window.innerWidth - 60)) { rail = rr; break; }
      }
      if (rail) {
        res.top = Math.max(0, Math.round(rail.top));
        if (rail.left <= window.innerWidth - rail.right) res.left = Math.max(0, Math.round(rail.right)); // rail on the left
        else res.right = Math.max(0, Math.round(window.innerWidth - rail.left));                         // rail on the right (RTL)
        return res;
      }
      var main = document.querySelector('.main');
      if (main && main.offsetParent !== null) {
        var mr = main.getBoundingClientRect();
        if (mr.width > 120 && mr.height > 120) { res.top = Math.max(0, Math.round(mr.top)); res.left = Math.max(0, Math.round(mr.left)); }
      }
    } catch (_) {}
    return res;
  }
  /* The same phone test as assets/pos-mobile.css. On a phone the carnet takes
   * the whole screen: the register's rail is an off-canvas drawer there, so
   * measuring it only ever caught it mid-slide (a 212px gap beside a drawer
   * that was closing) and, with the drawer shut, the carnet covered every
   * control of the register with no way back (ticket #0137). */
  var PHONE_Q = '(max-width: 860px), (orientation: landscape) and (max-width: 1024px) and (max-height: 600px)';
  function isPhone() { try { return !!(window.matchMedia && window.matchMedia(PHONE_Q).matches); } catch (_) { return false; } }
  /* La caisse 2027 sur téléphone a une capsule d'onglets en bas (#kit-tabbar,
     html[data-k-tabs]) : le carnet s'arrête au-dessus, sinon on ne pourrait
     plus le quitter par un autre onglet. */
  function phoneTabInset() {
    try {
      if (!document.documentElement.hasAttribute('data-k-tabs')) return 0;
      var bar = document.getElementById('kit-tabbar');
      if (!bar || getComputedStyle(bar).display === 'none') return 0;  // fixe : offsetParent est toujours null
      return Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top + 8));
    } catch (_) { return 0; }
  }
  /* La caisse 2027 garde son rail à l'écran à toutes les largeurs : le carnet
     s'ouvre alors à côté, comme Cuisine, même sur un iPad en portrait, qui
     passait sous la règle téléphone, couvrait le rail et prenait une croix. */
  function railed() {
    try {
      var r = document.getElementById('kit-rail');
      if (!document.documentElement.hasAttribute('data-k-till') || !r || r.offsetParent === null) return false;
      // The phone keeps its full-screen page, as Cuisine does (kit.css, same line).
      return window.matchMedia('(min-width: 1025px), (min-width: 744px) and (min-height: 601px)').matches;
    } catch (_) { return false; }
  }
  function positionRoot(root) {
    if (!root) return;
    var beside = railed();
    if (beside) root.setAttribute('data-rail', ''); else root.removeAttribute('data-rail');
    var b = isPhone() && !beside ? { left: 0, top: 0, right: 0, bottom: phoneTabInset() } : panelInset();
    root.style.left = b.left + 'px'; root.style.top = b.top + 'px';
    root.style.right = b.right + 'px'; root.style.bottom = b.bottom + 'px';
  }
  /* Pas de croix : une page ne se ferme pas, elle se quitte. On sort du carnet
     comme on sort de l'Inventaire — en touchant l'entrée suivante du rail. */
  function open(entry) {
    if (tillLocked()) return;
    css();
    var root = document.getElementById('kcb-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'kcb-root';
      root.setAttribute('aria-label', 'Carnet clients');
      document.body.appendChild(root);
    }
    root.style.display = 'flex';
    positionRoot(root);
    // Opened just after the unlock, the 2027 rail can still be settling and is
    // missed: the page then took the menu pane's box, 35 px off the rail and
    // 28 px down. Measure again once it has settled.
    setTimeout(function () { if (root.style.display !== 'none') positionRoot(root); }, 400);
    markNav(entry);
    root.innerHTML =
      '<div class="kcb-scroll" tabindex="0" role="region" aria-label="Clients"><div class="kcb-page">' +
        '<div class="kcb-top"><div><h2>' + (hospitalityMode() ? 'Hospitality+' : 'Clients') + '</h2>' +
          '<span class="kcb-prog">' + esc(progLabel()) + '</span></div>' +
          '<button class="kcb-x kcb-back" id="kcb-back" type="button" aria-label="Fermer le carnet clients">' + ICON.close + '</button>' +
          '<button data-activation=write class="kcb-add" id="kcb-add">' + ICON.userplus + '<span>Nouveau client</span></button></div>' +
        '<div class="kcb-strip" id="kcb-strip"></div>' +
        '<div class="kcb-tools"><div class="kcb-searchwrap">' + ICON.search +
          '<input class="kcb-search" id="kcb-q" inputmode="search" aria-label="Rechercher un client" placeholder="Rechercher un nom ou 06…" value="' + esc(state.q) + '"></div>' +
          '<div class="kx-tabs" id="kcb-segs" role="tablist" aria-label="Profils"></div></div>' +
        '<div class="kcb-list" id="kcb-list"></div>' +
      '</div></div>';
    renderList();
    if (KC.pull) KC.pull(function (ch) { if (ch) { renderList(); ensureChip(); } }); // cross-device refresh
    root.querySelector('#kcb-add').onclick = function () { openForm(null); };
    root.querySelector('#kcb-back').onclick = close;
    var q = root.querySelector('#kcb-q');
    q.oninput = function () { state.q = q.value; renderList(); };
    // A touch keyboard that rises the moment the page opens hides the list
    // the merchant came to read: a phone, and an iPad too. Only a mouse or
    // trackpad gets the field focused.
    // The 2027 till's page opens from its rail like Salle or Cuisine, with
    // nothing focused (owner, 26 Oct 2026: the ringed field read as a bug).
    var fine = false; try { fine = window.matchMedia('(pointer: fine)').matches; } catch (_) {}
    if (!isPhone() && fine && !railed()) q.focus();
    announce(true);
  }
  /* Le rail de la caisse 2027 allume son entrée tant que le carnet est ouvert. */
  function announce(on) { try { document.documentElement.toggleAttribute('data-kcb-open', !!on); } catch (_) {} try { document.dispatchEvent(new CustomEvent('kiwi:clientsbook', { detail: { open: on } })); } catch (_) {} }
  function close() {
    // La fiche cliente part avec le carnet : ouverte par-dessus, elle restait
    // sinon posée seule au milieu de l'écran de vente.
    closeSheet();
    var r = document.getElementById('kcb-root'); if (r) r.style.display = 'none';
    clearNav(); ensureChip(); announce(false);
  }

  function foldText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function matches(c, q) {
    if (!q) return true;
    var qFold = foldText(q);
    if (!qFold) return true;
    if (foldText(c.name).indexOf(qFold) >= 0) return true;
    if (c.email && foldText(c.email).indexOf(qFold) >= 0) return true;
    var digits = String(q).replace(/\D/g, '');
    if (digits.length >= 2) {
      var cDigits = String(c.phone || '').replace(/\D/g, '');
      if (cDigits.indexOf(digits) >= 0) return true;
      var cLocal = cDigits.replace(/^212/, '0');
      var qLocal = digits.replace(/^212/, '0');
      if (cLocal && qLocal && (cLocal.indexOf(qLocal) >= 0 || qLocal.indexOf(cLocal) >= 0)) return true;
    }
    return false;
  }
  var SEG_TABS = [['all', 'Tous'], ['reg', 'Réguliers'], ['vip', 'VIP'], ['new', 'Nouveaux'], ['win', 'Dormants']];
  function lastSeenTxt(c) {
    var d = KC.daysSince(c.lastSeen);
    if (d === Infinity) return '·';
    return d === 0 ? 'Aujourd’hui' : (d === 1 ? 'Hier' : d + ' j');
  }
  function renderStrip(all, cfg) {
    var host = document.getElementById('kcb-strip'); if (!host) return;
    var reachable = 0, ready = 0, spend = 0;
    all.forEach(function (c) {
      if (c.consent || c.consentEmail) reachable++;
      if (KC.progress(c, cfg) >= 1) ready++;
      spend += Number(c.spend) || 0;
    });
    function kpi(label, value, unit) {
      return '<div class="kx-kpi"><div class="l">' + label + '</div><div class="v">' + value + (unit ? '<span class="u">' + unit + '</span>' : '') + '</div></div>';
    }
    var kitSpend = document.documentElement.hasAttribute('data-k-till');
    host.innerHTML = kpi('Clients', fmt(all.length)) + kpi('Joignables', fmt(reachable)) +
      kpi('Récompenses prêtes', fmt(ready)) + kpi('Dépensé', fmt(spend, kitSpend), kitSpend ? '' : 'MAD');
  }
  function renderSegs(all) {
    var host = document.getElementById('kcb-segs'); if (!host) return;
    var counts = { all: all.length, reg: 0, vip: 0, new: 0, win: 0 };
    all.forEach(function (c) { counts[KC.segment(c)]++; });
    if (!host.querySelector('.kx-tab')) {
      host.innerHTML = SEG_TABS.map(function (t) {
        return '<button type="button" class="kx-tab" role="tab" data-seg="' + t[0] + '"><span>' + t[1] + '</span><b></b></button>';
      }).join('');
      Array.prototype.forEach.call(host.querySelectorAll('.kx-tab'), function (b) {
        b.onclick = function () { state.seg = b.getAttribute('data-seg'); renderList(); };
      });
      // liquid-lens only scans the first mutation batch of a frame; ask it to find this row.
      setTimeout(function () { try { if (window.KiwiLens) window.KiwiLens.rescan(); } catch (_) {} }, 0);
    }
    Array.prototype.forEach.call(host.querySelectorAll('.kx-tab'), function (b) {
      var k = b.getAttribute('data-seg');
      b.querySelector('b').textContent = counts[k];
      var on = (state.seg || 'all') === k;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function localCreditsByHolder() {
    var out = {};
    localAvoirs().forEach(function (a) {
      if (!a.holderId || !(a.balance > 0) || a.status === 'cancelled' || a.status === 'consumed') return;
      if (a.until && new Date(a.until).getTime() < Date.now()) return;
      out[a.holderId] = (out[a.holderId] || 0) + Number(a.balance);
    });
    return out;
  }
  function renderList() {
    var host = document.getElementById('kcb-list'); if (!host) return;
    var cfg = KC.config();
    var all = KC.list().sort(function (a, b) { return (b.lastSeen || 0) - (a.lastSeen || 0); });
    renderStrip(all, cfg);
    renderSegs(all);
    var seg = state.seg || 'all';
    var rows = all.filter(function (c) { return matches(c, state.q) && (seg === 'all' || KC.segment(c) === seg); });
    if (!rows.length) {
      var qTrim = (state.q || '').trim();
      var isDigits = qTrim.replace(/\D/g, '').length > qTrim.replace(/\d/g, '').trim().length;
      var addBtn = qTrim
        ? '<button data-activation=write type="button" class="kcb-add" id="kcb-empty-add" style="margin-top:16px;">' + ICON.userplus + '<span>Nouveau client · « ' + esc(qTrim) + ' »</span></button>'
        : '';
      host.innerHTML = '<div class="kcb-empty"><span class="ico">' + ICON.users + '</span>' +
        (all.length ? '<b>Aucun résultat pour « ' + esc(qTrim) + ' »</b><div>Essayez un autre nom, un autre numéro ou un autre segment.</div>' + addBtn
                    : '<b>Aucun client pour l’instant</b><div>Ajoutez votre premier client · il apparaîtra aussitôt sur le tableau de bord.</div>') + '</div>';
      var eb = document.getElementById('kcb-empty-add');
      if (eb) {
        eb.onclick = function () {
          openForm({ name: isDigits ? '' : qTrim, phone: isDigits ? qTrim : '' });
        };
      }
      return;
    }
    var credits = localCreditsByHolder();
    var target = cfg.model === 'product' ? cfg.product.target : cfg.visit.target;
    host.innerHTML = '<div class="kcb-cols"><span>Client</span><span class="kcb-c-seg">Profil</span><span class="r">Visites</span><span class="r">Dernière visite</span><span class="r">Dépensé</span><span class="r">Fidélité</span></div>' +
      rows.map(function (c) {
        var s = KC.segment(c);
        var prog = KC.progress(c, cfg);
        var ptsTxt = cfg.model === 'amount' ? (fmt(c.points) + '<small>pts</small>') : ((c.stamps || 0) + '<small>/ ' + target + '</small>');
        return '<div class="kcb-row" data-id="' + esc(c.id) + '" tabindex="0" role="button">' +
          '<div class="kcb-who"><div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
            '<div style="min-width:0"><div class="kcb-nm" title="' + esc(c.name || '') + '">' + esc(c.name || 'Sans nom') +
              (credits[c.id] ? '<span class="kcb-credit">avoir ' + fmt(credits[c.id]) + ' MAD</span>' : '') + '</div>' +
            '<div class="kcb-ph">' + esc(c.phone || '·') + '</div></div></div>' +
          '<div class="kcb-c-seg"><span class="kcb-seg ' + s + '">' + SEG_LBL[s] + '</span></div>' +
          '<div class="kcb-c-visits r kcb-num">' + (c.visits || 0) + '</div>' +
          '<div class="kcb-c-last r kcb-num kcb-muted">' + lastSeenTxt(c) + '</div>' +
          '<div class="kcb-c-spend r kcb-num">' + (document.documentElement.hasAttribute('data-k-till') ? fmt(c.spend, true) : fmt(c.spend) + '<small>MAD</small>') + '</div>' +
          '<div class="kcb-fid">' + (prog >= 1 ? '<span class="kcb-ready">Récompense prête</span>' : '<span class="kcb-num">' + ptsTxt + '</span>') +
            '<span class="kcb-minibar"><i style="width:' + Math.round(Math.min(1, prog) * 100) + '%"></i></span></div></div>';
      }).join('');
    Array.prototype.forEach.call(host.querySelectorAll('.kcb-row'), function (row) {
      row.onclick = function () { openDetail(row.getAttribute('data-id')); };
      row.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(row.getAttribute('data-id')); } };
    });
  }

  // The programme (model / targets / rewards) can be changed from the dashboard —
  // refresh the header label + the stamp/points column live when it does.
  function refreshOpen() {
    var r = document.getElementById('kcb-root');
    if (!r || r.style.display === 'none') return;
    var pl = r.querySelector('.kcb-prog'); if (pl) pl.textContent = progLabel();
    renderList();
  }

  /* ── the client of the sale in progress (#0168) ─────────────────────────
     The till types that take money through KiwiPosSale.record() had this page
     but no way to put a sale on it. Attaching here hands the client to
     assets/pos-sale.js, which credits the next paid sale (amount, items,
     ticket, method) and lets go. The restaurant, boutique, maison and hotel
     tills attach from their own ticket and are left out. */
  var POS_ATTACH = /(^|\s)is-pos-(boulangerie|foodtruck|epicerie|librairie|coiffure|gym|fastfood|pharmacie|fleuriste|spa|traiteur|pizzeria)(\s|$)/;
  function posAttachOn() {
    try { return !!(window.KiwiPosSale && KiwiPosSale.attachClient && KiwiPosSale.isReal() && POS_ATTACH.test(document.body.className)); }
    catch (_) { return false; }
  }
  /* Where a client card can put its client: { current() id or null,
     attach(c), detach(), on/off labels, pos }. The POS verticals credit the
     next paid sale (KiwiPosSale); the restaurant till puts the client on the
     note in progress, À emporter or an open table (KiwiCaisseSaleClient in
     caisse-accounting.js). Null when there is no sale to put them on. */
  function saleTarget() {
    try {
      if (posAttachOn()) return {
        pos: true, on: tr('Attacher à la vente en cours'), off: tr('Détacher de la vente'),
        current: function () { var a = KiwiPosSale.attachedClient && KiwiPosSale.attachedClient(); return a ? a.id : null; },
        attach: function (c) { KiwiPosSale.attachClient(c); }, detach: function () { KiwiPosSale.attachClient(null); }
      };
      var S = window.KiwiCaisseSaleClient;
      if (S && S.available && S.available()) {
        var note = S.note();
        return {
          pos: false, on: tr('Ajouter à la note') + (note ? ' · ' + tr(note) : ''), off: tr('Retirer de la note') + (note ? ' · ' + tr(note) : ''),
          current: function () { return S.current(); },
          attach: function (c) { return S.attach(c); }, detach: function () { S.detach(); }
        };
      }
    } catch (_) {}
    return null;
  }
  function renderSalePill(c) {
    var pill = document.getElementById('kcb-salepill');
    if (!c || !POS_ATTACH.test(document.body.className)) { if (pill) pill.remove(); return; }
    if (!pill) {
      pill = document.createElement('div'); pill.id = 'kcb-salepill';
      pill.style.cssText = 'position:fixed;z-index:9000;top:calc(env(safe-area-inset-top,0px) + 10px);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 136px);padding:7px 8px 7px 14px;border-radius:999px;background:var(--riad,#053B2C);color:var(--paper,#F7F5F0);font-weight:600;font-size:.82rem;line-height:1.2;box-shadow:0 6px 18px -8px rgba(5,59,44,.55);';
      document.body.appendChild(pill);
    }
    pill.innerHTML = '<span style="color:var(--mint,#7DF2B0);display:inline-flex">' + ICON.users + '</span>' +
      '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span>Client de la vente</span> · ' + esc(c.name || '') + '</span>' +
      '<button type="button" aria-label="Détacher" style="border:0;background:rgba(247,245,240,.14);color:inherit;width:26px;height:26px;border-radius:999px;display:grid;place-items:center;cursor:pointer;flex:none">' + ICON.close + '</button>';
    var svgs = pill.querySelectorAll('svg'); for (var i = 0; i < svgs.length; i++) { svgs[i].style.width = '16px'; svgs[i].style.height = '16px'; }
    pill.querySelector('button').onclick = function () { try { KiwiPosSale.attachClient(null); } catch (_) {} };
  }
  window.addEventListener('kiwi:pos-sale-client', function (e) { renderSalePill(e.detail); });

  /* ── sheet (add / edit / detail) ───────────────────────────────────────── */
  function sheet(html) {
    var sh = document.getElementById('kcb-sheet');
    if (!sh) { sh = document.createElement('div'); sh.id = 'kcb-sheet'; document.body.appendChild(sh); }
    sh.innerHTML = '<div class="kcb-card">' + html + '</div>';
    sh.style.display = 'flex';
    sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
    return sh;
  }
  function closeSheet() { var sh = document.getElementById('kcb-sheet'); if (sh) sh.style.display = 'none'; }

  function genderOpts(v) {
    return ['', 'Femme', 'Homme', 'Autre'].map(function (g) {
      var lbl = g || '·';
      return '<option value="' + esc(g) + '"' + (v === g ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
  }
  function openForm(client) {
    var c = client || {};
    var editing = !!client;
    var hotel = hospitalityMode();
    var h = c.hospitality || {};
    var hospitalityFields = hotel ?
      '<div class="kcb-section">Profil hôtelier</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label for="kcb-f-doc-type">Type de pièce</label><select id="kcb-f-doc-type" class="kcb-select">' +
          ['', 'Passeport', 'CIN', 'Carte de séjour', 'Autre'].map(function (v) { return '<option value="' + esc(v) + '"' + (h.documentType === v ? ' selected' : '') + '>' + esc(v || 'Sélectionner') + '</option>'; }).join('') + '</select></div>' +
        '<div class="kcb-field"><label for="kcb-f-doc-number">Numéro passeport / ID</label><input id="kcb-f-doc-number" value="' + esc(h.documentNumber || '') + '" placeholder="N° du document" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label for="kcb-f-nationality">Nationalité</label><input id="kcb-f-nationality" value="' + esc(h.nationality || '') + '" placeholder="Marocaine, française…" autocomplete="off"></div>' +
        '<div class="kcb-field"><label for="kcb-f-language">Langue préférée</label><input id="kcb-f-language" value="' + esc(h.preferredLanguage || '') + '" placeholder="Français, العربية…" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-field"><label for="kcb-f-room">Préférences de chambre</label><input id="kcb-f-room" value="' + esc(h.roomPreferences || '') + '" placeholder="Étage calme, lit king, loin de l’ascenseur…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label for="kcb-f-food">Préférences de repas</label><input id="kcb-f-food" value="' + esc(h.foodPreferences || '') + '" placeholder="Végétarien, petit-déjeuner salé, thé sans sucre…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label for="kcb-f-allergies">Allergies</label><input id="kcb-f-allergies" value="' + esc(h.allergies || '') + '" placeholder="Arachides, gluten, aucune connue…" autocomplete="off"></div>' +
      '<div class="kcb-field"><label for="kcb-f-access">Besoins particuliers</label><input id="kcb-f-access" value="' + esc(h.accessibilityNeeds || '') + '" placeholder="Mobilité, lit bébé, accessibilité…" autocomplete="off"></div>' : '';
    sheet(
      '<h3>' + (editing ? (hotel ? 'Modifier le profil' : 'Modifier le client') : (hotel ? 'Nouveau profil client' : 'Nouveau client')) + '</h3>' +
      '<div class="kcb-sub">' + (editing ? esc(c.name || '') : (hotel ? 'Identité, préférences et attentions utiles pour le prochain séjour.' : 'Renseignez un maximum d’informations · elles nourrissent la fidélité et le marketing.')) + '</div>' +
      '<div class="kcb-field"><label for="kcb-f-name">Nom complet</label><input id="kcb-f-name" value="' + esc(c.name || '') + '" placeholder="Prénom Nom" autocomplete="off"></div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label for="kcb-f-phone">Téléphone</label><input id="kcb-f-phone" inputmode="tel" autocomplete="tel" value="' + esc(c.phone || '') + '" placeholder="06… / +33… / +49…"></div>' +
        '<div class="kcb-field"><label for="kcb-f-email">Email</label><input id="kcb-f-email" type="email" inputmode="email" value="' + esc(c.email || '') + '" placeholder="nom@email.com" autocomplete="off"></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label for="kcb-f-bday">Anniversaire</label><input id="kcb-f-bday" type="date" value="' + esc(c.birthday || '') + '"></div>' +
        '<div class="kcb-field"><label for="kcb-f-gender">Genre</label><select id="kcb-f-gender" class="kcb-select">' + genderOpts(c.gender || '') + '</select></div>' +
      '</div>' +
      '<div class="kcb-grid2">' +
        '<div class="kcb-field"><label for="kcb-f-city">Ville</label><input id="kcb-f-city" value="' + esc(c.city || '') + '" placeholder="Casablanca" autocomplete="off"></div>' +
        '<div class="kcb-field"><label for="kcb-f-address">Adresse</label><input id="kcb-f-address" value="' + esc(c.address || '') + '" placeholder="Quartier, rue…" autocomplete="off"></div>' +
      '</div>' +
      hospitalityFields +
      '<div class="kcb-field"><label for="kcb-f-notes">Notes internes</label><input id="kcb-f-notes" value="' + esc(c.notes || '') + '" placeholder="Informations utiles à l’équipe…" autocomplete="off"></div>' +
      '<div class="kcb-section">Communication</div>' +
      '<label class="kcb-consent"><input type="checkbox" id="kcb-f-consent" ' + (editing ? (c.consent ? 'checked' : '') : (hotel ? '' : 'checked')) + '>' +
        '<span>Accepte les messages <b>WhatsApp / SMS</b> (offres, fidélité).' + (hotel ? ' Optionnel et distinct de la fiche de séjour.' : ' Consentement requis · CNDP loi 09-08.') + '</span></label>' +
      '<label class="kcb-consent" style="margin-top:8px"><input type="checkbox" id="kcb-f-consent-email" ' + (c.consentEmail ? 'checked' : '') + '>' +
        /* « emails marketing » d'un seul tenant : coupé en deux nœuds, l'anglais
           reconstruisait « Accepts marketing emails marketing ». */
        '<span>Accepte les <b>emails marketing</b>.</span></label>' +
      '<div class="kcb-actions">' +
        (editing ? '<button data-activation=write class="kcb-btn danger" id="kcb-f-del" aria-label="Supprimer">' + ICON.trash + '</button>' : '') +
        '<button class="kcb-btn ghost" id="kcb-f-cancel">Annuler</button>' +
        '<button data-activation=write class="kcb-btn primary" id="kcb-f-save">' + (editing ? 'Enregistrer' : 'Ajouter') + '</button></div>'
    );
    var sh = document.getElementById('kcb-sheet');
    sh.querySelector('#kcb-f-cancel').onclick = closeSheet;
    if (editing) sh.querySelector('#kcb-f-del').onclick = function () {
      if (confirm((window.KiwiCaisseLang ? window.KiwiCaisseLang.tr : function (s) { return s; })(c.name ? 'Supprimer ' + c.name + ' ?' : 'Supprimer ce client ?'))) { KC.remove(c.id); closeSheet(); renderList(); ensureChip(); toast('Client supprimé'); }
    };
    var val = function (sel) { var e = sh.querySelector(sel); return e ? e.value.trim() : ''; };
    sh.querySelector('#kcb-f-save').onclick = function () {
      var name = val('#kcb-f-name'), phone = val('#kcb-f-phone'), email = val('#kcb-f-email');
      var consent = sh.querySelector('#kcb-f-consent').checked;
      if (!name && !phone) { toast('Renseignez au moins un nom ou un numéro'); return; }
      if (phone && window.KiwiPhone && !window.KiwiPhone.valid(phone)) { toast('Numéro invalide', 'Pour l’étranger, ajoutez + et l’indicatif pays.'); return; }
      if (!hotel && !consent) { toast('Le consentement est requis', 'Cochez la case WhatsApp / SMS pour enregistrer.'); return; }
      // dedup on phone when adding
      if (!editing && phone) {
        var dupe = KC.findByPhone(phone);
        if (dupe) { closeSheet(); openDetail(dupe.id); toast('Client déjà enregistré', dupe.name || phone); return; }
      }
      var rec = KC.upsert({
        id: editing ? c.id : '', name: name, phone: phone, email: email,
        birthday: val('#kcb-f-bday'), gender: val('#kcb-f-gender'), city: val('#kcb-f-city'),
        address: val('#kcb-f-address'), notes: val('#kcb-f-notes'),
        hospitality: hotel ? {
          documentType: val('#kcb-f-doc-type'), documentNumber: val('#kcb-f-doc-number'),
          nationality: val('#kcb-f-nationality'), preferredLanguage: val('#kcb-f-language'),
          roomPreferences: val('#kcb-f-room'), foodPreferences: val('#kcb-f-food'),
          allergies: val('#kcb-f-allergies'), accessibilityNeeds: val('#kcb-f-access'),
        } : (c.hospitality || {}),
        consent: consent, consentEmail: sh.querySelector('#kcb-f-consent-email').checked,
      });
      closeSheet(); renderList(); ensureChip();
      toast(editing ? 'Client mis à jour' : 'Client ajouté', rec.name || rec.phone);
      if (!editing) openDetail(rec.id);
    };
    setTimeout(function () { var f = sh.querySelector('#kcb-f-name'); if (f && !editing) f.focus(); }, 60);
  }

  function openDetail(id) {
    var c = KC.get(id); if (!c) { renderList(); return; }
    var cfg = KC.config();
    var seg = KC.segment(c);
    var prog = KC.progress(c, cfg);
    var rewardReady = prog >= 1;
    var progTxt, recordBlock;
    if (cfg.model === 'amount') {
      progTxt = fmt(c.points) + ' / ' + (cfg.amount.threshold || 100) + ' pts · récompense ' + esc(cfg.amount.reward || '');
      recordBlock = '<div class="kcb-record"><div class="rl">Enregistrer un achat</div><div class="kcb-recrow">' +
        '<input id="kcb-amt" inputmode="numeric" placeholder="Montant en MAD" >' +
        '<button data-activation=write class="kcb-big" id="kcb-rec">' + ICON.plus + 'Valider</button></div></div>';
    } else {
      var target = cfg.model === 'product' ? cfg.product.target : cfg.visit.target;
      var unit = cfg.model === 'product' ? (cfg.product.item || 'achat') : 'visite';
      // L'unité dans son propre nœud : « visites » se traduit, « cafés » (mot du
      // commerçant) traverse — le balayage ne voit qu'un mot à la fois.
      progTxt = (c.stamps || 0) + ' / ' + target + ' <span>' + esc(unit) + (target > 1 ? 's' : '') + '</span>';
      recordBlock = '<div class="kcb-record"><div class="rl">Ajouter un tampon</div><div class="kcb-recrow">' +
        '<button class="kcb-big" id="kcb-rec" style="flex:1;justify-content:center">' + ICON.plus + '+ 1 <span>' + esc(unit) + '</span></button></div></div>';
    }
    var infoRows = [];
    var hotel = hospitalityMode();
    var h = c.hospitality || {};
    if (c.email) infoRows.push(['Email', c.email]);
    if (c.city) infoRows.push(['Ville', c.city]);
    if (c.address) infoRows.push(['Adresse', c.address]);
    if (c.birthday) infoRows.push(['Anniversaire', c.birthday]);
    if (c.gender) infoRows.push(['Genre', c.gender]);
    if (hotel && h.nationality) infoRows.push(['Nationalité', h.nationality]);
    if (hotel && (h.documentType || h.documentNumber)) infoRows.push(['Passeport / ID', [h.documentType, h.documentNumber].filter(Boolean).join(' · ')]);
    if (hotel && h.preferredLanguage) infoRows.push(['Langue préférée', h.preferredLanguage]);
    if (hotel && h.roomPreferences) infoRows.push(['Préférences chambre', h.roomPreferences]);
    if (hotel && h.foodPreferences) infoRows.push(['Préférences repas', h.foodPreferences]);
    if (hotel && h.allergies) infoRows.push(['Allergies', h.allergies]);
    if (hotel && h.accessibilityNeeds) infoRows.push(['Besoins particuliers', h.accessibilityNeeds]);
    var consentTxt = [c.consent ? 'WhatsApp/SMS' : '', c.consentEmail ? 'Email' : ''].filter(Boolean).join(' · ');
    infoRows.push(['Consentement', consentTxt || 'Aucun']);
    var infoBlock = '<div class="kcb-info">' + infoRows.map(function (r) {
      return '<div class="kcb-inforow"><span class="k">' + esc(r[0]) + '</span><span class="v">' + esc(r[1]) + '</span></div>';
    }).join('') + '</div>';
    /* The sale this client can go on, at the top of the card where Shopify
       and Loyverse put it (owner, 26 Oct 2026): the POS verticals' next sale,
       or the restaurant till's note in progress. */
    var target = saleTarget();
    var isAttached = !!(target && target.current() === c.id);
    var attachBlock = target
      ? '<button class="kcb-btn ' + (isAttached ? 'ghost' : 'primary') + '" id="kcb-attach" style="display:block;width:100%;margin:0 0 14px">' +
          esc(isAttached ? target.off : target.on) + '</button>'
      : '';
    /* The note the team should read before serving: under the name, not in
       the list of details at the bottom, and written from here. */
    var noteBlock = '<div class="kcb-note" id="kcb-note"><div class="rl"><span>' + tr('Note pour l’équipe') + '</span>' +
        '<button type="button" class="kcb-link" id="kcb-note-edit">' + tr(c.notes ? 'Modifier' : 'Ajouter') + '</button></div>' +
      (c.notes ? '<div class="txt">' + esc(c.notes) + '</div>' : '<div class="txt muted">' + tr('Allergies, préférences, table habituelle…') + '</div>') + '</div>';
    var purchaseHistory = (Array.isArray(c.history) ? c.history : []).slice();
    var returns = localReturns();
    function renderHistory(page) {
    var total = purchaseHistory.length, start = page * 50;
    var historyBlock = '<div class="kcb-section">Historique des achats</div>' + (purchaseHistory.length
      ? '<div class="kcb-info">' + purchaseHistory.slice(start, start + 50).map(function (row) {
          var when = row.ts ? new Date(row.ts).toLocaleString((function (l) { return l === 'ar' ? 'ar-MA-u-nu-latn' : l === 'en' ? 'en-GB' : 'fr-FR'; })(typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : ''), { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : tr('Date inconnue');
          var rets = row.ref ? returns.filter(function (r) { return String(r.saleRef) === String(row.ref); }) : [];
          var back = {};
          rets.forEach(function (r) { (r.items || []).forEach(function (it) { back[it.name] = (back[it.name] || 0) + (Number(it.qty) || 1); }); });
          var items = Array.isArray(row.items) && row.items.length
            ? row.items.map(function (it) {
                var qty = it.qty || 1, gone = Math.min(qty, back[it.name] || 0);
                if (gone) back[it.name] -= gone;
                var label = esc(window.KiwiClientNumbers.quantity(qty) + '× ' + (it.name || 'Article'));
                return gone >= qty ? '<span class="kcb-struck">' + label + '</span>' : label;
              }).join(' · ')
            : esc(row.ref || 'Achat enregistré');
          var retLine = rets.map(function (r) {
            var what = (r.items || []).map(function (it) { return window.KiwiClientNumbers.quantity(it.qty ?? 1) + '× ' + (it.name || 'Article'); }).join(' · ');
            var kind = String(r.kind || '');
            var verb = kind === 'echange' ? 'Échangé' : 'Retourné';
            var how = kind.indexOf('avoir') === 0 ? 'avoir ' + (r.reference || '') : (kind.indexOf('refund') === 0 ? 'remboursé' : '');
            return '<span class="kcb-ret">' + verb + ' · ' + esc(what) + (how.trim() ? ' · ' + esc(how.trim()) : '') + ' · ' + fmt(r.amount || 0) + ' MAD</span>';
          }).join('');
          return '<div class="kcb-inforow"><span class="k">' + esc(when) + '<small style="display:block;margin-top:3px">' + esc(row.method || 'Mode non renseigné') + '</small></span><span class="v"><b>' + items + '</b><small style="display:block;margin-top:3px">' + esc(row.ref ? 'Ticket ' + row.ref + ' · ' : '') + fmt(row.amount || 0) + ' MAD</small>' + retLine + '</span></div>';
        }).join('') + '</div>'
      : '<div class="kcb-empty" style="min-height:90px"><b>Aucun détail d’achat enregistré</b><div>Les prochains tickets attachés à ce client apparaîtront ici.</div></div>');
    return historyBlock + (total > 50 ? '<div><button type="button" class="kcb-btn ghost" data-history-page="' + (page - 1) + '"' + (page === 0 ? ' disabled' : '') + '>' + esc(tr('Page précédente')) + '</button> <span aria-live="polite">' + (start + 1) + '–' + Math.min(start + 50, total) + ' / ' + total + '</span> <button type="button" class="kcb-btn ghost" data-history-page="' + (page + 1) + '"' + (start + 50 >= total ? ' disabled' : '') + '>' + esc(tr('Page suivante')) + '</button></div>' : '');
    }
    var historyBlock = '<div id="kcb-purchase-history">' + renderHistory(0) + '</div>';
    sheet(
      '<div class="kcb-dhead"><div class="kcb-av">' + esc(initials(c.name)) + '</div>' +
        '<div style="flex:1"><h3 style="margin:0">' + esc(c.name || 'Sans nom') + '</h3>' +
        '<div class="kcb-sub" style="margin:2px 0 0">' + esc(c.phone || '·') + ' · <span class="kcb-seg ' + seg + '">' + SEG_LBL[seg] + '</span></div></div>' +
        '<button class="kcb-x" id="kcb-d-close" aria-label="Fermer">' + ICON.close + '</button></div>' +
      /* La phrase fixe dans son propre nœud : la récompense qui suit est le texte
         du commerçant, elle doit traverser telle quelle. */
      (rewardReady ? '<div class="kcb-reward">' + ICON.gift + '<span>Récompense prête</span> · ' + esc((cfg.model === 'amount' ? cfg.amount.reward : (cfg.model === 'product' ? cfg.product.reward : cfg.visit.reward)) || '1 offert') + '</div>' : '') +
      attachBlock +
      noteBlock +
      '<div class="kcb-stat"><div class="kcb-progtxt">' + progTxt + '</div>' +
        '<div class="kcb-progwrap"><div class="kcb-progbar" style="width:' + Math.round(prog * 100) + '%"></div></div></div>' +
      '<div class="kcb-kpis">' +
        '<div class="kcb-kpi"><div class="v">' + (c.visits || 0) + '</div><div class="l">' + (hotel ? 'Séjours' : 'Visites') + '</div></div>' +
        '<div class="kcb-kpi"><div class="v">' + fmt(c.spend) + '</div><div class="l">Dépensé (MAD)</div></div>' +
        // « 3 j » et non « 3j » : l'abréviation doit être un mot à part pour se
        // traduire — collée au nombre elle se relisait « j3 » en arabe.
        '<div class="kcb-kpi"><div class="v">' + esc(lastSeenTxt(c)) + '</div><div class="l">Dernière visite</div></div></div>' +
      infoBlock +
      historyBlock +
      '<div id="kcb-credit-history"><div class="kcb-section">Avoirs</div><div class="kcb-empty" style="min-height:70px">Chargement du registre…</div></div>' +
      recordBlock +
      (rewardReady ? '<button class="kcb-btn primary" id="kcb-redeem" style="display:block;width:100%;margin-top:8px">Offrir la récompense · réinitialiser</button>' : '') +
      '<div class="kcb-actions"><button data-activation=write class="kcb-btn ghost" id="kcb-edit">Modifier</button>' +
        '<button class="kcb-btn ghost" id="kcb-d-back">Retour</button></div>'
    );
    var sh = document.getElementById('kcb-sheet');
    sh.querySelector('#kcb-purchase-history').onclick = function (e) {
      var button = e.target.closest('[data-history-page]');
      if (button && !button.disabled) this.innerHTML = renderHistory(Number(button.dataset.historyPage));
    };
    loadClientCredits(c.id, sh.querySelector('#kcb-credit-history'));
    sh.querySelector('#kcb-d-close').onclick = closeSheet;
    sh.querySelector('#kcb-d-back').onclick = closeSheet;
    sh.querySelector('#kcb-edit').onclick = function () { openForm(c); };
    var attachBtn = sh.querySelector('#kcb-attach');
    if (attachBtn) attachBtn.onclick = function () {
      if (isAttached) { target.detach(); openDetail(c.id); toast(tr(target.pos ? 'Client détaché de la vente' : 'Client retiré de la note')); return; }
      if (target.attach(c) === false) { toast(tr('Aucune note en cours')); return; }
      closeSheet(); close();
      /* The till's own attach already says « X attaché à la note ». */
      if (target.pos) toast(tr('Client attaché'), tr('Sa prochaine vente s’enregistre sur sa fiche.'));
    };
    sh.querySelector('#kcb-note-edit').onclick = function () {
      var box = sh.querySelector('#kcb-note');
      box.innerHTML = '<div class="rl"><label for="kcb-note-in">' + tr('Note pour l’équipe') + '</label></div>' +
        '<textarea id="kcb-note-in" maxlength="1000" placeholder="' + esc(tr('Allergies, préférences, table habituelle…')) + '">' + esc(c.notes || '') + '</textarea>' +
        '<div class="acts"><button type="button" class="kcb-btn primary" id="kcb-note-save">' + tr('Enregistrer') + '</button>' +
        '<button type="button" class="kcb-btn ghost" id="kcb-note-cancel">' + tr('Annuler') + '</button></div>';
      var ta = box.querySelector('#kcb-note-in');
      ta.focus();
      box.querySelector('#kcb-note-cancel').onclick = function () { openDetail(c.id); };
      box.querySelector('#kcb-note-save').onclick = function () {
        var v = ta.value.trim();
        if (v === String(c.notes || '').trim()) { openDetail(c.id); return; }
        KC.upsert({ id: c.id, notes: v });
        renderList(); openDetail(c.id);
        toast(tr(v ? 'Note enregistrée' : 'Note effacée'));
      };
    };
    sh.querySelector('#kcb-rec').onclick = function () {
      var amt = 0;
      if (cfg.model === 'amount') {
        var inp = sh.querySelector('#kcb-amt'); amt = parseInt(String(inp.value).replace(/\D/g, ''), 10) || 0;
        if (amt <= 0) { toast('Saisissez un montant'); inp.focus(); return; }
      }
      var res = KC.recordPurchase(c.id, { amount: amt, visit: 1 });
      renderList(); ensureChip();
      openDetail(c.id); // re-render with new totals
      toast('Achat enregistré', res && res.rewardReady ? '🎁 Récompense atteinte !' : (amt ? fmt(amt) + ' MAD' : '+1 tampon'));
    };
    var activeRedemption = redemptionRequests[KC.bookId() + ':' + c.id];
    if (rewardReady && activeRedemption && activeRedemption.pending) {
      sh.querySelector('#kcb-redeem').disabled = true;
      sh.querySelector('#kcb-redeem').textContent = window.KiwiCaisseLang ? window.KiwiCaisseLang.tr('Confirmation en cours…') : 'Confirmation en cours…';
    }
    if (rewardReady) sh.querySelector('#kcb-redeem').onclick = function () {
      var book = KC.bookId(), key = book + ':' + c.id;
      var request = redemptionRequests[key];
      if (request && request.pending) return;
      if (!request) request = redemptionRequests[key] = { ref: KC.redemptionRef(c.id), clientId: c.id };
      request.pending = true;
      var button = this;
      button.disabled = true;
      button.textContent = window.KiwiCaisseLang ? window.KiwiCaisseLang.tr('Confirmation en cours…') : 'Confirmation en cours…';
      return KC.reserveRedemption(c.id, book, request).catch(function () {
        return { accepted: false, refused: false };
      }).then(function (result) {
        request.pending = false;
        delete redemptionRequests[key];
        /* Server unreachable (offline, demo book, network error): the customer is
           at the counter, so the reward is given and queued under the same ref,
           which the server accepts once and refuses on a second till. */
        var queued = !result.accepted && !result.refused;
        if (result.accepted) KC.redeem(c.id, book, result);
        else if (queued) KC.redeem(c.id, book, { ref: request.ref });
        renderList(); openDetail(c.id);
        toast(result.refused ? 'Récompense refusée' : 'Récompense offerte',
          result.accepted ? 'Carte réinitialisée.' : result.refused ? 'La carte est conservée.' : 'Carte réinitialisée. Confirmation au retour du réseau.');
      });
    };
  }

  /* ── native "Clients" entry, injected into every till's own chrome ───────── */
  // One implementation, every store type: for each vertical rail (<nav class="XX-nav">)
  // we redirect its existing client button to the carnet, or inject a native-looking
  // "Clients" item; for the restaurant caisse we add a "Clients" pill to .act-selector.
  /* ── le rail doit montrer où l'on est ────────────────────────────────────
     Le carnet détourne l'entrée « Clientes » du métier (capture +
     stopImmediatePropagation) : le vertical ne bascule donc jamais son propre
     état sélectionné, et le rail continuait d'éclairer la page précédente
     pendant qu'on lisait le carnet. On pose le marqueur nous-mêmes, avec le
     mot exact que ce rail-là emploie pour ses autres pages — et on le rend en
     partant, pour ne pas laisser deux entrées allumées si on sort par Échap. */
