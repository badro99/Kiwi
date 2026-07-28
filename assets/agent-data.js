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
  var fmt = function (n) { return Math.round(n).toLocaleString('fr-FR'); };
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
      prodTop: function (n, u) { return 'Votre meilleure vente, c’est <b>' + n + '</b> — ' + u + '.'; },
      prodBottom: function (n, u) { return 'Votre article le moins vendu, c’est <b>' + n + '</b> — ' + u + '.'; },
      /* La période nommée dans la phrase — seulement quand la source a su la lire. */
      prodTopP: function (n, u, p) { return 'Votre meilleure vente ' + p + ', c’est <b>' + n + '</b> — ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'Votre article le moins vendu ' + p + ', c’est <b>' + n + '</b> — ' + u + '.'; },
      prodNonePeriod: function (p) { return 'Aucune vente n’est enregistrée ' + p + ', je n’ai donc rien à classer sur cette période. Je ne vais pas vous donner le classement d’une autre journée en faisant comme si c’était celui-là.'; },
      prodPerTill: function (p) { return 'Vous me demandez ' + p + ', et je ne peux pas répondre honnêtement. Le détail par article ne me vient aujourd’hui que du journal de ma caisse, qui ne garde que la journée en cours — il est remis à zéro à minuit. Je sais classer vos articles d’aujourd’hui ; pour une journée passée, il me faudrait le détail des tickets côté serveur.'; },
      prodPerMenu: function (p) { return 'Une réserve : ce classement porte sur les unités du mois telles que votre carte les enregistre, pas sur ' + p + ' — la carte ne date pas ses ventes.'; },
      prodUnits: function (u) { return fmt(u) + ' unité' + (u > 1 ? 's' : ''); },
      prodLines: function (u) { return fmt(u) + ' ligne' + (u > 1 ? 's' : '') + ' de ticket'; },
      colUnits: 'Vendu', colRev: 'Chiffre', colPrice: 'Prix', colMargin: 'Marge unitaire',
      prodRunners: 'Puis, dans l’ordre',
      srcMenu: 'unités du mois, telles que votre carte les porte',
      srcTill: 'lignes de ticket de la journée, lues sur votre caisse',
      srcLines: 'lignes de vos ventes enregistrées',
      prodNoLines: 'Je ne peux pas classer vos articles, et je préfère vous dire exactement pourquoi : votre caisse m’envoie le montant du ticket et un libellé résumé, pas le détail ligne par ligne. Je vois donc ce que chaque vente a rapporté, jamais ce qu’elle contenait. Tant que la caisse et le tableau de bord tournent dans le même navigateur je lis le journal de la caisse — sinon, le détail par article reste dans la caisse elle-même.',
      prodNoCarte: 'Votre carte n’est pas encore saisie, je n’ai donc aucun article à classer. Ajoutez vos produits et leurs prix, et je vous dirai lequel travaille le mieux.',
      prodCarteOnly: function (n) { return 'Votre carte compte <b>' + n + ' article' + (n > 1 ? 's' : '') + '</b>, mais aucune vente n’y est encore rattachée ligne par ligne — je peux vous donner vos prix et vos marges théoriques, pas encore un classement des ventes.'; },
      /* clients */
      cliTop: function (n) { return '<b>' + n + '</b> est votre meilleur client, au montant dépensé.'; },
      cliSpend: 'Dépensé', cliVisits: 'Visites', cliPoints: 'Points', cliLast: 'Dernière venue',
      cliDaysAgo: function (d) { return d === 0 ? 'aujourd’hui' : d === 1 ? 'hier' : 'il y a ' + d + ' jours'; },
      cliRunners: 'Vos suivants',
      cliPerLifetime: function (p) { return 'Une précision : votre carnet retient le cumul de chaque client depuis toujours, pas le détail daté. Ce classement est donc celui de la dépense totale, et non celui de ' + p + '.'; },
      cliPointsOf: function (n, p) { return '<b>' + n + '</b> a <b>' + fmt(p) + ' point' + (p > 1 ? 's' : '') + '</b>.'; },
      cliReward: function (r) { return 'Récompense atteinte : il reste ' + r + ' à offrir.'; },
      cliToGo: function (n) { return 'Encore ' + fmt(n) + ' points avant la prochaine récompense.'; },
      cliNoLoyalty: 'Aucun programme de fidélité n’est actif, les points ne comptent donc pas encore. Vous l’activez dans Clients & Marketing.',
      cliUnknown: function (n) { return 'Je ne trouve personne au nom de « ' + n + ' » dans votre carnet. Vérifiez l’orthographe, ou ouvrez le carnet : je ne devine pas un client que la caisse n’a pas identifié.'; },
      cliWhich: 'De quel client parlez-vous ? Donnez-moi son nom et je vous sors ses points, ses visites et ce qu’il a dépensé.',
      cliNoBook: 'Votre carnet client n’est pas encore actif. Dès que vos clients sont identifiés en caisse (téléphone ou carte de fidélité), je peux vous dire qui revient, qui dépense le plus et combien de points chacun a.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + '</b> ne ' + (n > 1 ? 'sont' : 'est') + ' pas revenu' + (n > 1 ? 's' : '') + ' depuis plus de 30 jours.'; },
      cliDormantNone: 'Aucun client endormi : tous ceux que vous avez identifiés sont revenus dans les 30 derniers jours.',
      cliDormantNote: 'Rappeler un client qui vous connaît coûte bien moins cher que d’en trouver un nouveau.',
      /* équipe */
      staffCount: function (n) { return 'Votre équipe compte <b>' + fmt(n) + ' personne' + (n > 1 ? 's' : '') + '</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' personne' + (n > 1 ? 's' : '') + '</b> sur le service aujourd’hui.' : 'Personne n’est planifié aujourd’hui — ou les horaires du jour ne sont pas encore saisis.'; },
      staffNone: 'Votre équipe n’est pas encore saisie. Ajoutez vos salariés dans Équipe et je vous donne les effectifs, les rôles et qui est de service.',
      colRole: 'Rôles', colToday: 'Aujourd’hui',
      staffTop: 'Je ne peux pas désigner votre meilleur vendeur : aucune vente qui arrive sur cet écran ne porte qui l’a encaissée. Vous pouvez l’obtenir, en revanche — donnez à chaque salarié son propre code en caisse, et Transactions répartit alors le chiffre par personne. En attendant, voici votre équipe telle qu’elle est saisie.',
      /* stock */
      stkOut: function (n) { return '<b>' + fmt(n) + ' référence' + (n > 1 ? 's sont' : ' est') + ' en rupture</b>.'; },
      stkNone: 'Aucune rupture : tout ce que vous suivez est en stock.',
      stkLow: 'Sous le seuil', stkOutCol: 'En rupture',
      stkNoCatalog: 'Je n’ai pas encore de catalogue pour votre établissement. Saisissez vos articles et vos quantités dans Stock, et je vous donne les ruptures, les stocks bas et la valeur immobilisée.',
      andMore: function (n) { return '+ ' + n + ' autre' + (n > 1 ? 's' : ''); },
      pHours: 'les horaires',
      hrUnset: 'Vos horaires d’ouverture ne sont pas renseignés, et je ne vais pas les deviner : un horaire inventé, sur l’air de « un restaurant, ça ferme sûrement en soirée », se retrouverait dans vos réservations et vos commandes en ligne. Renseignez votre semaine dans Réglages → Heures d’ouverture, et je réponds ensuite sur l’ouverture, la fermeture et les créneaux réservables.',
      hrOpen: function (h) { return 'Oui, vous êtes <b>ouvert</b> — jusqu’à <b>' + h + '</b>.'; },
      hrOpen24: 'Oui, vous êtes <b>ouvert</b> — 24 h/24 aujourd’hui.',
      hrShut: function (s) { return 'Non, vous êtes <b>fermé</b> en ce moment. ' + s + '.'; },
      hrCloseAt: function (h) { return 'Vous fermez à <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'Vous êtes fermé en ce moment. La prochaine fermeture est ' + d + ' à <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? 'Il reste <b>' + Math.floor(n / 60) + ' h ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> avant la fermeture.' : 'Il reste <b>' + n + ' min</b> avant la fermeture.'; },
      hrUntilShut: 'Vous êtes déjà fermé, il n’y a pas de compte à rebours.',
      hrAtOk: function (d, h) { return 'Oui — ' + d + ' à ' + h + ', vous êtes ouvert.'; },
      hrAtNo: function (d, h, s) { return 'Non — ' + d + ' à ' + h + ', vous êtes fermé. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b> : ' + r + (p ? ' · ' + p : ' · fermé'); },
      hrExcNone: 'Aucune période exceptionnelle n’est enregistrée — ni Ramadan, ni Aïd, ni congés. Votre semaine type s’applique toute l’année. Vous en ajoutez une dans Réglages → Heures d’ouverture.',
      hrWeekCol: 'Semaine', hrTodayCol: 'Aujourd’hui', hrNextCol: 'Prochaine ouverture',
      hrSrc: 'horaires de l’établissement',
    },
    en: {
      openBtn: function (x) { return 'Open ' + x; },
      pMenu: 'the menu', pClients: 'the client book', pTeam: 'the team', pStock: 'stock',
      prodTop: function (n, u) { return 'Your best seller is <b>' + n + '</b> — ' + u + '.'; },
      prodBottom: function (n, u) { return 'Your slowest item is <b>' + n + '</b> — ' + u + '.'; },
      prodTopP: function (n, u, p) { return 'Your best seller ' + p + ' is <b>' + n + '</b> — ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'Your slowest item ' + p + ' is <b>' + n + '</b> — ' + u + '.'; },
      prodNonePeriod: function (p) { return 'No sale is recorded for ' + p + ', so there is nothing to rank over that period. I am not going to hand you another day’s ranking and let it pass for this one.'; },
      prodPerTill: function (p) { return 'You are asking about ' + p + ', and I cannot answer that honestly. Item-level detail reaches me only through my till journal, which keeps the current day and is cleared at midnight. I can rank today’s items; for a past day I would need the ticket lines from the server.'; },
      prodPerMenu: function (p) { return 'One caveat: this ranking is the month’s units as your menu records them, not ' + p + ' — the menu does not date its sales.'; },
      prodUnits: function (u) { return fmt(u) + ' unit' + (u > 1 ? 's' : ''); },
      prodLines: function (u) { return fmt(u) + ' ticket line' + (u > 1 ? 's' : ''); },
      colUnits: 'Sold', colRev: 'Revenue', colPrice: 'Price', colMargin: 'Unit margin',
      prodRunners: 'Then, in order',
      srcMenu: 'units this month, as your menu holds them',
      srcTill: 'today’s ticket lines, read from your till',
      srcLines: 'lines from your recorded sales',
      prodNoLines: 'I can’t rank your items, and I’d rather tell you exactly why: your till sends me the ticket total and a summary label, not the line-by-line detail. So I see what each sale earned, never what it contained. While the till and the dashboard run in the same browser I read the till’s own journal — otherwise the per-item detail stays inside the till.',
      prodNoCarte: 'Your menu isn’t entered yet, so I have no items to rank. Add your products and their prices and I’ll tell you which one works hardest.',
      prodCarteOnly: function (n) { return 'Your menu holds <b>' + n + ' item' + (n > 1 ? 's' : '') + '</b>, but no sale is attached to them line by line yet — I can give you prices and theoretical margins, not a sales ranking.'; },
      cliTop: function (n) { return '<b>' + n + '</b> is your best client, by amount spent.'; },
      cliSpend: 'Spent', cliVisits: 'Visits', cliPoints: 'Points', cliLast: 'Last seen',
      cliDaysAgo: function (d) { return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; },
      cliRunners: 'Next up',
      cliPerLifetime: function (p) { return 'One precision: your book keeps each client’s lifetime total, not a dated history. So this ranking is total spend, not ' + p + '.'; },
      cliPointsOf: function (n, p) { return '<b>' + n + '</b> has <b>' + fmt(p) + ' point' + (p > 1 ? 's' : '') + '</b>.'; },
      cliReward: function (r) { return 'Reward reached: ' + r + ' is owed.'; },
      cliToGo: function (n) { return fmt(n) + ' more points before the next reward.'; },
      cliNoLoyalty: 'No loyalty programme is active, so points aren’t counting yet. You turn it on in Clients & Marketing.',
      cliUnknown: function (n) { return 'I can’t find anyone called “' + n + '” in your book. Check the spelling, or open the book: I won’t guess at a client the till never identified.'; },
      cliWhich: 'Which client do you mean? Give me the name and I’ll pull their points, visits and spend.',
      cliNoBook: 'Your client book isn’t active yet. Once clients are identified at the till (phone or loyalty card), I can tell you who comes back, who spends most and how many points each one has.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' client' + (n > 1 ? 's' : '') + '</b> ha' + (n > 1 ? 've' : 's') + ' not been back in over 30 days.'; },
      cliDormantNone: 'No dormant clients: everyone you’ve identified has been back within 30 days.',
      cliDormantNote: 'Waking a client who already knows you costs far less than finding a new one.',
      staffCount: function (n) { return 'Your team has <b>' + fmt(n) + ' member' + (n > 1 ? 's' : '') + '</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' ' + (n > 1 ? 'people' : 'person') + '</b> on shift today.' : 'Nobody is scheduled today — or today’s hours aren’t entered yet.'; },
      staffNone: 'Your team isn’t entered yet. Add your staff under Team and I’ll give you headcount, roles and who is on shift.',
      colRole: 'Roles', colToday: 'Today',
      staffTop: 'I can’t name your best seller: no sale reaching this screen carries who rang it up. You can get it though — give each employee their own till code, and Transactions then splits revenue by person. Meanwhile, here is your team as entered.',
      stkOut: function (n) { return '<b>' + fmt(n) + ' item' + (n > 1 ? 's are' : ' is') + ' out of stock</b>.'; },
      stkNone: 'No stock-outs: everything you track is in stock.',
      stkLow: 'Below reorder', stkOutCol: 'Out of stock',
      stkNoCatalog: 'I have no catalogue for your venue yet. Enter your items and quantities under Stock and I’ll give you stock-outs, low stock and tied-up value.',
      andMore: function (n) { return '+ ' + n + ' more'; },
      pHours: 'opening hours',
      hrUnset: 'Your opening hours aren’t set, and I’m not going to guess them: hours invented on the theory that “a restaurant probably closes in the evening” would end up in your bookings and your online orders. Fill in your week under Settings → Opening hours, and I’ll answer on opening, closing and bookable slots after that.',
      hrOpen: function (h) { return 'Yes, you are <b>open</b> — until <b>' + h + '</b>.'; },
      hrOpen24: 'Yes, you are <b>open</b> — 24 hours today.',
      hrShut: function (s) { return 'No, you are <b>closed</b> right now. ' + s + '.'; },
      hrCloseAt: function (h) { return 'You close at <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'You are closed right now. The next closing is ' + d + ' at <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? '<b>' + Math.floor(n / 60) + 'h ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> left before closing.' : '<b>' + n + ' min</b> left before closing.'; },
      hrUntilShut: 'You are already closed — there is no countdown.',
      hrAtOk: function (d, h) { return 'Yes — ' + d + ' at ' + h + ', you are open.'; },
      hrAtNo: function (d, h, s) { return 'No — ' + d + ' at ' + h + ', you are closed. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b>: ' + r + (p ? ' · ' + p : ' · closed'); },
      hrExcNone: 'No exceptional period is on file — no Ramadan, no Eid, no leave. Your weekly schedule applies all year. You add one under Settings → Opening hours.',
      hrWeekCol: 'Week', hrTodayCol: 'Today', hrNextCol: 'Next opening',
      hrSrc: 'business opening hours',
    },
    ar: {
      openBtn: function (x) { return 'افتح ' + x; },
      pMenu: 'القائمة', pClients: 'سجلّ الزبناء', pTeam: 'الفريق', pStock: 'المخزون',
      prodTop: function (n, u) { return 'أكثر ما تبيعه هو <b>' + n + '</b> — ' + u + '.'; },
      prodBottom: function (n, u) { return 'أقل ما تبيعه هو <b>' + n + '</b> — ' + u + '.'; },
      prodTopP: function (n, u, p) { return 'أكثر ما تبيعه ' + p + ' هو <b>' + n + '</b> — ' + u + '.'; },
      prodBottomP: function (n, u, p) { return 'أقل ما تبيعه ' + p + ' هو <b>' + n + '</b> — ' + u + '.'; },
      prodNonePeriod: function (p) { return 'لا توجد أي مبيعة مسجّلة ' + p + '، فلا شيء أرتّبه في هذه الفترة. ولن أعطيك ترتيب يوم آخر وكأنه ترتيب هذا اليوم.'; },
      prodPerTill: function (p) { return 'تسألني عن ' + p + '، ولا أستطيع الجواب بأمانة. تفصيل الأصناف لا يصلني اليوم إلا من سجلّ الصندوق، وهو لا يحتفظ إلا باليوم الجاري ويُمسح عند منتصف الليل. أستطيع ترتيب أصناف اليوم؛ أما يوم مضى فأحتاج تفاصيل التذاكر من الخادم.'; },
      prodPerMenu: function (p) { return 'تحفّظ واحد: هذا الترتيب يخصّ وحدات الشهر كما تسجّلها لائحتك، لا ' + p + ' — اللائحة لا تؤرّخ مبيعاتها.'; },
      prodUnits: function (u) { return fmt(u) + ' وحدة'; },
      prodLines: function (u) { return fmt(u) + ' سطر بيع'; },
      colUnits: 'المُباع', colRev: 'المداخيل', colPrice: 'الثمن', colMargin: 'هامش الوحدة',
      prodRunners: 'ثم بالترتيب',
      srcMenu: 'وحدات الشهر كما تحملها قائمتك',
      srcTill: 'أسطر تذاكر اليوم، مقروءة من صندوقك',
      srcLines: 'أسطر مبيعاتك المسجّلة',
      prodNoLines: 'لا أستطيع ترتيب أصنافك، وأفضّل أن أقول لك السبب بدقّة: صندوقك يرسل لي مجموع التذكرة وعنواناً مختصراً، لا التفصيل سطراً سطراً. فأنا أرى ما جنته كل عملية بيع، لا ما احتوته. وما دام الصندوق ولوحة القيادة يشتغلان في نفس المتصفّح أقرأ سجلّ الصندوق — وإلا بقي التفصيل داخل الصندوق نفسه.',
      prodNoCarte: 'قائمتك غير مُدخلة بعد، فلا أصناف لأرتّبها. أضف منتجاتك وأثمانها وسأقول لك أيّها يشتغل أكثر.',
      prodCarteOnly: function (n) { return 'قائمتك تضمّ <b>' + n + ' صنفاً</b>، لكن لا عملية بيع مرتبطة بها سطراً سطراً بعد — أعطيك الأثمان والهوامش النظرية، لا ترتيب المبيعات.'; },
      cliTop: function (n) { return '<b>' + n + '</b> هو أفضل زبون لديك، من حيث ما أنفقه.'; },
      cliSpend: 'أنفق', cliVisits: 'الزيارات', cliPoints: 'النقاط', cliLast: 'آخر زيارة',
      cliDaysAgo: function (d) { return d === 0 ? 'اليوم' : d === 1 ? 'أمس' : 'قبل ' + d + ' يوماً'; },
      cliRunners: 'ثم يليه',
      cliPerLifetime: function (p) { return 'توضيح: دفترك يحتفظ بمجموع كل زبون منذ البداية، لا بسجلّ مؤرَّخ. فهذا الترتيب هو ترتيب الإنفاق الإجمالي، لا ترتيب ' + p + '.'; },
      cliPointsOf: function (n, p) { return 'لدى <b>' + n + '</b> <b>' + fmt(p) + ' نقطة</b>.'; },
      cliReward: function (r) { return 'بلغ المكافأة: ' + r + ' مستحقّة.'; },
      cliToGo: function (n) { return 'بقيت ' + fmt(n) + ' نقطة قبل المكافأة التالية.'; },
      cliNoLoyalty: 'لا برنامج وفاء مفعّل، فالنقاط لا تُحتسب بعد. تفعّله من Clients & Marketing.',
      cliUnknown: function (n) { return 'لا أجد أحداً باسم «' + n + '» في سجلّك. تحقّق من الكتابة أو افتح السجلّ: لا أخمّن زبوناً لم يعرّفه الصندوق.'; },
      cliWhich: 'عن أي زبون تتحدّث؟ أعطني اسمه وأخرج لك نقاطه وزياراته وما أنفقه.',
      cliNoBook: 'سجلّ زبنائك غير مفعّل بعد. بمجرد تعريف الزبناء في الصندوق (هاتف أو بطاقة وفاء)، أقول لك من يعود ومن ينفق أكثر وكم نقطة لكل واحد.',
      cliDormant: function (n) { return '<b>' + fmt(n) + ' زبوناً</b> لم يعد منذ أكثر من 30 يوماً.'; },
      cliDormantNone: 'لا زبون نائم: كل من عرّفته عاد خلال 30 يوماً.',
      cliDormantNote: 'إيقاظ زبون يعرفك أرخص بكثير من إيجاد زبون جديد.',
      staffCount: function (n) { return 'فريقك يضمّ <b>' + fmt(n) + ' شخصاً</b>.'; },
      staffToday: function (n) { return n ? '<b>' + fmt(n) + ' أشخاص</b> في الخدمة اليوم.' : 'لا أحد مبرمج اليوم — أو أن توقيت اليوم غير مُدخل بعد.'; },
      staffNone: 'فريقك غير مُدخل بعد. أضف مستخدميك في «الفريق» وأعطيك العدد والأدوار ومن هو في الخدمة.',
      colRole: 'الأدوار', colToday: 'اليوم',
      staffTop: 'لا أستطيع تسمية أفضل بائع لديك: لا عملية بيع تصل هذه الشاشة تحمل من قام بها. لكن يمكنك الحصول على ذلك — امنح كل مستخدم رمزه الخاص في الصندوق، عندها توزّع صفحة «الطلبات» الرقم على الأشخاص. في انتظار ذلك، هذا فريقك كما هو مُدخل.',
      stkOut: function (n) { return '<b>' + fmt(n) + ' صنفاً في النفاد</b>.'; },
      stkNone: 'لا نفاد: كل ما تتابعه متوفّر.',
      stkLow: 'تحت العتبة', stkOutCol: 'نافد',
      stkNoCatalog: 'ليس لديّ كتالوج لمحلّك بعد. أدخل أصنافك وكمياتك في «المخزون» وأعطيك النفاد والمخزون المنخفض والقيمة المجمّدة.',
      andMore: function (n) { return '+ ' + n + ' آخر'; },
      pHours: 'ساعات العمل',
      hrUnset: 'ساعات عملك غير مُدخلة، ولن أخمّنها: توقيت مُختلق لمطعم «يغلق غالبًا نحو الحادية عشرة» سينتهي به الأمر في حجوزاتك وطلباتك على الإنترنت. أدخل أسبوعك في الإعدادات ← ساعات العمل، وبعدها أجيبك عن الفتح والإغلاق والمواعيد المتاحة.',
      hrOpen: function (h) { return 'نعم، أنت <b>مفتوح</b> — حتى <b>' + h + '</b>.'; },
      hrOpen24: 'نعم، أنت <b>مفتوح</b> — 24 ساعة اليوم.',
      hrShut: function (s) { return 'لا، أنت <b>مغلق</b> الآن. ' + s + '.'; },
      hrCloseAt: function (h) { return 'تغلق في <b>' + h + '</b>.'; },
      hrCloseNext: function (d, h) { return 'أنت مغلق الآن. الإغلاق القادم ' + d + ' في <b>' + h + '</b>.'; },
      hrUntil: function (n) { return n >= 60 ? 'بقيت <b>' + Math.floor(n / 60) + ' س ' + (n % 60 ? String(n % 60).padStart(2, '0') : '') + '</b> قبل الإغلاق.' : 'بقيت <b>' + n + ' د</b> قبل الإغلاق.'; },
      hrUntilShut: 'أنت مغلق أصلًا، فلا عدّ تنازلي.',
      hrAtOk: function (d, h) { return 'نعم — ' + d + ' في ' + h + '، أنت مفتوح.'; },
      hrAtNo: function (d, h, s) { return 'لا — ' + d + ' في ' + h + '، أنت مغلق. ' + s + '.'; },
      hrExc: function (l, r, p) { return '<b>' + l + '</b>: ' + r + (p ? ' · ' + p : ' · مغلق'); },
      hrExcNone: 'لا فترة استثنائية مسجّلة — لا رمضان ولا عيد ولا عطلة. أسبوعك المعتاد يسري طوال السنة. تضيف واحدة من الإعدادات ← ساعات العمل.',
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

  function findClient(q) {
    var book = clientBook();
    if (!book.length) return { book: book, hit: null };
    var nq = ' ' + norm(q) + ' ';
    var best = null;
    book.forEach(function (c) {
      var full = norm(c.name);
      if (!full) return;
      if (full.length >= 4 && nq.indexOf(full) !== -1) { if (!best || full.length > norm(best.name).length) best = c; return; }
      full.split(' ').forEach(function (part) {
        if (part.length >= 4 && nq.indexOf(' ' + part + ' ') !== -1 && !best) best = c;
      });
    });
    return { book: book, hit: best };
  }

  function sClientTop(spec, L) {
    var t = tr(L);
    var book = clientBook();
    if (!book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'nav-clients') };
    var sorted = book.slice().sort(function (a, b) { return (+b.spend || 0) - (+a.spend || 0); });
    var c = sorted[0];
    if (!(+c.spend > 0)) return { text: t.cliNoBook, open: open1(L, 'pClients', 'nav-clients') };
    var d = daysSince(c.lastSeen);
    var others = sorted.slice(1, 4);
    var stats = [
      { l: t.cliSpend, v: fmtMad(+c.spend || 0), h: '' },
      { l: t.cliVisits, v: fmt(+c.visits || 0), h: '' },
      { l: t.cliPoints, v: fmt(+c.points || 0), h: '' },
      { l: t.cliLast, v: d == null ? '—' : t.cliDaysAgo(d), h: '' },
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
      open: open1(L, 'pClients', 'nav-clients'),
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
    if (!f.book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'nav-clients') };
    if (!f.hit) return { text: t.cliWhich, open: open1(L, 'pClients', 'nav-clients') };
    var c = f.hit;
    var cfg = null;
    try { cfg = window.KiwiClients.config ? window.KiwiClients.config() : null; } catch (_) { cfg = null; }
    var pts = +c.points || 0;
    var thr = cfg && +cfg.threshold ? +cfg.threshold : 0;
    var d = daysSince(c.lastSeen);
    var r = {
      text: t.cliPointsOf(esc(c.name), pts),
      stats: [
        { l: t.cliPoints, v: fmt(pts), h: '' },
        { l: t.cliVisits, v: fmt(+c.visits || 0), h: '' },
        { l: t.cliSpend, v: fmtMad(+c.spend || 0), h: '' },
        { l: t.cliLast, v: d == null ? '—' : t.cliDaysAgo(d), h: '' },
      ],
      prov: { mod: 'clients', count: f.book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'nav-clients'),
    };
    if (!cfg || !cfg.on) r.note = t.cliNoLoyalty;
    else if (thr > 0) {
      r.verdict = pts >= thr
        ? { tone: 'good', text: t.cliReward(esc((cfg && cfg.reward) || '')) }
        : { tone: 'warn', text: t.cliToGo(thr - pts) };
    }
    return r;
  }

  function sClientDormant(L) {
    var t = tr(L);
    var book = clientBook();
    if (!book.length) return { text: t.cliNoBook, open: open1(L, 'pClients', 'nav-clients') };
    var sleep = book.filter(function (c) { var d = daysSince(c.lastSeen); return d != null && d > 30; })
      .sort(function (a, b) { return (+b.spend || 0) - (+a.spend || 0); });
    if (!sleep.length) return { text: t.cliDormantNone, open: open1(L, 'pClients', 'nav-clients') };
    var top = sleep.slice(0, 4);
    return {
      text: t.cliDormant(sleep.length),
      stats: top.map(function (c) {
        return { l: esc(c.name), v: fmtMad(+c.spend || 0), h: t.cliDaysAgo(daysSince(c.lastSeen)) };
      }).concat(sleep.length > top.length ? [{ l: t.andMore(sleep.length - top.length), v: '—', h: '' }] : []),
      note: t.cliDormantNote,
      prov: { mod: 'clients', count: book.length, unit: 'entries' },
      open: open1(L, 'pClients', 'nav-clients'),
    };
  }

  /* ═══════════ équipe ═══════════ */
  function sStaff(spec, L) {
    var t = tr(L);
    var team = teamRoster();
    if (!team.length) return { text: t.staffNone, open: open1(L, 'pTeam', 'nav-equipe') };
    var onToday = team.filter(function (m) { return m && (m.today || m.onShift || m.hoursToday > 0); });
    var roles = {};
    team.forEach(function (m) { var r = (m && m.role) || '—'; roles[r] = (roles[r] || 0) + 1; });
    var roleTxt = Object.keys(roles).slice(0, 4).map(function (r) { return esc(r) + ' ×' + roles[r]; }).join(' · ');
    if (spec.agg === 'top') {
      return {
        text: t.staffTop,
        stats: [
          { l: t.colRole, v: roleTxt || '—', h: '' },
          { l: t.colToday, v: fmt(onToday.length), h: '' },
        ],
        prov: { mod: 'team', count: team.length, unit: 'entries' },
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    if (spec.agg === 'today') {
      return {
        text: t.staffToday(onToday.length),
        stats: onToday.slice(0, 5).map(function (m) { return { l: esc(m.name), v: esc(m.role || '—'), h: '' }; }),
        prov: { mod: 'team', count: team.length, unit: 'entries' },
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    return {
      text: t.staffCount(team.length),
      stats: [
        { l: t.colRole, v: roleTxt || '—', h: '' },
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
    if (out.length > 4) stats.push({ l: t.andMore(out.length - 4), v: '—', h: '' });
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
    var hhmm = function (ms) {
      var d = new Date(ms);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    };
    var sum = function (ts) { return KH.summary(ts || now, undefined, L).text; };
    var prov = { mod: t.hrSrc, count: 7, unit: 'days' };
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
          var dayL = KH.dayLabel(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(nxt.closesAt).getDay()], L);
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
        return { l: esc(e.label || '—'), v: e.from === e.to ? e.from : e.from + ' → ' + e.to, h: per };
      });
      var first = xs[0];
      return {
        text: t.hrExc(esc(first.label || '—'),
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

  /* ═══════════ point d'entrée ═══════════
   * agent.js décide de la route et passe le spec ; ici on ne fait que lire. */
  function reply(spec, L) {
    if (!spec || !spec.entity) return null;
    L = (L === 'en' || L === 'ar') ? L : 'fr';
    try {
      if (spec.entity === 'product') return sProduct(spec, L);
      if (spec.entity === 'client') {
        if (spec.agg === 'points') return sClientPoints(spec, L);
        if (spec.agg === 'dormant') return sClientDormant(L);
        return sClientTop(spec, L);
      }
      if (spec.entity === 'staff') return sStaff(spec, L);
      if (spec.entity === 'stock') return sStockOut(L);
      if (spec.entity === 'hours') return sHours(spec, L);
    } catch (_) { return null; }
    return null;
  }

  window.KiwiAgentData = { reply: reply, _rank: productRanking, _findClient: findClient };
}());
