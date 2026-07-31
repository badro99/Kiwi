/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · HÔTEL / RIAD MODE — Riad Yasmina front-desk terminal (PIN 0004)
 * ---------------------------------------------------------------------------
 * Registered on window.KiwiPosDispatch (assets/pos-dispatch.js). The
 * dispatcher owns the PIN choreography and the root <div id="pos-hotel">;
 * this module builds the whole app inside it on mount().
 *
 * A front-desk terminal, not a shop till. The headline differentiator is the
 * FOLIO — one running bill per stay where everything lands: nuitées posted
 * automatically, extras (minibar, hammam, dîner riad, transfert, lessive)
 * added from a visual quick-grid, and the taxe de séjour (TPT 27 MAD / nuit /
 * adulte) computed as its own line, always. Check-in scans the passport and
 * pre-fills the fiche de police; check-out settles the folio (carte via
 * lecteur partenaire, espèces, ou déjà payé en ligne), prints the facture and
 * flips the room to ménage. V1 = operational layer only — card payments just
 * send the amount to the partner reader.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD  = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons   = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const DAYS    = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS  = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2    = (n) => String(n).padStart(2, '0');

  /* Real / paired-store identity. On a real store (hosted OR paired to a venue)
   * the demo name/address/phone ("Riad Yasmina", "7 Rue de la Kasbah…") must
   * NEVER print or render. Local demo (unpaired localhost) keeps the demo. */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }
  const fmtDay  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const nowHM   = () => { const d = new Date(); return `${pad2(d.getHours())}h${pad2(d.getMinutes())}`; };
  const fmtDT   = (d) => `${fmtDay(d)} · ${pad2(d.getHours())}h${pad2(d.getMinutes())}`;
  const DAY_MS  = 24 * 3600 * 1000;

  function toast(msg, ms) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2300);
    setTimeout(() => el.remove(), (ms || 2300) + 280);
  }

  /* Deterministic pseudo-barcode (same recipe as the pressing). */
  function barcode(seed, h) {
    h = h || 26;
    let bars = '', x = 0, s = 7;
    const len = Math.max(seed.length * 4, 26);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + seed.charCodeAt(i % seed.length) + i * 11) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── line-art (riad voice) ─────────────────────────
     Forest strokes, mint-tint fills, 64×64 grid — same voice as the pressing
     garments. These ARE the charge menu and the folio line markers. */
  const art = (inner) => `<svg class="ht-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    /* lit — nuitées */
    nuitee: art(`<path class="fill" d="M10 34h44a4 4 0 0 1 4 4v10H6V38a4 4 0 0 1 4-4z"/><path d="M10 34h44a4 4 0 0 1 4 4v10H6V38a4 4 0 0 1 4-4z"/><path d="M10 34V20a4 4 0 0 1 4-4h36a4 4 0 0 1 4 4v14"/><path class="fill" d="M14 28h16a4 4 0 0 1 4 4v2H12v-4a2 2 0 0 1 2-2z"/><path d="M14 28h16a4 4 0 0 1 4 4v2"/><path class="thin" d="M6 44h52"/><path d="M8 48v6M56 48v6"/>`),
    /* porte de riad — arche fer à cheval */
    porte: art(`<path class="fill" d="M18 54V28c0-10 6-16 14-16s14 6 14 16v26z"/><path d="M18 54V28c0-10 6-16 14-16s14 6 14 16v26"/><path class="thin" d="M23 54V29c0-7 4-12 9-12s9 5 9 12v25"/><path d="M12 54h40"/><circle class="thin" cx="36.5" cy="38" r="1.2"/><path class="thin" d="M32 17v37"/>`),
    /* minibar — petit frigo + bouteille */
    minibar: art(`<rect class="fill" x="14" y="12" width="26" height="40" rx="4"/><rect x="14" y="12" width="26" height="40" rx="4"/><path d="M14 26h26"/><path class="thin" d="M19 18v4M19 32v7"/><path class="fill" d="M47 30v-6c0-2 1-3 2.5-3s2.5 1 2.5 3v6c2 1.5 3 3.5 3 6v13a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V36c0-2.5 1-4.5 3-6z"/><path d="M47 30v-6c0-2 1-3 2.5-3s2.5 1 2.5 3v6c2 1.5 3 3.5 3 6v13a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V36c0-2.5 1-4.5 3-6z"/><path class="thin" d="M44 40h11"/>`),
    /* hammam — seau + vapeur */
    hammam: art(`<path class="thin" d="M20 8c-2 3 2 5 0 8M30 6c-2 3 2 5 0 8M40 8c-2 3 2 5 0 8"/><path class="fill" d="M14 26h32l-3 24a4 4 0 0 1-4 3.5H21a4 4 0 0 1-4-3.5z"/><path d="M14 26h32l-3 24a4 4 0 0 1-4 3.5H21a4 4 0 0 1-4-3.5z"/><path d="M12 26h36"/><path class="thin" d="M20 33c6 3 14 3 20 0"/><path d="M46 30c5 0 8 2 8 5s-2 5-6 5"/>`),
    /* dîner riad — tajine */
    diner: art(`<path class="thin" d="M28 6c-1.5 2.5 1.5 4 0 6.5M36 6c-1.5 2.5 1.5 4 0 6.5"/><path class="fill" d="M32 16c-10 0-17 8-18 22h36c-1-14-8-22-18-22z"/><path d="M32 16c-10 0-17 8-18 22h36c-1-14-8-22-18-22z"/><circle cx="32" cy="14" r="2.4"/><path class="fill" d="M10 38h44c2 0 3 1.4 3 3 0 3-3 6-8 6H15c-5 0-8-3-8-6 0-1.6 1-3 3-3z"/><path d="M10 38h44c2 0 3 1.4 3 3 0 3-3 6-8 6H15c-5 0-8-3-8-6 0-1.6 1-3 3-3z"/><path class="thin" d="M24 26c2-3 5-5 8-5"/>`),
    /* transfert aéroport — voiture */
    transfert: art(`<path class="fill" d="M10 38c0-2 1-4 3-4l4-9a5 5 0 0 1 4.6-3h21a5 5 0 0 1 4.6 3l4 9c2 0 3 2 3 4v7a2 2 0 0 1-2 2h-3a6 6 0 0 0-12 0H27a6 6 0 0 0-12 0h-3a2 2 0 0 1-2-2z"/><path d="M10 38c0-2 1-4 3-4l4-9a5 5 0 0 1 4.6-3h21a5 5 0 0 1 4.6 3l4 9c2 0 3 2 3 4v7a2 2 0 0 1-2 2h-3M27 47H15M39 47h-2"/><circle cx="21" cy="47" r="5"/><circle cx="43" cy="47" r="5"/><path d="M17 34h30M32 25v9"/><path class="thin" d="M50 10l6-4M52 14l8-1"/>`),
    /* lessive — panière + chemise pliée */
    lessive: art(`<path class="fill" d="M12 30h40l-4 22a4 4 0 0 1-4 3H20a4 4 0 0 1-4-3z"/><path d="M12 30h40l-4 22a4 4 0 0 1-4 3H20a4 4 0 0 1-4-3z"/><path class="thin" d="M19 36l2 14M32 36v14M45 36l-2 14"/><path class="fill" d="M20 22h24v8H20z"/><path d="M20 22h24v8H20z"/><path class="thin" d="M20 26h24M28 22v4M36 22v4"/>`),
    /* thé à la menthe — théière + verre */
    the: art(`<path class="fill" d="M18 30c0-5 5-9 12-9s12 4 12 9c0 3-1 6-2 8l2 8c0 3-5 6-12 6s-12-3-12-6l2-8c-1-2-2-5-2-8z"/><path d="M18 30c0-5 5-9 12-9s12 4 12 9c0 3-1 6-2 8l2 8c0 3-5 6-12 6s-12-3-12-6l2-8c-1-2-2-5-2-8z"/><path d="M30 21v-4c0-2 1.5-3 3-2"/><circle class="thin" cx="30" cy="14" r="1.4"/><path d="M18 32c-5-1-8 1-8 4 0 2.5 2.5 4 6 4"/><path d="M42 30c5 0 7 3 6 7l-3 7"/><path class="fill" d="M52 42h7l-1.5 12h-4z"/><path d="M52 42h7l-1.5 12h-4z"/><path class="thin" d="M22 38c5 2.5 11 2.5 16 0"/>`),
    /* taxe de séjour — document timbré */
    taxe: art(`<path class="fill" d="M16 8h24l8 8v40H16z"/><path d="M16 8h24l8 8v40H16z"/><path d="M40 8v8h8"/><path class="thin" d="M22 22h14M22 28h20M22 34h20"/><circle cx="38" cy="45" r="6.5"/><path class="thin" d="M35.5 45l2 2 3.5-4"/>`),
    /* passeport — fiche de police */
    passeport: art(`<rect class="fill" x="16" y="8" width="32" height="48" rx="5"/><rect x="16" y="8" width="32" height="48" rx="5"/><circle cx="32" cy="26" r="7"/><circle class="thin" cx="32" cy="26" r="3"/><path class="thin" d="M23 41h18M23 46h18M26 51h12"/>`),
    /* ménage — pulvérisateur d'étincelles, repris du vocabulaire sparkles */
    menage: art(`<path class="fill" d="M24 26h14l3 7v19a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V33z"/><path d="M24 26h14l3 7v19a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V33z"/><path d="M27 26v-7h6v7"/><path d="M33 19h8c2 0 3 1 3 3"/><path class="thin" d="M48 14l3-3M52 22h4M48 28l3 3"/><path class="thin" d="M26 38c3 2 7 2 10 0"/>`),
  };

  /* ───────────────────────── constants (canon: assets/hotel.js) ───────────────────────── */
  const TPT = 27;                       /* taxe de séjour · MAD / nuit / adulte */
  const TYPES = {
    patio:   { name: 'Chambre Patio',  rate: 750 },
    confort: { name: 'Confort Médina', rate: 950 },
    suite:   { name: 'Suite Yasmina',  rate: 1400 },
  };
  const SRC = {
    booking: { label: 'Booking.com', cls: 'booking' },
    airbnb:  { label: 'Airbnb',      cls: 'airbnb' },
    direct:  { label: 'Direct',      cls: 'direct' },
    walkin:  { label: 'Walk-in',     cls: 'direct' },
  };
  const ONLINE_SRC = { booking: 'Booking.com', airbnb: 'Airbnb' };
  const HOUSEKEEPERS = pvReal() ? ['l’équipe', 'l’équipe'] : ['Naima Bouziane', 'Fatiha Zerouali'];

  /* extras — the visual quick-grid posted onto the folio */
  const CHARGES = [
    { id: 'minibar',   label: 'Minibar',            sub: 'eau · soda · snacks',      unit: 45,  per: 'la consommation' },
    { id: 'hammam',    label: 'Hammam 30 min',      sub: 'gommage savon noir',       unit: 280, per: 'par personne' },
    { id: 'diner',     label: 'Dîner riad',         sub: 'menu du soir',             unit: 290, per: 'par personne' },
    { id: 'transfert', label: 'Transfert aéroport', sub: 'Ibn Battouta · trajet',    unit: 220, per: 'par trajet' },
    { id: 'lessive',   label: 'Lessive',            sub: 'sachet rendu 24 h',        unit: 120, per: 'le sachet' },
    { id: 'the',       label: 'Thé & pâtisseries',  sub: 'plateau au salon',         unit: 60,  per: 'le plateau' },
  ];
  const CHARGE = Object.fromEntries(CHARGES.map((c) => [c.id, c]));

  /* ───────────────────────── rooms (8 — riad scale) ─────────────────────────
     status: occ | depart | libre | menage | hs */
  const FLOORS = [
    { lbl: 'Rez-de-chaussée · patio', rooms: [1, 2, 3] },
    { lbl: '1er étage',               rooms: [4, 5, 6] },
    { lbl: '2e étage · terrasse',     rooms: [7, 8] },
  ];
  const typeOf = (n) => (n <= 3 ? 'patio' : n <= 6 ? 'confort' : 'suite');
  const ROOMS = {};
  for (let n = 1; n <= 8; n++) ROOMS[n] = { n, type: typeOf(n), status: 'libre', note: '' };
  const roomName = (n) => TYPES[ROOMS[n].type].name;
  const roomRate = (n) => TYPES[ROOMS[n].type].rate;

  /* ───────────────────────── stays / folios (seed, mid-shift) ───────────────────────── */
  const STAYS = {};                     /* room n → open stay */
  let factureSeq = 1208;
  let policeSeq = 4131;

  function mkStay(room, cfg) {
    const inAt = new Date(Date.now() - (cfg.day - 1) * DAY_MS);
    const outAt = new Date(inAt.getTime() + cfg.nights * DAY_MS);
    STAYS[room] = {
      room,
      guest: cfg.guest, src: cfg.src,
      pax: cfg.pax, adults: cfg.adults != null ? cfg.adults : cfg.pax,
      nights: cfg.nights, day: cfg.day,
      inAt, outAt,
      caution: cfg.caution || 'carte',
      prefs: cfg.prefs || '',
      charges: (cfg.charges || []).map((c, i) => ({ uid: `${room}-${i}`, cid: c[0], qty: c[1], at: c[2], note: c[3] || '' })),
      payments: (cfg.payments || []).map((p) => ({ method: p[0], amount: p[1], label: p[2] })),
    };
    return STAYS[room];
  }
  let chargeUid = 100;

  function setRoom(n, status, note) { ROOMS[n].status = status; ROOMS[n].note = note || ''; }

  /* En maison (j-courant) — 5 chambres sur 8 ≈ 60 % · demo seed only, a real riad starts empty */
  if (!pvReal()) {
  setRoom(1, 'occ');
  mkStay(1, { guest: 'Hind & Omar Bennani', src: 'booking', pax: 2, nights: 3, day: 2,
    charges: [['minibar', 2, 'hier 21h10'], ['diner', 2, 'hier 20h30']], payments: [] });

  setRoom(2, 'depart', 'Départ 12h00, en retard · Lucía Marín arrive 18h30');
  mkStay(2, { guest: 'Karim Bennis', src: 'booking', pax: 1, nights: 2, day: 3,
    charges: [['minibar', 1, 'hier 22h05'], ['the', 1, 'ce matin 09h20']], payments: [] });

  setRoom(3, 'libre', 'Réservée ce soir, Marta & Diego Gómez · 16h00');

  setRoom(4, 'occ');
  mkStay(4, { guest: 'Ahmed & Leila El Fassi', src: 'direct', pax: 2, nights: 4, day: 3,
    prefs: 'Allergie arachide, cuisine prévenue',
    charges: [['hammam', 2, 'hier 17h30'], ['diner', 2, 'j2 20h45'], ['diner', 2, 'hier 20h40'], ['lessive', 1, 'hier 10h15']],
    payments: [['carte', 2000, 'Acompte à la réservation']] });

  setRoom(5, 'menage', 'Ménage en cours, Famille Rossi arrive 15h30');

  setRoom(6, 'occ');
  mkStay(6, { guest: 'Awa Diallo', src: 'airbnb', pax: 1, nights: 4, day: 3,
    charges: [['transfert', 1, 'j1 14h50'], ['minibar', 1, 'j2 23h10']],
    payments: [['online', 3800, 'Prépayé en ligne · Airbnb, nuitées']] });

  setRoom(7, 'occ');
  mkStay(7, { guest: 'Sophie Marceau', src: 'direct', pax: 1, nights: 4, day: 2,
    prefs: 'Étage terrasse, petit-déjeuner 8h30',
    charges: [['hammam', 1, 'hier 18h00'], ['diner', 1, 'hier 20h45']],
    payments: [['carte', 2800, 'Acompte à la réservation']] });

  setRoom(8, 'hs', 'Fuite SDB, plombier vendredi');
  }

  /* ───────────────────────── arrivées / départs du jour ───────────────────────── */
  /* demo guest book — a real riad starts with zero arrivals/departures */
  const ARRIVALS = pvReal() ? [] : [
    { id: 'a1', t: '15h30', guest: 'Famille Rossi', room: 5, src: 'booking', nights: 4, pax: 4, adults: 2,
      note: 'Lit bébé demandé, 2 adultes, 2 enfants', done: false },
    { id: 'a2', t: '16h00', guest: 'Marta & Diego Gómez', room: 3, src: 'direct', nights: 3, pax: 2, adults: 2,
      note: 'Client fidèle ×2 · thé sans sucre', repeat: true, acompte: 1180, done: false },
    { id: 'a3', t: '18h30', guest: 'Lucía Marín', room: 2, src: 'booking', nights: 2, pax: 1, adults: 1,
      note: 'Étage calme demandé', done: false },
  ];
  const DEPARTURES = pvReal() ? [] : [
    { id: 'd1', t: '10h30', guest: 'Claire Dubois', room: 5, total: 3120, done: true, doneAt: '10h26' },
    { id: 'd2', t: '12h00', guest: 'Karim Bennis',  room: 2, done: false, late: true },
  ];

  /* ───────────────────────── folio math ───────────────────────── */
  function chargeAmt(c) { return CHARGE[c.cid].unit * c.qty; }
  function stayTotals(st) {
    const nuitees = roomRate(st.room) * st.nights;
    const taxe = TPT * st.adults * st.nights;
    const extras = st.charges.reduce((s, c) => s + chargeAmt(c), 0);
    const total = nuitees + taxe + extras;
    const paid = st.payments.reduce((s, p) => s + p.amount, 0);
    return { nuitees, taxe, extras, total, paid, due: Math.max(0, total - paid) };
  }
  const arrivalForRoom = (n) => ARRIVALS.find((a) => a.room === n && !a.done);

  /* ───────────────────────── state ───────────────────────── */
  const state = {
    view: 'reception',
    folioRoom: null,           /* null → liste des folios; n → détail */
    offline: false, queued: 0,
  };
  let root = null;

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     La maison d'hôtes encaissait dans le folio du séjour, et le folio meurt
     avec le check-out : la recette n'existait nulle part une fois la chambre
     passée en ménage. Démo : no-op. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('hotel', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de facture repart AU-DELÀ de la dernière émise aujourd'hui :
     sans ça un rechargement le remet à F-1208 et deux séjours différents
     repartent avec la même facture. Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) factureSeq = window.KiwiPosSale.nextSeq('hotel', factureSeq); } catch (_) {}

  /* ═══════════════════════ MOUNT (shell) ═══════════════════════ */
  function mount(rootEl) {
    root = rootEl;
    root.classList.add('ht-app');
    root.innerHTML = `
      <aside class="ht-rail">
        <div class="ht-brand">kiwi<i></i></div>
        <div class="ht-venue">
          <div class="ht-venue-name">${esc(pvName('Riad Yasmina') || 'Hôtel')}</div>
          <div class="ht-venue-sub">${pvReal() ? (esc(pvCity('')) || '') : 'Tanger · Kasbah'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="ht-nav" id="ht-nav">
          <button class="ht-nav-it on" data-ht-view="reception"><i data-lucide="layout-dashboard"></i><span>Réception</span><b class="ht-nav-badge" id="ht-badge-rec"></b></button>
          <button class="ht-nav-it" data-ht-view="chambres"><i data-lucide="building-2"></i><span>Chambres</span><b class="ht-nav-badge" id="ht-badge-rooms"></b></button>
          <button class="ht-nav-it" data-ht-view="folios"><i data-lucide="clipboard-list"></i><span>Folios</span><b class="ht-nav-badge" id="ht-badge-folios"></b></button>
        </nav>
        <div class="ht-rail-foot">
          <button class="ht-net" id="ht-net" title="Simuler une coupure réseau">
            <i class="ht-net-dot"></i><span class="ht-net-label">En ligne</span>
          </button>
          <button class="ht-lock" id="ht-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="ht-main">
        <div class="ht-offline-note" id="ht-offline-note" hidden>
          Hors-ligne, la réception continue, tout est enregistré sur la tablette et synchronisé au retour du réseau.
          <b id="ht-queue-count"></b>
        </div>
        <section class="ht-view is-on" data-ht-panel="reception"></section>
        <section class="ht-view" data-ht-panel="chambres"></section>
        <section class="ht-view" data-ht-panel="folios"></section>
      </main>
      <div class="modal-veil" id="ht-room-veil"><div class="modal ht-roomsheet ht-rel" id="ht-roomm"></div></div>
      <div class="modal-veil" id="ht-checkin-veil"><div class="modal ht-checkin ht-rel" id="ht-checkinm"></div></div>
      <div class="modal-veil" id="ht-charge-veil"><div class="modal ht-chsheet ht-rel" id="ht-chargem"></div></div>
      <div class="modal-veil" id="ht-checkout-veil"><div class="modal ht-checkout ht-rel" id="ht-checkoutm"></div></div>
      <div class="modal-veil" id="ht-facture-veil"><div class="modal ht-facturem ht-rel" id="ht-facturem"></div></div>`;

    $('#ht-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ht-view]');
      if (b) switchView(b.dataset.htView);
    });
    $('#ht-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#ht-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    renderAll();
  }

  function onShow() { renderAll(); }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.ht-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.htView === view));
    $$('.ht-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.htPanel === view));
    if (view === 'reception') renderReception();
    if (view === 'chambres') renderRooms();
    if (view === 'folios') renderFolios();
    icons();
  }

  function renderBadges() {
    const todo = ARRIVALS.filter((a) => !a.done).length + DEPARTURES.filter((d) => !d.done).length;
    const menage = Object.values(ROOMS).filter((r) => r.status === 'menage').length;
    const folios = Object.keys(STAYS).length;
    const set = (id, v) => { const el = $(id, root); el.textContent = v || ''; el.style.display = v ? '' : 'none'; };
    set('#ht-badge-rec', todo);
    set('#ht-badge-rooms', menage);
    set('#ht-badge-folios', folios);
  }

  function renderAll() {
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* re-render the active view + badges (after any state change) */
  function refreshOps() {
    renderBadges();
    if (state.view === 'reception') renderReception();
    if (state.view === 'chambres') renderRooms();
    if (state.view === 'folios') renderFolios();
    icons();
  }

  /* ═══════════════════════ RÉCEPTION ═══════════════════════ */
  function srcPill(src) { return `<span class="ht-src ${SRC[src].cls}">${SRC[src].label}</span>`; }

  function arrivalRow(a, i) {
    const r = ROOMS[a.room];
    const blocked = r.status !== 'libre';
    return `<div class="ht-arr ${a.done ? 'is-done' : ''}" style="--i:${i}">
      <div class="ht-arr-time"><b>${a.t}</b><span>${a.done ? 'arrivé' : 'ETA'}</span></div>
      <div class="ht-arr-mid">
        <div class="ht-arr-name">${esc(a.guest)}
          ${a.repeat ? '<span class="ht-pill mint"><i data-lucide="heart"></i>fidèle</span>' : ''}
        </div>
        <div class="ht-arr-meta">
          <span class="ht-pill dark">Ch. ${a.room}</span>
          <span class="ht-pill">${esc(roomName(a.room))}</span>
          ${srcPill(a.src)}
          <span class="ht-pill"><i data-lucide="calendar"></i>${a.nights} nuit${a.nights > 1 ? 's' : ''}</span>
          <span class="ht-pill"><i data-lucide="users"></i>${a.pax}</span>
          ${a.acompte ? `<span class="ht-pill ok">acompte ${fmtMAD(a.acompte)}</span>` : ''}
        </div>
        ${a.note ? `<div class="ht-arr-note"><i data-lucide="sticky-note"></i>${esc(a.note)}</div>` : ''}
        ${!a.done && blocked ? `<div class="ht-arr-note"><i data-lucide="clock"></i>${esc(blockReason(a.room))}</div>` : ''}
      </div>
      <div class="ht-arr-right">
        ${a.done
          ? `<span class="ht-done-chip"><i data-lucide="check-circle-2"></i>En maison · ${a.doneAt || ''}</span>`
          : `<button class="ht-cta ${blocked ? 'line' : ''}" data-ht-checkin="${a.id}"><i data-lucide="user-check"></i>Check-in</button>`}
      </div>
    </div>`;
  }

  function departureRow(d, i) {
    const st = STAYS[d.room];
    const due = st ? stayTotals(st).due : 0;
    return `<div class="ht-arr ${d.done ? 'is-done' : ''}" style="--i:${i}">
      <div class="ht-arr-time"><b>${d.t}</b><span>${d.done ? 'parti' : 'départ'}</span></div>
      <div class="ht-arr-mid">
        <div class="ht-arr-name">${esc(d.guest)}
          ${!d.done && d.late ? '<span class="ht-pill due">en retard</span>' : ''}
        </div>
        <div class="ht-arr-meta">
          <span class="ht-pill dark">Ch. ${d.room}</span>
          ${d.done
            ? `<span class="ht-pill ok">folio réglé · ${fmtMAD(d.total)}</span>`
            : (due > 0
              ? `<span class="ht-pill due">solde ${fmtMAD(due)}</span>`
              : '<span class="ht-pill ok">folio soldé</span>')}
        </div>
        ${!d.done && arrivalForRoom(d.room) ? `<div class="ht-arr-note"><i data-lucide="clock"></i>${esc(arrivalForRoom(d.room).guest)} arrive ${arrivalForRoom(d.room).t} sur cette chambre</div>` : ''}
      </div>
      <div class="ht-arr-right">
        ${d.done
          ? `<span class="ht-done-chip"><i data-lucide="check-circle-2"></i>Parti · ${d.doneAt || ''}</span>`
          : `<button class="ht-cta ${due > 0 ? 'due' : ''}" data-ht-checkout="${d.room}"><i data-lucide="hand-coins"></i>Check-out${due > 0 ? ` · ${fmtMAD(due)}` : ''}</button>
             <button class="ht-cta line" data-ht-folio="${d.room}"><i data-lucide="clipboard-list"></i>Folio</button>`}
      </div>
    </div>`;
  }

  function blockReason(n) {
    const r = ROOMS[n];
    if (r.status === 'depart') {
      const st = STAYS[n];
      return `Ch. ${n} encore occupée, départ de ${st ? st.guest : 'l’occupant'} à encaisser`;
    }
    if (r.status === 'menage') return `Ch. ${n} en remise, ménage en cours`;
    if (r.status === 'occ') return `Ch. ${n} occupée`;
    if (r.status === 'hs') return `Ch. ${n} hors service`;
    return '';
  }

  function renderReception() {
    const panel = $('[data-ht-panel="reception"]', root);
    const inHouse = Object.values(ROOMS).filter((r) => r.status === 'occ' || r.status === 'depart').length;
    const arrLeft = ARRIVALS.filter((a) => !a.done).length;
    const depLeft = DEPARTURES.filter((d) => !d.done).length;
    panel.innerHTML = `
      <header class="ht-head">
        <div><h1>Réception</h1><div class="ht-head-sub">${fmtDT(new Date())} · le folio suit le client, pas la caisse</div></div>
        <div class="ht-day-stats">
          <span class="ht-day-stat"><b>${inHouse}/8</b>en maison</span>
          <span class="ht-day-stat"><b>${arrLeft}</b>arrivée${arrLeft > 1 ? 's' : ''} à venir</span>
          <span class="ht-day-stat ${depLeft ? 'warn' : ''}"><b>${depLeft}</b>départ${depLeft > 1 ? 's' : ''} à encaisser</span>
        </div>
      </header>
      <div class="ht-recep">
        <div class="ht-col">
          <div class="ht-col-head">Arrivées du jour <span class="ct">${ARRIVALS.length}</span></div>
          ${ARRIVALS.map(arrivalRow).join('') || '<div class="ht-empty">Aucune arrivée aujourd’hui.</div>'}
        </div>
        <div class="ht-col">
          <div class="ht-col-head">Départs du jour <span class="ct">${DEPARTURES.length}</span></div>
          ${DEPARTURES.map(departureRow).join('') || '<div class="ht-empty">Aucun départ aujourd’hui.</div>'}
        </div>
      </div>`;
    panel.onclick = (e) => {
      const ci = e.target.closest('[data-ht-checkin]');
      if (ci) { openCheckin(ci.dataset.htCheckin); return; }
      const co = e.target.closest('[data-ht-checkout]');
      if (co) { openCheckout(+co.dataset.htCheckout); return; }
      const fo = e.target.closest('[data-ht-folio]');
      if (fo) openFolioDetail(+fo.dataset.htFolio);
    };
    icons();
  }

  /* ═══════════════════════ CHAMBRES ═══════════════════════ */
  const ST_META = {
    occ:    { label: 'Occupée',      pill: 'ok',   dot: 'var(--emerald)' },
    depart: { label: 'Départ',       pill: 'due',  dot: 'var(--danger-mute)' },
    libre:  { label: 'Libre',        pill: '',     dot: 'var(--line)' },
    menage: { label: 'Ménage',       pill: 'warn', dot: '#D99A2B' },
    hs:     { label: 'Hors service', pill: '',     dot: 'var(--ink-4)' },
  };

  function roomCard(n, i) {
    const r = ROOMS[n];
    const st = STAYS[n];
    const arr = arrivalForRoom(n);
    const t = st ? stayTotals(st) : null;
    let guest = '', meta = '';
    if (st) {
      guest = st.guest;
      meta = `${SRC[st.src].label} · ${st.nights} nuit${st.nights > 1 ? 's' : ''} · j${st.day}`;
    } else if (r.status === 'menage') {
      guest = `Ménage, ${HOUSEKEEPERS[n % HOUSEKEEPERS.length]}`;
      meta = r.note;
    } else if (r.status === 'hs') {
      guest = 'Hors service';
      meta = r.note;
    } else {
      guest = arr ? `Réservée, ${arr.guest}` : 'Libre ce soir';
      meta = arr ? `Arrivée ${arr.t} · ${SRC[arr.src].label}` : 'Propre · prête à vendre';
    }
    return `<button class="ht-room st-${r.status}" data-ht-room="${n}" style="--i:${i}">
      <div class="ht-room-top">
        <span class="ht-room-num">Ch. ${n} <small>${esc(roomName(n))}</small></span>
        <span class="ht-pill ${ST_META[r.status].pill}">${ST_META[r.status].label}</span>
      </div>
      <div class="ht-room-guest">${esc(guest)}</div>
      <div class="ht-room-meta">${esc(meta)}</div>
      <div class="ht-room-foot">
        <span class="ht-room-rate">${fmtMAD(roomRate(n))} / nuit</span>
        ${t ? `<span class="ht-room-amt ${t.due > 0 ? 'due' : ''}">${t.due > 0 ? `solde ${fmtMAD(t.due)}` : 'folio soldé'}</span>` : ''}
      </div>
    </button>`;
  }

  function renderRooms() {
    const panel = $('[data-ht-panel="chambres"]', root);
    const counts = {};
    Object.values(ROOMS).forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    let i = 0;
    panel.innerHTML = `
      <header class="ht-head">
        <div><h1>Plan des chambres</h1><div class="ht-head-sub">Touchez une chambre, occupée ouvre son folio</div></div>
      </header>
      <div class="ht-legend">
        ${Object.entries(ST_META).map(([s, m]) => `<span class="ht-leg"><i style="background:${m.dot}"></i>${m.label} <b>${counts[s] || 0}</b></span>`).join('')}
      </div>
      <div class="ht-board">
        ${FLOORS.map((f) => `
          <div class="ht-floor-lbl">${esc(f.lbl)}</div>
          <div class="ht-rooms">${f.rooms.map((n) => roomCard(n, i++)).join('')}</div>`).join('')}
      </div>`;
    panel.onclick = (e) => {
      const b = e.target.closest('[data-ht-room]');
      if (!b) return;
      const n = +b.dataset.htRoom;
      const r = ROOMS[n];
      if (r.status === 'occ') { openFolioDetail(n); return; }
      if (r.status === 'depart') { openFolioDetail(n); return; }
      openRoomSheet(n);
    };
    icons();
  }

  /* ---------- room sheet (libre / ménage / hs) ---------- */
  function openRoomSheet(n) {
    const r = ROOMS[n];
    const arr = arrivalForRoom(n);
    const el = $('#ht-roomm', root);
    let info = '', actions = '';
    if (r.status === 'menage') {
      info = `<div class="ht-rs-info warn"><b>Ménage en cours</b>, ${esc(HOUSEKEEPERS[n % HOUSEKEEPERS.length])}.${arr ? `<br>${esc(arr.guest)} attendu·e à ${arr.t}.` : ''}</div>`;
      actions = `
        <button class="ht-btn primary" data-ht-rs="clean"><i data-lucide="sparkles"></i>Ménage terminé, chambre propre</button>
        <button class="ht-btn ghost" data-ht-rs="hs">Signaler hors service</button>`;
    } else if (r.status === 'hs') {
      info = `<div class="ht-rs-info warn"><b>Hors service.</b> ${esc(r.note || 'Maintenance en cours.')}</div>`;
      actions = `<button class="ht-btn primary" data-ht-rs="enable"><i data-lucide="check"></i>Remettre en service</button>`;
    } else { /* libre */
      info = arr
        ? `<div class="ht-rs-info mint"><b>Réservée ce soir</b>, ${esc(arr.guest)} · arrivée ${arr.t} · ${SRC[arr.src].label} · ${arr.nights} nuit${arr.nights > 1 ? 's' : ''}.</div>`
        : `<div class="ht-rs-info">Libre ce soir, propre, prête à vendre. ${fmtMAD(roomRate(n))} / nuit.</div>`;
      actions = `
        ${arr ? `<button class="ht-btn primary" data-ht-rs="checkin"><i data-lucide="user-check"></i>Check-in maintenant, ${esc(arr.guest.split(' ')[0])}</button>` : ''}
        <button class="ht-btn secondary" data-ht-rs="menage"><i data-lucide="sparkles"></i>Passer en ménage</button>
        <button class="ht-btn ghost" data-ht-rs="hs">Hors service</button>`;
    }
    el.innerHTML = `
      <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ht-rs-head">
        <span class="ht-rs-art">${ART.porte}</span>
        <span class="ht-rs-title"><h3>Ch. ${n} · ${esc(roomName(n))}</h3><span class="sub">${fmtMAD(roomRate(n))} / nuit · ${ST_META[r.status].label.toLowerCase()}</span></span>
      </div>
      ${info}
      <div class="ht-rs-actions">${actions}</div>`;
    openVeil('#ht-room-veil');
    icons();
    $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-room-veil'); });
    $$('[data-ht-rs]', el).forEach((b) => {
      b.onclick = () => {
        const act = b.dataset.htRs;
        closeVeil('#ht-room-veil');
        if (act === 'clean') {
          setRoom(n, 'libre', arr ? `Réservée, ${arr.guest} · ${arr.t}` : 'Libre ce soir');
          queueIfOffline(`Ménage Ch. ${n}`);
          toast(arr ? `Ch. ${n} propre, prête pour ${arr.guest} (${arr.t})` : `Ch. ${n} propre, prête à vendre`);
        } else if (act === 'menage') {
          setRoom(n, 'menage', 'Remise demandée par la réception');
          queueIfOffline(`Ménage Ch. ${n}`);
          toast(`Ch. ${n} passée en ménage, ${HOUSEKEEPERS[n % HOUSEKEEPERS.length]} prévenue`);
        } else if (act === 'hs') {
          setRoom(n, 'hs', 'Signalée par la réception');
          queueIfOffline(`Hors service Ch. ${n}`);
          toast(`Ch. ${n} hors service, retirée de la vente`);
        } else if (act === 'enable') {
          setRoom(n, 'libre', 'Libre ce soir');
          queueIfOffline(`Remise en service Ch. ${n}`);
          toast(`Ch. ${n} remise en service, prête à vendre`);
        } else if (act === 'checkin' && arr) {
          openCheckin(arr.id);
          return;
        }
        refreshOps();
      };
    });
  }

  /* ═══════════════════════ CHECK-IN (scan passeport → caution → thé) ═══════════════════════ */
  function initialsOf(name) {
    return name.split(/\s+/).filter((w) => /^[A-ZÀ-Ý]/.test(w)).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || name.slice(0, 2).toUpperCase();
  }

  function openCheckin(arrId) {
    const a = ARRIVALS.find((x) => x.id === arrId);
    if (!a || a.done) return;
    const r = ROOMS[a.room];
    if (r.status !== 'libre') {
      if (r.status === 'depart') toast(`${blockReason(a.room)}, passez par Départs`);
      else if (r.status === 'menage') toast(`${blockReason(a.room)}, marquez le ménage terminé (Chambres)`);
      else toast(blockReason(a.room));
      return;
    }

    const el = $('#ht-checkinm', root);
    const ci = { scanned: false, police: null, caution: 'carte' };

    const guestCard = () => `
      <div class="ht-ci-guest">
        <span class="ava">${esc(initialsOf(a.guest))}</span>
        <span class="mid">
          <span class="nm">${esc(a.guest)} ${a.repeat ? '<span class="ht-pill mint"><i data-lucide="heart"></i>fidèle ×2</span>' : ''}</span>
          <span class="sb">Ch. ${a.room} · ${esc(roomName(a.room))} · ${a.nights} nuit${a.nights > 1 ? 's' : ''} · ${a.pax} pers. · ${SRC[a.src].label}${a.acompte ? ` · acompte ${fmtMAD(a.acompte)} réglé` : ''}</span>
        </span>
      </div>`;

    const steps = (cur) => `
      <div class="ht-ci-steps">
        <span class="ht-ci-step ${cur === 1 ? 'on' : 'done'}">1 · Fiche de police</span><i></i>
        <span class="ht-ci-step ${cur === 2 ? 'on' : ''}">2 · Caution &amp; accueil</span>
      </div>`;

    const step1 = () => {
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Check-in, Ch. ${a.room}</h3>
        <p class="modal-subtle">Arrivée ${a.t} · ${SRC[a.src].label} · la fiche de police est obligatoire, le scan la pré-remplit.</p>
        ${steps(1)}
        ${guestCard()}
        ${a.note ? `<div class="ht-arr-note" style="margin:-4px 0 10px;"><i data-lucide="sticky-note"></i>${esc(a.note)}</div>` : ''}
        <div class="ht-ci-f">
          <div class="ht-ci-lbl">Pièce d'identité <span class="opt">· passeport ou CIN</span></div>
          <div class="ht-scan-stage" id="ht-scan-stage">
            ${ART.passeport.replace('class="ht-art"', 'class="ht-art doc"')}
            <span class="ht-scan-corner tl"></span><span class="ht-scan-corner tr"></span>
            <span class="ht-scan-corner bl"></span><span class="ht-scan-corner br"></span>
            <div class="ht-scan-hint" id="ht-scan-hint">Posez la pièce sous la caméra…</div>
          </div>
          <div id="ht-scan-result">
            <button class="ht-scan-cta" id="ht-scan-go"><i data-lucide="scan-line"></i>Scanner la pièce</button>
          </div>
        </div>
        <div class="ht-ci-foot">
          <button class="ht-btn secondary" data-ht-close>Plus tard</button>
          <button class="ht-btn primary" id="ht-ci-next" disabled><i data-lucide="shield-check"></i>Continuer, caution</button>
        </div>`;
      icons();
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkin-veil'); });
      const refreshNext = () => { $('#ht-ci-next', el).disabled = !ci.scanned; };
      $('#ht-scan-go', el).onclick = () => {
        const stage = $('#ht-scan-stage', el);
        if ($('.ht-scan-laser', stage)) return;
        const laser = document.createElement('div');
        laser.className = 'ht-scan-laser';
        stage.appendChild(laser);
        $('#ht-scan-hint', el).textContent = 'Lecture MRZ en cours…';
        setTimeout(() => {
          if (!el.closest('.modal-veil').classList.contains('is-open')) return;
          laser.remove();
          ci.scanned = true;
          ci.police = `FP-2026-${policeSeq++}`;
          $('#ht-scan-hint', el).textContent = 'Pièce lue';
          $('#ht-scan-result', el).innerHTML = `
            <div class="ht-scan-ok"><i data-lucide="check-circle-2"></i>Fiche de police pré-remplie, n° ${ci.police}<span>envoyée à la DGSN ce soir</span></div>`;
          icons();
          refreshNext();
          toast(`Pièce lue, fiche de police ${ci.police} pré-remplie`);
        }, 1600);
      };
      $('#ht-ci-next', el).onclick = () => { if (ci.scanned) step2(); };
      refreshNext();
    };

    const step2 = () => {
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Caution &amp; accueil</h3>
        <p class="modal-subtle">${esc(a.guest)} · Ch. ${a.room} · fiche ${ci.police}</p>
        ${steps(2)}
        ${guestCard()}
        <div class="ht-ci-f">
          <div class="ht-ci-lbl">Caution <span class="opt">· libérée au check-out</span></div>
          <div class="ht-seg" data-lens-demo id="ht-caution-seg">
            <button class="ht-seg-it ${ci.caution === 'carte' ? 'on' : ''}" data-lens-item data-ht-caution="carte">Empreinte carte<small>1 000 MAD</small></button>
            <button class="ht-seg-it ${ci.caution === 'especes' ? 'on' : ''}" data-lens-item data-ht-caution="especes">Espèces<small>1 000 MAD au coffre</small></button>
            <button class="ht-seg-it ${ci.caution === 'sans' ? 'on' : ''}" data-lens-item data-ht-caution="sans">Sans<small>client fidèle</small></button>
          </div>
        </div>
        <div class="ht-welcome"><i data-lucide="sparkles"></i><span><b>Accueil Yasmina</b>, thé à la menthe offert au salon, plateau envoyé à l'arrivée.${a.note && a.note.includes('thé') ? ' Sans sucre pour ce client.' : ''}</span></div>
        <div class="ht-ci-foot">
          <button class="ht-btn secondary" id="ht-ci-back">Retour</button>
          <button class="ht-btn primary" id="ht-ci-done"><i data-lucide="check"></i>Terminer le check-in</button>
        </div>`;
      icons();
      if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {}
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkin-veil'); });
      $('#ht-caution-seg', el).onclick = (e) => {
        const b = e.target.closest('[data-ht-caution]');
        if (!b) return;
        ci.caution = b.dataset.htCaution;
        $$('[data-ht-caution]', el).forEach((x) => x.classList.toggle('on', x === b));
      };
      $('#ht-ci-back', el).onclick = step1;
      $('#ht-ci-done', el).onclick = () => {
        if (ci.caution === 'carte') stepCautionReader();
        else finishCheckin();
      };
    };

    /* empreinte carte — lecteur partenaire, montant non débité */
    const stepCautionReader = () => {
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Empreinte carte · ${fmtMAD(1000)}</h3>
        <p class="modal-subtle">Caution, pré-autorisation, rien n'est débité</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ht-caution-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ht-caution-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkin-veil'); });
      setTimeout(() => {
        const disc = $('#ht-caution-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        disc.classList.remove('is-pulsing');
        disc.classList.add('is-success');
        disc.innerHTML = '<i data-lucide="check"></i>';
        $('#ht-caution-status', el).textContent = 'Khlass! Empreinte enregistrée';
        $('#ht-caution-status', el).classList.add('is-success');
        icons();
        setTimeout(finishCheckin, 900);
      }, 1900);
    };

    const finishCheckin = () => {
      closeVeil('#ht-checkin-veil');
      a.done = true;
      a.doneAt = nowHM();
      setRoom(a.room, 'occ');
      const st = mkStay(a.room, {
        guest: a.guest, src: a.src, pax: a.pax, adults: a.adults, nights: a.nights, day: 1,
        caution: ci.caution,
        prefs: a.note || '',
        charges: [], payments: a.acompte ? [['carte', a.acompte, 'Acompte à la réservation']] : [],
      });
      st.police = ci.police;
      /* L'acompte de réservation entre dans les livres ici : le check-out ne
         journalise que le SOLDE, donc sans cette ligne cet argent n'arrivait
         jamais au tableau de bord. La caution, elle, n'est pas une recette :
         elle est rendue au départ, on ne la journalise pas. */
      if (a.acompte > 0) postDay(a.acompte, 'carte', `Acompte réservation · Ch. ${a.room} · ${a.guest}`, `Ch-${a.room}`);
      queueIfOffline(`Check-in Ch. ${a.room}`);
      toast(`Check-in Ch. ${a.room}, ${a.guest} · marhba`);
      if (ci.caution === 'especes') toast('Caution 1 000 MAD espèces, au coffre, reçu remis');
      setTimeout(() => toast('Thé à la menthe envoyé au salon, accueil Yasmina'), 700);
      refreshOps();
    };

    step1();
    openVeil('#ht-checkin-veil');
  }

  /* ═══════════════════════ FOLIOS ═══════════════════════ */
  function renderFolios() {
    if (state.folioRoom != null && !STAYS[state.folioRoom]) state.folioRoom = null;
    if (state.folioRoom != null) { renderFolioDetail(); return; }
    const panel = $('[data-ht-panel="folios"]', root);
    const list = Object.values(STAYS).sort((x, y) => x.room - y.room);
    panel.innerHTML = `
      <header class="ht-head">
        <div><h1>Folios ouverts</h1><div class="ht-head-sub">Une note par séjour, nuitées, extras et taxe de séjour sur la même ligne de vie</div></div>
        <div class="ht-day-stats"><span class="ht-day-stat"><b>${list.length}</b>séjour${list.length > 1 ? 's' : ''} en maison</span></div>
      </header>
      <div class="ht-folist">
        ${list.map((st, i) => {
          const t = stayTotals(st);
          const departing = ROOMS[st.room].status === 'depart';
          return `<button class="ht-focard" data-ht-fo="${st.room}" style="--i:${i}">
            <div class="ht-focard-top">
              <span class="ht-focard-room">Ch. ${st.room} <span style="color:var(--ink-4);font-weight:500;">· ${esc(roomName(st.room))}</span></span>
              ${departing ? '<span class="ht-pill due">départ aujourd’hui</span>' : `<span class="ht-pill">j${st.day}/${st.nights}</span>`}
            </div>
            <div>
              <div class="ht-focard-guest">${esc(st.guest)}</div>
              <div class="ht-focard-sub">${SRC[st.src].label} · ${st.pax} pers. · ${fmtDay(st.inAt)} → ${fmtDay(st.outAt)}</div>
            </div>
            <div class="ht-focard-foot">
              <span class="ht-focard-total">${fmtMAD(t.total)} <small>dont taxe ${fmtMAD(t.taxe)}</small></span>
              ${t.due > 0 ? `<span class="ht-pill due">solde ${fmtMAD(t.due)}</span>` : '<span class="ht-pill ok">soldé</span>'}
            </div>
          </button>`;
        }).join('') || '<div class="ht-empty">Aucun folio ouvert, la maison est vide ce soir.</div>'}
      </div>`;
    panel.onclick = (e) => {
      const b = e.target.closest('[data-ht-fo]');
      if (b) openFolioDetail(+b.dataset.htFo);
    };
    icons();
  }

  function openFolioDetail(n) {
    if (!STAYS[n]) { toast(`Ch. ${n}, aucun folio ouvert`); return; }
    state.folioRoom = n;
    switchView('folios');
  }

  function folioLine(opts) {
    return `<div class="ht-fline ${opts.cls || ''}">
      <span class="ht-fline-art">${opts.art}</span>
      <span class="ht-fline-mid">
        <span class="ht-fline-name">${opts.name}</span>
        <span class="ht-fline-sub">${opts.sub}</span>
      </span>
      <span class="ht-fline-right">
        <span class="ht-fline-amt">${fmtMAD(opts.amt)}</span>
        ${opts.right || ''}
      </span>
    </div>`;
  }

  function renderFolioDetail() {
    const panel = $('[data-ht-panel="folios"]', root);
    const st = STAYS[state.folioRoom];
    const n = st.room;
    const t = stayTotals(st);
    const departing = ROOMS[n].status === 'depart';
    let i = 0;
    panel.innerHTML = `
      <div class="ht-folio-view">
        <div class="ht-fo-left">
          <header class="ht-head" style="align-items:flex-start;flex-direction:column;gap:4px;">
            <button class="ht-fo-back" id="ht-fo-back"><i data-lucide="x"></i>Tous les folios</button>
            <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;width:100%;">
              <div><h1>Folio · Ch. ${n}</h1><div class="ht-head-sub">${esc(st.guest)} · ${esc(roomName(n))} · touchez un extra pour le poster sur la note</div></div>
            </div>
          </header>
          <div class="ht-charges-scroll">
            <div class="ht-charges-hint">Extras, postés sur la chambre</div>
            <div class="ht-charges">
              ${CHARGES.map((c) => `
                <button class="ht-charge" data-ht-charge="${c.id}" style="--i:${i++}">
                  <span class="ht-charge-art">${ART[c.id] || ''}</span>
                  <span class="ht-charge-name">${esc(c.label)}</span>
                  <span class="ht-charge-price">${c.unit} MAD · ${esc(c.per)}</span>
                </button>`).join('')}
            </div>
            <div class="ht-foot-note">Restaurant et hammam postent ici automatiquement quand leurs caisses Kiwi sont liées, un seul compte.</div>
          </div>
        </div>
        <aside class="ht-folio-panel">
          <div class="ht-fp-head">
            <div class="ht-fp-row1"><span class="ht-fp-title">${esc(st.guest)}</span><span class="ht-fp-room">Ch. ${n}</span></div>
            <div class="ht-fp-sub">
              ${srcPill(st.src)}
              <span class="ht-pill"><i data-lucide="calendar"></i>${fmtDay(st.inAt)} → ${fmtDay(st.outAt)}</span>
              <span class="ht-pill"><i data-lucide="users"></i>${st.pax} pers.</span>
              ${departing ? '<span class="ht-pill due">départ aujourd’hui</span>' : `<span class="ht-pill ok">j${st.day}/${st.nights}</span>`}
            </div>
            ${st.prefs ? `<div class="ht-fp-sub"><i data-lucide="sticky-note" style="width:11px;height:11px;color:var(--ht-warn);"></i>${esc(st.prefs)}</div>` : ''}
          </div>
          <div class="ht-fp-lines" id="ht-fp-lines">
            ${folioLine({
              cls: 'is-auto', art: ART.nuitee,
              name: `Nuitées · ${esc(roomName(n))} × ${st.nights}`,
              sub: `${fmtMAD(roomRate(n)).replace(' MAD', '')} MAD/nuit · séjour complet`,
              amt: t.nuitees, right: '<span class="ht-auto-pill">auto</span>',
            })}
            ${st.charges.map((c) => {
              const def = CHARGE[c.cid];
              return `<div class="ht-fline">
                <span class="ht-fline-art">${ART[c.cid] || ''}</span>
                <span class="ht-fline-mid">
                  <span class="ht-fline-name">${esc(def.label)}${c.note ? ` · ${esc(c.note)}` : ''}</span>
                  <span class="ht-fline-sub">${esc(c.at)} · ${def.unit} MAD</span>
                </span>
                <span class="ht-fline-right">
                  <span class="ht-fline-amt">${fmtMAD(chargeAmt(c))}</span>
                  <span class="ht-fline-qty">
                    <button data-ht-cminus="${c.uid}" aria-label="Retirer">−</button><b>${c.qty}</b><button data-ht-cplus="${c.uid}" aria-label="Ajouter">+</button>
                  </span>
                </span>
              </div>`;
            }).join('')}
            ${folioLine({
              cls: 'is-taxe', art: ART.taxe,
              name: 'Taxe de séjour (TPT)',
              sub: `${TPT} MAD × ${st.adults} adulte${st.adults > 1 ? 's' : ''} × ${st.nights} nuit${st.nights > 1 ? 's' : ''}`,
              amt: t.taxe, right: '<span class="ht-auto-pill">auto</span>',
            })}
          </div>
          <div class="ht-fp-foot">
            <div class="ht-fp-tot"><span>Extras</span><span class="v">${fmtMAD(t.extras)}</span></div>
            ${t.paid > 0 ? `<div class="ht-fp-tot"><span>Déjà réglé${st.payments.length === 1 ? ` · ${esc(st.payments[0].label)}` : ''}</span><span class="v" style="color:var(--forest);">−${fmtMAD(t.paid)}</span></div>` : ''}
            <div class="ht-fp-total">
              <span class="lbl">${t.due > 0 ? 'Solde à régler' : 'Total, soldé'}</span>
              <span class="val ${t.due > 0 ? 'due' : 'ok'}">${fmtMAD(t.due > 0 ? t.due : t.total)}</span>
            </div>
            <div class="ht-fp-actions">
              <button class="ht-btn secondary" id="ht-fp-facture"><i data-lucide="printer"></i>Facture</button>
              <button class="ht-btn primary" id="ht-fp-checkout"><i data-lucide="hand-coins"></i>Check-out${t.due > 0 ? ` · ${fmtMAD(t.due)}` : ''}</button>
            </div>
          </div>
        </aside>
      </div>`;
    icons();

    $('#ht-fo-back', panel).onclick = () => { state.folioRoom = null; renderFolios(); icons(); };
    $$('[data-ht-charge]', panel).forEach((b) => { b.onclick = () => openChargeSheet(n, b.dataset.htCharge); });
    $('#ht-fp-lines', panel).onclick = (e) => {
      const minus = e.target.closest('[data-ht-cminus]');
      const plus = e.target.closest('[data-ht-cplus]');
      if (!minus && !plus) return;
      const uid = (minus || plus).dataset.htCminus || (minus || plus).dataset.htCplus;
      const idx = st.charges.findIndex((c) => c.uid === uid);
      if (idx < 0) return;
      const c = st.charges[idx];
      if (plus) { c.qty++; }
      else {
        c.qty--;
        if (c.qty <= 0) {
          st.charges.splice(idx, 1);
          toast(`${CHARGE[c.cid].label} retiré du folio Ch. ${n}`);
        }
      }
      queueIfOffline('Folio modifié');
      renderFolioDetail(); renderBadges(); icons();
    };
    $('#ht-fp-facture', panel).onclick = () => openFacture(st, { provisional: ROOMS[n].status !== 'depart' || stayTotals(st).due > 0 });
    $('#ht-fp-checkout', panel).onclick = () => openCheckout(n);
  }

  /* ---------- charge sheet (qty + note → poster) ---------- */
  function openChargeSheet(roomN, cid) {
    const st = STAYS[roomN];
    if (!st) return;
    const def = CHARGE[cid];
    const sheet = { qty: 1, note: '' };
    const el = $('#ht-chargem', root);
    el.innerHTML = `
      <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ht-ch-head">
        <span class="ht-ch-art">${ART[cid] || ''}</span>
        <span class="ht-ch-title"><h3>${esc(def.label)}</h3><span class="sub">${esc(def.sub)} · ${esc(def.per)}</span></span>
        <span class="ht-ch-price"><span class="val" id="ht-ch-total">${fmtMAD(def.unit)}</span><span class="per">${def.unit} MAD × <span id="ht-ch-qn">1</span></span></span>
      </div>
      <div class="ht-ci-f">
        <div class="ht-ci-lbl">Quantité</div>
        <div class="ht-stepper">
          <button id="ht-ch-minus" aria-label="Moins">−</button>
          <b id="ht-ch-qty">1</b>
          <button id="ht-ch-plus" aria-label="Plus">+</button>
        </div>
      </div>
      <div class="ht-ci-f">
        <div class="ht-ci-lbl">Note <span class="opt">· optionnel, visible sur la facture</span></div>
        <input class="ht-note-free" id="ht-ch-note" placeholder="ex. « sans sucre », « chambre à 19h »…" />
      </div>
      <div class="ht-ci-foot">
        <button class="ht-btn secondary" data-ht-close>Annuler</button>
        <button class="ht-btn primary" id="ht-ch-add"><i data-lucide="plus"></i>Poster sur le folio · <span id="ht-ch-cta">${fmtMAD(def.unit)}</span></button>
      </div>`;
    openVeil('#ht-charge-veil');
    icons();
    const refresh = () => {
      $('#ht-ch-qty', el).textContent = sheet.qty;
      $('#ht-ch-qn', el).textContent = sheet.qty;
      $('#ht-ch-total', el).textContent = fmtMAD(def.unit * sheet.qty);
      $('#ht-ch-cta', el).textContent = fmtMAD(def.unit * sheet.qty);
    };
    $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-charge-veil'); });
    $('#ht-ch-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refresh(); } };
    $('#ht-ch-plus', el).onclick = () => { sheet.qty++; refresh(); };
    $('#ht-ch-note', el).oninput = (e) => { sheet.note = e.target.value; };
    $('#ht-ch-add', el).onclick = () => {
      st.charges.push({ uid: `c${chargeUid++}`, cid, qty: sheet.qty, at: `auj. ${nowHM()}`, note: sheet.note.trim() });
      closeVeil('#ht-charge-veil');
      queueIfOffline(`Charge ${def.label}`);
      toast(`${def.label} × ${sheet.qty}, posté sur le folio Ch. ${roomN} (+${fmtMAD(def.unit * sheet.qty)})`);
      refreshOps();
      if (state.view === 'folios' && state.folioRoom === roomN) { renderFolioDetail(); icons(); }
    };
  }

  /* ═══════════════════════ CHECK-OUT ═══════════════════════ */
  function openCheckout(n) {
    const st = STAYS[n];
    if (!st) { toast(`Ch. ${n}, aucun séjour à clôturer`); return; }
    const el = $('#ht-checkoutm', root);
    const t = stayTotals(st);
    const online = ONLINE_SRC[st.src];

    const recapRows = () => `
      <div class="ht-co-recap">
        <div class="ht-co-row"><span class="nm">Nuitées · ${esc(roomName(n))} × ${st.nights}</span><span class="v">${fmtMAD(t.nuitees)}</span></div>
        ${st.charges.map((c) => `<div class="ht-co-row"><span class="nm">${esc(CHARGE[c.cid].label)} × ${c.qty}${c.note ? `<small>${esc(c.note)}</small>` : ''}</span><span class="v">${fmtMAD(chargeAmt(c))}</span></div>`).join('')}
        <div class="ht-co-row taxe"><span class="nm">Taxe de séjour (TPT) · ${st.adults} ad. × ${st.nights} nuit${st.nights > 1 ? 's' : ''}</span><span class="v">${fmtMAD(t.taxe)}</span></div>
        <div class="ht-co-row tot"><span class="nm">Total séjour</span><span class="v">${fmtMAD(t.total)}</span></div>
        ${st.payments.map((p) => `<div class="ht-co-row paid"><span class="nm">${esc(p.label)}</span><span class="v">−${fmtMAD(p.amount)}</span></div>`).join('')}
      </div>`;

    const step1 = () => {
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Check-out, Ch. ${n}</h3>
        <p class="modal-subtle">${esc(st.guest)} · ${fmtDay(st.inAt)} → ${fmtDay(st.outAt)} · ${st.nights} nuit${st.nights > 1 ? 's' : ''}</p>
        ${recapRows()}
        ${t.due > 0 ? `
          <div class="modal-amount size-md">${fmtMAD(t.due)}</div>
          <div class="ht-pay-opts">
            <button class="ht-pay-opt" data-ht-pm="carte">
              <span class="ic"><i data-lucide="credit-card"></i></span>
              <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
              <span class="amt">${fmtMAD(t.due)}</span>
            </button>
            <button class="ht-pay-opt" data-ht-pm="especes">
              <span class="ic"><i data-lucide="banknote"></i></span>
              <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
              <span class="amt">${fmtMAD(t.due)}</span>
            </button>
            ${online ? `
            <button class="ht-pay-opt" data-ht-pm="online">
              <span class="ic"><i data-lucide="check-check"></i></span>
              <span class="l"><b>Déjà payé en ligne</b><span>Solde collecté par ${online}, versement OTA</span></span>
            </button>` : ''}
          </div>` : `
          <div class="ht-pay-opts">
            <button class="ht-pay-opt" data-ht-pm="zero">
              <span class="ic"><i data-lucide="check"></i></span>
              <span class="l"><b>Folio soldé, confirmer le départ</b><span>Facture imprimée, chambre en ménage</span></span>
            </button>
          </div>`}
        <div class="ht-foot-note">${st.caution === 'carte' ? 'Empreinte carte 1 000 MAD libérée au départ.' : st.caution === 'especes' ? 'Caution espèces 1 000 MAD rendue au départ.' : 'Sans caution sur ce séjour.'}</div>`;
      icons();
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkout-veil'); });
      $$('[data-ht-pm]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.htPm;
          if (m === 'carte') stepCard();
          else if (m === 'especes') stepCash();
          else if (m === 'online') done('online', t.due, 0);
          else done(null, 0, 0);
        };
      });
    };

    const stepCash = () => {
      let received = t.due;
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(t.due)}</h3>
        <p class="modal-subtle">Ch. ${n} · ${esc(st.guest)}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ht-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="ht-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${t.due}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
            <button class="cash-preset" data-add="500">+500</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="ht-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ht-cash-ok">Confirmer</button>
        </div>
        <div class="ht-ci-foot" style="margin-top:12px;">
          <button class="ht-btn ghost" id="ht-cash-back" style="flex:1;">Retour</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#ht-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - t.due));
        $('#ht-cash-ok', el).disabled = received < t.due;
      };
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkout-veil'); });
      $('#ht-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#ht-cash-in', el).value = received; refresh(); };
      });
      $('#ht-cash-back', el).onclick = step1;
      refresh();
      $('#ht-cash-ok', el).onclick = () => done('especes', t.due, Math.max(0, received - t.due));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(t.due)}</h3>
        <p class="modal-subtle">Ch. ${n} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ht-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ht-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-checkout-veil'); });
      setTimeout(() => {
        const disc = $('#ht-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#ht-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(t.due, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', t.due, 0), 900);
        });
      }, 1900);
    };

    const done = (method, amount, rendu) => {
      if (method === 'carte') st.payments.push({ method, amount, label: 'Solde au départ · carte' });
      if (method === 'especes') st.payments.push({ method, amount, label: 'Solde au départ · espèces' });
      if (method === 'online') st.payments.push({ method, amount, label: `Réglé en ligne · ${online}` });
      /* Le folio déjà soldé passe par done(null, 0, 0) : rien n'est pris au
         comptoir ce jour-là, ce n'est donc pas une recette du jour — l'argent
         a été journalisé au moment où il est réellement rentré. */
      if (amount > 0) postDay(amount, method, `Solde séjour · Ch. ${n} · ${st.guest}`, `F-${factureSeq}`);
      closeVeil('#ht-checkout-veil');

      /* clôture du séjour */
      const closed = st;
      delete STAYS[n];
      const arr = arrivalForRoom(n);
      setRoom(n, 'menage', arr ? `Ménage en cours, ${arr.guest} arrive ${arr.t}` : 'Remise après départ');
      const dep = DEPARTURES.find((d) => d.room === n && !d.done);
      if (dep) { dep.done = true; dep.doneAt = nowHM(); dep.total = stayTotals(closed).total; }
      if (state.folioRoom === n) state.folioRoom = null;

      queueIfOffline(`Check-out Ch. ${n}`);
      if (method === 'especes') toast(`Encaissé, ${fmtMAD(amount)} en espèces${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      else if (method === 'carte') toast(`Encaissé, ${fmtMAD(amount)} en carte`);
      else if (method === 'online') toast(`Solde marqué réglé via ${online}, versement OTA`);
      else toast('Départ confirmé, folio déjà soldé');
      if (closed.caution === 'carte') setTimeout(() => toast('Empreinte carte libérée, pré-autorisation annulée'), 650);
      else if (closed.caution === 'especes') setTimeout(() => toast('Caution espèces rendue, 1 000 MAD'), 650);
      setTimeout(() => toast(`Ch. ${n} → ménage${arr ? `, ${arr.guest} arrive ${arr.t}` : ''}`), 1250);

      refreshOps();
      openFacture(closed, { provisional: false });
    };

    step1();
    openVeil('#ht-checkout-veil');
  }

  /* ═══════════════════════ FACTURE (print preview) ═══════════════════════ */
  function factureHTML(st, provisional) {
    const t = stayTotals(st);
    const num = provisional ? `PRO-${st.room}-${pad2(new Date().getDate())}` : `F-${factureSeq}`;
    return `<div class="ht-facture">
      <div class="c b lg">${esc((pvName('Riad Yasmina') || 'Hôtel').toUpperCase())}</div>
      <div class="c mut">${pvReal() ? (pvCity('') ? esc(pvCity('')) + ' · ' : '') + 'propulsé par Kiwi' : '7, Rue de la Kasbah, Tanger<br>05 39 94 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="row"><span>${provisional ? 'Note provisoire' : 'Facture'}</span><span class="b">${num}</span></div>
      <div class="row"><span>Chambre</span><span>Ch. ${st.room} · ${esc(roomName(st.room))}</span></div>
      <div class="row"><span>Client</span><span>${esc(st.guest)}</span></div>
      <div class="row"><span>Canal</span><span>${SRC[st.src].label}</span></div>
      <div class="row"><span>Arrivée</span><span>${fmtDay(st.inAt)}</span></div>
      <div class="row"><span>Départ</span><span>${fmtDay(st.outAt)} · ${st.nights} nuit${st.nights > 1 ? 's' : ''} · ${st.pax} pers.</span></div>
      ${st.police ? `<div class="row"><span>Fiche police</span><span>${st.police}</span></div>` : ''}
      <hr>
      <div class="row"><span class="nm">Nuitées · ${esc(roomName(st.room))} ×${st.nights}</span><span>${t.nuitees}</span></div>
      ${st.charges.map((c) => `<div class="row"><span class="nm">${esc(CHARGE[c.cid].label)} ×${c.qty}${c.note ? ` (${esc(c.note)})` : ''}</span><span>${chargeAmt(c)}</span></div>`).join('')}
      <div class="row b"><span class="nm">Taxe de séjour (TPT) · ${st.adults} ad. ×${st.nights} nuits</span><span>${t.taxe}</span></div>
      <hr>
      <div class="row tot"><span>TOTAL</span><span>${t.total} MAD</span></div>
      ${st.payments.map((p) => `<div class="row"><span class="nm">${esc(p.label)}</span><span>−${p.amount}</span></div>`).join('')}
      ${t.due > 0
        ? `<div class="row due"><span>SOLDE À RÉGLER</span><span>${t.due} MAD</span></div>`
        : '<div class="row b"><span>SOLDE</span><span>0 MAD, réglé</span></div>'}
      <hr>
      <div class="c">${barcode(`RY-${st.room}-${num}`, 26)}</div>
      <div class="c mut">${num} · Ch. ${st.room} · merci, b'slama, l'lah ikhellik</div>
    </div>`;
  }

  function openFacture(st, ctx) {
    const provisional = !!(ctx && ctx.provisional);
    const el = $('#ht-facturem', root);
    el.innerHTML = `
      <button class="ht-modal-x" data-ht-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${provisional ? 'Note provisoire' : 'Facture'}, Ch. ${st.room}</h3>
      <p class="modal-subtle">${provisional ? 'Le séjour est encore ouvert, la note suit le folio en direct.' : 'Séjour clôturé, la chambre est passée en ménage.'}</p>
      ${factureHTML(st, provisional)}
      <div class="ht-facture-foot">
        <button class="ht-btn secondary" id="ht-fact-print"><i data-lucide="printer"></i>Imprimer (80 mm)</button>
        <button class="ht-btn primary" data-ht-close><i data-lucide="check"></i>Fermer</button>
      </div>`;
    if (!provisional) factureSeq++;
    openVeil('#ht-facture-veil');
    icons();
    $$('[data-ht-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ht-facture-veil'); });
    $('#ht-fact-print', el).onclick = () => toast('Facture envoyée à l’imprimante, 80 mm');
  }

  /* ═══════════════════════ OFFLINE (file simulée) ═══════════════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline && state.queued) {
      toast(`Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`);
      state.queued = 0;
    } else if (state.offline) {
      toast('Mode hors-ligne, la réception continue, tout est mis en file');
    } else {
      toast('De retour en ligne');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#ht-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.ht-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.ht-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'ht-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#ht-offline-note', root);
    note.hidden = !state.offline;
    $('#ht-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'hotel',
    greet: {
      line1: 'Sba7 lkhir Hamza,',
      em: 'marhba.',
      sub: 'Riad Yasmina <em>·</em> 3 arrivées cet après-midi, un départ à encaisser',
    },
    mount,
    onShow,
  });
})();
