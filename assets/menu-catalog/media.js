/* Menu media. Exports: injectCss.
 * Reads injected: . Window reads are declared in split.json. */
(function (parts) {
  parts.media = function (context) {
    'use strict';
    const {  } = context;
  function injectCss() {
    if (document.querySelector('#kiwi-menux-css')) return;
    const s = document.createElement('style');
    s.id = 'kiwi-menux-css';
    s.textContent = `
      .mx-wrap { --mx-line: var(--n-200); }
      .mx-empty { max-width: 520px; margin: 24px auto; text-align: center; padding: 40px 28px; background: var(--surface); border: 1px solid var(--mx-line); border-radius: 18px; }
      .mx-empty .ic { width: 54px; height: 54px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; background: var(--mint-soft); color: var(--atlas); margin-bottom: 16px; }
      .mx-empty h3 { font-size: 19px; letter-spacing: -0.01em; margin: 0 0 8px; color: var(--ink); }
      .mx-empty p { font-size: 14px; color: var(--n-600); line-height: 1.5; margin: 0 0 20px; }
      .mx-empty .row { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
      .mx-grid { display: grid; grid-template-columns: 264px 1fr; gap: 18px; align-items: start; }
      @media (max-width: 860px) { .mx-grid { grid-template-columns: 1fr; } }
      .mx-rail { display: flex; flex-direction: column; gap: 8px; }
      .mx-cat-add, .mx-sub-add { display: inline-flex; align-items: center; gap: 7px; justify-content: center; width: 100%; box-sizing: border-box; padding: 11px 12px; border-radius: 12px; border: 1.5px dashed var(--n-300); background: transparent; color: var(--n-600); font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer; transition: transform 140ms, opacity 140ms, background-color 140ms, border-color 140ms, color 140ms, box-shadow 140ms; }
      .mx-cat-add:hover, .mx-sub-add:hover { border-color: var(--atlas); color: var(--atlas); background: var(--mint-soft); }
      .mx-cat { border: 1px solid var(--mx-line); border-radius: 12px; background: var(--surface); overflow: hidden; }
      .mx-cat-head { display: flex; align-items: center; gap: 8px; padding: 11px 12px; cursor: pointer; transition: background 140ms; }
      .mx-cat.on .mx-cat-head { background: var(--mint-soft); }
      .mx-cat-head:hover { background: var(--paper-soft); }
      .mx-cat.on .mx-cat-head:hover { background: var(--mint-soft); }
      .mx-cat-head .nm { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--ink); letter-spacing: -0.005em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-cat-head .ct { font-family: var(--mono); font-size: 11px; color: var(--n-500); background: var(--paper-soft); padding: 2px 7px; border-radius: 999px; }
      .mx-cat.on .mx-cat-head .ct { color: var(--atlas); background: var(--surface); }
      .mx-cat-head .ed { display: inline-flex; color: var(--n-500); padding: 2px; border-radius: 6px; }
      .mx-cat-head .ed:hover { color: var(--ink); background: var(--surface); }
      .mx-subs { padding: 4px 8px 10px; display: flex; flex-direction: column; gap: 4px; }
      .mx-sub { display: flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; font-size: 12.5px; color: var(--n-600); cursor: pointer; transition: transform 120ms, opacity 120ms, background-color 120ms, border-color 120ms, color 120ms, box-shadow 120ms; }
      .mx-sub:hover { background: var(--paper-soft); color: var(--ink); }
      .mx-sub.on { background: var(--atlas); color: #fff; }
      .mx-sub-add { border: none; border-radius: 8px; padding: 7px 10px; justify-content: flex-start; font-size: 12px; }
      .mx-pane { border: 1px solid var(--mx-line); border-radius: 14px; background: var(--surface); overflow: hidden; }
      .mx-pane-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--mx-line); }
      .mx-pane-head h3 { margin: 0; font-size: 15px; letter-spacing: -0.01em; color: var(--ink); }
      .mx-pane-head .sub { font-size: 12px; color: var(--n-500); margin-top: 2px; }
      .mx-item { display: grid; grid-template-columns: 1fr auto auto auto; gap: 12px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--mx-line); }
      .mx-item:last-child { border-bottom: 0; }
      .mx-item.off { opacity: 0.5; }
      .mx-item .nm { font-size: 14px; font-weight: 500; color: var(--ink); letter-spacing: -0.005em; }
      .mx-item .nm .tag { font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--n-500); background: var(--paper-soft); padding: 2px 6px; border-radius: 6px; margin-left: 8px; }
      .mx-item .d { font-size: 12px; color: var(--n-500); margin-top: 3px; }
      .mx-item .pr { font-family: var(--mono); font-size: 13.5px; font-weight: 600; color: var(--ink); white-space: nowrap; text-align: right; }
      /* La marge se lit sous le prix, jamais à sa place : c'est le prix qui est
         l'information principale de cette ligne. Roman, comme tout le reste. */
      .mx-item .pr .mg { display: block; font-size: 11px; font-weight: 500; font-style: normal; letter-spacing: .01em; color: var(--atlas); margin-top: 2px; }
      .mx-item .pr .mg.none { color: var(--n-500); }
      .mx-item .pr .mg.bad { color: var(--danger); }
      .mx-cost-live { min-height: 16px; margin-top: 7px; font-size: 12px; color: var(--atlas); font-weight: 500; }
      .mx-cost-live.bad { color: var(--danger); }
      .mx-cost-live i { font-style: normal; color: var(--n-500); font-weight: 400; }
      .mx-opt-note { font-family: var(--mono); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--n-500); margin-left: 6px; }
      .mx-item .sw { width: 34px; height: 20px; border-radius: 999px; background: var(--n-300); position: relative; cursor: pointer; transition: background 160ms; flex-shrink: 0; }
      .mx-item .sw.on { background: var(--atlas); }
      .mx-item .sw::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--surface); transition: transform 160ms; }
      .mx-item .sw.on::after { transform: translateX(14px); }
      .mx-item .act { display: inline-flex; gap: 4px; }
      .mx-item .act button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--mx-line); background: var(--surface); color: var(--n-500); cursor: pointer; transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms, box-shadow 130ms; }
      .mx-item .act button:hover { color: var(--ink); border-color: var(--n-400); }
      .mx-item .act button.del:hover { color: var(--danger); border-color: var(--danger); }
      .mx-empty-items { padding: 40px 16px; text-align: center; color: var(--n-500); font-size: 13.5px; }
      .mx-pane-add { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border-radius: 10px; border: none; background: var(--atlas); color: #fff; font-family: var(--sans); font-size: 13px; font-weight: 500; cursor: pointer; }
      .mx-pane-add:hover { filter: brightness(1.05); }
      .mx-field { margin-bottom: 13px; }
      .mx-field label { display: block; font-size: 11.5px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; color: var(--n-500); margin-bottom: 6px; }
      .mx-field input, .mx-field select, .mx-field textarea { width: 100%; box-sizing: border-box; padding: 11px 13px; border: 1.5px solid var(--n-200); border-radius: 11px; font-family: var(--sans); font-size: 14.5px; color: var(--ink); background: var(--surface); outline: none; }
      .mx-field input:focus, .mx-field select:focus, .mx-field textarea:focus { border-color: var(--atlas); }
      .mx-field.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .mx-field textarea { resize: vertical; min-height: 60px; }
      /* media picker · the file inputs stay hidden, these are the affordances */
      .mx-media { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
      /* 4/5 et non un carré : c'est EXACTEMENT le cadre de la tuile côté
         client (--tile-ratio dans OrderPro.html). Un aperçu carré montrait au
         patron une image que ses clients ne verraient jamais, et il découvrait
         le recadrage une fois la carte publiée. */
      .mx-media-prev { width: 76px; aspect-ratio: 4 / 5; height: auto; border-radius: 11px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); flex: 0 0 auto; display: block; }
      .mx-media-actions { display: flex; gap: 6px; flex-wrap: wrap; }
      .mx-media-btn { padding: 8px 12px; font-size: 12.5px; }
      .mx-media-msg { font-size: 11.5px; color: var(--n-500); margin-top: 7px; line-height: 1.45; }
      /* item row thumbnail · only present once the merchant adds media */
      .mx-item .th { width: 38px; height: 38px; border-radius: 9px; object-fit: cover; background: var(--paper-soft); border: 1px solid var(--mx-line); }
      /* postes de préparation · la pastille est le même repère que sur l'écran
         cuisine de la caisse, à la même couleur. */
      .mx-stdot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: 0 0 8px; }
      /* Les groupes d'options · une carte par groupe : le nom, la règle, puis
         les choix. La règle se lit avant les choix parce qu'elle change ce que
         les choix veulent dire (un seul, ou autant qu'on veut). */
      .mx-og { border: 1px solid var(--line); border-radius: 12px; padding: 12px 13px 10px;
        margin-bottom: 10px; background: var(--surface); }
      .mx-og-head { display: flex; align-items: center; gap: 8px; }
      .mx-og-nm { flex: 1; min-width: 0; border: 0; background: none; outline: none; font: inherit;
        font-size: 14px; font-weight: 600; color: var(--ink); padding: 2px 0; }
      .mx-og-nm:focus { box-shadow: 0 1px 0 0 var(--atlas); }
      .mx-og-head .del { display: inline-flex; color: var(--n-500); padding: 4px; border-radius: 7px;
        border: 0; background: none; cursor: pointer; }
      .mx-og-head .del:hover { color: var(--danger); background: var(--paper-soft); }
      .mx-og-rules { display: flex; align-items: center; gap: 12px; margin: 9px 0 11px; flex-wrap: wrap; }
      .mx-og-kind { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
      .mx-og-kind button { border: 0; background: none; font: inherit; font-size: 11.5px; padding: 5px 11px;
        color: var(--n-500); cursor: pointer; }
      .mx-og-kind button.on { background: var(--mint-soft); color: var(--riad); font-weight: 600; }
      .mx-og-req { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--n-600); cursor: pointer; }
      .mx-og-list { display: flex; flex-direction: column; gap: 6px; }
      .mx-og-ch { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto auto;
        align-items: center; gap: 8px; }
      .mx-og-emoji-wrap { position: relative; width: 48px; flex: 0 0 48px; }
      .mx-og-emoji { width: 48px; height: 34px; border: 1px solid var(--line); border-radius: 8px;
        padding: 4px; font: inherit; font-size: 20px; line-height: 1; text-align: center; cursor: pointer;
        color: var(--ink); background: var(--paper-soft); outline: none; }
      .mx-og-emoji.empty { color: var(--n-500); font-size: 18px; }
      .mx-og-emoji:hover, .mx-og-emoji:focus, .mx-og-emoji[aria-expanded="true"] { border-color: var(--atlas); background: var(--surface); }
      .mx-og-emoji-picker { position: absolute; z-index: 30; inset-inline-start: 0; top: calc(100% + 6px); width: 254px;
        padding: 9px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface);
        box-shadow: 0 12px 32px rgba(10, 30, 22, .16); max-height: 360px; overflow-y: auto;
        overscroll-behavior: contain; }
      .mx-og-emoji-picker[hidden] { display: none; }
      .mx-og-emoji-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
      .mx-og-emoji-pick { height: 34px; border: 1px solid transparent; border-radius: 7px; background: transparent;
        font-size: 20px; line-height: 1; cursor: pointer; }
      .mx-og-emoji-pick:hover, .mx-og-emoji-pick:focus { border-color: var(--line); background: var(--paper-soft); outline: none; }
      .mx-og-emoji-clear { width: 100%; margin-top: 7px; padding: 7px 8px; border: 1px solid var(--line); border-radius: 7px;
        background: var(--paper-soft); color: var(--n-600); font: inherit; font-size: 11.5px; cursor: pointer; }
      .mx-og-visual-hint { font-size: 11.5px; line-height: 1.45; color: var(--n-500); margin: -3px 0 10px; }
      .mx-og-ch > input[type="text"] { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px;
        padding: 6px 9px; font: inherit; font-size: 13px; color: var(--ink); background: var(--paper-soft); outline: none; }
      .mx-og-ch > input[type="text"]:focus { border-color: var(--atlas); background: var(--surface); }
      .mx-og-ch .pr { display: inline-flex; align-items: center; gap: 5px; }
      .mx-og-ch .pr input { width: 62px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px;
        font: inherit; font-size: 13px; font-family: var(--mono); text-align: right; color: var(--ink);
        background: var(--paper-soft); outline: none; }
      .mx-og-ch .pr span { font-family: var(--mono); font-size: 11px; color: var(--n-500); }
      .mx-og-ch .del { display: inline-flex; color: var(--n-500); padding: 4px; border-radius: 7px;
        border: 0; background: none; cursor: pointer; }
      .mx-og-ch .del:hover { color: var(--danger); background: var(--paper-soft); }
      .mx-og-empty { font-size: 12px; color: var(--n-500); padding: 4px 0 2px; }
      /* L'attachement, dans la fiche du produit : des cases, pas une liste
         déroulante · un produit peut porter plusieurs groupes. */
      .mx-opts-pick { display: flex; flex-wrap: wrap; gap: 7px; }
      .mx-opts-pick label { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line);
        border-radius: 999px; padding: 5px 11px 5px 9px; font-size: 12.5px; color: var(--n-600);
        background: var(--paper-soft); cursor: pointer; }
      .mx-opts-pick label:has(input:checked) { border-color: var(--atlas); color: var(--riad);
        background: var(--mint-soft); font-weight: 600; }
      .mx-opts-pick .req { font-family: var(--mono); font-size: 11px; letter-spacing: .06em; color: var(--atlas); }
      .mx-opts-none { font-size: 12.5px; color: var(--n-500); }
      .mx-item .otag { font-family: var(--mono); font-size: 11px; letter-spacing: .05em; color: var(--n-500);
        background: var(--paper-soft); border-radius: 999px; padding: 2px 7px; margin-inline-start: 7px; }
      .mx-item .nm .stag { display: inline-flex; align-items: center; gap: 5px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--n-600); background: var(--paper-soft); padding: 2px 7px; border-radius: 6px; margin-left: 8px; vertical-align: 1px; }
      .mx-st-hint { font-size: 12.5px; color: var(--n-600); line-height: 1.5; margin: 0 0 14px; }
      .mx-st-list { display: flex; flex-direction: column; gap: 7px; margin-bottom: 12px; }
      .mx-st-row { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border: 1px solid var(--mx-line); border-radius: 11px; background: var(--surface); }
      .mx-st-pick { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 1px solid var(--mx-line); border-radius: 11px; background: var(--surface); color: var(--ink); font: inherit; font-size: 14px; text-align: start; cursor: pointer; }
      .mx-st-pick:hover, .mx-st-pick.on { border-color: var(--atlas); background: var(--mint-soft); }
      .mx-st-pick .check { margin-inline-start: auto; color: var(--atlas); font-weight: 700; }
      .mx-st-new { display: flex; gap: 7px; margin-top: 12px; }
      .mx-st-new input { flex: 1; min-width: 0; padding: 9px 11px; border: 1px solid var(--mx-line); border-radius: 9px; background: var(--surface); color: var(--ink); font: inherit; }
      .mx-st-sw { width: 22px; height: 22px; border-radius: 7px; border: 1px solid var(--mx-line); cursor: pointer; flex: 0 0 22px; padding: 0; }
      .mx-st-nm { flex: 1; min-width: 0; font-size: 14px; color: var(--ink); background: transparent; border: none; outline: none; font-family: var(--sans); padding: 2px 0; border-bottom: 1.5px solid transparent; }
      .mx-st-nm:focus { border-bottom-color: var(--atlas); }
      .mx-st-def { font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--atlas); background: var(--mint-soft); padding: 2px 7px; border-radius: 6px; white-space: nowrap; }
      .mx-st-act { display: inline-flex; gap: 3px; }
      .mx-st-act button { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--mx-line); background: var(--surface); color: var(--n-500); cursor: pointer; transition: transform 130ms, opacity 130ms, background-color 130ms, border-color 130ms, color 130ms; }
      .mx-st-act button:hover:not(:disabled) { color: var(--ink); border-color: var(--n-400); }
      .mx-st-act button:disabled { opacity: 0.32; cursor: default; }
      .mx-st-act button.del:hover { color: var(--danger); border-color: var(--danger); }
      .mx-st-empty { padding: 22px 4px 26px; text-align: center; color: var(--n-500); font-size: 13px; line-height: 1.55; }
      /* Merchant menu, 2026 shell. The catalogue/store above remains the only
         source of truth; these rules only replace the legacy split-pane skin. */
      .mx-menu-tabs { display: flex; align-items: center; gap: 5px; overflow-x: auto; padding: 5px; margin: 0 0 18px; border: 1px solid var(--mx-line); border-radius: 999px; background: var(--surface); scrollbar-width: none; }
      .mx-menu-tabs::-webkit-scrollbar { display: none; }
      .mx-menu-tab { display: inline-flex; align-items: center; justify-content: center; gap: 7px; flex: 0 0 auto; min-height: 36px; padding: 8px 15px; border: 0; border-radius: 999px; background: transparent; color: var(--n-500); font: 500 12.5px/1 var(--sans); cursor: pointer; transition: background-color 150ms, color 150ms, box-shadow 150ms, transform 150ms; }
      .mx-menu-tab:hover { color: var(--ink); background: var(--paper-soft); }
      .mx-menu-tab.on { color: var(--inverse-ink); background: var(--inverse-surface); box-shadow: 0 6px 14px color-mix(in srgb, var(--inverse-surface) 18%, transparent); }
      .mx-catalog { padding: 24px; border: 2px solid color-mix(in srgb, var(--atlas) 34%, var(--n-200)); border-radius: 18px; background: var(--surface); box-shadow: 0 14px 34px color-mix(in srgb, var(--ink) 8%, transparent); }
      .mx-catalog-tools { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; }
      .mx-filter-row { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      .mx-filter-row::-webkit-scrollbar { display: none; }
      .mx-filter-pair { display: inline-flex; flex: 0 0 auto; align-items: stretch; border: 1px solid var(--mx-line); border-radius: 999px; overflow: hidden; background: var(--surface); }
      .mx-filter-pill { min-height: 38px; padding: 8px 16px; border: 0; background: transparent; color: var(--n-600); font: 500 13px/1 var(--sans); cursor: pointer; white-space: nowrap; }
      .mx-filter-pill:hover { color: var(--ink); background: var(--paper-soft); }
      .mx-filter-pair.on { border-color: var(--atlas); background: var(--atlas); }
      .mx-filter-pair.on .mx-filter-pill { color: var(--inverse-ink); }
      .mx-filter-pair.on .mx-filter-pill:hover { background: transparent; }
      .mx-filter-edit { display: inline-flex; align-items: center; justify-content: center; width: 34px; border: 0; border-inline-start: 1px solid var(--mx-line); background: transparent; color: var(--n-500); cursor: pointer; }
      .mx-filter-edit:hover { color: var(--ink); background: var(--paper-soft); }
      .mx-filter-pair.on .mx-filter-edit { color: var(--inverse-ink); border-inline-start-color: color-mix(in srgb, var(--inverse-ink) 24%, transparent); }
      .mx-filter-count { margin-inline-start: 6px; font-family: var(--mono); font-size: 11px; opacity: .66; }
      .mx-subfilters { display: flex; align-items: center; gap: 7px; margin: -6px 0 18px; overflow-x: auto; scrollbar-width: none; }
      .mx-subfilters::-webkit-scrollbar { display: none; }
      .mx-subfilter { flex: 0 0 auto; padding: 7px 12px; border: 1px solid var(--mx-line); border-radius: 999px; background: var(--surface); color: var(--n-500); font: 500 11.5px/1 var(--sans); cursor: pointer; }
      .mx-subfilter:hover, .mx-subfilter.on { border-color: var(--atlas); color: var(--atlas); background: var(--mint-soft); }
      .mx-card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
      .mx-product-card { display: flex; flex-direction: column; min-width: 0; min-height: 176px; padding: 18px 18px 14px; border: 1px solid var(--mx-line); border-top: 3px solid color-mix(in srgb, var(--atlas) 30%, var(--n-200)); border-radius: 16px; background: var(--surface); box-shadow: 0 8px 18px color-mix(in srgb, var(--ink) 7%, transparent); transition: transform 150ms, box-shadow 150ms, border-color 150ms; }
      .mx-product-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--atlas) 46%, var(--n-200)); box-shadow: 0 13px 26px color-mix(in srgb, var(--ink) 11%, transparent); }
      .mx-product-card.off { opacity: .55; }
      .mx-product-card .cat { font-family: var(--mono); font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--n-500); }
      .mx-product-card .name { margin-top: 14px; color: var(--ink); font-size: 15px; font-weight: 600; letter-spacing: -.015em; line-height: 1.25; }
      .mx-product-card .desc { min-height: 18px; margin-top: 4px; color: var(--n-500); font-size: 11.5px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-product-card .price { margin-top: 10px; color: var(--atlas); font-family: var(--mono); font-size: 24px; font-weight: 600; letter-spacing: -.035em; }
      .mx-product-card .price .mg { display: inline; margin-inline-start: 7px; color: var(--n-500); font-size: 11px; font-style: normal; font-weight: 500; letter-spacing: 0; }
      .mx-product-card .price .mg.bad { color: var(--danger); }
      .mx-product-card .foot { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 12px; border-top: 1px solid var(--mx-line); color: var(--n-500); font-size: 11.5px; }
      .mx-product-card .foot .meta { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-product-card .act { display: inline-flex; gap: 5px; }
      .mx-product-card .act button { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid var(--mx-line); border-radius: 9px; background: var(--surface); color: var(--n-500); cursor: pointer; }
      .mx-product-card .act button:hover { border-color: var(--n-400); color: var(--ink); }
      .mx-product-card .act button.del:hover { border-color: var(--danger); color: var(--danger); }
      .mx-product-card .sw { border: 0; padding: 0; width: 32px; height: 19px; border-radius: 999px; background: var(--n-300); position: relative; cursor: pointer; flex: 0 0 auto; }
      .mx-product-card .sw.on { background: var(--atlas); }
      .mx-product-card .sw::after { content: ''; position: absolute; inset: 2px auto auto 2px; width: 15px; height: 15px; border-radius: 50%; background: var(--surface); transition: transform 150ms; }
      .mx-product-card .sw.on::after { transform: translateX(13px); }
      /* Formule / menu composé dans la fiche produit */
      .mx-formula-toggle-wrap { margin: 14px 0 10px; padding: 12px 14px; border: 1px solid var(--n-200); border-radius: 12px; background: var(--paper-soft); }
      .mx-formula-toggle-label { display: flex; align-items: center; gap: 9px; cursor: pointer; font-size: 13.5px; font-weight: 600; color: var(--ink); }
      .mx-formula-toggle-label input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--atlas); }
      .mx-formula-hint { font-size: 11.5px; color: var(--n-500); margin-top: 5px; line-height: 1.4; }
      .mx-formula-wrap { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
      .mx-formula-wrap[hidden] { display: none; }
      .mx-slot-card { border: 1px solid var(--line); border-radius: 11px; padding: 12px; background: var(--surface); margin-bottom: 8px; }
      .mx-slot-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
      .mx-slot-label-inp { flex: 1; min-width: 140px; padding: 6px 10px; border: 1.5px solid var(--n-200); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--ink); }
      .mx-slot-label-inp:focus { border-color: var(--atlas); }
      .mx-slot-bounds { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--n-600); }
      .mx-slot-bounds input { width: 44px; padding: 4px 6px; text-align: center; border: 1px solid var(--n-200); border-radius: 6px; font-size: 12px; font-family: var(--mono); }
      .mx-slot-del-btn, .mx-slot-move-btn { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--n-200); background: var(--surface); color: var(--n-500); cursor: pointer; }
      .mx-slot-del-btn:hover { color: var(--danger); border-color: var(--danger); }
      .mx-slot-choices-list { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
      .mx-slot-choice-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; padding: 6px 10px; background: var(--paper-soft); border-radius: 8px; }
      .mx-slot-choice-name { font-size: 12.5px; font-weight: 500; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mx-slot-choice-extra { display: flex; align-items: center; gap: 4px; font-size: 11.5px; font-family: var(--mono); color: var(--n-600); }
      .mx-slot-choice-extra input { width: 54px; padding: 4px 6px; border: 1px solid var(--n-200); border-radius: 6px; text-align: right; font-size: 11.5px; font-family: var(--mono); }
      .mx-slot-add-ch-bar { position: relative; margin-top: 10px; }
      .mx-formula-picker-trigger { width: 100%; min-height: 48px; padding: 8px 11px; display: grid; grid-template-columns: 32px minmax(0,1fr) 22px; align-items: center; gap: 10px; border: 1px solid var(--n-200); border-radius: 13px; background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; transition: border-color .16s ease, box-shadow .16s ease, background .16s ease; }
      .mx-formula-picker-trigger:hover, .mx-formula-picker-trigger[aria-expanded="true"] { border-color: color-mix(in srgb,var(--atlas) 55%,var(--n-200)); background: color-mix(in srgb,var(--atlas) 4%,var(--surface)); box-shadow: 0 0 0 3px color-mix(in srgb,var(--atlas) 10%,transparent); }
      .mx-formula-picker-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; background: color-mix(in srgb,var(--atlas) 11%,transparent); color: var(--atlas); }
      .mx-formula-picker-trigger svg { width: 18px; height: 18px; fill: currentColor; }
      .mx-formula-picker-copy { min-width: 0; display: grid; gap: 2px; }
      .mx-formula-picker-copy strong { font-size: 13px; font-weight: 650; }
      .mx-formula-picker-copy small { overflow: hidden; color: var(--n-500); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .mx-formula-picker-chevron { color: var(--n-500); transition: transform .16s ease; }
      .mx-formula-picker-trigger[aria-expanded="true"] .mx-formula-picker-chevron { transform: rotate(180deg); }
      .mx-formula-picker { margin-top: 8px; overflow: hidden; border: 1px solid var(--n-200); border-radius: 15px; background: var(--surface); box-shadow: 0 18px 44px -30px rgba(0,0,0,.48); }
      .mx-formula-picker[hidden] { display: none; }
      .mx-formula-picker-search { position: sticky; top: 0; z-index: 2; padding: 10px; border-bottom: 1px solid var(--n-200); background: color-mix(in srgb,var(--surface) 94%,transparent); backdrop-filter: blur(14px); }
      .mx-formula-picker-search label { height: 38px; padding: 0 11px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--n-200); border-radius: 11px; background: var(--paper-soft); color: var(--n-500); }
      .mx-formula-picker-search svg { width: 17px; height: 17px; fill: currentColor; flex: 0 0 auto; }
      .mx-formula-picker-search input { width: 100%; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: 500 12.5px var(--sans); }
      .mx-formula-picker-results { max-height: 292px; overflow: auto; padding: 5px 7px 8px; scrollbar-width: thin; scrollbar-color: var(--n-300) transparent; }
      .mx-formula-picker-group { padding-top: 5px; }
      .mx-formula-picker-group[hidden], .mx-formula-picker-option[hidden] { display: none; }
      .mx-formula-picker-group-title { padding: 7px 9px 5px; color: var(--n-500); font: 700 9px var(--mono); letter-spacing: .1em; text-transform: uppercase; }
      .mx-formula-picker-option { width: 100%; min-height: 45px; padding: 7px 9px; display: grid; grid-template-columns: minmax(0,1fr) auto 24px; align-items: center; gap: 10px; border: 0; border-radius: 10px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
      .mx-formula-picker-option:hover, .mx-formula-picker-option:focus-visible { outline: 0; background: color-mix(in srgb,var(--atlas) 10%,transparent); }
      .mx-formula-picker-option-copy { min-width: 0; display: grid; gap: 2px; }
      .mx-formula-picker-option-copy strong { overflow: hidden; font-size: 12.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
      .mx-formula-picker-option-copy small { overflow: hidden; color: var(--n-500); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .mx-formula-picker-price { color: var(--n-600); font: 600 10.5px var(--mono); white-space: nowrap; }
      .mx-formula-picker-add { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; background: color-mix(in srgb,var(--atlas) 12%,transparent); color: var(--atlas); }
      .mx-formula-picker-add svg { width: 13px; height: 13px; }
      .mx-formula-picker-empty { padding: 22px 14px; color: var(--n-500); font-size: 11.5px; text-align: center; }
      .mx-formula-add-slot-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border: 1.5px dashed var(--atlas); border-radius: 10px; background: var(--mint-soft); color: var(--riad); font-size: 13px; font-weight: 600; cursor: pointer; width: 100%; box-sizing: border-box; }
      @media (max-width: 1280px) { .mx-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
      @media (max-width: 980px) { .mx-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .mx-catalog-tools { align-items: flex-start; flex-direction: column; } }
      @media (max-width: 640px) { .mx-catalog { padding: 14px; } .mx-card-grid { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(s);
  }

    return { injectCss };
  };
})(window.KiwiMenuCatalogParts = window.KiwiMenuCatalogParts || {});
