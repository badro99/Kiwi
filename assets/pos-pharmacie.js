/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · PHARMACIE — Pharmacie Ibn Batouta (PIN 0011), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Operational layer only — ZÉRO conseil médical. The terminal sells, splits and
 * tracks, it never advises a dose or a diagnosis. The headline differentiator is
 * TIERS PAYANT : on attache un patient et sa mutuelle (CNOPS / CNSS / AXA), et
 * chaque ligne couverte se découpe toute seule — « Part mutuelle 84 MAD · Part
 * patient 36 MAD ». Le patient paie sa part via le kit caisse ; la part mutuelle
 * part « à facturer ». Substitution générique avec l'économie, mode ordonnance
 * (patient + médecin prescripteur), garde de nuit, lots qui périment.
 *
 * The module self-registers with KiwiPosDispatch; the dispatcher owns the root
 * (#pos-pharmacie, .vx-screen) and the unlock/lock choreography. We build the
 * whole app into that root, reuse the caisse modal kit (.modal-veil, .modal,
 * .cash-*, .reader-*) and the shared #toast-stack. V1 = la carte part au lecteur
 * partenaire, sans encaissement Kiwi.
 *
 * Mid-shift seed : 11h passées, comptoir actif, une ordonnance CNOPS en tiers
 * payant déjà déposée, un solde patient à régler, un traitement chronique à
 * renouveler aujourd'hui, des lots qui périment, la garde de nuit prête à armer.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const fmtNum = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n));
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtExp = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const DAY = 86400 * 1000;
  const initials = (name) => name.replace(/^(Dr|M|Mme|Mlle)\.?\s+/i, '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const moveCaretEnd = (input) => { const v = input.value; input.value = ''; input.value = v; };

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

  /* Deterministic pseudo-barcode from a seed (vignette / ticket look). */
  function barcode(seed, h) {
    h = h || 28;
    let bars = '', x = 0, s = 7;
    const len = Math.max(seed.length * 4, 26);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + seed.charCodeAt(i % seed.length) + i * 11) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px;width:60%" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── pharmacy line-art ─────────────────────────
     Same visual voice as the pressing's garment dict: forest strokes,
     mint-tint fills, 64×64 grid. Recognizable pharmaceutical silhouettes. */
  const art = (inner) => `<svg class="ph-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    boite: art(`<rect class="fill" x="14" y="14" width="36" height="36" rx="4"/><rect x="14" y="14" width="36" height="36" rx="4"/><path d="M32 21v12M26 27h12"/><path class="thin" d="M14 41h36"/>`),
    plaquette: art(`<rect class="fill" x="10" y="20" width="44" height="24" rx="5"/><rect x="10" y="20" width="44" height="24" rx="5"/><circle class="thin" cx="20" cy="29" r="3"/><circle class="thin" cx="32" cy="29" r="3"/><circle class="thin" cx="44" cy="29" r="3"/><circle class="thin" cx="20" cy="38" r="3"/><circle class="thin" cx="32" cy="38" r="3"/><circle class="thin" cx="44" cy="38" r="3"/>`),
    gelule: art(`<path class="fill" d="M18 46 46 18a9 9 0 0 0-12.7-12.7" transform="translate(0 0)"/><rect class="fill" x="6" y="28" width="40" height="18" rx="9" transform="rotate(-45 26 37)"/><rect x="6" y="28" width="40" height="18" rx="9" transform="rotate(-45 26 37)"/><path d="M26 16 38 28" transform="rotate(-45 26 37)"/>`),
    sirop: art(`<path d="M26 8h12v6H26z"/><path class="fill" d="M24 14h16v6l4 6v24a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V26l4-6z"/><path d="M24 14h16v6l4 6v24a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V26l4-6z"/><path class="fill" d="M20 38h24v12a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 38h24"/>`),
    flacon: art(`<path d="M27 8h10v7H27z"/><path class="fill" d="M24 15h16l3 8v27a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V23z"/><path d="M24 15h16l3 8v27a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V23z"/><path d="M21 23h22"/><path class="thin" d="M27 33h10M27 40h10"/>`),
    spray: art(`<path d="M28 8h8v5h-8z"/><path d="M24 13h12l-2 4h-8z"/><path class="fill" d="M22 17h16v33a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path d="M22 17h16v33a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path class="thin" d="M38 22h6M38 27h5"/><path d="M30 24v8"/>`),
    sachet: art(`<path class="fill" d="M16 16h32l-3 38H19z"/><path d="M16 16h32l-3 38H19z"/><path class="thin" d="M16 16l4-6h24l4 6"/><path class="thin" d="M22 28h20M23 38h18"/>`),
    tube: art(`<path class="fill" d="M16 22h32v24a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z"/><path d="M16 22h32v24a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8z"/><path d="M16 22l5-12h22l5 12"/><path d="M27 10h10v6H27z"/><path class="thin" d="M24 34h16"/>`),
    ampoule: art(`<path class="fill" d="M27 14h10v30a5 5 0 0 1-10 0z"/><path d="M27 14h10v30a5 5 0 0 1-10 0z"/><path d="M25 14h14"/><path d="M29 8h6v6h-6z"/><path class="thin" d="M27 28h10"/><path class="thin" d="M31 36h2"/>`),
    seringue: art(`<path class="fill" d="M20 28l16-16 8 8-16 16z" transform="rotate(0)"/><path d="M14 50 26 38"/><path d="M22 26 38 10l8 8-16 16z"/><path d="M40 8 50 18"/><path class="thin" d="M30 22l6 6M34 18l6 6"/><path d="M22 42l-6 6"/>`),
    pansement: art(`<rect class="fill" x="10" y="24" width="44" height="16" rx="8" transform="rotate(-30 32 32)"/><rect x="10" y="24" width="44" height="16" rx="8" transform="rotate(-30 32 32)"/><rect class="fill" x="24" y="24" width="16" height="16" rx="3" transform="rotate(-30 32 32)"/><path class="thin" d="M30 30l4 4M34 30l-4 4" transform="rotate(-30 32 32)"/>`),
    thermo: art(`<path class="fill" d="M28 12a4 4 0 0 1 8 0v24a8 8 0 1 1-8 0z"/><path d="M28 12a4 4 0 0 1 8 0v24a8 8 0 1 1-8 0z"/><circle class="fill" cx="32" cy="44" r="5"/><path d="M32 20v22"/><path class="thin" d="M37 18h3M37 24h3M37 30h3"/>`),
    inhalateur: art(`<path class="fill" d="M22 26h14v22a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path d="M22 26h14v22a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path class="fill" d="M30 12h12v14H30z"/><path d="M30 12h12v14H30z"/><path d="M22 32h14"/><path class="thin" d="M34 18h6"/>`),
    creme: art(`<path d="M26 8h12v6H26z"/><path class="fill" d="M22 14h20v8H22z"/><path class="fill" d="M24 22h16v28a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4z"/><path d="M22 14h20v8H22z"/><path d="M24 22h16v28a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4z"/><path class="thin" d="M29 32h6M29 39h6"/>`),
    vitamine: art(`<circle class="fill" cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="20"/><path d="M32 22v20M22 32h20"/><path class="thin" d="M32 22v20" /><path class="thin" d="M25 25l14 14M39 25 25 39"/>`),
    masque: art(`<path class="fill" d="M14 26c4-3 32-3 36 0v12c-4 3-32 3-36 0z"/><path d="M14 26c4-3 32-3 36 0v12c-4 3-32 3-36 0z"/><path d="M14 26 8 22M14 38l-6 4M50 26l6-4M50 38l6 4"/><path class="thin" d="M14 31h36M22 26v12M32 26v12M42 26v12"/>`),
    test: art(`<rect class="fill" x="14" y="10" width="36" height="44" rx="5"/><rect x="14" y="10" width="36" height="44" rx="5"/><circle class="fill" cx="32" cy="24" r="6"/><circle cx="32" cy="24" r="6"/><path d="M22 38h20M22 45h14"/><path class="thin" d="M32 21v6M29 24h6"/>`),
    gel: art(`<path class="fill" d="M22 18h20v30a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z"/><path d="M22 18h20v30a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z"/><path d="M28 18v-4h8v4"/><path d="M36 10h8v6l-4 4"/><path class="thin" d="M22 34h20"/>`),
  };

  /* ───────────────────────── mutuelles + tiers payant ─────────────────────────
     Each mutuelle has a default reimbursement rate on COVERED (remboursable)
     lines. The pharmacy applies tiers payant: the patient pays only their part,
     the rest goes "à facturer" to the mutuelle. "sans" = pas de couverture. */
  const MUTUELLES = {
    cnops: { id: 'cnops', label: 'CNOPS', rate: 0.70, color: '#1F5D3C' },
    cnss:  { id: 'cnss',  label: 'CNSS',  rate: 0.70, color: '#1F5D3C' },
    axa:   { id: 'axa',   label: 'AXA Assurance', rate: 0.80, color: '#1F5D3C' },
    saham: { id: 'saham', label: 'Saham / Sanlam', rate: 0.80, color: '#1F5D3C' },
    sans:  { id: 'sans',  label: 'Sans mutuelle', rate: 0, color: '#9A9A9A' },
  };
  const MUT_LIST = ['cnops', 'cnss', 'axa', 'saham', 'sans'];

  /* ───────────────────────── médicaments (vignette, Tanger 2026) ─────────────
     rx     = liste I/II — délivrance sur ordonnance
     remb   = remboursable (entre dans le tiers payant)
     gen    = id d'un générique moins cher (substitution proposée)
     fridge = chaîne du froid
     unit   = libellé de l'unité de vente (boîte, flacon, tube…) */
  const CATALOG = [
    { id: 'antalgiques', label: 'Antalgiques · fièvre', items: [
      { id: 'doliprane1000', label: 'Doliprane 1000 mg', art: 'plaquette', dci: 'Paracétamol', form: '8 comprimés', unit: 'boîte', price: 12.5, remb: true, gen: 'paracetamol1000', poso: '1 cp jusqu’à 3×/jour, max 3 g/24 h' },
      { id: 'paracetamol1000', label: 'Paracétamol Pharma 5', art: 'plaquette', dci: 'Paracétamol', form: '8 comprimés · générique', unit: 'boîte', price: 7.5, remb: true, generic: true, poso: '1 cp jusqu’à 3×/jour' },
      { id: 'doliprane500', label: 'Doliprane 500 mg', art: 'plaquette', dci: 'Paracétamol', form: '16 comprimés', unit: 'boîte', price: 9.9, remb: true },
      { id: 'ibuprofene400', label: 'Ibuprofène 400 mg', art: 'plaquette', dci: 'Ibuprofène', form: '20 comprimés', unit: 'boîte', price: 18, remb: true, poso: 'Au cours des repas' },
      { id: 'aspegic', label: 'Aspégic 1000', art: 'sachet', dci: 'Acide acétylsalicylique', form: '20 sachets', unit: 'boîte', price: 22, remb: true },
    ] },
    { id: 'antibio', label: 'Antibiotiques · ordonnance', items: [
      { id: 'augmentin1g', label: 'Augmentin 1 g', art: 'plaquette', dci: 'Amoxicilline + ac. clavulanique', form: '14 comprimés', unit: 'boîte', price: 78, rx: true, remb: true, poso: '1 cp matin et soir' },
      { id: 'amoxicilline1g', label: 'Amoxicilline Pharma 5 1 g', art: 'plaquette', dci: 'Amoxicilline', form: '14 comprimés · générique', unit: 'boîte', price: 46, rx: true, remb: true, generic: true },
      { id: 'azithro', label: 'Azithromycine 500 mg', art: 'plaquette', dci: 'Azithromycine', form: '3 comprimés', unit: 'boîte', price: 64, rx: true, remb: true },
      { id: 'clamoxyl', label: 'Clamoxyl 500 mg', art: 'gelule', dci: 'Amoxicilline', form: '12 gélules', unit: 'boîte', price: 52, rx: true, remb: true, gen: 'amoxicilline1g' },
    ] },
    { id: 'respiratoire', label: 'Voies respiratoires', items: [
      { id: 'ventoline', label: 'Ventoline 100 µg', art: 'inhalateur', dci: 'Salbutamol', form: 'inhalateur 200 doses', unit: 'flacon', price: 33, rx: true, remb: true, poso: '1 à 2 bouffées si besoin' },
      { id: 'rhinofluimucil', label: 'Rhinofluimucil', art: 'spray', dci: 'Acétylcystéine + tuaminoheptane', form: 'spray nasal 10 ml', unit: 'flacon', price: 41 },
      { id: 'toplexil', label: 'Toplexil sirop', art: 'sirop', dci: 'Oxomémazine', form: 'sirop 150 ml', unit: 'flacon', price: 29, rx: true },
    ] },
    { id: 'digestif', label: 'Digestif', items: [
      { id: 'smecta', label: 'Smecta', art: 'sachet', dci: 'Diosmectite', form: '30 sachets', unit: 'boîte', price: 38, remb: true, poso: '1 sachet 3×/jour, à distance des repas' },
      { id: 'spasfon', label: 'Spasfon', art: 'plaquette', dci: 'Phloroglucinol', form: '30 comprimés', unit: 'boîte', price: 27, remb: true },
      { id: 'gaviscon', label: 'Gaviscon menthe', art: 'sachet', dci: 'Alginate de sodium', form: '24 sachets', unit: 'boîte', price: 45 },
    ] },
    { id: 'chronique', label: 'Traitements chroniques', items: [
      { id: 'glucophage', label: 'Glucophage 850 mg', art: 'plaquette', dci: 'Metformine', form: '30 comprimés', unit: 'boîte', price: 24, rx: true, remb: true, poso: 'Au cours des repas' },
      { id: 'amlor', label: 'Amlor 5 mg', art: 'plaquette', dci: 'Amlodipine', form: '30 gélules', unit: 'boîte', price: 36, rx: true, remb: true },
      { id: 'levothyrox', label: 'Levothyrox 75 µg', art: 'plaquette', dci: 'Lévothyroxine', form: '30 comprimés', unit: 'boîte', price: 19, rx: true, remb: true, poso: 'À jeun, le matin' },
    ] },
    { id: 'antiseptiques', label: 'Antiseptiques · soins', items: [
      { id: 'betadine', label: 'Bétadine dermique 10 %', art: 'flacon', dci: 'Povidone iodée', form: 'solution 125 ml', unit: 'flacon', price: 31, remb: true },
      { id: 'alcool', label: 'Alcool 70°', art: 'flacon', dci: 'Éthanol modifié', form: 'flacon 250 ml', unit: 'flacon', price: 11 },
      { id: 'pansements', label: 'Pansements assortis', art: 'pansement', dci: 'Compresses adhésives', form: 'boîte de 20', unit: 'boîte', price: 16 },
      { id: 'biafine', label: 'Biafine', art: 'tube', dci: 'Trolamine', form: 'tube 93 g', unit: 'tube', price: 48, remb: true },
    ] },
    { id: 'parapharma', label: 'Parapharmacie', items: [
      { id: 'vitc', label: 'Vitamine C 1000', art: 'vitamine', dci: 'Acide ascorbique', form: '20 comprimés effervescents', unit: 'tube', price: 26 },
      { id: 'magnesium', label: 'Magnésium B6', art: 'boite', dci: 'Magnésium + vit. B6', form: '60 comprimés', unit: 'boîte', price: 54 },
      { id: 'serumphy', label: 'Sérum physiologique', art: 'ampoule', dci: 'NaCl 0,9 %', form: '40 dosettes', unit: 'boîte', price: 19 },
      { id: 'gelhydro', label: 'Gel hydroalcoolique', art: 'gel', dci: 'Éthanol 70 %', form: 'flacon 500 ml', unit: 'flacon', price: 23 },
      { id: 'masques', label: 'Masques chirurgicaux', art: 'masque', dci: 'Type IIR', form: 'boîte de 50', unit: 'boîte', price: 35 },
      { id: 'testangine', label: 'Test antigénique', art: 'test', dci: 'Autotest COVID', form: 'unitaire', unit: 'kit', price: 30 },
    ] },
  ];
  const ITEMS = {};
  CATALOG.forEach((c) => c.items.forEach((it) => { it.cat = c.id; ITEMS[it.id] = it; }));

  /* stock state — units on hand; a couple are out / low (mid-shift reality) */
  const STOCK = {};
  Object.keys(ITEMS).forEach((id) => { STOCK[id] = 12 + (id.length * 7) % 40; });
  STOCK.ventoline = 0;          /* rupture — la démo le signale honnêtement */
  STOCK.augmentin1g = 3;        /* bas */
  STOCK.testangine = 4;
  STOCK.gelhydro = 6;
  const FRIDGE = new Set(['ventoline']);   /* chaîne du froid (démo) */

  /* ───────────────────────── lots qui périment (péremption) ───────────────── */
  const NOW = Date.now();
  const LOTS = [
    { id: 'augmentin1g', lot: 'AUG-2412', qty: 3,  exp: new Date(NOW + 26 * DAY) },
    { id: 'amoxicilline1g', lot: 'AMX-1180', qty: 7, exp: new Date(NOW + 41 * DAY) },
    { id: 'betadine', lot: 'BET-7741', qty: 5, exp: new Date(NOW + 58 * DAY) },
    { id: 'toplexil', lot: 'TOP-3390', qty: 4, exp: new Date(NOW + 62 * DAY) },
    { id: 'smecta', lot: 'SME-2205', qty: 11, exp: new Date(NOW + 74 * DAY) },
    { id: 'vitc', lot: 'VTC-9912', qty: 9, exp: new Date(NOW + 81 * DAY) },
    { id: 'serumphy', lot: 'SER-4408', qty: 14, exp: new Date(NOW + 88 * DAY) },
  ];
  function expTag(d) {
    const days = Math.round((d.getTime() - Date.now()) / DAY);
    if (days <= 30) return { cls: 'crit', label: `${days} j` };
    if (days <= 45) return { cls: 'urgent', label: `${days} j` };
    return { cls: 'soon', label: `${days} j` };
  }

  /* ───────────────────────── commande grossiste (CoopharMa style) ─────────── */
  const GROSSISTE_SUGGEST = [
    { id: 'ventoline', reason: 'rupture' },
    { id: 'augmentin1g', reason: 'stock bas · 3' },
    { id: 'testangine', reason: 'stock bas · 4' },
    { id: 'gelhydro', reason: 'stock bas · 6' },
    { id: 'doliprane1000', reason: 'rotation rapide' },
    { id: 'smecta', reason: 'rotation rapide' },
  ];

  /* ───────────────────────── médecins prescripteurs (Tanger) ──────────────── */
  /* Demo prescribers carry real-looking doctor names — a real paired pharmacy
     starts with an empty prescriber book (they type each médecin via the free
     input in openMedecinPicker). Local demo (unpaired) is byte-identical. */
  const MEDECINS = pvReal() ? [] : [
    { id: 'm1', name: 'Dr Khalid Benjelloun', spec: 'Médecine générale · Iberia' },
    { id: 'm2', name: 'Dr Salma Bennani', spec: 'Pédiatrie · Centre' },
    { id: 'm3', name: 'Dr Rachid Alaoui', spec: 'Cardiologie · Clinique Tanger' },
    { id: 'm4', name: 'Dr Imane Tazi', spec: 'Endocrinologie · Marshan' },
  ];
  const MED = Object.fromEntries(MEDECINS.map((m) => [m.id, m]));

  /* ───────────────────────── patients (Tanger) ─────────────────────────
     mutuelle variée, dont un sans mutuelle ; un traitement chronique à
     renouveler aujourd'hui (Mustapha). due = solde patient en attente. */
  /* Demo patients carry real-looking names, phones, mutuelle IDs and chronic
     treatments. A real paired pharmacy starts with an EMPTY patient book (staff
     add fiches via openPatientPicker → « Nouveau patient »). Local demo is
     byte-identical. */
  const PATIENTS = pvReal() ? [] : [
    { id: 'p1', name: 'Mustapha El Fassi', phone: '0661 24 88 19', mut: 'cnops', aff: 'CN-4471902', age: 64,
      chronic: { item: 'glucophage', label: 'Glucophage 850, diabète', every: 30, dueIn: 0 },
      allergies: ['Pénicilline'], visits: 38 },
    { id: 'p2', name: 'Najat Bouzidi', phone: '0670 55 31 02', mut: 'cnss', aff: 'CS-1180344', age: 41,
      chronic: { item: 'levothyrox', label: 'Levothyrox 75, thyroïde', every: 30, dueIn: 9 },
      allergies: [], visits: 21 },
    { id: 'p3', name: 'Hicham Ouazzani', phone: '0662 90 14 77', mut: 'axa', aff: 'AX-77120-3', age: 35,
      chronic: null, allergies: ['Sulfamides'], visits: 7 },
    { id: 'p4', name: 'Latifa Sebti', phone: '0650 33 21 88', mut: 'cnops', aff: 'CN-2209815', age: 58,
      chronic: { item: 'amlor', label: 'Amlor 5, tension', every: 30, dueIn: 16 },
      allergies: [], visits: 29, due: 36 },
    { id: 'p5', name: 'Karim Sentissi', phone: '0677 12 65 40', mut: 'sans', aff: '', age: 28,
      chronic: null, allergies: [], visits: 3 },
    { id: 'p6', name: 'Fatiha Mernissi', phone: '0668 47 90 12', mut: 'saham', aff: 'SH-560182', age: 47,
      chronic: null, allergies: ['Aspirine', 'Iode'], visits: 12 },
  ];
  const PAT = Object.fromEntries(PATIENTS.map((p) => [p.id, p]));

  /* ───────────────────────── garde — pharmacies de Tanger cette semaine ───── */
  const PHARMA_GARDE = [
    { name: pvName('Pharmacie Ibn Batouta') || 'Ma pharmacie', zone: 'Centre · Bd Pasteur', me: true },
    { name: 'Pharmacie du Détroit', zone: 'Marshan' },
    { name: 'Pharmacie Al Andalous', zone: 'Iberia' },
    { name: 'Pharmacie de la Plage', zone: 'Malabata' },
    { name: 'Pharmacie Beni Makada', zone: 'Beni Makada' },
  ];

  /* ───────────────────────── état ───────────────────────── */
  let saleSeq = 2480;
  let queuedSales = [];        /* ventes de garde déjà enregistrées ce soir */
  const state = {
    view: 'vente',
    mode: 'libre',             /* libre | ordonnance */
    query: '',
    ticket: null,              /* { num, lines:[], patient, medecin } */
    patientsQuery: '',
    night: false,
    gross: {},                 /* itemId → qty cochée pour la commande */
    offline: false, queued: 0,
    unlocked: false,
  };
  GROSSISTE_SUGGEST.forEach((g) => { state.gross[g.id] = 0; });

  /* garde — ventes de nuit déjà passées (mid-shift si la garde est armée) */
  const GARDE_SALES = [
    { t: '21:14', item: 'Doliprane 1000', who: 'Passage', amt: 12.5 },
    { t: '22:02', item: 'Augmentin 1 g', who: 'Ordonnance · garde', amt: 78 },
    { t: '23:37', item: 'Smecta + Spasfon', who: 'Passage', amt: 65 },
    { t: '01:05', item: 'Ventoline (dépannage)', who: 'Ordonnance · garde', amt: 33 },
  ];

  function freshTicket() {
    state.ticket = { num: posRef(`V-${saleSeq}`), lines: [], patient: null, medecin: null };
  }
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  const tkLabel = (t) => {
    const l = t.lines[0];
    if (!l) return 'Vente';
    const nm = ITEMS[l.itemId] ? ITEMS[l.itemId].label : 'Vente';
    return t.lines.length > 1 ? `${nm} +${t.lines.length - 1} art.` : nm;
  };
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le comptoir encaissait dans un ticket jeté juste après : la recette du jour
     n'existait nulle part et le titulaire voyait 0 MAD. Démo : no-op. */
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('pharmacie', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de vente repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à V-2480 et deux ventes portent le même numéro.
     Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) saleSeq = window.KiwiPosSale.nextSeq('pharmacie', saleSeq); } catch (_) {}

  /* ═══════════════════════ ROOT ═══════════════════════ */
  let root = null;

  function build(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="ph-rail">
        <div class="ph-brand">kiwi<i></i></div>
        <div class="ph-venue">
          <div class="ph-venue-name">${esc(pvName('Pharmacie Ibn Batouta') || 'Pharmacie')}
            <span class="ph-venue-night"><i data-lucide="moon"></i>Garde</span>
          </div>
          <div class="ph-venue-sub">${pvReal() ? (esc(pvCity('')) || '') : 'Tanger · Centre'}<br>Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="ph-nav" id="ph-nav">
          <button class="ph-nav-it on" data-ph-view="vente"><i data-lucide="pill"></i><span>Vente</span><b class="ph-nav-badge" id="ph-badge-cart"></b></button>
          <button class="ph-nav-it" data-ph-view="patients"><i data-lucide="users"></i><span>Patients</span><b class="ph-nav-badge" id="ph-badge-pat"></b></button>
          <button class="ph-nav-it" data-ph-view="garde"><i data-lucide="moon"></i><span>Garde</span><b class="ph-nav-badge" id="ph-badge-garde"></b></button>
          <button class="ph-nav-it" data-ph-view="stock"><i data-lucide="package"></i><span>Stock & péremption</span><b class="ph-nav-badge warn" id="ph-badge-stock"></b></button>
        </nav>
        <div class="ph-rail-foot">
          <button class="ph-net" id="ph-net" title="Simuler une coupure réseau">
            <i class="ph-net-dot"></i><span class="ph-net-label">En ligne</span>
          </button>
          <button class="ph-lock" id="ph-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="ph-main">
        <div class="ph-offline-note" id="ph-offline-note" hidden>
          Hors-ligne, les actions sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="ph-queue-count"></b>
        </div>
        <div class="ph-night-note" id="ph-night-note" hidden>
          <i data-lucide="moon"></i>Garde de nuit active, les ventes sont consignées au journal de garde.
        </div>
        <section class="ph-view is-on" data-ph-panel="vente">
          <header class="ph-head">
            <div><h1>Vente</h1><div class="ph-head-sub" id="ph-today"></div></div>
            <div class="ph-head-hint">Cherchez un médicament, ou scannez sa vignette</div>
          </header>
          <div class="ph-vente">
            <div class="ph-vente-left">
              <div class="ph-modebar">
                <div class="ph-seg" data-lens-demo id="ph-mode-seg">
                  <button class="ph-seg-it on" data-lens-item data-ph-mode="libre"><i data-lucide="shopping-bag"></i>Vente libre</button>
                  <button class="ph-seg-it" data-lens-item data-ph-mode="ordonnance"><i data-lucide="clipboard-list"></i>Ordonnance</button>
                </div>
                <span class="ph-mode-hint" id="ph-mode-hint"></span>
              </div>
              <div class="ph-search">
                <i data-lucide="search"></i>
                <input id="ph-q" placeholder="Doliprane, Augmentin, Ventoline, vitamine C…" autocomplete="off" />
                <button class="scan" id="ph-scan-btn"><i data-lucide="scan-line"></i>Scanner</button>
              </div>
              <div class="ph-grid-scroll" id="ph-gridwrap"></div>
            </div>
            <aside class="ph-ticket" id="ph-ticket"></aside>
          </div>
        </section>
        <section class="ph-view" data-ph-panel="patients"></section>
        <section class="ph-view" data-ph-panel="garde"></section>
        <section class="ph-view" data-ph-panel="stock"></section>
      </main>
      <div class="modal-veil" id="ph-sheet-veil"><div class="modal ph-sheet ph-rel" id="ph-sheetm"></div></div>
      <div class="modal-veil" id="ph-patient-veil"><div class="modal ph-patient ph-rel" id="ph-patientm"></div></div>
      <div class="modal-veil" id="ph-ptdetail-veil"><div class="modal ph-ptdetail ph-rel" id="ph-ptdetailm"></div></div>
      <div class="modal-veil" id="ph-pay-veil"><div class="modal ph-pay ph-rel" id="ph-paym"></div></div>
      <div class="modal-veil" id="ph-receipt-veil"><div class="modal ph-receiptm ph-rel" id="ph-receiptmm"></div></div>
      <div class="modal-veil" id="ph-scan-veil"><div class="modal ph-scan ph-rel" id="ph-scanm"></div></div>`;

    $('#ph-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ph-view]');
      if (b) switchView(b.dataset.phView);
    });
    $('#ph-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#ph-net', root).addEventListener('click', toggleOffline);
    $('#ph-mode-seg', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ph-mode]');
      if (b) setMode(b.dataset.phMode);
    });
    $('#ph-q', root).addEventListener('input', (e) => { state.query = e.target.value; renderGrid(); icons(); });
    $('#ph-scan-btn', root).addEventListener('click', openScan);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    freshTicket();
    state.unlocked = true;
    renderAll();
    if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {}
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.ph-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.phView === view));
    $$('.ph-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.phPanel === view));
    if (view === 'patients') renderPatients();
    if (view === 'garde') renderGarde();
    if (view === 'stock') renderStock();
    icons();
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    $$('[data-ph-mode]', root).forEach((b) => b.classList.toggle('on', b.dataset.phMode === mode));
    if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {}
    $('#ph-mode-hint', root).innerHTML = mode === 'ordonnance'
      ? '<i data-lucide="shield-check"></i>Patient + médecin rattachés à la délivrance'
      : '<i data-lucide="shopping-bag"></i>Conseil comptoir, patient facultatif';
    renderTicket();
    icons();
    toast(mode === 'ordonnance' ? 'Mode ordonnance, rattachez le patient et le prescripteur' : 'Vente libre, comptoir');
  }

  function renderBadges() {
    const cart = state.ticket.lines.reduce((s, l) => s + l.qty, 0);
    const renew = PATIENTS.filter((p) => p.chronic && p.chronic.dueIn <= 0).length;
    const lowOrOut = Object.keys(STOCK).filter((id) => STOCK[id] <= 6).length;
    const setBadge = (sel, n) => { const el = $(sel, root); el.textContent = n || ''; el.style.display = n ? '' : 'none'; };
    setBadge('#ph-badge-cart', cart);
    setBadge('#ph-badge-pat', renew);
    setBadge('#ph-badge-garde', state.night ? GARDE_SALES.length + queuedSales.length : '');
    setBadge('#ph-badge-stock', lowOrOut);
  }

  function renderAll() {
    $('#ph-today', root).textContent = `${fmtDT(new Date())}${pvReal() ? '' : ' · Dr Wafae au comptoir'}`;
    setMode(state.mode);
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    renderNight();
    switchView(state.view);
    icons();
  }

  /* ═══════════════════════ VENTE — vignette grid ═══════════════════════ */
  function matchItem(it, q) {
    const ql = q.toLowerCase();
    return it.label.toLowerCase().includes(ql) || (it.dci || '').toLowerCase().includes(ql);
  }

  function cardFlags(it) {
    const out = [];
    if (STOCK[it.id] <= 0) out.push('<span class="ph-flag out"><i data-lucide="package-x"></i>rupture</span>');
    if (it.rx) out.push('<span class="ph-flag rx"><i data-lucide="clipboard-list"></i>ordonnance</span>');
    if (it.remb) out.push('<span class="ph-flag vig"><i data-lucide="shield-check"></i>remb.</span>');
    if (it.gen) out.push('<span class="ph-flag gen"><i data-lucide="repeat"></i>générique</span>');
    if (FRIDGE.has(it.id)) out.push('<span class="ph-flag fridge"><i data-lucide="thermometer"></i>2-8°C</span>');
    return out.join('');
  }

  function itemCard(it, i) {
    const out = STOCK[it.id] <= 0;
    return `<button class="ph-card ${out ? 'is-out' : ''}" data-ph-item="${it.id}" style="--i:${i}">
      <span class="ph-card-top">
        <span class="ph-card-art">${ART[it.art] || ART.boite}</span>
        <span class="ph-card-id">
          <span class="ph-card-name">${esc(it.label)}</span>
          <span class="ph-card-form">${esc(it.dci)} · ${esc(it.form)}</span>
        </span>
      </span>
      <span class="ph-card-foot">
        <span class="ph-card-price">${fmtNum(it.price)} <small>MAD</small></span>
        <span class="ph-card-flags">${cardFlags(it)}</span>
      </span>
    </button>`;
  }

  function renderGrid() {
    const q = state.query.trim();
    const wrap = $('#ph-gridwrap', root);
    let i = 0;
    if (q) {
      const hits = [];
      CATALOG.forEach((c) => c.items.forEach((it) => { if (matchItem(it, q)) hits.push(it); }));
      wrap.innerHTML = hits.length
        ? `<div class="ph-cat-head">Résultats · « ${esc(q)} » <span style="font-family:var(--mono);color:var(--ink-4);">${hits.length}</span></div>
           <div class="ph-grid">${hits.map((it) => itemCard(it, i++)).join('')}</div>`
        : `<div class="ph-grid-empty">Aucun médicament pour « ${esc(q)} ».<br>Vérifiez l'orthographe ou la DCI, ou scannez la vignette.</div>`;
    } else {
      wrap.innerHTML = CATALOG.map((c) => `
        <div class="ph-cat-head">${esc(c.label)}</div>
        <div class="ph-grid">${c.items.map((it) => itemCard(it, i++)).join('')}</div>`).join('');
    }
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-ph-item]');
      if (b) openSheet(b.dataset.phItem);
    };
    icons();
  }

  /* ═══════════════════════ TIERS PAYANT — le découpage ═══════════════════════
     Une ligne est "couverte" si l'article est remboursable ET le patient a une
     mutuelle. La part mutuelle = round(prix × taux) par unité ; la part patient
     = reste. Sans mutuelle (ou article non remboursable) → 100 % patient. */
  function ticketMut() {
    const p = state.ticket.patient;
    return p ? MUTUELLES[p.mut] : MUTUELLES.sans;
  }
  function lineCovered(ln) {
    const it = ITEMS[ln.itemId];
    return !!it.remb && ticketMut().rate > 0;
  }
  function lineSplit(ln) {
    const it = ITEMS[ln.itemId];
    const gross = it.price * ln.qty;
    if (!lineCovered(ln)) return { gross, mut: 0, pat: gross };
    const mut = Math.round(it.price * ticketMut().rate) * ln.qty;
    return { gross, mut, pat: gross - mut };
  }
  function ticketSplit() {
    return state.ticket.lines.reduce((acc, ln) => {
      const s = lineSplit(ln);
      acc.gross += s.gross; acc.mut += s.mut; acc.pat += s.pat;
      return acc;
    }, { gross: 0, mut: 0, pat: 0 });
  }
  function ticketCount() { return state.ticket.lines.reduce((s, l) => s + l.qty, 0); }

  /* ═══════════════════════ TICKET (running) ═══════════════════════ */
  function patientRow() {
    const t = state.ticket;
    if (!t.patient) {
      const need = state.mode === 'ordonnance';
      return `<button class="ph-tk-row" id="ph-tk-patient"><i data-lucide="user-plus"></i>
        <span class="l"><b>${need ? 'Rattacher le patient' : 'Patient (tiers payant)'}</b><span>${need ? 'Requis en mode ordonnance' : 'Pour appliquer la mutuelle, sinon vente comptoir'}</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    const p = t.patient;
    const m = MUTUELLES[p.mut];
    return `<button class="ph-tk-row is-set" id="ph-tk-patient"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(p.name)}</b><span>${esc(p.phone)}${p.aff ? ` · ${esc(p.aff)}` : ''}</span></span>
      <span class="ph-mut-chip ${p.mut === 'sans' ? 'none' : ''}">${esc(m.label)}</span>
      <span class="edit">Changer</span></button>`;
  }
  function medecinRow() {
    const t = state.ticket;
    if (!t.medecin) {
      return `<button class="ph-tk-row" id="ph-tk-medecin"><i data-lucide="stethoscope"></i>
        <span class="l"><b>Médecin prescripteur</b><span>Requis pour une délivrance sur ordonnance</span></span>
        <span class="edit">Choisir</span></button>`;
    }
    const m = MED[t.medecin] || { name: t.medecin, spec: '' };
    return `<button class="ph-tk-row is-set" id="ph-tk-medecin"><i data-lucide="stethoscope"></i>
      <span class="l"><b>${esc(m.name)}</b><span>${esc(m.spec || 'prescripteur')}</span></span>
      <span class="edit">Changer</span></button>`;
  }

  function lineRow(ln, i) {
    const it = ITEMS[ln.itemId];
    const s = lineSplit(ln);
    const covered = lineCovered(ln);
    const genItem = it.gen ? ITEMS[it.gen] : null;
    let genStrip = '';
    if (genItem && STOCK[genItem.id] > 0) {
      const savePct = Math.round((1 - genItem.price / it.price) * 100);
      genStrip = `<div class="ph-line-gen">
        <i data-lucide="repeat"></i>
        <span class="l">Générique dispo · <b>${esc(genItem.label)}</b> <span class="save">−${savePct}%</span></span>
        <button class="sw" data-ph-gen="${i}">Substituer</button>
      </div>`;
    }
    return `<div class="ph-line">
      <div class="ph-line-main">
        <span class="ph-line-art">${ART[it.art] || ART.boite}</span>
        <span class="ph-line-mid">
          <span class="ph-line-name">${esc(it.label)}</span>
          <span class="ph-line-sub"><span class="dci">${esc(it.dci)}</span> · ${esc(it.unit)}</span>
        </span>
        <span class="ph-line-right">
          <span class="ph-line-price">${fmtMAD(s.gross)}</span>
          <span class="ph-line-qty">
            <button data-ph-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-ph-plus="${i}" aria-label="Ajouter">+</button>
          </span>
        </span>
      </div>
      ${covered ? `<div class="ph-line-split">
        <i data-lucide="shield-check"></i>
        <span class="seg"><span>Part mutuelle</span> <b>${fmtNum(s.mut)} MAD</b></span>
        <span class="sep">·</span>
        <span class="seg pat"><span>Part patient</span> <b>${fmtNum(s.pat)} MAD</b></span>
      </div>` : ''}
      ${genStrip}
    </div>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const split = ticketSplit();
    const count = ticketCount();
    const covered = !!t.patient && t.patient.mut !== 'sans' && t.lines.some((l) => lineCovered(l));
    const el = $('#ph-ticket', root);
    el.innerHTML = `
      <div class="ph-tk-head">
        <div><span class="ph-tk-title">${state.mode === 'ordonnance' ? 'Ordonnance' : 'Vente'}</span> <span class="ph-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="ph-tk-reset" id="ph-tk-reset">Vider</button>` : ''}
      </div>
      <div class="ph-tk-meta">
        ${patientRow()}
        ${state.mode === 'ordonnance' ? medecinRow() : ''}
      </div>
      <div class="ph-tk-lines" id="ph-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="ph-tk-empty">
            <i data-lucide="pill"></i>
            <div>Aucun article.<br>Cherchez un médicament et touchez sa vignette pour l'ajouter.</div>
          </div>`}
      </div>
      <div class="ph-tk-foot">
        <div class="ph-tk-splitbox ${covered ? 'is-on' : ''}">
          <div class="hd"><i data-lucide="shield-check"></i>Tiers payant · ${esc(ticketMut().label)}</div>
          <div class="rw mut"><span>Part mutuelle, à facturer</span><span class="v">${fmtMAD(split.mut)}</span></div>
          <div class="rw"><span>Reste à charge patient</span><span class="v">${fmtMAD(split.pat)}</span></div>
        </div>
        <div class="ph-tk-tot">
          <span class="pcs"><i data-lucide="package"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${split.mut ? `<span>dont ${fmtMAD(split.mut)} mutuelle</span>` : ''}
        </div>
        <div class="ph-tk-total">
          <span class="lbl">${covered ? 'À encaisser' : 'Total'}${covered ? '<small>part patient</small>' : ''}</span>
          <span class="val">${fmtMAD(covered ? split.pat : split.gross)}</span>
        </div>
        <button class="ph-validate" id="ph-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="receipt"></i> Valider la vente
        </button>
      </div>`;

    const reset = $('#ph-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); renderBadges(); icons(); };
    const patBtn = $('#ph-tk-patient', el);
    if (patBtn) patBtn.onclick = openPatientPicker;
    const medBtn = $('#ph-tk-medecin', el);
    if (medBtn) medBtn.onclick = openMedecinPicker;
    $('#ph-validate', el).onclick = validateSale;
    $('#ph-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-ph-minus]');
      const plus = e.target.closest('[data-ph-plus]');
      const gen = e.target.closest('[data-ph-gen]');
      if (gen) { substituteGeneric(+gen.dataset.phGen); return; }
      const idx = minus ? +minus.dataset.phMinus : plus ? +plus.dataset.phPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        if (STOCK[ln.itemId] != null && ln.qty >= STOCK[ln.itemId]) { toast(`Stock limité, ${STOCK[ln.itemId]} en rayon`); return; }
        ln.qty++;
      } else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); renderBadges(); icons();
    };
    icons();
  }

  function substituteGeneric(idx) {
    const t = state.ticket;
    const ln = t.lines[idx];
    const it = ITEMS[ln.itemId];
    if (!it.gen) return;
    const gen = ITEMS[it.gen];
    const savePct = Math.round((1 - gen.price / it.price) * 100);
    /* fusionner si le générique est déjà sur le ticket */
    const existing = t.lines.find((l, i) => i !== idx && l.itemId === gen.id);
    if (existing) { existing.qty += ln.qty; t.lines.splice(idx, 1); }
    else ln.itemId = gen.id;
    toast(`Substitué, ${gen.label} · −${savePct}% pour le patient`);
    renderTicket(); icons();
  }

  /* ═══════════════════════ PRODUCT SHEET ═══════════════════════ */
  const sheet = { itemId: null, qty: 1 };

  function openSheet(itemId) {
    const it = ITEMS[itemId];
    if (STOCK[it.id] <= 0) {
      toast(`${it.label}, rupture de stock. Ajoutez-le à la commande grossiste.`);
      return;
    }
    Object.assign(sheet, { itemId, qty: 1 });
    renderSheet();
    openVeil('#ph-sheet-veil');
    icons();
  }

  function renderSheet() {
    const it = ITEMS[sheet.itemId];
    const el = $('#ph-sheetm', root);
    const genItem = it.gen ? ITEMS[it.gen] : null;
    const genAvail = genItem && STOCK[genItem.id] > 0;
    const savePct = genAvail ? Math.round((1 - genItem.price / it.price) * 100) : 0;
    const covered = !!it.remb && ticketMut().rate > 0;
    const partMut = covered ? Math.round(it.price * ticketMut().rate) : 0;
    el.innerHTML = `
      <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ph-sheet-head">
        <span class="ph-sheet-art">${ART[it.art] || ART.boite}</span>
        <span class="ph-sheet-title">
          <h3>${esc(it.label)}</h3>
          <span class="sub">${esc(CATALOG.find((c) => c.id === it.cat).label)} · ${esc(it.form)}</span>
          <span class="dci">${esc(it.dci)}</span>
        </span>
        <span class="ph-sheet-price"><span class="val" id="ph-sheet-total">${fmtMAD(it.price * sheet.qty)}</span><span class="per">${fmtNum(it.price)} MAD × ${sheet.qty}</span></span>
      </div>

      <div class="ph-sheet-flags">
        ${it.rx ? '<span class="ph-flag rx"><i data-lucide="clipboard-list"></i>Liste · ordonnance</span>' : ''}
        ${it.remb ? '<span class="ph-flag vig"><i data-lucide="shield-check"></i>Remboursable</span>' : ''}
        ${FRIDGE.has(it.id) ? '<span class="ph-flag fridge"><i data-lucide="thermometer"></i>Chaîne du froid 2-8°C</span>' : ''}
        <span class="ph-flag out" style="background:var(--paper-mute);color:var(--ink-3);">Stock ${STOCK[it.id]}</span>
      </div>

      ${genAvail ? `<div class="ph-sub">
        <span class="art">${ART[genItem.art] || ART.boite}</span>
        <span class="l">
          <span class="t">Substitution générique</span>
          <b>${esc(genItem.label)}</b>
          <span>même DCI · <span class="save">−${savePct}%</span> soit ${fmtNum(genItem.price)} MAD</span>
        </span>
        <button class="pick" id="ph-sheet-gen">Choisir le générique</button>
      </div>` : ''}

      <div class="ph-row-2">
        <div class="ph-f">
          <div class="ph-f-lbl">Quantité <span class="opt">· en ${esc(it.unit)}s</span></div>
          <div class="ph-stepper">
            <button id="ph-qty-minus" aria-label="Moins">−</button>
            <b id="ph-qty-val">${sheet.qty}</b>
            <button id="ph-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
        ${covered ? `<div class="ph-f">
          <div class="ph-f-lbl">Tiers payant <span class="opt">· ${esc(ticketMut().label)}</span></div>
          <div class="ph-poso"><i data-lucide="shield-check"></i><span class="l">Part mutuelle <b>${fmtNum(partMut)} MAD</b> · part patient <b>${fmtNum(it.price - partMut)} MAD</b> par ${esc(it.unit)}</span></div>
        </div>` : ''}
      </div>

      ${it.poso ? `<div class="ph-f">
        <div class="ph-f-lbl">Posologie indiquée <span class="opt">· rappel d'étiquette, pas un conseil</span></div>
        <div class="ph-poso"><i data-lucide="file-text"></i><span class="l">${esc(it.poso)}</span></div>
      </div>` : ''}

      <div class="ph-sheet-foot">
        <button class="ph-btn secondary" data-ph-close>Annuler</button>
        <button class="ph-btn primary" id="ph-sheet-add"><i data-lucide="plus"></i>Ajouter · <span id="ph-sheet-cta">${fmtMAD(it.price * sheet.qty)}</span></button>
      </div>`;

    const refresh = () => {
      $('#ph-sheet-total', el).textContent = fmtMAD(it.price * sheet.qty);
      $('#ph-sheet-cta', el).textContent = fmtMAD(it.price * sheet.qty);
      $('.ph-sheet-price .per', el).textContent = `${fmtNum(it.price)} MAD × ${sheet.qty}`;
      $('#ph-qty-val', el).textContent = sheet.qty;
    };
    $('#ph-qty-minus', el).onclick = () => { if (sheet.qty > 1) { sheet.qty--; refresh(); } };
    $('#ph-qty-plus', el).onclick = () => {
      if (sheet.qty >= STOCK[it.id]) { toast(`Stock limité, ${STOCK[it.id]} en rayon`); return; }
      sheet.qty++; refresh();
    };
    $('#ph-sheet-add', el).onclick = () => addToTicket(it.id, sheet.qty);
    const genBtn = $('#ph-sheet-gen', el);
    if (genBtn) genBtn.onclick = () => { sheet.itemId = genItem.id; sheet.qty = Math.min(sheet.qty, STOCK[genItem.id]); renderSheet(); icons(); toast(`Générique sélectionné, ${genItem.label}`); };
    $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-sheet-veil'); });
  }

  function addToTicket(itemId, qty) {
    const t = state.ticket;
    const existing = t.lines.find((l) => l.itemId === itemId);
    if (existing) existing.qty = Math.min(STOCK[itemId], existing.qty + qty);
    else t.lines.push({ itemId, qty });
    closeVeil('#ph-sheet-veil');
    const it = ITEMS[itemId];
    if (it.rx && state.mode !== 'ordonnance') {
      toast(`${it.label}, médicament listé. Pensez au mode ordonnance.`);
    } else {
      toast(`${it.label} × ${qty}, ajouté`);
    }
    renderTicket(); renderBadges(); icons();
  }

  /* ═══════════════════════ PATIENT — phone-first ═══════════════════════ */
  function dueOf(p) { return p.due || 0; }

  function openPatientPicker() {
    const el = $('#ph-patientm', root);
    let mode = 'search';
    const render = (q) => {
      const digits = (q || '').replace(/\D/g, '');
      const ql = (q || '').toLowerCase();
      const hits = !q ? PATIENTS : PATIENTS.filter((p) =>
        (digits && p.phone.replace(/\D/g, '').includes(digits)) ||
        (!digits && p.name.toLowerCase().includes(ql)));
      el.innerHTML = `
        <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Patient</h3>
        <p class="modal-subtle">On cherche par téléphone, la mutuelle et l'historique remontent automatiquement.</p>
        <div class="ph-phone-in"><i data-lucide="phone"></i>
          <input id="ph-pt-q" inputmode="tel" placeholder="06… ou nom du patient" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="ph-pt-results" id="ph-pt-results">
            ${hits.map((p) => {
              const m = MUTUELLES[p.mut];
              return `<button class="ph-pt-row" data-ph-pt="${p.id}">
                <span class="ph-pt-ava">${esc(initials(p.name))}</span>
                <span class="ph-pt-mid">
                  <span class="ph-pt-name">${esc(p.name)} <span class="ph-mut-chip ${p.mut === 'sans' ? 'none' : ''}">${esc(m.label)}</span></span>
                  <span class="ph-pt-sub">${esc(p.phone)}${p.aff ? ` · ${esc(p.aff)}` : ''}</span>
                </span>
                <span class="ph-pt-right">${dueOf(p) ? `<span class="due">solde ${fmtNum(dueOf(p))} MAD</span>` : `${p.visits} visites`}</span>
              </button>`;
            }).join('') || `<div class="ph-grid-empty" style="padding:18px;">Aucun patient pour « ${esc(q)} »</div>`}
          </div>
          ${hits.length === 1 ? recoPanel(hits[0]) : ''}
          <button class="ph-pt-new" id="ph-pt-new"><i data-lucide="user-plus"></i>Nouveau patient${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          ${state.mode !== 'ordonnance' ? `<div class="ph-sheet-foot" style="margin-top:10px;">
            <button class="ph-btn ghost" id="ph-pt-passage">Vente comptoir, sans patient</button>
          </div>` : ''}` : `
          <div class="ph-pt-form">
            <input class="ph-in" id="ph-pt-name" placeholder="Nom et prénom" value="${esc(/^[\\d\\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <div class="ph-in-row">
              <input class="ph-in" id="ph-pt-tel" inputmode="tel" placeholder="Téléphone" value="${esc(/^[\\d\\s.+-]+$/.test(q || '') ? q : '')}" />
              <select class="ph-select" id="ph-pt-mut">
                ${MUT_LIST.map((id) => `<option value="${id}">${esc(MUTUELLES[id].label)}</option>`).join('')}
              </select>
            </div>
            <input class="ph-in" id="ph-pt-aff" placeholder="N° d'affiliation (optionnel)" />
            <div class="ph-sheet-foot" style="margin-top:4px;">
              <button class="ph-btn secondary" id="ph-pt-back">Retour</button>
              <button class="ph-btn primary" id="ph-pt-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#ph-pt-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#ph-pt-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-patient-veil'); });
      $$('[data-ph-pt]', el).forEach((b) => {
        b.onclick = () => {
          const p = PAT[b.dataset.phPt];
          state.ticket.patient = p;
          closeVeil('#ph-patient-veil');
          const m = MUTUELLES[p.mut];
          toast(p.mut === 'sans' ? `${p.name}, sans mutuelle, vente directe` : `${p.name}, ${m.label}, tiers payant actif`);
          renderTicket(); renderBadges(); icons();
        };
      });
      const newBtn = $('#ph-pt-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const passage = $('#ph-pt-passage', el);
      if (passage) passage.onclick = () => { state.ticket.patient = null; closeVeil('#ph-patient-veil'); renderTicket(); icons(); };
      const back = $('#ph-pt-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#ph-pt-create', el);
      if (create) create.onclick = () => {
        const name = $('#ph-pt-name', el).value.trim();
        const tel = $('#ph-pt-tel', el).value.trim();
        const mut = $('#ph-pt-mut', el).value;
        const aff = $('#ph-pt-aff', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'px' + Date.now().toString(36);
        const p = { id, name, phone: tel, mut, aff, age: null, chronic: null, allergies: [], visits: 0 };
        PATIENTS.unshift(p); PAT[id] = p;
        state.ticket.patient = p;
        closeVeil('#ph-patient-veil');
        toast(`Fiche créée, ${name} · ${MUTUELLES[mut].label}`);
        renderTicket(); renderBadges(); icons();
      };
    };
    render('');
    openVeil('#ph-patient-veil');
    icons();
    setTimeout(() => { const i = $('#ph-pt-q', el); if (i) i.focus(); }, 60);
  }

  function recoPanel(p) {
    const m = MUTUELLES[p.mut];
    return `<div class="ph-reco">
      <div class="ph-reco-head"><i data-lucide="sparkles"></i>${esc(p.name)}, fiche reconnue</div>
      <div class="ph-reco-rows">
        <div class="ph-reco-row"><i data-lucide="shield-check"></i>${esc(m.label)}${p.aff ? ` · ${esc(p.aff)}` : ''}${p.mut !== 'sans' ? ` · prise en charge ${Math.round(m.rate * 100)} %` : ''}</div>
        ${p.chronic ? `<div class="ph-reco-row"><i data-lucide="repeat" class="${p.chronic.dueIn <= 0 ? 'warn' : ''}"></i>${esc(p.chronic.label)}${p.chronic.dueIn <= 0 ? ', <b>renouvellement dû</b>' : `, dans ${p.chronic.dueIn} j`}</div>` : ''}
        ${(p.allergies || []).length ? `<div class="ph-reco-row"><i data-lucide="triangle-alert" class="danger"></i>Allergie · <b>${p.allergies.map(esc).join(', ')}</b></div>` : ''}
        ${dueOf(p) ? `<div class="ph-reco-row"><i data-lucide="hand-coins" class="warn"></i>Solde en attente · <b>${fmtNum(dueOf(p))} MAD</b></div>` : ''}
      </div>
    </div>`;
  }

  /* ═══════════════════════ MÉDECIN prescripteur ═══════════════════════ */
  function openMedecinPicker() {
    const el = $('#ph-patientm', root);
    el.innerHTML = `
      <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Médecin prescripteur</h3>
      <p class="modal-subtle">Rattaché à la délivrance, il apparaît sur le ticket et le registre des ordonnances.</p>
      <div class="ph-presc">
        <div class="ph-presc-chips" id="ph-presc-list">
          ${MEDECINS.map((m) => `<button class="ph-presc-chip ${state.ticket.medecin === m.id ? 'on' : ''}" data-ph-med="${m.id}"><b>${esc(m.name)}</b><span>${esc(m.spec)}</span></button>`).join('')}
        </div>
        <input class="ph-in" id="ph-med-free" placeholder="Autre médecin, nom libre…" />
        <div class="ph-sheet-foot" style="margin-top:4px;">
          <button class="ph-btn secondary" data-ph-close>Annuler</button>
          <button class="ph-btn primary" id="ph-med-ok"><i data-lucide="check"></i>Rattacher</button>
        </div>
      </div>`;
    openVeil('#ph-patient-veil');
    icons();
    let pick = state.ticket.medecin;
    $('#ph-presc-list', el).onclick = (e) => {
      const b = e.target.closest('[data-ph-med]');
      if (!b) return;
      pick = b.dataset.phMed;
      $$('[data-ph-med]', el).forEach((x) => x.classList.toggle('on', x === b));
      $('#ph-med-free', el).value = '';
    };
    $('#ph-med-free', el).oninput = (e) => { if (e.target.value.trim()) { pick = null; $$('[data-ph-med]', el).forEach((x) => x.classList.remove('on')); } };
    $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-patient-veil'); });
    $('#ph-med-ok', el).onclick = () => {
      const free = $('#ph-med-free', el).value.trim();
      if (free) state.ticket.medecin = free;
      else if (pick) state.ticket.medecin = pick;
      else { toast('Choisissez un médecin ou saisissez un nom'); return; }
      closeVeil('#ph-patient-veil');
      const m = MED[state.ticket.medecin];
      toast(`Prescripteur, ${m ? m.name : free}`);
      renderTicket(); icons();
    };
  }

  /* ═══════════════════════ VALIDATE → RECEIPT ═══════════════════════ */
  function validateSale() {
    const t = state.ticket;
    if (!t.lines.length) return;
    const needsRx = t.lines.some((l) => ITEMS[l.itemId].rx);
    if (state.mode === 'ordonnance' || needsRx) {
      if (!t.patient) { openPatientPicker(); toast("Rattachez le patient avant de valider l'ordonnance"); return; }
      if (!t.medecin) { openMedecinPicker(); toast('Indiquez le médecin prescripteur'); return; }
    }
    /* allergie croisée simple : si un antibiotique pénicilline + allergie connue */
    if (t.patient && (t.patient.allergies || []).some((a) => /pénicilline|penicilline/i.test(a))) {
      const pen = t.lines.find((l) => /amoxicilline|augmentin|clamoxyl/i.test(ITEMS[l.itemId].dci + ITEMS[l.itemId].label));
      if (pen) toast(`Attention, ${t.patient.name} : allergie Pénicilline notée au dossier`, 3200);
    }
    openReceipt(t);
  }

  // Real store identity from the 6-digit pairing / hosted session. A real pharmacy
  // prints ITS OWN name + city (no demo "Pharmacie Ibn Batouta" / Bd Pasteur / the
  // demo pharmacist). Local demo (unpaired localhost) unchanged.
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  function receiptHTML(t) {
    const split = ticketSplit();
    const p = t.patient;
    const m = ticketMut();
    const num = t.num;
    return `<div class="ph-receipt">
      <div class="c b lg">${esc((pvName('Pharmacie Ibn Batouta') || 'Pharmacie').toUpperCase())}</div>
      <div class="c mut">${pvReal() ? (pvCity('') ? esc(pvCity('')) + ' · ' : '') + 'propulsé par Kiwi' : 'Bd Pasteur, Tanger Centre<br>05 39 94 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="row"><span>Ticket</span><span class="b">${num}</span></div>
      <div class="row"><span>${fmtDT(new Date())}</span><span>${pvReal() ? '' : 'Dr Wafae'}</span></div>
      ${p ? `<div class="row"><span>Patient</span><span>${esc(p.name)}</span></div>` : `<div class="row"><span>Client</span><span>Passage</span></div>`}
      ${p && p.mut !== 'sans' ? `<div class="row"><span>Mutuelle</span><span>${esc(m.label)}${p.aff ? ' · ' + esc(p.aff) : ''}</span></div>` : ''}
      ${t.medecin ? `<div class="row"><span>Prescripteur</span><span>${esc((MED[t.medecin] || {}).name || t.medecin)}</span></div>` : ''}
      <hr>
      ${t.lines.map((ln) => {
        const it = ITEMS[ln.itemId];
        return `<div class="row"><span class="nm">${ln.qty} × ${esc(it.label)}</span><span>${fmtNum(it.price * ln.qty)}</span></div>`;
      }).join('')}
      <hr>
      <div class="row"><span>Total brut</span><span>${fmtNum(split.gross)} MAD</span></div>
      ${split.mut ? `<div class="row mutrow"><span>Tiers payant ${esc(m.label)}</span><span>−${fmtNum(split.mut)} MAD</span></div>` : ''}
      <div class="row tot"><span>${split.mut ? 'À PAYER (PATIENT)' : 'TOTAL'}</span><span>${fmtNum(split.mut ? split.pat : split.gross)} MAD</span></div>
      ${split.mut ? `<div class="row mutrow"><span>À facturer ${esc(m.label)}</span><span>${fmtNum(split.mut)} MAD</span></div>` : ''}
      <hr>
      <div class="c">${barcode(num, 26)}</div>
      <div class="c mut">${num} · bsahtek, l'lah ichafik</div>
    </div>`;
  }

  function openReceipt(t) {
    const el = $('#ph-receiptmm', root);
    const split = ticketSplit();
    el.innerHTML = `
      <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Ticket, ${t.num}</h3>
      <p class="modal-subtle">${split.mut ? `Tiers payant ${esc(ticketMut().label)} appliqué, le patient règle sa part.` : 'Vente comptoir, règlement direct.'}</p>
      ${receiptHTML(t)}
      <div class="ph-sheet-foot">
        <button class="ph-btn secondary" id="ph-rc-print"><i data-lucide="printer"></i>Imprimer</button>
        <button class="ph-btn primary" id="ph-rc-pay"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(split.mut ? split.pat : split.gross)}</button>
      </div>`;
    openVeil('#ph-receipt-veil');
    icons();
    $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-receipt-veil'); });
    $('#ph-rc-print', el).onclick = () => toast('Ticket envoyé à l’imprimante thermique (80 mm)');
    $('#ph-rc-pay', el).onclick = () => { closeVeil('#ph-receipt-veil'); openPay(t); };
  }

  /* ═══════════════════════ PAYMENT — tiers payant aware ═══════════════════════ */
  function openPay(t) {
    const el = $('#ph-paym', root);
    const split = ticketSplit();
    const m = ticketMut();
    const due = split.mut ? split.pat : split.gross;     /* le patient ne paie que sa part */

    const finalize = (method, rendu) => {
      /* décrémenter le stock, consigner, repartir sur un ticket vierge */
      t.lines.forEach((ln) => { if (STOCK[ln.itemId] != null) STOCK[ln.itemId] = Math.max(0, STOCK[ln.itemId] - ln.qty); });
      if (split.mut && t.patient) {
        toast(`Part mutuelle ${fmtMAD(split.mut)} · à facturer ${m.label}`, 2600);
      }
      if (state.night) {
        queuedSales.unshift({ t: fmtTime(new Date()), item: ITEMS[t.lines[0].itemId].label + (t.lines.length > 1 ? ` +${t.lines.length - 1}` : ''), who: t.patient ? t.patient.name : 'Passage', amt: due });
      }
      /* Seule la part patient rentre au comptoir. La part mutuelle est facturée
         au tiers payant plus tard : la journaliser ici gonflerait la recette du
         jour d'un encaissement qui n'a pas eu lieu. */
      postDay(due, method, tkLabel(t), t.num);
      saleSeq++;
      const wasNum = t.num;
      freshTicket();
      closeVeil('#ph-pay-veil');
      queueIfOffline(`Vente ${wasNum}`);
      toast(`${wasNum} encaissé, ${fmtMAD(due)} en ${method === 'carte' ? 'carte' : 'espèces'}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      renderTicket(); renderBadges(); renderGrid(); icons();
    };

    const step1 = () => {
      el.innerHTML = `
        <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Encaissement</h3>
        <p class="modal-subtle">${t.num}${t.patient ? ' · ' + esc(t.patient.name) : ' · passage'}</p>
        ${split.mut ? `
          <div class="ph-pay-splitwrap">
            <div class="ph-pay-splitcard pat">
              <div class="t"><i data-lucide="user"></i>Part patient</div>
              <div class="a">${fmtMAD(split.pat)}</div>
              <div class="who">à encaisser maintenant</div>
            </div>
            <div class="ph-pay-splitcard mut">
              <div class="t"><i data-lucide="building-2"></i>Part ${esc(m.label)}</div>
              <div class="a">${fmtMAD(split.mut)}</div>
              <div class="who">à facturer (tiers payant)</div>
            </div>
          </div>
          <div class="ph-pay-note"><i data-lucide="shield-check"></i>Le patient ne règle que sa part, la mutuelle est facturée à part.</div>
        ` : `<div class="modal-amount size-md">${fmtMAD(due)}</div>`}
        <div class="ph-pay-opts">
          <button class="ph-pay-opt" data-ph-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé · flous</span></span>
            <span class="amt">${fmtMAD(due)}</span>
          </button>
          <button class="ph-pay-opt" data-ph-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
            <span class="amt">${fmtMAD(due)}</span>
          </button>
        </div>`;
      icons();
      $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-pay-veil'); });
      $$('[data-ph-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.phM === 'especes' ? stepCash() : stepCard());
      });
    };

    const stepCash = () => {
      let received = due;
      el.innerHTML = `
        <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(due)}</h3>
        <p class="modal-subtle">${t.num}${split.mut ? ' · part patient' : ''}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ph-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="ph-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${Math.round(due)}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu" id="ph-cash-rendubox"><span class="lbl">Rendu</span><span class="val mono" id="ph-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ph-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const box = $('#ph-cash-rendubox', el);
      const refresh = () => {
        const rendu = Math.max(0, received - due);
        $('#ph-cash-rendu', el).textContent = fmtMAD(rendu);
        $('#ph-cash-ok', el).disabled = received < due;
        box.classList.toggle('is-positive', rendu > 0);
        box.classList.toggle('is-short', received < due);
      };
      $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-pay-veil'); });
      $('#ph-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#ph-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#ph-cash-ok', el).onclick = () => finalize('especes', Math.max(0, received - due));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(due)}</h3>
        <p class="modal-subtle">${t.num} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ph-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ph-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-pay-veil'); });
      setTimeout(() => {
        const disc = $('#ph-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#ph-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(due, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => finalize('carte', 0), 900);
        });
      }, 1900);
    };

    step1();
    openVeil('#ph-pay-veil');
  }

  /* ═══════════════════════ PATIENTS (liste) ═══════════════════════ */
  function renderPatients() {
    const panel = $('[data-ph-panel="patients"]', root);
    const q = state.patientsQuery;
    const hits = q ? PATIENTS.filter((p) => {
      const digits = q.replace(/\D/g, '');
      return p.name.toLowerCase().includes(q.toLowerCase()) || (digits.length >= 2 && p.phone.replace(/\D/g, '').includes(digits));
    }) : PATIENTS;
    panel.innerHTML = `
      <header class="ph-head">
        <div><h1>Patients</h1><div class="ph-head-sub">Fiche par téléphone, mutuelle, traitements chroniques, allergies</div></div>
        <div class="ph-search" style="margin:0;width:300px;">
          <i data-lucide="search"></i>
          <input id="ph-pat-q" placeholder="Nom ou téléphone…" value="${esc(q)}" autocomplete="off" />
        </div>
      </header>
      <div class="ph-patients-scroll">
        <div class="ph-pt-grid">
          ${hits.map(patientCard).join('') || `<div class="ph-grid-empty">Aucun patient pour « ${esc(q)} ».</div>`}
        </div>
      </div>`;
    $('#ph-pat-q', panel).oninput = (e) => { state.patientsQuery = e.target.value; renderPatients(); icons(); const i = $('#ph-pat-q', panel); i.focus(); moveCaretEnd(i); };
    panel.onclick = (e) => {
      const ren = e.target.closest('[data-ph-renew]');
      if (ren) { e.stopPropagation(); startRenewal(ren.dataset.phRenew); return; }
      const card = e.target.closest('[data-ph-pcard]');
      if (card) openPatientDetail(card.dataset.phPcard);
    };
    icons();
  }

  function patientCard(p) {
    const m = MUTUELLES[p.mut];
    const renewDue = p.chronic && p.chronic.dueIn <= 0;
    return `<button class="ph-pcard ${p.due || renewDue ? 'is-due' : ''}" data-ph-pcard="${p.id}">
      <div class="ph-pcard-top">
        <span class="ph-pcard-ava">${esc(initials(p.name))}</span>
        <span class="ph-pcard-who">
          <div class="ph-pcard-name">${esc(p.name)}</div>
          <div class="ph-pcard-tel">${esc(p.phone)}</div>
        </span>
        <span class="ph-pill ${p.mut === 'sans' ? 'none' : 'mut'}">${esc(m.label)}</span>
      </div>
      <div class="ph-pcard-meta">
        <span class="ph-pill"><i data-lucide="history"></i>${p.visits} visite${p.visits > 1 ? 's' : ''}</span>
        ${p.mut !== 'sans' ? `<span class="ph-pill ok"><i data-lucide="shield-check"></i>${Math.round(m.rate * 100)} %</span>` : ''}
        ${(p.allergies || []).length ? `<span class="ph-pill allerg"><i data-lucide="triangle-alert"></i>${p.allergies.length} allergie${p.allergies.length > 1 ? 's' : ''}</span>` : ''}
        ${p.due ? `<span class="ph-pill due"><i data-lucide="hand-coins"></i>solde ${fmtNum(p.due)} MAD</span>` : ''}
      </div>
      ${p.chronic ? `<div class="ph-pcard-chronic" style="${renewDue ? '' : 'background:var(--paper-mute);color:var(--ink-3);'}">
        <i data-lucide="repeat"></i>
        <span class="l"><b>${esc(p.chronic.label)}</b> · ${renewDue ? 'renouvellement dû' : `dans ${p.chronic.dueIn} j`}</span>
        ${renewDue ? `<span class="ren" data-ph-renew="${p.id}">Renouveler</span>` : ''}
      </div>` : ''}
    </button>`;
  }

  function openPatientDetail(id) {
    const p = PAT[id];
    if (!p) return;
    const m = MUTUELLES[p.mut];
    const el = $('#ph-ptdetailm', root);
    el.innerHTML = `
      <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ph-ptd-head">
        <span class="ph-ptd-ava">${esc(initials(p.name))}</span>
        <span class="ph-ptd-who">
          <h3>${esc(p.name)}</h3>
          <div class="tel">${esc(p.phone)}${p.age ? ` · ${p.age} ans` : ''}</div>
        </span>
      </div>

      <div class="ph-ptd-sec">
        <div class="ph-ptd-sec-lbl"><i data-lucide="shield-check"></i>Couverture</div>
        <div class="ph-ptd-grid">
          <div class="ph-ptd-field"><div class="k">Mutuelle</div><div class="v">${esc(m.label)}</div></div>
          <div class="ph-ptd-field"><div class="k">N° d'affiliation</div><div class="v mono">${esc(p.aff || '—')}</div></div>
          <div class="ph-ptd-field"><div class="k">Taux de prise en charge</div><div class="v">${p.mut === 'sans' ? '—' : Math.round(m.rate * 100) + ' %'}</div></div>
          <div class="ph-ptd-field"><div class="k">Solde en attente</div><div class="v" style="${p.due ? 'color:var(--danger-mute);' : ''}">${p.due ? fmtNum(p.due) + ' MAD' : 'à jour'}</div></div>
        </div>
      </div>

      <div class="ph-ptd-sec">
        <div class="ph-ptd-sec-lbl"><i data-lucide="repeat"></i>Traitements chroniques</div>
        ${p.chronic ? `<div class="ph-ptd-list">
          <div class="ph-ptd-trt">
            <span class="art">${ART[ITEMS[p.chronic.item] ? ITEMS[p.chronic.item].art : 'plaquette'] || ART.plaquette}</span>
            <span class="l"><b>${esc(p.chronic.label)}</b><span>Renouvellement tous les ${p.chronic.every} jours · ${p.chronic.dueIn <= 0 ? 'dû aujourd’hui' : `dans ${p.chronic.dueIn} j`}</span></span>
            <button class="ren ${p.chronic.dueIn <= 0 ? '' : 'done'}" data-ph-renew="${p.id}">${p.chronic.dueIn <= 0 ? 'Renouveler' : 'Préparer'}</button>
          </div>
        </div>` : '<div class="ph-garde-empty" style="padding:16px;">Aucun traitement chronique enregistré.</div>'}
      </div>

      <div class="ph-ptd-sec">
        <div class="ph-ptd-sec-lbl"><i data-lucide="triangle-alert"></i>Allergies & notes</div>
        ${(p.allergies || []).length ? `<div class="ph-allerg-row">${p.allergies.map((a) => `<span class="ph-pill allerg"><i data-lucide="triangle-alert"></i>${esc(a)}</span>`).join('')}</div>` : '<div style="font-size:12.5px;color:var(--ink-3);">Aucune allergie connue.</div>'}
      </div>

      <div class="ph-ptd-actions">
        <button class="ph-btn secondary" id="ph-ptd-call"><i data-lucide="phone"></i>Appeler</button>
        <button class="ph-btn primary" id="ph-ptd-sell"><i data-lucide="pill"></i>Nouvelle vente</button>
      </div>`;
    openVeil('#ph-ptdetail-veil');
    icons();
    $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-ptdetail-veil'); });
    const ren = $('[data-ph-renew]', el);
    if (ren) ren.onclick = () => { closeVeil('#ph-ptdetail-veil'); startRenewal(p.id); };
    $('#ph-ptd-call', el).onclick = () => toast(`Appel, ${p.phone} (démo)`);
    $('#ph-ptd-sell', el).onclick = () => {
      state.ticket.patient = p;
      closeVeil('#ph-ptdetail-veil');
      switchView('vente');
      renderTicket(); icons();
      toast(`${p.name} rattaché, ${m.label}`);
    };
  }

  function startRenewal(id) {
    const p = PAT[id];
    if (!p || !p.chronic) return;
    const it = ITEMS[p.chronic.item];
    state.ticket.patient = p;
    if (state.mode !== 'ordonnance') setMode('ordonnance');
    if (it) {
      const existing = state.ticket.lines.find((l) => l.itemId === it.id);
      if (existing) existing.qty++;
      else state.ticket.lines.push({ itemId: it.id, qty: 1 });
      if (p.chronic.dueIn <= 0) p.chronic.dueIn = p.chronic.every;
    }
    switchView('vente');
    renderTicket(); renderBadges(); icons();
    toast(`Renouvellement préparé, ${p.chronic.label}`);
  }

  /* ═══════════════════════ GARDE ═══════════════════════ */
  function renderGarde() {
    const panel = $('[data-ph-panel="garde"]', root);
    const sales = state.night ? queuedSales.concat(GARDE_SALES) : [];
    const total = sales.reduce((s, x) => s + x.amt, 0);
    panel.innerHTML = `
      <header class="ph-head">
        <div><h1>Garde de nuit</h1><div class="ph-head-sub">Le badge passe en mode garde · journal des ventes de nuit</div></div>
      </header>
      <div class="ph-garde-scroll">
        <div class="ph-garde-toggle ${state.night ? 'is-on' : ''}" id="ph-garde-toggle">
          <span class="ic"><i data-lucide="moon"></i></span>
          <span class="l">
            <b>Pharmacie de garde${state.night ? ', active' : ''}</b>
            <span>${state.night ? 'Le terminal consigne chaque vente au journal de garde.' : 'Armez la garde quand vous prenez le service de nuit.'}</span>
          </span>
          <span class="ph-switch"></span>
        </div>

        <div class="ph-garde-cols">
          <div class="ph-panel">
            <div class="ph-panel-hd">
              <span class="t"><i data-lucide="receipt"></i>Journal des ventes de garde</span>
              <span class="ct">${sales.length}</span>
            </div>
            ${state.night ? (sales.length ? `
              ${sales.map((s) => `<div class="ph-garde-sale">
                <span class="tm">${esc(s.t)}</span>
                <span class="l"><b>${esc(s.item)}</b><span>${esc(s.who)}</span></span>
                <span class="amt">${fmtNum(s.amt)} MAD</span>
              </div>`).join('')}
              <div class="ph-garde-foot"><span class="k">Total encaissé · nuit</span><span class="v">${fmtNum(total)} MAD</span></div>
            ` : '<div class="ph-garde-empty">Aucune vente de garde pour l’instant.</div>')
            : '<div class="ph-garde-empty">Garde non armée.<br>Activez le mode garde pour ouvrir le journal de nuit.</div>'}
          </div>

          <div class="ph-panel">
            <div class="ph-panel-hd">
              <span class="t"><i data-lucide="map-pin"></i>Pharmacies de garde · Tanger</span>
              <span class="ct">cette semaine</span>
            </div>
            <div class="ph-degarde">
              ${PHARMA_GARDE.map((ph) => {
                /* The "VOUS" row is the store's own identity — on a real store it
                   must be the paired pharmacy, never the demo "Ibn Batouta". */
                const nm = (ph.me && pvReal()) ? (pvName('') || 'Votre pharmacie') : ph.name;
                const zn = (ph.me && pvReal()) ? (pvCity('') || '') : ph.zone;
                return `<div class="ph-degarde-row ${ph.me ? 'is-me' : ''}">
                <span class="ic"><i data-lucide="cross"></i></span>
                <span class="l"><b>${esc(nm)} ${ph.me ? '<span class="ph-me-chip">VOUS</span>' : ''}</b><span>${esc(zn)}</span></span>
                <span class="zone">${ph.me ? 'nuit' : '—'}</span>
              </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>`;
    $('#ph-garde-toggle', panel).onclick = toggleNight;
    icons();
  }

  function toggleNight() {
    state.night = !state.night;
    root.classList.toggle('is-night', state.night);
    renderNight();
    renderBadges();
    if (state.view === 'garde') renderGarde();
    icons();
    toast(state.night ? ('Garde de nuit armée, bon courage' + (pvReal() ? '' : ' Dr Wafae')) : 'Garde de nuit désarmée, service de jour');
  }
  function renderNight() {
    const note = $('#ph-night-note', root);
    if (note) note.hidden = !state.night;
  }

  /* ═══════════════════════ STOCK & PÉREMPTION ═══════════════════════ */
  function renderStock() {
    const panel = $('[data-ph-panel="stock"]', root);
    const lots = LOTS.slice().sort((a, b) => a.exp - b.exp);
    const grossCount = Object.values(state.gross).filter((q) => q > 0).length;
    panel.innerHTML = `
      <header class="ph-head">
        <div><h1>Stock & péremption</h1><div class="ph-head-sub">Lots qui périment sous 3 mois · commande grossiste en un geste</div></div>
      </header>
      <div class="ph-stock-scroll">
        <div class="ph-stock-cols">
          <div class="ph-panel">
            <div class="ph-panel-hd">
              <span class="t"><i data-lucide="calendar-x"></i>Lots à surveiller</span>
              <span class="ct">${lots.length} lots · &lt; 3 mois</span>
            </div>
            ${lots.map((lot) => {
              const it = ITEMS[lot.id];
              const tag = expTag(lot.exp);
              return `<div class="ph-lot">
                <span class="art">${ART[it.art] || ART.boite}</span>
                <span class="l"><b>${esc(it.label)}</b><span>Lot ${esc(lot.lot)} · ${lot.qty} en rayon</span></span>
                <span class="ph-lot-exp">
                  <span class="d">${fmtExp(lot.exp)}</span>
                  <span class="ph-exp-tag ${tag.cls}">${tag.label}</span>
                </span>
                <button class="ph-lot-act" data-ph-lot="${lot.id}">+ commande</button>
              </div>`;
            }).join('')}
          </div>

          <div class="ph-panel">
            <div class="ph-gross-hd">
              <span class="ic"><i data-lucide="truck"></i></span>
              <span class="l"><b>Commande grossiste</b><span>CoopharMa · livraison J+1 avant 8h</span></span>
            </div>
            ${GROSSISTE_SUGGEST.map((g) => {
              const it = ITEMS[g.id];
              const qty = state.gross[g.id] || 0;
              return `<div class="ph-gross-row ${qty > 0 ? 'on' : ''}" data-ph-grossrow="${g.id}">
                <span class="tick"><i data-lucide="check"></i></span>
                <span class="l"><b>${esc(it.label)}</b><span>${esc(g.reason)}</span></span>
                <span class="qty">
                  <button data-ph-gmin="${g.id}" aria-label="Moins">−</button>
                  <b>${qty}</b>
                  <button data-ph-gplus="${g.id}" aria-label="Plus">+</button>
                </span>
              </div>`;
            }).join('')}
            <button class="ph-gross-send" id="ph-gross-send" ${grossCount ? '' : 'disabled'}>
              <i data-lucide="send"></i>Envoyer la commande${grossCount ? ` · ${grossCount} réf.` : ''}
            </button>
          </div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const lotBtn = e.target.closest('[data-ph-lot]');
      if (lotBtn) { state.gross[lotBtn.dataset.phLot] = (state.gross[lotBtn.dataset.phLot] || 0) + 1; renderStock(); icons(); toast(`${ITEMS[lotBtn.dataset.phLot].label}, ajouté à la commande`); return; }
      const gmin = e.target.closest('[data-ph-gmin]');
      const gplus = e.target.closest('[data-ph-gplus]');
      const grow = e.target.closest('[data-ph-grossrow]');
      if (gmin) { const id = gmin.dataset.phGmin; state.gross[id] = Math.max(0, (state.gross[id] || 0) - 1); renderStock(); icons(); return; }
      if (gplus) { const id = gplus.dataset.phGplus; state.gross[id] = (state.gross[id] || 0) + 1; renderStock(); icons(); return; }
      if (grow) { const id = grow.dataset.phGrossrow; state.gross[id] = (state.gross[id] || 0) > 0 ? 0 : 1; renderStock(); icons(); return; }
    };
    const send = $('#ph-gross-send', panel);
    if (send) send.onclick = () => {
      const refs = Object.entries(state.gross).filter(([, q]) => q > 0);
      if (!refs.length) return;
      const units = refs.reduce((s, [, q]) => s + q, 0);
      refs.forEach(([id]) => { state.gross[id] = 0; });
      queueIfOffline('Commande grossiste');
      toast(`Commande envoyée à CoopharMa, ${refs.length} réf. · ${units} unités · livraison J+1`, 2800);
      renderStock(); renderBadges(); icons();
    };
    icons();
  }

  /* ═══════════════════════ SCAN (vignette) ═══════════════════════ */
  function openScan() {
    /* cibler un médicament en rayon, joué comme un scan de vignette */
    const pool = [];
    CATALOG.forEach((c) => c.items.forEach((it) => { if (STOCK[it.id] > 0) pool.push(it); }));
    const target = pool[(Date.now() >> 8) % pool.length] || pool[0];
    const el = $('#ph-scanm', root);
    el.innerHTML = `
      <button class="ph-modal-x" data-ph-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Scan vignette…</h3>
      <p class="modal-subtle">Présentez la vignette ou le code-barres de la boîte.</p>
      <div class="ph-scan-stage">
        <span class="ph-scan-art">${ART[target.art] || ART.boite}</span>
        <div class="ph-scan-laser"></div>
      </div>`;
    openVeil('#ph-scan-veil');
    icons();
    setTimeout(() => {
      if (!$('#ph-scan-veil', root).classList.contains('is-open')) return;
      closeVeil('#ph-scan-veil');
      toast(`Vignette lue, ${target.label}`);
      openSheet(target.id);
    }, 1400);
    $$('[data-ph-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ph-scan-veil'); });
  }

  /* ═══════════════════════ OFFLINE ═══════════════════════ */
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
    const net = $('#ph-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.ph-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.ph-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'ph-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#ph-offline-note', root);
    note.hidden = !state.offline;
    $('#ph-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'pharmacie',
    greet: { line1: 'Sba7 lkhir Dr Wafae,', em: 'marhba.', sub: 'Pharmacie Ibn Batouta <em>·</em> tiers payant prêt' },
    mount(rootEl) { build(rootEl); },
    onShow() {
      if (!root) return;
      $('#ph-today', root).textContent = `${fmtDT(new Date())}${pvReal() ? '' : ' · Dr Wafae au comptoir'}`;
      renderBadges();
      renderNet();
      icons();
    },
  });
})();
