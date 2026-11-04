/* Kiwi · Boutique promotions manager · owner dashboard only.
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

  var lang = function () { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  function tr(key, params) { var i = window.KiwiI18n, d = i && i.T; var text = d && ((d[lang()] || {})[key] || (d.fr || {})[key]) || key; return text.replace(/\{(p\d+)\}/g, function (_, p) { return params && params[p] != null ? params[p] : ''; }); }
  /* Arabic number agreement: 1 and 2 have their own forms, 3-10 take the plural,
     11+ the singular accusative. a = [one, dual, few, many]; fullOne replaces the
     bare word when the count is 1 (« صنف واحد »). */
  function arW(n, a) { n = Math.abs(n); return n === 1 ? a[0] : n === 2 ? a[1] : (n === 0 || (n % 100 >= 3 && n % 100 <= 10)) ? a[2] : a[3]; }
  function arN(n, a, fullOne) { var w = arW(n, a); return n === 1 ? (fullOne || w) : n === 2 ? w : n + ' ' + w; }
  var ITEM = ['صنف', 'صنفان', 'أصناف', 'صنفًا'];
  var DAYW = ['يوم', 'يومان', 'أيام', 'يومًا'];
  var nItems = function (n) { return tr("promos.copy1", { p0: n, p1: (n > 1 ? 's' : ''), p2: n, p3: (n === 1 ? '' : 's'), p4: arN(n, ITEM, 'صنف واحد') }); };
  var pct = function (v) { return tr("promos.copy2", { p0: v, p1: v, p2: v }); };
  var loc = function () { return tr("promos.copy3"); };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var money = function (n) { return new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format(+n || 0) + ' MAD'; };
  /* Les bornes d'une promotion suivent la JOURNÉE COMMERCIALE du magasin (bascule 05:00 dans son
   * fuseau), comme les promotions du menu : « jusqu'au 31 » finit le 1er à 05:00, pas à 23:59:59.
   * Le fuseau et la bascule viennent du rapport du jour ; sans lui, Casablanca et le jour civil. */
  var FALLBACK_ZONE = 'Africa/Casablanca';
  var wallFormats = {};
  function dayReport() { try { var R = window.KiwiDayReport; return R && R.businessDay && R.dayBounds ? R : null; } catch (_) { return null; } }
  function zoneOf() { try { var z = window.KiwiDayReport && window.KiwiDayReport.timezone && window.KiwiDayReport.timezone(); if (z) return String(z); } catch (_) {} return FALLBACK_ZONE; }
  function wall(d) {
    var z = zoneOf(), p = {};
    var f = wallFormats[z] || (wallFormats[z] = new (globalThis.KiwiZoneLaw && globalThis.KiwiZoneLaw.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    f.formatToParts(new Date(d)).forEach(function (x) { p[x.type] = x.value; });
    return p;
  }
  /* La journée commerciale (YYYY-MM-DD) d'un instant. */
  function dayKey(d) { var R = dayReport(); if (R) { try { return R.businessDay(+d); } catch (_) {} } var p = wall(d); return p.year + '-' + p.month + '-' + p.day; }
  var fmtDay = function (d) { return new Intl.DateTimeFormat(loc(), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dayKey(d) + 'T12:00:00Z')); };
  /* L'heure à laquelle la promotion s'arrête : `d` est sa dernière milliseconde, donc +1. */
  var fmtHM = function (d) { var p = wall(+d + 1); return p.hour + ':' + p.minute; };
  var toInput = function (ms) { return ms ? dayKey(ms) : ''; };
  /* `d` : un instant, ou une date choisie 'YYYY-MM-DD'. Début = la bascule du jour, fin = la veille de la suivante. */
  function boundary(d, end) {
    var key = typeof d === 'string' ? d : dayKey(d), R = dayReport();
    if (R) { try { var b = R.dayBounds(key); if (isFinite(b.from) && isFinite(b.to)) return end ? b.to - 1 : b.from; } catch (_) {} }
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1, dd = +key.slice(8, 10);
    var target = Date.UTC(y, m, dd, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0), at = target;
    for (var i = 0; i < 4; i++) { var w = wall(at); at += target - Date.UTC(+w.year, +w.month - 1, +w.day, +w.hour, +w.minute, +w.second); }
    return at + (end ? 999 : 0);
  }
  var startOfDay = function (d) { return boundary(d, false); };
  var endOfDay = function (d) { return boundary(d, true); };
  var icons = function () { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} };

  function CAT() { return window.KiwiBoutiqueCatalog; }
  function PRM() { return window.KiwiPromos; }

  /* Ce que l'écran a le droit d'annoncer après une écriture, selon
     KiwiPromos.lastCommit() : `local` (la copie de cet appareil a pris) et
     `res`, la réponse du serveur une fois ATTENDUE (null sans copie serveur,
     error 'disabled' en démonstration).
       ok      · tout ce qu'on annonçait avant est vrai
       pending · gardée ici, pas encore au serveur : la caisse ne l'a pas
       sent    · au serveur, mais pas sur cet appareil
       lost    · ni ici ni au serveur : seule la page ouverte la porte */
  function saveVerdict(local, res) {
    var noCloud = !res || res.error === 'disabled';
    var sent = !!(res && res.ok === true);
    if (local) return (sent || noCloud) ? 'ok' : 'pending';
    return sent ? 'sent' : 'lost';
  }
  /* `title` dit ce qui est vrai quand tout a pris (« la caisse est à jour ») ;
     `plain` ne promet que ce que cet appareil sait. Le toast attend la
     réponse du serveur avant de parler. */
  function announce(title, plain, type) {
    var c = PRM() && PRM().lastCommit ? PRM().lastCommit() : null;
    if (!c) { K.toast(title, { type: type }); return Promise.resolve('ok'); }
    return Promise.resolve(c.server).then(null, function () { return { ok: false }; }).then(function (res) {
      var v = saveVerdict(c.local !== false, res);
      if (v === 'ok') K.toast(title, { type: type });
      else if (v === 'pending') K.toast(plain, { type: 'warn', desc: tr("promos.copy4") });
      else if (v === 'sent') K.toast(plain, { type: 'warn', duration: 9000, desc: tr("promos.copy5") });
      else K.toast(tr("promos.copy6"), { type: 'warn', duration: 12000, desc: tr("promos.copy7") });
      return v;
    });
  }
  /* Only the boutique and maison tills read KiwiPromos at checkout. The page is
   * also offered to épicerie, pharmacie, librairie, fleuriste and autre, where
   * « Synchronisé avec la caisse » and « la caisse est à jour » were false. */
  function tillApplies() {
    /* Le MÉTIER (sous-type), pas le type de base : getVenueType() renvoie
     * « boutique » pour l'épicerie aussi, dont la caisse ne lit pas les promotions. */
    var t = '';
    try { t = String((window.KiwiStoreTemplates && window.KiwiStoreTemplates.currentTrade && window.KiwiStoreTemplates.currentTrade()) || ''); } catch (_) {}
    t = t.toLowerCase();
    return !t || t === 'boutique' || t === 'maison';
  }
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


  function scopeText(ctx, p) {
    var sc = p.scope || {};
    if (sc.type === 'tout') return tr("promos.copy8");
    if (sc.type === 'rayon') {
      var names = (sc.ids || []).map(function (id) { var r = ctx.rayons.find(function (x) { return x.id === id; }); return r && r.label; }).filter(Boolean);
      if (!names.length) return tr("promos.copy9");
      if (names.length <= 2) return names.join(tr("promos.copy10"));
      var k = names.length - 1;
      return tr("promos.copy11", { p0: names[0], p1: k, p2: names[0], p3: k, p4: names[0], p5: arN(k, ['قسم آخر', 'قسمان آخران', 'أقسام أخرى', 'قسمًا آخر']) });
    }
    if (sc.type === 'produits') {
      var n = (sc.ids || []).length;
      if (!n) return tr("promos.copy12");
      if (n === 1) return ctx.products[sc.ids[0]] ? ctx.products[sc.ids[0]].name : tr("promos.copy13");
      return tr("promos.copy14", { p0: n, p1: n, p2: n });
    }
    if (sc.type === 'avant') return sc.before ? tr("promos.copy15", { p0: fmtDay(new Date(sc.before)), p1: fmtDay(new Date(sc.before)), p2: fmtDay(new Date(sc.before)) }) : tr("promos.copy16");
    if (sc.type === 'stock') return tr("promos.copy17", { p0: (sc.max || 0), p1: (sc.max || 0), p2: (sc.max || 0) });
    return '·';
  }

  /* « Mar, Jeu · 12:00–14:00 » : le créneau tel qu'on l'afficherait en
     vitrine. Vide quand la promotion court toute la journée, tous les jours. */
  var dayShort = function (i) { return ({ fr: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] }[lang()] || ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'])[i]; };
  var dayLong = function (i) { return ({ fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], ar: ['يوم الأحد', 'يوم الإثنين', 'يوم الثلاثاء', 'يوم الأربعاء', 'يوم الخميس', 'يوم الجمعة', 'يوم السبت'] }[lang()] || ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[i]; };
  var WEEK = [1, 2, 3, 4, 5, 6, 0];
  function windowText(p) {
    var parts = [];
    if (p.days && p.days.length) parts.push(WEEK.filter(function (d) { return p.days.indexOf(d) >= 0; }).map(function (d) { return dayShort(d); }).join(tr("promos.copy20")));
    if (p.start && p.end) parts.push(p.start + '–' + p.end);
    return parts.join(' · ');
  }
  function resumeText(p, now) {
    var next = PRM().nextWindow ? PRM().nextWindow(p, now) : null;
    if (!next) return tr("promos.copy21");
    var day = next.day === 0 ? tr("promos.copy22") : next.day === 1 ? tr("promos.copy23") : dayLong(next.weekday);
    return tr("promos.copy24", { p0: day, p1: (next.at ? ' à ' + next.at : ''), p2: day, p3: (next.at ? ' at ' + next.at : ''), p4: day, p5: (next.at ? ' في الساعة ' + next.at : '') });
  }
  function whenText(p, now) {
    var st = PRM().status(p, now || Date.now());
    var slot = windowText(p);
    var base = whenBase(p, st);
    return slot && st !== 'ended' ? slot + ' · ' + (st === 'waiting' ? resumeText(p, now) + ' · ' : '') + base : base;
  }
  function whenBase(p, st) {
    if (st === 'paused') return tr("promos.copy25");
    if (st === 'scheduled') {
      var j = Math.ceil((p.from - Date.now()) / DAY);
      return tr("promos.copy26", { p0: (j <= 1 ? 'demain' : 'dans ' + j + ' jours'), p1: fmtDay(new Date(p.from)), p2: (j <= 1 ? 'tomorrow' : 'in ' + j + ' days'), p3: fmtDay(new Date(p.from)), p4: (j <= 1 ? 'غدًا' : 'بعد ' + arN(j, DAYW, 'يوم واحد')), p5: fmtDay(new Date(p.from)) });
    }
    if (st === 'ended') return tr("promos.copy27", { p0: fmtDay(new Date(p.to)), p1: fmtDay(new Date(p.to)), p2: fmtDay(new Date(p.to)) });
    if (!p.to) return tr("promos.copy28");
    var left = p.to - Date.now();
    if (left < 2 * 3600000) return tr("promos.copy29", { p0: fmtHM(new Date(p.to)), p1: fmtHM(new Date(p.to)), p2: fmtHM(new Date(p.to)) });
    var days = Math.ceil(left / DAY);
    return days <= 1
      ? tr("promos.copy30", { p0: fmtHM(new Date(p.to)), p1: fmtHM(new Date(p.to)), p2: fmtHM(new Date(p.to)) })
      : tr("promos.copy31", { p0: days, p1: fmtDay(new Date(p.to)), p2: days, p3: fmtDay(new Date(p.to)), p4: arN(days, DAYW), p5: fmtDay(new Date(p.to)) });
  }

  /* Les modèles sont construits à l'appel : la langue peut changer entre deux
     ouvertures de la page. */
  function starters() {
    return {
      destock: { name: tr("promos.copy32"), kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6, icon: 'archive-restore', kicker: tr("promos.copy33"), title: tr("promos.copy34"), desc: tr("promos.copy35") },
      finserie: { name: tr("promos.copy36"), kind: 'percent', value: 20, scope: { type: 'stock', max: 5 }, icon: 'package-minus', kicker: tr("promos.copy37"), title: tr("promos.copy38"), desc: tr("promos.copy39") },
      weekend: { name: tr("promos.copy40"), kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2, icon: 'calendar-days', kicker: tr("promos.copy41"), title: tr("promos.copy42"), desc: tr("promos.copy43") }
    };
  }
  function starter(key) {
    var s = starters()[key]; if (!s) return null;
    var p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(Date.now() - s.months * 30 * DAY));
    if (s.days) p.to = endOfDay(new Date(Date.now() + s.days * DAY));
    return p;
  }

  /* Une promotion = une ligne : la remise, le nom et son état, la cible,
     la période, le nombre d'articles, puis les gestes. */
  function row(ctx, p, now) {
    var status = PRM().status(p, now);
    var n = preview(ctx, p).count;
    var tone = status === 'active' ? 'active' : status === 'ended' ? 'ended' : 'soon';
    var label = status === 'active' ? tr("promos.copy44") : status === 'waiting' ? tr("promos.copy45") : status === 'scheduled' ? tr("promos.copy46") : status === 'paused' ? tr("promos.copy47") : tr("promos.copy48");
    var tPrint = tr("promos.copy49");
    var tToggle = p.paused ? tr("promos.copy50") : tr("promos.copy51");
    var tEdit = tr("promos.copy52");
    var tDel = tr("promos.copy53");
    return '<div class="bpd-row ' + tone + '"><span><span class="bpd-off">' + esc(PRM().badgeOf(p)) + '</span></span>' +
      '<span class="bpd-rname"><b>' + esc(p.name) + '</b><span class="bpd-state ' + tone + '">' + label + '</span></span>' +
      '<span class="bpd-rtxt">' + esc(scopeText(ctx, p)) + '</span><span class="bpd-rtxt">' + esc(whenText(p, now)) + '</span>' +
      '<span class="bpd-rnum">' + nItems(n) + '</span><span class="bpd-actions">' +
      (n ? '<button data-activation=write class="bpd-icon" data-action="bpd-print" data-arg="' + esc(p.id) + '" title="' + tPrint + '" aria-label="' + tPrint + '"><i data-lucide="printer"></i></button>' : '') +
      (status !== 'ended' ? '<button class="bpd-icon" data-action="bpd-toggle" data-arg="' + esc(p.id) + '" title="' + tToggle + '" aria-label="' + tToggle + '"><i data-lucide="' + (p.paused ? 'play' : 'pause') + '"></i></button>' : '') +
      '<button data-activation=write class="bpd-icon" data-action="bpd-edit" data-arg="' + esc(p.id) + '" title="' + tEdit + '" aria-label="' + tEdit + '"><i data-lucide="pencil"></i></button>' +
      '<button data-activation=write class="bpd-icon danger" data-action="bpd-delete" data-arg="' + esc(p.id) + '" title="' + tDel + '" aria-label="' + tDel + '"><i data-lucide="trash-2"></i></button></span></div>';
  }

  function startersHtml(title) {
    var ok = allowedPercents();
    var all = starters();
    var badge = function (s) { var v = s.value; if (ok && s.kind === 'percent') v = fitPolicy({ kind: 'percent', value: s.value }).value; return pct(v); };
    return '<section class="bpd-template-block"><div class="bpd-section-head"><div><h3>' + title + '</h3></div><p>' + tr("promos.copy54") + '</p></div>' +
      '<div class="bpd-starters">' + Object.keys(all).map(function (key) { var s = all[key]; return '<button class="bpd-starter" data-action="bpd-starter" data-arg="' + key + '"><span class="bpd-starter-icon"><i data-lucide="' + s.icon + '"></i></span><span class="bpd-starter-copy"><small>' + esc(s.kicker) + '</small><b>' + esc(s.title) + '</b><span>' + esc(s.desc) + '</span></span><strong>' + esc(badge(s)) + '</strong><i class="bpd-starter-arrow" data-lucide="arrow-up-right"></i></button>'; }).join('') + '</div></section>';
  }

  function emptyHtml() {
    return '<section class="bpd-intro"><div class="bpd-intro-copy"><h2>' + tr("promos.copy55") + '</h2>' +
      '<p>' + tr("promos.copy56") + (tillApplies()
        ? tr("promos.copy57")
        : tr("promos.copy58")) + '</p>' +
      '<button data-activation=write class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>' + tr("promos.copy59") + '</button></div>' +
      '<ul class="bpd-intro-sync" aria-label="' + tr("promos.copy60") + '"><li><i data-lucide="scan-barcode"></i><span><b>' + tr("promos.copy61") + '</b><small>' + tr("promos.copy62") + '</small></span></li>' +
      '<li><i data-lucide="receipt-text"></i><span><b>' + tr("promos.copy63") + '</b><small>' + tr("promos.copy64") + '</small></span></li>' +
      '<li><i data-lucide="printer"></i><span><b>' + tr("promos.copy65") + '</b><small>' + tr("promos.copy66") + '</small></span></li></ul></section>' +
      startersHtml(tr("promos.copy67"));
  }

  function renderPage() {

    if (!ready()) { K.toast(tr("promos.copy68"), { type: 'warn', desc: tr("promos.copy69") }); return; }
    var ctx = context();
    var now = Date.now();
    var all = PRM().list();
    var groups = {
      /* « Hors créneau » n'est ni fini ni à venir : c'est une promotion en
         cours qui attend son heure. Elle reste sous « En cours ». */
      active: all.filter(function (p) { return ['active', 'waiting'].indexOf(PRM().status(p, now)) >= 0; }),
      soon: all.filter(function (p) { return ['scheduled', 'paused'].indexOf(PRM().status(p, now)) >= 0; }),
      ended: all.filter(function (p) { return PRM().status(p, now) === 'ended'; })
    };
    var shown = groups[filter] || groups.active;
    var seen = new Set();
    /* Un article n'est « remisé » que par une promotion qui s'applique À CET
       INSTANT ; celles qui attendent leur créneau restent sous « En cours ». */
    groups.active.forEach(function (p) { if (PRM().status(p, now) !== 'active') return; items(ctx).forEach(function (it) { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); }); });
    var na = groups.active.length, ns = seen.size;
    var sub = tr("promos.copy70", { p0: na, p1: (na > 1 ? 's' : ''), p2: (ns ? ' · ' + ns + ' article' + (ns > 1 ? 's' : '') + ' remisé' + (ns > 1 ? 's' : '') : ''), p3: na, p4: (na === 1 ? '' : 's'), p5: (ns ? ' · ' + ns + ' discounted item' + (ns === 1 ? '' : 's') : ''), p6: arN(na, ['عرض', 'عرضان', 'عروض', 'عرضًا'], 'عرض واحد'), p7: (ns ? ' · الأصناف المخفضة: ' + ns : '') });
    var seenDesc = ns
      ? tr("promos.copy71", { p0: ns, p1: (ns > 1 ? 's' : ''), p2: (ns > 1 ? 's' : ''), p3: ns, p4: (ns === 1 ? '' : 's'), p5: ns })
      : tr("promos.copy72");
    var lActive = tr("promos.copy73");
    var lSoon = tr("promos.copy74");
    var lEnded = tr("promos.copy75");
    var tab = function (key, lbl) { return '<button class="kx-tab' + (filter === key ? ' on' : '') + '" aria-pressed="' + (filter === key) + '" data-action="bpd-filter" data-arg="' + key + '">' + lbl + '<small>' + groups[key].length + '</small></button>'; };
    var listHtml = shown.length
      ? '<div class="bpd-rows"><div class="bpd-row th" aria-hidden="true"><span>' + tr("promos.copy76") + '</span><span>' + tr("promos.copy77") + '</span><span>' + tr("promos.copy78") + '</span><span>' + tr("promos.copy79") + '</span><span class="r">' + tr("promos.copy80") + '</span><span></span></div>' + shown.map(function (p) { return row(ctx, p, now); }).join('') + '</div>'
      : '<div class="bpd-empty bpd-section-empty"><span class="bpd-empty-icon"><i data-lucide="inbox"></i></span><h2>' + tr("promos.copy81") + '</h2><p>' + tr("promos.copy82") + '</p><button data-activation=write class="bpd-btn" data-action="bpd-new"><i data-lucide="plus"></i>' + tr("promos.copy83") + '</button></div>';
    K.appPage('promos', { title: tr("promos.copy84"), subtitle: sub, body:
      '<div class="bpd-page">' + (all.length
        ? '<div class="kx-kpi-strip cols-3 bpd-kpis"><div class="kx-kpi' + (groups.active.length ? ' good' : '') + '"><div class="l">' + lActive + '</div><div class="v">' + groups.active.length + '</div><div class="d">' + seenDesc + '</div></div>' +
          '<div class="kx-kpi"><div class="l">' + lSoon + '</div><div class="v">' + groups.soon.length + '</div><div class="d">' + tr("promos.copy85") + '</div></div>' +
          '<div class="kx-kpi"><div class="l">' + lEnded + '</div><div class="v">' + groups.ended.length + '</div><div class="d">' + tr("promos.copy86") + '</div></div></div>' +
          '<div class="bpd-bar"><div class="kx-tabs" role="group" aria-label="' + tr("promos.copy87") + '">' + tab('active', lActive) + tab('soon', lSoon) + tab('ended', lEnded) + '</div>' +
          '<div class="bpd-bar-r">' + (tillApplies() ? '<span class="bpd-sync-note"><i data-lucide="refresh-cw"></i>' + tr("promos.copy88") + '</span>' : '<span class="bpd-sync-note">' + tr("promos.copy89") + '</span>') + '<button data-activation=write class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>' + tr("promos.copy90") + '</button></div></div>' +
          listHtml + startersHtml(tr("promos.copy91"))
        : emptyHtml()) + '</div>' });
    icons();
    if (!subscribed) {
      subscribed = true;
      PRM().subscribe(function () { var active = document.querySelector('[data-nav="promos"].active'); if (active) renderPage(); });
    }
  }

  var scopes = function () {
    return [
      { id: 'tout', label: tr("promos.copy92"), icon: 'store' }, { id: 'rayon', label: tr("promos.copy93"), icon: 'layout-grid' },
      { id: 'produits', label: tr("promos.copy94"), icon: 'shirt' }, { id: 'avant', label: tr("promos.copy95"), icon: 'calendar-clock' },
      { id: 'stock', label: tr("promos.copy96"), icon: 'package-minus' }
    ];
  };
  /* Le pourcentage tapé n'est pas dans « Remises autorisées » : on le dit à
     côté du champ, avec le geste qui débloque (l'ajouter aux réglages), au lieu
     d'un bouton grisé et d'une ligne pâle en bas du formulaire. */
  function policyBlock(d) {
    var pol = window.KiwiDiscountPolicy;
    if (d.kind !== 'percent' || !d.value || !pol || !pol.configured(venueKey()) || pol.allowed(d.value, venueKey())) return null;
    var list = allowedPercents() || [];
    return { list: list, canAdd: Number.isInteger(d.value) && d.value >= 1 && d.value <= 100 && list.length < 8 };
  }
  function policyHtml(d) {
    var b = policyBlock(d); if (!b) return '';
    var list = b.list.map(function (v) { return pct(v); }).join(tr("promos.copy97"));
    return '<div class="bpd-policy" role="alert"><i data-icon="info"></i><span>' + esc(tr("promos.copy98", { p0: list, p1: list, p2: list })) + '</span>' +
      (b.canAdd ? '<button class="bpd-chip on" data-pr-allow>' + esc(tr("promos.copy99", { p0: pct(d.value), p1: pct(d.value), p2: pct(d.value) })) + '</button><small>' + esc(tr("promos.copy100")) + '</small>' : '') + '</div>';
  }
  function valid(d) {
    if (!d.value) return tr("promos.copy101");
    if (d.kind === 'percent' && window.KiwiDiscountPolicy?.configured(venueKey())
        && !window.KiwiDiscountPolicy.allowed(d.value, venueKey())) {
      var list = (allowedPercents() || []).map(function (v) { return pct(v); }).join(tr("promos.copy102"));
      return tr("promos.copy103", { p0: list, p1: list, p2: list });
    }
    var sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return tr("promos.copy104");
    if (sc.type === 'avant' && !sc.before) return tr("promos.copy105");
    if (sc.type === 'stock' && !sc.max) return tr("promos.copy106");
    if (d.to && d.from && d.to <= d.from) return tr("promos.copy107");
    if (!!d.start !== !!d.end) return tr("promos.copy108");
    if (d.start && d.start === d.end) return tr("promos.copy109");
    return '';
  }
  function autoName(ctx, d) {
    if (d.scope.type === 'avant') return tr("promos.copy110");
    if (d.scope.type === 'stock') return tr("promos.copy111");
    if (d.scope.type === 'rayon') return scopeText(ctx, d);
    if (d.scope.type === 'produits') return tr("promos.copy112");
    return d.kind === 'percent' ? tr("promos.copy113", { p0: d.value, p1: d.value, p2: d.value }) : tr("promos.copy114");
  }

  function scopeControl(ctx, d) {
    var sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="bpd-hint">' + tr("promos.copy115") + '</div>';
    if (sc.type === 'rayon') return '<div class="bpd-chips">' + ctx.rayons.map(function (r) { return '<button class="bpd-chip ' + ((sc.ids || []).indexOf(r.id) >= 0 ? 'on' : '') + '" data-prr="' + esc(r.id) + '">' + esc(r.label) + ' <small>' + r.items.length + '</small></button>'; }).join('') + '</div>';
    if (sc.type === 'produits') {
      var ids = sc.ids || [];
      return '<div class="bpd-search"><i data-lucide="search"></i><input aria-label="' + tr("promos.copy116") + '" id="bpd-q" placeholder="' + tr("promos.copy117") + '" autocomplete="off"></div>' +
        '<div class="bpd-chips">' + (ids.length ? ids.map(function (id) { return '<button class="bpd-chip on" data-prp="' + esc(id) + '">' + esc(ctx.products[id] ? ctx.products[id].name : id) + ' <i data-lucide="x"></i></button>'; }).join('') : '<span class="bpd-hint">' + tr("promos.copy118") + '</span>') + '</div><div class="bpd-hits" id="bpd-hits"></div>';
    }
    if (sc.type === 'avant') return '<div class="bpd-chips">' + [{m:3,l:tr("promos.copy119")},{m:6,l:tr("promos.copy120")},{m:12,l:tr("promos.copy121")}].map(function (o) { return '<button class="bpd-chip" data-pra="' + o.m + '">' + o.l + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-before" aria-label="' + tr("promos.copy122") + '" type="date" value="' + toInput(sc.before) + '"><div class="bpd-hint">' + tr("promos.copy123") + '</div>';
    if (sc.type === 'stock') return '<div class="bpd-chips">' + [2,3,5,10].map(function (n) { return '<button class="bpd-chip ' + (sc.max === n ? 'on' : '') + '" data-prm="' + n + '">' + tr("promos.copy124", { p0: n, p1: n, p2: n }) + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-max" aria-label="' + tr("promos.copy125") + '" type="number" min="1" value="' + (sc.max || '') + '" placeholder="' + tr("promos.copy126") + '"><div class="bpd-hint">' + tr("promos.copy127") + '</div>';
    return '';
  }

  function composerHtml(ctx) {
    var d = composer.draft;
    var prev = preview(ctx, d);
    var problem = valid(d);
    var sc = d.scope || {};
    var quick = d.kind === 'percent' ? (window.KiwiDiscountPolicy?.percentages(venueKey(), [10,20,30,50]) || [10,20,30,50]) : d.kind === 'amount' ? [20,50,100,200] : [49,99,149,199];
    var kinds = [['percent', tr("promos.copy128"), pct(20)], ['amount', tr("promos.copy129"), '−50 MAD'], ['fixed', tr("promos.copy130"), '99 MAD']];
    var presets = [['today', tr("promos.copy131")], ['we', tr("promos.copy132")], ['7', tr("promos.copy133")], ['30', tr("promos.copy134")], ['none', tr("promos.copy135")]];
    return '<div class="bpd-modal" data-bpd-host><div class="bpd-compose"><div class="bpd-form">' +
      '<section class="bpd-step"><header><span>1</span><div><b>' + tr("promos.copy136") + '</b><small>' + tr("promos.copy137") + '</small></div></header><div class="bpd-step-body">' +
      '<div class="bpd-field"><label for="bpd-name">' + tr("promos.copy138") + ' <span>' + tr("promos.copy139") + '</span></label><input class="bpd-input" id="bpd-name" maxlength="80" placeholder="' + tr("promos.copy140") + '" value="' + esc(d.name) + '"></div>' +
      '<div class="bpd-field"><label>' + tr("promos.copy141") + '</label><div class="bpd-kinds">' + kinds.map(function (x) { return '<button class="bpd-choice ' + (d.kind === x[0] ? 'on' : '') + '" aria-pressed="' + (d.kind === x[0]) + '" data-prk="' + x[0] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></button>'; }).join('') + '</div><div class="bpd-value"><span class="bpd-value-box"><input class="bpd-input" id="bpd-value" aria-label="' + tr("promos.copy142") + '" type="number" min="0" step="any" value="' + d.value + '"><span class="bpd-unit">' + (d.kind === 'percent' ? '%' : 'MAD') + '</span></span><div class="bpd-chips">' + quick.map(function (n) { return '<button class="bpd-chip ' + (d.value === n ? 'on' : '') + '" data-prv="' + n + '">' + (d.kind === 'percent' ? pct(n) : d.kind === 'amount' ? '−' + n : n) + '</button>'; }).join('') + '</div></div>' + policyHtml(d) + '</div></div></section>' +
      '<section class="bpd-step"><header><span>2</span><div><b>' + tr("promos.copy143") + '</b><small>' + tr("promos.copy144") + '</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-scopes">' + scopes().map(function (x) { return '<button class="bpd-choice ' + (sc.type === x.id ? 'on' : '') + '" aria-pressed="' + (sc.type === x.id) + '" data-prs="' + x.id + '"><i data-lucide="' + x.icon + '"></i><b>' + x.label + '</b></button>'; }).join('') + '</div><div class="bpd-scopebody">' + scopeControl(ctx, d) + '</div></div></div></section>' +
      '<section class="bpd-step"><header><span>3</span><div><b>' + tr("promos.copy145") + '</b><small>' + tr("promos.copy146") + '</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-chips">' + presets.map(function (x) { return '<button class="bpd-chip" data-prw="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><div class="bpd-dates"><div><label for="bpd-from">' + tr("promos.copy147") + ' <span>' + tr("promos.copy148") + '</span></label><input class="bpd-input" id="bpd-from" type="date" value="' + toInput(d.from) + '"></div><div><label for="bpd-to">' + tr("promos.copy149") + ' <span>' + tr("promos.copy150") + '</span></label><input class="bpd-input" id="bpd-to" type="date" value="' + toInput(d.to) + '"></div></div></div>' +
        '<div class="bpd-field"><label>' + tr("promos.copy151") + ' <span>' + tr("promos.copy152") + '</span></label><div class="bpd-chips bpd-days" role="group" aria-label="' + tr("promos.copy153") + '">' + WEEK.map(function (wd) { var on = (d.days || []).indexOf(wd) >= 0; return '<button class="bpd-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-prd="' + wd + '">' + dayShort(wd) + '</button>'; }).join('') + '</div></div>' +
        '<div class="bpd-field"><label>' + tr("promos.copy154") + ' <span>' + tr("promos.copy155") + '</span></label><div class="bpd-dates"><div><input class="bpd-input" id="bpd-start" type="time" step="900" aria-label="' + tr("promos.copy156") + '" value="' + esc(d.start || '') + '"></div><div><input class="bpd-input" id="bpd-end" type="time" step="900" aria-label="' + tr("promos.copy157") + '" value="' + esc(d.end || '') + '"></div></div><div class="bpd-hint">' + tr("promos.copy158") + '</div></div>' +
        '</div></section>' +
      '</div><aside class="bpd-preview" data-surface="inverse"><span class="bpd-preview-live"><i></i>' + tr("promos.copy159") + '</span><div class="bpd-preview-head"><span>' + tr("promos.copy160") + '</span><b>' + prev.count + '</b><em>' + tr("promos.copy161", { p0: (prev.count > 1 ? 's' : ''), p1: (prev.count === 1 ? '' : 's'), p2: arW(prev.count, ITEM) }) + '</em></div>' +
      (prev.count ? '<div class="bpd-swap"><div><span>' + tr("promos.copy162") + '</span><b>' + money(prev.from) + '</b></div><i data-lucide="arrow-right"></i><div class="next"><span>' + tr("promos.copy163") + '</span><b>' + money(prev.to) + '</b></div></div><div class="bpd-give">' + tr("promos.copy164", { p0: money(prev.from - prev.to), p1: money(prev.from - prev.to), p2: money(prev.from - prev.to) }) + '</div>' + (prev.under ? '<div class="bpd-warn"><i data-lucide="alert-triangle"></i><span><b>' + tr("promos.copy165", { p0: prev.under, p1: (prev.under > 1 ? 's passent' : ' passe'), p2: prev.under, p3: (prev.under === 1 ? ' falls' : 's fall'), p4: arN(prev.under, ITEM, 'صنف واحد') }) + '</b></span></div>' : '') + '<div class="bpd-sample">' + prev.sample.map(function (x) { return '<div class="bpd-srow"><span class="name">' + esc(x.name) + '</span><span class="prices"><s>' + money(x.was) + '</s><b>' + money(x.price) + '</b></span></div>'; }).join('') + '</div>' : '<div class="bpd-none">' + esc(problem || tr("promos.copy166")) + '</div>') + '</aside></div>' +
      '<div class="bpd-compose-foot"><span class="bpd-problem' + (problem ? ' is-bad' : '') + '">' + (problem ? '<i data-lucide="info"></i>' + esc(problem) : '<i data-lucide="check-circle-2"></i>' + (composer.editing ? tr("promos.copy167") : tr("promos.copy168"))) + '</span><span class="bpd-compose-actions"><button class="bpd-btn" data-bpd-cancel>' + tr("promos.copy169") + '</button><button data-activation=write class="bpd-btn primary" id="bpd-save" ' + (problem || !prev.count ? 'disabled' : '') + '><i data-lucide="check"></i>' + (composer.editing ? tr("promos.copy170") : tr("promos.copy171")) + '</button></span></div></div>';
  }

  /* Les pourcentages que le propriétaire autorise (Réglages), ou null quand
     il n'a rien restreint. */
  function allowedPercents() {
    var pol = window.KiwiDiscountPolicy;
    return pol && pol.configured(venueKey()) ? pol.percentages(venueKey()).slice().sort(function (a, b) { return a - b; }) : null;
  }
  /* Un brouillon ne s'ouvre jamais sur une valeur que la boutique refuse :
     sinon le bouton « Lancer » est grisé avant même le premier geste. On prend
     le pourcentage autorisé le plus proche de celui proposé. */
  function fitPolicy(d) {
    var ok = allowedPercents();
    if (!ok || !ok.length || d.kind !== 'percent' || ok.indexOf(d.value) >= 0) return d;
    d.value = ok.reduce(function (best, v) { return Math.abs(v - d.value) < Math.abs(best - d.value) ? v : best; }, ok[0]);
    return d;
  }
  function openComposer(seed) {
    /* Le composeur s'ouvre aussi hors de la page Promotions (un modèle proposé
       ailleurs) : ses styles ne doivent pas dépendre d'y être passé avant. */

    var ctx = context();
    composer.editing = seed && seed.id ? seed.id : null;
    composer.draft = PRM().normalize(seed || { name:'', kind:'percent', value:20, scope:{type:'tout'} });
    if (!composer.editing) fitPolicy(composer.draft);
    if (!seed) composer.draft.name = '';
    promoModal = K.modal({ title: composer.editing ? tr("promos.copy172") : tr("promos.copy173"), desc: tr("promos.copy174"), width: 1080, body: '<div data-bpd-shell></div>', foot: '' });
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
    el.querySelectorAll('[data-prk]').forEach(function (b) { b.onclick = function () { d.kind = b.dataset.prk; fitPolicy(d); redraw(); }; });
    var val = el.querySelector('#bpd-value'); if (val) val.onchange = function () { d.value = Math.max(0, Math.round((+val.value || 0) * 100) / 100); redraw(); };
    var allow = el.querySelector('[data-pr-allow]');
    if (allow) allow.onclick = function () {
      var pol = window.KiwiDiscountPolicy; allow.disabled = true;
      Promise.resolve().then(function () { return pol.save(pol.percentages().concat([d.value])); /* comme Réglages › Remises autorisées : le magasin courant */ })
        .then(function () { K.toast(tr("promos.copy175", { p0: pct(d.value), p1: pct(d.value), p2: pct(d.value) }), { type: 'success' }); redraw(); })
        .catch(function () { allow.disabled = false; K.toast(tr("promos.copy176"), { type: 'warn' }); });
    };
    el.querySelectorAll('[data-prv]').forEach(function (b) { b.onclick = function () { d.value = +b.dataset.prv; redraw(); }; });
    el.querySelectorAll('[data-prs]').forEach(function (b) { b.onclick = function () { d.scope = PRM().normalize({ scope:{type:b.dataset.prs} }).scope; redraw(); }; });
    el.querySelectorAll('[data-prr]').forEach(function (b) { b.onclick = function () { var ids = d.scope.ids || (d.scope.ids=[]); var i=ids.indexOf(b.dataset.prr); if(i>=0) ids.splice(i,1); else ids.push(b.dataset.prr); redraw(); }; });
    el.querySelectorAll('[data-prp]').forEach(function (b) { b.onclick = function () { var i=d.scope.ids.indexOf(b.dataset.prp); if(i>=0)d.scope.ids.splice(i,1); redraw(); }; });
    var q = el.querySelector('#bpd-q');
    if (q) {
      var hits = el.querySelector('#bpd-hits');
      var paint = function () { var term=q.value.trim().toLowerCase(); if(!term){hits.innerHTML='';return;} var by=ctx.byEan[q.value.trim()]; var found=by?[ctx.products[by]].filter(Boolean):items(ctx).filter(function(it){return it.name.toLowerCase().indexOf(term)>=0;}).slice(0,8); hits.innerHTML=found.map(function(it){return '<button class="bpd-hit" data-pick="'+esc(it.id)+'"><span>'+esc(it.name)+'</span><b>'+money(it.price)+'</b></button>';}).join('')||'<div class="bpd-hint">'+tr("promos.copy177")+'</div>'; hits.querySelectorAll('[data-pick]').forEach(function(b){b.onclick=function(){var ids=d.scope.ids||(d.scope.ids=[]);if(ids.indexOf(b.dataset.pick)<0)ids.push(b.dataset.pick);redraw();};}); };
      q.oninput = paint; q.onkeydown = function(e){if(e.key==='Enter'){e.preventDefault();paint();}};
    }
    el.querySelectorAll('[data-pra]').forEach(function(b){b.onclick=function(){d.scope.before=startOfDay(new Date(Date.now()-(+b.dataset.pra)*30*DAY));redraw();};});
    /* Les champs date et heure ne reconstruisent PAS le formulaire : Chrome
       émet « change » à chaque chiffre tapé, et la reconstruction renvoyait en
       haut de la fenêtre avec le champ désélectionné au milieu de la saisie.
       Seuls l'aperçu et le pied (message, bouton) sont rafraîchis. */
    var soft=function(){var tmp=document.createElement('div');tmp.innerHTML=composerHtml(ctx);['.bpd-preview','.bpd-compose-foot'].forEach(function(sel){var a=el.querySelector(sel),b=tmp.querySelector(sel);if(a&&b)a.replaceWith(b);});bindFoot();icons();};
    var before=el.querySelector('#bpd-before');if(before)before.onchange=function(){d.scope.before=before.value?startOfDay(before.value):0;soft();};
    el.querySelectorAll('[data-prm]').forEach(function(b){b.onclick=function(){d.scope.max=+b.dataset.prm;redraw();};});
    var max=el.querySelector('#bpd-max');if(max)max.onchange=function(){d.scope.max=Math.max(0,Math.round(+max.value||0));redraw();};
    el.querySelectorAll('[data-prw]').forEach(function(b){b.onclick=function(){var key=b.dataset.prw,now=new Date();if(key==='none')d.to=0;else if(key==='today')d.to=endOfDay(now);else if(key==='we')d.to=endOfDay(new Date(now.getTime()+((7-new Date(toInput(+now)+'T12:00:00Z').getUTCDay())%7)*DAY));else d.to=endOfDay(new Date(now.getTime()+(+key)*DAY));redraw();};});
    var from=el.querySelector('#bpd-from');if(from)from.onchange=function(){d.from=from.value?startOfDay(from.value):0;soft();};
    var to=el.querySelector('#bpd-to');if(to)to.onchange=function(){d.to=to.value?endOfDay(to.value):0;soft();};
    el.querySelectorAll('[data-prd]').forEach(function(b){b.onclick=function(){var wd=+b.dataset.prd,days=(d.days||[]).slice(),i=days.indexOf(wd);if(i>=0)days.splice(i,1);else days.push(wd);d.days=days.length===7?[]:days.sort(function(a,z){return a-z;});redraw();};});
    var hStart=el.querySelector('#bpd-start');if(hStart)hStart.onchange=function(){d.start=hStart.value||'';soft();};
    var hEnd=el.querySelector('#bpd-end');if(hEnd)hEnd.onchange=function(){d.end=hEnd.value||'';soft();};
    bindFoot();
    function bindFoot(){
    el.querySelector('[data-bpd-cancel]').onclick=function(){promoModal.close();};
    var save=el.querySelector('#bpd-save');if(save)save.onclick=function(){if(valid(d))return;if(!d.name.trim())d.name=autoName(ctx,d);if(composer.editing)d.id=composer.editing;PRM().save(d);promoModal.close();announce(composer.editing?tr("promos.copy178", { p0: d.name, p1: d.name, p2: d.name }):(tillApplies()?tr("promos.copy179", { p0: d.name, p1: d.name, p2: d.name }):tr("promos.copy180", { p0: d.name, p1: d.name, p2: d.name })),tr("promos.copy181", { p0: d.name, p1: d.name, p2: d.name }),'success');renderPage();};
    }
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

  document.addEventListener('kiwi:langchange', function () { if (document.querySelector('[data-nav="promos"].active')) renderPage(); });
  H['nav-promos'] = renderPage;
  H['bpd-filter'] = function (_el,arg) { filter=arg||'active';renderPage(); };
  H['bpd-new'] = function () { openComposer(null); };
  H['bpd-starter'] = function (_el,arg) { openComposer(starter(arg)); };
  H['bpd-edit'] = function (_el,arg) { var p=PRM().get(arg);if(p)openComposer(p); };
  H['bpd-toggle'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;PRM().setPaused(arg,!p.paused);var said=p.paused?tr("promos.copy182", { p0: p.name, p1: p.name, p2: p.name }):tr("promos.copy183", { p0: p.name, p1: p.name, p2: p.name });announce(said,said,p.paused?'success':'warn');renderPage(); };
  H['bpd-delete'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;var m=K.modal({title:tr("promos.copy184", { p0: p.name, p1: p.name, p2: p.name }),desc:tr("promos.copy185"),width:470,foot:'<button class="kb ghost" data-cancel>'+tr("promos.copy186")+'</button><button data-activation=write class="kb danger" data-delete>'+tr("promos.copy187")+'</button>'});m.el.querySelector('[data-cancel]').onclick=m.close;m.el.querySelector('[data-delete]').onclick=function(){PRM().remove(arg);m.close();var gone=tr("promos.copy188", { p0: p.name, p1: p.name, p2: p.name });announce(gone,gone,'warn');renderPage();}; };
  H['bpd-print'] = function (_el,arg) { var plan=labelPlan(arg);if(!plan.promo)return;var n=plan.labels.length;var m=K.modal({title:tr("promos.copy189")+plan.promo.name,desc:n?tr("promos.copy190"):tr("promos.copy191"),width:520,body:n?'<div class="bpd-print-summary"><b>'+n+'</b><span>'+tr("promos.copy192", { p0: (n>1?'s':''), p1: plan.products, p2: (plan.products>1?'s':''), p3: (plan.products>1?'s':''), p4: (n===1?'':'s'), p5: plan.products, p6: (plan.products===1?'':'s'), p7: arN(n,['ملصق','ملصقان','ملصقات','ملصقًا'],'ملصق واحد'), p8: plan.products })+'</span></div>':'',foot:'<button class="kb ghost" data-cancel>'+ (n?tr("promos.copy193"):tr("promos.copy194")) +'</button>'+(n?'<button data-activation=write data-activation=write class="kb atlas" data-print><i data-lucide="printer"></i>'+tr("promos.copy195")+n+'</button>':'')});m.el.querySelector('[data-cancel]').onclick=m.close;var b=m.el.querySelector('[data-print]');if(b)b.onclick=function(){m.close();window.KiwiBarcode.printLabels(plan.labels,{copies:1});};icons(); };
})();
