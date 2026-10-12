/* Kiwi · CHARGES · window.KiwiCharges
 * ---------------------------------------------------------------------------
 * Le loyer, l'électricité, l'assurance, les abonnements : ce que le commerce
 * paie qu'il vende ou non. Plus le taux des charges sociales patronales et ce
 * que la carte ou Glovo prélèvent sur chaque vente. Avec ça, la page Marges
 * passe de « ce que chaque plat rapporte » à « ce que le commerce gagne ».
 *
 * Le calcul vit dans assets/charges-engine.js (pur, testé par
 * tools/charges-test.js). Ce fichier en est la surface :
 *   · le document `charges`, par établissement, synchronisé entre appareils
 *     (/api/store le réserve au propriétaire : une caisse appairée n'en lit
 *     qu'une copie vide et ne peut pas l'écrire) ;
 *   · l'éditeur (un tiroir) : les lignes, leur date d'effet, le taux social,
 *     les commissions des moyens de paiement et des canaux réellement vus ;
 *   · le résultat d'une période et le seuil de rentabilité du mois, pour
 *     finance.js, l'assistant et la Santé Kiwi.
 *
 * Les salaires ne se saisissent PAS ici : ils viennent d'Équipe
 * (KiwiTeam.labour, le calcul même de Paie & planning). Une seule saisie.
 *
 * Charge-moi APRÈS venue-store.js, cost.js et charges-engine.js. */
(function () {
  'use strict';
  const E = window.KiwiChargesEngine;
  if (!E || !window.KiwiStore || !window.KiwiStore.define) {
    console.warn('charges.js loaded before venue-store.js or charges-engine.js');
    return;
  }

  const isEmptyDoc = (d) => {
    const n = E.normalize(d);
    return !n.lines.length && n.social.rate == null
      && !Object.keys(n.commissions.methods).length && !Object.keys(n.commissions.channels).length;
  };
  const store = window.KiwiStore.define('charges', {
    cloud: 'charges',
    blank: E.blank,
    isEmpty: isEmptyDoc,
    merge: (mine, theirs) => E.merge(mine, theirs),
  });
  const subs = new Set();
  const notify = () => subs.forEach((fn) => { try { fn(); } catch (_) {} });
  store.subscribe(() => notify());
  const doc = () => E.normalize(store.get());

  /* ─────────────────────────── vocabulaire ─────────────────────────── */
  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CATS = ['rent', 'utilities', 'telecom', 'insurance', 'accounting', 'financing', 'software', 'maintenance', 'marketing', 'taxes', 'other'];
  const STR = {
    fr: {
      cat: { rent: 'Loyer', utilities: 'Électricité et eau', telecom: 'Internet et téléphone', insurance: 'Assurance', accounting: 'Comptable', financing: 'Crédit ou leasing', software: 'Logiciels et abonnements', maintenance: 'Entretien', marketing: 'Publicité', taxes: 'Taxes locales', other: 'Autre charge' },
      freq: { month: 'par mois', quarter: 'par trimestre', year: 'par an' },
      method: { card: 'Carte bancaire', tap: 'Sans contact', qr: 'Paiement QR', wallet: 'Portefeuille mobile', delivery: 'Paiement à la livraison', link: 'Lien de paiement' },
      drawerT: 'Charges et commissions',
      drawerS: 'Ce que vous payez, que vous vendiez ou non',
      fixedT: 'Charges fixes',
      fixedHelp: 'Le montant tel qu’il est facturé. Une charge annuelle est répartie sur ses douze mois.',
      add: 'Ajouter',
      label: 'Libellé',
      amount: 'Montant (MAD)',
      every: 'Fréquence',
      from: 'À partir de',
      remove: 'Retirer',
      removeAria: (l) => `Retirer ${l}`,
      undo: 'Annuler le retrait',
      removedFrom: 'Retirée à partir de',
      removedKeep: 'Les mois d’avant la gardent.',
      stoppedN: (n) => `${n} charge${n > 1 ? 's' : ''} arrêtée${n > 1 ? 's' : ''}, gardée${n > 1 ? 's' : ''} dans les mois où elle${n > 1 ? 's' : ''} pesai${n > 1 ? 'en' : ''}t.`,
      noLines: 'Aucune charge pour l’instant. Commencez par le loyer.',
      staffT: 'Personnel',
      staffFrom: (a, s, r) => `${a} par mois de salaires de base, lus dans Équipe${s ? ` (${s} salarié${s > 1 ? 's' : ''}` : ''}${r ? `${s ? ', ' : ' ('}${r} payé${r > 1 ? 's' : ''} à l’heure` : ''}${s || r ? ')' : ''}.`,
      staffNone: 'Aucun salaire ni taux horaire dans Équipe : le personnel n’est pas compté.',
      staffOpen: 'Ouvrir Équipe',
      social: 'Charges sociales patronales (%)',
      socialHelp: 'Ajoutées aux salaires d’Équipe. Au Maroc, CNSS, AMO et taxe de formation font souvent un peu plus de 21 %. Vérifiez avec votre comptable.',
      commT: 'Commissions',
      commHelp: 'Le pourcentage que la banque ou la plateforme garde sur chaque vente. Seuls les moyens et canaux vus dans vos ventes sont proposés.',
      commMethods: 'Moyens de paiement',
      /* Décision Bank Al-Maghrib n° 265/W/2026 du 6 juillet 2026 (communiqué
       * conjoint BAM et Conseil de la concurrence). Un repère, jamais un
       * chiffre pré-rempli : le taux du commerçant est celui de son relevé. */
      commCap: "Repère : depuis le 1er octobre 2026, Bank Al-Maghrib plafonne l'interchange des cartes marocaines à 0,50 % HT, et à 0,15 % pour le commerce de proximité. Votre taux total l'inclut, plus la marge de votre banque : reprenez celui de votre relevé.",
      commChannels: 'Plateformes de vente',
      save: 'Enregistrer',
      cancel: 'Annuler',
      saved: 'Charges enregistrées',
      savedDesc: 'Le résultat net de Marges en tient compte.',
      errAmount: 'Un montant positif, en MAD.',
      errRate: 'Entre 0 et 60 %.',
      errLabel: 'Donnez-lui un nom.',
      /* la carte de Marges */
      cardT: 'Charges fixes',
      cardMonth: 'Par mois',
      cardStaff: 'Personnel, charges comprises',
      cardStaffNoSocial: 'Personnel (charges sociales non réglées)',
      cardFixed: 'Charges fixes',
      cardTotal: 'À couvrir chaque mois',
      cardEdit: 'Modifier',
      cardEmptyH: 'Votre vrai résultat commence ici',
      cardEmptyP: 'Loyer, électricité, abonnements, commissions de la carte : renseignez-les une fois et Marges affiche ce que le commerce gagne vraiment, après tout.',
      cardEmptyCta: 'Renseigner mes charges',
      cardComm: (n) => `${n} taux de commission réglé${n > 1 ? 's' : ''}`,
      beT: 'Seuil de rentabilité',
      beSub: (m) => `Mois de ${m}`,
      beNeed: 'Ventes à faire ce mois',
      bePerDay: (n, open) => `soit ${n} par jour ${open ? 'd’ouverture' : 'calendaire'}`,
      beSold: 'Vendu ce mois à ce jour',
      bePace: 'Au rythme des jours écoulés',
      beTrack: (n, p) => `Sur vos ${n} derniers mois, ce rythme s’est trompé de ${p} en moyenne à ce stade du mois.`,
      beAhead: (a) => `À ce rythme, ${a} au-dessus du seuil`,
      beBehind: (a) => `À ce rythme, il manquera ${a} pour l’atteindre`,
      beBasis: (p) => `Calculé avec la marge et les commissions des 30 derniers jours (${p} de ce qui reste après coût matière et commissions).`,
      beCivil: 'Horaires d’ouverture non renseignés : les jours calendaires servent de base.',
      beNoPace: 'Le rythme du mois se lira dès la fin de la première journée.',
      beNoCosts: 'Renseignez vos charges pour connaître le chiffre à atteindre.',
      beTooFew: 'Il faut connaître le coût d’au moins la moitié de vos ventes pour calculer un seuil juste.',
      beNoSales: 'Pas assez de ventes sur 30 jours pour mesurer votre marge.',
      beNegative: 'Sur 30 jours, coût matière et commissions dépassent vos ventes : aucun volume ne couvre les charges à ces prix.',
    },
    en: {
      cat: { rent: 'Rent', utilities: 'Electricity and water', telecom: 'Internet and phone', insurance: 'Insurance', accounting: 'Accountant', financing: 'Loan or lease', software: 'Software and subscriptions', maintenance: 'Maintenance', marketing: 'Advertising', taxes: 'Local taxes', other: 'Other cost' },
      freq: { month: 'per month', quarter: 'per quarter', year: 'per year' },
      method: { card: 'Bank card', tap: 'Contactless', qr: 'QR payment', wallet: 'Mobile wallet', delivery: 'Cash on delivery', link: 'Payment link' },
      drawerT: 'Costs and fees',
      drawerS: 'What you pay whether you sell or not',
      fixedT: 'Fixed costs',
      fixedHelp: 'The amount as invoiced. A yearly cost is spread over its twelve months.',
      add: 'Add',
      label: 'Label',
      amount: 'Amount (MAD)',
      every: 'Frequency',
      from: 'Starting',
      remove: 'Remove',
      removeAria: (l) => `Remove ${l}`,
      undo: 'Undo',
      removedFrom: 'Removed from',
      removedKeep: 'Earlier months keep it.',
      stoppedN: (n) => `${n} stopped cost${n > 1 ? 's' : ''}, kept in the months ${n > 1 ? 'they' : 'it'} applied to.`,
      noLines: 'No costs yet. Start with the rent.',
      staffT: 'Staff',
      staffFrom: (a, s, r) => `${a} a month in base salaries, read from Team${s ? ` (${s} salaried` : ''}${r ? `${s ? ', ' : ' ('}${r} paid hourly` : ''}${s || r ? ')' : ''}.`,
      staffNone: 'No salary or hourly rate in Team: staff is not counted.',
      staffOpen: 'Open Team',
      social: 'Employer social charges (%)',
      socialHelp: 'Added to the salaries from Team. In Morocco, CNSS, AMO and the training levy often come to a little over 21 %. Check with your accountant.',
      commT: 'Fees',
      commHelp: 'The percentage the bank or the platform keeps on each sale. Only the methods and channels seen in your sales are listed.',
      commMethods: 'Payment methods',
      commCap: "For reference: since 1 October 2026, Bank Al-Maghrib caps interchange on Moroccan cards at 0.50 % excl. tax, and 0.15 % for local shops. Your total rate includes it plus your bank's margin: use the one on your statement.",
      commChannels: 'Sales platforms',
      save: 'Save',
      cancel: 'Cancel',
      saved: 'Costs saved',
      savedDesc: 'The net result in Margins now includes them.',
      errAmount: 'A positive amount, in MAD.',
      errRate: 'Between 0 and 60 %.',
      errLabel: 'Give it a name.',
      cardT: 'Fixed costs',
      cardMonth: 'Per month',
      cardStaff: 'Staff, charges included',
      cardStaffNoSocial: 'Staff (social charges not set)',
      cardFixed: 'Fixed costs',
      cardTotal: 'To cover each month',
      cardEdit: 'Edit',
      cardEmptyH: 'Your real result starts here',
      cardEmptyP: 'Rent, electricity, subscriptions, card fees: enter them once and Margins shows what the business really earns, after everything.',
      cardEmptyCta: 'Enter my costs',
      cardComm: (n) => `${n} fee rate${n > 1 ? 's' : ''} set`,
      beT: 'Break-even',
      beSub: (m) => `${m}`,
      beNeed: 'Sales needed this month',
      bePerDay: (n, open) => `that is ${n} per ${open ? 'opening' : 'calendar'} day`,
      beSold: 'Sold this month so far',
      bePace: 'At the pace of the days so far',
      beTrack: (n, p) => `Over your last ${n} months, this pace was off by ${p} on average at this point of the month.`,
      beAhead: (a) => `At this pace, ${a} above break-even`,
      beBehind: (a) => `At this pace, ${a} short of break-even`,
      beBasis: (p) => `Based on the margin and fees of the last 30 days (${p} left after cost of goods and fees).`,
      beCivil: 'Opening hours not set: calendar days are used.',
      beNoPace: 'The month’s pace shows once the first day is over.',
      beNoCosts: 'Enter your costs to see the figure to reach.',
      beTooFew: 'At least half of your sales need a cost to compute a fair break-even.',
      beNoSales: 'Not enough sales over 30 days to measure your margin.',
      beNegative: 'Over 30 days, cost of goods and fees exceed your sales: no volume covers the costs at these prices.',
    },
    ar: {
      cat: { rent: 'الإيجار', utilities: 'الكهرباء والماء', telecom: 'الإنترنت والهاتف', insurance: 'التأمين', accounting: 'المحاسب', financing: 'قرض أو إيجار تمويلي', software: 'البرامج والاشتراكات', maintenance: 'الصيانة', marketing: 'الإشهار', taxes: 'الضرائب المحلية', other: 'مصروف آخر' },
      freq: { month: 'شهريًا', quarter: 'كل ثلاثة أشهر', year: 'سنويًا' },
      method: { card: 'البطاقة البنكية', tap: 'الدفع اللاتلامسي', qr: 'الدفع بالرمز', wallet: 'المحفظة الإلكترونية', delivery: 'الدفع عند التسليم', link: 'رابط الدفع' },
      drawerT: 'المصاريف والعمولات',
      drawerS: 'ما تدفعه سواء بعت أم لا',
      fixedT: 'المصاريف الثابتة',
      fixedHelp: 'المبلغ كما هو في الفاتورة. المصروف السنوي يوزَّع على اثني عشر شهرًا.',
      add: 'إضافة',
      label: 'الاسم',
      amount: 'المبلغ (درهم)',
      every: 'الدورية',
      from: 'ابتداءً من',
      remove: 'إزالة',
      removeAria: (l) => `إزالة ${l}`,
      undo: 'التراجع عن الإزالة',
      removedFrom: 'أزيل ابتداءً من',
      removedKeep: 'الأشهر السابقة تحتفظ به.',
      stoppedN: (n) => `${n} مصاريف متوقفة، محفوظة في الأشهر التي احتُسبت فيها.`,
      noLines: 'لا توجد مصاريف بعد. ابدأ بالإيجار.',
      staffT: 'المستخدمون',
      staffFrom: (a, s, r) => `${a} شهريًا من الأجور الأساسية، مأخوذة من الفريق${s ? ` (${s} أجير` : ''}${r ? `${s ? '، ' : ' ('}${r} بأجر بالساعة` : ''}${s || r ? ')' : ''}.`,
      staffNone: 'لا أجر ولا سعر ساعة في الفريق: لا تُحتسب كلفة المستخدمين.',
      staffOpen: 'فتح الفريق',
      social: 'التحملات الاجتماعية للمشغل (%)',
      socialHelp: 'تضاف إلى أجور الفريق. في المغرب، الضمان الاجتماعي والتأمين الإجباري عن المرض ورسم التكوين تتجاوز غالبًا 21 % بقليل. تحقق مع محاسبك.',
      commT: 'العمولات',
      commHelp: 'النسبة التي يحتفظ بها البنك أو المنصة من كل عملية بيع. تظهر فقط وسائل الدفع والقنوات الموجودة في مبيعاتك.',
      commMethods: 'وسائل الدفع',
      commCap: 'للعلم: منذ 1 أكتوبر 2026، يحدد بنك المغرب سقف عمولة التبادل للبطاقات المغربية في 0,50 % دون احتساب الرسوم، و0,15 % لتجارة القرب. يشمل سعرك الإجمالي هذه العمولة وهامش بنكك: استعمل السعر المذكور في كشف حسابك.',
      commChannels: 'منصات البيع',
      save: 'حفظ',
      cancel: 'إلغاء',
      saved: 'تم حفظ المصاريف',
      savedDesc: 'النتيجة الصافية في الهوامش تأخذها بعين الاعتبار.',
      errAmount: 'مبلغ موجب بالدرهم.',
      errRate: 'بين 0 و60 %.',
      errLabel: 'أعطه اسمًا.',
      cardT: 'المصاريف الثابتة',
      cardMonth: 'شهريًا',
      cardStaff: 'المستخدمون مع التحملات',
      cardStaffNoSocial: 'المستخدمون (التحملات الاجتماعية غير محددة)',
      cardFixed: 'المصاريف الثابتة',
      cardTotal: 'ما يجب تغطيته كل شهر',
      cardEdit: 'تعديل',
      cardEmptyH: 'نتيجتك الحقيقية تبدأ هنا',
      cardEmptyP: 'الإيجار، الكهرباء، الاشتراكات، عمولات البطاقة: أدخلها مرة واحدة وتعرض الهوامش ما يربحه المحل فعلًا بعد كل شيء.',
      cardEmptyCta: 'إدخال مصاريفي',
      cardComm: (n) => `${n} نسب عمولة محددة`,
      beT: 'عتبة المردودية',
      beSub: (m) => `شهر ${m}`,
      beNeed: 'المبيعات اللازمة هذا الشهر',
      bePerDay: (n, open) => `أي ${n} في كل يوم ${open ? 'عمل' : 'تقويمي'}`,
      beSold: 'المبيعات هذا الشهر حتى الآن',
      bePace: 'بوتيرة الأيام الماضية',
      beTrack: (n, p) => `خلال أشهرك الـ${n} الأخيرة، أخطأ هذا الإيقاع بنسبة ${p} في المتوسط عند هذه المرحلة من الشهر.`,
      beAhead: (a) => `بهذه الوتيرة، ${a} فوق العتبة`,
      beBehind: (a) => `بهذه الوتيرة، سينقص ${a} لبلوغ العتبة`,
      beBasis: (p) => `محسوبة بهامش وعمولات آخر 30 يومًا (${p} يبقى بعد تكلفة المواد والعمولات).`,
      beCivil: 'ساعات العمل غير محددة: تُعتمد الأيام التقويمية.',
      beNoPace: 'تظهر وتيرة الشهر بعد انتهاء اليوم الأول.',
      beNoCosts: 'أدخل مصاريفك لمعرفة الرقم المطلوب.',
      beTooFew: 'يجب معرفة تكلفة نصف مبيعاتك على الأقل لحساب عتبة صحيحة.',
      beNoSales: 'المبيعات غير كافية خلال 30 يومًا لقياس هامشك.',
      beNegative: 'خلال 30 يومًا، تكلفة المواد والعمولات تفوق مبيعاتك: لا يوجد حجم يغطي المصاريف بهذه الأسعار.',
    },
  };
  const S = () => STR[lang()] || STR.fr;
  const locale = () => (lang() === 'en' ? 'en-GB' : lang() === 'ar' ? 'ar-MA' : 'fr-FR');
  const cash = (n) => {
    const v = Math.round((+n || 0) * 100) / 100;
    const d = Number.isInteger(v) ? 0 : 2;
    try { return `${new Intl.NumberFormat(lang() === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)} MAD`; }
    catch (_) { return `${v.toFixed(d)} MAD`; }
  };
  const round0 = (n) => cash(Math.round(+n || 0));
  const pctTxt = (n) => `${(Math.round(n * 10) / 10).toLocaleString(lang() === 'en' ? 'en-GB' : 'fr-FR')} %`;
  function monthLabel(month) {
    try {
      const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, 15));
      return new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
    } catch (_) { return month; }
  }
  const methodLabel = (m) => (S().method[m] || (m.charAt(0).toUpperCase() + m.slice(1)));
  const channelLabel = (c) => {
    const known = { glovo: 'Glovo', yassir: 'Yassir', jumia: 'Jumia Food', shopify: 'Shopify', whatsapp: 'WhatsApp', uber: 'Uber Eats', deliveroo: 'Deliveroo', kaalix: 'Kaalix' };
    return known[c] || (c.charAt(0).toUpperCase() + c.slice(1));
  };
  const icon = (name, size) => {
    try { return window.KiwiIcon && window.KiwiIcon.svg ? window.KiwiIcon.svg(name, size || 18) : ''; } catch (_) { return ''; }
  };

  /* ─────────────────────────── le temps ─────────────────────────── */
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  /* La journée de caisse en cours (5 h), celle de l'accueil et de Marges. */
  function today() {
    try { const d = window.KiwiDateRange && window.KiwiDateRange.selectedBusinessDay && window.KiwiDateRange.selectedBusinessDay('aujourdhui'); if (ISO.test(d)) return d; } catch (_) {}
    try { const d = window.KiwiDayReport && window.KiwiDayReport.today && window.KiwiDayReport.today(); if (ISO.test(d)) return d; } catch (_) {}
    const t = new Date(Date.now() - 5 * 3600e3);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }
  /* Les journées d'une période de Marges, dans la même convention que
   * KiwiDateRange.bounds : la journée en cours comprise. */
  function daysFor(range) {
    const t = today();
    if (range === 'hier') return [E.days.addDays(t, -1)];
    const n = range === 'septJours' ? 7 : range === 'trenteJours' ? 30 : 1;
    return E.days.lastDays(t, n);
  }
  function dayStart(day) {
    try {
      const b = window.KiwiDayReport && window.KiwiDayReport.dayBounds && window.KiwiDayReport.dayBounds(day);
      if (b && isFinite(b.from)) return b.from;
    } catch (_) {}
    return new Date(`${day}T05:00:00`).getTime();
  }
  function isOpen(day) {
    try {
      const H = window.KiwiHours;
      if (!H || !H.isConfigured || !H.isConfigured()) return null;
      const r = H.periodsOn(day);
      return !!(r && r.periods && r.periods.length);
    } catch (_) { return null; }
  }
  function labour(days) {
    try { return window.KiwiTeam && window.KiwiTeam.labour ? window.KiwiTeam.labour(days) : null; } catch (_) { return null; }
  }
  const netOfFor = (basis) => (x) => {
    try { return window.KiwiCost && window.KiwiCost.netOf ? window.KiwiCost.netOf(x, basis) : x; } catch (_) { return x; }
  };

  /* ─────────────────────────── le résultat ─────────────────────────── */
  /* Le résultat d'une période de Marges, à partir du registre que la page a
   * déjà calculé (pas un second) et de son résumé. */
  function result(a) {
    const o = a || {};
    const days = o.days || daysFor(o.range || 'septJours');
    const cov = o.cov || null;
    return E.result(doc(), {
      cov, sales: (o.ledger && o.ledger.sales) || [], days,
      labour: labour(days), netOf: netOfFor(cov && cov.basis),
    });
  }
  /* Le seuil du mois en cours. `ledgerFor(from, to)` rend le registre de la
   * page (restaurant : celui d'« Analyse du menu », avec les fiches
   * techniques), pour que la contribution soit la marge que la page affiche. */
  /* Le registre que la page Marges lit : celui d'« Analyse du menu » chez un
   * restaurant (fiches techniques comprises), sinon KiwiCost sur les ventes de
   * l'établissement. L'assistant et la Santé Kiwi passent par ici. */
  function defaultLedger(from, to) {
    const C = window.KiwiCost;
    try {
      const W = window.KiwiRestaurantMenuWorkspace;
      const A = W && W.analysis && W.isRestaurant && W.isRestaurant() ? W.analysis : null;
      if (A && A.ledger) return A.ledger({ from, to });
    } catch (_) {}
    let sales = [];
    try { const vid = window.KiwiStore.currentVenue && window.KiwiStore.currentVenue(); sales = (window.KiwiSales && window.KiwiSales.list && window.KiwiSales.list(vid)) || []; } catch (_) { sales = []; }
    return C && C.ledger ? C.ledger(sales, { from, to }) : null;
  }
  function breakEven(ledgerFor) {
    if (typeof ledgerFor !== 'function') ledgerFor = defaultLedger;
    const C = window.KiwiCost;
    const t = today();
    const month = E.days.monthOf(t);
    const run = (from, to) => {
      try { const L = ledgerFor(from, to); return { L, cov: L && C && C.summarize ? C.summarize(L) : null }; } catch (_) { return { L: null, cov: null }; }
    };
    const last30 = E.days.lastDays(t, 30);
    const r30 = run(dayStart(last30[0]), Date.now());
    const recent = E.result(doc(), { cov: r30.cov, sales: (r30.L && r30.L.sales) || [], days: [], labour: null, netOf: netOfFor(r30.cov && r30.cov.basis) });
    /* le mois entier : salaires de base complets, heures au rythme des 30
     * derniers jours (les heures futures ne sont pas encore saisies) */
    const lab = labour(last30);
    const monthLabour = lab ? { baseDue: lab.baseMass, variablePay: lab.variablePay } : null;
    const all = E.days.monthDays(t);
    const elapsed = all.filter((d) => d < t);
    const openFlags = all.map(isOpen);
    const hoursKnown = openFlags.every((f) => f !== null);
    const openDays = hoursKnown ? openFlags.filter(Boolean).length : null;
    const openElapsed = hoursKnown ? all.filter((d, i) => d < t && openFlags[i]).length : null;
    const monthFrom = dayStart(all[0]);
    const done = run(monthFrom, dayStart(t));
    const sofar = run(monthFrom, Date.now());
    const sold = (x) => (x.cov ? Math.max(0, (+x.cov.revenue || 0) - (+x.cov.refunds || 0)) : 0);
    const be = E.breakEven(doc(), {
      recent, month, monthLabour,
      openDays: openDays || null, openElapsed: openDays ? openElapsed : null,
      elapsed: elapsed.length, mtdSales: sold(done),
    });
    /* La fiabilité du rythme : la même règle rejouée sur les six derniers mois
     * complets, coupée au même point du mois (E.paceTrack). Une seule lecture
     * du registre, répartie par journée de caisse. */
    let track = null;
    if (be.projection != null) {
      try {
        const months = [];
        let cursor = E.days.addDays(all[0], -1);
        for (let k = 0; k < 6; k++) { const ds = E.days.monthDays(cursor); months.unshift(ds); cursor = E.days.addDays(ds[0], -1); }
        const dayList = [].concat(...months);
        const starts = dayList.map(dayStart).concat([monthFrom]);
        const hist = run(starts[0], monthFrom);
        const perDay = new Array(dayList.length).fill(0);
        ((hist.L && hist.L.sales) || []).forEach((x) => {
          const ts = +x.ts || 0;
          if (!(ts >= starts[0] && ts < monthFrom)) return;
          let lo = 0, hi = dayList.length - 1;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= ts) lo = mid; else hi = mid - 1; }
          perDay[lo] += Math.max(0, +x.amount || 0);
        });
        let i = 0;
        const hist6 = months.map((ds) => ({ days: ds.map((d) => ({ sold: perDay[i++], open: hoursKnown ? isOpen(d) : null })) }));
        const share = openDays ? openElapsed / openDays : elapsed.length / all.length;
        track = E.paceTrack(hist6, share);
      } catch (_) { track = null; }
    }
    return Object.assign(be, { month, soldSoFar: Math.round(sold(sofar) * 100) / 100, socialSet: doc().social.rate != null, recent, track });
  }
  /* Ce que le commerce doit couvrir chaque mois : pour l'assistant et la
   * Santé Kiwi. */
  function monthly() {
    const d = doc();
    const month = E.days.monthOf(today());
    const byCat = {};
    d.lines.forEach((l) => { const v = E.monthlyOf(l, month); if (v > 0) byCat[l.cat] = (byCat[l.cat] || 0) + v; });
    const lab = labour(E.days.lastDays(today(), 30));
    const staff = E.staffFor(lab ? { baseDue: lab.baseMass, variablePay: lab.variablePay } : null, d.social.rate);
    return {
      month, fixed: E.monthlyTotal(d, month), byCat, staff,
      socialRate: d.social.rate, commissions: d.commissions,
      configured: d.lines.some((l) => !l.deleted) || !!(staff && staff.total > 0),
    };
  }
  function configured() {
    const d = doc();
    return d.lines.some((l) => !l.deleted) || d.social.rate != null
      || Object.keys(d.commissions.methods).length > 0 || Object.keys(d.commissions.channels).length > 0;
  }

  /* ─────────────────────────── les cartes de Marges ─────────────────────────── */
  function css() {
    if (document.getElementById('kiwi-charges-css')) return;
    const st = document.createElement('style');
    st.id = 'kiwi-charges-css';
    st.textContent = [
      '.chg-rows{display:grid;gap:0;margin-top:4px;}',
      '.chg-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--n-200);font-size:13px;}',
      '.chg-row:first-child{border-top:0;}',
      '.chg-row b{font-weight:520;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.chg-row span{color:var(--n-600);font-variant-numeric:tabular-nums;white-space:nowrap;}',
      '.chg-row.total{border-top:1px solid var(--n-300,var(--n-200));font-weight:600;}',
      '.chg-row.total b,.chg-row.total span{color:var(--ink);font-weight:600;}',
      '.chg-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;}',
      '.chg-empty-h{font-size:15px;font-weight:600;letter-spacing:-.01em;color:var(--ink);margin:2px 0 6px;}',
      '.chg-empty-p{font-size:13px;line-height:1.55;color:var(--n-600);margin:0;}',
      '.chg-be-v{font-size:26px;font-weight:600;letter-spacing:-.02em;color:var(--ink);font-variant-numeric:tabular-nums;margin:6px 0 2px;}',
      '.chg-be-sub{font-size:12.5px;color:var(--n-600);}',
      '.chg-bar{position:relative;height:8px;border-radius:999px;background:var(--n-100);border:1px solid var(--n-200);overflow:hidden;margin:14px 0 6px;}',
      '.chg-bar i{position:absolute;inset-block:0;inset-inline-start:0;border-radius:inherit;background:var(--atlas);}',
      '.chg-bar i.pace{background:transparent;border-inline-end:2px solid var(--ink);border-radius:0;}',
      '.chg-be-state{font-size:13px;font-weight:560;margin-top:10px;}',
      '.chg-be-state.up{color:var(--atlas);}',
      '.chg-be-state.down{color:var(--ink);}',
      /* l'éditeur */
      '.chg-ed{display:grid;gap:26px;align-content:start;}',
      '.chg-ed h4{margin:0 0 4px;font-size:13px;font-weight:600;color:var(--ink);letter-spacing:-.005em;}',
      '.chg-ed .kf-help{margin-top:0;margin-bottom:10px;}',
      '.chg-line{display:grid;grid-template-columns:minmax(0,1fr) 120px 40px;gap:8px;align-items:end;padding:14px 0;border-top:1px solid var(--n-200);}',
      '.chg-line:first-of-type{border-top:0;padding-top:4px;}',
      '.chg-line .kf-group{margin:0;}',
      '.chg-line .chg-sub{grid-column:1/3;display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.chg-line .kf-label{font-size:11px;}',
      '.chg-line .kf-input{min-height:40px;font-size:13.5px;}', '.chg-line .kiwi-select-trigger{min-height:40px;padding-block:6px;border-radius:10px;}', '.chg-line .kiwi-select-value{font-weight:inherit;}',
      '.chg-line input[data-c="amount"]{font-variant-numeric:tabular-nums;text-align:end;}',
      '.chg-x{align-self:end;width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;border:1px solid var(--n-200);background:transparent;color:var(--n-600);cursor:pointer;}',
      '.chg-x:hover{color:var(--ink);border-color:var(--n-300,var(--n-200));}',
      '.chg-x:focus-visible,.chg-chip:focus-visible{outline:2px solid var(--atlas);outline-offset:2px;}',
      '.chg-line.gone{background:var(--n-100);border-radius:10px;padding-inline:12px;}',
      '.chg-line.gone .chg-gone{grid-column:1/-1;font-size:12.5px;color:var(--n-600);display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;}',
      '.chg-line.gone .chg-gone b{color:var(--ink);font-weight:560;}',
      '.chg-line.gone select{width:auto;min-height:36px;padding-block:4px;font-size:12.5px;}',
      '.chg-line .chg-gone button{border:0;background:none;color:var(--atlas);font:inherit;font-weight:560;cursor:pointer;padding:0;}',
      '.chg-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}',
      '.chg-chip{border:1px solid var(--n-200);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:6px 11px;border-radius:999px;cursor:pointer;display:inline-flex;gap:4px;align-items:center;}',
      '.chg-chip svg{width:15px;height:15px;color:var(--atlas);}',
      '.chg-rate{display:grid;grid-template-columns:minmax(0,1fr) 92px 14px;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--n-200);font-size:13px;}',
      '.chg-rate:first-of-type{border-top:0;}',
      '.chg-rate .kf-input{min-height:38px;text-align:end;font-variant-numeric:tabular-nums;}',
      '.chg-sub-h{font-size:11px;font-family:var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500);margin:12px 0 2px;}',
      '.chg-err{color:var(--danger,#B42318);font-size:11.5px;margin-top:3px;}',
      '.chg-staff{font-size:13px;line-height:1.5;color:var(--ink);margin:0 0 10px;}',
      '.chg-link{border:0;background:none;color:var(--atlas);font:inherit;font-size:13px;font-weight:560;padding:0;cursor:pointer;}',
    ].join('');
    document.head.appendChild(st);
  }

  /* La carte « Charges fixes » de Marges. */
  function card() {
    css();
    const c = S();
    const d = doc();
    const m = monthly();
    const lines = d.lines.filter((l) => E.monthlyOf(l, m.month) > 0)
      .map((l) => ({ label: l.label || c.cat[l.cat] || c.cat.other, v: E.monthlyOf(l, m.month) }))
      .sort((a, b) => b.v - a.v);
    const rates = Object.keys(d.commissions.methods).length + Object.keys(d.commissions.channels).length;
    if (!lines.length && !(m.staff && m.staff.total > 0) && !rates) {
      return `<div class="fin-card chg-card" data-charges-card>
        <div class="fin-eyebrow"><span>${esc(c.cardT)}</span></div>
        <div class="chg-empty-h">${esc(c.cardEmptyH)}</div>
        <p class="chg-empty-p">${esc(c.cardEmptyP)}</p>
        <div class="chg-actions"><button class="kb atlas" type="button" data-action="charges-open">${esc(c.cardEmptyCta)}</button></div>
      </div>`;
    }
    const shown = lines.slice(0, 5);
    const rest = lines.slice(5).reduce((s, l) => s + l.v, 0);
    const staff = m.staff && m.staff.total > 0 ? m.staff : null;
    const total = m.fixed + (staff ? staff.total : 0);
    return `<div class="fin-card chg-card" data-charges-card>
      <div class="fin-eyebrow"><span>${esc(c.cardT)}</span><span class="fin-eyebrow-sub">${esc(c.cardMonth)}</span></div>
      <div class="chg-rows">
        ${shown.map((l) => `<div class="chg-row"><b>${esc(l.label)}</b><span>${cash(l.v)}</span></div>`).join('')}
        ${rest > 0 ? `<div class="chg-row"><b>${esc(c.cat.other)} (${lines.length - 5})</b><span>${cash(rest)}</span></div>` : ''}
        ${staff ? `<div class="chg-row"><b>${esc(staff.socialSet ? c.cardStaff : c.cardStaffNoSocial)}</b><span>${cash(staff.total)}</span></div>` : ''}
        <div class="chg-row total"><b>${esc(c.cardTotal)}</b><span>${cash(total)}</span></div>
      </div>
      ${rates ? `<div class="fin-note-line">${esc(c.cardComm(rates))}</div>` : ''}
      <div class="chg-actions"><button class="kb ghost" type="button" data-action="charges-open">${icon('edit', 16)}${esc(c.cardEdit)}</button></div>
    </div>`;
  }

  /* La carte « Seuil de rentabilité ». Rien tant qu'aucune charge n'est
   * connue : un seuil de zéro serait un chiffre vrai et inutile. */
  function breakEvenCard(ledgerFor) {
    css();
    const c = S();
    if (!configured() && !(monthly().staff)) return '';
    const be = breakEven(ledgerFor);
    const head = `<div class="fin-eyebrow"><span>${esc(c.beT)}</span><span class="fin-eyebrow-sub">${esc(c.beSub(monthLabel(be.month)))}</span></div>`;
    if (be.salesNeeded == null) {
      const why = { 'no-costs': c.beNoCosts, 'too-few': c.beTooFew, 'no-sales': c.beNoSales, negative: c.beNegative }[be.reason] || c.beNoSales;
      return `<div class="fin-card chg-be" data-charges-breakeven data-reason="${esc(be.reason)}">${head}<div class="fin-note-line" style="margin-top:0;">${esc(why)}</div></div>`;
    }
    const need = be.salesNeeded;
    const fill = Math.max(0, Math.min(100, (be.soldSoFar / need) * 100));
    const pace = be.projection != null ? Math.max(0, Math.min(100, (be.projection / need) * 100)) : null;
    const state = be.gap == null ? `<div class="fin-note-line">${esc(c.beNoPace)}</div>`
      : `<div class="chg-be-state ${be.gap >= 0 ? 'up' : 'down'}" data-gap="${be.gap}">${esc(be.gap >= 0 ? c.beAhead(round0(be.gap)) : c.beBehind(round0(-be.gap)))}</div>`;
    return `<div class="fin-card chg-be" data-charges-breakeven data-need="${need}">
      ${head}
      <div class="chg-be-v">${round0(need)}</div>
      <div class="chg-be-sub">${esc(c.bePerDay(round0(be.perDay), be.daysAreOpenDays))}</div>
      <div class="chg-bar" role="img" aria-label="${esc(`${c.beSold} · ${round0(be.soldSoFar)} / ${round0(need)}`)}"><i style="width:${fill.toFixed(1)}%"></i>${pace != null ? `<i class="pace" style="width:${pace.toFixed(1)}%"></i>` : ''}</div>
      <div class="chg-rows">
        <div class="chg-row"><b>${esc(c.beSold)}</b><span>${round0(be.soldSoFar)}</span></div>
        ${be.projection != null ? `<div class="chg-row"><b>${esc(c.bePace)}</b><span>${round0(be.projection)}</span></div>` : ''}
      </div>
      ${be.track ? `<div class="fin-note-line" data-pace-track="${be.track.error}">${esc(c.beTrack(be.track.months, pctTxt(be.track.error)))}</div>` : ''}
      ${state}
      <div class="fin-note-line">${esc(c.beBasis(pctTxt(be.contribution * 100)))}</div>
      ${be.daysAreOpenDays ? '' : `<div class="fin-note-line">${esc(c.beCivil)}</div>`}
    </div>`;
  }

  /* ─────────────────────────── l'éditeur ─────────────────────────── */
  function firstSaleMonth(sales) {
    let min = Infinity;
    (sales || []).forEach((s) => { const ts = +(s && s.ts) || 0; if (ts > 0 && ts < min) min = ts; });
    if (!isFinite(min)) return null;
    const d = new Date(min);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthOptions(selected, earliest) {
    const cur = E.days.monthOf(today());
    const list = [];
    let y = +cur.slice(0, 4), mo = +cur.slice(5, 7) + 3;
    while (mo > 12) { mo -= 12; y++; }
    for (let i = 0; i < 40; i++) {
      const m = `${y}-${String(mo).padStart(2, '0')}`;
      list.push(m);
      mo--; if (mo < 1) { mo = 12; y--; }
    }
    if (selected && list.indexOf(selected) < 0) list.push(selected);
    if (earliest && list.indexOf(earliest) < 0) list.push(earliest);
    list.sort().reverse();
    return list.map((m) => `<option value="${m}"${m === selected ? ' selected' : ''}>${esc(monthLabel(m))}</option>`).join('');
  }
  let seq = 0;
  const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;
  const parseNum = (v) => {
    const t = String(v == null ? '' : v).replace(/\s| | /g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  };

  function open(opts) {
    const o = opts || {};
    if (!window.Kiwi || !window.Kiwi.drawer) return;
    css();
    const c = S();
    const d = doc();
    const cur = E.days.monthOf(today());
    let sales = o.sales;
    if (!sales) {
      try { const vid = window.KiwiStore.currentVenue && window.KiwiStore.currentVenue(); sales = (window.KiwiSales && window.KiwiSales.list && window.KiwiSales.list(vid)) || []; } catch (_) { sales = []; }
    }
    /* Une nouvelle charge vaut depuis la première vente que Kiwi connaît :
     * le loyer ne date pas du jour où le patron l'a saisi. Il peut changer. */
    const startNew = firstSaleMonth(sales) || cur;
    const seen = E.seenKeys((function () {
      try { const C = window.KiwiCost; return C && C.ledger ? C.ledger(sales, {}).sales : []; } catch (_) { return []; }
    })());
    const methods = Array.from(new Set(['card'].concat(seen.methods, Object.keys(d.commissions.methods))));
    const channels = Array.from(new Set(seen.channels.concat(Object.keys(d.commissions.channels))));

    /* L'état de travail : une ligne par charge qui pèse ce mois-ci ou plus
     * tard ; les charges arrêtées restent dans le document, pas à l'écran. */
    const live = (l) => !l.deleted && (E.monthlyOf(l, cur) > 0 || l.versions.some((v) => v.from > cur));
    const stopped = d.lines.filter((l) => !l.deleted && !live(l)).length;
    const amountNow = (l) => {
      const ref = l.versions.some((v) => v.from <= cur) ? cur : l.versions[0].from;
      let v = null; l.versions.forEach((x) => { if (x.from <= ref) v = x; });
      return v ? v.amount : l.versions[0].amount;
    };
    const rows = d.lines.filter(live).map((l) => ({
      id: l.id, label: l.label, cat: l.cat, freq: l.freq, amount: amountNow(l),
      from: l.versions.some((v) => v.from <= cur) ? cur : l.versions[0].from, orig: l, gone: false,
    })).map((r) => Object.assign(r, { fromInit: r.from }));

    const lineHtml = (r) => {
      const name = r.label || c.cat[r.cat] || c.cat.other;
      if (r.gone) {
        /* Le mois de retrait reste choisissable : le mois prochain par défaut
         * (le loyer d'octobre a été payé), le tout premier mois pour une ligne
         * saisie par erreur, qui disparaît alors entièrement. */
        return `<div class="chg-line gone" data-row="${esc(r.id)}"><div class="chg-gone">
          <span><b>${esc(name)}</b> · <label for="chg-m-${esc(r.id)}">${esc(c.removedFrom)}</label></span>
          <select class="kf-input" id="chg-m-${esc(r.id)}" data-c="from" data-kiwi-native-select>${monthOptions(r.from, r.orig && r.orig.versions[0] && r.orig.versions[0].from)}</select>
          <span>${esc(c.removedKeep)}</span><button type="button" data-chg="undo">${esc(c.undo)}</button></div></div>`;
      }
      return `<div class="chg-line" data-row="${esc(r.id)}">
        <div class="kf-group"><label class="kf-label" for="chg-l-${esc(r.id)}">${esc(c.label)}</label>
          <input class="kf-input" id="chg-l-${esc(r.id)}" data-c="label" maxlength="80" value="${esc(r.label)}" placeholder="${esc(c.cat[r.cat] || c.cat.other)}"></div>
        <div class="kf-group"><label class="kf-label" for="chg-a-${esc(r.id)}">${esc(c.amount)}</label>
          <input class="kf-input" id="chg-a-${esc(r.id)}" data-c="amount" inputmode="decimal" value="${r.amount == null ? '' : esc(r.amount)}" placeholder="0"></div>
        <button type="button" class="chg-x" data-chg="remove" aria-label="${esc(c.removeAria(name))}" title="${esc(c.remove)}">${icon('trash-2', 18)}</button>
        <div class="chg-sub">
          <div class="kf-group"><label class="kf-label" for="chg-f-${esc(r.id)}">${esc(c.every)}</label>
            <select class="kf-input" id="chg-f-${esc(r.id)}" data-c="freq">${['month', 'quarter', 'year'].map((f) => `<option value="${f}"${f === r.freq ? ' selected' : ''}>${esc(c.freq[f])}</option>`).join('')}</select></div>
          <div class="kf-group"><label class="kf-label" for="chg-m-${esc(r.id)}">${esc(c.from)}</label>
            <select class="kf-input" id="chg-m-${esc(r.id)}" data-c="from">${monthOptions(r.from, startNew)}</select></div>
        </div>
        <div class="chg-err" data-err hidden></div>
      </div>`;
    };
    const lab = labour(E.days.lastDays(today(), 30));
    const rateVal = (map, k) => (map[k] == null ? '' : String(map[k]).replace('.', lang() === 'en' ? '.' : ','));
    const rateRow = (kind, key, label, val) => `<div class="chg-rate"><label for="chg-r-${kind}-${esc(key)}">${esc(label)}</label>
      <input class="kf-input" id="chg-r-${kind}-${esc(key)}" data-rate="${kind}" data-key="${esc(key)}" inputmode="decimal" value="${esc(val)}" placeholder="0" aria-describedby="chg-comm-help"><span aria-hidden="true">%</span></div>`;
    const body = `<div class="chg-ed" data-charges-editor>
      <div class="chg-sec">
        <h4>${esc(c.fixedT)}</h4>
        <div class="kf-help">${esc(c.fixedHelp)}</div>
        <div data-lines>${rows.length ? rows.map(lineHtml).join('') : `<div class="kf-help" data-nolines>${esc(c.noLines)}</div>`}</div>
        <div class="chg-chips" role="group" aria-label="${esc(c.add)}">${CATS.map((k) => `<button type="button" class="chg-chip" data-chg="add" data-cat="${k}">${icon('add', 15)}${esc(c.cat[k])}</button>`).join('')}</div>
        ${stopped ? `<div class="kf-help" style="margin-top:10px;">${esc(c.stoppedN(stopped))}</div>` : ''}
      </div>
      <div class="chg-sec">
        <h4>${esc(c.staffT)}</h4>
        <p class="chg-staff">${esc(lab ? c.staffFrom(cash(lab.baseMass), lab.salaried, lab.rated) : c.staffNone)}</p>
        <div class="kf-group"><label class="kf-label" for="chg-social">${esc(c.social)}</label>
          <input class="kf-input" id="chg-social" data-social inputmode="decimal" value="${esc(d.social.rate == null ? '' : rateVal({ r: d.social.rate }, 'r'))}" placeholder="21" style="max-width:120px;">
          <div class="kf-help">${esc(c.socialHelp)}</div><div class="chg-err" data-err-social hidden></div></div>
        <button type="button" class="chg-link" data-chg="team">${esc(c.staffOpen)}</button>
      </div>
      <div class="chg-sec">
        <h4>${esc(c.commT)}</h4>
        <div class="kf-help" id="chg-comm-help">${esc(c.commHelp)}</div>
        <div class="chg-sub-h">${esc(c.commMethods)}</div>
        ${methods.map((m) => rateRow('methods', m, methodLabel(m), rateVal(d.commissions.methods, m))).join('')}
        <div class="kf-help chg-cap" data-chg-cap>${esc(c.commCap)}</div>
        ${channels.length ? `<div class="chg-sub-h">${esc(c.commChannels)}</div>${channels.map((ch) => rateRow('channels', ch, channelLabel(ch), rateVal(d.commissions.channels, ch))).join('')}` : ''}
        <div class="chg-err" data-err-rates hidden></div>
      </div>
    </div>`;
    const foot = `<button class="kb ghost" type="button" data-dismiss>${esc(c.cancel)}</button><button class="kb atlas" type="button" data-chg="save">${esc(c.save)}</button>`;
    const dr = window.Kiwi.drawer({ title: c.drawerT, subtitle: c.drawerS, body, foot, width: 520 });
    const root = dr.el;
    const host = root.querySelector('[data-lines]');
    const rowOf = (el) => { const w = el.closest('[data-row]'); return w ? rows.find((r) => r.id === w.getAttribute('data-row')) : null; };
    /* ce que la personne a tapé reste quand une ligne se redessine */
    const capture = () => {
      host.querySelectorAll('[data-row]').forEach((w) => {
        const r = rows.find((x) => x.id === w.getAttribute('data-row'));
        if (!r) return;
        if (r.gone) { const el = w.querySelector('[data-c="from"]'); if (el && el.value) r.from = el.value; return; }
        const v = (k) => { const el = w.querySelector(`[data-c="${k}"]`); return el ? el.value : null; };
        r.label = String(v('label') || '').trim();
        r.amountRaw = v('amount');
        r.freq = v('freq') || r.freq;
        r.from = v('from') || r.from;
      });
    };
    /* `fresh` : l'état vient d'être modifié après capture(), ne pas relire le
     * DOM d'avant par-dessus */
    const redraw = (fresh) => { if (!fresh) capture(); host.innerHTML = rows.length ? rows.map((r) => lineHtml(Object.assign({}, r, { amount: r.amountRaw != null ? r.amountRaw : r.amount }))).join('') : `<div class="kf-help" data-nolines>${esc(c.noLines)}</div>`; };
    root.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-chg]');
      if (!b || !root.contains(b)) return;
      const act = b.getAttribute('data-chg');
      if (act === 'add') {
        capture();
        const cat = b.getAttribute('data-cat') || 'other';
        const r = { id: newId(), label: cat === 'other' ? '' : c.cat[cat], cat, freq: cat === 'insurance' || cat === 'taxes' ? 'year' : 'month', amount: null, from: startNew, isNew: true, gone: false };
        rows.push(r);
        redraw();
        const el = host.querySelector(`[data-row="${r.id}"] [data-c="${cat === 'other' ? 'label' : 'amount'}"]`);
        if (el) el.focus();
      } else if (act === 'remove') {
        const r = rowOf(b); if (!r) return;
        capture();
        if (r.isNew) rows.splice(rows.indexOf(r), 1);
        else {
          r.gone = true;
          r.from = E.days.monthOf(E.days.addDays(`${cur}-28`, 7));   // le mois prochain
        }
        redraw(true);
      } else if (act === 'undo') {
        const r = rowOf(b); if (!r) return;
        capture(); r.gone = false; r.from = r.fromInit; redraw(true);
      } else if (act === 'team') {
        dr.close();
        const h = window.Kiwi && window.Kiwi.handlers && window.Kiwi.handlers['nav-equipe'];
        if (typeof h === 'function') h();
      } else if (act === 'save') {
        save();
      }
    });

    function save() {
      capture();
      let bad = false;
      root.querySelectorAll('[data-err],[data-err-social],[data-err-rates]').forEach((x) => { x.hidden = true; x.textContent = ''; });
      root.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
      const now = Date.now();
      const next = E.normalize(store.get());
      const byId = new Map(next.lines.map((l) => [l.id, l]));
      rows.forEach((r) => {
        const w = host.querySelector(`[data-row="${r.id}"]`);
        const err = (msg, field) => {
          bad = true;
          const box = w && w.querySelector('[data-err]');
          if (box) { box.textContent = msg; box.hidden = false; }
          const el = w && w.querySelector(`[data-c="${field}"]`);
          if (el) el.setAttribute('aria-invalid', 'true');
        };
        if (r.gone) {
          const l = byId.get(r.id); if (!l) return;
          const stoppedLine = E.stop(l, r.from);
          byId.set(r.id, stoppedLine ? Object.assign(stoppedLine, { updatedAt: now }) : E.remove(l, now));
          return;
        }
        const amount = parseNum(r.amountRaw != null ? r.amountRaw : r.amount);
        if (amount == null && r.isNew && !r.label) { return; }   // une ligne ajoutée puis laissée vide : rien
        if (amount == null || !(amount > 0) || amount > E.MAX_AMOUNT) { err(c.errAmount, 'amount'); return; }
        const label = r.label || (r.cat !== 'other' ? c.cat[r.cat] : '');
        if (!label) { err(c.errLabel, 'label'); return; }
        const value = Math.round(amount * 100) / 100;
        if (r.isNew) {
          byId.set(r.id, { id: r.id, label, cat: r.cat, freq: r.freq, versions: [{ from: r.from, amount: value }], until: null, updatedAt: now });
          return;
        }
        let l = Object.assign({}, byId.get(r.id) || r.orig);
        let changed = false;
        if (l.freq !== r.freq) {
          /* changer la fréquence ne réécrit pas le passé : chaque version
           * garde son poids mensuel, exprimé dans la nouvelle fréquence */
          const k = (E.FREQ_MONTHS[r.freq] || 1) / (E.FREQ_MONTHS[l.freq] || 1);
          l.versions = l.versions.map((v) => ({ from: v.from, amount: Math.round(v.amount * k * 100) / 100 }));
          l.freq = r.freq; changed = true;
        }
        const was = (() => { let v = null; l.versions.forEach((x) => { if (x.from <= r.from) v = x; }); return v ? v.amount : null; })();
        if (was !== value) { l = E.setAmount(l, value, r.from); changed = true; }
        if (l.label !== label) { l.label = label; changed = true; }
        if (changed) { l.updatedAt = now; byId.set(r.id, l); }
      });
      const social = parseNum(root.querySelector('[data-social]').value);
      if (social != null && (isNaN(social) || social < 0 || social > E.MAX_RATE)) {
        bad = true;
        const box = root.querySelector('[data-err-social]'); box.textContent = c.errRate; box.hidden = false;
        root.querySelector('[data-social]').setAttribute('aria-invalid', 'true');
      }
      const commissions = { methods: Object.assign({}, next.commissions.methods), channels: Object.assign({}, next.commissions.channels) };
      root.querySelectorAll('[data-rate]').forEach((el) => {
        const kind = el.getAttribute('data-rate'), key = el.getAttribute('data-key');
        const v = parseNum(el.value);
        if (v == null) { delete commissions[kind][key]; return; }
        if (isNaN(v) || v < 0 || v > E.MAX_RATE) {
          bad = true; el.setAttribute('aria-invalid', 'true');
          const box = root.querySelector('[data-err-rates]'); box.textContent = c.errRate; box.hidden = false;
          return;
        }
        commissions[kind][key] = Math.round(v * 100) / 100;
      });
      if (bad) {
        const first = root.querySelector('[aria-invalid="true"]');
        if (first) first.focus();
        return;
      }
      const out = { v: 1, lines: Array.from(byId.values()), social: { rate: social == null ? null : Math.round(social * 100) / 100 }, commissions, updatedAt: now };
      store.set(E.normalize(out));
      dr.close();
      try { window.Kiwi.toast(c.saved, { type: 'success', desc: c.savedDesc }); } catch (_) {}
    }
    return dr;
  }

  function bind() {
    const K = window.Kiwi;
    if (!K || !K.handlers) return false;
    K.handlers['charges-open'] = () => open();
    return true;
  }
  if (!bind()) document.addEventListener('DOMContentLoaded', bind, { once: true });

  window.KiwiCharges = {
    doc, store, open, result, breakEven, monthly, configured, card, breakEvenCard, daysFor, today,
    text: (k) => { const v = S()[k]; return typeof v === 'string' ? v : ''; },
    catLabel: (k) => S().cat[k] || S().cat.other,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
})();
