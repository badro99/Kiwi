/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PRESSING MODE — the laundry counter app inside kiwi-caisse.html
 * ---------------------------------------------------------------------------
 * PIN 0000 boots this terminal into a pressing (the kitchen display moved to
 * 0001). Any other code → restaurant caisse, untouched. One Kiwi, two métiers:
 * the demo story is an owner who runs his restaurant AND his pressing on the
 * same system, one login.
 *
 * Everything lives here: the module injects its own DOM (#pressing-screen)
 * into kiwi-caisse.html, reuses the caisse's modal kit classes (.modal-veil,
 * .modal, .ma-btn, .cash-*, .reader-*) + #toast-stack, and exposes
 * window.KiwiPressing.{unlock,lock}. No restaurant code is referenced.
 *
 * The headline differentiator: intake is a VISUAL grid of garment cards
 * (illustrations, not text lists) — tap a garment, configure service/couleur/
 * notes/photo état, and it lands on the running ticket. Per-piece waterproof
 * barcode tags (costume 3 pièces = 3 étiquettes), rack locations, phone-first
 * customer lookup, WhatsApp "c'est prêt", pay-on-pickup. V1 = operational
 * layer only: card payments just send the amount to the partner reader.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD  = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const icons   = () => { if (window.lucide) try { lucide.createIcons(); } catch (e) {} };
  const DAYS    = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS  = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2    = (n) => String(n).padStart(2, '0');
  const fmtDT   = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const H = 3600 * 1000;

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

  /* Deterministic pseudo-barcode (Code-39 lookalike) from a tag id. */
  function barcode(seed, h) {
    h = h || 30;
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

  /* ───────────────────────── garment line-art ─────────────────────────
     One visual voice: forest strokes, mint-tint fills, 64×64 grid.
     These ARE the menu — the photo-grid intake is the headline feature. */
  const art = (inner) => `<svg class="px-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    chemise: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3-5 5h-6z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12l6 8 6-8" /><path class="thin" d="M32 22v30"/><circle class="thin" cx="29.5" cy="28" r=".9"/><circle class="thin" cx="29.5" cy="36" r=".9"/><circle class="thin" cx="29.5" cy="44" r=".9"/>`),
    tshirt: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M22 12c2 3.5 10 3.5 12 0" transform="translate(4 0)"/>`),
    pull: art(`<path class="fill" d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3c-2 3.5-10 3.5-12 0z"/><path d="M22 12 16 15 9 25l8 5 3-4v28h24V26l3 4 8-5-7-10-6-3"/><path d="M26 12c1.5 3 10.5 3 12 0" /><path class="thin" d="M20 49h24M20 45.5h24"/><path class="thin" d="M16.5 28.5l3.5-2.5M47.5 28.5 44 26"/>`),
    veste: art(`<path class="fill" d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4-4-1c-2 3-8 3-12 0z"/><path d="M24 12l-7 4-7 11 8 5 3-4v26h22V28l3 4 8-5-7-11-7-4"/><path d="M26 11l6 13 6-13"/><path d="M32 24v30"/><circle class="thin" cx="35.5" cy="36" r="1.1"/>`),
    costume: art(`<path d="M32 5c-2.6 0-4 1.6-4 3.4 0 1.7 1.4 3 3.2 3.2L32 12"/><path d="M32 12l17 9H15z"/><path class="fill" d="M17 21l4 33h22l4-33z"/><path d="M17 21l4 33h22l4-33"/><path d="M25 21l7 11 7-11"/><path class="thin" d="M32 32v22"/>`),
    manteau: art(`<path class="fill" d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5-3-1c-2 3-9 3-13 0z"/><path d="M24 10l-8 5-6 11 8 5 2-3v30h24V28l2 3 8-5-6-11-8-5"/><path d="M26 9l6 11 6-11"/><path d="M20 40h24"/><path class="thin" d="M30 40h4v3h-4z"/><path class="thin" d="M32 20v34"/>`),
    pantalon: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M26.5 24v24M37.5 24v24"/>`),
    jean: art(`<path class="fill" d="M22 10h20v7l-2 37h-8l-2-26-2 26h-8l-2-37z"/><path d="M22 10h20v7H22z"/><path d="M22 17l-2 37h8l4-26 4 26h8l-2-37"/><path class="thin" d="M22 21c3 3 7 3 9 0M42 21c-3 3-7 3-9 0"/><circle class="thin" cx="32" cy="13.5" r="1"/>`),
    jupe: art(`<path d="M24 11h16l1 6H23z"/><path class="fill" d="M23 17 15 51c10 4 24 4 34 0l-8-34z"/><path d="M23 17 15 51c10 4 24 4 34 0l-8-34"/><path class="thin" d="M27 20l-4 30M37 20l4 30"/>`),
    short: art(`<path class="fill" d="M20 12h24v7l3 20H33l-1-11-1 11H17l3-20z"/><path d="M20 12h24v7H20z"/><path d="M20 19l-3 20h14l1-11 1 11h14l-3-20"/><path class="thin" d="M32 22v6"/>`),
    robe: art(`<path d="M27 9c1.5 2.6 8.5 2.6 10 0l4 7-2 9"/><path d="M27 9l-4 7 2 9"/><path class="fill" d="M25 25h14c6 9 8 17 8 27H17c0-10 2-18 8-27z"/><path d="M25 25c-6 9-8 17-8 27h30c0-10-2-18-8-27"/><path d="M25 25h14"/>`),
    robe_soiree: art(`<path d="M28 8c1.3 2.2 6.7 2.2 8 0l3 5-2 9"/><path d="M28 8l-3 5 2 9"/><path class="fill" d="M27 22h10l11 30c-10 4-22 4-32 0z"/><path d="M27 22 16 52c10 4 22 4 32 0L37 22"/><path d="M27 22h10"/><path class="thin" d="M30 30 24 50M36 32l5 16"/>`),
    caftan: art(`<path class="fill" d="M26 8h12l3 7v39H23V15z"/><path d="M26 8h12l3 7v39H23V15z"/><path d="M26 9 10 23l4 5 9-7"/><path d="M38 9l16 14-4 5-9-7"/><path d="M32 15v39"/><path class="thin" d="M29 20h6M29 25h6M29 30h6M29 35h6"/>`),
    drap: art(`<rect class="fill" x="10" y="17" width="44" height="30" rx="4"/><rect x="10" y="17" width="44" height="30" rx="4"/><path class="thin" d="M10 27h44M10 37h44"/>`),
    housse: art(`<rect class="fill" x="10" y="14" width="44" height="36" rx="4"/><rect x="10" y="14" width="44" height="36" rx="4"/><path class="thin" d="M10 16l22 16 22-16"/><circle class="thin" cx="24" cy="44" r="1"/><circle class="thin" cx="32" cy="44" r="1"/><circle class="thin" cx="40" cy="44" r="1"/>`),
    couverture: art(`<path class="fill" d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M12 30h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6v-6a6 6 0 0 1 6-6z"/><path d="M14 30c0-8 5-14 14-14h22v8H28"/><path class="thin" d="M6 39h52"/>`),
    nappe: art(`<path class="fill" d="M9 22h46l-5 22H14z"/><path d="M9 22h46l-5 22H14z"/><path d="M9 22l-3 9M55 22l3 9"/><path class="thin" d="M22 22l2 22M42 22l-2 22M12 33h40"/><path d="M18 44v10M46 44v10"/>`),
    rideaux: art(`<path d="M8 10h48"/><path class="fill" d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path d="M16 14h14v15c0 8-3 10-3 16 0 4 2 6 2 9-4 2-9 2-13 0 2-9 0-26 0-40z"/><path class="thin" d="M21 14v13M26 14v11"/><path d="M12 34c7 4 15 4 20-1"/><path class="thin" d="M40 14h8v40h-8c2-14 2-26 0-40z"/>`),
    tapis: art(`<circle class="fill" cx="19" cy="25" r="9.5"/><circle cx="19" cy="25" r="9.5"/><circle class="thin" cx="19" cy="25" r="4"/><path class="fill" d="M19 34.5h27l9 15H13z"/><path d="M28.5 25H46l9 15.5"/><path d="M19 34.5h27l9 15H13z"/><path class="thin" d="M22 54v4M30 54v4M38 54v4M46 54v4"/>`),
    veste_cuir: art(`<path class="fill" d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4-4-2c-2 3-8 3-12 0z"/><path d="M24 13l-8 4-6 10 8 5 3-4v26h22V28l3 4 8-5-6-10-8-4"/><path d="M25 12l4 6-3 5"/><path d="M39 12l-4 6 3 5"/><path d="M29 23l8 31"/><path class="thin" d="M31 28l3-1M33 35l3-1M35 42l3-1"/><circle class="thin" cx="24" cy="20" r="1"/><circle class="thin" cx="40" cy="20" r="1"/>`),
    daim: art(`<path class="fill" d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4-3-1c-2 3-9 3-13 0z"/><path d="M24 12l-8 4-6 10 8 5 3-4v27h22V27l3 4 8-5-6-10-8-4"/><path d="M26 11c2 3 10 3 12 0"/><path d="M21 38h22"/><path class="thin" d="M24 38v8M28 38v7M32 38v8M36 38v7M40 38v8"/>`),
    doudoune: art(`<path class="fill" d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6-3-1c-2 3-10 3-12 0z"/><path d="M23 12l-9 6-2 10 7 3v23h26V31l7-3-2-10-9-6"/><path d="M26 11c1.5 3 10.5 3 12 0"/><path class="thin" d="M19 24c8 3 18 3 26 0M19 32c8 3 18 3 26 0M19 40c8 3 18 3 26 0M19 47.5c8 3 18 3 26 0"/><path d="M32 14v40"/>`),
    chaussures: art(`<path class="fill" d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 43c0-7 7-9 13-13 4-2.7 5.5-7 11-7 3.5 0 5 2 7 5.5 2 4 9 5 13 9.5v7H9z"/><path d="M9 45h44"/><path class="thin" d="M27 30l4 3M24 33l4 3M21 36l4 3"/>`),
    baskets: art(`<path class="fill" d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44c0-6 6-8 12-11 5-2.4 6.5-7 11-7 3 0 4 2.6 7 4.6 4 2.6 13 3.4 18 8.4v5H8z"/><path d="M8 44h48v3c-18 3-32 3-48 0z"/><path class="thin" d="M26 29l4 3M23 32l4 3"/><path class="thin" d="M38 31c-3 5-8 7-14 7"/>`),
    babouches: art(`<path class="fill" d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path d="M10 40c0-3 3-4.6 8-5.4l22-3.6c8-1.3 14 1.6 14 5.5 0 3.6-4 5.5-10 5.5H14c-2.6 0-4-.8-4-2z"/><path class="thin" d="M26 34.5c4 1.5 6 4 6 7.5"/><path class="thin" d="M40 32.6c-1 4.4-1 6.6 0 9.4"/>`),
  };

  /* ───────────────────────── services + price list ─────────────────────────
     Per garment × service — same garment, different service = different price.
     A missing key = service not offered for that garment. MAD, Tanger 2026. */
  /* Services are COMBINABLE on one garment (lavage + repassage is the
     classic ask) — prices add up. Two real-world exclusions: le nettoyage
     à sec est un procédé complet (il inclut le repassage) et ne se cumule
     jamais avec le lavage à l'eau. Détachage / retouche stack with anything. */
  const SERVICES = [
    { id: 'sec',       label: 'Nettoyage à sec', short: 'À sec',     code: 'SEC' },
    { id: 'lavage',    label: 'Lavage',          short: 'Lavage',    code: 'LAV' },
    { id: 'repassage', label: 'Repassage',       short: 'Repassage', code: 'REP' },
    { id: 'detachage', label: 'Détachage',       short: 'Détachage', code: 'DET' },
    { id: 'retouche',  label: 'Retouche',        short: 'Retouche',  code: 'RET' },
  ];
  const SVC = Object.fromEntries(SERVICES.map((s) => [s.id, s]));
  const SVC_CONFLICTS = { sec: ['lavage', 'repassage'], lavage: ['sec'], repassage: ['sec'] };
  const svcCodes  = (svcs) => svcs.map((s) => SVC[s].code).join('+');
  const svcShorts = (svcs) => svcs.map((s) => SVC[s].short).join(' + ');

  const CATALOG = [
    { id: 'hauts', label: 'Hauts', items: [
      { id: 'chemise',  label: 'Chemise',  prices: { sec: 25, lavage: 18, repassage: 10, detachage: 30, retouche: 35 } },
      { id: 'tshirt',   label: 'T-shirt',  prices: { lavage: 14, repassage: 8, detachage: 22, sec: 20 } },
      { id: 'pull',     label: 'Pull',     prices: { sec: 30, lavage: 22, repassage: 12, detachage: 35, retouche: 40 } },
      { id: 'veste',    label: 'Veste',    prices: { sec: 45, repassage: 20, detachage: 50, retouche: 60 } },
      { id: 'costume',  label: 'Costume', flag: 'multi-pièces',
        variants: [
          { id: '2p', label: '2 pièces', pieces: ['Veste', 'Pantalon'],          prices: { sec: 70, repassage: 35, detachage: 80, retouche: 80 } },
          { id: '3p', label: '3 pièces', pieces: ['Veste', 'Pantalon', 'Gilet'], prices: { sec: 90, repassage: 45, detachage: 100, retouche: 90 } },
        ] },
      { id: 'manteau',  label: 'Manteau',  prices: { sec: 60, repassage: 25, detachage: 65, retouche: 70 } },
    ] },
    { id: 'bas', label: 'Bas', items: [
      { id: 'pantalon', label: 'Pantalon', prices: { sec: 28, lavage: 18, repassage: 12, detachage: 32, retouche: 30 } },
      { id: 'jean',     label: 'Jean',     prices: { lavage: 20, repassage: 12, sec: 30, detachage: 35, retouche: 30 } },
      { id: 'jupe',     label: 'Jupe',     prices: { sec: 26, lavage: 18, repassage: 12, detachage: 30, retouche: 35 } },
      { id: 'short',    label: 'Short',    prices: { lavage: 12, repassage: 8, sec: 18, detachage: 20, retouche: 25 } },
    ] },
    { id: 'robes', label: 'Robes & tenues', items: [
      { id: 'robe',        label: 'Robe',           prices: { sec: 40, lavage: 30, repassage: 18, detachage: 45, retouche: 50 } },
      { id: 'robe_soiree', label: 'Robe de soirée', flag: 'délicat', prices: { sec: 90, repassage: 40, detachage: 100, retouche: 80 } },
      { id: 'caftan',      label: 'Caftan · takchita', flag: 'main', prices: { sec: 120, repassage: 60, detachage: 130, retouche: 100 } },
    ] },
    { id: 'linge', label: 'Linge de maison', items: [
      { id: 'drap',       label: 'Drap',             def: 'lavage', prices: { lavage: 15, repassage: 10, sec: 25 } },
      { id: 'housse',     label: 'Housse de couette', def: 'lavage', prices: { lavage: 25, repassage: 15, sec: 35 } },
      { id: 'couverture', label: 'Couverture',        def: 'lavage', prices: { lavage: 45, sec: 60 } },
      { id: 'nappe',      label: 'Nappe',             def: 'lavage', prices: { lavage: 20, repassage: 12, sec: 30, detachage: 28 } },
      { id: 'rideaux',    label: 'Rideaux', sub: 'par panneau', def: 'sec', prices: { sec: 50, lavage: 35, repassage: 20 } },
      { id: 'tapis',      label: 'Tapis', flag: 'au m²', def: 'lavage',
        variants: [
          { id: 's', label: 'Petit · < 2 m²',  prices: { lavage: 80 } },
          { id: 'm', label: 'Moyen · 2–4 m²',  prices: { lavage: 140 } },
          { id: 'l', label: 'Grand · > 4 m²',  prices: { lavage: 220 } },
        ] },
    ] },
    { id: 'cuir', label: 'Cuir & spécial', items: [
      { id: 'veste_cuir', label: 'Veste cuir', flag: '72 h', prices: { sec: 180, detachage: 200, retouche: 90 } },
      { id: 'daim',       label: 'Daim',       flag: '72 h', prices: { sec: 200, detachage: 220 } },
      { id: 'doudoune',   label: 'Doudoune',   prices: { lavage: 70, sec: 90, retouche: 60 } },
    ] },
    { id: 'chaussures', label: 'Chaussures', items: [
      { id: 'chaussures', label: 'Chaussures cuir', sub: 'la paire', def: 'sec', prices: { sec: 80 } },
      { id: 'baskets',    label: 'Baskets', sub: 'la paire',         def: 'lavage', prices: { lavage: 70 } },
      { id: 'babouches',  label: 'Babouches', sub: 'la paire',       def: 'sec', prices: { sec: 50 } },
    ] },
  ];
  const ITEMS = {};
  CATALOG.forEach((c) => c.items.forEach((it) => { it.cat = c.id; ITEMS[it.id] = it; }));

  function priceTable(item, variantId) {
    if (item.variants) {
      const v = item.variants.find((x) => x.id === variantId) || item.variants[0];
      return v.prices;
    }
    return item.prices;
  }
  function minPrice(item) {
    const tables = item.variants ? item.variants.map((v) => v.prices) : [item.prices];
    return Math.min(...tables.flatMap((t) => Object.values(t)));
  }
  function availServices(item, variantId) {
    const t = priceTable(item, variantId);
    return SERVICES.filter((s) => t[s.id] != null);
  }

  const COLORS = [
    { id: 'blanc',  label: 'Blanc',  hex: '#FFFFFF' },
    { id: 'noir',   label: 'Noir',   hex: '#1F2421' },
    { id: 'gris',   label: 'Gris',   hex: '#9AA09D' },
    { id: 'bleu',   label: 'Bleu',   hex: '#33588C' },
    { id: 'rouge',  label: 'Rouge',  hex: '#A8423A' },
    { id: 'beige',  label: 'Beige',  hex: '#D9C7A7' },
    { id: 'vert',   label: 'Vert',   hex: '#3E6B52' },
    { id: 'marron', label: 'Marron', hex: '#6E4F37' },
  ];
  const COLOR = Object.fromEntries(COLORS.map((c) => [c.id, c]));
  const NOTES = ['Tache col', 'Tache manche', 'Bouton manquant', 'Ourlet à reprendre', 'Fermeture abîmée', 'Délicat'];

  /* ───────────────────────── clients (Tanger) ───────────────────────── */
  /* Real/paired store never shows the demo "Pressing Marshan" customers, orders
     or name — it opens on its own empty counter. Local pitch demo unchanged.
     (Mirrors the pvReal() gate every other vertical uses.) */
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { var p = pvPaired(); return (p && p.name) || (pvReal() ? 'Mon pressing' : demo); }

  const CUSTOMERS = pvReal() ? [] : [
    { id: 'c1', name: 'Amal Berrada',         phone: '0661 23 45 67', orders: 23, prefs: ['Repassage sur cintre', 'Sans amidon'] },
    { id: 'c2', name: 'Youssef El Khattabi',  phone: '0670 11 22 33', orders: 14, prefs: ['Costumes pliés en housse'] },
    { id: 'hb', name: 'Hôtel Bab El Bahr',    phone: '0539 33 44 55', orders: 46, b2b: true, prefs: ['Facture fin de mois', 'Remise –15 % négociée'], contact: 'Gouvernante · Mme Rkia' },
    { id: 'c3', name: 'Fatima-Zahra Lamrani', phone: '0650 88 77 66', orders: 9,  prefs: ['Caftans, nettoyage main', 'Pas de perchlo (allergie)'] },
    { id: 'c4', name: 'Mehdi Bennani',        phone: '0662 09 18 27', orders: 2,  prefs: [] },
    { id: 'c5', name: 'Khadija Tazi',         phone: '0668 54 32 10', orders: 6,  prefs: ['Rideaux par panneau'] },
    { id: 'c6', name: 'Omar Sefrioui',        phone: '0677 65 43 21', orders: 31, prefs: ['10 chemises chaque lundi'] },
  ];
  const CUST = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));
  const B2B_REMISE = 0.15;

  /* ───────────────────────── orders (seed) ─────────────────────────
     Statuses: recu → trait → pret → livre. Status lives on each PIECE —
     a pressing tracks garments, not just tickets. Order status = derived. */
  const STATUS = {
    recu:  { label: 'Reçu',          dot: 'recu'  },
    trait: { label: 'En traitement', dot: 'trait' },
    pret:  { label: 'Prêt',          dot: 'pret'  },
    livre: { label: 'Livré',         dot: 'livre' },
  };
  const STATUS_FLOW = ['recu', 'trait', 'pret', 'livre'];

  let pieceSeqGlobal = 0;
  function buildPieces(orderId, lines, statuses) {
    const pieces = []; let n = 0;
    lines.forEach((ln, li) => {
      const item = ITEMS[ln.itemId];
      const labels = (item.variants && (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]).pieces) || null;
      for (let q = 0; q < ln.qty; q++) {
        (labels || [null]).forEach((plabel) => {
          n++;
          pieces.push({
            pid: `${orderId}-${n}`, n, lineIdx: li,
            label: plabel ? `${item.label} · ${plabel}` : item.label,
            itemId: ln.itemId, svcs: ln.services, color: ln.color,
            status: (statuses && statuses[n - 1]) || 'recu',
            photos: ln.photos || 0,
          });
        });
      }
    });
    pieces.forEach((p) => { p.of = pieces.length; });
    return pieces;
  }
  function lineTotal(ln) {
    const t = priceTable(ITEMS[ln.itemId], ln.variantId);
    return ln.services.reduce((s, sv) => s + (t[sv] || 0), 0) * ln.qty;
  }
  function orderTotals(o) {
    const sub = o.lines.reduce((s, ln) => s + lineTotal(ln), 0);
    const remise = o.b2b ? Math.round(sub * B2B_REMISE) : 0;
    return { sub, remise, total: sub - remise };
  }
  function orderStatus(o) {
    const st = o.pieces.map((p) => p.status);
    if (st.every((s) => s === 'livre')) return 'livre';
    if (st.every((s) => s === 'pret' || s === 'livre')) return 'pret';
    if (st.some((s) => s === 'trait' || s === 'pret')) return 'trait';
    return 'recu';
  }
  function isLate(o) {
    const s = orderStatus(o);
    return (s === 'recu' || s === 'trait') && o.readyAt.getTime() < Date.now();
  }

  const NOW = Date.now();
  function mkOrder(cfg) {
    const o = {
      id: cfg.id, custId: cfg.custId || null, guest: cfg.guest || null,
      b2b: !!(cfg.custId && CUST[cfg.custId] && CUST[cfg.custId].b2b),
      lines: cfg.lines.map((l) => ({ itemId: l[0], services: Array.isArray(l[1]) ? l[1] : [l[1]], qty: l[2], color: l[3], notes: l[4] || [], freeNote: l[5] || '', photos: l[6] || 0, variantId: l[7] || null })),
      droppedAt: new Date(NOW - cfg.droppedH * H),
      readyAt:   new Date(NOW + cfg.readyH * H),
      pay: cfg.pay,           /* {mode:'now'|'acompte'|'pickup'|'compte', method, paid} */
      rack: cfg.rack || null,
      notified: !!cfg.notified,
      collectedAt: cfg.collectedH != null ? new Date(NOW - cfg.collectedH * H) : null,
    };
    o.pieces = buildPieces(o.id, o.lines, null);
    if (cfg.status) o.pieces.forEach((p) => { p.status = cfg.status; });
    if (cfg.statuses) o.pieces.forEach((p, i) => { p.status = cfg.statuses[Math.min(i, cfg.statuses.length - 1)]; });
    return o;
  }

  const ORDERS = pvReal() ? [] : [
    /* ── reçu ── */
    mkOrder({ id: 'P-1044', custId: 'c4', droppedH: 0.6, readyH: 47, status: 'recu',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['jean', 'lavage', 2, 'bleu'], ['pull', 'sec', 1, 'gris', ['Tache manche'], '', 1]] }),
    mkOrder({ id: 'P-1043', custId: 'c1', droppedH: 1.4, readyH: 46, status: 'recu',
      pay: { mode: 'acompte', method: 'especes', paid: 40 },
      lines: [['chemise', ['lavage', 'repassage'], 4, 'blanc'], ['robe', 'sec', 1, 'rouge', ['Délicat'], '', 2]] }),
    mkOrder({ id: 'P-1042', custId: 'c6', droppedH: 2.5, readyH: 22, status: 'recu',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['chemise', 'repassage', 10, 'blanc', [], 'Lot du lundi'], ['pantalon', 'repassage', 2, 'noir']] }),
    /* ── en traitement ── */
    mkOrder({ id: 'P-1041', custId: 'c2', droppedH: 6, readyH: 26, statuses: ['trait', 'trait', 'trait', 'recu'],
      pay: { mode: 'now', method: 'carte', paid: 170 },
      lines: [['costume', 'sec', 1, 'bleu', [], '', 1, '3p'], ['veste_cuir', 'sec', 1, 'noir', ['Délicat'], 'Col élimé', 2]] }),
    mkOrder({ id: 'P-1040', custId: 'hb', droppedH: 8, readyH: 16, status: 'trait',
      pay: { mode: 'compte', method: 'compte', paid: 0 },
      lines: [['drap', 'lavage', 12, 'blanc'], ['nappe', 'lavage', 6, 'blanc'], ['housse', 'lavage', 4, 'blanc']] }),
    mkOrder({ id: 'P-1039', custId: 'c3', droppedH: 20, readyH: 28, statuses: ['trait', 'pret'],
      pay: { mode: 'acompte', method: 'especes', paid: 100 },
      lines: [['caftan', 'sec', 1, 'vert', ['Délicat'], 'Sfifa fragile, nettoyage main', 3], ['robe_soiree', 'sec', 1, 'noir', [], '', 1]] }),
    mkOrder({ id: 'P-1032', custId: 'c5', droppedH: 50, readyH: -14, status: 'trait',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['rideaux', 'sec', 4, 'beige', [], 'Salon, 4 panneaux'], ['couverture', 'lavage', 1, 'marron']] }),
    /* ── prêt ── */
    mkOrder({ id: 'P-1038', custId: 'c1', droppedH: 30, readyH: -2, status: 'pret', rack: 'A-04', notified: true,
      pay: { mode: 'now', method: 'especes', paid: 56 },
      lines: [['pantalon', 'sec', 2, 'noir']] }),
    mkOrder({ id: 'P-1037', custId: 'c6', droppedH: 32, readyH: -1, status: 'pret', rack: 'B-07',
      pay: { mode: 'pickup', method: null, paid: 0 },
      lines: [['chemise', ['lavage', 'repassage'], 8, 'blanc'], ['veste', 'sec', 1, 'gris']] }),
    mkOrder({ id: 'P-1036', custId: 'c4', droppedH: 26, readyH: -4, status: 'pret',
      pay: { mode: 'acompte', method: 'carte', paid: 30 },
      lines: [['doudoune', 'lavage', 1, 'noir', [], '', 1], ['tshirt', 'lavage', 3, 'blanc']] }),
    /* ── livré ── */
    mkOrder({ id: 'P-1035', custId: 'c2', droppedH: 54, readyH: -8, status: 'livre', collectedH: 5, notified: true,
      pay: { mode: 'now', method: 'carte', paid: 105 },
      lines: [['costume', 'repassage', 1, 'gris', [], '', 0, '2p'], ['chemise', 'repassage', 7, 'blanc']] }),
    mkOrder({ id: 'P-1031', custId: 'c5', droppedH: 76, readyH: -30, status: 'livre', collectedH: 26, notified: true,
      pay: { mode: 'now', method: 'especes', paid: 92 },
      lines: [['jupe', 'sec', 2, 'noir'], ['babouches', 'sec', 1, 'beige']] }),
  ];

  /* rack — rails A/B/C × 12 positions */
  const RAILS = ['A', 'B', 'C'];
  const RAIL_SIZE = 12;
  const rackSlots = {};                  /* 'B-07' → orderId */
  ORDERS.forEach((o) => { if (o.rack) rackSlots[o.rack] = o.id; });

  /* ───────────────────────── state ───────────────────────── */
  let ticketSeq = 1045;
  const state = {
    view: 'comptoir',
    cat: 'tous',
    ticket: null,            /* { num, lines:[], customer, ready } */
    boardQuery: '',
    rtQuery: '', rtOrder: null,
    rackSelect: null,
    offline: false, queued: 0,
    unlocked: false,
  };
  function freshTicket() {
    state.ticket = { num: posRef(`P-${ticketSeq}`), lines: [], customer: null, ready: suggestReady() };
  }
  function suggestReady() {
    const d = new Date(Date.now() + 48 * H);
    d.setHours(18, 0, 0, 0);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);   /* dimanche → lundi */
    return d;
  }
  function findOrder(id) { return ORDERS.find((o) => o.id === id); }
  function custOf(o) {
    if (o.custId) return CUST[o.custId];
    return o.guest || { name: 'Client de passage', phone: '' };
  }
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  const tkLabel = (o) => {
    const l = o.lines[0];
    if (!l) return 'Pressing';
    const nm = ITEMS[l.itemId] ? ITEMS[l.itemId].label : 'Pressing';
    const n = o.lines.reduce((s, x) => s + x.qty, 0);
    return o.lines.length > 1 ? `${nm} +${n - l.qty} pièces` : nm;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le comptoir encaissait dans o.pay, et ORDERS meurt avec l'onglet : la
     recette du jour n'existait nulle part. Démo : no-op. */
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('pressing', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de bon repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à P-1045 et deux commandes différentes portent le
     même numéro, sur les pièces comme sur le rack. Démo : aucun effet. */
  try { if (window.KiwiPosSale) ticketSeq = window.KiwiPosSale.nextSeq('pressing', ticketSeq); } catch (_) {}

  /* ═══════════════════════ ROOT INJECTION ═══════════════════════ */
  let root = null;
  function injectRoot() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'px-screen';
    root.id = 'pressing-screen';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <aside class="px-rail">
        <div class="px-brand">kiwi<i></i></div>
        <div class="px-venue">
          <div class="px-venue-name">${esc(pvName('Pressing Marshan'))}</div>
          <div class="px-venue-sub">${pvReal() ? esc((pvPaired() || {}).location || '') : 'Tanger · Marshan<br>Le même Kiwi que <b>votre restaurant</b>, un seul compte.'}</div>
        </div>
        <nav class="px-nav" id="px-nav">
          <button class="px-nav-it on" data-px-view="comptoir"><i data-lucide="shirt"></i><span>Comptoir</span></button>
          <button class="px-nav-it" data-px-view="commandes"><i data-lucide="clipboard-list"></i><span>Commandes</span><b class="px-nav-badge" id="px-badge-cmd"></b></button>
          <button class="px-nav-it" data-px-view="retrait"><i data-lucide="shopping-bag"></i><span>Retrait</span><b class="px-nav-badge" id="px-badge-rt"></b></button>
          <button class="px-nav-it" data-px-view="rangement"><i data-lucide="archive"></i><span>Rangement</span><b class="px-nav-badge" id="px-badge-rack"></b></button>
        </nav>
        <div class="px-rail-foot">
          <button class="px-net" id="px-net" title="Simuler une coupure réseau">
            <i class="px-net-dot"></i><span class="px-net-label">En ligne</span>
          </button>
          <button class="px-lock" id="px-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="px-main">
        <div class="px-offline-note" id="px-offline-note" hidden>
          Hors-ligne, les actions sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="px-queue-count"></b>
        </div>
        <section class="px-view is-on" data-px-panel="comptoir">
          <div class="px-intake">
            <header class="px-head">
              <div><h1>Comptoir de dépôt</h1><div class="px-head-sub" id="px-today"></div></div>
              <div class="px-head-hint">Touchez un article pour l'ajouter au ticket</div>
            </header>
            <div class="px-cats" id="px-cats"></div>
            <div class="px-grid-scroll" id="px-gridwrap"></div>
          </div>
          <aside class="px-ticket" id="px-ticket"></aside>
        </section>
        <section class="px-view" data-px-panel="commandes"></section>
        <section class="px-view" data-px-panel="retrait"></section>
        <section class="px-view" data-px-panel="rangement"></section>
      </main>
      <div class="modal-veil" id="px-sheet-veil"><div class="modal px-sheet px-rel" id="px-sheet"></div></div>
      <div class="modal-veil" id="px-client-veil"><div class="modal px-client px-rel" id="px-clientm"></div></div>
      <div class="modal-veil" id="px-date-veil"><div class="modal px-datem px-rel" id="px-datemm"></div></div>
      <div class="modal-veil" id="px-tags-veil"><div class="modal px-tags px-rel" id="px-tagsm"></div></div>
      <div class="modal-veil" id="px-pay-veil"><div class="modal px-pay px-rel" id="px-paym"></div></div>
      <div class="modal-veil" id="px-detail-veil"><div class="modal px-detail px-rel" id="px-detailm"></div></div>
      <div class="modal-veil" id="px-wa-veil"><div class="modal px-wa px-rel" id="px-wam"></div></div>
      <div class="modal-veil" id="px-photo-veil"><div class="modal px-photo" id="px-photom"></div></div>
      <div class="modal-veil" id="px-scan-veil"><div class="modal px-scan px-rel" id="px-scanm"></div></div>`;
    document.body.appendChild(root);

    $('#px-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-px-view]');
      if (b) switchView(b.dataset.pxView);
    });
    $('#px-lock', root).addEventListener('click', lock);
    // Le pressing n'passe pas par le dispatcher : il pose son « Rafraîchir »
    // lui-même, dans le même pied de rail (assets/caisse-refresh.js).
    try { if (window.KiwiCaisseRefresh) window.KiwiCaisseRefresh.mount(root); } catch (_) {}
    $('#px-net', root).addEventListener('click', toggleOffline);
    /* fermer un modal en cliquant le voile */
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ UNLOCK / LOCK ═══════════════════════ */
  function unlock() {
    injectRoot();
    const pinScreen = $('#pin-screen');
    $$('#pin-dots .pin-dot').forEach((d, i) => setTimeout(() => d.classList.add('is-success'), i * 70));
    setTimeout(() => {
      if (pinScreen) pinScreen.classList.add('is-leaving');
      document.body.classList.add('is-pressing', 'is-unlocked');
    }, 460);
    setTimeout(() => {
      if (pinScreen) pinScreen.style.display = 'none';
      entryFlash();
    }, 940);
  }

  /* Greeting flash — same ritual as the cashier entry, pressing voice. */
  function entryFlash() {
    const g = document.createElement('div');
    g.className = 'kiwi-greet';
    g.setAttribute('aria-hidden', 'true');
    g.innerHTML = `<div class="kiwi-greet-inner">
      <h1>Sba7 lkhir${pvReal() ? '' : ' Sanae'}, <em>marhba.</em></h1>
      <div class="kiwi-greet-sub">${esc(pvName('Pressing Marshan'))} <em>·</em> comptoir de dépôt</div>
    </div>`;
    document.body.appendChild(g);
    requestAnimationFrame(() => { g.classList.add('is-visible'); g.setAttribute('aria-hidden', 'false'); });
    setTimeout(() => {
      g.classList.remove('is-visible');
      showApp();
    }, 2150);
    setTimeout(() => g.remove(), 3000);
  }

  function showApp() {
    state.unlocked = true;
    if (!state.ticket) freshTicket();
    root.classList.add('is-entering');
    root.setAttribute('aria-hidden', 'false');
    setTimeout(() => root.classList.remove('is-entering'), 700);
    renderAll();
  }

  function lock() {
    document.body.classList.remove('is-pressing', 'is-unlocked');
    root.setAttribute('aria-hidden', 'true');
    $$('.modal-veil.is-open', root).forEach((v) => v.classList.remove('is-open'));
    if (typeof window.__kiwiPinReset === 'function') window.__kiwiPinReset();
    toast('Terminal verrouillé');
  }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.px-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.pxView === view));
    $$('.px-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.pxPanel === view));
    if (view === 'commandes') renderBoard();
    if (view === 'retrait') renderRetrait();
    if (view === 'rangement') renderRack();
    icons();
  }
  function renderBadges() {
    const active = ORDERS.filter((o) => orderStatus(o) !== 'livre').length;
    const prets  = ORDERS.filter((o) => orderStatus(o) === 'pret').length;
    const toRack = ORDERS.filter((o) => orderStatus(o) === 'pret' && !o.rack).length;
    $('#px-badge-cmd', root).textContent = active || '';
    $('#px-badge-rt', root).textContent = prets || '';
    $('#px-badge-rack', root).textContent = toRack || '';
    $('#px-badge-cmd', root).style.display = active ? '' : 'none';
    $('#px-badge-rt', root).style.display = prets ? '' : 'none';
    $('#px-badge-rack', root).style.display = toRack ? '' : 'none';
  }

  function renderAll() {
    $('#px-today', root).textContent = fmtDT(new Date());
    renderCats();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ COMPTOIR — the visual intake grid ═══════════════════════ */
  function renderCats() {
    const counts = Object.fromEntries(CATALOG.map((c) => [c.id, c.items.length]));
    const all = CATALOG.reduce((s, c) => s + c.items.length, 0);
    $('#px-cats', root).innerHTML =
      `<button class="px-cat ${state.cat === 'tous' ? 'on' : ''}" data-px-cat="tous">Tous <span class="px-cat-ct">${all}</span></button>` +
      CATALOG.map((c) =>
        `<button class="px-cat ${state.cat === c.id ? 'on' : ''}" data-px-cat="${c.id}">${esc(c.label)} <span class="px-cat-ct">${counts[c.id]}</span></button>`
      ).join('');
    $('#px-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-px-cat]');
      if (!b) return;
      state.cat = b.dataset.pxCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function renderGrid() {
    const cats = state.cat === 'tous' ? CATALOG : CATALOG.filter((c) => c.id === state.cat);
    let i = 0;
    $('#px-gridwrap', root).innerHTML = cats.map((c) => `
      <div class="px-cat-head">${esc(c.label)}</div>
      <div class="px-grid">${c.items.map((it) => `
        <button class="px-card" data-px-item="${it.id}" style="--i:${i++}">
          <span class="px-card-art">${ART[it.id] || ''}</span>
          <span class="px-card-name">${esc(it.label)}</span>
          <span class="px-card-price">dès ${minPrice(it)} MAD${it.sub ? ` · ${esc(it.sub)}` : ''}</span>
          ${it.flag ? `<span class="px-card-flag">${esc(it.flag)}</span>` : ''}
        </button>`).join('')}
      </div>`).join('');
    $('#px-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-px-item]');
      if (b) openSheet(b.dataset.pxItem);
    };
  }

  /* ═══════════════════════ TICKET (running) ═══════════════════════ */
  function ticketCount(t) {
    return t.lines.reduce((s, ln) => {
      const item = ITEMS[ln.itemId];
      const per = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]).pieces.length : 1;
      return s + ln.qty * per;
    }, 0);
  }
  function ticketTotals(t) {
    const sub = t.lines.reduce((s, ln) => s + lineTotal(ln), 0);
    const b2b = t.customer && t.customer.type === 'known' && CUST[t.customer.id] && CUST[t.customer.id].b2b;
    const remise = b2b ? Math.round(sub * B2B_REMISE) : 0;
    return { sub, remise, total: sub - remise, b2b };
  }

  function customerRow(t) {
    if (!t.customer) {
      return `<button class="px-tk-row" id="px-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher un client</b><span>Recherche par téléphone, jamais par ticket</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.customer.type === 'guest') {
      return `<button class="px-tk-row is-set" id="px-tk-client"><i data-lucide="user"></i>
        <span class="l"><b>Client de passage</b><span>Sans fiche, retrouvable par n° de ticket</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = t.customer.type === 'known' ? CUST[t.customer.id] : t.customer;
    const prefs = (c.prefs && c.prefs.length) ? ` · ${c.prefs[0]}` : '';
    return `<button class="px-tk-row is-set" id="px-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${esc(c.phone || 'sans téléphone')}${c.orders ? ` · ${c.orders} commandes` : ' · nouveau'}${esc(prefs)}</span></span>
      ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const { remise, total, b2b } = ticketTotals(t);
    const count = ticketCount(t);
    const el = $('#px-ticket', root);
    el.innerHTML = `
      <div class="px-tk-head">
        <div><span class="px-tk-title">Ticket</span> <span class="px-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="px-tk-reset" id="px-tk-reset">Vider</button>` : ''}
      </div>
      <div class="px-tk-meta">
        ${customerRow(t)}
        <button class="px-tk-row ${t.ready ? 'is-set' : ''}" id="px-tk-date"><i data-lucide="calendar-clock"></i>
          <span class="l"><b>Prêt le ${esc(fmtDT(t.ready))}</b><span>Date promise, modifiable</span></span>
          <span class="edit">Modifier</span></button>
      </div>
      <div class="px-tk-lines" id="px-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="px-tk-empty">
            <i data-lucide="shirt"></i>
            <div>Le ticket est vide.<br>Touchez un vêtement dans la grille, chaque pièce recevra son étiquette.</div>
          </div>`}
      </div>
      <div class="px-tk-foot">
        <div class="px-tk-tot">
          <span class="pcs"><i data-lucide="tag"></i> ${count} pièce${count > 1 ? 's' : ''} · ${count} étiquette${count > 1 ? 's' : ''}</span>
          ${remise ? `<span>Remise B2B –15 % · −${fmtMAD(remise).replace(' MAD', '')} MAD</span>` : ''}
        </div>
        <div class="px-tk-total"><span class="lbl">Total${b2b ? ' (remisé)' : ''}</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="px-validate" id="px-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="tags"></i> Valider · étiquettes &amp; ticket
        </button>
      </div>`;
    const reset = $('#px-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); };
    $('#px-tk-client', el).onclick = openClient;
    $('#px-tk-date', el).onclick = openDate;
    $('#px-validate', el).onclick = validateTicket;
    $('#px-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-px-minus]');
      const plus = e.target.closest('[data-px-plus]');
      const idx = minus ? +minus.dataset.pxMinus : plus ? +plus.dataset.pxPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) ln.qty++;
      else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons();
    };
    icons();
  }

  function lineRow(ln, i) {
    const item = ITEMS[ln.itemId];
    const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]) : null;
    const notesCt = ln.notes.length + (ln.freeNote ? 1 : 0);
    return `<div class="px-line">
      <span class="px-line-art">${ART[ln.itemId] || ''}</span>
      <span class="px-line-mid">
        <span class="px-line-name">${esc(item.label)}${variant ? ` · ${esc(variant.label)}` : ''}</span>
        <span class="px-line-sub">
          <i class="dot" style="background:${COLOR[ln.color] ? COLOR[ln.color].hex : '#ccc'}"></i>
          <span class="svc">${svcCodes(ln.services)}</span> ${esc(svcShorts(ln.services))}
          ${notesCt ? `<span class="meta"><i data-lucide="sticky-note"></i>${notesCt}</span>` : ''}
          ${ln.photos ? `<span class="meta"><i data-lucide="camera"></i>${ln.photos}</span>` : ''}
        </span>
      </span>
      <span class="px-line-right">
        <span class="px-line-price">${fmtMAD(lineTotal(ln))}</span>
        <span class="px-line-qty">
          <button data-px-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-px-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* ═══════════════════════ CONFIG SHEET ═══════════════════════ */
  const sheet = { itemId: null, services: [], variantId: null, qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0 };

  function defaultService(item, variantId) {
    const avail = availServices(item, variantId);
    return (item.def && avail.some((s) => s.id === item.def)) ? item.def : avail[0].id;
  }

  function openSheet(itemId) {
    const item = ITEMS[itemId];
    Object.assign(sheet, {
      itemId,
      variantId: item.variants ? item.variants[0].id : null,
      services: [], qty: 1, color: 'blanc', notes: [], freeNote: '', photos: 0,
    });
    sheet.services = [defaultService(item, sheet.variantId)];
    renderSheet();
    openVeil('#px-sheet-veil');
    icons();
    if (window.KiwiLens) KiwiLens.rescan();
  }

  function sheetUnit() {
    const t = priceTable(ITEMS[sheet.itemId], sheet.variantId);
    return sheet.services.reduce((s, sv) => s + (t[sv] || 0), 0);
  }

  function renderSheet() {
    const item = ITEMS[sheet.itemId];
    const avail = availServices(item, sheet.variantId);
    /* un changement de variante peut retirer des services du tarif */
    sheet.services = sheet.services.filter((sv) => avail.some((s) => s.id === sv));
    if (!sheet.services.length) sheet.services = [defaultService(item, sheet.variantId)];
    const unit = sheetUnit();
    const el = $('#px-sheet', root);
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-sheet-head">
        <span class="px-sheet-art">${ART[item.id] || ''}</span>
        <span class="px-sheet-title"><h3>${esc(item.label)}</h3><span class="sub">${esc(CATALOG.find((c) => c.id === item.cat).label)}${item.sub ? ` · ${esc(item.sub)}` : ''}</span></span>
        <span class="px-sheet-price"><span class="val" id="px-sheet-total">${fmtMAD(unit * sheet.qty)}</span><span class="per">${unit} MAD × ${sheet.qty}</span></span>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Service <span class="opt">· combinables, ex. lavage + repassage</span></div>
        <div class="px-seg is-multi" id="px-svc-seg">
          ${avail.map((s) => `<button class="px-seg-it ${sheet.services.includes(s.id) ? 'on' : ''}" data-px-svc="${s.id}" aria-pressed="${sheet.services.includes(s.id)}">${esc(s.short)}<small>${priceTable(item, sheet.variantId)[s.id]} MAD</small></button>`).join('')}
        </div>
      </div>

      <div class="px-row-2">
        ${item.variants ? `<div class="px-f">
          <div class="px-f-lbl">${item.id === 'costume' ? 'Pièces du costume' : 'Taille'}</div>
          <div class="px-seg" data-lens-demo id="px-var-seg">
            ${item.variants.map((v) => `<button class="px-seg-it ${v.id === sheet.variantId ? 'on' : ''}" data-lens-item data-px-var="${v.id}">${esc(v.label)}${v.pieces ? `<small>${v.pieces.length} étiquettes</small>` : ''}</button>`).join('')}
          </div>
        </div>` : ''}
        <div class="px-f">
          <div class="px-f-lbl">Quantité</div>
          <div class="px-stepper">
            <button id="px-qty-minus" aria-label="Moins">−</button>
            <b id="px-qty-val">${sheet.qty}</b>
            <button id="px-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Couleur</div>
        <div class="px-colors" id="px-colors">
          ${COLORS.map((c) => `<button class="px-color ${c.id === sheet.color ? 'on' : ''}" data-px-color="${c.id}" data-c="${c.id}" style="background:${c.hex}" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`).join('')}
        </div>
      </div>

      <div class="px-f">
        <div class="px-f-lbl">Notes usuelles <span class="opt">· optionnel</span></div>
        <div class="px-chips" id="px-notes">
          ${NOTES.map((n) => `<button class="px-chip ${sheet.notes.includes(n) ? 'on' : ''}" data-px-note="${esc(n)}">${esc(n)}</button>`).join('')}
        </div>
        <input class="px-note-free" id="px-note-free" placeholder="Note libre (ex. « ourlet 2 cm »)…" value="${esc(sheet.freeNote)}" />
      </div>

      <div class="px-f">
        <div class="px-f-lbl">État à la dépose <span class="opt">· la photo protège le client et vous</span></div>
        <div class="px-photos" id="px-photos">
          ${Array.from({ length: sheet.photos }, (_, k) => `<span class="px-photo-thumb">${ART[item.id] || ''}<b>${k + 1}</b></span>`).join('')}
          <button class="px-photo-add" id="px-photo-add"><i data-lucide="camera"></i>Photo état</button>
        </div>
      </div>

      <div class="px-sheet-foot">
        <button class="px-btn secondary" data-px-close>Annuler</button>
        <button class="px-btn primary" id="px-sheet-add"><i data-lucide="plus"></i>Ajouter au ticket · <span id="px-sheet-cta-price">${fmtMAD(unit * sheet.qty)}</span></button>
      </div>`;

    const refreshPrice = () => {
      const u = sheetUnit();
      $('#px-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#px-sheet-cta-price', el).textContent = fmtMAD(u * sheet.qty);
      $('.px-sheet-price .per', el).textContent = `${u} MAD × ${sheet.qty}`;
      $('#px-qty-val', el).textContent = sheet.qty;
    };

    $('#px-svc-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-px-svc]');
      if (!b) return;
      const id = b.dataset.pxSvc;
      const i = sheet.services.indexOf(id);
      if (i >= 0) {
        if (sheet.services.length === 1) return;          /* toujours ≥ 1 service */
        sheet.services.splice(i, 1);
      } else {
        /* déposer les services incompatibles (sec ⟷ lavage/repassage) */
        (SVC_CONFLICTS[id] || []).forEach((c) => {
          const j = sheet.services.indexOf(c);
          if (j >= 0) sheet.services.splice(j, 1);
        });
        sheet.services.push(id);
      }
      $$('[data-px-svc]', el).forEach((x) => {
        const on = sheet.services.includes(x.dataset.pxSvc);
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', on);
      });
      refreshPrice();
    };
    const varSeg = $('#px-var-seg', el);
    if (varSeg) varSeg.onclick = (e) => {
      const b = e.target.closest('[data-px-var]');
      if (!b) return;
      sheet.variantId = b.dataset.pxVar;
      renderSheet(); icons();             /* les prix par service changent */
      if (window.KiwiLens) KiwiLens.rescan();
    };
    $('#px-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    $('#px-qty-plus', el).onclick = () => { sheet.qty++; refreshPrice(); };
    $('#px-colors', el).onclick = (e) => {
      const b = e.target.closest('[data-px-color]');
      if (!b) return;
      sheet.color = b.dataset.pxColor;
      $$('[data-px-color]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#px-notes', el).onclick = (e) => {
      const b = e.target.closest('[data-px-note]');
      if (!b) return;
      const n = b.dataset.pxNote;
      const i = sheet.notes.indexOf(n);
      if (i >= 0) sheet.notes.splice(i, 1); else sheet.notes.push(n);
      b.classList.toggle('on', i < 0);
    };
    $('#px-note-free', el).oninput = (e) => { sheet.freeNote = e.target.value; };
    $('#px-photo-add', el).onclick = openPhoto;
    $('#px-sheet-add', el).onclick = addSheetToTicket;
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-sheet-veil'); });
  }

  function addSheetToTicket() {
    state.ticket.lines.push({
      itemId: sheet.itemId, variantId: sheet.variantId, services: sheet.services.slice(),
      qty: sheet.qty, color: sheet.color, notes: sheet.notes.slice(), freeNote: sheet.freeNote.trim(),
      photos: sheet.photos,
    });
    closeVeil('#px-sheet-veil');
    const item = ITEMS[sheet.itemId];
    toast(`${item.label} × ${sheet.qty} · ${svcShorts(sheet.services)}, sur le ticket`);
    renderTicket(); icons();
  }

  /* condition photo — mock capture */
  function openPhoto() {
    const item = ITEMS[sheet.itemId];
    const el = $('#px-photom', root);
    el.innerHTML = `
      <div class="px-vf">
        <div class="px-vf-hint">Cadrez la zone (tache, accroc, bouton)…</div>
        ${(ART[item.id] || '').replace('class="px-art"', 'class="px-art art"')}
        <span class="px-vf-corner tl"></span><span class="px-vf-corner tr"></span>
        <span class="px-vf-corner bl"></span><span class="px-vf-corner br"></span>
        <div class="px-vf-flash" id="px-vf-flash"></div>
      </div>
      <div class="px-vf-foot">
        <button class="px-shutter" id="px-shutter" aria-label="Prendre la photo"></button>
        <button class="px-vf-close" id="px-vf-close">Fermer</button>
      </div>`;
    openVeil('#px-photo-veil');
    $('#px-shutter', el).onclick = () => {
      $('#px-vf-flash', el).classList.remove('go');
      void $('#px-vf-flash', el).offsetWidth;
      $('#px-vf-flash', el).classList.add('go');
      sheet.photos++;
      setTimeout(() => {
        closeVeil('#px-photo-veil');
        renderSheet(); icons();
        if (window.KiwiLens) KiwiLens.rescan();
        toast(`Photo état ${sheet.photos} enregistrée, jointe à la pièce`);
      }, 420);
    };
    $('#px-vf-close', el).onclick = () => closeVeil('#px-photo-veil');
  }

  /* ═══════════════════════ CLIENT — phone-first ═══════════════════════ */
  function openClient() {
    const el = $('#px-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? CUSTOMERS : CUSTOMERS.filter((c) =>
        (digits && c.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && c.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Client</h3>
        <p class="modal-subtle">Au pressing on cherche par téléphone, le client n'a jamais son ticket.</p>
        <div class="px-phone-in"><i data-lucide="phone"></i>
          <input id="px-cl-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="px-cl-results" id="px-cl-results">
            ${hits.map((c) => `
              <button class="px-cl-row" data-px-cl="${c.id}">
                <span class="px-cl-ava ${c.b2b ? 'b2b' : ''}">${c.b2b ? '<i data-lucide="building-2"></i>' : esc(initials(c.name))}</span>
                <span class="px-cl-mid">
                  <span class="px-cl-name">${esc(c.name)} ${c.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}</span>
                  <span class="px-cl-sub">${esc(c.phone)}</span>
                </span>
                <span class="px-cl-right"><b>${c.orders} cmd</b>${dueOf(c) ? `<span class="due">solde ${fmtMAD(dueOf(c))}</span>` : ''}</span>
              </button>`).join('') || `<div class="px-bempty">Aucun client pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="px-cl-new" id="px-cl-new"><i data-lucide="user-plus"></i>Nouveau client${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="px-sheet-foot" style="margin-top:10px;">
            <button class="px-btn ghost" id="px-cl-guest">Client de passage, sans fiche</button>
          </div>` : `
          <div class="px-cl-form">
            <input class="px-in" id="px-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="px-in" id="px-cl-tel" inputmode="tel" placeholder="Téléphone (optionnel)" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <div class="px-sheet-foot" style="margin-top:4px;">
              <button class="px-btn secondary" id="px-cl-back">Retour</button>
              <button class="px-btn primary" id="px-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#px-cl-q', el).oninput = (e) => { render(e.target.value); icons(); $('#px-cl-q', el).focus(); moveCaretEnd($('#px-cl-q', el)); };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-client-veil'); });
      $$('[data-px-cl]', el).forEach((b) => {
        b.onclick = () => {
          state.ticket.customer = { type: 'known', id: b.dataset.pxCl };
          closeVeil('#px-client-veil');
          const c = CUST[b.dataset.pxCl];
          toast(c.b2b ? `${c.name}, compte B2B, remise –15 % appliquée` : `${c.name}, ${c.orders} commandes, bienvenue`);
          renderTicket(); icons();
        };
      });
      const newBtn = $('#px-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#px-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.ticket.customer = { type: 'guest' };
        closeVeil('#px-client-veil');
        renderTicket(); icons();
      };
      const back = $('#px-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#px-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#px-cl-name', el).value.trim();
        const tel = $('#px-cl-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel, orders: 0, prefs: [] };
        CUSTOMERS.unshift(c); CUST[id] = c;
        state.ticket.customer = { type: 'known', id };
        closeVeil('#px-client-veil');
        toast(`Fiche créée, ${name}`);
        renderTicket(); icons();
      };
    };
    render('');
    openVeil('#px-client-veil');
    icons();
    setTimeout(() => { const i = $('#px-cl-q', el); if (i) i.focus(); }, 60);
  }
  function initials(name) {
    return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function dueOf(c) {
    return ORDERS.filter((o) => o.custId === c.id && orderStatus(o) !== 'livre' && o.pay.mode !== 'compte')
      .reduce((s, o) => s + Math.max(0, orderTotals(o).total - o.pay.paid), 0);
  }
  function recoPanel(c) {
    const hist = ORDERS.filter((o) => o.custId === c.id).slice(0, 2);
    return `<div class="px-reco">
      <div class="px-reco-head"><i data-lucide="sparkles"></i>${esc(c.name)}, client reconnu</div>
      <div class="px-reco-rows">
        ${(c.prefs || []).map((p) => `<div class="px-reco-row"><i data-lucide="heart"></i>${esc(p)}</div>`).join('')}
        ${c.contact ? `<div class="px-reco-row"><i data-lucide="user"></i>${esc(c.contact)}</div>` : ''}
        ${hist.map((o) => `<div class="px-reco-row"><i data-lucide="history"></i><b>${o.id}</b> · ${o.pieces.length} pièces · ${STATUS[orderStatus(o)].label}</div>`).join('')}
      </div>
    </div>`;
  }
  function moveCaretEnd(input) {
    const v = input.value; input.value = ''; input.value = v;
  }

  /* ═══════════════════════ READY DATE ═══════════════════════ */
  function openDate() {
    const el = $('#px-datemm', root);
    const mk = (h, hour) => { const d = new Date(Date.now() + h * H); d.setHours(hour, 0, 0, 0); if (d.getDay() === 0) d.setDate(d.getDate() + 1); return d; };
    const opts = [
      { label: 'Ce soir · 19:00', sub: 'express', d: (() => { const d = new Date(); d.setHours(19, 0, 0, 0); return d; })() },
      { label: 'Demain · 18:00', sub: 'service standard', d: mk(24, 18) },
      { label: fmtDay(mk(48, 18)) + ' · 18:00', sub: '48 h, suggéré', d: mk(48, 18) },
      { label: fmtDay(mk(72, 18)) + ' · 18:00', sub: '72 h', d: mk(72, 18) },
    ];
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Prêt pour quand ?</h3>
      <p class="modal-subtle">La date promise s'imprime sur le ticket et sert d'alerte au tableau.</p>
      <div class="px-date-chips">
        ${opts.map((o, i) => `<button class="px-date-chip ${Math.abs(o.d - state.ticket.ready) < 60000 ? 'on' : ''}" data-px-d="${i}"><b>${esc(o.label)}</b><span>${esc(o.sub)}</span></button>`).join('')}
      </div>
      <div class="px-date-custom">
        <input class="px-in" id="px-date-input" type="datetime-local" value="${localDT(state.ticket.ready)}" />
        <button class="px-btn primary" id="px-date-ok" style="flex:0 0 auto;">OK</button>
      </div>`;
    openVeil('#px-date-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-date-veil'); });
    $$('[data-px-d]', el).forEach((b) => {
      b.onclick = () => {
        state.ticket.ready = opts[+b.dataset.pxD].d;
        closeVeil('#px-date-veil');
        renderTicket(); icons();
      };
    });
    $('#px-date-ok', el).onclick = () => {
      const v = $('#px-date-input', el).value;
      if (v) state.ticket.ready = new Date(v);
      closeVeil('#px-date-veil');
      renderTicket(); icons();
    };
  }
  function localDT(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  /* ═══════════════════════ VALIDATE → TAGS + RECEIPT ═══════════════════════ */
  function validateTicket() {
    const t = state.ticket;
    if (!t.lines.length) return;
    if (!t.customer) { openClient(); toast("Attachez d'abord le client (ou « passage »)"); return; }
    const order = {
      id: t.num,
      custId: t.customer.type === 'known' ? t.customer.id : null,
      guest: t.customer.type === 'guest' ? { name: 'Client de passage', phone: '' } : null,
      b2b: ticketTotals(t).b2b,
      lines: t.lines.map((l) => ({ ...l, notes: l.notes.slice() })),
      droppedAt: new Date(), readyAt: t.ready,
      pay: { mode: null, method: null, paid: 0 },
      rack: null, notified: false, collectedAt: null,
    };
    order.pieces = buildPieces(order.id, order.lines, null);
    openTags(order, { fresh: true });
  }

  function receiptHTML(o) {
    const c = custOf(o);
    const { sub, remise, total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `<div class="px-receipt">
      <div class="c b lg">PRESSING MARSHAN</div>
      <div class="c mut">Rue Assad Ibn Al Fourat, Tanger<br>05 39 93 XX XX · propulsé par Kiwi</div>
      <hr>
      <div class="row"><span>Ticket</span><span class="b">${o.id}</span></div>
      <div class="row"><span>Client</span><span>${esc(c.name)}</span></div>
      ${c.phone ? `<div class="row"><span>Tél</span><span>${esc(c.phone)}</span></div>` : ''}
      <div class="row"><span>Déposé</span><span>${fmtDT(o.droppedAt)}</span></div>
      <div class="row b"><span>PRÊT LE</span><span>${fmtDT(o.readyAt)}</span></div>
      <hr>
      ${o.lines.map((ln) => {
        const item = ITEMS[ln.itemId];
        const variant = item.variants ? (item.variants.find((v) => v.id === ln.variantId) || item.variants[0]).label : '';
        return `<div class="row"><span class="nm">${ln.qty} × ${esc(item.label)}${variant ? ` (${esc(variant)})` : ''} · ${svcCodes(ln.services)}</span><span>${lineTotal(ln)}</span></div>`;
      }).join('')}
      <hr>
      <div class="row"><span>Sous-total</span><span>${sub} MAD</span></div>
      ${remise ? `<div class="row"><span>Remise B2B –15 %</span><span>−${remise} MAD</span></div>` : ''}
      <div class="row tot"><span>TOTAL</span><span>${total} MAD</span></div>
      ${o.pay.mode === 'compte' ? `<div class="row"><span>Règlement</span><span>SUR COMPTE</span></div>` :
        `<div class="row"><span>Payé</span><span>${o.pay.paid} MAD</span></div>
         ${due ? `<div class="row due"><span>SOLDE AU RETRAIT</span><span>${due} MAD</span></div>` : ''}`}
      <div class="row"><span>Pièces</span><span>${o.pieces.length} · ${o.pieces.length} étiq.</span></div>
      <hr>
      <div class="c">${barcode(o.id, 26)}</div>
      <div class="c mut">${o.id} · merci, l'lah ikhellik</div>
    </div>`;
  }

  function tagHTML(p, o) {
    const c = custOf(o);
    return `<div class="px-tag">
      <div class="px-tag-top"><span class="px-tag-num">${o.id}</span><span class="px-tag-i">pièce ${p.n}/${p.of}</span></div>
      <div class="px-tag-client">${esc(c.name)}</div>
      <div class="px-tag-item"><i class="dot" style="background:${COLOR[p.color] ? COLOR[p.color].hex : '#ccc'}"></i>${esc(p.label)} · <span class="svc">${svcCodes(p.svcs)}</span></div>
      ${barcode(p.pid, 26)}
      <div class="px-tag-id">${p.pid}</div>
    </div>`;
  }

  function openTags(order, ctx) {
    const el = $('#px-tagsm', root);
    const fresh = ctx && ctx.fresh;
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Ticket &amp; étiquettes, ${order.id}</h3>
      <p class="modal-subtle">${order.pieces.length} pièce${order.pieces.length > 1 ? 's' : ''} = ${order.pieces.length} étiquette${order.pieces.length > 1 ? 's' : ''} imperméables. Un costume 3 pièces sort avec 3 étiquettes, rien ne se perd.</p>
      <div class="px-tags-grid">
        ${receiptHTML(order)}
        <div class="px-tags-list">${order.pieces.map((p) => tagHTML(p, order)).join('')}</div>
      </div>
      <div class="px-tags-note"><i data-lucide="shield-check"></i>Chaque étiquette porte le n° de commande, la pièce, le client et le service, scannable au rangement et au retrait.</div>
      <div class="px-tags-foot">
        <button class="px-btn secondary" id="px-tags-print"><i data-lucide="printer"></i>Imprimer ticket + ${order.pieces.length} étiq.</button>
        ${fresh
          ? `<button class="px-btn primary" id="px-tags-pay"><i data-lucide="banknote"></i>Encaissement</button>`
          : `<button class="px-btn primary" data-px-close><i data-lucide="check"></i>Fermer</button>`}
      </div>`;
    openVeil('#px-tags-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-tags-veil'); });
    $('#px-tags-print', el).onclick = () => toast('Envoyé, ticket (80 mm) + étiquettes (imprimante thermique)');
    const payBtn = $('#px-tags-pay', el);
    if (payBtn) payBtn.onclick = () => { closeVeil('#px-tags-veil'); openPay(order, { fresh: true }); };
  }

  /* ═══════════════════════ PAYMENT — now / acompte / pickup / compte ═══════════════════════ */
  function openPay(order, ctx) {
    const el = $('#px-paym', root);
    const { total } = orderTotals(order);
    const cust = custOf(order);
    const due = Math.max(0, total - order.pay.paid);
    const fresh = ctx && ctx.fresh;
    const settle = ctx && ctx.settle;          /* encaisser un solde existant */
    const amountBase = settle ? due : total;

    const step1 = () => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${settle ? 'Encaisser le solde' : 'Encaissement'}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="modal-amount size-md">${fmtMAD(amountBase)}</div>
        <div class="px-pay-opts">
          ${settle ? '' : `
          <button class="px-pay-opt" data-px-paymode="now">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Payer maintenant</b><span>Espèces ou carte à la dépose</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          <button class="px-pay-opt" data-px-paymode="acompte">
            <span class="ic"><i data-lucide="coins"></i></span>
            <span class="l"><b>Acompte à la dépose</b><span>Le reste au retrait</span></span>
          </button>
          <button class="px-pay-opt is-usual" data-px-paymode="pickup">
            <span class="ic"><i data-lucide="hand-coins"></i></span>
            <span class="l"><b>Payer au retrait</b><span>Le classique du pressing, solde sur le ticket</span></span>
            <span class="amt">${fmtMAD(total)}</span>
          </button>
          ${cust.b2b ? `
          <button class="px-pay-opt" data-px-paymode="compte">
            <span class="ic"><i data-lucide="building-2"></i></span>
            <span class="l"><b>Sur compte B2B</b><span>${esc(cust.name)}, facture fin de mois</span></span>
          </button>` : ''}`}
          ${settle ? `
          <button class="px-pay-opt" data-px-method="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="px-pay-opt" data-px-method="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
          </button>` : ''}
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-pay-veil'); });
      $$('[data-px-paymode]', el).forEach((b) => {
        b.onclick = () => {
          const mode = b.dataset.pxPaymode;
          if (mode === 'pickup') {
            order.pay = { mode: 'pickup', method: null, paid: 0 };
            finishFresh(`Solde ${fmtMAD(total)} à encaisser au retrait`);
          } else if (mode === 'compte') {
            order.pay = { mode: 'compte', method: 'compte', paid: 0 };
            finishFresh('Sur compte B2B, ajouté à la facture du mois');
          } else if (mode === 'acompte') {
            stepAcompte();
          } else {
            stepMethod(total, 'now');
          }
        };
      });
      $$('[data-px-method]', el).forEach((b) => {
        b.onclick = () => (b.dataset.pxMethod === 'especes' ? stepCash(amountBase, 'settle') : stepCard(amountBase, 'settle'));
      });
    };

    const stepAcompte = () => {
      let acompte = Math.max(10, Math.round(total / 2 / 10) * 10);
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Acompte</h3>
        <p class="modal-subtle">${order.id} · total ${fmtMAD(total)}</p>
        <div class="modal-amount size-md" id="px-ac-val">${fmtMAD(acompte)}</div>
        <div class="px-acompte-row">
          <button class="cash-preset" data-px-ac="20">20</button>
          <button class="cash-preset" data-px-ac="50">50</button>
          <button class="cash-preset" data-px-ac="100">100</button>
          <button class="cash-preset" data-px-ac="half">50 %</button>
        </div>
        <div class="cash-input-row" style="margin:10px 0 14px;">
          <label class="cash-input-label" for="px-ac-input">Montant</label>
          <input class="cash-input mono" id="px-ac-input" type="number" inputmode="numeric" min="10" max="${total}" step="5" value="${acompte}" />
        </div>
        <div class="px-sheet-foot">
          <button class="px-btn secondary" id="px-ac-back">Retour</button>
          <button class="px-btn primary" id="px-ac-ok">Encaisser l'acompte</button>
        </div>`;
      icons();
      const refresh = () => { $('#px-ac-val', el).textContent = fmtMAD(acompte); $('#px-ac-input', el).value = acompte; };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-pay-veil'); });
      $$('[data-px-ac]', el).forEach((b) => {
        b.onclick = () => {
          acompte = b.dataset.pxAc === 'half' ? Math.round(total / 2 / 5) * 5 : Math.min(total, +b.dataset.pxAc);
          refresh();
        };
      });
      $('#px-ac-input', el).oninput = (e) => { acompte = Math.max(0, Math.min(total, +e.target.value || 0)); $('#px-ac-val', el).textContent = fmtMAD(acompte); };
      $('#px-ac-back', el).onclick = step1;
      $('#px-ac-ok', el).onclick = () => stepMethod(acompte, 'acompte');
    };

    const stepMethod = (amount, mode) => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${mode === 'acompte' ? 'Acompte' : 'Paiement'} · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="px-pay-opts" style="margin-top:8px;">
          <button class="px-pay-opt" data-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé</span></span>
          </button>
          <button class="px-pay-opt" data-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-pay-veil'); });
      $$('[data-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.m === 'especes' ? stepCash(amount, mode) : stepCard(amount, mode));
      });
    };

    const stepCash = (amount, mode) => {
      let received = amount;
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · ${esc(cust.name)}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="px-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="px-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="px-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="px-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#px-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#px-cash-ok', el).disabled = received < amount;
      };
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-pay-veil'); });
      $('#px-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#px-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#px-cash-ok', el).onclick = () => done(amount, 'especes', mode, Math.max(0, received - amount));
    };

    const stepCard = (amount, mode) => {
      el.innerHTML = `
        <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${order.id} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="px-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="px-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur CMI partenaire · V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-pay-veil'); });
      setTimeout(() => {
        const disc = $('#px-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        disc.classList.remove('is-pulsing');
        disc.classList.add('is-success');
        disc.innerHTML = '<i data-lucide="check"></i>';
        $('#px-reader-status', el).textContent = 'Khlass! Paiement confirmé sur le lecteur';
        $('#px-reader-status', el).classList.add('is-success');
        icons();
        setTimeout(() => done(amount, 'carte', mode, 0), 900);
      }, 1900);
    };

    const done = (amount, method, mode, rendu) => {
      if (settle) {
        order.pay.paid += amount;
        order.pay.method = method;
        /* Le solde du « payer au retrait » est l'argent qui rentre vraiment :
           c'est ici qu'il devient une recette, pas à la prise de la commande. */
        postDay(amount, method, `Solde ${order.id} · ${custOf(order).name}`, order.id);
        closeVeil('#px-pay-veil');
        toast(`Solde encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        if (ctx && typeof ctx.onSettled === 'function') ctx.onSettled();
        return;
      }
      order.pay = { mode, method, paid: amount };
      finishFresh(mode === 'acompte'
        ? `Acompte ${fmtMAD(amount)} encaissé, solde ${fmtMAD(total - amount)} au retrait`
        : `Encaissé, ${fmtMAD(amount)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
    };

    const finishFresh = (msg) => {
      closeVeil('#px-pay-veil');
      /* `pickup` et `compte` passent aussi par ici avec paid: 0 : ils ne
         prennent rien au comptoir. Seul l'argent réellement encaissé (paiement
         complet ou acompte) est une recette, le solde sera journalisé par la
         branche `settle` au retrait. */
      if (order.pay.paid > 0) postDay(order.pay.paid, order.pay.method, tkLabel(order), order.id);
      if (fresh) {
        ORDERS.unshift(order);
        ticketSeq++;
        freshTicket();
        renderTicket();
        renderBadges();
        queueIfOffline(`Commande ${order.id}`);
        toast(`${order.id} enregistrée, prête ${fmtDT(order.readyAt)}`);
      }
      toast(msg);
      icons();
    };

    step1();
    openVeil('#px-pay-veil');
  }

  /* ═══════════════════════ TABLEAU DES COMMANDES ═══════════════════════ */
  const STATUS_DOT_HEX = { recu: 'var(--ink-4)', trait: '#D99A2B', pret: 'var(--emerald)', livre: 'var(--line)' };

  function payPill(o) {
    const { total } = orderTotals(o);
    if (o.pay.mode === 'compte') return '<span class="px-pill ok">Compte B2B</span>';
    const due = Math.max(0, total - o.pay.paid);
    if (due <= 0) return '<span class="px-pill ok">Payé</span>';
    if (o.pay.paid > 0) return `<span class="px-pill warn">Acompte · solde ${due} MAD</span>`;
    return `<span class="px-pill due">Au retrait · ${due} MAD</span>`;
  }

  function matchesQuery(o, q) {
    if (!q) return true;
    const c = custOf(o);
    const digits = q.replace(/\D/g, '');
    return o.id.toLowerCase().includes(q.toLowerCase()) ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (digits.length >= 2 && (c.phone || '').replace(/\D/g, '').includes(digits));
  }

  function orderCard(o) {
    const c = custOf(o);
    const late = isLate(o);
    const st = orderStatus(o);
    const when = st === 'livre'
      ? `retiré ${fmtDay(o.collectedAt || o.readyAt)}`
      : `prêt ${fmtDT(o.readyAt)}`;
    return `<button class="px-ocard ${late ? 'is-late' : ''}" data-px-order="${o.id}">
      <span class="px-ocard-top"><span class="px-ocard-num">${o.id}</span>
        <span class="px-ocard-when ${late ? 'late' : ''}">${late ? 'EN RETARD · ' : ''}${esc(when)}</span></span>
      <span class="px-ocard-client"><i data-lucide="${o.b2b ? 'building-2' : 'user'}"></i>${esc(c.name)}</span>
      <span class="px-ocard-meta">
        <span class="px-pill"><i data-lucide="tag"></i>${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}</span>
        ${payPill(o)}
        ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
        ${o.notified && st === 'pret' ? '<span class="px-pill wa">Notifié</span>' : ''}
      </span>
      <span class="px-piece-dots">${o.pieces.map((p) => `<i class="px-pdot ${p.status}"></i>`).join('')}</span>
    </button>`;
  }

  function renderBoard() {
    const panel = $('[data-px-panel="commandes"]', root);
    const q = state.boardQuery;
    panel.innerHTML = `
      <div class="px-board">
        <header class="px-head">
          <div><h1>Tableau des commandes</h1><div class="px-head-sub">Chaque pièce a son statut, pas seulement le ticket</div></div>
          <div class="px-search"><i data-lucide="search"></i>
            <input id="px-board-q" placeholder="Téléphone, nom ou n° de ticket…" value="${esc(q)}" /></div>
        </header>
        <div class="px-board-cols">
          ${STATUS_FLOW.map((s) => {
            const list = ORDERS.filter((o) => orderStatus(o) === s && matchesQuery(o, q));
            return `<div class="px-bcol">
              <div class="px-bcol-head"><i style="background:${STATUS_DOT_HEX[s]}"></i>${STATUS[s].label} <span class="ct">${list.length}</span></div>
              ${list.map(orderCard).join('') || '<div class="px-bempty">—</div>'}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    $('#px-board-q', panel).oninput = (e) => {
      state.boardQuery = e.target.value;
      renderBoard(); icons();
      const i = $('#px-board-q', panel); i.focus(); moveCaretEnd(i);
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-px-order]');
      if (b) openDetail(b.dataset.pxOrder);
    };
    icons();
  }

  /* ---------- détail commande + statuts par pièce ---------- */
  function openDetail(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    const el = $('#px-detailm', root);
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    const st = orderStatus(o);
    const delivered = st === 'livre';

    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="px-dt-head">
        <div>
          <h3>${o.id}</h3>
          <div class="px-dt-sub">${esc(c.name)} ${c.phone ? `<span class="tel">${esc(c.phone)}</span>` : ''}
            ${o.b2b ? '<span class="px-b2b-chip">B2B</span>' : ''}
            <span class="px-pill ${st === 'pret' ? 'ok' : st === 'trait' ? 'warn' : ''}">${STATUS[st].label}</span>
            ${isLate(o) ? '<span class="px-pill due">En retard</span>' : ''}
            ${payPill(o)}
            ${o.rack ? `<span class="px-pill rack">${o.rack}</span>` : ''}
          </div>
          <div class="px-dt-sub" style="margin-top:5px;">Déposé ${fmtDT(o.droppedAt)} · promis ${fmtDT(o.readyAt)}${o.collectedAt ? ` · retiré ${fmtDT(o.collectedAt)}` : ''}</div>
        </div>
      </div>
      <div class="px-dt-grid">
        ${o.pieces.map((p, i) => `
          <div class="px-piece">
            <span class="px-piece-art">${ART[p.itemId] || ''}</span>
            <span class="px-piece-mid">
              <span class="px-piece-name"><i class="dot" style="background:${COLOR[p.color] ? COLOR[p.color].hex : '#ccc'}"></i>${esc(p.label)} · <span style="font-family:var(--mono);font-size:11px;">${svcCodes(p.svcs)}</span></span>
              <span class="px-piece-id">${p.pid}${p.photos ? `<span class="ph"><i data-lucide="camera"></i>${p.photos} photo${p.photos > 1 ? 's' : ''}</span>` : ''}</span>
            </span>
            ${delivered || p.status === 'livre'
              ? '<span class="px-pill">Livré</span>'
              : `<span class="px-pstatus">
                  ${['recu', 'trait', 'pret'].map((s) => `<button class="px-pstep ${p.status === s ? 'on ' + s : ''}" data-px-piece="${i}" data-px-st="${s}">${s === 'recu' ? 'Reçu' : s === 'trait' ? 'Trait.' : 'Prêt'}</button>`).join('')}
                </span>`}
          </div>`).join('')}
      </div>
      <div class="px-dt-actions">
        ${delivered ? '' : `
          ${o.pieces.some((p) => p.status === 'recu') ? '<button class="px-btn secondary" data-px-all="trait"><i data-lucide="loader"></i>Tout en traitement</button>' : ''}
          ${o.pieces.some((p) => p.status !== 'pret' && p.status !== 'livre') ? '<button class="px-btn secondary" data-px-all="pret"><i data-lucide="check-check"></i>Tout prêt</button>' : ''}`}
        <button class="px-btn secondary" id="px-dt-tags"><i data-lucide="printer"></i>Étiquettes</button>
        ${due > 0 && !delivered ? `<button class="px-btn secondary" id="px-dt-pay"><i data-lucide="banknote"></i>Solde · ${due} MAD</button>` : ''}
        ${st === 'pret' ? `<button class="px-btn ${o.notified ? 'secondary' : 'primary'}" id="px-dt-wa"><i data-lucide="message-circle"></i>${o.notified ? 'Re-notifier' : 'WhatsApp « c’est prêt »'}</button>` : ''}
        ${st === 'pret' && !o.rack ? '<button class="px-btn primary" id="px-dt-rack"><i data-lucide="archive"></i>Ranger</button>' : ''}
        ${o.rack && !delivered ? '<button class="px-btn ghost" id="px-dt-unrack">Libérer le cintre</button>' : ''}
      </div>`;
    openVeil('#px-detail-veil');
    icons();

    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-detail-veil'); });
    $$('[data-px-piece]', el).forEach((b) => {
      b.onclick = () => {
        const p = o.pieces[+b.dataset.pxPiece];
        const wasPret = orderStatus(o) === 'pret';
        p.status = b.dataset.pxSt;
        queueIfOffline('Statut pièce');
        afterStatusChange(o, wasPret);
      };
    });
    $$('[data-px-all]', el).forEach((b) => {
      b.onclick = () => {
        const wasPret = orderStatus(o) === 'pret';
        o.pieces.forEach((p) => { if (p.status !== 'livre') p.status = b.dataset.pxAll; });
        queueIfOffline('Statut commande');
        afterStatusChange(o, wasPret);
      };
    });
    /* tags/pay veils precede the detail veil in the DOM — close detail first
       so they don't paint underneath it */
    $('#px-dt-tags', el).onclick = () => { closeVeil('#px-detail-veil'); openTags(o, { fresh: false }); };
    const payB = $('#px-dt-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#px-detail-veil');
      openPay(o, { settle: true, onSettled: () => { openDetail(o.id); refreshOps(); } });
    };
    const waB = $('#px-dt-wa', el);
    if (waB) waB.onclick = () => openWa(o);
    const rackB = $('#px-dt-rack', el);
    if (rackB) rackB.onclick = () => {
      closeVeil('#px-detail-veil');
      state.rackSelect = o.id;
      switchView('rangement');
    };
    const unrackB = $('#px-dt-unrack', el);
    if (unrackB) unrackB.onclick = () => {
      releaseSlot(o);
      toast(`${o.id}, cintre libéré`);
      openDetail(o.id); refreshOps();
    };
  }

  function afterStatusChange(o, wasPret) {
    const nowSt = orderStatus(o);
    openDetail(o.id);
    refreshOps();
    if (nowSt === 'pret' && !wasPret && !o.notified) {
      toast(`${o.id} est prêt, prévenez ${custOf(o).name.split(' ')[0]} ?`);
      setTimeout(() => openWa(o), 450);
    }
  }

  /* re-render whatever ops view is behind the modal + the rail badges */
  function refreshOps() {
    renderBadges();
    if (state.view === 'commandes') renderBoard();
    if (state.view === 'retrait') renderRetrait();
    if (state.view === 'rangement') renderRack();
    icons();
  }

  /* ═══════════════════════ WHATSAPP « C'EST PRÊT » ═══════════════════════ */
  function waMessage(o) {
    const c = custOf(o);
    const first = c.b2b ? c.name : c.name.split(' ')[0];
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `Sba7 lkhir ${first}, votre commande ${o.id} (${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''}) est prête chez ${pvName('Pressing Marshan')}.`
      + `\nRetrait dès maintenant, jusqu'à 20h00.`
      + (due > 0 ? `\nSolde à régler au retrait : ${due} MAD.` : '')
      + `\n— envoyé via Kiwi`;
  }

  function openWa(o) {
    const el = $('#px-wam', root);
    const c = custOf(o);
    const photoPiece = o.pieces.find((p) => p.photos > 0) || o.pieces[0];
    let withPhoto = false;
    el.innerHTML = `
      <button class="px-modal-x" data-px-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">WhatsApp, c'est prêt</h3>
      <p class="modal-subtle">${esc(c.name)} ${c.phone ? `· ${esc(c.phone)}` : '· numéro manquant (passage)'}</p>
      <div class="px-wa-bubblewrap">
        <div class="px-wa-bubble">
          <textarea id="px-wa-text">${esc(waMessage(o))}</textarea>
          <div class="px-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      <button class="px-wa-photo" id="px-wa-photo">
        <span class="th">${ART[photoPiece.itemId] || ''}</span>
        <span class="l">Joindre une photo du vêtement fini, le client voit son linge avant de se déplacer</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>
      <div class="px-sheet-foot">
        <button class="px-btn ghost" data-px-close>Plus tard</button>
        <button class="px-btn primary" id="px-wa-send" ${c.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#px-wa-veil');
    icons();
    $$('[data-px-close]', el).forEach((b) => { b.onclick = () => closeVeil('#px-wa-veil'); });
    $('#px-wa-photo', el).onclick = () => {
      withPhoto = !withPhoto;
      $('#px-wa-photo', el).classList.toggle('on', withPhoto);
    };
    /* Ce bouton annonçait « WhatsApp envoyé » et marquait la commande notifiée
       alors qu'aucun message ne partait : le client attendait chez lui un
       message qui n'existait pas. Une page web ne peut pas envoyer un WhatsApp
       toute seule, on ouvre donc le brouillon pré-rempli (texte tel qu'édité) et
       c'est le pressing qui appuie sur envoyer. Le lien ne transporte pas la
       photo, on le dit au lieu de le prétendre. */
    $('#px-wa-send', el).onclick = () => {
      const txt = $('#px-wa-text', el);
      const body = txt ? txt.value : waMessage(o);
      const num = String(c.phone || '').replace(/\D/g, '');
      if (!num) { toast(`Pas de numéro pour ${c.name}, ajoutez-le à sa fiche`); return; }
      o.notified = true;
      closeVeil('#px-wa-veil');
      queueIfOffline('Notification WhatsApp');
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        toast(`WhatsApp ouvert pour ${c.name}, appuyez sur envoyer${withPhoto ? ' · joignez la photo dans WhatsApp' : ''}`);
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      refreshOps();
    };
  }

  /* ═══════════════════════ RETRAIT ═══════════════════════ */
  function renderRetrait() {
    const panel = $('[data-px-panel="retrait"]', root);
    const q = state.rtQuery;
    const hits = q ? ORDERS.filter((o) => orderStatus(o) !== 'livre' && matchesQuery(o, q)) : [];
    const prets = hits.filter((o) => orderStatus(o) === 'pret');
    const others = hits.filter((o) => orderStatus(o) !== 'pret');
    panel.innerHTML = `
      <div class="px-retrait">
        <div class="px-rt-inner">
          <header class="px-head" style="padding:22px 0 0;">
            <div><h1>Retrait</h1><div class="px-head-sub">Le client donne son téléphone, ou on scanne son ticket / une étiquette</div></div>
          </header>
          <div class="px-rt-search">
            <div class="px-phone-in"><i data-lucide="phone"></i>
              <input id="px-rt-q" inputmode="tel" placeholder="06… ou nom du client" value="${esc(q)}" autocomplete="off" /></div>
          </div>
          <div class="px-rt-or">ou</div>
          <button class="px-rt-scan" id="px-rt-scan"><i data-lucide="scan-line"></i>Scanner ticket ou étiquette</button>
          <div class="px-rt-results">
            ${prets.map(rtCard).join('')}
            ${others.map((o) => `
              <div class="px-rt-card">
                <div class="px-rt-top">
                  <div class="px-rt-who"><b>${o.id} · ${esc(custOf(o).name)}</b><span>${o.pieces.length} pièces · ${STATUS[orderStatus(o)].label}</span></div>
                  <span class="px-pill warn">Pas encore prêt, promis ${fmtDT(o.readyAt)}</span>
                </div>
              </div>`).join('')}
            ${q && !hits.length ? `<div class="px-bempty">Rien pour « ${esc(q)} », vérifiez le numéro, ou cherchez au tableau.</div>` : ''}
          </div>
        </div>
      </div>`;
    $('#px-rt-q', panel).oninput = (e) => {
      state.rtQuery = e.target.value;
      renderRetrait(); icons();
      const i = $('#px-rt-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#px-rt-scan', panel).onclick = openScan;
    $$('[data-px-rt-pay]', panel).forEach((b) => {
      b.onclick = () => {
        const o = findOrder(b.dataset.pxRtPay);
        openPay(o, { settle: true, onSettled: refreshOps });
      };
    });
    $$('[data-px-rt-give]', panel).forEach((b) => {
      b.onclick = () => deliverOrder(b.dataset.pxRtGive);
    });
    $$('[data-px-rt-wa]', panel).forEach((b) => {
      b.onclick = () => openWa(findOrder(b.dataset.pxRtWa));
    });
    icons();
  }

  function rtCard(o) {
    const c = custOf(o);
    const { total } = orderTotals(o);
    const due = o.pay.mode === 'compte' ? 0 : Math.max(0, total - o.pay.paid);
    return `<div class="px-rt-card">
      <div class="px-rt-top">
        <div class="px-rt-who"><b>${o.id} · ${esc(c.name)}</b><span>${c.phone ? esc(c.phone) + ' · ' : ''}déposé ${fmtDay(o.droppedAt)}${o.notified ? ' · notifié' : ''}</span></div>
        <div class="px-rt-slot ${o.rack ? '' : 'none'}">${o.rack ? `<b>${o.rack}</b><span>cintre</span>` : '<b>—</b><span>non rangé</span>'}</div>
      </div>
      <div class="px-rt-pieces">
        ${o.pieces.map((p) => `<div class="px-rt-piece"><i data-lucide="check-circle-2"></i>${esc(p.label)} · ${svcCodes(p.svcs)}<span class="pid">${p.pid}</span></div>`).join('')}
      </div>
      <div class="px-rt-balance ${due > 0 ? '' : 'paid'}">
        <span>${due > 0 ? 'Solde à encaisser' : o.pay.mode === 'compte' ? 'Sur compte B2B, facture fin de mois' : 'Déjà réglé'}</span>
        <span class="amt">${due > 0 ? fmtMAD(due) : '✓'}</span>
      </div>
      <div class="px-rt-actions">
        ${due > 0 ? `<button class="px-btn secondary" style="flex:1;" data-px-rt-pay="${o.id}"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(due)}</button>` : ''}
        <button class="px-btn primary" style="flex:1;" data-px-rt-give="${o.id}" ${due > 0 ? 'disabled title="Encaissez le solde d’abord"' : ''}><i data-lucide="check"></i>Remettre au client</button>
        ${!o.notified ? `<button class="px-btn ghost" data-px-rt-wa="${o.id}"><i data-lucide="message-circle"></i></button>` : ''}
      </div>
    </div>`;
  }

  function deliverOrder(orderId) {
    const o = findOrder(orderId);
    if (!o) return;
    o.pieces.forEach((p) => { p.status = 'livre'; });
    o.collectedAt = new Date();
    releaseSlot(o);
    queueIfOffline('Retrait');
    toast(`${o.id} remis à ${custOf(o).name}, merci envoyé sur WhatsApp`);
    refreshOps();
  }

  function openScan() {
    const target = ORDERS.find((o) => orderStatus(o) === 'pret' && o.rack) || ORDERS.find((o) => orderStatus(o) === 'pret');
    const el = $('#px-scanm', root);
    const p = target ? target.pieces[0] : null;
    el.innerHTML = `
      <h3 class="modal-title">Scan en cours…</h3>
      <p class="modal-subtle">Présentez le ticket ou n'importe quelle étiquette de la commande.</p>
      <div class="px-scan-stage">
        ${p ? `<div class="px-tag px-scan-tag">${tagInner(p, target)}</div>` : ''}
        <div class="px-scan-laser"></div>
      </div>`;
    openVeil('#px-scan-veil');
    icons();
    setTimeout(() => {
      closeVeil('#px-scan-veil');
      if (target) {
        state.rtQuery = target.id;
        renderRetrait(); icons();
        toast(`Étiquette lue, ${target.id}${target.rack ? ' · cintre ' + target.rack : ''}`);
      } else {
        toast('Aucune commande prête à scanner (démo)');
      }
    }, 1500);
  }
  function tagInner(p, o) {
    const c = custOf(o);
    return `<div class="px-tag-top"><span class="px-tag-num">${o.id}</span><span class="px-tag-i">pièce ${p.n}/${p.of}</span></div>
      <div class="px-tag-client">${esc(c.name)}</div>
      <div class="px-tag-item">${esc(p.label)} · <span class="svc">${svcCodes(p.svcs)}</span></div>
      ${barcode(p.pid, 22)}
      <div class="px-tag-id">${p.pid}</div>`;
  }

  /* ═══════════════════════ RANGEMENT (rack) ═══════════════════════ */
  function releaseSlot(o) {
    if (o.rack) { delete rackSlots[o.rack]; o.rack = null; }
  }
  function assignSlot(o, slot) {
    releaseSlot(o);
    rackSlots[slot] = o.id;
    o.rack = slot;
  }

  function renderRack() {
    const panel = $('[data-px-panel="rangement"]', root);
    const queue = ORDERS.filter((o) => orderStatus(o) === 'pret' && !o.rack);
    if (state.rackSelect && !queue.some((o) => o.id === state.rackSelect)) state.rackSelect = null;
    const sel = state.rackSelect;
    panel.innerHTML = `
      <div class="px-rack">
        <div class="px-rack-queue">
          <div class="px-rack-queue-head"><i data-lucide="archive"></i>À ranger <span class="ct">${queue.length}</span></div>
          ${queue.map((o) => `
            <button class="px-qcard ${sel === o.id ? 'on' : ''}" data-px-q="${o.id}">
              <div class="num">${o.id}</div>
              <div class="who">${esc(custOf(o).name)}</div>
              <div class="sub">${o.pieces.length} pièce${o.pieces.length > 1 ? 's' : ''} · ${o.notified ? 'client notifié' : 'pas encore notifié'}</div>
            </button>`).join('') || '<div class="px-rack-hint">Rien à ranger.<br>Quand une commande passe « prête », elle arrive ici.</div>'}
          ${queue.length ? `<div class="px-rack-hint">${sel ? 'Touchez un emplacement libre →' : 'Sélectionnez une commande, puis son emplacement.'}</div>` : ''}
        </div>
        <div class="px-rails">
          ${RAILS.map((r) => {
            const free = Array.from({ length: RAIL_SIZE }, (_, i) => `${r}-${pad2(i + 1)}`).filter((s) => !rackSlots[s]).length;
            return `<div class="px-rail-row">
              <div class="px-rail-lbl"><i data-lucide="move-horizontal"></i>RAIL ${r}<span class="free">${free} libres</span></div>
              <div class="px-slots">
                ${Array.from({ length: RAIL_SIZE }, (_, i) => {
                  const slot = `${r}-${pad2(i + 1)}`;
                  const oid = rackSlots[slot];
                  if (oid) return `<button class="px-slot is-full" data-px-slot-full="${oid}"><span class="pos">${slot}</span><span class="oid">${oid.replace('P-', '')}</span></button>`;
                  return `<button class="px-slot ${sel ? 'is-target' : ''}" data-px-slot="${slot}"><span class="pos">${slot}</span></button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    panel.onclick = (e) => {
      const qc = e.target.closest('[data-px-q]');
      if (qc) { state.rackSelect = state.rackSelect === qc.dataset.pxQ ? null : qc.dataset.pxQ; renderRack(); icons(); return; }
      const full = e.target.closest('[data-px-slot-full]');
      if (full) { openDetail(full.dataset.pxSlotFull); return; }
      const slot = e.target.closest('[data-px-slot]');
      if (slot && state.rackSelect) {
        const o = findOrder(state.rackSelect);
        assignSlot(o, slot.dataset.pxSlot);
        state.rackSelect = null;
        queueIfOffline('Rangement');
        toast(`${o.id} → cintre ${o.rack}, retrouvable en un scan`);
        renderRack(); renderBadges(); icons();
        const flash = $(`[data-px-slot-full="${o.id}"]`, panel);
        if (flash) flash.classList.add('flash');
      }
    };
    icons();
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
    const net = $('#px-net', root);
    net.classList.toggle('is-off', state.offline);
    $('.px-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.px-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'px-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#px-offline-note', root);
    note.hidden = !state.offline;
    $('#px-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ boot ═══════════════════════ */
  function boot() { injectRoot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.KiwiPressing = { unlock, lock };
})();
