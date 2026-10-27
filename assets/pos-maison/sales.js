import { CLIENTES, CL, RAYONS, state, root, stockOf, promoFor, isConsignedProduct, findSale, P, toast, ticketTotals, ticketCount, isOfflineRef, STAFF, assignTicketNumber, freshTicket, renderBadges, checkout, lineUnit, linePromo, merchantSlug, stockAdd, sizesOf, pieceUnitPrice, promoForLine, ticketClient, firstFree, openVeil, sizeWord, _bqKey, closeVeil, pvReal, initials, activeAvoirs, queueIfOffline, whenLabel, IS_DEMO, AVOIRS, creditRequest, creditFromServer, SALES, switchView, firstName, ensureStockJournal, rebuildCatalog, renderAll, BY_EAN } from '../pos-maison.js?v=100';
import { bqReal, openExchSummary, openVoucher, catDB, openScannerTest, normScan } from './checkout.js?v=20';
import { invSetModal, offerRegister } from './inventory.js?v=20';
import '../money-cents.js?v=4';


  /* ───────────────────────── helpers ───────────────────────── */
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => globalThis.KiwiMoney.format(n) + ' MAD';
  /* La caisse Maison garde le prix au centime, comme la caisse boutique
     (décision propriétaire, 2026-10-26, docs/decisions/2026-10-26-wave-q.md :
     un prix configuré est encaissé au centime, un prix entier reste entier).
     Elle n'encaisse JAMAIS plus que le prix affiché : un prix de catalogue à
     249,90, une pièce de service à 83,33, une promotion ou une remise qui tombe
     sur 220,505 descendent au centime inférieur, partout : grille, fiche,
     ticket, échange et reçu disent le même chiffre. Le petit epsilon absorbe
     0,1 + 0,2 et ses cousins, jamais un vrai centime. */
  const shelf = (n) => Math.max(0, Math.floor((+n || 0) * 100 + 1e-6) / 100);
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const lens   = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  /* Un avoir vit six mois : son échéance tombe presque toujours l'année suivante.
     Sans millésime, « sam. 14 févr. » sur un bon papier ne dit pas si c'est celui
     de cette année ou du suivant — et c'est le seul chiffre qui décide si la
     cliente est remboursée ou renvoyée. Les dates d'avoir portent l'année. */
  const fmtDayY = (d) => `${fmtDay(d)} ${d.getFullYear()}`;
  /* Dernière journée commerciale où un avoir reste utilisable. Le serveur le fait
     expirer à la bascule (05:00 par défaut) qui CLÔT cette journée : la date civile
     de cet instant serait le lendemain. On lit donc la journée commerciale de
     l'instant qui le précède, avec la bascule et le fuseau du magasin
     (KiwiDayReport), comme le tableau de bord. */
  const creditLastDay = (until) => {
    const t = +new Date(until);
    let day = '';
    try { if (window.KiwiDayReport && window.KiwiDayReport.businessDay) day = String(window.KiwiDayReport.businessDay(t - 1)); } catch (_) {}
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(t - 5 * 3600000 - 1);
  };
  const fmtValidUntil = (until) => fmtDayY(creditLastDay(until));
  const fmtHM  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const MIN = 60 * 1000;

  /* Deterministic pseudo-barcode (Code-39 lookalike) from any id. */
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

  /* ───────────────────────── line-art ─────────────────────────
     Same visual voice as the pressing ART dict: forest strokes, mint-tint
     fills, 64×64 grid. These ARE the rayons — the grid sells by silhouette. */
  const art = (inner) => `<svg class="mz-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
  const ART = {
    assiette: art(`<ellipse class="fill" cx="32" cy="32" rx="22" ry="16"/><ellipse cx="32" cy="32" rx="22" ry="16"/><ellipse class="thin" cx="32" cy="32" rx="14" ry="9.5"/><ellipse class="thin" cx="32" cy="32" rx="7" ry="4.5"/>`),
    bol: art(`<path class="fill" d="M12 24c0 14 9 22 20 22s20-8 20-22H12z"/><path d="M12 24c0 14 9 22 20 22s20-8 20-22H12z"/><ellipse class="thin" cx="32" cy="24" rx="20" ry="6"/><path class="thin" d="M26 46h12"/>`),
    tasse: art(`<path class="fill" d="M16 22h24v16c0 6-5 10-12 10s-12-4-12-10V22z"/><path d="M16 22h24v16c0 6-5 10-12 10s-12-4-12-10V22z"/><path d="M40 26c5 0 8 3 8 7s-3 7-8 7"/><path class="thin" d="M12 50h32"/>`),
    verre: art(`<path class="fill" d="M18 16h28l-4 32H22L18 16z"/><path d="M18 16h28l-4 32H22L18 16z"/><ellipse class="thin" cx="32" cy="16" rx="14" ry="4"/><ellipse class="thin" cx="32" cy="26" rx="13" ry="3.5"/><path class="thin" d="M21 44h22"/>`),
    carafe: art(`<path class="fill" d="M28 14h8l2 8 8 16c2 4 0 10-6 12-2 .5-8 .5-16 0-6-2-8-8-6-12l8-16 2-8z"/><path d="M28 14h8l2 8 8 16c2 4 0 10-6 12-2 .5-8 .5-16 0-6-2-8-8-6-12l8-16 2-8z"/><ellipse class="thin" cx="32" cy="14" rx="4" ry="1.5"/><path class="thin" d="M38 24c6 2 8 8 6 14"/>`),
    coupe: art(`<path class="fill" d="M14 18c0 12 8 18 18 18s18-6 18-18H14z"/><path d="M14 18c0 12 8 18 18 18s18-6 18-18H14z"/><path d="M32 36v12M22 48h20"/><ellipse class="thin" cx="32" cy="18" rx="18" ry="4"/>`),
    bougie: art(`<rect class="fill" x="22" y="24" width="20" height="28" rx="3"/><rect x="22" y="24" width="20" height="28" rx="3"/><ellipse class="thin" cx="32" cy="24" rx="10" ry="3"/><path class="thin" d="M32 24v-4"/><path class="fill" d="M32 14c-2 2-3 4-1 6s4 1 3-2c-.5-1.5-1.5-3-2-4z"/><path d="M32 14c-2 2-3 4-1 6s4 1 3-2c-.5-1.5-1.5-3-2-4z"/>`),
    diffuseur: art(`<rect class="fill" x="22" y="32" width="20" height="20" rx="4"/><rect x="22" y="32" width="20" height="20" rx="4"/><rect x="28" y="27" width="8" height="5" rx="1"/><path class="thin" d="M32 27L22 12M32 27L32 10M32 27L42 12M32 27L26 11M32 27L38 11"/>`),
    vase: art(`<path class="fill" d="M26 14h12l-2 8 8 14c3 5 1 12-5 14-2 .5-9 .5-14 0-6-2-8-9-5-14l8-14-2-8z"/><path d="M26 14h12l-2 8 8 14c3 5 1 12-5 14-2 .5-9 .5-14 0-6-2-8-9-5-14l8-14-2-8z"/><ellipse class="thin" cx="32" cy="14" rx="6" ry="2"/>`),
    plateau: art(`<ellipse class="fill" cx="32" cy="34" rx="26" ry="14"/><ellipse cx="32" cy="34" rx="26" ry="14"/><ellipse class="thin" cx="32" cy="34" rx="20" ry="10"/><path class="thin" d="M10 32c-3 0-4 3-2 5M54 32c3 0 4 3 2 5"/>`),
    miroir: art(`<circle class="fill" cx="32" cy="32" r="14"/><circle cx="32" cy="32" r="14"/><circle class="thin" cx="32" cy="32" r="18"/><path class="thin" d="M32 8v4M32 52v4M8 32h4M52 32h4M15 15l3 3M46 46l3 3M15 49l3-3M46 18l3-3"/>`),
    caftan: art(`<path class="fill" d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9c-1.6 2.4-10.4 2.4-12 0z"/><path d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9"/><path d="M26 9c1.6 2.4 10.4 2.4 12 0"/><path d="M32 13v41"/><circle class="thin" cx="29.5" cy="20" r=".9"/><circle class="thin" cx="29.5" cy="26" r=".9"/><circle class="thin" cx="29.5" cy="32" r=".9"/><circle class="thin" cx="29.5" cy="38" r=".9"/><path class="thin" d="M20 48h24"/>`),
    caftan_perle: art(`<path class="fill" d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9c-1.6 2.4-10.4 2.4-12 0z"/><path d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9"/><path d="M26 9c1.6 2.4 10.4 2.4 12 0"/><path d="M32 13v41"/><circle class="thin" cx="26" cy="30" r=".8"/><circle class="thin" cx="38" cy="27" r=".8"/><circle class="thin" cx="27" cy="42" r=".8"/><circle class="thin" cx="37" cy="36" r=".8"/><circle class="thin" cx="35" cy="46" r=".8"/><circle class="thin" cx="29" cy="22" r=".8"/>`),
    caftan_jawhara: art(`<path class="fill" d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9c-1.6 2.4-10.4 2.4-12 0z"/><path d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9"/><path d="M26 9c1.6 2.4 10.4 2.4 12 0"/><path d="M32 13v18M32 36v18"/><rect class="fill" x="23" y="30" width="18" height="5.5" rx="2.5"/><rect x="23" y="30" width="18" height="5.5" rx="2.5"/><circle cx="32" cy="32.8" r="1.8"/><circle class="thin" cx="32" cy="16.5" r="1"/><path class="thin" d="M21 48h22"/>`),
    caftan_ete: art(`<path class="fill" d="M26 9 17 14l2 8 4-2-3 33h24l-3-33 4 2 2-8-9-5c-1.6 2.4-10.4 2.4-12 0z"/><path d="M26 9 17 14l2 8 4-2-3 33h24l-3-33 4 2 2-8-9-5"/><path d="M28 10l4 6 4-6"/><path class="thin" d="M32 16v9"/><path class="thin" d="M22 46c7 3 13 3 20 0"/>`),
    caftan_velours: art(`<path class="fill" d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9c-1.6 2.4-10.4 2.4-12 0z"/><path d="M26 9 15 15l3 7 4-2-4 34h28l-4-34 4 2 3-7L38 9"/><path d="M26 9c1.6 2.4 10.4 2.4 12 0"/><path d="M32 13v41"/><path class="soft" d="M25 24l-2.5 26M39 24l2.5 26"/><path class="thin" d="M28.5 22 27 52M35.5 22 37 52"/>`),
    takchita: art(`<path class="fill" d="M27 9 16 15l3 7 4-2-4 34h26l-4-34 4 2 3-7L37 9c-1.4 2.2-8.6 2.2-10 0z"/><path d="M27 9 16 15l3 7 4-2-4 34h26l-4-34 4 2 3-7L37 9"/><path d="M27 9c1.4 2.2 8.6 2.2 10 0"/><path d="M27 12l-3 42M37 12l3 42"/><rect x="25" y="30" width="14" height="4.5" rx="2"/><circle class="thin" cx="32" cy="32.2" r="1.2"/><path class="thin" d="M32 14v14"/>`),
    takchita_mariage: art(`<path class="fill" d="M27 9 16 15l3 7 4-2-4 34h26l-4-34 4 2 3-7L37 9c-1.4 2.2-8.6 2.2-10 0z"/><path d="M27 9 16 15l3 7 4-2-4 34h26l-4-34 4 2 3-7L37 9"/><path d="M27 9c1.4 2.2 8.6 2.2 10 0"/><path d="M27 12l-3 42M37 12l3 42"/><rect x="25" y="29" width="14" height="4.5" rx="2"/><path class="thin" d="M21 48h22"/><circle class="thin" cx="29" cy="41" r=".8"/><circle class="thin" cx="35" cy="44" r=".8"/><circle class="thin" cx="32" cy="22" r=".8"/><circle class="thin" cx="33" cy="49" r=".8"/>`),
    mdamma: art(`<rect class="fill" x="6" y="28" width="52" height="9" rx="4.5"/><rect x="6" y="28" width="52" height="9" rx="4.5"/><circle class="fill" cx="32" cy="32.5" r="7.5"/><circle cx="32" cy="32.5" r="7.5"/><circle class="thin" cx="32" cy="32.5" r="3.6"/><path class="thin" d="M13 32.5h8M43 32.5h8"/><circle class="thin" cx="18" cy="32.5" r="1"/><circle class="thin" cx="46" cy="32.5" r="1"/>`),
    foulard: art(`<path d="M10 14h44"/><path class="fill" d="M21 14v25c0 6 4 9 7 5l3-4V14z"/><path d="M21 14v25c0 6 4 9 7 5l3-4V14z"/><path class="fill" d="M35 14v17c0 5 3.5 7 6.5 3.5l1.5-2V14z"/><path d="M35 14v17c0 5 3.5 7 6.5 3.5l1.5-2V14z"/><path class="thin" d="M24 45v5M27 47v5M30 43v5"/><path class="thin" d="M38 36v4M41 35v4"/>`),
    chale: art(`<path class="fill" d="M10 18h44L32 50z"/><path d="M10 18h44L32 50z"/><path class="thin" d="M22 18l10 20M42 18 32 38"/><path class="thin" d="M15 25l-3 2M21 33l-3 2M27 41l-3 2M49 25l3 2M43 33l3 2M37 41l3 2"/>`),
    broche: art(`<circle class="fill" cx="32" cy="29" r="13"/><circle cx="32" cy="29" r="13"/><circle class="thin" cx="32" cy="29" r="6.5"/><circle class="thin" cx="32" cy="18.5" r="1.4"/><circle class="thin" cx="42.5" cy="29" r="1.4"/><circle class="thin" cx="32" cy="39.5" r="1.4"/><circle class="thin" cx="21.5" cy="29" r="1.4"/><path d="M27 46h10"/><path class="thin" d="M37 46l4 5"/>`),
    babouche: art(`<path class="fill" d="M8 43c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M8 43c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M9 46.5c15 2.5 31 2.5 46-1.5"/><path class="thin" d="M21 38c4 1.6 6.5 3.6 7.5 6.6"/>`),
    babouche_brodee: art(`<path class="fill" d="M8 43c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M8 43c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M9 46.5c15 2.5 31 2.5 46-1.5"/><path class="thin" d="M28 39.5l2-2 2 2-2 2zM37 37.5l2-2 2 2-2 2z"/><path class="thin" d="M20 39c3.5 1.4 5.8 3.2 6.8 5.8"/>`),
    cherbil: art(`<path class="fill" d="M8 41c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M8 41c0-2.4 2.4-4 6-4.4l20-2.6c9-1.2 15-5 17-11 2.6 7-1 15-9 17.8-3 1-6 1.6-10 1.6H12c-2.7 0-4-1-4-1.4z"/><path d="M13 42.6v5.4h8v-4.6"/><path class="thin" d="M30 38.5l1.5-1.5 1.5 1.5-1.5 1.5z"/><circle class="thin" cx="38" cy="36.5" r=".9"/><circle class="thin" cx="42" cy="35" r=".9"/>`),
    babouche_enfant: art(`<path class="fill" d="M21 16l-5.5 13c0 8 2.2 17 5.5 17s5.5-9 5.5-17z"/><path d="M21 16l-5.5 13c0 8 2.2 17 5.5 17s5.5-9 5.5-17z"/><path class="fill" d="M43 16l-5.5 13c0 8 2.2 17 5.5 17s5.5-9 5.5-17z"/><path d="M43 16l-5.5 13c0 8 2.2 17 5.5 17s5.5-9 5.5-17z"/><path class="thin" d="M17 31c2.5 2 5.5 2 8 0M39 31c2.5 2 5.5 2 8 0"/>`),
    sac: art(`<path d="M24 21c0-9 16-9 16 0"/><path class="fill" d="M15 21h34l-4 29H19z"/><path d="M15 21h34l-4 29H19z"/><path class="thin" d="M19.5 28h25M18.5 35h27M18 42h26"/><path class="thin" d="M24 22l-2 27M32 22v27M40 22l2 27"/>`),
    cabas: art(`<path d="M23 21c0-7 5.5-7 5.5 0M35.5 21c0-7 5.5-7 5.5 0"/><rect class="fill" x="14" y="21" width="36" height="29" rx="2.5"/><rect x="14" y="21" width="36" height="29" rx="2.5"/><path class="thin" d="M14 31l6-4.5 6 4.5 6-4.5 6 4.5 6-4.5 6 4.5"/><path class="thin" d="M14 41l6-4.5 6 4.5 6-4.5 6 4.5 6-4.5 6 4.5"/>`),
    pochette: art(`<rect class="fill" x="13" y="23" width="38" height="23" rx="5"/><rect x="13" y="23" width="38" height="23" rx="5"/><path d="M13 31h38"/><circle cx="32" cy="35.5" r="2"/><path class="thin" d="M47 23c5-3.5 7-8 3.5-11"/><circle class="thin" cx="20" cy="40" r=".8"/><circle class="thin" cx="26" cy="38" r=".8"/><circle class="thin" cx="40" cy="40" r=".8"/><circle class="thin" cx="44" cy="37" r=".8"/>`),
    /* ── generic clothing / retail icons (any boutique, not just Moroccan wear) ── */
    tshirt:     art(`<path class="fill" d="M23 15 13 21l4 8 5-3v24h20V26l5 3 4-8-10-6c-3 4-9 4-12 0z"/><path d="M23 15 13 21l4 8 5-3v24h20V26l5 3 4-8-10-6"/><path d="M23 15c3 4 9 4 12 0"/>`),
    chemise:    art(`<path class="fill" d="M23 15 13 21l4 8 5-3v24h20V26l5 3 4-8-10-6-5 4-5-4z"/><path d="M23 15 13 21l4 8 5-3v24h20V26l5 3 4-8-10-6"/><path class="thin" d="M28 15l4 4 4-4"/><path class="thin" d="M32 19v27"/><circle class="thin" cx="32" cy="28" r=".8"/><circle class="thin" cx="32" cy="35" r=".8"/><circle class="thin" cx="32" cy="42" r=".8"/>`),
    pull:       art(`<path class="fill" d="M23 16 12 22l3 17 5-2v13h24V37l5 2 3-17-11-6c-4 4-8 4-13 0z"/><path d="M23 16 12 22l3 17 5-2v13h24V37l5 2 3-17-11-6"/><path d="M23 16c5 4 9 4 13 0"/><path class="thin" d="M20 45h24"/>`),
    robe:       art(`<path class="fill" d="M25 15 15 21l4 7 5-3-7 25h30l-7-25 5 3 4-7-10-6c-3 4-8 4-13 0z"/><path d="M25 15 15 21l4 7 5-3-7 25h30l-7-25 5 3 4-7-10-6"/><path d="M25 15c5 4 8 4 13 0"/><path class="thin" d="M27 33h10"/>`),
    jupe:       art(`<path class="fill" d="M22 24h20l6 24H16z"/><path d="M22 24h20l6 24H16z"/><path d="M22 24h20"/><path class="thin" d="M28 26 25 48M36 26l3 22M32 26v22"/>`),
    pantalon:   art(`<path class="fill" d="M22 15h20l-2 35h-7l-1-20-1 20h-7z"/><path d="M22 15h20l-2 35h-7l-1-20-1 20h-7z"/><path d="M22 21h20"/><path class="thin" d="M26 24v23"/>`),
    veste:      art(`<path class="fill" d="M23 15 13 21l4 8 5-3v24h8V24h6v26h8V26l5 3 4-8-10-6-6 6-6-6z"/><path d="M23 15 13 21l4 8 5-3v24h8V24h6v26h8V26l5 3 4-8-10-6"/><path class="thin" d="M29 21l-3 10M35 21l3 10"/>`),
    chaussures: art(`<path class="fill" d="M10 42c0-5 3-8 8-9l8 0 8 5 14 1c4 1 6 3 6 6v2H10z"/><path d="M10 42c0-5 3-8 8-9l8 0 8 5 14 1c4 1 6 3 6 6v2H10z"/><path class="thin" d="M20 34l2 6M25 34l2 6M10 45h44"/>`),
    chapeau:    art(`<path class="fill" d="M24 37c0-15 16-15 16 0z"/><path d="M24 37c0-15 16-15 16 0"/><path class="fill" d="M13 37h38c0 3-8 4-19 4s-19-1-19-4z"/><path d="M13 37c0 3 8 4 19 4s19-1 19-4"/><path class="thin" d="M24 35h16"/>`),
    ceinture:   art(`<path class="fill" d="M8 28h48v8H8z"/><path d="M8 28h48v8H8z"/><rect class="fill" x="27" y="25" width="12" height="14" rx="2"/><rect x="27" y="25" width="12" height="14" rx="2"/><path class="thin" d="M33 25v14"/>`),
    lunettes:   art(`<circle class="fill" cx="20" cy="34" r="8"/><circle cx="20" cy="34" r="8"/><circle class="fill" cx="44" cy="34" r="8"/><circle cx="44" cy="34" r="8"/><path d="M28 33c2-2 6-2 8 0"/><path class="thin" d="M12 30l-4-3M52 30l4-3"/>`),
    montre:     art(`<circle class="fill" cx="32" cy="33" r="11"/><circle cx="32" cy="33" r="11"/><path d="M27 23l1-8h8l1 8M27 43l1 7h8l1-7"/><path class="thin" d="M32 33v-6M32 33l5 2"/>`),
    parfum:     art(`<rect class="fill" x="24" y="24" width="16" height="24" rx="3"/><rect x="24" y="24" width="16" height="24" rx="3"/><rect class="fill" x="28" y="16" width="8" height="8" rx="1"/><rect x="28" y="16" width="8" height="8" rx="1"/><path d="M28 16v-3h8v3"/><path class="thin" d="M28 33h8"/>`),
    sac_main:   art(`<path d="M22 26c0-10 20-10 20 0"/><path class="fill" d="M16 26h32l-3 22H19z"/><path d="M16 26h32l-3 22H19z"/><path class="thin" d="M32 32a4 4 0 010 8"/>`),
    tag:        art(`<path class="fill" d="M14 14h16l22 22-16 16-22-22z"/><path d="M14 14h16l22 22-16 16-22-22z"/><circle class="thin" cx="21" cy="21" r="2.6"/>`),
    cintre:     art(`<path class="fill" d="M13 44 32 29l19 15z"/><path d="M13 44 32 29l19 15z"/><path d="M32 29v-4a3 3 0 10-3-3"/><path d="M12 44h40"/>`),
    /* ── extended apparel ── */
    debardeur:  art(`<path class="fill" d="M26 15v5c-2 1-4 3-4 6v22h20V26c0-3-2-5-4-6v-5c0 3-3 5-6 5s-6-2-6-5z"/><path d="M26 15v5c-2 1-4 3-4 6v22h20V26c0-3-2-5-4-6v-5"/><path d="M26 15c0 3 3 5 6 5s6-2 6-5"/>`),
    sweat:      art(`<path class="fill" d="M23 17 12 23l3 16 5-2v13h24V37l5 2 3-16-11-6c-2 5-10 5-12 0z"/><path d="M23 17 12 23l3 16 5-2v13h24V37l5 2 3-16-11-6"/><path class="fill" d="M27 16c1 5 9 5 10 0l-2-2c-2 2-4 2-6 0z"/><path d="M27 16c1 5 9 5 10 0"/><path class="thin" d="M31 20v6M33 20v6"/><path class="thin" d="M23 42h18"/>`),
    short:      art(`<path class="fill" d="M22 17h20l-2 20h-7l-1-12-1 12h-7z"/><path d="M22 17h20l-2 20h-7l-1-12-1 12h-7z"/><path d="M22 23h20"/>`),
    combinaison:art(`<path class="fill" d="M23 15 13 21l4 8 5-3v10l-2 18h7l1-12 1 12h7l-2-18v-10l5 3 4-8-10-6c-2 4-8 4-10 0z"/><path d="M23 15 13 21l4 8 5-3v10l-2 18h7l1-12 1 12h7l-2-18v-10l5 3 4-8-10-6"/><path d="M23 15c2 4 8 4 10 0"/><path class="thin" d="M22 33h20"/>`),
    cravate:    art(`<path class="fill" d="M27 15h10l-2 7 3 21-6 7-6-7 3-21z"/><path d="M27 15h10l-2 7 3 21-6 7-6-7 3-21z"/><path d="M29 22h6"/>`),
    echarpe:    art(`<path class="fill" d="M23 16c3 4 15 4 18 0v5c0 2-1 3-3 4l1 23h-6l-1-20-1 20h-6l1-23c-2-1-3-2-3-4z"/><path d="M23 16c3 4 15 4 18 0v5c0 2-1 3-3 4l1 23h-6l-1-20-1 20h-6l1-23c-2-1-3-2-3-4z"/><path class="thin" d="M27 47v4M31 47v4M35 47v4M39 47v4"/>`),
    gants:      art(`<path class="fill" d="M25 24c0-3 2-5 5-5h6c3 0 5 2 5 5v6c3 0 5 2 5 5s-2 5-5 5v3c0 2-1 3-3 3H28c-2 0-3-1-3-3z"/><path d="M25 24c0-3 2-5 5-5h6c3 0 5 2 5 5v6c3 0 5 2 5 5s-2 5-5 5v3c0 2-1 3-3 3H28c-2 0-3-1-3-3z"/><path class="thin" d="M25 44h16"/>`),
    chaussettes:art(`<path class="fill" d="M27 14h9v16c0 2 1 3 3 4l5 4c2 2 3 3 3 6 0 3-2 5-5 5s-4-1-6-3l-8-7c-2-2-3-3-3-6V14z"/><path d="M27 14h9v16c0 2 1 3 3 4l5 4c2 2 3 3 3 6 0 3-2 5-5 5s-4-1-6-3l-8-7c-2-2-3-3-3-6V14z"/><path class="thin" d="M27 20h9"/>`),
    /* ── footwear ── */
    basket:     art(`<path class="fill" d="M11 41c0-3 1-5 3-7l6-6c1-1 2-1 3 0l3 4 5 3 14 2c3 0 5 2 5 5v3H11z"/><path d="M11 41c0-3 1-5 3-7l6-6c1-1 2-1 3 0l3 4 5 3 14 2c3 0 5 2 5 5v3H11z"/><path class="thin" d="M27 34l3-3M30 37l3-3M33 39l3-3"/><path class="thin" d="M11 46h39"/>`),
    botte:      art(`<path class="fill" d="M25 14h10v18c0 2 1 4 3 5l8 4c3 1 4 3 4 6v3H25V14z"/><path d="M25 14h10v18c0 2 1 4 3 5l8 4c3 1 4 3 4 6v3H25V14z"/><path class="thin" d="M25 20h10"/><path class="thin" d="M25 44h25"/>`),
    sandale:    art(`<path class="fill" d="M13 40c0-2 1-3 3-3h31c3 0 5 1 5 3s-2 3-5 3H16c-2 0-3-1-3-3z"/><path d="M13 40c0-2 1-3 3-3h31c3 0 5 1 5 3s-2 3-5 3H16c-2 0-3-1-3-3z"/><path class="thin" d="M22 37l8-8M30 37l6-8M38 37l4-6"/>`),
    /* ── headwear ── */
    casquette:  art(`<path class="fill" d="M17 37c0-9 7-16 15-16s15 6 15 15v1H17z"/><path d="M17 37c0-9 7-16 15-16s15 6 15 15"/><path class="fill" d="M46 37c6 0 11 1 12 3 1 1 0 2-1 2l-11 1z"/><path d="M46 37c6 0 11 1 12 3 1 1 0 2-1 2l-11 1"/><path d="M17 38h30"/><path class="thin" d="M32 21v16"/>`),
    bonnet:     art(`<path class="fill" d="M18 40c0-12 6-20 14-20s14 8 14 20z"/><path d="M18 40c0-12 6-20 14-20s14 8 14 20"/><path class="fill" d="M16 40h32v5H16z"/><path d="M16 40h32v5H16z"/><path class="thin" d="M25 22v18M32 20v20M39 22v18"/>`),
    /* ── jewellery & accessories ── */
    collier:    art(`<path d="M19 16c0 15 6 25 13 25s13-10 13-25"/><path class="fill" d="M32 41l-4 6 4 5 4-5z"/><path d="M32 41l-4 6 4 5 4-5z"/><path class="thin" d="M23 27v1M27 33v1M41 27v1M37 33v1"/>`),
    bracelet:   art(`<path class="fill" fill-rule="evenodd" d="M32 17a16 16 0 100 32 16 16 0 000-32zm0 7a9 9 0 110 18 9 9 0 010-18z"/><circle cx="32" cy="33" r="16"/><circle cx="32" cy="33" r="9"/><path class="fill" d="M32 12l5 6-5 6-5-6z"/><path d="M32 12l5 6-5 6-5-6z"/>`),
    bague:      art(`<path class="fill" fill-rule="evenodd" d="M32 30a11 11 0 100 22 11 11 0 000-22zm0 6a5 5 0 110 10 5 5 0 010-10z"/><circle cx="32" cy="41" r="11"/><circle cx="32" cy="41" r="5"/><path class="fill" d="M32 12l6 9-6 8-6-8z"/><path d="M32 12l6 9-6 8-6-8z"/><path d="M26 21l6 6 6-6"/>`),
    boucles:    art(`<path d="M24 16c-3 0-5 2-5 5"/><circle class="fill" cx="24" cy="30" r="6"/><circle cx="24" cy="30" r="6"/><path d="M40 18c-3 0-5 2-5 5"/><circle class="fill" cx="40" cy="34" r="6"/><circle cx="40" cy="34" r="6"/>`),
    /* ── bags & leather ── */
    sac_dos:    art(`<path class="fill" d="M19 26c0-7 6-12 13-12s13 5 13 12v22c0 2-1 3-3 3H22c-2 0-3-1-3-3z"/><path d="M19 26c0-7 6-12 13-12s13 5 13 12v22c0 2-1 3-3 3H22c-2 0-3-1-3-3z"/><path class="fill" d="M26 34h12v15H26z"/><path d="M26 34h12v15H26z"/><path class="thin" d="M28 26h8"/><path d="M27 15c2-3 8-3 10 0"/>`),
    portefeuille:art(`<rect class="fill" x="12" y="22" width="40" height="22" rx="3"/><rect x="12" y="22" width="40" height="22" rx="3"/><path class="fill" d="M40 30h13v8H40a4 4 0 010-8z"/><path d="M40 30h13v8H40a4 4 0 010-8z"/><circle class="thin" cx="44" cy="34" r="1.6"/>`),
    valise:     art(`<rect class="fill" x="16" y="24" width="32" height="26" rx="3"/><rect x="16" y="24" width="32" height="26" rx="3"/><path d="M26 24v-4c0-2 1-3 3-3h6c2 0 3 1 3 3v4"/><path class="thin" d="M24 24v26M40 24v26"/>`),
    parapluie:  art(`<path class="fill" d="M11 35c0-12 9-21 21-21s21 9 21 21c-3 4-7 4-10 0-3 4-7 4-10 0-3 4-7 4-10 0-3 4-9 4-12 0z"/><path d="M11 35c0-12 9-21 21-21s21 9 21 21"/><path d="M11 35c3 4 7 4 10 0 3 4 7 4 10 0 3 4 7 4 10 0 3 4 9 4 12 0"/><path d="M32 35v13a4 4 0 01-8 0"/>`),
    /* ── Moroccan traditional (extended) ── */
    djellaba:   art(`<path class="fill" d="M26 14 13 20l4 8 5-3-4 25h28l-4-25 5 3 4-8-13-6c-2 3-6 3-8 0z"/><path d="M26 14 13 20l4 8 5-3-4 25h28l-4-25 5 3 4-8-13-6"/><path class="fill" d="M30 6l5 8-3 4-3-4z"/><path d="M30 6l5 8-3 4-3-4z"/><path d="M26 14c2 3 6 3 8 0"/><path d="M32 18v37"/><path class="thin" d="M22 32h20"/>`),
    gandoura:   art(`<path class="fill" d="M22 16 12 22l4 7 4-2v27h24V27l4 2 4-7-10-6c-3 3-9 3-12 0z"/><path d="M22 16 12 22l4 7 4-2v27h24V27l4 2 4-7-10-6"/><path d="M26 16c1 3 11 3 12 0"/><path class="thin" d="M28 16v6h8v-6"/><path class="thin" d="M30 24v22M34 24v22"/>`),
    jabador:    art(`<path class="fill" d="M23 15 13 21l4 8 5-3v24h22V26l5 3 4-8-10-6c-2 3-8 3-11 0z"/><path d="M23 15 13 21l4 8 5-3v24h22V26l5 3 4-8-10-6"/><path d="M27 15l5 3 6-3"/><path class="thin" d="M32 18v27"/><path class="thin" d="M29 24h6M29 30h6M29 36h6"/>`),
    selham:     art(`<path class="fill" d="M32 14c-10 0-20 10-22 36h44c-2-26-12-36-22-36z"/><path d="M32 14c-10 0-20 10-22 36h44c-2-26-12-36-22-36z"/><path class="fill" d="M32 14l-4 8h8z"/><path d="M32 14l-4 8h8z"/><path class="thin" d="M32 22v28"/>`),
    tarbouche:  art(`<path class="fill" d="M23 24c0-2 4-3 9-3s9 1 9 3l-1 20H24z"/><path d="M23 24c0-2 4-3 9-3s9 1 9 3l-1 20H24z"/><path class="thin" d="M23 24c0 2 4 3 9 3s9-1 9-3"/><path d="M32 21v-4"/><circle class="thin" cx="32" cy="15" r="2"/>`),
  };

  /* Product-icon "database" for the create/edit picker — ordered + labelled.
     artOf() renders a product's icon with a safe default so nothing is blank. */
  const DEFAULT_ICON = 'cintre';
  const artOf = (k) => ART[k] || ART[DEFAULT_ICON];
  const ICON_LABELS = {
    tshirt: 'T-shirt / Haut', chemise: 'Chemise', debardeur: 'Débardeur', pull: 'Pull', sweat: 'Sweat / Hoodie',
    pantalon: 'Pantalon / Jean', short: 'Short', jupe: 'Jupe', robe: 'Robe', combinaison: 'Combinaison',
    veste: 'Veste / Manteau', chaussures: 'Chaussures', basket: 'Basket', botte: 'Bottes', sandale: 'Sandales',
    chapeau: 'Chapeau', casquette: 'Casquette', bonnet: 'Bonnet', ceinture: 'Ceinture', cravate: 'Cravate',
    echarpe: 'Écharpe', gants: 'Gants', chaussettes: 'Chaussettes', lunettes: 'Lunettes', montre: 'Montre',
    bracelet: 'Bracelet', bague: 'Bague', collier: 'Collier', boucles: 'Boucles d’oreille', broche: 'Broche / Bijou',
    parfum: 'Parfum', sac_main: 'Sac à main', sac: 'Sac', sac_dos: 'Sac à dos', cabas: 'Cabas',
    pochette: 'Pochette', portefeuille: 'Portefeuille', valise: 'Valise', parapluie: 'Parapluie', tag: 'Étiquette',
    cintre: 'Cintre', caftan: 'Caftan', takchita: 'Takchita', djellaba: 'Djellaba', gandoura: 'Gandoura',
    jabador: 'Jabador', selham: 'Selham', tarbouche: 'Tarbouche', foulard: 'Foulard', chale: 'Châle',
    mdamma: 'Mdamma', babouche: 'Babouche',
  };
  const ICON_KEYS = [
    // Hauts
    'tshirt', 'chemise', 'debardeur', 'pull', 'sweat',
    // Bas
    'pantalon', 'short', 'jupe',
    // Pièces entières
    'robe', 'combinaison', 'veste',
    // Traditionnel marocain
    'caftan', 'takchita', 'djellaba', 'gandoura', 'jabador', 'selham',
    // Chaussures
    'chaussures', 'basket', 'botte', 'sandale', 'babouche',
    // Couvre-chef
    'chapeau', 'casquette', 'bonnet', 'tarbouche',
    // Accessoires & bijoux
    'ceinture', 'cravate', 'echarpe', 'foulard', 'chale', 'gants', 'chaussettes',
    'lunettes', 'montre', 'bracelet', 'bague', 'collier', 'boucles', 'broche', 'mdamma', 'parfum',
    // Sacs & maroquinerie
    'sac_main', 'sac', 'sac_dos', 'cabas', 'pochette', 'portefeuille', 'valise',
    // Divers
    'parapluie', 'tag', 'cintre',
  ];
  function iconPickerHtml(sel) {
    return `<div class="mzi-iconpick">${ICON_KEYS.map((k) => `<button type="button" class="mzi-icon${k === sel ? ' on' : ''}" data-icon-key="${k}" title="${esc(ICON_LABELS[k] || k)}">${ART[k]}</button>`).join('')}</div>`;
  }
  function wireIconPicker(el, onPick) {
    el.querySelectorAll('.mzi-icon').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.mzi-icon').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (onPick) onPick(b.getAttribute('data-icon-key'));
    }));
  }

  /* ───────────────────────── couleurs ─────────────────────────
     Aucune palette n'est définie ici. Ce module lisait autrefois sa propre liste
     de treize nuances, copiée à l'identique dans boutique-catalog.js : deux
     copies d'une même vérité finissent toujours par diverger. Le vocabulaire
     vit dans assets/color-palette.js (window.KiwiColors) — des FAMILLES
     générales, choisies à la pastille, jamais à la nuance. `colorOf()` accepte
     n'importe quelle valeur historique ou importée et rend toujours une famille
     affichable : une variante ne peut pas devenir grise faute de correspondance. */
  const KC = () => window.KiwiColors || null;
  const KC_MISS = { id: 'gris', label: 'Gris', hex: '#9AA0A6' };
  function colorOf(id) { const k = KC(); return (k && k.normalize(id)) || KC_MISS; }
  function colorLabel(id) { return colorOf(id).label; }
  function colorHex(id) { return colorOf(id).hex; }
  // Une pastille non cliquable (ligne de ticket, retour, tableau) — même dessin
  // que dans le tableau de bord, nom porté par title/aria plutôt qu'écrit.
  function colorDot(id, size) {
    const k = KC();
    if (k) return k.swatch(id, { size: size || 'sm' });
    return `<i class="kc-sw kc-sm" style="background-color:${KC_MISS.hex}" title="${KC_MISS.label}"></i>`;
  }
  function variantColor(v) {
    const k = KC();
    return (k && k.display ? k.display(v.colorId, v.colorLabel, v.colorHex) : colorOf(v.colorFamily || v.colorId));
  }

  /* ── clients: real store = the shared KiwiClients book (assets/clients-store.js) ──
     A REAL/paired boutique reads its picker, ticket and « Nouvelle cliente » from
     KiwiClients — so it shows its OWN clients (empty until captured on the till) and
     any client added in the dashboard « Clients » appears here too. The pitch demo
     (unpaired PIN 0002) keeps the rich hard-coded CLIENTES above. */
  function isDemoStore() { try { return !bqReal(); } catch (_) { return true; } }   // pitch demo = local, unpaired, not signed-in
  function useKiwiCl() { return !isDemoStore() && !!window.KiwiClients; }
  function fromKiwi(c) {
    if (!c) return null;
    return { id: c.id, name: c.name || 'Sans nom', phone: c.phone || '', points: c.points || 0,
      taille: '', achats: c.visits || 0, spent: c.spend || 0,
      vip: !!(window.KiwiClients && KiwiClients.segment(c) === 'vip'), prefs: c.notes ? [c.notes] : [], history: Array.isArray(c.history) ? c.history : [] };
  }
  // A REAL store shows ONLY its own KiwiClients book (empty until captured) — NEVER
  // the demo CLIENTES. The pitch demo keeps the rich hard-coded set.
  function clientList() {
    if (isDemoStore()) return CLIENTES;
    return window.KiwiClients ? window.KiwiClients.list().map(fromKiwi) : [];
  }
  function clById(id) {
    if (!id || id === 'passage') return null;
    if (isDemoStore()) return CL[id] || null;
    const c = window.KiwiClients && window.KiwiClients.get(id);
    return c ? fromKiwi(c) : null;
  }
  /* Fidélité — la récompense de CE client, lue sur le programme réel du magasin
     (KiwiClients.config). « Prête » = la carte est pleine / le seuil de points est
     atteint. Le type se déduit du modèle : amount → une remise en % sur le ticket
     (boutique « −10 % ») ; visit/product → un article offert (carte à tampons).
     Renvoie null pour la démo (pas de KiwiClients) et pour la cliente de passage. */
  function clReward(id) {
    if (isDemoStore() || !window.KiwiClients || !id || id === 'passage') return null;
    const raw = window.KiwiClients.get(id);
    if (!raw) return null;
    const cfg = (window.KiwiClients.config && window.KiwiClients.config()) || {};
    const ready = window.KiwiClients.progress ? window.KiwiClients.progress(raw, cfg) >= 1 : false;
    let kind = 'percent', value = 10, label = '−10 %';
    if (cfg.model === 'amount') {
      const txt = (cfg.amount && cfg.amount.reward) || '−10 %';
      const m = String(txt).match(/(\d+)\s*%/);
      kind = 'percent'; value = m ? +m[1] : 10; label = txt;
    } else {
      const txt = (cfg.model === 'product' ? (cfg.product && cfg.product.reward) : (cfg.visit && cfg.visit.reward)) || '1 offert';
      kind = 'free'; label = txt;
    }
    return { ready: ready, kind: kind, value: value, label: label };
  }

  /* ═══════════════════════ VENTE — grille par rayon / marque / motif ═══════════════════════ */
  function listAllDistinctMarques() {
    const s = new Set();
    RAYONS.forEach((r) => r.items.forEach((p) => { if (p.marque) s.add(p.marque); }));
    return Array.from(s).sort();
  }
  function listAllDistinctMotifs() {
    const s = new Set();
    RAYONS.forEach((r) => r.items.forEach((p) => { if (p.motif) s.add(p.motif); }));
    return Array.from(s).sort();
  }
  function countFragileItems() {
    let count = 0;
    RAYONS.forEach((r) => r.items.forEach((p) => { if (p.fragile) count++; }));
    return count;
  }

  function renderCats() {
    const all = RAYONS.reduce((s, r) => s + r.items.length, 0);
    const promoN = promoedIds().size;
    const fragileN = countFragileItems();
    const marques = listAllDistinctMarques();
    const motifs = listAllDistinctMotifs();
    const axis = state.filterAxis || 'rayons';

    const axisRow = `
      <div class="mz-filter-axis">
        <button class="mz-axis-btn ${axis === 'rayons' ? 'on' : ''}" data-mz-axis="rayons"><i data-lucide="layout-grid"></i>Rayons</button>
        ${marques.length ? `<button class="mz-axis-btn ${axis === 'marques' ? 'on' : ''}" data-mz-axis="marques"><i data-lucide="tag"></i>Marques (${marques.length})</button>` : ''}
        ${motifs.length ? `<button class="mz-axis-btn ${axis === 'motifs' ? 'on' : ''}" data-mz-axis="motifs"><i data-lucide="sparkles"></i>Motifs (${motifs.length})</button>` : ''}
        ${promoN ? `<button class="mz-axis-btn ${axis === 'promo' ? 'on' : ''}" data-mz-axis="promo"><i data-lucide="flame"></i>En promo (${promoN})</button>` : ''}
        ${fragileN ? `<button class="mz-axis-btn ${axis === 'fragile' ? 'on' : ''}" data-mz-axis="fragile"><i data-lucide="shield-alert"></i>Fragile (${fragileN})</button>` : ''}
      </div>`;

    let chipsRow = '';
    if (axis === 'rayons') {
      chipsRow = `
        <div class="mz-cats-row">
          <button class="mz-cat ${state.rayon === 'tous' ? 'on' : ''}" data-mz-cat="tous">Tous <span class="mz-cat-ct">${all}</span></button>
          ${RAYONS.map((r) => `<button class="mz-cat ${state.rayon === r.id ? 'on' : ''}" data-mz-cat="${r.id}">${esc(r.label)} <span class="mz-cat-ct">${r.items.length}</span></button>`).join('')}
        </div>`;
    } else if (axis === 'marques') {
      chipsRow = `
        <div class="mz-cats-row">
          <button class="mz-cat ${state.selectedMarque === 'tous' ? 'on' : ''}" data-mz-marque="tous">Toutes les marques</button>
          ${marques.map((m) => {
            const count = RAYONS.reduce((acc, r) => acc + r.items.filter((p) => p.marque === m).length, 0);
            return `<button class="mz-cat ${state.selectedMarque === m ? 'on' : ''}" data-mz-marque="${esc(m)}">${esc(m)} <span class="mz-cat-ct">${count}</span></button>`;
          }).join('')}
        </div>`;
    } else if (axis === 'motifs') {
      chipsRow = `
        <div class="mz-cats-row">
          <button class="mz-cat ${state.selectedMotif === 'tous' ? 'on' : ''}" data-mz-motif-filter="tous">Tous les motifs</button>
          ${motifs.map((mot) => {
            const count = RAYONS.reduce((acc, r) => acc + r.items.filter((p) => p.motif === mot).length, 0);
            return `<button class="mz-cat ${state.selectedMotif === mot ? 'on' : ''}" data-mz-motif-filter="${esc(mot)}">${esc(mot)} <span class="mz-cat-ct">${count}</span></button>`;
          }).join('')}
        </div>`;
    } else if (axis === 'promo') {
      chipsRow = `<div class="mz-cats-row"><button class="mz-cat on" data-mz-cat="_promo">Articles en promotion (${promoN})</button></div>`;
    } else if (axis === 'fragile') {
      chipsRow = `<div class="mz-cats-row"><button class="mz-cat on" data-mz-axis="fragile">Articles céramique & verrerie fragile (${fragileN})</button></div>`;
    }

    const catsEl = $('#mz-cats', root);
    if (!catsEl) return;
    catsEl.innerHTML = `<div class="mz-filter-wrap">${axisRow}${chipsRow}</div>`;

    catsEl.onclick = (e) => {
      const axisB = e.target.closest('[data-mz-axis]');
      if (axisB) {
        state.filterAxis = axisB.dataset.mzAxis;
        if (state.filterAxis === 'rayons') state.rayon = 'tous';
        if (state.filterAxis === 'marques') state.selectedMarque = 'tous';
        if (state.filterAxis === 'motifs') state.selectedMotif = 'tous';
        renderCats(); renderGrid(); icons();
        return;
      }
      const catB = e.target.closest('[data-mz-cat]');
      if (catB) {
        state.rayon = catB.dataset.mzCat || catB.dataset.mzCat;
        renderCats(); renderGrid(); icons();
        return;
      }
      const marqB = e.target.closest('[data-mz-marque]');
      if (marqB) {
        state.selectedMarque = marqB.dataset.mzMarque;
        renderCats(); renderGrid(); icons();
        return;
      }
      const motB = e.target.closest('[data-mz-motif-filter]');
      if (motB) {
        state.selectedMotif = motB.dataset.mzMotifFilter;
        renderCats(); renderGrid(); icons();
        return;
      }
    };
  }

  function cardFlag(p) {
    const st = p && p.format === 'service' ? sellableStockOf(p) : stockOf(p);
    if (st === 0) return '<span class="mz-card-flag out">épuisé</span>';
    if (st <= 2) return '<span class="mz-card-flag low">stock bas</span>';
    if (p.flag) return `<span class="mz-card-flag">${esc(p.flag)}</span>`;
    return '';
  }

  /* Les articles qui portent une étiquette promo en ce moment. Un Set : deux
     promotions sur le même article ne le comptent pas deux fois. */
  function promoedIds() {
    const out = new Set();
    if (!window.KiwiPromos) return out;
    RAYONS.forEach((r) => r.items.forEach((it) => { if (promoFor(it.id)) out.add(it.id); }));
    return out;
  }

  function renderGrid() {
    let rayons = RAYONS;
    const axis = state.filterAxis || 'rayons';

    if (axis === 'promo') {
      const ids = promoedIds();
      rayons = RAYONS.map((r) => ({ ...r, items: r.items.filter((it) => ids.has(it.id)) })).filter((r) => r.items.length);
    } else if (axis === 'fragile') {
      rayons = RAYONS.map((r) => ({ ...r, items: r.items.filter((it) => !!it.fragile) })).filter((r) => r.items.length);
    } else if (axis === 'marques') {
      if (state.selectedMarque && state.selectedMarque !== 'tous') {
        rayons = RAYONS.map((r) => ({ ...r, items: r.items.filter((it) => it.marque === state.selectedMarque) })).filter((r) => r.items.length);
      }
    } else if (axis === 'motifs') {
      if (state.selectedMotif && state.selectedMotif !== 'tous') {
        rayons = RAYONS.map((r) => ({ ...r, items: r.items.filter((it) => it.motif === state.selectedMotif) })).filter((r) => r.items.length);
      }
    } else {
      rayons = state.rayon === 'tous' ? RAYONS : RAYONS.filter((r) => r.id === state.rayon);
    }

    let i = 0;
    $('#mz-gridwrap', root).innerHTML = (rayons.length ? rayons.map((r) => `
      <div class="mz-cat-head">${esc(r.label)}</div>
      <div class="mz-grid">${r.items.map((p) => {
        const pr = promoFor(p.id);
        return `
        <button class="mz-card ${(p.format === 'service' ? sellableStockOf(p) : stockOf(p)) === 0 ? 'is-out' : ''}${pr ? ' is-promo' : ''}" data-mz-item="${p.id}" style="--i:${i++}">
          <span class="mz-card-art">${artOf(p.art)}</span>
          ${p.marque ? `<span class="mz-card-brand">${esc(p.marque)}</span>` : ''}
          ${isConsignedProduct(p) ? `<span class="mz-consign-tag" title="Catégorie B">B</span>` : ''}
          <span class="mz-card-name">${esc(p.name)}</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
            ${p.motif ? `<span class="mz-card-motif">${esc(p.motif)}</span>` : ''}
            ${p.format === 'service' ? `<span class="mz-card-fmt">Service ${p.servicePieces ? p.servicePieces + ' pcs' : ''}</span>` : ''}
            ${p.fragile ? `<span class="mz-card-fragile"><i data-lucide="shield-alert"></i>Fragile</span>` : ''}
          </div>
          <span class="mz-card-price">${pr ? `<s>${fmtMAD(pr.was)}</s> ` : ''}${fmtMAD(pr ? pr.price : shelf(p.price))}</span>
          ${cardFlag(p)}
          ${pr ? `<span class="mz-card-promo" title="${esc(pr.promo.name)}">${esc(pr.badge)}</span>` : ''}
        </button>`; }).join('')}
      </div>`).join('') : '<div class="mz-empty" style="margin:40px auto; text-align:center;">Aucun article dans cette sélection.</div>');
    $('#mz-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-mz-item]');
      if (b) openSheet(b.dataset.mzItem || b.dataset.mzItem, state.exchange ? { exchange: true } : null);
    };
  }

  function renderExchNote() {
    const slot = $('#mz-exch-slot', root);
    if (!state.exchange) { slot.innerHTML = ''; return; }
    const sale = findSale(state.exchange.saleId);
    const ln = sale.lines[state.exchange.idx];
    slot.innerHTML = `
      <div class="mz-exch-note">
        <i data-lucide="arrow-left-right"></i>
        <span class="l">Échange <b>${sale.id}</b>, retour <b>${esc((P[ln.pid] && P[ln.pid].name) || ln.name || 'Article')} · ${esc(ln.size)}</b> (${fmtMAD(ln.unit)}).
        Touchez l'article de remplacement dans la grille.</span>
        <button class="mz-exch-cancel" id="mz-exch-cancel">Annuler l'échange</button>
      </div>`;
    $('#mz-exch-cancel', slot).onclick = () => {
      state.exchange = null;
      renderExchNote();
      toast('Échange annulé, rien n\'a bougé');
      icons();
    };
    icons();
  }

  /* ═══════════════════════ TICKET ═══════════════════════ */
  function clientRow(t) {
    if (!t.client) {
      return `<button class="mz-tk-row" id="mz-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une cliente</b><span>Téléphone d'abord, points et taille suivent</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.client === 'passage') {
      return `<button class="mz-tk-row is-set" id="mz-tk-client"><i data-lucide="user"></i>
        <span class="l"><b>Cliente de passage</b><span>Sans fiche, retrouvable par n° de ticket</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = clById(t.client);
    if (!c) return `<button class="mz-tk-row" id="mz-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une cliente</b><span>Téléphone d'abord, points et taille suivent</span></span>
        <span class="edit">Chercher</span></button>`;
    const sub = [esc(c.phone) || '·', c.points + ' pts', c.taille ? 'taille ' + esc(c.taille) : ''].filter(Boolean).join(' · ');
    return `<button class="mz-tk-row is-set" id="mz-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${sub}</span></span>
      ${c.vip ? '<span class="mz-vip-chip">VIP</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  /* La récompense fidélité au moment d'encaisser : quand la cliente attachée a
     assez de points / une carte pleine, une pastille « Utiliser » apparaît sous
     sa fiche. Un geste : la remise s'applique au ticket, les points ne sont
     débités qu'au paiement (redeem dans onPaid) — annulable tant qu'on n'a pas
     encaissé. Rien en démo ni pour la cliente de passage. */
  function rewardRow(t) {
    if (!t.client || t.client === 'passage') return '';
    if (t.reward && t.reward.clientId === t.client) {
      return `<button class="mz-reward-row is-on" id="mz-reward-toggle"><i data-lucide="gift"></i>
        <span class="l"><b>Récompense appliquée · ${esc(t.reward.label)}</b><span>Points débités à l'encaissement</span></span>
        <span class="edit">Annuler</span></button>`;
    }
    const rw = clReward(t.client);
    if (rw && rw.ready) {
      return `<button class="mz-reward-row" id="mz-reward-toggle"><i data-lucide="gift"></i>
        <span class="l"><b>Récompense prête · ${esc(rw.label)}</b><span>${rw.kind === 'percent' ? 'Remise fidélité sur ce ticket' : 'Un article offert sur ce ticket'}</span></span>
        <span class="edit">Utiliser</span></button>`;
    }
    return '';
  }

  function renderTicket() {
    const t = state.ticket;
    const { promo, remise, reward, total } = ticketTotals(t);
    const count = ticketCount(t);
    const hasFragile = t.lines.some((ln) => ln.fragile || (P[ln.pid] && P[ln.pid].fragile));
    const el = $('#mz-ticket', root);
    el.innerHTML = `
      <div class="mz-tk-head">
        <div><span class="mz-tk-title">Ticket</span> <span class="mz-tk-num${t.num ? '' : t.numError ? ' err' : ''}">· ${t.num || (t.numError ? 'numéro indisponible' : 'attribution…')}${isOfflineRef(t.num) ? ' · hors-ligne' : ''} · par ${esc(STAFF.caissiere.name)}</span></div>
        ${!t.num && t.numError ? '<button class="mz-tk-retry" id="mz-tk-retry">Réessayer</button>' : ''}
        ${t.lines.length ? '<button class="mz-tk-reset" id="mz-tk-reset">Vider</button>' : ''}
      </div>
      <div class="mz-tk-meta">${clientRow(t)}${rewardRow(t)}</div>
      <div class="mz-tk-lines" id="mz-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') : `
          <div class="mz-tk-empty">
            <i data-lucide="shopping-bag"></i>
            <div>Le ticket est vide.<br>Touchez un article dans la grille, ou scannez son code-barres.</div>
          </div>`}
      </div>
      <div class="mz-tk-foot">
        ${t.lines.length ? `
        <div class="mz-tk-opt-bar">
          <button class="mz-tk-opt-btn ${t.giftWrap ? 'on' : ''}" id="mz-tk-giftwrap"><i data-lucide="gift"></i> ${t.giftWrap ? 'Emballage cadeau inclus' : '+ Emballage cadeau'}</button>
          <button class="mz-tk-opt-btn ${t.delivery ? 'on' : ''}" id="mz-tk-delivery"><i data-lucide="truck"></i> ${t.delivery ? 'Livraison Tanger (' + esc(t.delivery.quartier || 'Prévue') + ')' : '+ Livraison à domicile'}</button>
        </div>
        ${hasFragile ? `<div class="mz-fragile-alert"><i data-lucide="shield-alert"></i> <span>Articles fragiles · Emballage renforcé automatique</span></div>` : ''}
        ` : ''}
        <div class="mz-tk-tot">
          <span class="pcs"><i data-lucide="tag"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${promo ? `<span class="rem promo">Promotions · −${fmtMAD(promo)}</span>` : ''}
          ${remise ? `<span class="rem">Remise · −${fmtMAD(remise)}</span>` : ''}
          ${reward ? `<span class="rem rew">Récompense · −${fmtMAD(reward)}</span>` : ''}
        </div>
        <div class="mz-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="mz-validate" id="mz-validate" ${t.lines.length && t.num ? '' : 'disabled'}>
          <i data-lucide="banknote"></i> ${t.num ? `Encaisser · ${fmtMAD(total)}` : t.numError ? 'Numéro de ticket indisponible' : 'Attribution du numéro…'}
        </button>
      </div>`;
    const retry = $('#mz-tk-retry', el);
    if (retry) retry.onclick = () => {
      retry.disabled = true;
      assignTicketNumber(t).then(
        () => toast('Numéro attribué · ticket ' + t.num),
        () => toast('Numéro de ticket toujours indisponible', state.ticketStorageError
          ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
          : 'Reconnectez cette caisse pour réserver sa prochaine série.')
      );
    };
    const reset = $('#mz-tk-reset', el);
    if (reset) reset.onclick = () => {
      t.lines.forEach((ln) => releaseStock(ln.pid, ln.size, ln.qty, ln.isPiece));
      freshTicket();                      /* ticket ET cliente remis à zéro — pas d'attache auto */
      renderTicket(); renderGrid(); renderBadges(); icons();
      toast('Ticket vidé, articles remis en stock');
    };
    $('#mz-tk-client', el).onclick = openClientModal;
    const rwBtn = $('#mz-reward-toggle', el);
    if (rwBtn) rwBtn.onclick = () => {
      if (t.reward && t.reward.clientId === t.client) {
        t.reward = null;
        toast('Récompense retirée du ticket');
      } else {
        const rw = clReward(t.client);
        if (!rw || !rw.ready) { toast('Pas encore de récompense pour cette cliente'); return; }
        t.reward = { clientId: t.client, kind: rw.kind, value: rw.value, label: rw.label };
        toast('Récompense appliquée', rw.label);
      }
      renderTicket(); icons();
    };
    const gwBtn = $('#mz-tk-giftwrap', el);
    if (gwBtn) gwBtn.onclick = () => {
      t.giftWrap = !t.giftWrap;
      renderTicket(); icons();
      toast(t.giftWrap ? 'Option emballage cadeau activée' : 'Emballage standard');
    };
    const delBtn = $('#mz-tk-delivery', el);
    if (delBtn) delBtn.onclick = openDeliveryModal;
    $('#mz-validate', el).onclick = checkout;
    $('#mz-tk-lines', el).onclick = (e) => {
      const minus = e.target.closest('[data-mz-minus]');
      const plus = e.target.closest('[data-mz-plus]');
      const idx = minus ? +minus.dataset.mzMinus : plus ? +plus.dataset.mzPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        const u = holdStock(ln.pid, ln.size, 1, ln.isPiece);
        if (u === false) {
          toast(`${P[ln.pid].name} · ${ln.size}, plus de stock, dernière pièce déjà sur le ticket`);
          return;
        }
        ln.units = (ln.units || 0) + u;
        ln.qty++;
      } else {
        ln.units = (ln.units || 0) - releaseStock(ln.pid, ln.size, 1, ln.isPiece);
        ln.qty--;
        if (ln.qty <= 0) t.lines.splice(idx, 1);
      }
      renderTicket(); renderGrid(); renderBadges(); icons();
    };
    icons();
  }

  function lineRow(ln, i) {
    const p = P[ln.pid];
    const u = lineUnit(ln);
    const pr = linePromo(ln);
    const origPrice = shelf((ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0));
    return `<div class="mz-line">
      <span class="mz-line-art">${artOf(p.art)}</span>
      <span class="mz-line-mid">
        ${(ln.marque || p.marque) ? `<span class="mz-line-brand">${esc(ln.marque || p.marque)}</span>` : ''}
        ${isConsignedProduct(p) ? `<span class="mz-consign-tag" title="Catégorie B">B</span>` : ''}
        <span class="mz-line-name">${esc(p.name)}</span>
        <span class="mz-line-sub">
          ${colorDot(ln.color)}
          <span class="sz">${esc(ln.size)}</span> ${esc(colorLabel(ln.color))}
          ${ln.format === 'service' ? `<span class="mz-line-fmt">Service (${ln.servicePieces || p.servicePieces || 18} pcs)</span>` : (ln.isPiece ? '<span class="mz-line-fmt">À la pièce</span>' : '')}
          ${(ln.motif || p.motif) ? `<span class="mz-line-motif">${esc(ln.motif || p.motif)}</span>` : ''}
          ${(ln.fragile || p.fragile) ? '<span class="mz-line-fragile">Fragile</span>' : ''}
          ${ln.registryTitle ? `<span class="mz-line-reg">Liste : ${esc(ln.registryTitle)}</span>` : ''}
          ${pr ? `<span class="mz-line-promo" title="${esc(pr.name || 'Promotion')}"><i data-lucide="tag"></i>${esc(pr.badge)}</span>` : ''}
          ${ln.remise ? `<span class="mz-line-rem">−${ln.remise} %</span>` : ''}
        </span>
      </span>
      <span class="mz-line-right">
        <span class="mz-line-price">${(ln.remise || pr) ? `<span class="was">${fmtMAD(origPrice * ln.qty)}</span>` : ''}${fmtMAD(u * ln.qty)}</span>
        <span class="mz-line-qty">
          <button data-mz-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-mz-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* ───────────────── STOCK ARITHMETIC : Service vs Pièce ─────────────────
   * Un service complet (ex: service 18 pièces) est stocké comme une unité (1 set).
   * 1. Vente d'un service complet : décrémente 1 unité entière du stock de la déclinaison.
   * 2. Vente d'une pièce individuelle hors service : facturée à `piecePriceMAD`.
   *    Au niveau de l'inventaire matériel, la vente d'une pièce décrémente
   *    le stock de la déclinaison avec le motif explicite 'vente · pièce hors service'
   *    ou gère le ratio 1/N pièces pour que le commerçant conserve la traçabilité exacte
   *    du set dépareillé sans fausser le décompte des services complets.
   * ────────────────────────────────────────────────────────────────────────── */
  /* ───────────────── PIÈCES DÉPAREILLÉES ─────────────────
   * Une cliente qui casse une assiette revient en racheter UNE, pas un service
   * de dix-huit. Décrémenter un set entier à chaque pièce vendue sortait
   * 1 450 MAD de stock pour 85 MAD encaissés : après quatre assiettes le stock
   * de services affichait zéro pendant que 68 pièces restaient en rayon.
   *
   * On fait donc ce que fait le magasin : on OUVRE un set, et les N−1 pièces
   * restantes deviennent du dépareillé qui sert les ventes suivantes. Le
   * décompte des services complets reste vrai, les pièces libres sont comptées,
   * et un retour qui reconstitue un set entier le referme.
   *
   * Rangé par commerce, comme les listes cadeaux et le journal de casse : une
   * caisse qui change de commerce par jumelage ne doit pas hériter du
   * dépareillé du voisin. */
  const LOOSE_KEY = 'kiwi:mzLoose';
  let LOOSE = null;
  function loadLoose() {
    if (LOOSE) return LOOSE;
    try { LOOSE = JSON.parse(localStorage.getItem(LOOSE_KEY + ':' + merchantSlug()) || '{}'); } catch (_) { LOOSE = null; }
    if (!LOOSE || typeof LOOSE !== 'object') LOOSE = {};
    return LOOSE;
  }
  function saveLoose() {
    try { localStorage.setItem(LOOSE_KEY + ':' + merchantSlug(), JSON.stringify(loadLoose())); } catch (_) {}
  }
  const looseKey = (pid, size) => pid + '·' + size;
  function looseOf(pid, size) { return +loadLoose()[looseKey(pid, size)] || 0; }
  function setLoose(pid, size, n) {
    const d = loadLoose(), k = looseKey(pid, size);
    if (n > 0) d[k] = n; else delete d[k];
    saveLoose();
  }
  const piecesPerSet = (p) => Math.max(1, +p.servicePieces || 1);
  /* Une ligne se compte en pièces détachées seulement si elle est vendue à la
     pièce ET que l'article est un service — une assiette vendue seule, qui est
     son propre article, garde le décompte normal. */
  const sellsLoose = (p, isPiece) => !!isPiece && (p.format === 'service' || +p.servicePieces > 0);

  /* Retire `qty` pièces : d'abord le dépareillé, puis en ouvrant des sets.
     Renvoie false si les sets ne suffisent pas — et ne modifie alors RIEN. */
  function takeLoose(pid, size, qty) {
    const p = P[pid], per = piecesPerSet(p);
    let free = looseOf(pid, size);
    const open = free >= qty ? 0 : Math.ceil((qty - free) / per);
    if (open > (p.sizes[size] || 0)) return false;
    if (open) { stockAdd(pid, size, -open); free += open * per; }
    setLoose(pid, size, free - qty);
    return open;
  }
  /* Rend `qty` pièces, et referme tout set entier reconstitué. */
  function giveLoose(pid, size, qty) {
    const p = P[pid], per = piecesPerSet(p);
    let free = looseOf(pid, size) + qty;
    const whole = Math.floor(free / per);
    if (whole) { stockAdd(pid, size, whole); free -= whole * per; }
    setLoose(pid, size, free);
    return whole;
  }
  /* Les quatre chemins qui bougent du stock pour un ticket passent par ces
     deux-là — ajout, stepper, vidage, reprise — pour que la règle pièce/set
     n'existe qu'à un seul endroit. */
  /* Les deux renvoient un nombre d'UNITÉS DE CATALOGUE — des sets, pas des
     pièces. C'est ce que le catalogue partagé compte, donc c'est ce que la
     vente doit lui écrire : vendre une assiette prise dans du dépareillé ne
     bouge rien côté catalogue (0), n'ouvrir un set en écrit qu'un seul.
     holdStock renvoie false, et n'a rien modifié, si le stock ne suffit pas. */
  function holdStock(pid, size, qty, isPiece) {
    const p = P[pid];
    if (!p) return false;
    if (sellsLoose(p, isPiece)) return takeLoose(pid, size, qty);
    if ((p.sizes[size] || 0) < qty) return false;
    stockAdd(pid, size, -qty);
    return qty;
  }
  function releaseStock(pid, size, qty, isPiece) {
    const p = P[pid];
    if (!p) return 0;
    if (sellsLoose(p, isPiece)) return giveLoose(pid, size, qty);
    stockAdd(pid, size, qty);
    return qty;
  }

  function stockAvailable(pid, size, isPiece) {
    const p = P[pid];
    if (!p) return 0;
    return sellsLoose(p, isPiece)
      ? looseOf(pid, size) + (p.sizes[size] || 0) * piecesPerSet(p)
      : (p.sizes[size] || 0);
  }

  function sellableStockOf(p) {
    if (!p) return 0;
    return sizesOf(p).reduce((sum, size) => sum + stockAvailable(p.id, size, true), 0);
  }

  /* UI mirror of holdStock. It must use the same loose-piece arithmetic or a
     product with loose stock appears sold out even though the sale can work. */
  function canHoldStock(pid, size, qty, isPiece) {
    const p = P[pid];
    if (!p) return false;
    if (sellsLoose(p, isPiece)) {
      return looseOf(pid, size) + (p.sizes[size] || 0) * piecesPerSet(p) >= qty;
    }
    return (p.sizes[size] || 0) >= qty;
  }

  function addToTicket(pid, cfg, opts) {
    const p = P[pid];
    if (!p) return false;
    cfg = cfg || {};
    const size = cfg.size || sizesOf(p)[0];
    const color = cfg.color || p.colors[0];
    const qty = cfg.qty || 1;
    const isPiece = !!cfg.isPiece;
    const format = cfg.format || p.format || 'piece';
    const customPrice = cfg.customPrice != null ? shelf(cfg.customPrice) : (isPiece ? pieceUnitPrice(p) : null);

    const heldUnits = holdStock(pid, size, qty, isPiece);
    if (heldUnits === false) {
      toast(`${p.name} · ${size}, stock insuffisant`);
      return false;
    }
    const pr = promoForLine({ pid, isPiece, customPrice, servicePieces: p.servicePieces });
    const stamp = pr ? { price: pr.price, badge: pr.badge, name: pr.promo.name, id: pr.promo.id } : null;
    const same = state.ticket.lines.find((l) => l.pid === pid && l.size === size && l.color === color && l.remise === (cfg.remise || 0) && l.isPiece === isPiece && l.registryId === (cfg.registryId || null));
    if (same) {
      same.qty += qty;
      same.units = (same.units || 0) + heldUnits;
      if (stamp && (!same.promo || stamp.price < same.promo.price)) same.promo = stamp;
    } else {
      state.ticket.lines.push({
        pid, size, color, qty, remise: cfg.remise || 0, promo: stamp,
        /* `units` = ce que le CATALOGUE doit bouger au règlement ; `qty` = ce
           que la cliente emporte. Les deux diffèrent dès qu'on vend à la pièce. */
        units: heldUnits,
        format, isPiece, customPrice, servicePieces: p.servicePieces || null,
        marque: p.marque || '', motif: p.motif || '', fragile: !!p.fragile,
        registryId: cfg.registryId || null, registryTitle: cfg.registryTitle || null,
      });
    }
    renderTicket(); renderGrid(); renderBadges(); icons();
    if (!opts || !opts.quiet) toast(`${p.name} · ${isPiece ? 'À la pièce' : (format === 'service' ? 'Service complet' : size)}, sur le ticket`);
    return true;
  }

  /* ═══════════════════════ VARIANT SHEET ═══════════════════════ */
  const sheet = { pid: null, size: null, color: null, qty: 1, remise: 0, exchange: false, format: 'piece' };

  function defaultSize(p) {
    const c = ticketClient();
    if (!sheet.exchange && c && p.kind === 'taille' && (p.sizes[c.taille] || 0) > 0) return c.taille;
    return firstFree(p) || sizesOf(p)[0];
  }

  function openSheet(pid, opts) {
    window.KiwiDiscountPolicy?.refresh?.(); // the owner may have changed the allowed percentages
    const p = P[pid];
    Object.assign(sheet, {
      pid,
      size: null, color: p.colors[0], qty: 1, remise: 0,
      exchange: !!(opts && opts.exchange),
      format: p.format || 'piece',
    });
    sheet.size = defaultSize(p);
    renderSheet();
    openVeil('#mz-sheet-veil');
    icons();
    lens();
  }

  function renderSheet() {
    const p = P[sheet.pid];
    const c = ticketClient();
    const sheetPiece = p.format === 'service' && sheet.format === 'piece';
    const pieceBase = sheetPiece ? pieceUnitPrice(p) : null;
    const shPromo = promoForLine({ pid: sheet.pid, isPiece: sheetPiece, customPrice: pieceBase, servicePieces: p.servicePieces });
    const servicePromo = promoForLine({ pid: sheet.pid, isPiece: false });
    let shBase = shPromo ? shPromo.price : shelf(p.price);
    if (sheetPiece && !shPromo) shBase = pieceBase;
    const unit = shelf(shBase * (100 - sheet.remise) / 100);
    const canAdd = canHoldStock(sheet.pid, sheet.size, 1, sheetPiece);
    const el = $('#mz-sheetm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mz-sheet-head">
        <span class="mz-sheet-art">${artOf(p.art)}</span>
        <span class="mz-sheet-title">
          ${p.marque ? `<div class="mz-card-brand">${esc(p.marque)}</div>` : ''}
          ${isConsignedProduct(p) ? `<div class="mz-f-hint"><span class="mz-consign-tag" title="Catégorie B">B</span> Catégorie B${p.consignor ? ` · ${esc(p.consignor)}` : ''}</div>` : ''}
          <h3>${esc(p.name)}</h3>
          <span class="sub">
            ${esc((RAYONS.find((r) => r.id === p.rayon) || { label: 'Divers' }).label)}
            ${p.motif ? ` · Motif : <b>${esc(p.motif)}</b>` : ''}
            ${p.fragile ? ` · <span style="color:#B25E00;font-weight:700;">Fragile</span>` : ''}
            ${p.ean ? ` · ${esc(p.ean)}` : ''}
          </span>
        </span>
        <span class="mz-sheet-price">
          <span class="val" id="mz-sheet-total">${fmtMAD(unit * sheet.qty)}</span>
          <span class="per ${sheet.remise ? 'rem' : ''}" id="mz-sheet-per">${sheet.remise ? `−${sheet.remise} % · accord gérante` : `${unit} MAD × ${sheet.qty}`}</span>
        </span>
      </div>
      ${shPromo ? `
      <div class="mz-sheet-promo">
        <i data-lucide="tag"></i>
        <span class="l"><b>${esc(shPromo.promo.name)}</b><span>${esc(shPromo.badge)} · ${fmtMAD(shPromo.price)} au lieu de ${fmtMAD(shPromo.was)}</span></span>
      </div>` : ''}

      ${p.format === 'service' ? `
      <div class="mz-f">
        <div class="mz-f-lbl">Format de vente</div>
        <div class="mz-seg" id="mz-format-seg">
          <button class="mz-seg-it ${sheet.format !== 'piece' ? 'on' : ''}" data-mz-format="service">
            Service complet (${p.servicePieces || 18} pcs)
            <small>${fmtMAD(servicePromo ? servicePromo.price : shelf(p.price))}</small>
          </button>
          <button class="mz-seg-it ${sheet.format === 'piece' ? 'on' : ''}" data-mz-format="piece">
            À la pièce (1 unité)
            <small>${fmtMAD(pieceUnitPrice(p))}</small>
          </button>
        </div>
        ${(() => {
          /* Le dépareillé se VOIT, sinon la vendeuse ouvre un set neuf sans
             savoir qu'il reste des pièces d'un set déjà entamé. */
          const free = looseOf(p.id, sheet.size || sizesOf(p)[0]);
          return free
            ? `<div class="mz-f-hint">${free} pièce${free > 1 ? 's' : ''} dépareillée${free > 1 ? 's' : ''} d’un set déjà ouvert · servies en premier.</div>`
            : `<div class="mz-f-hint">Aucune pièce dépareillée : vendre à la pièce ouvrira un set.</div>`;
        })()}
      </div>` : ''}

      <div class="mz-f">
        <div class="mz-f-lbl">${sizeWord(p)} <span class="opt">· stock par modèle en direct</span></div>
        <div class="mz-seg" data-lens-demo id="mz-size-seg">
          ${sizesOf(p).map((s) => {
            const st = stockAvailable(p.id, s, sheetPiece);
            const usual = !sheet.exchange && c && p.kind === 'taille' && s === c.taille;
            return `<button class="mz-seg-it ${s === sheet.size ? 'on' : ''}" data-lens-item data-mz-size="${esc(s)}" ${st === 0 ? 'disabled' : ''}>
              ${usual ? '<span class="mz-seg-usual">habituelle</span>' : ''}${esc(s)}<small>${st === 0 ? 'épuisé' : `${st} ${sheetPiece ? 'pièce' + (st > 1 ? 's' : '') : 'en stock'}`}</small></button>`;
          }).join('')}
        </div>
      </div>

      <div class="mz-f">
        <div class="mz-f-lbl">Couleur / Motif</div>
        <div id="mz-colors">
          ${KC() ? KC().picker('mz-color', sheet.color, { ids: p.colors, size: 'lg' }) : ''}
        </div>
      </div>

      ${sheet.exchange ? '' : `
      <div class="mz-row-2">
        <div class="mz-f">
          <div class="mz-f-lbl">Quantité</div>
          <div class="mz-stepper">
            <button id="mz-qty-minus" aria-label="Moins">−</button>
            <b id="mz-qty-val">${sheet.qty}</b>
            <button id="mz-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="mz-f">
          <div class="mz-f-lbl">Remise <span class="opt">· accord gérante</span></div>
          <div class="mz-chips" id="mz-remise">
            ${[0, ...(window.KiwiDiscountPolicy?.percentages(_bqKey) || [5, 10, 15, 20])].map((r) => `<button class="mz-chip ${sheet.remise === r ? 'on' : ''}" data-mz-rem="${r}">${r === 0 ? 'Sans' : `−${r} %`}${r > 0 && !state.ticket.remiseAuth ? ' <i data-lucide="lock"></i>' : ''}</button>`).join('')}
          </div>
        </div>
      </div>`}

      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" data-mz-close>Annuler</button>
        ${sheet.exchange
          ? `<button class="mz-btn primary" id="mz-sheet-add" ${canAdd ? '' : 'disabled'}><i data-lucide="arrow-left-right"></i>Choisir cet article · ${fmtMAD(shBase)}</button>`
          : `<button class="mz-btn primary" id="mz-sheet-add" ${canAdd ? '' : 'disabled'}><i data-lucide="plus"></i>Ajouter au ticket · <span id="mz-sheet-cta">${fmtMAD(unit * sheet.qty)}</span></button>`}
      </div>`;

    const refreshPrice = () => {
      const piece = p.format === 'service' && sheet.format === 'piece';
      const base = piece ? pieceUnitPrice(p) : null;
      const activePromo = promoForLine({ pid: sheet.pid, isPiece: piece, customPrice: base, servicePieces: p.servicePieces });
      const bPrice = activePromo ? activePromo.price : (piece ? base : shelf(p.price));
      const u = shelf(bPrice * (100 - sheet.remise) / 100);
      $('#mz-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#mz-sheet-per', el).textContent = sheet.remise ? `−${sheet.remise} % · accord gérante` : `${u} MAD × ${sheet.qty}`;
      $('#mz-sheet-per', el).classList.toggle('rem', !!sheet.remise);
      const cta = $('#mz-sheet-cta', el);
      if (cta) cta.textContent = fmtMAD(u * sheet.qty);
      const qv = $('#mz-qty-val', el);
      if (qv) qv.textContent = sheet.qty;
    };

    const fmtSeg = $('#mz-format-seg', el);
    if (fmtSeg) {
      fmtSeg.onclick = (e) => {
        const b = e.target.closest('[data-mz-format]');
        if (!b) return;
        sheet.format = b.dataset.mzFormat;
        const piece = p.format === 'service' && sheet.format === 'piece';
        if (!canHoldStock(sheet.pid, sheet.size, 1, piece)) {
          const next = sizesOf(p).find((s) => canHoldStock(sheet.pid, s, 1, piece));
          if (next) sheet.size = next;
        }
        renderSheet(); icons(); lens();
      };
    }

    $('#mz-size-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-mz-size]');
      if (!b || b.disabled) return;
      sheet.size = b.dataset.mzSize || b.dataset.mzSize;
      const piece = p.format === 'service' && sheet.format === 'piece';
      const maxQty = stockAvailable(p.id, sheet.size, piece);
      if (sheet.qty > maxQty) sheet.qty = Math.max(1, maxQty);
      $$('[data-mz-size]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    $('#mz-colors', el).addEventListener('kc:change', (e) => { sheet.color = e.detail.value; });
    const qMinus = $('#mz-qty-minus', el);
    if (qMinus) qMinus.onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    const qPlus = $('#mz-qty-plus', el);
    if (qPlus) qPlus.onclick = () => {
      const piece = p.format === 'service' && sheet.format === 'piece';
      const maxQty = stockAvailable(p.id, sheet.size, piece);
      if (sheet.qty >= maxQty) { toast(`${p.name} · ${sheet.size}, ${maxQty} en stock, pas plus`); return; }
      sheet.qty++; refreshPrice();
    };
    const remRow = $('#mz-remise', el);
    if (remRow) remRow.onclick = (e) => {
      const b = e.target.closest('[data-mz-rem]');
      if (!b) return;
      const r = +b.dataset.mzRem;
      if (r > 0 && window.KiwiDiscountPolicy && !window.KiwiDiscountPolicy.allowed(r, _bqKey)) { toast('Pourcentage non autorisé'); return; }
      if (r > 0 && !state.ticket.remiseAuth) { openApprove(r, () => { sheet.remise = r; renderSheet(); icons(); lens(); }); return; }
      sheet.remise = r;
      $$('[data-mz-rem]', el).forEach((x) => x.classList.toggle('on', +x.dataset.mzRem === r));
      refreshPrice();
    };
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-sheet-veil'); });
    const add = $('#mz-sheet-add', el);
    if (add) add.onclick = () => {
      if (sheet.exchange) {
        closeVeil('#mz-sheet-veil');
        openExchSummary(sheet.pid, sheet.size, sheet.color);
        return;
      }
      const isPiece = (sheet.format === 'piece' && p.format === 'service');
      const piecePrice = isPiece ? pieceUnitPrice(p) : null;
      if (addToTicket(sheet.pid, {
        size: sheet.size,
        color: sheet.color,
        qty: sheet.qty,
        remise: sheet.remise,
        format: sheet.format,
        isPiece: isPiece,
        customPrice: piecePrice,
        marque: p.marque,
        motif: p.motif,
        fragile: p.fragile,
      })) {
        closeVeil('#mz-sheet-veil');
      }
    };
    icons();
  }

  /* ---------- approbation gérante (remise) ---------- */
  /* Ce que l'accord laisse derrière lui. Le pied du modal promet « tracé dans le
     journal » — et seul un booléen partait dans la vente : impossible, trois jours
     plus tard, de dire qui avait accordé les 20 % ni combien avaient été lâchés.
     On garde le nom (jamais le code), l'heure et le pourcentage demandé. */
  function markRemiseAuth(pct, by, role) {
    state.ticket.remiseAuth = { pct, by: by || '', role: role || '', at: new Date().toISOString() };
  }

  /* Sur une boutique RÉELLE, la remise passe par le vrai code responsable — le
     même portier que le remboursement et la fermeture de caisse, validé contre la
     liste du serveur. La liste d'équipe est neutralisée sur un vrai magasin
     (« Vendeur 1 »), donc la rangée « Aicha approuve » n'y était plus qu'un
     décor : un appui suffisait, sans code, sans nom. La démo locale garde sa
     distribution nommée — elle n'a pas de portier à interroger. */
  function openApprove(pct, onOk) {
    if (pvReal() && typeof window.requireManager === 'function') {
      if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'discount', key: 'act.discount.pct', args: { pct: `${pct}\u202f%` } });
      window.requireManager(`Remise −${pct} % sur le ticket ${state.ticket.num}`, () => {
        let mgr = null;
        try { mgr = window.KiwiCaissePairing?.lastManager?.() || null; } catch (_) {}
        markRemiseAuth(pct, mgr && mgr.name, mgr && mgr.role);
        toast(mgr && mgr.name ? `Remise −${pct} %, accord ${mgr.name}` : `Remise −${pct} % autorisée`);
        onOk();
      });
      return;
    }
    const el = $('#mz-approvem', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Remise −${pct} %</h3>
      <p class="modal-subtle">Une remise s'applique avec l'accord de la gérante, qui valide ?</p>
      <button class="mz-staff-row" id="mz-app-ok">
        <span class="mz-staff-ava">${initials(STAFF.gerante.name)}</span>
        <span class="l"><b>${esc(STAFF.gerante.name)}</b><span>${esc(STAFF.gerante.role)}, peut approuver</span></span>
        <span class="ok">Approuver</span>
      </button>
      <button class="mz-staff-row is-no" id="mz-app-no">
        <span class="mz-staff-ava">${initials(STAFF.conseil.name)}</span>
        <span class="l"><b>${esc(STAFF.conseil.name)}</b><span>${esc(STAFF.conseil.role)}</span></span>
        <span class="ok">Non habilitée</span>
      </button>
      <div class="mz-foot-note">L'accord vaut pour tout le ticket ${state.ticket.num}, tracé dans le journal.</div>`;
    openVeil('#mz-approve-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-approve-veil'); });
    $('#mz-app-ok', el).onclick = () => {
      markRemiseAuth(pct, STAFF.gerante.name, STAFF.gerante.role);
      closeVeil('#mz-approve-veil');
      toast(`Remise −${pct} %, accord ${STAFF.gerante.name}`);
      onOk();
    };
    $('#mz-app-no', el).onclick = () => toast(`${STAFF.conseil.name} n'est pas habilitée, seule la gérante approuve une remise`);
  }

  /* ═══════════════════════ CLIENTE — phone & name search (modal du ticket) ═══════ */
  function foldClientText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function clienteHits(q) {
    const raw = String(q || '').trim();
    const src = clientList();
    if (!raw) return src;
    const qFold = foldClientText(raw);
    const digits = raw.replace(/\D/g, '');
    return src.filter((c) => {
      if (foldClientText(c.name).includes(qFold)) return true;
      if (c.email && foldClientText(c.email).includes(qFold)) return true;
      if (digits.length >= 2) {
        const cDigits = (c.phone || '').replace(/\D/g, '');
        if (cDigits.includes(digits)) return true;
        const cLocal = cDigits.replace(/^212/, '0');
        const qLocal = digits.replace(/^212/, '0');
        if (cLocal && qLocal && (cLocal.includes(qLocal) || qLocal.includes(cLocal))) return true;
      }
      return false;
    });
  }
  function clAvoirOf(c) {
    return activeAvoirs().find((a) => a.holderId === c.id) || null;
  }

  function openClientModal() {
    const el = $('#mz-clientm', root);
    let mode = 'search';
    if (window.KiwiClients && KiwiClients.pull) {
      KiwiClients.pull((changed) => {
        if (!changed || !root) return;
        const i = $('#mz-cl-q', el);
        if (i && $('#mz-client-veil.is-open', root)) {
          const val = i.value;
          render(val);
          icons();
          const next = $('#mz-cl-q', el);
          if (next) { next.focus(); moveCaretEnd(next); }
        }
      });
    }
    const render = (q) => {
      const hits = clienteHits(q);
      const isDigits = (q || '').replace(/\D/g, '').length > (q || '').replace(/\d/g, '').trim().length;
      const namePrefill = isDigits ? '' : (q || '').trim();
      const phonePrefill = isDigits ? (q || '').trim() : '';
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Cliente</h3>
        <p class="modal-subtle">Rechercher par nom ou par numéro de téléphone.</p>
        <div class="mz-phone-in"><i data-lucide="search"></i>
          <input id="mz-cl-q" type="text" enterkeyhint="search" autocorrect="off" autocapitalize="words" placeholder="Nom ou 06…" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="mz-cl-results">
            ${hits.map((c) => {
              const av = clAvoirOf(c);
              return `<button class="mz-cl-row" data-mz-cl="${c.id}">
                <span class="mz-cl-ava">${esc(initials(c.name))}</span>
                <span class="mz-cl-mid">
                  <span class="mz-cl-name">${esc(c.name)} ${c.vip ? '<span class="mz-vip-chip">VIP</span>' : ''}</span>
                  <span class="mz-cl-sub">${esc(c.phone) || '·'}${c.taille ? ' · taille ' + esc(c.taille) : ''}</span>
                </span>
                <span class="mz-cl-right"><b>${c.points} pts</b>${av ? `<span class="av">avoir ${fmtMAD(av.balance)}</span>` : `${c.achats} achat${c.achats > 1 ? 's' : ''}`}</span>
              </button>`;
            }).join('') || `<div class="mz-empty">Aucune fiche pour « ${esc(q)} »</div>`}
          </div>
          <button class="mz-cl-new" id="mz-cl-new"><i data-lucide="user-plus"></i>Nouvelle cliente${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="mz-sheet-foot" style="margin-top:10px;">
            <button class="mz-btn ghost" id="mz-cl-guest">Cliente de passage, sans fiche</button>
          </div>` : `
          <div class="mz-cl-form">
            <input class="mz-in" id="mz-cl-name" placeholder="Nom et prénom" value="${esc(namePrefill)}" />
            <input class="mz-in" id="mz-cl-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="06… / +212… (optionnel)" value="${esc(phonePrefill)}" />
            <div class="mz-sheet-foot" style="margin-top:4px;">
              <button class="mz-btn secondary" id="mz-cl-back">Retour</button>
              <button class="mz-btn primary" id="mz-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#mz-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#mz-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-client-veil'); });
      $$('[data-mz-cl]', el).forEach((b) => {
        b.onclick = () => {
          const c = clById(b.dataset.mzCl);
          if (!c) return;
          state.ticket.client = c.id;
          closeVeil('#mz-client-veil');
          const tt = [c.taille ? 'taille ' + c.taille : '', c.points + ' pts'].filter(Boolean).join(', ');
          toast(`${c.name}${tt ? ' · ' + tt : ''}${clAvoirOf(c) ? ', un avoir actif' : ''}`);
          renderTicket(); icons();
        };
      });
      const newBtn = $('#mz-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#mz-cl-guest', el);
      if (guest) guest.onclick = () => {
        state.ticket.client = 'passage';
        closeVeil('#mz-client-veil');
        renderTicket(); icons();
      };
      const back = $('#mz-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#mz-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#mz-cl-name', el).value.trim();
        const tel = $('#mz-cl-tel', el).value.trim();
        if (!name) { toast('Le nom est requis pour la fiche'); return; }
        let cid;
        if (useKiwiCl()) {
          const rec = window.KiwiClients.upsert({ name, phone: tel, consent: true, source: 'caisse' });
          cid = rec.id;                                   // unified — appears in the dashboard « Clients » too
        } else {
          cid = 'cx' + Date.now().toString(36);
          const c = { id: cid, name, phone: tel, points: 0, taille: '', achats: 0, spent: 0, prefs: [], history: [] };
          CLIENTES.unshift(c); CL[cid] = c;
        }
        state.ticket.client = cid;
        closeVeil('#mz-client-veil');
        queueIfOffline('Fiche cliente');
        toast(`Fiche créée, ${name}`);
        renderTicket(); renderBadges(); icons();
      };
    };
    render('');
    openVeil('#mz-client-veil');
    icons();
    setTimeout(() => { const i = $('#mz-cl-q', el); if (i) i.focus(); }, 60);
  }
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }

  /* ═══════════════════════ VUE CLIENTES ═══════════════════════ */
  function renderClientes() {
    const panel = $('[data-mz-panel="clientes"]', root);
    const q = state.clQuery;
    const hits = clienteHits(q);
    panel.innerHTML = `
      <div class="mz-clients mz-page">
        <header class="mz-head">
          <div><h1>Clientes</h1><div class="mz-head-sub">Rechercher par nom ou téléphone, la fiche suit la cliente</div></div>
          <div class="mz-search"><i data-lucide="search"></i>
            <input id="mz-clv-q" type="text" enterkeyhint="search" placeholder="Nom ou 06…" value="${esc(q)}" /></div>
        </header>
        <div class="mz-cl-scroll">
          <div class="mz-cl-grid">
            ${hits.map((c) => {
              const av = clAvoirOf(c);
              return `<button class="mz-clcard" data-mz-fiche="${c.id}">
                <span class="mz-clcard-top">
                  <span class="mz-cl-ava">${esc(initials(c.name))}</span>
                  <span class="l">
                    <span class="mz-cl-name">${esc(c.name)} ${c.vip ? '<span class="mz-vip-chip">VIP</span>' : ''}</span>
                    <span class="mz-cl-sub">${esc(c.phone)}</span>
                  </span>
                </span>
                <span class="mz-clcard-stats">
                  <span class="mz-mini ok"><i data-lucide="star"></i>${c.points} pts</span>
                  <span class="mz-mini"><i data-lucide="ruler"></i>taille ${esc(c.taille)}</span>
                  <span class="mz-mini"><i data-lucide="receipt"></i>${c.achats} achat${c.achats > 1 ? 's' : ''}</span>
                  ${av ? `<span class="mz-mini warn"><i data-lucide="ticket"></i>avoir ${fmtMAD(av.balance)}</span>` : ''}
                </span>
              </button>`;
            }).join('') || `<div class="mz-empty" style="grid-column:1/-1;">Aucune fiche pour « ${esc(q)} »</div>`}
          </div>
        </div>
      </div>`;
    $('#mz-clv-q', panel).oninput = (e) => {
      state.clQuery = e.target.value;
      renderClientes(); icons();
      const i = $('#mz-clv-q', panel); i.focus(); moveCaretEnd(i);
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-mz-fiche]');
      if (b) openFiche(b.dataset.mzFiche);
    };
    icons();
  }

  function creditHistoryRows(credits) {
    const rows = Array.isArray(credits) ? credits : [];
    if (!rows.length) return '<div class="mz-empty" style="padding:16px;">Aucun avoir enregistré.</div>';
    return rows.map((credit) => {
      const issued = (credit.events || []).find((event) => event.action === 'issue') || {};
      const lines = Array.isArray(issued.lines) ? issued.lines : [];
      const eventRows = (credit.events || []).filter((event) => event.action !== 'issue').map((event) =>
        `<small style="display:block;margin-top:4px;color:var(--ink-3);">${event.action === 'redeem' ? 'Utilisé' : event.action === 'cancel' ? 'Annulé' : esc(event.action)} · ${fmtMAD((event.amountCents || 0) / 100)} · ${whenLabel(event.ts)} · ${esc(event.actor || 'Caisse')} · solde ${fmtMAD((event.balanceAfterCents || 0) / 100)}</small>`
      ).join('');
      return `<div class="mz-fhist-row" style="align-items:flex-start;">
        <span class="when">${whenLabel(credit.at)}<small style="display:block;">expire ${fmtValidUntil(credit.until)}</small></span>
        <span class="what"><b>${esc(credit.code)}</b> · vente ${esc(credit.from || '·')}<small style="display:block;">${lines.length ? esc(lines.map((line) => `${line.qty || 1}× ${line.name || 'Article'}`).join(' + ')) : esc(credit.motif || 'Retour')} · ${esc(issued.actor || 'Caisse')}</small>${eventRows}</span>
        <span class="amt">${fmtMAD(credit.amount)}<small style="display:block;color:var(--ink-3);">reste ${fmtMAD(credit.balance)}</small></span>
      </div>`;
    }).join('');
  }

  async function fillClientCreditHistory(cid, host) {
    if (!host) return;
    try {
      const credits = IS_DEMO ? AVOIRS.filter((item) => item.holderId === cid)
        : (await creditRequest(null, '&customerId=' + encodeURIComponent(cid))).credits.map(creditFromServer);
      if (!host.isConnected) return;
      host.innerHTML = creditHistoryRows(credits);
      icons();
    } catch (_) {
      if (host.isConnected) host.innerHTML = '<div class="mz-empty" style="padding:16px;">Historique des avoirs indisponible. Réessayez.</div>';
    }
  }

  function openFiche(cid) {
    const c = clById(cid);   // clById, pas CL[…] : sur une vraie boutique le carnet vit dans KiwiClients (CL est vide)
    if (!c) return;
    const el = $('#mz-fichem', root);
    const av = clAvoirOf(c);
    const cloudHistory = (c.history || []).map((h) => ({
      when: h.when || whenLabel(h.ts || h.createdAt || 0),
      what: h.what || (Array.isArray(h.items) && h.items.length ? h.items.map((it) => `${it.qty || 1}× ${it.name || 'Article'}`).join(' + ') : (h.ref || 'Achat')),
      amt: h.amt != null ? h.amt : h.amount,
      method: h.method || '', ref: h.ref || '', ts: +(h.ts || h.createdAt || 0),
    }));
    const syncedRefs = new Set(cloudHistory.map((h) => String(h.ref || '')).filter(Boolean));
    const localOnly = SALES.filter((s) => s.clientId === cid && !s.voided
      && !syncedRefs.has(String(s.id || '')) && !syncedRefs.has(String(s.num || ''))).map((s) => ({
      when: whenLabel(s.at),
      // idem : une vente de la semaine peut porter un article supprimé depuis.
      what: s.lines.map((l) => `${(P[l.pid] && P[l.pid].name) || l.name || 'Article'} · ${l.size}`).join(' + '),
      amt: s.total, method: s.methods || '', ref: s.id || s.num || '', ts: +s.at || 0,
    }));
    const hist = localOnly.concat(cloudHistory).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    /* c.spent already includes every locally recorded purchase immediately and
       every acknowledged purchase after sync. Adding today's rows again made
       the fiche double its turnover. */
    const spent = c.spent || 0;
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mz-fiche-head">
        <span class="mz-fiche-ava">${esc(initials(c.name))}</span>
        <div>
          <h3>${esc(c.name)} ${c.vip ? '<span class="mz-vip-chip">VIP</span>' : ''}</h3>
          <div class="tel">${esc(c.phone || 'sans téléphone')}</div>
        </div>
      </div>
      <div class="mz-fstats">
        <div class="mz-fstat"><b>${c.points}</b><span>points fidélité</span></div>
        <div class="mz-fstat"><b>${esc(c.taille)}</b><span>taille habituelle</span></div>
        <div class="mz-fstat"><b>${fmtMAD(spent)}</b><span>dépensé</span></div>
      </div>
      ${(c.prefs || []).length ? `<div class="mz-fnotes">${c.prefs.map((p) => `<div class="mz-fnote"><i data-lucide="heart"></i>${esc(p)}</div>`).join('')}</div>` : ''}
      ${av ? `<button class="mz-favoir" id="mz-fiche-av"><i data-lucide="ticket"></i>Avoir actif <b>${av.code}</b> · ${fmtMAD(av.balance)}, utilisable en caisse<span class="see">Voir</span></button>` : ''}
      <div class="mz-f-lbl" style="margin-bottom:6px;">Historique</div>
      <div class="mz-fhist">
        ${hist.length ? hist.map((h) => `<div class="mz-fhist-row"><span class="when">${esc(h.when)}${h.method ? `<small style="display:block;">${esc(h.method)}</small>` : ''}</span><span class="what">${esc(h.what)}${h.ref ? `<small style="display:block;">Ticket ${esc(h.ref)}</small>` : ''}</span><span class="amt">${fmtMAD(h.amt)}</span></div>`).join('') : '<div class="mz-empty">Aucun achat enregistré.</div>'}
      </div>
      <div class="mz-f-lbl" style="margin:16px 0 6px;">Avoirs et remboursements</div>
      <div class="mz-fhist" id="mz-fiche-credits"><div class="mz-empty" style="padding:16px;">Chargement du registre…</div></div>
      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" data-mz-close>Fermer</button>
        <button class="mz-btn primary" id="mz-fiche-sell"><i data-lucide="shopping-bag"></i>Nouvelle vente pour elle</button>
      </div>`;
    openVeil('#mz-fiche-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-fiche-veil'); });
    const avB = $('#mz-fiche-av', el);
    if (avB) avB.onclick = () => { closeVeil('#mz-fiche-veil'); openVoucher(av, { mode: 'view' }); };
    $('#mz-fiche-sell', el).onclick = () => {
      state.ticket.client = c.id;
      closeVeil('#mz-fiche-veil');
      switchView('vente');
      toast(`${firstName(c.name)} au comptoir, taille ${c.taille} pré-sélectionnée`);
    };
    void fillClientCreditHistory(cid, $('#mz-fiche-credits', el));
  }

  /* ═══════════════════════ SCAN ═══════════════════════ */
  /* Demo « douchette » cycle — a handful of real, in-stock articles from the
     live catalogue (each carries a scannable primary barcode). */
  function scanCycle() {
    const out = [];
    for (const r of RAYONS) for (const it of r.items) if (firstFree(it) && it.ean) out.push(it.id);
    return out.length ? out : Object.keys(P);
  }

  /* Rayon (catégorie) auquel appartient un article, pour la fiche de vérif. */
  function rayonOf(pid) {
    const r = RAYONS.find((ry) => ry.items.some((it) => it.id === pid));
    return r ? r.label : '';
  }

  /* La fiche « disponibilité » d'un article vérifié : prix, tailles, stock,
     couleurs — lecture seule, aucun impact sur le ticket. */
  function lookupCardHtml() {
    const lk = state.lookup;
    if (!lk || !P[lk.pid]) return '';
    const p = P[lk.pid];
    const tot = stockOf(p);
    const status = tot === 0 ? { cls: 'out', label: 'Épuisé' }
                 : tot <= 3 ? { cls: 'low', label: 'Stock bas' }
                 : { cls: 'ok', label: 'Disponible' };
    const sizes = sizesOf(p).map((s) => {
      const q = p.sizes[s] || 0;
      const cls = q === 0 ? 'out' : q <= 2 ? 'low' : '';
      const on = s === lk.size ? ' is-on' : '';
      return `<span class="mz-look-size ${cls}${on}"><b>${esc(s)}</b><i>${q}</i></span>`;
    }).join('');
    const colors = (p.colors || []).map((cid) => {
      const on = cid === lk.color ? ' is-on' : '';
      return `<span class="mz-look-color${on}">${colorDot(cid)}${esc(colorLabel(cid))}</span>`;
    }).join('');
    const ray = rayonOf(lk.pid);
    return `
      <div class="mz-look">
        <div class="mz-look-top">
          <span class="mz-look-art">${artOf(p.art)}</span>
          <div class="mz-look-id">
            <b>${esc(p.name)}</b>
            <span>${ray ? esc(ray) + ' · ' : ''}EAN ${esc(lk.ean)} · ${fmtHM(lk.at)}</span>
          </div>
          <span class="mz-look-price">${(function () {
            /* La fiche « disponibilité » est ce qu'on montre à une cliente qui
               demande « il coûte combien ? » : citer le prix catalogue pendant
               une promotion, c'est annoncer un prix qu'on n'encaissera pas. */
            const pr = promoFor(lk.pid);
            return pr ? `<s>${fmtMAD(pr.was)}</s> ${fmtMAD(pr.price)}` : fmtMAD(shelf(p.price));
          })()}</span>
        </div>
        <div class="mz-look-avail">
          <div class="mz-look-avail-head">
            <span class="mz-look-status ${status.cls}">${status.label}</span>
            <span class="mz-look-tot">${tot} pièce${tot > 1 ? 's' : ''} en stock</span>
          </div>
          <div class="mz-look-sizes">${sizes || '<span class="mz-look-empty">Taille unique</span>'}</div>
          ${colors ? `<div class="mz-look-colors">${colors}</div>` : ''}
        </div>
        <button class="mz-btn secondary mz-look-sell" id="mz-look-sell" ${tot === 0 ? 'disabled' : ''}>
          <i data-lucide="shopping-bag"></i>Envoyer vers la vente
        </button>
      </div>`;
  }

  /* ── « et dans l'autre boutique ? » ────────────────────────────────────────
     Le panneau qui répond sans décrocher le téléphone. Il ne s'affiche que pour
     un compte à plusieurs établissements — le serveur ne renvoie rien d'autre
     quand il n'y en a qu'un, et le module de catalogue arrête alors de demander.

     Trois états, et le troisième compte autant que les deux autres :
       · en cours   — le scan local a déjà répondu, ceci arrive derrière
       · trouvé     — combien, dans quelle taille, dans quel magasin
       · INCONNU    — ce magasin n'a pas encore d'inventaire en ligne. On l'écrit
                      ainsi, jamais « 0 en stock » : ne pas savoir n'est pas la
                      même chose que ne pas en avoir, et un vendeur qui renvoie
                      une cliente à Marrakech sur un faux zéro ne recommence pas. */
  function crossCardHtml() {
    const cx = state.cross;
    if (!cx) return '';
    // L'attente porte le MÊME cadre et le même titre que le résultat : quand la
    // réponse arrive, seules les lignes changent. Un encadré séparé qui
    // disparaît ferait sauter la fiche article que le vendeur est en train de
    // lire — et, isolé, se lisait comme un champ de recherche vide.
    if (cx.loading) {
      return `<div class="mz-cross">
        <div class="mz-cross-h"><i data-lucide="store"></i>Vos autres établissements</div>
        <div class="mz-cross-wait"><i data-lucide="loader"></i>Recherche en cours…</div>
      </div>`;
    }
    if (!cx.stores || !cx.stores.length) return '';

    const rows = cx.stores.map((s) => {
      const name = esc(s.name || s.merchant);
      if (!s.known) {
        return `<div class="mz-cross-row is-unknown">
            <span class="mz-cross-store">${name}</span>
            <span class="mz-cross-note">inventaire pas encore synchronisé</span>
          </div>`;
      }
      if (!s.hits || !s.hits.length) {
        return `<div class="mz-cross-row is-none">
            <span class="mz-cross-store">${name}</span>
            <span class="mz-cross-note">aucun exemplaire</span>
          </div>`;
      }
      const detail = s.hits.map((h) => {
        const dim = [h.color, h.size].filter(Boolean).map(esc).join(' · ');
        // Une recherche par nom rapporte le produit et le détail par taille ;
        // un scan rapporte la variante exacte. Les deux se lisent pareil ici.
        const sizes = Array.isArray(h.sizes) && h.sizes.length
          ? h.sizes.map((z) => `<span class="mz-cross-sz"><b>${esc(z.size)}</b><i>${z.stock | 0}</i></span>`).join('')
          : '';
        const n = h.stock | 0;
        return `<div class="mz-cross-hit">
            <span class="mz-cross-prod">${esc(h.product)}${dim ? ' <em>' + dim + '</em>' : ''}</span>
            <span class="mz-cross-qty ${n === 0 ? 'out' : n <= 2 ? 'low' : ''}">${n}</span>
          </div>${sizes ? `<div class="mz-cross-sizes">${sizes}</div>` : ''}`;
      }).join('');
      return `<div class="mz-cross-row">
          <span class="mz-cross-store">${name}</span>
          <div class="mz-cross-hits">${detail}</div>
        </div>`;
    }).join('');

    return `<div class="mz-cross">
        <div class="mz-cross-h"><i data-lucide="store"></i>Vos autres établissements</div>
        ${rows}
        <div class="mz-cross-foot">Stock lu à l'instant sur le serveur. Appelez avant de faire déplacer une cliente.</div>
      </div>`;
  }

  /* Lance la recherche inter-magasins pour le code qui vient d'être scanné et
     redessine quand elle revient. Volontairement APRÈS l'affichage local : le
     scan doit rester instantané, ceci n'est qu'un complément. */
  function askCross(code, pid) {
    const cat = window.KiwiBoutiqueCatalog;
    if (!cat || !cat.crossStock || !code) { state.cross = null; return; }
    /* La référence commune de CE produit part avec le code. C'est elle qui fait
       le rapprochement quand le commerçant a étiqueté lui-même sa marchandise :
       l'étiquette de Casa ne veut rien dire à Rabat, la référence si. */
    let sku = '';
    try {
      const p = pid ? (P[pid] || null) : null;
      sku = (p && p.sku) || '';
    } catch (_) { sku = ''; }
    state.cross = { code, loading: true, stores: null };
    cat.crossStock({ code, sku }).then((res) => {
      // Un autre code a été scanné entre-temps : cette réponse ne le concerne
      // plus, l'afficher sous le nouveau serait un mensonge.
      if (!state.cross || state.cross.code !== code) return;
      state.cross = res && res.stores && res.stores.length
        ? { code, loading: false, stores: res.stores }
        : null;
      if (state.view === 'scan') renderScan();
    });
  }

  /* ── Caméra : lecture RÉELLE d'un code-barres ──────────────────────────────
     La douchette USB n'a jamais eu besoin de code : c'est un clavier, elle tape
     dans le champ et valide par Entrée. Ce qui manquait, c'est de pouvoir
     scanner SANS douchette, avec le téléphone ou la tablette qui sert de caisse.
     Zéro dépendance et zéro build : l'API navigateur BarcodeDetector décode
     directement le flux getUserMedia. Elle n'existe pas partout (Chrome
     Android / macOS / ChromeOS oui, Safari iOS non) : quand elle manque on le
     dit franchement plutôt que d'ouvrir une caméra qui ne déchiffrerait rien. */
  const CAM_WANT = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];
  function camSupported() {
    try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector); }
    catch (_) { return false; }
  }
  /* Bip court : la caissière doit ENTENDRE que ça a mordu sans quitter le client
     des yeux — c'est ce que fait une vraie douchette. */
  function camBlip() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ac = new AC();
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.value = 2100;
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.13);
        setTimeout(() => { try { ac.close(); } catch (_) {} }, 320);
      }
    } catch (_) {}
  }

  let camBusy = false;
  function openCamScan(onCode) {
    if (camBusy) return;
    if (!camSupported()) {
      toast('Lecture caméra indisponible sur ce navigateur, utilisez la douchette ou tapez le code');
      return;
    }
    camBusy = true;
    const veil = document.createElement('div');
    veil.className = 'mz-cam';
    veil.innerHTML = `
      <div class="mz-cam-box">
        <video class="mz-cam-video" playsinline muted></video>
        <div class="mz-cam-frame"><i></i><i></i><i></i><i></i><div class="mz-cam-laser"></div></div>
        <div class="mz-cam-bar">
          <div class="mz-cam-hint" id="mz-cam-hint">Placez le code-barres dans le cadre</div>
          <div class="mz-cam-acts">
            <button class="mz-cam-btn" id="mz-cam-torch" hidden>Lampe</button>
            <button class="mz-cam-btn is-close" id="mz-cam-close">Fermer</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(veil);
    const video = $('.mz-cam-video', veil);
    const hint = $('#mz-cam-hint', veil);
    video.muted = true;
    let stream = null, raf = 0, stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      camBusy = false;
      if (raf) cancelAnimationFrame(raf);
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
      veil.remove();
      document.removeEventListener('keydown', onKey);
    };
    function onKey(e) { if (e.key === 'Escape') stop(); }
    document.addEventListener('keydown', onKey);
    $('#mz-cam-close', veil).onclick = stop;
    veil.addEventListener('click', (e) => { if (e.target === veil) stop(); });

    (async () => {
      let detector;
      try {
        let fmts = CAM_WANT;
        try {
          const sup = await window.BarcodeDetector.getSupportedFormats();
          const inter = CAM_WANT.filter((f) => sup.indexOf(f) >= 0);
          if (inter.length) fmts = inter;
        } catch (_) {}
        detector = new window.BarcodeDetector({ formats: fmts });
      } catch (_) {
        hint.textContent = 'Lecture caméra indisponible sur cet appareil';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        const n = err && err.name;
        hint.textContent = n === 'NotAllowedError' || n === 'SecurityError'
          ? 'Accès caméra refusé, autorisez-le dans le navigateur puis réessayez'
          : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'Aucune caméra utilisable sur cet appareil'
          : 'Caméra indisponible';
        return;
      }
      if (stopped) { try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {} return; }
      video.srcObject = stream;
      try { await video.play(); } catch (_) {}

      /* Lampe — une réserve ou une cabine d'essayage est rarement bien éclairée.
         Seuls certains téléphones l'exposent ; sinon le bouton reste caché. */
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track && track.getCapabilities ? track.getCapabilities() : null;
        if (caps && caps.torch) {
          const tb = $('#mz-cam-torch', veil);
          let on = false;
          tb.hidden = false;
          tb.onclick = () => {
            on = !on;
            try { track.applyConstraints({ advanced: [{ torch: on }] }); } catch (_) {}
            tb.classList.toggle('is-on', on);
          };
        }
      } catch (_) {}

      let last = 0;
      const tick = async (ts) => {
        if (stopped) return;
        /* ~8 lectures/seconde : assez vif pour mordre tout de suite, assez lâche
           pour ne pas saturer le CPU d'une tablette d'entrée de gamme. */
        if (ts - last > 120 && video.readyState >= 2) {
          last = ts;
          try {
            const hits = await detector.detect(video);
            if (hits && hits.length) {
              const code = String(hits[0].rawValue || '').trim();
              if (code) { camBlip(); stop(); onCode(code); return; }
            }
          } catch (_) { /* une frame illisible n'interrompt pas la boucle */ }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
  }

  /* ═══════════════════════ LISTES CADEAUX (MARIAGE & NAISSANCE) ═══════════════════ */
  const REGISTRY_KEY = 'kiwi:mzRegistries';
  const DEFAULT_REGISTRIES = [
    {
      id: 'reg-mariage-sarah-mehdi',
      type: 'mariage',
      typeLabel: 'Liste de Mariage',
      title: 'Mariage Sarah & Mehdi Benjelloun',
      beneficiaries: 'Sarah & Mehdi',
      phone: '0661 42 18 30',
      eventDate: '2026-09-15',
      note: 'Livraison groupée Tanger Marshan après la cérémonie.',
      items: [
        { pid: 'mz_fes_bleu_service', name: 'Service 18 pièces Fès Bleu', marque: 'Vogue Table', format: 'service', qtyRequested: 1, qtyPurchased: 0, price: 1450, color: 'bleu', size: 'TU' },
        { pid: 'mz_vase_majorelle', name: 'Vase céramique émaillée 35cm', marque: 'Céramique Majorelle', format: 'piece', qtyRequested: 2, qtyPurchased: 1, price: 650, color: 'emeraude', size: 'TU' },
        { pid: 'mz_verres_beldi_set', name: 'Verres soufflés Beldi (Set de 6)', marque: 'Beldi Glass', format: 'service', qtyRequested: 4, qtyPurchased: 2, price: 140, color: 'emeraude', size: 'TU' },
        { pid: 'mz_baobab_feathers', name: 'Bougie Max 24 Totem Feathers', marque: 'Baobab Collection', format: 'piece', qtyRequested: 1, qtyPurchased: 0, price: 1850, color: 'ivoire', size: 'TU' },
        { pid: 'mz_carafe_beldi', name: 'Carafe soufflée Beldi 1.5L', marque: 'Beldi Glass', format: 'piece', qtyRequested: 2, qtyPurchased: 1, price: 120, color: 'transparent', size: 'TU' },
      ],
    },
    {
      id: 'reg-naissance-ines',
      type: 'naissance',
      typeLabel: 'Liste de Naissance',
      title: 'Naissance Bébé Inès',
      beneficiaries: 'Ghita & Youssef Alami',
      phone: '0664 77 02 19',
      eventDate: '2026-10-20',
      note: 'Emballages cadeaux avec mot personnalisé pour chaque invité.',
      items: [
        { pid: 'mz_coupes_dessert', name: 'Coupes à dessert dorées (Lot 6)', marque: 'Cristal Atlas', format: 'piece', qtyRequested: 4, qtyPurchased: 2, price: 75, color: 'dore', size: 'TU' },
        { pid: 'mz_diffuseur_oranger', name: 'Diffuseur Fleur d’Oranger Tanger', marque: 'Les Senteurs de Tanger', format: 'piece', qtyRequested: 2, qtyPurchased: 0, price: 480, color: 'ambre', size: 'TU' },
        { pid: 'mz_plateau_martele', name: 'Plateau laiton martelé main', marque: 'Artisanat Fès', format: 'piece', qtyRequested: 1, qtyPurchased: 1, price: 420, color: 'dore', size: 'TU' },
      ],
    }
  ];

  let REGISTRIES = null;
  let REGISTRY_STORE = null;
  function registryStore() {
    if (REGISTRY_STORE || !window.KiwiStore?.define) return REGISTRY_STORE;
    REGISTRY_STORE = window.KiwiStore.define('giftregistries', {
      cloud: 'giftregistries',
      blank: () => ({ list: [] }),
      seedFor: () => IS_DEMO ? ({ list: JSON.parse(JSON.stringify(DEFAULT_REGISTRIES)) }) : null,
      isEmpty: (d) => !d || !Array.isArray(d.list) || !d.list.length,
      merge: (mine, theirs) => {
        const map = new Map();
        [].concat(theirs?.list || [], mine?.list || []).forEach((row) => {
          if (!row?.id) return;
          const old = map.get(row.id);
          if (!old || +(row.updatedAt || 0) >= +(old.updatedAt || 0)) map.set(row.id, row);
        });
        return { list: Array.from(map.values()).filter((row) => !row.deletedAt).slice(0, 500) };
      },
    });
    return REGISTRY_STORE;
  }
  function loadRegistries() {
    if (REGISTRIES) return REGISTRIES;
    const store = registryStore();
    if (store) {
      const doc = store.get(merchantSlug());
      if (doc && Array.isArray(doc.list)) REGISTRIES = doc.list;
    }
    try {
      const stored = localStorage.getItem(REGISTRY_KEY + ':' + merchantSlug());
      /* One-time adoption of the pre-cloud list.  Prefer it only when the new
         document is still empty, then save it through the shared store. */
      if (stored && (!Array.isArray(REGISTRIES) || !REGISTRIES.length)) REGISTRIES = JSON.parse(stored);
    } catch (_) {}
    if (!Array.isArray(REGISTRIES)) REGISTRIES = IS_DEMO ? JSON.parse(JSON.stringify(DEFAULT_REGISTRIES)) : [];
    if (store) store.set({ list: REGISTRIES }, merchantSlug());
    return REGISTRIES;
  }
  function saveRegistries() {
    try {
      localStorage.setItem(REGISTRY_KEY + ':' + merchantSlug(), JSON.stringify(REGISTRIES || []));
    } catch (_) {}
    const store = registryStore();
    if (store) store.set({ list: REGISTRIES || [] }, merchantSlug());
  }
  function updateRegistryContribution(sale) {
    if (!sale || !sale.lines) return;
    const regs = loadRegistries();
    let touched = false;
    sale.lines.forEach((ln) => {
      if (!ln.registryId) return;
      const reg = regs.find((r) => r.id === ln.registryId);
      if (!reg) return;
      const target = reg.items.find((it) => it.pid === ln.pid || (P[ln.pid] && P[ln.pid].name === it.name));
      if (target) {
        target.qtyPurchased = Math.min(target.qtyRequested, (target.qtyPurchased || 0) + (ln.qty || 1));
        touched = true;
      }
    });
    if (touched) saveRegistries();
  }

  function renderRegistries() {
    const panel = $('[data-mz-panel="registries"]', root);
    if (!panel) return;
    const regs = loadRegistries();
    const q = (state.registriesQuery || '').toLowerCase().trim();
    const hits = q ? regs.filter((r) => r.title.toLowerCase().includes(q) || r.beneficiaries.toLowerCase().includes(q) || r.phone.includes(q)) : regs;

    panel.innerHTML = `
      <div class="mz-registries">
        <header class="mz-head">
          <div>
            <h1>Listes Cadeaux &amp; Mariage</h1>
            <div class="mz-head-sub">Gestion des listes d'invités, contributions et suivi des pièces offertes</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="mz-search">
              <i data-lucide="search"></i>
              <input id="mz-reg-q" placeholder="Nom ou téléphone…" value="${esc(state.registriesQuery || '')}" />
            </div>
            <button class="mz-btn primary" id="mz-reg-new"><i data-lucide="plus"></i>Nouvelle liste</button>
          </div>
        </header>

        <div class="mz-reg-grid">
          ${hits.map((reg) => {
            const totRequested = reg.items.reduce((s, it) => s + (it.qtyRequested || 1), 0);
            const totPurchased = reg.items.reduce((s, it) => s + (it.qtyPurchased || 0), 0);
            const pct = totRequested > 0 ? Math.round((totPurchased / totRequested) * 100) : 0;
            const valPurchased = reg.items.reduce((s, it) => s + (it.qtyPurchased || 0) * it.price, 0);
            const valTotal = reg.items.reduce((s, it) => s + (it.qtyRequested || 1) * it.price, 0);
            return `
            <div class="mz-reg-card">
              <div class="mz-reg-head">
                <div>
                  <h3 class="mz-reg-title">${esc(reg.title)}</h3>
                  <div class="mz-reg-sub">${esc(reg.beneficiaries)} · Tél. ${esc(reg.phone)} · Événement : ${esc(reg.eventDate)}</div>
                </div>
                <span class="mz-reg-badge">${esc(reg.typeLabel || 'Mariage')}</span>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--ink-2); font-weight:600;">
                <span>Progression : ${totPurchased} / ${totRequested} articles offerts</span>
                <span style="font-family:var(--mono);">${fmtMAD(valPurchased)} / ${fmtMAD(valTotal)}</span>
              </div>
              <div class="mz-reg-prog-bar">
                <div class="mz-reg-prog-fill" style="width:${pct}%;"></div>
              </div>
              <div class="mz-reg-items">
                ${reg.items.map((it) => {
                  const p = P[it.pid] || { name: it.name, price: it.price, marque: it.marque };
                  const remaining = Math.max(0, (it.qtyRequested || 1) - (it.qtyPurchased || 0));
                  const isDone = remaining === 0;
                  return `
                  <div class="mz-reg-item">
                    <div class="item-info">
                      <b>${esc(it.name)}</b>
                      <span>${it.marque ? esc(it.marque) + ' · ' : ''}${fmtMAD(shelf(it.price))} · ${it.qtyPurchased}/${it.qtyRequested} offert(s)</span>
                    </div>
                    <div class="item-cta">
                      ${isDone ? '<span class="mz-mini ok">Complet</span>' : `
                        <button class="mz-btn secondary sm" data-mz-reg-add="${reg.id}:${it.pid}">
                          <i data-lucide="gift"></i>Offrir (${remaining} dispo)
                        </button>`}
                    </div>
                  </div>`;
                }).join('')}
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px;border-top:1px solid var(--line);">
                <button class="mz-btn secondary sm" data-mz-reg-item-add="${reg.id}"><i data-lucide="plus"></i>Ajouter un article</button>
                <button class="mz-btn secondary sm" data-mz-reg-delete="${reg.id}"><i data-lucide="trash-2"></i>Supprimer</button>
              </div>
              ${reg.note ? `<div style="font-size:11.5px; color:var(--ink-3); border-top:1px solid var(--line); padding-top:8px;">Note : ${esc(reg.note)}</div>` : ''}
            </div>`;
          }).join('') || `<div class="mz-empty" style="grid-column:1/-1;min-height:240px;"><i data-lucide="gift"></i><b>Aucune liste cadeau</b><span>Créez une liste de mariage, naissance ou événement, puis ajoutez les articles du catalogue.</span></div>`}
        </div>
      </div>`;

    const create = $('#mz-reg-new', panel);
    if (create) create.onclick = openNewRegistry;

    const qInput = $('#mz-reg-q', panel);
    if (qInput) {
      qInput.oninput = (e) => {
        state.registriesQuery = e.target.value;
        renderRegistries(); icons();
        const i = $('#mz-reg-q', panel); if (i) { i.focus(); moveCaretEnd(i); }
      };
    }

    panel.onclick = (e) => {
      const addBtn = e.target.closest('[data-mz-reg-add]');
      if (addBtn) {
        const [regId, pid] = addBtn.dataset.mzRegAdd.split(':');
        const reg = regs.find((r) => r.id === regId);
        const item = reg && reg.items.find((it) => it.pid === pid);
        if (reg && item) {
          addToTicket(item.pid, {
            size: item.size || 'TU',
            color: item.color || 'defaut',
            qty: 1,
            format: item.format || 'piece',
            isPiece: (item.format !== 'service'),
            marque: item.marque,
            registryId: reg.id,
            registryTitle: reg.title,
          });
          switchView('vente');
          toast(`Article ajouté pour : ${reg.title}`);
        }
        return;
      }
      const itemAdd = e.target.closest('[data-mz-reg-item-add]');
      if (itemAdd) { openRegistryItem(itemAdd.dataset.mzRegItemAdd); return; }
      const del = e.target.closest('[data-mz-reg-delete]');
      if (del) {
        const reg = regs.find((r) => r.id === del.dataset.mzRegDelete);
        if (reg && confirm(`Supprimer « ${reg.title} » ?`)) {
          REGISTRIES = regs.filter((r) => r.id !== reg.id);
          saveRegistries(); renderRegistries(); renderBadges(); icons();
          toast('Liste supprimée');
        }
      }
    };
    icons();
  }

  function openNewRegistry() {
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Nouvelle liste cadeau</h3><span>La liste sera disponible sur toutes les caisses du magasin.</span></div></div>
      <div class="mzi-form">
        <div class="mzi-frow"><div class="mzi-fg"><label>Type</label><select id="mz-rn-type"><option value="mariage">Mariage</option><option value="naissance">Naissance</option><option value="evenement">Événement</option></select></div><div class="mzi-fg"><label>Date</label><input id="mz-rn-date" type="date" /></div></div>
        <div class="mzi-fg"><label>Titre</label><input id="mz-rn-title" placeholder="Ex. Mariage Sara &amp; Adam" /></div>
        <div class="mzi-frow"><div class="mzi-fg"><label>Bénéficiaires</label><input id="mz-rn-who" placeholder="Sara &amp; Adam" /></div><div class="mzi-fg"><label>Téléphone</label><input id="mz-rn-phone" inputmode="tel" placeholder="06…" /></div></div>
        <div class="mzi-fg"><label>Note</label><input id="mz-rn-note" maxlength="300" placeholder="Livraison, emballage, message…" /></div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn primary" id="mz-rn-save">Créer la liste</button></div>`;
    invSetModal(html, (el) => {
      $('#mz-rn-save', el).onclick = () => {
        const title = $('#mz-rn-title', el).value.trim();
        const who = $('#mz-rn-who', el).value.trim();
        if (!title || !who) { toast('Indiquez le titre et les bénéficiaires'); return; }
        const type = $('#mz-rn-type', el).value;
        const now = Date.now();
        loadRegistries().unshift({ id: `reg-${now.toString(36)}-${Math.random().toString(36).slice(2,7)}`, type,
          typeLabel: type === 'mariage' ? 'Liste de Mariage' : type === 'naissance' ? 'Liste de Naissance' : 'Liste Cadeau',
          title, beneficiaries: who, phone: $('#mz-rn-phone', el).value.trim(), eventDate: $('#mz-rn-date', el).value,
          note: $('#mz-rn-note', el).value.trim(), items: [], createdAt: now, updatedAt: now });
        saveRegistries(); closeVeil('#mz-inv-veil'); renderRegistries(); renderBadges(); icons(); toast('Liste créée');
      };
    });
  }

  function openRegistryItem(registryId) {
    const reg = loadRegistries().find((r) => r.id === registryId);
    const products = catDB()?.listProducts?.({}) || [];
    if (!reg) return;
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Ajouter un article</h3><span>${esc(reg.title)}</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Article du catalogue</label><select id="mz-ri-product">${products.map((p) => `<option value="${p.id}">${esc(p.name)} · ${fmtMAD(shelf(p.priceMAD))}</option>`).join('')}</select></div>
        <div class="mzi-fg"><label>Quantité souhaitée</label><input id="mz-ri-qty" type="number" min="1" step="1" value="1" /></div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn primary" id="mz-ri-save" ${products.length ? '' : 'disabled'}>Ajouter</button></div>`;
    invSetModal(html, (el) => {
      $('#mz-ri-save', el).onclick = () => {
        const pid = $('#mz-ri-product', el).value;
        const p = P[pid] || catDB()?.getProduct?.(pid)?.product;
        if (!p) return;
        const qty = Math.max(1, parseInt($('#mz-ri-qty', el).value, 10) || 1);
        const old = reg.items.find((it) => it.pid === pid);
        if (old) old.qtyRequested += qty;
        else reg.items.push({ pid, name: p.name, marque: p.marque || '', format: p.format || 'piece', qtyRequested: qty, qtyPurchased: 0, price: p.priceMAD || p.price || 0, color: 'defaut', size: 'TU' });
        reg.updatedAt = Date.now(); saveRegistries(); closeVeil('#mz-inv-veil'); renderRegistries(); icons(); toast('Article ajouté à la liste');
      };
    });
  }

  /* ═══════════════════════ FOURNISSEURS & ACHATS ═══════════════════════
     The procurement ledger was already loaded, but Maison had no route to it.
     This counter view reads and writes the same suppliers, orders, receipts and
     returns as the dashboard. */
  const procurement = () => window.KiwiProcurement || null;
  function supplierName(doc, id) { return (doc.suppliers || []).find((s) => s.id === id)?.name || 'Fournisseur'; }
  function renderSuppliers() {
    const panel = $('[data-mz-panel="fournisseurs"]', root);
    const api = procurement();
    if (!panel) return;
    if (!api) {
      panel.innerHTML = `<div class="bqi mz-page">
        <header class="mz-head"><div><h1>Fournisseurs &amp; achats</h1><div class="mz-head-sub">Annuaire, commandes, réceptions, retours et coûts · synchronisés avec le dashboard</div></div></header>
        <div class="mz-empty mz-empty-room">Approvisionnement indisponible. Rechargez la caisse pour retrouver les fournisseurs et commandes.</div>
      </div>`;
      return;
    }
    const doc = api.doc() || {}, suppliers = (doc.suppliers || []).filter((s) => s.active !== false), orders = doc.orders || [];
    panel.innerHTML = `<div class="bqi mz-page">
      <header class="mz-head">
        <div><h1>Fournisseurs &amp; achats</h1><div class="mz-head-sub">Annuaire, commandes, réceptions, retours et coûts · synchronisés avec le dashboard</div></div>
        <div class="mz-head-actions"><button class="mz-btn secondary" id="mz-sup-receive"><i data-lucide="package-plus"></i>Réception directe</button><button class="mz-btn primary" id="mz-sup-new"><i data-lucide="plus"></i>Nouveau fournisseur</button></div>
      </header>
      <div class="mzi-kpis"><div class="mzi-kpi"><span class="l">Fournisseurs actifs</span><span class="v">${suppliers.length}</span></div><div class="mzi-kpi"><span class="l">Commandes ouvertes</span><span class="v">${orders.filter((o) => !['received','cancelled'].includes(o.status)).length}</span></div><div class="mzi-kpi"><span class="l">Réceptions</span><span class="v">${(doc.receipts || []).length}</span></div></div>
      <div class="mz-section-head"><h2>Annuaire</h2>${api.isUltra() ? '<button class="mz-btn secondary" id="mz-po-new"><i data-lucide="file-plus"></i>Nouveau bon de commande</button>' : ''}</div>
      <div class="mz-reg-grid">${suppliers.map((s) => `<div class="mz-reg-card"><div class="mz-reg-head"><div><h3 class="mz-reg-title">${esc(s.name)}</h3><div class="mz-reg-sub">${esc([s.phone,s.email].filter(Boolean).join(' · ') || 'Coordonnées à compléter')}</div></div><span class="mz-reg-badge">${s.leadDays || 0} j</span></div>
        ${s.address ? `<div class="mz-reg-sub">${esc(s.address)}</div>` : ''}${s.taxId ? `<div class="mz-reg-sub">ICE / IF · ${esc(s.taxId)}</div>` : ''}${s.paymentTerms ? `<div class="mz-reg-sub">Conditions · ${esc(s.paymentTerms)}</div>` : ''}${s.categories ? `<div class="mz-reg-sub">Articles · ${esc(s.categories)}</div>` : ''}
        <div class="mz-card-actions"><button class="mz-btn secondary sm" data-mz-sup-receive="${s.id}">Réception</button><button class="mz-btn secondary sm" data-mz-sup-return="${s.id}">Retour fournisseur</button></div></div>`).join('') || '<div class="mz-empty mz-empty-room">Ajoutez votre premier fournisseur pour enregistrer les réceptions et les coûts.</div>'}</div>
      <div class="mz-section-head"><h2>Commandes</h2></div><div class="mzi-list mz-section-surface">${orders.map((o) => `<div class="mzi-row"><span class="mzi-info"><b>${esc(o.number)}</b><span>${esc(supplierName(doc,o.supplierId))} · ${esc(o.status)}${o.expectedDate ? ' · '+esc(o.expectedDate) : ''}</span></span><span class="mzi-price">${fmtMAD((o.lines||[]).reduce((n,l)=>n+(+l.qty||0)*(+l.unitCost||0),0))}</span><span class="mz-row-actions">${o.status==='draft' ? `<button class="mzi-mini" data-mz-po-send="${o.id}" title="Marquer envoyée"><i data-lucide="send"></i></button>` : ''}${!['received','cancelled'].includes(o.status) ? `<button class="mzi-mini" data-mz-po-receive="${o.id}" title="Réceptionner"><i data-lucide="package-check"></i></button><button class="mzi-mini" data-mz-po-cancel="${o.id}" title="Annuler"><i data-lucide="x"></i></button>` : ''}</span></div>`).join('') || '<div class="mz-empty">Aucune commande.</div>'}</div>
    </div>`;
    $('#mz-sup-new', panel).onclick = openSupplierForm;
    $('#mz-sup-receive', panel).onclick = () => openProcurementMove('receipt', '');
    const poNew = $('#mz-po-new', panel); if (poNew) poNew.onclick = openPurchaseOrder;
    panel.onclick = (e) => {
      const receive = e.target.closest('[data-mz-sup-receive]'); if (receive) { openProcurementMove('receipt', receive.dataset.mzSupReceive); return; }
      const ret = e.target.closest('[data-mz-sup-return]'); if (ret) { openProcurementMove('return', ret.dataset.mzSupReturn); return; }
      const send = e.target.closest('[data-mz-po-send]'); if (send) { api.markSent(send.dataset.mzPoSend); renderSuppliers(); toast('Commande marquée envoyée'); return; }
      const receivePo = e.target.closest('[data-mz-po-receive]'); if (receivePo) { openProcurementMove('order', receivePo.dataset.mzPoReceive); return; }
      const cancel = e.target.closest('[data-mz-po-cancel]'); if (cancel && confirm('Annuler ce bon de commande ?')) { api.cancelOrder(cancel.dataset.mzPoCancel, 'Annulé depuis la caisse'); renderSuppliers(); toast('Commande annulée'); }
    };
    icons();
  }

  function openSupplierForm() {
    const html = `<button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button><div class="mzi-modh"><div><h3>Nouveau fournisseur</h3><span>Coordonnées, fiscalité et conditions d'achat.</span></div></div><div class="mzi-form">
      <div class="mzi-frow"><div class="mzi-fg"><label>Nom *</label><input id="mz-sf-name"></div><div class="mzi-fg"><label>Téléphone</label><input id="mz-sf-phone" inputmode="tel"></div></div><div class="mzi-frow"><div class="mzi-fg"><label>Email</label><input id="mz-sf-email" type="email"></div><div class="mzi-fg"><label>ICE / IF</label><input id="mz-sf-tax"></div></div><div class="mzi-fg"><label>Adresse</label><input id="mz-sf-address"></div><div class="mzi-frow"><div class="mzi-fg"><label>Délai (jours)</label><input id="mz-sf-lead" type="number" min="0" value="0"></div><div class="mzi-fg"><label>Conditions de paiement</label><input id="mz-sf-terms" placeholder="30 jours, comptant…"></div></div><div class="mzi-fg"><label>Marques / catégories</label><input id="mz-sf-cats"></div><div class="mzi-fg"><label>Notes</label><input id="mz-sf-notes" maxlength="500"></div></div><div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn primary" id="mz-sf-save">Enregistrer</button></div>`;
    invSetModal(html, (el) => { $('#mz-sf-save', el).onclick = () => { const name=$('#mz-sf-name',el).value.trim(); if(!name){toast('Le nom est requis');return;} procurement().addSupplier({name,phone:$('#mz-sf-phone',el).value,email:$('#mz-sf-email',el).value,address:$('#mz-sf-address',el).value,taxId:$('#mz-sf-tax',el).value,paymentTerms:$('#mz-sf-terms',el).value,categories:$('#mz-sf-cats',el).value,notes:$('#mz-sf-notes',el).value,leadDays:$('#mz-sf-lead',el).value}); closeVeil('#mz-inv-veil'); renderSuppliers(); toast('Fournisseur enregistré'); }; });
  }
  function procurementLineFields(doc, supplierId) {
    const products = catDB()?.listProducts?.({}) || [];
    const variants = products.flatMap((p) => (catDB()?.getProduct?.(p.id)?.variants || []).map((v) => ({ p, v })));
    return `<div class="mzi-frow"><div class="mzi-fg"><label>Fournisseur</label><select id="mz-pm-sup">${(doc.suppliers||[]).map((s)=>`<option value="${s.id}" ${s.id===supplierId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="mzi-fg"><label>Article · variante</label><select id="mz-pm-product">${variants.map(({p,v})=>`<option value="${v.id}" data-pid="${p.id}">${esc(p.name)} · ${esc(v.size || 'TU')} ${esc(v.colorLabel || '')}</option>`).join('')}</select></div></div><div class="mzi-frow"><div class="mzi-fg"><label>Quantité</label><input id="mz-pm-qty" type="number" min="1" value="1"></div><div class="mzi-fg"><label>Coût unitaire (MAD)</label><input id="mz-pm-cost" type="number" min="0" step="0.01"></div></div><div class="mzi-fg"><label>Référence / note</label><input id="mz-pm-ref" maxlength="100"></div>`;
  }
  function procurementLine(el) { const select=$('#mz-pm-product',el),opt=select?.selectedOptions?.[0],pid=opt?.dataset.pid||'',p=P[pid]||catDB()?.getProduct?.(pid)?.product; return {itemId:pid,variantId:select?.value||'',name:p?.name||'Article',qty:Math.max(1,+$('#mz-pm-qty',el).value||1),unit:'pièce',unitCost:Math.max(0,+$('#mz-pm-cost',el).value||0)}; }
  function procurementVariant(line) {
    const card = catDB()?.getProduct?.(line.itemId);
    return (card?.variants || []).find((v) => v.id === line.variantId) || ((card?.variants || []).length === 1 ? card.variants[0] : null);
  }
  async function postMaisonProcurement(kind, lines, ref, supplierId) {
    const MZ=window.KiwiMaisonStock, doc=procurement().doc(), supplier=supplierName(doc,supplierId), applied=[];
    if (!MZ?.requestManual) return {error:'stock-journal-unavailable',lines:[]};
    for (const line of lines) {
      const variant=procurementVariant(line);
      if (!variant) return {error:'variant-required',lines:applied};
      const normalized={...line,variantId:variant.id};
      const moved=await MZ.requestManual({productId:line.itemId,variantId:variant.id,type:kind==='return'?'retour-fourn':'reception',qty:line.qty,ref,note:ref,supplier,source:'caisse'});
      if (!moved?.ok) return {error:moved?.reason||'stock-move-failed',lines:applied};
      if (kind!=='return' && line.unitCost>0) catDB().updateProduct(line.itemId,{cost:line.unitCost});
      applied.push(normalized);
    }
    return {lines:applied};
  }
  function openProcurementMove(kind, id) {
    const api=procurement(),doc=api.doc(),order=kind==='order'?(doc.orders||[]).find((o)=>o.id===id):null,supplierId=order?.supplierId||id;
    const title=kind==='return'?'Retour fournisseur':kind==='order'?'Réception de commande':'Réception directe';
    const html=`<button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button><div class="mzi-modh"><div><h3>${title}</h3><span>Le mouvement et le coût sont inscrits dans l'historique de stock.</span></div></div><div class="mzi-form">${order?'':procurementLineFields(doc,supplierId)}${order?`<div class="mzi-fg"><label>Lignes à réceptionner</label>${order.lines.map((l)=>`<div>${esc(l.name)} · ${l.qty-(l.receivedQty||0)} restant(s)</div>`).join('')}</div><div class="mzi-fg"><label>Référence</label><input id="mz-pm-ref"></div>`:''}</div><div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn primary" id="mz-pm-save">Enregistrer</button></div>`;
    invSetModal(html,(el)=>{$('#mz-pm-save',el).onclick=async()=>{const save=$('#mz-pm-save',el);save.disabled=true;const ref=$('#mz-pm-ref',el).value;const supplier=order?.supplierId||$('#mz-pm-sup',el).value;const wanted=order?order.lines.map((l)=>({...l,qty:Math.max(0,l.qty-(l.receivedQty||0))})).filter((l)=>l.qty>0):[procurementLine(el)];const posted=await postMaisonProcurement(kind,wanted,ref,supplier);if(posted.error){save.disabled=false;toast('Opération refusée',5200,'danger',posted.error==='variant-required'?'Choisissez la variante exacte de chaque article.':'Le mouvement de stock n’a pas été autorisé.');return;}const input={supplierId:supplier,externalRef:ref,lines:posted.lines,skipMovements:true,skipCosts:true};const res=order?api.receiveOrder(order.id,input):kind==='return'?api.returnToSupplier(input):api.receiveDirect(input);if(res?.error){save.disabled=false;toast('Opération refusée',5200,'danger','Le document fournisseur n’a pas pu être enregistré.');return;}closeVeil('#mz-inv-veil');renderSuppliers();toast(kind==='return'?'Retour fournisseur enregistré':'Réception enregistrée');};});
  }
  function openPurchaseOrder() {
    const api=procurement(),doc=api.doc();
    const html=`<button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button><div class="mzi-modh"><div><h3>Nouveau bon de commande</h3><span>Créez le brouillon, puis marquez-le envoyé depuis la liste.</span></div></div><div class="mzi-form">${procurementLineFields(doc,'')}<div class="mzi-fg"><label>Date attendue</label><input id="mz-po-date" type="date"></div></div><div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn primary" id="mz-po-save">Créer</button></div>`;
    invSetModal(html,(el)=>{$('#mz-po-save',el).onclick=()=>{const res=api.createOrder({supplierId:$('#mz-pm-sup',el).value,expectedDate:$('#mz-po-date',el).value,note:$('#mz-pm-ref',el).value,lines:[procurementLine(el)]});if(res?.error){toast('Fournisseur et article requis');return;}closeVeil('#mz-inv-veil');renderSuppliers();toast(`Commande ${res.number} créée`);};});
  }

  /* ═══════════════════════ CASSE & GESTION DES PERTES ═══════════════════ */
  /* La casse en boutique d'art de la table & décoration (céramique, verrerie, cristal, bougies)
   * est un fait d'exploitation régulier. Tracée via `KiwiBoutiqueCatalog.adjustStock`
   * et le grand livre `KiwiInventory` (reason: 'loss') avec le coût d'achat réel. */
  const CASSE_KEY = 'kiwi:mzCasseLog';
  let CASSE_LOG = null;
  function loadCasseLog() {
    if (CASSE_LOG) return CASSE_LOG;
    try {
      const stored = localStorage.getItem(CASSE_KEY + ':' + merchantSlug());
      if (stored) CASSE_LOG = JSON.parse(stored);
    } catch (_) {}
    if (!Array.isArray(CASSE_LOG)) {
      CASSE_LOG = IS_DEMO ? [
        { id: 'casse-1', ts: Date.now() - 36 * 3600 * 1000, pid: 'mz_fes_bleu_assiette', name: 'Assiette plate 27cm Fès Bleu', qty: 2, unitCost: 45, totalLoss: 90, reason: 'Chute déballage carton', by: 'Kenza Tazi' },
        { id: 'casse-2', ts: Date.now() - 90 * 3600 * 1000, pid: 'mz_verres_beldi_set', name: 'Verres soufflés Beldi (Lot 6)', qty: 1, unitCost: 75, totalLoss: 75, reason: 'Manipulation client rayon verrerie', by: 'Yasmine' },
      ] : [];
    }
    return CASSE_LOG;
  }
  function saveCasseLog() {
    try {
      localStorage.setItem(CASSE_KEY + ':' + merchantSlug(), JSON.stringify(CASSE_LOG || []));
    } catch (_) {}
  }
  function recordCasse(pid, size, color, qty, reason) {
    qty = Math.max(1, parseInt(qty, 10) || 1);
    const p = P[pid];
    if (!p) { toast('Article introuvable'); return false; }
    const cat = window.KiwiBoutiqueCatalog;
    const v = cat && cat.findVariant ? cat.findVariant(pid, color, size) : null;
    const vid = v ? v.id : null;
    const unitCost = +p.cost || Math.round(p.price * 0.55);
    const totalLoss = unitCost * qty;
    const why = 'casse · ' + (reason || 'Casse magasin');

    /* Une casse est un motif DISCRÉTIONNAIRE : le serveur ne l'accepte d'une
       caisse qu'avec le code d'un responsable (functions/api/inventory/
       movements.js). Écrite ici sans autorisation, elle bougeait le stock mais
       sa ligne était refusée et restait sur la tablette — la page « Mouvements
       de stock » du tableau de bord ne voyait jamais la pièce cassée. Elle
       passe donc par le même geste que « Déclarer un mouvement » : le pavé du
       responsable, puis l'envoi autorisé. Un refus remet la pièce en stock. */
    const MZ = window.KiwiMaisonStock;
    if (vid && MZ && MZ.requestManual && pvReal()) {
      ensureStockJournal();
      return Promise.resolve(MZ.requestManual({
        productId: pid, variantId: vid, type: 'casse', qty,
        note: reason || 'Casse magasin', source: 'caisse',
      })).then((res) => {
        if (!res || !res.ok) {
          toast(res && res.reason === 'stock-insuffisant' ? `Stock insuffisant : il n'y a que ${res.before} pièce(s).`
            : res && res.reason === 'non-autorise' ? 'Casse non autorisée · code responsable requis'
              : res && res.reason === 'reseau' ? 'Réseau indisponible · réessayez pour faire autoriser la casse'
                : 'Casse impossible');
          return false;
        }
        return logCasse(p, pid, size, qty, unitCost, totalLoss, reason);
      });
    }

    if (vid && cat && cat.adjustStock) {
      cat.adjustStock(vid, -qty, why);
    } else {
      stockAdd(pid, size, -qty);
    }
    
    try {
      if (window.KiwiInventory && window.KiwiInventory.add) {
        window.KiwiInventory.add({
          itemId: pid, qty: -qty, reason: 'loss', refType: 'breakage',
          refId: `casse-${Date.now().toString(36)}`, note: `Casse Vogue Home: ${reason}`,
          unitCost: unitCost
        });
      }
    } catch (_) {}
    return logCasse(p, pid, size, qty, unitCost, totalLoss, reason);
  }
  function logCasse(p, pid, size, qty, unitCost, totalLoss, reason) {
    const entry = {
      id: `casse-${Date.now().toString(36)}`,
      ts: Date.now(),
      pid,
      name: p.name + (size && size !== 'TU' ? ' · ' + size : ''),
      qty,
      unitCost,
      totalLoss,
      reason: reason || 'Non précisé',
      by: (STAFF && STAFF.caissiere && STAFF.caissiere.name) || 'Caisse'
    };
    const log = loadCasseLog();
    log.unshift(entry);
    saveCasseLog();
    rebuildCatalog();
    renderAll();
    toast(`Casse enregistrée · −${qty} pièce(s) (perte financière : ${fmtMAD(totalLoss)})`);
    return true;
  }

  function renderCasse() {
    const panel = $('[data-mz-panel="casse"]', root);
    if (!panel) return;
    const log = loadCasseLog();
    const allProducts = [];
    RAYONS.forEach((r) => r.items.forEach((p) => allProducts.push(p)));
    const totalCasseLoss = log.reduce((acc, row) => acc + (row.totalLoss || 0), 0);

    panel.innerHTML = `
      <div class="mz-casse-view mz-page">
        <header class="mz-head">
          <div>
            <h1>Déclaration de Casse &amp; Pertes</h1>
            <div class="mz-head-sub">Dépréciation immédiate, valorisation au coût d'achat et traçabilité inventaire</div>
          </div>
          <div class="mz-head-metric is-danger">
            Perte totale enregistrée : ${fmtMAD(totalCasseLoss)}
          </div>
        </header>

        <div class="mz-casse-box">
          <h2 class="mz-section-title">Déclarer un article cassé / détérioré</h2>
          <div class="mz-form-grid">
            <div class="mz-field">
              <label>Article</label>
              <select id="mz-casse-pid">
                ${allProducts.map((p) => `<option value="${p.id}">${p.marque ? '[' + esc(p.marque) + '] ' : ''}${esc(p.name)} (${fmtMAD(p.price)})</option>`).join('')}
              </select>
            </div>
            <div class="mz-field">
              <label>Quantité cassée</label>
              <input id="mz-casse-qty" type="number" min="1" max="50" value="1" />
            </div>
            <div class="mz-field">
              <label>Motif</label>
              <select id="mz-casse-reason">
                <option value="Chute lors du déballage en réserve">Chute déballage</option>
                <option value="Manipulation client en rayon">Accident client en rayon</option>
                <option value="Défaut d'émail / fêlure découverte">Fêlure / Défaut d'émail</option>
                <option value="Casse lors de la livraison fragile">Casse transport / livraison</option>
                <option value="Autre incident magasin">Autre incident</option>
              </select>
            </div>
          </div>

          <div class="mz-casse-cost-preview" id="mz-casse-preview">
            <span>Coût d'achat imputé : <b id="mz-casse-preview-unit">0 MAD</b></span>
            <span>Perte financière magasin : <b id="mz-casse-preview-total">0 MAD</b></span>
          </div>

          <div class="mz-card-actions">
            <button class="mz-btn primary is-danger" id="mz-casse-submit">
              <i data-lucide="shield-alert"></i>Enregistrer la casse &amp; décrémenter le stock
            </button>
          </div>
        </div>

        <div class="mz-casse-box">
          <h2 class="mz-section-title">Historique des déclarations de casse</h2>
          ${log.length ? `
          <table class="mz-casse-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Article</th>
                <th>Qté</th>
                <th>Coût d'achat</th>
                <th>Perte totale</th>
                <th>Motif</th>
                <th>Déclaré par</th>
              </tr>
            </thead>
            <tbody>
              ${log.map((row) => `
                <tr>
                  <td>${fmtDT(new Date(row.ts))}</td>
                  <td><b>${esc(row.name)}</b></td>
                  <td><b>${row.qty}×</b></td>
                  <td style="font-family:var(--mono);">${fmtMAD(row.unitCost)}</td>
                  <td style="font-family:var(--mono); color:#BA1A1A; font-weight:700;">${fmtMAD(row.totalLoss)}</td>
                  <td>${esc(row.reason)}</td>
                  <td>${esc(row.by)}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<div class="mz-empty">Aucune casse enregistrée.</div>'}
        </div>
      </div>`;

    const pidSel = $('#mz-casse-pid', panel);
    const qtyIn = $('#mz-casse-qty', panel);
    const reasonSel = $('#mz-casse-reason', panel);

    const updatePreview = () => {
      const p = P[pidSel.value];
      const q = Math.max(1, parseInt(qtyIn.value, 10) || 1);
      const unit = p ? (+p.cost || Math.round(p.price * 0.55)) : 0;
      $('#mz-casse-preview-unit', panel).textContent = fmtMAD(unit);
      $('#mz-casse-preview-total', panel).textContent = fmtMAD(unit * q);
    };

    if (pidSel) pidSel.onchange = updatePreview;
    if (qtyIn) qtyIn.oninput = updatePreview;
    updatePreview();

    const submitBtn = $('#mz-casse-submit', panel);
    if (submitBtn) {
      submitBtn.onclick = () => {
        const pid = pidSel.value;
        const q = Math.max(1, parseInt(qtyIn.value, 10) || 1);
        const reason = reasonSel.value;
        const p = P[pid];
        if (!p) return;
        submitBtn.disabled = true;   // le pavé du responsable peut rester ouvert : pas de double déclaration
        Promise.resolve(recordCasse(pid, sizesOf(p)[0] || 'TU', p.colors[0] || 'defaut', q, reason))
          .then(() => { submitBtn.disabled = false; renderCasse(); icons(); });
      };
    }
    icons();
  }

  /* ═══════════════════════ LIVRAISON FRAGILE & BONS DE LIVRAISON ═══════════════════ */
  function openDeliveryModal() {
    const el = $('#mz-deliverym', root);
    const d = state.ticket.delivery || {
      name: ticketClient() ? ticketClient().name : '',
      phone: ticketClient() ? ticketClient().phone : '',
      address: '',
      quartier: 'Marshan',
      slot: 'Aujourd’hui (15h - 19h)',
      reinforcedWrap: state.ticket.lines.some((l) => l.fragile || (P[l.pid] && P[l.pid].fragile)),
      instructions: 'Manipuler avec précaution (céramique & cristal).',
    };
    const QUARTIERS_TANGER = [
      'Marshan', 'Malabata', 'Centre-Ville / Boulevard', 'Iberia',
      'California / Vieille Montagne', 'Achakar / Cap Spartel', 'Val Fleuri',
      'Mesnana / Boukhalef', 'Gzenaya', 'Zone Franche'
    ];
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Livraison Fragile · Tanger</h3>
      <p class="modal-subtle">Bon de livraison et emballage sécurisé</p>
      <div class="mz-delivery-form">
        <label><span>Nom du destinataire</span>
          <input id="mz-del-name" placeholder="Nom et prénom" value="${esc(d.name)}" />
        </label>
        <label><span>Téléphone (WhatsApp livreur)</span>
          <input id="mz-del-tel" inputmode="tel" placeholder="06… ou 07…" value="${esc(d.phone)}" />
        </label>
        <label><span>Quartier de Tanger</span>
          <select id="mz-del-quartier">
            ${QUARTIERS_TANGER.map((q) => `<option value="${esc(q)}" ${d.quartier === q ? 'selected' : ''}>${esc(q)}</option>`).join('')}
          </select>
        </label>
        <label><span>Adresse précise (Rue, Résidence, Étage)</span>
          <input id="mz-del-addr" placeholder="Ex: Résidence Al Andalous, Imm B, Apt 14" value="${esc(d.address)}" />
        </label>
        <label><span>Créneau de livraison souhaité</span>
          <select id="mz-del-slot">
            <option value="Matin (10h - 13h)">Matin (10h - 13h)</option>
            <option value="Après-midi (15h - 19h)" selected>Après-midi (15h - 19h)</option>
            <option value="Demain matin">Demain matin</option>
            <option value="Sur rendez-vous">Sur rendez-vous client</option>
          </select>
        </label>
        <label style="flex-direction:row; align-items:center; gap:8px; margin-top:4px;">
          <input type="checkbox" id="mz-del-wrap" ${d.reinforcedWrap ? 'checked' : ''} />
          <span style="font-size:12.5px; font-weight:600; color:var(--riad,#053B2C);">Emballage renforcé requis (Protection bulle + calage)</span>
        </label>
        <label><span>Instructions de transport</span>
          <input id="mz-del-inst" placeholder="Instructions chauffeur" value="${esc(d.instructions)}" />
        </label>
      </div>
      <div class="modal-actions is-visible" style="margin-top:16px;">
        <button class="ma-btn secondary" id="mz-del-cancel">Annuler</button>
        ${state.ticket.delivery ? '<button class="ma-btn secondary" id="mz-del-remove" style="color:var(--danger,#BA1A1A);">Supprimer livraison</button>' : ''}
        <button class="ma-btn primary" id="mz-del-save"><i data-lucide="check"></i>Enregistrer la livraison</button>
      </div>`;
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-delivery-veil'); });
    const cancel = $('#mz-del-cancel', el);
    if (cancel) cancel.onclick = () => closeVeil('#mz-delivery-veil');
    const remove = $('#mz-del-remove', el);
    if (remove) remove.onclick = () => {
      state.ticket.delivery = null;
      closeVeil('#mz-delivery-veil');
      renderTicket(); icons();
      toast('Livraison retirée du ticket');
    };
    const save = $('#mz-del-save', el);
    if (save) save.onclick = () => {
      const name = $('#mz-del-name', el).value.trim();
      const phone = $('#mz-del-tel', el).value.trim();
      const quartier = $('#mz-del-quartier', el).value;
      const address = $('#mz-del-addr', el).value.trim();
      const slot = $('#mz-del-slot', el).value;
      const reinforcedWrap = $('#mz-del-wrap', el).checked;
      const instructions = $('#mz-del-inst', el).value.trim();
      if (!name) { toast('Le nom du destinataire est requis'); return; }
      state.ticket.delivery = { name, phone, quartier, address, slot, reinforcedWrap, instructions };
      closeVeil('#mz-delivery-veil');
      renderTicket(); icons();
      toast(`Livraison enregistrée · ${quartier}`);
    };
    openVeil('#mz-delivery-veil');
  }

  function printDeliveryNoteNow(opts, parts) {
    const sale = opts.sale || {};
    const del = (sale.delivery) || (state.ticket && state.ticket.delivery) || {
      name: opts.customer ? opts.customer.name : 'Client',
      phone: opts.customer ? opts.customer.phone : '',
      quartier: 'Tanger Centre', address: 'À préciser', slot: 'Journée',
      reinforcedWrap: true, instructions: 'Attention fragile.'
    };
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif; max-width:480px; margin:20px auto; padding:24px; border:2px solid #0B6E4F; border-radius:12px; background:#fff; color:#0A0F0D;">
        <div style="text-align:center; border-bottom:2px solid #0B6E4F; padding-bottom:12px; margin-bottom:14px;">
          <h2 style="margin:0; font-size:18px; text-transform:uppercase; letter-spacing:0.06em; color:#0B6E4F;">Vogue Home · Tanger</h2>
          <div style="font-size:12px; font-weight:700; color:#555; margin-top:2px;">BON DE LIVRAISON SÉCURISÉ · N° ${esc(opts.ref || sale.id || 'LIV')}</div>
          <div style="font-size:11px; color:#777;">${fmtDT(new Date())} · Conseiller: ${esc((STAFF && STAFF.caissiere && STAFF.caissiere.name) || 'Caisse')}</div>
        </div>
        <div style="background:rgba(217,154,43,0.18); border:1px solid #B25E00; border-radius:8px; padding:10px; margin-bottom:14px; text-align:center;">
          <b style="color:#B25E00; font-size:13px; text-transform:uppercase; display:block;">ATTENTION TRÈS FRAGILE</b>
          <span style="font-size:11px; color:#8A6210;">Articles en céramique & verrerie fine · Maintenir à plat, ne pas superposer de charges lourdes.</span>
        </div>
        <div style="margin-bottom:14px; font-size:12.5px; line-height:1.5;">
          <div><b>Destinataire :</b> ${esc(del.name)} (${esc(del.phone || 'Non renseigné')})</div>
          <div><b>Quartier :</b> ${esc(del.quartier)}</div>
          <div><b>Adresse :</b> ${esc(del.address || 'Au comptoir')}</div>
          <div><b>Créneau :</b> ${esc(del.slot || 'Standard')}</div>
          ${del.instructions ? `<div><b>Note :</b> <i>${esc(del.instructions)}</i></div>` : ''}
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:12px; margin-bottom:16px;">
          <thead>
            <tr style="border-bottom:1px solid #ccc; text-align:left;">
              <th style="padding:6px 4px;">Qté</th>
              <th style="padding:6px 4px;">Article</th>
              <th style="padding:6px 4px;">Marque / Format</th>
              <th style="padding:6px 4px; text-align:right;">Contrôle</th>
            </tr>
          </thead>
          <tbody>
            ${(opts.lines || []).map((l) => `
              <tr style="border-bottom:1px solid #eee;">
                <td style="padding:6px 4px; font-weight:700;">${l.qty || 1}×</td>
                <td style="padding:6px 4px;">${esc(l.name)}</td>
                <td style="padding:6px 4px; font-size:11px; color:#555;">${esc(l.marque || '')} ${l.format === 'service' ? '(Service)' : ''}</td>
                <td style="padding:6px 4px; text-align:right; font-size:14px;">[ &nbsp; ]</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div style="border-top:1px dashed #ccc; padding-top:12px; display:flex; justify-content:space-between; font-size:11px; color:#666;">
          <div>Signature Chauffeur / Livreur :<br><br>____________________</div>
          <div>Signature & Date Réception Client :<br><br>____________________</div>
        </div>
      </div>`;
    const w = window.open('', '_blank', 'width=520,height=680');
    if (w) {
      w.document.write(`<!DOCTYPE html><html><head><title>Bon de Livraison - ${esc(opts.ref)}</title></head><body style="margin:0; background:#f4f4f4;">${html}<script>window.onload=function(){window.print();};<\/script></body></html>`);
      w.document.close();
      toast('Bon de livraison prêt à imprimer');
    } else {
      toast('Impression bloquée par le navigateur');
    }
  }

  function renderScan() {
    const panel = $('[data-mz-panel="scan"]', root);
    panel.innerHTML = `
      <div class="mz-scan mz-page">
        <header class="mz-head">
            <div><h1>Scan produit</h1><div class="mz-head-sub">Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.</div></div>
        </header>
        <div class="mz-scan-inner mz-section-surface">
          <div class="mz-ean-in"><i data-lucide="scan-line"></i>
            <input id="mz-ean" placeholder="Scannez ou tapez un code-barres…" autocomplete="off" />
          </div>
          <div class="mz-scan-or">ou</div>
          ${pvReal()
            ? (camSupported()
                ? `<button class="mz-scan-mock" id="mz-scan-cam"><i data-lucide="camera"></i>Scanner avec la caméra</button>`
                : `<div class="mz-scan-nocam">Ce navigateur ne sait pas lire un code-barres par la caméra. La douchette USB fonctionne, elle tape directement dans le champ ci-dessus.</div>`)
            : `<button class="mz-scan-mock" id="mz-scan-mock"><i data-lucide="scan-line"></i>Scanner un article (douchette démo)</button>`}
          <button class="mz-scan-diag" id="mz-scan-diag"><i data-lucide="activity"></i>Tester la douchette</button>
          <div class="mz-scan-stage" id="mz-scan-stage"><span id="mz-scan-stage-ean"></span><div class="mz-scan-laser"></div></div>
          ${lookupCardHtml()}
          ${crossCardHtml()}
          ${state.scanLog.length ? `
          <div class="mz-scan-log-h">Derniers articles vérifiés</div>
          <div class="mz-scan-log">
            ${state.scanLog.slice(0, 6).map((l) => `
              <div class="mz-scan-log-row ${l.ok ? '' : 'is-err'}">
                <i data-lucide="${l.ok ? 'check-circle-2' : 'x'}"></i>
                <span class="when">${fmtHM(l.at)}</span>
                <span>${esc(l.label)}</span>
                <span class="ean">${esc(l.ean)}</span>
              </div>`).join('')}
          </div>` : (state.lookup ? '' : `<div class="mz-empty">Aucun article vérifié pour l'instant, la douchette USB tape ici toute seule.</div>`)}
        </div>
      </div>`;
    const diag = $('#mz-scan-diag', panel);
    if (diag) diag.onclick = () => openScannerTest();
    const input = $('#mz-ean', panel);
    input.onkeydown = (e) => { if (e.key === 'Enter') { const v = input.value; input.value = ''; lookupScan(v); } };
    input.oninput = () => { if (input.value.replace(/\D/g, '').length >= 13) { const v = input.value; input.value = ''; lookupScan(v); } };
    input.onblur = () => {
      setTimeout(() => {
        if (state.view !== 'scan') return;
        if ($$('.modal-veil.is-open', root).length) return;
        const i = $('#mz-ean', root);
        if (i) i.focus();
      }, 120);
    };
    /* Un seul des deux existe selon le contexte (vraie boutique vs démo). */
    const mk = $('#mz-scan-mock', panel);
    if (mk) mk.onclick = mockScan;
    const cam = $('#mz-scan-cam', panel);
    if (cam) cam.onclick = () => openCamScan(lookupScan);
    const sell = $('#mz-look-sell', panel);
    if (sell) sell.onclick = () => {
      const lk = state.lookup;
      if (!lk || !P[lk.pid]) return;
      const p = P[lk.pid];
      const size = (p.sizes[lk.size] || 0) > 0 ? lk.size : firstFree(p);
      if (!size) { toast(`${p.name}, épuisé dans toutes les tailles`); return; }
      switchView('vente');
      addToTicket(lk.pid, { size, color: lk.color || p.colors[0], qty: 1, remise: 0 });
    };
    icons();
    setTimeout(() => { const i = $('#mz-ean', panel); if (i) i.focus(); }, 60);
  }

  /* SELL path — a code scanned/typed in Vente (the scan bar or the USB douchette)
     drops the EXACT variant (colour + size) straight onto the ticket, like a
     supermarket lane. Resolves EAN-13 or any old/alphanumeric code registered on
     an article. Unknown → offer to register it on a product (no reprint). */
  function commitEan(raw) {
    /* A douchette keeps firing while the payment (or any other) window is open.
       The item would land on a ticket that is already being charged and leave
       with the customer uncharged: refuse, exactly as pos-boutique does. */
    if (root && $$('.modal-veil.is-open', root).length) {
      toast('Terminez la fenêtre ouverte avant de scanner');
      return;
    }
    const code = normScan(raw);
    if (!code) return;
    const hit = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.resolveScan(code) : null;
    const pid = hit ? hit.pid : BY_EAN[code];
    if (!pid || !P[pid]) {
      toast(`Code ${code} inconnu, enregistrez-le sur un article`);
      offerRegister(code);
      return;
    }
    const p = P[pid];
    const c = ticketClient();
    let size = (hit && hit.size && (p.sizes[hit.size] || 0) > 0) ? hit.size
             : (c && p.kind === 'taille' && (p.sizes[c.taille] || 0) > 0) ? c.taille
             : firstFree(p);
    if (!size) {
      toast(`${p.name}, épuisé dans toutes les tailles`);
      return;
    }
    const color = (hit && hit.colorFamily && p.colors.includes(hit.colorFamily)) ? hit.colorFamily : p.colors[0];
    addToTicket(pid, { size, color, qty: 1, remise: 0 }, { quiet: true });
    /* A scanned item added to the bill is an Adjust, on the frame the line is added (design 2027, §20.3). */
    try { if (window.KiwiHaptics) window.KiwiHaptics.play('Adjust', window.KiwiHaptics.gid('scan-add')); } catch (_) {}
    toast(`Bip, ${p.name} · ${size} sur le ticket (${fmtMAD(shelf(p.price))})`);
    if (state.view === 'vente') renderTicket();
    renderBadges();
  }

  /* LOOKUP path — the Scan tab: an employee scans/types a code to SEE the article
     (price, sizes, live stock, colours). Read-only — nothing touches the ticket. */
  function lookupScan(raw) {
    const code = normScan(raw);
    if (!code) return;
    const hit = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.resolveScan(code) : null;
    const pid = hit ? hit.pid : BY_EAN[code];
    if (!pid || !P[pid]) {
      state.lookup = null;
      state.scanLog.unshift({ at: new Date(), ok: false, label: 'Code inconnu, non référencé', ean: code, pid: null, size: '' });
      toast(`Code ${code} inconnu, aucun article ne le porte`);
      /* Le cas où la question vaut le plus cher : l'article n'est pas d'ICI.
         Il est peut-être de l'autre boutique — et c'est la réponse que le
         vendeur cherchait avant même de savoir qu'il pouvait la demander. */
      askCross(code);
      if (state.view === 'scan') renderScan();
      renderBadges();
      offerRegister(code);
      return;
    }
    const p = P[pid];
    /* on affiche la variante scannée même si elle est à zéro — c'est justement le
       stock qu'on vient vérifier. À défaut de taille scannée, la 1re taille. */
    const size = (hit && hit.size && p.sizes[hit.size] != null) ? hit.size : (firstFree(p) || sizesOf(p)[0] || '');
    const color = (hit && hit.colorFamily && p.colors.includes(hit.colorFamily)) ? hit.colorFamily : p.colors[0];
    state.lookup = { pid, size, color, ean: code, at: new Date() };
    state.scanLog.unshift({ at: new Date(), ok: true, label: `${p.name}${size ? ' · ' + size : ''}, vérifié`, ean: code, pid, size });
    const tot = stockOf(p);
    toast(tot > 0 ? `${p.name} · ${tot} en stock` : `${p.name}, épuisé`);
    askCross(code, pid);
    if (state.view === 'scan') renderScan();
    renderBadges();
  }

  function mockScan() {
    if (state.scanBusy) return;
    const cycle = scanCycle();
    if (!cycle.length) return;
    state.scanBusy = true;
    const pid = cycle[state.scanIdx % cycle.length];
    state.scanIdx++;
    const code = P[pid] ? P[pid].ean : '';
    const stage = $('#mz-scan-stage', root);
    const lbl = $('#mz-scan-stage-ean', root);
    if (stage) { stage.classList.add('is-on'); if (lbl) lbl.textContent = code; }
    setTimeout(() => {
      state.scanBusy = false;
      lookupScan(code);
    }, 620);
  }
export { $, $$, DAYS, KC, MIN, artOf, barcode, camSupported, canHoldStock, clById, clientList, colorDot, colorLabel, commitEan, esc, fmtDT, fmtDay, fmtDayY, fmtHM, fmtValidUntil, fmtMAD, holdStock, iconPickerHtml, icons, isDemoStore, lens, lookupScan, looseOf, moveCaretEnd, openCamScan, pad2, printDeliveryNoteNow, rayonOf, releaseStock, renderCasse, renderCats, renderClientes, renderExchNote, renderGrid, renderScan, renderSuppliers, renderTicket, shelf, updateRegistryContribution, useKiwiCl, variantColor, wireIconPicker };
