/* Profile UI and its local FR/EN/AR pack. Loaded immediately after team.js.
 * Shared scalar copies are updated synchronously by the private core. */
(function (core) {
  'use strict';
  const memberState = window.Kiwi?.__teamMemberState;
  if (!core) return;
  var Kiwi = core.Kiwi;
  var handlers = core.handlers;
  var modal = core.modal;
  var toast = core.toast;
  var trLang = core.trLang;
  var catalogFor = core.catalogFor;
  var tradeKey = core.tradeKey;
  var CONTRACT_TYPES = core.CONTRACT_TYPES;
  var LANGS = core.LANGS;
  var AVATAR_TONES = core.AVATAR_TONES;
  var AVATAR_COLORS = core.AVATAR_COLORS;
  var initials = core.initials;
  var esc = core.esc;
  var memberFullName = core.memberFullName;
  var teamKey = core.teamKey;
  var getMembers = core.getMembers;
  var getHours = core.getHours;
  var toISO = core.toISO;
  var fmtMad = core.fmtMad;
  var svgIcon = core.svgIcon;
  var IC = core.IC;
  var activeFilters = core.activeFilters;
  var memberMatchesFilters = core.memberMatchesFilters;
  var memberDutyStatus = core.memberDutyStatus;
  var isCustomVenue = core.isCustomVenue;
  var teamSlug = core.teamSlug;
  var liveMember = core.liveMember;
  var makeCode = core.makeCode;
  var memberCode = core.memberCode;
  var codeUnresolved = core.codeUnresolved;
  var rosterWriteBlocked = core.rosterWriteBlocked;
  var saveCustomTeams = core.saveCustomTeams;
  var mergeRemoved = core.mergeRemoved;
  var render = core.render;
  var MODAL_CSS = core.MODAL_CSS;
  var deptForFunction = core.deptForFunction;
  var buildPeriod = core.buildPeriod;
  var fmtHours = core.fmtHours;
  var isCode = core.isCode;
  var fromISO = core.fromISO;
  var dateLocale = core.dateLocale;
  var contractWeekHours = core.contractWeekHours;
  var pageActive, liveTeam;
  core.onState(function (active, team) { pageActive = active; liveTeam = team; });

  /* team-part:locale */
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
      vDuplicateCodeNamed: (a, b) => `Le code de ${a} est déjà celui de ${b}. Choisissez-en un autre.`, vReservedCode: 'Le code 0001 ouvre l\'écran cuisine de la caisse. Choisissez-en un autre.',
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
      precisionHint: 'Saisie manuelle arrondie à 0,01 h (36 s). Pointages calculés à la seconde, affichage en heures arrondi.',
      plHint: 'Cliquez une case pour saisir un service ou un repos. Saisie manuelle arrondie à 0,01 h (36 s). Pointages calculés à la seconde, affichage en heures arrondi.',
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
      vDuplicateCodeNamed: (a, b) => `${a}'s code is already ${b}'s code. Choose another one.`, vReservedCode: 'The code 0001 opens the till\'s kitchen screen. Choose another one.',
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
      precisionHint: 'Manual entries rounded to 0.01 h (36 s). Attendance calculated to the second, displayed hours rounded.',
      plHint: 'Click a cell to set a shift or time off. Manual entries rounded to 0.01 h (36 s). Attendance calculated to the second, displayed hours rounded.',
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
      vDuplicateCodeNamed: (a, b) => `رمز ${a} هو نفسه رمز ${b}. اختر رمزاً آخر.`, vReservedCode: 'الرمز 0001 يفتح شاشة المطبخ في الصندوق. اختر رمزاً آخر.',
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
      precisionHint: 'تُقرّب الإدخالات اليدوية إلى 0.01 ساعة (36 ثانية). يُحسب الحضور بالثانية وتُقرّب الساعات المعروضة.',
      plHint: 'انقر على خانة لإدخال وردية أو يوم راحة. تُقرّب الإدخالات اليدوية إلى 0.01 ساعة (36 ثانية). يُحسب الحضور بالثانية وتُقرّب الساعات المعروضة.',
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

  /* /team-part:locale */

  /* team-part:profiles */
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
    const period = buildPeriod(memberState.current().periodKind || 'week');
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
    const deptList = ['<button data-activation=write class="eq-pill' + (!activeFilters.dept ? ' on' : '') + '" type="button" data-action="kt-filter-dept" data-arg="">' + esc(T.filterAllDept) + '</button>',
      ...cat.departments.map(d => `<button data-activation=write class="eq-pill${activeFilters.dept === d ? ' on' : ''}" type="button" data-action="kt-filter-dept" data-arg="${esc(d)}">${esc(jobName(d, 'dept'))}</button>`)].join('');
    const ctList = ['<button data-activation=write class="eq-pill' + (!activeFilters.contract ? ' on' : '') + '" type="button" data-action="kt-filter-contract" data-arg="">' + esc(T.filterAllContract) + '</button>',
      ...CONTRACT_TYPES.map(c => `<button data-activation=write class="eq-pill${activeFilters.contract === c ? ' on' : ''}" type="button" data-action="kt-filter-contract" data-arg="${esc(c)}">${esc(contractLabel(T, c))}</button>`)].join('');

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
                <button data-activation=write class="kb atlas" type="button" data-action="kt-add-member" style="margin-top:12px;">${svgIcon(IC.plus, 13)}${esc(T.addMember)}</button>
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
              <button data-activation=write class="eq-icon-btn" type="button" data-action="kt-edit-member"  data-arg="${esc(m.id)}" aria-label="${esc(T.editBtn)}" title="${esc(T.editBtn)}">${svgIcon(IC.edit, 14)}</button>
              <button data-activation=write class="eq-icon-btn" type="button" data-action="kt-delete-member" data-arg="${esc(m.id)}" aria-label="${esc(T.deleteBtn)}" title="${esc(T.deleteBtn)}" style="color:var(--n-500);">${svgIcon(IC.trash, 14)}</button>
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

  /* /team-part:profiles */

  /* team-part:editor */
  /* GENERATED SHARED KiwiStaffCredential BEGIN */
  /* Copy of functions/api/_rules-staff-credential.js made by tools/build-shared-rules.mjs. Edit the source, then run the tool. */
  var KiwiStaffCredential = (function () {
    // Preserve the server verifier precedence, including its trim after fallback.
    const canonicalCode = (member) => {
      return String((member && (member.pinCode || member.password)) || '').trim();
    };

    const normalizeMember = (member) => {
      if (!member || typeof member !== 'object') return member;
      const pinCode = canonicalCode(member);
      return { ...member, pinCode, password: pinCode };
    };
    return { canonicalCode, normalizeMember };
  })();
  /* GENERATED SHARED KiwiStaffCredential END */
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
    /* The message is the field's accessible DESCRIPTION, so a screen reader
       reads it with the field; inside the label it only lengthened the name. */
    if (err && !err.id) err.id = 'kt-ed-err-' + name;
    const describe = (el) => {
      if (!el || !err) return;
      const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== err.id);
      if (msg) ids.push(err.id);
      if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
    };
    if (input) {
      if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      describe(input);
      const wrap = input.closest('.kiwi-select');
      if (wrap) {
        wrap.classList.toggle('is-invalid', !!msg);
        const trigger = wrap.querySelector('.kiwi-select-trigger');
        if (trigger) { if (msg) trigger.setAttribute('aria-invalid', 'true'); else trigger.removeAttribute('aria-invalid'); describe(trigger); }
      }
    }
    if (err) { err.textContent = msg || ''; err.hidden = !msg; err.setAttribute('aria-hidden', 'true'); }
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
      password: makeCode(getMembers(venueType)),
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
                <input class="kt-ed-in kt-ed-pin" type="text" name="password" value="${esc(isCode(KiwiStaffCredential.canonicalCode(m)) ? KiwiStaffCredential.canonicalCode(m) : '')}" data-kt-pwd
                  inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" spellcheck="false"
                  placeholder="${esc(isCode(KiwiStaffCredential.canonicalCode(m)) ? '' : (editing ? T.codeKeep : '0000'))}" />
                <span class="kt-ed-err" data-err-for="password" hidden></span>
              </label>
              <div class="kt-ed-code-acts">
                <button data-activation=write type="button" class="kt-ed-btn" data-action="kt-pwd-gen">${svgIcon(IC.refresh, 16)}<span>${esc(T.generate)}</span></button>
                <button type="button" class="kt-ed-btn" data-action="kt-pwd-copy">${svgIcon(IC.copy, 16)}<span>${esc(T.copy)}</span></button>
              </div>
              <p class="kt-ed-hint">${esc(T.edCodeHint)}</p>
            </div>
          </aside>
        </form>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>${esc(T.cancel)}</button>
        <button data-activation=write class="kb atlas" data-action="kt-submit-member">${svgIcon(IC.check, 13)}${esc(editing ? T.submitEdit : T.submitAdd)}</button>
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
    if (input) input.value = makeCode(getMembers((mdl.el.__ktState || {}).venueType));
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
    const effectiveCode = code || KiwiStaffCredential.canonicalCode(prev);
    const holder = effectiveCode && members.find((x) => x.id !== st.memberId && KiwiStaffCredential.canonicalCode(x) === effectiveCode);
    const who = (String(data.firstName || '') + ' ' + String(data.lastName || '')).trim() || '?';
    if (holder) errs.push(['password', T.vDuplicateCodeNamed(who, memberFullName(holder))]);
    else if (effectiveCode && memberState.reservedCode(effectiveCode)) errs.push(['password', T.vReservedCode]);
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
    const savedCode = code || KiwiStaffCredential.canonicalCode(prev) || (prev && prev.hasCode ? '' : makeCode(members));
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
      password: savedCode,
      pinCode: savedCode,
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
      const h = memberState.current().hoursByVenue[venueType] || (memberState.current().hoursByVenue[venueType] = {});
      h[member.id] = {};
      // Ni le code ni le mot de passe dans un toast : il reste à l'écran, souvent
      // celui du comptoir. Le code se lit et se copie sur la fiche du membre.
      Kiwi.toast(T.tAdded(memberFullName(member)), { type: 'success', desc: T.tAddedDesc(member.email) });
    }
    saveCustomTeams();
    mdl.close();
    window.__kiwiTeamModal = null;
    if (pageActive) render();
    /* The re-render removed the button that opened the form, so keyboard focus
       fell to <body>: put it back on the member just saved (or the add button). */
    requestAnimationFrame(() => {
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected;
      if (!lost) return;
      const id = (window.CSS && CSS.escape) ? CSS.escape(member.id) : member.id;
      const next = document.querySelector(`[data-action="kt-edit-member"][data-arg="${id}"]`) || document.querySelector('[data-action="kt-add-member"]');
      try { if (next) next.focus({ preventScroll: false }); } catch (_) {}
    });
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
    const code = isCode(KiwiStaffCredential.canonicalCode(m)) ? KiwiStaffCredential.canonicalCode(m) : '';
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
        <button data-activation=write class="kb ghost" data-action="kt-delete-member" data-arg="${esc(m.id)}" style="color:var(--danger);">${svgIcon(IC.trash, 13)}${esc(T.deleteBtn)}</button>
        <button data-activation=write class="kb atlas" data-action="kt-edit-member" data-arg="${esc(m.id)}">${svgIcon(IC.edit, 13)}${esc(T.editBtn)}</button>
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
        <button data-activation=write class="kb" data-action="kt-confirm-delete" data-arg="${esc(id)}" style="background:var(--danger); color:#fff;">${svgIcon(IC.trash, 13)}${esc(T.delConfirm)}</button>
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
    const h = memberState.current().hoursByVenue[venueType] || {};
    delete h[id];
    const root = memberState.current();
    root.removedByVenue[venueType] = mergeRemoved(root.removedByVenue[venueType], [{ id, ts: Date.now() }]);
    saveCustomTeams();
    if (window.__kiwiTeamConfirmModal) { try { window.__kiwiTeamConfirmModal.close(); } catch (_) {} window.__kiwiTeamConfirmModal = null; }
    if (window.__kiwiTeamProfileDrawer) { try { window.__kiwiTeamProfileDrawer.close(); } catch (_) {} window.__kiwiTeamProfileDrawer = null; }
    Kiwi.toast(T.tDeleted(memberFullName(removed)), { type: 'success' });
    if (pageActive) render();
  };

  /* /team-part:editor */

  core.install({ t, jobName, renderProfilesPane, renderMembersTable, langLabel, contractLabel, rolePreview, openMemberModal });
})(window.Kiwi && window.Kiwi.__teamProfileCore);
