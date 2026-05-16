/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · sidebar pages
 * Full-feature drawers for every sidebar destination:
 *  transactions, terminaux, règlements, conformité, équipe,
 *  tables & additions, menu & modificateurs, KDS, stock ingrédients.
 * ─────────────────────────────────────────────────────────────────────────── */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { toast, modal, drawer, handlers, confetti } = window.Kiwi;

  /* ─── Shared CSS for page views ─── */
  const CSS = `
  /* Page drawer scale */
  .kiwi-drawer.page-lg { width: 680px !important; max-width: calc(100vw - 40px) !important; }
  .kiwi-drawer.page-xl { width: 920px !important; max-width: calc(100vw - 40px) !important; }

  /* Big hero metric in a drawer */
  .p-hero { background: linear-gradient(135deg, var(--atlas) 0%, #053B2C 120%); color: var(--paper); border-radius: 14px; padding: 24px; margin-bottom: 18px; position: relative; overflow: hidden; }
  .p-hero::after { content: ""; position: absolute; right: -50px; top: -50px; width: 180px; height: 180px; background: radial-gradient(circle, var(--mint), transparent 60%); opacity: 0.22; pointer-events: none; }
  .p-hero .l { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mint); font-family: var(--mono); }
  .p-hero .big { font-size: 38px; font-weight: 600; letter-spacing: -0.03em; margin-top: 6px; font-feature-settings: "tnum" 1; }
  .p-hero .sub { color: #c6ead4; font-size: 13px; margin-top: 8px; }

  /* Filter/toolbar strip */
  .p-toolbar { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
  .p-search { flex: 1; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 10px; padding: 9px 14px; font-size: 13px; color: var(--n-500); display: flex; align-items: center; gap: 8px; min-width: 180px; }

  /* Data table */
  .p-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .p-table thead th { text-align: left; padding: 9px 12px; font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.08em; color: var(--n-500); text-transform: uppercase; background: var(--paper-soft); border-bottom: 1px solid var(--n-200); font-weight: 500; }
  .p-table tbody td { padding: 11px 12px; border-bottom: 1px solid var(--n-200); }
  .p-table tbody tr:hover { background: var(--paper-soft); cursor: pointer; }
  .p-table .mono { font-family: var(--mono); font-feature-settings: "tnum" 1; font-weight: 500; }
  .p-table .right { text-align: right; }

  /* Card row */
  .p-card { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; margin-bottom: 10px; }
  .p-card .head { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 10px; }
  .p-card .head h4 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.015em; }
  .p-card .meta { font-family: var(--mono); font-size: 11px; color: var(--n-500); letter-spacing: 0.06em; }
  html[data-theme="dark"] .p-card { background: var(--paper-muted); }

  /* Terminal card */
  .term { display: grid; grid-template-columns: 56px 1fr auto; gap: 16px; align-items: center; padding: 16px 0; border-bottom: 1px solid var(--n-200); }
  .term:last-child { border-bottom: 0; }
  .term .icn { width: 48px; height: 72px; border-radius: 10px; background: var(--ink); color: var(--mint); display: flex; align-items: flex-end; justify-content: center; padding: 6px; position: relative; }
  .term .icn.off { background: var(--n-300); color: var(--n-500); }
  .term .icn::after { content: ""; width: 20px; height: 3px; background: currentColor; border-radius: 2px; }
  .term .info .n { font-weight: 600; font-size: 14.5px; }
  .term .info .sn { font-family: var(--mono); font-size: 11.5px; color: var(--n-500); margin-top: 2px; }
  .term .info .row { display: flex; gap: 12px; margin-top: 8px; font-size: 12px; color: var(--n-600); flex-wrap: wrap; }
  .term .info .row span { display: inline-flex; align-items: center; gap: 5px; }
  .term .info .row i { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
  .term .info .row i.warn { background: var(--warning); }
  .term .info .row i.err { background: var(--danger); }
  .term .actions { display: flex; flex-direction: column; gap: 6px; }

  /* Team grid */
  .team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 720px) { .team-grid { grid-template-columns: 1fr; } }
  .team-mem { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; }
  html[data-theme="dark"] .team-mem { background: var(--paper-muted); }
  .team-mem .top { display: flex; align-items: center; gap: 12px; }
  .team-mem .av { width: 48px; height: 48px; border-radius: 50%; background: var(--atlas); color: var(--paper); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 15px; flex-shrink: 0; letter-spacing: -0.02em; position: relative; }
  .team-mem .av.b { background: var(--riad); }
  .team-mem .av.c { background: #D99A2B; }
  .team-mem .av.d { background: var(--atlas-700); }
  .team-mem .av::after { content: ""; position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; background: var(--success); border-radius: 50%; border: 2px solid var(--paper-soft); }
  .team-mem .av.offline::after { background: var(--n-300); }
  .team-mem .n { font-weight: 600; font-size: 14.5px; }
  .team-mem .role { font-size: 11.5px; color: var(--n-500); letter-spacing: 0.05em; margin-top: 2px; }
  .team-mem .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--n-200); }
  .team-mem .kpis .k { font-size: 11px; color: var(--n-500); }
  .team-mem .kpis .v { font-weight: 600; font-family: var(--mono); font-feature-settings: "tnum" 1; margin-top: 2px; font-size: 13px; }

  /* Floor plan */
  .floor { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  .floor-zone { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--n-500); font-family: var(--mono); margin: 14px 0 10px; grid-column: 1 / -1; }
  .tbl { aspect-ratio: 1; border: 2px solid var(--n-200); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; cursor: pointer; transition: all 200ms; background: var(--paper-soft); }
  html[data-theme="dark"] .tbl { background: var(--paper-muted); }
  .tbl:hover { border-color: var(--atlas); transform: translateY(-2px); }
  .tbl .tbl-n { font-weight: 700; font-size: 22px; letter-spacing: -0.02em; }
  .tbl .tbl-state { font-size: 10.5px; font-family: var(--mono); color: var(--n-500); margin-top: 4px; letter-spacing: 0.04em; }
  .tbl .tbl-amt { font-size: 12px; font-weight: 600; font-feature-settings: "tnum" 1; margin-top: 6px; }
  .tbl.occupied { border-color: var(--atlas); background: var(--mint-soft); }
  html[data-theme="dark"] .tbl.occupied { background: rgba(125,242,176,0.06); }
  .tbl.occupied .tbl-amt { color: var(--atlas); }
  .tbl.pay-pending { border-color: var(--warning); background: rgba(217,154,43,0.08); }
  .tbl.pay-pending .tbl-amt { color: var(--warning); }
  .tbl.paid { border-color: var(--success); opacity: 0.65; }
  .tbl::after { content: ""; position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: 50%; background: transparent; }
  .tbl.occupied::after { background: var(--atlas); }
  .tbl.pay-pending::after { background: var(--warning); animation: live-pulse 2s infinite; }

  /* Menu editor */
  .menu-cat { margin-bottom: 20px; }
  .menu-cat-head { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 2px solid var(--ink); margin-bottom: 4px; }
  .menu-cat-head h4 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; }
  .menu-cat-head .count { font-size: 11px; font-family: var(--mono); color: var(--n-500); letter-spacing: 0.08em; }
  .menu-item { display: grid; grid-template-columns: 1fr 80px 80px 30px; gap: 12px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--n-200); font-size: 13.5px; }
  .menu-item:last-child { border-bottom: 0; }
  .menu-item .name { font-weight: 500; }
  .menu-item .name .desc { color: var(--n-500); font-weight: 400; font-size: 11.5px; margin-top: 2px; }
  .menu-item .price { font-family: var(--mono); font-weight: 600; text-align: right; }
  .menu-item .avail { font-size: 11.5px; text-align: right; font-family: var(--mono); }
  .menu-item .avail.ok { color: var(--success); }
  .menu-item .avail.low { color: var(--warning); }
  .menu-item .avail.out { color: var(--danger); }
  .menu-item .more { color: var(--n-400); text-align: right; cursor: pointer; }

  /* KDS */
  .kds-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 720px) { .kds-grid { grid-template-columns: 1fr; } }
  .kds-col-head { font-size: 13px; font-weight: 600; padding: 12px 14px; background: var(--ink); color: var(--paper); border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; }
  .kds-col-head .count { font-family: var(--mono); color: var(--mint); }
  .kds-col-body { background: var(--paper-soft); border: 1px solid var(--n-200); border-top: 0; border-radius: 0 0 10px 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 280px; }
  html[data-theme="dark"] .kds-col-body { background: var(--paper-muted); }
  .kds-ticket { background: #fff; border: 1px solid var(--n-200); border-radius: 10px; padding: 12px; border-left: 4px solid var(--atlas); cursor: pointer; transition: all 150ms; }
  html[data-theme="dark"] .kds-ticket { background: var(--paper-soft); }
  .kds-ticket.glovo { border-left-color: #F29137; }
  .kds-ticket.jumia { border-left-color: #E7611A; }
  .kds-ticket:hover { transform: translateX(2px); }
  .kds-ticket .thead { display: flex; justify-content: space-between; font-size: 11px; color: var(--n-500); font-family: var(--mono); margin-bottom: 6px; letter-spacing: 0.05em; }
  .kds-ticket .thead .timer { color: var(--atlas); font-weight: 600; }
  .kds-ticket .thead .timer.warn { color: var(--warning); }
  .kds-ticket .thead .timer.over { color: var(--danger); animation: tick-flash 800ms ease-in-out infinite; }
  .kds-ticket .items { font-size: 13px; line-height: 1.5; }
  .kds-ticket .items li { list-style: none; padding-left: 14px; position: relative; }
  .kds-ticket .items li::before { content: "•"; position: absolute; left: 3px; color: var(--atlas); }

  /* Stock */
  .stock-row { display: grid; grid-template-columns: 36px 2fr 1fr 1fr 70px; gap: 14px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--n-200); font-size: 13.5px; }
  .stock-row .icn { width: 36px; height: 36px; background: var(--paper-soft); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  html[data-theme="dark"] .stock-row .icn { background: var(--paper-muted); }
  .stock-row .name { font-weight: 500; }
  .stock-row .sup { font-size: 11px; color: var(--n-500); margin-top: 2px; }
  .stock-row .bar { height: 6px; background: var(--n-100); border-radius: 3px; overflow: hidden; position: relative; }
  .stock-row .bar > div { height: 100%; background: var(--atlas); border-radius: 3px; transition: width 400ms; }
  .stock-row .bar.low > div { background: var(--warning); }
  .stock-row .bar.out > div { background: var(--danger); }
  .stock-row .qty { font-family: var(--mono); font-weight: 500; text-align: right; font-feature-settings: "tnum" 1; }

  /* Compliance */
  .comp-score { display: flex; align-items: center; gap: 20px; padding: 20px; background: linear-gradient(135deg, var(--atlas), var(--atlas-700)); color: var(--paper); border-radius: 16px; margin-bottom: 18px; }
  .comp-score .ring { width: 80px; height: 80px; position: relative; flex-shrink: 0; }
  .comp-score .ring svg { width: 100%; height: 100%; }
  .comp-score .ring .c { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
  .comp-score .t { font-size: 11px; letter-spacing: 0.1em; color: var(--mint); font-family: var(--mono); }
  .comp-score .v { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; margin-top: 2px; }
  .comp-score .d { font-size: 13px; color: #c6ead4; margin-top: 6px; }
  .comp-item { display: flex; gap: 14px; padding: 14px 0; border-bottom: 1px solid var(--n-200); align-items: center; }
  .comp-item .icn { width: 40px; height: 40px; border-radius: 10px; background: var(--mint-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  html[data-theme="dark"] .comp-item .icn { background: rgba(125,242,176,0.1); color: var(--mint); }
  .comp-item .body { flex: 1; }
  .comp-item .body .n { font-weight: 600; font-size: 14px; }
  .comp-item .body .d { font-size: 12px; color: var(--n-500); margin-top: 2px; line-height: 1.4; }
  .comp-item .status { font-size: 11px; font-family: var(--mono); color: var(--success); padding: 4px 10px; background: #E3F7EC; border-radius: 999px; font-weight: 600; letter-spacing: 0.04em; }
  html[data-theme="dark"] .comp-item .status { background: rgba(31,181,116,0.14); }
  .comp-item .status.warn { color: var(--warning); background: #FFF4DD; }
  html[data-theme="dark"] .comp-item .status.warn { background: rgba(217,154,43,0.16); }

  /* Settlement calendar */
  .settle-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 14px; }
  .settle-dow { font-size: 11px; text-align: center; color: var(--n-500); font-family: var(--mono); padding: 4px 0; letter-spacing: 0.1em; }
  .settle-cell { aspect-ratio: 1.1; border: 1px solid var(--n-200); border-radius: 8px; padding: 6px; display: flex; flex-direction: column; justify-content: space-between; font-size: 11px; cursor: pointer; transition: all 140ms; background: var(--paper-soft); }
  html[data-theme="dark"] .settle-cell { background: var(--paper-muted); }
  .settle-cell:hover { border-color: var(--atlas); }
  .settle-cell.pad { opacity: 0.3; pointer-events: none; }
  .settle-cell.today { border-color: var(--ink); background: var(--ink); color: var(--paper); }
  .settle-cell.settled { border-color: var(--success); }
  .settle-cell.settled .amt { color: var(--success); font-weight: 600; }
  .settle-cell .d { font-weight: 600; font-size: 13px; }
  .settle-cell .amt { font-family: var(--mono); font-size: 10.5px; font-weight: 500; }

  /* Reservations & appointments */
  .resv-tabs { display: flex; gap: 6px; margin: 18px 0 16px; padding: 4px; background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 12px; }
  html[data-theme="dark"] .resv-tabs { background: var(--paper-muted); }
  .resv-tab { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 10px 12px; border-radius: 9px; font-size: 13px; font-weight: 500; color: var(--n-500); transition: background 150ms, color 150ms; }
  .resv-tab:hover { color: var(--ink); }
  .resv-tab.on { background: #fff; color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
  html[data-theme="dark"] .resv-tab.on { background: var(--ink-soft); color: var(--paper); }
  .resv-pane { animation: fade-in 200ms ease-out; }
  .resv-section { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; margin-bottom: 12px; }
  html[data-theme="dark"] .resv-section { background: var(--paper-muted); }
  .resv-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
  .resv-section-head h4 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.015em; }
  .resv-line { display: grid; grid-template-columns: 60px 1fr auto; gap: 14px; align-items: center; padding: 11px 0; border-top: 1px solid var(--n-200); }
  .resv-line:nth-of-type(1) { border-top: 0; }
  .resv-line .t { font-family: var(--mono); font-weight: 600; font-size: 14px; color: var(--ink); }
  .resv-line .info .n { font-weight: 500; font-size: 13.5px; }
  .resv-line .info .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; line-height: 1.4; }
  .resv-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 720px) { .resv-grid-2 { grid-template-columns: 1fr; } }
  .resv-card { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 16px; }
  html[data-theme="dark"] .resv-card { background: var(--paper-muted); }
  .resv-card .rc-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 10px; }
  .resv-card .rc-tag { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.1em; color: var(--n-500); font-weight: 500; }
  .resv-card .rc-count { font-family: var(--mono); font-size: 11px; color: var(--atlas); background: var(--mint-soft); padding: 2px 8px; border-radius: 999px; font-weight: 500; }
  .resv-card .rc-foot { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--n-200); font-size: 11.5px; color: var(--n-500); line-height: 1.45; }
  .resv-wait { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--n-200); font-size: 13px; }
  .resv-wait:nth-of-type(1) { border-top: 0; }
  .resv-wait .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; }
  .resv-builder { background: #fff; border: 1px solid var(--n-200); border-radius: 12px; padding: 14px; }
  html[data-theme="dark"] .resv-builder { background: var(--paper-soft); }
  .rb-step { display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; padding: 10px 0; border-top: 1px solid var(--n-200); }
  .rb-step:first-child { border-top: 0; }
  .rb-icn { width: 28px; height: 28px; border-radius: 50%; background: var(--mint-soft); color: var(--atlas); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; font-family: var(--mono); }
  .rb-step.ok .rb-icn { background: var(--atlas); color: var(--mint); }
  .rb-body b { font-size: 13.5px; font-weight: 500; }
  .rb-body .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; }
  .rb-price { font-family: var(--mono); font-weight: 600; font-size: 13px; color: var(--ink); }
  .rb-total { display: flex; justify-content: space-between; align-items: center; padding: 14px 0 4px; border-top: 2px solid var(--ink); margin-top: 10px; font-size: 13.5px; }
  .rb-total b { font-family: var(--mono); font-weight: 600; font-size: 18px; color: var(--atlas); letter-spacing: -0.015em; }
  .resv-rooms { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rr { background: #fff; border: 1px solid var(--n-200); border-radius: 10px; padding: 10px 12px; font-size: 12px; }
  html[data-theme="dark"] .rr { background: var(--paper-soft); }
  .rr b { font-weight: 500; font-size: 13px; }
  .rr .m { font-size: 11px; color: var(--n-500); margin: 4px 0 6px; }
  .rr .bar { height: 4px; background: var(--n-100); border-radius: 2px; overflow: hidden; }
  .rr .bar > div { height: 100%; }
  .resv-pkg { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--n-200); font-size: 13px; }
  .resv-pkg:nth-of-type(1) { border-top: 0; }
  .resv-pkg .m { font-size: 11.5px; color: var(--n-500); margin-top: 2px; }
  .resv-legend { display: inline-flex; gap: 12px; font-size: 11px; color: var(--n-500); flex-wrap: wrap; font-family: var(--mono); letter-spacing: 0.04em; }
  .resv-legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
  .resv-cal { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; }
  .rcal-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; }
  .rcal-name { font-size: 12.5px; font-weight: 500; color: var(--n-700); letter-spacing: -0.005em; }
  .rcal-track { position: relative; height: 28px; background: #fff; border: 1px solid var(--n-200); border-radius: 8px; }
  html[data-theme="dark"] .rcal-track { background: var(--paper-soft); }
  .rcal-block { position: absolute; top: 3px; bottom: 3px; border-radius: 6px; padding: 0 8px; font-size: 10.5px; color: var(--paper); display: flex; align-items: center; font-weight: 500; white-space: nowrap; overflow: hidden; cursor: pointer; }
  .rcal-axis { display: flex; justify-content: space-between; padding-left: 152px; padding-right: 4px; font-family: var(--mono); font-size: 10px; color: var(--n-400); margin-top: 6px; letter-spacing: 0.04em; }
  .resv-walkin { display: flex; flex-direction: column; gap: 6px; }
  .wk { display: grid; grid-template-columns: 32px 1fr; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; background: #fff; border: 1px solid var(--n-200); font-size: 12.5px; }
  html[data-theme="dark"] .wk { background: var(--paper-soft); }
  .wk.on { background: var(--mint-soft); border-color: var(--atlas); }
  .wk-n { width: 26px; height: 26px; border-radius: 50%; background: var(--paper-soft); color: var(--n-500); display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 600; font-size: 12px; }
  .wk.on .wk-n { background: var(--atlas); color: var(--mint); }
  .wk .m { font-size: 11px; color: var(--n-500); margin-top: 2px; }
  .resv-engine { background: linear-gradient(135deg, var(--ink), var(--ink-soft)); color: var(--paper); border-radius: 16px; padding: 22px; margin-top: 18px; position: relative; overflow: hidden; }
  .resv-engine::after { content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; background: radial-gradient(circle, var(--mint), transparent 60%); opacity: 0.18; pointer-events: none; }
  .resv-engine .re-tag { font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.12em; color: var(--mint); }
  .resv-engine h4 { margin: 6px 0 4px; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--paper); }
  .resv-engine .re-sub { font-size: 12.5px; color: #a7d5b9; margin: 0 0 16px; line-height: 1.45; max-width: 540px; }
  .re-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; position: relative; z-index: 1; }
  @media (max-width: 720px) { .re-grid { grid-template-columns: 1fr; } }
  .re-tile { background: rgba(255,255,255,0.04); border: 1px solid rgba(125,242,176,0.16); border-radius: 12px; padding: 14px; }
  .re-ico { width: 32px; height: 32px; border-radius: 9px; background: rgba(125,242,176,0.12); color: var(--mint); display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
  .re-tile h5 { margin: 0 0 4px; font-size: 13.5px; font-weight: 600; letter-spacing: -0.005em; color: var(--paper); }
  .re-tile p { margin: 0; font-size: 12px; line-height: 1.5; color: #c6d6cd; }

  /* Payroll & shift scheduling */
  .sh-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 900px) { .sh-grid-2 { grid-template-columns: 1fr; } }
  .sh-section { background: var(--paper-soft); border: 1px solid var(--n-200); border-radius: 14px; padding: 18px; margin-bottom: 12px; }
  html[data-theme="dark"] .sh-section { background: var(--paper-muted); }
  .sh-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
  .sh-section-head h4 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -0.015em; }
  .sh-section-head .sub { font-size: 11.5px; color: var(--n-500); margin-top: 3px; line-height: 1.45; }
  .sh-clock-row { display: grid; grid-template-columns: 38px 150px 1fr 80px auto; gap: 12px; align-items: center; padding: 11px 0; border-top: 1px solid var(--n-200); font-size: 13px; }
  .sh-section-head + .sh-clock-row { border-top: 0; }
  .sh-clock-row .av { width: 34px; height: 34px; border-radius: 50%; background: var(--atlas); color: var(--paper); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px; position: relative; letter-spacing: -0.02em; }
  .sh-clock-row .av.b { background: var(--riad); }
  .sh-clock-row .av.c { background: #D99A2B; }
  .sh-clock-row .av.d { background: var(--atlas-700); }
  .sh-clock-row .av.off { background: var(--n-400); }
  .sh-clock-row .av::after { content: ""; position: absolute; bottom: 0; right: 0; width: 9px; height: 9px; border-radius: 50%; background: var(--success); border: 2px solid var(--paper-soft); }
  .sh-clock-row .av.off::after { background: var(--n-300); }
  .sh-clock-row .who .n { font-weight: 500; font-size: 13.5px; letter-spacing: -0.005em; }
  .sh-clock-row .who .role { font-size: 11px; color: var(--n-500); margin-top: 2px; }
  .sh-bar { position: relative; height: 22px; background: #fff; border: 1px solid var(--n-200); border-radius: 6px; }
  html[data-theme="dark"] .sh-bar { background: var(--paper); }
  .sh-bar > div { position: absolute; top: 2px; bottom: 2px; border-radius: 4px; }
  .sh-bar > div.work { background: var(--atlas); }
  .sh-bar > div.brk { background: var(--warning); opacity: 0.75; }
  .sh-bar > div.now { width: 2px; background: var(--mint); top: -3px; bottom: -3px; border-radius: 1px; box-shadow: 0 0 6px rgba(125,242,176,0.8); }
  .sh-clock-row .dur { font-family: var(--mono); font-weight: 500; font-size: 12.5px; color: var(--ink); text-align: right; }
  .sh-clock-row .dur .l { font-size: 9.5px; color: var(--n-500); letter-spacing: 0.08em; display: block; margin-bottom: 1px; }

  /* Weekly grid */
  .sh-week { display: grid; grid-template-columns: 150px repeat(7, 1fr); gap: 4px; }
  .sh-week .head { font-family: var(--mono); font-size: 10.5px; color: var(--n-500); padding: 6px 4px; text-align: center; letter-spacing: 0.06em; text-transform: uppercase; }
  .sh-week .head.today { color: var(--atlas); font-weight: 600; }
  .sh-week .name { font-size: 12px; font-weight: 500; padding: 14px 4px; color: var(--n-700); display: flex; align-items: center; }
  .sh-week .cell { padding: 8px 4px; border-radius: 8px; background: #fff; border: 1px solid var(--n-200); text-align: center; min-height: 56px; display: flex; flex-direction: column; justify-content: center; cursor: pointer; transition: all 140ms; }
  html[data-theme="dark"] .sh-week .cell { background: var(--paper); }
  .sh-week .cell:hover { border-color: var(--atlas); transform: translateY(-1px); }
  .sh-week .cell.morning { background: var(--mint-soft); border-color: rgba(11,110,79,0.18); color: var(--riad); }
  .sh-week .cell.evening { background: rgba(11,110,79,0.12); border-color: rgba(11,110,79,0.22); color: var(--atlas); }
  .sh-week .cell.day { background: rgba(217,154,43,0.16); border-color: rgba(217,154,43,0.3); color: #8A6210; }
  .sh-week .cell.off { background: var(--n-100); color: var(--n-400); border-color: transparent; }
  .sh-week .cell .h { font-weight: 600; font-size: 12px; font-family: var(--mono); letter-spacing: -0.01em; }
  .sh-week .cell .d { font-size: 9px; opacity: 0.78; margin-top: 3px; letter-spacing: 0.06em; font-family: var(--mono); }

  /* Tip pooling */
  .sh-tip-cfg { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; background: #fff; border: 1px solid var(--n-200); border-radius: 10px; margin-bottom: 12px; }
  html[data-theme="dark"] .sh-tip-cfg { background: var(--paper); }
  .sh-tip-cfg b { font-weight: 500; font-size: 13.5px; }
  .sh-tip-cfg .m { font-size: 11.5px; color: var(--n-500); margin-top: 3px; line-height: 1.4; }
  .sh-tip-pool { display: grid; grid-template-columns: 32px 1fr 56px 80px; gap: 10px; align-items: center; padding: 9px 0; border-top: 1px solid var(--n-200); font-size: 12.5px; }
  .sh-tip-cfg + .sh-tip-pool { border-top: 0; }
  .sh-tip-pool .av { width: 30px; height: 30px; border-radius: 50%; color: var(--paper); display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 11px; letter-spacing: -0.02em; }
  .sh-tip-pool .av.a { background: var(--atlas); }
  .sh-tip-pool .av.b { background: var(--riad); }
  .sh-tip-pool .av.c { background: #D99A2B; }
  .sh-tip-pool .av.d { background: var(--n-400); }
  .sh-tip-pool .pct { font-family: var(--mono); font-size: 11px; color: var(--n-500); text-align: right; }
  .sh-tip-pool .amt { font-family: var(--mono); font-weight: 500; color: var(--atlas); text-align: right; }

  /* Labor vs sales */
  .sh-lvs { background: #fff; border: 1px solid var(--n-200); border-radius: 12px; padding: 14px; }
  html[data-theme="dark"] .sh-lvs { background: var(--paper); }
  .sh-lvs-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 12px; }
  .sh-lvs-num { font-size: 30px; font-weight: 600; letter-spacing: -0.025em; line-height: 1; font-feature-settings: "tnum" 1; }
  .sh-lvs-num .u { font-size: 14px; color: var(--n-500); margin-left: 4px; font-weight: 500; }
  .sh-lvs-foot { display: flex; gap: 14px; margin-top: 10px; font-size: 11px; color: var(--n-500); flex-wrap: wrap; font-family: var(--mono); letter-spacing: 0.04em; }
  .sh-lvs-foot label { display: inline-flex; align-items: center; gap: 6px; }
  .sh-lvs-foot label i { width: 10px; height: 10px; border-radius: 2px; }
  `;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);

  /* ═══════════════════ ACCUEIL ═══════════════════ */
  handlers['nav-accueil'] = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Accueil · tableau de bord', { type: 'info', duration: 1400 });
  };

  /* ═══════════════════ TRANSACTIONS ═══════════════════ */
  handlers['nav-transactions'] = () => {
    const methods = [
      { m: 'visa', n: 'Visa', mask: '4291' },
      { m: 'mc', n: 'Mastercard', mask: '7820' },
      { m: 'tap', n: 'Kiwi Tap', mask: 'NFC' },
      { m: 'qr', n: 'Kiwi Wallet QR', mask: 'QR' },
      { m: 'visa', n: 'Visa', mask: '0043' },
      { m: 'mc', n: 'Mastercard', mask: '1209' },
      { m: 'visa', n: 'Visa', mask: '8124' },
      { m: 'mc', n: 'Mastercard', mask: '6670' },
      { m: 'visa', n: 'Visa', mask: '9102' },
    ];
    const customers = ['Karim B.', 'Sara L.', 'Youssef A.', 'Nawal K.', 'Hassan J.', 'Imane M.', 'Mehdi R.', 'Fatima Z.', 'Rachid O.', 'Lina S.', 'Ahmed T.', 'Yasmine H.', 'Omar F.'];
    const rows = [];
    const now = new Date();
    let tot = 0;
    for (let i = 0; i < 30; i++) {
      const t = new Date(now - (i * 6 + Math.random() * 4) * 60_000);
      const m = methods[Math.floor(Math.random() * methods.length)];
      const amt = Math.round((40 + Math.random() * 400) * 100) / 100;
      tot += amt;
      const tip = Math.random() > 0.6 ? Math.round(amt * 0.1 * 100) / 100 : 0;
      rows.push({ t: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, ...m, c: customers[Math.floor(Math.random() * customers.length)], amt, tip, status: Math.random() > 0.95 ? 'pend' : 'ok' });
    }
    drawer({
      title: 'Transactions',
      subtitle: `${rows.length} transactions · ${tot.toFixed(0)} MAD aujourd'hui`,
      width: 920,
      body: `
        <div class="p-hero">
          <div class="l">VOLUME AUJOURD'HUI</div>
          <div class="big">${tot.toLocaleString('fr-FR', {maximumFractionDigits: 0})} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">${rows.length} transactions · panier moyen ${Math.round(tot / rows.length)} MAD</div>
        </div>
        <div class="p-toolbar">
          <div class="p-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            Rechercher…
          </div>
          <button class="kb ghost" data-action="filter-tx"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M10 18h4"/></svg>Filtrer</button>
          <button class="kb ghost" data-action="export"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M5 10l7 7 7-7M5 21h14"/></svg>Exporter</button>
          <button class="kb primary" data-action="new-sale"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Encaisser</button>
        </div>
        <table class="p-table">
          <thead><tr><th>HEURE</th><th>MÉTHODE</th><th>CLIENT</th><th class="right">MONTANT</th><th class="right">POURBOIRE</th><th>STATUT</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr data-action="tx-detail" data-arg="tx1">
                <td class="mono">${r.t}</td>
                <td><b>${r.n}</b> <span style="color:var(--n-500);">${r.mask}</span></td>
                <td style="color:var(--n-600);">${r.c}</td>
                <td class="mono right">${r.amt.toFixed(2).replace('.', ',')}</td>
                <td class="mono right" style="color:${r.tip > 0 ? 'var(--success)' : 'var(--n-400)'};">${r.tip > 0 ? '+' + r.tip.toFixed(2).replace('.', ',') : '—'}</td>
                <td><span class="chip ${r.status === 'ok' ? 'ok' : 'pend'}">${r.status === 'ok' ? 'Réglé' : 'Attente'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `,
    }).el.querySelector('.kiwi-drawer').classList.add('page-xl');
  };

  /* ═══════════════════ TERMINAUX ═══════════════════ */
  handlers['nav-terminaux'] = () => {
    drawer({
      title: 'Terminaux Kiwi',
      subtitle: '3 appareils · 2 actifs · 1 hors-ligne',
      width: 680,
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, #0B6E4F, #053B2C);">
          <div class="l">ÉTAT DU PARC</div>
          <div class="big">2 / 3 <span style="font-size:18px; opacity:0.7;">actifs</span></div>
          <div class="sub">Batterie moyenne : 71 % · uptime 24h : 94,2 %</div>
        </div>

        <div class="term">
          <div class="icn"></div>
          <div class="info">
            <div class="n">Station Comptoir · PAX A920 Pro</div>
            <div class="sn">S/N A920PRO-KW-2831 · firmware 4.2.1</div>
            <div class="row">
              <span><i></i>En ligne · Wi-Fi</span>
              <span>🔋 87 %</span>
              <span>Dernière tx : 14:37</span>
              <span>42 tx aujourd'hui</span>
            </div>
          </div>
          <div class="actions">
            <button class="kb ghost" style="padding:6px 12px; font-size:12px;">Gérer</button>
          </div>
        </div>

        <div class="term">
          <div class="icn" style="width: 42px; height: 64px; background: #1A201D;"></div>
          <div class="info">
            <div class="n">Tap Samsung A54 · SoftPOS</div>
            <div class="sn">IMEI 356894 ••• 2912 · Fatima Khalki</div>
            <div class="row">
              <span><i></i>En ligne · 4G</span>
              <span>🔋 63 %</span>
              <span>Dernière tx : 14:32</span>
              <span>28 tx aujourd'hui</span>
            </div>
          </div>
          <div class="actions">
            <button class="kb ghost" style="padding:6px 12px; font-size:12px;">Gérer</button>
          </div>
        </div>

        <div class="term">
          <div class="icn off"></div>
          <div class="info">
            <div class="n">Station Terrasse · PAX A920 Pro</div>
            <div class="sn">S/N A920PRO-KW-2832 · firmware 4.2.1</div>
            <div class="row">
              <span><i class="err"></i>Hors-ligne depuis 09:18</span>
              <span>🔋 64 % (dernier rapport)</span>
              <span>Wi-Fi terrasse down</span>
            </div>
          </div>
          <div class="actions">
            <button class="kb atlas" style="padding:6px 12px; font-size:12px;">Diagnostiquer</button>
          </div>
        </div>

        <div style="padding:20px; margin-top: 20px; background: var(--paper-soft); border-radius: 14px; border: 1px dashed var(--n-300); text-align:center;">
          <div style="font-size: 32px; margin-bottom: 10px;">🖥️</div>
          <div style="font-weight: 600; margin-bottom: 6px;">Commander un nouveau terminal</div>
          <div style="font-size: 13px; color: var(--n-500); margin-bottom: 14px;">PAX A920 Pro · 990 MAD ou 69 MAD/mois × 18</div>
          <button class="kb atlas">Commander · livraison 48h →</button>
        </div>
      `,
    });
  };

  /* ═══════════════════ RÈGLEMENTS ═══════════════════ */
  handlers['nav-reglements'] = () => {
    const cal = [];
    // Pad Sunday-start (Saturday = 0 in Morocco convention, but let's use Monday start like France)
    // Simulate April 2026 (starts Wednesday)
    const dow = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    for (let i = 0; i < 2; i++) cal.push({ pad: true });
    for (let d = 1; d <= 30; d++) {
      const isToday = d === 24;
      const settled = d < 24;
      const amt = Math.round(15000 + Math.random() * 15000);
      cal.push({ d, amt, today: isToday, settled });
    }
    const thisMonth = 347280;
    drawer({
      title: 'Règlements',
      subtitle: 'Avril 2026 · versements vers BMCE •• 3291',
      width: 680,
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--atlas), #053B2C);">
          <div class="l">RÉGLÉ CE MOIS</div>
          <div class="big">${thisMonth.toLocaleString('fr-FR').replace(/,/g,' ')} <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">22 règlements · T+1 · 99,2 % des règlements à l'heure</div>
        </div>

        <div style="background: var(--paper-soft); border-radius: 14px; padding: 18px; margin-bottom: 18px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
          <div><div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.08em; font-family: var(--mono);">PROCHAIN</div><div style="font-size: 22px; font-weight: 600; margin-top: 4px;">23 091 MAD</div><div style="font-size: 12px; color: var(--n-500); margin-top: 2px;">Demain 9h00</div></div>
          <div><div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.08em; font-family: var(--mono);">COMMISSIONS</div><div style="font-size: 22px; font-weight: 600; margin-top: 4px; color: var(--danger);">−4 128 MAD</div><div style="font-size: 12px; color: var(--n-500); margin-top: 2px;">1,18 % blended</div></div>
          <div><div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.08em; font-family: var(--mono);">ÉCONOMIE vs CMI</div><div style="font-size: 22px; font-weight: 600; margin-top: 4px; color: var(--atlas);">+2 840 MAD</div><div style="font-size: 12px; color: var(--n-500); margin-top: 2px;">Vs 2,0 % CMI + loc</div></div>
        </div>

        <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin-bottom: 8px;">CALENDRIER · AVRIL 2026</div>
        <div class="settle-cal">
          ${dow.map(d => `<div class="settle-dow">${d}</div>`).join('')}
          ${cal.map(c => c.pad ? `<div class="settle-cell pad"></div>` : `
            <div class="settle-cell ${c.today ? 'today' : c.settled ? 'settled' : ''}">
              <div class="d">${c.d}</div>
              <div class="amt">${c.today ? 'EN COURS' : (c.amt / 1000).toFixed(1) + 'k'}</div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 22px;">
          <div style="font-size: 11px; color: var(--n-500); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin-bottom: 12px;">HISTORIQUE RÉCENT</div>
          ${[['23 avril', '23 091 MAD', 'Prévu demain 9h00', 'pend'],['22 avril', '19 824 MAD', 'Réglé BMCE ••3291', 'ok'],['21 avril', '17 290 MAD', 'Réglé BMCE ••3291', 'ok'],['20 avril', '21 688 MAD', 'Réglé BMCE ••3291', 'ok'],['19 avril (week-end)', '24 102 MAD', 'Réglé · Virement Instant', 'ok'],['18 avril (week-end)', '22 850 MAD', 'Réglé · Virement Instant', 'ok']].map(([d, a, s, st]) => `
            <div style="display: grid; grid-template-columns: 140px 1fr 140px auto; gap: 14px; padding: 11px 0; border-bottom: 1px solid var(--n-200); align-items: center; font-size: 13px;">
              <div><b>${d}</b></div>
              <div class="mono" style="font-family: var(--mono); font-weight: 500;">${a}</div>
              <div style="color: var(--n-500); font-size: 12px;">${s}</div>
              <div><span class="chip ${st}">${st === 'ok' ? 'Réglé' : 'Attente'}</span></div>
            </div>
          `).join('')}
        </div>
      `,
    });
  };

  /* ═══════════════════ CONFORMITÉ ═══════════════════ */
  handlers['nav-conformite'] = () => {
    drawer({
      title: 'Conformité & Sécurité',
      subtitle: 'Kiwi · Café Atlas · 100 % conforme',
      width: 680,
      body: `
        <div class="comp-score">
          <div class="ring">
            <svg viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="17" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="4"/>
              <circle cx="21" cy="21" r="17" fill="none" stroke="var(--mint)" stroke-width="4" stroke-dasharray="100 107" stroke-dashoffset="25" transform="rotate(-90 21 21)" stroke-linecap="round"/>
            </svg>
            <div class="c">AAA</div>
          </div>
          <div>
            <div class="t">SCORE DE CONFORMITÉ</div>
            <div class="v">100 / 100 · AAA</div>
            <div class="d">Tous les contrôles Bank Al-Maghrib et PCI-DSS passés. Dernier audit : 12 mars 2026.</div>
          </div>
        </div>

        ${[
          ['🏛️', 'Bank Al-Maghrib · sponsoring acquéreur', 'Partenariat actif avec un acquéreur principal licencié. PE en cours.', 'ACTIVE', 'ok'],
          ['🔐', 'PCI-DSS Niveau 1', 'Certification valide jusqu\'au 12 mars 2027. Scope SAQ-D-merchant.', 'VALIDE 2027', 'ok'],
          ['🛡️', 'Tokenisation réseau Visa & Mastercard', 'PAN jamais stocké en clair · network tokens actifs sur 98 % des cartes.', 'ACTIVE', 'ok'],
          ['🧾', 'KYC Café Atlas', 'CIN Rachid Benhima + RC 3847821 + patente valides.', 'VÉRIFIÉ', 'ok'],
          ['📋', 'AML / GAFI', 'Screening UN, EU, OFAC, ANRF à l\'onboarding + monitoring continu.', 'ACTIVE', 'ok'],
          ['🔑', '3-D Secure 2', 'Challenge actif sur CNP > 500 MAD et risque élevé.', 'ACTIVE', 'ok'],
          ['🇲🇦', 'Loi 09-08 · Données personnelles', 'Ledger + KYC hébergés au Maroc (N+ONE Casa). CNDP déclaration OK.', 'CONFORME', 'ok'],
          ['📡', 'Monitoring 24/7', 'Détection fraude temps réel · alertes push/WhatsApp · SLA <5 min.', 'ACTIF', 'ok'],
          ['📅', 'Audit annuel externe', 'Prochain audit : 12 mars 2027. Aucun non-conformité l\'an dernier.', 'PLANIFIÉ', 'warn'],
        ].map(([icn, n, d, st, s]) => `
          <div class="comp-item">
            <div class="icn" style="font-size: 18px;">${icn}</div>
            <div class="body"><div class="n">${n}</div><div class="d">${d}</div></div>
            <div class="status ${s}">${st}</div>
          </div>
        `).join('')}

        <div style="margin-top: 24px; padding: 18px; background: var(--paper-soft); border-radius: 12px; display: flex; gap: 14px; align-items: flex-start;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--atlas)" stroke-width="2" style="flex-shrink: 0; margin-top: 2px;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
          <div style="flex: 1;"><div style="font-weight: 600; margin-bottom: 4px;">Télécharger le rapport de conformité</div><div style="font-size: 12.5px; color: var(--n-500); line-height: 1.4;">PDF signé · à présenter à votre comptable, votre banque ou un auditeur.</div></div>
          <button class="kb atlas" data-action="download-kit">Télécharger</button>
        </div>
      `,
    });
  };

  /* ═══════════════════ ÉQUIPE ═══════════════════ */
  handlers['nav-equipe'] = () => {
    drawer({
      title: 'Équipe Café Atlas',
      subtitle: '8 membres · 4 en service · 4 hors-service',
      width: 680,
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--riad), var(--atlas));">
          <div class="l">PERFORMANCE ÉQUIPE · AUJOURD'HUI</div>
          <div class="big">16 340 <span style="font-size:18px; opacity:0.7;">MAD</span></div>
          <div class="sub">159 transactions · panier moyen 103 MAD · pourboire moyen 12 MAD</div>
        </div>

        <div class="team-grid">
          ${[
            ['RB', '', 'Rachid Benhima', 'Propriétaire · admin', 'En ligne', 'Aujourd\'hui', '—', '—'],
            ['FK', '', 'Fatima Khalki', 'Serveuse senior', '5h 32', '42 tx', '5 240 MAD', '420 tip'],
            ['HJ', 'b', 'Hamid Jelloul', 'Serveur terrasse', '5h 10', '38 tx', '4 680 MAD', '380 tip'],
            ['SB', 'c', 'Sofia Belkadi', 'Barista comptoir', '4h 48', '54 tx', '3 920 MAD', '180 tip'],
            ['YA', 'd', 'Youssef Amrani', 'Serveur · pause', '3h 22', '25 tx', '2 110 MAD', '215 tip'],
            ['MM', 'offline', 'Mehdi Mansouri', 'Cuisine · terminé', '6h 00', '—', '—', '—'],
            ['LN', 'offline', 'Laila Nouri', 'Caissière · terminé', '4h 30', '18 tx', '1 680 MAD', '52 tip'],
            ['AT', 'offline', 'Amine Talhi', 'Runner · congé', '—', '—', '—', '—'],
          ].map(([i, k, n, r, shift, tx, rev, tip]) => `
            <div class="team-mem">
              <div class="top">
                <div class="av ${k}">${i}</div>
                <div style="flex: 1;"><div class="n">${n}</div><div class="role">${r}</div></div>
              </div>
              <div class="kpis">
                <div><div class="k">Shift</div><div class="v">${shift}</div></div>
                <div><div class="k">Transactions</div><div class="v">${tx}</div></div>
                <div><div class="k">Revenu</div><div class="v">${rev}</div></div>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 18px;">
          <button class="kb ghost" style="padding: 14px; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter un membre</button>
          <button class="kb ghost" style="padding: 14px; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>Planning hebdo</button>
        </div>
      `,
    });
  };

  /* ═══════════════════ TABLES & ADDITIONS ═══════════════════ */
  handlers['nav-tables'] = () => {
    modal({
      tag: 'SALLE EN DIRECT',
      title: 'Plan de salle · Café Atlas',
      desc: 'Cliquez une table pour ouvrir l\'addition. Glissez pour réarranger.',
      width: 760,
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, #D99A2B, #8A6210);">
          <div class="l">EN SERVICE</div>
          <div class="big">5 / 8 <span style="font-size:18px; opacity:0.7;">tables occupées</span></div>
          <div class="sub">Couverts : 14 · vélocité moyenne 42 min/table · prochain seating ~15:20</div>
        </div>

        <div class="floor-zone">SALLE INTÉRIEURE</div>
        <div class="floor">
          <div class="tbl occupied">
            <div class="tbl-n">T1</div>
            <div class="tbl-state">4 couverts · 18 min</div>
            <div class="tbl-amt">340 MAD</div>
          </div>
          <div class="tbl paid">
            <div class="tbl-n">T2</div>
            <div class="tbl-state">payé 12:30</div>
            <div class="tbl-amt" style="color:var(--success);">286 MAD</div>
          </div>
          <div class="tbl">
            <div class="tbl-n">T3</div>
            <div class="tbl-state">libre</div>
          </div>
          <div class="tbl pay-pending">
            <div class="tbl-n">T4</div>
            <div class="tbl-state">addition demandée</div>
            <div class="tbl-amt">215 MAD</div>
          </div>
        </div>

        <div class="floor-zone">TERRASSE</div>
        <div class="floor">
          <div class="tbl occupied">
            <div class="tbl-n">T5</div>
            <div class="tbl-state">2 couverts · 6 min</div>
            <div class="tbl-amt">84 MAD</div>
          </div>
          <div class="tbl occupied">
            <div class="tbl-n">T6</div>
            <div class="tbl-state">2 couverts · 24 min</div>
            <div class="tbl-amt">215 MAD</div>
          </div>
          <div class="tbl">
            <div class="tbl-n">T7</div>
            <div class="tbl-state">libre</div>
          </div>
          <div class="tbl occupied">
            <div class="tbl-n">T8</div>
            <div class="tbl-state">1 couvert · 12 min</div>
            <div class="tbl-amt">88 MAD</div>
          </div>
        </div>

        <div style="padding: 14px 16px; background: var(--ink); color: var(--paper); border-radius: 12px; margin-top: 20px; display: flex; gap: 12px; align-items: center;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--mint)" stroke-width="2"><path d="M12 2l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="currentColor"/></svg>
          <div style="flex: 1; font-size: 13.5px; line-height: 1.4;"><b style="color:var(--mint);">T4 attend l'addition depuis 4 min.</b> Voulez-vous alerter Fatima ?</div>
          <button class="kb" style="background: var(--mint); color: var(--riad);">Alerter</button>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button class="kb primary" data-action="new-sale">+ Ouvrir une nouvelle table</button>
      `
    });
  };

  /* ═══════════════════ MENU & MODIFICATEURS ═══════════════════ */
  handlers['nav-menu'] = () => {
    drawer({
      title: 'Menu & modificateurs',
      subtitle: '48 items · 4 catégories · 12 modificateurs actifs',
      width: 680,
      body: `
        <div class="p-toolbar">
          <div class="p-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>Rechercher un item…</div>
          <button class="kb primary"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>Ajouter</button>
        </div>

        <div class="menu-cat">
          <div class="menu-cat-head">
            <h4>🥗 Entrées <span style="color:var(--n-500); font-weight: 400; font-size: 13px;">· 8 items</span></h4>
            <div class="count">moyenne : 28 MAD</div>
          </div>
          ${[['Salade marocaine', 'Tomate, concombre, oignon, huile d\'olive', '32,00', 'ok', '87 % stock'],['Bissara', 'Fèves moulues, cumin, huile d\'olive', '22,00', 'ok', 'illimité'],['Zaalouk', 'Aubergine fumée, tomate, ail', '28,00', 'low', '6 portions'],['Briouates à la viande', 'Triangles croustillants, boeuf mijoté', '45,00', 'ok', '32 portions'],['Caviar d\'aubergine', 'Mezze traditionnel marocain', '35,00', 'ok', '24 portions']].map(([n, d, p, st, stock]) => `
            <div class="menu-item">
              <div class="name">${n}<div class="desc">${d}</div></div>
              <div class="price">${p} MAD</div>
              <div class="avail ${st}">${stock}</div>
              <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            </div>
          `).join('')}
        </div>

        <div class="menu-cat">
          <div class="menu-cat-head">
            <h4>🍽️ Plats <span style="color:var(--n-500); font-weight: 400; font-size: 13px;">· 14 items</span></h4>
            <div class="count">moyenne : 82 MAD</div>
          </div>
          ${[['Tajine kefta œuf', 'Viande hachée, œuf, tomate, épices', '85,00', 'ok', '+ 3 modificateurs'],['Couscous royal vendredi', 'Boeuf, poulet, merguez, légumes', '120,00', 'ok', 'vendredi uniquement'],['Pastilla au poulet', 'Feuille fine, amandes, cannelle, sucre', '95,00', 'low', '3 portions'],['Tajine agneau pruneaux', 'Agneau mijoté, pruneaux, amandes', '110,00', 'out', '0 portion'],['Poulet méchoui', 'Poulet rôti, épices, citron confit', '98,00', 'ok', '+ 2 modificateurs']].map(([n, d, p, st, stock]) => `
            <div class="menu-item">
              <div class="name">${n}<div class="desc">${d}</div></div>
              <div class="price">${p} MAD</div>
              <div class="avail ${st}">${stock}</div>
              <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            </div>
          `).join('')}
        </div>

        <div class="menu-cat">
          <div class="menu-cat-head">
            <h4>☕ Boissons <span style="color:var(--n-500); font-weight: 400; font-size: 13px;">· 18 items</span></h4>
            <div class="count">moyenne : 18 MAD</div>
          </div>
          ${[['Thé à la menthe', 'Gunpowder + menthe fraîche + sucre', '12,00', 'ok', 'illimité'],['Café noir double', 'Expresso double · grain Algeria', '14,00', 'ok', '+ 4 modif. lait'],['Orange pressée', 'Pressée minute sur demande', '18,00', 'ok', '45 oranges'],['Limonade traditionnelle', 'Citron vert + eau de fleur d\'oranger', '16,00', 'ok', 'illimité'],['Smoothie dattes-lait', 'Dattes Majhoul, lait, cannelle', '24,00', 'low', '8 portions']].map(([n, d, p, st, stock]) => `
            <div class="menu-item">
              <div class="name">${n}<div class="desc">${d}</div></div>
              <div class="price">${p} MAD</div>
              <div class="avail ${st}">${stock}</div>
              <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            </div>
          `).join('')}
        </div>

        <div class="menu-cat">
          <div class="menu-cat-head">
            <h4>🍮 Desserts <span style="color:var(--n-500); font-weight: 400; font-size: 13px;">· 8 items</span></h4>
            <div class="count">moyenne : 32 MAD</div>
          </div>
          ${[['Sellou', 'Graines de sésame, amandes, miel', '30,00', 'ok', 'artisanal'],['Cornes de gazelle', 'Pâte d\'amande, fleur d\'oranger', '28,00', 'low', '12 pièces'],['Msemen beurre miel', 'Crêpe feuilletée, beurre, miel', '22,00', 'ok', 'illimité'],['Chebakia', 'Gâteaux de miel frit · Ramadan', '24,00', 'out', 'saisonnier']].map(([n, d, p, st, stock]) => `
            <div class="menu-item">
              <div class="name">${n}<div class="desc">${d}</div></div>
              <div class="price">${p} MAD</div>
              <div class="avail ${st}">${stock}</div>
              <div class="more"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></div>
            </div>
          `).join('')}
        </div>
      `,
    });
  };

  /* ═══════════════════ KDS (kitchen display) ═══════════════════ */
  handlers['nav-kds'] = () => {
    modal({
      tag: 'ÉCRAN CUISINE',
      title: 'Kitchen Display System · service midi',
      desc: '8 tickets en préparation · SLA 12 min · optimisé pour iPad mural',
      width: 900,
      body: `
        <div class="kds-grid">
          <div>
            <div class="kds-col-head">❄ Froide <span class="count">3</span></div>
            <div class="kds-col-body">
              <div class="kds-ticket">
                <div class="thead"><span>T1 · Fatima</span><span class="timer">04:22</span></div>
                <ul class="items"><li>Salade marocaine × 1</li><li>Zaalouk</li><li>Pain complet</li></ul>
              </div>
              <div class="kds-ticket glovo">
                <div class="thead"><span>GLOVO #3412</span><span class="timer warn">09:18</span></div>
                <ul class="items"><li>Salade marocaine × 2</li><li>Bissara × 1</li></ul>
              </div>
              <div class="kds-ticket">
                <div class="thead"><span>T6 · Hamid</span><span class="timer">01:04</span></div>
                <ul class="items"><li>Caviar d'aubergine</li><li>Briouates × 4</li></ul>
              </div>
            </div>
          </div>

          <div>
            <div class="kds-col-head">🔥 Chaude <span class="count">4</span></div>
            <div class="kds-col-body">
              <div class="kds-ticket">
                <div class="thead"><span>T1 · Fatima</span><span class="timer">04:22</span></div>
                <ul class="items"><li>Tajine kefta œuf × 2</li><li>Pastilla poulet</li></ul>
              </div>
              <div class="kds-ticket jumia">
                <div class="thead"><span>JUMIA #8821</span><span class="timer warn">11:44</span></div>
                <ul class="items"><li>Couscous royal × 1</li><li>Poulet méchoui</li></ul>
              </div>
              <div class="kds-ticket">
                <div class="thead"><span>T8 · terrasse</span><span class="timer">02:15</span></div>
                <ul class="items"><li>Tajine kefta × 1</li></ul>
              </div>
              <div class="kds-ticket glovo">
                <div class="thead"><span>GLOVO #3414</span><span class="timer over">14:02</span></div>
                <ul class="items"><li>Pastilla × 1</li></ul>
              </div>
            </div>
          </div>

          <div>
            <div class="kds-col-head">☕ Bar <span class="count">1</span></div>
            <div class="kds-col-body">
              <div class="kds-ticket">
                <div class="thead"><span>Comptoir · Sofia</span><span class="timer">00:42</span></div>
                <ul class="items"><li>Thé menthe × 3</li><li>Café double × 2</li><li>Orange pressée × 2</li></ul>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--n-200);">
          <div style="font-size: 13px; color: var(--n-500);">Moyenne de préparation : <b style="color: var(--ink);">8 min 14 s</b> · SLA respecté à <b style="color: var(--success);">87 %</b></div>
          <button class="kb atlas">📲 Basculer plein écran</button>
        </div>
      `,
    });
  };

  /* ═══════════════════ STOCK INGRÉDIENTS ═══════════════════ */
  handlers['nav-stock'] = () => {
    drawer({
      title: 'Stock ingrédients',
      subtitle: '42 ingrédients suivis · 5 en alerte · réappro auto active',
      width: 680,
      body: `
        <div class="p-hero" style="background: linear-gradient(135deg, var(--warning), #8A6210);">
          <div class="l">ALERTES STOCK · AUJOURD'HUI</div>
          <div class="big">5 <span style="font-size:18px; opacity:0.7;">ingrédients faibles</span></div>
          <div class="sub">2 ruptures totales · commande automatique possible</div>
        </div>

        <div style="font-size: 11px; color: var(--danger); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin-bottom: 10px;">🔴 RUPTURE</div>
        <div class="stock-row">
          <div class="icn">🥬</div>
          <div><div class="name">Feuilles de brick</div><div class="sup">Fournisseur · Feuilletier Derb Omar</div></div>
          <div class="bar out"><div style="width:0%;"></div></div>
          <div class="qty" style="color: var(--danger);">0 / 80</div>
          <button class="kb atlas" style="padding:6px 10px; font-size:11px;">Commander</button>
        </div>
        <div class="stock-row">
          <div class="icn">🫐</div>
          <div><div class="name">Pruneaux</div><div class="sup">Fournisseur · Épicerie Chaouen</div></div>
          <div class="bar out"><div style="width:0%;"></div></div>
          <div class="qty" style="color: var(--danger);">0 kg / 3 kg</div>
          <button class="kb atlas" style="padding:6px 10px; font-size:11px;">Commander</button>
        </div>

        <div style="font-size: 11px; color: var(--warning); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin: 20px 0 10px;">🟡 STOCK BAS</div>
        <div class="stock-row">
          <div class="icn">🍅</div>
          <div><div class="name">Tomates fraîches</div><div class="sup">Marché central · livraison quotidienne</div></div>
          <div class="bar low"><div style="width:22%;"></div></div>
          <div class="qty">2,4 / 11 kg</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Ajuster</button>
        </div>
        <div class="stock-row">
          <div class="icn">🥚</div>
          <div><div class="name">Œufs (plateaux 30)</div><div class="sup">Ferme Ben Slimane</div></div>
          <div class="bar low"><div style="width:30%;"></div></div>
          <div class="qty">3 / 10 plateaux</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Ajuster</button>
        </div>
        <div class="stock-row">
          <div class="icn">🌶️</div>
          <div><div class="name">Paprika fumé</div><div class="sup">Épicerie Chaouen</div></div>
          <div class="bar low"><div style="width:18%;"></div></div>
          <div class="qty">180 / 1000 g</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Ajuster</button>
        </div>

        <div style="font-size: 11px; color: var(--success); letter-spacing: 0.1em; font-family: var(--mono); text-transform: uppercase; margin: 20px 0 10px;">🟢 STOCK OK · APERÇU</div>
        <div class="stock-row">
          <div class="icn">🍋</div>
          <div><div class="name">Citrons jaunes</div><div class="sup">Marché central</div></div>
          <div class="bar"><div style="width:86%;"></div></div>
          <div class="qty">17 / 20 kg</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Voir</button>
        </div>
        <div class="stock-row">
          <div class="icn">🫒</div>
          <div><div class="name">Huile d'olive extra</div><div class="sup">Coopérative Meknès · 5L</div></div>
          <div class="bar"><div style="width:72%;"></div></div>
          <div class="qty">12 / 16 L</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Voir</button>
        </div>
        <div class="stock-row">
          <div class="icn">🍚</div>
          <div><div class="name">Couscous moyen</div><div class="sup">Coopérative Atlas</div></div>
          <div class="bar"><div style="width:94%;"></div></div>
          <div class="qty">28 / 30 kg</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Voir</button>
        </div>
        <div class="stock-row">
          <div class="icn">🌿</div>
          <div><div class="name">Menthe fraîche</div><div class="sup">Marché central · quotidien</div></div>
          <div class="bar"><div style="width:66%;"></div></div>
          <div class="qty">3,2 / 5 kg</div>
          <button class="kb ghost" style="padding:6px 10px; font-size:11px;">Voir</button>
        </div>
      `,
      foot: `
        <button class="kb ghost" style="flex:1; justify-content:center;">📦 Historique commandes</button>
        <button class="kb atlas" style="flex:1; justify-content:center;">✓ Valider commande groupée</button>
      `
    });
  };

  /* ═══════════════════ RÉSERVATIONS & RENDEZ-VOUS ═══════════════════ */
  handlers['nav-reservations'] = () => {
    const r = drawer({
      title: 'Réservations & rendez-vous',
      subtitle: 'Trois métiers · une plateforme client unique',
      width: 920,
      body: `
        <div class="p-hero">
          <div class="l">SAMEDI 25 AVRIL · CAFÉ ATLAS</div>
          <div class="big">12 <span style="font-size:18px; opacity:0.7;">réservations confirmées</span></div>
          <div class="sub">38 couverts prévus · 2 acomptes en attente · liste d'attente : 3 personnes</div>
        </div>

        <div class="resv-tabs" role="tablist">
          <button class="resv-tab on" data-resv-tab="resto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M5 6v12a2 2 0 002 2h10a2 2 0 002-2V6"/></svg>
            Restaurants
          </button>
          <button class="resv-tab" data-resv-tab="spa">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c-3 4-3 8 0 12 3-4 3-8 0-12zM4 22c2-4 6-4 8-4s6 0 8 4"/></svg>
            Spas & hammams
          </button>
          <button class="resv-tab" data-resv-tab="salon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="18" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8 16L20 4M16 16L4 4"/></svg>
            Salons & barbiers
          </button>
        </div>

        <!-- ─── RESTAURANT PANE ─── -->
        <div class="resv-pane" data-resv-pane="resto">
          <div class="resv-section">
            <div class="resv-section-head">
              <h4>Réservations du jour</h4>
              <button class="kb ghost" data-action="add-reservation">+ Ajouter</button>
            </div>
            <div class="resv-line">
              <div class="t">12:30</div>
              <div class="info"><div class="n">Famille Bensaïd</div><div class="m">4 couverts · terrasse · +212 6 12 34 56 78</div></div>
              <span class="chip ok">Confirmé</span>
            </div>
            <div class="resv-line">
              <div class="t">13:15</div>
              <div class="info"><div class="n">Tarik &amp; Yasmine</div><div class="m">2 couverts · salle · client régulier · 12 visites</div></div>
              <span class="chip ok">Confirmé</span>
            </div>
            <div class="resv-line">
              <div class="t">19:30</div>
              <div class="info"><div class="n">Anniversaire — Karim B.</div><div class="m">8 couverts · acompte 200 MAD reçu · gâteau prévu 21h</div></div>
              <span class="chip ok">Acompte ✓</span>
            </div>
            <div class="resv-line">
              <div class="t">20:00</div>
              <div class="info"><div class="n">Société Atlas Pharma</div><div class="m">12 couverts · groupe · acompte 400 MAD demandé</div></div>
              <span class="chip pend">Acompte attendu</span>
            </div>
            <div class="resv-line">
              <div class="t">21:00</div>
              <div class="info"><div class="n">Sara L. &amp; invités</div><div class="m">6 couverts · sans préférence</div></div>
              <span class="chip ok">Confirmé</span>
            </div>
          </div>

          <div class="resv-grid-2">
            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">LISTE D'ATTENTE</div><div class="rc-count">3 EN FILE</div></div>
              <div class="resv-wait">
                <div><b>+212 6 22 11 09 88</b><div class="m">2 pers · prêt dans ~12 min</div></div>
                <button class="kb atlas" data-action="resv-sms">SMS prêt →</button>
              </div>
              <div class="resv-wait">
                <div><b>Mehdi R.</b><div class="m">4 pers · prêt dans ~25 min</div></div>
                <button class="kb ghost" data-action="resv-sms">SMS</button>
              </div>
              <div class="resv-wait">
                <div><b>+212 6 41 02 76 12</b><div class="m">2 pers · prêt dans ~40 min</div></div>
                <button class="kb ghost" data-action="resv-sms">SMS</button>
              </div>
              <div class="rc-foot">SMS automatique « votre table est prête » dès qu'une table se libère pour le bon nombre de couverts.</div>
            </div>

            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">SUIVI NO-SHOW PAR NUMÉRO</div></div>
              <div class="resv-wait">
                <div><b>+212 6 78 22 14 09</b><div class="m">2 absences en 6 mois · risque modéré</div></div>
                <span class="chip pend">Acompte requis</span>
              </div>
              <div class="resv-wait">
                <div><b>+212 6 11 88 04 27</b><div class="m">3 absences consécutives · client bloqué</div></div>
                <span class="chip ref">Bloqué</span>
              </div>
              <div class="rc-foot">Acompte automatique demandé après 2 no-show · verrouillage à 3.</div>
            </div>
          </div>
        </div>

        <!-- ─── SPA & HAMMAM PANE ─── -->
        <div class="resv-pane" data-resv-pane="spa" hidden>
          <div class="resv-section">
            <div class="resv-section-head">
              <h4>Réservation multi-services · Yasmine F. (cliente)</h4>
              <button class="kb ghost" data-action="resv-builder">+ Construire un parcours</button>
            </div>
            <div class="resv-builder">
              <div class="rb-step ok">
                <div class="rb-icn">1</div>
                <div class="rb-body"><b>Hammam traditionnel</b><div class="m">45 min · cabine vapeur 2 · 14:00–14:45</div></div>
                <div class="rb-price">220 MAD</div>
              </div>
              <div class="rb-step ok">
                <div class="rb-icn">2</div>
                <div class="rb-body"><b>Massage relaxant</b><div class="m">60 min · thérapeute Yasmine · cabine 1 · 15:00–16:00</div></div>
                <div class="rb-price">380 MAD</div>
              </div>
              <div class="rb-step ok">
                <div class="rb-icn">3</div>
                <div class="rb-body"><b>Soin visage à l'argan</b><div class="m">30 min · esthéticienne Hind · cabine 3 · 16:15–16:45</div></div>
                <div class="rb-price">240 MAD</div>
              </div>
              <div class="rb-total">
                <span>Forfait Atlas Détente · 2 h 15</span>
                <b>840 MAD</b>
              </div>
              <button class="kb atlas" style="width:100%; justify-content:center; margin-top:10px;" data-action="payment-link">Envoyer un lien de paiement amont →</button>
            </div>
          </div>

          <div class="resv-grid-2">
            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">CABINES & SALLES · AUJOURD'HUI</div></div>
              <div class="resv-rooms">
                <div class="rr"><b>Cabine 1 · Massage</b><div class="m">14h–17h · Yasmine</div><div class="bar"><div style="width:62%; background:var(--atlas);"></div></div></div>
                <div class="rr"><b>Cabine 2 · Vapeur</b><div class="m">11h–18h · 50 % libre</div><div class="bar"><div style="width:50%; background:#D99A2B;"></div></div></div>
                <div class="rr"><b>Cabine 3 · Soin visage</b><div class="m">12h–19h · Hind</div><div class="bar"><div style="width:78%; background:var(--atlas);"></div></div></div>
                <div class="rr"><b>Cabine 4 · Hammam priv.</b><div class="m">complet jusqu'à 20h</div><div class="bar"><div style="width:100%; background:var(--danger);"></div></div></div>
              </div>
            </div>

            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">FORFAITS ACTIFS</div><div class="rc-count">39 abonnés</div></div>
              <div class="resv-pkg"><div><b>Atlas Détente · 5 séances</b><div class="m">9 vendus ce mois · 1 800 MAD / pers</div></div><span class="chip ok">+ 9</span></div>
              <div class="resv-pkg"><div><b>Mariée du jour · journée complète</b><div class="m">2 réservations à venir · 4 200 MAD</div></div><span class="chip ok">Premium</span></div>
              <div class="resv-pkg"><div><b>Hammam mensuel illimité</b><div class="m">28 abonnés · MRR 8 400 MAD</div></div><span class="chip neutral">Récurrent</span></div>
              <div class="rc-foot">Pré-paiement obligatoire pour les forfaits journée + caution sur les groupes.</div>
            </div>
          </div>
        </div>

        <!-- ─── SALON & BARBER PANE ─── -->
        <div class="resv-pane" data-resv-pane="salon" hidden>
          <div class="resv-section">
            <div class="resv-section-head">
              <h4>Calendrier par coiffeur · samedi 25 avril</h4>
              <div class="resv-legend">
                <span><i style="background:var(--atlas);"></i>Coupe</span>
                <span><i style="background:var(--mint);"></i>Couleur</span>
                <span><i style="background:var(--warning);"></i>Soin</span>
              </div>
            </div>
            <div class="resv-cal">
              <div class="rcal-row">
                <div class="rcal-name">Hicham · barbier</div>
                <div class="rcal-track">
                  <div class="rcal-block" style="left:5%; width:8%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:18%; width:6%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:30%; width:10%; background:var(--atlas);">Coupe + barbe</div>
                  <div class="rcal-block" style="left:55%; width:8%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:75%; width:8%; background:var(--atlas);">Coupe</div>
                </div>
              </div>
              <div class="rcal-row">
                <div class="rcal-name">Khadija · coloriste</div>
                <div class="rcal-track">
                  <div class="rcal-block" style="left:8%; width:22%; background:var(--mint); color:var(--riad);">Couleur · 90 min</div>
                  <div class="rcal-block" style="left:42%; width:14%; background:var(--warning);">Soin · 60 min</div>
                  <div class="rcal-block" style="left:65%; width:22%; background:var(--mint); color:var(--riad);">Couleur · 90 min</div>
                </div>
              </div>
              <div class="rcal-row">
                <div class="rcal-name">Soufiane · senior</div>
                <div class="rcal-track">
                  <div class="rcal-block" style="left:5%; width:7%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:15%; width:14%; background:var(--mint); color:var(--riad);">Mèches · 75 min</div>
                  <div class="rcal-block" style="left:38%; width:8%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:52%; width:8%; background:var(--atlas);">Coupe</div>
                  <div class="rcal-block" style="left:66%; width:14%; background:var(--warning);">Soin défrisant</div>
                </div>
              </div>
            </div>
            <div class="rcal-axis"><span>9h</span><span>11h</span><span>13h</span><span>15h</span><span>17h</span><span>19h</span></div>
          </div>

          <div class="resv-grid-2">
            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">RENDEZ-VOUS RÉCURRENTS</div><div class="rc-count">14 clients</div></div>
              <div class="resv-wait"><div><b>Karim B.</b><div class="m">Coupe mensuelle · prochain 25 mai · Hicham</div></div><span class="chip ok">Auto</span></div>
              <div class="resv-wait"><div><b>Naima O.</b><div class="m">Couleur tous les 6 sem. · prochain 6 juin · Khadija</div></div><span class="chip ok">Auto</span></div>
              <div class="resv-wait"><div><b>Anouar T.</b><div class="m">Coupe + barbe · 2× / mois · prochain 9 mai</div></div><span class="chip ok">Auto</span></div>
              <div class="rc-foot">Confirmation WhatsApp 48 h avant. Annulation possible en 1 clic.</div>
            </div>

            <div class="resv-card">
              <div class="rc-head"><div class="rc-tag">FILE WALK-IN · TABLETTE D'ENTRÉE</div></div>
              <div class="resv-walkin">
                <div class="wk on"><span class="wk-n">1</span><div><b>Mounir</b><div class="m">Coupe · à appeler dans ~5 min</div></div></div>
                <div class="wk"><span class="wk-n">2</span><div><b>Adam</b><div class="m">Coupe + barbe · ~25 min</div></div></div>
                <div class="wk"><span class="wk-n">3</span><div><b>Walid</b><div class="m">Coupe · ~40 min</div></div></div>
                <div class="wk"><span class="wk-n">4</span><div><b>+212 6 78 09 ··</b><div class="m">Inscrit en distanciel · ~55 min</div></div></div>
              </div>
              <div class="rc-foot">Le client voit sa position en direct depuis son téléphone · SMS quand il reste 2 personnes avant lui.</div>
            </div>
          </div>
        </div>

        <!-- ─── SHARED ENGINE ─── -->
        <div class="resv-engine">
          <div class="re-tag">SOUS LES 3 MODULES · UN SEUL MOTEUR</div>
          <h4>Le moteur partagé Kiwi</h4>
          <p class="re-sub">Une plateforme client unique. Trois UX adaptées au métier. Aucune double-saisie.</p>
          <div class="re-grid">
            <div class="re-tile">
              <div class="re-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a4 4 0 014-4h8a4 4 0 014 4v2"/></svg></div>
              <h5>Profil client unifié</h5>
              <p>Anniversaire, préférences, allergies, historique de visites — partagés entre vos différents services et points de vente.</p>
            </div>
            <div class="re-tile">
              <div class="re-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg></div>
              <h5>Rappels WhatsApp</h5>
              <p>Confirmation 24 h avant, rappel 2 h avant. Le client répond « OK » ou « non » — vous voyez le résultat en direct.</p>
            </div>
            <div class="re-tile">
              <div class="re-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1015-6.7L21 8M21 3v5h-5"/></svg></div>
              <h5>Reprogrammer en 1 clic</h5>
              <p>Le rappel WhatsApp contient un lien personnel. Le client choisit lui-même un nouveau créneau, votre planning se met à jour.</p>
            </div>
            <div class="re-tile">
              <div class="re-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-4.5-7-11a5 5 0 019-3 5 5 0 019 3c0 6.5-7 11-7 11z"/></svg></div>
              <h5>« On vous a manqué »</h5>
              <p>Après 6 semaines sans visite, Kiwi envoie un message contextuel — parfois avec une remise. 1 client sur 3 revient.</p>
            </div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button class="kb primary" data-action="add-reservation">+ Nouvelle réservation</button>
      `,
    });
    r.el.querySelector('.kiwi-drawer').classList.add('page-xl');

    // Tab switcher inside the drawer
    r.el.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-resv-tab]');
      if (!tab) return;
      const k = tab.dataset.resvTab;
      r.el.querySelectorAll('[data-resv-tab]').forEach(t => t.classList.toggle('on', t.dataset.resvTab === k));
      r.el.querySelectorAll('[data-resv-pane]').forEach(p => { p.hidden = (p.dataset.resvPane !== k); });
    });
  };

  /* Stub handlers used inside the reservations drawer */
  handlers['add-reservation'] = () => toast('Nouvelle réservation', { type: 'info', desc: 'Sélectionnez date, heure, nombre de couverts puis envoyez la confirmation WhatsApp.' });
  handlers['resv-sms'] = () => toast('SMS « votre table est prête » envoyé', { type: 'success', desc: 'Délivré dans 5 secondes.' });
  handlers['resv-builder'] = () => toast('Parcours multi-services', { type: 'info', desc: 'Enchaînez Hammam → Massage → Soin avec auto-allocation des cabines.' });

  /* ═══════════════════ PAIE & PLANNING ═══════════════════ */
  handlers['nav-payroll'] = () => {
    const r = drawer({
      title: 'Paie & planning',
      subtitle: 'Pointage POS · pourboires partagés · ratio main d\'œuvre',
      width: 920,
      body: `
        <div class="p-hero">
          <div class="l">SAMEDI 25 AVRIL · MAIN D'ŒUVRE</div>
          <div class="big">4 / 5 <span style="font-size:18px; opacity:0.7;">employés pointés</span></div>
          <div class="sub">Coût aujourd'hui <b style="color:var(--mint);">1 240 MAD</b> · ratio 16,8 % des ventes — sain</div>
        </div>

        <div class="sh-section">
          <div class="sh-section-head">
            <div>
              <h4>Pointage en direct · service du soir</h4>
              <div class="sub">Tap sur la carte Kiwi ou code PIN pour pointer · 4 actifs · 1 sorti</div>
            </div>
            <button class="kb ghost" data-action="manual-clock">+ Pointage manuel</button>
          </div>
          <div class="sh-clock-row">
            <div class="av">FK</div>
            <div class="who"><div class="n">Fatima Khalki</div><div class="role">Serveuse senior</div></div>
            <div class="sh-bar" title="Entrée 08:12"><div class="work" style="left:6%; width:69%;"></div><div class="now" style="left:75%;"></div></div>
            <div class="dur"><span class="l">DURÉE</span>6 h 25</div>
            <button class="kb ghost" data-action="clock-out">Sortie</button>
          </div>
          <div class="sh-clock-row">
            <div class="av b">HJ</div>
            <div class="who"><div class="n">Hamid Jelloul</div><div class="role">Serveur · terrasse</div></div>
            <div class="sh-bar" title="Entrée 09:00"><div class="work" style="left:13%; width:62%;"></div><div class="now" style="left:75%;"></div></div>
            <div class="dur"><span class="l">DURÉE</span>5 h 38</div>
            <button class="kb ghost" data-action="clock-out">Sortie</button>
          </div>
          <div class="sh-clock-row">
            <div class="av c">SB</div>
            <div class="who"><div class="n">Sofia Belkadi</div><div class="role">Barista · comptoir</div></div>
            <div class="sh-bar" title="Entrée 09:30"><div class="work" style="left:17%; width:58%;"></div><div class="now" style="left:75%;"></div></div>
            <div class="dur"><span class="l">DURÉE</span>5 h 08</div>
            <button class="kb ghost" data-action="clock-out">Sortie</button>
          </div>
          <div class="sh-clock-row">
            <div class="av d">YA</div>
            <div class="who"><div class="n">Youssef Amrani</div><div class="role">Serveur · pause depuis 14:12</div></div>
            <div class="sh-bar" title="Entrée 11:00 · pause 14:12"><div class="work" style="left:25%; width:38%;"></div><div class="brk" style="left:63%; width:6%;"></div><div class="now" style="left:75%;"></div></div>
            <div class="dur"><span class="l">DURÉE</span>3 h 22</div>
            <span class="chip pend">En pause</span>
          </div>
          <div class="sh-clock-row">
            <div class="av off">MM</div>
            <div class="who"><div class="n">Mehdi Mansouri</div><div class="role">Cuisine · sorti à 14:00</div></div>
            <div class="sh-bar" title="Service terminé"><div class="work" style="left:0%; width:58%; opacity:0.45;"></div></div>
            <div class="dur"><span class="l">TOTAL</span>5 h 12</div>
            <span class="chip neutral">Terminé</span>
          </div>
        </div>

        <div class="sh-section">
          <div class="sh-section-head">
            <div>
              <h4>Planning · semaine du 21 au 27 avril</h4>
              <div class="sub">Glissez une cellule pour modifier · WhatsApp envoyé à l'équipe à chaque mise à jour</div>
            </div>
            <button class="kb ghost" data-action="edit-shifts">Modifier le planning</button>
          </div>
          <div class="sh-week">
            <div></div>
            <div class="head">Lun 21</div>
            <div class="head">Mar 22</div>
            <div class="head">Mer 23</div>
            <div class="head">Jeu 24</div>
            <div class="head">Ven 25</div>
            <div class="head today">Sam 26</div>
            <div class="head">Dim 27</div>

            <div class="name">Fatima · serveuse</div>
            <div class="cell morning"><div class="h">8–17</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">8–17</div><div class="d">JOUR</div></div>
            <div class="cell off"><div class="h">off</div></div>
            <div class="cell morning"><div class="h">8–17</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">8–17</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">8–17</div><div class="d">JOUR</div></div>
            <div class="cell off"><div class="h">off</div></div>

            <div class="name">Hamid · serveur</div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>
            <div class="cell off"><div class="h">off</div></div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">12–22</div><div class="d">SOIR</div></div>

            <div class="name">Sofia · barista</div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>
            <div class="cell off"><div class="h">off</div></div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>
            <div class="cell day"><div class="h">9–15</div><div class="d">COMPTOIR</div></div>

            <div class="name">Youssef · serveur</div>
            <div class="cell off"><div class="h">off</div></div>
            <div class="cell evening"><div class="h">17–23</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">17–23</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">17–23</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">17–23</div><div class="d">SOIR</div></div>
            <div class="cell evening"><div class="h">11–23</div><div class="d">DOUBLE</div></div>
            <div class="cell off"><div class="h">off</div></div>

            <div class="name">Mehdi · cuisine</div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell morning"><div class="h">7–14</div><div class="d">JOUR</div></div>
            <div class="cell off"><div class="h">off</div></div>
          </div>
        </div>

        <div class="sh-grid-2">
          <div class="sh-section" style="margin-bottom:0;">
            <div class="sh-section-head" style="margin-bottom:10px;">
              <div>
                <h4>Pourboires partagés</h4>
                <div class="sub">Pool 1 867 MAD aujourd'hui · à distribuer en fin de service</div>
              </div>
            </div>
            <div class="sh-tip-cfg">
              <div>
                <b>Pool partagé Café Atlas</b>
                <div class="m">60 % salle · 25 % bar · 15 % cuisine · réparti aux heures travaillées</div>
              </div>
              <button class="kb ghost" data-action="edit-tip-rule">Modifier</button>
            </div>
            <div class="sh-tip-pool">
              <div class="av a">FK</div>
              <div><b>Fatima</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">salle · 6h25</div></div>
              <div class="pct">35 %</div>
              <div class="amt">+654 MAD</div>
            </div>
            <div class="sh-tip-pool">
              <div class="av b">HJ</div>
              <div><b>Hamid</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">salle · 5h38</div></div>
              <div class="pct">30 %</div>
              <div class="amt">+560 MAD</div>
            </div>
            <div class="sh-tip-pool">
              <div class="av c">SB</div>
              <div><b>Sofia</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">bar · 5h08</div></div>
              <div class="pct">25 %</div>
              <div class="amt">+467 MAD</div>
            </div>
            <div class="sh-tip-pool">
              <div class="av d">MM</div>
              <div><b>Mehdi</b><div style="font-size:11px; color:var(--n-500); margin-top:2px;">cuisine · 5h12</div></div>
              <div class="pct">10 %</div>
              <div class="amt">+186 MAD</div>
            </div>
            <button class="kb atlas" style="width:100%; justify-content:center; margin-top:14px;" data-action="distribute-tips">Distribuer · WhatsApp à l'équipe →</button>
          </div>

          <div class="sh-section" style="margin-bottom:0;">
            <div class="sh-section-head" style="margin-bottom:10px;">
              <div>
                <h4>Coût main d'œuvre vs ventes</h4>
                <div class="sub">Ratio cible &lt; 30 % · benchmark cafés Casa 28 %</div>
              </div>
            </div>
            <div class="sh-lvs">
              <div class="sh-lvs-head">
                <div>
                  <div class="sh-lvs-num">16,8<span class="u">%</span></div>
                  <div style="font-size:11px; color:var(--n-500); margin-top:4px; font-family:var(--mono); letter-spacing:0.04em;">AUJ. · 1 240 / 7 380 MAD</div>
                </div>
                <span class="chip ok">SAIN</span>
              </div>
              <svg viewBox="0 0 280 120" style="width:100%; height:120px; margin-top:6px;">
                <line x1="0" y1="42" x2="280" y2="42" stroke="#A8A49A" stroke-dasharray="3 3" stroke-width="1"/>
                <text x="278" y="38" text-anchor="end" font-family="JetBrains Mono" font-size="9" fill="#6F6C65">cible 30 %</text>
                ${[
                  ['Lun', 22], ['Mar', 19], ['Mer', 24], ['Jeu', 18], ['Ven', 17], ['Sam', 16.8], ['Dim', 0],
                ].map(([day, pct], i) => {
                  const x = 8 + i * 38;
                  const h = pct === 0 ? 0 : (pct / 35) * 88;
                  const y = 102 - h;
                  const isToday = i === 5;
                  const isFuture = pct === 0;
                  const fill = isFuture ? '#E8E6E0' : isToday ? '#0B6E4F' : '#7DF2B0';
                  return `<g><rect x="${x}" y="${y}" width="22" height="${h}" rx="3" fill="${fill}"/><text x="${x + 11}" y="116" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="${isToday ? '#0B6E4F' : '#6F6C65'}" font-weight="${isToday ? '600' : '400'}">${day}</text>${pct > 0 ? `<text x="${x + 11}" y="${y - 4}" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#0A0F0D">${pct}%</text>` : ''}</g>`;
                }).join('')}
              </svg>
              <div class="sh-lvs-foot">
                <label><i style="background:var(--atlas);"></i>Aujourd'hui</label>
                <label><i style="background:var(--mint);"></i>7 derniers jours</label>
                <label><i style="background:#A8A49A;"></i>Cible</label>
              </div>
            </div>
            <div style="margin-top:12px; padding:11px 14px; background: var(--atlas); color: var(--paper); border-radius:10px; font-size:12.5px; line-height:1.45;">
              <b style="color:var(--mint);">Insight :</b> ratio sous le marché de <b>11 pts</b>. Vous pouvez ajouter un 6ᵉ employé samedi soir sans dépasser la cible.
            </div>
          </div>
        </div>
      `,
      foot: `
        <button class="kb ghost" data-dismiss>Fermer</button>
        <button class="kb primary" data-action="export-payroll">Exporter la paie du mois</button>
      `,
    });
    r.el.querySelector('.kiwi-drawer').classList.add('page-xl');
  };

  /* Stub handlers used inside the payroll drawer */
  handlers['manual-clock'] = () => toast('Pointage manuel', { type: 'info', desc: 'Sélectionnez l\'employé puis l\'heure d\'entrée ou de sortie.' });
  handlers['clock-out'] = (el) => {
    const row = el?.closest('.sh-clock-row');
    const name = row?.querySelector('.who .n')?.textContent || 'Employé';
    toast(`${name} · sortie pointée`, { type: 'success', desc: 'Heure de fin enregistrée. Récap WhatsApp envoyé.' });
  };
  handlers['edit-shifts'] = () => toast('Éditeur de planning', { type: 'info', desc: 'Glissez les blocs ou cliquez une cellule pour ouvrir le détail.' });
  handlers['edit-tip-rule'] = () => toast('Règle de partage des pourboires', { type: 'info', desc: 'Modifiez les pourcentages par poste ou la base de calcul.' });
  handlers['distribute-tips'] = () => toast('Pourboires distribués · 1 867 MAD', { type: 'success', desc: 'Notification WhatsApp envoyée aux 4 employés. Crédit visible demain matin.' });
  handlers['export-payroll'] = () => toast('Export de paie · avril 2026', { type: 'info', desc: 'PDF + CSV générés et envoyés à votre comptable.' });

  /* ═══════════════════ LIVE badge hover quick switch ═══════════════════ */
  // On nav click: mark active + run handler. Intercept existing sidebar clicks.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('.sidebar nav a[data-nav]');
    if (!a) return;
    e.preventDefault();
    const key = 'nav-' + a.dataset.nav;
    if (handlers[key]) {
      // Highlight
      a.parentElement.querySelectorAll('a').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      handlers[key]();
    }
  }, true);

})();
