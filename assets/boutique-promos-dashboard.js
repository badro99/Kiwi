/* Kiwi · Boutique promotions manager — owner dashboard only.
 * The price engine stays in assets/promos.js and is read by the caisse. This
 * file owns the create/edit/pause/delete UI that used to live in the till. */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;

  var K = window.Kiwi;
  var H = K.handlers;
  var DAY = 86400000;
  var filter = 'active';
  var subscribed = false;
  var promoModal = null;
  var composerContext = null;
  var composer = { draft: null, editing: null };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  function lang() { var l = window.KiwiI18n && window.KiwiI18n.getLang ? window.KiwiI18n.getLang() : document.documentElement.lang; return l === 'en' || l === 'ar' ? l : 'fr'; }
  var COPY = [
    ['Promotions', 'Promotions', 'العروض الترويجية'],
    ['Prix synchronisés', 'Synchronized prices', 'أسعار متزامنة'],
    ['Une offre à créer.', 'Create an offer.', 'أنشئ عرضًا.'],
    ['Kiwi s’occupe du reste.', 'Kiwi takes care of the rest.', 'تتكفل كيوي بالباقي.'],
    ['Choisissez la remise, les articles et la durée. La caisse applique le bon prix automatiquement, sans manipulation au comptoir.', 'Choose the discount, items and duration. The register applies the right price automatically, with no manual changes at the counter.', 'اختر الخصم والمنتجات والمدة. تطبق نقطة البيع السعر الصحيح تلقائيًا، دون تدخل يدوي عند الصندوق.'],
    ['Créer une promotion', 'Create a promotion', 'إنشاء عرض ترويجي'],
    ['Ce que Kiwi synchronise', 'What Kiwi synchronizes', 'ما تزامنه كيوي'],
    ['Prix caisse', 'Register prices', 'أسعار نقطة البيع'],
    ['Mis à jour instantanément', 'Updated instantly', 'تُحدَّث فورًا'],
    ['Tickets & reçus', 'Tickets & receipts', 'التذاكر والإيصالات'],
    ['Remise clairement affichée', 'Discount clearly displayed', 'الخصم معروض بوضوح'],
    ['Étiquettes', 'Labels', 'الملصقات'],
    ['Prêtes à imprimer', 'Ready to print', 'جاهزة للطباعة'],
    ['Démarrer rapidement', 'Get started quickly', 'ابدأ بسرعة'],
    ['Trois modèles prêts à adapter', 'Three templates ready to adapt', 'ثلاثة نماذج جاهزة للتخصيص'],
    ['Chaque modèle ouvre un brouillon : rien ne change avant votre validation.', 'Each template opens a draft: nothing changes until you confirm.', 'يفتح كل نموذج مسودة: لا يتغير شيء قبل تأكيدك.'],
    ['Stock dormant', 'Dormant stock', 'مخزون راكد'], ['Déstocker l’ancienne saison', 'Clear last season’s stock', 'تصريف مخزون الموسم السابق'],
    ['Articles entrés il y a plus de 6 mois', 'Items stocked more than 6 months ago', 'منتجات دخلت المخزون منذ أكثر من 6 أشهر'],
    ['Faible stock', 'Low stock', 'مخزون منخفض'], ['Écouler les fins de série', 'Clear remaining stock', 'تصريف الكميات المتبقية'],
    ['Articles avec 5 pièces ou moins', 'Items with 5 units or fewer', 'منتجات بقيت منها 5 وحدات أو أقل'],
    ['Temps fort', 'Special occasion', 'مناسبة مميزة'], ['Animer le week-end', 'Run a weekend offer', 'تنشيط عروض نهاية الأسبوع'],
    ['Tout le magasin jusqu’à dimanche soir', 'The whole store until Sunday evening', 'المتجر بأكمله حتى مساء الأحد'],
    ['Synchronisé avec la caisse', 'Synchronized with the register', 'متزامن مع نقطة البيع'],
    ['Les prix actifs sont appliqués automatiquement.', 'Active prices are applied automatically.', 'تُطبق الأسعار السارية تلقائيًا.'],
    ['Nouvelle promotion', 'New promotion', 'عرض ترويجي جديد'], ['État des promotions', 'Promotion status', 'حالة العروض الترويجية'],
    ['En cours', 'Active', 'سارية'], ['À venir & en pause', 'Upcoming & paused', 'قادمة ومتوقفة'], ['Terminées', 'Ended', 'منتهية'],
    ['Aucune promotion ici', 'No promotions here', 'لا توجد عروض ترويجية هنا'],
    ['Changez de section ou créez une nouvelle offre.', 'Choose another section or create a new offer.', 'اختر قسمًا آخر أو أنشئ عرضًا جديدًا.'],
    ['Tout le magasin', 'The whole store', 'المتجر بأكمله'], ['Un rayon', 'One department', 'قسم واحد'], ['Des articles', 'Selected items', 'منتجات محددة'],
    ['Ancien stock', 'Older stock', 'المخزون القديم'], ['Fin de série', 'Remaining stock', 'الكميات المتبقية'],
    ['Chaque article du magasin, sans exception.', 'Every item in the store, without exception.', 'كل منتج في المتجر دون استثناء.'],
    ['Chercher un article ou scanner son code-barres…', 'Search for an item or scan its barcode…', 'ابحث عن منتج أو امسح رمزه الشريطي…'],
    ['Aucun article choisi.', 'No items selected.', 'لم يتم اختيار أي منتج.'], ['Aucun article trouvé.', 'No items found.', 'لم يتم العثور على أي منتج.'],
    ['Plus de 3 mois', 'Over 3 months', 'أكثر من 3 أشهر'], ['Plus de 6 mois', 'Over 6 months', 'أكثر من 6 أشهر'], ['Plus d’un an', 'Over a year', 'أكثر من سنة'],
    ['Vise les articles entrés avant cette date.', 'Targets items stocked before this date.', 'يستهدف المنتجات التي دخلت المخزون قبل هذا التاريخ.'],
    ['ou un seuil à vous', 'or your own threshold', 'أو حدًا من اختيارك'],
    ['La cible suit automatiquement le stock disponible.', 'The selection automatically follows available stock.', 'يتبع اختيار المنتجات المخزون المتوفر تلقائيًا.'],
    ['Définir l’offre', 'Define the offer', 'تحديد العرض'], ['Le nom et la baisse de prix', 'Name and price reduction', 'الاسم وتخفيض السعر'],
    ['Nom', 'Name', 'الاسم'], ['· visible sur le reçu', '· visible on the receipt', '· يظهر على الإيصال'],
    ['Soldes d’été, Déstockage…', 'Summer sale, Stock clearance…', 'تخفيضات الصيف، تصفية المخزون…'],
    ['Type de remise', 'Discount type', 'نوع الخصم'], ['Pourcentage', 'Percentage', 'نسبة مئوية'], ['Montant', 'Amount', 'مبلغ'], ['Prix final', 'Final price', 'السعر النهائي'],
    ['Choisir les articles', 'Choose the items', 'اختيار المنتجات'], ['Kiwi garde cette sélection à jour', 'Kiwi keeps this selection up to date', 'تُحدِّث كيوي هذا الاختيار باستمرار'],
    ['Programmer la durée', 'Schedule the duration', 'تحديد مدة العرض'], ['Démarrez maintenant ou planifiez', 'Start now or schedule ahead', 'ابدأ الآن أو حدد موعدًا لاحقًا'],
    ['Aujourd’hui', 'Today', 'اليوم'], ['Ce week-end', 'This weekend', 'نهاية هذا الأسبوع'], ['7 jours', '7 days', '7 أيام'], ['30 jours', '30 days', '30 يومًا'], ['Sans fin', 'No end date', 'دون تاريخ انتهاء'],
    ['Début', 'Start', 'البداية'], ['· vide = maintenant', '· empty = now', '· فارغ = الآن'], ['Fin', 'End', 'النهاية'], ['· vide = sans fin', '· empty = no end date', '· فارغ = دون تاريخ انتهاء'],
    ['Aperçu en direct', 'Live preview', 'معاينة مباشرة'], ['Articles concernés', 'Items included', 'المنتجات المشمولة'], ['article', 'item', 'منتج'], ['articles', 'items', 'منتجات'],
    ['Prix plein', 'Full price', 'السعر الكامل'], ['Prix promo', 'Promotion price', 'سعر العرض'], ['Vous offrez', 'You give', 'تمنح'], ['si tout part.', 'if everything sells.', 'إذا بيعت كل المنتجات.'],
    ['Annuler', 'Cancel', 'إلغاء'], ['Enregistrer', 'Save', 'حفظ'], ['Lancer la promotion', 'Launch promotion', 'إطلاق العرض'],
    ['Modifier la promotion', 'Edit promotion', 'تعديل العرض الترويجي'], ['Trois choix, puis Kiwi applique les bons prix partout.', 'Three choices, then Kiwi applies the right prices everywhere.', 'ثلاثة اختيارات، ثم تطبق كيوي الأسعار الصحيحة في كل مكان.'],
    ['Prête à être enregistrée', 'Ready to save', 'جاهزة للحفظ'], ['Prête à être lancée', 'Ready to launch', 'جاهزة للإطلاق'],
    ['Choisissez de combien vous baissez le prix', 'Choose the price reduction', 'اختر مقدار تخفيض السعر'],
    ['Pourcentage non autorisé dans les réglages', 'Percentage not allowed in settings', 'هذه النسبة غير مسموح بها في الإعدادات'],
    ['Choisissez au moins un élément à viser', 'Choose at least one item to target', 'اختر عنصرًا واحدًا على الأقل لاستهدافه'],
    ['Choisissez la date avant laquelle les articles sont visés', 'Choose the stock cutoff date', 'اختر التاريخ الذي دخلت المنتجات المخزون قبله'],
    ['Indiquez le seuil de stock', 'Enter the stock threshold', 'أدخل حد المخزون'], ['La date de fin doit venir après le début', 'The end date must be after the start', 'يجب أن يكون تاريخ الانتهاء بعد البداية'],
    ['Aucun article ne correspond à cette cible.', 'No items match this selection.', 'لا تطابق أي منتجات هذا الاختيار.'],
    ['Programmée', 'Scheduled', 'مجدولة'], ['En pause', 'Paused', 'متوقفة'], ['Terminée', 'Ended', 'منتهية'], ['prix', 'price', 'السعر'], ['offre', 'offer', 'العرض'],
    ['Imprimer les étiquettes', 'Print labels', 'طباعة الملصقات'], ['Reprendre', 'Resume', 'استئناف'], ['Mettre en pause', 'Pause', 'إيقاف مؤقت'], ['Modifier', 'Edit', 'تعديل'], ['Supprimer', 'Delete', 'حذف'], ['Garder', 'Keep', 'إبقاء'], ['Fermer', 'Close', 'إغلاق'],
    ['Promotions indisponibles', 'Promotions unavailable', 'العروض الترويجية غير متاحة'], ['Rechargez le dashboard pour charger le module.', 'Reload the dashboard to load the module.', 'أعد تحميل لوحة التحكم لتحميل الوحدة.'],
    ['Les articles repassent immédiatement au prix plein. Les ventes encaissées ne changent pas.', 'Items immediately return to full price. Completed sales do not change.', 'تعود المنتجات فورًا إلى السعر الكامل. لا تتغير المبيعات المحصلة.'],
    ['Chaque étiquette portera le prix réellement appliqué en caisse.', 'Each label shows the price actually applied at the register.', 'يعرض كل ملصق السعر المطبق فعليًا عند نقطة البيع.'], ['Aucun article en stock avec un code-barres.', 'No stocked items have a barcode.', 'لا توجد منتجات في المخزون تحمل رمزًا شريطيًا.'],
    ['Imprimer', 'Print', 'طباعة'],
    ['{count} promotions en cours', '{count} active promotions', 'العروض السارية: {count}'], ['{count} promotion en cours', '{count} active promotion', 'العروض السارية: {count}'],
    ['{count} articles remisés', '{count} discounted items', 'المنتجات المخفضة: {count}'], ['{count} article remisé', '{count} discounted item', 'المنتجات المخفضة: {count}'],
    ['{count} articles concernés', '{count} items included', 'المنتجات المشمولة: {count}'], ['{count} article concerné', '{count} item included', 'المنتجات المشمولة: {count}'],
    ['{count} ou moins', '{count} or fewer', '{count} أو أقل'], ['{count} articles passent sous le prix d’achat.', '{count} items fall below purchase cost.', 'منتجات بسعر أقل من تكلفة الشراء: {count}'], ['{count} article passe sous le prix d’achat.', '{count} item falls below purchase cost.', 'منتجات بسعر أقل من تكلفة الشراء: {count}'],
    ['Aucun rayon choisi', 'No department selected', 'لم يتم اختيار أي قسم'], ['Aucun article choisi', 'No items selected', 'لم يتم اختيار أي منتج'], ['1 article', '1 item', 'منتج واحد'], ['{count} articles choisis', '{count} items selected', 'المنتجات المختارة: {count}'],
    ['{first} et {second}', '{first} and {second}', '{first} و{second}'], ['{first} et {count} autres rayons', '{first} and {count} other departments', '{first} وأقسام أخرى: {count}'],
    ['Entré en stock avant le {date}', 'Stocked before {date}', 'دخل المخزون قبل {date}'], ['Aucune date choisie', 'No date selected', 'لم يتم اختيار أي تاريخ'], ['Il en reste {count} ou moins', '{count} units or fewer remain', 'الوحدات المتبقية: {count} أو أقل'],
    ['En pause, aucun prix n’est modifié', 'Paused, no prices are changed', 'متوقف، لا يتم تغيير أي سعر'], ['Démarre demain · {date}', 'Starts tomorrow · {date}', 'يبدأ غدًا · {date}'], ['Démarre dans {count} jours · {date}', 'Starts in {count} days · {date}', 'يبدأ بعد {count} أيام · {date}'], ['Terminée le {date}', 'Ended on {date}', 'انتهى في {date}'],
    ['Sans date de fin, jusqu’à ce que vous l’arrêtiez', 'No end date, until you stop it', 'دون تاريخ انتهاء، حتى توقفه'], ['Se termine à {time}', 'Ends at {time}', 'ينتهي في {time}'], ['Se termine aujourd’hui à {time}', 'Ends today at {time}', 'ينتهي اليوم في {time}'], ['Se termine dans {count} jours · {date}', 'Ends in {count} days · {date}', 'ينتهي بعد {count} أيام · {date}'],
    ['{name} enregistrée', '{name} saved', 'تم حفظ {name}'], ['{name} lancée, la caisse est à jour', '{name} launched, the register is up to date', 'تم إطلاق {name}، نقطة البيع محدَّثة'], ['{name} reprend', '{name} resumed', 'تم استئناف {name}'], ['{name} mise en pause', '{name} paused', 'تم إيقاف {name} مؤقتًا'], ['{name} supprimée', '{name} deleted', 'تم حذف {name}'], ['Supprimer « {name} » ?', 'Delete “{name}”?', 'حذف «{name}»؟'], ['Étiquettes · {name}', 'Labels · {name}', 'الملصقات · {name}'],
    ['étiquette', 'label', 'ملصق'], ['étiquettes', 'labels', 'ملصقات']
  ];
  var copyByFr = Object.create(null);
  COPY.forEach(function (row) { copyByFr[row[0]] = row; });
  function tr(fr, data) { var row = copyByFr[fr], text = row ? row[lang() === 'en' ? 1 : lang() === 'ar' ? 2 : 0] : fr; return text.replace(/\{(\w+)\}/g, function (whole, key) { return data && data[key] != null ? String(data[key]) : whole; }); }
  function ui(fr, data) { return '<bdi data-bpd-copy="' + esc(fr) + '"' + (data ? ' data-bpd-values="' + esc(JSON.stringify(data)) + '"' : '') + '>' + esc(tr(fr, data)) + '</bdi>'; }
  // Declare only exact authored interface leaves at render time. Merchant data
  // is excluded explicitly, not translated by a text-matching observer.
  function localHtml(html) {
    var template = document.createElement('template'); template.innerHTML = html;
    template.content.querySelectorAll('[data-bpd-data]').forEach(function (element) { element.setAttribute('data-no-num-fix', ''); });
    var walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT), leaves = [], node;
    while ((node = walker.nextNode())) leaves.push(node);
    leaves.forEach(function (leaf) {
      if (!leaf.parentElement || leaf.parentElement.closest('[data-bpd-data],[data-bpd-copy]')) return;
      var source = leaf.textContent.trim();
      if (!copyByFr[source]) return;
      var copy = document.createElement('bdi'); copy.setAttribute('data-bpd-copy', source); copy.textContent = tr(source);
      var leading = leaf.textContent.slice(0, leaf.textContent.indexOf(source)), trailing = leaf.textContent.slice(leading.length + source.length);
      leaf.replaceWith(document.createTextNode(leading), copy, document.createTextNode(trailing));
    });
    ['placeholder', 'title', 'aria-label'].forEach(function (attr) {
      template.content.querySelectorAll('[' + attr + ']').forEach(function (element) {
        var source = element.getAttribute(attr);
        if (copyByFr[source]) { element.setAttribute('data-bpd-' + (attr === 'aria-label' ? 'aria' : attr), source); element.setAttribute(attr, tr(source)); }
      });
    });
    return template.innerHTML;
  }
  function localize(root) {
    root.querySelectorAll('[data-bpd-copy]').forEach(function (node) { var data; try { data = JSON.parse(node.getAttribute('data-bpd-values') || '{}'); } catch (_) { data = {}; } node.textContent = tr(node.getAttribute('data-bpd-copy'), data); });
    root.querySelectorAll('[data-bpd-placeholder]').forEach(function (node) { node.placeholder = tr(node.getAttribute('data-bpd-placeholder')); });
    root.querySelectorAll('[data-bpd-title]').forEach(function (node) { node.title = tr(node.getAttribute('data-bpd-title')); });
    root.querySelectorAll('[data-bpd-aria]').forEach(function (node) { node.setAttribute('aria-label', tr(node.getAttribute('data-bpd-aria'))); });
    root.querySelectorAll('[data-bpd-scope]').forEach(function (node) { node.textContent = scopeText(context(), { scope:JSON.parse(node.getAttribute('data-bpd-scope')) }); });
    root.querySelectorAll('[data-bpd-when]').forEach(function (node) { node.textContent = whenText(JSON.parse(node.getAttribute('data-bpd-when'))); });
  }
  function modalCopy(modal, title, values, description) {
    modal.el.setAttribute('data-bpd-dialog', '');
    var heading = modal.el.querySelector('.kiwi-modal-head h3'), desc = modal.el.querySelector('.kiwi-modal-head p');
    if (heading) { heading.setAttribute('data-bpd-copy', title); heading.setAttribute('data-bpd-values', JSON.stringify(values || {})); if (values && values.name != null) heading.setAttribute('data-no-num-fix', ''); }
    if (desc) desc.setAttribute('data-bpd-copy', description);
    return modal;
  }
  var money = function (n) { var value = Math.round(+n || 0); return window.KiwiNumber ? window.KiwiNumber.money(value) : new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }).format(value) + ' MAD'; };
  var moneyHtml = function (n) { return '<bdi dir="ltr" data-bpd-money data-no-num-fix>' + esc(money(n)) + '</bdi>'; };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtDay = function (d) { return new Intl.DateTimeFormat(lang() === 'ar' ? 'ar-MA-u-nu-latn' : lang() === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d); };
  var fmtHM = function (d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  var startOfDay = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  var endOfDay = function (d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };
  var toInput = function (ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  var icons = function () { try { if (window.lucide) window.lucide.createIcons(); } catch (_) {} };

  function CAT() { return window.KiwiBoutiqueCatalog; }
  function PRM() { return window.KiwiPromos; }
  function venueKey() { return window.KiwiBoutiqueVenueKey ? window.KiwiBoutiqueVenueKey() : 'maisonMansour'; }
  function ready() { return !!(CAT() && PRM()); }

  function context() {
    var cat = CAT();
    var key = venueKey();
    cat.use(key);
    PRM().use(key);
    try {
      if (window.KiwiCloudDoc) PRM().cloud(function () { return window.KiwiCloudDoc.slugFor(PRM().currentVenue()); });
    } catch (_) {}
    var c = cat.compat();
    return { cat: cat, key: key, rayons: c.RAYONS || [], products: c.P || {}, byEan: c.BY_EAN || {} };
  }

  function items(ctx) {
    return Object.keys(ctx.products).filter(function (id) { return ctx.products[id] && ctx.products[id].id === id; }).map(function (id) { return ctx.products[id]; });
  }
  function stockOf(it) { return PRM().stockOf(it); }
  function preview(ctx, p) { return PRM().preview(p, items(ctx), { stockOf: stockOf }); }

  function injectCss() {
    if (document.getElementById('bpd-css')) return;
    var s = document.createElement('style');
    s.id = 'bpd-css';
    s.textContent = `
      .bpd-page{--bpd-warn:#8A6210;--bpd-warn-bg:rgba(217,154,43,.16);padding-bottom:42px}
      .bpd-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
      .bpd-head h2{margin:0;font-size:25px}.bpd-sub{font-size:12.5px;color:var(--n-500);margin-top:4px}
      .bpd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 14px;border-radius:11px;border:1px solid var(--line);background:var(--paper);color:var(--ink);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
      .bpd-btn svg{width:15px;height:15px}.bpd-btn.primary{background:var(--atlas);border-color:var(--atlas);color:#fff}.bpd-btn.danger{color:#9B2F22}.bpd-btn:disabled{opacity:.4;cursor:default}
      .bpd-seg{display:flex;width:max-content;max-width:100%;gap:3px;padding:4px;border-radius:13px;background:var(--paper-soft);margin-bottom:17px}
      .bpd-seg button{display:flex;align-items:center;gap:7px;padding:8px 13px;border:0;border-radius:10px;background:transparent;color:var(--n-600);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}.bpd-seg button.on{background:var(--atlas);color:#fff}.bpd-seg small{font-family:var(--mono);opacity:.75}
      .bpd-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:14px}
      .bpd-card{display:flex;overflow:hidden;background:var(--paper);border:1px solid var(--line);border-radius:17px}.bpd-card.active{border-color:rgba(11,110,79,.35)}.bpd-card.ended{opacity:.62}
      .bpd-ribbon{flex:0 0 88px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:16px 6px;background:var(--riad);color:#fff}.bpd-card.active .bpd-ribbon{background:var(--atlas)}
      .bpd-ribbon b{font-family:var(--mono);font-size:19px;line-height:1}.bpd-ribbon span{font-size:9px;text-transform:uppercase;letter-spacing:.05em;opacity:.72;text-align:center}
      .bpd-body{flex:1;min-width:0;padding:14px 15px;display:flex;flex-direction:column;gap:9px}.bpd-top{display:flex;align-items:flex-start;justify-content:space-between;gap:9px}.bpd-top h3{margin:0;min-width:0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .bpd-state{flex:none;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:3px 8px;border-radius:999px;border:1px solid var(--line);color:var(--n-500);background:var(--paper-soft)}.bpd-state.active{color:var(--atlas);background:rgba(11,110,79,.08);border-color:rgba(11,110,79,.24)}.bpd-state.soon{color:#8A6210;background:rgba(217,154,43,.13);border-color:rgba(217,154,43,.3)}
      .bpd-meta{display:flex;flex-direction:column;gap:4px}.bpd-meta span{display:flex;align-items:center;gap:6px;color:var(--n-500);font-size:12px;line-height:1.35}.bpd-meta svg{width:13px;height:13px;flex:none}
      .bpd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:9px;border-top:1px solid var(--line)}.bpd-count{font-family:var(--mono);font-size:11.5px;color:var(--n-500)}.bpd-actions{display:flex;gap:5px}.bpd-icon{width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:9px;background:var(--paper);color:var(--ink);cursor:pointer}.bpd-icon svg{width:14px;height:14px}.bpd-icon.danger{color:#9B2F22}
      .bpd-empty{max-width:980px;margin:28px auto 0;text-align:center}.bpd-empty>svg{width:31px;height:31px;color:var(--atlas)}.bpd-empty h2{font-size:24px;margin:12px 0 7px}.bpd-empty p{max-width:510px;margin:0 auto;color:var(--n-500);font-size:13.5px;line-height:1.55}
      .bpd-modal{width:min(920px,88vw)}.bpd-compose{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;align-items:start}.bpd-form{display:flex;flex-direction:column;gap:15px}.bpd-field label{display:block;margin-bottom:6px;font-family:var(--mono);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--n-500)}.bpd-field label span{text-transform:none;letter-spacing:0;font-weight:400}.bpd-input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--paper);color:var(--ink);font:inherit;font-size:14px;outline:none}.bpd-input:focus{border-color:var(--atlas)}
      .bpd-kinds,.bpd-scopes{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bpd-scopes{grid-template-columns:repeat(5,1fr)}.bpd-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px 6px;border:1px solid var(--line);border-radius:11px;background:var(--paper);font:inherit;font-size:11.5px;font-weight:600;color:var(--n-600);cursor:pointer;text-align:center}.bpd-choice small{font-family:var(--mono);font-size:9.5px;font-weight:400}.bpd-choice svg{width:17px;height:17px}.bpd-choice.on{background:var(--atlas);border-color:var(--atlas);color:#fff}
      .bpd-value{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}.bpd-value input{width:92px;font-family:var(--mono);font-size:17px;font-weight:700}.bpd-unit{font-family:var(--mono);font-size:13px;color:var(--n-500)}.bpd-chips{display:flex;gap:6px;flex-wrap:wrap}.bpd-chip{display:inline-flex;align-items:center;gap:4px;padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:var(--paper);font:inherit;font-size:11.5px;color:var(--n-600);cursor:pointer}.bpd-chip.on{border-color:rgba(11,110,79,.35);background:rgba(11,110,79,.08);color:var(--atlas);font-weight:600}.bpd-chip svg{width:11px;height:11px}
      .bpd-scopebody{display:flex;flex-direction:column;gap:8px;margin-top:9px}.bpd-hint{font-size:11.5px;line-height:1.45;color:var(--n-500)}.bpd-search{display:flex;align-items:center;gap:9px;border:1.5px solid var(--atlas);border-radius:11px;padding:9px 11px}.bpd-search svg{width:17px;color:var(--atlas)}.bpd-search input{flex:1;min-width:0;border:0;background:transparent;outline:0;font:inherit}.bpd-hits{display:flex;flex-direction:column;gap:4px;max-height:160px;overflow:auto}.bpd-hit{display:flex;justify-content:space-between;gap:10px;padding:8px 11px;border:1px solid var(--line);border-radius:9px;background:var(--paper);font:inherit;font-size:12px;cursor:pointer}.bpd-hit b{font-family:var(--mono);color:var(--n-500)}
      .bpd-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.bpd-preview{position:sticky;top:0;padding:15px;border:1px solid var(--line);border-radius:15px;background:var(--paper-soft)}.bpd-preview-head span{display:block;font:10px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--n-500)}.bpd-preview-head b{display:inline-block;margin-top:4px;font:700 27px var(--mono)}.bpd-preview-head em{font-style:normal;font-size:12px;color:var(--n-500);margin-left:5px}.bpd-swap{display:flex;align-items:center;gap:8px;margin-top:12px}.bpd-swap>div{flex:1}.bpd-swap span{display:block;font-size:9.5px;text-transform:uppercase;color:var(--n-500)}.bpd-swap b{font:700 13px var(--mono)}.bpd-swap .next b{color:var(--atlas)}.bpd-swap svg{width:13px;color:var(--n-500)}.bpd-give{margin-top:9px;font-size:12px}.bpd-give b{font-family:var(--mono)}
      .bpd-warn{display:flex;gap:7px;margin-top:10px;padding:9px 10px;border:1px solid rgba(217,154,43,.35);border-radius:10px;background:rgba(217,154,43,.14);color:#8A6210;font-size:11.5px;line-height:1.4}.bpd-warn svg{width:14px;flex:none}.bpd-sample{display:flex;flex-direction:column;gap:5px;margin-top:10px;padding-top:9px;border-top:1px solid var(--line)}.bpd-srow{display:flex;justify-content:space-between;gap:8px;font-size:11.5px}.bpd-srow .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bpd-srow .prices{flex:none;font-family:var(--mono)}.bpd-srow s{color:var(--n-500);margin-right:4px}.bpd-srow b{color:var(--atlas)}.bpd-none{padding:24px 6px;text-align:center;color:var(--n-500);font-size:12px}
      .bpd-compose-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding-top:14px;border-top:1px solid var(--line)}.bpd-problem{font-size:11.5px;color:var(--n-500)}.bpd-compose-actions{display:flex;gap:8px;margin-left:auto}
      .bpd-print-summary{display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--paper-soft)}.bpd-print-summary b{font:700 27px var(--mono)}.bpd-print-summary span{font-size:12px;color:var(--n-500)}

      /* Promotions v2 · compact Kiwi command centre */
      .bpd-page{max-width:1240px;margin:0 auto;padding-bottom:58px}
      .bpd-btn{min-height:44px;padding:0 17px;border-color:var(--n-300);border-radius:13px;background:var(--surface);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.bpd-btn:hover:not(:disabled){transform:translateY(-1px);border-color:var(--n-500);box-shadow:0 8px 20px -14px rgba(10,15,13,.45)}.bpd-btn:focus-visible,.bpd-choice:focus-visible,.bpd-chip:focus-visible,.bpd-starter:focus-visible,.bpd-icon:focus-visible{outline:3px solid var(--mint);outline-offset:2px}.bpd-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--inverse-ink)}
      .bpd-onboard{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(330px,.88fr);gap:30px;align-items:center;min-height:280px;padding:34px!important;border:1px solid var(--inverse-line);border-radius:26px;background:var(--inverse-surface);color:var(--inverse-ink);box-shadow:0 30px 60px -42px rgba(5,59,44,.58);overflow:hidden;position:relative}.bpd-onboard:after{content:"";position:absolute;width:360px;height:360px;right:-190px;top:-220px;border-radius:50%;background:rgba(125,242,176,.10);pointer-events:none}.bpd-onboard-copy{position:relative;z-index:1;max-width:620px}.bpd-eyebrow{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--atlas)}.bpd-onboard .bpd-eyebrow{color:#7DF2B0}.bpd-eyebrow svg{width:15px;height:15px}.bpd-onboard h2{margin:13px 0 11px;font-size:clamp(30px,3.3vw,45px);font-weight:650;line-height:.98;letter-spacing:-.052em;color:#F7F5F0}.bpd-onboard p{max-width:600px;margin:0;color:rgba(247,245,240,.72);font-size:14px;line-height:1.55}.bpd-main-cta{margin-top:21px!important;background:#7DF2B0!important;border-color:#7DF2B0!important;color:#053B2C!important;box-shadow:0 14px 34px -18px rgba(125,242,176,.7)}
      .bpd-automation{position:relative;z-index:1;display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid rgba(247,245,240,.16);border-radius:20px;background:rgba(247,245,240,.055)}.bpd-automation>div{display:grid;grid-template-columns:34px 1fr 22px;gap:9px;align-items:center;min-height:50px;padding:7px 9px;border-radius:14px}.bpd-automation>div+div{border-top:1px solid rgba(247,245,240,.13);border-radius:0;padding-top:12px}.bpd-automation>div>svg:first-child{width:19px;height:19px;color:#7DF2B0}.bpd-automation>div>svg:last-child{width:15px;height:15px;color:#7DF2B0}.bpd-automation span{display:flex;flex-direction:column;gap:2px}.bpd-automation b{font-size:12.5px;color:#F7F5F0}.bpd-automation small{font-size:11px;color:rgba(247,245,240,.65)}
      .bpd-template-block{margin-top:25px;padding:0!important}.bpd-section-head{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:15px;padding:0 3px}.bpd-section-head h3{margin:7px 0 0;font-size:22px;letter-spacing:-.03em}.bpd-section-head p{max-width:390px;margin:0;color:var(--n-500);font-size:12.5px;line-height:1.5;text-align:right}.bpd-starters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin-top:0;text-align:left}.bpd-starter{display:grid;grid-template-columns:43px minmax(0,1fr) auto 18px;gap:13px;align-items:center;min-height:112px;padding:18px;border:1px solid var(--n-200);border-radius:18px;background:var(--surface);box-shadow:0 14px 30px -26px rgba(10,15,13,.55);transform:none;cursor:pointer;font:inherit;text-align:left;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.bpd-starter:hover{transform:translateY(-2px);border-color:var(--atlas);background:var(--surface);box-shadow:0 20px 36px -25px rgba(5,59,44,.48)}.bpd-starter:active{transform:translateY(0);box-shadow:0 4px 10px rgba(5,59,44,.12)}.bpd-starter:focus-visible{outline:3px solid var(--mint);outline-offset:3px}.bpd-starter-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--paper-soft);color:var(--atlas)}.bpd-starter-icon svg{width:20px;height:20px}.bpd-starter-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.bpd-starter-copy small{font:700 9px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--atlas)}.bpd-starter-copy b{font-size:14px;line-height:1.3;color:var(--ink)}.bpd-starter-copy>span{font-size:11.5px;line-height:1.4;color:var(--n-500)}.bpd-starter strong{font:700 16px var(--mono);color:var(--atlas);white-space:nowrap}.bpd-starter .bpd-starter-arrow{position:static;width:16px;height:16px;padding:0;border-radius:0;background:transparent;color:var(--n-500);transform:none}.bpd-starter:hover .bpd-starter-arrow{color:var(--atlas)}
      .bpd-toolbar{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:14px;padding:14px 16px;border:1px solid var(--n-200);border-radius:17px;background:var(--surface)}.bpd-sync{display:flex;flex-direction:column;gap:3px}.bpd-sync span{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;color:var(--ink)}.bpd-sync span svg{width:14px;height:14px;color:var(--atlas)}.bpd-sync small{color:var(--n-500);font-size:11.5px}.bpd-seg{margin-bottom:16px;border:1px solid var(--n-200);background:var(--paper-soft);border-radius:14px}.bpd-seg button{min-height:38px;border-radius:10px}.bpd-seg small{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:999px;background:rgba(127,127,127,.12)}
      .bpd-list{grid-template-columns:repeat(auto-fill,minmax(390px,1fr));gap:12px}.bpd-card{display:grid;grid-template-columns:92px minmax(0,1fr);min-height:190px;border-color:var(--n-200);background:var(--surface);box-shadow:0 18px 35px -30px rgba(10,15,13,.55);transition:transform .16s ease,border-color .16s ease,box-shadow .16s ease}.bpd-card:hover{transform:translateY(-2px);border-color:var(--n-300);box-shadow:0 24px 42px -28px rgba(5,59,44,.45)}.bpd-card.active{border-color:rgba(11,110,79,.35)}.bpd-ribbon,.bpd-card.active .bpd-ribbon{flex:none;display:flex;align-items:center;justify-content:center;gap:7px;padding:17px 10px;background:var(--paper-soft);color:var(--atlas);border-right:1px solid var(--n-200)}.bpd-ribbon span{order:2;font:700 9px var(--mono);letter-spacing:.1em}.bpd-ribbon b{order:1;font-size:20px;color:var(--ink)}.bpd-body{padding:17px 18px;gap:12px}.bpd-top>div{display:flex;flex-direction:column;align-items:flex-start;gap:7px}.bpd-top h3{white-space:normal;font-size:17px;line-height:1.25}.bpd-state{order:-1}.bpd-meta span{font-size:11.8px}.bpd-foot{padding-top:11px}.bpd-icon{width:34px;height:34px;background:var(--surface)}
      .bpd-section-empty{max-width:none;margin:24px 0;padding:54px 24px;border:1px dashed var(--n-300);border-radius:20px;background:var(--paper-soft)}.bpd-empty-icon{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:15px;background:var(--surface);color:var(--atlas);box-shadow:0 10px 22px -16px rgba(5,59,44,.5)}.bpd-empty-icon svg{width:22px;height:22px}.bpd-section-empty h2{font-size:21px}.bpd-section-empty .bpd-btn{margin-top:18px}
      .kiwi-modal:has([data-bpd-host]){height:min(760px,calc(100vh - 40px));display:flex;flex-direction:column;overflow:hidden}.kiwi-modal:has([data-bpd-host]) .kiwi-modal-body{flex:1;min-height:0}.kiwi-modal:has([data-bpd-host]) [data-bpd-shell]{height:100%}.bpd-modal{display:flex;flex-direction:column;width:min(1040px,91vw);height:100%}.bpd-compose{flex:1;min-height:0;grid-template-columns:minmax(0,1fr) 310px;gap:16px;overflow:hidden;align-items:stretch}.bpd-form{min-height:0;gap:10px;overflow-y:auto;padding-right:6px;scrollbar-width:thin;scrollbar-color:var(--n-300) transparent}.bpd-step{flex:none;overflow:hidden;padding:0!important;border:1px solid var(--n-200);border-radius:17px;background:var(--surface)}.bpd-step>header{display:flex;align-items:center;gap:11px;padding:13px 15px;border-bottom:1px solid var(--n-200);background:var(--paper-soft)}.bpd-step>header>span{display:grid;place-items:center;width:26px;height:26px;border-radius:9px;background:var(--atlas);color:var(--inverse-ink);font:700 11px var(--mono)}.bpd-step>header>div{display:flex;flex-direction:column;gap:2px}.bpd-step>header b{font-size:13px;color:var(--ink)}.bpd-step>header small{font-size:10.5px;color:var(--n-500)}.bpd-step-body{padding:14px 15px}.bpd-field+.bpd-field{margin-top:13px}.bpd-field label{margin-bottom:7px}.bpd-input{min-height:43px;padding:10px 12px;border-color:var(--n-300);border-radius:11px;background:var(--paper-soft)}.bpd-input:focus{border-color:var(--atlas);box-shadow:0 0 0 3px rgba(11,110,79,.10)}.bpd-kinds{gap:6px}.bpd-choice{min-height:53px;border-color:var(--n-200);border-radius:12px;background:var(--paper-soft)}.bpd-choice b{font-size:11.5px}.bpd-choice.on{box-shadow:0 7px 16px -12px rgba(5,59,44,.6)}.bpd-value{display:grid;grid-template-columns:126px 1fr;gap:9px}.bpd-value-box{position:relative;display:block}.bpd-value-box input{width:100%;padding-right:43px}.bpd-value-box .bpd-unit{position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none}.bpd-value>.bpd-chips{align-content:center}.bpd-scopes{gap:6px}.bpd-scopes .bpd-choice{min-height:67px;padding:8px 4px}.bpd-chip{min-height:34px;background:var(--paper-soft)}.bpd-search{background:var(--paper-soft)}.bpd-dates{gap:8px}
      .bpd-preview{top:0;height:fit-content;overflow:hidden;padding:18px;border-color:rgba(247,245,240,.16);border-radius:18px;background:var(--inverse-surface);color:var(--inverse-ink);box-shadow:0 24px 44px -34px rgba(5,59,44,.65)}.bpd-preview-live{display:flex;align-items:center;gap:6px;margin-bottom:24px;font:700 9px var(--mono);letter-spacing:.11em;text-transform:uppercase;color:#7DF2B0}.bpd-preview-live i{width:7px;height:7px;border-radius:50%;background:#7DF2B0;box-shadow:0 0 0 4px rgba(125,242,176,.12)}.bpd-preview-head span,.bpd-swap span{color:rgba(247,245,240,.63)}.bpd-preview-head b{font-size:38px;color:#F7F5F0}.bpd-preview-head em{color:rgba(247,245,240,.63)}.bpd-swap{margin-top:18px;padding:14px 0;border-top:1px solid rgba(247,245,240,.14);border-bottom:1px solid rgba(247,245,240,.14)}.bpd-swap b{color:#F7F5F0}.bpd-swap .next b{color:#7DF2B0}.bpd-swap svg{color:rgba(247,245,240,.58)}.bpd-give{color:rgba(247,245,240,.63)}.bpd-give b{color:#F7F5F0}.bpd-sample{border-top-color:rgba(247,245,240,.14)}.bpd-srow{color:rgba(247,245,240,.68)}.bpd-srow s{color:rgba(247,245,240,.45)}.bpd-srow b{color:#7DF2B0}.bpd-none{color:rgba(247,245,240,.63)}.bpd-compose-foot{margin:14px -2px -2px;padding:13px 2px 2px;border-top:1px solid var(--n-200);background:var(--surface)}.bpd-problem{display:flex;align-items:center;gap:6px}.bpd-problem svg{width:14px;height:14px;flex:none}.bpd-compose-actions .bpd-btn{min-width:112px}
      @media(max-width:900px){.kiwi-modal:has([data-bpd-host]){height:auto;max-height:calc(100vh - 40px);overflow-y:auto}.kiwi-modal:has([data-bpd-host]) .kiwi-modal-body,.kiwi-modal:has([data-bpd-host]) [data-bpd-shell]{height:auto}.bpd-modal{height:auto}.bpd-onboard{grid-template-columns:1fr;padding:30px!important}.bpd-compose{grid-template-columns:1fr;overflow:visible}.bpd-form{overflow:visible;padding-right:0}.bpd-preview{position:static;order:-1}.bpd-scopes{grid-template-columns:repeat(2,1fr)}.bpd-starters{grid-template-columns:1fr}.bpd-starter{min-height:96px}.bpd-section-head{align-items:flex-start;flex-direction:column;gap:8px}.bpd-section-head p{text-align:left}.bpd-list{grid-template-columns:1fr}}
      @media(max-width:620px){.bpd-onboard{padding:25px 20px;border-radius:21px}.bpd-onboard h2{font-size:34px}.bpd-toolbar{align-items:stretch;flex-direction:column}.bpd-toolbar .bpd-btn{width:100%}.bpd-seg{width:100%;overflow-x:auto}.bpd-seg button{white-space:nowrap}.bpd-card{grid-template-columns:74px minmax(0,1fr)}.bpd-ribbon b{font-size:17px}.bpd-kinds{grid-template-columns:1fr}.bpd-value{grid-template-columns:1fr}.bpd-scopes{grid-template-columns:1fr 1fr}.bpd-dates{grid-template-columns:1fr}.bpd-compose-foot{align-items:stretch;flex-direction:column}.bpd-compose-actions{width:100%;margin-left:0}.bpd-compose-actions .bpd-btn{flex:1}.bpd-starter{grid-template-columns:40px minmax(0,1fr) auto}.bpd-starter .bpd-starter-arrow{display:none}}
      html[data-theme="dark"] .bpd-card,
      html[data-theme="dark"] .bpd-starter,
      html[data-theme="dark"] .bpd-toolbar,
      html[data-theme="dark"] .bpd-step,
      html[data-theme="dark"] .bpd-btn:not(.primary) { background:rgba(255,255,255,0.04); border-color:rgba(255,255,255,0.08); }
      html[data-theme="dark"] .bpd-input,
      html[data-theme="dark"] .bpd-choice:not(.on),
      html[data-theme="dark"] .bpd-chip:not(.on),
      html[data-theme="dark"] .bpd-search { background:rgba(255,255,255,0.05); border-color:rgba(255,255,255,0.12); color:#fff; }
      html[data-theme="dark"] .bpd-starter-icon { background:rgba(125,242,176,0.12); color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter-copy small { color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter-copy b { color:#F7F5F0; }
      html[data-theme="dark"] .bpd-starter-copy > span { color:rgba(247,245,240,0.68); }
      html[data-theme="dark"] .bpd-starter strong { color:#7DF2B0; }
      html[data-theme="dark"] .bpd-starter .bpd-starter-arrow { color:rgba(247,245,240,0.45); }
      html[data-theme="dark"] .bpd-starter:hover .bpd-starter-arrow { color:#7DF2B0; }
      @media(prefers-reduced-motion:reduce){.bpd-btn,.bpd-card,.bpd-starter{transition:none!important}}`;
    s.textContent += '\nbody.design-vexel .kiwi-modal .bpd-preview :is(b,strong),.bpd-preview .bpd-srow s{color:var(--inverse-ink)}';
    s.textContent += '\n[data-bpd-dialog] .kiwi-modal-close{left:auto;right:auto;inset-inline-start:auto;inset-inline-end:18px;width:44px;height:44px;min-width:44px;min-height:44px}[data-bpd-dialog] .kiwi-modal-head{padding-inline-end:80px}[data-bpd-dialog] .kiwi-modal-head>div{min-width:0}[data-bpd-dialog] .kiwi-modal-head h3{overflow-wrap:anywhere}.bpd-preview [data-bpd-money]{direction:ltr;unicode-bidi:isolate}.bpd-preview .bpd-srow .prices{display:inline-flex;direction:ltr;gap:6px;align-items:center}.bpd-preview .bpd-srow s{margin:0}';
    s.textContent += '\n.bpd-swap:dir(rtl)>svg{transform:scaleX(-1)}';
    document.head.appendChild(s);
  }

  function scopeText(ctx, p) {
    var sc = p.scope || {};
    if (sc.type === 'tout') return tr('Tout le magasin');
    if (sc.type === 'rayon') {
      var names = (sc.ids || []).map(function (id) { var r = ctx.rayons.find(function (x) { return x.id === id; }); return r && r.label; }).filter(Boolean);
      if (!names.length) return tr('Aucun rayon choisi');
      return names.length === 1 ? names[0] : names.length === 2 ? tr('{first} et {second}', { first:names[0], second:names[1] }) : tr('{first} et {count} autres rayons', { first:names[0], count:names.length - 1 });
    }
    if (sc.type === 'produits') {
      var n = (sc.ids || []).length;
      if (!n) return tr('Aucun article choisi');
      if (n === 1) return ctx.products[sc.ids[0]] ? ctx.products[sc.ids[0]].name : tr('1 article');
      return tr('{count} articles choisis', { count:n });
    }
    if (sc.type === 'avant') return sc.before ? tr('Entré en stock avant le {date}', { date:fmtDay(new Date(sc.before)) }) : tr('Aucune date choisie');
    if (sc.type === 'stock') return tr('Il en reste {count} ou moins', { count:sc.max || 0 });
    return '·';
  }

  function whenText(p, now) {
    var st = PRM().status(p, now || Date.now());
    if (st === 'paused') return tr('En pause, aucun prix n’est modifié');
    if (st === 'scheduled') { var j = Math.ceil((p.from - Date.now()) / DAY); return tr(j <= 1 ? 'Démarre demain · {date}' : 'Démarre dans {count} jours · {date}', { count:j, date:fmtDay(new Date(p.from)) }); }
    if (st === 'ended') return tr('Terminée le {date}', { date:fmtDay(new Date(p.to)) });
    if (!p.to) return tr('Sans date de fin, jusqu’à ce que vous l’arrêtiez');
    var left = p.to - Date.now();
    if (left < 2 * 3600000) return tr('Se termine à {time}', { time:fmtHM(new Date(p.to)) });
    var days = Math.ceil(left / DAY);
    return days <= 1 ? tr('Se termine aujourd’hui à {time}', { time:fmtHM(new Date(p.to)) }) : tr('Se termine dans {count} jours · {date}', { count:days, date:fmtDay(new Date(p.to)) });
  }

  var STARTERS = {
    destock: { name: 'Déstockage', kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6, icon: 'archive-restore', kicker: 'Stock dormant', title: 'Déstocker l’ancienne saison', desc: 'Articles entrés il y a plus de 6 mois', badge: '−30 %' },
    finserie: { name: 'Fins de série', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 }, icon: 'package-minus', kicker: 'Faible stock', title: 'Écouler les fins de série', desc: 'Articles avec 5 pièces ou moins', badge: '−20 %' },
    weekend: { name: 'Week-end', kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2, icon: 'calendar-days', kicker: 'Temps fort', title: 'Animer le week-end', desc: 'Tout le magasin jusqu’à dimanche soir', badge: '−10 %' }
  };
  function starter(key) {
    var s = STARTERS[key]; if (!s) return null;
    var p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(Date.now() - s.months * 30 * DAY));
    if (s.days) p.to = endOfDay(new Date(Date.now() + s.days * DAY));
    return p;
  }

  function card(ctx, p, now) {
    var status = PRM().status(p, now);
    var n = preview(ctx, p).count;
    var tone = status === 'active' ? 'active' : status === 'ended' ? 'ended' : 'soon';
    var label = status === 'active' ? 'En cours' : status === 'scheduled' ? 'Programmée' : status === 'paused' ? 'En pause' : 'Terminée';
    return localHtml('<article class="bpd-card ' + tone + '"><div class="bpd-ribbon"><span>' + (p.kind === 'fixed' ? 'prix' : 'offre') + '</span><b>' + esc(PRM().badgeOf(p)) + '</b></div>' +
      '<div class="bpd-body"><div class="bpd-top"><div><span class="bpd-state ' + tone + '">' + label + '</span><h3 data-bpd-data>' + esc(p.name) + '</h3></div></div>' +
      '<div class="bpd-meta"><span><i data-lucide="target"></i><bdi data-bpd-data data-bpd-scope="' + esc(JSON.stringify(p.scope || {})) + '">' + esc(scopeText(ctx, p)) + '</bdi></span><span><i data-lucide="clock"></i><bdi data-bpd-when="' + esc(JSON.stringify({paused:p.paused,from:p.from,to:p.to})) + '">' + esc(whenText(p, now)) + '</bdi></span></div>' +
      '<div class="bpd-foot"><span class="bpd-count">' + ui(n === 1 ? '{count} article concerné' : '{count} articles concernés', {count:n}) + '</span><span class="bpd-actions">' +
      (n ? '<button class="bpd-icon" data-action="bpd-print" data-arg="' + esc(p.id) + '" title="Imprimer les étiquettes"><i data-lucide="printer"></i></button>' : '') +
      (status !== 'ended' ? '<button class="bpd-icon" data-action="bpd-toggle" data-arg="' + esc(p.id) + '" title="' + (p.paused ? 'Reprendre' : 'Mettre en pause') + '"><i data-lucide="' + (p.paused ? 'play' : 'pause') + '"></i></button>' : '') +
      '<button class="bpd-icon" data-action="bpd-edit" data-arg="' + esc(p.id) + '" title="Modifier"><i data-lucide="pencil"></i></button>' +
      '<button class="bpd-icon danger" data-action="bpd-delete" data-arg="' + esc(p.id) + '" title="Supprimer"><i data-lucide="trash-2"></i></button>' +
      '</span></div></div></article>');
  }

  function emptyHtml() {
    return localHtml('<section class="bpd-onboard"><div class="bpd-onboard-copy"><span class="bpd-eyebrow"><i data-lucide="badge-percent"></i>Prix synchronisés</span>' +
      '<h2>Une offre à créer.<br>Kiwi s’occupe du reste.</h2><p>Choisissez la remise, les articles et la durée. La caisse applique le bon prix automatiquement, sans manipulation au comptoir.</p>' +
      '<button class="bpd-btn primary bpd-main-cta" data-action="bpd-new"><i data-lucide="plus"></i>Créer une promotion</button></div>' +
      '<div class="bpd-automation" aria-label="Ce que Kiwi synchronise"><div><i data-lucide="scan-barcode"></i><span><b>Prix caisse</b><small>Mis à jour instantanément</small></span><i data-lucide="check"></i></div>' +
      '<div><i data-lucide="receipt-text"></i><span><b>Tickets & reçus</b><small>Remise clairement affichée</small></span><i data-lucide="check"></i></div>' +
      '<div><i data-lucide="printer"></i><span><b>Étiquettes</b><small>Prêtes à imprimer</small></span><i data-lucide="check"></i></div></div></section>' +
      '<section class="bpd-template-block"><div class="bpd-section-head"><div><span class="bpd-eyebrow">Démarrer rapidement</span><h3>Trois modèles prêts à adapter</h3></div><p>Chaque modèle ouvre un brouillon : rien ne change avant votre validation.</p></div>' +
      '<div class="bpd-starters">' + Object.keys(STARTERS).map(function (key) { var s = STARTERS[key]; return '<button class="bpd-starter" data-action="bpd-starter" data-arg="' + key + '"><span class="bpd-starter-icon"><i data-lucide="' + s.icon + '"></i></span><span class="bpd-starter-copy"><small>' + esc(s.kicker) + '</small><b>' + esc(s.title) + '</b><span>' + esc(s.desc) + '</span></span><strong>' + esc(s.badge) + '</strong><i class="bpd-starter-arrow" data-lucide="arrow-up-right"></i></button>'; }).join('') + '</div></section>');
  }

  function renderPage() {
    injectCss();
    if (!ready()) { K.toast(tr('Promotions indisponibles'), { type: 'warn', desc: tr('Rechargez le dashboard pour charger le module.') }); return; }
    var ctx = context();
    var now = Date.now();
    var all = PRM().list();
    var groups = {
      active: all.filter(function (p) { return PRM().status(p, now) === 'active'; }),
      soon: all.filter(function (p) { return ['scheduled', 'paused'].indexOf(PRM().status(p, now)) >= 0; }),
      ended: all.filter(function (p) { return PRM().status(p, now) === 'ended'; })
    };
    var shown = groups[filter] || groups.active;
    var seen = new Set();
    groups.active.forEach(function (p) { items(ctx).forEach(function (it) { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); }); });
    var sub = tr(groups.active.length === 1 ? '{count} promotion en cours' : '{count} promotions en cours', {count:groups.active.length}) + (seen.size ? ' · ' + tr(seen.size === 1 ? '{count} article remisé' : '{count} articles remisés', {count:seen.size}) : '');
    K.appPage('promos', { title: tr('Promotions'), subtitle: sub, body: localHtml(
      '<div class="bpd-page">' + (all.length ? '<div class="bpd-toolbar"><div class="bpd-sync"><span><i data-lucide="refresh-cw"></i>Synchronisé avec la caisse</span><small>Les prix actifs sont appliqués automatiquement.</small></div><button class="bpd-btn primary" data-action="bpd-new"><i data-lucide="plus"></i>Nouvelle promotion</button></div>' : '') +
      (all.length ? '<div class="bpd-seg" role="tablist" aria-label="État des promotions"><button aria-pressed="' + (filter === 'active') + '" class="' + (filter === 'active' ? 'on' : '') + '" data-action="bpd-filter" data-arg="active">En cours <small>' + groups.active.length + '</small></button><button aria-pressed="' + (filter === 'soon') + '" class="' + (filter === 'soon' ? 'on' : '') + '" data-action="bpd-filter" data-arg="soon">À venir & en pause <small>' + groups.soon.length + '</small></button><button aria-pressed="' + (filter === 'ended') + '" class="' + (filter === 'ended' ? 'on' : '') + '" data-action="bpd-filter" data-arg="ended">Terminées <small>' + groups.ended.length + '</small></button></div>' : '') +
      (all.length ? (shown.length ? '<div class="bpd-list">' + shown.map(function (p) { return card(ctx, p, now); }).join('') + '</div>' : '<div class="bpd-empty bpd-section-empty"><span class="bpd-empty-icon"><i data-lucide="inbox"></i></span><h2>Aucune promotion ici</h2><p>Changez de section ou créez une nouvelle offre.</p><button class="bpd-btn" data-action="bpd-new"><i data-lucide="plus"></i>Créer une promotion</button></div>') : emptyHtml()) + '</div>') });
    var host = document.querySelector('.bpd-page').closest('.dash-genpage');
    if (host) {
      host.querySelector('h1').setAttribute('data-bpd-copy', 'Promotions');
      host.querySelectorAll('.genpage-head .seg').forEach(function (node, i) { var count = i ? seen.size : groups.active.length; node.setAttribute('data-bpd-copy', i ? (count === 1 ? '{count} article remisé' : '{count} articles remisés') : (count === 1 ? '{count} promotion en cours' : '{count} promotions en cours')); node.setAttribute('data-bpd-values', JSON.stringify({count:count})); });
    }
    icons();
    if (!subscribed) {
      subscribed = true;
      PRM().subscribe(function () { var active = document.querySelector('[data-nav="promos"].active'); if (active) renderPage(); });
    }
  }

  var SCOPES = [
    { id: 'tout', label: 'Tout le magasin', icon: 'store' }, { id: 'rayon', label: 'Un rayon', icon: 'layout-grid' },
    { id: 'produits', label: 'Des articles', icon: 'shirt' }, { id: 'avant', label: 'Ancien stock', icon: 'calendar-clock' },
    { id: 'stock', label: 'Fin de série', icon: 'package-minus' }
  ];
  function valid(d) {
    if (!d.value) return 'Choisissez de combien vous baissez le prix';
    if (d.kind === 'percent' && window.KiwiDiscountPolicy?.configured(venueKey())
        && !window.KiwiDiscountPolicy.allowed(d.value, venueKey())) return 'Pourcentage non autorisé dans les réglages';
    var sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return 'Choisissez au moins un élément à viser';
    if (sc.type === 'avant' && !sc.before) return 'Choisissez la date avant laquelle les articles sont visés';
    if (sc.type === 'stock' && !sc.max) return 'Indiquez le seuil de stock';
    if (d.to && d.from && d.to <= d.from) return 'La date de fin doit venir après le début';
    return '';
  }
  function autoName(ctx, d) {
    if (d.scope.type === 'avant') return 'Déstockage';
    if (d.scope.type === 'stock') return 'Fins de série';
    if (d.scope.type === 'rayon') return scopeText(ctx, d);
    if (d.scope.type === 'produits') return 'Sélection';
    return d.kind === 'percent' ? 'Tout le magasin −' + d.value + ' %' : 'Promotion';
  }

  function scopeControl(ctx, d) {
    var sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="bpd-hint">Chaque article du magasin, sans exception.</div>';
    if (sc.type === 'rayon') return '<div class="bpd-chips">' + ctx.rayons.map(function (r) { return '<button data-bpd-data class="bpd-chip ' + ((sc.ids || []).indexOf(r.id) >= 0 ? 'on' : '') + '" data-prr="' + esc(r.id) + '">' + esc(r.label) + ' <small>' + r.items.length + '</small></button>'; }).join('') + '</div>';
    if (sc.type === 'produits') {
      var ids = sc.ids || [];
      return '<div class="bpd-search"><i data-lucide="search"></i><input id="bpd-q" placeholder="Chercher un article ou scanner son code-barres…" autocomplete="off"></div>' +
        '<div class="bpd-chips">' + (ids.length ? ids.map(function (id) { return '<button data-bpd-data class="bpd-chip on" data-prp="' + esc(id) + '">' + esc(ctx.products[id] ? ctx.products[id].name : id) + ' <i data-lucide="x"></i></button>'; }).join('') : '<span class="bpd-hint">Aucun article choisi.</span>') + '</div><div class="bpd-hits" id="bpd-hits"></div>';
    }
    if (sc.type === 'avant') return '<div class="bpd-chips">' + [{m:3,l:'Plus de 3 mois'},{m:6,l:'Plus de 6 mois'},{m:12,l:'Plus d’un an'}].map(function (o) { return '<button class="bpd-chip" data-pra="' + o.m + '">' + o.l + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-before" type="date" value="' + toInput(sc.before) + '"><div class="bpd-hint">Vise les articles entrés avant cette date.</div>';
    if (sc.type === 'stock') return '<div class="bpd-chips">' + [2,3,5,10].map(function (n) { return '<button class="bpd-chip ' + (sc.max === n ? 'on' : '') + '" data-prm="' + n + '">' + ui('{count} ou moins', {count:n}) + '</button>'; }).join('') + '</div><input class="bpd-input" id="bpd-max" type="number" min="1" value="' + (sc.max || '') + '" placeholder="ou un seuil à vous"><div class="bpd-hint">La cible suit automatiquement le stock disponible.</div>';
    return '';
  }

  function composerHtml(ctx) {
    var d = composer.draft;
    var prev = preview(ctx, d);
    var problem = valid(d);
    var sc = d.scope || {};
    var quick = d.kind === 'percent' ? (window.KiwiDiscountPolicy?.percentages(venueKey(), [10,20,30,50]) || [10,20,30,50]) : d.kind === 'amount' ? [20,50,100,200] : [49,99,149,199];
    return localHtml('<div class="bpd-modal" data-bpd-host><div class="bpd-compose"><div class="bpd-form">' +
      '<section class="bpd-step"><header><span>1</span><div><b>Définir l’offre</b><small>Le nom et la baisse de prix</small></div></header><div class="bpd-step-body">' +
      '<div class="bpd-field"><label>Nom <span>· visible sur le reçu</span></label><input class="bpd-input" id="bpd-name" maxlength="80" placeholder="Soldes d’été, Déstockage…" value="' + esc(d.name) + '"></div>' +
      '<div class="bpd-field"><label>Type de remise</label><div class="bpd-kinds">' + [['percent','Pourcentage','−20 %'],['amount','Montant','−50 MAD'],['fixed','Prix final','99 MAD']].map(function (x) { return '<button class="bpd-choice ' + (d.kind === x[0] ? 'on' : '') + '" aria-pressed="' + (d.kind === x[0]) + '" data-prk="' + x[0] + '"><b>' + x[1] + '</b><small>' + x[2] + '</small></button>'; }).join('') + '</div><div class="bpd-value"><span class="bpd-value-box"><input class="bpd-input" id="bpd-value" type="number" min="0" value="' + d.value + '"><span class="bpd-unit">' + (d.kind === 'percent' ? '%' : 'MAD') + '</span></span><div class="bpd-chips">' + quick.map(function (n) { return '<button class="bpd-chip ' + (d.value === n ? 'on' : '') + '" data-prv="' + n + '">' + (d.kind === 'percent' ? '−' + n + ' %' : d.kind === 'amount' ? '−' + n : n) + '</button>'; }).join('') + '</div></div></div></div></section>' +
      '<section class="bpd-step"><header><span>2</span><div><b>Choisir les articles</b><small>Kiwi garde cette sélection à jour</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-scopes">' + SCOPES.map(function (x) { return '<button class="bpd-choice ' + (sc.type === x.id ? 'on' : '') + '" aria-pressed="' + (sc.type === x.id) + '" data-prs="' + x.id + '"><i data-lucide="' + x.icon + '"></i><b>' + x.label + '</b></button>'; }).join('') + '</div><div class="bpd-scopebody">' + scopeControl(ctx, d) + '</div></div></div></section>' +
      '<section class="bpd-step"><header><span>3</span><div><b>Programmer la durée</b><small>Démarrez maintenant ou planifiez</small></div></header><div class="bpd-step-body"><div class="bpd-field"><div class="bpd-chips">' + [['today','Aujourd’hui'],['we','Ce week-end'],['7','7 jours'],['30','30 jours'],['none','Sans fin']].map(function (x) { return '<button class="bpd-chip" data-prw="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div><div class="bpd-dates"><div><label>Début <span>· vide = maintenant</span></label><input class="bpd-input" id="bpd-from" type="date" value="' + toInput(d.from) + '"></div><div><label>Fin <span>· vide = sans fin</span></label><input class="bpd-input" id="bpd-to" type="date" value="' + toInput(d.to) + '"></div></div></div></div></section>' +
      '</div><aside class="bpd-preview"><span class="bpd-preview-live"><i></i>Aperçu en direct</span><div class="bpd-preview-head"><span>Articles concernés</span><b>' + prev.count + '</b><em>article' + (prev.count > 1 ? 's' : '') + '</em></div>' +
      (prev.count ? '<div class="bpd-swap"><div><span>Prix plein</span><b>' + moneyHtml(prev.from) + '</b></div><i data-lucide="arrow-right"></i><div class="next"><span>Prix promo</span><b>' + moneyHtml(prev.to) + '</b></div></div><div class="bpd-give">Vous offrez <b>' + moneyHtml(prev.from - prev.to) + '</b> si tout part.</div>' + (prev.under ? '<div class="bpd-warn"><i data-lucide="alert-triangle"></i><span><b>' + ui(prev.under === 1 ? '{count} article passe sous le prix d’achat.' : '{count} articles passent sous le prix d’achat.', {count:prev.under}) + '</b></span></div>' : '') + '<div class="bpd-sample">' + prev.sample.map(function (x) { return '<div class="bpd-srow"><span class="name" data-bpd-data>' + esc(x.name) + '</span><span class="prices"><s>' + moneyHtml(x.was) + '</s><b>' + moneyHtml(x.price) + '</b></span></div>'; }).join('') + '</div>' : '<div class="bpd-none">' + ui(problem || 'Aucun article ne correspond à cette cible.') + '</div>') + '</aside></div>' +
      '<div class="bpd-compose-foot"><span class="bpd-problem">' + (problem ? '<i data-lucide="info"></i>' + ui(problem) : '<i data-lucide="check-circle-2"></i>' + ui(composer.editing ? 'Prête à être enregistrée' : 'Prête à être lancée')) + '</span><span class="bpd-compose-actions"><button class="bpd-btn" data-bpd-cancel>Annuler</button><button class="bpd-btn primary" id="bpd-save" ' + (problem || !prev.count ? 'disabled' : '') + '><i data-lucide="check"></i>' + (composer.editing ? 'Enregistrer' : 'Lancer la promotion') + '</button></span></div></div>');
  }

  function openComposer(seed) {
    var ctx = context();
    composerContext = ctx;
    composer.editing = seed && seed.id ? seed.id : null;
    composer.draft = PRM().normalize(seed || { name:'', kind:'percent', value:20, scope:{type:'tout'} });
    if (!seed) composer.draft.name = '';
    promoModal = K.modal({ title: tr(composer.editing ? 'Modifier la promotion' : 'Créer une promotion'), desc: tr('Trois choix, puis Kiwi applique les bons prix partout.'), width: 1080, body: '<div data-bpd-shell></div>', foot: '' });
    modalCopy(promoModal, composer.editing ? 'Modifier la promotion' : 'Créer une promotion', null, 'Trois choix, puis Kiwi applique les bons prix partout.');
    function draw() {
      var shell = promoModal.el.querySelector('[data-bpd-shell]');
      shell.innerHTML = composerHtml(ctx);
      wire(shell, ctx, draw);
      icons();
    }
    draw();
  }

  // Date controls emit change while their native segments are still being
  // edited (for example after the first valid year digit). Replacing the form
  // here removes the focused control and drops the rest of the user's input.
  // Reuse the same render contract for impact/validation, but keep every form
  // control and its native editing/selection state in place.
  function updateImpact(el, ctx) {
    var next = document.createElement('template');
    next.innerHTML = composerHtml(ctx);
    ['.bpd-preview', '.bpd-problem'].forEach(function (selector) {
      var current = el.querySelector(selector), fresh = next.content.querySelector(selector);
      if (current && fresh) current.innerHTML = fresh.innerHTML;
    });
    var save = el.querySelector('#bpd-save'), nextSave = next.content.querySelector('#bpd-save');
    if (save && nextSave) save.disabled = nextSave.disabled;
    el.querySelectorAll('[data-prv]').forEach(function (b) { b.classList.toggle('on', +b.dataset.prv === composer.draft.value); });
    el.querySelectorAll('[data-prm]').forEach(function (b) { b.classList.toggle('on', +b.dataset.prm === composer.draft.scope.max); });
    icons();
  }

  function wire(el, ctx, redraw) {
    var d = composer.draft;
    var name = el.querySelector('#bpd-name');
    if (name) name.oninput = function () { d.name = name.value; };
    el.querySelectorAll('[data-prk]').forEach(function (b) { b.onclick = function () { d.kind = b.dataset.prk; redraw(); }; });
    var val = el.querySelector('#bpd-value'); if (val) val.oninput = val.onchange = function () { d.value = Math.max(0, Math.round(+val.value || 0)); updateImpact(el, ctx); };
    if (val) val.onblur = function () { val.value = d.value; };
    el.querySelectorAll('[data-prv]').forEach(function (b) { b.onclick = function () { d.value = +b.dataset.prv; redraw(); }; });
    el.querySelectorAll('[data-prs]').forEach(function (b) { b.onclick = function () { d.scope = PRM().normalize({ scope:{type:b.dataset.prs} }).scope; redraw(); }; });
    el.querySelectorAll('[data-prr]').forEach(function (b) { b.onclick = function () { var ids = d.scope.ids || (d.scope.ids=[]); var i=ids.indexOf(b.dataset.prr); if(i>=0) ids.splice(i,1); else ids.push(b.dataset.prr); redraw(); }; });
    el.querySelectorAll('[data-prp]').forEach(function (b) { b.onclick = function () { var i=d.scope.ids.indexOf(b.dataset.prp); if(i>=0)d.scope.ids.splice(i,1); redraw(); }; });
    var q = el.querySelector('#bpd-q');
    if (q) {
      var hits = el.querySelector('#bpd-hits');
      var paint = function () { var term=q.value.trim().toLowerCase(); if(!term){hits.innerHTML='';return;} var by=ctx.byEan[q.value.trim()]; var found=by?[ctx.products[by]].filter(Boolean):items(ctx).filter(function(it){return it.name.toLowerCase().indexOf(term)>=0;}).slice(0,8); hits.innerHTML=localHtml(found.map(function(it){return '<button class="bpd-hit" data-bpd-data data-pick="'+esc(it.id)+'"><span>'+esc(it.name)+'</span><b>'+money(it.price)+'</b></button>';}).join('')||'<div class="bpd-hint">Aucun article trouvé.</div>'); hits.querySelectorAll('[data-pick]').forEach(function(b){b.onclick=function(){var ids=d.scope.ids||(d.scope.ids=[]);if(ids.indexOf(b.dataset.pick)<0)ids.push(b.dataset.pick);redraw();};}); };
      q.oninput = paint; q.onkeydown = function(e){if(e.key==='Enter'){e.preventDefault();paint();}};
    }
    el.querySelectorAll('[data-pra]').forEach(function(b){b.onclick=function(){d.scope.before=startOfDay(new Date(Date.now()-(+b.dataset.pra)*30*DAY));redraw();};});
    var before=el.querySelector('#bpd-before');if(before)before.onchange=function(){d.scope.before=before.value?startOfDay(new Date(before.value+'T12:00:00')):0;updateImpact(el,ctx);};
    el.querySelectorAll('[data-prm]').forEach(function(b){b.onclick=function(){d.scope.max=+b.dataset.prm;redraw();};});
    var max=el.querySelector('#bpd-max');if(max)max.oninput=max.onchange=function(){d.scope.max=Math.max(0,Math.round(+max.value||0));updateImpact(el,ctx);};
    if(max)max.onblur=function(){max.value=d.scope.max;};
    el.querySelectorAll('[data-prw]').forEach(function(b){b.onclick=function(){var key=b.dataset.prw,now=new Date();if(key==='none')d.to=0;else if(key==='today')d.to=endOfDay(now);else if(key==='we')d.to=endOfDay(new Date(now.getTime()+((7-now.getDay())%7)*DAY));else d.to=endOfDay(new Date(now.getTime()+(+key)*DAY));redraw();};});
    var from=el.querySelector('#bpd-from');if(from)from.onchange=function(){d.from=from.value?startOfDay(new Date(from.value+'T12:00:00')):0;updateImpact(el,ctx);};
    var to=el.querySelector('#bpd-to');if(to)to.onchange=function(){d.to=to.value?endOfDay(new Date(to.value+'T12:00:00')):0;updateImpact(el,ctx);};
    el.querySelector('[data-bpd-cancel]').onclick=function(){promoModal.close();};
    var save=el.querySelector('#bpd-save');if(save)save.onclick=function(){if(valid(d))return;if(!d.name.trim())d.name=autoName(ctx,d);if(composer.editing)d.id=composer.editing;PRM().save(d);promoModal.close();K.toast(tr(composer.editing?'{name} enregistrée':'{name} lancée, la caisse est à jour',{name:d.name}),{type:'success'});renderPage();};
  }

  function labelFor(ctx, pid, variant) {
    var item = ctx.products[pid]; if (!item) return null;
    var code = ctx.cat.primaryBarcode(variant); if (!code) return null;
    var deal = PRM().priceFor(item, { stock: stockOf(item) });
    return { title:item.name, sub:variant.colorLabel+' · '+variant.size, price:String(deal ? deal.price : item.price), was:deal ? String(deal.was) : null, code:code, format:window.KiwiBarcode.isValidEan13(code)?'ean13':'code128' };
  }
  function labelPlan(id) {
    var ctx=context(), p=PRM().get(id), labels=[], products=0;
    if(!p)return {promo:null,labels:labels,products:0};
    items(ctx).forEach(function(item){if(!PRM().matches(p,item,stockOf(item)))return;var used=0;ctx.cat.listVariants(item.id).forEach(function(v){if(!(v.stock>0))return;var l=labelFor(ctx,item.id,v);if(l){labels.push(l);used++;}});if(used)products++;});
    return {promo:p,labels:labels,products:products};
  }

  H['nav-promos'] = renderPage;
  H['bpd-filter'] = function (_el,arg) { filter=arg||'active';renderPage(); };
  H['bpd-new'] = function () { openComposer(null); };
  H['bpd-starter'] = function (_el,arg) { openComposer(starter(arg)); };
  H['bpd-edit'] = function (_el,arg) { var p=PRM().get(arg);if(p)openComposer(p); };
  H['bpd-toggle'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;PRM().setPaused(arg,!p.paused);K.toast(tr(p.paused?'{name} reprend':'{name} mise en pause',{name:p.name}),{type:p.paused?'success':'warn'});renderPage(); };
  H['bpd-delete'] = function (_el,arg) { var p=PRM().get(arg);if(!p)return;var m=K.modal({title:tr('Supprimer « {name} » ?',{name:p.name}),desc:tr('Les articles repassent immédiatement au prix plein. Les ventes encaissées ne changent pas.'),width:470,foot:localHtml('<button class="kb ghost" data-cancel>Garder</button><button class="kb danger" data-delete>Supprimer</button>')});modalCopy(m,'Supprimer « {name} » ?',{name:p.name},'Les articles repassent immédiatement au prix plein. Les ventes encaissées ne changent pas.');m.el.querySelector('[data-cancel]').onclick=m.close;m.el.querySelector('[data-delete]').onclick=function(){PRM().remove(arg);m.close();K.toast(tr('{name} supprimée',{name:p.name}),{type:'warn'});renderPage();}; };
  H['bpd-print'] = function (_el,arg) { var plan=labelPlan(arg);if(!plan.promo)return;var n=plan.labels.length;var m=K.modal({title:tr('Étiquettes · {name}',{name:plan.promo.name}),desc:tr(n?'Chaque étiquette portera le prix réellement appliqué en caisse.':'Aucun article en stock avec un code-barres.'),width:520,body:n?'<div class="bpd-print-summary"><b>'+n+'</b><span>'+ui(n===1?'étiquette':'étiquettes')+' · '+ui(plan.products===1?'{count} article concerné':'{count} articles concernés',{count:plan.products})+'</span></div>':'',foot:'<button class="kb ghost" data-cancel>'+ui(n?'Annuler':'Fermer')+'</button>'+(n?'<button class="kb atlas" data-print><i data-lucide="printer"></i>'+ui('Imprimer')+' '+n+'</button>':'')});modalCopy(m,'Étiquettes · {name}',{name:plan.promo.name},n?'Chaque étiquette portera le prix réellement appliqué en caisse.':'Aucun article en stock avec un code-barres.');m.el.querySelector('[data-cancel]').onclick=m.close;var b=m.el.querySelector('[data-print]');if(b)b.onclick=function(){m.close();window.KiwiBarcode.printLabels(plan.labels,{copies:1});};icons(); };
  window.addEventListener('kiwi:langchange', function () {
    document.querySelectorAll('[data-bpd-dialog]').forEach(localize);
    var shell = promoModal && promoModal.el.querySelector('[data-bpd-shell]');
    if (shell && shell.isConnected) { localize(promoModal.el); updateImpact(shell, composerContext); }
    var page = document.querySelector('.bpd-page');
    if (page) localize(page.closest('.dash-genpage') || page);
  });
})();
