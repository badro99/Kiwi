/* Kiwi · pressing operational subpages
 * Keeps the shared owner dashboard intact and replaces only the navigation
 * destinations that are specific to the exact `pressing` trade.
 */
(function () {
  'use strict';

  var host = null;
  var current = false;
  var currentPage = '';
  var PAGE_LABELS = {
    'pressing-orders': ['Dépôts & commandes', 'Tous les bons, vêtements et échéances au même endroit'],
    'pressing-workshop': ['Atelier & flux', 'Pilotez chaque pièce du dépôt au contrôle qualité'],
    'pressing-pickup': ['Retraits & rack', 'Trouvez un client, son cintre et son solde en quelques secondes'],
    'pressing-services': ['Services & tarifs', 'Structurez les traitements, suppléments et délais'],
    'pressing-quality': ['Qualité & incidents', 'Photos, taches, réserves et reprises sans perte d’information'],
    'pressing-delivery': ['Collecte & livraison', 'Organisez les tournées et les promesses client']
  };

  var PATHS = {
    shirt: '<path d="M6.5 3 3 5.5 5 9l2-1v13h10V8l2 1 2-3.5L17.5 3A5 5 0 0 1 12 6a5 5 0 0 1-5.5-3Z"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    scan: '<path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3M7 12h10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    rack: '<path d="M5 21V7h14v14M3 21h18M8 7V3h8v4M8 12h8M8 16h8"/>',
    alert: '<path d="M10.3 3.6 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    money: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M17 14h.01"/><circle cx="12" cy="12" r="2"/>',
    workflow: '<path d="M5 5h7M5 12h14M12 19h7"/><circle cx="16" cy="5" r="2"/><circle cx="8" cy="19" r="2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    van: '<path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
    droplet: '<path d="M12 2s7 7.2 7 12a7 7 0 0 1-14 0c0-4.8 7-12 7-12Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    tag: '<path d="M20.6 13.4 11 3.8A2 2 0 0 0 9.6 3H4v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l3.6-3.6a2 2 0 0 0 0-2.6Z"/><circle cx="7.5" cy="7.5" r="1"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5A8 8 0 1 1 21 15Z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || PATHS.shirt) + '</svg>';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString('fr-FR'); }
  function when(s) {
    if (!s) return 'Échéance non définie';
    var d = new Date(s); if (!Number.isFinite(d.getTime())) return 'Échéance non définie';
    return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short' }) + ' · ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  }
  function venue() { try { return window.KiwiVenue && KiwiVenue.getCurrentVenueData(); } catch (_) { return null; } }
  function isPressing() {
    var v = venue();
    return !!(v && (v.subtype === 'pressing' || v.trade === 'pressing'));
  }
  function summary() {
    try { return window.KiwiPressingOps ? KiwiPressingOps.summary() : { orders:[], active:0,received:0,treating:0,ready:0,late:0,due:0,pieces:0,attention:0,racks:0,unnotified:0 }; }
    catch (_) { return { orders:[], active:0,received:0,treating:0,ready:0,late:0,due:0,pieces:0,attention:0,racks:0,unnotified:0 }; }
  }
  function todayRevenue() {
    try {
      var id = KiwiVenue.getVenue();
      var d = new Date(); d.setHours(0,0,0,0); var start = d.getTime();
      return KiwiSales.totals(id, start, start + 86400000).revenue || 0;
    } catch (_) { return 0; }
  }
  function statusLabel(o) {
    if (o.status === 'pret') return ['Prêt', 'ready'];
    if (o.status === 'trait') return ['En traitement', ''];
    if (o.status === 'livre') return ['Retiré', 'muted'];
    var late = o.readyAt && new Date(o.readyAt).getTime() < Date.now();
    return late ? ['En retard', 'late'] : ['Reçu', ''];
  }
  function sortedActive(s) {
    return s.orders.filter(function (o) { return o.status !== 'livre'; }).sort(function (a,b) {
      var al = a.status !== 'pret' && a.readyAt && new Date(a.readyAt).getTime() < Date.now();
      var bl = b.status !== 'pret' && b.readyAt && new Date(b.readyAt).getTime() < Date.now();
      if (al !== bl) return al ? -1 : 1;
      return new Date(a.readyAt || 0) - new Date(b.readyAt || 0);
    });
  }

  function orderRows(rows, limit) {
    rows = rows.slice(0, limit || rows.length);
    if (!rows.length) return empty('list', 'Aucune commande à afficher', 'Les nouveaux dépôts apparaîtront ici dès qu’ils seront enregistrés sur la caisse.', 'Nouveau dépôt', 'comptoir');
    return '<div class="pxd-order-list">' + rows.map(function (o) {
      var st = statusLabel(o);
      return '<div class="pxd-order">' +
        '<div><span class="pxd-order-id">' + esc(o.id) + '</span><span class="pxd-order-time">' + esc(when(o.readyAt)) + '</span></div>' +
        '<div class="pxd-order-main"><b>' + esc((o.customer && o.customer.name) || 'Client de passage') + '</b><span>' + num((o.pieces || []).length) + ' pièce' + ((o.pieces || []).length === 1 ? '' : 's') + (o.rack ? ' · rack ' + esc(o.rack) : '') + (o.due ? ' · solde ' + num(o.due) + ' MAD' : '') + '</span></div>' +
        '<span class="pxd-status ' + st[1] + '">' + st[0] + '</span></div>';
    }).join('') + '</div>';
  }
  function empty(ic, title, body, cta, view) {
    return '<div class="pxd-empty"><div><span class="pxd-empty-icon">' + icon(ic) + '</span><b>' + esc(title) + '</b><p>' + esc(body) + '</p>' +
      (cta ? '<button class="pxd-btn" type="button" data-pxd-open="' + esc(view || 'comptoir') + '">' + esc(cta) + '</button>' : '') + '</div></div>';
  }
  function cardHead(ic, title, sub, link, page) {
    return '<div class="pxd-card-head"><div class="pxd-card-title"><span class="pxd-card-mark">' + icon(ic) + '</span><div><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div></div>' +
      (link ? '<button class="pxd-link" type="button" data-pxd-page="' + esc(page) + '">' + esc(link) + '</button>' : '') + '</div>';
  }
  function flow(s) {
    var stages = [
      ['Reçues', s.received, 'À trier et contrôler'],
      ['En traitement', s.treating, 'Nettoyage, lavage, finition'],
      ['Prêtes', s.ready, 'À ranger ou remettre'],
      ['Retirées', s.delivered, 'Historique synchronisé']
    ];
    var mx = Math.max.apply(Math, stages.map(function (x) { return x[1]; }).concat([1]));
    return '<div class="pxd-flow">' + stages.map(function (x) {
      return '<div class="pxd-stage"><div class="pxd-stage-num">' + num(x[1]) + '</div><div class="pxd-stage-name">' + x[0] + '</div><div class="pxd-stage-sub">' + x[2] + '</div><div class="pxd-stage-bar"><i style="width:' + Math.max(3, Math.round(x[1] / mx * 100)) + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function rackBody(s) {
    var ready = s.orders.filter(function (o) { return o.status === 'pret'; }).sort(function (a,b) { return new Date(a.readyAt || 0) - new Date(b.readyAt || 0); });
    if (!ready.length) return empty('rack', 'Rack disponible', 'Les commandes prêtes et leur emplacement apparaîtront ici.', 'Ouvrir le rangement', 'rangement');
    return '<div class="pxd-rack">' + ready.slice(0,5).map(function (o) {
      return '<div class="pxd-rack-row"><div><b>' + esc(o.customer && o.customer.name || o.id) + '</b><span>' + esc(o.id) + (o.notified ? ' · client prévenu' : ' · à prévenir') + '</span></div><span class="pxd-rack-slot">' + esc(o.rack || 'À ranger') + '</span></div>';
    }).join('') + '</div>' + (s.unnotified ? '<div class="pxd-callout"><b>' + num(s.unnotified) + ' client' + (s.unnotified > 1 ? 's' : '') + ' à prévenir</b><span>Ouvrez WhatsApp depuis la fiche de retrait pour envoyer le message “c’est prêt”.</span></div>' : '');
  }

  function renderHome() {
    if (!host || !current) return;
    var s = summary();
    var v = venue() || {};
    var active = sortedActive(s);
    host.innerHTML = '<div class="pxd-shell">' +
      '<header class="pxd-hero"><div><div class="pxd-eyebrow">Pilotage pressing</div><h1>Votre atelier, sans angle mort.</h1><p>' + esc(v.fullDisplay || v.name || 'Pressing') + ' · du dépôt au retrait, pièce par pièce</p></div>' +
      '<div class="pxd-hero-actions"><button class="pxd-btn" type="button" data-pxd-open="retrait">' + icon('scan') + 'Retrait express</button><button class="pxd-btn primary" type="button" data-pxd-open="comptoir">' + icon('play') + 'Nouveau dépôt</button></div></header>' +
      '<section class="pxd-kpis" aria-label="État de l’atelier">' +
        kpi('shirt','Pièces dans l’atelier',s.pieces,'Toutes les pièces non retirées','') +
        kpi('workflow','Commandes en traitement',s.treating,'Nettoyage et finition en cours','') +
        kpi('rack','Prêtes au retrait',s.ready,s.racks + ' rangée' + (s.racks === 1 ? '' : 's') + ' sur le rack','') +
        kpi('alert','À risque ou en retard',s.late,'Promesse dépassée, à traiter en priorité',s.late ? 'alert' : '') +
        kpi('money','Solde à encaisser',num(s.due) + ' MAD','CA encaissé aujourd’hui · ' + num(todayRevenue()) + ' MAD','') +
      '</section>' +
      '<div class="pxd-grid"><div class="pxd-stack">' +
        '<section class="pxd-card">' + cardHead('workflow','Flux atelier','La charge réelle à chaque étape','Ouvrir l’atelier','pressing-workshop') + flow(s) + '</section>' +
        '<section class="pxd-card">' + cardHead('clock','Priorités du jour','Échéances les plus proches et retards','Toutes les commandes','pressing-orders') + orderRows(active,6) + '</section>' +
      '</div><aside class="pxd-stack side">' +
        '<section class="pxd-card">' + cardHead('play','Actions rapides','Les gestes de comptoir les plus fréquents','','') +
          '<div class="pxd-action-grid">' + action('shirt','Nouveau dépôt','Créer le bon et étiqueter','comptoir') + action('scan','Retrait express','Téléphone ou scan du ticket','retrait') + action('rack','Ranger au rack','Attribuer un cintre','rangement') + action('bell','Clients à prévenir',s.unnotified ? num(s.unnotified) + ' message' + (s.unnotified > 1 ? 's' : '') + ' en attente' : 'Tout est à jour','retrait') + '</div></section>' +
        '<section class="pxd-card">' + cardHead('rack','Retraits & rack','Commandes prêtes, emplacement et notification','Gérer','pressing-pickup') + rackBody(s) + '</section>' +
        '<section class="pxd-card">' + cardHead('alert','Qualité & vigilance','Photos, textiles délicats et promesses','Contrôler','pressing-quality') +
          (s.attention ? '<div class="pxd-callout" style="margin-top:18px"><b>' + num(s.attention) + ' pièce' + (s.attention > 1 ? 's' : '') + ' documentée' + (s.attention > 1 ? 's' : '') + '</b><span>Les photos d’entrée restent liées au vêtement pour sécuriser la remise.</span></div>' : empty('check','Aucune vigilance ouverte','Les réserves, photos et reprises apparaîtront ici sans polluer le flux principal.','','')) + '</section>' +
      '</aside></div></div>';
  }
  function kpi(ic,label,value,sub,cls) {
    return '<article class="pxd-kpi ' + cls + '"><div class="pxd-kpi-top"><span>' + esc(label) + '</span><span class="pxd-kpi-icon">' + icon(ic) + '</span></div><strong>' + esc(value) + '</strong><small>' + esc(sub) + '</small></article>';
  }
  function action(ic,title,sub,view) {
    return '<button class="pxd-action" type="button" data-pxd-open="' + esc(view) + '">' + icon(ic) + '<b>' + esc(title) + '</b><span>' + esc(sub) + '</span></button>';
  }

  function pageBody(nav) {
    var s = summary();
    var active = sortedActive(s);
    if (nav === 'pressing-orders') return '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('list','Commandes actives','Triées par urgence et date de retrait','','') + orderRows(active) + '</section><section class="pxd-card">' + cardHead('check','Commandes retirées','Historique conservé pour le suivi client','','') + orderRows(s.orders.filter(function(o){return o.status==='livre';}),20) + '</section></div>';
    if (nav === 'pressing-workshop') return '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('workflow','Vue atelier','Une commande avance selon l’état réel de ses pièces','','') + flow(s) + '</section><section class="pxd-card">' + cardHead('clock','File de production','Retards en premier, puis promesses les plus proches','','') + orderRows(active) + '</section></div>';
    if (nav === 'pressing-pickup') return '<div class="pxd-page-grid two"><section class="pxd-card">' + cardHead('rack','Prêtes au retrait','Rack, notification et solde sur le même écran','','') + rackBody(s) + '</section><section class="pxd-page-card"><h3>Retrait en trois gestes</h3><p>Recherchez le téléphone, confirmez les pièces, encaissez le solde.</p><div class="pxd-checks"><div class="pxd-check"><span>1 · Identifier le client</span><small>Téléphone ou scan</small></div><div class="pxd-check"><span>2 · Vérifier les pièces</span><small>Bon détaillé</small></div><div class="pxd-check"><span>3 · Libérer le rack</span><small>Après remise</small></div></div><button class="pxd-btn primary" style="margin-top:14px" data-pxd-open="retrait">Ouvrir le retrait express</button></section></div>';
    if (nav === 'pressing-services') {
      var serviceLabels = { sec:'Nettoyage à sec', lavage:'Lavage', repassage:'Repassage', detachage:'Détachage', retouche:'Retouche' };
      var serviceRows = Object.keys(serviceLabels).map(function (id) {
        var count = num((s.services || {})[id] || 0);
        return '<div class="pxd-check"><span>' + serviceLabels[id] + '</span><small>' + count + ' pièce' + (count === '1' ? '' : 's') + ' active' + (count === '1' ? '' : 's') + '</small></div>';
      }).join('');
      return '<div class="pxd-page-grid"><div data-pce-host></div><div class="pxd-page-grid two"><section class="pxd-page-card"><h3>Charge par traitement</h3><p>Volumes réels des commandes encore présentes dans l’atelier.</p><div class="pxd-checks">' + serviceRows + '</div></section><section class="pxd-page-card"><h3>Application des tarifs</h3><p>Une modification s’applique aux prochains dépôts. Les anciens tickets gardent le nom et le prix convenus avec le client.</p><div class="pxd-checks"><div class="pxd-check"><span>Caisse appairée</span><small>Synchronisée par établissement</small></div><div class="pxd-check"><span>Article masqué</span><small>Conservé dans l’historique</small></div><div class="pxd-check"><span>Prix vide</span><small>Service non proposé</small></div></div><button class="pxd-btn primary" style="margin-top:14px" data-pxd-open="tarifs">Ouvrir les tarifs sur la caisse</button></section></div></div>';
    }
    if (nav === 'pressing-quality') {
      var attention = active.filter(function (o) { return (o.pieces || []).some(function (p) { return p.notes; }); });
      return '<div class="pxd-page-grid"><section class="pxd-card">' + cardHead('alert','Vigilances actives','Commandes avec photo, tache ou instruction particulière','','') + (attention.length ? orderRows(attention) + '<div class="pxd-page-action"><button class="pxd-btn primary" data-pxd-open="commandes">Ouvrir le contrôle atelier</button></div>' : empty('check','Aucune vigilance ouverte','Une tache, une photo ou une instruction saisie au comptoir apparaîtra ici.','Nouveau dépôt','comptoir')) + '</section><section class="pxd-page-card"><h3>Contrôle avant remise</h3><p>La commande ne devient prête qu’après vérification de toutes ses pièces.</p><div class="pxd-checks"><div class="pxd-check"><span>Commandes prêtes</span><small>' + num(s.ready) + '</small></div><div class="pxd-check"><span>Pièces documentées</span><small>' + num(s.attention) + '</small></div><div class="pxd-check"><span>Clients encore à prévenir</span><small>' + num(s.unnotified) + '</small></div></div></section></div>';
    }
    return '<div class="pxd-page-grid two"><section class="pxd-page-card"><h3>Collecte & livraison</h3><p>Cette caisse ne promet pas une tournée qu’elle ne sait pas encore exécuter.</p>' + empty('van','Aucune tournée active','Les dépôts et retraits restent au comptoir tant qu’un module de tournée n’est pas activé.','Créer un dépôt comptoir','comptoir') + '</section><section class="pxd-page-card"><h3>Commandes prêtes</h3><p>Utilisez le rack et la notification client pour organiser les retraits actuels.</p>' + rackBody(s) + '</section></div>';
  }

  function showPage(nav) {
    if (!current || !PAGE_LABELS[nav] || !window.Kiwi || !Kiwi.appPage) return;
    var meta = PAGE_LABELS[nav];
    currentPage = nav;
    Kiwi.appPage(nav, { title: meta[0], subtitle: meta[1], body: pageBody(nav) });
    if (nav === 'pressing-services') requestAnimationFrame(function () {
      var editor = document.querySelector('[data-pce-host]');
      if (editor && window.KiwiPressingCatalog) KiwiPressingCatalog.mountEditor(editor);
    });
  }
  function openTill(view) {
    try { sessionStorage.setItem('kiwiPressingStartView', view || 'comptoir'); } catch (_) {}
    window.location.href = 'kiwi-caisse.html';
  }
  function ensureHost() {
    if (host && host.isConnected) return host;
    var container = document.querySelector('.container');
    if (!container) return null;
    host = document.createElement('section');
    host.className = 'pressing-home';
    host.setAttribute('aria-label', 'Tableau de bord pressing');
    container.insertBefore(host, container.querySelector('.status-bar') || null);
    return host;
  }
  function activate() {
    current = isPressing();
    document.body.classList.remove('is-pressing');
    if (host) host.remove();
    host = null;
    try { if (current && window.KiwiPressingOps && KiwiPressingOps.bindCloud) KiwiPressingOps.bindCloud(); } catch (_) {}
    try { if (current && window.KiwiPressingCatalog && KiwiPressingCatalog.bind) KiwiPressingCatalog.bind(); } catch (_) {}
  }

  /* The shared dashboard registers its delegated sidebar listener during the
   * venues boot, before this module. Listen at window capture level so a
   * pressing destination is claimed before that generic handler can turn it
   * into a boutique starter page. */
  window.addEventListener('click', function (e) {
    var open = e.target.closest && e.target.closest('[data-pxd-open]');
    if (open) { e.preventDefault(); openTill(open.dataset.pxdOpen); return; }
    var page = e.target.closest && e.target.closest('[data-pxd-page]');
    if (page) { e.preventDefault(); showPage(page.dataset.pxdPage); return; }
    var nav = e.target.closest && e.target.closest('.sidebar nav a[data-nav]');
    if (!nav || !current) return;
    if (PAGE_LABELS[nav.dataset.nav]) {
      e.preventDefault(); e.stopImmediatePropagation(); showPage(nav.dataset.nav); return;
    }
  }, true);

  function boot() {
    activate();
    try { if (window.KiwiPressingOps && KiwiPressingOps.bindCloud) KiwiPressingOps.bindCloud(); } catch (_) {}
    try { if (window.KiwiPressingOps) KiwiPressingOps.subscribe(function () { if (currentPage) showPage(currentPage); }); } catch (_) {}
    try { if (window.KiwiPressingCatalog) KiwiPressingCatalog.subscribe(function () { if (currentPage === 'pressing-services') showPage(currentPage); }); } catch (_) {}
    try { KiwiVenue.subscribe(activate); } catch (_) {}
    window.addEventListener('kiwi:langchange', activate);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiPressingDashboard = { render: renderHome, showPage: showPage, isActive: function () { return current; } };
})();
