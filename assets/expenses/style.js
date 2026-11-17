/* Dépenses · la feuille de style, injectée une fois. Jetons seulement
 * (assets/tokens.css) : le mode sombre suit leur bascule, rien n'est codé en
 * dur. Propriétés logiques (inline-start/end) : l'arabe se retourne seul.
 * Le ressort de la maison (--spring, 310 ms) anime la barre et les jours à
 * l'ouverture de la page, une fois ; en mouvement réduit tout est posé à sa
 * valeur finale, qui dit déjà la vérité. Romain partout, jamais d'italique. */

const CSS = `
.xp{--xp-line:var(--n-200);--xp-soft:var(--n-600);display:grid;gap:18px;font-variant-numeric:tabular-nums;color:var(--ink);}
.xp *{font-style:normal;}
.xp [hidden],.xp-sheet [hidden]{display:none;}
.xp button{font:inherit;color:inherit;}
.xp-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.xp-month{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--xp-line);border-radius:999px;padding:3px;background:var(--surface);}
.xp-month b{font-weight:600;font-size:14px;padding:0 10px;min-width:9ch;text-align:center;text-transform:capitalize;}
.xp-iconbtn{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:999px;background:transparent;}
.xp-iconbtn:hover{background:var(--n-100);}
.xp-iconbtn[disabled]{opacity:.35;cursor:default;background:transparent;}
.xp-iconbtn svg,.xp-btn svg,.xp-cat-ico svg,.xp-row-ico svg,.xp-callout svg{width:18px;height:18px;fill:currentColor;}
.xp-iconbtn [data-icon="chevron_left"],.xp-iconbtn [data-icon="chevron_right"]{display:inline-grid;}
[dir="rtl"] .xp-iconbtn [data-icon^="chevron"] svg{transform:scaleX(-1);}
.xp-actions{display:flex;gap:8px;flex-wrap:wrap;}
.xp-btn{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;font-weight:550;font-size:14px;border:1px solid var(--xp-line);background:var(--surface);transition:background-color .18s,border-color .18s;}
.xp-btn:hover{border-color:var(--n-300);}
.xp-btn.primary{background:var(--atlas);border-color:var(--atlas);color:var(--paper);}
.xp-btn.primary:hover{background:var(--atlas-700);border-color:var(--atlas-700);}
.xp-btn.ghost{border-color:transparent;background:transparent;color:var(--xp-soft);}
.xp-btn.ghost:hover{color:var(--ink);background:var(--n-100);}
.xp-card{background:var(--surface);border:1px solid var(--xp-line);border-radius:var(--r-xl,20px);padding:22px;}
.xp-k{display:block;font-size:12px;font-weight:550;letter-spacing:.04em;text-transform:uppercase;color:var(--xp-soft);}
.xp-hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:22px 36px;align-items:end;}
.xp-big{display:block;font-size:clamp(40px,6vw,68px);font-weight:600;letter-spacing:-.025em;line-height:1;margin:10px 0 12px;}
.xp-big small{font-size:.36em;font-weight:550;letter-spacing:0;color:var(--xp-soft);margin-inline-start:.3em;}
.xp-big.neg{color:var(--danger);}
.xp-insight{margin:0;font-size:14px;line-height:1.5;color:var(--xp-soft);max-width:46ch;}
.xp-insight b{color:var(--ink);font-weight:600;}
.xp-pair{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.xp-pair > div{border-inline-start:2px solid var(--xp-line);padding-inline-start:14px;}
.xp-pair > div.in{border-color:var(--atlas);}
.xp-pair > div.out{border-color:var(--ink);}
.xp-pair b{display:block;font-size:22px;font-weight:600;letter-spacing:-.02em;margin-top:6px;}
.xp-pair b small{font-size:12px;font-weight:550;color:var(--xp-soft);margin-inline-start:4px;letter-spacing:0;}
.xp-split{grid-column:1/-1;position:relative;height:12px;border-radius:999px;background:var(--mint-soft,var(--n-100));overflow:hidden;}
.xp-split i{position:absolute;inset-block:0;inset-inline-start:0;width:var(--w,0%);border-radius:inherit;background:var(--inverse-surface);}
.xp-split.over i{background:var(--danger);}
.xp-split-legend{grid-column:1/-1;display:flex;justify-content:space-between;gap:12px;font-size:12.5px;color:var(--xp-soft);margin-top:-12px;}
.xp-enter .xp-split i{animation:xp-grow .62s var(--spring,cubic-bezier(.34,1.45,.5,1)) both;}
@keyframes xp-grow{from{width:0;}}
.xp-callout{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:var(--r-lg,16px);background:var(--warn-soft);color:var(--warn-ink);}
.xp-callout p{margin:0;flex:1;font-size:13.5px;line-height:1.45;}
.xp-callout p b{display:block;font-weight:600;font-size:14.5px;}
.xp-callout .xp-btn{background:var(--surface);color:var(--ink);border-color:transparent;height:36px;}
.xp-aside{margin:0;font-size:13px;line-height:1.5;color:var(--xp-soft);display:flex;gap:8px;align-items:flex-start;}
.xp-aside svg{width:16px;height:16px;fill:currentColor;flex:none;margin-top:2px;}
.xp-grid2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:18px;align-items:start;}
.xp-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 14px;}
.xp-h h2{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em;}
.xp-h span{font-size:12.5px;color:var(--xp-soft);}
.xp-cats{display:grid;gap:4px;}
.xp-cat{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:4px 12px;width:100%;text-align:start;padding:9px 10px;border-radius:var(--r-md,12px);background:transparent;transition:background-color .18s;}
.xp-cat:hover{background:var(--n-50,var(--n-100));}
.xp-cat[aria-pressed="true"]{background:var(--mint-soft,var(--n-100));}
.xp-cat-ico{grid-row:span 2;display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--n-100);color:var(--atlas);}
.xp-cat-name{font-size:14px;font-weight:550;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.xp-cat-amt{font-size:14px;font-weight:600;text-align:end;}
.xp-cat-track{grid-column:2/3;height:5px;border-radius:999px;background:var(--n-100);overflow:hidden;position:relative;}
.xp-cat-track i{position:absolute;inset-block:0;inset-inline-start:0;width:var(--w,0%);background:var(--atlas);border-radius:inherit;}
.xp-enter .xp-cat-track i{animation:xp-grow .62s var(--spring,cubic-bezier(.34,1.45,.5,1)) both;}
.xp-cat-pct{font-size:12px;color:var(--xp-soft);text-align:end;}
.xp-days{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);align-items:end;gap:3px;height:120px;padding-top:6px;}
.xp-day{position:relative;height:100%;display:flex;align-items:flex-end;justify-content:center;border-radius:6px;background:transparent;padding:0;}
.xp-day i{display:block;width:100%;max-width:18px;height:var(--h,0%);min-height:2px;border-radius:5px 5px 2px 2px;background:var(--n-300);transform-origin:bottom;}
.xp-day.has i{background:var(--inverse-surface);}
.xp-day.today i{background:var(--atlas);}
.xp-day.future i{background:var(--n-100);}
.xp-day:hover i,.xp-day[aria-pressed="true"] i{background:var(--atlas);}
.xp-day[aria-pressed="true"]{background:var(--mint-soft,var(--n-100));}
.xp-enter .xp-day i{animation:xp-rise .52s var(--spring,cubic-bezier(.34,1.45,.5,1)) both;animation-delay:calc(var(--i,0) * 12ms);}
@keyframes xp-rise{from{transform:scaleY(0);}}
.xp-days-axis{display:flex;justify-content:space-between;font-size:11.5px;color:var(--xp-soft);margin-top:8px;}
.xp-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
.xp-search{flex:1;min-width:180px;display:flex;align-items:center;gap:8px;height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--xp-line);background:var(--paper);}
.xp-search svg{width:18px;height:18px;fill:var(--xp-soft);flex:none;}
.xp-search input{border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--ink);width:100%;}
.xp-chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;background:var(--mint-soft,var(--n-100));font-size:13px;font-weight:550;}
.xp-group + .xp-group{margin-top:16px;}
.xp-group-h{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;font-weight:550;color:var(--xp-soft);padding:0 10px 6px;border-bottom:1px solid var(--xp-line);text-transform:capitalize;}
.xp-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;width:100%;text-align:start;padding:11px 10px;border-radius:var(--r-md,12px);background:transparent;transition:background-color .18s;}
.xp-row:hover{background:var(--n-50,var(--n-100));}
.xp-row-ico{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:var(--n-100);color:var(--ink);}
.xp-row[data-source="till"] .xp-row-ico{background:var(--warn-soft);color:var(--warn-ink);}
.xp-row-main{min-width:0;}
.xp-row-t{display:block;font-size:14.5px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.xp-row-s{display:flex;flex-wrap:wrap;gap:4px 8px;margin-top:3px;font-size:12.5px;color:var(--xp-soft);}
.xp-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--n-100);color:var(--ink);}
.xp-badge.till{background:var(--warn-soft);color:var(--warn-ink);}
.xp-badge.scan{background:var(--mint-soft,var(--n-100));color:var(--atlas-700,var(--atlas));}
.xp-badge.guess{background:transparent;border:1px dashed var(--n-300);color:var(--xp-soft);font-weight:550;}
.xp-row-amt{font-size:15px;font-weight:600;white-space:nowrap;}
.xp-none{padding:22px 10px;text-align:center;font-size:14px;color:var(--xp-soft);}
.xp-fixed{display:grid;gap:0;}
.xp-fixed div{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--xp-line);font-size:14px;}
.xp-fixed div:first-child{border-top:0;}
.xp-fixed div.total{font-weight:600;font-size:15px;}
.xp-fixed div.total.neg span{color:var(--danger);}
.xp-empty{display:grid;justify-items:center;text-align:center;gap:14px;padding:56px 22px;}
.xp-empty-ico{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:var(--mint-soft,var(--n-100));color:var(--atlas);}
.xp-empty-ico svg{width:30px;height:30px;fill:currentColor;}
.xp-empty h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;}
.xp-empty p{margin:0;max-width:52ch;font-size:14.5px;line-height:1.55;color:var(--xp-soft);}
.xp-soft-note{font-size:12.5px;color:var(--xp-soft);margin:0;}
.xp-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}

.xp-sheet{display:grid;gap:16px;color:var(--ink);font-variant-numeric:tabular-nums;}
.xp-sheet *{font-style:normal;}
.xp-sheet label,.xp-sheet .xp-lbl{display:block;font-size:12.5px;font-weight:600;color:var(--n-600);margin-bottom:6px;}
.xp-sheet input[type="text"],.xp-sheet input[type="date"]{width:100%;height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--n-200);background:var(--paper);font:inherit;font-size:15px;color:var(--ink);box-sizing:border-box;}
.xp-sheet input:focus{outline:2px solid var(--atlas);outline-offset:1px;border-color:transparent;}
.xp-amount{display:flex;align-items:center;gap:10px;border:1px solid var(--n-200);border-radius:16px;padding:6px 16px;background:var(--paper);}
.xp-sheet .xp-amount input[name="amount"]{border:0;outline:0;height:56px;padding:0;font-size:34px;font-weight:600;letter-spacing:-.03em;background:transparent;}
.xp-amount span{font-size:15px;font-weight:600;color:var(--n-600);}
.xp-amount.ro{background:var(--n-100);}
.xp-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.xp-picks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;}
.xp-pick{display:grid;justify-items:center;gap:4px;padding:10px 4px;border-radius:12px;border:1px solid var(--n-200);background:var(--surface);font-size:11.5px;font-weight:550;line-height:1.2;text-align:center;transition:background-color .18s,border-color .18s;}
.xp-pick svg{width:20px;height:20px;fill:currentColor;color:var(--atlas);}
.xp-pick[aria-pressed="true"]{border-color:var(--atlas);background:var(--mint-soft,var(--n-100));}
.xp-seg{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--n-100);position:relative;}
.xp-seg button{flex:1;height:34px;border-radius:999px;font-size:13px;font-weight:550;background:transparent;position:relative;z-index:1;}
.xp-seg button.on{background:var(--surface);box-shadow:var(--elev-1,0 1px 2px rgba(0,0,0,.08));}
.xp-note{display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:12px;background:var(--n-100);font-size:13px;line-height:1.45;}
.xp-note.warn{background:var(--warn-soft);color:var(--warn-ink);}
.xp-note.ok{background:var(--mint-soft,var(--n-100));}
.xp-verify{outline:2px dashed var(--warning,var(--atlas));outline-offset:2px;}
.xp-err{color:var(--danger);font-size:13px;margin:0;}
.xp-sheet-foot{display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;}
.xp-sheet-foot .xp-right{display:flex;gap:8px;margin-inline-start:auto;}
.xp-confirm{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13.5px;font-weight:550;}
.xp-btn.danger{color:var(--danger);border-color:transparent;background:transparent;}
.xp-btn.danger-fill{background:var(--danger);border-color:var(--danger);color:var(--paper);}

@media (max-width:992px){.xp-hero,.xp-grid2{grid-template-columns:1fr;}}
@media (max-width:480px){
  .xp-card{padding:16px;}
  .xp-actions{width:100%;}
  .xp-actions .xp-btn{flex:1;justify-content:center;}
  .xp-pair{grid-template-columns:1fr 1fr;}
  .xp-picks{grid-template-columns:repeat(3,minmax(0,1fr));}
  .xp-days{height:96px;gap:2px;}
}
@media (prefers-reduced-motion:reduce){
  .xp-enter .xp-split i,.xp-enter .xp-cat-track i,.xp-enter .xp-day i{animation:none;}
}
`;

export function ensureStyle() {
  if (document.getElementById('kiwi-expenses-css')) return;
  const st = document.createElement('style');
  st.id = 'kiwi-expenses-css';
  st.append(document.createTextNode(CSS));
  document.head.appendChild(st);
}
