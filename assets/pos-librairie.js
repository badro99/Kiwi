/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · LIBRAIRIE — Librairie Al Boughaz (PIN 0012), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Une librairie-papeterie du Petit Socco, à Tanger. Hassan tient la caisse :
 * il vend des livres et de la papeterie au rayon, mais ce qui le distingue de
 * la grande surface, c'est DEUX gestes que seul un libraire de quartier fait :
 *
 *   · LA COMMANDE SPÉCIALE — « ce titre, je vous le fais venir » : on note le
 *     titre + l'ISBN + le téléphone (+ acompte facultatif), statut commandé →
 *     arrivé → retiré, et au moment où le carton arrive, un WhatsApp part :
 *     « il est arrivé, gardez-le moi ? ».
 *   · LA LISTE SCOLAIRE — école + niveau (G.S. Ibn Khaldoun · CM2) → tout le
 *     cartable se déplie, prérempli (manuels + cahiers + fournitures), un seul
 *     « Tout ajouter », pastilles de stock par ligne, total famille. Mode
 *     rentrée allumé : c'est la saison.
 *
 * Réutilise le kit caisse (.modal-veil, .modal, .cash-*, .reader-*) et le
 * #toast-stack partagé. V1 = couche opérationnelle : la carte part au lecteur
 * partenaire, sans encaissement Kiwi. Seed MID-RENTRÉE : une matinée de
 * septembre déjà bien remplie, 4 commandes spéciales ouvertes (une arrivée à
 * notifier), deux listes scolaires prêtes.
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
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const H = 3600 * 1000, DAY = 24 * H;
  const sinceDays = (d) => {
    const days = Math.round((Date.now() - d.getTime()) / DAY);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} j`;
    return fmtDay(d);
  };

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

  /* Deterministic pseudo-barcode (EAN-lookalike) from an ISBN/seed. */
  function barcode(seed, h) {
    h = h || 28;
    let bars = '', x = 0, s = 11;
    const len = Math.max(String(seed).length * 4, 30);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + String(seed).charCodeAt(i % String(seed).length) + i * 13) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── book-spine + papeterie line-art ─────────────────
     One visual voice: forest strokes, mint-tint fills, 64×64 grid. A bookshop
     sells objects you recognize on a shelf — so the grid IS drawn spines and
     supplies, not text rows. Each art keyed by a "shape" the catalog points to. */
  const art = (inner) => `<svg class="lb-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    /* a closed novel, standing — the default book spine */
    roman: art(`<path class="fill" d="M20 9h26a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H20z"/><path d="M20 9h26a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H20z"/><path d="M20 9c-3 0-5 2-5 5v34c0-3 2-5 5-5"/><path d="M20 43c-3 0-5 2-5 5"/><path class="thin" d="M25 18h18M25 24h18M25 30h13"/>`),
    /* an open book — essays / general */
    essai: art(`<path class="fill" d="M32 18c-5-4-12-5-20-4v34c8-1 15 0 20 4 5-4 12-5 20-4V14c-8-1-15 0-20 4z"/><path d="M32 18c-5-4-12-5-20-4v34c8-1 15 0 20 4 5-4 12-5 20-4V14c-8-1-15 0-20 4z"/><path d="M32 18v34"/><path class="thin" d="M17 22c4-.6 8-.4 11 1M17 29c4-.6 8-.4 11 1M36 23c4-1.4 8-1.6 11-1M36 30c4-1.4 8-1.6 11-1"/>`),
    /* a kid's book — rounded, a star on the cover */
    jeunesse: art(`<path class="fill" d="M19 11h27a2 2 0 0 1 2 2v38a2 2 0 0 1-2 2H19z"/><path d="M19 11h27a2 2 0 0 1 2 2v38a2 2 0 0 1-2 2H19z"/><path d="M19 11c-3 0-5 2-5 5v32c0-3 2-5 5-5"/><path class="soft" d="M33 20l2.4 4.8 5.3.8-3.8 3.7.9 5.3-4.8-2.5-4.8 2.5.9-5.3-3.8-3.7 5.3-.8z"/>`),
    /* school manual — a textbook with a label band */
    scolaire: art(`<path class="fill" d="M20 9h26a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H20z"/><path d="M20 9h26a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H20z"/><path d="M20 9c-3 0-5 2-5 5v34c0-3 2-5 5-5"/><rect class="soft" x="25" y="17" width="19" height="12" rx="2"/><path class="thin" d="M25 38h18M25 44h12"/>`),
    /* a dictionary — fat book, thumb index notch */
    dico: art(`<path class="fill" d="M18 10h28a3 3 0 0 1 3 3v38a3 3 0 0 1-3 3H18z"/><path d="M18 10h28a3 3 0 0 1 3 3v38a3 3 0 0 1-3 3H18z"/><path d="M18 10c-3 0-5 2-5 5v34c0-3 2-5 5-5"/><path d="M49 20h-4v6h4M49 31h-4v6h4"/><path class="thin" d="M23 19h16M23 25h16M23 31h12"/>`),
    /* a comic / BD album — landscape panel feel */
    bd: art(`<path class="fill" d="M14 13h36a2 2 0 0 1 2 2v34a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z"/><path d="M14 13h36a2 2 0 0 1 2 2v34a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z"/><path class="thin" d="M32 13v38M12 32h20M32 24h20"/><circle class="thin" cx="22" cy="22" r="3"/>`),
    /* a stack of notebooks */
    cahier: art(`<path class="fill" d="M16 16h28a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3H16z"/><path d="M16 16h28a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3H16z"/><path d="M16 16v32"/><circle class="thin" cx="16" cy="22" r="1.3"/><circle class="thin" cx="16" cy="29" r="1.3"/><circle class="thin" cx="16" cy="36" r="1.3"/><circle class="thin" cx="16" cy="43" r="1.3"/><path class="thin" d="M24 24h16M24 30h16M24 36h12"/>`),
    /* a pen */
    stylo: art(`<path class="fill" d="M40 10l8 8-26 26-10 2 2-10z"/><path d="M40 10l8 8-26 26-10 2 2-10z"/><path d="M36 14l8 8"/><path class="thin" d="M14 50l4-4"/><path d="M16 44l4 4"/>`),
    /* a pencil */
    crayon: art(`<path class="fill" d="M44 8l10 10-30 30-12 2 2-12z"/><path d="M44 8l10 10-30 30-12 2 2-12z"/><path d="M14 38l12 12"/><path d="M44 8l-6 6 10 10 6-6z"/><path class="thin" d="M14 50l3-3"/>`),
    /* a geometry compass */
    compas: art(`<circle cx="32" cy="13" r="3.4"/><path class="fill" d="M30 16 18 52h6l8-22 8 22h6L34 16z"/><path d="M30 16 18 52h6M34 16l12 36h-6"/><path d="M32 30l-8 22M32 30l8 22"/><path class="thin" d="M24 52l-2 4M40 52l2 4"/>`),
    /* a ruler / geometry set */
    regle: art(`<path class="fill" d="M10 24h44a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2z"/><path d="M10 24h44a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2z"/><path class="thin" d="M16 24v6M24 24v9M32 24v6M40 24v9M48 24v6"/>`),
    /* a backpack — cartable / fourniture bundle icon */
    cartable: art(`<path class="fill" d="M16 26c0-7 6-12 16-12s16 5 16 12v24a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z"/><path d="M16 26c0-7 6-12 16-12s16 5 16 12v24a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z"/><path d="M24 16c0-4 3-6 8-6s8 2 8 6"/><path class="fill" d="M22 34h20v10H22z"/><path d="M22 34h20v10H22z"/><path class="thin" d="M30 39h4"/>`),
    /* generic art-book / beaux livres */
    beau: art(`<path class="fill" d="M19 9h27a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H19z"/><path d="M19 9h27a3 3 0 0 1 3 3v40a3 3 0 0 1-3 3H19z"/><path d="M19 9c-3 0-5 2-5 5v34c0-3 2-5 5-5"/><rect class="soft" x="25" y="17" width="18" height="14" rx="2"/><path class="thin" d="M28 27l4-5 4 4 3-3"/><circle class="thin" cx="30" cy="21" r="1.4"/>`),
    /* glue / school supply misc — a glue stick */
    colle: art(`<path class="fill" d="M24 22h16v26a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z"/><path d="M24 22h16v26a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z"/><path class="fill" d="M26 12h12v10H26z"/><path d="M26 12h12v10H26z"/><path class="thin" d="M24 34h16"/>`),
  };

  /* ───────────────────────── catalogue (rayons + papeterie) ─────────────────
     ~20 titres, prix MAD Tanger 2026 : romans 60–120, manuels 35–90,
     papeterie à l'unité. `art` pointe vers une silhouette du dict ci-dessus.
     `stock` : 0 = épuisé (en commande), bas ≤ 3. ISBN factices mais crédibles. */
  const CATALOG = [
    { id: 'roman', label: 'Roman', items: [
      { id: 'painnu',   title: 'Le Pain nu',            author: 'Mohamed Choukri', price: 75,  isbn: '9789954xxxxx1', art: 'roman', stock: 6, flag: 'Tanger' },
      { id: 'alchimiste', title: "L'Alchimiste",        author: 'Paulo Coelho',    price: 68,  isbn: '9782080xxxxx2', art: 'roman', stock: 9 },
      { id: 'petitprince', title: 'Le Petit Prince',    author: 'A. de Saint-Exupéry', price: 60, isbn: '9782070xxxxx3', art: 'jeunesse', stock: 12 },
      { id: 'etranger', title: "L'Étranger",            author: 'Albert Camus',    price: 65,  isbn: '9782070xxxxx4', art: 'roman', stock: 3 },
      { id: 'saison',   title: "Une saison à Tanger",   author: 'Aziz Binebine',   price: 95,  isbn: '9789920xxxxx5', art: 'roman', stock: 4, flag: 'Tanger' },
      { id: 'nuit',     title: 'La Nuit sacrée',        author: 'Tahar Ben Jelloun', price: 88, isbn: '9782020xxxxx6', art: 'roman', stock: 0 },
    ] },
    { id: 'jeunesse', label: 'Jeunesse', items: [
      { id: 'harry1',   title: 'Harry Potter à l’école des sorciers', author: 'J.K. Rowling', price: 110, isbn: '9782070xxxxx7', art: 'jeunesse', stock: 7 },
      { id: 'gruffalo', title: 'Gruffalo',              author: 'Julia Donaldson', price: 72,  isbn: '9782211xxxxx8', art: 'jeunesse', stock: 5 },
      { id: 'martine',  title: 'Martine à l’école', author: 'Marlier · Delahaye', price: 45, isbn: '9782203xxxxx9', art: 'jeunesse', stock: 2 },
    ] },
    { id: 'scolaire', label: 'Scolaire', items: [
      { id: 'man_math6',  title: 'Mathématiques 6e, manuel',  author: 'Éd. Nathan Maroc',  price: 78, isbn: '9789954xxx100', art: 'scolaire', stock: 14 },
      { id: 'man_fr_cm2', title: 'Le Français CM2, manuel',   author: 'Éd. Hachette',      price: 72, isbn: '9782011xxx101', art: 'scolaire', stock: 11 },
      { id: 'man_svt',    title: 'SVT 6e, manuel',            author: 'Éd. Bordas',        price: 82, isbn: '9782047xxx102', art: 'scolaire', stock: 6 },
      { id: 'man_arabe',  title: 'Al-Moufid · Arabe CM2',      author: 'Dar Al-Maarifa',   price: 55, isbn: '9789981xxx103', art: 'scolaire', stock: 9 },
      { id: 'man_geo',    title: 'Histoire-Géo 6e, manuel',   author: 'Éd. Magnard',       price: 75, isbn: '9782210xxx104', art: 'scolaire', stock: 3 },
    ] },
    { id: 'essai', label: 'Essai', items: [
      { id: 'sapiens',  title: 'Sapiens',               author: 'Yuval Noah Harari', price: 120, isbn: '9782226xxx105', art: 'essai', stock: 4 },
      { id: 'maroc',    title: 'Le Maroc en 100 questions', author: 'Pierre Vermeren', price: 98, isbn: '9782849xxx106', art: 'essai', stock: 0 },
    ] },
    { id: 'bd', label: 'BD', items: [
      { id: 'tintin',   title: 'Tintin, Le Crabe aux pinces d’or', author: 'Hergé', price: 92, isbn: '9782203xxx107', art: 'bd', stock: 8 },
      { id: 'asterix',  title: 'Astérix le Gaulois',    author: 'Goscinny · Uderzo', price: 92, isbn: '9782012xxx108', art: 'bd', stock: 3 },
    ] },
    { id: 'papeterie', label: 'Papeterie', items: [
      { id: 'cahier96',  title: 'Cahier 96 pages · Séyès', author: 'grand format',  price: 8,  isbn: 'PAP-CAH-96', art: 'cahier', stock: 60 },
      { id: 'cahier48',  title: 'Cahier 48 pages · petit', author: 'protège inclus', price: 5, isbn: 'PAP-CAH-48', art: 'cahier', stock: 80 },
      { id: 'bicstylo',  title: 'Stylo bille bleu',      author: 'Bic · à l’unité', price: 3, isbn: 'PAP-STY-BL', art: 'stylo', stock: 200 },
      { id: 'crayonhb',  title: 'Crayon HB',             author: 'Staedtler',     price: 4,  isbn: 'PAP-CRY-HB', art: 'crayon', stock: 150 },
      { id: 'compasset', title: 'Compas de géométrie',   author: 'boîte métal',   price: 35, isbn: 'PAP-COM-01', art: 'compas', stock: 12 },
      { id: 'regleset',  title: 'Set de géométrie',      author: 'règle · équerre · rapporteur', price: 28, isbn: 'PAP-REG-01', art: 'regle', stock: 18 },
      { id: 'bescherelle', title: 'Bescherelle · La conjugaison', author: 'Hatier', price: 65, isbn: '9782218xxx109', art: 'dico', stock: 7 },
      { id: 'collestick', title: 'Bâton de colle',       author: 'UHU · 21 g',    price: 9,  isbn: 'PAP-COL-21', art: 'colle', stock: 40 },
    ] },
  ];
  const ITEM = {};
  CATALOG.forEach((r) => r.items.forEach((it) => { it.rayon = r.id; ITEM[it.id] = it; }));
  const RAYON = Object.fromEntries(CATALOG.map((r) => [r.id, r]));
  const stockClass = (n) => (n <= 0 ? 'out' : n <= 3 ? 'low' : 'ok');
  const stockLabel = (n) => (n <= 0 ? 'épuisé' : n <= 3 ? `${n} en stock` : `${n} en stock`);

  /* ───────────────────────── fidélité — 1 MAD = 1 point, palier –5 % ────────
     Le palier « fidèle » s'ouvre à 500 points : –5 % sur l'achat du jour. */
  const FID_TIER = 500, FID_RATE = 0.05;
  const fidTier = (pts) => pts >= FID_TIER;

  /* ───────────────────────── clients (Tanger) ─────────────────────────────── */
  /* Demo people never surface for a real, paired bookshop — the seeded client
     roster is emptied when pvReal(). Local demo keeps the full cast, unchanged. */
  const CUSTOMERS = pvReal() ? [] : [
    { id: 'c1', name: 'Naima El Fassi',     phone: '0661 30 21 14', points: 640, visits: 19, school: false, note: 'Lectrice, romans & essais' },
    { id: 'c2', name: 'Karim Benani',       phone: '0670 44 18 02', points: 410, visits: 12, school: false, note: 'Deux enfants au collège' },
    { id: 'sc', name: 'G.S. Ibn Khaldoun',  phone: '0539 94 33 18', points: 1280, visits: 31, school: true, note: 'Listes scolaires · facture établissement', contact: 'Intendance · M. Saïdi' },
    { id: 'c3', name: 'Salma Taibi',        phone: '0655 12 90 77', points: 120, visits: 4, school: false, note: '' },
    { id: 'c4', name: 'Rachid Amrani',      phone: '0662 71 09 33', points: 880, visits: 22, school: false, note: 'BD & jeunesse pour les petits' },
    { id: 'c5', name: 'Hind Berrada',       phone: '0668 03 55 41', points: 260, visits: 7, school: false, note: '' },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

  /* ───────────────────────── commandes spéciales (seed) ─────────────────────
     Statuts : commande → arrivee → retiree. Une commande déjà arrivée et PAS
     encore notifiée = le « demo moment » : la pastille rouge dans la nav, et
     un seul tap ouvre le WhatsApp « il est arrivé ». */
  const CMD_FLOW = ['commande', 'arrivee', 'retiree'];
  const CMD_STATUS = {
    commande: { label: 'Commandé',  short: 'chez le distributeur', dot: '#D99A2B', icon: 'truck' },
    arrivee:  { label: 'Arrivé',    short: 'au magasin, à retirer', dot: 'var(--emerald)', icon: 'package-check' },
    retiree:  { label: 'Retiré',    short: 'remis au client', dot: 'var(--ink-4)', icon: 'check-check' },
  };
  const NOW = Date.now();
  let cmdSeq = 318;
  function mkCmd(cfg) {
    return {
      id: `C-${cfg.n}`, n: cfg.n,
      title: cfg.title, author: cfg.author || '', isbn: cfg.isbn,
      custId: cfg.custId || null, guest: cfg.guest || null,
      qty: cfg.qty || 1, price: cfg.price,
      acompte: cfg.acompte || 0,
      status: cfg.status,
      notified: !!cfg.notified,
      orderedAt:  new Date(NOW - cfg.orderedD * DAY),
      arrivedAt:  cfg.arrivedD != null ? new Date(NOW - cfg.arrivedD * DAY) : null,
      pickedAt:   cfg.pickedD  != null ? new Date(NOW - cfg.pickedD  * DAY) : null,
    };
  }
  /* Seeded special orders carry client names/phones — a real bookshop starts
     with an empty board when pvReal(). Local demo keeps every seed, unchanged. */
  const CMDS = pvReal() ? [] : [
    /* arrivée, PAS notifiée → le demo moment */
    mkCmd({ n: 312, title: 'Les Misérables, intégrale', author: 'Victor Hugo', isbn: '9782253xxx201',
      custId: 'c1', qty: 1, price: 145, acompte: 50, status: 'arrivee', notified: false, orderedD: 6, arrivedD: 0 }),
    /* arrivée déjà notifiée (attend le retrait) */
    mkCmd({ n: 309, title: 'Atomic Habits (VF), Un rien peut tout changer', author: 'James Clear', isbn: '9782035xxx202',
      custId: 'c4', qty: 1, price: 118, acompte: 0, status: 'arrivee', notified: true, orderedD: 9, arrivedD: 2 }),
    /* encore commandées */
    mkCmd({ n: 315, title: 'Manuel de SVT, Tronc commun (édition 2025)', author: 'Éd. Bordas', isbn: '9782047xxx203',
      custId: 'c2', qty: 2, price: 84, acompte: 80, status: 'commande', notified: false, orderedD: 2 }),
    mkCmd({ n: 316, title: "L'Art de la guerre", author: 'Sun Tzu', isbn: '9782081xxx204',
      guest: { name: 'Client de passage', phone: '0661 88 02 19' }, qty: 1, price: 55, acompte: 0, status: 'commande', notified: false, orderedD: 1 }),
    /* une retirée récente pour peupler la 3e colonne */
    mkCmd({ n: 304, title: 'Dictionnaire Le Robert de poche', author: 'Le Robert', isbn: '9782321xxx205',
      custId: 'c5', qty: 1, price: 62, acompte: 0, status: 'retiree', notified: true, orderedD: 14, arrivedD: 6, pickedD: 3 }),
  ];

  /* ───────────────────────── listes scolaires (seed) ────────────────────────
     École → niveau → bundle. Chaque ligne pointe un item du catalogue (avec
     son stock réel) OU un item « hors-catalogue » défini inline (qui aura un
     drapeau « à commander » si besoin). Groupé manuels / cahiers / fournitures. */
  const SCHOOLS = [
    { id: 'ibnkhaldoun', name: 'G.S. Ibn Khaldoun', area: 'Tanger · Iberia',
      niveaux: [
        { id: 'cm2', label: 'CM2', groups: [
          { label: 'Manuels', lines: [
            { itemId: 'man_fr_cm2', qty: 1 },
            { itemId: 'man_arabe', qty: 1 },
            { ref: 'man_math_cm2', title: 'Mathématiques CM2, manuel', author: 'Éd. Nathan Maroc', price: 74, art: 'scolaire', stock: 2 },
            { ref: 'man_eveil', title: 'Éveil scientifique CM2', author: 'Éd. Hachette', price: 58, art: 'scolaire', stock: 0 },
          ] },
          { label: 'Cahiers', lines: [
            { itemId: 'cahier96', qty: 4 },
            { itemId: 'cahier48', qty: 6 },
          ] },
          { label: 'Fournitures', lines: [
            { itemId: 'bescherelle', qty: 1 },
            { itemId: 'regleset', qty: 1 },
            { itemId: 'bicstylo', qty: 4 },
            { itemId: 'crayonhb', qty: 3 },
            { itemId: 'collestick', qty: 2 },
          ] },
        ] },
        { id: '6e', label: '6e année', groups: [
          { label: 'Manuels', lines: [
            { itemId: 'man_math6', qty: 1 },
            { itemId: 'man_svt', qty: 1 },
            { itemId: 'man_geo', qty: 1 },
          ] },
          { label: 'Cahiers', lines: [
            { itemId: 'cahier96', qty: 5 },
          ] },
          { label: 'Fournitures', lines: [
            { itemId: 'compasset', qty: 1 },
            { itemId: 'regleset', qty: 1 },
            { itemId: 'bicstylo', qty: 5 },
          ] },
        ] },
      ] },
    { id: 'almassira', name: 'École Al Massira', area: 'Tanger · Marshan',
      niveaux: [
        { id: 'gs', label: 'Grande section', groups: [
          { label: 'Cahiers', lines: [
            { itemId: 'cahier48', qty: 4 },
          ] },
          { label: 'Fournitures', lines: [
            { itemId: 'crayonhb', qty: 6 },
            { itemId: 'collestick', qty: 3 },
            { ref: 'feutres12', title: 'Boîte de 12 feutres lavables', author: 'à commander', price: 32, art: 'colle', stock: 0 },
          ] },
        ] },
      ] },
  ];

  /* resolve a school-list line into a uniform shape (catalog or inline ref) */
  function resolveLine(ln) {
    if (ln.itemId) {
      const it = ITEM[ln.itemId];
      return { key: it.id, title: it.title, author: it.author, price: it.price, art: it.art, stock: it.stock, qty: ln.qty, itemId: it.id };
    }
    return { key: ln.ref, title: ln.title, author: ln.author, price: ln.price, art: ln.art || 'cahier', stock: ln.stock != null ? ln.stock : 5, qty: ln.qty || 1, itemId: null };
  }

  /* ───────────────────────── state ───────────────────────── */
  let saleSeq = 4821;
  const state = {
    view: 'vente',
    rayon: 'tous',
    query: '',
    cart: null,                  /* { num, lines:[{key,qty}], client } */
    cmdQuery: '',
    listPick: { school: null, niveau: null },
    listChecked: {},             /* key → bool, in the active list */
    clientQuery: '',
    rentree: true,
    offline: false, queued: 0,
  };
  function freshCart() { state.cart = { num: posRef(`V-${saleSeq}`), lines: [], client: null }; }

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  const cartLabel = (c) => {
    const l = c.lines[0];
    if (!l) return 'Vente';
    const nm = ITEM[l.key] ? ITEM[l.key].title : 'Vente';
    return c.lines.length > 1 ? `${nm} +${cartCount(c) - l.qty} art.` : nm;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     La librairie encaissait dans state.cart, jeté juste après la vente : la
     recette n'existait nulle part. Démo : no-op. */
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('librairie', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de vente repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à V-4821 et deux ventes portent le même numéro.
     Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) saleSeq = window.KiwiPosSale.nextSeq('librairie', saleSeq); } catch (_) {}

  /* ═══════════════════════ ROOT INJECTION ═══════════════════════ */
  let root = null;
  function mount(rootEl) {
    root = rootEl;
    freshCart();
    root.innerHTML = `
      <aside class="lb-rail">
        <div class="lb-brand">kiwi<i></i></div>
        <div class="lb-venue">
          <div class="lb-venue-name">${esc(pvName('Librairie Al Boughaz') || 'Librairie')}</div>
          <div class="lb-venue-sub">${pvReal() ? (esc(pvCity('')) || '') : 'Tanger · Petit Socco'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="lb-nav" id="lb-nav">
          <button class="lb-nav-it on" data-lb-view="vente"><i data-lucide="book-open"></i><span>Vente</span></button>
          <button class="lb-nav-it" data-lb-view="commandes"><i data-lucide="clipboard-list"></i><span>Commandes</span><b class="lb-nav-badge" id="lb-badge-cmd"></b></button>
          <button class="lb-nav-it" data-lb-view="listes"><i data-lucide="graduation-cap"></i><span>Listes scolaires</span><b class="lb-nav-badge" id="lb-badge-li"></b></button>
          <button class="lb-nav-it" data-lb-view="clients"><i data-lucide="users"></i><span>Clients</span><b class="lb-nav-badge" id="lb-badge-cl"></b></button>
        </nav>
        <div class="lb-rail-foot">
          <button class="lb-net" id="lb-net" title="Simuler une coupure réseau">
            <i class="lb-net-dot"></i><span class="lb-net-label">En ligne</span>
          </button>
          <button class="lb-lock" id="lb-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="lb-main">
        <div class="lb-offline-note" id="lb-offline-note" hidden>
          Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="lb-queue-count"></b>
        </div>
        <section class="lb-view is-on" data-lb-panel="vente">
          <div class="lb-vente">
            <header class="lb-head">
              <div><h1>Vente</h1><div class="lb-head-sub" id="lb-today"></div></div>
              <div class="lb-head-hint">Touchez un article pour l'ajouter au panier</div>
            </header>
            <div class="lb-scanbar">
              <div class="lb-search"><i data-lucide="search"></i>
                <input id="lb-q" placeholder="Titre, auteur ou ISBN…" autocomplete="off" /></div>
              <button class="lb-scan-btn" id="lb-scan"><i data-lucide="scan-line"></i>Scanner ISBN</button>
            </div>
            <div class="lb-rayons" id="lb-rayons"></div>
            <div class="lb-grid-scroll" id="lb-gridwrap"></div>
          </div>
          <aside class="lb-panier" id="lb-panier"></aside>
        </section>
        <section class="lb-view" data-lb-panel="commandes"></section>
        <section class="lb-view" data-lb-panel="listes"></section>
        <section class="lb-view" data-lb-panel="clients"></section>
      </main>
      <div class="modal-veil" id="lb-sheet-veil"><div class="modal lb-sheet lb-rel" id="lb-sheetm"></div></div>
      <div class="modal-veil" id="lb-rec-veil"><div class="modal lb-recm lb-rel" id="lb-recmm"></div></div>
      <div class="modal-veil" id="lb-pay-veil"><div class="modal lb-pay lb-rel" id="lb-paym"></div></div>
      <div class="modal-veil" id="lb-detail-veil"><div class="modal lb-detail lb-rel" id="lb-detailm"></div></div>
      <div class="modal-veil" id="lb-newcmd-veil"><div class="modal lb-newcmd lb-rel" id="lb-newcmdm"></div></div>
      <!-- lb-client-veil sits AFTER lb-newcmd-veil so the phone-first picker
           opened from inside the new-commande form paints on top of it -->
      <div class="modal-veil" id="lb-client-veil"><div class="modal lb-client lb-rel" id="lb-clientm"></div></div>
      <div class="modal-veil" id="lb-wa-veil"><div class="modal lb-wa lb-rel" id="lb-wam"></div></div>
      <div class="modal-veil" id="lb-scan-veil"><div class="modal lb-scan lb-rel" id="lb-scanm"></div></div>`;

    $('#lb-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-lb-view]');
      if (b) switchView(b.dataset.lbView);
    });
    $('#lb-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#lb-net', root).addEventListener('click', toggleOffline);
    $('#lb-q', root).addEventListener('input', (e) => { state.query = e.target.value; renderGrid(); icons(); });
    $('#lb-scan', root).addEventListener('click', openScan);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    renderAll();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.lb-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.lbView === view));
    $$('.lb-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.lbPanel === view));
    if (view === 'commandes') renderCmd();
    if (view === 'listes') renderListes();
    if (view === 'clients') renderClients();
    icons();
  }
  function renderBadges() {
    const openCmd = CMDS.filter((c) => c.status !== 'retiree').length;
    const toNotify = CMDS.filter((c) => c.status === 'arrivee' && !c.notified).length;
    const fideles = CUSTOMERS.filter((c) => fidTier(c.points)).length;
    const bc = $('#lb-badge-cmd', root);
    bc.textContent = openCmd || '';
    bc.style.display = openCmd ? '' : 'none';
    bc.classList.toggle('alert', toNotify > 0);
    const bl = $('#lb-badge-li', root);
    const lists = SCHOOLS.reduce((s, sc) => s + sc.niveaux.length, 0);
    bl.textContent = lists || '';
    bl.style.display = lists ? '' : 'none';
    const bcl = $('#lb-badge-cl', root);
    bcl.textContent = fideles || '';
    bcl.style.display = fideles ? '' : 'none';
  }

  function renderAll() {
    $('#lb-today', root).textContent = fmtDT(new Date());
    renderRayons();
    renderGrid();
    renderPanier();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ VENTE — rayon grid ═══════════════════════ */
  function renderRayons() {
    const all = CATALOG.reduce((s, r) => s + r.items.length, 0);
    $('#lb-rayons', root).innerHTML =
      `<button class="lb-rayon ${state.rayon === 'tous' ? 'on' : ''}" data-lb-rayon="tous">Tous <span class="lb-rayon-ct">${all}</span></button>` +
      CATALOG.map((r) =>
        `<button class="lb-rayon ${state.rayon === r.id ? 'on' : ''}" data-lb-rayon="${r.id}">${esc(r.label)} <span class="lb-rayon-ct">${r.items.length}</span></button>`
      ).join('');
    $('#lb-rayons', root).onclick = (e) => {
      const b = e.target.closest('[data-lb-rayon]');
      if (!b) return;
      state.rayon = b.dataset.lbRayon;
      renderRayons(); renderGrid(); icons();
    };
  }

  function matchItem(it, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    return it.title.toLowerCase().includes(ql) ||
      (it.author || '').toLowerCase().includes(ql) ||
      (digits.length >= 3 && it.isbn.replace(/\D/g, '').includes(digits)) ||
      it.isbn.toLowerCase().includes(ql);
  }

  function renderGrid() {
    const q = state.query.trim();
    const rayons = state.rayon === 'tous' ? CATALOG : CATALOG.filter((r) => r.id === state.rayon);
    let i = 0;
    const blocks = rayons.map((r) => {
      const items = r.items.filter((it) => matchItem(it, q));
      if (!items.length) return '';
      return `<div class="lb-rayon-head">${esc(r.label)}</div>
        <div class="lb-grid">${items.map((it) => cardHTML(it, i++)).join('')}</div>`;
    }).filter(Boolean).join('');

    $('#lb-gridwrap', root).innerHTML = blocks || `
      <div class="lb-empty-grid">
        <i data-lucide="book-open"></i>
        <div>Aucun article pour « ${esc(q)} ».<br>Pas en rayon ? On peut le commander pour le client.</div>
        <button class="lb-order-cta" id="lb-grid-order"><i data-lucide="truck"></i>Commande spéciale${q ? ` · « ${esc(q)} »` : ''}</button>
      </div>`;

    $('#lb-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-lb-item]');
      if (b) { openSheet(b.dataset.lbItem); return; }
      const ord = e.target.closest('#lb-grid-order');
      if (ord) { switchView('commandes'); setTimeout(() => openNewCmd(q), 60); }
    };
    icons();
  }

  function cardHTML(it, i) {
    const sc = stockClass(it.stock);
    return `<button class="lb-card ${it.stock <= 0 ? 'is-out' : ''}" data-lb-item="${it.id}" style="--i:${i}">
      <span class="lb-card-stock ${sc}">${it.stock <= 0 ? 'épuisé' : it.stock}</span>
      <span class="lb-card-art">${ART[it.art] || ART.roman}</span>
      <span class="lb-card-name">${esc(it.title)}</span>
      <span class="lb-card-author">${esc(it.author || '')}</span>
      <span class="lb-card-price">${fmtMAD(it.price)}</span>
      ${it.flag ? `<span class="lb-card-flag">${esc(it.flag)}</span>` : ''}
    </button>`;
  }

  /* ═══════════════════════ PANIER ═══════════════════════ */
  function cartCount(c) { return c.lines.reduce((s, l) => s + l.qty, 0); }
  function cartSub(c) { return c.lines.reduce((s, l) => s + ITEM[l.key].price * l.qty, 0); }
  function cartRemise(c) {
    if (!c.client || c.client.type !== 'known') return 0;
    const cu = CUST[c.client.id];
    return cu && fidTier(cu.points) ? Math.round(cartSub(c) * FID_RATE) : 0;
  }
  function cartTotal(c) { return cartSub(c) - cartRemise(c); }
  function addToCart(itemId, qty) {
    qty = qty || 1;
    const line = state.cart.lines.find((l) => l.key === itemId);
    if (line) line.qty += qty; else state.cart.lines.push({ key: itemId, qty });
  }

  function clientRow(c) {
    if (!c.client) {
      return `<button class="lb-pn-client" id="lb-pn-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher un client</b><span>Fidélité : 1 MAD = 1 point</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (c.client.type === 'guest') {
      return `<button class="lb-pn-client is-set" id="lb-pn-client"><i data-lucide="user"></i>
        <span class="l"><b>Client de passage</b><span>Sans fidélité</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const cu = CUST[c.client.id];
    const tier = fidTier(cu.points);
    return `<button class="lb-pn-client is-set" id="lb-pn-client"><i data-lucide="${cu.school ? 'building-2' : 'user-check'}"></i>
      <span class="l"><b>${esc(cu.name)}</b><span>${esc(cu.phone)} · ${cu.points} pts</span></span>
      ${tier ? '<span class="lb-fid-chip">−5 %</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  function renderPanier() {
    const c = state.cart;
    const sub = cartSub(c), remise = cartRemise(c), total = cartTotal(c), count = cartCount(c);
    const el = $('#lb-panier', root);
    el.innerHTML = `
      <div class="lb-pn-head">
        <div><span class="lb-pn-title">Panier</span> <span class="lb-pn-num">· ${c.num}</span></div>
        ${c.lines.length ? `<button class="lb-pn-reset" id="lb-pn-reset">Vider</button>` : ''}
      </div>
      <div class="lb-pn-meta">${clientRow(c)}</div>
      <div class="lb-pn-lines" id="lb-pn-lines">
        ${c.lines.length ? c.lines.map((l, i) => lineHTML(l, i)).join('') : `
          <div class="lb-pn-empty">
            <i data-lucide="book-open"></i>
            <div>Le panier est vide.<br>Touchez un livre ou une fourniture, ou scannez son ISBN.</div>
          </div>`}
      </div>
      <div class="lb-pn-foot">
        <div class="lb-pn-tot">
          <span class="pcs"><i data-lucide="book"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${remise ? `<span class="lb-pn-remise">Fidélité −5 % · −${fmtMAD(remise).replace(' MAD', '')} MAD</span>` : ''}
        </div>
        <div class="lb-pn-total"><span class="lbl">Total${remise ? ' (remisé)' : ''}</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="lb-validate" id="lb-validate" ${c.lines.length ? '' : 'disabled'}>
          <i data-lucide="banknote"></i> Encaisser · ${fmtMAD(total)}
        </button>
      </div>`;
    const reset = $('#lb-pn-reset', el);
    if (reset) reset.onclick = () => { freshCart(); renderPanier(); icons(); };
    $('#lb-pn-client', el).onclick = openClient;
    $('#lb-validate', el).onclick = validateCart;
    $('#lb-pn-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-lb-minus]');
      const plus = e.target.closest('[data-lb-plus]');
      const idx = minus ? +minus.dataset.lbMinus : plus ? +plus.dataset.lbPlus : -1;
      if (idx < 0) return;
      const l = c.lines[idx];
      if (plus) l.qty++;
      else { l.qty--; if (l.qty <= 0) c.lines.splice(idx, 1); }
      renderPanier(); icons();
    };
    icons();
  }

  function lineHTML(l, i) {
    const it = ITEM[l.key];
    return `<div class="lb-line">
      <span class="lb-line-art">${ART[it.art] || ART.roman}</span>
      <span class="lb-line-mid">
        <span class="lb-line-name">${esc(it.title)}</span>
        <span class="lb-line-sub"><span class="unit">${fmtMAD(it.price)}</span> · ${esc(it.author || RAYON[it.rayon].label)}</span>
      </span>
      <span class="lb-line-right">
        <span class="lb-line-price">${fmtMAD(it.price * l.qty)}</span>
        <span class="lb-line-qty">
          <button data-lb-minus="${i}" aria-label="Retirer">−</button><b>${l.qty}</b><button data-lb-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* ═══════════════════════ BOOK DETAIL SHEET ═══════════════════════ */
  function openSheet(itemId) {
    const it = ITEM[itemId];
    let qty = 1;
    const el = $('#lb-sheetm', root);
    const sc = stockClass(it.stock);
    const stockLine = it.stock <= 0
      ? `<div class="lb-sheet-stockline out"><i data-lucide="truck"></i>Épuisé en rayon, proposez une <b>commande spéciale</b>.</div>`
      : it.stock <= 3
        ? `<div class="lb-sheet-stockline low"><i data-lucide="archive"></i>Plus que <b>${it.stock}</b> en rayon, à réassortir.</div>`
        : `<div class="lb-sheet-stockline ok"><i data-lucide="check-circle-2"></i><b>${it.stock}</b> en rayon.</div>`;
    el.innerHTML = `
      <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="lb-sheet-head">
        <span class="lb-sheet-art">${ART[it.art] || ART.roman}</span>
        <span class="lb-sheet-title">
          <h3>${esc(it.title)}</h3>
          <span class="sub">${esc(it.author || '')}${it.author ? ' · ' : ''}${esc(RAYON[it.rayon].label)}${it.flag ? ` · ${esc(it.flag)}` : ''}</span>
          <span class="isbn">ISBN ${esc(it.isbn)}</span>
        </span>
        <span class="lb-sheet-price"><span class="val">${fmtMAD(it.price)}</span></span>
      </div>
      ${stockLine}
      <div class="lb-f">
        <div class="lb-f-lbl">Quantité</div>
        <div class="lb-stepper">
          <button id="lb-qty-minus" aria-label="Moins">−</button>
          <b id="lb-qty-val">1</b>
          <button id="lb-qty-plus" aria-label="Plus">+</button>
        </div>
      </div>
      <div class="lb-foot">
        ${it.stock <= 0
          ? `<button class="lb-btn secondary" data-lb-close>Annuler</button>
             <button class="lb-btn primary" id="lb-sheet-order"><i data-lucide="truck"></i>Le commander pour le client</button>`
          : `<button class="lb-btn secondary" data-lb-close>Annuler</button>
             <button class="lb-btn primary" id="lb-sheet-add"><i data-lucide="plus"></i>Ajouter · <span id="lb-sheet-cta">${fmtMAD(it.price)}</span></button>`}
      </div>`;
    openVeil('#lb-sheet-veil');
    icons();
    const refresh = () => {
      $('#lb-qty-val', el).textContent = qty;
      const cta = $('#lb-sheet-cta', el);
      if (cta) cta.textContent = fmtMAD(it.price * qty);
    };
    $('#lb-qty-minus', el).onclick = () => { if (qty > 1) { qty--; refresh(); } };
    $('#lb-qty-plus', el).onclick = () => { qty++; refresh(); };
    const add = $('#lb-sheet-add', el);
    if (add) add.onclick = () => {
      addToCart(itemId, qty);
      closeVeil('#lb-sheet-veil');
      toast(`${it.title} × ${qty}, au panier`);
      renderPanier(); icons();
    };
    const order = $('#lb-sheet-order', el);
    if (order) order.onclick = () => {
      closeVeil('#lb-sheet-veil');
      switchView('commandes');
      setTimeout(() => openNewCmd(it.title, it), 60);
    };
    $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-sheet-veil'); });
  }

  /* ═══════════════════════ CLIENT — phone-first + fidélité ═══════════════════════ */
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function openClient() {
    const el = $('#lb-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">Cherchez par téléphone ou par nom, la fidélité se cumule à chaque achat.</p>
        <div class="lb-phone-in"><i data-lucide="phone"></i>
          <input id="lb-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="lb-cl-results" id="lb-cl-results">
            ${hits.map((c) => `
              <button class="lb-cl-row" data-lb-cl="${c.id}">
                <span class="lb-cl-ava ${c.school ? 'school' : ''}">${c.school ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
                <span class="lb-cl-mid">
                  <span class="lb-cl-name">${esc(c.name)} ${fidTier(c.points) ? '<span class="lb-fid-chip">−5 %</span>' : ''}</span>
                  <span class="lb-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="lb-cl-right"><b>${c.points} pts</b>${c.visits} achats</span>
              </button>`).join('') || `<div class="lb-cempty">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="lb-cl-new" id="lb-cl-new"><i data-lucide="user-plus"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="lb-foot" style="margin-top:10px;">
            <button class="lb-btn ghost" id="lb-cl-guest">Vente sans fiche (passage)</button>
          </div>` : `
          <div class="lb-cl-form">
            <input class="lb-in" id="lb-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="lb-in" id="lb-cl-tel" inputmode="tel" placeholder="Téléphone (optionnel)" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <div class="lb-foot" style="margin-top:4px;">
              <button class="lb-btn secondary" id="lb-cl-back">Retour</button>
              <button class="lb-btn primary" id="lb-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#lb-cl-q', el).oninput = (e) => { render(e.target.value); icons(); $('#lb-cl-q', el).focus(); moveCaretEnd($('#lb-cl-q', el)); };
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-client-veil'); });
      $$('[data-lb-cl]', el).forEach((b) => {
        b.onclick = () => {
          state.cart.client = { type: 'known', id: b.dataset.lbCl };
          closeVeil('#lb-client-veil');
          const c = CUST[b.dataset.lbCl];
          toast(fidTier(c.points)
            ? `${c.name}, client fidèle, remise −5 % appliquée`
            : `${c.name}, ${c.points} points fidélité`);
          renderPanier(); icons();
        };
      });
      const newBtn = $('#lb-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#lb-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.cart.client = { type: 'guest' };
        closeVeil('#lb-client-veil');
        renderPanier(); icons();
      };
      const back = $('#lb-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#lb-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#lb-cl-name', el).value.trim();
        const tel = $('#lb-cl-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, points: 0, visits: 0, school: false, note: '' };
        CUSTOMERS.unshift(c); CUST[id] = c;
        state.cart.client = { type: 'known', id };
        closeVeil('#lb-client-veil');
        toast(`Fiche créée, ${name}`);
        renderPanier(); renderBadges(); icons();
      };
    };
    render('');
    openVeil('#lb-client-veil');
    icons();
    setTimeout(() => { const i = $('#lb-cl-q', el); if (i) i.focus(); }, 60);
  }
  function recoPanel(c) {
    const pts = c.points;
    const tier = fidTier(pts);
    const pct = Math.min(100, Math.round((pts % FID_TIER) / FID_TIER * 100));
    const toNext = tier ? 0 : FID_TIER - pts;
    const openCmds = CMDS.filter((x) => x.custId === c.id && x.status !== 'retiree');
    return `<div class="lb-reco">
      <div class="lb-reco-head"><i data-lucide="sparkles"></i>${esc(c.name)}, ${tier ? 'client fidèle' : 'client reconnu'}</div>
      <div class="lb-reco-rows">
        ${c.note ? `<div class="lb-reco-row"><i data-lucide="heart"></i>${esc(c.note)}</div>` : ''}
        ${c.contact ? `<div class="lb-reco-row"><i data-lucide="user"></i>${esc(c.contact)}</div>` : ''}
        ${openCmds.map((x) => `<div class="lb-reco-row"><i data-lucide="truck"></i><b>${x.id}</b> · ${esc(x.title)}, ${CMD_STATUS[x.status].label}</div>`).join('')}
        <div class="lb-reco-row"><i data-lucide="star"></i><b>${pts} points</b> · ${c.visits} achats</div>
      </div>
      <div class="lb-fid-gauge">
        <div class="lb-fid-bar"><i style="width:${tier ? 100 : pct}%"></i></div>
        <div class="lb-fid-meta"><span>${tier ? 'Palier −5 % atteint' : 'Vers le palier −5 %'}</span><span>${tier ? '<b>actif</b>' : `<b>${toNext} pts</b> restants`}</span></div>
      </div>
    </div>`;
  }
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }

  /* ═══════════════════════ VALIDATE → RECEIPT → PAYMENT ═══════════════════════ */
  function validateCart() {
    const c = state.cart;
    if (!c.lines.length) return;
    openReceipt();
  }

  // Real store identity from the pairing / hosted session — a real bookshop prints
  // its own name+city, never the demo "Librairie Al Boughaz". Demo unchanged.
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  function receiptHTML(c) {
    const sub = cartSub(c), remise = cartRemise(c), total = cartTotal(c);
    const cu = c.client && c.client.type === 'known' ? CUST[c.client.id] : null;
    const earned = total;          /* 1 MAD payé = 1 point */
    return `<div class="lb-receipt">
      <div class="c b lg">${esc((pvName('Librairie Al Boughaz') || 'Librairie').toUpperCase())}</div>
      <div class="c mut">${pvReal() ? (pvCity('') ? esc(pvCity('')) + ' · ' : '') + 'propulsé par Kiwi' : 'Petit Socco, Tanger<br>05 39 93 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="row"><span>Ticket</span><span class="b">${c.num}</span></div>
      ${cu ? `<div class="row"><span>Client</span><span>${esc(cu.name)}</span></div>` : ''}
      <div class="row"><span>Date</span><span>${fmtDT(new Date())}</span></div>
      <hr>
      ${c.lines.map((l) => {
        const it = ITEM[l.key];
        return `<div class="row"><span class="nm">${l.qty} × ${esc(it.title)}</span><span>${it.price * l.qty}</span></div>`;
      }).join('')}
      <hr>
      <div class="row"><span>Sous-total</span><span>${sub} MAD</span></div>
      ${remise ? `<div class="row"><span>Fidélité −5 %</span><span>−${remise} MAD</span></div>` : ''}
      <div class="row tot"><span>TOTAL</span><span>${total} MAD</span></div>
      ${cu ? `<div class="row fid"><span>POINTS GAGNÉS</span><span>+${earned}</span></div>
              <div class="row mut"><span>Solde fidélité</span><span>${cu.points + earned} pts</span></div>` : ''}
      <hr>
      <div class="c">${barcode(c.num, 26)}</div>
      <div class="c mut">${c.num} · choukran, l'lah ihennik</div>
    </div>`;
  }

  function openReceipt() {
    const c = state.cart;
    const total = cartTotal(c);
    const el = $('#lb-recmm', root);
    el.innerHTML = `
      <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Ticket, ${c.num}</h3>
      <p class="modal-subtle">${cartCount(c)} article${cartCount(c) > 1 ? 's' : ''} · aperçu avant encaissement.</p>
      ${receiptHTML(c)}
      <div class="lb-foot">
        <button class="lb-btn secondary" id="lb-rec-print"><i data-lucide="printer"></i>Imprimer</button>
        <button class="lb-btn primary" id="lb-rec-pay"><i data-lucide="banknote"></i>Encaisser · ${fmtMAD(total)}</button>
      </div>`;
    openVeil('#lb-rec-veil');
    icons();
    $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-rec-veil'); });
    $('#lb-rec-print', el).onclick = () => toast('Envoyé, ticket 80 mm (imprimante thermique)');
    $('#lb-rec-pay', el).onclick = () => { closeVeil('#lb-rec-veil'); openPay(); };
  }

  /* ═══════════════════════ PAYMENT (espèces / carte) ═══════════════════════ */
  function openPay() {
    const c = state.cart;
    const total = cartTotal(c);
    const el = $('#lb-paym', root);

    const step1 = () => {
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Encaissement</h3>
        <p class="modal-subtle">${c.num}${c.client && c.client.type === 'known' ? ' · ' + esc(CUST[c.client.id].name) : ''}</p>
        <div class="modal-amount size-md">${fmtMAD(total)}</div>
        <div class="lb-pay-opts">
          <button class="lb-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          <button class="lb-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
        </div>`;
      icons();
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-pay-veil'); });
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.m === 'especes' ? stepCash() : stepCard());
      });
    };

    const stepCash = () => {
      let received = total;
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(total)}</h3>
        <p class="modal-subtle">${c.num} · rendu calculé automatiquement</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="lb-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="lb-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${total}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="lb-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="lb-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#lb-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - total));
        $('#lb-cash-ok', el).disabled = received < total;
      };
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-pay-veil'); });
      $('#lb-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#lb-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#lb-cash-ok', el).onclick = () => done('especes', Math.max(0, received - total));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(total)}</h3>
        <p class="modal-subtle">${c.num} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="lb-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="lb-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-pay-veil'); });
      setTimeout(() => {
        const disc = $('#lb-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#lb-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(total, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0), 900);
        });
      }, 1900);
    };

    const done = (method, rendu) => {
      closeVeil('#lb-pay-veil');
      let earnMsg = '';
      if (c.client && c.client.type === 'known') {
        const cu = CUST[c.client.id];
        cu.points += total;
        cu.visits += 1;
        earnMsg = ` · +${total} pts fidélité`;
      }
      postDay(total, method, cartLabel(c), c.num);
      queueIfOffline(`Vente ${c.num}`);
      saleSeq++;
      freshCart();
      renderPanier(); renderBadges(); icons();
      toast(`Encaissé, ${fmtMAD(total)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}${earnMsg}`);
    };

    step1();
    openVeil('#lb-pay-veil');
  }

  /* ═══════════════════════ COMMANDES SPÉCIALES — board ═══════════════════════ */
  function cmdCust(c) {
    if (c.custId) return CUST[c.custId];
    return c.guest || { name: 'Client de passage', phone: '' };
  }
  function cmdDue(c) { return Math.max(0, c.price * c.qty - c.acompte); }

  function matchCmd(c, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    const cu = cmdCust(c);
    return c.title.toLowerCase().includes(ql) ||
      c.id.toLowerCase().includes(ql) ||
      (c.isbn || '').toLowerCase().includes(ql) ||
      cu.name.toLowerCase().includes(ql) ||
      (digits.length >= 2 && (cu.phone || '').replace(/\D/g, '').includes(digits));
  }

  function cmdCard(c) {
    const cu = cmdCust(c);
    const due = cmdDue(c);
    const toNotify = c.status === 'arrivee' && !c.notified;
    const when = c.status === 'commande' ? `commandé ${sinceDays(c.orderedAt)}`
      : c.status === 'arrivee' ? `arrivé ${sinceDays(c.arrivedAt)}`
      : `retiré ${sinceDays(c.pickedAt)}`;
    return `<button class="lb-ocard ${c.status === 'arrivee' ? 'is-arrived' : ''} ${toNotify ? 'is-notify' : ''}" data-lb-cmd="${c.id}">
      <span class="lb-ocard-top">
        <span class="lb-ocard-title">${esc(c.title)}</span>
        <span class="lb-ocard-when">${esc(when)}</span>
      </span>
      ${c.author ? `<span class="lb-ocard-author">${esc(c.author)}${c.qty > 1 ? ` · ×${c.qty}` : ''}</span>` : ''}
      <span class="lb-ocard-client"><i data-lucide="${cu.school ? 'building-2' : 'user'}"></i>${esc(cu.name)}</span>
      <span class="lb-ocard-meta">
        <span class="lb-pill isbn">${esc((c.isbn || '').slice(-6))}</span>
        ${c.acompte ? `<span class="lb-pill ok">Acompte ${c.acompte} MAD</span>` : ''}
        ${due > 0 && c.status !== 'retiree' ? `<span class="lb-pill due">Solde ${due} MAD</span>` : ''}
        ${toNotify ? '<span class="lb-pill wa"><i data-lucide="message-circle"></i>à prévenir</span>' : c.notified && c.status === 'arrivee' ? '<span class="lb-pill ok">notifié</span>' : ''}
      </span>
    </button>`;
  }

  function renderCmd() {
    const panel = $('[data-lb-panel="commandes"]', root);
    const q = state.cmdQuery;
    panel.innerHTML = `
      <div class="lb-cmd">
        <header class="lb-head">
          <div><h1>Commandes spéciales</h1><div class="lb-head-sub">« Je vous le fais venir », du distributeur au client, sans rien perdre</div></div>
          <button class="lb-btn primary" id="lb-cmd-new" style="flex:0 0 auto;"><i data-lucide="plus"></i>Nouvelle commande</button>
        </header>
        <div class="lb-cmd-bar">
          <div class="lb-search" style="max-width:340px;"><i data-lucide="search"></i>
            <input id="lb-cmd-q" placeholder="Titre, client, ISBN ou n°…" value="${esc(q)}" autocomplete="off" /></div>
        </div>
        <div class="lb-cmd-cols">
          ${CMD_FLOW.map((s) => {
            const list = CMDS.filter((c) => c.status === s && matchCmd(c, q));
            return `<div class="lb-ccol">
              <div class="lb-ccol-head"><i class="dot" style="background:${CMD_STATUS[s].dot}"></i>${CMD_STATUS[s].label} <span class="ct">${list.length}</span></div>
              ${list.map(cmdCard).join('') || '<div class="lb-cempty">—</div>'}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    $('#lb-cmd-new', panel).onclick = () => openNewCmd('');
    $('#lb-cmd-q', panel).oninput = (e) => {
      state.cmdQuery = e.target.value;
      renderCmd(); icons();
      const i = $('#lb-cmd-q', panel); i.focus(); moveCaretEnd(i);
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-lb-cmd]');
      if (b) openCmdDetail(b.dataset.lbCmd);
    };
    icons();
  }

  /* ---------- commande detail + status flow ---------- */
  function openCmdDetail(cmdId) {
    const c = CMDS.find((x) => x.id === cmdId);
    if (!c) return;
    const el = $('#lb-detailm', root);
    const cu = cmdCust(c);
    const due = cmdDue(c);
    const curIdx = CMD_FLOW.indexOf(c.status);
    el.innerHTML = `
      <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="lb-dt-head">
        <span class="lb-dt-art">${ART.roman}</span>
        <div class="lb-dt-titlewrap">
          <h3>${esc(c.title)}</h3>
          <div class="lb-dt-sub">
            ${c.author ? `${esc(c.author)}` : ''}${c.author ? '<span class="isbnv">·</span>' : ''}<span class="isbnv">ISBN ${esc(c.isbn)}</span>
            ${c.qty > 1 ? `<span class="lb-pill">×${c.qty}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="lb-flow">
        ${CMD_FLOW.map((s, i) => {
          const cls = i < curIdx ? 'done' : i === curIdx ? 'cur' : '';
          return `<button class="lb-flow-step ${cls}" data-lb-st="${s}"><i data-lucide="${CMD_STATUS[s].icon}"></i>${CMD_STATUS[s].label}<small>${esc(CMD_STATUS[s].short)}</small></button>`;
        }).join('')}
      </div>
      <div class="lb-dt-info">
        <div class="lb-dt-row"><i data-lucide="${cu.school ? 'building-2' : 'user'}"></i>
          <span class="l"><b>${esc(cu.name)}</b></span><span class="v">${esc(cu.phone || 'sans téléphone')}</span></div>
        <div class="lb-dt-row"><i data-lucide="calendar"></i>
          <span class="l">Commandé</span><span class="v">${fmtDay(c.orderedAt)}</span></div>
        ${c.arrivedAt ? `<div class="lb-dt-row"><i data-lucide="package-check"></i><span class="l">Arrivé au magasin</span><span class="v ok">${fmtDay(c.arrivedAt)}</span></div>` : ''}
        <div class="lb-dt-row"><i data-lucide="coins"></i>
          <span class="l">Prix${c.qty > 1 ? ` (×${c.qty})` : ''}${c.acompte ? ` · acompte ${c.acompte} MAD` : ''}</span>
          <span class="v ${due > 0 ? 'due' : 'ok'}">${due > 0 ? `solde ${due} MAD` : 'réglé'}</span></div>
      </div>
      <div class="lb-dt-actions">
        ${c.status === 'commande' ? '<button class="lb-btn primary" data-lb-advance="arrivee"><i data-lucide="package-check"></i>Marquer arrivé</button>' : ''}
        ${c.status === 'arrivee' ? `<button class="lb-btn ${c.notified ? 'secondary' : 'primary'}" id="lb-dt-wa"><i data-lucide="message-circle"></i>${c.notified ? 'Re-notifier' : 'WhatsApp « il est arrivé »'}</button>` : ''}
        ${c.status === 'arrivee' ? `<button class="lb-btn ${c.notified ? 'primary' : 'secondary'}" data-lb-advance="retiree"><i data-lucide="check"></i>Remettre au client${due > 0 ? ` · ${due} MAD` : ''}</button>` : ''}
        ${c.status !== 'retiree' ? '<button class="lb-btn ghost" id="lb-dt-cancel">Annuler la commande</button>' : ''}
      </div>`;
    openVeil('#lb-detail-veil');
    icons();
    $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-detail-veil'); });
    $$('[data-lb-st]', el).forEach((b) => {
      b.onclick = () => {
        const s = b.dataset.lbSt;
        if (s === c.status) return;
        setCmdStatus(c, s);
      };
    });
    $$('[data-lb-advance]', el).forEach((b) => {
      b.onclick = () => setCmdStatus(c, b.dataset.lbAdvance);
    });
    const wa = $('#lb-dt-wa', el);
    if (wa) wa.onclick = () => openWa(c);
    const cancel = $('#lb-dt-cancel', el);
    if (cancel) cancel.onclick = () => {
      const i = CMDS.indexOf(c);
      if (i >= 0) CMDS.splice(i, 1);
      closeVeil('#lb-detail-veil');
      queueIfOffline('Annulation commande');
      toast(`${c.id} annulée${c.acompte ? `, acompte ${c.acompte} MAD à rembourser` : ''}`);
      renderCmd(); renderBadges(); icons();
    };
  }

  function setCmdStatus(c, s) {
    const wasArrived = c.status === 'arrivee';
    c.status = s;
    if (s === 'arrivee' && !c.arrivedAt) c.arrivedAt = new Date();
    if (s === 'retiree' && !c.pickedAt) c.pickedAt = new Date();
    if (s === 'commande') { c.arrivedAt = null; }
    queueIfOffline('Statut commande');
    if (s === 'retiree') {
      const due = cmdDue(c);
      closeVeil('#lb-detail-veil');
      toast(`${c.id} remis à ${cmdCust(c).name.split(' ')[0]}${due > 0 ? `, solde ${due} MAD encaissé` : ''}`);
      renderCmd(); renderBadges(); icons();
      return;
    }
    openCmdDetail(c.id);
    renderBadges();
    if (s === 'arrivee' && !wasArrived && !c.notified) {
      toast(`${c.id} est arrivé, prévenez ${cmdCust(c).name.split(' ')[0]} ?`);
      setTimeout(() => openWa(c), 450);
    }
  }

  /* ---------- new commande form ---------- */
  function openNewCmd(prefillTitle, prefillItem) {
    const el = $('#lb-newcmdm', root);
    const draft = {
      title: prefillTitle || '',
      isbn: prefillItem ? prefillItem.isbn : '',
      price: prefillItem ? prefillItem.price : '',
      qty: 1,
      client: null,
      acompte: 0,
    };
    const render = () => {
      const priceN = +draft.price || 0;
      const max = priceN * draft.qty;
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Nouvelle commande spéciale</h3>
        <p class="modal-subtle">Le titre absent du rayon, on le fait venir, et on prévient le client à l'arrivée.</p>
        <div class="lb-f">
          <div class="lb-f-lbl">Titre</div>
          <input class="lb-in" id="lb-nc-title" placeholder="Titre du livre" value="${esc(draft.title)}" />
        </div>
        <div class="lb-f" style="display:flex;gap:10px;">
          <div style="flex:2;"><div class="lb-f-lbl">ISBN <span class="opt">· optionnel</span></div>
            <input class="lb-in" id="lb-nc-isbn" inputmode="numeric" placeholder="978…" value="${esc(draft.isbn)}" /></div>
          <div style="flex:1;"><div class="lb-f-lbl">Prix MAD</div>
            <input class="lb-in" id="lb-nc-price" inputmode="numeric" placeholder="0" value="${draft.price === '' ? '' : esc(String(draft.price))}" /></div>
        </div>
        <div class="lb-f">
          <div class="lb-f-lbl">Client <span class="opt">· téléphone pour la notification</span></div>
          <button class="lb-pn-client ${draft.client ? 'is-set' : ''}" id="lb-nc-client" style="width:100%;">
            <i data-lucide="${draft.client ? (draft.client.school ? 'building-2' : 'user-check') : 'user-plus'}"></i>
            <span class="l">${draft.client
              ? `<b>${esc(draft.client.name)}</b><span>${esc(draft.client.phone || 'sans téléphone')}</span>`
              : `<b>Attacher un client</b><span>Recherche par téléphone</span>`}</span>
            <span class="edit">${draft.client ? 'Changer' : 'Chercher'}</span>
          </button>
        </div>
        <div class="lb-f">
          <div class="lb-f-lbl">Acompte <span class="opt">· optionnel, sécurise la commande</span></div>
          <div class="modal-amount size-md" id="lb-nc-acval" style="font-size:30px;padding:2px 0 8px;">${fmtMAD(draft.acompte)}</div>
          <div class="lb-acompte-row">
            <button class="cash-preset" data-ac="0">Aucun</button>
            <button class="cash-preset" data-ac="50">50</button>
            <button class="cash-preset" data-ac="100">100</button>
            <button class="cash-preset" data-ac="half"${max ? '' : ' disabled'}>50 %</button>
          </div>
        </div>
        <div class="lb-foot">
          <button class="lb-btn secondary" data-lb-close>Annuler</button>
          <button class="lb-btn primary" id="lb-nc-ok"><i data-lucide="truck"></i>Passer la commande</button>
        </div>`;
      icons();
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-newcmd-veil'); });
      $('#lb-nc-title', el).oninput = (e) => { draft.title = e.target.value; };
      $('#lb-nc-isbn', el).oninput = (e) => { draft.isbn = e.target.value; };
      $('#lb-nc-price', el).oninput = (e) => {
        draft.price = e.target.value.replace(/[^\d]/g, '');
        if (draft.acompte > (+draft.price || 0) * draft.qty) draft.acompte = (+draft.price || 0) * draft.qty;
        $('#lb-nc-acval', el).textContent = fmtMAD(draft.acompte);
      };
      $$('[data-ac]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.ac;
          const m = (+draft.price || 0) * draft.qty;
          draft.acompte = v === 'half' ? Math.round(m / 2 / 5) * 5 : Math.min(m || +v, +v);
          $('#lb-nc-acval', el).textContent = fmtMAD(draft.acompte);
        };
      });
      $('#lb-nc-client', el).onclick = () => pickCmdClient((picked) => { draft.client = picked; render(); });
      $('#lb-nc-ok', el).onclick = () => {
        if (!draft.title.trim()) { toast('Le titre est requis'); return; }
        if (!(+draft.price > 0)) { toast('Indiquez un prix de vente'); return; }
        cmdSeq++;
        const cmd = {
          id: `C-${cmdSeq}`, n: cmdSeq,
          title: draft.title.trim(), author: '', isbn: draft.isbn.trim() || `EAN-${cmdSeq}`,
          custId: draft.client && draft.client.id ? draft.client.id : null,
          guest: draft.client && !draft.client.id ? { name: draft.client.name, phone: draft.client.phone } : (draft.client ? null : { name: 'Client de passage', phone: '' }),
          qty: draft.qty, price: +draft.price, acompte: draft.acompte,
          status: 'commande', notified: false,
          orderedAt: new Date(), arrivedAt: null, pickedAt: null,
        };
        CMDS.unshift(cmd);
        closeVeil('#lb-newcmd-veil');
        queueIfOffline(`Commande ${cmd.id}`);
        toast(`${cmd.id} passée, ${cmd.title}${cmd.acompte ? ` · acompte ${cmd.acompte} MAD encaissé` : ''}`);
        if (state.view !== 'commandes') switchView('commandes'); else renderCmd();
        renderBadges(); icons();
      };
    };
    render();
    openVeil('#lb-newcmd-veil');
    icons();
    setTimeout(() => { const i = $('#lb-nc-title', el); if (i && !draft.title) i.focus(); }, 60);
  }

  /* a compact phone-first picker shared by the new-commande form */
  function pickCmdClient(onPick) {
    const el = $('#lb-clientm', root);
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client de la commande</h3>
        <p class="modal-subtle">Son téléphone servira au WhatsApp « il est arrivé ».</p>
        <div class="lb-phone-in"><i data-lucide="phone"></i>
          <input id="lb-pc-q" inputmode="tel" placeholder="06… ou nom, ou nouveau client" value="${esc(q || '')}" autocomplete="off" /></div>
        <div class="lb-cl-results">
          ${hits.map((c) => `
            <button class="lb-cl-row" data-lb-pc="${c.id}">
              <span class="lb-cl-ava ${c.school ? 'school' : ''}">${c.school ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
              <span class="lb-cl-mid"><span class="lb-cl-name">${esc(c.name)}</span><span class="lb-cl-sub">${esc(c.phone)}</span></span>
            </button>`).join('') || ''}
        </div>
        ${q && /\d/.test(q) || (q && !hits.length) ? `
          <button class="lb-cl-new" id="lb-pc-quick"><i data-lucide="user-plus"></i>Utiliser « ${esc(q)} » comme nouveau client</button>` : ''}`;
      $('#lb-pc-q', el).oninput = (e) => { render(e.target.value); icons(); $('#lb-pc-q', el).focus(); moveCaretEnd($('#lb-pc-q', el)); };
      $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-client-veil'); });
      $$('[data-lb-pc]', el).forEach((b) => {
        b.onclick = () => {
          const c = CUST[b.dataset.lbPc];
          closeVeil('#lb-client-veil');
          onPick({ id: c.id, name: c.name, phone: c.phone, school: c.school });
        };
      });
      const quick = $('#lb-pc-quick', el);
      if (quick) quick.onclick = () => {
        const isPhone = /^[\d\s.+-]+$/.test(q.trim());
        closeVeil('#lb-client-veil');
        onPick(isPhone ? { name: 'Client de passage', phone: q.trim() } : { name: q.trim(), phone: '' });
      };
    };
    render('');
    openVeil('#lb-client-veil');
    icons();
    setTimeout(() => { const i = $('#lb-pc-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ WHATSAPP « il est arrivé » ═══════════════════════ */
  function waMessage(c) {
    const cu = cmdCust(c);
    const first = cu.school ? cu.name : cu.name.split(' ')[0];
    const due = cmdDue(c);
    return `Sba7 lkhir ${first}, bonne nouvelle, votre commande « ${c.title} » est arrivée à ${pvName('la Librairie Al Boughaz') || 'la librairie'}.`
      + `\nJe vous la garde au comptoir. Passez quand vous voulez, du lundi au samedi jusqu'à 20h00.`
      + (due > 0 ? `\nSolde à régler au retrait : ${due} MAD.` : (c.acompte ? `\nDéjà réglée, il ne reste rien à payer.` : ''))
      + `\n— envoyé via Kiwi`;
  }

  function openWa(c) {
    const el = $('#lb-wam', root);
    const cu = cmdCust(c);
    let withCover = false;
    el.innerHTML = `
      <button class="lb-modal-x" data-lb-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, il est arrivé</h3>
      <p class="modal-subtle">${esc(cu.name)} ${cu.phone ? `· ${esc(cu.phone)}` : '· numéro manquant'}</p>
      <div class="lb-wa-bubblewrap">
        <div class="lb-wa-bubble">
          <textarea id="lb-wa-text">${esc(waMessage(c))}</textarea>
          <div class="lb-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <button class="lb-wa-cover" id="lb-wa-cover">
        <span class="th">${ART.roman}</span>
        <span class="l">Joindre la photo de couverture, le client confirme que c'est bien le bon livre</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="lb-foot">
        <button class="lb-btn ghost" data-lb-close>Plus tard</button>
        <button class="lb-btn primary" id="lb-wa-send" ${cu.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#lb-wa-veil');
    icons();
    $$('[data-lb-close]', el).forEach((b) => { b.onclick = () => closeVeil('#lb-wa-veil'); });
    $('#lb-wa-cover', el).onclick = () => {
      withCover = !withCover;
      $('#lb-wa-cover', el).classList.toggle('on', withCover);
    };
    /* Ce bouton annonçait « WhatsApp envoyé » et marquait la commande prévenue
       alors qu'aucun message ne partait : le client n'a jamais su que son livre
       était arrivé. Une page web ne peut pas envoyer un WhatsApp toute seule, on
       ouvre donc le brouillon pré-rempli (texte tel qu'édité) et c'est le
       libraire qui appuie sur envoyer. Le lien ne transporte pas la couverture,
       on le dit au lieu de le prétendre. */
    $('#lb-wa-send', el).onclick = () => {
      const txt = $('#lb-wa-text', el);
      const body = txt ? txt.value : waMessage(c);
      const num = String(cu.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Pas de numéro pour ${cu.name}, ajoutez-le à sa fiche`); return; }
      c.notified = true;
      closeVeil('#lb-wa-veil');
      queueIfOffline('Notification WhatsApp');
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${cu.name}, appuyez sur envoyer${withCover ? ' · joignez la couverture dans WhatsApp' : ''}`);
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      renderBadges();
      if (state.view === 'commandes') renderCmd();
      icons();
    };
  }

  /* ═══════════════════════ LISTES SCOLAIRES ═══════════════════════ */
  function activeNiveau() {
    const p = state.listPick;
    if (!p.school) return null;
    const sc = SCHOOLS.find((s) => s.id === p.school);
    if (!sc) return null;
    const nv = sc.niveaux.find((n) => n.id === p.niveau) || null;
    return nv ? { school: sc, niveau: nv } : { school: sc, niveau: null };
  }
  function listLines() {
    const a = activeNiveau();
    if (!a || !a.niveau) return [];
    const out = [];
    a.niveau.groups.forEach((g) => g.lines.forEach((ln) => {
      const r = resolveLine(ln);
      r.group = g.label;
      out.push(r);
    }));
    return out;
  }
  function listTotal() {
    return listLines().filter((r) => state.listChecked[r.key] !== false && r.stock > 0)
      .reduce((s, r) => s + r.price * r.qty, 0);
  }
  function listFullTotal() {
    return listLines().reduce((s, r) => s + r.price * r.qty, 0);
  }

  function renderListes() {
    const panel = $('[data-lb-panel="listes"]', root);
    const a = activeNiveau();
    panel.innerHTML = `
      <div class="lb-listes">
        <div class="lb-li-pick">
          <div class="lb-li-pick-head">École</div>
          ${SCHOOLS.map((sc) => `
            <div class="lb-school ${state.listPick.school === sc.id ? 'on' : ''}" data-lb-school="${sc.id}">
              <div class="lb-school-name"><i data-lucide="building-2"></i>${esc(sc.name)}</div>
              <div class="lb-school-sub">${esc(sc.area)} · ${sc.niveaux.length} liste${sc.niveaux.length > 1 ? 's' : ''}</div>
              ${state.listPick.school === sc.id ? `<div class="lb-niveaux">
                ${sc.niveaux.map((n) => `<button class="lb-niveau ${state.listPick.niveau === n.id ? 'on' : ''}" data-lb-niveau="${n.id}">${esc(n.label)}</button>`).join('')}
              </div>` : ''}
            </div>`).join('')}
        </div>
        <div class="lb-li-body">${a && a.niveau ? listBodyHTML(a) : listEmptyHTML(a)}</div>
      </div>`;

    panel.querySelectorAll('[data-lb-school]').forEach((b) => {
      b.onclick = (e) => {
        if (e.target.closest('[data-lb-niveau]')) return;
        const id = b.dataset.lbSchool;
        if (state.listPick.school === id) { state.listPick = { school: null, niveau: null }; }
        else {
          const sc = SCHOOLS.find((s) => s.id === id);
          state.listPick = { school: id, niveau: sc.niveaux.length === 1 ? sc.niveaux[0].id : null };
          state.listChecked = {};
        }
        renderListes(); icons();
      };
    });
    panel.querySelectorAll('[data-lb-niveau]').forEach((b) => {
      b.onclick = () => {
        state.listPick.niveau = b.dataset.lbNiveau;
        state.listChecked = {};
        renderListes(); icons();
      };
    });
    const body = $('.lb-li-body', panel);
    if (body) {
      body.querySelectorAll('[data-lb-toggle]').forEach((row) => {
        row.onclick = () => {
          const k = row.dataset.lbToggle;
          state.listChecked[k] = state.listChecked[k] === false ? true : false;
          renderListes(); icons();
        };
      });
      const addAll = $('#lb-li-addall', body);
      if (addAll) addAll.onclick = addListToCart;
      const orderMissing = $('#lb-li-order-missing', body);
      if (orderMissing) orderMissing.onclick = () => {
        const missing = listLines().filter((r) => r.stock <= 0);
        if (!missing.length) return;
        switchView('commandes');
        setTimeout(() => openNewCmd(missing[0].title, { isbn: '', price: missing[0].price }), 60);
      };
    }
    icons();
  }

  function listEmptyHTML(a) {
    if (a && !a.niveau) {
      return `<div class="lb-li-empty"><i data-lucide="graduation-cap"></i><div>${esc(a.school.name)}<br>Choisissez un niveau dans la colonne de gauche.</div></div>`;
    }
    return `<div class="lb-li-empty"><i data-lucide="graduation-cap"></i><div>Sélectionnez une école et un niveau,<br>tout le cartable se déplie, prêt à ajouter.</div></div>`;
  }

  function listBodyHTML(a) {
    const lines = listLines();
    const groups = [];
    lines.forEach((r) => {
      let g = groups.find((x) => x.label === r.group);
      if (!g) { g = { label: r.group, rows: [] }; groups.push(g); }
      g.rows.push(r);
    });
    const total = listTotal();
    const full = listFullTotal();
    const missing = lines.filter((r) => r.stock <= 0);
    const checkedCount = lines.filter((r) => state.listChecked[r.key] !== false && r.stock > 0).length;
    const inStockCount = lines.filter((r) => r.stock > 0).length;
    return `
      <div class="lb-li-top">
        <div>
          <h2>${esc(a.school.name)} · ${esc(a.niveau.label)}</h2>
          <div class="sub">${lines.length} fournitures · ${esc(a.school.area)}</div>
        </div>
        <div class="lb-li-total"><div class="val">${fmtMAD(full)}</div><div class="lbl">liste complète</div></div>
      </div>
      <div class="lb-li-scroll">
        ${groups.map((g, gi) => `
          <div class="lb-li-group-head ${gi === 0 ? 'first' : ''}">${esc(g.label)}</div>
          ${g.rows.map((r) => listRowHTML(r)).join('')}
        `).join('')}
        ${missing.length ? `<div style="margin-top:14px;">
          <button class="lb-btn secondary" id="lb-li-order-missing" style="width:100%;"><i data-lucide="truck"></i>Commander les ${missing.length} article${missing.length > 1 ? 's' : ''} épuisé${missing.length > 1 ? 's' : ''} pour la famille</button>
        </div>` : ''}
      </div>
      <div class="lb-li-foot">
        <div class="lb-li-foot-info">
          <b>${checkedCount}/${inStockCount} en stock cochés · ${fmtMAD(total)}</b>
          <span>${missing.length ? `${missing.length} épuisé${missing.length > 1 ? 's' : ''}, à commander à part` : 'tout est en rayon'}</span>
        </div>
        <button class="lb-li-addall" id="lb-li-addall" ${checkedCount ? '' : 'disabled'}><i data-lucide="plus"></i>Tout ajouter au panier</button>
      </div>`;
  }

  function listRowHTML(r) {
    const out = r.stock <= 0;
    const on = !out && state.listChecked[r.key] !== false;
    const sc = stockClass(r.stock);
    return `<div class="lb-li-row ${on ? 'on' : ''} ${out ? 'is-out' : ''}" ${out ? '' : `data-lb-toggle="${esc(r.key)}"`}>
      <span class="lb-li-art">${ART[r.art] || ART.cahier}</span>
      <span class="lb-li-mid">
        <span class="lb-li-name">${esc(r.title)}${r.qty > 1 ? ` <span style="color:var(--ink-3);font-weight:600;">×${r.qty}</span>` : ''}</span>
        <span class="lb-li-meta">${esc(r.author || '')}<span class="lb-li-stock ${sc}">${out ? 'épuisé · à commander' : stockLabel(r.stock)}</span></span>
      </span>
      <span class="lb-li-right">
        <span class="lb-li-price">${fmtMAD(r.price * r.qty)}</span>
        <span class="lb-li-check"><i data-lucide="check"></i></span>
      </span>
    </div>`;
  }

  function addListToCart() {
    const a = activeNiveau();
    if (!a || !a.niveau) return;
    let added = 0, items = 0;
    listLines().forEach((r) => {
      if (r.stock <= 0) return;
      if (state.listChecked[r.key] === false) return;
      if (!r.itemId) return;        /* hors-catalogue : ignoré pour le panier (se commande) */
      addToCart(r.itemId, r.qty);
      added += r.qty; items++;
    });
    if (!added) { toast('Rien à ajouter, tout est décoché ou épuisé'); return; }
    toast(`Cartable ${a.school.name} · ${a.niveau.label}, ${added} article${added > 1 ? 's' : ''} (${items} référence${items > 1 ? 's' : ''}) au panier`);
    switchView('vente');
    renderPanier(); icons();
  }

  /* ═══════════════════════ CLIENTS ═══════════════════════ */
  function renderClients() {
    const panel = $('[data-lb-panel="clients"]', root);
    const q = state.clientQuery.trim();
    const ql = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    const list = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
      c.name.toLowerCase().includes(ql) || (digits.length >= 2 && c.phone.replace(/\D/g, '').includes(digits)));
    const fideles = CUSTOMERS.filter((c) => fidTier(c.points)).length;
    panel.innerHTML = `
      <div class="lb-clients">
        <header class="lb-head">
          <div><h1>Clients</h1><div class="lb-head-sub">Fidélité, 1 MAD dépensé = 1 point · palier −5 % dès ${FID_TIER} points · ${fideles} fidèle${fideles > 1 ? 's' : ''}</div></div>
        </header>
        <div class="lb-clients-bar">
          <div class="lb-search" style="max-width:340px;"><i data-lucide="search"></i>
            <input id="lb-cl-search" placeholder="Nom ou téléphone…" value="${esc(q)}" autocomplete="off" /></div>
        </div>
        <div class="lb-clients-scroll">
          <div class="lb-clients-grid">
            ${list.map(clientCardHTML).join('') || '<div class="lb-cempty">Aucun client pour cette recherche.</div>'}
          </div>
        </div>
      </div>`;
    $('#lb-cl-search', panel).oninput = (e) => {
      state.clientQuery = e.target.value;
      renderClients(); icons();
      const i = $('#lb-cl-search', panel); i.focus(); moveCaretEnd(i);
    };
    panel.querySelectorAll('[data-lb-cwa]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const c = CUST[b.dataset.lbCwa];
        const cmd = CMDS.find((x) => x.custId === c.id && x.status === 'arrivee');
        if (cmd) openWa(cmd);
        else toast(`${c.name}, aucune commande à notifier`);
      };
    });
    icons();
  }

  function clientCardHTML(c) {
    const tier = fidTier(c.points);
    const pct = tier ? 100 : Math.round((c.points % FID_TIER) / FID_TIER * 100);
    const toNext = tier ? 0 : FID_TIER - c.points;
    const openCmds = CMDS.filter((x) => x.custId === c.id && x.status !== 'retiree').length;
    const arrived = CMDS.some((x) => x.custId === c.id && x.status === 'arrivee' && !x.notified);
    return `<div class="lb-ccard">
      <div class="lb-ccard-top">
        <span class="lb-ccard-ava ${c.school ? 'school' : ''}">${c.school ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
        <span class="lb-ccard-id">
          <span class="lb-ccard-name">${esc(c.name)}</span>
          <span class="lb-ccard-tel">${esc(c.phone)}</span>
        </span>
        <span class="lb-ccard-tier ${tier ? 'gold' : ''}">${tier ? 'Fidèle · −5 %' : 'Standard'}</span>
      </div>
      <div class="lb-ccard-pts"><span class="big">${c.points}</span><span class="lbl">points fidélité</span></div>
      <div class="lb-ccard-gauge">
        <div class="lb-ccard-bar"><i style="width:${pct}%"></i></div>
        <div class="lb-ccard-next">${tier ? '<b>Palier −5 % actif</b> sur chaque achat' : `<b>${toNext} pts</b> avant le palier −5 %`}</div>
      </div>
      <div class="lb-ccard-foot">
        <span class="lb-ccard-stat"><i data-lucide="shopping-bag"></i>${c.visits} achats</span>
        ${openCmds ? `<span class="lb-ccard-stat"><i data-lucide="truck"></i>${openCmds} commande${openCmds > 1 ? 's' : ''}</span>` : ''}
        ${c.note ? `<span class="lb-ccard-stat"><i data-lucide="heart"></i>${esc(c.note)}</span>` : ''}
        ${arrived ? `<button class="lb-pill wa" data-lb-cwa="${c.id}" style="cursor:pointer;"><i data-lucide="message-circle"></i>prévenir, arrivé</button>` : ''}
      </div>
    </div>`;
  }

  /* ═══════════════════════ SCAN / ISBN ═══════════════════════ */
  function openScan() {
    /* pick a plausible in-rayon hit to "resolve" to */
    const pool = CATALOG.flatMap((r) => r.items).filter((it) => it.stock > 0);
    const target = pool[Math.floor(Math.random() * pool.length)];
    const el = $('#lb-scanm', root);
    el.innerHTML = `
      <h3 class="modal-title">Scan ISBN…</h3>
      <p class="modal-subtle">Présentez le code-barres au dos du livre.</p>
      <div class="lb-scan-stage">
        <div class="lb-scan-book">${ART[target ? target.art : 'roman'] || ART.roman}</div>
        <div class="lb-scan-laser"></div>
      </div>
      <div class="lb-scan-code">${target ? barcode(target.isbn, 26) : ''}<div style="margin-top:6px;">lecture…</div></div>`;
    openVeil('#lb-scan-veil');
    icons();
    setTimeout(() => {
      closeVeil('#lb-scan-veil');
      if (target) {
        openSheet(target.id);
        toast(`ISBN lu, ${target.title}`);
      } else {
        toast('Code non reconnu (démo)');
      }
    }, 1450);
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
      toast('Mode hors-ligne, la librairie continue de vendre, tout est mis en file');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#lb-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.lb-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.lb-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'lb-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#lb-offline-note', root);
    note.hidden = !state.offline;
    $('#lb-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'librairie',
    greet: {
      line1: 'Sba7 lkhir Hassan,',
      em: 'marhba.',
      sub: 'Librairie Al Boughaz <em>·</em> matinée de rentrée, Petit Socco',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) { $('#lb-today', root).textContent = fmtDT(new Date()); renderBadges(); renderNet(); icons(); } },
  });
})();
