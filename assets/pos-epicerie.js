/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ÉPICERIE — Épicerie Si Brahim (PIN 0010), via assets/pos-dispatch.js
 * ---------------------------------------------------------------------------
 * Le hanout de quartier : on scanne, on encaisse, et surtout on TIENT l'ardoise.
 * Le différenciateur de Kiwi ici n'est pas une jolie carte — c'est le CARNET
 * DE CRÉDIT. Si Brahim connaît tout le quartier ; la moitié paie en fin de
 * semaine. Kiwi remplace le cahier d'écolier sous le comptoir : chaque ardoise
 * a son historique, son rappel WhatsApp (très poli — c'est un voisin), et la
 * journée affiche LE chiffre qui l'inquiète : combien on lui doit dehors.
 *
 * Quatre écrans : CAISSE (scan-first, produits au poids à la balance),
 * CARNET (la signature), STOCK RAPIDE (réassort grossiste), JOURNÉE (recette,
 * crédit en cours, top produits). Seed MID-SHIFT : 17h, la recette tourne,
 * Mme Rkia doit 134 MAD depuis 3 semaines, il reste 3 Coca au frigo.
 *
 * Réutilise le kit caisse (.modal-veil, .modal, .cash-*, .reader-*) et le
 * #toast-stack partagé. V1 = couche opérationnelle : la carte part au lecteur
 * partenaire, sans encaissement Kiwi.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── real-store detection ─────────────────────────
     A paired/real merchant must never inherit the demo cast (seeded ardoises).
     When pvReal() is TRUE we start the carnet EMPTY so the hanout begins clean;
     when FALSE the local demo is 100% unchanged. */
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
  /* prix au poids → 2 décimales, virgule française */
  const fmtMAD2 = (n) => {
    const r = Math.round(n * 100) / 100;
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 }).format(r) + ' MAD';
  };
  const fmtKg = (kg) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(kg);
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const DAY = 86400 * 1000;
  const sinceLabel = (d) => {
    const days = Math.floor((Date.now() - d.getTime()) / DAY);
    if (days <= 0) return "aujourd'hui";
    if (days === 1) return 'hier';
    if (days < 7) return `il y a ${days} j`;
    const w = Math.floor(days / 7);
    if (w === 1) return 'il y a 1 semaine';
    if (w < 5) return `il y a ${w} semaines`;
    const m = Math.floor(days / 30);
    return m <= 1 ? 'il y a 1 mois' : `il y a ${m} mois`;
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

  /* Deterministic pseudo-barcode (EAN lookalike) from a code. */
  function barcode(seed, h) {
    h = h || 30;
    let bars = '', x = 0, s = 11;
    const len = Math.max(seed.length * 4, 30);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + seed.charCodeAt(i % seed.length) + i * 13) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* ───────────────────────── grocery line-art ─────────────────────────
     One visual voice: forest strokes, mint-tint fills, 64×64 grid — exactly
     the pressing ART dict's voice. These ARE the shelf: recognizable hanout
     silhouettes (bouteille d'eau, brique de lait, conserve, œuf…). */
  const art = (inner) => `<svg class="ep-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    eau: art(`<path d="M26 8h12v5l2 4h-16l2-4z"/><path class="fill" d="M24 17h16v37a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4z"/><path d="M24 17h16v37a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4z"/><path class="thin" d="M24 28h16M24 40h16"/><path class="soft" d="M29 33h6"/>`),
    soda: art(`<path d="M25 7h14v4H25z"/><path class="fill" d="M24 11h16l-1.5 44a3 3 0 0 1-3 3H28.5a3 3 0 0 1-3-3z"/><path d="M24 11h16l-1.5 44a3 3 0 0 1-3 3H28.5a3 3 0 0 1-3-3z"/><path class="fill soft" d="M25.5 24h13l-.7 18h-11.6z"/><path d="M25.5 24h13M24.8 42h14.4"/>`),
    lait: art(`<path class="fill" d="M20 22l4-12h16l4 12v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 22l4-12h16l4 12v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 22h24"/><path class="thin" d="M24 10l8 6 8-6"/><path class="soft" d="M27 33h10v9H27z"/>`),
    jus: art(`<path class="fill" d="M22 16h20v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path d="M22 16h20v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path d="M28 16v-6h8v6"/><circle class="fill soft" cx="32" cy="34" r="7"/><circle cx="32" cy="34" r="7"/><path class="thin" d="M32 27v14M25 34h14"/>`),
    confiture: art(`<path d="M26 9h12v5H26z"/><path class="fill" d="M23 14h18v40a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z"/><path d="M23 14h18v40a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z"/><path d="M23 14h18"/><path class="fill soft" d="M26 30h12v22H26z"/><path d="M26 30h12v22H26z"/><path class="thin" d="M30 24c0 2 4 2 4 0"/>`),
    conserve: art(`<path class="fill" d="M20 16h24v36a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 16h24v36a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><ellipse class="fill" cx="32" cy="16" rx="12" ry="4"/><ellipse cx="32" cy="16" rx="12" ry="4"/><path class="fill soft" d="M24 26h16v18H24z"/><path d="M24 26h16M24 33h16M24 40h16"/>`),
    huile: art(`<path d="M27 7h10v5h-10z"/><path class="fill" d="M25 12h14v6l4 5v31a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V23l4-5z"/><path d="M25 12h14v6l4 5v31a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V23l4-5z"/><path class="fill soft" d="M25 30h14v20H25z"/><path d="M25 30h14"/><path class="thin" d="M28 38h8"/>`),
    couscous: art(`<path class="fill" d="M18 24h28l-2 30a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M18 24h28l-2 30a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M18 24l4-10h20l4 10"/><path class="fill soft" d="M24 32h16v18H24z"/><path class="thin" d="M27 38h2M32 38h2M37 38h2M27 43h2M32 43h2M37 43h2"/>`),
    pates: art(`<path class="fill" d="M22 18h20v38a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3z"/><path d="M22 18h20v38a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3z"/><path d="M22 18l3-8h14l3 8"/><path class="thin" d="M27 26v28M32 26v28M37 26v28"/>`),
    farine: art(`<path class="fill" d="M22 20c-2-6 4-12 10-12s12 6 10 12l1 32a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3z"/><path d="M22 20c-2-6 4-12 10-12s12 6 10 12M22 22l-.5 30a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3L45 22"/><path d="M22 22h21"/><path class="thin" d="M28 32h8M27 40h10"/>`),
    the: art(`<path class="fill" d="M21 17h22l-1 38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path d="M21 17h22l-1 38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/><path d="M21 17l3-8h16l3 8"/><path class="fill soft" d="M26 28c4-2 8-2 12 0v8c-4 2-8 2-12 0z"/><path d="M26 28c4-2 8-2 12 0M32 27v3"/>`),
    sucre: art(`<path class="fill" d="M20 22h24v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 22h24v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4z"/><path d="M20 22l5-12h14l5 12"/><path d="M25 10h14"/><path class="thin" d="M27 32l3 3-3 3M37 32l-3 3 3 3"/>`),
    cafe: art(`<path class="fill" d="M23 16h18l-1 40a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><path d="M23 16h18l-1 40a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><path d="M23 16l3-8h12l3 8"/><path class="fill soft" d="M27 30h10v12H27z"/><path class="thin" d="M30 24c0-2 4-2 4 0M30 22c0-2 4-2 4 0"/>`),
    fromage: art(`<path class="fill" d="M8 40 40 18l16 8v14a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"/><path d="M8 40 40 18l16 8M8 40h48v3a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z"/><circle class="thin" cx="22" cy="36" r="2.4"/><circle class="thin" cx="34" cy="33" r="2"/><circle class="thin" cx="44" cy="38" r="2.2"/>`),
    vacheqr: art(`<circle class="fill" cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="22"/><path class="thin" d="M32 10v44M10 32h44"/><path class="thin" d="M32 32l16-12M32 32 16 20M32 32l16 12M32 32 16 44"/>`),
    yaourt: art(`<path class="fill" d="M22 22h20l-1.5 30a4 4 0 0 1-4 4H27.5a4 4 0 0 1-4-4z"/><path d="M22 22h20l-1.5 30a4 4 0 0 1-4 4H27.5a4 4 0 0 1-4-4z"/><ellipse class="fill soft" cx="32" cy="22" rx="10" ry="3"/><ellipse cx="32" cy="22" rx="10" ry="3"/><path class="thin" d="M26 34h12"/>`),
    oeuf: art(`<path class="fill" d="M32 8c-9 0-15 13-15 24 0 11 7 18 15 18s15-7 15-18C47 21 41 8 32 8z"/><path d="M32 8c-9 0-15 13-15 24 0 11 7 18 15 18s15-7 15-18C47 21 41 8 32 8z"/><path class="thin" d="M26 26c2-4 6-6 9-5"/>`),
    khobz: art(`<ellipse class="fill" cx="32" cy="34" rx="24" ry="16"/><ellipse cx="32" cy="34" rx="24" ry="16"/><path class="thin" d="M14 30c12-5 24-5 36 0M32 19v30"/><path class="soft" d="M24 26c2 3 2 5 0 8"/>`),
    biscuit: art(`<rect class="fill" x="14" y="20" width="36" height="24" rx="4"/><rect x="14" y="20" width="36" height="24" rx="4"/><path d="M14 20l4-8h28l4 8M18 44l-2 8h32l-2-8"/><circle class="thin" cx="24" cy="32" r="1.6"/><circle class="thin" cx="32" cy="28" r="1.6"/><circle class="thin" cx="40" cy="33" r="1.6"/><circle class="thin" cx="32" cy="37" r="1.6"/>`),
    chips: art(`<path class="fill" d="M22 14h20l3 8-2 33a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3l-2-33z"/><path d="M22 14h20l3 8-2 33a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3l-2-33z"/><path d="M19 22h26"/><path class="thin" d="M27 30c4-2 8 2 11 0M26 38c4-2 9 2 12 0"/>`),
    savon: art(`<rect class="fill" x="14" y="22" width="36" height="26" rx="5"/><rect x="14" y="22" width="36" height="26" rx="5"/><path d="M14 22l5-10h26l5 10"/><path class="fill soft" d="M22 30h20v10H22z"/><path class="thin" d="M26 35h12"/>`),
    lessive: art(`<path class="fill" d="M18 18h28v36a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z"/><path d="M18 18h28v36a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z"/><path d="M30 18v-6h10v6"/><circle class="fill soft" cx="31" cy="38" r="9"/><circle cx="31" cy="38" r="9"/><path class="thin" d="M31 29v18M22 38h18"/>`),
    eaujavel: art(`<path d="M27 8h10v6H27z"/><path class="fill" d="M24 14h16v40a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><path d="M24 14h16v40a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z"/><path class="fill soft" d="M27 28h10v16H27z"/><path d="M27 28h10v16H27z"/><path class="thin" d="M30 34h4"/>`),
    sachet: art(`<path class="fill" d="M18 16h28l-2 40a3 3 0 0 1-3 3H23a3 3 0 0 1-3-3z"/><path d="M18 16h28l-2 40a3 3 0 0 1-3 3H23a3 3 0 0 1-3-3z"/><path d="M18 16l3-7h22l3 7"/><path class="thin" d="M26 30h12M25 40h14M27 50h10"/>`),
    recharge: art(`<rect class="fill" x="16" y="10" width="32" height="44" rx="6"/><rect x="16" y="10" width="32" height="44" rx="6"/><rect class="fill soft" x="21" y="17" width="22" height="20" rx="2"/><rect x="21" y="17" width="22" height="20" rx="2"/><path class="thin" d="M25 44h14"/><circle class="thin" cx="32" cy="49" r="2"/>`),
    legume: art(`<path class="fill" d="M32 20c-8 0-15 6-15 18 0 10 7 16 15 16s15-6 15-16c0-12-7-18-15-18z"/><path d="M32 20c-8 0-15 6-15 18 0 10 7 16 15 16s15-6 15-16c0-12-7-18-15-18z"/><path d="M32 20c0-6 3-10 8-12-1 5-3 8-8 12z"/><path class="thin" d="M32 30v22"/>`),
    olives: art(`<ellipse class="fill" cx="24" cy="38" rx="9" ry="12"/><ellipse cx="24" cy="38" rx="9" ry="12"/><ellipse class="fill" cx="40" cy="40" rx="8" ry="11"/><ellipse cx="40" cy="40" rx="8" ry="11"/><path d="M24 26c0-4 2-7 5-9M40 29c1-3 4-5 7-5"/><circle class="thin" cx="24" cy="36" r="2"/>`),
  };

  /* ───────────────────────── catalogue — le canon du hanout ─────────────────────────
     ~25 produits, prix MAD réels Tanger 2026. unit:'piece' (à l'unité, ex. œuf),
     'weigh' (à la balance, prix/kg), ou par défaut le produit emballé.
     ean = code-barres mocké (les recharges n'en ont pas — saisie manuelle).
     stock = unités en rayon (sert au Stock rapide). reorder = seuil d'alerte. */
  const CATALOG = [
    { id: 'boissons', label: 'Boissons', items: [
      { id: 'sidiali',  art: 'eau',   label: 'Sidi Ali 1,5 L',        price: 8,   ean: '6111035000128', stock: 14, reorder: 12 },
      { id: 'cocacola', art: 'soda',  label: 'Coca-Cola 1 L',         price: 10,  ean: '5449000000996', stock: 3,  reorder: 12 },
      { id: 'hawai',    art: 'soda',  label: 'Hawai Tropical 1 L',    price: 9,   ean: '6111252600014', stock: 18, reorder: 10 },
      { id: 'pomsorange', art: 'jus', label: "Pom's Orange 1 L",      price: 12,  ean: '6111021090015', stock: 7,  reorder: 8 },
      { id: 'oulmes',   art: 'eau',   label: 'Oulmès 1 L',            price: 9,   ean: '6111035000074', stock: 9,  reorder: 8 },
    ] },
    { id: 'epicerie', label: 'Épicerie sèche', items: [
      { id: 'dari',     art: 'couscous', label: 'Dari couscous moyen 1 kg', price: 18, ean: '6111242100017', stock: 11, reorder: 6 },
      { id: 'pates',    art: 'pates',    label: 'Pâtes Tria coude 500 g',   price: 7,  ean: '6111250500049', stock: 22, reorder: 10 },
      { id: 'farine',   art: 'farine',   label: 'Farine de luxe 1 kg',      price: 9,  ean: '6111021500019', stock: 8,  reorder: 6 },
      { id: 'aicha',    art: 'confiture',label: 'Aïcha confiture abricot',  price: 22, ean: '6111035010127', stock: 6,  reorder: 4 },
      { id: 'huile',    art: 'huile',    label: 'Huile Lesieur 1 L',        price: 24, ean: '6111000100015', stock: 5,  reorder: 6 },
      { id: 'sucre',    art: 'sucre',    label: 'Sucre Cosumar 1 kg',       price: 12, ean: '6111000200012', stock: 16, reorder: 8 },
      { id: 'cafe',     art: 'cafe',     label: 'Café Carrion 200 g',       price: 28, ean: '6111250200017', stock: 4,  reorder: 4 },
      { id: 'the',      art: 'the',      label: 'Thé Sultan vert 200 g',    price: 19, ean: '6111250100096', stock: 13, reorder: 6 },
      { id: 'tonsa',    art: 'conserve', label: 'Tonsa thon 3×80 g',        price: 21, ean: '6111248000013', stock: 9,  reorder: 6 },
    ] },
    { id: 'frais', label: 'Frais & crémerie', items: [
      { id: 'oeuf',     art: 'oeuf',    label: 'Œuf', unit: 'piece',         price: 1.5, ean: '2100000000017', stock: 90, reorder: 30 },
      { id: 'lait',     art: 'lait',    label: 'Lait Centrale 1 L',          price: 8,  ean: '6111000300019', stock: 12, reorder: 12 },
      { id: 'vacheqr',  art: 'vacheqr', label: 'La Vache Qui Rit 8 portions', price: 14, ean: '3073780969000', stock: 7, reorder: 6 },
      { id: 'yaourt',   art: 'yaourt',  label: 'Yaourt Jaouda nature ×4',    price: 11, ean: '6111000400016', stock: 6,  reorder: 8 },
      { id: 'fromage',  art: 'fromage', label: 'Fromage rouge au poids', unit: 'weigh', price: 90, ean: '2200000000014', stock: 3, reorder: 2, weighUnit: 'kg', presets: [0.25, 0.5, 0.75, 1] },
    ] },
    { id: 'pain', label: 'Pain & goûter', items: [
      { id: 'khobz',    art: 'khobz',   label: 'Khobz (pain rond)',          price: 1.2, ean: '2100000000024', stock: 40, reorder: 20 },
      { id: 'oreo',     art: 'biscuit', label: 'Biscuits Oreo',              price: 9,  ean: '7622210449283', stock: 10, reorder: 6 },
      { id: 'chips',    art: 'chips',   label: 'Chips Master 45 g',          price: 5,  ean: '6111250900016', stock: 24, reorder: 12 },
    ] },
    { id: 'fraisleg', label: 'Légumes & olives (au poids)', items: [
      { id: 'tomates',  art: 'legume',  label: 'Tomates', unit: 'weigh',     price: 8,  ean: '2200000000021', stock: 14, reorder: 5, weighUnit: 'kg', presets: [0.5, 0.75, 1, 2] },
      { id: 'oignons',  art: 'legume',  label: 'Oignons', unit: 'weigh',     price: 6,  ean: '2200000000038', stock: 20, reorder: 6, weighUnit: 'kg', presets: [0.5, 1, 2, 3] },
      { id: 'olives',   art: 'olives',  label: 'Olives beldi', unit: 'weigh', price: 30, ean: '2200000000045', stock: 8, reorder: 3, weighUnit: 'kg', presets: [0.25, 0.5, 0.75, 1] },
    ] },
    { id: 'menage', label: 'Ménage & hygiène', items: [
      { id: 'tide',     art: 'lessive',  label: 'Tide lessive 900 g',        price: 32, ean: '6111000500013', stock: 5,  reorder: 4 },
      { id: 'savon',    art: 'savon',    label: 'Savon Tide pain ×3',        price: 14, ean: '6111000600010', stock: 11, reorder: 6 },
      { id: 'javel',    art: 'eaujavel', label: "Eau de Javel 1 L",          price: 7,  ean: '6111000700017', stock: 9,  reorder: 6 },
    ] },
    { id: 'recharges', label: 'Recharges télécom', items: [
      { id: 'iam10',  art: 'recharge', label: 'Recharge Maroc Telecom 10', price: 10, telco: 'Maroc Telecom', stock: null },
      { id: 'iam20',  art: 'recharge', label: 'Recharge Maroc Telecom 20', price: 20, telco: 'Maroc Telecom', stock: null },
      { id: 'orange20', art: 'recharge', label: 'Recharge Orange 20',      price: 20, telco: 'Orange', stock: null },
      { id: 'orange50', art: 'recharge', label: 'Recharge Orange 50',      price: 50, telco: 'Orange', stock: null },
      { id: 'inwi10', art: 'recharge', label: 'Recharge inwi 10',          price: 10, telco: 'inwi', stock: null },
      { id: 'inwi50', art: 'recharge', label: 'Recharge inwi 50',          price: 50, telco: 'inwi', stock: null },
    ] },
  ];
  const ITEMS = {};
  const BY_EAN = {};
  CATALOG.forEach((c) => c.items.forEach((it) => {
    it.cat = c.id;
    it.catLabel = c.label;
    ITEMS[it.id] = it;
    if (it.ean) BY_EAN[it.ean] = it;
  }));
  const isWeigh = (it) => it.unit === 'weigh';
  const isUnit  = (it) => it.unit === 'piece';
  const stockItems = () => Object.values(ITEMS).filter((it) => typeof it.stock === 'number');

  /* known EANs the mock scanner cycles through (the "scanner" button) */
  const SCAN_CYCLE = ['cocacola', 'khobz', 'sidiali', 'dari', 'lait', 'oreo', 'tide', 'vacheqr', 'aicha', 'chips'];

  /* ───────────────────────── carnet — l'ardoise du quartier ─────────────────────────
     6 voisins, soldes et historiques réels. type: 'debt' = achat à crédit (+),
     'pay' = règlement (−). Le solde courant = somme des deltas non encore
     "soldés". On garde des historiques riches : c'est la confiance du quartier. */
  const NOW = Date.now();
  const dAgo = (days, h, m) => { const d = new Date(NOW - days * DAY); d.setHours(h != null ? h : 11, m != null ? m : 0, 0, 0); return d; };

  const CARNET = pvReal() ? [] : [
    { id: 'k1', name: 'Mme Rkia', phone: '0661 44 21 87', note: 'voisine du 2e, paie souvent le vendredi',
      hist: [
        { type: 'debt', label: 'Courses (huile, sucre, thé)', amt: 55, at: dAgo(21, 18, 10) },
        { type: 'debt', label: 'Pain + lait (3 jours)',        amt: 21, at: dAgo(16, 8, 30) },
        { type: 'pay',  label: 'Règlement espèces',            amt: 40, at: dAgo(12, 19, 0) },
        { type: 'debt', label: 'Couscous + tomates',           amt: 38, at: dAgo(9, 12, 0) },
        { type: 'debt', label: 'Recharge + biscuits',          amt: 30, at: dAgo(3, 17, 30) },
        { type: 'debt', label: 'Conserves + savon',            amt: 30, at: dAgo(0, 16, 20) },
      ] },
    { id: 'k2', name: 'Hajj Driss', phone: '0670 33 12 09', note: 'retraité, ardoise du mois, règle le 1er',
      hist: [
        { type: 'debt', label: 'Café + thé + sucre',  amt: 59, at: dAgo(11, 9, 0) },
        { type: 'debt', label: 'Œufs (×12) + lait',   amt: 26, at: dAgo(6, 8, 15) },
        { type: 'pay',  label: 'Règlement espèces',   amt: 50, at: dAgo(4, 18, 40) },
        { type: 'debt', label: 'Pain quotidien',      amt: 12, at: dAgo(1, 7, 50) },
        { type: 'debt', label: 'Tomates + oignons',   amt: 11, at: dAgo(0, 11, 10) },
      ] },
    { id: 'k3', name: 'Mustapha (menuisier)', phone: '0662 78 45 33', note: "l'atelier d'à côté, déjeuner à crédit",
      hist: [
        { type: 'debt', label: 'Boissons + chips (équipe)', amt: 48, at: dAgo(8, 12, 30) },
        { type: 'debt', label: 'Pain + Vache Qui Rit',      amt: 22, at: dAgo(5, 12, 45) },
        { type: 'debt', label: 'Eau ×6 + biscuits',         amt: 33, at: dAgo(2, 13, 0) },
      ] },
    { id: 'k4', name: 'Fatiha', phone: '0653 90 18 76', note: 'maman du 4e, règle chaque samedi',
      hist: [
        { type: 'debt', label: 'Courses semaine',     amt: 64, at: dAgo(13, 18, 0) },
        { type: 'pay',  label: 'Règlement (samedi)',  amt: 64, at: dAgo(7, 11, 0) },
        { type: 'debt', label: 'Lait + yaourts + pain', amt: 27, at: dAgo(2, 9, 20) },
      ] },
    { id: 'k5', name: 'Café Rif (en face)', phone: '0539 94 03 21', note: 'B2B, lait & sucre tous les matins, facture fin de mois',
      hist: [
        { type: 'debt', label: 'Lait ×10 + sucre ×4', amt: 128, at: dAgo(10, 7, 0) },
        { type: 'debt', label: 'Lait ×10',            amt: 80,  at: dAgo(6, 7, 0) },
        { type: 'pay',  label: 'Virement (acompte)',  amt: 100, at: dAgo(5, 14, 0) },
        { type: 'debt', label: 'Sucre ×6 + café',     amt: 100, at: dAgo(2, 7, 30) },
      ] },
    { id: 'k6', name: 'Si Larbi', phone: '0668 11 55 42', note: 'à jour, pour mémoire',
      hist: [
        { type: 'debt', label: 'Courses',          amt: 45, at: dAgo(14, 17, 0) },
        { type: 'pay',  label: 'Règlement espèces', amt: 45, at: dAgo(9, 18, 0) },
      ] },
  ];
  const CRED = Object.fromEntries(CARNET.map((c) => [c.id, c]));
  function balanceOf(c) {
    return c.hist.reduce((s, h) => s + (h.type === 'debt' ? h.amt : -h.amt), 0);
  }
  function oldestDebt(c) {
    /* date de la plus ancienne dette tant que le solde reste > 0 (FIFO) */
    let running = balanceOf(c);
    if (running <= 0) return null;
    const debts = c.hist.filter((h) => h.type === 'debt').slice().sort((a, b) => a.at - b.at);
    const paid = c.hist.filter((h) => h.type === 'pay').reduce((s, h) => s + h.amt, 0);
    let coverage = paid;
    for (const d of debts) {
      if (coverage >= d.amt) { coverage -= d.amt; continue; }
      return d.at;
    }
    return debts.length ? debts[debts.length - 1].at : null;
  }
  function totalCredit() { return CARNET.reduce((s, c) => s + balanceOf(c), 0); }

  /* ───────────────────────── journée (recette du jour, seed mid-shift) ─────
     Il est ~17h : la recette tourne déjà. On garde un agrégat réaliste + on y
     ajoute en direct les ventes que l'utilisateur encaisse pendant la démo. */
  const day = pvReal() ? { especes: 0, carte: 0, creditAdded: 0, tickets: 0, top: [] } : {
    especes: 1840,
    carte: 720,
    creditAdded: 90,        /* mis à l'ardoise aujourd'hui */
    tickets: 63,
    /* top produits du jour (qté vendue) — sert aux barres */
    top: [
      { id: 'khobz',    qty: 78 },
      { id: 'sidiali',  qty: 41 },
      { id: 'oeuf',     qty: 120 },
      { id: 'cocacola', qty: 33 },
      { id: 'lait',     qty: 29 },
    ],
  };

  /* Reprise de la journée en cours : un rechargement (mise à jour PWA, onglet
     tué, batterie) ne doit pas remettre la recette du comptoir à zéro alors que
     le tiroir est plein. Relu depuis le journal partagé, filtré sur aujourd'hui.
     Le numéro de ticket repart AU-DELÀ du dernier encaissé, sinon deux ventes
     différentes porteraient le même T-642. Démo : journal vide, aucun effet. */
  (function restoreDay() {
    try {
      if (!window.KiwiPosSale) return;
      const t = window.KiwiPosSale.totals('epicerie');
      if (!t.count) return;
      day.especes += t.cash;
      day.carte += t.card + t.other;
      day.tickets += t.count;
    } catch (_) {}
  })();

  /* ───────────────────────── state ───────────────────────── */
  let ticketSeq = 642;
  try { if (window.KiwiPosSale) ticketSeq = window.KiwiPosSale.nextSeq('epicerie', ticketSeq); } catch (_) {}
  const state = {
    view: 'caisse',
    cat: 'tous',
    ticket: { num: null, lines: [] },
    carnetQuery: '',
    attachFrom: null,        /* basket id queued to attach to a carnet */
    reassort: {},            /* itemId → qty for the grossiste run */
    scanCycleIdx: 0,
    offline: false, queued: 0,
  };
  function freshTicket() { state.ticket = { num: posRef(`T-${ticketSeq}`), lines: [] }; }
  freshTicket();

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  function initials(name) {
    return name.replace(/\(.*?\)/g, '').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  /* Nom courtois pour s'adresser à un voisin : on enlève les parenthèses, et
     on garde le titre de politesse avec le prénom (« Mme Rkia », « Hajj Driss »)
     plutôt que de couper au premier mot. */
  const TITLES = ['mme', 'mr', 'm.', 'hajj', 'hajja', 'si', 'lalla', 'moulay', 'café', 'cafe'];
  function politeName(name) {
    const clean = name.replace(/\(.*?\)/g, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length >= 2 && TITLES.includes(parts[0].toLowerCase())) return `${parts[0]} ${parts[1]}`;
    return parts[0];
  }

  /* ═══════════════════════ ROOT / MOUNT ═══════════════════════ */
  let root = null;
  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="ep-rail">
        <div class="ep-brand">kiwi<i></i></div>
        <div class="ep-venue">
          <div class="ep-venue-name">${pvName('Épicerie Si Brahim') || 'Mon épicerie'}</div>
          <div class="ep-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Souk Dakhli'}<br>Le même Kiwi, <b>un seul compte.</b></div>
        </div>
        <nav class="ep-nav" id="ep-nav">
          <button class="ep-nav-it on" data-ep-view="caisse"><i data-lucide="scan-line"></i><span>Caisse</span></button>
          <button class="ep-nav-it" data-ep-view="carnet"><i data-lucide="notebook"></i><span>Carnet de crédit</span><b class="ep-nav-badge due" id="ep-badge-carnet"></b></button>
          <button class="ep-nav-it" data-ep-view="stock"><i data-lucide="package"></i><span>Stock rapide</span><b class="ep-nav-badge" id="ep-badge-stock"></b></button>
          <button class="ep-nav-it" data-ep-view="journee"><i data-lucide="trending-up"></i><span>Journée</span></button>
        </nav>
        <div class="ep-rail-foot">
          <button class="ep-net" id="ep-net" title="Simuler une coupure réseau">
            <i class="ep-net-dot"></i><span class="ep-net-label">En ligne</span>
          </button>
          <button class="ep-lock" id="ep-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="ep-main">
        <div class="ep-offline-note" id="ep-offline-note" hidden>
          Hors-ligne, les ventes et les ardoises sont enregistrées sur la tablette, synchronisées au retour du réseau.
          <b id="ep-queue-count"></b>
        </div>
        <section class="ep-view is-on" data-ep-panel="caisse">
          <div class="ep-caisse">
            <div class="ep-scanbar">
              <div class="ep-scan-field is-hot" id="ep-scan-field">
                <i data-lucide="scan-line"></i>
                <input id="ep-scan-input" inputmode="numeric" autocomplete="off"
                  placeholder="Scannez ou tapez le code-barres…" />
                <span class="ep-scan-kbd">Entrée</span>
              </div>
              <button class="ep-scan-btn" id="ep-scan-mock"><i data-lucide="scan-line"></i>Scanner</button>
              <button class="ep-scan-btn" id="ep-search-open" style="background:var(--surface);color:var(--ink-2);border:1px solid var(--line);box-shadow:none;"><i data-lucide="search"></i>Chercher</button>
            </div>
            <div class="ep-cats" id="ep-cats"></div>
            <div class="ep-grid-scroll" id="ep-gridwrap"></div>
          </div>
          <aside class="ep-ticket" id="ep-ticket"></aside>
        </section>
        <section class="ep-view" data-ep-panel="carnet"></section>
        <section class="ep-view" data-ep-panel="stock"></section>
        <section class="ep-view" data-ep-panel="journee"></section>
      </main>
      <div class="modal-veil" id="ep-search-veil"><div class="modal ep-search ep-rel" id="ep-searchm"></div></div>
      <div class="modal-veil" id="ep-scan-veil"><div class="modal ep-scan ep-rel" id="ep-scanm"></div></div>
      <div class="modal-veil" id="ep-weigh-veil"><div class="modal ep-weigh ep-rel" id="ep-weighm"></div></div>
      <div class="modal-veil" id="ep-pay-veil"><div class="modal ep-pay ep-rel" id="ep-paym"></div></div>
      <div class="modal-veil" id="ep-carnetpick-veil"><div class="modal ep-pay ep-rel" id="ep-carnetpickm"></div></div>
      <div class="modal-veil" id="ep-ard-veil"><div class="modal ep-ard-detail ep-rel" id="ep-ardm"></div></div>
      <div class="modal-veil" id="ep-wa-veil"><div class="modal ep-wa ep-rel" id="ep-wam"></div></div>`;

    $('#ep-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-ep-view]');
      if (b) switchView(b.dataset.epView);
    });
    $('#ep-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#ep-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    /* scan field — the heart of a hanout, always ready */
    const inp = $('#ep-scan-input', root);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitScan(inp.value); } });
    inp.addEventListener('focus', () => $('#ep-scan-field', root).classList.add('is-hot'));
    inp.addEventListener('blur', () => $('#ep-scan-field', root).classList.remove('is-hot'));
    $('#ep-scan-mock', root).addEventListener('click', mockScan);
    $('#ep-search-open', root).addEventListener('click', openSearch);

    renderAll();
    focusScan();
  }

  function onShow() {
    /* re-unlock : refresh dynamic surfaces, re-arm the scan field */
    renderBadges();
    if (state.view === 'caisse') { renderTicket(); focusScan(); }
    if (state.view === 'carnet') renderCarnet();
    if (state.view === 'stock') renderStock();
    if (state.view === 'journee') renderJournee();
    icons();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }
  function focusScan() {
    if (state.view !== 'caisse') return;
    setTimeout(() => { const i = $('#ep-scan-input', root); if (i) i.focus(); }, 40);
  }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.ep-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.epView === view));
    $$('.ep-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.epPanel === view));
    if (view === 'caisse') { renderTicket(); focusScan(); }
    if (view === 'carnet') renderCarnet();
    if (view === 'stock') renderStock();
    if (view === 'journee') renderJournee();
    icons();
  }
  function renderBadges() {
    const debtors = CARNET.filter((c) => balanceOf(c) > 0).length;
    const low = stockItems().filter((it) => it.stock <= it.reorder).length;
    const bC = $('#ep-badge-carnet', root);
    const bS = $('#ep-badge-stock', root);
    if (bC) { bC.textContent = debtors || ''; bC.style.display = debtors ? '' : 'none'; }
    if (bS) { bS.textContent = low || ''; bS.style.display = low ? '' : 'none'; }
  }

  function renderAll() {
    renderCats();
    renderGrid();
    renderTicket();
    renderBadges();
    renderNet();
    icons();
  }

  /* ═══════════════════════ CAISSE — catégories + grille ═══════════════════════ */
  function renderCats() {
    const all = CATALOG.reduce((s, c) => s + c.items.length, 0);
    $('#ep-cats', root).innerHTML =
      `<button class="ep-cat ${state.cat === 'tous' ? 'on' : ''}" data-ep-cat="tous">Tous <span class="ep-cat-ct">${all}</span></button>` +
      CATALOG.map((c) =>
        `<button class="ep-cat ${state.cat === c.id ? 'on' : ''}" data-ep-cat="${c.id}">${esc(c.label)} <span class="ep-cat-ct">${c.items.length}</span></button>`
      ).join('');
    $('#ep-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-ep-cat]');
      if (!b) return;
      state.cat = b.dataset.epCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function priceLabel(it) {
    if (isWeigh(it)) return `${it.price} MAD<span class="per">/kg</span>`;
    if (isUnit(it)) return `${fmtMAD2(it.price).replace(' MAD', '')} MAD<span class="per"> / pièce</span>`;
    return `${it.price} MAD`;
  }

  function renderGrid() {
    const cats = state.cat === 'tous' ? CATALOG : CATALOG.filter((c) => c.id === state.cat);
    let i = 0;
    $('#ep-gridwrap', root).innerHTML = cats.map((c) => `
      <div class="ep-cat-head">${esc(c.label)}</div>
      <div class="ep-grid">${c.items.map((it) => {
        const out = typeof it.stock === 'number' && it.stock <= 0;
        const low = typeof it.stock === 'number' && it.stock > 0 && it.stock <= it.reorder;
        const flag = isWeigh(it) ? '<span class="ep-card-flag weigh">au poids</span>'
                   : isUnit(it) ? "<span class=\"ep-card-flag unit\">à l'unité</span>"
                   : it.telco ? `<span class="ep-card-flag">${esc(it.telco)}</span>` : '';
        const stockChip = typeof it.stock === 'number'
          ? `<span class="ep-card-stock ${out ? 'out' : low ? 'low' : ''}">${out ? '0' : it.stock}</span>` : '';
        return `<button class="ep-card ${out ? 'is-out' : ''}" data-ep-item="${it.id}" style="--i:${i++}">
          ${stockChip}
          <span class="ep-card-art">${ART[it.art] || ''}</span>
          <span class="ep-card-name">${esc(it.label)}</span>
          <span class="ep-card-price">${priceLabel(it)}</span>
          ${flag}
        </button>`;
      }).join('')}
      </div>`).join('');
    $('#ep-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-ep-item]');
      if (b) addItem(b.dataset.epItem);
    };
  }

  /* ═══════════════════════ ADD TO TICKET ═══════════════════════ */
  function addItem(itemId, opts) {
    const it = ITEMS[itemId];
    if (!it) return;
    if (typeof it.stock === 'number' && it.stock <= 0) {
      toast(`${it.label}, rupture. Ajoutez-le au réassort dans Stock rapide.`);
      return;
    }
    if (isWeigh(it) && !(opts && opts.weight != null)) { openWeigh(it); return; }
    const t = state.ticket;
    if (isWeigh(it)) {
      /* chaque pesée est une ligne distincte (poids différent) */
      t.lines.push({ itemId, weight: opts.weight, qty: 1 });
      renderTicket(); icons(); flashLastLine();
      focusScan();
      return;
    }
    const existing = t.lines.find((l) => l.itemId === itemId && !l.weight);
    if (existing) existing.qty++;
    else t.lines.push({ itemId, qty: 1 });
    renderTicket(); icons(); flashLastLine(existing ? null : true);
    focusScan();
  }

  function lineTotal(ln) {
    const it = ITEMS[ln.itemId];
    if (ln.weight != null) return it.price * ln.weight;
    return it.price * ln.qty;
  }
  function ticketTotal(t) { return t.lines.reduce((s, ln) => s + lineTotal(ln), 0); }
  function ticketCount(t) { return t.lines.reduce((s, ln) => s + (ln.weight != null ? 1 : ln.qty), 0); }

  function flashLastLine(isNew) {
    if (isNew === null) return;
    const lines = $$('.ep-line', root);
    const el = lines[lines.length - 1];
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  function lineRow(ln, i) {
    const it = ITEMS[ln.itemId];
    const weigh = ln.weight != null;
    return `<div class="ep-line">
      <span class="ep-line-art">${ART[it.art] || ''}</span>
      <span class="ep-line-mid">
        <span class="ep-line-name">${esc(it.label)}</span>
        <span class="ep-line-sub">
          ${weigh
            ? `<span class="weigh"><i data-lucide="scale"></i>${fmtKg(ln.weight)} kg</span> × ${it.price} MAD/kg`
            : isUnit(it)
              ? `<span class="u">${ln.qty} × ${fmtMAD2(it.price).replace(' MAD', '')} MAD</span> · à l'unité`
              : `<span class="u">${ln.qty} × ${it.price} MAD</span>`}
        </span>
      </span>
      <span class="ep-line-right">
        <span class="ep-line-price">${fmtMAD2(lineTotal(ln))}</span>
        ${weigh
          ? `<span class="ep-line-qty"><button class="wbtn" data-ep-reweigh="${i}">repeser</button><button data-ep-del="${i}" aria-label="Retirer">×</button></span>`
          : `<span class="ep-line-qty"><button data-ep-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-ep-plus="${i}" aria-label="Ajouter">+</button></span>`}
      </span>
    </div>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const total = ticketTotal(t);
    const count = ticketCount(t);
    const el = $('#ep-ticket', root);
    el.innerHTML = `
      <div class="ep-tk-head">
        <div><span class="ep-tk-title">Ticket</span> <span class="ep-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? `<button class="ep-tk-reset" id="ep-tk-reset">Vider</button>` : ''}
      </div>
      <div class="ep-tk-lines" id="ep-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="ep-tk-empty">
            <i data-lucide="scan-line"></i>
            <div>Le ticket est vide.<br>Scannez un produit, ou touchez-le dans la grille.</div>
            <div class="ep-empty-hint">essayez « Scanner » pour la démo</div>
          </div>`}
      </div>
      <div class="ep-tk-foot">
        <div class="ep-tk-tot">
          <span class="pcs"><i data-lucide="shopping-cart"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${t.lines.length ? '<span>espèces · carte · ardoise</span>' : ''}
        </div>
        <div class="ep-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD2(total)}</span></div>
        <div class="ep-tk-actions">
          <button class="ep-pay" id="ep-pay" ${t.lines.length ? '' : 'disabled'}>
            <i data-lucide="banknote"></i> Encaisser
          </button>
          <button class="ep-credit-btn" id="ep-credit" ${t.lines.length ? '' : 'disabled'}>
            <i data-lucide="notebook"></i>
            <span>Ardoise</span><small>mettre au carnet</small>
          </button>
        </div>
      </div>`;
    const reset = $('#ep-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); focusScan(); };
    $('#ep-pay', el).onclick = () => { if (t.lines.length) openPay(); };
    $('#ep-credit', el).onclick = () => { if (t.lines.length) openCarnetPick(); };
    $('#ep-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-ep-minus]');
      const plus = e.target.closest('[data-ep-plus]');
      const del = e.target.closest('[data-ep-del]');
      const reweigh = e.target.closest('[data-ep-reweigh]');
      if (reweigh) { const ln = t.lines[+reweigh.dataset.epReweigh]; openWeigh(ITEMS[ln.itemId], +reweigh.dataset.epReweigh); return; }
      if (del) { t.lines.splice(+del.dataset.epDel, 1); renderTicket(); icons(); return; }
      const idx = minus ? +minus.dataset.epMinus : plus ? +plus.dataset.epPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) ln.qty++;
      else { ln.qty--; if (ln.qty <= 0) t.lines.splice(idx, 1); }
      renderTicket(); icons();
    };
    icons();
  }

  /* ═══════════════════════ SCAN (field submit + mock cycle) ═══════════════════════ */
  function submitScan(raw) {
    const code = (raw || '').replace(/\s/g, '');
    const inp = $('#ep-scan-input', root);
    if (!code) { focusScan(); return; }
    const it = BY_EAN[code];
    if (it) {
      addItem(it.id);
      toast(`${it.label}, ajouté`);
    } else {
      toast(`Code « ${esc(code)} » inconnu, cherchez le produit`);
      openSearch(code);
    }
    if (inp) inp.value = '';
    focusScan();
  }

  function mockScan() {
    /* cycle a known EAN, show the little laser animation, then add it */
    const it = ITEMS[SCAN_CYCLE[state.scanCycleIdx % SCAN_CYCLE.length]];
    state.scanCycleIdx++;
    const el = $('#ep-scanm', root);
    el.innerHTML = `
      <h3 class="modal-title">Lecture du code-barres…</h3>
      <p class="modal-subtle">Présentez l'article devant la douchette.</p>
      <div class="ep-scan-stage">
        <div class="ep-scan-bars">${barcode(it.ean || it.id, 80)}</div>
        <div class="ep-scan-laser"></div>
      </div>
      <div class="ep-scan-ean">${esc(it.ean || 'pas de code,')}</div>`;
    openVeil('#ep-scan-veil');
    icons();
    setTimeout(() => {
      closeVeil('#ep-scan-veil');
      addItem(it.id);
      toast(`${it.label}, ${fmtMAD2(it.price).replace(' MAD', '')} MAD`);
    }, 1050);
  }

  /* ═══════════════════════ SEARCH FALLBACK ═══════════════════════ */
  function openSearch(prefill) {
    const el = $('#ep-searchm', root);
    const pre = typeof prefill === 'string' ? prefill : '';
    const render = (q) => {
      const ql = (q || '').toLowerCase().trim();
      const hits = !ql ? Object.values(ITEMS)
        : Object.values(ITEMS).filter((it) =>
            it.label.toLowerCase().includes(ql) ||
            it.catLabel.toLowerCase().includes(ql) ||
            (it.telco && it.telco.toLowerCase().includes(ql)) ||
            (it.ean && it.ean.includes(ql)));
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Chercher un produit</h3>
        <p class="modal-subtle">Quand le code ne passe pas, par nom, rayon ou télécom.</p>
        <div class="ep-search-in"><i data-lucide="search"></i>
          <input id="ep-search-q" placeholder="Coca, lait, recharge inwi…" value="${esc(q || '')}" autocomplete="off" />
        </div>
        <div class="ep-search-results">
          ${hits.slice(0, 40).map((it) => `
            <button class="ep-sr" data-ep-sr="${it.id}">
              <span class="ep-sr-art">${ART[it.art] || ''}</span>
              <span class="ep-sr-mid">
                <span class="ep-sr-name">${esc(it.label)}</span>
                <span class="ep-sr-sub">${esc(it.catLabel)}${it.ean ? ` · ${it.ean}` : ''}</span>
              </span>
              <span class="ep-sr-price">${isWeigh(it) ? it.price + ' /kg' : fmtMAD2(it.price).replace(' MAD', '') + ' MAD'}</span>
            </button>`).join('') || `<div class="ep-sr-empty">Rien pour « ${esc(q)} » dans le rayon.</div>`}
        </div>`;
      $('#ep-search-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#ep-search-q', el); i.focus(); const v = i.value; i.value = ''; i.value = v; };
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-search-veil'); });
      $$('[data-ep-sr]', el).forEach((b) => {
        b.onclick = () => { closeVeil('#ep-search-veil'); addItem(b.dataset.epSr); };
      });
    };
    render(pre);
    openVeil('#ep-search-veil');
    icons();
    setTimeout(() => { const i = $('#ep-search-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ WEIGH (balance) ═══════════════════════ */
  function openWeigh(it, reweighIdx) {
    const el = $('#ep-weighm', root);
    const presets = it.presets || [0.25, 0.5, 1, 2];
    let weight = (reweighIdx != null && state.ticket.lines[reweighIdx]) ? state.ticket.lines[reweighIdx].weight : (presets[1] || 0.5);
    const maxW = Math.max(3, presets[presets.length - 1]);
    const render = () => {
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="ep-weigh-head">
          <span class="ep-weigh-art">${ART[it.art] || ''}</span>
          <span class="ep-weigh-title"><h3>${esc(it.label)}</h3><span class="sub">${it.price} MAD / kg, sur la balance</span></span>
        </div>
        <div class="ep-scale"><span class="kg" id="ep-scale-kg">${fmtKg(weight)}</span><span class="unit">kg</span></div>
        <div class="ep-weigh-presets" id="ep-weigh-presets">
          ${presets.map((p) => `<button class="ep-weigh-preset ${Math.abs(p - weight) < 0.0005 ? 'on' : ''}" data-ep-w="${p}">${fmtKg(p)}</button>`).join('')}
        </div>
        <div class="ep-weigh-slider">
          <input type="range" id="ep-weigh-range" min="0.05" max="${maxW}" step="0.05" value="${weight}" />
          <div class="scale-ticks"><span>0,05 kg</span><span>${fmtKg(maxW / 2)} kg</span><span>${fmtKg(maxW)} kg</span></div>
        </div>
        <div class="ep-weigh-result">
          <span class="lbl">À payer <span class="calc" id="ep-weigh-calc">${fmtKg(weight)} kg × ${it.price} MAD</span></span>
          <span class="val" id="ep-weigh-val">${fmtMAD2(it.price * weight)}</span>
        </div>
        <div class="ep-weigh-foot">
          <button class="ep-btn secondary" data-ep-close>Annuler</button>
          <button class="ep-btn primary" id="ep-weigh-ok"><i data-lucide="check"></i>${reweighIdx != null ? 'Mettre à jour' : 'Ajouter au ticket'} · <span id="ep-weigh-cta">${fmtMAD2(it.price * weight)}</span></button>
        </div>`;
      icons();
      const refresh = () => {
        $('#ep-scale-kg', el).textContent = fmtKg(weight);
        $('#ep-weigh-val', el).textContent = fmtMAD2(it.price * weight);
        $('#ep-weigh-cta', el).textContent = fmtMAD2(it.price * weight);
        $('#ep-weigh-calc', el).textContent = `${fmtKg(weight)} kg × ${it.price} MAD`;
        $$('[data-ep-w]', el).forEach((b) => b.classList.toggle('on', Math.abs(+b.dataset.epW - weight) < 0.0005));
      };
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-weigh-veil'); });
      $('#ep-weigh-presets', el).onclick = (e) => {
        const b = e.target.closest('[data-ep-w]');
        if (!b) return;
        weight = +b.dataset.epW;
        $('#ep-weigh-range', el).value = weight;
        refresh();
      };
      $('#ep-weigh-range', el).oninput = (e) => { weight = Math.round(+e.target.value * 100) / 100; refresh(); };
      $('#ep-weigh-ok', el).onclick = () => {
        const w = Math.round(weight * 1000) / 1000;
        closeVeil('#ep-weigh-veil');
        if (reweighIdx != null && state.ticket.lines[reweighIdx]) {
          state.ticket.lines[reweighIdx].weight = w;
          renderTicket(); icons();
          toast(`${it.label}, ${fmtKg(w)} kg · ${fmtMAD2(it.price * w)}`);
        } else {
          addItem(it.id, { weight: w });
          toast(`${it.label}, ${fmtKg(w)} kg · ${fmtMAD2(it.price * w)}`);
        }
      };
    };
    render();
    openVeil('#ep-weigh-veil');
    icons();
  }

  /* ═══════════════════════ PAYMENT (espèces / carte / ardoise) ═══════════════════════
     Reuses the caisse kit: .modal-title/.modal-subtle/.modal-amount, .cash-grid
     for espèces, .reader-stage/.reader-disc for carte. */
  function openPay() {
    const el = $('#ep-paym', root);
    const t = state.ticket;
    const total = ticketTotal(t);

    const step1 = () => {
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Encaissement</h3>
        <p class="modal-subtle">${t.num} · ${ticketCount(t)} article${ticketCount(t) > 1 ? 's' : ''}</p>
        <div class="modal-amount size-md">${fmtMAD2(total)}</div>
        <div class="ep-pay-opts">
          <button class="ep-pay-opt is-usual" data-ep-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Flous, rendu calculé</span></span>
            <span class="amt">${fmtMAD2(total)}</span>
          </button>
          <button class="ep-pay-opt" data-ep-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire</span></span>
          </button>
          <button class="ep-pay-opt" data-ep-m="ardoise">
            <span class="ic"><i data-lucide="notebook"></i></span>
            <span class="l"><b>Mettre à l'ardoise</b><span>Au carnet d'un voisin, réglé plus tard</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-pay-veil'); });
      $$('[data-ep-m]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.epM;
          if (m === 'especes') stepCash();
          else if (m === 'carte') stepCard();
          else { closeVeil('#ep-pay-veil'); openCarnetPick(); }
        };
      });
    };

    const stepCash = () => {
      let received = Math.ceil(total);
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD2(total)}</h3>
        <p class="modal-subtle">${t.num}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ep-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="ep-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${received}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="5">+5</button>
            <button class="cash-preset" data-add="10">+10</button>
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
          </div>
          <div class="cash-rendu" id="ep-cash-rendu-box"><span class="lbl">Rendu</span><span class="val mono" id="ep-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ep-cash-ok">Confirmer · khlass</button>
        </div>`;
      icons();
      const box = $('#ep-cash-rendu-box', el);
      const refresh = () => {
        const rendu = received - total;
        $('#ep-cash-rendu', el).textContent = fmtMAD2(Math.max(0, rendu));
        box.classList.toggle('is-positive', rendu > 0.0001);
        box.classList.toggle('is-short', rendu < -0.0001);
        $('#ep-cash-ok', el).disabled = received < total - 0.0001;
      };
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-pay-veil'); });
      $('#ep-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#ep-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#ep-cash-ok', el).onclick = () => finishSale('especes', Math.max(0, received - total));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD2(total)}</h3>
        <p class="modal-subtle">${t.num} · lecteur partenaire, Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="ep-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="ep-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-pay-veil'); });
      setTimeout(() => {
        const disc = $('#ep-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#ep-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(total, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => finishSale('carte', 0), 900);
        });
      }, 1900);
    };

    const finishSale = (method, rendu) => {
      const total = ticketTotal(state.ticket);
      decrementStock(state.ticket);
      recordSaleToDay(state.ticket, method);
      closeVeil('#ep-pay-veil');
      const label = method === 'carte' ? 'carte' : 'espèces';
      ticketSeq++;
      freshTicket();
      renderTicket(); renderGrid(); renderBadges(); icons();
      queueIfOffline('Vente');
      toast(`Encaissé, ${fmtMAD2(total)} en ${label}${rendu > 0.0001 ? ` · rendu ${fmtMAD2(rendu)}` : ''}`);
      focusScan();
    };

    step1();
    openVeil('#ep-pay-veil');
  }

  function decrementStock(t) {
    t.lines.forEach((ln) => {
      const it = ITEMS[ln.itemId];
      if (typeof it.stock !== 'number') return;
      if (ln.weight != null) it.stock = Math.max(0, Math.round((it.stock - ln.weight) * 100) / 100);
      else it.stock = Math.max(0, it.stock - ln.qty);
    });
  }
  function recordSaleToDay(t, method) {
    const total = ticketTotal(t);
    if (method === 'carte') day.carte += total; else day.especes += total;
    day.tickets++;
    /* nourrir le top du jour */
    t.lines.forEach((ln) => {
      const row = day.top.find((r) => r.id === ln.itemId);
      const add = ln.weight != null ? 1 : ln.qty;
      if (row) row.qty += add;
    });
    /* Journal partagé : le serveur (donc le tableau de bord de la patronne) et
       la reprise après rechargement. Sans ça la recette vivait uniquement dans
       `day` et disparaissait au premier refresh. Démo : no-op. */
    postDay(total, method, t.lines.length === 1 ? ITEMS[t.lines[0].itemId].label : `Courses (${ticketCount(t)} art.)`, t.num);
  }
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('epicerie', { total, method, label, ref });
    } catch (_) {}
  }

  /* ═══════════════════════ CARNET PICK (attacher le panier à une ardoise) ═══════════════════════ */
  function openCarnetPick() {
    const el = $('#ep-carnetpickm', root);
    const t = state.ticket;
    const total = ticketTotal(t);
    let mode = 'pick';
    const basketLabel = () => {
      if (t.lines.length === 1) return ITEMS[t.lines[0].itemId].label;
      return `${ticketCount(t)} articles`;
    };
    const render = () => {
      el.innerHTML = mode === 'pick' ? `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Mettre à l'ardoise</h3>
        <p class="modal-subtle">${fmtMAD2(total)} · ${esc(basketLabel())}, sur le carnet de quel voisin ?</p>
        <div class="ep-carnet-pick">
          ${CARNET.map((c) => {
            const bal = balanceOf(c);
            return `<button class="ep-cp" data-ep-cp="${c.id}">
              <span class="ep-cp-ava">${esc(initials(c.name))}</span>
              <span class="ep-cp-mid">
                <span class="ep-cp-name">${esc(c.name)}</span>
                <span class="ep-cp-sub">${esc(c.phone)}</span>
              </span>
              <span class="ep-cp-bal ${bal > 0 ? 'due' : 'zero'}">${bal > 0 ? fmtMAD(bal) : 'à jour'}</span>
            </button>`;
          }).join('')}
        </div>
        <button class="ep-cp-new" id="ep-cp-new"><i data-lucide="user-plus"></i>Nouveau voisin sur le carnet</button>`
      : `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Nouveau voisin</h3>
        <p class="modal-subtle">On ouvre une ardoise, ${fmtMAD2(total)} dessus.</p>
        <div class="ep-cp-form">
          <input class="ep-in" id="ep-cp-name" placeholder="Nom (ex. Mme Naïma)" />
          <input class="ep-in" id="ep-cp-tel" inputmode="tel" placeholder="Téléphone (pour le rappel WhatsApp)" />
          <div class="ep-weigh-foot" style="margin-top:4px;">
            <button class="ep-btn secondary" id="ep-cp-back">Retour</button>
            <button class="ep-btn primary" id="ep-cp-create"><i data-lucide="check"></i>Ouvrir l'ardoise</button>
          </div>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-carnetpick-veil'); });
      $$('[data-ep-cp]', el).forEach((b) => {
        b.onclick = () => attachBasket(CRED[b.dataset.epCp]);
      });
      const nw = $('#ep-cp-new', el);
      if (nw) nw.onclick = () => { mode = 'create'; render(); };
      const back = $('#ep-cp-back', el);
      if (back) back.onclick = () => { mode = 'pick'; render(); };
      const create = $('#ep-cp-create', el);
      if (create) create.onclick = () => {
        const name = $('#ep-cp-name', el).value.trim();
        const tel = $('#ep-cp-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour ouvrir une ardoise'); return; }
        const c = { id: 'kx' + Date.now().toString(36), name, phone: tel, note: 'nouvelle ardoise', hist: [] };
        CARNET.push(c); CRED[c.id] = c;
        attachBasket(c);
      };
    };
    render();
    openVeil('#ep-carnetpick-veil');
    icons();
  }

  function attachBasket(c) {
    const t = state.ticket;
    const total = ticketTotal(t);
    if (total <= 0) return;
    const label = t.lines.length === 1 ? ITEMS[t.lines[0].itemId].label : `Courses (${ticketCount(t)} articles)`;
    c.hist.push({ type: 'debt', label, amt: Math.round(total), at: new Date() });
    day.creditAdded += Math.round(total);
    decrementStock(t);
    day.tickets++;
    closeVeil('#ep-carnetpick-veil');
    ticketSeq++;
    freshTicket();
    renderTicket(); renderGrid(); renderBadges(); icons();
    queueIfOffline('Ardoise');
    toast(`${fmtMAD2(total)} sur l'ardoise de ${c.name}, solde ${fmtMAD(balanceOf(c))}`);
    focusScan();
  }

  /* ═══════════════════════ CARNET DE CRÉDIT (écran) ═══════════════════════ */
  function renderCarnet() {
    const panel = $('[data-ep-panel="carnet"]', root);
    const q = state.carnetQuery.toLowerCase().trim();
    const list = CARNET
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')))
      .slice()
      .sort((a, b) => balanceOf(b) - balanceOf(a));
    panel.innerHTML = `
      <div class="ep-carnet">
        <div class="ep-carnet-list">
          <header class="ep-head">
            <div><h1>Carnet de crédit</h1><div class="ep-head-sub">L'ardoise du quartier, fini le cahier sous le comptoir</div></div>
          </header>
          ${state.attachFrom ? `<div class="ep-attach-banner" id="ep-attach-banner">
            <i data-lucide="notebook"></i>
            <span>Panier en attente, <b>${esc(state.attachFrom.label)}</b> · ${fmtMAD2(state.attachFrom.total)}. Touchez un voisin pour l'y mettre.</span>
            <button class="x" id="ep-attach-cancel"><i data-lucide="x"></i></button>
          </div>` : ''}
          <div class="ep-carnet-tools">
            <div class="ep-carnet-search"><i data-lucide="search"></i>
              <input id="ep-carnet-q" placeholder="Nom ou téléphone du voisin…" value="${esc(state.carnetQuery)}" autocomplete="off" /></div>
            <div class="ep-carnet-total">
              <span>On nous doit, en tout</span>
              <b>${fmtMAD(totalCredit())}</b>
            </div>
          </div>
          <div class="ep-carnet-scroll">
            <div class="ep-carnet-grid">
              ${list.map(ardoiseCard).join('') || `<div class="ep-sr-empty" style="grid-column:1/-1;">Aucun voisin pour « ${esc(state.carnetQuery)} ».</div>`}
            </div>
          </div>
        </div>
      </div>`;
    $('#ep-carnet-q', panel).oninput = (e) => {
      state.carnetQuery = e.target.value;
      renderCarnet(); icons();
      const i = $('#ep-carnet-q', panel); i.focus(); const v = i.value; i.value = ''; i.value = v;
    };
    const cancel = $('#ep-attach-cancel', panel);
    if (cancel) cancel.onclick = () => { state.attachFrom = null; renderCarnet(); icons(); };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-ep-ard]');
      if (!b) return;
      if (e.target.closest('#ep-attach-cancel')) return;
      if (state.attachFrom) {
        const c = CRED[b.dataset.epArd];
        c.hist.push({ type: 'debt', label: state.attachFrom.label, amt: Math.round(state.attachFrom.total), at: new Date() });
        day.creditAdded += Math.round(state.attachFrom.total);
        toast(`${fmtMAD2(state.attachFrom.total)} sur l'ardoise de ${c.name}`);
        state.attachFrom = null;
        renderCarnet(); renderBadges(); icons();
        return;
      }
      openArdoise(b.dataset.epArd);
    };
    icons();
  }

  function ardoiseCard(c) {
    const bal = balanceOf(c);
    const oldest = oldestDebt(c);
    const old = oldest && (Date.now() - oldest.getTime()) > 14 * DAY && bal > 0;
    const sinceTxt = bal > 0 && oldest ? `depuis ${sinceLabel(oldest)}` : 'à jour';
    return `<button class="ep-ardoise ${old ? 'is-old' : ''} ${bal <= 0 ? 'is-paid' : ''}" data-ep-ard="${c.id}">
      <div class="ep-ard-top">
        <span class="ep-ard-ava">${esc(initials(c.name))}</span>
        <span class="ep-ard-who">
          <span class="ep-ard-name">${esc(c.name)}</span>
          <span class="ep-ard-meta">${esc(c.phone)}</span>
        </span>
        <span class="ep-ard-bal ${bal <= 0 ? 'zero' : ''}">
          <span class="amt">${bal > 0 ? fmtMAD(bal) : '0 MAD'}</span>
          <span class="since">${c.hist.length} mouvement${c.hist.length > 1 ? 's' : ''}</span>
        </span>
      </div>
      <div class="ep-ard-foot">
        <span class="ep-ard-since-chip ${old ? 'old' : bal <= 0 ? 'zero' : ''}">
          <i data-lucide="${bal <= 0 ? 'check' : 'clock'}"></i>${esc(sinceTxt)}
        </span>
        <span class="ep-ard-go">Ouvrir <i data-lucide="chevron-right"></i></span>
      </div>
    </button>`;
  }

  /* ---------- ardoise detail (history + règlement + WhatsApp) ---------- */
  function openArdoise(id) {
    const c = CRED[id];
    if (!c) return;
    const el = $('#ep-ardm', root);
    const bal = balanceOf(c);
    const oldest = oldestDebt(c);
    const hist = c.hist.slice().sort((a, b) => b.at - a.at);
    el.innerHTML = `
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="ep-dt-head">
        <span class="ep-dt-ava">${esc(initials(c.name))}</span>
        <span class="ep-dt-who">
          <h3>${esc(c.name)}</h3>
          <span class="sub">${esc(c.phone)}${c.note ? ` · ${esc(c.note)}` : ''}</span>
        </span>
        <span class="ep-dt-bal ${bal <= 0 ? 'zero' : ''}">
          <span class="amt">${bal > 0 ? fmtMAD(bal) : '0 MAD'}</span>
          <span class="lbl">${bal > 0 ? `dû ${oldest ? 'depuis ' + sinceLabel(oldest) : ''}` : 'à jour'}</span>
        </span>
      </div>
      <div class="ep-dt-hist">
        <div class="ep-dt-hist-head">Historique du carnet</div>
        <div class="ep-htl">
          ${hist.map((h) => `
            <div class="ep-ht">
              <span class="ep-ht-ic ${h.type}"><i data-lucide="${h.type === 'pay' ? 'hand-coins' : 'shopping-bag'}"></i></span>
              <span class="ep-ht-mid">
                <span class="ep-ht-label">${esc(h.label)}</span>
                <span class="ep-ht-date">${fmtDT(h.at)}</span>
              </span>
              <span class="ep-ht-amt ${h.type}">${h.type === 'pay' ? '−' : '+'}${fmtMAD(h.amt)}</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="ep-dt-actions">
        ${bal > 0 ? `<button class="ep-btn primary" id="ep-ard-settle"><i data-lucide="hand-coins"></i>Règlement · ${fmtMAD(bal)}</button>` : ''}
        ${bal > 0 ? `<button class="ep-btn secondary" id="ep-ard-wa"><i data-lucide="message-circle"></i>Rappel WhatsApp</button>` : ''}
        <button class="ep-btn ghost" id="ep-ard-add"><i data-lucide="plus"></i>Ajouter une dette</button>
      </div>`;
    openVeil('#ep-ard-veil');
    icons();
    $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-ard-veil'); });
    const settle = $('#ep-ard-settle', el);
    if (settle) settle.onclick = () => { closeVeil('#ep-ard-veil'); openSettle(c); };
    const wa = $('#ep-ard-wa', el);
    if (wa) wa.onclick = () => openWa(c);
    $('#ep-ard-add', el).onclick = () => quickDebt(c);
  }

  /* quick manual debt (e.g. neighbour grabs bread, no scan) */
  function quickDebt(c) {
    const el = $('#ep-ardm', root);
    /* small inline prompt reuses the pay modal shell */
    const pv = $('#ep-paym', root);
    let amt = 20;
    pv.innerHTML = `
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Ajouter au carnet de ${esc(politeName(c.name))}</h3>
      <p class="modal-subtle">Un achat à crédit sans passer par la caisse (pain, lait…).</p>
      <div class="modal-amount size-md" id="ep-qd-val">${fmtMAD(amt)}</div>
      <div class="cash-presets" style="justify-content:center;margin-bottom:14px;">
        <button class="cash-preset" data-qd="5">5</button>
        <button class="cash-preset" data-qd="10">10</button>
        <button class="cash-preset" data-qd="20">20</button>
        <button class="cash-preset" data-qd="50">50</button>
      </div>
      <div class="cash-input-row" style="margin-bottom:14px;">
        <label class="cash-input-label" for="ep-qd-in">Montant (MAD)</label>
        <input class="cash-input mono" id="ep-qd-in" type="number" inputmode="numeric" min="1" step="1" value="${amt}" />
      </div>
      <div class="ep-weigh-foot">
        <button class="ep-btn secondary" data-ep-close>Annuler</button>
        <button class="ep-btn primary" id="ep-qd-ok"><i data-lucide="check"></i>Mettre au carnet</button>
      </div>`;
    closeVeil('#ep-ard-veil');
    openVeil('#ep-pay-veil');
    icons();
    const refresh = () => { $('#ep-qd-val', pv).textContent = fmtMAD(amt); $('#ep-qd-in', pv).value = amt; };
    $$('[data-ep-close]', pv).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
    $$('[data-qd]', pv).forEach((b) => { b.onclick = () => { amt = +b.dataset.qd; refresh(); }; });
    $('#ep-qd-in', pv).oninput = (e) => { amt = Math.max(0, +e.target.value || 0); $('#ep-qd-val', pv).textContent = fmtMAD(amt); };
    $('#ep-qd-ok', pv).onclick = () => {
      if (amt <= 0) { toast('Montant invalide'); return; }
      c.hist.push({ type: 'debt', label: 'Achat à crédit', amt: Math.round(amt), at: new Date() });
      day.creditAdded += Math.round(amt);
      closeVeil('#ep-pay-veil');
      queueIfOffline('Ardoise');
      toast(`+${fmtMAD(amt)} sur l'ardoise de ${c.name}, solde ${fmtMAD(balanceOf(c))}`);
      renderBadges();
      openArdoise(c.id);
    };
  }

  /* ---------- règlement (full / partial) — reuses the cash kit ---------- */
  function openSettle(c) {
    const el = $('#ep-paym', root);
    const bal = balanceOf(c);

    const step1 = () => {
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Règlement, ${esc(politeName(c.name))}</h3>
        <p class="modal-subtle">Solde de l'ardoise · ${fmtMAD(bal)}</p>
        <div class="modal-amount size-md">${fmtMAD(bal)}</div>
        <div class="ep-pay-opts">
          <button class="ep-pay-opt is-usual" data-ep-settle="full">
            <span class="ic"><i data-lucide="check-check"></i></span>
            <span class="l"><b>Tout régler</b><span>Solde le carnet, remis à zéro</span></span>
            <span class="amt">${fmtMAD(bal)}</span>
          </button>
          <button class="ep-pay-opt" data-ep-settle="partial">
            <span class="ic"><i data-lucide="coins"></i></span>
            <span class="l"><b>Règlement partiel</b><span>Le voisin donne ce qu'il peut aujourd'hui</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
      $$('[data-ep-settle]', el).forEach((b) => {
        b.onclick = () => stepCash(b.dataset.epSettle === 'full' ? bal : Math.min(bal, Math.max(10, Math.round(bal / 2 / 10) * 10)), b.dataset.epSettle);
      });
    };

    const stepCash = (amount, kind) => {
      let pay = amount;
      let received = Math.ceil(amount);
      el.innerHTML = `
        <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${kind === 'full' ? 'Règlement total' : 'Règlement partiel'}</h3>
        <p class="modal-subtle">${esc(c.name)} · solde ${fmtMAD(bal)}</p>
        ${kind === 'partial' ? `
          <div class="cash-input-row" style="margin-bottom:6px;">
            <label class="cash-input-label" for="ep-settle-amt">Montant réglé aujourd'hui</label>
            <input class="cash-input mono" id="ep-settle-amt" type="number" inputmode="numeric" min="1" max="${bal}" step="5" value="${pay}" />
          </div>
          <div class="cash-presets" style="margin-bottom:12px;">
            <button class="cash-preset" data-sp="20">20</button>
            <button class="cash-preset" data-sp="50">50</button>
            <button class="cash-preset" data-sp="100">100</button>
            <button class="cash-preset" data-sp="half">moitié</button>
            <button class="cash-preset" data-sp="all">tout</button>
          </div>` : `<div class="modal-amount size-md" id="ep-settle-show">${fmtMAD(pay)}</div>`}
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="ep-settle-in">Flous reçu</label>
            <input class="cash-input mono" id="ep-settle-in" type="number" inputmode="numeric" min="0" step="1" value="${received}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="10">+10</button>
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
          </div>
          <div class="cash-rendu" id="ep-settle-rendu-box"><span class="lbl">Rendu</span><span class="val mono" id="ep-settle-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="ep-settle-ok">Encaisser le règlement</button>
        </div>`;
      icons();
      const box = $('#ep-settle-rendu-box', el);
      const refresh = () => {
        const rendu = received - pay;
        $('#ep-settle-rendu', el).textContent = fmtMAD(Math.max(0, rendu));
        box.classList.toggle('is-positive', rendu > 0.0001);
        box.classList.toggle('is-short', rendu < -0.0001);
        $('#ep-settle-ok', el).disabled = received < pay - 0.0001 || pay <= 0;
        const show = $('#ep-settle-show', el); if (show) show.textContent = fmtMAD(pay);
      };
      $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => { closeVeil('#ep-pay-veil'); openArdoise(c.id); }; });
      const amtInput = $('#ep-settle-amt', el);
      if (amtInput) amtInput.oninput = (e) => { pay = Math.max(0, Math.min(bal, +e.target.value || 0)); refresh(); };
      $$('[data-sp]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.sp;
          pay = v === 'half' ? Math.round(bal / 2 / 5) * 5 : v === 'all' ? bal : Math.min(bal, +v);
          if (amtInput) amtInput.value = pay;
          if (received < pay) { received = Math.ceil(pay); $('#ep-settle-in', el).value = received; }
          refresh();
        };
      });
      $('#ep-settle-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#ep-settle-in', el).value = received; refresh(); };
      });
      refresh();
      $('#ep-settle-ok', el).onclick = () => {
        const rendu = Math.max(0, received - pay);
        c.hist.push({ type: 'pay', label: pay >= bal ? 'Règlement (soldé)' : 'Règlement partiel', amt: Math.round(pay), at: new Date() });
        /* Un règlement d'ardoise, c'est de l'argent qui entre dans le tiroir.
           Le toast l'annonçait déjà, mais ni la recette du jour ni le tableau
           de bord n'en voyaient la couleur : la journée était sous-comptée de
           tout ce que les voisins venaient rembourser. */
        day.especes += pay;
        postDay(pay, 'especes', `Ardoise · ${c.name}`, '');
        closeVeil('#ep-pay-veil');
        queueIfOffline('Règlement');
        const newBal = balanceOf(c);
        toast(newBal > 0
          ? `${fmtMAD(pay)} encaissé, reste ${fmtMAD(newBal)} sur l'ardoise${rendu > 0.0001 ? ` · rendu ${fmtMAD(rendu)}` : ''}`
          : `Ardoise soldée, ${esc(c.name)}, l'lah ikhellik${rendu > 0.0001 ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
        renderBadges();
        openArdoise(c.id);
      };
    };

    step1();
    openVeil('#ep-pay-veil');
  }

  /* ═══════════════════════ WHATSAPP — rappel TRÈS poli (c'est un voisin) ═══════════════════════ */
  function waMessage(c) {
    const bal = balanceOf(c);
    const first = politeName(c.name);
    return `Sba7 lkhir ${first}, j'espère que vous allez bien.`
      + `\nPetit rappel tout doux de ${pvName("l'Épicerie Si Brahim") || "l'épicerie"} : il reste ${bal} MAD sur le carnet, quand ça vous arrange, aucune urgence.`
      + `\nBaraka Allah o fik, et bonne journée.`;
  }
  function openWa(c) {
    const el = $('#ep-wam', root);
    const bal = balanceOf(c);
    el.innerHTML = `
      <button class="ep-modal-x" data-ep-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Rappel WhatsApp</h3>
      <p class="modal-subtle">${esc(c.name)} · ${esc(c.phone)}, solde ${fmtMAD(bal)}</p>
      <div class="ep-wa-tone"><i data-lucide="heart"></i>Ton volontairement très poli, c'est un voisin, pas un débiteur.</div>
      <div class="ep-wa-bubblewrap">
        <div class="ep-wa-bubble">
          <textarea id="ep-wa-text">${esc(waMessage(c))}</textarea>
          <div class="ep-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}</div>
        </div>
      </div>
      <div class="ep-weigh-foot">
        <button class="ep-btn ghost" data-ep-close>Plus tard</button>
        <button class="ep-btn primary" id="ep-wa-send" ${c.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>`;
    openVeil('#ep-wa-veil');
    icons();
    $$('[data-ep-close]', el).forEach((b) => { b.onclick = () => closeVeil('#ep-wa-veil'); });
    $('#ep-wa-send', el).onclick = () => {
      closeVeil('#ep-wa-veil');
      queueIfOffline('Rappel WhatsApp');
      toast(`Rappel envoyé à ${c.name}, tout en douceur`);
    };
  }

  /* ═══════════════════════ STOCK RAPIDE ═══════════════════════ */
  function renderStock() {
    const panel = $('[data-ep-panel="stock"]', root);
    const items = stockItems();
    const out = items.filter((it) => it.stock <= 0);
    const low = items.filter((it) => it.stock > 0 && it.stock <= it.reorder);
    const ok = items.filter((it) => it.stock > it.reorder);
    const reassortCount = Object.keys(state.reassort).filter((k) => state.reassort[k] > 0).length;
    panel.innerHTML = `
      <div class="ep-stock">
        <div class="ep-stock-main">
          <header class="ep-head">
            <div><h1>Stock rapide</h1><div class="ep-head-sub">Ce qui manque pour la tournée du grossiste, un coup d'œil, une liste</div></div>
          </header>
          <div class="ep-stock-scroll">
            ${out.length ? `
              <div class="ep-stock-sec-head alert"><i data-lucide="package-open"></i>Rupture <span class="ct">${out.length}</span></div>
              <div class="ep-stock-grid">${out.map(stkCard).join('')}</div>` : ''}
            ${low.length ? `
              <div class="ep-stock-sec-head alert"><i data-lucide="package"></i>Bientôt épuisé <span class="ct">${low.length}</span></div>
              <div class="ep-stock-grid">${low.map(stkCard).join('')}</div>` : ''}
            <div class="ep-stock-sec-head"><i data-lucide="check-circle-2"></i>Bien approvisionné <span class="ct">${ok.length}</span></div>
            <div class="ep-stock-grid">${ok.map(stkCard).join('')}</div>
          </div>
        </div>
        <aside class="ep-reassort">
          <div class="ep-reassort-head">
            <h2><i data-lucide="truck"></i>Liste de réassort</h2>
            <div class="sub">${pvReal() ? 'Pour le passage' : 'Pour Si Brahim quand il va'} au grossiste du Souk. Ajoutez ce qui manque.</div>
          </div>
          <div class="ep-reassort-list" id="ep-reassort-list">
            ${reassortCount ? Object.keys(state.reassort).filter((k) => state.reassort[k] > 0).map(reassortRow).join('') : `
              <div class="ep-reassort-empty">
                <i data-lucide="clipboard-check"></i>
                <div>Liste vide.<br>Touchez « + » sur un produit qui manque.</div>
              </div>`}
          </div>
          <div class="ep-reassort-foot">
            <div class="ep-reassort-tot"><span>Références</span><b>${reassortCount}</b></div>
            <button class="ep-btn primary" id="ep-reassort-send" ${reassortCount ? '' : 'disabled'} style="width:100%;flex:none;"><i data-lucide="send"></i>Envoyer au grossiste</button>
            ${reassortCount ? `<button class="ep-btn ghost" id="ep-reassort-clear" style="width:100%;">Vider la liste</button>` : ''}
          </div>
        </aside>
      </div>`;
    panel.querySelector('.ep-stock-scroll').onclick = (e) => {
      const b = e.target.closest('[data-ep-stk-add]');
      if (b) toggleReassort(b.dataset.epStkAdd);
    };
    const list = $('#ep-reassort-list', panel);
    list.onclick = (e) => {
      const plus = e.target.closest('[data-ep-rs-plus]');
      const minus = e.target.closest('[data-ep-rs-minus]');
      if (plus) { state.reassort[plus.dataset.epRsPlus] = (state.reassort[plus.dataset.epRsPlus] || 0) + 1; renderStock(); icons(); }
      if (minus) {
        const id = minus.dataset.epRsMinus;
        state.reassort[id] = Math.max(0, (state.reassort[id] || 0) - 1);
        if (state.reassort[id] === 0) delete state.reassort[id];
        renderStock(); icons();
      }
    };
    const send = $('#ep-reassort-send', panel);
    if (send) send.onclick = () => {
      const n = Object.keys(state.reassort).filter((k) => state.reassort[k] > 0).length;
      if (!n) return;
      queueIfOffline('Réassort');
      toast(`Liste de réassort envoyée, ${n} référence${n > 1 ? 's' : ''} pour le grossiste`);
      state.reassort = {};
      renderStock(); icons();
    };
    const clear = $('#ep-reassort-clear', panel);
    if (clear) clear.onclick = () => { state.reassort = {}; renderStock(); icons(); };
    icons();
  }

  function stkCard(it) {
    const out = it.stock <= 0;
    const low = it.stock > 0 && it.stock <= it.reorder;
    const queued = (state.reassort[it.id] || 0) > 0;
    const unitTxt = isWeigh(it) ? `${fmtKg(it.stock)} kg` : isUnit(it) ? `${it.stock} à l'unité` : `${it.stock} en rayon`;
    return `<div class="ep-stk ${out ? 'out' : low ? 'alert' : ''} ${queued ? 'queued' : ''}">
      <span class="ep-stk-art">${ART[it.art] || ''}</span>
      <span class="ep-stk-mid">
        <span class="ep-stk-name">${esc(it.label)}</span>
        <span class="ep-stk-reste ${out ? 'out' : low ? 'low' : ''}">reste ${esc(unitTxt)}${low && !out ? ` · seuil ${it.reorder}` : ''}</span>
      </span>
      <button class="ep-stk-add" data-ep-stk-add="${it.id}" title="${queued ? 'Déjà sur la liste' : 'Ajouter au réassort'}">
        <i data-lucide="${queued ? 'check' : 'plus'}"></i>
      </button>
    </div>`;
  }

  function reassortRow(id) {
    const it = ITEMS[id];
    const qty = state.reassort[id];
    return `<div class="ep-rl">
      <span class="ep-rl-art">${ART[it.art] || ''}</span>
      <span class="ep-rl-mid">
        <span class="ep-rl-name">${esc(it.label)}</span>
        <span class="ep-rl-sub">reste ${isWeigh(it) ? fmtKg(it.stock) + ' kg' : it.stock}</span>
      </span>
      <span class="ep-rl-qty">
        <button data-ep-rs-minus="${id}" aria-label="Moins">−</button>
        <b>${qty}</b>
        <button data-ep-rs-plus="${id}" aria-label="Plus">+</button>
      </span>
    </div>`;
  }

  function toggleReassort(id) {
    if ((state.reassort[id] || 0) > 0) { delete state.reassort[id]; toast(`${ITEMS[id].label} retiré du réassort`); }
    else { state.reassort[id] = ITEMS[id].reorder ? Math.max(1, ITEMS[id].reorder) : 6; toast(`${ITEMS[id].label} ajouté au réassort`); }
    renderStock(); icons();
  }

  /* ═══════════════════════ JOURNÉE ═══════════════════════ */
  function renderJournee() {
    const panel = $('[data-ep-panel="journee"]', root);
    const credit = totalCredit();
    const recette = day.especes + day.carte;
    const total = day.especes + day.carte || 1;
    const maxQty = Math.max(...day.top.map((r) => r.qty), 1);
    const debtors = CARNET.filter((c) => balanceOf(c) > 0).slice().sort((a, b) => balanceOf(b) - balanceOf(a));
    panel.innerHTML = `
      <div class="ep-journee">
        <div class="ep-jr-inner">
          <header class="ep-head" style="padding:22px 0 0;">
            <div><h1>Journée</h1><div class="ep-head-sub">${fmtDT(new Date())}${pvReal() ? (pvName('') ? ', ' + pvName('') : '') : ', Épicerie Si Brahim'}</div></div>
          </header>
          <div class="ep-jr-stats">
            <div class="ep-jr-stat">
              <div class="ep-jr-stat-lbl"><i data-lucide="banknote"></i>Recette encaissée</div>
              <div class="ep-jr-stat-val">${fmtMAD(recette)}</div>
              <div class="ep-jr-stat-foot">${day.tickets} tickets aujourd'hui</div>
            </div>
            <div class="ep-jr-stat hero">
              <div class="ep-jr-stat-lbl"><i data-lucide="notebook"></i>Crédit en cours dehors</div>
              <div class="ep-jr-stat-val">${fmtMAD(credit)}</div>
              <div class="ep-jr-stat-foot">${debtors.length} voisin${debtors.length > 1 ? 's' : ''} · +${fmtMAD(day.creditAdded)} mis aujourd'hui</div>
            </div>
            <div class="ep-jr-stat">
              <div class="ep-jr-stat-lbl"><i data-lucide="wallet"></i>Caisse + à recouvrer</div>
              <div class="ep-jr-stat-val">${fmtMAD(recette + credit)}</div>
              <div class="ep-jr-stat-foot">si tout le carnet rentrait</div>
            </div>
          </div>

          <div class="ep-jr-split">
            <div class="ep-jr-panel">
              <h2><i data-lucide="star"></i>Top produits du jour <span class="ct">qté vendue</span></h2>
              <div class="ep-top">
                ${day.top.slice().sort((a, b) => b.qty - a.qty).map((r) => {
                  const it = ITEMS[r.id];
                  return `<div class="ep-top-row">
                    <span class="ep-top-art">${ART[it.art] || ''}</span>
                    <span class="ep-top-mid">
                      <span class="ep-top-name">${esc(it.label)}</span>
                      <span class="ep-top-bar"><i style="width:${Math.round(r.qty / maxQty * 100)}%"></i></span>
                    </span>
                    <span class="ep-top-val">${r.qty}<span>${isWeigh(it) ? 'pesées' : isUnit(it) ? 'pièces' : 'unités'}</span></span>
                  </div>`;
                }).join('')}
              </div>
            </div>

            <div class="ep-jr-panel">
              <h2><i data-lucide="coins"></i>Comment on a été payé</h2>
              <div class="ep-pm">
                <div class="ep-pm-row">
                  <span class="ep-pm-ic"><i data-lucide="banknote"></i></span>
                  <span class="ep-pm-mid"><span class="ep-pm-name">Espèces</span><span class="ep-pm-bar"><i style="width:${Math.round(day.especes / total * 100)}%"></i></span></span>
                  <span class="ep-pm-val">${fmtMAD(day.especes)}</span>
                </div>
                <div class="ep-pm-row">
                  <span class="ep-pm-ic"><i data-lucide="credit-card"></i></span>
                  <span class="ep-pm-mid"><span class="ep-pm-name">Carte</span><span class="ep-pm-bar"><i style="width:${Math.round(day.carte / total * 100)}%"></i></span></span>
                  <span class="ep-pm-val">${fmtMAD(day.carte)}</span>
                </div>
                <div class="ep-pm-row">
                  <span class="ep-pm-ic"><i data-lucide="notebook"></i></span>
                  <span class="ep-pm-mid"><span class="ep-pm-name">Mis à l'ardoise</span><span class="ep-pm-bar credit"><i style="width:${Math.round(day.creditAdded / total * 100)}%"></i></span></span>
                  <span class="ep-pm-val">${fmtMAD(day.creditAdded)}</span>
                </div>
              </div>
              <h2 style="margin-top:18px;"><i data-lucide="notebook"></i>À recouvrer <span class="ct">${fmtMAD(credit)}</span></h2>
              <div class="ep-jr-creditors">
                ${debtors.slice(0, 4).map((c) => {
                  const oldest = oldestDebt(c);
                  return `<button class="ep-jr-creditor" data-ep-jr-cred="${c.id}">
                    <span class="nm">${esc(c.name)}</span>
                    <span class="since">${oldest ? sinceLabel(oldest) : ''}</span>
                    <span class="amt">${fmtMAD(balanceOf(c))}</span>
                  </button>`;
                }).join('') || '<div class="ep-sr-empty" style="padding:10px;">Aucun crédit en cours, tout le monde est à jour.</div>'}
              </div>
            </div>
          </div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const b = e.target.closest('[data-ep-jr-cred]');
      if (b) openArdoise(b.dataset.epJrCred);
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
    const net = $('#ep-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.ep-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.ep-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'ep-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#ep-offline-note', root);
    if (note) { note.hidden = !state.offline; $('#ep-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : ''; }
  }

  /* ═══════════════════════ REGISTER ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'epicerie',
    greet: { line1: 'Sba7 lkhir Si Brahim,', em: 'marhba.', sub: 'Épicerie Si Brahim <em>·</em> caisse du hanout' },
    mount,
    onShow,
  });
})();
