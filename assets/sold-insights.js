/* Kiwi · Vendus — product intelligence shared by boutique caisse + dashboard.
 * Reads the existing tenant-scoped sales ledger; it never creates a second
 * analytics database and never fills gaps with demo numbers. */
(function () {
  'use strict';

  var lang = function () { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
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
    var count = Math.max(1, Math.round(Number(period) || 7));
    var now = Date.now(), start = now - count * DAY;
    return { days:count, from:start, to:Infinity, previousFrom:start-count*DAY, custom:null };
  }

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function fmt(v) { try { return (window.KiwiNumber?.format(Math.round(Number(v) || 0), {}) ?? Math.round(Number(v) || 0).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})); } catch (_) { return String(Math.round(Number(v) || 0)); } }
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
    try { (api.listCategories() || []).forEach(function (c) { cats[String(c.id)] = String(c.name || L('Sans catégorie', 'Uncategorised', 'بدون فئة')); }); } catch (_) {}
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
      var qty = Math.max(1, Math.round(Number(l && l.qty) || 1));
      var total = Number(l && l.total);
      if (!Number.isFinite(total)) total = (Number(l && (l.unit || l.unitPrice)) || 0) * qty;
      var cid = String((l && (l.cat || l.category || l.categoryId)) || (p && p.categoryId) || '');
      return { name: String((p && p.name) || (l && l.name) || L('Article', 'Item', 'صنف')), qty: qty, total: Math.max(0, total || 0), cat: cat.cats[cid] || String((l && (l.cat || l.category)) || L('Sans catégorie', 'Uncategorised', 'بدون فئة')), stock: p && p._soldStock };
    }).filter(function (l) { return l.name; }) : [];
    return { ts: ts, amount: Math.max(0, Number(raw && (raw.amount || raw.total)) || 0), ref: String(raw && (raw.ref || raw.id) || ''), lines: lines };
  }
  function analyze(source, period) {
    var cat = catalog();
    var span = bounds(period), days = span.days, from = span.from, to = span.to, previousFrom = span.previousFrom;
    var seen = {};
    var all = (source || []).map(function (s) { return normalize(s, cat); }).filter(function (s) {
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
      revenue += sale.amount || sale.lines.reduce(function (n, l) { return n + l.total; }, 0);
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
      pairs: pairRows, previousTickets: previous.length, catalogCount: cat.products.length,
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
  function body(a, owner) {
    if (!a.sales.length) return '<div class="ksold-full">' + emptyState(a) + '</div>';
    var max = a.products[0] ? a.products[0].qty : 1;
    var productRows = a.products.slice(0, owner ? 20 : 12).map(function (p) { return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.name)+'</div><div class="ksold-meta">'+esc(p.category)+' · '+L('dernière vente','last sale','آخر بيع')+' '+new Date(p.last).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR',{day:'numeric',month:'short'})+(Number.isFinite(p.stock)?' · '+L(p.stock+' en stock',p.stock+' in stock','في المخزون: '+p.stock):'')+'</div><div class="ksold-bar"><i style="width:'+Math.max(4,Math.round(p.qty/max*100))+'%"></i></div></div><div class="ksold-val">'+L(p.qty+' pce'+(p.qty>1?'s':''),enItems(p.qty),arItems(p.qty,true))+'<div class="ksold-meta">'+fmt(p.revenue)+' MAD</div></div></div>'; }).join('');
    var catRows = a.categories.map(function(c){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(c.name)+'</div><div class="ksold-meta">'+L(c.qty+' pièce'+(c.qty>1?'s':''),enItems(c.qty),arItems(c.qty,true))+'</div></div><div class="ksold-val">'+fmt(c.revenue)+' MAD</div></div>';}).join('');
    var pairRows = a.pairs.slice(0,8).map(function(p){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.a)+' + '+esc(p.b)+'</div><div class="ksold-meta">'+L('Même ticket','Same receipt','نفس الإيصال')+'</div></div><div class="ksold-val">'+p.count+'×</div></div>';}).join('') || '<div class="ksold-note">'+L('Aucune association répétée pour l’instant.','No repeated pairings yet.','لا توجد ارتباطات متكررة حتى الآن.')+'</div>';
    var timeline = a.sales.slice(0,20).map(function(s){return '<div class="ksold-row"><div><div class="ksold-name">'+s.lines.map(function(l){return l.qty+'× '+esc(l.name);}).join(' · ')+'</div><div class="ksold-meta">'+esc(s.ref || L('Ticket','Receipt','إيصال'))+'</div></div><div><div class="ksold-val">'+fmt(s.amount || s.lines.reduce(function(n,l){return n+l.total;},0))+' MAD</div><div class="ksold-time">'+new Date(s.ts).toLocaleString(document.documentElement.lang === 'ar' ? 'ar-MA' : document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'</div></div></div>';}).join('');
    var ai = owner ? '<section class="ksold-card ksold-ai"><div class="ksold-ai-tag">✦ '+L('Kiwi AI · basé sur vos ventes','Kiwi AI · based on your sales','Kiwi AI · مبني على مبيعاتك')+'</div>'+recommendations(a).map(function(r){return '<div class="ksold-rec"><b>'+esc(r.title)+'</b><p>'+esc(r.text)+'</p></div>';}).join('')+'</section>' : '<section class="ksold-card"><h2>'+L('Produits vendus ensemble','Products sold together','منتجات بيعت معًا')+'</h2><div class="ksold-note">'+L('Associations constatées sur les tickets','Pairings seen on receipts','ارتباطات لوحظت في الإيصالات')+'</div>'+pairRows+'</section>';
    return '<section class="ksold-card"><h2>'+L('Produits','Products','المنتجات')+'</h2><div class="ksold-note">'+L('Quantité, chiffre et dernière vente','Quantity, revenue and last sale','الكمية والإيراد وآخر بيع')+'</div>'+productRows+'</section>'+ai+'<section class="ksold-card"><h2>'+L('Catégories','Categories','الفئات')+'</h2><div class="ksold-note">'+L('Contribution par rayon','Contribution by department','المساهمة حسب القسم')+'</div>'+catRows+'</section>'+(owner?'<section class="ksold-card"><h2>'+L('Produits vendus ensemble','Products sold together','منتجات بيعت معًا')+'</h2><div class="ksold-note">'+L('Paniers réellement observés','Baskets actually observed','السلال المرصودة فعليًا')+'</div>'+pairRows+'</section>':'')+'<section class="ksold-card ksold-full"><h2>'+L('Historique détaillé','Detailed history','السجل التفصيلي')+'</h2><div class="ksold-note">'+L('Quand et dans quel panier chaque produit a été vendu','When and in which basket each product was sold','متى وفي أي سلة بيع كل منتج')+'</div>'+timeline+'</section>';
  }
  function shell(a, owner, loading) {
    return '<div class="ksold"><div class="ksold-head"><div>'+(owner?'':'<h1>'+L('Vendus','Sold','المباع')+'</h1>')+'<div class="ksold-sub">'+(owner?L('Période analysée','Period analysed','الفترة المحلَّلة'):L('Stock vendu, catégories et détail des tickets','Stock sold, categories and receipt details','المخزون المباع والفئات وتفاصيل الإيصالات'))+(loading?L(' · synchronisation…',' · syncing…',' · جارٍ المزامنة…'):'')+'</div></div><div class="ksold-days">'+dayControls(a.days,!owner,a.custom)+'</div></div>'+pickerMarkup(!owner)+'<div class="kx-kpi-strip"><div class="kx-kpi"><div class="l">'+L('Pièces vendues','Items sold','القطع المباعة')+'</div><div class="v">'+a.units+'</div></div><div class="kx-kpi"><div class="l">'+L('Produits actifs','Active products','المنتجات النشطة')+'</div><div class="v">'+a.products.length+'</div></div><div class="kx-kpi"><div class="l">'+L('Tickets analysés','Receipts analysed','الإيصالات المحلَّلة')+'</div><div class="v">'+a.tickets+'</div></div><div class="kx-kpi"><div class="l">'+L('Chiffre produits','Product revenue','إيراد المنتجات')+'</div><div class="v">'+fmt(a.revenue)+'<span class="u">MAD</span></div></div></div><div class="ksold-grid">'+body(a,owner)+'</div></div>';
  }
  function localTill() {
    try {
      if (typeof window.KiwiBoutiqueDemoDay === 'function') return window.KiwiBoutiqueDemoDay() || [];
      var b = JSON.parse(localStorage.getItem('kiwi:bqDay') || 'null');
      if (b && b.m && slug() && b.m !== slug()) return [];
      return Array.isArray(b) ? b : (b && Array.isArray(b.s) ? b.s : []);
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
    fetch('/api/feed?merchant='+encodeURIComponent(m)+'&from='+from,{credentials:'same-origin',headers:{Accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){tillSales=(j&&j.sales)||[];tillLoadedFrom=from;tillFetched=true;})
      .catch(function(){}).finally(function(){tillLoading=false;renderTillNoFetch(panel);});
  }
  function renderTillNoFetch(panel){ if(!panel)return;panel.innerHTML=shell(analyze(localTill().concat(tillSales),tillRange || tillDays),false,tillLoading);wire(panel,true); }
  function dashboardSales() { try { return (window.KiwiSales && KiwiSales.list && KiwiSales.list()) || []; } catch (_) { return []; } }
  function renderDashboard() {
    ensureStyle(); var a = analyze(dashboardSales(),dashboardRange || dashboardDays);
    if (!window.Kiwi || !Kiwi.appPage) return;
    Kiwi.appPage('sold',{title:L('Vendus','Sold','المباع'),subtitle:L('Analyse de vos produits vendus · ventes brutes, les retours ne sont pas déduits','Analysis of your products sold · gross sales, returns are not deducted','تحليل منتجاتك المباعة · مبيعات إجمالية، لا تُخصم المرتجعات'),body:shell(a,true,false)});
    wire(document, false);
  }
  function wire(root, till) {
    var rerender = function(fetchMore){ if(till){renderTillNoFetch(root);if(fetchMore)fetchTill(root);}else{renderDashboard();} };
    var picker = till ? tillPicker : dashboardPicker;
    Array.prototype.forEach.call(root.querySelectorAll('[data-ksold-days]'),function(b){ b.onclick=function(){ var d=Number(b.dataset.ksoldDays)||7;picker.open=false;picker.error='';if(till){tillDays=d;tillRange=null;}else{dashboardDays=d;dashboardRange=null;}rerender(true); }; });
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
      var selected={from:dateKey(a),to:dateKey(z)};picker.picked=true;picker.open=false;picker.error='';if(till)tillRange=selected;else dashboardRange=selected;rerender(true);
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
  window.KiwiSoldInsights = { analyze: analyze, renderTill: renderTill, renderDashboard: renderDashboard };
  window.addEventListener('load',function(){ installDashboard(); if(window.KiwiVenue&&KiwiVenue.subscribe)KiwiVenue.subscribe(installDashboard); if(window.KiwiSales&&KiwiSales.subscribe)KiwiSales.subscribe(function(){if(document.querySelector('.ksold')&&!document.querySelector('[data-bq-panel="vendus"].is-on'))renderDashboard();}); });
})();
