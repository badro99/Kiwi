/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES DROITS DE L'ÉQUIPE · window.KiwiPermCatalog
 * ---------------------------------------------------------------------------
 * Une seule liste, trois lecteurs :
 *   - functions/api/_permissions.js l'importe et décide, côté serveur ;
 *   - le tableau de bord (assets/pages-pro/staff-permissions.js) l'affiche ;
 *   - la caisse (assets/staff-perms-till.js) demande le code d'un responsable
 *     avant un geste que la personne en poste n'a pas le droit de faire.
 *
 * Chaque droit dit honnêtement OÙ il est tenu (`check`, `at`) :
 *   check 'server'  : le serveur refuse la requête sans le droit ;
 *   check 'journal' : le geste a déjà eu lieu (remise encaissée, espèces
 *                     sorties) : le serveur l'enregistre et l'inscrit au
 *                     journal du patron, il ne le défait pas ;
 *   check 'till'    : seule la caisse le demande (le serveur ne voit pas le
 *                     geste) ;
 *   at 'office' (tableau de bord), 'till' (caisse) ou 'both'.
 * tools/staff-permissions-test.mjs prouve chaque 'server' et chaque 'journal'
 * contre la vraie route.
 *
 * Rien ici ne s'applique tant que le propriétaire n'a pas ACTIVÉ les droits
 * (functions/api/permissions.js › activate) : l'activation montre, personne
 * par personne, ce qui change par rapport à aujourd'hui, et chacun peut garder
 * exactement ses droits d'aujourd'hui. Les rôles par défaut ci-dessous sont des
 * propositions, pas une copie des règles d'avant.
 *
 * Le rôle « propriétaire » n'est jamais tiré d'un intitulé de poste : il
 * appartient au seul compte du propriétaire (sa session du tableau de bord).
 * Un code de caisse intitulé « Propriétaire » a le rôle Manager, plus ce que
 * le propriétaire lui donne.
 *
 * Pur : ni navigateur, ni base, ni horloge.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiPermCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* `can` : la forme verbale du résumé en clair. `see` : pour un droit de
     lecture, ce qu'on ne voit pas sans lui. L'arabe est écrit en darija. */
  var GROUPS = [
    { id: 'sales', icon: 'point_of_sale', fr: 'Ventes', en: 'Sales', ar: 'البيع', perms: [
      { id: 'sales.discount', check: 'journal', at: 'till', fr: 'Remise au-delà du seuil libre', en: 'Discount above the free limit', ar: 'يدير تخفيض فوق الحد',
        can: { fr: 'faire une remise au-delà du seuil', en: 'give a discount above the limit', ar: 'يدير تخفيض فوق الحد' } },
      { id: 'sales.refund', check: 'server', at: 'till', fr: 'Rembourser un client', en: 'Refund a customer', ar: 'يرجّع الفلوس للكليان',
        can: { fr: 'rembourser un client', en: 'refund a customer', ar: 'يرجّع الفلوس للكليان' } },
      { id: 'sales.cancel', check: 'server', at: 'both', fr: 'Annuler une vente encaissée', en: 'Cancel a completed sale', ar: 'يلغي بيعة تخلّصات',
        can: { fr: 'annuler une vente encaissée', en: 'cancel a completed sale', ar: 'يلغي بيعة تخلّصات' } },
      { id: 'sales.reopen', check: 'server', at: 'till', fr: 'Rouvrir une vente sur une table', en: 'Reopen a sale on a table', ar: 'يعاود يحلّ بيعة على طابلة',
        can: { fr: 'rouvrir une vente', en: 'reopen a sale', ar: 'يعاود يحلّ بيعة' } },
      { id: 'sales.drawer', check: 'journal', at: 'till', fr: 'Ouvrir le tiroir sans vente', en: 'Open the drawer without a sale', ar: 'يحلّ الكاشية بلا بيع',
        can: { fr: 'ouvrir le tiroir sans vente', en: 'open the drawer without a sale', ar: 'يحلّ الكاشية بلا بيع' } },
      { id: 'sales.price', check: 'till', at: 'till', fr: 'Changer un prix à la caisse', en: 'Change a price at the till', ar: 'يبدّل الثمن فالصندوق',
        can: { fr: 'changer un prix à la caisse', en: 'change a price at the till', ar: 'يبدّل الثمن فالصندوق' } },
      { id: 'sales.void-sent', check: 'till', at: 'till', fr: 'Retirer un article déjà envoyé en cuisine', en: 'Remove an item already sent to the kitchen', ar: 'يحيّد طلب مشا للكوزينة',
        can: { fr: 'retirer un article déjà envoyé en cuisine', en: 'remove an item already sent to the kitchen', ar: 'يحيّد طلب مشا للكوزينة' } },
    ] },
    { id: 'stock', icon: 'inventory_2', fr: 'Stock', en: 'Stock', ar: 'السلعة', perms: [
      { id: 'stock.adjust', check: 'server', at: 'both', fr: 'Corriger le stock (perte, casse)', en: 'Adjust stock (loss, breakage)', ar: 'يصحّح السلعة (ضاعت، تهرّسات)',
        can: { fr: 'corriger le stock', en: 'adjust stock', ar: 'يصحّح السلعة' } },
      { id: 'stock.count', check: 'server', at: 'office', fr: 'Faire un inventaire', en: 'Count stock', ar: 'يدير الجرد',
        can: { fr: 'faire un inventaire', en: 'count stock', ar: 'يدير الجرد' } },
      { id: 'stock.value', check: 'server', at: 'office', fr: 'Voir les coûts et la valeur du stock', en: 'See costs and stock value', ar: 'يشوف الكلفة وشحال كتسوى السلعة',
        can: { fr: 'voir les coûts du stock', en: 'see stock costs', ar: 'يشوف الكلفة ديال السلعة' },
        see: { fr: 'les coûts du stock', en: 'stock costs', ar: 'الكلفة ديال السلعة' } },
      { id: 'stock.receive', check: 'server', at: 'office', fr: 'Réceptionner une livraison', en: 'Receive deliveries', ar: 'يستقبل السلعة اللي جات',
        can: { fr: 'réceptionner les livraisons', en: 'receive deliveries', ar: 'يستقبل السلعة اللي جات' } },
    ] },
    { id: 'purchases', icon: 'shopping_cart', fr: 'Achats', en: 'Purchases', ar: 'الشرا', perms: [
      { id: 'purchases.create', check: 'server', at: 'office', fr: 'Passer une commande fournisseur', en: 'Place supplier orders', ar: 'يطلب السلعة من الفورنيسور',
        can: { fr: 'passer des commandes fournisseur', en: 'place supplier orders', ar: 'يطلب السلعة من الفورنيسور' } },
      { id: 'purchases.pay', check: 'server', at: 'office', fr: 'Enregistrer une facture ou un paiement fournisseur', en: 'Record supplier invoices and payments', ar: 'يسجّل الفاكتورة والخلاص ديال الفورنيسور',
        can: { fr: 'enregistrer les factures fournisseur', en: 'record supplier invoices', ar: 'يسجّل الفاكتورات ديال الفورنيسور' } },
    ] },
    { id: 'customers', icon: 'group', fr: 'Clients', en: 'Customers', ar: 'الكليان', perms: [
      { id: 'customers.edit', check: 'server', at: 'office', fr: 'Créer et modifier les fiches clients', en: 'Create and edit customers', ar: 'يزيد ويبدّل الكليان',
        can: { fr: 'créer et modifier les clients', en: 'create and edit customers', ar: 'يزيد ويبدّل الكليان' } },
      { id: 'customers.delete', check: 'server', at: 'office', fr: 'Supprimer un client', en: 'Delete a customer', ar: 'يمسح كليان',
        can: { fr: 'supprimer un client', en: 'delete a customer', ar: 'يمسح كليان' } },
      { id: 'customers.balance', check: 'server', at: 'office', fr: 'Annuler ou corriger un avoir client', en: 'Cancel or adjust a store credit', ar: 'يلغي ولا يصحّح الأفوار ديال الكليان',
        can: { fr: 'annuler ou corriger un avoir', en: 'cancel or adjust a store credit', ar: 'يلغي ولا يصحّح الأفوار' } },
    ] },
    { id: 'suppliers', icon: 'local_shipping', fr: 'Fournisseurs', en: 'Suppliers', ar: 'الفورنيسورات', perms: [
      { id: 'suppliers.edit', check: 'server', at: 'office', fr: 'Gérer les fiches fournisseurs', en: 'Manage suppliers', ar: 'يسيّر الفورنيسورات',
        can: { fr: 'gérer les fournisseurs', en: 'manage suppliers', ar: 'يسيّر الفورنيسورات' } },
    ] },
    { id: 'catalog', icon: 'sell', fr: 'Catalogue', en: 'Catalogue', ar: 'المنتوجات', perms: [
      { id: 'catalog.edit', check: 'server', at: 'office', fr: 'Créer et modifier les articles', en: 'Create and edit items', ar: 'يزيد ويبدّل المنتوجات',
        can: { fr: 'créer et modifier les articles', en: 'create and edit items', ar: 'يزيد ويبدّل المنتوجات' } },
      { id: 'catalog.price', check: 'server', at: 'office', fr: 'Changer le prix d’un article existant', en: 'Change an existing item’s price', ar: 'يبدّل الثمن ديال منتوج كاين',
        can: { fr: 'changer les prix du catalogue', en: 'change catalogue prices', ar: 'يبدّل الأثمنة ديال المنتوجات' } },
    ] },
    { id: 'reports', icon: 'monitoring', fr: 'Rapports', en: 'Reports', ar: 'الأرقام', perms: [
      { id: 'reports.revenue', check: 'server', at: 'office', fr: 'Voir le chiffre d’affaires', en: 'See revenue', ar: 'يشوف المداخيل',
        can: { fr: 'voir le chiffre d’affaires', en: 'see revenue', ar: 'يشوف المداخيل' },
        see: { fr: 'le chiffre d’affaires', en: 'revenue', ar: 'المداخيل' } },
      { id: 'reports.margins', check: 'server', at: 'office', fr: 'Voir les marges et le coût matière', en: 'See margins and food cost', ar: 'يشوف الربح والكلفة',
        can: { fr: 'voir les marges', en: 'see margins', ar: 'يشوف الربح' },
        see: { fr: 'les marges', en: 'margins', ar: 'الربح' } },
    ] },
    { id: 'team', icon: 'badge', fr: 'Équipe', en: 'Team', ar: 'الخدّامة', perms: [
      { id: 'team.manage', check: 'server', at: 'office', fr: 'Gérer l’équipe, ses codes et les plannings', en: 'Manage staff, their codes and schedules', ar: 'يسيّر الخدّامة، الكودات ديالهم والتوقيت',
        can: { fr: 'gérer l’équipe, ses codes et les plannings', en: 'manage staff, their codes and schedules', ar: 'يسيّر الخدّامة، الكودات ديالهم والتوقيت' } },
      { id: 'team.payroll', check: 'server', at: 'office', fr: 'Voir et préparer la paie', en: 'See and prepare payroll', ar: 'يشوف ويوجّد الخلاص',
        can: { fr: 'voir la paie', en: 'see payroll', ar: 'يشوف الخلاص' },
        see: { fr: 'la paie', en: 'payroll', ar: 'الخلاص' } },
    ] },
    { id: 'settings', icon: 'settings', fr: 'Réglages', en: 'Settings', ar: 'الإعدادات', perms: [
      { id: 'settings.edit', check: 'server', at: 'office', fr: 'Modifier les réglages de l’établissement', en: 'Change store settings', ar: 'يبدّل الإعدادات ديال المحل',
        can: { fr: 'modifier les réglages', en: 'change store settings', ar: 'يبدّل الإعدادات' } },
    ] },
    { id: 'money', icon: 'payments', fr: 'Caisse et argent', en: 'Cash and money', ar: 'الصندوق والفلوس', perms: [
      { id: 'money.cash', check: 'journal', at: 'till', fr: 'Entrées et sorties d’espèces', en: 'Cash in and cash out', ar: 'يدخّل ويخرّج الكاش',
        can: { fr: 'sortir ou entrer des espèces', en: 'move cash in or out', ar: 'يدخّل ويخرّج الكاش' } },
      { id: 'money.close-day', check: 'journal', at: 'till', fr: 'Clôturer la journée (Z)', en: 'Close the day (Z report)', ar: 'يسدّ النهار (Z)',
        can: { fr: 'clôturer la journée', en: 'close the day', ar: 'يسدّ النهار' } },
    ] },
  ];

  var ALL = [];
  var BY_ID = {};
  GROUPS.forEach(function (g) {
    g.perms.forEach(function (p) { p.group = g.id; ALL.push(p.id); BY_ID[p.id] = p; });
  });

  /* Où le droit est tenu, en clair (voir l'en-tête). */
  var CHECK_LABEL = {
    'server:office': { fr: 'Vérifié par le serveur, au bureau', en: 'Checked by the server, in the back office', ar: 'السيرفور كيتأكد، فالبيرو' },
    'server:till': { fr: 'Vérifié par le serveur, à la caisse', en: 'Checked by the server, at the till', ar: 'السيرفور كيتأكد، فالصندوق' },
    'server:both': { fr: 'Vérifié par le serveur, caisse et bureau', en: 'Checked by the server, till and back office', ar: 'السيرفور كيتأكد، فالصندوق وفالبيرو' },
    journal: { fr: 'Fait sans le droit : noté au journal du patron', en: 'Done without the right: logged for the owner', ar: 'إلا تدار بلا الحق كتبان لمول المحل فالجورنال' },
    till: { fr: 'Demandé par la caisse seulement', en: 'Asked by the till only', ar: 'الصندوق بوحدو اللي كيطلبو' },
  };
  function checkLabel(id, l) {
    var p = BY_ID[id];
    if (!p) return '';
    var row = CHECK_LABEL[p.check === 'server' ? 'server:' + p.at : p.check];
    return row ? row[lang(l)] : '';
  }

  /* Rôles par défaut proposés. Le compte du propriétaire (ACCOUNT_OWNER) a
     tout ; aucun membre de l'équipe ne le reçoit, quel que soit son titre. */
  var ACCOUNT_OWNER = 'owner';
  var PRESET_IDS = ['manager', 'cashier', 'server', 'stock'];
  var PRESET_LABEL = {
    owner: { fr: 'Propriétaire', en: 'Owner', ar: 'مول المحل' },
    manager: { fr: 'Manager', en: 'Manager', ar: 'المسؤول' },
    cashier: { fr: 'Caisse', en: 'Cashier', ar: 'الكاشير' },
    server: { fr: 'Service', en: 'Floor staff', ar: 'السرفور' },
    stock: { fr: 'Magasinier', en: 'Stock keeper', ar: 'مول السلعة' },
  };
  var DEFAULT_PRESETS = {
    manager: ALL.filter(function (id) { return id !== 'reports.margins' && id !== 'team.payroll' && id !== 'settings.edit'; }),
    cashier: ['customers.edit', 'money.cash', 'money.close-day', 'stock.count'],
    server: ['customers.edit'],
    stock: ['stock.adjust', 'stock.count', 'stock.value', 'stock.receive', 'purchases.create', 'suppliers.edit', 'catalog.edit'],
  };
  /* Remise accordée sans droit particulier (en %) : au-delà, sales.discount. */
  var DEFAULT_FREE_DISCOUNT_PCT = 10;

  function normRole(value) {
    var s = String(value == null ? '' : value).trim().toLowerCase();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (_) {}
    return s.replace(/[’`´]/g, "'").replace(/\s+/g, ' ').slice(0, 60);
  }
  /* LA liste des intitulés de propriétaire, une seule pour tout Kiwi : un code
     qui la porte ouvre le tableau de bord au palier du patron
     (functions/auth/_lib.js › faceAccessTier, employeeRoleOpensDashboard la
     lisent ici) et a donc tous les droits (accès propriétaire complet). */
  var OWNER_TITLE_LIST = ['proprietaire', 'owner', 'patron', 'direction'];
  var OWNER_TITLES = {};
  OWNER_TITLE_LIST.forEach(function (t) { OWNER_TITLES[t] = 1; });
  /* Les intitulés RÉSERVÉS au propriétaire : les siens, plus ceux qui leur
     ressemblent. Seul le propriétaire peut les poser (functions/api/_permissions.js
     › teamEditRefusal, codeHolds ; functions/api/config.js). Un intitulé
     réservé qui n'est pas dans la liste ci-dessus n'ouvre rien de plus qu'un Manager. */
  var RESERVED_TITLES = { patronne: 1, proprietary: 1, 'manager-owner': 1 };
  OWNER_TITLE_LIST.forEach(function (t) { RESERVED_TITLES[t] = 1; });
  var MANAGER_ROLES = { manager: 1, management: 1, gerant: 1, gerante: 1, admin: 1, administrateur: 1,
    responsable: 1, superviseur: 1, superviseuse: 1, directeur: 1, directrice: 1 };
  var STOCK_ROLES = { stock: 1, magasinier: 1, magasiniere: 1, econome: 1, economat: 1, 'gestionnaire de stock': 1, 'responsable stock': 1 };
  var TILL_ROLES = { caisse: 1, caissier: 1, caissiere: 1, cashier: 1, staff: 1, vendeur: 1, vendeuse: 1, vente: 1,
    'vendeur conseil': 1, 'vendeuse conseil': 1, conseiller: 1, conseillere: 1, 'conseiller de vente': 1, 'conseillere de vente': 1,
    libraire: 1, fleuriste: 1, 'pharmacien titulaire': 1, titulaire: 1, 'pharmacien assistant': 1, pharmacien: 1, pharmacienne: 1,
    receptionniste: 1, reception: 1, 'agent de reception': 1, equipier: 1, 'equipier polyvalent': 1, 'equipier food truck': 1,
    barista: 1, comptoir: 1, 'responsable rayon': 1, rayon: 1 };
  var SERVER_WORDS = { serveur: 1, serveuse: 1, server: 1, service: 1, salle: 1, kitchen: 1, cuisinier: 1, employee: 1, employe: 1 };

  function ownerTitle(role) { return !!OWNER_TITLES[normRole(role)]; }
  function reservedTitle(role) { return !!RESERVED_TITLES[normRole(role)]; }
  /* Le rôle par défaut proposé pour un intitulé de poste libre. Jamais
     « propriétaire » : un titre ne prouve rien. */
  function presetForRole(role) {
    var r = normRole(role);
    if (RESERVED_TITLES[r] || MANAGER_ROLES[r] || /(?:^|[- ])manager$/.test(r)) return 'manager';
    if (STOCK_ROLES[r]) return 'stock';
    if (TILL_ROLES[r]) return 'cashier';
    return 'server';
  }

  function cleanList(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function (v) { return String(v || ''); })
      .filter(function (id) { if (!BY_ID[id] || seen[id]) return false; seen[id] = 1; return true; });
  }
  function presetPerms(preset, custom) {
    if (preset === ACCOUNT_OWNER) return ALL.slice();
    if (custom && Array.isArray(custom[preset])) return cleanList(custom[preset]);
    return (DEFAULT_PRESETS[preset] || DEFAULT_PRESETS.server).slice();
  }
  /* preset ∪ grants − denies. */
  function effective(preset, grants, denies, custom) {
    if (preset === ACCOUNT_OWNER) return ALL.slice();
    var set = {};
    presetPerms(preset, custom).forEach(function (id) { set[id] = 1; });
    cleanList(grants).forEach(function (id) { set[id] = 1; });
    cleanList(denies).forEach(function (id) { delete set[id]; });
    return ALL.filter(function (id) { return set[id]; });
  }
  /* Ramène des surcharges au strict nécessaire par rapport au rôle. */
  function overridesFor(preset, wanted, custom) {
    var base = {}; presetPerms(preset, custom).forEach(function (id) { base[id] = 1; });
    var want = {}; cleanList(wanted).forEach(function (id) { want[id] = 1; });
    return {
      grants: ALL.filter(function (id) { return want[id] && !base[id]; }),
      denies: ALL.filter(function (id) { return base[id] && !want[id]; }),
    };
  }

  function lang(l) { return l === 'en' || l === 'ar' ? l : 'fr'; }
  function label(id, l) { var p = BY_ID[id]; return p ? p[lang(l)] : id; }
  function joinList(items, l, orWord) {
    l = lang(l);
    if (items.length <= 1) return items.join('');
    var last = items[items.length - 1];
    var head = items.slice(0, -1).join(l === 'ar' ? '، ' : ', ');
    var word = orWord
      ? (l === 'ar' ? ' ولا ' : l === 'en' ? ' or ' : ' ou ')
      : (l === 'ar' ? ' و' : l === 'en' ? ' and ' : ' et ');
    return head + word + last;
  }
  /* « Ce que cette personne peut faire », en trois phrases au plus : ce qu'elle
     fait seule ; à la caisse, ce pour quoi il faut le code d'un responsable (les
     seuls gestes qu'un code de responsable débloque) ; ce qu'elle ne voit pas
     (aucun code ne l'ouvre). */
  var TILL_APPROVED = ['sales.refund', 'sales.cancel', 'sales.reopen', 'sales.discount', 'sales.drawer', 'money.cash',
    'money.close-day', 'stock.adjust', 'sales.void-sent', 'sales.price'];
  var VIEWS = ['reports.revenue', 'reports.margins', 'team.payroll', 'stock.value'];
  function summary(perms, name, l) {
    l = lang(l);
    var who = String(name || '').trim() || (l === 'en' ? 'This person' : l === 'ar' ? 'هاد الشخص' : 'Cette personne');
    var has = {}; cleanList(perms).forEach(function (id) { has[id] = 1; });
    if (ALL.every(function (id) { return has[id]; })) {
      return l === 'en' ? who + ' can do everything, payroll and settings included.'
        : l === 'ar' ? who + ' يقدر يدير كلشي، حتى الخلاص والإعدادات.'
          : who + ' peut tout faire, paie et réglages compris.';
    }
    var yes = ALL.filter(function (id) { return has[id]; }).map(function (id) { return BY_ID[id].can[l]; });
    var ask = TILL_APPROVED.filter(function (id) { return !has[id]; }).map(function (id) { return BY_ID[id].can[l]; });
    var blind = VIEWS.filter(function (id) { return !has[id]; }).map(function (id) { return BY_ID[id].see[l]; });
    var out = [];
    if (yes.length) {
      out.push(l === 'en' ? who + ' can sell, and also ' + joinList(yes, l) + '.'
        : l === 'ar' ? who + ' يقدر يبيع، وزيد على هادشي: ' + joinList(yes, l) + '.'
          : who + ' peut encaisser, et aussi ' + joinList(yes, l) + '.');
    } else {
      out.push(l === 'en' ? who + ' can sell, nothing more.'
        : l === 'ar' ? who + ' يقدر يبيع، والسلام.'
          : who + ' peut encaisser, rien de plus.');
    }
    if (ask.length) {
      out.push(l === 'en' ? 'At the till, a manager’s code is needed to ' + joinList(ask, l, true) + '.'
        : l === 'ar' ? 'فالصندوق، خاص الكود ديال المسؤول باش ' + joinList(ask, l, true) + '.'
          : 'À la caisse, il faut le code d’un responsable pour ' + joinList(ask, l, true) + '.');
    }
    if (blind.length) {
      out.push(l === 'en' ? 'Does not see ' + joinList(blind, l, true) + '.'
        : l === 'ar' ? 'ما كيشوفش ' + joinList(blind, l, true) + '.'
          : 'Ne voit pas ' + joinList(blind, l, true) + '.');
    }
    return out.join(' ');
  }

  /* Les règles que l'ancien noyau gardait dans le navigateur
     (platform-kernel.js › kiwiAccess:v1:<tenant>, chaînes « action:ressource »
     ou objets { subject, action, resource }) traduites en droits. Une règle
     joker (« * », action ou ressource « * ») n'est JAMAIS étendue : elle est
     rendue dans `ignored` pour que le propriétaire la voie, et ne donne rien. */
  var LEGACY = {
    'action:refund': ['sales.refund'],
    'write:catalog': ['catalog.edit', 'catalog.price'],
    'write:inventory': ['stock.adjust', 'stock.count', 'stock.receive'],
    'read:inventory': ['stock.value'],
    'write:procurement': ['purchases.create'],
    'write:customers': ['customers.edit'],
    'read:reports': ['reports.revenue'], 'write:reports': ['reports.revenue'],
    'read:payroll': ['team.payroll'], 'write:payroll': ['team.payroll'],
    'write:planning': ['team.manage'],
    'write:settings': ['settings.edit'],
  };
  function legacyRule(rule) {
    if (!rule) return null;
    if (typeof rule === 'string') {
      if (rule.indexOf('*') !== -1) return { subject: '', perms: [], wildcard: true, text: rule.slice(0, 60) };
      return { subject: '', perms: (LEGACY[rule] || []).slice(), text: rule.slice(0, 60) };
    }
    if (typeof rule !== 'object') return null;
    var action = String(rule.action || ''), resource = String(rule.resource || '');
    var text = (rule.subject ? String(rule.subject).slice(0, 40) + ' · ' : '') + action.slice(0, 20) + ':' + resource.slice(0, 20);
    if (action.indexOf('*') !== -1 || resource.indexOf('*') !== -1) return { subject: String(rule.subject || '').slice(0, 96), perms: [], wildcard: true, text: text };
    return { subject: String(rule.subject || '').slice(0, 96), perms: cleanList(LEGACY[action + ':' + resource] || []), text: text };
  }
  /* staff : [{ key, role, name }] → { people: { key: { grants:[], denies:[] } },
     ignored: [{ text, why: 'wildcard' | 'unknown' }] }. Une règle sans sujet vaut
     pour tous ; un sujet est un identifiant ou un rôle. */
  function fromLegacy(doc, staff) {
    var people = {}, ignored = [];
    var list = Array.isArray(staff) ? staff : [];
    function apply(rule, field) {
      var r = legacyRule(rule);
      if (!r) return;
      if (r.wildcard || !r.perms.length) { ignored.push({ text: r.text, why: r.wildcard ? 'wildcard' : 'unknown', field: field }); return; }
      list.forEach(function (s) {
        if (!s || !s.key) return;
        var subject = normRole(r.subject);
        /* Un sujet est un identifiant, un intitulé, ou un mot de rôle de l'ancien
           noyau (« caisse », « serveur »…) : ce dernier vaut pour tout le rôle. */
        var asRole = subject && (presetForRole(subject) !== 'server' || SERVER_WORDS[subject]) ? presetForRole(subject) : '';
        if (subject && subject !== normRole(s.key) && subject !== normRole(s.role) && asRole !== presetForRole(s.role)) return;
        var row = people[s.key] || (people[s.key] = { grants: [], denies: [] });
        row[field] = cleanList(row[field].concat(r.perms));
      });
    }
    ((doc && doc.grants) || []).slice(0, 500).forEach(function (rule) { apply(rule, 'grants'); });
    ((doc && doc.denies) || []).slice(0, 500).forEach(function (rule) { apply(rule, 'denies'); });
    return { people: people, ignored: ignored.slice(0, 50) };
  }

  /* Le droit qu'une approbation de caisse demande (pin/verify › action.kind). */
  var ACTION_PERM = { refund: 'sales.refund', inventory: 'stock.adjust', cancel: 'sales.cancel', reopen: 'sales.reopen',
    discount: 'sales.discount', drawer: 'sales.drawer', cash: 'money.cash', price: 'sales.price', 'close-day': 'money.close-day',
    'void-sent': 'sales.void-sent' };

  return {
    GROUPS: GROUPS, ALL: ALL, BY_ID: BY_ID, PRESET_IDS: PRESET_IDS, PRESET_LABEL: PRESET_LABEL, ACCOUNT_OWNER: ACCOUNT_OWNER,
    DEFAULT_PRESETS: DEFAULT_PRESETS, DEFAULT_FREE_DISCOUNT_PCT: DEFAULT_FREE_DISCOUNT_PCT, ACTION_PERM: ACTION_PERM,
    TILL_APPROVED: TILL_APPROVED, VIEWS: VIEWS,
    OWNER_TITLE_LIST: OWNER_TITLE_LIST.slice(), normRole: normRole, ownerTitle: ownerTitle, reservedTitle: reservedTitle, presetForRole: presetForRole, cleanList: cleanList, presetPerms: presetPerms,
    effective: effective, overridesFor: overridesFor, label: label, checkLabel: checkLabel, summary: summary,
    legacyRule: legacyRule, fromLegacy: fromLegacy,
  };
});
