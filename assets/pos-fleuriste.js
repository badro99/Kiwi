/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · FLEURISTE — Fleurs du Détroit (PIN 0013), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * On ne vend pas des lignes : on COMPOSE. Le différenciateur tient en quatre
 * écrans —
 *   1. COMPOSER : une grille de tiges illustrées (line-art, même voix que le
 *      pressing), un bouquet qui se construit en direct (total + taille S/M/L
 *      suggérée), plus deux bouquets signatures, et l'emballage kraft/satin.
 *   2. OCCASION & CARTE : l'occasion (la copie s'adapte avec pudeur pour le
 *      deuil) et la carte-message imprimée en Instrument Serif, petit format.
 *   3. LIVRAISONS DU JOUR : un tableau par créneau (10–12 / 14–16 / 16–19),
 *      adresses de Tanger, statut préparé → en route → livré, destinataire ≠
 *      acheteur, et la confiance : photo du bouquet avant le départ.
 *   4. ARRIVAGES & FRAÎCHEUR : l'arrivage du matin, les fleurs à écouler (–30 %)
 *      qui se repricent en direct.
 *
 * Réutilise les tokens caisse + le kit modal (.modal-veil, .modal, .cash-*,
 * .reader-*) et le #toast-stack partagé. V1 = couche opérationnelle : la carte
 * part au lecteur partenaire, sans encaissement Kiwi. Préfixe .fl- partout.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── demo-people guard : a real store (paired venue / KiwiEnv) starts clean,
     local demo stays byte-identical (pvReal() === false → same output). ── */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const MIN = 60 * 1000;
  const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* Deterministic pseudo-barcode (Code-39 lookalike) for the tags. */
  function barcode(seed, h) {
    h = h || 26;
    let bars = '', x = 0, s = 11;
    const len = Math.max(seed.length * 4, 24);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + seed.charCodeAt(i % seed.length) + i * 11) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── flower line-art ─────────────────────────
     One visual voice: forest strokes, mint-tint leaves, soft bloom-bg petals,
     64×64 grid. These ARE the catalogue — la grille de tiges est la vedette. */
  const art = (inner) => `<svg class="fl-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    rose_rouge: art(`<path d="M32 36v22"/><path class="thin" d="M32 46l-7-4M32 50l8-4"/><path class="fill" d="M24 50c-7-1-9-6-5-9 3-2 7 0 8 4"/><path class="fill" d="M40 48c7-1 8-6 4-9-3-2-7 0-8 4"/><path class="petal" d="M32 12c7 0 12 5 12 12s-5 13-12 13-12-5-12-13 5-12 12-12z"/><path class="petal" d="M32 17c4 0 7 3 7 8 0 4-3 7-7 7s-7-3-7-7c0-5 3-8 7-8z"/><path class="thin" d="M32 24c2 0 3 1.5 3 3.5"/>`),
    rose_blanche: art(`<path d="M32 36v22"/><path class="thin" d="M32 46l-7-4M32 50l8-4"/><path class="fill" d="M24 50c-7-1-9-6-5-9 3-2 7 0 8 4"/><path class="fill" d="M40 48c7-1 8-6 4-9-3-2-7 0-8 4"/><path d="M32 12c7 0 12 5 12 12s-5 13-12 13-12-5-12-13 5-12 12-12z"/><path d="M32 17c4 0 7 3 7 8 0 4-3 7-7 7s-7-3-7-7c0-5 3-8 7-8z"/><path class="thin" d="M32 24c2 0 3 1.5 3 3.5"/>`),
    pivoine: art(`<path d="M32 40v18"/><path class="fill" d="M26 50c-6 0-8-5-4-8 3-2 6 0 7 4"/><path class="fill" d="M40 49c6-1 7-5 3-8-3-2-6 0-7 4"/><path class="petal" d="M32 11c5 0 8 3 9 7 5-1 9 2 9 7 0 4-3 7-7 8 1 4-2 8-7 8s-8-4-7-8c-4-1-7-4-7-8 0-5 4-8 9-7 1-4 4-7 8-7z"/><circle class="petal" cx="32" cy="27" r="6"/><path class="thin" d="M32 23v8M28 27h8"/>`),
    lys: art(`<path d="M32 36v22"/><path class="thin" d="M32 48l-8-3M32 52l8-3"/><path class="fill" d="M22 49c-6-2-7-7-2-9 3-1 6 1 6 5"/><path class="petal" d="M32 10l5 10c4-3 9-2 11 2-4 1-6 4-6 8-3-3-7-3-10 0-3-3-7-3-10 0 0-4-2-7-6-8 2-4 7-5 11-2z"/><path d="M32 10v14"/><path class="thin" d="M32 18l-3 6M32 18l3 6M32 22v6"/>`),
    tulipe: art(`<path d="M32 34v24"/><path class="fill" d="M32 40c-9 0-13-7-13-15 4 2 7 1 9-2 1 4 2 6 4 6s3-2 4-6c2 3 5 4 9 2 0 8-4 15-13 15z"/><path d="M32 40c-9 0-13-7-13-15 4 2 7 1 9-2 1 4 2 6 4 6s3-2 4-6c2 3 5 4 9 2 0 8-4 15-13 15z"/><path d="M32 28v12"/><path class="thin" d="M32 50c-5 0-8-2-9-5M32 52c5 0 8-2 9-6"/>`),
    gypsophile: art(`<path d="M32 58V30"/><path class="thin" d="M32 44l-9-6M32 40l9-7M32 36l-8-8M32 33l9-9"/><circle class="petal" cx="32" cy="22" r="4"/><circle class="petal" cx="22" cy="32" r="3.4"/><circle class="petal" cx="42" cy="26" r="3.4"/><circle class="petal" cx="23" cy="24" r="2.8"/><circle class="petal" cx="41" cy="35" r="3"/><circle class="petal" cx="32" cy="13" r="3"/><circle class="thin" cx="32" cy="22" r="4"/><circle class="thin" cx="22" cy="32" r="3.4"/>`),
    eucalyptus: art(`<path d="M30 58C30 40 22 22 38 8"/><path class="fill" d="M33 18c5-3 8 0 6 5-4 1-7-1-6-5z"/><path class="fill" d="M30 27c-6-2-8 2-4 6 4-1 6-3 4-6z"/><path class="fill" d="M34 34c5-2 7 1 4 6-4-1-6-3-4-6z"/><path class="fill" d="M28 42c-5-1-7 2-3 6 4-1 5-3 3-6z"/><path class="fill" d="M32 50c4-2 7 1 4 5-3-1-5-2-4-5z"/>`),
    renoncule: art(`<path d="M32 40v18"/><path class="fill" d="M26 50c-6-1-7-6-3-8 3-1 6 1 6 4"/><path class="fill" d="M40 49c6-1 6-6 2-8-3-1-6 1-6 4"/><circle class="petal" cx="32" cy="24" r="13"/><circle cx="32" cy="24" r="13"/><circle class="petal" cx="32" cy="24" r="8"/><circle class="petal" cx="32" cy="24" r="4"/><path class="thin" d="M32 11v26M19 24h26"/>`),
    tournesol: art(`<path d="M32 40v18"/><path class="fill" d="M27 50c-6 0-7-5-3-8 3-2 6 0 6 4"/><circle class="fill" cx="32" cy="24" r="8"/><circle cx="32" cy="24" r="8"/><path class="petal" d="M32 4v8M32 36v8M12 24h8M44 24h8M18 10l5 5M41 33l5 5M46 10l-5 5M23 33l-5 5"/><path class="thin" d="M29 21l6 6M35 21l-6 6"/>`),
    oeillet: art(`<path d="M32 38v20"/><path class="thin" d="M32 48l-7-3M32 50l7-3"/><path class="fill" d="M24 49c-6-1-7-6-2-8 3-1 6 1 6 4"/><path class="petal" d="M22 26c0-6 4-12 10-12s10 6 10 12c0 3-1 6-3 8 2 1 2 4-1 4-2 4-10 4-12 0-3 0-3-3-1-4-2-2-3-5-3-8z"/><path d="M22 26c0-6 4-12 10-12s10 6 10 12"/><path class="thin" d="M25 24l3 3M39 24l-3 3M32 18v8"/>`),
  };

  /* ───────────────────────── catalogue : tiges + bouquets signatures ─────────
     Prix la tige, Tanger 2026. presets = bouquets composés, prix forfaitaire. */
  const STEMS = [
    { id: 'rose_rouge',  label: 'Rose rouge',  price: 8,  color: '#A8423A' },
    { id: 'rose_blanche', label: 'Rose blanche', price: 8, color: '#EDE8E0' },
    { id: 'pivoine',     label: 'Pivoine',     price: 15, color: '#D98AA0', flag: 'de saison' },
    { id: 'lys',         label: 'Lys',         price: 12, color: '#F0EAD8' },
    { id: 'tulipe',      label: 'Tulipe',      price: 10, color: '#C75D6E' },
    { id: 'renoncule',   label: 'Renoncule',   price: 12, color: '#E0A24C' },
    { id: 'tournesol',   label: 'Tournesol',   price: 10, color: '#E2B33A' },
    { id: 'oeillet',     label: 'Œillet',      price: 7,  color: '#C98AA8' },
    { id: 'gypsophile',  label: 'Gypsophile',  price: 6,  color: '#EDEDE8', note: 'la touche nuage' },
    { id: 'eucalyptus',  label: 'Eucalyptus',  price: 5,  color: '#6E8A6E', note: 'feuillage' },
  ];
  const STEM = Object.fromEntries(STEMS.map((s) => [s.id, s]));

  /* bouquets signatures — composition figée, prix forfaitaire */
  const PRESETS = [
    { id: 'detroit', label: 'Bouquet Détroit', price: 180, art: 'rose_rouge', flag: 'signature',
      makeup: { rose_rouge: 9, eucalyptus: 4, gypsophile: 3 }, sub: 'roses rouges, eucalyptus, gypsophile' },
    { id: 'kasbah',  label: 'Brassée Kasbah',  price: 260, art: 'pivoine', flag: 'signature',
      makeup: { pivoine: 7, rose_blanche: 6, renoncule: 5, eucalyptus: 5 }, sub: 'pivoines, roses blanches, renoncules' },
  ];
  const PRESET = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

  const WRAPS = [
    { id: 'none',  label: 'Sans',  price: 0 },
    { id: 'kraft', label: 'Kraft', price: 10 },
    { id: 'satin', label: 'Satin', price: 15 },
  ];
  const WRAP = Object.fromEntries(WRAPS.map((w) => [w.id, w]));

  /* ───────────────────────── occasions ─────────────────────────
     Le deuil change la copie : ton sobre, pas de festivité, pas d'emoji. */
  const OCCASIONS = [
    { id: 'anniversaire', label: 'Anniversaire', icon: 'cake',        sub: 'Joyeuse fête, couleurs et lumière',
      suggest: ['Joyeux anniversaire', 'Un an de plus, mille raisons de sourire', 'Tout mon amour pour ta journée'] },
    { id: 'mariage',      label: 'Mariage',      icon: 'heart',       sub: 'Union, cérémonie, table d\'honneur',
      suggest: ['Tous mes vœux de bonheur', 'Mabrouk pour votre union', 'Une vie pleine d\'amour'] },
    { id: 'naissance',    label: 'Naissance',    icon: 'baby',        sub: 'Bienvenue, douceur et tendresse',
      suggest: ['Bienvenue au monde, petit trésor', 'Félicitations aux heureux parents', 'Mabrouk pour cette belle naissance'] },
    { id: 'deuil',        label: 'Condoléances', icon: 'leaf',        sub: 'Hommage et soutien, composition sobre', deuil: true,
      suggest: ['Avec nos sincères condoléances', 'En cette épreuve, toute notre pensée', 'Nos pensées vous accompagnent'] },
  ];
  const OCC = Object.fromEntries(OCCASIONS.map((o) => [o.id, o]));

  /* ───────────────────────── clients (Tanger) ───────────────────────── */
  const CUSTOMERS = pvReal() ? [] : [
    { id: 'c1', name: 'Salma Bennani',       phone: '0661 24 88 10', orders: 12, prefs: ['Aime les pivoines', 'Emballage satin'] },
    { id: 'c2', name: 'Karim Idrissi',       phone: '0670 55 21 09', orders: 5,  prefs: ['Toujours roses rouges'] },
    { id: 'rh', name: 'Hôtel Rif · Réception', phone: '0539 34 11 22', orders: 38, b2b: true, prefs: ['Compositions hall chaque lundi', 'Facture fin de mois'], contact: 'Concierge · M. Tarik' },
    { id: 'c3', name: 'Imane Cherkaoui',     phone: '0650 77 32 18', orders: 8,  prefs: ['Bouquets champêtres', 'Pas de lys (allergie)'] },
    { id: 'c4', name: 'Yassine Alaoui',      phone: '0662 18 44 70', orders: 2,  prefs: [] },
    { id: 'c5', name: 'Nadia El Fassi',      phone: '0668 90 13 27', orders: 9,  prefs: ['Tournesols pour le bureau'] },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));
  const B2B_REMISE = 0.15;

  /* ───────────────────────── livraisons (seed) ─────────────────────────
     Statuts : prep → route → done. Trois créneaux. Destinataire ≠ acheteur.
     Un ordre deuil, copie sobre. Photo-preuve avant départ. */
  const STATUS = {
    prep:  { label: 'À préparer', step: 'prep' },
    route: { label: 'En route',   step: 'route' },
    done:  { label: 'Livré',      step: 'done' },
  };
  const STATUS_FLOW = ['prep', 'route', 'done'];

  const SLOTS = [
    { id: 's1', label: '10:00 – 12:00', short: 'Matin',      hours: '10h – 12h' },
    { id: 's2', label: '14:00 – 16:00', short: 'Après-midi', hours: '14h – 16h' },
    { id: 's3', label: '16:00 – 19:00', short: 'Soir',       hours: '16h – 19h' },
  ];
  const SLOT = Object.fromEntries(SLOTS.map((s) => [s.id, s]));

  const NOW = Date.now();
  let deliverySeq = 64;

  function mkDelivery(cfg) {
    return {
      id: cfg.id,
      slot: cfg.slot,
      occ: cfg.occ,
      status: cfg.status,
      recipient: cfg.recipient,           /* { name, phone, addr, district } */
      buyerId: cfg.buyerId || null,
      buyerName: cfg.buyerName || null,
      items: cfg.items,                   /* [{ kind:'preset'|'stem'|'compose', id, label, n, total }] */
      total: cfg.total,
      pay: cfg.pay,                       /* { mode, method, paid } */
      message: cfg.message || '',
      photo: !!cfg.photo,
      note: cfg.note || '',
      createdAt: new Date(NOW - cfg.createdMin * MIN),
      doneAt: cfg.doneMin != null ? new Date(NOW + cfg.doneMin * MIN) : null,
    };
  }

  const DELIVERIES = pvReal() ? [] : [
    /* ── créneau matin (déjà avancé) ── */
    mkDelivery({ id: 'F-1058', slot: 's1', occ: 'naissance', status: 'done', doneMin: -40, photo: true,
      recipient: { name: 'Famille Berrada', phone: '0661 70 21 55', addr: '14 rue de Belgique, Appt 3', district: 'Iberia' },
      buyerId: 'c1', items: [{ kind: 'preset', id: 'kasbah', label: 'Brassée Kasbah', n: 1, total: 260 }],
      total: 275, pay: { mode: 'now', method: 'carte', paid: 275 }, createdMin: 180,
      message: 'Mabrouk pour cette belle naissance, toute notre tendresse.', note: 'Laisser à la réception si absent.' }),
    mkDelivery({ id: 'F-1061', slot: 's1', occ: 'anniversaire', status: 'route', photo: true,
      recipient: { name: 'Mme Loubna Tazi', phone: '0650 14 88 02', addr: '8 av. Hassan II, Résidence Al Andalous', district: 'Centre' },
      buyerId: 'c2', items: [{ kind: 'compose', label: 'Bouquet composé', n: 16, total: 168 }],
      total: 183, pay: { mode: 'now', method: 'especes', paid: 183 }, createdMin: 95,
      message: 'Joyeux anniversaire Loubna, mille bonheurs.' }),
    /* ── créneau après-midi ── */
    mkDelivery({ id: 'F-1063', slot: 's2', occ: 'mariage', status: 'prep',
      recipient: { name: 'Salle Andalousia', phone: '0539 94 30 12', addr: 'Route de Rabat, km 4, salle des fêtes', district: 'Malabata' },
      buyerId: 'rh', items: [{ kind: 'preset', id: 'detroit', label: 'Bouquet Détroit', n: 4, total: 720 }],
      total: 720, pay: { mode: 'compte', method: 'compte', paid: 0 }, createdMin: 60,
      message: 'Mabrouk pour votre union.', note: 'Quatre compositions pour la table d\'honneur, livrer avant 15h.' }),
    /* ── créneau soir ── */
    mkDelivery({ id: 'F-1066', slot: 's3', occ: 'anniversaire', status: 'prep',
      recipient: { name: 'Sofia Mernissi', phone: '0668 22 41 90', addr: '23 rue Ibn Batouta', district: 'Marshan' },
      buyerId: 'c5', items: [{ kind: 'compose', label: 'Bouquet composé', n: 12, total: 124 }],
      total: 139, pay: { mode: 'pickup', method: null, paid: 0 }, createdMin: 35,
      message: 'Bon anniversaire Sofia.' }),
    /* ── l'ordre deuil — copie sobre ── */
    mkDelivery({ id: 'F-1067', slot: 's3', occ: 'deuil', status: 'prep',
      recipient: { name: 'Famille Sefrioui', phone: '0661 03 55 27', addr: 'Cimetière Mujahidin, entrée principale', district: 'Tanger' },
      buyerId: 'c3', items: [{ kind: 'compose', label: 'Composition sobre', n: 18, total: 196 }],
      total: 196, pay: { mode: 'now', method: 'carte', paid: 196 }, createdMin: 25,
      message: 'Avec nos sincères condoléances.', note: 'Gerbe blanche et verte, remettre avec discrétion.' }),
  ];

  /* ───────────────────────── arrivages du matin ─────────────────────────
     Fraîcheur : fresh (plusieurs jours) · soon (2 j) · today (à écouler).
     Les "today" portent une promo –30 % opt-in qui se reprice en direct. */
  const ARRIVALS = [
    { id: 'rose_rouge',  qty: 120, fresh: 'fresh', sale: false },
    { id: 'pivoine',     qty: 40,  fresh: 'soon',  sale: false, batch: 'Arrivage Hollande · ce matin 06h' },
    { id: 'tulipe',      qty: 60,  fresh: 'fresh', sale: false },
    { id: 'lys',         qty: 24,  fresh: 'today', sale: true,  batch: 'Reste de mardi, à écouler' },
    { id: 'renoncule',   qty: 30,  fresh: 'soon',  sale: false },
    { id: 'gypsophile',  qty: 80,  fresh: 'today', sale: true,  batch: 'Bottes ouvertes, à écouler' },
    { id: 'tournesol',   qty: 18,  fresh: 'fresh', sale: false },
  ];
  const SALE_RATE = 0.30;
  const FRESH = {
    fresh: { label: 'Fraîche', sub: 'tient 4–5 jours' },
    soon:  { label: 'À suivre', sub: 'tient 2 jours' },
    today: { label: 'À écouler', sub: 'à vendre aujourd\'hui' },
  };

  /* ───────────────────────── state ───────────────────────── */
  let root = null;
  let bouquetSeq = 1068;
  const state = {
    view: 'composer',
    cat: 'tous',
    bouquet: null,            /* { num, stems:{id:n}, presets:[{id}], wrap, occ, message, customer } */
    delivQuery: '',
    occActive: 'anniversaire',
    offline: false, queued: 0,
  };

  function freshBouquet() {
    state.bouquet = { num: posRef(`B-${bouquetSeq}`), stems: {}, presets: [], wrap: 'none', occ: state.occActive, message: '', customer: null };
  }

  /* ── bouquet maths ── */
  function bqStemCount(b) {
    let n = 0;
    for (const id in b.stems) n += b.stems[id];
    b.presets.forEach((p) => { const mk = PRESET[p.id].makeup; for (const k in mk) n += mk[k]; });
    return n;
  }
  function bqLooseCount(b) {
    let n = 0;
    for (const id in b.stems) n += b.stems[id];
    return n;
  }
  function bqStemsTotal(b) {
    /* sum the rounded per-tige price (unitPrice) so the bouquet total always
       equals the sum of the per-line totals shown in the panel and the sheet —
       no off-by-rounding gap between a discounted line and the grand total. */
    let t = 0;
    for (const id in b.stems) t += unitPrice(id) * b.stems[id];
    return t;
  }
  function bqPresetsTotal(b) { return b.presets.reduce((s, p) => s + PRESET[p.id].price, 0); }
  function bqTotals(b) {
    const stems = bqStemsTotal(b);
    const presets = bqPresetsTotal(b);
    const wrap = WRAP[b.wrap].price;
    const sub = Math.round(stems + presets + wrap);
    const b2b = b.customer && b.customer.type === 'known' && CUST[b.customer.id] && CUST[b.customer.id].b2b;
    const remise = b2b ? Math.round(sub * B2B_REMISE) : 0;
    return { stems: Math.round(stems), presets, wrap, sub, remise, total: sub - remise, b2b };
  }
  function bqSize(n) {
    if (n <= 0) return null;
    if (n < 10) return { id: 'S', label: 'Petit bouquet', range: '< 10 tiges' };
    if (n <= 20) return { id: 'M', label: 'Bouquet moyen', range: '10–20 tiges' };
    return { id: 'L', label: 'Grande brassée', range: '> 20 tiges' };
  }
  function bqEmpty(b) { return !b.presets.length && bqLooseCount(b) === 0; }

  /* arrivage sale state — live reprice source of truth */
  const saleState = {};
  ARRIVALS.forEach((a) => { saleState[a.id] = !!a.sale; });
  function saleActive(stemId) { return !!saleState[stemId]; }
  function unitPrice(stemId) {
    const base = STEM[stemId].price;
    return saleActive(stemId) ? Math.round(base * (1 - SALE_RATE)) : base;
  }

  function findDelivery(id) { return DELIVERIES.find((d) => d.id === id); }
  function recipFirst(d) { return (d.recipient.name || '').split(/\s+/)[0]; }
  function buyerLabel(d) {
    if (d.buyerId && CUST[d.buyerId]) return CUST[d.buyerId].name;
    return d.buyerName || 'Client de passage';
  }
  function dueOf(d) {
    if (d.pay.mode === 'compte') return 0;
    return Math.max(0, d.total - d.pay.paid);
  }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     La boutique encaissait dans des variables de closure et rien d'autre : la
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('fleuriste', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de bon repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à B-1068 et deux bouquets différents portent le
     même numéro. Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) bouquetSeq = window.KiwiPosSale.nextSeq('fleuriste', bouquetSeq); } catch (_) {}

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  function mount(rootEl) {
    root = rootEl;
    if (!state.bouquet) freshBouquet();
    root.innerHTML = `
      <aside class="fl-rail">
        <div class="fl-brand">kiwi<i></i></div>
        <div class="fl-venue">
          <div class="fl-venue-name">${pvName('Fleurs du Détroit') || 'Ma boutique'}</div>
          <div class="fl-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Marché central'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="fl-nav" id="fl-nav">
          <button class="fl-nav-it on" data-fl-view="composer"><i data-lucide="flower"></i><span>Composer</span><b class="fl-nav-badge" id="fl-badge-bq"></b></button>
          <button class="fl-nav-it" data-fl-view="occasion"><i data-lucide="sticky-note"></i><span>Occasion &amp; carte</span></button>
          <button class="fl-nav-it" data-fl-view="livraisons"><i data-lucide="bike"></i><span>Livraisons</span><b class="fl-nav-badge" id="fl-badge-dv"></b></button>
          <button class="fl-nav-it" data-fl-view="arrivages"><i data-lucide="sprout"></i><span>Arrivages</span><b class="fl-nav-badge" id="fl-badge-ar"></b></button>
        </nav>
        <div class="fl-rail-foot">
          <button class="fl-net" id="fl-net" title="Simuler une coupure réseau">
            <i class="fl-net-dot"></i><span class="fl-net-label">En ligne</span>
          </button>
          <button class="fl-lock" id="fl-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="fl-main">
        <div class="fl-offline-note" id="fl-offline-note" hidden>
          Hors-ligne, les ventes et livraisons continuent sur la tablette, synchronisées au retour du réseau.
          <b id="fl-queue-count"></b>
        </div>

        <section class="fl-view is-on" data-fl-panel="composer">
          <div class="fl-compose">
            <div class="fl-stems">
              <header class="fl-head">
                <div><h1>Composer un bouquet</h1><div class="fl-head-sub" id="fl-today"></div></div>
                <div class="fl-head-hint">Touchez une tige pour l'ajouter, la taille se calcule seule</div>
              </header>
              <div class="fl-cats" id="fl-cats"></div>
              <div class="fl-grid-scroll" id="fl-gridwrap"></div>
            </div>
            <aside class="fl-bouquet" id="fl-bouquet"></aside>
          </div>
        </section>

        <section class="fl-view" data-fl-panel="occasion"></section>
        <section class="fl-view" data-fl-panel="livraisons"></section>
        <section class="fl-view" data-fl-panel="arrivages"></section>
      </main>

      <div class="modal-veil" id="fl-sheet-veil"><div class="modal fl-sheet fl-rel" id="fl-sheetm"></div></div>
      <div class="modal-veil" id="fl-client-veil"><div class="modal fl-client fl-rel" id="fl-clientm"></div></div>
      <div class="modal-veil" id="fl-recap-veil"><div class="modal fl-recap fl-rel" id="fl-recapm"></div></div>
      <div class="modal-veil" id="fl-pay-veil"><div class="modal fl-pay fl-rel" id="fl-paym"></div></div>
      <div class="modal-veil" id="fl-dt-veil"><div class="modal fl-dt fl-rel" id="fl-dtm"></div></div>
      <div class="modal-veil" id="fl-wa-veil"><div class="modal fl-wa fl-rel" id="fl-wam"></div></div>
      <div class="modal-veil" id="fl-photo-veil"><div class="modal fl-photo" id="fl-photom"></div></div>`;

    $('#fl-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-fl-view]');
      if (b) switchView(b.dataset.flView);
    });
    $('#fl-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#fl-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    renderAll();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / GLOBAL RENDER ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.fl-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.flView === view));
    $$('.fl-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.flPanel === view));
    if (view === 'occasion') renderOccasion();
    if (view === 'livraisons') renderDeliveries();
    if (view === 'arrivages') renderArrivages();
    icons();
  }

  function renderBadges() {
    const bq = Object.keys(state.bouquet.stems).length + state.bouquet.presets.length;
    const dv = DELIVERIES.filter((d) => d.status !== 'done').length;
    const ar = ARRIVALS.filter((a) => saleActive(a.id)).length;
    const setBadge = (sel, n, warn) => {
      const el = $(sel, root);
      el.textContent = n || '';
      el.style.display = n ? '' : 'none';
      el.classList.toggle('is-warn', !!warn && !!n);
    };
    setBadge('#fl-badge-bq', bq);
    setBadge('#fl-badge-dv', dv);
    setBadge('#fl-badge-ar', ar, true);
  }

  function renderAll() {
    $('#fl-today', root).textContent = fmtDT(new Date());
    renderCats();
    renderGrid();
    renderBouquet();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ COMPOSER — stem grid ═══════════════════════ */
  function renderCats() {
    $('#fl-cats', root).innerHTML =
      `<button class="fl-cat ${state.cat === 'tous' ? 'on' : ''}" data-fl-cat="tous">Tiges <span class="fl-cat-ct">${STEMS.length}</span></button>` +
      `<button class="fl-cat ${state.cat === 'signature' ? 'on' : ''}" data-fl-cat="signature">Bouquets signatures <span class="fl-cat-ct">${PRESETS.length}</span></button>` +
      `<button class="fl-cat ${state.cat === 'promo' ? 'on' : ''}" data-fl-cat="promo">À écouler <span class="fl-cat-ct">${ARRIVALS.filter((a) => saleActive(a.id)).length}</span></button>`;
    $('#fl-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-fl-cat]');
      if (!b) return;
      state.cat = b.dataset.flCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function stemCard(s, i) {
    const n = state.bouquet.stems[s.id] || 0;
    const onSale = saleActive(s.id);
    const u = unitPrice(s.id);
    return `<button class="fl-card ${n ? 'has-count' : ''}" data-fl-stem="${s.id}" style="--i:${i}">
      ${n ? `<span class="fl-card-count">${n}</span>` : ''}
      <span class="fl-card-art">${ART[s.id] || ''}</span>
      <span class="fl-card-name">${esc(s.label)}</span>
      <span class="fl-card-price">${u} MAD / tige${onSale ? ` · <s style="opacity:.6">${s.price}</s>` : ''}</span>
      ${onSale ? '<span class="fl-card-flag sale">à écouler −30 %</span>' : (s.flag ? `<span class="fl-card-flag">${esc(s.flag)}</span>` : '')}
      <span class="fl-card-quick" data-fl-stem-minus="${s.id}" aria-label="Retirer une tige">−</span>
    </button>`;
  }

  function presetCard(p, i) {
    return `<button class="fl-card is-preset" data-fl-preset="${p.id}" style="--i:${i}">
      <span class="fl-card-art">${ART[p.art] || ''}</span>
      <span class="fl-card-name">${esc(p.label)}</span>
      <span class="fl-card-price">${p.price} MAD · forfait</span>
      <span class="fl-card-flag">${esc(p.flag)}</span>
    </button>`;
  }

  function renderGrid() {
    const wrap = $('#fl-gridwrap', root);
    let html = '';
    let i = 0;
    if (state.cat === 'tous' || state.cat === 'signature') {
      if (state.cat === 'tous') {
        html += `<div class="fl-grid-head">Bouquets signatures</div><div class="fl-grid">${PRESETS.map((p) => presetCard(p, i++)).join('')}</div>`;
        html += `<div class="fl-grid-head">Tiges, au détail</div><div class="fl-grid">${STEMS.map((s) => stemCard(s, i++)).join('')}</div>`;
      } else {
        html += `<div class="fl-grid-head">Bouquets signatures, composition figée</div><div class="fl-grid">${PRESETS.map((p) => presetCard(p, i++)).join('')}</div>`;
      }
    } else if (state.cat === 'promo') {
      const sale = ARRIVALS.filter((a) => saleActive(a.id)).map((a) => STEM[a.id]);
      html += `<div class="fl-grid-head">Fleurs à écouler, reprisées −30 %</div>`;
      html += sale.length
        ? `<div class="fl-grid">${sale.map((s) => stemCard(s, i++)).join('')}</div>`
        : `<div class="fl-bq-empty" style="padding:40px 0;"><i data-lucide="sprout"></i><div>Rien à écouler, tout est frais.<br>Activez une promo depuis l'onglet Arrivages.</div></div>`;
    }
    wrap.innerHTML = html;
    wrap.onclick = (e) => {
      const minus = e.target.closest('[data-fl-stem-minus]');
      if (minus) {
        e.stopPropagation();
        removeStem(minus.dataset.flStemMinus);
        return;
      }
      const stem = e.target.closest('[data-fl-stem]');
      if (stem) { openStemSheet(stem.dataset.flStem); return; }
      const preset = e.target.closest('[data-fl-preset]');
      if (preset) addPreset(preset.dataset.flPreset);
    };
  }

  /* tap a stem → quick add 1 + open the count sheet for fine control */
  function addStem(stemId, n) {
    state.bouquet.stems[stemId] = (state.bouquet.stems[stemId] || 0) + (n || 1);
    afterBouquetChange();
  }
  function removeStem(stemId) {
    if (!state.bouquet.stems[stemId]) return;
    state.bouquet.stems[stemId]--;
    if (state.bouquet.stems[stemId] <= 0) delete state.bouquet.stems[stemId];
    afterBouquetChange();
  }
  function addPreset(presetId) {
    state.bouquet.presets.push({ id: presetId });
    afterBouquetChange();
    toast(`${PRESET[presetId].label} ajouté au bouquet`);
  }
  function afterBouquetChange() {
    renderGrid();
    renderBouquet();
    renderBadges();
    icons();
  }

  /* ── stem count sheet (fine control + sale flag) ── */
  function openStemSheet(stemId) {
    const s = STEM[stemId];
    const onSale = saleActive(stemId);
    const u = unitPrice(stemId);
    let n = state.bouquet.stems[stemId] || 1;
    const el = $('#fl-sheetm', root);
    const render = () => {
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="fl-sheet-head">
          <span class="fl-sheet-art">${ART[s.id] || ''}</span>
          <span class="fl-sheet-title"><h3>${esc(s.label)}</h3><span class="sub">${onSale ? 'À écouler, reprisée −30 %' : (s.note ? esc(s.note) : 'à la tige')}</span></span>
          <span class="fl-sheet-price">
            <span class="val" id="fl-sheet-total">${fmtMAD(u * n)}</span>
            <span class="per">${onSale ? `<span class="was">${s.price}</span> ` : ''}${u} MAD × ${n}</span>
          </span>
        </div>
        <div class="fl-stepper-big">
          <button id="fl-sheet-minus" aria-label="Moins">−</button>
          <span class="ct"><b id="fl-sheet-n">${n}</b><span>tige${n > 1 ? 's' : ''}</span></span>
          <button id="fl-sheet-plus" aria-label="Plus">+</button>
        </div>
        <div class="fl-sheet-foot">
          <button class="fl-btn secondary" data-fl-close>Annuler</button>
          <button class="fl-btn primary" id="fl-sheet-set"><i data-lucide="check"></i>Mettre <span id="fl-sheet-cta">${n}</span> au bouquet</button>
        </div>`;
      const refresh = () => {
        $('#fl-sheet-total', el).textContent = fmtMAD(u * n);
        $('#fl-sheet-n', el).textContent = n;
        $('#fl-sheet-cta', el).textContent = n;
        $('.fl-stepper-big .ct span', el).textContent = `tige${n > 1 ? 's' : ''}`;
        $('.fl-sheet-price .per', el).innerHTML = `${onSale ? `<span class="was">${s.price}</span> ` : ''}${u} MAD × ${n}`;
      };
      $('#fl-sheet-minus', el).onclick = () => { if (n > 1) { n--; refresh(); } };
      $('#fl-sheet-plus', el).onclick = () => { n++; refresh(); };
      $('#fl-sheet-set', el).onclick = () => {
        state.bouquet.stems[stemId] = n;
        closeVeil('#fl-sheet-veil');
        toast(`${s.label} × ${n}, sur le bouquet`);
        afterBouquetChange();
      };
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-sheet-veil'); });
      icons();
    };
    render();
    openVeil('#fl-sheet-veil');
  }

  /* ═══════════════════════ BOUQUET panel (live) ═══════════════════════ */
  function renderBouquet() {
    const b = state.bouquet;
    const el = $('#fl-bouquet', root);
    const totals = bqTotals(b);
    const count = bqStemCount(b);
    const size = bqSize(count);
    const empty = bqEmpty(b);
    const occ = OCC[b.occ];

    /* size bar fill: scale to ~26 stems max for a sensible meter */
    const pct = Math.min(100, Math.round((count / 26) * 100));

    el.innerHTML = `
      <div class="fl-bq-head">
        <div><span class="fl-bq-title">Bouquet</span> <span class="fl-bq-num">· ${b.num}</span></div>
        ${empty ? '' : '<button class="fl-bq-reset" id="fl-bq-reset">Vider</button>'}
      </div>

      <div class="fl-bq-size">
        <div class="fl-bq-size-top">
          <span class="fl-bq-size-lbl"><i data-lucide="flower-2"></i>${count} tige${count > 1 ? 's' : ''}${b.presets.length ? ` · ${b.presets.length} signature${b.presets.length > 1 ? 's' : ''}` : ''}</span>
          <span class="fl-bq-size-val">${size ? `${esc(size.label)} <b>(${size.id})</b>` : '—'}</span>
        </div>
        <div class="fl-bq-bar ${reduceMotion() ? 'reduce' : ''}"><i style="width:${pct}%"></i></div>
        <div class="fl-bq-ticks"><b class="${size && size.id === 'S' ? 'on' : ''}">S · &lt;10</b><b class="${size && size.id === 'M' ? 'on' : ''}">M · 10–20</b><b class="${size && size.id === 'L' ? 'on' : ''}">L · &gt;20</b></div>
      </div>

      <div class="fl-bq-lines" id="fl-bq-lines">
        ${empty ? `
          <div class="fl-bq-empty">
            <i data-lucide="flower"></i>
            <div>Le bouquet est vide.<br>Touchez une tige dans la grille, ou partez d'un bouquet signature.</div>
          </div>` : `
          ${b.presets.map((p, i) => presetLine(p, i)).join('')}
          ${Object.keys(b.stems).map((id) => stemLine(id)).join('')}`}
      </div>

      <div class="fl-wrap">
        <div class="fl-wrap-lbl">Emballage</div>
        <div class="fl-wrap-opts" id="fl-wrap-opts">
          ${WRAPS.map((w) => `<button class="fl-wrap-opt ${b.wrap === w.id ? 'on' : ''}" data-fl-wrap="${w.id}"><b>${esc(w.label)}</b><span>${w.price ? '+' + w.price + ' MAD' : 'inclus'}</span></button>`).join('')}
        </div>
      </div>

      <div class="fl-bq-foot">
        <div class="fl-bq-row">
          <span class="pcs"><i data-lucide="${occ.deuil ? 'leaf' : 'sticky-note'}"></i>${esc(occ.label)}${b.message ? ' · carte jointe' : ''}</span>
          ${totals.remise ? `<span>Remise B2B −15 % · −${totals.remise} MAD</span>` : ''}
        </div>
        <div class="fl-bq-total"><span class="lbl">Total${totals.b2b ? ' (remisé)' : ''}</span><span class="val">${fmtMAD(totals.total)}</span></div>
        <button class="fl-validate" id="fl-validate" ${empty ? 'disabled' : ''}>
          <i data-lucide="check-check"></i> Valider · ticket &amp; livraison
        </button>
      </div>`;

    const reset = $('#fl-bq-reset', el);
    if (reset) reset.onclick = () => { freshBouquet(); afterBouquetChange(); toast('Bouquet vidé'); };
    $('#fl-wrap-opts', el).onclick = (e) => {
      const w = e.target.closest('[data-fl-wrap]');
      if (!w) return;
      b.wrap = w.dataset.flWrap;
      renderBouquet(); icons();
    };
    $('#fl-validate', el).onclick = validateBouquet;
    $('#fl-bq-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-fl-bqminus]');
      const plus = e.target.closest('[data-fl-bqplus]');
      const presetRm = e.target.closest('[data-fl-presetrm]');
      if (presetRm) { b.presets.splice(+presetRm.dataset.flPresetrm, 1); afterBouquetChange(); return; }
      if (minus) { removeStem(minus.dataset.flBqminus); return; }
      if (plus) { addStem(plus.dataset.flBqplus, 1); return; }
    };
    icons();
  }

  function stemLine(id) {
    const s = STEM[id];
    const n = state.bouquet.stems[id];
    const onSale = saleActive(id);
    const u = unitPrice(id);
    return `<div class="fl-line">
      <span class="fl-line-art">${ART[id] || ''}</span>
      <span class="fl-line-mid">
        <span class="fl-line-name">${esc(s.label)}</span>
        <span class="fl-line-sub"><span class="unit">${u} MAD</span> / tige${onSale ? ' · à écouler' : ''}</span>
      </span>
      <span class="fl-line-right">
        <span class="fl-line-price">${fmtMAD(u * n)}</span>
        <span class="fl-line-qty">
          <button data-fl-bqminus="${id}" aria-label="Retirer">−</button><b>${n}</b><button data-fl-bqplus="${id}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }
  function presetLine(p, i) {
    const pr = PRESET[p.id];
    return `<div class="fl-line is-preset">
      <span class="fl-line-art">${ART[pr.art] || ''}</span>
      <span class="fl-line-mid">
        <span class="fl-line-name">${esc(pr.label)}</span>
        <span class="fl-line-sub">${esc(pr.sub)}</span>
      </span>
      <span class="fl-line-right">
        <span class="fl-line-price">${fmtMAD(pr.price)}</span>
        <button class="fl-line-qty" style="border:0;background:none;"><span data-fl-presetrm="${i}" style="font-size:11px;color:var(--danger-mute);font-weight:600;">Retirer</span></button>
      </span>
    </div>`;
  }

  /* ═══════════════════════ OCCASION & CARTE ═══════════════════════ */
  function renderOccasion() {
    const panel = $('[data-fl-panel="occasion"]', root);
    const b = state.bouquet;
    const occ = OCC[b.occ];
    panel.innerHTML = `
      <header class="fl-head">
        <div><h1>Occasion &amp; carte</h1><div class="fl-head-sub">L'occasion guide la composition, et la carte part imprimée avec le bouquet.</div></div>
      </header>
      <div class="fl-occ">
        <div class="fl-occ-inner">
          <div class="fl-occ-left">
            <div class="fl-sec-lbl">Occasion</div>
            <div class="fl-occ-grid" id="fl-occ-grid">
              ${OCCASIONS.map((o) => `
                <button class="fl-occ-card ${b.occ === o.id ? 'on' : ''} ${o.deuil ? 'deuil' : ''}" data-fl-occ="${o.id}">
                  <span class="fl-occ-ic"><i data-lucide="${o.icon}"></i></span>
                  <span class="fl-occ-l"><b>${esc(o.label)}</b><span>${esc(o.sub)}</span></span>
                  <span class="fl-occ-tick"><i data-lucide="check"></i></span>
                </button>`).join('')}
            </div>

            <div class="fl-sec-lbl">Carte message <span class="opt">· ${occ.deuil ? 'quelques mots, avec retenue' : 'un mot pour accompagner le bouquet'}</span></div>
            <textarea class="fl-card-write" id="fl-card-write" maxlength="180" placeholder="${occ.deuil ? 'Écrivez un mot sobre…' : 'Écrivez le message du client…'}">${esc(b.message)}</textarea>
            <div class="fl-card-meta">
              <span class="fl-card-count-c" id="fl-card-count">${b.message.length}/180</span>
            </div>
            <div class="fl-card-suggest" id="fl-card-suggest">
              ${occ.suggest.map((sg) => `<button class="fl-card-sg" data-fl-sg="${esc(sg)}">${esc(sg)}</button>`).join('')}
            </div>
          </div>

          <div class="fl-occ-right">
            <div class="fl-pv-rotate">Aperçu, petite carte</div>
            <div id="fl-card-pv"></div>
          </div>
        </div>
      </div>`;

    $('#fl-occ-grid', panel).onclick = (e) => {
      const c = e.target.closest('[data-fl-occ]');
      if (!c) return;
      b.occ = c.dataset.flOcc;
      state.occActive = b.occ;
      renderOccasion(); renderBouquet(); renderBadges(); icons();
    };
    const ta = $('#fl-card-write', panel);
    ta.oninput = () => {
      b.message = ta.value;
      $('#fl-card-count', panel).textContent = `${b.message.length}/180`;
      renderCardPreview();
    };
    $('#fl-card-suggest', panel).onclick = (e) => {
      const sg = e.target.closest('[data-fl-sg]');
      if (!sg) return;
      b.message = sg.dataset.flSg;
      ta.value = b.message;
      $('#fl-card-count', panel).textContent = `${b.message.length}/180`;
      renderCardPreview();
    };
    renderCardPreview();
    icons();
  }

  function renderCardPreview() {
    const host = $('#fl-card-pv', root);
    if (!host) return;
    const b = state.bouquet;
    const occ = OCC[b.occ];
    const signer = b.customer && b.customer.type === 'known' ? CUST[b.customer.id].name : null;
    const has = b.message.trim().length > 0;
    host.innerHTML = `
      <div class="fl-card-preview ${occ.deuil ? 'deuil' : ''}">
        <span class="fl-cp-spray">${ART[occ.deuil ? 'lys' : 'rose_rouge'] || ''}</span>
        <div class="fl-cp-occ">${esc(occ.deuil ? 'Avec nos condoléances' : occ.label)}</div>
        <div class="fl-cp-body ${has ? '' : 'placeholder'}">${has ? esc(b.message) : (occ.deuil ? 'Le mot du client apparaîtra ici.' : 'Le message du client apparaîtra ici, dans cette police.')}</div>
        ${signer ? `<div class="fl-cp-sign">— ${esc(signer)}</div>` : ''}
        <div class="fl-cp-foot">${pvReal() ? (esc(pvName('')) + (pvCity('') ? ' · ' + esc(pvCity('')) : '')) : 'Fleurs du Détroit · Tanger'}</div>
        <div class="fl-cp-actions">
          <button class="fl-btn secondary" id="fl-cp-print" style="flex:1;"><i data-lucide="printer"></i>Imprimer la carte</button>
        </div>
      </div>`;
    $('#fl-cp-print', host).onclick = () => {
      if (!has) { toast('Écrivez d\'abord le message de la carte'); return; }
      queueIfOffline('Carte');
      toast('Carte envoyée à l\'imprimante, jointe au bouquet');
    };
    icons();
  }

  /* ═══════════════════════ VALIDATE → recap (ticket + tag) ═══════════════════════ */
  function bouquetItemsSnapshot(b) {
    const items = [];
    b.presets.forEach((p) => { const pr = PRESET[p.id]; items.push({ kind: 'preset', id: p.id, label: pr.label, n: 1, total: pr.price }); });
    const loose = bqLooseCount(b);
    if (loose > 0) {
      const t = bqStemsTotal(b);
      items.push({ kind: 'compose', label: 'Bouquet composé', n: loose, total: Math.round(t) });
    }
    return items;
  }

  function validateBouquet() {
    const b = state.bouquet;
    if (bqEmpty(b)) return;
    if (!b.customer) { openClient(); toast('Attachez le client (ou « passage ») avant de valider'); return; }
    openRecap();
  }

  function recapReceipt(b, deliv) {
    const totals = bqTotals(b);
    const cust = b.customer && b.customer.type === 'known' ? CUST[b.customer.id] : { name: 'Client de passage', phone: '' };
    const occ = OCC[b.occ];
    const loose = bqLooseCount(b);
    return `<div class="fl-receipt">
      <div class="c b lg">FLEURS DU DÉTROIT</div>
      <div class="c mut">Marché central, Tanger<br>05 39 33 XX XX · propulsé par Kiwi</div>
      <hr>
      <div class="row"><span>Bon</span><span class="b">${b.num}</span></div>
      <div class="row"><span>Client</span><span>${esc(cust.name)}</span></div>
      <div class="row"><span>Occasion</span><span>${esc(occ.label)}</span></div>
      <hr>
      ${b.presets.map((p) => `<div class="row"><span class="nm">${esc(PRESET[p.id].label)}</span><span>${PRESET[p.id].price}</span></div>`).join('')}
      ${loose ? `<div class="row"><span class="nm">${loose} tige${loose > 1 ? 's' : ''} composées</span><span>${totals.stems}</span></div>` : ''}
      ${totals.wrap ? `<div class="row"><span class="nm">Emballage ${esc(WRAP[b.wrap].label)}</span><span>${totals.wrap}</span></div>` : ''}
      <hr>
      <div class="row"><span>Sous-total</span><span>${totals.sub} MAD</span></div>
      ${totals.remise ? `<div class="row"><span>Remise B2B −15 %</span><span>−${totals.remise} MAD</span></div>` : ''}
      <div class="row tot"><span>TOTAL</span><span>${totals.total} MAD</span></div>
      ${deliv ? `<div class="row"><span>Livraison</span><span>${esc(SLOT[deliv].short)} · ${esc(SLOT[deliv].hours)}</span></div>` : '<div class="row"><span>Retrait</span><span>boutique</span></div>'}
      ${b.message ? '<div class="row"><span>Carte</span><span>jointe</span></div>' : ''}
      <hr>
      <div class="c">${barcode(b.num, 26)}</div>
      <div class="c mut">${b.num} · merci, l'lah ikhellik</div>
    </div>`;
  }

  function openRecap() {
    const b = state.bouquet;
    const el = $('#fl-recapm', root);
    const occ = OCC[b.occ];
    const cust = b.customer && b.customer.type === 'known' ? CUST[b.customer.id] : { name: 'Client de passage' };
    const count = bqStemCount(b);
    let delivSlot = null;          /* null = retrait boutique */

    const render = () => {
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Ticket &amp; étiquette, ${b.num}</h3>
        <p class="modal-subtle">${count} tige${count > 1 ? 's' : ''} · ${esc(occ.label)} · ${esc(cust.name)}. Choisissez retrait ou livraison, puis encaissez.</p>
        <div class="fl-recap-grid">
          ${recapReceipt(b, delivSlot)}
          <div class="fl-recap-right">
            <div class="fl-recap-card">
              <div class="hd"><i data-lucide="bike"></i>Remise au client</div>
              <div class="fl-recap-deliv" id="fl-recap-deliv">
                <button class="fl-recap-opt ${delivSlot === null ? 'on' : ''}" data-fl-slot="none">
                  <span class="ic"><i data-lucide="shopping-bag"></i></span>
                  <span class="l"><b>Retrait boutique</b><span>Le client repart avec le bouquet</span></span>
                </button>
                ${SLOTS.map((s) => `
                  <button class="fl-recap-opt ${delivSlot === s.id ? 'on' : ''}" data-fl-slot="${s.id}">
                    <span class="ic"><i data-lucide="bike"></i></span>
                    <span class="l"><b>Livraison · ${esc(s.short)}</b><span>${esc(s.label)}</span></span>
                  </button>`).join('')}
              </div>
            </div>
            <div class="fl-recap-card">
              <div class="hd"><i data-lucide="tag"></i>Étiquette bouquet</div>
              <div class="fl-recap-tag">
                <div class="top"><span class="num">${b.num}</span><span class="occ">${esc(occ.deuil ? 'Condoléances' : occ.label)}</span></div>
                <div class="who">${esc(cust.name)}</div>
                <div class="what">${count} tige${count > 1 ? 's' : ''}${b.presets.length ? ` · ${b.presets.map((p) => PRESET[p.id].label).join(', ')}` : ''} · ${esc(WRAP[b.wrap].label)}</div>
                ${barcode(b.num, 24)}
                <div class="id">${b.num}-FDD</div>
              </div>
            </div>
            <div class="fl-recap-note"><i data-lucide="shield-check"></i>${delivSlot ? 'En livraison : adresse du destinataire demandée à l\'encaissement.' : 'L\'étiquette suit le bouquet, soin, occasion et client en un coup d\'œil.'}</div>
          </div>
        </div>
        <div class="fl-recap-foot">
          <button class="fl-btn secondary" id="fl-recap-print"><i data-lucide="printer"></i>Imprimer ticket + étiquette</button>
          <button class="fl-btn primary" id="fl-recap-pay"><i data-lucide="banknote"></i>${delivSlot ? 'Livraison &amp; encaissement' : 'Encaissement'}</button>
        </div>`;
      $$('[data-fl-close]', el).forEach((x) => { x.onclick = () => closeVeil('#fl-recap-veil'); });
      $('#fl-recap-deliv', el).onclick = (e) => {
        const o = e.target.closest('[data-fl-slot]');
        if (!o) return;
        delivSlot = o.dataset.flSlot === 'none' ? null : o.dataset.flSlot;
        render();
      };
      $('#fl-recap-print', el).onclick = () => toast('Envoyé, ticket (80 mm) + étiquette bouquet' + (b.message ? ' + carte' : ''));
      $('#fl-recap-pay', el).onclick = () => { closeVeil('#fl-recap-veil'); openPay({ b, delivSlot }); };
      icons();
    };
    render();
    openVeil('#fl-recap-veil');
  }

  /* ═══════════════════════ PAYMENT — caisse kit ═══════════════════════ */
  function openPay(ctx) {
    const el = $('#fl-paym', root);
    let order = ctx.order;             /* existing delivery being settled */
    const settle = !!ctx.settle;
    let total, cust, due;
    if (settle) {
      total = order.total;
      cust = { name: buyerLabel(order) };
      due = dueOf(order);
    } else {
      const totals = bqTotals(ctx.b);
      total = totals.total;
      cust = ctx.b.customer && ctx.b.customer.type === 'known' ? CUST[ctx.b.customer.id] : { name: 'Client de passage' };
      due = total;
    }
    const amountBase = settle ? due : total;

    const step1 = () => {
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${settle ? 'Encaisser le solde' : 'Encaissement'}</h3>
        <p class="modal-subtle">${settle ? order.id : ctx.b.num} · ${esc(cust.name)}${ctx.delivSlot ? ` · livraison ${esc(SLOT[ctx.delivSlot].short)}` : ''}</p>
        <div class="modal-amount size-md">${fmtMAD(amountBase)}</div>
        <div class="fl-pay-opts">
          ${settle ? `
          <button class="fl-pay-opt" data-fl-method="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="fl-pay-opt" data-fl-method="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
          </button>` : `
          <button class="fl-pay-opt" data-fl-paymode="now">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Payer maintenant</b><span>Espèces ou carte</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          <button class="fl-pay-opt" data-fl-paymode="acompte">
            <span class="ic"><i data-lucide="coins"></i></span>
            <span class="l"><b>Acompte</b><span>Le reste à la livraison ou au retrait</span></span>
          </button>
          ${ctx.delivSlot ? `
          <button class="fl-pay-opt" data-fl-paymode="pickup">
            <span class="ic"><i data-lucide="hand-coins"></i></span>
            <span class="l"><b>Payé à la livraison</b><span>Le livreur encaisse, solde sur le bon</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>` : ''}
          ${cust.b2b ? `
          <button class="fl-pay-opt" data-fl-paymode="compte">
            <span class="ic"><i data-lucide="building-2"></i></span>
            <span class="l"><b>Sur compte B2B</b><span>${esc(cust.name)}, facture fin de mois</span></span>
          </button>` : ''}`}
        </div>`;
      icons();
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-pay-veil'); });
      $$('[data-fl-paymode]', el).forEach((b) => {
        b.onclick = () => {
          const mode = b.dataset.flPaymode;
          if (mode === 'pickup') { finishFresh('pickup', null, 0, `Solde ${fmtMAD(total)} à encaisser à la livraison`); }
          else if (mode === 'compte') { finishFresh('compte', 'compte', 0, 'Sur compte B2B, ajouté à la facture du mois'); }
          else if (mode === 'acompte') { stepAcompte(); }
          else { stepMethod(total, 'now'); }
        };
      });
      $$('[data-fl-method]', el).forEach((b) => {
        b.onclick = () => (b.dataset.flMethod === 'especes' ? stepCash(amountBase, 'settle') : stepCard(amountBase, 'settle'));
      });
    };

    const stepAcompte = () => {
      let acompte = Math.max(20, Math.round(total / 2 / 10) * 10);
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Acompte</h3>
        <p class="modal-subtle">${ctx.b.num} · total ${fmtMAD(total)}</p>
        <div class="modal-amount size-md" id="fl-ac-val">${fmtMAD(acompte)}</div>
        <div class="fl-acompte-row">
          <button class="cash-preset" data-fl-ac="50">50</button>
          <button class="cash-preset" data-fl-ac="100">100</button>
          <button class="cash-preset" data-fl-ac="200">200</button>
          <button class="cash-preset" data-fl-ac="half">50 %</button>
        </div>
        <div class="cash-input-row" style="margin:10px 0 14px;">
          <label class="cash-input-label" for="fl-ac-input">Montant</label>
          <input class="cash-input mono" id="fl-ac-input" type="number" inputmode="numeric" min="10" max="${total}" step="10" value="${acompte}" />
        </div>
        <div class="fl-sheet-foot">
          <button class="fl-btn secondary" id="fl-ac-back">Retour</button>
          <button class="fl-btn primary" id="fl-ac-ok">Encaisser l'acompte</button>
        </div>`;
      icons();
      const refresh = () => { $('#fl-ac-val', el).textContent = fmtMAD(acompte); $('#fl-ac-input', el).value = acompte; };
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-pay-veil'); });
      $$('[data-fl-ac]', el).forEach((b) => {
        b.onclick = () => {
          acompte = b.dataset.flAc === 'half' ? Math.round(total / 2 / 5) * 5 : Math.min(total, +b.dataset.flAc);
          refresh();
        };
      });
      $('#fl-ac-input', el).oninput = (e) => { acompte = Math.max(0, Math.min(total, +e.target.value || 0)); $('#fl-ac-val', el).textContent = fmtMAD(acompte); };
      $('#fl-ac-back', el).onclick = step1;
      $('#fl-ac-ok', el).onclick = () => stepMethod(acompte, 'acompte');
    };

    const stepMethod = (amount, mode) => {
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${mode === 'acompte' ? 'Acompte' : 'Paiement'} · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${ctx.b.num} · ${esc(cust.name)}</p>
        <div class="fl-pay-opts" style="margin-top:8px;">
          <button class="fl-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="fl-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-pay-veil'); });
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.m === 'especes' ? stepCash(amount, mode) : stepCard(amount, mode));
      });
    };

    const stepCash = (amount, mode) => {
      let received = amount;
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${settle ? order.id : ctx.b.num} · ${esc(cust.name)}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="fl-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="fl-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
            <button class="cash-preset" data-add="500">+500</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="fl-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="fl-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#fl-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#fl-cash-ok', el).disabled = received < amount;
      };
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-pay-veil'); });
      $('#fl-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#fl-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#fl-cash-ok', el).onclick = () => done(amount, 'especes', mode, Math.max(0, received - amount));
    };

    const stepCard = (amount, mode) => {
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${settle ? order.id : ctx.b.num} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="fl-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="fl-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-pay-veil'); });
      setTimeout(() => {
        const disc = $('#fl-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#fl-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done(amount, 'carte', mode, 0), 900);
        });
      }, 1900);
    };

    const done = (amount, method, mode, rendu) => {
      if (settle) {
        order.pay.paid += amount;
        order.pay.method = method;
        /* Le solde d'une livraison est encaissé ici, pas à la prise de commande :
           c'est le seul moment où l'argent rentre vraiment. */
        postDay(amount, method, `Solde ${order.id} · ${buyerLabel(order)}`, order.id);
        closeVeil('#fl-pay-veil');
        toast(`Solde encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        if (typeof ctx.onSettled === 'function') ctx.onSettled();
        return;
      }
      finishFresh(mode, method, amount, mode === 'acompte'
        ? `Acompte ${fmtMAD(amount)} encaissé, solde ${fmtMAD(total - amount)} ${ctx.delivSlot ? 'à la livraison' : 'au retrait'}`
        : `Encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    };

    /* commit a fresh bouquet → optional delivery, then reset the composer */
    const finishFresh = (mode, method, paid, msg) => {
      closeVeil('#fl-pay-veil');
      const b = ctx.b;
      /* `pickup` et `compte` ne prennent rien au comptoir : seul l'argent
         réellement encaissé (paiement complet ou acompte) est une recette,
         le solde sera journalisé au passage par la branche `settle`. */
      if (paid > 0) postDay(paid, method, `Bouquet · ${OCC[b.occ] ? OCC[b.occ].label : 'Composition'}`, b.num);
      const cId = b.customer && b.customer.type === 'known' ? b.customer.id : null;
      if (ctx.delivSlot) {
        const created = mkDelivery({
          id: `F-${deliverySeq}`, slot: ctx.delivSlot, occ: b.occ, status: 'prep',
          recipient: { name: 'Destinataire à préciser', phone: '', addr: 'Adresse à renseigner', district: 'Tanger' },
          buyerId: cId, buyerName: cId ? null : 'Client de passage',
          items: bouquetItemsSnapshot(b), total: total,
          pay: { mode, method, paid }, createdMin: 0,
          message: b.message, photo: false,
        });
        DELIVERIES.unshift(created);
        deliverySeq++;
        toast(`Livraison ${created.id} créée, créneau ${SLOT[ctx.delivSlot].short}. Pensez à préciser l'adresse.`);
        queueIfOffline(`Livraison ${created.id}`);
      } else {
        queueIfOffline(`Bon ${b.num}`);
        toast(`${b.num} encaissé, bouquet remis`);
      }
      bouquetSeq++;
      freshBouquet();
      renderBouquet();
      renderBadges();
      if (state.view === 'livraisons') renderDeliveries();
      toast(msg);
      icons();
    };

    step1();
    openVeil('#fl-pay-veil');
  }

  /* ═══════════════════════ LIVRAISONS DU JOUR ═══════════════════════ */
  function payPill(d) {
    if (d.pay.mode === 'compte') return '<span class="fl-pill ok">Compte B2B</span>';
    const due = dueOf(d);
    if (due <= 0) return '<span class="fl-pill ok">Payé</span>';
    if (d.pay.paid > 0) return `<span class="fl-pill due">Acompte · solde ${due} MAD</span>`;
    return `<span class="fl-pill due">À encaisser · ${due} MAD</span>`;
  }
  function statusPill(d) {
    if (d.status === 'done') return '<span class="fl-pill ok"><i data-lucide="check"></i>Livré</span>';
    if (d.status === 'route') return '<span class="fl-pill route"><i data-lucide="bike"></i>En route</span>';
    return '<span class="fl-pill prep"><i data-lucide="flower"></i>À préparer</span>';
  }
  function matchDeliv(d, q) {
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    const hay = `${d.id} ${d.recipient.name} ${d.recipient.district} ${buyerLabel(d)}`.toLowerCase();
    return hay.includes(q.toLowerCase()) || (digits.length >= 2 && (d.recipient.phone || '').replace(/\D/g, '').includes(digits));
  }

  function delivCard(d) {
    const occ = OCC[d.occ];
    const itemsLabel = d.items.map((it) => it.kind === 'preset' ? `${it.n > 1 ? it.n + '× ' : ''}${it.label}` : `${it.label} · ${it.n} tiges`).join(' + ');
    return `<button class="fl-dcard ${occ.deuil ? 'deuil' : ''}" data-fl-deliv="${d.id}">
      <span class="fl-dcard-top">
        <span class="fl-dcard-id">${d.id}</span>
        <span class="fl-dcard-occ">${esc(occ.deuil ? 'Condoléances' : occ.label)}</span>
      </span>
      <span class="fl-dcard-to"><i data-lucide="user"></i>${esc(d.recipient.name)}</span>
      <span class="fl-dcard-addr"><i data-lucide="map-pin"></i>${esc(d.recipient.addr)} · ${esc(d.recipient.district)}</span>
      <span class="fl-dcard-buyer">Offert par ${esc(buyerLabel(d))} · ${esc(itemsLabel)}</span>
      <span class="fl-dcard-meta">
        ${statusPill(d)}
        ${payPill(d)}
        ${d.photo ? '<span class="fl-pill photo"><i data-lucide="camera"></i>Photo</span>' : ''}
      </span>
    </button>`;
  }

  function renderDeliveries() {
    const panel = $('[data-fl-panel="livraisons"]', root);
    const q = state.delivQuery;
    const active = DELIVERIES.filter((d) => d.status !== 'done').length;
    const done = DELIVERIES.filter((d) => d.status === 'done').length;
    panel.innerHTML = `
      <header class="fl-head">
        <div><h1>Livraisons du jour</h1><div class="fl-head-sub">${active} en cours · ${done} livrée${done > 1 ? 's' : ''}, le destinataire n'est pas toujours l'acheteur</div></div>
        <div class="fl-head-right">
          <div class="fl-chip" style="cursor:default;"><i data-lucide="calendar"></i>${fmtDay(new Date())}</div>
        </div>
      </header>
      <div class="fl-deliv">
        <div class="fl-slots-board">
          ${SLOTS.map((s) => {
            const list = DELIVERIES.filter((d) => d.slot === s.id && matchDeliv(d, q));
            const pending = list.filter((d) => d.status !== 'done').length;
            return `<div class="fl-scol">
              <div class="fl-scol-head">
                <span class="clock"><i data-lucide="clock"></i></span>
                <span class="l"><b>${esc(s.label)}</b><span>${esc(s.short)} · ${pending} à livrer</span></span>
                <span class="ct">${list.length}</span>
              </div>
              ${list.map(delivCard).join('') || '<div class="fl-bq-empty" style="min-height:auto;padding:18px 10px;border:1px dashed var(--line);border-radius:12px;"><div>Aucune livraison.</div></div>'}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    panel.onclick = (e) => {
      const b = e.target.closest('[data-fl-deliv]');
      if (b) openDelivDetail(b.dataset.flDeliv);
    };
    icons();
  }

  /* ── delivery detail: status flow, photo proof, settle, WhatsApp ── */
  function openDelivDetail(id) {
    const d = findDelivery(id);
    if (!d) return;
    const el = $('#fl-dtm', root);
    const occ = OCC[d.occ];
    const due = dueOf(d);
    const flowIdx = STATUS_FLOW.indexOf(d.status);

    el.innerHTML = `
      <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="fl-dt-head">
        <div>
          <h3>${d.id}</h3>
          <div class="fl-dt-sub">
            <span class="fl-pill ${occ.deuil ? '' : 'ok'}">${esc(occ.deuil ? 'Condoléances' : occ.label)}</span>
            <span class="fl-pill"><i data-lucide="clock"></i>${esc(SLOT[d.slot].label)}</span>
            ${payPill(d)}
          </div>
        </div>
      </div>

      <div class="fl-dt-block">
        <div class="fl-dt-block-lbl">Destinataire ${d.buyerId || d.buyerName ? `· offert par ${esc(buyerLabel(d))}` : ''}</div>
        <div class="fl-dt-recip">
          <b>${esc(d.recipient.name)}</b>
          <div class="addr"><i data-lucide="map-pin"></i>${esc(d.recipient.addr)} · ${esc(d.recipient.district)}, Tanger</div>
          ${d.recipient.phone ? `<div class="tel"><i data-lucide="phone"></i>${esc(d.recipient.phone)}</div>` : ''}
          ${d.note ? `<div class="note">${esc(d.note)}</div>` : ''}
        </div>
      </div>

      <div class="fl-dt-block">
        <div class="fl-dt-block-lbl">Suivi</div>
        <div class="fl-dt-flow" id="fl-dt-flow">
          ${STATUS_FLOW.map((s, i) => {
            const cls = d.status === s ? `on ${s}` : (i < flowIdx ? 'done-past' : '');
            const ic = s === 'prep' ? 'flower' : s === 'route' ? 'bike' : 'check-check';
            return `<button class="fl-dt-step ${cls}" data-fl-st="${s}"><i data-lucide="${ic}"></i>${esc(STATUS[s].label)}</button>`;
          }).join('')}
        </div>
        ${d.doneAt ? `<div style="font-size:11.5px;color:var(--ink-3);margin-top:8px;">Livré ${fmtDT(d.doneAt)}.</div>` : ''}
      </div>

      <div class="fl-dt-block">
        <div class="fl-dt-block-lbl">Preuve, photo avant départ</div>
        <button class="fl-dt-photo ${d.photo ? 'done' : ''}" id="fl-dt-photo">
          <span class="th">${ART[d.occ === 'deuil' ? 'lys' : (d.items[0] && d.items[0].kind === 'preset' ? PRESET[d.items[0].id].art : 'rose_rouge')] || ''}</span>
          <span class="l"><b>${d.photo ? 'Photo du bouquet prise' : 'Prendre la photo du bouquet'}</b><span>${d.photo ? 'Jointe au bon, le client voit ce qui part.' : 'Avant le départ, protège le fleuriste et rassure le client.'}</span></span>
          <span class="tick"><i data-lucide="${d.photo ? 'check' : 'camera'}"></i></span>
        </button>
      </div>

      <div class="fl-dt-actions">
        ${due > 0 ? `<button class="fl-btn secondary" id="fl-dt-pay"><i data-lucide="banknote"></i>Encaisser ${due} MAD</button>` : ''}
        ${d.status !== 'done' ? `<button class="fl-btn secondary" id="fl-dt-wa"><i data-lucide="message-circle"></i>Prévenir le destinataire</button>` : ''}
        ${d.status === 'prep' ? `<button class="fl-btn primary" id="fl-dt-go"><i data-lucide="bike"></i>Partir en livraison</button>` : ''}
        ${d.status === 'route' ? `<button class="fl-btn primary" id="fl-dt-done"><i data-lucide="check-check"></i>Marquer livré</button>` : ''}
      </div>`;
    openVeil('#fl-dt-veil');
    icons();

    $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-dt-veil'); });
    $('#fl-dt-flow', el).onclick = (e) => {
      const b = e.target.closest('[data-fl-st]');
      if (!b) return;
      setDelivStatus(d, b.dataset.flSt);
    };
    $('#fl-dt-photo', el).onclick = () => openDelivPhoto(d);
    const payB = $('#fl-dt-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#fl-dt-veil');
      openPay({ order: d, settle: true, onSettled: () => { openDelivDetail(d.id); refreshOps(); } });
    };
    const waB = $('#fl-dt-wa', el);
    if (waB) waB.onclick = () => openWa(d);
    const goB = $('#fl-dt-go', el);
    if (goB) goB.onclick = () => {
      if (!d.photo) { toast('Prenez la photo du bouquet avant le départ'); openDelivPhoto(d); return; }
      setDelivStatus(d, 'route');
    };
    const doneB = $('#fl-dt-done', el);
    if (doneB) doneB.onclick = () => setDelivStatus(d, 'done');
  }

  function setDelivStatus(d, s) {
    if (s === 'route' && !d.photo) { toast('Photo du bouquet requise avant « en route »'); openDelivPhoto(d); return; }
    d.status = s;
    if (s === 'done') d.doneAt = new Date();
    else if (d.doneAt) d.doneAt = null;
    queueIfOffline('Statut livraison');
    if (s === 'route') toast(`${d.id}, en route vers ${recipFirst(d)}`);
    else if (s === 'done') toast(`${d.id} livré à ${esc(d.recipient.name)}, merci envoyé`);
    openDelivDetail(d.id);
    refreshOps();
  }

  function openDelivPhoto(d) {
    const el = $('#fl-photom', root);
    const artKey = d.occ === 'deuil' ? 'lys' : (d.items[0] && d.items[0].kind === 'preset' ? PRESET[d.items[0].id].art : 'pivoine');
    el.innerHTML = `
      <div class="fl-vf">
        <div class="fl-vf-hint">Cadrez le bouquet fini, face caméra…</div>
        ${(ART[artKey] || '').replace('class="fl-art"', 'class="fl-art art"')}
        <span class="fl-vf-corner tl"></span><span class="fl-vf-corner tr"></span>
        <span class="fl-vf-corner bl"></span><span class="fl-vf-corner br"></span>
        <div class="fl-vf-flash" id="fl-vf-flash"></div>
      </div>
      <div class="fl-vf-foot">
        <button class="fl-shutter" id="fl-shutter" aria-label="Prendre la photo"></button>
        <button class="fl-vf-close" id="fl-vf-close">Fermer</button>
      </div>`;
    openVeil('#fl-photo-veil');
    $('#fl-shutter', el).onclick = () => {
      const flash = $('#fl-vf-flash', el);
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      d.photo = true;
      setTimeout(() => {
        closeVeil('#fl-photo-veil');
        queueIfOffline('Photo bouquet');
        toast(`Photo de ${d.id} enregistrée, jointe au bon de livraison`);
        if ($('#fl-dt-veil', root).classList.contains('is-open')) openDelivDetail(d.id);
        refreshOps();
      }, 420);
    };
    $('#fl-vf-close', el).onclick = () => closeVeil('#fl-photo-veil');
  }

  /* ═══════════════════════ WHATSAPP — destinataire / acheteur ═══════════════════════ */
  function waMessage(d) {
    const occ = OCC[d.occ];
    const first = recipFirst(d);
    const shopNm = pvName('Fleurs du Détroit') || 'notre boutique';
    if (occ.deuil) {
      return `Bonjour, une composition de la part de ${buyerLabel(d)} sera remise aujourd'hui (${SLOT[d.slot].hours}) à l'adresse indiquée.`
        + `\nAvec nos sincères pensées, ${shopNm}.`;
    }
    return `Sba7 lkhir ${first}, un bouquet vous attend de la part de ${buyerLabel(d)}.`
      + `\nLivraison prévue aujourd'hui, créneau ${SLOT[d.slot].hours}.`
      + `\n— ${shopNm}, via Kiwi`;
  }

  function openWa(d) {
    const el = $('#fl-wam', root);
    const occ = OCC[d.occ];
    let withPhoto = d.photo;
    el.innerHTML = `
      <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, prévenir le destinataire</h3>
      <p class="modal-subtle">${esc(d.recipient.name)} ${d.recipient.phone ? `· ${esc(d.recipient.phone)}` : '· numéro manquant'}</p>
      <div class="fl-wa-bubblewrap">
        <div class="fl-wa-bubble">
          <textarea id="fl-wa-text">${esc(waMessage(d))}</textarea>
          <div class="fl-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <button class="fl-wa-photo ${withPhoto ? 'on' : ''}" id="fl-wa-photo" ${d.photo ? '' : 'disabled style="opacity:.5"'}>
        <span class="th">${ART[occ.deuil ? 'lys' : 'rose_rouge'] || ''}</span>
        <span class="l">${d.photo ? 'Joindre la photo du bouquet, le destinataire voit ce qui arrive' : 'Aucune photo encore, prenez-la depuis le bon'}</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="fl-sheet-foot">
        <button class="fl-btn ghost" data-fl-close>Plus tard</button>
        <button class="fl-btn primary" id="fl-wa-send" ${d.recipient.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#fl-wa-veil');
    icons();
    $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-wa-veil'); });
    const photoBtn = $('#fl-wa-photo', el);
    if (d.photo) photoBtn.onclick = () => { withPhoto = !withPhoto; photoBtn.classList.toggle('on', withPhoto); };
    /* Ce bouton disait « WhatsApp envoyé » sans rien envoyer : le ou la
       destinataire n'a jamais été prévenu·e de la livraison, et la boutique le
       croyait fait. Une page web ne peut pas envoyer un WhatsApp toute seule, on
       ouvre donc le brouillon pré-rempli (texte tel qu'édité) et c'est la
       boutique qui appuie sur envoyer. Le lien ne transporte pas la photo du
       bouquet, on le dit au lieu de le prétendre. */
    $('#fl-wa-send', el).onclick = () => {
      const txt = $('#fl-wa-text', el);
      const body = txt ? txt.value : waMessage(d);
      const num = String(d.recipient.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Pas de numéro pour ${d.recipient.name}, ajoutez-le au bon`); return; }
      closeVeil('#fl-wa-veil');
      queueIfOffline('Notification WhatsApp');
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${d.recipient.name}, appuyez sur envoyer${withPhoto ? ' · joignez la photo dans WhatsApp' : ''}`);
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
    };
  }

  /* ═══════════════════════ ARRIVAGES & FRAÎCHEUR ═══════════════════════ */
  function renderArrivages() {
    const panel = $('[data-fl-panel="arrivages"]', root);
    const saleCt = ARRIVALS.filter((a) => saleActive(a.id)).length;
    const totalStems = ARRIVALS.reduce((s, a) => s + a.qty, 0);
    panel.innerHTML = `
      <header class="fl-head">
        <div><h1>Arrivages &amp; fraîcheur</h1><div class="fl-head-sub">L'arrivage du matin, et ce qu'il faut écouler avant la fermeture</div></div>
      </header>
      <div class="fl-arriv">
        <div class="fl-arriv-inner">
          <div class="fl-arriv-banner">
            <span class="ic"><i data-lucide="sprout"></i></span>
            <span class="l"><b>${totalStems} tiges reçues ce matin · ${saleCt} variété${saleCt > 1 ? 's' : ''} à écouler</b><span>Activez une promo −30 % : le prix se met à jour partout, en boutique comme à la composition.</span></span>
          </div>
          <div class="fl-arriv-list" id="fl-arriv-list">
            ${ARRIVALS.map(arrivalRow).join('')}
          </div>
          <div class="fl-arriv-foot"><i data-lucide="shield-check"></i>Une fleur fraîche tient le bouquet, écouler au bon moment, c'est la marge et la réputation.</div>
        </div>
      </div>`;
    $('#fl-arriv-list', panel).onclick = (e) => {
      const t = e.target.closest('[data-fl-sale]');
      if (!t) return;
      toggleSale(t.dataset.flSale);
    };
    icons();
  }

  function arrivalRow(a) {
    const s = STEM[a.id];
    const onSale = saleActive(a.id);
    const u = unitPrice(a.id);
    const fr = FRESH[a.fresh];
    return `<div class="fl-arow ${onSale ? 'is-sale' : ''}">
      <span class="fl-arow-art">${ART[a.id] || ''}</span>
      <span class="fl-arow-mid">
        <span class="fl-arow-name">${esc(s.label)}<span class="fl-fresh-dot ${a.fresh}"></span></span>
        <span class="fl-arow-sub">
          <span class="fresh"><i data-lucide="leaf"></i>${esc(fr.label)} · ${esc(fr.sub)}</span>
          <span>· ${a.qty} tiges${a.batch ? ' · ' + esc(a.batch) : ''}</span>
        </span>
      </span>
      <span class="fl-arow-right">
        <span class="fl-arow-price ${onSale ? 'sale' : ''}">${onSale ? `<span class="was">${s.price}</span>` : ''}${u} MAD</span>
        <button class="fl-sale-toggle ${onSale ? 'on' : ''}" data-fl-sale="${a.id}"><i data-lucide="percent"></i>${onSale ? 'En promo' : 'Écouler −30 %'}</button>
      </span>
    </div>`;
  }

  function toggleSale(stemId) {
    saleState[stemId] = !saleState[stemId];
    queueIfOffline('Promo arrivage');
    toast(saleState[stemId]
      ? `${STEM[stemId].label} en promo −30 %, ${unitPrice(stemId)} MAD la tige`
      : `${STEM[stemId].label}, retour au prix plein`);
    renderArrivages();
    /* live reprice everywhere the stem appears — grid prices + bouquet total */
    renderCats();
    renderGrid();
    renderBouquet();
    renderBadges();
    icons();
  }

  /* ═══════════════════════ CLIENT — phone-first ═══════════════════════ */
  function openClient() {
    const el = $('#fl-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="fl-modal-x" data-fl-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">L'acheteur, pour la fiche, l'historique et la carte. Le destinataire se renseigne à la livraison.</p>
        <div class="fl-phone-in"><i data-lucide="phone"></i>
          <input id="fl-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="fl-cl-results" id="fl-cl-results">
            ${hits.map((c) => `
              <button class="fl-cl-row" data-fl-cl="${c.id}">
                <span class="fl-cl-ava ${c.b2b ? 'b2b' : ''}">${c.b2b ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
                <span class="fl-cl-mid">
                  <span class="fl-cl-name">${esc(c.name)} ${c.b2b ? '<span class="fl-b2b-chip">B2B</span>' : ''}</span>
                  <span class="fl-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="fl-cl-right"><b>${c.orders} cmd</b></span>
              </button>`).join('') || `<div class="fl-bq-empty" style="min-height:auto;padding:16px;">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="fl-cl-new" id="fl-cl-new"><i data-lucide="user-plus"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="fl-sheet-foot" style="margin-top:10px;">
            <button class="fl-btn ghost" id="fl-cl-guest">Client de passage, sans fiche</button>
          </div>` : `
          <div class="fl-cl-form">
            <input class="fl-in" id="fl-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="fl-in" id="fl-cl-tel" inputmode="tel" placeholder="Téléphone (optionnel)" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <div class="fl-sheet-foot" style="margin-top:4px;">
              <button class="fl-btn secondary" id="fl-cl-back">Retour</button>
              <button class="fl-btn primary" id="fl-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#fl-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#fl-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-fl-close]', el).forEach((b) => { b.onclick = () => closeVeil('#fl-client-veil'); });
      $$('[data-fl-cl]', el).forEach((b) => {
        b.onclick = () => {
          state.bouquet.customer = { type: 'known', id: b.dataset.flCl };
          closeVeil('#fl-client-veil');
          const c = CUST[b.dataset.flCl];
          toast(c.b2b ? `${c.name}, compte B2B, remise −15 % appliquée` : `${c.name}, ${c.orders} commandes, bienvenue`);
          renderBouquet();
          if (state.view === 'occasion') renderCardPreview();
          icons();
        };
      });
      const newBtn = $('#fl-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#fl-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.bouquet.customer = { type: 'guest' };
        closeVeil('#fl-client-veil');
        renderBouquet(); icons();
      };
      const back = $('#fl-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#fl-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#fl-cl-name', el).value.trim();
        const tel = $('#fl-cl-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, orders: 0, prefs: [] };
        CUSTOMERS.unshift(c); CUST[id] = c;
        state.bouquet.customer = { type: 'known', id };
        closeVeil('#fl-client-veil');
        toast(`Fiche créée, ${name}`);
        renderBouquet();
        if (state.view === 'occasion') renderCardPreview();
        icons();
      };
    };
    render('');
    openVeil('#fl-client-veil');
    icons();
    setTimeout(() => { const i = $('#fl-cl-q', el); if (i) i.focus(); }, 60);
  }
  function recoPanel(c) {
    return `<div class="fl-reco">
      <div class="fl-reco-head"><i data-lucide="sparkles"></i>${esc(c.name)}, client reconnu</div>
      <div class="fl-reco-rows">
        ${(c.prefs || []).map((p) => `<div class="fl-reco-row"><i data-lucide="heart"></i>${esc(p)}</div>`).join('')}
        ${c.contact ? `<div class="fl-reco-row"><i data-lucide="user"></i>${esc(c.contact)}</div>` : ''}
        <div class="fl-reco-row"><i data-lucide="history"></i>${c.orders} commande${c.orders > 1 ? 's' : ''} chez ${esc(pvName('Fleurs du Détroit') || 'la boutique')}</div>
      </div>
    </div>`;
  }

  /* re-render whatever ops view is behind a modal + the rail badges */
  function refreshOps() {
    renderBadges();
    if (state.view === 'livraisons') renderDeliveries();
    if (state.view === 'arrivages') renderArrivages();
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
      toast('Mode hors-ligne, la boutique continue, tout est mis en file');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#fl-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.fl-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.fl-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'fl-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#fl-offline-note', root);
    note.hidden = !state.offline;
    $('#fl-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'fleuriste',
    greet: {
      line1: 'Sba7 lkhir Rim,',
      em: 'marhba.',
      sub: 'Fleurs du Détroit <em>·</em> l\'arrivage du matin est en boutique',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) renderAll(); },
  });
})();
