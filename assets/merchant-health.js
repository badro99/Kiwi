/* Kiwi · SANTÉ KIWI (carte commerçant) — window.KiwiMerchantHealth
 * ---------------------------------------------------------------------------
 * La carte de l'accueil qui dit au commerçant combien de Kiwi il utilise, et
 * quoi allumer ensuite (docs/specs/kiwi-health.md).
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
    headline: L('{used} outils sur {measured} pleinement utilisés', '{used} of {measured} tools fully in use', '{used} من أصل {measured} أدوات مستعملة بالكامل'),
    sub: L('Sur les 30 derniers jours, d’après ce que Kiwi voit.', 'Over the last 30 days, from what Kiwi can see.', 'خلال آخر 30 يومًا، حسب ما يراه كيوي.'),
    next: L('À faire ensuite', 'Next up', 'الخطوات التالية'),
    open: L('Ouvrir', 'Open', 'فتح'),
    all: L('Tout voir', 'See all', 'عرض الكل'),
    allDone: L('Rien à faire ensuite : tout ce que Kiwi mesure est en place.', 'Nothing left to do: everything Kiwi measures is in place.', 'لا شيء متبقٍّ: كل ما يقيسه كيوي جاهز.'),
    noScore: L('Pas encore assez de données pour un score.', 'Not enough data for a score yet.', 'لا توجد بيانات كافية بعد لحساب النتيجة.'),
    loading: L('Calcul en cours', 'Working it out', 'جارٍ الحساب'),
    down: L('Santé Kiwi est injoignable pour le moment. Vos données ne sont pas touchées.', 'Kiwi Health can’t be reached right now. Your data is untouched.', 'تعذّر الوصول إلى صحة كيوي حاليًا. بياناتكم لم تُمسّ.'),
    retry: L('Réessayer', 'Try again', 'إعادة المحاولة'),
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

  async function load() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    const s = slug();
    const mine = ++seq;
    /* Another store's answer is never shown under this one's name. */
    if (s !== slugNow) data = null;
    slugNow = s;
    if (!s) { status = 'down'; render(); return; }
    status = 'loading'; render();
    try {
      const res = await fetch('/api/merchant-health?merchant=' + encodeURIComponent(s), { credentials: 'same-origin', cache: 'no-store' });
      if (mine !== seq) return;
      if (!res.ok) throw new Error('http ' + res.status);
      const body = await res.json();
      if (mine !== seq || !body || body.merchant !== s) return;
      data = body; status = 'ready';
    } catch (_) {
      if (mine !== seq) return;
      data = null; status = 'down';
    }
    render();
  }

  function ring(score) {
    const r = 34, len = 2 * Math.PI * r;
    const v = score == null ? 0 : Math.max(0, Math.min(100, score));
    return `<svg class="mhc-ring" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <circle class="mhc-ring-track" cx="40" cy="40" r="${r}"/>
      <circle class="mhc-ring-fill" cx="40" cy="40" r="${r}" stroke-dasharray="${(len * v / 100).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 40 40)"/>
    </svg>`;
  }

  function nextRow(c) {
    const can = !!target(c);
    return `<li class="mhc-next-row" data-mhc-id="${esc(c.id)}">
      <span class="mhc-next-ico">${icon(AREA_ICON[c.area] || 'task_alt', 18)}</span>
      <span class="mhc-next-text"><strong>${esc(title(c))}</strong><span>${esc(evidence(c))}</span></span>
      ${can ? `<button type="button" class="mhc-go" data-action="merchant-health-go" data-mhc-go="${esc(c.id)}">${esc(pick(S.open))}${icon('chevron_right', 16)}</button>` : ''}
    </li>`;
  }

  function render() {
    const root = document.querySelector(ROOT_SEL);
    if (!root) return;
    root.setAttribute('dir', lang() === 'ar' ? 'rtl' : 'ltr');
    root.lang = lang();
    if (status === 'down' && !isReal()) { root.hidden = true; return; }
    root.hidden = false;
    const head = `<div class="mhc-head"><span class="mhc-eyebrow">${icon('monitoring', 16)}${esc(pick(S.name))}</span>
      ${status === 'ready' && data && data.checks && data.checks.length ? `<button type="button" class="mhc-all" data-action="merchant-health-open">${esc(pick(S.all))}</button>` : ''}</div>`;
    if (status === 'loading' || status === 'idle') {
      root.setAttribute('aria-busy', 'true');
      root.innerHTML = head + `<div class="mhc-body mhc-loading"><div class="mhc-skel mhc-skel-ring"></div><div class="mhc-skel-lines"><span class="mhc-skel"></span><span class="mhc-skel"></span><span class="mhc-skel"></span></div><span class="mhc-sr">${esc(pick(S.loading))}</span></div>`;
      return;
    }
    root.removeAttribute('aria-busy');
    if (status === 'down') {
      root.innerHTML = head + `<div class="mhc-body mhc-down"><p>${esc(pick(S.down))}</p><button type="button" class="mhc-go" data-action="merchant-health-retry">${icon('refresh', 16)}${esc(pick(S.retry))}</button></div>`;
      return;
    }
    const d = data;
    const byId = Object.fromEntries((d.checks || []).map((c) => [c.id, c]));
    const next = (d.next || []).map((id) => byId[id]).filter(Boolean);
    const scoreText = d.score == null ? '·' : num(d.score);
    const headline = d.score == null ? pick(S.noScore)
      : pick(S.headline).replace('{used}', num(d.used || 0)).replace('{measured}', num(d.measured || 0));
    root.innerHTML = head + `<div class="mhc-body">
      <div class="mhc-score" role="img" aria-label="${esc(pick(S.name) + ' · ' + scoreText + ' ' + pick(S.scoreOf))}">
        ${ring(d.score)}
        <span class="mhc-score-num"><b>${esc(scoreText)}</b><small>${esc(pick(S.scoreOf))}</small></span>
      </div>
      <div class="mhc-main">
        <h3 class="mhc-title">${esc(headline)}</h3>
        <p class="mhc-sub">${esc(pick(S.sub))}</p>
        ${next.length ? `<p class="mhc-next-label">${esc(pick(S.next))}</p><ul class="mhc-next">${next.map(nextRow).join('')}</ul>`
          : d.score != null ? `<p class="mhc-alldone">${icon('task_alt', 18)}${esc(pick(S.allDone))}</p>` : ''}
      </div>
    </div>`;
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
    window.Kiwi.handlers['merchant-health-retry'] = () => load();
    window.Kiwi.handlers['merchant-health-go'] = (el) => {
      const id = el && el.getAttribute && el.getAttribute('data-mhc-go');
      const c = find(id);
      if (c) go(c, el);
    };
  }

  function boot() {
    wire();
    if (!document.querySelector(ROOT_SEL)) return;
    load();
    window.addEventListener('kiwi:langchange', () => render());
    try {
      if (window.KiwiVenue && typeof window.KiwiVenue.subscribe === 'function') {
        window.KiwiVenue.subscribe(() => { if (slug() !== slugNow) load(); });
      }
    } catch (_) {}
  }

  window.KiwiMerchantHealth = { reload: load, open: openDrawer, get state() { return { status, data }; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
