/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · SALLE DE SPORT — Atlas Fitness (PIN 0015), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Le comptoir d'une salle de sport tient sur un geste : le check-in. Un membre
 * présente son code, l'écran flashe VERT (« Marhba Omar — abonnement jusqu'au
 * 28 août ») ou ROUGE (« Expiré depuis 12 jours ») avec, en un tap, le
 * renouvellement qui ouvre le kit d'encaissement. Autour : la vente/renouvelle-
 * ment d'abonnements (mensuel, trimestriel, annuel, étudiant –20 %, gel
 * vacances), les expirations de la semaine à relancer en WhatsApp, un petit
 * comptoir (eau, barre, shaker, location serviette, séance coach) et la fiche
 * membre téléphone-first (formule, début/fin, passages du mois, coach, objectif).
 *
 * Seed MID-SHIFT : on est en pleine journée, 23 passages déjà pointés, la file
 * des heures de pointe se remplit, Yassine expire AUJOURD'HUI et Karim est
 * expiré depuis 12 jours — c'est le moment rouge de la démo. Noms tangérois.
 *
 * Réutilise le kit caisse (.modal-veil, .modal, .cash-*, .reader-*) et le
 * #toast-stack partagé. V1 = couche opérationnelle : la carte part au lecteur
 * partenaire, sans encaissement Kiwi. Tout est préfixé gy-.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };

  /* real-store detection : neutralize seeded demo PEOPLE for a paired merchant,
     while the local demo (pvReal() === false) stays byte-identical. */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fmtLong = (d) => `${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const DAY = 24 * 3600 * 1000;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

  function toast(msg, ms) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2200);
    setTimeout(() => el.remove(), (ms || 2200) + 280);
  }

  /* ───────────────────────── line-art (boutique du comptoir) ─────────────────
     Même voix que le dict ART du pressing : traits forest, remplissages
     mint-tint, grille 64×64. Silhouettes reconnaissables. */
  const art = (inner) => `<svg class="gy-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    eau: art(`<path class="fill" d="M23 25h18l-1.5 30a4 4 0 0 1-4 3.6h-7a4 4 0 0 1-4-3.6z"/><path d="M23 25h18l-1.5 30a4 4 0 0 1-4 3.6h-7a4 4 0 0 1-4-3.6z"/><rect class="fill" x="25" y="14" width="14" height="7" rx="2"/><rect x="25" y="14" width="14" height="7" rx="2"/><path d="M24.5 21h15"/><path class="thin" d="M25 35h14M24.5 44h15"/>`),
    barre: art(`<rect class="fill" x="14" y="20" width="36" height="24" rx="6"/><rect x="14" y="20" width="36" height="24" rx="6"/><path class="thin" d="M22 20l-3 24M32 20l-2 24M42 20l1 24"/><path class="thin" d="M14 32h36"/>`),
    shaker: art(`<path class="fill" d="M21 26h22v26a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5z"/><path d="M21 26h22v26a5 5 0 0 1-5 5H26a5 5 0 0 1-5-5z"/><path d="M23 20h18l1.5 6H21.5z"/><path d="M26 12h12l2 5H24z"/><path class="thin" d="M22 38h20M22 46h20"/><circle class="thin" cx="27" cy="32" r="1"/><circle class="thin" cx="33" cy="33" r="1"/><circle class="thin" cx="38" cy="31" r="1"/>`),
    serviette: art(`<rect class="fill" x="12" y="18" width="40" height="28" rx="4"/><rect x="12" y="18" width="40" height="28" rx="4"/><path d="M12 46h40v4a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z"/><path class="thin" d="M18 24h28M18 30h28M18 36h28"/>`),
    coach: art(`<circle class="fill" cx="32" cy="17" r="7"/><circle cx="32" cy="17" r="7"/><path d="M19 54c0-9 5.5-15 13-15s13 6 13 15"/><path class="fill" d="M9 40l7-3 4 6-7 3z"/><path d="M9 40l7-3 4 6-7 3z"/><path class="fill" d="M55 40l-7-3-4 6 7 3z"/><path d="M55 40l-7-3-4 6 7 3z"/><path class="thin" d="M16 39h32"/>`),
    dumbbell: art(`<path class="fill" d="M10 26h7v12h-7zM47 26h7v12h-7z"/><path d="M10 26h7v12h-7zM47 26h7v12h-7z"/><rect class="fill" x="17" y="29" width="6" height="6" rx="1.5"/><rect x="17" y="29" width="6" height="6" rx="1.5"/><rect class="fill" x="41" y="29" width="6" height="6" rx="1.5"/><rect x="41" y="29" width="6" height="6" rx="1.5"/><path d="M23 32h18"/>`),
  };

  /* ───────────────────────── formules d'abonnement (Tanger 2026) ───────────── */
  const PLANS = [
    { id: 'mensuel',     label: 'Mensuel',      price: 250,  days: 30,  sub: 'accès illimité · 1 mois',         icon: 'calendar' },
    { id: 'trimestriel', label: 'Trimestriel',  price: 650,  days: 92,  sub: '3 mois · ~217 MAD/mois',          icon: 'calendar-clock', flag: 'populaire' },
    { id: 'annuel',      label: 'Annuel',       price: 2200, days: 366, sub: '12 mois · 2 mois offerts',        icon: 'crown',          flag: 'le malin' },
  ];
  const PLAN = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  const STUDENT_OFF = 0.20;
  const planPrice = (planId, student) => Math.round(PLAN[planId].price * (student ? 1 - STUDENT_OFF : 1));

  /* ───────────────────────── comptoir (extras) ───────────────────────── */
  const SHOP = [
    { id: 'eau',        label: 'Eau 50 cl',         price: 6,   art: 'eau' },
    { id: 'barre',      label: 'Barre protéinée',   price: 18,  art: 'barre' },
    { id: 'shaker',     label: 'Shaker + dose whey', price: 25,  art: 'shaker' },
    { id: 'serviette',  label: 'Location serviette', price: 10,  art: 'serviette' },
    { id: 'coach',      label: 'Séance coach perso', price: 150, art: 'coach', flag: '1 h' },
  ];
  const SHOP_ITEM = Object.fromEntries(SHOP.map((s) => [s.id, s]));

  /* ───────────────────────── coachs ─────────────────────────
     Objets désormais (id, tag spécialité). Les membres référencent toujours
     le coach par son `name` ('Coach Amine'…) ou la valeur sentinelle
     'Sans coach' — rétro-compatible. */
  const COACHES = (() => {
    const seed = [
      { id: 'amine', name: 'Coach Amine', tag: 'Force & hypertrophie' },
      { id: 'salma', name: 'Coach Salma', tag: 'Cardio & cross-training' },
      { id: 'reda',  name: 'Coach Réda',  tag: 'Boxe & condition physique' },
    ];
    /* real store : keep id/length so member.coach references + filters hold,
       but blank the named identities (name → "Coach N", tag → ''). */
    return pvReal() ? seed.map((c, i) => ({ id: c.id, name: 'Coach ' + (i + 1), tag: '' })) : seed;
  })();
  const COACH = Object.fromEntries(COACHES.map((c) => [c.id, c]));
  const COACH_BY_NAME = Object.fromEntries(COACHES.map((c) => [c.name, c]));

  /* ───────────────────────── cours collectifs (planning) ─────────────────────
     Line-art des cours : même voix gy-art (traits forest, fills mint-tint),
     via le helper art() partagé. */
  const CLASS_ART = {
    spin: art(`<circle class="fill" cx="30" cy="34" r="14"/><circle cx="30" cy="34" r="14"/><circle cx="30" cy="34" r="2.6"/><path class="thin" d="M30 20v28M16 34h28M21 25l18 18M39 25L21 43"/><path d="M22 51h18"/><path d="M27 47l-2 4M35 47l2 4"/>`),
    barbell: art(`<path d="M12 32h40"/><rect class="fill" x="8" y="23" width="6" height="18" rx="2"/><rect x="8" y="23" width="6" height="18" rx="2"/><rect class="fill" x="50" y="23" width="6" height="18" rx="2"/><rect x="50" y="23" width="6" height="18" rx="2"/><rect class="fill" x="16" y="26" width="5" height="12" rx="1.6"/><rect x="16" y="26" width="5" height="12" rx="1.6"/><rect class="fill" x="43" y="26" width="5" height="12" rx="1.6"/><rect x="43" y="26" width="5" height="12" rx="1.6"/>`),
    yoga: art(`<circle class="fill" cx="32" cy="16" r="6"/><circle cx="32" cy="16" r="6"/><path class="fill" d="M17 47c0-6 7-10 15-10s15 4 15 10z"/><path d="M17 47c0-6 7-10 15-10s15 4 15 10"/><path d="M32 24v9"/><path d="M21 39c4 3 18 3 22 0"/><path class="thin" d="M15 47h34"/>`),
    boxe: art(`<path class="fill" d="M21 27c0-6 5-9 11-9s12 4 12 11v8a8 8 0 0 1-8 8H27a6 6 0 0 1-6-6z"/><path d="M21 27c0-6 5-9 11-9s12 4 12 11v8a8 8 0 0 1-8 8H27a6 6 0 0 1-6-6z"/><path class="fill" d="M21 31h-3a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3z"/><path d="M21 31h-3a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3"/><path class="thin" d="M33 21v8M39 23v7"/><path d="M23 41h17"/>`),
    kettle: art(`<path d="M24 31c-2-2-3-4-3-7a11 11 0 0 1 22 0c0 3-1 5-3 7"/><path class="fill" d="M24 30h16a17 17 0 0 1 4 13 12 12 0 0 1-24 0 17 17 0 0 1 4-13z"/><path d="M24 30h16a17 17 0 0 1 4 13 12 12 0 0 1-24 0 17 17 0 0 1 4-13z"/><path class="thin" d="M28 42c2 2 8 2 10 0"/>`),
    dance: art(`<circle class="fill" cx="36" cy="15" r="5"/><circle cx="36" cy="15" r="5"/><path d="M36 20c-2 5-3 8-2 12l5 5-3 13"/><path d="M34 32l-9 2"/><path d="M37 24l9-4"/><path d="M35 37l-9 11"/><path class="thin" d="M16 51h32"/>`),
    hiit: art(`<circle class="fill" cx="32" cy="37" r="17"/><circle cx="32" cy="37" r="17"/><path d="M32 37V27"/><path class="thin" d="M32 37l7 4"/><rect class="fill" x="27" y="10" width="10" height="6" rx="2"/><rect x="27" y="10" width="10" height="6" rx="2"/><path d="M32 16v4"/><path class="thin" d="M45 23l3-3"/>`),
  };
  const classArt = (id) => CLASS_ART[id] || CLASS_ART.spin;
  /* ticket — séance unique / pass journée */
  ART.pass = art(`<path class="fill" d="M12 25h40v7a4 4 0 0 0 0 8v7H12v-7a4 4 0 0 0 0-8z"/><path d="M12 25h40v7a4 4 0 0 0 0 8v7H12v-7a4 4 0 0 0 0-8z"/><path class="thin" d="M40 27v18"/><path class="thin" d="M19 32h12M19 38h9"/>`);

  const CLASSES = [
    { id: 'rpm',      label: 'RPM · Cycle',    art: 'spin',    room: 'Studio cycle', coach: 'Coach Salma', dur: 45 },
    { id: 'bodypump', label: 'Body Pump',      art: 'barbell', room: 'Studio 1',     coach: 'Coach Amine', dur: 55 },
    { id: 'yoga',     label: 'Yoga Vinyasa',   art: 'yoga',    room: 'Studio 2',     coach: 'Coach Salma', dur: 60 },
    { id: 'boxe',     label: 'Boxe / Cardio',  art: 'boxe',    room: 'Le Ring',      coach: 'Coach Réda',  dur: 50 },
    { id: 'crossfit', label: 'CrossFit · WOD', art: 'kettle',  room: 'La Box',       coach: 'Coach Amine', dur: 60 },
    { id: 'zumba',    label: 'Zumba',          art: 'dance',   room: 'Studio 1',     coach: 'Coach Salma', dur: 45 },
    { id: 'hiit',     label: 'HIIT Express',   art: 'hiit',    room: 'Studio 2',     coach: 'Coach Réda',  dur: 30 },
  ];
  const CLASS = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

  /* Planning du jour — calé MID-SHIFT (~17 h) : le matin est passé (terminé),
     le CrossFit de 17 h est EN COURS, et la soirée se réserve (un RPM complet
     avec liste d'attente, le moment « la salle tourne »). booked = ids membres
     nommés + `extra` (réservations anonymes) pour des compteurs crédibles. */
  const SCHEDULE = (() => {
    const seed = [
      { id: 's1', classId: 'rpm',      time: '07:00', state: 'done',     cap: 18, booked: ['m6', 'm1'],          extra: 12, checkedIn: ['m6', 'm1'], wait: [], waitExtra: 0 },
      { id: 's2', classId: 'bodypump', time: '09:00', state: 'done',     cap: 20, booked: ['m1', 'm5'],          extra: 13, checkedIn: ['m1', 'm5'], wait: [], waitExtra: 0 },
      { id: 's3', classId: 'yoga',     time: '12:30', state: 'done',     cap: 14, booked: ['m4', 'm8'],          extra: 8,  checkedIn: ['m4', 'm8'], wait: [], waitExtra: 0 },
      { id: 's4', classId: 'crossfit', time: '17:00', state: 'live',     cap: 16, booked: ['m6', 'm1', 'm7'],    extra: 9,  checkedIn: ['m6', 'm1'],  wait: [], waitExtra: 0 },
      { id: 's5', classId: 'boxe',     time: '18:00', state: 'soon',     cap: 12, booked: ['m7', 'm5'],          extra: 8,  checkedIn: [],            wait: [], waitExtra: 0 },
      { id: 's6', classId: 'rpm',      time: '19:00', state: 'upcoming', cap: 18, booked: ['m4', 'm6', 'm10'],   extra: 15, checkedIn: [],            wait: ['m8'], waitExtra: 1 },
      { id: 's7', classId: 'zumba',    time: '20:00', state: 'upcoming', cap: 22, booked: ['m4', 'm10'],         extra: 6,  checkedIn: [],            wait: [], waitExtra: 0 },
    ];
    /* real store : keep the class catalog (times/caps) but strip the seeded
       attendance that references demo member ids — a real gym starts empty. */
    return pvReal()
      ? seed.map((s) => ({ id: s.id, classId: s.classId, time: s.time, state: s.state, cap: s.cap, booked: [], extra: 0, checkedIn: [], wait: [], waitExtra: 0 }))
      : seed;
  })();

  /* ───────────────────────── coaching personnel (PT) ─────────────────────────
     Packs de séances perso + séances 1:1 du jour par coach. Les cours collectifs
     du coach sont dérivés du SCHEDULE à l'affichage. */
  const PT_PACKS = [
    { id: 'pt1',  n: 1,  price: 150,  sub: 'séance découverte' },
    { id: 'pt5',  n: 5,  price: 650,  sub: '5 séances · 130 MAD/séance', flag: 'populaire' },
    { id: 'pt10', n: 10, price: 1200, sub: '10 séances · 120 MAD/séance', flag: 'le malin' },
  ];
  /* real store : no seeded 1:1 sessions (they embed demo member ids). */
  const PT_TODAY = pvReal() ? {} : {
    amine: [
      { time: '08:00', mid: 'm1',  state: 'done',     focus: 'Prise de masse' },
      { time: '18:30', mid: 'm7',  state: 'upcoming', focus: 'Hypertrophie haut du corps' },
    ],
    salma: [
      { time: '16:00', mid: 'm6',  state: 'done',     focus: 'Soulevé de terre, technique' },
      { time: '19:30', mid: 'm4',  state: 'upcoming', focus: 'Tonification & gainage' },
    ],
    reda: [
      { time: '09:00', mid: 'm5',  state: 'done',     focus: 'Perte de poids, cardio' },
      { time: '18:45', mid: 'm3',  state: 'upcoming', focus: 'Reprise en douceur' },
    ],
  };

  /* ───────────────────────── pilotage (KPIs du gérant) ───────────────────────
     Le club entier dépasse les 10 membres nommés (échantillon) : base ~247.
     Les compteurs « du jour » sont seedés mid-shift puis montent en live à
     chaque vente — la démo respire. */
  const CLUB = pvReal() ? {
    activeBase: 0, newThisMonth: 0, churnThisMonth: 0, mrr: 0, capacity: 120,
    attend7: [0, 0, 0, 0, 0, 0, 0], mix: [],
  } : {
    activeBase: 247,
    newThisMonth: 18,
    churnThisMonth: 6,
    mrr: 64200,
    capacity: 120,
    attend7: [186, 204, 198, 231, 215, 248, 0], /* le dernier (aujourd'hui) se remplit en live */
    mix: [ { id: 'mensuel', pct: 52 }, { id: 'trimestriel', pct: 31 }, { id: 'annuel', pct: 17 } ],
  };

  /* ───────────────────────── membres (Tanger) ─────────────────────────
     fin = date d'expiration relative à aujourd'hui (en jours). Le seed est
     calé MID-SHIFT : Yassine expire AUJOURD'HUI (0), Karim est expiré (−12,
     le moment rouge). visits = passages ce mois. */
  const NOW = Date.now();
  const dPlus = (days) => new Date(NOW + days * DAY);

  function mkMember(cfg) {
    return {
      id: cfg.id, code: cfg.code, name: cfg.name, phone: cfg.phone,
      plan: cfg.plan, student: !!cfg.student,
      start: dPlus(cfg.startD), end: startOfDay(dPlus(cfg.endD)),
      visits: cfg.visits, lastVisitD: cfg.lastVisitD,
      coach: cfg.coach, goal: cfg.goal,
      frozen: !!cfg.frozen, frozenUntil: cfg.frozenUntilD != null ? startOfDay(dPlus(cfg.frozenUntilD)) : null,
      checkedToday: !!cfg.checkedToday,
      ptCredits: cfg.ptCredits || 0,   /* séances de coaching perso restantes */
    };
  }

  /* real store : start with zero members (no seeded roster leak). */
  const MEMBERS = pvReal() ? [] : [
    mkMember({ id: 'm1', code: '20418', name: 'Omar Sefrioui',        phone: '0661 23 45 67', plan: 'annuel',      startD: -288, endD: 78,  visits: 14, lastVisitD: -1, coach: 'Coach Amine', goal: 'Prise de masse, +5 kg', checkedToday: false, ptCredits: 6 }),
    mkMember({ id: 'm2', code: '20419', name: 'Yassine El Khattabi',  phone: '0670 11 22 33', plan: 'mensuel',     startD: -30,  endD: 0,   visits: 11, lastVisitD: -1, coach: 'Coach Réda',  goal: 'Cardio, semi-marathon' }),
    mkMember({ id: 'm3', code: '20420', name: 'Karim Bennani',        phone: '0662 09 18 27', plan: 'mensuel',     startD: -42,  endD: -12, visits: 3,  lastVisitD: -14, coach: 'Sans coach',  goal: 'Remise en forme' }),
    mkMember({ id: 'm4', code: '20421', name: 'Salma Tazi',           phone: '0668 54 32 10', plan: 'trimestriel', startD: -50,  endD: 42,  visits: 18, lastVisitD: 0, coach: 'Coach Salma', goal: 'Tonification', checkedToday: true, ptCredits: 4 }),
    mkMember({ id: 'm5', code: '20422', name: 'Mehdi Lamrani',        phone: '0677 65 43 21', plan: 'mensuel',     startD: -26,  endD: 4,   visits: 7,  lastVisitD: -2, coach: 'Coach Amine', goal: 'Perte de poids, −8 kg', ptCredits: 2 }),
    mkMember({ id: 'm6', code: '20423', name: 'Imane Berrada',        phone: '0650 88 77 66', plan: 'annuel',      startD: -120, endD: 246, visits: 21, lastVisitD: 0, coach: 'Coach Salma', goal: 'Force, soulevé de terre', student: false, checkedToday: true, ptCredits: 9 }),
    mkMember({ id: 'm7', code: '20424', name: 'Anas Chraibi',         phone: '0655 44 33 22', plan: 'trimestriel', startD: -60,  endD: 32,  visits: 9,  lastVisitD: -3, coach: 'Coach Réda',  goal: 'Hypertrophie', student: true, ptCredits: 3 }),
    mkMember({ id: 'm8', code: '20425', name: 'Hajar El Idrissi',     phone: '0663 12 78 90', plan: 'mensuel',     startD: -28,  endD: 2,   visits: 5,  lastVisitD: -1, coach: 'Sans coach',  goal: 'Bien-être · stress' }),
    mkMember({ id: 'm9', code: '20426', name: 'Réda Mansouri',        phone: '0667 90 12 34', plan: 'annuel',      startD: -200, endD: 165, visits: 16, lastVisitD: -1, coach: 'Coach Amine', goal: 'Performance, crossfit', frozen: true, frozenUntilD: 9 }),
    mkMember({ id: 'm10', code: '20427', name: 'Khadija Amrani',     phone: '0661 55 66 77', plan: 'mensuel',     startD: -22,  endD: 8,   visits: 6,  lastVisitD: -2, coach: 'Coach Salma', goal: 'Premiers pas en muscu', student: true }),
  ];
  const MEMBER = Object.fromEntries(MEMBERS.map((m) => [m.id, m]));
  const byCode = (code) => MEMBERS.find((m) => m.code === String(code).trim());

  /* derived member status */
  function memberStatus(m) {
    if (m.frozen) return 'frozen';
    const d = daysBetween(new Date(), m.end);     /* >0 = days left, 0 = today, <0 = expired */
    if (d < 0) return 'expired';
    if (d <= 5) return 'expiring';
    return 'active';
  }
  function daysLeft(m) { return daysBetween(new Date(), m.end); }

  /* ───────────────────────── passages du jour + heures de pointe ───────────── */
  /* Distribution sur 6 tranches (6-9, 9-12, 12-15, 15-18, 18-21, 21-24).
     On est mid-shift (~milieu d'après-midi) : 23 passages déjà pointés. */
  const PEAK_SLOTS = [
    { lbl: '06–09', count: 4 },
    { lbl: '09–12', count: 6 },
    { lbl: '12–15', count: 5 },
    { lbl: '15–18', count: 8 },
    { lbl: '18–21', count: 0 },
    { lbl: '21–24', count: 0 },
  ];

  const state = {
    view: 'checkin',
    code: '',
    aboSeg: 'vendre',          /* vendre | expirations */
    cart: [],                  /* comptoir : [{id, qty}] */
    memberQuery: '',
    offline: false, queued: 0,
    /* recette du jour (seedée mid-shift, monte en live à chaque vente) */
    dayRevenue: pvReal() ? { abos: 0, shop: 0, coaching: 0, pass: 0 } : { abos: 3150, shop: 740, coaching: 600, pass: 160 },
    inGym: pvReal() ? 0 : 38,  /* présents dans la salle maintenant */
    passesToday: pvReal() ? 0 : 3,   /* séances uniques / pass journée vendus */
  };

  const addRevenue = (bucket, amount) => { state.dayRevenue[bucket] = (state.dayRevenue[bucket] || 0) + amount; };
  const revenueTotal = () => Object.values(state.dayRevenue).reduce((s, v) => s + v, 0);

  const passagesToday = () => MEMBERS.reduce((s, m) => s + (m.checkedToday ? 1 : 0), 0) + BASE_PASSAGES;
  let BASE_PASSAGES = 23 - MEMBERS.filter((m) => m.checkedToday).length;  /* keep live counter at 23 at boot */

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + historique de la journée.
     Le club encaissait dans state.dayRevenue et rien d'autre : la patronne
     voyait 0 MAD et un refresh effaçait la recette. Démo : no-op.
     Pas de restoreDay ici : dayRevenue ventile par ligne de produit (abos,
     shop, coaching, pass), pas par moyen de paiement. Le journal ne retient
     que le moyen de paiement, donc il n'y a rien à recréditer sans inventer
     une ligne — mieux vaut ne rien restaurer que fausser la ventilation. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('gym', { total, method, label, ref });
    } catch (_) {}
  }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }
  function firstName(name) { return name.split(/\s+/)[0]; }

  /* ───────────────────────── helpers : planning / coachs ─────────────────────
     booked = ids membres nommés ; extra = réservations anonymes. */
  const classOf = (s) => CLASS[s.classId];
  const sessionBooked = (s) => s.booked.length + s.extra;
  const sessionPlaces = (s) => Math.max(0, s.cap - sessionBooked(s));
  const sessionFull = (s) => sessionBooked(s) >= s.cap;
  const sessionWait = (s) => s.wait.length + s.waitExtra;
  const sessionPresent = (s) => s.checkedIn.length + (s.state === 'live' || s.state === 'done' ? Math.round(s.extra * 0.82) : 0);
  const sessionById = (id) => SCHEDULE.find((s) => s.id === id);
  const STATE_RANK = { live: 0, soon: 1, upcoming: 2, done: 3 };

  /* journée d'un coach : ses cours collectifs (dérivés du SCHEDULE) + ses
     séances perso (PT_TODAY), fusionnés et triés par heure. */
  function coachClasses(coachName) { return SCHEDULE.filter((s) => classOf(s).coach === coachName); }
  function coachDay(coachId) {
    const c = COACH[coachId];
    const rows = [];
    coachClasses(c.name).forEach((s) => rows.push({ kind: 'class', time: s.time, session: s, state: s.state }));
    (PT_TODAY[coachId] || []).forEach((p) => rows.push({ kind: 'pt', time: p.time, mid: p.mid, focus: p.focus, state: p.state }));
    return rows.sort((a, b) => a.time.localeCompare(b.time));
  }
  function coachPTCount(coachId) { return (PT_TODAY[coachId] || []).length; }
  /* membres rattachés à ce coach (échantillon nommé) */
  function coachMembers(coachName) { return MEMBERS.filter((m) => m.coach === coachName); }

  /* prochain cours réservé d'un membre (pour la fiche) */
  function memberNextClass(mid) {
    return SCHEDULE
      .filter((s) => (s.state === 'live' || s.state === 'soon' || s.state === 'upcoming') && s.booked.includes(mid))
      .sort((a, b) => a.time.localeCompare(b.time))[0] || null;
  }

  const activeCount = () => CLUB.activeBase;

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="gy-rail">
        <div class="gy-brand">kiwi<i></i></div>
        <div class="gy-venue">
          <div class="gy-venue-name">${pvName('Atlas Fitness') || 'Ma salle'}</div>
          <div class="gy-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Route de Rabat'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="gy-nav" id="gy-nav">
          <button class="gy-nav-it on" data-gy-view="checkin"><i data-lucide="scan-line"></i><span>Check-in</span><b class="gy-nav-badge" id="gy-badge-checkin"></b></button>
          <button class="gy-nav-it" data-gy-view="planning"><i data-lucide="calendar-days"></i><span>Planning</span><b class="gy-nav-badge" id="gy-badge-planning"></b></button>
          <button class="gy-nav-it" data-gy-view="coachs"><i data-lucide="dumbbell"></i><span>Coachs</span><b class="gy-nav-badge" id="gy-badge-coachs"></b></button>
          <button class="gy-nav-it" data-gy-view="abos"><i data-lucide="badge-check"></i><span>Abonnements</span><b class="gy-nav-badge" id="gy-badge-abos"></b></button>
          <button class="gy-nav-it" data-gy-view="comptoir"><i data-lucide="shopping-bag"></i><span>Comptoir</span><b class="gy-nav-badge" id="gy-badge-comptoir"></b></button>
          <button class="gy-nav-it" data-gy-view="membres"><i data-lucide="users"></i><span>Membres</span><b class="gy-nav-badge" id="gy-badge-membres"></b></button>
          <button class="gy-nav-it" data-gy-view="pilotage"><i data-lucide="layout-dashboard"></i><span>Pilotage</span><b class="gy-nav-badge" id="gy-badge-pilotage"></b></button>
        </nav>
        <div class="gy-rail-foot">
          <button class="gy-net" id="gy-net" title="Simuler une coupure réseau">
            <i class="gy-net-dot"></i><span class="gy-net-label">En ligne</span>
          </button>
          <button class="gy-lock" id="gy-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="gy-main">
        <div class="gy-offline-note" id="gy-offline-note" hidden>
          Hors-ligne, les pointages et ventes restent sur la tablette et partent à la synchro au retour du réseau.
          <b id="gy-queue-count"></b>
        </div>

        <section class="gy-view is-on" data-gy-panel="checkin">
          <div class="gy-checkin">
            <div class="gy-ci-left">
              <header class="gy-head">
                <div><h1>Check-in</h1><div class="gy-head-sub" id="gy-ci-sub"></div></div>
              </header>
              <div class="gy-ci-scanwrap">
                <div class="gy-ci-scan">
                  <div class="gy-ci-scan-icon"><i data-lucide="scan-line"></i></div>
                  <div class="gy-ci-scan-l">
                    <div class="gy-ci-scan-title">Présentez le badge ou tapez le code membre</div>
                    <input class="gy-ci-input mono" id="gy-ci-input" inputmode="numeric" autocomplete="off"
                      maxlength="6" placeholder="ex. 20418" />
                  </div>
                </div>
                <div class="gy-ci-actions">
                  <button class="gy-ci-scanbtn" id="gy-ci-scanbtn"><i data-lucide="scan-line"></i> Scanner le badge</button>
                  <button class="gy-ci-go" id="gy-ci-go"><i data-lucide="check"></i> Valider l'entrée</button>
                </div>
                <button class="gy-ci-pass" id="gy-ci-pass">
                  <span class="gy-ci-pass-art">${ART.pass}</span>
                  <span class="gy-ci-pass-l"><b>Visiteur sans abonnement&nbsp;?</b><span>Vendre une séance unique ou un pass journée, drop-in</span></span>
                  <i data-lucide="chevron-right"></i>
                </button>
                <div class="gy-ci-hint" id="gy-ci-quick"></div>
              </div>
              <div class="gy-ci-result" id="gy-ci-result"></div>
            </div>
            <aside class="gy-ci-side">
              <div class="gy-ci-counter">
                <div class="gy-ci-counter-lbl">Passages aujourd'hui</div>
                <div class="gy-ci-counter-val mono" id="gy-ci-count">0</div>
                <div class="gy-ci-counter-sub" id="gy-ci-count-sub"></div>
              </div>
              <div class="gy-peak">
                <div class="gy-peak-title"><i data-lucide="bar-chart-3"></i> Heures de pointe</div>
                <div class="gy-peak-bars" id="gy-peak-bars"></div>
                <div class="gy-peak-foot" id="gy-peak-foot"></div>
              </div>
            </aside>
          </div>
        </section>

        <section class="gy-view" data-gy-panel="abos">
          <header class="gy-head">
            <div><h1>Abonnements</h1><div class="gy-head-sub">Vendre, renouveler, geler, et relancer ceux qui expirent.</div></div>
            <div class="gy-head-right">
              <div class="gy-seg" data-lens-demo id="gy-abo-seg">
                <button class="gy-seg-it on" data-lens-item data-gy-aboseg="vendre">Vendre / renouveler</button>
                <button class="gy-seg-it" data-lens-item data-gy-aboseg="expirations">Expirations <b id="gy-abo-exp-ct"></b></button>
              </div>
            </div>
          </header>
          <div class="gy-abo-scroll" id="gy-abo-body"></div>
        </section>

        <section class="gy-view" data-gy-panel="comptoir">
          <div class="gy-shop">
            <div class="gy-shop-main">
              <header class="gy-head">
                <div><h1>Comptoir</h1><div class="gy-head-sub">Eau, snacks, serviette, séance coach, toucher pour ajouter.</div></div>
              </header>
              <div class="gy-shop-gridwrap"><div class="gy-shop-grid" id="gy-shop-grid"></div></div>
            </div>
            <aside class="gy-cart" id="gy-cart"></aside>
          </div>
        </section>

        <section class="gy-view" data-gy-panel="membres">
          <header class="gy-head">
            <div><h1>Membres</h1><div class="gy-head-sub">Cherchez par téléphone, nom ou code, la fiche s'ouvre.</div></div>
            <div class="gy-head-right">
              <div class="gy-search"><i data-lucide="search"></i>
                <input id="gy-mem-q" inputmode="search" placeholder="06…, nom ou code badge" autocomplete="off" /></div>
            </div>
          </header>
          <div class="gy-mem-scroll" id="gy-mem-body"></div>
        </section>

        <section class="gy-view" data-gy-panel="planning">
          <header class="gy-head">
            <div><h1>Planning</h1><div class="gy-head-sub">Cours collectifs du jour, réserver, pointer les présences, gérer la liste d'attente.</div></div>
            <div class="gy-head-right"><div class="gy-week" id="gy-week"></div></div>
          </header>
          <div class="gy-plan-scroll" id="gy-plan-body"></div>
        </section>

        <section class="gy-view" data-gy-panel="coachs">
          <header class="gy-head">
            <div><h1>Coachs</h1><div class="gy-head-sub">La journée de chaque coach, cours, séances perso, et la vente de séances.</div></div>
            <div class="gy-head-right"><button class="gy-btn primary sm" id="gy-pt-sell"><i data-lucide="plus"></i> Vendre des séances</button></div>
          </header>
          <div class="gy-coach-scroll" id="gy-coach-body"></div>
        </section>

        <section class="gy-view" data-gy-panel="pilotage">
          <header class="gy-head">
            <div><h1>Pilotage</h1><div class="gy-head-sub">${pvName('Atlas Fitness') || 'La salle'} en un coup d'œil, l'état du club, aujourd'hui.</div></div>
            <div class="gy-head-right"><span class="gy-pilot-live"><i class="gy-live-dot"></i> en direct</span></div>
          </header>
          <div class="gy-pilot-scroll" id="gy-pilot-body"></div>
        </section>
      </main>

      <div class="modal-veil" id="gy-member-veil"><div class="modal gy-member gy-rel" id="gy-memberm"></div></div>
      <div class="modal-veil" id="gy-sell-veil"><div class="modal gy-sell gy-rel" id="gy-sellm"></div></div>
      <div class="modal-veil" id="gy-freeze-veil"><div class="modal gy-rel" id="gy-freezem"></div></div>
      <div class="modal-veil" id="gy-wa-veil"><div class="modal gy-wa gy-rel" id="gy-wam"></div></div>
      <div class="modal-veil" id="gy-pay-veil"><div class="modal gy-rel" id="gy-paym"></div></div>
      <div class="modal-veil" id="gy-scan-veil"><div class="modal gy-scan gy-rel" id="gy-scanm"></div></div>
      <div class="modal-veil" id="gy-roster-veil"><div class="modal gy-roster gy-rel" id="gy-rosterm"></div></div>
      <div class="modal-veil" id="gy-pick-veil"><div class="modal gy-pick gy-rel" id="gy-pickm"></div></div>
      <div class="modal-veil" id="gy-coach-veil"><div class="modal gy-coach gy-rel" id="gy-coachm"></div></div>
      <div class="modal-veil" id="gy-ptpack-veil"><div class="modal gy-ptpack gy-rel" id="gy-ptpackm"></div></div>
      <div class="modal-veil" id="gy-pass-veil"><div class="modal gy-rel" id="gy-passm"></div></div>`;
    /* root is already attached to the DOM by the dispatcher (#pos-gym) */

    /* ---- static bindings (delegation on persistent containers) ---- */
    $('#gy-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-gy-view]');
      if (b) switchView(b.dataset.gyView);
    });
    $('#gy-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#gy-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    /* ---- check-in (the signature) ---- */
    const ciInput = $('#gy-ci-input', root);
    ciInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCheckin(ciInput.value); });
    $('#gy-ci-go', root).addEventListener('click', () => doCheckin(ciInput.value));
    $('#gy-ci-scanbtn', root).addEventListener('click', mockScan);
    $('#gy-ci-quick', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-gy-quick]');
      if (b) { ciInput.value = b.dataset.gyQuick; doCheckin(b.dataset.gyQuick); }
    });
    $('#gy-ci-result', root).addEventListener('click', (e) => {
      if (e.target.closest('[data-gy-renew]')) { openSell(MEMBER[e.target.closest('[data-gy-renew]').dataset.gyRenew], { renew: true }); return; }
      if (e.target.closest('[data-gy-ci-fiche]')) { openMember(e.target.closest('[data-gy-ci-fiche]').dataset.gyCiFiche); return; }
      if (e.target.closest('[data-gy-ci-clear]')) { clearCheckinResult(); ciInput.value = ''; ciInput.focus(); return; }
    });

    /* ---- abonnements ---- */
    $('#gy-abo-seg', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-gy-aboseg]');
      if (!b || b.dataset.gyAboseg === state.aboSeg) return;
      state.aboSeg = b.dataset.gyAboseg;
      $$('[data-gy-aboseg]', root).forEach((x) => x.classList.toggle('on', x.dataset.gyAboseg === state.aboSeg));
      renderAboBody(); icons();
    });
    $('#gy-abo-body', root).addEventListener('click', (e) => {
      const sell = e.target.closest('[data-gy-plan-pick]');
      if (sell) { openSell(null, { presetPlan: sell.dataset.gyPlanPick }); return; }
      const renew = e.target.closest('[data-gy-exp-renew]');
      if (renew) { openSell(MEMBER[renew.dataset.gyExpRenew], { renew: true }); return; }
      const wa = e.target.closest('[data-gy-exp-wa]');
      if (wa) { openWa(MEMBER[wa.dataset.gyExpWa]); return; }
      const fiche = e.target.closest('[data-gy-exp-fiche]');
      if (fiche) { openMember(fiche.dataset.gyExpFiche); return; }
      if (e.target.closest('#gy-abo-freeze')) { openFreezePicker(); return; }
    });

    /* ---- comptoir ---- */
    $('#gy-shop-grid', root).addEventListener('click', (e) => {
      const card = e.target.closest('[data-gy-shop]');
      if (card) addToCart(card.dataset.gyShop, card);
    });
    const cart = $('#gy-cart', root);
    cart.addEventListener('click', (e) => {
      const minus = e.target.closest('[data-gy-cminus]');
      const plus  = e.target.closest('[data-gy-cplus]');
      if (minus || plus) {
        const i = +(minus ? minus.dataset.gyCminus : plus.dataset.gyCplus);
        const ln = state.cart[i];
        if (!ln) return;
        if (plus) ln.qty = Math.min(30, ln.qty + 1);
        else { ln.qty--; if (ln.qty <= 0) state.cart.splice(i, 1); }
        renderCart(); renderBadges(); icons();
        return;
      }
      if (e.target.closest('#gy-cart-clear')) {
        state.cart = []; renderCart(); renderBadges(); icons(); toast('Panier vidé'); return;
      }
      if (e.target.closest('#gy-cart-pay')) { payCart(); return; }
    });

    /* ---- membres ---- */
    const memQ = $('#gy-mem-q', root);
    memQ.addEventListener('input', (e) => {
      state.memberQuery = e.target.value;
      renderMemberList(); icons();
      const i = $('#gy-mem-q', root); i.focus(); moveCaretEnd(i);
    });
    $('#gy-mem-body', root).addEventListener('click', (e) => {
      const row = e.target.closest('[data-gy-mem]');
      if (row) openMember(row.dataset.gyMem);
    });

    /* ---- check-in : séance unique / pass journée (drop-in) ---- */
    $('#gy-ci-pass', root).addEventListener('click', openDayPass);

    /* ---- planning (cours collectifs) ---- */
    $('#gy-plan-body', root).addEventListener('click', (e) => {
      const card = e.target.closest('[data-gy-session]');
      if (card) openRoster(card.dataset.gySession);
    });

    /* ---- coachs ---- */
    $('#gy-coach-body', root).addEventListener('click', (e) => {
      const sell = e.target.closest('[data-gy-coach-sell]');
      if (sell) { openPtSell(null, sell.dataset.gyCoachSell); return; }
      const card = e.target.closest('[data-gy-coach]');
      if (card) openCoach(card.dataset.gyCoach);
    });
    $('#gy-pt-sell', root).addEventListener('click', () => openPtSell());

    /* ---- pilotage ---- */
    $('#gy-pilot-body', root).addEventListener('click', (e) => {
      if (e.target.closest('[data-gy-pilot-relance]')) { state.aboSeg = 'expirations'; switchView('abos'); return; }
      if (e.target.closest('[data-gy-pilot-planning]')) { switchView('planning'); return; }
      const mem = e.target.closest('[data-gy-pilot-mem]');
      if (mem) openMember(mem.dataset.gyPilotMem);
    });

    renderAll();
    if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {}
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / RENDER ROOT ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.gy-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.gyView === view));
    $$('.gy-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.gyPanel === view));
    if (view === 'checkin')  renderCheckin();
    if (view === 'planning') renderPlanning();
    if (view === 'coachs')   renderCoachs();
    if (view === 'abos')     renderAbo();
    if (view === 'comptoir') renderShop();
    if (view === 'membres')  renderMembers();
    if (view === 'pilotage') renderPilotage();
    icons();
  }

  function renderAll() {
    renderShopGrid();
    renderCart();
    renderBadges();
    renderNet();
    switchView(state.view);
  }

  function renderBadges() {
    const exp = MEMBERS.filter((m) => { const s = memberStatus(m); return s === 'expiring' || s === 'expired'; }).length;
    const cartCt = state.cart.reduce((s, l) => s + l.qty, 0);
    const bC = $('#gy-badge-checkin', root), bA = $('#gy-badge-abos', root),
          bS = $('#gy-badge-comptoir', root), bM = $('#gy-badge-membres', root);
    bC.textContent = passagesToday();
    bC.style.display = '';
    bA.textContent = exp || '';
    bA.style.display = exp ? '' : 'none';
    bS.textContent = cartCt || '';
    bS.style.display = cartCt ? '' : 'none';
    bM.textContent = MEMBERS.length;
    bM.style.display = '';
    const expCt = $('#gy-abo-exp-ct', root);
    if (expCt) expCt.textContent = exp || '';
    /* new pillars */
    const bP = $('#gy-badge-planning', root), bCo = $('#gy-badge-coachs', root), bPi = $('#gy-badge-pilotage', root);
    const liveLeft = SCHEDULE.filter((s) => s.state === 'live' || s.state === 'soon' || s.state === 'upcoming').length;
    const ptToday = Object.values(PT_TODAY).reduce((s, arr) => s + arr.length, 0);
    if (bP)  { bP.textContent = liveLeft || ''; bP.style.display = liveLeft ? '' : 'none'; }
    if (bCo) { bCo.textContent = ptToday || ''; bCo.style.display = ptToday ? '' : 'none'; }
    if (bPi) { bPi.textContent = exp || ''; bPi.style.display = exp ? '' : 'none'; }
  }

  /* ═══════════════════════ CHECK-IN — la signature ═══════════════════════ */
  function renderCheckin() {
    $('#gy-ci-sub', root).textContent =
      `${fmtDT(new Date())} · présentez le badge, l'écran confirme l'accès`;
    renderQuickCodes();
    renderCounter();
    renderPeak();
    if (!$('#gy-ci-result', root).dataset.shown) clearCheckinResult();
  }

  /* raccourcis de démo : un membre valide, celui qui expire aujourd'hui, l'expiré */
  function renderQuickCodes() {
    const valid = MEMBER.m1, today = MEMBER.m2, expired = MEMBER.m3;
    /* real store : no seeded members → no demo quick-badges to surface. */
    if (!valid || !today || !expired) { $('#gy-ci-quick', root).innerHTML = ''; return; }
    $('#gy-ci-quick', root).innerHTML =
      `<span class="gy-ci-hint-lbl">Démo, badges sous la main :</span>` +
      [[valid, 'à jour'], [today, 'expire aujourd\'hui'], [expired, 'expiré']]
        .map(([m, tag]) => `<button class="gy-ci-quickcode" data-gy-quick="${m.code}"><b>${m.code}</b> ${esc(firstName(m.name))} · ${tag}</button>`).join('');
  }

  function renderCounter() {
    $('#gy-ci-count', root).textContent = passagesToday();
    const checkedNames = MEMBERS.filter((m) => m.checkedToday).map((m) => firstName(m.name));
    $('#gy-ci-count-sub', root).textContent = checkedNames.length
      ? `dont ${checkedNames.slice(-2).join(', ')} à l'instant`
      : 'la salle se remplit';
  }

  function renderPeak() {
    const max = Math.max(...PEAK_SLOTS.map((s) => s.count), 1);
    const peakIdx = PEAK_SLOTS.reduce((bi, s, i, a) => s.count > a[bi].count ? i : bi, 0);
    $('#gy-peak-bars', root).innerHTML = PEAK_SLOTS.map((s, i) => `
      <div class="gy-peak-bar ${i === peakIdx ? 'peak' : ''} ${s.count === 0 ? 'empty' : ''}">
        <span class="gy-peak-col"><i style="height:${Math.round((s.count / max) * 100)}%"></i></span>
        <span class="gy-peak-ct">${s.count || ''}</span>
        <span class="gy-peak-lbl">${s.lbl}</span>
      </div>`).join('');
    $('#gy-peak-foot', root).textContent = `Pic vers ${PEAK_SLOTS[peakIdx].lbl} h, prévoir un coach de plus en salle.`;
  }

  function clearCheckinResult() {
    const el = $('#gy-ci-result', root);
    el.dataset.shown = '';
    el.className = 'gy-ci-result';
    el.innerHTML = `
      <div class="gy-ci-idle">
        <i data-lucide="scan-line"></i>
        <div>En attente d'un badge.<br>Le résultat s'affiche ici en grand, vert si l'accès est ouvert, rouge sinon.</div>
      </div>`;
    icons();
  }

  function mockScan() {
    /* simulate the badge reader landing on a code, then run the check-in */
    const el = $('#gy-scanm', root);
    /* pick a member to "scan": prefer the today-expiring one for the demo moment */
    const target = MEMBER.m2 || MEMBERS[0];
    /* real store : no seeded member to demo-scan → nothing to simulate. */
    if (!target) { toast('Aucun membre à simuler, saisissez un code badge.'); return; }
    el.innerHTML = `
      <h3 class="modal-title">Lecture du badge…</h3>
      <p class="modal-subtle">Approchez le badge du lecteur sans contact.</p>
      <div class="gy-scan-stage">
        <div class="gy-scan-badge">
          <span class="gy-scan-badge-dot"></span>
          <span class="gy-scan-badge-id mono">ATLAS · ${esc(target.code)}</span>
        </div>
        <div class="gy-scan-laser"></div>
      </div>`;
    openVeil('#gy-scan-veil');
    icons();
    setTimeout(() => {
      if (!$('#gy-scan-veil', root).classList.contains('is-open')) return;
      closeVeil('#gy-scan-veil');
      $('#gy-ci-input', root).value = target.code;
      doCheckin(target.code);
    }, 1300);
  }

  function doCheckin(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) { toast('Tapez un code membre ou scannez un badge'); return; }
    const m = byCode(code);
    const el = $('#gy-ci-result', root);
    el.dataset.shown = '1';

    if (!m) {
      el.className = 'gy-ci-result is-red gy-flash';
      el.innerHTML = `
        <div class="gy-ci-card">
          <div class="gy-ci-photo unknown"><i data-lucide="user-x"></i></div>
          <div class="gy-ci-card-l">
            <div class="gy-ci-verdict">Badge inconnu</div>
            <div class="gy-ci-name">Code ${esc(code)}</div>
            <div class="gy-ci-meta">Aucun membre avec ce code. Vérifiez le badge ou créez l'abonnement.</div>
          </div>
        </div>
        <div class="gy-ci-card-actions">
          <button class="gy-btn primary" data-gy-plan-jump><i data-lucide="user-plus"></i> Nouvel abonnement</button>
          <button class="gy-btn ghost" data-gy-ci-clear>Effacer</button>
        </div>`;
      icons();
      $('[data-gy-plan-jump]', el).onclick = () => switchView('abos');
      toast(`Badge ${code} inconnu`);
      restoreCiInput();
      return;
    }

    const status = memberStatus(m);
    const dleft = daysLeft(m);
    const open = status === 'active' || status === 'expiring';
    /* a frozen membership cannot enter until thaw */
    const frozenBlocked = status === 'frozen';

    if (open) {
      if (!m.checkedToday) state.inGym++;
      m.checkedToday = true;
      queueIfOffline('Pointage entrée');
      el.className = 'gy-ci-result is-green gy-flash';
      const until = `jusqu'au ${fmtLong(m.end)}`;
      const warn = status === 'expiring'
        ? `<div class="gy-ci-warnline"><i data-lucide="calendar-clock"></i> Plus que ${dleft === 0 ? "aujourd'hui" : dleft + ' jour' + (dleft > 1 ? 's' : '')}, proposez le renouvellement.</div>`
        : '';
      el.innerHTML = `
        <div class="gy-ci-card">
          <div class="gy-ci-photo">${esc(initials(m.name))}</div>
          <div class="gy-ci-card-l">
            <div class="gy-ci-verdict"><i data-lucide="check-circle-2"></i> Marhba ${esc(firstName(m.name))}</div>
            <div class="gy-ci-name">${esc(m.name)}</div>
            <div class="gy-ci-meta">Abonnement ${esc(PLAN[m.plan].label.toLowerCase())} ${esc(until)} · ${m.coach !== 'Sans coach' ? esc(m.coach) : 'sans coach'}</div>
            ${warn}
          </div>
          <div class="gy-ci-badge ${status === 'expiring' ? 'soon' : ''}">
            <b>${dleft === 0 ? '0' : dleft}</b><span>${dleft === 0 ? "dernier jour" : 'jours restants'}</span>
          </div>
        </div>
        <div class="gy-ci-card-actions">
          ${status === 'expiring' ? `<button class="gy-btn primary" data-gy-renew="${m.id}"><i data-lucide="refresh-cw"></i> Renouveler maintenant</button>` : ''}
          <button class="gy-btn secondary" data-gy-ci-fiche="${m.id}"><i data-lucide="user"></i> Voir la fiche</button>
          <button class="gy-btn ghost" data-gy-ci-clear>Entrée suivante</button>
        </div>`;
      icons();
      renderCounter(); renderBadges();
      toast(`Marhba ${firstName(m.name)}, entrée pointée`);
      restoreCiInput();
      return;
    }

    /* RED — expired (the demo moment) or frozen */
    el.className = 'gy-ci-result is-red gy-flash';
    if (frozenBlocked) {
      const thaw = m.frozenUntil ? fmtLong(m.frozenUntil) : '';
      el.innerHTML = `
        <div class="gy-ci-card">
          <div class="gy-ci-photo frozen">${esc(initials(m.name))}</div>
          <div class="gy-ci-card-l">
            <div class="gy-ci-verdict"><i data-lucide="snowflake"></i> Abonnement gelé</div>
            <div class="gy-ci-name">${esc(m.name)}</div>
            <div class="gy-ci-meta">En pause (vacances), reprise prévue le ${esc(thaw)}.</div>
          </div>
        </div>
        <div class="gy-ci-card-actions">
          <button class="gy-btn primary" data-gy-ci-thaw="${m.id}"><i data-lucide="play"></i> Réactiver maintenant</button>
          <button class="gy-btn secondary" data-gy-ci-fiche="${m.id}"><i data-lucide="user"></i> Voir la fiche</button>
          <button class="gy-btn ghost" data-gy-ci-clear>Entrée suivante</button>
        </div>`;
      icons();
      $('[data-gy-ci-thaw]', el).onclick = () => { thawMember(m); openMember(m.id); };
      toast(`${firstName(m.name)}, abonnement en pause`);
      restoreCiInput();
      return;
    }

    const since = Math.abs(dleft);
    el.innerHTML = `
      <div class="gy-ci-card">
        <div class="gy-ci-photo expired">${esc(initials(m.name))}</div>
        <div class="gy-ci-card-l">
          <div class="gy-ci-verdict"><i data-lucide="x-circle"></i> Accès expiré</div>
          <div class="gy-ci-name">${esc(m.name)}</div>
          <div class="gy-ci-meta">Abonnement ${esc(PLAN[m.plan].label.toLowerCase())} terminé le ${esc(fmtLong(m.end))}.</div>
          <div class="gy-ci-warnline red"><i data-lucide="calendar-x"></i> Expiré depuis ${since} jour${since > 1 ? 's' : ''}, accès refusé.</div>
        </div>
        <div class="gy-ci-badge expired"><b>−${since}</b><span>jours</span></div>
      </div>
      <div class="gy-ci-card-actions">
        <button class="gy-btn primary big" data-gy-renew="${m.id}"><i data-lucide="refresh-cw"></i> Renouveler maintenant</button>
        <button class="gy-btn secondary" data-gy-ci-fiche="${m.id}"><i data-lucide="user"></i> Fiche</button>
        <button class="gy-btn ghost" data-gy-ci-clear>Suivant</button>
      </div>`;
    icons();
    toast(`${firstName(m.name)}, expiré depuis ${since} j`);
    restoreCiInput();
  }

  function restoreCiInput() {
    setTimeout(() => { const i = $('#gy-ci-input', root); if (i) { i.value = ''; i.focus(); } }, 50);
  }

  /* ═══════════════════════ ABONNEMENTS ═══════════════════════ */
  function renderAbo() {
    $('#gy-abo-exp-ct', root).textContent =
      MEMBERS.filter((m) => { const s = memberStatus(m); return s === 'expiring' || s === 'expired'; }).length || '';
    $$('[data-gy-aboseg]', root).forEach((x) => x.classList.toggle('on', x.dataset.gyAboseg === state.aboSeg));
    renderAboBody();
  }

  function renderAboBody() {
    const body = $('#gy-abo-body', root);
    if (state.aboSeg === 'vendre') {
      const frozen = MEMBERS.filter((m) => m.frozen);
      body.innerHTML = `
        <div class="gy-abo-intro">Choisissez une formule pour vendre un nouvel abonnement, ou renouvelez depuis la fiche d'un membre.</div>
        <div class="gy-plan-grid">
          ${PLANS.map((p) => `
            <button class="gy-plan-card ${p.id === 'trimestriel' ? 'feat' : ''}" data-gy-plan-pick="${p.id}">
              ${p.flag ? `<span class="gy-plan-flag">${esc(p.flag)}</span>` : ''}
              <span class="gy-plan-ic"><i data-lucide="${p.icon}"></i></span>
              <span class="gy-plan-name">${esc(p.label)}</span>
              <span class="gy-plan-price"><b>${p.price}</b> MAD</span>
              <span class="gy-plan-sub">${esc(p.sub)}</span>
              <span class="gy-plan-student"><i data-lucide="percent"></i> étudiant ${esc(planPrice(p.id, true))} MAD</span>
            </button>`).join('')}
        </div>
        <div class="gy-abo-sec">
          <div class="gy-abo-sec-head"><i data-lucide="snowflake"></i> Gel d'abonnement</div>
          <div class="gy-freeze-card">
            <div class="gy-freeze-l">
              <b>Mettre un abonnement en pause</b>
              <span>Vacances, blessure, déplacement, la fin d'abonnement est repoussée d'autant. ${frozen.length ? `${frozen.length} membre${frozen.length > 1 ? 's' : ''} en pause actuellement.` : 'Aucun membre en pause.'}</span>
            </div>
            <button class="gy-btn secondary" id="gy-abo-freeze"><i data-lucide="snowflake"></i> Geler un abonnement</button>
          </div>
          ${frozen.length ? `<div class="gy-freeze-list">${frozen.map((m) => `
            <button class="gy-freeze-row" data-gy-exp-fiche="${m.id}">
              <span class="gy-mem-ava frozen">${esc(initials(m.name))}</span>
              <span class="gy-freeze-row-l"><b>${esc(m.name)}</b><span>reprise le ${esc(m.frozenUntil ? fmtLong(m.frozenUntil) : '—')}</span></span>
              <span class="gy-pill snow"><i data-lucide="snowflake"></i> en pause</span>
            </button>`).join('')}</div>` : ''}
        </div>`;
      icons();
      return;
    }

    /* expirations cette semaine + déjà expirés */
    const expiring = MEMBERS.filter((m) => memberStatus(m) === 'expiring')
      .sort((a, b) => a.end - b.end);
    const expired = MEMBERS.filter((m) => memberStatus(m) === 'expired')
      .sort((a, b) => b.end - a.end);

    body.innerHTML = `
      <div class="gy-abo-intro">Relancez en un tap, message motivant prêt sur WhatsApp, ou renouvellement direct au comptoir.</div>
      <div class="gy-exp-sec">
        <div class="gy-exp-head"><i class="dot soon"></i> Expire cette semaine <span class="ct">${expiring.length}</span></div>
        ${expiring.length ? expiring.map(expRow).join('') : '<div class="gy-empty">Personne n\'expire cette semaine, la rétention est bonne.</div>'}
      </div>
      <div class="gy-exp-sec">
        <div class="gy-exp-head"><i class="dot red"></i> Déjà expirés <span class="ct">${expired.length}</span></div>
        ${expired.length ? expired.map(expRow).join('') : '<div class="gy-empty">Aucun abonnement expiré en attente.</div>'}
      </div>`;
    icons();
  }

  function expRow(m) {
    const d = daysLeft(m);
    const expired = d < 0;
    const lbl = expired ? `expiré depuis ${Math.abs(d)} j` : d === 0 ? "expire aujourd'hui" : `dans ${d} jour${d > 1 ? 's' : ''}`;
    return `<div class="gy-exp-row ${expired ? 'is-expired' : ''}">
      <span class="gy-mem-ava ${expired ? 'expired' : 'soon'}">${esc(initials(m.name))}</span>
      <span class="gy-exp-l">
        <b>${esc(m.name)}</b>
        <span>${esc(PLAN[m.plan].label)} · ${esc(m.phone)} · <span class="${expired ? 'gy-x-red' : 'gy-x-soon'}">${lbl}</span></span>
      </span>
      <span class="gy-exp-actions">
        <button class="gy-btn ghost sm" data-gy-exp-wa="${m.id}"><i data-lucide="message-circle"></i> Relancer</button>
        <button class="gy-btn primary sm" data-gy-exp-renew="${m.id}"><i data-lucide="refresh-cw"></i> Renouveler</button>
      </span>
    </div>`;
  }

  /* ───────────────────────── vendre / renouveler (sheet + pay) ─────────────── */
  function openSell(member, ctx) {
    ctx = ctx || {};
    const el = $('#gy-sellm', root);
    const sel = {
      plan: ctx.presetPlan || (member ? member.plan : 'mensuel'),
      student: member ? member.student : false,
      member: member || null,
      renew: !!ctx.renew,
    };

    const render = () => {
      const price = planPrice(sel.plan, sel.student);
      const p = PLAN[sel.plan];
      /* compute the new end date: renew extends from max(today, current end) */
      const base = sel.member && sel.member.end > new Date() ? sel.member.end : new Date();
      const newEnd = startOfDay(new Date(base.getTime() + p.days * DAY));
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${sel.renew ? 'Renouveler l\'abonnement' : 'Nouvel abonnement'}</h3>
        <p class="modal-subtle">${sel.member ? esc(sel.member.name) + ' · ' + esc(sel.member.phone) : 'Choisissez la formule, puis encaissez.'}</p>

        <div class="gy-f">
          <div class="gy-f-lbl">Formule</div>
          <div class="gy-plan-pick" id="gy-sell-plans">
            ${PLANS.map((pl) => `
              <button class="gy-plan-opt ${pl.id === sel.plan ? 'on' : ''}" data-gy-sp="${pl.id}">
                <span class="gy-plan-opt-name">${esc(pl.label)}</span>
                <span class="gy-plan-opt-price mono">${esc(planPrice(pl.id, sel.student))} MAD</span>
                <span class="gy-plan-opt-sub">${esc(pl.sub)}</span>
              </button>`).join('')}
          </div>
        </div>

        <button class="gy-student-toggle ${sel.student ? 'on' : ''}" id="gy-sell-student">
          <span class="gy-student-tick"><i data-lucide="check"></i></span>
          <span class="gy-student-l"><b>Tarif étudiant, 20 % de remise</b><span>Sur présentation de la carte étudiante</span></span>
          <span class="gy-student-amt">${sel.student ? `−${PLAN[sel.plan].price - price} MAD` : 'appliquer'}</span>
        </button>

        <div class="gy-sell-summary">
          <div class="gy-sell-sum-row"><span>Formule ${esc(p.label.toLowerCase())}${sel.student ? ' · étudiant' : ''}</span><b>${esc(fmtMAD(PLAN[sel.plan].price))}</b></div>
          ${sel.student ? `<div class="gy-sell-sum-row mut"><span>Remise étudiant −20 %</span><b>−${esc(fmtMAD(PLAN[sel.plan].price - price))}</b></div>` : ''}
          <div class="gy-sell-sum-row total"><span>À encaisser · valable ${esc(fmtLong(newEnd))}</span><b class="mono">${esc(fmtMAD(price))}</b></div>
        </div>

        <div class="gy-sell-foot">
          <button class="gy-btn ghost" data-gy-close>Annuler</button>
          <button class="gy-btn primary" id="gy-sell-pay"><i data-lucide="banknote"></i> Encaisser ${esc(fmtMAD(price))}</button>
        </div>`;
      icons();
      $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-sell-veil'); });
      $('#gy-sell-plans', el).onclick = (e) => {
        const b = e.target.closest('[data-gy-sp]');
        if (!b) return;
        sel.plan = b.dataset.gySp;
        render();
      };
      $('#gy-sell-student', el).onclick = () => { sel.student = !sel.student; render(); };
      $('#gy-sell-pay', el).onclick = () => {
        const finalPrice = planPrice(sel.plan, sel.student);
        closeVeil('#gy-sell-veil');
        openPay({
          amount: finalPrice,
          title: sel.renew ? 'Renouvellement' : 'Abonnement',
          sub: `${sel.member ? esc(sel.member.name) : 'Nouveau membre'} · ${esc(PLAN[sel.plan].label.toLowerCase())}`,
          onPaid: (method, rendu) => commitSell(sel, finalPrice, method, rendu, newEnd),
        });
      };
    };
    render();
    openVeil('#gy-sell-veil');
  }

  function commitSell(sel, price, method, rendu, newEnd) {
    if (sel.member) {
      const m = sel.member;
      m.plan = sel.plan;
      m.student = sel.student;
      m.end = newEnd;
      if (m.frozen) { m.frozen = false; m.frozenUntil = null; }
      queueIfOffline('Renouvellement');
      toast(`${firstName(m.name)}, renouvelé ${PLAN[sel.plan].label.toLowerCase()}, jusqu'au ${fmtLong(m.end)}${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    } else {
      /* a brand-new member: minimal fiche, the rest gets filled later */
      const id = 'mx' + Date.now().toString(36);
      const code = String(20400 + MEMBERS.length + Math.floor(Math.random() * 80));
      const m = mkMember({
        id, code, name: 'Nouveau membre', phone: '',
        plan: sel.plan, student: sel.student, startD: 0, endD: 0, visits: 0, lastVisitD: 0,
        coach: 'Sans coach', goal: 'À définir',
      });
      m.end = newEnd;
      MEMBERS.push(m); MEMBER[id] = m;
      CLUB.activeBase++; CLUB.newThisMonth++;
      queueIfOffline('Nouvel abonnement');
      toast(`Abonnement ${PLAN[sel.plan].label.toLowerCase()} vendu, badge ${code} à remettre`);
      setTimeout(() => openMember(id), 350);
    }
    addRevenue('abos', price);
    postDay(price, method, `${sel.renew ? 'Renouvellement' : 'Abonnement'} ${PLAN[sel.plan].label.toLowerCase()}${sel.student ? ' · étudiant' : ''}`, sel.member ? sel.member.code : '');
    refreshOps();
  }

  /* ───────────────────────── gel d'abonnement ─────────────────────────── */
  function openFreezePicker() {
    const el = $('#gy-freezem', root);
    const eligible = MEMBERS.filter((m) => !m.frozen && memberStatus(m) !== 'expired');
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Geler un abonnement</h3>
      <p class="modal-subtle">Choisissez le membre, la fin d'abonnement sera repoussée d'autant à la reprise.</p>
      <div class="gy-freeze-pick">
        ${eligible.map((m) => `
          <button class="gy-cl-row" data-gy-fz="${m.id}">
            <span class="gy-mem-ava">${esc(initials(m.name))}</span>
            <span class="gy-cl-mid"><span class="gy-cl-name">${esc(m.name)}</span><span class="gy-cl-sub">${esc(PLAN[m.plan].label)} · fin ${esc(fmtLong(m.end))}</span></span>
            <span class="gy-cl-right"><b>${daysLeft(m)} j</b></span>
          </button>`).join('') || '<div class="gy-empty">Aucun membre éligible au gel.</div>'}
      </div>`;
    openVeil('#gy-freeze-veil');
    icons();
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-freeze-veil'); });
    $$('[data-gy-fz]', el).forEach((b) => {
      b.onclick = () => { closeVeil('#gy-freeze-veil'); freezeMember(MEMBER[b.dataset.gyFz]); };
    });
  }

  function freezeMember(m, weeks) {
    weeks = weeks || 2;
    m.frozen = true;
    m.frozenUntil = startOfDay(dPlus(weeks * 7));
    /* push the end date out by the freeze span */
    m.end = startOfDay(new Date(m.end.getTime() + weeks * 7 * DAY));
    queueIfOffline('Gel abonnement');
    toast(`${firstName(m.name)}, abonnement gelé, reprise le ${fmtLong(m.frozenUntil)}`);
    refreshOps();
  }
  function thawMember(m) {
    m.frozen = false; m.frozenUntil = null;
    queueIfOffline('Réactivation');
    toast(`${firstName(m.name)}, abonnement réactivé`);
    refreshOps();
  }

  /* ═══════════════════════ COMPTOIR (extras) ═══════════════════════ */
  function renderShop() { renderShopGrid(); renderCart(); }

  function renderShopGrid() {
    $('#gy-shop-grid', root).innerHTML = SHOP.map((s, i) => `
      <button class="gy-shop-card" data-gy-shop="${s.id}" style="--i:${i}" aria-label="Ajouter ${esc(s.label)}">
        ${s.flag ? `<span class="gy-shop-flag">${esc(s.flag)}</span>` : ''}
        <span class="gy-shop-art">${ART[s.art] || ''}</span>
        <span class="gy-shop-name">${esc(s.label)}</span>
        <span class="gy-shop-price">${s.price} MAD</span>
      </button>`).join('');
  }

  const cartTotal = () => state.cart.reduce((s, l) => s + SHOP_ITEM[l.id].price * l.qty, 0);

  function addToCart(id, cardEl) {
    const ln = state.cart.find((l) => l.id === id);
    if (ln) ln.qty = Math.min(30, ln.qty + 1);
    else state.cart.push({ id, qty: 1 });
    renderCart(); renderBadges(); icons();
    if (cardEl) {
      const p = document.createElement('span');
      p.className = 'gy-plus1';
      p.textContent = '+1';
      cardEl.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
  }

  function renderCart() {
    const total = cartTotal();
    const dis = state.cart.length ? '' : 'disabled';
    $('#gy-cart', root).innerHTML = `
      <div class="gy-cart-head">
        <span class="gy-cart-title">Panier comptoir</span>
        ${state.cart.length ? '<button class="gy-cart-clear" id="gy-cart-clear">Vider</button>' : ''}
      </div>
      <div class="gy-cart-lines" id="gy-cart-lines">
        ${state.cart.length ? state.cart.map((ln, i) => {
          const it = SHOP_ITEM[ln.id];
          return `<div class="gy-cart-line">
            <span class="gy-cart-art">${ART[it.art] || ''}</span>
            <span class="gy-cart-mid"><span class="gy-cart-name">${esc(it.label)}</span><span class="gy-cart-sub">${it.price} MAD / u</span></span>
            <span class="gy-cart-right">
              <span class="gy-cart-price">${fmtMAD(it.price * ln.qty)}</span>
              <span class="gy-cart-qty"><button data-gy-cminus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-gy-cplus="${i}" aria-label="Ajouter">+</button></span>
            </span>
          </div>`;
        }).join('') : `
          <div class="gy-cart-empty">
            <i data-lucide="shopping-bag"></i>
            <div>Panier vide.<br>Touchez un article du comptoir.</div>
          </div>`}
      </div>
      <div class="gy-cart-foot">
        <div class="gy-cart-tot"><span class="lbl">Total</span><span class="val mono" id="gy-cart-val">${fmtMAD(total)}</span></div>
        <button class="gy-cart-pay" id="gy-cart-pay" ${dis}><i data-lucide="banknote"></i> Encaisser</button>
        <div class="gy-cart-note">Rendu calculé automatiquement à l'espèces.</div>
      </div>`;
    icons();
  }

  function payCart() {
    if (!state.cart.length) return;
    const total = cartTotal();
    const summary = state.cart.map((l) => `${l.qty} × ${SHOP_ITEM[l.id].label}`).join(' · ');
    openPay({
      amount: total,
      title: 'Comptoir',
      sub: esc(summary),
      onPaid: (method, rendu) => {
        state.cart = [];
        addRevenue('shop', total);
        postDay(total, method, `Comptoir · ${summary}`, '');
        renderCart(); renderBadges(); icons();
        if (state.view === 'pilotage') renderPilotage();
        toast(`Khlass, ${fmtMAD(total)} encaissé${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      },
    });
  }

  /* ═══════════════════════ PAIEMENT (kit caisse) ═══════════════════════
     cfg = { amount, title, sub, onPaid(method, rendu) } — choix Espèces / Carte. */
  function openPay(cfg) {
    const el = $('#gy-paym', root);
    const veil = openVeil('#gy-pay-veil');
    const close = () => closeVeil(veil);
    const bindX = () => $$('[data-gy-close]', el).forEach((b) => { b.onclick = close; });

    const stepMethod = () => {
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${esc(cfg.title || 'Encaisser')}</h3>
        <p class="modal-subtle">${cfg.sub || ''}</p>
        <div class="modal-amount size-md">${fmtMAD(cfg.amount)}</div>
        <div class="gy-pay-opts">
          <button class="gy-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé tout seul</span></span>
          </button>
          <button class="gy-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
        </div>`;
      icons(); bindX();
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => {
          if (b.dataset.m === 'carte' && state.offline) {
            toast('Hors-ligne, le lecteur carte ne répond pas. Encaissez en espèces.');
            return;
          }
          (b.dataset.m === 'carte' ? stepCard : stepCash)();
        };
      });
    };

    const stepCash = () => {
      let received = cfg.amount;
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces</h3>
        <p class="modal-subtle">${cfg.sub || ''}</p>
        <div class="modal-amount size-md">${fmtMAD(cfg.amount)}</div>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="gy-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="gy-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${cfg.amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-set="exact">Montant exact</button>
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="gy-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="gy-cash-ok">Encaisser</button>
        </div>`;
      icons(); bindX();
      const input = $('#gy-cash-in', el);
      const refresh = () => {
        $('#gy-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - cfg.amount));
        $('#gy-cash-ok', el).disabled = received < cfg.amount;
      };
      input.oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; input.value = received; refresh(); };
      });
      $('[data-set="exact"]', el).onclick = () => { received = cfg.amount; input.value = received; refresh(); };
      refresh();
      $('#gy-cash-ok', el).onclick = () => { close(); cfg.onPaid('especes', Math.max(0, received - cfg.amount)); };
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(cfg.amount)}</h3>
        <p class="modal-subtle">${cfg.sub || ''}</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="gy-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="gy-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons(); bindX();
      setTimeout(() => {
        const disc = $('#gy-reader-disc', el);
        if (!disc || !veil.classList.contains('is-open')) return;
        const status = $('#gy-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(cfg.amount, disc, status).then((result) => {
          icons();
          if (!(result && result.approved)) return;
          setTimeout(() => {
            if (!veil.classList.contains('is-open')) return;
            close();
            cfg.onPaid('carte', 0);
          }, 900);
        });
      }, 1900);
    };

    stepMethod();
  }

  /* ═══════════════════════ MEMBRES (phone-first) ═══════════════════════ */
  function renderMembers() { renderMemberList(); }

  function renderMemberList() {
    const q = state.memberQuery.trim();
    const digits = q.replace(/\D/g, '');
    const ql = q.toLowerCase();
    const hits = !q ? MEMBERS.slice() : MEMBERS.filter((m) =>
      (digits && (m.phone.replace(/\D/g, '').includes(digits) || m.code.includes(digits))) ||
      (!digits && m.name.toLowerCase().includes(ql)));
    /* sort: expired/expiring first when not searching, so attention is drawn */
    if (!q) hits.sort((a, b) => statusRank(a) - statusRank(b) || a.end - b.end);
    const body = $('#gy-mem-body', root);
    body.innerHTML = hits.length ? `<div class="gy-mem-grid">${hits.map(memberCard).join('')}</div>` :
      `<div class="gy-empty">Aucun membre pour « ${esc(q)} », vérifiez le numéro, le nom ou le code badge.</div>`;
    icons();
  }
  function statusRank(m) { return { expired: 0, expiring: 1, frozen: 2, active: 3 }[memberStatus(m)]; }

  function statusPill(m) {
    const s = memberStatus(m);
    const d = daysLeft(m);
    if (s === 'frozen') return '<span class="gy-pill snow"><i data-lucide="snowflake"></i> en pause</span>';
    if (s === 'expired') return `<span class="gy-pill red"><i data-lucide="x-circle"></i> expiré ${Math.abs(d)} j</span>`;
    if (s === 'expiring') return `<span class="gy-pill soon"><i data-lucide="calendar-clock"></i> ${d === 0 ? "dernier jour" : d + ' j'}</span>`;
    return `<span class="gy-pill ok"><i data-lucide="check"></i> à jour · ${d} j</span>`;
  }

  function memberCard(m) {
    return `<button class="gy-mem-card" data-gy-mem="${m.id}">
      <span class="gy-mem-ava ${memberStatus(m) === 'expired' ? 'expired' : memberStatus(m) === 'frozen' ? 'frozen' : memberStatus(m) === 'expiring' ? 'soon' : ''}">${esc(initials(m.name))}</span>
      <span class="gy-mem-l">
        <span class="gy-mem-name">${esc(m.name)}${m.student ? ' <span class="gy-mini-tag">étudiant</span>' : ''}</span>
        <span class="gy-mem-sub mono">${esc(m.code)} · ${esc(m.phone)}</span>
        <span class="gy-mem-row2">${esc(PLAN[m.plan].label)} · ${m.coach !== 'Sans coach' ? esc(m.coach) : 'sans coach'}</span>
      </span>
      <span class="gy-mem-r">${statusPill(m)}<span class="gy-mem-visits"><i data-lucide="activity"></i> ${m.visits} ce mois</span></span>
    </button>`;
  }

  /* ───────────────────────── fiche membre ─────────────────────────── */
  function openMember(id) {
    const m = MEMBER[id];
    if (!m) return;
    const el = $('#gy-memberm', root);
    const s = memberStatus(m);
    const d = daysLeft(m);
    const nextCls = memberNextClass(m.id);
    /* mini-bars : passages des 6 dernières semaines (déterministe à partir des visites) */
    const weeks = visitWeeks(m);
    const maxW = Math.max(...weeks, 1);
    const totalDays = PLAN[m.plan].days;
    const elapsed = Math.max(0, Math.min(totalDays, daysBetween(m.start, new Date())));
    const pct = Math.round((Math.max(0, d) / totalDays) * 100);

    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="gy-mb-head">
        <span class="gy-mb-ava ${s === 'expired' ? 'expired' : s === 'frozen' ? 'frozen' : s === 'expiring' ? 'soon' : ''}">${esc(initials(m.name))}</span>
        <div class="gy-mb-id">
          <h3>${esc(m.name)}${m.student ? ' <span class="gy-mini-tag">étudiant</span>' : ''}</h3>
          <div class="gy-mb-sub mono">badge ${esc(m.code)} · ${esc(m.phone || 'téléphone manquant')}</div>
          <div class="gy-mb-pills">${statusPill(m)}</div>
        </div>
      </div>

      <div class="gy-mb-grid">
        <div class="gy-mb-cell">
          <div class="gy-mb-cell-lbl">Formule</div>
          <div class="gy-mb-cell-val">${esc(PLAN[m.plan].label)}</div>
          <div class="gy-mb-cell-sub">${esc(fmtMAD(planPrice(m.plan, m.student)))}${m.student ? ' · étudiant' : ''}</div>
        </div>
        <div class="gy-mb-cell">
          <div class="gy-mb-cell-lbl">Début</div>
          <div class="gy-mb-cell-val">${esc(fmtLong(m.start))}</div>
          <div class="gy-mb-cell-sub">${esc(String(m.start.getFullYear()))}</div>
        </div>
        <div class="gy-mb-cell ${s === 'expired' ? 'red' : s === 'expiring' ? 'soon' : ''}">
          <div class="gy-mb-cell-lbl">Fin</div>
          <div class="gy-mb-cell-val">${esc(fmtLong(m.end))}</div>
          <div class="gy-mb-cell-sub">${s === 'expired' ? `expiré ${Math.abs(d)} j` : s === 'frozen' ? 'en pause' : `${d} jour${d > 1 ? 's' : ''} restants`}</div>
        </div>
      </div>

      <div class="gy-mb-progress">
        <div class="gy-mb-progress-bar"><i class="${s === 'expired' ? 'red' : s === 'expiring' ? 'soon' : ''}" style="width:${s === 'expired' ? 100 : 100 - pct}%"></i></div>
        <div class="gy-mb-progress-lbl"><span>${esc(fmtLong(m.start))}</span><span>${esc(fmtLong(m.end))}</span></div>
      </div>

      <div class="gy-mb-sec">
        <div class="gy-mb-sec-lbl"><i data-lucide="activity"></i> Passages ce mois <b>${m.visits}</b></div>
        <div class="gy-mb-bars">
          ${weeks.map((v, i) => `<div class="gy-mb-bar"><span class="gy-mb-bar-col"><i style="height:${Math.round((v / maxW) * 100)}%"></i></span><span class="gy-mb-bar-lbl">S${i + 1}</span></div>`).join('')}
        </div>
        <div class="gy-mb-bars-foot">${m.checkedToday ? 'Pointé aujourd\'hui · ' : ''}dernier passage ${m.lastVisitD === 0 ? "aujourd'hui" : m.lastVisitD === -1 ? 'hier' : `il y a ${Math.abs(m.lastVisitD)} jours`}</div>
      </div>

      <div class="gy-mb-meta">
        <div class="gy-mb-meta-row"><span class="gy-mb-meta-ic"><i data-lucide="user-check"></i></span><div><b>Coach assigné</b><span>${m.coach === 'Sans coach' ? 'Aucun, proposer un suivi' : esc(m.coach)}</span></div></div>
        <div class="gy-mb-meta-row"><span class="gy-mb-meta-ic"><i data-lucide="target"></i></span><div><b>Objectif</b><span>${esc(m.goal)}</span></div></div>
        <div class="gy-mb-meta-row"><span class="gy-mb-meta-ic ${m.ptCredits > 0 ? 'on' : ''}"><i data-lucide="dumbbell"></i></span><div><b>Séances de coaching</b><span>${m.ptCredits > 0 ? `${m.ptCredits} séance${m.ptCredits > 1 ? 's' : ''} restante${m.ptCredits > 1 ? 's' : ''}` : 'Aucune, proposer un pack de séances'}</span></div></div>
        ${nextCls ? `<div class="gy-mb-meta-row"><span class="gy-mb-meta-ic on"><i data-lucide="calendar-days"></i></span><div><b>Prochain cours réservé</b><span>${esc(CLASS[nextCls.classId].label)} · ${nextCls.time}${nextCls.state === 'live' ? ' · en cours' : ''}</span></div></div>` : ''}
      </div>

      <div class="gy-mb-actions">
        <button class="gy-btn primary" data-gy-mb-renew><i data-lucide="refresh-cw"></i> ${s === 'expired' ? 'Renouveler' : 'Renouveler / changer'}</button>
        ${s === 'frozen'
          ? '<button class="gy-btn secondary" data-gy-mb-thaw><i data-lucide="play"></i> Réactiver</button>'
          : (s !== 'expired' ? '<button class="gy-btn secondary" data-gy-mb-freeze><i data-lucide="snowflake"></i> Geler</button>' : '')}
        <button class="gy-btn secondary" data-gy-mb-pt><i data-lucide="dumbbell"></i> Séances</button>
        <button class="gy-btn secondary" data-gy-mb-wa><i data-lucide="message-circle"></i> WhatsApp</button>
        ${(s === 'active' || s === 'expiring') ? '<button class="gy-btn ghost" data-gy-mb-checkin><i data-lucide="check-circle-2"></i> Pointer l\'entrée</button>' : ''}
      </div>`;
    openVeil('#gy-member-veil');
    icons();

    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-member-veil'); });
    $('[data-gy-mb-renew]', el).onclick = () => { closeVeil('#gy-member-veil'); openSell(m, { renew: true }); };
    const fz = $('[data-gy-mb-freeze]', el);
    if (fz) fz.onclick = () => { freezeMember(m); openMember(m.id); };
    const tw = $('[data-gy-mb-thaw]', el);
    if (tw) tw.onclick = () => { thawMember(m); openMember(m.id); };
    $('[data-gy-mb-wa]', el).onclick = () => openWa(m);
    $('[data-gy-mb-pt]', el).onclick = () => { closeVeil('#gy-member-veil'); openPtSell(m); };
    const ci = $('[data-gy-mb-checkin]', el);
    if (ci) ci.onclick = () => {
      if (!m.checkedToday) state.inGym++;
      m.checkedToday = true;
      queueIfOffline('Pointage entrée');
      toast(`${firstName(m.name)}, entrée pointée`);
      renderBadges(); openMember(m.id);
      if (state.view === 'checkin') renderCounter();
    };
  }

  /* deterministic weekly visit distribution that sums to m.visits over 4 weeks */
  function visitWeeks(m) {
    const w = [0, 0, 0, 0];
    let seed = m.visits * 7 + m.code.charCodeAt(0);
    for (let k = 0; k < m.visits; k++) {
      seed = (seed * 31 + 17) % 97;
      w[seed % 4]++;
    }
    return w;
  }

  /* ═══════════════════════ WHATSAPP — relance / suivi ═══════════════════════ */
  function waMessage(m) {
    const first = firstName(m.name);
    const gymVenue = pvName('Atlas Fitness') || 'notre salle';
    const s = memberStatus(m);
    const d = daysLeft(m);
    if (s === 'expired') {
      return `Salam ${first} ! On ne t'a pas vu à ${gymVenue} depuis un moment, ton abonnement a expiré il y a ${Math.abs(d)} jours.`
        + `\nReviens quand tu veux : on te garde le tarif ${PLAN[m.plan].label.toLowerCase()} (${planPrice(m.plan, m.student)} MAD) et ${m.coach !== 'Sans coach' ? m.coach + ' t\'attend' : 'un coach pour te relancer'}.`
        + `\nUne séance et on repart fort, nchallah.`
        + `\n— ${gymVenue}, via Kiwi`;
    }
    if (s === 'expiring') {
      return `Salam ${first} ! Ton abonnement ${gymVenue} se termine ${d === 0 ? "aujourd'hui" : 'dans ' + d + ' jour' + (d > 1 ? 's' : '')}.`
        + `\nRenouvelle dès maintenant pour ne pas couper ton élan, ${PLAN[m.plan].label.toLowerCase()} à ${planPrice(m.plan, m.student)} MAD.`
        + `\nObjectif « ${m.goal} » : on y est presque, lâche rien !`
        + `\n— ${gymVenue}, via Kiwi`;
    }
    return `Salam ${first} ! Petit message d'${gymVenue}, continue comme ça, ${m.visits} passages ce mois, c'est du sérieux.`
      + `\nBesoin d'un coup de main sur ton objectif « ${m.goal} » ? ${m.coach !== 'Sans coach' ? m.coach : 'Un coach'} est dispo cette semaine.`
      + `\n— ${gymVenue}, via Kiwi`;
  }

  function openWa(m) {
    const el = $('#gy-wam', root);
    const s = memberStatus(m);
    const head = s === 'expired' ? 'WhatsApp, on te récupère'
      : s === 'expiring' ? 'WhatsApp, relance avant expiration'
      : 'WhatsApp, petit mot de motivation';
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${head}</h3>
      <p class="modal-subtle">${esc(m.name)} ${m.phone ? `· ${esc(m.phone)}` : '· numéro manquant'}</p>
      <div class="gy-wa-bubblewrap">
        <div class="gy-wa-bubble">
          <textarea id="gy-wa-text">${esc(waMessage(m))}</textarea>
          <div class="gy-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <div class="gy-wa-tone" id="gy-wa-tone">
        <span class="gy-wa-tone-lbl">Ton :</span>
        <button class="gy-wa-chip on" data-gy-tone="motivant">Motivant</button>
        <button class="gy-wa-chip" data-gy-tone="court">Court</button>
        <button class="gy-wa-chip" data-gy-tone="offre">Avec offre</button>
      </div>
      <div class="gy-sell-foot">
        <button class="gy-btn ghost" data-gy-close>Plus tard</button>
        <button class="gy-btn primary" id="gy-wa-send" ${m.phone ? '' : 'disabled'}><i data-lucide="send"></i> Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#gy-wa-veil');
    icons();
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-wa-veil'); });
    $('#gy-wa-tone', el).onclick = (e) => {
      const b = e.target.closest('[data-gy-tone]');
      if (!b) return;
      $$('[data-gy-tone]', el).forEach((x) => x.classList.toggle('on', x === b));
      $('#gy-wa-text', el).value = toneMessage(m, b.dataset.gyTone);
    };
    /* Ce bouton annonçait « WhatsApp envoyé » alors que rien ne quittait la
       tablette : le coach croyait le membre relancé, le membre n'a jamais rien
       reçu. Une page web ne peut pas envoyer un WhatsApp toute seule, et ce
       serait malsain qu'elle le puisse — on ouvre donc le brouillon pré-rempli
       avec le texte tel qu'il a été édité, et c'est le coach qui appuie sur
       envoyer. */
    $('#gy-wa-send', el).onclick = () => {
      const txt = $('#gy-wa-text', el);
      const body = txt ? txt.value : waMessage(m);
      const num = String(m.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Pas de numéro pour ${firstName(m.name)}, ajoutez-le à sa fiche`); return; }
      closeVeil('#gy-wa-veil');
      queueIfOffline('Relance WhatsApp');
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${firstName(m.name)}, appuyez sur envoyer`);
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
    };
  }

  function toneMessage(m, tone) {
    const first = firstName(m.name);
    const gymVenue = pvName('Atlas Fitness') || 'notre salle';
    if (tone === 'court') {
      return `Salam ${first} ! Ton abonnement ${gymVenue} ${memberStatus(m) === 'expired' ? 'a expiré' : 'expire bientôt'}. On te garde ta place, passe quand tu veux., ${gymVenue}, via Kiwi`;
    }
    if (tone === 'offre') {
      return `Salam ${first} ! Offre fidélité ${gymVenue} : renouvelle cette semaine et on t'offre une séance coach + un shaker.`
        + `\n${PLAN[m.plan].label} à ${planPrice(m.plan, m.student)} MAD. On t'attend !`
        + `\n— ${gymVenue}, via Kiwi`;
    }
    return waMessage(m);
  }

  /* ───────────────────────── scan modal (member badge) ─────────────── */
  function openScan() { mockScan(); }

  /* ═══════════════════════ PLANNING — cours collectifs ═══════════════════════ */
  const STATE_LBL = { live: 'en cours', soon: 'commence bientôt', upcoming: 'à venir', done: 'terminé' };

  function renderPlanning() {
    renderWeekStrip();
    const body = $('#gy-plan-body', root);
    const order = SCHEDULE.slice().sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.time.localeCompare(b.time));
    const live = order.filter((s) => s.state === 'live');
    const next = order.filter((s) => s.state === 'soon' || s.state === 'upcoming').sort((a, b) => a.time.localeCompare(b.time));
    const done = order.filter((s) => s.state === 'done').sort((a, b) => a.time.localeCompare(b.time));
    const totalBooked = SCHEDULE.reduce((n, s) => n + sessionBooked(s), 0);
    body.innerHTML = `
      <div class="gy-plan-summary">
        <div class="gy-plan-sum-cell"><b>${SCHEDULE.length}</b><span>cours aujourd'hui</span></div>
        <div class="gy-plan-sum-cell"><b>${totalBooked}</b><span>réservations</span></div>
        <div class="gy-plan-sum-cell"><b>${next.length}</b><span>à venir</span></div>
        <div class="gy-plan-sum-cell live"><b>${live.length}</b><span>en cours</span></div>
      </div>
      ${live.length ? `<div class="gy-plan-secl"><i class="gy-live-dot"></i> En cours</div><div class="gy-class-list">${live.map(sessionCard).join('')}</div>` : ''}
      <div class="gy-plan-secl">À venir</div>
      <div class="gy-class-list">${next.length ? next.map(sessionCard).join('') : '<div class="gy-empty">Plus de cours à venir aujourd\'hui.</div>'}</div>
      <div class="gy-plan-secl muted">Terminés</div>
      <div class="gy-class-list dim">${done.map(sessionCard).join('')}</div>`;
    icons();
  }

  function renderWeekStrip() {
    const el = $('#gy-week', root);
    if (!el) return;
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const wd = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const on = daysBetween(d, today) === 0;
      html += `<span class="gy-week-day ${on ? 'on' : ''}"><span class="gy-week-d">${wd[i]}</span><b>${d.getDate()}</b></span>`;
    }
    el.innerHTML = html;
  }

  function sessionCard(s) {
    const c = classOf(s);
    const booked = sessionBooked(s), places = sessionPlaces(s), full = sessionFull(s);
    const pct = Math.min(100, Math.round((booked / s.cap) * 100));
    const capLine = s.state === 'done'
      ? `${sessionPresent(s)} présents · ${booked}/${s.cap} inscrits`
      : full
        ? (sessionWait(s) ? `complet · ${sessionWait(s)} en liste d'attente` : 'complet')
        : `${booked}/${s.cap} inscrits · ${places} place${places > 1 ? 's' : ''} libre${places > 1 ? 's' : ''}`;
    return `<button class="gy-class-card st-${s.state} ${full ? 'is-full' : ''}" data-gy-session="${s.id}">
      <span class="gy-class-time"><b>${s.time}</b><span>${c.dur} min</span></span>
      <span class="gy-class-art">${classArt(c.art)}</span>
      <span class="gy-class-main">
        <span class="gy-class-name">${esc(c.label)}</span>
        <span class="gy-class-meta"><i data-lucide="user"></i> ${esc(c.coach.replace('Coach ', ''))}<span class="gy-dot-sep">·</span><i data-lucide="map-pin"></i> ${esc(c.room)}</span>
        <span class="gy-class-capbar"><i style="width:${pct}%" class="${full ? 'full' : ''}"></i></span>
        <span class="gy-class-capline">${capLine}</span>
      </span>
      <span class="gy-class-side">
        <span class="gy-class-state ${s.state}">${s.state === 'live' ? '<i class="gy-live-dot"></i> ' : ''}${STATE_LBL[s.state]}</span>
        <span class="gy-class-cta">${s.state === 'done' ? 'présences' : 'gérer'} <i data-lucide="chevron-right"></i></span>
      </span>
    </button>`;
  }

  /* ───────────────────────── feuille de présence / roster ─────────────────── */
  function openRoster(sessionId) {
    const s = sessionById(sessionId);
    if (!s) return;
    const el = $('#gy-rosterm', root);
    const c = classOf(s);
    const render = () => {
      const booked = sessionBooked(s), full = sessionFull(s), places = sessionPlaces(s);
      const pct = Math.min(100, Math.round((booked / s.cap) * 100));
      const canCheck = s.state === 'live' || s.state === 'soon';
      const named = s.booked.map((id) => MEMBER[id]).filter(Boolean);
      const present = s.checkedIn.length;
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="gy-rost-head">
          <span class="gy-rost-art">${classArt(c.art)}</span>
          <div class="gy-rost-id">
            <h3 class="modal-title" style="margin:0">${esc(c.label)}</h3>
            <p class="modal-subtle" style="margin-top:3px">${s.time} · ${c.dur} min · ${esc(c.coach)} · ${esc(c.room)}</p>
          </div>
          <span class="gy-class-state ${s.state}">${s.state === 'live' ? '<i class="gy-live-dot"></i> ' : ''}${STATE_LBL[s.state]}</span>
        </div>
        <div class="gy-rost-cap">
          <div class="gy-rost-cap-l"><b>${booked}</b> / ${s.cap} inscrits${s.state === 'done' || s.state === 'live' ? ` · <b>${present + (s.state === 'done' ? Math.round(s.extra * 0.82) : 0)}</b> présents` : full ? ` · complet` : ` · ${places} place${places > 1 ? 's' : ''}`}</div>
          <div class="gy-class-capbar lg"><i style="width:${pct}%" class="${full ? 'full' : ''}"></i></div>
        </div>
        ${canCheck ? `<div class="gy-rost-hint"><i data-lucide="info"></i> Pointez chaque membre à son arrivée, la présence compte aussi comme une entrée salle.</div>` : ''}
        <div class="gy-f-lbl" style="margin-top:6px">Inscrits ${named.length ? `· ${named.length} nominatifs` : ''}</div>
        <div class="gy-rost-list">
          ${named.map((m) => rosterRow(s, m.id, canCheck)).join('') || '<div class="gy-empty">Aucun inscrit nominatif.</div>'}
          ${s.extra > 0 ? `<div class="gy-rost-extra"><span class="gy-mem-ava mut">+${s.extra}</span><span class="gy-rost-l"><b>${s.extra} autres membres</b><span>réservés via l'app Kiwi Membre</span></span></div>` : ''}
        </div>
        ${sessionWait(s) ? `
          <div class="gy-f-lbl" style="margin-top:14px">Liste d'attente · ${sessionWait(s)}</div>
          <div class="gy-rost-list">
            ${s.wait.map((id) => { const m = MEMBER[id]; return m ? `<div class="gy-rost-row wait"><span class="gy-mem-ava soon">${esc(initials(m.name))}</span><span class="gy-rost-l"><b>${esc(m.name)}</b><span>prévenu si une place se libère</span></span><span class="gy-rost-tag">en attente</span></div>` : ''; }).join('')}
            ${s.waitExtra > 0 ? `<div class="gy-rost-extra"><span class="gy-mem-ava mut">+${s.waitExtra}</span><span class="gy-rost-l"><b>${s.waitExtra} en attente</b><span>via l'app</span></span></div>` : ''}
          </div>` : ''}
        <div class="gy-sell-foot">
          <button class="gy-btn ghost" data-gy-close>Fermer</button>
          <button class="gy-btn primary" data-gy-rost-book><i data-lucide="user-plus"></i> ${full ? 'Ajouter à la liste d\'attente' : 'Réserver un membre'}</button>
        </div>`;
      icons();
      $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-roster-veil'); });
      $$('[data-gy-rost-in]', el).forEach((b) => { b.onclick = () => { classCheckIn(s, b.dataset.gyRostIn); render(); refreshOps(); }; });
      $('[data-gy-rost-book]', el).onclick = () => {
        openPick({
          title: `Réserver, ${c.label} · ${s.time}`,
          sub: full ? 'Cours complet : le membre ira en liste d\'attente.' : `${places} place${places > 1 ? 's' : ''} libre${places > 1 ? 's' : ''}.`,
          exclude: s.booked.concat(s.wait),
          onPick: (mid) => { bookIntoSession(s, mid); render(); refreshOps(); },
        });
      };
    };
    render();
    openVeil('#gy-roster-veil');
  }

  function rosterRow(s, mid, canCheck) {
    const m = MEMBER[mid];
    if (!m) return '';
    const inn = s.checkedIn.includes(mid);
    return `<div class="gy-rost-row ${inn ? 'in' : ''}">
      <span class="gy-mem-ava ${memberStatus(m) === 'expired' ? 'expired' : memberStatus(m) === 'expiring' ? 'soon' : ''}">${esc(initials(m.name))}</span>
      <span class="gy-rost-l"><b>${esc(m.name)}</b><span>${esc(PLAN[m.plan].label)}${m.coach !== 'Sans coach' ? ' · ' + esc(m.coach) : ''}</span></span>
      ${inn
        ? '<span class="gy-rost-tag in"><i data-lucide="check-circle-2"></i> présent</span>'
        : canCheck
          ? `<button class="gy-btn sm secondary" data-gy-rost-in="${mid}"><i data-lucide="check"></i> Pointer</button>`
          : '<span class="gy-rost-tag">inscrit</span>'}
    </div>`;
  }

  function classCheckIn(s, mid) {
    if (s.checkedIn.includes(mid)) return;
    s.checkedIn.push(mid);
    const m = MEMBER[mid];
    if (m && !m.checkedToday) { m.checkedToday = true; state.inGym++; }
    queueIfOffline('Présence cours');
    toast(`${m ? firstName(m.name) : 'Membre'}, présent au cours`);
  }

  function bookIntoSession(s, mid) {
    const m = MEMBER[mid];
    if (!m) return;
    if (s.booked.includes(mid) || s.wait.includes(mid)) { toast('Déjà inscrit à ce cours'); return; }
    if (sessionFull(s)) { s.wait.push(mid); queueIfOffline('Liste d\'attente'); toast(`${firstName(m.name)}, ajouté à la liste d'attente`); }
    else { s.booked.push(mid); queueIfOffline('Réservation cours'); toast(`${firstName(m.name)}, réservé · ${classOf(s).label} à ${s.time}`); }
  }

  /* ───────────────────────── member picker (générique) ─────────────────────
     cfg = { title, sub, exclude:[ids], onPick(mid) } */
  function openPick(cfg) {
    cfg = cfg || {};
    const el = $('#gy-pickm', root);
    const base = MEMBERS.filter((m) => !(cfg.exclude || []).includes(m.id));
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${esc(cfg.title || 'Choisir un membre')}</h3>
      <p class="modal-subtle">${esc(cfg.sub || 'Cherchez par nom, code badge ou téléphone.')}</p>
      <div class="gy-pick-search"><i data-lucide="search"></i><input id="gy-pick-q" inputmode="search" placeholder="nom, code ou 06…" autocomplete="off" /></div>
      <div class="gy-pick-list" id="gy-pick-list"></div>`;
    openVeil('#gy-pick-veil');
    icons();
    const renderList = (q) => {
      q = (q || '').trim();
      const digits = q.replace(/\D/g, ''), ql = q.toLowerCase();
      const hits = !q ? base : base.filter((m) =>
        (digits && (m.phone.replace(/\D/g, '').includes(digits) || m.code.includes(digits))) ||
        (!digits && m.name.toLowerCase().includes(ql)));
      $('#gy-pick-list', el).innerHTML = hits.length ? hits.map((m) => `
        <button class="gy-cl-row" data-gy-pick="${m.id}">
          <span class="gy-mem-ava ${memberStatus(m) === 'expired' ? 'expired' : memberStatus(m) === 'expiring' ? 'soon' : memberStatus(m) === 'frozen' ? 'frozen' : ''}">${esc(initials(m.name))}</span>
          <span class="gy-cl-mid"><span class="gy-cl-name">${esc(m.name)}</span><span class="gy-cl-sub">${esc(PLAN[m.plan].label)} · ${esc(m.phone)}</span></span>
          <span class="gy-cl-right">${statusPill(m)}</span>
        </button>`).join('') : `<div class="gy-empty">Aucun membre pour « ${esc(q)} ».</div>`;
      icons();
    };
    renderList('');
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-pick-veil'); });
    const q = $('#gy-pick-q', el);
    q.oninput = () => { renderList(q.value); const i = $('#gy-pick-q', el); i.focus(); moveCaretEnd(i); };
    $('#gy-pick-list', el).onclick = (e) => {
      const b = e.target.closest('[data-gy-pick]');
      if (!b) return;
      closeVeil('#gy-pick-veil');
      if (typeof cfg.onPick === 'function') cfg.onPick(b.dataset.gyPick);
    };
    setTimeout(() => { const i = $('#gy-pick-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ COACHS — séances perso (PT) ═══════════════════════ */
  function renderCoachs() {
    const body = $('#gy-coach-body', root);
    const totalCredits = MEMBERS.reduce((n, m) => n + m.ptCredits, 0);
    const ptToday = Object.values(PT_TODAY).reduce((s, arr) => s + arr.length, 0);
    body.innerHTML = `
      <div class="gy-coach-intro">
        <div class="gy-coach-intro-l">
          <b>Coaching personnel</b>
          <span>Vendez des packs de séances, suivez la journée de chaque coach. <b class="gy-ci-strong">${totalCredits}</b> séances créditées chez les membres · <b class="gy-ci-strong">${ptToday}</b> séances perso aujourd'hui.</span>
        </div>
      </div>
      <div class="gy-coach-grid">${COACHES.map(coachCard).join('')}</div>`;
    icons();
  }

  function coachCard(c) {
    const day = coachDay(c.id);
    const ptCount = coachPTCount(c.id);
    const classCount = coachClasses(c.name).length;
    const mem = coachMembers(c.name);
    return `<div class="gy-coach-card">
      <div class="gy-coach-head" data-gy-coach="${c.id}">
        <span class="gy-coach-ava">${esc(initials(c.name))}</span>
        <span class="gy-coach-id"><b>${esc(c.name)}</b><span>${esc(c.tag)}</span></span>
        <i data-lucide="chevron-right" class="gy-coach-chev"></i>
      </div>
      <div class="gy-coach-stats">
        <span><b>${classCount}</b> cours</span><span><b>${ptCount}</b> perso</span><span><b>${mem.length}</b> suivis</span>
      </div>
      <div class="gy-coach-tl">
        ${day.length ? day.map(coachRow).join('') : '<div class="gy-coach-tl-empty">Journée libre, disponible pour une séance.</div>'}
      </div>
      <div class="gy-coach-foot">
        <button class="gy-btn secondary sm" data-gy-coach="${c.id}"><i data-lucide="calendar"></i> La journée</button>
        <button class="gy-btn primary sm" data-gy-coach-sell="${c.id}"><i data-lucide="plus"></i> Vendre des séances</button>
      </div>
    </div>`;
  }

  function coachRow(r) {
    if (r.kind === 'class') {
      const c = classOf(r.session);
      return `<div class="gy-ctl-row st-${r.state}">
        <span class="gy-ctl-time">${r.time}</span>
        <span class="gy-ctl-dot cls"></span>
        <span class="gy-ctl-l"><b>${esc(c.label)}</b><span>cours collectif · ${sessionBooked(r.session)}/${r.session.cap}</span></span>
        ${r.state === 'live' ? '<span class="gy-ctl-live"><i class="gy-live-dot"></i> live</span>' : r.state === 'done' ? '<span class="gy-ctl-done">terminé</span>' : ''}
      </div>`;
    }
    const m = MEMBER[r.mid];
    return `<div class="gy-ctl-row st-${r.state}">
      <span class="gy-ctl-time">${r.time}</span>
      <span class="gy-ctl-dot pt"></span>
      <span class="gy-ctl-l"><b>${m ? esc(firstName(m.name)) : 'Séance'} · perso</b><span>${esc(r.focus)}</span></span>
      ${r.state === 'done' ? '<span class="gy-ctl-done">terminé</span>' : ''}
    </div>`;
  }

  function openCoach(coachId) {
    const c = COACH[coachId];
    if (!c) return;
    const el = $('#gy-coachm', root);
    const day = coachDay(coachId);
    const mem = coachMembers(c.name);
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="gy-coach-mhead">
        <span class="gy-coach-ava lg">${esc(initials(c.name))}</span>
        <div class="gy-coach-mid"><h3 class="modal-title" style="margin:0">${esc(c.name)}</h3><p class="modal-subtle" style="margin-top:3px">${esc(c.tag)}</p></div>
      </div>
      <div class="gy-coach-mstats">
        <div><b>${coachClasses(c.name).length}</b><span>cours aujourd'hui</span></div>
        <div><b>${coachPTCount(coachId)}</b><span>séances perso</span></div>
        <div><b>${mem.length}</b><span>membres suivis</span></div>
      </div>
      <div class="gy-f-lbl" style="margin-top:14px">Journée, ${fmtDay(new Date())}</div>
      <div class="gy-coach-mtl">${day.length ? day.map(coachRow).join('') : '<div class="gy-coach-tl-empty">Journée libre.</div>'}</div>
      <div class="gy-f-lbl" style="margin-top:14px">Membres suivis · ${mem.length}</div>
      <div class="gy-coach-mem">${mem.length ? mem.map((m) => `
        <button class="gy-cl-row" data-gy-coach-mem="${m.id}">
          <span class="gy-mem-ava ${memberStatus(m) === 'expired' ? 'expired' : ''}">${esc(initials(m.name))}</span>
          <span class="gy-cl-mid"><span class="gy-cl-name">${esc(m.name)}</span><span class="gy-cl-sub">${esc(m.goal)}</span></span>
          <span class="gy-cl-right"><b>${m.ptCredits}</b> séance${m.ptCredits > 1 ? 's' : ''}</span>
        </button>`).join('') : '<div class="gy-empty">Aucun membre rattaché à ce coach.</div>'}</div>
      <div class="gy-sell-foot">
        <button class="gy-btn ghost" data-gy-close>Fermer</button>
        <button class="gy-btn primary" data-gy-coach-sell2><i data-lucide="plus"></i> Vendre des séances</button>
      </div>`;
    openVeil('#gy-coach-veil');
    icons();
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-coach-veil'); });
    $('[data-gy-coach-sell2]', el).onclick = () => { closeVeil('#gy-coach-veil'); openPtSell(null, coachId); };
    $$('[data-gy-coach-mem]', el).forEach((b) => { b.onclick = () => { closeVeil('#gy-coach-veil'); openMember(b.dataset.gyCoachMem); }; });
  }

  /* ───────────────────────── vendre un pack de séances ─────────────────────── */
  function openPtSell(member, coachId) {
    const el = $('#gy-ptpackm', root);
    const sel = { pack: 'pt5', member: member || null, coach: coachId || (member && member.coach !== 'Sans coach' && COACH_BY_NAME[member.coach] ? COACH_BY_NAME[member.coach].id : null) };
    const render = () => {
      const pk = PT_PACKS.find((p) => p.id === sel.pack);
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Vendre des séances de coaching</h3>
        <p class="modal-subtle">${sel.member ? esc(sel.member.name) + ' · ' + esc(sel.member.phone || 'sans téléphone') : 'Choisissez le pack, puis le membre à créditer.'}</p>
        <div class="gy-f"><div class="gy-f-lbl">Pack de séances</div>
          <div class="gy-plan-pick">${PT_PACKS.map((p) => `
            <button class="gy-plan-opt ${p.id === sel.pack ? 'on' : ''}" data-gy-pp="${p.id}">
              ${p.flag ? `<span class="gy-pp-flag">${esc(p.flag)}</span>` : ''}
              <span class="gy-plan-opt-name">${p.n} séance${p.n > 1 ? 's' : ''}</span>
              <span class="gy-plan-opt-price mono">${esc(fmtMAD(p.price))}</span>
              <span class="gy-plan-opt-sub">${esc(p.sub)}</span>
            </button>`).join('')}</div>
        </div>
        <div class="gy-f"><div class="gy-f-lbl">Membre</div>
          <button class="gy-ptsell-mem ${sel.member ? 'set' : ''}" id="gy-pt-mem">
            ${sel.member
              ? `<span class="gy-mem-ava ${memberStatus(sel.member) === 'expired' ? 'expired' : ''}">${esc(initials(sel.member.name))}</span><span class="gy-cl-mid"><span class="gy-cl-name">${esc(sel.member.name)}</span><span class="gy-cl-sub">${sel.member.ptCredits} séance${sel.member.ptCredits > 1 ? 's' : ''} déjà au compteur</span></span><span class="gy-cl-right">changer</span>`
              : '<span class="gy-ptsell-pick"><i data-lucide="user-plus"></i> Choisir le membre</span>'}
          </button>
        </div>
        <div class="gy-f"><div class="gy-f-lbl">Coach (optionnel)</div>
          <div class="gy-coach-chips">${COACHES.map((c) => `<button class="gy-coach-chip ${sel.coach === c.id ? 'on' : ''}" data-gy-cc="${c.id}">${esc(c.name)}</button>`).join('')}</div>
        </div>
        <div class="gy-sell-summary">
          <div class="gy-sell-sum-row"><span>${pk.n} séance${pk.n > 1 ? 's' : ''} de coaching${sel.coach ? ' · ' + esc(COACH[sel.coach].name) : ''}</span><b>${esc(fmtMAD(pk.price))}</b></div>
          <div class="gy-sell-sum-row total"><span>À encaisser</span><b class="mono">${esc(fmtMAD(pk.price))}</b></div>
        </div>
        <div class="gy-sell-foot">
          <button class="gy-btn ghost" data-gy-close>Annuler</button>
          <button class="gy-btn primary" id="gy-pt-pay" ${sel.member ? '' : 'disabled'}><i data-lucide="banknote"></i> Encaisser ${esc(fmtMAD(pk.price))}</button>
        </div>`;
      icons();
      $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-ptpack-veil'); });
      $$('[data-gy-pp]', el).forEach((b) => { b.onclick = () => { sel.pack = b.dataset.gyPp; render(); }; });
      $$('[data-gy-cc]', el).forEach((b) => { b.onclick = () => { sel.coach = sel.coach === b.dataset.gyCc ? null : b.dataset.gyCc; render(); }; });
      $('#gy-pt-mem', el).onclick = () => {
        openPtSellKeepOpen();
        openPick({
          title: 'Membre pour le pack', sub: 'À qui créditer les séances ?',
          onPick: (mid) => {
            sel.member = MEMBER[mid];
            if (!sel.coach && sel.member.coach !== 'Sans coach' && COACH_BY_NAME[sel.member.coach]) sel.coach = COACH_BY_NAME[sel.member.coach].id;
            render(); openVeil('#gy-ptpack-veil');
          },
        });
      };
      const pay = $('#gy-pt-pay', el);
      if (pay) pay.onclick = () => {
        closeVeil('#gy-ptpack-veil');
        openPay({
          amount: pk.price, title: 'Séances de coaching',
          sub: `${esc(sel.member.name)} · ${pk.n} séance${pk.n > 1 ? 's' : ''}`,
          onPaid: (method, rendu) => {
            sel.member.ptCredits += pk.n;
            if (sel.coach && sel.member.coach === 'Sans coach') sel.member.coach = COACH[sel.coach].name;
            addRevenue('coaching', pk.price);
            postDay(pk.price, method, `Coaching · ${pk.n} séance${pk.n > 1 ? 's' : ''} · ${sel.member.name}`, sel.member.code || '');
            queueIfOffline('Vente séances coaching');
            toast(`${firstName(sel.member.name)}, ${pk.n} séance${pk.n > 1 ? 's' : ''} ajoutée${pk.n > 1 ? 's' : ''}${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
            refreshOps();
          },
        });
      };
    };
    /* opening the picker hides this veil so they don't stack; we reopen on pick */
    const openPtSellKeepOpen = () => closeVeil('#gy-ptpack-veil');
    render();
    openVeil('#gy-ptpack-veil');
  }

  /* ═══════════════════════ PILOTAGE — le tableau de bord du gérant ═══════════ */
  function renderPilotage() {
    const body = $('#gy-pilot-body', root);
    const passages = passagesToday();
    const exp = MEMBERS.filter((m) => { const s = memberStatus(m); return s === 'expiring' || s === 'expired'; }).length;
    const occ = Math.min(100, Math.round((state.inGym / CLUB.capacity) * 100));
    const rev = state.dayRevenue, revTot = revenueTotal();
    const attend = CLUB.attend7.slice(); attend[6] = passages;
    const maxA = Math.max.apply(null, attend.concat([1]));
    const wd = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const newM = CLUB.newThisMonth, churn = CLUB.churnThisMonth, net = newM - churn;
    body.innerHTML = `
      <div class="gy-kpi-grid">
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="users"></i></span><span class="gy-kpi-trend up"><i data-lucide="trending-up"></i> +${newM} ce mois</span></div>
          <div class="gy-kpi-val">${activeCount()}</div>
          <div class="gy-kpi-lbl">Membres actifs</div>
        </div>
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="repeat"></i></span><span class="gy-kpi-trend">/ mois</span></div>
          <div class="gy-kpi-val">${esc(fmtMAD(CLUB.mrr))}</div>
          <div class="gy-kpi-lbl">Revenu récurrent (MRR)</div>
        </div>
        <div class="gy-kpi feat">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="banknote"></i></span><span class="gy-kpi-trend live"><i class="gy-live-dot"></i> en direct</span></div>
          <div class="gy-kpi-val">${esc(fmtMAD(revTot))}</div>
          <div class="gy-kpi-lbl">Recette du jour</div>
        </div>
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="scan-line"></i></span></div>
          <div class="gy-kpi-val">${passages}</div>
          <div class="gy-kpi-lbl">Passages aujourd'hui</div>
        </div>
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="activity"></i></span><span class="gy-kpi-trend mono">${state.inGym}/${CLUB.capacity}</span></div>
          <div class="gy-kpi-val">${occ}<span class="gy-kpi-unit">%</span></div>
          <div class="gy-kpi-lbl">Occupation salle</div>
          <div class="gy-kpi-bar"><i style="width:${occ}%"></i></div>
        </div>
      </div>

      <div class="gy-pilot-cols">
        <div class="gy-pilot-card">
          <div class="gy-pilot-card-h"><b>Fréquentation, 7 derniers jours</b><span class="mono">${passages} auj.</span></div>
          <div class="gy-att-bars">${attend.map((v, i) => `<div class="gy-att-bar ${i === 6 ? 'today' : ''}"><span class="gy-att-col"><i style="height:${Math.round((v / maxA) * 100)}%"></i></span><span class="gy-att-v mono">${v}</span><span class="gy-att-d">${wd[i]}</span></div>`).join('')}</div>
        </div>
        <div class="gy-pilot-card">
          <div class="gy-pilot-card-h"><b>Recette du jour</b><span class="mono">${esc(fmtMAD(revTot))}</span></div>
          <div class="gy-rev-rows">
            ${revRow('Abonnements', 'badge-check', rev.abos, revTot)}
            ${revRow('Coaching', 'dumbbell', rev.coaching, revTot)}
            ${revRow('Comptoir', 'shopping-bag', rev.shop, revTot)}
            ${revRow('Séances / pass', 'ticket', rev.pass, revTot)}
          </div>
        </div>
      </div>

      <div class="gy-pilot-cols">
        <div class="gy-pilot-card">
          <div class="gy-pilot-card-h"><b>Répartition des formules</b><span>${activeCount()} actifs</span></div>
          <div class="gy-mix">${CLUB.mix.map((x) => `<div class="gy-mix-row"><span class="gy-mix-lbl">${esc(PLAN[x.id].label)}</span><span class="gy-mix-bar"><i class="m-${x.id}" style="width:${x.pct}%"></i></span><span class="gy-mix-pct mono">${x.pct}%</span></div>`).join('')}</div>
          <div class="gy-mix-foot"><span><b class="up">+${newM}</b> nouveaux</span><span><b class="down">−${churn}</b> partis</span><span>net <b>${net >= 0 ? '+' : ''}${net}</b></span></div>
        </div>
        <button class="gy-pilot-card relance" data-gy-pilot-relance>
          <div class="gy-pilot-card-h"><b>À relancer</b><span class="gy-pill ${exp ? 'red' : 'ok'}">${exp || '0'}</span></div>
          <div class="gy-relance-l">${exp ? `${exp} abonnement${exp > 1 ? 's' : ''} expire${exp > 1 ? 'nt' : ''} cette semaine ou ${exp > 1 ? 'ont' : 'a'} déjà expiré. Un message WhatsApp motivant est prêt pour chacun.` : 'Aucune relance en attente, la rétention est bonne.'}</div>
          <span class="gy-relance-cta">Ouvrir les relances <i data-lucide="arrow-right"></i></span>
        </button>
      </div>

      <div class="gy-pilot-foot">Données de démonstration, le club entier (${activeCount()} membres) ; les 10 fiches nominatives sont l'échantillon manipulable du comptoir.</div>`;
    icons();
  }

  function revRow(label, icon, val, tot) {
    const pct = tot ? Math.round((val / tot) * 100) : 0;
    return `<div class="gy-rev-row"><span class="gy-rev-ic"><i data-lucide="${icon}"></i></span><span class="gy-rev-lbl">${esc(label)}</span><span class="gy-rev-track"><i style="width:${pct}%"></i></span><span class="gy-rev-val mono">${esc(fmtMAD(val))}</span></div>`;
  }

  /* ═══════════════════════ SÉANCE UNIQUE / PASS JOURNÉE (drop-in) ════════════ */
  const DAY_PASSES = [
    { id: 'unique', label: 'Séance unique', price: 50, sub: '1 accès · aujourd\'hui' },
    { id: 'jour',   label: 'Pass journée',  price: 80, sub: 'accès illimité · journée', flag: 'tout compris' },
    { id: 'duo',    label: 'Pass duo',      price: 90, sub: '2 personnes · 1 séance' },
  ];
  function openDayPass() {
    const el = $('#gy-passm', root);
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Séance unique / Pass journée</h3>
      <p class="modal-subtle">Pour un visiteur sans abonnement, touriste, invité, séance d'essai. Accès immédiat, sans créer de fiche.</p>
      <div class="gy-pass-grid">${DAY_PASSES.map((p) => `
        <button class="gy-pass-card" data-gy-pass="${p.id}">
          ${p.flag ? `<span class="gy-shop-flag">${esc(p.flag)}</span>` : ''}
          <span class="gy-pass-art">${ART.pass}</span>
          <span class="gy-pass-name">${esc(p.label)}</span>
          <span class="gy-pass-price"><b>${p.price}</b> MAD</span>
          <span class="gy-pass-sub">${esc(p.sub)}</span>
        </button>`).join('')}</div>
      <div class="gy-pass-note"><i data-lucide="info"></i> Le pass ouvre le tourniquet une fois. Proposez l'abonnement si le visiteur revient, c'est là que la conversion se joue.</div>`;
    openVeil('#gy-pass-veil');
    icons();
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-pass-veil'); });
    $$('[data-gy-pass]', el).forEach((b) => {
      b.onclick = () => {
        const p = DAY_PASSES.find((x) => x.id === b.dataset.gyPass);
        closeVeil('#gy-pass-veil');
        openPay({
          amount: p.price, title: p.label, sub: 'Accès visiteur, sans abonnement',
          onPaid: (method, rendu) => {
            BASE_PASSAGES += (p.id === 'duo' ? 2 : 1);
            state.passesToday += 1;
            state.inGym += (p.id === 'duo' ? 2 : 1);
            addRevenue('pass', p.price);
            postDay(p.price, method, `Pass · ${p.label}`, '');
            queueIfOffline('Séance unique / pass');
            toast(`${p.label} vendu, accès ouvert${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
            refreshOps();
            if (state.view === 'checkin') renderCounter();
          },
        });
      };
    });
  }

  /* ═══════════════════════ refresh ops behind modals ═══════════════════════ */
  function refreshOps() {
    renderBadges();
    if (state.view === 'abos') renderAbo();
    if (state.view === 'membres') renderMemberList();
    if (state.view === 'checkin') { renderCounter(); renderQuickCodes(); }
    if (state.view === 'planning') renderPlanning();
    if (state.view === 'coachs') renderCoachs();
    if (state.view === 'pilotage') renderPilotage();
    icons();
  }

  /* ═══════════════════════ OFFLINE (file d'attente simulée) ═══════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline) {
      if (state.queued) {
        toast(`Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`);
        state.queued = 0;
      } else {
        toast('Réseau de retour, tout est synchronisé');
      }
    } else {
      toast('Mode hors-ligne, la salle continue de tourner, tout est mis en file');
    }
    renderNet();
  }

  function renderNet() {
    const net = $('#gy-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.gy-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.gy-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'gy-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#gy-offline-note', root);
    note.hidden = !state.offline;
    $('#gy-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'gym',
    greet: {
      line1: 'Sba7 lkhir Coach Amine,',
      em: 'marhba.',
      sub: 'Atlas Fitness <em>·</em> comptoir, check-in du jour',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() {
      if (!root) return;
      renderAll();
      setTimeout(() => { const i = $('#gy-ci-input', root); if (i && state.view === 'checkin') i.focus(); }, 80);
    },
  });
})();
