/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · SALLE DE SPORT — Atlas Fitness (PIN 0015), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Le comptoir d'une salle de sport tient sur un geste : le check-in. Un membre
 * présente son code, l'écran flashe VERT (« Bienvenue Omar — abonnement jusqu'au
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
  /* centimes visibles quand il y en a (« 14,50 MAD », jamais « 15 ») */
  const fmtMAD = (n) => { const v = Math.round((+n || 0) * 100) / 100; return new Intl.NumberFormat('fr-FR', { useGrouping: true, minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v) + ' MAD'; };
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  /* Pluriel français : 0 et 1 prennent le singulier (« 1 passage », « 0 présent »). */
  const pl = (n, one, many) => (Math.abs(n) < 2 ? one : many);

  /* real-store detection : neutralize seeded demo PEOPLE for a paired merchant,
     while the local demo (pvReal() === false) stays byte-identical. */
  function pvPaired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!window.KiwiPlatform?.isPaired?.() || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
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
  /* Salle réelle : les formules sont CELLES DU COMMERÇANT (tableau de bord,
     « Abonnements »), relues par refreshReal() plus bas. Mensuel 250, trimestriel
     650, annuel 2 200 et « tarif étudiant 20 % » étaient des prix de Tanger 2026
     posés sur n'importe quelle salle : la caisse les vendait sans que le gérant
     les ait jamais saisis. Une formule retirée depuis reste lisible sur la fiche
     d'un membre (fiche fantôme, sans prix inventé). */
  if (pvReal()) PLANS.length = 0;
  const PLAN_T = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  const PLAN = pvReal() ? new Proxy(PLAN_T, {
    get(t, k) {
      if (typeof k !== 'string' || k in t) return t[k];
      return { id: k, label: 'Formule retirée', price: 0, days: 30, sub: '', icon: 'calendar', ghost: true };
    },
  }) : PLAN_T;
  /* la remise étudiante n'existe pas dans le tableau de bord : aucun taux inventé */
  const STUDENT_OFF = pvReal() ? 0 : 0.20;
  const planPrice = (planId, student) => Math.round(PLAN[planId].price * (student ? 1 - STUDENT_OFF : 1) * 100) / 100;
  /* ce que CE membre a réellement payé (formule sans prix saisi, formule libre) */
  const memberPrice = (m) => (pvReal() && m.paid > 0 ? m.paid : planPrice(m.plan, m.student));

  /* ───────────────────────── comptoir (extras) ───────────────────────── */
  const SHOP = [
    { id: 'eau',        label: 'Eau 50 cl',         price: 6,   art: 'eau' },
    { id: 'barre',      label: 'Barre protéinée',   price: 18,  art: 'barre' },
    { id: 'shaker',     label: 'Shaker + dose whey', price: 25,  art: 'shaker' },
    { id: 'serviette',  label: 'Location serviette', price: 10,  art: 'serviette' },
    { id: 'coach',      label: 'Séance coach perso', price: 150, art: 'coach', flag: '1 h' },
  ];
  /* Comptoir réel : les articles du gérant (tableau de bord, « Comptoir, coaching
     & pass »), jamais l'eau à 6 MAD ni la séance coach à 150 MAD de la démo. */
  if (pvReal()) SHOP.length = 0;
  const SHOP_ITEM_T = Object.fromEntries(SHOP.map((s) => [s.id, s]));
  const SHOP_ITEM = pvReal() ? new Proxy(SHOP_ITEM_T, {
    get(t, k) {
      if (typeof k !== 'string' || k in t) return t[k];
      return { id: k, label: 'Article retiré', price: 0, art: 'barre', ghost: true };
    },
  }) : SHOP_ITEM_T;

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
    /* real store : l'équipe est celle du commerçant (fiche « Coachs » du tableau
       de bord, à défaut son Équipe), relue par refreshReal(). « Coach 1 · 2 · 3 »
       étaient trois coachs inventés. */
    return pvReal() ? [] : seed;
  })();
  const COACH_T = Object.fromEntries(COACHES.map((c) => [c.id, c]));
  const COACH = pvReal() ? new Proxy(COACH_T, {
    get(t, k) {
      if (typeof k !== 'string' || k in t) return t[k];
      return { id: k, name: 'Ancien coach', tag: '', ghost: true };
    },
  }) : COACH_T;
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

  /* Session réelle : aucun cours inventé. Le club n'a pas (encore) de planning
     dans cette caisse, et l'horaire de démonstration (RPM 07:00, CrossFit 17:00
     « en cours » à n'importe quelle heure, coachs Salma/Amine/Réda) se lisait
     comme le sien. Mesuré en session appairée : « CrossFit · WOD, en cours,
     Amine » à 17:51 pour un club sans coach de ce nom. */
  const CLASSES = pvReal() ? [] : [
    { id: 'rpm',      label: 'RPM · Cycle',    art: 'spin',    room: 'Studio cycle', coach: 'Coach Salma', dur: 45 },
    { id: 'bodypump', label: 'Body Pump',      art: 'barbell', room: 'Studio 1',     coach: 'Coach Amine', dur: 55 },
    { id: 'yoga',     label: 'Yoga Vinyasa',   art: 'yoga',    room: 'Studio 2',     coach: 'Coach Salma', dur: 60 },
    { id: 'boxe',     label: 'Boxe / Cardio',  art: 'boxe',    room: 'Le Ring',      coach: 'Coach Réda',  dur: 50 },
    { id: 'crossfit', label: 'CrossFit · WOD', art: 'kettle',  room: 'La Box',       coach: 'Coach Amine', dur: 60 },
    { id: 'zumba',    label: 'Zumba',          art: 'dance',   room: 'Studio 1',     coach: 'Coach Salma', dur: 45 },
    { id: 'hiit',     label: 'HIIT Express',   art: 'hiit',    room: 'Studio 2',     coach: 'Coach Réda',  dur: 30 },
  ];
  const CLASS_T = Object.fromEntries(CLASSES.map((c) => [c.id, c]));
  const CLASS = pvReal() ? new Proxy(CLASS_T, {
    get(t, k) {
      if (typeof k !== 'string' || k in t) return t[k];
      return { id: k, label: 'Cours retiré', art: 'spin', room: '', coach: '', dur: 0, ghost: true };
    },
  }) : CLASS_T;

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
    /* real store : empty. Les états « en cours / terminé » du seed sont figés
       sur la journée de démo, ils ne suivent pas l'horloge d'un vrai club. */
    return pvReal() ? [] : seed;
  })();

  /* ───────────────────────── coaching personnel (PT) ─────────────────────────
     Packs de séances perso + séances 1:1 du jour par coach. Les cours collectifs
     du coach sont dérivés du SCHEDULE à l'affichage. */
  const PT_PACKS = [
    { id: 'pt1',  n: 1,  price: 150,  sub: 'séance découverte' },
    { id: 'pt5',  n: 5,  price: 650,  sub: '5 séances · 130 MAD/séance', flag: 'populaire' },
    { id: 'pt10', n: 10, price: 1200, sub: '10 séances · 120 MAD/séance', flag: 'le malin' },
  ];
  /* real store : les packs sont ceux du gérant (« Comptoir, coaching & pass »). */
  if (pvReal()) PT_PACKS.length = 0;
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
  /* Session réelle : la courbe part de zéro et ne se remplit que des entrées
     réellement pointées (noteEntry). Les 4/6/5/8 du seed, eux, s'affichaient
     tels quels, avec « prévoir un coach de plus en salle » dessous. */
  if (pvReal()) PEAK_SLOTS.forEach((slot) => { slot.count = 0; });

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

  const addRevenue = (bucket, amount) => { rollDay(); state.dayRevenue[bucket] = (state.dayRevenue[bucket] || 0) + amount; };
  const revenueTotal = () => Object.values(state.dayRevenue).reduce((s, v) => s + v, 0);

  const passagesToday = () => MEMBERS.reduce((s, m) => s + (m.checkedToday ? 1 : 0), 0) + BASE_PASSAGES;
  /* démo : le compteur démarre à 23 ; session réelle : 0 (il affichait 23
     passages à un club qui n'en avait pointé aucun). */
  let BASE_PASSAGES = pvReal() ? 0 : 23 - MEMBERS.filter((m) => m.checkedToday).length;

  /* ───────────────────────── journée d'exploitation ─────────────────────────
     Le compteur de passages, la courbe des heures de pointe, la recette du jour
     et le « pointé aujourd'hui » de chaque fiche étaient posés une fois puis
     jamais remis à zéro : le lendemain, un club réel relisait la veille sous
     « aujourd'hui », et « passages ce mois » ne bougeait jamais d'un pointage.
     La journée suit la même coupure que la caisse et le tableau de bord
     (KiwiDayReport.today, 5 h), pas minuit. Démo : inchangée (rollDay no-op). */
  let DAY_KEY = '';
  let ATTEND_HIST = {};   /* 'YYYY-MM-DD' → passages, les 14 derniers jours */
  function bizDay() {
    try {
      const R = window.KiwiDayReport;
      const d = R && typeof R.today === 'function' ? R.today() : '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    } catch (_) {}
    const t = new Date(Date.now() - 5 * 3600 * 1000);
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }
  const dayGap = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
  function rollDay() {
    if (!pvReal()) return false;
    const today = bizDay();
    if (!DAY_KEY) { DAY_KEY = today; return false; }
    if (DAY_KEY === today) return false;
    const gap = dayGap(DAY_KEY, today);
    if (!(gap > 0)) { DAY_KEY = today; return false; }
    ATTEND_HIST[DAY_KEY] = passagesToday();
    Object.keys(ATTEND_HIST).sort().slice(0, -14).forEach((k) => { delete ATTEND_HIST[k]; });
    const newMonth = DAY_KEY.slice(0, 7) !== today.slice(0, 7);
    MEMBERS.forEach((m) => {
      m.lastVisitD = (Number.isFinite(m.lastVisitD) ? m.lastVisitD : 0) - gap;
      m.checkedToday = false;
      if (newMonth) m.visits = 0;
    });
    PEAK_SLOTS.forEach((slot) => { slot.count = 0; });
    BASE_PASSAGES = 0;
    state.inGym = 0;
    state.passesToday = 0;
    Object.keys(state.dayRevenue).forEach((k) => { state.dayRevenue[k] = 0; });
    SCHEDULE.forEach((sess) => { sess.booked = []; sess.extra = 0; sess.checkedIn = []; sess.wait = []; sess.waitExtra = 0; });
    DAY_KEY = today;
    return true;
  }
  /* Une entrée pointée : compteur du jour, passages du mois, courbe des heures
     de pointe (tranche de l'heure réelle). Une seule fois par membre et par jour. */
  function noteEntry(m) {
    rollDay();
    if (!m || m.checkedToday) return false;
    m.checkedToday = true;
    m.visits = (m.visits || 0) + 1;
    m.lastVisitD = 0;
    state.inGym++;
    peakAdd(1);
    return true;
  }
  function peakAdd(n) {
    const h = new Date().getHours();
    const slot = PEAK_SLOTS[h < 6 ? -1 : Math.min(PEAK_SLOTS.length - 1, Math.floor((h - 6) / 3))];
    if (slot) slot.count += n;
  }

  /* ───────────── Salle réelle : formules, comptoir, coachs et cours du gérant ─────────────
     Le tableau de bord tient déjà « Abonnements », « Comptoir, coaching & pass »,
     « Coachs » et « Planning & cours » dans le document `workspaces`. La caisse
     les relit (KiwiPosWorkspaces) au lieu de vendre la grille de la démo, et ne
     vend jamais un prix que personne n'a fixé : sans prix saisi elle le demande.
     Les ventes « libres » (formule, article, pass) restent possibles et se
     rangent dans l'instantané de la caisse, pas dans le catalogue du gérant. */
  const FREE_PLANS = [];
  const SESS_KEEP = {};
  const numTxt = (n) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  const IN_STYLE = 'width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid rgba(10,15,13,.16);border-radius:10px;font:inherit;font-size:15px;background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D)';
  let realSig = '';
  let realDraft = { plans: 0, shop: 0 };
  const slug = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '');
  const numOf = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
  const artOfShop = (t) => (/eau|water|boisson|jus/i.test(t) ? 'eau' : /shaker|whey|prot[eé]ine en|poudre/i.test(t) ? 'shaker' : /serviette|towel/i.test(t) ? 'serviette' : /coach/i.test(t) ? 'coach' : 'barre');
  const artOfClass = (t) => (/spin|rpm|cycl|v[eé]lo/i.test(t) ? 'spin' : /pump|body|muscu|renfo|halt/i.test(t) ? 'barbell' : /yoga|pilates|stretch/i.test(t) ? 'yoga' : /box|ring|muay|mma/i.test(t) ? 'boxe' : /cross|wod|kettle|functional/i.test(t) ? 'kettle' : /zumba|danse|dance/i.test(t) ? 'dance' : /hiit|tabata|circuit/i.test(t) ? 'hiit' : 'spin');
  const hhmm = (ms) => { const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const sessionStateOf = (st, en) => { const now = Date.now(); return now >= en ? 'done' : now >= st ? 'live' : st - now <= 3600000 ? 'soon' : 'upcoming'; };
  function realBoards() {
    const W = window.KiwiPosWorkspaces;
    if (!W || !W.services) return null;
    const plansIn = W.services('sport');
    const shopIn = W.board('sport', 'shop');
    const coachIn = W.staff('sport');
    const apptIn = W.rows('sport', 'appointments');
    const plans = plansIn.map((x) => {
      const days = x.durationDays > 0 ? Math.round(x.durationDays) : 30;
      return { id: 'svc-' + slug(x.id), label: x.name, price: x.price, days, sub: days + ' ' + pl(days, 'jour', 'jours') + (x.terms ? ' · ' + x.terms.slice(0, 44) : ''), icon: 'calendar', unset: !(x.price > 0) };
    });
    const shop = [], packs = [], passes = [];
    shopIn.forEach((r) => {
      const price = Math.round(numOf(r.v.price) * 100) / 100;
      const kind = r.v.kind || 'counter';
      if (kind === 'coaching') {
        const n = Math.max(1, Math.round(numOf(r.v.sessions)) || 1);
        packs.push({ id: 'pk-' + slug(r.id), n, price, sub: r.title, unset: !(price > 0) });
      } else if (kind === 'pass') {
        const persons = Math.max(1, Math.round(numOf(r.v.persons)) || 1);
        passes.push({ id: 'ps-' + slug(r.id), label: r.title, price, persons, sub: persons > 1 ? persons + ' personnes · 1 séance' : 'accès visiteur, sans abonnement', unset: !(price > 0) });
      } else {
        shop.push({ id: 'sh-' + slug(r.id), label: r.title, price, art: artOfShop(r.title), unset: !(price > 0) });
      }
    });
    const coaches = coachIn.map((c) => ({ id: c.id, name: c.name, tag: c.role || '' }));
    /* les cours de la journée d'activité (5 h du matin → 5 h) */
    const dayStart = Date.parse(bizDay() + 'T05:00:00');
    const dayEnd = dayStart + 24 * 3600 * 1000;
    const tms = (v) => { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? t : 0; };
    const classes = [], sessions = [];
    apptIn.forEach((r) => {
      const st = tms(r.v.startAt);
      if (!st || st < dayStart || st >= dayEnd) return;
      const en = tms(r.v.endAt) > st ? tms(r.v.endAt) : st + 3600000;
      const coachRec = coachIn.find((c) => c.id === r.v.coachRef);
      const cap = Math.max(1, Math.round(numOf(r.v.capacity)) || 1);
      classes.push({ id: 'cl-' + slug(r.id), label: r.title, art: artOfClass(r.title), room: String(r.v.room || '').trim(), coach: coachRec ? coachRec.name : '', dur: Math.max(5, Math.round((en - st) / 60000)) });
      sessions.push({ id: 's-' + slug(r.id), classId: 'cl-' + slug(r.id), time: hhmm(st), startMs: st, endMs: en, cap, extra0: Math.min(cap, Math.max(0, Math.round(numOf(r.v.booked)))) });
    });
    sessions.sort((a, b) => a.startMs - b.startMs);
    return { plans, shop, packs, passes, coaches, classes, sessions, draft: { plans: plansIn.draft || 0, shop: shopIn.draft || 0 } };
  }
  /* Relit les tableaux du gérant ; vrai quand quelque chose a changé. */
  function refreshReal(force) {
    if (!pvReal()) return false;
    const b = realBoards();
    if (!b) return false;
    const sig = JSON.stringify([b, FREE_PLANS]);
    if (!force && sig === realSig) return syncStates();
    realSig = sig;
    realDraft = b.draft;
    const fill = (arr, map, list) => { arr.splice(0, arr.length, ...list); Object.keys(map).forEach((k) => { delete map[k]; }); arr.forEach((x) => { map[x.id] = x; }); };
    fill(PLANS, PLAN_T, b.plans.concat(FREE_PLANS));
    fill(SHOP, SHOP_ITEM_T, b.shop);
    PT_PACKS.splice(0, PT_PACKS.length, ...b.packs);
    DAY_PASSES.splice(0, DAY_PASSES.length, ...b.passes);
    fill(COACHES, COACH_T, b.coaches);
    Object.keys(COACH_BY_NAME).forEach((k) => { delete COACH_BY_NAME[k]; });
    COACHES.forEach((c) => { COACH_BY_NAME[c.name] = c; });
    fill(CLASSES, CLASS_T, b.classes);
    const old = {};
    SCHEDULE.forEach((x) => { old[x.id] = x; });
    SCHEDULE.splice(0, SCHEDULE.length, ...b.sessions.map((x) => {
      const o = old[x.id] || SESS_KEEP[x.id] || null;
      return {
        id: x.id, classId: x.classId, time: x.time, startMs: x.startMs, endMs: x.endMs, cap: x.cap,
        state: sessionStateOf(x.startMs, x.endMs),
        booked: o ? o.booked || [] : [], extra: o && Number.isFinite(o.extra) ? o.extra : x.extra0,
        checkedIn: o ? o.checkedIn || [] : [], wait: o ? o.wait || [] : [], waitExtra: o ? o.waitExtra || 0 : 0,
      };
    }));
    return true;
  }
  /* « en cours / bientôt / terminé » suivent l'horloge de la salle */
  function syncStates() {
    if (!pvReal()) return false;
    let ch = false;
    SCHEDULE.forEach((x) => {
      if (!x.endMs) return;
      const st = sessionStateOf(x.startMs, x.endMs);
      if (st !== x.state) { x.state = st; ch = true; }
    });
    return ch;
  }
  /* formule libre vendue au comptoir : elle entre dans la liste des formules de
     cette caisse (la fiche du membre doit pouvoir relire son libellé et sa durée) */
  function materializeFreePlan(sel, price) {
    const id = 'free-' + Date.now().toString(36) + (++FREE_SEQ);
    const plan = { id, label: sel.freeLabel, price, days: sel.freeDays, sub: 'formule libre', icon: 'calendar', free: true };
    FREE_PLANS.push(plan); PLANS.push(plan); PLAN_T[id] = plan;
    sel.plan = id;
  }
  let FREE_SEQ = 0;

  const gymOps = window.KiwiVerticalState && window.KiwiVerticalState.register({
    vertical: 'gym',
    snapshot() {
      return {
        /* réel : formules, comptoir, coachs et cours viennent du tableau de bord,
           on n'en garde pas de copie périmée dans l'instantané */
        ...(pvReal() ? { freePlans: FREE_PLANS } : { plans: PLANS, shop: SHOP, coaches: COACHES, classes: CLASSES }),
        schedule: SCHEDULE,
        ptToday: PT_TODAY,
        club: CLUB,
        members: MEMBERS,
        peakSlots: PEAK_SLOTS,
        basePassages: BASE_PASSAGES,
        cart: state.cart,
        dayRevenue: state.dayRevenue,
        inGym: state.inGym,
        passesToday: state.passesToday,
        /* v:2 = les graines de démo ne sont plus écrites par une session réelle ;
           dayKey / attendHist alimentent la remise à zéro quotidienne. */
        v: 2,
        dayKey: DAY_KEY,
        attendHist: ATTEND_HIST,
      };
    },
    restore(saved) {
      if (!saved || typeof saved !== 'object') return;
      /* Un document réel écrit AVANT ce correctif embarque le planning, la
         courbe des heures de pointe et les 23 passages de la démo (l'autosave
         écrivait tout l'instantané). On les laisse de côté plutôt que de les
         relire comme les chiffres du club. */
      const legacy = pvReal() && saved.v !== 2;
      if (pvReal()) {
        /* réel : le catalogue vient du tableau de bord (refreshReal) ; seules les
           ventes libres et l'état des réservations du jour sont à relire ici */
        if (Array.isArray(saved.freePlans)) FREE_PLANS.splice(0, FREE_PLANS.length, ...saved.freePlans.filter((x) => x && x.id));
        if (Array.isArray(saved.schedule) && !legacy) {
          saved.schedule.forEach((x) => { if (x && x.id) SESS_KEEP[x.id] = { booked: x.booked, extra: x.extra, checkedIn: x.checkedIn, wait: x.wait, waitExtra: x.waitExtra }; });
        }
      } else {
      if (Array.isArray(saved.plans)) PLANS.splice(0, PLANS.length, ...saved.plans);
      Object.keys(PLAN).forEach((id) => delete PLAN[id]);
      PLANS.forEach((plan) => { PLAN[plan.id] = plan; });
      if (Array.isArray(saved.shop)) SHOP.splice(0, SHOP.length, ...saved.shop);
      Object.keys(SHOP_ITEM).forEach((id) => delete SHOP_ITEM[id]);
      SHOP.forEach((item) => { SHOP_ITEM[item.id] = item; });
      if (Array.isArray(saved.coaches)) COACHES.splice(0, COACHES.length, ...saved.coaches);
      Object.keys(COACH).forEach((id) => delete COACH[id]);
      Object.keys(COACH_BY_NAME).forEach((name) => delete COACH_BY_NAME[name]);
      COACHES.forEach((coach) => { COACH[coach.id] = coach; COACH_BY_NAME[coach.name] = coach; });
      if (Array.isArray(saved.classes) && !legacy) CLASSES.splice(0, CLASSES.length, ...saved.classes);
      Object.keys(CLASS).forEach((id) => delete CLASS[id]);
      CLASSES.forEach((klass) => { CLASS[klass.id] = klass; });
      if (Array.isArray(saved.schedule) && !legacy) SCHEDULE.splice(0, SCHEDULE.length, ...saved.schedule);
      }
      if (saved.ptToday && typeof saved.ptToday === 'object' && !legacy) {
        Object.keys(PT_TODAY).forEach((id) => delete PT_TODAY[id]);
        Object.assign(PT_TODAY, saved.ptToday);
      }
      if (saved.club && typeof saved.club === 'object') {
        Object.keys(CLUB).forEach((key) => delete CLUB[key]);
        Object.assign(CLUB, saved.club);
      }
      if (Array.isArray(saved.members)) MEMBERS.splice(0, MEMBERS.length, ...saved.members);
      MEMBERS.forEach((member) => {
        ['start', 'end', 'frozenUntil'].forEach((key) => { if (member[key]) member[key] = new Date(member[key]); });
      });
      Object.keys(MEMBER).forEach((id) => delete MEMBER[id]);
      MEMBERS.forEach((member) => { MEMBER[member.id] = member; });
      if (Array.isArray(saved.peakSlots) && !legacy) PEAK_SLOTS.splice(0, PEAK_SLOTS.length, ...saved.peakSlots);
      if (Number.isFinite(saved.basePassages)) BASE_PASSAGES = legacy ? Math.max(0, saved.basePassages - 23) : saved.basePassages;
      if (typeof saved.dayKey === 'string') DAY_KEY = saved.dayKey;
      if (saved.attendHist && typeof saved.attendHist === 'object') ATTEND_HIST = saved.attendHist;
      if (Array.isArray(saved.cart)) state.cart = saved.cart;
      if (saved.dayRevenue && typeof saved.dayRevenue === 'object') state.dayRevenue = saved.dayRevenue;
      if (Number.isFinite(saved.inGym)) state.inGym = saved.inGym;
      if (Number.isFinite(saved.passesToday)) state.passesToday = saved.passesToday;
    },
  });

  function queueIfOffline(label) {
    if (gymOps) gymOps.save(label);
    if (pvReal()) {
      syncNet();
      if (!state.offline) return false;
      toast(`${label}, enregistré sur cette caisse`);
      return true;
    }
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
  function postDay(total, method, label, ref, lines) {
    try {
      /* La référence est l'identité de la vente côté serveur : le code membre
         seul faisait refuser (409) toute seconde vente au même membre, un
         abonnement puis un pack de séances par exemple, et la recette
         disparaissait en silence. On y ajoute un jeton de l'instant. */
      ref = ref ? String(ref).slice(0, 18) + '-' + Date.now().toString(36).slice(-5) : '';
      if (window.KiwiPosSale) window.KiwiPosSale.record('gym', { total, method, label, ref, lines });
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

  /* Club réel : les chiffres du club sont CEUX DES FICHES de cette caisse, rien
     d'autre. activeBase restait à 0 pendant que le comptoir vendait des
     abonnements (« 0 membres actifs » avec 12 fiches), et le MRR, les nouveaux,
     les partis et la répartition des formules ne bougeaient jamais. La démo
     garde le club de 247 membres du seed. */
  const countsAsActive = (m) => { const st = memberStatus(m); return st === 'active' || st === 'expiring'; };
  const monthlyOf = (m) => Math.round(memberPrice(m) / Math.max(1, PLAN[m.plan].days / 30.4));
  function clubFigures() {
    if (!pvReal()) {
      return { active: CLUB.activeBase, mrr: CLUB.mrr, newM: CLUB.newThisMonth, churn: CLUB.churnThisMonth, mix: CLUB.mix };
    }
    const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
    const act = MEMBERS.filter(countsAsActive);
    const inMonth = (d) => d && d.getFullYear() === y && d.getMonth() === mo;
    const byPlan = {};
    act.forEach((m) => { byPlan[m.plan] = (byPlan[m.plan] || 0) + 1; });
    return {
      active: act.length,
      mrr: act.reduce((n, m) => n + monthlyOf(m), 0),
      newM: MEMBERS.filter((m) => inMonth(m.start)).length,
      churn: MEMBERS.filter((m) => memberStatus(m) === 'expired' && inMonth(m.end)).length,
      mix: PLANS.filter((p) => byPlan[p.id]).map((p) => ({ id: p.id, pct: Math.round((byPlan[p.id] / act.length) * 100) })),
    };
  }
  const activeCount = () => clubFigures().active;

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  function mount(rootEl) {
    if (gymOps) gymOps.hydrate();
    rollDay();
    root = rootEl;
    if (pvReal()) {
      refreshReal(true);
      const W = window.KiwiPosWorkspaces;
      if (W && W.subscribe && !mount._ws) {
        mount._ws = true;
        W.subscribe(() => { if (refreshReal() && root) repaintReal(); });
        W.watch();
        /* « en cours / terminé » suivent l'horloge */
        setInterval(() => { if (root && syncStates()) repaintReal(); }, 60000);
      }
    }
    bindNet();
    root.innerHTML = `
      <aside class="gy-rail">
        <div class="gy-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div>
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
          <button class="gy-net" id="gy-net" title="${pvReal() ? 'État du réseau' : 'Simuler une coupure réseau'}">
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
                <div><h1>Comptoir</h1><div class="gy-head-sub">${pvReal() ? 'Les articles de votre comptoir, toucher pour ajouter.' : 'Eau, snacks, serviette, séance coach, toucher pour ajouter.'}</div></div>
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
            <div class="gy-head-right">${pvReal() ? '<button class="gy-btn primary sm" data-gy-addboard="appointments"><i data-lucide="plus"></i> Ajouter un cours</button>' : ''}<div class="gy-week" id="gy-week"></div></div>
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
    if (!root._gyBoardBound) {
      root._gyBoardBound = true;
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-gy-addboard]');
        if (b) openBoard(b.dataset.gyAddboard);
      });
    }

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
    $('#gy-ci-scanbtn', root).addEventListener('click', () => {
      if (pvReal()) { ciInput.focus(); toast('Lecteur actif · approchez le badge ou saisissez son code'); }
      else mockScan();
    });
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
      if (!card) return;
      const sid = card.dataset.gyShop;
      /* article libre, ou article sans prix saisi pas encore au panier : on demande le prix */
      if (pvReal() && (sid === '_free' || (SHOP_ITEM_T[sid] && SHOP_ITEM_T[sid].unset && !state.cart.some((l) => l.id === sid)))) { askShopPrice(sid); return; }
      addToCart(sid, card);
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
  function closeVeil(v) {
    (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open');
    if (pendingRepaint) repaintReal();
  }
  /* Les tarifs, l'équipe ou le planning viennent de changer sur le tableau de
     bord : on repeint, mais jamais sous une feuille ouverte (vente en cours). */
  let pendingRepaint = false;
  function repaintReal() {
    if (!root) return;
    if ($$('.modal-veil.is-open', root).length) { pendingRepaint = true; return; }
    pendingRepaint = false;
    renderShop(); refreshOps();
  }
  function openBoard(nav) {
    const W = window.KiwiPosWorkspaces;
    if (W && W.open) W.open(root, 'gym', nav);
    else toast('Renseignez-les sur le tableau de bord');
  }

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
    rollDay();
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
    rollDay();
    $('#gy-ci-sub', root).textContent =
      `${fmtDT(new Date())} · présentez le badge, l'écran confirme l'accès`;
    renderQuickCodes();
    renderCounter();
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
    /* une entrée ou un pass vient de bouger les tranches : le graphique suit */
    if ($('#gy-peak-bars', root)) renderPeak();
  }

  function renderPeak() {
    const max = Math.max(...PEAK_SLOTS.map((s) => s.count), 1);
    const peakIdx = PEAK_SLOTS.reduce((bi, s, i, a) => s.count > a[bi].count ? i : bi, 0);
    $('#gy-peak-bars', root).innerHTML = PEAK_SLOTS.map((s, i) => `
      <div class="gy-peak-bar ${i === peakIdx && s.count > 0 ? 'peak' : ''} ${s.count === 0 ? 'empty' : ''}">
        <span class="gy-peak-col"><i style="height:${Math.round((s.count / max) * 100)}%"></i></span>
        <span class="gy-peak-ct">${s.count || ''}</span>
        <span class="gy-peak-lbl">${s.lbl}</span>
      </div>`).join('');
    /* Sans passage pointé il n'y a pas de pic : on ne désigne pas la première
       tranche, et on ne recommande un coach de plus qu'à la démo. */
    const total = PEAK_SLOTS.reduce((n, x) => n + x.count, 0);
    $('#gy-peak-foot', root).textContent = !total
      ? 'Aucun passage pointé pour l\'instant aujourd\'hui.'
      : pvReal()
        ? `Pic vers ${PEAK_SLOTS[peakIdx].lbl} h, d'après les entrées pointées aujourd'hui.`
        : `Pic vers ${PEAK_SLOTS[peakIdx].lbl} h, prévoir un coach de plus en salle.`;
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
      noteEntry(m);
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
            <div class="gy-ci-verdict"><i data-lucide="check-circle-2"></i> Bienvenue ${esc(firstName(m.name))}</div>
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
      toast(`Bienvenue ${firstName(m.name)}, entrée pointée`);
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
              <span class="gy-plan-price">${pvReal() ? (p.price > 0 ? `<b>${esc(numTxt(p.price))}</b> MAD` : '<b style="font-size:15px">prix à saisir</b>') : `<b>${p.price}</b> MAD`}</span>
              <span class="gy-plan-sub">${esc(p.sub)}</span>
              ${STUDENT_OFF > 0 ? `<span class="gy-plan-student"><i data-lucide="percent"></i> étudiant ${esc(planPrice(p.id, true))} MAD</span>` : ''}
            </button>`).join('')}
        </div>
        ${pvReal() ? `<div class="gy-abo-sec">
          ${PLANS.length ? '' : '<div class="gy-empty">Aucune formule n\'est saisie pour cette salle. Ajoutez vos abonnements avec leur prix, ou vendez une formule libre.</div>'}
          ${realDraft.plans ? `<div class="gy-pass-note"><i data-lucide="info"></i> ${realDraft.plans} ${pl(realDraft.plans, 'formule en brouillon n\'est', 'formules en brouillon ne sont')} pas encore en vente.</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="gy-btn secondary" data-gy-plan-pick="_free"><i data-lucide="plus"></i> Vendre une autre formule</button>
            <button class="gy-btn ghost" data-gy-addboard="services"><i data-lucide="settings"></i> ${PLANS.length ? 'Modifier mes formules' : 'Ajouter mes formules'}</button>
          </div>
        </div>` : ''}
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
              <span class="gy-freeze-row-l"><b>${esc(m.name)}</b><span>reprise le ${esc(m.frozenUntil ? fmtLong(m.frozenUntil) : '·')}</span></span>
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
    const real = pvReal();
    const sel = {
      plan: ctx.presetPlan || (member ? member.plan : (PLANS[0] ? PLANS[0].id : '_free')),
      student: member ? member.student : false,
      member: member || null,
      renew: !!ctx.renew,
      freeLabel: '', freeDays: 30, typed: '',
    };
    const planOf = () => (sel.plan === '_free'
      ? { id: '_free', label: sel.freeLabel.trim() || 'Formule libre', price: 0, days: Math.max(1, Math.round(Number(sel.freeDays)) || 30), free: true }
      : PLAN[sel.plan]);
    const typedPrice = () => Math.round((Number(String(sel.typed).replace(',', '.')) || 0) * 100) / 100;
    /* une formule sans prix saisi (ou libre) : la caisse demande le prix, elle n'en invente pas */
    const needsTyped = () => real && (sel.plan === '_free' || !(PLAN[sel.plan].price > 0));
    const priceNow = () => (needsTyped() ? typedPrice() : planPrice(sel.plan, sel.student));
    const endNow = () => {
      const base = sel.member && sel.member.end > new Date() ? sel.member.end : new Date();
      return startOfDay(new Date(base.getTime() + planOf().days * DAY));
    };
    const paint = () => {
      const price = priceNow();
      const set = (id, t) => { const n = $(id, el); if (n) n.textContent = t; };
      set('#gy-sell-totlbl', `À encaisser · valable ${fmtLong(endNow())}`);
      set('#gy-sell-totval', fmtMAD(price));
      set('#gy-sell-sumlbl', real ? planOf().label : `Formule ${planOf().label.toLowerCase()}`);
      set('#gy-sell-sumval', fmtMAD(price));
      const b = $('#gy-sell-pay', el);
      if (b) b.innerHTML = `<i data-lucide="banknote"></i> Encaisser${price > 0 ? ' ' + esc(fmtMAD(price)) : ''}`;
      icons();
    };

    const render = () => {
      const price = priceNow();
      const p = planOf();
      const newEnd = endNow();
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
                <span class="gy-plan-opt-price mono">${real ? (pl.price > 0 ? esc(fmtMAD(planPrice(pl.id, sel.student))) : 'prix à saisir') : esc(planPrice(pl.id, sel.student)) + ' MAD'}</span>
                <span class="gy-plan-opt-sub">${esc(pl.sub)}</span>
              </button>`).join('')}
            ${real ? `<button class="gy-plan-opt ${sel.plan === '_free' ? 'on' : ''}" data-gy-sp="_free">
                <span class="gy-plan-opt-name">Autre formule</span>
                <span class="gy-plan-opt-price mono">prix libre</span>
                <span class="gy-plan-opt-sub">intitulé, durée et prix à saisir</span>
              </button>` : ''}
          </div>
        </div>

        ${needsTyped() ? `<div class="gy-f">
          ${sel.plan === '_free'
            ? `<div class="gy-f-lbl">Intitulé de la formule</div><input id="gy-sell-fl" style="${IN_STYLE}" maxlength="40" value="${esc(sel.freeLabel)}" placeholder="Ex. Pass 10 entrées" />
               <div class="gy-f-lbl" style="margin-top:10px">Durée (jours)</div><input id="gy-sell-fd" type="number" inputmode="numeric" min="1" step="1" style="${IN_STYLE}" value="${esc(sel.freeDays)}" />`
            : `<div class="gy-pass-note"><i data-lucide="info"></i> Aucun prix n'est saisi pour cette formule sur le tableau de bord : saisissez le prix de cette vente.</div>`}
          <div class="gy-f-lbl" style="margin-top:10px">Prix (MAD)</div>
          <input id="gy-sell-fp" type="text" inputmode="decimal" autocomplete="off" style="${IN_STYLE}" value="${esc(sel.typed)}" placeholder="0" />
        </div>` : ''}

        ${STUDENT_OFF > 0 ? `<button class="gy-student-toggle ${sel.student ? 'on' : ''}" id="gy-sell-student">
          <span class="gy-student-tick"><i data-lucide="check"></i></span>
          <span class="gy-student-l"><b>Tarif étudiant, 20 % de remise</b><span>Sur présentation de la carte étudiante</span></span>
          <span class="gy-student-amt">${sel.student ? `−${p.price - price} MAD` : 'appliquer'}</span>
        </button>` : ''}

        <div class="gy-sell-summary">
          <div class="gy-sell-sum-row"><span id="gy-sell-sumlbl">${real ? esc(p.label) : `Formule ${esc(p.label.toLowerCase())}`}${sel.student ? ' · étudiant' : ''}</span><b id="gy-sell-sumval">${esc(fmtMAD(needsTyped() ? price : p.price))}</b></div>
          ${sel.student ? `<div class="gy-sell-sum-row mut"><span>Remise étudiant −20 %</span><b>−${esc(fmtMAD(p.price - price))}</b></div>` : ''}
          <div class="gy-sell-sum-row total"><span id="gy-sell-totlbl">À encaisser · valable ${esc(fmtLong(newEnd))}</span><b class="mono" id="gy-sell-totval">${esc(fmtMAD(price))}</b></div>
        </div>

        <div class="gy-sell-foot">
          <button class="gy-btn ghost" data-gy-close>Annuler</button>
          <button class="gy-btn primary" id="gy-sell-pay"><i data-lucide="banknote"></i> Encaisser${price > 0 || !real ? ' ' + esc(fmtMAD(price)) : ''}</button>
        </div>`;
      icons();
      $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-sell-veil'); });
      $('#gy-sell-plans', el).onclick = (e) => {
        const b = e.target.closest('[data-gy-sp]');
        if (!b) return;
        sel.plan = b.dataset.gySp;
        render();
      };
      const st = $('#gy-sell-student', el);
      if (st) st.onclick = () => { sel.student = !sel.student; render(); };
      const fl = $('#gy-sell-fl', el), fd = $('#gy-sell-fd', el), fp = $('#gy-sell-fp', el);
      if (fl) fl.oninput = () => { sel.freeLabel = fl.value; paint(); };
      if (fd) fd.oninput = () => { sel.freeDays = fd.value; paint(); };
      if (fp) fp.oninput = () => { sel.typed = fp.value; paint(); };
      $('#gy-sell-pay', el).onclick = () => {
        if (real) {
          if (sel.plan !== '_free' && PLAN[sel.plan].ghost) { toast('Choisissez une formule'); return; }
          if (sel.plan === '_free' && !sel.freeLabel.trim()) { toast('Donnez un intitulé à la formule'); return; }
          if (!(priceNow() > 0)) { toast('Saisissez le prix de cette vente'); return; }
        }
        const finalPrice = priceNow();
        const endAt = endNow();
        closeVeil('#gy-sell-veil');
        openPay({
          amount: finalPrice,
          title: sel.renew ? 'Renouvellement' : 'Abonnement',
          sub: `${sel.member ? esc(sel.member.name) : 'Nouveau membre'} · ${esc(planOf().label.toLowerCase())}`,
          onPaid: (method, rendu) => {
            if (sel.plan === '_free') {
              sel.freeLabel = sel.freeLabel.trim();
              sel.freeDays = planOf().days;
              materializeFreePlan(sel, finalPrice);
            }
            commitSell(sel, finalPrice, method, rendu, endAt);
          },
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
      if (pvReal()) m.paid = price;
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
      if (pvReal()) m.paid = price;
      MEMBERS.push(m); MEMBER[id] = m;
      CLUB.activeBase++; CLUB.newThisMonth++;
      queueIfOffline('Nouvel abonnement');
      toast(`Abonnement ${PLAN[sel.plan].label.toLowerCase()} vendu, badge ${code} à remettre`);
      setTimeout(() => openMember(id), 350);
    }
    addRevenue('abos', price);
    postDay(price, method, `${sel.renew ? 'Renouvellement' : 'Abonnement'} ${PLAN[sel.plan].label.toLowerCase()}${sel.student ? ' · étudiant' : ''}`, sel.member ? sel.member.code : '', [
      { itemId: `abonnement-${sel.plan}`, variantId: sel.student ? 'etudiant' : 'standard', name: PLAN[sel.plan].label, category: 'abonnements', qty: 1, unit: 'abonnement', kind: 'service', total: price },
    ]);
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
    const real = pvReal();
    let html = SHOP.map((s, i) => `
      <button class="gy-shop-card" data-gy-shop="${s.id}" style="--i:${i}" aria-label="Ajouter ${esc(s.label)}">
        ${s.flag ? `<span class="gy-shop-flag">${esc(s.flag)}</span>` : ''}
        <span class="gy-shop-art">${ART[s.art] || ''}</span>
        <span class="gy-shop-name">${esc(s.label)}</span>
        <span class="gy-shop-price">${real ? (s.unset ? 'prix à saisir' : esc(fmtMAD(s.price))) : s.price + ' MAD'}</span>
      </button>`).join('');
    if (real) {
      html += `
      <button class="gy-shop-card" data-gy-shop="_free" style="--i:${SHOP.length}" aria-label="Ajouter un article libre">
        <span class="gy-shop-art">${ART.barre}</span>
        <span class="gy-shop-name">Article libre</span>
        <span class="gy-shop-price">prix à saisir</span>
      </button>
      <div style="grid-column:1/-1;padding:6px 2px 12px;font-size:13px;color:var(--ink-3,#55605a)">
        ${SHOP.length ? '' : 'Aucun article n\'est saisi au comptoir. Ajoutez vos articles avec leur prix, ou vendez un article libre.'}
        ${realDraft.shop ? `${realDraft.shop} ${pl(realDraft.shop, 'article en brouillon n\'est', 'articles en brouillon ne sont')} pas encore en vente.` : ''}
        <div style="margin-top:8px"><button class="gy-btn ghost sm" data-gy-addboard="shop"><i data-lucide="settings"></i> ${SHOP.length ? 'Modifier mes articles' : 'Ajouter mes articles'}</button></div>
      </div>`;
    }
    $('#gy-shop-grid', root).innerHTML = html;
  }

  /* Un article du panier : le catalogue du gérant, ou une ligne libre / au prix
     saisi qui porte elle-même son libellé et son prix. */
  const lineItem = (l) => {
    const it = SHOP_ITEM_T[l.id];
    return { label: it ? it.label : (l.label || 'Article retiré'), price: l.price != null ? l.price : (it ? it.price : 0), art: it ? it.art : 'barre' };
  };

  /* Prix saisi à la caisse : un article sans prix sur le tableau de bord, un
     article libre, un pass libre. La caisse le demande, elle n'en fixe pas. */
  function askFree(cfg) {
    const el = $('#gy-passm', root);
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${esc(cfg.title)}</h3>
      <p class="modal-subtle">${esc(cfg.sub || '')}</p>
      ${cfg.name ? `<div class="gy-f"><div class="gy-f-lbl">Intitulé</div><input id="gy-fp-name" style="${IN_STYLE}" maxlength="60" value="${esc(cfg.label || '')}" placeholder="Ex. Bouteille d'eau" /></div>` : ''}
      <div class="gy-f"><div class="gy-f-lbl">Prix (MAD)</div><input id="gy-fp-price" type="text" inputmode="decimal" autocomplete="off" style="${IN_STYLE}" placeholder="0" /></div>
      <div class="gy-sell-foot">
        <button class="gy-btn ghost" data-gy-close>Annuler</button>
        <button class="gy-btn primary" id="gy-fp-ok"><i data-lucide="check"></i> Continuer</button>
      </div>`;
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-pass-veil'); });
    $('#gy-fp-ok', el).onclick = () => {
      const nm = cfg.name ? String($('#gy-fp-name', el).value || '').trim() : '';
      const price = Math.round((Number(String($('#gy-fp-price', el).value).replace(',', '.')) || 0) * 100) / 100;
      if (cfg.name && !nm) { toast('Donnez un intitulé'); return; }
      if (!(price > 0)) { toast('Saisissez le prix'); return; }
      closeVeil('#gy-pass-veil');
      cfg.ok(nm, price);
    };
    openVeil('#gy-pass-veil');
    icons();
    const f = $(cfg.name ? '#gy-fp-name' : '#gy-fp-price', el); if (f) f.focus();
  }
  function askShopPrice(sid) {
    const it = sid === '_free' ? null : SHOP_ITEM_T[sid];
    askFree({
      title: it ? it.label : 'Article libre',
      sub: it ? 'Aucun prix n\'est saisi pour cet article sur le tableau de bord' : 'Un article qui n\'est pas dans votre comptoir',
      name: !it, label: '',
      ok: (nm, price) => {
        if (it) state.cart.push({ id: sid, qty: 1, price });
        else state.cart.push({ id: 'free-' + Date.now().toString(36) + (++FREE_SEQ), qty: 1, price, label: nm });
        renderCart(); renderBadges(); icons();
      },
    });
  }

  const cartTotal = () => state.cart.reduce((s, l) => s + lineItem(l).price * l.qty, 0);

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
          const it = lineItem(ln);
          return `<div class="gy-cart-line">
            <span class="gy-cart-art">${ART[it.art] || ''}</span>
            <span class="gy-cart-mid"><span class="gy-cart-name">${esc(it.label)}</span><span class="gy-cart-sub">${pvReal() ? esc(fmtMAD(it.price)) : it.price} ${pvReal() ? '/ u' : 'MAD / u'}</span></span>
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
        <div class="gy-cart-note">Rendu calculé automatiquement pour un paiement en espèces.</div>
      </div>`;
    icons();
  }

  function payCart() {
    if (!state.cart.length) return;
    const total = cartTotal();
    const summary = state.cart.map((l) => `${l.qty} × ${lineItem(l).label}`).join(' · ');
    openPay({
      amount: total,
      title: 'Comptoir',
      sub: esc(summary),
      onPaid: (method, rendu) => {
        const lines = state.cart.map((l) => ({ itemId: l.id, name: lineItem(l).label, category: 'comptoir', qty: l.qty, unit: 'piece', kind: l.id === 'coach' || l.id === 'serviette' ? 'service' : 'product', total: lineItem(l).price * l.qty }));
        state.cart = [];
        addRevenue('shop', total);
        postDay(total, method, `Comptoir · ${summary}`, '', lines);
        renderCart(); renderBadges(); icons();
        if (state.view === 'pilotage') renderPilotage();
        toast(`${fmtMAD(total)} encaissé${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
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
            <span class="l"><b>Carte</b><span>Lecteur partenaire, paiement sur votre terminal</span></span>
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
            <label class="cash-input-label" for="gy-cash-in">Espèces reçues</label>
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
          <div class="reader-method">lecteur partenaire, paiement sur votre terminal</div>
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
      `<div class="gy-empty">${q ? `Aucun membre pour « ${esc(q)} », vérifiez le numéro, le nom ou le code badge.` : 'Aucun membre enregistré sur cette caisse.'}</div>`;
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
          <div class="gy-mb-cell-sub">${esc(fmtMAD(memberPrice(m)))}${m.student ? ' · étudiant' : ''}</div>
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
      noteEntry(m);
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
      return `Salam ${first} ! On ne t'a pas vu à ${gymVenue} depuis un moment, ton abonnement a expiré il y a ${Math.abs(d)} ${pl(Math.abs(d), 'jour', 'jours')}.`
        + `\nReviens quand tu veux : on te garde le tarif ${PLAN[m.plan].label.toLowerCase()} (${fmtMAD(memberPrice(m))}) et ${m.coach !== 'Sans coach' ? m.coach + ' t\'attend' : 'un coach pour te relancer'}.`
        + `\nUne séance et on repart fort, nchallah.`
        + `\n·${gymVenue}, via Kiwi`;
    }
    if (s === 'expiring') {
      return `Salam ${first} ! Ton abonnement ${gymVenue} se termine ${d === 0 ? "aujourd'hui" : 'dans ' + d + ' jour' + (d > 1 ? 's' : '')}.`
        + `\nRenouvelle dès maintenant pour ne pas couper ton élan, ${PLAN[m.plan].label.toLowerCase()} à ${fmtMAD(memberPrice(m))}.`
        + `\nObjectif « ${m.goal} » : on y est presque, lâche rien !`
        + `\n·${gymVenue}, via Kiwi`;
    }
    return `Salam ${first} ! Petit message d'${gymVenue}, continue comme ça, ${m.visits} ${pl(m.visits, 'passage', 'passages')} ce mois, c'est du sérieux.`
      + `\nBesoin d'un coup de main sur ton objectif « ${m.goal} » ? ${m.coach !== 'Sans coach' ? m.coach : 'Un coach'} est dispo cette semaine.`
      + `\n·${gymVenue}, via Kiwi`;
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
          <div class="gy-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} · brouillon, pas encore envoyé</div>
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
      return `Salam ${first} ! Ton abonnement ${gymVenue} ${memberStatus(m) === 'expired' ? 'a expiré' : 'expire bientôt'}. On te garde ta place, passe quand tu veux.\n·${gymVenue}, via Kiwi`;
    }
    if (tone === 'offre') {
      return `Salam ${first} ! Offre fidélité ${gymVenue} : renouvelle cette semaine et on t'offre une séance coach + un shaker.`
        + `\n${PLAN[m.plan].label} à ${fmtMAD(memberPrice(m))}. On t'attend !`
        + `\n·${gymVenue}, via Kiwi`;
    }
    return waMessage(m);
  }

  /* ───────────────────────── scan modal (member badge) ─────────────── */
  function openScan() { mockScan(); }

  /* ═══════════════════════ PLANNING — cours collectifs ═══════════════════════ */
  const STATE_LBL = { live: 'en cours', soon: 'commence bientôt', upcoming: 'à venir', done: 'terminé' };

  function renderPlanning() {
    syncStates();
    renderWeekStrip();
    const body = $('#gy-plan-body', root);
    const order = SCHEDULE.slice().sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || a.time.localeCompare(b.time));
    const live = order.filter((s) => s.state === 'live');
    const next = order.filter((s) => s.state === 'soon' || s.state === 'upcoming').sort((a, b) => a.time.localeCompare(b.time));
    const done = order.filter((s) => s.state === 'done').sort((a, b) => a.time.localeCompare(b.time));
    const totalBooked = SCHEDULE.reduce((n, s) => n + sessionBooked(s), 0);
    if (!SCHEDULE.length) {
      /* Aucun cours n'existe dans cette caisse : on le dit, au lieu d'afficher
         l'horaire de démonstration comme celui du club. */
      body.innerHTML = `<div class="gy-empty">Aucun cours collectif n'est programmé aujourd'hui. Ajoutez vos cours (coach, horaire, salle, capacité) : ils apparaissent ici et sur le tableau de bord.<div style="margin-top:12px"><button class="gy-btn primary" data-gy-addboard="appointments"><i data-lucide="plus"></i> Ajouter un cours</button></div></div>`;
      icons();
      return;
    }
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
      ? `${sessionPresent(s)} ${pl(sessionPresent(s), 'présent', 'présents')} · ${booked}/${s.cap} inscrits`
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
          <div class="gy-rost-cap-l"><b>${booked}</b> / ${s.cap} inscrits${s.state === 'done' || s.state === 'live' ? ` · <b>${present + (s.state === 'done' ? Math.round(s.extra * 0.82) : 0)}</b> ${pl(present + (s.state === 'done' ? Math.round(s.extra * 0.82) : 0), 'présent', 'présents')}` : full ? ` · complet` : ` · ${places} place${places > 1 ? 's' : ''}`}</div>
          <div class="gy-class-capbar lg"><i style="width:${pct}%" class="${full ? 'full' : ''}"></i></div>
        </div>
        ${canCheck ? `<div class="gy-rost-hint"><i data-lucide="info"></i> Pointez chaque membre à son arrivée, la présence compte aussi comme une entrée salle.</div>` : ''}
        <div class="gy-f-lbl" style="margin-top:6px">Inscrits ${named.length ? `· ${named.length} nominatifs` : ''}</div>
        <div class="gy-rost-list">
          ${named.map((m) => rosterRow(s, m.id, canCheck)).join('') || '<div class="gy-empty">Aucun inscrit nominatif.</div>'}
          ${s.extra > 0 ? `<div class="gy-rost-extra"><span class="gy-mem-ava mut">+${s.extra}</span><span class="gy-rost-l"><b>${s.extra} ${pl(s.extra, 'autre membre', 'autres membres')}</b><span>réservés via l'app Kiwi Membre</span></span></div>` : ''}
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
    if (m) noteEntry(m);
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
        </button>`).join('') : `<div class="gy-empty">${q ? `Aucun membre pour « ${esc(q)} ».` : 'Aucun membre enregistré sur cette caisse.'}</div>`;
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
    syncStates();
    const body = $('#gy-coach-body', root);
    const totalCredits = MEMBERS.reduce((n, m) => n + m.ptCredits, 0);
    const ptToday = Object.values(PT_TODAY).reduce((s, arr) => s + arr.length, 0);
    body.innerHTML = `
      <div class="gy-coach-intro">
        <div class="gy-coach-intro-l">
          <b>Coaching personnel</b>
          <span>Vendez des packs de séances, suivez la journée de chaque coach. <b class="gy-ci-strong">${totalCredits}</b> ${pl(totalCredits, 'séance créditée', 'séances créditées')} chez les membres · <b class="gy-ci-strong">${ptToday}</b> ${pl(ptToday, 'séance perso', 'séances perso')} aujourd'hui.</span>
        </div>
      </div>
      ${COACHES.length || !pvReal() ? `<div class="gy-coach-grid">${COACHES.map(coachCard).join('')}</div>` : '<div class="gy-empty">Aucun coach n\'est saisi pour cette salle. Ajoutez vos coachs sur le tableau de bord pour les retrouver ici et sur les cours.</div>'}
      ${pvReal() ? `<div style="margin-top:12px"><button class="gy-btn ghost sm" data-gy-addboard="practitioners"><i data-lucide="settings"></i> ${COACHES.length ? 'Modifier mes coachs' : 'Ajouter mes coachs'}</button></div>` : ''}`;
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
        <span><b>${classCount}</b> cours</span><span><b>${ptCount}</b> perso</span><span><b>${mem.length}</b> ${pl(mem.length, 'suivi', 'suivis')}</span>
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
    const sel = { pack: pvReal() ? (PT_PACKS[0] ? PT_PACKS[0].id : '_free') : 'pt5', typed: '', freeN: 5, member: member || null, coach: coachId || (member && member.coach !== 'Sans coach' && COACH_BY_NAME[member.coach] ? COACH_BY_NAME[member.coach].id : null) };
    /* pack effectif : prix du gérant, ou prix (et nombre de séances) saisis */
    const ptEff = () => {
      if (!pvReal()) return PT_PACKS.find((p) => p.id === sel.pack);
      const base = sel.pack === '_free'
        ? { id: '_free', n: 1, price: 0, sub: 'séances et prix à saisir', free: true }
        : (PT_PACKS.find((p) => p.id === sel.pack) || { id: '_free', n: 1, price: 0, sub: 'séances et prix à saisir', free: true });
      const typedP = Math.round((Number(String(sel.typed).replace(',', '.')) || 0) * 100) / 100;
      const needs = !!base.free || !(base.price > 0);
      return Object.assign({}, base, { n: base.free ? Math.max(1, Math.round(Number(sel.freeN)) || 1) : base.n, price: needs ? typedP : base.price, needsTyped: needs });
    };
    const paintPt = () => {
      const k = ptEff();
      const lbl = $('[data-gy-pt-lbl]', el); if (lbl) lbl.textContent = `${k.n} séance${k.n > 1 ? 's' : ''} de coaching${sel.coach ? ' · ' + COACH[sel.coach].name : ''}`;
      $$('[data-gy-pt-amt]', el).forEach((n) => { n.textContent = fmtMAD(k.price); });
      const b = $('[data-gy-pt-btn]', el); if (b) b.textContent = 'Encaisser' + (k.price > 0 ? ' ' + fmtMAD(k.price) : '');
    };
    const render = () => {
      const pk = ptEff();
      el.innerHTML = `
        <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Vendre des séances de coaching</h3>
        <p class="modal-subtle">${sel.member ? esc(sel.member.name) + ' · ' + esc(sel.member.phone || 'sans téléphone') : 'Choisissez le pack, puis le membre à créditer.'}</p>
        <div class="gy-f"><div class="gy-f-lbl">Pack de séances</div>
          <div class="gy-plan-pick">${PT_PACKS.map((p) => `
            <button class="gy-plan-opt ${p.id === sel.pack ? 'on' : ''}" data-gy-pp="${p.id}">
              ${p.flag ? `<span class="gy-pp-flag">${esc(p.flag)}</span>` : ''}
              <span class="gy-plan-opt-name">${p.n} séance${p.n > 1 ? 's' : ''}</span>
              <span class="gy-plan-opt-price mono">${esc(pvReal() && !(p.price > 0) ? 'prix à saisir' : fmtMAD(p.price))}</span>
              <span class="gy-plan-opt-sub">${esc(p.sub)}</span>
            </button>`).join('')}${pvReal() ? `
            <button class="gy-plan-opt ${sel.pack === '_free' ? 'on' : ''}" data-gy-pp="_free">
              <span class="gy-plan-opt-name">Pack libre</span>
              <span class="gy-plan-opt-price mono">prix libre</span>
              <span class="gy-plan-opt-sub">séances et prix à saisir</span>
            </button>` : ''}</div>
        </div>
        ${pk.needsTyped ? `<div class="gy-f">
          ${pk.free ? `<div class="gy-f-lbl">Nombre de séances</div><input id="gy-pt-n" type="number" inputmode="numeric" min="1" step="1" style="${IN_STYLE}" value="${esc(sel.freeN)}" />` : `<div class="gy-pass-note"><i data-lucide="info"></i> Aucun prix n'est saisi pour ce pack sur le tableau de bord : saisissez le prix de cette vente.</div>`}
          <div class="gy-f-lbl" style="margin-top:10px">Prix (MAD)</div><input id="gy-pt-p" type="text" inputmode="decimal" autocomplete="off" style="${IN_STYLE}" value="${esc(sel.typed)}" placeholder="0" />
        </div>` : ''}
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
          <div class="gy-sell-sum-row"><span data-gy-pt-lbl>${pk.n} séance${pk.n > 1 ? 's' : ''} de coaching${sel.coach ? ' · ' + esc(COACH[sel.coach].name) : ''}</span><b data-gy-pt-amt>${esc(fmtMAD(pk.price))}</b></div>
          <div class="gy-sell-sum-row total"><span>À encaisser</span><b class="mono" data-gy-pt-amt>${esc(fmtMAD(pk.price))}</b></div>
        </div>
        <div class="gy-sell-foot">
          <button class="gy-btn ghost" data-gy-close>Annuler</button>
          <button class="gy-btn primary" id="gy-pt-pay" ${sel.member ? '' : 'disabled'}><i data-lucide="banknote"></i> <span data-gy-pt-btn>Encaisser${pk.price > 0 || !pvReal() ? ' ' + esc(fmtMAD(pk.price)) : ''}</span></button>
        </div>`;
      icons();
      const ptn = $('#gy-pt-n', el), ptp = $('#gy-pt-p', el);
      if (ptn) ptn.oninput = () => { sel.freeN = ptn.value; paintPt(); };
      if (ptp) ptp.oninput = () => { sel.typed = ptp.value; paintPt(); };
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
        const pkN = ptEff();
        if (pvReal() && !(pkN.price > 0)) { toast('Saisissez le prix du pack'); return; }
        closeVeil('#gy-ptpack-veil');
        openPay({
          amount: pkN.price, title: 'Séances de coaching',
          sub: `${esc(sel.member.name)} · ${pkN.n} séance${pkN.n > 1 ? 's' : ''}`,
          onPaid: (method, rendu) => {
            sel.member.ptCredits += pkN.n;
            if (sel.coach && sel.member.coach === 'Sans coach') sel.member.coach = COACH[sel.coach].name;
            addRevenue('coaching', pkN.price);
            postDay(pkN.price, method, `Coaching · ${pkN.n} séance${pkN.n > 1 ? 's' : ''} · ${sel.member.name}`, sel.member.code || '', [
              { itemId: pkN.id, variantId: sel.coach || '', name: `Coaching · ${pkN.n} séance${pkN.n > 1 ? 's' : ''}`, category: 'coaching', qty: pkN.n, unit: 'seance', kind: 'service', total: pkN.price },
            ]);
            queueIfOffline('Vente séances coaching');
            toast(`${firstName(sel.member.name)}, ${pkN.n} séance${pkN.n > 1 ? 's' : ''} ajoutée${pkN.n > 1 ? 's' : ''}${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
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
    rollDay();
    const real = pvReal();
    const fig = clubFigures();
    const passages = passagesToday();
    const exp = MEMBERS.filter((m) => { const s = memberStatus(m); return s === 'expiring' || s === 'expired'; }).length;
    const occ = Math.min(100, Math.round((state.inGym / CLUB.capacity) * 100));
    const rev = state.dayRevenue, revTot = revenueTotal();
    /* Fréquentation : démo = série du seed ; session réelle = les passages
       qu'on a réellement comptés (ATTEND_HIST), 0 pour un jour sans caisse
       ouverte. Les initiales suivent les vrais jours, la dernière barre est
       aujourd'hui (elle portait toujours « D »). */
    const attend = real ? [] : CLUB.attend7.slice();
    const wd = [];
    const letters = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      wd.push(letters[d.getDay()]);
      if (real) attend.push(i === 0 ? passages : (ATTEND_HIST[new Date(Date.parse(bizDay() + 'T12:00:00Z') - i * DAY).toISOString().slice(0, 10)] || 0));
    }
    attend[6] = passages;
    const maxA = Math.max.apply(null, attend.concat([1]));
    const newM = fig.newM, churn = fig.churn, net = newM - churn;
    body.innerHTML = `
      <div class="gy-kpi-grid">
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="users"></i></span><span class="gy-kpi-trend up"><i data-lucide="trending-up"></i> +${newM} ce mois</span></div>
          <div class="gy-kpi-val">${activeCount()}</div>
          <div class="gy-kpi-lbl">Membres actifs</div>
        </div>
        <div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="repeat"></i></span><span class="gy-kpi-trend">/ mois</span></div>
          <div class="gy-kpi-val">${esc(fmtMAD(fig.mrr))}</div>
          <div class="gy-kpi-lbl">${real ? 'Revenu récurrent estimé (MRR)' : 'Revenu récurrent (MRR)'}</div>
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
        ${real ? `<div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="ticket"></i></span></div>
          <div class="gy-kpi-val">${state.passesToday}</div>
          <div class="gy-kpi-lbl">${pl(state.passesToday, 'Pass vendu', 'Pass vendus')} aujourd'hui</div>
        </div>` : `<div class="gy-kpi">
          <div class="gy-kpi-top"><span class="gy-kpi-ic"><i data-lucide="activity"></i></span><span class="gy-kpi-trend mono">${state.inGym}/${CLUB.capacity}</span></div>
          <div class="gy-kpi-val">${occ}<span class="gy-kpi-unit">%</span></div>
          <div class="gy-kpi-lbl">Occupation salle</div>
          <div class="gy-kpi-bar"><i style="width:${occ}%"></i></div>
        </div>`}
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
          <div class="gy-pilot-card-h"><b>Répartition des formules</b><span>${activeCount()} ${pl(activeCount(), 'actif', 'actifs')}</span></div>
          <div class="gy-mix">${fig.mix.map((x) => `<div class="gy-mix-row"><span class="gy-mix-lbl">${esc(PLAN[x.id].label)}</span><span class="gy-mix-bar"><i class="m-${x.id}" style="width:${x.pct}%"></i></span><span class="gy-mix-pct mono">${x.pct}%</span></div>`).join('')}</div>
          <div class="gy-mix-foot"><span><b class="up">+${newM}</b> ${pl(newM, 'nouveau', 'nouveaux')}</span><span><b class="down">−${churn}</b> ${pl(churn, 'parti', 'partis')}</span><span>net <b>${net >= 0 ? '+' : ''}${net}</b></span></div>
        </div>
        <button class="gy-pilot-card relance" data-gy-pilot-relance>
          <div class="gy-pilot-card-h"><b>À relancer</b><span class="gy-pill ${exp ? 'red' : 'ok'}">${exp || '0'}</span></div>
          <div class="gy-relance-l">${exp ? `${exp} abonnement${exp > 1 ? 's' : ''} expire${exp > 1 ? 'nt' : ''} cette semaine ou ${exp > 1 ? 'ont' : 'a'} déjà expiré. Un message WhatsApp motivant est prêt pour chacun.` : 'Aucune relance en attente, la rétention est bonne.'}</div>
          <span class="gy-relance-cta">Ouvrir les relances <i data-lucide="arrow-right"></i></span>
        </button>
      </div>

      ${real ? '' : `<div class="gy-pilot-foot">Données de démonstration, le club entier (${activeCount()} membres) ; les 10 fiches nominatives sont l'échantillon manipulable du comptoir.</div>`}`;
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
  /* real store : les pass sont ceux du gérant (50 / 80 / 90 MAD étaient ceux de la démo). */
  if (pvReal()) DAY_PASSES.length = 0;
  function openDayPass() {
    const el = $('#gy-passm', root);
    const real = pvReal();
    el.innerHTML = `
      <button class="gy-modal-x" data-gy-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Séance unique / Pass journée</h3>
      <p class="modal-subtle">Pour un visiteur sans abonnement, touriste, invité, séance d'essai. Accès immédiat, sans créer de fiche.</p>
      <div class="gy-pass-grid">${DAY_PASSES.map((p) => `
        <button class="gy-pass-card" data-gy-pass="${p.id}">
          ${p.flag ? `<span class="gy-shop-flag">${esc(p.flag)}</span>` : ''}
          <span class="gy-pass-art">${ART.pass}</span>
          <span class="gy-pass-name">${esc(p.label)}</span>
          <span class="gy-pass-price">${real && !(p.price > 0) ? '<b style="font-size:14px">prix à saisir</b>' : `<b>${real ? esc(numTxt(p.price)) : p.price}</b> MAD`}</span>
          <span class="gy-pass-sub">${esc(p.sub)}</span>
        </button>`).join('')}${real ? `
        <button class="gy-pass-card" data-gy-pass="_free">
          <span class="gy-pass-art">${ART.pass}</span>
          <span class="gy-pass-name">Pass libre</span>
          <span class="gy-pass-price"><b style="font-size:14px">prix à saisir</b></span>
          <span class="gy-pass-sub">intitulé et prix à saisir</span>
        </button>` : ''}</div>
      ${real ? `<div class="gy-pass-note"><i data-lucide="info"></i> ${DAY_PASSES.length ? 'Vos séances uniques et pass viennent du tableau de bord.' : 'Aucun pass n\'est saisi sur le tableau de bord : vendez un pass libre, ou ajoutez vos pass avec leur prix.'} <button class="gy-btn ghost sm" data-gy-addboard="shop">${DAY_PASSES.length ? 'Modifier' : 'Ajouter mes pass'}</button></div>` : ''}
      <div class="gy-pass-note"><i data-lucide="info"></i> Le pass ouvre le tourniquet une fois. Proposez l'abonnement si le visiteur revient, c'est là que la conversion se joue.</div>`;
    openVeil('#gy-pass-veil');
    icons();
    $$('[data-gy-close]', el).forEach((b) => { b.onclick = () => closeVeil('#gy-pass-veil'); });
    const sellPass = (p) => {
      openPay({
        amount: p.price, title: p.label, sub: 'Accès visiteur, sans abonnement',
        onPaid: (method, rendu) => {
          rollDay();
          const heads = p.id === 'duo' ? 2 : (p.persons || 1);
          BASE_PASSAGES += heads;
          state.passesToday += 1;
          state.inGym += heads;
          peakAdd(heads);
          addRevenue('pass', p.price);
          postDay(p.price, method, `Pass · ${p.label}`, '', [
            { itemId: `pass-${p.id}`, name: p.label, category: 'pass', qty: 1, unit: 'pass', kind: 'service', total: p.price },
          ]);
          queueIfOffline('Séance unique / pass');
          toast(`${p.label} vendu, accès ouvert${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
          refreshOps();
          if (state.view === 'checkin') renderCounter();
        },
      });
    };
    $$('[data-gy-pass]', el).forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.gyPass;
        const p0 = id === '_free' ? { id: 'free', label: 'Pass libre', price: 0, persons: 1, free: true } : DAY_PASSES.find((x) => x.id === id);
        if (!p0) return;
        closeVeil('#gy-pass-veil');
        if (real && (p0.free || !(p0.price > 0))) {
          askFree({
            title: p0.free ? 'Pass libre' : p0.label,
            sub: p0.free ? 'Un pass qui n\'est pas dans votre liste' : 'Aucun prix n\'est saisi pour ce pass sur le tableau de bord',
            name: !!p0.free, label: p0.free ? '' : p0.label,
            ok: (nm, price) => sellPass(Object.assign({}, p0, { label: nm || p0.label, price })),
          });
          return;
        }
        sellPass(p0);
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

  /* ═══════════════════════ RÉSEAU ═══════════════════════════════════════════
     Démo : une coupure SIMULÉE (le bouton bascule un drapeau, la file est fictive).
     Session réelle : l'indicateur dit ce que le navigateur sait (navigator.onLine)
     et la vraie file de ventes (KiwiLive.queueStatus). Il ne se bascule plus à la
     main, et plus aucun toast n'annonce « tout est synchronisé » sans l'avoir
     vérifié : le bouton affichait « Réseau de retour, tout est synchronisé » alors
     qu'il venait seulement de changer un drapeau. */
  function liveQueue() {
    try {
      const q = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus();
      return q ? { pending: +q.pending || 0, blocked: +q.blocked || 0, storageError: !!q.storageError } : null;
    } catch (_) { return null; }
  }
  function syncNet() {
    if (!pvReal()) return;
    const q = liveQueue();
    state.offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    state.queued = q ? q.pending : 0;
    state.syncBlocked = !!q && (q.storageError || q.blocked > 0);
    if (root) renderNet();
  }
  let netBound = false;
  function bindNet() {
    if (netBound || !pvReal()) return;
    netBound = true;
    window.addEventListener('online', syncNet);
    window.addEventListener('offline', syncNet);
    window.addEventListener('kiwi:sale-queue', syncNet);
    syncNet();
  }
  function toggleOffline() {
    if (pvReal()) {
      syncNet();
      toast(state.syncBlocked ? 'Synchronisation bloquée, contactez le support'
        : state.offline ? 'Wi-Fi indisponible, les opérations restent sur cette caisse'
          : state.queued ? `${state.queued} ${pl(state.queued, 'vente', 'ventes')} en cours de synchronisation`
            : 'Caisse en ligne, aucune vente en attente d\'envoi');
      return;
    }
    state.offline = !state.offline;
    if (!state.offline) {
      if (state.queued) {
        toast(`Réseau simulé rétabli, file de démonstration vidée (${state.queued})`);
        state.queued = 0;
      } else {
        toast('Réseau simulé rétabli');
      }
    } else {
      toast('Mode hors-ligne simulé, la salle continue de tourner');
    }
    renderNet();
  }

  function renderNet() {
    const net = $('#gy-net', root);
    if (!net) return;
    const real = pvReal();
    net.classList.toggle('is-off', state.offline || !!state.syncBlocked);
    $('.gy-net-label', net).textContent = state.syncBlocked ? 'Sync bloquée' : state.offline ? 'Hors-ligne' : (real && state.queued) ? 'Synchronisation' : 'En ligne';
    net.title = real ? 'État du réseau' : 'Simuler une coupure réseau';
    let q = $('.gy-net-queue', net);
    if ((real || state.offline) && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'gy-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#gy-offline-note', root);
    note.hidden = !state.offline && !state.syncBlocked;
    note.innerHTML = (state.syncBlocked
      ? 'La synchronisation est bloquée. Les ventes restent sur cette caisse : contactez le support avant de vider les données du navigateur. '
      : 'Hors-ligne, les pointages et ventes restent sur la tablette et partent à la synchro au retour du réseau. ') + '<b id="gy-queue-count"></b>';
    $('#gy-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'gym',
    greet: {
      line1: 'Bonjour Coach Amine,',
      em: 'bienvenue.',
      sub: 'Atlas Fitness <em>·</em> comptoir, check-in du jour',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() {
      if (!root) return;
      if (rollDay() && gymOps) gymOps.save('Nouvelle journée');
      renderAll();
      setTimeout(() => { const i = $('#gy-ci-input', root); if (i && state.view === 'checkin') i.focus(); }, 80);
    },
  });
})();
