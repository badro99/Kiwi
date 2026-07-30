/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PIZZERIA LA MARSA — vertical POS for kiwi-caisse.html (PIN 0007)
 * ---------------------------------------------------------------------------
 * Registered on window.KiwiPosDispatch (assets/pos-dispatch.js) which owns the
 * PIN choreography and our root <div class="vx-screen" id="pos-pizzeria">.
 * Everything else lives here: the carte (pizza grid with line-art, config
 * sheet taille/pâte/suppléments), the signature MOITIÉ-MOITIÉ (two pizzas on
 * one pie, prix = la plus chère + 5 MAD, split-circle preview), the FOUR
 * (4 places, 12 min par pizza, timers en anneau), and the LIVRAISON board
 * (zones Tanger avec frais, livreurs Mehdi/Anas, payé à la livraison).
 *
 * Reuses the caisse modal kit (.modal-veil, .modal, .cash-*, .reader-*) and
 * #toast-stack. V1 = operational layer only: la carte envoie le montant au
 * lecteur partenaire, Kiwi n'encaisse pas.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (!window.KiwiPosDispatch) return;

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons  = () => { if (window.lucide) try { lucide.createIcons(); } catch (e) {} };
  const lens   = () => { if (window.KiwiLens) try { KiwiLens.rescan(); } catch (e) {} };
  const pad2   = (n) => String(n).padStart(2, '0');

  /* Real / paired-store identity — a real store never shows the demo name
   * ("Pizzeria La Marsa"). Local demo (unpaired localhost) keeps it. */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  const MIN    = 60 * 1000;
  const fmtMS  = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${pad2(t % 60)}`; };
  const fmtClock = (ts) => { const d = new Date(ts); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  const fmtSince = (ts) => {
    const m = Math.round((Date.now() - ts) / MIN);
    return m <= 0 ? "à l'instant" : m === 1 ? 'il y a 1 min' : `il y a ${m} min`;
  };

  function toast(msg, ms) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2400);
    setTimeout(() => el.remove(), (ms || 2400) + 280);
  }

  /* ───────────────────────── line-art ─────────────────────────
     One visual voice: forest strokes, mint-tint fills, 64×64 grid.
     Each pizza is a recognizable disc; the calzone is the folded one. */
  const art  = (inner) => `<svg class="pz-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const DISC = '<circle class="fill" cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="24"/><circle class="thin" cx="32" cy="32" r="19"/>';

  const ART = {
    margherita: art(`${DISC}
      <circle cx="25" cy="26" r="4.5"/><circle cx="39" cy="29" r="4.5"/><circle cx="30" cy="41" r="4.5"/>
      <path class="thin" d="M40 39c3.5-1.5 6 .5 5 4-3.5 1.5-6-.5-5-4z"/>
      <path class="thin" d="M19.5 34.5c-2.4 1-2.8 3.9-1 5.3 2.4-1 2.8-3.9 1-5.3z"/>`),
    thon_olives: art(`${DISC}
      <path d="M21.5 24.5c2.5-2 6-1.4 6.5 1.1.5 2.4-2 4.4-4.9 3.9-2.9-.5-4.1-3-1.6-5z"/>
      <path d="M34.5 37.5c2.5-2 6-1.4 6.5 1.1.5 2.4-2 4.4-4.9 3.9-2.9-.5-4.1-3-1.6-5z"/>
      <circle cx="40.5" cy="25" r="2.4"/><circle cx="24.5" cy="40" r="2.4"/><circle cx="33" cy="31" r="2.4"/>
      <path class="thin" d="M38.5 45c3-1 5.2-3 6.2-6"/>`),
    poulet: art(`${DISC}
      <path d="M20.5 27.5l9.5-4"/><path d="M24.5 35.5l10.5-4.5"/><path d="M31.5 43.5l9.5-4"/>
      <circle cx="40" cy="21.5" r="1.6"/><circle cx="22" cy="42.5" r="1.6"/>
      <path class="thin" d="M38.5 33c2-1.5 1-3.5 3-5"/>`),
    fromages: art(`${DISC}
      <path class="thin" d="M32 13.5v37M13.5 32h37"/>
      <path d="M20.5 24c1.8 1.8 4 1.8 5.8 0"/><path d="M37.5 23c1.8 1.8 4 1.8 5.8 0"/>
      <path d="M20.5 41c1.8 1.8 4 1.8 5.8 0"/><path d="M37.5 42c1.8 1.8 4 1.8 5.8 0"/>`),
    fdm: art(`${DISC}
      <path d="M21 26c-3.5 1.5-4.5 6-1 8 2.5 1.4 6 0 6-3"/><path class="thin" d="M26 32.5l3 2.5"/>
      <path d="M41 23.5c3.5 1.5 4.5 6 1 8-2.5 1.4-6 0-6-3"/><path class="thin" d="M36 30l-3 2.5"/>
      <path d="M28 40h10c0 4-2.2 6.5-5 6.5S28 44 28 40z"/><path class="thin" d="M33 40v6"/>`),
    vege: art(`${DISC}
      <circle cx="24" cy="27" r="4.2"/><circle class="thin" cx="24" cy="27" r="1.8"/>
      <path d="M36 26c0-3.2 9-3.2 9 0 0 1.3-9 1.3-9 0z"/><path d="M40.5 27.5v3.5"/>
      <circle cx="29" cy="41" r="2.2"/><circle cx="39" cy="38" r="2.2"/>
      <path class="thin" d="M19.5 37.5c-2.4 1-2.8 3.9-1 5.3 2.4-1 2.8-3.9 1-5.3z"/>`),
    calzone: art(`
      <path class="fill" d="M11 41a21 21 0 0 1 42 0c-7 3.5-35 3.5-42 0z"/>
      <path d="M11 41a21 21 0 0 1 42 0c-7 3.5-35 3.5-42 0z"/>
      <path class="thin" d="M32 20v-3M42.5 22.8l1.5-2.6M21.5 22.8l-1.5-2.6M50.2 30.5l2.6-1.5M13.8 30.5l-2.6-1.5"/>
      <path d="M25.5 35.5c1.5 1 3 1 4.5 0M35 33c1.5 1 3 1 4.5 0"/>
      <path class="thin" d="M26 13c-1 1.8 1 2.8 0 4.6M38 13c-1 1.8 1 2.8 0 4.6"/>`),
    coca: art(`
      <path d="M28.5 8h7v4h-7z"/>
      <path class="fill" d="M27 16c-2.5 2.5-3.5 5.5-3.5 9 0 9 2 13 2 22 0 2.5 2.5 4 6.5 4s6.5-1.5 6.5-4c0-9 2-13 2-22 0-3.5-1-6.5-3.5-9l-1-4h-8z"/>
      <path d="M27 16c-2.5 2.5-3.5 5.5-3.5 9 0 9 2 13 2 22 0 2.5 2.5 4 6.5 4s6.5-1.5 6.5-4c0-9 2-13 2-22 0-3.5-1-6.5-3.5-9l-1-4h-8z"/>
      <path class="thin" d="M24.5 30c5 2.5 10 2.5 15 0M25 37c4.7 2.3 9.3 2.3 14 0"/>`),
    hawai: art(`
      <rect class="fill" x="22" y="15" width="20" height="36" rx="4.5"/>
      <rect x="22" y="15" width="20" height="36" rx="4.5"/>
      <path d="M22 21h20"/><path class="thin" d="M22 45h20"/>
      <path class="thin" d="M32 30l4.5 7h-9z"/><path class="thin" d="M32 30c-1.6-2 1.6-2.4 0-4.4M32 30c1.6-2-1.6-2.4 0-4.4"/>`),
    oulmes: art(`
      <path d="M29 8h6v5h-6z"/>
      <path class="fill" d="M28 17c-2 2-3 4.5-3 8v22c0 3 2.5 4.5 7 4.5s7-1.5 7-4.5V25c0-3.5-1-6-3-8l-1-4h-6z"/>
      <path d="M28 17c-2 2-3 4.5-3 8v22c0 3 2.5 4.5 7 4.5s7-1.5 7-4.5V25c0-3.5-1-6-3-8l-1-4h-6z"/>
      <circle class="thin" cx="30" cy="41" r="1.4"/><circle class="thin" cx="34.5" cy="34.5" r="1.4"/><circle class="thin" cx="30.5" cy="28" r="1.4"/>`),
    sidiali: art(`
      <path d="M29 8h6v5h-6z"/>
      <path class="fill" d="M28 17c-2 2-3 4.5-3 8v22c0 3 2.5 4.5 7 4.5s7-1.5 7-4.5V25c0-3.5-1-6-3-8l-1-4h-6z"/>
      <path d="M28 17c-2 2-3 4.5-3 8v22c0 3 2.5 4.5 7 4.5s7-1.5 7-4.5V25c0-3.5-1-6-3-8l-1-4h-6z"/>
      <path class="thin" d="M27.5 35l3.5-5 2.5 3.5 2-2.5 3 4z"/><path class="thin" d="M26.5 42h11"/>`),
  };

  /* mini toppings drawn in the LEFT half (x ≤ 30) — mirrored for the right
     half of the moitié-moitié preview, so both pizzas keep their signature */
  const MINI = {
    margherita: '<circle cx="20" cy="27" r="3.6"/><circle cx="23" cy="39" r="3.6"/><path class="thin" d="M14 33c-2 1-2.3 3.3-.8 4.5 2-1 2.3-3.3.8-4.5z"/>',
    thon_olives: '<path d="M16 27c2-1.6 4.8-1.2 5.2.9.4 1.9-1.6 3.5-3.9 3.1-2.3-.4-3.3-2.4-1.3-4z"/><circle cx="23" cy="38" r="2"/><circle cx="15" cy="38.5" r="2"/>',
    poulet: '<path d="M14 28l8-3.5"/><path d="M16 38l8-3.5"/><circle cx="23.5" cy="44" r="1.4"/>',
    fromages: '<path class="thin" d="M21 19v26"/><path d="M13 27c1.5 1.5 3.4 1.5 4.9 0"/><path d="M13 38c1.5 1.5 3.4 1.5 4.9 0"/>',
    fdm: '<path d="M15 26c-2.8 1.2-3.6 4.8-.8 6.4 2 1.1 4.8 0 4.8-2.4"/><path d="M14.5 40h8c0 3.2-1.8 5-4 5s-4-1.8-4-5z"/>',
    vege: '<circle cx="19" cy="27" r="3.4"/><circle class="thin" cx="19" cy="27" r="1.4"/><path d="M14 38.5c0-2.6 7-2.6 7 0 0 1-7 1-7 0z"/><path d="M17.5 39.7v2.6"/>',
  };
  const halfArt = (a, b) => `<svg class="pz-art" viewBox="0 0 64 64" aria-hidden="true">
    <circle class="fill" cx="32" cy="32" r="24"/>
    <g>${MINI[a] || ''}</g>
    <g transform="translate(64 0) scale(-1 1)">${MINI[b] || ''}</g>
    <circle cx="32" cy="32" r="24"/>
    <circle class="thin" cx="32" cy="32" r="19"/>
    <path d="M32 8v48"/>
  </svg>`;

  /* ───────────────────────── carte & tarifs (MAD, Tanger 2026) ───────────────────────── */
  const SIZES = [
    { id: 's', label: 'S', cm: '25 cm' },
    { id: 'm', label: 'M', cm: '33 cm' },
    { id: 'l', label: 'L', cm: '40 cm' },
  ];
  const SIZE = Object.fromEntries(SIZES.map((s) => [s.id, s]));
  const PATES = [
    { id: 'fine',    label: 'Fine' },
    { id: 'epaisse', label: 'Épaisse' },
  ];
  const SUPPS = [
    { id: 'fromage',     label: 'Fromage',     price: 8 },
    { id: 'thon',        label: 'Thon',        price: 10 },
    { id: 'olives',      label: 'Olives',      price: 5 },
    { id: 'champignons', label: 'Champignons', price: 7 },
  ];
  const SUPP = Object.fromEntries(SUPPS.map((s) => [s.id, s]));
  const HALF_FEE = 5;
  const BAKE_MS = 12 * 60 * 1000;          /* 12 min par pizza, four à bois */
  const OVEN_CAP = 4;

  const PIZZAS = [
    { id: 'margherita',  label: 'Margherita',     sub: 'tomate, mozzarella, basilic',          prices: { s: 35, m: 45, l: 60 } },
    { id: 'thon_olives', label: 'Thon & olives',  sub: 'thon, olives noires, oignon doux',     prices: { s: 42, m: 55, l: 72 }, flag: 'la classique' },
    { id: 'poulet',      label: 'Poulet fumé',    sub: 'poulet fumé, poivron, origan',         prices: { s: 45, m: 60, l: 78 } },
    { id: 'fromages',    label: '4 fromages',     sub: 'mozzarella, edam, chèvre, bleu',       prices: { s: 48, m: 65, l: 85 } },
    { id: 'fdm',         label: 'Fruits de mer',  sub: 'crevettes, calamars, citron',          prices: { s: 55, m: 75, l: 98 }, flag: 'pêche du jour' },
    { id: 'vege',        label: 'Végétarienne',   sub: 'poivron, champignon, olive, tomate',   prices: { s: 40, m: 52, l: 68 } },
    { id: 'calzone',     label: 'Calzone',        sub: 'pliée, dinde fumée, fromage, oeuf',   prices: { s: 38, m: 50 }, flag: 'pizza fermée', noHalf: true },
  ];
  const PIZZA = Object.fromEntries(PIZZAS.map((p) => [p.id, p]));
  const DRINKS = [
    { id: 'coca',    label: 'Coca-Cola', sub: '33 cl',           price: 10 },
    { id: 'hawai',   label: 'Hawai',     sub: '33 cl · ananas',  price: 10 },
    { id: 'oulmes',  label: 'Oulmès',    sub: '50 cl · gazeuse', price: 12 },
    { id: 'sidiali', label: 'Sidi Ali',  sub: '50 cl',           price: 8 },
  ];
  const DRINK = Object.fromEntries(DRINKS.map((d) => [d.id, d]));

  /* ───────────────────────── livraison — zones Tanger & livreurs ───────────────────────── */
  const ZONES = [
    { id: 'centre',     label: 'Centre ville', fee: 10, eta: '20–30 min' },
    { id: 'malabata',   label: 'Malabata',     fee: 15, eta: '25–35 min' },
    { id: 'achakar',    label: 'Achakar',      fee: 20, eta: '35–45 min' },
    { id: 'california', label: 'California',   fee: 15, eta: '25–35 min' },
  ];
  const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
  /* Staff/livreurs roster — a real store never shows the demo cast. Real ⇒
   * neutral "Serveur N", blank role; ids/length kept so the board still works. */
  const COURIERS = pvReal()
    ? [
        { id: 'mehdi', name: 'Serveur 1', sub: '' },
        { id: 'anas',  name: 'Serveur 2', sub: '' },
      ]
    : [
        { id: 'mehdi', name: 'Mehdi', sub: 'scooter rouge' },
        { id: 'anas',  name: 'Anas',  sub: 'scooter bleu' },
      ];
  const COURIER = Object.fromEntries(COURIERS.map((c) => [c.id, c]));

  /* Client fiches — real store starts with an empty carnet (no demo people);
   * new clients are created live via openClient(). Local demo keeps the cast. */
  const CUSTOMERS = pvReal() ? [] : [
    { id: 'k1', name: 'Karim Benjelloun',   phone: '0661 45 23 89', address: 'Rés. Marina Bay, imm. 3, apt 12', zone: 'malabata',   orders: 17 },
    { id: 'k2', name: 'Salma El Idrissi',   phone: '0670 88 12 34', address: '14 rue de Hollande',              zone: 'centre',     orders: 9 },
    { id: 'k3', name: 'Hicham Drissi',      phone: '0650 33 21 70', address: 'Lot. California, villa 22',       zone: 'california', orders: 26, pref: 'toujours moitié-moitié' },
    { id: 'k4', name: 'Rim Bennis',         phone: '0668 90 41 25', address: 'Achakar plage, café Sindibad',    zone: 'achakar',    orders: 4 },
    { id: 'k5', name: 'Nadia Amrani',       phone: '0677 12 65 09', address: 'Av. Moulay Youssef 51',           zone: 'centre',     orders: 12 },
    { id: 'k6', name: 'Othmane Cherkaoui',  phone: '0662 74 30 18', address: 'Café del Mar, Malabata',          zone: 'malabata',   orders: 7 },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

  /* ───────────────────────── commandes & four ─────────────────────────
     Chaque pizza est un JOB individuel : file → four (12 min) → prête.
     Le four a 4 places (oven[i] = jid). Les boissons sont prêtes d'office. */
  const JOB = {};                             /* jid → job */
  const oven = [null, null, null, null];      /* place → jid */
  const NOW = Date.now();

  function jobLabel(ln) {
    if (ln.pidB) return `½ ${PIZZA[ln.pid].label} · ½ ${PIZZA[ln.pidB].label}`;
    return PIZZA[ln.pid].label;
  }
  function buildJobs(o) {
    const jobs = []; let n = 0;
    o.lines.forEach((ln) => {
      if (ln.kind !== 'pizza') return;
      for (let q = 0; q < ln.qty; q++) {
        n++;
        jobs.push({
          jid: `${o.id}-${n}`, orderId: o.id,
          pid: ln.pid, pidB: ln.pidB || null, size: ln.size,
          label: jobLabel(ln),
          status: 'file', slot: null, startAt: null, endAt: null, alerted: false,
        });
      }
    });
    return jobs;
  }

  function linePrice(ln) {
    if (ln.kind === 'drink') return DRINK[ln.did].price * ln.qty;
    const p = PIZZA[ln.pid];
    let base = p.prices[ln.size] || 0;
    if (ln.pidB) base = Math.max(base, PIZZA[ln.pidB].prices[ln.size] || 0) + HALF_FEE;
    const supp = (ln.supps || []).reduce((s, id) => s + (SUPP[id] ? SUPP[id].price : 0), 0);
    return (base + supp) * ln.qty;
  }
  function orderTotal(o) {
    const sub = o.lines.reduce((s, ln) => s + linePrice(ln), 0);
    const fee = o.mode === 'livraison' && o.zone ? ZONE[o.zone].fee : 0;
    return { sub, fee, total: sub + fee };
  }
  function orderDue(o) { return Math.max(0, orderTotal(o).total - o.pay.paid); }
  function kitchenDone(o) { return o.jobs.every((j) => j.status === 'prete'); }
  function isClosed(o) {
    if (orderDue(o) > 0) return false;
    if (o.mode === 'surplace') return o.served;
    if (o.mode === 'emporter') return o.remis;
    return !!o.delivery.deliveredAt;
  }
  function custOf(o) {
    if (o.custId) return CUST[o.custId];
    if (o.guest) return { name: o.guest, phone: '' };
    return { name: 'Client de passage', phone: '' };
  }
  function destLabel(o) {
    if (o.mode === 'surplace') return o.table ? `Table ${o.table}` : 'Sur place';
    if (o.mode === 'emporter') return 'Emporter';
    return o.zone ? `Livraison · ${ZONE[o.zone].label}` : 'Livraison';
  }
  function findOrder(id) { return ORDERS.find((o) => o.id === id); }
  function courierOrder(cid) {
    return ORDERS.find((o) => o.mode === 'livraison' && o.delivery.courier === cid && !o.delivery.deliveredAt);
  }

  function seedOrder(cfg) {
    const o = {
      id: cfg.id, mode: cfg.mode,
      table: cfg.table || null,
      custId: cfg.custId || null,
      guest: cfg.guest || null,
      zone: cfg.zone || null,
      address: cfg.address != null ? cfg.address : ((cfg.custId && CUST[cfg.custId].address) || ''),
      lines: cfg.lines,
      createdAt: NOW - cfg.agoMin * MIN,
      pay: cfg.pay,
      delivery: {
        courier: cfg.courier || null,
        departedAt: cfg.departedMin != null ? NOW - cfg.departedMin * MIN : null,
        deliveredAt: cfg.deliveredMin != null ? NOW - cfg.deliveredMin * MIN : null,
      },
      served: !!cfg.served, remis: !!cfg.remis,
    };
    o.jobs = buildJobs(o);
    (cfg.jobs || []).forEach((js, i) => { if (o.jobs[i]) Object.assign(o.jobs[i], js); });
    o.jobs.forEach((j) => {
      JOB[j.jid] = j;
      if (j.status === 'four' && j.slot != null) oven[j.slot] = j.jid;
    });
    return o;
  }

  /* Service du soir, en plein rush — 3 pizzas au four, 2 commandes dans le
     circuit livraison, une à encaisser au retrait, une file qui pousse. */
  const ORDERS = pvReal() ? [] : [
    seedOrder({ id: 'M-207', mode: 'surplace', table: 'T5', agoMin: 2,
      pay: { method: null, paid: 0, deferred: 'table' },
      lines: [
        { kind: 'pizza', pid: 'poulet', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'pizza', pid: 'fdm', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'drink', did: 'coca', qty: 2 },
      ] }),
    seedOrder({ id: 'M-206', mode: 'emporter', custId: 'k5', agoMin: 28,
      pay: { method: null, paid: 0, deferred: 'retrait' },
      lines: [
        { kind: 'pizza', pid: 'fromages', size: 'm', pate: 'epaisse', supps: [], qty: 1, note: '' },
        { kind: 'drink', did: 'hawai', qty: 1 },
      ],
      jobs: [{ status: 'prete' }] }),
    seedOrder({ id: 'M-205', mode: 'emporter', guest: 'Sofia', agoMin: 5,
      pay: { method: 'especes', paid: 78, deferred: null },
      lines: [{ kind: 'pizza', pid: 'poulet', size: 'l', pate: 'fine', supps: [], qty: 1, note: 'bien cuite' }],
      jobs: [{ status: 'four', slot: 2, startAt: NOW - (BAKE_MS - 450 * 1000), endAt: NOW + 450 * 1000 }] }),
    seedOrder({ id: 'M-204', mode: 'surplace', table: 'T3', agoMin: 7,
      pay: { method: null, paid: 0, deferred: 'table' },
      lines: [
        { kind: 'pizza', pid: 'margherita', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'pizza', pid: 'vege', size: 'm', pate: 'fine', supps: ['fromage'], qty: 1, note: '' },
        { kind: 'drink', did: 'sidiali', qty: 1 },
      ],
      jobs: [
        { status: 'four', slot: 0, startAt: NOW - (BAKE_MS - 50 * 1000),  endAt: NOW + 50 * 1000 },
        { status: 'four', slot: 1, startAt: NOW - (BAKE_MS - 250 * 1000), endAt: NOW + 250 * 1000 },
      ] }),
    seedOrder({ id: 'M-203', mode: 'livraison', custId: 'k3', zone: 'california', agoMin: 14,
      pay: { method: 'carte', paid: 117, deferred: null },
      lines: [
        { kind: 'pizza', pid: 'thon_olives', pidB: 'fromages', size: 'l', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'drink', did: 'oulmes', qty: 1 },
      ],
      jobs: [{ status: 'prete' }] }),
    seedOrder({ id: 'M-202', mode: 'livraison', custId: 'k1', zone: 'malabata', agoMin: 22,
      courier: 'mehdi', departedMin: 9,
      pay: { method: null, paid: 0, deferred: 'livraison' },
      lines: [
        { kind: 'pizza', pid: 'thon_olives', size: 'l', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'pizza', pid: 'margherita', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' },
        { kind: 'drink', did: 'coca', qty: 1 },
      ],
      jobs: [{ status: 'prete' }, { status: 'prete' }] }),
    seedOrder({ id: 'M-201', mode: 'livraison', custId: 'k2', zone: 'centre', agoMin: 50,
      courier: 'anas', deliveredMin: 35,
      pay: { method: 'especes', paid: 55, deferred: null },
      lines: [{ kind: 'pizza', pid: 'margherita', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' }],
      jobs: [{ status: 'prete' }] }),
    seedOrder({ id: 'M-200', mode: 'livraison', custId: 'k6', zone: 'malabata', agoMin: 75,
      courier: 'mehdi', deliveredMin: 58,
      pay: { method: 'carte', paid: 145, deferred: null },
      lines: [
        { kind: 'pizza', pid: 'poulet', size: 'l', pate: 'epaisse', supps: [], qty: 1, note: '' },
        { kind: 'pizza', pid: 'vege', size: 'm', pate: 'fine', supps: [], qty: 1, note: '' },
      ],
      jobs: [{ status: 'prete' }, { status: 'prete' }] }),
  ];

  /* ───────────────────────── state ───────────────────────── */
  let root = null;
  let seq = 208;
  let ticking = null;
  const state = { view: 'carte', ticket: null, offline: false, queued: 0 };
  function freshTicket() {
    state.ticket = { num: posRef(`M-${seq}`), mode: 'surplace', table: null, customer: null, zone: null, address: '', lines: [] };
  }
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     La pizzeria encaissait dans o.pay, et ORDERS meurt avec l'onglet : la
     recette du service n'existait nulle part. Démo : no-op. */
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('pizzeria', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de commande repart AU-DELÀ du dernier encaissé aujourd'hui :
     sans ça un rechargement le remet à M-208 et deux commandes du même service
     portent le même numéro. Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) seq = window.KiwiPosSale.nextSeq('pizzeria', seq); } catch (_) {}

  const lineArt = (ln) => ln.kind === 'drink' ? (ART[ln.did] || '') : (ln.pidB ? halfArt(ln.pid, ln.pidB) : (ART[ln.pid] || ''));
  const jobArt  = (j) => j.pidB ? halfArt(j.pid, j.pidB) : (ART[j.pid] || '');
  const lineName = (ln) => ln.kind === 'drink' ? DRINK[ln.did].label : jobLabel(ln);

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="pz-rail">
        <div class="pz-brand">kiwi<i></i></div>
        <div class="pz-venue">
          <div class="pz-venue-name">${esc(pvName('Pizzeria La Marsa') || 'Pizzeria')}</div>
          <div class="pz-venue-sub">${pvReal() ? (esc(pvCity('')) || '') : 'Tanger · Marina'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="pz-nav" id="pz-nav">
          <button class="pz-nav-it on" data-pz-view="carte"><i data-lucide="pizza"></i><span>Carte</span></button>
          <button class="pz-nav-it" data-pz-view="four"><i data-lucide="flame"></i><span>Four</span><b class="pz-nav-badge" id="pz-badge-four"></b></button>
          <button class="pz-nav-it" data-pz-view="livraison"><i data-lucide="bike"></i><span>Livraison</span><b class="pz-nav-badge" id="pz-badge-liv"></b></button>
        </nav>
        <div class="pz-rail-foot">
          <button class="pz-net" id="pz-net" title="Simuler une coupure réseau">
            <i class="pz-net-dot"></i><span class="pz-net-label">En ligne</span>
          </button>
          <button class="pz-lock" id="pz-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="pz-main">
        <div class="pz-offline-note" id="pz-offline-note" hidden>
          Hors-ligne, les commandes et le four continuent sur la tablette, tout se synchronise au retour du réseau.
          <b id="pz-queue-count"></b>
        </div>
        <section class="pz-view is-on" data-pz-panel="carte">
          <div class="pz-carte">
            <header class="pz-head">
              <div><h1>La carte</h1><div class="pz-head-sub" id="pz-stats"></div></div>
              <div class="pz-head-hint">Touchez une pizza, taille, pâte, suppléments, moitié-moitié</div>
            </header>
            <div class="pz-grid-scroll" id="pz-gridwrap"></div>
          </div>
          <aside class="pz-ticket" id="pz-ticket"></aside>
        </section>
        <section class="pz-view" data-pz-panel="four"></section>
        <section class="pz-view" data-pz-panel="livraison"></section>
      </main>
      <div class="modal-veil" id="pz-sheet-veil"><div class="modal pz-sheet pz-rel" id="pz-sheetm"></div></div>
      <div class="modal-veil" id="pz-table-veil"><div class="modal pz-table pz-rel" id="pz-tablem"></div></div>
      <div class="modal-veil" id="pz-client-veil"><div class="modal pz-client pz-rel" id="pz-clientm"></div></div>
      <div class="modal-veil" id="pz-zone-veil"><div class="modal pz-zone pz-rel" id="pz-zonem"></div></div>
      <div class="modal-veil" id="pz-pay-veil"><div class="modal pz-pay pz-rel" id="pz-paym"></div></div>`;

    $('#pz-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-pz-view]');
      if (b) switchView(b.dataset.pzView);
    });
    $('#pz-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#pz-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) v.classList.remove('is-open'); });
    });

    freshTicket();
    renderAll();
    if (!ticking) ticking = setInterval(tick, 1000);
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(id) { const v = typeof id === 'string' ? $(id, root) : id; if (v) v.classList.remove('is-open'); }

  /* ═══════════════════════ NAV / GLOBAL RENDERS ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.pz-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.pzView === view));
    $$('.pz-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.pzPanel === view));
    if (view === 'four') renderFour();
    if (view === 'livraison') renderLivraison();
    icons();
  }
  function renderBadges() {
    let fourN = 0;
    ORDERS.forEach((o) => o.jobs.forEach((j) => { if (j.status === 'file' || j.status === 'four') fourN++; }));
    const livN = ORDERS.filter((o) => o.mode === 'livraison' && kitchenDone(o) && !o.delivery.deliveredAt).length;
    const bF = $('#pz-badge-four', root), bL = $('#pz-badge-liv', root);
    bF.textContent = fourN || ''; bF.style.display = fourN ? '' : 'none';
    bL.textContent = livN || ''; bL.style.display = livN ? '' : 'none';
  }
  function renderStats() {
    const paid = ORDERS.reduce((s, o) => s + o.pay.paid, 0);
    $('#pz-stats', root).innerHTML =
      `Service du soir, <b>${ORDERS.length}</b> commandes · <b>${fmtMAD(paid)}</b> encaissés`;
  }
  function refreshOps() {
    renderBadges();
    renderStats();
    if (state.view === 'four') renderFour();
    if (state.view === 'livraison') renderLivraison();
    if (state.view === 'carte') renderTicket();
    icons();
  }
  function renderAll() {
    renderStats();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
    lens();
  }

  /* ═══════════════════════ CARTE — grid ═══════════════════════ */
  function minPrice(p) { return Math.min.apply(null, Object.values(p.prices)); }
  function renderGrid() {
    let i = 0;
    $('#pz-gridwrap', root).innerHTML = `
      <div class="pz-cat-head">Pizzas, four à bois · ${PIZZAS.length}</div>
      <div class="pz-grid">${PIZZAS.map((p) => `
        <button class="pz-card" data-pz-pizza="${p.id}" style="--i:${i++}">
          <span class="pz-card-art">${ART[p.id] || ''}</span>
          <span class="pz-card-name">${esc(p.label)}</span>
          <span class="pz-card-sub">${esc(p.sub)}</span>
          <span class="pz-card-price">dès ${minPrice(p)} MAD</span>
          ${p.flag ? `<span class="pz-card-flag">${esc(p.flag)}</span>` : ''}
        </button>`).join('')}
      </div>
      <div class="pz-cat-head">Boissons · ${DRINKS.length}</div>
      <div class="pz-grid">${DRINKS.map((d) => `
        <button class="pz-card" data-pz-drink="${d.id}" style="--i:${i++}">
          <span class="pz-card-art">${ART[d.id] || ''}</span>
          <span class="pz-card-name">${esc(d.label)}</span>
          <span class="pz-card-sub">${esc(d.sub)}</span>
          <span class="pz-card-price">${d.price} MAD</span>
        </button>`).join('')}
      </div>`;
    $('#pz-gridwrap', root).onclick = (e) => {
      const pz = e.target.closest('[data-pz-pizza]');
      if (pz) { openSheet(pz.dataset.pzPizza); return; }
      const dr = e.target.closest('[data-pz-drink]');
      if (dr) addDrink(dr.dataset.pzDrink);
    };
  }
  function addDrink(did) {
    const t = state.ticket;
    const ex = t.lines.find((ln) => ln.kind === 'drink' && ln.did === did);
    if (ex) ex.qty++;
    else t.lines.push({ kind: 'drink', did, qty: 1 });
    toast(`${DRINK[did].label}, sur la commande`);
    renderTicket(); icons(); lens();
  }

  /* ═══════════════════════ TICKET ═══════════════════════ */
  function modeMetaRows(t) {
    const rows = [];
    if (t.mode === 'surplace') {
      rows.push(t.table
        ? `<button class="pz-tk-row is-set" id="pz-tk-table"><i data-lucide="utensils"></i>
            <span class="l"><b>Table ${esc(t.table)}</b><span>Service en salle, encaissement à table possible</span></span>
            <span class="edit">Changer</span></button>`
        : `<button class="pz-tk-row" id="pz-tk-table"><i data-lucide="utensils"></i>
            <span class="l"><b>Choisir la table</b><span>T1 à T8, ou le comptoir</span></span>
            <span class="edit">Choisir</span></button>`);
    }
    if (t.mode === 'emporter' || t.mode === 'livraison') {
      if (!t.customer) {
        rows.push(`<button class="pz-tk-row" id="pz-tk-client"><i data-lucide="user-plus"></i>
          <span class="l"><b>${t.mode === 'livraison' ? 'Attacher le client' : 'Client (optionnel)'}</b>
          <span>${t.mode === 'livraison' ? 'Téléphone + adresse, obligatoire en livraison' : 'Un prénom pour appeler la commande'}</span></span>
          <span class="edit">Chercher</span></button>`);
      } else {
        const c = t.customer.type === 'known' ? CUST[t.customer.id] : { name: t.customer.name || 'Client de passage', phone: '' };
        rows.push(`<button class="pz-tk-row is-set" id="pz-tk-client"><i data-lucide="user-check"></i>
          <span class="l"><b>${esc(c.name)}</b><span>${esc(c.phone || 'sans téléphone')}${c.orders ? ` · ${c.orders} commandes` : ''}${c.pref ? ` · ${esc(c.pref)}` : ''}</span></span>
          <span class="edit">Changer</span></button>`);
      }
    }
    if (t.mode === 'livraison') {
      rows.push(t.zone
        ? `<button class="pz-tk-row is-set" id="pz-tk-zone"><i data-lucide="map-pin"></i>
            <span class="l"><b>${esc(ZONE[t.zone].label)} · ${ZONE[t.zone].fee} MAD</b><span>${esc(t.address || ZONE[t.zone].eta)}</span></span>
            <span class="edit">Changer</span></button>`
        : `<button class="pz-tk-row" id="pz-tk-zone"><i data-lucide="map-pin"></i>
            <span class="l"><b>Choisir la zone</b><span>Centre 10 · Malabata 15 · Achakar 20 · California 15</span></span>
            <span class="edit">Choisir</span></button>`);
    }
    return rows.join('');
  }

  function lineSub(ln) {
    if (ln.kind === 'drink') return esc(DRINK[ln.did].sub);
    const bits = [`<span class="sz">${SIZE[ln.size].label}</span> ${SIZE[ln.size].cm}`, `pâte ${esc(ln.pate === 'epaisse' ? 'épaisse' : 'fine')}`];
    if (ln.supps && ln.supps.length) bits.push(ln.supps.map((s) => `+${esc(SUPP[s].label.toLowerCase())}`).join(' '));
    if (ln.note) bits.push(`« ${esc(ln.note)} »`);
    return bits.join(' · ');
  }

  function renderTicket() {
    const t = state.ticket;
    const sub = t.lines.reduce((s, ln) => s + linePrice(ln), 0);
    const fee = t.mode === 'livraison' && t.zone ? ZONE[t.zone].fee : 0;
    const total = sub + fee;
    const nPz = t.lines.reduce((s, ln) => s + (ln.kind === 'pizza' ? ln.qty : 0), 0);
    const el = $('#pz-ticket', root);
    el.innerHTML = `
      <div class="pz-tk-head">
        <div><span class="pz-tk-title">Commande</span> <span class="pz-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? '<button class="pz-tk-reset" id="pz-tk-reset">Vider</button>' : ''}
      </div>
      <div class="pz-tk-meta">
        <div class="pz-seg" data-lens-demo id="pz-mode-seg">
          <button class="pz-seg-it ${t.mode === 'surplace' ? 'on' : ''}" data-lens-item data-pz-mode="surplace">Sur place<small>salle</small></button>
          <button class="pz-seg-it ${t.mode === 'emporter' ? 'on' : ''}" data-lens-item data-pz-mode="emporter">Emporter<small>comptoir</small></button>
          <button class="pz-seg-it ${t.mode === 'livraison' ? 'on' : ''}" data-lens-item data-pz-mode="livraison">Livraison<small>scooter</small></button>
        </div>
        ${modeMetaRows(t)}
      </div>
      <div class="pz-tk-lines" id="pz-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => `
          <div class="pz-line">
            <span class="pz-line-art">${lineArt(ln)}</span>
            <span class="pz-line-mid">
              <span class="pz-line-name">${esc(lineName(ln))}</span>
              <span class="pz-line-sub">${lineSub(ln)}</span>
            </span>
            <span class="pz-line-right">
              <span class="pz-line-price">${fmtMAD(linePrice(ln))}</span>
              <span class="pz-line-qty">
                <button data-pz-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-pz-plus="${i}" aria-label="Ajouter">+</button>
              </span>
            </span>
          </div>`).join('') : `
          <div class="pz-tk-empty">
            <i data-lucide="pizza"></i>
            <div>La commande est vide.<br>Touchez une pizza dans la carte, le four l'attend.</div>
          </div>`}
      </div>
      <div class="pz-tk-foot">
        <div class="pz-tk-tot"><span>${nPz} pizza${nPz > 1 ? 's' : ''} · sous-total</span><span class="val">${fmtMAD(sub)}</span></div>
        ${fee ? `<div class="pz-tk-tot"><span>Livraison ${esc(ZONE[t.zone].label)}</span><span class="val">+${fmtMAD(fee)}</span></div>` : ''}
        <div class="pz-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="pz-validate" id="pz-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="flame"></i>Envoyer en cuisine · ${fmtMAD(total)}
        </button>
      </div>`;

    const reset = $('#pz-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); lens(); };
    $('#pz-mode-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-pz-mode]');
      if (!b || b.dataset.pzMode === t.mode) return;
      t.mode = b.dataset.pzMode;
      renderTicket(); icons(); lens();
    };
    const tableR = $('#pz-tk-table', el);
    if (tableR) tableR.onclick = openTable;
    const clientR = $('#pz-tk-client', el);
    if (clientR) clientR.onclick = openClient;
    const zoneR = $('#pz-tk-zone', el);
    if (zoneR) zoneR.onclick = openZone;
    $('#pz-validate', el).onclick = validateTicket;
    $('#pz-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-pz-minus]');
      const plus = e.target.closest('[data-pz-plus]');
      const idx = minus ? +minus.dataset.pzMinus : plus ? +plus.dataset.pzPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) ln.qty++;
      else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons(); lens();
    };
    icons();
    lens();
  }

  /* ═══════════════════════ CONFIG SHEET — taille, pâte, supps, moitié-moitié ═══════════════════════ */
  const sheet = { pid: null, size: 'm', pate: 'fine', supps: [], qty: 1, half: false, pidB: null, note: '' };

  function openSheet(pid) {
    const p = PIZZA[pid];
    Object.assign(sheet, {
      pid,
      size: p.prices.m != null ? 'm' : 's',
      pate: 'fine', supps: [], qty: 1, half: false, pidB: null, note: '',
    });
    renderSheet();
    openVeil('#pz-sheet-veil');
    icons();
    lens();
  }
  function sheetBase(sizeId) {
    const p = PIZZA[sheet.pid];
    const b = p.prices[sizeId];
    if (b == null) return null;
    if (sheet.half && sheet.pidB) {
      const b2 = PIZZA[sheet.pidB].prices[sizeId];
      if (b2 == null) return null;
      return Math.max(b, b2) + HALF_FEE;
    }
    return b;
  }
  function sheetUnit() {
    return (sheetBase(sheet.size) || 0) + sheet.supps.reduce((s, id) => s + SUPP[id].price, 0);
  }

  function renderSheet() {
    const p = PIZZA[sheet.pid];
    const sizes = SIZES.filter((s) => sheetBase(s.id) != null);
    if (!sizes.some((s) => s.id === sheet.size)) sheet.size = sizes[0].id;
    const unit = sheetUnit();
    const others = PIZZAS.filter((x) => !x.noHalf && x.id !== sheet.pid);
    const el = $('#pz-sheetm', root);
    el.innerHTML = `
      <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="pz-sheet-head">
        <span class="pz-sheet-art" id="pz-sheet-artbox">${sheet.half && sheet.pidB ? halfArt(sheet.pid, sheet.pidB) : (ART[p.id] || '')}</span>
        <span class="pz-sheet-title">
          <h3 id="pz-sheet-name">${sheet.half && sheet.pidB ? `½ ${esc(p.label)} · ½ ${esc(PIZZA[sheet.pidB].label)}` : esc(p.label)}</h3>
          <span class="sub">${esc(p.sub)}</span>
        </span>
        <span class="pz-sheet-price"><span class="val" id="pz-sheet-total">${fmtMAD(unit * sheet.qty)}</span><span class="per" id="pz-sheet-per">${unit} MAD × ${sheet.qty}</span></span>
      </div>

      <div class="pz-row-2">
        <div class="pz-f">
          <div class="pz-f-lbl">Taille</div>
          <div class="pz-seg" data-lens-demo id="pz-size-seg">
            ${sizes.map((s) => `<button class="pz-seg-it ${s.id === sheet.size ? 'on' : ''}" data-lens-item data-pz-size="${s.id}">${s.label} · ${s.cm}<small>${sheetBase(s.id)} MAD</small></button>`).join('')}
          </div>
        </div>
        <div class="pz-f" style="flex:0 0 168px;">
          <div class="pz-f-lbl">Pâte</div>
          <div class="pz-seg" data-lens-demo id="pz-pate-seg">
            ${PATES.map((pa) => `<button class="pz-seg-it ${pa.id === sheet.pate ? 'on' : ''}" data-lens-item data-pz-pate="${pa.id}">${esc(pa.label)}<small>${pa.id === 'fine' ? 'croustillante' : 'moelleuse'}</small></button>`).join('')}
          </div>
        </div>
      </div>

      <div class="pz-f">
        <div class="pz-f-lbl">Suppléments <span class="opt">· sur toute la pizza</span></div>
        <div class="pz-chips" id="pz-supps">
          ${SUPPS.map((s) => `<button class="pz-chip ${sheet.supps.includes(s.id) ? 'on' : ''}" data-pz-supp="${s.id}" aria-pressed="${sheet.supps.includes(s.id)}">+ ${esc(s.label)}<small>${s.price} MAD</small></button>`).join('')}
        </div>
      </div>

      ${p.noHalf ? `
      <div class="pz-f">
        <div class="pz-f-lbl">Moitié-moitié</div>
        <div class="pz-foot-note" style="text-align:left;margin-top:0;">La calzone est pliée et scellée au four, pas de moitié-moitié sur celle-ci.</div>
      </div>` : `
      <div class="pz-f">
        <div class="pz-f-lbl">Moitié-moitié <span class="opt">· deux pizzas, un seul plateau</span></div>
        <button class="pz-half-toggle ${sheet.half ? 'on' : ''}" id="pz-half-toggle" aria-pressed="${sheet.half}">
          <i data-lucide="pizza"></i>
          <span class="l">Couper en deux goûts<span>prix = la plus chère + ${HALF_FEE} MAD</span></span>
          <span class="tick"><i data-lucide="check"></i></span>
        </button>
        ${sheet.half ? `
        <div class="pz-half-body">
          <div class="pz-half-preview">
            ${halfArt(sheet.pid, sheet.pidB || others[0].id)}
            <div class="pz-half-names">${esc(p.label)}<br>· ${esc(PIZZA[sheet.pidB || others[0].id].label)}</div>
          </div>
          <div class="pz-half-pick">
            <div class="pz-half-pick-lbl">L'autre moitié :</div>
            <div class="pz-half-grid">
              ${others.map((x) => `<button class="pz-half-it ${sheet.pidB === x.id ? 'on' : ''}" data-pz-halfb="${x.id}">${ART[x.id] || ''}<span>${esc(x.label)}</span></button>`).join('')}
            </div>
          </div>
        </div>` : ''}
      </div>`}

      <div class="pz-row-2">
        <div class="pz-f">
          <div class="pz-f-lbl">Quantité</div>
          <div class="pz-stepper">
            <button id="pz-qty-minus" aria-label="Moins">−</button>
            <b id="pz-qty-val">${sheet.qty}</b>
            <button id="pz-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="pz-f" style="flex:1.6;">
          <div class="pz-f-lbl">Note cuisine <span class="opt">· optionnel</span></div>
          <input class="pz-note-free" id="pz-note-free" style="margin-top:0;" placeholder="Ex. « bien cuite », « sans oignons »…" value="${esc(sheet.note)}" />
        </div>
      </div>

      <div class="pz-sheet-foot">
        <button class="pz-btn secondary" data-pz-close>Annuler</button>
        <button class="pz-btn primary" id="pz-sheet-add"><i data-lucide="plus"></i>Ajouter · <span id="pz-sheet-cta">${fmtMAD(unit * sheet.qty)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#pz-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#pz-sheet-cta', el).textContent = fmtMAD(u * sheet.qty);
      $('#pz-sheet-per', el).textContent = `${u} MAD × ${sheet.qty}`;
      $('#pz-qty-val', el).textContent = sheet.qty;
    };

    $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-sheet-veil'); });
    $('#pz-size-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-pz-size]');
      if (!b) return;
      sheet.size = b.dataset.pzSize;
      $$('[data-pz-size]', el).forEach((x) => x.classList.toggle('on', x.dataset.pzSize === sheet.size));
      refreshPrice();
    };
    $('#pz-pate-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-pz-pate]');
      if (!b) return;
      sheet.pate = b.dataset.pzPate;
      $$('[data-pz-pate]', el).forEach((x) => x.classList.toggle('on', x.dataset.pzPate === sheet.pate));
    };
    $('#pz-supps', el).onclick = (e) => {
      const b = e.target.closest('[data-pz-supp]');
      if (!b) return;
      const id = b.dataset.pzSupp;
      const i = sheet.supps.indexOf(id);
      if (i >= 0) sheet.supps.splice(i, 1); else sheet.supps.push(id);
      b.classList.toggle('on', i < 0);
      b.setAttribute('aria-pressed', i < 0);
      refreshPrice();
    };
    const halfT = $('#pz-half-toggle', el);
    if (halfT) halfT.onclick = () => {
      sheet.half = !sheet.half;
      if (sheet.half && !sheet.pidB) sheet.pidB = (PIZZAS.find((x) => !x.noHalf && x.id !== sheet.pid) || {}).id || null;
      /* la taille doit exister des deux côtés */
      if (sheet.half && sheetBase(sheet.size) == null) sheet.size = 'm';
      renderSheet(); icons(); lens();
    };
    $$('[data-pz-halfb]', el).forEach((b) => {
      b.onclick = () => {
        sheet.pidB = b.dataset.pzHalfb;
        renderSheet(); icons(); lens();
      };
    });
    $('#pz-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    $('#pz-qty-plus', el).onclick = () => { sheet.qty++; refreshPrice(); };
    $('#pz-note-free', el).oninput = (e) => { sheet.note = e.target.value; };
    $('#pz-sheet-add', el).onclick = () => {
      state.ticket.lines.push({
        kind: 'pizza', pid: sheet.pid,
        pidB: sheet.half && sheet.pidB ? sheet.pidB : null,
        size: sheet.size, pate: sheet.pate,
        supps: sheet.supps.slice(), qty: sheet.qty, note: sheet.note.trim(),
      });
      closeVeil('#pz-sheet-veil');
      const nm = sheet.half && sheet.pidB ? `½ ${PIZZA[sheet.pid].label} · ½ ${PIZZA[sheet.pidB].label}` : PIZZA[sheet.pid].label;
      toast(`${nm} ${SIZE[sheet.size].label} × ${sheet.qty}, sur la commande`);
      renderTicket(); icons(); lens();
    };
  }

  /* ═══════════════════════ TABLE (sur place) ═══════════════════════ */
  function openTable() {
    const el = $('#pz-tablem', root);
    const t = state.ticket;
    const tables = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'Comptoir'];
    const taken = {};
    ORDERS.forEach((o) => { if (o.mode === 'surplace' && !isClosed(o) && o.table) taken[o.table] = o.id; });
    el.innerHTML = `
      <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Quelle table ?</h3>
      <p class="modal-subtle">Une table occupée peut recevoir une deuxième tournée.</p>
      <div class="pz-tables">
        ${tables.map((tb) => `<button class="pz-table-chip ${t.table === tb ? 'on' : ''}" data-pz-tb="${tb}">${tb}<span>${taken[tb] ? `occupée · ${taken[tb]}` : 'libre'}</span></button>`).join('')}
      </div>`;
    openVeil('#pz-table-veil');
    icons();
    $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-table-veil'); });
    $$('[data-pz-tb]', el).forEach((b) => {
      b.onclick = () => {
        t.table = b.dataset.pzTb;
        closeVeil('#pz-table-veil');
        toast(`Commande ${t.num}, ${t.table === 'Comptoir' ? 'au comptoir' : 'table ' + t.table}`);
        renderTicket(); icons(); lens();
      };
    });
  }

  /* ═══════════════════════ CLIENT — phone-first ═══════════════════════ */
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  function openClient() {
    const el = $('#pz-clientm', root);
    const t = state.ticket;
    const forLiv = t.mode === 'livraison';
    let mode = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">${forLiv ? 'La livraison part avec un téléphone et une adresse, cherchez par numéro.' : 'Un prénom suffit pour appeler la commande au comptoir.'}</p>
        <div class="pz-phone-in"><i data-lucide="phone"></i>
          <input id="pz-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="pz-cl-results">
            ${hits.map((c) => `
              <button class="pz-cl-row" data-pz-cl="${c.id}">
                <span class="pz-cl-ava">${esc(initials(c.name))}</span>
                <span class="pz-cl-mid">
                  <span class="pz-cl-name">${esc(c.name)}</span>
                  <span class="pz-cl-sub"><span class="tel">${esc(c.phone)}</span>${forLiv ? ` · ${esc(c.address)}` : ''}</span>
                </span>
                <span class="pz-cl-right"><b>${c.orders} cmd</b>${c.zone ? esc(ZONE[c.zone].label) : ''}</span>
              </button>`).join('') || `<div class="pz-bempty">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          <button class="pz-cl-new" id="pz-cl-new"><i data-lucide="user-plus"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          ${forLiv ? '' : `<div class="pz-sheet-foot" style="margin-top:10px;"><button class="pz-btn ghost" id="pz-cl-guest">Client de passage, sans fiche</button></div>`}` : `
          <div class="pz-cl-form">
            <input class="pz-in" id="pz-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="pz-in" id="pz-cl-tel" inputmode="tel" placeholder="Téléphone${forLiv ? '' : ' (optionnel)'}" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            ${forLiv ? '<input class="pz-in" id="pz-cl-addr" placeholder="Adresse de livraison" />' : ''}
            <div class="pz-sheet-foot" style="margin-top:4px;">
              <button class="pz-btn secondary" id="pz-cl-back">Retour</button>
              <button class="pz-btn primary" id="pz-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#pz-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#pz-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-client-veil'); });
      $$('[data-pz-cl]', el).forEach((b) => {
        b.onclick = () => {
          const c = CUST[b.dataset.pzCl];
          t.customer = { type: 'known', id: c.id };
          if (forLiv) {
            if (!t.zone && c.zone) t.zone = c.zone;
            if (c.address) t.address = c.address;
          }
          closeVeil('#pz-client-veil');
          toast(`${c.name}, ${c.orders} commandes${forLiv && c.zone ? ` · zone ${ZONE[c.zone].label} pré-remplie` : ''}`);
          renderTicket(); icons(); lens();
        };
      });
      const newBtn = $('#pz-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#pz-cl-guest', el);
      if (guest) guest.onclick = () => {
        t.customer = { type: 'guest', name: '' };
        closeVeil('#pz-client-veil');
        renderTicket(); icons(); lens();
      };
      const back = $('#pz-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#pz-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#pz-cl-name', el).value.trim();
        const tel = $('#pz-cl-tel', el).value.trim();
        const addrIn = $('#pz-cl-addr', el);
        const addr = addrIn ? addrIn.value.trim() : '';
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        if (forLiv && !tel) { toast('Un téléphone est requis pour livrer'); return; }
        const id = 'kx' + Date.now().toString(36);
        const c = { id, name, phone: tel, address: addr, zone: null, orders: 0 };
        CUSTOMERS.unshift(c); CUST[id] = c;
        t.customer = { type: 'known', id };
        if (forLiv && addr) t.address = addr;
        closeVeil('#pz-client-veil');
        toast(`Fiche créée, ${name}`);
        renderTicket(); icons(); lens();
      };
    };
    render('');
    openVeil('#pz-client-veil');
    icons();
    setTimeout(() => { const i = $('#pz-cl-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ ZONE (livraison) ═══════════════════════ */
  function openZone() {
    const el = $('#pz-zonem', root);
    const t = state.ticket;
    let picked = t.zone;
    const render = () => {
      el.innerHTML = `
        <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Zone de livraison</h3>
        <p class="modal-subtle">Les frais s'ajoutent au total et reviennent au livreur.</p>
        <div class="pz-zones">
          ${ZONES.map((z) => `<button class="pz-zone-chip ${picked === z.id ? 'on' : ''}" data-pz-zn="${z.id}">
            <b><i data-lucide="map-pin"></i>${esc(z.label)}</b><span>${z.fee} MAD · ${esc(z.eta)}</span>
          </button>`).join('')}
        </div>
        <div class="pz-f" style="margin-bottom:0;">
          <div class="pz-f-lbl">Adresse</div>
          <input class="pz-in" id="pz-zone-addr" placeholder="Immeuble, rue, repère…" value="${esc(t.address)}" />
        </div>
        <div class="pz-sheet-foot">
          <button class="pz-btn secondary" data-pz-close>Annuler</button>
          <button class="pz-btn primary" id="pz-zone-ok"><i data-lucide="check"></i>Valider la zone</button>
        </div>`;
      icons();
      $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-zone-veil'); });
      $$('[data-pz-zn]', el).forEach((b) => {
        b.onclick = () => {
          picked = b.dataset.pzZn;
          $$('[data-pz-zn]', el).forEach((x) => x.classList.toggle('on', x.dataset.pzZn === picked));
        };
      });
      $('#pz-zone-ok', el).onclick = () => {
        if (!picked) { toast('Choisissez une zone, les frais en dépendent'); return; }
        t.zone = picked;
        t.address = $('#pz-zone-addr', el).value.trim();
        closeVeil('#pz-zone-veil');
        toast(`${ZONE[picked].label}, ${ZONE[picked].fee} MAD de frais, ${ZONE[picked].eta}`);
        renderTicket(); icons(); lens();
      };
    };
    render();
    openVeil('#pz-zone-veil');
  }

  /* ═══════════════════════ VALIDATE → ENCAISSEMENT ═══════════════════════ */
  function validateTicket() {
    const t = state.ticket;
    if (!t.lines.length) return;
    if (t.mode === 'surplace' && !t.table) { toast("Choisissez la table d'abord"); openTable(); return; }
    if (t.mode === 'livraison' && !t.customer) { toast('Attachez le client, une livraison part avec un téléphone'); openClient(); return; }
    if (t.mode === 'livraison' && !t.zone) { toast('Choisissez la zone, les frais en dépendent'); openZone(); return; }
    const draft = {
      id: t.num, mode: t.mode,
      table: t.mode === 'surplace' ? t.table : null,
      custId: t.customer && t.customer.type === 'known' ? t.customer.id : null,
      guest: t.customer && t.customer.type === 'guest' ? (t.customer.name || null) : null,
      zone: t.mode === 'livraison' ? t.zone : null,
      address: t.mode === 'livraison' ? t.address : '',
      lines: t.lines.map((ln) => Object.assign({}, ln, { supps: ln.supps ? ln.supps.slice() : undefined })),
      createdAt: Date.now(),
      pay: { method: null, paid: 0, deferred: null },
      delivery: { courier: null, departedAt: null, deliveredAt: null },
      served: false, remis: false,
    };
    draft.jobs = buildJobs(draft);
    openPay(draft, { fresh: true });
  }

  function commitOrder(o) {
    o.jobs.forEach((j) => { JOB[j.jid] = j; });
    ORDERS.unshift(o);
    seq++;
    freshTicket();
    renderTicket();
    renderBadges();
    renderStats();
    queueIfOffline(`Commande ${o.id}`);
    const n = o.jobs.length;
    toast(n
      ? `${o.id} en cuisine, ${n} pizza${n > 1 ? 's' : ''} en file, le four attend`
      : `${o.id} enregistrée, boissons prêtes au comptoir`);
    icons();
  }

  /* Encaissement — kit caisse : espèces (rendu calculé) / carte (lecteur
     partenaire) / différé selon le mode, dont « payé à la livraison ». */
  function openPay(order, ctx) {
    const el = $('#pz-paym', root);
    const { total } = orderTotal(order);
    const cust = custOf(order);
    const fresh = ctx && ctx.fresh;
    const settle = ctx && ctx.settle;
    const amount = settle ? orderDue(order) : total;
    const deferSpec = {
      surplace: { icon: 'utensils', b: 'Payer à table', s: 'Encaissement après le repas, le classique du soir', usual: true, msg: (o) => `Solde ${fmtMAD(orderTotal(o).total)} à encaisser à table` },
      emporter: { icon: 'shopping-bag', b: 'Payer au retrait', s: 'Le client règle en récupérant sa commande', usual: false, msg: (o) => `Solde ${fmtMAD(orderTotal(o).total)} au retrait` },
      livraison: { icon: 'bike', b: 'Payé à la livraison', s: 'Le livreur encaisse à la porte, flous remis au retour', usual: true, msg: (o) => `Le livreur encaissera ${fmtMAD(orderTotal(o).total)} à la porte` },
    }[order.mode];

    const subtle = `${order.id} · ${destLabel(order)} · ${esc(cust.name)}${ctx && ctx.note ? `, ${esc(ctx.note)}` : ''}`;

    const step1 = () => {
      el.innerHTML = `
        <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${settle ? 'Encaisser le solde' : 'Encaissement'}</h3>
        <p class="modal-subtle">${subtle}</p>
        <div class="modal-amount size-md">${fmtMAD(amount)}</div>
        <div class="pz-pay-opts">
          <button class="pz-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé, flous au tiroir</span></span>
            <span class="amt">${fmtMAD(amount)}</span>
          </button>
          <button class="pz-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Lecteur partenaire, V1 sans encaissement Kiwi</span></span>
            <span class="amt">${fmtMAD(amount)}</span>
          </button>
          ${fresh && deferSpec ? `
          <button class="pz-pay-opt ${deferSpec.usual ? 'is-usual' : ''}" data-defer>
            <span class="ic"><i data-lucide="${deferSpec.icon}"></i></span>
            <span class="l"><b>${deferSpec.b}</b><span>${deferSpec.s}</span></span>
          </button>` : ''}
        </div>`;
      icons();
      $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-pay-veil'); });
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.m === 'especes' ? stepCash() : stepCard());
      });
      const defer = $('[data-defer]', el);
      if (defer) defer.onclick = () => {
        order.pay = { method: null, paid: 0, deferred: order.mode === 'surplace' ? 'table' : order.mode === 'emporter' ? 'retrait' : 'livraison' };
        closeVeil('#pz-pay-veil');
        commitOrder(order);
        toast(deferSpec.msg(order));
      };
    };

    const stepCash = () => {
      let received = amount;
      el.innerHTML = `
        <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${subtle}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="pz-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="pz-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="pz-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="pz-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#pz-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#pz-cash-ok', el).disabled = received < amount;
      };
      $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-pay-veil'); });
      $('#pz-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#pz-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#pz-cash-ok', el).onclick = () => done('especes', Math.max(0, received - amount));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="pz-modal-x" data-pz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="pz-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="pz-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-pz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#pz-pay-veil'); });
      setTimeout(() => {
        const disc = $('#pz-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#pz-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0), 900);
        });
      }, 1900);
    };

    const done = (method, rendu) => {
      if (settle) {
        order.pay.paid += amount;
        order.pay.method = method;
        order.pay.deferred = null;
        /* Le solde d'un « payer à table / au retrait / à la livraison » rentre
           ICI. remitOrder et deliverOrder passent tous les deux par openPay
           en mode settle, donc cette ligne les couvre tous les deux. */
        postDay(amount, method, `Solde ${order.id} · ${destLabel(order)}`, order.id);
        closeVeil('#pz-pay-veil');
        toast(`Solde encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        renderStats();
        if (ctx && typeof ctx.onSettled === 'function') ctx.onSettled();
        else refreshOps();
        return;
      }
      order.pay = { method, paid: amount, deferred: null };
      /* Le différé (data-defer) sort par commitOrder sans passer ici : il ne
         prend rien au comptoir, ce n'est pas une recette tant que le solde
         n'est pas encaissé. */
      postDay(amount, method, `${order.id} · ${destLabel(order)}`, order.id);
      closeVeil('#pz-pay-veil');
      commitOrder(order);
      toast(`Encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    };

    step1();
    openVeil('#pz-pay-veil');
  }

  /* ═══════════════════════ FOUR — 4 places, 12 min, file ═══════════════════════ */
  const RING_C = 207.3;          /* 2π × 33, le rayon de l'anneau */

  function slotHTML(i) {
    const jid = oven[i];
    if (!jid) {
      return `<div class="pz-slot is-empty"><span class="pz-slot-pos">Place ${i + 1}</span>
        <div class="pz-slot-hole"><i data-lucide="flame"></i></div>
        <div class="pz-slot-free">libre</div>
      </div>`;
    }
    const j = JOB[jid];
    const rem = j.endAt - Date.now();
    const isDone = rem <= 0;
    const off = isDone ? 0 : (RING_C * Math.max(0, Math.min(1, rem / BAKE_MS))).toFixed(1);
    return `<div class="pz-slot ${isDone ? 'is-done' : ''}" data-pz-jid="${j.jid}">
      <span class="pz-slot-pos">Place ${i + 1}</span>
      <div class="pz-slot-stage">
        <svg class="pz-ring" viewBox="0 0 84 84" aria-hidden="true">
          <circle class="rbg" cx="42" cy="42" r="33"/>
          <circle class="rfg" cx="42" cy="42" r="33" transform="rotate(-90 42 42)" style="stroke-dasharray:${RING_C};stroke-dashoffset:${off}"/>
        </svg>
        <span class="pz-slot-art">${jobArt(j)}</span>
      </div>
      <b class="pz-slot-time" data-pz-time>${isDone ? 'Dorée, sortez-la' : fmtMS(rem)}</b>
      <div class="pz-slot-meta"><b>${j.orderId}</b> · ${esc(j.label)} · ${j.size.toUpperCase()}</div>
      ${isDone ? `<button class="pz-sortir" data-pz-sortir="${j.jid}"><i data-lucide="check"></i>Sortir du four</button>` : ''}
    </div>`;
  }

  function jobStatusHTML(j) {
    if (j.status === 'file') return '<span class="st file">en file</span>';
    if (j.status === 'four') return j.endAt - Date.now() <= 0
      ? '<span class="st four">à sortir</span>'
      : `<span class="st four">four · ${fmtMS(j.endAt - Date.now())}</span>`;
    return '<span class="st prete">prête</span>';
  }

  function laneCard(o) {
    const cust = custOf(o);
    const ready = kitchenDone(o);
    const due = orderDue(o);
    const drinks = o.lines.filter((ln) => ln.kind === 'drink');
    const actions = [];
    if (ready && o.mode === 'surplace' && !o.served) {
      actions.push(`<button class="pz-btn primary" data-pz-serve="${o.id}"><i data-lucide="utensils"></i>Servir ${esc(o.table)}</button>`);
    }
    if (ready && o.mode === 'emporter' && !o.remis) {
      actions.push(due > 0
        ? `<button class="pz-btn primary" data-pz-remit="${o.id}"><i data-lucide="banknote"></i>Encaisser &amp; remettre · ${fmtMAD(due)}</button>`
        : `<button class="pz-btn primary" data-pz-remit="${o.id}"><i data-lucide="check"></i>Remettre à ${esc(cust.name)}</button>`);
    }
    if (ready && o.mode === 'livraison' && !o.delivery.courier) {
      actions.push(`<button class="pz-btn primary" data-pz-goliv><i data-lucide="bike"></i>Assigner un livreur</button>`);
    }
    if (o.mode === 'surplace' && due > 0 && (o.served || ready)) {
      actions.push(`<button class="pz-btn secondary" data-pz-settle="${o.id}"><i data-lucide="banknote"></i>Encaisser · ${fmtMAD(due)}</button>`);
    }
    return `<div class="pz-ocard">
      <div class="pz-ocard-top"><span class="pz-ocard-num">${o.id}</span><span class="pz-ocard-when">${esc(fmtSince(o.createdAt))}</span></div>
      <div class="pz-ocard-meta">
        <span class="pz-pill mode">${esc(destLabel(o))}</span>
        <span class="pz-pill ${ready ? 'ok' : 'warn'}">${ready ? 'Prête' : 'En cuisine'}</span>
        ${due > 0 ? `<span class="pz-pill due">${o.pay.deferred === 'livraison' ? 'à la livraison' : 'à encaisser'} · ${due} MAD</span>` : '<span class="pz-pill ok">Payée</span>'}
      </div>
      <div class="pz-ocard-items">
        ${o.jobs.map((j) => `<div class="pz-oitem"><span class="art">${jobArt(j)}</span><span class="nm">${esc(j.label)} · ${j.size.toUpperCase()}</span>${jobStatusHTML(j)}</div>`).join('')}
        ${drinks.map((ln) => `<div class="pz-oitem"><span class="art">${ART[ln.did] || ''}</span><span class="nm">${ln.qty} × ${esc(DRINK[ln.did].label)}</span><span class="st prete">prête</span></div>`).join('')}
      </div>
      <div class="pz-ocard-meta" style="margin-top:7px;">
        <span class="pz-pill"><i data-lucide="user"></i>${esc(cust.name)}</span>
      </div>
      ${actions.length ? `<div class="pz-ocard-actions">${actions.join('')}</div>` : ''}
    </div>`;
  }

  function renderFour() {
    const panel = $('[data-pz-panel="four"]', root);
    const queue = ORDERS.slice().reverse().flatMap((o) => o.jobs.filter((j) => j.status === 'file'));
    const lane = ORDERS.filter((o) => !isClosed(o) && !(o.mode === 'livraison' && (o.delivery.courier || o.delivery.deliveredAt)))
      .slice().reverse();
    const freeSlots = oven.filter((s) => s === null).length;
    panel.innerHTML = `
      <div class="pz-four">
        <header class="pz-head">
          <div><h1>Le four</h1><div class="pz-head-sub">Capacité <b>${OVEN_CAP} pizzas</b> · cuisson <b>12 min</b>, sortez-les dès que c'est doré</div></div>
          <div class="pz-head-hint">${freeSlots ? `${freeSlots} place${freeSlots > 1 ? 's' : ''} libre${freeSlots > 1 ? 's' : ''}` : 'Four complet'} · ${queue.length} en file</div>
        </header>
        <div class="pz-four-scroll">
          <div class="pz-slots">${[0, 1, 2, 3].map(slotHTML).join('')}</div>
          <div class="pz-cat-head">File d'attente · ${queue.length}</div>
          <div class="pz-queue">
            ${queue.map((j) => `
              <div class="pz-qcard">
                <span class="pz-qcard-art">${jobArt(j)}</span>
                <span class="pz-qcard-mid"><span class="pz-qcard-name">${esc(j.label)}</span><span class="pz-qcard-sub">${j.orderId} · ${j.size.toUpperCase()}</span></span>
                <button class="pz-enfourner" data-pz-enfourner="${j.jid}" ${freeSlots ? '' : 'disabled'}><i data-lucide="flame"></i>Enfourner</button>
              </div>`).join('') || '<div class="pz-bempty">File vide, tout est au four ou déjà prêt.</div>'}
          </div>
          <div class="pz-cat-head">Commandes en cours · ${lane.length}</div>
          <div class="pz-lane">
            ${lane.map(laneCard).join('') || '<div class="pz-bempty">Rien en cours, la salle respire, profitez-en pour garnir.</div>'}
          </div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const enf = e.target.closest('[data-pz-enfourner]');
      if (enf) { enfourner(enf.dataset.pzEnfourner); return; }
      const out = e.target.closest('[data-pz-sortir]');
      if (out) { sortirJob(out.dataset.pzSortir); return; }
      const srv = e.target.closest('[data-pz-serve]');
      if (srv) { serveOrder(srv.dataset.pzServe); return; }
      const rem = e.target.closest('[data-pz-remit]');
      if (rem) { remitOrder(rem.dataset.pzRemit); return; }
      const set = e.target.closest('[data-pz-settle]');
      if (set) { openPay(findOrder(set.dataset.pzSettle), { settle: true }); return; }
      const gl = e.target.closest('[data-pz-goliv]');
      if (gl) switchView('livraison');
    };
    icons();
  }

  function enfourner(jid) {
    const j = JOB[jid];
    if (!j || j.status !== 'file') return;
    const i = oven.indexOf(null);
    if (i < 0) { toast("Four complet, 4 pizzas max, sortez-en une d'abord"); return; }
    j.status = 'four'; j.slot = i; j.alerted = false;
    j.startAt = Date.now(); j.endAt = Date.now() + BAKE_MS;
    oven[i] = jid;
    queueIfOffline('Enfournement');
    toast(`${j.label} (${j.orderId}) au four, place ${i + 1} · 12:00`);
    renderFour(); renderBadges(); icons();
  }

  function sortirJob(jid) {
    const j = JOB[jid];
    if (!j || j.status !== 'four') return;
    if (j.endAt - Date.now() > 0) { toast(`Encore ${fmtMS(j.endAt - Date.now())}, elle n'est pas dorée`); return; }
    if (j.slot != null) oven[j.slot] = null;
    j.status = 'prete'; j.slot = null;
    const o = findOrder(j.orderId);
    queueIfOffline('Sortie du four');
    if (o && kitchenDone(o)) {
      if (o.mode === 'livraison') toast(`${o.id} complète, assignez un livreur`);
      else if (o.mode === 'surplace') toast(`${o.id} complète, servez la table ${o.table}`);
      else toast(`${o.id} complète, ${custOf(o).name} peut passer au comptoir`);
    } else {
      toast(`${j.label} sortie du four, sahha`);
    }
    renderFour(); renderBadges(); icons();
  }

  function serveOrder(id) {
    const o = findOrder(id);
    if (!o) return;
    o.served = true;
    queueIfOffline('Service en salle');
    toast(`Table ${o.table} servie${orderDue(o) > 0 ? `, solde ${fmtMAD(orderDue(o))} à table` : ''}`);
    refreshOps();
  }
  function remitOrder(id) {
    const o = findOrder(id);
    if (!o) return;
    const finish = () => {
      o.remis = true;
      queueIfOffline('Remise au comptoir');
      toast(`${o.id} remise à ${custOf(o).name}, merci, à la prochaine`);
      refreshOps();
    };
    if (orderDue(o) > 0) openPay(o, { settle: true, onSettled: finish });
    else finish();
  }

  /* ═══════════════════════ LIVRAISON — zones, livreurs, retours ═══════════════════════ */
  function payFlag(o) {
    const due = orderDue(o);
    if (due <= 0) return '<span class="pz-pill ok">Payée</span>';
    if (o.pay.deferred === 'livraison') return `<span class="pz-pill due">le livreur encaisse · ${due} MAD</span>`;
    return `<span class="pz-pill due">à encaisser · ${due} MAD</span>`;
  }
  function itemsPill(o) {
    const n = o.jobs.length;
    const d = o.lines.filter((ln) => ln.kind === 'drink').reduce((s, ln) => s + ln.qty, 0);
    return `<span class="pz-pill"><i data-lucide="pizza"></i>${n} pizza${n > 1 ? 's' : ''}${d ? ` + ${d} boisson${d > 1 ? 's' : ''}` : ''}</span>`;
  }

  function renderLivraison() {
    const panel = $('[data-pz-panel="livraison"]', root);
    const ready = ORDERS.filter((o) => o.mode === 'livraison' && kitchenDone(o) && !o.delivery.courier && !o.delivery.deliveredAt);
    const out = ORDERS.filter((o) => o.mode === 'livraison' && o.delivery.courier && !o.delivery.deliveredAt);
    const delivered = ORDERS.filter((o) => o.mode === 'livraison' && o.delivery.deliveredAt)
      .sort((a, b) => b.delivery.deliveredAt - a.delivery.deliveredAt);
    const cooking = ORDERS.filter((o) => o.mode === 'livraison' && !kitchenDone(o) && !o.delivery.deliveredAt).length;
    const bothBusy = COURIERS.every((c) => courierOrder(c.id));

    panel.innerHTML = `
      <div class="pz-liv">
        <header class="pz-head">
          <div><h1>Livraison</h1><div class="pz-head-sub">Zones Tanger, ${ZONES.map((z) => `${esc(z.label)} <b>${z.fee}</b>`).join(' · ')} MAD</div></div>
          <div class="pz-head-hint">${cooking ? `${cooking} commande${cooking > 1 ? 's' : ''} livraison encore au four` : 'Tout ce qui doit partir est prêt'}</div>
        </header>
        <div class="pz-couriers">
          ${COURIERS.map((c) => {
            const cur = courierOrder(c.id);
            return `<div class="pz-courier ${cur ? 'is-course' : 'is-libre'}">
              <span class="ava"><i data-lucide="bike"></i></span>
              <span class="l"><b>${esc(c.name)}</b><span>${cur ? `en course, ${cur.id} · ${esc(ZONE[cur.zone].label)}` : `libre · ${esc(c.sub)}`}</span></span>
            </div>`;
          }).join('')}
        </div>
        <div class="pz-liv-cols">
          <div class="pz-bcol">
            <div class="pz-bcol-head"><i style="background:var(--emerald)"></i>Prêtes à partir <span class="ct">${ready.length}</span></div>
            ${ready.map((o) => {
              const cust = custOf(o);
              return `<div class="pz-dcard">
                <div class="pz-dcard-top"><span class="pz-ocard-num">${o.id}</span><span class="pz-ocard-when">commandée ${esc(fmtSince(o.createdAt))}</span></div>
                <div class="pz-dcard-who"><i data-lucide="user"></i>${esc(cust.name)}${cust.phone ? ` · <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3);">${esc(cust.phone)}</span>` : ''}</div>
                <div class="pz-dcard-addr">${esc(o.address || ZONE[o.zone].label)}</div>
                <div class="pz-dcard-meta">
                  <span class="pz-pill mode">${esc(ZONE[o.zone].label)} · ${ZONE[o.zone].fee} MAD</span>
                  ${itemsPill(o)}
                  ${payFlag(o)}
                </div>
                <div class="pz-assign">
                  ${COURIERS.map((c) => `<button class="pz-assign-btn" data-pz-assign="${o.id}:${c.id}" ${courierOrder(c.id) ? 'disabled' : ''}><i data-lucide="bike"></i>${esc(c.name)}</button>`).join('')}
                </div>
                ${bothBusy ? '<div class="pz-foot-note">Les deux livreurs sont en course, ça revient vite.</div>' : ''}
              </div>`;
            }).join('') || '<div class="pz-bempty">Rien à expédier, le four travaille.</div>'}
          </div>
          <div class="pz-bcol">
            <div class="pz-bcol-head"><i style="background:var(--pz-warn-dot)"></i>En course <span class="ct">${out.length}</span></div>
            ${out.map((o) => {
              const cust = custOf(o);
              const due = orderDue(o);
              return `<div class="pz-dcard">
                <div class="pz-dcard-top"><span class="pz-ocard-num">${o.id}</span>
                  <span class="pz-ocard-when" data-pz-since data-ts="${o.delivery.departedAt}">parti ${esc(fmtSince(o.delivery.departedAt))}</span></div>
                <div class="pz-dcard-who"><i data-lucide="bike"></i>${esc(COURIER[o.delivery.courier].name)} → ${esc(cust.name)}</div>
                <div class="pz-dcard-addr">${esc(o.address || ZONE[o.zone].label)} · ${esc(ZONE[o.zone].eta)}</div>
                <div class="pz-dcard-meta">
                  <span class="pz-pill mode">${esc(ZONE[o.zone].label)} · ${ZONE[o.zone].fee} MAD</span>
                  ${itemsPill(o)}
                  ${payFlag(o)}
                </div>
                <div class="pz-dcard-actions">
                  <button class="pz-btn primary" data-pz-deliver="${o.id}"><i data-lucide="check"></i>${due > 0 ? `Livrée · encaisser ${fmtMAD(due)}` : 'Livrée'}</button>
                </div>
              </div>`;
            }).join('') || '<div class="pz-bempty">Aucun scooter dehors.</div>'}
          </div>
          <div class="pz-bcol">
            <div class="pz-bcol-head"><i style="background:var(--ink-4)"></i>Livrées ce soir <span class="ct">${delivered.length}</span></div>
            ${delivered.map((o) => {
              const cust = custOf(o);
              return `<div class="pz-dcard is-done">
                <div class="pz-dcard-top"><span class="pz-ocard-num">${o.id}</span><span class="pz-ocard-when">${fmtClock(o.delivery.deliveredAt)}</span></div>
                <div class="pz-dcard-who"><i data-lucide="check-circle-2"></i>${esc(cust.name)} · ${esc(ZONE[o.zone].label)}</div>
                <div class="pz-dcard-meta">
                  <span class="pz-pill">par ${esc(o.delivery.courier ? COURIER[o.delivery.courier].name : 'livreur')}</span>
                  <span class="pz-pill ok">${orderDue(o) > 0 ? 'solde ouvert' : `payée · ${o.pay.method === 'carte' ? 'carte' : 'espèces'}`}</span>
                </div>
              </div>`;
            }).join('') || '<div class="pz-bempty">Première course du soir à venir.</div>'}
          </div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const as = e.target.closest('[data-pz-assign]');
      if (as) {
        const parts = as.dataset.pzAssign.split(':');
        assignCourier(parts[0], parts[1]);
        return;
      }
      const dl = e.target.closest('[data-pz-deliver]');
      if (dl) deliverOrder(dl.dataset.pzDeliver);
    };
    icons();
  }

  function assignCourier(orderId, cid) {
    const o = findOrder(orderId);
    if (!o) return;
    if (courierOrder(cid)) { toast(`${COURIER[cid].name} est déjà en course, attendez son retour`); return; }
    o.delivery.courier = cid;
    o.delivery.departedAt = Date.now();
    queueIfOffline('Départ livreur');
    const due = orderDue(o);
    toast(`${COURIER[cid].name} parti vers ${ZONE[o.zone].label}, ${o.id}${due > 0 ? ` · il encaisse ${fmtMAD(orderTotal(o).total)}` : ''}`);
    refreshOps();
  }

  function deliverOrder(id) {
    const o = findOrder(id);
    if (!o) return;
    const cName = o.delivery.courier ? COURIER[o.delivery.courier].name : 'le livreur';
    const finish = () => {
      o.delivery.deliveredAt = Date.now();
      queueIfOffline('Livraison');
      toast(`${o.id} livrée, ${cName} est de retour, dispo pour la suivante`);
      refreshOps();
    };
    if (orderDue(o) > 0) openPay(o, { settle: true, note: `flous remis par ${cName}`, onSettled: finish });
    else finish();
  }

  /* ═══════════════════════ TICK — timers du four ═══════════════════════ */
  function tick() {
    let transition = false;
    const visible = root && root.classList.contains('is-on');
    ORDERS.forEach((o) => o.jobs.forEach((j) => {
      if (j.status === 'four' && !j.alerted && j.endAt - Date.now() <= 0) {
        j.alerted = true;
        transition = true;
        if (visible) toast(`${j.label} (${j.orderId}), dorée, sortez-la du four`);
      }
    }));
    if (!visible) return;
    if (state.view === 'four') {
      if (transition) { renderFour(); icons(); }
      else patchFourTimers();
    } else if (transition) {
      renderBadges();
    }
    if (state.view === 'livraison') patchSince();
  }
  function patchFourTimers() {
    const panel = $('[data-pz-panel="four"]', root);
    $$('[data-pz-jid]', panel).forEach((el) => {
      const j = JOB[el.dataset.pzJid];
      if (!j || j.status !== 'four') return;
      const rem = j.endAt - Date.now();
      if (rem <= 0) return;                       /* la transition re-rend tout */
      const t = $('[data-pz-time]', el);
      if (t) t.textContent = fmtMS(rem);
      const fg = $('.pz-ring .rfg', el);
      if (fg) fg.style.strokeDashoffset = (RING_C * Math.max(0, Math.min(1, rem / BAKE_MS))).toFixed(1);
    });
  }
  function patchSince() {
    $$('[data-pz-since]', root).forEach((el) => {
      const ts = +el.dataset.ts;
      if (ts) el.textContent = `parti ${fmtSince(ts)}`;
    });
  }

  /* ═══════════════════════ OFFLINE (file simulée) ═══════════════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline) {
      toast(state.queued
        ? `Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`
        : 'Réseau de retour, tout est déjà synchronisé');
      state.queued = 0;
    } else {
      toast('Mode hors-ligne, la caisse et le four continuent, tout est mis en file');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#pz-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.pz-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.pz-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'pz-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#pz-offline-note', root);
    note.hidden = !state.offline;
    $('#pz-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'pizzeria',
    greet: {
      line1: 'Sba7 lkhir Reda,',
      em: 'marhba.',
      sub: 'Pizzeria La Marsa <em>·</em> service du soir, le four est chaud',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) renderAll(); },
  });
})();
