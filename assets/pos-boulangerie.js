/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOULANGERIE BAB KASBAH — vertical POS, PIN 0006
 * ---------------------------------------------------------------------------
 * Registered on window.KiwiPosDispatch (assets/pos-dispatch.js) which owns the
 * PIN choreography and lazy-loads this pair on first unlock. Everything else
 * lives here: the dispatcher hands us an empty <div class="vx-screen"
 * id="pos-boulangerie"> and we build the whole app inside it.
 *
 * Four screens, one story — the bakery counter at 10 h du matin:
 *   COMPTOIR   ultra-fast grid (khobz à 1,50 MAD se vend en deux gestes),
 *              multiplicateurs ×2 ×6 ×12, espèces instantanées avec rendu.
 *   FOURNÉES   the day's batch timeline. « Sorti du four » credits a live
 *              RESTANT per product that every sale decrements; when the
 *              restant runs low with nothing planned, « four à prévoir ».
 *   GÂTEAUX    the cake order book — occasion, inscription previewed in
 *              Instrument Serif on the cake, acompte, WhatsApp « prêt ».
 *   FIN DE JOURNÉE  recette, −50 % dernière heure, invendus → don du soir.
 *
 * Reuses the caisse modal kit (.modal-veil, .modal, .cash-*, .reader-*) and
 * the shared #toast-stack. V1 = operational layer only: la carte part au
 * lecteur partenaire, Kiwi n'encaisse pas.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── real-store guard ─────────────────────────
     A real merchant paired their bakery → do NOT seed the demo cast
     (customer cake orders, hardcoded greet name). Local demo path (no
     pairing / not real) stays byte-identical to before. */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* bakery money — small coins matter: 1,50 / 0,75 keep their comma decimals */
  const fmtN = (n) => {
    const v = Math.round(n * 100) / 100;
    const dec = Math.abs(v % 1) > 0.004;
    return new Intl.NumberFormat('fr-FR', {
      useGrouping: true,
      minimumFractionDigits: dec ? 2 : 0,
      maximumFractionDigits: dec ? 2 : 0,
    }).format(v);
  };
  const fmtMAD = (n) => fmtN(n) + ' MAD';
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const lens   = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const hhmm   = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const dayAt = (offset, h, m) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, m || 0, 0, 0);
    return d;
  };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isToday    = (d) => sameDay(d, new Date());
  const isTomorrow = (d) => sameDay(d, dayAt(1, 12));
  const whenLabel  = (d) => isToday(d) ? "aujourd'hui" : isTomorrow(d) ? 'demain' : fmtDay(d);
  const fmtWhen    = (d) => `${whenLabel(d)} · ${hhmm(d)}`;

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

  /* ───────────────────────── line-art ─────────────────────────
     The menu IS the art — forest strokes, mint-tint fills, 64×64 grid,
     same visual voice as the pressing's garment dict. */
  const art = (inner) => `<svg class="bl-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    /* khobz — round Moroccan loaf, docked top */
    khobz: art(`<path class="fill" d="M9 41a23 17 0 0 1 46 0c0 4.5-10 8-23 8S9 45.5 9 41z"/><path d="M9 41a23 17 0 0 1 46 0"/><path d="M9 41c0 4.5 10 8 23 8s23-3.5 23-8"/><path class="thin" d="M17 36a15.5 11 0 0 1 30 0"/><circle class="thin" cx="26" cy="30.5" r=".9"/><circle class="thin" cx="32" cy="29" r=".9"/><circle class="thin" cx="38" cy="30.5" r=".9"/>`),
    /* baguette — diagonal, three slashes */
    baguette: art(`<path class="fill" d="M11 48c-4-4-2.5-10.5 2-15L31 14.5C36 9.5 44 8 48 11.5s3 11-2 16L27.5 46c-4.5 4.5-12.5 6-16.5 2z"/><path d="M11 48c-4-4-2.5-10.5 2-15L31 14.5C36 9.5 44 8 48 11.5s3 11-2 16L27.5 46c-4.5 4.5-12.5 6-16.5 2z"/><path class="thin" d="M19.5 35.5l7.5 7.5M27 28l7.5 7.5M34.5 20.5l7.5 7.5"/>`),
    /* pain complet — oval boule, scored, graines */
    complet: art(`<path class="fill" d="M8 41a24 16 0 0 1 48 0c0 5-11 8.5-24 8.5S8 46 8 41z"/><path d="M8 41a24 16 0 0 1 48 0c0 5-11 8.5-24 8.5S8 46 8 41z"/><path class="thin" d="M19 35l8-6M28.5 38l9-7M38 36.5l7.5-6"/><circle class="thin" cx="20" cy="43" r=".9"/><circle class="thin" cx="44" cy="43" r=".9"/><circle class="thin" cx="32" cy="46" r=".9"/>`),
    /* msemen — square, laminated folds */
    msemen: art(`<rect class="fill" x="12" y="16" width="40" height="36" rx="6"/><rect x="12" y="16" width="40" height="36" rx="6"/><path class="thin" d="M12 28h40M12 40h40M24 16v36M40 16v36"/><path class="soft" d="M16.5 22c2 1.6 4.5 1.6 6.5 0M41 46c2 1.6 4.5 1.6 6.5 0"/>`),
    /* batbout — puffy pocket, steam */
    batbout: art(`<ellipse class="fill" cx="32" cy="41" rx="20" ry="12"/><ellipse cx="32" cy="41" rx="20" ry="12"/><path class="thin" d="M18 37c8-5 20-5 28 0"/><path d="M25 14c-1.8 2 1.8 3.5 0 5.5M32 11.5c-1.8 2 1.8 3.5 0 5.5M39 14c-1.8 2 1.8 3.5 0 5.5"/>`),
    /* harcha — semolina disc, thick rim, grain dots */
    harcha: art(`<circle class="fill" cx="32" cy="36" r="19"/><circle cx="32" cy="36" r="19"/><circle class="thin" cx="32" cy="36" r="13"/><circle class="thin" cx="27" cy="31.5" r=".9"/><circle class="thin" cx="35.5" cy="29.5" r=".9"/><circle class="thin" cx="39" cy="38.5" r=".9"/><circle class="thin" cx="28.5" cy="41" r=".9"/><circle class="thin" cx="33.5" cy="36" r=".9"/>`),
    /* croissant — crescent, tips down, fold lines */
    croissant: art(`<path class="fill" d="M10 44C12 27 22 16 32 16s20 11 22 28c-6-6-13-9-22-9s-16 3-22 9z"/><path d="M10 44C12 27 22 16 32 16s20 11 22 28"/><path d="M54 44c-6-6-13-9-22-9s-16 3-22 9"/><path class="thin" d="M23 36.5c-1-6.5 1-13.5 4-17.5M41 36.5c1-6.5-1-13.5-4-17.5"/>`),
    /* pain au chocolat — two batons visible */
    painchoc: art(`<rect class="fill" x="10" y="20" width="44" height="26" rx="5"/><rect x="10" y="20" width="44" height="26" rx="5"/><path d="M20 20v26M44 20v26"/><path class="thin" d="M26 28c4-2 8-2 12 0M26 34c4-2 8-2 12 0M26 40c4-2 8-2 12 0"/>`),
    /* mille-feuille — three slabs, cream waves, icing */
    millefeuille: art(`<rect class="fill" x="12" y="19" width="40" height="6.5" rx="2.5"/><rect x="12" y="19" width="40" height="6.5" rx="2.5"/><rect class="fill" x="12" y="31" width="40" height="6.5" rx="2.5"/><rect x="12" y="31" width="40" height="6.5" rx="2.5"/><rect class="fill" x="12" y="43" width="40" height="6.5" rx="2.5"/><rect x="12" y="43" width="40" height="6.5" rx="2.5"/><path class="thin" d="M14 28.3c3 1.5 6 1.5 9 0s6-1.5 9 0 6 1.5 9 0 6-1.5 9 0M14 40.3c3 1.5 6 1.5 9 0s6-1.5 9 0 6 1.5 9 0 6-1.5 9 0"/><path class="soft" d="M16 14.5c2.7 0 2.7 2 5.4 2s2.7-2 5.4-2 2.7 2 5.4 2 2.7-2 5.4-2 2.7 2 5.4 2 2.7-2 5.4-2"/>`),
    /* corne de gazelle — slim smooth horn, tips up, pricked */
    corne: art(`<path class="fill" d="M12 21c2 18 10 29 20 29s18-11 20-29c-5 8.5-11 12.5-20 12.5S17 29.5 12 21z"/><path d="M12 21c2 18 10 29 20 29s18-11 20-29"/><path d="M52 21c-5 8.5-11 12.5-20 12.5S17 29.5 12 21"/><circle class="thin" cx="26" cy="40" r=".9"/><circle class="thin" cx="32" cy="43.5" r=".9"/><circle class="thin" cx="38" cy="40" r=".9"/>`),
    /* ghriba — cracked dome cookie */
    ghriba: art(`<path class="fill" d="M12 42a20 18 0 0 1 40 0c0 3.5-9 6.5-20 6.5S12 45.5 12 42z"/><path d="M12 42a20 18 0 0 1 40 0"/><path d="M12 42c0 3.5 9 6.5 20 6.5s20-3 20-6.5"/><path class="thin" d="M26 28l4 4-2 5M36.5 27l-3 5 4 4M30.5 23.5l2 3.5"/>`),
    /* gâteau — layer cake on board, drip frosting, one candle */
    cake: art(`<rect class="fill" x="14" y="28" width="36" height="20" rx="4"/><rect x="14" y="28" width="36" height="20" rx="4"/><path d="M14 34.5c4 4 8-4 12 0s8-4 12 0 8-4 12 0"/><path d="M10 48h44"/><path d="M32 28v-7"/><path class="thin" d="M32 16.5c-1.4 1.5 1.4 2.4 0 3.9"/>`),
  };

  /* ───────────────────────── catalogue + restant ─────────────────────────
     `stock` is the live RESTANT in the display — fournées credit it, every
     sale debits it. Seeded mid-morning: la fournée du matin est bien vendue,
     le msemen de 10 h 30 est encore au four. MAD, Tanger 2026. */
  const CATALOG = [
    { id: 'pain', label: 'Pain', items: [
      { id: 'khobz',    label: 'Khobz',        sub: 'pain rond', price: 1.5, stock: 38, baked: 120, sold: 82, seuil: 30, batch: 100 },
      { id: 'baguette', label: 'Baguette',                       price: 1.5, stock: 19, baked: 80,  sold: 61, seuil: 20, batch: 80 },
      { id: 'complet',  label: 'Pain complet',                   price: 2.5, stock: 25, baked: 40,  sold: 15, seuil: 10, batch: 40 },
    ] },
    { id: 'beldi', label: 'Beldi', items: [
      { id: 'msemen',  label: 'Msemen',  price: 2.5, stock: 0,  baked: 0,  sold: 0,  seuil: 10, batch: 60 },
      { id: 'batbout', label: 'Batbout', price: 1.5, stock: 0,  baked: 0,  sold: 0,  seuil: 15, batch: 80 },
      { id: 'harcha',  label: 'Harcha',  price: 2.5, stock: 14, baked: 40, sold: 26, seuil: 10, batch: 40 },
    ] },
    { id: 'vien', label: 'Viennoiserie', items: [
      { id: 'croissant', label: 'Croissant',        price: 3,   stock: 12, baked: 50, sold: 38, seuil: 12, batch: 50 },
      { id: 'painchoc',  label: 'Pain au chocolat', price: 3.5, stock: 18, baked: 40, sold: 22, seuil: 10, batch: 40 },
    ] },
    { id: 'patis', label: 'Pâtisserie', items: [
      { id: 'millefeuille', label: 'Mille-feuille',                   price: 8,   stock: 9,  baked: 12, sold: 3,  seuil: 4,  batch: 12 },
      { id: 'corne',        label: 'Corne de gazelle', sub: 'la pièce', price: 3.5, stock: 64, baked: 80, sold: 16, seuil: 12, batch: 80 },
      { id: 'ghriba',       label: 'Ghriba',                          price: 2,   stock: 38, baked: 50, sold: 12, seuil: 10, batch: 50 },
    ] },
  ];
  const PROD = {};
  CATALOG.forEach((c) => c.items.forEach((p) => { p.cat = c.id; PROD[p.id] = p; }));

  /* fournées du jour — sorted by time, status: sortie | four | prevue */
  let fourSeq = 10;
  const FOURNEES = [
    { id: 'F1', time: '06:00', prod: 'khobz',     qty: 120, status: 'sortie', out: '06:05' },
    { id: 'F2', time: '06:30', prod: 'baguette',  qty: 80,  status: 'sortie', out: '06:35' },
    { id: 'F3', time: '07:00', prod: 'croissant', qty: 50,  status: 'sortie', out: '07:10' },
    { id: 'F4', time: '07:00', prod: 'painchoc',  qty: 40,  status: 'sortie', out: '07:10' },
    { id: 'F5', time: '08:30', prod: 'complet',   qty: 40,  status: 'sortie', out: '08:35' },
    { id: 'F6', time: '10:30', prod: 'msemen',    qty: 60,  status: 'four' },           /* le moment démo */
    { id: 'F7', time: '11:00', prod: 'harcha',    qty: 40,  status: 'prevue' },
    { id: 'F8', time: '16:00', prod: 'batbout',   qty: 80,  status: 'prevue' },
    { id: 'F9', time: '16:30', prod: 'khobz',     qty: 100, status: 'prevue' },
  ];
  const nextFournee = (prodId) =>
    FOURNEES.filter((f) => f.prod === prodId && f.status !== 'sortie')
      .sort((a, b) => a.time.localeCompare(b.time))[0] || null;

  /* ───────────────────────── gâteaux sur commande ───────────────────────── */
  const PARTS = [
    { id: 'p8',  label: '8 parts',  sub: 'goûter',        price: 160 },
    { id: 'p12', label: '12 parts', sub: 'famille',       price: 240 },
    { id: 'p20', label: '20 parts', sub: 'fête',          price: 350 },
    { id: 'p40', label: '40 parts', sub: 'pièce montée',  price: 650 },
  ];
  const PART = Object.fromEntries(PARTS.map((p) => [p.id, p]));
  const OCCASIONS = [
    { id: 'anniv',       label: 'Anniversaire' },
    { id: 'fiancailles', label: 'Mariage · fiançailles' },
    { id: 'naissance',   label: 'Naissance' },
    { id: 'reussite',    label: 'Réussite · diplôme' },
    { id: 'autre',       label: 'Autre' },
  ];
  const OCC = Object.fromEntries(OCCASIONS.map((o) => [o.id, o.label]));
  const PARFUMS = ['Chocolat', 'Vanille-framboise', 'Amande-miel', 'Fruits de saison'];

  let cakeSeq = 116;
  /* Seeded cake orders carry real-looking customer names + phone numbers —
     a real bakery starts with an empty carnet (renders the "Carnet vide"
     empty state); only the local demo keeps the sample commandes. */
  const CAKES = pvReal() ? [] : [
    { id: 'G-112', name: 'Yasmine Benjelloun', phone: '0661 42 87 30', occasion: 'anniv',
      inscription: '3id milad sa3id Yasmine', parts: 'p20', parfum: 'Chocolat',
      price: 350, paid: 150, retrait: dayAt(0, 17, 0), status: 'encours', notified: false },
    { id: 'G-113', name: 'Sanae Drissi', phone: '0670 51 22 84', occasion: 'fiancailles',
      inscription: 'Sanae & Mehdi', parts: 'p40', parfum: 'Amande-miel',
      price: 650, paid: 300, retrait: dayAt(1, 12, 0), status: 'encours', notified: false },
    { id: 'G-114', name: 'Karim El Ouazzani', phone: '0666 09 73 41', occasion: 'reussite',
      inscription: 'Mabrouk le bac, Houssam', parts: 'p12', parfum: 'Chocolat',
      price: 240, paid: 100, retrait: dayAt(2, 18, 0), status: 'encours', notified: false },
    { id: 'G-115', name: 'Nadia Chraibi', phone: '0662 88 14 09', occasion: 'anniv',
      inscription: 'Joyeux anniversaire Rayan', parts: 'p8', parfum: 'Vanille-framboise',
      price: 160, paid: 0, retrait: dayAt(3, 11, 0), status: 'encours', notified: false },
  ];
  const cakeDue = (c) => Math.max(0, c.price - c.paid);
  const findCake = (id) => CAKES.find((c) => c.id === id);
  const firstName = (n) => String(n || '').split(/\s+/)[0];

  const ASSOCS = ['Dar Talib Kasbah', 'Association Al Ihsane', 'Banque Alimentaire Tanger'];

  /* ───────────────────────── state ─────────────────────────
     Seeded mid-shift: 89 tickets sold this morning, recette déjà vivante. */
  const state = {
    view: 'comptoir',
    cat: 'tous',
    ticket: [],                       /* [{prodId, qty}] */
    seq: pvReal() ? 1 : 90,           /* prochain ticket T-090 */
    day: pvReal() ? { especes: 0, carte: 0, tickets: 0, gateaux: 0 } : { especes: 530.5, carte: 81.5, tickets: 89, gateaux: 0 },
    lastHour: false,
    invAdjust: {},                    /* prodId → invendus comptés (défaut = stock) */
    donForm: { assoc: null, note: '' },
    don: null,                        /* {assoc, note, pieces, at} */
    offline: false, queued: 0,
  };
  const tNum = () => `T-${pad2(state.seq).padStart(3, '0')}`;
  const effPrice = (p) => state.lastHour ? Math.round(p.price * 50) / 100 : p.price;
  const tkCount  = () => state.ticket.reduce((s, l) => s + l.qty, 0);
  const tkTotal  = () => state.ticket.reduce((s, l) => s + effPrice(PROD[l.prodId]) * l.qty, 0);
  const inTicket = (prodId) => { const l = state.ticket.find((x) => x.prodId === prodId); return l ? l.qty : 0; };
  const tkLabel  = () => {
    const l = state.ticket[0];
    if (!l) return 'Vente';
    const nm = PROD[l.prodId] ? PROD[l.prodId].name : 'Vente';
    return state.ticket.length > 1 ? `${nm} +${tkCount() - l.qty} art.` : nm;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le comptoir vendait toute la matinée dans state.day et rien d'autre : la
     patronne voyait 0 MAD et un refresh effaçait la recette. Démo : no-op. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('boulangerie', { total, method, label, ref });
    } catch (_) {}
  }
  (function restoreDay() {
    try {
      if (!window.KiwiPosSale) return;
      const t = window.KiwiPosSale.totals('boulangerie');
      if (!t.count) return;
      state.day.especes += t.cash;
      state.day.carte += t.card + t.other;
      state.day.tickets += t.count;
      state.seq = window.KiwiPosSale.nextSeq('boulangerie', state.seq);
    } catch (_) {}
  })();

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="bl-rail">
        <div class="bl-brand">kiwi<i></i></div>
        <div class="bl-venue">
          <div class="bl-venue-name">${pvName('Boulangerie Bab Kasbah') || 'Ma boulangerie'}</div>
          <div class="bl-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Kasbah'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="bl-nav" id="bl-nav">
          <button class="bl-nav-it on" data-bl-view="comptoir"><i data-lucide="croissant"></i><span>Comptoir</span></button>
          <button class="bl-nav-it" data-bl-view="fournees"><i data-lucide="flame"></i><span>Fournées</span><b class="bl-nav-badge" id="bl-badge-four"></b></button>
          <button class="bl-nav-it" data-bl-view="gateaux"><i data-lucide="cake"></i><span>Gâteaux</span><b class="bl-nav-badge" id="bl-badge-cake"></b></button>
          <button class="bl-nav-it" data-bl-view="jour"><i data-lucide="sun"></i><span>Fin de journée</span></button>
        </nav>
        <div class="bl-rail-foot">
          <button class="bl-net" id="bl-net" title="Simuler une coupure réseau">
            <i class="bl-net-dot"></i><span class="bl-net-label">En ligne</span>
          </button>
          <button class="bl-lock" id="bl-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="bl-main">
        <div class="bl-offline-note" id="bl-offline-note" hidden>
          Hors-ligne, les ventes restent enregistrées sur la caisse et partent à la synchronisation.
          <b id="bl-queue-count"></b>
        </div>
        <section class="bl-view is-on" data-bl-panel="comptoir">
          <div class="bl-counter">
            <header class="bl-head">
              <div><h1>Comptoir</h1><div class="bl-head-sub" id="bl-today"></div></div>
              <div class="bl-head-hint" id="bl-counter-hint">Touchez un produit, ×2 ×6 ×12 pour la douzaine</div>
            </header>
            <div class="bl-cats" id="bl-cats"></div>
            <div class="bl-grid-scroll" id="bl-gridwrap"></div>
          </div>
          <aside class="bl-ticket" id="bl-ticket"></aside>
        </section>
        <section class="bl-view" data-bl-panel="fournees"></section>
        <section class="bl-view" data-bl-panel="gateaux"></section>
        <section class="bl-view" data-bl-panel="jour"></section>
      </main>
      <div class="modal-veil" id="bl-cake-veil"><div class="modal bl-cakem bl-rel" id="bl-cakemm"></div></div>
      <div class="modal-veil" id="bl-detail-veil"><div class="modal bl-detail bl-rel" id="bl-detailm"></div></div>
      <div class="modal-veil" id="bl-wa-veil"><div class="modal bl-wa bl-rel" id="bl-wam"></div></div>
      <div class="modal-veil" id="bl-pay-veil"><div class="modal bl-pay bl-rel" id="bl-paym"></div></div>`;

    $('#bl-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-bl-view]');
      if (b) switchView(b.dataset.blView);
    });
    $('#bl-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#bl-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    renderAll();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  function renderAll() {
    $('#bl-today', root).textContent = `${fmtDT(new Date())}, la fournée du matin est sortie`;
    renderCats();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
  }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.bl-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.blView === view));
    $$('.bl-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.blPanel === view));
    if (view === 'comptoir') { renderGrid(); renderTicket(); }
    if (view === 'fournees') renderFournees();
    if (view === 'gateaux') renderCakes();
    if (view === 'jour') renderJour();
    icons();
  }

  function renderBadges() {
    const fours = FOURNEES.filter((f) => f.status !== 'sortie').length;
    const cakes = CAKES.filter((c) => c.status !== 'remis' && isToday(c.retrait)).length;
    const bf = $('#bl-badge-four', root), bc = $('#bl-badge-cake', root);
    bf.textContent = fours || '';
    bc.textContent = cakes || '';
    bf.style.display = fours ? '' : 'none';
    bc.style.display = cakes ? '' : 'none';
  }

  /* re-render whatever ops view is open + the rail badges */
  function refreshOps() {
    renderBadges();
    if (state.view === 'comptoir') { renderGrid(); renderTicket(); }
    if (state.view === 'fournees') renderFournees();
    if (state.view === 'gateaux') renderCakes();
    if (state.view === 'jour') renderJour();
    icons();
  }

  /* ═══════════════════════ COMPTOIR — la grille rapide ═══════════════════════ */
  function renderCats() {
    const all = CATALOG.reduce((s, c) => s + c.items.length, 0);
    $('#bl-cats', root).innerHTML =
      `<button class="bl-cat ${state.cat === 'tous' ? 'on' : ''}" data-bl-cat="tous">Tous <span class="bl-cat-ct">${all}</span></button>` +
      CATALOG.map((c) =>
        `<button class="bl-cat ${state.cat === c.id ? 'on' : ''}" data-bl-cat="${c.id}">${esc(c.label)} <span class="bl-cat-ct">${c.items.length}</span></button>`
      ).join('');
    $('#bl-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-bl-cat]');
      if (!b) return;
      state.cat = b.dataset.blCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function stockPill(p) {
    if (p.stock <= 0) {
      const nf = nextFournee(p.id);
      if (nf && nf.status === 'four') return '<span class="bl-stock out">au four</span>';
      if (nf) return `<span class="bl-stock out">fournée ${nf.time}</span>`;
      return '<span class="bl-stock out">épuisé</span>';
    }
    if (p.stock <= p.seuil) return `<span class="bl-stock low">plus que ${p.stock}</span>`;
    return `<span class="bl-stock">${p.stock}</span>`;
  }

  function priceLine(p) {
    if (!state.lastHour) return `${fmtN(p.price)} MAD`;
    return `<span class="old">${fmtN(p.price)}</span><span class="promo">${fmtN(effPrice(p))} MAD</span>`;
  }

  function renderGrid() {
    const cats = state.cat === 'tous' ? CATALOG : CATALOG.filter((c) => c.id === state.cat);
    let i = 0;
    $('#bl-gridwrap', root).innerHTML = cats.map((c) => `
      <div class="bl-cat-head">${esc(c.label)}</div>
      <div class="bl-grid">${c.items.map((p) => `
        <div class="bl-card ${p.stock <= 0 ? 'is-out' : ''}" data-bl-prod="${p.id}" role="button" tabindex="0" style="--i:${i++}">
          ${stockPill(p)}
          <span class="bl-card-art">${ART[p.id] || ''}</span>
          <span class="bl-card-name">${esc(p.label)}</span>
          <span class="bl-card-price">${priceLine(p)}${p.sub ? ` · ${esc(p.sub)}` : ''}</span>
          <span class="bl-mults">
            <button class="bl-mult" data-bl-mult="2" data-bl-of="${p.id}">×2</button>
            <button class="bl-mult" data-bl-mult="6" data-bl-of="${p.id}">×6</button>
            <button class="bl-mult" data-bl-mult="12" data-bl-of="${p.id}" title="la douzaine">×12</button>
          </span>
        </div>`).join('')}
      </div>`).join('');
    const hint = $('#bl-counter-hint', root);
    hint.innerHTML = state.lastHour
      ? '<span class="bl-lh-chip"><i data-lucide="percent"></i>Dernière heure, tout à −50 %</span>'
      : 'Touchez un produit, ×2 ×6 ×12 pour la douzaine';
    $('#bl-gridwrap', root).onclick = (e) => {
      const m = e.target.closest('[data-bl-mult]');
      if (m) { addToTicket(m.dataset.blOf, +m.dataset.blMult); return; }
      const card = e.target.closest('[data-bl-prod]');
      if (card) addToTicket(card.dataset.blProd, 1);
    };
    icons();
  }

  function outOfStockToast(p) {
    const nf = nextFournee(p.id);
    if (nf && nf.status === 'four') toast(`${p.label} encore au four, sortie d'ici quelques minutes`);
    else if (nf) toast(`${p.label}, prochaine fournée prévue à ${nf.time}`);
    else toast(`${p.label} épuisé pour aujourd'hui, prévoyez une fournée à l'écran Fournées`);
  }

  function addToTicket(prodId, qty) {
    const p = PROD[prodId];
    if (!p) return;
    if (p.stock <= 0) { outOfStockToast(p); return; }
    const avail = p.stock - inTicket(prodId);
    if (avail <= 0) { toast(`Tout le restant de ${p.label} est déjà sur le ticket`); return; }
    const add = Math.min(qty, avail);
    const line = state.ticket.find((l) => l.prodId === prodId);
    if (line) line.qty += add; else state.ticket.push({ prodId, qty: add });
    if (add < qty) toast(`Plus que ${add} ${p.label}, ajouté${add > 1 ? 's' : ''} au ticket`);
    renderTicket(); icons();
  }

  /* ---------- ticket ---------- */
  function renderTicket() {
    const total = tkTotal();
    const count = tkCount();
    const el = $('#bl-ticket', root);
    el.innerHTML = `
      <div class="bl-tk-head">
        <div><span class="bl-tk-title">Ticket</span> <span class="bl-tk-num">· ${tNum()}</span></div>
        ${state.ticket.length ? '<button class="bl-tk-reset" id="bl-tk-reset">Vider</button>' : ''}
      </div>
      <div class="bl-tk-lines" id="bl-tk-lines">
        ${state.ticket.length ? state.ticket.map((l, i) => lineRow(l, i)).join('') : `
          <div class="bl-tk-empty">
            <i data-lucide="wheat"></i>
            <div>Le ticket est vide.<br>Touchez khobz, msemen ou croissant, la vente part en deux gestes.</div>
          </div>`}
      </div>
      <div class="bl-tk-foot">
        <div class="bl-tk-tot">
          <span class="pcs"><i data-lucide="wheat"></i> ${count} pièce${count > 1 ? 's' : ''}</span>
          ${state.lastHour ? '<span class="bl-lh-chip"><i data-lucide="percent"></i>−50 % dernière heure</span>' : `<span>${state.day.tickets} tickets ce matin</span>`}
        </div>
        <div class="bl-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <div class="bl-paybtns">
          <button class="bl-paybtn" id="bl-pay-cash" ${state.ticket.length ? '' : 'disabled'}>
            <span class="row"><i data-lucide="banknote"></i>Espèces</span><small>rendu calculé</small>
          </button>
          <button class="bl-paybtn card" id="bl-pay-card" ${state.ticket.length ? '' : 'disabled'}>
            <span class="row"><i data-lucide="credit-card"></i>Carte</span><small>lecteur partenaire</small>
          </button>
        </div>
      </div>`;
    const reset = $('#bl-tk-reset', el);
    if (reset) reset.onclick = () => { state.ticket = []; renderTicket(); icons(); };
    $('#bl-pay-cash', el).onclick = () => {
      if (!state.ticket.length) return;
      payCash({
        title: `Espèces · ${fmtMAD(tkTotal())}`,
        sub: `${tNum()} · ${tkCount()} pièce${tkCount() > 1 ? 's' : ''}`,
        amount: tkTotal(),
        onPaid: (m, rendu) => finalizeSale('especes', rendu),
      });
    };
    $('#bl-pay-card', el).onclick = () => {
      if (!state.ticket.length) return;
      payCard({
        title: `Carte · ${fmtMAD(tkTotal())}`,
        sub: `${tNum()} · lecteur partenaire, V1 sans encaissement Kiwi`,
        amount: tkTotal(),
        onPaid: () => finalizeSale('carte', 0),
      });
    };
    $('#bl-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-bl-minus]');
      const plus = e.target.closest('[data-bl-plus]');
      const idx = minus ? +minus.dataset.blMinus : plus ? +plus.dataset.blPlus : -1;
      if (idx < 0) return;
      const l = state.ticket[idx];
      const p = PROD[l.prodId];
      if (plus) {
        if (l.qty >= p.stock) { toast(`Plus que ${p.stock} ${p.label} en boutique`); return; }
        l.qty++;
      } else {
        l.qty--;
        if (l.qty <= 0) state.ticket.splice(idx, 1);
      }
      renderTicket(); icons();
    };
    icons();
  }

  function lineRow(l, i) {
    const p = PROD[l.prodId];
    const u = effPrice(p);
    return `<div class="bl-line">
      <span class="bl-line-art">${ART[p.id] || ''}</span>
      <span class="bl-line-mid">
        <span class="bl-line-name">${esc(p.label)}</span>
        <span class="bl-line-sub">${l.qty} × ${fmtN(u)}${state.lastHour ? ' <span class="promo">−50 %</span>' : ''}</span>
      </span>
      <span class="bl-line-right">
        <span class="bl-line-price">${fmtMAD(u * l.qty)}</span>
        <span class="bl-line-qty">
          <button data-bl-minus="${i}" aria-label="Retirer">−</button><b>${l.qty}</b><button data-bl-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  function finalizeSale(method, rendu) {
    const total = tkTotal();
    const num = tNum();
    state.ticket.forEach((l) => {
      const p = PROD[l.prodId];
      p.stock = Math.max(0, p.stock - l.qty);
      p.sold += l.qty;
    });
    state.day[method === 'carte' ? 'carte' : 'especes'] += total;
    state.day.tickets++;
    postDay(total, method, tkLabel(), num);
    state.seq++;
    state.ticket = [];
    closeVeil('#bl-pay-veil');
    queueIfOffline(`Vente ${num}`);
    toast(`Khlass, ${fmtMAD(total)} encaissé${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    refreshOps();
  }

  /* ═══════════════════════ PAYMENT KIT (caisse classes) ═══════════════════════ */
  function payCash(o) {
    const el = $('#bl-paym', root);
    let received = o.amount;
    let touched = false;                /* 1er preset = on compte à partir de zéro */
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${o.title}</h3>
      <p class="modal-subtle">${o.sub}</p>
      <div class="cash-grid">
        <div class="cash-input-row">
          <label class="cash-input-label" for="bl-cash-in">Flous reçu, tapez ou comptez avec les pièces</label>
          <input class="cash-input mono" id="bl-cash-in" type="number" inputmode="decimal" min="0" step="0.5" value="${o.amount}" />
        </div>
        <div class="cash-presets" aria-label="Compter billets et pièces">
          ${[1, 2, 5, 10, 20, 50, 100, 200].map((v) => `<button class="cash-preset" data-bl-add="${v}">+${v}</button>`).join('')}
          <button class="cash-preset" data-bl-add="0.5">+0,50</button>
          <button class="cash-preset" data-bl-exact>Montant exact</button>
        </div>
        <div class="cash-rendu" id="bl-cash-rendu-row"><span class="lbl">Rendu</span><span class="val mono" id="bl-cash-rendu">0 MAD</span></div>
        <button class="cash-confirm" id="bl-cash-ok">Confirmer l'encaissement</button>
      </div>`;
    icons();
    const refresh = () => {
      const row = $('#bl-cash-rendu-row', el);
      const diff = received - o.amount;
      row.classList.toggle('is-short', diff < 0);
      row.classList.toggle('is-positive', diff > 0);
      $('#bl-cash-rendu', el).textContent = diff < 0 ? `manque ${fmtMAD(-diff)}` : fmtMAD(diff);
      $('#bl-cash-ok', el).disabled = diff < 0;
    };
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-pay-veil'); });
    $('#bl-cash-in', el).oninput = (e) => { received = parseFloat(e.target.value) || 0; touched = true; refresh(); };
    $$('[data-bl-add]', el).forEach((b) => {
      b.onclick = () => {
        if (!touched) { received = 0; touched = true; }
        received = Math.round((received + parseFloat(b.dataset.blAdd)) * 100) / 100;
        $('#bl-cash-in', el).value = received;
        refresh();
      };
    });
    const exact = $('[data-bl-exact]', el);
    exact.onclick = () => { received = o.amount; touched = false; $('#bl-cash-in', el).value = received; refresh(); };
    refresh();
    $('#bl-cash-ok', el).onclick = () => o.onPaid('especes', Math.max(0, Math.round((received - o.amount) * 100) / 100));
    openVeil('#bl-pay-veil');
  }

  function payCard(o) {
    const el = $('#bl-paym', root);
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${o.title}</h3>
      <p class="modal-subtle">${o.sub}</p>
      <div class="reader-stage">
        <div class="reader-disc is-pulsing" id="bl-reader-disc"><i data-lucide="credit-card"></i></div>
        <div class="reader-status" id="bl-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
        <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
      </div>`;
    icons();
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-pay-veil'); });
    openVeil('#bl-pay-veil');
    setTimeout(() => {
      const disc = $('#bl-reader-disc', el);
      if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
      const st = $('#bl-reader-status', el);
      const hw = window.KiwiHardware;
      if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); st.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
      hw.authorizeCard(o.amount, disc, st).then((result) => {
        icons();
        if (result && result.approved) setTimeout(() => o.onPaid('carte', 0), 900);
      });
    }, 1900);
  }

  function payChoice(o) {
    const el = $('#bl-paym', root);
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${o.title}</h3>
      <p class="modal-subtle">${o.sub}</p>
      <div class="modal-amount size-md">${fmtMAD(o.amount)}</div>
      <div class="bl-pay-opts">
        <button class="bl-pay-opt" data-bl-m="especes">
          <span class="ic"><i data-lucide="banknote"></i></span>
          <span class="l"><b>Espèces</b><span>Rendu calculé, les pièces comptent</span></span>
        </button>
        <button class="bl-pay-opt" data-bl-m="carte">
          <span class="ic"><i data-lucide="credit-card"></i></span>
          <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
        </button>
      </div>`;
    icons();
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-pay-veil'); });
    $$('[data-bl-m]', el).forEach((b) => {
      b.onclick = () => {
        const args = { title: `${b.dataset.blM === 'carte' ? 'Carte' : 'Espèces'} · ${fmtMAD(o.amount)}`, sub: o.sub, amount: o.amount, onPaid: o.onPaid };
        b.dataset.blM === 'carte' ? payCard(args) : payCash(args);
      };
    });
    openVeil('#bl-pay-veil');
  }

  /* ═══════════════════════ FOURNÉES — timeline + restant vivant ═══════════════════════ */
  function findFournee(id) { return FOURNEES.find((f) => f.id === id); }

  function nextSlot() {
    const d = new Date(Date.now() + 90 * 60000);
    const m = d.getMinutes();
    if (m % 30) d.setMinutes(m + (30 - (m % 30)));
    d.setSeconds(0, 0);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function frowHTML(f) {
    const p = PROD[f.prod];
    const right = f.status === 'sortie'
      ? `<span class="bl-fpill"><i data-lucide="check"></i>Sortie ${f.out}</span>`
      : f.status === 'four'
        ? `<span class="bl-fpill four"><i data-lucide="flame"></i>Au four</span>
           <button class="bl-fbtn out" data-bl-sortir="${f.id}"><i data-lucide="check-check"></i>Sorti du four</button>`
        : `<button class="bl-fbtn in" data-bl-enfourner="${f.id}"><i data-lucide="flame"></i>Enfourner</button>`;
    return `<div class="bl-frow is-${f.status}">
      <div class="bl-ftime">${f.time}</div>
      <span class="bl-fart">${ART[p.id] || ''}</span>
      <div class="bl-fmid">
        <div class="bl-fname">${esc(p.label)} <b>×${f.qty}</b></div>
        <div class="bl-fsub">${f.status === 'sortie' ? `${f.qty} pièces créditées au restant` : f.status === 'four' ? 'dans le four, marquez la sortie pour créditer le restant' : 'fournée programmée'}</div>
      </div>
      ${right}
    </div>`;
  }

  function restRow(p) {
    const nf = nextFournee(p.id);
    const low = p.stock <= p.seuil;
    const pct = p.baked > 0 ? Math.round((p.stock / p.baked) * 100) : 0;
    const sub = nf
      ? (nf.status === 'four' ? `fournée ×${nf.qty} au four` : `fournée ×${nf.qty} prévue ${nf.time}`)
      : `${p.sold} vendus aujourd'hui`;
    const hint = (low && !nf)
      ? `<button class="bl-rhint" data-bl-prevoir="${p.id}"><i data-lucide="flame"></i>Four à prévoir, programmer <b>${nextSlot()} ×${p.batch}</b></button>`
      : '';
    return `<div class="bl-rrow ${low ? 'is-low' : ''}">
      <div class="bl-rtop">
        <span class="bl-rart">${ART[p.id] || ''}</span>
        <div class="bl-rmid">
          <div class="bl-rname">${esc(p.label)}</div>
          <div class="bl-rsub">${esc(sub)}</div>
        </div>
        <div class="bl-rnum"><b>${p.stock}</b><span>restant</span></div>
      </div>
      <div class="bl-rbar"><i style="width:${Math.min(100, pct)}%"></i></div>
      ${hint}
    </div>`;
  }

  function renderFournees() {
    const panel = $('[data-bl-panel="fournees"]', root);
    const sorted = FOURNEES.slice().sort((a, b) => a.time.localeCompare(b.time));
    const matin = sorted.filter((f) => f.time < '12:00');
    const aprem = sorted.filter((f) => f.time >= '12:00');
    const done = FOURNEES.filter((f) => f.status === 'sortie').length;
    const products = CATALOG.flatMap((c) => c.items);
    panel.innerHTML = `
      <div class="bl-bake">
        <header class="bl-head">
          <div><h1>Fournées du jour</h1>
          <div class="bl-head-sub">${done} sortie${done > 1 ? 's' : ''} · ${FOURNEES.length - done} à venir, le restant vit avec les ventes du comptoir</div></div>
          <div class="bl-head-hint">« Sorti du four » crédite le restant en boutique</div>
        </header>
        <div class="bl-bake-cols">
          <div class="bl-timeline" id="bl-timeline">
            <div class="bl-tl-day">Matin</div>
            ${matin.map(frowHTML).join('')}
            <div class="bl-tl-day">Après-midi</div>
            ${aprem.map(frowHTML).join('') || '<div class="bl-foot-note">Rien de programmé, le comptoir vous dira quand le four doit repartir.</div>'}
          </div>
          <aside class="bl-restant">
            <div class="bl-restant-head">Restant en boutique <span>ventes déduites en direct</span></div>
            ${products.map(restRow).join('')}
          </aside>
        </div>
      </div>`;
    /* rail caps: first/last row of each timeline */
    const rows = $$('.bl-frow', panel);
    if (rows.length) { rows[0].classList.add('is-first'); rows[rows.length - 1].classList.add('is-last'); }
    panel.onclick = (e) => {
      const out = e.target.closest('[data-bl-sortir]');
      if (out) { sortirFournee(out.dataset.blSortir); return; }
      const inB = e.target.closest('[data-bl-enfourner]');
      if (inB) { enfourner(inB.dataset.blEnfourner); return; }
      const prev = e.target.closest('[data-bl-prevoir]');
      if (prev) prevoirFournee(prev.dataset.blPrevoir);
    };
    icons();
  }

  function sortirFournee(id) {
    const f = findFournee(id);
    if (!f || f.status === 'sortie') return;
    if (f.status === 'prevue') { toast(`Fournée ${PROD[f.prod].label} pas encore enfournée, touchez « Enfourner » d'abord`); return; }
    const p = PROD[f.prod];
    f.status = 'sortie';
    f.out = hhmm(new Date());
    p.stock += f.qty;
    p.baked += f.qty;
    queueIfOffline(`Fournée ${p.label}`);
    toast(`Fournée sortie, ${p.label} ×${f.qty} crédités au restant, sa7a!`);
    refreshOps();
  }

  function enfourner(id) {
    const f = findFournee(id);
    if (!f || f.status !== 'prevue') return;
    const p = PROD[f.prod];
    f.status = 'four';
    queueIfOffline(`Enfournement ${p.label}`);
    toast(`${p.label} ×${f.qty} au four, sortie dans ~25 min`);
    refreshOps();
  }

  function prevoirFournee(prodId) {
    const p = PROD[prodId];
    const time = nextSlot();
    FOURNEES.push({ id: `F${fourSeq++}`, time, prod: prodId, qty: p.batch, status: 'prevue' });
    queueIfOffline(`Fournée prévue ${p.label}`);
    toast(`Fournée ${p.label} ×${p.batch} programmée à ${time}, le four est à vous`);
    refreshOps();
  }

  /* ═══════════════════════ GÂTEAUX — carnet de commandes ═══════════════════════ */
  function cakeStatusPill(c) {
    if (c.status === 'remis') return '<span class="bl-pill">Remis</span>';
    if (c.status === 'pret') return '<span class="bl-pill ok"><i data-lucide="check"></i>Prêt</span>';
    return '<span class="bl-pill warn"><i data-lucide="timer"></i>En préparation</span>';
  }
  function cakePayPill(c) {
    const due = cakeDue(c);
    if (due <= 0) return '<span class="bl-pill ok">Réglé</span>';
    if (c.paid > 0) return `<span class="bl-pill warn">Acompte ${fmtN(c.paid)} · solde ${fmtN(due)} MAD</span>`;
    return `<span class="bl-pill due">Sans acompte · ${fmtN(due)} MAD au retrait</span>`;
  }

  function cakeCard(c) {
    const today = isToday(c.retrait);
    const due = cakeDue(c);
    const primary = c.status === 'encours'
      ? `<button class="bl-btn primary" data-bl-pret="${c.id}"><i data-lucide="check"></i>Gâteau prêt</button>`
      : due > 0
        ? `<button class="bl-btn primary" data-bl-solde="${c.id}"><i data-lucide="banknote"></i>Encaisser solde · ${fmtN(due)} MAD</button>`
        : `<button class="bl-btn primary" data-bl-remettre="${c.id}"><i data-lucide="gift"></i>Remettre à ${esc(firstName(c.name))}</button>`;
    return `<div class="bl-ccard ${today ? 'is-today' : ''}">
      <div class="bl-cc-top">
        <span class="bl-cc-art">${ART.cake}</span>
        <div class="bl-cc-mid">
          <div class="bl-cc-who"><span class="num">${c.id}</span>${esc(c.name)}<span class="tel">${esc(c.phone)}</span></div>
          <div class="bl-script">« ${esc(c.inscription || 'sans inscription')} »</div>
          <div class="bl-cc-meta">
            <span class="bl-pill">${esc(OCC[c.occasion] || 'Autre')}</span>
            <span class="bl-pill">${esc(PART[c.parts].label)} · ${esc(c.parfum)}</span>
            ${cakeStatusPill(c)}
            ${cakePayPill(c)}
            ${c.notified ? '<span class="bl-pill wa"><i data-lucide="check-check"></i>Notifié</span>' : ''}
          </div>
        </div>
        <div class="bl-when ${today ? 'today' : ''}"><span>${esc(whenLabel(c.retrait))}</span><b>${hhmm(c.retrait)}</b></div>
      </div>
      <div class="bl-cc-actions">
        <button class="bl-btn secondary" data-bl-cake="${c.id}"><i data-lucide="search"></i>Détail</button>
        ${c.status === 'pret' ? `<button class="bl-btn secondary" data-bl-wa="${c.id}"><i data-lucide="message-circle"></i>${c.notified ? 'Re-notifier' : 'WhatsApp « prêt »'}</button>` : ''}
        ${primary}
      </div>
    </div>`;
  }

  function renderCakes() {
    const panel = $('[data-bl-panel="gateaux"]', root);
    const open = CAKES.filter((c) => c.status !== 'remis').sort((a, b) => a.retrait - b.retrait);
    const remisToday = CAKES.filter((c) => c.status === 'remis' && c.remisAt && isToday(c.remisAt));
    const todayCt = open.filter((c) => isToday(c.retrait)).length;
    panel.innerHTML = `
      <div class="bl-cakes">
        <header class="bl-head">
          <div><h1>Gâteaux sur commande</h1>
          <div class="bl-head-sub">${todayCt ? `${todayCt} retrait${todayCt > 1 ? 's' : ''} aujourd'hui · ` : ''}${open.length} commande${open.length > 1 ? 's' : ''} au carnet, l'inscription s'écrit à la commande, pas au feutre</div></div>
          <button class="bl-btn primary" id="bl-cake-new" style="flex:0 0 auto;"><i data-lucide="plus"></i>Nouvelle commande</button>
        </header>
        <div class="bl-cakes-scroll">
          <div class="bl-cakes-list">
            ${open.map(cakeCard).join('') || '<div class="bl-foot-note">Carnet vide, prenez la première commande du jour.</div>'}
            ${remisToday.length ? `<div class="bl-remis-note"><i data-lucide="check-circle-2"></i>${remisToday.length} gâteau${remisToday.length > 1 ? 'x' : ''} remis aujourd'hui, ${remisToday.map((c) => esc(firstName(c.name))).join(', ')}</div>` : ''}
          </div>
        </div>
      </div>`;
    $('#bl-cake-new', panel).onclick = openCakeForm;
    panel.onclick = (e) => {
      const d = e.target.closest('[data-bl-cake]');
      if (d) { openCakeDetail(d.dataset.blCake); return; }
      const pr = e.target.closest('[data-bl-pret]');
      if (pr) { markCakePret(pr.dataset.blPret); return; }
      const wa = e.target.closest('[data-bl-wa]');
      if (wa) { openWa(findCake(wa.dataset.blWa)); return; }
      const so = e.target.closest('[data-bl-solde]');
      if (so) { settleCake(findCake(so.dataset.blSolde)); return; }
      const re = e.target.closest('[data-bl-remettre]');
      if (re) deliverCake(re.dataset.blRemettre);
    };
    icons();
  }

  function markCakePret(id) {
    const c = findCake(id);
    if (!c || c.status !== 'encours') return;
    c.status = 'pret';
    queueIfOffline(`Gâteau ${c.id} prêt`);
    toast(`${c.id}, gâteau prêt, on prévient ${firstName(c.name)} ?`);
    refreshOps();
    if (!c.notified) setTimeout(() => openWa(c), 450);
  }

  function settleCake(c, after) {
    const due = cakeDue(c);
    if (due <= 0) { toast(`${c.id}, déjà réglé, il ne reste qu'à le remettre`); return; }
    payChoice({
      title: 'Encaisser le solde',
      sub: `${c.id} · ${esc(c.name)}, acompte ${fmtMAD(c.paid)} déjà versé`,
      amount: due,
      onPaid: (method, rendu) => {
        c.paid += due;
        state.day[method === 'carte' ? 'carte' : 'especes'] += due;
        state.day.gateaux += due;
        postDay(due, method, `Solde gâteau · ${c.name}`, c.id);
        closeVeil('#bl-pay-veil');
        queueIfOffline(`Solde ${c.id}`);
        toast(`Solde encaissé, ${fmtMAD(due)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        refreshOps();
        if (typeof after === 'function') after();
      },
    });
  }

  function deliverCake(id) {
    const c = findCake(id);
    if (!c) return;
    if (cakeDue(c) > 0) { settleCake(c); return; }
    c.status = 'remis';
    c.remisAt = new Date();
    closeVeil('#bl-detail-veil');
    queueIfOffline(`Retrait ${c.id}`);
    toast(`${c.id} remis à ${c.name}, mabrouk!`);
    refreshOps();
  }

  /* ---------- cake stage (l'inscription se lit sur le gâteau) ---------- */
  function cakeStage(text) {
    const t = (text || '').trim();
    const cls = !t ? 'is-empty' : t.length > 24 ? 'is-long' : '';
    return `<div class="bl-cake-stage">${ART.cake}
      <div class="bl-cake-script ${cls}" id="bl-cake-script">${t ? esc(t) : 'Inscription sur le gâteau…'}</div>
    </div>`;
  }

  /* ---------- détail ---------- */
  function openCakeDetail(id) {
    const c = findCake(id);
    if (!c) return;
    const el = $('#bl-detailm', root);
    const due = cakeDue(c);
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${c.id} · ${esc(firstName(c.name))}</h3>
      <p class="modal-subtle">${esc(OCC[c.occasion] || 'Autre')}, retrait ${esc(fmtWhen(c.retrait))}</p>
      ${cakeStage(c.inscription)}
      <div class="bl-dt-rows">
        <div class="bl-dt-row"><span>Client</span><b>${esc(c.name)} · <span style="font-family:var(--mono);font-size:11px;">${esc(c.phone)}</span></b></div>
        <div class="bl-dt-row"><span>Gâteau</span><b>${esc(PART[c.parts].label)} · ${esc(c.parfum)}</b></div>
        <div class="bl-dt-row"><span>Inscription</span><b>${esc(c.inscription || '—')}</b></div>
        <div class="bl-dt-row"><span>Prix</span><b class="mono">${fmtMAD(c.price)}</b></div>
        <div class="bl-dt-row"><span>Acompte versé</span><b class="mono">${fmtMAD(c.paid)}</b></div>
        <div class="bl-dt-row"><span>Solde au retrait</span><b class="mono ${due > 0 ? 'due' : ''}">${due > 0 ? fmtMAD(due) : 'réglé'}</b></div>
      </div>
      <div class="bl-sheet-foot" style="flex-wrap:wrap;">
        <button class="bl-btn ghost" id="bl-dt-print" style="flex:1 1 auto;"><i data-lucide="printer"></i>Bon de commande</button>
        ${c.status === 'encours' ? '<button class="bl-btn primary" id="bl-dt-pret" style="flex:1 1 auto;"><i data-lucide="check"></i>Gâteau prêt</button>' : ''}
        ${c.status === 'pret' ? `<button class="bl-btn secondary" id="bl-dt-wa" style="flex:1 1 auto;"><i data-lucide="message-circle"></i>${c.notified ? 'Re-notifier' : 'WhatsApp « prêt »'}</button>` : ''}
        ${c.status === 'pret' && due > 0 ? `<button class="bl-btn primary" id="bl-dt-solde" style="flex:1 1 auto;"><i data-lucide="banknote"></i>Solde · ${fmtN(due)} MAD</button>` : ''}
        ${c.status === 'pret' && due <= 0 ? '<button class="bl-btn primary" id="bl-dt-remettre" style="flex:1 1 auto;"><i data-lucide="gift"></i>Remettre au client</button>' : ''}
      </div>`;
    openVeil('#bl-detail-veil');
    icons();
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-detail-veil'); });
    $('#bl-dt-print', el).onclick = () => toast(`Bon de commande ${c.id} envoyé à l'imprimante (80 mm)`);
    const pret = $('#bl-dt-pret', el);
    if (pret) pret.onclick = () => { closeVeil('#bl-detail-veil'); markCakePret(c.id); };
    const wa = $('#bl-dt-wa', el);
    if (wa) wa.onclick = () => openWa(c);
    const solde = $('#bl-dt-solde', el);
    if (solde) solde.onclick = () => {
      closeVeil('#bl-detail-veil');
      settleCake(c, () => openCakeDetail(c.id));
    };
    const rem = $('#bl-dt-remettre', el);
    if (rem) rem.onclick = () => deliverCake(c.id);
  }

  /* ---------- nouvelle commande ---------- */
  function openCakeForm() {
    const form = {
      occasion: 'anniv', inscription: '', parts: 'p12', parfum: PARFUMS[0],
      retrait: dayAt(1, 12, 0), name: '', phone: '',
    };
    const el = $('#bl-cakemm', root);
    const dateOpts = [
      { label: 'Demain · 12:00', sub: 'standard', d: dayAt(1, 12, 0) },
      { label: `${fmtDay(dayAt(2, 16, 0))} · 16:00`, sub: 'après-demain', d: dayAt(2, 16, 0) },
      { label: `${fmtDay(dayAt(3, 12, 0))} · 12:00`, sub: 'dans 3 jours', d: dayAt(3, 12, 0) },
    ];
    const localDT = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Commande gâteau</h3>
      <p class="modal-subtle">L'inscription s'écrit ici et se lit sur le gâteau, zéro malentendu au retrait.</p>
      ${cakeStage('')}
      <div class="bl-f">
        <div class="bl-f-lbl">Inscription <span class="opt">· telle qu'elle sera écrite à la poche</span></div>
        <input class="bl-in" id="bl-ck-insc" maxlength="48" placeholder="Ex. « 3id milad sa3id Yasmine »" />
      </div>
      <div class="bl-f">
        <div class="bl-f-lbl">Occasion</div>
        <div class="bl-chips" id="bl-ck-occ">
          ${OCCASIONS.map((o) => `<button class="bl-chip ${o.id === form.occasion ? 'on' : ''}" data-bl-occ="${o.id}">${esc(o.label)}</button>`).join('')}
        </div>
      </div>
      <div class="bl-f">
        <div class="bl-f-lbl">Taille</div>
        <div class="bl-seg" data-lens-demo id="bl-ck-parts">
          ${PARTS.map((p) => `<button class="bl-seg-it ${p.id === form.parts ? 'on' : ''}" data-lens-item data-bl-part="${p.id}">${esc(p.label)}<small>${fmtN(p.price)} MAD</small></button>`).join('')}
        </div>
      </div>
      <div class="bl-f">
        <div class="bl-f-lbl">Parfum</div>
        <div class="bl-chips" id="bl-ck-parf">
          ${PARFUMS.map((p) => `<button class="bl-chip ${p === form.parfum ? 'on' : ''}" data-bl-parf="${esc(p)}">${esc(p)}</button>`).join('')}
        </div>
      </div>
      <div class="bl-f">
        <div class="bl-f-lbl">Retrait</div>
        <div class="bl-date-chips" id="bl-ck-dates">
          ${dateOpts.map((o, i) => `<button class="bl-date-chip ${Math.abs(o.d - form.retrait) < 60000 ? 'on' : ''}" data-bl-d="${i}"><b>${esc(o.label)}</b><span>${esc(o.sub)}</span></button>`).join('')}
        </div>
        <div class="bl-date-custom">
          <input class="bl-in" id="bl-ck-dt" type="datetime-local" value="${localDT(form.retrait)}" />
        </div>
      </div>
      <div class="bl-row-2">
        <div class="bl-f">
          <div class="bl-f-lbl">Client</div>
          <input class="bl-in" id="bl-ck-name" placeholder="Nom et prénom" />
        </div>
        <div class="bl-f">
          <div class="bl-f-lbl">Téléphone <span class="opt">· pour le WhatsApp « prêt »</span></div>
          <input class="bl-in" id="bl-ck-tel" inputmode="tel" placeholder="06…" />
        </div>
      </div>
      <div class="bl-sheet-foot">
        <button class="bl-btn secondary" data-bl-close>Annuler</button>
        <button class="bl-btn primary" id="bl-ck-save"><i data-lucide="check"></i>Enregistrer · <span id="bl-ck-price">${fmtMAD(PART[form.parts].price)}</span></button>
      </div>`;
    openVeil('#bl-cake-veil');
    icons(); lens();

    const script = () => {
      const node = $('#bl-cake-script', el);
      const t = form.inscription.trim();
      node.textContent = t || 'Inscription sur le gâteau…';
      node.classList.toggle('is-empty', !t);
      node.classList.toggle('is-long', t.length > 24);
    };
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-cake-veil'); });
    $('#bl-ck-insc', el).oninput = (e) => { form.inscription = e.target.value; script(); };
    $('#bl-ck-occ', el).onclick = (e) => {
      const b = e.target.closest('[data-bl-occ]');
      if (!b) return;
      form.occasion = b.dataset.blOcc;
      $$('[data-bl-occ]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#bl-ck-parts', el).onclick = (e) => {
      const b = e.target.closest('[data-bl-part]');
      if (!b) return;
      form.parts = b.dataset.blPart;
      $$('[data-bl-part]', el).forEach((x) => x.classList.toggle('on', x === b));
      $('#bl-ck-price', el).textContent = fmtMAD(PART[form.parts].price);
    };
    $('#bl-ck-parf', el).onclick = (e) => {
      const b = e.target.closest('[data-bl-parf]');
      if (!b) return;
      form.parfum = b.dataset.blParf;
      $$('[data-bl-parf]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#bl-ck-dates', el).onclick = (e) => {
      const b = e.target.closest('[data-bl-d]');
      if (!b) return;
      form.retrait = dateOpts[+b.dataset.blD].d;
      $('#bl-ck-dt', el).value = localDT(form.retrait);
      $$('[data-bl-d]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#bl-ck-dt', el).onchange = (e) => {
      if (!e.target.value) return;
      form.retrait = new Date(e.target.value);
      $$('[data-bl-d]', el).forEach((x) => x.classList.remove('on'));
    };
    $('#bl-ck-name', el).oninput = (e) => { form.name = e.target.value; };
    $('#bl-ck-tel', el).oninput = (e) => { form.phone = e.target.value; };
    $('#bl-ck-save', el).onclick = () => {
      if (!form.name.trim()) { toast('Le nom du client est requis, le gâteau porte un nom'); return; }
      if (form.retrait.getTime() < Date.now()) { toast('La date de retrait est déjà passée, choisissez un créneau à venir'); return; }
      const cake = {
        id: `G-${cakeSeq++}`,
        name: form.name.trim(), phone: form.phone.trim(),
        occasion: form.occasion, inscription: form.inscription.trim(),
        parts: form.parts, parfum: form.parfum,
        price: PART[form.parts].price, paid: 0,
        retrait: form.retrait, status: 'encours', notified: false,
      };
      CAKES.push(cake);
      closeVeil('#bl-cake-veil');
      queueIfOffline(`Commande ${cake.id}`);
      toast(`${cake.id} enregistrée, retrait ${fmtWhen(cake.retrait)}`);
      refreshOps();
      setTimeout(() => openAcompte(cake), 300);
    };
  }

  /* ---------- acompte à la commande ---------- */
  function openAcompte(cake) {
    const el = $('#bl-paym', root);
    let acompte = Math.min(cake.price, Math.max(50, Math.round(cake.price * 0.4 / 10) * 10));
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Acompte, ${cake.id}</h3>
      <p class="modal-subtle">${esc(cake.name)} · total ${fmtMAD(cake.price)}, l'acompte sécurise la commande</p>
      <div class="modal-amount size-md" id="bl-ac-val">${fmtMAD(acompte)}</div>
      <div class="bl-ac-row">
        <button class="cash-preset" data-bl-ac="100">100</button>
        <button class="cash-preset" data-bl-ac="150">150</button>
        <button class="cash-preset" data-bl-ac="200">200</button>
        <button class="cash-preset" data-bl-ac="half">50 %</button>
      </div>
      <div class="cash-input-row" style="margin:10px 0 14px;">
        <label class="cash-input-label" for="bl-ac-in">Montant de l'acompte</label>
        <input class="cash-input mono" id="bl-ac-in" type="number" inputmode="numeric" min="0" max="${cake.price}" step="10" value="${acompte}" />
      </div>
      <div class="bl-pay-opts">
        <button class="bl-pay-opt" data-bl-acm="especes">
          <span class="ic"><i data-lucide="banknote"></i></span>
          <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
        </button>
        <button class="bl-pay-opt" data-bl-acm="carte">
          <span class="ic"><i data-lucide="credit-card"></i></span>
          <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
        </button>
      </div>
      <div class="bl-sheet-foot">
        <button class="bl-btn ghost" id="bl-ac-skip" style="flex:1;">Sans acompte, tout au retrait</button>
      </div>`;
    icons();
    openVeil('#bl-pay-veil');
    const refresh = () => { $('#bl-ac-val', el).textContent = fmtMAD(acompte); $('#bl-ac-in', el).value = acompte; };
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-pay-veil'); });
    $$('[data-bl-ac]', el).forEach((b) => {
      b.onclick = () => {
        acompte = b.dataset.blAc === 'half' ? Math.round(cake.price / 2 / 5) * 5 : Math.min(cake.price, +b.dataset.blAc);
        refresh();
      };
    });
    $('#bl-ac-in', el).oninput = (e) => {
      acompte = Math.max(0, Math.min(cake.price, parseFloat(e.target.value) || 0));
      $('#bl-ac-val', el).textContent = fmtMAD(acompte);
    };
    $('#bl-ac-skip', el).onclick = () => {
      closeVeil('#bl-pay-veil');
      toast(`${cake.id}, solde ${fmtMAD(cake.price)} à encaisser au retrait`);
      refreshOps();
    };
    const record = (method, rendu) => {
      cake.paid += acompte;
      state.day[method === 'carte' ? 'carte' : 'especes'] += acompte;
      state.day.gateaux += acompte;
      postDay(acompte, method, `Acompte gâteau · ${cake.name}`, cake.id);
      closeVeil('#bl-pay-veil');
      queueIfOffline(`Acompte ${cake.id}`);
      toast(`Acompte ${fmtMAD(acompte)} encaissé, solde ${fmtMAD(cakeDue(cake))} au retrait${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      refreshOps();
    };
    $$('[data-bl-acm]', el).forEach((b) => {
      b.onclick = () => {
        if (acompte <= 0) { toast("Saisissez un montant d'acompte, ou « sans acompte »"); return; }
        const args = {
          title: `${b.dataset.blAcm === 'carte' ? 'Carte' : 'Espèces'} · acompte ${fmtMAD(acompte)}`,
          sub: `${cake.id} · ${esc(cake.name)}`,
          amount: acompte,
          onPaid: record,
        };
        b.dataset.blAcm === 'carte' ? payCard(args) : payCash(args);
      };
    });
  }

  /* ---------- WhatsApp « votre gâteau est prêt » ---------- */
  function waMessage(c) {
    const due = cakeDue(c);
    return `Sba7 lkhir ${firstName(c.name)}, votre gâteau « ${c.inscription || OCC[c.occasion]} » est prêt chez ${pvName('Boulangerie Bab Kasbah') || 'la boulangerie'}.`
      + `\nRetrait ${fmtWhen(c.retrait)}, on vous le garde au frais.`
      + (due > 0 ? `\nSolde à régler au retrait : ${fmtN(due)} MAD.` : '')
      + '\n— envoyé via Kiwi';
  }

  function openWa(c) {
    if (!c) return;
    const el = $('#bl-wam', root);
    let withPhoto = true;
    el.innerHTML = `
      <button class="bl-modal-x" data-bl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, votre gâteau est prêt</h3>
      <p class="modal-subtle">${esc(c.name)} ${c.phone ? `· ${esc(c.phone)}` : '· numéro manquant'}</p>
      <div class="bl-wa-bubblewrap">
        <div class="bl-wa-bubble">
          <textarea id="bl-wa-text">${esc(waMessage(c))}</textarea>
          <div class="bl-wa-meta">${hhmm(new Date())} ✓✓</div>
        </div>
      </div>
      <button class="bl-wa-photo on" id="bl-wa-photo">
        <span class="th">${ART.cake}</span>
        <span class="l">Joindre la photo du gâteau fini, le client voit l'inscription avant de se déplacer</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="bl-sheet-foot">
        <button class="bl-btn ghost" data-bl-close>Plus tard</button>
        <button class="bl-btn primary" id="bl-wa-send" ${c.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#bl-wa-veil');
    icons();
    $$('[data-bl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bl-wa-veil'); });
    $('#bl-wa-photo', el).onclick = () => {
      withPhoto = !withPhoto;
      $('#bl-wa-photo', el).classList.toggle('on', withPhoto);
    };
    /* Ce bouton disait « WhatsApp envoyé » et marquait la commande prévenue,
       sans qu'aucun message ne parte : la cliente n'était jamais avertie que son
       gâteau était prêt. Une page web ne peut pas envoyer un WhatsApp toute
       seule, on ouvre donc le brouillon pré-rempli (texte tel qu'édité) et c'est
       la boulangère qui appuie sur envoyer. La photo n'est pas jointe par le
       lien, on le dit au lieu de le prétendre. */
    $('#bl-wa-send', el).onclick = () => {
      const txt = $('#bl-wa-text', el);
      const body = txt ? txt.value : waMessage(c);
      const num = String(c.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Pas de numéro pour ${c.name}, ajoutez-le à la commande`); return; }
      c.notified = true;
      closeVeil('#bl-wa-veil');
      queueIfOffline(`WhatsApp ${c.id}`);
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${c.name}, appuyez sur envoyer${withPhoto ? ' · joignez la photo du gâteau dans WhatsApp' : ''}`);
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      refreshOps();
    };
  }

  /* ═══════════════════════ FIN DE JOURNÉE ═══════════════════════ */
  function invCount(p) {
    const v = state.invAdjust[p.id];
    return v == null ? p.stock : Math.min(v, p.stock);
  }

  function renderJour() {
    const panel = $('[data-bl-panel="jour"]', root);
    const total = state.day.especes + state.day.carte;
    const panier = state.day.tickets ? total / state.day.tickets : 0;
    const tops = CATALOG.flatMap((c) => c.items).slice().sort((a, b) => b.sold - a.sold).slice(0, 4);
    const maxSold = tops[0] ? tops[0].sold : 1;
    const invProds = CATALOG.flatMap((c) => c.items).filter((p) => p.stock > 0);
    const invTotal = invProds.reduce((s, p) => s + invCount(p), 0);

    panel.innerHTML = `
      <div class="bl-day">
        <div class="bl-day-inner">
          <header class="bl-head" style="padding:22px 0 0;">
            <div><h1>Fin de journée</h1>
            <div class="bl-head-sub">Recette, dernière heure, invendus, la journée se ferme proprement</div></div>
          </header>
          <div class="bl-dgrid">
            <div class="bl-dcard">
              <div class="bl-dcard-title"><i data-lucide="hand-coins"></i>Recette du jour</div>
              <div class="bl-recette-big">${fmtMAD(total)}</div>
              <div class="bl-recette-rows">
                <div class="bl-recette-row"><span>Espèces</span><b>${fmtMAD(state.day.especes)}</b></div>
                <div class="bl-recette-row"><span>Carte, lecteur partenaire</span><b>${fmtMAD(state.day.carte)}</b></div>
                ${state.day.gateaux ? `<div class="bl-recette-row"><span>dont gâteaux (acomptes &amp; soldes)</span><b>${fmtMAD(state.day.gateaux)}</b></div>` : ''}
                <div class="bl-recette-row"><span>Tickets</span><b>${state.day.tickets}</b></div>
                <div class="bl-recette-row"><span>Panier moyen</span><b>${fmtMAD(panier)}</b></div>
                ${state.don ? `<div class="bl-recette-row"><span>Don du soir</span><b>${state.don.pieces} pièces · ${esc(state.don.assoc)}</b></div>` : ''}
              </div>
            </div>
            <div class="bl-dcard">
              <div class="bl-dcard-title"><i data-lucide="wheat"></i>Meilleures ventes <span class="opt">pièces vendues</span></div>
              ${tops.map((p) => `
                <div class="bl-top-row">
                  <span class="bl-top-art">${ART[p.id] || ''}</span>
                  <span class="bl-top-name">${esc(p.label)}</span>
                  <span class="bl-top-bar"><i style="width:${Math.round((p.sold / maxSold) * 100)}%"></i></span>
                  <span class="bl-top-ct">${p.sold}</span>
                </div>`).join('')}
            </div>
          </div>

          <div class="bl-dcard">
            <div class="bl-lhrow">
              <span class="bl-top-art"><i data-lucide="percent"></i></span>
              <span class="l"><b>Dernière heure · −50 %</b><span>Tout le comptoir à moitié prix avant la fermeture, mieux vendu que jeté.</span></span>
              <button class="bl-switch ${state.lastHour ? 'on' : ''}" id="bl-lh-switch" role="switch" aria-checked="${state.lastHour}" aria-label="Dernière heure moins cinquante pour cent"></button>
            </div>
          </div>

          <div class="bl-dcard">
            <div class="bl-dcard-title"><i data-lucide="gift"></i>Invendus &amp; don du soir <span class="opt">comptés sur le restant</span></div>
            ${state.don ? `
              <div class="bl-don-done" style="margin-top:12px;">
                <i data-lucide="check-circle-2"></i>
                <div><b>${state.don.pieces} pièces</b> données à <b>${esc(state.don.assoc)}</b> à ${hhmm(state.don.at)}.${state.don.note ? `<br>Note : ${esc(state.don.note)}` : ''}<br>Rien ne se jette, sadaqa du soir enregistrée.</div>
              </div>
              <div class="bl-sheet-foot"><button class="bl-btn ghost" id="bl-don-redo" style="flex:1;">Refaire un comptage</button></div>` : `
              ${invProds.length ? invProds.map((p) => `
                <div class="bl-inv-row">
                  <span class="bl-top-art">${ART[p.id] || ''}</span>
                  <span class="bl-inv-name">${esc(p.label)}<span>restant ${p.stock}</span></span>
                  <span class="bl-inv-step">
                    <button data-bl-inv-minus="${p.id}" aria-label="Moins">−</button>
                    <b>${invCount(p)}</b>
                    <button data-bl-inv-plus="${p.id}" aria-label="Plus">+</button>
                  </span>
                </div>`).join('') : '<div class="bl-foot-note" style="margin:14px 0;">Plus rien en boutique, tout est vendu, sa7a!</div>'}
              <div class="bl-don-sec">
                <div class="bl-f-lbl">Association <span class="opt">· le don part ce soir</span></div>
                <div class="bl-chips" id="bl-assocs">
                  ${ASSOCS.map((a) => `<button class="bl-chip ${state.donForm.assoc === a ? 'on' : ''}" data-bl-assoc="${esc(a)}">${esc(a)}</button>`).join('')}
                </div>
                <div class="bl-f" style="margin:10px 0 0;">
                  <input class="bl-in" id="bl-don-note" placeholder="Note (ex. « livraison 20h30 par Hamza »)…" value="${esc(state.donForm.note)}" />
                </div>
                <div class="bl-sheet-foot">
                  <button class="bl-btn primary" id="bl-don-ok" style="flex:1;"><i data-lucide="gift"></i>Confirmer le don · ${invTotal} pièce${invTotal > 1 ? 's' : ''}</button>
                </div>
              </div>`}
          </div>
          <div class="bl-foot-note">Clôture Z à la fermeture, le détail complet vit dans le dashboard Kiwi.</div>
        </div>
      </div>`;

    $('#bl-lh-switch', panel).onclick = () => {
      state.lastHour = !state.lastHour;
      toast(state.lastHour
        ? 'Dernière heure, tout le comptoir passe à −50 %'
        : 'Prix normaux rétablis sur le comptoir');
      renderJour(); renderGrid(); renderTicket(); icons();
    };
    panel.onclick = (e) => {
      const minus = e.target.closest('[data-bl-inv-minus]');
      const plus = e.target.closest('[data-bl-inv-plus]');
      if (minus || plus) {
        const id = (minus || plus).dataset.blInvMinus || (minus || plus).dataset.blInvPlus;
        const p = PROD[id];
        const cur = invCount(p);
        if (plus && cur >= p.stock) { toast(`${p.label}, il n'en reste que ${p.stock} en boutique`); return; }
        state.invAdjust[id] = Math.max(0, cur + (plus ? 1 : -1));
        renderJour(); icons();
        return;
      }
      const ass = e.target.closest('[data-bl-assoc]');
      if (ass) {
        state.donForm.assoc = state.donForm.assoc === ass.dataset.blAssoc ? null : ass.dataset.blAssoc;
        renderJour(); icons();
        return;
      }
      const redo = e.target.closest('#bl-don-redo');
      if (redo) { state.don = null; state.invAdjust = {}; renderJour(); icons(); return; }
      const ok = e.target.closest('#bl-don-ok');
      if (ok) confirmDon();
    };
    const note = $('#bl-don-note', panel);
    if (note) note.oninput = (e) => { state.donForm.note = e.target.value; };
    icons();
  }

  function confirmDon() {
    const invProds = CATALOG.flatMap((c) => c.items).filter((p) => p.stock > 0);
    const total = invProds.reduce((s, p) => s + invCount(p), 0);
    if (!total) { toast('Aucune pièce comptée, rien à donner ce soir'); return; }
    if (!state.donForm.assoc) { toast('Choisissez une association pour le don'); return; }
    invProds.forEach((p) => { p.stock = Math.max(0, p.stock - invCount(p)); });
    state.don = { assoc: state.donForm.assoc, note: state.donForm.note.trim(), pieces: total, at: new Date() };
    state.invAdjust = {};
    queueIfOffline('Don du soir');
    toast(`${total} pièces pour ${state.don.assoc}, l'lah ijazikom`);
    refreshOps();
  }

  /* ═══════════════════════ OFFLINE (file d'attente simulée) ═══════════════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline && state.queued) {
      toast(`Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`);
      state.queued = 0;
    } else if (state.offline) {
      toast('Mode hors-ligne, la caisse continue, tout est mis en file');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#bl-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.bl-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.bl-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'bl-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#bl-offline-note', root);
    note.hidden = !state.offline;
    $('#bl-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  if (!window.KiwiPosDispatch) return;
  window.KiwiPosDispatch.register({
    id: 'boulangerie',
    greet: {
      line1: pvReal() ? 'Sba7 lkhir,' : 'Sba7 lkhir Abdelkader,',
      em: 'marhba.',
      sub: 'Boulangerie Bab Kasbah <em>·</em> fournée du matin sortie, le msemen est au four',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) renderAll(); },
  });
})();
