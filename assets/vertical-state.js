/* Kiwi Vertical State — shared persistence shell for specialist caisses.
 * A vertical registers a pure snapshot/restore pair. The shell hydrates before
 * first render, detects meaningful domain changes, writes locally immediately,
 * and mirrors the document per merchant through KiwiStore/CloudDoc. UI-only
 * route, modal, query and focus state must stay out of each snapshot. */
(function () {
  'use strict';

  /* ── Réseau du comptoir : ce que le terminal SAIT, pas ce qu'un bouton prétend ──
   * Onze métiers affichaient une pastille « En ligne / Hors-ligne » qu'un tap
   * basculait à la main, puis annonçaient « Réseau de retour, 3 actions
   * synchronisées » : un drapeau local avait changé, rien n'avait été envoyé ni
   * vérifié. Les ventes partent réellement par la file de live-link
   * (kiwiSaleQueue, rejouée au retour du réseau), c'est donc elle, et
   * navigator.onLine, que le terminal doit montrer.
   *
   * Défini AVANT la garde KiwiStore ci-dessous : l'état du réseau ne dépend pas
   * du stockage des fiches, et un métier doit pouvoir le lire même si ce
   * dernier ne s'est pas chargé. Rétro-compatible : aucun module existant ne
   * l'appelle encore. */
  var netWatchers = [];
  var netBound = false;
  function netStatus(snapshot) {
    var q = snapshot || null;
    if (!q) { try { q = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus(); } catch (_) { q = null; } }
    q = q || {};
    var storageError = !!q.storageError;
    var blocked = (+q.blocked || 0) > 0 || storageError;
    return {
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
      queued: Math.max(0, +q.pending || 0),
      blocked: blocked,
      storageError: storageError,
    };
  }
  function netEmit(snapshot) {
    var st = netStatus(snapshot);
    netWatchers.slice().forEach(function (fn) { try { fn(st); } catch (_) {} });
  }
  function netWatch(fn) {
    if (typeof fn !== 'function') return function () {};
    netWatchers.push(fn);
    if (!netBound && typeof window !== 'undefined' && window.addEventListener) {
      netBound = true;
      window.addEventListener('online', function () { netEmit(); });
      window.addEventListener('offline', function () { netEmit(); });
      window.addEventListener('kiwi:sale-queue', function (e) { netEmit(e && e.detail); });
      window.addEventListener('storage', function (e) { if (!e || e.key === 'kiwiSaleQueue') netEmit(); });
    }
    return function () { netWatchers = netWatchers.filter(function (x) { return x !== fn; }); };
  }
  /* La phrase que le tap sur la pastille doit dire, vraie à l'instant T. */
  function netSay(st) {
    st = st || netStatus();
    if (st.blocked) return 'Synchronisation bloquée, les ventes restent sur cette caisse. Contactez le support.';
    if (st.offline) return 'Pas de réseau, les ventes restent sur cette caisse et partiront au retour de la connexion.';
    if (st.queued) return st.queued + ' vente' + (st.queued > 1 ? 's' : '') + ' en cours d’envoi au serveur.';
    return 'Caisse en ligne, aucune vente en attente d’envoi.';
  }
  /* Message d'un CHANGEMENT d'état (réseau perdu / revenu), ou '' s'il n'y en a pas.
   * « Réseau de retour, 3 actions synchronisées » se disait dès que le navigateur
   * repassait en ligne, alors que la file d'envoi ne faisait que commencer à se
   * vider : on dit ce qui est vrai à cet instant, « en cours d'envoi ». Sur un
   * terminal appairé, caisse-pwa.js avale déjà le tap sur la pastille et la
   * rejoue depuis navigator.onLine : c'est donc ce message, pas un tap, qui
   * informe le caissier. */
  function netChange(wasOffline, st) {
    st = st || netStatus();
    if (!!wasOffline === !!st.offline) return '';
    if (st.offline) return 'Pas de réseau, les ventes restent sur cette caisse et partiront au retour de la connexion.';
    if (st.blocked) return 'Réseau de retour, mais la synchronisation est bloquée. Contactez le support.';
    return st.queued
      ? 'Réseau de retour, ' + st.queued + ' vente' + (st.queued > 1 ? 's' : '') + ' en cours d’envoi.'
      : 'Réseau de retour.';
  }
  window.KiwiVerticalNet = { status: netStatus, watch: netWatch, say: netSay, change: netChange };

  /* ── La carte du commerçant, lue par les caisses de métier ───────────────────
   * Pizzeria, fast-food, boulangerie, traiteur et food truck vendaient une carte
   * écrite dans leur propre fichier (pos-*.js) : des prix et des produits de
   * démo. Le commerçant composait pourtant sa vraie carte dans « Menu » du
   * tableau de bord (assets/restaurant-menu-workspace.js, publiée sur /api/menu)
   * et la caisse restaurant la lit déjà (kiwi-caisse.html · fetchCarte, miroir
   * `kiwi:menuMirror:v1:<slug>`, relu toutes les 6 s). Ces cinq caisses ne la
   * lisaient pas : une vraie pizzeria encaissait la Margherita à 45 MAD parce que
   * la démo le dit, quoi que son patron ait saisi.
   *
   * Ce module est le pont : même miroir, même projection, aucun second document.
   * Il ne sert QUE les magasins réels ; une démo garde sa carte de démo.
   * Une carte vide n'est pas une carte de démo : la caisse le dit, et laisse le
   * caissier taper un montant (voir freePrice). */
  var CARTE_MIRROR = 'kiwi:menuMirror:v1:';
  function carteSlug() {
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return String(pm);
      }
    } catch (_) {}
    var p = pairedVenue();
    return p && p.merchant ? String(p.merchant) : '';
  }
  function carteRaw() {
    var slug = carteSlug();
    if (!slug) return '';
    try { return localStorage.getItem(CARTE_MIRROR + slug) || ''; } catch (_) { return ''; }
  }
  function carteMoney(n) {
    var v = Math.round((+n || 0) * 100) / 100;
    var s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace('.', ',');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' MAD';
  }
  /* La projection : ce que ces caisses savent vendre. Une formule (menu à choix
   * par étape) n'est pas vendable ici : on la compte, la caisse le dit, et
   * personne ne la prend pour un produit simple à son prix de base. */
  function readCarte() {
    var out = { real: false, slug: '', items: [], cats: [], skipped: { formulas: 0, unavailable: 0 }, published: false, sig: '' };
    if (!real()) return out;
    out.real = true; out.slug = carteSlug();
    var raw = carteRaw();
    if (!raw) return out;
    out.sig = raw.length + ':' + hash(raw);
    var d = null;
    try { d = JSON.parse(raw); } catch (_) { d = null; }
    if (!d || !Array.isArray(d.items)) return out;
    out.published = true;
    var catName = Object.create(null), catStation = Object.create(null), stationName = Object.create(null);
    (Array.isArray(d.stations) ? d.stations : []).forEach(function (st) { if (st && st.id && st.name) stationName[st.id] = String(st.name); });
    /* Le poste qui reçoit ce que la catégorie n'envoie nulle part : celui que le
     * commerçant a nommé « cuisine », sinon le premier de sa liste. */
    var kitchen = stationName[d.kitchenId] ? String(d.kitchenId) : (Object.keys(stationName)[0] || '');
    (Array.isArray(d.cats) ? d.cats : []).forEach(function (c) {
      if (!c || !c.id) return;
      catName[c.id] = String(c.name || '');
      catStation[c.id] = stationName[c.station] ? String(c.station) : kitchen;
      out.cats.push({ id: String(c.id), name: String(c.name || '') });
    });
    var groups = Object.create(null);
    (Array.isArray(d.opts) ? d.opts : []).forEach(function (g) {
      if (!g || !g.id || !g.name || !Array.isArray(g.choices)) return;
      var choices = g.choices.filter(function (c) { return c && c.id && c.name; })
        .map(function (c) { return { id: String(c.id), name: String(c.name), price: Math.max(0, +c.price || 0) }; });
      if (!choices.length) return;
      groups[g.id] = { id: String(g.id), name: String(g.name), kind: g.kind === 'many' ? 'many' : 'one', required: !!g.required, choices: choices };
    });
    d.items.forEach(function (it) {
      if (!it || !it.id || !it.name || it.archived || it.formulaOnly) return;
      if (it.formula) { out.skipped.formulas++; return; }
      if (it.avail === false) { out.skipped.unavailable++; return; }
      out.items.push({
        id: String(it.id), name: String(it.name), price: Math.max(0, +it.price || 0),
        desc: String(it.desc || ''), catId: it.catId ? String(it.catId) : '', catName: catName[it.catId] || '',
        station: stationName[catStation[it.catId] || kitchen] || '',
        groups: (Array.isArray(it.opts) ? it.opts : []).map(function (gid) { return groups[gid]; }).filter(Boolean),
      });
    });
    return out;
  }
  var carteSubs = [], carteTimer = 0, carteLast = null;
  function carteTick(force) {
    var cur = real() ? (carteSlug() + '|' + carteRaw().length + ':' + hash(carteRaw())) : '';
    if (!force && cur === carteLast) return;
    carteLast = cur;
    var snap = readCarte();
    carteSubs.slice().forEach(function (fn) { try { fn(snap); } catch (_) {} });
  }
  function carteWatch(fn) {
    if (typeof fn !== 'function') return function () {};
    carteSubs.push(fn);
    if (carteLast == null) carteLast = real() ? (carteSlug() + '|' + carteRaw().length + ':' + hash(carteRaw())) : '';
    if (!carteTimer) {
      carteTimer = setInterval(function () { carteTick(false); }, 2500);
      window.addEventListener('storage', function (e) { if (!e || !e.key || String(e.key).indexOf(CARTE_MIRROR) === 0) carteTick(false); });
      document.addEventListener('kiwi-paired', function () { carteTick(false); });
    }
    return function () { carteSubs = carteSubs.filter(function (x) { return x !== fn; }); };
  }

  /* ── Les options de la carte (groupes à un choix ou à plusieurs, avec supplément) ──
   * Un seul rendu pour les cinq caisses : une feuille propre à chacune ferait
   * cinq lectures différentes de la même règle « obligatoire », « un seul
   * choix ». Le prix d'une ligne = prix de la carte + suppléments choisis,
   * calculé ici, jamais ailleurs. */
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function pickedOf(groups, picks, gid) {
    var g = (groups || []).filter(function (x) { return x.id === gid; })[0];
    var ids = (picks && picks[gid]) || [];
    return g ? g.choices.filter(function (c) { return ids.indexOf(c.id) >= 0; }) : [];
  }
  function optionsExtra(groups, picks) {
    var sum = 0;
    (groups || []).forEach(function (g) { pickedOf(groups, picks, g.id).forEach(function (c) { sum += c.price; }); });
    return Math.round(sum * 100) / 100;
  }
  function optionsMissing(groups, picks) {
    var g = (groups || []).filter(function (x) { return x.required && !pickedOf(groups, picks, x.id).length; })[0];
    return g ? g.name : '';
  }
  function optionsNames(groups, picks) {
    var out = [];
    (groups || []).forEach(function (g) { pickedOf(groups, picks, g.id).forEach(function (c) { out.push(c.name); }); });
    return out;
  }
  function optionsStamp(groups, picks, qty) {
    var out = [];
    (groups || []).forEach(function (g) { pickedOf(groups, picks, g.id).forEach(function (c) { out.push({ id: c.id, qty: qty || 1 }); }); });
    return out;
  }
  function optionsToggle(groups, picks, gid, cid) {
    var g = (groups || []).filter(function (x) { return x.id === gid; })[0];
    if (!g) return picks;
    var cur = ((picks && picks[gid]) || []).slice();
    var at = cur.indexOf(cid);
    if (g.kind === 'many') { if (at >= 0) cur.splice(at, 1); else cur.push(cid); }
    else cur = (at >= 0 && !g.required) ? [] : [cid];
    picks[gid] = cur;
    return picks;
  }
  function optionsHtml(groups, picks) {
    css();
    return (groups || []).map(function (g) {
      var sel = (picks && picks[g.id]) || [];
      return '<div class="vc-grp"><div class="vc-grp-t">' + escHtml(g.name) +
        '<span class="vc-grp-k">' + (g.kind === 'many' ? 'plusieurs choix' : 'un choix') + (g.required ? ' · obligatoire' : '') + '</span></div><div class="vc-chs">' +
        g.choices.map(function (c) {
          var on = sel.indexOf(c.id) >= 0;
          return '<button type="button" class="vc-ch' + (on ? ' on' : '') + '" data-vc-g="' + escHtml(g.id) + '" data-vc-c="' + escHtml(c.id) + '" aria-pressed="' + on + '">' +
            escHtml(c.name) + (c.price ? '<small>+' + carteMoney(c.price) + '</small>' : '') + '</button>';
        }).join('') + '</div></div>';
    }).join('');
  }
  function css() {
    if (document.getElementById('vc-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-css';
    st.textContent =
      '.vc-grp{margin:12px 0}.vc-grp-t{font:600 12px/1.2 var(--sans,Inter Tight,sans-serif);letter-spacing:.02em;color:var(--ink,#0A0F0D);margin-bottom:7px}' +
      '.vc-grp-k{font-weight:500;color:rgba(10,15,13,.55);margin-inline-start:8px}' +
      '.vc-chs{display:flex;flex-wrap:wrap;gap:7px}' +
      '.vc-ch{display:inline-flex;align-items:baseline;gap:7px;padding:9px 13px;border-radius:10px;border:1px solid rgba(10,15,13,.16);background:#fff;color:var(--ink,#0A0F0D);font:600 13px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer}' +
      '.vc-ch small{font:500 11px/1 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.6)}' +
      '.vc-ch.on{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:#fff}.vc-ch.on small{color:rgba(255,255,255,.8)}' +
      '.vc-veil{position:fixed;inset:0;z-index:10040;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,15,13,.55)}' +
      '.vc-sheet{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(5,59,44,.35)}' +
      '.vc-sheet-h{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:6px}' +
      '.vc-sheet-h b{display:block;font:600 18px/1.25 var(--sans,Inter Tight,sans-serif)}.vc-sheet-h span{display:block;margin-top:2px;font:400 12.5px/1.4 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.6)}' +
      '.vc-sheet-h i{font:600 18px/1.25 var(--sans,Inter Tight,sans-serif);font-style:normal;white-space:nowrap;color:var(--atlas,#0B6E4F)}' +
      '.vc-err{margin:10px 0 0;padding:9px 12px;border-radius:9px;background:rgba(194,74,46,.1);color:#9a2f16;font:600 12.5px/1.3 var(--sans,Inter Tight,sans-serif)}.vc-err[hidden]{display:none}' +
      '.vc-sheet-f{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}' +
      '.vc-b1,.vc-b2{padding:13px 20px;border-radius:11px;font:600 14px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer;border:1px solid transparent}' +
      '.vc-b1{background:var(--atlas,#0B6E4F);color:#fff}.vc-b2{background:transparent;border-color:rgba(10,15,13,.2);color:var(--ink,#0A0F0D)}' +
      '.vc-note{margin:12px 2px 0;font:400 12px/1.45 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.6)}' +
      '.vc-free{margin:14px 0;padding:14px;border:1px dashed rgba(10,15,13,.28);border-radius:12px;background:rgba(11,110,79,.05)}' +
      '.vc-free b{display:block;font:600 14px/1.3 var(--sans,Inter Tight,sans-serif);margin-bottom:4px}.vc-free p{margin:0 0 10px;font:400 12.5px/1.45 var(--sans,Inter Tight,sans-serif);color:rgba(10,15,13,.7)}' +
      '.vc-free-row{display:flex;gap:8px;flex-wrap:wrap}.vc-free input{flex:1 1 130px;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid rgba(10,15,13,.2);font:500 14px/1 var(--sans,Inter Tight,sans-serif);background:#fff}' +
      '.vc-free button{padding:10px 16px;border-radius:9px;border:0;background:var(--atlas,#0B6E4F);color:#fff;font:600 13px/1 var(--sans,Inter Tight,sans-serif);cursor:pointer}';
    document.head.appendChild(st);
  }
  /* « Pas de carte » : une carte vide ne se remplit pas de prix de démo. Le bloc
   * dit où composer la carte et laisse taper un article et son prix, la seule
   * façon honnête d'encaisser en attendant. `onAdd({name, price})` est appelé
   * avec un nom (jamais vide) et un prix > 0. */
  function freePriceHtml(opts) {
    css();
    opts = opts || {};
    return '<div class="vc-free" data-vc-free><b>' + escHtml(opts.title || 'Aucune carte enregistrée') + '</b><p>' +
      escHtml(opts.hint || 'Composez-la dans le tableau de bord, rubrique Menu. En attendant, saisissez l’article et son prix.') + '</p>' +
      '<div class="vc-free-row"><input type="text" data-vc-free-name maxlength="60" placeholder="' + escHtml(opts.namePh || 'Article') + '" aria-label="Article">' +
      '<input type="number" data-vc-free-price min="0" step="0.5" inputmode="decimal" placeholder="Prix MAD" aria-label="Prix en MAD">' +
      '<button type="button" data-vc-free-add>' + escHtml(opts.cta || 'Ajouter') + '</button></div></div>';
  }
  function freePriceBind(host, onAdd) {
    if (!host || host.__vcFree) return;
    host.__vcFree = true;
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-vc-free-add]');
      if (!b) return;
      var box = b.closest('[data-vc-free]');
      var name = String((box.querySelector('[data-vc-free-name]').value || '')).trim().slice(0, 60);
      var price = Math.round((+String(box.querySelector('[data-vc-free-price]').value).replace(',', '.') || 0) * 100) / 100;
      if (!name) name = 'Article';
      if (!(price > 0)) { box.querySelector('[data-vc-free-price]').focus(); return; }
      box.querySelector('[data-vc-free-name]').value = '';
      box.querySelector('[data-vc-free-price]').value = '';
      onAdd({ name: name, price: price });
    });
  }
  /* La feuille d'options d'un article de la carte. Les cinq caisses n'ont pas la
   * même grille, mais « Cuisson : un choix obligatoire » se pose pareil
   * partout : ce rendu est donc partagé. `opts` = { title, sub, price, groups,
   * picks?, cta?, onConfirm({ picks, unit, extra, names, stamp(qty) }) }. */
  var sheetOpen = null;
  function sheet(opts) {
    css();
    if (sheetOpen) sheetOpen();
    var groups = opts.groups || [];
    var picks = {};
    Object.keys(opts.picks || {}).forEach(function (k) { picks[k] = (opts.picks[k] || []).slice(); });
    var veil = document.createElement('div');
    veil.className = 'vc-veil';
    veil.setAttribute('role', 'dialog'); veil.setAttribute('aria-modal', 'true');
    document.body.appendChild(veil);
    function unit() { return Math.round(((+opts.price || 0) + optionsExtra(groups, picks)) * 100) / 100; }
    function paint(keepScroll) {
      var top = keepScroll && veil.querySelector('.vc-sheet') ? veil.querySelector('.vc-sheet').scrollTop : 0;
      veil.innerHTML = '<div class="vc-sheet"><div class="vc-sheet-h"><div><b>' + escHtml(opts.title || '') + '</b>' +
        (opts.sub ? '<span>' + escHtml(opts.sub) + '</span>' : '') + '</div><i data-vc-total>' + carteMoney(unit()) + '</i></div>' +
        optionsHtml(groups, picks) +
        '<div class="vc-err" data-vc-err hidden></div>' +
        '<div class="vc-sheet-f"><button type="button" class="vc-b2" data-vc-cancel>Annuler</button><button type="button" class="vc-b1" data-vc-ok>' +
        escHtml(opts.cta || 'Ajouter') + ' · ' + carteMoney(unit()) + '</button></div></div>';
      if (top) veil.querySelector('.vc-sheet').scrollTop = top;
    }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      if (veil.parentNode) veil.parentNode.removeChild(veil);
      if (sheetOpen === close) sheetOpen = null;
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    veil.addEventListener('click', function (e) {
      if (e.target === veil || (e.target.closest && e.target.closest('[data-vc-cancel]'))) { close(); return; }
      var ch = e.target.closest && e.target.closest('[data-vc-g]');
      if (ch) { optionsToggle(groups, picks, ch.getAttribute('data-vc-g'), ch.getAttribute('data-vc-c')); paint(true); return; }
      if (e.target.closest && e.target.closest('[data-vc-ok]')) {
        var miss = optionsMissing(groups, picks);
        if (miss) {
          var er = veil.querySelector('[data-vc-err]');
          er.textContent = 'Choisissez : ' + miss; er.hidden = false;
          return;
        }
        var result = {
          picks: picks, unit: unit(), extra: optionsExtra(groups, picks), names: optionsNames(groups, picks),
          stamp: function (qty) { return optionsStamp(groups, picks, qty); },
        };
        close();
        try { opts.onConfirm(result); } catch (_) {}
      }
    });
    document.addEventListener('keydown', onKey, true);
    sheetOpen = close;
    paint(false);
    var first = veil.querySelector('.vc-ch'); if (first) { try { first.focus(); } catch (_) {} }
    return close;
  }
  window.KiwiVerticalCarte = {
    sheet: sheet,
    read: readCarte, watch: carteWatch, money: carteMoney,
    optionsHtml: optionsHtml, toggle: optionsToggle, extra: optionsExtra, missing: optionsMissing,
    names: optionsNames, stamp: optionsStamp,
    freePriceHtml: freePriceHtml, freePriceBind: freePriceBind,
  };

  if (!window.KiwiStore?.define) return;

  var handles = new Map();
  function pairedVenue(value) {
    if (value && typeof value === 'object') return value;
    try {
      return (window.KiwiPlatform && typeof window.KiwiPlatform.pairedVenue === 'function' && window.KiwiPlatform.pairedVenue())
        || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return null; }
  }
  /* The caisse deliberately does not load venues.js.  Consequently the venue
   * store's implicit currentVenue() is null there: every get()/update() without
   * an id used to read a blank document and silently drop the write.  A pairing
   * carries the server identity already, so use that identity explicitly.  The
   * merchant slug is stable across devices; venueId is retained for older
   * pairings that pre-date it. */
  function venueKey(value) {
    if (!value) {
      try {
        if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
          var pm = window.KiwiPlatform.pairedMerchant();
          if (pm) return pm;
        }
      } catch (_) {}
    }
    var p = pairedVenue(value);
    var id = p && (p.merchant || p.venueId || p.id);
    if (id) return String(id);
    try { return String(window.KiwiStore.currentVenue?.() || ''); } catch (_) { return ''; }
  }
  function real() {
    try { if (window.KiwiEnv?.isReal?.()) return true; } catch (_) {}
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.isPaired === 'function' && window.KiwiPlatform.isPaired()) return true;
      return !!JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
    } catch (_) { return false; }
  }
  function copy(v) { try { return JSON.parse(JSON.stringify(v)); } catch (_) { return null; } }
  function device() {
    var k = 'kiwi:verticalops:device'; var d = '';
    try { d = localStorage.getItem(k) || ''; } catch (_) {}
    if (!d) { d = 'terminal-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(k, d); } catch (_) {} }
    return d;
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  var store = window.KiwiStore.define('verticalops', {
    cloud: 'verticalops',
    blank: function () { return { verticals: {}, commands: [], seq: 0 }; },
    isEmpty: function (d) { return !d || !Object.keys(d.verticals || {}).length; },
    merge: function (mine, theirs) {
      var out = { verticals: {}, commands: [], seq: Math.max(+(mine?.seq || 0), +(theirs?.seq || 0)) };
      var a = mine?.verticals || {}, b = theirs?.verticals || {};
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(function (k) {
        var x = a[k], y = b[k]; out.verticals[k] = !y || +(x?.updatedAt || 0) >= +(y?.updatedAt || 0) ? x : y;
      });
      var seen = new Set();
      (theirs?.commands || []).concat(mine?.commands || []).sort(function (x, y) { return +(x.at || 0) - +(y.at || 0); }).forEach(function (c) {
        if (!c?.id || seen.has(c.id)) return; seen.add(c.id); out.commands.push(c);
      });
      out.commands = out.commands.slice(-300);
      return out;
    },
    onRefused: function (reason) {
      try {
        window.Kiwi?.toast?.('Synchronisation métier refusée', {
          type: 'error', force: true,
          desc: reason === 'string-too-long'
            ? 'Une photo est trop volumineuse. Réessayez avec une image plus légère.'
            : 'Les données restent sur cet appareil. Réessayez après avoir allégé le dossier.',
        });
      } catch (_) {}
    },
  });

  /* ── Les réglages de caisse du métier (functions/api/store.js · `foodtrade`) ──
   * Ce que la carte ne dit pas : frais de livraison par zone, supplément
   * moitié-moitié (pizzeria) ; tarif des extras d'un devis et échéancier par
   * défaut (traiteur) ; prix des gâteaux sur commande (boulangerie). Le
   * propriétaire écrit depuis « Menu · Caisse » ; la caisse appairée lit. Un
   * réglage absent n'est pas un réglage par défaut : la caisse le dit et
   * demande la valeur au caissier. */
  var tradeStore = window.KiwiStore.define('foodtrade', {
    cloud: 'foodtrade',
    blank: function () { return {}; },
    isEmpty: function (d) {
      return !d || !Object.keys(d).some(function (k) {
        return d[k] && typeof d[k] === 'object' && Object.keys(d[k]).some(function (x) { return x !== 'updatedAt'; });
      });
    },
    merge: function (mine, theirs) {
      var out = {};
      var a = mine || {}, b = theirs || {};
      new Set(Object.keys(a).concat(Object.keys(b))).forEach(function (k) {
        var x = a[k], y = b[k];
        out[k] = !y || +(x && x.updatedAt || 0) >= +(y.updatedAt || 0) ? x : y;
      });
      return out;
    },
  });
  window.KiwiVerticalSettings = {
    get: function (trade) {
      /* Le tableau de bord a son moteur de venues (currentVenue) ; la caisse n'en
       * a pas et lit sous l'identité de son appairage. Un appairage resté dans le
       * navigateur d'un autre commerce ne doit jamais répondre à la place du
       * tableau de bord. */
      var vid = window.KiwiVenue ? undefined : venueKey();
      var d = tradeStore.get(vid || undefined) || {};
      var t = d[trade];
      return t && typeof t === 'object' ? t : {};
    },
    set: function (trade, patch) {
      return tradeStore.update(function (d) {
        d = d && typeof d === 'object' ? d : {};
        d[trade] = Object.assign({}, d[trade] || {}, patch || {}, { updatedAt: Date.now() });
        return d;
      });
    },
    subscribe: function (fn) { return tradeStore.subscribe(fn); },
    store: tradeStore,
  };

  function open(name, spec) {
    name = String(name || '').trim().toLowerCase();
    if (!name || !spec?.snapshot || !spec?.restore) return null;
    if (handles.has(name)) return handles.get(name);
    var hydrated = false, applying = false, saving = false, last = '', timer = 0;
    var activeVenue = venueKey();
    var baseline = copy(spec.snapshot());
    function signature(data) { try { return JSON.stringify(data); } catch (_) { return ''; } }
    function restore(data) {
      applying = true;
      try { spec.restore(copy(data)); } finally { applying = false; }
    }
    function selectVenue(value) {
      var next = venueKey(value);
      if (next === activeVenue) return false;
      /* Never let tenant A's closure-level arrays become tenant B's first
       * autosave.  Restore the pristine module state before looking up B. */
      restore(baseline);
      activeVenue = next;
      hydrated = false;
      last = '';
      return true;
    }
    function hydrate() {
      selectVenue();
      if (hydrated) return false;
      /* Pas encore réel, ou pas encore de commerce : on N'est PAS hydraté.
       * Verrouiller hydrated=true ici faisait qu'un terminal dont l'identité
       * arrivait une seconde plus tard (KiwiMe, appairage) n'allait jamais lire
       * sa fiche enregistrée, puis écrasait celle-ci par les valeurs par
       * défaut du module au premier changement. save() attend le réel. */
      if (!real() || !activeVenue) return false;
      var row = store.get(activeVenue)?.verticals?.[name];
      if (row?.data) restore(row.data);
      var current = copy(spec.snapshot()); last = signature(current); hydrated = true; return !!row?.data;
    }
    function save(label) {
      selectVenue();
      if (!real() || !activeVenue || applying) return false;
      if (!hydrated) hydrate();
      var data = copy(spec.snapshot()); if (!data) return false;
      var sig = signature(data); if (!sig || sig === last) return false;
      var now = Date.now(), dev = device();
      saving = true;
      try {
        store.update(function (d) {
          d.verticals ||= {}; d.commands ||= []; d.seq = (+d.seq || 0) + 1;
          var command = { id: `${dev}-${d.seq}-${hash(sig)}`, vertical: name, label: String(label || 'state-change').slice(0, 80), at: now, device: dev, hash: hash(sig) };
          d.verticals[name] = { schema: +(spec.schema || 1), updatedAt: now, device: dev, commandId: command.id, data: data };
          d.commands.push(command); d.commands = d.commands.slice(-300); return d;
        }, activeVenue);
      } finally { saving = false; }
      last = sig; return true;
    }
    function rebind(value) {
      if (!selectVenue(value)) return false;
      hydrate();
      return true;
    }
    function start() {
      hydrate(); if (!timer) timer = setInterval(function () { save('autosave'); }, 1500);
    }
    var api = { hydrate: hydrate, save: save, start: start, rebind: rebind, venue: function () { return activeVenue; }, store: store };
    handles.set(name, api);
    store.subscribe(function (vid) {
      if (saving || applying || String(vid || '') !== activeVenue) return;
      var row = store.get(activeVenue)?.verticals?.[name];
      if (!row?.data) return;
      restore(row.data);
      last = signature(copy(spec.snapshot()));
      try { window.KiwiPosDispatch?.repaint?.(); } catch (_) {}
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else setTimeout(start, 0); /* let a lazily loaded vertical finish declaring its domain constants */
    window.addEventListener('pagehide', function () { save('pagehide'); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save('hidden'); });
    return api;
  }

  window.KiwiVerticalState = {
    open: open,
    register: function (spec) { return open(spec?.vertical, spec); },
    store: store,
    isReal: real,
  };
  document.addEventListener('kiwi-paired', function (event) {
    handles.forEach(function (handle) { try { handle.rebind(event && event.detail); } catch (_) {} });
  });
})();
