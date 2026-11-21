/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LES DROITS DE L'ÉQUIPE · window.KiwiPermCatalog
 * ---------------------------------------------------------------------------
 * Une seule liste, deux lecteurs :
 *   - functions/api/_permissions.js l'importe et décide, côté serveur, de ce
 *     qu'une personne peut faire (remboursement, annulation, stock, caisse,
 *     catalogue, rapports) ;
 *   - le tableau de bord (assets/pages-pro/staff-permissions.js) et la caisse
 *     (assets/platform-kernel.js › perms) l'affichent et masquent ce qui est
 *     refusé, ce qui n'est jamais la seule protection.
 *
 * Pur : ni navigateur, ni base, ni horloge.
 *
 * Les rôles par défaut reproduisent EXACTEMENT ce que le serveur autorisait
 * avant ce fichier (un code de gérant valide un remboursement, un code de
 * caissier non) : rien ne change pour un commerçant tant que le propriétaire
 * n'a rien modifié. Le rôle propriétaire est verrouillé, il a tout.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.KiwiPermCatalog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* [id, fr, en, ar] ; `can` est la forme utilisée dans le résumé en clair. */
  var GROUPS = [
    { id: 'sales', icon: 'point_of_sale', fr: 'Ventes', en: 'Sales', ar: 'المبيعات', perms: [
      { id: 'sales.discount', fr: 'Remise au-delà du seuil libre', en: 'Discount above the free limit', ar: 'تخفيض فوق الحد الحر',
        can: { fr: 'faire une remise au-delà du seuil', en: 'give a discount above the limit', ar: 'إعطاء تخفيض فوق الحد' } },
      { id: 'sales.refund', fr: 'Rembourser un client', en: 'Refund a customer', ar: 'إرجاع الفلوس للزبون',
        can: { fr: 'rembourser un client', en: 'refund a customer', ar: 'إرجاع الفلوس للزبون' } },
      { id: 'sales.cancel', fr: 'Annuler une vente encaissée', en: 'Cancel a completed sale', ar: 'إلغاء بيع مُسجَّل',
        can: { fr: 'annuler une vente encaissée', en: 'cancel a completed sale', ar: 'إلغاء بيع مُسجَّل' } },
      { id: 'sales.reopen', fr: 'Rouvrir une vente sur une table', en: 'Reopen a sale on a table', ar: 'إعادة فتح بيع على طاولة',
        can: { fr: 'rouvrir une vente', en: 'reopen a sale', ar: 'إعادة فتح بيع' } },
      { id: 'sales.drawer', fr: 'Ouvrir le tiroir sans vente', en: 'Open the drawer without a sale', ar: 'فتح الدرج بلا بيع',
        can: { fr: 'ouvrir le tiroir sans vente', en: 'open the drawer without a sale', ar: 'فتح الدرج بلا بيع' } },
      { id: 'sales.price', fr: 'Changer un prix à la caisse', en: 'Change a price at the till', ar: 'تبديل الثمن في الصندوق',
        can: { fr: 'changer un prix à la caisse', en: 'change a price at the till', ar: 'تبديل الثمن في الصندوق' } },
      { id: 'sales.credit', fr: 'Vendre à crédit (carnet)', en: 'Sell on credit (tab)', ar: 'البيع بالكريدي',
        can: { fr: 'vendre à crédit', en: 'sell on credit', ar: 'البيع بالكريدي' } },
      { id: 'sales.pricelist', fr: 'Changer de liste de prix', en: 'Switch price list', ar: 'تبديل لائحة الأثمنة',
        can: { fr: 'changer de liste de prix', en: 'switch price list', ar: 'تبديل لائحة الأثمنة' } },
      { id: 'sales.void-sent', fr: 'Retirer un article déjà envoyé en cuisine', en: 'Remove an item already sent to the kitchen', ar: 'حذف طلب بعدما مشى للكوزينة',
        can: { fr: 'retirer un article déjà envoyé en cuisine', en: 'remove an item already sent to the kitchen', ar: 'حذف طلب بعدما مشى للكوزينة' } },
    ] },
    { id: 'stock', icon: 'inventory_2', fr: 'Stock', en: 'Stock', ar: 'السلعة والمخزون', perms: [
      { id: 'stock.adjust', fr: 'Corriger le stock (perte, casse)', en: 'Adjust stock (loss, breakage)', ar: 'تصحيح المخزون (ضياع، كسر)',
        can: { fr: 'corriger le stock', en: 'adjust stock', ar: 'تصحيح المخزون' } },
      { id: 'stock.count', fr: 'Faire un inventaire', en: 'Count stock', ar: 'جرد السلعة',
        can: { fr: 'faire un inventaire', en: 'count stock', ar: 'جرد السلعة' } },
      { id: 'stock.value', fr: 'Voir les coûts et la valeur du stock', en: 'See costs and stock value', ar: 'رؤية التكلفة وقيمة المخزون',
        can: { fr: 'voir les coûts et la valeur du stock', en: 'see costs and stock value', ar: 'رؤية التكلفة وقيمة المخزون' } },
      { id: 'stock.receive', fr: 'Réceptionner une livraison', en: 'Receive deliveries', ar: 'استلام السلعة',
        can: { fr: 'réceptionner les livraisons', en: 'receive deliveries', ar: 'استلام السلعة' } },
    ] },
    { id: 'purchases', icon: 'shopping_cart', fr: 'Achats', en: 'Purchases', ar: 'المشتريات', perms: [
      { id: 'purchases.create', fr: 'Passer une commande fournisseur', en: 'Place supplier orders', ar: 'طلب السلعة من المورّد',
        can: { fr: 'passer des commandes fournisseur', en: 'place supplier orders', ar: 'طلب السلعة من المورّد' } },
      { id: 'purchases.pay', fr: 'Payer un achat', en: 'Pay for purchases', ar: 'خلاص المشتريات',
        can: { fr: 'payer les achats', en: 'pay for purchases', ar: 'خلاص المشتريات' } },
    ] },
    { id: 'customers', icon: 'group', fr: 'Clients', en: 'Customers', ar: 'الزبناء', perms: [
      { id: 'customers.edit', fr: 'Créer et modifier les fiches clients', en: 'Create and edit customers', ar: 'إضافة وتعديل الزبناء',
        can: { fr: 'créer et modifier les clients', en: 'create and edit customers', ar: 'إضافة وتعديل الزبناء' } },
      { id: 'customers.delete', fr: 'Supprimer un client', en: 'Delete a customer', ar: 'حذف زبون',
        can: { fr: 'supprimer un client', en: 'delete a customer', ar: 'حذف زبون' } },
      { id: 'customers.balance', fr: 'Corriger un solde client (carnet, avoir)', en: 'Adjust a customer balance', ar: 'تعديل حساب الزبون',
        can: { fr: 'corriger un solde client', en: 'adjust a customer balance', ar: 'تعديل حساب الزبون' } },
    ] },
    { id: 'suppliers', icon: 'local_shipping', fr: 'Fournisseurs', en: 'Suppliers', ar: 'المورّدون', perms: [
      { id: 'suppliers.edit', fr: 'Gérer les fournisseurs', en: 'Manage suppliers', ar: 'تسيير المورّدين',
        can: { fr: 'gérer les fournisseurs', en: 'manage suppliers', ar: 'تسيير المورّدين' } },
    ] },
    { id: 'catalog', icon: 'sell', fr: 'Catalogue', en: 'Catalogue', ar: 'المنتوجات', perms: [
      { id: 'catalog.edit', fr: 'Créer et modifier les articles', en: 'Create and edit items', ar: 'إضافة وتعديل المنتوجات',
        can: { fr: 'créer et modifier les articles', en: 'create and edit items', ar: 'إضافة وتعديل المنتوجات' } },
      { id: 'catalog.price', fr: 'Changer les prix du catalogue', en: 'Change catalogue prices', ar: 'تبديل أثمنة المنتوجات',
        can: { fr: 'changer les prix du catalogue', en: 'change catalogue prices', ar: 'تبديل أثمنة المنتوجات' } },
    ] },
    { id: 'reports', icon: 'monitoring', fr: 'Rapports', en: 'Reports', ar: 'التقارير', perms: [
      { id: 'reports.revenue', fr: 'Voir le chiffre d’affaires', en: 'See revenue', ar: 'رؤية رقم المعاملات',
        can: { fr: 'voir le chiffre d’affaires', en: 'see revenue', ar: 'رؤية رقم المعاملات' } },
      { id: 'reports.margins', fr: 'Voir les marges et le coût matière', en: 'See margins and food cost', ar: 'رؤية الربح والتكلفة',
        can: { fr: 'voir les marges', en: 'see margins', ar: 'رؤية الربح والتكلفة' } },
    ] },
    { id: 'team', icon: 'badge', fr: 'Équipe', en: 'Team', ar: 'الفريق', perms: [
      { id: 'team.manage', fr: 'Gérer l’équipe et les plannings', en: 'Manage staff and schedules', ar: 'تسيير الفريق والجداول',
        can: { fr: 'gérer l’équipe et les plannings', en: 'manage staff and schedules', ar: 'تسيير الفريق والجداول' } },
      { id: 'team.payroll', fr: 'Voir la paie', en: 'See payroll', ar: 'رؤية الأجور',
        can: { fr: 'voir la paie', en: 'see payroll', ar: 'رؤية الأجور' } },
    ] },
    { id: 'settings', icon: 'settings', fr: 'Réglages', en: 'Settings', ar: 'الإعدادات', perms: [
      { id: 'settings.edit', fr: 'Modifier les réglages de l’établissement', en: 'Change store settings', ar: 'تبديل إعدادات المحل',
        can: { fr: 'modifier les réglages', en: 'change store settings', ar: 'تبديل إعدادات المحل' } },
    ] },
    { id: 'money', icon: 'payments', fr: 'Caisse et argent', en: 'Cash and money', ar: 'الصندوق والفلوس', perms: [
      { id: 'money.cash', fr: 'Entrées et sorties d’espèces', en: 'Cash in and cash out', ar: 'إدخال وإخراج الكاش',
        can: { fr: 'sortir ou entrer des espèces', en: 'move cash in or out', ar: 'إدخال وإخراج الكاش' } },
      { id: 'money.close-day', fr: 'Clôturer la journée (Z)', en: 'Close the day (Z report)', ar: 'سدّ النهار (تقرير Z)',
        can: { fr: 'clôturer la journée', en: 'close the day', ar: 'سدّ النهار' } },
    ] },
  ];

  var ALL = [];
  var BY_ID = {};
  GROUPS.forEach(function (g) {
    g.perms.forEach(function (p) { p.group = g.id; ALL.push(p.id); BY_ID[p.id] = p; });
  });

  /* Rôles par défaut. Voir l'en-tête : la parité avec le serveur d'avant. */
  var PRESET_IDS = ['owner', 'manager', 'cashier', 'server', 'stock'];
  var PRESET_LABEL = {
    owner: { fr: 'Propriétaire', en: 'Owner', ar: 'مول المحل' },
    manager: { fr: 'Manager', en: 'Manager', ar: 'المسيّر' },
    cashier: { fr: 'Caisse', en: 'Cashier', ar: 'الكاسيي' },
    server: { fr: 'Service', en: 'Floor staff', ar: 'السرفور' },
    stock: { fr: 'Magasinier', en: 'Stock keeper', ar: 'مسؤول السلعة' },
  };
  var DEFAULT_PRESETS = {
    owner: ALL.slice(),
    manager: ALL.filter(function (id) { return id !== 'reports.margins' && id !== 'team.payroll' && id !== 'settings.edit'; }),
    cashier: ['sales.credit', 'sales.pricelist', 'customers.edit', 'money.cash', 'money.close-day', 'stock.count'],
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
  var OWNER_ROLES = { proprietaire: 1, owner: 1, patron: 1, patronne: 1, direction: 1, proprietary: 1, 'manager-owner': 1 };
  /* Les rôles qu'acceptaient MANAGER_ROLES (sale/cancel.js) et
     employeeRoleOpensDashboard (auth/_lib.js). */
  var MANAGER_ROLES = { manager: 1, management: 1, gerant: 1, gerante: 1, admin: 1, administrateur: 1,
    responsable: 1, superviseur: 1, superviseuse: 1, directeur: 1, directrice: 1 };
  var STOCK_ROLES = { stock: 1, magasinier: 1, magasiniere: 1, econome: 1, economat: 1, 'gestionnaire de stock': 1, 'responsable stock': 1 };
  var TILL_ROLES = { caisse: 1, caissier: 1, caissiere: 1, cashier: 1, staff: 1, vendeur: 1, vendeuse: 1, vente: 1,
    'vendeur conseil': 1, 'vendeuse conseil': 1, conseiller: 1, conseillere: 1, 'conseiller de vente': 1, 'conseillere de vente': 1,
    libraire: 1, fleuriste: 1, 'pharmacien titulaire': 1, titulaire: 1, 'pharmacien assistant': 1, pharmacien: 1, pharmacienne: 1,
    receptionniste: 1, reception: 1, 'agent de reception': 1, equipier: 1, 'equipier polyvalent': 1, 'equipier food truck': 1,
    barista: 1, comptoir: 1, 'responsable rayon': 1, rayon: 1 };

  /* Le rôle par défaut d'un intitulé de poste libre (« Caissière », « Gérant »). */
  function presetForRole(role) {
    var r = normRole(role);
    if (OWNER_ROLES[r]) return 'owner';
    if (MANAGER_ROLES[r] || /(?:^|[- ])manager$/.test(r)) return 'manager';
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
    if (preset === 'owner') return ALL.slice();
    if (custom && Array.isArray(custom[preset])) return cleanList(custom[preset]);
    return (DEFAULT_PRESETS[preset] || DEFAULT_PRESETS.server).slice();
  }
  /* preset ∪ grants − denies. Le propriétaire a tout, toujours. */
  function effective(preset, grants, denies, custom) {
    if (preset === 'owner') return ALL.slice();
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
  function joinList(items, l) {
    l = lang(l);
    if (items.length <= 1) return items.join('');
    var last = items[items.length - 1];
    var head = items.slice(0, -1).join(l === 'ar' ? '، ' : ', ');
    return head + (l === 'ar' ? ' و' : l === 'en' ? ' and ' : ' et ') + last;
  }
  /* « Ce que cette personne peut faire », en une ou deux phrases. Les refus
     cités sont ceux qui comptent pour l'argent, pas la liste entière. */
  var NOTABLE = ['sales.refund', 'sales.cancel', 'sales.discount', 'sales.drawer', 'money.cash', 'stock.adjust',
    'catalog.price', 'reports.revenue', 'reports.margins', 'team.payroll'];
  function summary(perms, name, l) {
    l = lang(l);
    var who = String(name || '').trim() || (l === 'en' ? 'This person' : l === 'ar' ? 'هاد الشخص' : 'Cette personne');
    var has = {}; cleanList(perms).forEach(function (id) { has[id] = 1; });
    var yes = ALL.filter(function (id) { return has[id]; }).map(function (id) { return BY_ID[id].can[l]; });
    var no = NOTABLE.filter(function (id) { return !has[id]; }).map(function (id) { return BY_ID[id].can[l]; });
    if (yes.length === ALL.length) {
      return l === 'en' ? who + ' can do everything, including payroll and settings.'
        : l === 'ar' ? who + ' يقدر يدير كلشي، حتى الأجور والإعدادات.'
          : who + ' peut tout faire, paie et réglages compris.';
    }
    var out = [];
    if (yes.length) {
      out.push(l === 'en' ? who + ' can sell and also ' + joinList(yes, l) + '.'
        : l === 'ar' ? who + ' يقدر يبيع، وزيد على ذلك: ' + joinList(yes, l) + '.'
          : who + ' peut encaisser, et aussi ' + joinList(yes, l) + '.');
    } else {
      out.push(l === 'en' ? who + ' can sell, nothing more.'
        : l === 'ar' ? who + ' يقدر يبيع فقط.'
          : who + ' peut encaisser, rien de plus.');
    }
    if (no.length) {
      out.push(l === 'en' ? 'Without a manager code, they cannot ' + joinList(no, l).replace(/ and /, ' or ') + '.'
        : l === 'ar' ? 'بلا كود المسيّر ما يقدرش: ' + joinList(no, l) + '.'
          : 'Sans code manager, impossible de ' + joinList(no, l).replace(/ et ([^,]*)$/, ' ou $1') + '.');
    }
    return out.join(' ');
  }

  /* Les règles que l'ancien noyau gardait dans le navigateur
     (platform-kernel.js › kiwiAccess:v1:<tenant>, chaînes « action:ressource »
     ou objets { subject, action, resource }) traduites en droits. */
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
      if (rule === '*') return { subject: '', perms: ALL.slice() };
      return { subject: '', perms: (LEGACY[rule] || []).slice() };
    }
    if (typeof rule !== 'object') return null;
    var key = String(rule.action || '') + ':' + String(rule.resource || '');
    var perms = LEGACY[key] || [];
    if (rule.action === '*' || rule.resource === '*') {
      perms = [];
      Object.keys(LEGACY).forEach(function (k) {
        var a = k.split(':');
        if ((rule.action === '*' || rule.action === a[0]) && (rule.resource === '*' || rule.resource === a[1])) perms = perms.concat(LEGACY[k]);
      });
    }
    return { subject: String(rule.subject || '').slice(0, 96), perms: cleanList(perms) };
  }
  /* staff : [{ key, role, name }] → { key: { grants:[], denies:[] } }. Une règle
     sans sujet vaut pour tous ; un sujet est un identifiant ou un rôle. */
  function fromLegacy(doc, staff) {
    var out = {};
    var list = Array.isArray(staff) ? staff : [];
    function apply(rule, field) {
      var r = legacyRule(rule);
      if (!r || !r.perms.length) return;
      list.forEach(function (s) {
        if (!s || !s.key) return;
        var subject = normRole(r.subject);
        if (subject && subject !== normRole(s.key) && subject !== normRole(s.role) && subject !== presetForRole(s.role)) return;
        var row = out[s.key] || (out[s.key] = { grants: [], denies: [] });
        row[field] = cleanList(row[field].concat(r.perms));
      });
    }
    ((doc && doc.grants) || []).slice(0, 500).forEach(function (rule) { apply(rule, 'grants'); });
    ((doc && doc.denies) || []).slice(0, 500).forEach(function (rule) { apply(rule, 'denies'); });
    return out;
  }

  /* Le droit qu'une approbation de caisse demande (pin/verify › action.kind). */
  var ACTION_PERM = { refund: 'sales.refund', inventory: 'stock.adjust', cancel: 'sales.cancel', reopen: 'sales.reopen',
    discount: 'sales.discount', drawer: 'sales.drawer', cash: 'money.cash', price: 'sales.price', 'close-day': 'money.close-day',
    'void-sent': 'sales.void-sent', credit: 'sales.credit' };

  return {
    GROUPS: GROUPS, ALL: ALL, BY_ID: BY_ID, PRESET_IDS: PRESET_IDS, PRESET_LABEL: PRESET_LABEL,
    DEFAULT_PRESETS: DEFAULT_PRESETS, DEFAULT_FREE_DISCOUNT_PCT: DEFAULT_FREE_DISCOUNT_PCT, ACTION_PERM: ACTION_PERM,
    normRole: normRole, presetForRole: presetForRole, cleanList: cleanList, presetPerms: presetPerms,
    effective: effective, overridesFor: overridesFor, label: label, summary: summary,
    legacyRule: legacyRule, fromLegacy: fromLegacy,
  };
});
