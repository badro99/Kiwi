/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ÉQUIPE — team & profile management (full-page surface)
 *
 * Sidebar destination. Replaces the drawer-based version with a full-page
 * surface that reuses the dashboard's existing `.eq-*` design system
 * (see dashboard.html ~line 2860+). Same brand language as Stock /
 * Menu / Plan de Salle.
 *
 * Scope:
 *   1. PROFILS    — add / view / edit / delete team members. Every
 *                   employee attribute lives here (identity, contact,
 *                   password, role, contract, base salary, hourly rate,
 *                   languages, CIN, address, emergency contact, notes).
 *   2. HEURES     — period-bound hours-worked data entry (week / quinzaine
 *                   / month). Quick-entry modal, period validation.
 *   3. RÔLES      — venue-type-aware function & department catalogue. A
 *                   restaurant owner never sees "Masseur"; a pharmacy
 *                   never sees "Serveur". Reactive — switching the
 *                   venue refreshes all dropdowns.
 *
 * State is in-memory (window.__kiwiTeamV2) and wipes on page reload.
 * Loads AFTER venues.js, so this file's nav-equipe handler wins.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const { handlers, modal, toast } = Kiwi;

  /* ═══════════════ i18n — local pack ═══════════════ */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  const STR = {
    fr: {
      breadcrumb: 'Équipe',
      title: 'Équipe',
      subDate: (d) => `Service du ${d}`,
      tabProfiles: 'Profils',
      tabHours:    'Heures travaillées',
      addMember: 'Ajouter un membre',
      exportCsv: 'Exporter CSV',
      searchPh:  'Rechercher un nom, un poste, un département…',
      filterAllDept: 'Tous les départements',
      filterAllContract: 'Tous les contrats',
      filterAllLang: 'Toutes les langues',
      noMatch: 'Aucun membre ne correspond aux filtres.',
      // Stats
      statTotal: 'TOTAL MEMBRES',
      statTotalSub: (n, name) => `${n} actifs · ${name}`,
      statPresent: 'EN SERVICE AUJOURD\'HUI',
      statPresentSub: 'membres pointés (estimation)',
      statPayroll: 'MASSE SALARIALE · MOIS',
      statPayrollSub: 'salaires de base cumulés',
      statHours: 'HEURES PÉRIODE EN COURS',
      statHoursSub: 'heures saisies sur la période',
      // Members table
      secAllMembers: 'Tous les membres',
      secAllMembersBadge: (n) => `${n} affiché${n === 1 ? '' : 's'}`,
      colMember: 'Membre',
      colFunction: 'Fonction',
      colDepartment: 'Département',
      colContract: 'Contrat',
      colLanguages: 'Langues',
      colSalary: 'Salaire base',
      colActions: 'Actions',
      // Profile modal
      viewProfile: 'Voir le profil',
      editBtn:   'Modifier',
      deleteBtn: 'Supprimer',
      profileSub: (role, dept) => `${role} · ${dept}`,
      secIdentity:    'Identité',
      secContact:     'Contact',
      secAccess:      'Accès Kiwi Caisse',
      secRole:        'Rôle & affectation',
      secContract:    'Contrat',
      secComp:        'Rémunération',
      secSkills:      'Compétences',
      secEmergency:   "Contact d'urgence",
      secNotes:       'Notes',
      firstName: 'Prénom',
      lastName:  'Nom',
      email:     'Email',
      phone:     'Téléphone',
      password:  'Code caisse · 4 chiffres',
      generate:  'Générer',
      copy:      'Copier',
      function:  'Fonction',
      department:'Département',
      contractType: 'Type de contrat',
      startDate: 'Date de début',
      endDate:   'Date de fin',
      baseSalary:'Salaire de base · MAD / mois',
      hourlyRate:'Taux horaire · MAD / heure',
      languages: 'Langues parlées',
      address:   'Adresse',
      cin:       "CIN (carte d'identité nationale)",
      emergencyName:  "Nom du contact",
      emergencyPhone: 'Téléphone du contact',
      notes:     'Notes libres',
      ctCdi: 'CDI', ctCdd: 'CDD', ctStage: 'Stage', ctFreelance: 'Freelance', ctInterim: 'Intérim',
      langFr: 'Français', langAr: 'Arabe', langEn: 'Anglais', langEs: 'Espagnol', langTz: 'Tamazight', langDr: 'Darija',
      addTitle:  'Nouveau membre',
      editTitle: 'Modifier le membre',
      photoLabel:'Photo',
      uploadPhoto:'Téléverser une photo',
      placeholder: { firstName: 'Sara', lastName: 'Belkadi', email: 'sara@kiwi.ma', phone: '6XX XX XX XX', address: 'Rue 12, Maarif, Casablanca', cin: 'BK 384721', emergencyName: 'Karim Belkadi', emergencyPhone: '6XX XX XX XX', notes: 'Allergie crustacés · disponibilité étendue le week-end' },
      vRequired: 'Prénom, nom et fonction requis',
      vInvalidEmail: 'Email invalide',
      vEndAfterStart: "La date de fin doit être après la date de début",
      vCode: "Le code caisse doit faire 4 chiffres",
      payTitle: 'Paie & planning',
      paySub: 'planning, heures et paie de la période',
      payEmptyH: 'Ajoutez votre équipe pour commencer',
      payEmptyP: "Le planning et la paie se construisent à partir de vos employés. Ajoutez-les dans Équipe, puis saisissez leurs heures ici — les totaux et le coût de la période se calculent tout seuls.",
      payStatDue: 'À payer · période',
      payStatDueSub: (a, b) => `salaires de base + heures, ${a} au ${b}`,
      payStatHours: 'Heures de la période',
      payStatHoursSub: 'total saisi sur le planning',
      payStatVar: 'Coût des heures',
      payStatVarSub: 'heures × taux horaire',
      payStatBase: 'Salaires de base',
      payStatBaseSub: (n, tot) => `${n} sur ${tot} en service sur la période`,
      codeKeep: 'Inchangé — 4 chiffres pour le modifier',
      tabPlanning: 'Planning', tabRealised: 'Heures travaillées',
      plNone: '—', plMember: 'Membre', plPlanned: 'Planifié', plCost: 'Coût prévu',
      plApply: 'Reporter sur les heures', plClear: 'Vider le planning',
      plFooter: 'Total planifié',
      plHint: 'Cliquez une case pour saisir les heures exactes du service, ou marquer un jour de repos.',
      plApplied: (n) => `${n} journée${n > 1 ? 's' : ''} reportée${n > 1 ? 's' : ''} sur les heures.`,
      plNothing: 'Rien à reporter : aucun service planifié sur cette période.',
      plCleared: 'Planning vidé pour cette période.',
      plRest: 'Repos',
      plStart: 'Début', plEnd: 'Fin', plDur: 'Durée',
      plSave: 'Enregistrer', plClearCell: 'Vider la case',
      plWholeWeek: 'Appliquer à toute la semaine',
      plNextDay: (day, time) => `Se termine le ${day} à ${time}`,
      plNextDayLegend: 'Un service marqué +1 se termine le lendemain. Les heures comptent sur le jour de début.',
      plNeedBoth: 'Indiquez une heure de début et une heure de fin.',
      plSameTime: "L'heure de fin doit être différente de l'heure de début.",
      plWeekOf: (a, b) => `Semaine du ${a} au ${b}`,
      plPrevWeek: 'Semaine précédente', plNextWeek: 'Semaine suivante',
      plPlannedPeriod: 'Planifié · période',
      plWeekApplied: (n) => `Service appliqué sur ${n} jour${n > 1 ? 's' : ''}.`,
      submitAdd:  'Ajouter le membre',
      submitEdit: 'Enregistrer les modifications',
      cancel: 'Annuler',
      delTitle: 'Supprimer ce membre ?',
      delDesc:  'Action irréversible. Le compte Kiwi Caisse sera désactivé immédiatement.',
      delConfirm: 'Supprimer',
      tAdded:    (n) => `${n} ajouté·e à l'équipe`,
      tAddedDesc:(p) => `Code caisse ${p} · utilisable tout de suite sur la caisse`,
      tUpdated:  (n) => `${n} · profil mis à jour`,
      tDeleted:  (n) => `${n} a été retiré·e de l'équipe`,
      tPwdCopied:'Code caisse copié',
      tPwdGen:   'Nouveau code caisse généré',
      // Hours pane
      hPeriodWeek: 'Cette semaine',
      hPeriodFort: 'Quinzaine',
      hPeriodMonth:'Ce mois',
      hQuickEntry:'Saisie rapide',
      hExport:    'Exporter CSV',
      hImport:    'Importer CSV',
      hValidate:  'Valider la période',
      hMember:    'Membre',
      hTotal:     'Total heures',
      hPay:       'Salaire calculé',
      hLocked:    'Période verrouillée',
      hPeriodLabel: (start, end) => `Du ${start} au ${end}`,
      hFooterLabel: 'Total période',
      qeTitle: 'Saisie rapide · heures',
      qeMember:'Membre',
      qeDate:  'Date',
      qeHours: 'Heures travaillées',
      qeNote:  'Note (optionnel)',
      qeSave:  'Enregistrer',
      tHourSaved: (n, h, d) => `${h} h enregistrées · ${n} · ${d}`,
      tExport:    'Export CSV généré',
      tExportDesc:'Fichier prêt à être envoyé à votre comptable.',
      tImport:    'Import CSV',
      tImportDesc:'Glissez votre fichier · vérification automatique des en-têtes.',
      tValidated: (start, end) => `Période verrouillée · du ${start} au ${end}`,
      tValidatedDesc: 'Heures envoyées à Paie & Planning · masse salariale recalculée.',
      placeholderPwd: '····',
      monthName: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
      dayName:   ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'],
    },
    en: {
      breadcrumb: 'Team',
      title: 'Team',
      subDate: (d) => `Service · ${d}`,
      tabProfiles: 'Profiles',
      tabHours:    'Hours worked',
      addMember: 'Add a member',
      exportCsv: 'Export CSV',
      searchPh:  'Search by name, role, department…',
      filterAllDept: 'All departments',
      filterAllContract: 'All contracts',
      filterAllLang: 'All languages',
      noMatch: 'No member matches the filters.',
      statTotal: 'TOTAL MEMBERS',
      statTotalSub: (n, name) => `${n} active · ${name}`,
      statPresent: 'ON SHIFT TODAY',
      statPresentSub: 'members clocked in (estimate)',
      statPayroll: 'PAYROLL · MONTH',
      statPayrollSub: 'cumulative base salaries',
      statHours: 'HOURS · CURRENT PERIOD',
      statHoursSub: 'hours logged for the period',
      secAllMembers: 'All members',
      secAllMembersBadge: (n) => `${n} shown`,
      colMember: 'Member',
      colFunction: 'Function',
      colDepartment: 'Department',
      colContract: 'Contract',
      colLanguages: 'Languages',
      colSalary: 'Base salary',
      colActions: 'Actions',
      viewProfile: 'View profile',
      editBtn:   'Edit',
      deleteBtn: 'Remove',
      profileSub: (role, dept) => `${role} · ${dept}`,
      secIdentity:    'Identity',
      secContact:     'Contact',
      secAccess:      'Kiwi Caisse access',
      secRole:        'Role & assignment',
      secContract:    'Contract',
      secComp:        'Compensation',
      secSkills:      'Skills',
      secEmergency:   'Emergency contact',
      secNotes:       'Notes',
      firstName: 'First name',
      lastName:  'Last name',
      email:     'Email',
      phone:     'Phone',
      password:  'Till code · 4 digits',
      generate:  'Generate',
      copy:      'Copy',
      function:  'Function',
      department:'Department',
      contractType: 'Contract type',
      startDate: 'Start date',
      endDate:   'End date',
      baseSalary:'Base salary · MAD / month',
      hourlyRate:'Hourly rate · MAD / hour',
      languages: 'Spoken languages',
      address:   'Address',
      cin:       'National ID (CIN)',
      emergencyName:  'Contact name',
      emergencyPhone: 'Contact phone',
      notes:     'Free notes',
      ctCdi: 'Permanent', ctCdd: 'Fixed-term', ctStage: 'Internship', ctFreelance: 'Freelance', ctInterim: 'Temp',
      langFr: 'French', langAr: 'Arabic', langEn: 'English', langEs: 'Spanish', langTz: 'Tamazight', langDr: 'Darija',
      addTitle:  'New member',
      editTitle: 'Edit member',
      photoLabel:'Photo',
      uploadPhoto:'Upload a photo',
      placeholder: { firstName: 'Sara', lastName: 'Belkadi', email: 'sara@kiwi.ma', phone: '6XX XX XX XX', address: '12 Rue, Maarif, Casablanca', cin: 'BK 384721', emergencyName: 'Karim Belkadi', emergencyPhone: '6XX XX XX XX', notes: 'Shellfish allergy · extended weekend availability' },
      vRequired: 'First name, last name and function are required',
      vInvalidEmail: 'Invalid email',
      vEndAfterStart: 'End date must be after the start date',
      vCode: 'The till code must be 4 digits',
      payTitle: 'Payroll & scheduling',
      paySub: 'schedule, hours and pay for the period',
      payEmptyH: 'Add your team to get started',
      payEmptyP: 'Scheduling and payroll are built from your employees. Add them under Team, then enter their hours here — period totals and cost work themselves out.',
      payStatDue: 'Due · period',
      payStatDueSub: (a, b) => `base salaries + hours, ${a} to ${b}`,
      payStatHours: 'Hours this period',
      payStatHoursSub: 'total entered on the schedule',
      payStatVar: 'Cost of hours',
      payStatVarSub: 'hours × hourly rate',
      payStatBase: 'Base salaries',
      payStatBaseSub: (n, tot) => `${n} of ${tot} on duty this period`,
      codeKeep: 'Unchanged — enter 4 digits to change it',
      tabPlanning: 'Schedule', tabRealised: 'Hours worked',
      plNone: '—', plMember: 'Member', plPlanned: 'Scheduled', plCost: 'Projected cost',
      plApply: 'Copy onto hours', plClear: 'Clear schedule',
      plFooter: 'Total scheduled',
      plHint: 'Click a cell to set the exact shift hours, or mark the day as time off.',
      plApplied: (n) => `${n} day${n > 1 ? 's' : ''} copied onto hours.`,
      plNothing: 'Nothing to copy: no shift scheduled this period.',
      plCleared: 'Schedule cleared for this period.',
      plRest: 'Day off',
      plStart: 'Starts', plEnd: 'Ends', plDur: 'Length',
      plSave: 'Save', plClearCell: 'Clear cell',
      plWholeWeek: 'Apply to the whole week',
      plNextDay: (day, time) => `Ends ${day} at ${time}`,
      plNextDayLegend: 'A shift marked +1 ends the next day. Its hours count on the day it starts.',
      plNeedBoth: 'Enter both a start and an end time.',
      plSameTime: 'The end time must differ from the start time.',
      plWeekOf: (a, b) => `Week of ${a} to ${b}`,
      plPrevWeek: 'Previous week', plNextWeek: 'Next week',
      plPlannedPeriod: 'Scheduled · period',
      plWeekApplied: (n) => `Shift applied to ${n} day${n > 1 ? 's' : ''}.`,
      submitAdd:  'Add member',
      submitEdit: 'Save changes',
      cancel: 'Cancel',
      delTitle: 'Remove this member?',
      delDesc:  'Permanent. The Kiwi Caisse account will be disabled immediately.',
      delConfirm: 'Remove',
      tAdded:    (n) => `${n} added to the team`,
      tAddedDesc:(p) => `Till code ${p} · usable on the register right away`,
      tUpdated:  (n) => `${n} · profile updated`,
      tDeleted:  (n) => `${n} has been removed from the team`,
      tPwdCopied:'Till code copied',
      tPwdGen:   'New till code generated',
      hPeriodWeek: 'This week',
      hPeriodFort: 'Fortnight',
      hPeriodMonth:'This month',
      hQuickEntry:'Quick entry',
      hExport:    'Export CSV',
      hImport:    'Import CSV',
      hValidate:  'Validate period',
      hMember:    'Member',
      hTotal:     'Total hours',
      hPay:       'Computed pay',
      hLocked:    'Period locked',
      hPeriodLabel: (start, end) => `From ${start} to ${end}`,
      hFooterLabel: 'Period total',
      qeTitle: 'Quick entry · hours',
      qeMember:'Member',
      qeDate:  'Date',
      qeHours: 'Hours worked',
      qeNote:  'Note (optional)',
      qeSave:  'Save',
      tHourSaved: (n, h, d) => `${h} h logged · ${n} · ${d}`,
      tExport:    'CSV export generated',
      tExportDesc:'File ready to send to your accountant.',
      tImport:    'CSV import',
      tImportDesc:'Drop your file · headers checked automatically.',
      tValidated: (start, end) => `Period locked · from ${start} to ${end}`,
      tValidatedDesc: 'Hours sent to Payroll & Planning · wage cost recomputed.',
      placeholderPwd: '····',
      monthName: ['January','February','March','April','May','June','July','August','September','October','November','December'],
      dayName:   ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    },
    ar: {
      breadcrumb: 'الفريق',
      title: 'الفريق',
      subDate: (d) => `خدمة · ${d}`,
      tabProfiles: 'الملفات',
      tabHours:    'ساعات العمل',
      addMember: 'إضافة عضو',
      exportCsv: 'تصدير CSV',
      searchPh:  'بحث بالاسم، المنصب، القسم…',
      filterAllDept: 'كل الأقسام',
      filterAllContract: 'كل العقود',
      filterAllLang: 'كل اللغات',
      noMatch: 'لا يوجد عضو يطابق الفلاتر.',
      statTotal: 'إجمالي الأعضاء',
      statTotalSub: (n, name) => `${n} نشط · ${name}`,
      statPresent: 'في الخدمة اليوم',
      statPresentSub: 'أعضاء مسجلون (تقدير)',
      statPayroll: 'كتلة الأجور · الشهر',
      statPayrollSub: 'مجموع الرواتب الأساسية',
      statHours: 'ساعات · الفترة الحالية',
      statHoursSub: 'ساعات مسجلة في الفترة',
      secAllMembers: 'كل الأعضاء',
      secAllMembersBadge: (n) => `${n} معروض`,
      colMember: 'العضو',
      colFunction: 'الوظيفة',
      colDepartment: 'القسم',
      colContract: 'العقد',
      colLanguages: 'اللغات',
      colSalary: 'الراتب الأساسي',
      colActions: 'إجراءات',
      viewProfile: 'عرض الملف',
      editBtn:   'تعديل',
      deleteBtn: 'حذف',
      profileSub: (role, dept) => `${role} · ${dept}`,
      secIdentity:    'الهوية',
      secContact:     'الاتصال',
      secAccess:      'الوصول لـ Kiwi Caisse',
      secRole:        'المنصب والتكليف',
      secContract:    'العقد',
      secComp:        'الراتب',
      secSkills:      'المهارات',
      secEmergency:   'جهة الاتصال للطوارئ',
      secNotes:       'ملاحظات',
      firstName: 'الاسم الأول',
      lastName:  'النسب',
      email:     'البريد الإلكتروني',
      phone:     'الهاتف',
      password:  'رمز الصندوق · 4 أرقام',
      generate:  'إنشاء',
      copy:      'نسخ',
      function:  'الوظيفة',
      department:'القسم',
      contractType: 'نوع العقد',
      startDate: 'تاريخ البدء',
      endDate:   'تاريخ الانتهاء',
      baseSalary:'الراتب الأساسي · درهم / شهر',
      hourlyRate:'الأجر بالساعة · درهم / ساعة',
      languages: 'اللغات المتحدث بها',
      address:   'العنوان',
      cin:       'البطاقة الوطنية',
      emergencyName:  'اسم جهة الاتصال',
      emergencyPhone: 'هاتف جهة الاتصال',
      notes:     'ملاحظات حرة',
      ctCdi: 'عقد دائم', ctCdd: 'عقد محدد', ctStage: 'تدريب', ctFreelance: 'مستقل', ctInterim: 'مؤقت',
      langFr: 'الفرنسية', langAr: 'العربية', langEn: 'الإنجليزية', langEs: 'الإسبانية', langTz: 'الأمازيغية', langDr: 'الدارجة',
      addTitle:  'عضو جديد',
      editTitle: 'تعديل العضو',
      photoLabel:'الصورة',
      uploadPhoto:'تحميل صورة',
      placeholder: { firstName: 'سارة', lastName: 'بلقاضي', email: 'sara@kiwi.ma', phone: '6XX XX XX XX', address: 'شارع 12، المعاريف، الدار البيضاء', cin: 'BK 384721', emergencyName: 'كريم بلقاضي', emergencyPhone: '6XX XX XX XX', notes: 'حساسية من القشريات · توفر موسع نهاية الأسبوع' },
      vRequired: 'الاسم الأول والنسب والوظيفة مطلوبة',
      vInvalidEmail: 'بريد إلكتروني غير صالح',
      vEndAfterStart: 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء',
      vCode: 'رمز الصندوق يجب أن يكون 4 أرقام',
      payTitle: 'الأجور والتخطيط',
      paySub: 'التخطيط والساعات وأجور الفترة',
      payEmptyH: 'أضف فريقك للبدء',
      payEmptyP: 'يُبنى التخطيط والأجور انطلاقاً من موظفيك. أضفهم في «الفريق»، ثم أدخل ساعاتهم هنا — تُحتسب المجاميع وتكلفة الفترة تلقائياً.',
      payStatDue: 'المستحق · الفترة',
      payStatDueSub: (a, b) => `الأجور الأساسية + الساعات، من ${a} إلى ${b}`,
      payStatHours: 'ساعات الفترة',
      payStatHoursSub: 'المجموع المُدخل في التخطيط',
      payStatVar: 'تكلفة الساعات',
      payStatVarSub: 'الساعات × الأجر بالساعة',
      payStatBase: 'الأجور الأساسية',
      payStatBaseSub: (n, tot) => `${n} من ${tot} في الخدمة خلال الفترة`,
      codeKeep: 'دون تغيير — أدخل 4 أرقام لتغييره',
      tabPlanning: 'الجدول', tabRealised: 'ساعات العمل',
      plNone: '—', plMember: 'العضو', plPlanned: 'مُجدول', plCost: 'التكلفة المتوقعة',
      plApply: 'نقل إلى الساعات', plClear: 'مسح الجدول',
      plFooter: 'إجمالي المجدول',
      plHint: 'انقر على خانة لإدخال ساعات الوردية بالضبط، أو لتحديد يوم راحة.',
      plApplied: (n) => `تم نقل ${n} يوم إلى الساعات.`,
      plNothing: 'لا شيء للنقل: لا توجد ورديات مجدولة في هذه الفترة.',
      plCleared: 'تم مسح الجدول لهذه الفترة.',
      plRest: 'راحة',
      plStart: 'البداية', plEnd: 'النهاية', plDur: 'المدة',
      plSave: 'حفظ', plClearCell: 'إفراغ الخانة',
      plWholeWeek: 'تطبيق على كامل الأسبوع',
      plNextDay: (day, time) => `تنتهي ${day} على ${time}`,
      plNextDayLegend: 'الوردية المعلّمة بـ +1 تنتهي في اليوم التالي. تُحتسب ساعاتها على يوم البداية.',
      plNeedBoth: 'أدخل ساعة البداية وساعة النهاية.',
      plSameTime: 'يجب أن تختلف ساعة النهاية عن ساعة البداية.',
      plWeekOf: (a, b) => `أسبوع من ${a} إلى ${b}`,
      plPrevWeek: 'الأسبوع السابق', plNextWeek: 'الأسبوع التالي',
      plPlannedPeriod: 'مُجدول · الفترة',
      plWeekApplied: (n) => `تم تطبيق الوردية على ${n} يوم.`,
      submitAdd:  'إضافة العضو',
      submitEdit: 'حفظ التعديلات',
      cancel: 'إلغاء',
      delTitle: 'إزالة هذا العضو؟',
      delDesc:  'إجراء نهائي. سيتم تعطيل حساب Kiwi Caisse فورًا.',
      delConfirm: 'إزالة',
      tAdded:    (n) => `تمت إضافة ${n} إلى الفريق`,
      tAddedDesc:(p) => `رمز الصندوق ${p} · جاهز للاستعمال فوراً`,
      tUpdated:  (n) => `${n} · تم تحديث الملف`,
      tDeleted:  (n) => `تمت إزالة ${n} من الفريق`,
      tPwdCopied:'تم نسخ رمز الصندوق',
      tPwdGen:   'تم إنشاء رمز صندوق جديد',
      hPeriodWeek: 'هذا الأسبوع',
      hPeriodFort: 'نصف شهر',
      hPeriodMonth:'هذا الشهر',
      hQuickEntry:'إدخال سريع',
      hExport:    'تصدير CSV',
      hImport:    'استيراد CSV',
      hValidate:  'تأكيد الفترة',
      hMember:    'العضو',
      hTotal:     'إجمالي الساعات',
      hPay:       'الأجر المحتسب',
      hLocked:    'الفترة مقفلة',
      hPeriodLabel: (start, end) => `من ${start} إلى ${end}`,
      hFooterLabel: 'إجمالي الفترة',
      qeTitle: 'إدخال سريع · ساعات',
      qeMember:'العضو',
      qeDate:  'التاريخ',
      qeHours: 'ساعات العمل',
      qeNote:  'ملاحظة (اختياري)',
      qeSave:  'حفظ',
      tHourSaved: (n, h, d) => `${h} ساعات مسجلة · ${n} · ${d}`,
      tExport:    'تم إنشاء تصدير CSV',
      tExportDesc:'الملف جاهز للإرسال إلى محاسبك.',
      tImport:    'استيراد CSV',
      tImportDesc:'أفلت ملفك · يتم التحقق من الرؤوس تلقائيًا.',
      tValidated: (start, end) => `الفترة مقفلة · من ${start} إلى ${end}`,
      tValidatedDesc: 'تم إرسال الساعات إلى الرواتب والتخطيط · أعيد حساب كتلة الأجور.',
      placeholderPwd: '····',
      monthName: ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'],
      dayName:   ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
    },
  };
  const t = () => STR[trLang()] || STR.fr;

  /* ═══════════════ VENUE-AWARE ROLE CATALOGUE ═══════════════ */
  const CATALOG = {
    restaurant: {
      departments: ['Cuisine', 'Salle', 'Bar', 'Caisse', 'Plonge', 'Pâtisserie', 'Management'],
      functions:   ['Chef de cuisine', 'Sous-chef', 'Cuisinier', 'Commis', 'Chef de rang', 'Serveur', "Maître d'hôtel", 'Sommelier', 'Barman', 'Caissier', 'Plongeur', 'Pâtissier', 'Manager', "Hôte d'accueil"],
    },
    cafe: {
      departments: ['Comptoir', 'Salle', 'Pâtisserie', 'Caisse', 'Management'],
      functions:   ['Barista', 'Serveur', 'Caissier', 'Pâtissier', 'Aide-pâtissier', 'Manager', "Hôte d'accueil"],
    },
    pharmacie: {
      departments: ['Comptoir', 'Préparation', 'Caisse', 'Stock', 'Management'],
      functions:   ['Pharmacien titulaire', 'Pharmacien assistant', 'Préparateur en pharmacie', 'Vendeur conseil', 'Caissier', 'Magasinier', 'Manager'],
    },
    spa: {
      departments: ['Coiffure', 'Esthétique', 'Manucure', 'Massage', 'Accueil', 'Caisse', 'Management'],
      functions:   ['Coiffeur', 'Coiffeuse', 'Coloriste', 'Esthéticienne', 'Maquilleuse', 'Manucure', 'Masseur', 'Masseuse', 'Réceptionniste', 'Caissier', 'Manager'],
    },
    boulangerie: {
      departments: ['Fournil', 'Pâtisserie', 'Vente', 'Caisse', 'Management'],
      functions:   ['Boulanger', 'Pâtissier', 'Vendeur', 'Caissier', 'Manager'],
    },
    epicerie: {
      departments: ['Rayons', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur', 'Caissier', 'Magasinier', 'Réassortisseur', 'Manager'],
    },
    boutique: {
      departments: ['Vente', 'Vitrine', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur conseil', 'Caissier', 'Magasinier', 'Visual merchandiser', 'Manager'],
    },
  };
  function unionCatalog() {
    const allDept = new Set(), allFn = new Set();
    Object.values(CATALOG).forEach(c => {
      c.departments.forEach(d => allDept.add(d));
      c.functions.forEach(f => allFn.add(f));
    });
    return { departments: [...allDept].sort((a, b) => a.localeCompare(b, 'fr')),
             functions:   [...allFn].sort((a, b)   => a.localeCompare(b, 'fr')) };
  }
  function catalogFor(venueType) {
    return CATALOG[venueType] || unionCatalog();
  }
  /* The TRADE, which is not the storage key. teamKey() returns a custom venue's
     id so each store keeps its own roster — correct for storage, but it was also
     what picked the role catalogue, and CATALOG['v1mrz…'] misses. Every custom
     venue therefore fell through to unionCatalog(), and a clothing shop was
     offered Bar, Cuisine, Coiffure, Manucure, Massage, Pâtisserie and Plonge as
     departments. Resolve the subtype first (a boulangerie is not a generic
     boutique), then the base family. */
  function tradeKey(venue) {
    if (!venue) return 'restaurant';
    if (venue.subtype && CATALOG[venue.subtype]) return venue.subtype;
    if (venue.type && CATALOG[venue.type]) return venue.type;
    return venue.custom ? 'boutique' : 'restaurant';
  }

  /* ═══════════════ MOCK SEED ═══════════════ */
  const CONTRACT_TYPES = ['CDI', 'CDD', 'Stage', 'Freelance', 'Intérim'];
  const LANGS = ['Français', 'Arabe', 'Anglais', 'Espagnol', 'Tamazight', 'Darija'];
  const AVATAR_TONES = ['a', 'b', 'c', 'd'];
  const AVATAR_COLORS = { a: 'var(--atlas)', b: 'var(--riad)', c: '#B26B0F', d: '#2B5C68' };

  /* The code under "Accès Kiwi Caisse" is what the cashier taps on the till, and
   * the till's pad takes FOUR DIGITS — nothing else can be entered on it. This
   * used to generate a 12-character password, so the value the owner read on a
   * staff profile was one a cashier could not physically type. It is a 4-digit
   * code now, and publishPins() below sends it to the till. */
  function makeCode() {
    try {
      const c = window.crypto || window.msCrypto;
      if (c && c.getRandomValues) {
        const a = new Uint32Array(1); c.getRandomValues(a);
        return String(1000 + (a[0] % 9000));
      }
    } catch (_) {}
    return String(1000 + Math.floor(Math.random() * 9000));
  }
  function isCode(v) { return /^\d{4}$/.test(String(v || '').trim()); }

  /* ═══════════════ PUBLISH THE ROSTER'S CODES TO THE TILL ═══════════════
   * The till does not read this roster: it asks /api/config for the store's
   * staff codes (see the PIN gate in assets/caisse-pairing.js). Only the
   * onboarding wizard ever wrote there, so a cashier hired afterwards had a code
   * on their profile that the till had never heard of — the owner typed it and
   * got "Code incorrect". Every roster change now republishes.
   *
   * /api/config REPLACES the store's whole code list, so we always send the FULL
   * roster — sending only the new hire would silently revoke everyone else,
   * including the owner's own code from onboarding. Real (custom, onboarded)
   * venues only: a demo venue has no session, and pushing seeded demo staff into
   * a real merchant's row is exactly the leak the venue split exists to prevent.
   * Fail-soft — no endpoint, no session, offline: the roster is still saved
   * locally and this is a no-op. */
  function publishPins() {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.();
      if (!venue || !venue.custom) return;                  // demo seed never leaves the browser
      if (!window.KiwiConfig || !window.KiwiConfig.syncPins) return;
      const seen = Object.create(null);
      const pins = [];
      getMembers(teamKey(venue)).forEach((m) => {
        const code = isCode(m.pinCode) ? String(m.pinCode).trim()
          : (isCode(m.password) ? String(m.password).trim() : '');
        if (!code || seen[code]) return;                    // no code yet, or a duplicate
        seen[code] = 1;
        pins.push({ code, name: memberFullName(m), role: m.function || m.department || 'staff' });
      });
      window.KiwiConfig.syncPins(pins);
    } catch (_) {}
  }

  function initials(first, last) {
    const a = (first || '').trim().charAt(0).toUpperCase() || '?';
    const b = (last || '').trim().charAt(0).toUpperCase() || '';
    return a + b;
  }

  function seedFor(venueType) {
    const SEEDS = {
      restaurant: [
        ['Fatima',  'Khalki',    'Management',  'Manager',           'CDI',      8400, 95, ['Français','Arabe','Anglais']],
        ['Mehdi',   'Mansouri',  'Cuisine',     'Chef de cuisine',   'CDI',      9200, 100,['Français','Arabe']],
        ['Sofia',   'Belkadi',   'Bar',         'Barman',            'CDI',      4800, 55, ['Français','Arabe','Anglais','Espagnol']],
        ['Hamid',   'Jelloul',   'Salle',       'Chef de rang',      'CDI',      4600, 52, ['Français','Arabe','Darija']],
        ['Lina',    'Saidi',     'Caisse',      'Caissier',          'CDD',      4200, 48, ['Français','Arabe','Darija']],
        ['Youssef', 'Amrani',    'Salle',       'Serveur',           'Intérim',  3800, 45, ['Arabe','Darija']],
        ['Karim',   'Berrada',   'Cuisine',     'Cuisinier',         'CDI',      5400, 60, ['Français','Arabe']],
        ['Nawal',   'Kettani',   'Pâtisserie',  'Pâtissier',         'CDI',      5200, 58, ['Français','Arabe','Anglais']],
      ],
      cafe: [
        ['Fatima',  'Khalki',    'Management',  'Manager',           'CDI',      7200, 80, ['Français','Arabe','Anglais']],
        ['Sofia',   'Belkadi',   'Comptoir',    'Barista',           'CDI',      4400, 50, ['Français','Arabe','Anglais','Espagnol']],
        ['Hamid',   'Jelloul',   'Salle',       'Serveur',           'CDI',      4000, 46, ['Français','Arabe','Darija']],
        ['Lina',    'Saidi',     'Caisse',      'Caissier',          'CDD',      3800, 44, ['Français','Arabe','Darija']],
        ['Mehdi',   'Mansouri',  'Pâtisserie',  'Pâtissier',         'CDI',      4600, 52, ['Français','Arabe']],
        ['Yassine', 'Errami',    'Comptoir',    'Aide-pâtissier',    'Stage',    2400, 28, ['Arabe','Darija']],
      ],
      pharmacie: [
        ['Dr. Amina','Benhima',  'Management',   'Manager',                  'CDI',     14000, 160,['Français','Arabe','Anglais']],
        ['Karim',   'Benyahya',  'Comptoir',     'Pharmacien titulaire',     'CDI',     12000, 140,['Français','Arabe','Anglais']],
        ['Nadia',   'Lhassani',  'Comptoir',     'Pharmacien assistant',     'CDI',     7800, 88, ['Français','Arabe']],
        ['Soumia',  'El Fakir',  'Préparation',  'Préparateur en pharmacie', 'CDI',     5400, 60, ['Français','Arabe','Darija']],
        ['Hicham',  'Ouazzani',  'Comptoir',     'Vendeur conseil',          'CDD',     4200, 48, ['Arabe','Darija']],
        ['Imane',   'Tazi',      'Caisse',       'Caissier',                 'CDD',     4000, 46, ['Français','Arabe','Darija']],
      ],
      spa: [
        ['Salma',   'Mansouri',  'Management',  'Manager',          'CDI',      8200, 92, ['Français','Arabe','Anglais']],
        ['Ines',    'Cherkaoui', 'Coiffure',    'Coiffeuse',        'CDI',      5400, 60, ['Français','Arabe','Darija']],
        ['Karim',   'Idrissi',   'Coiffure',    'Coloriste',        'CDI',      5600, 62, ['Français','Arabe']],
        ['Lamia',   'Bennani',   'Esthétique',  'Esthéticienne',    'CDI',      4800, 54, ['Français','Arabe','Anglais']],
        ['Hicham',  'El Amri',   'Massage',     'Masseur',          'Freelance',5200, 75, ['Français','Arabe']],
        ['Nadia',   'Lazrak',    'Manucure',    'Manucure',         'CDD',      4000, 46, ['Français','Arabe','Darija']],
        ['Sara',    'Tazi',      'Accueil',     'Réceptionniste',   'CDD',      3800, 44, ['Français','Arabe','Anglais','Darija']],
      ],
      boutique: [
        ['Sara',    'El Idrissi','Management',  'Manager',                'CDI',     7800, 88, ['Français','Arabe','Anglais']],
        ['Yassmine','Ouali',     'Vente',       'Vendeur conseil',        'CDI',     5200, 58, ['Français','Arabe','Anglais']],
        ['Karim',   'Mokri',     'Vente',       'Vendeur conseil',        'CDI',     4800, 54, ['Français','Arabe','Espagnol']],
        ['Mehdi',   'Tahiri',    'Vitrine',     'Visual merchandiser',    'CDD',     4600, 52, ['Français','Arabe']],
        ['Hanae',   'Bensaid',   'Caisse',      'Caissier',               'CDD',     3800, 44, ['Français','Arabe','Darija']],
        ['Reda',    'Bouanani',  'Stock',       'Magasinier',             'Intérim', 3600, 42, ['Arabe','Darija']],
      ],
      boulangerie: [
        ['Driss',   'Lahcen',    'Fournil',     'Boulanger',         'CDI',      4800, 54, ['Arabe','Darija']],
        ['Imane',   'Khattabi',  'Pâtisserie',  'Pâtissier',         'CDI',      5000, 56, ['Français','Arabe']],
        ['Karim',   'Bahaa',     'Vente',       'Vendeur',           'CDD',      3600, 42, ['Arabe','Darija']],
        ['Lamia',   'Saoudi',    'Caisse',      'Caissier',          'CDI',      3800, 44, ['Français','Arabe','Darija']],
        ['Mohamed', 'Rifai',     'Management',  'Manager',           'CDI',      6800, 76, ['Français','Arabe']],
      ],
      epicerie: [
        ['Hassan',  'Bouhdid',   'Rayons',      'Réassortisseur',    'CDD',      3600, 40, ['Arabe','Darija']],
        ['Sofia',   'Naciri',    'Caisse',      'Caissier',          'CDI',      3800, 44, ['Français','Arabe','Darija']],
        ['Karim',   'Lhajji',    'Stock',       'Magasinier',        'CDI',      4000, 46, ['Arabe','Darija']],
        ['Aïcha',   'Mahfoud',   'Rayons',      'Vendeur',           'CDD',      3600, 42, ['Arabe','Darija']],
        ['Mehdi',   'Rachid',    'Management',  'Manager',           'CDI',      6400, 72, ['Français','Arabe','Darija']],
      ],
    };
    const list = SEEDS[venueType] || SEEDS.restaurant;
    return list.map((row, i) => {
      const [first, last, dept, fn, contract, salary, rate, langs] = row;
      const startDate = new Date(); startDate.setDate(1); startDate.setMonth(startDate.getMonth() - (3 + i));
      return {
        id: 'mem-' + Math.random().toString(36).slice(2, 9),
        firstName: first,
        lastName: last,
        email: (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + '@kiwi.ma',
        phone: '+212 6 ' + (10 + i) + ' ' + (40 + i * 3) + ' ' + (10 + i * 2) + ' ' + (20 + i),
        password: makeCode(),
        function: fn,
        department: dept,
        contract,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: (contract === 'CDD' || contract === 'Stage')
          ? new Date(startDate.getTime() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10)
          : '',
        baseSalary: salary,
        hourlyRate: rate,
        languages: langs,
        address: ['Rue 12, Maarif, Casablanca', 'Bd Mohammed V, Rabat', 'Rue Lalla Yacout, Casablanca', 'Av. Hassan II, Marrakech', 'Rue Ibn Khaldoun, Tanger'][i % 5],
        cin: ['BK', 'AB', 'JC', 'TK', 'MR'][i % 5] + ' ' + (300000 + i * 4317),
        emergencyName: ['Karim Belkadi','Sofia Mansouri','Hassan Berrada','Nadia Tazi','Hicham Lhassani'][i % 5],
        emergencyPhone: '+212 6 22 ' + (30 + i * 2) + ' ' + (10 + i * 3) + ' ' + (40 + i),
        notes: ['Disponible week-end','Demande horaires aménagés mardi','Allergies alimentaires connues','Permis B','—'][i % 5],
        avatarTone: AVATAR_TONES[i % AVATAR_TONES.length],
        venueType,
        createdAt: Date.now() - i * 1000 * 60 * 60 * 24,
      };
    });
  }

  /* ═══════════════ HOURS SEED ═══════════════ */
  function seedHours(members, periodDays) {
    const map = {};
    members.forEach(m => {
      map[m.id] = {};
      for (let d = 0; d < periodDays.length; d++) {
        const date = periodDays[d];
        const isOff = (Math.floor(Math.random() * 7) === 0);
        map[m.id][date] = isOff ? 0 : (4 + Math.floor(Math.random() * 5)) + (Math.random() < 0.3 ? 0.5 : 0);
      }
    });
    return map;
  }

  /* ═══════════════ ROOT STATE ═══════════════ */
  if (!window.__kiwiTeamV2) window.__kiwiTeamV2 = { byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, periodKind: 'week', periodLocked: false };
  if (!window.__kiwiTeamV2.shiftsByVenue) window.__kiwiTeamV2.shiftsByVenue = {};

  /* ── PLANNING ────────────────────────────────────────────────────────────
   * La page s'appelle « Paie & planning » et ne savait que constater : une
   * grille d'heures DÉJÀ faites. Impossible d'affecter qui que ce soit à un
   * service — le commerçant ne pouvait pas planifier, seulement compter après
   * coup.
   *
   * Un service n'est PAS un créneau à prendre dans une liste. Les quatre
   * presets (Matin 9h-13h, Après-midi 13h-18h, Journée, Soir) décrivaient une
   * seule façon de tenir boutique : celui qui ouvre à 8h30, ferme à 23h ou
   * fait 11h-15h n'avait rien à cliquer et devait mentir sur son planning.
   * On stocke donc deux heures exactes — { start:'HH:MM', end:'HH:MM' } — et
   * { off:true } pour un jour de repos, qui est une décision (« tu ne viens
   * pas ») et pas la même chose qu'une case vide (« pas encore décidé »).
   *
   * Un service qui finit après minuit finit le LENDEMAIN : 21:00 → 03:00,
   * c'est 3 h du matin mardi, pas lundi. La durée passe donc par minuit au
   * lieu de soustraire bêtement — sinon la nuit du samedi comptait −18 h et
   * emportait le total de la semaine avec elle. Les heures restent comptées
   * sur le jour de DÉBUT (convention de paie), et l'écran le dit. */
  const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  /* Ancien format : quatre ids de presets. Un planning déjà saisi ne doit pas
   * s'évaporer parce qu'on a changé de modèle — on le relit en heures. */
  const LEGACY_SHIFTS = {
    matin:   { start: '09:00', end: '13:00' },
    aprem:   { start: '13:00', end: '18:00' },
    journee: { start: '09:00', end: '18:00' },
    soir:    { start: '18:00', end: '00:00' },
    repos:   { off: true },
  };
  function normShift(v) {
    if (typeof v === 'string') return LEGACY_SHIFTS[v] || null;
    if (!v || typeof v !== 'object') return null;
    if (v.off) return { off: true };
    if (!HHMM_RE.test(v.start || '') || !HHMM_RE.test(v.end || '')) return null;
    return { start: v.start, end: v.end };
  }
  const hhmmToMin = (s) => (+s.slice(0, 2)) * 60 + (+s.slice(3, 5));
  function shiftMinutes(v) {
    const s = normShift(v);
    if (!s || s.off) return 0;
    const a = hhmmToMin(s.start), b = hhmmToMin(s.end);
    if (b === a) return 0;                       // refusé à la saisie ; 0 plutôt qu'un 24 h muet
    return b > a ? b - a : (1440 - a) + b;       // 21:00 → 03:00 = 6 h, pas −18 h
  }
  const shiftHours = (v) => shiftMinutes(v) / 60;
  /* Fin ≤ début ⇒ on a franchi minuit. 18:00 → 00:00 en fait partie : minuit,
   * c'est déjà demain. */
  function shiftIsNextDay(v) {
    const s = normShift(v);
    return !!(s && !s.off && hhmmToMin(s.end) <= hhmmToMin(s.start));
  }
  function fmtDur(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    return m ? `${h} h ${pad(m)}` : `${h} h`;
  }
  /* new Date('2026-07-20') = minuit UTC : au Maroc ça retombe la veille selon
   * la saison. Une date de planning se lit en local, chiffre par chiffre. */
  function fromISO(d) {
    const p = String(d || '').split('-').map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function getShifts(venueType) { return window.__kiwiTeamV2.shiftsByVenue[venueType] || {}; }
  /* Les deux grilles — planifié et réalisé — partagent le même sélecteur de
   * période : elles doivent toujours parler de la même semaine. */
  function periodPillsHtml(T) {
    const kind = window.__kiwiTeamV2.periodKind || 'week';
    return [
      ['week',      T.hPeriodWeek],
      ['fortnight', T.hPeriodFort],
      ['month',     T.hPeriodMonth],
    ].map(([k, label]) => `<button class="eq-pill${kind === k ? ' on' : ''}" type="button" data-action="kt-period" data-arg="${k}">${esc(label)}</button>`).join('');
  }

  /* A team is stored per venue. DEMO venues keep their type-keyed, in-memory
     demo seed (unchanged). A REAL (custom/onboarded) venue is keyed by its own
     id, starts EMPTY, and persists to localStorage — so a new store builds its
     own team and it survives a reload, with no demo staff leaking in. */
  function teamKey(venue) { return (venue && venue.custom) ? venue.id : ((venue && venue.type) || 'restaurant'); }
  const DEMO_TYPE_KEYS = new Set(['restaurant', 'boutique', 'spa', 'hotel']);
  /* venues.js les déclare transitoires et « never persisted » : 'scoped' est la
   * vue opérateur sur le client de quelqu'un d'autre, 'own' un placeholder de
   * session. Ils arrivaient pourtant dans kiwiTeamV2:custom — de l'état
   * opérateur écrit dans le stockage d'un commerçant. On ne les lit ni ne les
   * écrit plus, ce qui purge aussi les seaux déjà déposés. */
  const TRANSIENT_KEYS = new Set(['scoped', 'own']);
  const persistableTeamKey = (k) => !DEMO_TYPE_KEYS.has(k) && !TRANSIENT_KEYS.has(k);
  const LS_TEAM = 'kiwiTeamV2:custom';
  function loadCustomTeams() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_TEAM) || '{}');
      const root = window.__kiwiTeamV2;
      Object.keys(raw.byVenue || {}).forEach((k) => {
        if (persistableTeamKey(k)) {
          root.byVenue[k] = raw.byVenue[k];
          root.hoursByVenue[k] = (raw.hoursByVenue || {})[k] || {};
          root.shiftsByVenue[k] = (raw.shiftsByVenue || {})[k] || {};
        }
      });
    } catch (_) {}
  }
  /* L'écriture locale, et rien d'autre. Séparée de saveCustomTeams() parce que
   * la copie serveur, en redescendant, doit pouvoir se poser sans redéclencher
   * une remontée : sinon deux appareils se renvoient la balle indéfiniment. */
  function persistTeams() {
    try {
      const root = window.__kiwiTeamV2;
      const out = { byVenue: {}, hoursByVenue: {}, shiftsByVenue: {} };
      Object.keys(root.byVenue).forEach((k) => {
        if (persistableTeamKey(k)) {
          out.byVenue[k] = root.byVenue[k];
          out.hoursByVenue[k] = root.hoursByVenue[k] || {};
          out.shiftsByVenue[k] = root.shiftsByVenue[k] || {};
        }
      });
      localStorage.setItem(LS_TEAM, JSON.stringify(out));
    } catch (_) {}
  }
  function afterTeamChange() {
    // Every roster change reaches the till from here — one place, so a future
    // mutation path can't forget to publish and quietly leave a cashier locked out.
    publishPins();
    /* La carte Équipe de l'accueil lit ce roster. Sans ce signal elle gardait
     * l'état du chargement : on saisissait les heures sur Paie, on revenait à
     * l'accueil, et elle annonçait encore « 0 sur 3 en service » jusqu'au
     * prochain rechargement. */
    try { window.dispatchEvent(new Event('kiwi-team-changed')); } catch (_) {}
  }
  function saveCustomTeams() {
    persistTeams();
    afterTeamChange();
    teamCloudPush();
  }
  loadCustomTeams();
  window.addEventListener('pagehide', saveCustomTeams);

  /* ═══════════════ LA COPIE SERVEUR ═══════════════════════════════════════
   * Ce roster n'avait AUCUN appel réseau. Vingt salariés, leurs contrats, leurs
   * taux horaires, et quatre semaines de planning ne vivaient que dans le
   * localStorage du navigateur qui les avait saisis : le commerçant ouvrait Kiwi
   * sur l'iPad du comptoir et trouvait une équipe vide, avec une masse salariale
   * à zéro. La page s'appelle « Paie & planning » — c'est de l'argent, et il
   * faut le ressaisir à chaque appareil.
   *
   * On miroite donc par MAGASIN vers /api/store (assets/cloud-doc.js), qui porte
   * les trois règles : ne jamais perdre de donnée sur une panne, ne jamais
   * écraser l'autre appareil, ne jamais pousser avant d'avoir lu.
   *
   * La clé est le slug du magasin, pas `teamKey()`. teamKey d'une venue
   * personnalisée EST son identifiant de venue, que venues.js tire de l'horloge
   * à la création ou du slug à l'adoption : deux navigateurs du même commerçant
   * ne s'accordent jamais dessus. cloud-doc.js fait la traduction.
   *
   * Le stockage local, lui, ne bouge pas d'un octet : kiwiTeamV2:custom garde
   * ses seaux par venue, et toutes les lectures existantes trouvent leur roster
   * là où il a toujours été. */
  function teamVenueKey() {
    try {
      const v = window.KiwiVenue?.getCurrentVenueData?.();
      // Un magasin de démonstration garde son équipe semée en mémoire : elle
      // n'appartient à aucun compte et ne doit jamais quitter ce navigateur.
      if (!v || !v.custom) return '';
      const k = teamKey(v);
      return persistableTeamKey(k) ? k : '';
    } catch (_) { return ''; }
  }

  /* A member belongs to one store, never to the whole account. Older records
   * only carry `venueType` (the browser-local venue id); newer ones also carry
   * the stable store slug. Keep unknown legacy ids — another device cannot
   * resolve them — but reject an id we can positively resolve to another store.
   * This heals rosters that were merged before team documents became per-store
   * without guessing about records whose origin cannot be proved. */
  function teamSlug() {
    const k = teamVenueKey();
    try { return k && window.KiwiCloudDoc ? window.KiwiCloudDoc.slugFor(k) : ''; }
    catch (_) { return ''; }
  }
  function memberBelongsToStore(member, slug) {
    if (!member || !slug) return true;
    if (member.venueSlug) return String(member.venueSlug) === slug;
    try {
      const legacy = member.venueType && window.KiwiCloudDoc
        ? window.KiwiCloudDoc.slugFor(member.venueType) : '';
      return !legacy || legacy === slug;
    } catch (_) { return true; }
  }
  function scopeTeamDoc(doc, slug) {
    const src = doc || {};
    const members = (Array.isArray(src.members) ? src.members : [])
      .filter((m) => memberBelongsToStore(m, slug));
    const alive = Object.create(null);
    members.forEach((m) => { if (m && m.id) alive[m.id] = 1; });
    return {
      members,
      hours: mergeByDay(src.hours, null, alive),
      shifts: mergeByDay(src.shifts, null, alive),
    };
  }

  /* Fusion. Union des membres, cet appareil prioritaire sur un id connu des deux
   * côtés. Un salarié supprimé ici et présent là-bas REVIENT — c'est assumé :
   * entre ressusciter une ligne qu'il faut resupprimer et perdre un salarié avec
   * son contrat et ses heures, seul le second est irréparable.
   *
   * Heures et plannings sont fusionnés case par case (salarié × jour), pas en
   * bloc : deux responsables qui remplissent deux semaines différentes du même
   * planning doivent obtenir les deux semaines, pas la dernière enregistrée. */
  function mergeByDay(mine, theirs, alive) {
    const out = {};
    const put = (src) => Object.keys(src || {}).forEach((mid) => {
      if (alive && !alive[mid]) return;               // salarié disparu des deux côtés
      const days = src[mid] || {};
      const dst = out[mid] || (out[mid] = {});
      Object.keys(days).forEach((d) => { if (!(d in dst)) dst[d] = days[d]; });
    });
    put(mine); put(theirs);                            // le nôtre pose sa case en premier
    return out;
  }
  function mergeTeamDoc(mine, theirs) {
    const slug = teamSlug();
    mine = scopeTeamDoc(mine, slug);
    theirs = scopeTeamDoc(theirs, slug);
    const seen = Object.create(null);
    const members = [];
    const take = (m) => { const id = m && m.id; if (!id || seen[id]) return; seen[id] = 1; members.push(m); };
    ((mine && mine.members) || []).forEach(take);
    ((theirs && theirs.members) || []).forEach(take);
    return {
      members,
      hours: mergeByDay(mine && mine.hours, theirs && theirs.hours, seen),
      shifts: mergeByDay(mine && mine.shifts, theirs && theirs.shifts, seen),
    };
  }

  let teamCloud = null;
  function teamCloudInit() {
    if (teamCloud || !window.KiwiCloudDoc) return teamCloud;
    teamCloud = window.KiwiCloudDoc.attach({
      feature: 'team',
      slug: () => window.KiwiCloudDoc.slugFor(teamVenueKey()),
      read: () => {
        const k = teamVenueKey();
        const root = window.__kiwiTeamV2;
        if (!k) return { members: [], hours: {}, shifts: {} };
        return scopeTeamDoc({
          members: root.byVenue[k] || [],
          hours: root.hoursByVenue[k] || {},
          shifts: root.shiftsByVenue[k] || {},
        }, teamSlug());
      },
      write: (doc) => {
        const k = teamVenueKey();
        if (!k || !doc) return;
        const root = window.__kiwiTeamV2;
        const clean = scopeTeamDoc(doc, teamSlug());
        root.byVenue[k] = clean.members;
        root.hoursByVenue[k] = clean.hours;
        root.shiftsByVenue[k] = clean.shifts;
        persistTeams();          // surtout PAS saveCustomTeams : pas de re-remontée
        afterTeamChange();       // le till et la carte d'accueil apprennent l'équipe
      },
      merge: mergeTeamDoc,
      isEmpty: (d) => !d || !(d.members && d.members.length),
      // Le roster vient d'arriver du serveur : la page ouverte doit le montrer,
      // sinon le commerçant regarde une équipe vide qui n'existe plus.
      onPulled: () => { if (pageActive) { try { render(); } catch (_) {} } },
    });
    return teamCloud;
  }
  function teamCloudBind() {
    const c = teamCloudInit();
    if (c) c.bind();
  }
  function teamCloudPush() {
    const c = teamCloudInit();
    if (c) c.push();
  }

  function ensureVenueData(venue) {
    const root = window.__kiwiTeamV2;
    const key = teamKey(venue);
    if (!root.byVenue[key]) root.byVenue[key] = (venue && venue.custom) ? [] : seedFor((venue && venue.type) || 'restaurant');
    if (venue && venue.custom) {
      const slug = (() => { try { return window.KiwiCloudDoc?.slugFor?.(key) || ''; } catch (_) { return ''; } })();
      if (slug) {
        const before = root.byVenue[key];
        const kept = before.filter((m) => memberBelongsToStore(m, slug));
        if (kept.length !== before.length) {
          root.byVenue[key] = kept;
          const alive = Object.create(null);
          kept.forEach((m) => { if (m && m.id) alive[m.id] = 1; });
          root.hoursByVenue[key] = mergeByDay(root.hoursByVenue[key], null, alive);
          root.shiftsByVenue[key] = mergeByDay(root.shiftsByVenue[key], null, alive);
          persistTeams();
          setTimeout(() => { afterTeamChange(); teamCloudPush(); }, 0);
        }
      }
    }
    // seedHours() invents 4–8 h a day so the pitch demo looks staffed. A REAL
    // store must never be handed hours nobody worked: those hours are now money
    // on Paie & planning ("à payer · période" = base salaries + hours × rate), so
    // seeding one would quote the owner a wage bill for a shift that never
    // happened. A real store starts at zero and fills in from the planning grid.
    if (!root.hoursByVenue[key]) {
      root.hoursByVenue[key] = (venue && venue.custom)
        ? {}
        : seedHours(root.byVenue[key], buildPeriod(root.periodKind).days);
    }
    return root;
  }
  function getMembers(venueType) { return window.__kiwiTeamV2.byVenue[venueType] || []; }
  function getHours(venueType) { return window.__kiwiTeamV2.hoursByVenue[venueType] || {}; }

  /* ═══════════════ PERIOD UTILS ═══════════════ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtFr(d) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
  function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function buildPeriod(kind) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let start, end;
    if (kind === 'fortnight') {
      const day = today.getDay();
      start = new Date(today); start.setDate(today.getDate() - ((day + 6) % 7) - 7);
      end = new Date(start); end.setDate(start.getDate() + 13);
    } else if (kind === 'month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else {
      const day = today.getDay();
      start = new Date(today); start.setDate(today.getDate() - ((day + 6) % 7));
      end = new Date(start); end.setDate(start.getDate() + 6);
    }
    const days = [];
    const cur = new Date(start);
    while (cur <= end) { days.push(toISO(cur)); cur.setDate(cur.getDate() + 1); }
    return { start: toISO(start), end: toISO(end), startFr: fmtFr(start), endFr: fmtFr(end), days };
  }

  function todayLongLabel() {
    const T = t();
    const d = new Date();
    return `${T.dayName[d.getDay()]} ${d.getDate()} ${T.monthName[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* ═══════════════ STATE ═══════════════ */
  let activeTab = 'profiles';
  /* Paie & planning ouvre sur le PLANNING : c'est la moitié de la page qui
   * n'existait pas, et les heures réelles restent à un clic. */
  let payTab = 'planning';
  /* Quelle semaine de la période le planning montre — voir weekChunks(). */
  let planWeekIdx = 0;
  let activeFilters = { search: '', dept: '', contract: '', lang: '' };
  let pageActive = false;
  // Which of this module's two pages is on screen: 'equipe' | 'payroll' | null.
  // Every handler already re-renders through `if (pageActive) render()`, so
  // routing inside render() is what lets editing hours from Paie repaint Paie
  // instead of silently repainting the hidden Équipe section.
  let pageMode = null;
  let unsubscribeVenue = null;
  let unsubscribeLang = null;

  /* ═══════════════ HELPERS ═══════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const memberFullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || '—';
  function isCustomVenue() { const KV = window.KiwiVenue; return !!(KV && KV.isCustom && KV.isCustom()); }

  function fmtMad(n) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' MAD';
  }

  function memberMatchesFilters(m) {
    const { search, dept, contract, lang } = activeFilters;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${memberFullName(m)} ${m.function} ${m.department} ${m.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (dept && m.department !== dept) return false;
    if (contract && m.contract !== contract) return false;
    if (lang && !(m.languages || []).includes(lang)) return false;
    return true;
  }

  /* ═══════════════ SVG ICONS ═══════════════ */
  const svgIcon = (path, sz = 14) => `<svg width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const IC = {
    plus:     '<path d="M12 5v14M5 12h14"/>',
    search:   '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    edit:     '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/>',
    trash:    '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
    eye:      '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    refresh:  '<path d="M1 4v6h6M23 20v-6h-6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.64A9 9 0 0020.49 15"/>',
    copy:     '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    download: '<path d="M12 3v12M5 10l7 7 7-7M5 21h14"/>',
    upload:   '<path d="M12 21V9M5 14l7-7 7 7M5 3h14"/>',
    check:    '<path d="M5 12l5 5L20 7"/>',
    lock:     '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
    users:    '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
    userCheck:'<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M17 11l2 2 4-4"/>',
    wallet:   '<path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1"/><path d="M21 12h-5a2 2 0 100 4h5"/>',
    timer:    '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6M12 2v3"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  };

  /* ═══════════════ PAGE SHOW / HIDE ═══════════════ */
  function showPage() {
    const T = t();
    pageActive = true;
    pageMode = 'equipe';
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('equipe');
    else document.body.classList.add('page-equipe');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = `Accueil <span class="sep">/</span> <b>${esc(T.breadcrumb)}</b>`;
    window.Kiwi?.setActivePage?.('equipe');
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="equipe"]')?.classList.add('active');
    window.scrollTo({ top: 0 });

    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    ensureVenueData(venue);

    /* Re-render when the venue or language changes. */
    if (!unsubscribeVenue && window.KiwiVenue?.subscribe) {
      unsubscribeVenue = window.KiwiVenue.subscribe(() => {
        if (!pageActive) return;
        const v2 = window.KiwiVenue.getCurrentVenueData();
        ensureVenueData(v2);
        render();
      });
    }
    if (!unsubscribeLang && window.KiwiI18n?.onLangChange) {
      window.KiwiI18n.onLangChange(() => { if (pageActive) render(); });
      unsubscribeLang = true;
    }
    render();
  }

  function showDashboard() {
    if (!pageActive) return;
    pageActive = false;
    pageMode = null;
    document.body.classList.remove('page-equipe');
    const bc = document.querySelector('.breadcrumb');
    if (bc) bc.innerHTML = 'Accueil <span class="sep">/</span> <b>Tableau de bord</b>';
    if (unsubscribeVenue) { try { unsubscribeVenue(); } catch (_) {} unsubscribeVenue = null; }
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* ═══════════════ RENDER ═══════════════ */
  function render() {
    // L'éditeur de service est ancré sur une case : la case disparaît, lui aussi.
    closeShiftPop();
    if (pageMode === 'payroll') { showPayroll(); return; }
    const root = document.querySelector('[data-equipe-root]');
    if (!root) return;
    root.removeAttribute('hidden');
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    root.innerHTML = `
      ${renderHeader(T, venue, members)}
      ${renderTabs(T)}
      ${activeTab === 'profiles' ? renderProfilesPane(T, venue, venueType, members) : renderHoursPane(T, venue, venueType, members)}
    `;
    /* Re-bind the live search field after each render. */
    const sb = root.querySelector('[data-kt-search]');
    if (sb) sb.addEventListener('input', (e) => {
      activeFilters.search = e.target.value;
      clearTimeout(window.__kiwiTeamSearchTimer);
      window.__kiwiTeamSearchTimer = setTimeout(() => {
        rerenderProfilesGrid();
      }, 120);
    });
  }

  function rerenderProfilesGrid() {
    if (activeTab !== 'profiles') return;
    const root = document.querySelector('[data-equipe-root]');
    if (!root) return;
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    const target = root.querySelector('[data-kt-grid-host]');
    if (!target) return;
    const visible = members.filter(memberMatchesFilters);
    target.innerHTML = visible.length === 0
      ? `<div class="eq-section" style="text-align:center; color:var(--n-500); padding:36px 14px;">${esc(T.noMatch)}</div>`
      : renderMembersTable(T, visible);
    /* Also keep the badge count fresh */
    const badge = root.querySelector('[data-kt-count-badge]');
    if (badge) badge.textContent = T.secAllMembersBadge(visible.length);
  }

  /* ═══════════════ HEADER ═══════════════ */
  function renderHeader(T, venue, members) {
    return `
      <div class="eq-head">
        <div>
          <div class="eq-title">${esc(T.title)}</div>
          <div class="eq-date">${esc(T.subDate(todayLongLabel()))}</div>
        </div>
        <div class="eq-head-acts">
          <button class="btn-slim" type="button" data-action="kt-export-csv">${svgIcon(IC.download, 13)}<span>${esc(T.exportCsv)}</span></button>
          <button class="btn-slim primary" type="button" data-action="kt-add-member">${svgIcon(IC.plus, 13)}<span>${esc(T.addMember)}</span></button>
        </div>
      </div>
    `;
  }

  /* ═══════════════ TABS ═══════════════ */
  function renderTabs(T) {
    return `
      <div class="eq-filters">
        <div class="eq-pill-row">
          <button class="eq-pill${activeTab === 'profiles' ? ' on' : ''}" type="button" data-action="kt-tab" data-arg="profiles">${esc(T.tabProfiles)}</button>
          <button class="eq-pill${activeTab === 'hours'    ? ' on' : ''}" type="button" data-action="kt-tab" data-arg="hours">${esc(T.tabHours)}</button>
        </div>
      </div>
    `;
  }

  /* ═══════════════ PROFILES PANE ═══════════════ */
  function renderProfilesPane(T, venue, venueType, members) {
    const cat = catalogFor(tradeKey(venue));
    /* Stats */
    const totalMembers = members.length;
    const monthlyPayroll = members.reduce((acc, m) => acc + (m.baseSalary || 0), 0);
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    const hours = getHours(venueType);
    /* « En service aujourd'hui » valait headcount × 0,75 arrondi : un nombre
     * inventé, présenté au commerçant comme un pointage. Sur deux personnes il
     * affichait donc toujours 2 — y compris quand personne n'avait saisi la
     * moindre heure — pendant que Paie & planning comptait honnêtement 0 à
     * partir des mêmes données. Deux pages, un seul effectif, deux réponses
     * opposées, et c'est celle d'Équipe qui était fausse. Une vraie boutique
     * compte les membres ayant des heures aujourd'hui, avec EXACTEMENT la
     * définition de Paie (onDuty) ; la démo garde son estimation. */
    const todayKey = toISO(new Date());
    const present = isCustomVenue()
      ? members.filter((m) => (+((hours[m.id] || {})[todayKey]) || 0) > 0).length
      : Math.max(0, Math.round(totalMembers * 0.75));
    let totalHours = 0;
    members.forEach(m => {
      const row = hours[m.id] || {};
      period.days.forEach(d => totalHours += (+row[d] || 0));
    });
    const tile = (label, value, sub, vClass) => `
      <div class="eq-stat">
        <div class="eq-stat-l"><span>${esc(label)}</span></div>
        <div class="eq-stat-v ${vClass || ''}">${value}</div>
        <div class="eq-stat-sub">${esc(sub)}</div>
      </div>`;
    const stats = `
      <div class="eq-stats">
        ${tile(T.statTotal,   String(totalMembers),                   T.statTotalSub(totalMembers, venue.name))}
        ${tile(T.statPresent, String(present),                        T.statPresentSub)}
        ${tile(T.statPayroll, fmtMad(monthlyPayroll),                 T.statPayrollSub)}
        ${tile(T.statHours,   totalHours.toFixed(1).replace('.', ',') + ' h', T.statHoursSub)}
      </div>
    `;

    /* Filter pill rows */
    const deptList = ['<button class="eq-pill' + (!activeFilters.dept ? ' on' : '') + '" type="button" data-action="kt-filter-dept" data-arg="">' + esc(T.filterAllDept) + '</button>',
      ...cat.departments.map(d => `<button class="eq-pill${activeFilters.dept === d ? ' on' : ''}" type="button" data-action="kt-filter-dept" data-arg="${esc(d)}">${esc(d)}</button>`)].join('');
    const ctList = ['<button class="eq-pill' + (!activeFilters.contract ? ' on' : '') + '" type="button" data-action="kt-filter-contract" data-arg="">' + esc(T.filterAllContract) + '</button>',
      ...CONTRACT_TYPES.map(c => `<button class="eq-pill${activeFilters.contract === c ? ' on' : ''}" type="button" data-action="kt-filter-contract" data-arg="${esc(c)}">${esc(c)}</button>`)].join('');

    const visible = members.filter(memberMatchesFilters);

    return `
      ${stats}

      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.secAllMembers)}</h3>
          <span class="eq-count-badge" data-kt-count-badge>${esc(T.secAllMembersBadge(visible.length))}</span>
        </div>

        <div class="kt-searchbar">
          <span class="kt-searchbar-ic">${svgIcon(IC.search, 14)}</span>
          <input type="text" placeholder="${esc(T.searchPh)}" value="${esc(activeFilters.search)}" data-kt-search />
        </div>

        <div class="eq-filters" style="margin-top:14px;">
          <div class="eq-pill-row">${deptList}</div>
          <div class="eq-pill-row">${ctList}</div>
        </div>

        <div data-kt-grid-host style="margin-top:14px;">
          ${visible.length === 0
            ? `<div style="padding:36px 14px;text-align:center;color:var(--n-500);font-size:13px;background:var(--paper-soft);border:1px dashed var(--n-300);border-radius:12px;">${esc(T.noMatch)}</div>`
            : renderMembersTable(T, visible)}
        </div>
      </div>
    `;
  }

  function renderMembersTable(T, list) {
    const rows = list.map(m => {
      const ini = initials(m.firstName, m.lastName);
      const tone = m.avatarTone || 'a';
      const contractTone = m.contract === 'CDI' ? 'ok' : (m.contract === 'CDD' || m.contract === 'Stage') ? 'pend' : 'neutral';
      const contractCls = contractTone === 'ok' ? 'kt-tag kt-tag-ok'
        : contractTone === 'pend' ? 'kt-tag kt-tag-pend'
        : 'kt-tag kt-tag-neutral';
      const langChips = (m.languages || []).slice(0, 3).map(l => `<span class="kt-langchip">${esc(l)}</span>`).join('') + ((m.languages || []).length > 3 ? `<span class="kt-langchip">+${(m.languages || []).length - 3}</span>` : '');
      return `
        <tr class="eq-row-in">
          <td>
            <div class="eq-member">
              <span class="eq-av md" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(ini)}</span>
              <div>
                <div class="eq-member-name">${esc(memberFullName(m))}</div>
                <div class="eq-member-role">${esc(m.email || '—')}</div>
              </div>
            </div>
          </td>
          <td><div class="kt-cell-strong">${esc(m.function)}</div></td>
          <td><span class="eq-venue-badge">${esc(m.department)}</span></td>
          <td><span class="${contractCls}">${esc(m.contract || '—')}</span></td>
          <td><div class="kt-chips">${langChips || '<span class="eq-cell-empty">—</span>'}</div></td>
          <td><div class="eq-salary-v">${fmtMad(m.baseSalary)}</div><div class="eq-salary-sub">${(m.hourlyRate || 0).toLocaleString('fr-FR')} MAD/h</div></td>
          <td>
            <div class="eq-actions">
              <button class="eq-icon-btn" type="button" data-action="kt-view-profile" data-arg="${esc(m.id)}" aria-label="${esc(T.viewProfile)}" title="${esc(T.viewProfile)}">${svgIcon(IC.eye, 14)}</button>
              <button class="eq-icon-btn" type="button" data-action="kt-edit-member"  data-arg="${esc(m.id)}" aria-label="${esc(T.editBtn)}" title="${esc(T.editBtn)}">${svgIcon(IC.edit, 14)}</button>
              <button class="eq-icon-btn" type="button" data-action="kt-delete-member" data-arg="${esc(m.id)}" aria-label="${esc(T.deleteBtn)}" title="${esc(T.deleteBtn)}" style="color:var(--n-500);">${svgIcon(IC.trash, 14)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    return `
      <div class="eq-table-wrap">
        <table class="eq-table">
          <thead>
            <tr>
              <th>${esc(T.colMember)}</th>
              <th>${esc(T.colFunction)}</th>
              <th>${esc(T.colDepartment)}</th>
              <th>${esc(T.colContract)}</th>
              <th>${esc(T.colLanguages)}</th>
              <th>${esc(T.colSalary)}</th>
              <th class="eq-num">${esc(T.colActions)}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  /* ═══════════════ HOURS PANE ═══════════════ */
  function renderHoursPane(T, venue, venueType, members) {
    const root = window.__kiwiTeamV2;
    const periodKind = root.periodKind || 'week';
    const period = buildPeriod(periodKind);
    const hours = getHours(venueType);
    /* Ensure rows exist for every member */
    members.forEach(m => {
      if (!hours[m.id]) hours[m.id] = {};
      period.days.forEach(d => { if (hours[m.id][d] == null) hours[m.id][d] = 0; });
    });

    const locked = root.periodLocked;
    let grandHours = 0, grandPay = 0;

    const headDays = period.days.map(d => {
      const dt = new Date(d);
      const dayLbl = dt.toLocaleDateString(trLang() === 'en' ? 'en-US' : 'fr-FR', { weekday: 'short' });
      return `<th class="kt-day-head"><span class="d">${pad(dt.getDate())}</span><span class="m">${dayLbl}</span></th>`;
    }).join('');

    const rows = members.map(m => {
      const row = hours[m.id] || {};
      let total = 0;
      const cells = period.days.map(d => {
        const v = +(row[d] || 0);
        total += v;
        const isToday = (d === toISO(new Date()));
        return `<td class="kt-day-cell${isToday ? ' today' : ''}${locked ? ' locked' : ''}">
          <input type="number" step="0.25" min="0" max="24" value="${v}" data-kt-hour data-mid="${esc(m.id)}" data-day="${esc(d)}" ${locked ? 'disabled' : ''} />
        </td>`;
      }).join('');
      const pay = total * (m.hourlyRate || 0);
      grandHours += total;
      grandPay += pay;
      const tone = m.avatarTone || 'a';
      return `
        <tr>
          <td class="kt-h-member">
            <span class="eq-av sm" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <div>
              <div class="n">${esc(memberFullName(m))}</div>
              <div class="r">${esc(m.function)}</div>
            </div>
          </td>
          ${cells}
          <td class="kt-h-total mono"><b>${total.toFixed(2).replace('.', ',')}</b><span>h</span></td>
          <td class="kt-h-pay mono"><b>${pay.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</b><span>MAD</span></td>
        </tr>
      `;
    }).join('');

    const periodPills = periodPillsHtml(T);

    return `
      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.tabHours)}</h3>
          <span class="eq-count-badge">${esc(T.hPeriodLabel(period.startFr, period.endFr))}${locked ? ' · ' + esc(T.hLocked) : ''}</span>
        </div>

        <div class="kt-hbar">
          <div class="eq-pill-row">${periodPills}</div>
          <div class="kt-hbar-right">
            <button class="btn-slim" type="button" data-action="kt-quick-entry">${svgIcon(IC.plus, 13)}<span>${esc(T.hQuickEntry)}</span></button>
            <button class="btn-slim" type="button" data-action="kt-export-csv">${svgIcon(IC.download, 13)}<span>${esc(T.hExport)}</span></button>
            <button class="btn-slim" type="button" data-action="kt-import-csv">${svgIcon(IC.upload, 13)}<span>${esc(T.hImport)}</span></button>
            <button class="btn-slim ${locked ? '' : 'primary'}" type="button" data-action="kt-validate-period" ${locked ? 'disabled' : ''}>
              ${locked ? svgIcon(IC.lock, 13) : svgIcon(IC.check, 13)}<span>${esc(locked ? T.hLocked : T.hValidate)}</span>
            </button>
          </div>
        </div>

        <div class="kt-h-tablewrap">
          <table class="kt-h-table">
            <thead>
              <tr>
                <th class="kt-h-memberhead">${esc(T.hMember)}</th>
                ${headDays}
                <th class="kt-h-totalhead">${esc(T.hTotal)}</th>
                <th class="kt-h-totalhead">${esc(T.hPay)}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td class="kt-h-foot-label">${esc(T.hFooterLabel)}</td>
                <td colspan="${period.days.length}"></td>
                <td class="kt-h-foot-tot mono"><b>${grandHours.toFixed(2).replace('.', ',')}</b><span>h</span></td>
                <td class="kt-h-foot-tot mono"><b>${grandPay.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</b><span>MAD</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  /* ═══════════════ DELEGATED HANDLERS ═══════════════ */
  handlers['kt-tab'] = (_el, kind) => {
    if (kind === 'profiles' || kind === 'hours') {
      activeTab = kind;
      render();
    }
  };
  handlers['kt-paytab'] = (_el, kind) => {
    if (kind !== 'planning' && kind !== 'hours') return;
    payTab = kind;
    render();
  };
  /* Reporter le planifié sur le réel. Le planning ne paie personne tout seul :
   * la paie ne lit QUE la grille des heures, sinon une semaine prévue puis
   * annulée partirait quand même en salaire. Un jour laissé vide au planning
   * n'écrase pas l'heure déjà saisie — on ne remplace que ce qui a été décidé. */
  handlers['kt-plan-apply'] = () => {
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    const T = t();
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[vt] || {};
    const hours = root.hoursByVenue[vt] || (root.hoursByVenue[vt] = {});
    let n = 0;
    getMembers(vt).forEach((m) => {
      const row = shifts[m.id] || {};
      period.days.forEach((d) => {
        if (!row[d]) return;
        if (!hours[m.id]) hours[m.id] = {};
        // Deux décimales : une saisie libre tombe sur 7,25 ou 7,75, pas sur un
        // 7,333333 qui s'afficherait tel quel dans la grille des heures.
        hours[m.id][d] = Math.round(shiftHours(row[d]) * 100) / 100;
        n++;
      });
    });
    if (!n) { Kiwi.toast(T.plNothing, { type: 'pend' }); return; }
    saveCustomTeams();
    payTab = 'hours';                    // montrer le résultat, pas le formulaire
    render();
    Kiwi.toast(T.plApplied(n), { type: 'success' });
  };
  handlers['kt-plan-clear'] = () => {
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[vt] || {};
    Object.keys(shifts).forEach((mid) => { period.days.forEach((d) => { delete shifts[mid][d]; }); });
    saveCustomTeams();
    render();
    Kiwi.toast(t().plCleared, { type: 'info' });
  };

  handlers['kt-plan-week'] = (_el, dir) => {
    closeShiftPop();
    const chunks = weekChunks(buildPeriod(window.__kiwiTeamV2.periodKind || 'week').days);
    const next = planWeekIdx + (dir === 'next' ? 1 : -1);
    if (next < 0 || next >= chunks.length) return;
    planWeekIdx = next;
    render();
  };

  /* ── ÉDITEUR DE SERVICE ──────────────────────────────────────────────────
   * Deux heures exactes ne tiennent pas dans une colonne de 90 px, et la
   * grille ne doit plus déborder de la carte : la saisie se fait donc dans un
   * petit éditeur ancré sur la case. Il dit à voix haute ce qu'une case ne
   * peut que suggérer — la durée, et surtout le JOUR où le service se termine
   * quand il passe minuit. « Appliquer à toute la semaine » évite d'ouvrir
   * sept fois le même éditeur pour quelqu'un qui fait les mêmes horaires du
   * lundi au dimanche. */
  let shiftPop = null;

  const currentVenueKey = () => teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
  const planHost = () => document.querySelector('.dash-genpage .dash-equipe');
  function findCell(mid, day) {
    const host = planHost();
    if (!host) return null;
    const want = `${mid}|${day}`;
    return Array.prototype.find.call(host.querySelectorAll('[data-kt-cell]'), (td) => td.getAttribute('data-kt-cell') === want) || null;
  }
  function visibleDays() {
    const chunks = weekChunks(buildPeriod(window.__kiwiTeamV2.periodKind || 'week').days);
    return chunks[Math.min(Math.max(planWeekIdx, 0), chunks.length - 1)] || [];
  }
  function writeShift(mid, day, val) {
    const vt = currentVenueKey();
    const shifts = window.__kiwiTeamV2.shiftsByVenue[vt] || (window.__kiwiTeamV2.shiftsByVenue[vt] = {});
    if (!shifts[mid]) shifts[mid] = {};
    if (val) shifts[mid][day] = val; else delete shifts[mid][day];
  }
  /* Surtout PAS render() : reconstruire toute la page à chaque case mettait
   * plusieurs secondes par choix, et remplir la semaine de trois personnes
   * devenait une minute d'attente. On repeint la case et les totaux sur place,
   * comme la grille des heures. */
  function paintShiftCell(mid, day) {
    const td = findCell(mid, day);
    if (!td) return;
    const T = t();
    const cur = (getShifts(currentVenueKey())[mid] || {})[day];
    const s = normShift(cur);
    td.classList.toggle('on', !!(s && !s.off));
    td.classList.toggle('off', !!(s && s.off));
    const btn = td.querySelector('.kt-sh');
    if (!btn) return;
    btn.innerHTML = shiftCellInner(T, cur, false);
    const title = shiftCellTitle(T, cur, day);
    if (title) btn.setAttribute('title', title); else btn.removeAttribute('title');
  }
  /* La légende du +1 n'a de sens que s'il y a un service de nuit à l'écran. */
  function refreshNextDayLegend() {
    const host = planHost();
    if (!host) return;
    const legend = host.querySelector('.kt-plan-legend');
    if (legend) legend.classList.toggle('is-off', !host.querySelector('tbody .kt-sh-next'));
  }

  function closeShiftPop() {
    if (!shiftPop) return;
    document.removeEventListener('mousedown', onPopDown, true);
    document.removeEventListener('keydown', onPopKey, true);
    window.removeEventListener('resize', placeShiftPop);
    window.removeEventListener('scroll', placeShiftPop, true);
    shiftPop.el.remove();
    shiftPop = null;
  }
  function onPopDown(e) {
    if (!shiftPop) return;
    if (shiftPop.el.contains(e.target)) return;
    if (shiftPop.anchor && shiftPop.anchor.contains(e.target)) return;   // le toggle s'en charge
    closeShiftPop();
  }
  function onPopKey(e) { if (e.key === 'Escape' && shiftPop) { e.stopPropagation(); closeShiftPop(); } }
  function placeShiftPop() {
    if (!shiftPop) return;
    const a = shiftPop.anchor.getBoundingClientRect();
    const el = shiftPop.el;
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = a.left + (a.width / 2) - (w / 2);
    left = Math.max(10, Math.min(left, window.innerWidth - w - 10));
    let top = a.bottom + 8;
    if (top + h > window.innerHeight - 10) top = Math.max(10, a.top - h - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  function openShiftPop(anchor, mid, day) {
    closeShiftPop();
    const T = t();
    const vt = currentVenueKey();
    const m = getMembers(vt).find((x) => x.id === mid);
    const cur = normShift((getShifts(vt)[mid] || {})[day]);
    const longDay = (iso) => fromISO(iso).toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });

    const el = document.createElement('div');
    el.className = 'kt-shpop';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `
      <div class="kt-shpop-head">
        <b>${esc(m ? memberFullName(m) : '')}</b>
        <span>${esc(longDay(day))}</span>
      </div>
      <div class="kt-shpop-times">
        <label><span>${esc(T.plStart)}</span><input type="time" data-sh-start value="${cur && !cur.off ? esc(cur.start) : ''}"></label>
        <label><span>${esc(T.plEnd)}</span><input type="time" data-sh-end value="${cur && !cur.off ? esc(cur.end) : ''}"></label>
      </div>
      <div class="kt-shpop-sum" data-sh-sum></div>
      <label class="kt-shpop-week"><input type="checkbox" data-sh-week><span>${esc(T.plWholeWeek)}</span></label>
      <div class="kt-shpop-foot">
        <button class="kt-shpop-b" type="button" data-sh-rest>${esc(T.plRest)}</button>
        <button class="kt-shpop-b" type="button" data-sh-clear>${esc(T.plClearCell)}</button>
        <button class="kt-shpop-b primary" type="button" data-sh-save>${esc(T.plSave)}</button>
      </div>`;
    document.body.appendChild(el);
    shiftPop = { el, anchor, mid, day };

    const $start = el.querySelector('[data-sh-start]');
    const $end = el.querySelector('[data-sh-end]');
    const $sum = el.querySelector('[data-sh-sum]');
    const $week = el.querySelector('[data-sh-week]');

    /* Le résumé se met à jour à chaque frappe : on ne découvre pas après coup
     * qu'un 21:00 → 03:00 finit mardi. */
    function refresh() {
      const v = normShift({ start: $start.value, end: $end.value });
      if (!v) { $sum.className = 'kt-shpop-sum'; $sum.textContent = ''; return; }
      const mins = shiftMinutes(v);
      if (!mins) { $sum.className = 'kt-shpop-sum warn'; $sum.textContent = T.plSameTime; return; }
      if (shiftIsNextDay(v)) {
        $sum.className = 'kt-shpop-sum next';
        $sum.innerHTML = `<b>${esc(fmtDur(mins))}</b><br><i class="kt-sh-next">+1</i> ${esc(T.plNextDay(longDay(toISO(addDays(fromISO(day), 1))), v.end))}`;
      } else {
        $sum.className = 'kt-shpop-sum';
        $sum.innerHTML = `<b>${esc(fmtDur(mins))}</b>`;
      }
    }
    refresh();

    function commit(val) {
      const days = ($week.checked ? visibleDays() : [day]);
      days.forEach((d) => { writeShift(mid, d, val); paintShiftCell(mid, d); });
      updateShiftTotals();
      refreshNextDayLegend();
      saveCustomTeams();
      closeShiftPop();
      if ($week.checked && days.length > 1) toast(T.plWeekApplied(days.length), { type: 'success' });
    }
    function save() {
      const start = $start.value, end = $end.value;
      if (!HHMM_RE.test(start) || !HHMM_RE.test(end)) { toast(T.plNeedBoth, { type: 'pend' }); return; }
      if (start === end) { toast(T.plSameTime, { type: 'pend' }); return; }
      commit({ start, end });
    }

    [$start, $end].forEach((inp) => {
      inp.addEventListener('input', refresh);
      inp.addEventListener('change', refresh);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
    el.querySelector('[data-sh-save]').addEventListener('click', save);
    el.querySelector('[data-sh-rest]').addEventListener('click', () => commit({ off: true }));
    el.querySelector('[data-sh-clear]').addEventListener('click', () => commit(null));

    placeShiftPop();
    document.addEventListener('mousedown', onPopDown, true);
    document.addEventListener('keydown', onPopKey, true);
    window.addEventListener('resize', placeShiftPop);
    window.addEventListener('scroll', placeShiftPop, true);
    try { $start.focus(); } catch (_) {}
  }

  handlers['kt-shift-edit'] = (el) => {
    if (!pageActive || window.__kiwiTeamV2.periodLocked) return;
    const mid = el.getAttribute('data-mid');
    const day = el.getAttribute('data-day');
    if (!mid || !day) return;
    if (shiftPop && shiftPop.mid === mid && shiftPop.day === day) { closeShiftPop(); return; }
    openShiftPop(el, mid, day);
  };

  /* Totaux du planning recalculés en place — jumeau de updateHourTotals(). */
  function updateShiftTotals() {
    const root = document.querySelector('.dash-genpage .dash-equipe');
    if (!root) return;
    const vt = teamKey(window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' });
    const members = getMembers(vt);
    const shifts = getShifts(vt);
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    const rows = root.querySelectorAll('table.kt-h-table tbody tr');
    let grandH = 0, grandC = 0;
    members.forEach((m, idx) => {
      const row = shifts[m.id] || {};
      let h = 0;
      period.days.forEach((d) => { h += shiftHours(row[d]); });
      const cost = h * (+m.hourlyRate || 0);
      grandH += h; grandC += cost;
      const tr = rows[idx];
      if (!tr) return;
      const tb = tr.querySelector('.kt-h-total b');
      if (tb) tb.textContent = h.toFixed(2).replace('.', ',');
      const pb = tr.querySelector('.kt-h-pay b');
      if (pb) pb.textContent = cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    });
    const foot = root.querySelectorAll('tfoot .kt-h-foot-tot b');
    if (foot[0]) foot[0].textContent = grandH.toFixed(2).replace('.', ',');
    if (foot[1]) foot[1].textContent = grandC.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  }

  handlers['kt-filter-dept']     = (_el, v) => { activeFilters.dept = v || ''; render(); };
  handlers['kt-filter-contract'] = (_el, v) => { activeFilters.contract = v || ''; render(); };

  /* Live-edit of an hour cell — keeps focus, only refreshes totals. */
  document.addEventListener('input', (e) => {
    const t2 = e.target;
    if (!t2.matches || !t2.matches('[data-kt-hour]')) return;
    if (!pageActive) return;
    if (window.__kiwiTeamV2.periodLocked) return;
    const mid = t2.getAttribute('data-mid');
    const day = t2.getAttribute('data-day');
    const venue = window.KiwiVenue?.getCurrentVenueData?.();
    // teamKey(), NOT venue.type. A real store is keyed by its venue ID; keying the
    // WRITE by type parked every hour the owner typed in hoursByVenue['boutique']
    // while every READ (getHours → teamKey) looked under the venue id. So the cell
    // accepted the number, the totals never moved, and nothing survived a reload —
    // on this page and on Équipe → Heures travaillées alike.
    const vt = teamKey(venue || { type: 'restaurant' });
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
    if (!hours[mid]) hours[mid] = {};
    const val = Math.max(0, Math.min(24, parseFloat(t2.value) || 0));
    hours[mid][day] = val;
    updateHourTotals();
    saveCustomTeams();          // an hour typed is payroll data — persist it
  });

  function updateHourTotals() {
    // The grid lives in the Équipe section OR in the Paie & planning genpage —
    // same markup, two hosts. Looking only for [data-equipe-root] meant editing an
    // hour on Paie updated the store and refreshed nothing.
    const root = (pageMode === 'payroll'
      ? document.querySelector('.dash-genpage .dash-equipe')
      : null) || document.querySelector('[data-equipe-root]');
    if (!root) return;
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const members = getMembers(vt);
    const hours = getHours(vt);
    let grandH = 0, grandP = 0;
    members.forEach((m, idx) => {
      const row = hours[m.id] || {};
      const tot = Object.values(row).reduce((a, b) => a + (+b || 0), 0);
      const pay = tot * (m.hourlyRate || 0);
      grandH += tot; grandP += pay;
      const tr = root.querySelectorAll('table.kt-h-table tbody tr')[idx];
      if (tr) {
        const totalCell = tr.querySelector('.kt-h-total b');
        const payCell   = tr.querySelector('.kt-h-pay b');
        if (totalCell) totalCell.textContent = tot.toFixed(2).replace('.', ',');
        if (payCell)   payCell.textContent   = pay.toLocaleString('fr-FR', { maximumFractionDigits: 0 });
      }
    });
    const footTot = root.querySelectorAll('table.kt-h-table tfoot .kt-h-foot-tot b');
    if (footTot[0]) footTot[0].textContent = grandH.toFixed(2).replace('.', ',');
    if (footTot[1]) footTot[1].textContent = grandP.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

    // On Paie & planning the band above the grid is the headline the owner reads
    // ("à payer · période"). Keep it in step with the cell they just typed in,
    // rather than making them leave the page and come back to see the new total.
    if (pageMode === 'payroll') {
      const baseMass = members.reduce((a, m) => a + (+m.baseSalary || 0), 0);
      const vals = root.querySelectorAll('.eq-stats .eq-stat-v');
      if (vals[0]) vals[0].textContent = fmtMad(baseMass + grandP);
      if (vals[1]) vals[1].textContent = grandH.toFixed(1).replace('.', ',') + ' h';
      if (vals[2]) vals[2].textContent = fmtMad(grandP);
      if (vals[3]) vals[3].textContent = fmtMad(baseMass);
    }
  }

  /* ═══════════════ ADD / EDIT MEMBER MODAL (UNCHANGED) ═══════════════ */
  function openMemberModal(memberId) {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant', name: 'Votre établissement' };
    const venueType = teamKey(venue);
    const cat = catalogFor(tradeKey(venue));
    const editing = !!memberId;
    const existing = editing ? (getMembers(venueType).find(m => m.id === memberId) || null) : null;
    if (editing && !existing) return;
    const m = existing || {
      id: 'mem-' + Math.random().toString(36).slice(2, 9),
      firstName: '', lastName: '', email: '', phone: '',
      password: makeCode(),
      function: cat.functions[0] || '',
      department: cat.departments[0] || '',
      contract: 'CDI',
      startDate: toISO(new Date()),
      endDate: '',
      baseSalary: 4500,
      hourlyRate: 50,
      languages: ['Français', 'Arabe'],
      address: '',
      cin: '',
      emergencyName: '',
      emergencyPhone: '',
      notes: '',
      avatarTone: AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)],
      venueType,
      createdAt: Date.now(),
    };
    const isCddOrStage = (c) => c === 'CDD' || c === 'Stage';

    /* Le catalogue de postes dépend du métier de la boutique, mais la valeur
     * DÉJÀ enregistrée peut ne pas s'y trouver : le propriétaire est
     * « Propriétaire · Direction », un poste qu'aucune liste de vente ne
     * propose, et un membre importé ou créé sous un autre métier garde le sien.
     * Un <select> qui ne contient pas sa valeur affiche silencieusement la
     * première option — donc ouvrir la fiche du patron et l'enregistrer, sans
     * rien toucher, le rétrogradait en « Vendeur conseil · Vente ». On injecte
     * la valeur courante en tête quand elle manque : le formulaire ne peut plus
     * modifier ce que l'utilisateur n'a pas modifié. */
    const optsWithCurrent = (listed, current) => {
      const all = (current && listed.indexOf(current) < 0) ? [current].concat(listed) : listed;
      return all.map((v) => `<option value="${esc(v)}"${current === v ? ' selected' : ''}>${esc(v)}</option>`).join('');
    };
    const fnOpts   = optsWithCurrent(cat.functions, m.function);
    const deptOpts = optsWithCurrent(cat.departments, m.department);
    const ctOpts   = optsWithCurrent(CONTRACT_TYPES, m.contract);
    const langChips = LANGS.map(l => {
      const on = (m.languages || []).includes(l);
      return `<button type="button" class="kt-lang-chip${on ? ' on' : ''}" data-action="kt-lang-toggle" data-arg="${esc(l)}">${esc(l)}</button>`;
    }).join('');

    const mdl = modal({
      title: editing ? T.editTitle : T.addTitle,
      width: 640,
      body: `
        <style>${MODAL_CSS}</style>
        <form data-kt-form data-mid="${esc(m.id)}" data-editing="${editing ? '1' : '0'}">
          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secIdentity)}</div>
            <div class="kt-frow">
              <div class="kt-photo">
                <div class="av-disp" data-kt-avdisp style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName)) || '?'}</div>
                <button type="button" class="kt-photo-btn" data-action="kt-upload-photo">${esc(T.uploadPhoto)}</button>
              </div>
              <div class="kt-fgrow">
                <div class="kt-fgrid-2">
                  <label><span class="l">${esc(T.firstName)}</span><input type="text" name="firstName" value="${esc(m.firstName)}" placeholder="${esc(T.placeholder.firstName)}" required /></label>
                  <label><span class="l">${esc(T.lastName)}</span><input type="text" name="lastName" value="${esc(m.lastName)}" placeholder="${esc(T.placeholder.lastName)}" required /></label>
                </div>
                <label><span class="l">${esc(T.cin)}</span><input type="text" name="cin" value="${esc(m.cin)}" placeholder="${esc(T.placeholder.cin)}" /></label>
              </div>
            </div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secContact)}</div>
            <div class="kt-fgrid-2">
              <label><span class="l">${esc(T.email)}</span><input type="email" name="email" value="${esc(m.email)}" placeholder="${esc(T.placeholder.email)}" /></label>
              <label><span class="l">${esc(T.phone)}</span><input type="tel" name="phone" value="${esc(m.phone)}" placeholder="${esc(T.placeholder.phone)}" /></label>
            </div>
            <label><span class="l">${esc(T.address)}</span><input type="text" name="address" value="${esc(m.address)}" placeholder="${esc(T.placeholder.address)}" /></label>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secAccess)}</div>
            <label class="kt-pwd-label">
              <span class="l">${esc(T.password)}</span>
              <div class="kt-pwd-row">
                <input type="text" name="password" value="${esc(isCode(m.password) ? m.password : '')}" data-kt-pwd
                  inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off"
                  placeholder="${esc(isCode(m.password) ? '' : T.codeKeep)}" />
                <button type="button" class="kt-fbtn-ghost" data-action="kt-pwd-gen">${svgIcon(IC.refresh, 11)} ${esc(T.generate)}</button>
                <button type="button" class="kt-fbtn-ghost" data-action="kt-pwd-copy">${svgIcon(IC.copy, 11)} ${esc(T.copy)}</button>
              </div>
            </label>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secRole)}</div>
            <div class="kt-fgrid-2">
              <label><span class="l">${esc(T.function)}</span>
                <select name="function" required>${fnOpts}</select>
              </label>
              <label><span class="l">${esc(T.department)}</span>
                <select name="department" required>${deptOpts}</select>
              </label>
            </div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secContract)}</div>
            <div class="kt-fgrid-3">
              <label><span class="l">${esc(T.contractType)}</span>
                <select name="contract" data-kt-contract>${ctOpts}</select>
              </label>
              <label><span class="l">${esc(T.startDate)}</span><input type="date" name="startDate" value="${esc(m.startDate)}" /></label>
              <label data-kt-end-wrap${isCddOrStage(m.contract) ? '' : ' hidden'}><span class="l">${esc(T.endDate)}</span><input type="date" name="endDate" value="${esc(m.endDate)}" /></label>
            </div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secComp)}</div>
            <div class="kt-fgrid-2">
              <label><span class="l">${esc(T.baseSalary)}</span><input type="number" name="baseSalary" min="0" step="50" value="${esc(m.baseSalary)}" /></label>
              <label><span class="l">${esc(T.hourlyRate)}</span><input type="number" name="hourlyRate" min="0" step="0.5" value="${esc(m.hourlyRate)}" /></label>
            </div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.languages)}</div>
            <div class="kt-langwrap" data-kt-langs>${langChips}</div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secEmergency)}</div>
            <div class="kt-fgrid-2">
              <label><span class="l">${esc(T.emergencyName)}</span><input type="text" name="emergencyName" value="${esc(m.emergencyName)}" placeholder="${esc(T.placeholder.emergencyName)}" /></label>
              <label><span class="l">${esc(T.emergencyPhone)}</span><input type="tel" name="emergencyPhone" value="${esc(m.emergencyPhone)}" placeholder="${esc(T.placeholder.emergencyPhone)}" /></label>
            </div>
          </div>

          <div class="kt-fsec">
            <div class="kt-fseclabel">${esc(T.secNotes)}</div>
            <label><textarea name="notes" rows="3" placeholder="${esc(T.placeholder.notes)}">${esc(m.notes)}</textarea></label>
          </div>
        </form>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button class="kb atlas" data-action="kt-submit-member">${svgIcon(IC.check, 13)}${esc(editing ? T.submitEdit : T.submitAdd)}</button>
      `,
    });
    mdl.el.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) mdl.close(); });
    mdl.el.__ktState = {
      editing,
      memberId: m.id,
      languages: (m.languages || []).slice(),
      avatarTone: m.avatarTone,
      venueType,
      origCreatedAt: m.createdAt,
    };
    window.__kiwiTeamModal = mdl;
  }

  handlers['kt-add-member']  = () => openMemberModal(null);
  handlers['kt-edit-member'] = (_el, id) => {
    if (window.__kiwiTeamProfileDrawer) {
      try { window.__kiwiTeamProfileDrawer.close(); } catch (_) {}
      window.__kiwiTeamProfileDrawer = null;
    }
    openMemberModal(id);
  };

  handlers['kt-upload-photo'] = () => {
    Kiwi.toast(t().uploadPhoto, { type: 'info', desc: trLang() === 'ar' ? 'محاكاة · يتم استخدام الأحرف الأولى الملونة بدلاً من ذلك.' : trLang() === 'en' ? 'Mocked · colored initials are used instead.' : 'Mocké · les initiales colorées sont utilisées à la place.' });
  };
  handlers['kt-pwd-gen'] = () => {
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const input = mdl.el.querySelector('[data-kt-pwd]');
    if (input) input.value = makeCode();
    Kiwi.toast(t().tPwdGen, { type: 'success' });
  };
  handlers['kt-pwd-copy'] = () => {
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const input = mdl.el.querySelector('[data-kt-pwd]');
    if (!input) return;
    const v = input.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(v).catch(() => {});
    } else {
      try { input.select(); document.execCommand('copy'); } catch (_) {}
    }
    Kiwi.toast(t().tPwdCopied, { type: 'success' });
  };
  handlers['kt-lang-toggle'] = (el, lang) => {
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const st = mdl.el.__ktState; if (!st) return;
    const idx = st.languages.indexOf(lang);
    if (idx === -1) st.languages.push(lang); else st.languages.splice(idx, 1);
    if (el) el.classList.toggle('on');
  };

  /* Reactive end-date + avatar initials in the modal */
  document.addEventListener('change', (e) => {
    const mdl = window.__kiwiTeamModal;
    if (mdl && mdl.el && mdl.el.contains(e.target) && e.target.matches('[data-kt-contract]')) {
      const wrap = mdl.el.querySelector('[data-kt-end-wrap]');
      if (wrap) {
        if (e.target.value === 'CDD' || e.target.value === 'Stage') wrap.removeAttribute('hidden');
        else wrap.setAttribute('hidden', '');
      }
    }
    if (mdl && mdl.el && mdl.el.contains(e.target) && (e.target.name === 'firstName' || e.target.name === 'lastName')) {
      const form = mdl.el.querySelector('[data-kt-form]');
      if (form) {
        const f = form.querySelector('[name="firstName"]').value;
        const l = form.querySelector('[name="lastName"]').value;
        const av = mdl.el.querySelector('[data-kt-avdisp]');
        if (av) av.textContent = initials(f, l) || '?';
      }
    }
  });
  document.addEventListener('input', (e) => {
    const mdl = window.__kiwiTeamModal;
    if (mdl && mdl.el && mdl.el.contains(e.target) && (e.target.name === 'firstName' || e.target.name === 'lastName')) {
      const form = mdl.el.querySelector('[data-kt-form]');
      if (form) {
        const f = form.querySelector('[name="firstName"]').value;
        const l = form.querySelector('[name="lastName"]').value;
        const av = mdl.el.querySelector('[data-kt-avdisp]');
        if (av) av.textContent = initials(f, l) || '?';
      }
    }
  });

  handlers['kt-submit-member'] = () => {
    const T = t();
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const st = mdl.el.__ktState; if (!st) return;
    const form = mdl.el.querySelector('[data-kt-form]'); if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.firstName?.trim() || !data.lastName?.trim() || !data.function?.trim()) {
      Kiwi.toast(T.vRequired, { type: 'pend' }); return;
    }
    if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) {
      Kiwi.toast(T.vInvalidEmail, { type: 'pend' }); return;
    }
    if ((data.contract === 'CDD' || data.contract === 'Stage') && data.endDate && data.startDate && data.endDate < data.startDate) {
      Kiwi.toast(T.vEndAfterStart, { type: 'pend' }); return;
    }
    // The till's pad is four digits — accepting anything else here hands the
    // owner a code their cashier physically cannot enter.
    const code = (data.password || '').trim();
    if (code && !isCode(code)) { Kiwi.toast(T.vCode, { type: 'pend' }); return; }

    const venueType = st.venueType;
    const members = getMembers(venueType);
    const prev = st.editing ? members.find((x) => x.id === st.memberId) : null;
    const member = {
      id: st.memberId,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: (data.email || '').trim(),
      phone: (data.phone || '').trim(),
      /* Champ laissé vide = « ne touche pas au code ». En modification on
       * reprend donc celui du membre : sinon corriger un numéro de téléphone
       * régénérait en douce le code du caissier, qui se retrouvait bloqué
       * devant la caisse sans savoir pourquoi. Seule une VRAIE création
       * (aucun code existant) en fabrique un. */
      password: code || (prev && prev.password) || makeCode(),
      pinCode: code || (prev && prev.pinCode) || '',   // en phase avec la caisse
      function: data.function,
      department: data.department,
      contract: data.contract,
      startDate: data.startDate || '',
      endDate: (data.contract === 'CDD' || data.contract === 'Stage') ? (data.endDate || '') : '',
      baseSalary: parseFloat(data.baseSalary) || 0,
      hourlyRate: parseFloat(data.hourlyRate) || 0,
      languages: st.languages.slice(),
      address: (data.address || '').trim(),
      cin: (data.cin || '').trim(),
      emergencyName: (data.emergencyName || '').trim(),
      emergencyPhone: (data.emergencyPhone || '').trim(),
      notes: (data.notes || '').trim(),
      avatarTone: st.avatarTone || AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)],
      venueType,
      venueSlug: (() => { try { return window.KiwiCloudDoc?.slugFor?.(venueType) || ''; } catch (_) { return ''; } })(),
      createdAt: st.origCreatedAt || Date.now(),
    };

    if (st.editing) {
      const idx = members.findIndex(x => x.id === st.memberId);
      if (idx >= 0) members[idx] = member; else members.push(member);
      Kiwi.toast(T.tUpdated(memberFullName(member)), { type: 'success' });
    } else {
      members.unshift(member);
      const h = window.__kiwiTeamV2.hoursByVenue[venueType] || (window.__kiwiTeamV2.hoursByVenue[venueType] = {});
      h[member.id] = {};
      Kiwi.toast(T.tAdded(memberFullName(member)), { type: 'success', desc: T.tAddedDesc(member.password) });
    }
    saveCustomTeams();
    mdl.close();
    window.__kiwiTeamModal = null;
    if (pageActive) render();
  };

  /* ═══════════════ VIEW PROFILE MODAL ═══════════════ */
  handlers['kt-view-profile'] = (_el, id) => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const venueType = teamKey(venue);
    const m = getMembers(venueType).find(x => x.id === id);
    if (!m) return;

    const subtitle = T.profileSub(m.function, m.department);
    const profileM = modal({
      title: memberFullName(m),
      desc: subtitle,
      width: 620,
      body: `
        <style>${MODAL_CSS}</style>
        <div class="kt-profile">
          <div class="kt-profile-head">
            <div class="av-disp" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}; width:62px; height:62px; font-size:21px; border-radius:18px; display:flex; align-items:center; justify-content:center; color:var(--paper); font-family:var(--mono); font-weight:600;">${esc(initials(m.firstName, m.lastName))}</div>
            <div class="kt-profile-meta">
              <div class="kt-profile-name">${esc(memberFullName(m))}</div>
              <div class="kt-profile-role">${esc(m.function)} · ${esc(m.department)}</div>
              <div class="kt-profile-tags">
                <span class="kt-tag ${m.contract === 'CDI' ? 'kt-tag-ok' : (m.contract === 'CDD' || m.contract === 'Stage') ? 'kt-tag-pend' : 'kt-tag-neutral'}">${esc(m.contract)}</span>
                ${(m.languages || []).slice(0, 4).map(l => `<span class="kt-langchip">${esc(l)}</span>`).join('')}
              </div>
            </div>
          </div>

          ${profileSection(T.secContact, [
            [T.email, m.email],
            [T.phone, m.phone],
            [T.address, m.address],
          ])}

          ${profileSection(T.secAccess, [
            [T.password, `<span class="mono">${esc(m.password || T.placeholderPwd)}</span>`],
          ], true)}

          ${profileSection(T.secContract, [
            [T.contractType, m.contract],
            [T.startDate, m.startDate || '—'],
            ...(m.contract === 'CDD' || m.contract === 'Stage' ? [[T.endDate, m.endDate || '—']] : []),
          ])}

          ${profileSection(T.secComp, [
            [T.baseSalary, `<span class="mono">${(m.baseSalary || 0).toLocaleString('fr-FR')} MAD</span>`],
            [T.hourlyRate, `<span class="mono">${(m.hourlyRate || 0).toLocaleString('fr-FR')} MAD</span>`],
          ], true)}

          ${profileSection(T.cin, [['', m.cin || '—']], true)}

          ${profileSection(T.secEmergency, [
            [T.emergencyName, m.emergencyName || '—'],
            [T.emergencyPhone, m.emergencyPhone || '—'],
          ])}

          ${m.notes ? profileSection(T.secNotes, [['', m.notes]]) : ''}
        </div>
      `,
      foot: `
        <button class="kb ghost" data-action="kt-delete-member" data-arg="${esc(m.id)}" style="color:var(--danger);">${svgIcon(IC.trash, 13)}${esc(T.deleteBtn)}</button>
        <button class="kb atlas" data-action="kt-edit-member" data-arg="${esc(m.id)}">${svgIcon(IC.edit, 13)}${esc(T.editBtn)}</button>
      `,
    });
    window.__kiwiTeamProfileDrawer = profileM;
  };

  function profileSection(title, rows, prehtml) {
    const inner = rows.map(([l, v]) => {
      const lbl = l ? `<div class="kt-pf-l">${esc(l)}</div>` : '';
      const val = prehtml ? `<div class="kt-pf-v">${v}</div>` : `<div class="kt-pf-v">${esc(v || '—')}</div>`;
      return `<div class="kt-pf-row">${lbl}${val}</div>`;
    }).join('');
    return `
      <div class="kt-pf-sec">
        <div class="kt-pf-title">${esc(title)}</div>
        ${inner}
      </div>
    `;
  }

  handlers['kt-delete-member'] = (_el, id) => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    const m = members.find(x => x.id === id); if (!m) return;
    const confirmM = modal({
      title: T.delTitle,
      width: 460,
      body: `<p style="margin:0; color:var(--n-600); font-size:13px; line-height:1.55;">${esc(T.delDesc)}</p>
        <div style="margin-top:14px; padding:12px 14px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; display:flex; gap:11px; align-items:center;">
          <span class="eq-av sm" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
          <div>
            <div style="font-weight:600;">${esc(memberFullName(m))}</div>
            <div style="font-size:11.5px; color:var(--n-500);">${esc(m.function)} · ${esc(m.department)}</div>
          </div>
        </div>`,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button class="kb" data-action="kt-confirm-delete" data-arg="${esc(id)}" style="background:var(--danger); color:#fff;">${svgIcon(IC.trash, 13)}${esc(T.delConfirm)}</button>
      `,
    });
    confirmM.el.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) confirmM.close(); });
    window.__kiwiTeamConfirmModal = confirmM;
  };

  handlers['kt-confirm-delete'] = (_el, id) => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    const idx = members.findIndex(x => x.id === id);
    if (idx < 0) return;
    const removed = members.splice(idx, 1)[0];
    const h = window.__kiwiTeamV2.hoursByVenue[venueType] || {};
    delete h[id];
    saveCustomTeams();
    if (window.__kiwiTeamConfirmModal) { try { window.__kiwiTeamConfirmModal.close(); } catch (_) {} window.__kiwiTeamConfirmModal = null; }
    if (window.__kiwiTeamProfileDrawer) { try { window.__kiwiTeamProfileDrawer.close(); } catch (_) {} window.__kiwiTeamProfileDrawer = null; }
    Kiwi.toast(T.tDeleted(memberFullName(removed)), { type: 'success' });
    if (pageActive) render();
  };

  /* ═══════════════ HOURS HANDLERS ═══════════════ */
  handlers['kt-period'] = (_el, kind) => {
    if (!['week', 'fortnight', 'month'].includes(kind)) return;
    const root = window.__kiwiTeamV2;
    root.periodKind = kind;
    root.periodLocked = false;
    planWeekIdx = weekIdxForToday(buildPeriod(kind).days);   // nouvelle période ⇒ on retombe sur la semaine en cours
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const period = buildPeriod(kind);
    const members = getMembers(vt);
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
    members.forEach(m => {
      if (!hours[m.id]) hours[m.id] = {};
      period.days.forEach(d => {
        if (hours[m.id][d] == null) {
          /* La démo se remplit d'heures plausibles pour montrer une grille
           * vivante. Une VRAIE boutique doit rester à zéro : ce back-fill
           * inventait 4 à 8 h par personne et par jour dès qu'on touchait une
           * pastille de période, et payrollFigures les additionnait ensuite en
           * « à payer · période » — un salaire chiffré sur des services que
           * personne n'a faits. ensureVenueData() se garde déjà de ça ; ce
           * second chemin avait été oublié. */
          if (isCustomVenue()) { hours[m.id][d] = 0; return; }
          const isOff = (Math.floor(Math.random() * 7) === 0);
          hours[m.id][d] = isOff ? 0 : (4 + Math.floor(Math.random() * 5)) + (Math.random() < 0.3 ? 0.5 : 0);
        }
      });
    });
    render();
  };

  handlers['kt-quick-entry'] = () => {
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    if (!members.length) { Kiwi.toast('—', { type: 'info' }); return; }
    const today = toISO(new Date());
    const qe = modal({
      title: T.qeTitle,
      width: 460,
      body: `
        <style>${MODAL_CSS}</style>
        <div class="kt-qe-form">
          <label><span class="l">${esc(T.qeMember)}</span>
            <select name="member" data-kt-qe-member>${members.map(m => `<option value="${esc(m.id)}">${esc(memberFullName(m))} · ${esc(m.function)}</option>`).join('')}</select>
          </label>
          <div class="kt-fgrid-2">
            <label><span class="l">${esc(T.qeDate)}</span><input type="date" data-kt-qe-date value="${esc(today)}" /></label>
            <label><span class="l">${esc(T.qeHours)}</span><input type="number" data-kt-qe-hours min="0" max="24" step="0.25" value="8" /></label>
          </div>
          <label><span class="l">${esc(T.qeNote)}</span><input type="text" data-kt-qe-note placeholder="—" /></label>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button class="kb atlas" data-action="kt-qe-save">${svgIcon(IC.check, 13)}${esc(T.qeSave)}</button>
      `,
    });
    qe.el.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) qe.close(); });
    window.__kiwiTeamQuickEntry = qe;
  };

  handlers['kt-qe-save'] = () => {
    const T = t();
    const qe = window.__kiwiTeamQuickEntry; if (!qe || !qe.el) return;
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const vt = teamKey(venue);
    const mid = qe.el.querySelector('[data-kt-qe-member]')?.value;
    const date = qe.el.querySelector('[data-kt-qe-date]')?.value;
    const hVal = parseFloat(qe.el.querySelector('[data-kt-qe-hours]')?.value) || 0;
    if (!mid || !date) { Kiwi.toast('—', { type: 'pend' }); return; }
    const hours = window.__kiwiTeamV2.hoursByVenue[vt] || (window.__kiwiTeamV2.hoursByVenue[vt] = {});
    if (!hours[mid]) hours[mid] = {};
    hours[mid][date] = hVal;
    const m = getMembers(vt).find(x => x.id === mid);
    qe.close();
    window.__kiwiTeamQuickEntry = null;
    if (pageActive) render();
    Kiwi.toast(T.tHourSaved(memberFullName(m || {}), hVal, date), { type: 'success' });
  };

  handlers['kt-export-csv'] = () => {
    const T = t();
    Kiwi.toast(T.tExport, { type: 'success', desc: T.tExportDesc });
  };
  handlers['kt-import-csv'] = () => {
    const T = t();
    Kiwi.toast(T.tImport, { type: 'info', desc: T.tImportDesc });
  };
  handlers['kt-validate-period'] = () => {
    const T = t();
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    root.periodLocked = true;
    const period = buildPeriod(root.periodKind);
    if (pageActive) render();
    Kiwi.toast(T.tValidated(period.startFr, period.endFr), { type: 'success', desc: T.tValidatedDesc });
  };

  /* ═══════════════ PAIE & PLANNING ═══════════════
   * Same roster, second surface. Équipe answers "who works here"; this answers
   * "who worked when, and what do I owe them". It was the last page in the
   * sidebar still showing the "Encore rien ici" starter no matter how many people
   * the owner had hired — because the starter layer never released it AND the old
   * payroll code read the demo STAFF literal in venues.js, not this roster. So
   * even unlocking it would have shown Café Atlas's waiters to a boutique.
   *
   * Built from what already exists and is already correct: buildPeriod for the
   * pay period, hoursByVenue for the grid, and each member's own hourlyRate /
   * baseSalary. The planning grid IS the hours grid — one number per person per
   * day is both "who is on Tuesday" and "what Tuesday costs" — so entering hours
   * here and in Équipe → Heures travaillées writes the same record, and validating
   * a period locks it in both places. */
  function payrollFigures(members, venueType, period) {
    const hours = getHours(venueType);
    let totalHours = 0, variablePay = 0, baseMass = 0, onDuty = 0;
    members.forEach((m) => {
      const row = hours[m.id] || {};
      let h = 0;
      period.days.forEach((d) => { h += (+row[d] || 0); });
      if (h > 0) onDuty++;
      totalHours += h;
      variablePay += h * (+m.hourlyRate || 0);
      baseMass += (+m.baseSalary || 0);
    });
    return { totalHours, variablePay, baseMass, onDuty };
  }

  /* La grille de planning : une personne par ligne, un service par jour. Le
   * coût prévu tombe du taux horaire du membre, donc le commerçant voit ce que
   * la semaine va coûter AVANT de la faire — c'est tout l'intérêt de planifier
   * plutôt que de constater. « Reporter sur les heures » recopie le planifié
   * dans la grille des heures réelles, seule à alimenter la paie : le planning
   * ne paie personne tout seul, sinon une semaine prévue mais pas travaillée
   * partirait en salaire. */
  /* Une case = l'état du jour, lisible sans l'ouvrir : deux heures empilées,
   * « Repos », ou rien du tout. Le badge +1 dit que le service déborde sur le
   * lendemain, et le title l'écrit en toutes lettres. */
  function shiftCellInner(T, cur, locked) {
    const s = normShift(cur);
    if (!s) return `<span class="kt-sh-empty">${esc(T.plNone)}</span>`;
    if (s.off) return `<span class="kt-sh-rest">${esc(T.plRest)}</span>`;
    const next = shiftIsNextDay(s);
    return `<span class="kt-sh-t">${esc(s.start)}</span>` +
      `<span class="kt-sh-t end">${esc(s.end)}${next ? '<i class="kt-sh-next">+1</i>' : ''}</span>`;
  }
  function shiftCellTitle(T, cur, dayISO) {
    const s = normShift(cur);
    if (!s || s.off) return '';
    const mins = shiftMinutes(s);
    if (!shiftIsNextDay(s)) return fmtDur(mins);
    const nx = addDays(fromISO(dayISO), 1);
    const lbl = nx.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    return `${T.plNextDay(lbl, s.end)} · ${fmtDur(mins)}`;
  }
  const dateLocale = () => (trLang() === 'en' ? 'en-US' : trLang() === 'ar' ? 'ar-MA' : 'fr-FR');

  function planCellHtml(T, m, d, cur, locked) {
    const s = normShift(cur);
    const isToday = (d === toISO(new Date()));
    const title = shiftCellTitle(T, cur, d);
    return `<td class="kt-day-cell kt-plan-cell${isToday ? ' today' : ''}${s && !s.off ? ' on' : ''}${s && s.off ? ' off' : ''}"
      data-kt-cell="${esc(m.id)}|${esc(d)}">
      <button class="kt-sh" type="button" data-action="kt-shift-edit" data-mid="${esc(m.id)}" data-day="${esc(d)}"
        ${locked ? 'disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${shiftCellInner(T, cur, locked)}</button>
    </td>`;
  }

  /* Le planning ne glisse plus sous la souris : la grille tient dans la carte.
   * Colonnes en largeur fixe (table-layout: fixed) et UNE semaine à l'écran —
   * sur une quinzaine ou un mois, 14 ou 31 colonnes ne rentrent nulle part, on
   * passe de semaine en semaine au lieu de faire défiler le tableau. Les
   * totaux, eux, restent ceux de la période entière : c'est exactement ce que
   * « Reporter sur les heures » ira écrire. */
  function weekChunks(days) {
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out.length ? out : [[]];
  }
  /* Sur « Ce mois », s'ouvrir au 1er juillet quand on est le 25 obligeait à
   * cliquer quatre fois pour retrouver sa semaine. On ouvre sur aujourd'hui. */
  function weekIdxForToday(days) {
    const today = toISO(new Date());
    const i = days.indexOf(today);
    return i < 0 ? 0 : Math.floor(i / 7);
  }

  function renderPlanningPane(T, venue, venueType, members) {
    const root = window.__kiwiTeamV2;
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[venueType] || (root.shiftsByVenue[venueType] = {});
    const locked = root.periodLocked;
    let grandH = 0, grandCost = 0;

    const chunks = weekChunks(period.days);
    if (planWeekIdx >= chunks.length) planWeekIdx = chunks.length - 1;
    if (planWeekIdx < 0) planWeekIdx = 0;
    const view = chunks[planWeekIdx];
    const multiWeek = chunks.length > 1;

    const headDays = view.map((d) => {
      const dt = fromISO(d);
      const dayLbl = dt.toLocaleDateString(dateLocale(), { weekday: 'short' });
      return `<th class="kt-day-head"><span class="d">${pad(dt.getDate())}</span><span class="m">${dayLbl}</span></th>`;
    }).join('');

    let anyNextDay = false;
    const rows = members.map((m) => {
      const row = shifts[m.id] || {};
      /* Le total de la ligne couvre la PÉRIODE, pas la semaine affichée : c'est
       * le chiffre que les tuiles du haut annoncent et que la paie recevra. */
      let h = 0;
      period.days.forEach((d) => { h += shiftHours(row[d]); });
      const cells = view.map((d) => {
        if (shiftIsNextDay(row[d])) anyNextDay = true;
        return planCellHtml(T, m, d, row[d], locked);
      }).join('');
      const cost = h * (+m.hourlyRate || 0);
      grandH += h; grandCost += cost;
      const tone = m.avatarTone || 'a';
      return `
        <tr>
          <td class="kt-h-member">
            <span class="eq-av sm" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <div>
              <div class="n">${esc(memberFullName(m))}</div>
              <div class="r">${esc(m.function)}</div>
            </div>
          </td>
          ${cells}
          <td class="kt-h-total mono"><b>${h.toFixed(2).replace('.', ',')}</b><span>h</span></td>
          <td class="kt-h-pay mono"><b>${cost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</b><span>MAD</span></td>
        </tr>`;
    }).join('');

    const cols = `<colgroup><col class="kt-plan-col-mem">${view.map(() => '<col>').join('')}<col class="kt-plan-col-tot"><col class="kt-plan-col-tot"></colgroup>`;
    const stepper = multiWeek ? `
      <div class="kt-plan-step">
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="prev"
          aria-label="${esc(T.plPrevWeek)}" ${planWeekIdx === 0 ? 'disabled' : ''}>‹</button>
        <span class="kt-plan-steplbl mono">${esc(T.plWeekOf(fmtFr(fromISO(view[0])), fmtFr(fromISO(view[view.length - 1]))))}</span>
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="next"
          aria-label="${esc(T.plNextWeek)}" ${planWeekIdx >= chunks.length - 1 ? 'disabled' : ''}>›</button>
      </div>` : '';

    return `
      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.tabPlanning)}</h3>
          <span class="eq-count-badge">${esc(T.hPeriodLabel(period.startFr, period.endFr))}${locked ? ' · ' + esc(T.hLocked) : ''}</span>
        </div>
        <div class="kt-hbar">
          <div class="eq-pill-row">${periodPillsHtml(T)}</div>
          <div class="kt-hbar-right">
            <button class="btn-slim" type="button" data-action="kt-plan-clear" ${locked ? 'disabled' : ''}>${esc(T.plClear)}</button>
            <button class="btn-slim ${locked ? '' : 'primary'}" type="button" data-action="kt-plan-apply" ${locked ? 'disabled' : ''}>${svgIcon(IC.check, 13)}<span>${esc(T.plApply)}</span></button>
          </div>
        </div>
        <p class="kt-plan-hint">${esc(T.plHint)}</p>
        ${stepper}
        <div class="kt-plan-wrap">
          <table class="kt-h-table kt-plan-table">
            ${cols}
            <thead>
              <tr>
                <th class="kt-h-memberhead">${esc(T.plMember)}</th>
                ${headDays}
                <th class="kt-h-totalhead">${esc(multiWeek ? T.plPlannedPeriod : T.plPlanned)}</th>
                <th class="kt-h-totalhead">${esc(T.plCost)}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td class="kt-h-foot-label">${esc(T.plFooter)}</td>
                <td colspan="${view.length}"></td>
                <td class="kt-h-foot-tot mono"><b>${grandH.toFixed(2).replace('.', ',')}</b><span>h</span></td>
                <td class="kt-h-foot-tot mono"><b>${grandCost.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</b><span>MAD</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="kt-plan-legend${anyNextDay ? '' : ' is-off'}"><i class="kt-sh-next">+1</i> ${esc(T.plNextDayLegend)}</p>
      </div>`;
  }

  function renderPayrollBody(T, venue, venueType, members) {
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    if (!members.length) {
      return `
        <div class="dash-equipe">
          <div class="eq-section" style="text-align:center; padding:44px 18px;">
            <h3 style="margin:0 0 8px;">${esc(T.payEmptyH)}</h3>
            <p style="margin:0 auto 18px; max-width:44ch; color:var(--n-500); line-height:1.55;">${esc(T.payEmptyP)}</p>
            <button class="kb atlas" type="button" data-action="nav-equipe">${svgIcon(IC.plus, 13)}${esc(T.addMember)}</button>
          </div>
        </div>`;
    }
    const f = payrollFigures(members, venueType, period);
    const tile = (label, value, sub) => `
      <div class="eq-stat">
        <div class="eq-stat-l"><span>${esc(label)}</span></div>
        <div class="eq-stat-v">${value}</div>
        <div class="eq-stat-sub">${esc(sub)}</div>
      </div>`;
    return `
      <div class="dash-equipe">
        <div class="eq-stats">
          ${tile(T.payStatDue,   fmtMad(f.baseMass + f.variablePay), T.payStatDueSub(period.startFr, period.endFr))}
          ${tile(T.payStatHours, f.totalHours.toFixed(1).replace('.', ',') + ' h', T.payStatHoursSub)}
          ${tile(T.payStatVar,   fmtMad(f.variablePay),              T.payStatVarSub)}
          ${tile(T.payStatBase,  fmtMad(f.baseMass),                 T.payStatBaseSub(f.onDuty, members.length))}
        </div>
        <div class="eq-filters">
          <div class="eq-pill-row">
            <button class="eq-pill${payTab === 'planning' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="planning">${esc(T.tabPlanning)}</button>
            <button class="eq-pill${payTab === 'hours' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="hours">${esc(T.tabRealised)}</button>
          </div>
        </div>
        ${payTab === 'planning'
          ? renderPlanningPane(T, venue, venueType, members)
          : renderHoursPane(T, venue, venueType, members)}
      </div>`;
  }

  function showPayroll() {
    if (!window.Kiwi || !window.Kiwi.appPage) return;
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    ensureVenueData(venue);
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    pageActive = true;
    pageMode = 'payroll';
    window.Kiwi.appPage('payroll', {
      title: T.payTitle,
      subtitle: `${venue.name || 'Votre établissement'} · ${T.paySub}`,
      body: renderPayrollBody(T, venue, venueType, members),
    });
    // The venue/language subscriptions live on showPage(); mirror the venue one so
    // switching store while on Paie repaints instead of showing the old roster.
    if (!unsubscribeVenue && window.KiwiVenue?.subscribe) {
      unsubscribeVenue = window.KiwiVenue.subscribe(() => {
        if (!pageActive) return;
        ensureVenueData(window.KiwiVenue.getCurrentVenueData());
        render();
      });
    }
  }

  /* ═══════════════ NAV HANDLERS — override venues.js ═══════════════ */
  function installNavHandlers() {
    if (!window.Kiwi || !window.Kiwi.handlers) return;
    const H = window.Kiwi.handlers;
    H['nav-equipe'] = () => showPage();
    // Paie & planning: ours for a REAL store, venues.js's demo payroll otherwise,
    // so the pitch demo (Café Atlas & co.) is untouched. Captured on each install
    // so venues.js's late 'load' re-assertion becomes the fallback, not the winner.
    const prevPayroll = H['nav-payroll'];
    if (!prevPayroll || !prevPayroll.__ktOwned) {
      const wrapped = function () {
        if (isCustomVenue()) { showPayroll(); return; }
        if (prevPayroll) { try { return prevPayroll.apply(this, arguments); } catch (_) {} }
      };
      wrapped.__ktOwned = true;
      H['nav-payroll'] = wrapped;
    }
    const origAccueil = H['nav-accueil'];
    H['nav-accueil'] = function () {
      showDashboard();
      if (origAccueil) { try { origAccueil.apply(this, arguments); } catch (_) {} }
    };
  }
  /* Install at IIFE-time and again on 'load' so venues.js's late re-assertion loses. */
  installNavHandlers();
  window.addEventListener('load', () => setTimeout(installNavHandlers, 0));

  /* ═══════════════ SCOPED CSS — only patches what .eq-* doesn't cover ═══════════════ */
  const PAGE_CSS = `
    /* Planning · une cellule = un service. Le fond teinté fait lire la semaine
       d'un coup d'œil : qui est posté, qui est en repos, quels jours sont vides.

       La grille ne défile PAS horizontalement : table-layout fixe + une semaine
       par écran (voir weekChunks). Un tableau qui glisse sous la souris n'a
       jamais l'air fini, et une colonne de paie à moitié coupée encore moins. */
    .dash-equipe .kt-plan-hint { margin: 0 0 12px; font-size: 12.5px; color: var(--n-500); }
    .dash-equipe .kt-plan-wrap { border: 1px solid var(--n-200); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .dash-equipe .kt-plan-table { table-layout: fixed; width: 100%; }
    .dash-equipe .kt-plan-table .kt-plan-col-mem { width: 21%; }
    .dash-equipe .kt-plan-table .kt-plan-col-tot { width: 10%; }
    .dash-equipe .kt-plan-table th, .dash-equipe .kt-plan-table td { overflow: hidden; }
    /* En largeur fixe, le min-width du profil ferait déborder la ligne. */
    .dash-equipe .kt-plan-table .kt-h-member { min-width: 0; gap: 8px; padding-left: 12px; }
    .dash-equipe .kt-plan-table .kt-h-member > div { min-width: 0; }
    .dash-equipe .kt-plan-table .kt-h-member .n,
    .dash-equipe .kt-plan-table .kt-h-member .r { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dash-equipe .kt-plan-table .kt-h-total, .dash-equipe .kt-plan-table .kt-h-pay { min-width: 0; padding-right: 10px; }
    .dash-equipe .kt-plan-table .kt-day-cell { padding: 5px 3px; }

    /* Le pas à pas des semaines — visible seulement sur quinzaine / mois. */
    .dash-equipe .kt-plan-step { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .dash-equipe .kt-plan-arrow {
      width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--n-200);
      background: var(--surface); color: var(--ink); font-size: 15px; line-height: 1;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: border-color 140ms, background 140ms;
    }
    .dash-equipe .kt-plan-arrow:hover:not(:disabled) { border-color: var(--atlas); background: var(--mint-soft, rgba(11,110,79,0.06)); }
    .dash-equipe .kt-plan-arrow:disabled { opacity: 0.4; cursor: default; }
    .dash-equipe .kt-plan-steplbl { font-size: 11px; color: var(--n-600); letter-spacing: 0.02em; }

    /* La case : deux heures empilées, ou « Repos », ou rien. */
    .dash-equipe .kt-sh {
      width: 100%; min-height: 42px; padding: 5px 2px; border: 1px solid var(--n-200);
      border-radius: 8px; background: var(--surface); color: var(--ink);
      font-family: var(--mono); font-size: 11px; line-height: 1.35; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: border-color 140ms, box-shadow 140ms, background 140ms;
    }
    .dash-equipe .kt-sh:hover:not(:disabled) { border-color: var(--atlas); }
    .dash-equipe .kt-sh:focus-visible { outline: none; border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    .dash-equipe .kt-sh:disabled { opacity: 0.55; cursor: default; }
    .dash-equipe .kt-sh-empty { color: var(--n-400); font-size: 13px; }
    .dash-equipe .kt-sh-rest { font-family: var(--sans); font-size: 11px; color: var(--n-500); }
    .dash-equipe .kt-sh-t { display: block; white-space: nowrap; }
    .dash-equipe .kt-sh-t.end { color: var(--n-600); }
    /* Pas scopé à .dash-equipe : le même badge sert dans l'éditeur, qui vit
       sur <body> pour ne jamais être rogné par le tableau. */
    .kt-sh-next {
      display: inline-block; margin: 0 2px 0 3px; padding: 0 3px; border-radius: 4px;
      background: var(--mint-soft, rgba(125,242,176,0.35)); color: var(--atlas);
      font-family: var(--mono); font-size: 8.5px; font-style: normal; font-weight: 600;
      vertical-align: 1px; letter-spacing: 0;
    }
    .kt-plan-cell.on  { background: rgba(11,110,79,0.055); }
    .kt-plan-cell.off { background: var(--paper-soft, rgba(0,0,0,0.025)); }
    .dash-equipe .kt-plan-cell.on .kt-sh { border-color: rgba(11,110,79,0.35); font-weight: 500; }
    .dash-equipe .kt-plan-legend { margin: 10px 0 0; font-size: 11.5px; color: var(--n-500); line-height: 1.5; }
    .dash-equipe .kt-plan-legend.is-off { display: none; }

    /* Écran étroit : la grille tient toujours (largeurs fixes), mais les heures
       finissaient rognées à mi-chiffre. On rend au jour ce que la colonne
       « membre » et le métier peuvent lui céder, et le +1 passe à la ligne. */
    @media (max-width: 900px) {
      .dash-equipe .kt-plan-table .kt-plan-col-mem { width: 17%; }
      .dash-equipe .kt-plan-table .kt-plan-col-tot { width: 9%; }
      .dash-equipe .kt-plan-table .kt-h-member { gap: 6px; padding-left: 8px; }
      .dash-equipe .kt-plan-table .kt-h-member .r { display: none; }
      .dash-equipe .kt-plan-table .kt-day-cell { padding: 4px 1px; }
      .dash-equipe .kt-sh { font-size: 9.5px; padding: 4px 1px; min-height: 38px; }
      .dash-equipe .kt-sh-rest { font-size: 9.5px; }
      .dash-equipe .kt-sh .kt-sh-next { display: block; margin: 1px 0 0; }
    }

    /* Éditeur de service — ancré sur la case, jamais dans le flux du tableau. */
    .kt-shpop {
      position: fixed; z-index: 900; width: 268px; padding: 14px;
      background: var(--surface, #fff); border: 1px solid var(--n-200);
      border-radius: 14px; box-shadow: 0 18px 44px rgba(10,15,13,0.18);
      font-family: var(--sans); color: var(--ink);
    }
    .kt-shpop-head { margin-bottom: 11px; }
    .kt-shpop-head b { display: block; font-size: 13px; }
    /* « lundi 20 juillet » : en français seule la 1re lettre prend la majuscule
       — capitalize aurait écrit « Lundi 20 Juillet ». */
    .kt-shpop-head span { display: block; font-size: 11px; color: var(--n-500); margin-top: 2px; }
    .kt-shpop-head span::first-letter { text-transform: uppercase; }
    .kt-shpop-times { display: flex; gap: 8px; }
    .kt-shpop-times label { flex: 1; min-width: 0; }
    .kt-shpop-times span { display: block; font-size: 10px; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); margin-bottom: 4px; }
    .kt-shpop-times input {
      width: 100%; box-sizing: border-box; padding: 8px 9px; border: 1px solid var(--n-200);
      border-radius: 9px; background: var(--surface); color: var(--ink);
      font-family: var(--mono); font-size: 13px; outline: none;
    }
    .kt-shpop-times input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    .kt-shpop-sum { min-height: 17px; margin: 9px 0 2px; font-size: 11.5px; color: var(--n-600); line-height: 1.5; }
    .kt-shpop-sum b { color: var(--ink); font-size: 12.5px; }
    .kt-shpop-sum.warn { color: #946100; }
    .kt-shpop-week { display: flex; align-items: center; gap: 7px; margin: 9px 0 12px; font-size: 11.5px; color: var(--n-600); cursor: pointer; }
    .kt-shpop-week input { width: 14px; height: 14px; accent-color: var(--atlas); cursor: pointer; }
    .kt-shpop-foot { display: flex; gap: 6px; }
    .kt-shpop-b {
      flex: 1; padding: 8px 4px; border-radius: 9px; border: 1px solid var(--n-200);
      background: var(--surface); color: var(--ink); font-family: var(--sans);
      font-size: 11.5px; cursor: pointer; transition: border-color 140ms, background 140ms;
    }
    .kt-shpop-b:hover { border-color: var(--atlas); }
    .kt-shpop-b.primary { background: var(--atlas); border-color: var(--atlas); color: var(--paper); font-weight: 500; }
    .kt-shpop-b.primary:hover { background: var(--riad); border-color: var(--riad); }

    /* Search bar */
    .dash-equipe .kt-searchbar { position: relative; }
    .dash-equipe .kt-searchbar-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--n-400); pointer-events: none; }
    .dash-equipe .kt-searchbar input { width: 100%; padding: 11px 12px 11px 36px; border: 1px solid var(--n-200); border-radius: 10px; font-family: var(--sans); font-size: 13px; background: var(--surface); color: var(--ink); outline: none; box-sizing: border-box; transition: border-color 140ms, box-shadow 140ms; }
    .dash-equipe .kt-searchbar input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }

    /* Tag chips (contract type) */
    .dash-equipe .kt-tag { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.04em; }
    .dash-equipe .kt-tag-ok      { background: var(--mint-soft); color: var(--atlas); border: 1px solid rgba(11,110,79,0.18); }
    .dash-equipe .kt-tag-pend    { background: #FFF4E3; color: #946100; border: 1px solid #F4D6A3; }
    .dash-equipe .kt-tag-neutral { background: var(--paper-soft); color: var(--n-600); border: 1px solid var(--n-200); }
    .dash-equipe .kt-langchip { background: var(--paper-soft); border: 1px solid var(--n-200); padding: 2px 7px; border-radius: 5px; font-size: 10.5px; color: var(--n-700); }
    .dash-equipe .kt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .dash-equipe .kt-cell-strong { font-weight: 500; color: var(--ink); }

    /* Hours tab — table */
    .dash-equipe .kt-hbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .dash-equipe .kt-hbar-right { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .dash-equipe .kt-h-tablewrap { border: 1px solid var(--n-200); border-radius: 12px; overflow-x: auto; background: var(--surface); }
    .dash-equipe .kt-h-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .dash-equipe .kt-h-table thead th { background: var(--paper-soft); padding: 11px 9px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.10em; color: var(--n-500); font-weight: 500; text-align: left; text-transform: uppercase; border-bottom: 1px solid var(--n-200); position: sticky; top: 0; }
    .dash-equipe .kt-h-table .kt-day-head { text-align: center; min-width: 54px; }
    .dash-equipe .kt-h-table .kt-day-head .d { display: block; font-size: 12.5px; color: var(--ink); font-weight: 600; }
    .dash-equipe .kt-h-table .kt-day-head .m { display: block; font-size: 9.5px; color: var(--n-500); text-transform: lowercase; letter-spacing: 0.04em; margin-top: 2px; }
    .dash-equipe .kt-h-table tbody td { border-top: 1px solid var(--n-200); padding: 9px 9px; vertical-align: middle; }
    .dash-equipe .kt-h-table .kt-h-member { display: flex; align-items: center; gap: 10px; min-width: 200px; }
    .dash-equipe .kt-h-table .kt-h-member .n { font-weight: 600; font-size: 12.5px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-member .r { font-size: 10.5px; color: var(--n-500); margin-top: 1px; }
    .dash-equipe .kt-h-table .kt-day-cell { text-align: center; padding: 7px 4px; }
    .dash-equipe .kt-h-table .kt-day-cell input { width: 50px; padding: 5px 4px; border: 1px solid var(--n-200); border-radius: 6px; font-family: var(--mono); font-size: 12px; background: var(--surface); color: var(--ink); text-align: center; outline: none; -moz-appearance: textfield; }
    .dash-equipe .kt-h-table .kt-day-cell input::-webkit-outer-spin-button, .dash-equipe .kt-h-table .kt-day-cell input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .dash-equipe .kt-h-table .kt-day-cell input:focus { border-color: var(--atlas); box-shadow: 0 0 0 2px rgba(11,110,79,0.12); }
    .dash-equipe .kt-h-table .kt-day-cell.today { background: rgba(125, 242, 176, 0.10); }
    .dash-equipe .kt-h-table .kt-day-cell.locked input { background: var(--paper-soft); color: var(--n-500); cursor: not-allowed; }
    .dash-equipe .kt-h-table .kt-h-total, .dash-equipe .kt-h-table .kt-h-pay { text-align: right; min-width: 82px; padding-right: 14px; }
    .dash-equipe .kt-h-table .kt-h-total b, .dash-equipe .kt-h-table .kt-h-pay b { font-size: 13px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-total span, .dash-equipe .kt-h-table .kt-h-pay span { color: var(--n-500); font-size: 10px; margin-left: 3px; font-weight: 400; }
    .dash-equipe .kt-h-table tfoot td { padding: 11px 9px; background: var(--paper-soft); border-top: 2px solid var(--ink); font-size: 12.5px; }
    .dash-equipe .kt-h-table .kt-h-foot-label { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.10em; color: var(--n-700); text-transform: uppercase; padding-left: 16px; }
    .dash-equipe .kt-h-table .kt-h-foot-tot b { font-size: 14px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-foot-tot span { color: var(--n-500); font-size: 10px; margin-left: 3px; font-weight: 400; }

    /* Fusion-mode overrides for the bits we added */
    body.fusion-mode .dash-equipe .kt-searchbar input,
    body.fusion-mode .dash-equipe .kt-h-tablewrap,
    body.fusion-mode .dash-equipe .kt-plan-wrap,
    body.fusion-mode .dash-equipe .kt-sh,
    body.fusion-mode .dash-equipe .kt-plan-arrow,
    body.fusion-mode .kt-shpop,
    body.fusion-mode .kt-shpop-times input,
    body.fusion-mode .kt-shpop-b,
    body.fusion-mode .dash-equipe .kt-h-table .kt-day-cell input { background: #0F0F0F !important; color: var(--paper); border-color: rgba(125,242,176,0.18) !important; }
    body.fusion-mode .kt-shpop-b.primary { background: var(--atlas) !important; border-color: var(--atlas) !important; }
    body.fusion-mode .dash-equipe .kt-sh-t.end,
    body.fusion-mode .dash-equipe .kt-sh-rest { color: var(--n-400); }
    body.fusion-mode .dash-equipe .kt-h-table thead th,
    body.fusion-mode .dash-equipe .kt-h-table tfoot td { background: rgba(255,255,255,0.04) !important; color: var(--paper); }
    body.fusion-mode .dash-equipe .kt-h-table .kt-day-cell.locked input { background: rgba(255,255,255,0.06) !important; color: var(--n-400); }
    body.fusion-mode .dash-equipe .kt-tag-neutral { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
    body.fusion-mode .dash-equipe .kt-langchip { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
  `;

  /* Inject scoped page CSS once on first import */
  if (!document.querySelector('style[data-kt-page-css]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-kt-page-css', '');
    styleEl.textContent = PAGE_CSS;
    document.head.appendChild(styleEl);
  }

  /* ═══════════════ MODAL CSS (kept from the previous design — user loved it) ═══════════════ */
  const MODAL_CSS = `
    [data-kt-form] .kt-fsec, .kt-profile .kt-pf-sec, .kt-qe-form, .kt-profile-head { margin-bottom: 18px; }
    [data-kt-form] .kt-fseclabel { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--n-500); text-transform: uppercase; margin-bottom: 9px; }
    [data-kt-form] label { display: block; margin-bottom: 10px; }
    [data-kt-form] label .l, .kt-qe-form label .l { display: block; font-size: 11px; color: var(--n-600); margin-bottom: 5px; font-weight: 500; }
    [data-kt-form] input[type=text],
    [data-kt-form] input[type=email],
    [data-kt-form] input[type=tel],
    [data-kt-form] input[type=number],
    [data-kt-form] input[type=date],
    [data-kt-form] select,
    [data-kt-form] textarea,
    .kt-qe-form input,
    .kt-qe-form select {
      width: 100%; padding: 9px 11px; border: 1px solid var(--n-300); border-radius: 8px; font-family: var(--sans); font-size: 13px; background: var(--surface); color: var(--ink); outline: none; box-sizing: border-box; transition: border-color 140ms, box-shadow 140ms;
    }
    [data-kt-form] input:focus, [data-kt-form] select:focus, [data-kt-form] textarea:focus, .kt-qe-form input:focus, .kt-qe-form select:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    [data-kt-form] textarea { resize: vertical; min-height: 70px; font-family: var(--sans); }
    [data-kt-form] select { appearance: none; -webkit-appearance: none; padding-right: 30px; background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236f6c65' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center; cursor: pointer; }
    [data-kt-form] .kt-frow { display: grid; grid-template-columns: 110px 1fr; gap: 16px; align-items: flex-start; }
    [data-kt-form] .kt-fgrid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    [data-kt-form] .kt-fgrid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
    [data-kt-form] .kt-photo { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    [data-kt-form] .kt-photo .av-disp { width: 96px; height: 96px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 600; font-size: 32px; color: var(--paper); }
    [data-kt-form] .kt-photo-btn { background: var(--paper-soft); border: 1px dashed var(--n-300); padding: 6px 10px; border-radius: 7px; font-size: 11px; color: var(--n-600); cursor: pointer; font-family: var(--sans); }
    [data-kt-form] .kt-photo-btn:hover { border-color: var(--atlas); color: var(--atlas); }
    [data-kt-form] .kt-pwd-label .kt-pwd-row { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; }
    [data-kt-form] .kt-fbtn-ghost { display: inline-flex; align-items: center; gap: 5px; padding: 7px 10px; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-700); border-radius: 7px; cursor: pointer; font-size: 11.5px; font-family: var(--sans); transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; }
    [data-kt-form] .kt-fbtn-ghost:hover { border-color: var(--atlas); color: var(--atlas); background: var(--paper-soft); }
    [data-kt-form] .kt-langwrap { display: flex; flex-wrap: wrap; gap: 6px; }
    [data-kt-form] .kt-lang-chip { background: var(--surface); border: 1px solid var(--n-300); padding: 6px 11px; border-radius: 999px; font-size: 11.5px; cursor: pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; color: var(--n-700); font-family: var(--sans); }
    [data-kt-form] .kt-lang-chip:hover { border-color: var(--atlas); color: var(--atlas); }
    [data-kt-form] .kt-lang-chip.on { background: var(--atlas); color: var(--paper); border-color: var(--atlas); }
    [data-kt-form] [data-kt-end-wrap][hidden] { display: none; }
    .kt-qe-form .kt-fgrid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .kt-qe-form label { display: block; margin-bottom: 10px; }
    .kt-profile-head { display: grid; grid-template-columns: 62px 1fr; gap: 16px; align-items: center; padding-bottom: 16px; border-bottom: 1px solid var(--n-200); margin-bottom: 18px; }
    .kt-profile-name { font-size: 19px; font-weight: 600; letter-spacing: -0.015em; color: var(--ink); }
    .kt-profile-role { font-size: 12.5px; color: var(--n-500); margin-top: 3px; }
    .kt-profile-tags { display: flex; gap: 5px; margin-top: 8px; flex-wrap: wrap; }
    .kt-pf-sec { padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--n-200); }
    .kt-pf-sec:last-of-type { border-bottom: 0; }
    .kt-pf-title { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--n-500); text-transform: uppercase; margin-bottom: 8px; }
    .kt-pf-row { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: baseline; padding: 4px 0; }
    .kt-pf-l { font-size: 12px; color: var(--n-500); }
    .kt-pf-v { font-size: 13px; color: var(--ink); word-break: break-word; }
    .kt-tag { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.04em; }
    .kt-tag-ok      { background: var(--mint-soft); color: var(--atlas); border: 1px solid rgba(11,110,79,0.18); }
    .kt-tag-pend    { background: #FFF4E3; color: #946100; border: 1px solid #F4D6A3; }
    .kt-tag-neutral { background: var(--paper-soft); color: var(--n-600); border: 1px solid var(--n-200); }
    .kt-langchip { background: var(--paper-soft); border: 1px solid var(--n-200); padding: 2px 7px; border-radius: 5px; font-size: 10.5px; color: var(--n-700); }
  `;

  /* ═══════════════ PUBLIC · seed the roster from onboarding ═══════════════
     The first-run wizard (assets/onboarding.js) collects staff on its access
     step but historically wrote them only to `kiwiPins` (the login lock), so
     they never appeared on the Équipe page and "vanished" on reload. This
     bridges those people into the REAL per-venue roster the page reads
     (byVenue[venue.id] → 'kiwiTeamV2:custom'), so they persist and are editable.
     Idempotent: dedupes by PIN code / full name so a re-run can't duplicate. */
  const ONB_ROLE_FN = {
    owner:   { fn: 'Propriétaire', dept: 'Direction' },
    manager: { fn: 'Manager',      dept: 'Management' },
    staff:   { fn: 'Équipier',     dept: 'Service' },
  };
  function importMembers(venue, people) {
    if (!venue || !Array.isArray(people) || !people.length) return 0;
    ensureVenueData(venue);
    const key = teamKey(venue);
    const list = window.__kiwiTeamV2.byVenue[key] || (window.__kiwiTeamV2.byVenue[key] = []);
    const hours = window.__kiwiTeamV2.hoursByVenue[key] || (window.__kiwiTeamV2.hoursByVenue[key] = {});
    let added = 0;
    people.forEach((p) => {
      const name = String((p && p.name) || '').trim();
      if (!name) return;
      const code = /^\d{4}$/.test((p && p.code) || '') ? p.code : '';
      const dupe = list.some((m) =>
        (code && m.pinCode === code) ||
        `${m.firstName || ''} ${m.lastName || ''}`.trim().toLowerCase() === name.toLowerCase());
      if (dupe) return;
      const sp = name.indexOf(' ');
      const role = (p && p.role) || 'staff';
      const rm = ONB_ROLE_FN[role] || ONB_ROLE_FN.staff;
      const id = 'mem-' + Math.random().toString(36).slice(2, 10);
      list.push({
        id,
        firstName: sp >= 0 ? name.slice(0, sp) : name,
        lastName: sp >= 0 ? name.slice(sp + 1).trim() : '',
        // One code per person: what onboarding collected IS their till code, so
        // the profile shows the same value the cashier types (it used to show a
        // separate generated password, which opened nothing).
        email: '', phone: '', password: code || makeCode(), pinCode: code || '',
        function: rm.fn, department: rm.dept, contract: 'CDI',
        startDate: '', endDate: '', baseSalary: 0, hourlyRate: 0,
        languages: [], address: '', cin: '', emergencyName: '', emergencyPhone: '', notes: '',
        avatarTone: AVATAR_TONES[list.length % AVATAR_TONES.length],
        role, venueType: key,
        venueSlug: (() => { try { return window.KiwiCloudDoc?.slugFor?.(key) || ''; } catch (_) { return ''; } })(),
        createdAt: Date.now(),
      });
      hours[id] = {};
      added++;
    });
    if (added) { saveCustomTeams(); if (pageActive) { try { render(); } catch (_) {} } }
    return added;
  }
  /* L'accueil du tableau de bord veut afficher « qui est là aujourd'hui », mais
   * dateRange.js s'exécute AVANT ce fichier. Il lit donc le roster par cette API
   * et se repeint sur l'événement plus bas, plutôt que d'aller fouiller
   * __kiwiTeamV2 — un global privé qu'un refactor d'ici casserait en silence.
   * Les heures du jour viennent de la même grille que Paie, donc les trois
   * surfaces content la même chose. */
  function roster() {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const vt = teamKey(venue);
      const members = getMembers(vt) || [];
      const hours = getHours(vt) || {};
      const todayKey = toISO(new Date());
      return members.map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || '—',
        role: m.function || m.department || '',
        avatar: String(m.firstName || '?').trim().charAt(0).toUpperCase() || '?',
        hoursToday: +((hours[m.id] || {})[todayKey]) || 0,
      }));
    } catch (_) { return []; }
  }
  window.KiwiTeam = Object.assign(window.KiwiTeam || {}, { importMembers, roster });
  try { window.dispatchEvent(new Event('kiwi-team-ready')); } catch (_) {}

  /* ═══════════════ HYDRATATION AU DÉMARRAGE ═══════════════════════════════
   * On lit la copie serveur sans attendre que quelqu'un ouvre la page Équipe.
   * Deux surfaces dépendent du roster sans jamais l'afficher : publishPins()
   * envoie les codes du personnel à la caisse, et la carte « Équipe » de
   * l'accueil annonce qui est en service. Sur un deuxième appareil, attendre
   * l'ouverture de la page voudrait dire une caisse sans aucun code d'accès —
   * personne ne peut ouvrir le tiroir — et un accueil qui affirme zéro salarié.
   *
   * venues.js n'a pas forcément fini de rétablir les établissements du compte
   * quand ce fichier s'exécute (adoptServerStores attend /api/me) : on lie donc
   * au 'load', puis à chaque changement de magasin. bind() est idempotent par
   * magasin, un rappel de trop ne coûte rien. */
  function bootTeamCloud() {
    teamCloudBind();
    try {
      if (window.KiwiVenue?.subscribe) window.KiwiVenue.subscribe(() => teamCloudBind());
    } catch (_) {}
  }
  if (document.readyState === 'complete') setTimeout(bootTeamCloud, 0);
  else window.addEventListener('load', () => setTimeout(bootTeamCloud, 0));
})();
