/* Kiwi · SANTÉ KIWI (carte commerçant) — window.KiwiMerchantHealth
 * ---------------------------------------------------------------------------
 * La tuile de l'accueil qui dit au commerçant combien de Kiwi il utilise, et
 * quoi allumer ensuite (docs/specs/kiwi-health.md). Elle prend la première
 * place de la rangée « Pour vous » : assets/oppo-cards.js lui fait la place
 * (une carte de moins) et crée le <section data-merchant-health> ; ce fichier
 * le peint, avec les pièces mêmes des cartes voisines (oppo-card, oppo-t,
 * oppo-cta), pour qu'elle en ait la taille, la peau et le rythme. Le détail
 * ligne par ligne vit dans le tiroir « Tout voir ».
 *
 * Le calcul n'est PAS ici : il vit côté serveur (functions/api/merchant-health.js, pur
 * dans functions/api/_merchant-health.js). Ne pas confondre avec
 * assets/kiwi-health.js, la fenêtre « Santé de Kiwi » de la console opérateur, pour que le tableau de bord et toute autre
 * surface disent le même chiffre. Ce fichier ne fait que le lire et le dire.
 *
 *  · Une seule lecture par chargement et par changement d'établissement. Aucun
 *    polling.
 *  · Injoignable : un vrai commerçant le lit en clair, la démo cache la carte.
 *    Jamais un chiffre inventé ni un ancien chiffre présenté comme frais.
 *  · « Non mesuré » est dit comme tel et sort du score ; ce n'est pas un zéro.
 *  · Chaque « Ouvrir » passe par la vraie navigation du tableau de bord : le
 *    lien de la barre latérale, ou le gestionnaire data-action existant.
 */
(function () {
  'use strict';

  const ROOT_SEL = '[data-merchant-health]';
  const lang = () => {
    try { return (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; }
  };
  const L = (fr, en, ar) => ({ fr, en, ar });
  const pick = (o) => (o && (o[lang()] || o.fr)) || '';
  const num = (n) => {
    try { return new Intl.NumberFormat(lang() === 'ar' ? 'ar-MA' : lang() === 'en' ? 'en-US' : 'fr-FR', { numberingSystem: 'latn' }).format(n); } catch (_) { return String(n); }
  };
  const fill = (text, c) => String(text)
    .replace(/\{n\}/g, num(Number(c.n) || 0))
    .replace(/\{of\}/g, num(Number(c.of) || 0));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const icon = (name, size) => (window.KiwiIcon && window.KiwiIcon.svg ? window.KiwiIcon.svg(name, size || 18) : '');

  const S = {
    name: L('Santé Kiwi', 'Kiwi Health', 'صحة كيوي'),
    headline: L('{used} outils sur {measured} pleinement utilisés, sur 30 jours.', '{used} of {measured} tools fully in use, over 30 days.', '{used} من أصل {measured} أدوات مستعملة بالكامل، خلال 30 يومًا.'),
    next: L('Ensuite', 'Next', 'التالي'),
    open: L('Ouvrir', 'Open', 'فتح'),
    all: L('Tout voir →', 'See all →', 'عرض الكل ←'),
    allDone: L('Tout ce que Kiwi mesure est en place.', 'Everything Kiwi measures is in place.', 'كل ما يقيسه كيوي جاهز.'),
    noScore: L('Pas encore assez de données pour un score.', 'Not enough data for a score yet.', 'لا توجد بيانات كافية بعد لحساب النتيجة.'),
    loading: L('Calcul en cours', 'Working it out', 'جارٍ الحساب'),
    down: L('Injoignable pour le moment. Vos données ne sont pas touchées.', 'Can’t be reached right now. Your data is untouched.', 'تعذّر الوصول حاليًا. بياناتكم لم تُمسّ.'),
    retry: L('Réessayer →', 'Try again →', 'إعادة المحاولة ←'),
    scoreOf: L('sur 100', 'out of 100', 'من 100'),
    drawerSub: L('Score {score} sur 100 · 30 derniers jours', 'Score {score} out of 100 · last 30 days', 'النتيجة {score} من 100 · آخر 30 يومًا'),
    optional: L('En option, si cela vous sert', 'Optional, if it helps you', 'اختياري، إن كان يفيدكم'),
    optionalNote: L('Hors score : utile à certains commerces seulement.', 'Not scored: useful to some businesses only.', 'خارج النتيجة: مفيد لبعض المحلات فقط.'),
    unmeasuredNote: L('Non mesuré : Kiwi ne voit pas cette donnée, elle sort du score.', 'Not measured: Kiwi can’t see this, so it is left out of the score.', 'غير مقيس: كيوي لا يرى هذه المعطيات، فهي خارج النتيجة.'),
    state: {
      done: L('Fait', 'Done', 'منجز'),
      partial: L('En partie', 'Partly', 'جزئيًا'),
      todo: L('À faire', 'To do', 'للإنجاز'),
      unmeasured: L('Non mesuré', 'Not measured', 'غير مقيس'),
    },
    area: {
      caisse: L('Caisse', 'Till', 'الصندوق'),
      carte: L('Carte et catalogue', 'Menu and catalogue', 'القائمة والكتالوج'),
      stock: L('Stock', 'Stock', 'المخزون'),
      equipe: L('Équipe', 'Team', 'الفريق'),
      clients: L('Clients', 'Clients', 'العملاء'),
      rapports: L('Rapports et réglages', 'Reports and settings', 'التقارير والإعدادات'),
      materiel: L('Matériel', 'Hardware', 'العتاد'),
    },
  };
  const AREA_ICON = { caisse: 'point_of_sale', carte: 'menu_book', stock: 'inventory_2', equipe: 'groups', clients: 'contacts', rapports: 'description', materiel: 'print' };
  const AREA_ORDER = ['caisse', 'carte', 'stock', 'equipe', 'clients', 'rapports', 'materiel'];

  /* Each line: its name, then what it says in each state. A state left out
   * falls back to `any`. {n} and {of} are the facts the server measured. */
  const C = {
    till: { t: L('La caisse encaisse', 'The till takes sales', 'الصندوق يسجّل المبيعات'),
      any: L('{n} jours sur {of} jours d’ouverture', '{n} of {of} open days', '{n} من أصل {of} يوم عمل') },
    close: { t: L('Clôture de la journée', 'Daily close', 'إغلاق اليوم'),
      any: L('{n} journées clôturées sur {of}', '{n} of {of} trading days closed', '{n} من أصل {of} أيام مغلقة'),
      todo: L('Aucune journée clôturée', 'No day closed yet', 'لم يُغلق أي يوم بعد') },
    codes: { t: L('Chacun son code', 'A code for each person', 'رمز لكل شخص'),
      any: L('{n} personnes avec leur propre code', '{n} people with their own code', '{n} أشخاص برموزهم الخاصة'),
      todo: L('Personne n’a encore son code', 'Nobody has their own code yet', 'لا أحد يملك رمزه بعد') },
    clock: { t: L('Pointage', 'Time clock', 'تسجيل الحضور'),
      any: L('{n} membres sur {of} ont pointé', '{n} of {of} members clocked in', '{n} من أصل {of} أعضاء سجّلوا الحضور'),
      todo: L('Personne n’a pointé en 30 jours', 'Nobody clocked in for 30 days', 'لم يسجّل أحد حضوره خلال 30 يومًا') },
    planning: { t: L('Planning', 'Schedule', 'جدول العمل'),
      done: L('Des créneaux sont posés', 'Shifts are set', 'المناوبات محددة'),
      todo: L('Aucun créneau posé', 'No shift set yet', 'لا توجد مناوبات بعد') },
    clients: { t: L('Fiches clients', 'Client records', 'سجلات العملاء'),
      any: L('{n} ventes sur {of} rattachées à un client', '{n} of {of} sales linked to a client', '{n} من أصل {of} مبيعات مرتبطة بعميل') },
    loyalty: { t: L('Fidélité', 'Loyalty', 'الولاء'),
      done: L('{n} récompenses données', '{n} rewards given', '{n} مكافآت ممنوحة'),
      partial: L('Programme réglé, aucune récompense donnée', 'Programme set, no reward given yet', 'البرنامج مضبوط، ولم تُمنح أي مكافأة بعد'),
      todo: L('Programme non réglé', 'No programme set', 'لم يُضبط البرنامج بعد') },
    identity: { t: L('Votre nom sur le ticket', 'Your name on the receipt', 'اسمكم على التذكرة'),
      any: L('{n} sur 3 : nom, logo, mentions légales', '{n} of 3: name, logo, legal details', '{n} من 3: الاسم، الشعار، البيانات القانونية') },
    hours: { t: L('Horaires d’ouverture', 'Opening hours', 'أوقات العمل'),
      done: L('Semaine réglée', 'Week set', 'الأسبوع مضبوط'),
      todo: L('Horaires non réglés', 'Not set yet', 'غير مضبوطة بعد') },
    printer: { t: L('Imprimante', 'Printer', 'الطابعة'),
      done: L('Pont d’impression actif', 'Print bridge active', 'جسر الطباعة نشط'),
      unmeasured: L('Bluetooth et USB ne laissent aucune trace côté serveur', 'Bluetooth and USB leave no trace on the server', 'البلوتوث وUSB لا يتركان أي أثر على الخادم') },
    accountant: { t: L('Le comptable reçoit le mois', 'Your accountant gets the month', 'المحاسب يتوصل بالشهر'),
      done: L('Adresse du comptable enregistrée', 'Accountant’s address saved', 'عنوان المحاسب محفوظ'),
      todo: L('Aucune adresse enregistrée', 'No address saved', 'لا يوجد عنوان محفوظ') },
    charges: { t: L('Charges fixes', 'Fixed costs', 'المصاريف الثابتة'),
      done: L('Renseignées : Marges dit le résultat net', 'Entered: Margins shows the net result', 'مُدخلة: الهوامش تعرض النتيجة الصافية'),
      todo: L('Loyer et charges pas encore renseignés', 'Rent and costs not entered yet', 'الإيجار والمصاريف لم تُدخل بعد') },
    iq: { t: L('Kiwi IQ', 'Kiwi IQ', 'Kiwi IQ'),
      done: L('Utilisé ces 30 derniers jours', 'Used in the last 30 days', 'استُعمل خلال آخر 30 يومًا'),
      todo: L('Pas utilisé ces 30 derniers jours', 'Not used in the last 30 days', 'لم يُستعمل خلال آخر 30 يومًا') },
    menu: { t: L('La carte', 'The menu', 'قائمة الطعام'),
      any: L('{n} plats sur {of} avec une photo', '{n} of {of} dishes with a photo', '{n} من أصل {of} أطباق بصورة'),
      todo: L('Aucun plat sur la carte', 'No dish on the menu yet', 'لا يوجد أي طبق بعد') },
    floor: { t: L('Plan de salle', 'Floor plan', 'مخطط القاعة'),
      done: L('{n} tables, ouvertes ce mois-ci', '{n} tables, opened this month', '{n} طاولات، فُتحت هذا الشهر'),
      partial: L('{n} tables, aucune ouverte en 30 jours', '{n} tables, none opened in 30 days', '{n} طاولات، لم تُفتح أي منها خلال 30 يومًا'),
      todo: L('Aucune table dessinée', 'No table drawn yet', 'لا توجد طاولات مرسومة') },
    kitchen: { t: L('Envoi en cuisine', 'Orders to the kitchen', 'إرسال الطلبات إلى المطبخ'),
      done: L('{n} commandes envoyées par Kiwi', '{n} orders sent through Kiwi', '{n} طلبات أُرسلت عبر كيوي'),
      unmeasured: L('Une imprimante cuisine seule ne laisse aucune trace', 'A kitchen printer alone leaves no trace', 'طابعة المطبخ وحدها لا تترك أي أثر') },
    recipes: { t: L('Fiches recettes', 'Recipe sheets', 'بطاقات الوصفات'),
      any: L('{n} plats sur {of} ont une recette', '{n} of {of} dishes have a recipe', '{n} من أصل {of} أطباق لها وصفة') },
    stock: { t: L('Stock suivi', 'Stock tracking', 'تتبّع المخزون'),
      todo: L('Rien n’est suivi en stock', 'Nothing tracked in stock yet', 'لا شيء متتبَّع في المخزون بعد'),
      done: L('Mouvements suivis et inventaire compté', 'Movements tracked and stock counted', 'الحركات متتبَّعة والجرد منجز') },
    waiter: { t: L('App serveur', 'Waiter app', 'تطبيق النادل'),
      done: L('{n} commandes prises en salle', '{n} orders taken at the table', '{n} طلبات أُخذت في القاعة'),
      todo: L('Aucune commande prise par un serveur', 'No order taken by a waiter yet', 'لم يأخذ أي نادل طلبًا بعد') },
    catalog: { t: L('Catalogue', 'Catalogue', 'الكتالوج'),
      any: L('{n} produits sur {of} avec un code-barres', '{n} of {of} products with a barcode', '{n} من أصل {of} منتجات بباركود'),
      todo: L('Aucun produit au catalogue', 'No product yet', 'لا يوجد أي منتج بعد') },
    costs: { t: L('Prix d’achat', 'Purchase costs', 'أثمنة الشراء'),
      any: L('{n} produits sur {of} avec leur coût', '{n} of {of} products with their cost', '{n} من أصل {of} منتجات بثمن شرائها') },
    'pressing-prices': { t: L('Tarifs pressing', 'Pressing price list', 'تعريفة التنظيف'),
      done: L('{n} prestations', '{n} services', '{n} خدمات'),
      todo: L('Aucune prestation', 'No service yet', 'لا توجد خدمات بعد') },
    'pressing-orders': { t: L('Dépôts suivis', 'Tracked drop-offs', 'الإيداعات المتتبَّعة'),
      any: L('{n} dépôts sur {of} avec téléphone et date de retrait', '{n} of {of} drop-offs with a phone and pickup date', '{n} من أصل {of} إيداعات برقم هاتف وتاريخ استلام'),
      todo: L('Aucun dépôt en 30 jours', 'No drop-off in 30 days', 'لا يوجد أي إيداع خلال 30 يومًا') },
    services: { t: L('Services et tarifs', 'Services and prices', 'الخدمات والأثمنة'),
      done: L('{n} services', '{n} services', '{n} خدمات'), todo: L('Aucun service', 'No service yet', 'لا توجد خدمات بعد') },
    practitioners: { t: L('Praticiens', 'Practitioners', 'الممارسون'),
      done: L('{n} praticiens', '{n} practitioners', '{n} ممارسين'), todo: L('Aucun praticien', 'No practitioner yet', 'لا يوجد ممارسون بعد') },
    appointments: { t: L('Rendez-vous', 'Appointments', 'المواعيد'),
      done: L('{n} rendez-vous en 30 jours', '{n} appointments in 30 days', '{n} مواعيد خلال 30 يومًا'),
      todo: L('Aucun rendez-vous en 30 jours', 'No appointment in 30 days', 'لا توجد مواعيد خلال 30 يومًا') },
    rooms: { t: L('Chambres', 'Rooms', 'الغرف'),
      done: L('{n} chambres', '{n} rooms', '{n} غرف'), todo: L('Aucune chambre', 'No room yet', 'لا توجد غرف بعد') },
    stays: { t: L('Séjours suivis', 'Tracked stays', 'الإقامات المتتبَّعة'),
      any: L('{n} séjours sur {of} avec l’arrivée enregistrée', '{n} of {of} stays with the arrival recorded', '{n} من أصل {of} إقامات بوصول مسجَّل'),
      todo: L('Aucun séjour en 30 jours', 'No stay in 30 days', 'لا توجد إقامات خلال 30 يومًا') },
    folios: { t: L('Notes de chambre', 'Room bills', 'فواتير الغرف'),
      done: L('{n} charges posées sur une chambre', '{n} charges put on a room', '{n} مصاريف على الغرف'),
      todo: L('Aucune charge posée sur une chambre', 'No charge put on a room', 'لا توجد مصاريف على الغرف') },
    economat: { t: L('Économat', 'Storeroom', 'المخزن الداخلي'),
      done: L('{n} demandes internes', '{n} internal requests', '{n} طلبات داخلية'),
      todo: L('Aucune demande interne', 'No internal request', 'لا توجد طلبات داخلية') },
    /* optional */
    invoices: { t: L('Factures', 'Invoices', 'الفواتير') },
    promotions: { t: L('Promotions', 'Promotions', 'العروض') },
    'employee-app': { t: L('App employé', 'Employee app', 'تطبيق الموظف') },
    reservations: { t: L('Réservations', 'Reservations', 'الحجوزات') },
    kds: { t: L('Écran cuisine', 'Kitchen screen', 'شاشة المطبخ') },
    purchasing: { t: L('Achats fournisseurs', 'Supplier orders', 'طلبات الموردين') },
    orderpro: { t: L('Commande à distance', 'Remote ordering', 'الطلب عن بعد') },
    returns: { t: L('Retours et échanges', 'Returns and exchanges', 'الإرجاع والاستبدال') },
    shopify: { t: L('Shopify', 'Shopify', 'Shopify') },
    channels: { t: L('Canaux et OTA', 'Channels and OTAs', 'القنوات ووكالات الحجز') },
  };
  const OPT_STATE = { done: L('En place', 'In place', 'مفعّل'), todo: L('Pas utilisé', 'Not used', 'غير مستعمل') };

  function title(c) { return pick((C[c.id] || {}).t) || c.id; }
  function evidence(c) {
    const d = C[c.id] || {};
    if (c.optional) return pick(OPT_STATE[c.state] || OPT_STATE.todo);
    if (c.id === 'stock' && c.state === 'partial') {
      if (c.moves && !c.counted) return pick(L('Mouvements suivis, pas d’inventaire compté en 90 jours', 'Movements tracked, no stock count in 90 days', 'الحركات متتبَّعة، ولا جرد خلال 90 يومًا'));
      if (c.counted && !c.moves) return pick(L('Inventaire compté, aucun mouvement en 30 jours', 'Stock counted, no movement in 30 days', 'تم الجرد، ولا حركة خلال 30 يومًا'));
      return pick(L('Articles saisis, ni mouvement ni inventaire récent', 'Items entered, no recent movement or count', 'المواد مسجّلة، دون حركة أو جرد حديث'));
    }
    const text = d[c.state] || d.any || S.state[c.state];
    return fill(pick(text), c);
  }

  /* ── where « Ouvrir » goes: the real sidebar link, or the existing handler ── */
  function target(c) {
    const nav = c && c.nav;
    if (!nav) return null;
    if (nav.feature) {
      const link = document.querySelector(`.sidebar a[data-feature="${nav.feature}"]:not([hidden])`);
      return link && link.offsetParent !== null ? { link } : null;
    }
    if (nav.action) {
      const h = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers[nav.action];
      return typeof h === 'function' ? { handler: h, name: nav.action } : null;
    }
    return null;
  }
  function go(c, from) {
    const t = target(c);
    if (!t) return false;
    document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => (b.__kiwiClose ? b.__kiwiClose() : b.remove()));
    if (t.link) t.link.click();
    else t.handler(from || document.body, new Event('click'));
    return true;
  }

  /* ── state ── */
  let data = null;       // last answer for `slugNow`
  let slugNow = '';
  let status = 'idle';   // idle | loading | ready | down
  let seq = 0;

  /* A real store reads its own slug. The demo reads the shared demo tenant its
   * sales feed already uses (live-link.js › merchant()), and only one of the
   * three the server serves without an account: its score is computed from
   * that tenant's own data, never made up here. */
  const DEMO_TENANTS = { 'cafe-atlas': 1, 'maison-mansour': 1, 'spa-bahia': 1 };
  function slug() {
    try {
      const s = (window.KiwiCloudDoc && window.KiwiCloudDoc.currentSlug && window.KiwiCloudDoc.currentSlug()) || '';
      if (s || isReal()) return s;
      const demo = localStorage.getItem('kiwiLiveMerchant') || 'cafe-atlas';
      return DEMO_TENANTS[demo] ? demo : '';
    } catch (_) { return ''; }
  }
  function isReal() {
    try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()); } catch (_) { return false; }
  }

  async function load(retry) {
    const s = slug();
    const mine = ++seq;
    /* Another store's answer is never shown under this one's name. */
    if (s !== slugNow) data = null;
    slugNow = s;
    /* No store known YET is not « unreachable »: a real session learns its
     * slug after this script runs (on 2026-10-12, amira-cafe at 877 ms had no
     * slug, said « Injoignable », and never asked). The tile waits, hidden,
     * and recheck() loads it the moment the store is known. */
    if (!s) { status = 'idle'; data = null; update(); return; }
    status = 'loading'; update();
    try {
      const res = await fetch('/api/merchant-health?merchant=' + encodeURIComponent(s), { credentials: 'same-origin', cache: 'no-store' });
      if (mine !== seq) return;
      if (!res.ok) throw new Error('http ' + res.status);
      const body = await res.json();
      if (mine !== seq) return;
      /* an answer for another store is never shown under this one's name: it
       * counts as no answer at all, not as an endless « loading » */
      if (!body || body.merchant !== s) throw new Error('other merchant');
      data = body; status = 'ready';
    } catch (_) {
      if (mine !== seq) return;
      /* one quiet second try before saying anything: a request sent while the
       * session cookie is still settling fails once and then answers */
      if (!retry) { setTimeout(() => { if (mine === seq) load(true); }, 2500); return; }
      data = null; status = 'down';
    }
    update();
  }
  /* The store became known, or changed: (re)load. Cheap when nothing moved. */
  function recheck() {
    const s = slug();
    if (s !== slugNow || (s && status === 'idle')) load();
  }

  /* The illustration, in the neighbours' own vocabulary (oppo-cards.js ›
   * ART): a rounded --atlas panel, a --mint badge, --paper marks, rects and
   * circles only. The panel carries the real score as a ring and its number;
   * before there is one, the ring is empty and says nothing. */
  function art(score) {
    const r = 19, len = 2 * Math.PI * r;
    const v = score == null ? 0 : Math.max(0, Math.min(100, score));
    return `<svg viewBox="0 0 120 96" fill="none" aria-hidden="true" focusable="false">
        <rect x="14" y="20" width="78" height="62" rx="12" fill="var(--atlas)"/>
        <circle cx="53" cy="51" r="${r}" stroke="var(--paper)" stroke-opacity="0.24" stroke-width="6"/>
        ${v > 0 ? `<circle cx="53" cy="51" r="${r}" stroke="var(--mint)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(len * v / 100).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 53 51)"/>` : ''}
        ${score == null ? '' : `<text x="53" y="51" text-anchor="middle" dominant-baseline="central" fill="var(--paper)" font-size="15" font-weight="600" style="font-variant-numeric:tabular-nums">${esc(num(score))}</text>`}
        <rect x="84" y="10" width="24" height="24" rx="8" fill="var(--mint)"/>
        <rect x="93.5" y="15" width="5" height="14" rx="1.5" fill="var(--riad)"/>
        <rect x="89" y="19.5" width="14" height="5" rx="1.5" fill="var(--riad)"/>
      </svg>`;
  }


  /* Does the tile take a slot in the row? Loading and ready, yes; down, only
   * for a real store (it is told plainly). The demo, down, gives the slot
   * back to an offer. */
  function shows() {
    return status === 'loading' || status === 'ready' || (status === 'down' && isReal());
  }
  /* The row is oppo-cards.js's: when the tile appears or goes, it re-deals
   * (and calls paint); otherwise the tile repaints in place. */
  function update() {
    const has = !!document.querySelector(ROOT_SEL);
    if (has !== shows() && window.KiwiOppo && typeof window.KiwiOppo.render === 'function') window.KiwiOppo.render();
    else paint();
  }

  function paint() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    const ar = lang() === 'ar';
    root.setAttribute('dir', ar ? 'rtl' : 'ltr');
    root.lang = lang();
    root.setAttribute('aria-label', pick(S.name));
    const head = `<div class="oppo-t">${esc(pick(S.name))}</div>`;
    if (status === 'loading' || status === 'idle') {
      root.setAttribute('aria-busy', 'true');
      root.innerHTML = head + `<div class="mhc-skel-lines"><span class="mhc-skel"></span><span class="mhc-skel"></span><span class="mhc-skel"></span></div><div class="oppo-art mhc-score" aria-hidden="true">${art(null)}</div><span class="mhc-sr">${esc(pick(S.loading))}</span>`;
      return;
    }
    root.removeAttribute('aria-busy');
    if (status === 'down') {
      root.innerHTML = head + `<p class="mhc-tile-d">${esc(pick(S.down))}</p><button type="button" class="oppo-cta" data-action="merchant-health-retry">${esc(pick(S.retry))}</button><div class="oppo-art mhc-score" aria-hidden="true">${art(null)}</div>`;
      return;
    }
    const d = data;
    const byId = Object.fromEntries((d.checks || []).map((c) => [c.id, c]));
    const first = (d.next || []).map((id) => byId[id]).filter(Boolean)[0];
    const scoreText = d.score == null ? '·' : num(d.score);
    const line = d.score == null ? pick(S.noScore)
      : pick(S.headline).replace('{used}', num(d.used || 0)).replace('{measured}', num(d.measured || 0));
    let next = '';
    if (first) {
      const can = !!target(first);
      const inner = `<span class="mhc-tile-next-k">${esc(pick(S.next))}</span><span class="mhc-tile-next-t"><strong>${esc(title(first))}</strong>${can ? icon('chevron_right', 16) : ''}</span><span class="mhc-tile-next-e">${esc(evidence(first))}</span>`;
      next = can
        ? `<button type="button" class="mhc-tile-next" data-action="merchant-health-go" data-mhc-go="${esc(first.id)}" aria-label="${esc(pick(S.open) + ' · ' + title(first) + ' · ' + evidence(first))}">${inner}</button>`
        : `<div class="mhc-tile-next">${inner}</div>`;
    } else if (d.score != null) {
      next = `<p class="mhc-tile-done">${icon('task_alt', 16)}${esc(pick(S.allDone))}</p>`;
    }
    root.innerHTML = head + `<p class="mhc-tile-d">${esc(line)}</p>${next}
      ${(d.checks || []).length ? `<button type="button" class="oppo-cta" data-action="merchant-health-open">${esc(pick(S.all))}</button>` : ''}
      <div class="oppo-art mhc-score" data-ready role="img" aria-label="${esc(pick(S.name) + ' · ' + scoreText + ' ' + pick(S.scoreOf))}">${art(d.score)}</div>`;
  }

  function drawerBody(d) {
    const groups = AREA_ORDER.map((area) => {
      const rows = (d.checks || []).filter((c) => c.area === area);
      if (!rows.length) return '';
      return `<section class="mhc-group"><h4>${icon(AREA_ICON[area], 18)}${esc(pick(S.area[area]))}</h4><ul>${rows.map((c) => row(c)).join('')}</ul></section>`;
    }).join('');
    const opt = (d.optional || []).length
      ? `<section class="mhc-group mhc-optional"><h4>${icon('task_alt', 18)}${esc(pick(S.optional))}</h4><p class="mhc-note">${esc(pick(S.optionalNote))}</p><ul>${d.optional.map((c) => row(c)).join('')}</ul></section>`
      : '';
    const unmeasured = (d.checks || []).some((c) => c.state === 'unmeasured') ? `<p class="mhc-note">${esc(pick(S.unmeasuredNote))}</p>` : '';
    return `<div class="mhc-drawer" dir="${lang() === 'ar' ? 'rtl' : 'ltr'}">${groups}${opt}${unmeasured}</div>`;
  }
  function row(c) {
    const can = c.state !== 'done' && !!target(c);
    const st = c.optional ? (c.state === 'done' ? 'done' : 'optional') : c.state;
    const badge = c.optional ? pick(OPT_STATE[c.state] || OPT_STATE.todo) : pick(S.state[c.state]);
    return `<li class="mhc-row" data-mhc-state="${esc(st)}" data-mhc-id="${esc(c.id)}">
      <span class="mhc-dot" aria-hidden="true"></span>
      <span class="mhc-row-text"><strong>${esc(title(c))}</strong><span>${esc(evidence(c))}</span></span>
      <span class="mhc-badge">${esc(badge)}</span>
      ${can ? `<button type="button" class="mhc-go" data-action="merchant-health-go" data-mhc-go="${esc(c.id)}" aria-label="${esc(pick(S.open) + ' · ' + title(c))}">${icon('chevron_right', 16)}</button>` : '<span class="mhc-go-gap" aria-hidden="true"></span>'}
    </li>`;
  }

  function openDrawer() {
    if (!data || !window.Kiwi || !window.Kiwi.drawer) return;
    window.Kiwi.drawer({
      title: pick(S.name),
      subtitle: data.score == null ? pick(S.noScore) : pick(S.drawerSub).replace('{score}', num(data.score)),
      body: drawerBody(data),
      width: 480,
    });
  }

  function find(id) {
    if (!data) return null;
    return (data.checks || []).concat(data.optional || []).find((c) => c.id === id) || null;
  }

  function wire() {
    window.Kiwi = window.Kiwi || {};
    window.Kiwi.handlers = window.Kiwi.handlers || {};
    window.Kiwi.handlers['merchant-health-open'] = () => openDrawer();
    window.Kiwi.handlers['merchant-health-retry'] = () => load(true);
    window.Kiwi.handlers['merchant-health-go'] = (el) => {
      const id = el && el.getAttribute && el.getAttribute('data-mhc-go');
      const c = find(id);
      if (c) go(c, el);
    };
  }

  function boot() {
    wire();
    /* only where the « Pour vous » row exists (the dashboard home) */
    if (!document.querySelector('[data-oppo-band]')) return;
    load();
    /* a language change re-deals the row (oppo-cards.js), which repaints this */
    window.addEventListener('kiwi:langchange', () => paint());
    try {
      if (window.KiwiVenue && typeof window.KiwiVenue.subscribe === 'function') window.KiwiVenue.subscribe(recheck);
    } catch (_) {}
    /* the account's config lands once the store is known (oppo-cards.js
     * re-deals on the same event), and the page's own load comes after the
     * session; a few spaced looks cover a slug that arrives by neither. Not a
     * poller: it stops after half a minute. */
    document.addEventListener('kiwi-config', recheck);
    window.addEventListener('load', recheck);
    [600, 1500, 3000, 6000, 12000, 25000].forEach((ms) => setTimeout(recheck, ms));
  }

  window.KiwiMerchantHealth = { reload: () => load(), open: openDrawer, shows, paint, get state() { return { status, data }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
