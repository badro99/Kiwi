import {} from './team/member-state.js?v=9';
import {} from './team/venue-scope.js?v=6';
import {} from './team/invitations.js?v=8';
import {} from './team/roster-list.js?v=6';
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
 *                   UI and local translations live in team/profile-ui.js.
 *   2. HEURES     — period-bound hours-worked data entry (week / quinzaine
 *                   / month). Quick-entry modal, period validation. The
 *                   grid, the planning and Paie & planning live in
 *                   assets/team-hours.js, loaded after the profile part;
 *                   the period helpers and the payroll maths stay here.
 *   3. RÔLES      — venue-type-aware function & department catalogue. A
 *                   restaurant owner never sees "Masseur"; a pharmacy
 *                   never sees "Serveur". Reactive — switching the
 *                   venue refreshes all dropdowns.
 *
 * State is in-memory (memberState.current()) and wipes on page reload.
 * Loads AFTER venues.js, so this file's nav-equipe handler wins.
 * ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  // Bound transport and JSON reads, even when a transport ignores abort.
  function fetchDeadline(url, options, readBody) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer;
    var request = new Promise(function (resolve, reject) {
      try { resolve(fetch(url, Object.assign({}, options, controller ? {signal: controller.signal} : {}))); }
      catch (error) { reject(error); }
    }).then(function (response) {
      if (readBody === false || !response || typeof response.json !== 'function') return response;
      return response.json().then(function (data) {
        response.json = function () { return Promise.resolve(data); }; return response;
      }, function (error) {
        response.json = function () { return Promise.reject(error); }; return response;
      });
    });
    var deadline = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var error = new Error('request-timeout'); error.code = 'timeout';
        reject(error);
        if (controller) controller.abort();
      }, 12000);
    });
    return Promise.race([request, deadline]).finally(function () { clearTimeout(timer); });
  }

  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const { handlers, modal, toast } = Kiwi;
  /* Ce que assets/team-hours.js dépose ici en se chargeant (voir plus bas,
   * « HEURES, PLANNING, PAIE »). Vide tant qu'il n'a pas tourné. */
  const teamHours = {};
  const teamProfiles = {};

  /* ═══════════════ i18n — local pack ═══════════════ */
  const trLang = () => (window.KiwiI18n?.getLang?.() || 'fr');
  /* team-part:locale */
  function t(...args) { return teamProfiles.t(...args); }
  function jobName(...args) { return teamProfiles.jobName(...args); }
  /* /team-part:locale */

  /* team-part:catalog */
  const { CATALOG, unionCatalog, catalogFor, FN_DEPT, deptForFunction, tradeKey } = window.KiwiTeamCatalog;
  /* /team-part:catalog */

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
  function makeCode(...args) { return invitations.makeCode(...args); }
  function isCode(...args) { return memberState.isCode(...args); }

  /* Persistence documentation: assets/team/member-state.js (memberCode). */   function memberCode(...args) { return memberState.memberCode(...args); }
  function codeUnresolved(...args) { return memberState.codeUnresolved(...args); }
  function rosterHasUnresolved(...args) { return memberState.rosterHasUnresolved(...args); }
  /* La copie qui va sur le disque : sans le code des salariés que le serveur a. */
  function diskMembers(...args) { return memberState.diskMembers(...args); }
  /* La copie qui part sur le réseau : `hasCode` est un fait local, il ne voyage pas. */
  function outboundMembers(...args) { return memberState.outboundMembers(...args); }
  /* La fusion garde « le nôtre d'abord » ; elle n'oublie pas pour autant un code
     que seul l'autre côté porte. */
  function fillCodes(...args) { return memberState.fillCodes(...args); }
  /* Ce que dit la copie serveur du patron : note ce que le serveur détient
     (`serverCodes`), rend les codes aux salariés qui l'attendent, et lâche le
     drapeau de ceux dont la copie serveur est lue en clair et n'a PAS de code
     (elle seule fait foi : sinon ils bloqueraient la remontée pour toujours).
     Une copie sans AUCUN code lisible est une copie expurgée (compte non patron) :
     on n'en conclut rien. Résultat : { members, serverCodes }. */
  function applyServerCodes(...args) { return memberState.applyServerCodes(...args); }
  /* team-owner:memberState:serverCodes */
   // id → code que le serveur détient (jamais écrit sur le disque)

  /* Persistence documentation: assets/team/member-state.js (publishPins). */   function publishPins(...args) { return memberState.publishPins(...args); }

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
  const venueScope = window.KiwiTeamParts.venueScope.create({
    cleanRemoved: (...args) => cleanRemoved(...args),
    mergeByDay: (...args) => mergeByDay(...args),
    cleanLocks: (...args) => cleanLocks(...args),
  });
  const invitations = window.KiwiTeamParts.invitations.create({
    ensureVenueData: (...args) => ensureVenueData(...args),
    teamKey: (...args) => teamKey(...args),
    teamSlug: (...args) => teamSlug(...args),
    saveCustomTeams: (...args) => saveCustomTeams(...args),
    render: (...args) => render(...args),
    AVATAR_TONES,
  });
  const memberState = window.KiwiTeamParts.memberState.create({
    fetchDeadline: (...args) => fetchDeadline(...args),
    teamKey: (...args) => teamKey(...args),
    teamVenueKey: (...args) => teamVenueKey(...args),
    teamSlug: (...args) => teamSlug(...args),
    memberBelongsToStore: (...args) => memberBelongsToStore(...args),
    scopeTeamDoc: (...args) => scopeTeamDoc(...args),
    persistableTeamKey: (...args) => persistableTeamKey(...args),
    memberFullName: (...args) => memberFullName(...args),
    restorePeriodLock: (...args) => restorePeriodLock(...args),
    buildPeriod: (...args) => buildPeriod(...args),
    render: (...args) => render(...args),
    trLang: (...args) => trLang(...args),
    toast: (...args) => toast(...args),
    seedFor: (...args) => seedFor(...args),
    seedHours: (...args) => seedHours(...args),
  });
  const periodOffsets = memberState.periodOffsets;
  Kiwi.__teamMemberState = memberState;

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
  function getShifts(...args) { return memberState.getShifts(...args); }
  /* Les deux grilles — planifié et réalisé — partagent le même sélecteur de
   * période : elles doivent toujours parler de la même semaine. */
  function periodPillsHtml(T) {
    const kind = memberState.current().periodKind || 'week';
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
  function teamKey(...args) { return venueScope.teamKey(...args); }
  /* team-owner:venueScope:DEMO_TYPE_KEYS */
  /* venues.js les déclare transitoires et « never persisted » : 'scoped' est la
   * vue opérateur sur le client de quelqu'un d'autre, 'own' un placeholder de
   * session. Ils arrivaient pourtant dans kiwiTeamV2:custom — de l'état
   * opérateur écrit dans le stockage d'un commerçant. On ne les lit ni ne les
   * écrit plus, ce qui purge aussi les seaux déjà déposés. */
  /* team-owner:venueScope:TRANSIENT_KEYS */
  const persistableTeamKey = (...args) => venueScope.persistableTeamKey(...args);
  /* team-owner:memberState:LS_TEAM */
  /* Le roster en mémoire appartient à UN compte. loadCustomTeams() le lit à
   * l'exécution du script, avant que /api/me ait répondu : si c'est un AUTRE
   * compte qui se connecte, identity.js purge puis recharge, et c'est
   * `pagehide → saveCustomTeams → persistTeams` qui réécrivait alors l'ancien
   * roster (codes compris) dans le stockage du nouveau compte. Deux gardes :
   *   · le drapeau `__kiwiTenantPurging` (posé par tenant-purge.js / identity.js
   *     AVANT de toucher au stockage) rend toute écriture muette ;
   *   · le disque est estampillé du compte (`account`) : un roster qui n'est pas
   *     celui du compte courant n'est ni lu ni réécrit. */
  function teamAccount(...args) { return memberState.teamAccount(...args); }
  /* team-owner:memberState:ROSTER_ACCOUNT */
  function rosterWriteBlocked(...args) { return memberState.rosterWriteBlocked(...args); }
  function loadCustomTeams(...args) { return memberState.loadCustomTeams(...args); }
  /* team-owner:memberState:REMOVED_CAP */
  function cleanRemoved(...args) { return memberState.cleanRemoved(...args); }
  function mergeRemoved(...args) { return memberState.mergeRemoved(...args); }
  /* team-owner:memberState:LOCK_KEY_RE */
  function cleanLocks(...args) { return memberState.cleanLocks(...args); }
  function mergeLocks(...args) { return memberState.mergeLocks(...args); }
  /* L'écriture locale, et rien d'autre. Séparée de saveCustomTeams() parce que
   * la copie serveur, en redescendant, doit pouvoir se poser sans redéclencher
   * une remontée : sinon deux appareils se renvoient la balle indéfiniment. */
  function persistTeams(...args) { return memberState.persistTeams(...args); }
  function afterTeamChange(...args) { return memberState.afterTeamChange(...args); }
  function saveCustomTeams(...args) { return memberState.saveCustomTeams(...args); }
  loadCustomTeams();
  window.addEventListener('pagehide', saveCustomTeams);

  /* Persistence documentation: assets/team/member-state.js (teamVenueKey). */   function teamVenueKey(...args) { return venueScope.teamVenueKey(...args); }

  /* A member belongs to one store, never to the whole account. Older records
   * only carry `venueType` (the browser-local venue id); newer ones also carry
   * the stable store slug. Keep unknown legacy ids — another device cannot
   * resolve them — but reject an id we can positively resolve to another store.
   * This heals rosters that were merged before team documents became per-store
   * without guessing about records whose origin cannot be proved. */
  function teamSlug(...args) { return venueScope.teamSlug(...args); }
  function memberBelongsToStore(...args) { return venueScope.memberBelongsToStore(...args); }
  function scopeTeamDoc(...args) { return venueScope.scopeTeamDoc(...args); }

  /* Fusion. Union des membres, cet appareil prioritaire sur un id connu des deux
   * côtés. Un salarié supprimé ici et présent là-bas REVIENT — c'est assumé :
   * entre ressusciter une ligne qu'il faut resupprimer et perdre un salarié avec
   * son contrat et ses heures, seul le second est irréparable.
   *
   * Heures et plannings sont fusionnés case par case (salarié × jour), pas en
   * bloc : deux responsables qui remplissent deux semaines différentes du même
   * planning doivent obtenir les deux semaines, pas la dernière enregistrée. */
  function mergeByDay(...args) { return memberState.mergeByDay(...args); }
  function mergeTeamDoc(...args) { return memberState.mergeTeamDoc(...args); }

  /* team-owner:memberState:teamCloud */
  function teamCloudInit(...args) { return memberState.teamCloudInit(...args); }
  /* team-owner:memberState:heldPush */
   // une remontée a été retenue faute de codes : à relancer une fois le roster complet
  /* Rend aux salariés leur code depuis la copie serveur du patron (le disque ne
   * le garde plus), et note ce que le serveur détient. Lecture directe : un
   * `pull` conclut « déjà à jour » dès que la révision est connue, donc il ne
   * rendrait jamais un code que la copie locale n'a plus. Une panne ne change
   * rien : les salariés restent « non résolus », et RIEN ne part (canPush /
   * publishPins), donc le serveur ne perd rien. */
  /* team-owner:memberState:teamReadFailed */
  function teamReadTimedOut(...args) { return memberState.teamReadTimedOut(...args); }
  function hydrateCodes(...args) { return memberState.hydrateCodes(...args); }
  function teamCloudBind(...args) { return memberState.teamCloudBind(...args); }
  function teamCloudPush(...args) { return memberState.teamCloudPush(...args); }

  function ensureVenueData(...args) { return memberState.ensureVenueData(...args); }
  function getMembers(...args) { return memberState.getMembers(...args); }
  function getHours(...args) { return memberState.getHours(...args); }

  /* ═══════════════ PERIOD UTILS ═══════════════ */
  function pad(n) { return String(n).padStart(2, '0'); }
  function fmtFr(d) { return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; }
  function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function buildPeriod(kind) {
    /* Le jour du magasin (sa zone, sa bascule), pas la date de l'appareil. */
    const storeDay = window.KiwiPlanningCore?.storeToday?.();
    const today = storeDay ? fromISO(storeDay) : new Date(); today.setHours(0, 0, 0, 0);
    kind = ['week', 'fortnight', 'month'].includes(kind) ? kind : 'week';
    const core = window.KiwiPlanningCore?.calendarPeriod?.(kind, storeDay || toISO(today), periodOffsets[kind] || 0);
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
    const kind = memberState.current().periodKind || 'week';
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
  let activeFilters = { search: '', dept: '', contract: '', lang: '' };
  let pageActive = false;
  const profileStateListeners = [];
  function noteProfileState() { memberState.setPageActive(pageActive); invitations.setPageActive(pageActive); profileStateListeners.forEach(fn => fn(pageActive, liveTeam)); }
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
    if (teamHours.isShiftPopOpen && teamHours.isShiftPopOpen()) return true;
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
    if (document.hidden || liveTeamBusy || !isCustomVenue()) return;
    const merchant = teamSlug();
    if (!merchant) return;
    liveTeamBusy = true;
    return fetchDeadline('/api/team/live?merchant=' + encodeURIComponent(merchant), {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then((response) => response.ok ? response.json() : null).then((data) => {
      if (!data || !data.ok || data.merchant !== merchant) { liveTeamDelay = Math.min(120000, liveTeamDelay * 2); return; }
      memberState.resetReadFailure();
      const signature = JSON.stringify([merchant, data.members || [], data.pointedHours || {}, data.deferredPunches || {}, data.pendingCorrections || []]);
      /* Réponse identique à la précédente ⇒ rien à fusionner, rien à écrire.
         La fusion des heures pointées se faisait à CHAQUE réponse, donc
         persistTeams() réécrivait 70 ko de localStorage toutes les secondes
         pour reposer exactement les mêmes octets. */
      if (signature === liveTeamSignature) { liveTeamDelay = Math.min(120000, liveTeamDelay * 2); return; }
      liveTeamDelay = LIVE_TEAM_FAST_MS;
      liveTeamSignature = signature;
      liveTeam = { merchant, members: Array.isArray(data.members) ? data.members : [] }; noteProfileState();
      const venueKey = teamVenueKey();
      if (venueKey && data.pointedHours && typeof data.pointedHours === 'object') {
        const root = memberState.current();
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
        // Pointages envoyés plus tard depuis le téléphone : marqués sur la grille des heures.
        (root.deferredByVenue || (root.deferredByVenue = {}))[venueKey] = data.deferredPunches || {};
        (root.correctionsByVenue || (root.correctionsByVenue = {}))[venueKey] = data.pendingCorrections || [];
      }
      /* La signature est déjà posée plus haut : l'ancien test
         « signature !== liveTeamSignature » était donc toujours faux, et un
         pointage à la caisse n'arrivait jamais à l'écran tant que rien
         d'autre ne redessinait la page. Arrivé ici, quelque chose a changé. */
      applyLiveTeam();
    }).catch((error) => { teamReadTimedOut(error); liveTeamDelay = Math.min(120000, liveTeamDelay * 2); }).finally(() => { liveTeamBusy = false; });
  }
  /* Le pointage reprend à la seconde quand les données changent. Ailleurs — c'est
     à dire sur chacune des autres pages du tableau de bord, où ce module n'a
     rien à l'écran — la même seconde faisait une requête réseau et un tour de
     JSON.stringify sur toute l'équipe, pour personne. Et le premier chargement
     du tableau de bord, lui, a mieux à faire que ça pendant que les chiffres
     arrivent. On garde la seconde sur Équipe/Paie, on lève le pied partout
     ailleurs, et on s'arrête net quand l'onglet passe en arrière-plan. */
  const LIVE_TEAM_FAST_MS = 1000, LIVE_TEAM_IDLE_MS = 20000;
  let liveTeamTimer = null, liveTeamDelay = LIVE_TEAM_FAST_MS;
  function scheduleLiveTeam() {
    if (liveTeamTimer) { clearTimeout(liveTeamTimer); liveTeamTimer = null; }
    let hidden = false;
    try { hidden = !!document.hidden; } catch (_) {}
    if (hidden) return;
    const gate = document.querySelector('[data-kiwi-lock]');
    const locked = gate && gate.isConnected && gate.style.display !== 'none';
    const wait = locked ? 300000 : Math.max(pageActive ? LIVE_TEAM_FAST_MS : LIVE_TEAM_IDLE_MS, liveTeamDelay);
    liveTeamTimer = setTimeout(() => { Promise.resolve(pollLiveTeam()).finally(scheduleLiveTeam); }, window.KiwiPoll?.delay(wait) ?? wait);
  }
  function startLiveTeamPolling() {
    scheduleLiveTeam();
    function wakeTeam() {
      if (liveTeamTimer) clearTimeout(liveTeamTimer);
      liveTeamDelay = LIVE_TEAM_FAST_MS;
      if (document.hidden) { liveTeamTimer = null; return; }
      Promise.resolve(pollLiveTeam()).finally(scheduleLiveTeam);
    }
    try {
      document.addEventListener('visibilitychange', wakeTeam);
      document.addEventListener('kiwi:request-wake', wakeTeam);
      window.addEventListener('focus', wakeTeam);
    } catch (_) {}
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

  function memberMatchesFilters(...args) { return rosterList.memberMatchesFilters(...args); }

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
  const rosterList = window.KiwiTeamParts.rosterList.create({
    memberFullName: (...args) => memberFullName(...args),
    jobName: (...args) => jobName(...args),
    t: (...args) => t(...args),
    teamKey: (...args) => teamKey(...args),
    getMembers: (...args) => getMembers(...args),
    getHours: (...args) => getHours(...args),
    getShifts: (...args) => getShifts(...args),
    toISO: (...args) => toISO(...args),
    memberDutyStatus: (...args) => memberDutyStatus(...args),
    liveMember: (...args) => liveMember(...args),
    normShift: (...args) => normShift(...args),
    hhmmToMin: (...args) => hhmmToMin(...args),
    addDays: (...args) => addDays(...args),
    fromISO: (...args) => fromISO(...args),
    payrollFigures: (...args) => payrollFigures(...args),
    renderMembersTable: (...args) => renderMembersTable(...args),
    esc: (...args) => esc(...args),
    trLang: (...args) => trLang(...args),
    tradeKey: (...args) => tradeKey(...args),
    todayLongLabel: (...args) => todayLongLabel(...args),
    svgIcon: (...args) => svgIcon(...args),
    activeFilters,
    IC,
  });
  function showPage() {
    pageActive = true; noteProfileState();
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
        liveTeam = { merchant: '', members: [] }; noteProfileState(); liveTeamSignature = '';
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
    pageActive = false; noteProfileState();
    pageMode = null;
    if (unsubscribeVenue) { try { unsubscribeVenue(); } catch (_) {} unsubscribeVenue = null; }
  }
  window.__kiwiTeamDeactivate = deactivateTeam;

  function showDashboard() {
    if (!pageActive) return;
    pageActive = false; noteProfileState();
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
    { const root = memberState.current(); restorePeriodLock(root, root.periodKind || 'week', buildPeriod(root.periodKind || 'week')); }
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

  function rerenderProfilesGrid(...args) { return rosterList.rerenderProfilesGrid(...args); }

  /* ═══════════════ HEADER ═══════════════ */
  function renderHeader(...args) { return rosterList.renderHeader(...args); }

  /* ═══════════════ TABS ═══════════════ */
  function renderTabs(T) {
    return `
      <div class="eq-filters">
        <div class="eq-pill-row">
          <button data-activation=write class="eq-pill${activeTab === 'profiles' ? ' on' : ''}" type="button" data-action="kt-tab" data-arg="profiles">${esc(T.tabProfiles)}</button>
          <button data-activation=write class="eq-pill${activeTab === 'hours'    ? ' on' : ''}" type="button" data-action="kt-tab" data-arg="hours">${esc(T.tabHours)}</button>
        </div>
      </div>
    `;
  }

  /* ═══════════════ PROFILES PANE ═══════════════ */
  /* team-part:profiles */
  function renderProfilesPane(...args) { return teamProfiles.renderProfilesPane(...args); }
  function renderMembersTable(...args) { return teamProfiles.renderMembersTable(...args); }
  /* /team-part:profiles */

  /* ═══════════════ HEURES, PLANNING, PAIE → assets/team-hours.js ═══════════════
   * La grille des heures, le planning et son éditeur de service, l'import CSV
   * et la page Paie & planning vivent dans team-hours.js, chargé juste après
   * ce fichier. Ce module garde le roster et la publication des codes : y
   * toucher ne déplace plus une ligne de la paie, et l'inverse. Les deux
   * parlent par Kiwi.__teamCore (posé en fin de fichier) ; ces relais sont les
   * seuls appels de ce module vers la paie. Sans team-hours.js (fichier non
   * chargé), aucun éditeur de service ne peut être ouvert : le refermer ne
   * fait rien, et l'onglet Profils reste utilisable. */
  function renderHoursPane(...args) { return teamHours.renderHoursPane(...args); }
  function closeShiftPop() { if (teamHours.closeShiftPop) teamHours.closeShiftPop(); }
  function payrollAccess() { return teamHours.payrollAccess(); }
  function renderPayrollBody(...args) { return teamHours.renderPayrollBody(...args); }

  /* ═══════════════ DELEGATED HANDLERS ═══════════════ */
  handlers['kt-tab'] = (_el, kind) => {
    if (kind === 'profiles' || kind === 'hours') {
      activeTab = kind; rosterList.setActiveTab(kind);
      render();
    }
  };
  handlers['kt-filter-dept']     = (_el, v) => { activeFilters.dept = v || ''; render(); };
  handlers['kt-filter-contract'] = (_el, v) => { activeFilters.contract = v || ''; render(); };

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
  /* team-part:editor */
  function langLabel(...args) { return teamProfiles.langLabel(...args); }
  function contractLabel(...args) { return teamProfiles.contractLabel(...args); }
  function rolePreview(...args) { return teamProfiles.rolePreview(...args); }
  function openMemberModal(...args) { return teamProfiles.openMemberModal(...args); }
  /* /team-part:editor */

  /* ═══════════════ PAIE · le calcul ═══════════════
   * Le calcul reste ici, à côté de KiwiTeam.labour() qui le publie au résultat
   * net (charges.js) ; l'écran de paie, dans team-hours.js, le lit par
   * Kiwi.__teamCore. */
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
    // Centièmes de minute et centimes : arrondi unique, demi-centime supérieure.
    const worked = BigInt(Math.round(h * 6000)) * 7n;
    const covered = (+m.baseSalary || 0) > 0
      ? BigInt(Math.round(contractWeekHours(m) * 6000)) * BigInt(days ? days.length : 7) : 0n;
    const excess = worked > covered ? worked - covered : 0n;
    // Conserver aussi les taux importés plus précis qu'un centime par heure.
    const [mantissa, exponent = '0'] = String(rate).toLowerCase().split('e');
    const decimals = (mantissa.split('.')[1] || '').length - Number(exponent);
    const scale = 10n ** BigInt(Math.max(0, decimals));
    const rateCents = BigInt(mantissa.replace('.', '')) * 100n * (10n ** BigInt(Math.max(0, -decimals)));
    const denominator = 42000n * scale;
    return Number((excess * rateCents * 2n + denominator) / (denominator * 2n)) / 100;
  }
  const payCents = (n) => { const x = +n || 0, c = Math.round(Number(Math.abs(x).toExponential().replace(/e(.+)$/, (_, e) => 'e' + (+e + 2)))); return x < 0 ? -c : c; }; // paie en centimes entiers, un seul total par semaine partout
  const fmtPay = (n) => { const c = payCents(n); return window.KiwiNumber?.amount?.(c / 100) ?? (c / 100).toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); };
  function payrollFigures(members, venueType, period) {
    const hours = getHours(venueType);
    let totalHours = 0, variableC = 0, baseC = 0, onDuty = 0, salaried = 0, rated = 0;
    members.forEach((m) => {
      const row = hours[m.id] || {};
      let h = 0;
      period.days.forEach((d) => { h += (+row[d] || 0); });
      if (h > 0) onDuty++;
      totalHours += h;
      if ((+m.hourlyRate || 0) > 0) { rated++; variableC += payCents(hourlyPayFor(m, h, period.days)); }
      if ((+m.baseSalary || 0) > 0) { salaried++; baseC += payCents(m.baseSalary); }
    });
    const share = Math.min(1, periodMonthShare(period.days));
    return { totalHours, variablePay: variableC / 100, baseMass: baseC / 100, onDuty, salaried, rated, share, baseDue: Math.round(baseC * share) / 100 };
  }
  const dateLocale = () => (trLang() === 'en' ? 'en-US' : trLang() === 'ar' ? 'ar-MA' : 'fr-FR');

  function showPayroll() {
    const dt = (key, fr) => window.KiwiI18n?.T?.[window.KiwiI18n.getLang()]?.[key] ?? fr;
    if (!window.Kiwi || !window.Kiwi.appPage) return;
    const access = payrollAccess();
    if (access === 'none') {
      window.Kiwi.toast?.(dt("team.payrollAccess", "Accès réservé au gérant ou au propriétaire"), { type: 'info' });
      return;
    }
    const T = t();
    const venue = window.KiwiVenue?.getCurrentVenueData?.() || { name: 'Votre établissement', type: 'restaurant' };
    ensureVenueData(venue);
    const venueType = teamKey(venue);
    const members = getMembers(venueType);
    { const root = memberState.current(); restorePeriodLock(root, root.periodKind || 'week', buildPeriod(root.periodKind || 'week')); }
    pageActive = true; noteProfileState();
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
  /* team-owner:invitations:ONB_ROLE_FN */
  function importMembers(...args) { return invitations.importMembers(...args); }
  /* L'accueil du tableau de bord veut afficher « qui est là aujourd'hui », mais
   * dateRange.js s'exécute AVANT ce fichier. Il lit donc le roster par cette API
   * et se repeint sur l'événement plus bas, plutôt que d'aller fouiller
   * __kiwiTeamV2 — un global privé qu'un refactor d'ici casserait en silence.
   * Les heures du jour viennent de la même grille que Paie, donc les trois
   * surfaces content la même chose. */
  function roster(...args) { return rosterList.roster(...args); }
  /* Public, read-only day snapshot for reports and the assistant.  Historical
   * reports must not reuse `roster().hoursToday`: that would quietly attach
   * today's hours to an older Z report.  This adapter reads the same realised
   * hours and published/draft planning grids as the Planning page, for the
   * requested calendar day, and says exactly which source each figure came
   * from. */
  function daySnapshot(...args) { return rosterList.daySnapshot(...args); }
  /* Read-only planning evidence for the morning briefing. A draft is not a
   * promise to the team: only the frozen published grid may prove that an open
   * service is staffed. Names are reduced to first names at this boundary so
   * the briefing never receives contracts, pay, codes or full identities. */
  function planningDay(...args) { return rosterList.planningDay(...args); }
  /* Reservations consume the SAME planning grid as Paie, never a second staff
   * calendar.  A slot is covered only when a floor-capable team member's
   * planned shift spans the whole booking.  `configured` stays false when the
   * owner has not filled that day yet, so an incomplete planning cannot close
   * the public diary by accident. */
  function bookingCoverage(...args) { return rosterList.bookingCoverage(...args); }
  /* La masse salariale d'une liste de journées, pour le résultat net de
   * Marges (assets/charges.js). Exactement le calcul de Paie & planning, sur
   * le même roster et les mêmes heures : un salaire saisi une fois dans Équipe
   * n'est jamais ressaisi ailleurs, et les deux pages ne peuvent pas diverger.
   * null quand personne n'a ni salaire ni taux horaire : « pas de personnel
   * connu » n'est pas « personnel gratuit ». */
  function labour(...args) { return rosterList.labour(...args); }
  window.KiwiTeam = Object.assign(window.KiwiTeam || {}, { importMembers, roster, daySnapshot, planningDay, bookingCoverage, labour });

  /* ═══════════════ PONT VERS assets/team-hours.js ═══════════════
   * Ce que la paie et le planning lisent de ce module, mêmes fonctions, mêmes
   * objets. `live` relit à chaque accès l'état que seul ce module modifie
   * (page à l'écran, page Équipe ou Paie, rafraîchissement mis de côté).
   * `hours` est l'objet où team-hours.js dépose ses fonctions. Aucun code ni
   * mot de passe ne passe ici : le roster reste derrière getMembers(). */
  const live = Object.defineProperties({}, {
    pageActive: { get: () => pageActive },
    pageMode: { get: () => pageMode },
    liveTeamPendingRender: { get: () => liveTeamPendingRender },
  });
  Kiwi.__teamCore = {
    Kiwi, handlers, modal, toast, live, hours: teamHours,
    trLang, t, jobName, AVATAR_COLORS, initials, periodOffsets, HHMM_RE,
    normShift, shiftMinutes, shiftHours, shiftIsNextDay, fmtDur, fmtHours, fromISO, addDays, getShifts,
    periodPillsHtml, teamKey, saveCustomTeams, getMembers, getHours, pad, fmtFr, toISO, buildPeriod,
    periodNavigatorHtml, lockBucket, setPeriodLock, restorePeriodLock, applyLiveTeam, render,
    esc, memberFullName, isCustomVenue, fmtMad, svgIcon, IC, dateLocale, MODAL_CSS,
    contractWeekHours, hourlyPayFor, payrollFigures, payCents, fmtPay,
  };

  /* Private profile bridge: helpers and stable objects, with scalar updates. */
  Object.defineProperty(Kiwi, '__teamProfileCore', { value: Object.freeze({
    Kiwi, handlers, modal, toast, trLang, catalogFor, tradeKey,
    CONTRACT_TYPES, LANGS, AVATAR_TONES, AVATAR_COLORS, initials,
    esc, memberFullName, teamKey, getMembers, getHours, toISO, fmtMad, svgIcon, IC,
    activeFilters, memberMatchesFilters, memberDutyStatus, isCustomVenue,
    teamSlug, liveMember, makeCode, memberCode, codeUnresolved, rosterWriteBlocked,
    saveCustomTeams, mergeRemoved, render, MODAL_CSS, deptForFunction,
    buildPeriod, fmtHours, isCode, fromISO, dateLocale, contractWeekHours,
    onState(fn) { profileStateListeners.push(fn); fn(pageActive, liveTeam); },
    install(part) {
      Object.assign(teamProfiles, part);
      try { window.dispatchEvent(new Event('kiwi-team-ready')); } catch (_) {}
    },
  }) });

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
