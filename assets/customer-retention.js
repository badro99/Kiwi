/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CUSTOMER RETENTION  (assets/customer-retention.js) · ticket #0165
 * ---------------------------------------------------------------------------
 * The owner's page for bringing customers back. Rules decide, the owner
 * controls, AI only drafts:
 *
 *   1. Activity     identified visits, last visit, usual rhythm, spend, loyalty.
 *   2. Groups       Regular / Visiting less often / Inactive. The owner sets the
 *                   day thresholds; « less often » also compares the time since
 *                   the last visit with that customer's own usual gap.
 *   3. Offers       one per group: nothing, a percentage, a fixed amount, a free
 *                   item or the loyalty reward, with dates, minimum spend, a
 *                   per-customer limit and a budget.
 *   4. Suggestions  why the customer qualifies, the offer, its estimated margin
 *                   impact and a drafted message. Kiwi AI can rewrite the draft
 *                   (/api/ai/whatsapp-campaign); the fixed template is always
 *                   there when it cannot.
 *   5. Sending      manual: the owner approves, WhatsApp opens with the text.
 *                   Only customers who consented to WhatsApp/SMS are offered.
 *   6. Results      sent offers, customers who came back, later visits,
 *                   revenue and margin after the estimated discount.
 *
 * Applying offers automatically at checkout is the next step and is not done
 * here: the results say « estimated » until the till enforces them.
 *
 * Data: the shared client book through KiwiClientsDirectory.load() (same
 * real-or-demo rule as the Clients page). Settings, offers and the send log
 * live in the `retention` store document (owner-only on the server, redacted
 * for paired tills because the log names customers).
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.Kiwi || !window.KiwiStore) return;
  var Kiwi = window.Kiwi;
  var DAY = 86400000;

  var lang = function () { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var fmt = function (n) { try { return (window.KiwiNumber?.format((Math.round(n) || 0), {}) ?? (Math.round(n) || 0).toLocaleString(lang() === 'en' ? 'en-GB' : 'fr-FR')).replace(/[  \s]/g, ' '); } catch (_) { return String(Math.round(n) || 0); } };
  var num = function (v, min, max, dflt) { var n = Number(v); if (!Number.isFinite(n)) return dflt; return Math.min(max, Math.max(min, n)); };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* Material Symbols (Outlined · 400), vendored in assets/icons/material. */
  var ICON = {
    retention: 'M640-440 474-602q-31-30-52.5-66.5T400-748q0-55 38.5-93.5T532-880q32 0 60 13.5t48 36.5q20-23 48-36.5t60-13.5q55 0 93.5 38.5T880-748q0 43-21 79.5T807-602L640-440Zm0-112 109-107q19-19 35-40.5t16-48.5q0-22-15-37t-37-15q-14 0-26.5 5.5T700-778l-60 72-60-72q-9-11-21.5-16.5T532-800q-22 0-37 15t-15 37q0 27 16 48.5t35 40.5l109 107ZM280-220l278 76 238-74q-5-9-14.5-15.5T760-240H558q-27 0-43-2t-33-8l-93-31 22-78 81 27q17 5 40 8t68 4q0-11-6.5-21T578-354l-234-86h-64v220ZM40-80v-440h304q7 0 14 1.5t13 3.5l235 87q33 12 53.5 42t20.5 66h80q50 0 85 33t35 87v40L560-60l-280-78v58H40Zm80-80h80v-280h-80v280Zm520-546Z',
    tune: 'M440-120v-240h80v80h320v80H520v80h-80Zm-320-80v-80h240v80H120Zm160-160v-80H120v-80h160v-80h80v240h-80Zm160-80v-80h400v80H440Zm160-160v-240h80v80h160v80H680v80h-80Zm-480-80v-80h400v80H120Z',
    trend: 'm136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z',
  };
  var ico = function (k) { return '<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="' + ICON[k] + '"/></svg>'; };

  var STR = {
    fr: {
      title: 'Fidélisation clients', sub: 'Activité · groupes · offres · suggestions · résultats',
      tabs: { activity: 'Activité', groups: 'Groupes et offres', suggest: 'Suggestions', results: 'Résultats' },
      off: 'La fidélisation est désactivée', offText: 'Activez-la pour classer vos clients en groupes, choisir une offre par groupe et préparer les messages. Rien n’est envoyé sans votre accord.',
      enable: 'Activer la fidélisation', enabled: 'Fidélisation activée', disable: 'Désactiver',
      group: { regular: 'Réguliers', less: 'Viennent moins souvent', inactive: 'Inactifs' },
      groupOne: { regular: 'Régulier', less: 'Vient moins souvent', inactive: 'Inactif' },
      th: { name: 'Client', visits: 'Visites', last: 'Dernière visite', rhythm: 'Rythme habituel', spend: 'Dépensé', loyalty: 'Fidélité', group: 'Groupe' },
      days: function (d) { return d === 0 ? 'aujourd’hui' : 'il y a ' + d + ' j'; }, every: function (d) { return 'tous les ' + d + ' j'; }, none: '·',
      emptyBook: 'Aucun client identifié pour l’instant', emptyBookText: 'Attachez un client à une vente en caisse : ses visites apparaîtront ici.',
      th2: { regularDays: 'Régulier si venu depuis moins de', inactiveDays: 'Inactif après', rhythm: 'Vient moins souvent si l’absence dépasse', rhythmUnit: '× son rythme habituel', margin: 'Marge brute moyenne', marginUnit: '%', daysUnit: 'jours' },
      thresholdsTitle: 'Seuils des groupes', thresholdsSub: 'Vous décidez à partir de quand un client est régulier, moins assidu ou inactif.',
      offersTitle: 'Offre par groupe', offersSub: 'Une offre par groupe, avec ses limites. Elle est proposée dans les suggestions, jamais envoyée seule.',
      offerType: { none: 'Aucune remise', percent: 'Pourcentage', fixed: 'Montant fixe', item: 'Article offert', reward: 'Récompense fidélité' },
      f: { type: 'Offre', value: 'Valeur', percentU: '%', madU: 'MAD', itemName: 'Article', itemCost: 'Coût de l’article (MAD)', from: 'Du', to: 'Au', minSpend: 'Achat minimum (MAD)', perClient: 'Utilisations par client', budget: 'Budget total (MAD)', none: 'Sans' },
      save: 'Enregistrer', saved: 'Réglages enregistrés', savedLocal: 'Réglages enregistrés sur cet appareil',
      suggestEmpty: 'Personne à relancer', suggestEmptyText: 'Aucun client des groupes « moins souvent » ou « inactifs » n’a d’offre à recevoir aujourd’hui.',
      why: 'Pourquoi', offer: 'Offre', impact: 'Impact estimé', message: 'Message',
      whyRhythm: function (r, d) { return 'Vient d’habitude tous les ' + r + ' j, pas venu depuis ' + d + ' j.'; },
      whyDays: function (d) { return 'Pas venu depuis ' + d + ' j.'; },
      impactText: function (basket, cost, margin) { return 'Panier moyen ' + basket + ' MAD · coût de l’offre ≈ ' + cost + ' MAD · marge après remise ≈ ' + margin + ' MAD'; },
      offerText: { none: 'Simple message, sans remise', percent: function (v) { return '−' + v + ' % sur la prochaine visite'; }, fixed: function (v) { return '−' + v + ' MAD sur la prochaine visite'; }, item: function (n) { return n + ' offert à la prochaine visite'; }, reward: 'Récompense fidélité débloquée' },
      minSpend: function (v) { return 'dès ' + v + ' MAD'; }, until: function (d) { return 'jusqu’au ' + d; },
      suggestion: 'Kiwi suggère', suggestOffer: function (v) { return '−' + v + ' %, dans la limite de votre marge'; }, useSuggestion: 'Utiliser cette offre pour le groupe',
      draftAi: 'Réécrire avec Kiwi AI', drafting: 'Rédaction…', draftFail: 'Kiwi AI indisponible · le modèle reste en place',
      approve: 'Approuver et ouvrir WhatsApp', noConsent: 'Pas de consentement WhatsApp/SMS', noPhone: 'Pas de numéro',
      alreadySent: 'Déjà envoyé pour cette offre', budgetOut: 'Budget de l’offre atteint', expired: 'Offre hors de ses dates', sent: 'Message préparé dans WhatsApp',
      template: function (name, offerLine, shop) { return 'Bonjour ' + name + ', ça fait un moment ! Toute l’équipe de ' + shop + ' serait ravie de vous revoir. ' + offerLine + '. À très vite.'; },
      templateNoOffer: function (name, shop) { return 'Bonjour ' + name + ', ça fait un moment ! Toute l’équipe de ' + shop + ' serait ravie de vous revoir. À très vite.'; },
      k: { sent: 'Offres envoyées', back: 'Clients revenus', visits: 'Visites après l’offre', revenue: 'Revenu après l’offre', margin: 'Marge après remise (estimée)' },
      resultsEmpty: 'Aucune offre envoyée', resultsEmptyText: 'Les résultats apparaissent après votre premier message approuvé.',
      rh: { name: 'Client', group: 'Groupe', offer: 'Offre', sentAt: 'Envoyé le', back: 'Revenu', visits: 'Visites après', revenue: 'Revenu après' },
      yes: 'Oui', notYet: 'Pas encore', estimated: 'Le coût des offres est estimé : l’application automatique en caisse viendra ensuite.',
      demo: 'Données de démonstration',
    },
    en: {
      title: 'Customer retention', sub: 'Activity · groups · offers · suggestions · results',
      tabs: { activity: 'Activity', groups: 'Groups and offers', suggest: 'Suggestions', results: 'Results' },
      off: 'Customer retention is off', offText: 'Turn it on to sort your customers into groups, pick an offer per group and prepare messages. Nothing is sent without your approval.',
      enable: 'Turn on customer retention', enabled: 'Customer retention is on', disable: 'Turn off',
      group: { regular: 'Regulars', less: 'Visiting less often', inactive: 'Inactive' },
      groupOne: { regular: 'Regular', less: 'Visiting less often', inactive: 'Inactive' },
      th: { name: 'Customer', visits: 'Visits', last: 'Last visit', rhythm: 'Usual rhythm', spend: 'Spent', loyalty: 'Loyalty', group: 'Group' },
      days: function (d) { return d === 0 ? 'today' : d + 'd ago'; }, every: function (d) { return 'every ' + d + 'd'; }, none: '·',
      emptyBook: 'No identified customers yet', emptyBookText: 'Attach a customer to a sale at the till: their visits will appear here.',
      th2: { regularDays: 'Regular if seen within', inactiveDays: 'Inactive after', rhythm: 'Visiting less often if the absence exceeds', rhythmUnit: '× their usual rhythm', margin: 'Average gross margin', marginUnit: '%', daysUnit: 'days' },
      thresholdsTitle: 'Group thresholds', thresholdsSub: 'You decide when a customer counts as regular, less frequent or inactive.',
      offersTitle: 'Offer per group', offersSub: 'One offer per group, with its limits. It is proposed in suggestions, never sent on its own.',
      offerType: { none: 'No discount', percent: 'Percentage', fixed: 'Fixed amount', item: 'Free item', reward: 'Loyalty reward' },
      f: { type: 'Offer', value: 'Value', percentU: '%', madU: 'MAD', itemName: 'Item', itemCost: 'Item cost (MAD)', from: 'From', to: 'To', minSpend: 'Minimum spend (MAD)', perClient: 'Uses per customer', budget: 'Total budget (MAD)', none: 'None' },
      save: 'Save', saved: 'Settings saved', savedLocal: 'Settings saved on this device',
      suggestEmpty: 'Nobody to bring back', suggestEmptyText: 'No customer in the less often or inactive groups has an offer to receive today.',
      why: 'Why', offer: 'Offer', impact: 'Estimated impact', message: 'Message',
      whyRhythm: function (r, d) { return 'Usually visits every ' + r + 'd, last seen ' + d + 'd ago.'; },
      whyDays: function (d) { return 'Last seen ' + d + 'd ago.'; },
      impactText: function (basket, cost, margin) { return 'Average basket ' + basket + ' MAD · offer cost ≈ ' + cost + ' MAD · margin after discount ≈ ' + margin + ' MAD'; },
      offerText: { none: 'Message only, no discount', percent: function (v) { return v + '% off the next visit'; }, fixed: function (v) { return v + ' MAD off the next visit'; }, item: function (n) { return 'Free ' + n + ' on the next visit'; }, reward: 'Loyalty reward unlocked' },
      minSpend: function (v) { return 'from ' + v + ' MAD'; }, until: function (d) { return 'until ' + d; },
      suggestion: 'Kiwi suggests', suggestOffer: function (v) { return v + '% off, within your margin'; }, useSuggestion: 'Use this offer for the group',
      draftAi: 'Rewrite with Kiwi AI', drafting: 'Writing…', draftFail: 'Kiwi AI unavailable · the template stays',
      approve: 'Approve and open WhatsApp', noConsent: 'No WhatsApp/SMS consent', noPhone: 'No phone number',
      alreadySent: 'Already sent for this offer', budgetOut: 'Offer budget reached', expired: 'Offer outside its dates', sent: 'Message ready in WhatsApp',
      template: function (name, offerLine, shop) { return 'Hello ' + name + ', it has been a while! The whole team at ' + shop + ' would love to see you again. ' + offerLine + '. See you soon.'; },
      templateNoOffer: function (name, shop) { return 'Hello ' + name + ', it has been a while! The whole team at ' + shop + ' would love to see you again. See you soon.'; },
      k: { sent: 'Offers sent', back: 'Customers who came back', visits: 'Visits after the offer', revenue: 'Revenue after the offer', margin: 'Margin after discount (estimated)' },
      resultsEmpty: 'No offer sent yet', resultsEmptyText: 'Results appear after your first approved message.',
      rh: { name: 'Customer', group: 'Group', offer: 'Offer', sentAt: 'Sent', back: 'Came back', visits: 'Visits after', revenue: 'Revenue after' },
      yes: 'Yes', notYet: 'Not yet', estimated: 'Offer costs are estimated: automatic application at the till comes next.',
      demo: 'Demo data',
    },
    ar: {
      title: 'الاحتفاظ بالعملاء', sub: 'النشاط · الفئات · العروض · الاقتراحات · النتائج',
      tabs: { activity: 'النشاط', groups: 'الفئات والعروض', suggest: 'الاقتراحات', results: 'النتائج' },
      off: 'الاحتفاظ بالعملاء متوقف', offText: 'فعّله لتصنيف عملائك في فئات، واختيار عرض لكل فئة، وتحضير الرسائل. لا يُرسل شيء دون موافقتك.',
      enable: 'تفعيل الاحتفاظ بالعملاء', enabled: 'الاحتفاظ بالعملاء مفعّل', disable: 'إيقاف',
      group: { regular: 'الدائمون', less: 'يأتون أقل', inactive: 'غير النشطين' },
      groupOne: { regular: 'دائم', less: 'يأتي أقل', inactive: 'غير نشط' },
      th: { name: 'العميل', visits: 'الزيارات', last: 'آخر زيارة', rhythm: 'الإيقاع المعتاد', spend: 'الإنفاق', loyalty: 'الوفاء', group: 'الفئة' },
      days: function (d) { return d === 0 ? 'اليوم' : 'منذ ' + d + ' ي'; }, every: function (d) { return 'كل ' + d + ' ي'; }, none: '·',
      emptyBook: 'لا يوجد عملاء معرّفون بعد', emptyBookText: 'اربط عميلاً ببيع في الصندوق: ستظهر زياراته هنا.',
      th2: { regularDays: 'دائم إذا زار خلال', inactiveDays: 'غير نشط بعد', rhythm: 'يأتي أقل إذا تجاوز الغياب', rhythmUnit: '× إيقاعه المعتاد', margin: 'متوسط الهامش الإجمالي', marginUnit: '%', daysUnit: 'يوم' },
      thresholdsTitle: 'حدود الفئات', thresholdsSub: 'أنت من يحدد متى يكون العميل دائماً أو أقل حضوراً أو غير نشط.',
      offersTitle: 'عرض لكل فئة', offersSub: 'عرض واحد لكل فئة مع حدوده. يُقترح في الاقتراحات ولا يُرسل وحده أبداً.',
      offerType: { none: 'بدون خصم', percent: 'نسبة مئوية', fixed: 'مبلغ ثابت', item: 'منتج مجاني', reward: 'مكافأة الوفاء' },
      f: { type: 'العرض', value: 'القيمة', percentU: '%', madU: 'درهم', itemName: 'المنتج', itemCost: 'تكلفة المنتج (درهم)', from: 'من', to: 'إلى', minSpend: 'الحد الأدنى للشراء (درهم)', perClient: 'مرات الاستعمال لكل عميل', budget: 'الميزانية الإجمالية (درهم)', none: 'بدون' },
      save: 'حفظ', saved: 'تم حفظ الإعدادات', savedLocal: 'تم حفظ الإعدادات على هذا الجهاز',
      suggestEmpty: 'لا أحد للتواصل معه', suggestEmptyText: 'لا يوجد عميل من فئتي «يأتون أقل» أو «غير النشطين» لديه عرض اليوم.',
      why: 'السبب', offer: 'العرض', impact: 'الأثر المقدّر', message: 'الرسالة',
      whyRhythm: function (r, d) { return 'يزور عادة كل ' + r + ' ي، ولم يأت منذ ' + d + ' ي.'; },
      whyDays: function (d) { return 'لم يأت منذ ' + d + ' ي.'; },
      impactText: function (basket, cost, margin) { return 'متوسط السلة ' + basket + ' درهم · تكلفة العرض ≈ ' + cost + ' درهم · الهامش بعد الخصم ≈ ' + margin + ' درهم'; },
      offerText: { none: 'رسالة فقط، بدون خصم', percent: function (v) { return 'خصم ' + v + ' % على الزيارة القادمة'; }, fixed: function (v) { return 'خصم ' + v + ' درهم على الزيارة القادمة'; }, item: function (n) { return n + ' مجاناً في الزيارة القادمة'; }, reward: 'تم فتح مكافأة الوفاء' },
      minSpend: function (v) { return 'ابتداءً من ' + v + ' درهم'; }, until: function (d) { return 'حتى ' + d; },
      suggestion: 'Kiwi يقترح', suggestOffer: function (v) { return 'خصم ' + v + ' % في حدود هامشك'; }, useSuggestion: 'استعمال هذا العرض للفئة',
      draftAi: 'إعادة الصياغة مع Kiwi AI', drafting: 'جارٍ الكتابة…', draftFail: 'Kiwi AI غير متاح · يبقى النموذج',
      approve: 'الموافقة وفتح واتساب', noConsent: 'لا توجد موافقة واتساب/SMS', noPhone: 'لا يوجد رقم',
      alreadySent: 'أُرسل مسبقاً لهذا العرض', budgetOut: 'تم بلوغ ميزانية العرض', expired: 'العرض خارج تواريخه', sent: 'الرسالة جاهزة في واتساب',
      template: function (name, offerLine, shop) { return 'مرحباً ' + name + '، اشتقنا إليك! فريق ' + shop + ' سيسعد برؤيتك من جديد. ' + offerLine + '. إلى اللقاء قريباً.'; },
      templateNoOffer: function (name, shop) { return 'مرحباً ' + name + '، اشتقنا إليك! فريق ' + shop + ' سيسعد برؤيتك من جديد. إلى اللقاء قريباً.'; },
      k: { sent: 'العروض المرسلة', back: 'العملاء العائدون', visits: 'الزيارات بعد العرض', revenue: 'الإيراد بعد العرض', margin: 'الهامش بعد الخصم (تقديري)' },
      resultsEmpty: 'لم يُرسل أي عرض بعد', resultsEmptyText: 'تظهر النتائج بعد أول رسالة توافق عليها.',
      rh: { name: 'العميل', group: 'الفئة', offer: 'العرض', sentAt: 'أُرسل في', back: 'عاد', visits: 'الزيارات بعد', revenue: 'الإيراد بعد' },
      yes: 'نعم', notYet: 'ليس بعد', estimated: 'تكلفة العروض تقديرية: التطبيق التلقائي في الصندوق سيأتي لاحقاً.',
      demo: 'بيانات تجريبية',
    },
  };

  /* ── the store document ────────────────────────────────────────────────── */
  var GROUPS = ['regular', 'less', 'inactive'];
  var OFFER_TYPES = ['none', 'percent', 'fixed', 'item', 'reward'];
  function defaultSettings() { return { enabled: false, regularDays: 30, inactiveDays: 90, rhythmFactor: 1.5, marginPct: 60 }; }
  function defaultOffer(group) {
    return { type: group === 'regular' ? 'none' : 'percent', value: group === 'inactive' ? 15 : (group === 'less' ? 10 : 0),
      item: '', from: '', to: '', minSpend: 0, perClient: 1, budget: 0 };
  }
  function cleanSettings(s) {
    var d = defaultSettings(); s = s || {};
    return {
      enabled: s.enabled === true,
      regularDays: Math.round(num(s.regularDays, 1, 365, d.regularDays)),
      inactiveDays: Math.round(num(s.inactiveDays, 2, 730, d.inactiveDays)),
      rhythmFactor: Math.round(num(s.rhythmFactor, 1, 5, d.rhythmFactor) * 10) / 10,
      marginPct: Math.round(num(s.marginPct, 1, 100, d.marginPct)),
    };
  }
  function cleanOffer(o, group) {
    var d = defaultOffer(group); o = o || {};
    var type = OFFER_TYPES.indexOf(o.type) >= 0 ? o.type : d.type;
    var date = function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; };
    return {
      type: type,
      value: Math.round(num(o.value, 0, type === 'percent' ? 100 : 100000, d.value) * 100) / 100,
      item: String(o.item || '').slice(0, 60),
      from: date(o.from), to: date(o.to),
      minSpend: Math.round(num(o.minSpend, 0, 1000000, 0)),
      perClient: Math.round(num(o.perClient, 1, 50, 1)),
      budget: Math.round(num(o.budget, 0, 10000000, 0)),
    };
  }
  function cleanOffers(all) {
    var out = {}; all = all || {};
    GROUPS.forEach(function (g) { out[g] = cleanOffer(all[g], g); });
    return out;
  }
  var store = window.KiwiStore.define('retention', {
    blank: function () { return { settings: null, offers: null, sends: [] }; },
    cloud: true,
    isEmpty: function (d) { return !d || (!d.settings && !d.offers && !(d.sends || []).length); },
  });
  function readDoc() {
    var d = store.get() || {};
    return { settings: cleanSettings(d.settings), offers: cleanOffers(d.offers), sends: Array.isArray(d.sends) ? d.sends.slice(-500) : [] };
  }
  function isReal() { try { return !!(window.KiwiEnv && KiwiEnv.isReal && KiwiEnv.isReal()); } catch (_) { return false; } }
  var pulled = false;
  async function writeDoc(next) {
    var doc = { settings: cleanSettings(next.settings), offers: cleanOffers(next.offers), sends: (next.sends || []).slice(-500) };
    var cloud = store.cloud && store.cloud();
    if (!cloud || !isReal()) { store.set(doc); return { ok: true, localOnly: true }; }
    /* Read the server copy first: a fresh browser has no revision yet, and a
       blind save would answer « unread » and lose the owner's choice. */
    if (!pulled) { try { await cloud.pull(true); } catch (_) {} pulled = true; }
    store.set(doc);
    try { return Object.assign({ ok: true }, await cloud.save(doc)); } catch (_) { return { ok: false }; }
  }

  /* ── the arithmetic (pure, exported for the test) ──────────────────────── */
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  /* The customer's usual gap between visits, in days. From the dated history
     when there are at least two visits on it, else from first-to-last visit. */
  function rhythmDays(c, now) {
    var ts = (Array.isArray(c.history) ? c.history : []).map(function (h) { return +h.ts || 0; }).filter(Boolean).sort(function (a, b) { return a - b; });
    if (ts.length >= 2) {
      var gaps = [];
      for (var i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / DAY);
      var m = median(gaps.filter(function (g) { return g >= 0.5; }));
      if (m) return Math.max(1, Math.round(m));
    }
    var visits = +c.visits || 0;
    if (visits >= 2 && c.firstSeenTs && c.lastSeenTs && c.lastSeenTs > c.firstSeenTs) {
      return Math.max(1, Math.round((c.lastSeenTs - c.firstSeenTs) / DAY / (visits - 1)));
    }
    return null;
  }
  function daysSinceLast(c, now) {
    if (c.lastSeen) return Math.max(0, Math.floor(((now || Date.now()) - c.lastSeen) / DAY));
    var ts = (Array.isArray(c.history) ? c.history : []).map(function (h) { return +h.ts || 0; });
    var last = ts.length ? Math.max.apply(null, ts) : 0;
    if (last) return Math.max(0, Math.floor(((now || Date.now()) - last) / DAY));
    return Number.isFinite(+c.last) ? +c.last : null;
  }
  function groupOf(c, settings, now) {
    var d = daysSinceLast(c, now);
    if (d == null || !(+c.visits > 0)) return null;
    if (d > settings.inactiveDays) return 'inactive';
    var r = rhythmDays(c, now);
    if (r && (+c.visits || 0) >= 2 && d > Math.max(r * settings.rhythmFactor, 3)) return 'less';
    if (d > settings.regularDays) return 'less';
    return 'regular';
  }
  function avgBasket(c) { var v = +c.visits || 0; return v ? (+c.spend || 0) / v : 0; }
  function offerCost(offer, basket) {
    switch (offer.type) {
      case 'percent': return basket * offer.value / 100;
      case 'fixed': return Math.min(offer.value, basket);
      case 'item': case 'reward': return offer.value;
      default: return 0;
    }
  }
  /* A suggestion that never gives away more than a quarter of the margin of
     an average basket, rounded to a multiple of 5 %. */
  function suggestPercent(group, marginPct) {
    var cap = Math.floor((marginPct / 4) / 5) * 5;
    return Math.max(5, Math.min(group === 'inactive' ? 20 : 10, cap || 5));
  }
  function offerActive(offer, day) {
    day = day || today();
    if (offer.from && day < offer.from) return false;
    if (offer.to && day > offer.to) return false;
    return true;
  }
  function offerKey(group, offer) { return [group, offer.type, offer.value, offer.item, offer.from, offer.to].join('|'); }
  function sendsFor(sends, clientId, key) { return sends.filter(function (s) { return s.clientId === clientId && s.offerKey === key; }).length; }
  function spentBudget(sends, key) { return sends.filter(function (s) { return s.offerKey === key; }).reduce(function (sum, s) { return sum + (+s.cost || 0); }, 0); }
  function outcome(send, c) {
    var after = (Array.isArray(c && c.history) ? c.history : []).filter(function (h) { return (+h.ts || 0) > send.sentAt; });
    var back = after.length > 0 || !!(c && c.lastSeen && c.lastSeen > send.sentAt);
    return { back: back, visits: after.length || (back ? 1 : 0), revenue: after.reduce(function (s, h) { return s + (+h.amount || 0); }, 0) };
  }

  /* ── CSS (tokens only) ─────────────────────────────────────────────────── */
  var CSS = [
    '.cr{display:flex;flex-direction:column;gap:16px;min-width:0;}',
    '.cr-tabs{display:flex;gap:2px;padding:4px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);overflow-x:auto;scrollbar-width:none;max-width:100%;align-self:flex-start;}',
    '.cr-tabs::-webkit-scrollbar{display:none;}',
    '.cr-tab{flex:none;border:0;background:transparent;color:var(--n-600);font:inherit;font-size:13px;font-weight:500;padding:7px 14px;border-radius:999px;cursor:pointer;white-space:nowrap;}',
    '.cr-tab.on{color:var(--ink);}',
    '.cr-tab:not([data-kw-lens] *).on{background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.08);}',
    '.cr-tab em{font-style:normal;color:var(--n-500);margin-inline-start:6px;font-variant-numeric:tabular-nums;}',
    '.cr-card{border:1px solid var(--n-200);border-radius:20px;background:var(--surface);padding:18px 20px;min-width:0;}',
    '.cr-card h3{margin:0 0 4px;font-size:15px;font-weight:600;color:var(--ink);}',
    '.cr-card p.cr-sub{margin:0 0 14px;font-size:13px;color:var(--n-500);line-height:1.45;}',
    '.cr-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}',
    '.cr-kpi{border:1px solid var(--n-200);border-radius:18px;background:var(--surface);padding:16px 18px;min-width:0;}',
    '.cr-kpi .l{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);}',
    '.cr-kpi .v{font-size:28px;font-weight:600;line-height:1;margin-top:12px;font-variant-numeric:tabular-nums;color:var(--ink);}',
    '.cr-kpi .h{font-size:12px;color:var(--n-500);margin-top:6px;}',
    '.cr-tblwrap{overflow-x:auto;border:1px solid var(--n-200);border-radius:20px;background:var(--surface);}',
    '.cr-tbl{width:100%;border-collapse:collapse;min-width:760px;}',
    '.cr-tbl th{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--n-500);text-align:start;padding:13px 16px;white-space:nowrap;border-bottom:1px solid var(--n-200);}',
    '.cr-tbl td{padding:12px 16px;font-size:13.5px;border-top:1px solid var(--n-200);white-space:nowrap;color:var(--ink);}',
    '.cr-tbl tbody tr:first-child td{border-top:0;}',
    '.cr-tbl .num{text-align:end;font-variant-numeric:tabular-nums;}',
    '.cr-muted{color:var(--n-500);}',
    '.cr-tag{display:inline-block;font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;}',
    '.cr-tag.regular{background:var(--mint-soft);color:var(--atlas);}',
    '.cr-tag.less{background:color-mix(in srgb,#E6B84D 22%,transparent);color:#8A6210;}',
    '.cr-tag.inactive{background:color-mix(in srgb,#C0492F 14%,transparent);color:#C0492F;}',
    '.cr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;}',
    '.cr-field{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:600;color:var(--n-600);min-width:0;}',
    '.cr-field input,.cr-field select{height:40px;box-sizing:border-box;padding:0 12px;border:1px solid var(--n-200);border-radius:12px;font:inherit;font-size:14px;font-weight:500;background:var(--surface);color:var(--ink);min-width:0;width:100%;}',
    '.cr-field input:focus,.cr-field select:focus{outline:none;border-color:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 14%,transparent);}',
    '.cr-field .u{font-weight:400;color:var(--n-500);}',
    '.cr-offer{border-top:1px solid var(--n-200);padding-top:14px;margin-top:14px;}',
    '.cr-offer:first-of-type{border-top:0;margin-top:0;padding-top:0;}',
    '.cr-offer h4{margin:0 0 10px;font-size:13.5px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:8px;}',
    '.cr-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:42px;box-sizing:border-box;padding:0 18px;border:1px solid var(--n-200);border-radius:999px;background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;}',
    '.cr-btn svg{width:18px;height:18px;flex:none;}',
    '.cr-btn:hover{border-color:var(--atlas);color:var(--atlas);}',
    '.cr-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--paper);}',
    '.cr-btn.primary:hover{filter:brightness(1.07);color:var(--paper);}',
    '.cr-btn:disabled{opacity:.45;cursor:not-allowed;filter:none;}',
    '.cr-btn:focus-visible,.cr-tab:focus-visible{outline:2px solid var(--atlas);outline-offset:2px;}',
    '.cr-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}',
    '.cr-sugg{display:flex;flex-direction:column;gap:10px;}',
    '.cr-sugg .cr-who{display:flex;align-items:center;gap:12px;}',
    '.cr-av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12.5px;font-weight:600;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas);}',
    '.cr-nm{font-weight:600;color:var(--ink);}',
    '.cr-dl{display:grid;grid-template-columns:120px minmax(0,1fr);gap:6px 14px;font-size:13.5px;margin:0;}',
    '.cr-dl dt{color:var(--n-500);font-weight:600;font-size:12.5px;}',
    '.cr-dl dd{margin:0;color:var(--ink);min-width:0;}',
    '.cr-hint{font-size:12.5px;color:var(--atlas);font-weight:600;}',
    '.cr-msg{width:100%;box-sizing:border-box;min-height:96px;padding:12px 14px;border:1px solid var(--n-200);border-radius:14px;font:inherit;font-size:14px;font-weight:400;line-height:1.5;background:var(--surface);color:var(--ink);resize:vertical;}',
    '.cr-msg:focus{outline:none;border-color:var(--atlas);}',
    '.cr-note{font-size:12.5px;color:var(--n-500);}',
    '.cr-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;padding:48px 20px;border:1px dashed var(--n-200);border-radius:20px;background:var(--surface);}',
    '.cr-empty-ic{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);}',
    '.cr-empty-ic svg{width:28px;height:28px;}',
    '.cr-empty b{font-size:17px;font-weight:600;color:var(--ink);}',
    '.cr-empty p{margin:0;max-width:46ch;color:var(--n-500);font-size:14px;line-height:1.5;}',
    '.cr-badge{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:var(--n-100);color:var(--n-600);}',
    '@media (max-width:640px){.cr-dl{grid-template-columns:1fr;}.cr-btn{width:100%;}.cr-row>.cr-btn{flex:1;}}',
    '@media (max-width:760px){.cr-tbl th:first-child,.cr-tbl td:first-child{position:sticky;inset-inline-start:0;z-index:1;background:var(--surface);box-shadow:inset -1px 0 0 var(--n-200);}.cr-tab{min-height:44px;}.cr-field input,.cr-field select{font-size:16px;height:44px;}}',
  ].join('');
  function injectCSS() {
    if (document.getElementById('cr-css')) return;
    var s = document.createElement('style'); s.id = 'cr-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ── the page ──────────────────────────────────────────────────────────── */
  function shopName() {
    try { var v = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData(); return (v && v.name) || 'Kiwi'; } catch (_) { return 'Kiwi'; }
  }
  function loyaltyLabel(c) {
    try {
      var cfg = window.KiwiClients && KiwiClients.config ? KiwiClients.config() : { model: 'amount' };
      if (cfg.model === 'amount') return fmt(c.points || 0) + ' pts';
      var target = (cfg.model === 'product' ? cfg.product && cfg.product.target : cfg.visit && cfg.visit.target) || 10;
      return (c.stamps || 0) + ' / ' + target;
    } catch (_) { return fmt(c.points || 0) + ' pts'; }
  }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function initials(name) { var p = String(name || '').trim().split(/\s+/).filter(Boolean); return esc(((p[0] || '·').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase()); }
  function waPhone(p) {
    var d = String(p || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.charAt(0) === '+') return d.slice(1);
    if (d.indexOf('00') === 0) return d.slice(2);
    if (d.charAt(0) === '0') return '212' + d.slice(1);   // numéro marocain local
    return d;
  }

  var state = { tab: 'activity' };

  Kiwi.handlers['customer-retention'] = function () {
    injectCSS();
    var T = STR[lang()] || STR.fr;
    var data = (window.KiwiClientsDirectory && KiwiClientsDirectory.load) ? KiwiClientsDirectory.load() : { rows: [], real: isReal() };
    var doc = readDoc();
    var now = Date.now();
    var rows = data.rows.map(function (c) {
      var r = Object.assign({}, c);
      r.lastSeenTs = +c.lastSeen || 0;
      r.firstSeenTs = Number.isFinite(+c.firstSeen) && c.firstSeen !== Infinity ? now - (+c.firstSeen) * DAY : 0;
      r.group = groupOf(r, doc.settings, now);
      r.rhythm = rhythmDays(r, now);
      r.since = daysSinceLast(r, now);
      return r;
    });
    var byId = {}; rows.forEach(function (r) { byId[r.id] = r; });

    function offerLine(o) {
      var parts = [];
      if (o.type === 'percent') parts.push(T.offerText.percent(o.value));
      else if (o.type === 'fixed') parts.push(T.offerText.fixed(fmt(o.value)));
      else if (o.type === 'item') parts.push(T.offerText.item(o.item || T.f.itemName));
      else if (o.type === 'reward') parts.push(T.offerText.reward);
      else return T.offerText.none;
      if (o.minSpend) parts.push(T.minSpend(fmt(o.minSpend)));
      if (o.to) parts.push(T.until(o.to));
      return parts.join(' · ');
    }

    function tabsHtml() {
      var counts = { suggest: candidates().length, results: doc.sends.length };
      return ['activity', 'groups', 'suggest', 'results'].map(function (id) {
        var on = state.tab === id;
        return '<button type="button" class="cr-tab' + (on ? ' on' : '') + '" data-lens-item data-cr-tab="' + id + '" aria-pressed="' + on + '">' + esc(T.tabs[id]) +
          (counts[id] ? '<em>' + counts[id] + '</em>' : '') + '</button>';
      }).join('');
    }

    function emptyHtml(title, text) {
      return '<div class="cr-empty"><span class="cr-empty-ic">' + ico('retention') + '</span><b>' + esc(title) + '</b><p>' + esc(text) + '</p></div>';
    }

    function activityHtml() {
      var counts = { regular: 0, less: 0, inactive: 0 };
      rows.forEach(function (r) { if (r.group) counts[r.group]++; });
      var kpis = '<div class="cr-kpis">' + GROUPS.map(function (g) {
        return '<div class="cr-kpi" data-cr-kpi="' + g + '"><div class="l">' + esc(T.group[g]) + '</div><div class="v">' + fmt(counts[g]) + '</div></div>';
      }).join('') + '</div>';
      var list = rows.filter(function (r) { return r.group; }).sort(function (a, b) { return (b.since || 0) - (a.since || 0); });
      if (!list.length) return kpis + emptyHtml(T.emptyBook, T.emptyBookText);
      return kpis + '<div class="cr-tblwrap" tabindex="0" role="region" aria-label="' + esc(T.tabs.activity) + '"><table class="cr-tbl"><thead><tr>' +
        '<th>' + esc(T.th.name) + '</th><th class="num">' + esc(T.th.visits) + '</th><th>' + esc(T.th.last) + '</th><th>' + esc(T.th.rhythm) + '</th><th class="num">' + esc(T.th.spend) + '</th><th class="num">' + esc(T.th.loyalty) + '</th><th>' + esc(T.th.group) + '</th>' +
        '</tr></thead><tbody>' + list.map(function (r) {
          return '<tr data-cr-client="' + esc(r.id) + '"><td><span class="cr-nm">' + esc(r.name || r.phone || T.none) + '</span></td>' +
            '<td class="num">' + fmt(r.visits || 0) + '</td>' +
            '<td class="cr-muted">' + (r.since == null ? T.none : esc(T.days(r.since))) + '</td>' +
            '<td class="cr-muted">' + (r.rhythm ? esc(T.every(r.rhythm)) : T.none) + '</td>' +
            '<td class="num">' + fmt(r.spend || 0) + ' MAD</td>' +
            '<td class="num">' + esc(loyaltyLabel(r)) + '</td>' +
            '<td><span class="cr-tag ' + r.group + '">' + esc(T.groupOne[r.group]) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>';
    }

    function field(label, html, unit) {
      return '<label class="cr-field"><span>' + esc(label) + (unit ? ' <span class="u">(' + esc(unit) + ')</span>' : '') + '</span>' + html + '</label>';
    }
    function input(name, value, attrs) { return '<input name="' + name + '" value="' + esc(value) + '" ' + (attrs || 'type="number" inputmode="numeric" min="0"') + '>'; }

    function groupsHtml() {
      var s = doc.settings;
      var thresholds = '<div class="cr-card"><h3>' + esc(T.thresholdsTitle) + '</h3><p class="cr-sub">' + esc(T.thresholdsSub) + '</p><div class="cr-grid">' +
        field(T.th2.regularDays, input('regularDays', s.regularDays, 'type="number" inputmode="numeric" min="1" max="365"'), T.th2.daysUnit) +
        field(T.th2.inactiveDays, input('inactiveDays', s.inactiveDays, 'type="number" inputmode="numeric" min="2" max="730"'), T.th2.daysUnit) +
        field(T.th2.rhythm, input('rhythmFactor', s.rhythmFactor, 'type="number" inputmode="decimal" min="1" max="5" step="0.1"'), T.th2.rhythmUnit) +
        field(T.th2.margin, input('marginPct', s.marginPct, 'type="number" inputmode="numeric" min="1" max="100"'), T.th2.marginUnit) +
        '</div></div>';
      var offers = '<div class="cr-card"><h3>' + esc(T.offersTitle) + '</h3><p class="cr-sub">' + esc(T.offersSub) + '</p>' + GROUPS.map(function (g) {
        var o = doc.offers[g];
        var p = function (k) { return g + '.' + k; };
        var typeSel = '<select name="' + p('type') + '">' + OFFER_TYPES.map(function (t) { return '<option value="' + t + '"' + (o.type === t ? ' selected' : '') + '>' + esc(T.offerType[t]) + '</option>'; }).join('') + '</select>';
        var valueUnit = o.type === 'percent' ? T.f.percentU : T.f.madU;
        var valueLabel = (o.type === 'item' || o.type === 'reward') ? T.f.itemCost : T.f.value;
        return '<div class="cr-offer" data-cr-offer="' + g + '"><h4><span class="cr-tag ' + g + '">' + esc(T.group[g]) + '</span></h4><div class="cr-grid">' +
          field(T.f.type, typeSel) +
          (o.type === 'none' ? '' :
            field(valueLabel, input(p('value'), o.value, 'type="number" inputmode="decimal" min="0" step="any"'), (o.type === 'item' || o.type === 'reward') ? '' : valueUnit) +
            (o.type === 'item' ? field(T.f.itemName, input(p('item'), o.item, 'type="text" maxlength="60" autocomplete="off"')) : '') +
            field(T.f.from, input(p('from'), o.from, 'type="date"')) +
            field(T.f.to, input(p('to'), o.to, 'type="date"')) +
            field(T.f.minSpend, input(p('minSpend'), o.minSpend)) +
            field(T.f.perClient, input(p('perClient'), o.perClient, 'type="number" inputmode="numeric" min="1" max="50"')) +
            field(T.f.budget, input(p('budget'), o.budget))) +
          '</div></div>';
      }).join('') + '</div>';
      return thresholds + offers + '<div class="cr-row"><span class="cr-note">' + esc(T.estimated) + '</span><button type="button" class="cr-btn primary" data-cr-save>' + esc(T.save) + '</button></div>';
    }

    function readForm(root) {
      var next = { settings: Object.assign({}, doc.settings), offers: JSON.parse(JSON.stringify(doc.offers)), sends: doc.sends };
      root.querySelectorAll('[name]').forEach(function (el) {
        var name = el.getAttribute('name'), v = el.value;
        if (name.indexOf('.') < 0) { next.settings[name] = v; return; }
        var parts = name.split('.'); if (!next.offers[parts[0]]) return;
        next.offers[parts[0]][parts[1]] = v;
      });
      return next;
    }

    /* Who is offered something today, with what, and why. */
    function candidates() {
      var day = today();
      return rows.filter(function (r) { return r.group === 'less' || r.group === 'inactive'; }).map(function (r) {
        var o = doc.offers[r.group];
        var key = offerKey(r.group, o);
        var basket = avgBasket(r);
        var cost = offerCost(o, basket);
        var blocked = '';
        if (!offerActive(o, day)) blocked = T.expired;
        else if (o.type !== 'none' && sendsFor(doc.sends, r.id, key) >= o.perClient) blocked = T.alreadySent;
        else if (o.type !== 'none' && o.budget && spentBudget(doc.sends, key) + cost > o.budget) blocked = T.budgetOut;
        return { c: r, offer: o, key: key, basket: basket, cost: cost, blocked: blocked };
      }).filter(function (x) { return x.blocked !== T.alreadySent; })
        .sort(function (a, b) { return (b.c.spend || 0) - (a.c.spend || 0); });
    }

    function draftFor(x) {
      var name = firstName(x.c.name) || '';
      return x.offer.type === 'none' ? T.templateNoOffer(name, shopName()) : T.template(name, offerLine(x.offer), shopName());
    }

    function suggestHtml() {
      var list = candidates();
      if (!list.length) return emptyHtml(T.suggestEmpty, T.suggestEmptyText);
      var margin = doc.settings.marginPct;
      return list.slice(0, 60).map(function (x) {
        var c = x.c;
        var why = (c.rhythm && (c.visits || 0) >= 2) ? T.whyRhythm(c.rhythm, c.since) : T.whyDays(c.since);
        var marginAfter = x.basket * margin / 100 - x.cost;
        var suggestion = '';
        if (x.offer.type === 'none') {
          var pct = suggestPercent(c.group, margin);
          suggestion = '<dt>' + esc(T.suggestion) + '</dt><dd><span class="cr-hint">' + esc(T.suggestOffer(pct)) + '</span> <button type="button" class="cr-btn" style="height:32px;padding:0 12px;margin-inline-start:6px" data-cr-adopt="' + c.group + '" data-cr-pct="' + pct + '">' + esc(T.useSuggestion) + '</button></dd>';
        }
        var phone = waPhone(c.phone);
        var reason = x.blocked || (!c.consent ? T.noConsent : (!phone ? T.noPhone : ''));
        return '<div class="cr-card cr-sugg" data-cr-sugg="' + esc(c.id) + '">' +
          '<div class="cr-row"><div class="cr-who"><span class="cr-av">' + initials(c.name || c.phone) + '</span><div><div class="cr-nm">' + esc(c.name || c.phone || T.none) + '</div><div class="cr-muted" style="font-size:12.5px">' + esc(c.phone || '') + '</div></div></div>' +
            '<span class="cr-tag ' + c.group + '">' + esc(T.groupOne[c.group]) + '</span></div>' +
          '<dl class="cr-dl"><dt>' + esc(T.why) + '</dt><dd>' + esc(why) + '</dd>' +
            '<dt>' + esc(T.offer) + '</dt><dd>' + esc(offerLine(x.offer)) + '</dd>' + suggestion +
            '<dt>' + esc(T.impact) + '</dt><dd>' + esc(T.impactText(fmt(x.basket), fmt(x.cost), fmt(marginAfter))) + '</dd></dl>' +
          '<label class="cr-field"><span>' + esc(T.message) + '</span><textarea class="cr-msg" data-cr-msg>' + esc(draftFor(x)) + '</textarea></label>' +
          '<div class="cr-row">' + (reason ? '<span class="cr-note">' + esc(reason) + '</span>' : '<span></span>') +
            '<div class="cr-row" style="justify-content:flex-end">' +
              '<button type="button" class="cr-btn" data-cr-ai>' + esc(T.draftAi) + '</button>' +
              '<button type="button" class="cr-btn primary" data-cr-send' + (reason ? ' disabled' : '') + '>' + esc(T.approve) + '</button></div></div>' +
        '</div>';
      }).join('');
    }

    function resultsHtml() {
      if (!doc.sends.length) return emptyHtml(T.resultsEmpty, T.resultsEmptyText);
      var margin = doc.settings.marginPct;
      var tot = { sent: doc.sends.length, back: 0, visits: 0, revenue: 0, cost: 0 };
      var lines = doc.sends.slice().reverse().map(function (s) {
        var o = outcome(s, byId[s.clientId]);
        if (o.back) { tot.back++; tot.cost += +s.cost || 0; }
        tot.visits += o.visits; tot.revenue += o.revenue;
        return '<tr><td><span class="cr-nm">' + esc(s.name || T.none) + '</span></td>' +
          '<td><span class="cr-tag ' + esc(s.group) + '">' + esc(T.groupOne[s.group] || s.group) + '</span></td>' +
          '<td>' + esc(s.offerLabel || '') + '</td>' +
          '<td class="cr-muted">' + esc(new Date(s.sentAt).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'fr-FR')) + '</td>' +
          '<td>' + (o.back ? esc(T.yes) : '<span class="cr-muted">' + esc(T.notYet) + '</span>') + '</td>' +
          '<td class="num">' + fmt(o.visits) + '</td><td class="num">' + fmt(o.revenue) + ' MAD</td></tr>';
      }).join('');
      var marginAfter = tot.revenue * margin / 100 - tot.cost;
      var pct = tot.sent ? Math.round(tot.back / tot.sent * 100) : 0;
      return '<div class="cr-kpis">' +
        '<div class="cr-kpi" data-cr-kpi="sent"><div class="l">' + esc(T.k.sent) + '</div><div class="v">' + fmt(tot.sent) + '</div></div>' +
        '<div class="cr-kpi" data-cr-kpi="back"><div class="l">' + esc(T.k.back) + '</div><div class="v">' + fmt(tot.back) + '</div><div class="h">' + pct + ' %</div></div>' +
        '<div class="cr-kpi" data-cr-kpi="visits"><div class="l">' + esc(T.k.visits) + '</div><div class="v">' + fmt(tot.visits) + '</div></div>' +
        '<div class="cr-kpi" data-cr-kpi="revenue"><div class="l">' + esc(T.k.revenue) + '</div><div class="v">' + fmt(tot.revenue) + '</div><div class="h">MAD</div></div>' +
        '<div class="cr-kpi" data-cr-kpi="margin"><div class="l">' + esc(T.k.margin) + '</div><div class="v">' + fmt(marginAfter) + '</div><div class="h">MAD</div></div>' +
        '</div><div class="cr-tblwrap" tabindex="0" role="region" aria-label="' + esc(T.tabs.results) + '"><table class="cr-tbl"><thead><tr>' +
        ['name', 'group', 'offer', 'sentAt', 'back', 'visits', 'revenue'].map(function (k) { return '<th' + (k === 'visits' || k === 'revenue' ? ' class="num"' : '') + '>' + esc(T.rh[k]) + '</th>'; }).join('') +
        '</tr></thead><tbody>' + lines + '</tbody></table></div><p class="cr-note">' + esc(T.estimated) + '</p>';
    }

    function offHtml() {
      return '<div class="cr-empty"><span class="cr-empty-ic">' + ico('retention') + '</span><b>' + esc(T.off) + '</b><p>' + esc(T.offText) + '</p>' +
        '<button type="button" class="cr-btn primary" data-cr-enable>' + esc(T.enable) + '</button></div>';
    }

    function bodyHtml() {
      if (!doc.settings.enabled) return offHtml();
      var panel = state.tab === 'groups' ? groupsHtml() : state.tab === 'suggest' ? suggestHtml() : state.tab === 'results' ? resultsHtml() : activityHtml();
      return '<div class="cr-row"><div class="cr-tabs" data-lens-demo role="group" aria-label="' + esc(T.title) + '">' + tabsHtml() + '</div>' +
        '<span class="cr-row" style="gap:8px">' + (data.real ? '' : '<span class="cr-badge">' + esc(T.demo) + '</span>') +
        '<button type="button" class="cr-btn" data-cr-disable>' + esc(T.disable) + '</button></span></div>' +
        '<div data-cr-panel>' + panel + '</div>';
    }

    var page = Kiwi.appPage
      ? Kiwi.appPage('retention', { title: T.title, subtitle: shopName() + ' · ' + T.sub, body: '<div class="cr" data-cr-root>' + bodyHtml() + '</div>' })
      : Kiwi.drawer({ title: T.title, subtitle: T.sub, fullpage: true, body: '<div class="cr" data-cr-root>' + bodyHtml() + '</div>' });
    try {
      document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.remove('active'); });
      document.querySelectorAll('.sidebar nav a[data-action="customer-retention"]').forEach(function (a) { a.classList.add('active'); });
    } catch (_) {}
    var root = page.el.querySelector('[data-cr-root]');
    function rerender() {
      root.innerHTML = bodyHtml();
      try { window.KiwiLens && KiwiLens.rescan && KiwiLens.rescan(); } catch (_) {}
    }
    function toast(msg, type) { try { Kiwi.toast && Kiwi.toast(msg, { type: type || 'success' }); } catch (_) {} }
    async function persist(next, okMsg) {
      var res = await writeDoc(next);
      doc = readDoc();
      rows.forEach(function (r) { r.group = groupOf(r, doc.settings, now); });
      if (okMsg) toast(res && res.localOnly ? T.savedLocal : okMsg, res && res.ok === false ? 'error' : 'success');
      rerender();
    }

    /* Pull the server copy once, then repaint with it. */
    (function () {
      var cloud = store.cloud && store.cloud();
      if (!cloud || !isReal()) return;
      Promise.resolve(cloud.pull(true)).then(function () { pulled = true; doc = readDoc(); rows.forEach(function (r) { r.group = groupOf(r, doc.settings, now); }); rerender(); }).catch(function () {});
    })();

    /* Changing an offer's kind shows its own fields at once. The draft is
       kept on screen and only written when the owner presses Save. */
    root.addEventListener('change', function (e) {
      var name = e.target && e.target.getAttribute && e.target.getAttribute('name');
      if (!name || !/\.type$/.test(name)) return;
      var draft = readForm(root);
      doc = { settings: cleanSettings(draft.settings), offers: cleanOffers(draft.offers), sends: doc.sends };
      rerender();
    });
    root.addEventListener('click', function (e) {
      var t = e.target;
      var tab = t.closest('[data-cr-tab]');
      if (tab) { state.tab = tab.getAttribute('data-cr-tab'); rerender(); return; }
      if (t.closest('[data-cr-enable]')) { var n = readDoc(); n.settings.enabled = true; persist(n, T.enabled); return; }
      if (t.closest('[data-cr-disable]')) { var m = readDoc(); m.settings.enabled = false; persist(m, null); return; }
      if (t.closest('[data-cr-save]')) { persist(readForm(root), T.saved); return; }
      var adopt = t.closest('[data-cr-adopt]');
      if (adopt) {
        var nx = readDoc(); var g = adopt.getAttribute('data-cr-adopt');
        nx.offers[g] = Object.assign({}, nx.offers[g], { type: 'percent', value: +adopt.getAttribute('data-cr-pct') });
        persist(nx, T.saved); return;
      }
      var card = t.closest('[data-cr-sugg]');
      if (!card) return;
      var x = candidates().filter(function (k) { return k.c.id === card.getAttribute('data-cr-sugg'); })[0];
      if (!x) return;
      var msg = card.querySelector('[data-cr-msg]');
      var aiBtn = t.closest('[data-cr-ai]');
      if (aiBtn) {
        aiBtn.disabled = true; var label = aiBtn.textContent; aiBtn.textContent = T.drafting;
        var objective = (x.c.group === 'inactive' ? 'Faire revenir un client inactif' : 'Faire revenir un client qui vient moins souvent') +
          ' · ' + ((x.c.rhythm && x.c.visits >= 2) ? STR.fr.whyRhythm(x.c.rhythm, x.c.since) : STR.fr.whyDays(x.c.since)) + ' · Commerce : ' + shopName();
        fetch('/api/ai/whatsapp-campaign', {
          method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ objective: objective, offer: x.offer.type !== 'none' ? offerLine(x.offer) : '' }),
        }).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return r.ok ? j : null; }); })
          .then(function (j) {
            var text = j && j.ok && j.data && (lang() === 'ar' ? (j.data.darijaMessage || j.data.frenchMessage) : (j.data.frenchMessage || j.data.darijaMessage));
            if (text) msg.value = String(text).replace(/\{prenom\}/g, firstName(x.c.name));
            else toast(T.draftFail, 'warning');
          })
          .catch(function () { toast(T.draftFail, 'warning'); })
          .then(function () { aiBtn.disabled = false; aiBtn.textContent = label; });
        return;
      }
      if (t.closest('[data-cr-send]')) {
        var phone = waPhone(x.c.phone);
        if (x.blocked || !x.c.consent || !phone) return;
        var text = String(msg.value || '').trim().slice(0, 1000);
        if (!text) return;
        /* Open WhatsApp first, inside the click: a popup opened after an await
           is blocked on iOS. The log follows. */
        try { window.open('https://wa.me/' + encodeURIComponent(phone) + '?text=' + encodeURIComponent(text), '_blank', 'noopener'); } catch (_) {}
        var next = readDoc();
        next.sends = next.sends.concat([{
          id: 'rt-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          clientId: String(x.c.id), name: String(x.c.name || x.c.phone || '').slice(0, 80), group: x.c.group,
          offerKey: x.key, offerLabel: offerLine(x.offer).slice(0, 120), cost: Math.round(x.cost * 100) / 100,
          channel: 'whatsapp', sentAt: Date.now(),
        }]);
        persist(next, T.sent);
      }
    });
  };

  /* Exported for tools/customer-retention-test.mjs · pure functions only. */
  window.KiwiRetention = {
    groupOf: groupOf, rhythmDays: rhythmDays, daysSinceLast: daysSinceLast, offerCost: offerCost,
    suggestPercent: suggestPercent, offerActive: offerActive, offerKey: offerKey, outcome: outcome,
    cleanSettings: cleanSettings, cleanOffer: cleanOffer, waPhone: waPhone,
  };
})();
