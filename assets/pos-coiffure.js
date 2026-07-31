/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · SALON DE COIFFURE — Salon Yasmine (PIN 0014), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Un salon mixte de quartier (Iberia, Tanger) — trois mains : Yasmine la
 * patronne, Karim au bac et au rasoir, Sara la coloriste. La caisse suit le
 * fauteuil : on enchaîne walk-in et rendez-vous, chaque passage est monté en
 * prestations puis attribué à un·e coiffeur·se. Le différenciateur, c'est la
 * MÉMOIRE : la fiche cliente se souvient de la formule couleur exacte de la
 * dernière fois (« 7.3 doré + oxydant 6 % · 35 min de pose ») — un tap, et la
 * couleur du jour est pré-remplie. À la fin du service, le pourboire se ventile
 * entre les coiffeur·se·s, et la journée se clôt avec passages, CA et
 * commission (40 %) par personne.
 *
 * Réutilise le kit caisse (.modal-veil, .modal, .cash-*, .reader-*, .pay-tip)
 * et le #toast-stack partagé. V1 = couche opérationnelle : la carte part au
 * lecteur partenaire, sans encaissement Kiwi.
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
  const rescanLens = () => { if (window.KiwiLens) try { KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const MIN = 60 * 1000;
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const moveCaretEnd = (input) => { const v = input.value; input.value = ''; input.value = v; };

  /* real-store detection — neutralize demo PEOPLE when a merchant is paired */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

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

  /* ───────────────────────── line-art (the service grid sells visuals) ─────
     Same voice as the pressing's garment dict: forest strokes, mint-tint
     fills, 64×64 grid, round caps. Recognizable silhouettes per prestation. */
  const art = (inner) => `<svg class="cf-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    /* ciseaux — coupe */
    coupe_f: art(`<circle class="fill" cx="17" cy="18" r="6"/><circle cx="17" cy="18" r="6"/><circle class="fill" cx="17" cy="46" r="6"/><circle cx="17" cy="46" r="6"/><path d="M21.5 22 52 49M21.5 42 52 15"/><circle class="thin" cx="35" cy="32" r="1.6"/>`),
    coupe_h: art(`<path class="fill" d="M16 30c0-11 6-18 16-18s16 7 16 18v3H16z"/><path d="M16 33c0-13 6-21 16-21s16 8 16 21"/><path class="thin" d="M22 25c3-5 17-5 20 0M20 31h24"/><path d="M22 36v12M32 36v14M42 36v12"/>`),
    brushing: art(`<path class="fill" d="M40 10l12 6-3 8-12-5z"/><path d="M40 10l12 6-3 8-12-5z"/><path d="M37 19 12 46l-4 9 9-4 25-26"/><path class="thin" d="M20 39l5 5M27 32l5 5"/><path class="thin" d="M44 13l4 2M42 18l4 2"/>`),
    couleur: art(`<path class="fill" d="M24 8h10v10l5 6v28a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V24l5-6z"/><path d="M24 8h10v10l5 6v28a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4V24l5-6z"/><path d="M19 34h20"/><path class="thin" d="M27 8v10M31 8v10"/><circle class="thin" cx="29" cy="44" r="3"/>`),
    meches: art(`<path class="fill" d="M32 8c-9 8-14 16-14 26 0 11 6 22 14 22s14-11 14-22c0-10-5-18-14-26z"/><path d="M32 8c-9 8-14 16-14 26 0 11 6 22 14 22s14-11 14-22c0-10-5-18-14-26z"/><path class="thin" d="M26 24c-2 8-2 18 0 26M38 24c2 8 2 18 0 26M32 18v40"/>`),
    lissage: art(`<rect class="fill" x="14" y="26" width="36" height="12" rx="6"/><rect x="14" y="26" width="36" height="12" rx="6"/><path d="M8 32h6M50 32h6"/><path class="thin" d="M22 30 18 14M32 30v-18M42 30l4-16"/><path class="thin" d="M22 38l-3 12M42 38l3 12"/>`),
    barbe: art(`<path class="fill" d="M16 22c0-3 4-4 8-4 3-3 4-6 8-6s5 3 8 6c4 0 8 1 8 4 0 14-7 28-16 28S16 36 16 22z"/><path d="M16 22c0-3 4-4 8-4 3-3 4-6 8-6s5 3 8 6c4 0 8 1 8 4 0 14-7 28-16 28S16 36 16 22z"/><path class="thin" d="M24 22c0 4-1 6-3 8M40 22c0 4 1 6 3 8M32 30v16"/><path d="M27 25c3 2 7 2 10 0"/>`),
    soin: art(`<path class="fill" d="M32 14c-8 6-12 13-12 22 0 9 5 14 12 14s12-5 12-14c0-9-4-16-12-22z"/><path d="M32 14c-8 6-12 13-12 22 0 9 5 14 12 14s12-5 12-14c0-9-4-16-12-22z"/><path class="thin" d="M32 30c-3 3-5 7-5 12"/><path class="soft thin" d="M40 11c3 2 5 5 5 9M44 8c2 1.5 3.5 4 3.5 7"/>`),
    coiffage: art(`<path class="fill" d="M32 9c-12 0-20 9-20 22 0 6 2 9 5 9 2 0 3-2 3-5 0-9 4-15 12-15s12 6 12 15c0 3 1 5 3 5 3 0 5-3 5-9 0-13-8-22-20-22z"/><path d="M32 9c-12 0-20 9-20 22 0 6 2 9 5 9 2 0 3-2 3-5 0-9 4-15 12-15s12 6 12 15c0 3 1 5 3 5 3 0 5-3 5-9 0-13-8-22-20-22z"/><path class="thin" d="M32 47v8M26 50l-3 5M38 50l3 5"/>`),
  };

  /* ───────────────────────── staff (Yasmine, Karim, Sara) ───────────────── */
  const STAFF = [
    { id: 'yasmine', name: 'Yasmine', role: 'Patronne · couleur & coupe', short: 'Yas', color: '#1F5D3C' },
    { id: 'karim',   name: 'Karim',   role: 'Coupe homme · barbe · bac',  short: 'Kar', color: '#33588C' },
    { id: 'sara',    name: 'Sara',    role: 'Coloriste · mèches & soin',  short: 'Sar', color: '#A8423A' },
  ];
  /* real store: strip staff identities, keep id/color/length so assignment & commission logic holds */
  if (pvReal()) STAFF.forEach((s, i) => { s.name = 'Coiffeur ' + (i + 1); s.short = 'C' + (i + 1); s.role = ''; });
  const SF = Object.fromEntries(STAFF.map((s) => [s.id, s]));
  const COMMISSION = 0.40;

  function ava(staffId, cls) {
    const s = SF[staffId];
    if (!s) return '';
    return `<span class="av ${cls || ''}" style="background:${s.color}">${esc(s.short[0])}</span>`;
  }

  /* ───────────────────────── prestations + tarifs (MAD, Tanger 2026) ──────
     A « passage » is a ticket of one or more prestations assigned to a staff.
     `couleur` is the headline: it carries a recipe (la formule). `min` is the
     starting price; some prestations open a length/longueur variant. */
  const CATALOG = [
    { id: 'coupe', label: 'Coupe', items: [
      { id: 'coupe_f',  label: 'Coupe femme', price: 120, dur: 40 },
      { id: 'coupe_h',  label: 'Coupe homme', price: 60,  dur: 25 },
      { id: 'barbe',    label: 'Barbe / rasage', price: 40, dur: 20 },
    ] },
    { id: 'coiffage', label: 'Coiffage', items: [
      { id: 'brushing', label: 'Brushing', price: 80, dur: 30,
        variants: [
          { id: 'court', label: 'Court',   price: 80,  dur: 25 },
          { id: 'mi',    label: 'Mi-long', price: 100, dur: 35 },
          { id: 'long',  label: 'Long',    price: 130, dur: 45 },
        ] },
      { id: 'coiffage', label: 'Coiffage / chignon', price: 150, dur: 45, flag: 'événement' },
      { id: 'soin',     label: 'Soin profond', price: 90, dur: 25 },
    ] },
    { id: 'couleur', label: 'Couleur', items: [
      { id: 'couleur',  label: 'Couleur', price: 250, dur: 75, formula: true, flag: 'formule',
        variants: [
          { id: 'racines', label: 'Racines',  price: 250, dur: 60 },
          { id: 'complete', label: 'Complète', price: 320, dur: 90 },
        ] },
      { id: 'meches',   label: 'Mèches / balayage', price: 350, dur: 120, formula: true,
        variants: [
          { id: 'demi',  label: 'Demi-tête', price: 350, dur: 90 },
          { id: 'pleine', label: 'Pleine tête', price: 480, dur: 150 },
        ] },
      { id: 'lissage',  label: 'Lissage', price: 600, dur: 150, flag: 'kératine' },
    ] },
  ];
  const ITEMS = {};
  CATALOG.forEach((c) => c.items.forEach((it) => { it.cat = c.id; ITEMS[it.id] = it; }));

  function priceOf(item, variantId) {
    if (item.variants) { const v = item.variants.find((x) => x.id === variantId) || item.variants[0]; return v.price; }
    return item.price;
  }
  function durOf(item, variantId) {
    if (item.variants) { const v = item.variants.find((x) => x.id === variantId) || item.variants[0]; return v.dur; }
    return item.dur;
  }
  const minPrice = (item) => item.variants ? Math.min(...item.variants.map((v) => v.price)) : item.price;

  /* add-ons combinables sur une couleur/un soin */
  const ADDONS = [
    { id: 'shampoing', label: 'Shampoing premium', price: 20 },
    { id: 'masque',    label: 'Masque réparateur', price: 40 },
    { id: 'olaplex',   label: 'Olaplex', price: 60 },
  ];
  const ADDON = Object.fromEntries(ADDONS.map((a) => [a.id, a]));

  /* ───────────────────────── couleur — la formule (signature) ─────────────
     Une formule = base + nuance + oxydant + temps de pose + marque/notes.
     Trois fiches en portent une, mémorisée de la dernière visite. */
  function fmtFormula(f) {
    return `${f.base}${f.tone ? ' ' + f.tone : ''} + ${f.ox}% · ${f.pose} min`;
  }

  /* ───────────────────────── clientèle (Tanger) ───────────────────────── */
  const NOW = Date.now();
  const dAgo = (days) => new Date(NOW - days * 24 * 60 * MIN);
  const CUSTOMERS = pvReal() ? [] : [
    { id: 'cl1', name: 'Salma Bennani', phone: '0661 24 18 07', visits: 14, last: dAgo(38),
      prefs: ['Raie à gauche', 'N\'aime pas trop court', 'Thé sans sucre'],
      formula: { name: 'Doré chaud', base: '7.3', tone: 'doré', ox: 6, pose: 35, brand: 'Inoa', notes: 'Couvre bien les racines blanches du contour' },
      hist: [
        { when: dAgo(38), svc: 'Couleur (racines) + Brushing', by: 'yasmine', amt: 330 },
        { when: dAgo(80), svc: 'Couleur (complète)', by: 'yasmine', amt: 320 },
        { when: dAgo(120), svc: 'Coupe femme + Soin', by: 'yasmine', amt: 210 },
      ] },
    { id: 'cl2', name: 'Imane Tazi', phone: '0670 55 21 90', visits: 9, last: dAgo(52),
      prefs: ['Balayage très naturel', 'Pas d\'ammoniaque'],
      formula: { name: 'Balayage caramel', base: 'Balayage', tone: 'caramel', ox: 9, pose: 45, brand: 'Blond Studio', notes: 'Demi-tête, effet soleil sur les longueurs' },
      hist: [
        { when: dAgo(52), svc: 'Mèches (demi-tête) + Brushing long', by: 'sara', amt: 480 },
        { when: dAgo(140), svc: 'Mèches (demi-tête)', by: 'sara', amt: 350 },
      ] },
    { id: 'cl3', name: 'Nadia El Fassi', phone: '0653 88 14 22', visits: 22, last: dAgo(26),
      prefs: ['Couleur foncée intense', 'Coupe carré net', 'Allergie PPD, test mèche'],
      formula: { name: 'Brun froid', base: '4.1', tone: 'cendré', ox: 6, pose: 40, brand: 'Majirel', notes: 'Sans PPD, toujours faire le test la veille' },
      hist: [
        { when: dAgo(26), svc: 'Couleur (complète) + Coupe femme', by: 'yasmine', amt: 440 },
        { when: dAgo(60), svc: 'Coupe femme + Brushing', by: 'yasmine', amt: 200 },
        { when: dAgo(95), svc: 'Couleur (complète)', by: 'yasmine', amt: 320 },
      ] },
    { id: 'cl4', name: 'Khalid Rais', phone: '0662 30 41 55', visits: 31, last: dAgo(12),
      prefs: ['Dégradé bas', 'Barbe taillée courte', 'Toujours le mercredi'],
      hist: [
        { when: dAgo(12), svc: 'Coupe homme + Barbe', by: 'karim', amt: 100 },
        { when: dAgo(33), svc: 'Coupe homme + Barbe', by: 'karim', amt: 100 },
      ] },
    { id: 'cl5', name: 'Meriem Saadi', phone: '0668 17 92 34', visits: 5, last: dAgo(70),
      prefs: ['Cheveux fins, volume racines'],
      hist: [{ when: dAgo(70), svc: 'Coupe femme + Brushing mi-long', by: 'yasmine', amt: 220 }] },
    { id: 'cl6', name: 'Yousra Alami', phone: '0677 64 28 11', visits: 7, last: dAgo(45),
      prefs: ['Soin avant événement', 'Chignon mariage en juin'],
      hist: [{ when: dAgo(45), svc: 'Coiffage / chignon + Soin', by: 'sara', amt: 240 }] },
    { id: 'cl7', name: 'Hicham Berrada', phone: '0661 09 73 50', visits: 18, last: dAgo(20),
      prefs: ['Coupe ciseaux uniquement', 'Pas de gel'],
      hist: [{ when: dAgo(20), svc: 'Coupe homme', by: 'karim', amt: 60 }] },
    { id: 'cl8', name: 'Loubna Cherkaoui', phone: '0650 41 88 02', visits: 3, last: dAgo(110),
      prefs: ['Découverte lissage kératine'],
      hist: [{ when: dAgo(110), svc: 'Brushing long', by: 'sara', amt: 130 }] },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

  /* ───────────────────────── walk-in queue + RDV (MID-SHIFT seed) ─────────
     Il est l'après-midi, le salon tourne. Deux clientes sont DANS les
     fauteuils (au bac / en cours), deux attendent leur tour, une couleur en
     pose. Le RDV de l'après-midi est à moitié rempli. C'est vivant. */
  const STATES = {
    attente: { label: 'En attente', icon: 'clock' },
    bac:     { label: 'Au bac',     icon: 'droplets' },
    cours:   { label: 'En cours',   icon: 'scissors' },
    fini:    { label: 'Terminé',    icon: 'check' },
  };
  const STATE_FLOW = ['attente', 'bac', 'cours', 'fini'];
  const WAIT_PER = 20; // minutes estimées par passage devant

  let passSeq = 47;
  function mkPass(cfg) {
    /* l'id reste numérique — advancePass le lit en nombre (+dataset.cfPass)
       et validateTicket calcule le prochain via Math.max(...ids). */
    return {
      id: cfg.id,
      custId: cfg.custId || null,
      guest: cfg.guest || null,
      staffId: cfg.staffId || null,
      lines: (cfg.lines || []).map((l) => ({
        itemId: l[0], variantId: l[1] || null, addons: l[2] || [], staffId: l[3] || cfg.staffId || null, formula: l[4] || null, note: l[5] || '',
      })),
      state: cfg.state || 'attente',
      arrivedAt: new Date(NOW - (cfg.arrivedMin || 0) * MIN),
      tip: 0, tipSplit: {},
      paid: false, payMethod: null,
    };
  }

  /* file d'attente (walk-in + en cours) */
  const PASSAGES = pvReal() ? [] : [
    mkPass({ id: 1041, custId: 'cl3', staffId: 'yasmine', state: 'cours', arrivedMin: 65,
      lines: [['couleur', 'complete', ['olaplex'], 'yasmine', { base: '4.1', tone: 'cendré', ox: 6, pose: 40, brand: 'Majirel' }], ['coupe_f', null, [], 'yasmine']] }),
    mkPass({ id: 1042, custId: 'cl1', staffId: 'sara', state: 'bac', arrivedMin: 40,
      lines: [['couleur', 'racines', [], 'yasmine', { base: '7.3', tone: 'doré', ox: 6, pose: 35, brand: 'Inoa' }], ['brushing', 'mi', [], 'sara']] }),
    mkPass({ id: 1043, custId: 'cl4', staffId: 'karim', state: 'attente', arrivedMin: 14,
      lines: [['coupe_h', null, [], 'karim'], ['barbe', null, [], 'karim']] }),
    mkPass({ id: 1044, guest: { name: 'Walk-in · Anas', phone: '' }, staffId: 'karim', state: 'attente', arrivedMin: 6,
      lines: [['coupe_h', null, [], 'karim']] }),
  ];

  /* rendez-vous de l'après-midi (timeline par coiffeur·se) — heures fixes
     ancrées sur l'horloge du salon pour rester crédibles toute la démo. */
  const dayBase = new Date(NOW); dayBase.setHours(9, 0, 0, 0);
  const at = (h, m) => { const d = new Date(dayBase); d.setHours(h, m, 0, 0); return d; };
  const RDV = pvReal() ? [] : [
    { staffId: 'yasmine', time: at(14, 0),  custId: 'cl3', svc: 'Couleur + Coupe', dur: 130, state: 'cours' },
    { staffId: 'yasmine', time: at(16, 30), custId: 'cl5', svc: 'Coupe femme + Brushing', dur: 70, state: 'attente' },
    { staffId: 'yasmine', time: at(18, 0),  custId: 'cl6', svc: 'Chignon essai mariage', dur: 60, state: 'attente' },
    { staffId: 'karim',   time: at(15, 0),  custId: 'cl4', svc: 'Coupe + Barbe', dur: 45, state: 'attente' },
    { staffId: 'karim',   time: at(17, 0),  custId: 'cl7', svc: 'Coupe homme', dur: 30, state: 'attente' },
    { staffId: 'sara',    time: at(14, 30), custId: 'cl1', svc: 'Couleur racines + Brushing', dur: 90, state: 'bac' },
    { staffId: 'sara',    time: at(16, 0),  custId: 'cl2', svc: 'Balayage demi-tête', dur: 120, state: 'attente' },
  ];

  /* journée déjà encaissée (services terminés ce matin) — fin de journée */
  function mkDone(custId, staffId, itemId, variantId, addons, tip) {
    const item = ITEMS[itemId];
    const sub = priceOf(item, variantId) + (addons || []).reduce((s, a) => s + ADDON[a].price, 0);
    return { custId, staffId, label: item.label, amt: sub, tip: tip || 0 };
  }
  const DONE_TODAY = pvReal() ? [] : [
    mkDone('cl4', 'karim', 'coupe_h', null, [], 10),
    mkDone('cl7', 'karim', 'coupe_h', null, [], 0),
    mkDone('cl7', 'karim', 'barbe', null, [], 5),
    mkDone(null, 'karim', 'coupe_h', null, [], 0),
    mkDone('cl5', 'yasmine', 'coupe_f', null, [], 20),
    mkDone('cl5', 'yasmine', 'brushing', 'mi', [], 0),
    mkDone('cl3', 'yasmine', 'couleur', 'racines', ['masque'], 30),
    mkDone('cl8', 'sara', 'brushing', 'long', [], 15),
    mkDone('cl6', 'sara', 'soin', null, ['olaplex'], 0),
    mkDone(null, 'sara', 'brushing', 'court', [], 0),
  ];

  /* ───────────────────────── state ───────────────────────── */
  const state = {
    view: 'file',
    cat: 'tous',
    ticket: null,            /* { num, custId|guest, lines:[] } */
    activePass: null,        /* highlighted walk-in id */
    clQuery: '', clTarget: 'ticket', // where a picked client lands
    offline: false, queued: 0,
  };
  function passCustName(p) {
    if (p.custId) return CUST[p.custId].name;
    return (p.guest && p.guest.name) || 'Client de passage';
  }
  function freshTicket() {
    passSeq++;
    state.ticket = { num: posRef(`S-${passSeq}`), customer: null, lines: [] };
  }
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, mis en file hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le salon encaissait dans DONE_TODAY / TIP_LEDGER et rien d'autre : la
     patronne voyait 0 MAD et un refresh effaçait la recette. Démo : no-op. */
  /* Deux caisses du même commerce partaient du même compteur local et
     imprimaient toutes les deux le même numéro le même jour. L'étiquette de
     terminal (KiwiPosSale.stamp) les sépare : T-642-A7 vs T-642-K3. En démo,
     pas d'étiquette — les captures et la démonstration restent lisibles. */
  function posRef(n) {
    try { return (window.KiwiPosSale && window.KiwiPosSale.isReal()) ? window.KiwiPosSale.stamp(n) : n; }
    catch (_) { return n; }
  }
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('coiffure', { total, method, label, ref });
    } catch (_) {}
  }

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  function mount(rootEl) {
    root = rootEl;
    freshTicket();
    root.innerHTML = `
      <aside class="cf-rail">
        <div class="cf-brand">kiwi<i></i></div>
        <div class="cf-venue">
          <div class="cf-venue-name">${pvName('Salon Yasmine') || 'Salon'}</div>
          <div class="cf-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Iberia'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="cf-nav" id="cf-nav">
          <button class="cf-nav-it on" data-cf-view="file"><i data-lucide="users"></i><span>File &amp; RDV</span><b class="cf-nav-badge" id="cf-badge-file"></b></button>
          <button class="cf-nav-it" data-cf-view="presta"><i data-lucide="scissors"></i><span>Prestations</span><b class="cf-nav-badge" id="cf-badge-tk"></b></button>
          <button class="cf-nav-it" data-cf-view="fiches"><i data-lucide="user-check"></i><span>Fiches clientes</span><b class="cf-nav-badge" id="cf-badge-cl"></b></button>
          <button class="cf-nav-it" data-cf-view="journee"><i data-lucide="layout-dashboard"></i><span>Fin de journée</span></button>
        </nav>
        <div class="cf-rail-foot">
          <button class="cf-net" id="cf-net" title="Simuler une coupure réseau">
            <i class="cf-net-dot"></i><span class="cf-net-label">En ligne</span>
          </button>
          <button class="cf-lock" id="cf-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="cf-main">
        <div class="cf-offline-note" id="cf-offline-note" hidden>
          Hors-ligne, la caisse continue sur la tablette, tout se synchronise au retour du réseau.
          <b id="cf-queue-count"></b>
        </div>

        <section class="cf-view is-on" data-cf-panel="file">
          <header class="cf-head">
            <div><h1>File &amp; rendez-vous</h1><div class="cf-head-sub" id="cf-file-sub"></div></div>
            <div class="cf-head-right">
              <span class="cf-chip" id="cf-file-clock"><i data-lucide="clock"></i><b id="cf-clock-val"></b></span>
              <span class="cf-head-hint">Touchez un client pour faire avancer son passage</span>
            </div>
          </header>
          <div class="cf-file">
            <div class="cf-file-queue">
              <div class="cf-fq-head"><i data-lucide="users"></i>File d'attente <span class="ct" id="cf-fq-ct"></span><span class="eta" id="cf-fq-eta"></span></div>
              <div class="cf-fq-list" id="cf-fq-list"></div>
            </div>
            <div class="cf-rdv" id="cf-rdv"></div>
          </div>
        </section>

        <section class="cf-view" data-cf-panel="presta">
          <header class="cf-head">
            <div><h1>Prestations</h1><div class="cf-head-sub">Touchez une prestation, elle s'attribue à un·e coiffeur·se sur le passage.</div></div>
            <div class="cf-head-right"><span class="cf-head-hint">Un passage = un ou plusieurs services</span></div>
          </header>
          <div class="cf-cats" id="cf-cats"></div>
          <div class="cf-presta-body">
            <div class="cf-grid-scroll" id="cf-gridwrap"></div>
            <aside class="cf-ticket" id="cf-ticket"></aside>
          </div>
        </section>

        <section class="cf-view" data-cf-panel="fiches">
          <header class="cf-head">
            <div><h1>Fiches clientes</h1><div class="cf-head-sub">Chaque fiche se souvient de la formule couleur, un tap la pré-remplit.</div></div>
            <div class="cf-head-right"><button class="cf-chip" id="cf-fiches-search"><i data-lucide="search"></i>Chercher</button></div>
          </header>
          <div class="cf-day"><div class="cf-day-inner" id="cf-fiches-body"></div></div>
        </section>

        <section class="cf-view" data-cf-panel="journee">
          <header class="cf-head">
            <div><h1>Fin de journée</h1><div class="cf-head-sub" id="cf-journee-sub"></div></div>
            <div class="cf-head-right"><span class="cf-head-hint">Commission 40 % par coiffeur·se, déjà calculée.</span></div>
          </header>
          <div class="cf-day" id="cf-journee-body"></div>
        </section>
      </main>

      <div class="modal-veil" id="cf-sheet-veil"><div class="modal cf-sheet cf-rel" id="cf-sheetm"></div></div>
      <div class="modal-veil" id="cf-client-veil"><div class="modal cf-client cf-rel" id="cf-clientm"></div></div>
      <div class="modal-veil" id="cf-fiche-veil"><div class="modal cf-fiche cf-rel" id="cf-fichem"></div></div>
      <div class="modal-veil" id="cf-photo-veil"><div class="modal cf-photo" id="cf-photom"></div></div>
      <div class="modal-veil" id="cf-pay-veil"><div class="modal cf-pay cf-rel" id="cf-paym"></div></div>`;

    /* static bindings (delegation on persistent containers) */
    $('#cf-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-cf-view]');
      if (b) switchView(b.dataset.cfView);
    });
    $('#cf-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#cf-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });
    $('#cf-fiches-search', root).addEventListener('click', () => openClient('browse'));

    renderAll();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.cf-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.cfView === view));
    $$('.cf-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.cfPanel === view));
    if (view === 'file') renderFile();
    if (view === 'presta') { renderCats(); renderGrid(); renderTicket(); }
    if (view === 'fiches') renderFiches();
    if (view === 'journee') renderJournee();
    icons();
  }

  function renderBadges() {
    const waiting = PASSAGES.filter((p) => p.state !== 'fini').length;
    const tkCount = state.ticket.lines.length;
    const fichesWithFormula = CUSTOMERS.filter((c) => c.formula).length;
    setBadge('cf-badge-file', waiting);
    setBadge('cf-badge-tk', tkCount);
    setBadge('cf-badge-cl', fichesWithFormula);
  }
  function setBadge(id, n) {
    const el = $('#' + id, root);
    if (!el) return;
    el.textContent = n || '';
    el.style.display = n ? '' : 'none';
  }

  function renderAll() {
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ FILE & RDV ═══════════════════════ */
  function waitFor(idx) { return idx * WAIT_PER; }

  function renderFile() {
    $('#cf-clock-val', root).textContent = fmtTime(new Date());
    $('#cf-file-sub', root).textContent = `${fmtDay(new Date())} · le salon tourne, 2 fauteuils occupés, ${PASSAGES.filter((p) => p.state === 'attente').length} en attente`;
    renderQueue();
    renderRdv();
    icons();
  }

  function renderQueue() {
    const list = PASSAGES.filter((p) => p.state !== 'fini');
    const waiting = list.filter((p) => p.state === 'attente');
    $('#cf-fq-ct', root).textContent = list.length;
    const lastWait = waiting.length ? waitFor(waiting.length) : 0;
    $('#cf-fq-eta', root).textContent = waiting.length ? `~${lastWait} min d'attente` : 'aucune attente';
    let waitIdx = 0;
    $('#cf-fq-list', root).innerHTML = list.length ? list.map((p) => {
      const isWaiting = p.state === 'attente';
      const eta = isWaiting ? waitFor(waitIdx++) : 0;
      const svc = p.lines.map((l) => ITEMS[l.itemId].label).join(' + ') || 'à composer';
      const st = STATES[p.state];
      return `<button class="cf-walkin ${state.activePass === p.id ? 'is-active' : ''}" data-cf-pass="${p.id}">
        <div class="cf-walkin-top">
          <span class="cf-walkin-pos">${isWaiting ? (waitIdx) : (p.state === 'bac' ? '<i data-lucide="droplets" style="width:13px;height:13px"></i>' : '<i data-lucide="scissors" style="width:13px;height:13px"></i>')}</span>
          <span class="cf-walkin-who">
            <span class="cf-walkin-name">${esc(passCustName(p))}</span>
            <span class="cf-walkin-svc">${esc(svc)}</span>
          </span>
          ${isWaiting ? `<span class="cf-walkin-wait"><b>${eta === 0 ? 'à suivre' : '~' + eta}</b><span>${eta === 0 ? 'prochain' : 'min'}</span></span>` : ''}
        </div>
        <div class="cf-walkin-foot">
          <span class="cf-state ${p.state}"><i data-lucide="${st.icon}"></i>${st.label}</span>
          ${p.staffId ? `<span class="cf-staff-tag">${ava(p.staffId)}${esc(SF[p.staffId].name)}</span>` : ''}
        </div>
      </button>`;
    }).join('') : `<div class="cf-fq-empty">File vide.<br>Ajoutez un walk-in ou attendez le prochain rendez-vous.</div>`;
    $('#cf-fq-list', root).insertAdjacentHTML('beforeend',
      `<button class="cf-fq-add" id="cf-fq-add"><i data-lucide="user-plus"></i>Nouveau walk-in</button>`);

    $('#cf-fq-list', root).onclick = (e) => {
      if (e.target.closest('#cf-fq-add')) { startWalkin(); return; }
      const b = e.target.closest('[data-cf-pass]');
      if (b) advancePass(+b.dataset.cfPass);
    };
  }

  function advancePass(passId) {
    const p = PASSAGES.find((x) => x.id === passId);
    if (!p) return;
    const i = STATE_FLOW.indexOf(p.state);
    if (p.state === 'cours') {
      /* terminé — on encaisse */
      state.activePass = p.id;
      openPay(p);
      return;
    }
    p.state = STATE_FLOW[Math.min(i + 1, STATE_FLOW.length - 1)];
    state.activePass = p.id;
    queueIfOffline('Avancement passage');
    const verb = p.state === 'bac' ? 'passe au bac' : p.state === 'cours' ? 'est dans le fauteuil' : 'avancé';
    toast(`${passCustName(p)} ${verb}`);
    renderQueue(); renderRdv(); renderBadges(); icons();
  }

  function startWalkin() {
    /* nouveau walk-in : on l'envoie composer son passage en prestations */
    state.clTarget = 'ticket';
    freshTicket();
    switchView('presta');
    openClient('walkin');
  }

  function renderRdv() {
    const now = new Date();
    $('#cf-rdv', root).innerHTML = `
      <div class="cf-rdv-cols">
        ${STAFF.map((s) => {
          const slots = RDV.filter((r) => r.staffId === s.id).sort((a, b) => a.time - b.time);
          const hasNow = slots.some((r) => r.state === 'cours' || r.state === 'bac');
          return `<div class="cf-rdv-col">
            <div class="cf-rdv-staff">
              <span class="cf-rdv-ava" style="background:${s.color}">${esc(s.short[0])}</span>
              <span class="cf-rdv-staff-mid">
                <span class="cf-rdv-staff-name">${esc(s.name)}</span>
                <span class="cf-rdv-staff-sub">${slots.length} RDV</span>
              </span>
              ${hasNow ? '<span class="cf-rdv-now">en poste</span>' : ''}
            </div>
            <div class="cf-rdv-slots">
              ${slots.map((r) => {
                const cli = r.custId ? CUST[r.custId].name : 'Client';
                const active = r.state === 'cours' || r.state === 'bac';
                const past = r.time < now && r.state === 'attente';
                const cls = active ? 'now' : (r.state === 'fini' ? 'done' : '');
                const stLabel = active ? (r.state === 'bac' ? 'au bac' : 'en cours') : (past ? 'à confirmer' : 'à venir');
                return `<button class="cf-rdv-slot ${cls}" data-cf-rdv-cli="${r.custId || ''}">
                  <span class="cf-rdv-time">${fmtTime(r.time)}</span>
                  <span class="cf-rdv-mid">
                    <span class="cf-rdv-cli">${esc(cli)}</span>
                    <span class="cf-rdv-det">${esc(r.svc)} · ${esc(stLabel)}</span>
                  </span>
                  <span class="cf-rdv-dur">${r.dur} min</span>
                </button>`;
              }).join('')}
              <button class="cf-rdv-slot free" data-cf-rdv-add="${s.id}">
                <span class="cf-rdv-time"><i data-lucide="plus" style="width:14px;height:14px"></i></span>
                <span class="cf-rdv-mid"><span class="cf-rdv-cli">Ajouter un rendez-vous</span><span class="cf-rdv-det">créneau libre</span></span>
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    $('#cf-rdv', root).onclick = (e) => {
      const add = e.target.closest('[data-cf-rdv-add]');
      if (add) { toast(`Créneau ouvert chez ${SF[add.dataset.cfRdvAdd].name}, proposez-le à la cliente`); return; }
      const cli = e.target.closest('[data-cf-rdv-cli]');
      if (cli && cli.dataset.cfRdvCli) openFiche(cli.dataset.cfRdvCli);
    };
    icons();
  }

  /* ═══════════════════════ PRESTATIONS (grid + catégories) ═══════════════════════ */
  function renderCats() {
    const counts = Object.fromEntries(CATALOG.map((c) => [c.id, c.items.length]));
    const all = CATALOG.reduce((s, c) => s + c.items.length, 0);
    $('#cf-cats', root).innerHTML =
      `<button class="cf-cat ${state.cat === 'tous' ? 'on' : ''}" data-cf-cat="tous">Toutes <span class="cf-cat-ct">${all}</span></button>` +
      CATALOG.map((c) =>
        `<button class="cf-cat ${state.cat === c.id ? 'on' : ''}" data-cf-cat="${c.id}">${esc(c.label)} <span class="cf-cat-ct">${counts[c.id]}</span></button>`
      ).join('');
    $('#cf-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-cf-cat]');
      if (!b) return;
      state.cat = b.dataset.cfCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function renderGrid() {
    const cats = state.cat === 'tous' ? CATALOG : CATALOG.filter((c) => c.id === state.cat);
    let i = 0;
    $('#cf-gridwrap', root).innerHTML = cats.map((c) => `
      <div class="cf-cat-head">${esc(c.label)}</div>
      <div class="cf-grid">${c.items.map((it) => `
        <button class="cf-card" data-cf-item="${it.id}" style="--i:${i++}">
          <span class="cf-card-art">${ART[it.id] || ART.coupe_f}</span>
          <span class="cf-card-name">${esc(it.label)}</span>
          <span class="cf-card-price">${it.variants ? 'dès ' : ''}${minPrice(it)} MAD</span>
          ${it.flag ? `<span class="cf-card-flag">${esc(it.flag)}</span>` : ''}
        </button>`).join('')}
      </div>`).join('');
    $('#cf-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-cf-item]');
      if (b) openSheet(b.dataset.cfItem);
    };
  }

  /* ═══════════════════════ TICKET (le passage) ═══════════════════════ */
  function lineUnit(ln) {
    const item = ITEMS[ln.itemId];
    return priceOf(item, ln.variantId) + (ln.addons || []).reduce((s, a) => s + ADDON[a].price, 0);
  }
  function ticketTotal(t) { return t.lines.reduce((s, ln) => s + lineUnit(ln), 0); }
  function ticketDur(t) { return t.lines.reduce((s, ln) => s + durOf(ITEMS[ln.itemId], ln.variantId), 0); }

  function customerRow(t) {
    if (!t.customer) {
      return `<button class="cf-tk-row" id="cf-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une fiche</b><span>Téléphone, la formule couleur suit la cliente</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.customer.type === 'guest') {
      return `<button class="cf-tk-row is-set" id="cf-tk-client"><i data-lucide="user"></i>
        <span class="l"><b>Client de passage</b><span>Sans fiche, pas de mémoire couleur</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = CUST[t.customer.id];
    const sub = c.formula ? `Formule : ${fmtFormula(c.formula)}` : `${c.visits} visites · ${fmtDay(c.last)}`;
    return `<button class="cf-tk-row is-set" id="cf-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${esc(sub)}</span></span>
      <span class="edit">Changer</span></button>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const total = ticketTotal(t);
    const dur = ticketDur(t);
    const el = $('#cf-ticket', root);
    el.innerHTML = `
      <div class="cf-tk-head">
        <div><span class="cf-tk-title">Passage</span> <span class="cf-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="cf-tk-reset" id="cf-tk-reset">Vider</button>` : ''}
      </div>
      <div class="cf-tk-meta">${customerRow(t)}</div>
      <div class="cf-tk-lines" id="cf-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="cf-tk-empty">
            <i data-lucide="scissors"></i>
            <div>Le passage est vide.<br>Touchez une prestation dans la grille, vous l'attribuez à un·e coiffeur·se.</div>
          </div>`}
      </div>
      <div class="cf-tk-foot">
        <div class="cf-tk-tot">
          <span class="dur"><i data-lucide="clock"></i> ${dur} min estimées</span>
          <span>${t.lines.length} prestation${t.lines.length > 1 ? 's' : ''}</span>
        </div>
        <div class="cf-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="cf-validate" id="cf-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="check-check"></i> Mettre en file · le passage commence
        </button>
      </div>`;
    const reset = $('#cf-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); renderBadges(); icons(); };
    $('#cf-tk-client', el).onclick = () => { state.clTarget = 'ticket'; openClient('search'); };
    $('#cf-validate', el).onclick = validateTicket;
    $('#cf-tk-lines', el).onclick = (e) => {
      const rm = e.target.closest('[data-cf-rm]');
      if (rm) {
        t.lines.splice(+rm.dataset.cfRm, 1);
        renderTicket(); renderBadges(); icons();
        return;
      }
      const edit = e.target.closest('[data-cf-edit]');
      if (edit) openSheet(t.lines[+edit.dataset.cfEdit].itemId, +edit.dataset.cfEdit);
    };
    icons();
  }

  function lineRow(ln, i) {
    const item = ITEMS[ln.itemId];
    const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]) : null;
    const s = ln.staffId ? SF[ln.staffId] : null;
    const addons = (ln.addons || []).map((a) => ADDON[a].label).join(', ');
    return `<div class="cf-line">
      <button class="cf-line-art" data-cf-edit="${i}" title="Modifier">${ART[ln.itemId] || ART.coupe_f}</button>
      <span class="cf-line-mid">
        <span class="cf-line-name">${esc(item.label)}${variant ? ` · ${esc(variant.label)}` : ''}</span>
        <span class="cf-line-sub">
          ${s ? `<span class="by">${ava(s.id)}${esc(s.name)}</span>` : '<span style="color:var(--danger-mute)">à attribuer</span>'}
          <span class="dur">${durOf(item, ln.variantId)} min</span>
          ${ln.formula ? `<span class="formula"><i data-lucide="sparkles"></i>formule</span>` : ''}
          ${addons ? `<span>+ ${esc(addons)}</span>` : ''}
        </span>
      </span>
      <span class="cf-line-right">
        <span class="cf-line-price">${fmtMAD(lineUnit(ln))}</span>
        <button class="cf-line-rm" data-cf-rm="${i}" aria-label="Retirer"><i data-lucide="x"></i></button>
      </span>
    </div>`;
  }

  /* ═══════════════════════ PRESTATION SHEET ═══════════════════════ */
  const sheet = { itemId: null, variantId: null, addons: [], staffId: null, formula: null, note: '', editIdx: null };

  function defaultStaffFor(item) {
    if (item.cat === 'couleur') return 'yasmine';
    if (item.id === 'coupe_h' || item.id === 'barbe') return 'karim';
    return 'yasmine';
  }

  function openSheet(itemId, editIdx) {
    const item = ITEMS[itemId];
    const editing = editIdx != null;
    if (editing) {
      const ln = state.ticket.lines[editIdx];
      Object.assign(sheet, { itemId, variantId: ln.variantId, addons: ln.addons.slice(), staffId: ln.staffId, formula: ln.formula, note: ln.note || '', editIdx });
    } else {
      Object.assign(sheet, {
        itemId, variantId: item.variants ? item.variants[0].id : null,
        addons: [], staffId: defaultStaffFor(item), formula: null, note: '', editIdx: null,
      });
      /* pré-remplissage formule depuis la fiche cliente attachée */
      if (item.formula && item.id === 'couleur') {
        const c = state.ticket.customer && state.ticket.customer.type === 'known' ? CUST[state.ticket.customer.id] : null;
        if (c && c.formula) sheet.formula = Object.assign({}, c.formula);
      }
    }
    renderSheet();
    openVeil('#cf-sheet-veil');
    icons();
    rescanLens();
  }

  function sheetUnit() {
    return priceOf(ITEMS[sheet.itemId], sheet.variantId) + sheet.addons.reduce((s, a) => s + ADDON[a].price, 0);
  }

  function renderSheet() {
    const item = ITEMS[sheet.itemId];
    const unit = sheetUnit();
    const dur = durOf(item, sheet.variantId);
    const attachedCust = state.ticket.customer && state.ticket.customer.type === 'known' ? CUST[state.ticket.customer.id] : null;
    const canRecall = item.formula && item.id === 'couleur' && attachedCust && attachedCust.formula;
    const el = $('#cf-sheetm', root);
    el.innerHTML = `
      <button class="cf-modal-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="cf-sheet-head">
        <span class="cf-sheet-art">${ART[item.id] || ART.coupe_f}</span>
        <span class="cf-sheet-title"><h3>${esc(item.label)}</h3><span class="sub">${esc(CATALOG.find((c) => c.id === item.cat).label)} · ${dur} min</span></span>
        <span class="cf-sheet-price"><span class="val" id="cf-sheet-total">${fmtMAD(unit)}</span><span class="per">prestation</span></span>
      </div>

      ${canRecall ? `<button class="cf-formula-recall" id="cf-recall">
        <span class="ic"><i data-lucide="sparkles"></i></span>
        <span class="l"><b>Reprendre la formule de ${esc(attachedCust.name.split(' ')[0])}</b><span>${esc(fmtFormula(attachedCust.formula))}</span></span>
        <span class="go">Reprendre</span>
      </button>` : ''}

      <div class="cf-f">
        <div class="cf-f-lbl">Coiffeur·se</div>
        <div class="cf-staff-seg" data-lens-demo id="cf-staff-seg">
          ${STAFF.map((s) => `<button class="cf-staff-it ${sheet.staffId === s.id ? 'on' : ''}" data-lens-item data-cf-staff="${s.id}">${ava(s.id)}${esc(s.name)}</button>`).join('')}
        </div>
      </div>

      ${item.variants ? `<div class="cf-f">
        <div class="cf-f-lbl">${item.cat === 'couleur' ? 'Étendue' : 'Longueur'}</div>
        <div class="cf-seg-blk" data-lens-demo id="cf-var-seg">
          ${item.variants.map((v) => `<button class="cf-seg-blk-it ${v.id === sheet.variantId ? 'on' : ''}" data-lens-item data-cf-var="${v.id}">${esc(v.label)}<small>${v.price} MAD · ${v.dur} min</small></button>`).join('')}
        </div>
      </div>` : ''}

      ${item.formula ? renderFormulaBlock() : ''}

      <div class="cf-f">
        <div class="cf-f-lbl">Compléments <span class="opt">· optionnel</span></div>
        <div class="cf-chips" id="cf-addons">
          ${ADDONS.map((a) => `<button class="cf-chip-opt ${sheet.addons.includes(a.id) ? 'on' : ''}" data-cf-addon="${a.id}">${esc(a.label)} <small>+${a.price}</small></button>`).join('')}
        </div>
      </div>

      <div class="cf-f">
        <div class="cf-f-lbl">Note <span class="opt">· optionnel</span></div>
        <input class="cf-note-free" id="cf-note" placeholder="Ex. « éviter le contour du visage », « volume racines »…" value="${esc(sheet.note)}" />
      </div>

      <div class="cf-sheet-foot">
        <button class="cf-btn secondary" data-cf-close>Annuler</button>
        <button class="cf-btn primary" id="cf-sheet-add"><i data-lucide="${sheet.editIdx != null ? 'check' : 'plus'}"></i>${sheet.editIdx != null ? 'Enregistrer' : 'Ajouter au passage'} · <span id="cf-sheet-cta">${fmtMAD(unit)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#cf-sheet-total', el).textContent = fmtMAD(u);
      $('#cf-sheet-cta', el).textContent = fmtMAD(u);
      $('.cf-sheet-head .sub', el).textContent = `${CATALOG.find((c) => c.id === item.cat).label} · ${durOf(item, sheet.variantId)} min`;
    };

    $('#cf-staff-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-cf-staff]');
      if (!b) return;
      sheet.staffId = b.dataset.cfStaff;
      $$('[data-cf-staff]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    const varSeg = $('#cf-var-seg', el);
    if (varSeg) varSeg.onclick = (e) => {
      const b = e.target.closest('[data-cf-var]');
      if (!b) return;
      sheet.variantId = b.dataset.cfVar;
      $$('[data-cf-var]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    $('#cf-addons', el).onclick = (e) => {
      const b = e.target.closest('[data-cf-addon]');
      if (!b) return;
      const id = b.dataset.cfAddon;
      const i = sheet.addons.indexOf(id);
      if (i >= 0) sheet.addons.splice(i, 1); else sheet.addons.push(id);
      b.classList.toggle('on', i < 0);
      refreshPrice();
    };
    $('#cf-note', el).oninput = (e) => { sheet.note = e.target.value; };
    const recall = $('#cf-recall', el);
    if (recall) recall.onclick = () => {
      sheet.formula = Object.assign({}, attachedCust.formula);
      renderSheet(); icons(); rescanLens();
      toast(`Formule de ${attachedCust.name.split(' ')[0]} reprise, ${fmtFormula(attachedCust.formula)}`);
    };
    bindFormulaBlock(el);
    $('#cf-sheet-add', el).onclick = addSheetToTicket;
    $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-sheet-veil'); });
  }

  /* la formule couleur — édition fine de la recette */
  function renderFormulaBlock() {
    const f = sheet.formula || { base: '', tone: '', ox: 6, pose: 35, brand: '', notes: '' };
    const oxes = [6, 9, 12];
    return `<div class="cf-f">
      <div class="cf-f-lbl"><i data-lucide="sparkles" style="width:11px;height:11px;color:var(--forest)"></i> Formule couleur ${sheet.formula ? '<span class="opt">· mémorisée pour la prochaine fois</span>' : '<span class="opt">· optionnel</span>'}</div>
      <div class="cf-row-2">
        <div class="cf-f" style="margin:0;">
          <input class="cf-in" id="cf-f-base" placeholder="Base / nuance, ex. 7.3" value="${esc(f.base + (f.tone ? ' ' + f.tone : ''))}" />
        </div>
        <div class="cf-f" style="margin:0;flex:0 0 130px;">
          <input class="cf-in" id="cf-f-brand" placeholder="Marque" value="${esc(f.brand || '')}" />
        </div>
      </div>
      <div class="cf-row-2" style="margin-top:9px;">
        <div class="cf-f" style="margin:0;flex:1;">
          <div class="cf-seg-blk" id="cf-f-ox">
            ${oxes.map((o) => `<button class="cf-seg-blk-it ${(+f.ox === o) ? 'on' : ''}" data-cf-ox="${o}">${o} %<small>oxydant</small></button>`).join('')}
          </div>
        </div>
        <div class="cf-f" style="margin:0;flex:0 0 150px;">
          <div class="cf-tip-stepper" style="background:var(--paper-mute);border-radius:13px;padding:5px;justify-content:space-between;">
            <button id="cf-pose-minus" aria-label="Moins"><i data-lucide="minus"></i></button>
            <b id="cf-pose-val">${f.pose} min</b>
            <button id="cf-pose-plus" aria-label="Plus"><i data-lucide="plus"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function bindFormulaBlock(el) {
    const oxSeg = $('#cf-f-ox', el);
    if (!oxSeg) return;
    const ensure = () => { if (!sheet.formula) sheet.formula = { base: '', tone: '', ox: 6, pose: 35, brand: '', notes: '' }; return sheet.formula; };
    const baseIn = $('#cf-f-base', el);
    const brandIn = $('#cf-f-brand', el);
    const poseVal = $('#cf-pose-val', el);
    baseIn.oninput = (e) => {
      const f = ensure();
      const parts = e.target.value.trim().split(/\s+/);
      f.base = parts[0] || '';
      f.tone = parts.slice(1).join(' ');
    };
    brandIn.oninput = (e) => { ensure().brand = e.target.value; };
    oxSeg.onclick = (e) => {
      const b = e.target.closest('[data-cf-ox]');
      if (!b) return;
      ensure().ox = +b.dataset.cfOx;
      $$('[data-cf-ox]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#cf-pose-minus', el).onclick = () => { const f = ensure(); f.pose = Math.max(5, f.pose - 5); poseVal.textContent = `${f.pose} min`; };
    $('#cf-pose-plus', el).onclick = () => { const f = ensure(); f.pose = Math.min(120, f.pose + 5); poseVal.textContent = `${f.pose} min`; };
  }

  function addSheetToTicket() {
    if (!sheet.staffId) { toast('Choisissez le·la coiffeur·se de cette prestation'); return; }
    /* une formule vide (aucune saisie) ne compte pas */
    let formula = sheet.formula;
    if (formula && !formula.base) formula = null;
    const line = {
      itemId: sheet.itemId, variantId: sheet.variantId, addons: sheet.addons.slice(),
      staffId: sheet.staffId, formula: formula ? Object.assign({}, formula) : null, note: sheet.note.trim(),
    };
    const item = ITEMS[sheet.itemId];
    if (sheet.editIdx != null) {
      state.ticket.lines[sheet.editIdx] = line;
      toast(`${item.label}, mis à jour`);
    } else {
      state.ticket.lines.push(line);
      toast(`${item.label} · ${SF[sheet.staffId].name}, sur le passage`);
    }
    closeVeil('#cf-sheet-veil');
    renderTicket(); renderBadges(); icons();
  }

  /* ═══════════════════════ VALIDATE — mise en file ═══════════════════════ */
  function validateTicket() {
    const t = state.ticket;
    if (!t.lines.length) return;
    const unattributed = t.lines.some((l) => !l.staffId);
    if (unattributed) { toast('Chaque prestation doit être attribuée à un·e coiffeur·se'); return; }
    if (!t.customer) { state.clTarget = 'ticket'; openClient('search'); toast('Attachez la cliente, ou « passage »'); return; }
    /* monter le passage dans la file (en attente). L'id reste numérique —
       advancePass et le markup data-cf-pass le lisent en nombre. */
    const newId = Math.max(...PASSAGES.map((x) => x.id), 1044) + 1;
    const p = {
      id: newId,
      custId: t.customer.type === 'known' ? t.customer.id : null,
      guest: t.customer.type === 'guest' ? { name: 'Client de passage', phone: '' } : null,
      staffId: t.lines[0].staffId,
      lines: t.lines.map((l) => ({ ...l, addons: l.addons.slice() })),
      state: 'attente', arrivedAt: new Date(),
      tip: 0, tipSplit: {}, paid: false, payMethod: null,
    };
    PASSAGES.push(p);
    state.activePass = p.id;
    queueIfOffline(`Passage de ${passCustName(p)}`);
    toast(`${passCustName(p)} en file, ${ticketDur(t)} min, ${fmtMAD(ticketTotal(t))}`);
    freshTicket();
    renderTicket(); renderBadges();
    switchView('file');
  }

  /* ═══════════════════════ FICHE CLIENTE — phone-first ═══════════════════════ */
  function openClient(mode) {
    /* mode: 'search' (attach to ticket) | 'walkin' (attach + stay in presta) | 'browse' (open fiche) */
    const el = $('#cf-clientm', root);
    let view = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      const title = mode === 'browse' ? 'Fiches clientes' : mode === 'walkin' ? 'Walk-in, qui est-ce ?' : 'Attacher une fiche';
      el.innerHTML = `
        <button class="cf-modal-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${title}</h3>
        <p class="modal-subtle">On cherche par téléphone, la formule couleur et l'historique suivent la cliente.</p>
        <div class="cf-phone-in"><i data-lucide="phone"></i>
          <input id="cf-cl-q" inputmode="tel" placeholder="06… ou nom de la cliente" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${view === 'search' ? `
          <div class="cf-cl-results" id="cf-cl-results">
            ${hits.map((c) => `
              <button class="cf-cl-row" data-cf-cl="${c.id}">
                <span class="cf-cl-ava">${esc(initials(c.name))}</span>
                <span class="cf-cl-mid">
                  <span class="cf-cl-name">${esc(c.name)} ${c.formula ? '<span class="cf-cl-badge">formule</span>' : ''}</span>
                  <span class="cf-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="cf-cl-right"><b>${c.visits} visites</b>${esc(fmtDay(c.last))}</span>
              </button>`).join('') || `<div class="cf-fq-empty">Aucune fiche pour « ${esc(q)} »</div>`}
          </div>
          <button class="cf-cl-new" id="cf-cl-new"><i data-lucide="user-plus"></i>Nouvelle fiche${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          ${mode !== 'browse' ? `<div class="cf-sheet-foot" style="margin-top:10px;">
            <button class="cf-btn ghost" id="cf-cl-guest">Client de passage, sans fiche</button>
          </div>` : ''}` : `
          <div class="cf-cl-form">
            <input class="cf-in" id="cf-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="cf-in" id="cf-cl-tel" inputmode="tel" placeholder="Téléphone (optionnel)" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <div class="cf-sheet-foot" style="margin-top:4px;">
              <button class="cf-btn secondary" id="cf-cl-back">Retour</button>
              <button class="cf-btn primary" id="cf-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#cf-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#cf-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-client-veil'); });
      $$('[data-cf-cl]', el).forEach((b) => {
        b.onclick = () => {
          const c = CUST[b.dataset.cfCl];
          if (mode === 'browse') { closeVeil('#cf-client-veil'); openFiche(c.id); return; }
          state.ticket.customer = { type: 'known', id: c.id };
          closeVeil('#cf-client-veil');
          toast(c.formula ? `${c.name}, formule en mémoire : ${fmtFormula(c.formula)}` : `${c.name}, ${c.visits} visites`);
          renderTicket(); renderBadges(); icons();
        };
      });
      const newBtn = $('#cf-cl-new', el);
      if (newBtn) newBtn.onclick = () => { view = 'create'; render(q); icons(); };
      const guest = $('#cf-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.ticket.customer = { type: 'guest' };
        closeVeil('#cf-client-veil');
        renderTicket(); renderBadges(); icons();
      };
      const back = $('#cf-cl-back', el);
      if (back) back.onclick = () => { view = 'search'; render(q); icons(); };
      const create = $('#cf-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#cf-cl-name', el).value.trim();
        const tel = $('#cf-cl-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, visits: 0, last: new Date(), prefs: [], formula: null, hist: [] };
        CUSTOMERS.unshift(c); CUST[id] = c;
        if (mode === 'browse') { closeVeil('#cf-client-veil'); openFiche(id); }
        else {
          state.ticket.customer = { type: 'known', id };
          closeVeil('#cf-client-veil');
          toast(`Fiche créée, ${name}`);
          renderTicket(); renderBadges(); icons();
        }
      };
    };
    render(state.clQuery || '');
    openVeil('#cf-client-veil');
    icons();
    setTimeout(() => { const i = $('#cf-cl-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ FICHE DETAIL — la formule (signature) ═══════════════════════ */
  function openFiche(custId) {
    const c = CUST[custId];
    if (!c) return;
    const el = $('#cf-fichem', root);
    const colorArt = ART.couleur;
    el.innerHTML = `
      <div class="cf-fiche-hero">
        <button class="cf-fiche-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <span class="cf-fiche-photo">${colorArt}<span class="ref">réf. photo</span></span>
        <span class="cf-fiche-who">
          <h3>${esc(c.name)}</h3>
          <div class="cf-fiche-tel">${esc(c.phone || 'sans téléphone')}</div>
          <div class="cf-fiche-stats">
            <span class="cf-fiche-stat"><b>${c.visits}</b><span>visites</span></span>
            <span class="cf-fiche-stat"><b>${esc(fmtDay(c.last))}</b><span>dernière visite</span></span>
            ${c.formula ? `<span class="cf-fiche-stat"><b>${esc(c.formula.base)}</b><span>base couleur</span></span>` : ''}
          </div>
        </span>
      </div>
      <div class="cf-fiche-body">
        ${c.formula ? `
        <div class="cf-formula-card">
          <div class="cf-formula-head"><i data-lucide="sparkles"></i>Formule couleur, ${esc(c.formula.name)}<span class="when">dernière : ${esc(fmtDay(c.last))}</span></div>
          <div class="cf-formula-recipe">
            <span class="mix">${esc(c.formula.base)}${c.formula.tone ? ' ' + esc(c.formula.tone) : ''}</span>
            <span class="ox">+ oxydant ${c.formula.ox} %</span>
            <span class="pose"><i data-lucide="clock"></i>${c.formula.pose} min de pose</span>
          </div>
          <div class="cf-formula-detail">
            ${c.formula.brand ? `<div class="row"><i data-lucide="tag"></i>Marque : <b>${esc(c.formula.brand)}</b></div>` : ''}
            ${c.formula.notes ? `<div class="row"><i data-lucide="sticky-note"></i>${esc(c.formula.notes)}</div>` : ''}
          </div>
          <button class="cf-formula-prefill" id="cf-prefill"><i data-lucide="wand-2"></i>Pré-remplir la couleur du jour</button>
        </div>` : `
        <div class="cf-formula-none"><i data-lucide="sparkles"></i><br>Pas encore de formule mémorisée.<br>Elle se crée à la première couleur, et revient toute seule ensuite.</div>`}

        ${c.prefs && c.prefs.length ? `<div class="cf-fiche-sec">
          <div class="cf-fiche-sec-lbl"><i data-lucide="heart" style="width:11px;height:11px;color:var(--forest)"></i> Préférences</div>
          <div class="cf-pref-chips">${c.prefs.map((p) => `<span class="cf-pref-chip"><i data-lucide="check"></i>${esc(p)}</span>`).join('')}</div>
        </div>` : ''}

        <div class="cf-fiche-sec">
          <div class="cf-fiche-sec-lbl"><i data-lucide="history" style="width:11px;height:11px;color:var(--forest)"></i> Historique</div>
          <div class="cf-hist">
            ${(c.hist || []).map((h) => `<div class="cf-hist-row">
              <span class="cf-hist-date">${esc(fmtDay(h.when))}</span>
              <span class="cf-hist-mid">
                <span class="cf-hist-svc">${esc(h.svc)}</span>
                <span class="cf-hist-by">${ava(h.by)}${esc(SF[h.by].name)}</span>
              </span>
              <span class="cf-hist-amt">${fmtMAD(h.amt)}</span>
            </div>`).join('') || '<div class="cf-fq-empty">Première visite, pas encore d\'historique.</div>'}
          </div>
        </div>
      </div>
      <div class="cf-fiche-foot">
        <button class="cf-btn secondary" id="cf-fiche-photo-btn"><i data-lucide="camera"></i>Photo référence</button>
        <button class="cf-btn primary" id="cf-fiche-new"><i data-lucide="scissors"></i>Nouveau passage</button>
      </div>`;
    openVeil('#cf-fiche-veil');
    icons();
    $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-fiche-veil'); });
    const prefill = $('#cf-prefill', el);
    if (prefill) prefill.onclick = () => {
      closeVeil('#cf-fiche-veil');
      freshTicket();
      state.ticket.customer = { type: 'known', id: c.id };
      switchView('presta');
      renderTicket();
      openSheet('couleur');
      toast(`Couleur pré-remplie pour ${c.name.split(' ')[0]}, ${fmtFormula(c.formula)}`);
    };
    $('#cf-fiche-photo-btn', el).onclick = () => openPhoto(c);
    $('#cf-fiche-new', el).onclick = () => {
      closeVeil('#cf-fiche-veil');
      freshTicket();
      state.ticket.customer = { type: 'known', id: c.id };
      switchView('presta');
      renderTicket();
      toast(`Nouveau passage, ${c.name}`);
    };
  }

  /* photo référence — mock capture */
  function openPhoto(c) {
    const el = $('#cf-photom', root);
    el.innerHTML = `
      <div class="cf-vf">
        <div class="cf-vf-hint">Cadrez la coiffure, la référence reste sur la fiche</div>
        ${ART.coiffage.replace('class="cf-art"', 'class="cf-art art"')}
        <span class="cf-vf-corner tl"></span><span class="cf-vf-corner tr"></span>
        <span class="cf-vf-corner bl"></span><span class="cf-vf-corner br"></span>
        <div class="cf-vf-flash" id="cf-vf-flash"></div>
      </div>
      <div class="cf-vf-foot">
        <button class="cf-shutter" id="cf-shutter" aria-label="Prendre la photo"></button>
        <button class="cf-vf-close" id="cf-vf-close">Fermer</button>
      </div>`;
    openVeil('#cf-photo-veil');
    icons();
    $('#cf-shutter', el).onclick = () => {
      const flash = $('#cf-vf-flash', el);
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      setTimeout(() => {
        closeVeil('#cf-photo-veil');
        toast(`Photo référence enregistrée, fiche ${c.name.split(' ')[0]}`);
      }, 420);
    };
    $('#cf-vf-close', el).onclick = () => closeVeil('#cf-photo-veil');
  }

  /* ═══════════════════════ FICHES (browse view) ═══════════════════════ */
  function renderFiches() {
    const el = $('#cf-fiches-body', root);
    const sorted = CUSTOMERS.slice().sort((a, b) => b.last - a.last);
    el.innerHTML = `
      <div class="cf-day-cards">
        ${sorted.map((c) => `
          <button class="cf-day-card" data-cf-fiche="${c.id}" style="text-align:left;cursor:pointer;">
            <span class="av">${esc(initials(c.name))}</span>
            <span class="who">
              <b>${esc(c.name)}</b>
              <span>${esc(c.phone || 'sans téléphone')}</span>
            </span>
            <span class="cf-day-metrics" style="grid-template-columns:repeat(3,1fr);">
              <span class="cf-day-metric"><span class="m-lbl">Visites</span><span class="m-val">${c.visits}</span></span>
              <span class="cf-day-metric"><span class="m-lbl">Dernière</span><span class="m-val" style="font-size:12px">${esc(fmtDay(c.last))}</span></span>
              <span class="cf-day-metric com"><span class="m-lbl">Formule</span><span class="m-val" style="font-size:12px">${c.formula ? esc(c.formula.base + ' ' + c.formula.tone) : '—'}</span></span>
            </span>
          </button>`).join('')}
      </div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-cf-fiche]');
      if (b) openFiche(b.dataset.cfFiche);
    };
    icons();
  }

  /* ═══════════════════════ ENCAISSEMENT + POURBOIRE ═══════════════════════ */
  function passTotal(p) {
    return p.lines.reduce((s, ln) => s + priceOf(ITEMS[ln.itemId], ln.variantId) + (ln.addons || []).reduce((a, ad) => a + ADDON[ad].price, 0), 0);
  }
  function passStaffSet(p) {
    const ids = [];
    p.lines.forEach((ln) => { if (ln.staffId && !ids.includes(ln.staffId)) ids.push(ln.staffId); });
    if (!ids.length && p.staffId) ids.push(p.staffId);
    return ids;
  }

  function openPay(p) {
    const el = $('#cf-paym', root);
    const total = passTotal(p);
    const staffIds = passStaffSet(p);
    /* tip split state: equal default, adjustable */
    const tip = { total: 0, per: Object.fromEntries(staffIds.map((id) => [id, 0])) };

    const tipTotal = () => staffIds.reduce((s, id) => s + tip.per[id], 0);

    const step1 = () => {
      el.innerHTML = `
        <button class="cf-modal-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Encaissement</h3>
        <p class="modal-subtle">${p.id ? esc(passCustName(p)) : ''} · ${p.lines.length} prestation${p.lines.length > 1 ? 's' : ''}</p>
        <div class="modal-amount size-md" id="cf-pay-amount">${fmtMAD(total)}</div>

        <div class="cf-tip-split" id="cf-tip-split">
          <div class="cf-tip-split-head"><i data-lucide="hand-coins"></i>Pourboire <span class="total" id="cf-tip-total">0 MAD</span></div>
          <div class="cf-tip-split-sub">Réparti entre ${staffIds.length > 1 ? 'les coiffeur·se·s du passage' : 'le·la coiffeur·se'}, chacun·e voit le sien.</div>
          ${staffIds.map((id) => `
            <div class="cf-tip-row">
              <span class="av" style="background:${SF[id].color}">${esc(SF[id].short[0])}</span>
              <span class="nm"><b>${esc(SF[id].name)}</b><span>${esc(SF[id].role.split('·')[0].trim())}</span></span>
              <span class="cf-tip-stepper">
                <button data-cf-tip-minus="${id}" aria-label="Moins"><i data-lucide="minus"></i></button>
                <b data-cf-tip-val="${id}">0 MAD</b>
                <button data-cf-tip-plus="${id}" aria-label="Plus"><i data-lucide="plus"></i></button>
              </span>
            </div>`).join('')}
          <div class="cf-tip-presets">
            <button class="cash-preset" data-cf-tip-quick="10">+10 / pers.</button>
            <button class="cash-preset" data-cf-tip-quick="20">+20 / pers.</button>
            <button class="cash-preset" data-cf-tip-quick="0">Aucun</button>
          </div>
        </div>

        <div class="cf-pay-opts" style="margin-top:14px;">
          <button class="cf-pay-opt" data-cf-method="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé · flous f l'main</span></span>
            <span class="amt" id="cf-opt-cash">${fmtMAD(total)}</span>
          </button>
          <button class="cf-pay-opt" data-cf-method="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
            <span class="amt" id="cf-opt-card">${fmtMAD(total)}</span>
          </button>
        </div>`;
      icons();
      const syncTip = () => {
        const tt = tipTotal();
        $('#cf-tip-total', el).textContent = fmtMAD(tt);
        staffIds.forEach((id) => { const b = $(`[data-cf-tip-val="${id}"]`, el); if (b) b.textContent = fmtMAD(tip.per[id]); });
        $('#cf-pay-amount', el).textContent = fmtMAD(total + tt);
        const cc = $('#cf-opt-cash', el); if (cc) cc.textContent = fmtMAD(total + tt);
        const cd = $('#cf-opt-card', el); if (cd) cd.textContent = fmtMAD(total + tt);
      };
      $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-pay-veil'); });
      const split = $('#cf-tip-split', el);
      split.onclick = (e) => {
        const minus = e.target.closest('[data-cf-tip-minus]');
        const plus  = e.target.closest('[data-cf-tip-plus]');
        const quick = e.target.closest('[data-cf-tip-quick]');
        if (minus) { const id = minus.dataset.cfTipMinus; tip.per[id] = Math.max(0, tip.per[id] - 5); syncTip(); return; }
        if (plus)  { const id = plus.dataset.cfTipPlus;  tip.per[id] = Math.min(500, tip.per[id] + 5); syncTip(); return; }
        if (quick) {
          const v = +quick.dataset.cfTipQuick;
          staffIds.forEach((id) => { tip.per[id] = v; });
          $$('[data-cf-tip-quick]', el).forEach((x) => x.classList.toggle('on', x === quick));
          syncTip();
        }
      };
      $$('[data-cf-method]', el).forEach((b) => {
        b.onclick = () => (b.dataset.cfMethod === 'especes' ? stepCash() : stepCard());
      });
    };

    const grand = () => total + tipTotal();

    const stepCash = () => {
      const amount = grand();
      let received = amount;
      el.innerHTML = `
        <button class="cf-modal-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(passCustName(p))}${tipTotal() ? ` · dont ${fmtMAD(tipTotal())} de pourboire` : ''}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="cf-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="cf-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
            <button class="cash-preset" data-add="500">+500</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="cf-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="cf-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        const rendu = Math.max(0, received - amount);
        const r = $('#cf-cash-rendu', el);
        r.textContent = fmtMAD(rendu);
        $('#cf-cash-ok', el).disabled = received < amount;
      };
      $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-pay-veil'); });
      $('#cf-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#cf-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#cf-cash-ok', el).onclick = () => done('especes', Math.max(0, received - amount));
    };

    const stepCard = () => {
      const amount = grand();
      el.innerHTML = `
        <button class="cf-modal-x" data-cf-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(passCustName(p))} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="cf-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="cf-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-cf-close]', el).forEach((b) => { b.onclick = () => closeVeil('#cf-pay-veil'); });
      setTimeout(() => {
        const disc = $('#cf-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const st = $('#cf-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); st.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, st).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0), 900);
        });
      }, 1900);
    };

    const done = (method, rendu) => {
      const tt = tipTotal();
      p.tip = tt;
      p.tipSplit = Object.assign({}, tip.per);
      p.payMethod = method;
      p.paid = true;
      p.state = 'fini';
      /* recorder dans la journée + l'historique de la fiche */
      p.lines.forEach((ln) => {
        const item = ITEMS[ln.itemId];
        DONE_TODAY.push({
          custId: p.custId, staffId: ln.staffId || p.staffId, label: item.label,
          amt: priceOf(item, ln.variantId) + (ln.addons || []).reduce((s, a) => s + ADDON[a].price, 0),
          tip: 0,
        });
      });
      /* le pourboire encaissé alimente les totaux journée via un poste dédié */
      staffIds.forEach((id) => { if (tip.per[id]) TIP_LEDGER.push({ staffId: id, amt: tip.per[id] }); });
      /* mémoriser la formule couleur sur la fiche cliente */
      if (p.custId) {
        const c = CUST[p.custId];
        const colorLine = p.lines.find((ln) => ln.formula && ln.formula.base);
        if (colorLine) {
          c.formula = Object.assign({ name: c.formula ? c.formula.name : 'Couleur', notes: c.formula ? c.formula.notes : '' }, colorLine.formula);
        }
        c.visits++;
        c.last = new Date();
        c.hist = c.hist || [];
        c.hist.unshift({ when: new Date(), svc: p.lines.map((l) => ITEMS[l.itemId].label).join(' + '), by: p.lines[0].staffId || p.staffId, amt: total });
      }
      /* Journal partagé : prestations ET pourboire, c'est ce que la cliente a
         réellement payé au comptoir. Sans ça la recette du salon vivait dans
         DONE_TODAY et disparaissait au premier rechargement. */
      postDay(total + tt, method, `${p.lines.map((ln) => ITEMS[ln.itemId].label).join(' + ')} · ${passCustName(p)}`, p.num || `S-${p.id}`);
      closeVeil('#cf-pay-veil');
      queueIfOffline('Encaissement');
      toast(`${passCustName(p)}, ${fmtMAD(total + tt)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}${tt ? ` · pourboire ${fmtMAD(tt)}` : ''}`);
      renderQueue(); renderRdv(); renderBadges(); icons();
    };

    step1();
    openVeil('#cf-pay-veil');
  }

  /* ledger des pourboires encaissés en séance (s'ajoute aux seeds DONE_TODAY) */
  const TIP_LEDGER = [];

  /* ═══════════════════════ FIN DE JOURNÉE ═══════════════════════ */
  function renderJournee() {
    /* agréger par coiffeur·se : passages, CA, commission 40 %, pourboires */
    const seedTips = DONE_TODAY.reduce((s, d) => s + (d.tip || 0), 0);
    const liveTips = TIP_LEDGER.reduce((s, t) => s + t.amt, 0);
    const byStaff = {};
    STAFF.forEach((s) => { byStaff[s.id] = { passages: 0, ca: 0, tip: 0 }; });
    DONE_TODAY.forEach((d) => {
      const b = byStaff[d.staffId]; if (!b) return;
      b.passages++; b.ca += d.amt; b.tip += d.tip || 0;
    });
    TIP_LEDGER.forEach((t) => { if (byStaff[t.staffId]) byStaff[t.staffId].tip += t.amt; });
    const totalCA = STAFF.reduce((s, st) => s + byStaff[st.id].ca, 0);
    const totalTip = seedTips + liveTips;
    const totalPass = DONE_TODAY.length;
    const totalCom = Math.round(totalCA * COMMISSION);
    const maxCA = Math.max(1, ...STAFF.map((s) => byStaff[s.id].ca));

    $('#cf-journee-sub', root).textContent = `${fmtDay(new Date())} · ${totalPass} passages servis aujourd'hui`;
    const el = $('#cf-journee-body', root);
    el.innerHTML = `
      <div class="cf-day-inner">
        <div class="cf-day-summary">
          <div class="cf-day-kpi"><div class="lbl"><i data-lucide="scissors"></i>Passages</div><div class="val">${totalPass}</div></div>
          <div class="cf-day-kpi accent"><div class="lbl"><i data-lucide="banknote"></i>CA du jour</div><div class="val">${fmtMAD(totalCA)}</div></div>
          <div class="cf-day-kpi"><div class="lbl"><i data-lucide="hand-coins"></i>Pourboires</div><div class="val">${fmtMAD(totalTip)}</div></div>
          <div class="cf-day-kpi"><div class="lbl"><i data-lucide="percent"></i>Commissions 40 %</div><div class="val">${fmtMAD(totalCom)}</div></div>
        </div>

        <div class="cf-day-staff-lbl"><i data-lucide="users" style="width:12px;height:12px"></i> Par coiffeur·se</div>
        <div class="cf-day-cards">
          ${STAFF.map((s) => {
            const b = byStaff[s.id];
            const com = Math.round(b.ca * COMMISSION);
            const pct = Math.round((b.ca / maxCA) * 100);
            return `<div class="cf-day-card">
              <span class="av" style="background:${s.color}">${esc(s.short[0])}</span>
              <span class="who"><b>${esc(s.name)}</b><span>${esc(s.role)}</span></span>
              <span class="cf-day-metrics">
                <span class="cf-day-metric"><span class="m-lbl">Passages</span><span class="m-val">${b.passages}</span></span>
                <span class="cf-day-metric"><span class="m-lbl">CA</span><span class="m-val">${fmtMAD(b.ca)}</span></span>
                <span class="cf-day-metric com"><span class="m-lbl">Commission 40 %</span><span class="m-val">${fmtMAD(com)}</span></span>
                <span class="cf-day-metric tip"><span class="m-lbl">Pourboires</span><span class="m-val">${fmtMAD(b.tip)}</span></span>
              </span>
              <span class="cf-day-bar"><i style="width:${pct}%"></i></span>
            </div>`;
          }).join('')}
        </div>

        <div class="cf-day-foot">
          <button class="cf-btn secondary" id="cf-day-print"><i data-lucide="printer"></i>Imprimer la clôture</button>
          <button class="cf-btn primary" id="cf-day-close"><i data-lucide="check-circle-2"></i>Clôturer la journée</button>
        </div>
      </div>`;
    icons();
    $('#cf-day-print', root).onclick = () => toast('Clôture envoyée, récap CA + commissions (imprimante thermique)');
    $('#cf-day-close', root).onclick = () => {
      if (PASSAGES.some((p) => p.state !== 'fini')) {
        toast(`${PASSAGES.filter((p) => p.state !== 'fini').length} passage(s) encore en cours, terminez d'abord la file`);
        return;
      }
      queueIfOffline('Clôture journée');
      toast('Journée clôturée, bsahtkom, à demain');
    };
  }

  /* ═══════════════════════ OFFLINE (file simulée) ═══════════════════════ */
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
      toast('Mode hors-ligne, le salon continue, tout est mis en file');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#cf-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.cf-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.cf-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'cf-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#cf-offline-note', root);
    note.hidden = !state.offline;
    $('#cf-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'coiffure',
    greet: {
      line1: 'Sba7 lkhir Yasmine,',
      em: 'marhba.',
      sub: 'Salon Yasmine <em>·</em> deux fauteuils occupés, la file tourne',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) { renderBadges(); renderNet(); switchView(state.view); icons(); } },
  });
})();
