/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · FAST-FOOD MODE — Snack Chamal, Boulevard Pasteur, Tanger (PIN 0005)
 * ---------------------------------------------------------------------------
 * Registered into assets/pos-dispatch.js: one terminal, every métier. The
 * dispatcher creates <div class="vx-screen" id="pos-fastfood">, lazy-loads
 * this pair on first unlock and calls mount(root) once.
 *
 * The story: midi, coup de feu. Bilal tape un tacos, la taille, et la caisse
 * lui souffle LE geste qui paie le loyer — « En menu ? +frites +boisson ·
 * +15 MAD », un seul tap (le différenciateur signature). La commande part
 * dans la file avec son numéro (#47…), l'écran de préparation appelle les
 * numéros au micro, Glovo est flaggé, et le coup de feu se lit en barres CSS.
 *
 * V1 = couche opérationnelle seulement : la carte envoie le montant au
 * lecteur partenaire (aucun encaissement Kiwi). Espèces = rendu calculé,
 * billets rapides. Hors-ligne simulé : les actions s'empilent, la synchro
 * revient avec le réseau.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── real-store guard ─────────────────────────
     Un vrai snack appairé ne doit jamais voir de noms de démo (clients,
     livreurs, équipe). En démo locale : pvReal() === false ⇒ sortie
     strictement identique. */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  /* ───────────────────────── helpers ───────────────────────── */
  let root = null;
  const $  = (s, r) => (r || root || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || root || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const lens   = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtHM  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const MIN = 60 * 1000;
  function agoLabel(d) {
    const m = Math.max(0, Math.round((Date.now() - d.getTime()) / MIN));
    if (m < 1) return 'à l’instant';
    if (m < 60) return `il y a ${m} min`;
    return `il y a ${Math.floor(m / 60)} h ${pad2(m % 60)}`;
  }
  const minsSince = (d) => Math.round((Date.now() - d.getTime()) / MIN);

  function toast(msg, ms) {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2200);
    setTimeout(() => el.remove(), (ms || 2200) + 280);
  }

  /* Deterministic pseudo-barcode (même recette que le pressing). */
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

  /* ───────────────────────── food line-art ─────────────────────────
     Forest strokes, mint-tint fills, 64×64 — la grille EST la carte. */
  const art = (inner) => `<svg class="ff-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    tacos: art(`<path class="fill" d="M18 22h28l-3 32H21z"/><path d="M18 22h28l-3 32H21z"/><path class="fill" d="M18 22l7-9h14l7 9z"/><path d="M18 22l7-9h14l7 9"/><path d="M32 13v9"/><path class="thin" d="M22 31l6 6M29 28l8 8M38 29l5 5"/><path class="thin" d="M20.5 48h23"/>`),
    cheeseburger: art(`<path class="fill" d="M14 27c0-9 8-15 18-15s18 6 18 15v1H14z"/><path d="M14 27c0-9 8-15 18-15s18 6 18 15v1H14z"/><path class="thin" d="M23 19l1.5 1M32 16v1.8M41 19l-1.5 1"/><path d="M12 33l5 3.5 7.5-3.5 7.5 3.5 7.5-3.5 7.5 3.5 5-3.5"/><rect class="fill" x="15" y="40" width="34" height="6" rx="3"/><rect x="15" y="40" width="34" height="6" rx="3"/><path d="M13 50h38v2a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4z"/>`),
    panini: art(`<ellipse class="fill" cx="32" cy="39" rx="21" ry="10.5"/><ellipse cx="32" cy="39" rx="21" ry="10.5"/><path class="thin" d="M11.5 39.5h41"/><path class="thin" d="M19.5 32.5l-3.5 6M28 30.5l-4.5 8M37 30.5l-4.5 8M45.5 32.5l-3.5 6"/><path class="thin" d="M25 17c0 3-3 3-3 6M33.5 14c0 3-3 3-3 6M42 17c0 3-3 3-3 6"/>`),
    chawarma: art(`<path d="M32 5v7"/><path d="M26 5h12"/><path class="fill" d="M21 12h22l-5 34H26z"/><path d="M21 12h22l-5 34H26z"/><path class="thin" d="M21.9 19h20.2M22.9 26h18.2M23.9 33h16.2M24.9 40h14.2"/><path d="M24 52h16"/><path class="thin" d="M49 22l6 3-5 4"/>`),
    frites: art(`<path d="M24 27l-2.5-14M29.5 27l-1-17M35 27l1-17M40 27l2.5-13"/><path class="fill" d="M19 27h26l-3.5 27H22.5z"/><path d="M19 27h26l-3.5 27H22.5z"/><path class="thin" d="M21.5 34c7 2.6 14 2.6 21 0"/>`),
    jus: art(`<path class="fill" d="M22 18h20l-2.5 36h-15z"/><path d="M22 18h20l-2.5 36h-15z"/><path class="thin" d="M23.3 31h17.4"/><path d="M36 18l6-10 4 1.5"/><circle cx="46.5" cy="14" r="5.5"/><path class="thin" d="M46.5 8.5v11M41 14h11"/>`),
    soda: art(`<path d="M33 13V6l5-1.5"/><path class="fill" d="M20 13h24v5H20z"/><path d="M20 13h24v5H20z"/><path class="fill" d="M22 18h20l-2.5 36h-15z"/><path d="M22 18h20l-2.5 36h-15z"/><path class="thin" d="M24.5 27c5 3 10 3 15 0"/><path class="thin" d="M28 40v8M36 40v8"/>`),
  };

  /* ───────────────────────── la carte (MAD, Tanger 2026) ─────────────────────────
     Tap → taille (M/L/XL) → LE réflexe menu (+frites +boisson · +15). */
  const COMBO_PRICE = 15;
  const COMBO_DRINKS = [
    { id: 'coca',   label: 'Coca' },
    { id: 'hawai',  label: 'Hawai' },
    { id: 'poms',   label: 'Pom’s' },
    { id: 'sprite', label: 'Sprite' },
  ];
  const DRINK = Object.fromEntries(COMBO_DRINKS.map((d) => [d.id, d]));
  const SAUCES = ['Algérienne', 'Blanche', 'Harissa', 'Ketchup', 'Mayo', 'Barbecue'];

  const MENU = [
    { id: 'tacos', label: 'Tacos', cat: 'plats', flag: 'le n°1', combo: true, sauces: true,
      variants: [
        { id: 'poulet', label: 'Poulet', d: 0 },
        { id: 'viande', label: 'Viande hachée', d: 3 },
        { id: 'mixte',  label: 'Mixte', d: 5 },
      ],
      sizes: [
        { id: 'm', label: 'M', price: 35 },
        { id: 'l', label: 'L', price: 45 },
        { id: 'xl', label: 'XL', price: 58 },
      ] },
    { id: 'cheeseburger', label: 'Cheeseburger', cat: 'plats', combo: true, sauces: true,
      sizes: [
        { id: 'm', label: 'M', sub: 'simple', price: 28 },
        { id: 'l', label: 'L', sub: 'double', price: 36 },
        { id: 'xl', label: 'XL', sub: 'triple', price: 44 },
      ] },
    { id: 'panini', label: 'Panini', cat: 'plats', combo: true, sauces: true,
      variants: [
        { id: 'poulet', label: 'Poulet', d: 0 },
        { id: 'viande', label: 'Viande hachée', d: 3 },
        { id: 'thon',   label: 'Thon', d: 0 },
      ],
      sizes: [
        { id: 'm', label: 'M', price: 25 },
        { id: 'l', label: 'L', price: 32 },
      ] },
    { id: 'chawarma', label: 'Chawarma', cat: 'plats', flag: 'broche du jour', combo: true, sauces: true,
      variants: [
        { id: 'poulet', label: 'Poulet', d: 0 },
        { id: 'viande', label: 'Viande', d: 3 },
        { id: 'mixte',  label: 'Mixte', d: 5 },
      ],
      sizes: [
        { id: 'm', label: 'M', price: 30 },
        { id: 'l', label: 'L', price: 38 },
        { id: 'xl', label: 'XL', price: 46 },
      ] },
    { id: 'frites', label: 'Frites', cat: 'sides', sauces: true,
      sizes: [
        { id: 'm', label: 'M', price: 12 },
        { id: 'l', label: 'L', price: 16 },
        { id: 'xl', label: 'XL', price: 20 },
      ] },
    { id: 'jus', label: 'Jus frais', cat: 'sides', flag: 'pressé minute',
      variants: [
        { id: 'orange', label: 'Orange', d: 0 },
        { id: 'citron', label: 'Citron', d: 0 },
        { id: 'avocat', label: 'Avocat', d: 5 },
      ],
      sizes: [
        { id: 'm', label: 'M', price: 15 },
        { id: 'l', label: 'L', price: 20 },
      ] },
    { id: 'soda', label: 'Sodas', cat: 'sides',
      variants: [
        { id: 'coca',   label: 'Coca', d: 0 },
        { id: 'hawai',  label: 'Hawai', d: 0 },
        { id: 'poms',   label: 'Pom’s', d: 0 },
        { id: 'sprite', label: 'Sprite', d: 0 },
      ],
      sizes: [
        { id: '33', label: '33 cl', price: 8 },
        { id: '50', label: '50 cl', price: 12 },
      ] },
  ];
  const ITEM = Object.fromEntries(MENU.map((m) => [m.id, m]));
  const CATS = [
    { id: 'plats', label: 'Plats' },
    { id: 'sides', label: 'Sides & boissons' },
  ];

  const sizeOf = (item, id) => item.sizes.find((s) => s.id === id) || item.sizes[0];
  const variantOf = (item, id) => (item.variants || []).find((v) => v.id === id) || null;
  const minPrice = (item) => Math.min(...item.sizes.map((s) => s.price));

  /* ticket line: { itemId, variantId, sizeId, qty, sauces[], combo, drink } */
  function unitPrice(ln) {
    const item = ITEM[ln.itemId];
    const v = variantOf(item, ln.variantId);
    return sizeOf(item, ln.sizeId).price + (v ? v.d : 0) + (ln.combo ? COMBO_PRICE : 0);
  }
  const lineTotal = (ln) => unitPrice(ln) * ln.qty;
  const orderTotal = (o) => o.lines.reduce((s, ln) => s + lineTotal(ln), 0);
  const dueOf = (o) => Math.max(0, orderTotal(o) - o.pay.paid);

  function lineName(ln) {
    const item = ITEM[ln.itemId];
    const v = variantOf(item, ln.variantId);
    const sz = sizeOf(item, ln.sizeId);
    let nm = item.label;
    if (v) nm += ` ${v.label.toLowerCase()}`;
    nm += ` · ${sz.label}`;
    return nm;
  }
  function lineShort(ln) {
    return `${ln.qty}× ${lineName(ln)}${ln.combo ? ' (menu)' : ''}`;
  }
  function lineSub(ln) {
    const bits = [];
    if (ln.combo) bits.push(`menu · frites + ${DRINK[ln.drink] ? DRINK[ln.drink].label : 'Coca'}`);
    if (ln.sauces && ln.sauces.length) bits.push(ln.sauces.join(', '));
    return bits.join(' · ');
  }
  const ln = (itemId, variantId, sizeId, qty, x) => Object.assign(
    { itemId, variantId, sizeId, qty, sauces: [], combo: false, drink: 'coca' }, x || {});

  /* ───────────────────────── canaux ───────────────────────── */
  const CHANNELS = {
    surplace: { label: 'Sur place',  icon: 'utensils' },
    emporter: { label: 'À emporter', icon: 'shopping-bag' },
    glovo:    { label: 'Glovo',      icon: 'bike' },
  };
  function genGlovoRef() {
    let r = 'GLV-';
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 4; i++) r += A[Math.floor(Math.random() * A.length)];
    return r;
  }

  /* ───────────────────────── commandes (seed — plein rush de midi) ─────────────
     Statuses: prep → pret → remis. Compteur du jour à #47 : 46 commandes
     passées depuis l'ouverture, 5 vivantes dans la file. */
  const NOW = Date.now();
  function mkOrder(cfg) {
    return {
      num: cfg.num,
      channel: cfg.channel,
      name: cfg.name || null,
      phone: cfg.phone || null,
      src: cfg.src || null,                 /* 'tel' = commande téléphone */
      glovoRef: cfg.glovoRef || null,
      placedAt: new Date(NOW - cfg.minAgo * MIN),
      status: cfg.status,                   /* prep | pret | remis */
      called: !!cfg.called,
      remisAt: cfg.remisMinAgo != null ? new Date(NOW - cfg.remisMinAgo * MIN) : null,
      pay: cfg.pay,                         /* { method: especes|carte|glovo|null, paid } */
      lines: cfg.lines,
    };
  }

  const ORDERS = pvReal() ? [] : [
    mkOrder({ num: 46, channel: 'surplace', minAgo: 2, status: 'prep',
      pay: { method: 'carte', paid: 80 },
      lines: [
        ln('tacos', 'mixte', 'l', 1, { combo: true, drink: 'hawai', sauces: ['Algérienne'] }),
        ln('jus', 'orange', 'm', 1),
      ] }),
    mkOrder({ num: 45, channel: 'glovo', minAgo: 5, status: 'prep', glovoRef: 'GLV-7Q2M',
      pay: { method: 'glovo', paid: 114 },
      lines: [
        ln('cheeseburger', null, 'l', 2, { combo: true, drink: 'coca' }),
        ln('soda', 'hawai', '50', 1),
      ] }),
    mkOrder({ num: 44, channel: 'emporter', minAgo: 9, status: 'prep',
      name: 'Hamid', phone: '0661 44 02 18', src: 'tel',
      pay: { method: null, paid: 0 },
      lines: [
        ln('chawarma', 'mixte', 'l', 1, { combo: true, drink: 'poms', sauces: ['Blanche'] }),
        ln('jus', 'citron', 'm', 1),
      ] }),
    mkOrder({ num: 43, channel: 'surplace', minAgo: 12, status: 'pret',
      pay: { method: 'especes', paid: 50 },
      lines: [
        ln('tacos', 'poulet', 'm', 1, { combo: true, drink: 'coca', sauces: ['Algérienne', 'Harissa'] }),
      ] }),
    mkOrder({ num: 42, channel: 'emporter', minAgo: 15, status: 'pret', called: true,
      name: 'Yassine', phone: null,
      pay: { method: 'especes', paid: 45 },
      lines: [
        ln('panini', 'thon', 'm', 1),
        ln('frites', null, 'm', 1, { sauces: ['Mayo'] }),
        ln('soda', 'coca', '33', 1),
      ] }),
    mkOrder({ num: 41, channel: 'surplace', minAgo: 19, status: 'remis', called: true, remisMinAgo: 6,
      pay: { method: 'carte', paid: 58 },
      lines: [
        ln('cheeseburger', null, 'm', 1, { combo: true, drink: 'sprite' }),
        ln('jus', 'orange', 'm', 1),
      ] }),
    mkOrder({ num: 40, channel: 'glovo', minAgo: 24, status: 'remis', remisMinAgo: 11, glovoRef: 'GLV-K83A',
      pay: { method: 'glovo', paid: 89 },
      lines: [
        ln('tacos', 'viande', 'xl', 1),
        ln('frites', null, 'l', 1),
        ln('soda', 'sprite', '50', 1),
      ] }),
    mkOrder({ num: 39, channel: 'emporter', minAgo: 29, status: 'remis', called: true, remisMinAgo: 17,
      pay: { method: 'especes', paid: 76 },
      lines: [
        ln('chawarma', 'poulet', 'm', 2, { sauces: ['Blanche'] }),
        ln('frites', null, 'l', 1),
      ] }),
  ];

  /* le service en chiffres — vit avec chaque vente (coup de feu + caisse) */
  /* invariant tenu : especes + carte + glovo + soldes dus = revenue */
  const tally = pvReal() ? {
    orders: 0, revenue: 0, menus: 0, especes: 0, carte: 0, glovo: 0, items: {},
    hours: [
      { t: '10h', n: 0 }, { t: '10h30', n: 0 }, { t: '11h', n: 0 }, { t: '11h30', n: 0 },
      { t: '12h', n: 0 }, { t: '12h30', n: 0 }, { t: '13h', n: 0, now: true },
    ],
  } : {
    orders: 46,
    revenue: 2530,
    menus: 29,
    especes: 1131,
    carte: 926,
    glovo: 400,
    items: { tacos: 21, cheeseburger: 13, chawarma: 11, jus: 9, frites: 8, soda: 10, panini: 7 },
    hours: [
      { t: '10h',   n: 3 },
      { t: '10h30', n: 4 },
      { t: '11h',   n: 5 },
      { t: '11h30', n: 7 },
      { t: '12h',   n: 9 },
      { t: '12h30', n: 13 },
      { t: '13h',   n: 5, now: true },
    ],
  };

  /* ───────────────────────── state ───────────────────────── */
  const state = {
    view: 'vente',
    seq: pvReal() ? 1 : 47,  /* prochain numéro de commande */
    ticket: null,
    lastCalled: pvReal() ? 0 : 42,
    offline: false,
    queued: 0,
  };
  function freshTicket() {
    state.ticket = { lines: [], channel: 'surplace', glovoRef: null };
  }
  const findOrder = (num) => ORDERS.find((o) => o.num === Number(num));
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  function whoLabel(o) {
    if (o.channel === 'glovo') return 'Glovo';
    return o.name || 'Comptoir';
  }
  const ordLabel = (o) => {
    const l = o.lines[0];
    if (!l) return 'Commande';
    const n = o.lines.reduce((s, x) => s + x.qty, 0);
    return o.lines.length > 1 ? `${ITEM[l.itemId].label} +${n - l.qty} art.` : ITEM[l.itemId].label;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le comptoir encaissait tout le service dans `tally` et rien d'autre : la
     patronne voyait 0 MAD et un refresh effaçait la recette du midi.
     Démo : no-op. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('fastfood', { total, method, label, ref });
    } catch (_) {}
  }
  /* Reprise du service en cours : un rechargement (mise à jour PWA, onglet tué,
     batterie) ne doit pas remettre la recette du comptoir à zéro alors que le
     tiroir est plein. Le prochain numéro de commande repart AU-DELÀ du dernier
     encaissé, sinon deux commandes du même service portent le même nº.
     Démo : journal vide, aucun effet. */
  (function restoreDay() {
    try {
      if (!window.KiwiPosSale) return;
      const t = window.KiwiPosSale.totals('fastfood');
      if (!t.count) return;
      tally.especes += t.cash;
      tally.carte += t.card + t.other;
      tally.revenue += t.total;
      tally.orders += t.count;
      state.seq = window.KiwiPosSale.nextSeq('fastfood', state.seq);
    } catch (_) {}
  })();

  /* ═══════════════════════ MOUNT (shell) ═══════════════════════ */
  function mount(rootEl) {
    root = rootEl;
    freshTicket();
    root.innerHTML = `
      <aside class="ff-rail">
        <div class="ff-brand">kiwi<i></i></div>
        <div class="ff-venue">
          <div class="ff-venue-name">${pvName('Snack Chamal') || 'Mon snack'}</div>
          <div class="ff-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Boulevard Pasteur'}<br>Le même Kiwi, <b>un seul compte.</b></div>
        </div>
        <nav class="ff-nav" id="ff-nav">
          <button class="ff-nav-it on" data-ff-view="vente"><i data-lucide="utensils"></i><span>Vente rapide</span></button>
          <button class="ff-nav-it" data-ff-view="file"><i data-lucide="clipboard-list"></i><span>Préparation</span><b class="ff-nav-badge" id="ff-badge-file"></b></button>
          <button class="ff-nav-it" data-ff-view="caisse"><i data-lucide="banknote"></i><span>Encaissement</span><b class="ff-nav-badge" id="ff-badge-caisse"></b></button>
          <button class="ff-nav-it" data-ff-view="rush"><i data-lucide="flame"></i><span>Coup de feu</span></button>
        </nav>
        <div class="ff-rail-foot">
          <button class="ff-net" id="ff-net" title="Simuler une coupure réseau">
            <i class="ff-net-dot"></i><span class="ff-net-label">En ligne</span>
          </button>
          <button class="ff-lock" id="ff-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="ff-main">
        <div class="ff-offline-note" id="ff-offline-note" hidden>
          Hors-ligne, la caisse continue, tout est enregistré sur la tablette et synchronisé au retour du réseau.
          <b id="ff-queue-count"></b>
        </div>
        <section class="ff-view is-on" data-ff-panel="vente">
          <div class="ff-vente">
            <div class="ff-menu">
              <header class="ff-head">
                <div><h1>Vente rapide</h1><div class="ff-head-sub" id="ff-today"></div></div>
                <div class="ff-head-hint">Touchez un plat, taille, menu, et c’est parti en cuisine</div>
              </header>
              <div class="ff-grid-scroll" id="ff-gridwrap"></div>
            </div>
            <aside class="ff-ticket" id="ff-ticket"></aside>
          </div>
        </section>
        <section class="ff-view" data-ff-panel="file"></section>
        <section class="ff-view" data-ff-panel="caisse"></section>
        <section class="ff-view" data-ff-panel="rush"></section>
      </main>
      <div class="modal-veil" id="ff-sheet-veil"><div class="modal ff-sheet ff-rel" id="ff-sheetm"></div></div>
      <div class="modal-veil" id="ff-detail-veil"><div class="modal ff-detail ff-rel" id="ff-detailm"></div></div>
      <div class="modal-veil" id="ff-pay-veil"><div class="modal ff-pay ff-rel" id="ff-paym"></div></div>`;

    $('#ff-nav').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ff-view]');
      if (b) switchView(b.dataset.ffView);
    });
    $('#ff-lock').addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#ff-net').addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    renderAll();
  }

  function openVeil(id) { const v = $(id); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / GLOBAL RENDER ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.ff-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.ffView === view));
    $$('.ff-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.ffPanel === view));
    if (view === 'file') renderFile();
    if (view === 'caisse') renderCaisse();
    if (view === 'rush') renderRush();
    icons();
  }
  function renderBadges() {
    const live = ORDERS.filter((o) => o.status !== 'remis').length;
    const due = ORDERS.filter((o) => dueOf(o) > 0).length;
    const bf = $('#ff-badge-file'), bc = $('#ff-badge-caisse');
    bf.textContent = live || '';
    bf.style.display = live ? '' : 'none';
    bc.textContent = due || '';
    bc.style.display = due ? '' : 'none';
  }
  function renderClock() {
    const el = $('#ff-today');
    if (el) el.textContent = `${fmtDT(new Date())}, service du midi`;
  }
  function refreshOps() {
    renderBadges();
    if (state.view === 'file') renderFile();
    if (state.view === 'caisse') renderCaisse();
    if (state.view === 'rush') renderRush();
    icons();
  }
  function renderAll() {
    renderClock();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ VENTE RAPIDE — la grille ═══════════════════════ */
  function renderGrid() {
    let i = 0;
    $('#ff-gridwrap').innerHTML = CATS.map((c) => `
      <div class="ff-cat-head">${esc(c.label)}</div>
      <div class="ff-grid">${MENU.filter((m) => m.cat === c.id).map((it) => `
        <button class="ff-card" data-ff-item="${it.id}" style="--i:${i++}">
          <span class="ff-card-art">${ART[it.id] || ''}</span>
          <span class="ff-card-name">${esc(it.label)}</span>
          <span class="ff-card-price">dès ${minPrice(it)} MAD${it.combo ? ' · menu +15' : ''}</span>
          ${it.flag ? `<span class="ff-card-flag">${esc(it.flag)}</span>` : ''}
        </button>`).join('')}
      </div>`).join('');
    $('#ff-gridwrap').onclick = (e) => {
      const b = e.target.closest('[data-ff-item]');
      if (b) openSheet(b.dataset.ffItem);
    };
  }

  /* ═══════════════════════ TICKET ═══════════════════════ */
  const ticketCount = (t) => t.lines.reduce((s, l) => s + l.qty, 0);
  const ticketTotal = (t) => t.lines.reduce((s, l) => s + lineTotal(l), 0);

  function renderTicket() {
    const t = state.ticket;
    const total = ticketTotal(t);
    const count = ticketCount(t);
    const menus = t.lines.reduce((s, l) => s + (l.combo ? l.qty : 0), 0);
    const el = $('#ff-ticket');
    el.innerHTML = `
      <div class="ff-tk-head">
        <div><span class="ff-tk-title">Commande</span> <span class="ff-tk-num">· nº ${state.seq}</span></div>
        ${t.lines.length ? '<button class="ff-tk-reset" id="ff-tk-reset">Vider</button>' : ''}
      </div>
      <div class="ff-chan-wrap">
        <div class="ff-seg" data-lens-demo id="ff-chan">
          ${Object.entries(CHANNELS).map(([id, c]) => `
            <button class="ff-seg-it ${t.channel === id ? 'on' : ''}" data-lens-item data-ff-chan="${id}">
              <i data-lucide="${c.icon}"></i>${esc(c.label)}
            </button>`).join('')}
        </div>
        <div class="ff-glovo-row" id="ff-glovo-row" ${t.channel === 'glovo' ? '' : 'hidden'}>
          <i data-lucide="bike"></i>Commande Glovo, déjà payée en ligne<b>${esc(t.glovoRef || '')}</b>
        </div>
      </div>
      <div class="ff-tk-lines" id="ff-tk-lines">
        ${t.lines.length ? t.lines.map((l, i) => lineRow(l, i)).join('') : `
          <div class="ff-tk-empty">
            <i data-lucide="utensils"></i>
            <div>La commande est vide.<br>Touchez la carte, le menu se propose tout seul.</div>
          </div>`}
      </div>
      <div class="ff-tk-foot">
        <div class="ff-tk-tot">
          <span class="pcs"><i data-lucide="clipboard-list"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${menus ? `<span>${menus} menu${menus > 1 ? 's' : ''} · +${fmtMAD(menus * COMBO_PRICE)}</span>` : ''}
        </div>
        <div class="ff-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="ff-validate" id="ff-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="${t.channel === 'glovo' ? 'bike' : 'banknote'}"></i>
          ${t.channel === 'glovo' ? 'Valider Glovo' : 'Encaisser'} · ${fmtMAD(total)}
        </button>
      </div>`;

    const reset = $('#ff-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); lens(); };
    $('#ff-chan', el).onclick = (e) => {
      const b = e.target.closest('[data-ff-chan]');
      if (!b) return;
      setChannel(b.dataset.ffChan);
    };
    $('#ff-validate', el).onclick = validateTicket;
    $('#ff-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-ff-minus]');
      const plus = e.target.closest('[data-ff-plus]');
      const idx = minus ? +minus.dataset.ffMinus : plus ? +plus.dataset.ffPlus : -1;
      if (idx < 0) return;
      const l = t.lines[idx];
      if (plus) l.qty++;
      else { l.qty--; if (l.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons(); lens();
    };
    icons();
    lens();
  }

  /* canal : bascule en place pour laisser la lentille voyager */
  function setChannel(chan) {
    const t = state.ticket;
    if (t.channel === chan) return;
    t.channel = chan;
    if (chan === 'glovo' && !t.glovoRef) t.glovoRef = genGlovoRef();
    $$('#ff-chan [data-ff-chan]').forEach((x) => x.classList.toggle('on', x.dataset.ffChan === chan));
    const row = $('#ff-glovo-row');
    if (row) {
      row.hidden = chan !== 'glovo';
      const b = row.querySelector('b');
      if (b) b.textContent = t.glovoRef || '';
    }
    const v = $('#ff-validate');
    if (v) {
      v.innerHTML = `<i data-lucide="${chan === 'glovo' ? 'bike' : 'banknote'}"></i>
        ${chan === 'glovo' ? 'Valider Glovo' : 'Encaisser'} · ${fmtMAD(ticketTotal(t))}`;
      icons();
    }
  }

  function lineRow(l, i) {
    const sub = lineSub(l);
    return `<div class="ff-line">
      <span class="ff-line-art">${ART[l.itemId] || ''}</span>
      <span class="ff-line-mid">
        <span class="ff-line-name"><span class="nm">${esc(lineName(l))}</span>${l.combo ? '<span class="ff-menu-chip">MENU</span>' : ''}</span>
        ${sub ? `<span class="ff-line-sub">${esc(sub)}</span>` : ''}
      </span>
      <span class="ff-line-right">
        <span class="ff-line-price">${fmtMAD(lineTotal(l))}</span>
        <span class="ff-line-qty">
          <button data-ff-minus="${i}" aria-label="Retirer">−</button><b>${l.qty}</b><button data-ff-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* ═══════════════════════ QUICK SHEET — taille puis LE menu ═══════════════════════ */
  const sheet = { itemId: null, variantId: null, sizeId: null, qty: 1, sauces: [], combo: false, drink: 'coca' };

  function openSheet(itemId) {
    const item = ITEM[itemId];
    Object.assign(sheet, {
      itemId,
      variantId: item.variants ? item.variants[0].id : null,
      sizeId: item.sizes[0].id,
      qty: 1, sauces: [], combo: false, drink: 'coca',
    });
    renderSheet();
    openVeil('#ff-sheet-veil');
    icons();
    lens();
  }

  const sheetUnit = () => unitPrice(sheet);

  function renderSheet() {
    const item = ITEM[sheet.itemId];
    const unit = sheetUnit();
    const el = $('#ff-sheetm');
    const vd = (v) => (v.d ? `+${v.d}` : 'inclus');
    el.innerHTML = `
      <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ff-sheet-head">
        <span class="ff-sheet-art">${ART[item.id] || ''}</span>
        <span class="ff-sheet-title"><h3>${esc(item.label)}</h3><span class="sub">${esc(CATS.find((c) => c.id === item.cat).label)}${item.flag ? ` · ${esc(item.flag)}` : ''}</span></span>
        <span class="ff-sheet-price"><span class="val" id="ff-sheet-total">${fmtMAD(unit * sheet.qty)}</span><span class="per" id="ff-sheet-per">${unit} MAD × ${sheet.qty}</span></span>
      </div>

      ${item.variants ? `<div class="ff-f">
        <div class="ff-f-lbl">${item.id === 'soda' ? 'Parfum' : item.id === 'jus' ? 'Fruit' : 'Garniture'}</div>
        <div class="ff-seg" data-lens-demo id="ff-var-seg">
          ${item.variants.map((v) => `<button class="ff-seg-it ${v.id === sheet.variantId ? 'on' : ''}" data-lens-item data-ff-var="${v.id}">${esc(v.label)}<small>${vd(v)}</small></button>`).join('')}
        </div>
      </div>` : ''}

      <div class="ff-row-2">
        <div class="ff-f">
          <div class="ff-f-lbl">Taille</div>
          <div class="ff-seg" data-lens-demo id="ff-size-seg">
            ${item.sizes.map((s) => `<button class="ff-seg-it ${s.id === sheet.sizeId ? 'on' : ''}" data-lens-item data-ff-size="${s.id}">${esc(s.label)}<small>${s.price} MAD${s.sub ? ` · ${esc(s.sub)}` : ''}</small></button>`).join('')}
          </div>
        </div>
        <div class="ff-f" style="flex:0 0 150px;">
          <div class="ff-f-lbl">Quantité</div>
          <div class="ff-stepper">
            <button id="ff-qty-minus" aria-label="Moins">−</button>
            <b id="ff-qty-val">${sheet.qty}</b>
            <button id="ff-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
      </div>

      ${item.combo ? `<div class="ff-f">
        <button class="ff-combo ${sheet.combo ? 'on' : ''}" id="ff-combo" aria-pressed="${sheet.combo}">
          <span class="ic"><i data-lucide="sparkles"></i></span>
          <span class="l"><b>En menu ?</b><span>+ frites M + boisson 33 cl, le bon réflexe</span></span>
          <span class="price">+${COMBO_PRICE} MAD</span>
          <span class="tick"><i data-lucide="check"></i></span>
        </button>
        <div class="ff-combo-drinks" id="ff-combo-drinks" ${sheet.combo ? '' : 'hidden'}>
          ${COMBO_DRINKS.map((d) => `<button class="ff-chip ${sheet.drink === d.id ? 'on' : ''}" data-ff-drink="${d.id}">${esc(d.label)}</button>`).join('')}
        </div>
      </div>` : ''}

      ${item.sauces ? `<div class="ff-f">
        <div class="ff-f-lbl">Sauces <span class="opt">· offertes, plusieurs possibles</span></div>
        <div class="ff-chips" id="ff-sauces">
          ${SAUCES.map((s) => `<button class="ff-chip ${sheet.sauces.includes(s) ? 'on' : ''}" data-ff-sauce="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
      </div>` : ''}

      <div class="ff-sheet-foot">
        <button class="ff-btn secondary" data-ff-close>Annuler</button>
        <button class="ff-btn primary" id="ff-sheet-add"><i data-lucide="plus"></i>Ajouter · <span id="ff-sheet-cta">${fmtMAD(unit * sheet.qty)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#ff-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#ff-sheet-cta', el).textContent = fmtMAD(u * sheet.qty);
      $('#ff-sheet-per', el).textContent = `${u} MAD × ${sheet.qty}`;
      $('#ff-qty-val', el).textContent = sheet.qty;
    };

    $$('[data-ff-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ff-sheet-veil'); });
    const varSeg = $('#ff-var-seg', el);
    if (varSeg) varSeg.onclick = (e) => {
      const b = e.target.closest('[data-ff-var]');
      if (!b) return;
      sheet.variantId = b.dataset.ffVar;
      $$('[data-ff-var]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    $('#ff-size-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-ff-size]');
      if (!b) return;
      sheet.sizeId = b.dataset.ffSize;
      $$('[data-ff-size]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    $('#ff-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    $('#ff-qty-plus', el).onclick = () => { sheet.qty++; refreshPrice(); };
    const combo = $('#ff-combo', el);
    if (combo) combo.onclick = () => {
      sheet.combo = !sheet.combo;
      combo.classList.toggle('on', sheet.combo);
      combo.setAttribute('aria-pressed', sheet.combo);
      $('#ff-combo-drinks', el).hidden = !sheet.combo;
      refreshPrice();
    };
    const drinks = $('#ff-combo-drinks', el);
    if (drinks) drinks.onclick = (e) => {
      const b = e.target.closest('[data-ff-drink]');
      if (!b) return;
      sheet.drink = b.dataset.ffDrink;
      $$('[data-ff-drink]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    const sauces = $('#ff-sauces', el);
    if (sauces) sauces.onclick = (e) => {
      const b = e.target.closest('[data-ff-sauce]');
      if (!b) return;
      const s = b.dataset.ffSauce;
      const i = sheet.sauces.indexOf(s);
      if (i >= 0) sheet.sauces.splice(i, 1); else sheet.sauces.push(s);
      b.classList.toggle('on', i < 0);
    };
    $('#ff-sheet-add', el).onclick = addSheetToTicket;
  }

  function addSheetToTicket() {
    const newLine = ln(sheet.itemId, sheet.variantId, sheet.sizeId, sheet.qty, {
      sauces: sheet.sauces.slice(), combo: sheet.combo, drink: sheet.drink,
    });
    /* fusionner les lignes identiques — réflexe fast-food */
    const key = (l) => [l.itemId, l.variantId, l.sizeId, l.combo, l.combo ? l.drink : '', l.sauces.slice().sort().join('|')].join('~');
    const twin = state.ticket.lines.find((l) => key(l) === key(newLine));
    if (twin) twin.qty += newLine.qty;
    else state.ticket.lines.push(newLine);
    closeVeil('#ff-sheet-veil');
    toast(`${lineName(newLine)}${newLine.combo ? ' en menu' : ''} × ${newLine.qty}, sur la commande`);
    renderTicket(); icons(); lens();
  }

  /* ═══════════════════════ ENCAISSEMENT (modal kit caisse) ═══════════════════════
     Vente fraîche : espèces (billets rapides + rendu) / carte (lecteur
     partenaire) / plus tard — puis la commande part dans la file avec le
     numéro suivant. settle : encaisser un solde existant. */
  function validateTicket() {
    const t = state.ticket;
    if (!t.lines.length) return;
    const order = {
      num: state.seq,
      channel: t.channel,
      name: null, phone: null, src: null,
      glovoRef: t.channel === 'glovo' ? t.glovoRef : null,
      placedAt: new Date(),
      status: 'prep',
      called: false, remisAt: null,
      pay: { method: null, paid: 0 },
      lines: t.lines.map((l) => ({ ...l, sauces: l.sauces.slice() })),
    };
    openPay(order, { fresh: true });
  }

  function postOrder(order) {
    ORDERS.unshift(order);
    state.seq++;
    const total = orderTotal(order);
    tally.orders++;
    tally.revenue += total;
    order.lines.forEach((l) => {
      tally.items[l.itemId] = (tally.items[l.itemId] || 0) + l.qty;
      if (l.combo) tally.menus += l.qty;
    });
    const hb = tally.hours[tally.hours.length - 1];
    hb.n++;
    freshTicket();
    renderTicket();
    renderBadges();
    queueIfOffline(`Commande #${order.num}`);
    icons(); lens();
  }

  function receiptHTML(o, rendu, received) {
    const total = orderTotal(o);
    const due = dueOf(o);
    const payLbl = o.pay.method === 'carte' ? 'Carte · lecteur partenaire'
      : o.pay.method === 'especes' ? 'Espèces'
      : o.pay.method === 'glovo' ? 'Glovo · payé en ligne'
      : 'À encaisser au retrait';
    return `<div class="ff-receipt">
      <div class="c b lg">SNACK CHAMAL</div>
      <div class="c mut">Boulevard Pasteur, Tanger<br>propulsé par Kiwi</div>
      <hr>
      <div class="row"><span>Commande</span><span class="b">#${o.num}</span></div>
      <div class="row"><span>Canal</span><span>${CHANNELS[o.channel].label}${o.glovoRef ? ` · ${esc(o.glovoRef)}` : ''}</span></div>
      <div class="row"><span>Heure</span><span>${fmtHM(o.placedAt)}</span></div>
      <hr>
      ${o.lines.map((l) => `<div class="row"><span class="nm">${l.qty} × ${esc(lineName(l))}${l.combo ? ' (menu)' : ''}</span><span>${lineTotal(l)}</span></div>
        ${l.combo ? `<div class="row mut"><span class="nm">&nbsp;&nbsp;+ frites · + ${esc(DRINK[l.drink] ? DRINK[l.drink].label : 'Coca')}</span><span></span></div>` : ''}`).join('')}
      <hr>
      <div class="row tot"><span>TOTAL</span><span>${total} MAD</span></div>
      <div class="row"><span>Règlement</span><span>${payLbl}</span></div>
      ${received != null && o.pay.method === 'especes' ? `<div class="row"><span>Reçu</span><span>${received} MAD</span></div>` : ''}
      ${rendu ? `<div class="row b"><span>RENDU</span><span>${rendu} MAD</span></div>` : ''}
      ${due > 0 ? `<div class="row due"><span>SOLDE AU RETRAIT</span><span>${due} MAD</span></div>` : ''}
      <hr>
      <div class="c">${barcode(`SC-${o.num}`, 24)}</div>
      <div class="c mut">#${o.num} · merci, bsa7a !</div>
    </div>`;
  }

  function openPay(order, ctx) {
    const el = $('#ff-paym');
    const fresh = !!(ctx && ctx.fresh);
    const settle = !!(ctx && ctx.settle);
    const total = orderTotal(order);
    const amount = settle ? dueOf(order) : total;
    const who = whoLabel(order);

    const closeBtns = () => $$('[data-ff-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ff-pay-veil'); });

    const stepMethod = () => {
      if (fresh && order.channel === 'glovo') { stepGlovo(); return; }
      el.innerHTML = `
        <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${settle ? `Encaisser le solde, #${order.num}` : 'Encaissement'}</h3>
        <p class="modal-subtle">${settle ? `${esc(who)} · ${esc(CHANNELS[order.channel].label)}` : `Commande nº ${order.num} · ${esc(CHANNELS[order.channel].label)}`}</p>
        <div class="modal-amount size-md">${fmtMAD(amount)}</div>
        <div class="ff-pay-opts">
          <button class="ff-pay-opt" data-ff-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Flous direct, billets rapides, rendu calculé</span></span>
          </button>
          <button class="ff-pay-opt" data-ff-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
          ${fresh ? `
          <button class="ff-pay-opt" data-ff-m="later">
            <span class="ic"><i data-lucide="hand-coins"></i></span>
            <span class="l"><b>Encaisser au retrait</b><span>La commande part en cuisine, le solde reste sur le nº</span></span>
          </button>` : ''}
        </div>`;
      icons();
      closeBtns();
      $$('[data-ff-m]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.ffM;
          if (m === 'especes') stepCash();
          else if (m === 'carte') stepCard();
          else stepLater();
        };
      });
    };

    const stepCash = () => {
      let received = amount;
      const bills = [...new Set([amount, ...[50, 100, 200, 500].filter((b) => b > amount)])].slice(0, 4);
      el.innerHTML = `
        <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${settle ? `#${order.num} · ${esc(who)}` : `Commande nº ${order.num}`}, touchez le billet reçu, le rendu suit</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ff-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="ff-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Billets rapides">
            ${bills.map((b) => `<button class="cash-preset" data-ff-bill="${b}">${b === amount ? 'Exact' : `${b} MAD`}</button>`).join('')}
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="ff-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ff-cash-ok">Confirmer</button>
        </div>`;
      icons();
      closeBtns();
      const refresh = () => {
        $('#ff-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#ff-cash-ok', el).disabled = received < amount;
      };
      $('#ff-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-ff-bill]', el).forEach((b) => {
        b.onclick = () => { received = +b.dataset.ffBill; $('#ff-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#ff-cash-ok', el).onclick = () => done('especes', Math.max(0, received - amount), received);
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${settle ? `#${order.num} · ${esc(who)}` : `Commande nº ${order.num}`}, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ff-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ff-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      closeBtns();
      setTimeout(() => {
        const disc = $('#ff-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#ff-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0, null), 850);
        });
      }, 1900);
    };

    const stepGlovo = () => {
      el.innerHTML = `
        <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Commande Glovo</h3>
        <p class="modal-subtle">${esc(order.glovoRef || '')}, déjà payée en ligne, rien à encaisser au comptoir</p>
        <div class="modal-amount size-md">${fmtMAD(total)}</div>
        <div class="ff-pay-opts">
          <button class="ff-pay-opt dark" id="ff-glovo-go">
            <span class="ic"><i data-lucide="bike"></i></span>
            <span class="l"><b>Envoyer en cuisine</b><span>Glovo verse le total du mois, facture fin de mois</span></span>
          </button>
        </div>
        <div class="ff-foot-note">Le livreur donne la référence · la commande sort flaggée Glovo dans la file</div>`;
      icons();
      closeBtns();
      $('#ff-glovo-go', el).onclick = () => done('glovo', 0, null);
    };

    const stepLater = () => {
      order.pay = { method: null, paid: 0 };
      postOrder(order);
      success(order, 0, null, `Solde ${fmtMAD(total)} à encaisser au retrait, gardé sur le nº`);
    };

    const done = (method, rendu, received) => {
      if (settle) {
        order.pay.method = method;
        order.pay.paid += amount;
        tally[method === 'carte' ? 'carte' : 'especes'] += amount;
        /* Le solde du « payer au retrait » est l'argent qui rentre vraiment :
           c'est ici qu'il devient une recette, pas au moment de la commande. */
        postDay(amount, method, `Solde #${order.num} · ${ordLabel(order)}`, `#${order.num}`);
        closeVeil('#ff-pay-veil');
        queueIfOffline('Encaissement');
        toast(`Solde encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        if (ctx && typeof ctx.onDone === 'function') ctx.onDone();
        refreshOps();
        return;
      }
      order.pay = { method, paid: amount };
      if (method === 'especes') tally.especes += amount;
      else if (method === 'carte') tally.carte += amount;
      else if (method === 'glovo') tally.glovo += amount;
      postDay(amount, method, ordLabel(order), `#${order.num}`);
      postOrder(order);
      success(order, rendu, received, null);
    };

    const success = (o, rendu, received, note) => {
      el.innerHTML = `
        <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="ff-bignum">#${o.num}</div>
        <div class="ff-bignum-sub">${o.channel === 'glovo'
          ? `Flaggée Glovo, remettez au livreur quand c’est prêt`
          : 'Annoncez le numéro, la cuisine est dessus'}</div>
        ${receiptHTML(o, rendu, received)}
        ${note ? `<div class="ff-foot-note">${esc(note)}</div>` : ''}
        <div class="ff-sheet-foot">
          <button class="ff-btn secondary" id="ff-print"><i data-lucide="printer"></i>Imprimer</button>
          <button class="ff-btn primary" id="ff-next"><i data-lucide="check"></i>Client suivant</button>
        </div>`;
      icons();
      closeBtns();
      toast(`#${o.num} en préparation${rendu ? `, rendu ${fmtMAD(rendu)}` : ''}`);
      $('#ff-print', el).onclick = () => toast('Ticket parti, imprimante 80 mm du comptoir');
      $('#ff-next', el).onclick = () => closeVeil('#ff-pay-veil');
    };

    /* `go` (tuiles Espèces/Carte de la vue encaissement) saute l'étape méthode */
    if (ctx && ctx.go === 'especes') stepCash();
    else if (ctx && ctx.go === 'carte') stepCard();
    else stepMethod();
    openVeil('#ff-pay-veil');
  }

  /* ═══════════════════════ FILE DE PRÉPARATION ═══════════════════════ */
  const FLOW = [
    { id: 'prep',  label: 'En préparation', dot: '#D99A2B' },
    { id: 'pret',  label: 'Prêt',           dot: 'var(--emerald)' },
    { id: 'remis', label: 'Remis',          dot: 'var(--ink-4)' },
  ];

  function nextToCall() {
    return ORDERS.filter((o) => o.status === 'pret' && !o.called && o.channel !== 'glovo')
      .sort((a, b) => a.placedAt - b.placedAt)[0] || null;
  }

  function payPill(o) {
    const due = dueOf(o);
    if (o.pay.method === 'glovo') return '<span class="ff-pill ok">Payé · Glovo</span>';
    if (due <= 0) return `<span class="ff-pill ok">Payé · ${o.pay.method === 'carte' ? 'carte' : 'espèces'}</span>`;
    return `<span class="ff-pill due">À encaisser · ${due} MAD</span>`;
  }
  function chanPill(o) {
    if (o.channel === 'glovo') return `<span class="ff-pill glovo"><i data-lucide="bike"></i>Glovo${o.glovoRef ? ` <b>${esc(o.glovoRef)}</b>` : ''}</span>`;
    const c = CHANNELS[o.channel];
    return `<span class="ff-pill"><i data-lucide="${c.icon}"></i>${esc(c.label)}</span>`;
  }

  function orderCard(o) {
    const waiting = minsSince(o.placedAt);
    const late = o.status === 'prep' && waiting >= 12;
    const when = o.status === 'remis'
      ? `remis à ${o.remisAt ? fmtHM(o.remisAt) : '—'}`
      : agoLabel(o.placedAt);
    /* div, pas button — les actions rapides sont des boutons imbriqués */
    return `<div class="ff-ocard ${o.status}" data-ff-o="${o.num}" role="button" tabindex="0">
      <span class="ff-ocard-top"><span class="ff-onum">#${o.num}</span>
        <span class="ff-owhen ${late ? 'late' : ''}">${late ? `${waiting} min · ça chauffe` : esc(when)}</span></span>
      <span class="ff-opills">
        ${chanPill(o)}
        ${o.name ? `<span class="ff-pill"><i data-lucide="${o.src === 'tel' ? 'phone' : 'user'}"></i>${esc(o.name)}</span>` : ''}
        ${payPill(o)}
        ${o.called && o.status === 'pret' ? '<span class="ff-pill warn"><i data-lucide="volume-2"></i>appelé</span>' : ''}
      </span>
      <span class="ff-oitems">${o.lines.map((l) => esc(lineShort(l))).join('<br>')}</span>
      ${o.status !== 'remis' ? `<span class="ff-oact">
        ${o.status === 'prep' ? `<button class="ff-btn primary" data-ff-act="pret" data-ff-num="${o.num}"><i data-lucide="bell"></i>Prêt</button>` : ''}
        ${o.status === 'pret' && o.channel !== 'glovo' ? `<button class="ff-btn secondary" data-ff-act="call" data-ff-num="${o.num}"><i data-lucide="megaphone"></i>Appeler</button>` : ''}
        ${o.status === 'pret' ? `<button class="ff-btn primary" data-ff-act="remis" data-ff-num="${o.num}"><i data-lucide="check"></i>${o.channel === 'glovo' ? 'Au livreur' : 'Remis'}</button>` : ''}
      </span>` : ''}
    </div>`;
  }

  function renderFile() {
    const panel = $('[data-ff-panel="file"]');
    const target = nextToCall();
    const live = ORDERS.filter((o) => o.status !== 'remis').length;
    const cols = FLOW.map((f) => {
      let list = ORDERS.filter((o) => o.status === f.id);
      list = f.id === 'remis'
        ? list.sort((a, b) => (b.remisAt || 0) - (a.remisAt || 0)).slice(0, 6)
        : list.sort((a, b) => a.placedAt - b.placedAt);
      return { f, list };
    });
    panel.innerHTML = `
      <div class="ff-file">
        <header class="ff-head">
          <div><h1>File de préparation</h1><div class="ff-head-sub">${live} commande${live > 1 ? 's' : ''} vivante${live > 1 ? 's' : ''} · prochain nº ${state.seq}</div></div>
          <div class="ff-head-hint">prep → prêt → remis, Glovo flaggé dans la file</div>
        </header>
        <div class="ff-callbar">
          <div class="ff-mic">
            <i data-lucide="volume-2"></i>
            <span class="l"><span class="lbl">Au micro</span><b id="ff-mic-num">${state.lastCalled ? `#${state.lastCalled}` : '—'}</b></span>
          </div>
          <span class="ff-call-hint">le client entend son numéro, pas son nom</span>
          ${target
            ? `<button class="ff-callbtn" id="ff-call-next"><i data-lucide="megaphone"></i>Appeler le ${target.num}</button>`
            : '<span class="none">Rien à appeler, tout est servi ou en préparation</span>'}
        </div>
        <div class="ff-cols">
          ${cols.map(({ f, list }) => `
            <div class="ff-col">
              <div class="ff-col-head"><i style="background:${f.dot}"></i>${f.label} <span class="ct">${list.length}</span></div>
              ${list.map(orderCard).join('') || `<div class="ff-bempty">${f.id === 'prep' ? 'Rien en cuisine, la grille n’attend que vous.' : f.id === 'pret' ? 'Rien de prêt pour l’instant.' : 'Les remises du service s’affichent ici.'}</div>`}
            </div>`).join('')}
        </div>
      </div>`;
    const callBtn = $('#ff-call-next', panel);
    if (callBtn) callBtn.onclick = () => callOrder(target);
    panel.onclick = (e) => {
      const act = e.target.closest('[data-ff-act]');
      if (act) {
        const o = findOrder(act.dataset.ffNum);
        if (!o) return;
        if (act.dataset.ffAct === 'pret') markPret(o);
        else if (act.dataset.ffAct === 'call') callOrder(o);
        else if (act.dataset.ffAct === 'remis') deliver(o);
        return;
      }
      const card = e.target.closest('[data-ff-o]');
      if (card) openDetail(card.dataset.ffO);
    };
    panel.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest && e.target.closest('[data-ff-o]');
      if (card) { e.preventDefault(); openDetail(card.dataset.ffO); }
    };
    icons();
  }

  function markPret(o) {
    o.status = 'pret';
    queueIfOffline(`#${o.num} prêt`);
    toast(o.channel === 'glovo'
      ? `#${o.num} prêt, le livreur Glovo peut passer`
      : `#${o.num} prêt, appelez le numéro`);
    refreshOps();
  }

  function callOrder(o) {
    o.called = true;
    state.lastCalled = o.num;
    toast(`${o.num}, c’est prêt !`);
    if (state.view === 'file') {
      renderFile(); icons();
      const mic = $('#ff-mic-num');
      if (mic) { mic.classList.remove('pop'); void mic.offsetWidth; mic.classList.add('pop'); }
    } else refreshOps();
  }

  function deliver(o) {
    const due = dueOf(o);
    if (due > 0) {
      toast(`Solde ${fmtMAD(due)} à encaisser d’abord, khlass puis remise`);
      openPay(o, { settle: true, onDone: () => deliver(o) });
      return;
    }
    o.status = 'remis';
    o.remisAt = new Date();
    queueIfOffline(`#${o.num} remis`);
    toast(o.channel === 'glovo'
      ? `#${o.num} remis au livreur Glovo, bonne route`
      : `#${o.num} remis, bsa7a !`);
    refreshOps();
  }

  /* ---------- détail commande ---------- */
  function openDetail(num) {
    const o = findOrder(num);
    if (!o) return;
    const el = $('#ff-detailm');
    const due = dueOf(o);
    const st = FLOW.find((f) => f.id === o.status);
    el.innerHTML = `
      <button class="ff-modal-x" data-ff-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ff-dt-head">
        <div>
          <h3>#${o.num}</h3>
          <div class="ff-dt-sub">
            ${chanPill(o)}
            ${o.name ? `<span class="ff-pill"><i data-lucide="${o.src === 'tel' ? 'phone' : 'user'}"></i>${esc(o.name)}${o.phone ? ` · ${esc(o.phone)}` : ''}</span>` : ''}
            <span class="ff-pill ${o.status === 'pret' ? 'ok' : o.status === 'prep' ? 'warn' : ''}">${st.label}</span>
            ${payPill(o)}
          </div>
          <div class="ff-dt-sub" style="margin-top:5px;">Passée à ${fmtHM(o.placedAt)} · ${esc(agoLabel(o.placedAt))}${o.remisAt ? ` · remise à ${fmtHM(o.remisAt)}` : ''}${o.called && o.status === 'pret' ? ' · déjà appelée' : ''}</div>
        </div>
      </div>
      <div class="ff-dt-lines">
        ${o.lines.map((l) => {
          const sub = lineSub(l);
          return `<div class="ff-dline">
            <span class="ff-dline-art">${ART[l.itemId] || ''}</span>
            <span class="ff-dline-mid">
              <span class="ff-dline-name">${esc(lineName(l))}${l.combo ? '<span class="ff-menu-chip">MENU</span>' : ''}</span>
              ${sub ? `<span class="ff-dline-sub">${esc(sub)}</span>` : ''}
            </span>
            <span class="ff-dline-qty">×${l.qty}</span>
            <span class="ff-dline-price">${fmtMAD(lineTotal(l))}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="ff-dt-sub" style="margin:0 0 14px;">Total <b style="font-family:var(--mono);">${fmtMAD(orderTotal(o))}</b>${due > 0 ? ` · <span style="color:var(--danger-mute);font-weight:600;">solde ${fmtMAD(due)}</span>` : ''}</div>
      <div class="ff-dt-actions">
        ${o.status === 'prep' ? `<button class="ff-btn primary" id="ff-dt-pret"><i data-lucide="bell"></i>Marquer prêt</button>` : ''}
        ${o.status === 'pret' && o.channel !== 'glovo' ? `<button class="ff-btn secondary" id="ff-dt-call"><i data-lucide="megaphone"></i>Appeler le ${o.num}</button>` : ''}
        ${due > 0 && o.status !== 'remis' ? `<button class="ff-btn secondary" id="ff-dt-pay"><i data-lucide="banknote"></i>Encaisser · ${due} MAD</button>` : ''}
        ${o.status === 'pret' ? `<button class="ff-btn primary" id="ff-dt-remis"><i data-lucide="check"></i>${o.channel === 'glovo' ? 'Remis au livreur' : 'Remis au client'}</button>` : ''}
        <button class="ff-btn ghost" id="ff-dt-kds"><i data-lucide="printer"></i>Ticket cuisine</button>
      </div>`;
    openVeil('#ff-detail-veil');
    icons();
    $$('[data-ff-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ff-detail-veil'); });
    const pretB = $('#ff-dt-pret', el);
    if (pretB) pretB.onclick = () => { markPret(o); openDetail(o.num); };
    const callB = $('#ff-dt-call', el);
    if (callB) callB.onclick = () => { callOrder(o); openDetail(o.num); };
    const payB = $('#ff-dt-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#ff-detail-veil');
      openPay(o, { settle: true, onDone: () => openDetail(o.num) });
    };
    const remisB = $('#ff-dt-remis', el);
    if (remisB) remisB.onclick = () => {
      if (dueOf(o) > 0) { closeVeil('#ff-detail-veil'); deliver(o); return; }
      deliver(o);
      openDetail(o.num);
    };
    $('#ff-dt-kds', el).onclick = () => toast(`#${o.num} renvoyé en cuisine, imprimante 80 mm`);
  }

  /* ═══════════════════════ ENCAISSEMENT (vue) ═══════════════════════ */
  function renderCaisse() {
    const panel = $('[data-ff-panel="caisse"]');
    const dues = ORDERS.filter((o) => dueOf(o) > 0).sort((a, b) => a.placedAt - b.placedAt);
    panel.innerHTML = `
      <div class="ff-caisse">
        <div class="ff-caisse-inner">
          <header class="ff-head" style="padding:22px 0 0;">
            <div><h1>Encaissement</h1><div class="ff-head-sub">Le flous du service, espèces, carte, et le compte Glovo</div></div>
          </header>
          <div class="ff-till">
            <div class="ff-till-tile">
              <span class="lbl"><i data-lucide="banknote"></i>Espèces</span>
              <div class="val">${fmtMAD(tally.especes)}</div>
              <div class="sub">en caisse depuis l’ouverture</div>
            </div>
            <div class="ff-till-tile">
              <span class="lbl"><i data-lucide="credit-card"></i>Carte</span>
              <div class="val">${fmtMAD(tally.carte)}</div>
              <div class="sub">lecteur partenaire, V1 sans encaissement Kiwi</div>
            </div>
            <div class="ff-till-tile dark">
              <span class="lbl"><i data-lucide="bike"></i>Glovo</span>
              <div class="val">${fmtMAD(tally.glovo)}</div>
              <div class="sub">versé fin de mois, rien au comptoir</div>
            </div>
          </div>
          <div class="ff-due-head"><i data-lucide="hand-coins"></i>À encaisser <span class="ct">${dues.length}</span></div>
          ${dues.length ? dues.map((o) => `
            <div class="ff-duecard">
              <div class="ff-duecard-top">
                <div class="ff-duecard-who">
                  <b>#${o.num}</b><span class="nm">${esc(whoLabel(o))}</span>
                  <span>${esc(CHANNELS[o.channel].label)}${o.src === 'tel' ? ' · commandé par téléphone' : ''} · ${esc(agoLabel(o.placedAt))}${o.phone ? ` · ${esc(o.phone)}` : ''}</span>
                </div>
                <div class="ff-due-amt"><b>${fmtMAD(dueOf(o))}</b><span>solde</span></div>
              </div>
              <div class="ff-duecard-items">${o.lines.map((l) => esc(lineShort(l))).join(' · ')}</div>
              <div class="ff-duecard-act">
                <button class="ff-btn secondary" data-ff-due-cash="${o.num}"><i data-lucide="banknote"></i>Espèces</button>
                <button class="ff-btn secondary" data-ff-due-card="${o.num}"><i data-lucide="credit-card"></i>Carte</button>
                <button class="ff-btn ghost" data-ff-due-open="${o.num}">Détail</button>
              </div>
            </div>`).join('') : `
            <div class="ff-allclear">
              <i data-lucide="check-circle-2"></i>
              <div>Rien à encaisser, tout est khlass.<br>Les soldes « payer au retrait » atterrissent ici.</div>
            </div>`}
          <div class="ff-foot-note">Les commandes Glovo ne passent jamais par la caisse, le compte se fait fin de mois.</div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const cash = e.target.closest('[data-ff-due-cash]');
      const card = e.target.closest('[data-ff-due-card]');
      const open = e.target.closest('[data-ff-due-open]');
      if (cash) { const o = findOrder(cash.dataset.ffDueCash); if (o) openPay(o, { settle: true, go: 'especes' }); }
      else if (card) { const o = findOrder(card.dataset.ffDueCard); if (o) openPay(o, { settle: true, go: 'carte' }); }
      else if (open) openDetail(open.dataset.ffDueOpen);
    };
    icons();
  }

  /* ═══════════════════════ COUP DE FEU ═══════════════════════ */
  function renderRush() {
    const panel = $('[data-ff-panel="rush"]');
    const maxH = Math.max(...tally.hours.map((h) => h.n), 1);
    const panier = tally.orders ? Math.round(tally.revenue / tally.orders) : 0;
    const menuRate = tally.orders ? Math.round((tally.menus / tally.orders) * 100) : 0;
    const top = Object.entries(tally.items)
      .sort((a, b) => b[1] - a[1]).slice(0, 3);
    const topMax = top.length ? top[0][1] : 1;
    panel.innerHTML = `
      <div class="ff-rush">
        <header class="ff-head">
          <div><h1>Coup de feu</h1><div class="ff-head-sub">Service du midi · ${tally.orders} commandes depuis l’ouverture · prochain nº ${state.seq}</div></div>
          <div class="ff-head-hint">Les chiffres bougent à chaque vente</div>
        </header>
        <div class="ff-rush-grid">
          <div class="ff-panel">
            <div class="ff-panel-h">Commandes / heure <span class="hint">· par demi-heure</span></div>
            <div class="ff-bars">
              ${tally.hours.map((h, i) => `
                <div class="ff-barcol ${h.now ? 'now' : ''}">
                  <span class="ff-bar-n">${h.n}</span>
                  <div class="ff-bar ${h.now ? 'now' : ''}" style="height:${Math.max(5, Math.round((h.n / maxH) * 100))}%;--i:${i}"></div>
                  <span class="ff-bar-t">${esc(h.t)}</span>
                </div>`).join('')}
            </div>
            <div class="ff-bars-foot"><i></i>demi-heure en cours, le pic était à 12h30</div>
          </div>
          <div class="ff-rush-side">
            <div class="ff-kpi-row">
              <div class="ff-kpi">
                <div class="lbl">Panier moyen</div>
                <div class="val">${fmtMAD(panier)}</div>
                <div class="sub">${fmtMAD(tally.revenue)} de CA ce midi</div>
              </div>
              <div class="ff-kpi">
                <div class="lbl">Commandes</div>
                <div class="val">${tally.orders}</div>
                <div class="sub">${ORDERS.filter((o) => o.status !== 'remis').length} encore en file</div>
              </div>
              <div class="ff-kpi hero">
                <span class="ic"><i data-lucide="sparkles"></i></span>
                <div>
                  <div class="lbl">Taux de menu, l’upsell qui paie</div>
                  <div class="val">${menuRate} %</div>
                  <div class="sub">${tally.menus} menus × +${COMBO_PRICE} MAD = +${fmtMAD(tally.menus * COMBO_PRICE)} ce midi</div>
                </div>
              </div>
            </div>
            <div class="ff-panel">
              <div class="ff-panel-h">Top 3 du midi</div>
              <div class="ff-top">
                ${top.map(([id, n], i) => `
                  <div class="ff-top-row">
                    <span class="ff-top-rank">${i + 1}</span>
                    <span class="ff-top-art">${ART[id] || ''}</span>
                    <span class="ff-top-mid">
                      <span class="ff-top-name">${esc(ITEM[id] ? ITEM[id].label : id)}</span>
                      <span class="ff-top-track"><span class="ff-top-fill" style="width:${Math.round((n / topMax) * 100)}%"></span></span>
                    </span>
                    <span class="ff-top-n">×${n}</span>
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    icons();
  }

  /* ═══════════════════════ HORS-LIGNE (file simulée) ═══════════════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline && state.queued) {
      toast(`Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`);
      state.queued = 0;
    } else if (state.offline) {
      toast('Mode hors-ligne, la caisse continue, tout est mis en file');
    } else {
      toast('Réseau de retour, tout est synchronisé');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#ff-net');
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.ff-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.ff-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'ff-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#ff-offline-note');
    note.hidden = !state.offline;
    $('#ff-queue-count').textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ registre dispatcher ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'fastfood',
    greet: {
      line1: pvReal() ? 'Sba7 lkhir,' : 'Sba7 lkhir Bilal,',
      em: 'marhba.',
      sub: 'Snack Chamal <em>·</em> coup de feu de midi, 5 commandes en file',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() {
      if (!root) return;
      renderClock();
      renderBadges();
      renderNet();
      if (state.view === 'file') renderFile();
      if (state.view === 'caisse') renderCaisse();
      if (state.view === 'rush') renderRush();
      icons();
      lens();
    },
  });
})();
