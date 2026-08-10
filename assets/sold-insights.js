/* Kiwi · Vendus — product intelligence shared by boutique caisse + dashboard.
 * Reads the existing tenant-scoped sales ledger; it never creates a second
 * analytics database and never fills gaps with demo numbers. */
(function () {
  'use strict';

  var DAY = 86400000;
  var tillSales = [];
  var tillMerchant = '';
  var tillLoading = false;
  var dashboardDays = 30;
  var tillDays = 7;

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function fmt(v) { try { return Math.round(Number(v) || 0).toLocaleString('fr-FR'); } catch (_) { return String(Math.round(Number(v) || 0)); } }
  function slug() {
    try {
      var p = JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null');
      return String((window.KiwiLive && KiwiLive.merchant && KiwiLive.merchant()) || (p && p.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function catalog() {
    var api = window.KiwiBoutiqueCatalog;
    var cats = {}, products = [];
    if (!api) return { cats: cats, products: products };
    var byId = {};
    try { (api.listCategories() || []).forEach(function (c) { cats[String(c.id)] = String(c.name || 'Sans catégorie'); }); } catch (_) {}
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
      return { name: String((p && p.name) || (l && l.name) || 'Article'), qty: qty, total: Math.max(0, total || 0), cat: cat.cats[cid] || String((l && (l.cat || l.category)) || 'Sans catégorie'), stock: p && p._soldStock };
    }).filter(function (l) { return l.name; }) : [];
    return { ts: ts, amount: Math.max(0, Number(raw && (raw.amount || raw.total)) || 0), ref: String(raw && (raw.ref || raw.id) || ''), lines: lines };
  }
  function analyze(source, days) {
    var cat = catalog();
    var now = Date.now(), from = now - days * DAY, previousFrom = from - days * DAY;
    var seen = {};
    var all = (source || []).map(function (s) { return normalize(s, cat); }).filter(function (s) {
      if (!s.ts || !s.lines.length) return false;
      var key = s.ref || [s.ts,s.amount,s.lines.map(function(l){return l.name+':'+l.qty;}).join('|')].join(':');
      if (seen[key]) return false; seen[key] = 1; return true;
    });
    var sales = all.filter(function (s) { return s.ts >= from; });
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
      days: days, sales: sales.sort(function(a,b){return b.ts-a.ts;}), tickets: sales.length, units: units, revenue: revenue,
      products: prod, categories: Object.keys(categories).map(function(k){return categories[k];}).sort(function(a,b){return b.qty-a.qty;}),
      pairs: pairRows, previousTickets: previous.length, catalogCount: cat.products.length,
    };
  }
  function ensureStyle() {
    if (document.getElementById('kiwi-sold-style')) return;
    var s = document.createElement('style'); s.id = 'kiwi-sold-style';
    s.textContent = '.ksold{padding:24px;max-width:1280px;margin:auto;color:var(--ink,#111)}.ksold-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:18px}.ksold-head h1{margin:0;font-size:28px}.ksold-sub{font-size:12px;color:var(--n-500,#777);margin-top:5px}.ksold-days{display:flex;gap:6px}.ksold-days button{border:1px solid var(--n-200,#ddd);background:var(--surface,#fff);padding:8px 12px;border-radius:999px;font:600 11px var(--sans);cursor:pointer}.ksold-days button.on{background:var(--ink,#111);color:#fff}.ksold-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}.ksold-kpi,.ksold-card{border:1px solid var(--n-200,#e5e2dc);background:var(--surface,#fff);border-radius:14px}.ksold-kpi{padding:16px}.ksold-kpi span{display:block;font:10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500,#777)}.ksold-kpi b{display:block;font-size:24px;margin-top:7px}.ksold-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.ksold-card{padding:17px;min-width:0}.ksold-card h2{font-size:15px;margin:0 0 4px}.ksold-note{font-size:11px;color:var(--n-500,#777);margin-bottom:12px}.ksold-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;padding:10px 0;border-top:1px solid var(--n-100,#eee)}.ksold-row:first-of-type{border-top:0}.ksold-name{font-size:13px;font-weight:600}.ksold-meta{font-size:11px;color:var(--n-500,#777);margin-top:3px}.ksold-val{text-align:right;font:600 12px var(--mono)}.ksold-bar{height:4px;background:var(--n-100,#eee);border-radius:9px;margin-top:6px;overflow:hidden}.ksold-bar i{display:block;height:100%;background:var(--atlas,#087a5b);border-radius:9px}.ksold-ai{border-color:color-mix(in srgb,var(--atlas,#087a5b) 35%,transparent);background:color-mix(in srgb,var(--atlas,#087a5b) 5%,var(--surface,#fff))}.ksold-ai-tag{font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--atlas,#087a5b);margin-bottom:10px}.ksold-rec{padding:11px 0;border-top:1px solid color-mix(in srgb,var(--atlas,#087a5b) 16%,transparent)}.ksold-rec b{display:block;font-size:13px;margin-bottom:4px}.ksold-rec p{font-size:12px;line-height:1.45;color:var(--n-600,#666);margin:0}.ksold-full{grid-column:1/-1}.ksold-empty{padding:44px 18px;text-align:center;color:var(--n-500,#777)}.ksold-time{font:11px var(--mono);color:var(--n-500,#777)}@media(max-width:850px){.ksold{padding:16px}.ksold-head{align-items:flex-start;flex-direction:column}.ksold-kpis{grid-template-columns:1fr 1fr}.ksold-grid{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function dayControls(days, till) {
    return [1,7,30,90].filter(function(d){ return !till || d <= 30; }).map(function (d) {
      var label = d === 1 ? "Aujourd'hui" : d + ' jours';
      return '<button type="button" class="' + (days === d ? 'on' : '') + '" data-ksold-days="' + d + '" data-ksold-till="' + (till?'1':'0') + '">' + label + '</button>';
    }).join('');
  }
  function recommendations(a) {
    var out = [];
    if (a.pairs[0] && a.pairs[0].count >= 2) out.push({ title: 'Bundle suggéré', text: a.pairs[0].a + ' + ' + a.pairs[0].b + ' ont été achetés ensemble ' + a.pairs[0].count + ' fois. Testez une offre groupée sans remiser avant d’avoir mesuré son effet.' });
    if (a.products[0]) out.push({ title: 'Produit moteur', text: a.products[0].name + ' mène la période avec ' + a.products[0].qty + ' pièce' + (a.products[0].qty>1?'s':'') + '. Placez les compléments les plus associés à proximité.' });
    var restock = a.products.filter(function(p){return Number.isFinite(p.stock) && p.stock <= Math.max(2,p.qty);})[0];
    if (restock) out.push({ title: 'Réassort à anticiper', text: restock.name + ' a vendu ' + restock.qty + ' pièce(s) sur la période et il en reste ' + restock.stock + '. Vérifiez le prochain arrivage avant une rupture.' });
    var down = a.products.filter(function(p){return p.previousQty >= 2 && p.qty < p.previousQty;}).sort(function(x,y){return (x.qty-x.previousQty)-(y.qty-y.previousQty);})[0];
    if (down) out.push({ title: 'Sous-performance à regarder', text: down.name + ' passe de ' + down.previousQty + ' à ' + down.qty + ' pièce(s) par rapport aux ' + a.days + ' jours précédents. Vérifiez exposition, taille disponible et prix avant toute promotion.' });
    if (!out.length) out.push({ title: 'Analyse en apprentissage', text: 'Il faut au moins deux paniers avec plusieurs produits pour recommander un bundle fiable. Les ventes déjà enregistrées restent visibles ci-dessous.' });
    return out;
  }
  function body(a, owner) {
    if (!a.sales.length) return '<div class="ksold-card ksold-full ksold-empty">Aucune vente avec détail produit sur cette période.</div>';
    var max = a.products[0] ? a.products[0].qty : 1;
    var productRows = a.products.slice(0, owner ? 20 : 12).map(function (p) { return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.name)+'</div><div class="ksold-meta">'+esc(p.category)+' · dernière vente '+new Date(p.last).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})+(Number.isFinite(p.stock)?' · '+p.stock+' en stock':'')+'</div><div class="ksold-bar"><i style="width:'+Math.max(4,Math.round(p.qty/max*100))+'%"></i></div></div><div class="ksold-val">'+p.qty+' pce'+(p.qty>1?'s':'')+'<div class="ksold-meta">'+fmt(p.revenue)+' MAD</div></div></div>'; }).join('');
    var catRows = a.categories.map(function(c){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(c.name)+'</div><div class="ksold-meta">'+c.qty+' pièce'+(c.qty>1?'s':'')+'</div></div><div class="ksold-val">'+fmt(c.revenue)+' MAD</div></div>';}).join('');
    var pairRows = a.pairs.slice(0,8).map(function(p){return '<div class="ksold-row"><div><div class="ksold-name">'+esc(p.a)+' + '+esc(p.b)+'</div><div class="ksold-meta">Même ticket</div></div><div class="ksold-val">'+p.count+' fois</div></div>';}).join('') || '<div class="ksold-note">Aucune association répétée pour l’instant.</div>';
    var timeline = a.sales.slice(0,20).map(function(s){return '<div class="ksold-row"><div><div class="ksold-name">'+s.lines.map(function(l){return l.qty+'× '+esc(l.name);}).join(' · ')+'</div><div class="ksold-meta">'+esc(s.ref || 'Ticket')+'</div></div><div><div class="ksold-val">'+fmt(s.amount || s.lines.reduce(function(n,l){return n+l.total;},0))+' MAD</div><div class="ksold-time">'+new Date(s.ts).toLocaleString('fr-FR',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'</div></div></div>';}).join('');
    var ai = owner ? '<section class="ksold-card ksold-ai"><div class="ksold-ai-tag">✦ Kiwi AI · basé sur vos ventes</div>'+recommendations(a).map(function(r){return '<div class="ksold-rec"><b>'+esc(r.title)+'</b><p>'+esc(r.text)+'</p></div>';}).join('')+'</section>' : '<section class="ksold-card"><h2>Produits vendus ensemble</h2><div class="ksold-note">Associations constatées sur les tickets</div>'+pairRows+'</section>';
    return '<section class="ksold-card"><h2>Produits</h2><div class="ksold-note">Quantité, chiffre et dernière vente</div>'+productRows+'</section>'+ai+'<section class="ksold-card"><h2>Catégories</h2><div class="ksold-note">Contribution par rayon</div>'+catRows+'</section>'+(owner?'<section class="ksold-card"><h2>Produits vendus ensemble</h2><div class="ksold-note">Paniers réellement observés</div>'+pairRows+'</section>':'')+'<section class="ksold-card ksold-full"><h2>Historique détaillé</h2><div class="ksold-note">Quand et dans quel panier chaque produit a été vendu</div>'+timeline+'</section>';
  }
  function shell(a, owner, loading) {
    return '<div class="ksold"><div class="ksold-head"><div>'+(owner?'':'<h1>Vendus</h1>')+'<div class="ksold-sub">'+(owner?'Performance produits, paniers et opportunités commerciales':'Stock vendu, catégories et détail des tickets')+(loading?' · synchronisation…':'')+'</div></div><div class="ksold-days">'+dayControls(a.days,!owner)+'</div></div><div class="ksold-kpis"><div class="ksold-kpi"><span>Pièces vendues</span><b>'+a.units+'</b></div><div class="ksold-kpi"><span>Produits actifs</span><b>'+a.products.length+'</b></div><div class="ksold-kpi"><span>Tickets analysés</span><b>'+a.tickets+'</b></div><div class="ksold-kpi"><span>Chiffre produits</span><b>'+fmt(a.revenue)+' MAD</b></div></div><div class="ksold-grid">'+body(a,owner)+'</div></div>';
  }
  function localTill() {
    try {
      var b = JSON.parse(localStorage.getItem('kiwi:bqDay') || 'null');
      if (b && b.m && slug() && b.m !== slug()) return [];
      return Array.isArray(b) ? b : (b && Array.isArray(b.s) ? b.s : []);
    } catch (_) { return []; }
  }
  function renderTill(panel) {
    if (!panel) return; ensureStyle();
    var source = localTill().concat(tillSales);
    panel.innerHTML = shell(analyze(source,tillDays),false,tillLoading);
    wire(panel, true);
    fetchTill(panel);
  }
  function fetchTill(panel) {
    var m = slug(); if (!m || tillLoading || (tillMerchant === m && tillSales.length)) return;
    tillLoading = true; renderTillNoFetch(panel);
    var from = Date.now() - 90 * DAY;
    fetch('/api/feed?merchant='+encodeURIComponent(m)+'&from='+from,{credentials:'same-origin',headers:{Accept:'application/json'}})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){tillSales=(j&&j.sales)||[];tillMerchant=m;})
      .catch(function(){}).finally(function(){tillLoading=false;renderTillNoFetch(panel);});
  }
  function renderTillNoFetch(panel){ if(!panel)return;panel.innerHTML=shell(analyze(localTill().concat(tillSales),tillDays),false,tillLoading);wire(panel,true); }
  function dashboardSales() { try { return (window.KiwiSales && KiwiSales.list && KiwiSales.list()) || []; } catch (_) { return []; } }
  function renderDashboard() {
    ensureStyle(); var a = analyze(dashboardSales(),dashboardDays);
    if (!window.Kiwi || !Kiwi.appPage) return;
    Kiwi.appPage('sold',{title:'Vendus',subtitle:'Analyse de vos produits vendus · données de cette boutique',body:shell(a,true,false)});
    wire(document, false);
  }
  function wire(root, till) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-ksold-days]'),function(b){ b.onclick=function(){ var d=Number(b.dataset.ksoldDays)||7;if(till){tillDays=d;var p=b.closest('[data-bq-panel="vendus"]');renderTillNoFetch(p);}else{dashboardDays=d;renderDashboard();} }; });
  }
  function installDashboard() {
    var H = window.Kiwi && Kiwi.handlers; if (!H) { setTimeout(installDashboard,50); return; }
    H['nav-sold'] = renderDashboard;
  }
  window.KiwiSoldInsights = { analyze: analyze, renderTill: renderTill, renderDashboard: renderDashboard };
  window.addEventListener('load',function(){ installDashboard(); if(window.KiwiVenue&&KiwiVenue.subscribe)KiwiVenue.subscribe(installDashboard); if(window.KiwiSales&&KiwiSales.subscribe)KiwiSales.subscribe(function(){if(document.querySelector('.ksold')&&!document.querySelector('[data-bq-panel="vendus"].is-on'))renderDashboard();}); });
})();
