/* Team page and member modal styles, shared by the team entry. */
(function () {
  'use strict';
  window.KiwiTeamParts ||= {};
  const PAGE_CSS = `
    /* Planning · une cellule = un service. Le fond teinté fait lire la semaine
       d'un coup d'œil : qui est posté, qui est en repos, quels jours sont vides.

       La grille ne défile PAS horizontalement : table-layout fixe + une semaine
       par écran (voir weekChunks). Un tableau qui glisse sous la souris n'a
       jamais l'air fini, et une colonne de paie à moitié coupée encore moins. */
    .dash-equipe .kt-plan-hint { margin: 0 0 12px; font-size: 12.5px; color: var(--n-500); }
    .dash-equipe .kt-plan-wrap { border: 1px solid var(--n-200); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .dash-equipe .kt-plan-table { table-layout: fixed; width: 100%; }
    .dash-equipe .kt-plan-table .kt-plan-col-mem { width: 21%; }
    .dash-equipe .kt-plan-table .kt-plan-col-tot { width: 10%; }
    .dash-equipe .kt-plan-table th, .dash-equipe .kt-plan-table td { overflow: hidden; }
    /* En largeur fixe, le min-width du profil ferait déborder la ligne. */
    .dash-equipe .kt-plan-table .kt-h-member { min-width: 0; gap: 8px; padding-inline-start: 12px; }
    .dash-equipe .kt-plan-table .kt-h-member > div { min-width: 0; }
    .dash-equipe .kt-plan-table .kt-h-member .n,
    .dash-equipe .kt-plan-table .kt-h-member .r { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dash-equipe .kt-plan-table .kt-h-total, .dash-equipe .kt-plan-table .kt-h-pay { min-width: 0; padding-inline-end: 10px; }
    .dash-equipe .kt-plan-table .kt-day-cell { padding: 5px 3px; }

    /* Le pas à pas des semaines · visible seulement sur quinzaine / mois. */
    .dash-equipe .kt-plan-step { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .dash-equipe .kt-plan-arrow {
      width: 26px; height: 26px; border-radius: 8px; border: 1px solid var(--n-200);
      background: var(--surface); color: var(--ink); font-size: 15px; line-height: 1;
      cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
      transition: border-color 140ms, background 140ms;
    }
    .dash-equipe .kt-plan-arrow:hover:not(:disabled) { border-color: var(--atlas); background: var(--mint-soft, rgba(11,110,79,0.06)); }
    .dash-equipe .kt-plan-arrow:disabled { opacity: 0.4; cursor: default; }
    .dash-equipe .kt-plan-steplbl { font-size: 11px; color: var(--n-600); letter-spacing: 0.02em; }

    /* La case : deux heures empilées, ou « Repos », ou rien. */
    .dash-equipe .kt-sh {
      width: 100%; min-height: 42px; padding: 5px 2px; border: 1px solid var(--n-200);
      border-radius: 8px; background: var(--surface); color: var(--ink);
      font-family: var(--mono); font-size: 11px; line-height: 1.35; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      transition: border-color 140ms, box-shadow 140ms, background 140ms;
    }
    .dash-equipe .kt-sh:hover:not(:disabled) { border-color: var(--atlas); }
    .dash-equipe .kt-sh:focus-visible { outline: none; border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    .dash-equipe .kt-sh:disabled { opacity: 0.55; cursor: default; }
    .dash-equipe .kt-sh-empty { color: var(--n-500); font-size: 13px; }
    .dash-equipe .kt-sh-rest { font-family: var(--sans); font-size: 11px; color: var(--n-500); }
    .dash-equipe .kt-sh-t { display: block; white-space: nowrap; }
    .dash-equipe .kt-sh-t.end { color: var(--n-600); }
    /* Pas scopé à .dash-equipe : le même badge sert dans l'éditeur, qui vit
       sur <body> pour ne jamais être rogné par le tableau. */
    .kt-sh-next {
      display: inline-block; margin: 0 2px 0 3px; padding: 0 3px; border-radius: 4px;
      background: var(--mint-soft, rgba(125,242,176,0.35)); color: var(--atlas);
      font-family: var(--mono); font-size: 11px; font-style: normal; font-weight: 600;
      vertical-align: 1px; letter-spacing: 0;
    }
    .kt-plan-cell.on  { background: rgba(11,110,79,0.055); }
    .kt-plan-cell.off { background: var(--paper-soft, rgba(0,0,0,0.025)); }
    .dash-equipe .kt-plan-cell.on .kt-sh { border-color: rgba(11,110,79,0.35); font-weight: 500; }
    .dash-equipe .kt-plan-legend { margin: 10px 0 0; font-size: 11.5px; color: var(--n-500); line-height: 1.5; }
    .dash-equipe .kt-plan-legend.is-off { display: none; }

    /* Écran étroit : la grille tient toujours (largeurs fixes), mais les heures
       finissaient rognées à mi-chiffre. On rend au jour ce que la colonne
       « membre » et le métier peuvent lui céder, et le +1 passe à la ligne. */
    @media (max-width: 900px) {
      .dash-equipe .kt-plan-table .kt-plan-col-mem { width: 17%; }
      .dash-equipe .kt-plan-table .kt-plan-col-tot { width: 9%; }
      .dash-equipe .kt-plan-table .kt-h-member { gap: 6px; padding-inline-start: 8px; }
      .dash-equipe .kt-plan-table .kt-h-member .r { display: none; }
      .dash-equipe .kt-plan-table .kt-day-cell { padding: 4px 1px; }
      .dash-equipe .kt-sh { font-size: 11px; padding: 4px 1px; min-height: 38px; }
      .dash-equipe .kt-sh-rest { font-size: 11px; }
      .dash-equipe .kt-sh .kt-sh-next { display: block; margin: 1px 0 0; }
    }

    /* Éditeur de service · ancré sur la case, jamais dans le flux du tableau. */
    .kt-shpop {
      position: fixed; z-index: 900; width: 268px; padding: 14px;
      background: var(--surface, #fff); border: 1px solid var(--n-200);
      border-radius: 14px; box-shadow: 0 18px 44px rgba(10,15,13,0.18);
      font-family: var(--sans); color: var(--ink);
    }
    .kt-shpop-head { margin-bottom: 11px; }
    .kt-shpop-head b { display: block; font-size: 13px; }
    /* « lundi 20 juillet » : en français seule la 1re lettre prend la majuscule
       capitalize aurait écrit « Lundi 20 Juillet ». */
    .kt-shpop-head span { display: block; font-size: 11px; color: var(--n-500); margin-top: 2px; }
    .kt-shpop-head span::first-letter { text-transform: uppercase; }
    .kt-shpop-times { display: flex; gap: 8px; }
    .kt-shpop-times label { flex: 1; min-width: 0; }
    .kt-shpop-times span { display: block; font-size: 11px; font-family: var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--n-500); margin-bottom: 4px; }
    .kt-shpop-times input {
      width: 100%; box-sizing: border-box; padding: 8px 9px; border: 1px solid var(--n-200);
      border-radius: 9px; background: var(--surface); color: var(--ink);
      font-family: var(--mono); font-size: 13px; outline: none;
    }
    .kt-shpop-times input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }
    .kt-shpop-sum { min-height: 17px; margin: 9px 0 2px; font-size: 11.5px; color: var(--n-600); line-height: 1.5; }
    .kt-shpop-sum b { color: var(--ink); font-size: 12.5px; }
    .kt-shpop-sum.warn { color: var(--warn-ink); }
    .kt-shpop-week { display: flex; align-items: center; gap: 7px; margin: 9px 0 12px; font-size: 11.5px; color: var(--n-600); cursor: pointer; }
    .kt-shpop-week input { width: 14px; height: 14px; accent-color: var(--atlas); cursor: pointer; }
    .kt-shpop-foot { display: flex; gap: 6px; }
    .kt-shpop-b {
      flex: 1; padding: 8px 4px; border-radius: 9px; border: 1px solid var(--n-200);
      background: var(--surface); color: var(--ink); font-family: var(--sans);
      font-size: 11.5px; cursor: pointer; transition: border-color 140ms, background 140ms;
    }
    .kt-shpop-b:hover { border-color: var(--atlas); }
    .kt-shpop-b.primary { background: var(--atlas); border-color: var(--atlas); color: var(--paper); font-weight: 500; }
    .kt-shpop-b.primary:hover { background: var(--riad); border-color: var(--riad); }

    /* Search bar */
    .dash-equipe .kt-searchbar { position: relative; }
    .dash-equipe .kt-searchbar-ic { position: absolute; inset-inline-start: 12px; top: 50%; transform: translateY(-50%); color: var(--n-500); pointer-events: none; }
    .dash-equipe .kt-searchbar input { width: 100%; padding-block: 11px; padding-inline: 36px 12px; border: 1px solid var(--n-200); border-radius: 10px; font-family: var(--sans); font-size: 13px; background: var(--surface); color: var(--ink); outline: none; box-sizing: border-box; transition: border-color 140ms, box-shadow 140ms; }
    .dash-equipe .kt-searchbar input:focus { border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.10); }

    /* Tag chips (contract type) */
    .dash-equipe .kt-tag { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 600; font-family: var(--mono); letter-spacing: 0.04em; }
    .dash-equipe .kt-tag-ok      { background: var(--mint-soft); color: var(--atlas); border: 1px solid rgba(11,110,79,0.18); }
    .dash-equipe .kt-tag-pend    { background: var(--warn-soft); color: var(--warn-ink); border: 1px solid color-mix(in srgb, var(--warn-ink) 25%, transparent); }
    .dash-equipe .kt-tag-neutral { background: var(--paper-soft); color: var(--n-600); border: 1px solid var(--n-200); }
    .dash-equipe .kt-langchip { background: var(--paper-soft); border: 1px solid var(--n-200); padding: 2px 7px; border-radius: 5px; font-size: 11px; color: var(--n-700); }
    .dash-equipe .kt-chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .dash-equipe .kt-cell-strong { font-weight: 500; color: var(--ink); }

    /* Hours tab · table */
    .dash-equipe .kt-hbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
    .dash-equipe .kt-hbar-right { display: inline-flex; gap: 6px; flex-wrap: wrap; }
    .dash-equipe .kt-h-tablewrap { border: 1px solid var(--n-200); border-radius: 12px; overflow-x: auto; background: var(--surface); }
    .dash-equipe .kt-h-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .dash-equipe .kt-h-table thead th { background: var(--paper-soft); padding: 11px 9px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; color: var(--n-500); font-weight: 500; text-align: start; text-transform: uppercase; border-bottom: 1px solid var(--n-200); position: sticky; top: 0; }
    .dash-equipe .kt-h-table .kt-day-head { text-align: center; min-width: 54px; }
    .dash-equipe .kt-h-table .kt-day-head .d { display: block; font-size: 12.5px; color: var(--ink); font-weight: 600; }
    .dash-equipe .kt-h-table .kt-day-head .m { display: block; font-size: 11px; color: var(--n-500); text-transform: lowercase; letter-spacing: 0.04em; margin-top: 2px; }
    .dash-equipe .kt-h-table .kt-day-head .kt-day-hours { display: block; overflow: hidden; margin-top: 5px; color: var(--n-700); font: 600 8px/1.25 var(--mono); letter-spacing: 0; text-overflow: ellipsis; white-space: nowrap; text-transform: none; }
    .dash-equipe .kt-h-table .kt-day-head .kt-day-special { display: block; overflow: hidden; margin-top: 4px; padding: 3px 4px; border-radius: 999px; background: color-mix(in srgb, var(--atlas) 10%, var(--surface)); color: var(--atlas); font: 700 7px/1.2 var(--mono); letter-spacing: .03em; text-overflow: ellipsis; white-space: nowrap; text-transform: none; }
    .dash-equipe .kt-h-table .kt-day-head.is-closed { background: color-mix(in srgb, var(--n-200) 45%, var(--paper-soft)); }
    .dash-equipe .kt-h-table .kt-day-head.is-closed .kt-day-hours { color: var(--n-500); }
    .dash-equipe .kt-h-table tbody td { border-top: 1px solid var(--n-200); padding: 9px 9px; vertical-align: middle; }
    .dash-equipe .kt-h-table .kt-h-member { display: flex; align-items: center; gap: 10px; min-width: 200px; }
    .dash-equipe .kt-h-table .kt-h-member .n { font-weight: 600; font-size: 12.5px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-member .r { font-size: 11px; color: var(--n-500); margin-top: 1px; }
    .dash-equipe .kt-h-table .kt-day-cell { text-align: center; padding: 7px 4px; }
    .dash-equipe .kt-h-table .kt-day-cell input { width: 50px; padding: 5px 4px; border: 1px solid var(--n-200); border-radius: 6px; font-family: var(--mono); font-size: 12px; background: var(--surface); color: var(--ink); text-align: center; outline: none; -moz-appearance: textfield; }
    .dash-equipe .kt-h-table .kt-day-cell input::-webkit-outer-spin-button, .dash-equipe .kt-h-table .kt-day-cell input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .dash-equipe .kt-h-table .kt-day-cell input:focus { border-color: var(--atlas); box-shadow: 0 0 0 2px rgba(11,110,79,0.12); }
    .dash-equipe .kt-h-table .kt-day-cell.today { background: rgba(125, 242, 176, 0.10); }
    .dash-equipe .kt-h-table .kt-day-cell.is-closed { background-image: repeating-linear-gradient(135deg, transparent 0 7px, color-mix(in srgb, var(--n-200) 42%, transparent) 7px 8px); }
    .dash-equipe .kt-h-table .kt-day-cell.is-holiday .kt-sh { border-color: color-mix(in srgb, var(--atlas) 30%, var(--n-200)); }
    .dash-equipe .kt-h-table .kt-day-cell.locked input { background: var(--paper-soft); color: var(--n-500); cursor: not-allowed; }
    .dash-equipe .kt-h-table .kt-h-total, .dash-equipe .kt-h-table .kt-h-pay { text-align: end; min-width: 82px; padding-inline-end: 14px; }
    .dash-equipe .kt-h-table .kt-h-total b, .dash-equipe .kt-h-table .kt-h-pay b { font-size: 13px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-total span, .dash-equipe .kt-h-table .kt-h-pay span { color: var(--n-500); font-size: 11px; margin-inline-start: 3px; font-weight: 400; }
    .dash-equipe .kt-h-table tfoot td { padding: 11px 9px; background: var(--paper-soft); border-top: 2px solid var(--ink); font-size: 12.5px; }
    .dash-equipe .kt-h-table .kt-h-foot-label { font-family: var(--mono); font-size: 11px; letter-spacing: 0.10em; color: var(--n-700); text-transform: uppercase; padding-inline-start: 16px; }
    .dash-equipe .kt-h-table .kt-h-foot-tot b { font-size: 14px; color: var(--ink); }
    .dash-equipe .kt-h-table .kt-h-foot-tot span { color: var(--n-500); font-size: 11px; margin-inline-start: 3px; font-weight: 400; }

    /* Fusion-mode overrides for the bits we added */
    body.fusion-mode .dash-equipe .kt-searchbar input,
    body.fusion-mode .dash-equipe .kt-h-tablewrap,
    body.fusion-mode .dash-equipe .kt-plan-wrap,
    body.fusion-mode .dash-equipe .kt-sh,
    body.fusion-mode .dash-equipe .kt-plan-arrow,
    body.fusion-mode .kt-shpop,
    body.fusion-mode .kt-shpop-times input,
    body.fusion-mode .kt-shpop-b,
    body.fusion-mode .dash-equipe .kt-h-table .kt-day-cell input { background: #0F0F0F !important; color: var(--paper); border-color: rgba(125,242,176,0.18) !important; }
    body.fusion-mode .kt-shpop-b.primary { background: var(--atlas) !important; border-color: var(--atlas) !important; }
    body.fusion-mode .dash-equipe .kt-sh-t.end,
    body.fusion-mode .dash-equipe .kt-sh-rest { color: var(--n-500); }
    body.fusion-mode .dash-equipe .kt-h-table thead th,
    body.fusion-mode .dash-equipe .kt-h-table tfoot td { background: rgba(255,255,255,0.04) !important; color: var(--paper); }
    body.fusion-mode .dash-equipe .kt-h-table .kt-day-cell.locked input { background: rgba(255,255,255,0.06) !important; color: var(--n-500); }
    body.fusion-mode .dash-equipe .kt-tag-neutral { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
    body.fusion-mode .dash-equipe .kt-langchip { background: rgba(255,255,255,0.05); color: var(--n-300); border-color: rgba(125,242,176,0.12); }
    /* Phone: thumb-sized week arrows, readable day captions, no focus zoom. */
    @media (max-width: 820px) {
      .dash-equipe .kt-plan-arrow { min-width: 44px; min-height: 44px; }
      .dash-equipe .kt-searchbar input { font-size: 16px; }
    }
    @media (max-width: 900px) {
      .dash-equipe .kt-h-table .kt-day-head .kt-day-hours { font-size: 11px; }
      .dash-equipe .kt-h-table .kt-day-head .kt-day-special { font-size: 11px; }
    }

    /* Planning · un jour à la fois sous 900 px (planDaysHtml). Au-dessus, la
       vue du jour n'existe pas et le tableau de la semaine reste tel quel. */
    .dash-equipe .kt-pd { display: none; }
    @media (max-width: 900px) {
      .dash-equipe .kt-pd { display: block; }
      .dash-equipe .kt-plan-wrap { display: none; }
      .dash-equipe .kt-pd-days {
        display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px;
        /* La rangée déborde un peu sur la marge de la carte : à 390 px, sept
           pastilles y gardent chacune leurs 44 px au pouce. */
        padding: 3px; margin: 0 -6px 14px; border: 1px solid var(--n-200);
        border-radius: 14px; background: var(--paper-soft);
      }
      .dash-equipe .kt-pd-pill {
        min-width: 0; min-height: 52px; padding: 4px 0; border: 0; border-radius: 10px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
        background: transparent; color: var(--n-600); font-family: var(--sans); cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }
      .dash-equipe .kt-pd-pill .w { font-size: 11px; line-height: 1.2; }
      .dash-equipe .kt-pd-pill .d { font-size: 17px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
      .dash-equipe .kt-pd-pill.on { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(10,15,13,0.08); }
      .dash-equipe .kt-pd-days[data-kw-lens] .kt-pd-pill.on { background: transparent; box-shadow: none; }
      .dash-equipe .kt-pd-pill.today .d { color: var(--atlas); }
      .dash-equipe .kt-pd-pill.is-closed .d { color: var(--n-500); font-weight: 500; }
      .dash-equipe .kt-pd-pill:focus-visible { outline: 2px solid var(--atlas); outline-offset: 1px; }
      /* Une règle globale donne 96 px de marge haute et basse à tout <section>. */
      .dash-equipe .kt-pd-panel { padding: 0; margin: 0; }
      .dash-equipe .kt-pd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin: 0 2px 10px; }
      .dash-equipe .kt-pd-head > div { min-width: 0; }
      .dash-equipe .kt-pd-head strong { display: block; font-size: 15px; font-weight: 600; color: var(--ink); }
      .dash-equipe .kt-pd-head strong::first-letter { text-transform: uppercase; }
      .dash-equipe .kt-pd-head span { display: block; margin-top: 2px; font-size: 12px; color: var(--n-500); overflow-wrap: anywhere; }
      .dash-equipe .kt-pd-head .kt-pd-sum { flex: none; margin-top: 2px; font-size: 12px; color: var(--n-600); text-align: end; }
      .dash-equipe .kt-pd-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
      .dash-equipe .kt-pd-row {
        width: 100%; min-height: 58px; padding: 9px 12px; box-sizing: border-box;
        display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px;
        border: 1px solid var(--n-200); border-radius: 12px; background: var(--surface);
        color: var(--ink); font-family: var(--sans); text-align: start; cursor: pointer;
        transition: border-color 140ms, background 140ms; -webkit-tap-highlight-color: transparent;
      }
      .dash-equipe .kt-pd-row:hover:not(:disabled) { border-color: var(--atlas); }
      .dash-equipe .kt-pd-row:focus-visible { outline: none; border-color: var(--atlas); box-shadow: 0 0 0 3px rgba(11,110,79,0.12); }
      .dash-equipe .kt-pd-row:disabled { opacity: 0.55; cursor: default; }
      .dash-equipe .kt-pd-row.on { border-color: rgba(11,110,79,0.35); background: rgba(11,110,79,0.055); }
      .dash-equipe .kt-pd-row.off { background: var(--paper-soft); }
      .dash-equipe .kt-pd-row .eq-av { width: 32px; height: 32px; }
      .dash-equipe .kt-pd-who { min-width: 0; }
      .dash-equipe .kt-pd-who b, .dash-equipe .kt-pd-who small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dash-equipe .kt-pd-who b { font-size: 14px; font-weight: 600; }
      .dash-equipe .kt-pd-who small { margin-top: 1px; font-size: 12px; color: var(--n-500); }
      .dash-equipe .kt-pd-when { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
      .dash-equipe .kt-pd-t { font-family: var(--mono); font-size: 13.5px; font-weight: 500; white-space: nowrap; }
      .dash-equipe .kt-pd-t .kt-sh-next { margin-inline-start: 4px; }
      .dash-equipe .kt-pd-dur, .dash-equipe .kt-pd-rest { font-size: 12px; color: var(--n-500); }
      .dash-equipe .kt-pd-add { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 500; color: var(--atlas); }
      /* L'éditeur ouvert depuis une ligne : champs et boutons au pouce, et des
         champs à 16 px pour qu'iOS ne zoome pas en y entrant. */
      .kt-shpop { width: min(320px, calc(100vw - 20px)); box-sizing: border-box; }
      .kt-shpop-times input { min-height: 44px; font-size: 16px; }
      .kt-shpop-week { min-height: 44px; margin: 4px 0 8px; font-size: 13px; }
      .kt-shpop-week input { width: 20px; height: 20px; }
      .kt-shpop-b { min-height: 44px; font-size: 13px; }
      body.fusion-mode .dash-equipe .kt-pd-row { background: #0F0F0F; color: var(--paper); border-color: rgba(125,242,176,0.18); }
      body.fusion-mode .dash-equipe .kt-pd-row.on { background: rgba(125,242,176,0.07); }
    }
  `;
  window.KiwiTeamParts.styles = Object.freeze({ PAGE_CSS });
})();
