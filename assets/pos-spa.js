/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · SPA BAHIA — spa / bien-être POS (PIN 0003)
 * ---------------------------------------------------------------------------
 * Lazy-loaded by assets/pos-dispatch.js into <div class="vx-screen" id="pos-spa">.
 * One canon venue (assets/venues.js): Spa Bahia · Hivernage — 3 praticiennes
 * (Nour El Hassan, Salma Benkirane, Yasmine Bouchikhi, same trio as the
 * pro-dashboard spa pages).
 *
 * Five screens:
 *   · Planning du jour — praticiennes en colonnes, 10:00–20:00, créneau libre
 *     touché = réservation walk-in (cliente + prestation + praticienne).
 *   · Encaissement — ticket bâti depuis le menu des soins, pourboire réparti
 *     par praticienne (kit caisse .pay-tip / .cash-* / .reader-*).
 *   · FORFAITS & CURES (signature) — cartes à poinçonner à l'écran : « Cure
 *     10 hammams · 6/10 », un tap décompte une séance, les cercles se
 *     poinçonnent, la cure terminée propose son renouvellement.
 *   · Boutique — huile d'argan, savon noir, ghassoul, gant kessa (line-art).
 *   · Clientes — fiche phone-first : allergies, préférences, cures actives.
 *
 * Démo MID-SHIFT : journée simulée à 14:30 — 2 séances en cours, 1 séance
 * terminée pas encore encaissée (Kenza, au vestiaire), 2 cures actives dont
 * une à 4/5 (le prochain poinçon la termine → offre de renouvellement).
 * V1 = couche opérationnelle : la carte part au lecteur partenaire.
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
  const lens   = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fmtHM  = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
  const D = 24 * 3600 * 1000;
  const fmtRel = (days) =>
    days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : days < 30 ? `il y a ${days} j` : `il y a ${Math.round(days / 30)} mois`;
  const inDays = (days) => fmtDay(new Date(Date.now() + days * D));

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

  /* Deterministic pseudo-barcode (same recipe as the pressing tags). */
  function barcode(seed, h) {
    h = h || 22;
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

  /* ───────────────────────── line-art (64×64, forest strokes, mint fills) ──
     The spa sells rituals and flacons — each card carries its silhouette. */
  const art = (inner) => `<svg class="sp-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    /* hammam bucket + steam */
    hammam: art(`<path class="fill" d="M18 31h28l-3 23H21z"/><path d="M18 31h28l-3 23H21z"/><path d="M22 31c0-6 4.5-10 10-10s10 4 10 10"/><path class="thin" d="M21 39h22"/><path class="thin" d="M26 15c-2-3 2-5 0-8M32 17c-2-3 2-5 0-8M38 15c-2-3 2-5 0-8"/>`),
    /* savon noir block + bubbles (beldi) */
    beldi: art(`<rect class="fill" x="14" y="28" width="28" height="18" rx="4"/><rect x="14" y="28" width="28" height="18" rx="4"/><path class="thin" d="M20 37h16"/><circle class="thin" cx="47" cy="20" r="4"/><circle class="thin" cx="54" cy="28" r="2.5"/><circle class="thin" cx="49" cy="34" r="1.6"/><path d="M14 46l-2 6M42 46l2 6"/>`),
    /* ghassoul bowl + wave + drips */
    gomenv: art(`<path class="fill" d="M12 34h40c0 11-9 18-20 18S12 45 12 34z"/><path d="M12 34h40c0 11-9 18-20 18S12 45 12 34z"/><path class="thin" d="M19 34c4-3.5 9-3.5 13 0s9 3.5 13 0"/><path d="M40 30 51 13"/><path class="thin" d="M48 10l6 4"/><path class="thin" d="M28 24v4M35 21v6"/>`),
    /* moorish arch + sparkle (rituel) */
    rituel: art(`<path d="M11 54V32C11 18 20 9 32 9s21 9 21 23v22"/><path class="fill" d="M19 54V34c0-9 5.5-15 13-15s13 6 13 15v20z"/><path d="M19 54V34c0-9 5.5-15 13-15s13 6 13 15v20z"/><path d="M8 54h48"/><path class="thin" d="M32 25l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z"/>`),
    /* massage table + cliente + oil drop */
    argan60: art(`<circle cx="16" cy="26" r="4.5"/><path class="fill" d="M23 25c9-3.5 17-3 29 2v7H23z"/><path d="M23 25c9-3.5 17-3 29 2"/><path d="M9 34h46v5H9z"/><path d="M15 39v13M49 39v13"/><path class="thin" d="M15 47h34"/><path class="thin" d="M35 11c0 2.4-2.4 3.4-2.4 5.4a2.4 2.4 0 0 0 4.8 0c0-2-2.4-3-2.4-5.4z"/>`),
    /* hot stones + heat */
    profond90: art(`<ellipse class="fill" cx="32" cy="47" rx="17" ry="7"/><ellipse cx="32" cy="47" rx="17" ry="7"/><ellipse class="fill" cx="32" cy="36" rx="12.5" ry="6"/><ellipse cx="32" cy="36" rx="12.5" ry="6"/><ellipse class="fill" cx="32" cy="26.5" rx="8" ry="4.6"/><ellipse cx="32" cy="26.5" rx="8" ry="4.6"/><path class="thin" d="M24 16c-2-3 2-5 0-8M32 18c-2-3 2-5 0-8M40 16c-2-3 2-5 0-8"/>`),
    /* zen head + strokes above the crown */
    crane: art(`<circle class="fill" cx="32" cy="36" r="14"/><circle cx="32" cy="36" r="14"/><path d="M18 32c2-9 7.5-13 14-13s12 4 14 13"/><path class="thin" d="M25 37c1.6 1.7 4 1.7 5.6 0M33.4 37c1.6 1.7 4 1.7 5.6 0"/><path class="thin" d="M29 44c2 1.5 4 1.5 6 0"/><path class="thin" d="M14 18c3-2 4-5 3-8M32 13V5M50 18c-3-2-4-5-3-8"/>`),
    /* foot sole + reflex points */
    reflexo: art(`<path class="fill" d="M24 25c0-9 4-15 9-15s10 7 10 16c0 8-3 12-3 19a8 8 0 0 1-16 0c0-8 0-12 0-20z"/><path d="M24 25c0-9 4-15 9-15s10 7 10 16c0 8-3 12-3 19a8 8 0 0 1-16 0c0-8 0-12 0-20z"/><circle class="thin" cx="20" cy="14" r="2.6"/><circle class="thin" cx="15" cy="21" r="2"/><circle class="thin" cx="13" cy="29" r="1.6"/><circle class="thin" cx="32" cy="26" r="2.4"/><circle class="thin" cx="33" cy="38" r="2.4"/><path class="thin" d="M29 48h8"/>`),
    /* lotus + sparkle (soin éclat) */
    eclat: art(`<path class="fill" d="M32 12c5.5 6.5 5.5 15 0 21.5C26.5 27 26.5 18.5 32 12z"/><path d="M32 12c5.5 6.5 5.5 15 0 21.5C26.5 27 26.5 18.5 32 12z"/><path d="M19 21c7.5 1 12 6 13 12.5C24.5 32.5 20 27.5 19 21z"/><path d="M45 21c-7.5 1-12 6-13 12.5C39.5 32.5 44 27.5 45 21z"/><path d="M16 41c4.5 5.5 9.5 8 16 8s11.5-2.5 16-8"/><path class="thin" d="M50 10l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z"/>`),
    /* zen face + argan leaves (anti-âge) */
    antiage: art(`<circle class="fill" cx="32" cy="33" r="15"/><circle cx="32" cy="33" r="15"/><path d="M17 29c2-9 8-14 15-14s13 5 15 14"/><path class="thin" d="M24.5 34c1.7 1.8 4.3 1.8 6 0M33.5 34c1.7 1.8 4.3 1.8 6 0"/><path class="thin" d="M29 41.5c2 1.5 4 1.5 6 0"/><path class="thin" d="M9 44c3-4 7-5 10-3-1 4-5 6-10 3zM55 44c-3-4-7-5-10-3 1 4 5 6 10 3z"/>`),
    /* two silhouettes (duo) */
    duo: art(`<circle cx="23" cy="22" r="7"/><path d="M10 47c0-9 5.5-14 13-14s13 5 13 14"/><circle class="fill" cx="43" cy="25" r="6"/><circle cx="43" cy="25" r="6"/><path class="fill" d="M33 47c0-8 4.5-12 10-12s10 4 10 12z"/><path d="M33 47c0-8 4.5-12 10-12s10 4 10 12"/><path class="thin" d="M30 9l1.1 2.9 2.9 1.1-2.9 1.1L30 17l-1.1-2.9L26 13l2.9-1.1z"/>`),
    /* flacon huile d'argan + drop + sprig */
    argan_oil: art(`<rect x="28" y="7" width="8" height="6" rx="1.5"/><path d="M28 13h8v6h-8z"/><path class="fill" d="M26 19h12v4c4 3 7 7.5 7 13 0 8-6 14-13 14s-13-6-13-14c0-5.5 3-10 7-13z"/><path d="M26 19h12v4c4 3 7 7.5 7 13 0 8-6 14-13 14s-13-6-13-14c0-5.5 3-10 7-13z"/><path class="thin" d="M32 31c0 2.6-2.6 3.6-2.6 5.8a2.6 2.6 0 0 0 5.2 0c0-2.2-2.6-3.2-2.6-5.8z"/><path class="thin" d="M52 14c-3 0-5 2-5 5 3 0 5-2 5-5zM47 24c3 0 5-2 5-5"/>`),
    /* pot de savon noir */
    savon: art(`<rect class="fill" x="17" y="17" width="30" height="9" rx="3.5"/><rect x="17" y="17" width="30" height="9" rx="3.5"/><path class="fill" d="M19 26h26v18a8 8 0 0 1-8 8H27a8 8 0 0 1-8-8z"/><path d="M19 26h26v18a8 8 0 0 1-8 8H27a8 8 0 0 1-8-8z"/><path class="thin" d="M24 38c2.5-2.4 5.5-2.4 8 0s5.5 2.4 8 0"/><path class="thin" d="M24 43c2.5-2.4 5.5-2.4 8 0s5.5 2.4 8 0"/>`),
    /* pochon de ghassoul + éclats d'argile */
    ghassoul: art(`<path d="M22 21l-4-9h28l-4 9"/><path class="fill" d="M22 21c-3 12-4.5 19-2.5 25 1.5 4.5 6 7 12.5 7s11-2.5 12.5-7c2-6 .5-13-2.5-25z"/><path d="M22 21c-3 12-4.5 19-2.5 25 1.5 4.5 6 7 12.5 7s11-2.5 12.5-7c2-6 .5-13-2.5-25z"/><circle class="thin" cx="32" cy="38" r="6"/><path class="thin" d="M29.5 38l1.8 1.8 3.2-3.4"/><path class="thin" d="M52 47l3.5-4 2.5 3.5-3.5 3.5zM7 44l3-3.5 2.5 3-3 3.5z"/>`),
    /* gant kessa */
    kessa: art(`<path class="fill" d="M21 12h17a7 7 0 0 1 7 7v15c0 9-6.5 16-15 16h-2c-5 0-7-3.5-7-9z"/><path d="M21 12h17a7 7 0 0 1 7 7v15c0 9-6.5 16-15 16h-2c-5 0-7-3.5-7-9z"/><path d="M21 40h24"/><path class="thin" d="M25 18l13 13M30 15l13 13M22 25l11 11"/><circle class="thin" cx="52" cy="12" r="2.6"/><circle class="thin" cx="57" cy="20" r="1.8"/>`),
    /* eau de rose : vaporisateur + rose */
    rose: art(`<rect x="27" y="8" width="8" height="5" rx="1.5"/><path d="M35 10h7"/><path d="M29 13h4v6h-4z"/><path class="fill" d="M24 19h14v28a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path d="M24 19h14v28a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6z"/><path class="thin" d="M24 30h14"/><circle class="thin" cx="50" cy="26" r="3"/><path class="thin" d="M50 18a8 8 0 1 1-8 8"/><path class="thin" d="M50 33v8c-3 0-5-1.5-6-4"/>`),
    /* huile ambrée : fiole ronde + rayons */
    ambre: art(`<rect x="28" y="10" width="8" height="5" rx="1.5"/><path d="M29 15h6v6h-6z"/><circle class="fill" cx="32" cy="38" r="14"/><circle cx="32" cy="38" r="14"/><path d="M29 21h6l3 5h-12z"/><path class="thin" d="M32 33c0 2.4-2.4 3.4-2.4 5.4a2.4 2.4 0 0 0 4.8 0c0-2-2.4-3-2.4-5.4z"/><path class="thin" d="M10 24l4 3M54 24l-4 3M8 40h5M51 40h5"/>`),
    /* carte cure (mini, pour les forfaits) */
    cure: art(`<rect class="fill" x="8" y="16" width="48" height="32" rx="5"/><rect x="8" y="16" width="48" height="32" rx="5"/><circle cx="18" cy="27" r="3.4"/><circle cx="28" cy="27" r="3.4"/><circle class="thin" cx="38" cy="27" r="3.4"/><circle class="thin" cx="48" cy="27" r="3.4"/><path class="thin" d="M16.5 27l1.2 1.2 2-2.2M26.5 27l1.2 1.2 2-2.2"/><path class="thin" d="M14 39h22"/><path class="thin" d="M14 43h14"/>`),
  };

  /* ───────────────────────── praticiennes (canon pages-pro.js) ───────────── */
  const PRACTS = [
    { id: 'NH', name: 'Nour El Hassan',    short: 'Nour',    role: 'Sénior · 8 ans',        color: '#1F5D3C' },
    { id: 'SB', name: 'Salma Benkirane',   short: 'Salma',   role: 'Certifiée CIDESCO',     color: '#3FB67A' },
    { id: 'YB', name: 'Yasmine Bouchikhi', short: 'Yasmine', role: 'Spécialiste hammam',    color: '#D99A2B' },
  ];
  /* Real spa (paired/hosted) → neutralize the demo praticiennes: a real merchant
     names their own team, we never leak the Spa Bahia cast. Local demo unchanged. */
  if (pvReal()) PRACTS.forEach((p, i) => { p.name = 'Praticien ' + (i + 1); p.short = 'P' + (i + 1); p.role = ''; });
  const PR = Object.fromEntries(PRACTS.map((p) => [p.id, p]));

  /* ───────────────────────── prestations & produits ───────────────────────── */
  const CATS = [
    { id: 'hammam',   label: 'Hammam' },
    { id: 'massage',  label: 'Massages' },
    { id: 'soin',     label: 'Soins visage' },
    { id: 'duo',      label: 'Duo' },
    { id: 'boutique', label: 'Boutique' },
  ];
  /* oily = huiles / produits appliqués → alerte allergie sur la fiche */
  const PRESTAS = [
    { id: 'hammam',    cat: 'hammam',  name: 'Hammam simple',            dur: 45,  price: 150, oily: false },
    { id: 'beldi',     cat: 'hammam',  name: 'Hammam beldi + kessa',     dur: 60,  price: 250, oily: false },
    { id: 'gomenv',    cat: 'hammam',  name: 'Gommage + enveloppement',  dur: 90,  price: 380, oily: false },
    { id: 'rituel',    cat: 'hammam',  name: 'Rituel complet',           dur: 90,  price: 450, oily: true, flag: 'signature' },
    { id: 'argan60',   cat: 'massage', name: 'Massage argan 60 min',     dur: 60,  price: 550, oily: true },
    { id: 'profond90', cat: 'massage', name: 'Massage profond 90 min',   dur: 90,  price: 750, oily: true },
    { id: 'crane',     cat: 'massage', name: 'Massage crânien',          dur: 30,  price: 200, oily: true },
    { id: 'reflexo',   cat: 'massage', name: 'Réflexologie pieds',       dur: 30,  price: 280, oily: false },
    { id: 'eclat',     cat: 'soin',    name: 'Soin visage éclat',        dur: 45,  price: 390, oily: true },
    { id: 'antiage',   cat: 'soin',    name: 'Soin anti-âge argan',      dur: 75,  price: 650, oily: true },
    { id: 'duo',       cat: 'duo',     name: 'Hammam + massage duo',     dur: 120, price: 950, oily: true, flag: '2 pers.' },
  ];
  const PRESTA = Object.fromEntries(PRESTAS.map((p) => [p.id, p]));

  const PRODUCTS = [
    { id: 'argan_oil', name: "Huile d'argan 100 ml",       price: 180, stock: 14 },
    { id: 'savon',     name: 'Savon noir beldi 200 g',     price: 60,  stock: 22 },
    { id: 'ghassoul',  name: "Ghassoul de l'Atlas 250 g",  price: 45,  stock: 18 },
    { id: 'kessa',     name: 'Gant kessa',                 price: 35,  stock: 30 },
    { id: 'rose',      name: 'Eau de rose 100 ml',         price: 90,  stock: 9 },
    { id: 'ambre',     name: 'Huile de massage ambrée',    price: 220, stock: 3 },
  ];
  const PROD = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

  /* ───────────────────────── forfaits (cures à poinçonner) ───────────────── */
  const FORFAITS = [
    { id: 'fh', presta: 'hammam',  name: 'Cure hammam simple',  sizes: { 5: 650,  10: 1200 } },
    { id: 'fm', presta: 'argan60', name: 'Cure massage argan',  sizes: { 5: 2450, 10: 4400 } },
    { id: 'fr', presta: 'rituel',  name: 'Cure rituel complet', sizes: { 5: 2050, 10: 3600 } },
    { id: 'fe', presta: 'eclat',   name: 'Cure soin éclat',     sizes: { 5: 1750, 10: 3100 } },
  ];
  const FORFAIT = Object.fromEntries(FORFAITS.map((f) => [f.id, f]));
  const ffSaving = (f, size) => PRESTA[f.presta].price * size - f.sizes[size];

  /* ───────────────────────── clientes (fiche phone-first) ───────────────── */
  const CLIENTES = pvReal() ? [] : [
    { id: 'c1', name: 'Samira Chraïbi',    phone: '0661 32 18 47', visits: 18,
      allergies: ["Huile d'amande douce"], prefs: ['Pression forte', 'Praticienne : Nour'],
      lastDays: 5, lastWhat: 'Rituel complet · Nour',
      hist: [{ when: 'il y a 5 j', what: 'Rituel complet · Nour' }, { when: 'il y a 12 j', what: 'Hammam simple · Yasmine (cure)' }] },
    { id: 'c2', name: 'Lalla Rkia Alaoui', phone: '0668 90 12 34', visits: 31,
      allergies: [], prefs: ['Thé sans sucre', 'Cabine 2, vue patio'],
      lastDays: 12, lastWhat: 'Massage argan · Nour (cure)',
      hist: [{ when: 'il y a 12 j', what: 'Massage argan · Nour (cure)' }, { when: 'il y a 26 j', what: 'Massage argan · Salma (cure)' }] },
    { id: 'c3', name: 'Sofia El Idrissi',  phone: '0650 77 41 26', visits: 9,
      allergies: [], prefs: ['Musique douce', 'Serviette chaude'],
      lastDays: 2, lastWhat: 'Hammam beldi · Yasmine',
      hist: [{ when: 'il y a 2 j', what: 'Hammam beldi · Yasmine' }, { when: 'il y a 16 j', what: 'Soin visage éclat · Salma' }] },
    { id: 'c4', name: 'Imane Squalli',     phone: '0677 55 09 81', visits: 4,
      allergies: [], prefs: ['Huile légère'],
      lastDays: 20, lastWhat: 'Gommage + enveloppement · Salma',
      hist: [{ when: 'il y a 20 j', what: 'Gommage + enveloppement · Salma' }] },
    { id: 'c5', name: 'Kenza Mernissi',    phone: '0662 14 73 90', visits: 22, vip: true,
      allergies: ["Parfum d'ambre"], prefs: ['Pression forte', 'Gant kessa neuf à chaque visite'],
      lastDays: 8, lastWhat: 'Massage profond · Nour',
      hist: [{ when: 'il y a 8 j', what: 'Massage profond · Nour' }, { when: 'il y a 21 j', what: 'Rituel complet · Salma' }] },
    { id: 'c6', name: 'Houda Benjelloun',  phone: '0666 28 55 13', visits: 2,
      allergies: [], prefs: [],
      lastDays: 45, lastWhat: 'Hammam simple · Yasmine',
      hist: [{ when: 'il y a 45 j', what: 'Hammam simple · Yasmine' }] },
    { id: 'c7', name: 'Yasmine Touimi',    phone: '0653 41 87 22', visits: 13,
      allergies: [], prefs: ['Réflexologie après le hammam'],
      lastDays: 1, lastWhat: 'Soin visage éclat · Salma',
      hist: [{ when: 'hier', what: 'Soin visage éclat · Salma' }, { when: 'il y a 9 j', what: 'Hammam beldi + réflexo · Yasmine' }] },
  ];
  const CL = Object.fromEntries(CLIENTES.map((c) => [c.id, c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  /* ───────────────────────── cures en cours (seed) ───────────────────────── */
  let cureSeq = 2062;
  const CURES = pvReal() ? [] : [
    { id: 'CU-2041', clientId: 'c1', familyId: 'fh', size: 10, used: 6, boughtDays: -64, expiresDays: 120 },
    { id: 'CU-2057', clientId: 'c2', familyId: 'fm', size: 5,  used: 4, boughtDays: -88, expiresDays: 42 },
  ];
  const cureName = (cu) => `${FORFAIT[cu.familyId].name} × ${cu.size}`;
  const curesOf = (clientId) => CURES.filter((cu) => cu.clientId === clientId && cu.used < cu.size);
  const cureFor = (clientId, prestaId) =>
    CURES.find((cu) => cu.clientId === clientId && FORFAIT[cu.familyId].presta === prestaId && cu.used < cu.size);

  /* ───────────────────────── planning du jour (seed mid-shift) ─────────────
     Journée simulée : il est 14:30. 10:00 → 20:00, ~60 % de remplissage. */
  const OPEN = 600, CLOSE = 1200, NOW_MIN = 870;          /* minutes depuis minuit */
  const CELL = 30, CELL_PX = 34, PX_MIN = CELL_PX / CELL;
  const COL_H = (CLOSE - OPEN) * PX_MIN;

  let apptSeq = 1;
  function mkAppt(pr, start, prestaId, who, status, paid) {
    return {
      id: 'A' + (apptSeq++),
      pr, start, dur: PRESTA[prestaId].dur, presta: prestaId,
      clientId: typeof who === 'string' && CL[who] ? who : null,
      guest: typeof who === 'string' && !CL[who] ? who : null,
      status,                                  /* todo | now | done */
      paid: paid || null,                      /* { via: 'espèces'|'carte'|'cure' } */
    };
  }
  const APPTS = pvReal() ? [] : [
    /* Nour */
    mkAppt('NH', 600,  'rituel',    'c1', 'done', { via: 'espèces' }),
    mkAppt('NH', 705,  'argan60',   'c5', 'done', null),               /* Kenza — au vestiaire, à encaisser */
    mkAppt('NH', 840,  'profond90', 'c3', 'now'),
    mkAppt('NH', 960,  'antiage',   'c2', 'todo'),
    mkAppt('NH', 1080, 'argan60',   'Mme Laaroussi · passage', 'todo'),
    /* Salma */
    mkAppt('SB', 630,  'eclat',     'c7', 'done', { via: 'carte' }),
    mkAppt('SB', 690,  'gomenv',    'c4', 'done', { via: 'espèces' }),
    mkAppt('SB', 870,  'argan60',   'Mme Tahiri · passage', 'todo'),
    mkAppt('SB', 1020, 'rituel',    'Riad El Fenn · cliente hôtel', 'todo'),
    mkAppt('SB', 1110, 'reflexo',   'c6', 'todo'),
    /* Yasmine */
    mkAppt('YB', 600,  'hammam',    'Mme Berrada · passage', 'done', { via: 'espèces' }),
    mkAppt('YB', 660,  'beldi',     'Mme Senhaji · passage', 'done', { via: 'espèces' }),
    mkAppt('YB', 750,  'hammam',    'c3', 'done', { via: 'espèces' }),
    mkAppt('YB', 840,  'gomenv',    'Mme Alami · passage', 'now'),
    mkAppt('YB', 990,  'hammam',    'c6', 'todo'),
    mkAppt('YB', 1080, 'beldi',     'Mme Doukkali · passage', 'todo'),
  ];
  const findAppt = (id) => APPTS.find((a) => a.id === id);
  const apptWho  = (a) => (a.clientId ? CL[a.clientId].name : a.guest || 'Cliente de passage');
  const dueAppts = () => APPTS.filter((a) => a.status === 'done' && !a.paid);

  /* ───────────────────────── state ───────────────────────── */
  let ticketSeq = 2104;
  const state = {
    view: 'planning',
    cat: 'tous',
    ticket: null,            /* { num, lines: [{type,refId,prId?,qty,price}], clientId, guest, apptId } */
    clQuery: '',
    offline: false, queued: 0,
  };
  function freshTicket() {
    state.ticket = { num: posRef(`S-${ticketSeq}`), lines: [], clientId: null, guest: false, apptId: null };
  }
  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le spa encaissait dans un ticket jeté juste après la vente : la recette du
     jour n'existait nulle part et la patronne voyait 0 MAD. Démo : no-op. */
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
      if (window.KiwiPosSale) window.KiwiPosSale.record('spa', { total, method, label, ref });
    } catch (_) {}
  }
  /* Le numéro de ticket repart AU-DELÀ du dernier encaissé aujourd'hui : sans ça
     un rechargement le remet à S-2104 et deux séances portent le même numéro.
     Démo : journal vide, aucun effet. */
  try { if (window.KiwiPosSale) ticketSeq = window.KiwiPosSale.nextSeq('spa', ticketSeq); } catch (_) {}

  let root = null;

  // Real spa identity from the pairing / hosted session — a real spa shows its own
  // name+city, never the demo "Spa Bahia". Local demo (unpaired) unchanged.
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  /* ═══════════════════════ MOUNT (appelé par le dispatcher) ═══════════════ */
  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="sp-rail">
        <div class="sp-brand">kiwi<i></i></div>
        <div class="sp-venue">
          <div class="sp-venue-name">${pvName('Spa Bahia') || 'Spa'}</div>
          <div class="sp-venue-sub">${pvReal() ? (pvCity('') || '') : 'Marrakech · Hivernage'}<br>Le même Kiwi, un seul compte.</div>
        </div>
        <nav class="sp-nav" id="sp-nav">
          <button class="sp-nav-it on" data-sp-view="planning"><i data-lucide="calendar-clock"></i><span>Planning</span><b class="sp-nav-badge" id="sp-badge-plan"></b></button>
          <button class="sp-nav-it" data-sp-view="encaisser"><i data-lucide="banknote"></i><span>Encaisser</span><b class="sp-nav-badge" id="sp-badge-due"></b></button>
          <button class="sp-nav-it" data-sp-view="cures"><i data-lucide="tags"></i><span>Forfaits &amp; cures</span><b class="sp-nav-badge" id="sp-badge-cure"></b></button>
          <button class="sp-nav-it" data-sp-view="boutique"><i data-lucide="shopping-bag"></i><span>Boutique</span><b class="sp-nav-badge" id="sp-badge-shop"></b></button>
          <button class="sp-nav-it" data-sp-view="clientes"><i data-lucide="users"></i><span>Clientes</span></button>
        </nav>
        <div class="sp-rail-foot">
          <button class="sp-net" id="sp-net" title="Simuler une coupure réseau">
            <i class="sp-net-dot"></i><span class="sp-net-label">En ligne</span>
          </button>
          <button class="sp-lock" id="sp-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="sp-main">
        <div class="sp-offline-note" id="sp-offline-note" hidden>
          Hors-ligne, encaissements, réservations et décomptes sont enregistrés sur la tablette et synchronisés au retour du réseau.
          <b id="sp-queue-count"></b>
        </div>
        <section class="sp-view is-on" data-sp-panel="planning"></section>
        <section class="sp-view" data-sp-panel="encaisser">
          <div class="sp-sell">
            <header class="sp-head">
              <div><h1>Encaissement séance</h1><div class="sp-head-sub" id="sp-today"></div></div>
              <div class="sp-head-hint">Touchez un soin, la praticienne est attachée à chaque ligne</div>
            </header>
            <div class="sp-cats" id="sp-cats"></div>
            <div class="sp-grid-scroll" id="sp-gridwrap"></div>
          </div>
          <aside class="sp-ticket" id="sp-ticket"></aside>
        </section>
        <section class="sp-view" data-sp-panel="cures"></section>
        <section class="sp-view" data-sp-panel="boutique"></section>
        <section class="sp-view" data-sp-panel="clientes"></section>
      </main>
      <div class="modal-veil" id="sp-book-veil"><div class="modal sp-book sp-rel" id="sp-bookm"></div></div>
      <div class="modal-veil" id="sp-appt-veil"><div class="modal sp-appt sp-rel" id="sp-apptm"></div></div>
      <div class="modal-veil" id="sp-svc-veil"><div class="modal sp-svc sp-rel" id="sp-svcm"></div></div>
      <div class="modal-veil" id="sp-fiche-veil"><div class="modal sp-fiche sp-rel" id="sp-fichem"></div></div>
      <div class="modal-veil" id="sp-client-veil"><div class="modal sp-client sp-rel" id="sp-clientm"></div></div>
      <div class="modal-veil" id="sp-punch-veil"><div class="modal sp-punchm sp-rel" id="sp-punchm"></div></div>
      <div class="modal-veil" id="sp-pay-veil"><div class="modal sp-pay sp-rel" id="sp-paym"></div></div>`;

    $('#sp-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-sp-view]');
      if (b) switchView(b.dataset.spView);
    });
    $('#sp-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#sp-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    freshTicket();
    renderAll();
  }

  function onShow() {
    if (!root) return;
    const today = $('#sp-today', root);
    if (today) today.textContent = headDate();
    renderBadges();
    renderNet();
    renderView(state.view);
    icons();
  }

  const openVeil  = (id) => { const v = $(id, root); v.classList.add('is-open'); return v; };
  const closeVeil = (v) => { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); };

  function headDate() {
    return `${fmtDay(new Date())} · journée simulée à ${fmtHM(NOW_MIN)}`;
  }

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.sp-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.spView === view));
    $$('.sp-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.spPanel === view));
    renderView(view);
    icons();
  }
  function renderView(view) {
    if (view === 'planning') renderPlanning();
    if (view === 'encaisser') { renderCats(); renderGrid(); renderTicket(); }
    if (view === 'cures') renderCures();
    if (view === 'boutique') renderBoutique();
    if (view === 'clientes') renderClientes();
  }
  function renderBadges() {
    const remaining = APPTS.filter((a) => a.status !== 'done').length;
    const due = dueAppts().length;
    const actives = CURES.filter((cu) => cu.used < cu.size).length;
    const lowStock = PRODUCTS.filter((p) => p.stock <= 3).length;
    const set = (id, val, dueStyle) => {
      const el = $(id, root);
      el.textContent = val || '';
      el.style.display = val ? '' : 'none';
      el.classList.toggle('is-due', !!dueStyle && !!val);
    };
    set('#sp-badge-plan', remaining);
    set('#sp-badge-due', due, true);
    set('#sp-badge-cure', actives);
    set('#sp-badge-shop', lowStock);
  }
  function renderAll() {
    const today = $('#sp-today', root);
    if (today) today.textContent = headDate();
    renderBadges();
    renderNet();
    renderView(state.view);
    icons();
  }
  /* re-render whatever sits behind an open modal + the rail badges */
  function refreshOps() {
    renderBadges();
    renderView(state.view);
    icons();
  }

  /* ═══════════════════════ PLANNING DU JOUR ═══════════════════════ */
  function apptsOf(prId) { return APPTS.filter((a) => a.pr === prId).sort((a, b) => a.start - b.start); }
  function overlaps(prId, start, dur, ignoreId) {
    return APPTS.find((a) =>
      a.pr === prId && a.id !== ignoreId && start < a.start + a.dur && start + dur > a.start);
  }
  function freeCells(prId) {
    const cells = [];
    for (let t = OPEN; t < CLOSE; t += CELL) {
      if (!overlaps(prId, t, CELL)) cells.push(t);
    }
    return cells;
  }
  function nextFree(prId) {
    const c = freeCells(prId).find((t) => t >= NOW_MIN);
    return c != null ? c : freeCells(prId)[0];
  }

  function apptBlock(a) {
    const p = PRESTA[a.presta];
    const top = (a.start - OPEN) * PX_MIN + 1;
    const h = a.dur * PX_MIN - 3;
    const due = a.status === 'done' && !a.paid;
    const viaCure = a.paid && a.paid.via === 'cure';
    const flag = due
      ? '<span class="sp-appt-flag due">à encaisser</span>'
      : a.status === 'now'
        ? '<span class="sp-appt-flag now">en cours</span>'
        : viaCure ? '<span class="sp-appt-flag cure">cure</span>' : '';
    /* compact blocks drop rows by priority: flag > service > heure */
    const showFlag = !!flag && h >= 56;
    const showSvc = h >= (showFlag ? 80 : 50);
    const showTime = h >= 38;
    return `<button class="sp-appt ${a.status === 'done' ? 'is-done' : ''} ${a.status === 'now' ? 'is-now' : ''}"
        data-sp-appt="${a.id}" style="top:${top}px; height:${h}px; --pcol:${PR[a.pr].color};">
      ${showTime ? `<span class="sp-appt-time">${fmtHM(a.start)}–${fmtHM(a.start + a.dur)}${a.status === 'now' ? '<i class="sp-dot-now"></i>' : ''}</span>` : ''}
      <span class="sp-appt-name">${esc(apptWho(a))}</span>
      ${showSvc ? `<span class="sp-appt-svc">${esc(p.name)}</span>` : ''}
      ${showFlag ? flag : ''}
    </button>`;
  }

  function renderPlanning() {
    const panel = $('[data-sp-panel="planning"]', root);
    const booked = APPTS.reduce((s, a) => s + a.dur, 0);
    const fill = Math.round((booked / ((CLOSE - OPEN) * PRACTS.length)) * 100);
    const remaining = APPTS.filter((a) => a.status !== 'done').length;
    const nowTop = (NOW_MIN - OPEN) * PX_MIN;

    panel.innerHTML = `
      <div class="sp-plan">
        <header class="sp-head">
          <div><h1>Planning du jour</h1><div class="sp-head-sub">${headDate()} · ${fill} % de remplissage · ${remaining} séances à venir</div></div>
          <div class="sp-head-hint">Touchez un créneau libre pour une réservation walk-in</div>
        </header>
        <div class="sp-legend">
          <span class="sp-leg"><i class="done"></i>terminée</span>
          <span class="sp-leg"><i class="now"></i>en cours</span>
          <span class="sp-leg"><i class="todo"></i>à venir</span>
          <span class="sp-leg"><i class="due"></i>à encaisser</span>
        </div>
        <div class="sp-plan-scroll">
          <div class="sp-plan-grid">
            <div></div>
            ${PRACTS.map((p) => {
              const list = apptsOf(p.id);
              const rest = list.filter((a) => a.status !== 'done').length;
              return `<div class="sp-pr-head">
                <span class="sp-pr-ava" style="background:${p.color}">${initials(p.name)}</span>
                <span class="sp-pr-mid"><span class="sp-pr-name">${esc(p.name)}</span><span class="sp-pr-role">${esc(p.role)}</span></span>
                <span class="sp-pr-ct"><b>${rest}</b>à venir</span>
              </div>`;
            }).join('')}
            <div class="sp-timecol" style="height:${COL_H}px">
              ${Array.from({ length: (CLOSE - OPEN) / 60 + 1 }, (_, i) =>
                `<div class="sp-time-h" style="top:${i * 60 * PX_MIN}px">${fmtHM(OPEN + i * 60)}</div>`).join('')}
            </div>
            ${PRACTS.map((p) => `
              <div class="sp-col" style="height:${COL_H}px" data-sp-col="${p.id}">
                ${Array.from({ length: (CLOSE - OPEN) / CELL }, (_, i) => i === 0 ? '' :
                  `<div class="sp-hline ${i % 2 ? 'half' : ''}" style="top:${i * CELL_PX}px"></div>`).join('')}
                ${freeCells(p.id).map((t) =>
                  `<button class="sp-freeslot" data-sp-free="${p.id}:${t}" style="top:${(t - OPEN) * PX_MIN + 2}px; height:${CELL_PX - 4}px"
                     aria-label="Réserver ${fmtHM(t)} avec ${esc(p.short)}"><i data-lucide="plus"></i></button>`).join('')}
                ${apptsOf(p.id).map(apptBlock).join('')}
                <div class="sp-nowline" style="top:${nowTop}px"></div>
                <div class="sp-nowline-lbl" style="top:${nowTop}px">${fmtHM(NOW_MIN)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;

    panel.onclick = (e) => {
      const ap = e.target.closest('[data-sp-appt]');
      if (ap) { openAppt(ap.dataset.spAppt); return; }
      const fr = e.target.closest('[data-sp-free]');
      if (fr) {
        const [prId, t] = fr.dataset.spFree.split(':');
        openBook({ prId, start: +t });
      }
    };
    icons();
  }

  /* ---------- détail d'un rendez-vous ---------- */
  function openAppt(id) {
    const a = findAppt(id);
    if (!a) return;
    const p = PRESTA[a.presta];
    const pr = PR[a.pr];
    const cl = a.clientId ? CL[a.clientId] : null;
    const cure = a.clientId ? cureFor(a.clientId, a.presta) : null;
    const due = a.status === 'done' && !a.paid;
    const el = $('#sp-apptm', root);

    const statusChip = a.status === 'done'
      ? (a.paid ? `<span class="sp-pill ok">Réglée · ${esc(a.paid.via)}</span>` : '<span class="sp-pill due">Terminée · à encaisser</span>')
      : a.status === 'now' ? '<span class="sp-pill mint">En cours</span>' : '<span class="sp-pill">À venir</span>';

    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${fmtHM(a.start)} · ${esc(p.name)}</h3>
      <p class="modal-subtle">${esc(apptWho(a))}${cl ? ` · ${esc(cl.phone)}` : ''} ${statusChip}</p>
      ${cl && cl.allergies.length ? `
        <div class="sp-callout danger"><i data-lucide="shield-check"></i>
          <span>Allergie au dossier : <b>${esc(cl.allergies.join(' · '))}</b>${p.oily ? ', adapter les huiles de ce soin.' : '.'}</span>
        </div>` : ''}
      <div class="sp-ap-rows">
        <div class="sp-ap-row"><i data-lucide="sparkles"></i><b>${esc(p.name)}</b><span class="r">${p.dur} min · ${fmtMAD(p.price)}</span></div>
        <div class="sp-ap-row"><i data-lucide="user"></i>Praticienne <b>${esc(pr.name)}</b><span class="r">${fmtHM(a.start)}–${fmtHM(a.start + a.dur)}</span></div>
        ${cl ? `<div class="sp-ap-row"><i data-lucide="history"></i>${cl.visits} visites · dernière ${esc(fmtRel(cl.lastDays))}</div>` : ''}
        ${cure ? `<div class="sp-ap-row"><i data-lucide="tags"></i>Cure active <b>${esc(cureName(cure))}</b><span class="r">${cure.used}/${cure.size}</span></div>` : ''}
      </div>
      <div class="sp-sheet-foot" style="flex-wrap:wrap;">
        ${a.status === 'todo' ? `
          <button class="sp-btn danger" id="sp-ap-cancel">Annuler le RDV</button>
          <button class="sp-btn primary" id="sp-ap-start"><i data-lucide="check"></i>Commencer la séance</button>` : ''}
        ${a.status === 'now' ? `
          <button class="sp-btn ghost" data-sp-close>Fermer</button>
          <button class="sp-btn primary" id="sp-ap-finish"><i data-lucide="check-check"></i>Terminer la séance</button>` : ''}
        ${due ? `
          ${cure ? `<button class="sp-btn secondary" id="sp-ap-cure"><i data-lucide="tags"></i>Décompter de la cure (reste ${cure.size - cure.used})</button>` : ''}
          <button class="sp-btn primary" id="sp-ap-pay"><i data-lucide="banknote"></i>Encaisser · ${fmtMAD(p.price)}</button>` : ''}
        ${a.status === 'done' && a.paid ? `
          ${cl ? '<button class="sp-btn secondary" id="sp-ap-fiche">Fiche cliente</button>' : ''}
          <button class="sp-btn primary" data-sp-close><i data-lucide="check"></i>Fermer</button>` : ''}
      </div>`;
    openVeil('#sp-appt-veil');
    icons();

    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-appt-veil'); });
    const start = $('#sp-ap-start', el);
    if (start) start.onclick = () => {
      a.status = 'now';
      closeVeil('#sp-appt-veil');
      queueIfOffline('Début de séance');
      toast(`Séance lancée, ${apptWho(a)} avec ${pr.short}, cabine prête`);
      refreshOps();
    };
    const finish = $('#sp-ap-finish', el);
    if (finish) finish.onclick = () => {
      a.status = 'done';
      queueIfOffline('Fin de séance');
      toast(`Séance terminée, reste l'encaissement (${fmtMAD(p.price)})`);
      refreshOps();
      openAppt(a.id);
    };
    const cancel = $('#sp-ap-cancel', el);
    if (cancel) cancel.onclick = () => {
      APPTS.splice(APPTS.indexOf(a), 1);
      closeVeil('#sp-appt-veil');
      queueIfOffline('Annulation RDV');
      toast(`RDV de ${fmtHM(a.start)} annulé, créneau libéré chez ${pr.short}`);
      refreshOps();
    };
    const payB = $('#sp-ap-pay', el);
    if (payB) payB.onclick = () => {
      closeVeil('#sp-appt-veil');
      loadApptOnTicket(a);
    };
    const cureB = $('#sp-ap-cure', el);
    if (cureB) cureB.onclick = () => {
      closeVeil('#sp-appt-veil');
      openPunch(cure.id, { apptId: a.id });
    };
    const ficheB = $('#sp-ap-fiche', el);
    if (ficheB) ficheB.onclick = () => { closeVeil('#sp-appt-veil'); openFiche(cl.id); };
  }

  function loadApptOnTicket(a) {
    const p = PRESTA[a.presta];
    freshTicket();
    state.ticket.lines.push({ type: 'svc', refId: a.presta, prId: a.pr, qty: 1, price: p.price });
    state.ticket.clientId = a.clientId;
    state.ticket.guest = !a.clientId;
    state.ticket.apptId = a.id;
    switchView('encaisser');
    toast(`Séance de ${apptWho(a)} chargée sur le ticket, ajoutez la boutique si besoin`);
  }

  /* ---------- réservation walk-in (créneau libre touché) ---------- */
  const book = { prId: 'NH', start: 600, prestaId: null, clientId: null, guest: true };

  function openBook(cfg) {
    book.prId = cfg.prId || 'NH';
    book.start = cfg.start != null ? cfg.start : (nextFree(book.prId) || OPEN);
    book.prestaId = cfg.prestaId || null;
    book.clientId = cfg.clientId || null;
    book.guest = !cfg.clientId;
    renderBook();
    openVeil('#sp-book-veil');
    icons(); lens();
  }

  function renderBook() {
    const el = $('#sp-bookm', root);
    const p = book.prestaId ? PRESTA[book.prestaId] : null;
    const cl = book.clientId ? CL[book.clientId] : null;
    const end = p ? book.start + p.dur : book.start + CELL;
    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Walk-in · réservation</h3>
      <p class="modal-subtle">Cliente + prestation + praticienne, le créneau part sur le planning.</p>

      <div class="sp-f">
        <div class="sp-f-lbl">Praticienne</div>
        <div class="sp-seg" data-lens-demo id="sp-bk-pr">
          ${PRACTS.map((pr) => `<button class="sp-seg-it ${pr.id === book.prId ? 'on' : ''}" data-lens-item data-sp-bkpr="${pr.id}">${esc(pr.short)}<small>${esc(pr.role)}</small></button>`).join('')}
        </div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Heure <span class="opt">· ouverture 10:00, 20:00</span></div>
        <div class="sp-time-row">
          <button id="sp-bk-m30">−30</button>
          <div class="sp-time-val">${fmtHM(book.start)}${p ? ` <small>→ ${fmtHM(end)}</small>` : ''}</div>
          <button id="sp-bk-p30">+30</button>
        </div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Prestation</div>
        <div class="sp-presta-pick" id="sp-bk-prestas">
          ${PRESTAS.map((x) => `
            <button class="sp-presta-it ${x.id === book.prestaId ? 'on' : ''}" data-sp-bkp="${x.id}">
              <span class="a">${ART[x.id] || ''}</span>
              <span class="l"><b>${esc(x.name)}</b><span>${x.dur} min · ${fmtMAD(x.price)}</span></span>
            </button>`).join('')}
        </div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Cliente <span class="opt">· optionnel, passage par défaut</span></div>
        <button class="sp-tk-row ${cl ? 'is-set' : ''}" id="sp-bk-client">
          <i data-lucide="${cl ? 'user-check' : 'user-plus'}"></i>
          <span class="l"><b>${cl ? esc(cl.name) : 'Cliente de passage'}</b>
          <span>${cl ? `${esc(cl.phone)} · ${cl.visits} visites` : 'Recherche par téléphone, la fiche garde allergies et cures'}</span></span>
          ${cl && cl.allergies.length ? '<span class="alg">ALLERGIE</span>' : ''}
          <span class="edit">${cl ? 'Changer' : 'Chercher'}</span>
        </button>
      </div>
      ${cl && cl.allergies.length && p && p.oily ? `
        <div class="sp-callout danger"><i data-lucide="shield-check"></i>
          <span><b>${esc(cl.allergies.join(' · '))}</b>, prévenez ${esc(PR[book.prId].short)} avant d'huiler.</span>
        </div>` : ''}

      <div class="sp-sheet-foot">
        <button class="sp-btn secondary" data-sp-close>Annuler</button>
        <button class="sp-btn primary" id="sp-bk-ok" ${p ? '' : 'disabled'}>
          <i data-lucide="check"></i>${p ? `Réserver ${fmtHM(book.start)} · ${fmtMAD(p.price)}` : 'Choisissez une prestation'}
        </button>
      </div>`;
    icons(); lens();

    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-book-veil'); });
    $('#sp-bk-pr', el).onclick = (e) => {
      const b = e.target.closest('[data-sp-bkpr]');
      if (!b) return;
      book.prId = b.dataset.spBkpr;
      $$('[data-sp-bkpr]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    const dur = () => (book.prestaId ? PRESTA[book.prestaId].dur : CELL);
    $('#sp-bk-m30', el).onclick = () => {
      if (book.start - CELL < OPEN) { toast('Le spa ouvre à 10:00'); return; }
      book.start -= CELL; renderBook();
    };
    $('#sp-bk-p30', el).onclick = () => {
      if (book.start + CELL + dur() > CLOSE) { toast('Le spa ferme à 20:00, dernière séance selon la durée'); return; }
      book.start += CELL; renderBook();
    };
    $('#sp-bk-prestas', el).onclick = (e) => {
      const b = e.target.closest('[data-sp-bkp]');
      if (!b) return;
      book.prestaId = b.dataset.spBkp;
      renderBook();
    };
    $('#sp-bk-client', el).onclick = () => {
      openPickClient({
        title: 'Cliente du walk-in',
        allowGuest: true,
        onPick: (pick) => {
          book.clientId = pick.clientId || null;
          book.guest = !pick.clientId;
          renderBook();
        },
      });
    };
    const ok = $('#sp-bk-ok', el);
    if (ok) ok.onclick = () => {
      if (!book.prestaId) return;
      const pp = PRESTA[book.prestaId];
      if (book.start + pp.dur > CLOSE) {
        toast(`${pp.name} (${pp.dur} min) dépasse la fermeture, avancez l'heure`);
        return;
      }
      const clash = overlaps(book.prId, book.start, pp.dur);
      if (clash) {
        toast(`${PR[book.prId].short} est prise ${fmtHM(clash.start)}–${fmtHM(clash.start + clash.dur)}, autre créneau ou autre praticienne`);
        return;
      }
      const who = book.clientId || 'Cliente de passage';
      APPTS.push(mkAppt(book.prId, book.start, book.prestaId, who, 'todo'));
      closeVeil('#sp-book-veil');
      queueIfOffline('Réservation');
      toast(`Réservé, ${fmtHM(book.start)} · ${pp.name} · ${PR[book.prId].short}`);
      if (state.view !== 'planning') switchView('planning');
      refreshOps();
    };
  }

  /* ═══════════════════════ ENCAISSEMENT — menu + ticket ═══════════════════ */
  function renderCats() {
    const counts = Object.fromEntries(CATS.map((c) => [c.id,
      c.id === 'boutique' ? PRODUCTS.length : PRESTAS.filter((p) => p.cat === c.id).length]));
    const all = PRESTAS.length + PRODUCTS.length;
    $('#sp-cats', root).innerHTML =
      `<button class="sp-cat ${state.cat === 'tous' ? 'on' : ''}" data-sp-cat="tous">Tout <span class="sp-cat-ct">${all}</span></button>` +
      CATS.map((c) =>
        `<button class="sp-cat ${state.cat === c.id ? 'on' : ''}" data-sp-cat="${c.id}">${esc(c.label)} <span class="sp-cat-ct">${counts[c.id]}</span></button>`).join('');
    $('#sp-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-sp-cat]');
      if (!b) return;
      state.cat = b.dataset.spCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function renderGrid() {
    const cats = state.cat === 'tous' ? CATS : CATS.filter((c) => c.id === state.cat);
    let i = 0;
    $('#sp-gridwrap', root).innerHTML = cats.map((c) => {
      const items = c.id === 'boutique'
        ? PRODUCTS.map((p) => `
            <button class="sp-card" data-sp-prod="${p.id}" style="--i:${i++}">
              <span class="sp-card-stock ${p.stock <= 0 ? 'out' : p.stock <= 3 ? 'low' : ''}">${p.stock <= 0 ? 'épuisé' : `× ${p.stock}`}</span>
              <span class="sp-card-art">${ART[p.id] || ''}</span>
              <span class="sp-card-name">${esc(p.name)}</span>
              <span class="sp-card-price">${fmtMAD(p.price)}</span>
            </button>`)
        : PRESTAS.filter((p) => p.cat === c.id).map((p) => `
            <button class="sp-card" data-sp-svc="${p.id}" style="--i:${i++}">
              <span class="sp-card-art">${ART[p.id] || ''}</span>
              <span class="sp-card-name">${esc(p.name)}</span>
              <span class="sp-card-price">${p.dur} min · ${fmtMAD(p.price)}</span>
              ${p.flag ? `<span class="sp-card-flag">${esc(p.flag)}</span>` : ''}
            </button>`);
      return `<div class="sp-cat-head">${esc(c.label)}</div><div class="sp-grid">${items.join('')}</div>`;
    }).join('');
    $('#sp-gridwrap', root).onclick = (e) => {
      const svc = e.target.closest('[data-sp-svc]');
      if (svc) { openSvcSheet(svc.dataset.spSvc); return; }
      const prod = e.target.closest('[data-sp-prod]');
      if (prod) addProduct(prod.dataset.spProd);
    };
  }

  function addProduct(prodId) {
    const p = PROD[prodId];
    const line = state.ticket.lines.find((l) => l.type === 'prod' && l.refId === prodId);
    const inTicket = line ? line.qty : 0;
    if (inTicket + 1 > p.stock) {
      toast(p.stock ? `Stock insuffisant, il reste ${p.stock} « ${p.name} »` : `« ${p.name} » est épuisé, réassort à commander`);
      return;
    }
    if (line) line.qty++;
    else state.ticket.lines.push({ type: 'prod', refId: prodId, qty: 1, price: p.price });
    toast(`${p.name}, sur le ticket`);
    renderTicket(); icons();
  }

  /* ---------- fiche prestation → praticienne (la lentille voyage) ---------- */
  const svcSheet = { prestaId: null, prId: 'NH' };
  function openSvcSheet(prestaId) {
    svcSheet.prestaId = prestaId;
    /* par défaut : la praticienne la moins chargée en séances restantes */
    svcSheet.prId = PRACTS.slice().sort((a, b) =>
      apptsOf(a.id).filter((x) => x.status !== 'done').length -
      apptsOf(b.id).filter((x) => x.status !== 'done').length)[0].id;
    const p = PRESTA[prestaId];
    const cl = state.ticket.clientId ? CL[state.ticket.clientId] : null;
    const el = $('#sp-svcm', root);
    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div style="display:flex; align-items:center; gap:13px; margin-bottom:12px;">
        <span class="sp-ff-art" style="width:56px;height:56px;">${ART[prestaId] || ''}</span>
        <div style="flex:1;">
          <h3 class="modal-title" style="margin:0;">${esc(p.name)}</h3>
          <p class="modal-subtle" style="margin:2px 0 0;">${p.dur} min · ${fmtMAD(p.price)}</p>
        </div>
      </div>
      ${cl && cl.allergies.length && p.oily ? `
        <div class="sp-callout danger"><i data-lucide="shield-check"></i>
          <span><b>${esc(cl.name)}</b>, allergie ${esc(cl.allergies.join(' · '))}. Huile d'argan pure uniquement.</span>
        </div>` : ''}
      <div class="sp-f">
        <div class="sp-f-lbl">Praticienne <span class="opt">· le pourboire se répartira sur elle</span></div>
        <div class="sp-seg" data-lens-demo id="sp-svc-pr">
          ${PRACTS.map((pr) => `<button class="sp-seg-it ${pr.id === svcSheet.prId ? 'on' : ''}" data-lens-item data-sp-svcpr="${pr.id}">${esc(pr.short)}<small>${apptsOf(pr.id).filter((x) => x.status !== 'done').length} à venir</small></button>`).join('')}
        </div>
      </div>
      <div class="sp-sheet-foot">
        <button class="sp-btn secondary" data-sp-close>Annuler</button>
        <button class="sp-btn primary" id="sp-svc-add"><i data-lucide="plus"></i>Ajouter · ${fmtMAD(p.price)}</button>
      </div>`;
    openVeil('#sp-svc-veil');
    icons(); lens();
    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-svc-veil'); });
    $('#sp-svc-pr', el).onclick = (e) => {
      const b = e.target.closest('[data-sp-svcpr]');
      if (!b) return;
      svcSheet.prId = b.dataset.spSvcpr;
      $$('[data-sp-svcpr]', el).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#sp-svc-add', el).onclick = () => {
      state.ticket.lines.push({ type: 'svc', refId: prestaId, prId: svcSheet.prId, qty: 1, price: p.price });
      closeVeil('#sp-svc-veil');
      toast(`${p.name} · ${PR[svcSheet.prId].short}, sur le ticket`);
      renderTicket(); icons();
    };
  }

  /* ---------- ticket ---------- */
  const ticketTotal = (t) => t.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tkLabel = (t) => {
    const l = t.lines[0];
    if (!l) return 'Vente';
    const ref = l.type === 'svc' ? PRESTA[l.refId] : PROD[l.refId];
    const nm = ref ? ref.name : 'Vente';
    return t.lines.length > 1 ? `${nm} +${t.lines.length - 1} art.` : nm;
  };

  function lineRow(l, i) {
    const isSvc = l.type === 'svc';
    const ref = isSvc ? PRESTA[l.refId] : PROD[l.refId];
    const pr = isSvc ? PR[l.prId] : null;
    return `<div class="sp-line">
      <span class="sp-line-art">${ART[l.refId] || ''}</span>
      <span class="sp-line-mid">
        <span class="sp-line-name">${esc(ref.name)}</span>
        <span class="sp-line-sub">
          ${pr ? `<span class="pr"><i style="background:${pr.color}"></i>${esc(pr.short)}</span> · ${ref.dur} min` : 'boutique'}
        </span>
      </span>
      <span class="sp-line-right">
        <span class="sp-line-price">${fmtMAD(l.price * l.qty)}</span>
        <span class="sp-line-qty">
          <button data-sp-minus="${i}" aria-label="Retirer">−</button><b>${l.qty}</b><button data-sp-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  function clienteRow(t) {
    if (!t.clientId) {
      return `<button class="sp-tk-row" id="sp-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une cliente</b><span>Par téléphone, allergies et cures suivent la fiche</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    const c = CL[t.clientId];
    return `<button class="sp-tk-row is-set" id="sp-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${esc(c.phone)} · ${c.visits} visites${c.prefs.length ? ` · ${esc(c.prefs[0])}` : ''}</span></span>
      ${c.allergies.length ? '<span class="alg">ALLERGIE</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  function renderTicket() {
    const t = state.ticket;
    const total = ticketTotal(t);
    const due = dueAppts();
    const el = $('#sp-ticket', root);
    el.innerHTML = `
      <div class="sp-tk-head">
        <div><span class="sp-tk-title">Ticket</span> <span class="sp-tk-num">· ${t.num}</span></div>
        ${t.lines.length ? '<button class="sp-tk-reset" id="sp-tk-reset">Vider</button>' : ''}
      </div>
      ${due.length && !t.apptId ? `
        <div class="sp-due-strip">
          <div class="sp-due-lbl">Séances terminées, à encaisser</div>
          ${due.map((a) => `
            <button class="sp-due-it" data-sp-due="${a.id}">
              <i data-lucide="hand-coins"></i>
              <span class="l">${esc(apptWho(a))} · ${esc(PRESTA[a.presta].name)}</span>
              <span class="amt">${fmtMAD(PRESTA[a.presta].price)}</span>
            </button>`).join('')}
        </div>` : ''}
      <div class="sp-tk-meta">
        ${clienteRow(t)}
        ${t.apptId ? `<div class="sp-tk-row is-set" style="cursor:default;"><i data-lucide="calendar-clock"></i>
          <span class="l"><b>Séance du planning</b><span>${fmtHM(findAppt(t.apptId) ? findAppt(t.apptId).start : 0)}, l'encaissement soldera le RDV</span></span></div>` : ''}
      </div>
      <div class="sp-tk-lines" id="sp-tk-lines">
        ${t.lines.length ? t.lines.map((l, i) => lineRow(l, i)).join('') : `
          <div class="sp-tk-empty">
            <i data-lucide="sparkles"></i>
            <div>Le ticket est vide.<br>Touchez un soin de la grille, ou chargez une séance terminée depuis le planning.</div>
          </div>`}
      </div>
      <div class="sp-tk-foot">
        <div class="sp-tk-tot"><span>${t.lines.reduce((s, l) => s + l.qty, 0)} ligne${t.lines.length > 1 ? 's' : ''}</span>
          <span>${t.clientId ? esc(CL[t.clientId].name) : 'Cliente de passage'}</span></div>
        <div class="sp-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="sp-validate" id="sp-validate" ${t.lines.length ? '' : 'disabled'}>
          <i data-lucide="banknote"></i> Encaisser · ${fmtMAD(total)}
        </button>
      </div>`;

    const reset = $('#sp-tk-reset', el);
    if (reset) reset.onclick = () => { freshTicket(); renderTicket(); icons(); };
    $('#sp-tk-client', el).onclick = () => {
      openPickClient({
        title: 'Cliente du ticket',
        allowGuest: true,
        onPick: (pick) => {
          state.ticket.clientId = pick.clientId || null;
          state.ticket.guest = !pick.clientId;
          renderTicket(); icons();
          const c = pick.clientId ? CL[pick.clientId] : null;
          if (c && c.allergies.length) toast(`${c.name}, allergie au dossier : ${c.allergies.join(' · ')}`);
        },
      });
    };
    $$('[data-sp-due]', el).forEach((b) => {
      b.onclick = () => {
        const a = findAppt(b.dataset.spDue);
        if (a) loadApptOnTicket(a);
      };
    });
    $('#sp-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-sp-minus]');
      const plus = e.target.closest('[data-sp-plus]');
      const idx = minus ? +minus.dataset.spMinus : plus ? +plus.dataset.spPlus : -1;
      if (idx < 0) return;
      const l = t.lines[idx];
      if (plus) {
        if (l.type === 'prod' && l.qty + 1 > PROD[l.refId].stock) {
          toast(`Stock insuffisant, il reste ${PROD[l.refId].stock} « ${PROD[l.refId].name} »`);
          return;
        }
        l.qty++;
      } else {
        l.qty--;
        if (l.qty <= 0) {
          t.lines.splice(idx, 1);
          if (l.type === 'svc' && t.apptId && !t.lines.some((x) => x.type === 'svc')) t.apptId = null;
        }
      }
      renderTicket(); icons();
    };
    $('#sp-validate', el).onclick = () => {
      if (!t.lines.length) return;
      openPay({ kind: 'ticket' });
    };
    icons();
  }

  /* ═══════════════════════ PAIEMENT — kit caisse + pourboire réparti ═══════ */
  function tipSplit(tip, lines) {
    const byPr = {};
    lines.forEach((l) => { if (l.type === 'svc') byPr[l.prId] = (byPr[l.prId] || 0) + l.price * l.qty; });
    const ids = Object.keys(byPr);
    if (!tip || !ids.length) return [];
    const tot = ids.reduce((s, k) => s + byPr[k], 0);
    let acc = 0;
    return ids.map((id, i) => {
      const v = i === ids.length - 1 ? tip - acc : Math.round(tip * (byPr[id] / tot));
      acc += v;
      return { id, amount: v };
    });
  }
  const splitText = (parts) => parts.filter((p) => p.amount > 0)
    .map((p) => `${PR[p.id].short} ${p.amount}`).join(' <span class="pay-tip-sep">·</span> ');

  function openPay(ctx) {
    const el = $('#sp-paym', root);
    const isForfait = ctx.kind === 'forfait';
    const t = state.ticket;
    const base = isForfait ? ctx.price : ticketTotal(t);
    const hasSvc = !isForfait && t.lines.some((l) => l.type === 'svc');
    const who = isForfait
      ? CL[ctx.clientId].name
      : (t.clientId ? CL[t.clientId].name : 'Cliente de passage');
    let tip = 0;

    const step1 = () => {
      el.innerHTML = `
        <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${isForfait ? 'Vente forfait' : 'Encaissement'}</h3>
        <p class="modal-subtle">${isForfait ? esc(ctx.name) + ' · ' : ''}${esc(who)}</p>
        <div class="modal-amount size-md" id="sp-pay-amount">${fmtMAD(base + tip)}</div>
        ${hasSvc ? `
        <div class="pay-tip">
          <div class="pay-tip-label">Pourboire, réparti par praticienne</div>
          <div class="pay-tip-chips" id="sp-tip-chips">
            ${[0, 20, 50, 100].map((v) => `<button class="pay-tip-chip ${tip === v ? 'is-active' : ''}" data-sp-tip="${v}">${v === 0 ? 'Sans' : v + ' MAD'}</button>`).join('')}
            <button class="pay-tip-chip" data-sp-tip="autre">Autre</button>
          </div>
          <div class="pay-tip-custom" id="sp-tip-custom">
            <input class="pay-tip-input" id="sp-tip-input" type="number" inputmode="numeric" min="0" step="5" placeholder="Montant en MAD" />
          </div>
          <div class="pay-tip-breakdown ${tip ? 'is-visible' : ''}" id="sp-tip-split"></div>
        </div>` : ''}
        <div class="sp-pay-opts">
          <button class="sp-pay-opt" data-sp-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé sur le flous reçu</span></span>
          </button>
          <button class="sp-pay-opt" data-sp-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-pay-veil'); });

      const refreshTip = () => {
        $('#sp-pay-amount', el).textContent = fmtMAD(base + tip);
        const split = $('#sp-tip-split', el);
        if (!split) return;
        const parts = tipSplit(tip, t.lines);
        split.classList.toggle('is-visible', tip > 0);
        split.innerHTML = tip > 0
          ? `<span class="mono">${tip} MAD</span> pour l'équipe, ${splitText(parts)}`
          : '';
      };
      const chips = $('#sp-tip-chips', el);
      if (chips) {
        chips.onclick = (e) => {
          const b = e.target.closest('[data-sp-tip]');
          if (!b) return;
          $$('[data-sp-tip]', el).forEach((x) => x.classList.toggle('is-active', x === b));
          const custom = $('#sp-tip-custom', el);
          if (b.dataset.spTip === 'autre') {
            custom.classList.add('is-visible');
            const input = $('#sp-tip-input', el);
            input.focus();
            input.oninput = () => { tip = Math.max(0, Math.round(+input.value || 0)); refreshTip(); };
          } else {
            custom.classList.remove('is-visible');
            tip = +b.dataset.spTip;
            refreshTip();
          }
        };
        refreshTip();
      }
      $$('[data-sp-m]', el).forEach((b) => {
        b.onclick = () => (b.dataset.spM === 'especes' ? stepCash() : stepCard());
      });
    };

    const stepCash = () => {
      const amount = base + tip;
      let received = amount;
      el.innerHTML = `
        <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(who)}${tip ? ` · dont ${tip} MAD de pourboire` : ''}</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="sp-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="sp-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu" id="sp-cash-rendu-row"><span class="lbl">Rendu</span><span class="val mono" id="sp-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="sp-cash-ok">Confirmer</button>
        </div>`;
      icons();
      $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-pay-veil'); });
      const refresh = () => {
        const row = $('#sp-cash-rendu-row', el);
        const short = received < amount;
        row.classList.toggle('is-short', short);
        row.classList.toggle('is-positive', received > amount);
        $('#sp-cash-rendu', el).textContent = short
          ? `Il manque ${fmtMAD(amount - received)}`
          : fmtMAD(received - amount);
        $('#sp-cash-ok', el).disabled = short;
      };
      $('#sp-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#sp-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#sp-cash-ok', el).onclick = () => done('espèces', Math.max(0, received - amount));
    };

    const stepCard = () => {
      const amount = base + tip;
      el.innerHTML = `
        <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(who)} · Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="sp-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="sp-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-pay-veil'); });
      setTimeout(() => {
        const disc = $('#sp-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#sp-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0), 900);
        });
      }, 1900);
    };

    const done = (method, rendu) => {
      closeVeil('#sp-pay-veil');
      if (isForfait) {
        cureSeq++;
        const cu = { id: `CU-${cureSeq}`, clientId: ctx.clientId, familyId: ctx.familyId, size: ctx.size, used: 0, boughtDays: 0, expiresDays: 180 };
        CURES.unshift(cu);
        /* Le forfait est encaissé en entier le jour de la vente : c'est une
           recette du jour, même si les séances seront consommées plus tard. */
        postDay(ctx.price, method, `Forfait ${ctx.name}${CL[ctx.clientId] ? ` · ${CL[ctx.clientId].name}` : ''}`, cu.id);
        queueIfOffline('Vente forfait');
        toast(`Forfait vendu, carte ${cu.id} active · ${ctx.size} séances pour ${CL[ctx.clientId].name}`);
        toast(`Économie cliente : ${fmtMAD(ffSaving(FORFAIT[ctx.familyId], ctx.size))} vs séances à l'unité`);
        if (state.view !== 'cures') switchView('cures');
        refreshOps();
        if (typeof ctx.onDone === 'function') ctx.onDone(cu);
        return;
      }
      /* ticket séance / boutique */
      if (t.apptId) {
        const a = findAppt(t.apptId);
        if (a) a.paid = { via: method };
      }
      t.lines.forEach((l) => { if (l.type === 'prod') PROD[l.refId].stock = Math.max(0, PROD[l.refId].stock - l.qty); });
      if (t.clientId) { const c = CL[t.clientId]; c.visits++; c.lastDays = 0; }
      const parts = tipSplit(tip, t.lines);
      /* Prestations ET pourboire : c'est le montant que la cliente a réellement
         laissé au comptoir, le même que celui annoncé dans le toast. */
      postDay(base + tip, method, tkLabel(t), t.num);
      queueIfOffline('Encaissement');
      toast(`${t.num} encaissé, ${fmtMAD(base + tip)} en ${method}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      if (tip > 0) toast(`Pourboire ${fmtMAD(tip)} réparti, ${parts.map((p) => `${PR[p.id].short} ${p.amount}`).join(' · ')}`, 2800);
      ticketSeq++;
      freshTicket();
      refreshOps();
      if (state.view === 'encaisser') { renderTicket(); icons(); }
    };

    step1();
    openVeil('#sp-pay-veil');
  }

  /* ═══════════════════════ FORFAITS & CURES — la carte à poinçonner ════════ */
  function punchRow(cu, opts) {
    const pop = opts && opts.pop;
    return `<div class="sp-punches">
      ${Array.from({ length: cu.size }, (_, i) => {
        const used = i < cu.used;
        const next = i === cu.used && cu.used < cu.size;
        return `<span class="sp-punch ${used ? 'is-used' : ''} ${next ? 'is-next' : ''} ${pop && i === cu.used - 1 ? 'pop' : ''}">${used ? '<i data-lucide="check"></i>' : i + 1}</span>`;
      }).join('')}
    </div>`;
  }

  function cureCard(cu, opts) {
    const c = CL[cu.clientId];
    const f = FORFAIT[cu.familyId];
    const full = cu.used >= cu.size;
    return `<div class="sp-cure" data-sp-cure="${cu.id}">
      <div class="sp-cure-in">
        <div class="sp-cure-top">
          <div>
            <div class="sp-cure-name">${esc(f.name)} × ${cu.size}</div>
            <div class="sp-cure-id">${cu.id} · achetée ${esc(fmtRel(-cu.boughtDays))}</div>
          </div>
          <span class="sp-cure-count ${full ? 'full' : ''}">${cu.used}/${cu.size}</span>
        </div>
        <div class="sp-cure-who">
          <span class="ava">${esc(initials(c.name))}</span>
          <span><b>${esc(c.name)}</b> · <span class="tel">${esc(c.phone)}</span></span>
        </div>
        ${punchRow(cu, opts)}
        <div class="sp-cure-foot">
          <span class="sp-cure-exp">${full ? '<b>Cure terminée</b>, proposez le renouvellement' : `Valable jusqu'au <b>${esc(inDays(cu.expiresDays))}</b>`}</span>
          <span class="sp-cure-bc">${barcode(cu.id, 20)}</span>
        </div>
        <div class="sp-cure-actions">
          ${full
            ? `<button class="sp-btn primary" data-sp-renew="${cu.id}"><i data-lucide="sparkles"></i>Renouveler, économie ${fmtMAD(ffSaving(f, cu.size))}</button>`
            : `<button class="sp-btn secondary" data-sp-fiche-cl="${c.id}">Fiche</button>
               <button class="sp-btn primary" data-sp-punch="${cu.id}"><i data-lucide="check"></i>Décompter une séance</button>`}
        </div>
      </div>
    </div>`;
  }

  function renderCures(opts) {
    const panel = $('[data-sp-panel="cures"]', root);
    const actives = CURES.filter((cu) => cu.used < cu.size);
    const fulls = CURES.filter((cu) => cu.used >= cu.size);
    panel.innerHTML = `
      <div class="sp-cures">
        <header class="sp-head">
          <div><h1>Forfaits &amp; cures</h1><div class="sp-head-sub">La carte de fidélité du spa, poinçonnée à l'écran, plus rien ne se perd</div></div>
          <div class="sp-head-hint">Un tap décompte une séance, la cliente voit ses cercles se remplir</div>
        </header>
        <div class="sp-cures-scroll">
          <div class="sp-sec-head">Cures en cours · ${actives.length}</div>
          <div class="sp-cure-grid">
            ${actives.map((cu) => cureCard(cu, opts && opts.popCure === cu.id ? { pop: true } : null)).join('') ||
              '<div class="sp-cl-empty">Aucune cure active, vendez le premier forfait ci-dessous.</div>'}
          </div>
          ${fulls.length ? `
            <div class="sp-sec-head">Cures terminées, à renouveler · ${fulls.length}</div>
            <div class="sp-cure-grid">${fulls.map((cu) => cureCard(cu, opts && opts.popCure === cu.id ? { pop: true } : null)).join('')}</div>` : ''}
          <div class="sp-sec-head">Vendre un forfait</div>
          <div class="sp-ff-grid">
            ${FORFAITS.map((f) => `
              <div class="sp-ff">
                <div class="sp-ff-top">
                  <span class="sp-ff-art">${ART[f.presta] || ART.cure}</span>
                  <div>
                    <div class="sp-ff-name">${esc(f.name)}</div>
                    <div class="sp-ff-unit">séance à l'unité : ${fmtMAD(PRESTA[f.presta].price)}</div>
                  </div>
                </div>
                <div class="sp-ff-sizes">
                  ${[5, 10].map((sz) => `
                    <button class="sp-ff-size" data-sp-sell="${f.id}:${sz}">
                      <b>${sz} séances</b>
                      <span class="px">${fmtMAD(f.sizes[sz])}</span>
                      <span class="eco">économie <b>${fmtMAD(ffSaving(f, sz))}</b></span>
                    </button>`).join('')}
                </div>
              </div>`).join('')}
          </div>
          <div class="sp-foot-note">Chaque carte porte un code-barres, scannable à l'accueil pour retrouver la cure en un geste.</div>
        </div>
      </div>`;

    panel.onclick = (e) => {
      const punch = e.target.closest('[data-sp-punch]');
      if (punch) { openPunch(punch.dataset.spPunch); return; }
      const renew = e.target.closest('[data-sp-renew]');
      if (renew) { startRenew(renew.dataset.spRenew); return; }
      const fiche = e.target.closest('[data-sp-fiche-cl]');
      if (fiche) { openFiche(fiche.dataset.spFicheCl); return; }
      const sell = e.target.closest('[data-sp-sell]');
      if (sell) {
        const [fid, sz] = sell.dataset.spSell.split(':');
        startSell(fid, +sz);
      }
    };
    icons();
  }

  /* ---------- décompte (confirmation puis poinçon) ---------- */
  function openPunch(cureId, ctx) {
    const cu = CURES.find((x) => x.id === cureId);
    if (!cu || cu.used >= cu.size) return;
    const c = CL[cu.clientId];
    const el = $('#sp-punchm', root);
    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Décompter une séance</h3>
      <p class="modal-subtle">${esc(cureName(cu))} · ${esc(c.name)} · ${esc(c.phone)}</p>
      <div class="sp-punch-big">${cu.used + 1}<small> / ${cu.size}</small></div>
      <div class="sp-punch-preview">${punchRow(cu)}</div>
      ${cu.used + 1 === cu.size
        ? '<div class="sp-callout mint" style="margin-top:12px;"><i data-lucide="sparkles"></i><span>C\'est la <b>dernière séance</b> de la cure, l\'offre de renouvellement suivra.</span></div>'
        : `<p class="sp-foot-note">Après ce poinçon il restera ${cu.size - cu.used - 1} séance${cu.size - cu.used - 1 > 1 ? 's' : ''}, visible sur la fiche et la carte.</p>`}
      <div class="sp-sheet-foot">
        <button class="sp-btn secondary" data-sp-close>Annuler</button>
        <button class="sp-btn primary" id="sp-punch-ok"><i data-lucide="check"></i>Confirmer la séance ${cu.used + 1}/${cu.size}</button>
      </div>`;
    openVeil('#sp-punch-veil');
    icons();
    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-punch-veil'); });
    $('#sp-punch-ok', el).onclick = () => confirmPunch(cu, ctx);
  }

  function confirmPunch(cu, ctx) {
    cu.used++;
    const c = CL[cu.clientId];
    c.visits++; c.lastDays = 0;
    if (ctx && ctx.apptId) {
      const a = findAppt(ctx.apptId);
      if (a) a.paid = { via: 'cure' };
    }
    queueIfOffline('Décompte cure');
    if (cu.used >= cu.size) {
      renderCompletion(cu);
      renderBadges();
      if (state.view === 'cures') renderCures({ popCure: cu.id });
      else if (state.view === 'planning') renderPlanning();
      icons();
      return;
    }
    closeVeil('#sp-punch-veil');
    toast(`Séance ${cu.used}/${cu.size} décomptée pour ${c.name}, il en reste ${cu.size - cu.used}`);
    renderBadges();
    if (state.view === 'cures') { renderCures({ popCure: cu.id }); icons(); }
    else refreshOps();
  }

  /* cure terminée → célébration sobre + offre de renouvellement */
  function renderCompletion(cu) {
    const c = CL[cu.clientId];
    const f = FORFAIT[cu.familyId];
    const el = $('#sp-punchm', root);
    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Cure terminée, ${cu.used}/${cu.size}</h3>
      <p class="modal-subtle">${esc(c.name)} a fini sa ${esc(f.name.toLowerCase())}, le bon moment pour renouveler.</p>
      <div class="sp-punch-preview">${punchRow(cu, { pop: true })}</div>
      <div class="sp-callout mint" style="margin-top:14px;"><i data-lucide="sparkles"></i>
        <span>Sur cette cure, ${esc(c.name.split(' ')[0])} a économisé <b>${fmtMAD(ffSaving(f, cu.size))}</b> vs séances à l'unité.</span>
      </div>
      <div class="sp-pay-opts" style="margin-top:4px;">
        ${[5, 10].map((sz) => `
          <button class="sp-pay-opt" data-sp-rn="${sz}">
            <span class="ic"><i data-lucide="tags"></i></span>
            <span class="l"><b>Renouveler × ${sz} · ${fmtMAD(f.sizes[sz])}</b><span>économie ${fmtMAD(ffSaving(f, sz))} vs l'unité</span></span>
          </button>`).join('')}
      </div>
      <div class="sp-sheet-foot">
        <button class="sp-btn ghost" data-sp-close>Plus tard, la carte reste dans l'historique</button>
      </div>`;
    openVeil('#sp-punch-veil');
    icons();
    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-punch-veil'); });
    $$('[data-sp-rn]', el).forEach((b) => {
      b.onclick = () => {
        closeVeil('#sp-punch-veil');
        const size = +b.dataset.spRn;
        openPay({ kind: 'forfait', familyId: f.id, size, price: f.sizes[size], clientId: cu.clientId, name: `${f.name} × ${size}` });
      };
    });
  }

  function startRenew(cureId) {
    const cu = CURES.find((x) => x.id === cureId);
    if (!cu) return;
    renderCompletion(cu);
  }

  /* ---------- vente d'un nouveau forfait ---------- */
  function startSell(familyId, size) {
    const f = FORFAIT[familyId];
    openPickClient({
      title: `${f.name} × ${size}`,
      sub: `${fmtMAD(f.sizes[size])}, la cure exige une fiche cliente (le poinçon la suit)`,
      allowGuest: false,
      onPick: (pick) => {
        if (!pick.clientId) return;
        openPay({ kind: 'forfait', familyId, size, price: f.sizes[size], clientId: pick.clientId, name: `${f.name} × ${size}` });
      },
    });
  }

  /* ═══════════════════════ BOUTIQUE ═══════════════════════ */
  function renderBoutique() {
    const panel = $('[data-sp-panel="boutique"]', root);
    const inTicket = state.ticket.lines.filter((l) => l.type === 'prod').reduce((s, l) => s + l.qty, 0);
    panel.innerHTML = `
      <div class="sp-cures">
        <header class="sp-head">
          <div><h1>Boutique</h1><div class="sp-head-sub">Le rituel continue à la maison, argan, beldi, ghassoul, kessa</div></div>
          ${inTicket ? `<button class="sp-btn primary" id="sp-shop-go" style="flex:0 0 auto; padding:11px 16px;"><i data-lucide="banknote"></i>Ticket · ${inTicket} article${inTicket > 1 ? 's' : ''}</button>`
            : '<div class="sp-head-hint">Touchez un produit, il part sur le ticket de la caisse</div>'}
        </header>
        <div class="sp-cures-scroll">
          <div class="sp-sec-head">Produits du spa · ${PRODUCTS.length}</div>
          <div class="sp-grid" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
            ${PRODUCTS.map((p, i) => `
              <button class="sp-card" data-sp-shop="${p.id}" style="--i:${i}">
                <span class="sp-card-stock ${p.stock <= 0 ? 'out' : p.stock <= 3 ? 'low' : ''}">${p.stock <= 0 ? 'épuisé' : p.stock <= 3 ? `stock bas · ${p.stock}` : `× ${p.stock}`}</span>
                <span class="sp-card-art" style="width:66px;height:66px;">${ART[p.id] || ''}</span>
                <span class="sp-card-name">${esc(p.name)}</span>
                <span class="sp-card-price">${fmtMAD(p.price)}</span>
              </button>`).join('')}
          </div>
          <div class="sp-foot-note">Le stock se décompte à l'encaissement, sous 3 unités, la pastille passe en alerte.</div>
        </div>
      </div>`;
    panel.onclick = (e) => {
      const go = e.target.closest('#sp-shop-go');
      if (go) { switchView('encaisser'); return; }
      const b = e.target.closest('[data-sp-shop]');
      if (!b) return;
      addProduct(b.dataset.spShop);
      renderBoutique();
      icons();
    };
    icons();
  }

  /* ═══════════════════════ CLIENTES — phone-first ═══════════════════════ */
  function matchCliente(c, q) {
    if (!q) return true;
    const digits = q.replace(/\D/g, '');
    return (digits.length >= 2 && c.phone.replace(/\D/g, '').includes(digits)) ||
      (!digits && c.name.toLowerCase().includes(q.toLowerCase()));
  }

  function renderClientes() {
    const panel = $('[data-sp-panel="clientes"]', root);
    const q = state.clQuery;
    const hits = CLIENTES.filter((c) => matchCliente(c, q));
    panel.innerHTML = `
      <div class="sp-clients">
        <header class="sp-head">
          <div><h1>Clientes</h1><div class="sp-head-sub">La fiche se cherche au téléphone, allergies, préférences, cures actives</div></div>
          <div class="sp-search"><i data-lucide="search"></i>
            <input id="sp-cl-q" inputmode="tel" placeholder="06… ou nom de la cliente" value="${esc(q)}" autocomplete="off" /></div>
        </header>
        <div class="sp-cl-scroll">
          <div class="sp-cl-grid">
            ${hits.map((c) => {
              const cures = curesOf(c.id);
              return `<button class="sp-cl-card" data-sp-cl="${c.id}">
                <span class="sp-ava">${esc(initials(c.name))}</span>
                <span class="sp-cl-mid">
                  <span class="sp-cl-name">${esc(c.name)}${c.vip ? ' · VIP' : ''}</span>
                  <span class="sp-cl-sub">${esc(c.phone)} · dernière ${esc(fmtRel(c.lastDays))}</span>
                  <span class="sp-cl-tags">
                    ${c.allergies.length ? `<span class="sp-pill due"><i data-lucide="shield-check"></i>${esc(c.allergies[0])}</span>` : ''}
                    ${cures.map((cu) => `<span class="sp-pill mint"><i data-lucide="tags"></i>cure ${cu.used}/${cu.size}</span>`).join('')}
                    ${c.prefs.length ? `<span class="sp-pill"><i data-lucide="heart"></i>${esc(c.prefs[0])}</span>` : ''}
                  </span>
                </span>
                <span class="sp-cl-right"><b>${c.visits}</b>visites</span>
              </button>`;
            }).join('') || `<div class="sp-cl-empty">Aucune fiche pour « ${esc(q)} », vérifiez le numéro.</div>`}
          </div>
        </div>
      </div>`;
    const input = $('#sp-cl-q', panel);
    input.oninput = (e) => {
      state.clQuery = e.target.value;
      renderClientes(); icons();
      const i2 = $('#sp-cl-q', panel);
      i2.focus();
      const v = i2.value; i2.value = ''; i2.value = v;
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-sp-cl]');
      if (b) openFiche(b.dataset.spCl);
    };
    icons();
  }

  function openFiche(clientId) {
    const c = CL[clientId];
    if (!c) return;
    const cures = curesOf(clientId);
    const el = $('#sp-fichem', root);
    el.innerHTML = `
      <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="sp-fh">
        <span class="sp-ava">${esc(initials(c.name))}</span>
        <div class="sp-fh-mid">
          <div class="sp-fh-name">${esc(c.name)}${c.vip ? ' · VIP' : ''}</div>
          <div class="sp-fh-sub">${esc(c.phone)} · dernière visite ${esc(fmtRel(c.lastDays))}</div>
        </div>
        <div class="sp-fh-right"><b>${c.visits}</b>visites</div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Allergies <span class="opt">· vérifiées avant chaque soin huilé</span></div>
        <div class="sp-chips">
          ${c.allergies.length
            ? c.allergies.map((a) => `<span class="sp-chip danger"><i data-lucide="shield-check"></i>${esc(a)}</span>`).join('')
            : '<span class="sp-chip none">Aucune allergie déclarée</span>'}
        </div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Préférences</div>
        <div class="sp-chips">
          ${c.prefs.length
            ? c.prefs.map((p) => `<span class="sp-chip mint"><i data-lucide="heart"></i>${esc(p)}</span>`).join('')
            : '<span class="sp-chip none">À compléter au prochain passage</span>'}
        </div>
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Cures actives</div>
        ${cures.length ? cures.map((cu) => `
          <button class="sp-mini-cure" data-sp-gocure>
            <i data-lucide="tags"></i><span>${esc(cureName(cu))}, prochaine séance offerte par la carte</span>
            <span class="ct">${cu.used}/${cu.size}</span>
          </button>`).join('')
          : '<div class="sp-chips"><span class="sp-chip none">Aucune cure en cours, un forfait lui ferait gagner jusqu\'à 20 %</span></div>'}
      </div>

      <div class="sp-f">
        <div class="sp-f-lbl">Historique</div>
        <div class="sp-hist">
          ${c.hist.map((h) => `<div class="sp-hist-row"><i data-lucide="history"></i><b>${esc(h.what)}</b><span class="when">${esc(h.when)}</span></div>`).join('')}
        </div>
      </div>

      <div class="sp-sheet-foot">
        <button class="sp-btn secondary" id="sp-fiche-book"><i data-lucide="calendar-clock"></i>Réserver un créneau</button>
        <button class="sp-btn primary" id="sp-fiche-sell"><i data-lucide="banknote"></i>Nouvelle vente</button>
      </div>`;
    openVeil('#sp-fiche-veil');
    icons();
    $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-fiche-veil'); });
    $$('[data-sp-gocure]', el).forEach((b) => {
      b.onclick = () => { closeVeil('#sp-fiche-veil'); switchView('cures'); };
    });
    $('#sp-fiche-book', el).onclick = () => {
      closeVeil('#sp-fiche-veil');
      /* préférence praticienne si notée sur la fiche */
      const prefPr = PRACTS.find((p) => c.prefs.some((x) => x.toLowerCase().includes(p.short.toLowerCase())));
      const prId = prefPr ? prefPr.id : 'NH';
      openBook({ prId, start: nextFree(prId), clientId: c.id });
    };
    $('#sp-fiche-sell', el).onclick = () => {
      closeVeil('#sp-fiche-veil');
      state.ticket.clientId = c.id;
      state.ticket.guest = false;
      switchView('encaisser');
      toast(`${c.name} attachée au ticket${c.allergies.length ? `, allergie : ${c.allergies.join(' · ')}` : ''}`);
    };
  }

  /* ---------- sélecteur de cliente (réutilisable, phone-first) ---------- */
  function openPickClient(cfg) {
    const el = $('#sp-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const hits = CLIENTES.filter((c) => matchCliente(c, q || ''));
      el.innerHTML = `
        <button class="sp-modal-x" data-sp-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${esc(cfg.title || 'Cliente')}</h3>
        <p class="modal-subtle">${esc(cfg.sub || 'Au spa on cherche par téléphone, la fiche porte allergies et cures.')}</p>
        <div class="sp-phone-in"><i data-lucide="phone"></i>
          <input id="sp-pk-q" inputmode="tel" placeholder="06… ou nom de la cliente" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="sp-cl-results">
            ${hits.map((c) => `
              <button class="sp-cl-row" data-sp-pk="${c.id}">
                <span class="sp-ava">${esc(initials(c.name))}</span>
                <span class="sp-cl-mid">
                  <span class="sp-cl-name">${esc(c.name)}${c.vip ? ' · VIP' : ''}</span>
                  <span class="sp-cl-sub">${esc(c.phone)} · ${c.visits} visites${c.allergies.length ? ' · allergie au dossier' : ''}</span>
                </span>
                ${curesOf(c.id).length ? `<span class="sp-pill mint">cure ${curesOf(c.id)[0].used}/${curesOf(c.id)[0].size}</span>` : ''}
              </button>`).join('') || `<div class="sp-cl-empty">Aucune fiche pour « ${esc(q)} »</div>`}
          </div>
          <button class="sp-cl-new" id="sp-pk-new"><i data-lucide="user-plus"></i>Nouvelle fiche${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          ${cfg.allowGuest ? `
            <div class="sp-sheet-foot" style="margin-top:10px;">
              <button class="sp-btn ghost" id="sp-pk-guest">Cliente de passage, sans fiche</button>
            </div>` : ''}` : `
          <div class="sp-cl-form">
            <input class="sp-in" id="sp-pk-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="sp-in" id="sp-pk-tel" inputmode="tel" placeholder="Téléphone" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <input class="sp-in" id="sp-pk-alg" placeholder="Allergie connue (optionnel, ex. huile d'amande)" />
            <div class="sp-sheet-foot" style="margin-top:4px;">
              <button class="sp-btn secondary" id="sp-pk-back">Retour</button>
              <button class="sp-btn primary" id="sp-pk-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      icons();
      const input = $('#sp-pk-q', el);
      input.oninput = (e) => {
        render(e.target.value);
        const i2 = $('#sp-pk-q', el);
        i2.focus();
        const v = i2.value; i2.value = ''; i2.value = v;
      };
      $$('[data-sp-close]', el).forEach((b) => { b.onclick = () => closeVeil('#sp-client-veil'); });
      $$('[data-sp-pk]', el).forEach((b) => {
        b.onclick = () => {
          closeVeil('#sp-client-veil');
          cfg.onPick({ clientId: b.dataset.spPk });
        };
      });
      const newB = $('#sp-pk-new', el);
      if (newB) newB.onclick = () => { mode = 'create'; render(q); };
      const guest = $('#sp-pk-guest', el);
      if (guest) guest.onclick = () => {
        closeVeil('#sp-client-veil');
        cfg.onPick({ clientId: null });
      };
      const back = $('#sp-pk-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); };
      const create = $('#sp-pk-create', el);
      if (create) create.onclick = () => {
        const name = $('#sp-pk-name', el).value.trim();
        const tel = $('#sp-pk-tel', el).value.trim();
        const alg = $('#sp-pk-alg', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        const id = 'cx' + Date.now().toString(36);
        const c = { id, name, phone: tel || '—', visits: 0, allergies: alg ? [alg] : [], prefs: [], lastDays: 0, lastWhat: '', hist: [], vip: false };
        CLIENTES.unshift(c); CL[id] = c;
        closeVeil('#sp-client-veil');
        toast(`Fiche créée, ${name}${alg ? ` · allergie notée : ${alg}` : ''}`);
        cfg.onPick({ clientId: id });
      };
    };
    render('');
    openVeil('#sp-client-veil');
    setTimeout(() => { const i = $('#sp-pk-q', el); if (i) i.focus(); }, 60);
  }

  /* ═══════════════════════ OFFLINE (file simulée) ═══════════════════════ */
  function toggleOffline() {
    state.offline = !state.offline;
    if (!state.offline && state.queued) {
      toast(`Réseau de retour, ${state.queued} action${state.queued > 1 ? 's' : ''} synchronisée${state.queued > 1 ? 's' : ''}`);
      state.queued = 0;
    } else if (state.offline) {
      toast('Mode hors-ligne, le spa continue, tout est mis en file');
    } else {
      toast('Réseau de retour, rien en attente, tout est synchronisé');
    }
    renderNet();
  }
  function renderNet() {
    const net = $('#sp-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.sp-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.sp-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'sp-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#sp-offline-note', root);
    note.hidden = !state.offline;
    $('#sp-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'spa',
    greet: {
      line1: 'Sba7 lkhir Imane,',
      em: 'marhba.',
      sub: 'Spa Bahia <em>·</em> planning du jour',
    },
    mount,
    onShow,
  });
})();
