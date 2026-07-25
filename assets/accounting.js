/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · Comptabilité — the accounting agent
 * One surface inside Kiwi AI that does the four jobs a Moroccan café owner
 * otherwise pays four people for:
 *   · Livre            — bookkeeping: every sale & expense, auto-categorised
 *   · États financiers — accountant: compte de résultat, bilan, trésorerie
 *   · TVA & Impôts     — tax: TVA declarations, IS, the DGI deadline calendar
 *   · Paie             — payroll: salaires, CNSS, IR, fiches de paie
 *
 * Pure vanilla, no backend. Figures are mocked but internally coherent and
 * aligned with Café Atlas's P&L (the same numbers Kiwi AI reasons on).
 * Opens as a fullpage drawer; the chat agent can deep-link to any tab.
 *
 * Fully tri-lingual (FR / EN / AR): UI copy lives in STR, accounting labels
 * and dates in LBL, both resolved through the active KiwiI18n language.
 * The open drawer re-renders live when the language changes.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* ─────────────── DATA · Café Atlas · Maarif — Mai 2026 ───────────────
   * The data block stays the French source-of-truth. Every user-facing
   * label below is translated at render time through LBL; numbers, proper
   * nouns (staff, suppliers) and codes (TVA/CNSS/IS) are language-neutral. */
  const ACCT = {
    period: 'Mai 2026',
    revenue: 842300,
    cogs: 261000,
    netProfit: 188101,
    cash: 465000,
    entriesThisMonth: 1248,

    /* charges (hors coût matière) */
    opex: [
      ['Charges de personnel', 218000],
      ['Loyer', 56000],
      ['Eau · électricité · gaz', 28000],
      ['Amortissement & remboursement prêt', 42000],
      ['Marketing & divers', 19000],
      ['Assurances & taxes', 15000],
      ['Entretien & équipement', 14500],
      ['Abonnement Kiwi POS', 699],
    ],

    /* grand-livre — répartition + écritures récentes */
    ledgerCats: [
      ['Ventes encaissées', 842300, 'credit'],
      ['Achats matières premières', 261000, 'debit'],
      ['Charges de personnel', 218000, 'debit'],
      ['Charges externes', 117500, 'debit'],
      ['Impôts, taxes & social', 86500, 'debit'],
    ],
    ledger: [
      ['16 mai', 'Ventes du jour · 198 tickets', 'Ventes encaissées', 'credit', 28430],
      ['16 mai', 'Boucherie Hassan Maarif · agneau', 'Achats matières premières', 'debit', 4120],
      ['15 mai', 'Maraîcher El Jadida · légumes', 'Achats matières premières', 'debit', 2870],
      ['15 mai', 'Ventes du jour · 211 tickets', 'Ventes encaissées', 'credit', 30180],
      ['14 mai', 'Loyer du local · mai', 'Charges externes', 'debit', 56000],
      ['14 mai', 'Lydec · électricité & eau', 'Charges externes', 'debit', 9240],
      ['13 mai', 'Ventes du jour · 187 tickets', 'Ventes encaissées', 'credit', 26510],
      ['12 mai', 'Crémerie Aïcha · produits laitiers', 'Achats matières premières', 'debit', 1980],
      ['10 mai', 'Salaires · quinzaine', 'Charges de personnel', 'debit', 90000],
      ['05 mai', 'Acompte TVA · avril', 'Impôts, taxes & social', 'debit', 34880],
      ['03 mai', 'CNSS · cotisations avril', 'Impôts, taxes & social', 'debit', 50100],
      ['02 mai', 'Abonnement Kiwi POS', 'Charges externes', 'debit', 699],
    ],

    /* TVA — restauration sur place à 10 % */
    tva: {
      taux: '10 % (restauration sur place)',
      regime: 'Déclaration mensuelle · régime du débit',
      collectee: 76573,
      deductible: 38264,
      aPayer: 38309,
      echeance: '20 juin 2026',
    },

    /* Impôt sur les sociétés */
    is: {
      resultatImposable: 2257000,   // résultat annuel projeté
      taux: '20 %',
      estimeAnnuel: 451400,
      acompte: { label: '2ᵉ acompte provisionnel', date: '30 juin 2026', montant: 112850 },
    },

    /* calendrier fiscal & social — DGI / CNSS */
    calendar: [
      { date: '20 juin 2026', label: 'Déclaration & paiement TVA · mai', montant: 38309, tag: 'TVA', status: 'à faire' },
      { date: '30 juin 2026', label: 'CNSS · déclaration & paiement mai', montant: 50300, tag: 'CNSS', status: 'à venir' },
      { date: '30 juin 2026', label: '2ᵉ acompte provisionnel · IS', montant: 112850, tag: 'IS', status: 'à venir' },
      { date: '20 juil. 2026', label: 'Déclaration & paiement TVA · juin', montant: null, tag: 'TVA', status: 'à venir' },
      { date: '31 mars 2027', label: 'Déclaration annuelle des résultats · IS', montant: null, tag: 'IS', status: 'à venir' },
    ],

    /* paie — 8 salariés */
    payroll: {
      headcount: 8,
      totalBrut: 180000,
      cnssSalarie: 12132,
      ir: 28018,
      totalNet: 139850,
      cnssEmployeur: 38000,
      masseSalariale: 218000,
      echeance: '30 juin 2026',
      staff: [
        ['Mehdi Tazi', 'Chef de cuisine', 30000, 23300],
        ['Sofia Belkadi', 'Responsable de salle', 27000, 21000],
        ['Youssef Amrani', 'Barista senior', 24000, 18650],
        ['Hamid Jelloul', 'Chef de rang', 22500, 17500],
        ['Imane Fassi', 'Responsable caisse', 21000, 16350],
        ['Fatima Khalki', 'Serveuse', 20000, 15550],
        ['Nadia Srhir', 'Commis de cuisine', 18000, 14000],
        ['Karim Idrissi', 'Plonge & runner', 17500, 13500],
      ],
    },

    /* bilan simplifié — équilibré à 1 000 000 MAD */
    bilan: {
      actif: [
        ['Immobilisations (équipement, net)', 382000],
        ['Stock de matières', 96000],
        ['Créances clients & avances', 57000],
        ['Trésorerie', 465000],
      ],
      passif: [
        ['Capital social', 300000],
        ['Réserves & résultat de l’exercice', 340000],
        ['Dettes fournisseurs', 118000],
        ['Dettes fiscales & sociales', 117000],
        ['Emprunt bancaire', 125000],
      ],
    },

    /* flux de trésorerie · mai */
    flux: { initial: 412000, encaissements: 851000, decaissements: 798000, final: 465000 },
  };

  /* ═══════════════ I18N ═══════════════
   * STR — UI copy, keyed. {tokens} are filled by t(key, vars).
   * LBL — accounting labels, dates and statuses from the data block,
   *       keyed by their French source string.
   * Arabic is machine-drafted and flagged for native review, consistent
   * with assets/i18n.js. */
  function getLang() {
    const l = window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang();
    return (l === 'en' || l === 'ar') ? l : 'fr';
  }
  let lang = getLang();

  const STR = {
    fr: {
      drawerTitle: 'Comptabilité',
      drawerSub: 'Comptable · teneur de livres · fiscaliste · gestionnaire de paie, réunis',
      tabApercu: 'Aperçu', tabLivre: 'Livre', tabEtats: 'États financiers',
      tabTva: 'TVA & Impôts', tabPaie: 'Paie',
      banWho: 'Comptabilité à jour pour {p}.',
      banBody: 'Kiwi a enregistré et catégorisé {n} écritures ce mois. 3 actions demandent votre validation avant les échéances DGI.',
      modLivreN: 'Livre comptable', modLivreS: 'écritures · 100 % catégorisées',
      modEtatsN: 'États financiers', modEtatsS: 'résultat net du mois',
      modTvaN: 'TVA & Impôts', modTvaS: 'TVA à payer · {d}',
      modPaieN: 'Paie', modPaieV: '{n} salariés', modPaieS: 'paie du mois prête à valider',
      secValider: 'À valider avant échéance',
      todoTvaL: 'Déclaration TVA · {p}', todoTvaS: '{mad} · échéance {d}',
      todoPaieL: 'Fiches de paie · {p}', todoPaieS: '{n} salariés · {mad} net à verser',
      todoClotL: 'Clôture comptable · {p}', todoClotS: 'Rapprochement bancaire, 2 écarts à lever',
      aiPrefix: 'Kiwi AI :',
      apercuInsight: 'tout est prêt. Dites-moi « prépare ma déclaration TVA » ou « génère les fiches de paie » et je m’en occupe.',
      eyebrowLivre: 'Teneur de livres', hLivre: 'Grand livre · {p}',
      subLivre: 'Chaque vente et chaque dépense, enregistrée et classée automatiquement.',
      cardRepartition: 'Répartition par catégorie', nEcritures: '{n} écritures',
      cardRecent: 'Écritures récentes', auto100: '100 % auto',
      cardRecentS: 'Catégorisées par Kiwi, aucune saisie manuelle.',
      actExportLivre: 'Exporter le grand livre', actReconcile: 'Rapprochement bancaire',
      eyebrowEtats: 'Comptable', hEtats: 'États financiers · {p}',
      subEtats: 'Compte de résultat, bilan et trésorerie, générés en continu.',
      secResultat: 'Compte de résultat',
      rowCA: 'Chiffre d’affaires', rowCogs: 'Coût des matières',
      rowMargeBrute: 'Marge brute', rowResultatNet: 'Résultat net',
      secBilan: 'Bilan', rowActif: 'Actif', rowPassif: 'Passif',
      secTreso: 'Trésorerie · {p}',
      rowSoldeInitial: 'Solde en début de mois', rowEncaissements: 'Encaissements',
      rowDecaissements: 'Décaissements', rowTresoDispo: 'Trésorerie disponible',
      actCloture: 'Clôturer le mois', actExportEtats: 'Exporter (PDF · comptable)',
      eyebrowTva: 'Fiscaliste', hTva: 'TVA & Impôts · {p}',
      subTva: 'Déclarations, acomptes et échéances DGI, préparés, jamais en retard.',
      tvaCardT: 'TVA · {p}', echeanceX: 'échéance {d}',
      trioCollectee: 'Collectée', trioDeductible: 'Déductible', trioAPayer: 'À payer',
      isCardT: 'Impôt sur les sociétés', isTaux: 'taux {x}',
      rowResImposable: 'Résultat imposable projeté · 2026', rowIsEstime: 'IS estimé · exercice',
      secCalendrier: 'Calendrier fiscal & social', stTodo: 'À FAIRE', stSoon: 'À VENIR',
      tvaInsight: 'votre TVA de {p} est prête. Je peux pré-remplir la déclaration au format DGI/SIMPL, il ne vous reste qu’à signer.',
      actPrepTva: 'Préparer la déclaration TVA', actExportTva: 'Exporter pour la DGI',
      eyebrowPaie: 'Gestionnaire de paie', hPaie: 'Paie · {p}',
      subPaie: '{n} salariés · masse salariale {mad}.',
      paieCardT: 'Bulletin de paie du mois', aValider: 'à valider',
      paieCardS: 'CNSS & IR calculés automatiquement.',
      rowTotalBrut: 'Total brut', rowCnssSal: 'CNSS salariés (6,74 %)',
      rowIR: 'Impôt sur le revenu (IR)', rowNetVerser: 'Net à verser',
      rowCnssEmp: 'CNSS employeur (21,09 %)',
      cardSalaries: 'Salariés', nPersonnes: '{n} personnes', brutX: 'brut {x}',
      paieInsight: 'la déclaration CNSS de {p} ({mad}) est due le {d}. Je peux la générer dès la validation des fiches.',
      actGenPaie: 'Générer les {n} fiches de paie', actDeclCnss: 'Déclarer la CNSS',
    },
    en: {
      drawerTitle: 'Accounting',
      drawerSub: 'Accountant · bookkeeper · tax adviser · payroll manager, together',
      tabApercu: 'Overview', tabLivre: 'Ledger', tabEtats: 'Financials',
      tabTva: 'VAT & Tax', tabPaie: 'Payroll',
      banWho: 'Accounting up to date for {p}.',
      banBody: 'Kiwi recorded and categorised {n} entries this month. 3 actions need your approval before the DGI deadlines.',
      modLivreN: 'Bookkeeping ledger', modLivreS: 'entries · 100% categorised',
      modEtatsN: 'Financial statements', modEtatsS: 'net profit this month',
      modTvaN: 'VAT & Tax', modTvaS: 'VAT due · {d}',
      modPaieN: 'Payroll', modPaieV: '{n} employees', modPaieS: 'this month’s payroll ready to approve',
      secValider: 'Approve before the deadline',
      todoTvaL: 'VAT return · {p}', todoTvaS: '{mad} · due {d}',
      todoPaieL: 'Payslips · {p}', todoPaieS: '{n} employees · {mad} net to pay',
      todoClotL: 'Monthly close · {p}', todoClotS: 'Bank reconciliation, 2 discrepancies to clear',
      aiPrefix: 'Kiwi AI:',
      apercuInsight: 'everything is ready. Tell me “prepare my VAT return” or “generate the payslips” and I’ll take care of it.',
      eyebrowLivre: 'Bookkeeper', hLivre: 'General ledger · {p}',
      subLivre: 'Every sale and every expense, recorded and classified automatically.',
      cardRepartition: 'Breakdown by category', nEcritures: '{n} entries',
      cardRecent: 'Recent entries', auto100: '100% auto',
      cardRecentS: 'Categorised by Kiwi, no manual entry.',
      actExportLivre: 'Export the ledger', actReconcile: 'Bank reconciliation',
      eyebrowEtats: 'Accountant', hEtats: 'Financial statements · {p}',
      subEtats: 'Income statement, balance sheet and cash flow, generated continuously.',
      secResultat: 'Income statement',
      rowCA: 'Revenue', rowCogs: 'Cost of goods',
      rowMargeBrute: 'Gross margin', rowResultatNet: 'Net result',
      secBilan: 'Balance sheet', rowActif: 'Assets', rowPassif: 'Liabilities',
      secTreso: 'Cash flow · {p}',
      rowSoldeInitial: 'Opening balance', rowEncaissements: 'Cash in',
      rowDecaissements: 'Cash out', rowTresoDispo: 'Cash on hand',
      actCloture: 'Close the month', actExportEtats: 'Export (PDF · accountant)',
      eyebrowTva: 'Tax adviser', hTva: 'VAT & Tax · {p}',
      subTva: 'Returns, instalments and DGI deadlines, prepared, never late.',
      tvaCardT: 'VAT · {p}', echeanceX: 'due {d}',
      trioCollectee: 'Collected', trioDeductible: 'Deductible', trioAPayer: 'To pay',
      isCardT: 'Corporate income tax', isTaux: 'rate {x}',
      rowResImposable: 'Projected taxable income · 2026', rowIsEstime: 'Estimated CIT · year',
      secCalendrier: 'Tax & social calendar', stTodo: 'TO DO', stSoon: 'UPCOMING',
      tvaInsight: 'your {p} VAT is ready. I can pre-fill the return in DGI/SIMPL format, all that is left is your signature.',
      actPrepTva: 'Prepare the VAT return', actExportTva: 'Export for the DGI',
      eyebrowPaie: 'Payroll manager', hPaie: 'Payroll · {p}',
      subPaie: '{n} employees · total payroll {mad}.',
      paieCardT: 'This month’s payroll', aValider: 'to approve',
      paieCardS: 'CNSS & income tax computed automatically.',
      rowTotalBrut: 'Total gross', rowCnssSal: 'Employee CNSS (6.74%)',
      rowIR: 'Income tax (IR)', rowNetVerser: 'Net to pay',
      rowCnssEmp: 'Employer CNSS (21.09%)',
      cardSalaries: 'Employees', nPersonnes: '{n} people', brutX: 'gross {x}',
      paieInsight: 'the {p} CNSS return ({mad}) is due on {d}. I can generate it as soon as the payslips are approved.',
      actGenPaie: 'Generate the {n} payslips', actDeclCnss: 'File the CNSS',
    },
    ar: {
      /* AR: machine-drafted — needs native review */
      drawerTitle: 'المحاسبة',
      drawerSub: 'محاسب · ماسك دفاتر · مستشار ضريبي · مدير الأجور، مجتمعين',
      tabApercu: 'نظرة عامة', tabLivre: 'الدفتر', tabEtats: 'القوائم المالية',
      tabTva: 'الضريبة والرسوم', tabPaie: 'الأجور',
      banWho: 'المحاسبة محدّثة حتى {p}.',
      banBody: 'سجّل Kiwi وصنّف {n} قيدًا هذا الشهر. 3 إجراءات تحتاج موافقتك قبل مواعيد المديرية العامة للضرائب.',
      modLivreN: 'دفتر المحاسبة', modLivreS: 'قيد · مصنّفة 100٪',
      modEtatsN: 'القوائم المالية', modEtatsS: 'صافي ربح الشهر',
      modTvaN: 'الضريبة والرسوم', modTvaS: 'الضريبة المستحقة · {d}',
      modPaieN: 'الأجور', modPaieV: '{n} موظفين', modPaieS: 'رواتب الشهر جاهزة للاعتماد',
      secValider: 'للاعتماد قبل الموعد النهائي',
      todoTvaL: 'تصريح الضريبة على القيمة المضافة · {p}', todoTvaS: '{mad} · يستحق {d}',
      todoPaieL: 'كشوف الرواتب · {p}', todoPaieS: '{n} موظفين · {mad} صافٍ للدفع',
      todoClotL: 'الإقفال المحاسبي · {p}', todoClotS: 'تسوية بنكية، فارقان يجب تصحيحهما',
      aiPrefix: 'Kiwi AI:',
      apercuInsight: 'كل شيء جاهز. قل لي «حضّر تصريح الضريبة» أو «أنشئ كشوف الرواتب» وسأتكفّل بذلك.',
      eyebrowLivre: 'ماسك الدفاتر', hLivre: 'دفتر الأستاذ · {p}',
      subLivre: 'كل عملية بيع وكل نفقة، مُسجّلة ومُصنّفة تلقائيًا.',
      cardRepartition: 'التوزيع حسب الفئة', nEcritures: '{n} قيد',
      cardRecent: 'القيود الأخيرة', auto100: 'تلقائي 100٪',
      cardRecentS: 'مُصنّفة بواسطة Kiwi، دون إدخال يدوي.',
      actExportLivre: 'تصدير دفتر الأستاذ', actReconcile: 'تسوية بنكية',
      eyebrowEtats: 'محاسب', hEtats: 'القوائم المالية · {p}',
      subEtats: 'حساب النتيجة والميزانية والخزينة، تُولَّد باستمرار.',
      secResultat: 'حساب النتيجة',
      rowCA: 'رقم المعاملات', rowCogs: 'تكلفة المواد',
      rowMargeBrute: 'الهامش الإجمالي', rowResultatNet: 'النتيجة الصافية',
      secBilan: 'الميزانية', rowActif: 'الأصول', rowPassif: 'الخصوم',
      secTreso: 'الخزينة · {p}',
      rowSoldeInitial: 'الرصيد الافتتاحي', rowEncaissements: 'المقبوضات',
      rowDecaissements: 'المدفوعات', rowTresoDispo: 'الخزينة المتاحة',
      actCloture: 'إقفال الشهر', actExportEtats: 'تصدير (PDF · للمحاسب)',
      eyebrowTva: 'مستشار ضريبي', hTva: 'الضريبة والرسوم · {p}',
      subTva: 'التصاريح والدفعات ومواعيد المديرية العامة للضرائب، مُحضّرة، دون تأخّر.',
      tvaCardT: 'الضريبة على القيمة المضافة · {p}', echeanceX: 'يستحق {d}',
      trioCollectee: 'المحصّلة', trioDeductible: 'القابلة للخصم', trioAPayer: 'للدفع',
      isCardT: 'الضريبة على الشركات', isTaux: 'النسبة {x}',
      rowResImposable: 'النتيجة الخاضعة للضريبة المتوقّعة · 2026', rowIsEstime: 'الضريبة على الشركات المقدّرة · السنة',
      secCalendrier: 'الرزنامة الضريبية والاجتماعية', stTodo: 'للإنجاز', stSoon: 'قادم',
      tvaInsight: 'ضريبة {p} جاهزة. يمكنني تعبئة التصريح مسبقًا بصيغة DGI/SIMPL، لا يتبقّى سوى توقيعك.',
      actPrepTva: 'تحضير تصريح الضريبة', actExportTva: 'تصدير للمديرية العامة للضرائب',
      eyebrowPaie: 'مدير الأجور', hPaie: 'الأجور · {p}',
      subPaie: '{n} موظفين · كتلة الأجور {mad}.',
      paieCardT: 'كشف رواتب الشهر', aValider: 'للاعتماد',
      paieCardS: 'اشتراكات CNSS والضريبة على الدخل محسوبة تلقائيًا.',
      rowTotalBrut: 'الإجمالي الخام', rowCnssSal: 'اشتراك الأجراء CNSS (6.74٪)',
      rowIR: 'الضريبة على الدخل', rowNetVerser: 'الصافي للدفع',
      rowCnssEmp: 'اشتراك المشغّل CNSS (21.09٪)',
      cardSalaries: 'الموظفون', nPersonnes: '{n} أشخاص', brutX: 'خام {x}',
      paieInsight: 'تصريح CNSS لـ {p} ({mad}) يستحق في {d}. يمكنني إنشاؤه بمجرّد اعتماد الكشوف.',
      actGenPaie: 'إنشاء {n} كشوف رواتب', actDeclCnss: 'تصريح CNSS',
    },
  };

  /* accounting labels, statuses & dates — keyed by the French source string */
  const LBL = {
    /* opex + ledger categories */
    'Charges de personnel': { en: 'Payroll costs', ar: 'تكاليف الموظفين' },
    'Loyer': { en: 'Rent', ar: 'الكراء' },
    'Eau · électricité · gaz': { en: 'Water · electricity · gas', ar: 'الماء · الكهرباء · الغاز' },
    'Amortissement & remboursement prêt': { en: 'Depreciation & loan repayment', ar: 'الإهلاك وسداد القرض' },
    'Marketing & divers': { en: 'Marketing & misc.', ar: 'التسويق ومصاريف متنوّعة' },
    'Assurances & taxes': { en: 'Insurance & taxes', ar: 'التأمينات والرسوم' },
    'Entretien & équipement': { en: 'Maintenance & equipment', ar: 'الصيانة والمعدّات' },
    'Abonnement Kiwi POS': { en: 'Kiwi POS subscription', ar: 'اشتراك Kiwi POS' },
    'Ventes encaissées': { en: 'Sales collected', ar: 'المبيعات المحصّلة' },
    'Achats matières premières': { en: 'Raw material purchases', ar: 'مشتريات المواد الأولية' },
    'Charges externes': { en: 'External charges', ar: 'المصاريف الخارجية' },
    'Impôts, taxes & social': { en: 'Tax & social charges', ar: 'الضرائب والاشتراكات الاجتماعية' },
    /* ledger entry descriptions */
    'Ventes du jour · 198 tickets': { en: 'Day’s sales · 198 receipts', ar: 'مبيعات اليوم · 198 تذكرة' },
    'Boucherie Hassan Maarif · agneau': { en: 'Hassan Maarif butcher · lamb', ar: 'ملحمة حسن المعاريف · لحم الضأن' },
    'Maraîcher El Jadida · légumes': { en: 'El Jadida greengrocer · vegetables', ar: 'خضّار الجديدة · خضروات' },
    'Ventes du jour · 211 tickets': { en: 'Day’s sales · 211 receipts', ar: 'مبيعات اليوم · 211 تذكرة' },
    'Loyer du local · mai': { en: 'Premises rent · May', ar: 'كراء المحل · ماي' },
    'Lydec · électricité & eau': { en: 'Lydec · electricity & water', ar: 'ليديك · الكهرباء والماء' },
    'Ventes du jour · 187 tickets': { en: 'Day’s sales · 187 receipts', ar: 'مبيعات اليوم · 187 تذكرة' },
    'Crémerie Aïcha · produits laitiers': { en: 'Aïcha dairy · dairy products', ar: 'ألبان عائشة · منتجات الألبان' },
    'Salaires · quinzaine': { en: 'Wages · fortnight', ar: 'الأجور · نصف شهري' },
    'Acompte TVA · avril': { en: 'VAT instalment · April', ar: 'دفعة الضريبة · أبريل' },
    'CNSS · cotisations avril': { en: 'CNSS · April contributions', ar: 'CNSS · اشتراكات أبريل' },
    /* calendar labels */
    'Déclaration & paiement TVA · mai': { en: 'VAT return & payment · May', ar: 'تصريح وأداء الضريبة · ماي' },
    'CNSS · déclaration & paiement mai': { en: 'CNSS · May return & payment', ar: 'CNSS · تصريح وأداء ماي' },
    '2ᵉ acompte provisionnel · IS': { en: '2nd advance instalment · CIT', ar: 'الدفعة المؤقتة الثانية · الضريبة على الشركات' },
    'Déclaration & paiement TVA · juin': { en: 'VAT return & payment · June', ar: 'تصريح وأداء الضريبة · يونيو' },
    'Déclaration annuelle des résultats · IS': { en: 'Annual results return · CIT', ar: 'التصريح السنوي بالنتائج · الضريبة على الشركات' },
    /* staff job titles */
    'Chef de cuisine': { en: 'Head chef', ar: 'رئيس المطبخ' },
    'Responsable de salle': { en: 'Floor manager', ar: 'مسؤول القاعة' },
    'Barista senior': { en: 'Senior barista', ar: 'باريستا أوّل' },
    'Chef de rang': { en: 'Section waiter', ar: 'رئيس صفّ' },
    'Responsable caisse': { en: 'Cashier lead', ar: 'مسؤول الصندوق' },
    'Serveuse': { en: 'Waitress', ar: 'نادلة' },
    'Commis de cuisine': { en: 'Kitchen assistant', ar: 'مساعد طبخ' },
    'Plonge & runner': { en: 'Dishwash & runner', ar: 'غسل الأواني والمناولة' },
    /* balance sheet */
    'Immobilisations (équipement, net)': { en: 'Fixed assets (equipment, net)', ar: 'الأصول الثابتة (معدّات، صافٍ)' },
    'Stock de matières': { en: 'Inventory of materials', ar: 'مخزون المواد' },
    'Créances clients & avances': { en: 'Receivables & advances', ar: 'الذمم المدينة والتسبيقات' },
    'Trésorerie': { en: 'Cash', ar: 'الخزينة' },
    'Capital social': { en: 'Share capital', ar: 'رأس المال' },
    'Réserves & résultat de l’exercice': { en: 'Reserves & profit for the year', ar: 'الاحتياطيات ونتيجة السنة' },
    'Dettes fournisseurs': { en: 'Supplier payables', ar: 'ديون الموردين' },
    'Dettes fiscales & sociales': { en: 'Tax & social payables', ar: 'الديون الضريبية والاجتماعية' },
    'Emprunt bancaire': { en: 'Bank loan', ar: 'قرض بنكي' },
    /* tva / is descriptors */
    '10 % (restauration sur place)': { en: '10% (dine-in catering)', ar: '10٪ (مطاعم في عين المكان)' },
    'Déclaration mensuelle · régime du débit': { en: 'Monthly filing · accrual basis', ar: 'تصريح شهري · نظام الاستحقاق' },
    '2ᵉ acompte provisionnel': { en: '2nd advance instalment', ar: 'الدفعة المؤقتة الثانية' },
    /* period & dates */
    'Mai 2026': { en: 'May 2026', ar: 'ماي 2026' },
    '16 mai': { en: '16 May', ar: '16 ماي' },
    '15 mai': { en: '15 May', ar: '15 ماي' },
    '14 mai': { en: '14 May', ar: '14 ماي' },
    '13 mai': { en: '13 May', ar: '13 ماي' },
    '12 mai': { en: '12 May', ar: '12 ماي' },
    '10 mai': { en: '10 May', ar: '10 ماي' },
    '05 mai': { en: '05 May', ar: '05 ماي' },
    '03 mai': { en: '03 May', ar: '03 ماي' },
    '02 mai': { en: '02 May', ar: '02 ماي' },
    '20 juin 2026': { en: '20 June 2026', ar: '20 يونيو 2026' },
    '30 juin 2026': { en: '30 June 2026', ar: '30 يونيو 2026' },
    '20 juil. 2026': { en: '20 Jul. 2026', ar: '20 يوليوز 2026' },
    '31 mars 2027': { en: '31 March 2027', ar: '31 مارس 2027' },
  };

  /* action toasts — [title, desc] per language */
  const TOASTS = {
    fr: {
      'export-livre': ['Grand livre exporté', 'Format FEC + Excel · envoyé à votre comptable et à vous.'],
      'reconcile': ['Rapprochement bancaire lancé', '2 écarts détectés · Kiwi propose une correction pour chacun.'],
      'cloture': ['Clôture du mois initiée', 'Écritures verrouillées · états financiers figés pour la période.'],
      'export-etats': ['États financiers exportés', 'Compte de résultat + bilan en PDF, prêts pour le comptable.'],
      'prep-tva': ['Déclaration TVA préparée', 'Pré-remplie au format SIMPL · il ne reste qu’à la signer sur le portail DGI.'],
      'export-tva': ['Déclaration TVA exportée', 'Fichier conforme DGI généré pour la période.'],
      'gen-paie': ['Fiches de paie', 'Génération des bulletins PDF et envoi à l’équipe : bientôt disponible.'],
      'decl-cnss': ['Déclaration CNSS préparée', 'Bordereau du mois prêt pour le portail Damancom.'],
    },
    en: {
      'export-livre': ['Ledger exported', 'FEC + Excel format · sent to your accountant and to you.'],
      'reconcile': ['Bank reconciliation started', '2 discrepancies found · Kiwi suggests a fix for each.'],
      'cloture': ['Month-end close started', 'Entries locked · financials frozen for the period.'],
      'export-etats': ['Financial statements exported', 'Income statement + balance sheet as PDF, ready for the accountant.'],
      'prep-tva': ['VAT return prepared', 'Pre-filled in SIMPL format · just sign it on the DGI portal.'],
      'export-tva': ['VAT return exported', 'DGI-compliant file generated for the period.'],
      'gen-paie': ['{n} payslips generated', 'PDF payslips ready · WhatsApp notification sent to the team.'],
      'decl-cnss': ['CNSS return prepared', 'Monthly statement ready for the Damancom portal.'],
    },
    ar: {
      /* AR: machine-drafted — needs native review */
      'export-livre': ['تم تصدير دفتر الأستاذ', 'صيغة FEC + Excel · أُرسلت إلى محاسبك وإليك.'],
      'reconcile': ['انطلقت التسوية البنكية', 'تم رصد فارقين · يقترح Kiwi تصحيحًا لكلٍّ منهما.'],
      'cloture': ['انطلق إقفال الشهر', 'القيود مقفلة · القوائم المالية مُجمّدة للفترة.'],
      'export-etats': ['تم تصدير القوائم المالية', 'حساب النتيجة + الميزانية بصيغة PDF، جاهزة للمحاسب.'],
      'prep-tva': ['تم تحضير تصريح الضريبة', 'معبّأ مسبقًا بصيغة SIMPL · يكفي توقيعه على بوابة المديرية.'],
      'export-tva': ['تم تصدير تصريح الضريبة', 'تم إنشاء ملف مطابق للمديرية العامة للضرائب للفترة.'],
      'gen-paie': ['تم إنشاء {n} كشوف رواتب', 'كشوف PDF جاهزة · تم إرسال إشعار واتساب للفريق.'],
      'decl-cnss': ['تم تحضير تصريح CNSS', 'كشف الشهر جاهز لبوابة Damancom.'],
    },
  };

  /* t — UI copy; tl — accounting label/date; fills {tokens} from vars */
  function fill(s, vars) {
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function t(key, vars) {
    const pack = STR[lang] || STR.fr;
    let s = pack[key] != null ? pack[key] : STR.fr[key];
    return fill(s == null ? key : s, vars);
  }
  function tl(fr) {
    if (lang === 'fr' || !fr) return fr;
    const m = LBL[fr];
    return (m && m[lang]) || fr;
  }

  /* ─────────────── FORMATTING ─────────────── */
  const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
  const fmtMad = (n) => fmt(n) + ' MAD';
  const sum = (arr, i) => arr.reduce((a, r) => a + r[i], 0);

  /* ═══════════════ STYLES ═══════════════ */
  function injectCss() {
    if (document.getElementById('ac-css')) return;
    const s = document.createElement('style');
    s.id = 'ac-css';
    s.textContent = `
    .ac-drawer .kiwi-drawer { display:flex; flex-direction:column; }
    .ac-drawer .kiwi-drawer-body { flex:1; min-height:0; padding:0 !important; display:flex; flex-direction:column; }
    .ac-drawer .kiwi-drawer-head h3 { font-family:'Instrument Serif',serif; font-weight:400; font-size:28px; }
    .ac-drawer .kiwi-drawer-head p { color:var(--n-500); font-size:12.5px; }

    .ac { display:flex; flex-direction:column; width:100%; height:100%; background:var(--paper);
      --ac-ease:var(--ease-glide,cubic-bezier(.16,1,.30,1)); }

    /* tab strip */
    .ac-tabs { display:flex; gap:4px; padding:10px clamp(16px,6%,80px) 0; border-bottom:1px solid var(--n-200);
      overflow-x:auto; scrollbar-width:none; flex-shrink:0; background:var(--paper); }
    .ac-tabs::-webkit-scrollbar { display:none; }
    .ac-tab { white-space:nowrap; flex-shrink:0; font:inherit; font-size:13px; font-weight:500;
      color:var(--n-500); background:none; border:0; padding:11px 14px 13px; cursor:pointer;
      border-bottom:2px solid transparent; transition:color 140ms; }
    .ac-tab:hover { color:var(--ink); }
    .ac-tab.on { color:var(--atlas); border-bottom-color:var(--atlas); }

    .ac-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;
      padding:24px clamp(16px,6%,80px) 60px; }
    .ac-panel { max-width:760px; margin:0 auto; animation:ac-rise 460ms var(--ac-ease) both; }
    @keyframes ac-rise { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }

    /* generic pieces */
    .ac-eyebrow { font-size:10.5px; font-weight:600; letter-spacing:.13em; text-transform:uppercase; color:var(--atlas); }
    .ac-h { font-family:'Instrument Serif',serif; font-weight:400; font-size:24px; color:var(--ink); margin:3px 0 2px; }
    .ac-sub { font-size:12.5px; color:var(--n-500); }
    .ac-card { background:var(--surface); border:1px solid var(--n-200); border-radius:18px; padding:18px 18px;
      box-shadow:0 1px 2px rgba(10,15,13,.04), 0 18px 34px -26px rgba(10,15,13,.2); }
    .ac-card + .ac-card { margin-top:14px; }
    .ac-card-t { font-size:13.5px; font-weight:600; color:var(--ink); display:flex; justify-content:space-between;
      align-items:baseline; gap:10px; }
    .ac-card-s { font-size:11.5px; color:var(--n-500); margin-top:2px; }

    /* status banner */
    .ac-banner { display:flex; gap:12px; align-items:flex-start; padding:15px 16px; border-radius:16px;
      background:linear-gradient(145deg,var(--atlas),var(--riad)); color:#fff; margin-bottom:18px; }
    .ac-banner svg { width:20px; height:20px; flex-shrink:0; color:var(--mint); margin-top:1px; }
    .ac-banner b { font-weight:600; }
    .ac-banner .s { font-size:12px; opacity:.85; margin-top:3px; line-height:1.45; }

    /* module grid (Aperçu) */
    .ac-mods { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .ac-mod { text-align:start; background:var(--surface); border:1px solid var(--n-200); border-radius:16px;
      padding:16px 15px; cursor:pointer; font:inherit; transition:transform 140ms var(--ac-ease), border-color 140ms;
      box-shadow:0 1px 2px rgba(10,15,13,.04), 0 14px 26px -22px rgba(10,15,13,.2); }
    .ac-mod:hover { border-color:var(--atlas); }
    .ac-mod:active { transform:scale(.975); }
    .ac-mod-ico { width:34px; height:34px; border-radius:10px; display:flex; align-items:center; justify-content:center;
      background:var(--paper-soft); color:var(--atlas); margin-bottom:10px; }
    .ac-mod-ico svg { width:18px; height:18px; }
    .ac-mod-n { font-size:13px; font-weight:600; color:var(--ink); }
    .ac-mod-v { font-size:17px; font-weight:600; color:var(--ink); margin-top:7px; letter-spacing:-.02em;
      font-variant-numeric:tabular-nums; }
    .ac-mod-s { font-size:11px; color:var(--n-500); margin-top:3px; line-height:1.4; }

    /* rows / lines */
    .ac-row { display:flex; justify-content:space-between; align-items:baseline; gap:12px;
      padding:11px 0; border-bottom:1px solid var(--n-200); }
    .ac-row:last-child { border-bottom:0; }
    .ac-row .k { font-size:12.5px; color:var(--n-600); }
    .ac-row .k small { display:block; font-size:11px; color:var(--n-500); margin-top:2px; }
    .ac-row .v { font-size:13px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums;
      text-align:end; white-space:nowrap; }
    .ac-row.total { border-top:2px solid var(--ink); border-bottom:0; padding-top:13px; margin-top:3px; }
    .ac-row.total .k { font-weight:600; color:var(--ink); font-size:13.5px; }
    .ac-row.total .v { font-size:17px; color:var(--atlas); }
    .ac-row.neg .v { color:var(--n-600); }

    /* big stat trio */
    .ac-trio { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-top:4px; }
    .ac-trio .t { background:var(--paper-soft); border-radius:12px; padding:11px 12px; }
    .ac-trio .t .l { font-size:9.5px; font-weight:600; letter-spacing:.07em; text-transform:uppercase; color:var(--n-500); }
    .ac-trio .t .n { font-size:16px; font-weight:600; margin-top:4px; color:var(--ink); font-variant-numeric:tabular-nums; }
    .ac-trio .t.hl { background:rgba(11,110,79,.09); }
    .ac-trio .t.hl .n { color:var(--atlas); }

    /* category bars */
    .ac-bar { margin-top:11px; }
    .ac-bar-h { display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px; }
    .ac-bar-h .k { color:var(--n-600); }
    .ac-bar-h .v { font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
    .ac-bar-t { height:7px; border-radius:999px; background:var(--n-200); overflow:hidden; }
    .ac-bar-f { height:100%; border-radius:999px; }

    /* ledger feed */
    .ac-led { display:flex; gap:12px; align-items:baseline; padding:12px 2px; border-bottom:1px solid var(--n-200); }
    .ac-led:last-child { border-bottom:0; }
    .ac-led .d { font-size:11px; color:var(--n-500); font-variant-numeric:tabular-nums; width:48px; flex-shrink:0; }
    .ac-led .m { flex:1; min-width:0; }
    .ac-led .m .lib { font-size:13px; color:var(--ink); }
    .ac-led .m .cat { font-size:11px; color:var(--n-500); margin-top:2px; display:flex; align-items:center; gap:5px; }
    .ac-led .m .cat::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--atlas); }
    .ac-led .amt { font-size:13.5px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .ac-led .amt.credit { color:var(--atlas); }
    .ac-led .amt.debit { color:var(--n-700); }

    /* tax calendar */
    .ac-cal { display:flex; gap:13px; padding:13px 2px; border-bottom:1px solid var(--n-200); align-items:flex-start; }
    .ac-cal:last-child { border-bottom:0; }
    .ac-cal-tag { font-size:10px; font-weight:700; letter-spacing:.04em; padding:4px 8px; border-radius:7px;
      background:var(--paper-soft); color:var(--atlas); flex-shrink:0; min-width:46px; text-align:center; }
    .ac-cal-m { flex:1; min-width:0; }
    .ac-cal-m .l { font-size:13px; color:var(--ink); font-weight:500; }
    .ac-cal-m .d { font-size:11.5px; color:var(--n-500); margin-top:2px; }
    .ac-cal-r { text-align:end; white-space:nowrap; }
    .ac-cal-r .a { font-size:13px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
    .ac-cal-r .st { font-size:10px; font-weight:600; margin-top:3px; }
    .ac-cal-r .st.todo { color:var(--warn-ink); }
    .ac-cal-r .st.soon { color:var(--n-500); }

    /* attention list */
    .ac-todo { display:flex; gap:11px; align-items:center; width:100%; text-align:start; font:inherit;
      background:var(--surface); border:1px solid var(--n-200); border-radius:13px; padding:13px 14px; cursor:pointer;
      transition:border-color 140ms; }
    .ac-todo + .ac-todo { margin-top:9px; }
    .ac-todo:hover { border-color:var(--atlas); }
    .ac-todo .dot { width:8px; height:8px; border-radius:50%; background:var(--warn-ink); flex-shrink:0; }
    .ac-todo .tx { flex:1; min-width:0; }
    .ac-todo .tx .l { font-size:13px; font-weight:500; color:var(--ink); }
    .ac-todo .tx .s { font-size:11.5px; color:var(--n-500); margin-top:1px; }
    .ac-todo .go { color:var(--n-400); flex-shrink:0; }
    [dir="rtl"] .ac-todo .go svg { transform:scaleX(-1); }

    /* staff rows */
    .ac-staff { display:flex; gap:12px; align-items:center; padding:12px 2px; border-bottom:1px solid var(--n-200); }
    .ac-staff:last-child { border-bottom:0; }
    .ac-staff .av { width:34px; height:34px; border-radius:50%; flex-shrink:0; display:flex; align-items:center;
      justify-content:center; background:linear-gradient(135deg,var(--atlas),var(--riad)); color:#fff;
      font-size:12px; font-weight:600; }
    .ac-staff .who { flex:1; min-width:0; }
    .ac-staff .who .n { font-size:13px; font-weight:500; color:var(--ink); }
    .ac-staff .who .p { font-size:11.5px; color:var(--n-500); margin-top:1px; }
    .ac-staff .pay { text-align:end; white-space:nowrap; }
    .ac-staff .pay .net { font-size:13.5px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
    .ac-staff .pay .brut { font-size:11px; color:var(--n-500); margin-top:1px; }

    /* insight + actions */
    .ac-insight { margin-top:14px; padding:13px 15px; background:var(--atlas); color:var(--paper);
      border-radius:13px; font-size:12.5px; line-height:1.5; display:flex; gap:10px; }
    .ac-insight svg { width:16px; height:16px; color:var(--mint); flex-shrink:0; margin-top:2px; }
    .ac-acts { display:flex; flex-wrap:wrap; gap:9px; margin-top:16px; }
    .ac-btn { font-size:12.5px; font-weight:600; padding:11px 16px; border-radius:11px; cursor:pointer;
      border:1px solid var(--n-300); background:var(--surface); color:var(--ink); transition: transform 140ms var(--ac-ease), opacity 140ms var(--ac-ease), background-color 140ms var(--ac-ease), border-color 140ms var(--ac-ease), color 140ms var(--ac-ease), box-shadow 140ms var(--ac-ease); }
    .ac-btn:hover { border-color:var(--n-400); }
    .ac-btn:active { transform:scale(.97); }
    .ac-btn.primary { background:var(--atlas); border-color:var(--atlas); color:#fff; }
    .ac-btn.primary:hover { background:var(--riad); }

    .ac-section-h { font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
      color:var(--n-500); margin:22px 0 9px; }
    .ac-section-h:first-child { margin-top:0; }
    `;
    document.head.appendChild(s);
  }

  /* ═══════════════ ICONS ═══════════════ */
  const I = {
    livre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z"/><path d="M9 3v18M19 7H9M19 12H9"/></svg>',
    etats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><rect x="7" y="11" width="3.4" height="7"/><rect x="13" y="6" width="3.4" height="12"/></svg>',
    tva: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 7h7M9 12h7M9 17h4"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
    paie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.6l2.55 6.86 6.85 2.54-6.85 2.55L12 22.4l-2.55-6.85L2.6 13l6.85-2.54z"/></svg>',
    chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 13l4 4L19 7"/></svg>',
  };

  /* ═══════════════ TAB RENDERERS ═══════════════ */

  function renderApercu() {
    const period = tl(ACCT.period);
    const mod = (tab, ico, name, val, sub) =>
      `<button class="ac-mod" data-ac-goto="${tab}">
        <div class="ac-mod-ico">${ico}</div>
        <div class="ac-mod-n">${name}</div>
        <div class="ac-mod-v">${val}</div>
        <div class="ac-mod-s">${sub}</div>
      </button>`;
    const todo = (tab, l, s) =>
      `<button class="ac-todo" data-ac-goto="${tab}">
        <span class="dot"></span>
        <span class="tx"><span class="l">${l}</span><span class="s">${s}</span></span>
        <span class="go">${I.chev}</span>
      </button>`;
    return `
      <div class="ac-banner">
        ${I.spark}
        <div>
          <b>${t('banWho', { p: period })}</b>
          <div class="s">${t('banBody', { n: fmt(ACCT.entriesThisMonth) })}</div>
        </div>
      </div>
      <div class="ac-mods">
        ${mod('livre', I.livre, t('modLivreN'), fmt(ACCT.entriesThisMonth), t('modLivreS'))}
        ${mod('etats', I.etats, t('modEtatsN'), fmtMad(ACCT.netProfit), t('modEtatsS'))}
        ${mod('tva', I.tva, t('modTvaN'), fmtMad(ACCT.tva.aPayer), t('modTvaS', { d: tl(ACCT.tva.echeance) }))}
        ${mod('paie', I.paie, t('modPaieN'), t('modPaieV', { n: ACCT.payroll.headcount }), t('modPaieS'))}
      </div>
      <div class="ac-section-h">${t('secValider')}</div>
      ${todo('tva', t('todoTvaL', { p: period }), t('todoTvaS', { mad: fmtMad(ACCT.tva.aPayer), d: tl(ACCT.tva.echeance) }))}
      ${todo('paie', t('todoPaieL', { p: period }), t('todoPaieS', { n: ACCT.payroll.headcount, mad: fmtMad(ACCT.payroll.totalNet) }))}
      ${todo('etats', t('todoClotL', { p: period }), t('todoClotS'))}
      <div class="ac-insight">${I.spark}<div><b style="color:var(--mint);">${t('aiPrefix')}</b> ${t('apercuInsight')}</div></div>
    `;
  }

  function renderLivre() {
    const period = tl(ACCT.period);
    const catMax = Math.max(...ACCT.ledgerCats.map((c) => c[1]));
    const bars = ACCT.ledgerCats.map(([k, v, type]) => `
      <div class="ac-bar">
        <div class="ac-bar-h"><span class="k">${tl(k)}</span><span class="v">${fmtMad(v)}</span></div>
        <div class="ac-bar-t"><div class="ac-bar-f" style="width:${(v / catMax * 100).toFixed(1)}%;background:${type === 'credit' ? 'var(--atlas)' : '#9aa6a0'};"></div></div>
      </div>`).join('');
    const feed = ACCT.ledger.map(([d, lib, cat, type, amt]) => `
      <div class="ac-led">
        <span class="d">${tl(d)}</span>
        <span class="m"><span class="lib">${tl(lib)}</span><span class="cat">${tl(cat)}</span></span>
        <span class="amt ${type}">${type === 'credit' ? '+' : '−'} ${fmt(amt)}</span>
      </div>`).join('');
    return `
      <div class="ac-eyebrow">${t('eyebrowLivre')}</div>
      <div class="ac-h">${t('hLivre', { p: period })}</div>
      <div class="ac-sub">${t('subLivre')}</div>
      <div class="ac-card" style="margin-top:16px;">
        <div class="ac-card-t"><span>${t('cardRepartition')}</span><span>${t('nEcritures', { n: fmt(ACCT.entriesThisMonth) })}</span></div>
        ${bars}
      </div>
      <div class="ac-card">
        <div class="ac-card-t"><span>${t('cardRecent')}</span><span style="color:var(--atlas);">${t('auto100')}</span></div>
        <div class="ac-card-s">${t('cardRecentS')}</div>
        <div style="margin-top:8px;">${feed}</div>
      </div>
      <div class="ac-acts">
        <button class="ac-btn primary" data-ac-act="export-livre">${t('actExportLivre')}</button>
        <button class="ac-btn" data-ac-act="reconcile">${t('actReconcile')}</button>
      </div>
    `;
  }

  function renderEtats() {
    const period = tl(ACCT.period);
    const gross = ACCT.revenue - ACCT.cogs;
    const opexLines = ACCT.opex.map(([k, v]) =>
      `<div class="ac-row neg"><span class="k">${tl(k)}</span><span class="v">− ${fmt(v)}</span></div>`).join('');
    const actif = ACCT.bilan.actif.map(([k, v]) => `<div class="ac-row"><span class="k">${tl(k)}</span><span class="v">${fmt(v)}</span></div>`).join('');
    const passif = ACCT.bilan.passif.map(([k, v]) => `<div class="ac-row"><span class="k">${tl(k)}</span><span class="v">${fmt(v)}</span></div>`).join('');
    const totActif = sum(ACCT.bilan.actif, 1), totPassif = sum(ACCT.bilan.passif, 1);
    const f = ACCT.flux;
    return `
      <div class="ac-eyebrow">${t('eyebrowEtats')}</div>
      <div class="ac-h">${t('hEtats', { p: period })}</div>
      <div class="ac-sub">${t('subEtats')}</div>

      <div class="ac-section-h">${t('secResultat')}</div>
      <div class="ac-card">
        <div class="ac-row"><span class="k">${t('rowCA')}</span><span class="v">${fmt(ACCT.revenue)}</span></div>
        <div class="ac-row neg"><span class="k">${t('rowCogs')}</span><span class="v">− ${fmt(ACCT.cogs)}</span></div>
        <div class="ac-row"><span class="k"><b>${t('rowMargeBrute')}</b></span><span class="v">${fmt(gross)}</span></div>
        ${opexLines}
        <div class="ac-row total"><span class="k">${t('rowResultatNet')}</span><span class="v">${fmtMad(ACCT.netProfit)}</span></div>
      </div>

      <div class="ac-section-h">${t('secBilan')}</div>
      <div class="ac-card">
        <div class="ac-card-t"><span>${t('rowActif')}</span><span>${fmtMad(totActif)}</span></div>
        <div style="margin-top:4px;">${actif}</div>
      </div>
      <div class="ac-card">
        <div class="ac-card-t"><span>${t('rowPassif')}</span><span>${fmtMad(totPassif)}</span></div>
        <div style="margin-top:4px;">${passif}</div>
      </div>

      <div class="ac-section-h">${t('secTreso', { p: period })}</div>
      <div class="ac-card">
        <div class="ac-row"><span class="k">${t('rowSoldeInitial')}</span><span class="v">${fmt(f.initial)}</span></div>
        <div class="ac-row"><span class="k">${t('rowEncaissements')}</span><span class="v" style="color:var(--atlas);">+ ${fmt(f.encaissements)}</span></div>
        <div class="ac-row neg"><span class="k">${t('rowDecaissements')}</span><span class="v">− ${fmt(f.decaissements)}</span></div>
        <div class="ac-row total"><span class="k">${t('rowTresoDispo')}</span><span class="v">${fmtMad(f.final)}</span></div>
      </div>
      <div class="ac-acts">
        <button class="ac-btn primary" data-ac-act="cloture">${t('actCloture')}</button>
        <button class="ac-btn" data-ac-act="export-etats">${t('actExportEtats')}</button>
      </div>
    `;
  }

  function renderTva() {
    const period = tl(ACCT.period);
    const tva = ACCT.tva, is = ACCT.is;
    const cal = ACCT.calendar.map((c) => `
      <div class="ac-cal">
        <span class="ac-cal-tag">${c.tag}</span>
        <span class="ac-cal-m"><span class="l">${tl(c.label)}</span><span class="d">${t('echeanceX', { d: tl(c.date) })}</span></span>
        <span class="ac-cal-r">
          <span class="a">${c.montant != null ? fmtMad(c.montant) : '—'}</span>
          <span class="st ${c.status === 'à faire' ? 'todo' : 'soon'}">${c.status === 'à faire' ? t('stTodo') : t('stSoon')}</span>
        </span>
      </div>`).join('');
    return `
      <div class="ac-eyebrow">${t('eyebrowTva')}</div>
      <div class="ac-h">${t('hTva', { p: period })}</div>
      <div class="ac-sub">${t('subTva')}</div>

      <div class="ac-card" style="margin-top:16px;">
        <div class="ac-card-t"><span>${t('tvaCardT', { p: period })}</span><span style="color:var(--warn-ink);">${t('echeanceX', { d: tl(tva.echeance) })}</span></div>
        <div class="ac-card-s">${tl(tva.regime)} · ${tl(tva.taux)}</div>
        <div class="ac-trio">
          <div class="t"><div class="l">${t('trioCollectee')}</div><div class="n">${fmt(tva.collectee)}</div></div>
          <div class="t"><div class="l">${t('trioDeductible')}</div><div class="n">${fmt(tva.deductible)}</div></div>
          <div class="t hl"><div class="l">${t('trioAPayer')}</div><div class="n">${fmt(tva.aPayer)}</div></div>
        </div>
      </div>

      <div class="ac-card">
        <div class="ac-card-t"><span>${t('isCardT')}</span><span>${t('isTaux', { x: is.taux })}</span></div>
        <div class="ac-row"><span class="k">${t('rowResImposable')}</span><span class="v">${fmt(is.resultatImposable)}</span></div>
        <div class="ac-row"><span class="k">${t('rowIsEstime')}</span><span class="v">${fmtMad(is.estimeAnnuel)}</span></div>
        <div class="ac-row"><span class="k">${tl(is.acompte.label)}<small>${tl(is.acompte.date)}</small></span><span class="v">${fmtMad(is.acompte.montant)}</span></div>
      </div>

      <div class="ac-section-h">${t('secCalendrier')}</div>
      <div class="ac-card">${cal}</div>

      <div class="ac-insight">${I.spark}<div><b style="color:var(--mint);">${t('aiPrefix')}</b> ${t('tvaInsight', { p: period })}</div></div>
      <div class="ac-acts">
        <button class="ac-btn primary" data-ac-act="prep-tva">${t('actPrepTva')}</button>
        <button class="ac-btn" data-ac-act="export-tva">${t('actExportTva')}</button>
      </div>
    `;
  }

  function renderPaie() {
    const period = tl(ACCT.period);
    const p = ACCT.payroll;
    const staff = p.staff.map(([n, poste, brut, net]) => {
      const ini = n.split(' ').map((w) => w[0]).join('').slice(0, 2);
      return `<div class="ac-staff">
        <span class="av">${ini}</span>
        <span class="who"><span class="n">${n}</span><span class="p">${tl(poste)}</span></span>
        <span class="pay"><span class="net">${fmtMad(net)}</span><span class="brut">${t('brutX', { x: fmt(brut) })}</span></span>
      </div>`;
    }).join('');
    return `
      <div class="ac-eyebrow">${t('eyebrowPaie')}</div>
      <div class="ac-h">${t('hPaie', { p: period })}</div>
      <div class="ac-sub">${t('subPaie', { n: p.headcount, mad: fmtMad(p.masseSalariale) })}</div>

      <div class="ac-card" style="margin-top:16px;">
        <div class="ac-card-t"><span>${t('paieCardT')}</span><span style="color:var(--warn-ink);">${t('aValider')}</span></div>
        <div class="ac-card-s">${t('paieCardS')}</div>
        <div class="ac-row"><span class="k">${t('rowTotalBrut')}</span><span class="v">${fmt(p.totalBrut)}</span></div>
        <div class="ac-row neg"><span class="k">${t('rowCnssSal')}</span><span class="v">− ${fmt(p.cnssSalarie)}</span></div>
        <div class="ac-row neg"><span class="k">${t('rowIR')}</span><span class="v">− ${fmt(p.ir)}</span></div>
        <div class="ac-row total"><span class="k">${t('rowNetVerser')}</span><span class="v">${fmtMad(p.totalNet)}</span></div>
        <div class="ac-row" style="border-top:1px solid var(--n-200);margin-top:6px;"><span class="k">${t('rowCnssEmp')}</span><span class="v">${fmt(p.cnssEmployeur)}</span></div>
      </div>

      <div class="ac-card">
        <div class="ac-card-t"><span>${t('cardSalaries')}</span><span>${t('nPersonnes', { n: p.headcount })}</span></div>
        <div style="margin-top:6px;">${staff}</div>
      </div>

      <div class="ac-insight">${I.spark}<div><b style="color:var(--mint);">${t('aiPrefix')}</b> ${t('paieInsight', { p: period, mad: fmtMad(p.cnssEmployeur + p.cnssSalarie), d: tl(p.echeance) })}</div></div>
      <div class="ac-acts">
        <button class="ac-btn primary" data-ac-act="gen-paie">${t('actGenPaie', { n: p.headcount })}</button>
        <button class="ac-btn" data-ac-act="decl-cnss">${t('actDeclCnss')}</button>
      </div>
    `;
  }

  /* tab id · STR label key · renderer */
  const TABS = [
    ['apercu', 'tabApercu', renderApercu],
    ['livre', 'tabLivre', renderLivre],
    ['etats', 'tabEtats', renderEtats],
    ['tva', 'tabTva', renderTva],
    ['paie', 'tabPaie', renderPaie],
  ];

  /* ═══════════════ OPEN ═══════════════ */
  let openState = null;   /* { root, tab } while the drawer is on screen */

  function buildAc() {
    return `
      <div class="ac">
        <div class="ac-tabs" data-ac-tabs>
          ${TABS.map(([id, labelKey], i) => `<button class="ac-tab${i === 0 ? ' on' : ''}" data-ac-tab="${id}">${t(labelKey)}</button>`).join('')}
        </div>
        <div class="ac-body" data-ac-body>
          ${TABS.map(([id, , render], i) => `<section class="ac-panel" data-ac-panel="${id}"${i === 0 ? '' : ' hidden'}>${render()}</section>`).join('')}
        </div>
      </div>`;
  }

  function activate(root, id) {
    root.querySelectorAll('.ac-tab').forEach((tb) => tb.classList.toggle('on', tb.dataset.acTab === id));
    root.querySelectorAll('[data-ac-panel]').forEach((p) => { p.hidden = p.dataset.acPanel !== id; });
    const panel = root.querySelector(`[data-ac-panel="${id}"]`);
    if (panel) { panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = ''; }
    const bodyEl = root.querySelector('[data-ac-body]');
    if (bodyEl) bodyEl.scrollTop = 0;
    if (openState) openState.tab = id;
  }

  /* This whole module is the Café Atlas demo book (no per-venue data). For a REAL
   * session — a hosted domain, a signed-in merchant, an operator scoped into a
   * client, or a custom venue — none of these fabricated figures / staff /
   * suppliers may show. Render an honest "your books start empty" state instead.
   * The local pitch demo (localhost + a demo venue, no KiwiMe) is untouched. */
  function showReal() {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom()) return true;
    } catch (_) {}
    return false;
  }
  function buildEmpty() {
    const c = ({
      fr: { h: 'Votre comptabilité est prête', p: 'Dès vos premières ventes et dépenses, Kiwi tient vos livres, prépare vos déclarations TVA et vos fiches de paie, automatiquement.' },
      en: { h: 'Your accounting is ready', p: 'As soon as you record sales and expenses, Kiwi keeps your books and prepares your VAT returns and payslips, automatically.' },
      ar: { h: 'محاسبتك جاهزة', p: 'بمجرد تسجيل مبيعاتك ومصاريفك، يمسك Kiwi دفاترك ويُعدّ تصاريح الضريبة وكشوف الأجور تلقائيًا.' },
    })[lang] || null;
    const v = c || { h: 'Your accounting is ready', p: '' };
    return `<div class="ac" style="padding:52px 24px;text-align:center;max-width:520px;margin:0 auto;">
      <div style="font-size:17px;font-weight:640;letter-spacing:-.01em;margin-bottom:8px;">${v.h}</div>
      <div style="font-size:13.5px;color:var(--n-500);line-height:1.6;">${v.p}</div>
    </div>`;
  }

  function open(tab) {
    const Kiwi = window.Kiwi;
    if (!Kiwi || !Kiwi.drawer) return;
    injectCss();
    lang = getLang();   /* always render in the current language */
    const real = showReal();

    const res = Kiwi.drawer({
      title: t('drawerTitle'),
      subtitle: t('drawerSub'),
      body: real ? buildEmpty() : buildAc(),
      fullpage: true,
    });
    res.el.classList.add('ac-drawer');
    const root = res.el;
    openState = { root, tab: tab && tab !== 'apercu' ? tab : 'apercu' };

    root.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-ac-tab]');
      if (tb) { activate(root, tb.dataset.acTab); return; }
      const goto = e.target.closest('[data-ac-goto]');
      if (goto) { activate(root, goto.dataset.acGoto); return; }
      const act = e.target.closest('[data-ac-act]');
      if (act) {
        const pack = TOASTS[lang] || TOASTS.fr;
        const arr = pack[act.dataset.acAct];
        if (arr && Kiwi.toast) {
          Kiwi.toast(fill(arr[0], { n: ACCT.payroll.headcount }), { type: 'success', desc: arr[1] });
        }
        return;
      }
    });

    if (openState.tab !== 'apercu') activate(root, openState.tab);
  }

  /* ─────────────── LIVE RE-LOCALISE ───────────────
   * When KiwiI18n.setLang fires while the drawer is open, rebuild it in
   * place — head, tab strip and every panel — keeping the active tab. */
  function relocalize() {
    lang = getLang();
    if (!openState || !openState.root || !openState.root.isConnected) { openState = null; return; }
    const root = openState.root, keepTab = openState.tab;
    const h3 = root.querySelector('.kiwi-drawer-head h3');
    const p = root.querySelector('.kiwi-drawer-head p');
    if (h3) h3.textContent = t('drawerTitle');
    if (p) p.textContent = t('drawerSub');
    const ac = root.querySelector('.ac');
    if (ac && ac.parentNode) {
      const parent = ac.parentNode;
      ac.remove();
      parent.insertAdjacentHTML('beforeend', showReal() ? buildEmpty() : buildAc());
      activate(root, keepTab);
    }
  }

  function hookI18n() {
    const api = window.KiwiI18n;
    if (!api || typeof api.setLang !== 'function' || api.__acWrapped) return;
    const orig = api.setLang;
    api.setLang = function () {
      const r = orig.apply(this, arguments);
      try { relocalize(); } catch (_) {}
      return r;
    };
    api.__acWrapped = true;
  }

  /* ─────────────── REGISTER ─────────────── */
  function register() {
    if (!window.Kiwi || !window.Kiwi.handlers) { setTimeout(register, 80); return; }
    const h = window.Kiwi.handlers;
    h['open-comptabilite'] = () => open('apercu');
    h['acct-livre'] = () => open('livre');
    h['acct-etats'] = () => open('etats');
    h['acct-tva']  = () => open('tva');
    h['acct-paie'] = () => open('paie');
    window.KiwiComptable = { open, data: ACCT };
    hookI18n();
  }
  register();
})();
