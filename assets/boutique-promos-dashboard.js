/* Kiwi · Boutique promotions manager — owner dashboard only.
 * The price engine stays in assets/promos.js and is read by the caisse. This
 * file owns the create/edit/pause/delete UI that used to live in the till. */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;

  var K = window.Kiwi;
  var H = K.handlers;
  var DAY = 86400000;
  var filter = 'active';
  var subscribed = false;
  var promoModal = null;
  var composer = { draft: null, editing: null };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var money = function (n) { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(+n || 0)) + ' MAD'; };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtDay = function (d) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); };
  var fmtHM = function (d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  var startOfDay = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  var endOfDay = function (d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };
  var toInput = function (ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  var icons = function () { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} };

  function CAT() { return window.KiwiBoutiqueCatalog; }
  function PRM() { return window.KiwiPromos; }
  function venueKey() { return window.KiwiBoutiqueVenueKey ? window.KiwiBoutiqueVenueKey() : 'maisonMansour'; }
  function ready() { return !!(CAT() && PRM()); }

  function context() {
    var cat = CAT();
    var key = venueKey();
    cat.use(key);
    PRM().use(key);
    try {
      if (window.KiwiCloudDoc) PRM().cloud(function () { return window.KiwiCloudDoc.slugFor(key); });
    } catch (_) {}
    var c = cat.compat();
    return { cat: cat, key: key, rayons: c.RAYONS || [], products: c.P || {}, byEan: c.BY_EAN || {} };
  }

  function items(ctx) {
    return Object.keys(ctx.products).filter(function (id) { return ctx.products[id] && ctx.products[id].id === id; }).map(function (id) { return ctx.products[id]; });
  }
  function stockOf(it) { return PRM().stockOf(it); }
  function preview(ctx, p) { return PRM().preview(p, items(ctx), { stockOf: stockOf }); }

  function injectCss() {
    if (document.getElementById('bpd-css')) return;
    var s = document.createElement('style');
    s.id = 'bpd-css';
    s.textContent = `
      .bpd-page{--bpd-warn:#8A6210;--bpd-warn-bg:rgba(217,154,43,.16);padding-bottom:42px}
      .bpd-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .bpd-head h2{margin:0;font-size:25px}.bpd-sub{font-size:12.5px;color:var(--n-500);margin-top:4px}
      .bpd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
      .bpd-btn svg{width:15px;height:15px}.bpd-btn.primary{background:var(--atlas);border-color:var(--atlas);color:#fff}.bpd-btn.danger{color:#9B2F22}.bpd-btn:disabled{opacity:.4;cursor:default}
      .bpd-seg{display:flex;width:max-content;max-width:100%;gap:3px;padding:4px;border-radius:13px;background:var(--paper-soft);margin-bottom:17px}
      .bpd-seg button{display:flex;align-items:center;gap:7px;padding:8px 13px;border:0;border-radius:10px;background:transparent;color:var(--n-600);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}.bpd-seg button.on{background:var(--atlas);color:#fff}.bpd-seg small{font-family:var(--mono);opacity:.75}
      .bpd-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
      .bpd-card{display:flex;overflow:hidden;background:var(--paper);border:1px solid var(--line);border-radius:17px}.bpd-card.active{border-color:rgba(11,110,79,.35)}.bpd-card.ended{opacity:.62}
      .bpd-ribbon{flex:0 0 88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:16px 6px;background:var(--riad);color:#fff}.bpd-card.active .bpd-ribbon{background:var(--atlas)}
      .bpd-ribbon b{font-family:var(--mono);font-size:19px;line-height:1}.bpd-ribbon span{font-size:9px;text-transform:uppercase;letter-spacing:.05em;opacity:.72;text-align:center}
      .bpd-body{flex:1;min-width:0;padding:14px 15px;display:flex;flex-direction:column;gap:9px}.bpd-top{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.bpd-top h3{margin:0;min-width:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bpd-state{flex:none;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--n-500);background:var(--paper-soft)}.bpd-state.active{color:var(--atlas);background:rgba(11,110,79,.08);border-color:rgba(11,110,79,.24)}.bpd-state.soon{color:#8A6210;background:rgba(217,154,43,.13);border-color:rgba(217,154,43,.3)}
      .bpd-meta{display:flex;flex-direction:column;gap:4px}.bpd-meta span{display:flex;align-items:center;gap:6px;color:var(--n-500);font-size:12px;line-height:1.35}.bpd-meta svg{width:13px;height:13px;flex:none}
      .bpd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:9px;border-top:1px solid var(--line)}.bpd-count{font-family:var(--mono);font-size:11.5px;color:var(--n-500)}.bpd-actions{display:flex;gap:5px}.bpd-icon{width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);cursor:pointer}.bpd-icon svg{width:14px;height:14px}.bpd-icon.danger{color:#9B2F22}
      .bpd-empty{max-width:980px;margin:28px auto 0;text-align:center}.bpd-empty>svg{width:31px;height:31px;color:var(--atlas)}.bpd-empty h2{font-size:24px;margin:12px 0 7px}.bpd-empty p{max-width:510px;margin:0 auto;color:var(--n-500);font-size:13.5px;line-height:1.55}.bpd-starters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px;text-align:left}.bpd-starter{position:relative;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:8px;min-height:138px;padding:22px 58px 22px 22px;border:2px solid var(--atlas);border-radius:16px;background:rgba(11,110,79,.055);color:var(--ink);font:inherit;text-align:left;box-shadow:0 7px 18px rgba(5,59,44,.08);cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background .16s ease}.bpd-starter:hover{transform:translateY(-3px);background:rgba(11,110,79,.10);box-shadow:0 13px 26px rgba(5,59,44,.16)}.bpd-starter:active{transform:translateY(0);box-shadow:0 4px 10px rgba(5,59,44,.12)}.bpd-starter:focus-visible{outline:3px solid var(--mint);outline-offset:3px}.bpd-starter b{font-size:15px;line-height:1.25}.bpd-starter span{font-size:12px;line-height:1.45;color:var(--n-500)}.bpd-starter svg{position:absolute;right:18px;top:50%;width:22px;height:22px;padding:9px;border-radius:50%;background:var(--atlas);color:#fff;transform:translateY(-50%)}
      .bpd-modal{width:min(920px,88vw)}.bpd-compose{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}.bpd-form{display:flex;flex-direction:column;gap:15px}.bpd-field label{display:block;margin-bottom:6px;font-family:var(--mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--n-500)}.bpd-field label span{text-transform:none;letter-spacing:0;font-weight:400}.bpd-input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px;outline:none}.bpd-input:focus{border-color:var(--atlas)}
      .bpd-kinds,.bpd-scopes{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bpd-scopes{grid-template-columns:repeat(5,1fr)}.bpd-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font:inherit;font-size:11.5px;font-weight:600;color:var(--n-600);cursor:pointer;text-align:center}.bpd-choice small{font-family:var(--mono);font-size:9.5px;font-weight:400}.bpd-choice svg{width:17px;height:17px}.bpd-choice.on{background:var(--atlas);border-color:var(--atlas);color:#fff}
      .bpd-value{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}.bpd-value input{width:92px;font-family:var(--mono);font-size:17px;font-weight:700}.bpd-unit{font-family:var(--mono);font-size:13px;color:var(--n-500)}.bpd-chips{display:flex;gap:6px;flex-wrap:wrap}.bpd-chip{display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--paper);font:inherit;font-size:11.5px;color:var(--n-600);cursor:pointer}.bpd-chip.on{border-color:rgba(11,110,79,.35);background:rgba(11,110,79,.08);color:var(--atlas);font-weight:600}.bpd-chip svg{width:11px;height:11px}
      .bpd-scopebody{display:flex;flex-direction:column;gap:8px;margin-top:9px}.bpd-hint{font-size:11.5px;line-height:1.45;color:var(--n-500)}.bpd-search{display:flex;align-items:center;gap:9px;border:1.5px solid var(--atlas);border-radius:11px;padding:9px 11px}.bpd-search svg{width:17px;color:var(--atlas)}.bpd-search input{flex:1;min-width:0;border:0;background:transparent;outline:0;font:inherit}.bpd-hits{display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto}.bpd-hit{display:flex;justify-content:space-between;gap:10px;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:var(--paper);font:inherit;font-size:12px;cursor:pointer}.bpd-hit b{font-family:var(--mono);color:var(--n-500)}
      .bpd-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.bpd-preview{position:sticky;top:0;padding:15px;border:1px solid var(--line);border-radius:15px;background:var(--paper-soft)}.bpd-preview-head span{display:block;font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--n-500)}.bpd-preview-head b{display:inline-block;margin-top:4px;font:700 27px var(--mono)}.bpd-preview-head em{font-style:normal;font-size:12px;color:var(--n-500);margin-left:5px}.bpd-swap{display:flex;align-items:center;gap:8px;margin-top:12px}.bpd-swap>div{flex:1}.bpd-swap span{display:block;font-size:9.5px;text-transform:uppercase;color:var(--n-500)}.bpd-swap b{font:700 13px var(--mono)}.bpd-swap .next b{color:var(--atlas)}.bpd-swap svg{width:13px;color:var(--n-500)}.bpd-give{margin-top:9px;font-size:12px}.bpd-give b{font-family:var(--mono)}
      .bpd-warn{display:flex;gap:7px;margin-top:10px;padding:9px 10px;border:1px solid rgba(217,154,43,.35);border-radius:10px;background:rgba(217,154,43,.14);color:#8A6210;font-size:11.5px;line-height:1.4}.bpd-warn svg{width:14px;flex:none}.bpd-sample{display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line)}.bpd-srow{display:flex;justify-content:space-between;gap:8px;font-size:11.5px}.bpd-srow .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bpd-srow .prices{flex:none;font-family:var(--mono)}.bpd-srow s{color:var(--n-500);margin-right:4px}.bpd-srow b{color:var(--atlas)}.bpd-none{padding:24px 6px;text-align:center;color:var(--n-500);font-size:12px}
      .bpd-compose-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}.bpd-problem{font-size:11.5px;color:var(--n-500)}.bpd-compose-actions{display:flex;gap:8px;margin-left:auto}
      .bpd-print-summary{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-soft)}.bpd-print-summary b{font:700 27px var(--mono)}.bpd-print-summary span{font-size:12px;color:var(--n-500)}
      @media(max-width:900px){.bpd-compose{grid-template-columns:1fr}.bpd-preview{position:static}.bpd-scopes{grid-template-columns:repeat(2,1fr)}.bpd-starters{grid-template-columns:1fr}.bpd-starter{min-height:104px}}`;
    document.head.appendChild(s);
  }

  function scopeText(ctx, p) {
    var sc = p.scope || {};
    if (sc.type === 'tout') return 'Tout le magasin';
    if (sc.type === 'rayon') {
      var names = (sc.ids || []).map(function (id) { var r = ctx.rayons.find(function (x) { return x.id === id; }); return r && r.label; }).filter(Boolean);
      if (!names.length) return 'Aucun rayon choisi';
      return names.length <= 2 ? names.join(' et ') : names[0] + ' et ' + (names.length - 1) + ' autres rayons';
    }
    if (sc.type === 'produits') {
      var n = (sc.ids || []).length;
      if (!n) return 'Aucun article choisi';
      if (n === 1) return ctx.products[sc.ids[0]] ? ctx.products[sc.ids[0]].name : '1 article';
      return n + ' articles choisis';
    }
    if (sc.type === 'avant') return sc.before ? 'Entré en stock avant le ' + fmtDay(new Date(sc.before)) : 'Aucune date choisie';
    if (sc.type === 'stock') return 'Il en reste ' + (sc.max || 0) + ' ou moins';
    return '—';
  }

  function whenText(p, now) {
    var st = PRM().status(p, now || Date.now());
    if (st === 'paused') return 'En pause, aucun prix n’est modifié';
    if (st === 'scheduled') { var j = Math.ceil((p.from - Date.now()) / DAY); return 'Démarre ' + (j <= 1 ? 'demain' : 'dans ' + j + ' jours') + ' · ' + fmtDay(new Date(p.from)); }
    if (st === 'ended') return 'Terminée le ' + fmtDay(new Date(p.to));
    if (!p.to) return 'Sans date de fin, jusqu’à ce que vous l’arrêtiez';
    var left = p.to - Date.now();
    if (left < 2 * 3600000) return 'Se termine à ' + fmtHM(new Date(p.to));
    var days = Math.ceil(left / DAY);
    return days <= 1 ? 'Se termine aujourd’hui à ' + fmtHM(new Date(p.to)) : 'Se termine dans ' + days + ' jours · ' + fmtDay(new Date(p.to));
  }

  var STARTERS = {
    destock: { name: 'Déstockage', kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6, title: 'Déstocker l’ancienne saison', desc: 'Tout ce qui est en stock depuis plus de six mois, −30 %' },
    finserie: { name: 'Fins de série', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 }, title: 'Écouler les fins de série', desc: 'Les articles où il reste 5 pièces ou moins, −20 %' },
    weekend: { name: 'Week-end', kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2, title: 'Animer le week-end', desc: 'Tout le magasin, −10 %, jusqu’à dimanche soir' }
  };
  function starter(key) {
    var s = STARTERS[key]; if (!s) return null;
    var p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(Date.now() - s.months * 30 * DAY));
    if (s.days) p.to = endOfDay(new Date(Date.now() + s.days * DAY));
    return p;
  }

  function card(ctx, p, now) {
    var status = PRM().status(p, now);
    var n = preview(ctx, p).count;
    var tone = status === 'active' ? 'active' : status === 'ended' ? 'ended' : 'soon';
    var label = status === 'active' ? 'En cours' : status === 'scheduled' ? 'Programmée' : status === 'paused' ? 'En pause' : 'Terminée';
    return '<article class="bpd-card ' + tone + '"><div class="bpd-ribbon"><b>' + esc(PRM().badgeOf(p)) + '</b><span>' + (p.kind === 'fixed' ? 'prix fixe' : 'de remise') + '</span></div>' +
      '<div class="bpd-body"><div class="bpd-top"><h3>' + esc(p.name) + '</h3><span class="bpd-state ' + tone + '">' + label + '</span></div>' +
      '<div class="bpd-meta"><span><i data-lucide="target"></i>' + esc(scopeText(ctx, p)) + '</span><span><i data-lucide="clock"></i>' + esc(whenText(p, now)) + '</span></div>' +
      '<div class="bpd-foot"><span class="bpd-count">' + n + ' article' + (n > 1 ? 's' : '') + ' concerné' + (n > 1 ? 's' : '') + '</span><span class="bpd-actions">' +
      (n ? '<button class="bpd-icon" data-action="bpd-print" data-arg="' + esc(p.id) + '" title="Imprimer les étiquettes"><i data-lucide="printer"></i></button>' : '') +
      (status !== 'ended' ? '<button class="bpd-icon" data-action="bpd-toggle" data-arg="' + esc(p.id) + '" title="' + (p.paused ? 'Reprendre' : 'Mettre en pause') + '"><i data-lucide="' + (p.paused ? 'play' : 'pause') + '"></i></button>' : '') +
      '<button class="bpd-icon" data-action="bpd-edit" data-arg="' + esc(p.id) + '" title="Modifier"><i data-lucide="pencil"></i></button>' +
      '<button class="bpd-icon danger" data-action="bpd-delete" data-arg="' + esc(p.id) + '" title="Supprimer"><i data-lucide="trash-2"></i></button>' +
      '</span></div></div></article>';
  }

  function emptyHtml() {
    return '<div class="bpd-empty"><i data-lucide="tag"></i><h2>Baissez vos prix une fois, la caisse s’en souvient</h2>' +
      '<p>Une promotion s’applique toute seule aux articles visés pendant la durée choisie. Les étiquettes, la grille de vente et le reçu suivent automatiquement.</p>' +
      '<div class="bpd-starters">' + Object.keys(STARTERS).map(function (key) { var s = STARTERS[key]; return '<button class="bpd-starter" data-action="bpd-starter" data-arg="' + key + '"><b>' + esc(s.title) + '</b><span>' + esc(s.desc) + '</span><i data-lucide="arrow-right"></i></button>'; }).join('') + '</div></div>';
  }

  function renderPage() {
    injectCss();
    if (!ready()) { K.toast('Promotions indisponibles', { type: 'warn', desc: 'Rechargez le dashboard pour charger le module.' }); return; }
    var ctx = context();
    var now = Date.now();
    var all = PRM().list();
    var groups = {
      active: all.filter(function (p) { return PRM().status(p, now) === 'active'; }),
      soon: all.filter(function (p) { return ['scheduled', 'paused'].indexOf(PRM().status(p, now)) >= 0; }),
      ended: all.filter(function (p) { return PRM().status(p, now) === 'ended'; })
    };
    var shown = groups[filter] || groups.active;
    var seen = new Set();
    groups.active.forEach(function (p) { items(ctx).forEach(function (it) { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); }); });
    var sub = groups.active.length + ' promotion' + (groups.active.length > 1 ? 's' : '') + ' en cours' + (seen.size ? ' · ' + seen.size + ' article' + (seen.size > 1 ? 's' : '') + ' remisé' + (seen.size > 1 ? 's' : '') : '');
    K.appPage('promos', { title: 'Promotions', subtitle: sub, body:
      '<div class="bpd-page"><div class="bpd-head"><div class="bpd-sub">' + esc(sub) + ' · prix partagés avec la caisse</div><button class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>Nouvelle promotion</button></div>' +
      (all.length ? '<div class="bpd-seg"><button class="' + (filter === 'active' ? 'on' : '') + '" data-action="bpd-filter" data-arg="active">En cours <small>' + groups.active.length + '</small></button><button class="' + (filter === 'soon' ? 'on' : '') + '" data-action="bpd-filter" data-arg="soon">À venir <small>' + groups.soon.length + '</small></button><button class="' + (filter === 'ended' ? 'on' : '') + '" data-action="bpd-filter" data-arg="ended">Terminées <small>' + groups.ended.length + '</small></button></div>' : '') +
      (all.length ? (shown.length ? '<div class="bpd-list">' + shown.map(function (p) { return card(ctx, p, now); }).join('') + '</div>' : '<div class="bpd-empty"><i data-lucide="tag"></i><h2>Rien ici</h2><p>Aucune promotion dans cette section.</p></div>') : emptyHtml()) + '</div>' });
    icons();
    if (!subscribed) {
      subscribed = true;
      PRM().subscribe(function () { var active = document.querySelector('[data-nav="promos"].active'); if (active) renderPage(); });
    }
  }

  var SCOPES = [
    { id: 'tout', label: 'Tout le magasin', icon: 'store' }, { id: 'rayon', label: 'Un rayon', icon: 'layout-grid' },
    { id: 'produits', label: 'Des articles', icon: 'shirt' }, { id: 'avant', label: 'Ancien stock', icon: 'calendar-clock' },
    { id: 'stock', label: 'Fin de série', icon: 'package-minus' }
  ];
  function valid(d) {
    if (!d.value) return 'Choisissez de combien vous baissez le prix';
    var sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return 'Choisissez au moins un élément à viser';
    if (sc.type === 'avant' && !sc.before) return 'Choisissez la date avant laquelle les articles sont visés';
    if (sc.type === 'stock' && !sc.max) return 'Indiquez le seuil de stock';
    if (d.to && d.from && d.to <= d.from) return 'La date de fin doit venir après le début';
    return '';
  }
  function autoName(ctx, d) {
    if (d.scope.type === 'avant') return 'Déstockage';
    if (d.scope.type === 'stock') return 'Fins de série';
    if (d.scope.type === 'rayon') return scopeText(ctx, d);
    if (d.scope.type === 'produits') return 'Sélection';
    return d.kind === 'percent' ? 'Tout le magasin −' + d.value + ' %' : 'Promotion';
  }

  function scopeControl(ctx, d) {
    var sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="bpd-hint">Chaque article du magasin, sans exception.</div>';
    if (sc.type === 'rayon') return '<div class="bpd-chips">' + ctx.rayons.map(function (r) { return '<button class="bpd-chip ' + ((sc.ids || []).indexOf(r.id) >= 0 ? 'on' : '') + '" data-prr="' + esc(r.id) + '">' + esc(r.label) + ' <small>' + r.items.length + '</small></button>'; }).join('') + '</div>';
    if (sc.type === 'produits') {
      var ids = sc.ids || [];
      return '<div class="bpd-search"><i data-lucide="search"></i><input id="bpd-q" placeholder="Chercher un article ou scanner son code-barres…" autocomplete="off"></div>' +
        '<div class="bpd-chips">' + (ids.length ? ids.map(function (id) { return '<button class="bpd-chip on" data-prp="' + esc(id) + '">' + esc(ctx.products[id] ? ctx.products[id].name : id) + ' <i data-lucide="x"></i></button>'; }).join('') : '<span class="bpd-hint">Aucun article choisi.</span>') + '</div><div class="bpd-hits" id="bpd-hits"></div>';
    }
    if (sc.type === 'avant') return '<div class="bpd-chips">' + [{m:3,l:'Plus de 3 mois'},{m:6,l:'Plus de 6 mois'},{m:12,l:'Plus d’un an'}].map(function (o) { return '<button class="bpd-chip" data-pra="' + o.m + '">' + o.l + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-before" type="date" value="' + toInput(sc.before) + '"><div class="bpd-hint">Vise les articles entrés avant cette date.</div>';
    if (sc.type === 'stock') return '<div class="bpd-chips">' + [2,3,5,10].map(function (n) { return '<button class="bpd-chip ' + (sc.max === n ? 'on' : '') + '" data-prm="' + n + '">' + n + ' ou moins</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-max" type="number" min="1" value="' + (sc.max || '') + '" placeholder="ou un seuil à vous"><div class="bpd-hint">La cible suit automatiquement le stock disponible.</div>';
    return '';
  }

  function composerHtml(ctx) {
    var d = composer.draft;
    var prev = preview(ctx, d);
    var problem = valid(d);
    var sc = d.scope || {};
    var quick = d.kind === 'percent' ? [10,20,30,50] : d.kind === 'amount' ? [20,50,100,200] : [49,99,149,199];
    return '<div class="bpd-modal" data-bpd-host><div class="bpd-compose"><div class="bpd-form">' +
      '<div class="bpd-field"><label>Nom <span>· visible sur le reçu</span></label><input class="bpd-input" id="bpd-name" maxlength="80" placeholder="Soldes d’été, Déstockage…" value="' + esc(d.name) + '"></div>' +
      '<div class="bpd-field"><label>De combien</label><div class="bpd-kinds">' + [['percent','En pourcentage','−20 %'],['amount','En dirhams','−50 MAD'],['fixed','Prix fixe','tout à 99']].map(function (x) { return '<button class="bpd-choice ' + (d.kind === x[0] ? 'on' : '') + '" data-prk="' + x[0] + '">' + x[1] + '<small>' + x[2] + '</small></button>'; }).join('') + '</div><div class="bpd-value"><input class="bpd-input" id="bpd-value" type="number" min="0" value="' + d.value + '"><span class="bpd-unit">' + (d.kind === 'percent' ? '%' : 'MAD') + '</span><div class="bpd-chips">' + quick.map(function (n) { return '<button class="bpd-chip ' + (d.value === n ? 'on' : '') + '" data-prv="' + n + '">' + (d.kind === 'percent' ? '−' + n + ' %' : d.kind === 'amount' ? '−' + n : n) + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="bpd-field"><label>Sur quoi</label><div class="bpd-scopes">' + SCOPES.map(function (x) { return '<button class="bpd-choice ' + (sc.type === x.id ? 'on' : '') + '" data-prs="' + x.id + '"><i data-lucide="' + x.icon + '"></i>' + x.label + '</button>'; }).join('') + '</div><div class="bpd-scopebody">' + scopeControl(ctx, d) + '</div></div>' +
      '<div class="bpd-field"><label>Jusqu’à quand</label><div class="bpd-chips">' + [['today','Aujourd’hui'],['we','Ce week-end'],['7','7 jours'],['30','30 jours'],['none','Sans fin']].map(function (x) { return '<button class="bpd-chip" data-prw="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><div class="bpd-dates"><div><label>Début <span>· vide = maintenant</span></label><input class="bpd-input" id="bpd-from" type="date" value="' + toInput(d.from) + '"></div><div><label>Fin <span>· vide = sans fin</span></label><input class="bpd-input" id="bpd-to" type="date" value="' + toInput(d.to) + '"></div></div></div>' +
      '</div><aside class="bpd-preview"><div class="bpd-preview-head"><span>Ce que ça touche</span><b>' + prev.count + '</b><em>article' + (prev.count > 1 ? 's' : '') + '</em></div>' +
      (prev.count ? '<div class="bpd-swap"><div><span>Prix plein</span><b>' + money(prev.from) + '</b></div><i data-lucide="arrow-right"></i><div class="next"><span>Prix promo</span><b>' + money(prev.to) + '</b></div></div><div class="bpd-give">Vous offrez <b>' + money(prev.from - prev.to) + '</b> si tout part.</div>' + (prev.under ? '<div class="bpd-warn"><i data-lucide="alert-triangle"></i><span><b>' + prev.under + ' article' + (prev.under > 1 ? 's passent' : ' passe') + ' sous le prix d’achat.</b></span></div>' : '') + '<div class="bpd-sample">' + prev.sample.map(function (x) { return '<div class="bpd-srow"><span class="name">' + esc(x.name) + '</span><span class="prices"><s>' + money(x.was) + '</s><b>' + money(x.price) + '</b></span></div>'; }).join('') + '</div>' : '<div class="bpd-none">' + esc(problem || 'Aucun article ne correspond à cette cible.') + '</div>') + '</aside></div>' +
      '<div class="bpd-compose-foot"><span class="bpd-problem">' + esc(problem) + '</span><span class="bpd-compose-actions"><button class="bpd-btn" data-bpd-cancel>Annuler</button><button class="bpd-btn primary" id="bpd-save" ' + (problem || !prev.count ? 'disabled' : '') + '><i data-lucide="check"></i>' + (composer.editing ? 'Enregistrer' : 'Lancer la promotion') + '</button></span></div></div>';
  }

  function openComposer(seed) {
    var ctx = context();
    composer.editing = seed && seed.id ? seed.id : null;
    composer.draft = PRM().normalize(seed || { name:'', kind:'percent', value:20, scope:{type:'tout'} });
    if (!seed) composer.draft.name = '';
    promoModal = K.modal({ title: composer.editing ? 'Modifier la promotion' : 'Nouvelle promotion', desc: 'Les prix seront appliqués automatiquement dans la caisse.', width: 980, body: '<div data-bpd-shell></div>', foot: '' });
    function draw() {
      var shell = promoModal.el.querySelector('[data-bpd-shell]');
      shell.innerHTML = composerHtml(ctx);
      wire(shell, ctx, draw);
      icons();
    }
    draw();
  }

  function wire(el, ctx, redraw) {
    var d = composer.draft;
    var name = el.querySelector('#bpd-name');
    if (name) name.oninput = function () { d.name = name.value; };
    el.querySelectorAll('[data-prk]').forEach(function (b) { b.onclick = function () { d.kind = b.dataset.prk; redraw(); }; });
    var val = el.querySelector('#bpd-value'); if (val) val.onchange = function () { d.value = Math.max(0, Math.round(+val.value || 0)); redraw(); };
    el.querySelectorAll('[data-prv]').forEach(function (b) { b.onclick = function () { d.value = +b.dataset.prv; redraw(); }; });
    el.querySelectorAll('[data-prs]').forEach(function (b) { b.onclick = function () { d.scope = PRM().normalize({ scope:{type:b.dataset.prs} }).scope; redraw(); }; });
    el.querySelectorAll('[data-prr]').forEach(function (b) { b.onclick = function () { var ids = d.scope.ids || (d.scope.ids=[]); var i=ids.indexOf(b.dataset.prr); if(i>=0) ids.splice(i,1); else ids.push(b.dataset.prr); redraw(); }; });
    el.querySelectorAll('[data-prp]').forEach(function (b) { b.onclick = function () { var i=d.scope.ids.indexOf(b.dataset.prp); if(i>=0)d.scope.ids.splice(i,1); redraw(); }; });
    var q = el.querySelector('#bpd-q');
    if (q) {
      var hits = el.querySelector('#bpd-hits');
      var paint = function () { var term=q.value.trim().toLowerCase(); if(!term){hits.innerHTML='';return;} var by=ctx.byEan[q.value.trim()]; var found=by?[ctx.products[by]].filter(Boolean):items(ctx).filter(function(it){return it.name.toLowerCase().indexOf(term)>=0;}).slice(0,8); hits.innerHTML=found.map(function(it){return '<button class="bpd-hit" data-pick="'+esc(it.id)+'"><span>'+esc(it.name)+'</span><b>'+money(it.price)+'</b></button>';}).join('')||'<div class="bpd-hint">Aucun article trouvé.</div>'; hits.querySelectorAll('[data-pick]').forEach(function(b){b.onclick=function(){var ids=d.scope.ids||(d.scope.ids=[]);if(ids.indexOf(b.dataset.pick)<0)ids.push(b.dataset.pick);redraw();};}); };
      q.oninput = paint; q.onkeydown = function(e){if(e.key==='Enter'){e.preventDefault();paint();}};
    }
    el.querySelectorAll('[data-pra]').forEach(function(b){b.onclick=function(){d.scope.before=startOfDay(new Date(Date.now()-(+b.dataset.pra)*30*DAY));redraw();};});
    var before=el.querySelector('#bpd-before');if(before)before.onchange=function(){d.scope.before=before.value?startOfDay(new Date(before.value+'T12:00:00')):0;redraw();};
    el.querySelectorAll('[data-prm]').forEach(function(b){b.onclick=function(){d.scope.max=+b.dataset.prm;redraw();};});
    var max=el.querySelector('#bpd-max');if(max)max.onchange=function(){d.scope.max=Math.max(0,Math.round(+max.value||0));redraw();};
    el.querySelectorAll('[data-prw]').forEach(function(b){b.onclick=function(){var key=b.dataset.prw,now=new Date();if(key==='none')d.to=0;else if(key==='today')d.to=endOfDay(now);else if(key==='we')d.to=endOfDay(new Date(now.getTime()+((7-now.getDay())%7)*DAY));else d.to=endOfDay(new Date(now.getTime()+(+key)*DAY));redraw();};});
    var from=el.querySelector('#bpd-from');if(from)from.onchange=function(){d.from=from.value?startOfDay(new Date(from.value+'T12:00:00')):0;redraw();};
    var to=el.querySelector('#bpd-to');if(to)to.onchange=function(){d.to=to.value?endOfDay(new Date(to.value+'T12:00:00')):0;redraw();};
    el.querySelector('[data-bpd-cancel]').onclick=function(){promoModal.close();};
    var save=el.querySelector('#bpd-save');if(save)save.onclick=function(){if(valid(d))return;if(!d.name.trim())d.name=autoName(ctx,d);if(composer.editing)d.id=composer.editing;PRM().save(d);promoModal.close();K.toast(composer.editing?d.name+' enregistrée':d.name+' lancée, la caisse est à jour',{type:'success'});renderPage();};
  }

  function labelFor(ctx, pid, variant) {
    var item = ctx.products[pid]; if (!item) return null;
    var code = ctx.cat.primaryBarcode(variant); if (!code) return null;
    var deal = PRM().priceFor(item, { stock: stockOf(item) });
    return { title:item.name, sub:variant.colorLabel+' · '+variant.size, price:String(deal ? deal.price : item.price), was:deal ? String(deal.was) : null, code:code, format:window.KiwiBarcode.isValidEan13(code)?'ean13':'code128' };
  }
  function labelPlan(id) {
    var ctx=context(), p=PRM().get(id), labels=[], products=0;
    if(!p)return {promo:null,labels:labels,products:0};
    items(ctx).forEach(function(item){if(!PRM().matches(p,item,stockOf(item)))return;var used=0;ctx.cat.listVariants(item.id).forEach(function(v){if(!(v.stock>0))return;var l=labelFor(ctx,item.id,v);if(l){labels.push(l);used++;}});if(used)products++;});
    return {promo:p,labels:labels,products:products};
  }

  H['nav-promos'] = renderPage;
  H['bpd-filter'] = function (_el,arg) { filter=arg||'active';renderPage(); };
  H['bpd-new'] = function () { openComposer(null); };
  H['bpd-starter'] = function (_el,arg) { openComposer(starter(arg)); };
  H['bpd-edit'] = function (_el,arg) { var p=PRM().get(arg);if(p)openComposer(p); };
  H['bpd-toggle'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;PRM().setPaused(arg,!p.paused);K.toast(p.paused?p.name+' reprend':p.name+' mise en pause',{type:p.paused?'success':'warn'});renderPage(); };
  H['bpd-delete'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;var m=K.modal({title:'Supprimer « '+p.name+' » ?',desc:'Les articles repassent immédiatement au prix plein. Les ventes encaissées ne changent pas.',width:470,foot:'<button class="kb ghost" data-cancel>Garder</button><button class="kb danger" data-delete>Supprimer</button>'});m.el.querySelector('[data-cancel]').onclick=m.close;m.el.querySelector('[data-delete]').onclick=function(){PRM().remove(arg);m.close();K.toast(p.name+' supprimée',{type:'warn'});renderPage();}; };
  H['bpd-print'] = function (_el,arg) { var plan=labelPlan(arg);if(!plan.promo)return;var n=plan.labels.length;var m=K.modal({title:'Étiquettes · '+plan.promo.name,desc:n?'Chaque étiquette portera le prix réellement appliqué en caisse.':'Aucun article en stock avec un code-barres.',width:520,body:n?'<div class="bpd-print-summary"><b>'+n+'</b><span>étiquette'+(n>1?'s':'')+' · '+plan.products+' article'+(plan.products>1?'s':'')+' concerné'+(plan.products>1?'s':'')+'</span></div>':'',foot:'<button class="kb ghost" data-cancel>'+ (n?'Annuler':'Fermer') +'</button>'+(n?'<button class="kb atlas" data-print><i data-lucide="printer"></i>Imprimer '+n+'</button>':'')});m.el.querySelector('[data-cancel]').onclick=m.close;var b=m.el.querySelector('[data-print]');if(b)b.onclick=function(){m.close();window.KiwiBarcode.printLabels(plan.labels,{copies:1});};icons(); };
})();
