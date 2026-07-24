/* ═══════════════════════════════════════════════════════════════════════
 * Kiwi · assets/conformite.js
 * ───────────────────────────────────────────────────────────────────────
 * Full-page Conformité & registres — the manager's audit trail.
 *
 *   Tab 1 · Clôture (Z report) · end-of-day cash reconciliation,
 *           denomination grid, variance capture, Z history.
 *   Tab 2 · Hygiène & HACCP · daily / weekly / monthly checklists,
 *           timestamp + initials trail, auditor export.
 *   Tab 3 · Équipements · maintenance register, service history,
 *           overdue alerts (fryer / hood / fridge filters / extinguishers).
 *   Tab 4 · Documents · file vault — permits, certifications, contracts,
 *           expiry alerts, search.
 *
 * Same body.page-X visibility-gate pattern as stock.js / finance.js. Rewires
 * the existing handlers['nav-conformite'] (which previously opened the
 * banking-themed BAM/PCI compliance drawer) to this restaurant-grade
 * operational compliance page.
 *
 * In-memory state only — every interaction resets on refresh.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────── i18n ─────────────────────────── */
  const STR = {
    fr: {
      breadcrumb: 'Conformité & registres',
      pageTitle: 'Conformité & registres',
      pageSub: (n) => `${n} · journal d'audit complet`,
      tabZ:  'Clôture (Z)',
      tabHyg: 'Hygiène & HACCP',
      tabEq: 'Équipements',
      tabDoc: 'Documents',
      /* Z report */
      zHeader: 'Caisse du jour',
      zUpdated: (h) => `Compteurs en direct · ${h}`,
      zCashSales: 'Ventes espèces',
      zCardSales: 'Ventes cartes',
      zTrSales: 'Ticket restaurant',
      zTipsCash: 'Pourboires espèces',
      zWithdrawals: 'Retraits / dépenses',
      zExpectedCash: 'Caisse théorique',
      zCount: 'Comptage physique',
      zCountSub: 'Comptez la caisse · entrez chaque coupure',
      zBills: 'Billets',
      zCoins: 'Pièces',
      zTotalCounted: 'Total compté',
      zVariance: 'Écart',
      zVarianceOk: 'écart acceptable',
      zVarianceWarn: 'écart à expliquer',
      zVarianceBad: 'écart majeur, vérifier maintenant',
      zReasonPlaceholder: 'Cause de l\'écart (oubli ticket, rendu monnaie erroné, ...)',
      zClose: 'Clôturer la journée → générer le Z',
      zCloseLocked: '✓ Journée clôturée · Z imprimé',
      zCloseToast: (n) => `Z #${n} archivé · transmis au comptable`,
      zHistory: 'Historique des Z',
      zHCol1: 'Date',
      zHCol2: 'Z°',
      zHCol3: 'CA total',
      zHCol4: 'Écart',
      zHCol5: 'Caissier',
      zHRow: (zNum) => `Voir Z #${zNum}`,
      /* Hygiène */
      hygHeader: 'Checklists hygiène & HACCP',
      hygCompletion: (done, total) => `${done} / ${total} tâches faites aujourd'hui`,
      hygCadence: { daily: 'Quotidien', weekly: 'Hebdomadaire', monthly: 'Mensuel' },
      hygSection: { open: 'Ouverture', mid: 'Mi-service', close: 'Fermeture', deep: 'Nettoyage profond', audit: 'Audit & sécurité' },
      hygDoneBy: (who, h) => `${who} · ${h}`,
      hygNotDone: 'En attente',
      hygAuditExport: 'Générer rapport d\'inspection (30 j)',
      hygAuditToast: 'Rapport d\'inspection prêt, PDF envoyé au cabinet',
      hygHaccp: 'HACCP · températures',
      hygHaccpSub: 'Relevés frigos & bains-marie',
      hygTempOk: 'normal',
      hygTempWarn: 'limite',
      hygTempBad: 'hors plage',
      /* Équipements */
      eqHeader: 'Registre équipements',
      eqSub: 'Maintenance suivie · prochain entretien anticipé',
      eqCol1: 'Équipement',
      eqCol2: 'Type',
      eqCol3: 'Dernier entretien',
      eqCol4: 'Prochain',
      eqCol5: 'Statut',
      eqHistDate: 'Date', eqHistWhat: 'Intervention', eqHistTech: 'Technicien', eqHistCost: 'Coût',
      eqVendor: 'Fournisseur', eqCadence: 'cadence',
      eqStatOk: 'à jour',
      eqStatDue: 'bientôt',
      eqStatLate: 'en retard',
      eqAddIntervention: '+ Nouvelle intervention',
      eqAddToast: 'Intervention enregistrée · planning mis à jour',
      eqOverdueAlert: (n) => `<b>${n}</b> équipement${n > 1 ? 's' : ''} ${n > 1 ? 'sont' : 'est'} en retard d'entretien, risque sécurité.`,
      eqDetailTitle: (n) => `Historique · ${n}`,
      eqDetailEmpty: 'Aucune intervention enregistrée.',
      eqClose: 'Fermer',
      /* Documents */
      docHeader: 'Coffre documents',
      docSub: 'Permis, certifications, contrats · alertes d\'expiration auto',
      docExpiringAlert: (n) => `<b>${n}</b> document${n > 1 ? 's' : ''} expire${n > 1 ? 'nt' : ''} dans les 90 prochains jours, pensez à renouveler.`,
      docSearch: 'Rechercher un document…',
      docCats: { all: 'Tous', permit: 'Permis', cert: 'Certifications', supplier: 'Contrats fournisseurs', employee: 'Contrats employés', insurance: 'Assurances', hygiene: 'Hygiène', invoice: 'Factures' },
      docUpload: '+ Téléverser',
      docUploadToast: 'Téléversement simulé · catégorie à confirmer',
      docExpStatus: { ok: 'valide', soon: 'à renouveler', expired: 'expiré' },
      docExpiresIn: (n) => n < 0 ? `expiré depuis ${-n} j` : n < 30 ? `expire dans ${n} j` : `expire dans ${n} j`,
      docOpen: 'Aperçu',
      docDownload: 'Télécharger',
      docReplace: 'Remplacer',
      docDelete: 'Supprimer',
      docEmpty: 'Aucun document pour ce filtre.',
    },
    en: {
      breadcrumb: 'Compliance & records',
      pageTitle: 'Compliance & records',
      pageSub: (n) => `${n} · full audit trail`,
      tabZ:  'Cash close (Z)',
      tabHyg: 'Hygiene & HACCP',
      tabEq: 'Equipment',
      tabDoc: 'Documents',
      zHeader: 'Today\'s register',
      zUpdated: (h) => `Live counters · ${h}`,
      zCashSales: 'Cash sales',
      zCardSales: 'Card sales',
      zTrSales: 'Meal vouchers',
      zTipsCash: 'Cash tips',
      zWithdrawals: 'Withdrawals / expenses',
      zExpectedCash: 'Expected cash',
      zCount: 'Physical count',
      zCountSub: 'Count the drawer · enter each denomination',
      zBills: 'Bills',
      zCoins: 'Coins',
      zTotalCounted: 'Total counted',
      zVariance: 'Variance',
      zVarianceOk: 'acceptable',
      zVarianceWarn: 'needs explaining',
      zVarianceBad: 'major variance, verify now',
      zReasonPlaceholder: 'Reason for variance (missed receipt, wrong change, ...)',
      zClose: 'Close the day → generate Z',
      zCloseLocked: '✓ Day closed · Z printed',
      zCloseToast: (n) => `Z #${n} archived · sent to accountant`,
      zHistory: 'Z history',
      zHCol1: 'Date', zHCol2: 'Z°', zHCol3: 'Total revenue', zHCol4: 'Variance', zHCol5: 'Cashier',
      zHRow: (zNum) => `View Z #${zNum}`,
      hygHeader: 'Hygiene & HACCP checklists',
      hygCompletion: (done, total) => `${done} / ${total} tasks completed today`,
      hygCadence: { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' },
      hygSection: { open: 'Opening', mid: 'Mid-service', close: 'Closing', deep: 'Deep clean', audit: 'Audit & safety' },
      hygDoneBy: (who, h) => `${who} · ${h}`,
      hygNotDone: 'Pending',
      hygAuditExport: 'Generate inspection report (30 d)',
      hygAuditToast: 'Inspection report ready, PDF sent to firm',
      hygHaccp: 'HACCP · temperatures',
      hygHaccpSub: 'Fridge & bain-marie readings',
      hygTempOk: 'normal', hygTempWarn: 'borderline', hygTempBad: 'out of range',
      eqHeader: 'Equipment register',
      eqSub: 'Maintenance tracked · next service forecast',
      eqCol1: 'Equipment', eqCol2: 'Type', eqCol3: 'Last serviced', eqCol4: 'Next due', eqCol5: 'Status',
      eqHistDate: 'Date', eqHistWhat: 'Intervention', eqHistTech: 'Technician', eqHistCost: 'Cost',
      eqVendor: 'Vendor', eqCadence: 'cadence',
      eqStatOk: 'on track', eqStatDue: 'soon', eqStatLate: 'overdue',
      eqAddIntervention: '+ New intervention',
      eqAddToast: 'Intervention logged · schedule updated',
      eqOverdueAlert: (n) => `<b>${n}</b> equipment item${n > 1 ? 's' : ''} ${n > 1 ? 'are' : 'is'} overdue, safety risk.`,
      eqDetailTitle: (n) => `History · ${n}`,
      eqDetailEmpty: 'No interventions logged yet.',
      eqClose: 'Close',
      docHeader: 'Document vault',
      docSub: 'Permits, certifications, contracts · auto expiry alerts',
      docExpiringAlert: (n) => `<b>${n}</b> document${n > 1 ? 's' : ''} expire${n > 1 ? '' : 's'} in the next 90 days, plan renewal.`,
      docSearch: 'Search a document…',
      docCats: { all: 'All', permit: 'Permits', cert: 'Certifications', supplier: 'Supplier contracts', employee: 'Employee contracts', insurance: 'Insurance', hygiene: 'Hygiene', invoice: 'Invoices' },
      docUpload: '+ Upload',
      docUploadToast: 'Upload simulated · category to confirm',
      docExpStatus: { ok: 'valid', soon: 'renew', expired: 'expired' },
      docExpiresIn: (n) => n < 0 ? `expired ${-n} d ago` : `expires in ${n} d`,
      docOpen: 'Preview', docDownload: 'Download', docReplace: 'Replace', docDelete: 'Delete',
      docEmpty: 'No documents for this filter.',
    },
    ar: {
      breadcrumb: 'الامتثال والسجلات',
      pageTitle: 'الامتثال والسجلات',
      pageSub: (n) => `${n} · مسار تدقيق كامل`,
      tabZ: 'إغلاق الصندوق (Z)',
      tabHyg: 'النظافة وHACCP',
      tabEq: 'التجهيزات',
      tabDoc: 'الوثائق',
      zHeader: 'سجل اليوم',
      zUpdated: (h) => `عدّادات مباشرة · ${h}`,
      zCashSales: 'مبيعات نقدية',
      zCardSales: 'مبيعات بطاقات',
      zTrSales: 'تذاكر مطعم',
      zTipsCash: 'بقشيش نقدي',
      zWithdrawals: 'سحوبات / مصاريف',
      zExpectedCash: 'النقد المتوقع',
      zCount: 'العد الفعلي',
      zCountSub: 'احسب الصندوق · أدخل كل فئة',
      zBills: 'أوراق',
      zCoins: 'قطع',
      zTotalCounted: 'المجموع المُحْتَسَب',
      zVariance: 'الفارق',
      zVarianceOk: 'مقبول',
      zVarianceWarn: 'يحتاج تبرير',
      zVarianceBad: 'فارق كبير، تحقق فورًا',
      zReasonPlaceholder: 'سبب الفارق...',
      zClose: 'إغلاق اليوم → توليد Z',
      zCloseLocked: '✓ اليوم مُغلَق · طُبع Z',
      zCloseToast: (n) => `Z رقم ${n} مؤرشَف · أُرسل للمحاسب`,
      zHistory: 'سجل Z',
      zHCol1: 'التاريخ', zHCol2: 'Z°', zHCol3: 'الإيرادات', zHCol4: 'الفارق', zHCol5: 'الصندوقي',
      zHRow: (zNum) => `عرض Z رقم ${zNum}`,
      hygHeader: 'قوائم النظافة وHACCP',
      hygCompletion: (done, total) => `${done} / ${total} مهام منجزة اليوم`,
      hygCadence: { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري' },
      hygSection: { open: 'الافتتاح', mid: 'منتصف الخدمة', close: 'الإغلاق', deep: 'تنظيف عميق', audit: 'تدقيق وسلامة' },
      hygDoneBy: (who, h) => `${who} · ${h}`,
      hygNotDone: 'في الانتظار',
      hygAuditExport: 'إنشاء تقرير تفتيش (30 يوم)',
      hygAuditToast: 'تقرير التفتيش جاهز، PDF أُرسل للمكتب',
      hygHaccp: 'HACCP · درجات الحرارة',
      hygHaccpSub: 'قراءات الثلاجات والبين-ماري',
      hygTempOk: 'طبيعي', hygTempWarn: 'حدّ', hygTempBad: 'خارج النطاق',
      eqHeader: 'سجل التجهيزات',
      eqSub: 'صيانة مُتابَعة · موعد الصيانة القادم',
      eqCol1: 'التجهيز', eqCol2: 'النوع', eqCol3: 'آخر صيانة', eqCol4: 'القادم', eqCol5: 'الحالة',
      eqHistDate: 'التاريخ', eqHistWhat: 'التدخل', eqHistTech: 'الفني', eqHistCost: 'التكلفة',
      eqVendor: 'المورّد', eqCadence: 'الوتيرة',
      eqStatOk: 'محدّث', eqStatDue: 'قريبًا', eqStatLate: 'متأخر',
      eqAddIntervention: '+ تدخل جديد',
      eqAddToast: 'تم تسجيل التدخل · تحديث الجدول',
      eqOverdueAlert: (n) => `<b>${n}</b> تجهيز متأخر، خطر سلامة.`,
      eqDetailTitle: (n) => `السجل · ${n}`,
      eqDetailEmpty: 'لا تدخلات مسجلة.',
      eqClose: 'إغلاق',
      docHeader: 'خزينة الوثائق',
      docSub: 'تراخيص، شهادات، عقود · تنبيهات انتهاء تلقائية',
      docExpiringAlert: (n) => `<b>${n}</b> وثيقة تنتهي خلال 90 يومًا، جدّد الآن.`,
      docSearch: 'ابحث عن وثيقة…',
      docCats: { all: 'الكل', permit: 'تراخيص', cert: 'شهادات', supplier: 'عقود موردين', employee: 'عقود موظفين', insurance: 'تأمينات', hygiene: 'نظافة', invoice: 'فواتير' },
      docUpload: '+ تحميل',
      docUploadToast: 'تم محاكاة التحميل · أكد الفئة',
      docExpStatus: { ok: 'صالحة', soon: 'جدد', expired: 'منتهية' },
      docExpiresIn: (n) => n < 0 ? `منتهية منذ ${-n} يوم` : `تنتهي خلال ${n} يوم`,
      docOpen: 'معاينة', docDownload: 'تحميل', docReplace: 'استبدال', docDelete: 'حذف',
      docEmpty: 'لا وثائق لهذا التصفية.',
    },
  };

  const lang = () => (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  /* Trilingual data labels (HACCP tasks + equipment names/types/cadences/
   * interventions). FR stays inline in the data; EN/AR come from this lookup
   * keyed by the exact French string (bulk-translated via gemini-flash-lite). */
  const CF_TR = {"Relever températures frigos (entre 0 et 4 °C)":{"en":"Check fridge temperatures (between 0 and 4 °C)","ar":"فحص درجات حرارة الثلاجات (بين 0 و 4 درجات مئوية)"},"Sols cuisine lavés + désinfectés":{"en":"Kitchen floors washed + disinfected","ar":"تنظيف وتطهير أرضيات المطبخ"},"Plans de travail désinfectés":{"en":"Work surfaces disinfected","ar":"تطهير أسطح العمل"},"Poubelles vidées + sacs neufs":{"en":"Bins emptied + new bags","ar":"إفراغ القمامة ووضع أكياس جديدة"},"Uniformes propres contrôlés équipe":{"en":"Team uniforms checked for cleanliness","ar":"فحص نظافة ملابس الفريق"},"Briefing lavage des mains équipe":{"en":"Team handwashing briefing","ar":"توجيه الفريق بشأن غسل اليدين"},"Rotation huile friture (>180 °C ?)":{"en":"Frying oil rotation (>180 °C ?)","ar":"تغيير زيت القلي (>180 درجة مئوية ؟)"},"Bain-marie au-dessus de 63 °C":{"en":"Bain-marie above 63 °C","ar":"الحمام المائي (بين-ماري) فوق 63 درجة مئوية"},"Contrôle stock frais (DLC, aspect)":{"en":"Fresh stock check (expiry, appearance)","ar":"فحص المخزون الطازج (تاريخ الصلاحية، المظهر)"},"Gants changés entre postes":{"en":"Gloves changed between stations","ar":"تغيير القفازات بين المهام"},"Friteuse vidée et nettoyée":{"en":"Fryer emptied and cleaned","ar":"إفراغ وتنظيف القلاية"},"Hotte dégraissée":{"en":"Hood degreased","ar":"إزالة الدهون من غطاء الشفط"},"Sols cuisine + salle lavés":{"en":"Kitchen + dining floors washed","ar":"تنظيف أرضيات المطبخ وصالة الطعام"},"Poubelles sorties":{"en":"Bins taken out","ar":"إخراج القمامة"},"Alarmes activées":{"en":"Alarms activated","ar":"تفعيل الإنذارات"},"Clés rangées au coffre":{"en":"Keys stored in safe","ar":"وضع المفاتيح في الخزنة"},"Vannes gaz fermées":{"en":"Gas valves closed","ar":"إغلاق صمامات الغاز"},"DLC contrôlées chambre froide":{"en":"Cold room expiry dates checked","ar":"التحقق من تواريخ صلاحية غرفة التبريد"},"Bacs à graisse vidés":{"en":"Grease traps emptied","ar":"إفراغ مصائد الدهون"},"Chambre froide vidée + désinfectée":{"en":"Cold room emptied + disinfected","ar":"إفراغ وتطهير غرفة التبريد"},"Friteuses démontées + huile changée":{"en":"Fryers disassembled + oil changed","ar":"فك وتنظيف القلايات وتغيير الزيت"},"Étagères stockage désinfectées":{"en":"Storage shelves disinfected","ar":"تطهير أرفف التخزين"},"Extincteurs contrôlés (date, pression)":{"en":"Fire extinguishers checked (date, pressure)","ar":"فحص طفايات الحريق (التاريخ، الضغط)"},"Passage entreprise désinsectisation":{"en":"Pest control visit","ar":"زيارة شركة مكافحة الحشرات"},"Traçabilité fournisseurs archivée":{"en":"Supplier traceability archived","ar":"أرشفة تتبع الموردين"},"Formation HACCP équipe à jour":{"en":"Team HACCP training up to date","ar":"تدريب الفريق على معايير HACCP محدث"},"Frigo cuisine 1":{"en":"Kitchen fridge 1","ar":"ثلاجة المطبخ 1"},"Frigo cuisine 2":{"en":"Kitchen fridge 2","ar":"ثلاجة المطبخ 2"},"Chambre froide":{"en":"Cold room","ar":"غرفة التبريد"},"Bain-marie":{"en":"Bain-marie","ar":"الحمام المائي"},"Salade bar froid":{"en":"Cold salad bar","ar":"بار السلطات البارد"},"Friteuse 1":{"en":"Fryer 1","ar":"قلاية 1"},"Friteuse 2":{"en":"Fryer 2","ar":"قلاية 2"},"Hotte aspirante":{"en":"Exhaust hood","ar":"غطاء الشفط"},"Frigo principal":{"en":"Main fridge","ar":"الثلاجة الرئيسية"},"Four électrique":{"en":"Electric oven","ar":"فرن كهربائي"},"Lave-vaisselle":{"en":"Dishwasher","ar":"غسالة الأطباق"},"Extincteurs ×6":{"en":"Fire extinguishers ×6","ar":"طفايات حريق ×6"},"Détecteur gaz":{"en":"Gas detector","ar":"كاشف الغاز"},"Vérif. installation élec.":{"en":"Elec. installation check","ar":"فحص التركيبات الكهربائية"},"TPV principal":{"en":"Main POS","ar":"نظام نقاط البيع الرئيسي"},"Caméras boutique ×4":{"en":"Shop cameras ×4","ar":"كاميرات المتجر ×4"},"Climatisation":{"en":"Air conditioning","ar":"تكييف الهواء"},"Extincteurs ×3":{"en":"Fire extinguishers ×3","ar":"طفايات حريق ×3"},"Jacuzzi hammam":{"en":"Hammam Jacuzzi","ar":"جاكوزي الحمام"},"Cabine sauna":{"en":"Sauna cabin","ar":"كابينة الساونا"},"Bassin thalasso":{"en":"Thalasso pool","ar":"مسبح العلاج بمياه البحر"},"Permis d\\":{"en":"Permit \\","ar":"تصريح \\"},"Patente fiscale 2026":{"en":"2026 Tax Patent","ar":"براءة الذمة الضريبية 2026"},"Licence débit de boissons":{"en":"Beverage license","ar":"رخصة المشروبات"},"Brevet food handler · Mohammed Karimi":{"en":"Food handler certificate · Mohammed Karimi","ar":"شهادة تداول الأغذية · محمد كريمي"},"Brevet food handler · Youssef Bennani":{"en":"Food handler certificate · Youssef Bennani","ar":"شهادة تداول الأغذية · يوسف بناني"},"Formation HACCP équipe (5 personnes)":{"en":"Team HACCP training (5 people)","ar":"تدريب الفريق على معايير HACCP (5 أشخاص)"},"Vérification Q18 électrique":{"en":"Electrical Q18 verification","ar":"فحص السلامة الكهربائية Q18"},"Contrat fournisseur viandes · Errazi":{"en":"Meat supplier contract · Errazi","ar":"عقد توريد اللحوم · الرازي"},"Contrat fournisseur poissons · Marché":{"en":"Fish supplier contract · Market","ar":"عقد توريد الأسماك · السوق"},"Contrat fournisseur laitier · Centrale Danone":{"en":"Dairy supplier contract · Centrale Danone","ar":"عقد توريد الألبان · سنطرال دانون"},"Contrat CDI · Sofia Belkadi":{"en":"Permanent contract (CDI) · Sofia Belkadi","ar":"عقد عمل دائم · صوفيا بلقادي"},"Contrat CDI · Mohammed Karimi":{"en":"Permanent contract (CDI) · Mohammed Karimi","ar":"عقد عمل دائم · محمد كريمي"},"Contrat CDD · Hamid Jelloul":{"en":"Fixed-term contract (CDD) · Hamid Jelloul","ar":"عقد عمل محدد المدة · حميد جلول"},"Assurance RC pro":{"en":"Professional liability insurance","ar":"التأمين ضد المسؤولية المهنية"},"Assurance multirisque locaux":{"en":"Multi-risk premises insurance","ar":"تأمين شامل للمباني"},"Rapport désinsectisation · mai 2026":{"en":"Pest control report · May 2026","ar":"تقرير مكافحة الحشرات · مايو 2026"},"Analyse eau potable laboratoire":{"en":"Laboratory drinking water analysis","ar":"تحليل مياه الشرب المخبري"},"Facture Liebherr SAV mai 2026":{"en":"Liebherr service invoice May 2026","ar":"فاتورة خدمة صيانة Liebherr مايو 2026"},"Permis enseigne boutique":{"en":"Shop sign permit","ar":"تصريح لوحة المتجر"},"Contrat CDI · Karima Idrissi":{"en":"Permanent contract (CDI) · Karima Idrissi","ar":"عقد عمل دائم · كريمة إدريسي"},"Assurance multirisque local":{"en":"Multi-risk premises insurance","ar":"تأمين شامل للمبنى"},"Assurance marchandises":{"en":"Merchandise insurance","ar":"تأمين البضائع"},"Licence spa & soins paramédicaux":{"en":"Spa & paramedical care license","ar":"رخصة سبا وعلاجات شبه طبية"},"Diplôme massothérapie · Imane Tazi":{"en":"Massage therapy diploma · Imane Tazi","ar":"شهادة العلاج بالتدليك · إيمان تازي"},"Analyses eau bassin (laboratoire)":{"en":"Pool water analysis (lab)","ar":"تحليل مياه المسبح (مخبري)"},"Assurance responsabilité civile pro":{"en":"Professional liability insurance","ar":"التأمين ضد المسؤولية المهنية"},"Cuisson":{"en":"Cooking","ar":"الطهي"},"Ventilation":{"en":"Ventilation","ar":"التهوية"},"Froid":{"en":"Refrigeration","ar":"تبريد"},"Plonge":{"en":"Dishwashing","ar":"غسيل الأطباق"},"Sécurité":{"en":"Safety","ar":"السلامة"},"Terminal":{"en":"Terminal","ar":"جهاز الدفع (Terminal)"},"Spa":{"en":"Spa","ar":"منتجع صحي (سبا)"},"success":{"en":"Success","ar":"نجاح"},"info":{"en":"Info","ar":"معلومات"},"hebdo":{"en":"Weekly","ar":"أسبوعي"},"mensuel":{"en":"Monthly","ar":"شهري"},"trimestriel":{"en":"Quarterly","ar":"فصلي"},"annuel":{"en":"Annual","ar":"سنوي"},"semestriel":{"en":"Biannual","ar":"نصف سنوي"},"bi-hebdo":{"en":"Twice-weekly","ar":"مرتين أسبوعياً"},"Vidange + nettoyage cuve":{"en":"Tank drain + cleaning","ar":"تفريغ وتنظيف الخزان"},"Dégraissage + filtre changé":{"en":"Degreasing + filter change","ar":"إزالة الدهون وتغيير الفلتر"},"Dégraissage":{"en":"Degreasing","ar":"إزالة الدهون"},"Contrôle thermostat + joints":{"en":"Thermostat + seal check","ar":"فحص منظم الحرارة والأختام"},"Détartrage + contrôle sondes":{"en":"Descaling + sensor check","ar":"إزالة الترسبات وفحص الحساسات"},"Détartrage + filtres":{"en":"Descaling + filters","ar":"إزالة الترسبات والفلاتر"},"Contrôle annuel obligatoire":{"en":"Mandatory annual check","ar":"الفحص السنوي الإلزامي"},"Calibration sondes":{"en":"Sensor calibration","ar":"معايرة الحساسات"},"Q18 obligatoire":{"en":"Mandatory Q18","ar":"Q18 إلزامي"}};
  const trD = (s) => { if (lang() === 'fr') return s; const v = CF_TR[s]; return (v && v[lang()]) || s; };
  const t = (k, ...args) => {
    const dict = STR[lang()] || STR.fr;
    const v = dict[k];
    if (typeof v === 'function') return v(...args);
    if (v && typeof v === 'object') return v;
    return v == null ? k : v;
  };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtMad = (n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} MAD`;
  const fmtMadSign = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} MAD`;

  /* ─────────── State ─────────── */
  let pageActive = false;
  let currentTab = 'z';
  let zClosed = false;
  let zReason = '';
  /* Counter state — bill/coin counts entered by the cashier. */
  const ZERO_COUNTS = { b200: 0, b100: 0, b50: 0, b20: 0, b10: 0, c10: 0, c5: 0, c2: 0, c1: 0, c050: 0 };
  let zCounts = { ...ZERO_COUNTS };
  /* Hygiène: which task ids are checked, with who/when meta. */
  let hygChecked = {};   // id -> { by, at }
  /* Conformité venue helpers. */
  const currentVenueId = () => (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'cafeAtlas';
  const venueName = (v) => (window.KiwiVenue && window.KiwiVenue.getVenueData?.(v))?.name || (cfShowReal(v) ? '' : 'Café Atlas');

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 1 · CLÔTURE (Z) — end-of-day cash reconciliation
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Per-venue today-snapshot for the Z. The opening cash and various sales
   * figures match the homepage demo's "Aujourd'hui" period. */
  const Z_DATA = {
    cafeAtlas: {
      cashSales: 8240, cardSales: 17850, trSales: 1420, tipsCash: 720, withdrawals: 600,
      cashier: 'Sofia Belkadi',
      cashierInit: 'SB',
    },
    maisonMansour: {
      cashSales: 4200, cardSales: 6840, trSales: 0, tipsCash: 0, withdrawals: 250,
      cashier: 'Karima Idrissi',
      cashierInit: 'KI',
    },
    spaBahia: {
      cashSales: 2100, cardSales: 6210, trSales: 0, tipsCash: 0, withdrawals: 180,
      cashier: 'Imane Tazi',
      cashierInit: 'IT',
    },
  };

  /* Denominations in MAD, in display order. */
  const DENOMS = [
    { id: 'b200', val: 200, kind: 'bill' },
    { id: 'b100', val: 100, kind: 'bill' },
    { id: 'b50',  val: 50,  kind: 'bill' },
    { id: 'b20',  val: 20,  kind: 'bill' },
    { id: 'b10',  val: 10,  kind: 'bill' },
    { id: 'c10',  val: 10,  kind: 'coin' },
    { id: 'c5',   val: 5,   kind: 'coin' },
    { id: 'c2',   val: 2,   kind: 'coin' },
    { id: 'c1',   val: 1,   kind: 'coin' },
    { id: 'c050', val: 0.5, kind: 'coin' },
  ];

  /* Z history mock (last 7 closures). */
  function zHistoryData(venueId) {
    return [
      { date: '02 juin 2026', zNum: 482, total: 27512, variance: -18,  cashier: 'Sofia Belkadi' },
      { date: '01 juin 2026', zNum: 481, total: 26980, variance: 0,    cashier: 'Hamid Jelloul' },
      { date: '31 mai 2026',  zNum: 480, total: 28760, variance: -42,  cashier: 'Sofia Belkadi' },
      { date: '30 mai 2026',  zNum: 479, total: 29110, variance: 15,   cashier: 'Sofia Belkadi' },
      { date: '29 mai 2026',  zNum: 478, total: 25640, variance: 0,    cashier: 'Hamid Jelloul' },
      { date: '28 mai 2026',  zNum: 477, total: 26310, variance: -8,   cashier: 'Sofia Belkadi' },
      { date: '27 mai 2026',  zNum: 476, total: 27240, variance: -22,  cashier: 'Sofia Belkadi' },
    ];
  }

  function zCountedTotal() {
    return DENOMS.reduce((sum, d) => sum + (zCounts[d.id] || 0) * d.val, 0);
  }
  function zExpectedCash(venueId) {
    const d = Z_DATA[venueId] || Z_DATA.cafeAtlas;
    /* Opening fund = 500 MAD, cash sales + cash tips, − cash withdrawals. */
    return 500 + d.cashSales + d.tipsCash - d.withdrawals;
  }
  function zVarianceSev(abs) { return abs <= 20 ? 'ok' : abs <= 60 ? 'warn' : 'bad'; }

  function zHtml() {
    const v = currentVenueId();
    const d = Z_DATA[v] || Z_DATA.cafeAtlas;
    const expected = zExpectedCash(v);
    const counted = zCountedTotal();
    const variance = counted - expected;
    const sev = zVarianceSev(Math.abs(variance));
    const sevLabel = sev === 'ok' ? t('zVarianceOk') : sev === 'warn' ? t('zVarianceWarn') : t('zVarianceBad');
    const totalSales = d.cashSales + d.cardSales + d.trSales;
    const now = new Date();
    const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    /* Counters card */
    const counterRow = (label, value) => `
      <div class="cf-z-counter">
        <span class="cf-z-counter-l">${esc(label)}</span>
        <span class="cf-z-counter-v">${fmtMad(value)}</span>
      </div>`;

    /* Denomination grid */
    const denomRows = DENOMS.map((dn) => {
      const subtotal = (zCounts[dn.id] || 0) * dn.val;
      const valLbl = dn.val < 1 ? `${dn.val * 100} c` : `${dn.val} MAD`;
      return `
        <div class="cf-z-denom" data-denom="${dn.id}">
          <span class="cf-z-denom-val">${esc(valLbl)}</span>
          <span class="cf-z-denom-x">×</span>
          <input type="number" class="cf-z-denom-input" data-cf-z-count="${dn.id}" min="0" value="${zCounts[dn.id] || 0}" inputmode="numeric" pattern="[0-9]*" oninput="window.KiwiConformite?.zCountHook?.(this)" ${zClosed ? 'disabled' : ''} />
          <span class="cf-z-denom-eq">=</span>
          <span class="cf-z-denom-sub">${fmtMad(subtotal)}</span>
        </div>`;
    }).join('');

    const reasonNeeded = Math.abs(variance) > 20;
    const reasonBlock = reasonNeeded && !zClosed ? `
      <div class="cf-z-reason">
        <label class="cf-z-reason-l">Cause de l'écart</label>
        <textarea class="cf-z-reason-input" data-cf-z-reason placeholder="${esc(t('zReasonPlaceholder'))}" rows="2" oninput="window.KiwiConformite?.zReasonHook?.(this)">${esc(zReason)}</textarea>
      </div>` : '';

    const history = zHistoryData(v).map((h) => `
      <div class="cf-z-hrow" data-action="cf-z-history" data-z="${h.zNum}">
        <span>${esc(h.date)}</span>
        <span class="cf-z-hnum">#${h.zNum}</span>
        <span class="cf-z-htotal">${fmtMad(h.total)}</span>
        <span class="cf-z-hvar cf-z-hvar-${zVarianceSev(Math.abs(h.variance))}">${h.variance === 0 ? '0' : fmtMadSign(h.variance)}</span>
        <span class="cf-z-hcashier">${esc(h.cashier)}</span>
      </div>`).join('');

    return `
      <div class="cf-z">
        <div class="cf-card">
          <div class="cf-eyebrow"><span>${esc(t('zHeader'))}</span><span class="cf-eyebrow-sub">${esc(t('zUpdated', hh))}</span></div>
          <div class="cf-z-counters">
            ${counterRow(t('zCashSales'), d.cashSales)}
            ${counterRow(t('zCardSales'), d.cardSales)}
            ${counterRow(t('zTrSales'), d.trSales)}
            ${counterRow(t('zTipsCash'), d.tipsCash)}
            ${counterRow(t('zWithdrawals'), -d.withdrawals)}
          </div>
          <div class="cf-z-expected">
            <span class="cf-z-expected-l">${esc(t('zExpectedCash'))}</span>
            <span class="cf-z-expected-v">${fmtMad(expected)}</span>
          </div>
        </div>

        <div class="cf-card">
          <div class="cf-eyebrow"><span>${esc(t('zCount'))}</span><span class="cf-eyebrow-sub">${esc(t('zCountSub'))}</span></div>
          <div class="cf-z-denoms">${denomRows}</div>
          <div class="cf-z-summary">
            <div class="cf-z-summary-row">
              <span class="cf-z-summary-l">${esc(t('zTotalCounted'))}</span>
              <span class="cf-z-summary-v">${fmtMad(counted)}</span>
            </div>
            <div class="cf-z-summary-row cf-z-summary-${sev}">
              <span class="cf-z-summary-l">${esc(t('zVariance'))}</span>
              <span class="cf-z-summary-v">${variance === 0 ? '0 MAD' : fmtMadSign(variance)} <small>· ${esc(sevLabel)}</small></span>
            </div>
          </div>
          ${reasonBlock}
          <div class="cf-z-close">
            ${zClosed
              ? `<button class="cf-z-close-btn locked" disabled>${esc(t('zCloseLocked'))}</button>`
              : `<button class="cf-z-close-btn" data-action="cf-z-close" ${reasonNeeded && !zReason.trim() ? 'disabled' : ''}>${esc(t('zClose'))}</button>`}
          </div>
        </div>

        <div class="cf-card">
          <div class="cf-eyebrow"><span>${esc(t('zHistory'))}</span></div>
          <div class="cf-z-history">
            <div class="cf-z-hhead">
              <span>${esc(t('zHCol1'))}</span>
              <span>${esc(t('zHCol2'))}</span>
              <span>${esc(t('zHCol3'))}</span>
              <span>${esc(t('zHCol4'))}</span>
              <span>${esc(t('zHCol5'))}</span>
            </div>
            ${history}
          </div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 2 · HYGIÈNE & HACCP
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Task templates by section + cadence. Each task has id, label, cadence,
   * section. Manager checks them off through the day. */
  const HYG_TASKS = [
    /* OUVERTURE */
    { id: 'open-temp', cadence: 'daily', section: 'open', label: 'Relever températures frigos (entre 0 et 4 °C)' },
    { id: 'open-floor', cadence: 'daily', section: 'open', label: 'Sols cuisine lavés + désinfectés' },
    { id: 'open-surf', cadence: 'daily', section: 'open', label: 'Plans de travail désinfectés' },
    { id: 'open-trash', cadence: 'daily', section: 'open', label: 'Poubelles vidées + sacs neufs' },
    { id: 'open-uniform', cadence: 'daily', section: 'open', label: 'Uniformes propres contrôlés équipe' },
    { id: 'open-hands', cadence: 'daily', section: 'open', label: 'Briefing lavage des mains équipe' },
    /* MI-SERVICE */
    { id: 'mid-oil', cadence: 'daily', section: 'mid', label: 'Rotation huile friture (>180 °C ?)' },
    { id: 'mid-bain', cadence: 'daily', section: 'mid', label: 'Bain-marie au-dessus de 63 °C' },
    { id: 'mid-fresh', cadence: 'daily', section: 'mid', label: 'Contrôle stock frais (DLC, aspect)' },
    { id: 'mid-gloves', cadence: 'daily', section: 'mid', label: 'Gants changés entre postes' },
    /* FERMETURE */
    { id: 'close-fryer', cadence: 'daily', section: 'close', label: 'Friteuse vidée et nettoyée' },
    { id: 'close-hood', cadence: 'daily', section: 'close', label: 'Hotte dégraissée' },
    { id: 'close-floor', cadence: 'daily', section: 'close', label: 'Sols cuisine + salle lavés' },
    { id: 'close-trash', cadence: 'daily', section: 'close', label: 'Poubelles sorties' },
    { id: 'close-alarms', cadence: 'daily', section: 'close', label: 'Alarmes activées' },
    { id: 'close-keys', cadence: 'daily', section: 'close', label: 'Clés rangées au coffre' },
    { id: 'close-gas', cadence: 'daily', section: 'close', label: 'Vannes gaz fermées' },
    { id: 'close-dlc', cadence: 'daily', section: 'close', label: 'DLC contrôlées chambre froide' },
    /* WEEKLY · NETTOYAGE PROFOND */
    { id: 'wk-grease', cadence: 'weekly', section: 'deep', label: 'Bacs à graisse vidés' },
    { id: 'wk-walkin', cadence: 'weekly', section: 'deep', label: 'Chambre froide vidée + désinfectée' },
    { id: 'wk-deepfryer', cadence: 'weekly', section: 'deep', label: 'Friteuses démontées + huile changée' },
    { id: 'wk-shelves', cadence: 'weekly', section: 'deep', label: 'Étagères stockage désinfectées' },
    /* MONTHLY · AUDIT & SÉCURITÉ */
    { id: 'mo-ext', cadence: 'monthly', section: 'audit', label: 'Extincteurs contrôlés (date, pression)' },
    { id: 'mo-pest', cadence: 'monthly', section: 'audit', label: 'Passage entreprise désinsectisation' },
    { id: 'mo-trace', cadence: 'monthly', section: 'audit', label: 'Traçabilité fournisseurs archivée' },
    { id: 'mo-formation', cadence: 'monthly', section: 'audit', label: 'Formation HACCP équipe à jour' },
  ];

  /* Pre-seed: ~12 out of 18 daily morning tasks done by 14:00 (demo). */
  function hygSeed() {
    if (Object.keys(hygChecked).length > 0) return;
    const morningDone = ['open-temp', 'open-floor', 'open-surf', 'open-trash', 'open-uniform', 'open-hands', 'mid-oil', 'mid-bain', 'mid-fresh', 'mid-gloves', 'wk-shelves', 'mo-trace'];
    const team = ['Mohammed K.', 'Youssef B.', 'Fatima Z.', 'Hamid J.', 'Sofia B.'];
    const times = ['08:14', '08:30', '08:42', '09:01', '09:15', '09:38', '10:12', '12:46', '13:02', '13:28', '11:40', '10:30'];
    morningDone.forEach((id, i) => {
      hygChecked[id] = { by: team[i % team.length], at: times[i] || '10:00' };
    });
  }

  /* Temperature readings (HACCP) — frigos + bain-marie. */
  const HYG_TEMPS = [
    { id: 'fr1', label: 'Frigo cuisine 1', target: '0 – 4 °C', value: 3.1, sev: 'ok' },
    { id: 'fr2', label: 'Frigo cuisine 2', target: '0 – 4 °C', value: 4.6, sev: 'warn' },
    { id: 'wlk', label: 'Chambre froide',  target: '−18 – −22 °C', value: -19.2, sev: 'ok' },
    { id: 'bm1', label: 'Bain-marie',       target: '> 63 °C', value: 68.0, sev: 'ok' },
    { id: 'bm2', label: 'Salade bar froid', target: '0 – 4 °C', value: 5.1, sev: 'warn' },
  ];

  function hygHtml() {
    hygSeed();
    const cadenceLabels = t('hygCadence');
    const sectionLabels = t('hygSection');
    const totalDaily = HYG_TASKS.filter((x) => x.cadence === 'daily').length;
    const doneDaily = HYG_TASKS.filter((x) => x.cadence === 'daily' && hygChecked[x.id]).length;

    const groupByCadenceSection = (cadence) => {
      const sections = {};
      HYG_TASKS.filter((tk) => tk.cadence === cadence).forEach((tk) => {
        (sections[tk.section] = sections[tk.section] || []).push(tk);
      });
      return sections;
    };

    const sectionHtml = (cadence) => {
      const groups = groupByCadenceSection(cadence);
      return Object.keys(groups).map((sec) => {
        const tasks = groups[sec];
        const rows = tasks.map((tk) => {
          const done = hygChecked[tk.id];
          return `
            <div class="cf-hyg-task${done ? ' is-done' : ''}" data-action="cf-hyg-toggle" data-task="${tk.id}">
              <span class="cf-hyg-check">${done ? '✓' : ''}</span>
              <span class="cf-hyg-label">${esc(trD(tk.label))}</span>
              <span class="cf-hyg-meta">${done ? esc(t('hygDoneBy', done.by, done.at)) : esc(t('hygNotDone'))}</span>
            </div>`;
        }).join('');
        return `
          <div class="cf-hyg-section">
            <div class="cf-hyg-section-h">${esc(sectionLabels[sec] || sec)}</div>
            <div class="cf-hyg-tasks">${rows}</div>
          </div>`;
      }).join('');
    };

    const tempRows = HYG_TEMPS.map((te) => `
      <div class="cf-hyg-trow">
        <span class="cf-hyg-tlabel">${esc(te.label)}</span>
        <span class="cf-hyg-ttarget">${esc(te.target)}</span>
        <span class="cf-hyg-tval cf-hyg-tval-${te.sev}">${te.value} °C</span>
        <span class="cf-hyg-tstat cf-hyg-tstat-${te.sev}">${esc(t(te.sev === 'ok' ? 'hygTempOk' : te.sev === 'warn' ? 'hygTempWarn' : 'hygTempBad'))}</span>
      </div>`).join('');

    return `
      <div class="cf-hyg">
        <div class="cf-card">
          <div class="cf-eyebrow"><span>${esc(t('hygHeader'))}</span><span class="cf-eyebrow-sub">${esc(t('hygCompletion', doneDaily, totalDaily))}</span></div>
          <div class="cf-hyg-cadence-h">${esc(cadenceLabels.daily)}</div>
          ${sectionHtml('daily')}
          <div class="cf-hyg-cadence-h">${esc(cadenceLabels.weekly)}</div>
          ${sectionHtml('weekly')}
          <div class="cf-hyg-cadence-h">${esc(cadenceLabels.monthly)}</div>
          ${sectionHtml('monthly')}
          <div class="cf-hyg-foot">
            <button class="cf-btn primary" data-action="cf-hyg-export">${esc(t('hygAuditExport'))}</button>
          </div>
        </div>

        <div class="cf-card">
          <div class="cf-eyebrow"><span>${esc(t('hygHaccp'))}</span><span class="cf-eyebrow-sub">${esc(t('hygHaccpSub'))}</span></div>
          <div class="cf-hyg-temps">${tempRows}</div>
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 3 · ÉQUIPEMENTS — maintenance register
   * ═══════════════════════════════════════════════════════════════════════ */

  const EQUIPMENT = {
    cafeAtlas: [
      { id: 'fry1', name: 'Friteuse 1', type: 'Cuisson', last: '2026-05-30', next: '2026-06-06', cadence: 'hebdo', vendor: 'Frima', history: [
        { date: '2026-05-30', tech: 'Mohammed K.', what: 'Vidange + nettoyage cuve', cost: 0 },
        { date: '2026-05-23', tech: 'Mohammed K.', what: 'Vidange + nettoyage cuve', cost: 0 },
        { date: '2026-05-16', tech: 'Mohammed K.', what: 'Vidange + nettoyage cuve', cost: 0 },
      ] },
      { id: 'fry2', name: 'Friteuse 2', type: 'Cuisson', last: '2026-05-23', next: '2026-05-30', cadence: 'hebdo', vendor: 'Frima', history: [
        { date: '2026-05-23', tech: 'Mohammed K.', what: 'Vidange + nettoyage cuve', cost: 0 },
      ] },
      { id: 'hood', name: 'Hotte aspirante', type: 'Ventilation', last: '2026-04-12', next: '2026-05-12', cadence: 'mensuel', vendor: 'CleanAir Maroc', history: [
        { date: '2026-04-12', tech: 'CleanAir Maroc', what: 'Dégraissage + filtre changé', cost: 850 },
        { date: '2026-03-10', tech: 'CleanAir Maroc', what: 'Dégraissage', cost: 480 },
      ] },
      { id: 'fridge', name: 'Frigo principal', type: 'Froid', last: '2026-05-15', next: '2026-08-15', cadence: 'trimestriel', vendor: 'Liebherr', history: [
        { date: '2026-05-15', tech: 'Liebherr SAV', what: 'Contrôle thermostat + joints', cost: 320 },
      ] },
      { id: 'oven', name: 'Four électrique', type: 'Cuisson', last: '2026-03-08', next: '2026-06-08', cadence: 'trimestriel', vendor: 'Rational', history: [
        { date: '2026-03-08', tech: 'Rational SAV', what: 'Détartrage + contrôle sondes', cost: 1280 },
      ] },
      { id: 'dish', name: 'Lave-vaisselle', type: 'Plonge', last: '2026-05-28', next: '2026-06-28', cadence: 'mensuel', vendor: 'Winterhalter', history: [
        { date: '2026-05-28', tech: 'Hamid T.', what: 'Détartrage + filtres', cost: 0 },
      ] },
      { id: 'ext', name: 'Extincteurs ×6', type: 'Sécurité', last: '2025-11-04', next: '2026-11-04', cadence: 'annuel', vendor: 'SicliFire', history: [
        { date: '2025-11-04', tech: 'SicliFire', what: 'Contrôle annuel obligatoire', cost: 1800 },
      ] },
      { id: 'gas', name: 'Détecteur gaz', type: 'Sécurité', last: '2025-12-15', next: '2026-06-15', cadence: 'semestriel', vendor: 'GazSafe', history: [
        { date: '2025-12-15', tech: 'GazSafe', what: 'Calibration sondes', cost: 420 },
      ] },
      { id: 'elec', name: 'Vérif. installation élec.', type: 'Sécurité', last: '2025-09-20', next: '2026-09-20', cadence: 'annuel', vendor: 'Cabinet Bennani', history: [
        { date: '2025-09-20', tech: 'Cabinet Bennani', what: 'Q18 obligatoire', cost: 2400 },
      ] },
    ],
    maisonMansour: [
      { id: 'till', name: 'TPV principal', type: 'Terminal', last: '2026-05-18', next: '2026-08-18', cadence: 'trimestriel', vendor: 'Sumup', history: [] },
      { id: 'cctv', name: 'Caméras boutique ×4', type: 'Sécurité', last: '2026-04-22', next: '2026-07-22', cadence: 'trimestriel', vendor: 'Hikvision', history: [] },
      { id: 'aircon', name: 'Climatisation', type: 'Climatisation', last: '2026-03-15', next: '2026-06-15', cadence: 'trimestriel', vendor: 'Daikin', history: [] },
      { id: 'ext', name: 'Extincteurs ×3', type: 'Sécurité', last: '2025-11-04', next: '2026-11-04', cadence: 'annuel', vendor: 'SicliFire', history: [] },
    ],
    spaBahia: [
      { id: 'jacuzzi', name: 'Jacuzzi hammam', type: 'Spa', last: '2026-05-29', next: '2026-06-12', cadence: 'bi-hebdo', vendor: 'Aquatique Pro', history: [] },
      { id: 'sauna', name: 'Cabine sauna', type: 'Spa', last: '2026-05-22', next: '2026-06-22', cadence: 'mensuel', vendor: 'Aquatique Pro', history: [] },
      { id: 'pool', name: 'Bassin thalasso', type: 'Spa', last: '2026-04-02', next: '2026-05-02', cadence: 'mensuel', vendor: 'Aquatique Pro', history: [] },
      { id: 'aircon', name: 'Climatisation', type: 'Climatisation', last: '2026-03-15', next: '2026-06-15', cadence: 'trimestriel', vendor: 'Daikin', history: [] },
    ],
  };

  function eqDaysFromNow(dateStr) {
    const parts = dateStr.split('-').map(Number);
    const target = new Date(parts[0], parts[1] - 1, parts[2]);
    /* Demo "today" is 03 juin 2026. */
    const today = new Date(2026, 5, 3);
    return Math.round((target - today) / 86400000);
  }
  function eqStatus(item) {
    const d = eqDaysFromNow(item.next);
    if (d < 0) return 'late';
    if (d <= 7) return 'due';
    return 'ok';
  }
  function eqHtml() {
    const v = currentVenueId();
    const list = EQUIPMENT[v] || EQUIPMENT.cafeAtlas;
    const overdue = list.filter((it) => eqStatus(it) === 'late').length;
    const overdueBanner = overdue > 0 ? `
      <div class="cf-eq-banner">▲ ${t('eqOverdueAlert', overdue)}</div>` : '';
    const rows = list.map((it) => {
      const st = eqStatus(it);
      const stLabel = st === 'ok' ? t('eqStatOk') : st === 'due' ? t('eqStatDue') : t('eqStatLate');
      return `
        <div class="cf-eq-row" data-action="cf-eq-detail" data-eq="${it.id}">
          <span class="cf-eq-name">${esc(trD(it.name))}</span>
          <span class="cf-eq-type">${esc(trD(it.type))}</span>
          <span class="cf-eq-last">${esc(it.last)}</span>
          <span class="cf-eq-next">${esc(it.next)} <small>· ${esc(trD(it.cadence))}</small></span>
          <span class="cf-eq-stat cf-eq-stat-${st}">${esc(stLabel)}</span>
        </div>`;
    }).join('');
    return `
      <div class="cf-eq">
        ${overdueBanner}
        <div class="cf-card">
          <div class="cf-eyebrow">
            <span>${esc(t('eqHeader'))}</span>
            <span class="cf-eyebrow-sub">${esc(t('eqSub'))}</span>
          </div>
          <div class="cf-eq-table">
            <div class="cf-eq-head">
              <span>${esc(t('eqCol1'))}</span>
              <span>${esc(t('eqCol2'))}</span>
              <span>${esc(t('eqCol3'))}</span>
              <span>${esc(t('eqCol4'))}</span>
              <span>${esc(t('eqCol5'))}</span>
            </div>
            ${rows}
          </div>
          <div class="cf-eq-foot">
            <button class="cf-btn primary" data-action="cf-eq-add">${esc(t('eqAddIntervention'))}</button>
          </div>
        </div>
      </div>`;
  }

  function eqOpenDetail(eqId) {
    const v = currentVenueId();
    const item = (EQUIPMENT[v] || []).find((x) => x.id === eqId);
    if (!item) return;
    /* Build an overlay (modeled on the recipe popup but lighter). */
    document.querySelectorAll('.cf-eq-detail-bd').forEach((b) => b.remove());
    const bd = document.createElement('div');
    bd.className = 'cf-eq-detail-bd';
    const hist = (item.history || []).length
      ? item.history.map((h) => `
        <div class="cf-eq-hist-row">
          <span class="cf-eq-hist-date">${esc(h.date)}</span>
          <span class="cf-eq-hist-what">${esc(trD(h.what))}</span>
          <span class="cf-eq-hist-tech">${esc(h.tech)}</span>
          <span class="cf-eq-hist-cost">${h.cost > 0 ? fmtMad(h.cost) : '—'}</span>
        </div>`).join('')
      : `<div class="cf-eq-hist-empty">${esc(t('eqDetailEmpty'))}</div>`;
    bd.innerHTML = `
      <div class="cf-eq-detail" role="dialog" aria-modal="true">
        <div class="cf-eq-detail-head">
          <div>
            <div class="cf-eq-detail-eyebrow">${esc(trD(item.type))}</div>
            <h3 class="cf-eq-detail-title">${esc(trD(item.name))}</h3>
            <div class="cf-eq-detail-meta">${esc(t('eqVendor'))} ${esc(item.vendor)} · ${esc(t('eqCadence'))} ${esc(trD(item.cadence))}</div>
          </div>
          <button class="cf-eq-detail-close" data-cf-eq-close aria-label="${esc(t('eqClose'))}">×</button>
        </div>
        <div class="cf-eq-detail-body">
          <div class="cf-eq-hist-head">
            <span>${esc(t('eqHistDate'))}</span><span>${esc(t('eqHistWhat'))}</span><span>${esc(t('eqHistTech'))}</span><span>${esc(t('eqHistCost'))}</span>
          </div>
          ${hist}
        </div>
      </div>`;
    document.body.appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('in'));
    // Scroll-lock via the shared global counter (same as Kiwi.modal) so it stays
    // balanced with the rest of the app and the page can't scroll behind the dialog.
    window.__kiwiScrollLocks = (window.__kiwiScrollLocks || 0) + 1;
    document.documentElement.classList.add('kiwi-locked');
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      bd.classList.remove('in');
      document.removeEventListener('keydown', onKey);
      const n = Math.max(0, (window.__kiwiScrollLocks || 0) - 1);
      window.__kiwiScrollLocks = n;
      if (n === 0) document.documentElement.classList.remove('kiwi-locked');
      setTimeout(() => bd.remove(), 220);
    };
    // Keyboard a11y: Escape closes; Tab is trapped inside the dialog.
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        const f = bd.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    bd.addEventListener('click', (e) => {
      if (e.target.closest('[data-cf-eq-close]') || !e.target.closest('.cf-eq-detail')) close();
    });
    setTimeout(() => { const c = bd.querySelector('.cf-eq-detail-close'); if (c) c.focus(); }, 60);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAB 4 · DOCUMENTS — file vault
   * ═══════════════════════════════════════════════════════════════════════ */

  /* "Today" reference for expiry diff. */
  const DOC_TODAY = new Date(2026, 5, 3);
  function daysUntil(dateStr) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return Math.round((d - DOC_TODAY) / 86400000);
  }
  function docExpStatus(dateStr) {
    const d = daysUntil(dateStr);
    if (d < 0) return 'expired';
    if (d < 90) return 'soon';
    return 'ok';
  }

  const DOCUMENTS = {
    cafeAtlas: [
      { id: 'p1', name: 'Permis d\'exploiter (Wilaya Maarif)', cat: 'permit',    upload: '2024-09-15', expires: '2027-09-14' },
      { id: 'p2', name: 'Patente fiscale 2026',                cat: 'permit',    upload: '2025-12-01', expires: '2026-12-31' },
      { id: 'p3', name: 'Licence débit de boissons',           cat: 'permit',    upload: '2025-03-08', expires: '2028-03-07' },
      { id: 'c1', name: 'Brevet food handler · Mohammed Karimi', cat: 'cert',    upload: '2024-08-30', expires: '2026-08-30' },
      { id: 'c2', name: 'Brevet food handler · Youssef Bennani', cat: 'cert',    upload: '2024-10-12', expires: '2026-10-12' },
      { id: 'c3', name: 'Formation HACCP équipe (5 personnes)',  cat: 'cert',    upload: '2025-09-20', expires: '2027-09-20' },
      { id: 'c4', name: 'Vérification Q18 électrique',          cat: 'cert',    upload: '2025-09-20', expires: '2026-09-20' },
      { id: 's1', name: 'Contrat fournisseur viandes · Errazi', cat: 'supplier',upload: '2025-01-10', expires: '2026-12-31' },
      { id: 's2', name: 'Contrat fournisseur poissons · Marché', cat: 'supplier',upload: '2025-06-20', expires: '2026-06-20' },
      { id: 's3', name: 'Contrat fournisseur laitier · Centrale Danone', cat: 'supplier', upload: '2025-04-05', expires: '2027-04-05' },
      { id: 'e1', name: 'Contrat CDI · Sofia Belkadi',           cat: 'employee', upload: '2023-02-14', expires: '2099-01-01' },
      { id: 'e2', name: 'Contrat CDI · Mohammed Karimi',         cat: 'employee', upload: '2021-06-01', expires: '2099-01-01' },
      { id: 'e3', name: 'Contrat CDD · Hamid Jelloul',           cat: 'employee', upload: '2025-09-01', expires: '2026-09-01' },
      { id: 'i1', name: 'Assurance RC pro',                       cat: 'insurance', upload: '2026-01-15', expires: '2026-12-31' },
      { id: 'i2', name: 'Assurance multirisque locaux',           cat: 'insurance', upload: '2026-01-15', expires: '2026-12-31' },
      { id: 'h1', name: 'Rapport désinsectisation · mai 2026',   cat: 'hygiene',  upload: '2026-05-08', expires: '2026-06-08' },
      { id: 'h2', name: 'Analyse eau potable laboratoire',      cat: 'hygiene',  upload: '2026-04-20', expires: '2026-10-20' },
      { id: 'in1', name: 'Facture Liebherr SAV mai 2026',        cat: 'invoice',  upload: '2026-05-16', expires: '2099-01-01' },
    ],
    maisonMansour: [
      { id: 'p1', name: 'Patente fiscale 2026',           cat: 'permit', upload: '2025-12-01', expires: '2026-12-31' },
      { id: 'p2', name: 'Permis enseigne boutique',        cat: 'permit', upload: '2024-07-22', expires: '2027-07-22' },
      { id: 'e1', name: 'Contrat CDI · Karima Idrissi',    cat: 'employee', upload: '2024-04-01', expires: '2099-01-01' },
      { id: 'i1', name: 'Assurance multirisque local',     cat: 'insurance', upload: '2026-01-15', expires: '2026-12-31' },
      { id: 'i2', name: 'Assurance marchandises',           cat: 'insurance', upload: '2026-01-15', expires: '2026-08-31' },
    ],
    spaBahia: [
      { id: 'p1', name: 'Patente fiscale 2026',                 cat: 'permit', upload: '2025-12-01', expires: '2026-12-31' },
      { id: 'p2', name: 'Licence spa & soins paramédicaux',     cat: 'permit', upload: '2024-11-08', expires: '2027-11-08' },
      { id: 'c1', name: 'Diplôme massothérapie · Imane Tazi',   cat: 'cert',   upload: '2022-05-10', expires: '2099-01-01' },
      { id: 'h1', name: 'Analyses eau bassin (laboratoire)',    cat: 'hygiene', upload: '2026-05-12', expires: '2026-07-12' },
      { id: 'i1', name: 'Assurance responsabilité civile pro',  cat: 'insurance', upload: '2026-01-15', expires: '2026-12-31' },
    ],
  };

  let docSearchQ = '';
  let docFilterCat = 'all';

  function docHtml() {
    const v = currentVenueId();
    const all = DOCUMENTS[v] || [];
    const cats = t('docCats');
    const expiringSoon = all.filter((d) => docExpStatus(d.expires) === 'soon').length;

    const q = docSearchQ.trim().toLowerCase();
    const filtered = all.filter((d) => {
      if (docFilterCat !== 'all' && d.cat !== docFilterCat) return false;
      if (q && !d.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const pillRow = Object.keys(cats).map((k) => `
      <button class="cf-doc-pill${docFilterCat === k ? ' on' : ''}" data-action="cf-doc-filter" data-cat="${k}">${esc(cats[k])}</button>`).join('');

    const cardHtml = (d) => {
      const st = docExpStatus(d.expires);
      const daysLeft = daysUntil(d.expires);
      const stLabelMap = t('docExpStatus');
      const stLabel = stLabelMap[st];
      const showDays = d.expires < '2099-01-01';
      return `
        <div class="cf-doc-card cf-doc-card-${st}" data-action="cf-doc-detail" data-doc="${d.id}">
          <div class="cf-doc-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h2"/></svg>
          </div>
          <div class="cf-doc-body">
            <div class="cf-doc-name">${esc(d.name)}</div>
            <div class="cf-doc-cat">${esc(cats[d.cat] || d.cat)}</div>
            ${showDays ? `<div class="cf-doc-exp cf-doc-exp-${st}">${st === 'ok' ? '✓' : st === 'soon' ? '⚠' : '✗'} ${esc(stLabel)} · ${esc(t('docExpiresIn', daysLeft))}</div>` : `<div class="cf-doc-exp">Archive permanente</div>`}
          </div>
        </div>`;
    };

    const grid = filtered.length
      ? `<div class="cf-doc-grid">${filtered.map(cardHtml).join('')}</div>`
      : `<div class="cf-doc-empty">${esc(t('docEmpty'))}</div>`;

    const banner = expiringSoon > 0
      ? `<div class="cf-doc-banner">⚠ ${t('docExpiringAlert', expiringSoon)}</div>` : '';

    return `
      <div class="cf-doc">
        ${banner}
        <div class="cf-card">
          <div class="cf-eyebrow">
            <span>${esc(t('docHeader'))}</span>
            <span class="cf-eyebrow-sub">${esc(t('docSub'))}</span>
          </div>
          <div class="cf-doc-controls">
            <div class="cf-doc-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              <input type="search" placeholder="${esc(t('docSearch'))}" value="${esc(docSearchQ)}" oninput="window.KiwiConformite?.docSearchHook?.(this)" />
            </div>
            <button class="cf-btn primary" data-action="cf-doc-upload">${esc(t('docUpload'))}</button>
          </div>
          <div class="cf-doc-pills">${pillRow}</div>
          ${grid}
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Page renderer + tabs
   * ═══════════════════════════════════════════════════════════════════════ */

  // The Z-report, HACCP and equipment tabs are seeded with Café Atlas demo staff
  // (Sofia Belkadi, Hamid Jelloul, Mohammed K.…) and demo figures with no per-venue
  // gate. For a REAL session (hosted / signed-in / operator-scoped / custom venue)
  // they must show empty registers. (The Documents tab is already per-venue empty.)
  function cfShowReal(v) {
    try {
      if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) return true;
      if (window.KiwiVenue && window.KiwiVenue.isCustom && window.KiwiVenue.isCustom(v)) return true;
    } catch (_) {}
    return false;
  }
  function cfEmpty() {
    const c = ({
      fr: { h: 'Rien à afficher pour l’instant', p: 'Vos clôtures de caisse, votre registre HACCP et vos équipements apparaîtront ici au fil de votre activité.' },
      en: { h: 'Nothing to show yet', p: 'Your Z-reports, HACCP log and equipment register will appear here as you operate.' },
      ar: { h: 'لا شيء لعرضه بعد', p: 'ستظهر هنا إغلاقات الصندوق وسجل HACCP والمعدّات مع نشاطك.' },
    })[lang()] || { h: 'Nothing to show yet', p: '' };
    return `<div class="cf-empty" style="padding:48px 24px;text-align:center;max-width:520px;margin:0 auto;">
      <div style="font-size:16px;font-weight:640;letter-spacing:-.01em;margin-bottom:8px;">${esc(c.h)}</div>
      <div style="font-size:13.5px;color:var(--n-500);line-height:1.6;">${esc(c.p)}</div>
    </div>`;
  }

  function render() {
    const root = document.querySelector('[data-conformite-root]');
    if (!root) return;
    const v = currentVenueId();
    const real = cfShowReal(v);
    const tabs = [
      { k: 'z',   label: t('tabZ') },
      { k: 'hyg', label: t('tabHyg') },
      { k: 'eq',  label: t('tabEq') },
      { k: 'doc', label: t('tabDoc') },
    ];
    const tabRow = tabs.map((tb) =>
      `<button class="cf-tab${currentTab === tb.k ? ' on' : ''}" data-action="cf-tab" data-tab="${tb.k}">${esc(tb.label)}</button>`
    ).join('');
    const tabBody =
      currentTab === 'z'   ? (real ? cfEmpty() : zHtml()) :
      currentTab === 'hyg' ? (real ? cfEmpty() : hygHtml()) :
      currentTab === 'eq'  ? (real ? cfEmpty() : eqHtml()) :
      currentTab === 'doc' ? (real ? cfEmpty() : docHtml()) : '';
    root.innerHTML = `
      <div class="cf-page">
        <div class="cf-head">
          <div>
            <div class="cf-title">${esc(t('pageTitle'))}</div>
            <div class="cf-sub">${esc(t('pageSub', venueName(v)))}</div>
          </div>
        </div>
        <div class="cf-tabs">${tabRow}</div>
        <div class="cf-body">${tabBody}</div>
      </div>`;
  }

  /* ─────────── Show / hide ─────────── */
  function showPage() {
    pageActive = true;
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('conformite');
    else document.body.classList.add('page-conformite');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = `Accueil <span class="sep">/</span> <b>${esc(t('breadcrumb'))}</b>`;
    window.Kiwi?.setActivePage?.('conformite');
    document.querySelectorAll('.sidebar nav a').forEach((a) => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="conformite"]')?.classList.add('active');
    window.scrollTo({ top: 0 });
    render();
  }
  function showDashboard() {
    if (!document.body.classList.contains('page-conformite')) return;
    pageActive = false;
    document.body.classList.remove('page-conformite');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = 'Accueil <span class="sep">/</span> <b>Tableau de bord</b>';
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* ─────────── Action handlers ─────────── */
  function rerender() { if (pageActive) render(); }

  function wireHandlers() {
    if (!window.Kiwi || !window.Kiwi.handlers) return setTimeout(wireHandlers, 80);
    const H = window.Kiwi.handlers;

    /* The handler that wins (loaded after pages-pro.js + pages.js). */
    H['nav-conformite'] = () => showPage();

    /* Tab switcher */
    H['cf-tab'] = (el) => { currentTab = el.dataset.tab || 'z'; rerender(); };

    /* Z report */
    H['cf-z-close'] = () => {
      const v = currentVenueId();
      const variance = zCountedTotal() - zExpectedCash(v);
      if (Math.abs(variance) > 20 && !zReason.trim()) return;
      zClosed = true;
      const nextZ = (zHistoryData(v)[0]?.zNum || 482) + 1;
      window.Kiwi.toast?.(t('zCloseToast', nextZ), { type: 'success', duration: 4200 });
      rerender();
    };
    H['cf-z-history'] = (el) => {
      const zn = el.dataset.z;
      window.Kiwi.toast?.(`Z #${zn} · réimpression simulée`, { type: 'info' });
    };

    /* Hygiène */
    H['cf-hyg-toggle'] = (el) => {
      const id = el.dataset.task;
      if (!id) return;
      if (hygChecked[id]) delete hygChecked[id];
      else {
        const d = Z_DATA[currentVenueId()] || Z_DATA.cafeAtlas;
        const now = new Date();
        const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        hygChecked[id] = { by: d.cashier, at: hh };
      }
      rerender();
    };
    H['cf-hyg-export'] = () => window.Kiwi.toast?.(t('hygAuditToast'), { type: 'success', duration: 4200 });

    /* Équipements */
    H['cf-eq-detail'] = (el) => eqOpenDetail(el.dataset.eq);
    H['cf-eq-add']    = () => window.Kiwi.toast?.(t('eqAddToast'), { type: 'success', duration: 3600 });

    /* Documents */
    H['cf-doc-filter'] = (el) => { docFilterCat = el.dataset.cat || 'all'; rerender(); };
    H['cf-doc-upload'] = () => window.Kiwi.toast?.(t('docUploadToast'), { type: 'info' });
    H['cf-doc-detail'] = (el) => {
      const v = currentVenueId();
      const d = (DOCUMENTS[v] || []).find((x) => x.id === el.dataset.doc);
      if (d) window.Kiwi.toast?.(`${d.name} · aperçu simulé`, { type: 'info' });
    };

    /* Wrap other nav handlers to send the user back to the dashboard. */
    ['nav-accueil', 'nav-tables', 'nav-menu', 'nav-kds', 'nav-stock', 'nav-equipe',
      'nav-payroll', 'nav-reservations', 'nav-orders', 'nav-terminals', 'nav-finance']
      .forEach((k) => {
        const prev = H[k];
        H[k] = (...args) => { showDashboard(); return prev ? prev(...args) : undefined; };
      });
  }

  /* Public surface — needed for the search input's oninput hook (since
   * inputs don't pass through Kiwi's click delegator). */
  window.KiwiConformite = {
    showPage, showDashboard, render,
    docSearchHook: (el) => { docSearchQ = el.value || ''; rerender(); /* refocus the input */ requestAnimationFrame(() => { const i = document.querySelector('.cf-doc-search input'); if (i) { i.focus(); i.setSelectionRange(docSearchQ.length, docSearchQ.length); } }); },
    /* The denomination grid uses inline oninput too (counts feed back). */
    zCountHook: (el) => {
      const id = el.dataset.cfZCount;
      if (!id) return;
      const n = Math.max(0, parseInt(el.value, 10) || 0);
      zCounts[id] = n;
      rerender();
      requestAnimationFrame(() => {
        const fresh = document.querySelector(`[data-cf-z-count="${id}"]`);
        if (fresh) { fresh.focus(); fresh.setSelectionRange(String(n).length, String(n).length); }
      });
    },
    zReasonHook: (el) => { zReason = el.value || ''; rerender(); requestAnimationFrame(() => { document.querySelector('[data-cf-z-reason]')?.focus(); }); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireHandlers);
  else wireHandlers();
})();
