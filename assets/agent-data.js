/* Kiwi AI — les questions dont la réponse vit dans un AUTRE module.
 *
 * « Quel est mon produit le plus vendu ? » — l'assistant répondait « je
 * raisonne sur des totaux, pas par article », alors que la carte porte les
 * unités vendues et que le journal de caisse porte les lignes de ticket.
 * « Qui est mon meilleur client ? », « combien de points a Salma Bennani ? »,
 * « qui travaille aujourd'hui ? » : même chose, la donnée est là, à un module
 * de distance.
 *
 * Ce fichier est cette distance. Il ne calcule aucune simulation — ça reste le
 * travail d'agent.js — il LIT les magasins que le produit tient déjà :
 *
 *   KiwiSales          les ventes horodatées (et leurs lignes, si la caisse les envoie)
 *   kiwi:posDay:*      le journal de la caisse quand elle tourne dans ce navigateur
 *   KiwiMenu           la carte de démonstration, avec ses unités vendues
 *   KiwiMenuStore      la carte réelle du commerçant
 *   KiwiBoutiqueCatalog  le catalogue boutique, ses variantes et son stock
 *   KiwiClients        le carnet clients, ses points et ses segments
 *   KiwiTeam           l'équipe et ses horaires
 *
 * Règle unique, la même que partout ailleurs : ne jamais énoncer un chiffre
 * qu'on n'a pas. Chaque réponse dit d'où elle vient, et quand la donnée manque
 * elle dit précisément CE QUI manque plutôt que « je ne sais pas ».
 */
(function () {
  'use strict';

  var DAY = 864e5;
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var fmt = function (n) { return (window.KiwiNumber?.format(Math.round(n), {}) ?? Math.round(n).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})); };
  var fmtMad = function (n) { return fmt(n) + ' MAD'; };
  var norm = function (s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  };

  /* ═══════════ lecteurs de magasins — chacun à sécurité passive ═══════════ */
  function venueId() {
    try { return (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || null; } catch (_) { return null; }
  }
  function isRealVenue() {
    try {
      var KV = window.KiwiVenue;
      return !!(KV && KV.isCustom && KV.isCustom())
        || !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal());
    } catch (_) { return false; }
  }
  function salesRows() {
    try {
      var r = window.KiwiSales && window.KiwiSales.list ? window.KiwiSales.list(venueId()) : null;
      return Array.isArray(r) ? r : [];
    } catch (_) { return []; }
  }
  /* Le journal de la caisse, quand caisse et tableau de bord tournent dans le
   * même navigateur — le cas du commerçant à une seule machine.
   *
   * Ce journal est indexé par MÉTIER, pas par établissement, et la boucle
   * ci-dessous concaténait autrefois toutes les clés `kiwi:posDay:*` sans
   * regarder à qui elles appartenaient. Deux commerces servis depuis le même
   * navigateur se contaminaient : le classement des produits d'une boutique
   * comptait les ventes du restaurant d'à côté. Un chiffre faux qui a l'air
   * juste est pire qu'un refus — c'est sur celui-là qu'on rachète du stock.
   *
   * Chaque ligne porte donc son locataire (`m`, écrit par assets/pos-sale.js),
   * et ce navigateur tient la liste de ceux qu'il a vus encaisser. Un seul
   * locataire connu ⇒ rien ne peut être contaminé, tout est lu (y compris les
   * lignes antérieures à ce changement, qui ne portent pas de `m`). Deux ou
   * plus ⇒ on exige la correspondance exacte, et une ligne anonyme est écartée
   * plutôt que devinée. C'est le raisonnement de preSplitBucket() côté serveur :
   * on n'attribue que ce qui n'a qu'une origine possible. */
  function liveTenant() {
    try {
      if (window.KiwiLive && window.KiwiLive.merchant) return String(window.KiwiLive.merchant() || '');
    } catch (_) {}
    return '';
  }
  function knownTenants() {
    try {
      var a = JSON.parse(localStorage.getItem('kiwi:posTenants') || '[]');
      return Array.isArray(a) ? a : [];
    } catch (_) { return []; }
  }
  function tillRows() {
    var out = [];
    var me = liveTenant();
    var ambiguous = knownTenants().length > 1;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('kiwi:posDay:') !== 0) continue;
        var rows = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(rows)) continue;
        rows.forEach(function (r) {
          if (!r) return;
          if (!ambiguous) { out.push(r); return; }  /* une seule origine possible */
          if (me && String(r.m || '') === me) out.push(r);
        });
      }
    } catch (_) { return []; }
    return out;
  }
  function demoMenu() {
    try {
      var it = window.KiwiMenu && window.KiwiMenu.items ? window.KiwiMenu.items() : null;
      return Array.isArray(it) ? it : [];
    } catch (_) { return []; }
  }
  function carteItems() {
    try {
      var it = window.KiwiMenuStore && window.KiwiMenuStore.items ? window.KiwiMenuStore.items(venueId()) : null;
      return Array.isArray(it) ? it : [];
    } catch (_) { return []; }
  }
  function catalogProducts() {
    try {
      var C = window.KiwiBoutiqueCatalog;
      if (!C || !C.listProducts) return [];
      if (C.use && window.KiwiBoutiqueVenueKey) { var k = window.KiwiBoutiqueVenueKey(); if (k) C.use(k); }
      return C.listProducts() || [];
    } catch (_) { return []; }
  }
  function clientBook() {
    try {
      var K = window.KiwiClients;
      if (!K || !K.hasBook || !K.hasBook()) return [];
      return K.list() || [];
    } catch (_) { return []; }
  }
  function teamRoster() {
    try {
      var T = window.KiwiTeam;
      var r = T && T.roster ? T.roster() : null;
      return Array.isArray(r) ? r : [];
    } catch (_) { return []; }
  }

  /* ═══════════ textes — fr / en / ar ═══════════ */
  var T = {
    fr: {
      openBtn: function (x) { return 'Ouvrir ' + x; },
      pMenu: 'la carte', pClients: 'le carnet clients', pTeam: 'l’équipe', pStock: 'le stock',
      /* produits */
      prodTop: function (n, u) { return 'Votre meilleure vente, c’est <b>' + n + '</b> · ' + u + '.'; },
      prodBottom: function (n, u) { return 'Votre article le moins vendu, c’est <b>' + n + '</b> · ' + u + '.'; },
      /* La période nommée dans la phrase — seulement quand la source a su la lire. */
      prodTopP: function (n, u, p) { return 'Votre meilleure vente ' + p + ', c’est <b>' + n + '</b> · ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'Votre article le moins vendu ' + p + ', c’est <b>' + n + '</b> · ' + u + '.'; },
      prodNonePeriod: function (p) { return 'Aucune vente n’est enregistrée ' + p + ', je n’ai donc rien à classer sur cette période. Je ne vais pas vous donner le classement d’une autre journée en faisant comme si c’était celui-là.'; },
      prodPerTill: function (p) { return 'Vous me demandez ' + p + ', et je ne peux pas répondre honnêtement. Le détail par article ne me vient aujourd’hui que du journal de ma caisse, qui ne garde que la journée en cours · il est remis à zéro à minuit. Je sais classer vos articles d’aujourd’hui ; pour une journée passée, il me faudrait le détail des tickets côté serveur.'; },
      prodPerMenu: function (p) { return 'Une réserve : ce classement porte sur les unités du mois telles que votre carte les enregistre, pas sur ' + p + ' · la carte ne date pas ses ventes.'; },
      prodUnits: function (u) { return fmt(u) + ' unité' + (u > 1 ? 's' : ''); },
      prodLines: function (u) { return fmt(u) + ' ligne' + (u > 1 ? 's' : '') + ' de ticket'; },
      colUnits: 'Vendu', colRev: 'Chiffre', colPrice: 'Prix', colMargin: 'Marge unitaire',
      prodRunners: 'Puis, dans l’ordre',
      srcMenu: 'unités du mois, telles que votre carte les porte',
      srcTill: 'lignes de ticket de la journée, lues sur votre caisse',
      srcLines: 'lignes de vos ventes enregistrées',
      prodNoLines: 'Je ne peux pas classer vos articles, et je préfère vous dire exactement pourquoi : votre caisse m’envoie le montant du ticket et un libellé résumé, pas le détail ligne par ligne. Je vois donc ce que chaque vente a rapporté, jamais ce qu’elle contenait. Tant que la caisse et le tableau de bord tournent dans le même navigateur je lis le journal de la caisse · sinon, le détail par article reste dans la caisse elle-même.',
      prodNoCarte: 'Votre carte n’est pas encore saisie, je n’ai donc aucun article à classer. Ajoutez vos produits et leurs prix, et je vous dirai lequel travaille le mieux.',
      prodCarteOnly: function (n) { return 'Votre carte compte <b>' + n + ' article' + (n > 1 ? 's' : '') + '</b>, mais aucune vente n’y est encore rattachée ligne par ligne · je peux vous donner vos prix et vos marges théoriques, pas encore un classement des ventes.'; },
      /* clients */
      cliTop: function (n) { return '<b>' + n + '</b> est votre meilleur client, au montant dépensé.'; },
      cliSpend: 'Dépensé', cliVisits: 'Visites', cliPoints: 'Points', cliLast: 'Dernière venue',
      cliDaysAgo: function (d) { return d === 0 ? 'aujourd’hui' : d === 1 ? 'hier' : 'il y a ' + d + ' jours'; },
      cliRunners: 'Vos suivants',
      cliPerLifetime: function (p) { return 'Une précision : votre carnet retient le cumul de chaque client depuis toujours, pas le détail daté. Ce classement est donc celui de la dépense totale, et non celui de ' + p + '.'; },
      cliPointsOf: function (n, p) { return '<b>' + n + '</b> a <b>' + fmt(p) + ' point' + (p > 1 ? 's' : '') + '</b>.'; },
      cliReward: function (r) { return 'Récompense atteinte : il reste ' + r + ' à offrir.'; },
      cliToGo: function (n) { return 'Encore ' + fmt(n) + ' points avant la prochaine récompense.'; },
      cliToGoStamps: function (n) { return 'Encore ' + fmt(n) + ' passage' + (n > 1 ? 's' : '') + ' avant la prochaine récompense.'; },
      cliNoLoyalty: 'Aucun programme de fidélité n’est actif, les points ne comptent donc pas encore. Vous l’activez dans Clients.',
      cliUnknown: function (n) { return 'Je ne trouve personne au nom de « ' + n + ' » dans votre carnet. Vérifiez l’orthographe, ou ouvrez le carnet : je ne devine pas un client que la caisse n’a pas identifié.'; },
      cliWhich: 'De quel client parlez-vous ? Donnez-moi son nom et je vous sors ses points, ses visites et ce qu’il a dépensé.',
      cliNoBook: 'Votre carnet client n’est pas encore actif. Dès que vos clients sont identifiés en caisse (téléphone ou carte de fidélité), je peux vous dire qui revient, qui dépense le plus et combien de points chacun a.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + '</b> ne ' + (n > 1 ? 'sont' : 'est') + ' pas revenu' + (n > 1 ? 's' : '') + ' depuis plus de 30 jours.'; },
      cliDormantNone: 'Aucun client endormi : tous ceux que vous avez identifiés sont revenus dans les 30 derniers jours.',
      cliDormantNote: 'Rappeler un client qui vous connaît coûte bien moins cher que d’en trouver un nouveau.',
      /* équipe */
      staffCount: function (n) { return 'Votre équipe compte <b>' + fmt(n) + ' personne' + (n > 1 ? 's' : '') + '</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' personne' + (n > 1 ? 's' : '') + '</b> sur le service aujourd’hui.' : 'Personne n’est planifié aujourd’hui · ou les horaires du jour ne sont pas encore saisis.'; },
      staffNone: 'Votre équipe n’est pas encore saisie. Ajoutez vos salariés dans Équipe et je vous donne les effectifs, les rôles et qui est de service.',
      colRole: 'Rôles', colToday: 'Aujourd’hui',
      staffTop: 'Je ne peux pas désigner votre meilleur vendeur : aucune vente qui arrive sur cet écran ne porte qui l’a encaissée. Vous pouvez l’obtenir, en revanche · donnez à chaque salarié son propre code en caisse, et Transactions répartit alors le chiffre par personne. En attendant, voici votre équipe telle qu’elle est saisie.',
      /* stock */
      stkOut: function (n) { return '<b>' + fmt(n) + ' référence' + (n > 1 ? 's sont' : ' est') + ' en rupture</b>.'; },
      stkNone: 'Aucune rupture : tout ce que vous suivez est en stock.',
      stkLow: 'Sous le seuil', stkOutCol: 'En rupture',
      stkNoCatalog: 'Je n’ai pas encore de catalogue pour votre établissement. Saisissez vos articles et vos quantités dans Stock, et je vous donne les ruptures, les stocks bas et la valeur immobilisée.',
      andMore: function (n) { return '+ ' + n + ' autre' + (n > 1 ? 's' : ''); },
      pHours: 'les horaires',
      hrUnset: 'Vos horaires d’ouverture ne sont pas renseignés, et je ne vais pas les deviner : un horaire inventé, sur l’air de « un restaurant, ça ferme sûrement en soirée », se retrouverait dans vos réservations et vos commandes en ligne. Renseignez votre semaine dans Réglages → Heures d’ouverture, et je réponds ensuite sur l’ouverture, la fermeture et les créneaux réservables.',
      hrOpen: function (h) { return 'Oui, vous êtes <b>ouvert</b> · jusqu’à <b>' + h + '</b>.'; },
      hrOpen24: 'Oui, vous êtes <b>ouvert</b> · 24 h/24 aujourd’hui.',
      hrShut: function (s) { return 'Non, vous êtes <b>fermé</b> en ce moment. ' + s + '.'; },
      hrCloseAt: function (h) { return 'Vous fermez à <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'Vous êtes fermé en ce moment. La prochaine fermeture est ' + String(d).toLowerCase() + ' à <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? 'Il reste <b>' + Math.floor(n / 60) + ' h ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> avant la fermeture.' : 'Il reste <b>' + n + ' min</b> avant la fermeture.'; },
      hrUntilShut: 'Vous êtes déjà fermé, il n’y a pas de compte à rebours.',
      hrAtOk: function (d, h) { return 'Oui · ' + d + ' à ' + h + ', vous êtes ouvert.'; },
      hrAtNo: function (d, h, s) { return 'Non · ' + d + ' à ' + h + ', vous êtes fermé. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b> : ' + r + (p ? ' · ' + p : ' · fermé'); },
      hrExcNone: 'Aucune période exceptionnelle n’est enregistrée · ni Ramadan, ni Aïd, ni congés. Votre semaine type s’applique toute l’année. Vous en ajoutez une dans Réglages → Heures d’ouverture.',
      hrWeekCol: 'Semaine', hrTodayCol: 'Aujourd’hui', hrNextCol: 'Prochaine ouverture',
      hrSrc: 'horaires de l’établissement',
    },
    en: {
      openBtn: function (x) { return 'Open ' + x; },
      pMenu: 'the menu', pClients: 'the client book', pTeam: 'the team', pStock: 'stock',
      prodTop: function (n, u) { return 'Your best seller is <b>' + n + '</b> · ' + u + '.'; },
      prodBottom: function (n, u) { return 'Your slowest item is <b>' + n + '</b> · ' + u + '.'; },
      prodTopP: function (n, u, p) { return 'Your best seller ' + p + ' is <b>' + n + '</b> · ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'Your slowest item ' + p + ' is <b>' + n + '</b> · ' + u + '.'; },
      prodNonePeriod: function (p) { return 'No sale is recorded for ' + p + ', so there is nothing to rank over that period. I am not going to hand you another day’s ranking and let it pass for this one.'; },
      prodPerTill: function (p) { return 'You are asking about ' + p + ', and I cannot answer that honestly. Item-level detail reaches me only through my till journal, which keeps the current day and is cleared at midnight. I can rank today’s items; for a past day I would need the ticket lines from the server.'; },
      prodPerMenu: function (p) { return 'One caveat: this ranking is the month’s units as your menu records them, not ' + p + ' · the menu does not date its sales.'; },
      prodUnits: function (u) { return fmt(u) + ' unit' + (u > 1 ? 's' : ''); },
      prodLines: function (u) { return fmt(u) + ' ticket line' + (u > 1 ? 's' : ''); },
      colUnits: 'Sold', colRev: 'Revenue', colPrice: 'Price', colMargin: 'Unit margin',
      prodRunners: 'Then, in order',
      srcMenu: 'units this month, as your menu holds them',
      srcTill: 'today’s ticket lines, read from your till',
      srcLines: 'lines from your recorded sales',
      prodNoLines: 'I can’t rank your items, and I’d rather tell you exactly why: your till sends me the ticket total and a summary label, not the line-by-line detail. So I see what each sale earned, never what it contained. While the till and the dashboard run in the same browser I read the till’s own journal · otherwise the per-item detail stays inside the till.',
      prodNoCarte: 'Your menu isn’t entered yet, so I have no items to rank. Add your products and their prices and I’ll tell you which one works hardest.',
      prodCarteOnly: function (n) { return 'Your menu holds <b>' + n + ' item' + (n > 1 ? 's' : '') + '</b>, but no sale is attached to them line by line yet · I can give you prices and theoretical margins, not a sales ranking.'; },
      cliTop: function (n) { return '<b>' + n + '</b> is your best client, by amount spent.'; },
      cliSpend: 'Spent', cliVisits: 'Visits', cliPoints: 'Points', cliLast: 'Last seen',
      cliDaysAgo: function (d) { return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; },
      cliRunners: 'Next up',
      cliPerLifetime: function (p) { return 'One precision: your book keeps each client’s lifetime total, not a dated history. So this ranking is total spend, not ' + p + '.'; },
      cliPointsOf: function (n, p) { return '<b>' + n + '</b> has <b>' + fmt(p) + ' point' + (p > 1 ? 's' : '') + '</b>.'; },
      cliReward: function (r) { return 'Reward reached: ' + r + ' is owed.'; },
      cliToGo: function (n) { return fmt(n) + ' more points before the next reward.'; },
      cliToGoStamps: function (n) { return fmt(n) + ' more visit' + (n === 1 ? '' : 's') + ' before the next reward.'; },
      cliNoLoyalty: 'No loyalty programme is active, so points aren’t counting yet. You turn it on in Customers.',
      cliUnknown: function (n) { return 'I can’t find anyone called “' + n + '” in your book. Check the spelling, or open the book: I won’t guess at a client the till never identified.'; },
      cliWhich: 'Which client do you mean? Give me the name and I’ll pull their points, visits and spend.',
      cliNoBook: 'Your client book isn’t active yet. Once clients are identified at the till (phone or loyalty card), I can tell you who comes back, who spends most and how many points each one has.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + '</b> ha' + (n > 1 ? 've' : 's') + ' not been back in over 30 days.'; },
      cliDormantNone: 'No dormant clients: everyone you’ve identified has been back within 30 days.',
      cliDormantNote: 'Waking a client who already knows you costs far less than finding a new one.',
      staffCount: function (n) { return 'Your team has <b>' + fmt(n) + ' member' + (n > 1 ? 's' : '') + '</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' ' + (n > 1 ? 'people' : 'person') + '</b> on shift today.' : 'Nobody is scheduled today · or today’s hours aren’t entered yet.'; },
      staffNone: 'Your team isn’t entered yet. Add your staff under Team and I’ll give you headcount, roles and who is on shift.',
      colRole: 'Roles', colToday: 'Today',
      staffTop: 'I can’t name your best seller: no sale reaching this screen carries who rang it up. You can get it though · give each employee their own till code, and Transactions then splits revenue by person. Meanwhile, here is your team as entered.',
      stkOut: function (n) { return '<b>' + fmt(n) + ' item' + (n > 1 ? 's are' : ' is') + ' out of stock</b>.'; },
      stkNone: 'No stock-outs: everything you track is in stock.',
      stkLow: 'Below reorder', stkOutCol: 'Out of stock',
      stkNoCatalog: 'I have no catalogue for your venue yet. Enter your items and quantities under Stock and I’ll give you stock-outs, low stock and tied-up value.',
      andMore: function (n) { return '+ ' + n + ' more'; },
      pHours: 'opening hours',
      hrUnset: 'Your opening hours aren’t set, and I’m not going to guess them: hours invented on the theory that “a restaurant probably closes in the evening” would end up in your bookings and your online orders. Fill in your week under Settings → Opening hours, and I’ll answer on opening, closing and bookable slots after that.',
      hrOpen: function (h) { return 'Yes, you are <b>open</b> · until <b>' + h + '</b>.'; },
      hrOpen24: 'Yes, you are <b>open</b> · 24 hours today.',
      hrShut: function (s) { return 'No, you are <b>closed</b> right now. ' + s + '.'; },
      hrCloseAt: function (h) { return 'You close at <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'You are closed right now. The next closing is ' + d + ' at <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? '<b>' + Math.floor(n / 60) + 'h ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> left before closing.' : '<b>' + n + ' min</b> left before closing.'; },
      hrUntilShut: 'You are already closed · there is no countdown.',
      hrAtOk: function (d, h) { return 'Yes · ' + d + ' at ' + h + ', you are open.'; },
      hrAtNo: function (d, h, s) { return 'No · ' + d + ' at ' + h + ', you are closed. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b>: ' + r + (p ? ' · ' + p : ' · closed'); },
      hrExcNone: 'No exceptional period is on file · no Ramadan, no Eid, no leave. Your weekly schedule applies all year. You add one under Settings → Opening hours.',
      hrWeekCol: 'Week', hrTodayCol: 'Today', hrNextCol: 'Next opening',
      hrSrc: 'business opening hours',
    },
    ar: {
      openBtn: function (x) { return 'افتح ' + x; },
      pMenu: 'القائمة', pClients: 'سجلّ الزبناء', pTeam: 'الفريق', pStock: 'المخزون',
      prodTop: function (n, u) { return 'أكثر ما تبيعه هو <b>' + n + '</b> · ' + u + '.'; },
      prodBottom: function (n, u) { return 'أقل ما تبيعه هو <b>' + n + '</b> · ' + u + '.'; },
      prodTopP: function (n, u, p) { return 'أكثر ما تبيعه ' + p + ' هو <b>' + n + '</b> · ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'أقل ما تبيعه ' + p + ' هو <b>' + n + '</b> · ' + u + '.'; },
      prodNonePeriod: function (p) { return 'لا توجد أي مبيعة مسجّلة ' + p + '، فلا شيء أرتّبه في هذه الفترة. ولن أعطيك ترتيب يوم آخر وكأنه ترتيب هذا اليوم.'; },
      prodPerTill: function (p) { return 'تسألني عن ' + p + '، ولا أستطيع الجواب بأمانة. تفصيل الأصناف لا يصلني اليوم إلا من سجلّ الصندوق، وهو لا يحتفظ إلا باليوم الجاري ويُمسح عند منتصف الليل. أستطيع ترتيب أصناف اليوم؛ أما يوم مضى فأحتاج تفاصيل التذاكر من الخادم.'; },
      prodPerMenu: function (p) { return 'تحفّظ واحد: هذا الترتيب يخصّ وحدات الشهر كما تسجّلها لائحتك، لا ' + p + ' · اللائحة لا تؤرّخ مبيعاتها.'; },
      prodUnits: function (u) { return fmt(u) + ' وحدة'; },
      prodLines: function (u) { return fmt(u) + ' سطر بيع'; },
      colUnits: 'المُباع', colRev: 'المداخيل', colPrice: 'الثمن', colMargin: 'هامش الوحدة',
      prodRunners: 'ثم بالترتيب',
      srcMenu: 'وحدات الشهر كما تحملها قائمتك',
      srcTill: 'أسطر تذاكر اليوم، مقروءة من صندوقك',
      srcLines: 'أسطر مبيعاتك المسجّلة',
      prodNoLines: 'لا أستطيع ترتيب أصنافك، وأفضّل أن أقول لك السبب بدقّة: صندوقك يرسل لي مجموع التذكرة وعنواناً مختصراً، لا التفصيل سطراً سطراً. فأنا أرى ما جنته كل عملية بيع، لا ما احتوته. وما دام الصندوق ولوحة القيادة يشتغلان في نفس المتصفّح أقرأ سجلّ الصندوق · وإلا بقي التفصيل داخل الصندوق نفسه.',
      prodNoCarte: 'قائمتك غير مُدخلة بعد، فلا أصناف لأرتّبها. أضف منتجاتك وأثمانها وسأقول لك أيّها يشتغل أكثر.',
      prodCarteOnly: function (n) { return 'قائمتك تضمّ <b>' + n + ' صنفاً</b>، لكن لا عملية بيع مرتبطة بها سطراً سطراً بعد · أعطيك الأثمان والهوامش النظرية، لا ترتيب المبيعات.'; },
      cliTop: function (n) { return '<b>' + n + '</b> هو أفضل زبون لديك، من حيث ما أنفقه.'; },
      cliSpend: 'أنفق', cliVisits: 'الزيارات', cliPoints: 'النقاط', cliLast: 'آخر زيارة',
      cliDaysAgo: function (d) { return d === 0 ? 'اليوم' : d === 1 ? 'أمس' : 'قبل ' + d + ' يوماً'; },
      cliRunners: 'ثم يليه',
      cliPerLifetime: function (p) { return 'توضيح: دفترك يحتفظ بمجموع كل زبون منذ البداية، لا بسجلّ مؤرَّخ. فهذا الترتيب هو ترتيب الإنفاق الإجمالي، لا ترتيب ' + p + '.'; },
      cliPointsOf: function (n, p) { return 'لدى <b>' + n + '</b> <b>' + fmt(p) + ' نقطة</b>.'; },
      cliReward: function (r) { return 'بلغ المكافأة: ' + r + ' مستحقّة.'; },
      cliToGo: function (n) { return 'بقيت ' + fmt(n) + ' نقطة قبل المكافأة التالية.'; },
      cliToGoStamps: function (n) { return 'بقيت ' + fmt(n) + ' زيارة قبل المكافأة التالية.'; },
      cliNoLoyalty: 'لا برنامج وفاء مفعّل، فالنقاط لا تُحتسب بعد. تفعّله من العملاء.',
      cliUnknown: function (n) { return 'لا أجد أحداً باسم «' + n + '» في سجلّك. تحقّق من الكتابة أو افتح السجلّ: لا أخمّن زبوناً لم يعرّفه الصندوق.'; },
      cliWhich: 'عن أي زبون تتحدّث؟ أعطني اسمه وأخرج لك نقاطه وزياراته وما أنفقه.',
      cliNoBook: 'سجلّ زبنائك غير مفعّل بعد. بمجرد تعريف الزبناء في الصندوق (هاتف أو بطاقة وفاء)، أقول لك من يعود ومن ينفق أكثر وكم نقطة لكل واحد.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' زبوناً</b> لم يعد منذ أكثر من 30 يوماً.'; },
      cliDormantNone: 'لا زبون نائم: كل من عرّفته عاد خلال 30 يوماً.',
      cliDormantNote: 'إيقاظ زبون يعرفك أرخص بكثير من إيجاد زبون جديد.',
      staffCount: function (n) { return 'فريقك يضمّ <b>' + fmt(n) + ' شخصاً</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' أشخاص</b> في الخدمة اليوم.' : 'لا أحد مبرمج اليوم · أو أن توقيت اليوم غير مُدخل بعد.'; },
      staffNone: 'فريقك غير مُدخل بعد. أضف مستخدميك في «الفريق» وأعطيك العدد والأدوار ومن هو في الخدمة.',
      colRole: 'الأدوار', colToday: 'اليوم',
      staffTop: 'لا أستطيع تسمية أفضل بائع لديك: لا عملية بيع تصل هذه الشاشة تحمل من قام بها. لكن يمكنك الحصول على ذلك · امنح كل مستخدم رمزه الخاص في الصندوق، عندها توزّع صفحة «الطلبات» الرقم على الأشخاص. في انتظار ذلك، هذا فريقك كما هو مُدخل.',
      stkOut: function (n) { return '<b>' + fmt(n) + ' صنفاً في النفاد</b>.'; },
      stkNone: 'لا نفاد: كل ما تتابعه متوفّر.',
      stkLow: 'تحت العتبة', stkOutCol: 'نافد',
      stkNoCatalog: 'ليس لديّ كتالوج لمحلّك بعد. أدخل أصنافك وكمياتك في «المخزون» وأعطيك النفاد والمخزون المنخفض والقيمة المجمّدة.',
      andMore: function (n) { return '+ ' + n + ' آخر'; },
      pHours: 'ساعات العمل',
      hrUnset: 'ساعات عملك غير مُدخلة، ولن أخمّنها: توقيت مُختلق لمطعم «يغلق غالبًا نحو الحادية عشرة» سينتهي به الأمر في حجوزاتك وطلباتك على الإنترنت. أدخل أسبوعك في الإعدادات ← ساعات العمل، وبعدها أجيبك عن الفتح والإغلاق والمواعيد المتاحة.',
      hrOpen: function (h) { return 'نعم، أنت <b>مفتوح</b> · حتى <b>' + h + '</b>.'; },
      hrOpen24: 'نعم، أنت <b>مفتوح</b> · 24 ساعة اليوم.',
      hrShut: function (s) { return 'لا، أنت <b>مغلق</b> الآن. ' + s + '.'; },
      hrCloseAt: function (h) { return 'تغلق في <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'أنت مغلق الآن. الإغلاق القادم ' + d + ' في <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? 'بقيت <b>' + Math.floor(n / 60) + ' س ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> قبل الإغلاق.' : 'بقيت <b>' + n + ' د</b> قبل الإغلاق.'; },
      hrUntilShut: 'أنت مغلق أصلًا، فلا عدّ تنازلي.',
      hrAtOk: function (d, h) { return 'نعم · ' + d + ' في ' + h + '، أنت مفتوح.'; },
      hrAtNo: function (d, h, s) { return 'لا · ' + d + ' في ' + h + '، أنت مغلق. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b>: ' + r + (p ? ' · ' + p : ' · مغلق'); },
      hrExcNone: 'لا فترة استثنائية مسجّلة · لا رمضان ولا عيد ولا عطلة. أسبوعك المعتاد يسري طوال السنة. تضيف واحدة من الإعدادات ← ساعات العمل.',
      hrWeekCol: 'الأسبوع', hrTodayCol: 'اليوم', hrNextCol: 'الفتح القادم',
      hrSrc: 'ساعات عمل المؤسسة',
    },
  };
  var tr = function (L) { return T[L] || T.fr; };
  var open1 = function (L, key, handler) {
    var t = tr(L);
    return [{ label: t.openBtn(t[key]), handler: handler }];
  };

  /* ═══════════ produits — l'échelle des sources, de la plus vraie à la moins ═══════════
   * 1. les lignes portées par les ventes enregistrées (si le pont les transmet un jour)
   * 2. le journal de la caisse, dans ce navigateur
   * 3. la carte de démonstration et ses unités
   * Aucune des trois ⇒ on dit ce qui manque, on n'invente pas un classement.
   *
   * LA PÉRIODE. « Mon meilleur produit hier » arrive ici avec sa fenêtre, et
   * les trois sources ne savent pas la lire de la même façon :
   *   · les ventes enregistrées sont datées ⇒ la fenêtre s'applique vraiment ;
   *   · le journal de caisse ne garde QUE la journée en cours (pos-sale.js le
   *     purge à la bascule) ⇒ il sait dire « aujourd'hui » et rien d'autre ;
   *   · la carte de démonstration ne date pas ses unités ⇒ mois figé.
   * Une source qui ne sait pas honorer la fenêtre le déclare (`honoured:false`)
   * plutôt que de servir la journée d'aujourd'hui sous l'étiquette d'hier. */
  /* La MÊME borne que celle qui purge le journal (pos-sale.js) et que celle du
     rapport Z : la journée commerciale. Lire le journal sur minuit alors qu'il
     se vide sur la bascule ouvrait une fenêtre où l'assistant ratait les ventes
     de fin de nuit — présentes dans le journal, hors de la fenêtre lue — et
     répondait « rien vendu aujourd'hui » à un comptoir qui encaissait. */
  function startOfDay() {
    try {
      var R = window.KiwiDayReport;
      if (R && R.dayBounds && R.today) {
        var b = R.dayBounds(R.today());
        if (b && isFinite(b.from)) return b.from;
      }
    } catch (_) {}
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  function inWin(ts, p) { return !p || (ts >= p.from && ts < p.to); }

  function productRanking(period) {
    var by = {}, n = 0;
    var add = function (name, qty, total) {
      var k = norm(name);
      if (!k) return;
      if (!by[k]) { by[k] = { name: String(name), units: 0, revenue: 0 }; }
      by[k].units += qty; by[k].revenue += total; n++;
    };
    var eat = function (e) {
      e.lines.forEach(function (l) { add(l && l.name, +(l && l.qty) || 1, +(l && l.total) || 0); });
    };

    var sales = salesRows();
    var anyLines = false, winTotal = 0, winLined = 0;
    sales.forEach(function (e) {
      if (!e) return;
      var lined = Array.isArray(e.lines) && e.lines.length > 0;
      if (lined) anyLines = true;
      if (!inWin(+e.ts || 0, period)) return;
      winTotal++;
      if (!lined) return;
      winLined++; eat(e);
    });
    if (n) return { src: 'lines', rows: rank(by), prov: { mod: 'sales', count: winLined, total: winTotal, honoured: true } };
    /* Des ventes détaillées existent, mais aucune dans la fenêtre demandée.
       C'est une réponse — « rien vendu hier » — et non une absence de source :
       retomber sur le journal de la caisse répondrait « hier » avec la journée
       d'aujourd'hui, ce qui est exactement le chiffre faux qu'on évite. */
    if (anyLines && period) return { src: 'lines', rows: [], prov: { mod: 'sales', count: 0, total: winTotal, honoured: true } };

    var till = (isRealVenue() ? tillRows() : []).filter(function (r) {
      return r && inWin(+r.ts || 0, { from: startOfDay(), to: startOfDay() + DAY });
    });
    if (till.length) {
      if (!period || period.id === 'today') {
        var lined = 0;
        till.forEach(function (e) { if (Array.isArray(e.lines) && e.lines.length) { lined++; eat(e); } });
        if (n) return { src: 'till', rows: rank(by), prov: { mod: 'till', count: lined, total: till.length, honoured: true } };
      } else {
        return { src: 'till', rows: [], prov: { mod: 'till', count: till.length, total: till.length, honoured: false, limit: 'till' } };
      }
    }

    if (!isRealVenue()) {
      var menu = demoMenu().filter(function (i) { return i && +i.units > 0; });
      if (menu.length) {
        return {
          src: 'menu',
          rows: menu.map(function (i) {
            return { name: i.name, units: +i.units, revenue: +i.units * (+i.price || 0), price: +i.price || 0, cost: +i.cost || 0 };
          }).sort(function (a, b) { return b.units - a.units; }),
          prov: { mod: 'menu', count: menu.length, unit: 'entries', honoured: !period, limit: period ? 'menu' : null },
        };
      }
    }
    return null;
  }
  function rank(by) {
    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) { return b.units - a.units; });
  }

  function sProduct(spec, L) {
    var t = tr(L);
    var per = spec && spec.period;
    var perName = (spec && spec.periodLabel) || '';
    var r = productRanking(per);
    if (!r) {
      var carte = carteItems().length || catalogProducts().length;
      if (!carte) return { text: t.prodNoCarte, open: open1(L, 'pMenu', 'nav-menu') };
      /* La carte existe, les ventes ne portent pas le détail : dire laquelle
       * des deux manque, pas un « je ne sais pas » indifférencié. */
      return { text: t.prodCarteOnly(carte), note: t.prodNoLines, open: open1(L, 'pMenu', 'nav-menu') };
    }
    var rows = r.rows;
    if (!rows.length) {
      /* La source sait lire la fenêtre demandée : elle est simplement vide.
         Le dire avec la période nommée — « rien vendu hier » est une réponse. */
      if (per && r.prov && r.prov.honoured) {
        return { text: t.prodNonePeriod(perName), prov: r.prov, open: open1(L, 'pMenu', 'nav-menu') };
      }
      /* La source ne sait pas remonter jusque-là. On ne substitue pas une
         autre fenêtre en silence : c'est le classement d'aujourd'hui présenté
         comme celui d'hier que l'audit a trouvé, et il vaut un refus net. */
      if (per && r.prov && r.prov.limit === 'till') {
        return { text: t.prodPerTill(perName), prov: r.prov, open: open1(L, 'pMenu', 'nav-menu') };
      }
      return { text: t.prodNoCarte, open: open1(L, 'pMenu', 'nav-menu') };
    }
    var bottom = spec.agg === 'bottom';
    var pick = bottom ? rows[rows.length - 1] : rows[0];
    var unitTxt = t.prodUnits(pick.units);
    var stats = [
      { l: t.colUnits, v: fmt(pick.units), h: r.src === 'menu' ? t.srcMenu : r.src === 'till' ? t.srcTill : t.srcLines },
      { l: t.colRev, v: fmtMad(pick.revenue), h: '' },
    ];
    if (pick.price) stats.push({ l: t.colPrice, v: fmtMad(pick.price), h: '' });
    if (pick.price && pick.cost) stats.push({ l: t.colMargin, v: fmtMad(pick.price - pick.cost), h: '' });
    var others = (bottom ? rows.slice(0, -1).reverse() : rows.slice(1)).slice(0, 3);
    if (others.length) {
      stats.push({
        l: t.prodRunners,
        v: others.map(function (o) { return esc(o.name); }).join(' · '),
        h: others.map(function (o) { return fmt(o.units); }).join(' · '),
      });
    }
    var honoured = !per || !r.prov || r.prov.honoured !== false;
    var out = {
      /* La période n'entre dans la PHRASE que si la source a su la lire.
         Sinon on répond sans l'annoncer, et la réserve dit sur quoi porte
         réellement le classement. */
      text: honoured && per
        ? (bottom ? t.prodBottomP : t.prodTopP)(esc(pick.name), unitTxt, perName)
        : (bottom ? t.prodBottom : t.prodTop)(esc(pick.name), unitTxt),
      stats: stats,
      prov: r.prov,
      open: open1(L, 'pMenu', 'nav-menu'),
    };
    if (!honoured && r.prov && r.prov.limit === 'menu') out.note = t.prodPerMenu(perName);
    return out;
  }

  /* ═══════════ clients ═══════════ */
  function daysSince(ts) { return ts ? Math.max(0, Math.floor((Date.now() - ts) / DAY)) : null; }

  /* « سلمى بناني » for the Salma Bennani of the book: the owner types Arabic,
   * the till typed Latin. Both sides go down to a consonant skeleton (vowels,
   * w, y, h, ع dropped; ch/sh/ش → s; kh/خ/q/ق → k; doubles folded) and a name
   * matches when every part of it does. */
  var AR_LAT = { 'ب': 'b', 'ت': 't', 'ث': 't', 'ج': 'j', 'خ': 'k', 'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 's', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'd', 'غ': 'g', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n' };
  function skel(w) {
    w = String(w || '');
    if (/[\u0600-\u06ff]/.test(w)) {
      w = w.split('').map(function (c) { return AR_LAT[c] || ''; }).join('');
    } else {
      w = norm(w).replace(/dj/g, 'j').replace(/[cs]h/g, 's').replace(/kh|q|ck/g, 'k').replace(/gh/g, 'g').replace(/th/g, 't')
        .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/x/g, 'ks').replace(/[^a-z]/g, '').replace(/[aeiouywh]/g, '');
    }
    return w.replace(/(.)\1+/g, '$1');
  }
  function skelHit(book, q) {
    if (!/[\u0600-\u06ff]/.test(q)) return null;
    var words = [];
    /* « لسلمى », « بسلمى », « السلمي »: a clitic may lead the word, or be its first letter. */
    String(q).split(/[\s،,.?!؟]+/).forEach(function (w) {
      words.push(skel(w));
      var bare = w.replace(/^(?:ال|لل|ل|ب)(?=.{3})/, '');
      if (bare !== w) words.push(skel(bare));
    });
    var best = null;
    book.forEach(function (c) {
      var parts = norm(c.name).split(' ').map(skel).filter(function (x) { return x.length >= 2; });
      if (!parts.length || parts.join('').length < 4) return;
      if (parts.every(function (p) { return words.indexOf(p) >= 0; }) && (!best || parts.length > best.n)) best = { c: c, n: parts.length };
    });
    if (best) return best.c;
    /* One name alone (« سلمى », « لبناني ») when a single client carries it,
     * and no foreign name-like word stands next to it (« أحمد بناني »). */
    var raw = String(q).split(/[\s،,.?!؟]+/).filter(Boolean);
    var hits = [];
    book.forEach(function (c) {
      norm(c.name).split(' ').map(skel).filter(function (x) { return x.length >= 2; }).forEach(function (p) {
        raw.forEach(function (w, i) {
          var bare = w.replace(/^(?:ال|لل|ل|ب)(?=.{3})/, '');
          if (!/[\u0600-\u06ff]/.test(w) || bare.length < 4 || (skel(w) !== p && skel(bare) !== p)) return;
          var near = [raw[i - 1], raw[i + 1]].filter(function (x) {
            return x && x.length >= 3 && /[\u0600-\u06ff]/.test(x) && !NAME_GLUE_AR.test(arBare(x));
          });
          if (!near.length && hits.indexOf(c) < 0) hits.push(c);
        });
      });
    });
    return hits.length === 1 ? hits[0] : null;
  }
  var arBare = function (x) { return String(x).normalize('NFD').replace(/[\u064b-\u0655\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/[؟?]/g, ''); };
  var NAME_GLUE_AR = /^(?:متي|كيف|اتواصل|زار|جاءت|جات|جا|اخر|مرة|اخر|رقم|هاتف|الهاتف|نمرة|شنو|ديال|بيانات|التواصل|معلومات|الاتصال|دازت|فوقاش|زيارة|تاريخ|شحال|هادي|ما|للمحل|المحل|ب|كيفاش|نتاصل|اتواصل|كيف|مع|الخاصة|ب?سلمى)$/;
  var NAME_GLUE = /^(?:des?|du|la|le|les|pour|par|chez|avec|client\w*|madame|mme|monsieur|mr|mlle|sidi|lalla|points?|pts|stamps?|tampons?|fidelite|solde|combien|cb|has|have|does|for|of|the|customer|how|many|much|what|is|a|3nd|3and|dyal|dial|ch7al|chhal|kam|wach|f|fi|balance|rewards?|visite\w*|visits?|depense\w*|spent|ses|son|sa|il|elle|has|est|y|t|kaml?a?|3ndha|3ndo|bezaf|kter|dans|en|au|aux|ont|a-t-elle|a-t-il|when|was|were|did|last|here|date|came|come|in|phone|number|contact|email|can|i|with|whats|what's|s|akher|akhir|merra|mra|dazat|daz|jat|ja|imta|fo9ach|telephone|nemro|nemra|numero|chno|achno|quand|derniere|fois|venue?|passee?|tel|appeler|joindre|ntasel|b|l|ma|hadi|lma7al|ch7al)$/;
  function findClient(q) {
    var book = clientBook();
    if (!book.length) return { book: book, hit: null };
    /* « Bennani? », « Salma's »: punctuation is not part of the name. */
    var nq = ' ' + norm(q).replace(/[?؟!.,;:'’"()]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    var best = null;
    book.forEach(function (c) {
      var full = norm(c.name);
      if (!full) return;
      if (full.length >= 4 && nq.indexOf(full) !== -1) { if (!best || full.length > norm(best.name).length) best = c; return; }
      var parts = full.split(' ');
      parts.forEach(function (part) {
        var at = nq.indexOf(' ' + part + ' ');
        if (part.length < 4 || at === -1 || best) return;
        /* « Ahmed Bennani » is not Salma Bennani: a name-like word right
         * before or after the matched part, foreign to this client, is a
         * different person. Grammar words around a name don't count. */
        var words = nq.trim().split(' '), i = words.indexOf(part);
        var near = [words[i - 1], words[i + 1]].filter(function (w) {
          return w && w.length >= 3 && parts.indexOf(w) === -1 && !NAME_GLUE.test(w) && !NAME_GLUE_AR.test(w);
        });
        if (!near.length) best = c;
      });
    });
    return { book: book, hit: best || skelHit(book, q) };
  }

  function sClientTop(spec, L) {
    var t = tr(L);
    var book = clientBook();
    if (!book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    var sorted = book.slice().sort(function (a, b) { return (+b.spend || 0) - (+a.spend || 0); });
    var c = sorted[0];
    if (!(+c.spend > 0)) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    var d = daysSince(c.lastSeen);
    var others = sorted.slice(1, 4);
    var stats = [
      { l: t.cliSpend, v: fmtMad(+c.spend || 0), h: '' },
      { l: t.cliVisits, v: fmt(+c.visits || 0), h: '' },
      { l: t.cliPoints, v: fmt(+c.points || 0), h: '' },
      { l: t.cliLast, v: d == null ? '·' : t.cliDaysAgo(d), h: '' },
    ];
    if (others.length) {
      stats.push({
        l: t.cliRunners,
        v: others.map(function (o) { return esc(o.name); }).join(' · '),
        h: others.map(function (o) { return fmtMad(+o.spend || 0); }).join(' · '),
      });
    }
    var r = {
      text: t.cliTop(esc(c.name)), stats: stats,
      prov: { mod: 'clients', count: book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'clients-directory'),
    };
    /* Le carnet ne retient qu'un cumul par client, jamais l'historique daté.
       « Mon meilleur client ce mois-ci » n'a donc pas de réponse propre : on
       donne le cumul et on dit que c'en est un, plutôt que de l'étiqueter
       « ce mois-ci ». */
    if (spec && spec.period) r.note = t.cliPerLifetime((spec && spec.periodLabel) || '');
    return r;
  }

  function sClientPoints(spec, L) {
    var t = tr(L);
    var f = findClient(spec.raw || '');
    if (!f.book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    if (!f.hit) return { text: t.cliWhich, open: open1(L, 'pClients', 'clients-directory') };
    var c = f.hit;
    /* Le programme réel range seuil et récompense par modèle (amount.threshold,
     * visit.target…). On lisait cfg.on / cfg.threshold / cfg.reward, qui
     * n'existent pas : l'assistant disait « aucun programme actif » à un
     * commerçant qui venait d'en activer un. */
    var cfg = null, on = false;
    try {
      cfg = window.KiwiClients.config ? window.KiwiClients.config() : null;
      on = !!(window.KiwiClients.loyaltyOn && window.KiwiClients.loyaltyOn());
    } catch (_) { cfg = null; on = false; }
    var pts = +c.points || 0;
    var stampModel = !!(cfg && (cfg.model === 'visit' || cfg.model === 'product'));
    var rule = cfg && cfg[cfg.model] || {};
    var thr = stampModel ? (+rule.target || 0) : (+rule.threshold || 0);
    var have = stampModel ? (+c.stamps || 0) : pts;
    var d = daysSince(c.lastSeen);
    var r = {
      text: t.cliPointsOf(esc(c.name), pts),
      stats: [
        { l: t.cliPoints, v: fmt(pts), h: '' },
        { l: t.cliVisits, v: fmt(+c.visits || 0), h: '' },
        { l: t.cliSpend, v: fmtMad(+c.spend || 0), h: '' },
        { l: t.cliLast, v: d == null ? '·' : t.cliDaysAgo(d), h: '' },
      ],
      prov: { mod: 'clients', count: f.book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'clients-directory'),
    };
    if (!cfg || !on) r.note = t.cliNoLoyalty;
    else if (thr > 0) {
      r.verdict = have >= thr
        ? { tone: 'good', text: t.cliReward(esc(rule.reward || '')) }
        : { tone: 'warn', text: stampModel ? t.cliToGoStamps(thr - have) : t.cliToGo(thr - have) };
    }
    return r;
  }

  function sClientDormant(L) {
    var t = tr(L);
    var book = clientBook();
    if (!book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    var sleep = book.filter(function (c) { var d = daysSince(c.lastSeen); return d != null && d > 30; })
      .sort(function (a, b) { return (+b.spend || 0) - (+a.spend || 0); });
    if (!sleep.length) return { text: t.cliDormantNone, open: open1(L, 'pClients', 'clients-directory') };
    var top = sleep.slice(0, 4);
    return {
      text: t.cliDormant(sleep.length),
      stats: top.map(function (c) {
        return { l: esc(c.name), v: fmtMad(+c.spend || 0), h: t.cliDaysAgo(daysSince(c.lastSeen)) };
      }).concat(sleep.length > top.length ? [{ l: t.andMore(sleep.length - top.length), v: '·', h: '' }] : []),
      note: t.cliDormantNote,
      prov: { mod: 'clients', count: book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'clients-directory'),
    };
  }

  /* ═══════════ équipe ═══════════ */
  var LATER_T = {
    fr: { staff: 'Je ne lis que le service d’aujourd’hui. Le planning des jours suivants se trouve dans l’équipe.', hours: function (d) { return 'Demain : <b>' + d + '</b>.'; } },
    en: { staff: 'I only read today’s shift. The schedule for the coming days is in the team page.', hours: function (d) { return 'Tomorrow: <b>' + d + '</b>.'; } },
    ar: { staff: 'كنقرا غير خدمة اليوم. البرنامج ديال الأيام الجاية كاين فالفريق.', hours: function (d) { return 'غدا: <b>' + d + '</b>.'; } },
  };
  function sStaff(spec, L) {
    var t = tr(L);
    if (spec.agg === 'later') return { text: (LATER_T[L] || LATER_T.fr).staff, open: open1(L, 'pTeam', 'nav-equipe') };
    var team = teamRoster();
    if (!team.length) return { text: t.staffNone, open: open1(L, 'pTeam', 'nav-equipe') };
    var onToday = team.filter(function (m) { return m && (m.today || m.onShift || m.hoursToday > 0); });
    var roles = {};
    team.forEach(function (m) { var r = (m && m.role) || '·'; roles[r] = (roles[r] || 0) + 1; });
    var roleTxt = Object.keys(roles).slice(0, 4).map(function (r) { return esc(r) + ' ×' + roles[r]; }).join(' · ');
    if (spec.agg === 'top') {
      return {
        text: t.staffTop,
        stats: [
          { l: t.colRole, v: roleTxt || '·', h: '' },
          { l: t.colToday, v: fmt(onToday.length), h: '' },
        ],
        prov: { mod: 'team', count: team.length, unit: 'entries' },
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    if (spec.agg === 'today') {
      return {
        text: t.staffToday(onToday.length),
        stats: onToday.slice(0, 5).map(function (m) { return { l: esc(m.name), v: esc(m.role || '·'), h: '' }; }),
        prov: { mod: 'team', count: team.length, unit: 'entries' },
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    return {
      text: t.staffCount(team.length),
      stats: [
        { l: t.colRole, v: roleTxt || '·', h: '' },
        { l: t.colToday, v: fmt(onToday.length), h: '' },
      ],
      prov: { mod: 'team', count: team.length, unit: 'entries' },
      open: open1(L, 'pTeam', 'nav-equipe'),
    };
  }

  /* ═══════════ stock — nommer les articles, pas seulement les compter ═══════════ */
  function sStockOut(L) {
    var t = tr(L);
    var prods = catalogProducts();
    if (!prods.length) return { text: t.stkNoCatalog, open: open1(L, 'pStock', 'nav-stock') };
    var C = window.KiwiBoutiqueCatalog;
    var out = [], low = [];
    prods.forEach(function (p) {
      var s = null;
      try { s = C.productStock ? C.productStock(p.id) : null; } catch (_) { s = null; }
      var qty = s && typeof s === 'object' ? (+s.total || 0) : +s;
      if (!isFinite(qty)) return;
      if (qty <= 0) out.push(p); else if (qty <= 3) low.push(p);
    });
    if (!out.length && !low.length) return { text: t.stkNone, open: open1(L, 'pStock', 'nav-stock') };
    var stats = out.slice(0, 4).map(function (p) { return { l: esc(p.name), v: t.stkOutCol, h: '' }; });
    if (out.length > 4) stats.push({ l: t.andMore(out.length - 4), v: '·', h: '' });
    if (low.length) stats.push({ l: t.stkLow, v: fmt(low.length), h: low.slice(0, 3).map(function (p) { return esc(p.name); }).join(' · ') });
    return {
      text: out.length ? t.stkOut(out.length) : t.stkNone, stats: stats,
      prov: { mod: 'stock', count: prods.length, unit: 'entries' },
      open: open1(L, 'pStock', 'nav-stock'),
    };
  }

  /* ═══════════ horaires d'ouverture ═══════════
   * « Sommes-nous ouverts ? », « à quelle heure on ferme ? », « un client peut
   * réserver demain 21 h ? ». Ces réponses viennent de la fiche horaires de
   * l'établissement et de NULLE PART ailleurs.
   *
   * La règle qui compte est celle du silence : quand la semaine n'est pas
   * renseignée, on le dit et on renvoie aux Réglages. Un assistant qui répond
   * « vous fermez à 23 h » parce que c'est l'heure habituelle d'un restaurant
   * fabrique une donnée que le commerçant croira — et qui repartira ensuite
   * dans ses réservations et ses commandes en ligne. Mieux vaut un manque
   * affiché qu'une vraisemblance. */
  function sHours(spec, L) {
    var t = tr(L);
    var KH = window.KiwiHours;
    var openBtn = [{ label: t.openBtn(t.pHours), handler: 'settings-hours' }];
    if (!KH || !KH.isConfigured()) return { text: t.hrUnset, open: openBtn };

    var now = Date.now();
    var st = KH.statusAt(now);
    /* À l'heure de Casablanca, comme le moteur qui a rendu l'instant. */
    var wallOf = function (ms) { return KH.wallClock ? KH.wallClock(ms) : ms; };
    var hhmm = function (ms) {
      var d = new Date(wallOf(ms));
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    var sum = function (ts) { return KH.summary(ts || now, undefined, L).text; };
    var prov = { mod: t.hrSrc, count: 7, unit: 'days' };
    if (spec.agg === 'later') return { text: (LATER_T[L] || LATER_T.fr).hours(sum(now + DAY)), prov: prov, open: openBtn };
    var stats = [
      { l: t.hrTodayCol, v: sum(now), h: '' },
      { l: t.hrWeekCol, v: '', h: KH.weekText(undefined, L) },
    ];

    /* « à quelle heure on ferme ? » */
    if (spec.agg === 'close') {
      if (st.open && st.closesAt) return { text: t.hrCloseAt(hhmm(st.closesAt)), stats: stats, prov: prov, open: openBtn };
      if (st.opensAt) {
        var nxt = KH.statusAt(st.opensAt + 60000);
        /* Le jour nommé est celui de la FERMETURE, pas celui de l'ouverture.
         * Un service qui ouvre lundi 19:00 ferme mardi 02:00 : annoncer « lundi
         * à 02:00 » mélangeait le jour de l'un avec l'heure de l'autre, et
         * c'est précisément le genre de phrase sur laquelle un patron cale un
         * planning de personnel. */
        if (nxt.closesAt) {
          var dayL = KH.dayLabel(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(wallOf(nxt.closesAt)).getDay()], L);
          return { text: t.hrCloseNext(dayL, hhmm(nxt.closesAt)), stats: stats, prov: prov, open: openBtn };
        }
      }
      return { text: t.hrShut(sum(now)), stats: stats, prov: prov, open: openBtn };
    }
    /* « combien de temps avant la fermeture ? » */
    if (spec.agg === 'until') {
      if (!st.open) return { text: t.hrUntilShut + ' ' + sum(now) + '.', stats: stats, prov: prov, open: openBtn };
      return { text: t.hrUntil(st.minutesToClose), stats: stats, prov: prov, open: openBtn };
    }
    /* « peut-on réserver demain à 21 h ? » — spec.when porte l'instant visé. */
    if (spec.agg === 'at' && spec.when) {
      var w = new Date(spec.when);
      var dl = KH.dayLabel(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][w.getDay()], L);
      var hm = String(w.getHours()).padStart(2, '0') + ':' + String(w.getMinutes()).padStart(2, '0');
      var can = KH.canServeAt(spec.when, undefined, { lang: L });
      return {
        text: can.ok ? t.hrAtOk(dl, hm) : t.hrAtNo(dl, hm, sum(spec.when)),
        stats: stats, prov: prov, open: openBtn,
      };
    }
    /* « quels sont nos horaires de Ramadan ? » */
    if (spec.agg === 'exception') {
      var doc = KH.get();
      var xs = (doc.exceptions || []);
      if (spec.term) {
        var needle = norm(spec.term);
        xs = xs.filter(function (e) { return norm(e.label).indexOf(needle) >= 0; });
      }
      if (!xs.length) return { text: t.hrExcNone, stats: stats, prov: prov, open: openBtn };
      var rows = xs.slice(0, 6).map(function (e) {
        var per = e.kind === 'hours'
          ? e.periods.map(function (p) { return p.from + '–' + p.to; }).join(', ') : '';
        return { l: esc(e.label || '·'), v: e.from === e.to ? e.from : e.from + ' → ' + e.to, h: per };
      });
      var first = xs[0];
      return {
        text: t.hrExc(esc(first.label || '·'),
                      first.from === first.to ? first.from : first.from + ' → ' + first.to,
                      first.kind === 'hours' ? first.periods.map(function (p) { return p.from + '–' + p.to; }).join(', ') : ''),
        stats: rows, prov: prov, open: openBtn,
      };
    }
    /* défaut : « est-ce qu'on est ouvert ? » */
    if (st.open) {
      return {
        text: st.minutesToClose >= 1439 ? t.hrOpen24 : t.hrOpen(hhmm(st.closesAt)),
        stats: stats, prov: prov, open: openBtn,
      };
    }
    return { text: t.hrShut(sum(now)), stats: stats, prov: prov, open: openBtn };
  }

  /* ═══════════ the day, read from the books ═══════════
   * Six questions merchants type that used to reach the model: who came,
   * when a client last came, hours worked, items sold, cash taken, the week's
   * schedule. Each reads one source and says what it does not count. */
  var hrs = function (n) { var r = Math.round(n * 10) / 10; return fmt(Math.floor(r)) + (r % 1 ? ',' + Math.round((r % 1) * 10) : '') + ' h'; };
  var GAP_T = {
    fr: {
      seenToday: function (n) { return n ? '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + ' du carnet</b> sont passés aujourd’hui.' : 'Aucun client du carnet n’est passé aujourd’hui.'; },
      seenNote: 'Seuls les clients identifiés en caisse figurent au carnet ; un passage anonyme n’y est pas.',
      lastOf: function (name, ago) { return 'Dernier passage de <b>' + name + '</b> : ' + ago + '.'; },
      contact: 'Ses coordonnées sont sur sa fiche client.',
      worked: function (h, n) { return 'Votre équipe a pointé <b>' + h + '</b> aujourd’hui, sur ' + fmt(n) + ' personne' + (n > 1 ? 's' : '') + '.'; },
      workedNone: 'Aucune heure pointée aujourd’hui pour l’instant.',
      workedNote: 'Heures pointées à la pointeuse, service en cours compris.',
      units: function (u, n) { return '<b>' + fmt(u) + ' article' + (u > 1 ? 's' : '') + '</b> vendus aujourd’hui, sur ' + fmt(n) + ' vente' + (n > 1 ? 's' : '') + '.'; },
      unitsNone: 'Aucune vente détaillée enregistrée aujourd’hui.',
      cash: function (m) { return '<b>' + m + '</b> encaissés en espèces aujourd’hui.'; },
      cashNote: 'Ventes en espèces enregistrées. Le fond de caisse et les sorties de caisse n’y sont pas : le compte exact se fait à la clôture.',
      colSales: 'Ventes en espèces', colAll: 'Toutes les ventes', week: 'Votre semaine :',
    },
    en: {
      seenToday: function (n) { return n ? '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + ' from the book</b> came in today.' : 'No client from the book came in today.'; },
      seenNote: 'Only clients identified at the till are in the book; an anonymous visit is not.',
      lastOf: function (name, ago) { return '<b>' + name + '</b> last came in ' + ago + '.'; },
      contact: 'Their contact details are on the client card.',
      worked: function (h, n) { return 'Your team clocked <b>' + h + '</b> today, across ' + fmt(n) + ' ' + (n > 1 ? 'people' : 'person') + '.'; },
      workedNone: 'No hours clocked today yet.',
      workedNote: 'Hours from the time clock, the current shift included.',
      units: function (u, n) { return '<b>' + fmt(u) + ' item' + (u > 1 ? 's' : '') + '</b> sold today, over ' + fmt(n) + ' sale' + (n > 1 ? 's' : '') + '.'; },
      unitsNone: 'No itemised sale recorded today.',
      cash: function (m) { return '<b>' + m + '</b> taken in cash today.'; },
      cashNote: 'Cash sales recorded. The float and cash paid out are not included: the exact count is made at closing.',
      colSales: 'Cash sales', colAll: 'All sales', week: 'Your week:',
    },
    ar: {
      seenToday: function (n) { return n ? '<b>' + fmt(n) + ' من زبناء السجل</b> دازو اليوم.' : 'حتى زبون من السجل ما داز اليوم.'; },
      seenNote: 'السجل فيه غير الزبناء اللي تعرّفو عليهم فالصندوق؛ الزيارة بلا اسم ما كتبانش.',
      lastOf: function (name, ago) { return 'آخر مرة جا <b>' + name + '</b>: ' + ago + '.'; },
      contact: 'معلومات الاتصال ديالو كاينة فالبطاقة ديالو.',
      worked: function (h, n) { return 'الفريق ديالك خدم <b>' + h + '</b> اليوم، على ' + fmt(n) + ' أشخاص.'; },
      workedNone: 'حتى ساعة ما تسجّلات اليوم مازال.',
      workedNote: 'الساعات من آلة التسجيل، الخدمة اللي دايرة دابا محسوبة.',
      units: function (u, n) { return 'تباعو <b>' + fmt(u) + ' منتوج</b> اليوم، ف' + fmt(n) + ' عمليات بيع.'; },
      unitsNone: 'حتى بيعة مفصّلة ما تسجّلات اليوم.',
      cash: function (m) { return 'دخلو <b>' + m + '</b> كاش اليوم.'; },
      cashNote: 'هادي مبيعات الكاش المسجّلة. فلوس الصندوق الأولى والمصاريف اللي خرجو منو ما داخلينش: الحساب المضبوط كيتدار فالإغلاق.',
      colSales: 'مبيعات الكاش', colAll: 'جميع المبيعات', week: 'الأسبوع ديالك:',
    },
  };
  var gt = function (L) { return GAP_T[L] || GAP_T.fr; };
  var todayWin = function () { var f = startOfDay(); return { id: 'today', from: f, to: f + DAY }; };
  function sClientsToday(L) {
    var t = tr(L), g = gt(L), book = clientBook(), from = startOfDay();
    if (!book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    var seen = book.filter(function (c) { return c && +c.lastSeen >= from; }).sort(function (a, b) { return (+b.lastSeen || 0) - (+a.lastSeen || 0); });
    return {
      text: g.seenToday(seen.length),
      stats: seen.slice(0, 6).map(function (c) { return { l: esc(c.name), v: fmtMad(+c.spend || 0), h: '' }; }),
      note: g.seenNote,
      prov: { mod: 'clients', count: book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'clients-directory'),
    };
  }
  function sClientCard(spec, L) {
    var t = tr(L), g = gt(L), f = findClient(spec.raw || '');
    if (!f.book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'clients-directory') };
    if (!f.hit) return { text: t.cliWhich, open: open1(L, 'pClients', 'clients-directory') };
    var c = f.hit, d = daysSince(c.lastSeen);
    var r = {
      text: d == null ? t.cliWhich : g.lastOf(esc(c.name), t.cliDaysAgo(d)),
      stats: [
        { l: t.cliVisits, v: fmt(+c.visits || 0), h: '' },
        { l: t.cliSpend, v: fmtMad(+c.spend || 0), h: '' },
        { l: t.cliPoints, v: fmt(+c.points || 0), h: '' },
      ],
      prov: { mod: 'clients', count: f.book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'clients-directory'),
    };
    if (spec.contact) r.note = g.contact;
    return r;
  }
  function sStaffHours(L) {
    var t = tr(L), g = gt(L), team = teamRoster();
    if (!team.length) return { text: t.staffNone, open: open1(L, 'pTeam', 'nav-equipe') };
    var worked = team.filter(function (m) { return m && +m.hoursToday > 0; });
    var total = worked.reduce(function (a, m) { return a + (+m.hoursToday || 0); }, 0);
    return {
      text: worked.length ? g.worked(hrs(total), worked.length) : g.workedNone,
      stats: worked.slice(0, 6).map(function (m) { return { l: esc(m.name), v: hrs(+m.hoursToday || 0), h: esc(m.role || '') }; }),
      note: g.workedNote,
      prov: { mod: 'team', count: team.length, unit: 'entries' },
      open: open1(L, 'pTeam', 'nav-equipe'),
    };
  }
  function sUnitsToday(L) {
    var t = tr(L), g = gt(L), win = todayWin();
    var r = productRanking(win);
    var units = r && r.src !== 'menu' ? r.rows.reduce(function (a, x) { return a + (+x.units || 0); }, 0) : 0;
    if (!units) return { text: g.unitsNone, open: open1(L, 'pMenu', 'nav-menu') };
    return {
      text: g.units(units, (r.prov && r.prov.count) || 0),
      stats: r.rows.slice(0, 3).map(function (x) { return { l: esc(x.name), v: '×' + fmt(x.units), h: fmtMad(x.revenue) }; }),
      prov: r.prov,
    };
  }
  function sCashToday(L) {
    var g = gt(L), win = todayWin(), cash = 0, all = 0, n = 0;
    salesRows().forEach(function (e) {
      if (!e || !inWin(+e.ts || 0, win)) return;
      var amt = +e.amount || 0; all += amt; n++;
      if (/cash|esp|especes|نقد|كاش/i.test(String(e.method || ''))) cash += amt;
    });
    return {
      text: g.cash(fmtMad(cash)),
      stats: [{ l: g.colSales, v: fmtMad(cash), h: '' }, { l: g.colAll, v: fmtMad(all), h: fmt(n) }],
      note: g.cashNote,
      prov: { mod: 'sales', count: n, unit: 'entries' },
    };
  }
  var RB_T = {
    fr: {
      lead: function (n, m) { return n ? '<b>' + fmt(n) + ' remboursement' + (n > 1 ? 's' : '') + '</b> enregistré' + (n > 1 ? 's' : '') + ' aujourd’hui, pour ' + m + '.' : 'Aucun remboursement enregistré aujourd’hui.'; },
      note: 'Une commande annulée avant paiement n’est pas une vente et n’apparaît pas ici ; le détail, avec qui l’a fait, est dans les commandes.',
      best: function (d, m) { return 'Votre meilleure journée : <b>' + d + '</b>, avec ' + m + '.'; },
      worst: function (d, m) { return 'Votre journée la plus faible : <b>' + d + '</b>, avec ' + m + '.'; },
      none: 'Pas encore assez de ventes enregistrées pour comparer des journées.',
      span: function (n) { return 'Sur ' + fmt(n) + ' journée' + (n > 1 ? 's' : '') + ' de ventes enregistrées.'; },
    },
    en: {
      lead: function (n, m) { return n ? '<b>' + fmt(n) + ' refund' + (n > 1 ? 's' : '') + '</b> recorded today, for ' + m + '.' : 'No refund recorded today.'; },
      note: 'An order cancelled before payment is not a sale and does not show here; the detail, with who did it, is in orders.',
      best: function (d, m) { return 'Your best day: <b>' + d + '</b>, with ' + m + '.'; },
      worst: function (d, m) { return 'Your weakest day: <b>' + d + '</b>, with ' + m + '.'; },
      none: 'Not enough recorded sales yet to compare days.',
      span: function (n) { return 'Across ' + fmt(n) + ' day' + (n > 1 ? 's' : '') + ' of recorded sales.'; },
    },
    ar: {
      lead: function (n, m) { return n ? 'تسجّلو <b>' + fmt(n) + ' استرجاع</b> اليوم، بمبلغ ' + m + '.' : 'حتى استرجاع ما تسجّل اليوم.'; },
      note: 'الطلب اللي تلغى قبل الخلاص ماشي بيعة وما كيبانش هنا؛ التفاصيل، مع شكون دارو، كاينين فالطلبات.',
      best: function (d, m) { return 'أحسن نهار عندك: <b>' + d + '</b>، ب' + m + '.'; },
      worst: function (d, m) { return 'أضعف نهار عندك: <b>' + d + '</b>، ب' + m + '.'; },
      none: 'مازال ما كاينينش مبيعات كافية باش نقارن بين الأيام.',
      span: function (n) { return 'على ' + fmt(n) + ' أيام ديال المبيعات المسجّلة.'; },
    },
  };
  var CMD_ORDERS_OPEN = function (L) { return [{ label: tr(L).openBtn(({ fr: 'les commandes', en: 'orders', ar: 'الطلبات' })[L] || 'les commandes'), handler: 'nav-transactions' }]; };
  function sRefundsToday(L) {
    var g = RB_T[L] || RB_T.fr, win = todayWin(), n = 0, sum = 0;
    salesRows().forEach(function (e) {
      if (!e || !inWin(+e.ts || 0, win) || !(+e.amount < 0)) return;
      n++; sum += Math.abs(+e.amount);
    });
    return { text: g.lead(n, fmtMad(sum)), note: g.note, prov: { mod: 'sales', count: n, unit: 'entries' }, open: CMD_ORDERS_OPEN(L) };
  }
  function sDayRank(spec, L) {
    var g = RB_T[L] || RB_T.fr, days = {}, from = spec.week ? startOfDay() - 6 * DAY : -Infinity;
    salesRows().forEach(function (e) {
      if (!e || !(+e.ts >= from)) return;
      var d = new Date(+e.ts); d.setHours(0, 0, 0, 0);
      var k = d.getTime(); days[k] = (days[k] || 0) + (+e.amount || 0);
    });
    var list = Object.keys(days).map(function (k) { return { ts: +k, v: days[k] }; }).sort(function (a, b) { return b.v - a.v; });
    if (!list.length || (spec.agg === 'worst' && list.length < 2)) return { text: g.none };
    var loc = L === 'ar' ? 'ar-MA' : L === 'en' ? 'en-GB' : 'fr-FR';
    var label = function (ts) { try { return new Date(ts).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }); } catch (_) { return new Date(ts).toDateString(); } };
    var pick = spec.agg === 'worst' ? list[list.length - 1] : list[0];
    var shown = spec.agg === 'worst' ? list.slice().reverse() : list;
    return {
      text: (spec.agg === 'worst' ? g.worst : g.best)(esc(label(pick.ts)), fmtMad(pick.v)),
      stats: shown.slice(0, 3).map(function (x) { return { l: esc(label(x.ts)), v: fmtMad(x.v), h: '' }; }),
      note: g.span(list.length),
      prov: { mod: 'sales', count: list.length, unit: 'days' },
    };
  }
  function sHoursWeek(L) {
    var t = tr(L), KH = window.KiwiHours;
    var openBtn = [{ label: t.openBtn(t.pHours), handler: 'settings-hours' }];
    if (!KH || !KH.isConfigured()) return { text: t.hrUnset, open: openBtn };
    return { text: gt(L).week + ' ' + esc(KH.weekText(undefined, L)), open: openBtn };
  }

  /* ═══════════ point d'entrée ═══════════
   * agent.js décide de la route et passe le spec ; ici on ne fait que lire. */
  function reply(spec, L) {
    if (!spec || !spec.entity) return null;
    L = (L === 'en' || L === 'ar') ? L : 'fr';
    try {
      if (spec.entity === 'command') return sCommand(spec, L);
      if (spec.entity === 'client' && spec.agg === 'today') return sClientsToday(L);
      if (spec.entity === 'client' && spec.agg === 'card') return sClientCard(spec, L);
      if (spec.entity === 'staff' && spec.agg === 'hours') return sStaffHours(L);
      if (spec.entity === 'product' && spec.agg === 'units') return sUnitsToday(L);
      if (spec.entity === 'cash') return sCashToday(L);
      if (spec.entity === 'refunds') return sRefundsToday(L);
      if (spec.entity === 'dayrank') return sDayRank(spec, L);
      if (spec.entity === 'hours' && spec.agg === 'week') return sHoursWeek(L);
      if (spec.entity === 'product') return sProduct(spec, L);
      if (spec.entity === 'client') {
        if (spec.agg === 'points') return sClientPoints(spec, L);
        if (spec.agg === 'dormant') return sClientDormant(L);
        return sClientTop(spec, L);
      }
      if (spec.entity === 'staff') return sStaff(spec, L);
      if (spec.entity === 'stock') return sStockOut(L);
      if (spec.entity === 'hours') return sHours(spec, L);
      if (spec.entity === 'menu') return sMenuCount(L);
    } catch (_) { return null; }
    return null;
  }

  /* ═══════════ the own-data vocabulary ═══════════
   * 27 Nov 2026: a restaurant asked "how many employees" and got a number the
   * model made up. The router knew « combien d'employés » and not the forty
   * other ways a Moroccan owner types the same question: English, Arabic,
   * Darija in Arabic letters, Darija in arabizi (ch7al, chkoun, 3ndi), SMS
   * French (cb, kel, ajd). Every question about the merchant's OWN figures
   * is recognised here first and answered from the data, so none of them can
   * reach the model as a free guess. tools/agent-bench-test.mjs asks about a
   * thousand phrasings of seventeen questions and grades the fact returned.
   * Input is agent.js's norm(): lower case, no accents, hamza folded. */
  var W = function (src) { return new RegExp(src.normalize('NFD').replace(/[\u064b-\u0655\u0670]/g, '').replace(/\u0649/g, '\u064a')); };
  var LX = {
    count: W("\\b7seb\\b|\\b7sb\\b|حسب ليا|احسب|\\bcompte (?:les|mes|tous)\\b|\\btotal des\\b|العدد الكلي|\\bf total\\b|\\bnombre total\\b|\\bcombien\\b|\\btaille\\b|how big|\\bheadcount\\b|\\bsize of\\b|اجمالي|مجموع|\\bcb\\b|\\bcbn\\b|\\bkombien\\b|\\bnombre\\b|\\bnbr?e?\\b|\\btotal\\b|how many|number of|\\bcount\\b|(?:^|\\s)كم(?=\\s|$)|شحال|قداش|عدد|\\b(?:a?ch|sh)(?:7|h)h?al\\b|\\b3adad\\b|\\ba3dad\\b|\\bchhal\\b"),
    who: W("\\bchkoun\\b|\\bachkoun\\b|\\bachkon\\b|\\bj'?ai qui\\b|\\bwerini\\b|اعرض|سميات|\\bsmiyat\\b|\\bsmit\\b|\\bqui\\b|شنو هما|\\bki\\b|\\bwho\\b|\\blequel\\b|\\blaquelle\\b|\\blesquels\\b|\\bquels?\\b|\\bquelles?\\b|\\bkel\\b|\\bwhich\\b|شكون|اشكون|(?:^|\\s)من(?=\\s)|\\bchk(?:o|ou|u)n\\b|\\bachmen\\b|اشمن|\\bmontre\\b|\\bshow\\b|\\bliste?\\b|وريني|\\bwarini\\b|لائحة|اظهر|ما اسماء"),
    staff: W("العاملون|عاملون|\\bl3ommal\\b|\\bstaff time\\b|عاملين|موظفين|\\bkheddam\\w*|\\blkheddam\\w*|\\bkhddamin\\b|\\bgens que j'?emploie\\b|\\bj'?emploie\\b|الطاكام|طاكم|موظفي|\\bheadcount\\b|\\bsalesperson\\b|\\bl?kh?d+ama\\b|\\blmowadaf\\w*|شخص يعمل|اشخاص يعملون|فريق العمل|عن العمل|الناس اللي|\\bemploy(?:e|es|ee|ees)\\b|\\bsalari(?:e|es)\\b|\\bpersonnel\\b|\\bstaff\\b|\\bequipe\\b|\\bteam\\b|\\beffectif\\b|\\bserveurs?\\b|\\bservers?\\b|\\bwaiters?\\b|\\bcuisiniers?\\b|\\bworkers?\\b|\\bcrew\\b|\\bvendeurs?\\b|\\bsalesperson\\b|\\bbossent\\b|\\btravaillent\\b|work(?:s|ing)? (?:for|with) me|people (?:who )?work|gens (?:qui )?(?:bossent|travaillent)|موظف|خدام|خدامة|(?:^|\\s)(?:ال)?عمال(?=\\s|$)|(?:^|\\s)(?:ال)?عامل(?=\\s|$)|العاملين|فريق|طاقم|تيم|الستاف|سيرفور|نادل|بياع|بائع|\\bkh?d+am\\b|\\bkhdama\\b|\\bkhadama\\b|\\blkhadama\\b|\\bmowadaf\\w*|\\bmwadaf\\w*|\\b3o?mmal\\b|\\btim\\b|\\bekip\\b|kaykhdmo|كيخدمو|ناس.{0,8}كيخدم|\\bnas kaykhdmo"),
    shift: W("\\bau boulot\\b|\\bau travail\\b|\\bkheddam\\b|\\bkhddamin\\b|\\bkheddamin\\b|\\btravaill?e?\\b|\\bbosse\\b|\\bde service\\b|\\ben service\\b|\\ben poste\\b|\\bpointe\\b|\\bpresents?\\b|\\bshift\\b|\\bon duty\\b|\\bworking\\b|\\bclocked\\b|\\bscheduled\\b|\\bplanning\\b|\\bassure le service\\b|\\bcovering\\b|\\bprevu\\b|خدام(?!ة)|خدامين|كاين|فالخدمة|الخدمة|السيرفيس|الشيفت|البيرمانونس|يعمل|يعملون|المناوبة|المناوبون|وردية|مبرمج|\\bkh?d+am(?:in)?\\b|\\bservice\\b|\\bmprogrammi\\b"),
    now: W("aujourd'?\\s?hui|\\bajd\\b|\\bauj\\b|\\btoday\\b|\\btonight\\b|\\bce soir\\b|\\bce matin\\b|\\bce jour\\b|\\bmaintenant\\b|\\bmnt\\b|\\bnow\\b|\\bactuellement\\b|en ce moment|\\bcurrently\\b|\\bthis evening\\b|اليوم|دابا|الليلة|هاد النهار|هاد العشية|الان|حاليا|هذا المساء|\\bly?ou?ma?\\b|\\bdaba\\b|\\blila\\b|\\bl3chiya\\b"),
    top: W("(?:^|\\s)حسن(?=\\s)|\\bhsen\\b|\\baktar\\b|\\bakthar\\b|اللول|\\blargest\\b|\\blkber\\b|لكبر|الكبر|\\bbiggest\\b|\\bgros\\b|en tete|متصدر|\\bbest-?selling\\b|\\bbestselling\\b|\\ble plus\\b|\\bla plus\\b|\\bles plus\\b|\\bmeilleur\\w*|\\bbest\\b|\\btop\\b|\\bmost\\b|\\ble mieux\\b|\\bnumero (?:un|1)\\b|\\bnumber one\\b|\\bpremier\\b|\\bhighest\\b|\\bstar\\b|\\bcartonne\\b|بزاف|اكثر|كثر|افضل|احسن|اعلى|اكبر|نمرة واحد|الاول|يتصدر|\\bbe?zaf\\b|\\bkt[ea]?r\\b|\\ba7san\\b|\\bafdal\\b|\\bakbar\\b|\\blowel\\b"),
    low: W("\\blekher\\b|اللخر|\\bvery little\\b|\\ble moins\\b|\\bla moins\\b|\\bles moins\\b|\\bpire\\b|\\bworst\\b|\\bleast\\b|\\blowest\\b|\\bslowest\\b|\\bfewest\\b|\\bbottom\\b|\\ben bas\\b|\\ben dernier\\b|dernier (?:du|au|en) classement|\\ble dernier (?:produit|plat|article)|\\bmarche (?:le )?moins\\b|ne se vend pas|ne part pas|اقل|اسوا|اخر ترتيب|اخر منتوج|ما كيتباعش|ما كتتباعش|\\bma ?kaytba3ch\\b|\\bma ?kaymchich\\b|\\ba9al\\b|\\b9ell\\b|\\b9lil\\b|\\bakher\\b"),
    sell: W("\\bpartis?\\b|بيعت|المباعة|بيعها|تباعت|تباعو|\\btba3at\\b|\\btba3o\\b|\\bvendues?\\b|خرجت|خرجات|\\bkanbi3ou\\b|كنبيعو|\\bkatba3\\b|\\bkatmchi\\b|كتمشي|\\bkaychri\\w*|كيشريو\\w*|يشتري\\w*|\\bbuys?\\b|\\bbought\\b|\\bbestselling\\b|best-selling|كياخدو|ياخدو|\\bkaykhodo\\b|\\bvend(?!redi)\\w*|\\bvente\\w*|\\bsell\\w*|\\bsold\\b|\\bseller\\b|\\bcommande\\w*|\\bordered\\b|\\bpart\\b|\\bmarche\\b|\\bpopular\\b|\\bclassement\\b|\\branking\\b|\\bchiffre\\b|\\brevenue\\b|\\bsales\\b|كيتباع|كتتباع|بعنا|\\bb3na\\b|تباع|تباعت|يباع|كيبيع|كنبيع|بيع|ابيع|باع|بعت|مبيع|مطلوب|كيمشي|ترتيب|شيفر|\\bkaytba3\\b|\\btba3t?\\b|\\bkaybi3\\b|\\bkanbi3\\b|\\bbi3\\b|\\bba3\\b|\\bventes?\\b|\\bkaymchi\\b"),
    item: W("\\bmakla\\b|ماكلة|\\bmenu item\\b|\\bqu'?\\s?est[- ]ce\\b|ما الذي|ماذا|اصناف|الاصناف|منتجات|المنتجات|عناصر|\\bentries\\b|\\bproduits?\\b|\\barticles?\\b|\\bplats?\\b|\\bitems?\\b|\\bproducts?\\b|\\bdish(?:es)?\\b|\\breferences?\\b|\\bboissons?\\b|\\bmeal\\b|\\bthing\\b|\\bce qui\\b|\\bwhat\\b|منتج|منتوج|صنف|طبق|وجبة|حاجة|بلات|سلعة|\\bproduit\\b|\\bplat\\b|\\barticle\\b|\\bsenf\\b|\\b7aja\\b|شنو|اشنو|\\bchno\\b|\\bachno\\b|\\bqu'?est[- ]ce\\b|\\bc'?est quoi\\b|\\bc quoi\\b"),
    client: W("عملاينا|عملاين|\\bvisitors?\\b|عميل|عميلا|العميل|عملايي|\\bclients?\\b|\\bclientes?\\b|\\bcustomers?\\b|\\bhabitues?\\b|\\bregulars?\\b|\\bacheteurs?\\b|زبون|زبناء|زبائن|زبائني|عملاء|عملائي|العملاء|كليان|الكليان|\\bk?l[iy]an\\b|\\bzbo?u?n\\b|\\bzbana\\b|\\blclients\\b"),
    spend: W("\\bachats?\\b|\\bpurchases?\\b|\\btotal spend\\b|ينفق|الانفاق|مشتريات|المشتريات|الشريات|فلوس|\\bflous\\b|\\bkaykhelli\\b|depense\\w*|\\bspends?\\b|\\bspent\\b|\\bfidele\\b|\\bloyal\\b|\\bbig spender\\b|\\bachete le plus\\b|\\bpaie le plus\\b|كيصرف|يصرف|انفق|\\bkayserf\\b|كيخلص|\\bkaykhelles\\b"),
    points: W("\\brewards?\\b|رصيد|الوفاء|الولاء|\\bpoints?\\b|\\bpts\\b|\\bstamps?\\b|\\btampons?\\b|\\bfidelite\\b|\\bloyalty\\b|(?:^|\\s)[بل]?(?:ال)?(?:نقاط|نقطة|نقط)(?=\\s|$)|بوان|\\bpwan?\\b|\\bno9at\\b|\\bnu9at\\b"),
    notPoints: W("points? de vente|\\bpoint mort\\b|break[- ]?even|seuil de rentab|نقطة التعادل|fais le point|faire le point"),
    gone: W("\\bne viennent plus\\b|\\bcesse\\w*|\\bno longer\\b|\\bused to\\b|مقاطع|\\bm9ate3\\b|\\bma rj3o?u?ch\\b|ما رجعوش|hasn'?t (?:come|been) back|has not come back|didn'?t come back|rje3|(?:pas|plus) (?:re)?venus?\\b|ne revien\\w* plus|\\breviennent plus\\b|ne vient plus|arrete de venir|cesse de venir|remis les pieds|\\bdisparu\\b|\\bperdus?\\b|\\binactifs?\\b|\\bdormants?\\b|\\babsents?\\b|\\bchurn\\b|\\blost\\b|\\blapsed\\b|\\binactive\\b|stopped (?:coming|visiting)|no longer come|haven'?t (?:come back|returned|visited)|not come back|haven'?t seen|لم يعود|لم يعد|لم يرجع|توقفوا|انقطعوا|غير النشطين|الغائبين|ما بقاو|ما بقا|ما بقاش|ما رجع|ما جاو|ما كيجيش|حبسو|غبرو|قطعو|\\bma ?b9aw?c?h?\\b|\\bma ?rje3c?h\\b|\\bma ?jawch\\b|\\bghber\\b|\\b9te3\\b|\\b7ebso\\b"),
    out: W("en train de finir|\\bleft very little\\b|انتهى|انتهت|\\byenfed\\b|\\b9reb\\b|قرب يسالي|قربات تسالي|presque plus|\\bbientot\\b.{0,12}(?:manquer|reapprovision)|اوشكت|قاربت|غير (?:ال)?متوفر|\\brupture\\w*|\\bepuise\\w*|out of stock|\\bsold out\\b|\\brun(?:ning)? (?:out|low)\\b|\\bran out\\b|\\balmost out\\b|\\blow stock\\b|\\bstock faible\\b|\\bhors stock\\b|\\bindisponibles?\\b|\\bmanque\\w*|\\bpresque (?:finis|plus|epuise)|\\bnearly finished\\b|\\breapprovision\\w*|\\breplenish\\w*|نفد|نافد|النفاد|سالا|سالاو|تسالي|يسالي|ما بقاش|ما بقاوش|ناقص|غير متوفر|منخفض|اعادة تخزين|نعاود نجيب|\\bsala\\b|\\bsalaw\\b|\\bysali\\b|\\bna9es\\b|\\bmab9aw?ch\\b|\\bma b9aw?ch\\b|\\bchwiya\\b|شوية"),
    stock: W("\\bstocks?\\b|\\bstok\\b|\\binventaire\\b|\\binventory\\b|\\bstockage\\b|\\bingredients?\\b|\\bmagasin\\b|ستوك|مخزون|المخزون|الخزين|سلعة|مواد|المكونات|\\bstock\\b"),
    close: W("\\bferm\\w*|\\bclos\\w*|\\bshut\\b|baisse le rideau|termine le service|\\bfermeture\\b|نغلق|يغلق|اغلاق|الاغلاق|كنسدو|نسدو|غنسدو|كيسد|غيتسد|السد|كنساليو|\\b(?:kan|ghan|n)se?dd?o\\b|\\bkaysed\\b|\\bsedd?\\b|\\bkantsaliw\\b|\\bfermeture\\b"),
    open: W("\\bm7ell\\w*|\\bkay7ell\\b|كيحل|الحلان|\\bl7ell\\b|\\bkan7ellou\\b|(?:المحل|الحانوت|القهوة|الريسطو|المطعم)(?: ديالي)? خدام|\\bstart business\\b|افتتاح|يفتح|فتح|مفتوحون|\\bouvert\\w*|\\bouvr\\w*|\\bouverture\\b|\\bopen\\w*|\\bcommence\\b|محلول|محلولة|محلولين|كنحلو|نحلو|يتحل|كيتحل|نفتح|كنفتحو|مفتوح|الفتح|\\bma7lou?l\\w*|\\bkan7ell?o\\b|\\bn7ell?o\\b|\\bkayt7el\\b|\\bt7el\\b|\\bkanfet7o\\b|\\blfe\\S*7\\b|\\bfet7\\b"),
    when: W("\\bm3a ch7al\\b|\\bm3a chhal\\b|\\b7ta l ?ch7al\\b|\\bwe9tach\\b|معا شحال|\\best ouverte?s?\\b|tout de suite|\\bwla la\\b|ولا لا|\\bsavoir si\\b|\\best ouvert\\b|\\bsommes ouverts?\\b|\\bc ouvert\\b|هل|quelle heure|kel heure|\\bquand\\b|\\bwhen\\b|what time|\\bheure\\b|\\bhoraires?\\b|\\btime\\b|\\bhours?\\b|\\ba cb\\b|\\ba combien\\b|\\bvers\\b|est[- ]ce qu|\\bare we\\b|\\bis (?:the|my|it|our)\\b|\\bwach\\b|واش|فوقاش|وقتاش|فاش|امتى|متى|موعد|وقت|ساعة|فالساعة|حتى لشحال|مع شحال|في كم|\\bfo9ach\\b|\\bfach\\b|\\bwa9tach\\b|\\bwe9t\\b|\\bsa3a\\b|\\bimta\\b|\\b7ta\\b"),
    notHours: W("heure de pointe|heures? de pointe|\\brush\\b|\\bpeak\\b|ouvr\\w* le (?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|\\bdois\\b|\\bdoit\\b|faut[- ]il|vaut le coup|\\bramadan\\b|\\baid\\b|\\beid\\b|\\bferie|\\bholiday|\\bconges?\\b|\\bvacances?\\b|رمضان|العيد|عطلة|chiffre d'?affaire|\\bbenefice|\\bmarges?\\b|\\bcouts?\\b|\\bsalaires?\\b|cloture de caisse|fermeture de caisse|\\bcommandes? (?:sont )?ouvertes\\b|open orders|tables? ouvertes|\\bset opening\\b|\\bmodifi\\w*|\\bchange\\w*|\\bdevrais\\b|\\bshould\\b|\\brentable\\b|\\bdeuxieme\\b|\\bsecond (?:shop|store)\\b|\\bnouveau (?:magasin|resto|cafe)\\b|\\bouvrir (?:un|une)\\b"),
    revenue: W("\\bdkhelna\\b|دخلنا|\\bmadakhil\\b|مداخيل|المداخيل|بالفلوس|\\bb flous\\b|bring in|brought in|\\bchiffre\\b|\\b(?:mon|le|du|son|notre) ca\\b|\\bca (?:du|de|ce|d'?aujourd|mensuel|ajd|aujourd)|\\bc\\.a\\b|\\brecettes?\\b|\\bencaiss\\w*|\\bgagne\\w*|\\bfait\\b|\\bmade\\b|\\bmake\\b|\\bearn\\w*|\\brevenue\\b|\\bsales\\b|\\btakings\\b|\\bturnover\\b|\\bventes?\\b|\\bvendu\\b|\\brapporte\\w*|\\bbrought in\\b|\\btaken\\b|\\bincome\\b|مبيعات|المبيعات|ايرادات|الايرادات|دخل|دخلت|ربح|درت|درنا|بعت|بعنا|باع|الكا|الشيفر|شيفر|رقم المعاملات|جاب|\\bdkhal\\b|\\bdkhe?lt?\\b|\\bdert\\b|\\bderna\\b|\\bb3t\\b|\\bb3na\\b|\\bba3\\b|\\brba7\\b|\\bchiffre\\b|\\blka\\b|\\bjab\\b|\\bdakhel\\b"),
    month: W("\\bmois\\b|\\bmonth\\w*|\\bmensuel\\w*|الشهر|شهر|\\bch(?:h|7)a?r\\b|\\bchhr\\b|\\bce mois\\b"),
    orders: W("\\btalab\\w*|طلب|\\bcommandes?\\b|\\btickets?\\b|\\borders?\\b|\\btransactions?\\b|\\bfactures?\\b|\\bventes\\b|\\bsales\\b|\\bcouverts?\\b|\\breceipts?\\b|كوموند|كومند|طلبات|طلبية|الطلبات|تيكي|تيكيات|فاتورة|فواتير|عملية بيع|بيعات|\\bcommandat?\\b|\\btiki\\w*\\b|\\bcomand\\w*"),
    avg: W("مويان|\\bmoyen\\b|\\bmoyen\\w*|\\baverage\\b|\\bavg\\b|\\bmean\\b|\\bper (?:ticket|order|sale|customer)\\b|\\bpar (?:ticket|commande|vente|client|achat)\\b|معدل|متوسط|المتوسط|المعدل|موايان|البانيي|\\bmo3adal\\b|\\blmo3adal\\b|\\bmoyenne\\b"),
    menu: W("قايمتي|قايمة الطعام|قايمة|مدرج|\\bentries\\b|كتالوج|\\bmenu\\b|\\bcarte\\b|\\bcatalogu?e?\\b|\\bcatalog\\b|المنيو|المينيو|الكارط|القائمة|الكاتالوغ|كاطالوغ|الكاطالوغ|منيو|\\bmenu\\b|\\bcarte\\b|\\bcatalogue\\b|\\bdans ma boutique\\b|\\bau magasin\\b|\\benregistres?\\b|\\blistes?\\b|مسجل|\\bmsajel\\b|\\bchoix\\b|اختيار|\\bin stock\\b|\\bje propose\\b"),
    menuItem: W("طبق|ماكلة|ماكلات|برودوي|\\bmakla\\b|\\bentries\\b|عناصر|\\bplats?\\b|\\bproduits?\\b|\\barticles?\\b|\\breferences?\\b|\\bitems?\\b|\\bproducts?\\b|\\bdish(?:es)?\\b|\\bchoix\\b|\\boptions?\\b|بلات|بلاتوات|منتوج|منتج|منتجات|اطباق|الاطباق|صنف|اصناف|آرتيكل|ارتيكل|حاجة|اختيار|\\bplat\\b|\\bsenf\\b|\\barticle\\b|\\bproduit\\b"),
    notStaffCount: W("diminuer|reduire|reduc|تقليص|تقليل|ننقص|نحيد|\\bn9es\\b|راتب|ساعات|\\bheures\\b|\\bhours\\b|\\bworked\\b|licenci|layoff|lay off|\\bvirer\\b|\\bfire\\b|renvoy|econom|\\bsave\\b|kankhelles|nkhelles|كنخلص|نخلص|\\bcoute\\w*|\\bcout\\b|\\bcost\\w*|\\bembauch\\w*|\\brecrut\\w*|\\bhir(?:e|ing)\\b|\\bsalaires?\\b|\\brawatib\\b|رواتب|يكلف|توظيف|\\bpay(?:roll)?\\b|\\bpaie\\b"),
  };
  /* The order is the precedence: the most specific question wins. */
  var STRONG_SHIFT = W("\\bshift\\b|\\bon duty\\b|de service|en poste|(?:a|ont) pointe\\b|\\bclocked\\b|\\bscheduled\\b|\\bplanning\\b|المناوبة|المناوبون|وردية|السيرفيس|الشيفت|البيرمانونس|مبرمج|\\bmprogrammi\\b");
  var PERSON = W("\\bqui\\b|\\bki\\b|\\bwho\\b|شكون|اشكون|(?:^|\\s)من(?=\\s)|\\bchk(?:o|ou|u)n\\b");
  var WHAT = W("\\bquoi\\b|\\bwhat\\b|شنو|اشنو|\\bchno\\b|\\bachno\\b|\\bachmen\\b|اشمن|ما الذي|ماذا|qu'?\\s?est[- ]ce");
  var STRONG_OUT = W("\\brupture\\w*|\\bepuise\\w*|out of stock|\\bsold out\\b|نفد|نافد|النفاد|يسالي|تسالي|سالاو|\\bsalaw\\b|\\bysali\\b");
  var NEG_SELL = W("ne se vend pas|ne part pas|ما كيتباعش|ما كتتباعش|ما كيمشيش|\\bma ?kaytba3ch\\b|\\bma ?kaymchich\\b");
  var MENU_WORD = W("\\bmenu\\b|\\bcarte\\b|\\bplats?\\b|\\bdish(?:es)?\\b|\\bmeals?\\b|المنيو|المينيو|منيو|الكارط|القايمة|قايمة|قايمتي|بلات|اطباق|الاطباق|\\bplat\\b");
  var HAVE = W("\\bai\\b|\\bj'?ai\\b|\\bon a\\b|\\bhave\\b|عندي|عندنا|لدي|لدينا|\\b3ndi\\b|\\b3ndna\\b|\\bkayn\\b|كاين");
  /* Not a reading of the books: a target to reach, a forecast, a profit or
   * margin question, a season, a past period. agent.js owns those. */
  var NOT_OWN = W("je veux (?:gagner|faire|atteindre)|j'?aimerais (?:gagner|faire)|i want to (?:make|earn|hit)|\\bobjectif\\b|\\btarget\\b|\\bgoal\\b|بغيت نربح|اريد ربح|هدفي|\\bhadaf\\b");
  /* An order to the app, not a question: the operation routes own it. */
  var COMMAND = W("^(?:stp |svp |please |عفاك )?(?:ajoute\\w*|add|supprime\\w*|delete|remove|annule\\w*|cancel|modifie\\w*|change|set|mets|met|envoie\\w*|send|cree\\w*|create|enregistre\\w*|ecris|write|zid|nzid|bdel|beddel|khlli|khalli|7yed|7ayed|lghi|ilghi)\\b|^(?:عفاك )?(?:اجعل|خلي|لغي|حط|دير|زيد|ضيف|حيد|بدل|بدّل|صيفط|ارسل|اضف|احذف|الغ|غير|سجل)(?=\\s|$)|\\b(?:send|envoie\\w*)\\b.{0,30}\\b(?:message|sms|whatsapp)|(?:صيفط|ارسل).{0,30}(?:رسالة|ميساج)");
  var PAID_OUT = W("دفعت|دفعنا|خلصت|خلصنا|\\bkhlle?st\\b|\\bpaye\\b|\\bpaid\\b|\\bdecaiss\\w*|\\bspent on\\b|\\bsorti de (?:la )?caisse\\b");
  var LATER = W("\\bdemain\\b|\\btomorrow\\b|غدا|غدوة|\\bghda\\b|\\bghedda\\b|apres[- ]demain|la semaine prochaine|next week");
  var HOWTO = W("^(?:comment (?!va\\b|ca va)|how (?:do|to|can|does|should)\\b|كيفاش|كيفاه|\\bkifa?c?h\\b|\\bkifash\\b)|\\bwach kayn\\b|est.ce qu'?il y a");
  var FUTURE = W("\\bprevoi\\w*|\\bestim\\w*|\\bproject\\w*|next month|mois prochain|month end|end of (?:the )?month|fin du mois|\\bfinirai\\b|\\bjay\\b|الجاي|القادم|بنهاية|نهاية الشهر|لاخر الشهر|\\bakher chh?er\\b|\\btwa9e3\\b|توقع|قدر ليا|ستبلغ|ستكون|\\bghansel\\b|غنبيع|\\bgh ?nbi3\\b|a ce rythme|at this pace|الوتيرة|بهذا المعدل|end up this month|\\bvais\\b|\\bva (?:faire|gagner|vendre)\\b|\\bwill\\b|غادي ن|\\bghadi n|prevision|forecast|\\bprevoir\\b");
  var MONEY_TALK = W("\\bmarges?\\b|\\bmargin\\b|benefice|\\bprofit|rentab|break.?even|\\bseuil\\b|\\bgagn\\w*|\\bearn\\w*|\\bincome\\b|\\bnet\\b|ربح|ارباح|\\brba7\\b|\\bargent\\b|\\bcash\\b|tresorerie|\\bmoney\\b|\\bflous\\b|فلوس|\\bcouter\\b|\\bcoute\\b|\\bcost\\b|\\bbaiss\\w*|\\bhausse\\b|augment\\w*|\\bdrop\\w*|\\bcompar\\w*");
  var SEASON = W("\\bramadan\\b|\\bramdan\\b|\\baid\\b|\\beid\\b|\\bete\\b|\\bsummer\\b|\\bhiver\\b|\\bwinter\\b|\\bsaison\\w*|\\bseason\\w*|رمضان|العيد|الصيف|الشتاء|موسم");
  var OTHER_DAY = W("\\bhier\\b|\\byesterday\\b|avant[- ]hier|البارح|البارحة|(?:^|\\s)امس|\\blbare7\\b|\\blundi\\b|\\bmardi\\b|\\bmercredi\\b|\\bjeudi\\b|\\bvendredi\\b|\\bsamedi\\b|\\bdimanche\\b|\\bjanvier\\b|\\bfevrier\\b|\\bmars\\b|\\bavril\\b|\\bmai\\b|\\bjuin\\b|\\bjuillet\\b|\\baout\\b|\\bseptembre\\b|\\boctobre\\b|\\bnovembre\\b|\\bdecembre\\b|\\bsemaine\\b|\\bweek\\b|\\blast\\b|dernier|derniere|passee?\\b|الماضي|الاسبوع");
  var COUNT_OF = W("\\b(?:ch|sh)(?:7|h)h?al\\b.{0,20}\\bmn\\b|حسب ليا|احسب|\\b7seb\\b|\\bcompte (?:les|mes)\\b|العدد الكلي|\\bcount\\b|\\b3adad\\b|\\bnombre\\b|combien d|\\bcb d|how many|number of|nombre d|\\bnbr? d|عدد|(?:^|\\s)كم(?=\\s)|شحال من|شحال ديال|\\b(?:ch|sh)(?:7|h)h?al (?:mn|d)\\b");
  /* An order to change data (« change closing time to 11 », « ajoute 20
   * points à Salma ») used to come back as a reading of that data. The
   * assistant never writes to the books: it says so and opens the page where
   * the merchant makes the change with their own rights. An order naming a
   * ticket number stays with the operation lane, which can move an order. */
  var CMD_TARGETS = [
    { rx: W("\\bpoints?\\b|fidelit|loyalty|نقط|\\bn9at\\b|\\bclients?\\b|\\bcustomers?\\b|زبون|زبناء|كليان|\\bklyan\\b"), page: 'pClients', h: 'clients-directory' },
    { rx: W("horaire|\\bheures? d|\\bouverture\\b|\\bfermeture\\b|closing|opening|\\bhours\\b|وقت|ساعات|الاغلاق|الفتح|السدان|\\bsdan\\b|\\bl7ell\\b|\\bwa9t\\b|\\bsa3a\\b"), page: 'pHours', h: 'settings-hours' },
    { rx: W("employe|serveur|caissier|\\bstaff\\b|\\bequipe\\b|\\bteam\\b|employee|worker|waiter|خدام|موظف|عامل|\\bkhddam\\b|\\bkhdam\\b"), page: 'pTeam', h: 'nav-equipe' },
    { rx: W("\\bstock\\b|inventaire|inventory|مخزون|\\bstok\\b"), page: 'pStock', h: 'nav-stock' },
    { rx: W("\\bcommandes?\\b|\\bventes?\\b|\\btickets?\\b|\\borders?\\b|\\bsales?\\b|طلب|طلبات|كوموند|\\bcommande\\b"), page: 'pOrders', h: 'nav-transactions' },
    { rx: W("\\bplats?\\b|\\bmenu\\b|\\bcarte\\b|\\bdish|\\bprix\\b|\\bprice\\b|produit|product|article|\\bitem\\b|منيو|مينيو|طبق|منتوج|سلعة|ثمن|سعر|تمن|\\btaman\\b|\\bplat\\b"), page: 'pMenu', h: 'nav-menu' },
  ];
  var CMD_T = {
    fr: 'Je ne modifie pas vos données depuis cette conversation : la modification se fait sur la page, avec vos droits.',
    en: 'I don’t change your data from this conversation: the change is made on the page, with your own access.',
    ar: 'ما كنبدّلش المعطيات ديالك من هاد المحادثة: التعديل كيتدار فالصفحة، بالصلاحيات ديالك.',
  };
  function commandIntent(q) {
    if (/\b(?:commande|order|ticket|طلب|cmd)\s*(?:n[o°]?\s*)?#?\d/.test(q)) return null;
    /* Not data changes: a new sale or payment link (the action lane opens
     * them), a « what if » with a percentage, a text to write, a message to
     * the staff (refused by its own route). */
    if (/nouvelle vente|new sale|lien de paiement|payment link|%|^(?:write|ecris|redige)/.test(q)) return null;
    if (/\b(?:send|envoie\w*)\b|صيفط|ارسل/.test(q) && CMD_TARGETS[2].rx.test(q)) return null;
    var send = /\b(?:send|envoie\w*)\b|صيفط|ارسل/.test(q) && /message|sms|whatsapp|رسالة|ميساج/.test(q);
    for (var i = 0; i < CMD_TARGETS.length; i++) if (send || CMD_TARGETS[i].rx.test(q)) return { entity: 'command', target: CMD_TARGETS[send ? 0 : i], send: send };
    return null;
  }
  var CMD_SEND_T = {
    fr: 'Je n’envoie pas de message depuis cette conversation : l’envoi se fait depuis le carnet clients, avec le consentement de chaque client.',
    en: 'I don’t send messages from this conversation: sending is done from the client book, with each client’s consent.',
    ar: 'ما كنصيفطش الرسائل من هاد المحادثة: الإرسال كيتدار من سجلّ الزبناء، بموافقة كل زبون.',
  };
  var CMD_ORDERS = { fr: 'les commandes', en: 'orders', ar: 'الطلبات' };
  function sCommand(spec, L) {
    var target = spec.target;
    if (target.page === 'pOrders') return { text: CMD_T[L] || CMD_T.fr, open: [{ label: tr(L).openBtn(CMD_ORDERS[L] || CMD_ORDERS.fr), handler: target.h }] };
    if (spec.send) return { text: CMD_SEND_T[L] || CMD_SEND_T.fr, open: open1(L, 'pClients', 'clients-directory') };
    /* A shop sells products, a restaurant a menu: the item page follows. */
    if (target.h === 'nav-menu' && !window.KiwiMenuStore && window.KiwiBoutiqueCatalog) target = { page: 'pStock', h: 'nav-catalogue' };
    return { text: CMD_T[L] || CMD_T.fr, open: open1(L, target.page, target.h) };
  }
  var WEEKDAY = W("\\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tnin|tlat|larb3a|lkhmis|jjem3a|jem3a|ssebt|sebt|l7ed)\\b|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعة|السبت|الاحد|نهار الجمعة");
  var REFUND_W = W("rembours\\w*|\\brefund\\w*|\\bannul\\w*|\\bcancel\\w*|\\bvoid\\w*|استرجاع|استرداد|مرجوع|ملغ|الغاء|\\brj3o\\b|\\bmrjou3\\b");
  var BEST_DAY = W("(?:meilleur\\w*|\\bbest\\b|\\btop\\b|احسن|افضل|\\ba7san\\b|\\bafdal\\b)\\s+(?:\\w+\\s+){0,2}(?:jour\\w*|\\bday\\b|نهار|يوم|\\bnhar\\b)|(?:jour|day|نهار|\\bnhar\\b)\\s+(?:ou |where |li )?(?:j'?ai |i |)(?:le plus|the most|most|كثر|بعت فيه كثر|\\bktar\\b)");
  var WORST_DAY = W("(?:pire|\\bworst\\b|plus faible|plus mauvais\\w*|اسوا|اضعف|\\bkhayb\\b)\\s+(?:\\w+\\s+){0,2}(?:jour\\w*|\\bday\\b|نهار|يوم|\\bnhar\\b)|(?:jour|day|نهار|\\bnhar\\b)\\s+(?:ou |where |li )?(?:j'?ai |i |)(?:le moins|the least|least|قل|\\bqell?\\b)");
  /* « le meilleur jour pour ouvrir / lancer une promo » asks for advice. */
  var AIM_DAY = W("(?:jour|day|نهار|\\bnhar\\b)\\s+(?:pour|to|for)\\b|(?:jour|day|نهار|\\bnhar\\b)\\s+(?:باش|\\bbach\\b)");
  var CASH_PAY = W("\\ben (?:liquide|especes|cash)\\b|\\bliquide\\b|\\bin cash\\b|\\bcash (?:takings|payments?|recus?|received|sales|pay\\w*)\\b|\\bpa(?:y|id) (?:in )?cash\\b|نقدا|النقد|النقدية|بالكاش|\\bna9dan\\b|\\bkhlas cash\\b|\\bcash lyoum\\b|\\bpaiements en cash\\b");
  var DAYS_W = W("\\bjours?\\b|\\bdays?\\b|\\bweekdays?\\b|نهار|ايام|يوم|يوما|\\bnhar\\b|\\bnharat\\b|\\biyam\\b|\\byoum\\b");
  var OPENISH = W("ouvr|\\bopen|\\boperate|عمل|الخدمة|فتح|افتتاح|نستقبل|كنستقبلو|\\bkansta9blo\\b|7ell|t7el|محلول|كيتحل|\\bma7loul\\b|ouverture");
  var WEEK_W = W("semaine|hebdo|\\bweek\\w*|سيمانة|اسبوع|\\bsimana\\b|\\bsmana\\b");
  var LAST_MONTH = W("mois (?:dernier|passe|precedent)|last month|previous month|الشهر (?:الماضي|اللي فات|الفايت|السابق|لي فات)|\\bch(?:h|e)?ar (?:li |l)?fa(?:t|yt)\\b|\\bchhr li fat\\b");
  var CASH_BOX = W("فالدرج|الدرج|الكاسة|\\btiroir\\b|(?:dans|in|en) (?:la |ma |the |my )?(?:caisse|tiroir|drawer|till)\\b|\\bf(?:e|i)? ?(?:sndo9|sendo9|sndoq|snadq)\\b|فالصندوق|في الصندوق|فصندوق|فالكاسة|\\bcash\\b.{0,25}\\b(?:aujourd|today|lyoum|lyouma)|\\bespeces\\b.{0,25}\\b(?:aujourd|today)|كاش اليوم");
  var WEEK_DAYS = W("(?:\\bjours?\\b|\\bdays?\\b|نهار|ايام|يوما|يوم|\\bnhar\\b|\\biyam\\b).{0,30}(?:ouvr|\\bopen|travaill|\\bwork|نعمل|تعمل|نفتح|مفتوح|كنخدمو|نخدمو|كنحلو|خدامين|\\bkhdmo\\b|\\bkn?khdmo\\b|\\bkan7ellou\\b)|(?:ouvert|\\bopen\\b).{0,20}(?:par semaine|per week|a week)");
  var HRS_WORD = W("combien de temps|how long|time worked|staff time|\\bswa3e3\\b|\\bswaye3\\b|\\bheures?\\b|\\bhours?\\b|ساعات|ساعة|سوايع|\\bsway3\\b|\\bsa3at\\b|\\bsa3a\\b");
  var WORK_VERB = W("اشتغل\\w*|بوانتاو|\\bbwantaw\\b|\\bkhedmo\\b|\\bkhedma\\b|الخدمة|سجلو|\\bworked\\b|travaill|\\bbosse|\\bworked\\b|\\bwork\\b|خدمو|\\bkhdmo\\b|\\bkhedmo\\b");
  var PRESENT = W("موجود|حاضر|\\bpresents?\\b|\\best la\\b|\\bsont la\\b|\\bthere\\b|\\bhere\\b|\\bkayn\\b|كاين|\\bici\\b");
  var VISITED = W("\\bhere\\b|\\bdazou\\b|\\bzarouna\\b|\\bjaw\\b|(?:^|\\s)(?:زارونا|زارنا|قدموا|مروا|مرو|دازو|جاو)(?=\\s|$)|\\bvenus?\\b|\\bvenues?\\b|\\bpasse(?:s|e|es)?\\b|\\bcame\\b|\\bcome in\\b|\\bvisit\\w*|\\bja\\b|\\bjaw\\b|\\bdaz\\b|\\bdazo\\b|(?:^|\\s)(?:جا|جاو|جاؤوا|جاءوا|جاووا|جاء|داز|دازو|زار|زارو|زاروا|حضر|حضروا|اجا|اتى|اتوا)(?=\\s|$)");
  var LAST_VISIT = W("last here|last (?:come|came)|\\bakhe?r merr?a\\b|\\bakher mra\\b|\\bdate\\b|تاريخ اخر|شحال هادي ما|\\bch7al hadi ma\\b|how long since|derniere (?:fois|visite)|last (?:time|visit)|\\blast (?:came|come|visited)\\b|\\bvisit(?:ed)? last\\b|\\bcame (?:in )?last\\b|quand (?:est|a|etait)|when did|when was|اخر مرة|اخر زيارة|\\bakhir mra\\b|\\bakher mra\\b|فوقاش|\\bfo9ach\\b|امتى|متى");
  var CONTACT = W("\\bcontact\\w*|تواصل|اتواصل|الاتصال|نتاصل|\\bntasel\\b|\\bnemro\\b|هاتف|\\bjoindre\\b|\\bappeler\\b|\\bnumero\\b|\\btelephone\\b|\\btel\\b|\\bphone\\b|\\bcontact\\b|\\bemail\\b|\\bnemra\\b|رقم|نمرة|تيليفون|الهاتف");
  var UNIT_WORD = W("قطعة|قطع|القطع|وحدة|وحدات|الوحدات|بياسة|البرودويات|\\bpieces?\\b|\\bunites?\\b|\\b9ta3\\b|\\bl9ta3\\b|\\b7aja\\b|\\barticles?\\b|\\bproduits?\\b|\\bpieces?\\b|\\bunites?\\b|\\bunits?\\b|\\bitems?\\b|\\bplats?\\b|منتوج|منتجات|منتج|سلعة|حاجة|حوايج|\\bmontoj\\b|\\bproduit\\b");
  function ownIntent(q, raw) {
    q = String(q || '');
    var h = function (k) { return LX[k].test(q); };
    if (COMMAND.test(q)) return commandIntent(q);
    /* « كيفاش نتاصل ببناني », « how can I contact Bennani »: a client's card. */
    if (CONTACT.test(q) && findClient(raw || q).hit) return { entity: 'client', agg: 'card', contact: true };
    if (NOT_OWN.test(q) || HOWTO.test(q)) return null;
    /* Money paid out is a cost, not the takings that the day card shows. */
    if (PAID_OUT.test(q) && /combien|\bcb\b|how much|كم|شحال|\bch7al\b|\bchhal\b/.test(q) && !/\breste\b|\bleft\b|\bremain|بقا|باقي|\bb9a\b/.test(q)) return { route: 'charges' };
    var later = LATER.test(q);
    if (later && !h('notHours') && (h('open') || h('close')) && (h('when') || h('now'))) return { entity: 'hours', agg: 'later' };
    if (later && (h('shift') || h('staff')) && h('who')) return { entity: 'staff', agg: 'later' };
    var money = MONEY_TALK.test(q) || FUTURE.test(q), season = SEASON.test(q), past = OTHER_DAY.test(q);
    var hit = function () { var f = findClient(raw || q); return f && f.hit; };
    /* Last month is a past period: agent.js answers that it keeps no history. */
    if (LAST_MONTH.test(q)) return null;
    var howMuch = /combien|\bcb\b|how much|how many|كم|شحال|\bch7al\b|\bchhal\b|\bwhat'?s in\b/.test(q);
    if (!PAID_OUT.test(q) && h('now') && CASH_PAY.test(q) && (howMuch || h('count') || /montant|total|show me|give me|value|اعطني|عطيني|قيمة|المبلغ|مجموع|اجمالي/.test(q))) return { entity: 'cash', agg: 'today' };
    /* « solde espèces du tiroir », « current cash in the register », « شحال
     * كاين دابا فالكيسا »: what the drawer holds now, without « combien ». */
    if (!PAID_OUT.test(q) && /\b(?:register|drawer|tiroir|till)\b|\bf(?:e|i)? ?caisse\b|\ben caisse\b|\bdans (?:la )?caisse\b|الكيسا|الصندوق|الدرج/.test(q)
      && /\b(?:actuel\w*|current\w*|daba|disponible|balance|solde|montant|show|donne|kayn|maintenant)\b|دابا|الحالي|بقي|كاين|كم|شحال/.test(q)
      && /\bcash\b|\bespeces\b|\bliquide\b|\bna9d\b|نقد|فلوس|\bflous\b|كاش|\bkayn\b|كاين/.test(q)
      && !/combien de temps|how long|\btenir\b|survi|شحال من وقت|كم من الوقت|تنفد|نبقي/.test(q)) return { entity: 'cash', agg: 'today' };
    if (howMuch && CASH_BOX.test(q) && !/combien de temps|how long|\btien[st]?\b|\btenir\b|survi|\bdure\b|شحال من وقت|كم من الوقت/.test(q)) return { entity: 'cash', agg: 'today' };
    if (DAYS_W.test(q) && OPENISH.test(q) && WEEK_W.test(q) && (!h('client') || /نستقبل|كنستقبلو|\bkansta9blo\b|\breceive\b|accueill/.test(q)) && !h('sell')) return { entity: 'hours', agg: 'week' };
    if (WEEK_DAYS.test(q) && /semaine|\bweek\b|سيمانة|السيمانة|الاسبوع|اسبوع|\bsimana\b|\bsmana\b|\bssimana\b/.test(q)) return { entity: 'hours', agg: 'week' };
    if (HRS_WORD.test(q) && (h('staff') || WORK_VERB.test(q)) && !h('open') && !h('close') && !/ouverture|opening|الفتح|semaine|\bweek\b|سيمانة|الاسبوع/.test(q)) return { entity: 'staff', agg: 'hours' };
    if (h('staff') && PRESENT.test(q) && h('now') && !h('count')) return { entity: 'staff', agg: 'today' };
    if (h('client') && (VISITED.test(q) || h('who')) && h('now') && !COUNT_OF.test(q) && !h('gone') && !h('top') && !h('spend') && !h('points')) return { entity: 'client', agg: 'today' };
    if ((LAST_VISIT.test(q) || CONTACT.test(q)) && !h('points') && hit()) return { entity: 'client', agg: 'card', contact: CONTACT.test(q) };
    if (!money && !past && (COUNT_OF.test(q) || h('count')) && h('sell') && h('now') && UNIT_WORD.test(q)) return { entity: 'product', agg: 'units' };
    if (REFUND_W.test(q) && (howMuch || COUNT_OF.test(q) || h('who')) && !past && !LATER.test(q)) return { entity: 'refunds', agg: 'today' };
    if (!season && !AIM_DAY.test(q) && BEST_DAY.test(q)) return { entity: 'dayrank', agg: 'best', week: /semaine|\bweek\b|سيمانة|الاسبوع|\bsimana\b/.test(q) };
    if (!season && !AIM_DAY.test(q) && WORST_DAY.test(q)) return { entity: 'dayrank', agg: 'worst', week: /semaine|\bweek\b|سيمانة|الاسبوع|\bsimana\b/.test(q) };
    /* Opening hours. Holidays stay with agent.js's exception route. */
    if (!h('notHours')) {
      /* « on ferme à quelle heure le vendredi »: that day is in the week's grid. */
      if ((h('close') || h('open')) && h('when') && !h('sell') && !h('orders') && WEEKDAY.test(q)) return { entity: 'hours', agg: 'week' };
      if (h('close') && !h('sell') && (h('when') || (h('now') && /fermeture|closing|اغلاق|السد/.test(q)))) return { entity: 'hours', agg: 'close' };
      if (h('open') && !h('orders') && !h('sell') && (h('when') || h('now'))) return { entity: 'hours', agg: 'open' };
    }
    /* One client's points: by name, else agent.js asks which client. */
    if (h('points') && !h('notPoints') && (hit() || !/combien de clients|how many (?:clients|customers)|عدد الزباين|عدد الزبناء|كم زبون|شحال من (?:كليان|زبون)/.test(q))) return { entity: 'client', agg: 'points' };
    if (h('gone') && (h('client') || (PERSON.test(q) && /revien|vient|venu|come|visit|رجع|يجي|كيجي|كيدوز|يزور|rje3|kayjiw|\bjaw/.test(q)))) return { entity: 'client', agg: 'dormant' };
    /* The average ticket, before anything that reads "spend" as a client. */
    /* « معدل الفلوس » is money as a unit, not a profit question. */
    var cashWord = money && !FUTURE.test(q) && !MONEY_TALK.test(q.replace(/فلوس|\bflous\b/g, ' '));
    if ((!money || cashWord) && !season && !past && h('avg') && (h('orders') || /panier|basket|ticket|الباني|السلة|سلة|عملية|مبلغ|قيمة|تذاكر|commande|achat|شراء|البيعة|الفواتير|الفاتورة|vente|\bsale\b|order|depense|spend|كيصرف|ينفق|kayserf|kaykhelles/.test(q))) return { route: h('now') ? 'day' : 'revenue' };
    /* A product the customers take most, even when the sentence names them. */
    if (!season && h('top') && h('sell') && h('item') && !h('spend') && !h('staff')) return { entity: 'product', agg: 'top' };
    if (!season && !money && h('low') && h('sell') && h('item') && !h('spend') && !h('staff')) return { entity: 'product', agg: 'bottom' };
    if (/clients? les plus fideles|most loyal (?:clients|customers)/.test(q)) return { route: 'clients' };
    if (h('client') && (h('top') || h('spend')) && (!h('count') || h('top'))) return { entity: 'client', agg: 'top' };
    if (PERSON.test(q) && h('spend') && h('top') && !h('staff')) return { entity: 'client', agg: 'top' };
    /* The team. "Who sells the most" asks for a person, so it is the team. */
    if (h('top') && !h('client') && !h('notStaffCount') && ((h('staff') && (h('sell') || PERSON.test(q) || /meilleur|\bbest\b|\btop\b|احسن|افضل|\ba7san\b|\bafdal\b/.test(q))) || (h('sell') && PERSON.test(q) && !h('item') && !WHAT.test(q)))) return { entity: 'staff', agg: 'top' };
    if (!h('client') && !h('notStaffCount')) {
      if (h('who') && (STRONG_SHIFT.test(q) || (h('now') && (h('shift') || h('staff'))))) return { entity: 'staff', agg: 'today' };
      if (h('count') && h('staff') && h('now') && h('shift')) return { entity: 'staff', agg: 'today' };
      if (h('staff') && h('count')) return { entity: 'staff', agg: 'count' };
    }
    if (!h('client') && !money && (STRONG_OUT.test(q) || (h('out') && (h('stock') || h('item') || WHAT.test(q))))) return { entity: 'stock', agg: 'out' };
    if (!season && !money && (NEG_SELL.test(q) || (h('low') && h('sell'))) && !h('staff') && !h('client')) return { entity: 'product', agg: 'bottom' };
    if (!season && !money && h('top') && h('sell') && (h('item') || WHAT.test(q)) && !h('staff') && !h('client')) return { entity: 'product', agg: 'top' };
    if (h('top') && h('item') && /numero (?:un|1)|en tete|number one|متصدر|\bbest-?selling\b|\bbestselling\b/.test(q) && !h('client')) return { entity: 'product', agg: 'top' };
    if (!money && !past && COUNT_OF.test(q) && h('orders') && h('now') && !/en cuisine|kitchen|المطبخ|en attente|pending|ouvertes/.test(q)) return { route: 'day' };
    if (h('menuItem') && h('count') && (h('menu') || HAVE.test(q)) && !h('sell') && !h('out') && !h('now')) {
      /* The carte is the menu; « articles », « références », the catalogue are stock. */
      return MENU_WORD.test(q) ? { entity: 'menu', agg: 'count' } : { route: 'stock' };
    }
    if (h('client') && h('count') && !h('now')) return { route: 'clients' };
    if ((!money || cashWord) && !past && h('revenue') && h('month')) return { route: 'revenue' };
    if (!past && h('revenue') && h('now') && !/\b(?:ca|ça) va\b/.test(q)) return { route: 'day' };
    return null;
  }

  /* « combien de plats sur ma carte » — the menu, else the catalogue. */
  var MENU_T = {
    fr: { n: function (n) { return 'Votre carte compte <b>' + fmt(n) + ' article' + (n > 1 ? 's' : '') + '</b>.'; }, none: 'Votre carte est encore vide. Ajoutez vos plats dans la carte et je vous dirai combien elle en compte.' },
    en: { n: function (n) { return 'Your menu has <b>' + fmt(n) + ' item' + (n > 1 ? 's' : '') + '</b>.'; }, none: 'Your menu is still empty. Add your dishes to the menu and I will tell you how many it holds.' },
    ar: { n: function (n) { return 'قائمتك فيها <b>' + fmt(n) + ' صنف</b>.'; }, none: 'قائمتك مازالت فارغة. زيد الأطباق ديالك فالقائمة ونقولك شحال فيها.' },
  };
  function sMenuCount(L) {
    var t = MENU_T[L] || MENU_T.fr;
    var carte = carteItems().filter(function (i) { return i && !i.archived; });
    var rows = carte.length ? carte : catalogProducts().filter(function (p) { return p && !p.archived; });
    if (!rows.length) return { text: t.none, open: open1(L, 'pMenu', 'nav-menu') };
    return {
      text: t.n(rows.length),
      stats: [{ l: tr(L).pMenu, v: rows.slice(0, 5).map(function (r) { return esc(r.name || '·'); }).join(' · '), h: rows.length > 5 ? tr(L).andMore(rows.length - 5) : '' }],
      prov: { mod: carte.length ? 'menu' : 'catalogue', count: rows.length, unit: 'entries' },
      open: open1(L, 'pMenu', 'nav-menu'),
    };
  }

  /* The headcount the model may state: the Équipe roster (27 Nov, a restaurant got a made-up figure). */
  function staffCount() { var n = teamRoster().length; return n || null; }
  /* « combien vend le Café Atlas », « مبيعات مطعم البركة »: another business
   * named, not this one. Its figures are not in Kiwi; the router says so
   * instead of answering with this merchant's own numbers. */
  function otherShop(raw, ownName, nrm) {
    var txt = String(raw || '');
    if (txt === txt.toUpperCase() && /[A-Z]{3}/.test(txt)) return false;
    var n = function (x) { return nrm(String(x || '')).replace(/[’']s\b/g, '').replace(/[^a-z0-9؀-ۿ ]+/g, ' ').trim(); };
    var name = null;
    var nouns = 'cafe|café|resto|restaurant|boutique|magasin|snack|shop|store|salon|patisserie|pâtisserie|epicerie|épicerie|superette|hotel|hôtel'
      .replace(/[a-zéâô]/g, function (c) { return '[' + c + c.toUpperCase() + ']'; });
    var lat = txt.match(new RegExp('(?:^|[^\\p{L}])(?:' + nouns + ')\\s+((?:\\p{Lu}[\\p{L}\'’-]+)(?:\\s+\\p{Lu}[\\p{L}\'’-]+)?)', 'u'));
    if (lat && !/^(?:mon|ma|my|notre|our)$/i.test((txt.slice(0, lat.index + 1).trim().split(/\s+/).pop() || ''))) name = lat[1];
    if (!name) {
      var ar = txt.match(/(?:^|\s)(?:مطعم|مقهى|مقهي|كافيه|كافي|بوتيك|متجر|حانوت|سناك)\s+([^\s؟?،.!]{2,})/);
      var STOP = /^(?:ديال\S*|اليوم|البارح|امس|أمس|هذا|هاد|هادا|في|ف|على|كامل|عندي|الشهر|اللي|لي|جديد\S*|آخر|اخر|ثاني|ثان|تاني|كبير|صغير|واحد|وحدة|اخرى|أخرى|ديالي|ديالنا|ديالك|ديالو|ب|بلا|مع|كيبيع|كتبيع|شحال)$/;
      if (ar && !STOP.test(ar[1].replace(/[\u064b-\u065f]/g, ''))) name = ar[1];
    }
    if (!name) return false;
    var nm = n(name), mine = n(ownName);
    if (!nm || nm.length < 2) return false;
    if (mine && nm.split(' ').some(function (w) { return w.length > 2 && mine.indexOf(w) !== -1; })) return false;
    /* « Café Noir » on the menu is a product, not a café. */
    var items = [];
    try { items = items.concat((window.KiwiMenuStore && window.KiwiMenuStore.items ? window.KiwiMenuStore.items(venueId()) : []) || []); } catch (_) {}
    try { items = items.concat((window.KiwiBoutiqueCatalog && window.KiwiBoutiqueCatalog.listProducts ? window.KiwiBoutiqueCatalog.listProducts() : []) || []); } catch (_) {}
    var full = n(txt);
    if (items.some(function (it) { var k = n(it && it.name); return k && k.indexOf(nm) !== -1 && full.indexOf(k.split(' ')[0]) !== -1; })) return false;
    return true;
  }

  window.KiwiAgentData = { reply: reply, intent: ownIntent, otherShop: otherShop, staffCount: staffCount, _rank: productRanking, _findClient: findClient };
}());
