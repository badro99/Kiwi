/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CONNECTER UN CANAL EXTÉRIEUR — window.KiwiChannels
 * ---------------------------------------------------------------------------
 * Le bouton « Connecter » d'un agrégateur ne connectait rien : il remplaçait son
 * propre libellé par « Connecté » et affichait un toast de succès. Un clic, et
 * le commerçant croyait Glovo branché sur sa caisse — pour toujours, puisque
 * rien ne viendrait jamais le détromper.
 *
 * Ce module fait ce que ce bouton prétendait faire. Il demande au serveur une
 * clé (POST /api/channel/keys), montre au commerçant l'URL et le jeton à
 * remettre, et dit en toutes lettres ce qui manque encore pour que des
 * commandes arrivent vraiment.
 *
 * ── Ce que « connecté » veut dire, et ne veut pas dire ─────────────────────
 * La clé est réelle et fonctionne dès maintenant : n'importe quel système
 * capable de faire un POST HTTP (le connecteur d'un prestataire, un relais
 * Make / Zapier, un script de la boutique) dépose une commande qui devient un
 * ticket imprimable. Ce que Kiwi ne peut PAS faire seul, c'est obliger Glovo à
 * appeler cette URL : le programme POS de Delivery Hero (propriétaire de Glovo)
 * passe par un accord signé et des identifiants remis par un représentant
 * local. Tant qu'il n'existe pas, la clé attend — et l'écran le dit, plutôt que
 * d'afficher une pastille verte.
 *
 * API
 *   KiwiChannels.connect(channel, label)  → ouvre le panneau, renvoie Promise<bool>
 *   KiwiChannels.list()                   → Promise<[{id, channel, status, last_ts…}]>
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LANG = function () { try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; } };

  /* Ce qu'il reste à faire APRÈS avoir la clé, par canal. C'est la partie que le
   * commerçant ne peut pas deviner et que personne d'autre ne lui dira. */
  var NOTES = {
    glovo: {
      fr: 'Glovo (groupe Delivery Hero) ne laisse pas un logiciel de caisse se brancher tout seul : leur programme POS demande un accord signé, puis des identifiants remis par leur représentant au Maroc. Donnez-leur l\'adresse et la clé ci-dessous · c\'est exactement ce qu\'ils réclament. En attendant, la clé fonctionne déjà avec un relais (Make, Zapier, votre propre script).',
      en: 'Glovo (Delivery Hero group) does not let a POS connect on its own: their POS programme requires a signed agreement, then credentials handed over by their representative in Morocco. Give them the address and key below · that is exactly what they ask for. Meanwhile the key already works with a relay (Make, Zapier, your own script).',
      ar: 'لا تسمح Glovo (مجموعة Delivery Hero) لبرنامج صندوق بالاتصال وحده: برنامجهم يتطلب اتفاقًا موقعًا ثم بيانات اعتماد يسلمها ممثلهم في المغرب. أعطهم العنوان والمفتاح أدناه.',
    },
    yassir: {
      fr: 'Yassir Express ne publie pas d\'interface de caisse ouverte. Passez par votre gestionnaire de compte, ou reliez leur tableau de bord à cette adresse via un relais (Make, Zapier).',
      en: 'Yassir Express publishes no open POS interface. Go through your account manager, or link their dashboard to this address via a relay (Make, Zapier).',
      ar: 'لا تنشر Yassir Express واجهة صندوق مفتوحة. مرّ عبر مدير حسابك أو اربط لوحتهم بهذا العنوان عبر وسيط.',
    },
    /* Shopify ne permet de configurer QU'UNE URL, sans en-tête. C'est pour ça
     * que l'adresse ci-dessous porte l'identité dans son chemin et que
     * l'authentification passe par la signature HMAC que Shopify calcule.
     * Le relais (Make, Zapier) n'est donc plus nécessaire — il reste possible
     * via une clé « générique » pour qui en a déjà un qui tourne. */
    shopify: {
      fr: 'Shopify signe chaque commande qu\'il envoie. Kiwi vérifie cette signature : il faut donc lui confier la clé que Shopify affiche au moment où vous créez le webhook. Sans elle, l\'adresse ci-dessus refuse tout · y compris les vraies commandes.',
      en: 'Shopify signs every order it sends. Kiwi verifies that signature, so it needs the key Shopify shows you when you create the webhook. Without it the address above refuses everything · including genuine orders.',
      ar: 'يوقّع Shopify كل طلب يرسله. تتحقق Kiwi من هذا التوقيع، لذا تحتاج إلى المفتاح الذي يعرضه Shopify عند إنشاء الـ webhook. بدونه يرفض العنوان أعلاه كل شيء.',
    },
    generic: {
      fr: 'N\'importe quel système capable d\'un POST HTTP peut déposer une commande ici : un relais Make ou Zapier, un script, votre site. Le format attendu est décrit sous l\'adresse.',
      en: 'Any system that can make an HTTP POST can drop an order here: a Make or Zapier relay, a script, your website. The expected format is described under the address.',
      ar: 'أي نظام قادر على POST HTTP يمكنه إيداع طلب هنا: وسيط Make أو Zapier، أو سكربت، أو موقعك.',
    },
  };

  var T = {
    fr: {
      title: 'Connecter un canal', once: 'Cette clé ne sera plus jamais affichée. Copiez-la maintenant.',
      addr: 'Adresse à appeler', key: 'Clé secrète', copy: 'Copier', copied: 'Copié',
      what: 'Ce qui se passe ensuite', fmt: 'Format attendu',
      done: 'Clé créée', pending: 'En attente du prestataire',
      err: 'Impossible de créer la clé', errSub: 'Réessayez dans un instant.',
      hdr: 'Chaque commande reçue devient un ticket en attente à la caisse. Personne ne la met en cuisine à votre place : votre équipe l\'accepte, comme une commande au comptoir.',
      hook: 'Adresse du webhook', sig: 'Clé de signature Shopify',
      sigPh: 'Collez ici la clé affichée par Shopify',
      save: 'Enregistrer', saving: '…', savedT: 'Signature enregistrée',
      savedD: 'Les commandes de cette boutique seront acceptées.',
      saveErr: 'Enregistrement impossible', saveErrD: 'Vérifiez la clé et réessayez.',
      steps: 'Dans Shopify, en trois gestes',
      st1: 'Réglages → Notifications → Webhooks → « Créer un webhook ».',
      st2: 'Événement « Création de commande », format JSON, et collez l\'adresse ci-dessus.',
      st3: 'Shopify affiche alors une clé de signature : recopiez-la ici et enregistrez.',
    },
    en: {
      title: 'Connect a channel', once: 'This key will never be shown again. Copy it now.',
      addr: 'Address to call', key: 'Secret key', copy: 'Copy', copied: 'Copied',
      what: 'What happens next', fmt: 'Expected format',
      done: 'Key created', pending: 'Waiting on the provider',
      err: 'Could not create the key', errSub: 'Try again in a moment.',
      hdr: 'Every order received becomes a pending ticket at the till. Nobody sends it to the kitchen for you: your team accepts it, like a counter order.',
      hook: 'Webhook address', sig: 'Shopify signing key',
      sigPh: 'Paste the key Shopify shows you',
      save: 'Save', saving: '…', savedT: 'Signature saved',
      savedD: 'Orders from this shop will now be accepted.',
      saveErr: 'Could not save', saveErrD: 'Check the key and try again.',
      steps: 'In Shopify, in three steps',
      st1: 'Settings → Notifications → Webhooks → "Create webhook".',
      st2: 'Event "Order creation", JSON format, and paste the address above.',
      st3: 'Shopify then shows a signing key: copy it here and save.',
    },
    ar: {
      title: 'ربط قناة', once: 'لن يُعرض هذا المفتاح مرة أخرى. انسخه الآن.',
      addr: 'العنوان المطلوب', key: 'المفتاح السري', copy: 'نسخ', copied: 'تم النسخ',
      what: 'ما يحدث بعد ذلك', fmt: 'الصيغة المتوقعة',
      done: 'تم إنشاء المفتاح', pending: 'في انتظار المزوّد',
      err: 'تعذّر إنشاء المفتاح', errSub: 'أعد المحاولة بعد لحظات.',
      hdr: 'كل طلب يصل يصبح تذكرة في انتظار الصندوق. فريقك هو من يقبلها.',
      hook: 'عنوان الـ webhook', sig: 'مفتاح توقيع Shopify',
      sigPh: 'الصق هنا المفتاح الذي يعرضه Shopify',
      save: 'حفظ', saving: '…', savedT: 'تم حفظ التوقيع',
      savedD: 'ستُقبل طلبات هذا المتجر من الآن.',
      saveErr: 'تعذّر الحفظ', saveErrD: 'تحقّق من المفتاح وأعد المحاولة.',
      steps: 'في Shopify، بثلاث خطوات',
      st1: 'الإعدادات ← الإشعارات ← Webhooks ← «إنشاء webhook».',
      st2: 'الحدث «إنشاء طلب»، صيغة JSON، والصق العنوان أعلاه.',
      st3: 'يعرض Shopify عندئذٍ مفتاح توقيع: انسخه هنا واحفظه.',
    },
  };
  var str = function () { return T[LANG()] || T.fr; };
  var note = function (ch) { var n = NOTES[ch] || NOTES.generic; return n[LANG()] || n.fr; };

  var SAMPLE = '{\n  "ref": "GLV-4712",\n  "total": 240,\n  "customer": { "name": "…", "phone": "…", "address": "…" },\n  "lines": [ { "name": "Tajine kefta", "qty": 2, "unitPrice": 120 } ]\n}';

  var SHOP = {
    fr: {
      title: 'Connecter Shopify', intro: 'Reliez votre boutique une fois. Kiwi reste la source du stock et synchronise en arrière-plan.',
      domain: 'Adresse de la boutique', domainPh: 'ma-boutique.myshopify.com', authorize: 'Continuer vers Shopify',
      legacy: 'Les commandes Shopify arrivent déjà par l’ancien webhook. Connectez aussi l’inventaire pour synchroniser le stock.',
      connected: 'Boutique autorisée', location: 'Emplacement Shopify', inspect: 'Vérifier les articles',
      reauthorize: 'Réautoriser Shopify',
      mapTitle: 'Correspondances exactes', matched: 'liées', byBarcode: 'par code-barres', bySku: 'par SKU',
      unmatched: 'sans correspondance', ambiguous: 'ambiguës', activate: 'Activer et aligner le stock',
      shopifyOnly: 'sur Shopify uniquement', importable: 'importables', importTitle: 'Importer vers Kiwi',
      importSelected: 'Importer la sélection', selected: 'sélectionnés', imported: 'Import terminé', importedCount: 'article(s) importé(s)',
      importSearch: 'Rechercher un produit Shopify', importLimit: 'Maximum 100 articles par import.',
      importHint: 'Les articles importés restent inactifs dans Kiwi jusqu’à ce que vous confirmiez leur prix en MAD.',
      guideTitle: 'Comment connecter cette boutique',
      guideSteps: ['Saisissez le domaine .myshopify.com et autorisez Kiwi dans Shopify.', 'Choisissez l’emplacement Shopify qui correspond à cette boutique Kiwi.', 'Vérifiez les correspondances exactes par code-barres ou SKU.', 'Importez uniquement les produits voulus, puis confirmez leurs prix en MAD.', 'Activez la synchronisation : les quantités Kiwi remplacent alors celles des variantes liées.'],
      featuresTitle: 'Fonctions incluses',
      features: ['Les commandes Shopify en MAD arrivent à valider dans Kiwi et le stock est déduit une seule fois.', 'Stock Kiwi envoyé à Shopify après une vente ou correction locale.', 'Détection des modifications de stock faites directement dans Shopify.', 'File de reprise automatique en cas d’erreur Shopify.', 'Jetons chiffrés côté serveur ; aucun secret envoyé au navigateur.'],
      setupTitle: 'Produits importés à terminer', priceMAD: 'Prix de vente MAD', setupMeta: 'variantes · stock',
      configureSelected: 'Enregistrer les prix et activer', configured: 'Produits activés', invalidPrice: 'Saisissez un prix MAD supérieur à zéro pour chaque produit sélectionné.',
      finishSetup: 'Terminez les prix MAD des produits importés avant d’activer la synchronisation.',
      noLinks: 'Aucun produit n’est lié. Importez un produit ou ajoutez le même code-barres/SKU dans Kiwi avant d’activer la synchronisation.',
      acknowledge: 'Je comprends que Kiwi remplacera les quantités Shopify des variantes liées.',
      reconcileConfirm: 'Remplacer maintenant les quantités Shopify liées par les quantités Kiwi ?', connectedNoLinks: 'Shopify connecté · aucun produit lié',
      linkedVariants: 'variantes liées', lastSync: 'dernière synchro', neverSynced: 'aucune synchro terminée',
      missingIdentifier: 'Ajoutez un SKU ou un code-barres dans Shopify', duplicateIdentifier: 'SKU ou code-barres dupliqué', identifierUsed: 'Identifiant déjà utilisé dans Kiwi',
      activateWarn: 'Shopify prendra les quantités Kiwi pour les variantes liées. Les lignes sans correspondance ne seront pas modifiées.',
      active: 'Synchronisation active', pending: 'en attente', failed: 'en erreur', drift: 'écarts détectés',
      reconcile: 'Réconcilier maintenant', retry: 'Réessayer', refresh: 'Actualiser les correspondances',
      working: 'Connexion en cours…', error: 'Connexion Shopify impossible', invalid: 'Vérifiez le domaine et réessayez.',
      oauthFail: 'Shopify n’a pas terminé l’autorisation. Réessayez depuis Kiwi.', done: 'Shopify est connecté. Choisissez maintenant l’emplacement à synchroniser.',
    },
    en: {
      title: 'Connect Shopify', intro: 'Link the store once. Kiwi remains the stock authority and synchronizes in the background.',
      domain: 'Store address', domainPh: 'my-store.myshopify.com', authorize: 'Continue to Shopify',
      legacy: 'Shopify orders already arrive through the legacy webhook. Connect inventory as well to synchronize stock.',
      connected: 'Authorized store', location: 'Shopify location', inspect: 'Check products',
      reauthorize: 'Reauthorize Shopify',
      mapTitle: 'Exact matches', matched: 'linked', byBarcode: 'by barcode', bySku: 'by SKU',
      unmatched: 'unmatched', ambiguous: 'ambiguous', activate: 'Activate and align inventory',
      shopifyOnly: 'Shopify only', importable: 'importable', importTitle: 'Import into Kiwi',
      importSelected: 'Import selected', selected: 'selected', imported: 'Import complete', importedCount: 'product(s) imported',
      importSearch: 'Search Shopify products', importLimit: 'Maximum 100 products per import.',
      importHint: 'Imported products remain inactive in Kiwi until you confirm their price in MAD.',
      guideTitle: 'How to connect this boutique',
      guideSteps: ['Enter the .myshopify.com domain and authorize Kiwi in Shopify.', 'Choose the Shopify location that represents this Kiwi boutique.', 'Review exact barcode or SKU matches.', 'Import only the products you want, then confirm their selling prices in MAD.', 'Activate synchronization: Kiwi quantities then replace the linked Shopify variant quantities.'],
      featuresTitle: 'Included features',
      features: ['MAD Shopify orders arrive in Kiwi for approval and reduce stock exactly once.', 'Kiwi stock is sent to Shopify after a local sale or correction.', 'Direct Shopify inventory edits are detected as drift.', 'A durable retry queue handles temporary Shopify failures.', 'Tokens are encrypted server-side; no secret is returned to the browser.'],
      setupTitle: 'Imported products to finish', priceMAD: 'Selling price MAD', setupMeta: 'variants · stock',
      configureSelected: 'Save prices and activate', configured: 'Products activated', invalidPrice: 'Enter a MAD price above zero for every selected product.',
      finishSetup: 'Finish the MAD prices for imported products before activating synchronization.',
      noLinks: 'No product is linked. Import a product or add the same barcode/SKU in Kiwi before activating synchronization.',
      acknowledge: 'I understand that Kiwi will replace Shopify quantities for linked variants.',
      reconcileConfirm: 'Replace linked Shopify quantities with Kiwi quantities now?', connectedNoLinks: 'Shopify connected · no products linked',
      linkedVariants: 'linked variants', lastSync: 'last sync', neverSynced: 'no completed sync yet',
      missingIdentifier: 'Add a SKU or barcode in Shopify', duplicateIdentifier: 'Duplicate SKU or barcode', identifierUsed: 'Identifier already used in Kiwi',
      activateWarn: 'Shopify will use Kiwi quantities for linked variants. Unmatched rows will not be changed.',
      active: 'Sync active', pending: 'pending', failed: 'failed', drift: 'drift detected',
      reconcile: 'Reconcile now', retry: 'Retry', refresh: 'Refresh matches',
      working: 'Connecting…', error: 'Could not connect Shopify', invalid: 'Check the store domain and try again.',
      oauthFail: 'Shopify did not complete authorization. Try again from Kiwi.', done: 'Shopify is connected. Now choose the location to synchronize.',
    },
    ar: {
      title: 'ربط Shopify', intro: 'اربط المتجر مرة واحدة. يبقى Kiwi مصدر المخزون وتتم المزامنة في الخلفية.',
      domain: 'عنوان المتجر', domainPh: 'my-store.myshopify.com', authorize: 'المتابعة إلى Shopify',
      legacy: 'تصل طلبات Shopify عبر الربط القديم. اربط المخزون أيضًا لمزامنة الكميات.',
      connected: 'المتجر المصرح', location: 'موقع Shopify', inspect: 'فحص المنتجات',
      reauthorize: 'إعادة تفويض Shopify',
      mapTitle: 'المطابقات الدقيقة', matched: 'مرتبطة', byBarcode: 'بالباركود', bySku: 'برمز SKU',
      unmatched: 'غير متطابقة', ambiguous: 'ملتبسة', activate: 'تفعيل ومطابقة المخزون',
      shopifyOnly: 'في Shopify فقط', importable: 'قابلة للاستيراد', importTitle: 'الاستيراد إلى Kiwi',
      importSelected: 'استيراد المحدد', selected: 'محدد', imported: 'اكتمل الاستيراد', importedCount: 'منتج مستورد',
      importSearch: 'البحث في منتجات Shopify', importLimit: 'الحد الأقصى 100 منتج لكل عملية استيراد.',
      importHint: 'تبقى المنتجات المستوردة غير نشطة في Kiwi حتى تأكيد سعرها بالدرهم.',
      guideTitle: 'كيفية ربط هذا المتجر',
      guideSteps: ['أدخل نطاق .myshopify.com وامنح Kiwi الإذن داخل Shopify.', 'اختر موقع Shopify الذي يمثل متجر Kiwi هذا.', 'راجع المطابقات الدقيقة بواسطة الباركود أو SKU.', 'استورد المنتجات المطلوبة فقط ثم أكد أسعار البيع بالدرهم.', 'فعّل المزامنة: بعدها تستبدل كميات Kiwi كميات متغيرات Shopify المرتبطة.'],
      featuresTitle: 'الميزات المتضمنة',
      features: ['تصل طلبات Shopify بالدرهم إلى Kiwi للموافقة ويُخصم المخزون مرة واحدة فقط.', 'تُرسل كميات Kiwi إلى Shopify بعد البيع أو التصحيح المحلي.', 'يتم اكتشاف تعديلات المخزون المباشرة داخل Shopify.', 'قائمة إعادة محاولة دائمة تعالج أعطال Shopify المؤقتة.', 'الرموز مشفرة على الخادم ولا يُرسل أي سر إلى المتصفح.'],
      setupTitle: 'منتجات مستوردة تحتاج الإكمال', priceMAD: 'سعر البيع بالدرهم', setupMeta: 'متغيرات · المخزون',
      configureSelected: 'حفظ الأسعار والتفعيل', configured: 'تم تفعيل المنتجات', invalidPrice: 'أدخل سعراً بالدرهم أكبر من صفر لكل منتج محدد.',
      finishSetup: 'أكمل أسعار المنتجات المستوردة بالدرهم قبل تفعيل المزامنة.',
      noLinks: 'لا يوجد منتج مرتبط. استورد منتجاً أو أضف نفس الباركود/SKU في Kiwi قبل تفعيل المزامنة.',
      acknowledge: 'أفهم أن Kiwi سيستبدل كميات Shopify للمتغيرات المرتبطة.',
      reconcileConfirm: 'هل تريد استبدال كميات Shopify المرتبطة بكميات Kiwi الآن؟', connectedNoLinks: 'Shopify متصل · لا توجد منتجات مرتبطة',
      linkedVariants: 'متغيرات مرتبطة', lastSync: 'آخر مزامنة', neverSynced: 'لا توجد مزامنة مكتملة بعد',
      missingIdentifier: 'أضف SKU أو باركود في Shopify', duplicateIdentifier: 'SKU أو باركود مكرر', identifierUsed: 'المعرّف مستخدم بالفعل في Kiwi',
      activateWarn: 'ستستخدم Shopify كميات Kiwi للمتغيرات المرتبطة. لن تتغير الأسطر غير المتطابقة.',
      active: 'المزامنة نشطة', pending: 'قيد الانتظار', failed: 'أخطاء', drift: 'اختلافات مكتشفة',
      reconcile: 'مطابقة الآن', retry: 'إعادة المحاولة', refresh: 'تحديث المطابقات',
      working: 'جارٍ الربط…', error: 'تعذر ربط Shopify', invalid: 'تحقق من عنوان المتجر وحاول مجددًا.',
      oauthFail: 'لم تكتمل موافقة Shopify. حاول مجددًا من Kiwi.', done: 'تم ربط Shopify. اختر الآن الموقع المراد مزامنته.',
    },
  };

  function toast(m, o) { try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(m, o); } catch (_) {} }

  function shopStr() { return SHOP[LANG()] || SHOP.fr; }
  function shopError(message) {
    var s = shopStr(), code = String(message || '');
    if (code === 'no-linked-variants') return s.noLinks;
    if (code === 'setup-required') return s.finishSetup;
    if (code === 'setup-price-invalid') return s.invalidPrice;
    return code || s.invalid;
  }
  function shopApi(action, extra) {
    return fetch('/api/shopify/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.detail || j.error || 'shopify'); return j; }); });
  }

  function authorizeShopify(shop) {
    return fetch('/api/shopify/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ shop: shop }),
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.authorize) throw new Error(j.error || shopStr().invalid); return j; }); })
      .then(function (j) { window.location.assign(j.authorize); });
  }

  function shopButton(label, fn, ghost) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chl-copy shp-btn' + (ghost ? ' is-ghost' : ''); b.textContent = label;
    b.addEventListener('click', function () {
      b.disabled = true;
      Promise.resolve(fn()).catch(function (e) {
        toast(shopStr().error, { type: 'warn', desc: shopError(e && e.message) });
      }).finally(function () { b.disabled = false; });
    });
    return b;
  }

  function shopMetric(value, label) {
    var box = document.createElement('div'); box.className = 'shp-metric';
    var n = document.createElement('strong'); n.textContent = String(value || 0);
    var l = document.createElement('span'); l.textContent = label;
    box.appendChild(n); box.appendChild(l); return box;
  }

  function shopGuide(root, s) {
    var guide = document.createElement('details'); guide.className = 'shp-guide';
    var summary = document.createElement('summary'); summary.textContent = s.guideTitle; guide.appendChild(summary);
    var steps = document.createElement('ol');
    (s.guideSteps || []).forEach(function (copy) { var item = document.createElement('li'); item.textContent = copy; steps.appendChild(item); });
    guide.appendChild(steps);
    var title = document.createElement('strong'); title.textContent = s.featuresTitle; guide.appendChild(title);
    var features = document.createElement('ul');
    (s.features || []).forEach(function (copy) { var item = document.createElement('li'); item.textContent = copy; features.appendChild(item); });
    guide.appendChild(features); root.appendChild(guide);
  }

  function shopSetup(root, products, reload) {
    var s = shopStr(), pending = products || [];
    if (!pending.length) return;
    var setup = document.createElement('details'); setup.className = 'shp-list shp-setup'; setup.open = true;
    var summary = document.createElement('summary'); summary.textContent = String(pending.length) + ' · ' + s.setupTitle; setup.appendChild(summary);
    var selected = new Set(), inputs = new Map(), button;
    pending.slice(0, 100).forEach(function (product) {
      var row = document.createElement('div'); row.className = 'shp-setup-row';
      var check = document.createElement('input'); check.type = 'checkbox'; check.value = product.productId || '';
      var copy = document.createElement('span');
      var name = document.createElement('strong'); name.textContent = product.name || '';
      var meta = document.createElement('small'); meta.textContent = String(product.variants || 0) + ' ' + s.setupMeta + ' ' + String(product.stock || 0);
      copy.appendChild(name); copy.appendChild(meta);
      var price = document.createElement('input'); price.type = 'number'; price.min = '0.01'; price.max = '10000000'; price.step = '0.01'; price.inputMode = 'decimal'; price.placeholder = s.priceMAD; price.value = product.priceMAD > 0 ? String(product.priceMAD) : '';
      inputs.set(check.value, price);
      check.addEventListener('change', function () {
        if (check.checked) selected.add(check.value); else selected.delete(check.value);
        if (button) { button.disabled = !selected.size; button.textContent = s.configureSelected + (selected.size ? ' · ' + selected.size : ''); }
      });
      row.appendChild(check); row.appendChild(copy); row.appendChild(price); setup.appendChild(row);
    });
    button = shopButton(s.configureSelected, function () {
      var rows = Array.from(selected).map(function (productId) { return { productId: productId, priceMAD: Number(inputs.get(productId).value) }; });
      var invalid = rows.find(function (row) { return !Number.isFinite(row.priceMAD) || row.priceMAD <= 0; });
      if (!rows.length || invalid) { if (invalid) inputs.get(invalid.productId).focus(); throw new Error(s.invalidPrice); }
      return shopApi('configure-imports', { products: rows }).then(function (out) {
        toast(s.configured, { type: 'success', desc: String(out.updated || rows.length) });
        return out.preview ? shopPreview(root, out, reload) : reload();
      });
    });
    button.disabled = true; setup.appendChild(button); root.appendChild(setup);
  }

  function shopPreview(root, data, reload) {
    var s = shopStr(), p = data && data.preview || data || {}, c = p.counts || {};
    var alreadyActive = !!(data && data.connection && data.connection.status === 'active');
    root.textContent = '';
    var h = document.createElement('div'); h.className = 'chl-h'; h.textContent = s.mapTitle; root.appendChild(h);
    var metrics = document.createElement('div'); metrics.className = 'shp-metrics';
    metrics.appendChild(shopMetric(c.matched, s.matched));
    metrics.appendChild(shopMetric(c.barcode, s.byBarcode));
    metrics.appendChild(shopMetric(c.sku, s.bySku));
    metrics.appendChild(shopMetric(c.unmatchedKiwi, s.unmatched));
    metrics.appendChild(shopMetric(c.ambiguous, s.ambiguous));
    metrics.appendChild(shopMetric(c.unmatchedShopify, s.shopifyOnly));
    metrics.appendChild(shopMetric(c.importable, s.importable));
    root.appendChild(metrics);
    shopSetup(root, p.setup || [], reload);
    if ((p.matches || []).length) {
      var matched = document.createElement('details'); matched.className = 'shp-list';
      var ms = document.createElement('summary'); ms.textContent = (c.matched || 0) + ' ' + s.matched; matched.appendChild(ms);
      (p.matches || []).slice(0, 30).forEach(function (row) {
        var line = document.createElement('div');
        line.textContent = row.kiwiTitle + ' → ' + row.shopifyTitle + ' · ' + (row.method === 'barcode' ? s.byBarcode : s.bySku);
        matched.appendChild(line);
      });
      root.appendChild(matched);
    }
    if ((p.unmatched || []).length || (p.ambiguous || []).length) {
      var missing = document.createElement('details'); missing.className = 'shp-list';
      var us = document.createElement('summary'); us.textContent = ((p.unmatched || []).length + (p.ambiguous || []).length) + ' ' + s.unmatched; missing.appendChild(us);
      (p.unmatched || []).concat(p.ambiguous || []).slice(0, 30).forEach(function (row) {
        var line = document.createElement('div'); line.textContent = row.title + (row.sku ? ' · SKU ' + row.sku : ''); missing.appendChild(line);
      });
      root.appendChild(missing);
    }
    if ((p.unmatchedShopify || []).length) {
      var shopOnly = document.createElement('details'); shopOnly.className = 'shp-list shp-import';
      var ss = document.createElement('summary'); ss.textContent = (c.unmatchedShopify || p.unmatchedShopify.length) + ' ' + s.shopifyOnly; shopOnly.appendChild(ss);
      var importRows = p.unmatchedShopify || [];
      var eligible = importRows.filter(function (row) { return row.eligible; }).length;
      var selectedIds = new Set();
      var search = document.createElement('input'); search.className = 'shp-import-search'; search.type = 'search'; search.placeholder = s.importSearch; shopOnly.appendChild(search);
      var resultCount = document.createElement('small'); resultCount.className = 'shp-import-count'; shopOnly.appendChild(resultCount);
      var rows = document.createElement('div'); rows.className = 'shp-import-rows'; shopOnly.appendChild(rows);
      var importBtn;
      function updateImportButton() {
        if (!importBtn) return;
        var count = selectedIds.size;
        importBtn.disabled = !count; importBtn.textContent = s.importSelected + (count ? ' · ' + count + ' ' + s.selected : '');
      }
      function renderImportRows() {
        var query = String(search.value || '').trim().toLowerCase();
        var filtered = importRows.filter(function (row) {
          return !query || [row.title, row.sku, row.barcode].some(function (value) { return String(value || '').toLowerCase().indexOf(query) !== -1; });
        });
        rows.textContent = '';
        filtered.slice(0, 100).forEach(function (row) {
          var line = document.createElement('label'); line.className = 'shp-import-row';
          var check = document.createElement('input'); check.type = 'checkbox'; check.value = row.shopifyVariantId || ''; check.disabled = !row.eligible; check.checked = selectedIds.has(check.value);
          check.addEventListener('change', function () {
            if (check.checked && selectedIds.size >= 100) { check.checked = false; toast(s.importLimit, { type: 'error' }); return; }
            if (check.checked) selectedIds.add(check.value); else selectedIds.delete(check.value);
            updateImportButton();
          });
          var copy = document.createElement('span');
          var name = document.createElement('strong'); name.textContent = row.title || '';
          var meta = document.createElement('small');
          var identifier = row.barcode ? s.byBarcode + ' ' + row.barcode : row.sku ? 'SKU ' + row.sku : '';
          var reason = row.reason === 'missing-identifier' ? s.missingIdentifier : row.reason === 'duplicate-identifier' ? s.duplicateIdentifier : row.reason ? s.identifierUsed : '';
          meta.textContent = [row.quantity == null ? '' : String(row.quantity), identifier, reason].filter(Boolean).join(' · ');
          copy.appendChild(name); copy.appendChild(meta); line.appendChild(check); line.appendChild(copy); rows.appendChild(line);
        });
        resultCount.textContent = String(Math.min(filtered.length, 100)) + ' / ' + String(filtered.length);
      }
      search.addEventListener('input', renderImportRows);
      var hint = document.createElement('p'); hint.className = 'chl-note shp-warn'; hint.textContent = s.importHint; shopOnly.appendChild(hint);
      if (eligible) {
        importBtn = shopButton(s.importSelected, function () {
          var ids = Array.from(selectedIds);
          if (!ids.length) throw new Error(s.importSelected);
          return shopApi('import-selected', { variantIds: ids }).then(function (out) {
            toast(s.imported, { type: 'success', desc: String(out.imported || ids.length) + ' ' + s.importedCount });
            return out.preview ? shopPreview(root, out, reload) : reload();
          });
        });
        importBtn.disabled = true;
        shopOnly.appendChild(importBtn);
      }
      renderImportRows();
      root.appendChild(shopOnly);
    }
    if (c.matched && !(p.setup || []).length && !alreadyActive) {
      var warn = document.createElement('p'); warn.className = 'chl-note shp-warn'; warn.textContent = s.activateWarn; root.appendChild(warn);
      var acknowledge = document.createElement('label'); acknowledge.className = 'shp-ack';
      var ack = document.createElement('input'); ack.type = 'checkbox';
      var ackCopy = document.createElement('span'); ackCopy.textContent = s.acknowledge;
      acknowledge.appendChild(ack); acknowledge.appendChild(ackCopy); root.appendChild(acknowledge);
      var activate = shopButton(s.activate, function () {
        return shopApi('activate').then(function (out) { toast(s.active, { type: 'success' }); return reload(out); });
      });
      activate.disabled = true; ack.addEventListener('change', function () { activate.disabled = !ack.checked; }); root.appendChild(activate);
    } else if ((p.setup || []).length && !alreadyActive) {
      var finishSetup = document.createElement('p'); finishSetup.className = 'chl-note shp-warn'; finishSetup.textContent = s.finishSetup; root.appendChild(finishSetup);
    } else if (!c.matched) {
      var noLinks = document.createElement('p'); noLinks.className = 'chl-note shp-warn'; noLinks.textContent = s.noLinks; root.appendChild(noLinks);
    }
  }

  function renderShopify(root, status) {
    var s = shopStr(); root.textContent = '';
    var intro = document.createElement('p'); intro.className = 'chl-hdr'; intro.textContent = s.intro; root.appendChild(intro);
    shopGuide(root, s);
    var connection = status && status.connection;
    if (!connection) {
      if (status && status.legacyWebhookLinks) {
        var legacy = document.createElement('div'); legacy.className = 'chl-once'; legacy.textContent = s.legacy; root.appendChild(legacy);
      }
      var f = document.createElement('label'); f.className = 'chl-f';
      var lb = document.createElement('span'); lb.className = 'chl-f-l'; lb.textContent = s.domain;
      var input = document.createElement('input'); input.className = 'chl-f-v chl-in'; input.placeholder = s.domainPh; input.autocomplete = 'url'; input.inputMode = 'url';
      f.appendChild(lb); f.appendChild(input); root.appendChild(f);
      root.appendChild(shopButton(s.authorize, function () {
        var shop = String(input.value || '').trim(); if (!shop) { input.focus(); throw new Error(s.invalid); }
        return authorizeShopify(shop);
      }));
      return;
    }

    var store = document.createElement('div'); store.className = 'shp-store';
    var storeLabel = document.createElement('span'); storeLabel.textContent = s.connected;
    var storeName = document.createElement('strong'); storeName.textContent = connection.shop;
    store.appendChild(storeLabel); store.appendChild(storeName); root.appendChild(store);
    root.appendChild(shopButton(s.reauthorize, function () { return authorizeShopify(connection.shop); }, true));

    var select = document.createElement('select'); select.className = 'chl-f-v chl-in shp-select';
    var first = document.createElement('option'); first.value = ''; first.textContent = s.location; select.appendChild(first);
    (status.locations || []).forEach(function (loc) {
      var option = document.createElement('option'); option.value = loc.id; option.textContent = loc.name;
      if (connection.location && connection.location.id === loc.id) option.selected = true;
      select.appendChild(option);
    });
    root.appendChild(select);
    var previewSlot = document.createElement('div'); previewSlot.className = 'shp-preview';
    var reload = function () { return loadShopify(root); };
    root.appendChild(shopButton(connection.location ? s.refresh : s.inspect, function () {
      if (!select.value) { select.focus(); throw new Error(s.location); }
      var sameLocation = connection.location && connection.location.id === select.value;
      var action = sameLocation ? 'refresh-mapping' : 'select-location';
      var payload = sameLocation ? null : { locationId: select.value };
      return shopApi(action, payload).then(function (out) { shopPreview(previewSlot, out, reload); });
    }));

    if (connection.status === 'active') {
      var live = document.createElement('div'); live.className = 'shp-live';
      var linkedCount = Number(status.mapping.active || 0) + Number(status.mapping.drift || 0);
      var liveTitle = document.createElement('strong'); liveTitle.textContent = linkedCount ? s.active : s.connectedNoLinks; live.appendChild(liveTitle);
      var liveStats = document.createElement('span');
      var syncWhen = connection.lastSyncTs ? new Date(connection.lastSyncTs).toLocaleString(document.documentElement.lang || undefined) : s.neverSynced;
      liveStats.textContent = linkedCount + ' ' + s.linkedVariants + ' · ' + (status.queue.pending || 0) + ' ' + s.pending + ' · ' + (status.queue.failed || 0) + ' ' + s.failed + ' · ' + (status.mapping.drift || 0) + ' ' + s.drift + ' · ' + s.lastSync + ' ' + syncWhen;
      live.appendChild(liveStats); root.appendChild(live);
      var actions = document.createElement('div'); actions.className = 'shp-actions';
      if (linkedCount) actions.appendChild(shopButton(s.reconcile, function () { if (!window.confirm(s.reconcileConfirm)) return; return shopApi('reconcile').then(reload); }));
      if (status.queue.failed) actions.appendChild(shopButton(s.retry, function () { return shopApi('retry').then(reload); }, true));
      root.appendChild(actions);
    }
    if (connection.lastError) {
      var err = document.createElement('div'); err.className = 'chl-once'; err.textContent = connection.lastError; root.appendChild(err);
    }
    root.appendChild(previewSlot);
    shopSetup(previewSlot, status.setup || [], reload);
  }

  function loadShopify(root) {
    root.classList.add('is-loading');
    return fetch('/api/shopify/status', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'shopify'); return j; }); })
      .then(function (j) { renderShopify(root, j); return j; })
      .finally(function () { root.classList.remove('is-loading'); });
  }

  function openShopify() {
    var s = shopStr(), m = window.Kiwi.modal({ title: s.title, width: 680, body: '' });
    var slot = m && m.el && m.el.querySelector('.kiwi-modal-body');
    if (!slot) { if (m && m.close) m.close(); return Promise.resolve(false); }
    var root = document.createElement('div'); root.className = 'chl shp'; slot.appendChild(root);
    return loadShopify(root).then(function () { return true; }).catch(function (e) {
      root.textContent = ''; var err = document.createElement('div'); err.className = 'chl-once'; err.textContent = String(e && e.message || s.error); root.appendChild(err); return false;
    });
  }

  /* Un bloc « valeur + bouton copier ». Le jeton passe par textContent, jamais
   * par innerHTML : c'est une chaîne que le serveur vient de fabriquer, elle n'a
   * aucune raison de traverser un parseur HTML. */
  function field(label, value, mono) {
    var wrap = document.createElement('div');
    wrap.className = 'chl-f';
    var lb = document.createElement('div');
    lb.className = 'chl-f-l'; lb.textContent = label;
    var row = document.createElement('div');
    row.className = 'chl-f-r';
    var v = document.createElement('code');
    v.className = 'chl-f-v' + (mono ? ' is-key' : ''); v.textContent = value;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chl-copy'; btn.textContent = str().copy;
    btn.addEventListener('click', function () {
      try { navigator.clipboard.writeText(value); } catch (_) {}
      btn.textContent = str().copied;
      setTimeout(function () { btn.textContent = str().copy; }, 1600);
    });
    row.appendChild(v); row.appendChild(btn);
    wrap.appendChild(lb); wrap.appendChild(row);
    return wrap;
  }

  /* Le champ où le commerçant recopie la clé que Shopify vient de lui montrer.
   * Il part vers le serveur et n'en revient jamais : rien dans l'API ne peut
   * le relire. Tant qu'il n'est pas enregistré, la porte refuse tout — et le
   * dire ici évite au commerçant de croire que coller l'adresse suffisait. */
  function sigField(linkId) {
    var s = str();
    var wrap = document.createElement('div');
    wrap.className = 'chl-f';
    var lb = document.createElement('div');
    lb.className = 'chl-f-l'; lb.textContent = s.sig;
    var row = document.createElement('div');
    row.className = 'chl-f-r';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'chl-f-v chl-in'; inp.placeholder = s.sigPh;
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('spellcheck', 'false');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chl-copy'; btn.textContent = s.save;

    btn.addEventListener('click', function () {
      var v = String(inp.value || '').trim();
      if (!v) { inp.focus(); return; }
      btn.disabled = true; btn.textContent = s.saving;
      fetch('/api/channel/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: linkId, config: { shopifySecret: v } }),
      })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (out) {
          if (out.status !== 200 || !out.j || !out.j.ok) throw new Error('save');
          btn.textContent = s.savedT;
          inp.value = ''; inp.disabled = true;
          inp.placeholder = s.savedT;
          toast(s.savedT, { type: 'success', desc: s.savedD });
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = s.save;
          toast(s.saveErr, { type: 'warn', desc: s.saveErrD });
        });
    });

    row.appendChild(inp); row.appendChild(btn);
    wrap.appendChild(lb); wrap.appendChild(row);
    return wrap;
  }

  function steps(s) {
    var ol = document.createElement('ol');
    ol.className = 'chl-steps';
    [s.st1, s.st2, s.st3].forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ol.appendChild(li);
    });
    return ol;
  }

  function panel(channel, res) {
    var s = str();
    var box = document.createElement('div');
    box.className = 'chl';

    var hdr = document.createElement('p');
    hdr.className = 'chl-hdr'; hdr.textContent = s.hdr;
    box.appendChild(hdr);

    /* ── Shopify : réception native ──────────────────────────────────────────
     * Pas de jeton porteur à recopier ici — Shopify ne saurait pas l'envoyer.
     * L'identité est dans l'adresse, la preuve est dans la signature. Le seul
     * secret qui circule va donc dans l'autre sens : de Shopify vers Kiwi. */
    if (channel === 'shopify' && res.webhook) {
      box.appendChild(field(s.hook, res.webhook, false));

      var hs = document.createElement('div');
      hs.className = 'chl-h'; hs.textContent = s.steps;
      box.appendChild(hs);
      box.appendChild(steps(s));

      box.appendChild(sigField(res.key && res.key.id));

      var ps = document.createElement('p');
      ps.className = 'chl-note'; ps.textContent = note(channel);
      box.appendChild(ps);
      return box;
    }

    var warn = document.createElement('div');
    warn.className = 'chl-once'; warn.textContent = s.once;
    box.appendChild(warn);

    box.appendChild(field(s.addr, res.endpoint, false));
    box.appendChild(field(s.key, res.token, true));

    var h = document.createElement('div');
    h.className = 'chl-h'; h.textContent = s.what;
    box.appendChild(h);
    var p = document.createElement('p');
    p.className = 'chl-note'; p.textContent = note(channel);
    box.appendChild(p);

    var h2 = document.createElement('div');
    h2.className = 'chl-h'; h2.textContent = s.fmt;
    box.appendChild(h2);
    var pre = document.createElement('pre');
    pre.className = 'chl-pre';
    pre.textContent = 'POST ' + res.endpoint + '\nAuthorization: Bearer ' + '<' + s.key.toLowerCase() + '>' + '\nContent-Type: application/json\n\n' + SAMPLE;
    box.appendChild(pre);

    return box;
  }

  function connect(channel, label) {
    channel = String(channel || 'generic');
    if (channel === 'shopify') return openShopify();
    return fetch('/api/channel/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channel, label: String(label || '') }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (out) {
        var s = str();
        if (out.status !== 200 || !out.j || !out.j.ok || !out.j.token) {
          toast(s.err, { type: 'warn', desc: s.errSub });
          return false;
        }
        /* Kiwi.modal interpole `body` dans du innerHTML : lui passer un nœud
         * DOM y écrit « [object HTMLDivElement] ». On ouvre donc une coque vide
         * et on monte le panneau dedans — le jeton continue de passer par
         * textContent, sans jamais traverser un parseur HTML.
         *
         * Et surtout : si la fenêtre ne s'ouvre pas, on ne dit PAS que c'est
         * fait. La clé existe côté serveur mais le commerçant n'a pas pu la
         * lire — un toast vert ici serait exactement le mensonge que ce module
         * a été écrit pour supprimer. */
        var m = null;
        try {
          m = window.Kiwi.modal({ title: s.title + ' · ' + (label || channel), width: 620, body: '' });
          var slot = m && m.el && m.el.querySelector('.kiwi-modal-body');
          if (!slot) throw new Error('no modal body');
          slot.appendChild(panel(channel, out.j));
        } catch (_) {
          if (m && m.close) { try { m.close(); } catch (__) {} }
          toast(s.err, { type: 'warn', desc: s.errSub });
          return false;
        }
        toast(s.done, { type: 'success' });
        return true;
      })
      .catch(function () { toast(str().err, { type: 'warn', desc: str().errSub }); return false; });
  }

  function list() {
    return fetch('/api/channel/keys', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.keys) || []; })
      .catch(function () { return []; });
  }

  var CSS = '\
  .chl { display:flex; flex-direction:column; gap:14px; }\
  .chl-hdr { margin:0; font-size:13px; line-height:1.55; color:var(--n-600); }\
  .chl-once { padding:10px 12px; border-radius:10px; background:rgba(217,154,43,.12); color:#8A6210; font-size:12.5px; font-weight:600; }\
  .chl-f-l { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--n-500); margin-bottom:6px; }\
  .chl-f-r { display:flex; align-items:stretch; gap:8px; }\
  .chl-f-v { flex:1; min-width:0; padding:9px 11px; border:1px solid var(--n-200); border-radius:9px; background:var(--paper-soft);\
             font-family:var(--mono,ui-monospace,monospace); font-size:12px; color:var(--ink); overflow-x:auto; white-space:nowrap; }\
  .chl-f-v.is-key { color:var(--atlas); }\
  .chl-copy { flex:0 0 auto; padding:0 14px; border:0; border-radius:9px; background:var(--atlas); color:#fff;\
              font-size:12px; font-weight:600; cursor:pointer; }\
  .chl-h { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--n-500); margin-top:2px; }\
  .chl-note { margin:0; font-size:13px; line-height:1.6; color:var(--n-600); }\
  .chl-pre { margin:0; padding:12px; border-radius:10px; background:var(--paper-soft); border:1px solid var(--n-200);\
             font-family:var(--mono,ui-monospace,monospace); font-size:11.5px; line-height:1.6; color:var(--n-600); overflow-x:auto; }\
  .chl-in { white-space:normal; outline:none; }\
  .chl-in:focus { border-color:var(--atlas); }\
  .chl-in:disabled { color:var(--n-500); }\
  .chl-copy:disabled { opacity:.6; cursor:default; }\
  .chl-steps { margin:0; padding-inline-start:18px; display:flex; flex-direction:column; gap:6px;\
               font-size:13px; line-height:1.55; color:var(--n-600); }\
  .shp.is-loading { opacity:.65; pointer-events:none; }\
  .shp-btn { min-height:38px; align-self:flex-start; }\
  .shp-btn.is-ghost { background:transparent; color:var(--atlas); border:1px solid var(--n-200); }\
  .shp-store,.shp-live { display:flex; flex-direction:column; gap:4px; padding:12px; border:1px solid var(--n-200); border-radius:11px; background:var(--paper-soft); }\
  .shp-store span,.shp-live span { color:var(--n-500); font-size:11.5px; }\
  .shp-store strong,.shp-live strong { color:var(--ink); font-size:14px; overflow-wrap:anywhere; }\
  .shp-select { width:100%; min-height:42px; }\
  .shp-preview { display:flex; flex-direction:column; gap:12px; }\
  .shp-metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(96px,1fr)); gap:8px; }\
  .shp-metric { padding:10px; border:1px solid var(--n-200); border-radius:10px; background:var(--paper-soft); display:flex; flex-direction:column; gap:3px; }\
  .shp-metric strong { font-size:20px; color:var(--ink); }\
  .shp-metric span { font-size:10.5px; color:var(--n-500); }\
  .shp-warn { padding:10px 12px; border-inline-start:3px solid var(--atlas); background:var(--paper-soft); }\
  .shp-actions { display:flex; flex-wrap:wrap; gap:8px; }\
  .shp-guide { border:1px solid var(--n-200); border-radius:11px; padding:10px 12px; background:var(--paper-soft); color:var(--n-600); font-size:11.5px; }\
  .shp-guide summary { cursor:pointer; color:var(--ink); font-weight:700; }\
  .shp-guide ol,.shp-guide ul { margin:10px 0; padding-inline-start:20px; display:grid; gap:6px; line-height:1.45; }\
  .shp-guide strong { display:block; margin-top:12px; color:var(--ink); }\
  .shp-list { border:1px solid var(--n-200); border-radius:10px; padding:9px 11px; color:var(--n-600); font-size:11.5px; }\
  .shp-list summary { cursor:pointer; color:var(--ink); font-weight:600; }\
  .shp-list div { padding:7px 0; border-top:1px solid var(--n-200); overflow-wrap:anywhere; }\
  .shp-list summary + div { margin-top:8px; }\
  .shp-import-row { display:grid; grid-template-columns:auto 1fr; gap:9px; align-items:start; padding:9px 0; border-top:1px solid var(--n-200); cursor:pointer; }\
  .shp-import-row input { width:17px; height:17px; margin-top:2px; accent-color:var(--atlas); }\
  .shp-import-row span { display:flex; flex-direction:column; gap:3px; min-width:0; }\
  .shp-import-row strong { color:var(--ink); font-size:11.5px; overflow-wrap:anywhere; }\
  .shp-import-row small { color:var(--n-500); font-size:10.5px; overflow-wrap:anywhere; }\
  .shp-import-row:has(input:disabled) { cursor:not-allowed; opacity:.58; }\
  .shp-import-search { width:100%; margin-top:10px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; background:var(--surface); color:var(--ink); font:inherit; }\
  .shp-import-count { display:block; margin:5px 0 3px; color:var(--n-500); text-align:right; }\
  .shp-import-rows { max-height:340px; overflow:auto; }\
  .shp-setup-row { display:grid; grid-template-columns:auto minmax(0,1fr) minmax(120px,160px); gap:10px; align-items:center; }\
  .shp-setup-row>input[type="checkbox"] { width:17px; height:17px; accent-color:var(--atlas); }\
  .shp-setup-row>span { display:flex; flex-direction:column; gap:3px; min-width:0; }\
  .shp-setup-row strong { color:var(--ink); overflow-wrap:anywhere; }\
  .shp-setup-row small { color:var(--n-500); }\
  .shp-setup-row>input[type="number"] { width:100%; padding:9px 10px; border:1px solid var(--n-200); border-radius:9px; background:var(--surface); color:var(--ink); font:inherit; }\
  .shp-ack { display:flex; align-items:flex-start; gap:9px; padding:10px 12px; border:1px solid var(--n-200); border-radius:10px; color:var(--n-600); font-size:11.5px; line-height:1.45; cursor:pointer; }\
  .shp-ack input { width:17px; height:17px; flex:0 0 auto; accent-color:var(--atlas); }\
  @media(max-width:560px){.shp-setup-row{grid-template-columns:auto 1fr}.shp-setup-row>input[type="number"]{grid-column:2}}\
  html[data-theme="dark"] .chl-f-v.is-key { color:var(--mint); }';

  try {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  } catch (_) {}

  window.KiwiChannels = { connect: connect, list: list, shopifyStatus: openShopify };

  /* Shopify is operationally independent from the dashboard's generic action
   * registry. Returning merchant shells have historically loaded that registry
   * too early and silently skipped its integration handlers, leaving a visible
   * Shopify card that does nothing. Own this one exact action here, in capture
   * phase, so OAuth remains reachable even when the optional dashboard helper
   * failed to register. The shared handler stays in place for every other
   * connector and for shells where it loaded normally. */
  document.addEventListener('click', function (event) {
    var target = event.target && event.target.closest
      ? event.target.closest('[data-action="integration-connect"][data-channel="shopify"]')
      : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openShopify();
  }, true);

  try {
    var oauth = new URL(window.location.href).searchParams.get('shopify');
    if (oauth) {
      var clean = new URL(window.location.href); clean.searchParams.delete('shopify');
      window.history.replaceState({}, '', clean.pathname + clean.search + clean.hash);
      setTimeout(function () {
        if (oauth === 'connected' || oauth === 'connected-warning') toast(shopStr().done, { type: oauth === 'connected' ? 'success' : 'warn' });
        else toast(shopStr().error, { type: 'warn', desc: shopStr().oauthFail });
        openShopify();
      }, 500);
    }
  } catch (_) {}
})();
