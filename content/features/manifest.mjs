/* Pages « Fonctionnalités » de kiwi-os.com : un hub et une page par grande
 * fonction. Généré par tools/build-features.mjs ; vérifié par
 * tools/features-pages-test.mjs (contenu, prix, preuves de chaque promesse).
 *
 * Les adresses suivent celles des guides : une barre finale, le français en
 * mots français, l'anglais en mots anglais, l'arabe en mots arabes pour les
 * pages et en latin pour le hub (comme /ar/guides/). OrderPro est un nom de
 * produit : il garde son nom dans les trois langues. */
export const FEATURE_LOCALES = Object.freeze(['fr', 'en', 'ar']);

/* Date de publication et de dernière révision du contenu. La changer quand une
 * promesse ou une capture change, pas à chaque reconstruction. */
export const FEATURES_PUBLISHED = '2026-11-09T12:00:00+00:00';
export const FEATURES_MODIFIED = '2026-11-09T12:00:00+00:00';

const meta = (title, description, ogTitle, ogDescription, image, imageAlt) => ({
  title, description, ogTitle, ogDescription, image, imageAlt,
});

export const FEATURE_HUB = Object.freeze({
  id: 'hub',
  routes: { fr: '/fr/fonctionnalites/', en: '/en/features/', ar: '/ar/features/' },
  pages: {
    fr: meta(
      'Fonctionnalités du logiciel de caisse Kiwi au Maroc · Kiwi',
      'Caisse hors ligne, stock et catalogue, commande par QR code : ce que fait Kiwi pour les commerces et restaurants au Maroc, avec le plan qui l’inclut.',
      'Fonctionnalités Kiwi · caisse, stock, commande QR',
      'Ce que fait Kiwi, fonction par fonction, et le plan qui l’inclut.',
      'assets/features/og-fonctionnalites-fr.png',
      'Les fonctionnalités de Kiwi : caisse, stock et catalogue, commande par QR code.',
    ),
    en: meta(
      'Kiwi POS features for shops and restaurants in Morocco · Kiwi',
      'Offline till, inventory and catalogue, QR code ordering: what Kiwi does for shops and restaurants in Morocco, and which plan includes it.',
      'Kiwi features · till, inventory, QR ordering',
      'What Kiwi does, feature by feature, and which plan includes it.',
      'assets/features/og-features-en.png',
      'Kiwi features: till, inventory and catalogue, QR code ordering.',
    ),
    ar: meta(
      'خصائص برنامج الكاشير Kiwi في المغرب · Kiwi',
      'كاشير يعمل دون إنترنت، مخزون وكتالوج، طلب عبر رمز QR: ما يقدمه Kiwi للمتاجر والمطاعم في المغرب، والباقة التي تشمل كل خاصية.',
      'خصائص Kiwi · الكاشير والمخزون والطلب عبر QR',
      'ما يفعله Kiwi، خاصية بخاصية، والباقة التي تشملها.',
      'assets/features/og-features-ar.png',
      'خصائص Kiwi: الكاشير، المخزون والكتالوج، الطلب عبر رمز QR.',
    ),
  },
  og: {
    shot: 'caisse-restaurant-{locale}', phone: false,
    eyebrow: { fr: 'Kiwi · Fonctionnalités', en: 'Kiwi · Features', ar: 'Kiwi · الخصائص' },
    title: { fr: 'Caisse, stock et commande QR. <b>Un seul logiciel.</b>', en: 'Till, inventory and QR ordering. <b>One app.</b>', ar: 'الكاشير والمخزون والطلب عبر QR. <b>برنامج واحد.</b>' },
    foot: { fr: 'Pour les commerces et restaurants au Maroc', en: 'For shops and restaurants in Morocco', ar: 'للمتاجر والمطاعم في المغرب' },
  },
});

export const FEATURE_PAGES = Object.freeze([
  {
    id: 'caisse',
    plan: 'basic',
    icon: 'point_of_sale',
    guides: ['pos', 'openRestaurant'],
    routes: { fr: '/fr/fonctionnalites/caisse/', en: '/en/features/point-of-sale/', ar: '/ar/features/نظام-الكاشير/' },
    pages: {
      fr: meta(
        'Logiciel de caisse pour commerce au Maroc, même hors ligne · Kiwi',
        'Caisse Kiwi : ventes sans Internet, scan des codes-barres, tickets en français et en arabe, tiroir, clôture de caisse, rapport journalier et carnet de crédit. Dès 150 MAD par mois.',
        'Logiciel de caisse pour commerce au Maroc',
        'Une caisse qui encaisse sans Internet, imprime en arabe et tient votre carnet de crédit. Dès 150 MAD par mois.',
        'assets/features/og-caisse-fr.png',
        'La caisse Kiwi en restaurant : la carte à gauche, le ticket à droite.',
      ),
      en: meta(
        'Point of sale software for shops in Morocco, even offline · Kiwi',
        'Kiwi POS: sell without internet, scan barcodes, print receipts in French and Arabic, open the drawer, close the till, daily report and customer credit book. From 150 MAD a month.',
        'Point of sale software for shops in Morocco',
        'A till that keeps selling offline, prints in Arabic and keeps your credit book. From 150 MAD a month.',
        'assets/features/og-pos-en.png',
        'The Kiwi till in a restaurant: the menu on the left, the ticket on the right.',
      ),
      ar: meta(
        'برنامج كاشير للمتاجر في المغرب يعمل حتى دون إنترنت · Kiwi',
        'كاشير Kiwi: البيع دون إنترنت، قراءة الباركود، تذاكر بالفرنسية والعربية، درج النقود، إغلاق الصندوق، التقرير اليومي ودفتر الكريدي. ابتداء من 150 درهما في الشهر.',
        'برنامج كاشير للمتاجر في المغرب',
        'كاشير يواصل البيع دون إنترنت، ويطبع بالعربية، ويحفظ دفتر الكريدي. ابتداء من 150 درهما في الشهر.',
        'assets/features/og-pos-ar.png',
        'كاشير Kiwi في مطعم: القائمة على جهة والتذكرة على الجهة الأخرى.',
      ),
    },
    og: {
      shot: 'caisse-restaurant-{locale}', phone: false,
      eyebrow: { fr: 'Kiwi · Caisse', en: 'Kiwi · Point of sale', ar: 'Kiwi · الكاشير' },
      title: { fr: 'Une caisse qui encaisse <b>même sans Internet.</b>', en: 'A till that keeps selling <b>even offline.</b>', ar: 'كاشير يواصل البيع <b>حتى دون إنترنت.</b>' },
      foot: { fr: 'Dès 150 MAD par mois · 15 jours d’essai', en: 'From 150 MAD a month · 15-day trial', ar: 'ابتداء من 150 درهما في الشهر · تجربة 15 يوما' },
    },
  },
  {
    id: 'stock',
    plan: 'basic',
    icon: 'inventory_2',
    guides: ['stock', 'food'],
    routes: { fr: '/fr/fonctionnalites/stock-catalogue/', en: '/en/features/inventory-catalog/', ar: '/ar/features/المخزون-والكتالوج/' },
    pages: {
      fr: meta(
        'Logiciel de gestion de stock pour commerce et restaurant au Maroc · Kiwi',
        'Stock Kiwi : chaque vente sort le stock, inventaires avec écarts, mouvements tracés, alertes de seuil, catalogue par tailles et couleurs, recettes et coût matière. Dès 150 MAD par mois.',
        'Gestion de stock et catalogue pour commerce et restaurant',
        'Le stock suit les ventes, l’inventaire montre les écarts et chaque correction garde son auteur.',
        'assets/features/og-stock-catalogue-fr.png',
        'L’inventaire de la caisse boutique Kiwi : chaque modèle avec ses tailles, ses couleurs et son stock.',
      ),
      en: meta(
        'Inventory management software for shops and restaurants in Morocco · Kiwi',
        'Kiwi inventory: every sale updates stock, counts with variances, tracked movements, low-stock alerts, size and colour catalogue, recipes and food cost. From 150 MAD a month.',
        'Inventory and catalogue for shops and restaurants',
        'Stock follows every sale, counts show the variances and every correction keeps its author.',
        'assets/features/og-inventory-catalog-en.png',
        'The Kiwi boutique till inventory: each model with its sizes, colours and stock.',
      ),
      ar: meta(
        'برنامج تسيير المخزون للمتاجر والمطاعم في المغرب · Kiwi',
        'مخزون Kiwi: كل بيع يُنقص المخزون، جرد يُظهر الفوارق، حركات مسجلة، تنبيهات النفاد، كتالوج بالمقاسات والألوان، وصفات وتكلفة المواد. ابتداء من 150 درهما في الشهر.',
        'المخزون والكتالوج للمتاجر والمطاعم',
        'المخزون يتبع كل بيع، والجرد يُظهر الفوارق، وكل تصحيح يحفظ اسم صاحبه.',
        'assets/features/og-inventory-catalog-ar.png',
        'جرد كاشير البوتيك في Kiwi: كل موديل بمقاساته وألوانه ومخزونه.',
      ),
    },
    og: {
      shot: 'stock-inventaire-{locale}', phone: false,
      eyebrow: { fr: 'Kiwi · Stock et catalogue', en: 'Kiwi · Inventory', ar: 'Kiwi · المخزون' },
      title: { fr: 'Un stock qui suit <b>chaque vente.</b>', en: 'Stock that follows <b>every sale.</b>', ar: 'مخزون يتبع <b>كل عملية بيع.</b>' },
      foot: { fr: 'Inventaire, écarts, tailles et couleurs, coût matière', en: 'Counts, variances, sizes and colours, food cost', ar: 'الجرد، الفوارق، المقاسات والألوان، تكلفة المواد' },
    },
  },
  {
    id: 'orderpro',
    plan: 'pro',
    icon: 'qr_code_2',
    guides: ['menu', 'pos'],
    routes: { fr: '/fr/fonctionnalites/orderpro/', en: '/en/features/orderpro/', ar: '/ar/features/orderpro/' },
    pages: {
      fr: meta(
        'Commande par QR code à table pour restaurant au Maroc · OrderPro · Kiwi',
        'OrderPro : le client scanne le QR de sa table et commande depuis son téléphone, sans application. La commande passe par la caisse puis part en cuisine. Inclus dans Kiwi Pro.',
        'OrderPro · la commande par QR code à table',
        'Le client scanne, commande dans sa langue, et la commande passe par votre caisse avant la cuisine.',
        'assets/features/og-orderpro-fr.png',
        'OrderPro sur un téléphone : la carte de Café Atlas, le restaurant de démonstration de Kiwi.',
      ),
      en: meta(
        'QR code table ordering for restaurants in Morocco · OrderPro · Kiwi',
        'OrderPro: guests scan the QR code on their table and order from their phone, no app needed. Orders go through your till, then to the kitchen. Included in Kiwi Pro.',
        'OrderPro · QR code ordering at the table',
        'Guests scan, order in their language, and the order goes through your till before the kitchen.',
        'assets/features/og-orderpro-en.png',
        'OrderPro on a phone: the menu of Café Atlas, Kiwi’s demo restaurant.',
      ),
      ar: meta(
        'الطلب عبر رمز QR من الطاولة للمطاعم في المغرب · OrderPro · Kiwi',
        'OrderPro: يمسح الزبون رمز QR الموجود على طاولته ويطلب من هاتفه دون تطبيق. يمر الطلب عبر الكاشير ثم يذهب إلى المطبخ. مشمول في Kiwi Pro.',
        'OrderPro · الطلب عبر رمز QR من الطاولة',
        'يمسح الزبون الرمز، ويطلب بلغته، ويمر الطلب عبر الكاشير قبل المطبخ.',
        'assets/features/og-orderpro-ar.png',
        'OrderPro على الهاتف: قائمة Café Atlas، مطعم العرض التجريبي لدى Kiwi.',
      ),
    },
    og: {
      shot: 'orderpro-menu-{locale}', phone: true,
      eyebrow: { fr: 'Kiwi · OrderPro', en: 'Kiwi · OrderPro', ar: 'Kiwi · OrderPro' },
      title: { fr: 'Le client scanne. <b>La commande arrive à la caisse.</b>', en: 'Guests scan. <b>The order reaches your till.</b>', ar: 'الزبون يمسح الرمز. <b>والطلب يصل إلى الكاشير.</b>' },
      foot: { fr: 'Inclus dans Kiwi Pro · 399 MAD par mois', en: 'Included in Kiwi Pro · 399 MAD a month', ar: 'مشمول في Kiwi Pro · 399 درهما في الشهر' },
    },
  },
]);

/* Les fonctions sans page dédiée, listées sur le hub. Chacune reprend une
 * promesse de l'accueil déjà prouvée (tools/landing-claims-map.json) : le hub
 * n'en invente aucune. Une page dédiée les remplacera une à une. */
export const FEATURE_MORE = Object.freeze([
  { id: 'floor', plan: 'pro', icon: 'table_restaurant', landingClaim: 'tiers.2.features.1' },
  { id: 'waiters', plan: 'pro', icon: 'room_service', landingClaim: 'tiers.2.features.2' },
  { id: 'kitchen', plan: 'pro', icon: 'skillet', landingClaim: 'tiers.2.features.3' },
  { id: 'team', plan: 'pro', icon: 'calendar_clock', landingClaim: 'tiers.2.features.9' },
  { id: 'loyalty', plan: 'plus', icon: 'favorite', landingClaim: 'tiers.1.features.4' },
  { id: 'promotions', plan: 'plus', icon: 'sell', landingClaim: 'tiers.1.features.3' },
]);
