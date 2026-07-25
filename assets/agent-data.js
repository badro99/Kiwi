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
   * même navigateur — le cas du commerçant à une seule machine. C'est le SEUL
   * endroit où les lignes de ticket existent aujourd'hui : le pont Live Link
   * n'envoie que le total et un libellé résumé ("Pain +3 art."). */
  function tillRows() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('kiwi:posDay:') !== 0) continue;
        var rows = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(rows)) out = out.concat(rows);
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
    },
    en: {
      openBtn: function (x) { return 'Open ' + x; },
      pMenu: 'the menu', pClients: 'the client book', pTeam: 'the team', pStock: 'stock',
      prodTop: function (n, u) { return 'Your best seller is <b>' + n + '</b> — ' + u + '.'; },
      prodBottom: function (n, u) { return 'Your slowest item is <b>' + n + '</b> — ' + u + '.'; },
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
    },
    ar: {
      openBtn: function (x) { return 'افتح ' + x; },
      pMenu: 'القائمة', pClients: 'سجلّ الزبناء', pTeam: 'الفريق', pStock: 'المخزون',
      prodTop: function (n, u) { return 'أكثر ما تبيعه هو <b>' + n + '</b> — ' + u + '.'; },
      prodBottom: function (n, u) { return 'أقل ما تبيعه هو <b>' + n + '</b> — ' + u + '.'; },
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
   * Aucune des trois ⇒ on dit ce qui manque, on n'invente pas un classement. */
  function productRanking() {
    var by = {}, n = 0;
    var add = function (name, qty, total) {
      var k = norm(name);
      if (!k) return;
      if (!by[k]) { by[k] = { name: String(name), units: 0, revenue: 0 }; }
      by[k].units += qty; by[k].revenue += total; n++;
    };
    salesRows().forEach(function (e) {
      if (!e || !Array.isArray(e.lines)) return;
      e.lines.forEach(function (l) { add(l && l.name, +(l && l.qty) || 1, +(l && l.total) || 0); });
    });
    if (n) return { src: 'lines', rows: rank(by) };

    (isRealVenue() ? tillRows() : []).forEach(function (e) {
      if (!e || !Array.isArray(e.lines)) return;
      e.lines.forEach(function (l) { add(l && l.name, +(l && l.qty) || 1, +(l && l.total) || 0); });
    });
    if (n) return { src: 'till', rows: rank(by) };

    if (!isRealVenue()) {
      var menu = demoMenu().filter(function (i) { return i && +i.units > 0; });
      if (menu.length) {
        return {
          src: 'menu',
          rows: menu.map(function (i) {
            return { name: i.name, units: +i.units, revenue: +i.units * (+i.price || 0), price: +i.price || 0, cost: +i.cost || 0 };
          }).sort(function (a, b) { return b.units - a.units; }),
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
    var r = productRanking();
    if (!r) {
      var carte = carteItems().length || catalogProducts().length;
      if (!carte) return { text: t.prodNoCarte, open: open1(L, 'pMenu', 'nav-menu') };
      /* La carte existe, les ventes ne portent pas le détail : dire laquelle
       * des deux manque, pas un « je ne sais pas » indifférencié. */
      return { text: t.prodCarteOnly(carte), note: t.prodNoLines, open: open1(L, 'pMenu', 'nav-menu') };
    }
    var rows = r.rows;
    if (!rows.length) return { text: t.prodNoCarte, open: open1(L, 'pMenu', 'nav-menu') };
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
    return {
      text: (bottom ? t.prodBottom : t.prodTop)(esc(pick.name), unitTxt),
      stats: stats,
      open: open1(L, 'pMenu', 'nav-menu'),
    };
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

  function sClientTop(L) {
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
    return { text: t.cliTop(esc(c.name)), stats: stats, open: open1(L, 'pClients', 'nav-clients') };
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
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    if (spec.agg === 'today') {
      return {
        text: t.staffToday(onToday.length),
        stats: onToday.slice(0, 5).map(function (m) { return { l: esc(m.name), v: esc(m.role || '—'), h: '' }; }),
        open: open1(L, 'pTeam', 'nav-equipe'),
      };
    }
    return {
      text: t.staffCount(team.length),
      stats: [
        { l: t.colRole, v: roleTxt || '—', h: '' },
        { l: t.colToday, v: fmt(onToday.length), h: '' },
      ],
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
    return { text: out.length ? t.stkOut(out.length) : t.stkNone, stats: stats, open: open1(L, 'pStock', 'nav-stock') };
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
        return sClientTop(L);
      }
      if (spec.entity === 'staff') return sStaff(spec, L);
      if (spec.entity === 'stock') return sStockOut(L);
    } catch (_) { return null; }
    return null;
  }

  window.KiwiAgentData = { reply: reply, _rank: productRanking, _findClient: findClient };
}());
