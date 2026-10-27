/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · pages-pro-boutique.js — sorti de pages-pro.js le 22 octobre 2026
 *
 * Section 2 boutique A : inventaire, catégories, mouvements de stock.
 * Sections recopiées telles quelles, chacune dans son IIFE comme avant.
 * Chargé juste APRÈS pages-pro.js. Il suivait le registre des sections au
 * premier usage ; aucun de ses gestionnaires n'y figure.
 * ─────────────────────────────────────────────────────────────────────────── */

/* ═══ Section 2 boutique A · inventory / categories ═══ */
(function() {
  "use strict";
  if (!window.Kiwi || !window.Kiwi.handlers) return;
  const Kiwi = window.Kiwi;
  const handlers = Kiwi.handlers;
  const drawer = Kiwi.drawer;
  const fullpage = Kiwi.fullpage;
  const modal = Kiwi.modal;
  const toast = Kiwi.toast;
  const dt = (key, fr) => window.KiwiI18n?.T?.[window.KiwiI18n.getLang()]?.[key] ?? fr;
  const menu = Kiwi.menu;
  const confetti = Kiwi.confetti;
/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE vertical · Maison Mansour, Gueliz · S2 sidebar handlers
 *  - nav-inventory     · Inventaire produits (1040 wide, dense SKU grid)
 *  - nav-categories    · Catégories (920 wide, hierarchical tree + tags + toggles)
 * Auxiliary handlers route every button: toasts, modals, nested drawers,
 * filter-pill delegation, color-tag pickers, bulk-CSV, add/edit forms, archive
 * confirmations.
 * ─────────────────────────────────────────────────────────────────────────── */


/* ─── shared inline SVG icons ─── */
const _ICN = {
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>',
  scan:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7V5a2 2 0 012-2h2M21 7V5a2 2 0 00-2-2h-2M3 17v2a2 2 0 002 2h2M21 17v2a2 2 0 01-2 2h-2M7 8v8M11 8v8M15 8v8M19 8v8"/></svg>',
  upload: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  // Same tray as `upload`, arrow reversed — the file comes IN (import).
  download: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  plus:   '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
  edit:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  copy:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
  arch:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8M10 12h4"/></svg>',
  up:     '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M18 15l-6-6-6 6"/></svg>',
  down:   '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>',
  more:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="6" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18" r="1.4"/></svg>',
  trash:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>',
  merge:  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3l4 4 4-4M12 7v8M5 21l7-7 7 7"/></svg>',
  eye:    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>',
};

/* ─── French money formatter ─── */
const _mad = (n) => (window.KiwiNumber?.format(n, {minimumFractionDigits: 0, maximumFractionDigits: 0}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits: 0, maximumFractionDigits: 0}));
const _mad2 = (n) => (window.KiwiNumber?.format(n, {minimumFractionDigits: 2, maximumFractionDigits: 2}) ?? n.toLocaleString(document.documentElement?.lang === 'en' ? 'en-GB' : 'fr-FR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));

/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BOUTIQUE vertical · Maison Mansour, Gueliz · S2 sidebar handlers
 *  - nav-inventory   · Inventaire produits — LIVE, backed by the shared catalog
 *  - nav-categories  · Catégories — real create / rename / recolour / delete
 *
 * Both pages read/write window.KiwiBoutiqueCatalog — the SAME product database
 * the caisse (PIN 0002) creates products into — and render real scannable
 * barcodes via window.KiwiBarcode. Every edit persists (localStorage) and both
 * surfaces stay in sync (subscribe() same-page + the native `storage` event
 * cross-tab). A variant = product × colour × size is the atomic barcoded unit.
 * ─────────────────────────────────────────────────────────────────────────── */
const CAT = () => window.KiwiBoutiqueCatalog;
const BC  = () => window.KiwiBarcode;
const _bqxReady = () => !!(window.KiwiBoutiqueCatalog && window.KiwiBarcode);

const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const _TAGHEX = { atlas: '#0B6E4F', riad: '#053B2C', mint: '#7DF2B0', warn: '#D99A2B', danger: '#9B2F22', info: '#3D6B8C' };
const _TAGS = [
  { id: 'atlas', hex: '#0B6E4F', name: 'Atlas' }, { id: 'riad', hex: '#053B2C', name: 'Riad' },
  { id: 'mint', hex: '#7DF2B0', name: 'Menthe' }, { id: 'warn', hex: '#D99A2B', name: 'Safran' },
  { id: 'danger', hex: '#9B2F22', name: 'Carmin' }, { id: 'info', hex: '#3D6B8C', name: 'Indigo' },
];

let _bqxFilter = 'all';
let _bqxColorFilter = '';
let _bqxQuery = '';
let _bqxDrawerPid = null;
let _bqxModal = null;
let _bqxSubbed = false;
/* Sélection multiple (« Sélectionner ») : un mode, pas une case à cocher
   permanente. Hors du mode, toucher une carte ouvre le produit comme avant ;
   dans le mode, elle se coche. L'ensemble vit ici et non dans le DOM, parce
   que la page entière se redessine à chaque synchronisation avec la caisse. */
let _bqxSelecting = false;
const _bqxSel = new Set();
const _BQX_ARCHIVED = '__archived';
/* Liste ou grille : la liste par défaut (décision de la patronne, 2026-10-10),
   la grille reste un choix gardé sur cet appareil. */
let _bqxView = (() => { try { return localStorage.getItem('kiwiInvView') === 'grid' ? 'grid' : 'list'; } catch (_) { return 'list'; } })();
/* « À réassortir » : ne montrer que ce qui est à 5 pièces ou moins. */
let _bqxLowOnly = false;
const _BQX_MORE = '<svg viewBox="0 -960 960 960" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"/></svg>';

/* one-time styles for the variant matrix, barcode chips and category rows */
function _bqxCss() {
  if (window.KiwiColors) window.KiwiColors.injectCss();
  if (document.getElementById('bqx-css')) return;
  const st = document.createElement('style');
  st.id = 'bqx-css';
  st.textContent = `
    /* Les pastilles elles-mêmes viennent de color-palette.js (.kc-sw) · un seul
       dessin pour le tableau de bord et la caisse. Ici : ce qui les entoure. */
    .bqx-cbtn { display: inline-flex; align-items: center; gap: 7px; background: none; border: 0; padding: 3px 5px; margin: -3px -5px; border-radius: 8px; font: inherit; color: inherit; cursor: pointer; }
    .bqx-cbtn:hover { background: var(--paper-soft, #f3f1ea); }
    .bqx-cbtn:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 1px; }
    /* Famille sur une ligne, nuance d'origine dessous et alignée sous le mot :
       la colonne reste lisible même quand deux variantes affichent « Bleu ». */
    .bqx-ccell { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
    .bqx-ccell .bqx-cbtn span { white-space: nowrap; }
    .bqx-csrc { font-style: normal; font-size: 11px; color: var(--n-500, #77807b); margin-left: 24px; white-space: nowrap; }
    .bqx-card-cols { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin: 2px 0 1px; min-height: 16px; }
    .bqx-card-cols em { font-style: normal; font-size: 11px; color: var(--n-500, #77807b); }
    .bqx-cfilter { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin: 2px 0 6px; }
    .bqx-cfilter-l { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--n-500, #77807b); margin-right: 2px; }
    /* Sélectionné dans le filtre = anneau + coche, jamais la couleur seule. */
    .bqx-cfilter .kc-sw.is-on { box-shadow: 0 0 0 2px var(--paper, #F7F5F0), 0 0 0 4px var(--atlas, #0B6E4F); transform: scale(1.06); }
    html[data-theme="dark"] .bqx-cfilter .kc-sw.is-on { box-shadow: 0 0 0 2px var(--paper, #0f1512), 0 0 0 4px var(--mint, #7DF2B0); }
    .bqx-cfilter .kc-sw.is-on::after { content: ''; position: absolute; left: 50%; top: 50%; width: 30%; height: 55%; margin: -32% 0 0 -15%; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(42deg); }
    .bqx-cfilter .kc-sw.is-on.is-light::after { border-color: #0A0F0D; }
    .bqx-stk { display: inline-flex; align-items: center; gap: 5px; }
    .bqx-stk input { width: 46px; text-align: center; font-family: var(--mono, monospace); font-size: 13px; padding: 4px; border: 1px solid var(--line, #ddd); border-radius: 7px; background: var(--paper, #fff); color: var(--ink, #0A0F0D); }
    .bqx-stk button { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--line, #ddd); background: var(--paper, #fff); cursor: pointer; font-size: 15px; line-height: 1; color: var(--ink, #0A0F0D); }
    .bqx-stk button:hover { background: var(--paper-soft, #f3f1ea); }
    .bqx-bc { display: flex; align-items: center; gap: 9px; }
    .bqx-bc svg { display: block; }
    .bqx-bc-code { font-family: var(--mono, monospace); font-size: 11px; color: var(--n-600, #555); white-space: nowrap; }
    .bqx-badge { font-size: 11px; padding: 1px 6px; border-radius: 6px; text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
    .bqx-badge.gen { background: rgba(11,110,79,.12); color: #0B6E4F; }
    .bqx-badge.imp { background: rgba(217,154,43,.16); color: #8A6210; }
    .bqx-vact { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
    .bqx-nocode { color: var(--n-500, #99a); font-size: 12px; }
    .bqx-cat-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line, #e7e3da); border-radius: 12px; margin-bottom: 8px; background: var(--paper, #fff); }
    .bqx-cat-bar { width: 5px; align-self: stretch; border-radius: 3px; min-height: 34px; }
    .bqx-cat-info { flex: 1; min-width: 0; }
    .bqx-cat-info .n { font-weight: 600; font-size: 14px; }
    .bqx-cat-info .m { font-size: 12px; color: var(--n-500, #77807b); margin-top: 2px; }
    .bqx-cat-sw { display: flex; gap: 5px; }
    .bqx-cat-sw button { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
    .bqx-cat-sw button.on { border-color: var(--ink, #0A0F0D); }
    .bqx-price-tag { font-family: var(--mono, monospace); }
    /* Catégorie A / B · la propriété de la marchandise, choisie à la création. */
    .bqx-ab { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .bqx-ab label { display: flex; align-items: center; gap: 9px; padding: 12px 13px; border: 1px solid var(--line, #e7e3da);
      border-radius: 11px; cursor: pointer; background: var(--paper, #fff); }
    .bqx-ab label:has(input:checked) { border-color: var(--atlas, #0B6E4F); box-shadow: inset 0 0 0 1px var(--atlas, #0B6E4F); }
    .bqx-ab input { accent-color: var(--atlas, #0B6E4F); }
    .bqx-ab b { display: block; font-size: 13px; font-weight: 600; }
    .bqx-ab-b { font-family: var(--mono, monospace); font-size: 11px; letter-spacing: .06em; color: var(--atlas, #0B6E4F);
      border: 1px solid var(--atlas, #0B6E4F); border-radius: 999px; padding: 0 5px; margin-left: 6px; vertical-align: 1px; }
    /* Variant colour editor: the active choice reads as a labelled value, not
       merely as a ring around one of fourteen anonymous dots. The optional
       note remains available but sits below the merchant's actual task. */
    .bqx-color-edit { display: grid; gap: 12px; }
    .kiwi-modal.bqx-color-modal { display: flex; flex-direction: column; overflow: hidden; }
    .kiwi-modal.bqx-color-modal .kiwi-modal-head,
    .kiwi-modal.bqx-color-modal .kiwi-modal-foot { flex: none; }
    .kiwi-modal.bqx-color-modal .kiwi-modal-body { min-height: 0; overflow-y: auto; }
    .bqx-color-card { padding: 16px; border: 1px solid var(--n-200, #e7e3da); border-radius: 16px; background: var(--surface, #fff); }
    .bqx-color-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
    .bqx-color-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
    .bqx-color-step { display: inline-flex; width: 24px; height: 24px; flex: none; align-items: center; justify-content: center; border-radius: 8px; background: var(--mint-soft, rgba(125,242,176,.2)); color: var(--atlas, #0B6E4F); font: 650 11px/1 var(--mono, monospace); }
    .bqx-color-heading strong { display: block; font-size: 13.5px; line-height: 1.3; letter-spacing: -.01em; }
    .bqx-color-heading small { display: block; margin-top: 3px; color: var(--n-500, #77807b); font-size: 11.5px; line-height: 1.35; }
    .bqx-color-selected { display: inline-flex; flex: none; align-items: center; gap: 8px; max-width: 46%; padding: 6px 10px 6px 7px; border: 1px solid var(--n-200, #e7e3da); border-radius: 999px; background: var(--paper-soft, #f3f1ea); color: var(--ink, #0A0F0D); font-size: 12px; font-weight: 600; }
    .bqx-color-selected > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bqx-color-selected .kc-sw { width: 22px; height: 22px; flex: none; }
    .bqx-color-picker .kc-picker { position: relative; }
    .bqx-color-picker .kc-row { gap: 10px; }
    .bqx-color-picker .kc-sw { width: 34px; height: 34px; }
    .bqx-color-picker .kc-cap { margin-top: 10px; min-height: 17px; }
    .bqx-color-field { padding: 14px 16px; border: 1px solid var(--n-200, #e7e3da); border-radius: 14px; background: color-mix(in srgb, var(--surface, #fff) 62%, transparent); }
    .bqx-color-field .kf-group { margin: 0; }
    .bqx-color-field .kf-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; font-size: 12.5px; color: var(--ink, #0A0F0D); }
    .bqx-color-optional { color: var(--n-500, #77807b); font-size: 11px; font-weight: 500; }
    .bqx-color-safe { display: flex; align-items: center; gap: 8px; padding: 2px 3px; color: var(--n-500, #77807b); font-size: 11.5px; line-height: 1.35; }
    .bqx-color-safe svg { flex: none; color: var(--atlas, #0B6E4F); }
    @media (max-width: 520px) {
      .bqx-color-card, .bqx-color-field { padding: 13px; }
      .bqx-color-head { display: grid; gap: 10px; }
      .bqx-color-selected { max-width: 100%; width: fit-content; }
      .bqx-color-picker .kc-custom-wrap { position: static; }
      .bqx-color-picker .kc-custom-pop { inset-inline: 0; width: 100%; }
    }
    /* Sélection multiple. La case est dessinée en CSS (pas d'icône) et se
       pose sur la vignette, là où l'œil va chercher la carte. */
    .bqx-card.is-sel { border-color: var(--atlas, #0B6E4F); box-shadow: inset 0 0 0 1px var(--atlas, #0B6E4F); }
    .bqx-row.is-sel { background: color-mix(in srgb, var(--atlas, #0B6E4F) 8%, transparent); }
    .bqx-check { position: absolute; top: 10px; left: 10px; z-index: 2; width: 22px; height: 22px; border-radius: 7px;
      border: 2px solid rgba(247, 245, 240, .95); background: rgba(5, 59, 44, .22); box-shadow: 0 1px 3px rgba(0, 0, 0, .18); pointer-events: none; }
    .bqx-row .bqx-check { position: relative; top: auto; left: auto; border-color: var(--n-300, #c9c5bb); background: var(--surface, #fff); box-shadow: none; }
    .bqx-grid.is-compact .bqx-check { border-color: var(--n-300, #c9c5bb); background: var(--surface, #fff); box-shadow: none; }
    .is-sel .bqx-check { background: var(--atlas, #0B6E4F); border-color: var(--atlas, #0B6E4F); }
    .is-sel .bqx-check::after { content: ''; position: absolute; left: 5px; top: 1px; width: 6px; height: 11px;
      border: solid #F7F5F0; border-width: 0 2px 2px 0; transform: rotate(45deg); }
    .bqx-selbar { position: sticky; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 30; margin-top: 14px;
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 14px;
      background: var(--riad, #053B2C); color: #EAFFF4; box-shadow: 0 18px 40px -18px rgba(5, 59, 44, .65); }
    .bqx-selbar[hidden] { display: none; }
    .bqx-selbar .n { margin-right: auto; font-weight: 600; font-size: 14px; font-variant-numeric: tabular-nums; }
    .bqx-selbar button { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 13px; font-weight: 600;
      border: 0; border-radius: 10px; padding: 9px 12px; min-height: 36px; cursor: pointer; background: rgba(255, 255, 255, .14); color: #EAFFF4; }
    .bqx-selbar button:hover:not(:disabled) { background: rgba(255, 255, 255, .24); }
    .bqx-selbar button.danger { background: rgba(240, 179, 164, .16); color: #FFD3C8; }
    .bqx-selbar button.danger:hover:not(:disabled) { background: rgba(240, 179, 164, .28); }
    .bqx-selbar button.ghost { background: transparent; box-shadow: inset 0 0 0 1px rgba(234, 255, 244, .3); }
    .bqx-selbar button:disabled { opacity: .45; cursor: not-allowed; }
    .bqx-selbar button svg { width: 15px; height: 15px; }
    .bqx-selbar .sh { display: none; }
    /* ── Inventaire · mise en page ───────────────────────────────────────
       La page prend la largeur de l'écran : un catalogue se parcourt, il
       ne se lit pas comme un formulaire. */
    .bqx-kpis .kx-kpi .l { text-transform: none; letter-spacing: 0; font-family: var(--sans); font-size: 12.5px; font-weight: 500; }
    .bqx-kpis .kx-kpi .v { font-family: var(--num, var(--sans)); }
    .bqx-kpi-btn { display: block; width: 100%; text-align: left; font: inherit; color: inherit; cursor: pointer; transition: background-color 160ms; }
    .bqx-kpi-btn:disabled { cursor: default; }
    .bqx-kpi-btn:not(:disabled):hover { background: color-mix(in srgb, #D99A2B 13%, var(--surface)); }
    .bqx-kpi-btn.is-on { box-shadow: inset 0 0 0 2px #D99A2B; }
    .bqx-kpi-btn:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: -2px; }
    .p-toolbar.bqx-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 12px; }
    .bqx-toolbar > .p-search { flex: 1 1 260px; min-width: 0; }
    .bqx-view.kx-tabs { margin: 0; padding: 3px; flex: none; }
    .bqx-view .kx-tab { flex: none; padding: 6px 13px; font-size: 13px; }
    .bqx-more { position: relative; }
    .bqx-more > summary { list-style: none; cursor: pointer; }
    .bqx-more > summary::-webkit-details-marker { display: none; }
    .bqx-more > summary svg { width: 16px; height: 16px; }
    .bqx-more[open] > summary { border-color: var(--ink, #0A0F0D); }
    .bqx-more-pop { position: absolute; right: 0; top: calc(100% + 6px); z-index: 40; min-width: 220px; padding: 6px;
      display: grid; gap: 2px; border: 1px solid var(--n-200, #e7e3da); border-radius: 14px; background: var(--surface, #fff);
      box-shadow: 0 18px 40px -16px rgba(10, 15, 13, .28); }
    .bqx-more-pop button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border: 0; border-radius: 9px;
      background: transparent; color: var(--ink, #0A0F0D); font: 500 13.5px/1.2 var(--sans); text-align: left; cursor: pointer; }
    .bqx-more-pop button:hover { background: var(--paper-soft, #f3f1ea); }
    .bqx-more-pop button svg { width: 15px; height: 15px; flex: none; color: var(--n-500, #77807b); }
    .bqx-filters { display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; margin-bottom: 14px; }
    .bqx-filters .kx-pills { flex: 0 1 auto; max-width: 100%; min-width: 0; margin: 0; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 2px; }
    .bqx-filters .kx-pills::-webkit-scrollbar { display: none; }
    .bqx-filters .kx-pill { flex: none; }
    .bqx-filters .bqx-cfilter { margin: 0; }

    /* ── Cartes ─────────────────────────────────────────────────────────── */
    .bqx-grid { display: grid; gap: 12px; }
    .bqx-grid.is-media { grid-template-columns: repeat(auto-fill, minmax(214px, 1fr)); }
    .bqx-grid.is-compact { grid-template-columns: repeat(auto-fill, minmax(272px, 1fr)); }
    .bqx-card { position: relative; display: flex; flex-direction: column; min-width: 0; cursor: pointer;
      background: var(--surface, #fff); border: 1px solid var(--n-200, #e7e3da); border-radius: 16px; overflow: hidden;
      transition: border-color 160ms, box-shadow 160ms; }
    html[data-theme="dark"] .bqx-card, html[data-theme="dark"] .bqx-list { background: var(--paper-soft); }
    .bqx-card:hover { border-color: color-mix(in srgb, var(--atlas, #0B6E4F) 55%, var(--n-200, #e7e3da)); box-shadow: 0 12px 26px -20px rgba(10, 15, 13, .35); }
    .bqx-card:focus-visible, .bqx-row:focus-visible { outline: 2px solid var(--atlas, #0B6E4F); outline-offset: 2px; }
    .bqx-thumb { position: relative; display: grid; place-items: center; overflow: hidden; flex: none;
      background: color-mix(in srgb, var(--tint, #9AA09D) 14%, var(--surface, #fff)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint, #9AA09D) 10%, var(--n-200, #e7e3da)); }
    .bqx-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .bqx-ini { font: 600 15px/1 var(--sans); letter-spacing: -.01em; color: var(--ini, color-mix(in srgb, var(--tint, #9AA09D) 78%, var(--ink, #0A0F0D))); }
    html[data-theme="dark"] .bqx-ini { color: color-mix(in srgb, var(--tint, #9AA09D) 55%, #F7F5F0); }
    .bqx-thumb:has(img) { box-shadow: none; }
    .bqx-grid.is-media .bqx-thumb { aspect-ratio: 4 / 3; }
    .bqx-grid.is-media .bqx-ini { font-size: 26px; }
    .bqx-grid.is-compact .bqx-card { display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 12px; padding: 14px; }
    .bqx-grid.is-compact .bqx-thumb { width: 52px; height: 52px; border-radius: 12px; }
    .bqx-cbody { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
    .bqx-grid.is-media .bqx-cbody { padding: 12px 14px 14px; }
    .bqx-card .kx-sku-head { display: block; }
    .bqx-card .kx-sku-head .n { font-weight: 600; font-size: 14px; line-height: 1.3; letter-spacing: -.01em; color: var(--ink, #0A0F0D);
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .bqx-cmeta { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--n-500, #77807b); white-space: nowrap; }
    .bqx-cmeta > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; }
    .bqx-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--cat, var(--tint, #9AA09D)); }
    .bqx-card-cols:empty { display: none; }
    .bqx-cfoot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; padding-top: 4px; }
    .bqx-price { font: 600 16px/1 var(--sans); font-variant-numeric: tabular-nums; letter-spacing: -.015em; color: var(--ink, #0A0F0D); white-space: nowrap; }
    .bqx-price small { font-size: 11px; font-weight: 500; color: var(--n-500, #77807b); margin-left: 4px; letter-spacing: 0; }
    .bqx-stag { display: inline-flex; align-items: center; padding: 4px 8px; border-radius: 999px; white-space: nowrap;
      font: 500 11.5px/1 var(--sans); font-variant-numeric: tabular-nums; color: var(--n-600, #555); background: var(--paper-soft, #f3f1ea); }
    .bqx-stag.low { color: #8A6210; background: rgba(217, 154, 43, .16); }
    .bqx-stag.out { color: #9B2F22; background: rgba(155, 47, 34, .10); font-weight: 600; }
    html[data-theme="dark"] .bqx-stag { background: var(--paper-muted); color: rgba(247, 245, 240, .72); }
    html[data-theme="dark"] .bqx-stag.low { color: #E8B85C; background: rgba(217, 154, 43, .18); }
    html[data-theme="dark"] .bqx-stag.out { color: #F0B3A4; background: rgba(240, 179, 164, .14); }
    .bqx-card.is-arch .bqx-thumb, .bqx-row.is-arch .bqx-thumb { filter: grayscale(1); opacity: .6; }

    /* ── Liste ──────────────────────────────────────────────────────────── */
    .bqx-list { border: 1px solid var(--n-200, #e7e3da); border-radius: 16px; overflow: hidden; background: var(--surface, #fff); }
    .bqx-lhead, .bqx-row { display: grid; align-items: center; gap: 14px; padding: 0 16px;
      grid-template-columns: 40px minmax(180px, 2.4fr) minmax(96px, 1fr) 76px 112px 112px 112px; }
    .bqx-lhead { min-height: 38px; font-size: 12px; font-weight: 500; color: var(--n-500, #77807b); background: var(--paper-soft, #f3f1ea); }
    html[data-theme="dark"] .bqx-lhead { background: var(--paper-muted); }
    .bqx-lhead .r, .bqx-rnum, .bqx-rstock { text-align: right; justify-self: end; }
    .bqx-row { min-height: 60px; border-top: 1px solid var(--n-100, #efece5); cursor: pointer; transition: background-color 140ms; }
    .bqx-row:hover { background: color-mix(in srgb, var(--atlas, #0B6E4F) 4%, transparent); }
    .bqx-row .bqx-thumb { width: 40px; height: 40px; border-radius: 10px; }
    .bqx-row .bqx-ini { font-size: 13px; }
    .bqx-rlead { display: grid; place-items: center; width: 40px; height: 40px; }
    .bqx-rname { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .bqx-rname b { font-weight: 600; font-size: 14px; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bqx-rname small { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--n-500, #77807b); }
    .bqx-rcols { display: flex; align-items: center; gap: 4px; min-width: 0; overflow: hidden; }
    .bqx-rcols em { font-style: normal; font-size: 11px; color: var(--n-500, #77807b); }
    .bqx-rnum { font-size: 13.5px; font-variant-numeric: tabular-nums; }
    .bqx-rprice { font-weight: 600; white-space: nowrap; }
    .bqx-rbc { font-size: 12.5px; color: var(--n-500, #77807b); }
    .bqx-rbc.miss { color: #8A6210; }
    html[data-theme="dark"] .bqx-rbc.miss { color: #E8B85C; }
    .nil { font-style: normal; color: var(--n-300, #c9c5bb); }
    @media (max-width: 980px) {
      .bqx-lhead, .bqx-row { grid-template-columns: 40px minmax(0, 1fr) 96px 104px; }
      .bqx-lhead > :nth-child(3), .bqx-lhead > :nth-child(4), .bqx-lhead > :nth-child(5),
      .bqx-rcols, .bqx-row > .bqx-rnum:not(.bqx-rprice), .bqx-rbc { display: none; }
    }
    @media (max-width: 560px) {
      .bqx-lhead { display: none; }
      .bqx-row { grid-template-columns: 40px minmax(0, 1fr) auto; grid-template-rows: auto auto; gap: 2px 12px; padding: 10px 14px; }
      .bqx-row .bqx-rlead { grid-row: 1 / 3; }
      .bqx-row .bqx-rname { grid-row: 1 / 3; }
      .bqx-row .bqx-rprice { grid-column: 3; grid-row: 1; }
      .bqx-row .bqx-rstock { grid-column: 3; grid-row: 2; }
      .bqx-grid.is-compact, .bqx-grid.is-media { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .bqx-grid.is-compact .bqx-card { grid-template-columns: minmax(0, 1fr); padding: 12px; gap: 10px; }
      .bqx-grid.is-compact .bqx-thumb { width: 40px; height: 40px; border-radius: 10px; }
      .bqx-cfoot { flex-wrap: wrap; }
      .bqx-cmeta { flex-wrap: wrap; row-gap: 2px; }
    }
    /* Téléphone : catalog-workspace.css (#0169) répartit les boutons de la
       barre deux par deux ; ici « Sélectionner » partage sa rangée avec
       l'affichage et « Plus », qui se réduit à son icône. */
    @media (max-width: 700px) {
      html body:not(#kno) .bqx-toolbar > .kb[data-action="bqx-sel-mode"] { flex: 1 1 0 !important; }
      .bqx-more > summary span { display: none; }
      .bqx-more > summary { min-height: 44px; min-width: 44px; justify-content: center; }
    }
    /* Sous 860 px le tableau de bord pose sa propre barre d'onglets fixe en
       bas (mobile.css, .kw-tabbar) : la barre de sélection se fixe juste
       au-dessus, et la grille garde de quoi faire défiler sa dernière rangée. */
    @media (max-width: 860px) {
      .bqx-selbar { position: fixed; left: 12px; right: 12px; margin: 0; z-index: 1201;
        bottom: calc(92px + env(safe-area-inset-bottom, 0px)); }
      #bqx-grid:has(+ .bqx-selbar:not([hidden])) { padding-bottom: 150px; }
    }
    /* Téléphone : deux rangées. Le compte et « Terminer » en haut, les quatre
       gestes en libellés courts en dessous. */
    @media (max-width: 600px) {
      .bqx-selbar { gap: 6px; padding: 8px 10px; }
      .bqx-selbar .n { flex: 1 1 60%; font-size: 13px; }
      .bqx-selbar button.ghost { order: 1; }
      .bqx-selbar button:not(.ghost) { order: 2; flex: 1 1 0; justify-content: center; padding: 9px 6px; font-size: 12.5px; }
      .bqx-selbar .lg { display: none; }
      .bqx-selbar .sh { display: inline; }
    }
  `;
  document.head.appendChild(st);
}

function _bqxSubscribe() {
  if (_bqxSubbed || !_bqxReady()) return;
  _bqxSubbed = true;
  CAT().subscribe(() => {
    const nav = document.querySelector('.sidebar nav a.active');
    const navKey = nav && nav.getAttribute('data-nav');
    const drawerOpen = document.querySelector('.kiwi-drawer-backdrop');
    if (!drawerOpen) {
      if (navKey === 'inventory') _renderInventory();
      else if (navKey === 'categories') _renderCategories();
    }
    _bqxRefreshDrawer();
  });
}

/* ─────────────────────────── colours / options helpers ───────────────────────────
   La couleur se choisit à la pastille, jamais dans une liste de noms : une liste
   déroulante de nuances oblige à lire treize mots pour retrouver le bleu, alors
   que l'œil le trouve seul. Le sélecteur, son état sélectionné, sa navigation au
   clavier et son libellé au survol viennent tous de assets/color-palette.js —
   les mêmes qu'en caisse, à la pastille près. */
function _colorPicker(sel, opts) {
  const k = window.KiwiColors;
  if (!k) return '';
  return k.picker('bqx-color', sel, Object.assign({ optional: true, custom: true }, opts || {}));
}
/* La famille qu'une variante affiche, tolérante à un enregistrement écrit avant
   la normalisation (copie serveur d'un ancien build). */
function _bqxFam(v) {
  if (!v) return 'gris';
  if (v.colorFamily) return v.colorFamily;
  const k = window.KiwiColors;
  return k ? k.familyId(v.colorId, v.colorLabel, v.colorHex) : 'gris';
}
/* Families drive filters; a variant row must show the exact custom colour the
   merchant picked instead of repainting it as the nearest family. */
function _bqxShownColor(v) {
  const k = window.KiwiColors;
  if (k && k.display) return k.display(v.colorId, v.colorLabel, v.colorHex);
  const id = _bqxFam(v);
  return { id, label: v.colorLabel || id, hex: v.colorHex || '#9AA0A6' };
}
/* Le nom d'une couleur tel qu'on le LIT, dans la langue de l'écran.
   L'enregistrement garde le libellé français (colorLabel) : c'est la clé
   des rapports, des imports et des étiquettes déjà imprimées. */
function _bqxColorName(c) {
  const k = window.KiwiColors;
  return k && k.nameOf ? k.nameOf(c) : ((c && c.label) || '');
}
/* Ce qui distingue deux variantes tombant dans la même famille : la précision
   saisie par le commerçant, sinon la nuance d'origine. */
function _bqxColorSource(v) {
  if (!v || !v.colorSource) return '';
  const shown = _bqxShownColor(v);
  return String(v.colorSource).trim().toLowerCase() === String(shown.label || '').trim().toLowerCase()
    ? '' : v.colorSource;
}
function _bqxVarNote(v) { return (v && (v.note || _bqxColorSource(v))) || ''; }
/* Vocabulaire par métier : boutique garde le caftan/vêtement/taille, maison et les autres reçoivent des termes neutres. */
function _bqxCopy(trade) {
  const tr = trade !== undefined ? String(trade || '') : (window.KiwiStoreTemplates && window.KiwiStoreTemplates.currentTrade ? window.KiwiStoreTemplates.currentTrade() : '');
  const isBoutique = (tr === 'boutique');
  const isMaison = (tr === 'maison');

  if (isBoutique) {
    return {
      trade: 'boutique',
      modalDesc: 'Créez le produit, puis ajoutez ses variantes couleur × taille et leurs codes-barres.',
      namePlaceholder: 'Ex. Caftan brodé main',
      pricePlaceholder: '1890',
      catPlaceholder: 'Ex. Caftans de mariée',
      defaultKind: 'taille',
      varTag: 'COULEUR × TAILLE',
      varCreatedDesc: 'Ajoutez maintenant ses variantes couleur × taille.',
      varEmpty: 'Aucune variante. Ajoutez une couleur × taille ci-dessous.',
      gridHint: 'Cliquez un produit pour ouvrir sa matrice couleur × taille : stock par variante, génération et impression d\'étiquettes EAN-13, ou enregistrement d\'un ancien code-barres.',
      sizeColHeader: (_kind) => 'Taille',
      sizeInputLabel: (kind) => (kind === 'pointure' ? 'Pointure' : 'Taille'),
      kindList: (_sel) => [
        ['taille', 'Vêtement (tailles S-XL)'],
        ['pointure', 'Chaussure (pointures)'],
        ['tu', 'Taille unique'],
      ],
    };
  }

  return {
    trade: isMaison ? 'maison' : (tr || 'autre'),
    modalDesc: 'Créez le produit, puis ajoutez ses déclinaisons et leurs codes-barres.',
    namePlaceholder: isMaison ? 'Ex. Vase en terre cuite 30 cm' : 'Ex. Article',
    pricePlaceholder: isMaison ? '450' : '150',
    catPlaceholder: isMaison ? 'Ex. Arts de la table' : 'Ex. Rayon principal',
    defaultKind: 'tu',
    varTag: 'DÉCLINAISON',
    varCreatedDesc: 'Ajoutez maintenant ses déclinaisons.',
    varEmpty: 'Aucune variante. Ajoutez une déclinaison ci-dessous.',
    gridHint: 'Cliquez un produit pour ouvrir ses déclinaisons : stock par variante, génération et impression d\'étiquettes EAN-13, ou enregistrement d\'un ancien code-barres.',
    sizeColHeader: (kind) => (kind === 'taille' ? 'Format' : kind === 'pointure' ? 'Pointure' : ' · '),
    sizeInputLabel: (kind) => (kind === 'pointure' ? 'Pointure' : kind === 'taille' ? 'Format' : 'Format'),
    kindList: (sel) => {
      const opts = [
        ['tu', 'Pièce unique (sans taille)'],
        ['taille', 'Formats (S · M · L)'],
      ];
      if (sel === 'pointure') {
        opts.push(['pointure', 'Pointure']);
      }
      return opts;
    },
  };
}
/* Ticket #0034 · till PIN codes differ per trade (boutique 0002, maison
 * 0017): hardcoding 0002 sends maison merchants to the wrong caisse. Empty
 * when the trade is unknown, so the hint degrades to code-less copy. */
function _bqxTillCode(trade) {
  const tr = trade !== undefined ? String(trade || '') : (_bqxCopy().trade || '');
  return ({ boutique: '0002', maison: '0017' })[tr] || '';
}
/* Seules les caisses boutique et maison lisent ce catalogue partagé ; les autres
   métiers de commerce (épicerie, pharmacie, librairie, fleuriste, autre) ont
   leur propre caisse (pos-*.js) et n'en reçoivent rien. On décide sur le MÉTIER,
   pas sur le type de base : getVenueType() renvoie « boutique » pour tous. Un
   métier inconnu (compte sans sous-type) reste sur la caisse boutique. */
function _bqxTillReads(trade) {
  const tr = trade !== undefined ? String(trade || '') : (_bqxCopy().trade || '');
  return !tr || tr === 'boutique' || tr === 'maison';
}
/* Un vrai commerçant a déjà son code en main ; le code de démo n'a de sens que
   sur la démo, où il sert à ouvrir la caisse de présentation. */
function _bqxTillHint(trade) {
  if (window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.()) return '';
  const code = _bqxTillCode(trade);
  return code ? ` (code ${code})` : '';
}
function _bqxShared() { return _bqxTillReads() ? _bqxInvT().shared : ''; }
function _kindOptions(sel, trade) {
  const copy = _bqxCopy(trade);
  const effectiveSel = sel || copy.defaultKind;
  const list = copy.kindList(effectiveSel);
  return list.map(([v, l]) => `<option value="${v}" ${v === effectiveSel ? 'selected' : ''}>${l}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. INVENTAIRE PRODUITS
 * ─────────────────────────────────────────────────────────────────────────── */
/* La page, en trois langues. Elle était en français sous l'anglais et l'arabe,
   alors que la fiche qu'elle ouvre parlait déjà la langue de l'écran ; et sa
   ligne disait « Divers » quand la fiche disait « Sans catégorie ». */
const _bqxEnN = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const _arProducts = (n) => _bqxArCount(n, 'منتج واحد', 'منتجان', 'منتجات', 'منتجًا', 'منتج');
const _BQX_INV = {
  fr: {
    title: 'Inventaire produits', store: 'Boutique', shared: ' · base partagée avec la caisse', cur: 'MAD',
    noArchived: 'Aucun produit archivé', noResult: 'Aucun résultat pour cette recherche.',
    archHintTill: 'Un produit archivé quitte la caisse sans perdre son historique. Il réapparaît ici.',
    archHint: 'Un produit archivé sort du catalogue sans perdre son historique. Il réapparaît ici.',
    emptyCat: 'Catalogue vide',
    emptyTpl: 'Partez d’un modèle de rayons · arts de la table, verrerie, bougies, décoration · puis ajustez les prix et saisissez vos quantités.',
    tplPick: 'Choisir mes rayons', noProduct: 'Aucun produit', noLow: 'Rien à réassortir dans cette sélection.',
    noColor: 'Aucun article de cette couleur. Touchez la pastille à nouveau pour tout revoir.',
    createTill: 'Créez un produit ici, ou depuis la caisse{hint} avec la douchette.', createFirst: 'Créez votre premier produit ici.',
    hProduct: 'Produit', hColors: 'Couleurs', hVariants: 'Variantes', hCodes: 'Codes-barres', hPrice: 'Prix', hStock: 'Stock',
    catB: 'Catégorie B', archived: 'Archivé', noCat: 'Sans catégorie', complete: 'Complets', out: 'Rupture',
    colorFilter: 'Filtrer par couleur', color: 'Couleur', seeAll: 'Tout voir',
    kNoCost: ' · au prix de vente, coûts non saisis', kPotential: ' · potentiel {v} {cur}',
    import: 'Importer un CSV', export: 'Exporter en CSV', templates: 'Modèles de rayons', nfc: 'Tags NFC', moves: 'Mouvements de stock',
    kProducts: 'Produits', kValue: 'Valeur du stock', kRestock: 'À réassortir', kShelves: 'Rayons', kShelvesSub: 'Gérés dans Catégories',
    kFilterOn: 'Filtre actif · toucher pour tout revoir', kLowOut: '{low} stock bas · {out} en rupture', kNone: 'Rien sous 5 pièces',
    search: 'Rechercher un produit, un rayon, un code-barres', searchAria: 'Rechercher dans l’inventaire',
    view: 'Affichage', grid: 'Grille', list: 'Liste', done: 'Terminer', select: 'Sélectionner',
    moreAria: 'Plus d’actions', more: 'Plus', newProduct: 'Nouveau produit', all: 'Tous', archivedPill: 'Archivés',
    selBarAria: 'Actions sur la sélection', tapToSelect: 'Touchez les produits à sélectionner',
    selAll: 'Tout sélectionner', selNone: 'Tout désélectionner', selAllShort: 'Tout', selNoneShort: 'Aucun',
    restore: 'Restaurer', archive: 'Archiver', move: 'Changer de catégorie', moveShort: 'Catégorie', delete: 'Supprimer',
    archivedTill: 'Retirés de la caisse, historique conservé. Retrouvez-les dans « Archivés ».',
    archivedHist: 'Historique conservé. Retrouvez-les dans « Archivés ».',
    restoredTill: 'De nouveau en vente à la caisse.', restoredCat: 'De nouveau au catalogue.',
    moveDesc: '{sel}. Prix, stock et codes-barres ne changent pas.', moveLabel: 'Nouvelle catégorie', cancel: 'Annuler', moveOk: 'Déplacer',
    movedTo: 'Vers « {c} ».',
    delDesc: '{names}{more} · {variants} (codes-barres inclus) seront supprimés définitivement.',
    irreversible: 'Action irréversible', delGoneTill: 'Les produits disparaissent de la caisse et du tableau de bord.',
    delGone: 'Les produits disparaissent du tableau de bord.', delCodes: 'Les codes-barres associés sont libérés.',
    delArchiveHint: 'Pour simplement les retirer de la vente en gardant l’historique, archivez-les.',
    archiveInstead: 'Archiver plutôt', delOk: 'Supprimer définitivement',
    unavailable: 'Module inventaire indisponible', unavailableDesc: 'Les moteurs catalogue et code-barres ne sont pas chargés. Rechargez la page.',
    importNA: 'Import indisponible', importNADesc: 'Le module d’import n’est pas chargé. Rechargez la page.',
    exported: 'Inventaire exporté', exportedDesc: 'Fichier CSV téléchargé (produit, couleur, taille, stock, code-barres).', exportFail: 'Export impossible',
    products: (n) => _bqxN(n, 'produit'),
    selected: (n) => `${_bqxN(n, 'produit')} sélectionné${n > 1 ? 's' : ''}`,
    archivedN: (n) => `${_bqxN(n, 'produit')} archivé${n > 1 ? 's' : ''}`,
    restoredN: (n) => `${_bqxN(n, 'produit')} restauré${n > 1 ? 's' : ''}`,
    movedN: (n) => `${_bqxN(n, 'produit')} déplacé${n > 1 ? 's' : ''}`,
    deletedN: (n) => `${_bqxN(n, 'produit')} supprimé${n > 1 ? 's' : ''}`,
    delTitle: (n) => `Supprimer ${_bqxN(n, 'produit')} ?`,
    andMore: (k) => ` et ${k} autre${k > 1 ? 's' : ''}`,
    missing: (n) => `${n} manquant${n > 1 ? 's' : ''}`,
    left: (n) => `${n} restant${n > 1 ? 's' : ''}`,
    inStock: (n) => `${n} en stock`,
    kSomeCost: (a, b) => ` · ${a} produit${a < 2 ? '' : 's'} sur ${b} au coût d’achat`,
    unsaved: 'Non enregistré sur cet appareil',
    unsavedDesc: 'Le stockage du navigateur est plein ou bloqué. La modification part au serveur dès que la connexion le permet. Libérez du stockage avant de recharger la page.',
    resaved: 'Catalogue de nouveau enregistré sur cet appareil',
  },
  en: {
    title: 'Product inventory', store: 'Store', shared: ' · shared with the till', cur: 'MAD',
    noArchived: 'No archived products', noResult: 'Nothing matches this search.',
    archHintTill: 'An archived product leaves the till without losing its history. It shows up here.',
    archHint: 'An archived product leaves the catalogue without losing its history. It shows up here.',
    emptyCat: 'Empty catalogue',
    emptyTpl: 'Start from a set of shelves · tableware, glassware, candles, decoration · then adjust the prices and enter your quantities.',
    tplPick: 'Choose my shelves', noProduct: 'No products', noLow: 'Nothing to restock in this selection.',
    noColor: 'No items in this colour. Tap the swatch again to see everything.',
    createTill: 'Create a product here, or at the till{hint} with the scanner.', createFirst: 'Create your first product here.',
    hProduct: 'Product', hColors: 'Colours', hVariants: 'Variants', hCodes: 'Barcodes', hPrice: 'Price', hStock: 'Stock',
    catB: 'Category B', archived: 'Archived', noCat: 'No category', complete: 'Complete', out: 'Out of stock',
    colorFilter: 'Filter by colour', color: 'Colour', seeAll: 'Show all',
    kNoCost: ' · at selling price, no costs entered', kPotential: ' · {v} {cur} at selling price',
    import: 'Import a CSV', export: 'Export as CSV', templates: 'Shelf templates', nfc: 'NFC tags', moves: 'Stock movements',
    kProducts: 'Products', kValue: 'Stock value', kRestock: 'To restock', kShelves: 'Shelves', kShelvesSub: 'Managed in Categories',
    kFilterOn: 'Filter on · tap to see everything', kLowOut: '{low} low · {out} out of stock', kNone: 'Nothing under 5 pieces',
    search: 'Search a product, a shelf, a barcode', searchAria: 'Search the inventory',
    view: 'View', grid: 'Grid', list: 'List', done: 'Done', select: 'Select',
    moreAria: 'More actions', more: 'More', newProduct: 'New product', all: 'All', archivedPill: 'Archived',
    selBarAria: 'Actions on the selection', tapToSelect: 'Tap the products to select them',
    selAll: 'Select all', selNone: 'Deselect all', selAllShort: 'All', selNoneShort: 'None',
    restore: 'Restore', archive: 'Archive', move: 'Change category', moveShort: 'Category', delete: 'Delete',
    archivedTill: 'Off the till, history kept. Find them under Archived.',
    archivedHist: 'History kept. Find them under Archived.',
    restoredTill: 'On sale at the till again.', restoredCat: 'Back in the catalogue.',
    moveDesc: '{sel}. Price, stock and barcodes do not change.', moveLabel: 'New category', cancel: 'Cancel', moveOk: 'Move',
    movedTo: 'To {c}.',
    delDesc: '{names}{more} · {variants} (barcodes included) will be deleted for good.',
    irreversible: 'This cannot be undone', delGoneTill: 'The products disappear from the till and the dashboard.',
    delGone: 'The products disappear from the dashboard.', delCodes: 'Their barcodes are released.',
    delArchiveHint: 'To take them off sale and keep their history, archive them instead.',
    archiveInstead: 'Archive instead', delOk: 'Delete for good',
    unavailable: 'Inventory unavailable', unavailableDesc: 'The catalogue and barcode modules did not load. Reload the page.',
    importNA: 'Import unavailable', importNADesc: 'The import module did not load. Reload the page.',
    exported: 'Inventory exported', exportedDesc: 'CSV file downloaded (product, colour, size, stock, barcode).', exportFail: 'Export failed',
    products: (n) => _bqxEnN(n, 'product'),
    selected: (n) => `${_bqxEnN(n, 'product')} selected`,
    archivedN: (n) => `${_bqxEnN(n, 'product')} archived`,
    restoredN: (n) => `${_bqxEnN(n, 'product')} restored`,
    movedN: (n) => `${_bqxEnN(n, 'product')} moved`,
    deletedN: (n) => `${_bqxEnN(n, 'product')} deleted`,
    delTitle: (n) => `Delete ${_bqxEnN(n, 'product')}?`,
    andMore: (k) => ` and ${k} more`,
    missing: (n) => `${n} missing`,
    left: (n) => `${n} left`,
    inStock: (n) => `${n} in stock`,
    kSomeCost: (a, b) => ` · ${a} of ${b} products at cost`,
    unsaved: 'Not saved on this device',
    unsavedDesc: 'Browser storage is full or blocked. The change is sent to the server as soon as the connection allows. Free up storage before reloading the page.',
    resaved: 'Catalogue saved on this device again',
  },
  ar: {
    title: 'جرد المنتجات', store: 'المتجر', shared: ' · مشتركة مع الصندوق', cur: 'درهم',
    noArchived: 'لا منتجات مؤرشفة', noResult: 'لا نتائج لهذا البحث.',
    archHintTill: 'المنتج المؤرشف يغادر الصندوق دون أن يفقد سجله. يظهر هنا.',
    archHint: 'المنتج المؤرشف يخرج من الكتالوج دون أن يفقد سجله. يظهر هنا.',
    emptyCat: 'الكتالوج فارغ',
    emptyTpl: 'ابدأ من نموذج أقسام · أدوات المائدة، الزجاجيات، الشموع، الديكور · ثم عدّل الأسعار وأدخل الكميات.',
    tplPick: 'اختر أقسامي', noProduct: 'لا منتجات', noLow: 'لا شيء لإعادة التزويد في هذا الاختيار.',
    noColor: 'لا منتجات بهذا اللون. المس الدائرة مرة أخرى لرؤية الكل.',
    createTill: 'أنشئ منتجًا هنا، أو من الصندوق{hint} بقارئ الرموز.', createFirst: 'أنشئ منتجك الأول هنا.',
    hProduct: 'المنتج', hColors: 'الألوان', hVariants: 'المتغيّرات', hCodes: 'الرموز الشريطية', hPrice: 'السعر', hStock: 'المخزون',
    catB: 'الفئة B', archived: 'مؤرشف', noCat: 'بدون فئة', complete: 'مكتملة', out: 'نفد',
    colorFilter: 'تصفية حسب اللون', color: 'اللون', seeAll: 'عرض الكل',
    kNoCost: ' · بسعر البيع، التكاليف غير مُدخلة', kPotential: ' · {v} {cur} بسعر البيع',
    import: 'استيراد ملف CSV', export: 'تصدير بصيغة CSV', templates: 'نماذج الأقسام', nfc: 'وسوم NFC', moves: 'حركات المخزون',
    kProducts: 'المنتجات', kValue: 'قيمة المخزون', kRestock: 'لإعادة التزويد', kShelves: 'الأقسام', kShelvesSub: 'تُدار في الفئات',
    kFilterOn: 'التصفية مفعّلة · المس لرؤية الكل', kLowOut: 'منخفض: {low} · نفد: {out}', kNone: 'لا شيء تحت 5 قطع',
    search: 'ابحث عن منتج أو قسم أو رمز شريطي', searchAria: 'البحث في الجرد',
    view: 'العرض', grid: 'شبكة', list: 'قائمة', done: 'إنهاء', select: 'تحديد',
    moreAria: 'إجراءات أخرى', more: 'المزيد', newProduct: 'منتج جديد', all: 'الكل', archivedPill: 'المؤرشفة',
    selBarAria: 'إجراءات على التحديد', tapToSelect: 'المس المنتجات لتحديدها',
    selAll: 'تحديد الكل', selNone: 'إلغاء تحديد الكل', selAllShort: 'الكل', selNoneShort: 'لا شيء',
    restore: 'استعادة', archive: 'أرشفة', move: 'تغيير الفئة', moveShort: 'الفئة', delete: 'حذف',
    archivedTill: 'أُزيلت من الصندوق مع حفظ السجل. تجدها في «المؤرشفة».',
    archivedHist: 'السجل محفوظ. تجدها في «المؤرشفة».',
    restoredTill: 'معروضة للبيع في الصندوق من جديد.', restoredCat: 'عادت إلى الكتالوج.',
    moveDesc: '{sel}. لا يتغير السعر ولا المخزون ولا الرموز الشريطية.', moveLabel: 'الفئة الجديدة', cancel: 'إلغاء', moveOk: 'نقل',
    movedTo: 'إلى «{c}».',
    delDesc: '{names}{more} · ستُحذف {variants} نهائيًا مع رموزها الشريطية.',
    irreversible: 'إجراء لا رجعة فيه', delGoneTill: 'تختفي المنتجات من الصندوق ولوحة التحكم.',
    delGone: 'تختفي المنتجات من لوحة التحكم.', delCodes: 'تتحرر رموزها الشريطية.',
    delArchiveHint: 'لسحبها من البيع مع الاحتفاظ بسجلها، قم بأرشفتها.',
    archiveInstead: 'الأرشفة بدلًا من ذلك', delOk: 'حذف نهائي',
    unavailable: 'الجرد غير متاح', unavailableDesc: 'لم تُحمَّل وحدات الكتالوج والرموز الشريطية. أعد تحميل الصفحة.',
    importNA: 'الاستيراد غير متاح', importNADesc: 'لم تُحمَّل وحدة الاستيراد. أعد تحميل الصفحة.',
    exported: 'تم تصدير الجرد', exportedDesc: 'تم تنزيل ملف CSV (المنتج، اللون، المقاس، المخزون، الرمز الشريطي).', exportFail: 'تعذّر التصدير',
    products: (n) => _arProducts(n),
    selected: (n) => `المحدد: ${_arProducts(n)}`,
    archivedN: (n) => `تمت أرشفة ${_arProducts(n)}`,
    restoredN: (n) => `تمت استعادة ${_arProducts(n)}`,
    movedN: (n) => `تم نقل ${_arProducts(n)}`,
    deletedN: (n) => `تم حذف ${_arProducts(n)}`,
    delTitle: (n) => `حذف ${_arProducts(n)}؟`,
    andMore: (k) => ` و${k} غيرها`,
    missing: (n) => `بدون رمز: ${n}`,
    left: (n) => `المتبقي: ${n}`,
    inStock: (n) => `في المخزون: ${n}`,
    kSomeCost: (a, b) => ` · ${a} من ${b} بالتكلفة`,
    unsaved: 'لم يُحفظ على هذا الجهاز',
    unsavedDesc: 'تخزين المتصفح ممتلئ أو محظور. يُرسل التعديل إلى الخادم فور توفر الاتصال. حرّر مساحة التخزين قبل إعادة تحميل الصفحة.',
    resaved: 'عاد حفظ الكتالوج على هذا الجهاز',
  },
};
/* Le catalogue n'a pas pris sur ce navigateur (voir sayKept() dans
   assets/boutique-catalog.js) : la modification vit en mémoire et part au
   serveur, mais un rechargement la perdrait. On le dit sans bloquer, à chaque
   échec (au plus une fois par 30 s), puis une fois au retour à la normale. */
let _bqxUnsavedAt = 0;
window.addEventListener('kiwi:local-save', (e) => {
  const d = (e && e.detail) || {};
  if (d.store !== 'catalog') return;
  const t = _bqxInvT();
  if (d.durable) {
    if (_bqxUnsavedAt) { _bqxUnsavedAt = 0; toast(t.resaved, { type: 'success' }); }
    return;
  }
  const now = Date.now();
  if (_bqxUnsavedAt && now - _bqxUnsavedAt < 30000) return;
  _bqxUnsavedAt = now;
  toast(t.unsaved, { desc: t.unsavedDesc, type: 'warn', duration: 9000 });
});
function _bqxInvT() { return _BQX_INV[_bqxPfLang()]; }
/* Ce que la grille montre en ce moment : filtre de rayon (ou « Archivés »),
   recherche et couleur. « Tout sélectionner » s'appuie dessus, pour ne jamais
   cocher ce que l'écran ne montre pas. */
function _bqxVisibleProducts() {
  let products = _bqxFilter === _BQX_ARCHIVED
    ? CAT().listProducts({ includeArchived: true, q: _bqxQuery }).filter((p) => p.archived)
    : CAT().listProducts({ categoryId: _bqxFilter, q: _bqxQuery });
  // Filtrer par couleur, c'est filtrer par FAMILLE : on cherche « du bleu », pas
  // « du bleu nuit ». Une variante marine et une variante turquoise répondent
  // toutes les deux, et restent malgré tout deux articles distincts.
  if (_bqxColorFilter) products = products.filter((p) => (CAT().getProduct(p.id).families || []).includes(_bqxColorFilter));
  if (_bqxLowOnly) products = products.filter((p) => CAT().getProduct(p.id).stock <= 5);
  return products;
}

function _bqxGridHtml() {
  const t = _bqxInvT();
  const products = _bqxVisibleProducts();
  if (!products.length) {
    if (_bqxFilter === _BQX_ARCHIVED) return `<div class="kx-foot-hint"><div class="lh">${_esc(t.noArchived)}</div><div class="rh">${
      _esc(_bqxQuery ? t.noResult : (_bqxTillReads() ? t.archHintTill : t.archHint))}</div></div>`;
    /* Catalogue entièrement vide et métier pourvu de modèles : on ouvre la porte
       plutôt que de constater le vide. Un filtre ou une recherche sans résultat
       reste un simple constat — le magasin, lui, n'est pas vide. */
    const virgin = !_bqxColorFilter && !_bqxQuery && !_bqxLowOnly && _bqxFilter === 'all' && !CAT().listProducts({ includeArchived: true }).length;
    if (virgin && _bqxTemplatesOn()) {
      return `<div class="kx-foot-hint" style="align-items:center;">
        <div class="lh">${_esc(t.emptyCat)}</div>
        <div class="rh">${_esc(t.emptyTpl)}
          <div style="margin-top:10px;"><button class="kb atlas" data-action="bqx-templates">${window.KiwiStoreTemplates.mark(14)}${_esc(t.tplPick)}</button></div>
        </div>
      </div>`;
    }
    return `<div class="kx-foot-hint"><div class="lh">${_esc(t.noProduct)}</div><div class="rh">${_esc(
      _bqxLowOnly ? t.noLow
        : _bqxColorFilter ? t.noColor
        : _bqxQuery ? t.noResult
        : (_bqxTillReads() ? _bqxPfFill(t.createTill, { hint: _bqxTillHint() }) : t.createFirst))}</div></div>`;
  }
  if (_bqxView === 'list') {
    return `<div class="bqx-list">
      <div class="bqx-lhead" aria-hidden="true"><span></span><span>${_esc(t.hProduct)}</span><span>${_esc(t.hColors)}</span><span class="r">${_esc(t.hVariants)}</span><span>${_esc(t.hCodes)}</span><span class="r">${_esc(t.hPrice)}</span><span class="r">${_esc(t.hStock)}</span></div>
      ${products.map(_bqxRowHtml).join('')}
    </div>`;
  }
  // Dès qu'un seul produit a sa photo, la grille passe en vignettes : les
  // autres gardent leurs initiales sur la teinte de leur rayon. Sans aucune
  // photo, la carte reste compacte plutôt que d'aligner des aplats vides.
  const media = products.some((p) => _bqxPhotoSrc(p));
  return `<div class="bqx-grid ${media ? 'is-media' : 'is-compact'}">${products.map(_bqxCardHtml).join('')}</div>`;
}

/* Une carte, ou une ligne, qui s'ouvre au toucher, ou se coche en mode
   sélection. Les deux vues partagent ces attributs. */
function _bqxOpenAttrs(p, cls) {
  const id = _esc(p.id);
  const arch = p.archived ? ' is-arch' : '';
  if (_bqxSelecting) {
    const sel = _bqxSel.has(p.id);
    return `class="${cls} bqx-selectable${sel ? ' is-sel' : ''}${arch}" data-action="bqx-sel-toggle" data-arg="${id}" role="checkbox" aria-checked="${sel}" tabindex="0" aria-label="${_esc(p.name)}"`;
  }
  return `class="${cls}${arch}" data-action="bqx-open" data-arg="${id}" role="button" tabindex="0" aria-label="${_esc(p.name)}"`;
}
/* Seule une adresse d'image servie (R2, https) passe dans un src. */
function _bqxPhotoSrc(p) {
  const src = String((p && p.photo) || '');
  return /^(https?:\/\/|\/)/.test(src) ? src : '';
}
function _bqxThumb(p) {
  const src = _bqxPhotoSrc(p);
  if (src) return `<img src="${_esc(src)}" alt="" loading="lazy" decoding="async" />`;
  const words = String(p.name || '').trim().split(/\s+/).filter(Boolean);
  const ini = ((words[0] || '·').charAt(0) + (words[1] ? words[1].charAt(0) : '')).toUpperCase();
  return `<span class="bqx-ini" aria-hidden="true">${_esc(ini)}</span>`;
}
function _bqxStockTag(stock) {
  const t = _bqxInvT();
  if (stock <= 0) return `<span class="bqx-stag out">${_esc(t.out)}</span>`;
  if (stock <= 5) return `<span class="bqx-stag low">${_esc(t.left(stock))}</span>`;
  return `<span class="bqx-stag">${_esc(t.inStock(stock))}</span>`;
}
function _bqxSwatches(colors, max) {
  const kc = window.KiwiColors;
  if (!kc || !colors || !colors.length) return '';
  return colors.slice(0, max).map((c) => kc.swatch(c)).join('') + (colors.length > max ? `<em>+${colors.length - max}</em>` : '');
}
function _bqxTint(cat) { return cat ? (_TAGHEX[cat.color] || '#0B6E4F') : '#9AA09D'; }
/* La vignette sans photo prend la couleur du PRODUIT (sa première teinte),
   pas celle de son rayon : un costume noir ne doit pas s'afficher vert parce
   que le rayon « Costumes » porte l'étiquette Atlas. Le point devant le nom
   du rayon, lui, garde la couleur du rayon. */
function _bqxSwatchVars(cat, data) {
  const catHex = _bqxTint(cat);
  const kc = window.KiwiColors;
  const c = data && data.colors && data.colors[0];
  const f = c && kc ? (typeof c === 'object' ? c : kc.display(c)) : null;
  const hex = f && /^#[0-9a-f]{6}$/i.test(String(f.hex || '')) ? f.hex : '';
  if (!hex) return `--tint:${catHex};--cat:${catHex};`;
  return `--tint:${hex};--cat:${catHex};${f.light ? '--ini:var(--n-500, #77807b);' : ''}`;
}

function _bqxCardHtml(p) {
  const t = _bqxInvT();
  const data = CAT().getProduct(p.id);
  const cat = data.category;
  return `<div ${_bqxOpenAttrs(p, 'bqx-card')} style="${_bqxSwatchVars(cat, data)}">
      ${_bqxSelecting ? '<span class="bqx-check" aria-hidden="true"></span>' : ''}
      <div class="bqx-thumb">${_bqxThumb(p)}</div>
      <div class="bqx-cbody">
        <div class="kx-sku-head"><div class="n">${_esc(p.name)}${_bqxAbOn() && p.ownership === 'consignment'
          ? `<span class="bqx-ab-b" title="${_esc(t.catB)}">B</span>` : ''}</div></div>
        <div class="bqx-cmeta"><span class="bqx-dot"></span><span>${p.archived ? _esc(t.archived) : cat ? _esc(cat.name) : _esc(t.noCat)}</span><span aria-hidden="true">·</span><span>${_esc(_bqxShT().variants(data.variants.length))}</span></div>
        <div class="bqx-card-cols">${_bqxSwatches(data.colors, 8)}</div>
        <div class="bqx-cfoot"><span class="bqx-price">${_bqxPrice(p.priceMAD)}<small>${_esc(t.cur)}</small></span>${_bqxStockTag(data.stock)}</div>
      </div>
    </div>`;
}

function _bqxRowHtml(p) {
  const t = _bqxInvT();
  const data = CAT().getProduct(p.id);
  const cat = data.category;
  const nVar = data.variants.length;
  const nBc = data.variants.reduce((s, v) => s + ((v.barcodes && v.barcodes.length) ? 1 : 0), 0);
  const miss = nVar - nBc;
  return `<div ${_bqxOpenAttrs(p, 'bqx-row')} style="${_bqxSwatchVars(cat, data)}">
      <span class="bqx-rlead">${_bqxSelecting ? '<span class="bqx-check" aria-hidden="true"></span>' : `<span class="bqx-thumb">${_bqxThumb(p)}</span>`}</span>
      <span class="bqx-rname"><b>${_esc(p.name)}${_bqxAbOn() && p.ownership === 'consignment'
        ? `<span class="bqx-ab-b" title="${_esc(t.catB)}">B</span>` : ''}</b><small><span class="bqx-dot"></span>${p.archived ? _esc(t.archived) : cat ? _esc(cat.name) : _esc(t.noCat)}</small></span>
      <span class="bqx-rcols">${_bqxSwatches(data.colors, 6) || '<i class="nil">·</i>'}</span>
      <span class="bqx-rnum">${nVar}</span>
      <span class="bqx-rbc${miss > 0 ? ' miss' : ''}">${!nVar ? '<i class="nil">·</i>' : _esc(miss > 0 ? t.missing(miss) : t.complete)}</span>
      <span class="bqx-rnum bqx-rprice">${_bqxPrice(p.priceMAD)} ${_esc(t.cur)}</span>
      <span class="bqx-rstock">${_bqxStockTag(data.stock)}</span>
    </div>`;
}

/* Filtre couleur : uniquement les familles que ce magasin a réellement en rayon.
   C'est ce qui garde « Transparent » hors du chemin tant qu'aucun article ne
   l'utilise, et ce qui évite d'afficher treize pastilles à une boutique qui n'en
   vend que quatre. Rien n'apparaît tant qu'il n'y a pas au moins deux couleurs :
   filtrer sur la seule couleur du magasin ne sert à rien. */
function _bqxColorBar(cat) {
  const kc = window.KiwiColors;
  if (!kc || !cat.colorsInUse) return '';
  const used = cat.colorsInUse();
  if (used.length < 2) return '';
  const t = _bqxInvT();
  return `<div class="bqx-cfilter" role="group" aria-label="${_esc(t.colorFilter)}">
    <span class="bqx-cfilter-l">${_esc(t.color)}</span>
    ${used.map((c) => {
      const on = _bqxColorFilter === c.id;
      return `<button class="kc-sw${c.light ? ' is-light' : ''}${on ? ' is-on' : ''}" ${c.pattern ? `data-kc-pattern="${c.pattern}"` : ''} `
        + `style="${c.pattern ? '' : `background-color:${c.hex};`}" data-action="bqx-cfilter" data-arg="${c.id}" `
        + `role="button" aria-pressed="${on ? 'true' : 'false'}" title="${_esc(_bqxColorName(c))}" aria-label="${_esc(_bqxColorName(c))}"></button>`;
    }).join('')}
    ${_bqxColorFilter ? `<button class="kb ghost xs" data-action="bqx-cfilter" data-arg="">${_esc(t.seeAll)}</button>` : ''}
  </div>`;
}

/* the boutique inventory follows the dashboard's active venue, so every boutique
   (Maison Mansour or any future store) gets its OWN catalogue automatically. */
/* One brain: a REAL merchant keys its catalogue by its MERCHANT SLUG — the identity
   spine mirrored byte-for-byte across dashboard/caisse/D1 (see caisse-link.js) — so the
   dashboard and the paired caisse read/write the SAME inventory. Venue ids ('own' /
   custom / cafeAtlas) are timing-dependent and diverge between the two surfaces; the
   slug never does. Demo (localhost, not signed in) keeps the venue id so the pitch
   catalogue still shows. */
function _bqxSlug(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'client';
}
/* One-time carry-over. Until now the catalogue key was slugged from the ACCOUNT
 * name; it is now slugged from the STORE name. For the common case (one store,
 * named like the account) the two are identical and nothing happens. Where they
 * differ, the merchant's existing stock lives under the old key — adopt it
 * rather than showing them an empty inventory. Copy, never move: the old key is
 * left untouched so nothing is destroyed if this is wrong. */
var _bqxAdopted = {};
/* Every slug the catalogue could have been filed under before it was keyed by
 * store. Order does not matter — each is tried and only a non-empty catalogue is
 * taken. kiwiLiveMerchant is checked both as it stands (live-link may not have
 * repointed it, or may be off entirely) and as it stood before it did
 * (kiwiLiveMerchantPrev), so this never depends on script load order. */
function _bqxLegacyPins() {
  var out = [];
  try {
    ['kiwiLiveMerchantPrev', 'kiwiLiveMerchant'].forEach(function (k) {
      var v = localStorage.getItem(k); if (v) out.push(v);
    });
  } catch (_) {}
  return out;
}
/* Only carry over when the account has exactly ONE store. With two, there is no
 * way to tell which of them the account-keyed data belonged to, and guessing
 * would drop the boutique's stock into the restaurant. One store is the upgrade
 * path this exists for; anything else is left alone. */
function _bqxSoleStore() {
  try {
    var a = JSON.parse(localStorage.getItem('kiwiCustomVenues') || '[]');
    return Array.isArray(a) && a.length === 1;
  } catch (_) { return false; }
}
function _bqxHasStock(raw) {
  try { var d = JSON.parse(raw || 'null'); return !!(d && d.products && d.products.length); } catch (_) { return false; }
}
function _bqxAdoptLegacy(slug, legacySlug) {
  if (!slug || _bqxAdopted[slug]) return;
  _bqxAdopted[slug] = 1;
  if (!_bqxSoleStore()) return;
  try {
    var pre = 'kiwiBoutiqueCatalog:v1:';
    // A BLANK record does not count as "already has its own" — opening the page
    // once materialises an empty catalogue, which would otherwise permanently
    // block the carry-over for a merchant who had stock under the old key.
    if (_bqxHasStock(localStorage.getItem(pre + slug))) return;
    var cands = [legacySlug].concat(_bqxLegacyPins());
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      if (!c || c === slug) continue;
      var old = localStorage.getItem(pre + c);
      if (!_bqxHasStock(old)) continue;                   // nothing worth carrying
      localStorage.setItem(pre + slug, old);
      var seq = localStorage.getItem('kiwiBarcodeSeq:' + c);
      if (seq && !localStorage.getItem('kiwiBarcodeSeq:' + slug)) localStorage.setItem('kiwiBarcodeSeq:' + slug, seq);
      return;
    }
  } catch (_) {}
}
function _bqxVenue() {
  try {
    if (window.KiwiEnv && window.KiwiEnv.isReal && window.KiwiEnv.isReal()) {
      // Canonical key = slugMerchant(store name) — the SAME slug the caisse's
      // paired venue carries (functions/api/pair/create.js) and clients-store
      // uses, so a product added on either surface lands under ONE key and
      // inventory syncs across devices.
      //
      // It must be the STORE's name, not the account's. KiwiMe.business is a
      // single account-level name, so on an account with two shops both would
      // share one inventory — and worse, the till keys off its paired venue
      // (pos-boutique.js `_bqPv.merchant`), so for any store whose name differs
      // from the account name the two ends silently disagreed: stock scanned in
      // at the register never appeared on the dashboard. Identity is only the
      // fallback, for an account that has no store record yet.
      //
      // Et c'est le slug GRAVÉ du magasin (venues.js › slugOf), pas une
      // re-slugification de son nom : le nom se corrige, et un inventaire qui
      // change de clé parce qu'on a ajouté un accent à l'enseigne est un
      // inventaire perdu.
      var vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
      var biz = (window.KiwiMe && window.KiwiMe.business) || '';
      if (vd.custom && vd.name) {
        var slug = vd.slug || _bqxSlug(vd.name);
        _bqxAdoptLegacy(slug, biz && _bqxSlug(biz));
        return slug;
      }
      if (biz) return _bqxSlug(biz);
      if (vd.name) return _bqxSlug(vd.name);
    }
  } catch (_) {}
  return (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'maisonMansour';
}

/* Exposé pour les autres surfaces du tableau de bord — dateRange.js relit le
 * coût matière du catalogue pour calculer le bénéfice brut de l'accueil. La
 * règle de clé, et l'adoption des clés héritées qu'elle déclenche, ne doit
 * exister qu'ici : une deuxième copie dériverait tôt ou tard de celle-ci, et
 * les deux surfaces liraient alors deux inventaires différents. */
window.KiwiBoutiqueVenueKey = _bqxVenue;
/* Ce fichier s'exécute APRÈS dateRange.js, dont le premier rendu est déjà passé
 * sans la clé. On le prévient une fois pour qu'il rejoue sa bande de KPI. */
try { window.dispatchEvent(new Event('kiwi-catalog-key')); } catch (_) {}

/* Display name for a modal eyebrow — the store's OWN name. Identity first (it is
 * what the merchant signed up as), then the venue label, then a neutral word.
 * In the demo KiwiMe is absent and the venue IS Maison Mansour, so the demo tag
 * is unchanged. */
function _bqxTag() {
  try {
    // The STORE being looked at, not the account that owns it — otherwise both
    // shops on one account are labelled with the same name.
    var vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
    if (vd.custom && vd.name) return String(vd.name).toUpperCase();
    var biz = (window.KiwiMe && window.KiwiMe.business) || '';
    if (biz) return String(biz).toUpperCase();
    if (vd.name) return String(vd.name).toUpperCase();
  } catch (_) {}
  return 'BOUTIQUE';
}

/* fr pluralisation for the boutique counters — "1 produit", "2 produits". */
function _bqxN(n, one, many) { return n + ' ' + (Math.abs(n) < 2 ? one : (many || one + 's')); }

/* Base d'affichage de « VALEUR DE STOCK ». Une boutique RÉELLE voit ce que sa
   marchandise a COÛTÉ — le seul chiffre exploitable en compta, en assurance ou
   pour un besoin en fonds de roulement — avec le potentiel de vente rappelé en
   dessous. La démo de présentation garde son chiffre au prix de vente, inchangé.
   `costed` vaut 0 quand aucun produit n'a de coût saisi : la base coût est alors
   un repli sur le prix, on ne promet donc pas un potentiel qui serait le même
   nombre affiché deux fois. */
function _bqxStockKPI(st) {
  /* `shown` : le chiffre tel qu'on l'affiche. Les prix gardent leurs centimes,
     la valeur de stock aussi (3 × 249,90 ne devient pas 750). */
  const out = (amount, note) => ({ amount, shown: _bqxPrice(amount), note });
  const real = !!(window.KiwiVenue?.isCustom?.() || window.KiwiEnv?.isReal?.());
  if (!real) return out(st.stockValue, '');
  /* Trois cas, jamais un mélange sous le même libellé : aucun coût saisi (on le
     dit, le chiffre est au prix de vente), coûts partiels (le coût des seuls
     produits chiffrés, la part est annoncée), coûts complets (potentiel rappelé). */
  const t = _bqxInvT();
  if (!st.costed) return out(st.stockValue, t.kNoCost);
  if (st.costed < st.products) return out(st.stockCostKnown, t.kSomeCost(st.costed, st.products));
  return out(st.stockCost, _bqxPfFill(t.kPotential, { v: _bqxPrice(st.stockValue), cur: t.cur }));
}

/* Les rayons tout prêts (assets/store-templates.js). Le bouton n'apparaît que
   pour un métier qui en a — aujourd'hui « Maison » : proposer des assiettes à
   un caviste serait pire que ne rien proposer. */
function _bqxTemplatesOn() {
  try {
    const T = window.KiwiStoreTemplates;
    return !!(T && T.has(T.currentTrade()));
  } catch (_) { return false; }
}

function _renderInventory() {
  const cat = CAT();
  cat.use(_bqxVenue());
  const st = cat.stats();
  const cats = cat.listCategories();
  const archivedN = cat.listProducts({ includeArchived: true }).filter((p) => p.archived).length;
  if (_bqxFilter === _BQX_ARCHIVED && !archivedN) _bqxFilter = 'all';
  const need = st.low + st.ruptures;
  if (!need) _bqxLowOnly = false;
  /* Une synchronisation a pu supprimer un produit coché ailleurs : il sort de
     la sélection plutôt que d'y rester invisible et compté. */
  _bqxSel.forEach((id) => { if (!cat.getProduct(id)) _bqxSel.delete(id); });
  const k = _bqxStockKPI(st);
  const t = _bqxInvT();
  const more = [
    `<button data-activation=write type="button" data-action="bqx-import">${_ICN.download}${_esc(t.import)}</button>`,
    `<button data-activation=money type="button" data-action="bqx-export">${_ICN.upload}${_esc(t.export)}</button>`,
    _bqxTemplatesOn() ? `<button type="button" data-action="bqx-templates">${window.KiwiStoreTemplates.mark(14)}${_esc(t.templates)}</button>` : '',
    _orderProOn() ? `<button data-activation=write type="button" data-action="orderpro-tags">${_esc(t.nfc)}</button>` : '',
    (window.KiwiMaisonStock && window.KiwiMaisonStock.isMaison()) ? `<button type="button" data-action="nav-stock-movements">${_esc(t.moves)}</button>` : '',
  ].join('');
  window.Kiwi.appPage('inventory', {
    title: t.title,
    subtitle: `${((window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {}).fullDisplay || t.store}${_bqxShared()}`,
    body: `<div class="bqx-inv">
      <div class="kx-kpi-strip bqx-kpis">
        <div class="kx-kpi"><div class="l">${_esc(t.kProducts)}</div><div class="v">${st.products}</div><div class="d">${_esc(_bqxShT().variants(st.variants))}</div></div>
        <div class="kx-kpi"><div class="l">${_esc(t.kValue)}</div><div class="v">${k.shown}<span class="u">${_esc(t.cur)}</span></div><div class="d">${_esc(_bqxShT().pieces(st.totalStock) + k.note)}</div></div>
        <button type="button" class="kx-kpi bqx-kpi-btn${need ? ' warn' : ''}${_bqxLowOnly ? ' is-on' : ''}" data-action="bqx-low" aria-pressed="${_bqxLowOnly}"${need ? '' : ' disabled'}>
          <div class="l">${_esc(t.kRestock)}</div><div class="v">${need}</div>
          <div class="d">${_esc(need ? (_bqxLowOnly ? t.kFilterOn : _bqxPfFill(t.kLowOut, { low: st.low, out: st.ruptures })) : t.kNone)}</div></button>
        <div class="kx-kpi"><div class="l">${_esc(t.kShelves)}</div><div class="v">${st.categories}</div><div class="d">${_esc(t.kShelvesSub)}</div></div>
      </div>

      <div class="p-toolbar bqx-toolbar">
        <div class="p-search"><span style="display:inline-flex;align-items:center;">${_ICN.search}</span>
          <input data-bqx-search placeholder="${_esc(t.search)}" value="${_esc(_bqxQuery)}" aria-label="${_esc(t.searchAria)}" style="border:none;background:transparent;outline:none;margin-inline-start:6px;font:inherit;color:inherit;flex:1;min-width:120px;" /></div>
        <div class="kx-tabs bqx-view" role="group" aria-label="${_esc(t.view)}">
          <button type="button" class="kx-tab${_bqxView === 'grid' ? ' on' : ''}" data-action="bqx-view" data-arg="grid" aria-pressed="${_bqxView === 'grid'}">${_esc(t.grid)}</button>
          <button type="button" class="kx-tab${_bqxView === 'list' ? ' on' : ''}" data-action="bqx-view" data-arg="list" aria-pressed="${_bqxView === 'list'}">${_esc(t.list)}</button>
        </div>
        <button class="kb ${_bqxSelecting ? 'atlas' : 'ghost'}" data-action="bqx-sel-mode" aria-pressed="${_bqxSelecting}">${_esc(_bqxSelecting ? t.done : t.select)}</button>
        <details class="bqx-more"><summary class="kb ghost" aria-label="${_esc(t.moreAria)}">${_BQX_MORE}<span>${_esc(t.more)}</span></summary>
          <div class="bqx-more-pop">${more}</div></details>
        <button class="kb primary" data-action="bqx-new">${_ICN.plus}${_esc(t.newProduct)}</button>
      </div>

      <div class="bqx-filters">
        <div class="kx-pills" data-pill-group="bqx-cat">
          <button class="kx-pill ${_bqxFilter === 'all' ? 'on' : ''}" data-action="bqx-filter" data-arg="all">${_esc(t.all)} <span class="ct">${st.products}</span></button>
          ${cats.map((c) => `<button class="kx-pill ${_bqxFilter === c.id ? 'on' : ''}" data-action="bqx-filter" data-arg="${c.id}">${_esc(c.name)} <span class="ct">${cat.categoryCount(c.id)}</span></button>`).join('')}
          ${archivedN || _bqxFilter === _BQX_ARCHIVED ? `<button class="kx-pill ${_bqxFilter === _BQX_ARCHIVED ? 'on' : ''}" data-action="bqx-filter" data-arg="${_BQX_ARCHIVED}">${_esc(t.archivedPill)} <span class="ct">${archivedN}</span></button>` : ''}
        </div>
        ${_bqxColorBar(cat)}
      </div>

      <div id="bqx-grid">${_bqxGridHtml()}</div>
      <div class="bqx-selbar" id="bqx-selbar" role="toolbar" aria-label="${_esc(t.selBarAria)}"${_bqxSelecting ? '' : ' hidden'}>${_bqxSelecting ? _bqxSelBarHtml() : ''}</div>
    </div>`,
  });
  setTimeout(() => {
    // Une carte s'ouvre (ou se coche, en mode sélection) au clavier comme au
    // clic : Espace ou Entrée.
    const grid = document.getElementById('bqx-grid');
    if (grid && !grid.__bqxKeys) {
      grid.__bqxKeys = true;
      grid.addEventListener('keydown', (ev) => {
        const card = ev.target.closest && ev.target.closest('.bqx-card, .bqx-row');
        if (card && card === ev.target && (ev.key === ' ' || ev.key === 'Enter')) { ev.preventDefault(); card.click(); }
      });
    }
    // Le menu « Plus » se referme dès qu'on choisit, ou qu'on touche ailleurs.
    const menu = document.querySelector('.dash-genpage .bqx-more');
    if (menu && !menu.__bqxWired) {
      menu.__bqxWired = true;
      menu.querySelector('.bqx-more-pop').addEventListener('click', () => { menu.open = false; });
      const away = (ev) => {
        if (!menu.isConnected) { document.removeEventListener('pointerdown', away, true); return; }
        if (menu.open && !menu.contains(ev.target)) menu.open = false;
      };
      document.addEventListener('pointerdown', away, true);
    }
    /* live search — re-render only the grid so the field keeps focus */
    const s = document.querySelector('.dash-genpage [data-bqx-search]');
    if (s) s.addEventListener('input', () => {
      _bqxQuery = s.value.trim();
      const g = document.getElementById('bqx-grid');
      if (g) g.innerHTML = _bqxGridHtml();
    });
  }, 0);
}

handlers['nav-inventory'] = () => {
  if (!_bqxReady()) { const t = _bqxInvT(); toast(t.unavailable, { desc: t.unavailableDesc, type: 'warn' }); return; }
  _bqxCss(); _bqxSubscribe(); _renderInventory();
};

/* Grille ↔ liste sans redessiner la page : la lentille glisse d'un onglet à
   l'autre, seule la zone des produits est remplacée. */
handlers['bqx-view'] = (el, arg) => {
  const next = arg === 'list' ? 'list' : 'grid';
  if (next === _bqxView) return;
  _bqxView = next;
  try { localStorage.setItem('kiwiInvView', next); } catch (_) {}
  const group = el && el.closest ? el.closest('.bqx-view') : null;
  if (group) group.querySelectorAll('.kx-tab').forEach((b) => {
    const on = b.getAttribute('data-arg') === next;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  const g = document.getElementById('bqx-grid');
  if (g) g.innerHTML = _bqxGridHtml(); else _renderInventory();
};
handlers['bqx-low'] = () => { _bqxLowOnly = !_bqxLowOnly; _renderInventory(); };

handlers['bqx-filter'] = (_el, arg) => {
  const next = arg || 'all';
  // Changer de vue entre le catalogue et les archives vide la sélection : les
  // actions n'y sont pas les mêmes (archiver d'un côté, restaurer de l'autre).
  if ((next === _BQX_ARCHIVED) !== (_bqxFilter === _BQX_ARCHIVED)) _bqxSel.clear();
  _bqxFilter = next; _renderInventory();
};

/* ── Sélection multiple ─────────────────────────────────────────────────────
   Chaque geste groupé passe par CAT().batch() : une seule écriture du
   catalogue et une seule synchronisation vers la caisse, quel que soit le
   nombre de produits. */
function _bqxBatch(fn) { const c = CAT(); return c.batch ? c.batch(fn) : fn(); }
function _bqxSelBarHtml() {
  const n = _bqxSel.size, none = n ? '' : ' disabled';
  const visible = _bqxVisibleProducts();
  const allOn = visible.length > 0 && visible.every((p) => _bqxSel.has(p.id));
  const archived = _bqxFilter === _BQX_ARCHIVED;
  const t = _bqxInvT();
  return `<span class="n" aria-live="polite">${_esc(n ? t.selected(n) : t.tapToSelect)}</span>
    <button type="button" data-action="bqx-sel-all"${visible.length ? '' : ' disabled'}><span class="lg">${_esc(allOn ? t.selNone : t.selAll)}</span><span class="sh">${_esc(allOn ? t.selNoneShort : t.selAllShort)}</span></button>
    ${archived
      ? `<button type="button" data-action="bqx-sel-restore"${none}>${_esc(t.restore)}</button>`
      : `<button type="button" data-action="bqx-sel-archive"${none}>${_esc(t.archive)}</button>
         <button type="button" data-action="bqx-sel-move"${none}><span class="lg">${_esc(t.move)}</span><span class="sh">${_esc(t.moveShort)}</span></button>`}
    <button type="button" class="danger" data-action="bqx-sel-del"${none}>${_ICN.trash}${_esc(t.delete)}</button>
    <button type="button" class="ghost" data-action="bqx-sel-mode">${_esc(t.done)}</button>`;
}
function _bqxSelBarRefresh() {
  const bar = document.getElementById('bqx-selbar');
  if (bar && _bqxSelecting) bar.innerHTML = _bqxSelBarHtml();
}
function _bqxSelDone(msg, desc, type) {
  _bqxSel.clear();
  _bqxSelecting = false;
  if (_bqxModal) { _bqxModal.close(); _bqxModal = null; }
  toast(msg, { desc, type: type || 'success', duration: 2600 });
  _renderInventory();
}
handlers['bqx-sel-mode'] = () => {
  _bqxSelecting = !_bqxSelecting;
  _bqxSel.clear();
  _renderInventory();
};
handlers['bqx-sel-toggle'] = (el, arg) => {
  if (!arg) return;
  if (_bqxSel.has(arg)) _bqxSel.delete(arg); else _bqxSel.add(arg);
  const card = el && el.closest ? el.closest('.bqx-selectable') : null;
  if (card) { card.classList.toggle('is-sel', _bqxSel.has(arg)); card.setAttribute('aria-checked', String(_bqxSel.has(arg))); }
  _bqxSelBarRefresh();
};
handlers['bqx-sel-all'] = () => {
  const visible = _bqxVisibleProducts();
  const allOn = visible.length > 0 && visible.every((p) => _bqxSel.has(p.id));
  visible.forEach((p) => { if (allOn) _bqxSel.delete(p.id); else _bqxSel.add(p.id); });
  const g = document.getElementById('bqx-grid');
  if (g) g.innerHTML = _bqxGridHtml();
  _bqxSelBarRefresh();
};
handlers['bqx-sel-archive'] = () => {
  const ids = [..._bqxSel];
  if (!ids.length) return;
  _bqxBatch(() => ids.forEach((id) => CAT().archiveProduct(id, true)));
  const t = _bqxInvT();
  _bqxSelDone(t.archivedN(ids.length), _bqxTillReads() ? t.archivedTill : t.archivedHist);
};
handlers['bqx-sel-restore'] = () => {
  const ids = [..._bqxSel];
  if (!ids.length) return;
  _bqxBatch(() => ids.forEach((id) => CAT().archiveProduct(id, false)));
  _bqxFilter = 'all';
  const t = _bqxInvT();
  _bqxSelDone(t.restoredN(ids.length), _bqxTillReads() ? t.restoredTill : t.restoredCat);
};
handlers['bqx-sel-move'] = () => {
  const ids = [..._bqxSel];
  if (!ids.length) return;
  const cats = CAT().listCategories();
  const t = _bqxInvT();
  _bqxModal = modal({
    title: t.move, width: 440,
    desc: _esc(_bqxPfFill(t.moveDesc, { sel: t.selected(ids.length) })),
    body: `<label class="kf-label" for="bqx-sel-cat">${_esc(t.moveLabel)}</label>
      <select id="bqx-sel-cat" class="kf-input" style="width:100%;">
        ${cats.map((c) => `<option value="${_esc(c.id)}">${_esc(c.name)}</option>`).join('')}
        <option value="">${_esc(t.noCat)}</option>
      </select>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button class="kb atlas" data-action="bqx-sel-move-ok">${_esc(t.moveOk)}</button>`,
  });
};
handlers['bqx-sel-move-ok'] = () => {
  const ids = [..._bqxSel];
  const sel = document.getElementById('bqx-sel-cat');
  if (!ids.length || !sel) return;
  const target = sel.value;
  const c = CAT().listCategories().find((x) => x.id === target);
  _bqxBatch(() => ids.forEach((id) => CAT().updateProduct(id, { categoryId: target })));
  const t = _bqxInvT();
  _bqxSelDone(t.movedN(ids.length), _bqxPfFill(t.movedTo, { c: c ? c.name : t.noCat }));
};
handlers['bqx-sel-del'] = () => {
  const ids = [..._bqxSel];
  if (!ids.length) return;
  const names = ids.slice(0, 5).map((id) => { const d = CAT().getProduct(id); return d ? d.product.name : ''; }).filter(Boolean);
  const nVar = ids.reduce((sum, id) => { const d = CAT().getProduct(id); return sum + (d ? d.variants.length : 0); }, 0);
  const archivedView = _bqxFilter === _BQX_ARCHIVED;
  const t = _bqxInvT();
  const q = _bqxPfLang() === 'ar' ? ['«', '»'] : _bqxPfLang() === 'en' ? ['“', '”'] : ['« ', ' »'];
  _bqxModal = modal({
    title: t.delTitle(ids.length), width: 480,
    desc: _esc(_bqxPfFill(t.delDesc, {
      names: names.map((x) => q[0] + x + q[1]).join(', '),
      more: ids.length > 5 ? t.andMore(ids.length - 5) : '',
      variants: _bqxShT().variants(nVar),
    })),
    body: `<div class="kx-warn-box danger"><div class="hd">${_esc(t.irreversible)}</div><ul><li>${_esc(_bqxTillReads() ? t.delGoneTill : t.delGone)}</li><li>${_esc(t.delCodes)}</li>${archivedView ? '' : `<li>${_esc(t.delArchiveHint)}</li>`}</ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button>${archivedView ? '' : `<button class="kb ghost" data-action="bqx-sel-archive">${_esc(t.archiveInstead)}</button>`}<button class="kb danger" data-action="bqx-sel-del-ok">${_ICN.trash}${_esc(t.delOk)}</button>`,
  });
};
handlers['bqx-sel-del-ok'] = () => {
  const ids = [..._bqxSel];
  if (!ids.length) return;
  _bqxBatch(() => ids.forEach((id) => CAT().deleteProduct(id)));
  _bqxSelDone(_bqxInvT().deletedN(ids.length), '', 'warn');
};
/* Une pastille déjà active se désactive : c'est le geste attendu d'un filtre à
   choix unique, et ça évite d'ajouter un bouton « tout » de plus. */
handlers['bqx-cfilter'] = (_el, arg) => {
  _bqxColorFilter = (_bqxColorFilter === arg) ? '' : (arg || '');
  _renderInventory();
};
/* The way IN — a shop arriving from another till brings its article file rather
 * than retyping it. assets/catalog-import.js owns the parsing, the preview and
 * the writes; the page only re-renders once the merchant has confirmed. */
handlers['bqx-import'] = () => {
  if (!window.KiwiCatalogImport) {
    const t = _bqxInvT();
    toast(t.importNA, { desc: t.importNADesc, type: 'warn' });
    return;
  }
  window.KiwiCatalogImport.openBoutique({ onDone: () => _renderInventory() });
};
handlers['bqx-export'] = () => {
  try {
    const csv = CAT().exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const _vd = (window.KiwiVenue && window.KiwiVenue.getCurrentVenueData && window.KiwiVenue.getCurrentVenueData()) || {};
    const _slug = String(_vd.name || (window.KiwiVenue && window.KiwiVenue.getVenue && window.KiwiVenue.getVenue()) || 'inventaire')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'inventaire';
    a.href = URL.createObjectURL(blob); a.download = `inventaire-${_slug}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    const t = _bqxInvT();
    toast(t.exported, { desc: t.exportedDesc, type: 'success' });
  } catch (e) { toast(_bqxInvT().exportFail, { type: 'warn' }); }
};

/* ─── product detail drawer (the variant list) ───────────────────────────────
   La fiche produit, en trois langues. Une variante est une ligne qui se lit sur
   un téléphone comme sur un bureau : couleur, taille et stock, puis son
   code-barres et ses gestes. La fiche n'affirme que ce que le catalogue sait. */
function _bqxArCount(n, one, two, few, acc, gen) {
  if (n === 1) return one;
  if (n === 2) return two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${n} ${few}`;
  return `${n} ${r >= 11 && r <= 99 ? acc : gen}`;
}
const _arPieces = (n) => _bqxArCount(n, 'قطعة واحدة', 'قطعتان', 'قطع', 'قطعة', 'قطعة');
const _arVariants = (n) => _bqxArCount(n, 'متغيّر واحد', 'متغيّران', 'متغيّرات', 'متغيّراً', 'متغيّر');
const _BQX_SH = {
  fr: {
    close: 'Fermer', edit: 'Modifier le produit', delete: 'Supprimer', cancel: 'Annuler',
    notFound: 'Produit introuvable.', noCat: 'Sans catégorie', cur: 'MAD', inStock: '{n} en stock',
    tPrice: 'Prix de vente', costGap: 'Coût {cost} MAD · écart {gap} MAD', costOver: 'Coût {cost} MAD, au-dessus du prix',
    costNone: 'Coût d’achat non renseigné',
    tStock: 'En stock', noVariant: 'Aucune variante',
    tValue: 'Valeur du stock', valueSale: 'Au prix de vente', valueCost: 'Au prix de vente · {v} MAD au coût',
    tCodes: 'Codes-barres', codesOf: '{a} sur {b}', codesAll: 'Chaque variante a son code',
    pieces: (n) => `${n} ${n > 1 ? 'pièces' : 'pièce'}`,
    variants: (n) => `${n} ${n > 1 ? 'variantes' : 'variante'}`,
    outN: (n) => `${n} ${n > 1 ? 'épuisées' : 'épuisée'}`,
    codesMissing: (n) => (n > 1 ? `${n} variantes sans code` : '1 variante sans code'),
    variantsTitle: 'Variantes', addVariant: 'Ajouter une variante',
    empty: 'Aucune variante pour l’instant. Ajoutez la première : une couleur, une taille et son stock.',
    genMissing: (n) => (n > 1 ? `Générer les ${n} codes manquants` : 'Générer le code manquant'),
    printAll: (n) => (n > 1 ? `Imprimer les ${n} étiquettes` : 'Imprimer l’étiquette'),
    printNone: 'Aucune étiquette à imprimer',
    out: 'Épuisée', bcGenerated: 'Généré', bcImported: 'Importé', bcNone: 'Aucun code-barres',
    actLabel: 'Étiquette', actGen: 'Générer un code', actReg: 'Code existant', actDel: 'Supprimer la variante',
    actDelOf: 'Supprimer la variante {v}', actColor: 'Changer la couleur',
    stockOf: 'Stock de {v}', minus: 'Retirer une pièce', plus: 'Ajouter une pièce', less: 'Moins', more: 'Plus',
    stockEmpty: 'Indiquez un nombre de pièces, 0 si aucune.', stockBad: 'Un nombre entier de pièces, 0 ou plus.',
    irreversible: 'Action irréversible',
    delVarTitle: 'Supprimer cette variante ?',
    delStock: (n) => (n > 1 ? `${n} pièces sortent de l’inventaire.` : '1 pièce sort de l’inventaire.'),
    delNoStock: 'Elle n’a aucune pièce en stock.', delCodes: 'Ses codes-barres sont libérés : {codes}.',
    delTill: 'La caisse ne la proposera plus.', delVarOk: 'Supprimer la variante', delVarDone: 'Variante supprimée',
    genDone: 'EAN-13 généré', genDesc: 'Code {code} · imprimez l’étiquette pour l’article.', genFail: 'Aucun code généré',
    genAllDone: (n) => (n > 1 ? `${n} codes EAN-13 générés` : '1 code EAN-13 généré'),
    noCode: 'Aucun code à imprimer', noCodeVar: 'Générez d’abord un EAN-13 pour cette variante.',
    noCodeProd: 'Générez au moins un EAN-13 pour ce produit.',
    withCode: (n) => (n > 1 ? `${n} variantes avec code-barres` : '1 variante avec code-barres'),
    printTitle: 'Imprimer les étiquettes', printTag: 'ÉTIQUETTES',
    printDesc: 'Choisissez le nombre de copies, puis lancez l’impression.',
    copies: 'Copies par variante', copiesOne: 'Nombre d’étiquettes', copiesBad: 'Entre 1 et 99 copies.',
    totalLabels: (n) => (n > 1 ? `${n} étiquettes au total` : '1 étiquette au total'),
    printHint: 'L’aperçu d’impression s’ouvre : envoyez-le vers l’imprimante à étiquettes.', print: 'Imprimer',
    regTitle: 'Enregistrer un code existant',
    regDesc: 'Scannez ou saisissez le code déjà présent sur l’article. Il est gardé tel quel, sans réimpression.',
    regLabel: 'Code-barres', regPh: 'Scannez ou tapez le code',
    regHint: 'EAN-13, UPC ou tout code de l’ancien système. Il est rattaché à cette couleur et cette taille.',
    regSave: 'Enregistrer le code', regSaveAnyway: 'Enregistrer tel quel', regEmpty: 'Scannez ou saisissez un code.',
    regShort: 'Code trop court : 4 caractères au moins. Lecture partielle ? Scannez à nouveau.',
    regLong: 'Code trop long : 48 caractères au plus.', regUnreadable: 'Lecture illisible. Scannez à nouveau.',
    regFail: 'Enregistrement impossible.',
    regCheck: 'Le chiffre de contrôle de ce code {sym} ne correspond pas. Vérifiez la saisie, ou enregistrez-le tel quel.',
    regDup: 'Ce code est déjà rattaché à {product} ({variant}).',
    regDone: 'Code enregistré', regAlready: 'Code déjà rattaché',
    regDescTill: '{code} est rattaché à la variante et se scanne en caisse.', regDescInv: '{code} est rattaché à la variante.',
    addTitle: 'Ajouter une variante', addDesc: 'Chaque variante est un article distinct, avec son stock et son code-barres.',
    color: 'Couleur', colorErr: 'Choisissez une couleur.', colorNone: 'Couleur à choisir',
    note: 'Précision', notePh: 'Ex. rayé, délavé, motif', optional: 'facultatif',
    noteHint: 'Seulement si deux variantes de même couleur doivent rester reconnaissables.',
    sizeCloth: 'Taille', sizeShoe: 'Pointure', sizeFormat: 'Format', sizePh: 'Ou tapez une autre valeur',
    sizeHint: 'Laissée vide, la variante est en taille unique (TU).', sizeTu: 'taille unique',
    stockAndCode: 'Stock et code-barres', stockInit: 'Stock initial', stockInitHint: 'Les pièces déjà en rayon pour cette variante.',
    bcTitle: 'Code-barres', bcGen: 'Générer un EAN-13', bcGenSub: 'Kiwi crée le code, vous imprimez l’étiquette.',
    bcLater: 'Plus tard', bcLaterSub: 'Ou enregistrez le code déjà sur l’article, depuis la fiche.',
    dup: '{v} existe déjà sur ce produit, avec {n}. Changez son stock dans la liste.',
    addOk: 'Ajouter la variante', addDone: 'Variante ajoutée', addCode: 'EAN-13 généré', addFail: 'Ajout impossible',
    colorTitle: 'Modifier la couleur', colorFor: 'Variante en taille {size}.', colorPick: 'Choisissez une couleur',
    colorPickSubTill: 'Les couleurs standard restent faciles à retrouver en caisse.',
    colorPickSubInv: 'Les couleurs standard restent faciles à retrouver dans l’inventaire.',
    colorName: 'Nom de cette couleur', colorNamePh: 'Ex. Bleu clair',
    colorNameHint: 'Le même nom sera repris pour toutes les tailles de cette couleur exacte.',
    colorDetail: 'Détail de la variante', colorDetailPh: 'Ex. rayé, délavé, motif',
    colorDetailHint: 'Ajoutez-le uniquement pour distinguer deux articles de couleur similaire.',
    colorSafe: 'Le stock, la taille et les codes-barres ne seront pas modifiés.',
    colorSave: 'Enregistrer les modifications', colorDone: 'Couleur mise à jour', colorNoSel: 'Aucune couleur',
    colorRenamed: (n) => `Nom appliqué à ${n} variantes.`, optionalCap: 'Facultatif',
    delProdTitle: 'Supprimer ce produit ?',
    delProdDesc: 'Supprimer « {name} » efface aussi {n} et leurs codes-barres, définitivement.',
    delProdDesc0: 'Supprimer « {name} » est définitif.',
    delProdTill: 'Le produit disparaît de la caisse et du tableau de bord.', delProdInv: 'Le produit disparaît du tableau de bord.',
    delProdCodes: 'Ses codes-barres sont libérés.', delProdOk: 'Supprimer définitivement', delProdDone: 'Produit supprimé',
  },
  en: {
    close: 'Close', edit: 'Edit product', delete: 'Delete', cancel: 'Cancel',
    notFound: 'Product not found.', noCat: 'No category', cur: 'MAD', inStock: '{n} in stock',
    tPrice: 'Selling price', costGap: 'Cost {cost} MAD · gap {gap} MAD', costOver: 'Cost {cost} MAD, above the price',
    costNone: 'Purchase cost not entered',
    tStock: 'In stock', noVariant: 'No variants',
    tValue: 'Stock value', valueSale: 'At selling price', valueCost: 'At selling price · {v} MAD at cost',
    tCodes: 'Barcodes', codesOf: '{a} of {b}', codesAll: 'Every variant has its code',
    pieces: (n) => `${n} ${n === 1 ? 'piece' : 'pieces'}`,
    variants: (n) => `${n} ${n === 1 ? 'variant' : 'variants'}`,
    outN: (n) => `${n} sold out`,
    codesMissing: (n) => (n === 1 ? '1 variant without a code' : `${n} variants without a code`),
    variantsTitle: 'Variants', addVariant: 'Add a variant',
    empty: 'No variants yet. Add the first one: a colour, a size and its stock.',
    genMissing: (n) => (n === 1 ? 'Generate the missing code' : `Generate the ${n} missing codes`),
    printAll: (n) => (n === 1 ? 'Print the label' : `Print the ${n} labels`),
    printNone: 'No labels to print',
    out: 'Sold out', bcGenerated: 'Generated', bcImported: 'Imported', bcNone: 'No barcode',
    actLabel: 'Label', actGen: 'Generate a code', actReg: 'Existing code', actDel: 'Delete the variant',
    actDelOf: 'Delete the variant {v}', actColor: 'Change the colour',
    stockOf: 'Stock of {v}', minus: 'Remove one piece', plus: 'Add one piece', less: 'Fewer', more: 'More',
    stockEmpty: 'Enter a number of pieces, 0 if none.', stockBad: 'A whole number of pieces, 0 or more.',
    irreversible: 'This cannot be undone',
    delVarTitle: 'Delete this variant?',
    delStock: (n) => (n === 1 ? '1 piece leaves the inventory.' : `${n} pieces leave the inventory.`),
    delNoStock: 'It has no pieces in stock.', delCodes: 'Its barcodes are released: {codes}.',
    delTill: 'The till will no longer offer it.', delVarOk: 'Delete the variant', delVarDone: 'Variant deleted',
    genDone: 'EAN-13 generated', genDesc: 'Code {code} · print the label for the item.', genFail: 'No code generated',
    genAllDone: (n) => (n === 1 ? '1 EAN-13 code generated' : `${n} EAN-13 codes generated`),
    noCode: 'No code to print', noCodeVar: 'Generate an EAN-13 for this variant first.',
    noCodeProd: 'Generate at least one EAN-13 for this product.',
    withCode: (n) => (n === 1 ? '1 variant with a barcode' : `${n} variants with a barcode`),
    printTitle: 'Print labels', printTag: 'LABELS',
    printDesc: 'Choose the number of copies, then start printing.',
    copies: 'Copies per variant', copiesOne: 'Number of labels', copiesBad: 'Between 1 and 99 copies.',
    totalLabels: (n) => (n === 1 ? '1 label in total' : `${n} labels in total`),
    printHint: 'The print preview opens: send it to the label printer.', print: 'Print',
    regTitle: 'Register an existing code',
    regDesc: 'Scan or type the code already on the item. It is kept as it is, with no reprint.',
    regLabel: 'Barcode', regPh: 'Scan or type the code',
    regHint: 'EAN-13, UPC or any code from the old system. It is attached to this colour and this size.',
    regSave: 'Register the code', regSaveAnyway: 'Register as it is', regEmpty: 'Scan or type a code.',
    regShort: 'Code too short: at least 4 characters. A partial read? Scan again.',
    regLong: 'Code too long: 48 characters at most.', regUnreadable: 'Unreadable scan. Scan again.',
    regFail: 'The code could not be registered.',
    regCheck: 'The check digit of this {sym} code does not match. Check what you typed, or register it as it is.',
    regDup: 'This code is already attached to {product} ({variant}).',
    regDone: 'Code registered', regAlready: 'Code already attached',
    regDescTill: '{code} is attached to the variant and scans at the till.', regDescInv: '{code} is attached to the variant.',
    addTitle: 'Add a variant', addDesc: 'Each variant is a separate item, with its own stock and barcode.',
    color: 'Colour', colorErr: 'Choose a colour.', colorNone: 'Colour to choose',
    note: 'Detail', notePh: 'E.g. striped, washed, print', optional: 'optional',
    noteHint: 'Only if two variants of the same colour must stay distinguishable.',
    sizeCloth: 'Size', sizeShoe: 'Shoe size', sizeFormat: 'Format', sizePh: 'Or type another value',
    sizeHint: 'Left empty, the variant is one size (TU).', sizeTu: 'one size',
    stockAndCode: 'Stock and barcode', stockInit: 'Opening stock', stockInitHint: 'The pieces already on the shelf for this variant.',
    bcTitle: 'Barcode', bcGen: 'Generate an EAN-13', bcGenSub: 'Kiwi creates the code, you print the label.',
    bcLater: 'Later', bcLaterSub: 'Or register the code already on the item, from the product sheet.',
    dup: '{v} already exists on this product, with {n}. Change its stock in the list.',
    addOk: 'Add the variant', addDone: 'Variant added', addCode: 'EAN-13 generated', addFail: 'The variant could not be added',
    colorTitle: 'Edit the colour', colorFor: 'Variant in size {size}.', colorPick: 'Choose a colour',
    colorPickSubTill: 'Standard colours stay easy to find at the till.',
    colorPickSubInv: 'Standard colours stay easy to find in the inventory.',
    colorName: 'Name of this colour', colorNamePh: 'E.g. Light blue',
    colorNameHint: 'The same name is used for every size of this exact colour.',
    colorDetail: 'Variant detail', colorDetailPh: 'E.g. striped, washed, print',
    colorDetailHint: 'Add it only to tell apart two items of a similar colour.',
    colorSafe: 'Stock, size and barcodes will not change.',
    colorSave: 'Save changes', colorDone: 'Colour updated', colorNoSel: 'No colour',
    colorRenamed: (n) => `Name applied to ${n} variants.`, optionalCap: 'Optional',
    delProdTitle: 'Delete this product?',
    delProdDesc: 'Deleting “{name}” also erases {n} and their barcodes, for good.',
    delProdDesc0: 'Deleting “{name}” is final.',
    delProdTill: 'The product disappears from the till and the dashboard.', delProdInv: 'The product disappears from the dashboard.',
    delProdCodes: 'Its barcodes are released.', delProdOk: 'Delete for good', delProdDone: 'Product deleted',
  },
  ar: {
    close: 'إغلاق', edit: 'تعديل المنتج', delete: 'حذف', cancel: 'إلغاء',
    notFound: 'المنتج غير موجود.', noCat: 'بدون فئة', cur: 'درهم', inStock: '{n} في المخزون',
    tPrice: 'سعر البيع', costGap: 'التكلفة {cost} درهم · الفرق {gap} درهم', costOver: 'التكلفة {cost} درهم، أعلى من السعر',
    costNone: 'تكلفة الشراء غير مُدخلة',
    tStock: 'في المخزون', noVariant: 'لا متغيّرات',
    tValue: 'قيمة المخزون', valueSale: 'بسعر البيع', valueCost: 'بسعر البيع · {v} درهم بالتكلفة',
    tCodes: 'الرموز الشريطية', codesOf: '{a} من {b}', codesAll: 'لكل متغيّر رمزه',
    pieces: (n) => _arPieces(n),
    variants: (n) => _arVariants(n),
    outN: (n) => `نفد منها: ${n}`,
    codesMissing: (n) => `بدون رمز: ${n}`,
    variantsTitle: 'المتغيّرات', addVariant: 'إضافة متغيّر',
    empty: 'لا متغيّرات بعد. أضف الأول: لوناً ومقاساً ومخزونه.',
    genMissing: (n) => (n === 1 ? 'توليد الرمز الناقص' : `توليد الرموز الناقصة (${n})`),
    printAll: (n) => (n === 1 ? 'طباعة الملصق' : `طباعة الملصقات (${n})`),
    printNone: 'لا ملصقات للطباعة',
    out: 'نفد', bcGenerated: 'مولَّد', bcImported: 'مستورد', bcNone: 'بدون رمز شريطي',
    actLabel: 'ملصق', actGen: 'توليد رمز', actReg: 'رمز موجود', actDel: 'حذف المتغيّر',
    actDelOf: 'حذف المتغيّر {v}', actColor: 'تغيير اللون',
    stockOf: 'مخزون {v}', minus: 'إنقاص قطعة', plus: 'إضافة قطعة', less: 'أقل', more: 'أكثر',
    stockEmpty: 'أدخل عدد القطع، 0 إن لم توجد.', stockBad: 'عدد صحيح من القطع، 0 أو أكثر.',
    irreversible: 'إجراء لا رجعة فيه',
    delVarTitle: 'حذف هذا المتغيّر؟',
    delStock: (n) => `المخزون المحذوف: ${_arPieces(n)}.`,
    delNoStock: 'لا قطع له في المخزون.', delCodes: 'تُحرَّر رموزه الشريطية: {codes}.',
    delTill: 'لن يعرضه الصندوق بعد الآن.', delVarOk: 'حذف المتغيّر', delVarDone: 'تم حذف المتغيّر',
    genDone: 'تم توليد EAN-13', genDesc: 'الرمز {code} · اطبع ملصق السلعة.', genFail: 'لم يُولَّد أي رمز',
    genAllDone: (n) => (n === 1 ? 'تم توليد رمز EAN-13' : `رموز EAN-13 مولَّدة: ${n}`),
    noCode: 'لا رمز للطباعة', noCodeVar: 'ولّد أولاً رمز EAN-13 لهذا المتغيّر.',
    noCodeProd: 'ولّد رمز EAN-13 واحداً على الأقل لهذا المنتج.',
    withCode: (n) => `متغيّرات برمز شريطي: ${n}`,
    printTitle: 'طباعة الملصقات', printTag: 'الملصقات',
    printDesc: 'اختر عدد النسخ، ثم ابدأ الطباعة.',
    copies: 'النسخ لكل متغيّر', copiesOne: 'عدد الملصقات', copiesBad: 'من 1 إلى 99 نسخة.',
    totalLabels: (n) => `مجموع الملصقات: ${n}`,
    printHint: 'تُفتح معاينة الطباعة: أرسلها إلى طابعة الملصقات.', print: 'طباعة',
    regTitle: 'تسجيل رمز موجود',
    regDesc: 'امسح أو أدخل الرمز الموجود على السلعة. يُحفظ كما هو، دون إعادة طباعة.',
    regLabel: 'الرمز الشريطي', regPh: 'امسح الرمز أو اكتبه',
    regHint: 'EAN-13 أو UPC أو أي رمز من النظام القديم. يُربط بهذا اللون وهذا المقاس.',
    regSave: 'تسجيل الرمز', regSaveAnyway: 'التسجيل كما هو', regEmpty: 'امسح رمزاً أو أدخله.',
    regShort: 'الرمز قصير جداً: 4 أحرف على الأقل. قراءة ناقصة؟ أعد المسح.',
    regLong: 'الرمز طويل جداً: 48 حرفاً على الأكثر.', regUnreadable: 'قراءة غير واضحة. أعد المسح.',
    regFail: 'تعذّر تسجيل الرمز.',
    regCheck: 'رقم التحقق في رمز {sym} هذا لا يطابق. تحقّق من الإدخال، أو سجّله كما هو.',
    regDup: 'هذا الرمز مربوط أصلاً بـ {product} ({variant}).',
    regDone: 'تم تسجيل الرمز', regAlready: 'الرمز مربوط أصلاً',
    regDescTill: '{code} مربوط بالمتغيّر ويُمسح في الصندوق.', regDescInv: '{code} مربوط بالمتغيّر.',
    addTitle: 'إضافة متغيّر', addDesc: 'كل متغيّر سلعة مستقلة، بمخزونها ورمزها الشريطي.',
    color: 'اللون', colorErr: 'اختر لوناً.', colorNone: 'لون لم يُختر بعد',
    note: 'توضيح', notePh: 'مثال: مخطّط، باهت، بنقشة', optional: 'اختياري',
    noteHint: 'فقط إذا وجب تمييز متغيّرين من اللون نفسه.',
    sizeCloth: 'المقاس', sizeShoe: 'مقاس الحذاء', sizeFormat: 'الحجم', sizePh: 'أو اكتب قيمة أخرى',
    sizeHint: 'إن تُرك فارغاً، يكون المتغيّر بمقاس واحد (TU).', sizeTu: 'مقاس واحد',
    stockAndCode: 'المخزون والرمز الشريطي', stockInit: 'المخزون الأولي', stockInitHint: 'القطع الموجودة أصلاً على الرف لهذا المتغيّر.',
    bcTitle: 'الرمز الشريطي', bcGen: 'توليد EAN-13', bcGenSub: 'يُنشئ Kiwi الرمز، وتطبع أنت الملصق.',
    bcLater: 'لاحقاً', bcLaterSub: 'أو سجّل الرمز الموجود على السلعة، من بطاقة المنتج.',
    dup: '{v} موجود أصلاً في هذا المنتج، ومخزونه {n}. غيّر مخزونه من القائمة.',
    addOk: 'إضافة المتغيّر', addDone: 'تمت إضافة المتغيّر', addCode: 'تم توليد EAN-13', addFail: 'تعذّرت إضافة المتغيّر',
    colorTitle: 'تعديل اللون', colorFor: 'متغيّر بالمقاس {size}.', colorPick: 'اختر لوناً',
    colorPickSubTill: 'الألوان المعيارية يسهل إيجادها في الصندوق.',
    colorPickSubInv: 'الألوان المعيارية يسهل إيجادها في المخزون.',
    colorName: 'اسم هذا اللون', colorNamePh: 'مثال: أزرق فاتح',
    colorNameHint: 'يُعتمد الاسم نفسه لكل مقاسات هذا اللون بالضبط.',
    colorDetail: 'تفصيل المتغيّر', colorDetailPh: 'مثال: مخطّط، باهت، بنقشة',
    colorDetailHint: 'أضفه فقط لتمييز سلعتين بلون متقارب.',
    colorSafe: 'لن يتغيّر المخزون ولا المقاس ولا الرموز الشريطية.',
    colorSave: 'حفظ التعديلات', colorDone: 'تم تحديث اللون', colorNoSel: 'بدون لون',
    colorRenamed: (n) => `طُبّق الاسم على ${_arVariants(n)}.`, optionalCap: 'اختياري',
    delProdTitle: 'حذف هذا المنتج؟',
    delProdDesc: 'حذف «{name}» يمحو أيضاً {n} ورموزها الشريطية نهائياً.',
    delProdDesc0: 'حذف «{name}» نهائي.',
    delProdTill: 'يختفي المنتج من الصندوق ومن لوحة التحكم.', delProdInv: 'يختفي المنتج من لوحة التحكم.',
    delProdCodes: 'تُحرَّر رموزه الشريطية.', delProdOk: 'حذف نهائي', delProdDone: 'تم حذف المنتج',
  },
};
function _bqxShT() { return _BQX_SH[_bqxPfLang()]; }
function _bqxIc(name, px) { return window.KiwiIcon ? window.KiwiIcon.svg(name, px || 18) : ''; }
/* A count of pieces, as typed: whole, zero or more, Arabic-Indic digits read.
   « 2,5 » and an empty box are refused, never read as 0: clearing the stock
   field of a variant used to set it to 0 and write that to the ledger. */
function _bqxPieces(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(/[^\x00-\x7F]/g, (d) => {
    const c = d.charCodeAt(0);
    if (c >= 0x660 && c <= 0x669) return String(c - 0x660);
    if (c >= 0x6F0 && c <= 0x6F9) return String(c - 0x6F0);
    return d;
  });
  if (!s) return { empty: true };
  if (!/^\d{1,6}$/.test(s)) return { bad: true };
  return { n: parseInt(s, 10) };
}
function _bqxVarLabel(v) { return [_bqxShownColor(v).label, v && v.size].filter(Boolean).join(' · '); }
/* Le même, pour l'écran ; _bqxVarLabel reste celui qu'on imprime. */
function _bqxVarName(v) { return [_bqxColorName(_bqxShownColor(v)), v && v.size].filter(Boolean).join(' · '); }
/* The variant behind an id: the open sheet first, then the whole catalogue. */
function _bqxVarById(vid) {
  const cat = CAT();
  const look = (pid) => (cat.listVariants(pid) || []).find((x) => x.id === vid);
  if (_bqxDrawerPid) { const v = look(_bqxDrawerPid); if (v) return { v, pid: _bqxDrawerPid }; }
  for (const p of cat.listProducts({ includeArchived: true })) { const v = look(p.id); if (v) return { v, pid: p.id }; }
  return null;
}
function _bqxShCss() {
  if (document.getElementById('bqx-sh-css')) return;
  const st = document.createElement('style');
  st.id = 'bqx-sh-css';
  st.textContent = `
    .bqx-sheet { --sh-card: color-mix(in srgb, var(--paper) 55%, #fff); --sh-field: var(--paper); container-type: inline-size; color: var(--ink); }
    html[data-theme="dark"] .bqx-sheet, body[data-vexel-mode="dark"] .bqx-sheet { --sh-card: #151C18; --sh-field: #0B100E; }
    .bqx-sh-sum { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--n-200); border-radius: 14px; background: var(--sh-card); overflow: hidden; }
    .bqx-sh-c { display: grid; align-content: start; gap: 3px; min-width: 0; padding: 12px 14px; }
    .bqx-sh-c + .bqx-sh-c { border-inline-start: 1px solid var(--n-200); }
    .bqx-sh-l { font-size: 12px; font-weight: 600; color: var(--n-600); }
    .bqx-sh-v { font: 600 17px/1.25 var(--sans); letter-spacing: -0.01em; color: var(--ink); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .bqx-sh-v small { font-size: 11px; font-weight: 500; letter-spacing: 0; color: var(--n-500); }
    .bqx-sh-s { font-size: 11.5px; line-height: 1.4; color: var(--n-500); }
    .bqx-sh-s.is-neg { color: var(--danger, #cb5238); font-weight: 600; }
    .bqx-sh-sec { margin-top: 18px; padding: 0; }
    .bqx-sh-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
    .bqx-sh-head h4 { display: flex; align-items: center; gap: 8px; margin: 0; font: 600 15px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
    .bqx-sh-head h4 span { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 11px; background: color-mix(in srgb, var(--ink) 7%, transparent); font-size: 12px; font-weight: 600; color: var(--n-600); font-variant-numeric: tabular-nums; }
    .bqx-sh-head .kb { display: inline-flex; align-items: center; gap: 6px; }
    .bqx-vlist { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .bqx-vr { border: 1px solid var(--n-200); border-radius: 14px; background: var(--sh-card); }
    .bqx-vr-main { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; padding: 10px 12px; }
    .bqx-vr-main .bqx-ccell { flex: 1 1 96px; min-width: 0; }
    .bqx-vr-main .bqx-cbtn { max-width: 100%; }
    .bqx-vr-main .bqx-cbtn span { overflow: hidden; text-overflow: ellipsis; }
    .bqx-vr-main .bqx-csrc { margin-left: 0; margin-inline-start: 24px; }
    .bqx-vr-size { display: inline-grid; place-items: center; min-width: 34px; height: 28px; padding: 0 9px; box-sizing: border-box; border: 1px solid var(--n-200); border-radius: 8px; background: var(--sh-field); font: 600 12.5px var(--sans); color: var(--ink); }
    .bqx-vr-out { padding: 3px 9px; border-radius: 999px; background: rgba(217,154,43,.16); color: #8A6210; font-size: 11.5px; font-weight: 600; }
    html[data-theme="dark"] .bqx-vr-out, body[data-vexel-mode="dark"] .bqx-vr-out { color: #E2B55C; }
    .bqx-vr .bqx-stk { display: inline-flex; align-items: center; gap: 4px; margin-inline-start: auto; }
    .bqx-vr .bqx-stk button { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--n-200); border-radius: 10px; background: var(--sh-field); color: var(--ink); cursor: pointer; }
    .bqx-vr .bqx-stk button:hover:not(:disabled) { border-color: var(--atlas); color: var(--atlas); }
    .bqx-vr .bqx-stk button:disabled { opacity: .38; cursor: not-allowed; }
    .bqx-vr .bqx-stk input { box-sizing: border-box; width: 54px; height: 34px; padding: 0 4px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--sh-field); color: var(--ink); text-align: center; font: 600 14px var(--sans); font-variant-numeric: tabular-nums; }
    .bqx-vr .bqx-stk input:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }
    .bqx-vr .bqx-stk input[aria-invalid="true"] { border-color: var(--danger, #cb5238); }
    .bqx-vr-sub { display: flex; align-items: center; justify-content: space-between; gap: 8px 12px; flex-wrap: wrap; padding: 8px 12px 10px; border-top: 1px solid var(--n-200); }
    .bqx-vr-bc { display: inline-flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .bqx-vr-bc svg { display: block; flex: none; }
    /* Les barres sont encre sur transparent : sur une carte sombre elles
       disparaissaient. En sombre, le code repose sur du papier, comme l'étiquette. */
    html[data-theme="dark"] .bqx-vr-bc svg, body[data-vexel-mode="dark"] .bqx-vr-bc svg { background: #F7F5F0; padding: 3px 6px; border-radius: 4px; box-sizing: content-box; }
    .bqx-vr .bqx-badge { text-transform: none; letter-spacing: 0; }
    .bqx-vr .bqx-vact { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; margin-inline-start: auto; }
    .bqx-vr-act { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; border: 1px solid var(--n-200); border-radius: 9px; background: var(--sh-field); color: var(--n-700); font: 500 12.5px var(--sans); white-space: nowrap; cursor: pointer; transition: border-color 140ms, color 140ms; }
    .bqx-vr-act svg { flex: none; width: 17px; height: 17px; }
    .bqx-vr-act:hover:not(:disabled) { border-color: var(--atlas); color: var(--atlas); }
    .bqx-vr-act:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .bqx-vr-act.is-del { justify-content: center; width: 32px; padding: 0; }
    .bqx-vr-act.is-del:hover { border-color: var(--danger, #cb5238); color: var(--danger, #cb5238); }
    .bqx-vr-act:disabled { opacity: .5; cursor: not-allowed; }
    .bqx-vr-err { padding: 0 12px 10px; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--danger, #cb5238); }
    .bqx-vr-err[hidden] { display: none; }
    .bqx-vempty { padding: 18px; border: 1px dashed var(--n-200); border-radius: 14px; text-align: center; font-size: 13px; line-height: 1.5; color: var(--n-500); }
    .bqx-sh-foot { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    @container (max-width: 520px) {
      .bqx-sh-sum { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .bqx-sh-c:nth-child(3) { border-inline-start: 0; }
      .bqx-sh-c:nth-child(n+3) { border-top: 1px solid var(--n-200); }
      .bqx-vr-act span { font-size: 12px; }
    }
    .bqx-pf.is-one { grid-template-columns: minmax(0, 1fr); }
    .bqx-sh-step { display: inline-grid; grid-template-columns: 40px 76px 40px; gap: 6px; align-items: center; }
    .bqx-sh-step button { display: grid; place-items: center; width: 40px; height: 40px; padding: 0; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--ink); cursor: pointer; }
    .bqx-sh-step button:hover { border-color: var(--atlas); color: var(--atlas); }
    .bqx-sh-step .bqx-pf-in { padding: 0 6px; text-align: center; font-variant-numeric: tabular-nums; }
    .bqx-sh-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .bqx-sh-chip { min-width: 42px; height: 34px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 999px; background: var(--pf-field); color: var(--ink); font: 600 12.5px var(--sans); cursor: pointer; transition: border-color 140ms, color 140ms; }
    .bqx-sh-chip:hover { border-color: color-mix(in srgb, var(--atlas) 50%, var(--n-200)); }
    .bqx-sh-chip.on { border-color: var(--atlas); box-shadow: inset 0 0 0 1px var(--atlas); color: var(--atlas); }
    .bqx-sh-chip:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .bqx-sh-picker[data-invalid] { border-radius: 12px; outline: 1px solid var(--danger, #cb5238); outline-offset: 4px; }
    .bqx-sh-preview { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--atlas) 24%, var(--n-200)); border-radius: 12px; background: color-mix(in srgb, var(--atlas) 7%, var(--pf-card)); font-size: 13px; line-height: 1.45; color: var(--ink); }
    .bqx-sh-preview small { font-size: 12px; color: var(--n-500); }
    .bqx-sh-preview.is-dup { border-color: color-mix(in srgb, var(--danger, #cb5238) 32%, var(--n-200)); background: color-mix(in srgb, var(--danger, #cb5238) 7%, var(--pf-card)); color: var(--danger, #cb5238); font-weight: 600; }
    .bqx-sh-preview:empty { display: none; }
    .bqx-sh-mono { font-family: var(--mono, ui-monospace, monospace); letter-spacing: .02em; }
    .bqx-pf-err.is-warn { color: #8A6210; }
    html[data-theme="dark"] .bqx-pf-err.is-warn, body[data-vexel-mode="dark"] .bqx-pf-err.is-warn { color: #E2B55C; }
    @media (max-width: 560px) { .bqx-sh-step .bqx-pf-in { font-size: 16px; } }
  `;
  document.head.appendChild(st);
}
function _variantRow(v, kind) {
  const t = _bqxShT();
  const primary = (v.barcodes || []).find((b) => b.primary) || (v.barcodes || [])[0];
  const stock = Math.max(0, +v.stock || 0);
  const shown = _bqxShownColor(v);
  const note = _bqxVarNote(v);
  const kc = window.KiwiColors;
  const label = _bqxVarName(v);
  const id = _esc(v.id);
  const code = primary
    ? `<span class="bqx-vr-bc">${BC().svg(primary.code, { height: 22, module: 1, showText: false })}<span class="bqx-bc-code">${_esc(primary.code)}</span><span class="bqx-badge ${primary.type === 'imported' ? 'imp' : 'gen'}">${_esc(primary.type === 'imported' ? t.bcImported : t.bcGenerated)}</span></span>`
    : `<span class="bqx-nocode">${_esc(t.bcNone)}</span>`;
  const first = primary
    ? `<button data-activation=write type="button" class="bqx-vr-act" data-action="bqx-var-print" data-arg="${id}">${_bqxIc('print')}<span>${_esc(t.actLabel)}</span></button>`
    : `<button type="button" class="bqx-vr-act" data-action="bqx-var-gen" data-arg="${id}">${_bqxIc('add')}<span>${_esc(t.actGen)}</span></button>`;
  const of = _esc(_bqxPfFill(t.stockOf, { v: label }));
  return `<li class="bqx-vr${stock ? '' : ' is-out'}" data-vid="${id}">
    <div class="bqx-vr-main">
      <div class="bqx-ccell">
        <button type="button" class="bqx-cbtn" data-action="bqx-var-color" data-arg="${id}" title="${_esc(t.actColor)}">${kc ? kc.swatch(shown) : ''}<span>${_esc(_bqxColorName(shown))}</span></button>
        ${note ? `<em class="bqx-csrc">${_esc(note)}</em>` : ''}
      </div>
      <span class="bqx-vr-size">${_esc(v.size)}</span>
      ${stock ? '' : `<span class="bqx-vr-out">${_esc(t.out)}</span>`}
      <span class="bqx-stk" role="group" aria-label="${of}">
        <button type="button" data-action="bqx-var-dec" data-arg="${id}" aria-label="${_esc(t.minus)}"${stock ? '' : ' disabled'}>${_bqxIc('remove', 16)}</button>
        <input type="text" inputmode="numeric" autocomplete="off" value="${stock}" data-var-stock="${id}" aria-label="${of}" />
        <button type="button" data-action="bqx-var-inc" data-arg="${id}" aria-label="${_esc(t.plus)}">${_bqxIc('add', 16)}</button>
      </span>
    </div>
    <div class="bqx-vr-sub">
      ${code}
      <div class="bqx-vact">
        ${first}
        <button type="button" class="bqx-vr-act" data-action="bqx-var-reg" data-arg="${id}">${_bqxIc('barcode_scanner')}<span>${_esc(t.actReg)}</span></button>
        <button type="button" class="bqx-vr-act is-del" data-action="bqx-var-del" data-arg="${id}" aria-label="${_esc(_bqxPfFill(t.actDelOf, { v: label }))}" title="${_esc(t.actDel)}">${_bqxIc('trash-2')}</button>
      </div>
    </div>
    <div class="bqx-vr-err" data-var-err="${id}" role="alert" hidden></div>
  </li>`;
}

/* L'HISTORIQUE DE LA FICHE PRODUIT.
 * « Il en manque trois » se règle ici, sur la fiche elle-même : les vingt
 * derniers mouvements de ce produit, tous types confondus, avec qui et quand.
 * Absent pour un métier qui n'écrit pas ce registre — la fiche reste alors
 * exactement ce qu'elle était. */
function _bqxHistoryHtml(pid) {
  const M = window.KiwiMaisonStock;
  if (!M || !M.isMaison()) return '';
  _mzCss();
  const rows = M.productHistory(pid, 20);
  if (!rows.length) {
    return `<div class="mzs-hist"><h4>Historique du stock</h4><div class="mzs-sub">Aucun mouvement enregistré pour ce produit.</div></div>`;
  }
  return `
    <div class="mzs-hist">
      <h4>Historique du stock</h4>
      <div class="mzs-wrap" style="max-height:280px;margin-top:0;">${_mzTableHtml(rows, { hideProduct: true })}</div>
      <div style="margin-top:8px;"><button class="kb ghost xs" data-action="bqx-prod-movements" data-arg="${pid}">Voir tous les mouvements</button></div>
    </div>`;
}

/* #0170 · What the owner asks of a product before touching its stock: what it
 * sells for and what it cost, how many pieces, what the shelf is worth, and
 * how many variants still have no code. Only figures the catalogue holds; a
 * missing purchase price says so. One summary, where there were two blocks
 * that repeated each other and named the same missing category twice
 * (« Sans catégorie » in the title, « Divers » in the stat). */
function _bqxSummaryHtml(p, data) {
  const t = _bqxShT();
  const price = +p.priceMAD || 0;
  const cost = +p.cost > 0 ? +p.cost : null;
  const pieces = Math.max(0, +data.stock || 0);
  const n = data.variants.length;
  const out = data.variants.filter((v) => !(+v.stock > 0)).length;
  const coded = data.variants.filter((v) => (v.barcodes || []).length).length;
  const cell = (l, v, s, neg) => `<div class="bqx-sh-c"><span class="bqx-sh-l">${_esc(l)}</span><b class="bqx-sh-v">${v}</b><span class="bqx-sh-s${neg ? ' is-neg' : ''}">${_esc(s)}</span></div>`;
  const money = (x) => `${_bqxPrice(x)} <small>${_esc(t.cur)}</small>`;
  const priceSub = cost == null ? t.costNone
    : price - cost >= 0 ? _bqxPfFill(t.costGap, { cost: _bqxPrice(cost), gap: _bqxPrice(price - cost) })
      : _bqxPfFill(t.costOver, { cost: _bqxPrice(cost) });
  return `<div class="bqx-sh-sum">
    ${cell(t.tPrice, money(price), priceSub, cost != null && cost > price)}
    ${cell(t.tStock, _esc(t.pieces(pieces)), n ? (out ? `${t.variants(n)} · ${t.outN(out)}` : t.variants(n)) : t.noVariant)}
    ${cell(t.tValue, money(price * pieces), cost == null ? t.valueSale : _bqxPfFill(t.valueCost, { v: _bqxPrice(cost * pieces) }))}
    ${cell(t.tCodes, _esc(_bqxPfFill(t.codesOf, { a: coded, b: n })), !n ? t.noVariant : coded < n ? t.codesMissing(n - coded) : t.codesAll)}
  </div>`;
}

function _bqxProductBody(pid) {
  const t = _bqxShT();
  const data = CAT().getProduct(pid);
  if (!data) return `<p>${_esc(t.notFound)}</p>`;
  _bqxShCss();
  const p = data.product;
  const n = data.variants.length;
  const missing = data.variants.filter((v) => !(v.barcodes || []).length).length;
  const coded = n - missing;
  const list = n
    ? `<ul class="bqx-vlist">${data.variants.map((v) => _variantRow(v, p.kind)).join('')}</ul>`
    : `<div class="bqx-vempty">${_esc(t.empty)}</div>`;
  return `<div class="bqx-sheet">
    ${_bqxSummaryHtml(p, data)}
    <div class="bqx-sh-sec">
      <div class="bqx-sh-head">
        <h4>${_esc(t.variantsTitle)} <span>${n}</span></h4>
        <button data-activation=write type="button" class="kb atlas" data-action="bqx-var-add" data-arg="${_esc(pid)}">${_bqxIc('add')}${_esc(t.addVariant)}</button>
      </div>
      ${list}
      ${n ? `<div class="bqx-sh-foot">
        ${missing ? `<button type="button" class="bqx-vr-act" data-action="bqx-var-gen-all" data-arg="${_esc(pid)}">${_bqxIc('add')}<span>${_esc(t.genMissing(missing))}</span></button>` : ''}
        <button data-activation=write type="button" class="bqx-vr-act" data-action="bqx-prod-print" data-arg="${_esc(pid)}"${coded ? '' : ' disabled'}>${_bqxIc('print')}<span>${_esc(coded ? t.printAll(coded) : t.printNone)}</span></button>
      </div>` : ''}
    </div>
    ${_bqxHistoryHtml(pid)}
  </div>`;
}

function _bqxSheetSub(data) {
  const t = _bqxShT();
  return `${data.category ? data.category.name : t.noCat} · ${_bqxPrice(data.product.priceMAD)} ${t.cur} · ${_bqxPfFill(t.inStock, { n: data.stock })}`;
}

function _bqxOpenProduct(pid) {
  const t = _bqxShT();
  const data = CAT().getProduct(pid);
  if (!data) { toast(t.notFound, { type: 'warn' }); return; }
  _bqxCss();
  _bqxShCss();
  _bqxDrawerPid = pid;
  const p = data.product;
  drawer({
    title: p.name,
    subtitle: _bqxSheetSub(data),
    width: 640,
    body: _bqxProductBody(pid),
    foot: `
      <button class="kb ghost" data-dismiss>${_esc(t.close)}</button>
      <button class="kb ghost danger-text" data-action="bqx-prod-del" data-arg="${_esc(pid)}">${_bqxIc('trash-2')}${_esc(t.delete)}</button>
      <button data-activation=write class="kb atlas" data-action="bqx-prod-edit" data-arg="${_esc(pid)}">${_bqxIc('edit')}${_esc(t.edit)}</button>`,
  });
  _bqxMountDrawer(pid);
  /* re-render the grid behind once the drawer is dismissed */
  const bd = document.querySelector('.kiwi-drawer-backdrop');
  if (bd && window.MutationObserver) {
    const mo = new MutationObserver(() => {
      if (!document.body.contains(bd)) {
        mo.disconnect(); _bqxDrawerPid = null;
        const nav = document.querySelector('.sidebar nav a.active');
        if (nav && nav.getAttribute('data-nav') === 'inventory') _renderInventory();
      }
    });
    mo.observe(document.body, { childList: true });
  }
}

/* The stock field states a count. An empty or malformed entry is sent back
   with a word under the row; it used to be read as 0 and saved. */
function _bqxMountDrawer(pid) {
  const root = document.querySelector('.kiwi-drawer-backdrop');
  if (!root) return;
  const t = _bqxShT();
  root.querySelectorAll('[data-var-stock]').forEach((inp) => {
    const id = inp.getAttribute('data-var-stock');
    const err = Array.from(root.querySelectorAll('[data-var-err]')).find((e) => e.getAttribute('data-var-err') === id);
    const was = inp.value;
    const say = (msg) => {
      if (err) { err.textContent = msg || ''; err.hidden = !msg; }
      inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    inp.addEventListener('change', () => {
      const r = _bqxPieces(inp.value);
      if (r.n == null) { inp.value = was; say(r.empty ? t.stockEmpty : t.stockBad); return; }
      say('');
      if (String(r.n) !== was) CAT().setStock(id, r.n, 'saisie');
    });
  });
  if (window.lucide) try { window.lucide.createIcons(); } catch (e) {}
}

function _bqxRefreshDrawer() {
  if (!_bqxDrawerPid) return;
  const back = document.querySelector('.kiwi-drawer-backdrop');
  if (!back) return;
  const body = back.querySelector('.kiwi-drawer-body');
  if (!body) return;
  const data = CAT().getProduct(_bqxDrawerPid);
  if (!data) { return; }
  body.innerHTML = _bqxProductBody(_bqxDrawerPid);
  const sub = back.querySelector('.kiwi-drawer-head p');
  if (sub) sub.textContent = _bqxSheetSub(data);
  _bqxMountDrawer(_bqxDrawerPid);
}

handlers['bqx-open'] = (_el, arg) => { if (arg) _bqxOpenProduct(arg); };

/* ═══════════════════════════════════════════════════════════════════════════
 * MOUVEMENTS DE STOCK · Maison
 *
 * Le stock d'une maison de décoration bouge pour dix raisons différentes, et
 * « il en manque trois » n'est une question répondable que si chaque pièce
 * entrée ou sortie a laissé une ligne. Les lignes viennent du registre durable
 * (assets/maison-stock-movements.js → /api/inventory/movements) : elles
 * survivent au repli du journal de catalogue, portent l'employé, la source, la
 * référence du ticket et l'état du stock avant/après.
 *
 * Cette page ne calcule rien : elle filtre et elle affiche. Le seul geste
 * qu'elle offre est la saisie manuelle — et il passe par le même chemin que la
 * caisse, donc il bouge le stock ET écrit son mouvement, jamais l'un sans
 * l'autre. Rien ici ne s'affiche pour un restaurant ou un hôtel : la page n'est
 * proposée que lorsque le métier est « maison ».
 * ═══════════════════════════════════════════════════════════════════════════ */
const MZS = () => window.KiwiMaisonStock;
let _mzFilter = { type: '', categoryId: '', days: 0, q: '', productId: '' };

function _mzCss() {
  if (document.getElementById('mzs-css')) return;
  const st = document.createElement('style');
  st.id = 'mzs-css';
  st.textContent = `
    .mzs-table { width:100%; border-collapse:collapse; font-size:13px; }
    .mzs-table th { text-align:left; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--n-500,#77807b); padding:8px 10px; background:var(--paper-soft,#f3f1ea); position:sticky; top:0; z-index:1; }
    .mzs-table td { padding:10px; border-top:1px solid var(--line,#eee); vertical-align:middle; }
    .mzs-table tr:hover td { background:rgba(11,110,79,0.035); }
    .mzs-qty { font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
    .mzs-in { color:#0B6E4F; } .mzs-out { color:#9B2F22; }
    .mzs-ba { font-variant-numeric:tabular-nums; color:var(--n-500,#77807b); white-space:nowrap; }
    .mzs-chip { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; border:1px solid var(--line,#e7e3da); white-space:nowrap; }
    .mzs-chip.in { background:rgba(11,110,79,0.08); border-color:rgba(11,110,79,0.25); color:#0B6E4F; }
    .mzs-chip.out { background:rgba(155,47,34,0.07); border-color:rgba(155,47,34,0.22); color:#9B2F22; }
    .mzs-wrap { margin-top:10px; border:1px solid var(--line,#e7e3da); border-radius:12px; overflow:auto; max-height:62vh; }
    .mzs-filters { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:8px; }
    .mzs-filters select, .mzs-filters input { font:inherit; font-size:13px; padding:7px 9px; border:1px solid var(--line,#e7e3da); border-radius:9px; background:var(--paper,#F7F5F0); color:inherit; min-height:38px; }
    .mzs-sub { color:var(--n-500,#77807b); font-size:11px; }
    .mzs-pend { font-size:11px; color:#D99A2B; }
    .mzs-hist { margin-top:14px; }
    .mzs-hist h4 { font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--n-500,#77807b); margin:0 0 6px; }
    @media (max-width: 860px) { .mzs-table td, .mzs-table th { padding:8px 7px; } .mzs-hide-s { display:none; } }
  `;
  document.head.appendChild(st);
}

const _mzDate = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const _mzSource = (s) => (s === 'caisse' ? 'Caisse' : s === 'dashboard' ? 'Tableau de bord' : s === 'import' ? 'Import' : (s || '·'));

function _mzRows() {
  const M = MZS();
  if (!M) return [];
  const f = Object.assign({}, _mzFilter);
  if (f.days) f.from = Date.now() - f.days * 86400000;
  delete f.days;
  return M.list(f);
}

function _mzTableHtml(rows, opts) {
  opts = opts || {};
  if (!rows.length) {
    return `<div style="padding:26px;text-align:center;color:var(--n-500,#99a);">Aucun mouvement sur cette période.</div>`;
  }
  const body = rows.map((m) => `
    <tr>
      <td class="mzs-ba">${_esc(_mzDate(m.at))}${m.pending ? '<div class="mzs-pend">en attente de synchro</div>' : ''}</td>
      ${opts.hideProduct ? '' : `<td><strong>${_esc(m.product || '·')}</strong>${m.variant ? `<div class="mzs-sub">${_esc(m.variant)}</div>` : ''}</td>`}
      ${opts.hideProduct ? `<td>${_esc(m.variant || '·')}</td>` : ''}
      <td><span class="mzs-chip ${m.dir > 0 ? 'in' : 'out'}">${_esc(m.typeLabel)}</span></td>
      <td class="mzs-qty ${m.dir > 0 ? 'mzs-in' : 'mzs-out'}">${m.dir > 0 ? '+' : '−'}${Math.abs(m.qty)}</td>
      <td class="mzs-ba">${m.before == null ? '·' : `${m.before} → ${m.after}`}</td>
      <td class="mzs-hide-s">${_esc(m.actor || '·')}</td>
      <td class="mzs-hide-s mzs-sub">${_esc(_mzSource(m.source))}${m.supplier ? ` · ${_esc(m.supplier)}` : ''}</td>
      <td class="mzs-hide-s mzs-sub">${_esc(m.ref || '·')}${m.note ? `<div>${_esc(m.note)}</div>` : ''}</td>
    </tr>`).join('');
  return `
    <table class="mzs-table">
      <thead><tr>
        <th>Date</th>
        <th>${opts.hideProduct ? 'Variante' : 'Produit'}</th>
        <th>Type</th><th>Qté</th><th>Avant → après</th>
        <th class="mzs-hide-s">Employé</th><th class="mzs-hide-s">Source</th><th class="mzs-hide-s">Référence · note</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function _mzRenderPage() {
  const M = MZS();
  if (!M) { toast(dt("inventory.registerUnavailable", "Registre indisponible"), { type: 'warn' }); return; }
  _mzCss();
  const rows = _mzRows();
  const tot = M.totals(rows);
  const fac = M.facets();
  const cats = (CAT() && CAT().listCategories()) || [];
  const opt = (v, label, cur) => `<option value="${_esc(v)}"${String(cur) === String(v) ? ' selected' : ''}>${_esc(label)}</option>`;
  window.Kiwi.appPage('stock-movements', {
    title: 'Mouvements de stock',
    subtitle: `Chaque entrée et chaque sortie, avec l'employé, la source et l'état du stock avant/après`,
    body: `
      <div class="kx-kpi-strip">
        <div class="kx-kpi"><div class="l">MOUVEMENTS</div><div class="v">${tot.count}</div><div class="d">${_mzFilter.days ? `${_mzFilter.days} derniers jours` : 'tout l’historique'}</div></div>
        <div class="kx-kpi"><div class="l">ENTRÉES</div><div class="v">+${tot.entries}</div><div class="d">pièces reçues, retournées, corrigées</div></div>
        <div class="kx-kpi"><div class="l">SORTIES</div><div class="v">−${tot.exits}</div><div class="d">ventes, pertes, transferts</div></div>
        <div class="kx-kpi"><div class="l">SOLDE</div><div class="v">${tot.entries - tot.exits >= 0 ? '+' : '−'}${Math.abs(tot.entries - tot.exits)}</div><div class="d">variation nette sur la période</div></div>
      </div>

      <div class="p-toolbar" style="margin-top:4px;">
        <div class="p-search" style="flex:1;"><span style="display:inline-flex;align-items:center;">${_ICN.search}</span>
          <input data-mz-search placeholder="Produit, catégorie, type, référence…" value="${_esc(_mzFilter.q)}" style="border:none;background:transparent;outline:none;margin-left:6px;font:inherit;color:inherit;flex:1;min-width:120px;" /></div>
        <button data-activation=money class="kb ghost" data-action="mz-export">${_ICN.upload}Exporter CSV</button>
        <button data-activation=write class="kb primary" data-action="mz-new">${_ICN.plus}Nouveau mouvement</button>
      </div>

      <div class="mzs-filters">
        <select data-mz="days">${[['0', 'Tout'], ['7', '7 jours'], ['30', '30 jours'], ['90', '90 jours'], ['365', '12 mois']].map(([v, l]) => opt(v, l, _mzFilter.days)).join('')}</select>
        <select data-mz="type">${opt('', 'Tous les types', _mzFilter.type)}${M.types().filter((t) => fac.types.indexOf(t.id) >= 0 || !fac.types.length).map((t) => opt(t.id, (t.dir > 0 ? '↑ ' : '↓ ') + t.label, _mzFilter.type)).join('')}</select>
        <select data-mz="categoryId">${opt('', 'Toutes catégories', _mzFilter.categoryId)}${cats.map((c) => opt(c.id, c.name, _mzFilter.categoryId)).join('')}</select>
        ${_mzFilter.productId ? `<button class="kb ghost xs" data-action="mz-clear-product">Produit filtré · tout voir</button>` : ''}
      </div>

      <div class="mzs-wrap" id="mz-table">${_mzTableHtml(rows)}</div>

      <div class="kx-foot-hint">
        <div class="lh">Registre</div>
        <div class="rh">Un stock ne peut pas bouger sans mouvement : ventes et remboursements de la caisse s'écrivent ici tout seuls, et les saisies manuelles demandent un code responsable au comptoir.</div>
      </div>
    `,
  });
  setTimeout(() => {
    const root = document.querySelector('.dash-genpage');
    if (!root) return;
    root.querySelectorAll('[data-mz]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const k = sel.getAttribute('data-mz');
        _mzFilter[k] = k === 'days' ? (parseInt(sel.value, 10) || 0) : sel.value;
        _mzRenderPage();
      });
    });
    const s = root.querySelector('[data-mz-search]');
    if (s) s.addEventListener('input', () => {
      _mzFilter.q = s.value.trim();
      const t = document.getElementById('mz-table');
      if (t) t.innerHTML = _mzTableHtml(_mzRows());
    });
  }, 0);
}

handlers['nav-stock-movements'] = () => {
  if (!_bqxReady() || !MZS()) { toast(dt("inventory.movementsUnavailable", "Mouvements de stock indisponibles"), { desc: dt("inventory.reloadRegister", "Le registre n’est pas chargé, rechargez la page."), type: 'warn' }); return; }
  MZS().enable();
  _mzFilter.days = 0;
  _mzRenderPage();
};
handlers['mz-clear-product'] = () => { _mzFilter.productId = ''; _mzRenderPage(); };
handlers['mz-export'] = () => {
  const rows = _mzRows();
  const head = ['date', 'produit', 'variante', 'categorie', 'type', 'sens', 'quantite', 'avant', 'apres', 'employe', 'source', 'fournisseur', 'reference', 'note'];
  const cell = (c) => {
    let v = String(c == null ? '' : c);
    if (/^[\t\r ]*[=+\-@]/.test(v)) v = "'" + v;
    return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const csv = [head.join(',')].concat(rows.map((m) => [
    new Date(m.at).toISOString(), m.product, m.variant, m.category, m.typeLabel,
    m.dir > 0 ? 'entree' : 'sortie', Math.abs(m.qty), m.before == null ? '' : m.before,
    m.after == null ? '' : m.after, m.actor, _mzSource(m.source), m.supplier, m.ref, m.note,
  ].map(cell).join(','))).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'mouvements-stock.csv';
  document.body.appendChild(a); a.click(); a.remove();
  toast(dt("inventory.exported", "Mouvements exportés"), { desc: `${rows.length} ligne(s) au format CSV.`, type: 'success' });
};

/* ── La saisie manuelle, au tableau de bord ───────────────────────────────
 * Le même appel que la caisse (KiwiMaisonStock.record) : le stock bouge et le
 * mouvement s'écrit dans le même geste. On n'offre que les types qu'un humain
 * décide — une « vente » ne se saisit pas à la main, elle se passe en caisse. */
/* ── Nouveau mouvement de stock (tableau de bord) ────────────────────────────
 * 2026-10-12, what it replaced: seven bare fields in one column; a « ↑ Entrée ·
 * » text arrow glued to each motive; the supplier asked for a breakage; no way
 * to see the stock the gesture would leave before pressing the button; and a
 * refusal printed the server's code (« Mouvement impossible : non-autorise »).
 * Now: the direction first, then only its motives, the article, a quantity
 * with the stock before and after, the supplier only where the motive has one,
 * every refusal under the field it concerns, in FR, EN and AR. The gesture is
 * unchanged: KiwiMaisonStock.record moves the stock and writes the line. */
const _MZ_MV = {
  fr: {
    title: 'Nouveau mouvement de stock',
    desc: 'Le stock de la variante bouge et la ligne s’ajoute au registre des mouvements.',
    secMove: 'Mouvement', dir: 'Sens', dirIn: 'Entrée', dirOut: 'Sortie', reason: 'Motif', reasonErr: 'Choisissez le motif.',
    types: { reception: 'Réception fournisseur', reassort: 'Réassort', 'transfert-in': 'Transfert reçu', 'correction-in': 'Correction',
      casse: 'Article abîmé', perte: 'Perte', echantillon: 'Échantillon', 'usage-interne': 'Usage interne',
      'retour-fourn': 'Retour fournisseur', 'transfert-out': 'Transfert envoyé', 'correction-out': 'Correction' },
    secItem: 'Article', product: 'Produit', variant: 'Variante', inStock: '{n} en stock',
    noVariant: 'Ce produit n’a pas encore de variante. Ajoutez-en une depuis sa fiche.', noProduct: 'Aucun produit au catalogue pour l’instant.',
    qty: 'Quantité', less: 'Une pièce de moins', more: 'Une pièce de plus', qtyErr: 'Indiquez une quantité entière, au moins 1.',
    after: 'Stock : {before} → {after}', shortOne: 'Il n’y a qu’une pièce en stock.', shortMany: 'Il n’y a que {n} pièces en stock.', shortNone: 'Cette variante n’a aucune pièce en stock.',
    secTrace: 'Trace', supplier: 'Fournisseur', phSupplier: 'Nom du fournisseur', ref: 'Référence', phRef: 'Bon de livraison, ticket…',
    note: 'Note', optional: 'facultatif',
    cancel: 'Annuler', save: 'Enregistrer le mouvement',
    denied: 'Votre profil ne permet pas ce mouvement.', failed: 'Le mouvement n’a pas pu être enregistré. Réessayez.',
    done: 'Mouvement enregistré', doneDesc: 'Stock {before} → {after}.',
  },
  en: {
    title: 'New stock movement',
    desc: 'The variant’s stock moves and the line is added to the movement log.',
    secMove: 'Movement', dir: 'Direction', dirIn: 'In', dirOut: 'Out', reason: 'Reason', reasonErr: 'Choose the reason.',
    types: { reception: 'Supplier delivery', reassort: 'Restock', 'transfert-in': 'Transfer received', 'correction-in': 'Correction',
      casse: 'Damaged item', perte: 'Loss', echantillon: 'Sample', 'usage-interne': 'Internal use',
      'retour-fourn': 'Return to supplier', 'transfert-out': 'Transfer sent', 'correction-out': 'Correction' },
    secItem: 'Item', product: 'Product', variant: 'Variant', inStock: '{n} in stock',
    noVariant: 'This product has no variant yet. Add one from its sheet.', noProduct: 'No product in the catalogue yet.',
    qty: 'Quantity', less: 'One piece fewer', more: 'One piece more', qtyErr: 'Enter a whole quantity, at least 1.',
    after: 'Stock: {before} → {after}', shortOne: 'There is only one piece in stock.', shortMany: 'There are only {n} pieces in stock.', shortNone: 'This variant has no piece in stock.',
    secTrace: 'Record', supplier: 'Supplier', phSupplier: 'Supplier name', ref: 'Reference', phRef: 'Delivery note, receipt…',
    note: 'Note', optional: 'optional',
    cancel: 'Cancel', save: 'Save movement',
    denied: 'Your profile can’t make this movement.', failed: 'The movement couldn’t be saved. Try again.',
    done: 'Movement saved', doneDesc: 'Stock {before} → {after}.',
  },
  ar: {
    title: 'حركة مخزون جديدة',
    desc: 'يتغيّر مخزون المتغيّر ويُضاف السطر إلى سجلّ الحركات.',
    secMove: 'الحركة', dir: 'الاتجاه', dirIn: 'دخول', dirOut: 'خروج', reason: 'السبب', reasonErr: 'اختر السبب.',
    types: { reception: 'استلام من المورّد', reassort: 'إعادة تزويد', 'transfert-in': 'تحويل مستلَم', 'correction-in': 'تصحيح',
      casse: 'سلعة تالفة', perte: 'فقدان', echantillon: 'عيّنة', 'usage-interne': 'استعمال داخلي',
      'retour-fourn': 'إرجاع إلى المورّد', 'transfert-out': 'تحويل مُرسَل', 'correction-out': 'تصحيح' },
    secItem: 'السلعة', product: 'المنتج', variant: 'المتغيّر', inStock: '{n} في المخزون',
    noVariant: 'لا يملك هذا المنتج أي متغيّر بعد. أضف متغيّراً من بطاقته.', noProduct: 'لا يوجد أي منتج في الكتالوج بعد.',
    qty: 'الكمية', less: 'قطعة أقل', more: 'قطعة أكثر', qtyErr: 'أدخل كمية صحيحة، 1 على الأقل.',
    after: 'المخزون: {before} → {after}', shortOne: 'لا توجد في المخزون إلا قطعة واحدة.', shortMany: 'لا توجد في المخزون إلا {n} قطع.', shortNone: 'لا توجد أي قطعة من هذا المتغيّر في المخزون.',
    secTrace: 'التوثيق', supplier: 'المورّد', phSupplier: 'اسم المورّد', ref: 'المرجع', phRef: 'وصل التسليم، تذكرة…',
    note: 'ملاحظة', optional: 'اختياري',
    cancel: 'إلغاء', save: 'تسجيل الحركة',
    denied: 'لا يسمح ملفك بهذه الحركة.', failed: 'تعذّر تسجيل الحركة. أعد المحاولة.',
    done: 'تم تسجيل الحركة', doneDesc: 'المخزون {before} → {after}.',
  },
};
function _mzMvT() {
  const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  return _MZ_MV[l] || _MZ_MV.fr;
}
function _mzMvCss() {
  _bqxPfCss();
  if (document.getElementById('mz-mv-css')) return;
  const st = document.createElement('style');
  st.id = 'mz-mv-css';
  st.textContent = `
    .bqx-pf.mz-mv { grid-template-columns: minmax(0, 1fr); }
    .mz-mv-seg { position: relative; display: flex; gap: 2px; width: max-content; max-width: 100%; padding: 3px; border-radius: 12px; background: color-mix(in srgb, var(--ink) 6%, var(--pf-field)); }
    .mz-mv-segi { position: relative; flex: none; cursor: pointer; }
    .mz-mv-segi input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .mz-mv-segi span { display: inline-flex; align-items: center; height: 34px; padding: 0 18px; border-radius: 9px; font: 500 13px var(--sans); color: var(--n-600); white-space: nowrap; transition: color 160ms; }
    .mz-mv-segi.on span { color: var(--ink); font-weight: 600; }
    .mz-mv-seg:not([data-kw-lens]) .mz-mv-segi.on span { background: var(--surface); box-shadow: 0 1px 2px rgba(0, 0, 0, .06); }
    .mz-mv-segi input:focus-visible + span { box-shadow: 0 0 0 2px var(--atlas); }
    .mz-mv-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .mz-mv-chip { position: relative; }
    .mz-mv-chip input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
    .mz-mv-chip span { display: inline-flex; align-items: center; height: 34px; padding: 0 14px; border: 1px solid var(--n-200); border-radius: 999px; background: var(--pf-field); color: var(--n-700); font: 500 13px var(--sans); white-space: nowrap; transition: background-color 140ms, border-color 140ms, color 140ms; }
    .mz-mv-chip:hover span { border-color: var(--atlas); color: var(--atlas); }
    .mz-mv-chip input:checked + span { background: var(--atlas); border-color: var(--atlas); color: var(--paper); }
    .mz-mv-chip input:focus-visible + span { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .mz-mv-chips[aria-invalid="true"] .mz-mv-chip span { border-color: var(--danger, #cb5238); }
    .mz-mv-qty { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .mz-mv-qty .bqx-pf-in { width: 88px; text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }
    .mz-mv-step { display: grid; place-items: center; flex: none; width: 40px; height: 40px; padding: 0; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--n-700); cursor: pointer; transition: border-color 140ms, color 140ms; }
    .mz-mv-step:hover { border-color: var(--atlas); color: var(--atlas); }
    .mz-mv-step:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .mz-mv-after { flex: 1 1 170px; min-width: 0; margin-inline-start: 6px; font-size: 13px; line-height: 1.4; color: var(--n-600); font-variant-numeric: tabular-nums; }
    .mz-mv-after.is-short { color: var(--danger, #cb5238); font-weight: 600; }
    .mz-mv-empty { margin: 0 0 14px; padding: 12px 14px; border-radius: 10px; background: color-mix(in srgb, var(--ink) 5%, var(--pf-field)); font-size: 12.5px; line-height: 1.45; color: var(--n-600); }
  `;
  document.head.appendChild(st);
}
function _mzManualModal(preset) {
  const M = MZS(); const cat = CAT();
  if (!M || !cat) return;
  preset = preset || {};
  _mzMvCss();
  const t = _mzMvT();
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ''));
  const products = cat.listProducts({}) || [];
  const manual = M.types().filter((x) => x.manual);
  const typeLabel = (x) => t.types[x.id] || x.label;
  const ico = (n) => (window.KiwiIcon && window.KiwiIcon.svg ? window.KiwiIcon.svg(n, 18) : (n === 'add' ? '+' : '−'));
  const pOpts = products.map((p) => `<option value="${_esc(p.id)}"${p.id === preset.productId ? ' selected' : ''}>${_esc(p.name)}</option>`).join('');
  const opt = (label) => `<span class="bqx-pf-tag">${_esc(label)}</span>`;
  const m = window.Kiwi.modal({
    title: t.title,
    desc: _esc(t.desc),
    width: 600,
    body: `
      <div class="bqx-pf mz-mv" data-mz-mv>
        <div class="bqx-pf-main">
          <section class="bqx-pf-sec">
            <h4>${_esc(t.secMove)}</h4>
            <div class="bqx-pf-f">
              <span class="bqx-pf-l" id="mz-mv-dir-l">${_esc(t.dir)}</span>
              <div class="mz-mv-seg" role="radiogroup" aria-labelledby="mz-mv-dir-l">
                <label class="mz-mv-segi on"><input type="radio" name="mz-mv-dir" value="1" checked data-mzm-dir /><span>${_esc(t.dirIn)}</span></label>
                <label class="mz-mv-segi"><input type="radio" name="mz-mv-dir" value="-1" data-mzm-dir /><span>${_esc(t.dirOut)}</span></label>
              </div>
            </div>
            <div class="bqx-pf-f">
              <span class="bqx-pf-l" id="mz-mv-type-l">${_esc(t.reason)}</span>
              <div class="mz-mv-chips" role="radiogroup" aria-labelledby="mz-mv-type-l" data-mzm-types></div>
              <span class="bqx-pf-err" data-mzm-err="type" hidden>${_esc(t.reasonErr)}</span>
            </div>
          </section>
          <section class="bqx-pf-sec">
            <h4>${_esc(t.secItem)}</h4>
            ${products.length ? `
            <label class="bqx-pf-f">
              <span class="bqx-pf-l">${_esc(t.product)}</span>
              <select class="bqx-pf-in" data-mzm="product">${pOpts}</select>
            </label>
            <label class="bqx-pf-f" data-mzm-variant-wrap>
              <span class="bqx-pf-l">${_esc(t.variant)}</span>
              <select class="bqx-pf-in" data-mzm="variant"></select>
              <span class="bqx-pf-err" data-mzm-err="variant" hidden></span>
            </label>
            <p class="mz-mv-empty" data-mzm-novar hidden>${_esc(t.noVariant)}</p>
            <div class="bqx-pf-f" data-mzm-qty-wrap>
              <span class="bqx-pf-l" id="mz-mv-qty-l">${_esc(t.qty)}</span>
              <div class="mz-mv-qty">
                <button type="button" class="mz-mv-step" data-mzm-step="-1" aria-label="${_esc(t.less)}">${ico('remove')}</button>
                <input class="bqx-pf-in" data-mzm="qty" inputmode="numeric" autocomplete="off" value="1" aria-labelledby="mz-mv-qty-l" />
                <button type="button" class="mz-mv-step" data-mzm-step="1" aria-label="${_esc(t.more)}">${ico('add')}</button>
                <span class="mz-mv-after" data-mzm-after aria-live="polite"></span>
              </div>
              <span class="bqx-pf-err" data-mzm-err="qty" hidden></span>
            </div>` : `<p class="mz-mv-empty">${_esc(t.noProduct)}</p>`}
          </section>
          <section class="bqx-pf-sec">
            <h4>${_esc(t.secTrace)}</h4>
            <label class="bqx-pf-f" data-mzm-sup-wrap hidden>
              <span class="bqx-pf-l">${_esc(t.supplier)}${opt(t.optional)}</span>
              <input class="bqx-pf-in" data-mzm="supplier" maxlength="80" placeholder="${_esc(t.phSupplier)}" />
            </label>
            <div class="bqx-pf-grid">
              <label class="bqx-pf-f">
                <span class="bqx-pf-l">${_esc(t.ref)}${opt(t.optional)}</span>
                <input class="bqx-pf-in" data-mzm="ref" maxlength="80" placeholder="${_esc(t.phRef)}" />
              </label>
              <label class="bqx-pf-f">
                <span class="bqx-pf-l">${_esc(t.note)}${opt(t.optional)}</span>
                <input class="bqx-pf-in" data-mzm="note" maxlength="200" />
              </label>
            </div>
          </section>
          <p class="bqx-pf-err" data-mzm="msg" role="alert" hidden></p>
        </div>
      </div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb primary" data-mzm="save"${products.length ? '' : ' disabled'}>${_esc(t.save)}</button>`,
  });
  const root = m && m.el ? m.el : document;
  if (m && m.el) m.el.classList.add('bqx-pf-modal');
  root.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => m.close()));
  const q = (k) => root.querySelector(`[data-mzm="${k}"]`);
  const err = (k, msg) => {
    const e = root.querySelector(`[data-mzm-err="${k}"]`);
    const field = k === 'type' ? root.querySelector('[data-mzm-types]') : q(k === 'qty' ? 'qty' : k);
    if (e) { if (msg) e.textContent = msg; e.hidden = !msg; }
    if (field) { if (msg) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid'); }
  };
  const dir = () => { const r = root.querySelector('[data-mzm-dir]:checked'); return r && r.value === '-1' ? -1 : 1; };
  const type = () => { const r = root.querySelector('[data-mzm-type]:checked'); return r ? manual.find((x) => x.id === r.value) || null : null; };
  const variant = () => {
    if (!q('product') || !q('variant')) return null;
    const vid = q('variant').value;
    return (cat.listVariants(q('product').value) || []).find((v) => v.id === vid) || null;
  };
  const qty = () => { const s = String(q('qty') ? q('qty').value : '').trim(); return /^\d+$/.test(s) ? parseInt(s, 10) : NaN; };

  const shortMsg = (n) => (n <= 0 ? t.shortNone : n === 1 ? t.shortOne : fill(t.shortMany, { n }));
  const paintAfter = () => {
    const out = root.querySelector('[data-mzm-after]');
    if (!out) return;
    const v = variant(), n = qty();
    out.classList.remove('is-short');
    if (!v || !(n > 0)) { out.textContent = ''; return; }
    const before = Math.max(0, +v.stock || 0);
    if (dir() < 0 && n > before) { out.classList.add('is-short'); out.textContent = shortMsg(before); return; }
    out.textContent = fill(t.after, { before, after: before + dir() * n });
  };
  const paintTypes = (keep) => {
    const d = dir();
    const list = manual.filter((x) => (x.dir > 0) === (d > 0));
    const sel = keep && list.some((x) => x.id === keep) ? keep : (list.length === 1 ? list[0].id : '');
    root.querySelector('[data-mzm-types]').innerHTML = list.map((x) => `<label class="mz-mv-chip"><input type="radio" name="mz-mv-type" value="${_esc(x.id)}"${x.id === sel ? ' checked' : ''} data-mzm-type /><span>${_esc(typeLabel(x))}</span></label>`).join('');
    paintSupplier();
  };
  const paintSupplier = () => {
    const w = root.querySelector('[data-mzm-sup-wrap]');
    const x = type();
    if (w) w.hidden = !(x && x.supplier);
  };
  const fillVariants = () => {
    if (!q('product')) return;
    const pid = q('product').value;
    const vs = cat.listVariants(pid) || [];
    q('variant').innerHTML = vs.map((v) => `<option value="${_esc(v.id)}">${_esc([v.size, _bqxColorName(_bqxShownColor(v))].filter(Boolean).join(' · '))} · ${_esc(fill(t.inStock, { n: v.stock }))}</option>`).join('');
    if (preset.variantId && vs.some((v) => v.id === preset.variantId)) q('variant').value = preset.variantId;
    root.querySelector('[data-mzm-variant-wrap]').hidden = !vs.length;
    root.querySelector('[data-mzm-qty-wrap]').hidden = !vs.length;
    root.querySelector('[data-mzm-novar]').hidden = !!vs.length;
    q('save').disabled = !vs.length;
    err('variant', ''); err('qty', '');
    paintAfter();
  };

  /* Preset motive (the sheet's « sortie pour casse », say) picks its direction. */
  if (preset.type) {
    const pt = manual.find((x) => x.id === preset.type);
    if (pt && pt.dir < 0) { const r = root.querySelector('[data-mzm-dir][value="-1"]'); if (r) r.checked = true; }
  }
  root.querySelectorAll('[data-mzm-dir]').forEach((r) => r.addEventListener('change', () => {
    root.querySelectorAll('.mz-mv-segi').forEach((l) => l.classList.toggle('on', l.contains(root.querySelector('[data-mzm-dir]:checked'))));
    const was = type();
    paintTypes(was && was.id);
    err('type', '');
    err('qty', '');
    paintAfter();
  }));
  root.querySelectorAll('.mz-mv-segi').forEach((l) => l.classList.toggle('on', l.contains(root.querySelector('[data-mzm-dir]:checked'))));
  root.querySelector('[data-mzm-types]').addEventListener('change', () => { err('type', ''); paintSupplier(); });
  paintTypes(preset.type);
  if (q('product')) {
    fillVariants();
    q('product').addEventListener('change', fillVariants);
    q('variant').addEventListener('change', () => { err('qty', ''); paintAfter(); });
    q('qty').addEventListener('input', () => { err('qty', ''); paintAfter(); });
    root.querySelectorAll('[data-mzm-step]').forEach((b) => b.addEventListener('click', () => {
      const n = qty();
      q('qty').value = String(Math.max(1, (n > 0 ? n : 0) + (+b.dataset.mzmStep)));
      err('qty', '');
      paintAfter();
    }));
  }

  q('save').addEventListener('click', () => {
    const msg = q('msg');
    msg.hidden = true;
    const x = type(), v = variant(), n = qty();
    let bad = false;
    if (!x) { err('type', t.reasonErr); bad = true; }
    if (!(n > 0)) { err('qty', t.qtyErr); bad = true; }
    else if (x && v && x.dir < 0 && n > Math.max(0, +v.stock || 0)) { err('qty', shortMsg(Math.max(0, +v.stock || 0))); bad = true; }
    if (bad) {
      const first = root.querySelector('[data-mz-mv] [aria-invalid="true"]');
      const f = first && (first.matches('input, select') ? first : first.querySelector('input'));
      if (f) f.focus();
      return;
    }
    const res = M.record({
      productId: q('product').value, variantId: q('variant').value,
      type: x.id, qty: n,
      supplier: x.supplier ? q('supplier').value.trim() : '', ref: q('ref').value.trim(),
      note: q('note').value.trim(), source: 'dashboard',
      actor: (window.KiwiStaff && window.KiwiStaff.name) || '',
    });
    if (!res.ok) {
      if (res.reason === 'stock-insuffisant') { err('qty', shortMsg(res.before)); q('qty').focus(); return; }
      if (res.reason === 'quantite') { err('qty', t.qtyErr); q('qty').focus(); return; }
      if (res.reason === 'type') { err('type', t.reasonErr); return; }
      if (res.reason === 'variante-introuvable') { err('variant', t.noVariant); return; }
      msg.textContent = res.reason === 'non-autorise' ? t.denied : t.failed;
      msg.hidden = false;
      return;
    }
    m.close();
    toast(t.done, { desc: fill(t.doneDesc, { before: res.before, after: res.after }), type: 'success' });
    _mzRenderPage();
  });
}
handlers['mz-new'] = () => _mzManualModal({ productId: _mzFilter.productId });
handlers['bqx-prod-movements'] = (_el, arg) => {
  _mzFilter.productId = arg || '';
  /* Fermer chaque couche par son propre close() : le `.remove()` direct sautait
     unlockPageScroll(), laissait html.kiwi-locked posé, et la page des
     mouvements ne défilait plus. Il abandonnait aussi l'écouteur Échap de la
     fiche produit. */
  document.querySelectorAll('.kiwi-drawer-backdrop').forEach((b) => (b.__kiwiClose ? b.__kiwiClose() : b.remove()));
  document.querySelectorAll('.kiwi-backdrop').forEach((b) => {
    const x = b.querySelector('.kiwi-modal-close');
    if (x) x.click(); else b.remove();
  });
  handlers['nav-stock-movements']();
};

/* ─── variant actions (all persist via the catalog → subscribe re-renders) ─── */
handlers['bqx-var-inc'] = (_el, arg) => CAT().adjustStock(arg, +1);
/* No −1 below zero. The catalogue kept that move, showed 0, and the next +1
   fell into the hole: 0 − 1 + 1 left the variant at 0. */
handlers['bqx-var-dec'] = (_el, arg) => {
  const hit = _bqxVarById(arg);
  if (!hit || !(+hit.v.stock > 0)) return;
  CAT().adjustStock(arg, -1);
};
/* Deleting a variant takes its stock and its barcodes with it, so it is asked
   first; it used to go on a single tap of the bin. */
handlers['bqx-var-del'] = (_el, arg) => {
  const t = _bqxShT();
  const hit = _bqxVarById(arg);
  if (!hit) return;
  const { v, pid } = hit;
  const data = CAT().getProduct(pid);
  const stock = Math.max(0, +v.stock || 0);
  const codes = (v.barcodes || []).map((b) => b.code);
  const items = [
    stock ? t.delStock(stock) : t.delNoStock,
    codes.length ? _bqxPfFill(t.delCodes, { codes: codes.join(', ') }) : '',
    _bqxTillReads() ? t.delTill : '',
  ].filter(Boolean);
  _bqxModal = modal({
    title: t.delVarTitle, tag: data ? data.product.name : '',
    desc: _esc(_bqxVarName(v)),
    width: 460,
    body: `<div class="kx-warn-box danger"><div class="hd">${_esc(t.irreversible)}</div><ul>${items.map((x) => `<li>${_esc(x)}</li>`).join('')}</ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button class="kb danger" data-action="bqx-var-del-ok" data-arg="${_esc(arg)}">${_bqxIc('trash-2')}${_esc(t.delVarOk)}</button>`,
  });
};
handlers['bqx-var-del-ok'] = (_el, arg) => {
  const t = _bqxShT();
  const hit = _bqxVarById(arg);
  const label = hit ? _bqxVarLabel(hit.v) : '';
  CAT().deleteVariant(arg);
  if (_bqxModal) _bqxModal.close();
  toast(t.delVarDone, { desc: label, type: 'warn', duration: 2200 });
};
handlers['bqx-var-gen'] = (_el, arg) => {
  const t = _bqxShT();
  const code = CAT().generateBarcode(arg);
  if (code) toast(t.genDone, { desc: _bqxPfFill(t.genDesc, { code }), type: 'success', duration: 2600 });
  else toast(t.genFail, { type: 'warn' });
};
handlers['bqx-var-gen-all'] = (_el, arg) => {
  const t = _bqxShT();
  const cat = CAT();
  const todo = (cat.listVariants(arg) || []).filter((v) => !(v.barcodes || []).length);
  let made = 0;
  cat.batch(() => { todo.forEach((v) => { if (cat.generateBarcode(v.id)) made++; }); });
  if (made) toast(t.genAllDone(made), { type: 'success', duration: 2600 });
  else toast(t.genFail, { type: 'warn' });
};
handlers['bqx-var-print'] = (_el, arg) => _bqxPrintVariant(arg);

function _bqxLabelFor(pid, v) {
  const p = CAT().getProduct(pid).product;
  const code = CAT().primaryBarcode(v);
  if (!code) return null;
  const fmt = BC().isValidEan13(code) ? 'ean13' : 'code128';
  return { title: p.name, sub: `${v.colorLabel} · ${v.size}`, price: _bqxPrice(p.priceMAD), code, format: fmt };
}
function _bqxPrintVariant(vid) {
  const t = _bqxShT();
  const hit = _bqxVarById(vid);
  if (!hit) return;
  const label = _bqxLabelFor(hit.pid, hit.v);
  if (!label) { toast(t.noCode, { desc: t.noCodeVar, type: 'warn' }); return; }
  _bqxAskCopies((copies) => { BC().printLabels([label], { copies }); }, _bqxVarLabel(hit.v), 1);
}
handlers['bqx-prod-print'] = (_el, arg) => {
  const t = _bqxShT();
  const data = CAT().getProduct(arg);
  if (!data) return;
  const labels = data.variants.map((v) => _bqxLabelFor(arg, v)).filter(Boolean);
  if (!labels.length) { toast(t.noCode, { desc: t.noCodeProd, type: 'warn' }); return; }
  _bqxAskCopies((copies) => { BC().printLabels(labels, { copies }); }, t.withCode(labels.length), labels.length);
};

/* A − / + stepper over a whole-number field, kept between lo and hi. */
function _bqxWireStep(b, input, lo, hi, after) {
  b.querySelectorAll('[data-bqx-step]').forEach((btn) => btn.addEventListener('click', () => {
    const r = _bqxPieces(input.value);
    input.value = String(Math.min(hi, Math.max(lo, (r.n == null ? lo : r.n) + Number(btn.getAttribute('data-bqx-step')))));
    if (after) after();
  }));
}
function _bqxStepHtml(t, id, attr, value) {
  return `<div class="bqx-sh-step">
    <button type="button" data-bqx-step="-1" aria-label="${_esc(t.less)}">${_bqxIc('remove', 18)}</button>
    <input id="${id}" class="bqx-pf-in" type="text" inputmode="numeric" autocomplete="off" value="${value}" ${attr} />
    <button type="button" data-bqx-step="1" aria-label="${_esc(t.more)}">${_bqxIc('add', 18)}</button>
  </div>`;
}

function _bqxAskCopies(cb, note, count) {
  const t = _bqxShT();
  _bqxCss(); _bqxPfCss(); _bqxShCss();
  _bqxModal = modal({
    title: t.printTitle, tag: t.printTag,
    desc: _esc(note || t.printDesc),
    width: 440,
    body: `<div class="bqx-pf is-one"><div class="bqx-pf-main"><div class="bqx-pf-f">
        <label class="bqx-pf-l" for="bqx-copies">${_esc((count || 1) > 1 ? t.copies : t.copiesOne)}</label>
        ${_bqxStepHtml(t, 'bqx-copies', 'data-bqx-copies data-autofocus data-autofocus-select', 1)}
        <div class="bqx-pf-hint" data-bqx-copies-total></div>
        <div class="bqx-pf-err" data-bqx-copies-err role="alert" hidden></div>
      </div>
      <div class="bqx-pf-hint">${_esc(t.printHint)}</div></div></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-print-go">${_bqxIc('print')}${_esc(t.print)}</button>`,
  });
  _bqxPrintCb = cb;
  const b = _bqxModal && _bqxModal.el;
  if (!b) return;
  b.classList.add('bqx-pf-modal');
  const inp = b.querySelector('[data-bqx-copies]');
  const total = b.querySelector('[data-bqx-copies-total]');
  const err = b.querySelector('[data-bqx-copies-err]');
  const per = count || 1;
  const sync = () => {
    const r = _bqxPieces(inp.value);
    total.textContent = r.n > 0 ? t.totalLabels(r.n * per) : '';
    err.hidden = true; inp.setAttribute('aria-invalid', 'false');
  };
  _bqxWireStep(b, inp, 1, 99, sync);
  inp.addEventListener('input', sync);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handlers['bqx-print-go'](); } });
  sync();
}
let _bqxPrintCb = null;
handlers['bqx-print-go'] = () => {
  const t = _bqxShT();
  const b = _bqxModal && _bqxModal.el;
  const inp = b && b.querySelector('[data-bqx-copies]');
  const r = _bqxPieces(inp ? inp.value : '1');
  if (!(r.n >= 1 && r.n <= 99)) {
    const err = b && b.querySelector('[data-bqx-copies-err]');
    if (err) { err.textContent = t.copiesBad; err.hidden = false; }
    if (inp) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); }
    return;
  }
  if (_bqxModal) _bqxModal.close();
  if (_bqxPrintCb) { const cb = _bqxPrintCb; _bqxPrintCb = null; setTimeout(() => cb(r.n), 120); }
};

/* register an EXISTING barcode onto a variant (old POS code, kept verbatim).
   Each refusal is said under the field, in words: it used to be a toast,
   « Enregistrement impossible », whatever the reason. */
handlers['bqx-var-reg'] = (_el, arg) => {
  const t = _bqxShT();
  const hit = _bqxVarById(arg);
  _bqxCss(); _bqxPfCss(); _bqxShCss();
  _bqxModal = modal({
    title: t.regTitle, tag: hit ? _bqxVarName(hit.v) : '',
    desc: _esc(t.regDesc),
    width: 480,
    body: `<div class="bqx-pf is-one"><div class="bqx-pf-main"><div class="bqx-pf-f">
        <label class="bqx-pf-l" for="bqx-regcode">${_esc(t.regLabel)}</label>
        <input id="bqx-regcode" class="bqx-pf-in bqx-sh-mono" placeholder="${_esc(t.regPh)}" data-bqx-regcode data-autofocus autocomplete="off" spellcheck="false" />
        <div class="bqx-pf-err" data-bqx-reg-err role="alert" hidden></div>
        <div class="bqx-pf-hint">${_esc(t.regHint)}</div>
      </div></div></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-var-reg-save" data-arg="${_esc(arg)}" data-bqx-reg-go>${_esc(t.regSave)}</button>`,
  });
  const b = _bqxModal && _bqxModal.el;
  if (!b) return;
  b.classList.add('bqx-pf-modal');
  const inp = b.querySelector('[data-bqx-regcode]');
  inp.addEventListener('input', () => {
    _bqxRegSay(b, '');
    delete inp.dataset.confirmed;
    const go = b.querySelector('[data-bqx-reg-go]');
    if (go) go.textContent = t.regSave;
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); handlers['bqx-var-reg-save'](null, arg); } });
};
function _bqxRegSay(b, msg, warn) {
  const err = b.querySelector('[data-bqx-reg-err]');
  const inp = b.querySelector('[data-bqx-regcode]');
  if (err) { err.textContent = msg || ''; err.hidden = !msg; err.classList.toggle('is-warn', !!warn); }
  if (inp) inp.setAttribute('aria-invalid', msg && !warn ? 'true' : 'false');
}
handlers['bqx-var-reg-save'] = (_el, arg) => {
  const t = _bqxShT();
  const b = _bqxModal && _bqxModal.el;
  if (!b || !b.isConnected) return;
  const inp = b.querySelector('[data-bqx-regcode]');
  if (!inp) return;
  const raw = inp.value.trim();
  if (!raw) { _bqxRegSay(b, t.regEmpty); inp.focus(); return; }
  /* A typed EAN whose check digit fails is most often a typo. Said once; a
     second press keeps it, since an old system may print such codes. */
  const KB = window.KiwiBarcode;
  const val = KB && KB.validate ? KB.validate(raw) : null;
  if (val && val.ok && val.check === 'bad' && inp.dataset.confirmed !== raw) {
    inp.dataset.confirmed = raw;
    _bqxRegSay(b, _bqxPfFill(t.regCheck, { sym: val.label || 'EAN' }), true);
    const go = b.querySelector('[data-bqx-reg-go]');
    if (go) go.textContent = t.regSaveAnyway;
    return;
  }
  const res = CAT().attachBarcode(arg, raw);
  if (res.ok) {
    if (_bqxModal) _bqxModal.close();
    toast(res.already ? t.regAlready : t.regDone, { desc: _bqxPfFill(_bqxTillReads() ? t.regDescTill : t.regDescInv, { code: res.code || raw }), type: 'success', duration: 2600 });
    return;
  }
  if (res.reason === 'doublon' && res.owner) {
    const o = res.owner;
    _bqxRegSay(b, _bqxPfFill(t.regDup, { product: o.product ? o.product.name : '', variant: o.variant ? _bqxVarName(o.variant) : '' }));
  } else {
    _bqxRegSay(b, ({ vide: t.regEmpty, 'trop-court': t.regShort, 'trop-long': t.regLong, illisible: t.regUnreadable })[res.reason] || t.regFail);
  }
  inp.focus(); inp.select();
};

/* add a variant (colour × size × stock).
   It used to call addVariant, which on a colour and size the product already
   had REPLACED that variant's stock with this form's « Stock initial » (0 by
   default) and still said « Variante ajoutée ». The form now says the
   variant exists, before saving, and the save goes through ensureVariant,
   which never touches an existing count. */
handlers['bqx-var-add'] = (_el, arg) => {
  const t = _bqxShT();
  const data = CAT().getProduct(arg);
  if (!data) return;
  _bqxCss(); _bqxPfCss(); _bqxShCss();
  const copy = _bqxCopy();
  const kind = data.product.kind || copy.defaultKind;
  const presets = (CAT().sizePresets(kind) || []).slice(0, 14);
  const sizeL = kind === 'pointure' ? t.sizeShoe : (copy.trade === 'boutique' ? t.sizeCloth : t.sizeFormat);
  _bqxModal = modal({
    title: t.addTitle, tag: data.product.name,
    desc: _esc(t.addDesc),
    width: 560,
    body: `<div class="bqx-pf is-one" data-bqx-va><div class="bqx-pf-main">
      <section class="bqx-pf-sec">
        <h4>${_esc(t.color)}</h4>
        <div class="bqx-pf-f">
          <div class="bqx-sh-picker" data-bqx-va-color>${_colorPicker(null, { label: t.color })}</div>
          <div class="bqx-pf-err" data-bqx-va-err="color" role="alert" hidden></div>
        </div>
        <div class="bqx-pf-f">
          <label class="bqx-pf-l" for="bqx-va-note">${_esc(t.note)} <span class="bqx-pf-tag">${_esc(t.optional)}</span></label>
          <input id="bqx-va-note" class="bqx-pf-in" maxlength="60" data-bqx-vnote placeholder="${_esc(t.notePh)}" autocomplete="off" />
          <div class="bqx-pf-hint">${_esc(t.noteHint)}</div>
        </div>
      </section>
      <section class="bqx-pf-sec">
        <h4>${_esc(sizeL)}</h4>
        <div class="bqx-pf-f">
          ${presets.length ? `<div class="bqx-sh-chips" role="group" aria-label="${_esc(sizeL)}">${presets.map((s) => `<button type="button" class="bqx-sh-chip" data-bqx-size="${_esc(s)}">${_esc(s)}</button>`).join('')}</div>` : ''}
          <input class="bqx-pf-in" maxlength="24" data-bqx-vsize aria-label="${_esc(sizeL)}" placeholder="${_esc(t.sizePh)}" autocomplete="off" />
          <div class="bqx-pf-hint">${_esc(t.sizeHint)}</div>
        </div>
      </section>
      <section class="bqx-pf-sec">
        <h4>${_esc(t.stockAndCode)}</h4>
        <div class="bqx-pf-f">
          <label class="bqx-pf-l" for="bqx-va-stock">${_esc(t.stockInit)}</label>
          ${_bqxStepHtml(t, 'bqx-va-stock', 'data-bqx-vstock', 0)}
          <div class="bqx-pf-err" data-bqx-va-err="stock" role="alert" hidden></div>
          <div class="bqx-pf-hint">${_esc(t.stockInitHint)}</div>
        </div>
        <div class="bqx-pf-f">
          <span class="bqx-pf-l">${_esc(t.bcTitle)}</span>
          <div class="bqx-pf-choices">
            <label class="bqx-pf-choice"><input type="radio" name="bqx-vbc" value="gen" data-bqx-vbc checked /><b>${_esc(t.bcGen)}</b><small>${_esc(t.bcGenSub)}</small></label>
            <label class="bqx-pf-choice"><input type="radio" name="bqx-vbc" value="none" data-bqx-vbc /><b>${_esc(t.bcLater)}</b><small>${_esc(t.bcLaterSub)}</small></label>
          </div>
        </div>
      </section>
      <div class="bqx-sh-preview" data-bqx-va-preview aria-live="polite"></div>
    </div></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-var-add-save" data-arg="${_esc(arg)}" data-bqx-va-go>${_esc(t.addOk)}</button>`,
  });
  const b = _bqxModal && _bqxModal.el;
  if (!b) return;
  b.classList.add('bqx-pf-modal');
  _bqxVaWire(b, arg);
};
function _bqxVaRead(b, pid) {
  const color = (window.KiwiColors && window.KiwiColors.selection(b)) || null;
  const typed = ((b.querySelector('[data-bqx-vsize]') || {}).value || '').trim().replace(/\s+/g, ' ');
  const size = typed || 'TU';
  const stock = _bqxPieces((b.querySelector('[data-bqx-vstock]') || {}).value);
  const bcEl = b.querySelector('[data-bqx-vbc]:checked');
  const note = ((b.querySelector('[data-bqx-vnote]') || {}).value || '').trim();
  const dup = color ? CAT().findVariant(pid, color.id, size) : null;
  return { color, size, typed: !!typed, stock, bc: bcEl ? bcEl.value : 'gen', note, dup };
}
function _bqxVaSay(b, k, msg) {
  const e = b.querySelector(`[data-bqx-va-err="${k}"]`);
  if (e) { e.textContent = msg || ''; e.hidden = !msg; }
  if (k === 'stock') { const i = b.querySelector('[data-bqx-vstock]'); if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false'); }
  if (k === 'color') { const p = b.querySelector('[data-bqx-va-color]'); if (p) p.toggleAttribute('data-invalid', !!msg); }
}
function _bqxVaWire(b, pid) {
  const t = _bqxShT();
  const prev = b.querySelector('[data-bqx-va-preview]');
  const go = b.querySelector('[data-bqx-va-go]');
  const sizeIn = b.querySelector('[data-bqx-vsize]');
  const stockIn = b.querySelector('[data-bqx-vstock]');
  const paint = () => {
    const f = _bqxVaRead(b, pid);
    b.querySelectorAll('[data-bqx-size]').forEach((c) => c.classList.toggle('on', f.typed && c.getAttribute('data-bqx-size') === f.size));
    const kc = window.KiwiColors;
    const sw = f.color && kc && kc.swatch ? kc.swatch(f.color) : '';
    if (f.dup) {
      prev.className = 'bqx-sh-preview is-dup';
      prev.innerHTML = `${sw}<span>${_esc(_bqxPfFill(t.dup, { v: _bqxVarName(f.dup), n: t.pieces(Math.max(0, +f.dup.stock || 0)) }))}</span>`;
    } else {
      prev.className = 'bqx-sh-preview';
      const what = [f.color ? _bqxColorName(f.color) : t.colorNone, f.size].join(' · ');
      prev.innerHTML = `${sw}<span><b>${_esc(what)}</b>${f.stock.n != null ? ` · ${_esc(t.pieces(f.stock.n))}` : ''}${f.typed ? '' : ` <small>${_esc(t.sizeTu)}</small>`}</span>`;
    }
    if (go) go.disabled = !!f.dup;
  };
  b.querySelectorAll('[data-bqx-size]').forEach((c) => c.addEventListener('click', () => {
    sizeIn.value = c.getAttribute('data-bqx-size');
    paint();
  }));
  _bqxWireStep(b, stockIn, 0, 999999, () => { _bqxVaSay(b, 'stock', ''); paint(); });
  const picker = b.querySelector('[data-kc-picker]');
  if (picker) picker.addEventListener('kc:change', () => { _bqxVaSay(b, 'color', ''); paint(); });
  if (sizeIn) sizeIn.addEventListener('input', paint);
  if (stockIn) stockIn.addEventListener('input', () => { _bqxVaSay(b, 'stock', ''); paint(); });
  b.querySelectorAll('[data-bqx-vbc]').forEach((r) => r.addEventListener('change', paint));
  b.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.matches && e.target.matches('input.bqx-pf-in')) {
      e.preventDefault();
      handlers['bqx-var-add-save'](null, pid);
    }
  });
  paint();
}
handlers['bqx-var-add-save'] = (_el, arg) => {
  const t = _bqxShT();
  const b = _bqxModal && _bqxModal.el;
  if (!b || !b.isConnected || !b.querySelector('[data-bqx-va]')) return;
  const f = _bqxVaRead(b, arg);
  let first = null;
  if (!f.color) {
    _bqxVaSay(b, 'color', t.colorErr);
    first = first || b.querySelector('[data-kc-picker] [data-kc-color]');
  }
  if (f.stock.n == null) {
    _bqxVaSay(b, 'stock', f.stock.empty ? t.stockEmpty : t.stockBad);
    first = first || b.querySelector('[data-bqx-vstock]');
  }
  if (first) { first.focus(); return; }
  if (f.dup) return;
  const res = CAT().ensureVariant({
    productId: arg, colorId: f.color.id, colorLabel: f.color.label, colorHex: f.color.hex,
    size: f.size, stock: f.stock.n, note: f.note,
  });
  if (!res || !res.variant) { toast(t.addFail, { type: 'warn' }); return; }
  if (!res.created) {
    /* Created meanwhile on another device: show it as the existing variant. */
    const s = b.querySelector('[data-bqx-vsize]');
    if (s) s.dispatchEvent(new Event('input'));
    return;
  }
  const code = f.bc === 'gen' ? CAT().generateBarcode(res.variant.id) : null;
  if (_bqxModal) _bqxModal.close();
  toast(t.addDone, {
    desc: [_bqxVarName(res.variant), t.pieces(f.stock.n), code ? t.addCode : ''].filter(Boolean).join(' · '),
    type: 'success', duration: 2400,
  });
};

/* Recolorer une variante existante. Elle garde son stock, ses codes-barres et
   son identité — deux variantes qui tombent sur la même famille restent deux
   articles distincts tant qu'un humain n'a pas décidé le contraire. */
handlers['bqx-var-color'] = (_el, arg) => {
  const t = _bqxShT();
  const v = (CAT().listVariants(_bqxDrawerPid) || []).find((x) => x.id === arg);
  if (!v) return;
  _bqxCss();
  const data = CAT().getProduct(_bqxDrawerPid);
  const custom = /^custom-[0-9a-f]{6}$/i.test(String(v.colorId || ''));
  const shown = _bqxShownColor(v);
  const selected = /^custom-/i.test(v.colorId || '')
    ? { id: v.colorId, label: v.colorLabel, hex: v.colorHex, custom: true }
    : _bqxFam(v);
  const selectedSwatch = window.KiwiColors && window.KiwiColors.swatch
    ? window.KiwiColors.swatch(shown) : '';
  _bqxModal = modal({
    title: t.colorTitle, tag: data ? data.product.name : '',
    desc: _esc(_bqxPfFill(t.colorFor, { size: v.size })),
    width: 520,
    body: `
      <div class="bqx-color-edit">
        <section class="bqx-color-card">
          <div class="bqx-color-head">
            <div class="bqx-color-heading"><span><strong>${_esc(t.colorPick)}</strong><small>${_esc(_bqxTillReads() ? t.colorPickSubTill : t.colorPickSubInv)}</small></span></div>
            <div class="bqx-color-selected" aria-live="polite"><span data-bqx-vpreview>${selectedSwatch}</span><span data-bqx-vselected>${_esc(_bqxColorName(shown))}</span></div>
          </div>
          <div class="bqx-color-picker">${_colorPicker(selected, { label: t.color })}</div>
        </section>
        <section class="bqx-color-field" data-bqx-vcname-wrap ${custom ? '' : 'hidden'}>
          <div class="kf-group"><label class="kf-label" for="bqx-vcname">${_esc(t.colorName)}</label>
            <input class="kf-input" id="bqx-vcname" maxlength="40" value="${custom ? _esc(v.colorLabel || '') : ''}" data-bqx-vcname placeholder="${_esc(t.colorNamePh)}" autocomplete="off" />
            <div class="kf-help">${_esc(t.colorNameHint)}</div></div>
        </section>
        <section class="bqx-color-field">
          <div class="kf-group"><label class="kf-label" for="bqx-vcnote"><span>${_esc(t.colorDetail)}</span><span class="bqx-color-optional">${_esc(t.optionalCap)}</span></label>
            <input class="kf-input" id="bqx-vcnote" maxlength="60" value="${_esc(v.note || '')}" data-bqx-vcnote placeholder="${_esc(t.colorDetailPh)}" autocomplete="off" />
            <div class="kf-help">${_esc(t.colorDetailHint)}</div></div>
        </section>
        <div class="bqx-color-safe">${_bqxIc('verified_user', 15)}<span>${_esc(t.colorSafe)}</span></div>
      </div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-var-color-save" data-arg="${_esc(arg)}">${_esc(t.colorSave)}</button>`,
  });
  const b = (_bqxModal && _bqxModal.el) || document.querySelector('.kiwi-backdrop');
  const modalPanel = b && b.querySelector('.kiwi-modal');
  if (modalPanel) modalPanel.classList.add('bqx-color-modal');
  const picker = b && b.querySelector('[data-kc-picker]');
  const nameWrap = b && b.querySelector('[data-bqx-vcname-wrap]');
  const nameInput = b && b.querySelector('[data-bqx-vcname]');
  const selectedLabel = b && b.querySelector('[data-bqx-vselected]');
  const selectedPreview = b && b.querySelector('[data-bqx-vpreview]');
  const syncName = (event) => {
    const color = window.KiwiColors && window.KiwiColors.selection(b);
    const isCustom = !!(color && color.custom);
    const customApplied = !!(event && event.detail && event.detail.custom);
    if (nameWrap) nameWrap.hidden = !isCustom;
    if (selectedLabel) selectedLabel.textContent = color ? _bqxColorName(color) : t.colorNoSel;
    if (selectedPreview) selectedPreview.innerHTML = color && window.KiwiColors.swatch
      ? window.KiwiColors.swatch(color) : '';
    if (isCustom && nameInput && (customApplied || nameInput.dataset.colorId !== color.id)) {
      nameInput.value = /^Couleur personnalisée\s+#[0-9a-f]{6}$/i.test(String(color.label || '')) ? '' : (color.label || '');
      nameInput.dataset.colorId = color.id;
    }
  };
  const syncTypedName = () => {
    const color = window.KiwiColors && window.KiwiColors.selection(b);
    if (!color || !color.custom || !selectedLabel) return;
    selectedLabel.textContent = nameInput.value.trim() || _bqxColorName(color);
  };
  if (nameInput && custom) nameInput.dataset.colorId = v.colorId;
  if (picker) picker.addEventListener('kc:change', syncName);
  if (nameInput) nameInput.addEventListener('input', syncTypedName);
  syncName();
};
handlers['bqx-var-color-save'] = (_el, arg) => {
  const t = _bqxShT();
  const b = (_bqxModal && _bqxModal.el && _bqxModal.el.isConnected) ? _bqxModal.el : document.querySelector('.kiwi-backdrop');
  if (!b) return;
  let color = window.KiwiColors && window.KiwiColors.selection(b);
  const name = String((b.querySelector('[data-bqx-vcname]') || {}).value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (color && color.custom && name) color = Object.assign({}, color, { label: name });
  const note = (b.querySelector('[data-bqx-vcnote]') || {}).value || '';
  let renamed = 0;
  CAT().batch(() => {
    CAT().updateVariant(arg, { colorId: color ? color.id : undefined, colorLabel: color && color.label, colorHex: color && color.hex, note: note.trim() });
    if (color && color.custom && name) renamed = CAT().renameColor(color.id, name);
  });
  if (_bqxModal) _bqxModal.close();
  toast(t.colorDone, { desc: renamed > 1 ? t.colorRenamed(renamed) : '', type: 'success', duration: 2000 });
};

/* Order Pro is a paid add-on and a PUBLIC surface — its entry point only exists
   once an operator switched it on for this merchant. */
function _orderProOn() {
  try { return !!(window.KiwiOrderProPanel && window.KiwiOrderProPanel.enabled()); }
  catch (_) { return false; }
}

/* ── product photo OR video ──────────────────────────────────────────────────
   Same deal as a menu item: a garment sells on movement, so a boutique gets a
   clip as well as a still. One medium per product (a video supersedes a photo
   and vice-versa) so the card can never show two competing things.

   Storage is R2 via KiwiOrderPro.uploadMedia and we keep the URL only: the
   catalogue lives in localStorage, where a base64 image would burn the whole
   quota in a handful of products. If media storage isn't enabled on the
   account yet the form says so instead of failing mute.

   Where each one shows, read from the code rather than promised: the photo on
   the inventory grid, on the till of the trades that read this catalogue
   (pos-boutique draws `p.photo`) and, with Order Pro, on the shopper's phone.
   A video is drawn by the phone menu alone. The form used to tell every store
   « Visible par vos clients sur le téléphone », Order Pro or not, and offered
   a video picker to stores where a video shows nowhere: it is now offered
   only with Order Pro (or to remove one that is already there). */
let _bqxPhoto = '';
let _bqxVideo = '';

/* ── Fiche produit · création et modification ────────────────────────────────
 * One form for both gestures, in FR, EN and AR. 2026-10-12, what it replaced:
 *  · the price went through parseInt, so 29,90 MAD (the till writes centimes,
 *    bqMoney) came back at 29 the first time someone changed the photo here;
 *  · a cleared price saved the article at 0 MAD, a cleared name kept the old
 *    one without a word, and « Nom requis » was a toast far from the field;
 *  · « Prix vente (MAD) » carried the unit in the label, the selects were cut
 *    to « …ans taille) » on a phone, and « ·Sans catégorie » kept the stray
 *    dot of a dash that had been removed;
 *  · every word was French under English and Arabic. */
const _BQX_PF = {
  fr: {
    titleNew: 'Nouveau produit', titleEdit: 'Modifier le produit', tagInv: 'INVENTAIRE',
    descBoutique: 'Créez le produit, puis ajoutez ses variantes couleur × taille et leurs codes-barres.',
    descOther: 'Créez le produit, puis ajoutez ses déclinaisons et leurs codes-barres.',
    descEdit: 'Les variantes, le stock et les codes-barres se gèrent sur la fiche du produit.',
    secItem: 'Article', secPrice: 'Prix', secAb: 'Catégorie A / B',
    name: 'Nom du produit', nameErr: 'Donnez un nom au produit.',
    phBoutique: 'Ex. Caftan brodé main', phMaison: 'Ex. Vase en terre cuite 30 cm', phOther: 'Ex. Article',
    cat: 'Catégorie', catNone: 'Sans catégorie', catTill: 'Elle devient le rayon de la caisse.',
    kind: 'Déclinaison',
    kindsBoutique: { taille: ['Vêtement', 'Tailles S à XL'], pointure: ['Chaussure', 'Pointures'], tu: ['Taille unique', 'Sans taille'] },
    kindsOther: { tu: ['Pièce unique', 'Sans taille'], taille: ['Formats', 'S · M · L'], pointure: ['Pointure', 'Pointures'] },
    price: 'Prix de vente', priceErr: 'Indiquez le prix de vente.', priceZero: 'Le prix de vente doit être supérieur à 0.',
    moneyBad: 'Écrivez un montant, par exemple 149,90.',
    cost: 'Coût d’achat', optional: 'facultatif',
    gap: 'Prix moins coût : {gap} MAD, soit {pct} % du prix de vente.',
    gapNeg: 'Le coût dépasse le prix de vente de {gap} MAD.',
    gapNone: 'Ajoutez le coût d’achat pour voir l’écart avec le prix de vente.',
    abA: 'Catégorie A', abB: 'Catégorie B',
    abErr: 'Choisissez la catégorie A ou B.',
    consignor: 'Propriétaire de la marchandise', phConsignor: 'Ex. Baobab Collection',
    sku: 'Référence commune', phSku: 'Ex. JEAN-501',
    skuHint: 'La même référence dans vos deux établissements, et la caisse saura dire « il en reste 3 à l’autre boutique » même si les étiquettes diffèrent. Majuscules, tirets et espaces sont ignorés.',
    media: 'Photo ou vidéo', mediaOne: 'Photo', addPhoto: 'Ajouter une photo', addVideo: 'Ajouter une vidéo',
    newPhoto: 'Changer de photo', newVideo: 'Changer de vidéo', removeMedia: 'Retirer',
    whereTillPhone: 'La photo s’affiche dans l’inventaire, sur la caisse et sur le téléphone de vos clients.',
    whereTill: 'La photo s’affiche dans l’inventaire et sur la caisse.',
    wherePhone: 'La photo s’affiche dans l’inventaire et sur le téléphone de vos clients.',
    whereInv: 'La photo s’affiche dans l’inventaire.',
    videoNote: 'Une vidéo remplace la photo et ne se voit que sur le téléphone de vos clients.',
    videoHere: 'Cette vidéo ne se voit que sur le téléphone de vos clients, avec Order Pro.',
    mediaOff: 'Le stockage des photos n’est pas encore activé sur votre compte.',
    sending: 'Envoi…', sendFail: 'Envoi impossible, réessayez.',
    cancel: 'Annuler', create: 'Créer le produit', save: 'Enregistrer',
    created: 'Produit créé', createdBoutique: 'Ajoutez maintenant ses variantes couleur × taille.', createdOther: 'Ajoutez maintenant ses déclinaisons.',
    updated: 'Produit mis à jour',
  },
  en: {
    titleNew: 'New product', titleEdit: 'Edit product', tagInv: 'INVENTORY',
    descBoutique: 'Create the product, then add its colour × size variants and their barcodes.',
    descOther: 'Create the product, then add its variants and their barcodes.',
    descEdit: 'Variants, stock and barcodes are managed on the product sheet.',
    secItem: 'Item', secPrice: 'Price', secAb: 'Category A / B',
    name: 'Product name', nameErr: 'Give the product a name.',
    phBoutique: 'E.g. Hand-embroidered caftan', phMaison: 'E.g. Terracotta vase 30 cm', phOther: 'E.g. Item',
    cat: 'Category', catNone: 'No category', catTill: 'It becomes the till’s shelf.',
    kind: 'Variants by',
    kindsBoutique: { taille: ['Clothing', 'Sizes S to XL'], pointure: ['Shoes', 'Shoe sizes'], tu: ['One size', 'No size'] },
    kindsOther: { tu: ['Single piece', 'No size'], taille: ['Formats', 'S · M · L'], pointure: ['Shoe size', 'Shoe sizes'] },
    price: 'Selling price', priceErr: 'Enter the selling price.', priceZero: 'The selling price must be above 0.',
    moneyBad: 'Enter an amount, for example 149.90.',
    cost: 'Purchase cost', optional: 'optional',
    gap: 'Price minus cost: {gap} MAD, {pct}% of the selling price.',
    gapNeg: 'The cost is {gap} MAD above the selling price.',
    gapNone: 'Add the purchase cost to see the gap with the selling price.',
    abA: 'Category A', abB: 'Category B',
    abErr: 'Choose category A or B.',
    consignor: 'Owner of the goods', phConsignor: 'E.g. Baobab Collection',
    sku: 'Shared reference', phSku: 'E.g. JEAN-501',
    skuHint: 'Use the same reference in both of your stores and the till can say “3 left at the other shop” even when the labels differ. Capitals, hyphens and spaces are ignored.',
    media: 'Photo or video', mediaOne: 'Photo', addPhoto: 'Add a photo', addVideo: 'Add a video',
    newPhoto: 'Change photo', newVideo: 'Change video', removeMedia: 'Remove',
    whereTillPhone: 'The photo shows in the inventory, on the till and on your customers’ phones.',
    whereTill: 'The photo shows in the inventory and on the till.',
    wherePhone: 'The photo shows in the inventory and on your customers’ phones.',
    whereInv: 'The photo shows in the inventory.',
    videoNote: 'A video replaces the photo and only shows on your customers’ phones.',
    videoHere: 'This video only shows on your customers’ phones, with Order Pro.',
    mediaOff: 'Photo storage isn’t switched on for your account yet.',
    sending: 'Uploading…', sendFail: 'Upload failed, try again.',
    cancel: 'Cancel', create: 'Create product', save: 'Save',
    created: 'Product created', createdBoutique: 'Now add its colour × size variants.', createdOther: 'Now add its variants.',
    updated: 'Product updated',
  },
  ar: {
    titleNew: 'منتج جديد', titleEdit: 'تعديل المنتج', tagInv: 'المخزون',
    descBoutique: 'أنشئ المنتج، ثم أضف متغيّرات اللون × المقاس ورموزها الشريطية.',
    descOther: 'أنشئ المنتج، ثم أضف متغيّراته ورموزها الشريطية.',
    descEdit: 'تُدار المتغيّرات والمخزون والرموز الشريطية من بطاقة المنتج.',
    secItem: 'السلعة', secPrice: 'السعر', secAb: 'الفئة A / B',
    name: 'اسم المنتج', nameErr: 'أدخل اسماً للمنتج.',
    phBoutique: 'مثال: قفطان مطرّز يدوياً', phMaison: 'مثال: مزهرية فخارية 30 سم', phOther: 'مثال: سلعة',
    cat: 'الفئة', catNone: 'بدون فئة', catTill: 'تصبح رفّاً في الصندوق.',
    kind: 'التنويع حسب',
    kindsBoutique: { taille: ['ملابس', 'المقاسات من S إلى XL'], pointure: ['أحذية', 'مقاسات الأحذية'], tu: ['مقاس واحد', 'بدون مقاس'] },
    kindsOther: { tu: ['قطعة واحدة', 'بدون مقاس'], taille: ['أحجام', 'S · M · L'], pointure: ['مقاس الحذاء', 'مقاسات الأحذية'] },
    price: 'سعر البيع', priceErr: 'أدخل سعر البيع.', priceZero: 'يجب أن يكون سعر البيع أكبر من 0.',
    moneyBad: 'أدخل مبلغاً، مثلاً 149,90.',
    cost: 'تكلفة الشراء', optional: 'اختياري',
    gap: 'السعر ناقص التكلفة: {gap} درهم، أي {pct}٪ من سعر البيع.',
    gapNeg: 'التكلفة تتجاوز سعر البيع بـ {gap} درهم.',
    gapNone: 'أضف تكلفة الشراء لترى الفرق مع سعر البيع.',
    abA: 'الفئة A', abB: 'الفئة B',
    abErr: 'اختر الفئة A أو B.',
    consignor: 'مالك البضاعة', phConsignor: 'مثال: Baobab Collection',
    sku: 'المرجع المشترك', phSku: 'مثال: JEAN-501',
    skuHint: 'استعمل المرجع نفسه في متجريك، فيستطيع الصندوق أن يقول «بقيت 3 في المتجر الآخر» حتى لو اختلفت الملصقات. لا تُحتسب الأحرف الكبيرة والشَّرطات والمسافات.',
    media: 'صورة أو فيديو', mediaOne: 'صورة', addPhoto: 'إضافة صورة', addVideo: 'إضافة فيديو',
    newPhoto: 'تغيير الصورة', newVideo: 'تغيير الفيديو', removeMedia: 'إزالة',
    whereTillPhone: 'تظهر الصورة في المخزون وعلى الصندوق وعلى هواتف زبائنك.',
    whereTill: 'تظهر الصورة في المخزون وعلى الصندوق.',
    wherePhone: 'تظهر الصورة في المخزون وعلى هواتف زبائنك.',
    whereInv: 'تظهر الصورة في المخزون.',
    videoNote: 'يحلّ الفيديو محلّ الصورة ولا يظهر إلا على هواتف زبائنك.',
    videoHere: 'لا يظهر هذا الفيديو إلا على هواتف زبائنك، مع Order Pro.',
    mediaOff: 'تخزين الصور غير مفعّل في حسابك بعد.',
    sending: 'جارٍ الإرسال…', sendFail: 'تعذّر الإرسال، أعد المحاولة.',
    cancel: 'إلغاء', create: 'إنشاء المنتج', save: 'حفظ',
    created: 'تم إنشاء المنتج', createdBoutique: 'أضف الآن متغيّرات اللون × المقاس.', createdOther: 'أضف الآن متغيّراته.',
    updated: 'تم تحديث المنتج',
  },
};
function _bqxPfLang() {
  const l = (window.KiwiI18n && window.KiwiI18n.getLang && window.KiwiI18n.getLang()) || 'fr';
  return _BQX_PF[l] ? l : 'fr';
}
function _bqxPfT() { return _BQX_PF[_bqxPfLang()]; }
function _bqxPfFill(s, o) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : '')); }

/* Prices are kept to the centime. The till writes 29,90 (bqMoney); the grid,
   the sheet and the label printed 30, and this form saved 29. */
function _bqxPrice(n) {
  const v = Math.round((+n || 0) * 100) / 100;
  return Number.isInteger(v) ? _mad(v) : _mad2(v);
}
/* What the merchant typed, read the way they wrote it: « 149,90 », « 149.90 »,
   « 1 890 », Arabic-Indic digits. Anything else is refused, never guessed: a
   « 1.890 » could be 1 890 or 1,89 and is sent back to be rewritten. */
function _bqxMoneyIn(raw) {
  let s = String(raw == null ? '' : raw)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\u066B/g, '.')
    .replace(/MAD|DH|درهم/gi, '')
    .replace(/[\s\u00a0\u202F\u066C']/g, '');
  if (!s) return { empty: true };
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { bad: true };
  return { n: Math.round(parseFloat(s) * 100) / 100 };
}
function _bqxMoneyVal(n) {
  const v = Math.round((+n || 0) * 100) / 100;
  if (!v) return '';
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return _bqxPfLang() === 'en' ? s : s.replace('.', ',');
}

/* Material Symbols (Outlined 400), copied byte for byte from
   assets/icons/material/ (add_photo_alternate.svg, videocam.svg, delete.svg). */
const _BQX_PF_ICON = {
  photo: 'M480-480ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320v80H200v560h560v-320h80v320q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Zm440-320v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z',
  video: 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h480q33 0 56.5 23.5T720-720v180l160-160v440L720-420v180q0 33-23.5 56.5T640-160H160Zm0-80h480v-480H160v480Zm0 0v-480 480Z',
  del: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
};
function _bqxPfIcon(k) {
  return `<svg viewBox="0 -960 960 960" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false"><path d="${_BQX_PF_ICON[k]}"/></svg>`;
}

function _bqxPfCss() {
  if (document.getElementById('bqx-pf-css')) return;
  const st = document.createElement('style');
  st.id = 'bqx-pf-css';
  st.textContent = `
    .kiwi-backdrop.bqx-pf-modal .kiwi-modal.kiwi-modal { --pf-bg: var(--paper); --pf-card: color-mix(in srgb, var(--paper) 55%, #fff); --pf-field: var(--paper); background: var(--pf-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border: 1px solid var(--n-200); }
    html[data-theme="dark"] .kiwi-backdrop.bqx-pf-modal .kiwi-modal.kiwi-modal,
    body[data-vexel-mode="dark"] .kiwi-backdrop.bqx-pf-modal .kiwi-modal.kiwi-modal { --pf-bg: #0F1512; --pf-card: #151C18; --pf-field: #0B100E; }
    .kiwi-backdrop.bqx-pf-modal .kiwi-modal-foot.kiwi-modal-foot { background: var(--pf-bg) !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; border-top: 1px solid var(--n-200); }
    .bqx-pf { display: grid; grid-template-columns: minmax(0, 1fr) 248px; gap: 18px; align-items: start; color: var(--ink); }
    .bqx-pf-main { display: grid; gap: 14px; min-width: 0; }
    .bqx-pf-sec { min-width: 0; padding: 16px 18px 4px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--pf-card); }
    .bqx-pf-sec > h4 { margin: 0 0 12px; font: 600 14.5px var(--sans); letter-spacing: -0.01em; color: var(--ink); }
    .bqx-pf-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0 12px; align-items: start; }
    .bqx-pf .bqx-pf-f { display: grid; grid-template-columns: minmax(0, 1fr); gap: 5px; align-content: start; min-width: 0; margin: 0 0 14px; }
    .bqx-pf-l { display: flex; align-items: baseline; gap: 6px; font-size: 12px; font-weight: 600; color: var(--n-600); }
    .bqx-pf-tag { font-size: 11px; font-weight: 500; color: var(--n-400, var(--n-500)); }
    .bqx-pf-in { box-sizing: border-box; width: 100%; height: 40px; padding: 0 12px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--ink); font: 500 13.5px var(--sans); transition: border-color 140ms, box-shadow 140ms; }
    .bqx-pf-in::placeholder { color: var(--n-400, var(--n-500)); font-weight: 400; }
    .bqx-pf-in:focus { outline: 0; border-color: var(--atlas); box-shadow: 0 0 0 3px color-mix(in srgb, var(--atlas) 16%, transparent); }
    .bqx-pf-in[aria-invalid="true"] { border-color: var(--danger, #cb5238); box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger, #cb5238) 14%, transparent); }
    .kiwi-backdrop.bqx-pf-modal .bqx-pf .kiwi-select-trigger { min-height: 40px; padding: 0 10px 0 12px; padding-inline: 12px 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); box-shadow: none; font: 500 13.5px var(--sans); }
    .bqx-pf-hint { font-size: 11.5px; line-height: 1.45; color: var(--n-500); }
    .bqx-pf-err { font-size: 11.5px; font-weight: 600; line-height: 1.35; color: var(--danger, #cb5238); }
    .bqx-pf-err[hidden], .bqx-pf [hidden] { display: none; }
    .bqx-pf-money { position: relative; display: block; }
    .bqx-pf-money .bqx-pf-in { padding-inline-end: 50px; font-variant-numeric: tabular-nums; }
    .bqx-pf-unit { position: absolute; inset-inline-end: 12px; top: 50%; transform: translateY(-50%); font: 500 12px var(--sans); color: var(--n-500); pointer-events: none; }
    .bqx-pf-gap { margin: -4px 0 14px; font-size: 12px; line-height: 1.45; color: var(--n-600); font-variant-numeric: tabular-nums; }
    .bqx-pf-gap.is-neg { color: var(--danger, #cb5238); font-weight: 600; }
    .bqx-pf-gap.is-none { color: var(--n-500); }
    .bqx-pf-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; }
    .bqx-pf-choice { position: relative; display: grid; gap: 2px; min-width: 0; padding: 10px 12px; padding-inline-start: 36px; border: 1px solid var(--n-200); border-radius: 12px; background: var(--pf-field); cursor: pointer; transition: border-color 140ms, box-shadow 140ms; }
    .bqx-pf-choice input { position: absolute; inset-inline-start: 12px; top: 12px; width: 16px; height: 16px; margin: 0; accent-color: var(--atlas); cursor: pointer; }
    .bqx-pf-choice b { font: 600 13px/1.3 var(--sans); color: var(--ink); }
    .bqx-pf-choice small { font-size: 11.5px; line-height: 1.35; color: var(--n-500); }
    .bqx-pf-choice:hover { border-color: color-mix(in srgb, var(--atlas) 50%, var(--n-200)); }
    .bqx-pf-choice:has(input:checked) { border-color: var(--atlas); box-shadow: inset 0 0 0 1px var(--atlas); }
    .bqx-pf-choice:has(input:focus-visible) { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .bqx-pf-choices[aria-invalid="true"] .bqx-pf-choice { border-color: var(--danger, #cb5238); }
    .bqx-pf-side { position: sticky; top: 0; display: grid; gap: 12px; min-width: 0; }
    .bqx-pf-card { padding: 12px; border: 1px solid var(--n-200); border-radius: 14px; background: var(--pf-card); }
    .bqx-pf-thumb { display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; border-radius: 10px; background: color-mix(in srgb, var(--tint, #9AA09D) 14%, var(--pf-field)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tint, #9AA09D) 12%, var(--n-200)); }
    .bqx-pf-thumb img, .bqx-pf-thumb video { display: block; width: 100%; height: 100%; object-fit: cover; }
    .bqx-pf-thumb .bqx-ini { font-size: 30px; }
    .bqx-pf-pn { margin: 10px 2px 0; font: 600 14.5px/1.3 var(--sans); letter-spacing: -0.01em; color: var(--ink); overflow-wrap: anywhere; }
    .bqx-pf-pn.is-empty { font-weight: 500; color: var(--n-400, var(--n-500)); }
    .bqx-pf-pm { display: flex; align-items: center; gap: 6px; margin: 3px 2px 0; font-size: 12px; color: var(--n-500); }
    .bqx-pf-pm .bqx-dot { background: var(--cat, #9AA09D); }
    .bqx-pf-pp { margin: 8px 2px 2px; font: 600 18px/1 var(--sans); letter-spacing: -0.015em; color: var(--ink); font-variant-numeric: tabular-nums; }
    .bqx-pf-pp small { font-size: 11px; font-weight: 500; letter-spacing: 0; color: var(--n-500); }
    .bqx-pf-pp.is-empty { color: var(--n-400, var(--n-500)); }
    .bqx-pf-macts { display: grid; gap: 6px; margin-top: 12px; }
    .bqx-pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 10px; border: 1px solid var(--n-200); border-radius: 10px; background: var(--pf-field); color: var(--n-700); font: 500 12.5px var(--sans); cursor: pointer; transition: border-color 140ms, color 140ms; }
    .bqx-pf-btn:hover { border-color: var(--atlas); color: var(--atlas); }
    .bqx-pf-btn:focus-visible { outline: 2px solid var(--atlas); outline-offset: 2px; }
    .bqx-pf-btn.is-del:hover { border-color: var(--danger, #cb5238); color: var(--danger, #cb5238); }
    .bqx-pf-btn:disabled { opacity: .55; cursor: progress; }
    .bqx-pf-mhint { margin: 10px 2px 0; font-size: 11.5px; line-height: 1.45; color: var(--n-500); }
    .bqx-pf-mmsg { margin: 6px 2px 0; font-size: 11.5px; font-weight: 600; line-height: 1.4; color: var(--n-700); }
    .bqx-pf-mmsg:empty { display: none; }
    @media (max-width: 760px) {
      .bqx-pf { grid-template-columns: 1fr; }
      .bqx-pf-side { position: static; }
      .bqx-pf-card { display: grid; grid-template-columns: 112px minmax(0, 1fr); column-gap: 12px; align-items: start; }
      .bqx-pf-thumb { grid-row: span 3; aspect-ratio: 1; }
      .bqx-pf-pn { margin-top: 2px; }
      .bqx-pf-macts, .bqx-pf-mhint, .bqx-pf-mmsg { grid-column: 1 / -1; }
      .bqx-pf-macts { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
    }
    @media (max-width: 560px) {
      .bqx-pf-grid { grid-template-columns: 1fr; }
      .bqx-pf-in, .kiwi-backdrop.bqx-pf-modal .bqx-pf .kiwi-select-trigger { font-size: 16px; }
      .bqx-pf-sec { padding: 14px 14px 2px; }
    }
  `;
  document.head.appendChild(st);
}

function _bqxMediaPreview() {
  if (_bqxVideo) return `<video src="${_esc(_bqxVideo)}" muted playsinline preload="metadata"></video>`;
  if (_bqxPhoto) return `<img src="${_esc(_bqxPhoto)}" alt="" />`;
  return '';
}
/* A video picker only where a video shows (Order Pro), or to take one out. */
function _bqxMediaActions() {
  const t = _bqxPfT();
  const has = _bqxPhoto || _bqxVideo;
  const videoOk = _orderProOn() || !!_bqxVideo;
  return `
    <button class="bqx-pf-btn" type="button" data-bqx-pick="photo">${_bqxPfIcon('photo')}<span>${_esc(_bqxPhoto ? t.newPhoto : t.addPhoto)}</span></button>
    ${videoOk ? `<button class="bqx-pf-btn" type="button" data-bqx-pick="video">${_bqxPfIcon('video')}<span>${_esc(_bqxVideo ? t.newVideo : t.addVideo)}</span></button>` : ''}
    ${has ? `<button class="bqx-pf-btn is-del" type="button" data-bqx-media-del>${_bqxPfIcon('del')}<span>${_esc(t.removeMedia)}</span></button>` : ''}`;
}
function _bqxMediaHint() {
  const t = _bqxPfT();
  if (_bqxVideo) return t.videoHere;
  const till = _bqxTillReads(), phone = _orderProOn();
  const where = till && phone ? t.whereTillPhone : till ? t.whereTill : phone ? t.wherePhone : t.whereInv;
  return phone ? `${where} ${t.videoNote}` : where;
}
/* ── La référence commune ────────────────────────────────────────────────────
 * Ce que le propriétaire pose UNE fois pour dire « le jean de Casa et le jean
 * de Rabat sont le même article ». Les deux magasins tiennent deux catalogues
 * séparés ; sans elle, le seul lien est le code-barres, et une étiquette
 * imprimée par Kiwi ne vaut rien en dehors du magasin qui l'a imprimée.
 *
 * Caché sur un compte à magasin unique : un champ dont l'utilité tient à
 * l'existence d'un second magasin n'a rien à faire sur l'écran de celui qui
 * n'en a qu'un. Il ne saurait pas quoi y mettre, et le remplirait au hasard.
 * La valeur DÉJÀ posée reste en base et ressort le jour où il ouvre le second
 * (voir le `undefined` à l'enregistrement). */
function _bqxSkuField(sku) {
  if (_bqxSoleStore()) return '';
  const t = _bqxPfT();
  return `
    <label class="bqx-pf-f">
      <span class="bqx-pf-l">${_esc(t.sku)}<span class="bqx-pf-tag">${_esc(t.optional)}</span></span>
      <input class="bqx-pf-in" value="${_esc(sku || '')}" data-bqx-esku placeholder="${_esc(t.phSku)}" maxlength="48" autocomplete="off" spellcheck="false" />
      <span class="bqx-pf-hint">${_esc(t.skuHint)}</span>
    </label>`;
}

/* ── Catégorie A / B : à qui appartient la marchandise ───────────────────────
 * A = achetée ferme, c'est le stock du magasin et la vente est sa recette.
 * B = dépôt-vente, vendue pour le compte d'un tiers : la vente est enregistrée
 * en entier (ticket, journal, stock), mais le montant ne compte pas dans sa
 * recette. C'est une PROPRIÉTÉ de l'article, pas un rayon : elle se pose à la
 * création, parce qu'après coup personne ne repasse sur un catalogue.
 *
 * Aucune option n'est pré-cochée à la création : un défaut silencieux ferait
 * entrer toute la marchandise d'un tiers dans le chiffre d'affaires du magasin
 * sans que personne ait rien décidé. Le choix est donc explicite, une fois.
 * La catégorie se NOMME, elle ne s'explique pas (décision de la patronne,
 * 2026-08-19, gardée par pos-maison-test) : les cartes disent « Catégorie A »
 * et « Catégorie B », rien sur la recette. */
/* L'option est posée par l'opérateur Kiwi, commerce par commerce
   (kiwi-admin.html › Modules → « Dépôt-vente »). Comparaison stricte, comme
   Order Pro : clé absente, backend injoignable, réponse vide → NON. Éteinte,
   le formulaire ne pose pas la question et la création n'exige rien. */
function _bqxAbOn() {
  try { return !!(window.KiwiConfig && window.KiwiConfig.features
    && window.KiwiConfig.features.depotvente === true); } catch (_) { return false; }
}
function _bqxAbField(p) {
  if (!_bqxAbOn()) return '';
  const own = p ? (p.ownership === 'consignment' ? 'consignment' : 'outright') : '';
  const who = p ? (p.consignor || '') : '';
  const t = _bqxPfT();
  return `
    <section class="bqx-pf-sec">
      <h4>${_esc(t.secAb)}</h4>
      <div class="bqx-pf-f">
        <div class="bqx-pf-choices" role="radiogroup" aria-label="${_esc(t.secAb)}" data-bqx-ab-group>
          <label class="bqx-pf-choice"><input type="radio" name="bqx-ab" value="outright" ${own === 'outright' ? 'checked' : ''} data-bqx-ab />
            <b>${_esc(t.abA)}</b></label>
          <label class="bqx-pf-choice"><input type="radio" name="bqx-ab" value="consignment" ${own === 'consignment' ? 'checked' : ''} data-bqx-ab />
            <b>${_esc(t.abB)}</b></label>
        </div>
        <span class="bqx-pf-err" data-bqx-pf-err="ab" hidden>${_esc(t.abErr)}</span>
      </div>
      <label class="bqx-pf-f" data-bqx-ab-who ${own === 'consignment' ? '' : 'hidden'}>
        <span class="bqx-pf-l">${_esc(t.consignor)}<span class="bqx-pf-tag">${_esc(t.optional)}</span></span>
        <input class="bqx-pf-in" value="${_esc(who)}" data-bqx-consignor placeholder="${_esc(t.phConsignor)}" maxlength="60" />
      </label>
    </section>`;
}
/* Révèle le nom du déposant quand B est choisie. Le champ vit dans la modale,
   donc on se raccroche au backdrop plutôt qu'au document. */
function _bqxWireAb(b) {
  b = b || document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const who = b.querySelector('[data-bqx-ab-who]');
  b.querySelectorAll('[data-bqx-ab]').forEach((r) => r.addEventListener('change', () => {
    if (who) who.hidden = !(r.checked && r.value === 'consignment');
    _bqxPfMark(b, 'ab', false);
  }));
}
/* Ce que les deux formulaires écrivent. `null` = rien de coché : l'appelant
   refuse d'enregistrer, il ne devine pas. */
function _bqxAbRead(b) {
  const picked = b.querySelector('[data-bqx-ab]:checked');
  if (!picked) return null;
  const consignment = picked.value === 'consignment';
  const who = b.querySelector('[data-bqx-consignor]');
  return {
    ownership: consignment ? 'consignment' : 'outright',
    consignor: consignment ? ((who && who.value.trim()) || '') : '',
  };
}

/* ── the form itself ─────────────────────────────────────────────────────── */
function _bqxPfBody(p, catSel) {
  const t = _bqxPfT();
  const copy = _bqxCopy();
  const boutique = copy.trade === 'boutique';
  const kinds = boutique ? t.kindsBoutique : t.kindsOther;
  const kindSel = (p && p.kind) || copy.defaultKind;
  const kindCards = copy.kindList(kindSel).map(([v, fallback]) => {
    const words = kinds[v] || [fallback, ''];
    return `<label class="bqx-pf-choice"><input type="radio" name="bqx-pf-kind" value="${_esc(v)}"${v === kindSel ? ' checked' : ''} data-bqx-kind />
      <b>${_esc(words[0])}</b>${words[1] ? `<small>${_esc(words[1])}</small>` : ''}</label>`;
  }).join('');
  const cats = CAT().listCategories();
  const catOpts = `<option value="">${_esc(t.catNone)}</option>`
    + cats.map((c) => `<option value="${_esc(c.id)}"${c.id === catSel ? ' selected' : ''}>${_esc(c.name)}</option>`).join('');
  const ph = boutique ? t.phBoutique : copy.trade === 'maison' ? t.phMaison : t.phOther;
  return `
    <div class="bqx-pf" data-bqx-pf>
      <div class="bqx-pf-main">
        <section class="bqx-pf-sec">
          <h4>${_esc(t.secItem)}</h4>
          <label class="bqx-pf-f">
            <span class="bqx-pf-l">${_esc(t.name)}</span>
            <input class="bqx-pf-in" value="${_esc(p ? p.name : '')}" placeholder="${_esc(ph)}" maxlength="120" required autocomplete="off" data-bqx-name aria-describedby="bqx-pf-e-name" />
            <span class="bqx-pf-err" id="bqx-pf-e-name" data-bqx-pf-err="name" hidden>${_esc(t.nameErr)}</span>
          </label>
          <label class="bqx-pf-f">
            <span class="bqx-pf-l">${_esc(t.cat)}</span>
            <select class="bqx-pf-in" data-bqx-cat>${catOpts}</select>
            ${_bqxTillReads() ? `<span class="bqx-pf-hint">${_esc(t.catTill)}</span>` : ''}
          </label>
          <div class="bqx-pf-f">
            <span class="bqx-pf-l" id="bqx-pf-kind-l">${_esc(t.kind)}</span>
            <div class="bqx-pf-choices" role="radiogroup" aria-labelledby="bqx-pf-kind-l">${kindCards}</div>
          </div>
        </section>
        <section class="bqx-pf-sec">
          <h4>${_esc(t.secPrice)}</h4>
          <div class="bqx-pf-grid">
            <label class="bqx-pf-f">
              <span class="bqx-pf-l">${_esc(t.price)}</span>
              <span class="bqx-pf-money"><input class="bqx-pf-in" inputmode="decimal" autocomplete="off" required value="${_esc(p ? _bqxMoneyVal(p.priceMAD) : '')}" placeholder="${_esc(copy.pricePlaceholder)}" data-bqx-price aria-describedby="bqx-pf-e-price" /><span class="bqx-pf-unit" aria-hidden="true">MAD</span></span>
              <span class="bqx-pf-err" id="bqx-pf-e-price" data-bqx-pf-err="price" hidden></span>
            </label>
            <label class="bqx-pf-f">
              <span class="bqx-pf-l">${_esc(t.cost)}<span class="bqx-pf-tag">${_esc(t.optional)}</span></span>
              <span class="bqx-pf-money"><input class="bqx-pf-in" inputmode="decimal" autocomplete="off" value="${_esc(p ? _bqxMoneyVal(p.cost) : '')}" data-bqx-cost aria-describedby="bqx-pf-e-cost" /><span class="bqx-pf-unit" aria-hidden="true">MAD</span></span>
              <span class="bqx-pf-err" id="bqx-pf-e-cost" data-bqx-pf-err="cost" hidden></span>
            </label>
          </div>
          <p class="bqx-pf-gap" data-bqx-pf-gap aria-live="polite"></p>
          ${p ? _bqxSkuField(p.sku) : ''}
        </section>
        ${p ? _bqxAbField(p) : _bqxAbField(null)}
      </div>
      <aside class="bqx-pf-side">
        <div class="bqx-pf-card" data-bqx-pf-card>
          <div class="bqx-pf-thumb" data-bqx-photo-box></div>
          <div class="bqx-pf-pn" data-bqx-pf-pn></div>
          <div class="bqx-pf-pm"><span class="bqx-dot" aria-hidden="true"></span><span data-bqx-pf-pc></span></div>
          <div class="bqx-pf-pp" data-bqx-pf-pp></div>
          <div class="bqx-pf-macts" data-bqx-photo-acts></div>
          <p class="bqx-pf-mhint" data-bqx-photo-hint></p>
          <p class="bqx-pf-mmsg" data-bqx-photo-msg role="status"></p>
          <input type="file" accept="image/*" data-bqx-photo-input hidden />
          <input type="file" accept="video/*" data-bqx-video-input hidden />
        </div>
      </aside>
    </div>`;
}

/* Show or clear one field's error. `msg` replaces the text when given. */
function _bqxPfMark(b, key, on, msg) {
  const err = b.querySelector(`[data-bqx-pf-err="${key}"]`);
  const field = key === 'ab' ? b.querySelector('[data-bqx-ab-group]') : b.querySelector(`[data-bqx-${key}]`);
  if (err) { if (msg) err.textContent = msg; err.hidden = !on; }
  if (field) { if (on) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid'); }
}
/* Reads and checks the form. Every problem is written under its field at
   once; returns null when anything is wrong, the clean values otherwise. */
function _bqxPfRead(b) {
  const t = _bqxPfT();
  const name = (b.querySelector('[data-bqx-name]').value || '').trim();
  const price = _bqxMoneyIn(b.querySelector('[data-bqx-price]').value);
  const cost = _bqxMoneyIn(b.querySelector('[data-bqx-cost]').value);
  _bqxPfMark(b, 'name', !name);
  const priceMsg = price.empty ? t.priceErr : price.bad ? t.moneyBad : !(price.n > 0) ? t.priceZero : '';
  _bqxPfMark(b, 'price', !!priceMsg, priceMsg);
  _bqxPfMark(b, 'cost', !!cost.bad, t.moneyBad);
  if (!name || priceMsg || cost.bad) return null;
  /* No card checked = the product carries a kind this trade does not list
     (retail-scan writes « unite »). Left as it is, never rewritten to the
     first card: the old select did exactly that on every save. */
  const kind = b.querySelector('[data-bqx-kind]:checked');
  return {
    name, priceMAD: price.n, cost: cost.empty ? 0 : cost.n,
    categoryId: b.querySelector('[data-bqx-cat]').value || null,
    kind: kind ? kind.value : undefined,
  };
}
/* Focus the first field the merchant has to fix, in reading order. */
function _bqxPfFail(b, extra) {
  if (extra) _bqxPfMark(b, extra, true);
  const bad = b.querySelector('.bqx-pf [aria-invalid="true"]');
  if (!bad) return;
  const target = bad.matches('input, select') ? bad : bad.querySelector('input');
  if (target) { target.focus(); if (target.scrollIntoView) target.scrollIntoView({ block: 'nearest' }); }
}

function _bqxPfWire(b, p) {
  if (!b) return;
  const t = _bqxPfT();
  _bqxPhoto = (p && p.photo) || '';
  _bqxVideo = (p && p.video) || '';
  const q = (sel) => b.querySelector(sel);
  const nameIn = q('[data-bqx-name]'), priceIn = q('[data-bqx-price]'), costIn = q('[data-bqx-cost]'), catIn = q('[data-bqx-cat]');
  const card = q('[data-bqx-pf-card]'), box = q('[data-bqx-photo-box]'), acts = q('[data-bqx-photo-acts]');
  const hint = q('[data-bqx-photo-hint]'), msg = q('[data-bqx-photo-msg]');
  const photoInput = q('[data-bqx-photo-input]'), videoInput = q('[data-bqx-video-input]');

  /* The card on the right follows the form: initials or medium, name,
     category, price, as the inventory grid will draw them. */
  const paintCard = () => {
    const name = (nameIn.value || '').trim();
    const c = catIn.value ? CAT().listCategories().find((x) => x.id === catIn.value) : null;
    const hex = c ? (_TAGHEX[c.color] || '#0B6E4F') : '#9AA09D';
    card.style.setProperty('--tint', hex);
    card.style.setProperty('--cat', hex);
    const media = _bqxMediaPreview();
    box.innerHTML = media || (name ? _bqxThumb({ name }) : '');
    const pn = q('[data-bqx-pf-pn]');
    pn.textContent = name || t.name;
    pn.classList.toggle('is-empty', !name);
    q('[data-bqx-pf-pc]').textContent = c ? c.name : t.catNone;
    const pr = _bqxMoneyIn(priceIn.value);
    const pp = q('[data-bqx-pf-pp]');
    pp.hidden = !(pr.n > 0);
    pp.innerHTML = pr.n > 0 ? `${_esc(_bqxPrice(pr.n))} <small>MAD</small>` : '';
  };
  const paintGap = () => {
    const gap = q('[data-bqx-pf-gap]');
    const pr = _bqxMoneyIn(priceIn.value), co = _bqxMoneyIn(costIn.value);
    gap.classList.remove('is-neg', 'is-none');
    if (!(pr.n > 0) || pr.bad || co.bad) { gap.textContent = ''; gap.hidden = true; return; }
    gap.hidden = false;
    if (co.empty || !(co.n > 0)) { gap.classList.add('is-none'); gap.textContent = t.gapNone; return; }
    const d = Math.round((pr.n - co.n) * 100) / 100;
    if (d < 0) { gap.classList.add('is-neg'); gap.textContent = _bqxPfFill(t.gapNeg, { gap: _bqxPrice(-d) }); return; }
    gap.textContent = _bqxPfFill(t.gap, { gap: _bqxPrice(d), pct: Math.round((d / pr.n) * 100) });
  };
  const paintMedia = () => {
    acts.innerHTML = _bqxMediaActions();
    hint.textContent = _bqxMediaHint();
    paintCard();
  };

  nameIn.addEventListener('input', () => { _bqxPfMark(b, 'name', false); paintCard(); });
  priceIn.addEventListener('input', () => { _bqxPfMark(b, 'price', false); paintCard(); paintGap(); });
  costIn.addEventListener('input', () => { _bqxPfMark(b, 'cost', false); paintGap(); });
  catIn.addEventListener('change', paintCard);
  /* Entrée enregistre, comme le bouton du pied. */
  b.querySelector('[data-bqx-pf]').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !e.target.matches('input.bqx-pf-in')) return;
    e.preventDefault();
    const go = b.querySelector('.kiwi-modal-foot [data-action="bqx-new-save"], .kiwi-modal-foot [data-action="bqx-prod-edit-save"]');
    if (go) go.click();
  });

  acts.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-bqx-pick]');
    if (pick) { (pick.dataset.bqxPick === 'video' ? videoInput : photoInput).click(); return; }
    if (e.target.closest('[data-bqx-media-del]')) { _bqxPhoto = ''; _bqxVideo = ''; msg.textContent = ''; paintMedia(); }
  });
  const upload = async (file, kind) => {
    if (!file) return;
    if (!window.KiwiOrderPro || !window.KiwiOrderPro.uploadMedia) { msg.textContent = t.mediaOff; return; }
    msg.textContent = t.sending;
    acts.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    const res = await window.KiwiOrderPro.uploadMedia(file);
    if (!b.isConnected) return;
    if (!res || !res.ok) {
      /* KiwiOrderPro.uploadError porte les chiffres (« 12 Mo, maximum 8 »). */
      msg.textContent = (window.KiwiOrderPro && window.KiwiOrderPro.uploadError)
        ? window.KiwiOrderPro.uploadError(res)
        : t.sendFail;
      acts.querySelectorAll('button').forEach((x) => { x.disabled = false; });
      return;
    }
    if (kind === 'video') { _bqxVideo = res.url; _bqxPhoto = ''; }
    else { _bqxPhoto = res.url; _bqxVideo = ''; }
    msg.textContent = '';
    paintMedia();
  };
  photoInput.addEventListener('change', (e) => { upload(e.target.files && e.target.files[0], 'photo'); e.target.value = ''; });
  videoInput.addEventListener('change', (e) => { upload(e.target.files && e.target.files[0], 'video'); e.target.value = ''; });

  _bqxWireAb(b);
  paintMedia();
  paintGap();
}
function _bqxPfOpen(p) {
  const t = _bqxPfT();
  _bqxCss();
  _bqxPfCss();
  const copy = _bqxCopy();
  const catSel = p ? p.categoryId : (_bqxFilter !== 'all' ? _bqxFilter : '');
  _bqxModal = modal({
    // The store's OWN name: this modal is reachable by every real boutique, and
    // a hardcoded demo tag put "MAISON MANSOUR" on a real client's screen.
    // modal() escapes the tag itself: the old `_esc(p.name)` printed « &amp; ».
    title: p ? t.titleEdit : t.titleNew, tag: p ? p.name : t.tagInv + ' · ' + _bqxTag(),
    desc: _esc(p ? t.descEdit : (copy.trade === 'boutique' ? t.descBoutique : t.descOther)),
    width: 820,
    body: _bqxPfBody(p, catSel),
    foot: p
      ? `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-prod-edit-save" data-arg="${_esc(p.id)}">${_esc(t.save)}</button>`
      : `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button data-activation=write class="kb atlas" data-action="bqx-new-save">${_esc(t.create)}</button>`,
  });
  const b = _bqxModal && _bqxModal.el;
  if (!b) return;
  b.classList.add('bqx-pf-modal');
  _bqxPfWire(b, p);
  if (!p) setTimeout(() => { const i = b.querySelector('[data-bqx-name]'); if (i) i.focus(); }, 60);
}
/* The open product form, not just the first backdrop on the page. */
function _bqxPfRoot() {
  const el = _bqxModal && _bqxModal.el;
  return el && el.isConnected && el.querySelector('[data-bqx-pf]') ? el : document.querySelector('.kiwi-backdrop.bqx-pf-modal');
}

/* new product */
handlers['bqx-templates'] = () => {
  const T = window.KiwiStoreTemplates;
  if (!T) return;
  CAT().use(_bqxVenue());
  T.open({ onApplied: () => _renderInventory() });
};

handlers['bqx-new'] = () => {
  _bqxPfOpen(null);
};
handlers['bqx-new-save'] = () => {
  const b = _bqxPfRoot();
  if (!b) return;
  const f = _bqxPfRead(b);
  /* Pas de défaut : tant que A ou B n'est pas choisie, rien n'est créé. Option
     éteinte, la question n'est pas posée et rien n'est exigé. */
  const ab = _bqxAbRead(b);
  if (_bqxAbOn() && !ab) { _bqxPfFail(b, 'ab'); return; }
  if (!f) { _bqxPfFail(b); return; }
  const p = CAT().addProduct({
    name: f.name, categoryId: f.categoryId, kind: f.kind || _bqxCopy().defaultKind,
    priceMAD: f.priceMAD,
    cost: f.cost,
    /* Option éteinte → `ab` est nul : addProduct retombe alors sur « achetée
       ferme », son défaut, plutôt que de recevoir undefined.ownership. */
    ownership: ab ? ab.ownership : 'outright',
    consignor: ab ? ab.consignor : '',
    photo: _bqxPhoto,
    video: _bqxVideo,
  });
  if (_bqxModal) _bqxModal.close();
  const t = _bqxPfT();
  toast(t.created, { desc: _bqxCopy().trade === 'boutique' ? t.createdBoutique : t.createdOther, type: 'success' });
  setTimeout(() => _bqxOpenProduct(p.id), 260);
};

/* edit / delete product */
handlers['bqx-prod-edit'] = (_el, arg) => {
  const data = CAT().getProduct(arg);
  if (!data) return;
  _bqxPfOpen(data.product);
};
handlers['bqx-prod-edit-save'] = (_el, arg) => {
  const b = _bqxPfRoot();
  if (!b) return;
  /* Une fiche ouverte porte déjà sa catégorie : rien de coché ne peut arriver
     ici, mais si cela arrivait, on laisse la valeur en base plutôt que de la
     réécrire au hasard. D'où les `undefined`. */
  const ab = _bqxAbRead(b);
  const f = _bqxPfRead(b);
  if (!f) { _bqxPfFail(b); return; }
  CAT().updateProduct(arg, {
    ownership: ab ? ab.ownership : undefined,
    consignor: ab ? ab.consignor : undefined,
    name: f.name,
    categoryId: f.categoryId,
    kind: f.kind,
    priceMAD: f.priceMAD,
    cost: f.cost,
    photo: _bqxPhoto,
    video: _bqxVideo,
    /* Le champ n'est affiché qu'aux comptes multi-magasins. `undefined` quand il
       est absent, jamais '' : updateProduct ne touche que les clés fournies, et
       envoyer '' effacerait la référence d'un compte qui vient de repasser à un
       seul magasin, puis la perdrait pour de bon à la réouverture du second. */
    sku: (() => { const el = b.querySelector('[data-bqx-esku]'); return el ? el.value : undefined; })(),
  });
  if (_bqxModal) _bqxModal.close();
  toast(_bqxPfT().updated, { type: 'success', duration: 2000 });
};
handlers['bqx-prod-del'] = (_el, arg) => {
  const t = _bqxShT();
  const data = CAT().getProduct(arg);
  if (!data) return;
  const n = data.variants.length;
  const pieces = Math.max(0, +data.stock || 0);
  const items = [
    pieces ? t.delStock(pieces) : '',
    _bqxTillReads() ? t.delProdTill : t.delProdInv,
    n ? t.delProdCodes : '',
  ].filter(Boolean);
  _bqxModal = modal({
    title: t.delProdTitle, tag: data.product.name, width: 460,
    desc: _esc(n ? _bqxPfFill(t.delProdDesc, { name: data.product.name, n: t.variants(n) }) : _bqxPfFill(t.delProdDesc0, { name: data.product.name })),
    body: `<div class="kx-warn-box danger"><div class="hd">${_esc(t.irreversible)}</div><ul>${items.map((x) => `<li>${_esc(x)}</li>`).join('')}</ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_esc(t.cancel)}</button><button class="kb danger" data-action="bqx-prod-del-ok" data-arg="${_esc(arg)}">${_bqxIc('trash-2')}${_esc(t.delProdOk)}</button>`,
  });
};
handlers['bqx-prod-del-ok'] = (_el, arg) => {
  const t = _bqxShT();
  CAT().deleteProduct(arg);
  if (_bqxModal) _bqxModal.close();
  const back = document.querySelector('.kiwi-drawer-backdrop');
  if (back && back.__kiwiClose) back.__kiwiClose();
  _bqxDrawerPid = null;
  toast(t.delProdDone, { type: 'warn', duration: 2200 });
  _renderInventory();
};

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. CATÉGORIES — real create / rename / recolour / delete (with reassign)
 * ─────────────────────────────────────────────────────────────────────────── */
const _catL = (fr, en, ar) => { const l = _bqxPfLang(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
const _catTone = (t) => { const m = { mint: ['Mint', 'نعناعي'], warn: ['Saffron', 'زعفراني'], danger: ['Crimson', 'قرمزي'], info: ['Indigo', 'نيلي'] }[t.id]; return m ? _catL(t.name, m[0], m[1]) : t.name; };
const _catPr = (n) => _catL(`${n} produit${n > 1 ? 's' : ''}`, `${n} product${n === 1 ? '' : 's'}`, n === 1 ? 'منتج واحد' : n === 2 ? 'منتجان' : `${n} ${n > 10 ? 'منتجًا' : 'منتجات'}`);
function _renderCategories() {
  const cat = CAT();
  cat.use(_bqxVenue());
  const cats = cat.listCategories();
  const st = cat.stats();
  window.Kiwi.appPage('categories', {
    title: _catL('Catégories', 'Categories', 'الفئات'),
    subtitle: _catL(`${_bqxN(cats.length, 'catégorie')} · ${_bqxN(st.products, 'produit')} référencé${st.products < 2 ? '' : 's'}`, `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'} · ${st.products} product${st.products === 1 ? '' : 's'} listed`, `${cats.length} ${cats.length === 1 ? 'فئة' : 'فئات'} · ${st.products} ${st.products === 1 ? 'منتج مدرج' : 'منتجات مدرجة'}`) + _bqxShared(),
    body: `
      <div class="kx-kpi-strip cols-3">
        <div class="kx-kpi"><div class="l">${_catL('CATÉGORIES', 'CATEGORIES', 'الفئات')}</div><div class="v">${cats.length}</div><div class="d">${_catL('Créez / supprimez librement', 'Create or delete freely', 'أنشئ أو احذف بحرية')}</div></div>
        <div class="kx-kpi"><div class="l">${_catL('PRODUITS RÉFÉRENCÉS', 'PRODUCTS LISTED', 'المنتجات المدرجة')}</div><div class="v">${st.products}</div><div class="d">${cat.listProducts({ categoryId: 'all' }).filter((p) => !p.categoryId).length} ${_catL('sans catégorie', 'uncategorised', 'بدون فئة')}</div></div>
        <div class="kx-kpi"><div class="l">${_catL('VALEUR DE STOCK', 'STOCK VALUE', 'قيمة المخزون')}</div><div class="v">${_bqxStockKPI(st).shown}<span class="u">MAD</span></div><div class="d">${_catL('Toutes catégories', 'All categories', 'جميع الفئات')}${_bqxStockKPI(st).note}</div></div>
      </div>

      <div class="p-toolbar" style="margin-top:4px;">
        <div class="p-search" style="flex:1;"><span style="display:inline-flex;align-items:center;">${_ICN.search}</span><span style="margin-left:6px;color:var(--n-500,#77807b);">${_catL('Organisez vos rayons, couleur, renommage, suppression', 'Organise your sections: colour, rename, delete', 'نظّم أقسامك: اللون وإعادة التسمية والحذف')}</span></div>
        <button data-activation=write class="kb primary" data-action="bqx-cat-new">${_ICN.plus}${_catL('Ajouter une catégorie', 'Add a category', 'إضافة فئة')}</button>
      </div>

      <div style="margin-top:12px;">
        ${cats.length ? cats.map((c) => {
          const count = cat.categoryCount(c.id);
          const hex = _TAGHEX[c.color] || '#0B6E4F';
          return `<div class="bqx-cat-row">
            <div class="bqx-cat-bar" style="background:${hex};"></div>
            <div class="bqx-cat-info"><div class="n">${_esc(c.name)}</div><div class="m">${_catPr(count)}</div></div>
            <div class="bqx-cat-sw">${_TAGS.map((t) => `<button class="${t.id === c.color ? 'on' : ''}" style="background:${t.hex};" title="${_catTone(t)}" data-action="bqx-cat-color" data-arg="${c.id}::${t.id}"></button>`).join('')}</div>
            <div class="kx-tree-actions">
              <button class="kb ghost xs" data-action="bqx-cat-rename" data-arg="${c.id}" aria-label="${_catL('Renommer', 'Rename', 'إعادة تسمية')} ${_esc(c.name)}" title="${_catL('Renommer', 'Rename', 'إعادة تسمية')}">${_ICN.edit}</button>
              <button data-activation=write class="kb ghost xs danger-text" data-action="bqx-cat-del" data-arg="${c.id}" aria-label="${_catL('Supprimer', 'Delete', 'حذف')} ${_esc(c.name)}" title="${_catL('Supprimer', 'Delete', 'حذف')}">${_ICN.trash}</button>
            </div>
          </div>`;
        }).join('') : `<div class="kx-foot-hint"><div class="lh">${_catL('Aucune catégorie', 'No categories', 'لا توجد فئات')}</div><div class="rh">${_catL('Ajoutez votre premier rayon.', 'Add your first section.', 'أضف أول قسم لك.')}</div></div>`}
      </div>

      <div class="kx-foot-hint">
        <div class="lh">${_catL('Conseil', 'Tip', 'نصيحة')}</div>
        <div class="rh">${_bqxTillReads() ? _catL('Vos catégories deviennent les rayons de la caisse', 'Your categories become the sections on the till', 'تصبح فئاتك أقسام الصندوق') + _bqxTillHint() + '. ' : ''}${_catL('Supprimer une catégorie déplace ses produits vers « Sans catégorie » ou une catégorie de votre choix.', 'Deleting a category moves its products to "Uncategorised" or to a category of your choice.', 'حذف فئة ينقل منتجاتها إلى «بدون فئة» أو إلى فئة تختارها.')}</div>
      </div>
    `,
  });
}

handlers['nav-categories'] = () => {
  if (!_bqxReady()) { toast(_catL('Module catégories indisponible', 'Categories module unavailable', 'وحدة الفئات غير متاحة'), { type: 'warn' }); return; }
  _bqxCss(); _bqxSubscribe(); _renderCategories();
};

handlers['bqx-cat-new'] = () => {
  _bqxModal = modal({
    title: _catL('Ajouter une catégorie', 'Add a category', 'إضافة فئة'), tag: _catL('RAYON', 'SECTION', 'القسم'), width: 480,
    body: `
      <div class="kf-group"><label class="kf-label">${_catL('Nom de la catégorie', 'Category name', 'اسم الفئة')}</label><input class="kf-input" placeholder="${_esc(_bqxCopy().catPlaceholder)}" data-bqx-cname /></div>
      <div class="kf-group"><label class="kf-label">${_catL('Couleur', 'Colour', 'اللون')}</label>
        <div class="bqx-cat-sw" data-bqx-cnewsw>${_TAGS.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" style="background:${t.hex};width:24px;height:24px;" title="${_catTone(t)}" data-tone="${t.id}"></button>`).join('')}</div></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_catL('Annuler', 'Cancel', 'إلغاء')}</button><button data-activation=write class="kb atlas" data-action="bqx-cat-new-save">${_catL('Créer la catégorie', 'Create category', 'إنشاء الفئة')}</button>`,
  });
  setTimeout(() => {
    const sw = document.querySelector('.kiwi-backdrop [data-bqx-cnewsw]');
    if (sw) sw.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => { sw.querySelectorAll('button').forEach((x) => x.classList.remove('on')); btn.classList.add('on'); }));
    const i = document.querySelector('.kiwi-backdrop [data-bqx-cname]'); if (i) i.focus();
  }, 60);
};
handlers['bqx-cat-new-save'] = () => {
  const b = document.querySelector('.kiwi-backdrop');
  if (!b) return;
  const name = b.querySelector('[data-bqx-cname]').value.trim();
  if (!name) { toast(_catL('Nom requis', 'Name required', 'الاسم مطلوب'), { type: 'warn' }); return; }
  const tone = b.querySelector('[data-bqx-cnewsw] button.on')?.getAttribute('data-tone') || 'atlas';
  CAT().addCategory(name, tone);
  if (_bqxModal) _bqxModal.close();
  /* Only the boutique and maison tills read this catalogue; the épicerie till
     keeps its own (pos-epicerie.js). Say « en caisse » only where it is true. */
  const catTill = _bqxTillReads();
  toast(_catL('Catégorie créée', 'Category created', 'تم إنشاء الفئة'), { desc: catTill ? _catL(`« ${name} » est disponible en caisse et au dashboard.`, `"${name}" is available on the till and the dashboard.`, `«${name}» متاحة في الصندوق ولوحة التحكم.`) : _catL(`« ${name} » est disponible au dashboard.`, `"${name}" is available on the dashboard.`, `«${name}» متاحة في لوحة التحكم.`), type: 'success' });
};
handlers['bqx-cat-color'] = (_el, arg) => {
  const [cid, tone] = String(arg || '').split('::');
  if (cid && tone) CAT().setCategoryColor(cid, tone);
};
handlers['bqx-cat-rename'] = (_el, arg) => {
  const c = CAT().listCategories().find((x) => x.id === arg);
  if (!c) return;
  _bqxModal = modal({
    title: _catL('Renommer la catégorie', 'Rename category', 'إعادة تسمية الفئة'), width: 440,
    body: `<div class="kf-group"><label class="kf-label">${_catL('Nom', 'Name', 'الاسم')}</label><input class="kf-input" value="${_esc(c.name)}" data-bqx-crename /></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_catL('Annuler', 'Cancel', 'إلغاء')}</button><button data-activation=write class="kb atlas" data-action="bqx-cat-rename-save" data-arg="${arg}">${_catL('Enregistrer', 'Save', 'حفظ')}</button>`,
  });
};
handlers['bqx-cat-rename-save'] = (_el, arg) => {
  const v = document.querySelector('.kiwi-backdrop [data-bqx-crename]')?.value.trim();
  if (!v) { toast(_catL('Nom requis', 'Name required', 'الاسم مطلوب'), { type: 'warn' }); return; }
  CAT().renameCategory(arg, v);
  if (_bqxModal) _bqxModal.close();
  toast(_catL('Catégorie renommée', 'Category renamed', 'تمت إعادة تسمية الفئة'), { type: 'success', duration: 1800 });
};
handlers['bqx-cat-del'] = (_el, arg) => {
  const cat = CAT();
  const c = cat.listCategories().find((x) => x.id === arg);
  if (!c) return;
  const count = cat.categoryCount(arg);
  const others = cat.listCategories().filter((x) => x.id !== arg);
  _bqxModal = modal({
    title: _catL('Supprimer cette catégorie ?', 'Delete this category?', 'حذف هذه الفئة؟'), width: 480,
    desc: _catL(`« ${_esc(c.name)} » contient ${count} produit${count > 1 ? 's' : ''}. Choisissez où les déplacer.`, `"${_esc(c.name)}" contains ${_catPr(count)}. Choose where to move them.`, `«${_esc(c.name)}» تحتوي على ${_catPr(count)}. اختر وجهة نقلها.`),
    body: `<div class="kf-group"><label class="kf-label">${_catL('Déplacer les produits vers', 'Move the products to', 'نقل المنتجات إلى')}</label>
      <select class="kf-input" data-bqx-reassign><option value="">${_catL('Sans catégorie', 'Uncategorised', 'بدون فئة')}</option>${others.map((o) => `<option value="${o.id}">${_esc(o.name)}</option>`).join('')}</select></div>
      <div class="kx-warn-box danger"><div class="hd">${_catL('Suppression', 'Deletion', 'الحذف')}</div><ul><li>${_catL('La catégorie disparaît de la caisse et du dashboard.', 'The category disappears from the till and the dashboard.', 'تختفي الفئة من الصندوق ولوحة التحكم.')}</li><li>${_catL('Les produits sont conservés et déplacés, jamais supprimés.', 'Products are kept and moved, never deleted.', 'تُحفظ المنتجات وتُنقل ولا تُحذف أبدًا.')}</li></ul></div>`,
    foot: `<button class="kb ghost" data-dismiss>${_catL('Annuler', 'Cancel', 'إلغاء')}</button><button data-activation=write class="kb danger" data-action="bqx-cat-del-ok" data-arg="${arg}">${_ICN.trash}${_catL('Supprimer', 'Delete', 'حذف')}</button>`,
  });
};
handlers['bqx-cat-del-ok'] = (_el, arg) => {
  const reassignTo = document.querySelector('.kiwi-backdrop [data-bqx-reassign]')?.value || null;
  CAT().deleteCategory(arg, { reassignTo });
  if (_bqxModal) _bqxModal.close();
  toast(_catL('Catégorie supprimée', 'Category deleted', 'تم حذف الفئة'), { desc: _catL('Les produits ont été déplacés.', 'The products have been moved.', 'تم نقل المنتجات.'), type: 'warn', duration: 2200 });
};
})();
