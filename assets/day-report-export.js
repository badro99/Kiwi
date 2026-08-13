/* Kiwi · Detailed daily-report export builder.
 *
 * The Z report is accounting evidence, not a dashboard decoration.  Every
 * optional section below is therefore derived from a named ledger and missing
 * data is written as "not available / not configured", never replaced by a
 * plausible-looking zero. */
(function () {
  'use strict';

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
    if(chosen.stock){section(out,'MOUVEMENTS DE STOCK',['Heure','Article','Déclinaison','Quantité','Motif','Coût unitaire (MAD)','Référence','Acteur','Note']);if(!ctx.stock.length)out.push(q(['Aucun mouvement de stock enregistré pour cette journée.']));ctx.stock.forEach(function(m){out.push(q([hm(m.occurredTs),m.itemId,m.variantId||'',raw(m.qty),m.reason||'',m.unitCost==null?'Non renseigné':raw(m.unitCost),[m.refType,m.refId].filter(Boolean).join(' · '),m.actor||'',m.note||'']));});}
    if(chosen.reservations){section(out,'RÉSERVATIONS',['Heure','Client','Couverts','Service','Ressource','Statut','Source']);if(!ctx.reservations.length)out.push(q(['Aucune réservation enregistrée pour cette journée.']));ctx.reservations.forEach(function(x){out.push(q([x.time,x.customer,x.party,x.service,x.resource,x.status,x.source]));});}
    if(chosen.adjustments){section(out,'AJUSTEMENTS & TRAÇABILITÉ',['Événement','Montant / valeur','Responsable','Heure']);out.push(q(['Remboursements',raw(report.refunds&&report.refunds.amount),report.refunds&&report.refunds.count||0,'']));out.push(q(['Remises',raw(report.discounts&&report.discounts.amount),report.discounts&&report.discounts.count||0,'']));out.push(q(['Annulations',report.cancels&&report.cancels.count||report.cancels||0,'','']));(report.handovers||[]).forEach(function(h){out.push(q(['Passation',raw(h.ecart),[h.from,h.to].filter(Boolean).join(' → '),hm(h.ts)]));});(report.revisions||[]).forEach(function(v){out.push(q(['Clôture / réouverture',raw(v.gross),v.by||'',hm(v.at)]));});}
    return out.join('\r\n');
  }
  function download(report, chosen) {
    var csv='\ufeff'+build(report,chosen), blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='kiwi-rapport-detaille-'+((report.store&&report.store.slug)||'jour')+'-'+report.day+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1500);
  }
  function styles() {
    if(document.getElementById('kdr-export-css'))return;var s=document.createElement('style');s.id='kdr-export-css';s.textContent=''
      +'.kdx-presets{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.kdx-preset{border:1px solid var(--n-200);background:var(--surface);color:var(--ink);border-radius:999px;padding:9px 13px;font:600 12px var(--sans);cursor:pointer}.kdx-preset:hover{border-color:var(--atlas);color:var(--atlas)}'
      +'.kdx-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kdx-opt{display:grid;grid-template-columns:22px 1fr;gap:11px;align-items:start;padding:13px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface);cursor:pointer}.kdx-opt:has(input:checked){border-color:var(--atlas);background:var(--mint-soft)}.kdx-opt input{width:18px;height:18px;accent-color:var(--atlas);margin:2px 0}.kdx-opt b{display:block;color:var(--ink);font-size:13.5px}.kdx-opt small{display:block;color:var(--n-500);font-size:11.5px;line-height:1.45;margin-top:3px}.kdx-note{margin-top:14px;padding:11px 13px;border-left:3px solid var(--atlas);background:var(--paper-soft);color:var(--n-600);font-size:12px;line-height:1.5}.kdx-count{margin-right:auto;color:var(--n-500);font-size:12px}.kdx-export{border:0;border-radius:10px;padding:11px 17px;background:var(--atlas);color:var(--inverse-ink);font-weight:700;cursor:pointer}.kdx-export:disabled{opacity:.45;cursor:not-allowed}@media(max-width:650px){.kdx-list{grid-template-columns:1fr}}';document.head.appendChild(s);
  }
  function open(report) {
    if(!report||!window.Kiwi||!window.Kiwi.modal)return;styles();
    var body='<div class="kdx-presets"><button class="kdx-preset" data-kdx-preset="sales">Ventes uniquement</button><button class="kdx-preset" data-kdx-preset="profit">Ventes + marges</button><button class="kdx-preset" data-kdx-preset="ops">Opérations complètes</button><button class="kdx-preset" data-kdx-preset="all">Tout sélectionner</button></div><div class="kdx-list">'+KINDS.map(function(x){return '<label class="kdx-opt"><input type="checkbox" value="'+x.id+'"'+(x.on?' checked':'')+'><span><b>'+esc(x.title)+'</b><small>'+esc(x.desc)+'</small></span></label>';}).join('')+'</div><div class="kdx-note">Kiwi exporte uniquement les faits disponibles pour cette journée. Les coûts, matières, heures ou mouvements manquants seront signalés comme non configurés ou non tracés — jamais remplacés par zéro.</div>';
    var m=window.Kiwi.modal({title:'Composer le rapport détaillé',desc:'Choisissez exactement ce que votre fichier doit contenir.',width:820,body:body,foot:'<span class="kdx-count" data-kdx-count></span><button type="button" class="kb ghost" data-kdx-cancel>Annuler</button><button type="button" class="kdx-export" data-kdx-export>Télécharger le CSV</button>'});
    var checks=[].slice.call(m.el.querySelectorAll('.kdx-opt input')),count=m.el.querySelector('[data-kdx-count]'),go=m.el.querySelector('[data-kdx-export]');
    function update(){var n=checks.filter(function(x){return x.checked;}).length;count.textContent=n+' section'+(n>1?'s':'')+' sélectionnée'+(n>1?'s':'');go.disabled=!n;}
    var sets={sales:['summary','sales','products'],profit:['summary','sales','products','margins'],ops:['summary','sales','payments','products','materials','team','stock','reservations','adjustments'],all:KINDS.map(function(x){return x.id;})};
    m.el.addEventListener('change',update);m.el.querySelectorAll('[data-kdx-preset]').forEach(function(b){b.onclick=function(){var wanted=sets[b.dataset.kdxPreset]||[];checks.forEach(function(x){x.checked=wanted.indexOf(x.value)>=0;});update();};});
    m.el.querySelector('[data-kdx-cancel]').onclick=m.close;go.onclick=function(){var chosen={};checks.forEach(function(x){if(x.checked)chosen[x.value]=true;});download(report,chosen);m.close();try{window.Kiwi.toast('Rapport détaillé téléchargé',{type:'success'});}catch(_){}};update();
  }
  window.KiwiDayReportExport={open:open,build:build,context:context,kinds:KINDS.slice()};
}());
