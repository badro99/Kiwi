/* Kiwi · Detailed daily-report export builder.
 *
 * The Z report is accounting evidence, not a dashboard decoration.  Every
 * optional section below is therefore derived from a named ledger and missing
 * data is written as "not available / not configured", never replaced by a
 * plausible-looking zero. */
(function () {
  'use strict';

  /* Le journal d'inventaire range ses motifs en CLÉS MACHINE — 'sale', 'waste',
   * 'sale-reversal' — parce que c'est ce qui se compare, se rapproche et se
   * synchronise avec D1. On ne les traduit donc pas à la source : on les traduit
   * ICI, au moment de les écrire dans un rapport qui, lui, se lit en français.
   * Une clé inconnue retombe sur elle-même : un motif inattendu doit rester
   * visible dans la colonne, pas disparaître derrière un tiret. */
  var MOTIF = {
    opening: 'Solde initial', receipt: 'Réception', sale: 'Vente',
    'sale-reversal': 'Annulation de vente', waste: 'Casse / perte',
    manual: 'Saisie manuelle',
  };
  var REF_TYPE = {
    opening: 'solde initial', receipt: 'réception', sale: 'vente',
    'kitchen-void': 'annulation cuisine', breakage: 'casse',
    'assistant-confirmed': 'confirmé par l’assistant', manual: 'saisie manuelle',
  };
  function motif(k) { return MOTIF[k] || k || ''; }
  function refType(k) { return REF_TYPE[k] || k || ''; }

  var KINDS = [
    { id: 'summary', title: 'Synthèse de la journée', desc: 'Ouverture, clôture, encaissements, transactions et ticket moyen.', on: true },
    { id: 'sales', title: 'Ventes détaillées', desc: 'Chaque ticket, son heure, son moyen de paiement, son canal et son panier.', on: true },
    { id: 'payments', title: 'Paiements & tiroir-caisse', desc: 'Ventilation, fond, mouvements, attendu, compté et écart.', on: true },
    { id: 'products', title: 'Articles vendus', desc: 'Quantités et chiffre d’affaires par catégorie et par article.', on: true },
    { id: 'materials', title: 'Matières utilisées', desc: 'Consommation calculée depuis les fiches techniques et sorties de stock.' },
    { id: 'margins', title: 'Marges par article', desc: 'CA net, coût, marge en MAD et en %, avec couverture de chiffrage.' },
    { id: 'team', title: 'Équipe & heures', desc: 'Planning, heures réalisées, encaissements et responsabilités de la journée.' },
    { id: 'stock', title: 'Mouvements de stock', desc: 'Réceptions, consommations, corrections et autres mouvements réels.' },
    { id: 'reservations', title: 'Réservations', desc: 'Créneaux, clients, services, ressources et statuts de la journée.' },
    { id: 'adjustments', title: 'Ajustements & traçabilité', desc: 'Remboursements, remises, annulations, passations et réouvertures.' },
  ];

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }
  function num(v) { v = +v; return Number.isFinite(v) ? v : 0; }
  function r2(v) { return Math.round(num(v) * 100) / 100; }
  function raw(v) { return String(r2(v)); }
  function hm(v) { if (!v) return ''; var d = new Date(+v); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function norm(v) { return String(v == null ? '' : v).trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function q(row) {
    return row.map(function (v) {
      var s = String(v == null ? '' : v);
      /* A customer/product name is untrusted spreadsheet input. */
      if (/^[\t\r ]*[=+\-@]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',');
  }
  function section(out, title, columns) {
    if (out.length) out.push('');
    out.push(q(['## ' + title]));
    if (columns) out.push(q(columns));
  }
  function bounds(report) {
    try { return window.KiwiDayReport.dayBounds(report.day, report.store && report.store.slug); }
    catch (_) { return { from: new Date(report.day + 'T00:00:00').getTime(), to: new Date(report.day + 'T00:00:00').getTime() + 86400000 }; }
  }
  function saleRows(report) {
    var b = bounds(report), list = [];
    try { list = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list() : []; } catch (_) {}
    var seen = Object.create(null), out = [];
    (list || []).forEach(function (s) {
      var ts = +(s && (s.ts != null ? s.ts : s.time));
      if (!ts || ts < b.from || ts >= b.to) return;
      var id = String(s.id || s.ref || (ts + ':' + num(s.amount != null ? s.amount : s.total)));
      if (seen[id]) return; seen[id] = 1;
      out.push({
        id: id, ref: String(s.ref || s.id || ''), ts: ts,
        amount: r2(s.amount != null ? s.amount : s.total),
        method: String(s.method || s.raw || ''), channel: String(s.channel || ''),
        cashier: String(s.cashier || ''), label: String(s.label || ''),
        kind: String(s.kind || ''), discount: r2(s.discount), tip: r2(s.tip),
        lines: Array.isArray(s.lines) ? s.lines.filter(Boolean) : [],
      });
    });
    return out.sort(function (a, b2) { return a.ts - b2.ts; });
  }
  function lineName(l) { return String(l && (l.name != null ? l.name : l.n) || 'Article'); }
  function lineQty(l) { return Math.max(0, num(l && (l.qty != null ? l.qty : (l.q != null ? l.q : l.quantity)))); }
  function lineTotal(l) { return Math.max(0, num(l && (l.total != null ? l.total : l.t))); }
  function lineId(l) { return String(l && (l.itemId || l.item_id || l.i || l.id) || ''); }
  function lineCat(l) { return String(l && (l.cat || l.category || l.c) || 'Non classé'); }
  function lineKind(l) { return String(l && (l.kind || l.type) || '').toLowerCase(); }
  function costDoc() { try { return window.KiwiCost && window.KiwiCost.doc ? window.KiwiCost.doc() : {}; } catch (_) { return {}; } }
  function costOf(l) {
    var own = +(l && (l.unitCost != null ? l.unitCost : l.k));
    if (Number.isFinite(own) && own > 0) return { mad: own, src: 'vente' };
    try {
      if (window.KiwiCost && window.KiwiCost.of) return window.KiwiCost.of({ id: lineId(l), name: lineName(l), kind: '' }) || { mad:null, src:null };
    } catch (_) {}
    return { mad:null, src:null };
  }
  function products(report, sales) {
    var by = Object.create(null);
    sales.forEach(function (s) {
      var basketTotal=s.lines.reduce(function(sum,l){return sum+lineTotal(l);},0);
      /* A ticket-level discount belongs to every line pro rata.  Reporting
       * catalogue totals here would overstate product revenue and every margin
       * derived from it. */
      var revenueScale=basketTotal>0&&s.amount>=0?Math.min(1,s.amount/basketTotal):1;
      s.lines.forEach(function (l) {
        var name = lineName(l), id = lineId(l), key = id || ('name:' + norm(name));
        var p = by[key] || (by[key] = { id:id, name:name, cat:lineCat(l), qty:0, revenue:0, cost:0, costKnown:true, costSrc:'' });
        var qty = lineQty(l), total = lineTotal(l)*revenueScale, c = costOf(l);
        p.qty += qty; p.revenue += total;
        if (c.mad == null) p.costKnown = false;
        else { p.cost += num(c.mad) * qty; p.costSrc = c.src || p.costSrc; }
      });
    });
    /* Old closed reports can predate line-level feed retention.  Their product
     * totals remain authoritative, but identity/cost coverage is explicitly
     * unknown instead of being guessed. */
    if (!Object.keys(by).length) {
      (report.categories || []).forEach(function (c) { (c.products || []).forEach(function (p) {
        var key = 'snapshot:' + norm(c.name) + ':' + norm(p.name);
        by[key] = { id:'', name:p.name, cat:c.name || 'Non classé', qty:num(p.qty), revenue:num(p.total), cost:0, costKnown:false, costSrc:'' };
      }); });
    }
    return Object.keys(by).map(function (k) { var p=by[k]; p.qty=r2(p.qty); p.revenue=r2(p.revenue); p.cost=r2(p.cost); return p; })
      .sort(function (a,b) { return b.revenue-a.revenue; });
  }
  function recipeIdFor(l, d) {
    var id = lineId(l); if (id && d.recipes && d.recipes[id]) return id;
    var want = norm(lineName(l));
    return Object.keys(d.recipes || {}).find(function (k) { return norm(d.recipes[k] && d.recipes[k].name) === want; }) || '';
  }
  function materialRows(sales) {
    var d = costDoc(), by = Object.create(null), covered = 0, eligible = 0;
    var ingByStock = Object.create(null);
    (d.ingredients || []).forEach(function (x) { if (x) ingByStock[String(x.stockId || String(x.id || '').replace(/^stock:/,''))] = x; });
    sales.forEach(function (s) { s.lines.forEach(function (l) {
      /* Match the stock-consumption ledger: labour, tips, taxes and payment
       * lines cannot consume ingredients and must not lower recipe coverage. */
      if (['service','tip','tax','payment','class','pt'].indexOf(lineKind(l)) >= 0) return;
      var qty=lineQty(l); if (!(qty>0)) return; eligible++;
      var rid=recipeIdFor(l,d), rows=null;
      try { rows = rid && window.KiwiInventoryConsumption && window.KiwiInventoryConsumption.recipeLines ? window.KiwiInventoryConsumption.recipeLines(rid, qty, d, 0, []) : null; } catch (_) {}
      if (!rows || !rows.length) return; covered++;
      rows.forEach(function (x) {
        var ing=ingByStock[String(x.itemId)] || {}, key=String(x.itemId);
        var m=by[key] || (by[key]={ id:key, name:ing.name || key, unit:ing.stockUnit || ing.unit || '', qty:0, cost:0, costKnown:true, recipes:Object.create(null) });
        m.qty += num(x.qty); m.recipes[lineName(l)] = 1;
        if (x.unitCost == null) m.costKnown=false; else m.cost += num(x.qty)*num(x.unitCost);
      });
    }); });
    return { rows:Object.keys(by).map(function(k){var x=by[k];x.qty=r2(x.qty);x.cost=r2(x.cost);return x;}).sort(function(a,b){return b.cost-a.cost;}), covered:covered, eligible:eligible };
  }
  function teamRows(report) {
    var people=[]; try { people=window.KiwiTeam && window.KiwiTeam.daySnapshot ? window.KiwiTeam.daySnapshot(report.day) : []; } catch (_) {}
    var facts=Object.create(null);
    (report.cashiers||[]).forEach(function(c){ facts[norm(c.name)]={ sales:num(c.net), txns:num(c.txns) }; });
    function ensure(name,role){ if(!name)return;var k=norm(name);if(!people.some(function(p){return norm(p.name)===k;}))people.push({name:name,role:role||'',plannedStart:'',plannedEnd:'',plannedHours:0,workedHours:0}); }
    ensure(report.openedBy,'Ouverture'); ensure(report.closedBy,'Clôture');
    (report.handovers||[]).forEach(function(h){ensure(h.from,'Passation');ensure(h.to,'Passation');});
    (report.cashiers||[]).forEach(function(c){ensure(c.name,'Encaissement');});
    return people.map(function(p){var f=facts[norm(p.name)]||{};return Object.assign({},p,{sales:r2(f.sales),txns:num(f.txns)});})
      .filter(function(p){return p.plannedHours>0||p.workedHours>0||p.sales>0||norm(p.name)===norm(report.openedBy)||norm(p.name)===norm(report.closedBy);});
  }
  function reservationRows(report) {
    var b=bounds(report), d={}; try{d=window.KiwiReservations&&window.KiwiReservations.get?window.KiwiReservations.get():{};}catch(_){}
    var svc=Object.create(null),res=Object.create(null);(d.services||[]).forEach(function(x){svc[x.id]=x.name;}),(d.resources||[]).forEach(function(x){res[x.id]=x.name;});
    return (d.bookings||[]).filter(function(x){return +x.startAt>=b.from&&+x.startAt<b.to;}).sort(function(a,z){return a.startAt-z.startAt;}).map(function(x){return {time:hm(x.startAt),customer:x.customer&&x.customer.name||'',party:num(x.partySize)||1,service:svc[x.serviceId]||'',resource:res[x.resourceId]||'',status:x.status||'',source:x.source||''};});
  }
  function stockRows(report) { var b=bounds(report); try{return window.KiwiInventory&&window.KiwiInventory.between?window.KiwiInventory.between(b.from,b.to):[];}catch(_){return [];} }
  function context(report) { var sales=saleRows(report); return { sales:sales, products:products(report,sales), materials:materialRows(sales), team:teamRows(report), stock:stockRows(report), reservations:reservationRows(report) }; }

  /* Resolve the current business day exactly once for every entry point.  The
   * dashboard can have both a caisse snapshot and a fresher server sales feed:
   * keep the snapshot when it is at least as complete, otherwise rebuild the
   * commercial totals while inheriting the caisse-only drawer/session facts. */
  function currentStore(d) {
    var venue={};try{venue=window.KiwiVenue&&window.KiwiVenue.getCurrentVenueData?window.KiwiVenue.getCurrentVenueData()||{}:{};}catch(_){}
    return {slug:d.storeSlug(),name:venue.name||'',location:venue.location||venue.city||'',type:venue.type||''};
  }
  function currentSales() {
    try {
      var venue=window.KiwiVenue&&window.KiwiVenue.getCurrentVenue?window.KiwiVenue.getCurrentVenue():undefined;
      return window.KiwiSales&&window.KiwiSales.list?window.KiwiSales.list(venue)||[]:[];
    } catch(_){return [];}
  }
  function sessionFrom(report) {
    var c=report&&report.cash||{};
    return {openedAt:report&&report.openedAt,closedAt:report&&report.closedAt,openedBy:report&&report.openedBy,closedBy:report&&report.closedBy,openingFloat:c.opening,cashMovements:c.movements||[],countedCash:c.counted,discounts:report&&report.discounts&&report.discounts.amount,discountsCount:report&&report.discounts&&report.discounts.count,cancels:report&&report.cancels,handovers:report&&report.handovers||[]};
  }
  function resolveCurrent() {
    var d=window.KiwiDayReport;if(!d||!d.today||!d.build)return null;
    var store=currentStore(d),day=d.today(store.slug),snap=null;
    try{snap=d.load(day,store.slug);}catch(_){}
    var live=null;
    try{live=d.build({day:day,sales:currentSales(),session:snap?sessionFrom(snap):{},store:store,source:'dashboard',categoryIndex:d.categoryIndex&&d.categoryIndex()});}catch(_){}
    if(!live)return snap;
    if(!snap){live.live=true;return live;}
    var liveTx=num(live.txns),snapTx=num(snap.txns),liveGross=num(live.gross),snapGross=num(snap.gross);
    if(liveTx>snapTx||liveGross>snapGross+.005){
      live.closedCount=snap.closedCount||0;live.revisions=snap.revisions||[];
      live.closed=snap.closed;live.live=false;return live;
    }
    return snap;
  }

  function build(report, chosen) {
    chosen=chosen||{}; var out=[], ctx=context(report), store=(report.store&&report.store.name)||'', closed=!!(report.closed||report.closedAt);
    out.push(q(['KIWI · RAPPORT JOURNALIER DÉTAILLÉ']));
    out.push(q(['Établissement',store])); out.push(q(['Journée',report.day])); out.push(q(['Statut',closed?'Clôturée':'Provisoire'])); out.push(q(['Généré le',new Date().toISOString()]));
    out.push(q(['Source clôture',report.source||'caisse']));
    if(chosen.summary){section(out,'SYNTHÈSE',['Indicateur','Valeur','Unité']);[['Ouverture',hm(report.openedAt||report.firstSaleAt),''],['Fermeture',hm(report.closedAt),''],['Ouvert par',report.openedBy||'Non renseigné',''],['Fermé par',report.closedBy||'Non renseigné',''],['Net',raw(report.net),'MAD'],['Total encaissé',raw(report.gross),'MAD'],['Créances',raw(report.receivable),'MAD'],['Transactions',report.txns,''],['Ticket moyen',raw(report.basket),'MAD'],['Couverture du détail produit',num(report.coverage),'%']].forEach(function(x){out.push(q(x));});}
    if(chosen.sales){section(out,'VENTES DÉTAILLÉES',['Heure','Référence','Montant (MAD)','Paiement','Canal','Encaisseur','Libellé','Article','Qté','Total ligne (MAD)']);if(!ctx.sales.length)out.push(q(['Détail des tickets indisponible dans le grand livre pour cette journée. Les agrégats de clôture restent disponibles.']));ctx.sales.forEach(function(s){if(!s.lines.length)out.push(q([hm(s.ts),s.ref,raw(s.amount),s.method,s.channel,s.cashier,s.label,'','','']));else s.lines.forEach(function(l,i){out.push(q([i?'':hm(s.ts),i?'':s.ref,i?'':raw(s.amount),i?'':s.method,i?'':s.channel,i?'':s.cashier,i?'':s.label,lineName(l),raw(lineQty(l)),raw(lineTotal(l))]));});});var ledgerTotal=r2(ctx.sales.reduce(function(sum,s){return sum+num(s.amount);},0)),gap=r2(ledgerTotal-num(report.gross));out.push(q(['CONTRÔLE','Grand livre',raw(ledgerTotal),'Clôture',raw(report.gross),'Écart',raw(gap),gap===0?'Rapproché':'À vérifier','','']));}
    if(chosen.payments){section(out,'PAIEMENTS & TIROIR',['Indicateur','Valeur (MAD)','Détail']);Object.keys(report.methods||{}).forEach(function(k){out.push(q(['Paiement · '+k,raw(report.methods[k]),'']));});var c=report.cash||{};[['Fond d’ouverture',c.opening],['Espèces encaissées',c.sales],['Attendu',c.expected],['Compté',c.counted],['Écart',c.ecart]].forEach(function(x){out.push(q([x[0],x[1]==null?'Non renseigné':raw(x[1]),'']));});(c.movements||[]).forEach(function(m){out.push(q(['Mouvement · '+(m.reason||m.type),raw((m.type==='out'?-1:1)*num(m.amount)),m.note||'']));});}
    if(chosen.products){section(out,'ARTICLES VENDUS',['Catégorie','Article','Qté','CA brut (MAD)']);if(!ctx.products.length)out.push(q(['Aucun détail produit disponible.']));ctx.products.forEach(function(p){out.push(q([p.cat,p.name,raw(p.qty),raw(p.revenue)]));});}
    if(chosen.materials){section(out,'MATIÈRES UTILISÉES',['Matière','Identifiant stock','Quantité','Unité','Coût mesuré (MAD)','Produits concernés']);out.push(q(['Couverture des lignes avec fiche technique',ctx.materials.eligible?Math.round(ctx.materials.covered/ctx.materials.eligible*100)+' %':'Non mesurable']));if(!ctx.materials.rows.length)out.push(q(['Aucune matière dérivable : aucune fiche technique complète reliée aux ventes détaillées.']));ctx.materials.rows.forEach(function(m){out.push(q([m.name,m.id,raw(m.qty),m.unit,m.costKnown?raw(m.cost):'Coût non configuré',Object.keys(m.recipes).join(' · ')]));});}
    if(chosen.margins){section(out,'MARGES PAR ARTICLE',['Article','Qté','CA brut (MAD)','CA net HT (MAD)','Coût (MAD)','Marge (MAD)','Marge (%)','Source coût']);var knownRevenue=0,totalRevenue=0;ctx.products.forEach(function(p){totalRevenue+=p.revenue;var net=p.revenue;try{if(window.KiwiCost&&window.KiwiCost.netOf)net=window.KiwiCost.netOf(p.revenue,window.KiwiCost.basis&&window.KiwiCost.basis());}catch(_){}var profit=p.costKnown?r2(net-p.cost):null,pct=p.costKnown&&net>0?r2(profit/net*100):null;if(p.costKnown)knownRevenue+=p.revenue;out.push(q([p.name,raw(p.qty),raw(p.revenue),raw(net),p.costKnown?raw(p.cost):'Non chiffré',profit==null?'Non chiffré':raw(profit),pct==null?'Non chiffré':raw(pct),p.costSrc||'Non configuré']));});out.push(q(['Couverture du chiffrage','','',totalRevenue?Math.round(knownRevenue/totalRevenue*100)+' %':'Non mesurable']));}
    if(chosen.team){section(out,'ÉQUIPE & HEURES',['Collaborateur','Fonction','Début planifié','Fin planifiée','Heures planifiées','Heures réalisées','CA encaissé (MAD)','Transactions']);if(!ctx.team.length)out.push(q(['Aucune présence, heure réalisée ou responsabilité tracée pour cette journée.']));ctx.team.forEach(function(p){out.push(q([p.name,p.role,p.plannedStart||'',p.plannedEnd||'',raw(p.plannedHours),raw(p.workedHours),raw(p.sales),p.txns||0]));});}
    if(chosen.stock){section(out,'MOUVEMENTS DE STOCK',['Heure','Article','Déclinaison','Quantité','Motif','Coût unitaire (MAD)','Référence','Acteur','Note']);if(!ctx.stock.length)out.push(q(['Aucun mouvement de stock enregistré pour cette journée.']));ctx.stock.forEach(function(m){out.push(q([hm(m.occurredTs),m.itemId,m.variantId||'',raw(m.qty),motif(m.reason),m.unitCost==null?'Non renseigné':raw(m.unitCost),[refType(m.refType),m.refId].filter(Boolean).join(' · '),m.actor||'',m.note||'']));});}
    if(chosen.reservations){section(out,'RÉSERVATIONS',['Heure','Client','Couverts','Service','Ressource','Statut','Source']);if(!ctx.reservations.length)out.push(q(['Aucune réservation enregistrée pour cette journée.']));ctx.reservations.forEach(function(x){out.push(q([x.time,x.customer,x.party,x.service,x.resource,x.status,x.source]));});}
    if(chosen.adjustments){section(out,'AJUSTEMENTS & TRAÇABILITÉ',['Événement','Montant / valeur','Responsable','Heure']);out.push(q(['Remboursements',raw(report.refunds&&report.refunds.amount),report.refunds&&report.refunds.count||0,'']));out.push(q(['Remises',raw(report.discounts&&report.discounts.amount),report.discounts&&report.discounts.count||0,'']));out.push(q(['Annulations',report.cancels&&report.cancels.count||report.cancels||0,'','']));(report.handovers||[]).forEach(function(h){out.push(q(['Passation',raw(h.ecart),[h.from,h.to].filter(Boolean).join(' → '),hm(h.ts)]));});(report.revisions||[]).forEach(function(v){out.push(q(['Clôture / réouverture',raw(v.gross),v.by||'',hm(v.at)]));});}
    return out.join('\r\n');
  }
  function downloadCsv(report, chosen) {
    var csv='\ufeff'+build(report,chosen), blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='kiwi-rapport-detaille-'+((report.store&&report.store.slug)||'jour')+'-'+report.day+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }
  function money(v) { return new Intl.NumberFormat('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(num(v))+' MAD'; }
  function dayLabel(v) { try{return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(v+'T12:00:00'));}catch(_){return v;} }
  function table(headers, rows, cls) {
    if(!rows.length)return '<div class="kr-empty">Aucune donnée tracée pour cette section.</div>';
    return '<div class="kr-table-wrap"><table class="'+(cls||'')+'"><thead><tr>'+headers.map(function(h){return '<th>'+esc(h)+'</th>';}).join('')+'</tr></thead><tbody>'+rows.map(function(row){return '<tr>'+row.map(function(v){return '<td>'+esc(v)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table></div>';
  }
  function reportHtml(report, chosen) {
    chosen=chosen||{};var ctx=context(report),store=(report.store&&report.store.name)||'Établissement',closed=!!(report.closed||report.closedAt),parts=[];
    function sectionHtml(title,kicker,body){parts.push('<section class="kr-section"><div class="kr-section-head"><div><span>'+esc(kicker||'DÉTAIL')+'</span><h2>'+esc(title)+'</h2></div></div>'+body+'</section>');}
    if(chosen.summary){
      var cards=[['Chiffre d’affaires',money(report.gross)],['Transactions',String(num(report.txns))],['Ticket moyen',money(report.basket)],['Créances',money(report.receivable)]];
      parts.push('<section class="kr-summary"><div class="kr-cards">'+cards.map(function(c){return '<article><span>'+esc(c[0])+'</span><strong>'+esc(c[1])+'</strong></article>';}).join('')+'</div><div class="kr-facts"><div><span>Ouverture</span><b>'+esc(hm(report.openedAt||report.firstSaleAt)||'Non renseignée')+'</b></div><div><span>Fermeture</span><b>'+esc(hm(report.closedAt)||'Non renseignée')+'</b></div><div><span>Ouvert par</span><b>'+esc(report.openedBy||'Non renseigné')+'</b></div><div><span>Fermé par</span><b>'+esc(report.closedBy||'Non renseigné')+'</b></div></div></section>');
    }
    if(chosen.sales){
      var ledgerTotal=r2(ctx.sales.reduce(function(sum,s){return sum+num(s.amount);},0)),gap=r2(ledgerTotal-num(report.gross));
      var saleRowsHtml=ctx.sales.map(function(s){return [hm(s.ts),s.ref||'·',s.lines.map(function(l){return lineQty(l)+' × '+lineName(l);}).join(' · ')||s.label||'·',s.method||'·',s.channel||'·',s.cashier||'·',money(s.amount)];});
      sectionHtml('Ventes détaillées','GRAND LIVRE',table(['Heure','Ticket','Contenu','Paiement','Canal','Encaisseur','Total'],saleRowsHtml,'kr-sales')+'<div class="kr-check '+(gap===0?'ok':'warn')+'"><b>'+(gap===0?'✓ Rapproché':'! Écart à vérifier')+'</b><span>Grand livre '+money(ledgerTotal)+' · clôture '+money(report.gross)+' · écart '+money(gap)+'</span></div>');
    }
    if(chosen.payments){
      var pay=Object.keys(report.methods||{}).map(function(k){return [k,money(report.methods[k])];}),cash=report.cash||{};
      [['Fond d’ouverture',cash.opening],['Espèces encaissées',cash.sales],['Attendu en caisse',cash.expected],['Compté',cash.counted],['Écart',cash.ecart]].forEach(function(x){pay.push([x[0],x[1]==null?'Non renseigné':money(x[1])]);});
      sectionHtml('Paiements & tiroir-caisse','ENCAISSEMENT',table(['Indicateur','Montant'],pay));
    }
    if(chosen.products)sectionHtml('Articles vendus','PERFORMANCE PRODUIT',table(['Catégorie','Article','Quantité','Chiffre d’affaires'],ctx.products.map(function(p){return[p.cat,p.name,raw(p.qty),money(p.revenue)];})));
    if(chosen.materials){
      var materialBody='<div class="kr-coverage"><span>Couverture des fiches techniques</span><b>'+(ctx.materials.eligible?Math.round(ctx.materials.covered/ctx.materials.eligible*100)+' %':'Non mesurable')+'</b></div>';
      materialBody+=ctx.materials.rows.length?table(['Matière','Quantité','Unité','Coût mesuré','Produits concernés'],ctx.materials.rows.map(function(m){return[m.name,raw(m.qty),m.unit||'·',m.costKnown?money(m.cost):'Coût non configuré',Object.keys(m.recipes).join(' · ')];})):'<div class="kr-empty">Aucune matière dérivable : les ventes ne disposent pas encore de fiches techniques complètes.</div>';
      sectionHtml('Matières utilisées','CONSOMMATION',materialBody);
    }
    if(chosen.margins){
      var known=0,total=0,marginRows=ctx.products.map(function(p){total+=p.revenue;var net=p.revenue;try{if(window.KiwiCost&&window.KiwiCost.netOf)net=window.KiwiCost.netOf(p.revenue,window.KiwiCost.basis&&window.KiwiCost.basis());}catch(_){}var profit=p.costKnown?r2(net-p.cost):null,pct=p.costKnown&&net>0?r2(profit/net*100):null;if(p.costKnown)known+=p.revenue;return[p.name,raw(p.qty),money(p.revenue),money(net),p.costKnown?money(p.cost):'Non chiffré',profit==null?'Non chiffré':money(profit),pct==null?'Non chiffré':raw(pct)+' %'];});
      sectionHtml('Marges par article','RENTABILITÉ','<div class="kr-coverage"><span>CA couvert par un coût fiable</span><b>'+(total?Math.round(known/total*100)+' %':'Non mesurable')+'</b></div>'+table(['Article','Qté','CA brut','CA net HT','Coût','Marge','Taux'],marginRows));
    }
    if(chosen.team)sectionHtml('Équipe & heures','COLLABORATEURS',table(['Collaborateur','Fonction','Planning','Heures prévues','Heures réalisées','CA encaissé','Tickets'],ctx.team.map(function(p){return[p.name,p.role||'·',[p.plannedStart,p.plannedEnd].filter(Boolean).join('–')||'·',raw(p.plannedHours)+' h',raw(p.workedHours)+' h',money(p.sales),String(p.txns||0)];})));
    if(chosen.stock)sectionHtml('Mouvements de stock','STOCK',table(['Heure','Article','Quantité','Motif','Coût unitaire','Référence','Acteur'],ctx.stock.map(function(m){return[hm(m.occurredTs),m.itemId,raw(m.qty),motif(m.reason)||'·',m.unitCost==null?'Non renseigné':money(m.unitCost),[refType(m.refType),m.refId].filter(Boolean).join(' · ')||'·',m.actor||'·'];})));
    if(chosen.reservations)sectionHtml('Réservations','SERVICE CLIENT',table(['Heure','Client','Couverts','Service','Ressource','Statut','Source'],ctx.reservations.map(function(x){return[x.time,x.customer||'·',String(x.party),x.service||'·',x.resource||'·',x.status||'·',x.source||'·'];})));
    if(chosen.adjustments){
      var audit=[['Remboursements',money(report.refunds&&report.refunds.amount),(report.refunds&&report.refunds.count||0)+' opération(s)'],['Remises',money(report.discounts&&report.discounts.amount),(report.discounts&&report.discounts.count||0)+' opération(s)'],['Annulations',String(report.cancels&&report.cancels.count||report.cancels||0),'']];
      (report.handovers||[]).forEach(function(h){audit.push(['Passation '+[h.from,h.to].filter(Boolean).join(' → '),money(h.ecart),hm(h.ts)]);});
      sectionHtml('Ajustements & traçabilité','CONTRÔLE',table(['Événement','Valeur','Détail'],audit));
    }
    var css='@page{size:A4;margin:16mm 13mm 18mm}*{box-sizing:border-box}body{margin:0;background:#eef2ef;color:#0A0F0D;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.kr-page{max-width:1040px;margin:32px auto;background:#fff;box-shadow:0 24px 70px rgba(5,59,44,.14)}.kr-hero{padding:42px 46px 34px;background:#053B2C;color:#fff;position:relative;overflow:hidden}.kr-hero:after{content:"";position:absolute;width:280px;height:280px;border-radius:50%;right:-90px;top:-170px;background:#7DF2B0;opacity:.16}.kr-brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:42px}.kr-brand img{width:92px;filter:brightness(0) invert(1)}.kr-status{padding:7px 12px;border:1px solid rgba(255,255,255,.25);border-radius:999px;font-size:11px;letter-spacing:.09em;text-transform:uppercase}.kr-eyebrow,.kr-section-head span{font-size:10px;font-weight:800;letter-spacing:.17em;color:#7DF2B0}.kr-hero h1{font-size:38px;line-height:1.05;margin:10px 0 8px;letter-spacing:-.04em}.kr-hero p{margin:0;color:rgba(255,255,255,.7);font-size:14px}.kr-summary{padding:28px 38px 0}.kr-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.kr-cards article{padding:17px;border:1px solid #dfe6e2;border-radius:14px;background:#F7F5F0}.kr-cards span,.kr-facts span,.kr-coverage span{display:block;color:#66706b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}.kr-cards strong{display:block;margin-top:10px;font-size:20px;letter-spacing:-.03em}.kr-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:20px;padding:16px 4px 20px;border-bottom:1px solid #e4e8e5}.kr-facts b{display:block;font-size:12px;margin-top:5px}.kr-section{padding:26px 38px 0;break-inside:auto}.kr-section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:13px}.kr-section-head span{color:#0B6E4F}.kr-section h2{margin:5px 0 0;font-size:21px;letter-spacing:-.025em}.kr-table-wrap{border:1px solid #dfe6e2;border-radius:12px;overflow:hidden}table{width:100%;border-collapse:collapse;font-size:10px}thead{display:table-header-group}th{background:#F7F5F0;color:#55605a;text-align:left;text-transform:uppercase;letter-spacing:.06em;font-size:8px;padding:9px 10px}td{padding:9px 10px;border-top:1px solid #e8ece9;vertical-align:top}tbody tr:nth-child(even){background:#fbfcfb}.kr-sales td:nth-child(3){max-width:250px}.kr-check{display:flex;justify-content:space-between;gap:16px;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:10px}.kr-check.ok{background:#e7f7ef;color:#075f45}.kr-check.warn{background:#fff2df;color:#8a4d00}.kr-coverage{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;margin-bottom:10px;border-radius:10px;background:#edf7f2}.kr-coverage b{font-size:16px;color:#0B6E4F}.kr-empty{padding:22px;border:1px dashed #cbd4cf;border-radius:12px;text-align:center;color:#66706b;font-size:11px}.kr-note{margin:30px 38px 0;padding:14px;border-left:3px solid #0B6E4F;background:#F7F5F0;color:#66706b;font-size:10px;line-height:1.5}.kr-footer{display:flex;justify-content:space-between;padding:24px 38px 34px;color:#7b837f;font-size:9px}.kr-footer b{color:#0B6E4F}@media print{body{background:#fff}.kr-page{margin:0;max-width:none;box-shadow:none}.kr-hero{padding:27px 30px 23px}.kr-brand{margin-bottom:25px}.kr-summary{padding:20px 24px 0}.kr-section{padding:20px 24px 0}.kr-note{margin:22px 24px 0}.kr-footer{padding:18px 24px 0}.kr-cards article,.kr-check,.kr-coverage{break-inside:avoid}tr{break-inside:avoid}.kr-section-head{break-after:avoid}.kr-hero h1{font-size:30px}}';
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport Kiwi · '+esc(store)+' · '+esc(report.day)+'</title><style>'+css+'</style></head><body><main class="kr-page"><header class="kr-hero"><div class="kr-brand"><img src="/assets/kiwi-newlogo-inverse.svg" alt="Kiwi"><span class="kr-status">'+(closed?'Journée clôturée':'Rapport provisoire')+'</span></div><span class="kr-eyebrow">RAPPORT JOURNALIER DÉTAILLÉ</span><h1>'+esc(store)+'</h1><p>'+esc(dayLabel(report.day))+' · généré le '+esc(new Date().toLocaleString('fr-FR'))+'</p></header>'+parts.join('')+'<div class="kr-note"><b>Fiabilité des données.</b> Ce rapport utilise uniquement les faits disponibles dans les journaux Kiwi. Toute donnée absente reste indiquée comme non renseignée, non configurée ou non mesurable.</div><footer class="kr-footer"><span><b>Kiwi OS</b> · rapport opérationnel</span><span>'+esc(report.day)+' · '+esc((report.store&&report.store.slug)||'')+'</span></footer></main></body></html>';
  }
  function printReport(report, chosen) {
    var w=window.open('','_blank');if(!w){try{window.Kiwi.toast('Autorisez les fenêtres pour ouvrir le rapport',{type:'error'});}catch(_){}return false;}
    w.document.open();w.document.write(reportHtml(report,chosen));w.document.close();
    w.addEventListener('load',function(){setTimeout(function(){w.focus();w.print();},250);},{once:true});return true;
  }
  function styles() {
    if(document.getElementById('kdr-export-css'))return;var s=document.createElement('style');s.id='kdr-export-css';s.textContent=''
      +'.kdx-presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.kdx-preset{border:1px solid var(--n-200);background:var(--surface);color:var(--ink);border-radius:999px;padding:9px 13px;font:600 12px var(--sans);cursor:pointer}.kdx-preset:hover{border-color:var(--atlas);color:var(--atlas)}'
      +'.kdx-format{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.kdx-format label{display:flex;gap:11px;align-items:flex-start;padding:13px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface);cursor:pointer}.kdx-format label:has(input:checked){border-color:var(--atlas);box-shadow:inset 0 0 0 1px var(--atlas)}.kdx-format input{margin-top:3px;accent-color:var(--atlas)}.kdx-format b{display:block;color:var(--ink);font-size:13px}.kdx-format small{display:block;color:var(--n-500);font-size:11.5px;line-height:1.45;margin-top:3px}'
      +'.kdx-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kdx-opt{display:grid;grid-template-columns:22px 1fr;gap:11px;align-items:start;padding:13px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface);cursor:pointer}.kdx-opt:has(input:checked){border-color:var(--atlas);background:var(--mint-soft)}.kdx-opt input{width:18px;height:18px;accent-color:var(--atlas);margin:2px 0}.kdx-opt b{display:block;color:var(--ink);font-size:13.5px}.kdx-opt small{display:block;color:var(--n-500);font-size:11.5px;line-height:1.45;margin-top:3px}.kdx-note{margin-top:14px;padding:11px 13px;border-left:3px solid var(--atlas);background:var(--paper-soft);color:var(--n-600);font-size:12px;line-height:1.5}.kdx-count{margin-right:auto;color:var(--n-500);font-size:12px}.kdx-export{border:0;border-radius:10px;padding:11px 17px;background:var(--atlas);color:var(--inverse-ink);font-weight:700;cursor:pointer}.kdx-export:disabled{opacity:.45;cursor:not-allowed}@media(max-width:650px){.kdx-list,.kdx-format{grid-template-columns:1fr}}';document.head.appendChild(s);
  }
  function open(report) {
    if(!report||!window.Kiwi||!window.Kiwi.modal)return;styles();
    var body='<div class="kdx-format"><label><input type="radio" name="kdx-format" value="pdf" checked><span><b>Rapport professionnel · PDF</b><small>Mise en page Kiwi, lisible, paginée et prête à imprimer ou envoyer.</small></span></label><label><input type="radio" name="kdx-format" value="csv"><span><b>Données brutes · CSV</b><small>Pour Excel, Numbers, la comptabilité ou une analyse personnalisée.</small></span></label></div><div class="kdx-presets"><button class="kdx-preset" data-kdx-preset="sales">Ventes uniquement</button><button class="kdx-preset" data-kdx-preset="profit">Ventes + marges</button><button class="kdx-preset" data-kdx-preset="ops">Opérations complètes</button><button class="kdx-preset" data-kdx-preset="all">Tout sélectionner</button></div><div class="kdx-list">'+KINDS.map(function(x){return '<label class="kdx-opt"><input type="checkbox" value="'+x.id+'"'+(x.on?' checked':'')+'><span><b>'+esc(x.title)+'</b><small>'+esc(x.desc)+'</small></span></label>';}).join('')+'</div><div class="kdx-note">Kiwi exporte uniquement les faits disponibles pour cette journée. Les coûts, matières, heures ou mouvements manquants seront signalés comme non configurés ou non tracés · jamais remplacés par zéro.</div>';
    var m=window.Kiwi.modal({title:'Composer le rapport détaillé',desc:'Choisissez le format et exactement ce que le rapport doit contenir.',width:820,body:body,foot:'<span class="kdx-count" data-kdx-count></span><button type="button" class="kb ghost" data-kdx-cancel>Annuler</button><button type="button" class="kdx-export" data-kdx-export>Créer le rapport PDF</button>'});
    var checks=[].slice.call(m.el.querySelectorAll('.kdx-opt input')),count=m.el.querySelector('[data-kdx-count]'),go=m.el.querySelector('[data-kdx-export]');
    function update(){var n=checks.filter(function(x){return x.checked;}).length,format=(m.el.querySelector('input[name="kdx-format"]:checked')||{}).value||'pdf';count.textContent=n+' section'+(n>1?'s':'')+' sélectionnée'+(n>1?'s':'');go.textContent=format==='csv'?'Télécharger les données CSV':'Créer le rapport PDF';go.disabled=!n;}
    var sets={sales:['summary','sales','products'],profit:['summary','sales','products','margins'],ops:['summary','sales','payments','products','materials','team','stock','reservations','adjustments'],all:KINDS.map(function(x){return x.id;})};
    m.el.addEventListener('change',update);m.el.querySelectorAll('[data-kdx-preset]').forEach(function(b){b.onclick=function(){var wanted=sets[b.dataset.kdxPreset]||[];checks.forEach(function(x){x.checked=wanted.indexOf(x.value)>=0;});update();};});
    m.el.querySelector('[data-kdx-cancel]').onclick=m.close;go.onclick=function(){var chosen={},format=(m.el.querySelector('input[name="kdx-format"]:checked')||{}).value||'pdf';checks.forEach(function(x){if(x.checked)chosen[x.value]=true;});if(format==='csv')downloadCsv(report,chosen);else printReport(report,chosen);m.close();try{window.Kiwi.toast(format==='csv'?'Données CSV téléchargées':'Rapport prêt à imprimer ou enregistrer en PDF',{type:'success'});}catch(_){}};update();
  }
  function openCurrent(trigger) {
    var wasDisabled=!!(trigger&&trigger.disabled);
    if(trigger){trigger.disabled=true;trigger.setAttribute('aria-busy','true');}
    try {
      var report=resolveCurrent();
      if(!report){try{window.Kiwi.toast('Le rapport du jour n\'est pas encore disponible',{type:'info'});}catch(_){}return false;}
      open(report);return true;
    } finally {
      if(trigger){trigger.disabled=wasDisabled;trigger.removeAttribute('aria-busy');}
    }
  }
  window.KiwiDayReportExport={open:open,openCurrent:openCurrent,resolveCurrent:resolveCurrent,build:build,reportHtml:reportHtml,context:context,kinds:KINDS.slice()};
}());
