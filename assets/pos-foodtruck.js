/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · FOOD TRUCK — Karavan (PIN 0009), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * The leanest vertical of the multi-métier demo: a food truck sells with TWO
 * gestures — toucher l'article, encaisser. Pas de fiche client, pas de table,
 * pas de config : un prénom pour l'appel et c'est parti. Le différenciateur
 * EST l'absence de friction : gros boutons, gros total, file d'appel au
 * prénom (« Omar ! C'est prêt ! »), et les vitals du camion (pain, gaz,
 * batterie, fonds de caisse) à portée de pouce entre deux services.
 *
 * Mid-shift seed : service de midi à la Marina, file à moitié pleine, un
 * habitué (Hamid le taxi) qui paiera au retrait, une commande déjà appelée.
 * Réutilise le kit caisse (.modal-veil, .modal, .cash-*, .reader-*) et le
 * #toast-stack partagé. V1 = couche opérationnelle : la carte part au
 * lecteur partenaire, sans encaissement Kiwi.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── real-store gate ─────────────────────────
     A paired / real venue must never see demo customer names. Local demo
     (pvReal()===false) keeps every seed byte-identical. */
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
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const MIN = 60 * 1000;
  const agoMin = (d) => {
    const m = Math.max(0, Math.round((Date.now() - d.getTime()) / MIN));
    return m < 1 ? "à l'instant" : `il y a ${m} min`;
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

  /* ───────────────────────── street-food line-art ─────────────────────────
     Same visual voice as the pressing's garment dict: forest strokes,
     mint-tint fills, 64×64 grid. These ARE the menu — one tap, c'est vendu. */
  const art = (inner) => `<svg class="ft-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    burger: art(`<path class="fill" d="M14 28c0-9 8-15 18-15s18 6 18 15v2H14z"/><path d="M14 30v-2c0-9 8-15 18-15s18 6 18 15v2"/><path d="M13 30h38"/><path class="thin" d="M23 21l2 2M32 19v3M41 21l-2 2"/><path d="M12 36q3.6 4 7.2 0t7.2 0 7.2 0 7.2 0 7.2 0"/><rect class="fill" x="14" y="41" width="36" height="6" rx="3"/><rect x="14" y="41" width="36" height="6" rx="3"/><path class="fill" d="M14 51h36v1a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z"/><path d="M14 51h36v1a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z"/>`),
    tacos: art(`<rect class="fill" x="8" y="24" width="48" height="22" rx="10"/><rect x="8" y="24" width="48" height="22" rx="10"/><path d="M49 24c4 4 4 18 0 22"/><path class="thin" d="M16 44l15-20M26 45l15-20M36 45l12-17"/><path class="thin" d="M24 16c0-2.5 2.5-2.5 2.5-5M36 16c0-2.5 2.5-2.5 2.5-5"/>`),
    hotdog: art(`<path class="fill" d="M12 26c0-7 9-11 20-11s20 4 20 11"/><path d="M12 26c0-7 9-11 20-11s20 4 20 11"/><rect class="fill" x="6" y="26" width="52" height="10" rx="5"/><rect x="6" y="26" width="52" height="10" rx="5"/><path d="M12 36c0 7 9 11 20 11s20-4 20-11"/><path class="thin" d="M17 20l4 2 4-2 4 2 4-2 4 2 4-2 4 2"/><path class="thin" d="M18 31h5M30 31h5M42 31h5"/>`),
    frites: art(`<path d="M23 26 21 11M29 26V7M35 26l1-17M41 26l3-13"/><path class="fill" d="M15 26h34l-5 28H20z"/><path d="M15 26h34l-5 28H20z"/><path class="thin" d="M18.5 34h27M20.5 42h23"/><path class="thin" d="M26 26l-1 8M38 26v8"/>`),
    jus: art(`<path class="fill" d="M21 20h22l-3 34H24z"/><path d="M21 20h22l-3 34H24z"/><path d="M31 20l8-13"/><path class="thin" d="M23 31h18.5M24 39h16.5"/><circle class="fill" cx="51" cy="24" r="8"/><circle cx="51" cy="24" r="8"/><path class="thin" d="M51 16v16M43 24h16M45.4 18.4l11.2 11.2M56.6 18.4 45.4 29.6"/>`),
    the: art(`<path class="fill" d="M18 31c-1 13 4 19 14 19s15-6 14-19c-.5-6-6-10-14-10s-13.5 4-14 10z"/><path d="M18 31c-1 13 4 19 14 19s15-6 14-19c-.5-6-6-10-14-10s-13.5 4-14 10z"/><path d="M20 26c4-3 20-3 24 0"/><path d="M32 21v-5"/><circle cx="32" cy="13" r="2.6"/><path d="M18 33 8 25l4 12 6 2"/><path d="M46 31c6 0 8.5 4 6.5 8s-6.5 5-8.5 4"/><path class="thin" d="M27 38h10"/>`),
    limonada: art(`<path class="fill" d="M20 22h24l-3 32H23z"/><path d="M20 22h24l-3 32H23z"/><path d="M17 22h30"/><path d="M33 22l6-14 7 2"/><circle class="thin" cx="28" cy="34" r="1.7"/><circle class="thin" cx="35" cy="41" r="1.7"/><circle class="thin" cx="30" cy="47" r="1.7"/><circle class="fill" cx="48" cy="17" r="5"/><circle cx="48" cy="17" r="5"/><path class="thin" d="M48 12v10M43 17h10"/>`),
    msemen: art(`<rect class="fill" x="12" y="22" width="40" height="32" rx="4"/><rect x="12" y="22" width="40" height="32" rx="4"/><path class="thin" d="M12 33h40M12 43h40M24 22v32M40 22v32"/><path d="M32 8c-3.2 4.2-3.2 7.5 0 7.5S35.2 12.2 32 8z"/><path class="thin" d="M22 18q5 3.5 10 0t10 0"/>`),
  };

  /* ───────────────────────── carte (8 articles max — c'est voulu) ───────── */
  const MENU = [
    { id: 'burger',   label: 'Smash burger',     price: 35, bread: true },
    { id: 'tacos',    label: 'Tacos marocain',   price: 30 },
    { id: 'hotdog',   label: 'Hot-dog',          price: 25, bread: true },
    { id: 'frites',   label: 'Frites maison',    price: 15 },
    { id: 'jus',      label: "Jus d'orange pressé", price: 12 },
    { id: 'the',      label: 'Thé à la menthe',  price: 8 },
    { id: 'limonada', label: 'Limonada',         price: 10 },
    { id: 'msemen',   label: 'Msemen au miel',   price: 12 },
  ];
  const ITEM = Object.fromEntries(MENU.map((m) => [m.id, m]));

  /* ───────────────────────── emplacements (rotation Tanger) ─────────────── */
  const SPOTS = [
    { id: 'marina',  label: 'Marina Bay',    when: 'Service de midi', hours: '11:30 – 15:00', icon: 'sun',
      note: 'Corniche, face au port de plaisance, gros flux déjeuner, bureaux et promeneurs.' },
    { id: 'achakar', label: 'Plage Achakar', when: 'Service du soir', hours: '18:00 – 22:30', icon: 'moon',
      note: 'Coucher de soleil côté grottes d\'Hercule, familles, surfeurs, longue file vers 20 h.' },
  ];
  const SPOT = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
  /* rotation indicative de la semaine (dim → sam) */
  const ROTA = [
    { day: 'dim', midi: 'Relâche', soir: '—' },
    { day: 'lun', midi: 'Marina Bay', soir: 'Plage Achakar' },
    { day: 'mar', midi: 'Gare routière', soir: 'Plage Achakar' },
    { day: 'mer', midi: 'Marina Bay', soir: 'Plage Achakar' },
    { day: 'jeu', midi: 'Marina Bay', soir: 'Plage Achakar' },
    { day: 'ven', midi: 'Quartier Iberia', soir: 'Plage Achakar' },
    { day: 'sam', midi: 'Plage Achakar', soir: 'Plage Achakar' },
  ];

  /* ───────────────────────── seed — MID-SHIFT, midi à la Marina ──────────
     Le service tourne depuis 11h30 : 26 commandes encaissées, une file à
     moitié pleine, Bilal déjà appelé, et Hamid (le taxi habitué) qui paiera
     au retrait, comme toujours. */
  const NOW = Date.now();
  let seq = 48;                                     /* prochain numéro d'appel */

  function mkSeed(n, name, lines, method, atMin, status, readyMin, servedMin) {
    const ls = lines.map(([id, qty]) => ({ id, qty }));
    const total = ls.reduce((s, l) => s + ITEM[l.id].price * l.qty, 0);
    return {
      id: `K-${n}`, n, name, anon: false,
      lines: ls, total,
      pay: method ? { method, paid: total } : { method: null, paid: 0 },
      spot: 'marina',
      at: new Date(NOW + atMin * MIN),
      status,
      readyAt:  readyMin  != null ? new Date(NOW + readyMin * MIN)  : null,
      servedAt: servedMin != null ? new Date(NOW + servedMin * MIN) : null,
    };
  }

  const QUEUE = pvReal() ? [] : [
    mkSeed(43, 'Bilal',   [['hotdog', 1], ['limonada', 1]], 'especes', -12, 'ready', -3),
    mkSeed(44, 'Omar',    [['burger', 2], ['frites', 1]],   'especes', -9,  'prep'),
    mkSeed(45, 'Hamid',   [['tacos', 1], ['the', 1]],       null,      -7,  'prep'),
    mkSeed(46, 'Salma',   [['jus', 1], ['msemen', 1]],      'carte',   -4,  'prep'),
    mkSeed(47, 'Khadija', [['burger', 1]],                  'especes', -2,  'prep'),
  ];
  if (QUEUE[2]) QUEUE[2].hint = 'taxi du port, paie au retrait, comme d\'hab';

  const SERVED = pvReal() ? [] : [
    mkSeed(42, 'Yassine', [['tacos', 1], ['frites', 1]],                 'carte',   -16, 'served', -10, -8),
    mkSeed(41, 'Meriem',  [['jus', 2]],                                  'especes', -21, 'served', -15, -13),
    mkSeed(40, 'Anas',    [['burger', 1], ['frites', 1], ['limonada', 1]], 'especes', -25, 'served', -19, -16),
    mkSeed(39, 'Sara',    [['the', 1], ['msemen', 1]],                   'especes', -29, 'served', -24, -21),
    mkSeed(38, 'Mounir',  [['tacos', 2], ['frites', 1]],                 'carte',   -35, 'served', -28, -26),
    mkSeed(37, 'Houda',   [['burger', 1]],                               'especes', -40, 'served', -34, -31),
  ];

  /* recette du jour (agrégat — inclut la file déjà encaissée) */
  const recette = pvReal() ? {
    marina:  { orders: 0, especes: 0, carte: 0 },
    achakar: { orders: 0, especes: 0, carte: 0 },
  } : {
    marina:  { orders: 26, especes: 1386, carte: 400 },
    achakar: { orders: 0,  especes: 0,    carte: 0 },
  };
  const sold = pvReal() ? {} : { burger: 18, tacos: 9, hotdog: 7, frites: 21, jus: 14, the: 11, limonada: 8, msemen: 5 };
  const HIER_TOTAL = pvReal() ? 0 : 3120;

  const state = {
    view: 'vente',
    spot: 'marina',
    fileSeg: 'active',
    ticket: { lines: [], name: '' },
    vitals: { pain: 24, gaz: 'ok', batterie: 76, fonds: 300 },
    waits: [5, 6, 8, 5, 7, 9],         /* minutes commande → appel (jour) */
    painWarned: false,
    offline: false, queued: 0,
  };

  const GAZ = {
    ok:         { label: 'OK',           cls: '',     next: 'surveiller' },
    surveiller: { label: 'À surveiller', cls: 'warn', next: 'changer' },
    changer:    { label: 'À changer',    cls: 'bad',  next: 'ok' },
  };

  /* ───────────────────────── derived ───────────────────────── */
  const ticketTotal = () => state.ticket.lines.reduce((s, l) => s + ITEM[l.id].price * l.qty, 0);
  const ticketCount = () => state.ticket.lines.reduce((s, l) => s + l.qty, 0);
  const cashTotal   = () => recette.marina.especes + recette.achakar.especes;
  const carteTotal  = () => recette.marina.carte + recette.achakar.carte;
  const ordersTotal = () => recette.marina.orders + recette.achakar.orders;
  const dayTotal    = () => cashTotal() + carteTotal();
  const avgWait     = () => Math.round(state.waits.reduce((a, b) => a + b, 0) / Math.max(1, state.waits.length));
  const itemsSummary = (o) => o.lines.map((l) => `${l.qty} × ${ITEM[l.id].label}`).join(' · ');
  const findQ = (id) => QUEUE.find((o) => o.id === id);

  /* Point de passage unique de la recette : la vente éclair et l'encaissement
     au retrait finissent tous les deux ici, donc le journal partagé aussi. */
  function addRecette(spotId, method, amount, ref) {
    const r = recette[spotId] || recette.marina;
    r.orders++;
    if (method === 'carte') r.carte += amount;
    else r.especes += amount;
    postDay(amount, method, `Camion · ${SPOT[spotId] ? SPOT[spotId].label : 'Emplacement'}`, ref);
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le camion encaissait dans `recette` et rien d'autre : la recette du service
     disparaissait au premier refresh et le patron voyait 0 MAD. Démo : no-op. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('foodtruck', { total, method, label, ref });
    } catch (_) {}
  }
  /* Reprise du service en cours. Le journal ne retient pas l'emplacement, donc
     tout est recrédité sur `marina`, l'emplacement par défaut : mieux vaut une
     ventilation approximative qu'une recette du jour à zéro. `sold` n'est pas
     restauré — c'est un compteur d'articles, pas d'argent. Le numéro d'appel
     repart au-delà du dernier encaissé, sinon deux clients sont appelés au même
     numéro. Démo : journal vide, aucun effet. */
  (function restoreDay() {
    try {
      if (!window.KiwiPosSale) return;
      const t = window.KiwiPosSale.totals('foodtruck');
      if (!t.count) return;
      recette.marina.especes += t.cash;
      recette.marina.carte += t.card + t.other;
      recette.marina.orders += t.count;
      seq = window.KiwiPosSale.nextSeq('foodtruck', seq);
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
      <aside class="ft-rail">
        <div class="ft-brand">kiwi<i></i></div>
        <div class="ft-venue">
          <div class="ft-venue-name">${pvName('Karavan') || 'Mon food truck'}</div>
          <div class="ft-venue-sub">${pvReal() ? (pvCity('') || '') : 'Food truck · Tanger'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="ft-nav" id="ft-nav">
          <button class="ft-nav-it on" data-ft-view="vente"><i data-lucide="zap"></i><span>Vente éclair</span><b class="ft-nav-badge" id="ft-badge-vente"></b></button>
          <button class="ft-nav-it" data-ft-view="file"><i data-lucide="megaphone"></i><span>File</span><b class="ft-nav-badge" id="ft-badge-file"></b></button>
          <button class="ft-nav-it" data-ft-view="spot"><i data-lucide="map-pin"></i><span>Emplacement</span></button>
          <button class="ft-nav-it" data-ft-view="recette"><i data-lucide="wallet"></i><span>Recette</span></button>
        </nav>
        <div class="ft-rail-foot">
          <button class="ft-net" id="ft-net" title="Simuler une coupure réseau">
            <i class="ft-net-dot"></i><span class="ft-net-label">En ligne</span>
          </button>
          <button class="ft-lock" id="ft-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="ft-main">
        <div class="ft-offline-note" id="ft-offline-note" hidden>
          Hors-ligne, les ventes continuent sur la tablette et partent à la synchro au retour du réseau.
          <b id="ft-queue-count"></b>
        </div>

        <section class="ft-view is-on" data-ft-panel="vente">
          <header class="ft-head">
            <div><h1>Vente éclair</h1><div class="ft-head-sub" id="ft-vente-sub"></div></div>
            <div class="ft-head-right">
              <span class="ft-head-hint">Toucher = ajouter · deux gestes pour encaisser</span>
              <button class="ft-chip" id="ft-vente-queue" title="Ouvrir la file d'appel"></button>
            </div>
          </header>
          <div class="ft-sell">
            <div class="ft-menu-wrap"><div class="ft-menu" id="ft-menu"></div></div>
            <aside class="ft-ticket" id="ft-ticket"></aside>
          </div>
        </section>

        <section class="ft-view" data-ft-panel="file">
          <header class="ft-head">
            <div><h1>File d'appel</h1><div class="ft-head-sub">Premier prénom, premier servi, l'appel se fait au micro.</div></div>
            <div class="ft-head-right"><span class="ft-chip" id="ft-wait-chip"><i data-lucide="timer"></i><span id="ft-wait-val"></span></span></div>
          </header>
          <div class="ft-file-bar">
            <div class="ft-seg" data-lens-demo id="ft-file-seg">
              <button class="ft-seg-it on" data-lens-item data-ft-fseg="active">En cours <b id="ft-seg-ct-a"></b></button>
              <button class="ft-seg-it" data-lens-item data-ft-fseg="served">Servies <b id="ft-seg-ct-s"></b></button>
            </div>
            <span class="ft-head-hint" id="ft-file-hint"></span>
          </div>
          <div class="ft-qlist" id="ft-qlist"></div>
        </section>

        <section class="ft-view" data-ft-panel="spot">
          <header class="ft-head">
            <div><h1>Emplacement &amp; camion</h1><div class="ft-head-sub" id="ft-spot-sub"></div></div>
            <div class="ft-head-right"><span class="ft-head-hint">La caisse suit le camion, la recette se ventile par emplacement.</span></div>
          </header>
          <div class="ft-spot-scroll" id="ft-spot-body"></div>
        </section>

        <section class="ft-view" data-ft-panel="recette">
          <header class="ft-head">
            <div><h1>Recette du jour</h1><div class="ft-head-sub" id="ft-rec-sub"></div></div>
            <div class="ft-head-right"><span class="ft-head-hint">Tout est déjà ventilé, comptez, fermez, rentrez.</span></div>
          </header>
          <div class="ft-rec-scroll" id="ft-rec-body"></div>
        </section>
      </main>

      <div class="modal-veil" id="ft-pay-veil"><div class="modal ft-rel" id="ft-paym"></div></div>
      <div class="modal-veil" id="ft-count-veil"><div class="modal ft-count ft-rel" id="ft-countm"></div></div>
      <div class="modal-veil" id="ft-fonds-veil"><div class="modal ft-rel" id="ft-fondsm"></div></div>`;

    /* ---- static bindings (delegation on persistent containers) ---- */
    $('#ft-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft-view]');
      if (b) switchView(b.dataset.ftView);
    });
    $('#ft-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#ft-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    /* menu — ONE tap adds, c'est tout */
    $('#ft-menu', root).addEventListener('click', (e) => {
      const card = e.target.closest('[data-ft-item]');
      if (card) addItem(card.dataset.ftItem, card);
    });
    $('#ft-vente-queue', root).addEventListener('click', () => switchView('file'));

    /* ticket — delegation (re-rendered innerHTML, persistent container) */
    const tk = $('#ft-ticket', root);
    tk.addEventListener('click', (e) => {
      const minus = e.target.closest('[data-ft-minus]');
      const plus  = e.target.closest('[data-ft-plus]');
      if (minus || plus) {
        const i = +(minus ? minus.dataset.ftMinus : plus.dataset.ftPlus);
        const ln = state.ticket.lines[i];
        if (!ln) return;
        if (plus) ln.qty = Math.min(30, ln.qty + 1);
        else { ln.qty--; if (ln.qty <= 0) state.ticket.lines.splice(i, 1); }
        renderTicket(); renderBadges(); icons();
        return;
      }
      if (e.target.closest('#ft-tk-clear')) {
        state.ticket = { lines: [], name: '' };
        renderTicket(); renderBadges(); icons();
        toast('Commande vidée');
        return;
      }
      if (e.target.closest('#ft-pay-cash')) { payTicket('especes'); return; }
      if (e.target.closest('#ft-pay-card')) { payTicket('carte'); return; }
    });
    tk.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'ft-name-in') {
        state.ticket.name = e.target.value.slice(0, 18);
      }
    });

    /* file — seg + actions */
    $('#ft-file-seg', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ft-fseg]');
      if (!b || b.dataset.ftFseg === state.fileSeg) return;
      state.fileSeg = b.dataset.ftFseg;
      $$('[data-ft-fseg]', root).forEach((x) => x.classList.toggle('on', x.dataset.ftFseg === state.fileSeg));
      renderFileList(); icons();
    });
    $('#ft-qlist', root).addEventListener('click', (e) => {
      const call = e.target.closest('[data-ft-call]');
      if (call) { callOrder(call.dataset.ftCall); return; }
      const recall = e.target.closest('[data-ft-recall]');
      if (recall) {
        const o = findQ(recall.dataset.ftRecall);
        if (o) { toast(`« ${o.name} ! », rappelé au micro`); queueIfOffline('Rappel'); }
        return;
      }
      const remit = e.target.closest('[data-ft-remit]');
      if (remit) { remitOrder(remit.dataset.ftRemit); return; }
    });

    /* emplacement — spots + vitals */
    $('#ft-spot-body', root).addEventListener('click', (e) => {
      const act = e.target.closest('[data-ft-spot-act]');
      if (act) { activateSpot(act.dataset.ftSpotAct); return; }
      const pain = e.target.closest('[data-ft-pain]');
      if (pain) { adjustPain(+pain.dataset.ftPain); return; }
      if (e.target.closest('[data-ft-gaz]')) { cycleGaz(); return; }
      if (e.target.closest('[data-ft-batt]')) {
        const h = Math.round(state.vitals.batterie / 15);
        toast(`Batterie ${state.vitals.batterie} %, environ ${h} h d'autonomie restante`);
        return;
      }
      if (e.target.closest('[data-ft-fonds]')) { openFonds(); return; }
    });

    /* recette */
    $('#ft-rec-body', root).addEventListener('click', (e) => {
      if (e.target.closest('#ft-count-open')) openCount();
    });

    renderAll();
    if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {}
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / RENDER ROOT ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.ft-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.ftView === view));
    $$('.ft-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.ftPanel === view));
    if (view === 'vente')   renderVente();
    if (view === 'file')    renderFile();
    if (view === 'spot')    renderSpot();
    if (view === 'recette') renderRecette();
    icons();
  }

  function renderAll() {
    renderMenu();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
  }

  function renderBadges() {
    const vCt = ticketCount();
    const fCt = QUEUE.length;
    const bv = $('#ft-badge-vente', root), bf = $('#ft-badge-file', root);
    bv.textContent = vCt || '';
    bv.style.display = vCt ? '' : 'none';
    bf.textContent = fCt || '';
    bf.style.display = fCt ? '' : 'none';
  }

  /* ═══════════════════════ VENTE ÉCLAIR ═══════════════════════ */
  function renderVente() {
    $('#ft-vente-sub', root).textContent =
      `${fmtDT(new Date())} · ${SPOT[state.spot].label}, ${SPOT[state.spot].when.toLowerCase()}`;
    renderVenteQueue();
    renderTicket();
  }

  /* le pont vente → file : la file vit aussi sous les yeux du vendeur */
  function renderVenteQueue() {
    const el = $('#ft-vente-queue', root);
    if (!el) return;
    el.innerHTML = `<i data-lucide="megaphone"></i> file ${QUEUE.length} · ~${avgWait()} min`;
  }

  function renderMenu() {
    $('#ft-menu', root).innerHTML = MENU.map((m, i) => `
      <button class="ft-card" data-ft-item="${m.id}" style="--i:${i}" aria-label="Ajouter ${esc(m.label)}">
        <span class="ft-card-art">${ART[m.id] || ''}</span>
        <span class="ft-card-name">${esc(m.label)}</span>
        <span class="ft-card-price">${m.price} MAD</span>
      </button>`).join('');
  }

  function addItem(id, cardEl) {
    const ln = state.ticket.lines.find((l) => l.id === id);
    if (ln) ln.qty = Math.min(30, ln.qty + 1);
    else state.ticket.lines.push({ id, qty: 1 });
    renderTicket(); renderBadges(); icons();
    /* feedback : +1 flottant sur la carte, bump du total */
    if (cardEl) {
      const p = document.createElement('span');
      p.className = 'ft-plus1';
      p.textContent = '+1';
      cardEl.appendChild(p);
      setTimeout(() => p.remove(), 650);
    }
    const val = $('#ft-total-val', root);
    if (val) {
      val.classList.remove('bump');
      void val.offsetWidth;
      val.classList.add('bump');
    }
  }

  function lineRow(ln, i) {
    const it = ITEM[ln.id];
    return `<div class="ft-line">
      <span class="ft-line-art">${ART[ln.id] || ''}</span>
      <span class="ft-line-mid">
        <span class="ft-line-name">${esc(it.label)}</span>
        <span class="ft-line-sub">${it.price} MAD / u</span>
      </span>
      <span class="ft-line-right">
        <span class="ft-line-price">${fmtMAD(it.price * ln.qty)}</span>
        <span class="ft-line-qty">
          <button data-ft-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-ft-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const total = ticketTotal();
    const dis = t.lines.length ? '' : 'disabled';
    $('#ft-ticket', root).innerHTML = `
      <div class="ft-tk-head">
        <div><span class="ft-tk-title">Commande</span> <span class="ft-tk-num">n° ${seq}</span></div>
        ${t.lines.length ? '<button class="ft-tk-clear" id="ft-tk-clear">Vider</button>' : ''}
      </div>
      <label class="ft-name-row" for="ft-name-in">
        <i data-lucide="megaphone"></i>
        <span class="ft-name-pour">Pour</span>
        <input class="ft-name-in" id="ft-name-in" maxlength="18" autocomplete="off" spellcheck="false"
               placeholder="prénom pour l'appel (sinon n° ${seq})" value="${esc(t.name)}" />
      </label>
      <div class="ft-lines" id="ft-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="ft-empty">
            <i data-lucide="zap"></i>
            <div>Touchez un article,<br>il part direct dans la commande.</div>
          </div>`}
      </div>
      <div class="ft-foot">
        <div class="ft-total"><span class="lbl">Total</span><span class="val" id="ft-total-val">${fmtMAD(total)}</span></div>
        <div class="ft-paybar">
          <button class="ft-pay-cash" id="ft-pay-cash" ${dis}><i data-lucide="banknote"></i> Espèces</button>
          <button class="ft-pay-card" id="ft-pay-card" ${dis}><i data-lucide="credit-card"></i> Carte</button>
        </div>
        <div class="ft-foot-note">Espèces d'abord au camion, le rendu se calcule tout seul.</div>
      </div>`;
  }

  /* ───────────────────────── encaisser ───────────────────────── */
  function callLabel() {
    const name = state.ticket.name.trim();
    return name || `n° ${seq}`;
  }

  function payTicket(method) {
    if (!state.ticket.lines.length) return;
    if (method === 'carte' && state.offline) {
      toast('Hors-ligne, le lecteur carte ne répond pas. Encaissez en espèces.');
      return;
    }
    const total = ticketTotal();
    openPay({
      amount: total,
      sub: `Commande n° ${seq} · pour ${esc(callLabel())}`,
      method,
      onPaid: (m, rendu) => {
        const o = createOrder(m);
        toast(`Khlass, ${fmtMAD(total)} encaissé${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        toast(o.anon ? `Commande n° ${o.n}, en prépa` : `« ${o.name} » n° ${o.n}, en prépa`);
      },
    });
  }

  function createOrder(method) {
    const t = state.ticket;
    const total = ticketTotal();
    const name = t.name.trim();
    const o = {
      id: `K-${seq}`, n: seq, name: name || `N° ${seq}`, anon: !name,
      lines: t.lines.map((l) => ({ id: l.id, qty: l.qty })),
      total,
      pay: { method, paid: total },
      spot: state.spot,
      at: new Date(), status: 'prep', readyAt: null, servedAt: null,
    };
    seq++;
    QUEUE.push(o);
    addRecette(o.spot, method, total, o.id);
    o.lines.forEach((l) => { sold[l.id] = (sold[l.id] || 0) + l.qty; });
    consumeBread(o.lines);
    state.ticket = { lines: [], name: '' };
    queueIfOffline(`Commande ${o.id}`);
    renderTicket(); renderBadges(); renderVenteQueue(); icons();
    if (state.view === 'file') renderFile();
    return o;
  }

  function consumeBread(lines) {
    const used = lines.reduce((s, l) => s + ((ITEM[l.id].bread) ? l.qty : 0), 0);
    if (!used) return;
    const before = state.vitals.pain;
    state.vitals.pain = Math.max(0, before - used);
    if (state.vitals.pain < 10 && !state.painWarned) {
      state.painWarned = true;
      toast(`Pain restant : ${state.vitals.pain}, pensez à recharger avant ce soir`);
    }
    if (state.view === 'spot') renderSpot();
  }

  /* ═══════════════════════ PAIEMENT (kit caisse) ═══════════════════════
     cfg = { amount, sub, method: 'especes' | 'carte' | null, onPaid(m, rendu) }
     method null → choix Espèces / Carte (encaissement au retrait). */
  function openPay(cfg) {
    const el = $('#ft-paym', root);
    const veil = openVeil('#ft-pay-veil');
    const close = () => closeVeil(veil);
    const bindX = () => $$('[data-ft-close]', el).forEach((b) => { b.onclick = close; });

    const stepMethod = () => {
      el.innerHTML = `
        <button class="ft-modal-x" data-ft-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Encaisser</h3>
        <p class="modal-subtle">${cfg.sub}</p>
        <div class="modal-amount size-md">${fmtMAD(cfg.amount)}</div>
        <div class="ft-pay-opts">
          <button class="ft-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé tout seul</span></span>
          </button>
          <button class="ft-pay-opt" data-m="carte">
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
        <button class="ft-modal-x" data-ft-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces</h3>
        <p class="modal-subtle">${cfg.sub}</p>
        <div class="modal-amount size-md">${fmtMAD(cfg.amount)}</div>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ft-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="ft-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${cfg.amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-set="exact">Montant exact</button>
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="ft-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ft-cash-ok">Encaisser</button>
        </div>`;
      icons(); bindX();
      const input = $('#ft-cash-in', el);
      const refresh = () => {
        $('#ft-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - cfg.amount));
        $('#ft-cash-ok', el).disabled = received < cfg.amount;
      };
      input.oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; input.value = received; refresh(); };
      });
      $('[data-set="exact"]', el).onclick = () => { received = cfg.amount; input.value = received; refresh(); };
      refresh();
      $('#ft-cash-ok', el).onclick = () => {
        close();
        cfg.onPaid('especes', Math.max(0, received - cfg.amount));
      };
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="ft-modal-x" data-ft-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(cfg.amount)}</h3>
        <p class="modal-subtle">${cfg.sub}</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ft-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ft-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons(); bindX();
      setTimeout(() => {
        const disc = $('#ft-reader-disc', el);
        if (!disc || !veil.classList.contains('is-open')) return;
        const status = $('#ft-reader-status', el);
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

    if (cfg.method === 'especes') stepCash();
    else if (cfg.method === 'carte') stepCard();
    else stepMethod();
  }

  /* ═══════════════════════ FILE D'APPEL ═══════════════════════ */
  function renderFile() {
    $('#ft-wait-val', root).textContent = `attente moy. ~${avgWait()} min`;
    $$('[data-ft-fseg]', root).forEach((x) => x.classList.toggle('on', x.dataset.ftFseg === state.fileSeg));
    renderFileList();
  }

  function payPill(o) {
    if (o.pay.paid >= o.total) {
      return `<span class="ft-pill ok"><i data-lucide="check"></i> payé · ${o.pay.method === 'carte' ? 'carte' : 'espèces'}</span>`;
    }
    return `<span class="ft-pill due"><i data-lucide="hand-coins"></i> à encaisser · ${fmtMAD(o.total)}</span>`;
  }

  function renderFileList() {
    const wrap = $('#ft-qlist', root);
    $('#ft-seg-ct-a', root).textContent = QUEUE.length;
    $('#ft-seg-ct-s', root).textContent = SERVED.length;
    $('#ft-file-hint', root).textContent = state.fileSeg === 'active'
      ? 'Prêt ? Un bouton, un prénom au micro.'
      : 'Dernières remises du service.';

    if (state.fileSeg === 'served') {
      wrap.innerHTML = SERVED.length ? SERVED.map((o) => `
        <div class="ft-srow">
          <span class="ft-qnum mut">${o.n}</span>
          <span class="ft-qmid">
            <span class="ft-sname">${esc(o.name)}</span>
            <span class="ft-qitems">${esc(itemsSummary(o))}</span>
          </span>
          <span class="ft-sright"><b>${fmtMAD(o.total)}</b><span>servi à ${fmtTime(o.servedAt)}</span></span>
        </div>`).join('')
        : '<div class="ft-qempty">Rien de servi pour l\'instant, ça ne va pas durer.</div>';
      return;
    }

    wrap.innerHTML = QUEUE.length ? QUEUE.map((o) => `
      <div class="ft-qrow ${o.status === 'ready' ? 'is-ready' : ''}">
        <span class="ft-qnum">${o.n}</span>
        <span class="ft-qmid">
          <span class="ft-qname">${esc(o.name)}</span>
          <span class="ft-qitems">${esc(itemsSummary(o))}${o.hint ? ` · ${esc(o.hint)}` : ''}</span>
          <span class="ft-qpills">
            ${payPill(o)}
            ${o.status === 'ready'
              ? `<span class="ft-pill ok"><i data-lucide="megaphone"></i> appelé à ${fmtTime(o.readyAt)}</span>`
              : '<span class="ft-pill"><i data-lucide="clock"></i> en prépa</span>'}
          </span>
        </span>
        <span class="ft-qright">
          <span class="ft-qago">${agoMin(o.at)}</span>
          <span class="ft-qbtns">
            ${o.status === 'prep'
              ? `<button class="ft-call" data-ft-call="${o.id}"><i data-lucide="megaphone"></i> C'est prêt !</button>`
              : `<button class="ft-ghost" data-ft-recall="${o.id}"><i data-lucide="megaphone"></i> Rappeler</button>
                 <button class="ft-remit" data-ft-remit="${o.id}"><i data-lucide="check-check"></i> Remis</button>`}
          </span>
        </span>
      </div>`).join('')
      : '<div class="ft-qempty">File vide, tout le monde est servi.<br>Retour à la vente éclair pour la remplir.</div>';
  }

  function callOrder(id) {
    const o = findQ(id);
    if (!o || o.status !== 'prep') return;
    o.status = 'ready';
    o.readyAt = new Date();
    state.waits.push(Math.max(1, Math.round((o.readyAt - o.at) / MIN)));
    queueIfOffline('Appel client');
    toast(`« ${o.name} ! C'est prêt ! », annoncé au micro`);
    renderFile(); renderBadges(); renderVenteQueue(); icons();
  }

  function remitOrder(id) {
    const o = findQ(id);
    if (!o) return;
    if (o.pay.paid < o.total) {
      /* l'habitué qui paie au retrait — on encaisse d'abord */
      openPay({
        amount: o.total,
        sub: `${o.id} · ${esc(o.name)}, à encaisser au retrait`,
        method: null,
        onPaid: (m, rendu) => {
          o.pay = { method: m, paid: o.total };
          addRecette(o.spot, m, o.total, o.id);
          o.lines.forEach((l) => { sold[l.id] = (sold[l.id] || 0) + l.qty; });
          toast(`Khlass, ${fmtMAD(o.total)} encaissé${rendu > 0 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
          serveOrder(o);
        },
      });
      return;
    }
    serveOrder(o);
  }

  function serveOrder(o) {
    o.status = 'served';
    o.servedAt = new Date();
    const i = QUEUE.indexOf(o);
    if (i >= 0) QUEUE.splice(i, 1);
    SERVED.unshift(o);
    queueIfOffline('Remise');
    toast(`${o.name}, servi. Bsa7a !`);
    renderFile(); renderBadges(); renderVenteQueue(); icons();
  }

  /* ═══════════════════════ EMPLACEMENT & CAMION ═══════════════════════ */
  function renderSpot() {
    const v = state.vitals;
    const gaz = GAZ[v.gaz];
    const today = ROTA[new Date().getDay()];
    $('#ft-spot-sub', root).textContent =
      `Aujourd'hui : midi ${today.midi} · soir ${today.soir}`;

    $('#ft-spot-body', root).innerHTML = `
      <div class="ft-spot-grid">
        ${SPOTS.map((s) => {
          const live = state.spot === s.id;
          return `<div class="ft-spot-card ${live ? 'live' : ''}">
            <div class="ft-spot-top">
              <i data-lucide="${s.icon}"></i>
              ${live ? '<span class="ft-live"><i></i>EN SERVICE</span>' : `<span class="ft-next">${esc(s.when)}</span>`}
            </div>
            <div class="ft-spot-name">${esc(s.label)}</div>
            <div class="ft-spot-sub">${esc(s.when)} · <b>${s.hours}</b></div>
            <div class="ft-spot-note">${esc(s.note)}</div>
            ${live
              ? '<div class="ft-spot-cta is-live"><i data-lucide="check"></i> Caisse rattachée ici</div>'
              : `<button class="ft-spot-cta" data-ft-spot-act="${s.id}"><i data-lucide="navigation"></i> Démarrer le service ici</button>`}
          </div>`;
        }).join('')}
      </div>

      <div class="ft-sec-lbl"><i data-lucide="truck"></i> Camion, l'essentiel</div>
      <div class="ft-vitals">
        <div class="ft-vital ${v.pain < 10 ? 'warn' : ''}">
          <div class="ft-vital-lbl">Pain restant</div>
          <div class="ft-vital-row">
            <button class="ft-vstep" data-ft-pain="-1" aria-label="Moins un pain">−</button>
            <b class="ft-vital-val mono">${v.pain}</b>
            <button class="ft-vstep" data-ft-pain="1" aria-label="Plus un pain">+</button>
          </div>
          <div class="ft-vital-sub">burgers &amp; hot-dogs · décompte auto à chaque vente</div>
        </div>
        <button class="ft-vital ${gaz.cls}" data-ft-gaz>
          <span class="ft-vital-lbl">Gaz</span>
          <span class="ft-vital-val">${gaz.label}</span>
          <span class="ft-vital-sub">bouteille de la plancha · toucher pour changer l'état</span>
        </button>
        <button class="ft-vital" data-ft-batt>
          <span class="ft-vital-lbl">Batterie</span>
          <span class="ft-vital-val mono">${v.batterie} %</span>
          <span class="ft-battbar"><i style="width:${v.batterie}%"></i></span>
          <span class="ft-vital-sub">frigo + caisse · toucher pour l'autonomie estimée</span>
        </button>
        <button class="ft-vital" data-ft-fonds>
          <span class="ft-vital-lbl">Fonds de caisse</span>
          <span class="ft-vital-val mono">${fmtMAD(v.fonds)}</span>
          <span class="ft-vital-sub">monnaie de départ · toucher pour ajuster</span>
        </button>
      </div>

      <div class="ft-sec-lbl"><i data-lucide="calendar"></i> Rotation de la semaine</div>
      <div class="ft-rota">
        ${ROTA.map((r, i) => `
          <div class="ft-rota-row ${i === new Date().getDay() ? 'today' : ''}">
            <span class="ft-rota-day">${r.day}</span>
            <span class="ft-rota-mid">midi ${esc(r.midi)} · soir ${esc(r.soir)}</span>
            ${i === new Date().getDay() ? '<span class="ft-rota-tag">AUJOURD\'HUI</span>' : ''}
          </div>`).join('')}
      </div>`;
    icons();
  }

  function activateSpot(id) {
    if (!SPOT[id] || state.spot === id) return;
    state.spot = id;
    queueIfOffline('Changement de spot');
    toast(`Service déplacé, ${SPOT[id].label}. Les ventes se ventilent ici.`);
    renderSpot();
    if (state.view === 'vente') renderVente();
    icons();
  }

  function adjustPain(delta) {
    state.vitals.pain = Math.max(0, Math.min(99, state.vitals.pain + delta));
    if (state.vitals.pain >= 10) state.painWarned = false;
    renderSpot();
  }

  function cycleGaz() {
    state.vitals.gaz = GAZ[state.vitals.gaz].next;
    const g = GAZ[state.vitals.gaz];
    toast(`Gaz, ${g.label.toLowerCase()}${state.vitals.gaz === 'changer' ? ' : prévoir une bouteille avant le service du soir' : ''}`);
    renderSpot();
  }

  function openFonds() {
    const el = $('#ft-fondsm', root);
    el.innerHTML = `
      <button class="ft-modal-x" data-ft-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Fonds de caisse</h3>
      <p class="modal-subtle">La monnaie de départ du service, elle compte dans l'attendu au comptage.</p>
      <div class="cash-input-row" style="margin-bottom:14px;">
        <label class="cash-input-label" for="ft-fonds-in">Montant (MAD)</label>
        <input class="cash-input mono" id="ft-fonds-in" type="number" inputmode="numeric" min="0" step="10" value="${state.vitals.fonds}" />
      </div>
      <div class="ft-count-actions">
        <button class="ft-btn secondary" data-ft-close>Annuler</button>
        <button class="ft-btn primary" id="ft-fonds-ok"><i data-lucide="check"></i> Enregistrer</button>
      </div>`;
    icons();
    const veil = openVeil('#ft-fonds-veil');
    $$('[data-ft-close]', el).forEach((b) => { b.onclick = () => closeVeil(veil); });
    $('#ft-fonds-ok', el).onclick = () => {
      const val = Math.max(0, +$('#ft-fonds-in', el).value || 0);
      state.vitals.fonds = val;
      closeVeil(veil);
      toast(`Fonds de caisse, ${fmtMAD(val)}`);
      renderSpot();
      if (state.view === 'recette') renderRecette();
      icons();
    };
  }

  /* ═══════════════════════ RECETTE ═══════════════════════ */
  function renderRecette() {
    const total = dayTotal();
    const orders = ordersTotal();
    const avg = orders ? Math.round(total / orders) : 0;
    const cash = cashTotal(), carte = carteTotal();
    const cashPct = total ? Math.round((cash / total) * 100) : 0;
    const maxSold = Math.max(...Object.values(sold), 1);
    const soldRows = MENU
      .map((m) => ({ m, ct: sold[m.id] || 0 }))
      .sort((a, b) => b.ct - a.ct);

    $('#ft-rec-sub', root).textContent = `${fmtDT(new Date())}${pvReal() ? (pvName('') ? ' · caisse ' + pvName('') : '') : ' · caisse Karavan'}`;
    $('#ft-rec-body', root).innerHTML = `
      <div class="ft-rec-hero">
        <div class="ft-rec-lbl">Recette du jour · ${orders} commandes</div>
        <div class="ft-rec-val">${fmtMAD(total)}</div>
        <div class="ft-rec-sub">panier moyen ${fmtMAD(avg)} · hier ${fmtMAD(HIER_TOTAL)} sur les deux services</div>
      </div>

      <div class="ft-rec-grid">
        <div class="ft-rcard">
          <div class="ft-rcard-title"><i data-lucide="map-pin"></i> Par emplacement</div>
          <div class="ft-split-row ${state.spot === 'marina' ? '' : 'mut'}">
            <span class="who">${state.spot === 'marina' ? '<i></i>' : ''}Marina Bay <span>midi</span></span>
            <span class="ct">${recette.marina.orders} cmd</span>
            <span class="amt">${fmtMAD(recette.marina.especes + recette.marina.carte)}</span>
          </div>
          <div class="ft-split-row ${state.spot === 'achakar' ? '' : 'mut'}">
            <span class="who">${state.spot === 'achakar' ? '<i></i>' : ''}Plage Achakar <span>soir</span></span>
            <span class="ct">${recette.achakar.orders ? `${recette.achakar.orders} cmd` : 'dès 18:00'}</span>
            <span class="amt">${recette.achakar.orders ? fmtMAD(recette.achakar.especes + recette.achakar.carte) : '—'}</span>
          </div>
        </div>

        <div class="ft-rcard">
          <div class="ft-rcard-title"><i data-lucide="coins"></i> Par règlement</div>
          <div class="ft-bar">
            <i class="esp" style="width:${cashPct}%"></i><i class="crt" style="width:${100 - cashPct}%"></i>
          </div>
          <div class="ft-paykey"><span><i class="dot" style="background:var(--forest)"></i>Espèces</span><b>${fmtMAD(cash)}</b></div>
          <div class="ft-paykey"><span><i class="dot" style="background:var(--emerald);opacity:.55"></i>Carte (lecteur partenaire)</span><b>${fmtMAD(carte)}</b></div>
          <button class="ft-count-open" id="ft-count-open"><i data-lucide="coins"></i> Compter la caisse</button>
        </div>

        <div class="ft-rcard wide">
          <div class="ft-rcard-title"><i data-lucide="clipboard-check"></i> Articles vendus</div>
          ${soldRows.map(({ m, ct }) => `
            <div class="ft-sold-row">
              <span class="ft-sold-art">${ART[m.id] || ''}</span>
              <span class="ft-sold-name">${esc(m.label)}</span>
              <span class="ft-sold-track"><i style="width:${Math.round((ct / maxSold) * 100)}%"></i></span>
              <span class="ft-sold-ct">× ${ct}</span>
              <span class="ft-sold-amt">${fmtMAD(ct * m.price)}</span>
            </div>`).join('')}
        </div>

        <div class="ft-rcard wide">
          <div class="ft-rcard-title"><i data-lucide="history"></i> Dernières remises</div>
          ${SERVED.slice(0, 6).map((o) => `
            <div class="ft-split-row">
              <span class="who">${esc(o.name)} <span>${esc(itemsSummary(o))}</span></span>
              <span class="ct">${o.servedAt ? fmtTime(o.servedAt) : ''}</span>
              <span class="amt">${fmtMAD(o.total)}</span>
            </div>`).join('') || '<div class="ft-qempty">Aucune remise pour l\'instant.</div>'}
        </div>
      </div>`;
    icons();
  }

  /* ---------- comptage de caisse (espèces attendues vs comptées) ---------- */
  const DENOMS = [200, 100, 50, 20, 10, 5, 2, 1];

  function openCount() {
    const el = $('#ft-countm', root);
    const veil = openVeil('#ft-count-veil');
    const counts = Object.fromEntries(DENOMS.map((d) => [d, 0]));
    const expected = () => state.vitals.fonds + cashTotal();
    const counted = () => DENOMS.reduce((s, d) => s + d * counts[d], 0);

    el.innerHTML = `
      <button class="ft-modal-x" data-ft-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Compter la caisse</h3>
      <p class="modal-subtle">Attendu : fonds ${fmtMAD(state.vitals.fonds)} + espèces du jour ${fmtMAD(cashTotal())} = <b>${fmtMAD(expected())}</b></p>
      <div class="ft-dens">
        ${DENOMS.map((d) => `
          <div class="ft-den">
            <span class="ft-den-lbl">${d} MAD</span>
            <button data-den-minus="${d}" aria-label="Moins">−</button>
            <input class="ft-den-in" data-den="${d}" type="number" inputmode="numeric" min="0" value="0" />
            <button data-den-plus="${d}" aria-label="Plus">+</button>
            <span class="ft-den-tot" data-den-tot="${d}">0 MAD</span>
          </div>`).join('')}
      </div>
      <div class="ft-count-tot"><span>Compté</span><b id="ft-counted">0 MAD</b></div>
      <div class="ft-ecart bad" id="ft-ecart"><span>Écart</span><b id="ft-ecart-val"></b></div>
      <div class="ft-count-actions">
        <button class="ft-btn ghost" id="ft-count-fill">Pré-remplir l'attendu</button>
        <button class="ft-btn primary" id="ft-count-ok"><i data-lucide="check"></i> Clôturer le comptage</button>
      </div>`;
    icons();
    $$('[data-ft-close]', el).forEach((b) => { b.onclick = () => closeVeil(veil); });

    const refreshTotals = () => {
      DENOMS.forEach((d) => { $(`[data-den-tot="${d}"]`, el).textContent = fmtMAD(d * counts[d]); });
      const c = counted(), e = expected(), diff = c - e;
      $('#ft-counted', el).textContent = fmtMAD(c);
      const box = $('#ft-ecart', el);
      box.classList.toggle('bad', diff !== 0);
      $('#ft-ecart-val', el).textContent = diff === 0
        ? '0 MAD, nickel'
        : `${diff > 0 ? '+' : '−'}${fmtMAD(Math.abs(diff))}`;
    };

    el.onclick = (e) => {
      const minus = e.target.closest('[data-den-minus]');
      const plus  = e.target.closest('[data-den-plus]');
      if (!minus && !plus) return;
      const d = +(minus ? minus.dataset.denMinus : plus.dataset.denPlus);
      counts[d] = Math.max(0, counts[d] + (plus ? 1 : -1));
      $(`[data-den="${d}"]`, el).value = counts[d];
      refreshTotals();
    };
    $$('[data-den]', el).forEach((inp) => {
      inp.oninput = () => {
        counts[+inp.dataset.den] = Math.max(0, Math.floor(+inp.value || 0));
        refreshTotals();
      };
    });
    $('#ft-count-fill', el).onclick = () => {
      let rest = expected();
      DENOMS.forEach((d) => {
        counts[d] = Math.floor(rest / d);
        rest -= counts[d] * d;
        $(`[data-den="${d}"]`, el).value = counts[d];
      });
      refreshTotals();
      toast('Pré-rempli avec la répartition attendue, à vérifier billet par billet');
    };
    $('#ft-count-ok', el).onclick = () => {
      const diff = counted() - expected();
      closeVeil(veil);
      queueIfOffline('Comptage caisse');
      toast(diff === 0
        ? 'Comptage clôturé, écart 0 MAD, nickel'
        : `Comptage clôturé, écart ${diff > 0 ? '+' : '−'}${fmtMAD(Math.abs(diff))} noté`);
    };
    refreshTotals();
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
      toast('Mode hors-ligne, le camion continue de vendre, tout est mis en file');
    }
    renderNet();
  }

  function renderNet() {
    const net = $('#ft-net', root);
    net.classList.toggle('is-off', state.offline);
    $('.ft-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.ft-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'ft-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#ft-offline-note', root);
    note.hidden = !state.offline;
    $('#ft-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'foodtruck',
    greet: {
      line1: 'Sba7 lkhir Mika,',
      em: 'marhba.',
      sub: 'Karavan <em>·</em> service de midi, Marina Bay',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) renderAll(); },
  });
})();
