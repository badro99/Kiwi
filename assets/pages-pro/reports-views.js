/* Rapports · les vues (assets/pages-pro/reports-hub.js les appelle).
 *
 * Tout ce qui se dessine : la feuille de style, la phrase d'ouverture, les
 * tuiles du résumé, la série par journée, les classements, la carte jour ×
 * heure, la TVA, la vue multi-site et la version imprimable. Les chiffres
 * viennent tels quels de /api/reports (centimes entiers) : ce fichier ne
 * calcule rien d'autre que des largeurs de barre et des couleurs.
 *
 * Chargé avant le hub, comme dépendance de sa section paresseuse
 * (assets/pages-pro.js › LAZY_SECTIONS). Publie window.KiwiReportViews. */
(() => {
  'use strict';
  const lang = () => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' || l === 'ar' ? l : 'fr'; };
  const L = (fr, en, ar) => { const l = lang(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d) => window.KiwiNumber?.format(n, { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 })
    ?? Number(n).toLocaleString(lang() === 'en' ? 'en-GB' : 'fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const CUR = () => L('MAD', 'MAD', 'درهم');
  /* Un montant négatif prend le vrai signe moins, pas le trait d'union. */
  const minus = (t) => String(t).replace(/^-/, '\u2212');
  const mad = (c) => (c == null ? '–' : minus(fmt(Math.round(Number(c) || 0) / 100, Math.abs(Math.round(c)) % 100 ? 2 : 0)) + ' ' + CUR());
  const mad0 = (c) => (c == null ? '–' : minus(fmt(Math.round((Number(c) || 0) / 100))) + ' ' + CUR());
  const pctTxt = (p) => (p == null ? '–' : minus(fmt(Math.round(p * 10) / 10, Math.round(p * 10) % 10 ? 1 : 0)) + ' %');
  /* Une quantité : entière telle quelle, sinon au dixième (ou au centième pour
     un poids comme 0,25), jamais de zéro inutile. */
  const qtyTxt = (q) => { const r = Math.round(Number(q || 0) * 100) / 100; return minus(fmt(r, Number.isInteger(r) ? 0 : Number.isInteger(r * 10) ? 1 : 2)); };
  const returnedTxt = (q) => {
    const r = Math.round(Number(q || 0) * 10) / 10, n = qtyTxt(r);
    return L(`${n} rendu${r >= 2 ? 's' : ''}`, `${n} returned`, `أُرجع منه ${n}`);
  };
  const dayTxt = (day, opts) => {
    try { return new Date(day + 'T12:00:00Z').toLocaleDateString(lang() === 'ar' ? 'ar-MA-u-nu-latn' : lang() === 'en' ? 'en-GB' : 'fr-FR', Object.assign({ timeZone: 'UTC', day: 'numeric', month: 'short' }, opts || {})); }
    catch (_) { return day; }
  };
  const rangeTxt = (p) => (p.fromDay === p.toDay ? dayTxt(p.fromDay, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : dayTxt(p.fromDay) + ' – ' + dayTxt(p.toDay, { day: 'numeric', month: 'short', year: 'numeric' })).replace(' – ', ' – ');

  /* Material Symbols, Outlined 400 (assets/icons/material/). */
  const P = {
    bar_chart: 'M640-160v-280h160v280H640Zm-240 0v-640h160v640H400Zm-240 0v-440h160v440H160Z',
    inventory_2: 'M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z',
    category: 'm260-520 220-360 220 360H260ZM700-80q-75 0-127.5-52.5T520-260q0-75 52.5-127.5T700-440q75 0 127.5 52.5T880-260q0 75-52.5 127.5T700-80Zm-580-20v-320h320v320H120Zm580-60q42 0 71-29t29-71q0-42-29-71t-71-29q-42 0-71 29t-29 71q0 42 29 71t71 29Zm-500-20h160v-160H200v160Zm202-420h156l-78-126-78 126Zm78 0ZM360-340Zm340 80Z',
    groups: 'M0-240v-63q0-43 44-70t116-27q13 0 25 .5t23 2.5q-14 21-21 44t-7 48v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-26-6.5-49T754-397q11-2 22.5-2.5t23.5-.5q72 0 116 26.5t44 70.5v63H780Zm-455-80h311q-10-20-55.5-35T480-370q-55 0-100.5 15T325-320ZM160-440q-33 0-56.5-23.5T80-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T160-440Zm640 0q-33 0-56.5-23.5T720-520q0-34 23.5-57t56.5-23q34 0 57 23t23 57q0 33-23 56.5T800-440Zm-320-40q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm0-80q17 0 28.5-11.5T520-600q0-17-11.5-28.5T480-640q-17 0-28.5 11.5T440-600q0 17 11.5 28.5T480-560Zm1 240Zm-1-280Z',
    payments: 'M560-440q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM280-320q-33 0-56.5-23.5T200-400v-320q0-33 23.5-56.5T280-800h560q33 0 56.5 23.5T920-720v320q0 33-23.5 56.5T840-320H280Zm80-80h400q0-33 23.5-56.5T840-480v-160q-33 0-56.5-23.5T760-720H360q0 33-23.5 56.5T280-640v160q33 0 56.5 23.5T360-400Zm440 240H120q-33 0-56.5-23.5T40-240v-440h80v440h680v80ZM280-400v-320 320Z',
    schedule: 'm612-292 56-56-148-148v-184h-80v216l172 172ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-400Zm0 320q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Z',
    storefront: 'M841-518v318q0 33-23.5 56.5T761-120H201q-33 0-56.5-23.5T121-200v-318q-23-21-35.5-54t-.5-72l42-136q8-26 28.5-43t47.5-17h556q27 0 47 16.5t29 43.5l42 136q12 39-.5 71T841-518Zm-272-42q27 0 41-18.5t11-41.5l-22-140h-78v148q0 21 14 36.5t34 15.5Zm-180 0q23 0 37.5-15.5T441-612v-148h-78l-22 140q-4 24 10.5 42t37.5 18Zm-178 0q18 0 31.5-13t16.5-33l22-154h-78l-40 134q-6 20 6.5 43t41.5 23Zm540 0q29 0 42-23t6-43l-42-134h-76l22 154q3 20 16.5 33t31.5 13ZM201-200h560v-282q-5 2-6.5 2H751q-27 0-47.5-9T663-518q-18 18-41 28t-49 10q-27 0-50.5-10T481-518q-17 18-39.5 28T393-480q-29 0-52.5-10T299-518q-21 21-41.5 29.5T211-480h-4.5q-2.5 0-5.5-2v282Zm560 0H201h560Z',
    percent: 'M300-520q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm0-80q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600Zm360 440q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm42.5-97.5Q720-275 720-300t-17.5-42.5Q685-360 660-360t-42.5 17.5Q600-325 600-300t17.5 42.5Q635-240 660-240t42.5-17.5ZM216-160l-56-56 584-584 56 56-584 584Z',
    person: 'M367-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47ZM160-160v-112q0-34 17.5-62.5T224-378q62-31 126-46.5T480-440q66 0 130 15.5T736-378q29 15 46.5 43.5T800-272v112H160Zm80-80h480v-32q0-11-5.5-20T700-306q-54-27-109-40.5T480-360q-56 0-111 13.5T260-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q560-607 560-640t-23.5-56.5Q513-720 480-720t-56.5 23.5Q400-673 400-640t23.5 56.5Q447-560 480-560t56.5-23.5ZM480-640Zm0 400Z',
    apartment: 'M120-120v-560h160v-160h400v320h160v400H520v-160h-80v160H120Zm80-80h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 320h80v-80h-80v80Zm0-160h80v-80h-80v80Zm0-160h80v-80h-80v80Zm160 480h80v-80h-80v80Zm0-160h80v-80h-80v80Z',
    download: 'M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z',
    print: 'M640-640v-120H320v120h-80v-200h480v200h-80Zm-480 80h640-640Zm560 100q17 0 28.5-11.5T760-500q0-17-11.5-28.5T720-540q-17 0-28.5 11.5T680-500q0 17 11.5 28.5T720-460Zm-80 260v-160H320v160h320Zm80 80H240v-160H80v-240q0-51 35-85.5t85-34.5h560q51 0 85.5 34.5T880-520v240H720v160Zm80-240v-160q0-17-11.5-28.5T760-560H200q-17 0-28.5 11.5T160-520v160h80v-80h480v80h80Z',
    receipt_long: 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z',
    calendar_month: 'M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Zm280 240q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z',
    description: 'M320-240h320v-80H320v80Zm0-160h320v-80H320v80ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240Zm280-520v-200H240v640h480v-440H520ZM240-800v200-200 640-640Z',
    trending_up: 'm136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z',
    trending_down: 'M640-240v-80h104L536-526 376-366 80-664l56-56 240 240 160-160 264 264v-104h80v240H640Z',
    share: 'M680-80q-50 0-85-35t-35-85q0-6 3-28L282-392q-16 15-37 23.5t-45 8.5q-50 0-85-35t-35-85q0-50 35-85t85-35q24 0 45 8.5t37 23.5l281-164q-2-7-2.5-13.5T560-760q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35q-24 0-45-8.5T598-672L317-508q2 7 2.5 13.5t.5 14.5q0 8-.5 14.5T317-452l281 164q16-15 37-23.5t45-8.5q50 0 85 35t35 85q0 50-35 85t-85 35Zm0-80q17 0 28.5-11.5T720-200q0-17-11.5-28.5T680-240q-17 0-28.5 11.5T640-200q0 17 11.5 28.5T680-160ZM200-440q17 0 28.5-11.5T240-480q0-17-11.5-28.5T200-520q-17 0-28.5 11.5T160-480q0 17 11.5 28.5T200-440Zm508.5-291.5Q720-743 720-760t-11.5-28.5Q697-800 680-800t-28.5 11.5Q640-777 640-760t11.5 28.5Q663-720 680-720t28.5-11.5ZM680-200ZM200-480Zm480-280Z',
    chevron_left: 'M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z',
    chevron_right: 'M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z',
  };
  const ic = (k, cls) => `<svg class="rp-i${cls ? ' ' + cls : ''}" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  const CSS = `
.rp-page{display:grid;gap:16px;--rp-up:var(--atlas,#0B6E4F);--rp-down:var(--danger,#B3261E)}
.rp-i{width:18px;height:18px;flex:none}
.rp-bar{position:sticky;top:0;z-index:4;display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 0;background:var(--paper,#F7F5F0)}
.rp-acts{display:inline-flex;flex-wrap:nowrap;gap:8px;margin-inline-start:auto}
.rp-bar2{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.rp-bar2:empty{display:none}
.rp-seg{display:inline-flex;flex-wrap:wrap;gap:2px;padding:3px;border-radius:12px;background:var(--n-100,rgba(10,15,13,.06))}
.rp-seg button{border:0;background:none;font:inherit;font-size:13px;padding:7px 12px;border-radius:9px;color:var(--n-700,#3a4440);cursor:pointer;min-height:34px;white-space:nowrap}
.rp-seg button.on{color:var(--ink,#0A0F0D);font-weight:500}
.rp-seg button:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:1px}
.rp-tabs{overflow-x:auto;scrollbar-width:none;max-width:100%}
.rp-tabs::-webkit-scrollbar{display:none}
.rp-tabs .rp-seg{flex-wrap:nowrap}
.rp-tabs button{display:inline-flex;align-items:center;gap:6px}
.rp-tabs .rp-i{width:16px;height:16px;opacity:.75}
.rp-spacer{flex:1}
.rp-site{min-height:38px;padding:6px 10px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.15));background:var(--surface,#FFFDFA);font:inherit;font-size:13px;color:inherit;max-width:240px}
.rp-act{display:inline-flex;align-items:center;gap:6px}
.rp-custom{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}
.rp-custom input{min-height:38px;padding:6px 10px;border-radius:10px;border:1px solid var(--n-200,rgba(10,15,13,.15));background:var(--surface,#FFFDFA);font:inherit;color:inherit}
/* La phrase d'ouverture garde ses couleurs dans les deux thèmes : le vert
   profond et le papier sont écrits en dur, pas lus dans des variables que le
   thème sombre redéfinit (le fond disparaissait). */
.rp-lede{display:grid;gap:8px;padding:22px 24px;border-radius:20px;background:linear-gradient(135deg,#0B6E4F 0%,#053B2C 70%);color:#F7F5F0;border:1px solid rgba(125,242,176,.22)}
.rp-lede-foot{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between}
.rp-lede a{display:inline-flex;align-items:center;gap:6px;color:#F7F5F0;font-size:12.5px;font-weight:500;text-decoration:none;padding:6px 10px;border-radius:999px;border:1px solid rgba(247,245,240,.28);min-height:32px}
.rp-lede a:hover{background:rgba(247,245,240,.1)}
.rp-lede a:focus-visible{outline:2px solid #7DF2B0;outline-offset:2px}
.rp-demo{display:inline-block;margin-inline-start:8px;padding:1px 8px;border-radius:999px;background:rgba(125,242,176,.18);color:#7DF2B0;font-size:11px;font-weight:600}
.rp-lede p{margin:0;font-size:clamp(18px,2.2vw,24px);line-height:1.35;font-weight:500;letter-spacing:-.01em;max-width:62ch}
.rp-lede small{font-size:12.5px;opacity:.72}
.rp-lede .rp-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#7DF2B0;margin-inline-end:8px;vertical-align:middle}
.rp-card{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:18px;background:var(--surface,#FFFDFA);padding:18px;min-width:0}
.rp-card h3{margin:0 0 12px;font-size:14px;font-weight:600}
.rp-note{margin:0;color:var(--n-500,#6F6C65);font-size:12.5px;line-height:1.5}
.rp-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
.rp-kpi{border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:16px;background:var(--surface,#FFFDFA);padding:14px;display:grid;gap:4px;min-width:0}
.rp-kpi span{font-size:12px;color:var(--n-500,#6F6C65)}
.rp-kpi b{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em;overflow-wrap:anywhere}
.rp-kpi.hero{grid-column:span 2;background:var(--paper-soft,#EFECE4)}
.rp-kpi.hero b{font-size:28px}
.rp-kpi small{font-size:12px;color:var(--n-500,#6F6C65);font-variant-numeric:tabular-nums}
.rp-d{display:inline-flex;align-items:center;gap:2px;font-weight:600;font-variant-numeric:tabular-nums}
.rp-d .rp-i{width:15px;height:15px}
.rp-d.up{color:var(--rp-up)} .rp-d.down{color:var(--rp-down)} .rp-d.flat{color:var(--n-500,#6F6C65)}
.rp-chart{width:100%;height:auto;display:block}
.rp-chart .cur{fill:var(--atlas,#0B6E4F)} .rp-chart .prev{fill:var(--n-200,rgba(10,15,13,.14))} .rp-chart .peak{fill:var(--riad,#053B2C)}
.rp-chart .tk{fill:none;stroke:var(--ink,#0A0F0D);stroke-width:1.5;stroke-linejoin:round;opacity:.55}
.rp-legend i.rp-tk{height:2px;border-radius:1px;vertical-align:3px;background:var(--ink,#0A0F0D);opacity:.55}
.rp-chart .call{fill:var(--ink,#0A0F0D);font-weight:600;font-size:12px}
.rp-peak{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;font-size:13px;color:var(--n-500,#6F6C65)}
.rp-peak b{font-size:18px;font-weight:600;color:var(--ink,#0A0F0D);font-variant-numeric:tabular-nums}
.rp-chart text{fill:var(--n-500,#6F6C65);font-size:11px;font-family:inherit}
.rp-legend{display:flex;gap:14px;font-size:12px;color:var(--n-500,#6F6C65);margin-top:8px}
.rp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:6px;vertical-align:-1px}
.rp-table{width:100%;border-collapse:collapse;font-size:13.5px}
.rp-table th{text-align:start;font-weight:500;font-size:12px;color:var(--n-500,#6F6C65);padding:8px 10px;border-bottom:1px solid var(--n-200,rgba(10,15,13,.12));white-space:nowrap}
.rp-table td{padding:10px;border-bottom:1px solid var(--n-100,rgba(10,15,13,.07));vertical-align:middle}
.rp-table td.n,.rp-table th.n{text-align:end;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-table tr.tot td{font-weight:600;border-bottom:0}
.rp-table tr.rec td{color:var(--n-500,#6F6C65);font-size:12.5px}
.rp-rec{display:grid;gap:10px;justify-items:start}.rp-rec .rp-scroll{width:100%}
.rp-table td small{display:block;color:var(--n-500,#6F6C65);font-size:12px}
.rp-scroll{overflow-x:auto}
.rp-share{display:grid;grid-template-columns:minmax(40px,1fr) auto;gap:8px;align-items:center;min-width:110px}
.rp-share i{display:block;height:6px;border-radius:3px;background:var(--atlas,#0B6E4F);min-width:2px}
.rp-share em{font-style:normal;font-size:12px;color:var(--n-500,#6F6C65);font-variant-numeric:tabular-nums}
.rp-tag{display:inline-block;margin-inline-start:6px;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(11,110,79,.1);color:var(--atlas,#0B6E4F)}
.rp-tag.low{background:rgba(179,38,30,.08);color:var(--rp-down)}
.rp-pager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:12px;font-size:13px;color:var(--n-500,#6F6C65)}
.rp-heat{display:grid;grid-template-columns:auto repeat(24,minmax(14px,1fr));gap:3px;align-items:center;min-width:560px}
.rp-heat span{font-size:11px;color:var(--n-500,#6F6C65);text-align:center;font-variant-numeric:tabular-nums}
.rp-heat span.wd{text-align:start;padding-inline-end:8px;white-space:nowrap}
.rp-heat i{display:block;aspect-ratio:1;border-radius:4px;background:var(--n-100,rgba(10,15,13,.06))}
.rp-sites{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.rp-site-card{display:grid;gap:10px;align-content:start}
.rp-site-card header{display:flex;align-items:center;gap:8px;justify-content:space-between}
.rp-site-card h4{margin:0;font-size:15px;font-weight:600}
.rp-site-card .big{font-size:24px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.rp-site-card dl{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin:0;font-size:13px}
.rp-site-card dt{color:var(--n-500,#6F6C65)} .rp-site-card dd{margin:0;text-align:end;font-variant-numeric:tabular-nums}
.rp-site-card.total{background:var(--paper-soft,#EFECE4)}
.rp-vs{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;background:var(--n-100,rgba(10,15,13,.05));font-size:12.5px}
.rp-vs span{color:var(--n-500,#6F6C65)}
.rp-cover{display:grid;gap:14px;padding:6px 0 18px;margin-bottom:18px;border-bottom:1px solid #E4E0D6;break-after:page}
.rp-cover h2{margin:0;font-size:15px;font-weight:600}
.rp-cover .rp-kpis{grid-template-columns:repeat(4,1fr)}
.rp-index{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.rp-index button{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;text-align:start;border:1px solid var(--n-200,rgba(10,15,13,.12));border-radius:14px;background:var(--surface,#FFFDFA);padding:14px;font:inherit;color:inherit;cursor:pointer;min-height:44px}
.rp-index button:hover{border-color:var(--atlas,#0B6E4F)}
.rp-index button:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:2px}
.rp-index .rp-i{grid-row:span 2;width:22px;height:22px;color:var(--atlas,#0B6E4F)}
.rp-index b{font-weight:600;font-size:14px}
.rp-index small{color:var(--n-500,#6F6C65);font-size:12.5px;line-height:1.4}
.rp-empty{padding:28px;text-align:center;color:var(--n-500,#6F6C65)}
.rp-skel{height:120px;border-radius:18px;background:linear-gradient(90deg,var(--n-100,rgba(10,15,13,.05)),var(--n-50,rgba(10,15,13,.02)),var(--n-100,rgba(10,15,13,.05)));background-size:200% 100%;animation:rp-sk 1.4s ease-in-out infinite}
@keyframes rp-sk{to{background-position:-200% 0}}
@media(prefers-reduced-motion:reduce){.rp-skel{animation:none}}
@media(max-width:640px){.rp-table .rp-s{display:none}.rp-chart text{font-size:22px}.rp-chart .tk{fill:none;stroke:var(--ink,#0A0F0D);stroke-width:1.5;stroke-linejoin:round;opacity:.55}
.rp-legend i.rp-tk{height:2px;border-radius:1px;vertical-align:3px;background:var(--ink,#0A0F0D);opacity:.55}
.rp-chart .call{font-size:24px}.rp-kpi.hero{grid-column:span 1}.rp-bar{position:static}.rp-lede{padding:18px}.rp-acts{margin-inline-start:0}.rp-site{max-width:100%}}
[dir=rtl] .rp-d .rp-i,[dir=rtl] .rp-pager .rp-i{transform:scaleX(-1)}
`;
  function css() {
    if (document.getElementById('rp-css')) return;
    const style = document.createElement('style');
    style.id = 'rp-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* L'écart avec la période d'avant : flèche, pourcentage, couleur. Une
     dépense (remboursement, remise, coût) qui monte n'est pas une bonne
     nouvelle : `invert` retourne la couleur, pas la flèche. */
  function delta(cur, prev, invert) {
    if (!(prev > 0)) return `<span class="rp-d flat">${esc(L('nouveau', 'new', 'جديد'))}</span>`;
    const ch = ((cur - prev) / prev) * 100;
    if (Math.abs(ch) < 0.5) return `<span class="rp-d flat">=</span>`;
    const good = invert ? ch < 0 : ch > 0;
    return `<span class="rp-d ${good ? 'up' : 'down'}">${ic(ch > 0 ? 'trending_up' : 'trending_down')}${ch > 0 ? '+' : '−'}${esc(pctTxt(Math.abs(ch)))}</span>`;
  }
  const share = (p) => `<div class="rp-share"><i style="width:${Math.max(1, Math.min(100, p || 0))}%"></i><em>${esc(pctTxt(p))}</em></div>`;

  /* La phrase d'ouverture, et un brouillon WhatsApp de cette phrase (wa.me :
     rien n'est envoyé, le commerçant choisit à qui l'envoyer, zéro coût). */
  function lede(data, versusLabel, opts) {
    const h = data.headline || {};
    const text = h[lang()] || h.fr || '';
    const when = rangeTxt(data.period) + ' · ' + versusLabel + ' ' + rangeTxt(data.previous);
    const draft = (opts && opts.title ? opts.title + ' · ' : '') + rangeTxt(data.period) + '\n' + text + '\nKiwi';
    const wa = opts && opts.share === false ? '' : `<a href="https://wa.me/?text=${encodeURIComponent(draft)}" target="_blank" rel="noopener noreferrer">${ic('share')}${esc(L('Brouillon WhatsApp', 'WhatsApp draft', 'مسودة واتساب'))}</a>`;
    return `<section class="rp-lede" aria-live="polite"><p><span class="rp-dot" aria-hidden="true"></span>${esc(text)}</p>
      <div class="rp-lede-foot"><small>${esc(when)}${data.demo ? `<span class="rp-demo">${esc(L('Données de démonstration', 'Demo data', 'بيانات تجريبية'))}</span>` : ''}</small>${wa}</div></section>`;
  }

  function kpiTile(label, cur, prev, money, opts) {
    const o = opts || {};
    const v = cur == null ? '–' : money ? mad0(cur) : o.pct ? pctTxt(cur) : fmt(cur, o.dec || 0);
    const before = prev == null ? '' : money ? mad0(prev) : o.pct ? pctTxt(prev) : fmt(prev, o.dec || 0);
    return `<div class="rp-kpi${o.hero ? ' hero' : ''}"><span>${esc(label)}</span><b>${esc(v)}</b>
      <small>${cur != null && prev != null && !o.pct ? delta(cur, prev, o.invert) + ' · ' : ''}${before ? esc(L('avant', 'before', 'قبل')) + ' ' + esc(before) : ''}${o.note ? ' · ' + esc(o.note) : ''}</small></div>`;
  }

  /* La série par journée : barres pleines pour la période, barres pâles
     derrière pour la période d'avant, à la même position. */
  function seriesChart(series) {
    if (!series.length) return '';
    const W = 720, H = 180, pad = 22, n = series.length;
    const max = Math.max(1, ...series.map((s) => Math.max(s.net, s.prevNet || 0)));
    const bw = (W - pad) / n;
    const y = (v) => H - pad - (Math.max(0, v) / max) * (H - pad - 8);
    const every = Math.ceil(n / 10);
    const bars = series.map((s, i) => {
      const x = pad + i * bw;
      const w = Math.max(2, bw * 0.62);
      const prev = s.prevNet != null ? `<rect class="prev" x="${x + bw * 0.06}" y="${y(s.prevNet)}" width="${w}" height="${H - pad - y(s.prevNet)}" rx="2"><title>${esc(dayTxt(s.prevDay))} : ${esc(mad0(s.prevNet))}</title></rect>` : '';
      const cur = `<rect class="cur" x="${x + bw * 0.24}" y="${y(s.net)}" width="${w}" height="${H - pad - y(s.net)}" rx="2"><title>${esc(dayTxt(s.day))} : ${esc(mad0(s.net))}</title></rect>`;
      const label = i % every === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(dayTxt(s.day, n > 40 ? { day: 'numeric', month: 'numeric' } : undefined))}</text>` : '';
      return prev + cur + label;
    }).join('');
    return `<svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L('Ventes nettes par journée', 'Net sales by business day', 'المبيعات الصافية حسب اليوم'))}">${bars}</svg>
      <div class="rp-legend"><span><i style="background:var(--atlas,#0B6E4F)"></i>${esc(L('Période', 'Period', 'الفترة'))}</span><span><i style="background:var(--n-200,rgba(10,15,13,.14))"></i>${esc(L('Période d’avant', 'Previous period', 'الفترة السابقة'))}</span></div>`;
  }

  /* Une journée seule : vingt-quatre barres, de la coupure à la coupure, la
     même heure de la journée d'avant derrière, l'heure de pointe nommée. */
  function hourlyChart(hourly, peak) {
    const W = 720, H = 190, pad = 22, n = hourly.length;
    const max = Math.max(1, ...hourly.map((s) => Math.max(s.net, s.prevNet || 0)));
    const bw = (W - pad) / n;
    const y = (v) => H - pad - (Math.max(0, v) / max) * (H - pad - 22);
    const bars = hourly.map((s, i) => {
      const x = pad + i * bw, w = Math.max(2, bw * 0.62);
      const isPeak = peak && s.hour === peak.hour;
      const prev = `<rect class="prev" x="${x + bw * 0.06}" y="${y(s.prevNet)}" width="${w}" height="${H - pad - y(s.prevNet)}" rx="2"><title>${s.hour}:00 · ${esc(mad0(s.prevNet))}</title></rect>`;
      const cur = `<rect class="${isPeak ? 'peak' : 'cur'}" x="${x + bw * 0.24}" y="${y(s.net)}" width="${w}" height="${H - pad - y(s.net)}" rx="2"><title>${s.hour}:00 · ${esc(mad0(s.net))}</title></rect>`;
      const call = isPeak ? `<text class="call" x="${x + bw * 0.24 + w / 2}" y="${Math.max(12, y(s.net) - 6)}" text-anchor="middle">${esc(mad0(s.net))}</text>` : '';
      const label = s.hour % 3 === 0 ? `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${s.hour}h</text>` : '';
      return prev + cur + call + label;
    }).join('');
    /* Les tickets de chaque heure, en fine ligne sur leur propre échelle. */
    const tmax = Math.max(1, ...hourly.map((s) => s.tickets || 0));
    const pts = hourly.map((s, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${(H - pad - ((s.tickets || 0) / tmax) * (H - pad - 22)).toFixed(1)}`).join(' ');
    const line = hourly.some((s) => s.tickets) ? `<polyline class="tk" points="${pts}"><title>${esc(L('Tickets par heure', 'Tickets per hour', 'التذاكر في كل ساعة'))}</title></polyline>` : '';
    const head = peak ? `<p class="rp-peak">${esc(L('Heure de pointe', 'Peak hour', 'ساعة الذروة'))} <b>${peak.hour}:00 – ${(peak.hour + 1) % 24}:00</b> ${esc(mad0(peak.net))}${peak.tickets ? ' · ' + esc(fmt(peak.tickets)) + ' ' + esc(L('tickets', 'tickets', 'تذاكر')) : ''}</p>` : '';
    return `${head}<svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L('Ventes nettes par heure', 'Net sales by hour', 'المبيعات الصافية حسب الساعة'))}">${bars}${line}</svg>
      <div class="rp-legend"><span><i style="background:var(--atlas,#0B6E4F)"></i>${esc(L('Journée', 'Day', 'اليوم'))}</span><span><i style="background:var(--n-200,rgba(10,15,13,.14))"></i>${esc(L('Journée d’avant, même heure', 'Day before, same hour', 'اليوم السابق، نفس الساعة'))}</span><span><i class="rp-tk"></i>${esc(L('Tickets', 'Tickets', 'التذاكر'))}</span></div>`;
  }

  /* Le raccord avec le Z et l'accueil : eux ne déduisent pas encore la part
     d'un retour rendue en avoir, ce rapport la déduit (l'avoir est dû au
     client). Les trois chiffres, et le Z à un clic. */
  function reconcile(d, withLink) {
    const r = d.reconcile;
    if (!r) return '';
    const row = (label, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}>${td(esc(label))}${td(esc(mad(v)), 1)}</tr>`;
    return `<section class="rp-card rp-rec"><h3>${esc(L('Raccord avec le rapport journalier (Z)', 'Reconciling with the daily report (Z)', 'المطابقة مع التقرير اليومي (Z)'))}</h3>
      ${table([{ t: L('Chiffre', 'Figure', 'الرقم') }, { t: L('Montant', 'Amount', 'المبلغ'), n: 1 }], [
        row(L('Rapport journalier (Z) et accueil', 'Daily report (Z) and home page', 'التقرير اليومي (Z) والصفحة الرئيسية'), r.z),
        `<tr>${td(esc(L('Retours rendus en avoir', 'Returns given as store credit', 'مرجوعات رُدّت رصيدا للزبون')) + (r.tickets && r.ticketsNote ? `<small>${esc(r.ticketsNote[lang()] || r.ticketsNote.fr)}</small>` : ''))}${td(esc(mad(-r.credit)), 1)}</tr>`],
        row(L('Ventes nettes du rapport', 'Net sales in this report', 'المبيعات الصافية في هذا التقرير'), r.net, 'tot'))}
      <p class="rp-note">${esc(r.note ? (r.note[lang()] || r.note.fr) : '')}</p>
      ${withLink ? `<button type="button" class="kb ghost rp-act" data-action="rp-open" data-arg="z">${ic('receipt_long')}${esc(L('Ouvrir le rapport journalier (Z)', 'Open the daily report (Z)', 'فتح التقرير اليومي (Z)'))}</button>` : ''}</section>`;
  }

  function summary(d) {
    const c = d.totals.cur, p = d.totals.prev;
    const costNote = c.costCoverage != null && c.costCoverage < 99.5
      ? L(`sur les ${pctTxt(c.costCoverage)} des ventes au coût connu`, `on the ${pctTxt(c.costCoverage)} of sales with a known cost`, `على ${pctTxt(c.costCoverage)} من المبيعات ذات التكلفة المعروفة`) : '';
    const tiles = [
      kpiTile(L('Ventes nettes', 'Net sales', 'المبيعات الصافية'), c.net, p.net, true, { hero: true }),
      kpiTile(L('Ventes brutes', 'Gross sales', 'المبيعات الإجمالية'), c.gross, p.gross, true),
      kpiTile(L('Remises', 'Discounts', 'التخفيضات'), c.discounts, p.discounts, true, { invert: true }),
      kpiTile(L('Remboursements', 'Refunds', 'المرجوعات'), c.refunds, p.refunds, true, { invert: true, note: c.refundCount ? String(c.refundCount) + ' ' + L('tickets', 'tickets', 'تذاكر') : '' }),
      kpiTile(L('TVA collectée', 'VAT collected', 'الضريبة المحصّلة'), c.vat ? c.vat.vat : null, p.vat ? p.vat.vat : null, true),
      d.showCost ? kpiTile(L('Coût des ventes', 'Cost of goods', 'تكلفة المبيعات'), c.cogs, p.cogs, true, { invert: true }) : '',
      d.showCost ? kpiTile(L('Marge brute', 'Gross margin', 'الهامش الإجمالي'), c.margin, p.margin, true, { note: c.marginPct != null ? pctTxt(c.marginPct) + (costNote ? ' ' + costNote : '') : '' }) : '',
      kpiTile(L('Tickets', 'Tickets', 'التذاكر'), c.tickets, p.tickets, false),
      kpiTile(L('Panier moyen', 'Average basket', 'متوسط السلة'), c.basket, p.basket, true),
      kpiTile(L('Articles par ticket', 'Items per ticket', 'منتجات في كل تذكرة'), c.itemsPerTicket, p.itemsPerTicket, false, { dec: 1 }),
      kpiTile(L('Pourboires', 'Tips', 'البقشيش'), c.tips, p.tips, true),
    ].join('');
    const unknownVat = c.vat && c.vat.unknown > 0 ? `<p class="rp-note">${esc(L('Une partie des ventes n’a pas de taux de TVA connu. Réglez la TVA du ticket (Réglages › Ticket) ou les taux par rayon (Dossier du mois).', 'Some sales have no known VAT rate. Set the receipt VAT (Settings › Receipt) or rates per category (Month pack).', 'جزء من المبيعات بدون نسبة ضريبة معروفة. حدّد الضريبة في التذكرة (الإعدادات › التذكرة) أو نسبة كل قسم (ملف الشهر).'))}</p>` : '';
    const noDetail = c.tickets && c.detailed < c.tickets ? `<p class="rp-note">${esc(L(`${c.tickets - c.detailed} ticket(s) sans détail d’articles : comptés dans les totaux, absents des classements.`, `${c.tickets - c.detailed} ticket(s) without item detail: in the totals, missing from rankings.`, `${c.tickets - c.detailed} تذكرة بدون تفاصيل المنتجات: محسوبة في المجاميع وغائبة عن الترتيب.`))}</p>` : '';
    return `<div class="rp-kpis">${tiles}</div>
      ${d.hourly ? `<section class="rp-card"><h3>${esc(L('Ventes nettes par heure', 'Net sales by hour', 'المبيعات الصافية حسب الساعة'))}</h3>${hourlyChart(d.hourly, d.peakHour)}</section>`
        : `<section class="rp-card"><h3>${esc(L('Ventes nettes par journée', 'Net sales by business day', 'المبيعات الصافية حسب اليوم'))}</h3>${seriesChart(d.series)}</section>`}
      ${reconcile(d, true)}${unknownVat}${noDetail}`;
  }

  function table(head, rows, foot) {
    return `<div class="rp-scroll"><table class="rp-table"><thead><tr>${head.map((h) => `<th${h.n || h.s ? ` class="${[h.n ? 'n' : '', h.s ? 'rp-s' : ''].join(' ').trim()}"` : ''}>${esc(h.t)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}${foot || ''}</tbody></table></div>`;
  }
  /* `s` : une colonne secondaire, repliée sur téléphone (la vente nette reste
     à l'écran sans défilement). */
  const td = (v, n, s) => `<td${n || s ? ` class="${[n ? 'n' : '', s ? 'rp-s' : ''].join(' ').trim()}"` : ''}>${v}</td>`;
  function pager(page, action) {
    if (!page || page.total <= page.limit) return '';
    const from = page.offset + 1, to = Math.min(page.total, page.offset + page.limit);
    const prevBtn = page.offset > 0 ? `<button type="button" class="kb ghost rp-act" data-action="${action}" data-arg="${Math.max(0, page.offset - page.limit)}" aria-label="${esc(L('Précédents', 'Previous', 'السابق'))}">${ic('chevron_left')}</button>` : '';
    const nextBtn = to < page.total ? `<button type="button" class="kb ghost rp-act" data-action="${action}" data-arg="${page.offset + page.limit}" aria-label="${esc(L('Suivants', 'Next', 'التالي'))}">${ic('chevron_right')}</button>` : '';
    return `<div class="rp-pager">${prevBtn}<span>${esc(fmt(from))}–${esc(fmt(to))} ${esc(L('sur', 'of', 'من'))} ${esc(fmt(page.total))}</span>${nextBtn}</div>`;
  }
  const empty = () => `<div class="rp-empty">${esc(L('Rien sur cette période.', 'Nothing in this period.', 'لا شيء في هذه الفترة.'))}</div>`;

  function ranking(d, kind) {
    if (!d.rows.length) return empty();
    /* Vendu, retours (les remboursements rattachés à leur vente reviennent sur
       leurs produits), net. Le pied raccorde la liste aux ventes nettes du
       résumé : ce qui n'a pas de détail d'article est sur sa propre ligne. */
    const head = [{ t: kind === 'products' ? L('Produit', 'Product', 'المنتج') : L('Rayon', 'Category', 'القسم') }, { t: L('Qté', 'Qty', 'الكمية'), n: 1 },
      { t: L('Vendu', 'Sold', 'المبيع'), n: 1, s: 1 }, { t: L('Retours', 'Returns', 'المرجوعات'), n: 1, s: 1 },
      { t: L('Ventes nettes', 'Net sales', 'المبيعات الصافية'), n: 1 }, { t: L('Part', 'Share', 'الحصة'), s: 1 }, { t: L('Évolution', 'Change', 'التطور'), n: 1 }];
    if (d.showCost) head.push({ t: L('Marge', 'Margin', 'الهامش'), n: 1 });
    const rows = d.rows.map((r) => `<tr>${td(`${esc(r.name || L('Sans catégorie', 'No category', 'بدون قسم'))}${kind === 'products' && r.category ? `<small>${esc(r.category)}</small>` : ''}`)}${td(esc(qtyTxt(r.qty)), 1)}
      ${td(esc(mad(r.sold)), 1, 1)}${td(r.refunded ? esc(mad(r.refunded)) + (r.refundedQty ? `<small>${esc(returnedTxt(r.refundedQty))}</small>` : '') : '–', 1, 1)}
      ${td(esc(mad(r.net)), 1)}${td(share(r.share), 0, 1)}${td(delta(r.net, r.prevNet), 1)}${d.showCost ? td(r.marginPct == null ? '<small>' + esc(L('coût inconnu', 'cost unknown', 'تكلفة غير معروفة')) + '</small>' : esc(pctTxt(r.marginPct)) + `<small>${esc(mad0(r.margin))}</small>`, 1) : ''}</tr>`);
    const t = d.totals || {};
    const gap = '<td class="rp-s"></td><td class="rp-s"></td>';
    const rec = t.unattributed ? `<tr class="rec"><td colspan="2">${esc(L('Ventes sans détail d’article et retours non rattachés', 'Sales without item detail and unlinked refunds', 'مبيعات بدون تفاصيل المنتجات ومرجوعات غير مرتبطة بتذكرتها'))}</td>${gap}${td(esc(mad(t.unattributed)), 1)}<td class="rp-s"></td><td></td>${d.showCost ? '<td></td>' : ''}</tr>` : '';
    const foot = rec + `<tr class="tot"><td colspan="2">${esc(L('Ventes nettes du résumé', 'Summary net sales', 'المبيعات الصافية في الملخص'))}</td>${gap}${td(esc(mad(t.net)), 1)}<td class="rp-s"></td>${td(delta(t.net, t.prevNet), 1)}${d.showCost ? '<td></td>' : ''}</tr>`;
    return `<section class="rp-card">${table(head, rows, foot)}${pager(d.page, 'rp-page')}</section>`;
  }

  function staff(d) {
    if (!d.rows.length) return empty();
    const head = [{ t: L('Vendeur', 'Seller', 'البائع') }, { t: L('Tickets', 'Tickets', 'التذاكر'), n: 1 }, { t: L('Ventes', 'Sales', 'المبيعات'), n: 1 }, { t: L('Part', 'Share', 'الحصة') },
      { t: L('Panier moyen', 'Avg basket', 'متوسط السلة'), n: 1 }, { t: L('Remises', 'Discounts', 'التخفيضات'), n: 1 }, { t: L('Remboursements', 'Refunds', 'المرجوعات'), n: 1 },
      { t: L('Pourboires', 'Tips', 'البقشيش'), n: 1 }, { t: L('Évolution', 'Change', 'التطور'), n: 1 }];
    const best = Math.max(0, ...d.rows.filter((r) => !r.unassigned && r.tickets >= 3).map((r) => r.basket));
    const rows = d.rows.map((r) => `<tr>${td(esc(r.unassigned ? L('Sans vendeur', 'No seller', 'بدون بائع') : (r.name || r.id)) + (best && r.basket === best && !r.unassigned ? `<span class="rp-tag">${esc(L('meilleur panier', 'best basket', 'أفضل سلة'))}</span>` : ''))}
      ${td(esc(fmt(r.tickets)), 1)}${td(esc(mad(r.sales)), 1)}${td(share(r.share))}${td(esc(mad(r.basket)), 1)}${td(esc(mad(r.discounts)), 1)}
      ${td(esc(mad(r.refunds)) + (r.refundCount ? `<small>${esc(fmt(r.refundCount))}</small>` : ''), 1)}${td(esc(mad(r.tips)), 1)}${td(delta(r.sales, r.prevSales), 1)}</tr>`);
    return `<section class="rp-card">${table(head, rows)}<p class="rp-note">${esc(L('Un remboursement revient au vendeur de la vente d’origine.', 'A refund is charged to the seller of the original sale.', 'كل استرجاع يُحسب على بائع البيعة الأصلية.'))}</p></section>`;
  }

  function bars(d, labelOf, kind) {
    if (!d.rows.length) return empty();
    const head = [{ t: kind === 'payments' ? L('Moyen', 'Method', 'الوسيلة') : L('Canal', 'Channel', 'القناة') }, { t: L('Montant', 'Amount', 'المبلغ'), n: 1 },
      { t: L('Nombre', 'Count', 'العدد'), n: 1 }, { t: L('Part', 'Share', 'الحصة') }, { t: L('Évolution', 'Change', 'التطور'), n: 1 }];
    if (kind === 'payments') head.push({ t: L('Remboursé', 'Refunded', 'المسترجع'), n: 1 });
    const rows = d.rows.map((r) => `<tr>${td(esc(labelOf(kind === 'payments' ? r.method : r.channel)))}${td(esc(mad(r.cents)), 1)}${td(esc(fmt(r.count)), 1)}
      ${td(share(r.share))}${td(delta(r.cents, r.prevCents), 1)}${kind === 'payments' ? td(r.refunds ? esc(mad(r.refunds)) : '–', 1) : ''}</tr>`);
    return `<section class="rp-card">${table(head, rows)}${kind === 'payments' ? `<p class="rp-note">${esc(L('Un ticket payé en plusieurs fois compte chaque part sur son moyen.', 'A ticket paid in several ways counts each part under its method.', 'التذكرة المؤداة بعدة وسائل تُحسب كل جزء منها على وسيلته.'))}</p>` : ''}</section>`;
  }

  const WD = () => L('lun.,mar.,mer.,jeu.,ven.,sam.,dim.', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'الاثنين,الثلاثاء,الأربعاء,الخميس,الجمعة,السبت,الأحد').split(',');
  function heatmap(d) {
    if (!d.total) return empty();
    /* Moyenne par occurrence : un mois de 5 samedis ne gonfle pas le samedi. */
    const avg = d.grid.map((row, wd) => row.map((v) => (d.occurrences[wd] ? v / d.occurrences[wd] : 0)));
    const max = Math.max(1, ...avg.flat());
    const head = '<span></span>' + Array.from({ length: 24 }, (_, h) => `<span>${h % 3 === 0 ? h : ''}</span>`).join('');
    const rows = avg.map((row, wd) => `<span class="wd">${esc(WD()[wd])}</span>` + row.map((v, h) => {
      const a = v > 0 ? 0.12 + 0.88 * (v / max) : 0;
      return `<i title="${esc(WD()[wd])} ${h}:00 · ${esc(mad0(v))}" style="${a ? `background:rgba(11,110,79,${a.toFixed(3)})` : ''}"></i>`;
    }).join('')).join('');
    const hours = d.byHour.map((v, h) => ({ v, h })).filter((x) => x.v > 0);
    return `<section class="rp-card"><h3>${esc(L('Ventes moyennes par jour et par heure', 'Average sales by day and hour', 'متوسط المبيعات حسب اليوم والساعة'))}</h3>
      <div class="rp-scroll"><div class="rp-heat">${head}${rows}</div></div>
      <p class="rp-note">${esc(L('Heure de la boutique ; une vente après minuit compte dans la journée commerciale de la veille.', 'Store time; a sale after midnight belongs to the previous business day.', 'بتوقيت المحل؛ البيعة بعد منتصف الليل تُحسب في اليوم التجاري السابق.'))}${hours.length ? ' ' + esc(L(`Ouvert en pratique de ${hours[0].h} h à ${hours[hours.length - 1].h + 1} h.`, `Trading in practice from ${hours[0].h}:00 to ${hours[hours.length - 1].h + 1}:00.`, `العمل فعليا من ${hours[0].h}:00 إلى ${hours[hours.length - 1].h + 1}:00.`)) : ''}</p></section>`;
  }

  function vat(d) {
    if (!d.rows.length) return empty();
    const head = [{ t: L('Taux', 'Rate', 'النسبة') }, { t: L('HT', 'Excl. VAT', 'دون ضريبة'), n: 1 }, { t: L('TVA', 'VAT', 'الضريبة'), n: 1 }, { t: L('TTC', 'Incl. VAT', 'بالضريبة'), n: 1 }];
    const rows = d.rows.map((r) => `<tr>${td(r.rate == null ? esc(L('Taux inconnu', 'Unknown rate', 'نسبة غير معروفة')) + '<span class="rp-tag low">!</span>' : esc(pctTxt(r.rate)))}${td(esc(mad(r.ht)), 1)}${td(esc(mad(r.vat)), 1)}${td(esc(mad(r.ttc)), 1)}</tr>`);
    const t = d.totals;
    const foot = `<tr class="tot">${td(esc(L('Total', 'Total', 'المجموع')))}${td(esc(mad(t.ht)), 1)}${td(esc(mad(t.vat)), 1)}${td(esc(mad(t.ttc)), 1)}</tr>`;
    return `<section class="rp-card">${table(head, rows, foot)}<p class="rp-note">${esc(L('Remboursements déduits. Le taux d’une ligne : celui de son rayon à la date de la vente (Dossier du mois), sinon celui du ticket. Rien n’est deviné.', 'Refunds deducted. A line’s rate: its category’s rate on the sale date (Month pack), else the receipt rate. Nothing is guessed.', 'المرجوعات مخصومة. نسبة كل سطر: نسبة قسمه في تاريخ البيع (ملف الشهر)، وإلا نسبة التذكرة. لا شيء يُخمَّن.'))} ${esc(L('Période d’avant', 'Previous period', 'الفترة السابقة'))} : ${esc(mad(d.prevTotals.vat))}.</p></section>`;
  }

  function customers(d) {
    const t = d.totals;
    const note = t.anonymousShare != null ? `<p class="rp-note">${esc(L(`${pctTxt(t.anonymousShare)} des tickets n’ont pas de client : choisir le client à l’encaissement enrichit ce rapport.`, `${pctTxt(t.anonymousShare)} of tickets have no customer: picking the customer at checkout enriches this report.`, `${pctTxt(t.anonymousShare)} من التذاكر بدون زبون: اختيار الزبون عند الأداء يُغني هذا التقرير.`))}</p>` : '';
    if (!d.rows.length) return empty() + note;
    const head = [{ t: L('Client', 'Customer', 'الزبون') }, { t: L('Visites', 'Visits', 'الزيارات'), n: 1 }, { t: L('Dépense', 'Spend', 'الإنفاق'), n: 1 },
      { t: L('Panier moyen', 'Avg basket', 'متوسط السلة'), n: 1 }, { t: L('Dernière visite', 'Last visit', 'آخر زيارة'), n: 1 }, { t: L('Évolution', 'Change', 'التطور'), n: 1 }];
    const rows = d.rows.map((r) => `<tr>${td(esc(r.name || '#' + r.id.slice(0, 6)))}${td(esc(fmt(r.tickets)), 1)}${td(esc(mad(r.spend)), 1)}${td(esc(mad(r.basket)), 1)}
      ${td(r.last ? esc(new Date(r.last).toLocaleDateString(lang() === 'en' ? 'en-GB' : lang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR', { day: 'numeric', month: 'short' })) : '–', 1)}${td(delta(r.spend, r.prevSpend), 1)}</tr>`);
    return `<section class="rp-card">${table(head, rows)}${pager(d.page, 'rp-page')}${note}</section>`;
  }

  function sites(d) {
    if (!d.rows.length) return empty();
    const card = (r, extra) => `<section class="rp-card rp-site-card${extra || ''}"><header><h4>${esc(r.name)}</h4>${r.merchant === d.best && d.rows.length > 1 ? `<span class="rp-tag">${esc(L('meilleur', 'best', 'الأفضل'))}</span>` : r.merchant === d.worst ? `<span class="rp-tag low">${esc(L('à surveiller', 'watch', 'للمتابعة'))}</span>` : ''}</header>
      <div class="big">${esc(mad0(r.cur.net))}</div><div>${delta(r.cur.net, r.prev.net)} <small class="rp-note">${esc(L('avant', 'before', 'قبل'))} ${esc(mad0(r.prev.net))}</small></div>
      ${r.share != null ? share(r.share) : ''}
      ${r.vsAverage && r.vsAverage.net != null && d.average && d.rows.filter((x) => x.cur.tickets || x.cur.refundCount).length > 1 ? `<div class="rp-vs"><span>${esc(L('Face à la moyenne du groupe', 'vs group average', 'مقارنة مع متوسط المجموعة'))}</span>${delta(r.cur.net, d.average.net)}</div>` : ''}
      <dl><dt>${esc(L('Tickets', 'Tickets', 'التذاكر'))}</dt><dd>${esc(fmt(r.cur.tickets))}</dd><dt>${esc(L('Panier moyen', 'Average basket', 'متوسط السلة'))}</dt><dd>${esc(mad0(r.cur.basket))}</dd>
      <dt>${esc(L('Remises', 'Discounts', 'التخفيضات'))}</dt><dd>${esc(mad0(r.cur.discounts))}</dd><dt>${esc(L('Remboursements', 'Refunds', 'المرجوعات'))}</dt><dd>${esc(mad0(r.cur.refunds))}</dd>
      ${d.showCost && r.cur.marginPct != null ? `<dt>${esc(L('Marge brute', 'Gross margin', 'الهامش الإجمالي'))}</dt><dd>${esc(pctTxt(r.cur.marginPct))}</dd>` : ''}</dl></section>`;
    const total = { merchant: '', name: L('Tous les établissements', 'All locations', 'كل المؤسسات'), cur: d.totals.cur, prev: d.totals.prev, share: null };
    return `<div class="rp-sites">${d.rows.map((r) => card(r)).join('')}${d.rows.length > 1 ? card(total, ' total') : ''}</div>`;
  }

  /* La version imprimable : une page autonome, sans la coquille du tableau de
     bord, que le navigateur imprime ou enregistre en PDF. */
  /* La page de garde pour le comptable : la période, les totaux et la TVA
     par taux, avant le rapport lui-même. */
  function cover(sum, vatData, siteName) {
    if (!sum) return '';
    const c = sum.totals.cur;
    const tile = (label, v) => `<div class="rp-kpi"><span>${esc(label)}</span><b>${esc(v)}</b></div>`;
    const vatRows = vatData && vatData.rows ? vatData.rows.map((r) => `<tr>${td(r.rate == null ? esc(L('Taux inconnu', 'Unknown rate', 'نسبة غير معروفة')) : esc(pctTxt(r.rate)))}${td(esc(mad(r.ht)), 1)}${td(esc(mad(r.vat)), 1)}${td(esc(mad(r.ttc)), 1)}</tr>`) : [];
    const vt = vatData && vatData.totals;
    const vatTable = vatRows.length ? table([{ t: L('Taux', 'Rate', 'النسبة') }, { t: L('HT', 'Excl. VAT', 'دون ضريبة'), n: 1 }, { t: L('TVA', 'VAT', 'الضريبة'), n: 1 }, { t: L('TTC', 'Incl. VAT', 'بالضريبة'), n: 1 }],
      vatRows, `<tr class="tot">${td(esc(L('Total', 'Total', 'المجموع')))}${td(esc(mad(vt.ht)), 1)}${td(esc(mad(vt.vat)), 1)}${td(esc(mad(vt.ttc)), 1)}</tr>`) : '';
    return `<section class="rp-cover"><h2>${esc(L('Synthèse pour le comptable', 'Summary for the accountant', 'ملخص للمحاسب'))} · ${esc(siteName)}</h2>
      <div class="rp-kpis">${tile(L('Ventes brutes', 'Gross sales', 'المبيعات الإجمالية'), mad(c.gross))}${tile(L('Remises', 'Discounts', 'التخفيضات'), mad(c.discounts))}${tile(L('Remboursements', 'Refunds', 'المرجوعات'), mad(c.refunds))}${tile(L('Ventes nettes TTC', 'Net sales incl. VAT', 'المبيعات الصافية بالضريبة'), mad(c.net))}
      ${tile(L('Tickets', 'Tickets', 'التذاكر'), fmt(c.tickets))}${tile(L('Panier moyen', 'Average basket', 'متوسط السلة'), mad(c.basket))}${tile(L('Pourboires (hors CA)', 'Tips (not revenue)', 'البقشيش (خارج رقم المعاملات)'), mad(c.tips))}${tile(L('TVA collectée', 'VAT collected', 'الضريبة المحصّلة'), mad(vt ? vt.vat : c.vat && c.vat.vat))}</div>
      ${reconcile(sum, false)}
      <h2>${esc(L('TVA par taux', 'VAT by rate', 'الضريبة حسب النسبة'))}</h2>${vatTable || `<p class="rp-note">${esc(L('Aucune vente taxable.', 'No taxable sales.', 'لا مبيعات خاضعة للضريبة.'))}</p>`}</section>`;
  }

  function printable(title, siteName, body, data, extra) {
    const dir = lang() === 'ar' ? 'rtl' : 'ltr';
    return `<!doctype html><html lang="${lang()}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="stylesheet" href="${esc(new URL('assets/tokens.css', document.baseURI).href)}">
<style>${CSS}
body{margin:0;padding:28px 32px;background:#FDFCF9;color:#0A0F0D;font-family:'Inter Tight','IBM Plex Sans Arabic',system-ui,sans-serif}
.pr-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid #0B6E4F;padding-bottom:12px;margin-bottom:18px}
.pr-head h1{margin:0;font-size:22px;font-weight:600}.pr-head p{margin:4px 0 0;color:#6F6C65;font-size:13px}
.rp-lede{background:#F2F0EA;color:#0A0F0D;border-color:#E4E0D6}.rp-lede .rp-dot{background:#0B6E4F}.rp-lede a{display:none}
.rp-card,.rp-kpi{break-inside:avoid;background:#FDFCF9}.rp-pager,.rp-rec .kb{display:none}
.pr-foot{margin-top:22px;color:#6F6C65;font-size:11px}
@page{size:A4;margin:14mm}
@media print{body{padding:0}.rp-scroll{overflow:visible}.rp-heat{min-width:0}}
</style></head><body><div class="rp-page">
<div class="pr-head"><div><h1>${esc(title)}</h1><p>${esc(siteName)} · ${esc(rangeTxt(data.period))}</p></div><p>Kiwi</p></div>
${extra && extra.summary ? cover(extra.summary, extra.vat, siteName) : ''}
${body}
<p class="pr-foot">${esc(L('Généré par Kiwi le', 'Generated by Kiwi on', 'أُنشئ بواسطة Kiwi في'))} ${esc(new Date(data.generatedAt).toLocaleString(lang() === 'en' ? 'en-GB' : lang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR'))}. ${esc(L('Montants TTC en dirhams, journées commerciales de la boutique.', 'Amounts include VAT, in dirhams, by the store’s business days.', 'المبالغ بالدرهم شاملة للضريبة، حسب الأيام التجارية للمحل.'))}</p>
</div></body></html>`;
  }

  /* Les noms des moyens et des canaux, les mêmes que functions/api/reports.js
     (le CSV) : en arabe, des noms (« الأداء نقدا »), jamais l'adverbe seul. */
  const METHOD = {
    cash: ['Espèces', 'Cash', 'الأداء نقدا'], card: ['Carte', 'Card', 'الأداء بالبطاقة'], tap: ['Sans contact', 'Contactless', 'الأداء بدون تلامس'],
    transfer: ['Virement', 'Bank transfer', 'التحويل البنكي'], cheque: ['Chèque', 'Cheque', 'الشيك'], split: ['Paiement mixte', 'Split payment', 'الأداء المختلط'],
    qr: ['QR', 'QR', 'الأداء عبر QR'], wallet: ['Portefeuille', 'Wallet', 'المحفظة الإلكترونية'], credit: ['Avoir / compte client', 'Store credit / account', 'رصيد الزبون وحسابه'],
    delivery: ['À la livraison', 'Cash on delivery', 'الأداء عند التسليم'], complimentary: ['Offert', 'On the house', 'ما قُدّم مجانا'], '': ['Non précisé', 'Not recorded', 'وسيلة غير محددة'],
  };
  const CHANNEL = {
    '': ['Non renseigné', 'Not recorded', 'قناة غير محددة'], surplace: ['Sur place', 'Dine-in', 'الأكل في المحل'], dining: ['Sur place', 'Dine-in', 'الأكل في المحل'],
    emporter: ['À emporter', 'Takeaway', 'الطلبات للأخذ'], takeaway: ['À emporter', 'Takeaway', 'الطلبات للأخذ'], terrace: ['Terrasse', 'Terrace', 'التراس'],
    delivery: ['Livraison', 'Delivery', 'التوصيل'], counter: ['Comptoir', 'Counter', 'الكونطوار'], walkin: ['En boutique', 'Walk-in', 'البيع في المحل'],
    storefront: ['Boutique en ligne', 'Online shop', 'المتجر الإلكتروني'], hotel: ['Hôtel', 'Hotel', 'الفندق'], direct: ['Direct', 'Direct', 'البيع المباشر'],
    whatsapp: ['WhatsApp', 'WhatsApp', 'واتساب'], glovo: ['Glovo', 'Glovo', 'Glovo'], ozon: ['Ozon Express', 'Ozon Express', 'Ozon Express'],
  };
  const title = (k) => String(k || '').replace(/^\w/, (c) => c.toUpperCase());
  const tri = (table) => (code) => (table[code] ? { fr: table[code][0], en: table[code][1], ar: table[code][2] } : { fr: title(code), en: title(code), ar: title(code) });
  const pick = (t) => t[lang()] || t.fr;
  const methodTri = tri(METHOD), channelTri = tri(CHANNEL);
  const methodLabel = (m) => pick(methodTri(m)), channelLabel = (c) => pick(channelTri(c));

  window.KiwiReportViews = { css, ic, esc, L, lang, mad, mad0, pctTxt, dayTxt, rangeTxt, lede, summary, ranking, staff, bars, heatmap, vat, customers, sites, printable, delta,
    methodTri, channelTri, methodLabel, channelLabel };
})();
