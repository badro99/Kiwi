/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE MODE — Maison Mansour (PIN 0002), mode & artisanat.
 * ---------------------------------------------------------------------------
 * Loaded lazily by assets/pos-dispatch.js, which owns the PIN choreography
 * and provides the root <div class="vx-screen" id="pos-boutique">. This file
 * builds the whole app inside it and self-registers on window.KiwiPosDispatch.
 *
 * The boutique story: caftans, takchitas et babouches vendus au toucher —
 * une grille visuelle par rayon, la taille avec le stock par taille sous le
 * doigt, la remise sous accord gérante. Le différenciateur métier :
 * ÉCHANGES & AVOIRS — on retrouve la vente par n° de ticket ou téléphone,
 * on échange la pièce ou on émet un avoir code-barres qui revient en caisse
 * comme moyen de paiement. V1 = couche opérationnelle : la carte part au
 * lecteur partenaire, Kiwi n'encaisse pas.
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
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  /* Un avoir vit six mois : son échéance tombe presque toujours l'année suivante.
     Sans millésime, « sam. 14 févr. » sur un bon papier ne dit pas si c'est celui
     de cette année ou du suivant — et c'est le seul chiffre qui décide si la
     cliente est remboursée ou renvoyée. Les dates d'avoir portent l'année. */
  const fmtDayY = (d) => `${fmtDay(d)} ${d.getFullYear()}`;
  const fmtHM  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const MIN = 60 * 1000;

  /* ── real-store detection ── a REAL merchant has paired their boutique (or the
     shared KiwiEnv marks the session real). Demo people (staff roster + seeded
     clientes/ventes/avoirs) are neutralized whenever pvReal() is true so a real
     store never inherits the Maison Mansour cast. Local demo ⇒ pvReal() false. */
  function pvPaired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }

  /* Prix et coûts saisis par le commerçant. C'était `parseInt(v, 10)`, qui coupe
   * tout ce qui suit la virgule : une chemise à 129,90 était enregistrée à 129 —
   * 0,90 MAD offert à chaque vente, et une marge fausse pour toujours. Le champ
   * est un `type=number` sans `step`, donc il ACCEPTE les décimales : seule la
   * lecture les jetait. On accepte aussi la virgule, que tape un clavier
   * français, et on arrête aux centimes — l'unité réelle du dirham. */
  function bqMoney(v) {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }
  function pvReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!pvPaired(); } catch (_) { return !!pvPaired(); } }

  function toast(msg, ms, kind, desc) {
    if (typeof window.KiwiCaisseToast === 'function') { window.KiwiCaisseToast(msg, ms, kind, desc); return; }
    const stack = $('#toast-stack');
    if (!stack) return;
    const lower = String(msg || '').toLowerCase();
    kind = kind || (/refus|erreur|illisible|impossible|requis/.test(lower) ? 'danger' : /d'abord|attention|déjà|scannez/.test(lower) ? 'warn' : 'success');
    const el = document.createElement('div');
    el.className = `toast is-${kind}`;
    el.setAttribute('role', kind === 'danger' ? 'alert' : 'status');
    const copy = document.createElement('span'); copy.className = 'toast-copy';
    const title = document.createElement('span'); title.className = 'toast-title'; title.textContent = msg;
    copy.appendChild(title);
    if (desc) { const detail = document.createElement('span'); detail.className = 'toast-desc'; detail.textContent = desc; copy.appendChild(detail); }
    el.appendChild(copy);
    stack.appendChild(el);
    setTimeout(() => el.classList.add('fade'), ms || 2200);
    setTimeout(() => el.remove(), (ms || 2200) + 280);
  }

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
    return `<div class="mzi-iconpick">${ICON_KEYS.map((k) => `<button type="button" class="mzi-icon${k === sel ? ' on' : ''}" data-icon="${k}" title="${esc(ICON_LABELS[k] || k)}">${ART[k]}</button>`).join('')}</div>`;
  }
  function wireIconPicker(el, onPick) {
    el.querySelectorAll('.mzi-icon').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.mzi-icon').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (onPick) onPick(b.getAttribute('data-icon'));
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

  /* ───────────────────────── catalogue (base partagée) ─────────────────────────
     Le catalogue est désormais la BASE PARTAGÉE (window.KiwiBoutiqueCatalog) —
     la même que le dashboard lit/écrit. compat() reconstruit la forme
     { RAYONS, P, BY_EAN } que ce module rend déjà : la grille de vente, la fiche
     variante et la douchette parlent tous l’inventaire en direct. La baisse de
     stock à la vente reste en mémoire (démo) ; la saisie de stock et la création
     de produits se font dans la vue Inventaire et persistent dans la base. */
  let RAYONS = [], P = {}, BY_EAN = {};
  function rebuildCatalog() {
    if (!window.KiwiBoutiqueCatalog) { RAYONS = []; P = {}; BY_EAN = {}; return; }
    const c = window.KiwiBoutiqueCatalog.compat();
    RAYONS = c.RAYONS; P = c.P; BY_EAN = c.BY_EAN;
  }
  rebuildCatalog();

  const sizesOf   = (p) => Object.keys(p.sizes);
  const stockOf   = (p) => sizesOf(p).reduce((s, k) => s + p.sizes[k], 0);
  const stockAdd  = (pid, size, d) => { P[pid].sizes[size] = Math.max(0, (P[pid].sizes[size] || 0) + d); };
  /* Persist a COMMITTED stock movement (real vente / retour / échange) to the SHARED
     catalogue — the same base the owner's dashboard reads. stockAdd() above only moves
     the in-memory projection (live display + oversell guard for the open ticket); that
     projection is rebuilt from the base on the next catalogue sync, so a real store's
     stock never actually moved on a sale. This writes the net change through so stock
     counts, low-stock / rupture alerts and stock valuation stay truthful across reloads
     and on the dashboard. The local pitch demo (pvReal() false) keeps the legacy
     in-memory-only behaviour, so Maison Mansour still resets to full stock each load.
     Resolves the exact variant (produit × couleur × taille); guarded so a miss can never
     break the sale. adjustStock() commit fires the subscribe → rebuildCatalog, which
     re-sets P from the base, so this never double-counts the in-memory hold. */
  /* La vente choisit une FAMILLE ("Bleu"), l'inventaire garde des variantes
     distinctes ("navy" et "blue" restent deux articles, deux stocks, deux codes
     — on ne fusionne jamais dans le dos du commerçant). Il faut donc décider
     laquelle bouge, dans cet ordre : l'identifiant exact s'il correspond, sinon
     la même famille EN AYANT du stock (une sortie ne doit pas creuser une
     variante déjà vide pendant qu'une autre est pleine), sinon la même famille,
     sinon la taille seule. Un retour (delta > 0) revient de préférence sur une
     variante existante de la même famille. */
  function persistStock(pid, size, color, delta) {
    if (!delta || !pvReal()) return;
    try {
      const cat = window.KiwiBoutiqueCatalog;
      if (!cat || !cat.listVariants || !cat.adjustStock) return;
      const sameSize = (cat.listVariants(pid) || []).filter((x) => String(x.size) === String(size));
      const fam = (x) => (cat.colorFamily ? cat.colorFamily(x) : x.colorId);
      const covers = (x) => (x.stock || 0) >= -delta;
      // Sur une SORTIE, « en avoir » passe avant « porter le même identifiant » :
      // sinon une vente de bleu se déduirait d'une variante bleue déjà vide
      // pendant que la variante marine, elle, est pleine — le magasin perdrait la
      // sortie de son stock. Sur un RETOUR, l'identifiant exact suffit.
      const matched = (delta < 0 && sameSize.find((x) => x.colorId === color && covers(x)))
             || (delta < 0 && sameSize.find((x) => fam(x) === color && covers(x)))
             || sameSize.find((x) => x.colorId === color)
             || sameSize.find((x) => fam(x) === color);
      /* Dernier recours : la couleur vendue n'existe pas du tout dans cette
         taille. Ne rien bouger fausserait le total du magasin — la pièce est
         bien sortie. Mais imputer en silence sur `sameSize[0]` écrivait « vente
         de marine » sur un article que personne n'a pris, et creusait au hasard
         une variante peut-être déjà vide pendant qu'une autre était pleine. On
         retient donc d'abord une variante qui a réellement du stock, et on DIT
         dans le motif que la couleur n'a pas été appariée : l'approximation
         reste lisible dans le journal au lieu d'être maquillée en certitude. */
      const v = matched || sameSize.find((x) => covers(x)) || sameSize[0];
      /* Le MOTIF suit le mouvement. Le stock est désormais un journal
         (assets/boutique-catalog.js) : « vente » et « retour » distinguent une
         sortie au comptoir d'une reprise, ce qui rend le journal lisible le jour
         où quelqu'un demande où sont passées douze pièces. */
      if (v) cat.adjustStock(v.id, delta, (delta < 0 ? 'vente' : 'retour') + (matched ? '' : ' · couleur non appariée'));
    } catch (_) {}
  }
  /* ══════════ UNE VENTE SORTIE DES LIVRES REND SON STOCK ═══════════════════
   * La console opérateur peut retirer une vente d'essai des livres (« god mode » ,
   * functions/api/admin/sales.js) : `void_ts` est daté, /api/feed cesse de servir
   * la ligne, et le tableau de bord recalcule tout à partir de là — recette,
   * panier, classement produits. Impeccable côté argent.
   *
   * Côté MARCHANDISE, rien ne bougeait. La vente d'essai avait décrémenté le
   * stock partagé au moment de l'encaissement (persistStock ci-dessus), et ce
   * mouvement-là restait : le tableau de bord affichait la bonne recette et un
   * stock faux, et l'article manquait à l'inventaire d'une vente qui, selon
   * Kiwi lui-même, n'avait jamais eu lieu. Sur une installation où l'on passe
   * cinq ou six ventes d'essai, c'est tout le comptage d'ouverture qui est
   * décalé.
   *
   * Ce n'est pas le serveur qui peut le réparer. La ligne qu'il détient ne porte
   * que { nom, quantité, total, rayon } — pas l'identifiant du produit, pas la
   * couleur, pas la taille (voir le panier construit dans onPaid). La caisse qui
   * a encaissé, elle, tient tout cela dans son propre journal. C'est donc elle
   * qui rend le stock, et elle seule : une AUTRE caisse du même magasin ne
   * trouvera pas la vente dans son journal et ne fera rien — ce qui est
   * exactement le comportement voulu, sans avoir à se coordonner.
   *
   * Trois règles :
   *  · EXACTEMENT UNE FOIS. La marque `voided` portée par la vente EST le
   *    registre : on ne rend le stock qu'en la posant. Le serveur renvoyant la
   *    liste complète des retraits à chaque passage, tout compteur séparé aurait
   *    fini par gonfler le stock à chaque sondage.
   *  · DANS LES DEUX SENS. « Remettre » fait disparaître la vente de la liste :
   *    la marque tombe et le stock ressort. Une vente d'essai remise en jeu par
   *    erreur ne laisse donc pas de marchandise fantôme.
   *  · LES LIGNES DÉJÀ RENDUES NE LE SONT PAS DEUX FOIS. Un article retourné au
   *    comptoir (restoreLines) a déjà regagné le stock ; le retrait des livres
   *    ne doit pas l'y remettre une seconde fois.
   *
   * Une vente plus ancienne que le journal (RETAIN_DAYS) n'est plus là : on ne
   * fait rien et on ne prétend rien. Rendre à l'aveugle le stock d'une vente de
   * trois semaines, alors que l'inventaire a été recompté depuis, ferait plus de
   * dégâts que le décalage qu'on prétend corriger. */
  function reconcileVoids(refs) {
    if (IS_DEMO || !pvReal()) return 0;
    const KP = window.KiwiPosSale;
    const hit = (KP && KP.refMatcher) ? KP.refMatcher(refs) : null;
    let touched = 0;
    const move = (sale, sign) => {
      /* Une copie importée du serveur peut venir d'une AUTRE caisse. Seule la
         caisse qui a réellement décrémenté le stock répare un void God mode ;
         celle-ci marque la vente sortie mais ne rend pas la marchandise deux fois. */
      if (sale.remote) return;
      (sale.lines || []).forEach((ln) => {
        if (!ln) return;
        const remaining = lineAvailableQty(ln);
        if (!remaining) return;                  // déjà rendue au comptoir
        persistStock(ln.pid, ln.size, ln.color, sign * remaining);
      });
    };
    SALES.forEach((sale) => {
      if (!sale || !sale.id) return;
      const out = !!(hit && hit(sale.id));
      if (out === !!sale.voided) return;         // rien à faire pour celle-ci
      if (out) { move(sale, +1); sale.voided = true; }   // sortie : la marchandise revient
      else { move(sale, -1); sale.voided = false; }      // remise : elle repart
      touched++;
    });
    if (touched && root) {
      persistDay();
      rebuildCatalog();      /* le stock a bougé : la grille de vente le montre */
      pruneTicket();
      refreshOps();
      /* La ligne d'argent, explicitement : renderView() ne la touche pas, et
         c'est LE chiffre que l'opérateur vient de promettre au commerçant de
         faire disparaître. Le stock corrigé sous un total inchangé aurait juste
         déplacé le mensonge. */
      const today = $('#mz-today', root);
      if (today) today.textContent = headSubVente();
    } else if (touched) {
      persistDay();
    }
    return touched;
  }

  const sizeWord  = (p) => p.kind === 'pointure' ? 'Pointure' : p.kind === 'tu' ? 'Taille unique' : 'Taille';
  const firstFree = (p) => sizesOf(p).find((k) => p.sizes[k] > 0) || null;

  /* ───────────────────────── équipe & clientes (Tanger · Centre) ───────────── */
  /* A REAL boutique never inherits Vogue Home's staff — the roster is
     neutralized (« Vendeur N », blank role) while keeping the same shape/length.
     Local demo (pvReal() false) keeps the named cast, byte-identical. */
  const STAFF = pvReal() ? {
    gerante:   { name: 'Vendeur 1', role: '' },
    conseil:   { name: 'Vendeur 2', role: '' },
    caissiere: { name: 'Vendeur 3', role: '' },
  } : {
    gerante:   { name: 'Soraya Lahlou', role: 'Gérante Vogue Home' },
    conseil:   { name: 'Kenza Tazi',     role: 'Conseillère d’art de table' },
    caissiere: { name: 'Yasmine',        role: 'Caisse' },
  };

  /* The person who entered their code owns this session: their name goes on the
     ticket header and on every sale's `by`, so the day's takings are attributable
     to whoever actually rang them. Mutates the existing object rather than
     replacing it, because the render paths read STAFF.caissiere directly — and it
     re-runs on every unlock, so a handover follows the person, not the module's
     first load. Real stores only; the local demo keeps its named cast. */
  function syncTillStaff() {
    if (!pvReal()) return;
    const me = window.KiwiStaff;
    if (!me || !me.name) return;
    STAFF.caissiere.name = me.name;
    STAFF.caissiere.role = me.role || '';
  }

  /* A REAL boutique starts with an empty client book (its own clientes are read
     from KiwiClients / captured at the till). Only the local demo seeds this cast. */
  const CLIENTES = pvReal() ? [] : [
    { id: 'c1', name: 'Lalla Kenza Alami', phone: '0661 42 18 30', points: 1420, taille: 'TU', achats: 8, spent: 16800, vip: true,
      prefs: ['Service Fès Bleu', 'Emballage cadeau systématique'],
      history: [{ when: '24 mai', what: 'Service 18 pcs Fès Bleu', amt: 1450 }, { when: '12 avr.', what: 'Bougie Max 24 Totem', amt: 1850 }] },
    { id: 'c2', name: 'Mme Ghita Benjelloun', phone: '0664 77 02 19', points: 650, taille: 'TU', achats: 5, spent: 5400,
      prefs: ['Liste de mariage en cours', 'Verres Beldi émeraude'],
      history: [{ when: '10 juin', what: 'Verres soufflés Beldi (Lot 6)', amt: 140 }, { when: '18 mai', what: 'Carafe Beldi 1.5L', amt: 120 }] },
    { id: 'c3', name: 'Lalla Meryem Berrada', phone: '0667 31 55 08', points: 2300, taille: 'TU', achats: 12, spent: 28900, vip: true,
      prefs: ['Céramique Majorelle', 'Livraison fragile Marshan'],
      history: [{ when: '28 mai', what: 'Vase céramique émaillée', amt: 650 }, { when: '6 mai', what: 'Service Zellige Vert', amt: 1100 }] },
    { id: 'c4', name: 'Dr. Nabil El Omari', phone: '0650 09 64 12', points: 310, taille: 'TU', achats: 3, spent: 2600,
      prefs: ['Diffuseurs senteurs Tanger'],
      history: [{ when: '30 mai', what: 'Diffuseur Fleur d’Oranger Tanger', amt: 480 }] },
    { id: 'c5', name: 'Mme Sofia Tazi', phone: '0668 23 90 41', points: 450, taille: 'TU', achats: 2, spent: 1800,
      prefs: ['Cadeaux d’affaires & emballages prestige'],
      history: [{ when: '3 juin', what: 'Plateau laiton martelé', amt: 420 }] },
  ];
  const CL = Object.fromEntries(CLIENTES.map((c) => [c.id, c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const firstName = (name) => name.replace(/^Lalla\s+|^Mme\s+/i, '').split(/\s+/)[0];

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
      vip: !!(window.KiwiClients && KiwiClients.segment(c) === 'vip'), prefs: c.notes ? [c.notes] : [], history: [] };
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
  const IS_DEMO = isDemoStore();  // frozen for this session — gates the seeded demo sales/avoirs/ticket

  /* ───────────────────────── ventes du jour (seed, mi-journée) ──────────── */
  const NOW = Date.now();
  const mkLine = (pid, size, color, qty, remise) => {
    const p = P[pid];
    const rem = remise || 0;
    return { pid, size, color, qty, remise: rem, unit: Math.round(p.price * (100 - rem) / 100), returned: false, note: '' };
  };
  const SALES = IS_DEMO ? [
    { id: '1207', at: new Date(NOW - 24 * MIN),  clientId: 'c4', by: 'Rania', kind: 'vente', methods: 'espèces',
      lines: [mkLine('caftan_ete', 'S', 'ivoire', 1), mkLine('broche_perles', 'TU', 'argent', 1)] },
    { id: '1206', at: new Date(NOW - 57 * MIN),  clientId: 'c3', by: 'Aicha', kind: 'vente', methods: 'carte',
      lines: [mkLine('takchita_sultane', 'M', 'dore', 1, 10)] },
    { id: '1205', at: new Date(NOW - 96 * MIN),  clientId: null, by: 'Aicha', kind: 'vente', methods: 'espèces',
      lines: [mkLine('cabas_berbere', 'TU', 'terracotta', 1)] },
    { id: '1204', at: new Date(NOW - 135 * MIN), clientId: 'c2', by: 'Salma', kind: 'vente', methods: 'carte',
      lines: [mkLine('babouche_brodee', '38', 'rose', 1), mkLine('foulard_soie', 'TU', 'safran', 1)] },
    { id: '1203', at: new Date(NOW - 170 * MIN), clientId: null, by: 'Rania', kind: 'vente', methods: 'espèces',
      lines: [mkLine('babouche_homme', '42', 'camel', 1)] },
  ] : [];
  SALES.forEach((s) => { s.total = s.lines.reduce((t, l) => t + l.unit * l.qty, 0); });
  /* Jamais une vente sortie des livres : elle a disparu des écrans, mais un
     identifiant retenu dans state.ret / state.exchange peut encore la désigner
     une seconde après le retrait. */
  const findSale = (id) => SALES.find((s) => s.id === id && !s.voided);
  /* Résout la cliente d'une vente. IMPÉRATIF : passer par clById, pas par CL[…].
     Sur une VRAIE boutique, CLIENTES/CL sont vides (le carnet vit dans KiwiClients),
     donc CL[s.clientId] renvoyait toujours undefined et TOUTE vente s'affichait
     « Cliente de passage » à l'écran Échanges & avoirs — alors que checkout() avait
     bien horodaté le bon clientId. clById route vers KiwiClients quand c'est réel et
     garde le comportement démo intact. */
  const saleClient = (s) => (s && s.clientId ? clById(s.clientId) : null);

  /* avoirs actifs — store credit. AV-2031 vient du retour cherbil d'hier. */
  const AVOIRS = IS_DEMO ? [
    { code: 'AV-2031', amount: 350, balance: 350, holderId: 'c2', holderName: 'Salma Bennis',
      motif: 'Retour cherbil perlé · 37', at: new Date(NOW - 26 * 3600 * 1000), until: new Date(NOW + 182 * 24 * 3600 * 1000), from: '1188' },
  ] : [];
  let avSeq = 2032;
  const activeAvoirs = () => AVOIRS.filter((a) => a.balance > 0);

  /* Les avoirs (bons d'achat) d'une VRAIE boutique doivent survivre à un
     rechargement de la caisse — sinon un bon émis sur un retour disparaît au
     prochain refresh et la cliente ne peut plus le consommer (perte sèche de
     crédit magasin). On les range comme le journal du jour (préfixe `kiwi:`,
     purgé au changement de compte via TENANT_PREFIXES), mais SANS filtre
     « aujourd'hui » : un bon vit jusqu'à sa consommation ou son expiration.
     avSeq repart au-delà du dernier code restauré pour ne pas réémettre un code
     déjà en circulation. La démo reste en mémoire, inchangée. */
  const AVOIR_KEY = 'kiwi:bqAvoirs';
  function persistAvoirs() {
    if (IS_DEMO) return;
    try {
      const keep = AVOIRS.filter((a) => a && (a.balance > 0 || (a.until && new Date(a.until) > new Date())));
      localStorage.setItem(AVOIR_KEY, JSON.stringify(keep));
    } catch (_) {}
  }
  (function restoreAvoirs() {
    if (IS_DEMO) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(AVOIR_KEY) || '[]'); } catch (_) { return; }
    if (!Array.isArray(saved) || !saved.length) return;
    let maxSeq = avSeq - 1;
    saved.forEach((a) => {
      if (!a || !a.code) return;
      a.at = a.at ? new Date(a.at) : new Date();
      a.until = a.until ? new Date(a.until) : null;
      a.amount = +a.amount || 0;
      a.balance = +a.balance || 0;
      AVOIRS.push(a);
      const n = parseInt(String(a.code).replace(/^\D+/, ''), 10);
      if (Number.isFinite(n) && n > maxSeq) maxSeq = n;
    });
    if (maxSeq >= avSeq) avSeq = maxSeq + 1;   // le prochain bon ne réutilise pas un code déjà restauré
  })();

  /* ───────────────────────── state ───────────────────────── */
  /* Le préfixe ne sert plus qu'à reconnaître les anciens journaux locaux lors
     de leur migration. Les nouveaux tickets réels n'affichent que des chiffres. */
  function ticketPrefix() {
    if (IS_DEMO) return 'MM';
    const pv = pvPaired();
    const ini = String((pv && pv.name) || '')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map((w) => w[0]).join('')
      .normalize('NFD').replace(/[^A-Za-z]/g, '')
      .toUpperCase();
    return ini || 'KW';
  }
  const TK = ticketPrefix();
  /* 1000 : quatre chiffres, qui se disent d'un trait au téléphone. Pour une
     vraie boutique ce n'est qu'un plancher de migration : le serveur réserve les
     plages qui font autorité et saleSeq ne peut que le pousser vers le haut. */
  let saleSeq = IS_DEMO ? 1208 : 1000;
  let saleSeqPeriod = new Date().getFullYear();

  /* ── le journal du jour survit à un rechargement (boutiques réelles) ───────
     SALES ne vivait qu'en mémoire : recharger la caisse remettait son en-tête à
     « 0 vente · 0 MAD aujourd'hui » alors que le dashboard, qui lit le serveur,
     affichait toujours la recette du jour. Une caissière et la gérante ne doivent
     jamais lire deux chiffres différents pour la même journée.
     Rangé sous le préfixe `kiwi:` pour qu'un changement de compte le purge (voir
     TENANT_PREFIXES dans identity.js), et filtré sur aujourd'hui au chargement :
     le compteur bascule donc tout seul à minuit. saleSeq est repris au-delà du
     dernier numéro restauré, sinon le ticket suivant réutiliserait un numéro déjà
     encaissé. La démo garde ses ventes en mémoire, inchangée. */
  const DAY_KEY = 'kiwi:bqDay';
  function isToday(d) {
    const x = new Date(d), n = new Date();
    return x.getFullYear() === n.getFullYear() && x.getMonth() === n.getMonth() && x.getDate() === n.getDate();
  }

  /* ── « Retour sous 7 jours » — encore faut-il retrouver la vente ────────────
   * L'échange affiche « retour sous 7 jours », mais le journal ne gardait que la
   * journée en cours : une cliente qui revenait le jeudi avec un article acheté
   * le mardi était introuvable, et l'employé n'avait aucun moyen de vérifier le
   * prix payé. La promesse faite au comptoir ne tenait qu'un jour.
   *
   * Le journal garde donc RETAIN_DAYS jours. Deux limites, pour que cet
   * élargissement ne déborde nulle part :
   *
   *  · L'ARGENT RESTE À LA JOURNÉE. caToday() et l'en-tête filtrent
   *    explicitement sur aujourd'hui (voir salesToday) : ils sommaient tout
   *    SALES en se fiant au fait qu'il ne contenait qu'un jour, et garder une
   *    semaine y aurait affiché une recette multipliée par sept sous le mot
   *    « aujourd'hui ». C'est le vrai piège de ce changement.
   *  · LE NUMÉRO DE TICKET NE RECULE JAMAIS. saleSeq repart au-dessus du plus
   *    grand numéro RESTAURÉ, toutes journées confondues — sinon un ticket
   *    d'aujourd'hui réutiliserait le numéro d'hier, et deux ventes
   *    différentes se présenteraient sous la même référence dans les retours.
   *
   * Le rapport journalier n'est pas concerné : build() reçoit « toutes les ventes
   * connues (elles seront filtrées sur la journée) » — voir assets/day-report.js.
   * Le plafond de purge borne aussi la taille du journal ; une boutique très
   * active tient largement dans le quota localStorage sur sept jours. */
  const RETAIN_DAYS = 7;
  function withinRetention(d) {
    const x = new Date(d);
    if (isNaN(x)) return false;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (RETAIN_DAYS - 1));       // aujourd'hui inclus
    return x >= start;
  }
  /* Les ventes du JOUR — la seule base admise pour un chiffre d'affaires. Les
     ventes sorties des livres n'en sont plus (voir reconcileVoids). */
  const salesToday = () => SALES.filter((s) => s && !s.voided && isToday(s.at));

  /* Quand une vente a-t-elle eu lieu ? Le journal couvrant maintenant la semaine,
     un libellé « auj. » écrit en dur mentirait sur une vente de mardi. Sur sept
     jours le nom du jour suffit à lever toute ambiguïté. */
  function whenLabel(d) {
    const x = new Date(d);
    if (isToday(x)) return `auj. ${fmtHM(x)}`;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()) {
      return `hier ${fmtHM(x)}`;
    }
    return `${DAYS[x.getDay()]} ${fmtHM(x)}`;
  }

  /* ── À QUI EST CE JOURNAL ─────────────────────────────────────────────────
     Il ne le disait pas. Une caisse ré-appairée d'une enseigne à une autre
     relisait donc les ventes de la PREMIÈRE et les servait sous le nom de la
     SECONDE : « Échanges & avoirs » listait les ventes d'un autre commerce,
     « Réimprimer » proposait leurs tickets, et l'en-tête en comptait une dans
     la recette du jour. Constaté le 30/07/2026 sur une caisse en production —
     le journal local disait CM-15-44 pendant que le comptoir tapait des tickets
     SS-16-44 et que le tableau de bord, lui, comptait juste.

     Deux gardes, parce qu'elles ne couvrent pas la même population :

      · LE TAMPON, pour tout ce qui s'écrit désormais. Le blob porte son
        commerçant ; à la relecture, un autre nom et on n'adopte rien.
      · LE PRÉFIXE DE TICKET, pour les blobs déjà sur les appareils, qui n'ont
        aucun tampon. Une référence porte l'initiale de l'enseigne (voir
        ticketPrefix) : « CM- » relu sous une enseigne qui tape « SS- » n'est
        pas d'ici. C'est la seule preuve que porte l'ancien format, et elle
        suffit à réparer les caisses déjà contaminées sans attendre un
        ré-appairage.

     Une enseigne qui se RENOMME perd ainsi sa semaine de journal — sept jours
     de réimpression et de retours. C'est le prix, et il est plus petit que
     l'inverse : montrer à une commerçante les ventes de quelqu'un d'autre. */
  function merchantSlug() {
    try {
      const pv = pvPaired();
      return String((pv && pv.merchant) || localStorage.getItem('kiwiLiveMerchant') || '');
    } catch (_) { return ''; }
  }
  function persistDay() {
    if (IS_DEMO) return;
    try {
      localStorage.setItem(DAY_KEY, JSON.stringify({
        v: 1, m: merchantSlug(), s: SALES.filter((s) => s && withinRetention(s.at)),
      }));
    } catch (_) {}
  }
  (function restoreDay() {
    if (IS_DEMO) return;
    let blob = null;
    try { blob = JSON.parse(localStorage.getItem(DAY_KEY) || 'null'); } catch (_) { return; }
    if (!blob) return;

    let saved;
    if (Array.isArray(blob)) {
      /* Ancien format, sans tampon : on juge sur le préfixe des références. Un
         journal dont AUCUNE référence ne commence par le préfixe d'ici vient
         d'ailleurs. On ne juge que sur les références lisibles — un journal sans
         aucune référence exploitable est adopté, faute de preuve du contraire. */
      const refs = blob.map((s) => String((s && s.id) || '')).filter((r) => /^[A-Z]{2,}-/.test(r));
      const mine = refs.filter((r) => r.indexOf(TK + '-') === 0);
      if (refs.length && !mine.length) {
        try { localStorage.removeItem(DAY_KEY); } catch (_) {}
        return;
      }
      saved = blob;
    } else if (blob && Array.isArray(blob.s)) {
      const now = merchantSlug();
      /* Tampon présent et différent : ce journal est celui d'un autre commerce.
         On l'efface plutôt que de le laisser dormir — il ressortirait au
         prochain ré-appairage vers son propriétaire d'origine, avec une semaine
         de retard et des stocks qui ne correspondent plus. */
      if (blob.m && now && blob.m !== now) {
        try { localStorage.removeItem(DAY_KEY); } catch (_) {}
        return;
      }
      saved = blob.s;
    } else return;

    if (!Array.isArray(saved) || !saved.length) return;
    let maxSeq = 0;
    saved.forEach((s) => {
      if (!s || !s.at || !withinRetention(s.at)) return;      // au-delà de la semaine, on oublie
      s.at = new Date(s.at);
      s.lines = Array.isArray(s.lines) ? s.lines : [];
      s.total = +s.total || s.lines.reduce((t, l) => t + (+l.unit || 0) * (+l.qty || 0), 0);
      // Le plus grand numéro TOUTES JOURNÉES CONFONDUES : un numéro déjà encaissé
      // ne doit jamais resservir, même s'il vient d'hier.
      const n = parseInt(String(s.id || '').replace(/^\D+/, ''), 10);
      if (new Date(s.at).getFullYear() === new Date().getFullYear() && n > maxSeq) maxSeq = n;
      SALES.push(s);
    });
    SALES.sort((a, b) => b.at - a.at);                       // le plus récent d'abord, comme unshift
    if (maxSeq >= saleSeq) saleSeq = maxSeq + 1;
    /* Adopté : on le tamponne TOUT DE SUITE. Sinon un journal d'ancien format
       reste jugé sur son préfixe de ticket jusqu'à la prochaine vente — c'est
       la preuve la plus faible dont on dispose, et une enseigne qui se renomme
       la ferait échouer. Une écriture au démarrage, et la garde repose ensuite
       sur le nom du commerçant, qui lui ne se devine pas. */
    if (Array.isArray(blob)) persistDay();
  })();

  /* ── les tickets du magasin, pas seulement ceux de CET écran ─────────────
   * Échanges & avoirs lisait uniquement `kiwi:bqDay`, donc le journal local de
   * cette tablette. Une vente bien présente dans le dashboard (ou encaissée sur
   * la deuxième caisse) restait introuvable au retour client. Le serveur est le
   * registre commun : on relit la journée et on complète SALES. La copie locale
   * gagne toujours, car elle porte la variante exacte et l'état des retours.
   *
   * Les anciennes lignes serveur portent le nom imprimé (« Jean noir M »), pas
   * encore l'id de variante. On les rattache au produit par le plus long nom de
   * catalogue, puis à sa taille. Ce repli rend les ventes déjà faites utilisables
   * immédiatement ; aucune donnée n'est inventée si aucun produit ne correspond. */
  const srvMethod = (m) => ({ cash: 'espèces', card: 'carte', delivery: 'livraison' }[m] || m || 'paiement');
  function remoteLine(line) {
    if (!line) return null;
    const raw = String(line.name || '').trim();
    let item = line.pid && P[line.pid] ? P[line.pid] : null;
    if (!item && raw) {
      const low = raw.toLocaleLowerCase('fr');
      const uniq = [];
      Object.keys(P).forEach((k) => { const p = P[k]; if (p && !uniq.includes(p)) uniq.push(p); });
      item = uniq.filter((p) => {
        const n = String(p.name || '').toLocaleLowerCase('fr');
        return low === n || low.indexOf(n + ' ') === 0;
      }).sort((a, b) => String(b.name || '').length - String(a.name || '').length)[0] || null;
    }
    if (!item) return null;
    const suffix = raw.slice(String(item.name || '').length).trim();
    const sizes = sizesOf(item);
    const size = String(line.size || (sizes.includes(suffix) ? suffix : '') || sizes[0] || 'TU');
    const variant = (item._variants || []).find((v) => String(v.size) === size) || (item._variants || [])[0];
    const qty = Math.max(1, Number(line.qty) || 1);
    return {
      pid: item.id, size, color: String(line.color || (variant && variant.colorId) || ''), qty,
      remise: 0, unit: Number(line.unit) || ((Number(line.total) || 0) / qty),
      returned: false, note: '', name: item.name,
    };
  }
  function syncReturnSales() {
    if (IS_DEMO || typeof fetch !== 'function') return Promise.resolve(0);
    const merchant = merchantSlug();
    if (!merchant) return Promise.resolve(0);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (RETAIN_DAYS - 1));
    return fetch('/api/feed?merchant=' + encodeURIComponent(merchant) + '&from=' + start.getTime(), {
      credentials: 'same-origin', headers: { Accept: 'application/json' },
    }).then((r) => r.ok ? r.json() : null).then((data) => {
      let added = 0;
      ((data && data.sales) || []).forEach((row) => {
        const ref = String(row.ref || '');
        if (!ref || SALES.some((s) => s && s.id === ref)) return;
        const lines = (Array.isArray(row.lines) ? row.lines : []).map(remoteLine).filter(Boolean);
        if (!lines.length) return; // sans article identifiable, aucun échange honnête à proposer
        SALES.push({
          id: ref, serverId: String(row.id || ''), at: new Date(Number(row.ts) || Date.now()),
          clientId: null, by: 'Caisse', kind: 'vente', methods: srvMethod(row.method), lines,
          total: lines.reduce((sum, l) => sum + l.unit * l.qty, 0), remote: true,
        });
        added++;
      });
      if (added) {
        SALES.sort((a, b) => new Date(b.at) - new Date(a.at));
        persistDay();
        if (root && state.view === 'echanges') { renderEchanges(); renderBadges(); icons(); }
      }
      return added;
    }).catch(() => 0);
  }
  const state = {
    view: 'vente',
    rayon: 'tous',
    filterAxis: 'rayons',        /* 'rayons' | 'marques' | 'motifs' | 'fragile' */
    selectedMarque: 'tous',
    selectedMotif: 'tous',
    ticket: null,                /* { num, lines:[], client:id|'passage'|null, remiseAuth, giftWrap, delivery } */
    exchange: null,              /* { saleId, idx, qty:1 } pendant le choix du remplacement */
    ret: null,                   /* { saleId, picks:Set, quantities:Map, motif } */
    retQuery: '',
    retDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    clQuery: '',
    registriesQuery: '',
    activeRegistry: null,
    casseQuery: '',
    scanLog: [],                 /* journal des articles VÉRIFIÉS (onglet Scan) */
    lookup: null,                /* { pid, size, color, ean, at } — dernière vérif affichée */
    scanIdx: 0,
    scanBusy: false,
    offline: (typeof navigator !== 'undefined' && navigator.onLine === false),
    simulatedOffline: false,
    queued: 0,
    syncBlocked: false,
    syncStorageError: false,
    ticketStorageError: false,
  };

  /* Journal partagé des retours. Avant ceci, le stock et l'avoir changeaient
     bien à la caisse, mais le dashboard ne recevait aucun retour et continuait
     d'afficher ses exemples. */
  const RETURN_LOG_KEY = 'kiwi:bqReturns';
  let RETURN_LOG = [];
  let returnCloudHandle = null;
  (function restoreReturnLog() {
    if (IS_DEMO) return;
    try {
      const d = JSON.parse(localStorage.getItem(RETURN_LOG_KEY) || 'null');
      if (d && (!d.m || !merchantSlug() || d.m === merchantSlug()) && Array.isArray(d.list)) RETURN_LOG = d.list;
    } catch (_) {}
  })();
  function persistReturnLog() {
    if (IS_DEMO) return;
    try { localStorage.setItem(RETURN_LOG_KEY, JSON.stringify({ m: merchantSlug(), list: RETURN_LOG })); } catch (_) {}
  }
  function ensureReturnCloud() {
    if (IS_DEMO || returnCloudHandle || !window.KiwiCloudDoc) return returnCloudHandle;
    returnCloudHandle = window.KiwiCloudDoc.attach({
      feature: 'returns', slug: merchantSlug,
      read: () => ({ list: RETURN_LOG }),
      write: (doc) => {
        RETURN_LOG = Array.isArray(doc && doc.list) ? doc.list : [];
        persistReturnLog();
      },
      isEmpty: (doc) => !doc || !Array.isArray(doc.list) || !doc.list.length,
    });
    returnCloudHandle.bind();
    return returnCloudHandle;
  }
  function recordReturn(sale, idxs, amount, reason, kind, reference, quantities) {
    if (IS_DEMO || !sale) return;
    const items = idxs.map((i) => {
      const ln = sale.lines[i];
      if (!ln) return null;
      const qty = quantities && quantities.has(i) ? Number(quantities.get(i)) || 1 : 1;
      return {
        name: (P[ln.pid] && P[ln.pid].name) || ln.name || 'Article', size: ln.size || '',
        qty, amount: Math.round((Number(ln.unit) || 0) * qty),
      };
    }).filter(Boolean);
    const now = Date.now();
    const client = saleClient(sale);
    RETURN_LOG.unshift({
      id: `RET-${sale.id}-${now}`, ts: now, saleRef: sale.id, kind: kind || 'avoir',
      reason: reason || '', amount: Math.round(Number(amount) || 0), reference: reference || '',
      actor: (STAFF.caissiere && STAFF.caissiere.name) || 'Caisse',
      client: (client && client.name) || 'Cliente de passage', items,
    });
    RETURN_LOG = RETURN_LOG.slice(0, 500);
    persistReturnLog();
    const cloud = ensureReturnCloud();
    if (cloud) cloud.push();
  }
  /* ── LE NUMÉRO DE TICKET : DES CHIFFRES, ET RIEN D'AUTRE ──────────────────
   * Une référence lisible (1000, 1001…) et un identifiant technique sont deux
   * choses différentes. `syncId` est un UUID : deux ventes ne deviennent jamais
   * le même INSERT OR IGNORE, même si un ancien client nous remet un jour une
   * référence erronée. `num` vient d'une plage atomiquement réservée au serveur :
   * deux comptoirs reçoivent des plages disjointes, puis peuvent les consommer
   * hors ligne. Une plage perdue crée un trou ; elle ne revient jamais en vente. */
  const TICKET_LEASE_KEY = 'kiwi:bqTicketLease';
  /* 500 numbers = several busy offline days for a boutique, while staying well
     below the five-digit annual ceiling. The range is persisted immediately. */
  const TICKET_LEASE_SIZE = 500;
  let ticketLease = null;
  let ticketLeaseRequest = null;

  function ticketPeriod() { return new Date().getFullYear(); }
  function syncTicketPeriod() {
    if (!IS_DEMO && saleSeqPeriod !== ticketPeriod()) {
      saleSeq = 1000;
      saleSeqPeriod = ticketPeriod();
      ticketLease = null;
    }
  }

  function newSaleId() {
    try {
      if (crypto && crypto.randomUUID) return 'sale-' + crypto.randomUUID();
      if (crypto && crypto.getRandomValues) {
        const b = new Uint32Array(2); crypto.getRandomValues(b);
        return 'sale-' + Date.now().toString(36) + '-' + b[0].toString(36) + b[1].toString(36);
      }
    } catch (_) {}
    return 'sale-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function readTicketLease() {
    const m = merchantSlug();
    const period = ticketPeriod();
    if (ticketLease && ticketLease.m === m && ticketLease.period === period) return ticketLease;
    ticketLease = null;
    try {
      const x = JSON.parse(localStorage.getItem(TICKET_LEASE_KEY) || 'null');
      if (x && x.m === m && +x.period === period && Number.isInteger(+x.next) && Number.isInteger(+x.end) && +x.next <= +x.end) {
        ticketLease = { m, period, next: +x.next, end: +x.end };
      }
    } catch (_) {}
    return ticketLease;
  }

  function saveTicketLease() {
    try {
      if (ticketLease) localStorage.setItem(TICKET_LEASE_KEY, JSON.stringify(ticketLease));
      state.ticketStorageError = false;
      return true;
    } catch (_) {
      state.ticketStorageError = true;
      return false;
    }
  }

  function takeTicketNumber() {
    if (IS_DEMO) return String(saleSeq);
    syncTicketPeriod();
    const lease = readTicketLease();
    if (!lease) return '';
    const n = Math.max(+lease.next || 0, saleSeq, 1000);
    if (n > lease.end || n > 99999) return '';
    const previousNext = lease.next;
    const previousSeq = saleSeq;
    lease.next = n + 1;
    saleSeq = n + 1;
    /* The number is not claimed until its successor is durable. Otherwise a
       full/private localStorage can reload the old `next` and print the same
       visible receipt number twice. Losing the whole server-reserved range is
       acceptable; reusing one of its numbers is not. */
    if (!saveTicketLease()) {
      lease.next = previousNext;
      saleSeq = previousSeq;
      return '';
    }
    return String(n);
  }

  function ensureTicketLease() {
    if (IS_DEMO) return Promise.resolve(ticketLease);
    syncTicketPeriod();
    const existing = readTicketLease();
    if (existing && Math.max(existing.next, saleSeq) <= existing.end) return Promise.resolve(existing);
    if (ticketLeaseRequest) return ticketLeaseRequest;
    const m = merchantSlug();
    if (!m || typeof fetch !== 'function') return Promise.reject(new Error('merchant-unavailable'));
    ticketLeaseRequest = fetch('/api/ticket-sequence', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: m, size: TICKET_LEASE_SIZE, floor: saleSeq, period: ticketPeriod() }),
    }).then((r) => {
      if (!r.ok) throw new Error('ticket-sequence-' + r.status);
      return r.json();
    }).then((j) => {
      const start = +j.start, end = +j.end;
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1000 || end < start || end > 99999 || +j.period !== ticketPeriod()) {
        throw new Error('ticket-sequence-invalid');
      }
      ticketLease = { m, period: ticketPeriod(), next: start, end };
      if (!saveTicketLease()) {
        ticketLease = null;
        throw new Error('ticket-lease-storage');
      }
      return ticketLease;
    }).finally(() => { ticketLeaseRequest = null; });
    return ticketLeaseRequest;
  }

  function withTicketLock(work) {
    /* Two tabs on the SAME till share localStorage. Without a cross-tab lock they
       can both read `next: 1042` before either writes 1043. Web Locks serializes
       that tiny critical section; the fallback still serializes calls in one
       tab, and storage events invalidate the cache in other legacy browsers. */
    try {
      if (navigator && navigator.locks && navigator.locks.request) {
        return navigator.locks.request('kiwi-ticket:' + merchantSlug(), work);
      }
    } catch (_) {}
    return Promise.resolve().then(work);
  }

  function claimTicketNumber() {
    return withTicketLock(() => {
      /* Another tab may have advanced the persisted lease while this tab kept
         its in-memory copy. Always re-read after acquiring the lock. */
      ticketLease = null;
      const ready = takeTicketNumber();
      if (ready) return ready;
      return ensureTicketLease().then(() => {
        ticketLease = null;
        const n = takeTicketNumber();
        if (!n) throw new Error('ticket-sequence-empty');
        return n;
      });
    });
  }

  function assignTicketNumber(ticket) {
    if (!ticket || ticket.num) return Promise.resolve(ticket && ticket.num);
    ticket.numbering = true;
    ticket.numError = false;
    return claimTicketNumber().then((n) => {
      /* The ticket object, not merely state.ticket, is captured. A reset while
         the request is in flight cannot put the old response on the new cart. */
      ticket.num = n;
      ticket.period = ticketPeriod();
      ticket.numbering = false;
      ticket.numError = false;
      if (state.ticket === ticket && root) { renderTicket(); icons(); }
      return n;
    }).catch((e) => {
      ticket.numbering = false;
      /* L'ÉCHEC DOIT SE VOIR TOUT DE SUITE, PAS AU MOMENT DE PAYER.
         Sans marque d'erreur, un ticket sans numéro reste bloqué sur
         « attribution… » : la vendeuse scanne tout le panier, la cliente sort sa
         carte, et c'est seulement là qu'on découvre que la caisse n'a jamais pu
         réserver de série. On distingue donc « en cours » de « échoué », pour
         que la tête du ticket le dise et propose de réessayer. */
      ticket.numError = true;
      if (state.ticket === ticket && root) { renderTicket(); icons(); }
      throw e;
    });
  }

  function nextStandaloneTicketNumber() {
    if (IS_DEMO) return Promise.resolve(String(saleSeq++));
    return claimTicketNumber();
  }

  function freshTicket() {
    const ticket = {
      num: IS_DEMO ? String(saleSeq) : '',
      period: ticketPeriod(),
      syncId: newSaleId(),
      lines: [], client: null, remiseAuth: false, numbering: false, numError: false,
      giftWrap: false, delivery: null,
    };
    state.ticket = ticket;
    if (!IS_DEMO) assignTicketNumber(ticket).catch(() => {
      if (state.ticket !== ticket) return;
      toast('Numéro de ticket indisponible', state.ticketStorageError
        ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
        : 'Reconnectez cette caisse pour réserver sa prochaine série.');
    });
  }
  function ticketClient() {
    const t = state.ticket;
    return t.client && t.client !== 'passage' ? clById(t.client) : null;
  }
  /* ── PROMOTIONS ───────────────────────────────────────────────────────────
   * La règle vit dans assets/promos.js ; ici on ne fait que la LIRE, par une
   * seule porte, pour que la grille, la fiche variante, le ticket et le reçu
   * annoncent tous le même prix. Deux lectures indépendantes du même catalogue
   * finissent toujours par diverger d'un arrondi, et c'est l'étiquette en rayon
   * qui contredit alors le ticket, devant la cliente.
   *
   * `stock` compte parce qu'une promotion peut viser « ce qui descend à N
   * pièces » : la projection vivante (celle que le ticket en cours entame) est
   * la bonne référence pour ce que le rayon affiche à cet instant. */
  function promoFor(pid) {
    const p = P[pid];
    if (!p || !window.KiwiPromos) return null;
    try { return window.KiwiPromos.priceFor(p, { stock: stockOf(p) }); } catch (_) { return null; }
  }
  /* ── LE PRIX D'UNE LIGNE : LE MEILLEUR DES DEUX ───────────────────────────
   * Le prix promo est estampillé sur la ligne quand elle entre sur le ticket
   * (voir addToTicket), et la règle est relue à chaque rendu. On retient le PLUS
   * BAS des deux. Les deux moitiés comptent, et pour des raisons opposées :
   *
   *   · la promotion se TERMINE pendant qu'une cliente attend au comptoir —
   *     l'estampille tient, on encaisse le prix annoncé au moment du scan. Une
   *     caisse qui remonte ses prix entre le rayon et le paiement, c'est une
   *     dispute au comptoir, et le magasin a tort.
   *   · la promotion COMMENCE pendant le ticket — la règle du jour prend le
   *     dessus. Sans ça, deux lignes du même article cohabitaient à 2 400 et
   *     2 160 sur le même ticket, et personne n'aurait su expliquer laquelle
   *     était la bonne.
   *
   * Une seule phrase à tenir devant la cliente : « on ne vous facture jamais
   * plus que le prix affiché au moment où l'article a été scanné, ni plus que
   * celui affiché maintenant. » C'est aussi ce qui rend un retour juste trois
   * jours plus tard : la ligne de vente porte le prix réellement payé. */
  function lineDeal(ln) {
    const stamp = (ln && ln.promo && Number.isFinite(+ln.promo.price)) ? ln.promo : null;
    const live = promoFor(ln.pid);
    const p = P[ln.pid];
    const full = (ln.customPrice != null && Number.isFinite(+ln.customPrice))
      ? +ln.customPrice
      : (p ? p.price : (ln.unit || 0));
    let best = { price: full, promo: null };
    if (stamp && stamp.price < best.price) best = { price: stamp.price, promo: stamp };
    if (live && live.price < best.price && !ln.isPiece) best = { price: live.price, promo: { price: live.price, badge: live.badge, name: live.promo.name, id: live.promo.id } };
    return best;
  }
  const linePromo = (ln) => lineDeal(ln).promo;
  const lineBase  = (ln) => lineDeal(ln).price;
  const lineUnit  = (ln) => Math.round(lineBase(ln) * (100 - ln.remise) / 100);
  const lineTotal = (ln) => lineUnit(ln) * ln.qty;
  /* Remise fidélité au niveau du TICKET (distincte de la remise gérante par ligne).
     Attachée au client via clientId : si on détache/change la cliente, elle cesse
     de s'appliquer d'elle-même, sans avoir à la retirer partout à la main. */
  function rewardDiscount(t, base) {
    const r = t.reward;
    if (!r || r.clientId !== t.client) return 0;
    if (r.kind === 'percent') return Math.round(base * (r.value || 0) / 100);
    if (r.kind === 'free' && t.lines.length) return Math.min.apply(null, t.lines.map(lineUnit));
    return 0;
  }
  /* Trois baisses, trois lignes séparées, jamais une seule « remise » fourre-tout :
     la promotion est une décision du magasin, la remise un geste de la gérante,
     la récompense un dû de la cliente. Les confondre au total, c'est rendre le
     rapport de clôture incapable de dire ce que les promotions ont coûté. */
  function ticketTotals(t) {
    const sub = t.lines.reduce((s, ln) => {
      const p = P[ln.pid];
      const orig = (ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0);
      return s + orig * ln.qty;
    }, 0);
    const afterPromo = t.lines.reduce((s, ln) => s + lineBase(ln) * ln.qty, 0);
    const afterLines = t.lines.reduce((s, ln) => s + lineTotal(ln), 0);
    const reward = rewardDiscount(t, afterLines);
    const total = Math.max(0, afterLines - reward);
    return { sub, promo: sub - afterPromo, remise: afterPromo - afterLines, reward, total };
  }
  /* Le nom à écrire sur le reçu. Une seule promotion en jeu → son nom ; deux ou
     plus → le mot générique, parce qu'en nommer une seule laisserait croire que
     l'autre n'a pas été appliquée. */
  function promoLabelForTicket(t) {
    const names = [];
    t.lines.forEach((ln) => {
      const pr = linePromo(ln);
      if (pr && pr.name && names.indexOf(pr.name) < 0) names.push(pr.name);
    });
    return names.length === 1 ? names[0] : '';
  }
  const ticketCount = (t) => t.lines.reduce((s, ln) => s + ln.qty, 0);
  /* Sur salesToday(), jamais sur SALES : le journal garde une semaine pour les
     retours (voir RETAIN_DAYS), et sommer tout afficherait la recette de sept
     jours sous le mot « aujourd'hui ». */
  const caToday = () => salesToday().reduce((s, x) => s + x.total, 0);
  function queueIfOffline(label) {
    if (!state.offline) return false;
    try {
      const q = window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus();
      if (q) {
        state.queued = +q.pending || 0;
        state.syncStorageError = !!q.storageError;
        state.syncBlocked = state.syncStorageError || (+q.blocked || 0) > 0;
      }
    } catch (_) {}
    renderNet();
    toast(`${label}, enregistré sur cette caisse${state.queued ? ` (${state.queued} vente${state.queued > 1 ? 's' : ''} à synchroniser)` : ''}`);
    return true;
  }

  /* ═══════════════════════ MOUNT ═══════════════════════ */
  let root = null;

  /* Plein écran (mode kiosque) — la caisse resto l'a via le bandeau partagé du
     shell ; la boutique dessine son PROPRE rail, ce bandeau n'y apparaît pas,
     d'où l'absence du bouton signalée en boutique. On repose donc le même geste
     dans le rail boutique. Deux icônes (agrandir / réduire) dont on bascule
     `hidden` — aucun re-rendu lucide nécessaire. L'écouteur `fullscreenchange`
     n'est attaché qu'UNE fois (le rail est reconstruit à chaque montage). */
  function fsIsOn() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function fsToggle() {
    try {
      const r = fsIsOn()
        ? (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document)
        : (function () { const el = document.documentElement; return (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); })();
      if (r && r.catch) r.catch(function () {});   // certains contextes (iframe sandbox) rejettent — on ignore
    } catch (_) {}
  }
  function paintFs() {
    const b = root && $('#mz-fs', root); if (!b) return;
    const on = fsIsOn();
    const en = b.querySelector('[data-fs="enter"]'), ex = b.querySelector('[data-fs="exit"]');
    // `hidden` ne suffit pas ici : un reset `svg { display:block }` bat la règle
    // UA `[hidden]{display:none}` — on force donc le display en inline (spécificité max).
    if (en) en.style.display = on ? 'none' : '';
    if (ex) ex.style.display = on ? '' : 'none';
    const lb = b.querySelector('span'); if (lb) lb.textContent = on ? 'Quitter le plein écran' : 'Plein écran';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? 'Quitter le plein écran' : 'Plein écran';
  }
  function setupFullscreenBtn() {
    const b = $('#mz-fs', root); if (!b) return;
    b.addEventListener('click', fsToggle);
    paintFs();
    if (!setupFullscreenBtn._subbed) {
      setupFullscreenBtn._subbed = true;
      document.addEventListener('fullscreenchange', paintFs);
      document.addEventListener('webkitfullscreenchange', paintFs);
    }
  }

  function mount(rootEl) {
    root = rootEl;
    syncTillStaff();
    /* A PAIRED caisse shows the real store's name/city (from onboarding); the
       unpaired demo (PIN 0002) keeps the Maison Mansour identity. */
    const _pv = (function () { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } })();
    const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const _vName = (_pv && _pv.name) ? _esc(_pv.name) : 'Vogue Home';
    const _vSub = (_pv && _pv.location) ? _esc(_pv.location) : (_pv ? '' : 'Tanger · Centre');
    root.innerHTML = `
      <aside class="mz-rail">
        <div class="mz-brand"><img class="kiwi-pos-logo" src="assets/kiwi-newlogo-inverse.svg" alt="Kiwi"></div>
        <div class="mz-venue">
          <div class="mz-venue-name">${_vName}</div>
          <div class="mz-venue-sub">${_vSub}${_vSub ? '<br>' : ''}Le même Kiwi, <b>un seul compte</b>.</div>
        </div>
        <nav class="mz-nav" id="mz-nav">
          <button class="mz-nav-it on" data-mz-view="vente"><i data-lucide="shopping-bag"></i><span>Vente</span><b class="mz-nav-badge" id="mz-badge-vente"></b></button>
          <button class="mz-nav-it" data-mz-view="registries"><i data-lucide="gift"></i><span>Listes Cadeaux</span><b class="mz-nav-badge" id="mz-badge-reg"></b></button>
          <button class="mz-nav-it" data-mz-view="casse"><i data-lucide="shield-alert"></i><span>Déclarer Casse</span></button>
          <button class="mz-nav-it" data-mz-view="scan"><i data-lucide="scan-line"></i><span>Scan</span><b class="mz-nav-badge" id="mz-badge-scan"></b></button>
          <button class="mz-nav-it" data-mz-view="inventaire"><i data-lucide="package"></i><span>Inventaire</span><b class="mz-nav-badge" id="mz-badge-inv"></b></button>
          <button class="mz-nav-it" data-mz-view="echanges"><i data-lucide="arrow-left-right"></i><span>Échanges &amp; avoirs</span><b class="mz-nav-badge" id="mz-badge-ret"></b></button>
          <button class="mz-nav-it" data-mz-view="vendus"><i data-lucide="chart-no-axes-column-increasing"></i><span>Vendus</span></button>
          <button class="mz-nav-it" data-mz-view="clientes"><i data-lucide="users"></i><span>Clients</span><b class="mz-nav-badge" id="mz-badge-cl"></b></button>
        </nav>
        <div class="mz-rail-foot">
          <button class="mz-net" id="mz-net" title="${IS_DEMO ? 'Simuler une coupure réseau' : 'État de la synchronisation'}">
            <i class="mz-net-dot"></i><span class="mz-net-label">En ligne</span>
          </button>
          <button class="mz-lock" id="mz-fs" title="Plein écran" aria-label="Basculer le plein écran" aria-pressed="false"><svg data-fs="enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg><svg data-fs="exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg><span>Plein écran</span></button>
          ${IS_DEMO ? '' : '<button class="mz-lock" id="mz-close-day"><i data-lucide="power"></i><span>Fin de service</span></button>'}
          <button class="mz-lock" id="mz-lock"><i data-lucide="lock"></i><span>Verrouiller</span></button>
        </div>
      </aside>
      <main class="mz-main">
        <div class="mz-offline-note" id="mz-offline-note" hidden>
          Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau.
          <b id="mz-queue-count"></b>
        </div>
        <section class="mz-view is-on" data-mz-panel="vente">
          <div class="mz-sell">
            <header class="mz-head">
              <div><h1>Vente</h1><div class="mz-head-sub" id="mz-today"></div></div>
              <div class="mz-head-hint">Scannez un code-barres, ou touchez un article</div>
            </header>
            <div id="mz-exch-slot"></div>
            <div class="mz-sell-scan">
              <i data-lucide="scan-line"></i>
              <input id="mz-sell-ean" placeholder="Scannez un code-barres pour l'ajouter au ticket…" autocomplete="off" />
              <span class="mz-sell-scan-tag">Entrée</span>
              ${pvReal() && camSupported()
                ? `<button class="mz-sell-cam" id="mz-sell-cam" title="Scanner avec la caméra" aria-label="Scanner avec la caméra"><i data-lucide="camera"></i></button>`
                : ''}
            </div>
            <div class="mz-cats" id="mz-cats"></div>
            <div class="mz-grid-scroll" id="mz-gridwrap"></div>
          </div>
          <aside class="mz-ticket" id="mz-ticket"></aside>
        </section>
        <section class="mz-view" data-mz-panel="registries"></section>
        <section class="mz-view" data-mz-panel="casse"></section>
        <section class="mz-view" data-mz-panel="scan"></section>
        <section class="mz-view" data-mz-panel="inventaire"></section>
        <section class="mz-view" data-mz-panel="echanges"></section>
        <section class="mz-view" data-mz-panel="vendus"></section>
        <section class="mz-view" data-mz-panel="clientes"></section>
      </main>
      <div class="modal-veil" id="mz-sheet-veil"><div class="modal mz-sheet mz-rel" id="mz-sheetm"></div></div>
      <div class="modal-veil" id="mz-approve-veil"><div class="modal mz-approve mz-rel" id="mz-approvem"></div></div>
      <div class="modal-veil" id="mz-client-veil"><div class="modal mz-client mz-rel" id="mz-clientm"></div></div>
      <div class="modal-veil" id="mz-fiche-veil"><div class="modal mz-fiche mz-rel" id="mz-fichem"></div></div>
      <div class="modal-veil" id="mz-exch-veil"><div class="modal mz-exch mz-rel" id="mz-exchm"></div></div>
      <div class="modal-veil" id="mz-pay-veil"><div class="modal mz-pay mz-rel" id="mz-paym"></div></div>
      <div class="modal-veil" id="mz-inv-veil"><div class="modal mz-invm mz-rel" id="mz-invmm"></div></div>
      <div class="modal-veil" id="mz-avoir-veil"><div class="modal mz-avoirm mz-rel" id="mz-avoirmm"></div></div>
      <div class="modal-veil" id="mz-delivery-veil"><div class="modal mz-delivery-modal mz-rel" id="mz-deliverym"></div></div>`;

    $('#mz-nav', root).addEventListener('click', (e) => {
      const b = e.target.closest('[data-mz-view]');
      if (b) switchView(b.dataset.mzView || b.dataset.bqView);
    });
    $('#mz-lock', root).addEventListener('click', () => {
      /* La feuille de clôture vit au niveau du body (au-dessus du root) : la
         laisser ouverte pendant le verrouillage la poserait sur l'écran PIN. */
      if (bqCloVeil) bqCloVeil.classList.remove('is-open');
      window.KiwiPosDispatch.lock();
    });
    const closeDay = $('#mz-close-day', root);
    if (closeDay) closeDay.addEventListener('click', bqOpenCloture);
    $('#mz-net', root).addEventListener('click', toggleOffline);
    if (!mount._netBound) {
      mount._netBound = true;
      const refresh = () => syncNetworkState();
      window.addEventListener('online', refresh);
      window.addEventListener('offline', refresh);
      window.addEventListener('kiwi:sale-queue', (e) => syncNetworkState(e && e.detail));
      window.addEventListener('storage', (e) => {
        if (!e || e.key === 'kiwiSaleQueue') syncNetworkState();
        if (e && e.key === TICKET_LEASE_KEY) ticketLease = null;
      });
    }
    syncNetworkState();
    setupFullscreenBtn();
    $$('.modal-veil', root).forEach((v) => {
      v.addEventListener('click', (e) => { if (e.target === v) closeVeil(v); });
    });

    /* Vente — scan-to-sell bar : a code scanned or typed here drops the article
       straight onto the ticket, supermarket-style. Commit on Enter only (the USB
       douchette ends every scan with Enter) so a scan is never counted twice. */
    const sellEan = $('#mz-sell-ean', root);
    if (sellEan) sellEan.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const v = sellEan.value.trim();
      sellEan.value = '';
      if (v) commitEan(v);
    });
    /* Même barre, sans douchette : la caméra dépose l'article sur le ticket. */
    const sellCam = $('#mz-sell-cam', root);
    if (sellCam) sellCam.onclick = () => openCamScan(commitEan);

    /* live catalogue → the sale grid, the sheet and the douchette track the DB.
       A PAIRED caisse (assets/caisse-pairing.js sets __kiwiPairedBoutiqueVenue)
       uses the real store's own catalogue — the same per-venue key the dashboard
       writes — so a real boutique shows its real stock. Unpaired demo (PIN 0002)
       stays Maison Mansour. When either side edits the inventory, rebuild. */
    if (window.KiwiBoutiqueCatalog) {
      /* A real/paired store keys its OWN catalogue (venueId, else the merchant slug —
         the identity spine) and NEVER falls back to the Maison Mansour demo, even when
         the pairing record carries no venueId (a non-custom merchant). Only the unpaired
         local demo (PIN 0002) stays on Maison Mansour. */
      var _bqPv = pvPaired();
      var _bqKey = (pvReal() && _bqPv && _bqPv.merchant)          /* real → merchant slug — SAME key the dashboard uses (pages-pro.js _bqxVenue) */
        || window.__kiwiPairedBoutiqueVenue
        || (_bqPv && (_bqPv.venueId || _bqPv.merchant))
        || (pvReal() ? 'boutique-live' : 'vogueHome');
      window.KiwiBoutiqueCatalog.use(_bqKey);
      /* Les promotions suivent EXACTEMENT la même clé que le catalogue : ce sont
         les prix de ce magasin-là. Une promotion rangée sous une autre clé que
         les articles qu'elle vise remiserait le catalogue du voisin — et,
         au retour d'une démo, brader la vraie boutique. */
      if (window.KiwiPromos) {
        window.KiwiPromos.use(_bqKey);
        /* Remontée serveur : le patron pose la promotion depuis le bureau, le
           comptoir doit la voir sans qu'on aille toucher la tablette. Le slug
           est celui du commerce, pas la clé locale (voir localKey dans
           promos.js) — deux surfaces du même magasin rangent leur copie sous
           des noms différents mais parlent au même document. */
        try {
          if (pvReal() && window.KiwiCloudDoc) {
            window.KiwiPromos.cloud(() => window.KiwiCloudDoc.slugFor(_bqKey));
          }
        } catch (_) {}
        if (!mount._promoSubbed) {
          mount._promoSubbed = true;
          window.KiwiPromos.subscribe(() => {
            /* Une promotion qui change repeint les PRIX : la grille, le rayon
               courant, le badge du rail. Le ticket en cours, lui, garde ses prix
               figés — voir linePromo. */
            if (!root || intake.open) return;
            /* renderCats() aussi : le filtre « En promo » n'existe que s'il a
               quelque chose à montrer, donc il apparaît et disparaît AVEC les
               promotions. Le laisser hors du repeint, c'était un onglet qui ne
               s'affichait qu'au prochain changement de rayon. */
            try { renderCats(); renderView(state.view); renderBadges(); icons(); } catch (_) {}
          });
        }
      }
    }
    rebuildCatalog();
    injectInvCss();
    if (window.KiwiBoutiqueCatalog && !mount._subbed) {
      mount._subbed = true;
      window.KiwiBoutiqueCatalog.subscribe(() => {
        /* Pendant une reprise de stock, la projection de vente (RAYONS / P /
         * BY_EAN) n'est lue par personne : la grille est cachée, et les écrans de
         * saisie interrogent la base directement. La reconstruire à chaque
         * enregistrement — plusieurs fois par article scanné — ne servait qu'à
         * ralentir l'import. On la rebâtit une seule fois, à la fermeture
         * (voir intakeClose), donc la caisse retrouve un catalogue à jour avant
         * la première vente. */
        if (intake.open) return;
        rebuildCatalog();
        if (root) { pruneTicket(); refreshAfterCatalog(); }
      });
    }
    installWedgeScanner();

    /* Les ventes sorties des livres par la console opérateur. On écoute la
       liste, et on la redemande au montage : la caisse peut avoir été rouverte
       longtemps après le retrait, auquel cas l'annonce est passée sans nous mais
       l'état, lui, est toujours là (assets/live-link.js · voidedRefs). */
    if (!mount._voidsBound) {
      mount._voidsBound = true;
      document.addEventListener('kiwi-sales-voided', (e) => {
        try { reconcileVoids((e && e.detail && e.detail.refs) || []); } catch (_) {}
      });
    }
    try {
      if (window.KiwiLive && window.KiwiLive.voidedRefs) reconcileVoids(window.KiwiLive.voidedRefs());
    } catch (_) {}

    /* Pitch demo only: a mid-day sale already in progress. A REAL store starts with
       a truly empty ticket and NO client (attached on demand via « Chercher »). */
    freshTicket();
    if (IS_DEMO) seedDemoTicket();

    renderAll();
    syncReturnSales();
    ensureReturnCloud();

    /* Une vraie boutique ouvre son poste comme la caisse restaurant : fond
       d'ouverture d'abord, la vente ensuite. La démo entre directement. */
    bqMaybeOpenScreen();
  }

  /* Pick the first two in-stock articles from the live catalogue for the
     mid-day demo ticket (ids are the DB's, not the old hard-coded literals). */
  function seedDemoTicket() {
    const picks = [];
    for (const r of RAYONS) {
      for (const it of r.items) {
        const size = firstFree(it);
        if (size) { picks.push({ pid: it.id, size, color: it.colors[0], qty: 1, remise: 0 }); }
        if (picks.length >= 2) break;
      }
      if (picks.length >= 2) break;
    }
    state.ticket.lines = picks;
    picks.forEach((ln) => stockAdd(ln.pid, ln.size, -ln.qty));
  }
  /* Drop ticket lines whose product vanished from the catalogue. */
  function pruneTicket() { if (state.ticket) state.ticket.lines = state.ticket.lines.filter((ln) => P[ln.pid]); }
  function refreshAfterCatalog() {
    if (!root) return;
    /* Pendant une reprise de stock, la liste d'inventaire est CACHÉE derrière le
     * formulaire : la redessiner à chaque enregistrement ne montre rien à
     * personne et coûte cher. invRow() et stats() relisent tous les variants pour
     * chaque produit — du O(produits × variants) — donc sur un import de plusieurs
     * milliers d'articles la caisse ralentissait scan après scan, exactement là où
     * elle doit rester vive. On redessine une fois, à la fermeture. */
    if (intake.open) return;
    try { renderCats(); renderView(state.view); renderBadges(); icons(); } catch (e) {}
  }

  function onShow() {
    if (!root) return;
    syncTillStaff();                      // a new shift may have unlocked the till
    bqMaybeOpenScreen();                  // re-unlock without a poste open → fond d'ouverture
    const today = $('#mz-today', root);
    if (today) today.textContent = headSubVente();
    renderBadges();
    renderView(state.view);
    icons();
  }

  function openVeil(id) { const v = $(id, root); v.classList.add('is-open'); return v; }
  function closeVeil(v) { (typeof v === 'string' ? $(v, root) : v).classList.remove('is-open'); }

  /* ═══════════════════════ NAV / SHELL ═══════════════════════ */
  function switchView(view) {
    state.view = view;
    $$('.mz-nav-it', root).forEach((b) => b.classList.toggle('on', (b.dataset.mzView || b.dataset.bqView) === view));
    $$('.mz-view', root).forEach((p) => p.classList.toggle('is-on', (p.dataset.mzPanel || p.dataset.bqPanel) === view));
    renderView(view);
    icons();
  }
  function renderView(view) {
    if (view === 'vente') { renderCats(); renderTicket(); renderGrid(); renderExchNote(); }
    if (view === 'registries') renderRegistries();
    if (view === 'casse') renderCasse();
    if (view === 'scan') renderScan();
    if (view === 'inventaire') renderInventaire();
    if (view === 'echanges') renderEchanges();
    if (view === 'vendus') {
      const panel = $('[data-mz-panel="vendus"]', root);
      if (window.KiwiSoldInsights) window.KiwiSoldInsights.renderTill(panel);
      else panel.innerHTML = '<div class="mz-empty" style="margin:40px;">Analyse des ventes indisponible.</div>';
    }
    if (view === 'clientes') renderClientes();
  }
  function renderBadges() {
    const items = state.ticket ? ticketCount(state.ticket) : 0;
    const avs = activeAvoirs().length;
    const regs = (typeof loadRegistries === 'function') ? loadRegistries().length : 0;
    const set = (id, n) => {
      const el = $(id, root);
      if (!el) return;
      el.textContent = n || '';
      el.style.display = n ? '' : 'none';
    };
    set('#mz-badge-vente', items);
    set('#mz-badge-reg', regs);
    set('#mz-badge-scan', state.scanLog.length);
    set('#mz-badge-ret', avs);
    set('#mz-badge-cl', (window.KiwiClients && KiwiClients.count && KiwiClients.count()) || CLIENTES.length);
    const invBadge = $('#mz-badge-inv', root);
    if (invBadge) { const st = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.stats() : null; const n = st ? st.ruptures + st.low : 0; invBadge.textContent = n || ''; invBadge.style.display = n ? '' : 'none'; }
  }
  function headSubVente() {
    // Le compte de ventes suit la même règle que la recette : la journée, pas la
    // semaine conservée pour les retours.
    const n = salesToday().length;
    return `${fmtDT(new Date())} · ${n} vente${n > 1 ? 's' : ''} · ${fmtMAD(caToday())} aujourd'hui`;
  }
  function renderAll() {
    $('#mz-today', root).textContent = headSubVente();
    renderCats();
    renderGrid();
    renderTicket();
    renderExchNote();
    renderBadges();
    renderNet();
    icons();
  }
  function refreshOps() {
    renderBadges();
    renderView(state.view);
    icons();
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
        state.rayon = catB.dataset.mzCat || catB.dataset.bqCat;
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
    const st = stockOf(p);
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
        <button class="mz-card ${stockOf(p) === 0 ? 'is-out' : ''}${pr ? ' is-promo' : ''}" data-mz-item="${p.id}" style="--i:${i++}">
          <span class="mz-card-art">${artOf(p.art)}</span>
          ${p.marque ? `<span class="mz-card-brand">${esc(p.marque)}</span>` : ''}
          <span class="mz-card-name">${esc(p.name)}</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:2px;">
            ${p.motif ? `<span class="mz-card-motif">${esc(p.motif)}</span>` : ''}
            ${p.format === 'service' ? `<span class="mz-card-fmt">Service ${p.servicePieces ? p.servicePieces + ' pcs' : ''}</span>` : ''}
            ${p.fragile ? `<span class="mz-card-fragile"><i data-lucide="shield-alert"></i>Fragile</span>` : ''}
          </div>
          <span class="mz-card-price">${pr ? `<s>${fmtMAD(pr.was)}</s> ` : ''}${fmtMAD(pr ? pr.price : p.price)}</span>
          ${cardFlag(p)}
          ${pr ? `<span class="mz-card-promo" title="${esc(pr.promo.name)}">${esc(pr.badge)}</span>` : ''}
        </button>`; }).join('')}
      </div>`).join('') : '<div class="mz-empty" style="margin:40px auto; text-align:center;">Aucun article dans cette sélection.</div>');
    $('#mz-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-mz-item]');
      if (b) openSheet(b.dataset.mzItem || b.dataset.bqItem, state.exchange ? { exchange: true } : null);
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
    const sub = [esc(c.phone) || '—', c.points + ' pts', c.taille ? 'taille ' + esc(c.taille) : ''].filter(Boolean).join(' · ');
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
        <div><span class="mz-tk-title">Ticket</span> <span class="mz-tk-num${t.num ? '' : t.numError ? ' err' : ''}">· ${t.num || (t.numError ? 'numéro indisponible' : 'attribution…')} · par ${esc(STAFF.caissiere.name)}</span></div>
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
      t.lines.forEach((ln) => stockAdd(ln.pid, ln.size, ln.qty));
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
      const idx = minus ? +(minus.dataset.mzMinus || minus.dataset.bqMinus) : plus ? +(plus.dataset.mzPlus || plus.dataset.bqPlus) : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        if ((P[ln.pid].sizes[ln.size] || 0) <= 0) {
          toast(`${P[ln.pid].name} · ${ln.size}, plus de stock, dernière pièce déjà sur le ticket`);
          return;
        }
        stockAdd(ln.pid, ln.size, -1);
        ln.qty++;
      } else {
        stockAdd(ln.pid, ln.size, 1);
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
    const origPrice = (ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0);
    return `<div class="mz-line">
      <span class="mz-line-art">${artOf(p.art)}</span>
      <span class="mz-line-mid">
        ${(ln.marque || p.marque) ? `<span class="mz-line-brand">${esc(ln.marque || p.marque)}</span>` : ''}
        <span class="mz-line-name">${esc(p.name)}</span>
        <span class="mz-line-sub">
          ${colorDot(ln.color)}
          <span class="sz">${esc(ln.size)}</span> ${esc(colorLabel(ln.color))}
          ${ln.format === 'service' ? `<span class="mz-line-fmt">Service (${ln.servicePieces || p.servicePieces || 18} pcs)</span>` : (ln.isPiece ? '<span class="mz-line-fmt">À la pièce</span>' : '')}
          ${(ln.motif || p.motif) ? `<span class="mz-line-motif">${esc(ln.motif || p.motif)}</span>` : ''}
          ${(ln.fragile || p.fragile) ? '<span class="mz-line-fragile">⚠️ Fragile</span>' : ''}
          ${ln.registryTitle ? `<span class="mz-line-reg">🎁 ${esc(ln.registryTitle)}</span>` : ''}
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
  function addToTicket(pid, cfg, opts) {
    const p = P[pid];
    if (!p) return false;
    cfg = cfg || {};
    const size = cfg.size || sizesOf(p)[0];
    const color = cfg.color || p.colors[0];
    const qty = cfg.qty || 1;
    const isPiece = !!cfg.isPiece;
    const format = cfg.format || p.format || 'piece';
    const customPrice = cfg.customPrice != null ? cfg.customPrice : (isPiece ? (p.piecePriceMAD || Math.round(p.price / (p.servicePieces || 12))) : null);

    if ((p.sizes[size] || 0) < qty) {
      toast(`${p.name} · ${size}, stock insuffisant`);
      return false;
    }
    stockAdd(pid, size, -qty);
    const pr = promoFor(pid);
    const stamp = (pr && !isPiece) ? { price: pr.price, badge: pr.badge, name: pr.promo.name, id: pr.promo.id } : null;
    const same = state.ticket.lines.find((l) => l.pid === pid && l.size === size && l.color === color && l.remise === (cfg.remise || 0) && l.isPiece === isPiece && l.registryId === (cfg.registryId || null));
    if (same) {
      same.qty += qty;
      if (stamp && (!same.promo || stamp.price < same.promo.price)) same.promo = stamp;
    } else {
      state.ticket.lines.push({
        pid, size, color, qty, remise: cfg.remise || 0, promo: stamp,
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
    const shPromo = promoFor(sheet.pid);
    let shBase = shPromo ? shPromo.price : p.price;
    if (p.format === 'service' && sheet.format === 'piece') {
      shBase = p.piecePriceMAD || Math.round(shBase / (p.servicePieces || 12));
    }
    const unit = Math.round(shBase * (100 - sheet.remise) / 100);
    const canAdd = (p.sizes[sheet.size] || 0) > 0;
    const el = $('#mz-sheetm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mz-sheet-head">
        <span class="mz-sheet-art">${artOf(p.art)}</span>
        <span class="mz-sheet-title">
          ${p.marque ? `<div class="mz-card-brand">${esc(p.marque)}</div>` : ''}
          <h3>${esc(p.name)}</h3>
          <span class="sub">
            ${esc((RAYONS.find((r) => r.id === p.rayon) || { label: 'Divers' }).label)}
            ${p.motif ? ` · Motif : <b>${esc(p.motif)}</b>` : ''}
            ${p.fragile ? ` · <span style="color:#B25E00;font-weight:700;">⚠️ Fragile</span>` : ''}
            ${p.ean ? ` · ${esc(p.ean)}` : ''}
          </span>
        </span>
        <span class="mz-sheet-price">
          <span class="val" id="mz-sheet-total">${fmtMAD(unit * sheet.qty)}</span>
          <span class="per ${sheet.remise ? 'rem' : ''}" id="mz-sheet-per">${sheet.remise ? `−${sheet.remise} % · accord gérante` : `${unit} MAD × ${sheet.qty}`}</span>
        </span>
      </div>
      ${(shPromo && sheet.format !== 'piece') ? `
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
            <small>${fmtMAD(shPromo ? shPromo.price : p.price)}</small>
          </button>
          <button class="mz-seg-it ${sheet.format === 'piece' ? 'on' : ''}" data-mz-format="piece">
            À la pièce (1 unité)
            <small>${fmtMAD(p.piecePriceMAD || Math.round(p.price / (p.servicePieces || 12)))}</small>
          </button>
        </div>
      </div>` : ''}

      <div class="mz-f">
        <div class="mz-f-lbl">${sizeWord(p)} <span class="opt">· stock par modèle en direct</span></div>
        <div class="mz-seg" data-lens-demo id="mz-size-seg">
          ${sizesOf(p).map((s) => {
            const st = p.sizes[s];
            const usual = !sheet.exchange && c && p.kind === 'taille' && s === c.taille;
            return `<button class="mz-seg-it ${s === sheet.size ? 'on' : ''}" data-lens-item data-mz-size="${esc(s)}" ${st === 0 ? 'disabled' : ''}>
              ${usual ? '<span class="mz-seg-usual">habituelle</span>' : ''}${esc(s)}<small>${st === 0 ? 'épuisé' : `${st} en stock`}</small></button>`;
          }).join('')}
        </div>
      </div>

      <div class="mz-f">
        <div class="mz-f-lbl">Couleur / Motif</div>
        <div id="mz-colors">
          ${KC() ? KC().picker('mz-color', sheet.color, { ids: p.colors, size: 'lg', label: 'Couleur', hint: 'Touchez une pastille pour lire son nom' }) : ''}
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
            ${[0, 5, 10, 15, 20].map((r) => `<button class="mz-chip ${sheet.remise === r ? 'on' : ''}" data-mz-rem="${r}">${r === 0 ? 'Sans' : `−${r} %`}${r > 0 && !state.ticket.remiseAuth ? ' <i data-lucide="lock"></i>' : ''}</button>`).join('')}
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
      let bPrice = shPromo ? shPromo.price : p.price;
      if (p.format === 'service' && sheet.format === 'piece') {
        bPrice = p.piecePriceMAD || Math.round(bPrice / (p.servicePieces || 12));
      }
      const u = Math.round(bPrice * (100 - sheet.remise) / 100);
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
        $$('[data-mz-format]', fmtSeg).forEach((x) => x.classList.toggle('on', x === b));
        refreshPrice();
      };
    }

    $('#mz-size-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-mz-size]');
      if (!b || b.disabled) return;
      sheet.size = b.dataset.mzSize || b.dataset.bqSize;
      if (sheet.qty > (p.sizes[sheet.size] || 0)) sheet.qty = Math.max(1, p.sizes[sheet.size]);
      $$('[data-mz-size]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    $('#mz-colors', el).addEventListener('kc:change', (e) => { sheet.color = e.detail.value; });
    const qMinus = $('#mz-qty-minus', el);
    if (qMinus) qMinus.onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    const qPlus = $('#mz-qty-plus', el);
    if (qPlus) qPlus.onclick = () => {
      if (sheet.qty >= (p.sizes[sheet.size] || 0)) { toast(`${p.name} · ${sheet.size}, ${p.sizes[sheet.size]} en stock, pas plus`); return; }
      sheet.qty++; refreshPrice();
    };
    const remRow = $('#mz-remise', el);
    if (remRow) remRow.onclick = (e) => {
      const b = e.target.closest('[data-mz-rem]');
      if (!b) return;
      const r = +(b.dataset.mzRem || b.dataset.bqRem);
      if (r > 0 && !state.ticket.remiseAuth) { openApprove(r, () => { sheet.remise = r; renderSheet(); icons(); lens(); }); return; }
      sheet.remise = r;
      $$('[data-mz-rem]', el).forEach((x) => x.classList.toggle('on', +(x.dataset.mzRem || x.dataset.bqRem) === r));
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
      const piecePrice = isPiece ? (p.piecePriceMAD || Math.round(p.price / (p.servicePieces || 12))) : null;
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

  /* ═══════════════════════ CLIENTE — phone-first (modal du ticket) ═══════ */
  function clienteHits(q) {
    const digits = (q || '').replace(/\D/g, '');
    const ql = (q || '').toLowerCase();
    const src = clientList();
    return !q ? src : src.filter((c) =>
      (digits && (c.phone || '').replace(/\D/g, '').includes(digits)) ||
      (!digits && c.name.toLowerCase().includes(ql)));
  }
  function clAvoirOf(c) {
    return activeAvoirs().find((a) => a.holderId === c.id) || null;
  }

  function openClientModal() {
    const el = $('#mz-clientm', root);
    let mode = 'search';
    const render = (q) => {
      const hits = clienteHits(q);
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Cliente</h3>
        <p class="modal-subtle">En boutique on cherche par téléphone, la fiche porte les points et la taille.</p>
        <div class="mz-phone-in"><i data-lucide="phone"></i>
          <input id="mz-cl-q" inputmode="tel" placeholder="06… ou nom de la cliente" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="mz-cl-results">
            ${hits.map((c) => {
              const av = clAvoirOf(c);
              return `<button class="mz-cl-row" data-mz-cl="${c.id}">
                <span class="mz-cl-ava">${esc(initials(c.name))}</span>
                <span class="mz-cl-mid">
                  <span class="mz-cl-name">${esc(c.name)} ${c.vip ? '<span class="mz-vip-chip">VIP</span>' : ''}</span>
                  <span class="mz-cl-sub">${esc(c.phone) || '—'}${c.taille ? ' · taille ' + esc(c.taille) : ''}</span>
                </span>
                <span class="mz-cl-right"><b>${c.points} pts</b>${av ? `<span class="av">avoir ${fmtMAD(av.balance)}</span>` : `${c.achats} achats`}</span>
              </button>`;
            }).join('') || `<div class="mz-empty">Aucune fiche pour « ${esc(q)} »</div>`}
          </div>
          <button class="mz-cl-new" id="mz-cl-new"><i data-lucide="user-plus"></i>Nouvelle cliente${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="mz-sheet-foot" style="margin-top:10px;">
            <button class="mz-btn ghost" id="mz-cl-guest">Cliente de passage, sans fiche</button>
          </div>` : `
          <div class="mz-cl-form">
            <input class="mz-in" id="mz-cl-name" placeholder="Nom et prénom" value="${esc(/^[\d\s.+-]*$/.test(q || '') ? '' : (q || ''))}" />
            <input class="mz-in" id="mz-cl-tel" inputmode="tel" autocomplete="tel" placeholder="06… / +33… (optionnel)" value="${esc(/^[\d\s.+-]+$/.test(q || '') ? q : '')}" />
            <div class="mz-sheet-foot" style="margin-top:4px;">
              <button class="mz-btn secondary" id="mz-cl-back">Retour</button>
              <button class="mz-btn primary" id="mz-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#mz-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#mz-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-client-veil'); });
      $$('[data-mz-cl]', el).forEach((b) => {
        b.onclick = () => {
          const c = clById(b.dataset.bqCl);
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
      <div class="mz-clients">
        <header class="mz-head">
          <div><h1>Clientes</h1><div class="mz-head-sub">Le téléphone d'abord, la fiche suit la cliente, pas le ticket</div></div>
          <div class="mz-search"><i data-lucide="search"></i>
            <input id="mz-clv-q" inputmode="tel" placeholder="06… ou nom" value="${esc(q)}" /></div>
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
                  <span class="mz-mini"><i data-lucide="receipt"></i>${c.achats} achats</span>
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
      if (b) openFiche(b.dataset.bqFiche);
    };
    icons();
  }

  function openFiche(cid) {
    const c = clById(cid);   // clById, pas CL[…] : sur une vraie boutique le carnet vit dans KiwiClients (CL est vide)
    if (!c) return;
    const el = $('#mz-fichem', root);
    const av = clAvoirOf(c);
    const todays = SALES.filter((s) => s.clientId === cid && !s.voided).map((s) => ({
      when: whenLabel(s.at),
      // idem : une vente de la semaine peut porter un article supprimé depuis.
      what: s.lines.map((l) => `${(P[l.pid] && P[l.pid].name) || l.name || 'Article'} · ${l.size}`).join(' + '),
      amt: s.total,
    }));
    const hist = todays.concat(c.history || []);
    const spent = (c.spent || 0) + todays.reduce((s, h) => s + h.amt, 0);
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
        ${hist.length ? hist.map((h) => `<div class="mz-fhist-row"><span class="when">${esc(h.when)}</span><span class="what">${esc(h.what)}</span><span class="amt">${fmtMAD(h.amt)}</span></div>`).join('') : '<div class="mz-empty">Aucun achat enregistré.</div>'}
      </div>
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
            return pr ? `<s>${fmtMAD(pr.was)}</s> ${fmtMAD(pr.price)}` : fmtMAD(p.price);
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
    try { if (navigator.vibrate) navigator.vibrate(35); } catch (_) {}
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
  function loadRegistries() {
    if (REGISTRIES) return REGISTRIES;
    try {
      const stored = localStorage.getItem(REGISTRY_KEY + ':' + merchantSlug());
      if (stored) REGISTRIES = JSON.parse(stored);
    } catch (_) {}
    if (!Array.isArray(REGISTRIES) || !REGISTRIES.length) {
      REGISTRIES = JSON.parse(JSON.stringify(DEFAULT_REGISTRIES));
    }
    return REGISTRIES;
  }
  function saveRegistries() {
    try {
      localStorage.setItem(REGISTRY_KEY + ':' + merchantSlug(), JSON.stringify(REGISTRIES || []));
    } catch (_) {}
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
          <div class="mz-search">
            <i data-lucide="search"></i>
            <input id="mz-reg-q" placeholder="Nom des mariés ou téléphone…" value="${esc(state.registriesQuery || '')}" />
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
                  <div class="mz-reg-sub">${esc(reg.beneficiaries)} · 📞 ${esc(reg.phone)} · Événement : ${esc(reg.eventDate)}</div>
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
                      <span>${it.marque ? esc(it.marque) + ' · ' : ''}${fmtMAD(it.price)} · ${it.qtyPurchased}/${it.qtyRequested} offert(s)</span>
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
              ${reg.note ? `<div style="font-size:11.5px; color:var(--ink-3); border-top:1px solid var(--line); padding-top:8px;">📝 ${esc(reg.note)}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;

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
      }
    };
    icons();
  }

  /* ═══════════════════════ CASSE & GESTION DES PERTES ═══════════════════ */
  /* La casse en boutique d'art de la table & décoration (céramique, verrerie, cristal, bougies)
   * est un fait d'exploitation régulier. Tracée via `KiwiBoutiqueCatalog.adjustStock`
   * et le grand livre `KiwiInventory` (reason: 'waste') avec le coût d'achat réel. */
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
    
    if (vid && cat && cat.adjustStock) {
      cat.adjustStock(vid, -qty, why);
    } else {
      stockAdd(pid, size, -qty);
    }
    
    try {
      if (window.KiwiInventory && window.KiwiInventory.add) {
        window.KiwiInventory.add({
          itemId: pid, qty: -qty, reason: 'waste', refType: 'breakage',
          refId: `casse-${Date.now().toString(36)}`, note: `Casse Vogue Home: ${reason}`,
          unitCost: unitCost
        });
      }
    } catch (_) {}
    
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
      <div class="mz-casse-view">
        <header class="mz-head">
          <div>
            <h1>Déclaration de Casse &amp; Pertes</h1>
            <div class="mz-head-sub">Dépréciation immédiate, valorisation au coût d'achat et traçabilité inventaire</div>
          </div>
          <div style="font-family:var(--mono); font-size:14px; font-weight:700; color:#BA1A1A; background:rgba(186,26,26,0.08); padding:8px 14px; border-radius:10px;">
            Perte totale enregistrée : ${fmtMAD(totalCasseLoss)}
          </div>
        </header>

        <div class="mz-casse-box">
          <h3 style="margin:0 0 10px; font-size:15px;">Déclarer un article cassé / détérioré</h3>
          <div style="display:grid; grid-template-columns: 2fr 1fr 1fr; gap:12px;">
            <div>
              <label style="font-size:11.5px; font-weight:700; color:var(--ink-3); text-transform:uppercase;">Article</label>
              <select id="mz-casse-pid" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--line); margin-top:4px; font:inherit; background:var(--paper);">
                ${allProducts.map((p) => `<option value="${p.id}">${p.marque ? '[' + esc(p.marque) + '] ' : ''}${esc(p.name)} (${fmtMAD(p.price)})</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:700; color:var(--ink-3); text-transform:uppercase;">Quantité cassée</label>
              <input id="mz-casse-qty" type="number" min="1" max="50" value="1" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--line); margin-top:4px; font:inherit; background:var(--paper);" />
            </div>
            <div>
              <label style="font-size:11.5px; font-weight:700; color:var(--ink-3); text-transform:uppercase;">Motif</label>
              <select id="mz-casse-reason" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid var(--line); margin-top:4px; font:inherit; background:var(--paper);">
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

          <div style="display:flex; justify-content:flex-end;">
            <button class="mz-btn primary" id="mz-casse-submit" style="background:#BA1A1A; border-color:#BA1A1A; color:#fff;">
              <i data-lucide="shield-alert"></i>Enregistrer la casse &amp; décrémenter le stock
            </button>
          </div>
        </div>

        <div class="mz-casse-box">
          <h3 style="margin:0 0 10px; font-size:15px;">Historique des déclarations de casse</h3>
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
        recordCasse(pid, sizesOf(p)[0] || 'TU', p.colors[0] || 'defaut', q, reason);
        renderCasse(); icons();
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
          <span style="font-size:12.5px; font-weight:600; color:var(--riad,#053B2C);">⚠️ Emballage renforcé requis (Protection bulle + calage)</span>
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
          <b style="color:#B25E00; font-size:13px; text-transform:uppercase; display:block;">⚠️ ATTENTION TRÈS FRAGILE ⚠️</b>
          <span style="font-size:11px; color:#8A6210;">Articles en céramique & verrerie fine — Maintenir à plat, ne pas superposer de charges lourdes.</span>
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
      <div class="mz-scan">
        <div class="mz-scan-inner">
          <header class="mz-head" style="padding:22px 0 0;">
            <div><h1>Scan produit</h1><div class="mz-head-sub">Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.</div></div>
          </header>
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
    toast(`Bip, ${p.name} · ${size} sur le ticket (${fmtMAD(p.price)})`);
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

  /* ═══════════════════════ ÉCHANGES & AVOIRS (signature) ═══════════════════ */
  function saleMatches(s, q) {
    if (!q) return true;
    const ql = q.toLowerCase();
    const digits = q.replace(/\D/g, '');
    const c = saleClient(s);
    return s.id.toLowerCase().includes(ql) ||
      (c && c.name.toLowerCase().includes(ql)) ||
      (c && digits.length >= 2 && c.phone.replace(/\D/g, '').includes(digits));
  }

  function renderEchanges() {
    const panel = $('[data-mz-panel="echanges"]', root);
    const q = state.retQuery;
    /* Une vente sortie des livres ne se retourne pas : elle n'a plus eu lieu, sa
       marchandise est déjà revenue en stock, et l'échanger créerait un avoir
       adossé à un encaissement que le serveur ne connaît plus. */
    const dateKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const oldest = new Date(today); oldest.setDate(oldest.getDate() - (RETAIN_DAYS - 1));
    const todayKey = dateKey(today), yesterdayKey = dateKey(yesterday), oldestKey = dateKey(oldest);
    if (state.retDate < oldestKey || state.retDate > todayKey) state.retDate = todayKey;
    const hits = SALES.filter((s) => !s.voided && dateKey(s.at) === state.retDate && saleMatches(s, q));
    const ret = state.ret;
    panel.innerHTML = `
      <div class="mz-ret">
        <header class="mz-head">
          <div><h1>Échanges &amp; avoirs</h1><div class="mz-head-sub">Retour sous 7 jours avec ticket, échange ou avoir, jamais de remboursement espèces</div></div>
          <div class="mz-search"><i data-lucide="search"></i>
            <input id="mz-ret-q" placeholder="N° de ticket ou téléphone…" value="${esc(q)}" /></div>
        </header>
        <div class="mz-ret-bar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 0 0;">
          <button class="mz-pill ${state.retDate === todayKey ? 'ok' : ''}" type="button" data-mz-ret-day="${todayKey}">Aujourd'hui</button>
          <button class="mz-pill ${state.retDate === yesterdayKey ? 'ok' : ''}" type="button" data-mz-ret-day="${yesterdayKey}">Hier</button>
          <label class="mz-ret-bar-lbl" style="margin-left:4px;">Date
            <input id="mz-ret-date" type="date" min="${oldestKey}" max="${todayKey}" value="${state.retDate}" style="margin-left:7px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--ink);" />
          </label>
        </div>
        <div class="mz-ret-scroll"><div class="mz-ret-inner">
          ${activeAvoirs().length ? `
            <div class="mz-ret-bar" style="margin-top:14px;">
              <div class="mz-ret-bar-lbl">Avoirs actifs · ${activeAvoirs().length}</div>
              ${activeAvoirs().map((a) => `
                <button class="mz-favoir" data-mz-av="${a.code}" style="margin-bottom:6px;">
                  <i data-lucide="ticket"></i><b>${a.code}</b> · ${fmtMAD(a.balance)}, ${esc(a.holderName)}<span class="see">Voir</span>
                </button>`).join('')}
            </div>` : ''}
          ${hits.map((s) => saleCard(s, ret)).join('') || (String(q).trim()
            ? `<div class="mz-empty">Rien pour « ${esc(q)} », vérifiez le n° de ticket ou le téléphone.</div>`
            /* Rien tapé encore : une boutique sans vente du jour ouvrait cette page
               sur « Rien pour «  » », un échec de recherche que personne n'a lancée. */
            : `<div class="mz-empty">Scannez le ticket de la cliente, ou tapez son numéro de téléphone.</div>`)}
        </div></div>
      </div>`;
    $('#mz-ret-q', panel).oninput = (e) => {
      state.retQuery = e.target.value;
      renderEchanges(); icons();
      const i = $('#mz-ret-q', panel); i.focus(); moveCaretEnd(i);
    };
    $('#mz-ret-date', panel).onchange = (e) => {
      state.retDate = String(e.target.value || todayKey);
      state.ret = null;
      renderEchanges(); icons();
    };
    panel.onclick = (e) => {
      const dayB = e.target.closest('[data-mz-ret-day]');
      if (dayB) { state.retDate = dayB.dataset.bqRetDay; state.ret = null; renderEchanges(); icons(); return; }
      const avB = e.target.closest('[data-mz-av]');
      if (avB) { openVoucher(AVOIRS.find((a) => a.code === avB.dataset.bqAv), { mode: 'view' }); return; }
      const qtyB = e.target.closest('[data-mz-ret-qty]');
      if (qtyB && state.ret) {
        const [saleId, idxS, deltaS] = qtyB.dataset.bqRetQty.split(':');
        const idx = Number(idxS), sale = findSale(saleId);
        if (sale && state.ret.saleId === saleId && state.ret.picks.has(idx)) {
          const current = pickedQty(state.ret, idx, sale.lines[idx]);
          state.ret.quantities.set(idx, Math.max(1, Math.min(lineAvailableQty(sale.lines[idx]), current + Number(deltaS))));
          renderEchanges(); icons();
        }
        return;
      }
      const lnB = e.target.closest('[data-mz-pick]');
      if (lnB) { togglePick(lnB.dataset.bqPick); return; }
      const lockB = e.target.closest('[data-mz-locked]');
      if (lockB) { toast('Pièce déjà retournée, rien à reprendre dessus'); return; }
      const motif = e.target.closest('[data-mz-motif]');
      if (motif && state.ret) { state.ret.motif = motif.dataset.bqMotif; renderEchanges(); icons(); return; }
      const exch = e.target.closest('[data-mz-do-exch]');
      if (exch) { doExchange(); return; }
      const avoir = e.target.closest('[data-mz-do-avoir]');
      if (avoir) { doAvoir(); return; }
    };
    icons();
  }

  const MOTIFS = ['Taille', 'Couleur', 'Défaut', 'Changement d\'avis'];

  /* A ticket line can contain several identical pieces. Older tickets only
     carried the boolean `returned`; keep understanding that format while new
     returns remember exactly how many pieces came back. */
  function lineReturnedQty(ln) {
    const sold = Math.max(0, Number(ln && ln.qty) || 0);
    if (ln && ln.returned) return sold;
    return Math.max(0, Math.min(sold, Number(ln && ln.returnedQty) || 0));
  }
  function lineAvailableQty(ln) { return Math.max(0, (Number(ln && ln.qty) || 0) - lineReturnedQty(ln)); }
  function pickedQty(ret, idx, ln) {
    const wanted = ret && ret.quantities && ret.quantities.get(idx);
    return Math.max(1, Math.min(lineAvailableQty(ln), Number(wanted) || 1));
  }
  function markLineReturned(ln, qty, note) {
    const next = Math.min(Number(ln.qty) || 0, lineReturnedQty(ln) + Math.max(0, Number(qty) || 0));
    ln.returnedQty = next;
    ln.returned = next >= (Number(ln.qty) || 0);
    ln.note = note;
  }

  function saleCard(s, ret) {
    const c = saleClient(s);
    const sel = ret && ret.saleId === s.id ? ret.picks : new Set();
    const selVal = s.lines.reduce((t, l, i) => t + (sel.has(i) ? l.unit * pickedQty(ret, i, l) : 0), 0);
    const hasRet = s.lines.some((l) => lineReturnedQty(l) > 0);
    return `<div class="mz-sale">
      <div class="mz-sale-top">
        <span class="mz-sale-num">${s.id}</span>
        <!-- whenLabel et non fmtHM : la liste couvre la semaine, et « 14:32 »
             tout court ne dit pas si la vente est de ce matin ou de mardi. -->
        <span class="mz-sale-when">${whenLabel(s.at)} · par ${esc(s.by)}</span>
        <span class="mz-pill ${s.kind === 'echange' ? 'warn' : 'ok'}">${s.kind === 'echange' ? 'échange' : esc(s.methods)}</span>
        ${hasRet ? '<span class="mz-pill warn">retour</span>' : ''}
        <span class="mz-sale-who"><i data-lucide="${c ? 'user' : 'users'}"></i>${c ? esc(c.name) : 'Cliente de passage'} · ${fmtMAD(s.total)}</span>
      </div>
      <div class="mz-sale-lines">
        ${s.lines.map((l, i) => {
          /* Le journal couvre la semaine : un article vendu mardi peut avoir été
             supprimé du catalogue depuis. Sans ce repli, P[l.pid] valait
             undefined et TOUTE la page des échanges se vidait — donc plus aucun
             retour possible, y compris sur les ventes intactes. Le nom du
             produit est retrouvé dans la ligne de vente quand il y est, sinon on
             le dit franchement ; le montant payé, lui, vient de la ligne et
             reste toujours juste. */
          const p = P[l.pid] || { name: l.name || 'Article retiré du catalogue', art: '' };
          const returnedQty = lineReturnedQty(l);
          const availableQty = lineAvailableQty(l);
          if (!availableQty) {
            return `<button class="mz-sline is-locked" data-mz-locked="1">
              <span class="tick"></span>
              <span class="mz-line-art">${artOf(p.art)}</span>
              <span class="mid"><span class="mz-line-name">${esc(p.name)}</span>
                <span class="mz-line-sub"><span class="sz">${esc(l.size)}</span> ${esc(l.note || 'retournée')}</span></span>
              <span class="mz-pill warn">retournée</span>
            </button>`;
          }
          const chosenQty = sel.has(i) ? pickedQty(ret, i, l) : 1;
          return `<button class="mz-sline ${sel.has(i) ? 'on' : ''}" data-mz-pick="${s.id}:${i}">
            <span class="tick"><i data-lucide="check"></i></span>
            <span class="mz-line-art">${artOf(p.art)}</span>
            <span class="mid"><span class="mz-line-name">${esc(p.name)}</span>
              <span class="mz-line-sub">
                ${colorDot(l.color)}
                <span class="sz">${esc(l.size)}</span> ${availableQty > 1 ? `× ${availableQty} disponibles` : ''} ${returnedQty ? `· ${returnedQty} déjà retournée${returnedQty > 1 ? 's' : ''}` : ''} ${l.remise ? `· remise −${l.remise} %` : ''}
              </span></span>
            <span class="amt">${fmtMAD(l.unit * availableQty)}</span>
          </button>${sel.has(i) && availableQty > 1 ? `
            <div class="mz-ret-qty" style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:7px 12px 10px;">
              <span style="font-size:12px;color:var(--ink-3);">Quantité à retourner</span>
              <button class="mz-chip" type="button" data-mz-ret-qty="${s.id}:${i}:-1" aria-label="Retirer une pièce">−</button>
              <b>${chosenQty}</b>
              <button class="mz-chip" type="button" data-mz-ret-qty="${s.id}:${i}:1" aria-label="Ajouter une pièce">+</button>
              <strong>${fmtMAD(l.unit * chosenQty)}</strong>
            </div>` : ''}`;
        }).join('')}
      </div>
      ${sel.size ? `
      <div class="mz-ret-bar">
        <div class="mz-ret-bar-lbl">Motif du retour</div>
        <div class="mz-chips">
          ${MOTIFS.map((m) => `<button class="mz-chip ${ret.motif === m ? 'on' : ''}" data-mz-motif="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>
        <div class="mz-ret-actions">
          <button class="mz-btn secondary" data-mz-do-exch><i data-lucide="arrow-left-right"></i>Échanger la pièce</button>
          <button class="mz-btn primary" data-mz-do-avoir><i data-lucide="ticket"></i>Émettre un avoir · ${fmtMAD(selVal)}</button>
        </div>
      </div>` : ''}
    </div>`;
  }

  function togglePick(key) {
    const [saleId, idxS] = key.split(':');
    const idx = +idxS;
    /* Pas de motif par défaut. Le champ démarrait sur « Taille » : une vendeuse
       qui ne touchait aucune puce classait quand même le retour en problème de
       taille — et c'est exactement la statistique que la patronne lit dans le
       registre des retours pour décider quoi racheter. Tant que personne n'a
       choisi, le registre dit « Non précisé ». */
    if (!state.ret || state.ret.saleId !== saleId) state.ret = { saleId, picks: new Set(), quantities: new Map(), motif: null };
    const picks = state.ret.picks;
    if (picks.has(idx)) { picks.delete(idx); state.ret.quantities.delete(idx); }
    else { picks.add(idx); state.ret.quantities.set(idx, 1); }
    if (!picks.size) state.ret = null;
    renderEchanges(); icons();
  }

  function doExchange() {
    const ret = state.ret;
    if (!ret) return;
    if (ret.picks.size !== 1) { toast('L\'échange se fait pièce par pièce, gardez une seule ligne cochée'); return; }
    const idx = ret.picks.values().next().value;
    const sale = findSale(ret.saleId);
    const ln = sale.lines[idx];
    const qty = pickedQty(ret, idx, ln);
    if (qty !== 1) { toast('L\'échange se fait une pièce à la fois, choisissez la quantité 1'); return; }
    /* Le motif choisi sur la fiche de retour suit l'échange jusqu'au registre :
       sans lui, tout échange y était classé « Echange », c'est-à-dire rien —
       la colonne motif répétait la colonne type et le registre ne disait plus
       pourquoi la pièce était revenue. */
    state.exchange = { saleId: ret.saleId, idx, qty: 1, motif: ret.motif || '' };
    state.ret = null;
    switchView('vente');
    toast(`Échange ${sale.id}, choisissez l'article de remplacement dans la grille`);
  }

  function doAvoir() {
    const ret = state.ret;
    if (!ret) return;
    const sale = findSale(ret.saleId);
    const idxs = Array.from(ret.picks);
    const quantities = new Map(idxs.map((i) => [i, pickedQty(ret, i, sale.lines[i])]));
    const amount = idxs.reduce((t, i) => t + sale.lines[i].unit * quantities.get(i), 0);
    if (!amount) return;
    /* `ret.motif` vaut null tant qu'aucune puce n'a été choisie : on l'écrit tel
       quel plutôt que d'inventer un motif que personne n'a donné. */
    const motif = ret.motif || 'Non précisé';
    restoreLines(sale, idxs, quantities, `avoir (${motif.toLowerCase()})`);
    const c = saleClient(sale);
    const av = issueAvoir(amount, c, `${motif}, retour ${sale.id}`, sale.id);
    recordReturn(sale, idxs, amount, motif, 'avoir', av.code, quantities);
    state.ret = null;
    refreshOps();
    openVoucher(av, { mode: 'fresh' });
  }

  function restoreLines(sale, idxs, quantities, note) {
    idxs.forEach((i) => {
      const ln = sale.lines[i];
      const qty = Math.min(lineAvailableQty(ln), Number(quantities.get(i)) || 0);
      if (!qty) return;
      markLineReturned(ln, qty, note);
      stockAdd(ln.pid, ln.size, qty);
      // Returned pieces go back into the real inventory too, not just the display.
      persistStock(ln.pid, ln.size, ln.color, qty);
    });
    persistDay();  // le retour change la recette du jour, pas seulement l'affichage
  }

  function issueAvoir(amount, cliente, motif, fromSaleId) {
    const av = {
      code: `AV-${avSeq++}`,
      amount, balance: amount,
      holderId: cliente ? cliente.id : null,
      holderName: cliente ? cliente.name : 'Porteur du bon',
      motif, at: new Date(),
      until: new Date(Date.now() + 182 * 24 * 3600 * 1000),
      from: fromSaleId || null,
    };
    AVOIRS.unshift(av);
    persistAvoirs();                          // un bon émis doit survivre au rechargement de la caisse
    queueIfOffline(`Avoir ${av.code}`);
    toast(`${av.code} émis, ${fmtMAD(amount)}, pièces remises en stock`);
    renderBadges();
    return av;
  }

  /* ---------- voucher print preview (modeled on the pressing tags) ------- */
  // Real boutique identity from the pairing / hosted session — the printed credit
  // note (BON D'AVOIR) shows the real store name+city, never the demo "Maison
  // Mansour" / its street address. Local demo (unpaired) unchanged.
  function bqPaired() { try { return window.KiwiPlatform?.pairedVenue?.() || JSON.parse(localStorage.getItem('kiwiPairedVenue') || 'null'); } catch (_) { return null; } }
  function bqReal()   { try { return !!(window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) || !!window.KiwiPlatform?.isPaired?.() || !!bqPaired(); } catch (_) { return !!bqPaired(); } }
  function bqName(demo) { const p = bqPaired(); return (p && p.name) || (bqReal() ? '' : demo); }
  function bqCity(demo) { const p = bqPaired(); return (p && p.location) || (bqReal() ? '' : demo); }

  function voucherHTML(av) {
    return `<div class="mz-avoir">
      <div class="c b lg">${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut">${bqReal() ? (bqCity('') ? esc(bqCity('')) + ' · ' : '') + 'propulsé par Kiwi' : '12 rue Aïn Harrouda, Maarif, Casablanca<br>05 22 25 XX XX · propulsé par Kiwi'}</div>
      <hr>
      <div class="c b">BON D'AVOIR</div>
      <div class="mz-avoir-amt">${fmtMAD(av.balance)}</div>
      ${av.balance !== av.amount ? `<div class="c mut">émis pour ${fmtMAD(av.amount)}, solde restant</div>` : ''}
      <hr>
      <div class="row"><span>Code</span><span class="b">${av.code}</span></div>
      <div class="row"><span>Cliente</span><span>${esc(av.holderName)}</span></div>
      <div class="row"><span>Motif</span><span>${esc(av.motif)}</span></div>
      ${av.from ? `<div class="row"><span>Vente d'origine</span><span>${esc(av.from)}</span></div>` : ''}
      <div class="row"><span>Émis le</span><span>${fmtDayY(av.at)}</span></div>
      <div class="row b"><span>VALABLE JUSQU'AU</span><span>${fmtDayY(av.until)}</span></div>
      <hr>
      <div class="c">${barcode(av.code + '-MM', 26)}</div>
      <div class="mz-avoir-code">${av.code} · ${esc((bqName('Maison Mansour') || 'Boutique').toUpperCase())}</div>
      <div class="c mut" style="margin-top:6px;">Utilisable en caisse, en une ou plusieurs fois.<br>Ni repris, ni remboursé en espèces.</div>
    </div>`;
  }

  function openVoucher(av, ctx) {
    if (!av) return;
    const fresh = ctx && ctx.mode === 'fresh';
    const el = $('#mz-avoirmm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${fresh ? `Avoir émis, ${av.code}` : `Avoir ${av.code}`}</h3>
      <p class="modal-subtle">${esc(av.holderName)} · ${fmtMAD(av.balance)} ${av.balance > 0 ? 'disponibles' : 'consommé'}</p>
      ${voucherHTML(av)}
      <div class="mz-avoir-note"><i data-lucide="shield-check"></i>Le code-barres revient en caisse comme moyen de paiement, il se déduit tout seul à l'encaissement.</div>
      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" id="mz-av-print"><i data-lucide="printer"></i>Imprimer l'avoir</button>
        <button class="mz-btn primary" data-mz-close><i data-lucide="check"></i>${fresh ? 'Terminer' : 'Fermer'}</button>
      </div>`;
    openVeil('#mz-avoir-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-avoir-veil'); });
    $('#mz-av-print', el).onclick = () => {
      const P = window.KiwiOperationalPrint;
      if (!P) { toast('Impression indisponible'); return; }
      P.printText({ title:`Avoir ${av.code}`, paper:'80', lines:[
        { label:'Cliente', value:av.holderName }, { label:'Montant', value:fmtMAD(av.amount || av.balance) },
        { label:'Solde disponible', value:fmtMAD(av.balance) }, { label:'Motif', value:av.motif },
        { label:'Valable jusqu’au', value:fmtDayY(av.until) },
      ] }).then((r) => toast(r && r.ok ? 'Impression système ouverte' : 'Impression impossible'));
    };
  }

  /* ---------- exchange summary ---------- */
  function openExchSummary(newPid, newSize, newColor) {
    const ex = state.exchange;
    if (!ex) return;
    const sale = findSale(ex.saleId);
    const ln = sale.lines[ex.idx];
    /* L'article RENDU peut ne plus être au catalogue (le journal couvre la
       semaine) ; celui qui le remplace vient forcément de la grille, donc il y
       est. Le prix du retour se lit sur la ligne de vente — le montant payé —
       et pas sur la fiche produit, qui a pu changer de prix depuis. */
    const oldP = P[ln.pid] || { name: ln.name || 'Article retiré du catalogue', art: '' };
    const newP = P[newPid];
    if (!newP) { toast('Article de remplacement introuvable'); return; }
    const diff = newP.price - ln.unit;
    const c = saleClient(sale);
    const el = $('#mz-exchm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Échange, ${sale.id}</h3>
      <p class="modal-subtle">${c ? esc(c.name) : 'Cliente de passage'} · la pièce rendue repart en stock</p>
      <div class="mz-exch-row is-ret">
        <span class="mz-line-art">${artOf(oldP.art)}</span>
        <span class="mid"><b>${esc(oldP.name)}</b><span>retour · ${esc(ln.size)} · ${colorDot(ln.color)} ${esc(colorLabel(ln.color))}${ln.remise ? ` · payé avec −${ln.remise} %` : ''}</span></span>
        <span class="amt">−${fmtMAD(ln.unit)}</span>
      </div>
      <div class="mz-exch-row is-new">
        <span class="mz-line-art">${artOf(newP.art)}</span>
        <span class="mid"><b>${esc(newP.name)}</b><span>remplacement · ${esc(newSize)} · ${colorDot(newColor)} ${esc(colorLabel(newColor))}</span></span>
        <span class="amt">+${fmtMAD(newP.price)}</span>
      </div>
      <div class="mz-exch-diff ${diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'zero'}">
        <span>${diff > 0 ? 'Différence à encaisser' : diff < 0 ? 'Différence en faveur de la cliente, part en avoir' : 'Aucun écart, échange direct'}</span>
        <span class="amt">${diff === 0 ? '0 MAD' : fmtMAD(Math.abs(diff))}</span>
      </div>
      <div class="mz-sheet-foot">
        <button class="mz-btn secondary" data-mz-close>Retour</button>
        ${diff > 0
          ? `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="banknote"></i>Encaisser ${fmtMAD(diff)}</button>`
          : diff < 0
            ? `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="ticket"></i>Échanger + avoir ${fmtMAD(-diff)}</button>`
            : `<button class="mz-btn primary" id="mz-exch-go"><i data-lucide="check"></i>Confirmer l'échange</button>`}
      </div>`;
    openVeil('#mz-exch-veil');
    icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-exch-veil'); });

    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      stockAdd(ln.pid, ln.size, 1);
      stockAdd(newPid, newSize, -1);
      // Commit the swap to the shared inventory: rendered piece back in, replacement out.
      persistStock(ln.pid, ln.size, ln.color, 1);
      persistStock(newPid, newSize, newColor, -1);
      state.exchange = null;
      persistDay();
      queueIfOffline(`Échange ${sale.id}`);
      renderExchNote(); renderGrid(); renderBadges();
    };

    $('#mz-exch-go', el).onclick = () => {
      if (diff > 0) {
        const go = $('#mz-exch-go', el);
        if (go) go.disabled = true;
        nextStandaloneTicketNumber().then((exchangeNumber) => {
          closeVeil('#mz-exch-veil');
          openPay({
            amount: diff,
            title: 'Différence échange',
            subtitle: `${sale.id} · ${esc(oldP.name)} → ${esc(newP.name)}`,
            ref: exchangeNumber,
            lines: [{
              qty: 1,
              name: `Différence échange · ${oldP.name} → ${newP.name}`,
              amount: diff,
              ref: newPid,
              barcode: newP.barcode || '',
            }],
            subtotal: diff,
            doneLabel: 'Terminer',
            waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
            onPaid: (parts) => {
              apply();
              const rec = {
                id: exchangeNumber, syncId: newSaleId(), at: new Date(), clientId: sale.clientId, by: STAFF.caissiere.name, kind: 'echange',
                methods: parts.map((x) => x.m).join(' + '),
                parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
                lines: [{ pid: newPid, size: newSize, color: newColor, qty: 1, remise: 0, unit: diff, returned: false, note: `différence échange ${sale.id}` }],
                total: diff,
              };
              SALES.unshift(rec);
              persistDay();
              bqSaveProvisional();
              try {
                if (window.KiwiLive && window.KiwiLive.isOn()) {
                  const pm = (parts || []).map((x) => x.m);
                  const isDelivery = pm.indexOf('livraison') >= 0;
                  const method = isDelivery ? 'delivery' : (pm.indexOf('carte') >= 0 ? 'card' : (pm.indexOf('espèces') >= 0 ? 'cash' : 'wallet'));
                  const cashIn = isDelivery ? diff : (parts || []).reduce((s, x) => s + (x.m === 'avoir' ? 0 : (+x.amount || 0)), 0);
                  window.KiwiLive.postSale({
                    id: rec.syncId,
                    amount: cashIn,
                    method,
                    channel: isDelivery ? 'delivery' : 'counter',
                    label: `Différence échange ${sale.id}`,
                    ref: rec.id,
                    time: rec.at,
                    lines: [{ name: newP.name + (newSize ? ' ' + newSize : ''), qty: 1, total: diff, cat: rayonOf(newPid) || '' }],
                  });
                }
              } catch (_) {}
              $('#mz-today', root).textContent = headSubVente();
              refreshOps();
              return { ref: rec.id, sale: rec, line: `Échange ${sale.id} réglé, différence ${fmtMAD(diff)}` };
            },
          });
        }).catch(() => {
          if (go) go.disabled = false;
          toast('Numéro de ticket indisponible', 'Reconnectez cette caisse pour réserver sa prochaine série.');
        });
      } else if (diff < 0) {
        closeVeil('#mz-exch-veil');
        apply();
        const av = issueAvoir(-diff, c, `Différence échange ${sale.id}`, sale.id);
        refreshOps();
        openVoucher(av, { mode: 'fresh' });
      } else {
        closeVeil('#mz-exch-veil');
        apply();
        refreshOps();
        toast(`Échange ${sale.id}, ${oldP.name} ${ln.size} contre ${newP.name} ${newSize}`);
      }
    };
  }

  /* ═══════════════════════ ENCAISSEMENT ═══════════════════════ */
  function printReceiptNow(opts, parts, printOpts) {
    printOpts = printOpts || {};
    const isGift = !!printOpts.gift;
    const KP = window.KiwiPrinter;
    const pv = pvPaired();
    const shopName = (pv && pv.name) || 'Vogue Home';
    const lines = (opts.lines || []).map((l) => ({
      qty: l.qty,
      name: l.name + (l.marque ? ' · ' + l.marque : '') + (l.motif ? ' (' + l.motif + ')' : ''),
      price: isGift ? '' : fmtMAD(l.amount),
      total: isGift ? null : l.amount,
      ref: l.ref,
      barcode: l.barcode,
    }));

    if (isGift) {
      // Impression Ticket Cadeau sans montants ni prix
      const giftDoc = {
        shop: shopName + ' · Ticket Cadeau',
        ref: opts.ref || '',
        date: fmtDT(new Date()),
        lines: lines,
        total: '',
        method: '',
        gift: true,
        note: 'Ticket Cadeau / Bon d’échange · Valable 30 jours pour échange ou avoir sur présentation de ce ticket.'
      };
      if (KP && KP.isConnected && KP.isConnected()) {
        toast('Impression du ticket cadeau…');
        KP.printReceipt(giftDoc).then(
          () => toast('Ticket cadeau imprimé'),
          () => toast('Échec impression ticket cadeau')
        );
        return;
      }
      if (KP && KP.browserReceipt) {
        KP.browserReceipt(giftDoc);
        toast('Ticket cadeau affiché');
        return;
      }
      const giftHtml = `
        <div style="font-family:monospace; max-width:300px; margin:20px auto; padding:16px; border:1px solid #000; text-align:center;">
          <h3 style="margin:0;">${esc(shopName)}</h3>
          <div style="font-size:12px; margin:4px 0;">TANGER · ART DE TABLE & DÉCORATION</div>
          <div style="font-size:13px; font-weight:bold; margin:10px 0; border-top:1px dashed #000; border-bottom:1px dashed #000; padding:6px 0;">
            *** TICKET CADEAU ***<br>BON D'ÉCHANGE
          </div>
          <div style="text-align:left; font-size:11px; margin-bottom:10px;">
            Ticket: ${esc(opts.ref)}<br>
            Date: ${fmtDT(new Date())}<br>
            Conseiller: ${esc((STAFF && STAFF.caissiere && STAFF.caissiere.name) || 'Caisse')}<br>
            ${opts.customer ? `Cliente: ${esc(opts.customer.name)}<br>` : ''}
          </div>
          <table style="width:100%; border-collapse:collapse; font-size:11px; text-align:left; margin-bottom:12px;">
            <thead>
              <tr style="border-bottom:1px solid #000;"><th>Qté</th><th>Article / Marque</th></tr>
            </thead>
            <tbody>
              ${lines.map((l) => `<tr><td style="padding:4px 0; vertical-align:top; font-weight:bold;">${l.qty || 1}×</td><td style="padding:4px 0;">${esc(l.name)}</td></tr>`).join('')}
            </tbody>
          </table>
          <div style="font-size:10.5px; border-top:1px dashed #000; padding-top:8px; line-height:1.4;">
            Échangeable sous 30 jours dans notre boutique sur présentation de ce bon.<br>
            Articles non utilisés et dans leur emballage d'origine.
          </div>
          <div style="margin-top:12px;">
            ${barcode(opts.ref || 'GIFT', 24)}
          </div>
        </div>`;
      const gw = window.open('', '_blank', 'width=360,height=500');
      if (gw) {
        gw.document.write(`<!DOCTYPE html><html><head><title>Ticket Cadeau - ${esc(opts.ref)}</title></head><body>${giftHtml}<script>window.onload=function(){window.print();};<\/script></body></html>`);
        gw.document.close();
      }
      return;
    }

    if (!KP || !KP.printReceipt) { toast('Impression indisponible sur cet appareil'); return; }

    const K = window.KiwiReceipt;
    if (K) {
      const doc = K.build({
        ref: opts.ref || '',
        ts: (opts.sale && opts.sale.at) || Date.now(),
        cashier: (STAFF && STAFF.caissiere && STAFF.caissiere.name) || '',
        lines: (opts.lines || []).map((l) => ({ qty: l.qty, name: l.name, total: l.amount, ref: l.ref, barcode: l.barcode })),
        subtotal: opts.subtotal,
        promo: opts.promo || null,
        discount: opts.discount,
        total: opts.amount,
        customer: opts.customer || null,
        pay: (parts || []).map((x) => ({ label: x.m === 'avoir' ? ('Avoir ' + (x.code || '')) : x.m, amount: x.amount })),
        received: (function () {
          const c = (parts || []).find((x) => x.m === 'espèces' && x.rendu > 0);
          return c ? (+c.amount || 0) + (+c.rendu || 0) : null;
        })(),
        change: (parts || []).reduce((r, x) => r || x.rendu || 0, 0) || null,
      });
      try {
        if (opts.sale) { opts.sale.rc = K.snapshot(doc); persistDay(); }
      } catch (_) {}
      toast('Impression du reçu…');
      Promise.resolve(K.print(doc)).then(
        (r) => toast(r && r.ok
          ? ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : r.via === 'browser' ? 'imprimante système' : 'réseau'))
          : 'Impression échouée'),
        () => toast('Impression échouée')
      );
      return;
    }

    const label = { 'carte': 'Carte', 'avoir': 'Avoir', 'espèces': 'Espèces', 'livraison': 'Livraison · à recevoir' };
    const doc = {
      shop: shopName,
      ref: opts.ref || '',
      date: fmtDT(new Date()),
      lines: lines.length ? lines : [{ name: opts.title || 'Vente', price: fmtMAD(opts.amount) }],
      total: fmtMAD(opts.amount),
      method: (parts || []).map((x) => label[x.m] || x.m).join(' + '),
    };

    if (!KP.isConnected || !KP.isConnected()) {
      const cfg = (KP.getConfig && KP.getConfig()) || {};
      if (cfg.browserFallback && KP.browserReceipt) { KP.browserReceipt(doc); return; }
      toast('Aucune imprimante connectée');
      try {
        KP.openSetup(KP.browserReceipt ? {
          kind: 'receipt',
          onBrowserPrint: () => {
            try { KP.setConfig({ browserFallback: true }); } catch (_) {}
            KP.browserReceipt(doc);
          },
        } : {});
      } catch (_) {}
      return;
    }
    toast('Impression du reçu…');
    KP.printReceipt(doc).then(
      (r) => toast(r && r.ok
        ? ('Reçu imprimé · ' + (r.via === 'bluetooth' ? 'Bluetooth' : r.via === 'usb' ? 'USB' : 'réseau'))
        : ('Impression échouée : ' + ((r && r.reason) || 'inconnu'))),
      (e) => toast('Impression échouée : ' + ((e && e.message) || 'erreur'))
    );
  }

  function checkout() {
    const t = state.ticket;
    if (!t.lines.length) return;
    if (state.syncStorageError || state.ticketStorageError) {
      toast('Vente suspendue', 'La tablette ne peut plus sécuriser la file hors-ligne. Contactez le support avant de continuer.');
      return;
    }
    if (!IS_DEMO && t.period !== ticketPeriod()) {
      t.num = '';
      t.period = ticketPeriod();
    }
    if (!t.num) {
      assignTicketNumber(t).then(() => { if (state.ticket === t) checkout(); })
        .catch(() => toast('Numéro de ticket indisponible', state.ticketStorageError
          ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
          : 'Reconnectez cette caisse pour réserver sa prochaine série.'));
      return;
    }
    const tot = ticketTotals(t);
    const total = tot.total;
    const c = ticketClient();
    openPay({
      amount: total,
      title: 'Encaissement',
      subtitle: `${t.num} · ${c ? esc(c.name) : 'Cliente de passage'}`,
      ref: t.num,
      lines: t.lines.map((ln) => ({
        qty: ln.qty,
        name: (P[ln.pid] ? P[ln.pid].name : 'Article') + (ln.size && ln.size !== 'TU' ? ' ' + ln.size : '') + (ln.isPiece ? ' (À la pièce)' : ''),
        amount: lineUnit(ln) * ln.qty,
        ref: ln.pid,
        barcode: (P[ln.pid] && P[ln.pid].barcode) || '',
        marque: ln.marque || (P[ln.pid] && P[ln.pid].marque) || '',
        motif: ln.motif || (P[ln.pid] && P[ln.pid].motif) || '',
        format: ln.format || (P[ln.pid] && P[ln.pid].format) || 'piece',
      })),
      subtotal: t.lines.reduce((s, ln) => {
        const p = P[ln.pid];
        const orig = (ln.customPrice != null) ? ln.customPrice : (p ? p.price : 0);
        return s + orig * ln.qty;
      }, 0),
      promo: tot.promo ? { amount: tot.promo, label: promoLabelForTicket(t) } : null,
      discount: tot.remise + tot.reward,
      customer: c ? { name: c.name, phone: c.phone, points: c.points, loyalty: (t.reward && t.reward.clientId === t.client) ? t.reward.label : '' } : null,
      waName: c ? firstName(c.name) : null, waPhone: c ? c.phone : null,
      onPaid: (parts) => {
        const rewardUsed = !!(t.reward && c && c.id && t.reward.clientId === c.id);
        const sale = {
          id: t.num, syncId: t.syncId || newSaleId(), at: new Date(), clientId: c ? c.id : null, by: STAFF.caissiere.name, kind: 'vente',
          methods: parts.map((x) => x.m).join(' + '),
          parts: parts.map((x) => ({ m: x.m, amount: Math.round((+x.amount || 0) * 100) / 100 })),
          discount: Math.round(tot.remise + tot.reward),
          remiseAuth: (t.remiseAuth && typeof t.remiseAuth === 'object')
            ? { by: t.remiseAuth.by || '', role: t.remiseAuth.role || '', at: t.remiseAuth.at, pct: t.remiseAuth.pct, amount: Math.round(tot.remise) }
            : null,
          promoOff: Math.round(tot.promo),
          giftWrap: !!t.giftWrap,
          delivery: t.delivery ? Object.assign({}, t.delivery) : null,
          lines: t.lines.map((ln) => ({
            pid: ln.pid, size: ln.size, color: ln.color, qty: ln.qty, remise: ln.remise, promo: linePromo(ln),
            unit: lineUnit(ln), returned: false, note: '', format: ln.format, isPiece: ln.isPiece,
            marque: ln.marque, motif: ln.motif, fragile: ln.fragile, registryId: ln.registryId
          })),
          reward: rewardUsed ? t.reward.label : null,
          total,
        };
        SALES.unshift(sale);
        persistDay();
        bqSaveProvisional();
        if (IS_DEMO) saleSeq++;
        sale.lines.forEach((ln) => persistStock(ln.pid, ln.size, ln.color, -ln.qty));
        if (typeof updateRegistryContribution === 'function') updateRegistryContribution(sale);
        try {
          if (window.KiwiLive && window.KiwiLive.isOn()) {
            const received = (parts || []).filter((x) => x && x.m !== 'avoir' && x.m !== 'livraison' && (+x.amount || 0) > 0);
            const receivedMethods = received.map((x) => x.m);
            const method = receivedMethods.indexOf('carte') >= 0 ? 'card' : (receivedMethods.indexOf('espèces') >= 0 ? 'cash' : 'wallet');
            const first = t.lines[0];
            const pieces = t.lines.reduce((n, ln) => n + ln.qty, 0);
            const name = (first && P[first.pid]) ? P[first.pid].name : 'Vente';
            const label = t.lines.length > 1 ? (name + ' +' + (pieces - first.qty) + ' art.') : name;
            /* On remonte l'argent QUI RENTRE, pas la valeur du ticket. Un avoir
               n'est pas un encaissement : c'est la consommation d'une dette née
               d'une vente déjà comptée. Remonter le total, c'est compter deux
               fois — un caftan à 1 200 rendu puis réglé avec l'avoir affichait
               2 400 MAD de recette pour 1 200 MAD réellement pris. Réglé
               entièrement en avoir, il ne reste rien à remonter et postSale
               (montant ≤ 0) passe son tour, ce qui est le bon comptage.
               sale.total garde la valeur du ticket : c'est la vente, pas la caisse. */
            const cashIn = received.reduce((s, x) => s + (+x.amount || 0), 0);
            /* LE PANIER, qui ne partait pas. On ne remontait que {montant,
               moyen, libellé}, et le libellé est un RÉSUMÉ de ticket
               (« Caftan +3 art. ») : le tableau de bord ne pouvait donc pas dire
               à la patronne combien de jeans noirs elle avait vendus, alors que
               la caisse le savait ligne par ligne. Le rayon voyage avec chaque
               ligne — c'est lui qui fait tenir le « Catégorie : Jeans » du
               rapport de fin de journée même si le rayon est renommé plus tard.
               Bornes identiques à celles de /api/sale : 40 lignes, 60 signes. */
            const basket = t.lines.slice(0, 40).map((ln) => ({
              itemId: ln.pid,
              variantId: [ln.pid, ln.size || '', ln.color || ''].join(':'),
              name: (P[ln.pid] ? P[ln.pid].name : 'Article') + (ln.size ? ' ' + ln.size : ''),
              qty: ln.qty,
              total: Math.round(lineUnit(ln) * ln.qty),
              cat: rayonOf(ln.pid) || '',
              unit: 'piece',
              kind: 'product',
            }));
            window.KiwiLive.postSale({
              id: sale.syncId,
              amount: cashIn,
              method: method,
              channel: (parts || []).some((x) => x && x.m === 'livraison') ? 'delivery' : 'counter',
              label: label,
              ref: sale.id,
              time: sale.at,
              lines: basket,
            });
          }
        } catch (_) {}
        let ptsLine = '';
        if (c) {
          // Persist the purchase to the SHARED client book (spend + points + visit)
          // so the owner's dashboard client directory + loyalty reflect it — a real
          // store's sale must attach to the real client, not a throwaway in-memory
          // object. Real store only; the local demo keeps its in-memory client. F5.
          if (useKiwiCl() && window.KiwiClients && window.KiwiClients.recordPurchase && c.id) {
            try { window.KiwiClients.recordPurchase(c.id, { amount: total }); } catch (_) {}
            // La récompense est portée : on brûle les points (KiwiClients.redeem
            // retire le seuil / réinitialise la carte). Après recordPurchase, pour
            // que l'achat compte d'abord, la récompense se déduise ensuite.
            if (rewardUsed && window.KiwiClients.redeem) {
              try { window.KiwiClients.redeem(c.id); } catch (_) {}
            }
          }
          const pts = Math.round(total / 10);
          c.points += pts;
          c.achats += 1;
          ptsLine = ` · +${pts} pts pour ${firstName(c.name)}` + (rewardUsed ? ` · récompense ${t.reward.label}` : '');
        }
        queueIfOffline(`Vente ${sale.id}`);
        freshTicket();
        $('#mz-today', root).textContent = headSubVente();
        renderTicket(); renderGrid(); renderBadges(); icons();
        const delivery = parts.some((x) => x.m === 'livraison');
        return { ref: sale.id, sale, delivery, line: delivery
          ? `Vente ${sale.id} en livraison, ${fmtMAD(total)} à recevoir${ptsLine}`
          : `Vente ${sale.id} encaissée, ${fmtMAD(total)}${ptsLine}` };
      },
    });
  }

  /* ── UNE VENTE, PLUSIEURS RÈGLEMENTS ──────────────────────────────────────
     « La moitié en espèces, la moitié en carte » n'est pas deux ventes : c'est
     une vente à deux règlements. La caisse ne savait faire qu'un seul mode par
     vente (l'avoir excepté), et la caissière devait donc encaisser deux tickets
     — deux numéros, deux lignes dans le journal, un panier moyen faux et un
     tiroir qui ne tombe jamais juste.

     `settled` porte ce qui est déjà réglé ; `share` la part que le prochain
     mode prendra. Le reste retourne à l'écran des modes tant qu'il n'est pas
     couvert, ce qui donne gratuitement les partages à trois. */
  function openPay(opts) {
    const el = $('#mz-paym', root);
    let avoirPart = null;                   /* { m:'avoir', amount, code } */
    const settled = [];                     /* les règlements déjà posés */
    let committed = false;                  /* double tap must never book twice */
    let share = 1;                          /* 1 = tout le reste ; 0.5 = la moitié */
    let custom = 0;                          /* un montant saisi à la main */
    const r2 = (n) => Math.round((+n || 0) * 100) / 100;
    const paid = () => settled.reduce((s, p) => s + (+p.amount || 0), 0);
    const due = () => r2(opts.amount - (avoirPart ? avoirPart.amount : 0) - paid());
    /* Ce que prend le prochain mode. Jamais plus que le reste : une part de 50 %
       sur un reste de 3 MAD ne doit pas produire un règlement de 1,50 MAD qu'on
       n'a pas les pièces pour rendre — mais surtout jamais PLUS que dû. */
    const portion = () => {
      if (custom > 0) return Math.min(custom, due());
      if (share >= 1) return due();
      return Math.min(due(), Math.max(0.01, r2(due() * share)));
    };
    const closeBtns = () => $$('[data-mz-close]', el).forEach((b) => {
      b.onclick = () => {
        /* Once one payment part is confirmed, closing would forget money already
           received (especially a card charge) while leaving the cart unpaid.
           Finish the remaining balance; the success screen can close normally. */
        if (!committed && (settled.length || avoirPart)) {
          toast('Paiement commencé', `Il reste ${fmtMAD(due())} à régler avant de fermer.`);
          return;
        }
        closeVeil('#mz-pay-veil');
      };
    });

    const mLabel = (m) => (m === 'espèces' ? 'Espèces' : m === 'carte' ? 'Carte' : m === 'livraison' ? 'Livraison' : m === 'avoir' ? 'Avoir' : m);

    const appliedBanner = () => {
      const rows = [];
      if (avoirPart) rows.push(`<i data-lucide="ticket"></i> Avoir <b>${avoirPart.code}</b> appliqué, −${fmtMAD(avoirPart.amount)}`);
      settled.forEach((p) => rows.push(`<i data-lucide="check"></i> ${mLabel(p.m)} <b>${fmtMAD(p.amount)}</b> réglé`));
      return rows.map((r) => `<div class="mz-pay-applied">${r}</div>`).join('');
    };

    /* Le partage. Volontairement à quatre touches et pas un clavier de plus :
       au comptoir, « la moitié » est le cas qui revient, et tout le reste se
       saisit au montant. */
    const splitBar = () => `
      <div class="mz-split" role="group" aria-label="Partager le paiement">
        <span class="mz-split-l">Partager</span>
        <button class="mz-split-c${share >= 1 && !custom ? ' is-on' : ''}" data-mz-share="1">Tout</button>
        <button class="mz-split-c${share === 0.5 && !custom ? ' is-on' : ''}" data-mz-share="0.5">50 %</button>
        <button class="mz-split-c${share === 0.25 && !custom ? ' is-on' : ''}" data-mz-share="0.25">25 %</button>
        <button class="mz-split-c${custom ? ' is-on' : ''}" data-mz-share="x">Montant…</button>
        <input class="mz-split-in mono" id="mz-split-in" type="number" inputmode="decimal" min="0" step="1"
               placeholder="MAD" value="${custom || ''}" ${custom ? '' : 'hidden'} aria-label="Montant de cette part" />
      </div>
      <p class="mz-split-note"${portion() < due() ? '' : ' hidden'}>Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}</p>`;

    const stepMethods = () => {
      const avs = activeAvoirs();
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${esc(opts.title)}</h3>
        <p class="modal-subtle">${settled.length ? `Reste à régler sur ${fmtMAD(opts.amount)}` : opts.subtitle}</p>
        <div class="modal-amount size-md">${fmtMAD(due())}</div>
        ${appliedBanner()}
        ${due() > 0.01 ? splitBar() : ''}
        <div class="mz-pay-opts">
          <button class="mz-pay-opt" data-mz-m="especes">
            <span class="ic"><i data-lucide="banknote"></i></span>
            <span class="l"><b>Espèces</b><span>Rendu calculé, flous comptés une fois</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="carte">
            <span class="ic"><i data-lucide="credit-card"></i></span>
            <span class="l"><b>Carte</b><span>Lecteur partenaire, V1 sans encaissement Kiwi</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          <button class="mz-pay-opt" data-mz-m="livraison">
            <span class="ic"><i data-lucide="truck"></i></span>
            <span class="l"><b>Livraison</b><span>Vente enregistrée, paiement à recevoir du transporteur</span></span>
            <span class="amt">${fmtMAD(portion())}</span>
          </button>
          ${avoirPart ? '' : avs.length ? `
          <button class="mz-pay-opt" data-mz-m="avoir">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Avoir</b><span>${avs.length === 1 ? `${avs[0].code} · ${fmtMAD(avs[0].balance)}, ${esc(avs[0].holderName)}` : `${avs.length} avoirs actifs, scanner ou choisir`}</span></span>
            <span class="amt">−${fmtMAD(Math.min(avs[0].balance, portion()))}</span>
          </button>` : `
          <button class="mz-pay-opt is-mute" data-mz-m="avoir-none">
            <span class="ic"><i data-lucide="ticket"></i></span>
            <span class="l"><b>Avoir</b><span>Aucun avoir actif en caisse</span></span>
          </button>`}
        </div>`;
      icons(); closeBtns();
      const inp = $('#mz-split-in', el);
      $$('[data-mz-share]', el).forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.bqShare;
          if (v === 'x') {
            /* On ne re-rend pas : le champ apparaît sous la main de la caissière
               et prend le curseur. Un re-rendu le lui reprendrait. */
            if (inp) { inp.hidden = false; inp.focus(); inp.select(); }
            return;
          }
          custom = 0; share = +v || 1; stepMethods();
        };
      });
      if (inp) {
        inp.oninput = () => {
          custom = Math.max(0, Math.min(due(), r2(inp.value)));
          /* La pastille suit la saisie. On ne re-rend pas la barre (le champ
             perdrait le curseur en pleine frappe), donc on déplace le marqueur
             à la main — sans quoi « Tout » reste allumé sur une part de 100 MAD. */
          $$('[data-mz-share]', el).forEach((b) => {
            b.classList.toggle('is-on', custom > 0 ? b.dataset.bqShare === 'x' : b.dataset.bqShare === String(share));
          });
          const note = $('.mz-split-note', el);
          if (note) {
            note.hidden = !(portion() < due());
            note.textContent = `Cette part : ${fmtMAD(portion())} · restera ${fmtMAD(r2(due() - portion()))}`;
          }
          /* L'avoir se déduit du total, mais jamais plus que la part choisie :
             sa ligne suit donc la saisie comme les autres, en gardant son signe
             et son plafond propre (le solde du bon). */
          $$('[data-mz-m]', el).forEach((b) => {
            const a = $('.amt', b); if (!a) return;
            if (/^avoir/.test(b.dataset.bqM)) {
              const bal = (activeAvoirs()[0] || {}).balance;
              if (bal != null) a.textContent = '−' + fmtMAD(Math.min(bal, portion()));
              return;
            }
            a.textContent = fmtMAD(portion());
          });
        };
      }
      $$('[data-mz-m]', el).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.bqM;
          if (m === 'especes') stepCash(portion());
          else if (m === 'carte') stepCard(portion());
          else if (m === 'livraison') settle({ m: 'livraison', amount: portion() });
          else if (m === 'avoir') stepAvoir();
          else toast('Aucun avoir actif, émettez-en un depuis Échanges & avoirs');
        };
      });
    };

    /* Un règlement de plus est posé. Tant qu'il reste quelque chose à payer on
       revient aux modes — c'est ce retour, et rien d'autre, qui rend possibles
       les partages à trois ou quatre. */
    const settle = (part) => {
      settled.push(part);
      share = 1; custom = 0;
      if (due() > 0.009) { toast(`Reste ${fmtMAD(due())} à régler`); stepMethods(); }
      else commit();
    };

    const stepAvoir = () => {
      const avs = activeAvoirs();
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Avoir en paiement</h3>
        <p class="modal-subtle">Scannez le bon, ou choisissez-le, il se déduit du total</p>
        <div class="mz-pay-opts">
          ${avs.map((a) => `
            <button class="mz-pay-opt" data-mz-av-use="${a.code}">
              <span class="ic"><i data-lucide="scan-line"></i></span>
              <span class="l"><b>${a.code} · ${fmtMAD(a.balance)}</b><span>${esc(a.holderName)} · ${esc(a.motif)} · valable jusqu'au ${fmtDayY(a.until)}</span></span>
              <span class="amt">−${fmtMAD(Math.min(a.balance, portion()))}</span>
            </button>`).join('')}
        </div>
        <div class="mz-sheet-foot"><button class="mz-btn secondary" id="mz-av-back" style="flex:1;">Retour</button></div>`;
      icons(); closeBtns();
      $('#mz-av-back', el).onclick = stepMethods;
      $$('[data-mz-av-use]', el).forEach((b) => {
        b.onclick = () => {
          const av = AVOIRS.find((a) => a.code === b.dataset.bqAvUse);
          /* `portion()`, pas `due()`. Sans part choisie les deux sont égaux et
             le bon se déduit entièrement, comme avant. Mais quand la caissière
             a explicitement demandé la moitié, le bon prenait quand même tout :
             une cliente qui voulait garder du solde sur son avoir en sortait
             avec un bon vidé, et il n'y avait pas de retour en arrière. */
          const applied = Math.min(av.balance, portion());
          avoirPart = { m: 'avoir', amount: applied, code: av.code };
          share = 1; custom = 0;   /* la part est consommée, comme dans settle() */
          if (due() <= 0.009) commit();
          else { toast(`${av.code} appliqué, reste ${fmtMAD(due())} à payer`); stepMethods(); }
        };
      });
    };

    const stepCash = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      let received = amount;
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Espèces · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle}</p>
        ${appliedBanner()}
        <div class="cash-grid">
          <div class="cash-input-row">
            <label class="cash-input-label" for="mz-cash-in">Espèces reçues</label>
            <input class="cash-input mono" id="mz-cash-in" type="number" inputmode="numeric" min="0" step="1" value="${amount}" />
          </div>
          <div class="cash-presets" aria-label="Ajout rapide">
            <button class="cash-preset" data-add="20">+20</button>
            <button class="cash-preset" data-add="50">+50</button>
            <button class="cash-preset" data-add="100">+100</button>
            <button class="cash-preset" data-add="200">+200</button>
          </div>
          <div class="cash-rendu"><span class="lbl">Rendu</span><span class="val mono" id="mz-cash-rendu">0 MAD</span></div>
          <button class="cash-confirm" id="mz-cash-ok">Confirmer</button>
        </div>`;
      icons(); closeBtns();
      const refresh = () => {
        $('#mz-cash-rendu', el).textContent = fmtMAD(Math.max(0, received - amount));
        $('#mz-cash-ok', el).disabled = received < amount;
      };
      $('#mz-cash-in', el).oninput = (e) => { received = +e.target.value || 0; refresh(); };
      $$('[data-add]', el).forEach((b) => {
        b.onclick = () => { received += +b.dataset.add; $('#mz-cash-in', el).value = received; refresh(); };
      });
      refresh();
      $('#mz-cash-ok', el).onclick = () => {
        settle({ m: 'espèces', amount, rendu: Math.max(0, received - amount) });
      };
    };

    const stepCard = (amount) => {
      amount = amount > 0 ? amount : due();
      const rest = r2(due() - amount);
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Carte · ${fmtMAD(amount)}</h3>
        <p class="modal-subtle">${rest > 0.009 ? `Part sur ${fmtMAD(due())} · restera ${fmtMAD(rest)}` : opts.subtitle} · Kiwi affiche, le lecteur encaisse</p>
        <div class="reader-stage">
          <div class="reader-disc is-pulsing" id="mz-reader-disc"><i data-lucide="credit-card"></i></div>
          <div class="reader-status" id="mz-reader-status">Montant envoyé au lecteur<span class="ellipsis"></span></div>
          <div class="reader-method">Lecteur partenaire, V1 sans encaissement Kiwi</div>
        </div>
        <div class="mz-card-confirm" id="mz-card-confirm" hidden>
          <button class="cash-confirm" id="mz-card-ok"><i data-lucide="check"></i> Encaissement confirmé sur le lecteur</button>
          <button class="mz-btn ghost" id="mz-card-cancel">Paiement refusé · annuler</button>
        </div>`;
      icons(); closeBtns();
      /* On simule l'aller au lecteur, puis — contrairement à avant — on n'encaisse
         PAS tout seul : la caissière confirme d'un geste que le lecteur a approuvé.
         AVANT, l'encaissement carte partait d'un minuteur de ~2,8 s ; fermer l'écran
         carte pendant l'animation (réflexe normal, le vrai paiement se fait sur le
         lecteur partenaire) perdait TOUTE la vente et ses points fidélité — d'où
         « en carte la cliente ne gagne pas de points ». La confirmation explicite
         enregistre la vente de façon fiable, exactement comme les espèces. */
      setTimeout(() => {
        const disc = $('#mz-reader-disc', el);
        if (!disc || !el.closest('.modal-veil').classList.contains('is-open')) return;
        disc.classList.remove('is-pulsing');
        disc.classList.add('is-success');
        disc.innerHTML = '<i data-lucide="check"></i>';
        $('#mz-reader-status', el).textContent = 'Confirmez l\'encaissement sur le lecteur';
        $('#mz-reader-status', el).classList.add('is-success');
        const cw = $('#mz-card-confirm', el);
        if (cw) cw.hidden = false;
        icons();
        const ok = $('#mz-card-ok', el);
        if (ok) ok.onclick = () => settle({ m: 'carte', amount });
        const cancel = $('#mz-card-cancel', el);
        if (cancel) cancel.onclick = () => {
          if (settled.length || avoirPart) stepMethods();
          else closeVeil('#mz-pay-veil');
        };
      }, 1400);
    };

    const commit = () => {
      if (committed) return;
      committed = true;
      const parts = (avoirPart ? [avoirPart] : []).concat(settled);
      const avp = parts.find((x) => x.m === 'avoir');
      if (avp) {
        const av = AVOIRS.find((a) => a.code === avp.code);
        if (av) {                              // garde-fou : un code introuvable (bon d'une autre caisse) ne fait plus planter l'encaissement
          av.balance -= avp.amount;
          persistAvoirs();                     // le solde entamé survit au rechargement
          toast(av.balance > 0 ? `${av.code}, reste ${fmtMAD(av.balance)} dessus` : `${av.code} consommé en totalité`);
        }
      }
      const res = opts.onPaid(parts) || {};
      stepSuccess(parts, res);
    };

    const stepSuccess = (parts, res) => {
      if (res && res.sale) opts.sale = res.sale;
      const cash = parts.find((x) => x.m === 'espèces');
      const delivery = parts.some((x) => x.m === 'livraison') || (opts.sale && !!opts.sale.delivery);
      el.innerHTML = `
        <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">${delivery ? 'Livraison enregistrée' : "C'est encaissé"}</h3>
        <p class="modal-subtle">${res.line ? esc(res.line) : esc(opts.title)}</p>
        ${cash && cash.rendu > 0 ? `
          <div class="cash-success-rendu">${fmtMAD(cash.rendu)}</div>
          <div class="cash-success-label">rendu à la cliente</div>` : `
          <div class="modal-amount size-md">${fmtMAD(opts.amount)}</div>`}
        <div class="mz-pay-break">
          ${parts.map((x) => `<div class="row"><span>${x.m === 'avoir' ? `Avoir ${x.code}` : x.m === 'carte' ? 'Carte, lecteur partenaire' : x.m === 'livraison' ? 'Livraison · à recevoir' : 'Espèces'}</span><b>${fmtMAD(x.amount)}</b></div>`).join('')}
        </div>
        <div class="modal-actions is-visible">
          <button class="ma-btn secondary" id="mz-pay-print"><i data-lucide="printer"></i>Reçu 80 mm</button>
          <button class="ma-btn secondary" id="mz-pay-gift"><i data-lucide="gift"></i>Ticket Cadeau</button>
          ${delivery ? '<button class="ma-btn secondary" id="mz-pay-del-note"><i data-lucide="truck"></i>Bon Livraison</button>' : ''}
          <button class="ma-btn secondary" id="mz-pay-wa"><i data-lucide="message-circle"></i>Reçu WhatsApp</button>
        </div>
        <div class="modal-actions is-visible" style="margin-top:10px;">
          <button class="ma-btn primary" id="mz-pay-done"><i data-lucide="check"></i>${esc(opts.doneLabel || 'Nouvelle vente')}</button>
        </div>`;
      icons(); closeBtns();
      $('#mz-pay-print', el).onclick = () => printReceiptNow(opts, parts);
      $('#mz-pay-gift', el).onclick = () => printReceiptNow(opts, parts, { gift: true });
      const delNoteBtn = $('#mz-pay-del-note', el);
      if (delNoteBtn) delNoteBtn.onclick = () => printDeliveryNoteNow(opts, parts);
      $('#mz-pay-wa', el).onclick = () => {
        if (!opts.waPhone) { toast('Cliente de passage, pas de numéro WhatsApp sur le ticket'); return; }
        const pv = pvPaired();
        const body = [
          (pv && pv.name) || 'Vogue Home',
          opts.ref ? ('Reçu ' + opts.ref) : 'Reçu',
          '',
          ...(opts.lines || []).map((l) => `${l.qty ? l.qty + '× ' : ''}${l.name} — ${fmtMAD(l.amount)}`),
          '',
          `TOTAL ${fmtMAD(opts.amount)}`,
          (parts || []).map((x) => x.m === 'carte' ? 'Carte' : x.m === 'avoir' ? 'Avoir' : x.m === 'livraison' ? 'Livraison · à recevoir' : 'Espèces').join(' + '),
          '',
          'Merci !',
        ].filter((x) => x !== undefined).join('\n');
        const num = String(opts.waPhone).replace(/\D/g, '');
        try {
          window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(body), '_blank', 'noopener');
          toast(`WhatsApp ouvert pour ${opts.waName || 'la cliente'}, appuyez sur envoyer`);
        } catch (_) { toast('Impossible d\'ouvrir WhatsApp'); }
      };
      $('#mz-pay-done', el).onclick = () => closeVeil('#mz-pay-veil');
    };

    stepMethods();
    openVeil('#mz-pay-veil');
  }

  /* ═══════════════════════ OFFLINE + VRAIE FILE SERVEUR ══════════════════ */
  function syncNetworkState(snapshot) {
    try {
      const q = snapshot || (window.KiwiLive && window.KiwiLive.queueStatus && window.KiwiLive.queueStatus());
      if (q) {
        state.queued = +q.pending || 0;
        state.syncStorageError = !!q.storageError;
        state.syncBlocked = state.syncStorageError || (+q.blocked || 0) > 0;
      }
    } catch (_) {}
    const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    state.offline = !!state.simulatedOffline || browserOffline;
    if (root) renderNet();
  }

  function toggleOffline() {
    if (!IS_DEMO) {
      syncNetworkState();
      toast(state.syncBlocked ? 'Synchronisation bloquée, contactez le support'
        : state.offline ? 'Wi-Fi indisponible, les ventes restent sur cette caisse'
          : state.queued ? `${state.queued} vente${state.queued > 1 ? 's' : ''} en cours de synchronisation`
            : 'Caisse en ligne, toutes les ventes sont synchronisées');
      return;
    }
    state.simulatedOffline = !state.simulatedOffline;
    syncNetworkState();
    toast(state.offline ? 'Mode hors-ligne simulé, la boutique continue' : 'Réseau simulé rétabli');
  }
  function renderNet() {
    const net = $('#mz-net', root);
    if (!net) return;
    net.classList.toggle('is-off', state.offline || state.syncBlocked);
    $('.mz-net-label', net).textContent = state.syncBlocked ? 'Sync bloquée' : state.offline ? 'Hors-ligne' : state.queued ? 'Synchronisation' : 'En ligne';
    let q = $('.mz-net-queue', net);
    if (state.queued) {
      if (!q) { q = document.createElement('b'); q.className = 'mz-net-queue'; net.appendChild(q); }
      q.textContent = state.queued;
    } else if (q) q.remove();
    const note = $('#mz-offline-note', root);
    if (!note) return;
    note.hidden = !state.offline && !state.syncBlocked;
    if (state.syncBlocked) {
      note.innerHTML = 'La synchronisation est bloquée. Les ventes restent sur cette caisse : contactez le support avant de vider les données du navigateur. <b id="mz-queue-count"></b>';
    } else {
      note.innerHTML = 'Hors-ligne, les ventes sont enregistrées sur la tablette et synchronisées au retour du réseau. <b id="mz-queue-count"></b>';
    }
    const count = $('#mz-queue-count', root);
    if (count) count.textContent = state.queued ? `${state.queued} en attente` : '';
  }

  /* ═══════════════════════ register ═══════════════════════ */
  /* ═══════════════════════════════════════════════════════════════════════════
   * INVENTAIRE — the caisse is for operational stock and barcode work only.
   * Catalogue ownership (product names, prices, categories and variants) stays
   * in the dashboard so the team has one controlled source of truth. The caisse
   * can still receive/adjust stock and register or print existing labels.
   * ─────────────────────────────────────────────────────────────────────────── */
  const catDB = () => window.KiwiBoutiqueCatalog;
  const fmtNum = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));

  function injectInvCss() {
    if (document.getElementById('mzi-css')) return;
    const st = document.createElement('style');
    st.id = 'mzi-css';
    st.textContent = `
      .bqi { height: 100%; overflow-y: auto; padding-bottom: 40px; }
      .mzi-tools { display: flex; gap: 12px; align-items: center; padding: 14px 22px 6px; }
      .mzi-scan { flex: 1; display: flex; align-items: center; gap: 10px; background: var(--paper); border: 1.5px solid var(--atlas); border-radius: 14px; padding: 12px 16px; }
      .mzi-scan svg { width: 20px; height: 20px; color: var(--atlas); }
      .mzi-scan input { flex: 1; border: none; background: transparent; outline: none; font: inherit; font-size: 15px; color: var(--ink); }
      .mzi-pills { display: flex; gap: 8px; flex-wrap: wrap; padding: 6px 22px; }
      .mzi-pill { border: 1px solid rgba(10,15,13,.14); background: var(--paper); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; cursor: pointer; color: var(--ink); }
      .mzi-pill.on { background: var(--atlas); color: #fff; border-color: var(--atlas); }
      .mzi-kpis { display: flex; gap: 10px; padding: 6px 22px 10px; }
      .mzi-kpi { flex: 1; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
      .mzi-kpi .l { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #77807b; }
      .mzi-kpi .v { font-size: 18px; font-weight: 600; font-family: var(--mono); }
      .mzi-kpi.warn { border-color: #E7B24D; background: #FBF3E2; }
      .mzi-list { padding: 4px 22px; display: flex; flex-direction: column; gap: 8px; }
      .mzi-row { display: flex; align-items: center; gap: 14px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 14px; padding: 12px 16px; cursor: pointer; transition: border-color .15s; }
      .mzi-row:hover { border-color: var(--atlas); }
      .mzi-art { width: 40px; height: 40px; flex: 0 0 40px; color: var(--riad); }
      .mzi-art svg { width: 40px; height: 40px; }
      .mzi-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .mzi-info b { font-size: 14.5px; }
      .mzi-info span { font-size: 12px; color: #77807b; }
      .mzi-stock { font-family: var(--mono); font-size: 15px; font-weight: 600; min-width: 34px; text-align: right; }
      .mzi-stock.bas { color: #B8860B; } .mzi-stock.rupture { color: #9B2F22; }
      .mzi-price { font-family: var(--mono); font-size: 14px; min-width: 90px; text-align: right; }
      .mzi-mini { width: 34px; height: 34px; border-radius: 9px; border: 1px solid rgba(10,15,13,.14); background: var(--paper); cursor: pointer; color: var(--ink); display: inline-flex; align-items: center; justify-content: center; }
      .mzi-mini:hover { background: #f0eee7; } .mzi-mini svg { width: 16px; height: 16px; }
      .mzi-mini.danger { color: #9B2F22; }
      .mz-invm { width: min(720px, 94vw); max-height: 88vh; overflow-y: auto; padding: 0; }
      .mzi-modh { display: flex; align-items: center; gap: 14px; padding: 22px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .mzi-modh h3 { margin: 0; font-size: 18px; } .mzi-modh > div { flex: 1; } .mzi-modh > div span { font-size: 12.5px; color: #77807b; }
      .mzi-vtable-wrap { padding: 8px 24px; }
      .mzi-vtable { width: 100%; border-collapse: collapse; font-size: 13px; }
      .mzi-vtable th { text-align: left; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; padding: 8px 6px; }
      .mzi-vtable td { padding: 9px 6px; border-top: 1px solid rgba(10,15,13,.07); vertical-align: middle; }
      .mzi-dot { display: inline-block; width: 13px; height: 13px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); vertical-align: -1px; margin-right: 6px; }
      .mzi-stk { display: inline-flex; align-items: center; gap: 5px; }
      .mzi-stk input { width: 46px; text-align: center; font-family: var(--mono); font-size: 14px; padding: 5px; border: 1px solid rgba(10,15,13,.16); border-radius: 8px; background: var(--paper); color: var(--ink); }
      .mzi-stk button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(10,15,13,.16); background: var(--paper); cursor: pointer; font-size: 17px; line-height: 1; color: var(--ink); }
      .mzi-bc { display: flex; align-items: center; gap: 8px; }
      .mzi-code { font-family: var(--mono); font-size: 11px; color: #555; display: flex; flex-direction: column; }
      .mzi-code em { font-style: normal; font-size: 8.5px; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; }
      .mzi-code em.gen { color: #0B6E4F; } .mzi-code em.imp { color: #8A6210; }
      .mzi-nocode { color: #99a; font-size: 12px; }
      .mzi-vact { display: flex; gap: 5px; justify-content: flex-end; }
      .mzi-modfoot { display: flex; gap: 8px; padding: 14px 24px 22px; flex-wrap: wrap; }
      .mzi-modfoot .mz-btn.danger { color: #9B2F22; }

      /* Douchette · diagnostic */
      .mz-scan-diag { display: inline-flex; align-items: center; gap: 8px; margin: 12px auto 0; padding: 9px 15px; background: transparent; border: 1px solid var(--n-200, #e7e3da); border-radius: 11px; font: inherit; font-size: 13px; color: var(--n-600, #5d6b63); cursor: pointer; }
      .mz-scan-diag:hover { border-color: var(--atlas); color: var(--atlas); }
      .mz-scan-diag svg { width: 15px; height: 15px; }
      .bqsd { padding: 4px 24px 0; }
      .bqsd-wait { display: flex; align-items: center; gap: 10px; padding: 26px 18px; color: var(--n-500, #7c8a80); background: var(--paper); border-radius: 14px; }
      .bqsd-wait svg { width: 20px; height: 20px; }
      .bqsd-v { padding: 13px 15px; border-radius: 12px; line-height: 1.5; font-size: 14px; }
      .bqsd-v.good { background: rgba(11,110,79,.07); color: var(--riad, #053B2C); }
      .bqsd-v.warn { background: rgba(184,124,32,.09); color: #7a5310; }
      .bqsd-v.bad  { background: rgba(155,47,34,.08); color: #9B2F22; }
      .bqsd-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; margin-top: 12px; }
      .bqsd-grid > div { background: var(--paper); border-radius: 11px; padding: 9px 12px; }
      .bqsd-grid span { display: block; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--n-500, #7c8a80); }
      .bqsd-grid b { font-family: var(--mono, monospace); font-size: 14px; font-weight: 600; word-break: break-all; }
      .bqsd-ok, .bqsd-no { margin-top: 12px; padding: 11px 14px; border-radius: 11px; font-size: 14px; }
      .bqsd-ok { background: rgba(11,110,79,.07); color: var(--riad, #053B2C); }
      .bqsd-no { background: var(--paper); color: var(--n-600, #5d6b63); }
      .bqsd-det { margin-top: 12px; font-size: 13px; }
      .bqsd-det summary { cursor: pointer; color: var(--n-600, #5d6b63); padding: 4px 0; }
      .bqsd-t { width: 100%; border-collapse: collapse; margin-top: 8px; font-family: var(--mono, monospace); font-size: 12px; }
      .bqsd-t th { text-align: left; font-weight: 500; color: var(--n-500, #7c8a80); padding: 4px 8px; border-bottom: 1px solid var(--n-200, #e7e3da); }
      .bqsd-t td { padding: 3px 8px; border-bottom: 1px solid rgba(0,0,0,.04); }
      .mzi-form { padding: 20px 24px 8px; }
      .mzi-fg { margin-bottom: 14px; } .mzi-fg label { display: block; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; margin-bottom: 6px; }
      .mzi-fg input, .mzi-fg select { width: 100%; padding: 11px 13px; border: 1px solid rgba(10,15,13,.16); border-radius: 10px; font: inherit; font-size: 14px; background: var(--paper); color: var(--ink); }
      .mzi-frow { display: flex; gap: 12px; } .mzi-frow .mzi-fg { flex: 1; }
      /* Le sélecteur de couleur vient de color-palette.js (.kc-*) — rien à
         redéfinir ici, c'est tout l'intérêt. Restent la pastille cliquable de la
         ligne variante et le rappel discret de la nuance d'origine. */
      .mzi-cbtn { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; padding: 2px 4px; margin: -2px -4px; border-radius: 7px; font: inherit; color: inherit; cursor: pointer; }
      .mzi-cbtn:hover { background: rgba(125,242,176,.14); }
      .mzi-dashboard-only { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid rgba(10,15,13,.12); border-radius: 9px; background: var(--paper-soft, #f3f1eb); color: #77807b; font: 600 11px var(--sans, sans-serif); white-space: nowrap; }
      .mzi-cbtn.is-locked, .mzi-mini.is-locked { opacity: .72; cursor: not-allowed; }
      .mzi-csrc { font-style: normal; font-size: 11px; opacity: .6; margin-left: 5px; }
      .mzi-iconpick { display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr)); gap: 8px; max-height: 168px; overflow-y: auto; padding: 8px; border: 1px solid rgba(10,15,13,.14); border-radius: 12px; background: var(--paper); }
      .mzi-icon { aspect-ratio: 1; border: 1.5px solid rgba(10,15,13,.10); border-radius: 10px; background: var(--paper); cursor: pointer; padding: 5px; color: var(--riad); display: flex; align-items: center; justify-content: center; }
      .mzi-icon:hover { border-color: rgba(11,110,79,.5); }
      .mzi-icon.on { border-color: var(--atlas); border-width: 2px; background: #EAF5EF; }
      .mzi-icon .mz-art { width: 100%; height: 100%; }
      .mzi-help { font-size: 12px; color: #77807b; margin-top: -6px; margin-bottom: 12px; }
      .mzi-help.is-good { color: var(--atlas); }
      .mzi-help.is-bad  { color: #9B2F22; }
      /* .mzi-help remonte de 6px pour se coller sous un <input> nu ; sous une
         boîte de scan (qui a sa propre bordure) ce retrait la fait chevaucher
         le cadre. */
      .bqx-scanbox + .mzi-help { margin-top: 7px; }
      .mzi-first { padding: 40px 26px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .mzi-first svg { width: 34px; height: 34px; color: var(--atlas); margin-bottom: 4px; }
      .mzi-first b { font-size: 16px; color: var(--ink); }
      .mzi-first span { font-size: 13.5px; color: #6d766f; max-width: 46ch; line-height: 1.55; }
      .mzi-first em { font-style: normal; font-size: 12.5px; color: #8d968f; margin-top: 6px; }

      /* ─── Reprise de stock (saisie à la douchette) ─── */
      .bqx-head { display: flex; align-items: center; gap: 16px; padding: 20px 24px 14px; border-bottom: 1px solid rgba(10,15,13,.08); }
      .bqx-head-t { flex: 1; min-width: 0; }
      .bqx-head-t h3 { margin: 0 0 2px; font-size: 18px; }
      .bqx-head-t span { font-size: 12.5px; color: #77807b; line-height: 1.45; display: block; }
      .bqx-tally { display: flex; align-items: baseline; gap: 6px; background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 12px; padding: 8px 14px; flex: 0 0 auto; }
      .bqx-tally b { font-family: var(--mono); font-size: 19px; font-weight: 600; color: var(--atlas); }
      .bqx-tally span { font-size: 11px; color: #77807b; }
      .bqx-tally i { width: 1px; height: 18px; background: rgba(10,15,13,.12); margin: 0 4px; }
      .bqx-body { padding: 18px 24px 6px; }
      .bqx-scanbox { display: flex; align-items: center; gap: 12px; background: var(--paper); border: 2px solid var(--atlas); border-radius: 14px; padding: 15px 17px; }
      .bqx-scanbox.slim { padding: 11px 14px; border-width: 1.5px; }
      .bqx-scanbox > svg { width: 22px; height: 22px; color: var(--atlas); flex: 0 0 auto; }
      .bqx-scanbox.slim > svg { width: 18px; height: 18px; }
      .bqx-scanbox input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; font: inherit; font-size: 17px; font-family: var(--mono); letter-spacing: .02em; color: var(--ink); }
      .bqx-scanbox.slim input { font-size: 15px; }
      .bqx-mini { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 9px; border: 0; background: var(--atlas); color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      .bqx-mini svg { width: 17px; height: 17px; }
      .bqx-hint { font-size: 12.5px; color: #77807b; margin: 9px 2px 0; line-height: 1.45; }
      .bqx-hint.is-good { color: var(--atlas); }
      .bqx-hint.is-bad  { color: #9B2F22; font-weight: 500; }
      .bqx-hint.is-warn { color: #8A6210; }
      .bqx-alt { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 4px; }
      .bqx-log { display: flex; flex-direction: column; gap: 5px; margin: 14px 0 4px; }
      .bqx-log-row { display: flex; align-items: center; gap: 9px; background: var(--paper); border-radius: 10px; padding: 8px 12px; font-size: 13px; }
      .bqx-log-row svg { width: 15px; height: 15px; flex: 0 0 15px; color: var(--atlas); }
      .bqx-log-row span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .bqx-log-row em { font-style: normal; font-family: var(--mono); font-size: 11px; color: #8d968f; }
      .bqx-log-row.is-erreur svg { color: #9B2F22; }
      .bqx-log-row.is-recu svg { color: #8A6210; }
      .bqx-log-empty { margin: 16px 0 4px; padding: 16px; text-align: center; font-size: 12.5px; color: #8d968f; background: var(--paper); border-radius: 12px; line-height: 1.5; }
      .bqx-found { display: flex; align-items: center; gap: 13px; padding: 15px 24px; }
      .bqx-found svg { width: 22px; height: 22px; flex: 0 0 22px; }
      .bqx-found b { display: block; font-size: 14.5px; }
      .bqx-found.is-new { background: rgba(11,110,79,.06); } .bqx-found.is-new svg { color: var(--atlas); }
      .bqx-found.is-known { background: rgba(184,124,32,.09); } .bqx-found.is-known svg { color: #8A6210; }
      .bqx-found.is-fix { background: rgba(155,47,34,.06); } .bqx-found.is-fix svg { color: #9B2F22; }
      .bqx-codeline { font-family: var(--mono); font-size: 12.5px; color: #5d6b63; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .bqx-sym { font-family: 'Inter Tight', sans-serif; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; font-weight: 700; color: var(--atlas); background: rgba(11,110,79,.10); border-radius: 5px; padding: 2px 6px; }
      .bqx-sym.warn { color: #8A6210; background: rgba(184,124,32,.14); }
      .bqx-form { padding-top: 16px; }
      .bqx-foot { border-top: 1px solid rgba(10,15,13,.08); margin-top: 4px; }
      .bqx-chain { display: flex; align-items: center; gap: 14px; margin: 14px 24px 0; padding: 13px 16px; background: var(--paper); border: 1px dashed rgba(11,110,79,.4); border-radius: 13px; }
      .bqx-chain.is-link { border-style: solid; border-color: rgba(184,124,32,.45); background: rgba(184,124,32,.05); }
      .bqx-chain > div { flex: 1; min-width: 0; }
      .bqx-linklist { display: flex; flex-direction: column; gap: 9px; margin-top: 10px; max-height: 300px; overflow-y: auto; }
      .bqx-linkprod { background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 13px; padding: 11px 13px; }
      .bqx-linkhead { display: flex; align-items: center; gap: 11px; margin-bottom: 8px; }
      .bqx-linkhead .mzi-art, .bqx-linkhead .mzi-art svg { width: 28px; height: 28px; flex: 0 0 28px; }
      .bqx-linkhead > div { flex: 1; min-width: 0; }
      .bqx-linkhead b { display: block; font-size: 14px; }
      .bqx-linkhead span { font-size: 11.5px; color: #77807b; }
      .bqx-chip.is-pick { cursor: pointer; font: inherit; font-size: 12.5px; color: var(--ink); }
      .bqx-chip.is-pick:hover { border-color: var(--atlas); background: rgba(11,110,79,.08); }
      .bqx-chain b { display: block; font-size: 13.5px; }
      .bqx-chain span { font-size: 12px; color: #77807b; line-height: 1.45; }
      .bqx-common { display: flex; align-items: baseline; gap: 10px; margin: 12px 24px 0; padding: 10px 14px; background: var(--paper); border-radius: 11px; }
      .bqx-common span { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; }
      .bqx-common b { font-size: 13.5px; }
      .bqx-known-card { display: flex; align-items: center; gap: 15px; padding: 16px 24px 8px; }
      .bqx-known-card > div { flex: 1; min-width: 0; }
      .bqx-known-card b { font-size: 16px; display: block; }
      .bqx-known-card span { display: block; font-size: 12.5px; color: #77807b; margin-top: 2px; }
      .bqx-thisvar { display: flex !important; align-items: center; gap: 7px; margin-top: 5px !important; }
      .bqx-thisvar i { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); flex: 0 0 12px; }
      .bqx-existing { padding: 8px 24px 4px; }
      .bqx-existing > span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; margin-bottom: 7px; }
      .bqx-chips { display: flex; gap: 6px; flex-wrap: wrap; }
      .bqx-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--paper); border: 1px solid rgba(10,15,13,.10); border-radius: 999px; padding: 5px 11px; font-size: 12.5px; }
      .bqx-chip.on { border-color: var(--atlas); background: rgba(11,110,79,.08); }
      .bqx-chip i { width: 11px; height: 11px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); }
      .bqx-chip b { font-family: var(--mono); font-size: 12px; }
      .bqx-chip em { font-style: normal; color: #8d968f; }
      .bqx-acts { display: flex; flex-direction: column; gap: 9px; padding: 14px 24px 6px; }
      .bqx-act { background: var(--paper); border: 1px solid rgba(10,15,13,.08); border-radius: 13px; padding: 13px 16px; }
      .bqx-act-h { display: flex; align-items: center; gap: 8px; }
      .bqx-act-h svg { width: 16px; height: 16px; color: var(--atlas); }
      .bqx-act-h b { font-size: 13.5px; }
      .bqx-act p { margin: 4px 0 10px; font-size: 12px; color: #77807b; line-height: 1.45; }
      .bqx-qtyrow { display: flex; align-items: center; gap: 7px; }
      .bqx-qtyrow input { width: 62px; text-align: center; font-family: var(--mono); font-size: 16px; padding: 8px; border: 1px solid rgba(10,15,13,.16); border-radius: 9px; background: var(--surface, #fff); color: var(--ink); }
      .bqx-qtyrow .mz-btn { margin-left: 4px; }
      .bqx-pricediff { display: flex; align-items: center; justify-content: center; gap: 18px; padding: 20px 24px; }
      .bqx-pricediff > div { text-align: center; }
      .bqx-pricediff span { display: block; font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: #77807b; }
      .bqx-pricediff b { font-family: var(--mono); font-size: 19px; }
      .bqx-pricediff .next b { color: var(--atlas); }
      .bqx-pricediff > svg { width: 18px; height: 18px; color: #99a; }
      /* Le choix du code-barres à la création — trois options, la lentille liquide
         s'y attache via data-lens-demo / data-lens-item (assets/liquid-lens.js). */
      .bqx-choice { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
      .bqx-opt { position: relative; z-index: 1; text-align: left; background: var(--paper); border: 1.5px solid rgba(10,15,13,.10); border-radius: 12px; padding: 11px 13px; cursor: pointer; font: inherit; color: var(--ink); display: flex; flex-direction: column; gap: 2px; transition: border-color .15s; }
      .bqx-opt:hover { border-color: rgba(11,110,79,.45); }
      .bqx-opt.on { border-color: var(--atlas); background: rgba(11,110,79,.07); }
      .bqx-opt svg { width: 17px; height: 17px; color: var(--atlas); margin-bottom: 3px; }
      .bqx-opt b { font-size: 13px; }
      .bqx-opt span { font-size: 11.5px; color: #77807b; line-height: 1.38; }
      /* Quand la lentille liquide est attachée (assets/liquid-lens.js ajoute
         data-kw-lens), c'est ELLE qui porte le fond — dégradé atlas → riad. La
         pastille passe donc en transparent et son texte en clair, sinon on lit
         de l'encre sombre sur du vert sombre. Le style .on ci-dessus reste le
         repli lisible si la lentille n'est pas chargée. */
      .bqx-choice[data-kw-lens] .bqx-opt.on { background: transparent; border-color: transparent; }
      .bqx-choice[data-kw-lens] .bqx-opt.on b { color: #fff; }
      .bqx-choice[data-kw-lens] .bqx-opt.on span { color: rgba(255,255,255,.82); }
      .bqx-choice[data-kw-lens] .bqx-opt.on svg { color: var(--mint); }
      .bqx-choice .kw-lens { border-radius: 12px; }
      @media (max-width: 620px) {
        .bqx-choice { grid-template-columns: 1fr; }
        .bqx-head { flex-direction: column; align-items: flex-start; gap: 10px; }
      }
    `;
    document.head.appendChild(st);
  }

  /* ─── global keyboard-wedge : a USB scanner types fast + Enter, from anywhere ───
     A HID scanner (USB or Bluetooth — both enumerate as a keyboard, no driver) is
     just a very fast typist. Two things separate it from a human, and we use both:
     speed, and the terminating Enter.

     AZERTY: a scanner ships configured for a US layout and sends US SCANCODES. On
     a French/Moroccan AZERTY till the unshifted number row is & é " ' ( - è _ ç à,
     so reading e.key turned "2000000000015" into "é000000000015" and every scan
     came back "code inconnu" — the classic AZERTY failure in FR/MA shops. e.code
     is the PHYSICAL key and is layout-independent, so digits are read from it.
     That is correct for BOTH configurations: a US-layout scanner sends Digit2 for
     "2", and an AZERTY-configured one sends Shift+Digit2 — e.code is Digit2 either
     way. Letters stay on e.key (for a letter the two configurations genuinely
     disagree, and EAN/UPC/ITF — everything Kiwi prints and nearly all retail
     barcodes — are pure digits, so this is the safe side to err on). */
  /* Same AZERTY damage, other route: when a scan FIELD has focus (the Scan tab
     focuses one on open), the scanner's keystrokes arrive as normal text and the
     browser has already applied the layout — so the box literally contains
     "é000000000015". e.code can't help after the fact, but the corruption is a
     fixed, reversible substitution: the French unshifted number row. Only applied
     when the string is made ENTIRELY of those symbols and carries no digit at all,
     so a genuine alphanumeric code containing a "-" is never touched. */
  const AZ_ROW = { '&': '1', 'é': '2', '"': '3', "'": '4', '(': '5', '-': '6', 'è': '7', '_': '8', 'ç': '9', 'à': '0' };
  function normScan(raw) {
    const s = String(raw || '').trim();
    if (!s || /\d/.test(s)) return s;
    if (!/^[&é"'(\-è_çà]+$/.test(s)) return s;
    return s.replace(/./g, (ch) => AZ_ROW[ch] || ch);
  }
  function wedgeChar(e) {
    const c = e.code || '';
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
    return (e.key && e.key.length === 1) ? e.key : '';
  }
  /* Non-null while the douchette diagnostic is open — see openScannerTest().
   * Declared here rather than beside it because the wedge listener below reads
   * it, and a `let` further down would sit in the temporal dead zone. */
  let scanDiagOff = null;

  function installWedgeScanner() {
    if (installWedgeScanner._done) return;
    installWedgeScanner._done = true;
    /* `started` datait la rafale EN COURS, mais n'était remis à zéro qu'après
     * 120 ms de silence — jamais après un Entrée. Deux scans séparés de moins de
     * 120 ms (un lecteur en mode présentation, ou une reprise de stock menée au
     * rythme) partageaient donc le même `started` : la durée mesurée du second
     * incluait le premier, `span/n` franchissait le seuil des 55 ms/caractère, et
     * la douchette cessait silencieusement d'être reconnue — sans erreur, sans
     * message, les scans suivants disparaissaient. Vu en test : sur une salve
     * continue, tout passait jusqu'au 97e article puis plus rien.
     * `started` est désormais posé au PREMIER caractère de chaque rafale (buf
     * vide), donc chaque scan est chronométré pour lui seul. */
    let buf = '', last = 0, started = 0;
    document.addEventListener('keydown', (e) => {
      if (!document.body.classList.contains('is-pos-maison')) return;
      /* While the diagnostic is open the scan belongs to it and to nothing else.
       * Without this the same keystrokes ALSO ran the normal route — dropping
       * the article on the ticket, or (on an unknown code) switching to the
       * inventory and opening "rattacher ce code". A test must not sell. */
      if (scanDiagOff) return;
      const tag = (e.target && e.target.tagName) || '';
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
      const now = Date.now();
      if (now - last > 120) buf = '';        // rafale abandonnée en cours de route
      last = now;
      if (e.key === 'Enter') {
        const code = buf, span = now - started, n = code.length;
        buf = '';
        /* Average gap per character. A scanner runs ~2-15 ms; sustained sub-55 ms
           is ~220 WPM, which no one types. Without this a human pressing Enter
           after any 4 quick keys fired a phantom scan. */
        const fast = n >= 4 && (span / n) < 55;
        /* Pendant une saisie d'inventaire le scan appartient au formulaire, même
           si le curseur traîne dans un autre champ : sinon les chiffres tombent
           dans « Nom du produit » et l'employé les découvre à l'enregistrement. */
        if (fast && scanCapture) { e.preventDefault(); unleak(e.target, code); handleWedge(code); return; }
        if (fast && !typing) { e.preventDefault(); handleWedge(code); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!buf) started = now;               // premier caractère de CETTE rafale
      buf += wedgeChar(e);
    }, true);
  }
  /* ─── à qui appartient le prochain scan ? ────────────────────────────────────
   * Non-null quand une SAISIE D'INVENTAIRE attend un code (reprise de stock déjà
   * étiqueté, rattachement, réception). Tant que c'est armé, la douchette n'écrit
   * QUE dans ce formulaire.
   *
   * Sans cela le routage ne regardait que `state.view`, et un scan pendant la
   * saisie partait quand même sur le ticket : l'employé qui reprend son stock
   * vendait ses articles un par un sans le voir. La règle du cahier des charges
   * est explicite — scanner pendant la mise en stock ne doit JAMAIS mettre au
   * panier, ni vendre, ni bouger le stock avant confirmation, ni imprimer. */
  let scanCapture = null;
  function armScanCapture(fn) { scanCapture = fn; }
  function disarmScanCapture(fn) { if (!fn || scanCapture === fn) scanCapture = null; }

  /* Les caractères d'une rafale sont tapés au fil de l'eau : seul « Entrée » est
   * interceptable après coup. Si le curseur était dans un autre champ, le code
   * vient de s'y écrire — on retire ce suffixe, et rien d'autre. La comparaison
   * porte sur le brut ET sur la version AZERTY mutilée (&é"' au lieu de 1234),
   * puisque c'est exactement ce que le champ a reçu. */
  function unleak(target, code) {
    if (!target || target.value == null || typeof target.value !== 'string') return;
    const val = target.value;
    const az = Object.entries(AZ_ROW).reduce((s, [ch, d]) => s.split(d).join(ch), code);
    for (const tail of [code, az]) {
      if (tail && val.length >= tail.length && val.slice(-tail.length) === tail) {
        target.value = val.slice(0, -tail.length);
        return;
      }
    }
  }

  function handleWedge(code) {
    if (scanCapture) { try { scanCapture(code); } catch (_) {} return; }  /* saisie inventaire */
    if (state.view === 'inventaire') { invScanHandle(code); return; }   /* fiche stock */
    if (state.view === 'scan') { lookupScan(code); return; }            /* vérif prix/stock */
    commitEan(code);                                                    /* vente → ticket */
  }

  /* ─── Douchette · diagnostic ─────────────────────────────────────────────
   * "La douchette ne marche pas" is, at the counter, always one of five things,
   * and from the merchant's side they look identical — nothing happens:
   *   1. the device sends nothing at all (cable/HID mode),
   *   2. it types through a keyboard layout that mangles the digits (a US-mode
   *      scanner on a French Windows sends &é"' where we expect 1234),
   *   3. it never sends the Enter suffix, so no scan is ever committed,
   *   4. it is genuinely too slow / it was a human typing,
   *   5. it reads perfectly and the code simply is not in the catalogue yet.
   * Guessing between those costs a shop visit. This captures one raw burst and
   * names which one it is. It also dumps code→key per character, because that
   * is the only way to tell a US-mode scanner from a locale-matched one — and
   * that determines whether letters (Code 128) need the same fix digits got. */
  function openScannerTest() {
    let ev = [], last = 0, burst = null;

    const finish = () => {
      const chars = ev.filter((x) => x.ch !== '');
      const raw = chars.map((x) => x.ch).join('');
      /* What the OS actually delivered, before wedgeChar() reads the key by its
       * physical position. On a US-mode scanner plugged into a French Windows
       * these differ (é000000000&( vs 2000000000015) — and that difference is
       * the ONLY way to show the merchant that a layout fix happened, since
       * `raw` is already corrected by the time we see it. */
      const typed = chars.map((x) => (x.key && x.key.length === 1) ? x.key : '').join('');
      burst = {
        ev: ev.slice(), raw, typed, norm: normScan(raw),
        n: chars.length,
        span: ev.length ? (ev[ev.length - 1].t - ev[0].t) : 0,
        enter: ev.some((x) => x.key === 'Enter'),
      };
      ev = [];
      paint();
    };

    const onKey = (e) => {
      const now = Date.now();
      if (now - last > 400) ev = [];       // new burst
      last = now;
      if (e.key === 'Enter') {
        e.preventDefault();
        ev.push({ code: e.code || '', key: 'Enter', ch: '', t: now });
        finish();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      ev.push({ code: e.code || '', key: e.key, ch: wedgeChar(e), shift: !!e.shiftKey, t: now });
      // A scanner with no Enter suffix never calls finish() — settle it ourselves.
      clearTimeout(onKey._t);
      onKey._t = setTimeout(() => { if (ev.length) finish(); }, 500);
    };

    function verdict(b) {
      if (!b) return null;
      if (!b.n) return { tone: 'bad', t: 'Aucun caractère reçu. La douchette n\'est pas vue comme un clavier : vérifiez le câble USB, ou remettez-la en mode « HID / clavier » avec son code de configuration.' };
      const perChar = b.n > 1 ? b.span / b.n : 0;
      if (!b.enter) return { tone: 'warn', t: `${b.n} caractères lus, mais aucune touche Entrée. Kiwi valide un scan sur Entrée : configurez le suffixe « CR / Entrée » de la douchette (code de configuration dans sa notice).` };
      if (b.n >= 4 && perChar >= 55) return { tone: 'warn', t: `Lecture correcte mais lente (${Math.round(perChar)} ms/caractère). À cette vitesse Kiwi la prend pour une saisie au clavier. Si c'est bien la douchette, dites-le-nous, on relèvera le seuil.` };
      if (b.typed && b.typed !== b.raw) return { tone: 'good', t: `Douchette détectée. Elle est en clavier US sur un Windows français — Kiwi corrige toute seule (${esc(b.typed)} → ${esc(b.norm)}). Il n'y a rien à reconfigurer sur la douchette.` };
      return { tone: 'good', t: `Douchette détectée et lue correctement (${Math.round(perChar)} ms/caractère).` };
    }

    function match(code) {
      if (!code) return '';
      const cat = window.KiwiBoutiqueCatalog;
      const hit = cat && cat.resolveScan ? cat.resolveScan(code) : null;
      const pid = hit ? hit.pid : BY_EAN[code];
      if (pid && P[pid]) return `<div class="bqsd-ok">Article trouvé : <b>${esc(P[pid].name)}</b></div>`;
      return `<div class="bqsd-no">Code lu correctement, mais aucun article ne le porte encore. Enregistrez-le depuis l'inventaire.</div>`;
    }

    function paint() {
      const b = burst, v = verdict(b);
      const sym = (b && b.norm && window.KiwiBarcode && window.KiwiBarcode.detect) ? window.KiwiBarcode.detect(b.norm) : '';
      const rows = b ? b.ev.filter((x) => x.key !== 'Enter').map((x) =>
        `<tr><td>${esc(x.code || '—')}</td><td>${esc(x.key)}</td><td>${esc(x.ch || '—')}</td></tr>`).join('') : '';
      invSetModal(`
        <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
        <div class="mzi-modh"><div><h3>Test de la douchette</h3><span>Scannez n'importe quel article. Rien n'est vendu, rien n'est modifié.</span></div></div>
        <div class="bqsd">
          ${!b ? `<div class="bqsd-wait"><i data-lucide="scan-line"></i>En attente d'un scan…</div>` : `
            <div class="bqsd-v ${v.tone}">${v.t}</div>
            <div class="bqsd-grid">
              <div><span>Code lu</span><b>${esc(b.norm) || '—'}</b></div>
              <div><span>Caractères</span><b>${b.n}</b></div>
              <div><span>Vitesse</span><b>${b.n > 1 ? Math.round(b.span / b.n) + ' ms/car.' : '—'}</b></div>
              <div><span>Touche Entrée</span><b>${b.enter ? 'oui' : 'non'}</b></div>
              <div><span>Symbologie</span><b>${esc(sym || '—')}</b></div>
              <div><span>Frappe clavier</span><b>${esc(b.typed) || '—'}</b></div>
            </div>
            ${b.n ? match(b.norm) : ''}
            <details class="bqsd-det"><summary>Détail touche par touche</summary>
              <table class="bqsd-t"><thead><tr><th>code physique</th><th>caractère reçu</th><th>lu par Kiwi</th></tr></thead><tbody>${rows}</tbody></table>
            </details>`}
        </div>
        <div class="mzi-modfoot">
          <button class="mz-btn secondary" id="bqsd-copy">Copier le diagnostic</button>
          <button class="mz-btn" data-inv-x>Terminer</button>
        </div>`, (el) => {
        const cp = $('#bqsd-copy', el);
        if (cp) cp.onclick = () => {
          const txt = JSON.stringify({ ua: navigator.userAgent, burst: burst && { raw: burst.raw, norm: burst.norm, n: burst.n, span: burst.span, enter: burst.enter, ev: burst.ev.map((x) => [x.code, x.key, x.ch]) } }, null, 1);
          (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
            () => toast('Diagnostic copié'), () => toast('Copie impossible sur cet appareil'));
        };
      });
    }

    if (scanDiagOff) scanDiagOff();
    document.addEventListener('keydown', onKey, true);
    // The panel must keep listening while it is open, and stop the moment the
    // veil closes — by the X, the footer button, Escape or a click outside.
    const veil = $('#mz-inv-veil', root);
    const obs = veil ? new MutationObserver(() => {
      if (!veil.classList.contains('is-open') && scanDiagOff) scanDiagOff();
    }) : null;
    if (obs) obs.observe(veil, { attributes: true, attributeFilter: ['class'] });
    scanDiagOff = () => {
      document.removeEventListener('keydown', onKey, true);
      clearTimeout(onKey._t);
      if (obs) obs.disconnect();
      scanDiagOff = null;
    };
    paint();
  }
  function invScanHandle(raw) {
    const code = normScan(raw);
    const cat = catDB(); if (!cat) return;
    const hit = cat.findByBarcode(code);
    if (hit) { toast(`${hit.product.name} · ${hit.variant.colorLabel} ${hit.variant.size}`); openInvProduct(hit.product.id); return; }
    /* Code inconnu depuis l'inventaire : c'est presque toujours un article que la
       boutique possède mais que Kiwi ne connaît pas encore. On ouvre la reprise
       de stock avec ce code, où il peut devenir un nouvel article OU une
       déclinaison du précédent — l'ancien sélecteur, lui, exigeait de choisir un
       produit déjà existant et ne savait pas en créer. */
    toast(`Code ${code} inconnu, à enregistrer`);
    intakeStartWith(code);
  }

  /* Entrer dans la reprise avec un code déjà lu (scan depuis l'inventaire). */
  function intakeStartWith(raw) {
    if (!catDB()) { toast('Base d\'inventaire indisponible'); return; }
    if (state.view !== 'inventaire') switchView('inventaire');
    if (!intake.open) { intake.open = true; intakeReset(); }
    intakeTake(raw);
  }

  /* ═══════════════════════ PROMOTIONS ═══════════════════════
   * L'écran où le magasin décide de ses prix. La règle vit dans
   * assets/promos.js ; ici on ne fait que la composer et la montrer.
   *
   * Le pari de cet écran : un commerçant ne crée pas une promotion « en
   * pourcentage sur une catégorie » — il veut « écouler les caftans d'été » ou
   * « vider ce qui traîne depuis six mois ». Les cibles sont donc écrites dans
   * ces mots-là, et l'aperçu chiffre la décision AVANT de l'enregistrer :
   * combien d'articles, combien ça coûte, combien passeraient sous le prix
   * d'achat. Une promotion qu'on enregistre sans savoir ce qu'elle touche est
   * une promotion qu'on découvre au comptoir, article par article. */

  const PRM = () => window.KiwiPromos || null;
  const promoState = { filter: 'active' };

  const PROMO_DAY = 86400000;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };

  /* La cible, écrite comme le commerçant la dirait à voix haute. Un « scope.type
     = avant » affiché tel quel n'apprend rien à personne. */
  function promoScopeText(p) {
    const sc = p.scope || {};
    if (sc.type === 'tout') return 'Tout le magasin';
    if (sc.type === 'rayon') {
      const names = (sc.ids || []).map((id) => (RAYONS.find((r) => r.id === id) || {}).label).filter(Boolean);
      if (!names.length) return 'Aucun rayon choisi';
      return names.length <= 2 ? names.join(' et ') : `${names[0]} et ${names.length - 1} autres rayons`;
    }
    if (sc.type === 'produits') {
      const n = (sc.ids || []).length;
      if (!n) return 'Aucun article choisi';
      if (n === 1) { const it = P[sc.ids[0]]; return it ? it.name : '1 article'; }
      return `${n} articles choisis`;
    }
    if (sc.type === 'avant') return sc.before ? `Entré en stock avant le ${fmtDay(new Date(sc.before))}` : 'Aucune date choisie';
    if (sc.type === 'stock') return `Il en reste ${sc.max || 0} ou moins`;
    return '—';
  }

  /* La période, en clair, avec ce qu'il reste à courir. « du 12 au 19 » ne dit
     pas si c'est fini ; « se termine dans 3 jours » se lit d'un coup d'œil. */
  function promoWhenText(p, now) {
    now = now || Date.now();
    const st = PRM().status(p, now);
    if (st === 'paused') return 'En pause, aucun prix n\'est modifié';
    if (st === 'scheduled') {
      const j = Math.ceil((p.from - now) / PROMO_DAY);
      return `Démarre ${j <= 1 ? 'demain' : `dans ${j} jours`} · ${fmtDay(new Date(p.from))}`;
    }
    if (st === 'ended') return `Terminée le ${fmtDay(new Date(p.to))}`;
    if (!p.to) return 'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez';
    const left = p.to - now;
    if (left < 2 * 3600000) return `Se termine à ${fmtHM(new Date(p.to))}`;
    const j = Math.ceil(left / PROMO_DAY);
    return j <= 1 ? `Se termine aujourd'hui à ${fmtHM(new Date(p.to))}` : `Se termine dans ${j} jours · ${fmtDay(new Date(p.to))}`;
  }

  /* Le catalogue vu comme une liste plate — ce que preview() attend. */
  const promoItems = () => Object.keys(P).filter((k) => P[k] && P[k].id === k).map((k) => P[k]);

  function promoCount(p) {
    const pr = PRM();
    if (!pr) return 0;
    return pr.preview(p, promoItems(), { stockOf: (it) => stockOf(it) }).count;
  }

  function renderPromos() {
    const pr = PRM();
    const el = $('[data-mz-panel="promotions"]', root);
    if (!pr) {
      el.innerHTML = `<div class="mz-pr-wrap"><div class="mz-pr-empty"><i data-lucide="tag"></i>
        <div><b>Promotions indisponibles</b><span>Le module de promotions n'a pas été chargé sur cette caisse.</span></div></div></div>`;
      icons(); return;
    }
    const now = Date.now();
    const all = pr.list();
    const st = pr.stats(now);
    /* En pause et programmée vivent dans le même onglet « à venir » : ce sont
       les deux façons d'avoir une promotion prête qui ne s'applique pas encore. */
    const groups = {
      active: all.filter((p) => pr.status(p, now) === 'active'),
      soon: all.filter((p) => ['scheduled', 'paused'].indexOf(pr.status(p, now)) >= 0),
      ended: all.filter((p) => pr.status(p, now) === 'ended'),
    };
    const shown = groups[promoState.filter] || groups.active;

    /* Ce que les promotions ont coûté aujourd'hui — la seule mesure qui dit si
       elles marchent. Lue sur les ventes du jour, pas estimée. */
    const offToday = salesToday().reduce((s, x) => s + (+x.promoOff || 0), 0);
    const touched = groups.active.length ? promoArticleCount(groups.active) : 0;
    const sub = [
      `${st.active} promotion${st.active > 1 ? 's' : ''} en cours`,
      touched ? `${touched} article${touched > 1 ? 's' : ''} remisé${touched > 1 ? 's' : ''}` : null,
      offToday ? `${fmtMAD(offToday)} offerts aujourd'hui` : null,
    ].filter(Boolean).join(' · ');

    el.innerHTML = `
      <div class="mz-pr-wrap">
        <header class="mz-head">
          <div><h1>Promotions</h1><div class="mz-head-sub">${esc(sub)}</div></div>
          <button class="mz-btn primary mz-pr-new" id="mz-pr-new"><i data-lucide="plus"></i>Nouvelle promotion</button>
        </header>

        ${all.length ? `
        <div class="mz-seg mz-pr-seg" data-lens-demo id="mz-pr-filter">
          <button class="mz-seg-it ${promoState.filter === 'active' ? 'on' : ''}" data-lens-item data-prf="active">En cours<small>${groups.active.length}</small></button>
          <button class="mz-seg-it ${promoState.filter === 'soon' ? 'on' : ''}" data-lens-item data-prf="soon">À venir<small>${groups.soon.length}</small></button>
          <button class="mz-seg-it ${promoState.filter === 'ended' ? 'on' : ''}" data-lens-item data-prf="ended">Terminées<small>${groups.ended.length}</small></button>
        </div>` : ''}

        ${all.length ? (shown.length ? `
        <div class="mz-pr-list">
          ${shown.map((p) => promoCardHtml(p, now)).join('')}
        </div>` : `
        <div class="mz-pr-empty soft"><i data-lucide="tag"></i>
          <div><b>Rien ici</b><span>${promoState.filter === 'active' ? 'Aucune promotion ne tourne en ce moment.' : promoState.filter === 'soon' ? 'Aucune promotion en attente.' : 'Aucune promotion terminée.'}</span></div>
        </div>`) : promoEmptyHtml()}
      </div>`;

    $('#mz-pr-new', el).onclick = () => openPromoComposer(null);
    const seg = $('#mz-pr-filter', el);
    if (seg) seg.onclick = (e) => {
      const b = e.target.closest('[data-prf]');
      if (!b) return;
      promoState.filter = b.dataset.prf;
      renderPromos();
    };
    $$('[data-pr-starter]', el).forEach((b) => {
      b.onclick = () => openPromoComposer(promoStarter(b.dataset.prStarter));
    });
    $$('[data-pr-edit]', el).forEach((b) => { b.onclick = () => openPromoComposer(pr.get(b.dataset.prEdit)); });
    $$('[data-pr-toggle]', el).forEach((b) => {
      b.onclick = () => {
        const p = pr.get(b.dataset.prToggle); if (!p) return;
        pr.setPaused(p.id, !p.paused);
        toast(p.paused ? `${p.name} reprend` : `${p.name} en pause, les prix repassent au plein tarif`);
        renderPromos(); renderGrid(); renderBadges(); icons(); lens();
      };
    });
    $$('[data-pr-print]', el).forEach((b) => { b.onclick = () => openPromoLabels(b.dataset.prPrint); });
    $$('[data-pr-del]', el).forEach((b) => { b.onclick = () => confirmPromoDelete(b.dataset.prDel); });
    icons(); lens();
  }

  /* Combien d'articles portent une étiquette promo en ce moment, sans les
     compter deux fois quand deux promotions visent le même. */
  function promoArticleCount(running) {
    const seen = new Set();
    const items = promoItems();
    running.forEach((p) => {
      items.forEach((it) => { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); });
    });
    return seen.size;
  }

  function promoCardHtml(p, now) {
    const pr = PRM();
    const st = pr.status(p, now);
    const n = promoCount(p);
    const tone = st === 'active' ? 'on' : st === 'ended' ? 'off' : 'wait';
    return `
      <article class="mz-pr-card is-${tone}">
        <div class="mz-pr-ribbon"><b>${esc(pr.badgeOf(p))}</b><span>${p.kind === 'fixed' ? 'prix fixe' : 'de remise'}</span></div>
        <div class="mz-pr-body">
          <div class="mz-pr-top">
            <h3>${esc(p.name)}</h3>
            <span class="mz-pr-state ${tone}">${st === 'active' ? 'En cours' : st === 'scheduled' ? 'Programmée' : st === 'paused' ? 'En pause' : 'Terminée'}</span>
          </div>
          <div class="mz-pr-meta">
            <span><i data-lucide="target"></i>${esc(promoScopeText(p))}</span>
            <span><i data-lucide="clock"></i>${esc(promoWhenText(p, now))}</span>
          </div>
          <div class="mz-pr-foot">
            <span class="mz-pr-n">${n} article${n > 1 ? 's' : ''} concerné${n > 1 ? 's' : ''}</span>
            <span class="mz-pr-acts">
              ${n ? `<button class="mzi-mini" data-pr-print="${esc(p.id)}" title="Imprimer les étiquettes de cette promotion"><i data-lucide="printer"></i></button>` : ''}
              ${st !== 'ended' ? `<button class="mzi-mini" data-pr-toggle="${esc(p.id)}" title="${p.paused ? 'Reprendre' : 'Mettre en pause'}"><i data-lucide="${p.paused ? 'play' : 'pause'}"></i></button>` : ''}
              <button class="mzi-mini" data-pr-edit="${esc(p.id)}" title="Modifier"><i data-lucide="pencil"></i></button>
              <button class="mzi-mini danger" data-pr-del="${esc(p.id)}" title="Supprimer"><i data-lucide="trash-2"></i></button>
            </span>
          </div>
        </div>
      </article>`;
  }

  /* L'écran vide APPREND la fonctionnalité au lieu de la décrire. Trois
     promotions réelles, prêtes en un geste, qui couvrent les trois raisons pour
     lesquelles une boutique baisse ses prix : écouler l'ancien, finir les
     séries, faire venir du monde. Le commerçant touche, ajuste, enregistre. */
  const PROMO_STARTERS = {
    destock: { name: 'Déstockage', kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6,
               title: 'Déstocker l\'ancienne saison', desc: 'Tout ce qui est en stock depuis plus de six mois, −30 %' },
    finserie: { name: 'Fins de série', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 },
               title: 'Écouler les fins de série', desc: 'Les articles où il reste 5 pièces ou moins, −20 %' },
    weekend: { name: 'Week-end', kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2,
               title: 'Animer le week-end', desc: 'Tout le magasin, −10 %, jusqu\'à dimanche soir' },
  };
  function promoStarter(key) {
    const s = PROMO_STARTERS[key];
    if (!s) return null;
    const now = Date.now();
    const p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(now - s.months * 30 * PROMO_DAY));
    if (s.days) p.to = endOfDay(new Date(now + s.days * PROMO_DAY));
    return p;
  }
  function promoEmptyHtml() {
    return `
      <div class="mz-pr-zero">
        <div class="mz-pr-zero-head">
          <i data-lucide="tag"></i>
          <h2>Baissez vos prix une fois, la caisse s'en souvient</h2>
          <p>Une promotion s'applique toute seule aux articles que vous visez, pendant la durée que vous fixez.
             Les étiquettes, la grille de vente et le reçu de la cliente suivent sans un geste de plus.</p>
        </div>
        <div class="mz-pr-starters">
          ${Object.keys(PROMO_STARTERS).map((k) => `
            <button class="mz-pr-starter" data-pr-starter="${k}">
              <b>${esc(PROMO_STARTERS[k].title)}</b>
              <span>${esc(PROMO_STARTERS[k].desc)}</span>
              <i data-lucide="arrow-right"></i>
            </button>`).join('')}
        </div>
      </div>`;
  }

  /* ─── réimprimer le rayon d'une promotion ────────────────────────────────
   * Le geste qui manquait entre « je lance ma promotion » et « mes étiquettes
   * disent le bon prix ». labelForVariant() pose déjà le prix promo et l'ancien
   * barré (voir plus bas) ; ce qui manquait, c'était de pouvoir sortir d'un coup
   * les étiquettes des articles que CETTE promotion touche, sans rouvrir
   * l'inventaire produit par produit pour les retrouver à la main.
   *
   * Deux filtres, tous deux volontaires :
   *  · pas de code-barres → pas d'étiquette. On ne peut pas imprimer une
   *    étiquette scannable pour une déclinaison qui n'a pas de code.
   *  · stock à zéro → pas d'étiquette. Une étiquette de promotion sur une
   *    étagère vide ne sert à rien, et sur un magasin entier ça peut faire des
   *    dizaines de vignettes jetées.
   * Le total est ANNONCÉ avant impression : une promotion « tout le magasin »
   * peut représenter plusieurs centaines de vignettes, et on ne découvre pas ça
   * au bruit de l'imprimante. */
  function promoLabelPlan(id) {
    const pr = PRM(); const p = pr && pr.get(id);
    const cat = catDB();
    const out = { promo: p, labels: [], products: 0, skippedNoCode: 0, skippedEmpty: 0 };
    if (!p || !cat) return out;
    promoItems().forEach((item) => {
      if (!pr.matches(p, item, stockOf(item))) return;
      const d = cat.getProduct(item.id);
      if (!d) return;
      let taken = 0;
      d.variants.forEach((v) => {
        if (!(v.stock > 0)) { out.skippedEmpty++; return; }
        const l = labelForVariant(item.id, v);
        if (!l) { out.skippedNoCode++; return; }
        out.labels.push(l); taken++;
      });
      if (taken) out.products++;
    });
    return out;
  }

  function openPromoLabels(id) {
    const plan = promoLabelPlan(id);
    if (!plan.promo) return;
    const el = $('#mz-promomm', root);
    const n = plan.labels.length;
    const notes = [];
    if (plan.skippedEmpty) notes.push(`${plan.skippedEmpty} déclinaison${plan.skippedEmpty > 1 ? 's' : ''} épuisée${plan.skippedEmpty > 1 ? 's' : ''}, sans étiquette`);
    if (plan.skippedNoCode) notes.push(`${plan.skippedNoCode} sans code-barres, générez-en un depuis l'inventaire`);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Étiquettes · ${esc(plan.promo.name)}</h3>
      ${n ? `
        <p class="modal-subtle">Chaque étiquette portera le prix promotionnel, l'ancien prix barré à côté.
           Quand la promotion s'arrêtera, réimprimez pour revenir au prix plein.</p>
        <div class="mz-prl">
          <div class="mz-prl-n"><b>${n}</b><span>étiquette${n > 1 ? 's' : ''}</span></div>
          <div class="mz-prl-d">
            <span>${plan.products} article${plan.products > 1 ? 's' : ''} concerné${plan.products > 1 ? 's' : ''}</span>
            ${notes.map((t) => `<span class="note">${esc(t)}</span>`).join('')}
          </div>
        </div>
        ${n > 60 ? `<div class="mz-prc-warn"><i data-lucide="alert-triangle"></i>
          <span>C'est un gros tirage. Vérifiez le rouleau avant de lancer.</span></div>` : ''}
      ` : `
        <p class="modal-subtle">Aucune étiquette à imprimer pour cette promotion : les articles visés n'ont pas de
           code-barres, ou il n'en reste aucun en stock.${plan.skippedNoCode ? ' Générez leurs codes depuis l\'inventaire.' : ''}</p>`}
      <div class="mzi-modfoot">
        <button class="mz-btn secondary" data-mz-close>${n ? 'Annuler' : 'Fermer'}</button>
        ${n ? `<button class="mz-btn primary" id="mz-prl-go"><i data-lucide="printer"></i>Imprimer ${n} étiquette${n > 1 ? 's' : ''}</button>` : ''}
      </div>`;
    openVeil('#mz-promo-veil'); icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-promo-veil'); });
    const go = $('#mz-prl-go', el);
    if (go) go.onclick = () => {
      closeVeil('#mz-promo-veil');
      labelToast(window.KiwiBarcode.printLabels(plan.labels, { copies: 1 }), `${n} étiquette${n > 1 ? 's' : ''}`);
    };
  }

  function confirmPromoDelete(id) {
    const pr = PRM(); const p = pr.get(id); if (!p) return;
    const el = $('#mz-promomm', root);
    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Supprimer « ${esc(p.name)} » ?</h3>
      <p class="modal-subtle">Les articles concernés repassent immédiatement au prix plein.
         Les ventes déjà encaissées gardent le prix payé — rien ne change dans le journal.</p>
      <div class="mzi-modfoot">
        <button class="mz-btn secondary" data-mz-close>Garder</button>
        <button class="mz-btn danger" id="mz-pr-delok"><i data-lucide="trash-2"></i>Supprimer</button>
      </div>`;
    openVeil('#mz-promo-veil'); icons();
    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-promo-veil'); });
    $('#mz-pr-delok', el).onclick = () => {
      pr.remove(id);
      closeVeil('#mz-promo-veil');
      toast(`${p.name} supprimée, prix pleins rétablis`);
      renderPromos(); renderGrid(); renderBadges(); icons();
    };
  }

  /* ─── le compositeur ─────────────────────────────────────────────────────
     Un seul écran, pas d'assistant en trois étapes : les trois décisions
     (combien, sur quoi, jusqu'à quand) se répondent l'une l'autre, et un
     assistant qui les sépare oblige à revenir en arrière pour comprendre ce
     qu'on vient de faire. L'aperçu se recalcule à chaque frappe. */
  const composer = { draft: null, editing: null };

  function openPromoComposer(seed) {
    const pr = PRM(); if (!pr) return;
    composer.editing = (seed && seed.id) ? seed.id : null;
    composer.draft = pr.normalize(seed || { name: '', kind: 'percent', value: 20, scope: { type: 'tout' } });
    if (!seed) composer.draft.name = '';
    renderPromoComposer();
    openVeil('#mz-promo-veil');
    icons(); lens();
  }

  const PROMO_SCOPES = [
    { id: 'tout', label: 'Tout le magasin', icon: 'store' },
    { id: 'rayon', label: 'Un rayon', icon: 'layout-grid' },
    { id: 'produits', label: 'Des articles', icon: 'shirt' },
    { id: 'avant', label: 'Ancien stock', icon: 'calendar-clock' },
    { id: 'stock', label: 'Fin de série', icon: 'package-minus' },
  ];

  function promoDraftValid(d) {
    if (!d.value) return 'Choisissez de combien vous baissez le prix';
    const sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return 'Choisissez au moins un élément à viser';
    if (sc.type === 'avant' && !sc.before) return 'Choisissez la date avant laquelle les articles sont visés';
    if (sc.type === 'stock' && !sc.max) return 'Indiquez à partir de combien de pièces l\'article est visé';
    if (d.to && d.from && d.to <= d.from) return 'La date de fin doit venir après le début';
    return '';
  }

  const toInput = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

  function renderPromoComposer() {
    const pr = PRM();
    const d = composer.draft;
    const el = $('#mz-promomm', root);
    const prev = pr.preview(d, promoItems(), { stockOf: (it) => stockOf(it) });
    const problem = promoDraftValid(d);
    const sc = d.scope || {};

    el.innerHTML = `
      <button class="mz-modal-x" data-mz-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${composer.editing ? 'Modifier la promotion' : 'Nouvelle promotion'}</h3>

      <div class="mz-prc">
        <div class="mz-prc-form">

          <div class="mz-f">
            <div class="mz-f-lbl">Nom <span class="opt">· ce que la cliente lira sur son reçu</span></div>
            <input class="mz-input" id="mz-prc-name" maxlength="80" placeholder="Soldes d'été, Déstockage caftans…" value="${esc(d.name)}" />
          </div>

          <div class="mz-f">
            <div class="mz-f-lbl">De combien</div>
            <div class="mz-seg" data-lens-demo id="mz-prc-kind">
              <button class="mz-seg-it ${d.kind === 'percent' ? 'on' : ''}" data-lens-item data-prk="percent">En pourcentage<small>−20 %</small></button>
              <button class="mz-seg-it ${d.kind === 'amount' ? 'on' : ''}" data-lens-item data-prk="amount">En dirhams<small>−50 MAD</small></button>
              <button class="mz-seg-it ${d.kind === 'fixed' ? 'on' : ''}" data-lens-item data-prk="fixed">Prix fixe<small>tout à 99</small></button>
            </div>
            <div class="mz-prc-val">
              <input class="mz-input" id="mz-prc-value" type="number" min="0" inputmode="numeric" value="${d.value}" />
              <span class="unit">${d.kind === 'percent' ? '%' : 'MAD'}</span>
              <div class="mz-chips" id="mz-prc-quick">
                ${(d.kind === 'percent' ? [10, 20, 30, 50] : d.kind === 'amount' ? [20, 50, 100, 200] : [49, 99, 149, 199]).map((v) =>
                  `<button class="mz-chip ${d.value === v ? 'on' : ''}" data-prv="${v}">${d.kind === 'percent' ? `−${v} %` : d.kind === 'amount' ? `−${v}` : v}</button>`).join('')}
              </div>
            </div>
          </div>

          <div class="mz-f">
            <div class="mz-f-lbl">Sur quoi</div>
            <div class="mz-prc-scopes" id="mz-prc-scope">
              ${PROMO_SCOPES.map((s) => `
                <button class="mz-prc-scope ${sc.type === s.id ? 'on' : ''}" data-prs="${s.id}">
                  <i data-lucide="${s.icon}"></i><span>${esc(s.label)}</span>
                </button>`).join('')}
            </div>
            <div class="mz-prc-scopebody" id="mz-prc-scopebody">${promoScopeControl(d)}</div>
          </div>

          <div class="mz-f">
            <div class="mz-f-lbl">Jusqu'à quand</div>
            <div class="mz-chips" id="mz-prc-when">
              ${[
                { k: 'today', l: 'Aujourd\'hui' }, { k: 'we', l: 'Ce week-end' },
                { k: '7', l: '7 jours' }, { k: '30', l: '30 jours' }, { k: 'none', l: 'Sans fin' },
              ].map((o) => `<button class="mz-chip" data-prw="${o.k}">${o.l}</button>`).join('')}
            </div>
            <div class="mz-row-2 mz-prc-dates">
              <div class="mz-f">
                <div class="mz-f-lbl">Début <span class="opt">· vide = tout de suite</span></div>
                <input class="mz-input" id="mz-prc-from" type="date" value="${toInput(d.from)}" />
              </div>
              <div class="mz-f">
                <div class="mz-f-lbl">Fin <span class="opt">· vide = sans fin</span></div>
                <input class="mz-input" id="mz-prc-to" type="date" value="${toInput(d.to)}" />
              </div>
            </div>
          </div>
        </div>

        <aside class="mz-prc-prev">
          <div class="mz-prc-prev-head">
            <span class="lbl">Ce que ça touche</span>
            <b class="n">${prev.count}</b>
            <span class="u">article${prev.count > 1 ? 's' : ''}</span>
          </div>
          ${prev.count ? `
            <div class="mz-prc-swap">
              <div><span>Valeur au prix plein</span><b>${fmtMAD(prev.from)}</b></div>
              <i data-lucide="arrow-right"></i>
              <div class="next"><span>Au prix promo</span><b>${fmtMAD(prev.to)}</b></div>
            </div>
            <div class="mz-prc-give">Vous offrez <b>${fmtMAD(prev.from - prev.to)}</b> si tout part.</div>
            ${prev.under ? `
              <div class="mz-prc-warn"><i data-lucide="alert-triangle"></i>
                <span><b>${prev.under} article${prev.under > 1 ? 's passeraient' : ' passerait'} sous son prix d'achat.</b>
                Déstocker à perte est parfois le bon choix — mais autant le décider en le sachant.</span>
              </div>` : ''}
            <div class="mz-prc-sample">
              ${prev.sample.map((x) => `
                <div class="mz-prc-srow ${x.under ? 'is-under' : ''}">
                  <span class="nm">${esc(x.name)}</span>
                  <span class="pz"><s>${fmtMAD(x.was)}</s><b>${fmtMAD(x.price)}</b></span>
                </div>`).join('')}
              ${prev.count > prev.sample.length ? `<div class="mz-prc-more">et ${prev.count - prev.sample.length} autre${prev.count - prev.sample.length > 1 ? 's' : ''}…</div>` : ''}
            </div>` : `
            <div class="mz-prc-none"><i data-lucide="search-x"></i>
              <span>${esc(problem || 'Aucun article ne correspond à cette cible.')}</span>
            </div>`}
        </aside>
      </div>

      <div class="mzi-modfoot mz-prc-foot">
        ${problem ? `<span class="mz-prc-block"><i data-lucide="info"></i>${esc(problem)}</span>` : '<span></span>'}
        <span class="acts">
          <button class="mz-btn secondary" data-mz-close>Annuler</button>
          <button class="mz-btn primary" id="mz-prc-save" ${problem || !prev.count ? 'disabled' : ''}>
            <i data-lucide="check"></i>${composer.editing ? 'Enregistrer' : 'Lancer la promotion'}
          </button>
        </span>
      </div>`;

    icons(); lens();
    wirePromoComposer(el);
  }

  function promoScopeControl(d) {
    const sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="mz-prc-hint">Chaque article du magasin, sans exception.</div>';
    if (sc.type === 'rayon') {
      return `<div class="mz-chips wrap" id="mz-prc-rayons">
        ${RAYONS.map((r) => `<button class="mz-chip ${(sc.ids || []).indexOf(r.id) >= 0 ? 'on' : ''}" data-prr="${esc(r.id)}">${esc(r.label)}<small>${r.items.length}</small></button>`).join('')}
      </div>`;
    }
    if (sc.type === 'produits') {
      const ids = sc.ids || [];
      return `
        <div class="bqx-scanbox slim"><i data-lucide="search"></i>
          <input id="mz-prc-q" placeholder="Chercher un article, ou scanner son code-barres…" autocomplete="off" />
        </div>
        <div class="mz-prc-picked" id="mz-prc-picked">
          ${ids.length ? ids.map((id) => { const it = P[id]; return `<button class="mz-chip on" data-prp="${esc(id)}">${esc(it ? it.name : id)} <i data-lucide="x"></i></button>`; }).join('')
            : '<span class="mz-prc-hint">Aucun article choisi pour l\'instant.</span>'}
        </div>
        <div class="mz-prc-hits" id="mz-prc-hits"></div>`;
    }
    if (sc.type === 'avant') {
      /* Les raccourcis d'abord : « plus de six mois » est la phrase que le
         commerçant a en tête, pas une date de calendrier qu'il devra calculer. */
      return `
        <div class="mz-chips" id="mz-prc-age">
          ${[{ m: 3, l: 'Plus de 3 mois' }, { m: 6, l: 'Plus de 6 mois' }, { m: 12, l: 'Plus d\'un an' }].map((o) =>
            `<button class="mz-chip" data-pra="${o.m}">${o.l}</button>`).join('')}
        </div>
        <input class="mz-input" id="mz-prc-before" type="date" value="${toInput(sc.before)}" />
        <div class="mz-prc-hint">Vise les articles entrés dans l'inventaire avant cette date. Un arrivage postérieur n'est jamais remisé, même s'il porte le même nom.</div>`;
    }
    if (sc.type === 'stock') {
      return `
        <div class="mz-chips" id="mz-prc-max">
          ${[2, 3, 5, 10].map((n) => `<button class="mz-chip ${sc.max === n ? 'on' : ''}" data-prm="${n}">${n} ou moins</button>`).join('')}
        </div>
        <input class="mz-input" id="mz-prc-maxn" type="number" min="1" value="${sc.max || ''}" placeholder="ou un seuil à vous" />
        <div class="mz-prc-hint">La cible se recalcule toute seule : un article qui repasse au-dessus du seuil après un réassort sort de la promotion, un autre qui descend y entre.</div>`;
    }
    return '';
  }

  function wirePromoComposer(el) {
    const pr = PRM();
    const d = composer.draft;
    const redraw = () => renderPromoComposer();
    /* Le nom se saisit SANS redessiner : un re-rendu à chaque touche vole le
       curseur au milieu du mot. Il ne change aucun prix, il n'a rien à repeindre. */
    const nameEl = $('#mz-prc-name', el);
    if (nameEl) nameEl.oninput = () => { d.name = nameEl.value; const b = $('#mz-prc-save', el); if (b) b.disabled = !!promoDraftValid(d) || !pr.preview(d, promoItems(), { stockOf: (it) => stockOf(it) }).count; };

    $$('[data-prk]', el).forEach((b) => b.onclick = () => { d.kind = b.dataset.prk; redraw(); });
    const val = $('#mz-prc-value', el);
    if (val) val.oninput = () => { d.value = Math.max(0, Math.round(+val.value || 0)); redraw(); };
    $$('[data-prv]', el).forEach((b) => b.onclick = () => { d.value = +b.dataset.prv; redraw(); });
    $$('[data-prs]', el).forEach((b) => b.onclick = () => { d.scope = pr.normalize({ scope: { type: b.dataset.prs } }).scope; redraw(); });

    $$('[data-prr]', el).forEach((b) => b.onclick = () => {
      const ids = d.scope.ids || (d.scope.ids = []);
      const i = ids.indexOf(b.dataset.prr);
      if (i >= 0) ids.splice(i, 1); else ids.push(b.dataset.prr);
      redraw();
    });
    $$('[data-prp]', el).forEach((b) => b.onclick = () => {
      const ids = d.scope.ids || [];
      const i = ids.indexOf(b.dataset.prp);
      if (i >= 0) ids.splice(i, 1);
      redraw();
    });
    const q = $('#mz-prc-q', el);
    if (q) {
      const hits = $('#mz-prc-hits', el);
      const paint = () => {
        const term = q.value.trim().toLowerCase();
        if (!term) { hits.innerHTML = ''; return; }
        /* Un code-barres scanné dans ce champ désigne un article précis : on
           passe par la base, pas par le nom, sinon la douchette ne sert à rien ici. */
        const byCode = BY_EAN[q.value.trim()];
        const found = byCode ? [P[byCode]].filter(Boolean)
          : promoItems().filter((it) => it.name.toLowerCase().indexOf(term) >= 0).slice(0, 8);
        hits.innerHTML = found.map((it) => `<button class="mz-prc-hit" data-prpick="${esc(it.id)}">
            <span>${esc(it.name)}</span><b>${fmtMAD(it.price)}</b></button>`).join('')
          || '<div class="mz-prc-hint">Aucun article ne porte ce nom.</div>';
        $$('[data-prpick]', hits).forEach((b) => b.onclick = () => {
          const ids = d.scope.ids || (d.scope.ids = []);
          if (ids.indexOf(b.dataset.prpick) < 0) ids.push(b.dataset.prpick);
          redraw();
        });
      };
      q.oninput = paint;
      q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); paint(); } };
    }
    $$('[data-pra]', el).forEach((b) => b.onclick = () => { d.scope.before = startOfDay(new Date(Date.now() - (+b.dataset.pra) * 30 * PROMO_DAY)); redraw(); });
    const before = $('#mz-prc-before', el);
    if (before) before.onchange = () => { d.scope.before = before.value ? startOfDay(new Date(before.value + 'T12:00:00')) : 0; redraw(); };
    $$('[data-prm]', el).forEach((b) => b.onclick = () => { d.scope.max = +b.dataset.prm; redraw(); });
    const maxn = $('#mz-prc-maxn', el);
    if (maxn) maxn.oninput = () => { d.scope.max = Math.max(0, Math.round(+maxn.value || 0)); redraw(); };

    $$('[data-prw]', el).forEach((b) => b.onclick = () => {
      const k = b.dataset.prw, now = new Date();
      if (k === 'none') { d.to = 0; }
      else if (k === 'today') { d.to = endOfDay(now); }
      else if (k === 'we') {
        /* « Ce week-end » = jusqu'à dimanche soir. Un dimanche, c'est ce soir —
           pas dans sept jours : le commerçant qui pose sa promotion le dimanche
           matin veut qu'elle finisse le soir même. */
        const toSunday = (7 - now.getDay()) % 7;
        d.to = endOfDay(new Date(now.getTime() + toSunday * PROMO_DAY));
      } else { d.to = endOfDay(new Date(now.getTime() + (+k) * PROMO_DAY)); }
      redraw();
    });
    const from = $('#mz-prc-from', el);
    if (from) from.onchange = () => { d.from = from.value ? startOfDay(new Date(from.value + 'T12:00:00')) : 0; redraw(); };
    const to = $('#mz-prc-to', el);
    if (to) to.onchange = () => { d.to = to.value ? endOfDay(new Date(to.value + 'T12:00:00')) : 0; redraw(); };

    $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-promo-veil'); });
    const save = $('#mz-prc-save', el);
    if (save) save.onclick = () => {
      if (promoDraftValid(d)) return;
      if (!d.name.trim()) d.name = promoAutoName(d);
      if (composer.editing) d.id = composer.editing;
      pr.save(d);
      closeVeil('#mz-promo-veil');
      toast(composer.editing ? `${d.name} enregistrée` : `${d.name} lancée, les prix sont à jour`);
      renderPromos(); renderGrid(); renderBadges(); icons(); lens();
    };
  }

  /* Un nom laissé vide ne doit pas produire « Promotion » sur le reçu de la
     cliente : on écrit ce que la promotion FAIT, c'est plus utile qu'un blanc. */
  function promoAutoName(d) {
    const sc = d.scope || {};
    if (sc.type === 'avant') return 'Déstockage';
    if (sc.type === 'stock') return 'Fins de série';
    if (sc.type === 'rayon') return promoScopeText(d);
    if (sc.type === 'produits') return 'Sélection';
    return d.kind === 'percent' ? `Tout le magasin −${d.value} %` : 'Promotion';
  }

  /* ─── the inventory panel ─── */
  function catalogDashboardOnly() {
    const msg = 'Articles et prix se gèrent dans le tableau de bord.';
    if (typeof toast === 'function') toast(msg);
  }

  function renderInventaire() {
    const cat = catDB();
    const panel = $('[data-mz-panel="inventaire"]', root);
    if (!cat) { panel.innerHTML = '<div class="mz-empty" style="margin:40px;">Base d\'inventaire indisponible.</div>'; return; }
    const st = cat.stats();
    const cats = cat.listCategories();
    const filter = state.invFilter || 'all';
    const products = cat.listProducts({ categoryId: filter, q: state.invQuery || '' });
    panel.innerHTML = `
      <div class="bqi">
        <header class="mz-head" style="padding:22px 22px 0;">
          <div><h1>Inventaire</h1><div class="mz-head-sub">Douchette + imprimante étiquettes · ${st.products} produits · ${st.variants} variantes, base partagée avec le dashboard</div></div>
        </header>
        <div class="mzi-tools">
          <div class="mzi-scan"><i data-lucide="scan-line"></i><input id="mzi-scan" placeholder="Scannez un article, ou tapez un code…" autocomplete="off" /></div>
          <button class="mz-btn" id="mzi-intake"><i data-lucide="scan-barcode"></i>Reprendre le stock</button>
          <span class="mzi-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span>
        </div>
        <div class="mzi-pills" id="mzi-pills">
          <button class="mzi-pill ${filter === 'all' ? 'on' : ''}" data-f="all">Tous · ${st.products}</button>
          ${cats.map((c) => `<button class="mzi-pill ${filter === c.id ? 'on' : ''}" data-f="${c.id}">${esc(c.name)} · ${cat.categoryCount(c.id)}</button>`).join('')}
        </div>
        <div class="mzi-kpis">
          <!-- boutique réelle : ce que le stock a COÛTÉ (chiffre de compta / assurance).
               La démo garde sa valeur au prix de vente. Voir stats() dans boutique-catalog.js. -->
          <div class="mzi-kpi"><span class="l">Valeur de stock</span><span class="v">${fmtNum(IS_DEMO ? st.stockValue : st.stockCost)} MAD</span></div>
          <div class="mzi-kpi"><span class="l">Pièces en stock</span><span class="v">${st.totalStock}</span></div>
          <div class="mzi-kpi ${st.low || st.ruptures ? 'warn' : ''}"><span class="l">Stock bas / rupture</span><span class="v">${st.low} + ${st.ruptures}</span></div>
        </div>
        <div class="mzi-list">
          ${products.length ? products.map((p) => invRow(p)).join('') : `<div class="mz-empty mzi-first">
              <i data-lucide="scan-barcode"></i>
              <b>Votre stock porte déjà des codes-barres ?</b>
              <span>Touchez « Reprendre le stock » et scannez vos articles un par un : Kiwi garde le code du fournisseur tel quel. Aucune étiquette à réimprimer.</span>
              <em>Pour créer un article ou modifier un prix, ouvrez le tableau de bord. Ici, vous pouvez reprendre le stock et les codes existants.</em>
            </div>`}
        </div>
      </div>`;
    const scan = $('#mzi-scan', panel);
    if (scan) scan.onkeydown = (e) => { if (e.key === 'Enter') { const v = scan.value.trim(); scan.value = ''; if (v) invScanHandle(v); } };
    const ib = $('#mzi-intake', panel); if (ib) ib.onclick = () => openIntake();
    const pills = $('#mzi-pills', panel);
    if (pills) pills.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { state.invFilter = b.dataset.f; renderInventaire(); } });
    panel.querySelectorAll('[data-inv-open]').forEach((el) => el.addEventListener('click', () => openInvProduct(el.getAttribute('data-inv-open'))));
    panel.querySelectorAll('[data-inv-print]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); printProductLabels(el.getAttribute('data-inv-print')); }));
    icons();
  }

  function invRow(p) {
    const cat = catDB();
    const d = cat.getProduct(p.id);
    const nBc = d.variants.reduce((s, v) => s + ((v.barcodes && v.barcodes.length) ? 1 : 0), 0);
    const cls = d.stock === 0 ? 'rupture' : (d.stock <= 5 ? 'bas' : '');
    return `<div class="mzi-row" data-inv-open="${p.id}">
      <span class="mzi-art">${artOf(p.art)}</span>
      <span class="mzi-info"><b>${esc(p.name)}</b><span>${d.category ? esc(d.category.name) : 'Divers'} · ${d.colors.length} coul. · ${d.sizes.length} taille${d.sizes.length > 1 ? 's' : ''} · ${nBc}/${d.variants.length} codes-barres</span></span>
      <span class="mzi-stock ${cls}">${d.stock}</span>
      <span class="mzi-price">${fmtMAD(p.priceMAD)}</span>
      <button class="mzi-mini" data-inv-print="${p.id}" title="Imprimer toutes les étiquettes"><i data-lucide="printer"></i></button>
    </div>`;
  }

  /* ─── single-veil modal host (content-swapping keeps it simple) ─── */
  function invSetModal(html, wire) {
    const el = $('#mz-invmm', root);
    if (!el) return;
    /* Chaque écran repart d'une douchette NON captée : c'est celui qui s'affiche
     * qui la réclame, dans son wire(). Sans ce reset, l'écran quitté garderait la
     * main et la douchette écrirait dans un formulaire qui n'existe plus — plus
     * aucun scan n'atteindrait jamais le ticket. */
    disarmScanCapture();
    el.innerHTML = html;
    if (!$('#mz-inv-veil', root).classList.contains('is-open')) openVeil('#mz-inv-veil');
    el.querySelectorAll('[data-inv-x]').forEach((b) => b.addEventListener('click', () => {
      closeVeil('#mz-inv-veil');
      disarmScanCapture();
      intake.open = false;
    }));
    if (wire) wire(el);
    icons();
    lens();
  }

  function openInvProduct(pid) {
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const p = d.product;
    const rows = d.variants.length
      ? d.variants.map((v) => invVarRow(v)).join('')
      : '<tr><td colspan="4" style="text-align:center;padding:18px;color:#99a;">Aucune variante, ajoutez une couleur × taille.</td></tr>';
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh">
        <span class="mzi-art">${artOf(p.art)}</span>
        <div><h3>${esc(p.name)}</h3><span>${d.category ? esc(d.category.name) : 'Divers'} · ${fmtMAD(p.priceMAD)} · ${d.stock} en stock</span></div>
        <span class="mzi-dashboard-only">Modifier dans le tableau de bord</span>
      </div>
      <div class="mzi-vtable-wrap"><table class="mzi-vtable">
        <thead><tr><th>Couleur · Taille</th><th>Stock</th><th>Code-barres</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <div class="mzi-modfoot">
        <span class="mzi-dashboard-only">Variantes dans le tableau de bord</span>
        <button class="mz-btn secondary" data-inv-printall><i data-lucide="printer"></i>Imprimer les étiquettes</button>
        <span class="mzi-dashboard-only">Suppression dans le tableau de bord</span>
      </div>`;
    invSetModal(html, (el) => {
      const cat2 = catDB();
      $('[data-inv-printall]', el).addEventListener('click', () => printProductLabels(pid));
      el.querySelectorAll('[data-vinc]').forEach((b) => b.addEventListener('click', () => { cat2.adjustStock(b.dataset.vinc, 1); openInvProduct(pid); }));
      el.querySelectorAll('[data-vdec]').forEach((b) => b.addEventListener('click', () => { cat2.adjustStock(b.dataset.vdec, -1); openInvProduct(pid); }));
      el.querySelectorAll('[data-vstock]').forEach((inp) => inp.addEventListener('change', () => { cat2.setStock(inp.dataset.vstock, parseInt(inp.value, 10) || 0); openInvProduct(pid); }));
      el.querySelectorAll('[data-vgen]').forEach((b) => b.addEventListener('click', () => { const code = cat2.generateBarcode(b.dataset.vgen); if (code) toast(`EAN-13 ${code} généré`); openInvProduct(pid); }));
      el.querySelectorAll('[data-vprint]').forEach((b) => b.addEventListener('click', () => printVariantLabel(b.dataset.vprint)));
      el.querySelectorAll('[data-vreg]').forEach((b) => b.addEventListener('click', () => openRegisterOnVariant(b.dataset.vreg, pid)));
    });
  }

  function invVarRow(v) {
    const primary = (v.barcodes || []).find((b) => b.primary) || (v.barcodes || [])[0];
    const bc = primary
      ? `<div class="mzi-bc">${window.KiwiBarcode.svg(primary.code, { height: 26, module: 1.1, showText: false })}<span class="mzi-code">${esc(primary.code)}<em class="${primary.type === 'imported' ? 'imp' : 'gen'}">${primary.type === 'imported' ? 'importé' : 'généré'}</em></span></div>`
      : '<span class="mzi-nocode">aucun code</span>';
    const genOrPrint = primary
      ? `<button class="mzi-mini" data-vprint="${v.id}" title="Imprimer l'étiquette"><i data-lucide="printer"></i></button>`
      : `<button class="mzi-mini" data-vgen="${v.id}" title="Générer un EAN-13"><i data-lucide="scan-line"></i></button>`;
    return `<tr>
      <td><span class="mzi-cbtn is-locked" aria-disabled="true" title="Modifier dans le tableau de bord">${colorDot(v.colorFamily || v.colorId)} ${esc(colorLabel(v.colorFamily || v.colorId))}</span>${v.colorSource ? `<em class="mzi-csrc">${esc(v.colorSource)}</em>` : ''} · <b>${esc(v.size)}</b></td>
      <td><span class="mzi-stk"><button data-vdec="${v.id}" aria-label="−1">−</button><input data-vstock="${v.id}" type="number" min="0" value="${v.stock}"/><button data-vinc="${v.id}" aria-label="+1">+</button></span></td>
      <td>${bc}</td>
      <td class="mzi-vact">${genOrPrint}<button class="mzi-mini" data-vreg="${v.id}" title="Enregistrer un code existant"><i data-lucide="link"></i></button><span class="mzi-mini is-locked danger" aria-disabled="true" title="Supprimer dans le tableau de bord"><i data-lucide="trash-2"></i></span></td>
    </tr>`;
  }

  /* ─── new product ─── */
  function catSelectOptions(sel) {
    const cats = catDB().listCategories();
    return `<option value="">— Sans catégorie</option>` + cats.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }
  function kindSelectOptions(sel) {
    return [['taille', 'Vêtement (S–XL)'], ['pointure', 'Chaussure (pointures)'], ['tu', 'Taille unique']]
      .map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
  }
  function openNewProduct() {
    catalogDashboardOnly();
    return;
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Nouvel article</h3><span>Créez le produit, puis ajoutez ses variantes couleur × taille</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Nom du produit</label><input id="mzi-n-name" placeholder="Ex. Caftan brodé main" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Catégorie</label><select id="mzi-n-cat">${catSelectOptions(state.invFilter && state.invFilter !== 'all' ? state.invFilter : '')}</select></div>
          <div class="mzi-fg"><label>Type</label><select id="mzi-n-kind">${kindSelectOptions('taille')}</select></div>
        </div>
        <div class="mzi-fg"><label>Ou nouvelle catégorie (optionnel)</label><input id="mzi-n-newcat" placeholder="Laisser vide pour utiliser la catégorie ci-dessus" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Prix de vente (MAD)</label><input id="mzi-n-price" type="number" min="0" placeholder="1890" /></div>
          <div class="mzi-fg"><label>Coût d'achat (MAD)</label><input id="mzi-n-cost" type="number" min="0" placeholder="optionnel" /></div>
        </div>

        <!-- Le choix qui évite d'imprimer des milliers d'étiquettes pour rien :
             l'article porte peut-être déjà un code du fournisseur. -->
        <div class="mzi-fg"><label>Code-barres de cet article</label>
          <div class="bqx-choice" id="mzi-n-bcpick" role="radiogroup" aria-label="Code-barres de cet article" data-lens-demo>
            <button type="button" class="bqx-opt on" data-bc="existing" data-lens-item role="radio" aria-checked="true">
              <i data-lucide="scan-line"></i><b>Il en a déjà un</b><span>Code fournisseur ou fabricant — conservé tel quel</span>
            </button>
            <button type="button" class="bqx-opt" data-bc="gen" data-lens-item role="radio" aria-checked="false">
              <i data-lucide="sparkles"></i><b>Générer un code Kiwi</b><span>EAN-13 imprimable, pour un article non étiqueté</span>
            </button>
            <button type="button" class="bqx-opt" data-bc="later" data-lens-item role="radio" aria-checked="false">
              <i data-lucide="clock"></i><b>Plus tard</b><span>Créer l'article maintenant, le code après</span>
            </button>
          </div>
        </div>

        <div id="mzi-n-bcwrap">
          <div class="mzi-fg"><label>Scannez ou tapez le code existant</label>
            <div class="bqx-scanbox slim"><i data-lucide="scan-line"></i><input id="mzi-n-code" placeholder="Scannez l'étiquette de l'article…" autocomplete="off" spellcheck="false" /></div>
            <div class="mzi-help" id="mzi-n-codehint">La douchette écrit ici directement. Rien n'est mis au ticket, rien n'est vendu.</div>
          </div>
        </div>

        <div class="mzi-frow">
          <div class="mzi-fg"><label>Couleur</label><div id="mzi-n-sw">${colorPicker('noir')}</div></div>
        </div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Taille</label><input id="mzi-n-size" list="mzi-n-sizes" placeholder="M" autocomplete="off" /><datalist id="mzi-n-sizes"></datalist></div>
          <div class="mzi-fg"><label>Stock initial</label><input id="mzi-n-stock" type="number" min="0" step="1" inputmode="numeric" value="0" /></div>
        </div>
        <div class="mzi-fg"><label>Icône du produit</label>${iconPickerHtml('tshirt')}</div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-x>Annuler</button><button class="mz-btn" id="mzi-n-save">Créer l'article</button></div>`;
    invSetModal(html, (el) => {
      const cat = catDB();
      let icon = 'tshirt';
      let mode = 'existing';
      wireIconPicker(el, (k) => { icon = k; });
      const pickedColor = () => { const k = KC(); return (k && k.value($('#mzi-n-sw', el))) || 'noir'; };
      const kindSel = $('#mzi-n-kind', el), sizeList = $('#mzi-n-sizes', el);
      const fillSizes = () => { sizeList.innerHTML = cat.sizePresets(kindSel.value).map((s) => `<option value="${esc(s)}">`).join(''); };
      kindSel.onchange = fillSizes; fillSizes();

      const wrap = $('#mzi-n-bcwrap', el), codeIn = $('#mzi-n-code', el), codeHint = $('#mzi-n-codehint', el);
      const setMode = (m) => {
        mode = m;
        el.querySelectorAll('#mzi-n-bcpick .bqx-opt').forEach((b) => {
          const on = b.dataset.bc === m;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        wrap.style.display = m === 'existing' ? '' : 'none';
        if (m === 'existing') setTimeout(() => codeIn.focus(), 20);
        lens();
      };
      el.querySelectorAll('#mzi-n-bcpick .bqx-opt').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.bc)));

      /* Le code scanné remplit le champ, et RIEN d'autre ne se produit. */
      const judgeInto = (raw) => {
        const j = intakeJudge(raw);
        if (j.kind === 'invalide') { codeHint.textContent = INVALID_MSG[j.reason] || 'Code illisible.'; codeHint.className = 'mzi-help is-bad'; return j; }
        if (j.kind === 'connu') {
          codeHint.innerHTML = `Ce code est déjà porté par <b>${esc(j.hit.product.name)} · ${esc(j.hit.variant.colorLabel)} ${esc(j.hit.variant.size)}</b>. Un code ne peut désigner qu'un seul article.`;
          codeHint.className = 'mzi-help is-bad'; return j;
        }
        const KB = window.KiwiBarcode;
        codeHint.textContent = `Code lu · ${KB && KB.symLabel ? KB.symLabel(j.sym) : ''}${j.check === 'bad' ? ' — clé de contrôle inhabituelle, accepté tel quel' : ''}. Conservé sans réimpression.`;
        codeHint.className = 'mzi-help is-good';
        return j;
      };
      armScanCapture((c) => { codeIn.value = normScan(c); judgeInto(c); });
      /* Même verdict à la douchette et au clavier — « input » et pas seulement
         « change », sinon la saisie manuelle reste muette jusqu'à la validation. */
      const liveJudge = () => { if (codeIn.value.trim()) judgeInto(codeIn.value); };
      codeIn.addEventListener('input', liveJudge);
      codeIn.addEventListener('change', liveJudge);

      const save = () => {
        const name = $('#mzi-n-name', el).value.trim();
        if (!name) { toast('Nom requis'); $('#mzi-n-name', el).focus(); return; }
        const raw = codeIn.value.trim();
        if (mode === 'existing') {
          if (!raw) { toast('Scannez le code existant, ou choisissez « Générer » / « Plus tard »'); codeIn.focus(); return; }
          const j = judgeInto(raw);
          if (j.kind !== 'nouveau') {
            toast(j.kind === 'connu' ? `Code déjà utilisé par ${j.hit.product.name}` : (INVALID_MSG[j.reason] || 'Code illisible'));
            return;
          }
        }
        let catId = $('#mzi-n-cat', el).value || null;
        const newCat = $('#mzi-n-newcat', el).value.trim();
        if (newCat) catId = cat.addCategory(newCat).id;
        const size = $('#mzi-n-size', el).value.trim() || 'TU';
        const stock = Math.max(0, parseInt($('#mzi-n-stock', el).value, 10) || 0);
        const saveBtn = $('#mzi-n-save', el);
        const oldSave = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.classList.add('is-busy');
        saveBtn.innerHTML = '<span class="mz-btn-spinner" aria-hidden="true"></span><span>Création…</span>';
        const restoreSave = () => { saveBtn.disabled = false; saveBtn.classList.remove('is-busy', 'is-done'); saveBtn.innerHTML = oldSave; };
        let p = null, ev = null, res = null, genCode = null;
        cat.batch(() => {
          p = cat.addProduct({ name, categoryId: catId, kind: kindSel.value, art: icon, priceMAD: bqMoney($('#mzi-n-price', el).value), cost: bqMoney($('#mzi-n-cost', el).value) });
          ev = cat.ensureVariant({ productId: p.id, colorId: pickedColor(), size, stock });
          if (mode === 'existing' && ev.variant) {
            res = cat.attachBarcode(ev.variant.id, raw);
            if (!res.ok) cat.deleteProduct(p.id);   // jamais d'article orphelin
          } else if (mode === 'gen' && ev.variant) {
            genCode = cat.generateBarcode(ev.variant.id);
          }
        });
        if (mode === 'existing') {
          if (!res || !res.ok) {
            restoreSave();
            toast(res && res.reason === 'doublon' ? `Ce code vient d'être attribué à ${res.owner.product.name}` : 'Code refusé, rien n\'a été créé', 3600, 'danger');
            return;
          }
          toast(`${name} ajouté à l'inventaire`, 3800, 'success', `${stock} pièce${stock === 1 ? '' : 's'} · taille ${size} · code fournisseur conservé`);
        } else if (mode === 'gen') {
          toast(`${name} ajouté à l'inventaire`, 3800, 'success', `${stock} pièce${stock === 1 ? '' : 's'} · taille ${size}${genCode ? ' · code Kiwi généré' : ''}`);
        } else {
          toast(`${name} ajouté à l'inventaire`, 3800, 'success', `${stock} pièce${stock === 1 ? '' : 's'} · taille ${size} · code à ajouter plus tard`);
        }
        saveBtn.classList.remove('is-busy'); saveBtn.classList.add('is-done');
        saveBtn.innerHTML = '<span aria-hidden="true">✓</span><span>Article créé</span>';
        disarmScanCapture();
        setTimeout(() => openInvProduct(p.id), 320);
      };
      $('#mzi-n-save', el).addEventListener('click', save);
      setMode('existing');
      setTimeout(() => { const i = $('#mzi-n-name', el); if (i) i.focus(); }, 40);
    });
  }

  function openEditProduct(pid) {
    catalogDashboardOnly();
    return;
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return; const p = d.product;
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Modifier le produit</h3><span>${esc(p.name)}</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Nom</label><input id="mzi-e-name" value="${esc(p.name)}" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Catégorie</label><select id="mzi-e-cat">${catSelectOptions(p.categoryId)}</select></div>
          <div class="mzi-fg"><label>Type</label><select id="mzi-e-kind">${kindSelectOptions(p.kind)}</select></div>
        </div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Prix de vente (MAD)</label><input id="mzi-e-price" type="number" min="0" value="${p.priceMAD}" /></div>
          <div class="mzi-fg"><label>Coût d'achat (MAD)</label><input id="mzi-e-cost" type="number" min="0" value="${p.cost || 0}" /></div>
        </div>
        <div class="mzi-fg"><label>Icône du produit</label>${iconPickerHtml(p.art || 'tshirt')}</div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Retour</button><button class="mz-btn" id="mzi-e-save">Enregistrer</button></div>`;
    invSetModal(html, (el) => {
      let icon = p.art || 'tshirt';
      wireIconPicker(el, (k) => { icon = k; });
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#mzi-e-save', el).addEventListener('click', () => {
        cat.updateProduct(pid, { name: $('#mzi-e-name', el).value.trim() || undefined, categoryId: $('#mzi-e-cat', el).value || null, kind: $('#mzi-e-kind', el).value, art: icon, priceMAD: bqMoney($('#mzi-e-price', el).value), cost: bqMoney($('#mzi-e-cost', el).value) });
        toast('Produit mis à jour');
        openInvProduct(pid);
      });
    });
  }

  function confirmDeleteProduct(pid) {
    catalogDashboardOnly();
    return;
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Supprimer « ${esc(d.product.name)} » ?</h3><span>${d.variants.length} variantes et leurs codes-barres seront supprimés.</span></div></div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Annuler</button><button class="mz-btn danger" id="mzi-del-ok"><i data-lucide="trash-2"></i>Supprimer définitivement</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#mzi-del-ok', el).addEventListener('click', () => { cat.deleteProduct(pid); toast('Produit supprimé'); closeVeil('#mz-inv-veil'); renderInventaire(); });
    });
  }

  /* Supprimer une DÉCLINAISON demande la même confirmation que supprimer le
     produit. La corbeille de la ligne partait sur un seul appui, sans retour
     possible : le stock compté, le code-barres imprimé sur les étiquettes du
     rayon et l'historique de mouvements de cette déclinaison disparaissaient
     ensemble, et la ligne d'à côté est le bouton « −1 ». On nomme ce qui part. */
  function confirmDeleteVariant(vid, pid) {
    catalogDashboardOnly();
    return;
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const v = d.variants.find((x) => x.id === vid); if (!v) return;
    const codes = (v.barcodes || []).length;
    const perte = [
      v.stock > 0 ? `${v.stock} en stock` : 'aucun stock',
      codes ? `${codes} code${codes > 1 ? 's' : ''}-barres` : 'aucun code-barres',
    ].join(' · ');
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Supprimer ${esc(colorLabel(v.colorFamily || v.colorId))} · ${esc(v.size)} ?</h3><span>${esc(d.product.name)} — ${perte}. La suppression est définitive.</span></div></div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Annuler</button><button class="mz-btn danger" id="mzi-vdel-ok"><i data-lucide="trash-2"></i>Supprimer la variante</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#mzi-vdel-ok', el).addEventListener('click', () => { cat.deleteVariant(vid); toast('Variante supprimée'); openInvProduct(pid); });
    });
  }

  /* ─── add variant (colour × size × stock + optional EAN-13) ───
     Le sélecteur est celui du tableau de bord, en taille tactile : mêmes
     pastilles, même état sélectionné, même comportement clavier. */
  function colorPicker(sel) {
    const k = KC();
    if (!k) return '';
    return k.picker('variant-color', sel || 'noir', {
      size: 'lg', optional: true, label: 'Couleur',
      hint: 'Touchez une pastille pour lire son nom',
    });
  }

  /* Changer la couleur d'une variante existante. La variante garde son stock,
     ses codes-barres et son identité : seule la famille affichée change. */
  function openVariantColor(vid, pid) {
    catalogDashboardOnly();
    return;
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const v = d.variants.find((x) => x.id === vid); if (!v) return;
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Couleur de la variante</h3><span>${esc(d.product.name)} · taille ${esc(v.size)}${v.colorSource ? ` · saisie à l'origine « ${esc(v.colorSource)} »` : ''}</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Couleur</label>${colorPicker(v.colorFamily || v.colorId)}</div>
        <div class="mzi-fg"><label>Précision (facultatif)</label><input id="mzi-vc-note" maxlength="60" value="${esc(v.note || '')}" placeholder="Ex. rayé, délavé, motif — pour distinguer deux variantes de même couleur" /></div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Retour</button><button class="mz-btn" id="mzi-vc-save">Enregistrer</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#mzi-vc-save', el).addEventListener('click', () => {
        const k = KC();
        const colorId = k ? k.value(el) : '';
        cat.updateVariant(vid, {
          colorId: colorId || undefined,
          note: $('#mzi-vc-note', el).value.trim(),
        });
        toast('Couleur mise à jour');
        openInvProduct(pid);
      });
    });
  }
  function openAddVariant(pid) {
    catalogDashboardOnly();
    return;
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const presets = cat.sizePresets(d.product.kind);
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Ajouter une variante</h3><span>${esc(d.product.name)}, couleur × taille</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Couleur</label><div id="mzi-av-sw">${colorPicker('noir')}</div></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Taille</label><input id="mzi-av-size" list="mzi-av-sizes" value="${esc(presets[0] || 'TU')}" /><datalist id="mzi-av-sizes">${presets.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="mzi-fg"><label>Stock initial</label><input id="mzi-av-stock" type="number" min="0" value="0" /></div>
        </div>
        <div class="mzi-fg"><label>Code-barres</label><select id="mzi-av-bc"><option value="gen">Générer un EAN-13 (imprimable)</option><option value="none">Aucun pour l'instant</option></select></div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Retour</button><button class="mz-btn" id="mzi-av-save">Ajouter la variante</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#mzi-av-save', el).addEventListener('click', () => {
        const k = KC();
        const colorId = (k && k.value($('#mzi-av-sw', el))) || 'noir';
        const size = $('#mzi-av-size', el).value.trim() || 'TU';
        const stock = parseInt($('#mzi-av-stock', el).value, 10) || 0;
        const v = cat.addVariant({ productId: pid, colorId, size, stock });
        if (v && $('#mzi-av-bc', el).value === 'gen') cat.generateBarcode(v.id);
        toast('Variante ajoutée');
        openInvProduct(pid);
      });
    });
  }

  /* ─── register an EXISTING barcode on a variant (old POS code, no reprint) ─── */
  function openRegisterOnVariant(vid, pid) {
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Enregistrer un code existant</h3><span>Scannez ou tapez le code déjà présent sur l'article, conservé tel quel.</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Code-barres</label><input id="mzi-reg-code" placeholder="Scannez ou tapez le code…" autocomplete="off" /></div>
        <div class="mzi-help">EAN-13, UPC ou tout code de l'ancien système. Aucune réimpression, le code est rattaché à cette variante.</div>
      </div>
      <div class="mzi-modfoot"><button class="mz-btn secondary" data-inv-back>Retour</button><button class="mz-btn" id="mzi-reg-save">Enregistrer le code</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      const inp = $('#mzi-reg-code', el);
      const save = () => {
        const raw = inp.value.trim(); if (!raw) { toast('Code vide'); return; }
        const res = catDB().attachBarcode(vid, raw);
        if (res.ok) { toast(res.already ? 'Code déjà rattaché' : `Code ${raw} enregistré`); openInvProduct(pid); }
        else if (res.reason === 'doublon') toast(`Déjà utilisé par ${res.owner.product.name} (${res.owner.variant.colorLabel} ${res.owner.variant.size})`);
        else toast('Enregistrement impossible');
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      $('#mzi-reg-save', el).addEventListener('click', save);
      setTimeout(() => inp.focus(), 40);
    });
  }

  /* ─── register an unknown scanned code onto a product (pick / create) ─── */
  function offerRegister(code) {
    const cat = catDB(); if (!cat) return;
    if (state.view !== 'inventaire') switchView('inventaire');
    const products = cat.listProducts({});
    // Une liste déroulante ne peut pas montrer de pastille : c'est le seul
    // endroit où la couleur reste écrite. Quand deux variantes portent la même
    // famille, la nuance d'origine ou la précision les départage.
    const varOptions = (pid) => cat.listVariants(pid).map((v) => {
      const extra = v.note || v.colorSource || '';
      return `<option value="${v.id}">${esc(v.colorLabel)}${extra ? ` (${esc(extra)})` : ''} · ${esc(v.size)}</option>`;
    }).join('');
    const html = `
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="mzi-modh"><div><h3>Code existant à enregistrer</h3><span>Code scanné : <b>${esc(code)}</b>, rattachez-le à un article (sans réimprimer).</span></div></div>
      <div class="mzi-form">
        <div class="mzi-fg"><label>Article</label><select id="mzi-or-prod">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="mzi-fg"><label>Variante (couleur · taille)</label><select id="mzi-or-var">${products.length ? varOptions(products[0].id) : ''}</select></div>
      </div>
      <div class="mzi-modfoot"><span class="mzi-dashboard-only">Créer l’article dans le tableau de bord</span><button class="mz-btn" id="mzi-or-save">Rattacher le code</button></div>`;
    invSetModal(html, (el) => {
      const prodSel = $('#mzi-or-prod', el), varSel = $('#mzi-or-var', el);
      if (prodSel) prodSel.addEventListener('change', () => { varSel.innerHTML = varOptions(prodSel.value); });
      $('#mzi-or-save', el).addEventListener('click', () => {
        const vid = varSel && varSel.value;
        if (!vid) { toast('Choisissez une variante (ajoutez-en une d\'abord)'); return; }
        const res = cat.attachBarcode(vid, code);
        if (res.ok) { toast(`Code ${code} enregistré`); openInvProduct(prodSel.value); }
        else if (res.reason === 'doublon') toast(`Déjà utilisé par ${res.owner.product.name}`);
        else toast('Enregistrement impossible');
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * REPRISE DE STOCK — onboarder une boutique déjà étiquetée
   * ---------------------------------------------------------------------------
   * Le cas que ceci résout : un commerçant a des milliers d'articles qui portent
   * DÉJÀ un code-barres fournisseur ou fabricant. Lui faire générer et imprimer
   * une étiquette Kiwi par pièce, c'est des jours de travail et des milliers
   * d'étiquettes pour rien. Le code du carton est un identifiant parfaitement
   * valable : on le lit, on le garde tel quel, on ne réimprime rien.
   *
   * Trois gestes vivent ici, et l'écran ne les confond JAMAIS (c'est la règle
   * la plus importante de cet écran, parce qu'à la douchette ils se ressemblent) :
   *   · CRÉER un article au catalogue           — le code est inconnu
   *   · AJOUTER une déclinaison à un article    — même modèle, autre taille/couleur
   *   · RECEVOIR du stock                       — l'article existe déjà, il en arrive
   *
   * Ce que scanner ici ne fait jamais : mettre au panier, encaisser, bouger le
   * stock avant confirmation, imprimer une étiquette, écraser un article existant.
   * Garanti par armScanCapture() (voir handleWedge) plus le mode `pending` : rien
   * n'est écrit avant que l'employé n'ait touché « Enregistrer ».
   * ─────────────────────────────────────────────────────────────────────────── */

  /* Session de reprise : vit le temps de l'écran, sert le compteur et le journal.
   * `log` est borné — une session d'import peut faire des milliers d'articles et
   * la caisse doit rester aussi vive au 2000e scan qu'au premier. */
  const intake = { open: false, count: 0, pieces: 0, log: [], mode: 'scan', draft: null, lastProduct: null, hint: null };
  const INTAKE_LOG_MAX = 8;

  function intakeReset() {
    intake.count = 0; intake.pieces = 0; intake.log = []; intake.mode = 'scan';
    intake.draft = null; intake.lastProduct = null; intake.hint = null;
  }
  function intakeNote(kind, text) {
    intake.log.unshift({ kind, text, at: new Date() });
    if (intake.log.length > INTAKE_LOG_MAX) intake.log.length = INTAKE_LOG_MAX;
  }

  /* ─── le juge : que faire de ce code ? ───────────────────────────────────────
   * Un seul endroit décide, pour que le scan répété, la saisie manuelle et la
   * caméra donnent exactement le même verdict. */
  function intakeJudge(raw) {
    const code = normScan(raw);
    const KB = window.KiwiBarcode;
    const val = KB && KB.validate ? KB.validate(code) : { ok: !!code, code, sym: '', check: 'na' };
    if (!val.ok) return { kind: 'invalide', code, reason: val.reason };
    const cat = catDB();
    const hit = cat ? cat.findByBarcode(val.code) : null;
    if (hit) return { kind: 'connu', code: val.code, sym: val.sym, check: val.check, hit };
    return { kind: 'nouveau', code: val.code, sym: val.sym, check: val.check };
  }

  const INVALID_MSG = {
    vide: 'Rien n\'a été lu. Rapprochez la douchette de l\'étiquette, ou tapez le code.',
    illisible: 'Lecture incomplète — la douchette a envoyé des caractères parasites. Rescannez, ou tapez le code à la main.',
    'trop-court': 'Lecture partielle : trop peu de caractères pour être un code-barres. Rescannez plus lentement, ou tapez-le.',
    'trop-long': 'Ce code est anormalement long. Vérifiez qu\'un seul article est passé devant la douchette.',
  };

  function symBadge(j) {
    if (!j || !j.sym) return '';
    const KB = window.KiwiBarcode;
    const label = KB && KB.symLabel ? KB.symLabel(j.sym) : j.sym;
    if (j.check === 'bad') return `<span class="bqx-sym warn" title="La clé de contrôle ne correspond pas. C'est fréquent sur un code interne — Kiwi l'accepte tel quel.">${esc(label)} · clé inhabituelle</span>`;
    return `<span class="bqx-sym">${esc(label)}${j.check === 'ok' ? ' ✓' : ''}</span>`;
  }

  /* ─── l'écran ─── */
  function openIntake() {
    if (!catDB()) { toast('Base d\'inventaire indisponible'); return; }
    if (state.view !== 'inventaire') switchView('inventaire');
    intake.open = true;
    intakeReset();
    paintIntake();
  }

  function intakeClose() {
    intake.open = false;
    disarmScanCapture();
    closeVeil('#mz-inv-veil');
    /* La projection de vente a été mise en pause pendant la saisie : on la
       reconstruit maintenant, avant que quiconque scanne pour vendre. */
    rebuildCatalog();
    pruneTicket();
    renderInventaire();
    if (intake.count) toast(`Reprise terminée · ${intake.count} article${intake.count > 1 ? 's' : ''}, ${intake.pieces} pièce${intake.pieces > 1 ? 's' : ''}`);
  }

  function intakeHeader() {
    return `
      <div class="bqx-head">
        <div class="bqx-head-t">
          <h3>Reprise de stock</h3>
          <span>Scannez le code déjà présent sur l'article. Kiwi le garde tel quel — aucune étiquette à réimprimer.</span>
        </div>
        <div class="bqx-tally" aria-live="polite">
          <b>${intake.count}</b><span>article${intake.count > 1 ? 's' : ''}</span>
          <i></i>
          <b>${intake.pieces}</b><span>pièce${intake.pieces > 1 ? 's' : ''}</span>
        </div>
      </div>`;
  }

  function intakeLogHtml() {
    if (!intake.log.length) {
      return `<div class="bqx-log-empty">Rien encore. La douchette écrit directement dans le champ ci-dessus — pas besoin de cliquer.</div>`;
    }
    return `<div class="bqx-log">${intake.log.map((l) => `
      <div class="bqx-log-row is-${l.kind}">
        <i data-lucide="${l.kind === 'cree' ? 'plus-circle' : l.kind === 'variante' ? 'git-branch' : l.kind === 'recu' ? 'package-plus' : 'alert-circle'}"></i>
        <span>${esc(l.text)}</span>
        <em>${fmtHM(l.at)}</em>
      </div>`).join('')}</div>`;
  }

  /* ═══ état 1 · en attente d'un scan ═══ */
  function paintIntake() {
    if (!intake.open) return;
    intake.mode = 'scan';
    const canCam = camSupported();
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-body">
        <div class="bqx-scanbox" id="bqx-box">
          <i data-lucide="scan-line"></i>
          <input id="bqx-code" placeholder="Scannez un article…" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="bqx-mini" id="bqx-go" title="Valider le code saisi"><i data-lucide="arrow-right"></i></button>
        </div>
        <div class="bqx-hint${intake.hint ? ' is-' + intake.hint.tone : ''}" id="bqx-hint">${esc(intake.hint ? intake.hint.msg : 'Douchette prête. Pas de douchette ? Tapez le code puis Entrée.')}</div>
        <div class="bqx-alt">
          ${canCam ? `<button class="mz-btn secondary" id="bqx-cam"><i data-lucide="camera"></i>Scanner avec la caméra</button>` : ''}
          <button class="mz-btn secondary" id="bqx-diag"><i data-lucide="activity"></i>La douchette ne répond pas ?</button>
        </div>
        ${intakeLogHtml()}
      </div>
      <div class="mzi-modfoot">
        <button class="mz-btn secondary" id="bqx-done">Terminer la reprise</button>
      </div>`, (el) => {
      const inp = $('#bqx-code', el);
      const submit = () => {
        const v = inp.value; inp.value = '';
        if (!String(v).trim()) { intakeHint('Tapez ou scannez un code.', 'warn', el); return; }
        intakeTake(v, { manual: true });
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      $('#bqx-go', el).onclick = submit;
      $('#bqx-done', el).onclick = intakeClose;
      const cam = $('#bqx-cam', el);
      if (cam) cam.onclick = () => openCamScan((c) => intakeTake(c));
      $('#bqx-diag', el).onclick = () => { disarmScanCapture(); openScannerTest(); };
      /* Le scan appartient à cet écran, et à rien d'autre. */
      armScanCapture((code) => intakeTake(code));
      intakeFocus(el);
    });
  }

  /* La douchette tape dans le champ : il doit avoir le curseur, tout le temps, y
     compris après un enregistrement — c'est ce qui permet d'enchaîner sans souris. */
  function intakeFocus(el) {
    setTimeout(() => { const i = $('#bqx-code', el || root); if (i) { i.focus(); i.select(); } }, 30);
  }
  /* Le message est MÉMORISÉ avant d'être écrit : paintIntake() reconstruit tout
     l'écran, et un texte posé juste avant le repaint disparaissait aussitôt —
     l'employé voyait « Douchette prête » alors que son scan venait d'être refusé. */
  function intakeHint(msg, tone, el) {
    intake.hint = msg ? { msg, tone: tone || '' } : null;
    const h = $('#bqx-hint', el || root);
    if (!h) return;
    h.textContent = msg;
    h.className = 'bqx-hint' + (tone ? ' is-' + tone : '');
  }

  /* ═══ le geste central : un code arrive ═══ */
  function intakeTake(raw, opts) {
    opts = opts || {};
    const j = intakeJudge(raw);
    if (j.kind === 'invalide') {
      intakeNote('erreur', `Lecture refusée · ${INVALID_MSG[j.reason] ? j.reason : 'illisible'}`);
      intakeHint(INVALID_MSG[j.reason] || 'Code illisible, rescannez.', 'bad');
      toast('Scan incomplet, rien n\'a été enregistré');
      paintIntake();
      return;
    }
    intake.hint = null;   // un code lisible efface l'avertissement du scan précédent
    if (j.kind === 'connu') { intakeKnown(j); return; }
    intakeNew(j, opts);
  }

  /* ═══ état 2 · code INCONNU → créer l'article (ou l'ajouter au précédent) ═══ */
  function intakeNew(j, opts) {
    intake.mode = 'nouveau';
    const cat = catDB();
    const cats = cat.listCategories();
    const prev = intake.lastProduct ? cat.getProduct(intake.lastProduct) : null;
    const manual = !!(opts && opts.manual);
    // Combien de fiches attendent leur code-barres (typiquement : ce que le
    // fichier fournisseur a fait entrer au tableau de bord).
    const bare = cat.countCodeless ? cat.countCodeless() : 0;
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="badge-check"></i>
        <div>
          <b>Code lu${manual ? ' (saisi à la main)' : ''} · nouveau</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      ${prev ? `
      <div class="bqx-chain">
        <div>
          <b>Même modèle que « ${esc(prev.product.name)} » ?</b>
          <span>Une autre taille ou couleur du même article : le nom, la catégorie et les prix sont repris, vous ne changez que la déclinaison.</span>
        </div>
        <button class="mz-btn" id="bqx-chain">Ajouter une déclinaison</button>
      </div>` : ''}
      ${bare ? `
      <div class="bqx-chain is-link">
        <div>
          <b>Cet article est déjà au catalogue, sans code-barres ?</b>
          <span>${bare} déclinaison${bare > 1 ? 's' : ''} attend${bare > 1 ? 'ent' : ''} son code — celles qui viennent du fichier fournisseur. Rattachez ce code au lieu de tout ressaisir.</span>
        </div>
        <button class="mz-btn" id="bqx-link">Chercher l'article</button>
      </div>` : ''}
      <div class="mzi-form bqx-form">
        <div class="mzi-fg"><label>Nom du produit</label><input id="bqx-name" placeholder="Ex. Jean Noir" autocomplete="off" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Catégorie</label><select id="bqx-cat">${catSelectOptions(state.invFilter && state.invFilter !== 'all' ? state.invFilter : (prev ? prev.product.categoryId : ''))}</select></div>
          <div class="mzi-fg"><label>Type de taille</label><select id="bqx-kind">${kindSelectOptions(prev ? prev.product.kind : 'taille')}</select></div>
        </div>
        <div class="mzi-fg"><label>Ou nouvelle catégorie</label><input id="bqx-newcat" placeholder="Laisser vide pour garder celle ci-dessus" autocomplete="off" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Prix de vente (MAD)</label><input id="bqx-price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="349" /></div>
          <div class="mzi-fg"><label>Coût d'achat (MAD)</label><input id="bqx-cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="optionnel" /></div>
        </div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        </div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes" placeholder="M" autocomplete="off" /><datalist id="bqx-sizes"></datalist></div>
          <div class="mzi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
        <div class="mzi-fg"><label>Autre précision (optionnel)</label><input id="bqx-flag" placeholder="Ex. coupe droite, lot été" autocomplete="off" /></div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-skip">Ignorer ce code</button>
        <button class="mz-btn" id="bqx-save"><i data-lucide="check"></i>Enregistrer et scanner le suivant</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      const kindSel = $('#bqx-kind', el), sizeList = $('#bqx-sizes', el);
      const fillSizes = () => { sizeList.innerHTML = cat.sizePresets(kindSel.value).map((s) => `<option value="${esc(s)}">`).join(''); };
      kindSel.onchange = fillSizes; fillSizes();

      if (prev) $('#bqx-chain', el).onclick = () => intakeVariant(j, intake.lastProduct);
      const linkBtn = $('#bqx-link', el);
      if (linkBtn) linkBtn.onclick = () => intakeLink(j);
      $('#bqx-skip', el).onclick = () => { intakeNote('erreur', `Code ${j.code} ignoré`); paintIntake(); };

      const save = () => {
        const name = $('#bqx-name', el).value.trim();
        if (!name) { toast('Le nom du produit est requis'); $('#bqx-name', el).focus(); return; }
        const size = $('#bqx-size', el).value.trim() || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        let catId = $('#bqx-cat', el).value || null;
        const newCat = $('#bqx-newcat', el).value.trim();
        if (newCat) catId = cat.addCategory(newCat).id;
        /* Créer le produit, sa déclinaison et rattacher le code, c'est UN geste :
           une seule écriture du catalogue au lieu de trois (voir batch()). */
        let p = null, ev = null, res = null;
        cat.batch(() => {
          p = cat.addProduct({
            name, categoryId: catId, kind: kindSel.value,
            priceMAD: bqMoney($('#bqx-price', el).value), cost: bqMoney($('#bqx-cost', el).value),
            art: prev ? prev.product.art : 'tshirt', flag: $('#bqx-flag', el).value.trim(),
          });
          ev = cat.ensureVariant({ productId: p.id, colorId: pickedColor(), size, stock: qty });
          res = cat.attachBarcode(ev.variant.id, j.code);
          if (!res.ok) cat.deleteProduct(p.id);   // jamais d'article orphelin
        });
        if (!res.ok) {
          /* Course rarissime : le code a été pris entre le scan et l'enregistrement
             (l'autre caisse, ou l'autre appareil). L'article vient d'être défait
             dans le batch ci-dessus, rien d'orphelin ne reste. */
          toast(res.reason === 'doublon' ? `Ce code vient d'être attribué à ${res.owner.product.name}` : 'Code refusé, rien n\'a été créé');
          paintIntake();
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = p.id;
        intakeNote('cree', `${name} · ${size} — ${qty} pièce${qty > 1 ? 's' : ''}, code conservé`);
        toast(`${name} enregistré · code ${j.code} conservé`);
        intakeHint(`${name} · ${size} enregistré. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      /* Entrée depuis n'importe quel champ enregistre : la reprise se fait au
         clavier, la souris ne devrait jamais être nécessaire. */
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => { const n = $('#bqx-name', el); if (n) n.focus(); }, 40);
    });
  }

  /* ═══ état 3 · enchaîner une déclinaison du MÊME produit ═══
     Le cas « Jean Noir » du cahier des charges : noir/S = code A, noir/M = code B,
     bleu/M = code C. On ne recrée pas le produit, on ne retape pas le prix. */
  function intakeVariant(j, pid) {
    intake.mode = 'variante';
    const cat = catDB();
    const d = cat.getProduct(pid);
    if (!d) { intakeNew(j, {}); return; }
    const presets = cat.sizePresets(d.product.kind);
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="git-branch"></i>
        <div>
          <b>Nouvelle déclinaison · ${esc(d.product.name)}</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-common">
        <span>Repris du produit</span>
        <b>${esc(d.category ? d.category.name : 'Divers')} · ${fmtMAD(d.product.priceMAD)}${d.product.cost ? ' · coût ' + fmtMAD(d.product.cost) : ''}</b>
      </div>
      <div class="mzi-form bqx-form">
        <div class="mzi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes2" value="" placeholder="${esc(presets[0] || 'TU')}" autocomplete="off" /><datalist id="bqx-sizes2">${presets.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="mzi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Déjà au catalogue</span>
        <div class="bqx-chips">${d.variants.map((v) => `<span class="bqx-chip"><i style="background:${v.colorHex}"></i>${esc(v.colorLabel)} · ${esc(v.size)} <b>${v.stock}</b></span>`).join('') || '<em>aucune déclinaison</em>'}</div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-back">Créer un autre produit</button>
        <button class="mz-btn" id="bqx-save"><i data-lucide="check"></i>Enregistrer et scanner le suivant</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      $('#bqx-back', el).onclick = () => intakeNew(j, {});
      const save = () => {
        const size = $('#bqx-size', el).value.trim() || presets[0] || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        let ev = null, res = null;
        cat.batch(() => {
          ev = cat.ensureVariant({ productId: pid, colorId: pickedColor(), size, stock: 0 });
          if (!ev.variant) return;
          res = cat.attachBarcode(ev.variant.id, j.code);
          if (!res.ok) { if (ev.created) cat.deleteVariant(ev.variant.id); return; }
          /* Une déclinaison qui existait déjà REÇOIT du stock — elle n'est pas
             remise à la quantité du carton. */
          if (qty > 0) cat.receiveStock(ev.variant.id, qty);
        });
        if (!ev || !ev.variant) { toast('Déclinaison impossible'); return; }
        const existed = !ev.created;
        if (!res || !res.ok) {
          if (res && res.reason === 'doublon') toast(`Ce code est déjà sur ${res.owner.product.name} · ${res.owner.variant.colorLabel} ${res.owner.variant.size}`);
          else toast('Code refusé');
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = pid;
        intakeNote('variante', `${d.product.name} · ${size} — ${existed ? 'code ajouté' : 'déclinaison créée'}, ${qty} pièce${qty > 1 ? 's' : ''}`);
        toast(`${d.product.name} · ${size} enregistré`);
        intakeHint(`${d.product.name} · ${size} enregistré. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => { const s = $('#bqx-size', el); if (s) s.focus(); }, 40);
    });
  }

  /* ═══ état 3 bis · RATTACHER le code à une fiche déjà importée ═══
     La seconde moitié d'une reprise : le fichier du fournisseur est entré au
     tableau de bord avec les noms, les prix et les coûts, mais sans code — un
     tarif Excel n'en porte pas. L'employé parcourt le magasin, scanne, et
     retrouve ici la fiche qui attend son code. Rien à ressaisir. */
  function intakeLink(j) {
    intake.mode = 'rattacher';
    const cat = catDB();
    const draw = (q) => {
      const hits = cat.listCodeless({ q, limit: 40 });
      if (!hits.length) {
        return `<div class="bqx-log-empty">${q ? 'Aucune fiche sans code-barres ne porte ce nom.' : 'Toutes les fiches ont déjà un code-barres.'}</div>`;
      }
      return `<div class="bqx-linklist">${hits.map((h) => `
        <div class="bqx-linkprod">
          <div class="bqx-linkhead">
            <span class="mzi-art">${artOf(h.product.art)}</span>
            <div><b>${esc(h.product.name)}</b><span>${fmtMAD(h.product.priceMAD)}${h.product.cost ? ' · coût ' + fmtMAD(h.product.cost) : ''} · ${h.variants.length}/${h.total} sans code</span></div>
          </div>
          <div class="bqx-chips">${h.variants.map((v) => `
            <button type="button" class="bqx-chip is-pick" data-link-v="${v.id}" data-link-p="${h.product.id}">
              <i style="background:${v.colorHex}"></i>${esc(v.colorLabel)} · ${esc(v.size)} <b>${v.stock}</b>
            </button>`).join('')}</div>
        </div>`).join('')}</div>`;
    };
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="link"></i>
        <div>
          <b>Rattacher ce code à une fiche existante</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-body">
        <div class="bqx-scanbox slim"><i data-lucide="search"></i>
          <input id="bqx-lq" placeholder="Nom de l'article…" autocomplete="off" />
        </div>
        <div class="mzi-help">Touchez la déclinaison correspondante : le code y sera rattaché tel quel, sans réimpression.</div>
        <div id="bqx-lres">${draw('')}</div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-lback">Retour</button>
      </div>`, (el) => {
      const res = $('#bqx-lres', el), q = $('#bqx-lq', el);
      const wire = () => {
        res.querySelectorAll('[data-link-v]').forEach((b) => b.addEventListener('click', () => {
          const vid = b.getAttribute('data-link-v'), pid = b.getAttribute('data-link-p');
          const r = cat.attachBarcode(vid, j.code);
          if (!r.ok) {
            toast(r.reason === 'doublon' ? `Ce code vient d'être attribué à ${r.owner.product.name}` : 'Rattachement impossible');
            return;
          }
          const d = cat.getProduct(pid);
          intake.count++;
          intake.lastProduct = pid;
          intakeNote('variante', `${d.product.name} — code rattaché à une fiche importée`);
          toast(`Code ${j.code} rattaché à ${d.product.name}`);
          intakeHint(`${d.product.name} a maintenant son code. Scannez l'article suivant.`, 'good');
          paintIntake();
        }));
      };
      /* Le champ de recherche se tape à la main ; la douchette, elle, doit
         pouvoir scanner l'article SUIVANT sans quitter cet écran. */
      armScanCapture((c) => intakeTake(c));
      let t = null;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { res.innerHTML = draw(q.value); wire(); icons(); }, 120);
      });
      $('#bqx-lback', el).onclick = () => intakeNew(j, {});
      wire();
      setTimeout(() => q.focus(), 40);
    });
  }

  /* ═══ état 4 · code DÉJÀ CONNU ═══
     Jamais de doublon silencieux. On montre ce que la boutique a déjà, et on
     propose les seules suites qui aient un sens : recevoir, compléter, corriger. */
  function intakeKnown(j) {
    intake.mode = 'connu';
    const cat = catDB();
    const pid = j.hit.product.id;
    const d = cat.getProduct(pid);
    const v = j.hit.variant;
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-known">
        <i data-lucide="package-check"></i>
        <div>
          <b>Article déjà au catalogue</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-known-card">
        <span class="mzi-art">${artOf(d.product.art)}</span>
        <div>
          <b>${esc(d.product.name)}</b>
          <span>${esc(d.category ? d.category.name : 'Divers')} · ${fmtMAD(d.product.priceMAD)} · ${d.stock} en stock au total</span>
          <span class="bqx-thisvar"><i style="background:${v.colorHex}"></i>Ce code désigne <b>${esc(v.colorLabel)} · ${esc(v.size)}</b> — ${v.stock} en stock</span>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Toutes ses déclinaisons</span>
        <div class="bqx-chips">${d.variants.map((x) => `<span class="bqx-chip${x.id === v.id ? ' on' : ''}"><i style="background:${x.colorHex}"></i>${esc(x.colorLabel)} · ${esc(x.size)} <b>${x.stock}</b></span>`).join('')}</div>
      </div>
      <div class="bqx-acts">
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="package-plus"></i><b>Recevoir du stock</b></div>
          <p>Plusieurs pièces du même article : indiquez la quantité, sans scanner chaque pièce.</p>
          <div class="bqx-qtyrow">
            <button class="mzi-mini" id="bqx-qminus" aria-label="Moins">−</button>
            <input id="bqx-rqty" type="number" min="1" step="1" inputmode="numeric" value="1" />
            <button class="mzi-mini" id="bqx-qplus" aria-label="Plus">+</button>
            <button class="mz-btn" id="bqx-receive">Ajouter au stock</button>
          </div>
        </div>
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="git-branch"></i><b>Une taille ou couleur manque</b></div>
          <p>Le fournisseur donne un code par déclinaison : ajoutez-la sans recréer le produit.</p>
          <button class="mz-btn secondary" id="bqx-addvar">Ajouter une déclinaison</button>
        </div>
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="pencil"></i><b>La fiche est fausse</b></div>
          <p>Nom, prix ou catégorie saisis de travers : corrigez l'article existant.</p>
          <button class="mz-btn secondary" id="bqx-fix">Corriger la fiche</button>
        </div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-next">Passer au suivant</button>
      </div>`, (el) => {
      const qty = $('#bqx-rqty', el);
      const nudge = (dz) => { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + dz); };
      $('#bqx-qminus', el).onclick = () => nudge(-1);
      $('#bqx-qplus', el).onclick = () => nudge(1);
      const receive = () => {
        const n = parseInt(qty.value, 10) || 0;
        const res = cat.receiveStock(v.id, n);
        if (!res.ok) { toast(res.reason === 'quantite' ? 'Indiquez une quantité d\'au moins 1' : 'Réception impossible'); return; }
        /* Un réassort compte comme un article repris : sans ce `count++`, une
           session passée entièrement à remettre du stock sur des tailles déjà
           connues affichait « 0 article · 12 pièces » — un compteur qui se
           contredit lui-même et fait douter la vendeuse de tout l'écran. */
        intake.count++;
        intake.pieces += res.added;
        intakeNote('recu', `${d.product.name} · ${v.size} — ${res.added} reçue${res.added > 1 ? 's' : ''} (${res.before} → ${res.stock})`);
        toast(`${d.product.name} · ${v.size} : ${res.before} → ${res.stock}`);
        intakeHint(`${res.added} pièce${res.added > 1 ? 's' : ''} ajoutée${res.added > 1 ? 's' : ''} · ${d.product.name} ${v.size} passe à ${res.stock}. Scannez le suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-receive', el).onclick = receive;
      qty.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); receive(); } };
      $('#bqx-addvar', el).onclick = () => intakeAddVariantHere(pid);
      $('#bqx-fix', el).onclick = () => intakeFix(pid);
      $('#bqx-next', el).onclick = () => { intake.lastProduct = pid; paintIntake(); };
      setTimeout(() => { if (qty) { qty.focus(); qty.select(); } }, 40);
    });
  }

  /* Ajouter une déclinaison MANQUANTE à un article connu, avec son propre code
     fournisseur — on redemande le code puisque celui qu'on vient de scanner
     appartient déjà à une autre déclinaison. */
  function intakeAddVariantHere(pid) {
    const cat = catDB();
    const d = cat.getProduct(pid); if (!d) return;
    const presets = cat.sizePresets(d.product.kind);
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new"><i data-lucide="git-branch"></i>
        <div><b>Déclinaison manquante · ${esc(d.product.name)}</b><span>Scannez le code de CETTE taille/couleur, ou laissez vide pour l'ajouter sans code.</span></div>
      </div>
      <div class="mzi-form bqx-form">
        <div class="mzi-fg"><label>Code-barres de la déclinaison</label>
          <div class="bqx-scanbox slim"><i data-lucide="scan-line"></i><input id="bqx-vcode" placeholder="Scannez ou tapez…" autocomplete="off" spellcheck="false" /></div>
          <div class="mzi-help" id="bqx-vhint">Chaque déclinaison peut porter son propre code fournisseur.</div>
        </div>
        <div class="mzi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes3" placeholder="${esc(presets[0] || 'TU')}" autocomplete="off" /><datalist id="bqx-sizes3">${presets.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="mzi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Déjà au catalogue</span>
        <div class="bqx-chips">${d.variants.map((x) => `<span class="bqx-chip"><i style="background:${x.colorHex}"></i>${esc(x.colorLabel)} · ${esc(x.size)} <b>${x.stock}</b></span>`).join('')}</div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-back">Retour</button>
        <button class="mz-btn" id="bqx-save"><i data-lucide="check"></i>Ajouter la déclinaison</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      const codeIn = $('#bqx-vcode', el);
      /* Le verdict s'affiche sous le champ, et il est le MÊME que le code arrive
         de la douchette ou des doigts : sans le second câblage, un employé qui
         tape un code déjà pris ne l'apprenait qu'au moment d'enregistrer. */
      const judgeV = (raw) => {
        const jj = intakeJudge(raw);
        const hint = $('#bqx-vhint', el);
        if (!hint) return jj;
        if (jj.kind === 'invalide') { hint.textContent = INVALID_MSG[jj.reason] || 'Code illisible.'; hint.className = 'mzi-help is-bad'; }
        else if (jj.kind === 'connu') { hint.textContent = `Déjà utilisé par ${jj.hit.product.name} · ${jj.hit.variant.colorLabel} ${jj.hit.variant.size}. Un code ne peut désigner qu'un seul article.`; hint.className = 'mzi-help is-bad'; }
        else { hint.textContent = `Code lu · ${(window.KiwiBarcode && window.KiwiBarcode.symLabel) ? window.KiwiBarcode.symLabel(jj.sym) : ''}${jj.check === 'bad' ? ' (clé de contrôle inhabituelle, accepté tel quel)' : ''}`; hint.className = 'mzi-help is-good'; }
        return jj;
      };
      armScanCapture((c) => { codeIn.value = normScan(c); judgeV(c); });   /* le scan vient ici, pas sur le ticket */
      const liveJudge = () => { const v = codeIn.value.trim(); if (v) judgeV(v); };
      codeIn.addEventListener('input', liveJudge);
      codeIn.addEventListener('change', liveJudge);
      $('#bqx-back', el).onclick = () => paintIntake();
      const save = () => {
        const size = $('#bqx-size', el).value.trim() || presets[0] || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        const raw = codeIn.value.trim();
        if (raw) {
          const jj = judgeV(raw);   // refuse ET explique, sous le champ concerné
          if (jj.kind === 'invalide') { toast(INVALID_MSG[jj.reason] || 'Code illisible'); return; }
          if (jj.kind === 'connu') { toast(`Code déjà porté par ${jj.hit.product.name} · ${jj.hit.variant.size}`); return; }
        }
        let ev = null, res = null;
        cat.batch(() => {
          ev = cat.ensureVariant({ productId: pid, colorId: pickedColor(), size, stock: 0 });
          if (!ev.variant) return;
          if (raw) {
            res = cat.attachBarcode(ev.variant.id, raw);
            if (!res.ok) { if (ev.created) cat.deleteVariant(ev.variant.id); return; }
          }
          if (qty > 0) cat.receiveStock(ev.variant.id, qty);
        });
        if (!ev || !ev.variant) { toast('Déclinaison impossible'); return; }
        if (res && !res.ok) {
          toast(res.reason === 'doublon' ? `Code déjà utilisé par ${res.owner.product.name}` : 'Code refusé');
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = pid;
        intakeNote('variante', `${d.product.name} · ${size} — ${ev.created ? 'déclinaison créée' : 'déjà présente'}, ${qty} pièce${qty > 1 ? 's' : ''}`);
        toast(`${d.product.name} · ${size} ajouté`);
        intakeHint(`${d.product.name} · ${size} ajouté. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => codeIn.focus(), 40);
    });
  }

  /* Corriger une fiche saisie de travers. Geste sensible (le prix part en caisse
     et le coût en compta) : passe par l'autorisation responsable, comme une remise. */
  function intakeFix(pid) {
    const cat = catDB();
    const d = cat.getProduct(pid); if (!d) return;
    const p = d.product;
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-fix"><i data-lucide="pencil"></i>
        <div><b>Corriger « ${esc(p.name)} »</b><span>Le code-barres et le stock ne changent pas — seule la fiche est corrigée.</span></div>
      </div>
      <div class="mzi-form bqx-form">
        <div class="mzi-fg"><label>Nom</label><input id="bqx-fname" value="${esc(p.name)}" /></div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Catégorie</label><select id="bqx-fcat">${catSelectOptions(p.categoryId)}</select></div>
          <div class="mzi-fg"><label>Type de taille</label><select id="bqx-fkind">${kindSelectOptions(p.kind)}</select></div>
        </div>
        <div class="mzi-frow">
          <div class="mzi-fg"><label>Prix de vente (MAD)</label><input id="bqx-fprice" type="number" min="0" step="0.01" value="${p.priceMAD}" /></div>
          <div class="mzi-fg"><label>Coût d'achat (MAD)</label><input id="bqx-fcost" type="number" min="0" step="0.01" value="${p.cost || 0}" /></div>
        </div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-back">Retour</button>
        <button class="mz-btn" id="bqx-fsave"><i data-lucide="check"></i>Enregistrer la correction</button>
      </div>`, (el) => {
      $('#bqx-back', el).onclick = () => paintIntake();
      $('#bqx-fsave', el).onclick = () => {
        const name = $('#bqx-fname', el).value.trim();
        if (!name) { toast('Le nom est requis'); return; }
        const patch = {
          name, categoryId: $('#bqx-fcat', el).value || null, kind: $('#bqx-fkind', el).value,
          priceMAD: bqMoney($('#bqx-fprice', el).value), cost: bqMoney($('#bqx-fcost', el).value),
        };
        const apply = () => {
          cat.updateProduct(pid, patch);
          intakeNote('recu', `${name} — fiche corrigée`);
          toast('Fiche corrigée');
          paintIntake();
        };
        /* Changer le prix change ce que la caisse encaissera, et l'ancien prix
           est peut-être le bon : on fait confirmer l'écart explicitement plutôt
           que de l'appliquer au passage. (openApprove() ne convient pas ici —
           il parle d'une remise et lit state.ticket, qui n'existe pas pendant
           une reprise de stock.) */
        if (patch.priceMAD !== p.priceMAD) intakeConfirmPrice(p, patch.priceMAD, apply);
        else apply();
      };
      setTimeout(() => { const n = $('#bqx-fname', el); if (n) { n.focus(); n.select(); } }, 40);
    });
  }

  /* Un prix corrigé se répercute sur tous les encaissements suivants : l'écart est
     montré en clair, avec le nom de qui est à la caisse, avant d'être appliqué. */
  function intakeConfirmPrice(p, next, onOk) {
    const who = (STAFF.caissiere && STAFF.caissiere.name) || '';
    invSetModal(`
      <button class="mz-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqx-found is-fix"><i data-lucide="alert-triangle"></i>
        <div><b>Confirmer le changement de prix</b><span>${esc(p.name)} sera encaissé à ce nouveau prix dès la prochaine vente.</span></div>
      </div>
      <div class="bqx-pricediff">
        <div><span>Prix actuel</span><b>${fmtMAD(p.priceMAD)}</b></div>
        <i data-lucide="arrow-right"></i>
        <div class="next"><span>Nouveau prix</span><b>${fmtMAD(next)}</b></div>
      </div>
      <div class="mzi-modfoot bqx-foot">
        <button class="mz-btn secondary" id="bqx-pno">Garder ${fmtMAD(p.priceMAD)}</button>
        <button class="mz-btn" id="bqx-pyes"><i data-lucide="check"></i>Appliquer${who ? ' — ' + esc(who) : ''}</button>
      </div>`, (el) => {
      $('#bqx-pno', el).onclick = () => intakeFix(p.id);
      $('#bqx-pyes', el).onclick = () => onOk();
    });
  }

  /* ─── label printing (printer wired to the caisse) ─── */
  /* L'étiquette de rayon porte le prix QU'ON ENCAISSE, pas le prix catalogue.
     Sans ça, lancer une promotion obligeait à réimprimer tout un rayon à la
     main — ou, pire, laissait les étagères annoncer l'ancien prix pendant que
     la caisse en encaisse un autre : c'est le commerçant qui se retrouve à
     devoir expliquer l'écart à la cliente, au comptoir, sans savoir d'où il
     vient. `was` fait ressortir l'ancien prix barré, comme une vraie affiche de
     soldes. Quand la promotion s'arrête, réimprimer redonne le prix plein. */
  function labelForVariant(pid, v) {
    const cat = catDB(); const p = cat.getProduct(pid).product;
    const code = cat.primaryBarcode(v);
    if (!code) return null;
    const extra = v.note || v.colorSource || '';
    const pr = promoFor(pid);
    return {
      title: p.name, sub: `${v.colorLabel}${extra ? ` (${extra})` : ''} · ${v.size}`,
      price: fmtNum(pr ? pr.price : p.priceMAD),
      was: pr ? fmtNum(pr.was) : null,
      code, format: window.KiwiBarcode.isValidEan13(code) ? 'ean13' : 'code128',
    };
  }
  function printVariantLabel(vid) {
    const cat = catDB();
    let pid = null, v = null;
    for (const p of cat.listProducts({ includeArchived: true })) { const found = cat.listVariants(p.id).find((x) => x.id === vid); if (found) { pid = p.id; v = found; break; } }
    if (!v) return;
    const label = labelForVariant(pid, v);
    if (!label) { toast('Générez d\'abord un EAN-13'); return; }
    labelToast(window.KiwiBarcode.printLabels([label], { copies: 1 }), 'Étiquette');
  }
  function printProductLabels(pid) {
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const labels = [];
    d.variants.forEach((v) => {
      const label = labelForVariant(pid, v);
      if (!label) return;
      const stock = Math.max(0, Math.floor(Number(v.stock) || 0));
      for (let i = 0; i < stock; i++) labels.push(label);
    });
    if (!labels.length) { toast('Aucune unité en stock avec un code-barres à imprimer'); return; }
    labelToast(window.KiwiBarcode.printLabels(labels, { copies: 1 }), `${labels.length} étiquette(s)`);
  }
  // Toast the true outcome of a print (thermal / browser / connect-a-printer),
  // never a blanket "sent" — printLabels resolves with { ok, browser?, reason? }.
  function labelToast(p, what) {
    if (!p || !p.then) return;
    p.then((res) => {
      // Only announce a real send to a connected printer (res.via = bluetooth/bridge).
      // For the chooser (Imprimer / Enregistrer en PDF), the modal speaks for itself.
      if (res && res.ok && res.via) toast(`${what} envoyée à l'imprimante`);
    });
  }

  /* ═══════════════════════ FIN DE SERVICE ═══════════════════════
     Le cycle de poste de la caisse restaurant, porté à la boutique : fond
     d'ouverture au déverrouillage, clôture avec tiroir-caisse et comptage,
     rapport Z imprimé et classé (KiwiDayReport) — le MÊME document que le
     tableau de bord rouvre le lendemain, rangé sous le même slug. Réservé aux
     VRAIES boutiques : la démo (PIN 0002) garde son entrée directe — elle n'a
     ni tiroir ni comptabilité, et KiwiDayReport refuse de toute façon
     d'archiver une démo. L'écran d'ouverture et la feuille de clôture
     réutilisent les styles .clockin-* / .clo-* de kiwi-caisse.html : même
     geste, même dessin, zéro CSS dupliqué. */

  const BQ_SHIFT_KEY = 'kiwi:bqShift';
  let bqShift = null;               /* { openedAt: ms, openedBy, float } */
  (function bqShiftRestore() {
    if (IS_DEMO) return;
    try {
      const s = JSON.parse(localStorage.getItem(BQ_SHIFT_KEY) || 'null');
      if (s && +s.openedAt > 0) bqShift = { openedAt: +s.openedAt, openedBy: String(s.openedBy || ''), float: +s.float || 0 };
    } catch (_) {}
  })();
  function bqShiftPersist() {
    try {
      if (bqShift) localStorage.setItem(BQ_SHIFT_KEY, JSON.stringify(bqShift));
      else localStorage.removeItem(BQ_SHIFT_KEY);
    } catch (_) {}
  }

  /* Ce que chaque vente a réellement mis dans le tiroir. Les parts de règlement
     sont figées sur la vente à l'encaissement (sale.parts) ; une vente d'avant
     cette version n'en porte pas, et on retombe sur `methods` — exact pour un
     règlement simple, et pour un mixte le total est posé sur le premier moyen
     monétaire (approximation limitée au jour de la transition). Un avoir n'est
     jamais de l'argent qui rentre : il consomme une dette déjà comptée. */
  function bqMoneyParts(s) {
    if (Array.isArray(s.parts) && s.parts.length) {
      return s.parts.filter((p) => p && p.m !== 'avoir' && +p.amount > 0)
        .map((p) => ({ m: p.m, amount: +p.amount }));
    }
    const names = String(s.methods || '').split(' + ').filter((m) => m && m !== 'avoir');
    return names.length && +s.total > 0 ? [{ m: names[0], amount: +s.total }] : [];
  }
  const BQ_SRV_METHOD = { 'espèces': 'cash', 'carte': 'card', 'livraison': 'delivery' };

  function bqDayTotals() {
    const t = { moneyIn: 0, cash: 0, card: 0, delivery: 0, other: 0, txns: 0, paidTxns: 0, items: 0, discounts: 0, discountsN: 0, promoOff: 0, avoirUsed: 0, avoirUsedN: 0, avoirIssued: 0, avoirIssuedN: 0 };
    salesToday().forEach((s) => {
      let took = 0;
      /* L'avoir consommé, compté À PART du reste. bqMoneyParts l'écarte — à
         raison, ce n'est pas de l'argent qui rentre — mais l'écarter du total
         ne dispense pas de le dire : la marchandise, elle, est bien sortie du
         magasin. Sans cette ligne, un Z pouvait laisser partir 1 200 MAD de
         stock contre un avoir sans qu'aucun chiffre de la clôture ne bouge. */
      let onAvoir = 0;
      if (Array.isArray(s.parts)) s.parts.forEach((p) => { if (p && p.m === 'avoir') onAvoir += +p.amount || 0; });
      if (onAvoir > 0) { t.avoirUsed += onAvoir; t.avoirUsedN++; }
      bqMoneyParts(s).forEach((p) => {
        if (p.m !== 'livraison') took += p.amount;
        if (p.m === 'espèces') t.cash += p.amount;
        else if (p.m === 'carte') t.card += p.amount;
        else if (p.m === 'livraison') t.delivery += p.amount;
        else t.other += p.amount;
      });
      if (took > 0) { t.moneyIn += took; t.paidTxns++; }
      /* DEUX compteurs, parce qu'il y a deux questions. `paidTxns` ne retient
         que les tickets qui ont fait entrer de l'argent — c'est le diviseur du
         ticket moyen. `txns` compte TOUS les tickets du jour, y compris celui
         réglé entièrement par avoir ou parti en livraison : sans lui, la
         clôture affichait « Transactions 6 · Articles vendus 6 » alors que les
         articles, eux, étaient comptés sur sept tickets. Deux lignes voisines
         qui ne parlaient pas de la même journée. */
      t.txns++;
      (s.lines || []).forEach((ln) => { t.items += lineAvailableQty(ln); });
      const d = +s.discount || 0;
      if (d > 0) { t.discounts += d; t.discountsN++; }
      /* Compté À PART des réductions. Une gérante qui voit « 4 200 MAD de
         réductions accordées » sans savoir que 3 900 viennent de la promotion
         qu'elle a elle-même lancée croit que son équipe brade le magasin. */
      t.promoOff += +s.promoOff || 0;
    });
    /* Les deux sens de l'avoir sur la même journée : ce qui a été ÉMIS (une
       dette que le magasin vient de contracter) et ce qui a été CONSOMMÉ (une
       dette qu'il vient d'éteindre en marchandise). Les additionner serait un
       contresens ; les taire l'était aussi. */
    AVOIRS.forEach((a) => {
      if (!a || !a.at || !isToday(a.at)) return;
      const v = +a.amount || 0;
      if (v > 0) { t.avoirIssued += v; t.avoirIssuedN++; }
    });
    ['moneyIn', 'cash', 'card', 'delivery', 'other', 'discounts', 'promoOff', 'avoirUsed', 'avoirIssued'].forEach((k) => { t[k] = Math.round(t[k] * 100) / 100; });
    return t;
  }

  /* Le journal du jour, traduit vers la forme que KiwiDayReport.build attend.
     Une entrée PAR PART monétaire — la même écriture que la caisse restaurant,
     où chaque part d'un règlement partagé passe par recordSale : c'est ce qui
     rend le tiroir exact quand un ticket est réglé moitié carte moitié espèces.
     Le panier ne voyage qu'avec la première part, sinon le classement par
     rayon compterait chaque article deux fois. */
  function bqReportSales() {
    const out = [];
    salesToday().forEach((s) => {
      const at = (s.at instanceof Date ? s.at : new Date(s.at)).getTime();
      const lines = (s.lines || []).filter((ln) => lineAvailableQty(ln) > 0).map((ln) => ({
        name: ((P[ln.pid] && P[ln.pid].name) || 'Article') + (ln.size ? ' ' + ln.size : ''),
        qty: lineAvailableQty(ln),
        total: Math.round((+ln.unit || 0) * lineAvailableQty(ln)),
        cat: rayonOf(ln.pid) || '',
      }));
      let first = true;
      bqMoneyParts(s).forEach((p, i) => {
        out.push({
          id: s.id + (i ? '#' + i : ''),
          ts: at,
          amount: p.amount,
          method: BQ_SRV_METHOD[p.m] || 'wallet',
          label: s.kind === 'echange' ? 'Différence échange' : 'Vente',
          ref: s.id,
          cashier: s.by || '',
          lines: first && lines.length ? lines : null,
        });
        first = false;
      });
    });
    return out;
  }

  function bqReportSession(counted) {
    const t = bqDayTotals();
    return {
      openedAt: bqShift ? bqShift.openedAt : 0,
      openedBy: bqShift ? bqShift.openedBy : '',
      closedBy: (STAFF.caissiere && STAFF.caissiere.name) || '',
      openingFloat: bqShift ? bqShift.float : 0,
      cashMovements: [], handovers: [],
      discounts: t.discounts, discountsCount: t.discountsN, cancels: 0,
      /* L'avoir voyage jusqu'au rapport, sinon il ne sort que sur l'écran de
         clôture et disparaît du Z imprimé — le seul document qui reste. */
      avoirs: { issued: t.avoirIssued, issuedCount: t.avoirIssuedN, used: t.avoirUsed, usedCount: t.avoirUsedN },
      countedCash: counted,
    };
  }
  /* La journée commerciale d'un service est celle de son OUVERTURE (même règle
     que la caisse restaurant) : une boutique de souk ouverte jusqu'après minuit
     clôture UNE journée, pas deux. */
  function bqBuildReport(counted, closedAt) {
    const DR = window.KiwiDayReport;
    if (!DR) return null;
    const sess = bqReportSession(counted);
    if (closedAt) sess.closedAt = closedAt;
    const pv = pvPaired() || {};
    return DR.build({
      day: DR.businessDay(bqShift ? bqShift.openedAt : Date.now()),
      sales: bqReportSales(),
      session: sess,
      store: { slug: DR.storeSlug(), name: pv.name || '', location: pv.location || '', type: pv.type || 'boutique' },
      source: 'caisse',
    });
  }
  /* L'instantané provisoire (closed:false) tient le tableau de bord à jour
     pendant le service, sans compter comme une clôture — même contrat que
     saveProvisional() côté restaurant. */
  let bqLastProv = 0;
  function bqSaveProvisional(force) {
    if (IS_DEMO || !window.KiwiDayReport || !bqShift) return;
    if (!force && Date.now() - bqLastProv < 90000) return;
    bqLastProv = Date.now();
    try {
      const r = bqBuildReport(null, 0);
      if (!r) return;
      r.closed = false;
      window.KiwiDayReport.save(r, { reopen: false, note: 'en cours', by: bqShift.openedBy });
    } catch (_) {}
  }

  function bqPrintReport(report, copyLabel) {
    if (!window.KiwiPrinter || !window.KiwiPrinter.printDayReport) {
      toast('Imprimante indisponible'); return Promise.resolve({ ok: false });
    }
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', item: 'article', cat: 'rayon' };
    const hm = (ms) => { if (!ms) return ''; const d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
    const p = String(report.day || '').split('-');
    const pv = pvPaired() || {};
    return window.KiwiPrinter.printDayReport({
      report: report,
      shop: pv.name || 'Kiwi',
      address: pv.location || '',
      title: 'RAPPORT JOURNALIER',
      dateLabel: p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : report.day,
      copy: copyLabel || '',
      openedLabel: hm(report.openedAt),
      closedLabel: hm(report.closedAt || Date.now()),
      detailTitle: 'DÉTAIL PAR ' + String(V.cat || 'rayon').toUpperCase(),
      drawerTitle: 'TIROIR-CAISSE',
      netLabel: 'NET DU JOUR',
      unitWord: V.items || 'articles',
      unitWordOne: V.item || '',
      notCounted: 'non compté',
      handoverWord: 'Passation',
      reopenWord: 'Clôture n°',
      methodLabels: { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR', delivery: 'Livraison · à recevoir' },
      fmt: (n) => fmtMAD(n).replace(/\s*MAD\s*$/, ''),
    }).then((res) => {
      if (res && res.ok) toast(res.via === 'browser' ? 'Rapport envoyé au pilote système' : 'Rapport imprimé');
      else toast('Impression impossible · le rapport reste dans le tableau de bord');
      return res || { ok: false };
    }, () => { toast('Impression impossible · le rapport reste dans le tableau de bord'); return { ok: false }; });
  }

  /* ── l'écran d'ouverture (fond de caisse) ──
     Même dessin que le clock-in restaurant, mêmes classes ; seul le conteneur
     porte .mz-clockin, que pos-boutique.css ré-affiche par-dessus le masquage
     body.is-pos. Le fond retenu est mémorisé PAR ÉTABLISSEMENT, sous la même
     clé que la caisse restaurant : un appareil qui sert deux commerces retient
     deux montants. */
  function bqFloatMemKey() {
    try { const p = pvPaired(); if (p && p.merchant) return 'kiwi:openingFloat:v1:' + p.merchant; } catch (_) {}
    return 'kiwi:openingFloat:v1:boutique';
  }
  let bqFloat = 500;
  function bqMaybeOpenScreen() {
    if (IS_DEMO || bqShift) return;
    bqShowOpenScreen();
  }
  function bqShowOpenScreen() {
    if (document.getElementById('mz-clockin')) return;
    const pv = pvPaired() || {};
    const who = ((STAFF.caissiere && STAFF.caissiere.name) || '').trim().split(/\s+/)[0] || 'Caissier';
    const role = (STAFF.caissiere && STAFF.caissiere.role) || 'Caissier';
    const DDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const DMONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const el = document.createElement('div');
    el.className = 'clockin-screen mz-clockin';
    el.id = 'mz-clockin';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="clockin-top">
        <div class="clockin-brand" aria-label="Kiwi"><img src="assets/kiwi-newlogo-inverse.svg" alt="" draggable="false"></div>
        <div class="clockin-tagline">— version commerçant</div>
      </div>
      <div class="clockin-mid">
        <div class="clockin-greet">Bonjour <em>${esc(who)}</em></div>
        <div class="clockin-role">${esc(role)} · ${esc(pv.name || 'Boutique')}</div>
        <div class="clockin-clock" id="bqci-time">--:--</div>
        <div class="clockin-date" id="bqci-date"></div>
        <div class="clockin-float">
          <span class="clockin-float-label">Fond d'ouverture</span>
          <div class="clockin-float-chips" id="bqci-chips">
            <button class="ci-float-chip" data-float="300">300 MAD</button>
            <button class="ci-float-chip is-active" data-float="500">500 MAD</button>
            <button class="ci-float-chip" data-float="1000">1 000 MAD</button>
            <button class="ci-float-chip" data-float="custom" aria-expanded="false" aria-controls="bqci-custom">Autre</button>
          </div>
          <div class="clockin-float-custom" id="bqci-custom" hidden>
            <input id="bqci-input" class="ci-float-input" type="number"
                   inputmode="decimal" min="0" step="any" placeholder="0"
                   aria-label="Fond d'ouverture, montant libre en dirhams">
            <span class="ci-float-cur" aria-hidden="true">MAD</span>
          </div>
        </div>
      </div>
      <div class="clockin-bottom">
        <button class="clockin-btn" id="bqci-btn">
          <i data-lucide="unlock" class="clockin-btn-ic"></i>
          <span class="clockin-btn-label">Ouvrir la caisse</span>
          <span class="clockin-btn-check" aria-hidden="true"><i data-lucide="check"></i></span>
        </button>
        <div class="clockin-foot">${esc(pv.location || '')}</div>
      </div>`;
    document.body.appendChild(el);

    const chips  = el.querySelector('#bqci-chips');
    const custom = el.querySelector('#bqci-custom');
    const input  = el.querySelector('#bqci-input');
    const mark = (chip) => el.querySelectorAll('.ci-float-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    const showCustom = (on, focus) => {
      custom.hidden = !on;
      const b = chips.querySelector('[data-float="custom"]');
      if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on && focus) { input.focus(); input.select(); }
    };
    const remember = () => { try { localStorage.setItem(bqFloatMemKey(), String(bqFloat)); } catch (_) {} };

    /* Restitution du dernier fond utilisé par CE magasin. */
    let saved = NaN;
    try { saved = parseFloat(localStorage.getItem(bqFloatMemKey())); } catch (_) {}
    if (Number.isFinite(saved) && saved >= 0) {
      bqFloat = saved;
      const preset = chips.querySelector(`[data-float="${saved}"]`);
      if (preset) mark(preset);
      else { mark(chips.querySelector('[data-float="custom"]')); input.value = String(saved); showCustom(true, false); }
    } else bqFloat = 500;

    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-float]');
      if (!chip) return;
      mark(chip);
      if (chip.dataset.float === 'custom') {
        showCustom(true, true);
        const v = parseFloat(input.value);
        bqFloat = Number.isFinite(v) && v > 0 ? v : 0;
        return;
      }
      showCustom(false);
      bqFloat = parseInt(chip.dataset.float, 10) || 500;
      remember();
    });
    input.addEventListener('input', () => {
      if (input.value && parseFloat(input.value) < 0) input.value = input.value.replace('-', '');
      const v = parseFloat(input.value);
      bqFloat = Number.isFinite(v) && v > 0 ? v : 0;
      remember();
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });

    const tick = () => {
      const n = new Date();
      const tEl = el.querySelector('#bqci-time'), dEl = el.querySelector('#bqci-date');
      if (tEl) tEl.textContent = pad2(n.getHours()) + ':' + pad2(n.getMinutes());
      if (dEl) dEl.textContent = DDAYS[n.getDay()] + ' ' + n.getDate() + ' ' + DMONTHS[n.getMonth()];
    };
    tick();
    const timer = setInterval(tick, 10000);

    el.querySelector('#bqci-btn').addEventListener('click', () => {
      el.querySelector('#bqci-btn').classList.add('is-confirmed');
      icons();
      bqShift = { openedAt: Date.now(), openedBy: (STAFF.caissiere && STAFF.caissiere.name) || '', float: bqFloat };
      bqShiftPersist();
      bqSaveProvisional(true);
      setTimeout(() => el.classList.add('is-leaving'), 420);
      setTimeout(() => { clearInterval(timer); el.remove(); }, 940);
    });

    requestAnimationFrame(() => { el.classList.add('is-visible'); el.setAttribute('aria-hidden', 'false'); icons(); });
  }

  /* ── la clôture ── */
  let bqCloVeil = null, bqCloExpected = 0, bqClosedReport = null;
  function bqFmtDur(min) {
    if (min < 60) return `${min} mn`;
    return `${Math.floor(min / 60)}h${pad2(min % 60)}`;
  }
  function bqUpdateEcart() {
    const v = bqCloVeil; if (!v) return;
    const line = v.querySelector('#bqclo-ecart-line'), out = v.querySelector('#bqclo-ecart'), inp = v.querySelector('#bqclo-count');
    if (!line || !out) return;
    line.classList.remove('is-ok', 'is-off');
    const raw = inp ? inp.value : '';
    if (raw === '' || raw == null) { out.textContent = '—'; return; }
    const ecart = (parseFloat(raw) || 0) - bqCloExpected;
    out.textContent = (ecart > 0 ? '+ ' : (ecart < 0 ? '− ' : '')) + fmtMAD(Math.abs(ecart));
    line.classList.add(Math.abs(ecart) <= 5 ? 'is-ok' : 'is-off');
  }
  function bqOpenCloture() {
    if (!bqCloVeil) {
      bqCloVeil = document.createElement('div');
      bqCloVeil.className = 'cloture-veil';
      bqCloVeil.id = 'mz-cloture';
      bqCloVeil.setAttribute('role', 'dialog');
      bqCloVeil.setAttribute('aria-modal', 'true');
      document.body.appendChild(bqCloVeil);
    }
    const v = bqCloVeil;
    const now = new Date();
    const openedAt = bqShift ? new Date(bqShift.openedAt) : now;
    const durMin = Math.max(0, Math.floor((now - openedAt) / 60000));
    const t = bqDayTotals();
    const pv = pvPaired() || {};
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', cats: 'rayons', cat: 'rayon' };

    const rows = [
      ['Service ouvert à', fmtHM(openedAt), false, ''],
      ['Durée du service', bqFmtDur(durMin), false, ''],
      ['Transactions', String(t.txns), false, ''],
      ['Articles vendus', String(t.items), false, ''],
      ['Total encaissé', fmtMAD(t.moneyIn), true, 'total'],
      ['dont Carte', fmtMAD(t.card), true, 'sub'],
      ['dont Espèces', fmtMAD(t.cash), true, 'sub'],
    ];
    if (t.other > 0) rows.push(['dont Autres', fmtMAD(t.other), true, 'sub']);
    /* HORS du bloc « dont » : une livraison n'est pas encaissée, elle est à
       recevoir. Nichée en sous-ligne du total, elle se lisait comme une de ses
       composantes — alors qu'aucun dirham correspondant n'est dans le tiroir. */
    if (t.delivery > 0) rows.push(['Livraisons · à recevoir', fmtMAD(t.delivery), true, '']);
    if (t.paidTxns > 0) rows.push(['Ticket moyen', fmtMAD(t.moneyIn / t.paidTxns), true, '']);
    if (t.promoOff > 0) rows.push(['Promotions du magasin', fmtMAD(t.promoOff), true, '']);
    rows.push(['Réductions accordées', fmtMAD(t.discounts), true, '']);
    if (t.avoirIssued > 0) rows.push(['Avoirs émis', fmtMAD(t.avoirIssued), true, '']);
    /* Réglé en avoir : la contrepartie du « Total encaissé ». Ces tickets ont
       vidé des rayons sans faire sonner le tiroir — les compter nulle part
       revenait à imprimer un Z où la marchandise partie ne figure pas. */
    if (t.avoirUsed > 0) rows.push([`Réglé en avoir (${t.avoirUsedN})`, fmtMAD(t.avoirUsed), true, '']);

    /* Tiroir : fond + espèces. La boutique n'a ni pourboires ni mouvements de
       caisse — les lignes qui n'existent pas ne s'affichent pas. */
    bqCloExpected = (bqShift ? bqShift.float : 0) + t.cash;
    const dLines = [
      ["Fond d'ouverture", fmtMAD(bqShift ? bqShift.float : 0), ''],
      ['Espèces encaissées', '+ ' + fmtMAD(t.cash), ''],
      ['Attendu en caisse', fmtMAD(bqCloExpected), 'is-total'],
    ];

    const nCats = (() => {
      const seen = {};
      /* Une ligne intégralement reprise n'a rien vendu : compter son rayon
         faisait dire « 3 rayons » à une clôture où deux seulement ont laissé de
         la marchandise chez le client — la phrase contredisait le nombre de
         pièces affiché juste à côté, qui, lui, est net des retours. */
      salesToday().forEach((s) => (s.lines || []).forEach((ln) => {
        if (lineAvailableQty(ln) <= 0) return;
        const r = rayonOf(ln.pid); if (r) seen[r] = 1;
      }));
      return Object.keys(seen).length;
    })();
    const hlText = t.txns
      ? `<em>${t.items}</em> ${V.items} vendus sur ${t.txns} ticket${t.txns > 1 ? 's' : ''}${nCats ? `, ${nCats} ${nCats > 1 ? V.cats : V.cat}` : ''}.`
      : 'Aucune vente sur ce service.';

    v.innerHTML = `
      <div class="cloture-card">
        <div class="clo-eyebrow">Fin de service</div>
        <div class="clo-title">Clôture de caisse</div>
        <div class="clo-meta">${esc(pv.name || 'Boutique')} · ${esc((STAFF.caissiere && STAFF.caissiere.name) || '')} · ${fmtDay(now)}</div>
        <div class="clo-rows">${rows.map((r, i) => {
          const cls = 'clo-row' + (r[3] === 'total' ? ' is-total' : (r[3] === 'sub' ? ' is-sub' : ''));
          const vCls = 'clo-row-value' + (r[2] ? ' mono' : '');
          return `<div class="${cls}" style="animation-delay:${i * 70}ms"><span class="clo-row-label">${r[0]}</span><span class="${vCls}">${r[1]}</span></div>`;
        }).join('')}</div>
        <div class="clo-drawer-box">
          <div class="clo-drawer-title">Tiroir-caisse</div>
          ${dLines.map((l) => `<div class="clo-drawer-line ${l[2]}"><span>${l[0]}</span><span class="mono">${l[1]}</span></div>`).join('')}
          <div class="clo-count-row">
            <label for="bqclo-count">Espèces comptées</label>
            <input class="clo-count-input" id="bqclo-count" type="number" inputmode="numeric" min="0" step="10" placeholder="—" />
          </div>
          <div class="clo-ecart-line" id="bqclo-ecart-line">
            <span>Écart</span><span class="mono" id="bqclo-ecart">—</span>
          </div>
        </div>
        <div class="clo-highlight">
          <div class="clo-highlight-icon"><i data-lucide="shopping-bag"></i></div>
          <div class="clo-highlight-text">${hlText}</div>
        </div>
        <div class="clo-actions">
          <button class="clo-btn secondary" id="bqclo-print"><i data-lucide="printer"></i><span>Imprimer le rapport Z</span></button>
          <button class="clo-btn primary" id="bqclo-close"><i data-lucide="lock"></i><span>Fermer la caisse</span></button>
        </div>
        <div class="clo-foot"><button id="bqclo-continue">Continuer le service</button></div>
      </div>`;
    v.classList.add('is-open');
    icons();

    v.querySelector('#bqclo-count').addEventListener('input', bqUpdateEcart);
    v.querySelector('#bqclo-continue').onclick = () => v.classList.remove('is-open');
    /* Imprimer AVANT de fermer — un tirage avec le comptage saisi à l'instant,
       aucune écriture (même contrat que #clo-print côté restaurant). */
    v.querySelector('#bqclo-print').onclick = () => {
      const raw = v.querySelector('#bqclo-count').value;
      const r = bqBuildReport(raw === '' || raw == null ? null : parseFloat(raw), 0);
      if (!r) { toast('Rapport indisponible'); return; }
      bqPrintReport(r, 'AVANT CLÔTURE');
    };
    v.querySelector('#bqclo-close').onclick = bqCloseRegister;
  }

  /* L'ORDRE COMPTE (cf. closeRegister() restaurant) : le rapport s'écrit AVANT
     d'effacer le poste et avant le rechargement. Les ventes ne sont jamais
     touchées — une clôture produit un document, elle ne modifie pas le registre. */
  function bqCloseRegister() {
    const v = bqCloVeil;
    const raw = v ? v.querySelector('#bqclo-count').value : '';
    const counted = (raw === '' || raw == null) ? null : parseFloat(raw);
    if (v) v.classList.remove('is-open');
    let report = null;
    try {
      report = bqBuildReport(counted, Date.now());
      if (report && window.KiwiDayReport) {
        report.closed = true;
        window.KiwiDayReport.save(report, { by: (STAFF.caissiere && STAFF.caissiere.name) || '' });
        /* La page se recharge dans un instant : sans flush(), la remontée
           serveur débattue partirait après la mort de l'onglet — jamais. */
        window.KiwiDayReport.flush();
      }
    } catch (_) {}
    bqShift = null;
    bqShiftPersist();
    if (report) bqShowPostClose(report); else bqFinishClose();
  }
  function bqFinishClose() {
    const z = document.getElementById('mz-zsheet');
    if (z) z.classList.remove('is-open');
    toast('Caisse fermée · à bientôt');
    setTimeout(() => location.reload(), 640);
  }
  /* L'écran d'après-clôture : une décision, la trace papier. */
  function bqShowPostClose(report) {
    bqClosedReport = report;
    const DR = window.KiwiDayReport;
    const V = DR ? DR.vocab() : { items: 'articles', cats: 'rayons', cat: 'rayon' };
    const nCat = (report.categories || []).length;
    const nItems = (report.categories || []).reduce((s, c) => s + (c.qty || 0), 0);
    const bits = [`${report.txns} transaction${report.txns > 1 ? 's' : ''}`];
    if (nCat) bits.push(`${nItems} ${V.items} · ${nCat} ${nCat > 1 ? V.cats : V.cat}`);
    if (report.cash && report.cash.ecart != null && Math.abs(report.cash.ecart) > 0.5) {
      bits.push(`écart ${(report.cash.ecart > 0 ? '+ ' : '− ')}${fmtMAD(Math.abs(report.cash.ecart))}`);
    }
    const z = document.createElement('div');
    z.className = 'cloture-veil is-open';
    z.id = 'mz-zsheet';
    z.setAttribute('role', 'dialog');
    z.setAttribute('aria-modal', 'true');
    z.innerHTML = `
      <div class="cloture-card zs-card">
        <div class="clo-eyebrow">Journée clôturée</div>
        <div class="clo-title">Rapport journalier</div>
        <div class="zs-total mono">${fmtMAD(report.net)}</div>
        <div class="clo-meta">${bits.join(' · ')}</div>
        <div class="clo-actions">
          <button class="clo-btn primary" id="bqzs-print"><i data-lucide="printer"></i><span>Imprimer le rapport</span></button>
          <button class="clo-btn secondary" id="bqzs-reprint" hidden><i data-lucide="copy"></i><span>Réimprimer</span></button>
        </div>
        <div class="clo-foot"><button id="bqzs-skip">Continuer sans imprimer</button></div>
        <div class="zs-note">Le rapport reste disponible dans le tableau de bord, section Rapport journalier — même après un rechargement ou depuis un autre appareil.</div>
      </div>`;
    document.body.appendChild(z);
    icons();
    const print = z.querySelector('#bqzs-print'), reprint = z.querySelector('#bqzs-reprint');
    const doPrint = (btn) => {
      if (!bqClosedReport) return bqFinishClose();
      btn.disabled = true;
      bqPrintReport(bqClosedReport, btn === reprint ? 'DUPLICATA' : '').then(() => {
        btn.disabled = false;
        if (reprint) { reprint.hidden = false; icons(); }
      });
    };
    print.onclick = () => doPrint(print);
    reprint.onclick = () => doPrint(reprint);
    z.querySelector('#bqzs-skip').onclick = bqFinishClose;
  }

  /* La boutique n'encaisse pas dans le journal partagé (KiwiPosSale) : elle
     tient SALES, qui couvre la semaine et porte le ticket figé de chaque vente.
     Elle s'annonce donc au bouton « Réimprimer », qui sinon lirait un journal
     vide et conclurait qu'aucune vente n'a été prise de la journée.
     Traduit vers la forme commune du journal, et `rc` suit : c'est lui qui fait
     ressortir le VRAI ticket remis plutôt qu'une recomposition. */
  try {
    if (window.KiwiPosReprint) {
      /* Le prix vient de la LIGNE (ln.unit, figé à l'encaissement), jamais du
         catalogue actuel : lineUnit() lit P[ln.pid].price et lève sur un article
         supprimé depuis — le cas qui avait déjà vidé la page des échanges — et
         relirait de toute façon un prix qui a pu changer depuis la vente. */
      const lineName = (ln) => ((P[ln.pid] && P[ln.pid].name) || 'Article') + (ln.size ? ' ' + ln.size : '');
      /* TOUTE la fenêtre du journal, pas seulement aujourd'hui. salesToday()
         est fait pour l'ARGENT — la recette du jour ne doit jamais sommer une
         semaine — et la réimpression n'est pas de l'argent : c'est du papier.
         Une cliente qui revient le lendemain sans son ticket ne trouvait donc
         personne pour le lui ressortir, alors que l'écran des échanges affichait
         sa vente juste à côté et que `rc` en garde le document exact.
         C'est pos-reprint.js qui tranche ensuite : au-delà du jour, il n'accepte
         que les ventes portant ce ticket figé. Lui passer la fenêtre entière
         évite de refaire ici un filtre qui vit là-bas. */
      const salesWeek = () => SALES.filter((s) => s && !s.voided && withinRetention(s.at));
      window.KiwiPosReprint.provide('boutique', () => salesWeek().map((s) => {
        const lines = (s.lines || []).map((ln) => ({
          name: lineName(ln),
          qty: ln.qty,
          total: Math.round((+ln.unit || 0) * ln.qty),
        }));
        const pieces = lines.reduce((n, l) => n + l.qty, 0);
        const head = lines[0];
        return {
          ts: (s.at instanceof Date ? s.at : new Date(s.at)).getTime(),
          total: s.total,
          ref: s.id,
          label: !head ? 'Vente'
            : (lines.length > 1 ? head.name + ' +' + (pieces - head.qty) + ' art.' : head.name),
          raw: s.methods,
          rc: s.rc || null,
          lines: lines,
        };
      }));
    }
  } catch (_) {}

  window.KiwiPosDispatch.register({
    id: 'maison',
    greet: {
      line1: 'Bonjour,',
      em: 'bienvenue.',
      sub: 'Vogue Home <em>·</em> art de table & décoration',
    },
    mount,
    onShow,
  });
})();
