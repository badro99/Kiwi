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
      noMembersYet: "Aucun membre pour l'instant",
      noMembersHint: "Ajoutez chaque personne une fois : son code ouvre la caisse et l'app employé.",
      // Stats
      statTotal: 'TOTAL MEMBRES',
      statTotalSub: (n, name) => `${n} actifs · ${name}`,
      statPresent: 'EN SERVICE AUJOURD\'HUI',
      statPresentSub: 'pointés en ce moment',
      statPresentHoursSub: 'avec des heures saisies aujourd’hui',
      statPresentDemoSub: 'selon les heures de démo du jour',
      statPayroll: 'MASSE SALARIALE · MOIS',
      statPayrollSub: 'salaires de base cumulés',
      statPayrollNone: 'aucun salaire renseigné',
      statPayrollPartial: (k, n) => `${k} salaire${k > 1 ? 's' : ''} renseigné${k > 1 ? 's' : ''} sur ${n}`,
      salaryUnset: 'Non renseigné',
      noRate: 'Aucun taux horaire renseigné',
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
      livePaused: 'En pause',
      liveOnDuty: 'En service',
      liveOffDuty: 'Hors service',
      // Profile modal
      viewProfile: 'Voir le profil',
      pvTitle: 'Fiche membre',
      pvNotSet: 'Non renseigné',
      pvShow: 'Afficher',
      pvHide: 'Masquer',
      pvNoCode: 'Aucun code enregistré',
      pvCodeHint: "Ouvre la caisse et l'app employé. Ne le montrez qu'à la personne concernée.",
      pvIdEmergency: "Identité et contact d'urgence",
      editBtn:   'Modifier',
      deleteBtn: 'Supprimer',
      profileSub: (role, dept) => [role, dept].filter(Boolean).join(' · '),
      secIdentity:    'Identité',
      secContact:     'Contact',
      secAccess:      'Compte employé Kiwi',
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
      password:  'Code personnel · 4 chiffres',
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
      vRequired: 'Prénom, nom, email et fonction requis',
      vInvalidEmail: 'Email invalide',
      vDuplicateEmail: 'Cet email est déjà utilisé par un autre membre',
      vDuplicateCode: 'Ce code est déjà utilisé par un autre membre',
      vEndAfterStart: "La date de fin doit être après la date de début",
      vCode: "Le code personnel doit faire 4 chiffres",
      payTitle: 'Planning',
      paySub: 'planning, heures et paie de la période',
      payEmptyH: 'Ajoutez votre équipe pour commencer',
      payEmptyP: "Le planning et la paie se construisent à partir de vos employés. Ajoutez-les dans Équipe, puis saisissez leurs heures ici · les totaux et le coût de la période se calculent tout seuls.",
      payStatDue: 'À payer · période',
      payStatDueSub: (a, b) => `salaires de base + heures, ${a} au ${b}`,
      payStatHours: 'Heures de la période',
      payStatHoursSub: 'total saisi sur le planning',
      payStatVar: 'Coût des heures',
      payStatVarSub: 'heures × taux, au-delà du contrat pour un salarié',
      payStatBase: 'Salaires de base',
      payStatBaseSub: (n, tot) => `${n} sur ${tot} en service sur la période`,
      payStatBaseMonthly: (k, n) => `par mois · ${k} sur ${n} renseigné${k > 1 ? 's' : ''}`,
      payStatDueProrata: (a, b, d) => `base au prorata de ${d} j + heures, ${a} au ${b}`,
      payStatNone: 'aucun salaire ni taux horaire renseigné',
      codeKeep: 'Inchangé · 4 chiffres pour le modifier',
      edReq: 'obligatoire',
      edEmailHint: "Son identifiant dans l'app employé",
      edChooseFn: 'Choisir un poste',
      edChooseDept: 'Choisir un département',
      edRoleUnset: 'Poste à choisir',
      edSalary: 'Salaire mensuel',
      edHourly: 'Taux horaire',
      edPerMonth: 'MAD / mois',
      edPerHour: 'MAD / heure',
      edContractHours: 'Heures du contrat',
      edPerWeek: 'h / semaine',
      edCompHint: "Laissez vide ce qui ne s'applique pas. Avec un salaire, le taux horaire ne paie que les heures au-delà du contrat (44 h par semaine si rien n'est saisi).",
      edCodeT: 'Code personnel',
      edCodeHint: "Ouvre la caisse et l'app employé. Quatre chiffres, propres à cette personne.",
      edErrRequired: 'À renseigner',
      edCheck: 'Vérifiez les champs signalés',
      ph: { email: 'nom@exemple.ma', phone: '06 00 00 00 00', address: 'Rue, quartier, ville', cin: 'ex. AB123456', emergencyName: 'Nom et lien, ex. sœur', notes: 'Allergies, disponibilités, remarques…' },
      tabPlanning: 'Planning', tabRealised: 'Heures travaillées',
      plNone: '·', plMember: 'Membre', plPlanned: 'Planifié', plCost: 'Coût prévu',
      plApply: 'Valider en heures réalisées', plClear: 'Effacer cette période',
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
      plPrevPeriod: 'Période précédente', plNextPeriod: 'Période suivante', plCurrentPeriod: 'Aujourd’hui',
      plPlannedPeriod: 'Planifié · période',
      plWeekApplied: (n) => `Service appliqué sur ${n} jour${n > 1 ? 's' : ''}.`,
      submitAdd:  'Ajouter le membre',
      submitEdit: 'Enregistrer les modifications',
      cancel: 'Annuler',
      delTitle: 'Supprimer ce membre ?',
      delDesc:  'Action irréversible. Le compte Kiwi Caisse sera désactivé immédiatement.',
      delOnDuty: (hm) => `En service depuis ${hm}. Son pointage sera clos à la suppression.`,
      delConfirm: 'Supprimer',
      tAdded:    (n) => `${n} ajouté·e à l'équipe`,
      tAddedDesc:(e) => `Se connecte à l'app employé avec ${e} et son code personnel, sur sa fiche`,
      tUpdated:  (n) => `${n} · profil mis à jour`,
      tDeleted:  (n) => `${n} a été retiré·e de l'équipe`,
      tPwdCopied:'Code caisse copié',
      tPwdGen:   'Nouveau code caisse généré',
      // Hours pane
      hPeriodWeek: 'Semaine',
      hPeriodFort: 'Quinzaine',
      hPeriodMonth:'Mois',
      hQuickEntry:'Saisie rapide',
      hExport:    'Exporter CSV',
      hImport:    'Importer CSV',
      hValidate:  'Valider la période',
      hUnlock:    'Déverrouiller la période',
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
      tValidated: (start, end) => `Période validée · du ${start} au ${end}`,
      tValidatedDesc: 'Heures et planning figés sur tous vos appareils. Les pointages faits à la caisse sur ces dates continuent de s’ajouter.',
      tUnlocked:  (start, end) => `Période déverrouillée · du ${start} au ${end}`,
      tUnlockedDesc: 'Les heures et le planning peuvent à nouveau être modifiés.',
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
      noMembersYet: 'No team members yet',
      noMembersHint: 'Add each person once: their code opens the till and the employee app.',
      statTotal: 'TOTAL MEMBERS',
      statTotalSub: (n, name) => `${n} active · ${name}`,
      statPresent: 'ON SHIFT TODAY',
      statPresentSub: 'clocked in right now',
      statPresentHoursSub: 'with hours logged today',
      statPresentDemoSub: 'from today’s demo hours',
      statPayroll: 'PAYROLL · MONTH',
      statPayrollSub: 'cumulative base salaries',
      statPayrollNone: 'no salary entered',
      statPayrollPartial: (k, n) => `${k} of ${n} salaries entered`,
      salaryUnset: 'Not entered',
      noRate: 'No hourly rate entered',
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
      livePaused: 'On break',
      liveOnDuty: 'On duty',
      liveOffDuty: 'Off duty',
      viewProfile: 'View profile',
      pvTitle: 'Member profile',
      pvNotSet: 'Not set',
      pvShow: 'Show',
      pvHide: 'Hide',
      pvNoCode: 'No code on file',
      pvCodeHint: 'Opens the till and the employee app. Only show it to the person it belongs to.',
      pvIdEmergency: 'Identity and emergency contact',
      editBtn:   'Edit',
      deleteBtn: 'Remove',
      profileSub: (role, dept) => [role, dept].filter(Boolean).join(' · '),
      secIdentity:    'Identity',
      secContact:     'Contact',
      secAccess:      'Kiwi employee account',
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
      password:  'Personal code · 4 digits',
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
      vRequired: 'First name, last name, email and function are required',
      vInvalidEmail: 'Invalid email',
      vDuplicateEmail: 'Another member already uses this email',
      vDuplicateCode: 'Another member already uses this code',
      vEndAfterStart: 'End date must be after the start date',
      vCode: 'The personal code must be 4 digits',
      payTitle: 'Planning',
      paySub: 'schedule, hours and pay for the period',
      payEmptyH: 'Add your team to get started',
      payEmptyP: 'Scheduling and payroll are built from your employees. Add them under Team, then enter their hours here · period totals and cost work themselves out.',
      payStatDue: 'Due · period',
      payStatDueSub: (a, b) => `base salaries + hours, ${a} to ${b}`,
      payStatHours: 'Hours this period',
      payStatHoursSub: 'total entered on the schedule',
      payStatVar: 'Cost of hours',
      payStatVarSub: 'hours × rate, beyond contract hours for salaried staff',
      payStatBase: 'Base salaries',
      payStatBaseSub: (n, tot) => `${n} of ${tot} on duty this period`,
      payStatBaseMonthly: (k, n) => `per month · ${k} of ${n} entered`,
      payStatDueProrata: (a, b, d) => `base pro rata for ${d} days + hours, ${a} to ${b}`,
      payStatNone: 'no salary or hourly rate entered',
      codeKeep: 'Unchanged · enter 4 digits to change it',
      edReq: 'required',
      edEmailHint: 'Their sign-in for the employee app',
      edChooseFn: 'Choose a role',
      edChooseDept: 'Choose a department',
      edRoleUnset: 'No role yet',
      edSalary: 'Monthly salary',
      edHourly: 'Hourly rate',
      edPerMonth: 'MAD / month',
      edPerHour: 'MAD / hour',
      edContractHours: 'Contract hours',
      edPerWeek: 'h / week',
      edCompHint: 'Leave blank what does not apply. With a salary, the hourly rate only pays hours beyond the contract (44 h a week if nothing is entered).',
      edCodeT: 'Personal code',
      edCodeHint: 'Opens the till and the employee app. Four digits, unique to this person.',
      edErrRequired: 'Required',
      edCheck: 'Check the highlighted fields',
      ph: { email: 'name@example.com', phone: '06 00 00 00 00', address: 'Street, area, city', cin: 'e.g. AB123456', emergencyName: 'Name and relation, e.g. sister', notes: 'Allergies, availability, remarks…' },
      tabPlanning: 'Schedule', tabRealised: 'Hours worked',
      plNone: '·', plMember: 'Member', plPlanned: 'Scheduled', plCost: 'Projected cost',
      plApply: 'Confirm as hours worked', plClear: 'Clear this period',
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
      plPrevPeriod: 'Previous period', plNextPeriod: 'Next period', plCurrentPeriod: 'Today',
      plPlannedPeriod: 'Scheduled · period',
      plWeekApplied: (n) => `Shift applied to ${n} day${n > 1 ? 's' : ''}.`,
      submitAdd:  'Add member',
      submitEdit: 'Save changes',
      cancel: 'Cancel',
      delTitle: 'Remove this member?',
      delDesc:  'Permanent. The Kiwi Caisse account will be disabled immediately.',
      delOnDuty: (hm) => `On duty since ${hm}. Their shift closes when you remove them.`,
      delConfirm: 'Remove',
      tAdded:    (n) => `${n} added to the team`,
      tAddedDesc:(e) => `Signs in to the employee app with ${e} and the personal code on their profile`,
      tUpdated:  (n) => `${n} · profile updated`,
      tDeleted:  (n) => `${n} has been removed from the team`,
      tPwdCopied:'Till code copied',
      tPwdGen:   'New till code generated',
      hPeriodWeek: 'Week',
      hPeriodFort: 'Fortnight',
      hPeriodMonth:'Month',
      hQuickEntry:'Quick entry',
      hExport:    'Export CSV',
      hImport:    'Import CSV',
      hValidate:  'Validate period',
      hUnlock:    'Unlock period',
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
      tValidated: (start, end) => `Period validated · from ${start} to ${end}`,
      tValidatedDesc: 'Hours and planning are frozen on all your devices. Clock-outs made at the till on these dates still add up.',
      tUnlocked:  (start, end) => `Period unlocked · from ${start} to ${end}`,
      tUnlockedDesc: 'Hours and planning can be edited again.',
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
      noMembersYet: 'لا يوجد أعضاء بعد',
      noMembersHint: 'أضف كل شخص مرة واحدة: رمزه يفتح الصندوق وتطبيق الموظف.',
      statTotal: 'إجمالي الأعضاء',
      statTotalSub: (n, name) => `${n} نشط · ${name}`,
      statPresent: 'في الخدمة اليوم',
      statPresentSub: 'مسجلون الآن',
      statPresentHoursSub: 'بساعات مسجلة اليوم',
      statPresentDemoSub: 'حسب ساعات العرض التجريبي لهذا اليوم',
      statPayroll: 'كتلة الأجور · الشهر',
      statPayrollSub: 'مجموع الرواتب الأساسية',
      statPayrollNone: 'لم يُسجَّل أي راتب',
      statPayrollPartial: (k, n) => `${k} من ${n} رواتب مسجلة`,
      salaryUnset: 'غير مسجل',
      noRate: 'لم يُسجَّل أي أجر بالساعة',
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
      livePaused: 'في استراحة',
      liveOnDuty: 'في الخدمة',
      liveOffDuty: 'خارج الخدمة',
      viewProfile: 'عرض الملف',
      pvTitle: 'ملف العضو',
      pvNotSet: 'غير محدد',
      pvShow: 'إظهار',
      pvHide: 'إخفاء',
      pvNoCode: 'لا يوجد رمز مسجل',
      pvCodeHint: 'يفتح الصندوق وتطبيق الموظف. لا تُظهره إلا لصاحبه.',
      pvIdEmergency: 'الهوية وجهة الاتصال في الطوارئ',
      editBtn:   'تعديل',
      deleteBtn: 'حذف',
      profileSub: (role, dept) => [role, dept].filter(Boolean).join(' · '),
      secIdentity:    'الهوية',
      secContact:     'الاتصال',
      secAccess:      'حساب موظف Kiwi',
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
      password:  'الرمز الشخصي · 4 أرقام',
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
      vRequired: 'الاسم والنسب والبريد الإلكتروني والوظيفة مطلوبة',
      vInvalidEmail: 'بريد إلكتروني غير صالح',
      vDuplicateEmail: 'هذا البريد مستعمل من طرف موظف آخر',
      vDuplicateCode: 'هذا الرمز مستعمل من طرف موظف آخر',
      vEndAfterStart: 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البدء',
      vCode: 'يجب أن يكون الرمز الشخصي من 4 أرقام',
      payTitle: 'التخطيط',
      paySub: 'التخطيط والساعات وأجور الفترة',
      payEmptyH: 'أضف فريقك للبدء',
      payEmptyP: 'يُبنى التخطيط والأجور انطلاقاً من موظفيك. أضفهم في «الفريق»، ثم أدخل ساعاتهم هنا · تُحتسب المجاميع وتكلفة الفترة تلقائياً.',
      payStatDue: 'المستحق · الفترة',
      payStatDueSub: (a, b) => `الأجور الأساسية + الساعات، من ${a} إلى ${b}`,
      payStatHours: 'ساعات الفترة',
      payStatHoursSub: 'المجموع المُدخل في التخطيط',
      payStatVar: 'تكلفة الساعات',
      payStatVarSub: 'الساعات × الأجر، ما يتجاوز العقد للأجراء',
      payStatBase: 'الأجور الأساسية',
      payStatBaseSub: (n, tot) => `${n} من ${tot} في الخدمة خلال الفترة`,
      payStatBaseMonthly: (k, n) => `شهرياً · ${k} من ${n} مسجلة`,
      payStatDueProrata: (a, b, d) => `الأساسي بالتناسب لـ ${d} يوماً + الساعات، من ${a} إلى ${b}`,
      payStatNone: 'لم يُسجَّل أي راتب أو أجر بالساعة',
      codeKeep: 'دون تغيير · أدخل 4 أرقام لتغييره',
      edReq: 'إلزامي',
      edEmailHint: 'معرّف الدخول إلى تطبيق الموظف',
      edChooseFn: 'اختر منصبًا',
      edChooseDept: 'اختر قسمًا',
      edRoleUnset: 'لم يُحدَّد المنصب',
      edSalary: 'الراتب الشهري',
      edHourly: 'الأجر بالساعة',
      edPerMonth: 'درهم / شهر',
      edPerHour: 'درهم / ساعة',
      edContractHours: 'ساعات العقد',
      edPerWeek: 'ساعة / أسبوع',
      edCompHint: 'اترك الحقل فارغًا إن لم ينطبق. مع راتب شهري، لا يُحتسب الأجر بالساعة إلا للساعات التي تتجاوز العقد (44 ساعة في الأسبوع إن لم يُدخَل شيء).',
      edCodeT: 'الرمز الشخصي',
      edCodeHint: 'يفتح الصندوق وتطبيق الموظف. أربعة أرقام خاصة بهذا الشخص.',
      edErrRequired: 'حقل مطلوب',
      edCheck: 'تحقّق من الحقول المشار إليها',
      ph: { email: 'name@example.com', phone: '06 00 00 00 00', address: 'الشارع، الحي، المدينة', cin: 'مثال: AB123456', emergencyName: 'الاسم وصلة القرابة، مثال: أخت', notes: 'الحساسية، التوفر، ملاحظات…' },
      tabPlanning: 'الجدول', tabRealised: 'ساعات العمل',
      plNone: '·', plMember: 'العضو', plPlanned: 'مُجدول', plCost: 'التكلفة المتوقعة',
      plApply: 'اعتمادها كساعات منجزة', plClear: 'مسح هذه الفترة',
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
      plPrevPeriod: 'الفترة السابقة', plNextPeriod: 'الفترة التالية', plCurrentPeriod: 'اليوم',
      plPlannedPeriod: 'مُجدول · الفترة',
      plWeekApplied: (n) => `تم تطبيق الوردية على ${n} يوم.`,
      submitAdd:  'إضافة العضو',
      submitEdit: 'حفظ التعديلات',
      cancel: 'إلغاء',
      delTitle: 'إزالة هذا العضو؟',
      delDesc:  'إجراء نهائي. سيتم تعطيل حساب Kiwi Caisse فورًا.',
      delOnDuty: (hm) => `في الخدمة منذ \u2066${hm}\u2069. يُغلق تسجيل دوامه عند الحذف.`,
      delConfirm: 'إزالة',
      tAdded:    (n) => `تمت إضافة ${n} إلى الفريق`,
      tAddedDesc:(e) => `يدخل إلى تطبيق الموظف بـ \u2068${e}\u2069 والرمز الشخصي المعروض في ملفه`,
      tUpdated:  (n) => `${n} · تم تحديث الملف`,
      tDeleted:  (n) => `تمت إزالة ${n} من الفريق`,
      tPwdCopied:'تم نسخ رمز الصندوق',
      tPwdGen:   'تم إنشاء رمز صندوق جديد',
      hPeriodWeek: 'أسبوع',
      hPeriodFort: 'نصف شهر',
      hPeriodMonth:'شهر',
      hQuickEntry:'إدخال سريع',
      hExport:    'تصدير CSV',
      hImport:    'استيراد CSV',
      hValidate:  'تأكيد الفترة',
      hUnlock:    'فتح الفترة',
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
      tValidatedDesc: 'الساعات والتخطيط مجمّدة على كل أجهزتك. تسجيلات الخروج في الصندوق لهذه التواريخ تستمر في الإضافة.',
      tUnlocked:  (start, end) => `تم فتح الفترة · من ${start} إلى ${end}`,
      tUnlockedDesc: 'يمكن تعديل الساعات والتخطيط من جديد.',
      placeholderPwd: '····',
      monthName: ['يناير','فبراير','مارس','أبريل','ماي','يونيو','يوليوز','غشت','شتنبر','أكتوبر','نونبر','دجنبر'],
      dayName:   ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'],
    },
  };
  const t = () => STR[trLang()] || STR.fr;
  /* Fonctions et services s'ENREGISTRENT en français : c'est la clé des filtres,
   * de la suggestion fonction → service, des exports, des rapports et de
   * l'assistant. Ils se LISENT dans la langue de l'écran. Sous l'anglais et
   * l'arabe, la page Équipe, l'accueil et le planning disaient « Caissier »,
   * « Salle », « Propriétaire ». Un intitulé saisi à la main n'a pas de
   * traduction : il reste tel que le gérant l'a écrit. */
  const JOB_FN = {
    "Agent d'entretien": { en: "Cleaning staff", ar: "عامل نظافة" },
    "Agent de réception": { en: "Reception agent", ar: "عون الاستقبال" },
    "Agent polyvalent": { en: "General staff", ar: "موظف متعدد المهام" },
    "Aide-fleuriste": { en: "Florist assistant", ar: "مساعد بائع الزهور" },
    "Aide-pizzaiolo": { en: "Pizza assistant", ar: "مساعد صانع البيتزا" },
    "Aide-pâtissier": { en: "Pastry assistant", ar: "مساعد الحلواني" },
    "Bagagiste": { en: "Porter", ar: "حامل الأمتعة" },
    "Barbier": { en: "Barber", ar: "حلاق" },
    "Barista": { en: "Barista", ar: "باريستا" },
    "Barman": { en: "Bartender", ar: "نادل البار" },
    "Boulanger": { en: "Baker", ar: "خباز" },
    "Caissier": { en: "Cashier", ar: "أمين الصندوق" },
    "Chauffeur": { en: "Driver", ar: "سائق" },
    "Chauffeur-livreur": { en: "Delivery driver", ar: "سائق توصيل" },
    "Chef de cuisine": { en: "Head chef", ar: "رئيس الطهاة" },
    "Chef de rang": { en: "Head waiter", ar: "رئيس الخدمة" },
    "Chef traiteur": { en: "Catering chef", ar: "طاهي التموين" },
    "Coach sportif": { en: "Fitness coach", ar: "مدرب رياضي" },
    "Coiffeur": { en: "Hairdresser", ar: "مصفف شعر" },
    "Coiffeuse": { en: "Hairdresser", ar: "مصففة شعر" },
    "Coloriste": { en: "Colourist", ar: "أخصائي صبغ الشعر" },
    "Commercial": { en: "Sales representative", ar: "مندوب مبيعات" },
    "Commis": { en: "Kitchen assistant", ar: "مساعد طباخ" },
    "Concierge": { en: "Concierge", ar: "موظف الكونسيرج" },
    "Conseiller": { en: "Advisor", ar: "مستشار" },
    "Conseiller abonnements": { en: "Membership advisor", ar: "مستشار الاشتراكات" },
    "Conseiller liste de mariage": { en: "Wedding registry advisor", ar: "مستشار قوائم الأعراس" },
    "Cuisinier": { en: "Cook", ar: "طباخ" },
    "Détacheur": { en: "Stain specialist", ar: "أخصائي إزالة البقع" },
    "Emballeur": { en: "Packer", ar: "عامل التغليف" },
    "Esthéticienne": { en: "Beautician", ar: "أخصائية تجميل" },
    "Femme de chambre": { en: "Room attendant", ar: "عاملة الغرف" },
    "Fleuriste": { en: "Florist", ar: "بائع الزهور" },
    "Gouvernante": { en: "Head housekeeper", ar: "مشرفة الغرف" },
    "Hôte d'accueil": { en: "Host", ar: "مضيف الاستقبال" },
    "Libraire": { en: "Bookseller", ar: "بائع الكتب" },
    "Livreur": { en: "Delivery rider", ar: "عامل توصيل" },
    "Magasinier": { en: "Stock keeper", ar: "أمين المخزن" },
    "Manager": { en: "Manager", ar: "مدير" },
    "Manucure": { en: "Manicurist", ar: "أخصائية العناية بالأظافر" },
    "Maquilleuse": { en: "Make-up artist", ar: "خبيرة مكياج" },
    "Masseur": { en: "Massage therapist", ar: "مدلّك" },
    "Masseuse": { en: "Massage therapist", ar: "مدلّكة" },
    "Maître d'hôtel": { en: "Maître d'hôtel", ar: "رئيس الصالة" },
    "Opérateur lavage": { en: "Washing operator", ar: "عامل الغسيل" },
    "Personal trainer": { en: "Personal trainer", ar: "مدرب شخصي" },
    "Pharmacien assistant": { en: "Assistant pharmacist", ar: "صيدلي مساعد" },
    "Pharmacien titulaire": { en: "Head pharmacist", ar: "الصيدلي المسؤول" },
    "Pizzaiolo": { en: "Pizza maker", ar: "صانع البيتزا" },
    "Plongeur": { en: "Dishwasher", ar: "غاسل الأواني" },
    "Professeur de cours collectif": { en: "Group class instructor", ar: "مدرب الحصص الجماعية" },
    "Propriétaire": { en: "Owner", ar: "المالك" },
    "Préparateur": { en: "Food preparer", ar: "معدّ الطعام" },
    "Préparateur en pharmacie": { en: "Pharmacy technician", ar: "تقني صيدلة" },
    "Pâtissier": { en: "Pastry chef", ar: "حلواني" },
    "Repasseur": { en: "Presser", ar: "عامل الكي" },
    "Responsable": { en: "Supervisor", ar: "مسؤول" },
    "Responsable commandes": { en: "Orders lead", ar: "مسؤول الطلبيات" },
    "Responsable d'atelier": { en: "Workshop lead", ar: "مسؤول الورشة" },
    "Responsable de production": { en: "Production lead", ar: "مسؤول الإنتاج" },
    "Responsable de shift": { en: "Shift lead", ar: "مسؤول الوردية" },
    "Responsable de tournée": { en: "Route lead", ar: "مسؤول الجولة" },
    "Responsable logistique": { en: "Logistics lead", ar: "مسؤول اللوجستيك" },
    "Responsable réservations": { en: "Reservations lead", ar: "مسؤول الحجوزات" },
    "Retoucheur": { en: "Alterations tailor", ar: "خياط التعديلات" },
    "Réassortisseur": { en: "Shelf stocker", ar: "عامل تعبئة الرفوف" },
    "Réceptionniste": { en: "Receptionist", ar: "موظف الاستقبال" },
    "Serveur": { en: "Waiter", ar: "نادل" },
    "Serveur événementiel": { en: "Event server", ar: "نادل الحفلات" },
    "Shampouineur": { en: "Shampoo assistant", ar: "مساعد غسل الشعر" },
    "Sommelier": { en: "Sommelier", ar: "خبير النبيذ" },
    "Sous-chef": { en: "Sous-chef", ar: "نائب رئيس الطهاة" },
    "Technicien": { en: "Technician", ar: "تقني" },
    "Technicien de maintenance": { en: "Maintenance technician", ar: "تقني الصيانة" },
    "Tourier": { en: "Dough maker", ar: "صانع العجين" },
    "Valet de chambre": { en: "Room attendant", ar: "عامل الغرف" },
    "Veilleur de nuit": { en: "Night porter", ar: "الحارس الليلي" },
    "Vendeur": { en: "Sales assistant", ar: "بائع" },
    "Vendeur conseil": { en: "Sales advisor", ar: "بائع مستشار" },
    "Visual merchandiser": { en: "Visual merchandiser", ar: "منسق العرض" },
    "Équipier": { en: "Team member", ar: "عضو الفريق" },
    "Équipier food truck": { en: "Food truck crew", ar: "عضو طاقم شاحنة الطعام" },
    "Équipier polyvalent": { en: "All-round crew", ar: "عضو فريق متعدد المهام" },
  };
  const JOB_DEPT = {
    "Accueil": { en: "Welcome desk", ar: "الاستقبال" },
    "Atelier": { en: "Workshop", ar: "الورشة" },
    "Atelier floral": { en: "Floral studio", ar: "ورشة الزهور" },
    "Bar": { en: "Bar", ar: "البار" },
    "Barbier": { en: "Barbering", ar: "الحلاقة" },
    "Caisse": { en: "Till", ar: "الصندوق" },
    "Coaching": { en: "Coaching", ar: "التدريب" },
    "Coiffure": { en: "Hair", ar: "تصفيف الشعر" },
    "Coloration": { en: "Colour", ar: "صبغ الشعر" },
    "Commandes": { en: "Orders", ar: "الطلبيات" },
    "Commercial": { en: "Business development", ar: "التطوير التجاري" },
    "Comptoir": { en: "Counter", ar: "منضدة البيع" },
    "Cours collectifs": { en: "Group classes", ar: "الحصص الجماعية" },
    "Cuisine": { en: "Kitchen", ar: "المطبخ" },
    "Direction": { en: "Leadership", ar: "الإدارة العامة" },
    "Emballage": { en: "Packing", ar: "التغليف" },
    "Entretien": { en: "Cleaning", ar: "النظافة" },
    "Esthétique": { en: "Beauty", ar: "التجميل" },
    "Four": { en: "Oven", ar: "الفرن" },
    "Fournil": { en: "Bakehouse", ar: "المخبز" },
    "Liste de mariage": { en: "Wedding registry", ar: "قوائم الأعراس" },
    "Livraison": { en: "Delivery", ar: "التوصيل" },
    "Logistique": { en: "Logistics", ar: "اللوجستيك" },
    "Maintenance": { en: "Maintenance", ar: "الصيانة" },
    "Management": { en: "Management", ar: "الإدارة" },
    "Manucure": { en: "Nails", ar: "العناية بالأظافر" },
    "Massage": { en: "Massage", ar: "التدليك" },
    "Opérations": { en: "Operations", ar: "العمليات" },
    "Plonge": { en: "Dish room", ar: "غسل الأواني" },
    "Production": { en: "Production", ar: "الإنتاج" },
    "Préparation": { en: "Preparation", ar: "التحضير" },
    "Pâtisserie": { en: "Pastry", ar: "الحلويات" },
    "Rayons": { en: "Shop floor", ar: "الرفوف" },
    "Repassage": { en: "Pressing", ar: "الكي" },
    "Restauration": { en: "Food and beverage", ar: "المطعم" },
    "Retouches": { en: "Alterations", ar: "التعديلات" },
    "Réception": { en: "Front desk", ar: "مكتب الاستقبال" },
    "Réservations": { en: "Reservations", ar: "الحجوزات" },
    "Salle": { en: "Dining room", ar: "القاعة" },
    "Service": { en: "Service", ar: "الخدمة" },
    "Stock": { en: "Stock", ar: "المخزون" },
    "Tournée": { en: "Route", ar: "الجولة" },
    "Vente": { en: "Sales", ar: "المبيعات" },
    "Vitrine": { en: "Display", ar: "الواجهة" },
    "Étages": { en: "Housekeeping", ar: "الطوابق" },
  };
  const jobName = (value, kind) => {
    const key = String(value == null ? '' : value);
    const lang = trLang();
    if (!key || lang === 'fr') return key;
    const row = (kind === 'dept' ? JOB_DEPT[key] || JOB_FN[key] : JOB_FN[key] || JOB_DEPT[key]);
    return (row && row[lang]) || key;
  };

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
    pressing: {
      departments: ['Accueil', 'Atelier', 'Repassage', 'Retouches', 'Livraison', 'Caisse', 'Management'],
      functions:   ['Agent de réception', 'Opérateur lavage', 'Détacheur', 'Repasseur', 'Retoucheur', 'Livreur', 'Caissier', "Responsable d'atelier", 'Manager'],
    },
    hotel: {
      departments: ['Réception', 'Réservations', 'Étages', 'Restauration', 'Maintenance', 'Caisse', 'Management'],
      functions:   ['Réceptionniste', 'Concierge', 'Veilleur de nuit', 'Responsable réservations', 'Gouvernante', 'Femme de chambre', 'Valet de chambre', 'Bagagiste', 'Technicien de maintenance', 'Caissier', 'Manager'],
    },
    fastfood: {
      departments: ['Cuisine', 'Comptoir', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Équipier polyvalent', 'Cuisinier', 'Préparateur', 'Caissier', 'Livreur', 'Plongeur', 'Responsable de shift', 'Manager'],
    },
    bakery: {
      departments: ['Fournil', 'Pâtisserie', 'Vente', 'Caisse', 'Livraison', 'Management'],
      functions:   ['Boulanger', 'Pâtissier', 'Tourier', 'Vendeur', 'Caissier', 'Livreur', 'Responsable de production', 'Manager'],
    },
    pizzeria: {
      departments: ['Cuisine', 'Four', 'Comptoir', 'Salle', 'Livraison', 'Caisse', 'Management'],
      functions:   ['Pizzaiolo', 'Aide-pizzaiolo', 'Préparateur', 'Serveur', 'Caissier', 'Livreur', 'Responsable de shift', 'Manager'],
    },
    traiteur: {
      departments: ['Production', 'Logistique', 'Service', 'Commercial', 'Caisse', 'Management'],
      functions:   ['Chef traiteur', 'Cuisinier', 'Commis', "Maître d'hôtel", 'Serveur événementiel', 'Chauffeur-livreur', 'Responsable logistique', 'Commercial', 'Caissier', 'Manager'],
    },
    foodtruck: {
      departments: ['Cuisine', 'Comptoir', 'Tournée', 'Caisse', 'Stock', 'Management'],
      functions:   ['Équipier food truck', 'Cuisinier', 'Préparateur', 'Caissier', 'Chauffeur', 'Responsable de tournée', 'Manager'],
    },
    librairie: {
      departments: ['Vente', 'Commandes', 'Caisse', 'Stock', 'Management'],
      functions:   ['Libraire', 'Conseiller', 'Caissier', 'Magasinier', 'Responsable commandes', 'Manager'],
    },
    maison: {
      departments: ['Vente', 'Vitrine', 'Liste de mariage', 'Emballage', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Vendeur conseil', 'Conseiller liste de mariage', 'Emballeur', 'Livreur', 'Caissier', 'Magasinier', 'Visual merchandiser', 'Manager'],
    },
    fleuriste: {
      departments: ['Atelier floral', 'Vente', 'Livraison', 'Caisse', 'Stock', 'Management'],
      functions:   ['Fleuriste', 'Aide-fleuriste', 'Conseiller', 'Livreur', 'Caissier', "Responsable d'atelier", 'Manager'],
    },
    coiffure: {
      departments: ['Coiffure', 'Coloration', 'Barbier', 'Accueil', 'Caisse', 'Management'],
      functions:   ['Coiffeur', 'Coiffeuse', 'Coloriste', 'Barbier', 'Shampouineur', 'Réceptionniste', 'Caissier', 'Manager'],
    },
    sport: {
      departments: ['Accueil', 'Coaching', 'Cours collectifs', 'Vente', 'Caisse', 'Entretien', 'Management'],
      functions:   ['Coach sportif', 'Personal trainer', 'Professeur de cours collectif', 'Conseiller abonnements', 'Réceptionniste', 'Caissier', "Agent d'entretien", 'Manager'],
    },
    autre: {
      departments: ['Opérations', 'Vente', 'Service', 'Caisse', 'Stock', 'Management'],
      functions:   ['Agent polyvalent', 'Conseiller', 'Technicien', 'Caissier', 'Magasinier', 'Responsable', 'Manager'],
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
  /* Le département suit le poste. Le formulaire proposait les deux listes
     côte à côte sans les relier : un nouveau membre naissait « Chef de cuisine
     · Cuisine », on choisissait « Serveur », et il restait en Cuisine. Le
     planning et la masse salariale par département le comptaient alors en
     cuisine. Pour chaque poste, les départements où il travaille, du plus
     probable au moins probable ; on prend le premier que le métier propose.
     Un poste absent d'ici laisse le département tel quel. */
  const FN_DEPT = {
    'Chef de cuisine': ['Cuisine', 'Production'], 'Sous-chef': ['Cuisine', 'Production'],
    'Cuisinier': ['Cuisine', 'Production'], 'Commis': ['Cuisine', 'Production'],
    'Chef traiteur': ['Production', 'Cuisine'], 'Préparateur': ['Cuisine', 'Comptoir'],
    'Chef de rang': ['Salle'], 'Serveur': ['Salle', 'Service'], "Maître d'hôtel": ['Salle', 'Service'],
    'Sommelier': ['Salle', 'Bar'], "Hôte d'accueil": ['Salle', 'Accueil'], 'Serveur événementiel': ['Service', 'Salle'],
    'Barman': ['Bar'], 'Barista': ['Comptoir', 'Bar'],
    'Caissier': ['Caisse'], 'Plongeur': ['Plonge', 'Cuisine'],
    'Pâtissier': ['Pâtisserie'], 'Aide-pâtissier': ['Pâtisserie'], 'Tourier': ['Pâtisserie', 'Fournil'],
    'Boulanger': ['Fournil'], 'Pizzaiolo': ['Four', 'Cuisine'], 'Aide-pizzaiolo': ['Four', 'Cuisine'],
    'Équipier polyvalent': ['Comptoir'], 'Équipier food truck': ['Comptoir'],
    'Manager': ['Management'], 'Responsable': ['Management'], 'Responsable de shift': ['Management'],
    'Responsable de production': ['Fournil', 'Production', 'Management'],
    "Responsable d'atelier": ['Atelier', 'Atelier floral', 'Management'],
    'Responsable de tournée': ['Tournée', 'Management'], 'Responsable logistique': ['Logistique', 'Management'],
    'Responsable réservations': ['Réservations', 'Management'], 'Responsable commandes': ['Commandes', 'Management'],
    'Pharmacien titulaire': ['Management', 'Comptoir'], 'Pharmacien assistant': ['Comptoir'],
    'Préparateur en pharmacie': ['Préparation'],
    'Vendeur': ['Vente', 'Rayons', 'Comptoir'], 'Vendeur conseil': ['Vente', 'Comptoir'],
    'Conseiller': ['Vente', 'Opérations'], 'Conseiller abonnements': ['Vente', 'Accueil'],
    'Conseiller liste de mariage': ['Liste de mariage', 'Vente'], 'Libraire': ['Vente'],
    'Magasinier': ['Stock', 'Rayons'], 'Réassortisseur': ['Rayons', 'Stock'],
    'Visual merchandiser': ['Vitrine', 'Vente'], 'Emballeur': ['Emballage'], 'Commercial': ['Commercial', 'Vente'],
    'Coiffeur': ['Coiffure'], 'Coiffeuse': ['Coiffure'], 'Shampouineur': ['Coiffure'],
    'Coloriste': ['Coloration', 'Coiffure'], 'Barbier': ['Barbier', 'Coiffure'],
    'Esthéticienne': ['Esthétique'], 'Maquilleuse': ['Esthétique'], 'Manucure': ['Manucure', 'Esthétique'],
    'Masseur': ['Massage'], 'Masseuse': ['Massage'],
    'Réceptionniste': ['Accueil', 'Réception'], 'Agent de réception': ['Accueil', 'Réception'],
    'Concierge': ['Réception'], 'Veilleur de nuit': ['Réception'], 'Bagagiste': ['Réception'],
    'Gouvernante': ['Étages'], 'Femme de chambre': ['Étages'], 'Valet de chambre': ['Étages'],
    'Technicien de maintenance': ['Maintenance'], 'Technicien': ['Maintenance', 'Opérations', 'Service'],
    'Opérateur lavage': ['Atelier'], 'Détacheur': ['Atelier'], 'Repasseur': ['Repassage', 'Atelier'],
    'Retoucheur': ['Retouches', 'Atelier'],
    'Livreur': ['Livraison'], 'Chauffeur-livreur': ['Livraison', 'Logistique'], 'Chauffeur': ['Tournée', 'Livraison'],
    'Fleuriste': ['Atelier floral'], 'Aide-fleuriste': ['Atelier floral'],
    'Coach sportif': ['Coaching'], 'Personal trainer': ['Coaching'],
    'Professeur de cours collectif': ['Cours collectifs'], "Agent d'entretien": ['Entretien'],
    'Agent polyvalent': ['Opérations'],
  };
  function deptForFunction(fn, departments) {
    const want = FN_DEPT[fn] || [];
    for (let i = 0; i < want.length; i++) if (departments.indexOf(want[i]) >= 0) return want[i];
    return '';
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
  const AVATAR_COLORS = { a: 'var(--atlas)', b: 'var(--riad)', c: '#9A5C0C', d: '#2B5C68' };

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

  /* ═══════════════ LES CODES NE RESTENT PAS SUR LE DISQUE ═══════════════════
   * Chaque salarié porte le code à quatre chiffres qui lui ouvre la caisse et
   * l'app employé (`pinCode` / `password`). Il était écrit EN CLAIR dans
   * localStorage (kiwiTeamV2:custom) : lisible dans n'importe quel navigateur où
   * le patron a ouvert Équipe (CLAUDE.md §6). Le patron, lui, doit continuer de
   * le LIRE ici — c'est voulu, voir functions/api/store.js › stripTeamCodes.
   *
   * La règle : le disque ne garde un code que tant que le serveur ne l'a pas.
   *   · le code vit en mémoire (window.__kiwiTeamV2), comme avant ;
   *   · persistTeams() l'ôte de la copie locale d'un salarié SEULEMENT si le
   *     serveur a confirmé ce code (`serverCodes` : lu par hydrateCodes(), ou
   *     accepté par une remontée réussie). Un code que le serveur n'a pas ne
   *     quitte jamais le disque : jamais de perte ;
   *   · un salarié dont le code a été ôté porte `hasCode: true` (jamais le code),
   *     et le patron le retrouve au chargement depuis la copie serveur.
   *
   * ⚠ Le danger n'est pas la lecture, c'est le RENVOI. La remontée du roster
   * (staff_pins, le document `team`, d'où l'app employé tire ses accès)
   * REMPLACE ce que le serveur porte par ce que le navigateur envoie : un
   * navigateur qui a oublié des codes les effacerait chez le serveur, et les
   * caissières se retrouveraient devant un pavé qui n'ouvre plus. Donc, tant
   * qu'un salarié a `hasCode` sans code en mémoire (« non résolu »), RIEN ne part :
   * ni publishPins(), ni la remontée du document (canPush de cloud-doc.js). */
  function memberCode(m) {
    if (!m) return '';
    if (isCode(m.pinCode)) return String(m.pinCode).trim();
    return isCode(m.password) ? String(m.password).trim() : '';
  }
  function codeUnresolved(m) { return !!(m && m.hasCode && !memberCode(m)); }
  function rosterHasUnresolved(members) { return (Array.isArray(members) ? members : []).some(codeUnresolved); }
  /* La copie qui va sur le disque : sans le code des salariés que le serveur a. */
  function diskMembers(members, serverCodes) {
    const known = serverCodes || {};
    return (Array.isArray(members) ? members : []).map((m) => {
      const code = memberCode(m);
      if (!m || !code || !m.id || known[m.id] !== code) return m;
      const { pinCode, password, ...rest } = m;
      return { ...rest, hasCode: true };
    });
  }
  /* La copie qui part sur le réseau : `hasCode` est un fait local, il ne voyage pas. */
  function outboundMembers(members) {
    return (Array.isArray(members) ? members : []).map((m) => {
      if (!m || !('hasCode' in m)) return m;
      const { hasCode, ...rest } = m;
      return rest;
    });
  }
  /* La fusion garde « le nôtre d'abord » ; elle n'oublie pas pour autant un code
     que seul l'autre côté porte. */
  function fillCodes(members, theirs) {
    const byId = Object.create(null);
    (Array.isArray(theirs) ? theirs : []).forEach((t) => { if (t && t.id) byId[t.id] = t; });
    return (Array.isArray(members) ? members : []).map((m) => {
      if (!m || memberCode(m)) return m;
      const code = memberCode(byId[m.id]);
      return code ? { ...m, pinCode: code, password: code } : m;
    });
  }
  /* Ce que dit la copie serveur du patron : note ce que le serveur détient
     (`serverCodes`), rend les codes aux salariés qui l'attendent, et lâche le
     drapeau de ceux dont la copie serveur est lue en clair et n'a PAS de code
     (elle seule fait foi : sinon ils bloqueraient la remontée pour toujours).
     Une copie sans AUCUN code lisible est une copie expurgée (compte non patron) :
     on n'en conclut rien. Résultat : { members, serverCodes }. */
  function applyServerCodes(members, serverMembers, serverCodes) {
    const known = { ...(serverCodes || {}) };
    const theirs = Array.isArray(serverMembers) ? serverMembers : [];
    const readable = theirs.some((t) => memberCode(t));
    const byId = Object.create(null);
    theirs.forEach((t) => {
      if (!t || !t.id) return;
      byId[t.id] = t;
      const c = memberCode(t);
      if (c) known[t.id] = c;
    });
    const out = (Array.isArray(members) ? members : []).map((m) => {
      if (!m || memberCode(m)) return m;
      const c = m.id && known[m.id];
      if (c) return { ...m, pinCode: c, password: c };
      if (m.hasCode && readable) { const { hasCode, ...rest } = m; return rest; }
      return m;
    });
    return { members: out, serverCodes: known };
  }
  const serverCodes = Object.create(null);   // id → code que le serveur détient (jamais écrit sur le disque)

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
      const roster = getMembers(teamKey(venue));
      /* Un salarié dont le code n'est pas encore revenu du serveur : publier
         maintenant REMPLACERAIT staff_pins sans lui, et sa caisse ne l'ouvrirait
         plus. On attend que le roster soit complet (hydrateCodes). */
      if (rosterHasUnresolved(roster)) return;
      roster.forEach((m) => {
        const code = memberCode(m);
        if (!code || seen[code]) return;                    // no code yet, or a duplicate
        seen[code] = 1;
        pins.push({
          memberId: m.id || '', code, name: memberFullName(m),
          firstName: m.firstName || '', lastName: m.lastName || '',
          email: m.email || '', role: m.function || m.department || 'staff',
          department: m.department || '', venueSlug: m.venueSlug || '',
        });
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
        email: (first + '.' + last).toLowerCase().replace(/[^a-z.]/g, '') + '@kiwi-os.com',
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
        notes: ['Disponible week-end','Demande horaires aménagés mardi','Allergies alimentaires connues','Permis B','·'][i % 5],
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
  if (!window.__kiwiTeamV2) window.__kiwiTeamV2 = { byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, periodKind: 'week', periodLocked: false };
  if (!window.__kiwiTeamV2.shiftsByVenue) window.__kiwiTeamV2.shiftsByVenue = {};
  if (!window.__kiwiTeamV2.planningByVenue) window.__kiwiTeamV2.planningByVenue = {};
  /* Period navigation is intentionally UI state: it never changes or copies
   * the saved shifts until the manager edits the newly displayed dates. */
  const periodOffsets = { week:0, fortnight:0, month:0 };
  /* Validated periods, per venue: { 'week:2026-10-05:2026-10-11': { locked, at } }.
   * They used to live in a plain object in this closure. « Période verrouillée ·
   * heures envoyées au planning » was announced, and the lock vanished on reload
   * or simply did not exist on the counter's iPad. They now travel with the
   * team document (locks), and `at` decides between two devices: the later
   * validate or unlock wins, so an unlock is never undone by a merge. */
  if (!window.__kiwiTeamV2.locksByVenue) window.__kiwiTeamV2.locksByVenue = {};
  /* Salariés supprimés, par établissement : [{ id, ts }]. La fusion est une
   * UNION de membres, donc sans pierre tombale un salarié retiré ici revenait
   * dès qu'une autre copie (le serveur, l'iPad du comptoir) le portait encore,
   * et le serveur, qui refuse un document vide, ne pouvait jamais enregistrer la
   * suppression du dernier salarié : il gardait son accès à l'app employé. */
  if (!window.__kiwiTeamV2.removedByVenue) window.__kiwiTeamV2.removedByVenue = {};

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
  /* « 7 h 30 » in French and English; Arabic writes its own units, « 7 س 30 د ».
   * An hour cell shows the decimal while it is edited, so nothing parses this. */
  function fmtDur(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    if (trLang() === 'ar') return m ? `${h} س ${pad(m)} د` : `${h} س`;
    return m ? `${h} h ${pad(m)}` : `${h} h`;
  }
  /* Attendance is stored as decimal hours for exact payroll arithmetic, but a
   * value such as 0.61 means 37 minutes — displaying it as "0,61" makes the
   * fractional part look like impossible clock minutes. */
  function fmtHours(value) {
    return fmtDur(Math.max(0, Math.round((Number(value) || 0) * 60)));
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
  function teamKey(venue) {
    if (venue && venue.custom) {
      /* God Mode uses one synthetic venue id (`scoped`) for every client. Using
       * that id as the Team key made the roster transient on purpose — and also
       * meant an employee visibly created from an operator-opened dashboard was
       * never written to that store's cloud document. Namespace the local key
       * with the server-confirmed slug instead: every client remains isolated,
       * while Équipe behaves like the same dashboard regardless of who opened
       * it. */
      if (venue.id === 'scoped' && venue.slug) return `scoped:${String(venue.slug)}`;
      return venue.id;
    }
    return (venue && venue.type) || 'restaurant';
  }
  const DEMO_TYPE_KEYS = new Set(['restaurant', 'boutique', 'spa', 'hotel']);
  /* venues.js les déclare transitoires et « never persisted » : 'scoped' est la
   * vue opérateur sur le client de quelqu'un d'autre, 'own' un placeholder de
   * session. Ils arrivaient pourtant dans kiwiTeamV2:custom — de l'état
   * opérateur écrit dans le stockage d'un commerçant. On ne les lit ni ne les
   * écrit plus, ce qui purge aussi les seaux déjà déposés. */
  const TRANSIENT_KEYS = new Set(['scoped', 'own']);
  const persistableTeamKey = (k) => !DEMO_TYPE_KEYS.has(k) && !TRANSIENT_KEYS.has(k);
  const LS_TEAM = 'kiwiTeamV2:custom';
  /* Le roster en mémoire appartient à UN compte. loadCustomTeams() le lit à
   * l'exécution du script, avant que /api/me ait répondu : si c'est un AUTRE
   * compte qui se connecte, identity.js purge puis recharge, et c'est
   * `pagehide → saveCustomTeams → persistTeams` qui réécrivait alors l'ancien
   * roster (codes compris) dans le stockage du nouveau compte. Deux gardes :
   *   · le drapeau `__kiwiTenantPurging` (posé par tenant-purge.js / identity.js
   *     AVANT de toucher au stockage) rend toute écriture muette ;
   *   · le disque est estampillé du compte (`account`) : un roster qui n'est pas
   *     celui du compte courant n'est ni lu ni réécrit. */
  function teamAccount() { try { return String(localStorage.getItem('kiwiAccountKey') || '').trim().toLowerCase(); } catch (_) { return ''; } }
  let ROSTER_ACCOUNT = teamAccount();
  function rosterWriteBlocked() {
    if (window.__kiwiTenantPurging === true) return true;
    const a = teamAccount();
    return !!(ROSTER_ACCOUNT && a && a !== ROSTER_ACCOUNT);
  }
  function loadCustomTeams() {
    try {
      ROSTER_ACCOUNT = teamAccount();
      const raw = JSON.parse(localStorage.getItem(LS_TEAM) || '{}');
      if (raw && raw.account && ROSTER_ACCOUNT && String(raw.account).toLowerCase() !== ROSTER_ACCOUNT) return;
      const root = window.__kiwiTeamV2;
      Object.keys(raw.byVenue || {}).forEach((k) => {
        if (persistableTeamKey(k)) {
          root.byVenue[k] = raw.byVenue[k];
          root.hoursByVenue[k] = (raw.hoursByVenue || {})[k] || {};
          root.shiftsByVenue[k] = (raw.shiftsByVenue || {})[k] || {};
          root.planningByVenue[k] = window.KiwiPlanningCore?.normalize?.((raw.planningByVenue || {})[k], root.byVenue[k]) || (raw.planningByVenue || {})[k] || {};
          root.locksByVenue[k] = cleanLocks((raw.locksByVenue || {})[k]);
          root.removedByVenue[k] = cleanRemoved((raw.removedByVenue || {})[k]);
        }
      });
    } catch (_) {}
  }
  const REMOVED_CAP = 200;
  function cleanRemoved(src) {
    const byId = Object.create(null);
    (Array.isArray(src) ? src : []).forEach((r) => {
      const id = r && typeof r.id === 'string' ? r.id.slice(0, 96) : '';
      if (!id) return;
      const ts = Number(r.ts) || 0;
      if (!byId[id] || ts > byId[id].ts) byId[id] = { id, ts };
    });
    return Object.keys(byId).map((id) => byId[id]).sort((a, b) => b.ts - a.ts).slice(0, REMOVED_CAP);
  }
  function mergeRemoved(a, b) { return cleanRemoved([].concat(a || [], b || [])); }
  const LOCK_KEY_RE = /^(week|fortnight|month):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/;
  function cleanLocks(src) {
    const out = {};
    Object.keys(src || {}).forEach((key) => {
      const v = src[key];
      if (!LOCK_KEY_RE.test(key) || !v || typeof v !== 'object') return;
      out[key] = { locked: !!v.locked, at: Number(v.at) || 0 };
    });
    return out;
  }
  function mergeLocks(mine, theirs) {
    const out = cleanLocks(theirs);
    const own = cleanLocks(mine);
    Object.keys(own).forEach((key) => { if (!out[key] || own[key].at >= out[key].at) out[key] = own[key]; });
    return out;
  }
  /* L'écriture locale, et rien d'autre. Séparée de saveCustomTeams() parce que
   * la copie serveur, en redescendant, doit pouvoir se poser sans redéclencher
   * une remontée : sinon deux appareils se renvoient la balle indéfiniment. */
  function persistTeams() {
    if (rosterWriteBlocked()) return;
    try {
      const root = window.__kiwiTeamV2;
      const out = { account: teamAccount() || ROSTER_ACCOUNT, byVenue: {}, hoursByVenue: {}, shiftsByVenue: {}, planningByVenue: {}, locksByVenue: {}, removedByVenue: {} };
      Object.keys(root.byVenue).forEach((k) => {
        if (persistableTeamKey(k)) {
          out.byVenue[k] = diskMembers(root.byVenue[k], serverCodes);
          out.hoursByVenue[k] = root.hoursByVenue[k] || {};
          out.shiftsByVenue[k] = root.shiftsByVenue[k] || {};
          out.planningByVenue[k] = root.planningByVenue[k] || {};
          out.locksByVenue[k] = root.locksByVenue[k] || {};
          out.removedByVenue[k] = root.removedByVenue[k] || [];
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
    if (rosterWriteBlocked()) return;
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
    try {
      const v = window.KiwiVenue?.getCurrentVenueData?.();
      // `v.slug` only exists after /api/me authenticated the God Mode scope.
      // Never derive this from the visible store name or the URL.
      if (v && v.id === 'scoped' && v.slug) return String(v.slug);
      return k && window.KiwiCloudDoc ? window.KiwiCloudDoc.slugFor(k) : '';
    }
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
    const removed = cleanRemoved(src.removed);
    const gone = Object.create(null);
    removed.forEach((r) => { gone[r.id] = 1; });
    const members = (Array.isArray(src.members) ? src.members : [])
      .filter((m) => memberBelongsToStore(m, slug) && !(m && gone[m.id]));
    const alive = Object.create(null);
    members.forEach((m) => { if (m && m.id) alive[m.id] = 1; });
    return {
      members,
      removed,
      hours: mergeByDay(src.hours, null, alive),
      shifts: mergeByDay(src.shifts, null, alive),
      planning: window.KiwiPlanningCore?.normalize?.(src.planning, members) || src.planning || {},
      locks: cleanLocks(src.locks),
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
    /* Une suppression EST enregistrée : l'union ne ressuscite plus un salarié
     * dont l'un des deux côtés porte la pierre tombale. */
    const removed = mergeRemoved(mine && mine.removed, theirs && theirs.removed);
    const gone = Object.create(null);
    removed.forEach((r) => { gone[r.id] = 1; });
    const take = (m) => { const id = m && m.id; if (!id || seen[id] || gone[id]) return; seen[id] = 1; members.push(m); };
    ((mine && mine.members) || []).forEach(take);
    ((theirs && theirs.members) || []).forEach(take);
    return {
      members: fillCodes(members, theirs && theirs.members),
      removed,
      hours: mergeByDay(mine && mine.hours, theirs && theirs.hours, seen),
      shifts: mergeByDay(mine && mine.shifts, theirs && theirs.shifts, seen),
      planning: window.KiwiPlanningCore?.merge?.(mine && mine.planning, theirs && theirs.planning, members) || mine.planning || theirs.planning || {},
      locks: mergeLocks(mine && mine.locks, theirs && theirs.locks),
    };
  }

  let teamCloud = null;
  function teamCloudInit() {
    if (teamCloud || !window.KiwiCloudDoc) return teamCloud;
    teamCloud = window.KiwiCloudDoc.attach({
      feature: 'team',
      slug: () => teamSlug(),
      read: () => {
        const k = teamVenueKey();
        const root = window.__kiwiTeamV2;
        if (!k) return { members: [], removed: [], hours: {}, shifts: {}, planning: {}, locks: {} };
        return scopeTeamDoc({
          members: outboundMembers(root.byVenue[k] || []),
          removed: root.removedByVenue[k] || [],
          hours: root.hoursByVenue[k] || {},
          shifts: root.shiftsByVenue[k] || {},
          planning: root.planningByVenue[k] || {},
          locks: root.locksByVenue[k] || {},
        }, teamSlug());
      },
      write: (doc) => {
        const k = teamVenueKey();
        if (!k || !doc) return;
        const root = window.__kiwiTeamV2;
        const clean = scopeTeamDoc(doc, teamSlug());
        root.byVenue[k] = clean.members;
        root.removedByVenue[k] = clean.removed;
        root.hoursByVenue[k] = clean.hours;
        root.shiftsByVenue[k] = clean.shifts;
        root.planningByVenue[k] = clean.planning;
        root.locksByVenue[k] = clean.locks;
        restorePeriodLock(root, root.periodKind, buildPeriod(root.periodKind));
        persistTeams();          // surtout PAS saveCustomTeams : pas de re-remontée
        afterTeamChange();       // le till et la carte d'accueil apprennent l'équipe
      },
      merge: mergeTeamDoc,
      /* Voir « LES CODES NE RESTENT PAS SUR LE DISQUE » : un roster qui a oublié des
         codes ne remonte pas (il les effacerait chez le serveur). */
      canPush: () => {
        const k = teamVenueKey();
        const ok = !k || !rosterHasUnresolved(window.__kiwiTeamV2.byVenue[k]);
        if (!ok) heldPush = true;
        return ok;
      },
      onPushed: (doc) => {
        let changed = false;
        ((doc && doc.members) || []).forEach((m) => {
          const c = memberCode(m);
          if (c && m.id && serverCodes[m.id] !== c) { serverCodes[m.id] = c; changed = true; }
        });
        if (changed) persistTeams();           // le serveur l'a : le disque peut le lâcher
      },
      isEmpty: (d) => !d || !((d.members && d.members.length) || (d.removed && d.removed.length)),
      // Le roster vient d'arriver du serveur : la page ouverte doit le montrer,
      // sinon le commerçant regarde une équipe vide qui n'existe plus.
      onPulled: () => { if (pageActive) { try { render(); } catch (_) {} } },
    });
    return teamCloud;
  }
  let heldPush = false;   // une remontée a été retenue faute de codes : à relancer une fois le roster complet
  /* Rend aux salariés leur code depuis la copie serveur du patron (le disque ne
   * le garde plus), et note ce que le serveur détient. Lecture directe : un
   * `pull` conclut « déjà à jour » dès que la révision est connue, donc il ne
   * rendrait jamais un code que la copie locale n'a plus. Une panne ne change
   * rien : les salariés restent « non résolus », et RIEN ne part (canPush /
   * publishPins), donc le serveur ne perd rien. */
  function hydrateCodes() {
    const c = teamCloudInit();
    const slug = teamSlug();
    const k = teamVenueKey();
    if (!c || !slug || !k || !c.enabled()) return Promise.resolve(false);
    return fetch('/api/store?feature=team&merchant=' + encodeURIComponent(slug), { headers: { Accept: 'application/json' } })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((res) => {
        if (!res || slug !== teamSlug() || k !== teamVenueKey()) return false;
        const root = window.__kiwiTeamV2;
        const applied = applyServerCodes(root.byVenue[k] || [], res.data && res.data.members, serverCodes);
        Object.assign(serverCodes, applied.serverCodes);
        root.byVenue[k] = applied.members;
        persistTeams();                       // ce que le serveur a confirmé quitte le disque
        if (!rosterHasUnresolved(applied.members) && heldPush) { heldPush = false; c.push(0, true); }
        if (pageActive) { try { render(); } catch (_) {} }
        return true;
      })
      .catch(() => false);
  }
  function teamCloudBind() {
    const c = teamCloudInit();
    if (c) Promise.resolve(c.bind()).then(() => hydrateCodes()).then(() => publishPins()).catch(() => {});
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
      const slug = teamSlug();
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
    if (!root.planningByVenue[key]) root.planningByVenue[key] = window.KiwiPlanningCore?.blank?.() || {};
    root.planningByVenue[key] = window.KiwiPlanningCore?.normalize?.(root.planningByVenue[key], root.byVenue[key]) || root.planningByVenue[key];
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
    kind = ['week', 'fortnight', 'month'].includes(kind) ? kind : 'week';
    const core = window.KiwiPlanningCore?.calendarPeriod?.(kind, toISO(today), periodOffsets[kind] || 0);
    if (core) {
      const start = fromISO(core.start), end = fromISO(core.end);
      return { start:core.start, end:core.end, startFr:fmtFr(start), endFr:fmtFr(end), days:core.days };
    }
    /* Fail-soft fallback for a partially cached shell. */
    let start, end;
    if (kind === 'month') {
      start = new Date(today.getFullYear(), today.getMonth() + (periodOffsets.month || 0), 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    } else {
      const day = today.getDay(), span = kind === 'fortnight' ? 14 : 7;
      start = new Date(today); start.setDate(today.getDate() - ((day + 6) % 7) + (periodOffsets[kind] || 0) * span);
      end = new Date(start); end.setDate(start.getDate() + span - 1);
    }
    const days = [], cur = new Date(start);
    while (cur <= end) { days.push(toISO(cur)); cur.setDate(cur.getDate() + 1); }
    return { start: toISO(start), end: toISO(end), startFr: fmtFr(start), endFr: fmtFr(end), days };
  }

  function periodNavigatorHtml(T, period) {
    const kind = window.__kiwiTeamV2.periodKind || 'week';
    const shifted = (periodOffsets[kind] || 0) !== 0;
    return `<nav class="kt-period-nav" aria-label="${esc(T.hPeriodLabel(period.startFr, period.endFr))}">
      <button class="kt-period-arrow" type="button" data-action="kt-period-nav" data-arg="prev" aria-label="${esc(T.plPrevPeriod)}" title="${esc(T.plPrevPeriod)}">‹</button>
      <strong>${esc(T.hPeriodLabel(period.startFr, period.endFr))}</strong>
      <button class="kt-period-arrow" type="button" data-action="kt-period-nav" data-arg="next" aria-label="${esc(T.plNextPeriod)}" title="${esc(T.plNextPeriod)}">›</button>
      ${shifted ? `<button class="kt-period-current" type="button" data-action="kt-period-nav" data-arg="current">${esc(T.plCurrentPeriod)}</button>` : ''}
    </nav>`;
  }

  /* The lock bucket of the venue on screen. A demo venue keeps its bucket in
   * memory only (persistTeams skips it), like the rest of its seeded team. */
  function lockBucket(root) {
    let k = 'restaurant';
    try { k = teamKey(window.KiwiVenue?.getCurrentVenueData?.()); } catch (_) {}
    if (!root.locksByVenue[k]) root.locksByVenue[k] = {};
    return root.locksByVenue[k];
  }
  const lockKeyOf = (kind, period) => `${kind}:${period.start}:${period.end}`;
  function setPeriodLock(root, kind, period, locked) {
    lockBucket(root)[lockKeyOf(kind, period)] = { locked: !!locked, at: Date.now() };
    root.periodLocked = !!locked;
    saveCustomTeams();
  }
  function restorePeriodLock(root, kind, period) {
    const entry = lockBucket(root)[lockKeyOf(kind, period)];
    root.periodLocked = !!(entry && entry.locked);
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
  let liveTeam = { merchant: '', members: [] };
  let liveTeamSignature = '';
  let liveTeamBusy = false;
  let liveTeamPendingRender = false;

  function liveMember(memberId) {
    return (liveTeam.members || []).find((member) => String(member.id || '') === String(memberId || '')) || null;
  }
  // Demo attendance is derived from the same hours grid as Payroll. Never
  // infer a real employee's live clock-in from a recorded/planned hour.
  function memberDutyStatus(member, hours, day) {
    if (isCustomVenue()) return (liveMember(member.id) || {}).status || 'off-duty';
    return (+((hours[member.id] || {})[day]) || 0) > 0 ? 'on-duty' : 'off-duty';
  }
  /* Le sondage ci-dessous tourne toutes les secondes et `pointedHours` est un
   * temps écoulé : dès qu'un employé est pointé, la réponse du serveur change
   * toute seule (27,43 h → 27,44 h). Repeindre à ce moment-là arrachait
   * l'éditeur de service des mains du gérant — render() commence par
   * closeShiftPop() — et lui volait le focus au milieu de la saisie d'un
   * horaire. Tant qu'il édite, on garde la donnée et on remet la peinture à la
   * fin de la saisie. */
  function teamIsBeingEdited() {
    if (shiftPop) return true;
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    return /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName || '');
  }
  function applyLiveTeam() {
    if (teamIsBeingEdited()) { liveTeamPendingRender = true; return; }
    liveTeamPendingRender = false;
    if (pageActive) render();
    try { window.dispatchEvent(new Event('kiwi-team-changed')); } catch (_) {}
  }
  function pollLiveTeam() {
    if (liveTeamBusy || !isCustomVenue()) return;
    const merchant = teamSlug();
    if (!merchant) return;
    liveTeamBusy = true;
    fetch('/api/team/live?merchant=' + encodeURIComponent(merchant), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!data || !data.ok || data.merchant !== merchant) return;
      const signature = JSON.stringify([merchant, data.members || [], data.pointedHours || {}]);
      /* Réponse identique à la précédente ⇒ rien à fusionner, rien à écrire.
         La fusion des heures pointées se faisait à CHAQUE réponse, donc
         persistTeams() réécrivait 70 ko de localStorage toutes les secondes
         pour reposer exactement les mêmes octets. */
      if (signature === liveTeamSignature) return;
      liveTeamSignature = signature;
      liveTeam = { merchant, members: Array.isArray(data.members) ? data.members : [] };
      const venueKey = teamVenueKey();
      if (venueKey && data.pointedHours && typeof data.pointedHours === 'object') {
        const root = window.__kiwiTeamV2;
        const venueHours = root.hoursByVenue[venueKey] || (root.hoursByVenue[venueKey] = {});
        // Un membre retiré ne récupère pas ses heures à la réponse suivante.
        const gone = new Set((root.removedByVenue[venueKey] || []).map((r) => String(r && r.id || '')));
        /* Une écriture localStorage par seconde pour des heures inchangées :
         * on ne persiste que ce qui a réellement bougé. */
        let touched = false;
        Object.keys(data.pointedHours).forEach((memberId) => {
          if (gone.has(memberId)) return;
          const before = JSON.stringify(venueHours[memberId] || {});
          const merged = Object.assign({}, venueHours[memberId] || {}, data.pointedHours[memberId] || {});
          if (JSON.stringify(merged) === before) return;
          venueHours[memberId] = merged;
          touched = true;
        });
        if (touched) persistTeams();
      }
      /* La signature est déjà posée plus haut : l'ancien test
         « signature !== liveTeamSignature » était donc toujours faux, et un
         pointage à la caisse n'arrivait jamais à l'écran tant que rien
         d'autre ne redessinait la page. Arrivé ici, quelque chose a changé. */
      applyLiveTeam();
    }).catch(() => {}).finally(() => { liveTeamBusy = false; });
  }
  /* Le pointage doit battre à la seconde QUAND on le regarde. Ailleurs — c'est
     à dire sur chacune des autres pages du tableau de bord, où ce module n'a
     rien à l'écran — la même seconde faisait une requête réseau et un tour de
     JSON.stringify sur toute l'équipe, pour personne. Et le premier chargement
     du tableau de bord, lui, a mieux à faire que ça pendant que les chiffres
     arrivent. On garde la seconde sur Équipe/Paie, on lève le pied partout
     ailleurs, et on s'arrête net quand l'onglet passe en arrière-plan. */
  const LIVE_TEAM_FAST_MS = 1000, LIVE_TEAM_IDLE_MS = 20000;
  let liveTeamTimer = null;
  function scheduleLiveTeam() {
    if (liveTeamTimer) { clearTimeout(liveTeamTimer); liveTeamTimer = null; }
    let hidden = false;
    try { hidden = !!document.hidden; } catch (_) {}
    const wait = (pageActive && !hidden) ? LIVE_TEAM_FAST_MS : LIVE_TEAM_IDLE_MS;
    liveTeamTimer = setTimeout(() => { try { pollLiveTeam(); } catch (_) {} scheduleLiveTeam(); }, wait);
  }
  function startLiveTeamPolling() {
    scheduleLiveTeam();
    try { document.addEventListener('visibilitychange', scheduleLiveTeam); } catch (_) {}
  }
  if (window.KiwiDashboardBoot?.whenUnlocked) window.KiwiDashboardBoot.whenUnlocked(startLiveTeamPolling);
  else startLiveTeamPolling();

  /* ═══════════════ HELPERS ═══════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const memberFullName = (m) => `${m.firstName || ''} ${m.lastName || ''}`.trim() || '·';
  function isCustomVenue() { const KV = window.KiwiVenue; return !!(KV && KV.isCustom && KV.isCustom()); }

  function fmtMad(n) {
    return (window.KiwiNumber?.number(Math.round(n || 0)) ?? new Intl.NumberFormat(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n || 0))) + ' MAD';
  }

  function memberMatchesFilters(m) {
    const { search, dept, contract, lang } = activeFilters;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${memberFullName(m)} ${m.function} ${m.department} ${jobName(m.function)} ${jobName(m.department, 'dept')} ${m.email}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (dept && m.department !== dept) return false;
    if (contract && m.contract !== contract) return false;
    if (lang && !(m.languages || []).includes(lang)) return false;
    return true;
  }

  /* ═══════════════ SVG ICONS ═══════════════ */
  const svgIcon = (name, sz = 14) => `<i data-lucide="${name}" style="width:${sz}px;height:${sz}px" aria-hidden="true"></i>`;
  const IC = {
    plus: 'plus', search: 'search', edit: 'pencil', trash: 'trash-2', eye: 'eye',
    refresh: 'refresh-cw', copy: 'copy', download: 'arrow-down-to-line',
    upload: 'arrow-up-from-line', check: 'check', lock: 'lock', unlock: 'unlock',
    users: 'users', userCheck: 'user-check', wallet: 'wallet', timer: 'timer',
    calendar: 'calendar'
  };

  /* ═══════════════ PAGE SHOW / HIDE ═══════════════ */
  function showPage() {
    pageActive = true;
    pageMode = 'equipe';
    // Exactly one page shell at a time — see Kiwi.pageShell.
    if (window.Kiwi && Kiwi.pageShell) Kiwi.pageShell('equipe');
    else document.body.classList.add('page-equipe');
    // « Accueil / Équipe » in the screen's language, repainted on a switch.
    window.Kiwi?.breadcrumb?.(() => t().breadcrumb);
    window.Kiwi?.setActivePage?.('equipe');
    document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.remove('active'));
    document.querySelector('.sidebar nav a[data-nav="equipe"]')?.classList.add('active');
    window.scrollTo({ top: 0 });

    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    ensureVenueData(venue);
    pollLiveTeam();
    scheduleLiveTeam();          // la page est à l'écran : on repasse à la seconde
    /* Re-render when the venue or language changes. */
    if (!unsubscribeVenue && window.KiwiVenue?.subscribe) {
      unsubscribeVenue = window.KiwiVenue.subscribe(() => {
        if (!pageActive || !teamOnScreen()) return;
        const v2 = window.KiwiVenue.getCurrentVenueData();
        ensureVenueData(v2);
        liveTeam = { merchant: '', members: [] }; liveTeamSignature = '';
        pollLiveTeam();
        render();
      });
    }
    bindLangChange();
    render();
  }

  /* Re-render in the new language, Équipe and Paie alike. The old guard waited
     for KiwiI18n.onLangChange, which does not exist: the page stayed in the
     language it was opened in. setLang() fires kiwi:langchange after it has
     rewritten the [data-i18n] copy. pageActive outlives a jump from Paie to
     Stock (no showDashboard() runs on that path), so it is not enough on its
     own: render() in payroll mode would reopen Paie over the Stock page. The
     venue subscriptions ask the same question. */
  function teamOnScreen() {
    const b = document.body.classList;
    return pageMode === 'payroll'
      ? b.contains('page-genpage') && window.Kiwi?.activePage === 'payroll'
      : b.contains('page-equipe');
  }
  function bindLangChange() {
    if (unsubscribeLang) return;
    window.addEventListener('kiwi:langchange', () => { if (pageActive && teamOnScreen()) render(); });
    unsubscribeLang = true;
  }

  function deactivateTeam() {
    pageActive = false;
    pageMode = null;
    if (unsubscribeVenue) { try { unsubscribeVenue(); } catch (_) {} unsubscribeVenue = null; }
  }
  window.__kiwiTeamDeactivate = deactivateTeam;

  function showDashboard() {
    if (!pageActive) return;
    pageActive = false;
    scheduleLiveTeam();          // plus personne ne regarde : on leve le pied
    pageMode = null;
    document.body.classList.remove('page-equipe');
    window.Kiwi?.breadcrumb?.();
    if (unsubscribeVenue) { try { unsubscribeVenue(); } catch (_) {} unsubscribeVenue = null; }
    window.Kiwi?.setActivePage?.('accueil');
  }

  /* =============================== RENDER =============================== */
  function render() {
    // L'editeur de service est ancre sur une case : la case disparait, lui aussi.
    closeShiftPop();
    /* The validated-period lock is stored, not remembered: re-read it for the
       venue and period on screen (first open, store switch, cloud pull). */
    { const root = window.__kiwiTeamV2; restorePeriodLock(root, root.periodKind || 'week', buildPeriod(root.periodKind || 'week')); }
    if (pageMode === 'payroll') {
      const payrollNav = document.querySelector('.sidebar nav a[data-nav="payroll"]');
      if (!payrollNav?.classList.contains('active') && document.body.classList.contains('page-genpage')) {
        deactivateTeam();
        return;
      }
      showPayroll();
      return;
    }
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
      ? `<div class="eq-section" style="text-align:center; color:var(--n-500); padding:36px 14px;">${esc(members.length ? T.noMatch : T.noMembersYet)}</div>`
      : renderMembersTable(T, visible, venueType);
    /* Also keep the badge count fresh */
    const badge = root.querySelector('[data-kt-count-badge]');
    if (badge) badge.textContent = T.secAllMembersBadge(visible.length);
  }

  /* ═══════════════ HEADER ═══════════════ */
  function renderHeader(T, venue, members) {
    const employeeAppLabel = trLang() === 'ar' ? 'تطبيق الموظفين' : trLang() === 'en' ? 'Employee app' : 'App employés';
    const showEmployeeApp = venue && venue.custom && (tradeKey(venue) === 'restaurant' || tradeKey(venue) === 'cafe');
    return `
      <div class="eq-head">
        <div>
          <div class="eq-title">${esc(T.title)}</div>
          <div class="eq-date">${esc(T.subDate(todayLongLabel()))}</div>
        </div>
        <div class="eq-head-acts">
          ${showEmployeeApp ? `<button class="btn-slim" type="button" data-action="kt-employee-app">${svgIcon(IC.users, 13)}<span>${esc(employeeAppLabel)}</span></button>` : ''}
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
    const monthlyPayroll = members.reduce((acc, m) => acc + (+m.baseSalary || 0), 0);
    /* Un salaire laissé vide n'est pas un salaire de 0 MAD : la tuile disait
       « 0 MAD · salaires de base cumulés » pour une équipe dont personne
       n'avait saisi la paie, et chaque ligne « 0 MAD / 0 MAD/h ». */
    const salaried = members.filter((m) => (+m.baseSalary || 0) > 0).length;
    const payrollSub = !salaried ? T.statPayrollNone
      : (salaried < totalMembers ? T.statPayrollPartial(salaried, totalMembers) : T.statPayrollSub);
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    const hours = getHours(venueType);
    // Summary and individual rows must describe the same demo roster.
    const todayKey = toISO(new Date());
    const presentLive = isCustomVenue() && liveTeam.merchant === teamSlug();
    const present = isCustomVenue()
      ? (presentLive
        ? liveTeam.members.filter((member) => member.status === 'on-duty' || member.status === 'on-pause').length
        : members.filter((m) => (+((hours[m.id] || {})[todayKey]) || 0) > 0).length)
      : members.filter(m => memberDutyStatus(m, hours, todayKey) === 'on-duty').length;
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
        ${tile(T.statPresent, String(present),                        !isCustomVenue() ? T.statPresentDemoSub : (presentLive ? T.statPresentSub : T.statPresentHoursSub))}
        ${tile(T.statPayroll, salaried ? fmtMad(monthlyPayroll) : '·', payrollSub)}
        ${tile(T.statHours,   fmtHours(totalHours), T.statHoursSub)}
      </div>
    `;

    /* Filter pill rows */
    const deptList = ['<button class="eq-pill' + (!activeFilters.dept ? ' on' : '') + '" type="button" data-action="kt-filter-dept" data-arg="">' + esc(T.filterAllDept) + '</button>',
      ...cat.departments.map(d => `<button class="eq-pill${activeFilters.dept === d ? ' on' : ''}" type="button" data-action="kt-filter-dept" data-arg="${esc(d)}">${esc(jobName(d, 'dept'))}</button>`)].join('');
    const ctList = ['<button class="eq-pill' + (!activeFilters.contract ? ' on' : '') + '" type="button" data-action="kt-filter-contract" data-arg="">' + esc(T.filterAllContract) + '</button>',
      ...CONTRACT_TYPES.map(c => `<button class="eq-pill${activeFilters.contract === c ? ' on' : ''}" type="button" data-action="kt-filter-contract" data-arg="${esc(c)}">${esc(contractLabel(T, c))}</button>`)].join('');

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
            ? `<div style="padding:44px 20px;text-align:center;color:var(--n-500);font-size:13px;background:var(--paper-soft);border:1px dashed var(--n-300);border-radius:14px;display:flex;flex-direction:column;align-items:center;">
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:12px;">
                  <svg width="22" height="22" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
                </div>
                <div style="font-weight:600;font-size:14.5px;color:var(--ink);margin-bottom:4px;">${esc(members.length ? T.noMatch : T.noMembersYet)}</div>
                ${members.length ? '' : `<div style="max-width:44ch;line-height:1.45;">${esc(T.noMembersHint)}</div>`}
                <button class="kb atlas" type="button" data-action="kt-add-member" style="margin-top:12px;">${svgIcon(IC.plus, 13)}${esc(T.addMember)}</button>
              </div>`
            : renderMembersTable(T, visible, venueType)}
        </div>
      </div>
    `;
  }

  function renderMembersTable(T, list, venueType) {
    const hours = getHours(venueType), todayKey = toISO(new Date());
    const rows = list.map(m => {
      const ini = initials(m.firstName, m.lastName);
      const tone = m.avatarTone || 'a';
      const contractTone = m.contract === 'CDI' ? 'ok' : (m.contract === 'CDD' || m.contract === 'Stage') ? 'pend' : 'neutral';
      const contractCls = contractTone === 'ok' ? 'kt-tag kt-tag-ok'
        : contractTone === 'pend' ? 'kt-tag kt-tag-pend'
        : 'kt-tag kt-tag-neutral';
      const langChips = (m.languages || []).slice(0, 3).map(l => `<span class="kt-langchip">${esc(langLabel(T, l))}</span>`).join('') + ((m.languages || []).length > 3 ? `<span class="kt-langchip">+${(m.languages || []).length - 3}</span>` : '');
      const status = memberDutyStatus(m, hours, todayKey);
      const liveText = status === 'on-pause' ? T.livePaused
        : status === 'on-duty' ? T.liveOnDuty : T.liveOffDuty;
      const liveColor = status === 'on-pause' ? '#B26B0F'
        : status === 'on-duty' ? 'var(--atlas)' : 'var(--n-500)';
      return `
        <tr class="eq-row-in">
          <td>
            <div class="eq-member">
              <span class="eq-av md" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(ini)}</span>
              <div>
                <div class="eq-member-name">${esc(memberFullName(m))}</div>
                <div class="eq-member-role">${m.email ? esc(m.email) + ' · ' : ''}<span style="color:${liveColor};font-weight:600;">${esc(liveText)}</span></div>
                <div class="eq-member-phone-role">${esc(jobName(m.function))}</div>
                <div class="eq-member-phone-meta">${m.department ? `<span class="eq-venue-badge">${esc(jobName(m.department, 'dept'))}</span>` : ''}<span class="eq-member-phone-status" style="color:${liveColor}">${esc(liveText)}</span></div>
              </div>
            </div>
            <button class="eq-member-open" type="button" data-action="kt-view-profile" data-arg="${esc(m.id)}" aria-label="${esc(T.viewProfile)}: ${esc(memberFullName(m))}"></button>
          </td>
          <td><div class="kt-cell-strong">${esc(jobName(m.function))}</div></td>
          <td>${m.department ? `<span class="eq-venue-badge">${esc(jobName(m.department, 'dept'))}</span>` : '<span class="eq-cell-empty">·</span>'}</td>
          <td><span class="${contractCls}">${esc(m.contract ? contractLabel(T, m.contract) : '·')}</span></td>
          <td><div class="kt-chips">${langChips || '<span class="eq-cell-empty">·</span>'}</div></td>
          <td>${(+m.baseSalary || 0) > 0 || (+m.hourlyRate || 0) > 0
            ? `<div class="eq-salary-v">${(+m.baseSalary || 0) > 0 ? fmtMad(m.baseSalary) : '·'}</div><div class="eq-salary-sub">${(+m.hourlyRate || 0) > 0 ? (window.KiwiNumber?.format((+m.hourlyRate), {}) ?? (+m.hourlyRate).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {})) + ' MAD/h' : '·'}</div>`
            : `<div class="eq-salary-v">·</div><div class="eq-salary-sub">${esc(T.salaryUnset)}</div>`}</td>
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
    let grandHours = 0, grandPay = 0, anyRated = false;

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
          <input type="text" inputmode="decimal" value="${esc(fmtHours(v))}" data-hours-value="${v}" data-kt-hour data-mid="${esc(m.id)}" data-day="${esc(d)}" ${locked ? 'disabled' : ''} />
        </td>`;
      }).join('');
      /* Sans taux horaire, Kiwi ne calcule rien : « 0 MAD » pour une semaine
         travaillée se lisait comme un salaire nul. */
      const rated = (+m.hourlyRate || 0) > 0;
      const pay = rated ? hourlyPayFor(m, total, period.days) : 0;
      grandHours += total;
      grandPay += pay;
      if (rated) anyRated = true;
      const tone = m.avatarTone || 'a';
      return `
        <tr>
          <td class="kt-h-member">
            <span class="eq-av sm" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <div>
              <div class="n">${esc(memberFullName(m))}</div>
              <div class="r">${esc(jobName(m.function))}</div>
            </div>
          </td>
          ${cells}
          <td class="kt-h-total mono"><b>${fmtHours(total)}</b></td>
          <td class="kt-h-pay mono">${rated ? `<b>${(window.KiwiNumber?.format(pay, { maximumFractionDigits: 0 }) ?? pay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span>` : `<b title="${esc(T.noRate)}">·</b>`}</td>
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
            <button class="btn-slim ${locked ? '' : 'primary'}" type="button" data-action="${locked ? 'kt-unlock-period' : 'kt-validate-period'}">
              ${locked ? svgIcon(IC.unlock, 13) : svgIcon(IC.check, 13)}<span>${esc(locked ? T.hUnlock : T.hValidate)}</span>
            </button>
          </div>
        </div>
        ${periodNavigatorHtml(T, period)}

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
                <td class="kt-h-foot-tot mono"><b>${fmtHours(grandHours)}</b></td>
                <td class="kt-h-foot-tot mono">${anyRated ? `<b>${(window.KiwiNumber?.format(grandPay, { maximumFractionDigits: 0 }) ?? grandPay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span>` : `<b title="${esc(T.noRate)}">·</b>`}</td>
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

  function planningContext() {
    const root = window.__kiwiTeamV2;
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type:'restaurant' };
    const key = teamKey(venue);
    const members = getMembers(key);
    const period = buildPeriod(root.periodKind || 'week');
    const planning = root.planningByVenue[key] || (root.planningByVenue[key] = window.KiwiPlanningCore?.blank?.() || {});
    const shifts = root.shiftsByVenue[key] || (root.shiftsByVenue[key] = {});
    return { root, venue, key, members, period, planning, shifts };
  }
  function planningHoursKey(ctx) {
    const venue=ctx&&ctx.venue||{};
    if(venue.id==='scoped'&&venue.slug)return venue.slug;
    return venue.id||venue.slug||(ctx&&ctx.key)||'';
  }
  function planningDayMeta(day, ctx) {
    const KH=window.KiwiHours,calendar=window.KiwiMoroccoCalendar,lang=trLang(),key=planningHoursKey(ctx);
    const configured=!!(KH?.isConfigured?.(key));
    const resolved=configured&&KH?.periodsOn?.(day,key);
    const periods=Array.isArray(resolved)?resolved:(resolved?.periods||[]);
    const exception=(resolved&&!Array.isArray(resolved)&&resolved.exception)||KH?.exceptionOn?.(day,key)||null;
    const holiday=calendar?.info?.(day,lang)||null;
    return { day, configured, periods, exception, holiday, closed:configured&&!periods.length };
  }
  function planningPeriodMeta(days, ctx) {
    return Object.fromEntries((days||[]).map((day)=>[day,planningDayMeta(day,ctx)]));
  }
  function planningHolidaysByDay(days) {
    const calendar=window.KiwiMoroccoCalendar,lang=trLang();
    return Object.fromEntries((days||[]).map((day)=>[day,calendar?.info?.(day,lang)?.label||'']).filter((entry)=>entry[1]));
  }
  function compactPeriods(periods) {
    const short=(value)=>String(value||'').replace(':00','h').replace(':30','h30');
    return (periods||[]).map((period)=>`${short(period.from)}–${short(period.to)}`).join(' / ');
  }

  handlers['kt-plan-template-save'] = () => {
    const copy = planningCopy();
    const mdl = modal({
      title: copy.templateTitle,
      width: 440,
      body: `<div class="kt-plan-modal-field"><label for="kt-template-name">${esc(copy.templateName)}</label><input id="kt-template-name" data-kt-template-name maxlength="80" value="${esc(copy.templateTitle)}" /></div>`,
      foot: `<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-template-confirm">${esc(copy.saveNow)}</button>`
    });
    mdl.el.addEventListener('click', (event) => { if (event.target.closest('[data-dismiss]')) mdl.close(); });
    window.__kiwiPlanningModal = mdl;
    setTimeout(() => mdl.el.querySelector('[data-kt-template-name]')?.select(), 20);
  };
  handlers['kt-plan-template-confirm'] = () => {
    const mdl = window.__kiwiPlanningModal;
    if (!mdl?.el) return;
    const name = mdl.el.querySelector('[data-kt-template-name]')?.value.trim();
    if (!name) return;
    const ctx = planningContext();
    const template = window.KiwiPlanningCore.templateFromWeek(name, ctx.members, ctx.shifts, visibleDays());
    ctx.planning.templates.push(template);
    saveCustomTeams();
    mdl.close(); window.__kiwiPlanningModal = null;
    render(); toast(planningCopy().templateDone, { type:'success' });
  };
  handlers['kt-plan-template-apply'] = (el) => {
    const host = el.closest('.eq-section');
    const id = host?.querySelector('[data-kt-template-select]')?.value;
    if (!id) return;
    const ctx = planningContext();
    const template = (ctx.planning.templates || []).find((item) => item.id === id);
    if (!template) return;
    ctx.root.shiftsByVenue[ctx.key] = window.KiwiPlanningCore.applyTemplate(template, visibleDays(), ctx.shifts, ctx.members);
    saveCustomTeams(); render(); toast(planningCopy().applyDone, { type:'success' });
  };
  handlers['kt-plan-publish'] = () => {
    const ctx = planningContext();
    const KH=window.KiwiHours,hoursKey=planningHoursKey(ctx),configured=!!KH?.isConfigured?.(hoursKey);
    const periodsByDay=configured?Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];})):null;
    const holidaysByDay=planningHolidaysByDay(ctx.period.days);
    const result = window.KiwiPlanningCore.publish(ctx.planning, ctx.shifts, ctx.period.days, ctx.members, undefined, { periodsByDay, holidaysByDay });
    if (!result.ok) {
      toast(planningCopy().publishBlocked, { type:'error' });
      render();
      return;
    }
    ctx.root.planningByVenue[ctx.key] = result.planning;
    saveCustomTeams(); render(); toast(planningCopy().publishDone, { type:'success' });
  };
  handlers['kt-plan-optimize'] = () => {
    const ctx=planningContext(),P=window.KiwiPlanningCore,copy=Object.assign({},planningCopy(),optimizationCopy());if(!P?.optimize)return;
    const KH=window.KiwiHours,hoursKey=planningHoursKey(ctx),configured=!!KH?.isConfigured?.(hoursKey),periodsByDay=configured?Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];})):null;
    const holidaysByDay=planningHolidaysByDay(ctx.period.days);
    const result=P.optimize({planning:ctx.planning,shifts:ctx.shifts,days:ctx.period.days,members:ctx.members,periodsByDay,holidaysByDay});
    if(!result.assignments.length){toast(result.unresolved.length?copy.optimizeBlocked:copy.optimizeNothing,{type:result.unresolved.length?'error':'info'});return;}
    const mdl=modal({title:copy.optimizeTitle,width:620,body:`<div class="kt-opt-summary"><strong>${esc(copy.optimizeCount(result.assignments.length))}</strong><p>${esc(copy.optimizeReview)}</p></div>${result.assignments.slice(0,30).map((row)=>{const member=ctx.members.find((m)=>String(m.id)===String(row.memberId));return `<div class="kt-opt-row"><b>${esc(member?memberFullName(member):row.memberId)}</b><span>${esc(row.day)} · ${esc(row.start)}–${esc(row.end)}</span></div>`;}).join('')}${result.unresolved.length?`<div class="kt-plan-issue is-blocker"><b>!</b><span>${esc(copy.optimizeUnresolved(result.unresolved.length))}</span></div>`:''}`,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-optimize-confirm">${esc(copy.optimizeApply)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningOptimize={mdl,result,key:ctx.key};
  };
  handlers['kt-plan-optimize-confirm'] = () => {const p=window.__kiwiPlanningOptimize;if(!p?.mdl?.el)return;window.__kiwiTeamV2.shiftsByVenue[p.key]=p.result.shifts;saveCustomTeams();p.mdl.close();window.__kiwiPlanningOptimize=null;render();toast(optimizationCopy().optimizeDone,{type:'success'});};

  function fairScheduleCopy() {
    const lang=trLang();
    if(lang==='en')return{action:'Auto-schedule fairly',title:'Fair auto-schedule',intro:'Kiwi uses this venue’s opening hours, approved leave and each person’s availability. It balances hours and prepares a draft only.',people:'People needed each day',peopleHint:'Unique team members scheduled across the day.',shifts:'Shifts per day',shiftsHint:'The opening day is divided into consecutive shifts.',hours:'Opening hours',hoursReady:'The venue’s saved opening hours will be used.',hoursMissing:'Opening hours must be configured before Kiwi can build a truthful schedule.',configure:'Configure opening hours',reviewTitle:'Review the proposal',review:(a,d)=>`${a} assignments across ${d} open day${d===1?'':'s'}`,balance:(a,b)=>`Hours per person: ${a}–${b} h`,reviewNote:'Applying replaces the current draft for this period. It does not publish the schedule.',build:'Create proposal',apply:'Replace draft',done:'The fair proposal is now in the draft.',invalid:'People per day must be at least the number of shifts.',shortage:(n)=>`${n} staffing gap${n===1?'':'s'} could not be filled safely.`,closed:(n)=>`${n} closed day${n===1?' was':'s were'} skipped.`,tools:'Planning tools',toolsHint:'Coverage rules, open shifts, templates and period maintenance.',coverageGroup:'Demand rules',coverageDesc:'Describe role-specific minimum coverage, then build from those rules.',openGroup:'Staff opportunities',openDesc:'Share an unassigned shift for employees to claim.',templateGroup:'Reusable weeks',templateDesc:'Save or apply a reviewed weekly pattern.',maintenance:'Period maintenance',maintenanceDesc:'Clear the draft or transfer it into recorded hours.',fromRules:'Build from rules'};
    if(lang==='ar')return{action:'توزيع عادل تلقائياً',title:'توزيع عادل للورديات',intro:'يعتمد Kiwi على ساعات فتح المؤسسة والإجازات المقبولة وتوفر كل موظف، ثم يوازن الساعات ويُنشئ مسودة فقط.',people:'عدد الأشخاص المطلوب يومياً',peopleHint:'أعضاء مختلفون موزعون على اليوم.',shifts:'عدد الورديات يومياً',shiftsHint:'يتم تقسيم فترة الفتح إلى ورديات متتالية.',hours:'ساعات الفتح',hoursReady:'سيتم استعمال ساعات فتح المؤسسة المسجلة.',hoursMissing:'يجب ضبط ساعات الفتح قبل إنشاء جدول واقعي.',configure:'ضبط ساعات الفتح',reviewTitle:'مراجعة الاقتراح',review:(a,d)=>`${a} تعيينات خلال ${d} أيام مفتوحة`,balance:(a,b)=>`ساعات كل شخص: ${a}–${b}`,reviewNote:'سيستبدل التطبيق مسودة هذه الفترة فقط، ولن ينشر الجدول.',build:'إنشاء الاقتراح',apply:'استبدال المسودة',done:'تمت إضافة الاقتراح العادل إلى المسودة.',invalid:'يجب ألا يقل عدد الأشخاص عن عدد الورديات.',shortage:(n)=>`تعذر ملء ${n} مناصب بأمان.`,closed:(n)=>`تم تجاوز ${n} أيام مغلقة.`,tools:'أدوات التخطيط',toolsHint:'قواعد التغطية والورديات الشاغرة والنماذج وصيانة الفترة.',coverageGroup:'قواعد الحاجة',coverageDesc:'حدد الحد الأدنى حسب الوظيفة، ثم أنشئ الجدول وفقاً للقواعد.',openGroup:'فرص الفريق',openDesc:'انشر وردية غير معينة ليطلبها الموظفون.',templateGroup:'أسابيع قابلة لإعادة الاستخدام',templateDesc:'احفظ أو طبق أسبوعاً نموذجياً تمت مراجعته.',maintenance:'صيانة الفترة',maintenanceDesc:'امسح المسودة أو انقلها إلى الساعات المنجزة.',fromRules:'إنشاء من القواعد'};
    return{action:'Répartir équitablement',title:'Répartition automatique',intro:'Kiwi lit les horaires d’ouverture, les congés approuvés et les disponibilités. Il équilibre les heures et prépare uniquement un brouillon.',people:'Personnes nécessaires par jour',peopleHint:'Des membres différents, répartis sur la journée.',shifts:'Nombre de shifts par jour',shiftsHint:'La journée d’ouverture est découpée en services successifs.',hours:'Horaires d’ouverture',hoursReady:'Les horaires enregistrés de l’établissement seront utilisés.',hoursMissing:'Renseignez les horaires d’ouverture pour que Kiwi construise un planning réel.',configure:'Configurer les horaires',reviewTitle:'Vérifier la proposition',review:(a,d)=>`${a} affectation${a===1?'':'s'} sur ${d} jour${d===1?'':'s'} ouvert${d===1?'':'s'}`,balance:(a,b)=>`Heures par personne : ${a}–${b} h`,reviewNote:'Appliquer remplace le brouillon de cette période. Le planning ne sera pas publié.',build:'Créer la proposition',apply:'Remplacer le brouillon',done:'La proposition équitable est dans le brouillon.',invalid:'Le nombre de personnes doit être au moins égal au nombre de shifts.',shortage:(n)=>`${n} besoin${n===1?'':'s'} n’ont pas pu être couvert${n===1?'':'s'} sans conflit.`,closed:(n)=>`${n} jour${n===1?' fermé a':'s fermés ont'} été ignoré${n===1?'':'s'}.`,tools:'Outils de planning',toolsHint:'Couverture détaillée, services ouverts, modèles et entretien de la période.',coverageGroup:'Besoins précis',coverageDesc:'Définissez un minimum par fonction et horaire, puis composez depuis ces règles.',openGroup:'Opportunités équipe',openDesc:'Partagez un service non attribué auquel les employés peuvent candidater.',templateGroup:'Semaines réutilisables',templateDesc:'Enregistrez ou appliquez une semaine type déjà vérifiée.',maintenance:'Entretien de la période',maintenanceDesc:'Effacez le brouillon ou validez-le comme heures réalisées.',fromRules:'Composer depuis les règles'};
  }

  handlers['kt-plan-fair'] = () => {
    const ctx=planningContext(),copy=fairScheduleCopy(),KH=window.KiwiHours;
    const hoursKey=planningHoursKey(ctx),configured=!!(KH&&KH.isConfigured&&KH.isConfigured(hoursKey));
    const suggested=Math.max(1,Math.min(ctx.members.length,Math.ceil(ctx.members.length/2)||1));
    const suggestedShifts=Math.max(1,Math.min(2,suggested));
    const body=`<p class="kt-fair-intro">${esc(copy.intro)}</p><div class="kt-fair-fields"><div class="kt-plan-modal-field"><label for="kt-fair-people">${esc(copy.people)}</label><input id="kt-fair-people" data-kt-fair-people type="number" inputmode="numeric" min="1" max="${ctx.members.length||1}" value="${suggested}"><small>${esc(copy.peopleHint)}</small></div><div class="kt-plan-modal-field"><label for="kt-fair-shifts">${esc(copy.shifts)}</label><input id="kt-fair-shifts" data-kt-fair-shifts type="number" inputmode="numeric" min="1" max="6" value="${suggestedShifts}"><small>${esc(copy.shiftsHint)}</small></div></div><div class="kt-fair-hours ${configured?'is-ready':'is-missing'}"><strong>${esc(copy.hours)}</strong><span>${esc(configured?copy.hoursReady:copy.hoursMissing)}</span>${configured?'':`<button class="kb ghost" type="button" data-action="kt-plan-hours">${esc(copy.configure)}</button>`}</div>`;
    const mdl=modal({title:copy.title,width:600,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-fair-build"${configured?'':' disabled'}>${esc(copy.build)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningFair={mdl,key:ctx.key,hoursKey};
  };
  handlers['kt-plan-hours'] = () => {
    const pending=window.__kiwiPlanningFair,ctx=planningContext();
    pending?.mdl?.close?.();window.__kiwiPlanningFair=null;
    if(window.KiwiHoursUI?.open)window.KiwiHoursUI.open({venueId:planningHoursKey(ctx),title:ctx.venue?.name||'',onSave:()=>setTimeout(()=>pending?handlers['kt-plan-fair']():render(),100)});
  };
  handlers['kt-plan-fair-build'] = () => {
    const pending=window.__kiwiPlanningFair,ctx=planningContext(),P=window.KiwiPlanningCore,KH=window.KiwiHours,copy=fairScheduleCopy();if(!pending?.mdl?.el||!P?.fairSchedule||!KH)return;
    const people=Math.max(1,Math.floor(Number(pending.mdl.el.querySelector('[data-kt-fair-people]')?.value)||1));
    const shiftCount=Math.max(1,Math.floor(Number(pending.mdl.el.querySelector('[data-kt-fair-shifts]')?.value)||1));
    if(people<shiftCount){toast(copy.invalid,{type:'error'});return;}
    const hoursKey=pending.hoursKey||planningHoursKey(ctx),periodsByDay=Object.fromEntries(ctx.period.days.map((day)=>{const resolved=KH.periodsOn(day,hoursKey);return[day,Array.isArray(resolved)?resolved:(resolved?.periods||[])];}));
    const result=P.fairSchedule({planning:ctx.planning,shifts:ctx.shifts,days:ctx.period.days,members:ctx.members,dailyPeople:people,shiftsPerDay:shiftCount,periodsByDay,holidaysByDay:planningHolidaysByDay(ctx.period.days),seed:`${ctx.key}|${ctx.period.start}`});
    const hours=result.hoursByMember.map((row)=>row.hours);const low=hours.length?Math.min(...hours):0,high=hours.length?Math.max(...hours):0;
    const openDays=ctx.period.days.length-result.closedDays.length;
    const issues=[];if(result.unresolved.length)issues.push(`<div class="kt-plan-issue is-blocker"><b>!</b><span>${esc(copy.shortage(result.unresolved.length))}</span></div>`);if(result.closedDays.length)issues.push(`<div class="kt-plan-issue is-warning"><b>i</b><span>${esc(copy.closed(result.closedDays.length))}</span></div>`);
    const rows=result.hoursByMember.filter((row)=>row.hours>0).map((row)=>{const member=ctx.members.find((item)=>String(item.id)===row.memberId);return `<div class="kt-fair-review-row"><b>${esc(member?memberFullName(member):row.memberId)}</b><span>${(window.KiwiNumber?.format(row.hours, {maximumFractionDigits:1}) ?? row.hours.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1}))} h</span></div>`;}).join('');
    pending.mdl.close();
    const mdl=modal({title:copy.reviewTitle,width:620,body:`<div class="kt-opt-summary"><strong>${esc(copy.review(result.assignments.length,openDays))}</strong><p>${esc(copy.balance((window.KiwiNumber?.format(low, {maximumFractionDigits:1}) ?? low.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1})),(window.KiwiNumber?.format(high, {maximumFractionDigits:1}) ?? high.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {maximumFractionDigits:1}))))}</p><p>${esc(copy.reviewNote)}</p></div><div class="kt-fair-review">${rows}</div>${issues.join('')}`,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-fair-confirm"${result.assignments.length?'':' disabled'}>${esc(copy.apply)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningFair={mdl,key:ctx.key,result};
  };
  handlers['kt-plan-fair-confirm'] = () => {const pending=window.__kiwiPlanningFair;if(!pending?.mdl?.el||!pending.result)return;window.__kiwiTeamV2.shiftsByVenue[pending.key]=pending.result.shifts;saveCustomTeams();pending.mdl.close();window.__kiwiPlanningFair=null;render();toast(fairScheduleCopy().done,{type:'success'});};

  function planningRoleOptions(ctx, selected) {
    const copy = planningCopy();
    const roles = Array.from(new Set(ctx.members.map((member)=>String(member.function || member.department || '').trim()).filter(Boolean))).sort();
    return `<option value="">${esc(copy.allRoles)}</option>${roles.map((role)=>`<option value="${esc(role)}"${role===selected?' selected':''}>${esc(jobName(role))}</option>`).join('')}`;
  }
  function planningDaysInput(selected) {
    const labels=trLang()==='ar'?['ح','ن','ث','ر','خ','ج','س']:trLang()==='en'?['S','M','T','W','T','F','S']:['D','L','M','M','J','V','S'];
    const values=new Set((selected||[1,2,3,4,5]).map(Number));
    return `<div class="kt-plan-weekdays">${labels.map((label,day)=>`<label><input type="checkbox" value="${day}" data-kt-coverage-day${values.has(day)?' checked':''}><span>${esc(label)}</span></label>`).join('')}</div>`;
  }
  handlers['kt-plan-coverage'] = () => {
    const ctx=planningContext(), copy=planningCopy(), rules=(ctx.planning.coverageRules||[]).filter((rule)=>rule&&rule.active!==false);
    const rulesHtml=rules.length?`<div class="kt-coverage-list">${rules.map((rule)=>`<div class="kt-coverage-rule"><div><strong>${esc(rule.label||rule.role||copy.coverage)}</strong><span>${esc(rule.start)}–${esc(rule.end)} · ${esc(rule.role||copy.allRoles)} · ${esc(copy.minimum)} ${Number(rule.minimum)||1}</span></div><button class="kb ghost" data-action="kt-plan-coverage-delete" data-rule-id="${esc(rule.id)}">${esc(copy.delete)}</button></div>`).join('')}</div>`:'';
    const body=`${rulesHtml}<div class="kt-plan-form-grid"><div class="kt-plan-modal-field wide"><label>${esc(copy.label)}</label><input data-kt-coverage-label maxlength="80" placeholder="${esc(copy.labelHint)}"></div><div class="kt-plan-modal-field"><label>${esc(copy.role)}</label><select data-kt-coverage-role>${planningRoleOptions(ctx,'')}</select></div><div class="kt-plan-modal-field"><label>${esc(copy.minimum)}</label><input data-kt-coverage-min type="number" min="1" max="99" value="1"></div><div class="kt-plan-modal-field"><label>${esc(copy.start)}</label><input data-kt-coverage-start type="time" value="11:30"></div><div class="kt-plan-modal-field"><label>${esc(copy.end)}</label><input data-kt-coverage-end type="time" value="14:30"></div><div class="kt-plan-modal-field wide"><label>${esc(copy.weekdays)}</label>${planningDaysInput()}</div></div>`;
    const mdl=modal({title:copy.coverage,width:680,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-coverage-save">${esc(copy.addRule)}</button>`});
    mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningCoverage=mdl;
  };
  handlers['kt-plan-coverage-save'] = () => {
    const mdl=window.__kiwiPlanningCoverage, ctx=planningContext(), copy=planningCopy(); if(!mdl?.el)return;
    const start=mdl.el.querySelector('[data-kt-coverage-start]')?.value,end=mdl.el.querySelector('[data-kt-coverage-end]')?.value;
    const weekdays=Array.from(mdl.el.querySelectorAll('[data-kt-coverage-day]:checked')).map((input)=>Number(input.value));
    if(!start||!end||start===end||!weekdays.length){toast(copy.decisionFailed,{type:'error'});return;}
    const now=new Date().toISOString();
    ctx.planning.coverageRules.push({id:`cov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,label:mdl.el.querySelector('[data-kt-coverage-label]')?.value.trim().slice(0,80)||`${start}–${end}`,role:mdl.el.querySelector('[data-kt-coverage-role]')?.value||'',minimum:Math.max(1,Math.min(99,Number(mdl.el.querySelector('[data-kt-coverage-min]')?.value)||1)),start,end,weekdays,active:true,createdAt:now,updatedAt:now});
    saveCustomTeams();mdl.close();window.__kiwiPlanningCoverage=null;render();toast(copy.ruleSaved,{type:'success'});
  };
  handlers['kt-plan-coverage-delete'] = (el) => {
    const ctx=planningContext(),rule=(ctx.planning.coverageRules||[]).find((item)=>item.id===el.dataset.ruleId);if(!rule)return;
    rule.active=false;rule.updatedAt=new Date().toISOString();saveCustomTeams();window.__kiwiPlanningCoverage?.close?.();window.__kiwiPlanningCoverage=null;render();
  };
  handlers['kt-plan-open'] = () => {
    const ctx=planningContext(),copy=planningCopy(),day=visibleDays()[0]||toISO(new Date());
    const today=toISO(new Date());
    const body=`<div class="kt-plan-form-grid"><div class="kt-plan-modal-field"><label>${esc(copy.date)}</label><input data-kt-open-day type="date" min="${esc(today)}" value="${esc(day<today?today:day)}"></div><div class="kt-plan-modal-field"><label>${esc(copy.role)}</label><select data-kt-open-role>${planningRoleOptions(ctx,'')}</select></div><div class="kt-plan-modal-field"><label>${esc(copy.start)}</label><input data-kt-open-start type="time" value="09:00"></div><div class="kt-plan-modal-field"><label>${esc(copy.end)}</label><input data-kt-open-end type="time" value="17:00"></div><div class="kt-plan-modal-field wide"><label>${esc(copy.label)}</label><input data-kt-open-note maxlength="160"></div></div>`;
    const mdl=modal({title:copy.openShift,width:620,body,foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button><button class="kb atlas" data-action="kt-plan-open-save">${esc(copy.openShift)}</button>`});mdl.el.addEventListener('click',(event)=>{if(event.target.closest('[data-dismiss]'))mdl.close();});window.__kiwiPlanningOpen=mdl;
  };
  handlers['kt-plan-open-save'] = () => {
    const mdl=window.__kiwiPlanningOpen,ctx=planningContext(),P=window.KiwiPlanningCore,copy=planningCopy();if(!mdl?.el||!P)return;
    const result=P.createOpenShift(ctx.planning,{day:mdl.el.querySelector('[data-kt-open-day]')?.value,start:mdl.el.querySelector('[data-kt-open-start]')?.value,end:mdl.el.querySelector('[data-kt-open-end]')?.value,role:mdl.el.querySelector('[data-kt-open-role]')?.value||'',note:mdl.el.querySelector('[data-kt-open-note]')?.value||''});if(!result.ok){toast(copy.decisionFailed,{type:'error'});return;}
    ctx.root.planningByVenue[ctx.key]=result.planning;saveCustomTeams();mdl.close();window.__kiwiPlanningOpen=null;render();toast(copy.openSaved,{type:'success'});
  };

  handlers['kt-plan-requests'] = () => {
    const copy = planningCopy();
    const ctx = planningContext();
    const pending = (ctx.planning.requests || []).filter((request) => request.status === 'pending');
    const openClaims=(ctx.planning.openShifts||[]).filter((shift)=>shift.status==='claimed');
    const swapClaims=(ctx.planning.swapRequests||[]).filter((request)=>request.status==='claimed');
    const byId = new Map(ctx.members.map((member) => [member.id, member]));
    const standard=pending.map((request) => {
      const member = byId.get(request.memberId);
      const range = request.type === 'leave' ? `${request.startDate} → ${request.endDate}` : `${(request.weekdays || []).join(', ')} · ${request.start || '·'} → ${request.end || '·'}`;
      return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(member ? memberFullName(member) : request.memberId)}</strong><div>${esc(request.type === 'leave' ? copy.leave : copy.availability)} · ${esc(range)}</div></div></div>${request.reason ? `<p>${esc(request.reason)}</p>` : ''}<div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="request" data-rid="${esc(request.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="request" data-rid="${esc(request.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;
    });
    const opportunities=openClaims.map((shift)=>{const member=byId.get(shift.claimantId);return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(copy.openClaim)} · ${esc(member?memberFullName(member):shift.claimantId)}</strong><div>${esc(shift.day)} · ${esc(shift.start)}–${esc(shift.end)} · ${esc(shift.role||copy.allRoles)}</div></div></div><div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="open" data-rid="${esc(shift.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="open" data-rid="${esc(shift.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;})
      .concat(swapClaims.map((request)=>{const owner=byId.get(request.memberId),claimant=byId.get(request.claimantId);return `<article class="kt-plan-request"><div class="kt-plan-request-head"><div><strong>${esc(copy.swap)} · ${esc(owner?memberFullName(owner):request.memberId)} ↔ ${esc(claimant?memberFullName(claimant):request.claimantId)}</strong><div>${esc(request.day)} ↔ ${esc(request.offeredDay)}</div></div></div><div class="kt-plan-request-actions"><button class="kb atlas" data-action="kt-plan-request-decision" data-kind="swap" data-rid="${esc(request.id)}" data-decision="approved">${esc(copy.approve)}</button><button class="kb ghost" data-action="kt-plan-request-decision" data-kind="swap" data-rid="${esc(request.id)}" data-decision="rejected">${esc(copy.reject)}</button></div></article>`;}));
    const all=standard.concat(opportunities);
    const body = all.length ? `<div class="kt-plan-request-list">${all.join('')}</div>` : `<p>${esc(copy.empty)}</p>`;
    const mdl = modal({ title:copy.review, width:620, body, foot:`<button class="kb ghost" data-dismiss>${esc(t().cancel)}</button>` });
    mdl.el.addEventListener('click', (event) => { if (event.target.closest('[data-dismiss]')) mdl.close(); });
    window.__kiwiPlanningRequests = mdl;
  };
  handlers['kt-plan-request-decision'] = (el) => {
    const ctx = planningContext();
    const kind=el.dataset.kind||'request';
    if(kind==='open'||kind==='swap'){
      const result=kind==='open'?window.KiwiPlanningCore.decideOpenShift(ctx.planning,ctx.shifts,el.dataset.rid,el.dataset.decision,ctx.members):window.KiwiPlanningCore.decideSwap(ctx.planning,ctx.shifts,el.dataset.rid,el.dataset.decision,ctx.members);
      if(!result.ok){toast(planningCopy().decisionFailed,{type:'error'});return;}
      ctx.root.planningByVenue[ctx.key]=result.planning;ctx.root.shiftsByVenue[ctx.key]=result.shifts;saveCustomTeams();window.__kiwiPlanningRequests?.close?.();window.__kiwiPlanningRequests=null;render();toast(el.dataset.decision==='approved'?planningCopy().approved:planningCopy().rejected,{type:'success'});return;
    }
    const request = (ctx.planning.requests || []).find((item) => item.id === el.dataset.rid);
    if (!request || request.status !== 'pending') return;
    request.status = el.dataset.decision === 'approved' ? 'approved' : 'rejected';
    request.updatedAt = new Date().toISOString();
    if (request.status === 'approved' && request.type === 'availability') {
      const current = ctx.planning.availability[request.memberId] || { weekdays:{} };
      (request.weekdays || []).forEach((weekday) => { current.weekdays[String(weekday)] = { available:request.available !== false, start:request.start || '', end:request.end || '' }; });
      current.updatedAt = request.updatedAt;
      ctx.planning.availability[request.memberId] = current;
    }
    saveCustomTeams();
    window.__kiwiPlanningRequests?.close?.(); window.__kiwiPlanningRequests = null;
    render(); toast(request.status === 'approved' ? planningCopy().approved : planningCopy().rejected, { type:'success' });
  };

  handlers['kt-plan-week'] = (_el, dir) => {
    closeShiftPop();
    const chunks = weekChunks(buildPeriod(window.__kiwiTeamV2.periodKind || 'week').days);
    const next = planWeekIdx + (dir === 'next' ? 1 : -1);
    if (next < 0 || next >= chunks.length) return;
    planWeekIdx = next;
    render();
  };

  handlers['kt-period-nav'] = (_el, dir) => {
    closeShiftPop();
    const root = window.__kiwiTeamV2;
    const kind = root.periodKind || 'week';
    if (!Object.prototype.hasOwnProperty.call(periodOffsets, kind)) return;
    if (dir === 'current') periodOffsets[kind] = 0;
    else periodOffsets[kind] += dir === 'next' ? 1 : -1;
    const period = buildPeriod(kind);
    restorePeriodLock(root, kind, period);
    planWeekIdx = periodOffsets[kind] === 0 ? weekIdxForToday(period.days) : 0;
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
  /* La case du tableau ET la ligne du jour (téléphone) portent la même clé
   * data-kt-cell : les deux se repeignent ensemble, quel que soit l'écran. */
  function paintShiftCell(mid, day) {
    const host = planHost();
    if (!host) return;
    const want = `${mid}|${day}`;
    const T = t();
    const shifts = getShifts(currentVenueKey());
    const cur = (shifts[mid] || {})[day];
    const s = normShift(cur);
    host.querySelectorAll('[data-kt-cell]').forEach((el) => {
      if (el.getAttribute('data-kt-cell') !== want) return;
      if (el.tagName !== 'TD') {
        const row = el.querySelector('.kt-pd-row');
        if (!row) return;
        row.classList.toggle('on', !!(s && !s.off));
        row.classList.toggle('off', !!(s && s.off));
        const when = row.querySelector('.kt-pd-when');
        if (when) when.innerHTML = planDayRowInner(T, cur);
        return;
      }
      el.classList.toggle('on', !!(s && !s.off));
      el.classList.toggle('off', !!(s && s.off));
      const btn = el.querySelector('.kt-sh');
      if (!btn) return;
      btn.innerHTML = shiftCellInner(T, cur, false);
      const title = shiftCellTitle(T, cur, day);
      if (title) btn.setAttribute('title', title); else btn.removeAttribute('title');
    });
    const sum = Array.prototype.find.call(host.querySelectorAll('[data-kt-dsum]'), (el) => el.getAttribute('data-kt-dsum') === day);
    if (sum) {
      const mids = Array.prototype.map.call(sum.closest('.kt-pd-panel').querySelectorAll('[data-kt-cell]'), (el) => el.getAttribute('data-kt-cell').split('|')[0]);
      sum.textContent = planDaySummary(mids.map((id) => (shifts[id] || {})[day]));
    }
  }
  /* Changer de jour ne reconstruit rien : on bascule les pastilles et les
   * panneaux déjà rendus, la lentille suit la classe .on. */
  function selectPlanDay(iso) {
    const host = planHost();
    if (!host) return false;
    const pills = host.querySelectorAll('.kt-pd-pill');
    if (!Array.prototype.some.call(pills, (b) => b.getAttribute('data-arg') === iso)) return false;
    planDayISO = iso;
    pills.forEach((b) => {
      const on = b.getAttribute('data-arg') === iso;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    host.querySelectorAll('[data-kt-dpanel]').forEach((p) => { p.hidden = p.getAttribute('data-kt-dpanel') !== iso; });
    return true;
  }
  handlers['kt-plan-day'] = (_el, iso) => {
    if (!pageActive) return;
    closeShiftPop();
    selectPlanDay(iso);
  };
  /* Un glissement horizontal sur la liste passe au jour voisin (inversé en
   * arabe, où la semaine se lit de droite à gauche). Rien n'est empêché : le
   * défilement vertical de la page reste celui du navigateur. */
  let planDayTouch = null;
  document.addEventListener('touchstart', (e) => {
    const zone = e.target && e.target.closest && e.target.closest('.dash-equipe .kt-pd-panels');
    planDayTouch = zone && e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!planDayTouch || !pageActive) { planDayTouch = null; return; }
    const start = planDayTouch;
    planDayTouch = null;
    const p = e.changedTouches && e.changedTouches[0];
    if (!p) return;
    const dx = p.clientX - start.x, dy = p.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const host = planHost();
    if (!host) return;
    const days = Array.prototype.map.call(host.querySelectorAll('.kt-pd-pill'), (b) => b.getAttribute('data-arg'));
    const rtl = (document.documentElement.getAttribute('dir') || '').toLowerCase() === 'rtl';
    const next = days[days.indexOf(planDayISO) + ((dx < 0) !== rtl ? 1 : -1)];
    if (!next) return;
    closeShiftPop();
    selectPlanDay(next);
  }, { passive: true });
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
    /* La saisie est finie : on rattrape le rafraîchissement mis de côté par
     * applyLiveTeam(). Le drapeau est remis à zéro avant render(), qui rappelle
     * closeShiftPop() — sans quoi les deux se relanceraient l'un l'autre. */
    if (liveTeamPendingRender) applyLiveTeam();
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
    /* On a touch screen focusing the field opens the iOS time wheel before the
       sheet has even appeared; let the person tap the field they mean. */
    try { if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) $start.focus(); } catch (_) {}
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
      const cost = hourlyPayFor(m, h, period.days);
      grandH += h; grandC += cost;
      const tr = rows[idx];
      if (!tr) return;
      const tb = tr.querySelector('.kt-h-total b');
      if (tb) tb.textContent = fmtHours(h);
      const pb = tr.querySelector('.kt-h-pay b');
      if (pb && (+m.hourlyRate || 0) > 0) pb.textContent = (window.KiwiNumber?.format(cost, { maximumFractionDigits: 0 }) ?? cost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
    });
    const foot = root.querySelectorAll('tfoot .kt-h-foot-tot b');
    if (foot[0]) foot[0].textContent = fmtHours(grandH);
    if (foot[1] && members.some((m) => (+m.hourlyRate || 0) > 0)) foot[1].textContent = (window.KiwiNumber?.format(grandC, { maximumFractionDigits: 0 }) ?? grandC.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
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
    const val = Math.max(0, Math.min(24, parseFloat(String(t2.value).replace(',', '.')) || 0));
    t2.dataset.hoursValue = String(val);
    hours[mid][day] = val;
    updateHourTotals();
    saveCustomTeams();          // an hour typed is payroll data — persist it
  });

  document.addEventListener('focusin', (e) => {
    const input = e.target;
    if (!input.matches || !input.matches('[data-kt-hour]')) return;
    input.value = String(Number(input.dataset.hoursValue) || 0);
    input.select();
  });

  document.addEventListener('focusout', (e) => {
    const input = e.target;
    if (!input.matches || !input.matches('[data-kt-hour]')) return;
    input.value = fmtHours(input.dataset.hoursValue);
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
    /* Les jours de la PÉRIODE affichée, pas toutes les heures jamais saisies :
       taper 8 h un mardi faisait sauter le total de la ligne à la somme de
       toutes les semaines passées. */
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    let grandH = 0, grandP = 0;
    members.forEach((m, idx) => {
      const row = hours[m.id] || {};
      const tot = period.days.reduce((a, d) => a + (+row[d] || 0), 0);
      const pay = hourlyPayFor(m, tot, period.days);
      grandH += tot; grandP += pay;
      const tr = root.querySelectorAll('table.kt-h-table tbody tr')[idx];
      if (tr) {
        const totalCell = tr.querySelector('.kt-h-total b');
        const payCell   = tr.querySelector('.kt-h-pay b');
        if (totalCell) totalCell.textContent = fmtHours(tot);
        if (payCell && (+m.hourlyRate || 0) > 0) payCell.textContent = (window.KiwiNumber?.format(pay, { maximumFractionDigits: 0 }) ?? pay.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));
      }
    });
    const footTot = root.querySelectorAll('table.kt-h-table tfoot .kt-h-foot-tot b');
    if (footTot[0]) footTot[0].textContent = fmtHours(grandH);
    if (footTot[1] && members.some((m) => (+m.hourlyRate || 0) > 0)) footTot[1].textContent = (window.KiwiNumber?.format(grandP, { maximumFractionDigits: 0 }) ?? grandP.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }));

    // On Paie & planning the band above the grid is the headline the owner reads
    // ("à payer · période"). Keep it in step with the cell they just typed in,
    // rather than making them leave the page and come back to see the new total.
    if (pageMode === 'payroll') {
      const pt = payTiles(t(), payrollFigures(members, vt, period), period, members.length);
      const vals = root.querySelectorAll('.eq-stats .eq-stat-v');
      const subs = root.querySelectorAll('.eq-stats .eq-stat-sub');
      pt.forEach((x, i) => { if (vals[i]) vals[i].textContent = x.v; if (subs[i]) subs[i].textContent = x.sub; });
    }
  }

  /* ═══════════════ ADD / EDIT MEMBER MODAL (UNCHANGED) ═══════════════ */
  /* ═══════════════ MEMBER EDITOR (2026-10-12) ═══════════════
   * The form behind « Ajouter un membre » / « Modifier ». It was one long
   * column of grey fields whose placeholders read like a filled-in record
   * (« Sara », « Belkadi », « BK 384721 », « Allergie crustacés… »), with a
   * new member pre-set as « Chef de cuisine · Cuisine » speaking French and
   * Arabic, nobody having said so. Language and contract names showed in
   * French under EN and AR, and a missing field only raised a toast.
   * Now: the recipe sheet's layout (sections on the left; who, and the code
   * that opens the till, on the right), placeholders that are formats and not
   * people, nothing chosen on anyone's behalf, a contract picker on the
   * liquid lens, and errors written under the field they concern. */
  const LANG_KEY = { 'Français': 'langFr', 'Arabe': 'langAr', 'Anglais': 'langEn', 'Espagnol': 'langEs', 'Tamazight': 'langTz', 'Darija': 'langDr' };
  const CONTRACT_KEY = { CDI: 'ctCdi', CDD: 'ctCdd', Stage: 'ctStage', Freelance: 'ctFreelance', 'Intérim': 'ctInterim' };
  const langLabel = (T, l) => (LANG_KEY[l] && T[LANG_KEY[l]]) || l;
  const contractLabel = (T, c) => (CONTRACT_KEY[c] && T[CONTRACT_KEY[c]]) || c;
  const rolePreview = (T, fn, dept) => [jobName(fn), jobName(dept, 'dept')].filter(Boolean).join(' · ') || T.edRoleUnset;
  function edInput(type, name, val, ph, extra) {
    return `<input class="kt-ed-in" type="${type}" name="${name}" value="${esc(val == null ? '' : val)}"${ph ? ` placeholder="${esc(ph)}"` : ''} ${extra || ''} />`;
  }
  function edField(T, name, label, control, o) {
    o = o || {};
    return `<label class="kt-ed-f${o.wide ? ' kt-ed-wide' : ''}" data-f="${name}">
      <span class="kt-ed-l">${esc(label)}${o.req ? `<span class="kt-ed-tag">${esc(T.edReq)}</span>` : ''}</span>
      ${control}
      ${o.hint ? `<span class="kt-ed-hint">${esc(o.hint)}</span>` : ''}
      <span class="kt-ed-err" data-err-for="${name}" hidden></span>
    </label>`;
  }
  /* Writes (or clears, msg = '') the error under one field. */
  function edError(root, name, msg) {
    const input = root.querySelector(`[name="${name}"]`);
    const err = root.querySelector(`[data-err-for="${name}"]`);
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      const wrap = input.closest('.kiwi-select');
      if (wrap) wrap.classList.toggle('is-invalid', !!msg);
    }
    if (err) { err.textContent = msg || ''; err.hidden = !msg; }
  }
  function edPreview(root) {
    const T = t();
    const form = root.querySelector('[data-kt-form]'); if (!form) return;
    const v = (n) => { const el = form.querySelector(`[name="${n}"]`); return el ? String(el.value || '').trim() : ''; };
    /* initials() answers « ? » for a blank name: the person icon says it better. */
    const ini = (v('firstName') || v('lastName')) ? initials(v('firstName'), v('lastName')) : '';
    const av = root.querySelector('[data-kt-avdisp]');
    if (av) {
      const s = av.querySelector('[data-kt-av-ini]');
      if (s) s.textContent = ini;
      av.classList.toggle('has-ini', !!ini);
    }
    const n = root.querySelector('[data-kt-name-prev]');
    if (n) n.textContent = [v('firstName'), v('lastName')].filter(Boolean).join(' ') || T.addTitle;
    const r = root.querySelector('[data-kt-role-prev]');
    if (r) r.textContent = rolePreview(T, v('function'), v('department'));
  }

  /* Read-only member sheet. Shares the editor's opaque sheet (.kt-ed-modal)
     and its card, field and button vocabulary. */
  const PROFILE_CSS = `
    .kt-pv { display: grid; gap: 14px; color: var(--ink); }
    .kt-pv-head { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 16px; align-items: center; padding: 18px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--kt-card); }
    .kt-pv-av { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 18px; color: var(--paper); font: 600 22px var(--mono); }
    .kt-pv-id { min-width: 0; }
    .kt-pv-name { font: 600 19px var(--sans); letter-spacing: -0.015em; color: var(--ink); overflow-wrap: anywhere; }
    .kt-pv-role { margin-top: 2px; font-size: 13px; color: var(--n-500); }
    .kt-pv-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .kt-pv-tags:empty { display: none; }
    .kt-pv-tag { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border: 1px solid var(--n-200); border-radius: 999px; background: var(--kt-field); font: 500 12px var(--sans); color: var(--n-700); }
    .kt-pv-tag.is-ct { color: var(--atlas); border-color: color-mix(in srgb, var(--atlas) 30%, transparent); background: color-mix(in srgb, var(--atlas) 8%, var(--kt-field)); font-weight: 600; }
    .kt-pv-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: stretch; }
    .kt-pv-sec { min-width: 0; padding: 16px 18px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--kt-card); }
    .kt-pv-sec.is-wide { grid-column: 1 / -1; }
    .kt-pv-sec > h4 { margin: 0 0 12px; font: 600 14px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
    .kt-pv-sec dl { display: grid; gap: 12px; margin: 0; }
    .kt-pv-sec dl.kt-pv-cols { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 16px; }
    .kt-pv-sec dl > div { display: grid; gap: 3px; min-width: 0; }
    .kt-pv-sec dt { font-size: 11.5px; font-weight: 600; color: var(--n-500); }
    .kt-pv-sec dd { margin: 0; font-size: 13.5px; line-height: 1.4; color: var(--ink); overflow-wrap: anywhere; }
    .kt-pv-none { color: var(--n-400, var(--n-500)); }
    .kt-pv-num { font-variant-numeric: tabular-nums; }
    .kt-pv-num i { font-style: normal; font-size: 12px; color: var(--n-500); }
    .kt-pv-code-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .kt-pv-code-row b { font: 600 24px var(--mono); letter-spacing: 0.32em; font-variant-numeric: tabular-nums; color: var(--ink); }
    .kt-pv-code-row .kt-ed-btn { flex: none; min-width: 112px; }
    .kt-pv-code-row .kt-ed-btn[aria-pressed="true"] { border-color: var(--atlas); color: var(--atlas); }
    .kt-pv-hint { margin: 0; font-size: 12px; line-height: 1.45; color: var(--n-500); }
    .kt-pv-notes { margin: 0; font-size: 13.5px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
    @media (max-width: 640px) {
      .kt-pv-grid, .kt-pv-sec dl.kt-pv-cols { grid-template-columns: 1fr; }
      .kt-pv-head { grid-template-columns: 52px minmax(0, 1fr); gap: 12px; padding: 14px; }
      .kt-pv-av { width: 52px; height: 52px; border-radius: 15px; font-size: 18px; }
      .kt-pv-sec { padding: 14px; }
    }
  `;
  const EDITOR_CSS = `
    .kiwi-backdrop.kt-ed-modal .kiwi-modal.kiwi-modal { --kt-bg: var(--paper); --kt-card: color-mix(in srgb, var(--paper) 55%, #fff); --kt-field: var(--paper); background: var(--kt-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border: 1px solid var(--n-200); }
    html[data-theme="dark"] .kiwi-backdrop.kt-ed-modal .kiwi-modal.kiwi-modal,
    body[data-vexel-mode="dark"] .kiwi-backdrop.kt-ed-modal .kiwi-modal.kiwi-modal { --kt-bg: #0F1512; --kt-card: #151C18; --kt-field: #0B100E; }
    .kiwi-backdrop.kt-ed-modal .kiwi-modal-foot.kiwi-modal-foot { background: var(--kt-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border-top: 1px solid var(--n-200); }
    .kt-ed { display: grid; grid-template-columns: minmax(0, 1fr) 264px; gap: 20px; align-items: start; color: var(--ink); }
    .kt-ed-main { display: grid; gap: 14px; min-width: 0; }
    .kt-ed-sec { min-width: 0; padding: 16px 18px 4px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--kt-card); }
    .kt-ed-sec > h4 { margin: 0 0 12px; font: 600 14.5px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
    .kt-ed-sec > p { max-width: 58ch; margin: -6px 0 12px; font-size: 12px; line-height: 1.45; color: var(--n-500); }
    .kt-ed-sec > .kt-ed-f, .kt-ed-sec > .kt-ed-langs { margin-bottom: 14px; }
    .kt-ed-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; align-items: start; }
    .kt-ed-wide { grid-column: 1 / -1; }
    /* .kt-ed scope: MODAL_CSS sets « [data-kt-form] label { display: block } », which ran the hint and the error into one line. */
    .kt-ed .kt-ed-f { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-content: start; min-width: 0; margin: 0 0 12px; }
    .kt-ed-l { display: flex; align-items: baseline; gap: 6px; font-size: 12px; font-weight: 600; color: var(--n-600); }
    .kt-ed-tag { font-size: 11px; font-weight: 500; color: var(--n-400, var(--n-500)); }
    .kt-ed-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--kt-field); color: var(--ink); font: 500 13.5px var(--sans); transition: border-color 140ms, box-shadow 140ms; }
    .kt-ed-in::placeholder { color: var(--n-400, var(--n-500)); font-weight: 400; }
    textarea.kt-ed-in { height: auto; min-height: 84px; padding: 10px 12px; line-height: 1.5; resize: vertical; }
    .kt-ed-in:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }
    .kiwi-backdrop.kt-ed-modal .kt-ed .kiwi-select.is-invalid .kiwi-select-trigger,
    .kt-ed-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger, #cb5238) 14%, transparent); }
    .kt-ed-hint { font-size: 11.5px; line-height: 1.4; color: var(--n-500); }
    .kt-ed-err { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: var(--danger, #cb5238); }
    .kt-ed-err[hidden], .kt-ed [data-kt-end-wrap][hidden] { display: none; }
    .kt-ed-suffix { position: relative; display: block; }
    .kt-ed-suffix .kt-ed-in { padding-inline-end: 92px; font-variant-numeric: tabular-nums; }
    .kt-ed-suffix i { position: absolute; inset-inline-end: 12px; top: 50%; transform: translateY(-50%); font: 500 12px var(--sans); font-style: normal; color: var(--n-500); pointer-events: none; }
    .kiwi-backdrop.kt-ed-modal .kt-ed .kiwi-select-trigger { min-height: 40px; padding: 0 10px 0 12px; padding-inline: 12px 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--kt-field); box-shadow: none; font: 500 13.5px var(--sans); }
    .kt-ed-seg { position: relative; display: flex; gap: 2px; width: max-content; max-width: 100%; padding: 3px; overflow-x: auto; border-radius: 12px; background: color-mix(in srgb, var(--ink) 6%, var(--kt-field)); scrollbar-width: none; }
    .kt-ed-segi { position: relative; flex: none; cursor: pointer; }
    .kt-ed-segi input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .kt-ed-segi span { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border-radius: 9px; font: 500 13px var(--sans); color: var(--n-600); white-space: nowrap; transition: color 160ms; }
    .kt-ed-segi.on span { color: var(--ink); font-weight: 600; }
    .kt-ed-seg:not([data-kw-lens]) .kt-ed-segi.on span { background: var(--surface); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
    .kt-ed-segi input:focus-visible + span { box-shadow: 0 0 0 2px var(--atlas); }
    .kt-ed-langs { display: flex; flex-wrap: wrap; gap: 6px; }
    .kt-ed-chip { height: 34px; padding: 0 14px; border: 1px solid var(--n-200); border-radius: 999px; background: var(--kt-field); color: var(--n-700); font: 500 13px var(--sans); cursor: pointer; transition: background-color 140ms, border-color 140ms, color 140ms; }
    .kt-ed-chip:hover { border-color: var(--atlas); color: var(--atlas); }
    .kt-ed-chip.on { background: var(--atlas); border-color: var(--atlas); color: var(--paper); }
    .kt-ed-chip:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .kt-ed-side { position: sticky; top: 0; display: grid; gap: 14px; min-width: 0; }
    .kt-ed-card { padding: 18px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--kt-card); }
    .kt-ed-who { display: grid; justify-items: center; gap: 4px; text-align: center; }
    .kt-ed-av { width: 84px; height: 84px; margin-bottom: 8px; display: grid; place-items: center; border-radius: 22px; color: var(--paper); font: 600 28px var(--mono); }
    .kt-ed-av [data-kt-av-ini] { display: none; }
    .kt-ed-av.has-ini [data-kt-av-ini] { display: block; }
    .kt-ed-av.has-ini > i, .kt-ed-av.has-ini > svg { display: none; }
    .kt-ed-who-n { max-width: 100%; font: 600 16px var(--sans); letter-spacing: -0.01em; color: var(--ink); overflow-wrap: anywhere; }
    .kt-ed-who-r { font-size: 12.5px; color: var(--n-500); }
    .kt-ed-code .kt-ed-f { margin-bottom: 10px; }
    .kt-ed-pin { height: 52px; text-align: center; font: 600 24px var(--mono); letter-spacing: 0.4em; padding-inline-start: calc(12px + 0.4em); font-variant-numeric: tabular-nums; }
    .kt-ed-pin::placeholder { font: 400 13px var(--sans); letter-spacing: 0; }
    .kt-ed-code-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
    .kt-ed-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--kt-field); color: var(--n-700); font: 500 12.5px var(--sans); cursor: pointer; transition: border-color 140ms, color 140ms, background-color 140ms; }
    .kt-ed-btn:hover { border-color: var(--atlas); color: var(--atlas); }
    .kt-ed-btn:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .kt-ed-code .kt-ed-hint { margin: 0; }
    @media (max-width: 860px) {
      .kt-ed { grid-template-columns: 1fr; }
      .kt-ed-side { position: static; order: -1; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .kt-ed-who { grid-template-columns: auto 1fr; justify-items: start; align-items: center; text-align: start; column-gap: 12px; }
      .kt-ed-av { grid-row: span 2; width: 56px; height: 56px; margin: 0; border-radius: 16px; font-size: 19px; }
    }
    @media (max-width: 560px) {
      .kt-ed-grid, .kt-ed-side { grid-template-columns: 1fr; }
      .kt-ed-in, .kiwi-backdrop.kt-ed-modal .kt-ed .kiwi-select-trigger { font-size: 16px; }
      .kt-ed-sec { padding: 14px 14px 2px; }
    }
  `;

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
      /* Nothing chosen on their behalf: a member saved without touching the
         role was filed as the catalogue's first post (« Chef de cuisine »). */
      function: '',
      department: '',
      contract: '',
      startDate: toISO(new Date()),
      endDate: '',
      /* Empty, not 4 500 / 50: a member saved without touching these fields
         was booked at an invented salary, and Masse salariale summed it. */
      baseSalary: '',
      hourlyRate: '',
      languages: [],
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
    // La valeur reste la clé française ; seul le texte de l'option se lit.
    const optsWithCurrent = (listed, current, kind) => {
      const all = (current && listed.indexOf(current) < 0) ? [current].concat(listed) : listed;
      return all.map((v) => `<option value="${esc(v)}"${current === v ? ' selected' : ''}>${esc(jobName(v, kind))}</option>`).join('');
    };
    const fnOpts   = optsWithCurrent(cat.functions, m.function);
    const deptOpts = optsWithCurrent(cat.departments, m.department, 'dept');
    const ctList = (m.contract && CONTRACT_TYPES.indexOf(m.contract) < 0) ? [m.contract].concat(CONTRACT_TYPES) : CONTRACT_TYPES;
    const ctSeg = ctList.map((c) => `<label class="kt-ed-segi${c === m.contract ? ' on' : ''}"><input type="radio" name="contract" value="${esc(c)}"${c === m.contract ? ' checked' : ''} /><span>${esc(contractLabel(T, c))}</span></label>`).join('');
    const langChips = LANGS.map(l => {
      const on = (m.languages || []).includes(l);
      return `<button type="button" class="kt-ed-chip${on ? ' on' : ''}" data-action="kt-lang-toggle" data-arg="${esc(l)}" aria-pressed="${on}">${esc(langLabel(T, l))}</button>`;
    }).join('');

    const mdl = modal({
      title: editing ? T.editTitle : T.addTitle,
      width: 960,
      body: `
        <style>${MODAL_CSS}${EDITOR_CSS}</style>
        <form class="kt-ed" data-kt-form data-mid="${esc(m.id)}" data-editing="${editing ? '1' : '0'}" novalidate>
          <div class="kt-ed-main">
            <section class="kt-ed-sec">
              <h4>${esc(T.secIdentity)}</h4>
              <div class="kt-ed-grid">
                ${edField(T, 'firstName', T.firstName, edInput('text', 'firstName', m.firstName, '', 'required autocomplete="given-name"'), { req: true })}
                ${edField(T, 'lastName', T.lastName, edInput('text', 'lastName', m.lastName, '', 'required autocomplete="family-name"'), { req: true })}
                ${edField(T, 'cin', T.cin, edInput('text', 'cin', m.cin, T.ph.cin, 'autocomplete="off"'), { opt: true })}
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secContact)}</h4>
              <div class="kt-ed-grid">
                ${edField(T, 'email', T.email, edInput('email', 'email', m.email, T.ph.email, 'required autocomplete="email" inputmode="email"'), { req: true, hint: T.edEmailHint })}
                ${edField(T, 'phone', T.phone, edInput('tel', 'phone', m.phone, T.ph.phone, 'autocomplete="tel"'), { opt: true })}
                ${edField(T, 'address', T.address, edInput('text', 'address', m.address, T.ph.address, 'autocomplete="street-address"'), { opt: true, wide: true })}
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secRole)}</h4>
              <div class="kt-ed-grid">
                ${edField(T, 'function', T.function, `<select class="kt-ed-in" name="function" required data-kt-function data-depts="${esc(JSON.stringify(cat.departments))}">${editing ? '' : `<option value=""${m.function ? '' : ' selected'}>${esc(T.edChooseFn)}</option>`}${fnOpts}</select>`, { req: true })}
                ${edField(T, 'department', T.department, `<select class="kt-ed-in" name="department">${editing ? '' : `<option value=""${m.department ? '' : ' selected'}>${esc(T.edChooseDept)}</option>`}${deptOpts}</select>`)}
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secContract)}</h4>
              <div class="kt-ed-grid">
                <div class="kt-ed-f kt-ed-wide">
                  <span class="kt-ed-l" id="kt-ed-ct-l">${esc(T.contractType)}</span>
                  <div class="kt-ed-seg" role="radiogroup" aria-labelledby="kt-ed-ct-l" data-kt-contract-group>${ctSeg}</div>
                </div>
                ${edField(T, 'startDate', T.startDate, edInput('date', 'startDate', m.startDate, '', ''))}
                <div data-kt-end-wrap${isCddOrStage(m.contract) ? '' : ' hidden'}>${edField(T, 'endDate', T.endDate, edInput('date', 'endDate', m.endDate, '', ''))}</div>
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secComp)}</h4>
              <p>${esc(T.edCompHint)}</p>
              <div class="kt-ed-grid">
                ${edField(T, 'baseSalary', T.edSalary, `<span class="kt-ed-suffix">${edInput('number', 'baseSalary', m.baseSalary, '', 'min="0" step="50" inputmode="decimal"')}<i>${esc(T.edPerMonth)}</i></span>`)}
                ${edField(T, 'hourlyRate', T.edHourly, `<span class="kt-ed-suffix">${edInput('number', 'hourlyRate', m.hourlyRate, '', 'min="0" step="0.5" inputmode="decimal"')}<i>${esc(T.edPerHour)}</i></span>`)}
                ${edField(T, 'contractHours', T.edContractHours, `<span class="kt-ed-suffix">${edInput('number', 'contractHours', (+m.contractHours || 0) > 0 ? m.contractHours : '', '44', 'min="0" max="80" step="0.5" inputmode="decimal"')}<i>${esc(T.edPerWeek)}</i></span>`)}
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.languages)}</h4>
              <div class="kt-ed-langs" data-kt-langs>${langChips}</div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secEmergency)}</h4>
              <div class="kt-ed-grid">
                ${edField(T, 'emergencyName', T.emergencyName, edInput('text', 'emergencyName', m.emergencyName, T.ph.emergencyName, 'autocomplete="off"'), { opt: true })}
                ${edField(T, 'emergencyPhone', T.emergencyPhone, edInput('tel', 'emergencyPhone', m.emergencyPhone, T.ph.phone, 'autocomplete="off"'), { opt: true })}
              </div>
            </section>

            <section class="kt-ed-sec">
              <h4>${esc(T.secNotes)}</h4>
              <label class="kt-ed-f"><textarea class="kt-ed-in" name="notes" rows="3" placeholder="${esc(T.ph.notes)}">${esc(m.notes)}</textarea></label>
            </section>
          </div>

          <aside class="kt-ed-side">
            <div class="kt-ed-card kt-ed-who">
              <div class="kt-ed-av${(m.firstName || m.lastName) ? ' has-ini' : ''}" data-kt-avdisp style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">
                <span data-kt-av-ini>${esc((m.firstName || m.lastName) ? initials(m.firstName, m.lastName) : '')}</span>${svgIcon('user', 34)}
              </div>
              <div class="kt-ed-who-n" data-kt-name-prev>${esc([m.firstName, m.lastName].map(x => String(x || '').trim()).filter(Boolean).join(' ') || T.addTitle)}</div>
              <div class="kt-ed-who-r" data-kt-role-prev>${esc(rolePreview(T, m.function, m.department))}</div>
            </div>
            <div class="kt-ed-card kt-ed-code">
              <label class="kt-ed-f" data-f="password">
                <span class="kt-ed-l">${esc(T.edCodeT)}</span>
                <input class="kt-ed-in kt-ed-pin" type="text" name="password" value="${esc(isCode(m.password) ? m.password : '')}" data-kt-pwd
                  inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" spellcheck="false"
                  placeholder="${esc(isCode(m.password) ? '' : (editing ? T.codeKeep : '0000'))}" />
                <span class="kt-ed-err" data-err-for="password" hidden></span>
              </label>
              <div class="kt-ed-code-acts">
                <button type="button" class="kt-ed-btn" data-action="kt-pwd-gen">${svgIcon(IC.refresh, 16)}<span>${esc(T.generate)}</span></button>
                <button type="button" class="kt-ed-btn" data-action="kt-pwd-copy">${svgIcon(IC.copy, 16)}<span>${esc(T.copy)}</span></button>
              </div>
              <p class="kt-ed-hint">${esc(T.edCodeHint)}</p>
            </div>
          </aside>
        </form>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button class="kb atlas" data-action="kt-submit-member">${svgIcon(IC.check, 13)}${esc(editing ? T.submitEdit : T.submitAdd)}</button>
      `,
    });
    mdl.el.classList.add('kt-ed-modal');
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
  handlers['kt-employee-app'] = () => {
    let slug = '';
    try { slug = teamSlug() || window.KiwiConfig?.storeSlug?.() || ''; } catch (_) {}
    if (!slug) { toast('Enregistrez d\'abord cet établissement', { type: 'pend' }); return; }
    /* In the app location.origin is capacitor://localhost, which no browser
       can open: show the public link employees actually use. */
    const origin = (window.KiwiApiBase && window.KiwiApiBase.native && window.KiwiApiBase.base) || location.origin;
    const url = `${origin}/kiwi-serveur.html?merchant=${encodeURIComponent(slug)}`;
    window.open(url, '_blank', 'noopener');
  };
  handlers['kt-edit-member'] = (_el, id) => {
    if (window.__kiwiTeamProfileDrawer) {
      try { window.__kiwiTeamProfileDrawer.close(); } catch (_) {}
      window.__kiwiTeamProfileDrawer = null;
    }
    openMemberModal(id);
  };

  /* No photo button: every avatar in Kiwi (roster, planning, the till) is the
   * coloured initials. The old button answered « Mocké » to a real merchant. */
  handlers['kt-pwd-gen'] = () => {
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const input = mdl.el.querySelector('[data-kt-pwd]');
    if (input) input.value = makeCode();
    edError(mdl.el, 'password', '');
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
    if (el) { el.classList.toggle('on', idx === -1); el.setAttribute('aria-pressed', String(idx === -1)); }
  };

  /* Reactive end-date, contract segment, live preview, cleared errors */
  document.addEventListener('change', (e) => {
    const mdl = window.__kiwiTeamModal;
    if (!mdl || !mdl.el || !mdl.el.contains(e.target)) return;
    if (e.target.matches('[data-kt-function]')) {
      let depts = [];
      try { depts = JSON.parse(e.target.getAttribute('data-depts') || '[]'); } catch (_) {}
      const dept = deptForFunction(e.target.value, depts);
      const sel = mdl.el.querySelector('[data-kt-form] [name="department"]');
      /* Le <select> est habillé par kiwi-select.js, qui ne relit sa valeur
         que sur un « change » : sans lui, la liste disait « Salle » et le
         bouton affiché « Cuisine ». */
      if (dept && sel && sel.value !== dept && [].some.call(sel.options, (o) => o.value === dept)) {
        sel.value = dept;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    if (e.target.name === 'contract') {
      mdl.el.querySelectorAll('.kt-ed-segi').forEach((l) => {
        const r = l.querySelector('input');
        l.classList.toggle('on', !!(r && r.checked));
      });
      const wrap = mdl.el.querySelector('[data-kt-end-wrap]');
      if (wrap) {
        if (e.target.value === 'CDD' || e.target.value === 'Stage') wrap.removeAttribute('hidden');
        else { wrap.setAttribute('hidden', ''); edError(mdl.el, 'endDate', ''); }
      }
    }
    if (e.target.name && e.target.getAttribute('aria-invalid') === 'true') edError(mdl.el, e.target.name, '');
    edPreview(mdl.el);
  });
  document.addEventListener('input', (e) => {
    const mdl = window.__kiwiTeamModal;
    if (!mdl || !mdl.el || !mdl.el.contains(e.target)) return;
    if (e.target.name && e.target.getAttribute('aria-invalid') === 'true') edError(mdl.el, e.target.name, '');
    if (e.target.name === 'firstName' || e.target.name === 'lastName') edPreview(mdl.el);
  });

  handlers['kt-submit-member'] = () => {
    const T = t();
    const mdl = window.__kiwiTeamModal; if (!mdl || !mdl.el) return;
    const st = mdl.el.__ktState; if (!st) return;
    const form = mdl.el.querySelector('[data-kt-form]'); if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const root = mdl.el;

    /* Every problem is written under its own field, all at once, and the
       first one gets the focus · a toast alone named a field nobody could
       see at the bottom of a long form. */
    const errs = [];
    ['firstName', 'lastName', 'email', 'function'].forEach((n) => {
      if (!String(data[n] || '').trim()) errs.push([n, T.edErrRequired]);
    });
    const email = String(data.email || '').trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.push(['email', T.vInvalidEmail]);
    if ((data.contract === 'CDD' || data.contract === 'Stage') && data.endDate && data.startDate && data.endDate < data.startDate) {
      errs.push(['endDate', T.vEndAfterStart]);
    }
    // The till's pad is four digits — accepting anything else here hands the
    // owner a code their cashier physically cannot enter.
    const code = (data.password || '').trim();
    if (code && !isCode(code)) errs.push(['password', T.vCode]);

    const venueType = st.venueType;
    const members = getMembers(venueType);
    const prev = st.editing ? members.find((x) => x.id === st.memberId) : null;
    const emailKey = email.toLocaleLowerCase('en');
    if (emailKey && members.some((x) => x.id !== st.memberId && String(x.email || '').trim().toLocaleLowerCase('en') === emailKey)) {
      errs.push(['email', T.vDuplicateEmail]);
    }
    const effectiveCode = code || (prev && (prev.pinCode || prev.password)) || '';
    if (effectiveCode && members.some((x) => x.id !== st.memberId && String(x.pinCode || x.password || '').trim() === effectiveCode)) {
      errs.push(['password', T.vDuplicateCode]);
    }
    ['firstName', 'lastName', 'email', 'function', 'endDate', 'password'].forEach((n) => edError(root, n, ''));
    if (errs.length) {
      const seen = {};
      errs.forEach(([n, msg]) => { if (!seen[n]) { seen[n] = 1; edError(root, n, msg); } });
      const first = root.querySelector('[aria-invalid="true"]');
      const target = first && ((first.closest('.kiwi-select') && first.closest('.kiwi-select').querySelector('.kiwi-select-trigger')) || first);
      try { target.scrollIntoView({ block: 'center', behavior: 'smooth' }); target.focus({ preventScroll: true }); } catch (_) {}
      Kiwi.toast(T.edCheck, { type: 'pend' });
      return;
    }
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
      password: code || (prev && prev.password) || (prev && prev.hasCode ? '' : makeCode()),
      pinCode: code || (prev && prev.pinCode) || '',   // en phase avec la caisse
      /* Son code existe mais n'est pas revenu du serveur : on ne lui en invente
         pas un (corriger un numéro de téléphone changerait son code), et son
         drapeau reste, donc rien ne part tant qu'il n'est pas résolu. */
      ...((!code && prev && prev.hasCode && !memberCode(prev)) ? { hasCode: true } : {}),
      function: data.function,
      department: data.department || '',
      contract: data.contract || '',
      startDate: data.startDate || '',
      endDate: (data.contract === 'CDD' || data.contract === 'Stage') ? (data.endDate || '') : '',
      baseSalary: parseFloat(data.baseSalary) || 0,
      hourlyRate: parseFloat(data.hourlyRate) || 0,
      contractHours: Math.min(80, Math.max(0, parseFloat(data.contractHours) || 0)),
      languages: st.languages.slice(),
      address: (data.address || '').trim(),
      cin: (data.cin || '').trim(),
      emergencyName: (data.emergencyName || '').trim(),
      emergencyPhone: (data.emergencyPhone || '').trim(),
      notes: (data.notes || '').trim(),
      avatarTone: st.avatarTone || AVATAR_TONES[Math.floor(Math.random() * AVATAR_TONES.length)],
      venueType,
      venueSlug: teamSlug(),
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
      // Ni le code ni le mot de passe dans un toast : il reste à l'écran, souvent
      // celui du comptoir. Le code se lit et se copie sur la fiche du membre.
      Kiwi.toast(T.tAdded(memberFullName(member)), { type: 'success', desc: T.tAddedDesc(member.email) });
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

    /* The read-only sheet. It used to print « 0 MAD » for a salary nobody
       entered, ISO dates, « Serveur · » when no department was set, and the
       personal code in clear the moment it opened, for anyone standing at
       the counter. An empty field now says so, and the code stays masked
       until the owner asks to see it. */
    const notSet = `<span class="kt-pv-none">${esc(T.pvNotSet)}</span>`;
    const txt = (v) => (v == null || String(v).trim() === '') ? notSet : esc(String(v).trim());
    const day = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))
      ? esc(fromISO(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }))
      : notSet);
    const pay = (n, per) => ((+n || 0) > 0
      ? `<span class="kt-pv-num">${esc(window.KiwiNumber?.format((+n), {}) ?? (+n).toLocaleString(dateLocale(), {}))} MAD <i>${esc(per)}</i></span>`
      : notSet);
    const row = (label, html) => `<div><dt>${esc(label)}</dt><dd>${html}</dd></div>`;
    const code = isCode(m.password) ? String(m.password).trim() : (isCode(m.pinCode) ? String(m.pinCode).trim() : '');
    const isFixed = m.contract === 'CDD' || m.contract === 'Stage';
    const profileM = modal({
      title: T.pvTitle,
      width: 720,
      body: `
        <style>${MODAL_CSS}${EDITOR_CSS}${PROFILE_CSS}</style>
        <div class="kt-pv">
          <header class="kt-pv-head">
            <div class="kt-pv-av" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</div>
            <div class="kt-pv-id">
              <div class="kt-pv-name">${esc(memberFullName(m))}</div>
              <div class="kt-pv-role">${esc(rolePreview(T, m.function, m.department))}</div>
              <div class="kt-pv-tags">
                ${m.contract ? `<span class="kt-pv-tag is-ct">${esc(contractLabel(T, m.contract))}</span>` : ''}
                ${(m.languages || []).map(l => `<span class="kt-pv-tag">${esc(langLabel(T, l))}</span>`).join('')}
              </div>
            </div>
          </header>

          <div class="kt-pv-grid">
            <section class="kt-pv-sec">
              <h4>${esc(T.secContact)}</h4>
              <dl>
                ${row(T.email, txt(m.email))}
                ${row(T.phone, txt(m.phone))}
                ${row(T.address, txt(m.address))}
              </dl>
            </section>

            <section class="kt-pv-sec kt-pv-code">
              <h4>${esc(T.edCodeT)}</h4>
              ${(!code && m.hasCode) ? `<div class="kt-pv-code-row"><b>••••</b></div>
              <p class="kt-pv-hint">${esc(T.codeKeep)}</p>` : code ? `<div class="kt-pv-code-row">
                <b data-kt-pv-code aria-live="polite">••••</b>
                <button type="button" class="kt-ed-btn" data-kt-pv-reveal aria-pressed="false">${svgIcon('eye', 16)}<span>${esc(T.pvShow)}</span></button>
              </div>
              <p class="kt-pv-hint">${esc(T.pvCodeHint)}</p>` : `<p class="kt-pv-hint">${esc(T.pvNoCode)}</p>`}
            </section>

            <section class="kt-pv-sec">
              <h4>${esc(T.secContract)}</h4>
              <dl>
                ${row(T.contractType, m.contract ? esc(contractLabel(T, m.contract)) : notSet)}
                ${row(T.startDate, day(m.startDate))}
                ${isFixed ? row(T.endDate, day(m.endDate)) : ''}
              </dl>
            </section>

            <section class="kt-pv-sec">
              <h4>${esc(T.secComp)}</h4>
              <dl>
                ${row(T.edSalary, pay(m.baseSalary, T.edPerMonth))}
                ${row(T.edHourly, pay(m.hourlyRate, T.edPerHour))}
                ${(+m.baseSalary || 0) > 0 && (+m.hourlyRate || 0) > 0 ? row(T.edContractHours, `<span class="kt-pv-num">${esc(String(contractWeekHours(m)))} <i>${esc(T.edPerWeek)}</i></span>`) : ''}
              </dl>
            </section>

            <section class="kt-pv-sec is-wide">
              <h4>${esc(T.pvIdEmergency)}</h4>
              <dl class="kt-pv-cols">
                ${row(T.cin, txt(m.cin))}
                ${row(T.emergencyName, txt(m.emergencyName))}
                ${row(T.emergencyPhone, txt(m.emergencyPhone))}
              </dl>
            </section>

            ${m.notes ? `<section class="kt-pv-sec is-wide">
              <h4>${esc(T.secNotes)}</h4>
              <p class="kt-pv-notes">${esc(m.notes)}</p>
            </section>` : ''}
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-action="kt-delete-member" data-arg="${esc(m.id)}" style="color:var(--danger);">${svgIcon(IC.trash, 13)}${esc(T.deleteBtn)}</button>
        <button class="kb atlas" data-action="kt-edit-member" data-arg="${esc(m.id)}">${svgIcon(IC.edit, 13)}${esc(T.editBtn)}</button>
      `,
    });
    profileM.el.classList.add('kt-ed-modal');
    profileM.el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-kt-pv-reveal]');
      if (!btn || !code) return;
      const shown = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(shown));
      const out = profileM.el.querySelector('[data-kt-pv-code]');
      if (out) out.textContent = shown ? code : '••••';
      const lbl = btn.querySelector('span');
      if (lbl) lbl.textContent = shown ? T.pvHide : T.pvShow;
    });
    window.__kiwiTeamProfileDrawer = profileM;
  };

  function profileSection(title, rows, prehtml) {
    const inner = rows.map(([l, v]) => {
      const lbl = l ? `<div class="kt-pf-l">${esc(l)}</div>` : '';
      const val = prehtml ? `<div class="kt-pf-v">${v}</div>` : `<div class="kt-pf-v">${esc(v || '·')}</div>`;
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
    /* Retirer quelqu'un en plein service clôt son pointage (functions/api/store.js
       › closeRemovedShifts) : le gérant doit le savoir avant de confirmer. */
    const live = (liveTeam.members || []).find((x) => x && x.id === id);
    const since = live && live.status !== 'off-duty' && Number(live.since) ? new Date(Number(live.since)) : null;
    const onDuty = since
      ? `<p data-kt-del-onduty style="margin:10px 0 0; color:var(--ink); font-size:13px; line-height:1.55; font-weight:600;">${esc(T.delOnDuty(String(since.getHours()).padStart(2, '0') + ':' + String(since.getMinutes()).padStart(2, '0')))}</p>`
      : '';
    const confirmM = modal({
      title: T.delTitle,
      width: 460,
      body: `<p style="margin:0; color:var(--n-600); font-size:13px; line-height:1.55;">${esc(T.delDesc)}</p>${onDuty}
        <div style="margin-top:14px; padding:12px 14px; background:var(--paper-soft); border:1px solid var(--n-200); border-radius:10px; display:flex; gap:11px; align-items:center;">
          <span class="eq-av sm" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
          <div>
            <div style="font-weight:600;">${esc(memberFullName(m))}</div>
            <div style="font-size:11.5px; color:var(--n-500);">${esc(rolePreview(T, m.function, m.department))}</div>
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
    const root = window.__kiwiTeamV2;
    root.removedByVenue[venueType] = mergeRemoved(root.removedByVenue[venueType], [{ id, ts: Date.now() }]);
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
    const previousKind = root.periodKind || 'week';
    root.periodKind = kind;
    periodOffsets[kind] = 0;
    const targetPeriod = buildPeriod(kind);
    restorePeriodLock(root, kind, targetPeriod);
    planWeekIdx = weekIdxForToday(targetPeriod.days);   // nouvelle période ⇒ on retombe sur la semaine en cours
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
    if (!members.length) { Kiwi.toast('·', { type: 'info' }); return; }
    const today = toISO(new Date());
    const qe = modal({
      title: T.qeTitle,
      width: 460,
      body: `
        <style>${MODAL_CSS}</style>
        <div class="kt-qe-form">
          <label><span class="l">${esc(T.qeMember)}</span>
            <select name="member" data-kt-qe-member>${members.map(m => `<option value="${esc(m.id)}">${esc(memberFullName(m))} · ${esc(jobName(m.function))}</option>`).join('')}</select>
          </label>
          <div class="kt-fgrid-2">
            <label><span class="l">${esc(T.qeDate)}</span><input type="date" data-kt-qe-date value="${esc(today)}" /></label>
            <label><span class="l">${esc(T.qeHours)}</span><input type="number" data-kt-qe-hours min="0" max="24" step="0.25" value="8" /></label>
          </div>
          <label><span class="l">${esc(T.qeNote)}</span><input type="text" data-kt-qe-note placeholder="·" /></label>
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
    if (!mid || !date) { Kiwi.toast('·', { type: 'pend' }); return; }
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
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
    const key = teamKey(venue), members = getMembers(key), hours = getHours(key);
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    const csv = (value) => {
      let safe = String(value == null ? '' : value);
      /* Excel, Numbers and LibreOffice may execute cells beginning with a
         formula sigil. Employee names/roles are merchant data, so keep them
         literal even when somebody is genuinely called "@samir". */
      if (/^[=+\-@]/.test(safe)) safe = "'" + safe;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [[
      'Période début', 'Période fin', 'ID membre', 'Employé', 'Fonction',
      'Date', 'Heures', 'Taux horaire MAD', 'Coût heures MAD', 'Salaire de base MAD',
    ]];
    let totalHours = 0;
    members.forEach((member) => {
      /* Un salarié avec un taux : ses heures du contrat sont dans le salaire,
         une heure isolée n'a donc pas de coût propre. La ligne « Total
         période » porte ce que le taux paie vraiment, au-delà du contrat. */
      const split = (+member.baseSalary || 0) > 0 && (+member.hourlyRate || 0) > 0;
      let own = 0;
      period.days.forEach((day) => {
        const value = Math.max(0, +(hours[member.id] || {})[day] || 0);
        totalHours += value;
        own += value;
        rows.push([
          period.start, period.end, member.id, memberFullName(member), member.function || '', day,
          value.toFixed(2), (+member.hourlyRate || 0).toFixed(2),
          split ? '' : (value * (+member.hourlyRate || 0)).toFixed(2), (+member.baseSalary || 0).toFixed(2),
        ]);
      });
      if (split) {
        rows.push([
          period.start, period.end, member.id, memberFullName(member), member.function || '',
          `Total période (contrat ${contractWeekHours(member)} h / semaine)`,
          own.toFixed(2), (+member.hourlyRate || 0).toFixed(2),
          hourlyPayFor(member, own, period.days).toFixed(2), (+member.baseSalary || 0).toFixed(2),
        ]);
      }
    });
    const content = '\uFEFF' + rows.map((row) => row.map(csv).join(';')).join('\r\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    const slug = String(venue.slug || venue.id || venue.type || 'kiwi').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const filename = `kiwi-paie-${slug}-${period.start}-${period.end}.csv`;
    anchor.href = url; anchor.download = filename; anchor.hidden = true;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    Kiwi.toast(T.tExport, { type: 'success', desc: T.tExportDesc });
    /* The file is created locally first. The command is only the durable audit
       hand-off; a provider failure can never eat the merchant's export. */
    window.KiwiOperations?.create?.('payroll', 'export-payroll', {
      format: 'csv', filename, periodStart: period.start, periodEnd: period.end,
      teamCount: members.length, rowCount: rows.length - 1, totalHours,
    }).catch(() => {});
  };
  /* ── CSV import: the export, read back ─────────────────────────────────────
   * The button used to answer « Glissez votre fichier · vérification
   * automatique des en-têtes » with no file picker behind it. It now reads the
   * file kt-export-csv writes (or a sheet with the same columns): one row per
   * employee × day, matched on « ID membre » first, then on the full name. The
   * merchant sees what will change before anything is written, and a validated
   * period refuses the import like it refuses a hand edit. */
  const IMPORT_COPY = {
    fr: {
      title: 'Importer des heures', locked: 'Période validée', lockedDesc: 'Rouvrez la période avant d’importer des heures.',
      bad: 'Fichier non reconnu', badDesc: 'Il faut les colonnes « Date » et « Heures », et « ID membre » ou « Employé ». Le fichier exporté par Kiwi convient.',
      empty: 'Aucune heure à importer', emptyDesc: 'Aucune ligne ne correspond à un membre de cette équipe.',
      summary: (n, m, d) => `${n} saisie${n > 1 ? 's' : ''} d’heures pour ${m} membre${m > 1 ? 's' : ''}, sur ${d} jour${d > 1 ? 's' : ''}.`,
      replace: 'Les heures déjà saisies pour ces jours sont remplacées par celles du fichier.',
      skipped: (n) => `${n} ligne${n > 1 ? 's' : ''} ignorée${n > 1 ? 's' : ''} : membre inconnu, date ou heures invalides.`,
      lockedDays: (n) => `${n} jour${n > 1 ? 's' : ''} dans une période validée, laissé${n > 1 ? 's' : ''} tel${n > 1 ? 's' : ''} quel${n > 1 ? 's' : ''}.`,
      cancel: 'Annuler', apply: 'Importer', done: (n) => `${n} saisie${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''}`, doneDesc: 'Heures enregistrées et synchronisées sur vos appareils.',
    },
    en: {
      title: 'Import hours', locked: 'Period validated', lockedDesc: 'Reopen the period before importing hours.',
      bad: 'File not recognised', badDesc: 'It needs « Date » and « Heures » columns, plus « ID membre » or « Employé ». The file Kiwi exports works.',
      empty: 'No hours to import', emptyDesc: 'No row matches a member of this team.',
      summary: (n, m, d) => `${n} hour entr${n > 1 ? 'ies' : 'y'} for ${m} member${m > 1 ? 's' : ''}, over ${d} day${d > 1 ? 's' : ''}.`,
      replace: 'Hours already entered for these days are replaced by the file’s.',
      skipped: (n) => `${n} row${n > 1 ? 's' : ''} skipped: unknown member, invalid date or hours.`,
      lockedDays: (n) => `${n} day${n > 1 ? 's' : ''} in a validated period, left as is.`,
      cancel: 'Cancel', apply: 'Import', done: (n) => `${n} entr${n > 1 ? 'ies' : 'y'} imported`, doneDesc: 'Hours saved and synced to your devices.',
    },
    ar: {
      title: 'استيراد الساعات', locked: 'الفترة مصادق عليها', lockedDesc: 'أعد فتح الفترة قبل استيراد الساعات.',
      bad: 'ملف غير معروف', badDesc: 'يلزم عمودا « Date » و« Heures »، مع « ID membre » أو « Employé ». الملف الذي يصدّره Kiwi مناسب.',
      empty: 'لا ساعات للاستيراد', emptyDesc: 'لا يطابق أي سطر عضوًا في هذا الفريق.',
      summary: (n, m, d) => `${n} إدخال ساعات لـ ${m} عضو، على ${d} يوم.`,
      replace: 'تُستبدل الساعات المدخلة لهذه الأيام بساعات الملف.',
      skipped: (n) => `${n} سطر متجاهل: عضو غير معروف أو تاريخ أو ساعات غير صالحة.`,
      lockedDays: (n) => `${n} يوم ضمن فترة مصادق عليها، بقي كما هو.`,
      cancel: 'إلغاء', apply: 'استيراد', done: (n) => `تم استيراد ${n} إدخال`, doneDesc: 'حُفظت الساعات وتمت مزامنتها على أجهزتك.',
    },
  };
  const importCopy = () => IMPORT_COPY[trLang()] || IMPORT_COPY.fr;
  /* RFC-4180-ish: quoted cells, doubled quotes, ; or , separators, CRLF. */
  function parseCsv(text) {
    const src = String(text || '').replace(/^﻿/, '');
    const firstLine = src.split(/\r?\n/, 1)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && src[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
      } else cell += c;
    }
    row.push(cell);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    /* The export prefixes formula-looking cells with ' : read them back literal. */
    return rows.map((r) => r.map((v) => v.trim().replace(/^'(?=[=+\-@])/, '')));
  }
  const normHead = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  function dayIsLocked(root, day) {
    const bucket = lockBucket(root);
    return Object.keys(bucket).some((key) => {
      if (!bucket[key].locked) return false;
      const [, start, end] = key.split(':');
      return day >= start && day <= end;
    });
  }
  function planHoursImport(text, members, root) {
    const rows = parseCsv(text);
    if (rows.length < 2) return null;
    const head = rows[0].map(normHead);
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const iId = col('idmembre', 'memberid', 'id'), iName = col('employe', 'employee', 'nom', 'name');
    const iDate = col('date', 'jour', 'day'), iHours = col('heures', 'hours');
    if (iDate < 0 || iHours < 0 || (iId < 0 && iName < 0)) return null;
    const byId = new Map(members.map((m) => [String(m.id), m]));
    const byName = new Map(members.map((m) => [memberFullName(m).toLowerCase().replace(/\s+/g, ' ').trim(), m]));
    const changes = []; let skipped = 0; const lockedDays = new Set();
    rows.slice(1).forEach((r) => {
      const m = (iId >= 0 && byId.get(r[iId])) || (iName >= 0 && byName.get(String(r[iName] || '').toLowerCase().replace(/\s+/g, ' ').trim()));
      let day = String(r[iDate] || '');
      const fr = day.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (fr) day = `${fr[3]}-${pad(fr[2])}-${pad(fr[1])}`;
      const rawHours = String(r[iHours] || '').trim();
      const hours = rawHours ? Number(rawHours.replace(',', '.')) : NaN;
      /* La forme ne suffit pas : « 2026-13-40 » passe l'expression et
       * deviendrait une journée fantôme dans le registre. On relit la date. */
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + 'T00:00:00Z') : null;
      const realDay = !!parsed && !isNaN(parsed) && parsed.toISOString().slice(0, 10) === day;
      if (!m || !realDay || !Number.isFinite(hours) || hours < 0 || hours > 24) { skipped++; return; }
      if (dayIsLocked(root, day)) { lockedDays.add(day); return; }
      changes.push({ id: m.id, day, hours: Math.round(hours * 100) / 100 });
    });
    return { changes, skipped, lockedDays: lockedDays.size };
  }
  let pendingImport = null;
  handlers['kt-import-csv'] = () => {
    const C = importCopy();
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) { Kiwi.toast(C.locked, { type: 'info', desc: C.lockedDesc }); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,text/csv'; input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return;
      file.text().then((text) => {
        const venue = window.KiwiVenue?.getCurrentVenueData?.() || { type: 'restaurant' };
        const key = teamKey(venue);
        const plan = planHoursImport(text, getMembers(key), root);
        if (!plan) { Kiwi.toast(C.bad, { type: 'warning', desc: C.badDesc }); return; }
        if (!plan.changes.length) { Kiwi.toast(C.empty, { type: 'info', desc: C.emptyDesc }); return; }
        const membersTouched = new Set(plan.changes.map((c) => c.id)).size;
        const daysTouched = new Set(plan.changes.map((c) => c.day)).size;
        pendingImport = { key, changes: plan.changes };
        modal({
          title: C.title, width: 480,
          body: `<div class="kt-opt-summary"><strong>${esc(C.summary(plan.changes.length, membersTouched, daysTouched))}</strong><p>${esc(C.replace)}</p>
            ${plan.skipped ? `<p>${esc(C.skipped(plan.skipped))}</p>` : ''}${plan.lockedDays ? `<p>${esc(C.lockedDays(plan.lockedDays))}</p>` : ''}</div>`,
          foot: `<button class="kb ghost" data-dismiss>${esc(C.cancel)}</button><button class="kb atlas" data-action="kt-import-csv-apply">${esc(C.apply)}</button>`,
        });
      }).catch(() => Kiwi.toast(C.bad, { type: 'warning', desc: C.badDesc }));
    });
    input.click();
  };
  handlers['kt-import-csv-apply'] = (el) => {
    const C = importCopy();
    const job = pendingImport; pendingImport = null;
    el?.closest('.kiwi-modal, [role=dialog]')?.querySelector('[data-dismiss]')?.click();
    if (!job) return;
    const root = window.__kiwiTeamV2;
    const hours = root.hoursByVenue[job.key] || (root.hoursByVenue[job.key] = {});
    job.changes.forEach((c) => { (hours[c.id] || (hours[c.id] = {}))[c.day] = c.hours; });
    saveCustomTeams();
    if (pageActive) render();
    Kiwi.toast(C.done(job.changes.length), { type: 'success', desc: C.doneDesc });
  };
  handlers['kt-validate-period'] = () => {
    const T = t();
    const root = window.__kiwiTeamV2;
    if (root.periodLocked) return;
    const period = buildPeriod(root.periodKind);
    setPeriodLock(root, root.periodKind, period, true);
    if (pageActive) render();
    Kiwi.toast(T.tValidated(period.startFr, period.endFr), { type: 'success', desc: T.tValidatedDesc });
  };
  handlers['kt-unlock-period'] = () => {
    const T = t();
    const root = window.__kiwiTeamV2;
    if (!root.periodLocked) return;
    const period = buildPeriod(root.periodKind);
    setPeriodLock(root, root.periodKind, period, false);
    if (pageActive) render();
    Kiwi.toast(T.tUnlocked(period.startFr, period.endFr), { type: 'success', desc: T.tUnlockedDesc });
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
  /* Un salaire de base est MENSUEL. « À payer · période » l'ajoutait entier
   * aux heures d'une semaine : 7 jours de travail affichaient un mois de paie
   * plus la semaine. On le ramène aux jours de la période (chaque jour pèse
   * 1/longueur de son mois, donc une semaine à cheval reste juste ; un mois
   * entier vaut exactement 1). Et ce que personne n'a saisi n'est pas « 0 ». */
  function periodMonthShare(days) {
    return days.reduce((acc, d) => {
      const m = /^(\d{4})-(\d{2})/.exec(d || '');
      if (!m) return acc;
      return acc + 1 / new Date(+m[1], +m[2], 0).getDate();
    }, 0);
  }
  /* Un membre qui a un salaire ET un taux horaire : le salaire paie les heures
   * de son contrat, le taux ne paie que ce qui dépasse (décision du
   * propriétaire, 20 octobre). « À payer » additionnait les deux, donc
   * chaque heure contractuelle était payée deux fois. Sans heures de contrat
   * saisies, la semaine légale marocaine de 44 h (Code du travail, art. 184).
   * Sans salaire, toutes les heures restent au taux, comme avant. */
  function contractWeekHours(m) {
    const LEGAL_WEEK = 44;
    const w = +(m && m.contractHours) || 0;
    return w > 0 ? w : LEGAL_WEEK;
  }
  function hourlyPayFor(m, h, days) {
    const rate = +(m && m.hourlyRate) || 0;
    if (!(rate > 0) || !(h > 0)) return 0;
    if (!((+m.baseSalary || 0) > 0)) return h * rate;
    const covered = contractWeekHours(m) * (days ? days.length : 7) / 7;
    return Math.max(0, h - covered) * rate;
  }
  function payrollFigures(members, venueType, period) {
    const hours = getHours(venueType);
    let totalHours = 0, variablePay = 0, baseMass = 0, onDuty = 0, salaried = 0, rated = 0;
    members.forEach((m) => {
      const row = hours[m.id] || {};
      let h = 0;
      period.days.forEach((d) => { h += (+row[d] || 0); });
      if (h > 0) onDuty++;
      totalHours += h;
      if ((+m.hourlyRate || 0) > 0) { rated++; variablePay += hourlyPayFor(m, h, period.days); }
      if ((+m.baseSalary || 0) > 0) { salaried++; baseMass += (+m.baseSalary); }
    });
    const share = Math.min(1, periodMonthShare(period.days));
    return { totalHours, variablePay, baseMass, onDuty, salaried, rated, share, baseDue: baseMass * share };
  }
  /* Les quatre tuiles de Paie & planning, en un seul endroit : le rendu et la
   * mise à jour pendant la saisie lisaient chacun leurs chiffres. */
  function payTiles(T, f, period, count) {
    const whole = f.share >= 0.999;
    return [
      { v: (f.salaried || f.rated) ? fmtMad(f.baseDue + f.variablePay) : '·',
        sub: (f.salaried || f.rated)
          ? (whole || !f.salaried ? T.payStatDueSub(period.startFr, period.endFr) : T.payStatDueProrata(period.startFr, period.endFr, period.days.length))
          : T.payStatNone },
      { v: fmtHours(f.totalHours), sub: T.payStatHoursSub },
      { v: f.rated ? fmtMad(f.variablePay) : '·', sub: f.rated ? T.payStatVarSub : T.noRate },
      { v: f.salaried ? fmtMad(f.baseMass) : '·',
        sub: f.salaried ? T.payStatBaseMonthly(f.salaried, count) : T.statPayrollNone },
    ];
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

  function planCellHtml(T, m, d, cur, locked, dayMeta) {
    const s = normShift(cur);
    const isToday = (d === toISO(new Date()));
    const title = shiftCellTitle(T, cur, d);
    return `<td class="kt-day-cell kt-plan-cell${isToday ? ' today' : ''}${s && !s.off ? ' on' : ''}${s && s.off ? ' off' : ''}${dayMeta?.closed?' is-closed':''}${dayMeta?.holiday?' is-holiday':''}"
      data-kt-cell="${esc(m.id)}|${esc(d)}">
      <button class="kt-sh" type="button" data-action="kt-shift-edit" data-mid="${esc(m.id)}" data-day="${esc(d)}"
        ${locked ? 'disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${shiftCellInner(T, cur, locked)}</button>
    </td>`;
  }

  /* Téléphone (≤ 900 px) : sept colonnes ne tiennent pas dans 390 px, on y
   * défilait de côté à travers des cases de 40 px. Sous 900 px la même semaine
   * se lit un jour à la fois : une pastille par jour (la lentille liquide la
   * suit, un glissement du doigt passe au jour voisin), puis une ligne pleine
   * largeur par personne, nom, fonction et horaires, qui ouvre le même éditeur
   * que la case du tableau. Le tableau reste dans le DOM, caché : ses totaux
   * sont ceux que l'éditeur repeint déjà. Au-dessus de 900 px rien ne change. */
  let planDayISO = '';
  const ADD_ICON = '<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
  function planDayCopy() {
    const lang = trLang();
    if (lang === 'en') return { days: 'Days of the week', add: 'Add', none: 'Nobody on shift', on: (n, h) => `${n} on shift · ${h}` };
    if (lang === 'ar') return { days: 'أيام الأسبوع', add: 'إضافة', none: 'لا أحد في الخدمة', on: (n, h) => `${n} في الخدمة · ${h}` };
    return { days: 'Jours de la semaine', add: 'Ajouter', none: 'Personne en service', on: (n, h) => `${n} en service · ${h}` };
  }
  function planDayRowInner(T, cur) {
    const s = normShift(cur);
    if (!s) return `<span class="kt-pd-add">${ADD_ICON}${esc(planDayCopy().add)}</span>`;
    if (s.off) return `<span class="kt-pd-rest">${esc(T.plRest)}</span>`;
    return `<span class="kt-pd-t">${esc(s.start)} – ${esc(s.end)}${shiftIsNextDay(s) ? '<i class="kt-sh-next">+1</i>' : ''}</span>` +
      `<span class="kt-pd-dur">${esc(fmtDur(shiftMinutes(s)))}</span>`;
  }
  function planDaySummary(cells) {
    const c = planDayCopy();
    let n = 0, h = 0;
    cells.forEach((cur) => { const s = normShift(cur); if (s && !s.off) { n += 1; h += shiftHours(s); } });
    return n ? c.on(n, fmtHours(h)) : c.none;
  }
  function planDaysHtml(T, members, shifts, view, locked, calendarMeta) {
    if (!view.includes(planDayISO)) {
      const today = toISO(new Date());
      planDayISO = view.includes(today) ? today : view[0];
    }
    const c = planDayCopy();
    const today = toISO(new Date());
    const pills = view.map((d) => {
      const dt = fromISO(d);
      const on = d === planDayISO;
      const meta = calendarMeta[d] || {};
      return `<button class="kt-pd-pill${on ? ' on' : ''}${d === today ? ' today' : ''}${meta.closed ? ' is-closed' : ''}" type="button" role="tab"
        id="kt-pd-tab-${esc(d)}" aria-controls="kt-pd-${esc(d)}" aria-selected="${on ? 'true' : 'false'}"
        aria-label="${esc(dt.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }))}"
        data-action="kt-plan-day" data-arg="${esc(d)}"><span class="w">${esc(dt.toLocaleDateString(dateLocale(), { weekday: 'short' }))}</span><span class="d">${dt.getDate()}</span></button>`;
    }).join('');
    const panels = view.map((d) => {
      const dt = fromISO(d);
      const meta = calendarMeta[d] || {};
      const hours = !meta.configured ? '' : meta.closed ? ({ fr: 'Fermé', en: 'Closed', ar: 'مغلق' }[trLang()] || 'Fermé') : compactPeriods(meta.periods);
      const special = meta.exception?.label || meta.holiday?.label || '';
      const rows = members.map((m) => {
        const cur = (shifts[m.id] || {})[d];
        const s = normShift(cur);
        return `<li data-kt-cell="${esc(m.id)}|${esc(d)}">
          <button class="kt-pd-row${s && !s.off ? ' on' : ''}${s && s.off ? ' off' : ''}" type="button" data-action="kt-shift-edit" data-mid="${esc(m.id)}" data-day="${esc(d)}" ${locked ? 'disabled' : ''}>
            <span class="eq-av sm" style="background:${AVATAR_COLORS[m.avatarTone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <span class="kt-pd-who"><b>${esc(memberFullName(m))}</b><small>${esc(jobName(m.function))}</small></span>
            <span class="kt-pd-when">${planDayRowInner(T, cur)}</span>
          </button>
        </li>`;
      }).join('');
      return `<section class="kt-pd-panel" id="kt-pd-${esc(d)}" role="tabpanel" aria-labelledby="kt-pd-tab-${esc(d)}" data-kt-dpanel="${esc(d)}"${d === planDayISO ? '' : ' hidden'}>
        <div class="kt-pd-head">
          <div><strong>${esc(dt.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }))}</strong>${[special, hours].filter(Boolean).length ? `<span>${esc([special, hours].filter(Boolean).join(' · '))}</span>` : ''}</div>
          <span class="kt-pd-sum" data-kt-dsum="${esc(d)}">${esc(planDaySummary(members.map((m) => (shifts[m.id] || {})[d])))}</span>
        </div>
        <ul class="kt-pd-list">${rows}</ul>
      </section>`;
    }).join('');
    return `<div class="kt-pd">
      <div class="kt-pd-days" role="tablist" aria-label="${esc(c.days)}">${pills}</div>
      <div class="kt-pd-panels">${panels}</div>
    </div>`;
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

  function planningCopy() {
    const lang = trLang();
    if (lang === 'en') return { draft:'Draft', published:'Published', changed:'Changes to publish', save:'Save as template', apply:'Apply template', requests:'Requests', publish:'Publish schedule', noTemplate:'No template', healthy:'Ready to publish', emptyPlan:'Nothing planned yet', blocked:(n)=>`${n} conflict${n===1?'':'s'} to resolve`, pending:(n)=>`${n} pending request${n===1?'':'s'}`, templateTitle:'Save this week', templateName:'Template name', saveNow:'Save template', review:'Review requests', empty:'No pending request.', approve:'Approve', reject:'Reject', approved:'Request approved.', rejected:'Request rejected.', leave:'Leave', availability:'Availability', publishDone:'Schedule published to the employee app.', templateDone:'Template saved.', applyDone:'Template applied. Review it before publishing.', publishBlocked:'Publishing is blocked until every conflict is resolved.', coverage:'Coverage rules', rules:(n)=>`${n} coverage rule${n===1?'':'s'}`, labelHint:'e.g. Lunch service', claims:(n)=>`${n} claim${n===1?'':'s'} received`, more:(n)=>`+${n} more`, openShift:'Open shift', planned:'Planned', worked:'Worked', gaps:'Coverage gaps', opportunities:'Open opportunities', warnings:'Warnings', addRule:'Add a coverage rule', minimum:'Minimum team', role:'Role', allRoles:'All roles', weekdays:'Days', start:'Start', end:'End', date:'Date', label:'Label', delete:'Delete', ruleSaved:'Coverage rule saved.', openSaved:'Open shift shared with employees.', openClaim:'Open shift claim', swap:'Shift exchange', decisionFailed:'The change cannot be approved because it conflicts with the current schedule.' };
    if (lang === 'ar') return { draft:'مسودة', published:'منشور', changed:'تغييرات تنتظر النشر', save:'حفظ كنموذج', apply:'تطبيق النموذج', requests:'الطلبات', publish:'نشر الجدول', noTemplate:'لا يوجد نموذج', healthy:'جاهز للنشر', emptyPlan:'لا شيء مخطط بعد', blocked:(n)=>n===1?'تعارض واحد يجب حله':`${n} تعارضات يجب حلها`, pending:(n)=>n===1?'طلب واحد معلق':`${n} طلبات معلقة`, templateTitle:'حفظ هذا الأسبوع', templateName:'اسم النموذج', saveNow:'حفظ النموذج', review:'مراجعة الطلبات', empty:'لا توجد طلبات معلقة.', approve:'موافقة', reject:'رفض', approved:'تمت الموافقة على الطلب.', rejected:'تم رفض الطلب.', leave:'إجازة', availability:'أوقات التوفر', publishDone:'تم نشر الجدول في تطبيق الموظفين.', templateDone:'تم حفظ النموذج.', applyDone:'تم تطبيق النموذج. راجعه قبل النشر.', publishBlocked:'يجب حل جميع التعارضات قبل النشر.', coverage:'قواعد التغطية', rules:(n)=>n===1?'قاعدة تغطية واحدة':`${n} قواعد تغطية`, labelHint:'مثال: خدمة الغداء', claims:(n)=>n===1?'ترشيح واحد':`${n} ترشيحات`, more:(n)=>`+${n} أخرى`, openShift:'وردية شاغرة', planned:'مخطط', worked:'منجز', gaps:'نقص التغطية', opportunities:'فرص مفتوحة', warnings:'تنبيهات', addRule:'إضافة قاعدة تغطية', minimum:'الحد الأدنى للفريق', role:'الوظيفة', allRoles:'كل الوظائف', weekdays:'الأيام', start:'البداية', end:'النهاية', date:'التاريخ', label:'التسمية', delete:'حذف', ruleSaved:'تم حفظ قاعدة التغطية.', openSaved:'تم نشر الوردية الشاغرة للموظفين.', openClaim:'طلب وردية شاغرة', swap:'تبادل وردية', decisionFailed:'لا يمكن اعتماد التغيير لأنه يتعارض مع الجدول الحالي.' };
    return { draft:'Brouillon', published:'Publié', changed:'Modifications à publier', save:'Enregistrer comme modèle', apply:'Appliquer le modèle', requests:'Demandes', publish:'Publier le planning', noTemplate:'Aucun modèle', healthy:'Prêt à publier', emptyPlan:'Rien de planifié pour l’instant', blocked:(n)=>`${n} conflit${n===1?'':'s'} à résoudre`, pending:(n)=>`${n} demande${n===1?'':'s'} en attente`, templateTitle:'Enregistrer cette semaine', templateName:'Nom du modèle', saveNow:'Enregistrer le modèle', review:'Examiner les demandes', empty:'Aucune demande en attente.', approve:'Approuver', reject:'Refuser', approved:'Demande approuvée.', rejected:'Demande refusée.', leave:'Congé', availability:'Disponibilités', publishDone:'Planning publié dans l’application employé.', templateDone:'Modèle enregistré.', applyDone:'Modèle appliqué. Vérifiez-le avant publication.', publishBlocked:'La publication reste bloquée tant que les conflits ne sont pas résolus.', coverage:'Règles de couverture', rules:(n)=>`${n} règle${n===1?'':'s'} de couverture`, labelHint:'ex. Service du midi', claims:(n)=>`${n} candidature${n===1?'':'s'} reçue${n===1?'':'s'}`, more:(n)=>`+${n} autre${n===1?'':'s'}`, openShift:'Service à pourvoir', planned:'Planifié', worked:'Réalisé', gaps:'Manques de couverture', opportunities:'Opportunités ouvertes', warnings:'Alertes', addRule:'Ajouter une règle de couverture', minimum:'Équipe minimum', role:'Fonction', allRoles:'Toutes les fonctions', weekdays:'Jours', start:'Début', end:'Fin', date:'Date', label:'Libellé', delete:'Supprimer', ruleSaved:'Règle de couverture enregistrée.', openSaved:'Service partagé avec les employés.', openClaim:'Candidature à un service', swap:'Échange de service', decisionFailed:'Ce changement ne peut pas être approuvé car il entre en conflit avec le planning actuel.' };
  }
  function optimizationCopy(){const lang=trLang();if(lang==='en')return{optimize:'Build schedule',optimizeTitle:'Suggested schedule',optimizeCount:(n)=>`${n} shift${n===1?'':'s'} proposed`,optimizeReview:'Review the proposal before applying it. Nothing is published automatically.',optimizeUnresolved:(n)=>`${n} coverage gap${n===1?' remains':'s remain'}`,optimizeApply:'Apply to draft',optimizeDone:'Suggested shifts added to the draft.',optimizeBlocked:'No safe assignment covers these gaps.',optimizeNothing:'The schedule already covers every rule.'};if(lang==='ar')return{optimize:'إنشاء الجدول',optimizeTitle:'الجدول المقترح',optimizeCount:(n)=>`${n} ورديات مقترحة`,optimizeReview:'راجع الاقتراح قبل تطبيقه. لن يتم نشر أي شيء تلقائياً.',optimizeUnresolved:(n)=>`${n} فجوات دون حل آمن`,optimizeApply:'إضافة إلى المسودة',optimizeDone:'تمت إضافة الورديات المقترحة إلى المسودة.',optimizeBlocked:'لا يوجد تعيين آمن لتغطية هذا النقص.',optimizeNothing:'الجدول يغطي جميع القواعد بالفعل.'};return{optimize:'Composer le planning',optimizeTitle:'Planning suggéré',optimizeCount:(n)=>`${n} service${n===1?'':'s'} proposé${n===1?'':'s'}`,optimizeReview:'Vérifiez la proposition avant de l’appliquer. Rien n’est publié automatiquement.',optimizeUnresolved:(n)=>`${n} manque${n===1?' reste':'s restent'} sans solution sûre`,optimizeApply:'Ajouter au brouillon',optimizeDone:'Les services suggérés ont été ajoutés au brouillon.',optimizeBlocked:'Aucune affectation sûre ne couvre ces manques.',optimizeNothing:'Le planning couvre déjà toutes les règles.'};}
  /* « 2026-10-05 » dans une phrase lue par un gérant : on écrit « lun. 05/10 ». */
  function planIssueDay(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return day || '';
    const dt = new Date(+m[1], +m[2] - 1, +m[3]);
    const lang = trLang();
    const wd = dt.toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ar' ? 'ar-MA' : 'fr-FR', { weekday: 'short' });
    return wd + ' ' + m[3] + '/' + m[2];
  }
  function issueLabel(issue) {
    /* Un manque de couverture ne vise personne : il vise une règle. Sans ce
     * repli, la ligne s'ouvrait sur la date et ne disait pas quelle règle. */
    const who = issue.memberName || issue.memberId || issue.label;
    const labels = trLang() === 'en'
      ? { 'approved-leave':'is on approved leave', unavailable:'is marked unavailable', 'outside-availability':'is scheduled outside availability', 'outside-contract':'is outside the contract period', overlap:'has overlapping shifts', 'unknown-member':'is no longer on the team', 'empty-schedule':'No shift or day off has been entered', 'coverage-gap':`coverage short: ${issue.scheduled}/${issue.required}`, 'long-shift':'has a long shift', 'weekly-hours':'exceeds the weekly-hour alert', 'short-rest':'has too little rest', 'open-shift':'still has an open shift', 'closed-day':'is scheduled while the venue is closed', 'outside-opening-hours':'is scheduled outside opening hours', 'public-holiday':`is scheduled on ${issue.holiday}; review compensation` }
      : trLang() === 'ar'
        ? { 'approved-leave':'في إجازة معتمدة', unavailable:'غير متاح في هذا اليوم', 'outside-availability':'مجدول خارج أوقات توفره', 'outside-contract':'خارج مدة العقد', overlap:'لديه فترات عمل متداخلة', 'unknown-member':'لم يعد ضمن الفريق', 'empty-schedule':'لم يتم إدخال أي وردية أو يوم راحة', 'coverage-gap':`نقص في التغطية: ${issue.scheduled}/${issue.required}`, 'long-shift':'لديه وردية طويلة', 'weekly-hours':'تجاوز حد الساعات الأسبوعية', 'short-rest':'فترة الراحة غير كافية', 'open-shift':'لديه وردية شاغرة', 'closed-day':'مجدول في يوم تكون فيه المؤسسة مغلقة', 'outside-opening-hours':'مجدول خارج ساعات فتح المؤسسة', 'public-holiday':`مجدول خلال ${issue.holiday}؛ راجع التعويض` }
        : { 'approved-leave':'est en congé approuvé', unavailable:'est indisponible ce jour', 'outside-availability':'est planifié hors disponibilité', 'outside-contract':'est hors période de contrat', overlap:'a des services qui se chevauchent', 'unknown-member':"n’est plus dans l’équipe", 'empty-schedule':'Aucun service ni jour de repos n’a été saisi', 'coverage-gap':`couverture insuffisante : ${issue.scheduled}/${issue.required}`, 'long-shift':'a un service long', 'weekly-hours':'dépasse l’alerte hebdomadaire', 'short-rest':'a trop peu de repos', 'open-shift':'a encore un service à pourvoir', 'closed-day':'est planifié alors que l’établissement est fermé', 'outside-opening-hours':'est planifié hors horaires d’ouverture', 'public-holiday':`est planifié pendant ${issue.holiday} ; vérifiez la compensation` };
    const day = issue.code === 'empty-schedule' ? '' : planIssueDay(issue.day);
    return [who, day, labels[issue.code] || issue.code].filter(Boolean).join(' · ');
  }

  function renderPlanningPane(T, venue, venueType, members, options = {}) {
    /* Managers build and publish shifts, but salary rates and projected labour
     * cost remain owner-only. One renderer keeps the operational plan identical
     * while removing the financial column at the source (not merely with CSS). */
    const showCosts = options.showCosts !== false;
    const root = window.__kiwiTeamV2;
    const period = buildPeriod(root.periodKind || 'week');
    const shifts = root.shiftsByVenue[venueType] || (root.shiftsByVenue[venueType] = {});
    const locked = root.periodLocked;
    const P = window.KiwiPlanningCore;
    const planning = root.planningByVenue[venueType] || (root.planningByVenue[venueType] = P?.blank?.() || {});
    const copy = planningCopy();
    const optimizeCopy = optimizationCopy();
    const fairCopy = fairScheduleCopy();
    const lifecycle = P?.status?.(planning, shifts, period.days) || { state:'draft' };
    const ctx={venue,key:venueType};
    const calendarMeta=planningPeriodMeta(period.days,ctx);
    const periodsByDay=Object.fromEntries(period.days.map((day)=>[day,calendarMeta[day]?.periods||[]]));
    const holidaysByDay=planningHolidaysByDay(period.days);
    const hoursConfigured=Object.values(calendarMeta).some((meta)=>meta.configured);
    const issues = P?.validate?.({ planning, shifts, days:period.days, members, periodsByDay:hoursConfigured?periodsByDay:null, holidaysByDay }) || [];
    const blockers=issues.filter((issue)=>issue.severity==='blocker');
    const warnings=issues.filter((issue)=>issue.severity!=='blocker');
    /* La liste est tronquée à six lignes. `validate()` sort les alertes avant
     * les bloquants, donc la troncature cachait précisément ce qui empêche de
     * publier — on remonte les bloquants et on annonce le reste. */
    /* Une semaine où rien n'est encore saisi n'est pas « 1 conflit à
     * résoudre » : c'est un planning à composer. Le blocage de publication
     * reste (publier du vide n'a pas de sens), mais la page ne le compte plus
     * comme un conflit, et la ligne ne s'épingle plus au lundi en ISO. */
    const emptyPlan=blockers.length===1&&blockers[0].code==='empty-schedule';
    const conflictCount=blockers.length-(emptyPlan?1:0);
    const shownIssues=blockers.concat(warnings).slice(0,6);
    const hiddenIssues=Math.max(0,issues.length-shownIssues.length);
    const pending = (planning.requests || []).filter((request) => request.status === 'pending');
    const opportunityClaims=(planning.openShifts||[]).filter((item)=>item.status==='claimed').length+(planning.swapRequests||[]).filter((item)=>item.status==='claimed').length;
    const coverage=P?.coverageSummary?.({planning,shifts,days:period.days,members,periodsByDay:hoursConfigured?periodsByDay:null})||[];
    const coverageGaps=coverage.reduce((sum,row)=>sum+(Number(row.gap)||0),0);
    /* `coverage` liste les manques, pas les règles : une seule règle appliquée
     * sur sept jours en rend sept. La tuile annonçait donc « 7 règles de
     * couverture » à un patron qui n'en avait écrit qu'une — et serait retombée
     * à « 0 règles » le jour où le planning est enfin complet. */
    const coverageRuleCount=(planning.coverageRules||[]).filter((rule)=>rule&&rule.active!==false).length;
    const openOpportunities=(planning.openShifts||[]).filter((item)=>['open','claimed'].includes(item.status)).length+(planning.swapRequests||[]).filter((item)=>['open','claimed'].includes(item.status)).length;
    let grandH = 0, grandCost = 0;
    let workedH=0;
    const realised=root.hoursByVenue[venueType]||{};
    members.forEach((member)=>period.days.forEach((day)=>{workedH+=Number(realised[member.id]&&realised[member.id][day])||0;}));

    const chunks = weekChunks(period.days);
    if (planWeekIdx >= chunks.length) planWeekIdx = chunks.length - 1;
    if (planWeekIdx < 0) planWeekIdx = 0;
    const view = chunks[planWeekIdx];
    const multiWeek = chunks.length > 1;

    const headDays = view.map((d) => {
      const dt = fromISO(d);
      const dayLbl = dt.toLocaleDateString(dateLocale(), { weekday: 'short' });
      const meta=calendarMeta[d],hours=!meta.configured?({fr:'À configurer',en:'Not set',ar:'غير مضبوط'}[trLang()]||'À configurer'):meta.closed?({fr:'Fermé',en:'Closed',ar:'مغلق'}[trLang()]||'Fermé'):compactPeriods(meta.periods);
      const special=meta.exception?.label||meta.holiday?.label||'';
      return `<th class="kt-day-head${meta.closed?' is-closed':''}${meta.holiday?' is-holiday':''}" title="${esc([special,hours].filter(Boolean).join(' · '))}"><span class="d">${pad(dt.getDate())}</span><span class="m">${dayLbl}</span><span class="kt-day-hours">${esc(hours)}</span>${special?`<span class="kt-day-special">${esc(special)}</span>`:''}</th>`;
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
        return planCellHtml(T, m, d, row[d], locked, calendarMeta[d]);
      }).join('');
      const cost = hourlyPayFor(m, h, period.days);
      grandH += h; grandCost += cost;
      const tone = m.avatarTone || 'a';
      return `
        <tr>
          <td class="kt-h-member">
            <span class="eq-av sm" style="background:${AVATAR_COLORS[tone] || AVATAR_COLORS.a}">${esc(initials(m.firstName, m.lastName))}</span>
            <div>
              <div class="n">${esc(memberFullName(m))}</div>
              <div class="r">${esc(jobName(m.function))}</div>
            </div>
          </td>
          ${cells}
          <td class="kt-h-total mono"><b>${fmtHours(h)}</b></td>
          ${showCosts ? ((+m.hourlyRate || 0) > 0 ? `<td class="kt-h-pay mono"><b>${(window.KiwiNumber?.format(cost, { maximumFractionDigits: 0 }) ?? cost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span></td>` : `<td class="kt-h-pay mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
        </tr>`;
    }).join('');

    const cols = `<colgroup><col class="kt-plan-col-mem">${view.map(() => '<col>').join('')}<col class="kt-plan-col-tot">${showCosts ? '<col class="kt-plan-col-tot">' : ''}</colgroup>`;
    const stepper = multiWeek ? `
      <div class="kt-plan-step">
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="prev"
          aria-label="${esc(T.plPrevWeek)}" ${planWeekIdx === 0 ? 'disabled' : ''}>‹</button>
        <span class="kt-plan-steplbl mono">${esc(T.plWeekOf(fmtFr(fromISO(view[0])), fmtFr(fromISO(view[view.length - 1]))))}</span>
        <button class="kt-plan-arrow" type="button" data-action="kt-plan-week" data-arg="next"
          aria-label="${esc(T.plNextWeek)}" ${planWeekIdx >= chunks.length - 1 ? 'disabled' : ''}>›</button>
      </div>` : '';

    const stateText = lifecycle.state === 'published' ? copy.published : lifecycle.state === 'changed' ? copy.changed : copy.draft;
    const qualityText = emptyPlan ? copy.emptyPlan : blockers.length ? copy.blocked(blockers.length) : copy.healthy;
    const templates = planning.templates || [];
    const specialDays=period.days.map((day)=>calendarMeta[day]).filter((meta)=>meta.exception||meta.holiday);
    const calendarCopy=trLang()==='en'
      ? {title:'Business calendar',ready:'Weekly opening hours, exceptions and public holidays are reflected below.',missing:'Set opening days before building the team schedule.',edit:'Edit hours',holiday:'Public holiday',review:'Review compensation policy'}
      : trLang()==='ar'
        ? {title:'تقويم المؤسسة',ready:'تظهر ساعات الفتح والاستثناءات والعطل الرسمية في الجدول.',missing:'حدد أيام وساعات العمل قبل إعداد جدول الفريق.',edit:'تعديل الساعات',holiday:'عطلة رسمية',review:'راجع سياسة التعويض'}
        : {title:'Calendrier de l’établissement',ready:'Horaires, fermetures exceptionnelles et jours fériés sont intégrés au planning.',missing:'Renseignez les jours d’ouverture avant de composer le planning.',edit:'Modifier les horaires',holiday:'Jour férié',review:'Vérifier la compensation'};
    const calendarBridge=`<div class="kt-calendar-bridge ${hoursConfigured?'is-ready':'is-missing'}"><i></i><div><strong>${esc(calendarCopy.title)}</strong><span>${esc(hoursConfigured?calendarCopy.ready:calendarCopy.missing)}</span>${specialDays.length?`<small>${specialDays.slice(0,3).map((meta)=>`${esc(fromISO(meta.day).toLocaleDateString(dateLocale(),{weekday:'short',day:'numeric',month:'short'}))} · ${esc(meta.exception?.label||meta.holiday?.label||calendarCopy.holiday)}${meta.holiday&&!meta.exception?' · '+esc(calendarCopy.review):''}`).join('<br>')}</small>`:''}</div><button class="btn-slim" type="button" data-action="kt-plan-hours">${esc(calendarCopy.edit)}</button></div>`;
    const planningCommand = `
      ${calendarBridge}
      <div class="kt-planning-command">
        <div class="kt-planning-health">
          <span class="kt-plan-state ${esc(lifecycle.state)}"><i></i>${esc(stateText)}</span>
          <div><strong>${esc(qualityText)}</strong><p>${esc(copy.pending(pending.length+opportunityClaims))}</p></div>
        </div>
        <div class="kt-planning-actions">
          <div class="kt-plan-primary-row">
            <button class="btn-slim kt-plan-fair-action" type="button" data-action="kt-plan-fair">${esc(fairCopy.action)}</button>
            <div class="kt-plan-action-group is-publish">
              ${pending.length+opportunityClaims ? `<button class="btn-slim" type="button" data-action="kt-plan-requests">${esc(copy.requests)} · ${pending.length+opportunityClaims}</button>` : ''}
              <button class="btn-slim primary" type="button" data-action="kt-plan-publish">${esc(copy.publish)}</button>
            </div>
          </div>
          <details class="kt-plan-tools">
            <summary><span>${esc(fairCopy.tools)}</span><small>${esc(fairCopy.toolsHint)}</small></summary>
            <div class="kt-plan-tools-panel">
              <section><div><strong>${esc(fairCopy.coverageGroup)}</strong><p>${esc(fairCopy.coverageDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-coverage">${esc(copy.coverage)}</button><button class="btn-slim" type="button" data-action="kt-plan-optimize">${esc(fairCopy.fromRules)}</button></div></section>
              <section><div><strong>${esc(fairCopy.openGroup)}</strong><p>${esc(fairCopy.openDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-open">${esc(copy.openShift)}</button></div></section>
              <section><div><strong>${esc(fairCopy.templateGroup)}</strong><p>${esc(fairCopy.templateDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-template-save">${esc(copy.save)}</button><select class="kt-plan-select" data-kt-template-select aria-label="${esc(copy.apply)}"><option value="">${esc(copy.noTemplate)}</option>${templates.map((template)=>`<option value="${esc(template.id)}">${esc(template.name)}</option>`).join('')}</select><button class="btn-slim" type="button" data-action="kt-plan-template-apply">${esc(copy.apply)}</button></div></section>
              <section><div><strong>${esc(fairCopy.maintenance)}</strong><p>${esc(fairCopy.maintenanceDesc)}</p></div><div class="kt-plan-action-group"><button class="btn-slim" type="button" data-action="kt-plan-clear" ${locked?'disabled':''}>${esc(T.plClear)}</button><button class="btn-slim" type="button" data-action="kt-plan-apply" ${locked?'disabled':''}>${svgIcon(IC.check,13)}<span>${esc(T.plApply)}</span></button></div></section>
            </div>
          </details>
        </div>
      </div>
      <div class="kt-plan-intelligence"><div><b>${esc(copy.planned)}</b><strong>${fmtHours(grandH)}</strong><span>${esc(copy.worked)} · ${fmtHours(workedH)}</span></div><div><b>${esc(copy.gaps)}</b><strong>${coverageGaps}</strong><span>${esc(copy.rules(coverageRuleCount))}</span></div><div><b>${esc(copy.opportunities)}</b><strong>${openOpportunities}</strong><span>${esc(copy.claims(opportunityClaims))}</span></div><div><b>${esc(copy.warnings)}</b><strong>${issues.length-(emptyPlan?1:0)}</strong><span>${esc(emptyPlan?copy.emptyPlan:copy.blocked(conflictCount))}</span></div></div>
      ${shownIssues.map((issue)=>`<div class="kt-plan-issue ${issue.severity==='blocker'?'is-blocker':'is-warning'}"><b>${issue.severity==='blocker'?'!':'i'}</b><span>${esc(issueLabel(issue))}</span></div>`).join('')}
      ${hiddenIssues?`<div class="kt-plan-issue is-more"><b>+</b><span>${esc(copy.more(hiddenIssues))}</span></div>`:''}`;

    return `
      <div class="eq-section">
        <div class="eq-section-head">
          <h3>${esc(T.tabPlanning)}</h3>
          <span class="eq-count-badge">${esc(T.hPeriodLabel(period.startFr, period.endFr))}${locked ? ' · ' + esc(T.hLocked) : ''}</span>
        </div>
        <div class="kt-hbar">
          <div class="eq-pill-row">${periodPillsHtml(T)}</div>
        </div>
        ${periodNavigatorHtml(T, period)}
        <p class="kt-plan-hint">${esc(T.plHint)}</p>
        ${planningCommand}
        ${stepper}
        ${planDaysHtml(T, members, shifts, view, locked, calendarMeta)}
        <div class="kt-plan-wrap">
          <table class="kt-h-table kt-plan-table">
            ${cols}
            <thead>
              <tr>
                <th class="kt-h-memberhead">${esc(T.plMember)}</th>
                ${headDays}
                <th class="kt-h-totalhead">${esc(multiWeek ? T.plPlannedPeriod : T.plPlanned)}</th>
                ${showCosts ? `<th class="kt-h-totalhead">${esc(T.plCost)}</th>` : ''}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td class="kt-h-foot-label">${esc(T.plFooter)}</td>
                <td colspan="${view.length}"></td>
                <td class="kt-h-foot-tot mono"><b>${fmtHours(grandH)}</b></td>
                ${showCosts ? (members.some((m) => (+m.hourlyRate || 0) > 0) ? `<td class="kt-h-foot-tot mono"><b>${(window.KiwiNumber?.format(grandCost, { maximumFractionDigits: 0 }) ?? grandCost.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { maximumFractionDigits: 0 }))}</b><span>MAD</span></td>` : `<td class="kt-h-foot-tot mono"><b title="${esc(T.noRate)}">·</b></td>`) : ''}
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="kt-plan-legend${anyNextDay ? '' : ' is-off'}"><i class="kt-sh-next">+1</i> ${esc(T.plNextDayLegend)}</p>
      </div>`;
  }

  function payrollAccess() {
    const role = window.__kiwiRole || 'owner';
    const payrollEnabled = window.KiwiConfig?.features?.payroll !== false;
    return role === 'staff' ? 'none' : role === 'manager' || !payrollEnabled ? 'planning' : 'full';
  }

  function renderPayrollBody(T, venue, venueType, members, access = payrollAccess()) {
    const period = buildPeriod(window.__kiwiTeamV2.periodKind || 'week');
    if (!members.length) {
      return `
        <div class="dash-equipe">
          <div class="eq-section" style="text-align:center; padding:44px 18px; display:flex; flex-direction:column; align-items:center;">
            <div style="width:48px;height:48px;border-radius:14px;background:rgba(11,110,79,0.10);border:1px solid rgba(11,110,79,0.18);color:var(--atlas);display:grid;place-items:center;margin-bottom:16px;">
              <svg width="24" height="24" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
            </div>
            <h3 style="margin:0 0 6px; font-family:var(--sans); font-size:18px; font-weight:600; letter-spacing:-0.015em; color:var(--ink);">${esc(T.payEmptyH)}</h3>
            <p style="margin:0 auto 18px; max-width:44ch; color:var(--n-500); line-height:1.55; font-size:13px;">${esc(T.payEmptyP)}</p>
            <button class="kb atlas" type="button" data-action="nav-equipe">${svgIcon(IC.plus, 13)}${esc(T.addMember)}</button>
          </div>
        </div>`;
    }
    if (access === 'planning') {
      return `<div class="dash-equipe">${renderPlanningPane(T, venue, venueType, members, { showCosts: false })}</div>`;
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
          ${(() => { const pt = payTiles(T, f, period, members.length); return [T.payStatDue, T.payStatHours, T.payStatVar, T.payStatBase].map((l, i) => tile(l, pt[i].v, pt[i].sub)).join(''); })()}
        </div>
        <div class="eq-filters">
          <div class="eq-pill-row">
            <button class="eq-pill${payTab === 'planning' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="planning">${esc(T.tabPlanning)}</button>
            <button class="eq-pill${payTab === 'hours' ? ' on' : ''}" type="button" data-action="kt-paytab" data-arg="hours">${esc(T.tabRealised)}</button>
          </div>
        </div>
        ${payTab === 'planning'
          ? renderPlanningPane(T, venue, venueType, members, { showCosts: true })
          : renderHoursPane(T, venue, venueType, members)}
      </div>`;
  }

  function showPayroll() {
    if (!window.Kiwi || !window.Kiwi.appPage) return;
    const access = payrollAccess();
    if (access === 'none') {
      window.Kiwi.toast?.('Accès réservé au gérant ou au propriétaire', { type: 'info' });
      return;
    }
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    ensureVenueData(venue);
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    { const root = window.__kiwiTeamV2; restorePeriodLock(root, root.periodKind || 'week', buildPeriod(root.periodKind || 'week')); }
    pageActive = true;
    scheduleLiveTeam();          // la paie lit le pointage : cadence rapide
    pageMode = 'payroll';
    const managerCopy = trLang() === 'en'
      ? { title: 'Planning', sub: 'shifts, availability and coverage' }
      : trLang() === 'ar'
        ? { title: 'التخطيط', sub: 'الورديات والتوفر والتغطية' }
        : { title: 'Planning', sub: 'services, disponibilités et couverture' };
    window.Kiwi.appPage('payroll', {
      title: access === 'planning' ? managerCopy.title : T.payTitle,
      subtitle: `${venue.name || 'Votre établissement'} · ${access === 'planning' ? managerCopy.sub : T.paySub}`,
      body: renderPayrollBody(T, venue, venueType, members, access),
    });
    /* La lentille ne rattrape que les nœuds ajoutés d'un seul lot : la page vient
       d'être posée d'un coup, on lui demande de relire la rangée des jours. */
    try { window.KiwiLens && window.KiwiLens.rescan && window.KiwiLens.rescan(); } catch (_) {}
    // The venue subscription lives on showPage(); mirror it so switching store
    // while on Paie repaints instead of showing the old roster.
    bindLangChange();
    if (!unsubscribeVenue && window.KiwiVenue?.subscribe) {
      unsubscribeVenue = window.KiwiVenue.subscribe(() => {
        /* setVenue() has already put the dashboard back: Paie left behind by a
           jump to Stock must not reopen over it. */
        if (!pageActive || !teamOnScreen()) return;
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
    // Paie & planning is one product surface in demo and production. Keeping the
    // old pitch-only drawer as a demo fallback meant every new planning feature
    // (availability, publishing and fair allocation) disappeared exactly where
    // merchants try it first.
    const prevPayroll = H['nav-payroll'];
    if (!prevPayroll || !prevPayroll.__ktOwned) {
      const wrapped = function () {
        showPayroll();
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

    /* Le pas à pas des semaines · visible seulement sur quinzaine / mois. */
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
    .dash-equipe .kt-sh-empty { color: var(--n-500); font-size: 13px; }
    .dash-equipe .kt-sh-rest { font-family: var(--sans); font-size: 11px; color: var(--n-500); }
    .dash-equipe .kt-sh-t { display: block; white-space: nowrap; }
    .dash-equipe .kt-sh-t.end { color: var(--n-600); }
    /* Pas scopé à .dash-equipe : le même badge sert dans l'éditeur, qui vit
       sur <body> pour ne jamais être rogné par le tableau. */
    .kt-sh-next {
      display: inline-block; margin: 0 2px 0 3px; padding: 0 3px; border-radius: 4px;
      background: var(--mint-soft, rgba(125,242,176,0.35)); color: var(--atlas);
      font-family: var(--mono); font-size: 11px; font-style: normal; font-weight: 600;
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
      .dash-equipe .kt-sh { font-size: 11px; padding: 4px 1px; min-height: 38px; }
      .dash-equipe .kt-sh-rest { font-size: 11px; }
      .dash-equipe .kt-sh .kt-sh-next { display: block; margin: 1px 0 0; }
    }

    /* Éditeur de service · ancré sur la case, jamais dans le flux du tableau. */
    .kt-shpop {
      position: fixed; z-index: 900; width: 268px; padding: 14px;
      background: var(--surface, #fff); border: 1px solid var(--n-200);
      border-radius: 14px; box-shadow: 0 18px 44px rgba(10,15,13,0.18);
      font-family: var(--sans); color: var(--ink);
    }
    .kt-shpop-head { margin-bottom: 11px; }
    .kt-shpop-head b { display: block; font-size: 13px; }
    /* « lundi 20 juillet » : en français seule la 1re lettre prend la majuscule
       capitalize aurait écrit « Lundi 20 Juillet ». */
    .kt-shpop-head span { display: block; font-size: 11px; color: var(--n-500); margin-top: 2px; }
    .kt-shpop-head span::first-letter { text-transform: uppercase; }
    .kt-shpop-times { display: flex; gap: 8px; }
    .kt-shpop-times label { flex: 1; min-width: 0; }
    .kt-shpop-times span { display: block; font-size: 11px; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); margin-bottom: 4px; }
    .kt-shpop-times input {
      width: 100%; box-sizing: border-box; padding: 8px 9px; border: 1px solid var(--n-200);
      border-radius: 9px; background: var(--surface); color: var(--ink);
      font-family: var(--mono); font-size: 13px; outline: none;
    }
    .kt-shpop-times input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    .kt-shpop-sum { min-height: 17px; margin: 9px 0 2px; font-size: 11.5px; color: var(--n-600); line-height: 1.5; }
    .kt-shpop-sum b { color: var(--ink); font-size: 12.5px; }
    .kt-shpop-sum.warn { color: var(--warn-ink); }
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
    .dash-equipe .kt-searchbar-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--n-500); pointer-events: none; }
    .dash-equipe .kt-searchbar input { width: 100%; padding: 11px 12px 11px 36px; border: 1px solid var(--n-200); border-radius: 10px; font-family: var(--sans); font-size: 13px; background: var(--surface); color: var(--ink); outline: none; box-sizing: border-box; transition: border-color 140ms, box-shadow 140ms; }
    .dash-equipe .kt-searchbar input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }

    /* Tag chips (contract type) */
    .dash-equipe .kt-tag { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.04em; }
    .dash-equipe .kt-tag-ok      { background: var(--mint-soft); color: var(--atlas); border: 1px solid rgba(11,110,79,0.18); }
    .dash-equipe .kt-tag-pend    { background: var(--warn-soft); color: var(--warn-ink); border: 1px solid color-mix(in srgb, var(--warn-ink) 25%, transparent); }
    .dash-equipe .kt-tag-neutral { background: var(--paper-soft); color: var(--n-600); border: 1px solid var(--n-200); }
    .dash-equipe .kt-langchip { background: var(--paper-soft); border: 1px solid var(--n-200); padding: 2px 7px; border-radius: 5px; font-size: 11px; color: var(--n-700); }
    .dash-equipe .kt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .dash-equipe .kt-cell-strong { font-weight: 500; color: var(--ink); }

    /* Hours tab · table */
    .dash-equipe .kt-hbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .dash-equipe .kt-hbar-right { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .dash-equipe .kt-h-tablewrap { border: 1px solid var(--n-200); border-radius: 12px; overflow-x: auto; background: var(--surface); }
    .dash-equipe .kt-h-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .dash-equipe .kt-h-table thead th { background: var(--paper-soft); padding: 11px 9px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; color: var(--n-500); font-weight: 500; text-align: left; text-transform: uppercase; border-bottom: 1px solid var(--n-200); position: sticky; top: 0; }
    .dash-equipe .kt-h-table .kt-day-head { text-align: center; min-width: 54px; }
    .dash-equipe .kt-h-table .kt-day-head .d { display: block; font-size: 12.5px; color: var(--ink); font-weight: 600; }
    .dash-equipe .kt-h-table .kt-day-head .m { display: block; font-size: 11px; color: var(--n-500); text-transform: lowercase; letter-spacing: 0.04em; margin-top: 2px; }
    .dash-equipe .kt-h-table .kt-day-head .kt-day-hours { display: block; overflow: hidden; margin-top: 5px; color: var(--n-700); font: 600 8px/1.25 var(--mono); letter-spacing: 0; text-overflow: ellipsis; white-space: nowrap; text-transform: none; }
    .dash-equipe .kt-h-table .kt-day-head .kt-day-special { display: block; overflow: hidden; margin-top: 4px; padding: 3px 4px; border-radius: 999px; background: color-mix(in srgb, var(--atlas) 10%, var(--surface)); color: var(--atlas); font: 700 7px/1.2 var(--mono); letter-spacing: .03em; text-overflow: ellipsis; white-space: nowrap; text-transform: none; }
    .dash-equipe .kt-h-table .kt-day-head.is-closed { background: color-mix(in srgb, var(--n-200) 45%, var(--paper-soft)); }
    .dash-equipe .kt-h-table .kt-day-head.is-closed .kt-day-hours { color: var(--n-500); }
    .dash-equipe .kt-h-table tbody td { border-top: 1px solid var(--n-200); padding: 9px 9px; vertical-align: middle; }
    .dash-equipe .kt-h-table .kt-h-member { display: flex; align-items: center; gap: 10px; min-width: 200px; }
    .dash-equipe .kt-h-table .kt-h-member .n { font-weight: 600; font-size: 12.5px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-member .r { font-size: 11px; color: var(--n-500); margin-top: 1px; }
    .dash-equipe .kt-h-table .kt-day-cell { text-align: center; padding: 7px 4px; }
    .dash-equipe .kt-h-table .kt-day-cell input { width: 50px; padding: 5px 4px; border: 1px solid var(--n-200); border-radius: 6px; font-family: var(--mono); font-size: 12px; background: var(--surface); color: var(--ink); text-align: center; outline: none; -moz-appearance: textfield; }
    .dash-equipe .kt-h-table .kt-day-cell input::-webkit-outer-spin-button, .dash-equipe .kt-h-table .kt-day-cell input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .dash-equipe .kt-h-table .kt-day-cell input:focus { border-color: var(--atlas); box-shadow: 0 0 0 2px rgba(11,110,79,0.12); }
    .dash-equipe .kt-h-table .kt-day-cell.today { background: rgba(125, 242, 176, 0.10); }
    .dash-equipe .kt-h-table .kt-day-cell.is-closed { background-image: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--n-200) 42%, transparent) 7px 8px); }
    .dash-equipe .kt-h-table .kt-day-cell.is-holiday .kt-sh { border-color: color-mix(in srgb, var(--atlas) 30%, var(--n-200)); }
    .dash-equipe .kt-h-table .kt-day-cell.locked input { background: var(--paper-soft); color: var(--n-500); cursor: not-allowed; }
    .dash-equipe .kt-h-table .kt-h-total, .dash-equipe .kt-h-table .kt-h-pay { text-align: right; min-width: 82px; padding-right: 14px; }
    .dash-equipe .kt-h-table .kt-h-total b, .dash-equipe .kt-h-table .kt-h-pay b { font-size: 13px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-total span, .dash-equipe .kt-h-table .kt-h-pay span { color: var(--n-500); font-size: 11px; margin-left: 3px; font-weight: 400; }
    .dash-equipe .kt-h-table tfoot td { padding: 11px 9px; background: var(--paper-soft); border-top: 2px solid var(--ink); font-size: 12.5px; }
    .dash-equipe .kt-h-table .kt-h-foot-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; color: var(--n-700); text-transform: uppercase; padding-left: 16px; }
    .dash-equipe .kt-h-table .kt-h-foot-tot b { font-size: 14px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-foot-tot span { color: var(--n-500); font-size: 11px; margin-left: 3px; font-weight: 400; }

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
    body.fusion-mode .dash-equipe .kt-sh-rest { color: var(--n-500); }
    body.fusion-mode .dash-equipe .kt-h-table thead th,
    body.fusion-mode .dash-equipe .kt-h-table tfoot td { background: rgba(255,255,255,0.04) !important; color: var(--paper); }
    body.fusion-mode .dash-equipe .kt-h-table .kt-day-cell.locked input { background: rgba(255,255,255,0.06) !important; color: var(--n-500); }
    body.fusion-mode .dash-equipe .kt-tag-neutral { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
    body.fusion-mode .dash-equipe .kt-langchip { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
    /* Phone: thumb-sized week arrows, readable day captions, no focus zoom. */
    @media (max-width: 820px) {
      .dash-equipe .kt-plan-arrow { min-width: 44px; min-height: 44px; }
      .dash-equipe .kt-searchbar input { font-size: 16px; }
    }
    @media (max-width: 900px) {
      .dash-equipe .kt-h-table .kt-day-head .kt-day-hours { font-size: 11px; }
      .dash-equipe .kt-h-table .kt-day-head .kt-day-special { font-size: 11px; }
    }

    /* Planning · un jour à la fois sous 900 px (planDaysHtml). Au-dessus, la
       vue du jour n'existe pas et le tableau de la semaine reste tel quel. */
    .dash-equipe .kt-pd { display: none; }
    @media (max-width: 900px) {
      .dash-equipe .kt-pd { display: block; }
      .dash-equipe .kt-plan-wrap { display: none; }
      .dash-equipe .kt-pd-days {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px;
        /* La rangée déborde un peu sur la marge de la carte : à 390 px, sept
           pastilles y gardent chacune leurs 44 px au pouce. */
        padding: 3px; margin: 0 -6px 14px; border: 1px solid var(--n-200);
        border-radius: 14px; background: var(--paper-soft);
      }
      .dash-equipe .kt-pd-pill {
        min-width: 0; min-height: 52px; padding: 4px 0; border: 0; border-radius: 10px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        background: transparent; color: var(--n-600); font-family: var(--sans); cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .dash-equipe .kt-pd-pill .w { font-size: 11px; line-height: 1.2; }
      .dash-equipe .kt-pd-pill .d { font-size: 17px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
      .dash-equipe .kt-pd-pill.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(10,15,13,0.08); }
      .dash-equipe .kt-pd-days[data-kw-lens] .kt-pd-pill.on { background: transparent; box-shadow: none; }
      .dash-equipe .kt-pd-pill.today .d { color: var(--atlas); }
      .dash-equipe .kt-pd-pill.is-closed .d { color: var(--n-500); font-weight: 500; }
      .dash-equipe .kt-pd-pill:focus-visible { outline: 2px solid var(--atlas); outline-offset: 1px; }
      /* Une règle globale donne 96 px de marge haute et basse à tout <section>. */
      .dash-equipe .kt-pd-panel { padding: 0; margin: 0; }
      .dash-equipe .kt-pd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 2px 10px; }
      .dash-equipe .kt-pd-head > div { min-width: 0; }
      .dash-equipe .kt-pd-head strong { display: block; font-size: 15px; font-weight: 600; color: var(--ink); }
      .dash-equipe .kt-pd-head strong::first-letter { text-transform: uppercase; }
      .dash-equipe .kt-pd-head span { display: block; margin-top: 2px; font-size: 12px; color: var(--n-500); overflow-wrap: anywhere; }
      .dash-equipe .kt-pd-head .kt-pd-sum { flex: none; margin-top: 2px; font-size: 12px; color: var(--n-600); text-align: end; }
      .dash-equipe .kt-pd-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .dash-equipe .kt-pd-row {
        width: 100%; min-height: 58px; padding: 9px 12px; box-sizing: border-box;
        display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px;
        border: 1px solid var(--n-200); border-radius: 12px; background: var(--surface);
        color: var(--ink); font-family: var(--sans); text-align: start; cursor: pointer;
        transition: border-color 140ms, background 140ms; -webkit-tap-highlight-color: transparent;
      }
      .dash-equipe .kt-pd-row:hover:not(:disabled) { border-color: var(--atlas); }
      .dash-equipe .kt-pd-row:focus-visible { outline: none; border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.12); }
      .dash-equipe .kt-pd-row:disabled { opacity: 0.55; cursor: default; }
      .dash-equipe .kt-pd-row.on { border-color: rgba(11,110,79,0.35); background: rgba(11,110,79,0.055); }
      .dash-equipe .kt-pd-row.off { background: var(--paper-soft); }
      .dash-equipe .kt-pd-row .eq-av { width: 32px; height: 32px; }
      .dash-equipe .kt-pd-who { min-width: 0; }
      .dash-equipe .kt-pd-who b, .dash-equipe .kt-pd-who small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dash-equipe .kt-pd-who b { font-size: 14px; font-weight: 600; }
      .dash-equipe .kt-pd-who small { margin-top: 1px; font-size: 12px; color: var(--n-500); }
      .dash-equipe .kt-pd-when { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
      .dash-equipe .kt-pd-t { font-family: var(--mono); font-size: 13.5px; font-weight: 500; white-space: nowrap; }
      .dash-equipe .kt-pd-t .kt-sh-next { margin-inline-start: 4px; }
      .dash-equipe .kt-pd-dur, .dash-equipe .kt-pd-rest { font-size: 12px; color: var(--n-500); }
      .dash-equipe .kt-pd-add { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: var(--atlas); }
      /* L'éditeur ouvert depuis une ligne : champs et boutons au pouce, et des
         champs à 16 px pour qu'iOS ne zoome pas en y entrant. */
      .kt-shpop { width: min(320px, calc(100vw - 20px)); box-sizing: border-box; }
      .kt-shpop-times input { min-height: 44px; font-size: 16px; }
      .kt-shpop-week { min-height: 44px; margin: 4px 0 8px; font-size: 13px; }
      .kt-shpop-week input { width: 20px; height: 20px; }
      .kt-shpop-b { min-height: 44px; font-size: 13px; }
      body.fusion-mode .dash-equipe .kt-pd-row { background: #0F0F0F; color: var(--paper); border-color: rgba(125,242,176,0.18); }
      body.fusion-mode .dash-equipe .kt-pd-row.on { background: rgba(125,242,176,0.07); }
    }
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
    [data-kt-form] .kt-fseclabel { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; color: var(--n-500); text-transform: uppercase; margin-bottom: 9px; }
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
    .kt-pf-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; color: var(--n-500); text-transform: uppercase; margin-bottom: 8px; }
    .kt-pf-row { display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: baseline; padding: 4px 0; }
    .kt-pf-l { font-size: 12px; color: var(--n-500); }
    .kt-pf-v { font-size: 13px; color: var(--ink); word-break: break-word; }
    .kt-tag { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.04em; }
    .kt-tag-ok      { background: var(--mint-soft); color: var(--atlas); border: 1px solid rgba(11,110,79,0.18); }
    .kt-tag-pend    { background: var(--warn-soft); color: var(--warn-ink); border: 1px solid color-mix(in srgb, var(--warn-ink) 25%, transparent); }
    .kt-tag-neutral { background: var(--paper-soft); color: var(--n-600); border: 1px solid var(--n-200); }
    .kt-langchip { background: var(--paper-soft); border: 1px solid var(--n-200); padding: 2px 7px; border-radius: 5px; font-size: 11px; color: var(--n-700); }
    /* Phone: the contract row put a select and two date inputs in three
       100 px columns, and iOS date fields overflowed them. Fields stack, and
       16 px text keeps Safari from zooming the page on focus. */
    @media (max-width: 560px) {
      [data-kt-form] .kt-fgrid-2, [data-kt-form] .kt-fgrid-3, .kt-qe-form .kt-fgrid-2 { grid-template-columns: 1fr; }
      [data-kt-form] .kt-frow, .kt-pf-row { grid-template-columns: 1fr; gap: 6px; }
      [data-kt-form] input, [data-kt-form] select, [data-kt-form] textarea, .kt-qe-form input, .kt-qe-form select { min-width: 0; font-size: 16px; }
    }
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
        venueSlug: teamSlug(),
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
        name: [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || '·',
        role: m.function ? jobName(m.function) : jobName(m.department || '', 'dept'),
        avatar: String(m.firstName || '?').trim().charAt(0).toUpperCase() || '?',
        status: memberDutyStatus(m, hours, todayKey),
        hoursToday: liveMember(m.id)
          && ['on-duty', 'on-pause'].includes(liveMember(m.id).status)
          ? Math.max(0.01, +((hours[m.id] || {})[todayKey]) || 0.01)
          : (+((hours[m.id] || {})[todayKey]) || 0),
      }));
    } catch (_) { return []; }
  }
  /* Public, read-only day snapshot for reports and the assistant.  Historical
   * reports must not reuse `roster().hoursToday`: that would quietly attach
   * today's hours to an older Z report.  This adapter reads the same realised
   * hours and published/draft planning grids as the Planning page, for the
   * requested calendar day, and says exactly which source each figure came
   * from. */
  function daySnapshot(dayKey) {
    try {
      dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? String(dayKey) : toISO(new Date());
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [];
      const realised = getHours(key) || {}, shifts = getShifts(key) || {};
      return members.map((m) => {
        const shift = normShift((shifts[m.id] || {})[dayKey]);
        let plannedHours = 0;
        if (shift && !shift.off) {
          const from = hhmmToMin(shift.start), to = hhmmToMin(shift.end);
          plannedHours = Math.max(0, (to > from ? to - from : 1440 - from + to) / 60);
        }
        return {
          id: m.id,
          name: memberFullName(m) || '·',
          role: m.function || m.department || m.role || '',
          plannedStart: shift && !shift.off ? shift.start : '',
          plannedEnd: shift && !shift.off ? shift.end : '',
          plannedHours: Math.round(plannedHours * 100) / 100,
          workedHours: Math.max(0, +((realised[m.id] || {})[dayKey]) || 0),
          dayOff: !!(shift && shift.off),
        };
      });
    } catch (_) { return []; }
  }
  /* Read-only planning evidence for the morning briefing. A draft is not a
   * promise to the team: only the frozen published grid may prove that an open
   * service is staffed. Names are reduced to first names at this boundary so
   * the briefing never receives contracts, pay, codes or full identities. */
  function planningDay(dayKey) {
    try {
      dayKey = /^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || '')) ? String(dayKey) : toISO(new Date());
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [];
      const planning = window.__kiwiTeamV2.planningByVenue[key] || {};
      const published = planning.publishingEnabled === true && planning.publishedShifts && typeof planning.publishedShifts === 'object';
      const shifts = published ? planning.publishedShifts : {};
      const configured = published && members.some((m) => Object.prototype.hasOwnProperty.call(shifts[m.id] || {}, dayKey));
      return {
        day: dayKey, configured: !!configured, published: !!published,
        members: members.map((m) => {
          const shift = normShift((shifts[m.id] || {})[dayKey]);
          return {
            id: String(m.id || ''),
            firstName: String(m.firstName || memberFullName(m) || '').trim().split(/\s+/)[0].slice(0, 40),
            start: shift && !shift.off ? shift.start : '', end: shift && !shift.off ? shift.end : '', off: !!(shift && shift.off)
          };
        }).filter((m) => m.id)
      };
    } catch (_) { return { day: String(dayKey || ''), configured: false, published: false, members: [] }; }
  }
  /* Reservations consume the SAME planning grid as Paie, never a second staff
   * calendar.  A slot is covered only when a floor-capable team member's
   * planned shift spans the whole booking.  `configured` stays false when the
   * owner has not filled that day yet, so an incomplete planning cannot close
   * the public diary by accident. */
  function bookingCoverage(startAt, endAt) {
    try {
      const venue = window.KiwiVenue?.getCurrentVenueData?.() || {};
      const key = teamKey(venue), members = getMembers(key) || [], shifts = getShifts(key) || {};
      const start = new Date(+startAt || 0), currentDay = toISO(start), previousDay = toISO(addDays(fromISO(currentDay), -1));
      const days = [previousDay, currentDay], currentConfigured = members.some((m) => Object.prototype.hasOwnProperty.call(shifts[m.id] || {}, currentDay));
      const floor = members.filter((m) => {
        const role = m.role || m.function || m.department || '';
        return window.KiwiRoles?.isService ? window.KiwiRoles.isService(role) : /serveur|service|salle|rang|ma[iî]tre|barista|barman|accueil|h[oô]te|manager|propri[eé]taire|staff|[eé]quipier/i.test(role);
      });
      const covered = floor.filter((m) => days.some((day) => {
        const shift = normShift((shifts[m.id] || {})[day]);
        if (!shift || shift.off) return false;
        const a = fromISO(day), from = hhmmToMin(shift.start), to = hhmmToMin(shift.end);
        a.setHours(Math.floor(from / 60), from % 60, 0, 0);
        const z = new Date(a); z.setMinutes(z.getMinutes() + (to > from ? to - from : 1440 - from + to));
        return a.getTime() <= +startAt && z.getTime() >= +endAt;
      })).map((m) => ({ id: m.id, name: memberFullName(m), role: m.function || m.department || m.role || '' }));
      return { configured: currentConfigured || covered.length > 0, members: covered };
    } catch (_) { return { configured: false, members: [] }; }
  }
  /* La masse salariale d'une liste de journées, pour le résultat net de
   * Marges (assets/charges.js). Exactement le calcul de Paie & planning, sur
   * le même roster et les mêmes heures : un salaire saisi une fois dans Équipe
   * n'est jamais ressaisi ailleurs, et les deux pages ne peuvent pas diverger.
   * null quand personne n'a ni salaire ni taux horaire : « pas de personnel
   * connu » n'est pas « personnel gratuit ». */
  function labour(days) {
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || null;
    if (!venue) return null;
    const members = getMembers(teamKey(venue));
    const list = (Array.isArray(days) ? days : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const f = payrollFigures(members, teamKey(venue), { days: list });
    if (!f.salaried && !f.rated) return null;
    return { baseDue: f.baseDue, variablePay: f.variablePay, baseMass: f.baseMass, share: f.share,
      salaried: f.salaried, rated: f.rated, members: members.length, totalHours: f.totalHours };
  }
  window.KiwiTeam = Object.assign(window.KiwiTeam || {}, { importMembers, roster, daySnapshot, planningDay, bookingCoverage, labour });
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
