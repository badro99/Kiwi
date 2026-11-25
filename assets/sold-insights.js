/* Kiwi · Vendus — product intelligence shared by boutique caisse + dashboard.
 * Reads the existing tenant-scoped sales ledger; it never creates a second
 * analytics database and never fills gaps with demo numbers. */
(function () {
  'use strict';

  /* Le tableau de bord donne sa langue par KiwiI18n. La caisse n'a pas ce
     module : caisse-lang.js pose la langue choisie sur <html lang>, on la lit là.
     Chaque phrase de cette page porte déjà son anglais et son arabe dans L(). */
  var lang = function () {
    try {
      var l = (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || String(document.documentElement.getAttribute('lang') || '').slice(0, 2);
      return l === 'en' || l === 'ar' ? l : 'fr';
    } catch (_) { return 'fr'; }
  };
  function L(fr, en, ar) { var l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; }
  /* English / Arabic counted nouns (French stays inline where it was). */
  function enItems(n) { return n + (n === 1 ? ' item' : ' items'); }
  function arItems(n, nom) { return n === 1 ? 'قطعة واحدة' : n === 2 ? (nom ? 'قطعتان' : 'قطعتين') : n + (n >= 3 && n <= 10 ? ' قطع' : ' قطعة'); }
  function enDays(n) { return n + (n === 1 ? ' day' : ' days'); }
  function arDays(n) { return n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n + (n >= 3 && n <= 10 ? ' أيام' : ' يومًا'); }

  var DAY = 86400000;
  var tillSales = [];
  var tillMerchant = '';
  var tillLoading = false;
  var tillFetched = false;
  var tillLoadedFrom = Infinity;
  var dashboardDays = 30;
  var tillDays = 7;
  var dashboardRange = null;
  /* Tant que le patron n'a pas choisi de période SUR cette page, « Vendus » suit
     la période du tableau de bord (Aujourd'hui, 7 jours…). Elle partait sur ses
     propres 30 jours : un ticket d'hier y apparaissait quand l'accueil disait
     « aujourd'hui », et les deux écrans ne tombaient jamais d'accord. */
  var dashboardPicked = false;
  function sharedPeriod() {
    var k = '';
    try { k = String(localStorage.getItem('kiwiDateRange') || ''); } catch (_) { return null; }   // la période du sélecteur
    if (!k) k = 'aujourdhui';                       // le défaut du tableau de bord
    if (k === 'septJours') return 7;
    if (k === 'trenteJours') return 30;
    var today = parseDateKey(businessToday());
    if (!today || (k !== 'aujourdhui' && k !== 'hier')) return null;
    if (k === 'hier') today = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    return { from: dateKey(today), to: dateKey(today) };
  }
  var tillRange = null;

  function dateKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }
  function parseDateKey(value) {
    var m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
  }
  /* The store's business day (cutoff 05:00 by default, store zone): at 01:30
     the service still running is yesterday's date, as on the Z. */
  function businessToday() {
    try {
      var R = window.KiwiDayReport;
      if (R && typeof R.today === 'function') { var d = R.today(slug()); if (parseDateKey(d)) return d; }
    } catch (_) {}
    return dateKey(new Date());
  }
  function dayRange(firstKey, lastKey, first, last) {
    try {
      var R = window.KiwiDayReport;
      if (R && typeof R.dayBounds === 'function') {
        var a = R.dayBounds(firstKey, slug()), b = R.dayBounds(lastKey, slug());
        if (a && b && isFinite(a.from) && isFinite(b.to)) return { from:a.from, to:b.to };
      }
    } catch (_) {}
    return { from:first.getTime(), to:new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime() };
  }
  function freshPicker() {
    var today = businessToday();
    return { open:false, mode:'day', day:today, from:today, to:today, error:'' };
  }
  var dashboardPicker = freshPicker();
  var tillPicker = freshPicker();

  function bounds(period) {
    if (period && typeof period === 'object') {
      var first = parseDateKey(period.from), last = parseDateKey(period.to || period.from);
      if (first && last && first.getTime() <= last.getTime()) {
        var span = dayRange(dateKey(first), dateKey(last), first, last), from = span.from, to = span.to;
        var days = Math.round((Date.UTC(last.getFullYear(), last.getMonth(), last.getDate()) - Date.UTC(first.getFullYear(), first.getMonth(), first.getDate())) / DAY) + 1;
        /* The previous period starts the same number of civil days earlier, at
           its own cutoff: subtracting a duration drifts an hour across a DST day. */
        var prev = new Date(first.getFullYear(), first.getMonth(), first.getDate() - days);
        var previousFrom = dayRange(dateKey(prev), dateKey(prev), prev, prev).from;
        return { days:days, from:from, to:to, previousFrom:previousFrom, custom:{from:dateKey(first),to:dateKey(last)} };
      }
    }
    /* « Aujourd'hui », « 7 jours », « 30 jours » : des journées d'activité
       entières qui finissent aujourd'hui, comme le Z. C'était « les dernières
       24 h » : à 17 h 29, Aujourd'hui montrait encore les ventes d'hier soir. */
    var count = Math.max(1, Math.round(Number(period) || 7));
    var today = parseDateKey(businessToday()) || new Date();
    var cal = bounds({ from: dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - count + 1)), to: dateKey(today) });
    if (cal && cal.custom) return { days:count, from:cal.from, to:Infinity, previousFrom:cal.previousFrom, custom:null };
    var now = Date.now(), start = now - count * DAY;
    return { days:count, from:start, to:Infinity, previousFrom:start-count*DAY, custom:null };
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function fmt(v) { var n = Number(v) || 0, cents = Math.round(Number(Math.abs(n).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))), opts = { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }; n = Math.sign(n) * cents / 100; try { return window.KiwiNumber?.format(n, opts) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', opts); } catch (_) { return String(n); } }
  function slug() {
    try {
      if (window.KiwiPlatform && typeof window.KiwiPlatform.pairedMerchant === 'function') {
        var pm = window.KiwiPlatform.pairedMerchant();
        if (pm) return pm;
      }
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((window.KiwiLive && KiwiLive.merchant && KiwiLive.merchant()) || (p && p.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function catalog() {
    var api = window.KiwiBoutiqueCatalog;
    var cats = {}, products = [];
    if (!api) return { cats: cats, products: products };
    var byId = {};
    try { (api.listCategories() || []).forEach(function (c) { cats[String(c.id)] = String(c.name || L('Divers', 'Other', 'متفرقات')); }); } catch (_) {}
    try { products = api.listProducts({}) || []; } catch (_) { try { products = api.listProducts() || []; } catch (__) {} }
    products.forEach(function (p) {
      try { p._soldStock = (api.listVariants(p.id) || []).reduce(function(n,v){return n + Math.max(0,Number(v.stock)||0);},0); }
      catch (_) { p._soldStock = null; }
      byId[String(p.id)] = p;
    });
    return { cats: cats, products: products, byId: byId };
  }
  /* Une ligne de vente boutique est rangée par IDENTIFIANT (`pid`), pas par
     libellé : `kiwi:bqDay` enregistre {pid,size,color,qty,unit,…} et n'écrit
     aucun `name`. Chercher d'abord par nom ne trouvait donc jamais rien, et
     l'écran « Vendus » affichait chaque article de la boutique comme
     « Article · Sans catégorie », sans stock ni rayon. On résout par id quand
     on en a un, et on garde la recherche par nom pour les ventes qui viennent
     de la caisse principale (elles, portent un libellé). */
  function productById(id, cat) {
    var k = String(id == null ? '' : id);
    return (k && cat.byId && cat.byId[k]) || null;
  }
  function productFor(name, cat) {
    var low = String(name || '').toLocaleLowerCase('fr');
    return (cat.products || []).filter(function (p) {
      var n = String(p.name || '').toLocaleLowerCase('fr');
      return low === n || low.indexOf(n + ' ') === 0;
    }).sort(function (a, b) { return String(b.name || '').length - String(a.name || '').length; })[0] || null;
  }
  function normalize(raw, cat) {
    var ts = Number(raw && (raw.ts || raw.at)) || new Date(raw && raw.at || 0).getTime() || 0;
    var lines = Array.isArray(raw && raw.lines) ? raw.lines.map(function (l) {
      var p = productById(l && (l.pid || l.ref), cat) || productFor(l && l.name, cat);
      var qty = (Number.isFinite(Number(l && l.qty)) && Number(l && l.qty) > 0 ? Number(l.qty) : 1);
      var total = Number(l && l.total);
      if (!Number.isFinite(total)) total = (Number(l && (l.unit || l.unitPrice)) || 0) * qty;
      var cid = String((l && (l.cat || l.category || l.categoryId)) || (p && p.categoryId) || '');
      return { name: String((p && p.name) || (l && l.name) || L('Article', 'Item', 'صنف')), qty: qty, total: Math.max(0, total || 0), cat: cat.cats[cid] || String((l && (l.cat || l.category)) || L('Divers', 'Other', 'متفرقات')), stock: p && p._soldStock };
    }).filter(function (l) { return l.name; }) : [];
    return { ts: ts, amount: Math.max(0, Number(raw && (raw.amount || raw.total)) || 0), ref: String(raw && (raw.ref || raw.id) || ''), lines: lines };
  }
  /* ══════════ L'ARGENT : DANS LA CAISSE OU CHEZ LE LIVREUR ══════════════════
   * Le chiffre « produits » additionnait le prix de tout ce qui était sorti du
   * magasin. Une livraison payée à la réception y comptait plein pot alors que
   * la caisse n'en avait pas encore vu un dirham : Santos, le 25 novembre,
   * lisait 10 750 MAD pour 4 100 réellement encaissés et 6 050 chez le livreur.
   * On sépare donc les deux, ticket par ticket :
   *  · dans la caisse = ce qui a été payé au comptoir (espèces, carte, virement,
   *    chèque ; ni l'avoir ni la part « livraison ») + ce que le livreur a
   *    rapporté pendant la période (les ventes « Livraison reçue · … ») ;
   *  · chez le livreur = la part « livraison » des tickets de la période, moins
   *    ce qui en a déjà été rapporté.
   * Un ticket connu du serveur ET du journal local compte une fois, avec les
   * chiffres du serveur. Une vente annulée ne compte pas. */
  var COURIER_M = /^(delivery|livraison)$/i, CREDIT_M = /^(avoir|credit|store-?credit)$/i;
  function tsOf(raw) { return Number(raw && (raw.ts || raw.at)) || new Date(raw && raw.at || 0).getTime() || 0; }
  function cts(v) { var n = Math.round(Number(v) * 100); return Number.isFinite(n) ? n : 0; }
  function isCollection(raw) { return /^Livraison re[çc]ue/i.test(String(raw && raw.label || '')) && !COURIER_M.test(String(raw && raw.method || '')); }
  function partsOf(raw) {
    var list = Array.isArray(raw.paymentParts) ? raw.paymentParts : Array.isArray(raw.parts) ? raw.parts : null;
    return list && list.map(function (p) {
      return { m: String(p && (p.method || p.m) || ''), c: p && p.amountCents != null ? Math.round(Number(p.amountCents)) || 0 : cts(p && p.amount) };
    });
  }
  function moneySplit(source, span, cat) {
    var inSpan = function (ts) { return ts >= span.from && ts < span.to; };
    var rows = (source || []).filter(function (r) { return r && !r.voided; });
    var out = { till:0, courier:0, counter:0, pending:0, deliveries:0, brought:0, list:[] };
    var back = {}, seen = {}, tickets = {}, basket = {}, collected = [];
    /* Chaque ticket rejoint l'historique là où est son argent (voir body()). */
    var linesOf = function (r) { try { return cat ? normalize(r, cat).lines : []; } catch (_) { return []; } };
    rows.forEach(function (r) {
      if (!isCollection(r)) return;
      var id = String(r.id || r.saleId || tsOf(r) + ':' + r.label);
      if (seen[id]) return; seen[id] = 1;
      var c = r.amountCents != null ? Math.round(Number(r.amountCents)) || 0 : cts(r.amount);
      if (c <= 0) return;
      var ref = String(r.ref || r.receiptRef || '');
      if (ref) back[ref] = (back[ref] || 0) + c;
      if (inSpan(tsOf(r))) { out.till += c; out.brought += c; collected.push({ kind:'brought', ref:ref, ts:tsOf(r), cents:c, lines:linesOf(r) }); }
    });
    function take(r) {
      if (isCollection(r)) return;
      var ref = String(r.ref || r.receiptRef || r.id || '');
      if (!ref || tickets[ref]) return;
      var parts = partsOf(r), owed = 0, cash = 0;
      if (parts) parts.forEach(function (p) { if (COURIER_M.test(p.m)) owed += Math.max(0, p.c); else if (!CREDIT_M.test(p.m)) cash += p.c; });
      if (r.amountCents != null) cash = Math.round(Number(r.amountCents)) || 0;
      else if (!parts) cash = cts(r.amount != null ? r.amount : r.total);
      if (cash < 0) return;                       /* un remboursement : cette page ne déduit pas les retours */
      if (!owed && COURIER_M.test(String(r.method || '')) && Array.isArray(r.lines)) {
        owed = r.lines.reduce(function (n, l) { return n + Math.max(0, cts(l && l.total)); }, 0);
      }
      tickets[ref] = 1;
      var lines = linesOf(r); if (lines.length) basket[ref] = lines;
      if (!inSpan(tsOf(r))) return;
      var ts = tsOf(r), goods = lines.reduce(function (n, l) { return n + cts(l.total); }, 0);
      out.till += cash; if (cash > 0) { out.counter++; out.list.push({ kind:'till', ref:ref, ts:ts, cents:cash, lines:lines, mixed:owed > 0 }); }
      if (owed > 0) {
        var left = Math.max(0, owed - (back[ref] || 0));
        out.deliveries++; out.courier += left;
        if (left > 0) { out.pending++; out.list.push({ kind:'courier', ref:ref, ts:ts, cents:left, owed:owed, lines:lines }); }
      }
      if (cash <= 0 && owed <= 0 && goods > 0) out.list.push({ kind:'credit', ref:ref, ts:ts, cents:goods, lines:lines });
    }
    rows.filter(function (r) { return r.amountCents != null; }).forEach(take);
    rows.filter(function (r) { return r.amountCents == null; }).forEach(take);
    collected.forEach(function (c) { if (!c.lines.length && basket[c.ref]) c.lines = basket[c.ref]; out.list.push(c); });
    out.list.sort(function (x, y) { return y.ts - x.ts; });
    return out;
  }
  function analyze(source, period) {
    var cat = catalog();
    var span = bounds(period), days = span.days, from = span.from, to = span.to, previousFrom = span.previousFrom;
    var seen = {};
    var all = (source || []).filter(function (s) { return s && !s.voided && !isCollection(s); }).map(function (s) { return normalize(s, cat); }).filter(function (s) {
      if (!s.ts || !s.lines.length) return false;
      var key = s.ref || [s.ts,s.amount,s.lines.map(function(l){return l.name+':'+l.qty;}).join('|')].join(':');
      if (seen[key]) return false; seen[key] = 1; return true;
    });
    var sales = all.filter(function (s) { return s.ts >= from && s.ts < to; });
    var previous = all.filter(function (s) { return s.ts >= previousFrom && s.ts < from; });
    var products = {}, categories = {}, pairs = {}, revenue = 0, units = 0;
    function addLine(line, ts, target) {
      var k = line.name.toLocaleLowerCase('fr');
      var p = target[k] || (target[k] = { name: line.name, qty: 0, revenue: 0, category: line.cat, last: 0, stock: line.stock });
      p.qty += line.qty; p.revenue += line.total; p.last = Math.max(p.last, ts);
    }
    sales.forEach(function (sale) {
      /* Le chiffre de l'en-tête est la somme de ses lignes (ventes brutes). Il
         lisait le montant encaissé du ticket : la part réglée par avoir d'un
         ticket mixte (30 d'avoir + 380 d'espèces) en sortait, et l'en-tête
         disait 30 MAD de moins que les produits listés dessous. */
      revenue += sale.lines.reduce(function (n, l) { return n + l.total; }, 0);
      var basket = {};
      sale.lines.forEach(function (line) {
        addLine(line, sale.ts, products); units += line.qty;
        var c = categories[line.cat] || (categories[line.cat] = { name: line.cat, qty: 0, revenue: 0 });
        c.qty += line.qty; c.revenue += line.total; basket[line.name] = 1;
      });
      var names = Object.keys(basket).sort();
      for (var i = 0; i < names.length; i++) for (var j = i + 1; j < names.length; j++) {
        var key = names[i] + '\u0000' + names[j];
        pairs[key] = (pairs[key] || 0) + 1;
      }
    });
    var prevProducts = {};
    previous.forEach(function (sale) { sale.lines.forEach(function (line) { addLine(line, sale.ts, prevProducts); }); });
    var prod = Object.keys(products).map(function (k) {
      var p = products[k], prev = prevProducts[k];
      p.previousQty = prev ? prev.qty : 0;
      p.delta = p.previousQty ? Math.round((p.qty - p.previousQty) / p.previousQty * 100) : null;
      return p;
    }).sort(function (a, b) { return b.qty - a.qty || b.revenue - a.revenue; });
    var pairRows = Object.keys(pairs).map(function (k) { var n = k.split('\u0000'); return { a:n[0], b:n[1], count:pairs[k] }; }).sort(function (a,b) { return b.count-a.count; });
    return {
      days: days, custom: span.custom, from: from, to: to, sales: sales.sort(function(a,b){return b.ts-a.ts;}), tickets: sales.length, units: units, revenue: revenue,
      products: prod, categories: Object.keys(categories).map(function(k){return categories[k];}).sort(function(a,b){return b.qty-a.qty;}),
      pairs: pairRows, previousTickets: previous.length, catalogCount: cat.products.length, money: moneySplit(source, span, cat),
    };
  }
  function ensureStyle() {
    if (document.getElementById('kiwi-sold-style')) return;
    var s = document.createElement('style'); s.id = 'kiwi-sold-style';
    s.textContent = '.ksold{padding:24px;max-width:1280px;margin:auto;color:var(--ink,#111)}.ksold-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:18px}.ksold-head h1{margin:0;font-size:28px}.ksold-sub{font-size:12px;color:var(--n-500,#777);margin-top:5px}.ksold-days{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ksold-days button{border:1px solid var(--n-200,#ddd);background:var(--surface,#fff);padding:8px 12px;border-radius:999px;font:600 11px var(--sans);cursor:pointer}.ksold-days button.on{background:var(--ink,#111);color:var(--paper,#fff);border-color:var(--ink,#111)}.ksold-picker{display:flex;justify-content:flex-end;margin:-8px 0 18px}.ksold-picker-box{width:min(100%,430px);padding:14px;border:1px solid var(--n-200,#ddd);border-radius:16px;background:var(--surface,#fff);box-shadow:0 18px 50px -24px rgba(10,15,13,.28)}.ksold-modes{display:flex;gap:5px;margin-bottom:12px}.ksold-modes button{flex:1;border:1px solid var(--n-200,#ddd);background:var(--paper-soft,#f5f3ef);padding:8px;border-radius:10px;font:600 11px var(--sans);cursor:pointer}.ksold-modes button.on{background:var(--ink,#111);color:var(--paper,#fff);border-color:var(--ink,#111)}.ksold-date-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ksold-date-fields.one{grid-template-columns:1fr}.ksold-date-fields label{font:600 10px var(--sans);letter-spacing:.04em;text-transform:uppercase;color:var(--n-500,#777)}.ksold-date-fields input{display:block;width:100%;margin-top:5px;border:1px solid var(--n-200,#ddd);border-radius:10px;background:var(--surface,#fff);color:var(--ink,#111);padding:9px;font:600 12px var(--sans);color-scheme:light}.ksold-picker-actions{display:flex;justify-content:flex-end;align-items:center;gap:7px;margin-top:12px}.ksold-picker-actions button{border:0;border-radius:10px;padding:8px 12px;font:600 11px var(--sans);cursor:pointer}.ksold-picker-actions [data-ksold-cancel]{background:transparent;color:var(--n-600,#666)}.ksold-picker-actions [data-ksold-apply]{background:var(--atlas,#087a5b);color:white}.ksold-date-error{margin-right:auto;font:600 11px var(--sans);color:#a13d2d}.ksold-card{border:1px solid var(--n-200,#e5e2dc);background:var(--surface,#fff);border-radius:16px}.ksold-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.ksold-card{padding:17px;min-width:0}.ksold-card h2{font-size:15px;font-weight:600;letter-spacing:-.015em;margin:0 0 4px}.ksold-note{font-size:12px;color:var(--n-500,#777);margin-bottom:12px}.ksold-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:10px 0;border-top:1px solid var(--n-100,#eee)}.ksold-row:first-of-type{border-top:0}.ksold-name{font-size:13px;font-weight:600}.ksold-meta{font-size:11px;color:var(--n-500,#777);margin-top:3px}.ksold-val{text-align:right;font:600 12.5px var(--sans);letter-spacing:-.012em;font-variant-numeric:tabular-nums}.ksold-bar{height:4px;background:var(--n-100,#eee);border-radius:9px;margin-top:6px;overflow:hidden}.ksold-bar i{display:block;height:100%;background:var(--atlas,#087a5b);border-radius:9px}.ksold-ai{border-color:color-mix(in srgb,var(--atlas,#087a5b) 35%,transparent);background:color-mix(in srgb,var(--atlas,#087a5b) 5%,var(--surface,#fff))}.ksold-ai-tag{font:600 10px var(--sans);letter-spacing:.085em;text-transform:uppercase;color:var(--atlas,#087a5b);margin-bottom:10px}.ksold-rec{padding:11px 0;border-top:1px solid color-mix(in srgb,var(--atlas,#087a5b) 16%,transparent)}.ksold-rec b{display:block;font-size:13px;margin-bottom:4px}.ksold-rec p{font-size:12px;line-height:1.45;color:var(--n-600,#666);margin:0}.ksold-full{grid-column:1/-1}.ksold-time{font:11px var(--sans);font-variant-numeric:tabular-nums;color:var(--n-500,#777);margin-top:2px}@media(max-width:850px){.ksold{padding:16px}.ksold-head{align-items:flex-start;flex-direction:column}.ksold-days{justify-content:flex-start}.ksold-picker{justify-content:flex-start}.ksold-grid{grid-template-columns:1fr}.vx-view .ksold .ksold-grid{grid-template-columns:1fr!important}}@media(max-width:520px){.ksold-date-fields{grid-template-columns:1fr}}';
    /* The till does not load genpage.css. Keep the shared KPI and empty-state
       primitives inside this component too, otherwise the figures collapse
       into plain text and the raw SVG expands across the whole caisse. */
    s.textContent += '.ksold .kx-kpi-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--n-200,#dedbd5);border:1px solid var(--n-200,#dedbd5);border-radius:18px;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 2px rgba(10,15,13,.04),0 10px 26px -16px rgba(10,15,13,.1)}.ksold .kx-kpi{background:var(--surface,#fff);padding:15px 18px 16px;min-width:0}.ksold .kx-kpi .l{font:500 10px/1.3 var(--sans);letter-spacing:.075em;color:var(--n-500,#777);text-transform:uppercase}.ksold .kx-kpi .v{font:600 29px/1.02 var(--num,var(--sans));font-variant-numeric:tabular-nums;letter-spacing:-.032em;color:var(--ink,#111);margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ksold .kx-kpi .v .u{font:500 12.5px/1.45 var(--sans);letter-spacing:0;color:var(--n-500,#777);margin-left:4px}.ksold .kx-empty{display:flex;flex-direction:column;align-items:center;text-align:center;padding:54px 24px 56px;border:1px dashed var(--n-200,#dedbd5);border-radius:18px;background:var(--paper-soft,#f5f3ef)}.ksold .kx-empty .ico{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:var(--surface,#fff);border:1px solid var(--n-200,#dedbd5);color:var(--atlas,#087a5b);margin-bottom:15px}.ksold .kx-empty .ico svg{display:block;width:22px;height:22px;fill:currentColor}.ksold .kx-empty h3{font:600 16.5px/1.3 var(--sans);letter-spacing:-.02em;color:var(--ink,#111);margin:0}.ksold .kx-empty p{font:400 13.5px/1.55 var(--sans);color:var(--n-500,#777);margin:8px 0 0;max-width:42ch}@media(max-width:760px){.ksold .kx-kpi-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:420px){.ksold .kx-kpi-strip{grid-template-columns:minmax(0,1fr)}}';
    /* La bande argent. Vert plein : en main. Rayures qui défilent : sur la route. */
    s.textContent += '.ksold .ksold-kpi3{grid-template-columns:repeat(3,minmax(0,1fr))}.ksold-money{border:1px solid var(--n-200,#dedbd5);background:var(--surface,#fff);border-radius:22px;padding:18px;margin-bottom:14px;box-shadow:0 1px 2px rgba(10,15,13,.04),0 14px 34px -22px rgba(10,15,13,.18)}.ksold-money-top{display:flex;justify-content:space-between;align-items:baseline;gap:14px;flex-wrap:wrap;margin:0 2px 14px}.ksold-money-top h2{margin:0;font:600 15px/1.2 var(--sans);letter-spacing:-.015em;color:var(--ink,#111)}.ksold-money-sum{display:flex;align-items:baseline;gap:7px;font:600 15px/1 var(--num,var(--sans));font-variant-numeric:tabular-nums;color:var(--n-500,#777)}.ksold-money-sum .t{color:var(--atlas,#0B6E4F)}.ksold-money-sum .c{color:var(--ink,#111)}.ksold-money-sum .op{font-weight:500;opacity:.7}.ksold-money-sum b{font-size:24px;letter-spacing:-.03em;color:var(--ink,#111)}.ksold-money-sum .u,.ksold-money .v .u{font:500 12px var(--sans);letter-spacing:0;opacity:.72;margin-left:4px}.ksold-money-bar{display:flex;gap:8px}.ksold-money-blk{position:relative;display:flex;gap:14px;align-items:flex-start;flex-basis:0;min-width:min(100%,250px);padding:16px 18px 17px;border-radius:18px;overflow:hidden}.ksold-money-blk.is-till{background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}.ksold-money-blk.is-courier{color:var(--ink,#0A0F0D);background:linear-gradient(-45deg,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 25%,transparent 25%,transparent 50%,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 50%,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 75%,transparent 75%) 0 0/30px 30px,var(--paper-soft,#efece6);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--ink,#0A0F0D) 16%,transparent);animation:ksoldRoad 2.4s linear infinite}.ksold-money-ico{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:15px}.ksold-money-blk.is-till .ksold-money-ico{background:color-mix(in srgb,var(--paper,#F7F5F0) 16%,transparent)}.ksold-money-blk.is-courier .ksold-money-ico{background:var(--surface,#fff);box-shadow:0 1px 2px rgba(10,15,13,.08)}.ksold-money-ico svg{display:block;width:30px;height:30px;fill:currentColor}.ksold-money-blk.is-courier .ksold-money-ico svg{animation:ksoldRide 1.6s ease-in-out infinite}.ksold-money-txt{min-width:0}.ksold-money .k{font:600 14px/1.25 var(--sans)}.ksold-money .v{font:600 38px/1.04 var(--num,var(--sans));font-variant-numeric:tabular-nums;letter-spacing:-.035em;margin-top:6px;white-space:nowrap}.ksold-money .s{font:400 12.5px/1.45 var(--sans);opacity:.78;margin-top:5px}.ksold-money .s b{font-weight:600;font-variant-numeric:tabular-nums;opacity:1}.ksold-money.is-fresh .ksold-money-blk{animation:ksoldGrow .7s cubic-bezier(.34,1.45,.5,1) both}.ksold-money.is-fresh .ksold-money-blk.is-courier{animation:ksoldGrow .7s cubic-bezier(.34,1.45,.5,1) .14s both,ksoldRoad 2.4s linear .84s infinite}[dir=rtl] .ksold-money.is-fresh .ksold-money-blk{animation-name:ksoldGrowRtl}[dir=rtl] .ksold-money.is-fresh .ksold-money-blk.is-courier{animation-name:ksoldGrowRtl,ksoldRoad}@keyframes ksoldGrow{from{clip-path:inset(0 100% 0 0 round 18px)}to{clip-path:inset(0 0 0 0 round 18px)}}@keyframes ksoldGrowRtl{from{clip-path:inset(0 0 0 100% round 18px)}to{clip-path:inset(0 0 0 0 round 18px)}}@keyframes ksoldRoad{to{background-position:30px 0,0 0}}@keyframes ksoldRide{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}@media(prefers-reduced-motion:reduce){.ksold-money .ksold-money-blk,.ksold-money .ksold-money-ico svg{animation:none!important}}@media(max-width:640px){.ksold-money-bar{flex-direction:column}.ksold-money-blk{flex:1 1 auto!important;min-width:0}.ksold-money .v{font-size:32px}}@media(max-width:420px){.ksold .ksold-kpi3{grid-template-columns:minmax(0,1fr)}}';
    /* L'historique en deux colonnes, aux couleurs de la bande. */
    s.textContent += '.ksold-hcols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.ksold-hcols.one{grid-template-columns:1fr}.ksold-hcredit{margin-top:12px}.ksold-hgrp{border-radius:16px;border:1px solid var(--n-200,#e5e2dc);overflow:hidden;min-width:0;background:var(--surface,#fff)}.ksold-hhead{display:flex;align-items:center;gap:12px;padding:13px 14px}.ksold-hgrp.is-till .ksold-hhead{background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}.ksold-hgrp.is-courier .ksold-hhead{color:var(--ink,#0A0F0D);background:linear-gradient(-45deg,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 25%,transparent 25%,transparent 50%,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 50%,color-mix(in srgb,var(--ink,#0A0F0D) 7%,transparent) 75%,transparent 75%) 0 0/30px 30px,var(--paper-soft,#efece6);border-bottom:1px solid color-mix(in srgb,var(--ink,#0A0F0D) 12%,transparent)}.ksold-hgrp.is-credit .ksold-hhead{background:var(--paper-soft,#f5f3ef);color:var(--ink,#111)}.ksold-hico{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:11px}.ksold-hgrp.is-till .ksold-hico{background:color-mix(in srgb,var(--paper,#F7F5F0) 16%,transparent)}.ksold-hgrp.is-courier .ksold-hico,.ksold-hgrp.is-credit .ksold-hico{background:var(--surface,#fff);box-shadow:0 1px 2px rgba(10,15,13,.08)}.ksold-hico svg{width:21px;height:21px;fill:currentColor;display:block}.ksold-htitle{flex:1;min-width:0}.ksold-htitle .k{font:600 14px/1.2 var(--sans)}.ksold-hhead .ksold-meta{color:inherit;opacity:.78;margin-top:2px}.ksold-hsum{font:600 21px/1 var(--num,var(--sans));font-variant-numeric:tabular-nums;letter-spacing:-.03em;white-space:nowrap}.ksold-hsum .u,.ksold-hamt .u{font:500 11px var(--sans);letter-spacing:0;opacity:.7;margin-left:3px}.ksold-hrow{position:relative;display:grid;grid-template-columns:4px minmax(0,1fr) auto;gap:12px;padding:12px 14px;border-top:1px solid var(--n-100,#eee)}.ksold-hhead+.ksold-hrow{border-top:0}.ksold-hrail{border-radius:4px;align-self:stretch}.ksold-hrow.is-till .ksold-hrail,.ksold-hrow.is-brought .ksold-hrail{background:var(--atlas,#0B6E4F)}.ksold-hrow.is-courier .ksold-hrail{background:repeating-linear-gradient(-45deg,color-mix(in srgb,var(--ink,#0A0F0D) 45%,transparent) 0 3px,transparent 3px 6px)}.ksold-hrow.is-credit .ksold-hrail{background:var(--n-200,#dedbd5)}.ksold-hmain{min-width:0}.ksold-hmain .ksold-name{line-height:1.45}.ksold-hmain .ksold-name bdi{display:inline-block;max-width:100%}.ksold-htag{display:inline-flex;align-items:center;gap:5px;margin-bottom:5px;padding:3px 8px 3px 6px;border-radius:999px;font:600 10.5px/1.2 var(--sans);color:var(--atlas,#0B6E4F);background:color-mix(in srgb,var(--atlas,#0B6E4F) 10%,transparent)}.ksold-htag svg{width:14px;height:14px;fill:currentColor}.ksold-hside{text-align:end}.ksold-hamt{font:600 15px/1.1 var(--num,var(--sans));font-variant-numeric:tabular-nums;letter-spacing:-.015em;white-space:nowrap}.ksold-hrow.is-till .ksold-hamt,.ksold-hrow.is-brought .ksold-hamt{color:var(--atlas,#0B6E4F)}.ksold-hsub{font:500 11px/1.3 var(--sans);color:var(--n-500,#777);margin-top:4px;white-space:nowrap}.ksold-hempty,.ksold-hmore{padding:14px;font:500 12.5px/1.4 var(--sans);color:var(--n-500,#777)}.ksold-hmore{border-top:1px solid var(--n-100,#eee);text-align:center}@media(max-width:760px){.ksold-hcols{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function rangeLabel(range) {
    if (!range) return L('Dates', 'Dates', 'التواريخ');
    var from = parseDateKey(range.from), to = parseDateKey(range.to);
    var options = { day:'numeric', month:'short' };
    if (range.from === range.to) return from.toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', options);
    return from.toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', options) + ' – ' + to.toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', options);
  }
  function dayControls(days, till, custom) {
    var quick = [1,7,30,90].filter(function(d){ return !till || d <= 30; }).map(function (d) {
      var label = d === 1 ? L("Aujourd'hui", 'Today', 'اليوم') : L(d + ' jours', enDays(d), arDays(d));
      return '<button type="button" class="' + (!custom && days === d ? 'on' : '') + '" data-ksold-days="' + d + '">' + label + '</button>';
    }).join('');
    return quick + '<button type="button" class="' + (custom ? 'on' : '') + '" data-ksold-custom="1">' + esc(rangeLabel(custom)) + '</button>';
  }
  function pickerMarkup(till) {
    var p = till ? tillPicker : dashboardPicker;
    if (!p.open) return '';
    var max = businessToday();
    var fields = p.mode === 'day'
      ? '<div class="ksold-date-fields one"><label>'+L('Jour exact','Exact day','يوم محدد')+'<input type="date" max="'+max+'" value="'+esc(p.day)+'" data-ksold-day></label></div>'
      : '<div class="ksold-date-fields"><label>'+L('Du','From','من')+'<input type="date" max="'+max+'" value="'+esc(p.from)+'" data-ksold-from></label><label>'+L('Au','To','إلى')+'<input type="date" max="'+max+'" value="'+esc(p.to)+'" data-ksold-to></label></div>';
    return '<div class="ksold-picker"><div class="ksold-picker-box"><div class="ksold-modes"><button type="button" class="'+(p.mode==='day'?'on':'')+'" data-ksold-mode="day">'+L('Jour exact','Exact day','يوم محدد')+'</button><button type="button" class="'+(p.mode==='range'?'on':'')+'" data-ksold-mode="range">'+L('Période','Period','الفترة')+'</button></div>'+fields+'<div class="ksold-picker-actions"><span class="ksold-date-error">'+esc(p.error||'')+'</span><button type="button" data-ksold-cancel>'+L('Annuler','Cancel','إلغاء')+'</button><button type="button" data-ksold-apply>'+L('Appliquer','Apply','تطبيق')+'</button></div></div></div>';
  }
  function recommendations(a) {
    var out = [];
    if (a.pairs[0] && a.pairs[0].count >= 2) {
      var pr = a.pairs[0];
      out.push({ title: L('Bundle suggéré', 'Suggested bundle', 'حزمة مقترحة'), text: L(
        pr.a + ' + ' + pr.b + ' ont été achetés ensemble ' + pr.count + ' fois. Testez une offre groupée sans remiser avant d’avoir mesuré son effet.',
        pr.a + ' + ' + pr.b + ' were bought together ' + pr.count + ' times. Test a bundle offer without discounting before you have measured its effect.',
        'تم شراء ' + pr.a + ' + ' + pr.b + ' معًا ' + pr.count + ' مرات. جرّب عرضًا مجمّعًا دون تخفيض قبل قياس أثره.') });
    }
    if (a.products[0]) {
      var top = a.products[0];
      out.push({ title: L('Produit moteur', 'Top seller', 'المنتج الأبرز'), text: L(
        top.name + ' mène la période avec ' + top.qty + ' pièce' + (top.qty>1?'s':'') + '. Placez les compléments les plus associés à proximité.',
        top.name + ' leads the period with ' + enItems(top.qty) + '. Place the products most often bought with it nearby.',
        top.name + ' يتصدّر الفترة بـ ' + arItems(top.qty) + '. ضع المنتجات المكمّلة الأكثر ارتباطًا به بالقرب منه.') });
    }
    var restock = a.products.filter(function(p){return Number.isFinite(p.stock) && p.stock <= Math.max(2,p.qty);})[0];
    if (restock) out.push({ title: L('Réassort à anticiper', 'Restock soon', 'تجديد المخزون قريبًا'), text: L(
      restock.name + ' a vendu ' + restock.qty + ' pièce(s) sur la période et il en reste ' + restock.stock + '. Vérifiez le prochain arrivage avant une rupture.',
      restock.name + ' sold ' + enItems(restock.qty) + ' in the period and ' + restock.stock + ' left. Check the next delivery before you run out.',
      'تم بيع ' + arItems(restock.qty) + ' من ' + restock.name + ' خلال الفترة ويتبقى منه ' + restock.stock + '. تحقّق من موعد التوريد القادم قبل نفاد المخزون.') });
    var down = a.products.filter(function(p){return p.previousQty >= 2 && p.qty < p.previousQty;}).sort(function(x,y){return (x.qty-x.previousQty)-(y.qty-y.previousQty);})[0];
    if (down) out.push({ title: L('Sous-performance à regarder', 'Underperformer to watch', 'منتج متراجع يستحق المتابعة'), text: L(
      down.name + ' passe de ' + down.previousQty + ' à ' + down.qty + ' pièce(s) par rapport aux ' + a.days + ' jours précédents. Vérifiez exposition, taille disponible et prix avant toute promotion.',
      down.name + ' fell from ' + down.previousQty + ' to ' + enItems(down.qty) + ' compared with the previous ' + enDays(a.days) + '. Check display, available sizes and price before any promotion.',
      'انخفضت مبيعات ' + down.name + ' من ' + down.previousQty + ' إلى ' + arItems(down.qty) + ' مقارنة بالفترة السابقة (' + arDays(a.days) + '). تحقّق من العرض والمقاس المتوفر والسعر قبل أي عرض ترويجي.') });
    if (!out.length) out.push({ title: L('Analyse en apprentissage', 'Analysis still learning', 'التحليل قيد التعلّم'), text: L(
      'Il faut au moins deux paniers avec plusieurs produits pour recommander un bundle fiable. Les ventes déjà enregistrées restent visibles ci-dessous.',
      'At least two baskets with several products are needed to recommend a reliable bundle. Sales already recorded remain visible below.',
      'يلزم سلتان على الأقل تحتويان على عدة منتجات للتوصية بحزمة موثوقة. تبقى المبيعات المسجّلة ظاهرة أدناه.') });
    return out;
  }
  /* An empty period is the most-seen state on this page — a new boutique lands
   * here before its first ticket. "Aucune vente…" centred in a bare box told
   * them nothing; this says which period is empty and what would fill it.
   * Icon is Material Symbols (Outlined 400, viewBox="0 -960 960 960"), per the
   * icon rule in CLAUDE.md §4 — currentColor fill, no hand-drawn paths. */
  function emptyState(a) {
    var per = a.custom
      ? L('du ' + rangeLabel(a.custom), 'for ' + rangeLabel(a.custom), 'للفترة ' + rangeLabel(a.custom))
      : (a.days === 1 ? L("aujourd’hui", 'today', 'اليوم') : L('sur les ' + a.days + ' derniers jours', 'in the last ' + enDays(a.days), 'خلال آخر ' + arDays(a.days)));
    return '<div class="kx-empty">'
      + '<div class="ico"><svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M280-80q-33 0-56.5-23.5T200-160v-480q0-33 23.5-56.5T280-720h80q0-83 58.5-141.5T560-920q83 0 141.5 58.5T760-720h80q33 0 56.5 23.5T920-640v480q0 33-23.5 56.5T840-80H280Zm0-80h560v-480h-80v80q0 17-11.5 28.5T720-520q-17 0-28.5-11.5T680-560v-80H440v80q0 17-11.5 28.5T400-520q-17 0-28.5-11.5T360-560v-80h-80v480Zm160-560h240q0-50-35-85t-85-35q-50 0-85 35t-35 85ZM280-160v-480 480Z"/></svg></div>'
      + '<h3>' + L('Aucune vente détaillée ', 'No detailed sales ', 'لا توجد مبيعات مفصّلة ') + esc(per) + '</h3>'
      + '<p>' + L('Dès qu’un ticket est encaissé à la caisse avec ses produits, il apparaît ici : quantités, catégories, paniers associés et recommandations.', 'As soon as a receipt is rung up at the till with its products, it appears here: quantities, categories, related baskets and recommendations.', 'بمجرد تحصيل إيصال في الصندوق مع منتجاته، يظهر هنا: الكميات والفئات والسلال المرتبطة والتوصيات.') + '</p>'
      + '</div>';
  }
  /* L'historique détaillé, rangé comme la bande du haut : à gauche (vert) ce
   * qui est dans la caisse, à droite (rayé) ce qui est encore chez le livreur.
   * Chaque colonne a le même total que son bloc. Un ticket payé en partie au
   * comptoir et en partie à la livraison paraît des deux côtés, chacun avec sa
   * part. Un encaissement du livreur paraît à gauche, avec le panier livré. */
  var HIST_MAX = 40;
  function locale() { var l = lang(); return l === 'ar' ? 'ar-MA' : l === 'en' ? 'en-GB' : 'fr-FR'; }
  function history(a) {
    var m = a.money, list = (m && m.list) || [];
    if (!list.length) return '';
    var mad = function (c) { return fmt(c / 100); };
    var oneDay = !a.custom && a.days === 1;
    var when = function (ts) { try { return new Date(ts).toLocaleString(locale(), oneDay ? { hour:'2-digit', minute:'2-digit' } : { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }); } catch (_) { return ''; } };
    var ticket = function (ref) { return L('Ticket ', 'Receipt ', 'الإيصال ') + ref; };
    var row = function (r) {
      var goods = r.lines.length ? r.lines.map(function (l) { return '<bdi>' + l.qty + '× ' + esc(l.name) + '</bdi>'; }).join(' · ') : esc(L('Articles non détaillés', 'Items not itemised', 'أصناف غير مفصّلة'));
      var meta = esc(ticket(r.ref)), tag = '', sub = '';
      if (r.kind === 'brought') tag = L('Rapporté par le livreur', 'Brought back by the courier', 'أعاده عامل التوصيل');
      if (r.kind === 'till' && r.mixed) meta += ' · ' + esc(L('le reste est chez le livreur', 'the rest is with the courier', 'الباقي عند عامل التوصيل'));
      if (r.kind === 'courier') sub = r.owed > r.cents ? L('reste ' + mad(r.cents) + ' sur ' + mad(r.owed), mad(r.cents) + ' left of ' + mad(r.owed), 'الباقي ' + mad(r.cents) + ' من ' + mad(r.owed)) : L('à recevoir', 'to collect', 'للتحصيل');
      if (r.kind === 'credit') sub = L('payé avec un avoir', 'paid with store credit', 'مدفوع برصيد دائن');
      return '<div class="ksold-hrow is-' + r.kind + '"><i class="ksold-hrail" aria-hidden="true"></i><div class="ksold-hmain">'
        + (tag ? '<span class="ksold-htag">' + ICON_RIDE + esc(tag) + '</span>' : '')
        + '<div class="ksold-name">' + goods + '</div><div class="ksold-meta">' + meta + ' · ' + esc(when(r.ts)) + '</div></div>'
        + '<div class="ksold-hside"><div class="ksold-hamt">' + mad(r.cents) + '<span class="u">MAD</span></div>' + (sub ? '<div class="ksold-hsub">' + esc(sub) + '</div>' : '') + '</div></div>';
    };
    var rows = function (items) {
      var more = items.length - HIST_MAX;
      return items.slice(0, HIST_MAX).map(row).join('') + (more > 0 ? '<div class="ksold-hmore">' + esc(L('+ ' + more + ' autre' + (more > 1 ? 's' : '') + ' ticket' + (more > 1 ? 's' : ''), '+ ' + more + ' more receipt' + (more > 1 ? 's' : ''), 'إيصالات أخرى: ' + more)) + '</div>' : '');
    };
    var group = function (kind, icon, title, count, total, items, empty) {
      return '<div class="ksold-hgrp is-' + kind + '"><div class="ksold-hhead"><span class="ksold-hico">' + icon + '</span><div class="ksold-htitle"><div class="k">' + esc(title) + '</div><div class="ksold-meta">' + esc(count) + '</div></div>'
        + '<div class="ksold-hsum">' + mad(total) + '<span class="u">MAD</span></div></div>'
        + (items.length ? rows(items) : '<div class="ksold-hempty">' + esc(empty) + '</div>') + '</div>';
    };
    var tillItems = list.filter(function (r) { return r.kind === 'till' || r.kind === 'brought'; });
    var courierItems = list.filter(function (r) { return r.kind === 'courier'; });
    var creditItems = list.filter(function (r) { return r.kind === 'credit'; });
    var n = tillItems.length, d = courierItems.length, c = creditItems.length;
    var html = '<div class="ksold-hcols' + (m.deliveries ? '' : ' one') + '">'
      + group('till', ICON_TILL, L('Dans la caisse', 'In the till', 'في الصندوق'),
          L(n + ' ticket' + (n > 1 ? 's' : ''), n + (n > 1 ? ' receipts' : ' receipt'), 'الإيصالات: ' + n), m.till, tillItems,
          L('Rien d’encaissé pour l’instant.', 'Nothing collected yet.', 'لم يُحصَّل شيء بعد.'))
      + (m.deliveries ? group('courier', ICON_RIDE, L('Chez le livreur', 'With the courier', 'عند عامل التوصيل'),
          L(d + ' livraison' + (d > 1 ? 's' : '') + ' pas encore payée' + (d > 1 ? 's' : ''), d + (d > 1 ? ' deliveries' : ' delivery') + ' not paid yet', 'طلبات توصيل لم تُدفع بعد: ' + d), m.courier, courierItems,
          L('Le livreur a tout rapporté.', 'The courier has brought everything back.', 'أعاد عامل التوصيل كل شيء.')) : '')
      + '</div>';
    if (c) html += '<div class="ksold-hcols one ksold-hcredit">' + group('credit', ICON_WALLET, L('Payé avec un avoir', 'Paid with store credit', 'مدفوع برصيد دائن'),
      L(c + ' ticket' + (c > 1 ? 's' : ''), c + (c > 1 ? ' receipts' : ' receipt'), 'الإيصالات: ' + c), creditItems.reduce(function (t, r) { return t + r.cents; }, 0), creditItems, '') + '</div>';
    return html;
  }
  function body(a, owner) {
    if (!a.sales.length) return '<div class="ksold-full">' + emptyState(a) + '</div>';
    var max = a.products[0] ? a.products[0].qty : 1;
    var productRows = a.products.slice(0, owner ? 20 : 12).map(function (p) { return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.name)+'</div><div class="ksold-meta">'+esc(p.category)+' · '+L('dernière vente','last sale','آخر بيع')+' '+new Date(p.last).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR',{day:'numeric',month:'short'})+(Number.isFinite(p.stock)?' · '+L(p.stock+' en stock',p.stock+' in stock','في المخزون: '+p.stock):'')+'</div><div class="ksold-bar"><i style="width:'+Math.max(4,Math.round(p.qty/max*100))+'%"></i></div></div><div class="ksold-val">'+L(p.qty+' pce'+(p.qty>1?'s':''),enItems(p.qty),arItems(p.qty,true))+'<div class="ksold-meta">'+fmt(p.revenue)+' MAD</div></div></div>'; }).join('');
    var catRows = a.categories.map(function(c){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(c.name)+'</div><div class="ksold-meta">'+L(c.qty+' pièce'+(c.qty>1?'s':''),enItems(c.qty),arItems(c.qty,true))+'</div></div><div class="ksold-val">'+fmt(c.revenue)+' MAD</div></div>';}).join('');
    var pairRows = a.pairs.slice(0,8).map(function(p){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.a)+' + '+esc(p.b)+'</div><div class="ksold-meta">'+L('Même ticket','Same receipt','نفس الإيصال')+'</div></div><div class="ksold-val">'+p.count+'×</div></div>';}).join('') || '<div class="ksold-note">'+L('Aucune association répétée pour l’instant.','No repeated pairings yet.','لا توجد ارتباطات متكررة حتى الآن.')+'</div>';
    var timeline = a.sales.slice(0,20).map(function(s){return '<div class="ksold-row"><div><div class="ksold-name">'+s.lines.map(function(l){return l.qty+'× '+esc(l.name);}).join(' · ')+'</div><div class="ksold-meta">'+esc(s.ref || L('Ticket','Receipt','إيصال'))+'</div></div><div><div class="ksold-val">'+fmt(s.lines.reduce(function(n,l){return n+l.total;},0))+' MAD</div><div class="ksold-time">'+new Date(s.ts).toLocaleString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'</div></div></div>';}).join('');
    var ai = owner ? '<section class="ksold-card ksold-ai"><div class="ksold-ai-tag">✦ '+L('Kiwi AI · basé sur vos ventes','Kiwi AI · based on your sales','Kiwi AI · مبني على مبيعاتك')+'</div>'+recommendations(a).map(function(r){return '<div class="ksold-rec"><b>'+esc(r.title)+'</b><p>'+esc(r.text)+'</p></div>';}).join('')+'</section>' : '<section class="ksold-card"><h2>'+L('Produits vendus ensemble','Products sold together','منتجات بيعت معًا')+'</h2><div class="ksold-note">'+L('Associations constatées sur les tickets','Pairings seen on receipts','ارتباطات لوحظت في الإيصالات')+'</div>'+pairRows+'</section>';
    return '<section class="ksold-card"><h2>'+L('Produits','Products','المنتجات')+'</h2><div class="ksold-note">'+L('Quantité, chiffre et dernière vente','Quantity, revenue and last sale','الكمية والإيراد وآخر بيع')+'</div>'+productRows+'</section>'+ai+'<section class="ksold-card"><h2>'+L('Catégories','Categories','الفئات')+'</h2><div class="ksold-note">'+L('Contribution par rayon','Contribution by department','المساهمة حسب القسم')+'</div>'+catRows+'</section>'+(owner?'<section class="ksold-card"><h2>'+L('Produits vendus ensemble','Products sold together','منتجات بيعت معًا')+'</h2><div class="ksold-note">'+L('Paniers réellement observés','Baskets actually observed','السلال المرصودة فعليًا')+'</div>'+pairRows+'</section>':'')+(function(){var split=history(a);return '<section class="ksold-card ksold-full'+(split?' ksold-hist':'')+'"><h2>'+L('Historique détaillé','Detailed history','السجل التفصيلي')+'</h2><div class="ksold-note">'+(split?L('Chaque ticket est rangé là où se trouve son argent','Each receipt sits where its money is','كل إيصال في المكان الذي يوجد فيه ماله'):L('Quand et dans quel panier chaque produit a été vendu','When and in which basket each product was sold','متى وفي أي سلة بيع كل منتج'))+'</div>'+(split||timeline)+'</section>';})();
  }
  /* La bande « argent » : une barre, deux couleurs. Vert plein = l'argent que
   * vous avez en main. Rayé, qui défile = l'argent encore sur la route avec le
   * livreur. Dessous, les deux montants en grand et une phrase chacun. Icônes
   * Material Symbols (point_of_sale, two_wheeler, account_balance_wallet), copiées de assets/icons/material/. */
  var ICON_TILL = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M280-640q-33 0-56.5-23.5T200-720v-80q0-33 23.5-56.5T280-880h400q33 0 56.5 23.5T760-800v80q0 33-23.5 56.5T680-640H280Zm0-80h400v-80H280v80ZM160-80q-33 0-56.5-23.5T80-160v-40h800v40q0 33-23.5 56.5T800-80H160ZM80-240l139-313q10-22 30-34.5t43-12.5h376q23 0 43 12.5t30 34.5l139 313H80Zm260-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm120 160h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm120 160h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Zm0-80h40q8 0 14-6t6-14q0-8-6-14t-14-6h-40q-8 0-14 6t-6 14q0 8 6 14t14 6Z"/></svg>';
  var ICON_RIDE = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M160-200q-66 0-113-47T0-360q0-57 36.5-101t93.5-55l-28-24H0v-60h180l100 60 160-60h126l-62-80H400v-80h142l84 108 134-68v120h-92l70 92q15-6 30.5-9t31.5-3q66 0 113 47t47 113q0 66-47 113t-113 47q-66 0-113-47t-47-113q0-27 9.5-52.5T676-460l-20-24-136 204H400l-80-70q-5 63-51 106.5T160-200Zm0-80q33 0 56.5-23.5T240-360q0-33-23.5-56.5T160-440q-33 0-56.5 23.5T80-360q0 33 23.5 56.5T160-280Zm294-240-144 54 144-54h130-130Zm346 240q33 0 56.5-23.5T880-360q0-33-23.5-56.5T800-440q-33 0-56.5 23.5T720-360q0 33 23.5 56.5T800-280Zm-322-80 106-160H454l-144 54 120 106h48Z"/></svg>';
  var ICON_WALLET = '<svg viewBox="0 -960 960 960" aria-hidden="true"><path d="M200-200v-560 560Zm0 80q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v100h-80v-100H200v560h560v-100h80v100q0 33-23.5 56.5T760-120H200Zm320-160q-33 0-56.5-23.5T440-360v-240q0-33 23.5-56.5T520-680h280q33 0 56.5 23.5T880-600v240q0 33-23.5 56.5T800-280H520Zm280-80v-240H520v240h280Zm-117.5-77.5Q700-455 700-480t-17.5-42.5Q665-540 640-540t-42.5 17.5Q580-505 580-480t17.5 42.5Q615-420 640-420t42.5-17.5Z"/></svg>';
  var lastMoney = '';
  function moneyBand(a) {
    var m = a.money; if (!m) return '';
    var total = m.till + m.courier; if (total <= 0) return '';
    var key = [a.from, m.till, m.courier].join(':'), fresh = key !== lastMoney; lastMoney = key;
    var mad = function (c) { return fmt(c / 100); };
    var n = m.counter, d = m.pending;
    var tillNote = n ? L(n + ' vente' + (n > 1 ? 's' : '') + ' payée' + (n > 1 ? 's' : '') + ' au comptoir', n + (n > 1 ? ' sales' : ' sale') + ' paid at the counter', 'عدد البيوع المدفوعة في المحل: ' + n) : '';
    var courierNote = d
      ? L(d + ' livraison' + (d > 1 ? 's' : '') + ' pas encore payée' + (d > 1 ? 's' : ''), d + (d > 1 ? ' deliveries' : ' delivery') + ' not paid yet', 'طلبات توصيل لم تُدفع بعد: ' + d)
      : L('Toutes les livraisons sont payées.', 'All deliveries are paid.', 'كل طلبات التوصيل مدفوعة.');
    var block = function (cls, icon, title, cents, notes) {
      return '<div class="ksold-money-blk ' + cls + '" style="flex-grow:' + Math.max(1, cents) + '">'
        + '<span class="ksold-money-ico">' + icon + '</span><div class="ksold-money-txt">'
        + '<div class="k">' + esc(title) + '</div><div class="v">' + mad(cents) + '<span class="u">MAD</span></div>'
        + notes.filter(Boolean).map(function (x) { return '<div class="s">' + x + '</div>'; }).join('') + '</div></div>';
    };
    var sum = m.till > 0 && m.courier > 0
      ? '<span class="t">' + mad(m.till) + '</span><span class="op">+</span><span class="c">' + mad(m.courier) + '</span><span class="op">=</span><b>' + mad(total) + '</b><span class="u">MAD</span>'
      : '<b>' + mad(total) + '</b><span class="u">MAD</span>';
    var today = !a.custom && a.days === 1;
    var aria = L(mad(m.till) + ' MAD dans la caisse, ' + mad(m.courier) + ' MAD chez le livreur', mad(m.till) + ' MAD in the till, ' + mad(m.courier) + ' MAD with the courier', mad(m.till) + ' درهم في الصندوق، ' + mad(m.courier) + ' درهم عند عامل التوصيل');
    return '<section class="ksold-money' + (fresh ? ' is-fresh' : '') + '">'
      + '<div class="ksold-money-top"><h2>' + (today ? L('L’argent du jour', 'Today’s money', 'أموال اليوم') : L('L’argent de la période', 'Money for the period', 'أموال الفترة')) + '</h2><div class="ksold-money-sum">' + sum + '</div></div>'
      + '<div class="ksold-money-bar" role="group" aria-label="' + esc(aria) + '">'
      + block('is-till', ICON_TILL, L('Dans la caisse', 'In the till', 'في الصندوق'), m.till, [esc(tillNote), m.brought ? '<span>' + esc(L('Rapporté par le livreur', 'Brought back by the courier', 'أعاده عامل التوصيل')) + '</span> <b>' + mad(m.brought) + ' MAD</b>' : ''])
      + (m.deliveries ? block('is-courier', ICON_RIDE, L('Chez le livreur', 'With the courier', 'عند عامل التوصيل'), m.courier, [esc(courierNote), d ? esc(L('Le livreur vous donne cet argent plus tard.', 'The courier gives you this money later.', 'يسلّمك عامل التوصيل هذا المال لاحقًا.')) : '']) : '')
      + '</div></section>';
  }
  function shell(a, owner, loading) {
    return '<div class="ksold"><div class="ksold-head"><div>'+(owner?'':'<h1>'+L('Vendus','Sold','المباع')+'</h1>')+'<div class="ksold-sub">'+(owner?L('Période analysée','Period analysed','الفترة المحلَّلة'):L('Stock vendu, catégories et détail des tickets','Stock sold, categories and receipt details','المخزون المباع والفئات وتفاصيل الإيصالات'))+(loading?L(' · synchronisation…',' · syncing…',' · جارٍ المزامنة…'):'')+'</div></div><div class="ksold-days">'+dayControls(a.days,!owner,a.custom)+'</div></div>'+pickerMarkup(!owner)+(a.sales.length?moneyBand(a):'')+'<div class="kx-kpi-strip ksold-kpi3"><div class="kx-kpi"><div class="l">'+L('Pièces vendues','Items sold','القطع المباعة')+'</div><div class="v">'+a.units+'</div></div><div class="kx-kpi"><div class="l">'+L('Produits actifs','Active products','المنتجات النشطة')+'</div><div class="v">'+a.products.length+'</div></div><div class="kx-kpi"><div class="l">'+L('Tickets analysés','Receipts analysed','الإيصالات المحلَّلة')+'</div><div class="v">'+a.tickets+'</div></div></div><div class="ksold-grid">'+body(a,owner)+'</div></div>';
  }
  function localTill() {
    try {
      if (typeof window.KiwiBoutiqueDemoDay === 'function') return window.KiwiBoutiqueDemoDay() || [];
      var b = JSON.parse(localStorage.getItem('kiwi:bqDay') || 'null');
      if (b && b.m && slug() && b.m !== slug()) return [];
      /* Une vente sortie des livres (God mode) reste dans le journal, marquée
         `voided` : la caisse en a rendu le stock, « Vendus » ne la compte plus. */
      return (Array.isArray(b) ? b : (b && Array.isArray(b.s) ? b.s : [])).filter(function (s) { return s && !s.voided; });
    } catch (_) { return []; }
  }
  var tillPanel = null;
  function renderTill(panel) {
    if (!panel) return; ensureStyle(); tillPanel = panel;
    var source = localTill().concat(tillSales);
    panel.innerHTML = shell(analyze(source,tillRange || tillDays),false,tillLoading);
    wire(panel, true);
    fetchTill(panel);
  }
  function fetchTill(panel) {
    var m = slug(); if (!m || tillLoading) return;
    if (tillMerchant !== m) { tillMerchant=m; tillSales=[]; tillFetched=false; tillLoadedFrom=Infinity; }
    var from = bounds(tillRange || tillDays).previousFrom;
    if (tillFetched && tillLoadedFrom <= from) return;
    tillLoading = true; renderTillNoFetch(panel);
    (window.KiwiPosSale&&window.KiwiPosSale.feedDay||function(u,o){return fetch(u,o).then(function(r){return r.ok?r.json():null;});})('/api/feed?merchant='+encodeURIComponent(m)+'&from='+from,{credentials:'same-origin',headers:{Accept:'application/json'}})
      .then(function(j){tillSales=(j&&j.sales)||[];tillLoadedFrom=from;tillFetched=true;})
      .catch(function(){}).finally(function(){tillLoading=false;renderTillNoFetch(panel);});
  }
  function renderTillNoFetch(panel){ if(!panel)return;panel.innerHTML=shell(analyze(localTill().concat(tillSales),tillRange || tillDays),false,tillLoading);wire(panel,true); }
  function dashboardSales() { try { return (window.KiwiSales && KiwiSales.list && KiwiSales.list()) || []; } catch (_) { return []; } }
  function renderDashboard() {
    ensureStyle(); var a = analyze(dashboardSales(), (!dashboardPicked && sharedPeriod()) || dashboardRange || dashboardDays);
    if (!window.Kiwi || !Kiwi.appPage) return;
    Kiwi.appPage('sold',{title:L('Vendus','Sold','المباع'),subtitle:L('Analyse de vos produits vendus · ventes brutes, les retours ne sont pas déduits','Analysis of your products sold · gross sales, returns are not deducted','تحليل منتجاتك المباعة · مبيعات إجمالية، لا تُخصم المرتجعات'),body:shell(a,true,false)});
    wire(document, false);
  }
  function wire(root, till) {
    var rerender = function(fetchMore){ if(till){renderTillNoFetch(root);if(fetchMore)fetchTill(root);}else{renderDashboard();} };
    var picker = till ? tillPicker : dashboardPicker;
    Array.prototype.forEach.call(root.querySelectorAll('[data-ksold-days]'),function(b){ b.onclick=function(){ var d=Number(b.dataset.ksoldDays)||7;picker.open=false;picker.error='';if(till){tillDays=d;tillRange=null;}else{dashboardDays=d;dashboardRange=null;dashboardPicked=true;}rerender(true); }; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ksold-custom]'),function(b){ b.onclick=function(){picker.open=!picker.open;picker.error='';if(picker.open&&!picker.picked){picker.day=picker.from=picker.to=businessToday();}rerender(false);}; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ksold-mode]'),function(b){ b.onclick=function(){picker.mode=b.dataset.ksoldMode;picker.error='';rerender(false);}; });
    var cancel = root.querySelector('[data-ksold-cancel]'); if(cancel) cancel.onclick=function(){picker.open=false;picker.error='';rerender(false);};
    var apply = root.querySelector('[data-ksold-apply]'); if(apply) apply.onclick=function(){
      var from, to;
      if(picker.mode==='day') { var one=root.querySelector('[data-ksold-day]');from=to=one&&one.value;picker.day=from||picker.day; }
      else { var first=root.querySelector('[data-ksold-from]'),last=root.querySelector('[data-ksold-to]');from=first&&first.value;to=last&&last.value;picker.from=from||picker.from;picker.to=to||picker.to; }
      var a=parseDateKey(from),z=parseDateKey(to),today=parseDateKey(businessToday());
      if(!a||!z){picker.error=L('Choisissez la date.','Choose a date.','اختر التاريخ.');rerender(false);return;}
      if(a>z){picker.error=L('La fin doit venir après le début.','The end must come after the start.','يجب أن تأتي النهاية بعد البداية.');rerender(false);return;}
      if(z>today){picker.error=L('La période ne peut pas finir dans le futur.','The period cannot end in the future.','لا يمكن أن تنتهي الفترة في المستقبل.');rerender(false);return;}
      var selected={from:dateKey(a),to:dateKey(z)};picker.picked=true;picker.open=false;picker.error='';if(till)tillRange=selected;else{dashboardRange=selected;dashboardPicked=true;}rerender(true);
    };
  }
  function installDashboard() {
    var H = window.Kiwi && Kiwi.handlers; if (!H) { setTimeout(installDashboard,50); return; }
    H['nav-sold'] = renderDashboard;
  }
  if (document.addEventListener) document.addEventListener('kiwi:langchange', function () {
    try {
      if (tillPanel && document.contains(tillPanel) && tillPanel.querySelector('.ksold')) renderTillNoFetch(tillPanel);
      else if (document.querySelector('.ksold') && !document.querySelector('[data-bq-panel="vendus"].is-on')) renderDashboard();
    } catch (_) {}
  });
  /* La caisse change de langue sans événement : elle réécrit <html lang>. On
     redessine alors le panneau Vendus, sinon ses phrases restent dans l'ancienne. */
  try {
    if (typeof MutationObserver === 'function') new MutationObserver(function () {
      if (tillPanel && document.contains(tillPanel) && tillPanel.querySelector('.ksold')) renderTillNoFetch(tillPanel);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  } catch (_) {}
  window.KiwiSoldInsights = { analyze: analyze, renderTill: renderTill, renderDashboard: renderDashboard };
  window.addEventListener('load',function(){ installDashboard(); if(window.KiwiVenue&&KiwiVenue.subscribe)KiwiVenue.subscribe(installDashboard); if(window.KiwiSales&&KiwiSales.subscribe)KiwiSales.subscribe(function(){if(document.querySelector('.ksold')&&!document.querySelector('[data-bq-panel="vendus"].is-on'))renderDashboard();}); });
})();
