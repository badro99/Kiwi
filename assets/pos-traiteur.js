/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · TRAITEUR DAR ZELLIJ — événementiel (PIN 0008)
 * ---------------------------------------------------------------------------
 * One terminal, every métier: this module turns the kiwi-caisse into the
 * back-office + comptoir of a Tangier caterer. The work of a traiteur is not
 * a stream of small tickets — it is a handful of BIG events that each live
 * for weeks: devis envoyé → confirmé → acompte reçu → livré.
 *
 * The two signature halves:
 *   · DEVIS — a visual per-person menu builder (pastilla, méchoui, couscous
 *     royal…) × nombre d'invités = total auto, extras compris, envoyé en
 *     un geste par WhatsApp.
 *   · ACOMPTES — chaque événement porte son ÉCHÉANCIER 30 % à la
 *     confirmation / 50 % à J-7 / solde le jour J, rendu comme une timeline
 *     payé / aujourd'hui / en retard / à venir, encaissable en deux taps.
 * Plus JOUR J: le bon de livraison vivant (quantités, équipe, checklist de
 * chargement) du service du soir.
 *
 * Mounted by assets/pos-dispatch.js into #pos-traiteur. Reuses the caisse
 * modal kit (.modal-veil, .modal, .cash-*, .reader-*) + #toast-stack.
 * V1 = couche opérationnelle: la carte part au lecteur partenaire.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD  = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n)) + ' MAD';
  const fmtN    = (n) => new Intl.NumberFormat('fr-FR', { useGrouping: true }).format(Math.round(n));
  const icons   = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const lens    = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS    = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS  = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2    = (n) => String(n).padStart(2, '0');
  const fmtDay  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const fmtDT   = (d) => `${fmtDay(d)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const timeOf  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const DAY = 24 * 3600 * 1000;
  const NOW = Date.now();

  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const calDiff  = (d) => Math.round((dayStart(d) - dayStart(new Date())) / DAY);
  const sameDay  = (a, b) => dayStart(a).getTime() === dayStart(b).getTime();
  const isToday  = (d) => sameDay(d, new Date());
  function relDay(d) {
    const n = calDiff(d);
    if (n === 0) return 'aujourd’hui';
    if (n === 1) return 'demain';
    if (n > 1) return `J−${n}`;
    return `il y a ${-n} j`;
  }
  function firstName(name) { return String(name || '').split(/\s+/)[0] || ''; }
  function lastName(name) { const w = String(name || '').trim().split(/\s+/); return w[w.length - 1] || ''; }
  function initials(name) {
    return String(name || '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function localDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

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

  /* ───────────────────────── line-art — the menu IS visual ─────────────────────────
     Same voice as the pressing's garment art: forest strokes, mint-tint
     fills, 64×64 grid. Plats de fête reconnaissables au premier regard. */
  const art = (inner) => `<svg class="tr-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    salades: art(`<ellipse class="fill" cx="32" cy="47" rx="26" ry="7"/><ellipse cx="32" cy="47" rx="26" ry="7"/><path class="fill" d="M8 26a8 8 0 0 0 16 0z"/><path d="M8 26a8 8 0 0 0 16 0"/><path d="M8 26h16"/><path class="fill" d="M22 18a10 10 0 0 0 20 0z"/><path d="M22 18a10 10 0 0 0 20 0"/><path d="M22 18h20"/><path class="fill" d="M40 26a8 8 0 0 0 16 0z"/><path d="M40 26a8 8 0 0 0 16 0"/><path d="M40 26h16"/><path class="thin" d="M28 14c2-2 6-2 8 0M13 22c1.5-1.5 4.5-1.5 6 0M45 22c1.5-1.5 4.5-1.5 6 0"/>`),
    pastilla: art(`<ellipse class="soft" cx="32" cy="41" rx="27" ry="13" fill="none"/><ellipse class="fill" cx="32" cy="38" rx="21" ry="11"/><ellipse cx="32" cy="38" rx="21" ry="11"/><path class="thin" d="M17 32l24 13M25 29l21 13M33 28l-22 13M41 30l-22 12"/><circle class="thin" cx="32" cy="24" r="0.9"/><circle class="thin" cx="25" cy="26" r="0.9"/><circle class="thin" cx="39" cy="26" r="0.9"/>`),
    briouates: art(`<path class="fill" d="M23 25l9-14 9 14z"/><path d="M23 25l9-14 9 14z"/><path class="thin" d="M28 21h8"/><path class="fill" d="M10 47l10-16 10 16z"/><path d="M10 47l10-16 10 16z"/><path class="thin" d="M15 42h10"/><path class="fill" d="M34 47l10-16 10 16z"/><path d="M34 47l10-16 10 16z"/><path class="thin" d="M39 42h10"/><path class="thin" d="M8 53h48"/>`),
    harira: art(`<path class="thin" d="M25 6c-2 3 2 6 0 9M33 5c-2 3 2 6 0 9M41 8c-2 2.5 1.6 5 0 8"/><path class="fill" d="M11 24h42c0 14-8 24-21 24S11 38 11 24z"/><path d="M11 24h42c0 14-8 24-21 24S11 38 11 24z"/><path d="M11 24h42" class="thin"/><ellipse class="fill" cx="14" cy="56" rx="4" ry="2.4"/><ellipse cx="14" cy="56" rx="4" ry="2.4"/><ellipse class="fill" cx="24" cy="57" rx="4" ry="2.4"/><ellipse cx="24" cy="57" rx="4" ry="2.4"/>`),
    tajine_agneau: art(`<path class="fill" d="M32 11C21 21 16 32 15 43h34c-1-11-6-22-17-32z"/><path d="M32 11C21 21 16 32 15 43h34c-1-11-6-22-17-32z"/><circle cx="32" cy="9" r="2.6"/><path class="thin" d="M21 36l3.5-3 3.5 3 3.5-3 3.5 3 3.5-3 3.5 3 3.5-3"/><path class="fill" d="M9 43h46l-5 9H14z"/><path d="M9 43h46l-5 9H14z"/>`),
    mechoui: art(`<ellipse class="fill" cx="30" cy="46" rx="25" ry="8.5"/><ellipse cx="30" cy="46" rx="25" ry="8.5"/><path class="fill" d="M13 44c1-12 8-20 18-20 9 0 16 8 17 20z"/><path d="M13 44c1-12 8-20 18-20 9 0 16 8 17 20"/><path d="M45 28l9-9"/><circle cx="56" cy="17" r="2.4"/><circle cx="52" cy="14" r="2.4"/><path class="thin" d="M22 34c2-3 5-5 9-5M14 49h8M38 50h8"/>`),
    couscous: art(`<path class="fill" d="M16 36c0-11 7-17 16-17s16 6 16 17z"/><path d="M16 36c0-11 7-17 16-17s16 6 16 17"/><path class="thin" d="M32 19v-6M23 21l-3.5-5M41 21l3.5-5M27 25c1 0 1.5.5 1.5 1.5M36 24c1 0 1.5.5 1.5 1.5M31 29c1 0 1.5.5 1.5 1.5"/><path class="fill" d="M8 36h48l-6 13H14z"/><path d="M8 36h48l-6 13H14z"/><path class="thin" d="M12 41h40"/>`),
    poulet_mhamer: art(`<ellipse class="soft" cx="32" cy="49" rx="25" ry="7" fill="none"/><path class="fill" d="M17 38c-3-12 5-21 15-21 11 0 16 8 15 16-1 10-9 14-16 14-7 0-12-3-14-9z"/><path d="M17 38c-3-12 5-21 15-21 11 0 16 8 15 16-1 10-9 14-16 14-7 0-12-3-14-9"/><path d="M43 23l7-7"/><circle cx="52" cy="14" r="2.3"/><path d="M46 30l9-4"/><circle cx="57" cy="25" r="2.3"/><circle class="thin" cx="18" cy="46" r="3"/><path class="thin" d="M24 30c2-3 5-4 8-4"/>`),
    poisson: art(`<ellipse class="soft" cx="32" cy="50" rx="27" ry="6.5" fill="none"/><path class="fill" d="M6 33c8-9 18-13 28-10 6 2 10 5 13 10-3 5-7 8-13 10-10 3-20-1-28-10z"/><path d="M6 33c8-9 18-13 28-10 6 2 10 5 13 10-3 5-7 8-13 10-10 3-20-1-28-10z"/><path class="fill" d="M47 33l11-9-3 9 3 9z"/><path d="M47 33l11-9-3 9 3 9z"/><circle cx="14" cy="31" r="1.2"/><path class="thin" d="M20 27c2.5 4 2.5 8 0 12M28 25c3 5 3 11 0 16"/>`),
    cornes: art(`<path class="fill" d="M10 41c2-11 11-19 21-19-7 5-10 11-11 20 0 3 0 5 1 7-6-1-11-4-11-8z"/><path d="M10 41c2-11 11-19 21-19-7 5-10 11-11 20 0 3 0 5 1 7-6-1-11-4-11-8z"/><path class="fill" d="M31 46c2-11 11-19 21-19-7 5-10 11-11 20 0 3 0 5 1 7-6-1-11-4-11-8z"/><path d="M31 46c2-11 11-19 21-19-7 5-10 11-11 20 0 3 0 5 1 7-6-1-11-4-11-8z"/><circle class="thin" cx="38" cy="18" r="0.9"/><circle class="thin" cx="44" cy="15" r="0.9"/><circle class="thin" cx="18" cy="16" r="0.9"/><circle class="thin" cx="24" cy="13" r="0.9"/>`),
    patisserie: art(`<ellipse class="soft" cx="32" cy="20" rx="11" ry="3" fill="none"/><path d="M32 23v7"/><ellipse class="soft" cx="32" cy="34" rx="19" ry="4" fill="none"/><path d="M32 38v9"/><path d="M21 49h22"/><rect class="fill" x="24" y="12" width="6" height="6" rx="1.6"/><rect x="24" y="12" width="6" height="6" rx="1.6"/><circle class="fill" cx="37" cy="15" r="2.8"/><circle cx="37" cy="15" r="2.8"/><circle class="fill" cx="19" cy="28" r="2.8"/><circle cx="19" cy="28" r="2.8"/><rect class="fill" x="29" y="25" width="6" height="6" rx="1.6"/><rect x="29" y="25" width="6" height="6" rx="1.6"/><circle class="fill" cx="44" cy="28" r="2.8"/><circle cx="44" cy="28" r="2.8"/>`),
    fruits: art(`<path class="fill" d="M9 36h46c0 11-10 17-23 17S9 47 9 36z"/><path d="M9 36h46c0 11-10 17-23 17S9 47 9 36z"/><circle class="fill" cx="21" cy="30" r="7"/><circle cx="21" cy="30" r="7"/><circle class="fill" cx="36" cy="26" r="7.5"/><circle cx="36" cy="26" r="7.5"/><path d="M36 18v-4"/><circle cx="48" cy="30" r="2.6"/><circle cx="51" cy="35" r="2.6"/><circle cx="45" cy="35" r="2.6"/><path class="thin" d="M17 28c1-1.5 3-2 5-1.5"/>`),
    the: art(`<path class="fill" d="M14 30c0-6 6-10 13-10s13 4 13 10c0 9-3 15-13 15s-13-6-13-15z"/><path d="M14 30c0-6 6-10 13-10s13 4 13 10c0 9-3 15-13 15s-13-6-13-15z"/><path d="M21 19c0-4 3-7 6-7s6 3 6 7"/><circle cx="27" cy="9" r="2.2"/><path d="M14 32c-5-1-8-5-8-11M6 21l-1.5-2.5"/><path d="M40 25c5 2 5 9 0 11"/><path class="fill" d="M47 33h11l-2 14h-7z"/><path d="M47 33h11l-2 14h-7z"/><path class="thin" d="M49 38h7M50 28c-1.5 1.6 1 3 0 4.6"/>`),
    jus: art(`<path class="fill" d="M13 17h22v7l-2.5 20a5 5 0 0 1-5 4.5h-7a5 5 0 0 1-5-4.5L13 24z"/><path d="M13 17h22v7l-2.5 20a5 5 0 0 1-5 4.5h-7a5 5 0 0 1-5-4.5L13 24z"/><path d="M13 17l-3-4"/><path d="M35 21c5 1.5 5 9 0 10"/><path class="thin" d="M15 27h18"/><path class="fill" d="M43 26h13l-2 21h-9z"/><path d="M43 26h13l-2 21h-9z"/><path d="M51 26l4.5-9"/><path class="thin" d="M44.5 32h10"/>`),
    sodas: art(`<rect class="fill" x="23" y="5" width="8" height="5" rx="1.4"/><rect x="23" y="5" width="8" height="5" rx="1.4"/><path class="fill" d="M24 10h6v6c4 2 6 5 6 10v20a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V26c0-5 2-8 6-10z"/><path d="M24 10h6v6c4 2 6 5 6 10v20a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V26c0-5 2-8 6-10z"/><path class="thin" d="M18 30h18M18 42h18"/><path class="fill" d="M42 24h14l-2 24H44z"/><path d="M42 24h14l-2 24H44z"/><circle class="thin" cx="48" cy="32" r="1.2"/><circle class="thin" cx="52" cy="37" r="1"/><circle class="thin" cx="49" cy="42" r="1.1"/>`),
  };

  /* ───────────────────────── carte traiteur (MAD / personne) ───────────────────────── */
  const COURSES = [
    { id: 'entrees',  label: 'Entrées' },
    { id: 'plats',    label: 'Plats' },
    { id: 'desserts', label: 'Desserts' },
    { id: 'boissons', label: 'Boissons' },
  ];
  const DISHES = [
    { id: 'salades',       course: 'entrees',  label: 'Salades marocaines', sub: 'assortiment 7 coupelles', price: 35, pack: (g) => `${Math.ceil(g / 10)} plateaux de 10` },
    { id: 'pastilla',      course: 'entrees',  label: 'Pastilla au poulet', sub: 'amandes & cannelle',      price: 45, pack: (g) => `${Math.ceil(g / 8)} pastillas (8 parts)` },
    { id: 'briouates',     course: 'entrees',  label: 'Briouates assortis', sub: '3 pièces / pers',         price: 30, pack: (g) => `${fmtN(g * 3)} pièces · ${Math.ceil((g * 3) / 60)} plateaux` },
    { id: 'harira',        course: 'entrees',  label: 'Harira & dattes',    sub: 'bol + accompagnement',    price: 25, pack: (g) => `${Math.ceil(g / 40)} marmites de 40` },
    { id: 'mechoui',       course: 'plats',    label: 'Méchoui',            sub: 'agneau rôti entier', flag: 'pièce maîtresse', price: 140, pack: (g) => `${Math.ceil(g / 25)} agneaux entiers` },
    { id: 'tajine_agneau', course: 'plats',    label: 'Tajine agneau',      sub: 'pruneaux & amandes',      price: 95, pack: (g) => `${Math.ceil(g / 10)} tajines de 10` },
    { id: 'couscous',      course: 'plats',    label: 'Couscous royal',     sub: '7 légumes · 3 viandes',   price: 85, pack: (g) => `${Math.ceil(g / 10)} gsâa de 10` },
    { id: 'poulet_mhamer', course: 'plats',    label: 'Poulet m’hamer', sub: 'citron confit & olives', price: 75, pack: (g) => `${Math.ceil(g / 2)} poulets (1/2 par pers)` },
    { id: 'poisson',       course: 'plats',    label: 'Poisson chermoula',  sub: 'au four · selon arrivage', price: 90, pack: (g) => `${Math.ceil(g / 10)} plateaux de 10` },
    { id: 'cornes',        course: 'desserts', label: 'Cornes de gazelle',  sub: '& chebakia · 2 pièces',   price: 25, pack: (g) => `${fmtN(g * 2)} pièces · ${Math.ceil(g / 25)} coffrets` },
    { id: 'patisserie',    course: 'desserts', label: 'Pâtisserie fine',    sub: 'plateau prestige · 3 pièces', price: 35, pack: (g) => `${fmtN(g * 3)} pièces · ${Math.ceil(g / 20)} plateaux` },
    { id: 'fruits',        course: 'desserts', label: 'Corbeille de fruits', sub: 'fruits de saison',       price: 20, pack: (g) => `${Math.ceil(g / 15)} corbeilles` },
    { id: 'the',           course: 'boissons', label: 'Thé à la menthe',    sub: 'service traditionnel',    price: 15, pack: (g) => `${Math.ceil(g / 15)} services théière` },
    { id: 'jus',           course: 'boissons', label: 'Jus frais assortis', sub: 'orange · avocat · panaché', price: 20, pack: (g) => `${Math.ceil(g / 10)} carafes` },
    { id: 'sodas',         course: 'boissons', label: 'Sodas & eaux',       sub: 'plates et gazeuses',      price: 12, pack: (g) => `${Math.ceil(g / 6)} packs de 6` },
  ];
  const DISH = Object.fromEntries(DISHES.map((d) => [d.id, d]));

  const EXTRAS = [
    { id: 'service',   label: 'Service en salle',        sub: '1 serveur / 20 invités',      calc: (g) => ({ qty: Math.ceil(g / 20), unit: 'serveur',  each: 300 }) },
    { id: 'nappage',   label: 'Nappage & déco de table', sub: '1 table / 8 invités',         calc: (g) => ({ qty: Math.ceil(g / 8),  unit: 'table',    each: 90 }) },
    { id: 'vaisselle', label: 'Vaisselle & verrerie',    sub: 'couvert complet',             calc: (g) => ({ qty: g,                 unit: 'couvert',  each: 12 }) },
    { id: 'livraison', label: 'Livraison & installation', sub: 'camion réfrigéré · Tanger',  calc: () => ({ qty: 1,                  unit: 'forfait',  each: 600 }) },
  ];
  const EXTRA = Object.fromEntries(EXTRAS.map((x) => [x.id, x]));
  const extraCost = (id, g) => { const c = EXTRA[id].calc(g); return c.qty * c.each; };
  const extraLine = (id, g) => {
    const c = EXTRA[id].calc(g);
    return c.qty === 1 && c.unit === 'forfait' ? 'forfait' : `${c.qty} ${c.unit}${c.qty > 1 ? 's' : ''} × ${c.each}`;
  };

  const TYPES = {
    mariage:      { label: 'Mariage',      icon: 'heart' },
    fiancailles:  { label: 'Fiançailles',  icon: 'sparkles' },
    anniversaire: { label: 'Anniversaire', icon: 'cake' },
    entreprise:   { label: 'Entreprise',   icon: 'building-2' },
  };
  const STATUSES = {
    devis:    { label: 'Devis envoyé' },
    confirme: { label: 'Confirmé' },
    acompte:  { label: 'Acompte reçu' },
    livre:    { label: 'Livré' },
  };
  const STATUS_ORDER = ['devis', 'confirme', 'acompte', 'livre'];
  const METHODS = { especes: 'espèces', carte: 'carte', virement: 'virement' };

  /* ───────────────────────── totals & échéancier ───────────────────────── */
  function perPerson(ev) { return ev.menu.reduce((s, id) => s + DISH[id].price, 0); }
  function evTotals(ev) {
    const pp = perPerson(ev);
    const menuTotal = pp * ev.guests;
    const extrasTotal = ev.extras.reduce((s, id) => s + extraCost(id, ev.guests), 0);
    return { pp, menuTotal, extrasTotal, total: menuTotal + extrasTotal };
  }
  function buildTranches(ev) {
    const { total } = evTotals(ev);
    const t1 = Math.round(total * 0.30);
    const t2 = Math.round(total * 0.50);
    const j7 = new Date(ev.date.getTime() - 7 * DAY);
    return [
      { id: 't1', pct: 30, label: 'À la confirmation', amount: t1,             due: ev.confirmedAt || null, paid: null },
      { id: 't2', pct: 50, label: 'À J−7',        amount: t2,             due: j7,                     paid: null },
      { id: 't3', pct: 20, label: 'Le jour J · solde', amount: total - t1 - t2, due: ev.date,               paid: null },
    ];
  }
  function trancheState(ev, t) {
    if (t.paid) return 'paid';
    if (ev.status === 'devis' || !t.due) return 'next';
    if (isToday(t.due)) return 'today';
    if (dayStart(t.due) < dayStart(new Date())) return 'late';
    return 'next';
  }
  function nextTranche(ev) { return ev.tranches.find((t) => !t.paid) || null; }
  function paidTotal(ev) { return ev.tranches.reduce((s, t) => s + (t.paid ? t.amount : 0), 0); }
  function dueTotal(ev) { return Math.max(0, evTotals(ev).total - paidTotal(ev)); }
  function dueNowTranches() {
    const out = [];
    EVENTS.forEach((ev) => {
      if (ev.status === 'devis' || ev.status === 'livre') return;
      ev.tranches.forEach((t) => {
        const st = trancheState(ev, t);
        if (st === 'today' || st === 'late') out.push({ ev, t, st });
      });
    });
    out.sort((a, b) => (a.st === 'late' ? 0 : 1) - (b.st === 'late' ? 0 : 1));
    return out;
  }

  function buildChecklist(ev) {
    const items = ev.menu.map((id) => ({ label: `${DISH[id].label}, ${DISH[id].pack(ev.guests)}`, done: false }));
    if (ev.extras.includes('nappage')) items.push({ label: `Nappage & déco, ${Math.ceil(ev.guests / 8)} tables`, done: false });
    if (ev.extras.includes('vaisselle')) items.push({ label: `Vaisselle & verrerie, ${fmtN(ev.guests)} couverts`, done: false });
    items.push({ label: 'Réchauds & bonbonnes de gaz', done: false });
    items.push({ label: 'Thermobox chauds & glacières', done: false });
    return items;
  }

  /* ───────────────────────── seed — mid-shift, Tanger ─────────────────────────
     5+ événements répartis sur tout le pipeline. Le moment de démo : la
     tranche J−7 des fiançailles Idrissi tombe AUJOURD'HUI. Et ce soir,
     l'iftar Tanger Med part en livraison (checklist à moitié chargée). */
  function D(days, h, m) { const d = new Date(NOW + days * DAY); d.setHours(h, m || 0, 0, 0); return d; }

  function mkEvent(cfg) {
    const ev = {
      id: cfg.id, devisRef: cfg.devisRef,
      name: cfg.name, type: cfg.type, guests: cfg.guests,
      date: cfg.date, lieu: cfg.lieu, client: cfg.client, phone: cfg.phone,
      status: cfg.status,
      sentAt: cfg.sentDaysAgo != null ? D(-cfg.sentDaysAgo, 11) : null,
      confirmedAt: cfg.confirmedDaysAgo != null ? D(-cfg.confirmedDaysAgo, 11) : null,
      deliveredAt: cfg.deliveredDaysAgo != null ? D(-cfg.deliveredDaysAgo, 14) : null,
      menu: cfg.menu.slice(), extras: cfg.extras.slice(),
      team: cfg.team || null, loaded: false, lastWa: null,
    };
    ev.tranches = buildTranches(ev);
    (cfg.paid || []).forEach((p, i) => {
      if (p) ev.tranches[i].paid = { method: p.method, at: D(-p.daysAgo, p.h || 11), note: p.note || '' };
    });
    ev.checklist = buildChecklist(ev);
    if (cfg.checkedCount) ev.checklist.forEach((c, i) => { c.done = i < cfg.checkedCount; });
    return ev;
  }

  const EVENTS = pvReal() ? [] : [
    /* livraison de CE SOIR — la moitié du camion est déjà chargée */
    mkEvent({
      id: 'EV-238', devisRef: 'DV-1019', name: 'Iftar entreprise Tanger Med', type: 'entreprise',
      guests: 120, date: D(0, 19, 30), lieu: 'Zone franche Ksar El Majaz · bâtiment B3',
      client: 'Karim Alaoui', phone: '0539 38 12 70',
      status: 'acompte', confirmedDaysAgo: 18,
      menu: ['harira', 'briouates', 'tajine_agneau', 'cornes', 'jus', 'the'],
      extras: ['service', 'vaisselle', 'livraison'],
      paid: [{ method: 'virement', daysAgo: 18 }, { method: 'virement', daysAgo: 7 }, { method: 'virement', daysAgo: 0, h: 9, note: 'réglé ce matin' }],
      team: [{ n: 'Chef Abdellah', lead: true }, { n: 'Saïd · maître d’hôtel', lead: true }, { n: 'Hafsa' }, { n: 'Mounir' }, { n: 'Imane' }, { n: 'Yassine' }, { n: 'Khalid' }, { n: 'Rim' }],
      checkedCount: 5,
    }),
    /* le grand mariage de samedi — 80 % déjà encaissés */
    mkEvent({
      id: 'EV-241', devisRef: 'DV-1021', name: 'Mariage Benjelloun', type: 'mariage',
      guests: 180, date: D(3, 19, 0), lieu: 'Villa Achakar · route du Cap Spartel',
      client: 'Lamia Benjelloun', phone: '0661 44 21 90',
      status: 'acompte', confirmedDaysAgo: 24,
      menu: ['pastilla', 'mechoui', 'couscous', 'patisserie', 'the'],
      extras: ['service', 'nappage', 'vaisselle', 'livraison'],
      paid: [{ method: 'virement', daysAgo: 24 }, { method: 'especes', daysAgo: 4 }],
    }),
    /* LE moment de démo — la tranche J−7 tombe aujourd'hui */
    mkEvent({
      id: 'EV-243', devisRef: 'DV-1023', name: 'Fiançailles Idrissi', type: 'fiancailles',
      guests: 60, date: D(7, 20, 0), lieu: 'Riad Dar Nour · Vieille Montagne',
      client: 'Salwa Idrissi', phone: '0668 23 51 47',
      status: 'acompte', confirmedDaysAgo: 10,
      menu: ['pastilla', 'poulet_mhamer', 'patisserie', 'jus', 'the'],
      extras: ['service', 'nappage', 'livraison'],
      paid: [{ method: 'especes', daysAgo: 10 }],
    }),
    /* confirmé il y a 2 jours, tranche 1 jamais encaissée → en retard */
    mkEvent({
      id: 'EV-244', devisRef: 'DV-1024', name: 'Anniversaire Mme Tazi', type: 'anniversaire',
      guests: 40, date: D(12, 13, 0), lieu: 'Villa Boubana · Tanger',
      client: 'Nadia Tazi', phone: '0677 90 14 28',
      status: 'confirme', confirmedDaysAgo: 2,
      menu: ['salades', 'poisson', 'fruits', 'patisserie', 'sodas', 'the'],
      extras: ['nappage', 'vaisselle'],
      paid: [],
    }),
    /* devis envoyé — en attente de réponse, à relancer */
    mkEvent({
      id: 'EV-245', devisRef: 'DV-1026', name: 'Mariage Chraibi', type: 'mariage',
      guests: 250, date: D(26, 19, 0), lieu: 'Domaine Dar Chraibi · route de Rabat',
      client: 'Omar Chraibi', phone: '0654 18 73 36',
      status: 'devis', sentDaysAgo: 3,
      menu: ['pastilla', 'mechoui', 'couscous', 'cornes', 'fruits', 'the'],
      extras: ['service', 'nappage', 'vaisselle', 'livraison'],
      paid: [],
    }),
    /* livré la semaine dernière — soldé */
    mkEvent({
      id: 'EV-236', devisRef: 'DV-1015', name: 'Anniversaire Skalli', type: 'anniversaire',
      guests: 35, date: D(-9, 13, 0), lieu: 'Villa familiale · Marshan',
      client: 'Rachid Skalli', phone: '0662 31 87 55',
      status: 'livre', confirmedDaysAgo: 30, deliveredDaysAgo: 9,
      menu: ['salades', 'couscous', 'cornes', 'fruits', 'the'],
      extras: ['livraison'],
      paid: [{ method: 'especes', daysAgo: 30 }, { method: 'especes', daysAgo: 16 }, { method: 'carte', daysAgo: 9 }],
    }),
  ];
  const findEvent = (id) => EVENTS.find((e) => e.id === id);
  let evSeq = 246;
  let dvSeq = 1027;

  /* ───────────────────────── state ───────────────────────── */
  const state = {
    view: 'events',
    evFilter: 'tous',
    evQuery: '',
    offline: false, queued: 0,
  };

  /* le devis en cours — la démo ouvre déjà au milieu d'un brouillon */
  const blankDraft = () => ({
    client: '', phone: '', type: 'mariage', guests: 100,
    date: localDate(new Date(NOW + 30 * DAY)), lieu: '',
    menu: [], extras: [],
  });
  let draft = pvReal() ? blankDraft() : {
    client: 'Salma Bennis', phone: '0661 58 24 39', type: 'mariage', guests: 150,
    date: localDate(new Date(NOW + 34 * DAY)), lieu: 'Villa Harris · Malabata',
    menu: ['pastilla', 'tajine_agneau', 'the'], extras: ['service', 'livraison'],
  };
  function draftTotals() {
    const pp = draft.menu.reduce((s, id) => s + DISH[id].price, 0);
    const menuTotal = pp * draft.guests;
    const extrasTotal = draft.extras.reduce((s, id) => s + extraCost(id, draft.guests), 0);
    return { pp, menuTotal, extrasTotal, total: menuTotal + extrasTotal };
  }

  function queueIfOffline(label) {
    if (!state.offline) return false;
    state.queued++;
    renderNet();
    toast(`${label}, enregistré hors-ligne (${state.queued} en attente)`);
    return true;
  }
  /* Journal partagé — serveur (tableau de bord) + reprise après rechargement.
     Le traiteur pointait la tranche sur l'événement et rien d'autre : l'argent
     encaissé n'apparaissait ni sur « En direct » ni dans les KPI, alors que
     c'est ici que la trésorerie du mois se joue. Démo : no-op.
     Pas de reprise de compteur : la référence journalisée est la référence
     BANCAIRE de la tranche, pas un numéro de ticket à incrémenter. */
  function postDay(total, method, label, ref) {
    try {
      if (window.KiwiPosSale) window.KiwiPosSale.record('traiteur', { total, method, label, ref });
    } catch (_) {}
  }

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  function mount(rootEl) {
    root = rootEl;
    root.innerHTML = `
      <aside class="tr-rail">
        <div class="tr-brand">kiwi<i></i></div>
        <div class="tr-venue">
          <div class="tr-venue-name">${pvName('Traiteur Dar Zellij') || 'Traiteur'}</div>
          <div class="tr-venue-sub">${pvReal() ? (pvCity('') || '') : 'Tanger · Mesnana'}<br>Le même Kiwi, <b>un seul compte.</b></div>
        </div>
        <nav class="tr-nav" id="tr-nav">
          <button class="tr-nav-it on" data-tr-view="events"><i data-lucide="calendar"></i><span>Événements</span><b class="tr-nav-badge" id="tr-badge-ev"></b></button>
          <button class="tr-nav-it" data-tr-view="devis"><i data-lucide="clipboard-list"></i><span>Devis</span><b class="tr-nav-badge" id="tr-badge-dv"></b></button>
          <button class="tr-nav-it" data-tr-view="acomptes"><i data-lucide="hand-coins"></i><span>Acomptes</span><b class="tr-nav-badge" id="tr-badge-ac"></b></button>
          <button class="tr-nav-it" data-tr-view="jourj"><i data-lucide="truck"></i><span>Jour J</span><b class="tr-nav-badge" id="tr-badge-jj"></b></button>
        </nav>
        <div class="tr-rail-foot">
          <button class="tr-net" id="tr-net" title="Simuler une coupure réseau">
            <i class="tr-net-dot"></i><span class="tr-net-label">En ligne</span>
          </button>
          <button class="tr-lock" id="tr-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="tr-main">
        <div class="tr-offline-note" id="tr-offline-note" hidden>
          Hors-ligne, les encaissements et statuts sont gardés sur la tablette, synchronisés au retour du réseau.
          <b id="tr-queue-count"></b>
        </div>
        <section class="tr-view is-on" data-tr-panel="events"></section>
        <section class="tr-view" data-tr-panel="devis"></section>
        <section class="tr-view" data-tr-panel="acomptes"></section>
        <section class="tr-view" data-tr-panel="jourj"></section>
      </main>
      <div class="modal-veil" id="tr-veil-detail"><div class="modal tr-mdetail tr-rel" id="tr-detailm"></div></div>
      <div class="modal-veil" id="tr-veil-doc"><div class="modal tr-mdoc tr-rel" id="tr-docm"></div></div>
      <div class="modal-veil" id="tr-veil-wa"><div class="modal tr-mwa tr-rel" id="tr-wam"></div></div>
      <div class="modal-veil" id="tr-veil-pay"><div class="modal tr-mpay tr-rel" id="tr-paym"></div></div>`;

    $('#tr-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-tr-view]');
      if (b) switchView(b.dataset.trView);
    });
    $('#tr-lock', root).addEventListener('click', () => window.KiwiPosDispatch.lock());
    $('#tr-net', root).addEventListener('click', toggleOffline);
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });
    renderAll();
  }

  const openVeil = (id) => { const v = $(id, root); v.classList.add('is-open'); return v; };
  const closeVeil = (v) => { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); };

  /* ═══════════════════════ NAV ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.tr-nav-it', root).forEach((b) => b.classList.toggle('on', b.dataset.trView === view));
    $$('.tr-view', root).forEach((p) => p.classList.toggle('is-on', p.dataset.trPanel === view));
    if (view === 'events') renderEvents();
    if (view === 'devis') renderDevis();
    if (view === 'acomptes') renderAcomptes();
    if (view === 'jourj') renderJourJ();
    icons();
  }

  function renderBadges() {
    const upcoming = EVENTS.filter((e) => e.status !== 'livre').length;
    const devisCt = EVENTS.filter((e) => e.status === 'devis').length;
    const dueCt = dueNowTranches().length;
    const todayCt = EVENTS.filter((e) => e.status !== 'devis' && e.status !== 'livre' && isToday(e.date)).length;
    const set = (id, n, hot) => {
      const el = $(id, root);
      el.textContent = n || '';
      el.style.display = n ? '' : 'none';
      el.classList.toggle('is-hot', !!hot && n > 0);
    };
    set('#tr-badge-ev', upcoming, false);
    set('#tr-badge-dv', devisCt, false);
    set('#tr-badge-ac', dueCt, true);
    set('#tr-badge-jj', todayCt, false);
  }

  function refreshAll() {
    renderBadges();
    if (state.view === 'events') renderEvents();
    if (state.view === 'devis') renderDevis();
    if (state.view === 'acomptes') renderAcomptes();
    if (state.view === 'jourj') renderJourJ();
    icons();
  }

  function renderAll() {
    renderBadges();
    renderNet();
    switchView(state.view);
  }

  /* ═══════════════════════ shared fragments ═══════════════════════ */
  const stPill = (ev) => `<span class="tr-st st-${ev.status}">${STATUSES[ev.status].label}</span>`;
  const typePill = (ev) => `<span class="tr-evtype"><i data-lucide="${TYPES[ev.type].icon}"></i>${TYPES[ev.type].label}</span>`;

  function payPill(ev) {
    if (ev.status === 'devis') {
      return `<span class="tr-pill">Devis · ${fmtMAD(evTotals(ev).total)}</span>`;
    }
    const due = dueTotal(ev);
    if (due <= 0) return '<span class="tr-pill ok">Soldé</span>';
    const states = ev.tranches.map((t) => trancheState(ev, t));
    if (states.includes('late')) return `<span class="tr-pill due">Échéance en retard · ${fmtMAD(nextTranche(ev).amount)}</span>`;
    if (states.includes('today')) return `<span class="tr-pill warn">À encaisser aujourd’hui · ${fmtMAD(nextTranche(ev).amount)}</span>`;
    const pct = Math.round((paidTotal(ev) / evTotals(ev).total) * 100);
    return `<span class="tr-pill ok">Payé ${pct} %</span>`;
  }

  const trancheDots = (ev) => `<span class="tr-tdots">${ev.tranches.map((t) => {
    const st = trancheState(ev, t);
    return `<i class="tr-tdot ${st === 'paid' ? 'paid' : st === 'today' ? 'today' : st === 'late' ? 'late' : ''}"></i>`;
  }).join('')}</span>`;

  /* ═══════════════════════ ÉVÉNEMENTS ═══════════════════════ */
  function evMatches(ev, q) {
    if (!q) return true;
    const l = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    return ev.name.toLowerCase().includes(l) || ev.client.toLowerCase().includes(l) ||
      ev.lieu.toLowerCase().includes(l) || ev.id.toLowerCase().includes(l) ||
      (digits.length >= 2 && ev.phone.replace(/\D/g, '').includes(digits));
  }

  function sortedEvents() {
    return EVENTS.slice().sort((a, b) => {
      const al = a.status === 'livre' ? 1 : 0, bl = b.status === 'livre' ? 1 : 0;
      if (al !== bl) return al - bl;
      return al ? b.date - a.date : a.date - b.date;
    });
  }

  function renderEvents() {
    const panel = $('[data-tr-panel="events"]', root);
    const due = dueNowTranches();
    const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, EVENTS.filter((e) => e.status === s).length]));
    const list = sortedEvents().filter((e) =>
      (state.evFilter === 'tous' || e.status === state.evFilter) && evMatches(e, state.evQuery));

    panel.innerHTML = `
      <header class="tr-head">
        <div><h1>Événements</h1><div class="tr-head-sub">${fmtDT(new Date())} · du devis au jour J, tout le pipeline</div></div>
        <div class="tr-search"><i data-lucide="search"></i>
          <input id="tr-ev-q" placeholder="Client, lieu, téléphone…" value="${esc(state.evQuery)}" /></div>
      </header>
      ${due.length ? `
      <div class="tr-duebar">
        <i data-lucide="hand-coins"></i>
        <div class="tr-duebar-txt">${due.length > 1 ? `<b>${due.length} échéances</b> à encaisser, la prochaine : ` : 'À encaisser aujourd’hui, '}
          <b>${esc(due[0].ev.name)}</b> · tranche ${due[0].t.pct} % · <span class="amt">${fmtMAD(due[0].t.amount)}</span>${due[0].st === 'late' ? ' · en retard' : ''}</div>
        <button class="tr-btn primary" id="tr-due-pay"><i data-lucide="banknote"></i>Encaisser</button>
        <button class="tr-btn secondary" id="tr-due-all">Échéanciers</button>
      </div>` : ''}
      <div class="tr-cats" id="tr-ev-cats">
        <button class="tr-cat ${state.evFilter === 'tous' ? 'on' : ''}" data-tr-f="tous">Tous <span class="tr-cat-ct">${EVENTS.length}</span></button>
        ${STATUS_ORDER.map((s) => `<button class="tr-cat ${state.evFilter === s ? 'on' : ''}" data-tr-f="${s}">${STATUSES[s].label} <span class="tr-cat-ct">${counts[s]}</span></button>`).join('')}
      </div>
      <div class="tr-evscroll"><div class="tr-evlist">
        ${list.map((ev, i) => evCard(ev, i)).join('') || `<div class="tr-empty">Aucun événement pour « ${esc(state.evQuery)} », vérifiez le nom ou le filtre.</div>`}
      </div></div>`;

    $('#tr-ev-q', panel).oninput = (e) => {
      state.evQuery = e.target.value;
      renderEvents(); icons();
      const i = $('#tr-ev-q', panel); i.focus(); const v = i.value; i.value = ''; i.value = v;
    };
    $('#tr-ev-cats', panel).onclick = (e) => {
      const b = e.target.closest('[data-tr-f]');
      if (!b) return;
      state.evFilter = b.dataset.trF;
      renderEvents(); icons();
    };
    const duePay = $('#tr-due-pay', panel);
    if (duePay) duePay.onclick = () => openPay(due[0].ev, due[0].t, {});
    const dueAll = $('#tr-due-all', panel);
    if (dueAll) dueAll.onclick = () => switchView('acomptes');
    panel.onclick = (e) => {
      if (e.target.closest('#tr-ev-cats') || e.target.closest('.tr-duebar') || e.target.closest('.tr-search')) return;
      const c = e.target.closest('[data-tr-ev]');
      if (c) openDetail(c.dataset.trEv);
    };
    icons();
  }

  function evCard(ev, i) {
    const today = isToday(ev.date);
    return `<button class="tr-evcard ${today ? 'is-today' : ''} ${ev.status === 'livre' ? 'is-past' : ''}" data-tr-ev="${ev.id}" style="--i:${i}">
      <span class="tr-evdate"><b>${ev.date.getDate()}</b><span>${MONTHS[ev.date.getMonth()]}</span><i>${today ? 'ce soir' : esc(relDay(ev.date))}</i></span>
      <span class="tr-evmid">
        <span class="tr-evname">${esc(ev.name)} ${typePill(ev)}</span>
        <span class="tr-evsub"><i data-lucide="map-pin"></i>${esc(ev.lieu)} · ${timeOf(ev.date)} <span class="sep">·</span> <i data-lucide="user"></i>${esc(ev.client)}</span>
        <span class="tr-evmeta">
          <span class="tr-pill"><i data-lucide="users"></i>${ev.guests} pers</span>
          <span class="tr-pill">${perPerson(ev)} MAD / pers</span>
          ${payPill(ev)}
          ${ev.status === 'devis' && ev.sentAt ? `<span class="tr-pill">envoyé ${esc(relDay(ev.sentAt))}</span>` : ''}
        </span>
      </span>
      <span class="tr-evright">
        <span class="tr-evtotal">${fmtMAD(evTotals(ev).total)}</span>
        ${stPill(ev)}
        ${trancheDots(ev)}
      </span>
    </button>`;
  }

  /* ---------- détail événement ---------- */
  function openDetail(evId) {
    const ev = findEvent(evId);
    if (!ev) return;
    const el = $('#tr-detailm', root);
    const { pp, menuTotal, extrasTotal, total } = evTotals(ev);
    const nt = nextTranche(ev);
    const due = dueTotal(ev);

    el.innerHTML = `
      <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="tr-dt-head">
        <h3>${esc(ev.name)} ${stPill(ev)}</h3>
        <div class="tr-dt-sub">
          ${typePill(ev)}
          <i data-lucide="calendar"></i>${esc(fmtDay(ev.date))} · ${timeOf(ev.date)} (${esc(relDay(ev.date))})
          <span class="sep">·</span><i data-lucide="map-pin"></i>${esc(ev.lieu)}
        </div>
        <div class="tr-dt-sub">
          <i data-lucide="user"></i>${esc(ev.client)} <span class="sep">·</span> <i data-lucide="phone"></i>${esc(ev.phone)}
          <span class="sep">·</span><i data-lucide="users"></i>${ev.guests} invités
          <span class="sep">·</span>devis ${esc(ev.devisRef)}
        </div>
      </div>
      <div class="tr-dt-body">
        <div>
          <div class="tr-dt-sec"><i data-lucide="utensils"></i>Menu, ${pp} MAD / personne</div>
          <div class="tr-dt-menu">
            ${ev.menu.map((id) => `<div class="tr-dt-line"><span class="art">${ART[id] || ''}</span><span class="nm">${esc(DISH[id].label)}</span><span class="vl">${DISH[id].price} MAD</span></div>`).join('')}
          </div>
          <div class="tr-dt-tot">
            <div class="row"><span>Menu · ${pp} MAD × ${ev.guests}</span><span class="vl">${fmtMAD(menuTotal)}</span></div>
            ${ev.extras.map((id) => `<div class="row"><span>${esc(EXTRA[id].label)} · ${esc(extraLine(id, ev.guests))}</span><span class="vl">${fmtMAD(extraCost(id, ev.guests))}</span></div>`).join('')}
            <div class="row big"><span>Total</span><span class="vl">${fmtMAD(total)}</span></div>
            ${due > 0 && ev.status !== 'devis' ? `<div class="row"><span>Reste à encaisser</span><span class="vl" style="color:var(--danger-mute);font-weight:700;">${fmtMAD(due)}</span></div>` : ''}
          </div>
        </div>
        <div>
          <div class="tr-dt-sec"><i data-lucide="hand-coins"></i>Échéancier 30 / 50 / 20</div>
          ${ev.status === 'devis'
            ? `<div class="tr-ech-off">L’échéancier s’active à la confirmation :<br>30 % à la confirmation · 50 % à J−7 · solde le jour J.</div>
               <div class="tr-ech" style="margin-top:7px;">${ev.tranches.map((t) => `
                 <div class="tr-ech-row"><span class="tr-ech-dot"></span>
                   <span class="tr-ech-mid"><span class="tr-ech-lbl">${t.pct} % · ${esc(t.label)}</span></span>
                   <span class="tr-ech-amt">${fmtMAD(t.amount)}</span></div>`).join('')}</div>`
            : `<div class="tr-ech">${ev.tranches.map((t) => echRow(ev, t)).join('')}</div>`}
        </div>
      </div>
      <div class="tr-dt-actions">
        ${ev.status === 'devis' ? `
          <button class="tr-btn secondary" id="tr-dt-relance"><i data-lucide="refresh-cw"></i>Relancer sur WhatsApp</button>
          <button class="tr-btn secondary" id="tr-dt-doc"><i data-lucide="file-text"></i>Voir le devis</button>
          <button class="tr-btn primary" id="tr-dt-confirm"><i data-lucide="check"></i>Marquer confirmé</button>` : ''}
        ${ev.status === 'confirme' || ev.status === 'acompte' ? `
          ${nt ? `<button class="tr-btn primary ${trancheState(ev, nt) !== 'next' ? 'is-urgent' : ''}" id="tr-dt-pay"><i data-lucide="banknote"></i>Encaisser ${nt.pct} % · ${fmtMAD(nt.amount)}</button>` : ''}
          ${nt ? `<button class="tr-btn secondary" id="tr-dt-rappel"><i data-lucide="message-circle"></i>Rappel WhatsApp</button>` : '<span class="tr-pill ok" style="align-self:center;">Soldé, khlass</span>'}
          <button class="tr-btn secondary" id="tr-dt-doc"><i data-lucide="file-text"></i>Devis</button>
          ${isToday(ev.date) ? `<button class="tr-btn secondary" id="tr-dt-bon"><i data-lucide="truck"></i>Bon de livraison</button>` : ''}` : ''}
        ${ev.status === 'livre' ? `
          <button class="tr-btn secondary" id="tr-dt-recap"><i data-lucide="printer"></i>Imprimer le récapitulatif</button>
          <span class="tr-pill ok" style="align-self:center;">Livré ${ev.deliveredAt ? esc(fmtDay(ev.deliveredAt)) : ''} · soldé</span>` : ''}
      </div>`;

    openVeil('#tr-veil-detail');
    icons();
    $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-detail'); });

    const relance = $('#tr-dt-relance', el);
    if (relance) relance.onclick = () => openWa(ev, 'relance');
    const confirm = $('#tr-dt-confirm', el);
    if (confirm) confirm.onclick = () => {
      ev.status = 'confirme';
      ev.confirmedAt = new Date();
      ev.tranches[0].due = new Date();
      queueIfOffline('Confirmation événement');
      toast(`${ev.name} confirmé, tranche 1 (30 %) à encaisser`);
      openDetail(ev.id);
      refreshAll();
    };
    const doc = $('#tr-dt-doc', el);
    if (doc) doc.onclick = () => openDoc('devis', ev);
    const pay = $('#tr-dt-pay', el);
    if (pay) pay.onclick = () => openPay(ev, nt, { onDone: () => openDetail(ev.id) });
    const rappel = $('#tr-dt-rappel', el);
    if (rappel) rappel.onclick = () => openWa(ev, 'rappel');
    const bon = $('#tr-dt-bon', el);
    if (bon) bon.onclick = () => { closeVeil('#tr-veil-detail'); switchView('jourj'); };
    const recap = $('#tr-dt-recap', el);
    if (recap) recap.onclick = () => openDoc('recap', ev);
  }

  function echRow(ev, t) {
    const st = trancheState(ev, t);
    const when = t.paid
      ? `payé ${fmtDay(t.paid.at)} · ${METHODS[t.paid.method]}${t.paid.note ? `, ${t.paid.note}` : ''}`
      : st === 'today' ? 'à encaisser aujourd’hui'
      : st === 'late' ? `en retard de ${-calDiff(t.due)} j`
      : t.due ? `prévu ${fmtDay(t.due)}` : 'à la confirmation';
    return `<div class="tr-ech-row ${st}">
      <span class="tr-ech-dot">${st === 'paid' ? '<i data-lucide="check"></i>' : st === 'today' || st === 'late' ? '<i data-lucide="hand-coins"></i>' : ''}</span>
      <span class="tr-ech-mid"><span class="tr-ech-lbl">${t.pct} % · ${esc(t.label)}</span><span class="tr-ech-when">${esc(when)}</span></span>
      <span class="tr-ech-amt">${fmtMAD(t.amount)}</span>
    </div>`;
  }

  /* ═══════════════════════ DEVIS — le builder ═══════════════════════ */
  function renderDevis() {
    const panel = $('[data-tr-panel="devis"]', root);
    panel.innerHTML = `
      <div class="tr-build">
        <header class="tr-head">
          <div><h1>Nouveau devis</h1><div class="tr-head-sub">Composez le menu par personne, le total suit le nombre d’invités</div></div>
          <div class="tr-head-sub" style="padding-bottom:2px;">Touchez un plat pour l’ajouter au menu</div>
        </header>
        <div class="tr-build-scroll" id="tr-build-scroll">
          ${COURSES.map((c) => `
            <div class="tr-course-head">${esc(c.label)} <span class="pp">· prix par personne</span></div>
            <div class="tr-dishgrid">
              ${DISHES.filter((d) => d.course === c.id).map((d, i) => `
                <button class="tr-dish ${draft.menu.includes(d.id) ? 'on' : ''}" data-tr-dish="${d.id}" style="--i:${i}">
                  <span class="tr-dish-tick"><i data-lucide="check"></i></span>
                  <span class="tr-dish-art">${ART[d.id] || ''}</span>
                  <span class="tr-dish-name">${esc(d.label)}</span>
                  <span class="tr-dish-sub">${esc(d.sub)}</span>
                  <span class="tr-dish-price">+${d.price} MAD / pers</span>
                  ${d.flag ? `<span class="tr-dish-flag">${esc(d.flag)}</span>` : ''}
                </button>`).join('')}
            </div>`).join('')}
          <div class="tr-course-head">Extras <span class="pp">· calculés sur ${`<span id="tr-extras-g">${draft.guests}</span>`} invités</span></div>
          <div class="tr-extras" id="tr-extras"></div>
        </div>
      </div>
      <aside class="tr-quote">
        <div class="tr-q-scroll">
          <div class="tr-q-head">
            <div><span class="tr-q-title">Devis</span> <span class="tr-q-num">· DV-${dvSeq}</span></div>
            <button class="tr-q-reset" id="tr-q-reset">Vider</button>
          </div>
          <div class="tr-f">
            <div class="tr-f-lbl">Client</div>
            <div class="tr-row-2">
              <input class="tr-in" id="tr-q-client" placeholder="Nom du client" value="${esc(draft.client)}" />
              <input class="tr-in" id="tr-q-phone" inputmode="tel" placeholder="06…" value="${esc(draft.phone)}" />
            </div>
          </div>
          <div class="tr-f">
            <div class="tr-f-lbl">Type d’événement</div>
            <div class="tr-seg" data-lens-demo id="tr-q-type">
              ${Object.entries(TYPES).map(([id, t]) => `<button class="tr-seg-it ${draft.type === id ? 'on' : ''}" data-lens-item data-tr-type="${id}">${t.label}</button>`).join('')}
            </div>
          </div>
          <div class="tr-row-2">
            <div class="tr-f">
              <div class="tr-f-lbl">Invités</div>
              <div class="tr-stepper">
                <button id="tr-q-gminus" aria-label="Moins">−10</button>
                <b id="tr-q-gval">${draft.guests}<small>pers</small></b>
                <button id="tr-q-gplus" aria-label="Plus">+10</button>
              </div>
            </div>
            <div class="tr-f">
              <div class="tr-f-lbl">Date</div>
              <input class="tr-in" id="tr-q-date" type="date" value="${esc(draft.date)}" style="padding:12px;" />
            </div>
          </div>
          <div class="tr-f">
            <div class="tr-f-lbl">Lieu <span class="opt">· villa, riad, salle…</span></div>
            <input class="tr-in" id="tr-q-lieu" placeholder="Ex. Villa Achakar, Cap Spartel" value="${esc(draft.lieu)}" />
          </div>
          <div id="tr-q-sum"></div>
        </div>
        <div class="tr-q-foot" id="tr-q-foot"></div>
      </aside>`;

    /* dish toggles — only flip classes + re-render the quote (keeps scroll) */
    $('#tr-build-scroll', panel).addEventListener('click', (e) => {
      const d = e.target.closest('[data-tr-dish]');
      if (d) {
        const id = d.dataset.trDish;
        const i = draft.menu.indexOf(id);
        if (i >= 0) draft.menu.splice(i, 1); else draft.menu.push(id);
        d.classList.toggle('on', i < 0);
        renderQuote(); icons();
        return;
      }
      const x = e.target.closest('[data-tr-extra]');
      if (x) {
        const id = x.dataset.trExtra;
        const i = draft.extras.indexOf(id);
        if (i >= 0) draft.extras.splice(i, 1); else draft.extras.push(id);
        renderExtras(); renderQuote(); icons();
      }
    });
    $('#tr-q-reset', panel).onclick = () => {
      draft = blankDraft();
      renderDevis(); icons();
      toast('Devis vidé, nouvelle feuille');
    };
    $('#tr-q-client', panel).oninput = (e) => { draft.client = e.target.value; };
    $('#tr-q-phone', panel).oninput = (e) => { draft.phone = e.target.value; };
    $('#tr-q-date', panel).onchange = (e) => { draft.date = e.target.value; renderQuote(); icons(); };
    $('#tr-q-lieu', panel).oninput = (e) => { draft.lieu = e.target.value; };
    $('#tr-q-type', panel).onclick = (e) => {
      const b = e.target.closest('[data-tr-type]');
      if (!b) return;
      draft.type = b.dataset.trType;
      $$('[data-tr-type]', panel).forEach((x) => x.classList.toggle('on', x === b));
    };
    $('#tr-q-gminus', panel).onclick = () => { if (draft.guests > 10) { draft.guests = Math.max(10, draft.guests - 10); guestsChanged(panel); } };
    $('#tr-q-gplus', panel).onclick = () => { draft.guests = Math.min(2000, draft.guests + 10); guestsChanged(panel); };

    renderExtras();
    renderQuote();
    icons();
    lens();
  }

  function guestsChanged(panel) {
    $('#tr-q-gval', panel).innerHTML = `${draft.guests}<small>pers</small>`;
    const g = $('#tr-extras-g', panel);
    if (g) g.textContent = draft.guests;
    renderExtras(); renderQuote(); icons();
  }

  function renderExtras() {
    const wrap = $('#tr-extras', root);
    if (!wrap) return;
    wrap.innerHTML = EXTRAS.map((x) => {
      const on = draft.extras.includes(x.id);
      return `<button class="tr-extra ${on ? 'on' : ''}" data-tr-extra="${x.id}">
        <span class="tr-extra-tick"><i data-lucide="check"></i></span>
        <span class="tr-extra-mid"><span class="tr-extra-name">${esc(x.label)}</span><span class="tr-extra-sub">${esc(x.sub)}</span></span>
        <span class="tr-extra-amt">${fmtMAD(extraCost(x.id, draft.guests))}<small>${esc(extraLine(x.id, draft.guests))}</small></span>
      </button>`;
    }).join('');
  }

  function renderQuote() {
    const { pp, menuTotal, extrasTotal, total } = draftTotals();
    const sum = $('#tr-q-sum', root);
    const foot = $('#tr-q-foot', root);
    if (!sum || !foot) return;
    const byCourse = COURSES.map((c) => ({ c, items: draft.menu.filter((id) => DISH[id].course === c.id) })).filter((x) => x.items.length);
    const t1 = Math.round(total * 0.3), t2 = Math.round(total * 0.5);

    sum.innerHTML = `
      <div class="tr-q-sum">
        ${draft.menu.length ? `
          ${byCourse.map((x) => x.items.map((id) => `<div class="tr-q-line"><span class="nm">${esc(DISH[id].label)}</span><span class="vl">${DISH[id].price} MAD</span></div>`).join('')).join('')}
          <div class="tr-q-line is-pp"><span class="nm">Menu / personne</span><span class="vl">${pp} MAD</span></div>`
        : `<div class="tr-q-empty">Le menu est vide.<br>Touchez les plats à gauche, le prix par personne se construit tout seul.</div>`}
        ${draft.extras.map((id) => `<div class="tr-q-line"><span class="nm">${esc(EXTRA[id].label)}</span><span class="vl">${fmtMAD(extraCost(id, draft.guests))}</span></div>`).join('')}
      </div>
      ${total > 0 ? `
      <div class="tr-q-ech">
        <div class="tr-q-ech-head"><i data-lucide="hand-coins"></i>Échéancier proposé</div>
        <div class="tr-q-ech-row"><span>30 % à la confirmation</span><b>${fmtMAD(t1)}</b></div>
        <div class="tr-q-ech-row"><span>50 % à J−7</span><b>${fmtMAD(t2)}</b></div>
        <div class="tr-q-ech-row"><span>Solde le jour J</span><b>${fmtMAD(total - t1 - t2)}</b></div>
      </div>` : ''}`;

    foot.innerHTML = `
      <div class="tr-q-tot-row"><span>Menu ${pp} MAD × ${draft.guests} invités</span><span>${fmtMAD(menuTotal)}</span></div>
      <div class="tr-q-tot-row"><span>Extras</span><span>${fmtMAD(extrasTotal)}</span></div>
      <div class="tr-q-total"><span class="lbl">Total devis</span><span class="val">${fmtMAD(total)}</span></div>
      <div class="tr-q-ctas">
        <button class="tr-btn secondary" id="tr-q-print"><i data-lucide="printer"></i>Imprimer</button>
        <button class="tr-btn primary" id="tr-q-send" ${draft.menu.length ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer par WhatsApp</button>
      </div>`;
    $('#tr-q-print', foot).onclick = () => {
      if (!draft.menu.length) { toast('Choisissez au moins un plat avant d’imprimer'); return; }
      if (!draft.client.trim()) { toast('Le nom du client est requis sur le devis'); return; }
      openDoc('devis', draftAsEvent());
    };
    $('#tr-q-send', foot).onclick = () => {
      if (!draft.menu.length) { toast('Choisissez au moins un plat'); return; }
      if (!draft.client.trim()) { toast('Le nom du client est requis'); return; }
      openWa(draftAsEvent(), 'devis');
    };
  }

  /* draft → event-shaped object (not yet in EVENTS) */
  function draftAsEvent() {
    const d = draft.date ? new Date(draft.date + 'T19:00:00') : new Date(NOW + 30 * DAY);
    const ev = {
      id: `EV-${evSeq}`, devisRef: `DV-${dvSeq}`,
      name: `${TYPES[draft.type].label} ${lastName(draft.client) || 'sans nom'}`,
      type: draft.type, guests: draft.guests,
      date: d, lieu: draft.lieu.trim() || 'Lieu à confirmer',
      client: draft.client.trim(), phone: draft.phone.trim(),
      status: 'devis', sentAt: null, confirmedAt: null, deliveredAt: null,
      menu: draft.menu.slice(), extras: draft.extras.slice(),
      team: null, loaded: false, lastWa: null,
    };
    ev.tranches = buildTranches(ev);
    ev.checklist = buildChecklist(ev);
    return ev;
  }

  function registerDevis(ev) {
    ev.sentAt = new Date();
    EVENTS.push(ev);
    evSeq++; dvSeq++;
    draft = blankDraft();
    queueIfOffline(`Devis ${ev.devisRef}`);
    /* « envoyé » était faux : à ce stade le devis est seulement enregistré côté
       traiteur, c'est le brouillon WhatsApp ouvert juste après qui part. */
    toast(`Devis ${ev.devisRef} enregistré pour ${ev.client || 'client'}, suivi dans Événements`);
    state.evFilter = 'tous';
    switchView('events');
    renderBadges();
  }

  /* ═══════════════════════ ACOMPTES — échéanciers ═══════════════════════ */
  function renderAcomptes() {
    const panel = $('[data-tr-panel="acomptes"]', root);
    const active = EVENTS.filter((e) => e.status === 'confirme' || e.status === 'acompte')
      .sort((a, b) => {
        const w = (ev) => {
          const sts = ev.tranches.map((t) => trancheState(ev, t));
          if (sts.includes('late')) return 0;
          if (sts.includes('today')) return 1;
          return 2;
        };
        return w(a) - w(b) || a.date - b.date;
      });
    const settled = EVENTS.filter((e) => e.status === 'livre');
    const devisCt = EVENTS.filter((e) => e.status === 'devis').length;

    const encaisse = EVENTS.reduce((s, e) => s + paidTotal(e), 0);
    let sous7 = 0, retard = 0;
    EVENTS.forEach((ev) => {
      if (ev.status === 'devis' || ev.status === 'livre') return;
      ev.tranches.forEach((t) => {
        if (t.paid || !t.due) return;
        const n = calDiff(t.due);
        if (n < 0) retard += t.amount;
        else if (n <= 7) sous7 += t.amount;
      });
    });

    panel.innerHTML = `
      <header class="tr-head">
        <div><h1>Acomptes & échéanciers</h1><div class="tr-head-sub">La règle de la maison, 30 % à la confirmation · 50 % à J−7 · solde le jour J</div></div>
      </header>
      <div class="tr-payscroll">
        <div class="tr-stats">
          <div class="tr-stat is-ok"><div class="tr-stat-lbl"><i data-lucide="coins"></i>Encaissé</div><div class="tr-stat-val">${fmtMAD(encaisse)}</div><div class="tr-stat-sub">toutes échéances confondues</div></div>
          <div class="tr-stat"><div class="tr-stat-lbl"><i data-lucide="calendar-clock"></i>À encaisser sous 7 jours</div><div class="tr-stat-val">${fmtMAD(sous7)}</div><div class="tr-stat-sub">échéances d’aujourd’hui comprises</div></div>
          <div class="tr-stat is-due"><div class="tr-stat-lbl"><i data-lucide="clock"></i>En retard</div><div class="tr-stat-val">${fmtMAD(retard)}</div><div class="tr-stat-sub">${retard ? 'à relancer sans attendre' : 'rien, tout est propre'}</div></div>
        </div>
        <div class="tr-paylist">
          ${active.map((ev) => paycCard(ev)).join('') || '<div class="tr-empty">Aucun échéancier actif, confirmez un devis pour démarrer le 30 / 50 / 20.</div>'}
          ${devisCt ? `<div class="tr-payc-note" style="padding:0 4px;"><i data-lucide="clipboard-list"></i>${devisCt} devis envoyé${devisCt > 1 ? 's' : ''}, l’échéancier s’activera à la confirmation.</div>` : ''}
          ${settled.map((ev) => `
            <div class="tr-payc is-settled">
              <div class="tr-payc-who"><b>${esc(ev.name)}</b> <span>· ${ev.guests} pers · livré ${ev.deliveredAt ? esc(fmtDay(ev.deliveredAt)) : ''}</span></div>
              <span class="tr-pill ok">Soldé · ${fmtMAD(evTotals(ev).total)}</span>
              <button class="tr-btn ghost" data-tr-recap="${ev.id}" style="padding:8px 11px;font-size:12px;"><i data-lucide="printer"></i>Récap</button>
            </div>`).join('')}
        </div>
      </div>`;

    panel.onclick = (e) => {
      const pay = e.target.closest('[data-tr-paytr]');
      if (pay) {
        const ev = findEvent(pay.dataset.trPaytr);
        const t = nextTranche(ev);
        if (t) openPay(ev, t, {});
        return;
      }
      const wa = e.target.closest('[data-tr-watr]');
      if (wa) { openWa(findEvent(wa.dataset.trWatr), 'rappel'); return; }
      const recap = e.target.closest('[data-tr-recap]');
      if (recap) { openDoc('recap', findEvent(recap.dataset.trRecap)); return; }
      const who = e.target.closest('[data-tr-evdetail]');
      if (who) openDetail(who.dataset.trEvdetail);
    };
    icons();
  }

  function paycCard(ev) {
    const { total } = evTotals(ev);
    const paid = paidTotal(ev);
    const nt = nextTranche(ev);
    const sts = ev.tranches.map((t) => trancheState(ev, t));
    const hot = sts.includes('today') || sts.includes('late');
    return `<div class="tr-payc ${hot ? 'is-due' : ''}">
      <div class="tr-payc-top">
        <button class="tr-payc-who" data-tr-evdetail="${ev.id}" style="text-align:left;">
          <b>${esc(ev.name)}</b> <span>· ${ev.guests} pers · ${esc(fmtDay(ev.date))} (${esc(relDay(ev.date))})</span>
        </button>
        <div class="tr-payc-amt"><b>${fmtMAD(paid)} / ${fmtMAD(total)}</b><span>encaissé</span></div>
      </div>
      <div class="tr-prog"><i style="width:${total ? Math.round((paid / total) * 100) : 0}%"></i></div>
      <div class="tr-tl">
        ${ev.tranches.map((t) => {
          const st = trancheState(ev, t);
          const when = t.paid ? `payé ${fmtDay(t.paid.at)} · ${METHODS[t.paid.method]}`
            : st === 'today' ? 'aujourd’hui'
            : st === 'late' ? `en retard de ${-calDiff(t.due)} j`
            : t.due ? fmtDay(t.due) : 'à la confirmation';
          return `<div class="tr-tl-node ${st}">
            <div class="tr-tl-dot">${st === 'paid' ? '<i data-lucide="check"></i>' : ''}</div>
            <div class="tr-tl-pct">${t.pct} %</div>
            <div class="tr-tl-lbl">${esc(t.label)}</div>
            <div class="tr-tl-amt">${fmtMAD(t.amount)}</div>
            <div class="tr-tl-when">${esc(when)}</div>
          </div>`;
        }).join('')}
      </div>
      ${nt ? `<div class="tr-payc-actions">
        <button class="tr-btn primary ${hot ? 'is-urgent' : ''}" data-tr-paytr="${ev.id}"><i data-lucide="banknote"></i>Encaisser la tranche ${nt.pct} % · ${fmtMAD(nt.amount)}</button>
        <button class="tr-btn secondary" data-tr-watr="${ev.id}"><i data-lucide="message-circle"></i>Rappel WhatsApp</button>
      </div>` : `<div class="tr-payc-note"><i data-lucide="check-check"></i>Soldé, l’événement est entièrement payé, khlass.</div>`}
    </div>`;
  }

  /* ═══════════════════════ JOUR J — bons de livraison ═══════════════════════ */
  function renderJourJ() {
    const panel = $('[data-tr-panel="jourj"]', root);
    const todays = EVENTS.filter((e) => e.status !== 'devis' && isToday(e.date));
    const next = EVENTS.filter((e) => e.status !== 'devis' && e.status !== 'livre' && calDiff(e.date) > 0)
      .sort((a, b) => a.date - b.date).slice(0, 4);

    panel.innerHTML = `
      <header class="tr-head">
        <div><h1>Jour J, livraisons</h1><div class="tr-head-sub">${esc(fmtDay(new Date()))} · quantités, équipe et chargement du service</div></div>
      </header>
      <div class="tr-blscroll">
        ${todays.map((ev) => blCard(ev)).join('') || `<div class="tr-empty">Aucune livraison aujourd’hui.<br>Le bon de livraison du jour apparaît ici, avec sa checklist de chargement.</div>`}
        ${next.length ? `<div class="tr-next-head">À préparer ensuite</div>
          ${next.map((ev) => `
            <button class="tr-next" data-tr-ev="${ev.id}" style="margin-bottom:8px;">
              <b>${esc(ev.name)}</b><span>· ${ev.guests} pers · ${esc(ev.lieu)}</span>
              <span class="when">${esc(fmtDay(ev.date))} · ${esc(relDay(ev.date))}</span>
            </button>`).join('')}` : ''}
      </div>`;

    panel.onclick = (e) => {
      const chk = e.target.closest('[data-tr-chk]');
      if (chk) {
        const [evId, idx] = chk.dataset.trChk.split('|');
        const ev = findEvent(evId);
        if (ev.loaded || ev.status === 'livre') { toast('Camion déjà parti, le bon est signé'); return; }
        ev.checklist[+idx].done = !ev.checklist[+idx].done;
        queueIfOffline('Checklist chargement');
        renderJourJ(); icons();
        return;
      }
      const depart = e.target.closest('[data-tr-depart]');
      if (depart) {
        const ev = findEvent(depart.dataset.trDepart);
        if (!ev.checklist.every((c) => c.done)) { toast('Chargement incomplet, cochez toute la checklist d’abord'); return; }
        ev.loaded = true;
        ev.departedAt = new Date();
        queueIfOffline('Départ camion');
        toast(`Camion parti pour ${ev.lieu}, bon de livraison signé`);
        renderJourJ(); icons();
        setTimeout(() => openWa(ev, 'route'), 450);
        return;
      }
      const deliver = e.target.closest('[data-tr-deliver]');
      if (deliver) {
        const ev = findEvent(deliver.dataset.trDeliver);
        const due = dueTotal(ev);
        if (due > 0) {
          const t = nextTranche(ev);
          toast(`Solde ${fmtMAD(due)} à encaisser avant la clôture`);
          openPay(ev, t, { onDone: () => { if (dueTotal(ev) <= 0) markDelivered(ev); } });
        } else {
          markDelivered(ev);
        }
        return;
      }
      const bon = e.target.closest('[data-tr-bon]');
      if (bon) { openDoc('bon', findEvent(bon.dataset.trBon)); return; }
      const wa = e.target.closest('[data-tr-waroute]');
      if (wa) { openWa(findEvent(wa.dataset.trWaroute), 'route'); return; }
      const card = e.target.closest('[data-tr-ev]');
      if (card) openDetail(card.dataset.trEv);
    };
    icons();
  }

  function markDelivered(ev) {
    ev.status = 'livre';
    ev.deliveredAt = new Date();
    queueIfOffline('Livraison');
    toast(`${ev.name} livré, choukran l’équipe`);
    refreshAll();
  }

  function blCard(ev) {
    const doneCt = ev.checklist.filter((c) => c.done).length;
    const allDone = doneCt === ev.checklist.length;
    const due = dueTotal(ev);
    const depart = new Date(ev.date.getTime() - 90 * 60000);
    const delivered = ev.status === 'livre';
    const team = ev.team || (pvReal()
      ? [{ n: 'Équipe 1', lead: true }, { n: 'Équipe 2', lead: true }]
      : [{ n: 'Chef Abdellah', lead: true }, { n: 'Saïd · maître d’hôtel', lead: true }]);
    return `<div class="tr-bl" style="margin-bottom:12px;">
      <div class="tr-bl-head">
        <div class="tr-bl-when"><b>${timeOf(ev.date)}</b><span>service</span></div>
        <div class="tr-bl-mid">
          <div class="tr-bl-name">${esc(ev.name)} ${typePill(ev)} ${delivered ? '<span class="tr-st st-livre">Livré</span>' : ''}</div>
          <div class="tr-bl-sub">
            <i data-lucide="map-pin"></i>${esc(ev.lieu)}
            <span class="sep">·</span><i data-lucide="phone"></i>${esc(ev.client)} · ${esc(ev.phone)}
            <span class="sep">·</span><i data-lucide="users"></i>${ev.guests} invités
            <span class="sep">·</span>${due > 0 ? `<span class="tr-pill due">solde ${fmtMAD(due)}</span>` : '<span class="tr-pill ok">réglé, khlass</span>'}
          </div>
        </div>
        <div class="tr-bl-headactions">
          <button class="tr-btn secondary" data-tr-bon="${ev.id}"><i data-lucide="printer"></i>Bon de livraison</button>
        </div>
      </div>
      <div class="tr-bl-grid">
        <div class="tr-bl-col">
          <div class="tr-bl-sec"><i data-lucide="package"></i>Quantités · <span class="ct">${ev.menu.length} préparations</span></div>
          ${ev.menu.map((id) => `<div class="tr-qty">
            <span class="tr-qty-art">${ART[id] || ''}</span>
            <span class="tr-qty-mid"><span class="tr-qty-name">${esc(DISH[id].label)}</span><span class="tr-qty-pack">${esc(DISH[id].pack(ev.guests))}</span></span>
          </div>`).join('')}
        </div>
        <div class="tr-bl-col">
          <div class="tr-bl-sec"><i data-lucide="users"></i>Équipe · <span class="ct">${team.length}</span></div>
          <div class="tr-team">
            ${team.map((m) => `<span class="tr-team-chip ${m.lead ? 'lead' : ''}"><span class="tr-team-ava">${esc(initials(m.n))}</span>${esc(m.n)}</span>`).join('')}
          </div>
          <div class="tr-bl-veh">
            <div class="tr-bl-veh-row"><i data-lucide="truck"></i>Camion réfrigéré · départ conseillé <b>${timeOf(depart)}</b></div>
            <div class="tr-bl-veh-row"><i data-lucide="clock"></i>Installation 45 min sur place · service <b>${timeOf(ev.date)}</b></div>
          </div>
        </div>
        <div class="tr-bl-col">
          <div class="tr-bl-sec"><i data-lucide="list-checks"></i>Checklist de chargement</div>
          <div class="tr-check-prog"><div class="tr-prog"><i style="width:${Math.round((doneCt / ev.checklist.length) * 100)}%"></i></div><b>${doneCt}/${ev.checklist.length}</b></div>
          ${ev.checklist.map((c, i) => `
            <button class="tr-check ${c.done ? 'done' : ''}" data-tr-chk="${ev.id}|${i}">
              <span class="tr-check-box">${c.done ? '<i data-lucide="check"></i>' : ''}</span>
              <span>${esc(c.label)}</span>
            </button>`).join('')}
        </div>
      </div>
      ${delivered
        ? `<div class="tr-bl-done"><i data-lucide="check-circle-2"></i>Livré à ${ev.deliveredAt ? timeOf(ev.deliveredAt) : timeOf(new Date())}, bon signé, événement soldé.</div>`
        : ev.loaded
          ? `<div class="tr-bl-cta">
              <button class="tr-btn secondary" data-tr-waroute="${ev.id}"><i data-lucide="message-circle"></i>Prévenir le client, en route</button>
              <button class="tr-btn primary" data-tr-deliver="${ev.id}"><i data-lucide="check-check"></i>Marquer livré${due > 0 ? ` · solde ${fmtMAD(due)}` : ''}</button>
            </div>`
          : `<div class="tr-bl-cta">
              <button class="tr-btn primary ${allDone ? 'is-urgent' : ''}" data-tr-depart="${ev.id}" ${allDone ? '' : 'disabled'}>
                <i data-lucide="truck"></i>${allDone ? 'Départ camion, bon signé' : `Chargement en cours · ${doneCt}/${ev.checklist.length}`}
              </button>
            </div>`}
    </div>`;
  }

  /* ═══════════════════════ WHATSAPP ═══════════════════════ */
  function waMessage(ev, kind) {
    const first = firstName(ev.client) || 'sidi';
    const { pp, total } = evTotals(ev);
    const t1 = Math.round(total * 0.3), t2 = Math.round(total * 0.5);
    if (kind === 'devis') {
      return `Sba7 lkhir ${first}, voici votre devis ${pvName('Dar Zellij') || 'le traiteur'} (${ev.devisRef}) :`
        + `\n${TYPES[ev.type].label} · ${ev.guests} invités · ${fmtDay(ev.date)} · ${ev.lieu}`
        + `\nMenu ${pp} MAD / personne : ${ev.menu.map((id) => DISH[id].label.toLowerCase()).join(', ')}.`
        + (ev.extras.length ? `\nExtras : ${ev.extras.map((id) => EXTRA[id].label.toLowerCase()).join(', ')}.` : '')
        + `\nTotal : ${fmtMAD(total)}, 30 % à la confirmation (${fmtMAD(t1)}), 50 % à J-7 (${fmtMAD(t2)}), solde le jour J.`
        + `\nRépondez OUI pour confirmer, la date reste bloquée 7 jours.`
        + `\n— ${pvName('Traiteur Dar Zellij') || 'Traiteur'} · envoyé via Kiwi`;
    }
    if (kind === 'relance') {
      return `Sba7 lkhir ${first}, petit rappel de ${pvName('Dar Zellij') || 'le traiteur'} : votre devis ${ev.devisRef}`
        + ` (${TYPES[ev.type].label.toLowerCase()} · ${ev.guests} invités · ${fmtDay(ev.date)}) est toujours réservé.`
        + `\nLa date du ${fmtDay(ev.date)} part vite en saison, répondez OUI pour la bloquer définitivement.`
        + `\n— ${pvName('Traiteur Dar Zellij') || 'Traiteur'} · envoyé via Kiwi`;
    }
    if (kind === 'route') {
      const arr = new Date(ev.date.getTime() - 45 * 60000);
      return `Sba7 lkhir ${first}, l’équipe ${pvName('Dar Zellij') || 'le traiteur'} est en route pour ${ev.lieu}.`
        + `\nArrivée prévue vers ${timeOf(arr)}, installation puis service à ${timeOf(ev.date)}.`
        + `\nTout est chargé et contrôlé. À tout de suite !`
        + `\n— ${pvName('Traiteur Dar Zellij') || 'Traiteur'} · envoyé via Kiwi`;
    }
    /* rappel d'échéance */
    const t = nextTranche(ev);
    return `Sba7 lkhir ${first}, rappel de ${pvName('Dar Zellij') || 'le traiteur'} pour ${ev.name} du ${fmtDay(ev.date)} :`
      + `\nla tranche « ${t ? t.label : 'solde'} » de ${t ? fmtMAD(t.amount) : ''} arrive à échéance.`
      + `\nVous pouvez régler en espèces au labo, par carte ou par virement.`
      + `\nChoukran, l’lah ikhellik.`
      + `\n— ${pvName('Traiteur Dar Zellij') || 'Traiteur'} · envoyé via Kiwi`;
  }

  function openWa(ev, kind) {
    const el = $('#tr-wam', root);
    const isDevis = kind === 'devis';
    let attach = isDevis;
    const titles = {
      devis: 'WhatsApp, envoyer le devis',
      relance: 'WhatsApp, relance du devis',
      rappel: 'WhatsApp, rappel d’échéance',
      route: 'WhatsApp, équipe en route',
    };
    el.innerHTML = `
      <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${titles[kind] || 'WhatsApp'}</h3>
      <p class="modal-subtle">${esc(ev.client || 'Client')} ${ev.phone ? `· ${esc(ev.phone)}` : '· numéro manquant'}</p>
      <div class="tr-wa-bubblewrap">
        <div class="tr-wa-bubble">
          <textarea id="tr-wa-text">${esc(waMessage(ev, kind))}</textarea>
          <div class="tr-wa-meta">${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())} ✓✓</div>
        </div>
      </div>
      ${isDevis ? `
      <button class="tr-wa-attach ${attach ? 'on' : ''}" id="tr-wa-attach">
        <span class="th"><i data-lucide="file-text"></i></span>
        <span class="l">Joindre le devis PDF (${esc(ev.devisRef)}), mis en page par Kiwi, prêt à signer</span>
        <span class="tick"><i data-lucide="check"></i></span>
      </button>` : ''}
      <div class="tr-wa-foot">
        <button class="tr-btn ghost" data-tr-close>Plus tard</button>
        <button class="tr-btn primary" id="tr-wa-send" ${ev.phone ? '' : 'disabled'}><i data-lucide="send"></i>Envoyer sur WhatsApp</button>
      </div>
      ${ev.phone ? '' : '<div class="tr-foot-note" style="margin-top:9px;">Ajoutez un téléphone au client pour activer l’envoi.</div>'}`;
    openVeil('#tr-veil-wa');
    icons();
    $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-wa'); });
    const att = $('#tr-wa-attach', el);
    if (att) att.onclick = () => { attach = !attach; att.classList.toggle('on', attach); };
    /* Ce bouton annonçait « WhatsApp envoyé » (et « Devis … envoyé ») alors que
       rien ne quittait la tablette : le client n'a jamais reçu son devis ni son
       rappel, et le traiteur le croyait prévenu. Une page web ne peut pas
       envoyer un WhatsApp toute seule, on ouvre donc le brouillon pré-rempli
       avec le texte tel qu'il a été édité, et c'est le traiteur qui appuie sur
       envoyer. Le lien ne transporte pas le PDF, on le dit au lieu de le
       prétendre. */
    $('#tr-wa-send', el).onclick = () => {
      const txt = $('#tr-wa-text', el);
      const body = txt ? txt.value : waMessage(ev, kind);
      const num = String(ev.phone || '').replace(/\D/g, '');
      const who = ev.client || 'le client';
      if (!num) { toast(`Pas de numéro pour ${who}, ajoutez-le à sa fiche`); return; }
      closeVeil('#tr-veil-wa');
      let opened = false;
      try {
        window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
        opened = true;
      } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      if (isDevis) {
        registerDevis(ev);
        if (opened) toast(`WhatsApp ouvert pour ${who}, appuyez sur envoyer`);
        if (attach) toast('Le devis PDF n’est pas joint par le lien, ajoutez-le dans WhatsApp');
        return;
      }
      ev.lastWa = new Date();
      queueIfOffline('Message WhatsApp');
      if (opened) toast(`WhatsApp ouvert pour ${who}, appuyez sur envoyer${kind === 'rappel' ? ', rappel d’échéance' : kind === 'route' ? ', équipe en route' : ''}`);
      refreshAll();
    };
  }

  /* ═══════════════════════ DOCUMENTS (devis · bon · récap) ═══════════════════════ */
  // Real caterer identity from the pairing / hosted session — devis & bons print
  // the real business name+city, never the demo "Traiteur Dar Zellij". Demo unchanged.
  function pvPaired() { try { return JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }
  function pvName(demo) { const p = pvPaired(); return (p && p.name) || (pvReal() ? '' : demo); }
  function pvCity(demo) { const p = pvPaired(); return (p && p.location) || (pvReal() ? '' : demo); }

  function docHTML(kind, ev) {
    const { pp, menuTotal, extrasTotal, total } = evTotals(ev);
    const head = `
      <div class="c b lg">${(pvName('Traiteur Dar Zellij') || 'Traiteur').toUpperCase()}</div>
      <div class="c mut">${pvReal() ? (pvCity('') ? pvCity('') + ' · ' : '') + 'propulsé par Kiwi' : 'Mesnana, Tanger · 05 39 95 XX XX<br>propulsé par Kiwi'}</div>
      <hr>`;
    if (kind === 'bon') {
      const due = dueTotal(ev);
      return `<div class="tr-doc">${head}
        <div class="c b">BON DE LIVRAISON · ${esc(ev.id)}</div>
        <hr>
        <div class="row"><span>Événement</span><span class="b">${esc(ev.name)}</span></div>
        <div class="row"><span>Date</span><span>${esc(fmtDay(ev.date))} · service ${timeOf(ev.date)}</span></div>
        <div class="row"><span>Adresse</span><span>${esc(ev.lieu)}</span></div>
        <div class="row"><span>Contact</span><span>${esc(ev.client)} · ${esc(ev.phone)}</span></div>
        <div class="row"><span>Couverts</span><span class="b">${ev.guests}</span></div>
        <hr>
        ${ev.menu.map((id) => `<div class="row"><span class="nm">${esc(DISH[id].label)}</span><span>${esc(DISH[id].pack(ev.guests))}</span></div>`).join('')}
        ${ev.extras.filter((id) => id !== 'service').map((id) => `<div class="row"><span class="nm">${esc(EXTRA[id].label)}</span><span>${esc(extraLine(id, ev.guests))}</span></div>`).join('')}
        <hr>
        <div class="row"><span>Équipe</span><span>${ev.team ? ev.team.length : 2} personnes</span></div>
        <div class="row${due > 0 ? ' due' : ''}"><span>Règlement</span><span>${due > 0 ? `SOLDE DÛ ${fmtMAD(due)}` : 'SOLDÉ'}</span></div>
        <div class="sign"><span>Chargé par : ____________</span><span>Reçu par : ____________</span></div>
      </div>`;
    }
    if (kind === 'recap') {
      return `<div class="tr-doc">${head}
        <div class="c b">RÉCAPITULATIF · ${esc(ev.devisRef)}</div>
        <hr>
        <div class="row"><span>Événement</span><span class="b">${esc(ev.name)}</span></div>
        <div class="row"><span>Client</span><span>${esc(ev.client)}</span></div>
        <div class="row"><span>Date</span><span>${esc(fmtDay(ev.date))} · ${ev.guests} invités</span></div>
        <hr>
        <div class="row"><span>Menu ${pp} MAD × ${ev.guests}</span><span>${fmtN(menuTotal)}</span></div>
        <div class="row"><span>Extras</span><span>${fmtN(extrasTotal)}</span></div>
        <div class="row tot"><span>TOTAL</span><span>${fmtN(total)} MAD</span></div>
        <hr>
        ${ev.tranches.map((t) => `<div class="row"><span>${t.pct} % · ${esc(t.label)}</span><span>${t.paid ? `${fmtN(t.amount)} · ${METHODS[t.paid.method]} · ${fmtDay(t.paid.at)}` : 'non payé'}</span></div>`).join('')}
        <hr>
        <div class="c mut">Soldé, merci, l’lah ikhellik.</div>
      </div>`;
    }
    /* devis */
    const t1 = Math.round(total * 0.3), t2 = Math.round(total * 0.5);
    return `<div class="tr-doc">${head}
      <div class="c b">DEVIS · ${esc(ev.devisRef)}</div>
      <hr>
      <div class="row"><span>Client</span><span class="b">${esc(ev.client || '—')}</span></div>
      ${ev.phone ? `<div class="row"><span>Tél</span><span>${esc(ev.phone)}</span></div>` : ''}
      <div class="row"><span>Événement</span><span>${esc(TYPES[ev.type].label)} · ${ev.guests} invités</span></div>
      <div class="row"><span>Date</span><span>${esc(fmtDay(ev.date))}</span></div>
      <div class="row"><span>Lieu</span><span>${esc(ev.lieu)}</span></div>
      <hr>
      ${ev.menu.map((id) => `<div class="row"><span class="nm">${esc(DISH[id].label)}</span><span>${DISH[id].price} /pers</span></div>`).join('')}
      <div class="row b"><span>MENU / PERSONNE</span><span>${pp} MAD</span></div>
      <div class="row"><span>× ${ev.guests} invités</span><span>${fmtN(menuTotal)}</span></div>
      ${ev.extras.length ? '<hr>' + ev.extras.map((id) => `<div class="row"><span class="nm">${esc(EXTRA[id].label)} (${esc(extraLine(id, ev.guests))})</span><span>${fmtN(extraCost(id, ev.guests))}</span></div>`).join('') : ''}
      <hr>
      <div class="row tot"><span>TOTAL</span><span>${fmtN(total)} MAD</span></div>
      <hr>
      <div class="row"><span>30 % à la confirmation</span><span>${fmtN(t1)}</span></div>
      <div class="row"><span>50 % à J-7</span><span>${fmtN(t2)}</span></div>
      <div class="row"><span>Solde le jour J</span><span>${fmtN(total - t1 - t2)}</span></div>
      <hr>
      <div class="c mut">Devis valable 7 jours · la date est bloquée à<br>réception de l’acompte de confirmation.</div>
    </div>`;
  }

  function openDoc(kind, ev) {
    const el = $('#tr-docm', root);
    const titles = { devis: `Devis ${ev.devisRef}`, bon: `Bon de livraison, ${ev.name}`, recap: `Récapitulatif, ${ev.name}` };
    el.innerHTML = `
      <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${esc(titles[kind] || 'Document')}</h3>
      <p class="modal-subtle">Aperçu avant impression, format A4, papier à en-tête ${esc(pvName('Dar Zellij') || 'du traiteur')}.</p>
      <div class="tr-doc-wrap">${docHTML(kind, ev)}</div>
      <div class="tr-doc-foot">
        <button class="tr-btn secondary" data-tr-close>Fermer</button>
        <button class="tr-btn primary" id="tr-doc-print"><i data-lucide="printer"></i>Imprimer (A4)</button>
      </div>`;
    openVeil('#tr-veil-doc');
    icons();
    $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-doc'); });
    $('#tr-doc-print', el).onclick = () => {
      queueIfOffline('Impression document');
      toast(kind === 'bon' ? 'Bon de livraison envoyé à l’imprimante, 2 exemplaires (équipe + client)' : `${kind === 'recap' ? 'Récapitulatif' : 'Devis'} envoyé à l’imprimante A4`);
    };
  }

  /* ═══════════════════════ ENCAISSEMENT — tranche d'échéancier ═══════════════════════
     Réutilise le kit caisse : .cash-grid pour les espèces, .reader-stage
     pour la carte (lecteur partenaire — V1 sans encaissement Kiwi). */
  function openPay(ev, t, ctx) {
    if (!t) { toast(`${ev.name} est déjà soldé`); return; }
    const el = $('#tr-paym', root);
    const amount = t.amount;
    const due = dueTotal(ev);

    const stepMethod = () => {
      el.innerHTML = `
        <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Tranche ${t.pct} % · ${esc(t.label)}</h3>
        <p class="modal-subtle">${esc(ev.name)} · ${esc(ev.client)} · reste ${fmtMAD(due)} sur ${fmtMAD(evTotals(ev).total)}</p>
        <div class="modal-amount size-md">${fmtMAD(amount)}</div>
        <div class="tr-pay-opts">
          <button class="tr-pay-opt" data-tr-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé, flous comptés devant le client</span></span>
          </button>
          <button class="tr-pay-opt" data-tr-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Montant envoyé au lecteur partenaire, V1 sans encaissement Kiwi</span></span>
          </button>
          <button class="tr-pay-opt is-usual" data-tr-m="virement">
            <span class="ic"><i data-lucide="wallet"></i></span>
            <span class="l"><b>Virement reçu</b><span>Le classique des gros montants, référence notée pour la compta</span></span>
          </button>
        </div>`;
      icons();
      $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-pay'); });
      $$('[data-tr-m]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.trM;
          if (m === 'especes') stepCash();
          else if (m === 'carte') stepCard();
          else stepVirement();
        };
      });
    };

    const stepCash = () => {
      let received = amount;
      el.innerHTML = `
        <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(ev.name)} · tranche ${t.pct} %</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="tr-cash-in">Flous reçu</label>
            <input class="cash-input mono" id="tr-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
            <button class="cash-preset" data-add="500">+500</button>
            <button class="cash-preset" data-add="1000">+1 000</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="tr-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="tr-cash-ok">Confirmer</button>
        </div>`;
      icons();
      const refresh = () => {
        $('#tr-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#tr-cash-ok', el).disabled = received < amount;
      };
      $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-pay'); });
      $('#tr-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#tr-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#tr-cash-ok', el).onclick = () => done('especes', Math.max(0, received - amount));
    };

    const stepCard = () => {
      el.innerHTML = `
        <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(ev.name)} · Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="tr-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="tr-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>`;
      icons();
      $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-pay'); });
      setTimeout(() => {
        const disc = $('#tr-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        const status = $('#tr-reader-status', el);
        const hw = window.KiwiHardware;
        if (!hw || !hw.authorizeCard) { disc.classList.remove('is-pulsing'); status.textContent = 'Paiement non confirmé · lecteur indisponible'; return; }
        hw.authorizeCard(amount, disc, status).then((result) => {
          icons();
          if (result && result.approved) setTimeout(() => done('carte', 0), 900);
        });
      }, 1900);
    };

    const stepVirement = () => {
      el.innerHTML = `
        <button class="tr-modal-x" data-tr-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Virement reçu · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${esc(ev.name)} · tranche ${t.pct} %, confirmez la réception sur le compte</p>
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="tr-vir-ref">Référence du virement <span style="color:var(--ink-4);">(optionnel)</span></label>
            <input class="cash-input mono" id="tr-vir-ref" style="font-size:16px;" placeholder="Ex. VIR-88214" />
          </div>
          <button class="cash-confirm" id="tr-vir-ok">Virement bien reçu, pointer la tranche</button>
        </div>
        <div class="tr-foot-note" style="margin-top:10px;">Rapprochement bancaire automatique côté dashboard, rien à ressaisir.</div>`;
      icons();
      $$('[data-tr-close]', el).forEach((b) => { b.onclick = () => closeVeil('#tr-veil-pay'); });
      $('#tr-vir-ok', el).onclick = () => {
        const ref = $('#tr-vir-ref', el).value.trim();
        done('virement', 0, ref);
      };
    };

    const done = (method, rendu, ref) => {
      t.paid = { method, at: new Date(), note: ref ? `réf. ${ref}` : '' };
      const wasConfirme = ev.status === 'confirme';
      if (wasConfirme) ev.status = 'acompte';
      /* Une tranche encaissée est une recette du jour, pas le total de
         l'événement : le reste rentrera à ses propres échéances. */
      postDay(t.amount, method, `Tranche ${t.pct} % · ${ev.name}`, ref);
      closeVeil('#tr-veil-pay');
      queueIfOffline('Encaissement tranche');
      toast(`Tranche ${t.pct} % encaissée, ${fmtMAD(amount)} en ${METHODS[method]}${rendu ? ` · rendu ${fmtMAD(rendu)}` : ''}`);
      if (wasConfirme) toast(`${ev.name} passe en « Acompte reçu », la date est verrouillée`);
      if (dueTotal(ev) <= 0) toast(`${ev.name} est soldé, khlass, rien à encaisser le jour J`);
      refreshAll();
      if (ctx && typeof ctx.onDone === 'function') ctx.onDone();
    };

    stepMethod();
    openVeil('#tr-veil-pay');
  }

  /* ═══════════════════════ OFFLINE (file simulée) ═══════════════════════ */
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
    const net = $('#tr-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline);
    $('.tr-net-label', net).textContent = state.offline ? 'Hors-ligne' : 'En ligne';
    let q = $('.tr-net-queue', net);
    if (state.offline && state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'tr-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#tr-offline-note', root);
    note.hidden = !state.offline;
    $('#tr-queue-count', root).textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  window.KiwiPosDispatch.register({
    id: 'traiteur',
    greet: {
      line1: 'Sba7 lkhir Naima,',
      em: 'marhba.',
      sub: 'Traiteur Dar Zellij <em>·</em> iftar 120 pers ce soir · une échéance à encaisser',
    },
    mount(rootEl) { mount(rootEl); },
    onShow() { if (root) renderAll(); },
  });
})();
