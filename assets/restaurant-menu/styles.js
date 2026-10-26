/* Kiwi · Carte : styles. Installation inerte, aucun accès au DOM au chargement. */
(function () {
  'use strict';
  const parts = window.KiwiMenuWorkspaceParts ||= {};
  parts.styles = function ({$}) {
  /* menu-part:styles */
  function style(){if($('#rmw-css'))return;const s=document.createElement('style');s.id='rmw-css';s.textContent=`@keyframes rmw-spin{to{transform:rotate(360deg)}}.mi-card{position:relative;overflow:visible;cursor:pointer}.mi-card:focus-visible{outline:3px solid color-mix(in srgb,var(--atlas) 25%,transparent);outline-offset:2px}.mi-card button,.mi-card [role="switch"]{cursor:pointer}.rmw-menu-open,.mi-card:has(.rmw-card-menu[open]){z-index:30}.mi-card-top{min-height:42px;padding-inline-end:0;align-items:flex-start}.mi-card-cat{min-width:0;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.45}.mi-card-top .mi-tag{flex:0 0 auto;white-space:nowrap}.mi-card-foot>span:first-child{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mi-card-foot .mi-card-acts{flex:0 0 auto}.rmw-nutri-dot{display:inline-flex;align-items:center;gap:5px;vertical-align:baseline;color:var(--n-500)}.rmw-nutri-dot>i{width:7px;height:7px;border-radius:50%;background:var(--n-400,var(--n-300));flex:0 0 auto}.rmw-nutri-dot.req{color:var(--atlas)}.rmw-nutri-dot.req>i{background:var(--atlas)}.rmw-nutri-dot.opt>i{background:#c9921c}.rmw-nutri-dot.mode>i{background:var(--n-300)}.mi-card-acts{align-items:center}.rmw-card-menu{position:relative;inset:auto;margin-inline-start:auto;flex:0 0 auto;z-index:5}.rmw-more-btn{width:36px;height:36px;list-style:none;padding:0;border:1px solid transparent;border-radius:9px;background:color-mix(in srgb,var(--surface) 82%,transparent);color:var(--n-500);display:grid;place-items:center;cursor:pointer;transition:background 140ms,border-color 140ms,color 140ms,transform 140ms}.rmw-more-btn:hover,.rmw-card-menu[open]>.rmw-more-btn{background:var(--paper-soft);border-color:var(--n-300);color:var(--ink)}.rmw-more-btn:active{transform:scale(.94)}.rmw-more-btn::-webkit-details-marker{display:none}.rmw-more-btn svg{width:17px;height:17px}.rmw-action-pop{position:absolute;inset-block-start:42px;inset-inline-end:0;width:174px;padding:6px;display:grid;gap:3px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--n-200);border-radius:13px;box-shadow:0 18px 48px -16px rgba(0,0,0,.48),0 4px 14px rgba(0,0,0,.14);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);animation:rmw-menu-in 150ms cubic-bezier(.2,.8,.2,1);transform-origin:top right}.rmw-action-pop button{width:100%;min-height:38px;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:var(--ink);display:flex;align-items:center;gap:10px;font:600 12px var(--sans);text-align:start;cursor:pointer;transition:background 120ms,color 120ms}.rmw-action-pop button:hover{background:color-mix(in srgb,var(--atlas) 11%,transparent);color:var(--atlas)}.rmw-action-pop button.danger{color:var(--danger)}.rmw-action-pop button.danger:hover{background:color-mix(in srgb,var(--danger) 12%,transparent)}.rmw-action-pop svg{width:16px;height:16px;flex:0 0 auto}@keyframes rmw-menu-in{from{opacity:0;transform:translateY(-5px) scale(.96)}to{opacity:1;transform:none}}.rmw-empty{text-align:center;color:var(--n-500);padding:34px 18px}.rmw-empty h3{color:var(--ink);margin:0 0 8px}.rmw-empty p{max-width:560px;margin:0 auto 18px;line-height:1.5}.rmw-nfc{margin-top:28px}.rmw-media{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:10px}.rmw-off{opacity:.58}.rmw-archived{opacity:.68;border-style:dashed}.mi-state-toggle{min-height:30px;padding:5px 9px;border:1px solid var(--n-200);border-radius:999px;background:var(--surface);color:var(--atlas);font:600 10px var(--mono);cursor:pointer}.mi-state-toggle[aria-checked="false"]{color:var(--n-500)}.rmw-archived-group{padding:9px 11px;border:1px dashed var(--n-300);border-radius:10px}.rmw-archived-group summary{cursor:pointer;font-size:12px;color:var(--n-500)}.rmw-archived-group button{margin:7px 5px 0 0;padding:6px 9px;border:1px solid var(--n-200);border-radius:8px;background:var(--paper-soft);color:var(--n-500)}.rmw-routes{display:grid;gap:8px}.rmw-route{display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,360px);align-items:center;gap:18px;padding:13px;border-bottom:1px solid var(--n-200)}.rmw-route select{border:1px solid var(--n-200);border-radius:10px;padding:10px;background:var(--surface);color:var(--ink)}.rmw-emoji-btn{width:46px;min-width:46px;border:1px solid var(--n-200);border-radius:10px;background:var(--paper-soft);font-size:22px;cursor:pointer}.rmw-emoji-pop{position:fixed;z-index:100000;width:370px;max-height:310px;overflow:auto;padding:10px;background:var(--surface);border:1px solid var(--n-200);border-radius:14px;box-shadow:0 20px 55px #0003;display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.rmw-emoji-pop button{height:38px;border:0;border-radius:7px;background:transparent;font-size:21px;cursor:pointer}.rmw-emoji-pop .rmw-none{grid-column:1/-1;font:12px var(--sans);border:1px solid var(--n-200)}.rmw-emoji-pop button:hover{background:var(--mint-soft)}.rmw-textarea{min-height:120px}.rmw-hours{display:flex;align-items:flex-end;gap:8px;min-height:170px;overflow:auto;padding:25px 4px 0}.rmw-hour{min-width:34px;display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px;color:var(--n-500)}.rmw-hour i{width:22px;background:var(--atlas);border-radius:5px 5px 1px 1px}.rmw-hour b{font-size:11px;color:var(--ink)}.rmw-recipe-list{display:grid;gap:8px;margin-top:22px}.rmw-recipe-card{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,auto) auto;align-items:center;gap:18px;padding:15px 16px;background:var(--surface);border:1px solid var(--n-200);border-radius:12px}.rmw-recipe-name{font-weight:650;color:var(--ink)}.rmw-recipe-meta,.rmw-recipe-result small{display:block;margin-top:4px;font-size:11.5px;color:var(--n-500)}.rmw-recipe-result{text-align:right}.rmw-recipe-modal .kiwi-modal,.rmw-recipe-modal [role=dialog]{background:var(--paper)}.rmw-recipe-modal .kiwi-modal-body{padding-bottom:18px}.rmw-recipe-modal .kiwi-modal-foot{position:sticky;bottom:0;z-index:2;background:var(--paper);border-top:1px solid var(--n-200)}.rmw-performance{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}.rmw-performance>*,.rmw-perf-matrix{min-width:0;max-width:100%}.rmw-perf-legend{overflow-x:auto}.rmw-perf-legend>span{flex:none;white-space:nowrap}.rmw-perf-period{padding:8px 13px;border:1px solid var(--n-200);border-radius:999px;background:var(--paper-soft);font-size:12px;color:var(--n-600)}.rmw-perf-ledger{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.rmw-perf-ledger>div{display:grid;gap:7px;padding:17px 18px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}.rmw-perf-ledger span{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-perf-ledger b{font-size:22px;letter-spacing:-.03em;font-variant-numeric:tabular-nums}.rmw-perf-ledger small{color:var(--n-500)}.rmw-perf-notes{display:grid;gap:6px;margin:0 0 12px;padding:12px 16px;border:1px solid var(--n-200);border-radius:13px;background:var(--paper-soft);font-size:12.5px;color:var(--n-600)}.rmw-perf-notes p{margin:0}.rmw-perf-notes p.warn{color:var(--danger,#9F3028);font-weight:600}.rmw-perf-off td{color:var(--n-600)}@media (max-width:900px){.rmw-perf-ledger{grid-template-columns:1fr 1fr}}.rmw-perf-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.rmw-perf-kpis>div{display:grid;gap:7px;padding:17px 18px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}.rmw-perf-kpis span{font:10px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--n-500)}.rmw-perf-kpis b{font-size:24px;letter-spacing:-.03em}.rmw-perf-kpis small{color:var(--n-500)}.rmw-perf-matrix{position:relative;margin-top:26px;padding:0 0 25px 35px}.rmw-perf-plot{position:relative;height:390px;border-left:1px solid var(--n-300);border-bottom:1px solid var(--n-300);background:linear-gradient(90deg,transparent 49.85%,var(--n-200) 50%,transparent 50.15%),linear-gradient(0deg,transparent 49.85%,var(--n-200) 50%,transparent 50.15%),#fff;border-radius:4px 12px 4px 4px}.rmw-perf-y{position:absolute;left:-128px;top:190px;width:290px;transform:rotate(-90deg);text-align:center;font-size:11px;color:var(--n-500)}.rmw-perf-x{text-align:center;margin-top:9px;font-size:11px;color:var(--n-500)}.rmw-perf-caption{text-align:center;margin-top:7px;font-size:11px;color:var(--n-500)}.rmw-perf-v,.rmw-perf-h{position:absolute;z-index:0;background:var(--n-300);opacity:.7}.rmw-perf-v{top:0;bottom:0;width:1px}.rmw-perf-h{left:0;right:0;height:1px}.rmw-perf-label{position:absolute;z-index:0;font:700 12px var(--mono);letter-spacing:.04em;pointer-events:none}.rmw-perf-label small{display:block;margin-top:3px;font:10px var(--sans);letter-spacing:0;color:var(--n-500)}.rmw-perf-label.puzzle{left:18px;top:16px}.rmw-perf-label.star{right:18px;top:16px;text-align:right}.rmw-perf-label.dog{left:18px;bottom:16px}.rmw-perf-label.plow{right:18px;bottom:16px;text-align:right}.rmw-perf-dot{position:absolute;transform:translate(-50%,50%);border:2px solid #fff;border-radius:50%;box-shadow:0 2px 9px #0003;cursor:pointer}.rmw-perf-dot.star{background:#1d9c67}.rmw-perf-dot.plow{background:#d49a25}.rmw-perf-dot.puzzle{background:#357fad}.rmw-perf-dot.dog{background:#cb5238}.rmw-perf-dot>span{display:none;position:absolute;left:50%;bottom:calc(100% + 8px);width:max-content;max-width:240px;transform:translateX(-50%);padding:9px 11px;border-radius:8px;background:#101612;color:#fff;text-align:left;font:11px/1.5 var(--sans);box-shadow:0 8px 24px #0004}.rmw-perf-dot:hover>span,.rmw-perf-dot:focus>span{display:block}.rmw-perf-quads{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.rmw-perf-q{display:grid;gap:8px;padding:16px;background:var(--surface);border:1px solid var(--n-200);border-top:3px solid var(--n-300);border-radius:11px}.rmw-perf-q.star{border-top-color:#1d9c67}.rmw-perf-q.plow{border-top-color:#d49a25}.rmw-perf-q.puzzle{border-top-color:#357fad}.rmw-perf-q.dog{border-top-color:#cb5238}.rmw-perf-q h4{margin:0;font:700 11px var(--mono);letter-spacing:.06em}.rmw-perf-q strong{font-size:21px}.rmw-perf-q p,.rmw-perf-q div{margin:0;font-size:11px;color:var(--n-500);line-height:1.45}.rmw-perf-q div span{display:block;font:9px var(--mono);letter-spacing:.05em;text-transform:uppercase}.rmw-perf-q footer{display:grid;gap:3px;padding-top:9px;border-top:1px solid var(--n-200);font-size:11px}.rmw-perf-q footer b{font-size:14px}.rmw-perf-q footer small{color:var(--n-500)}.rmw-perf-table td small{display:block;margin-top:3px;color:var(--n-500);font-size:11px}.rmw-perf-margin{display:inline-block;padding:4px 7px;border-radius:999px;font-weight:700}.rmw-perf-margin.hi{background:#d9f4e6;color:#14734a}.rmw-perf-margin.mid{background:#fff0c9;color:#8c620a}.rmw-perf-margin.lo{background:#ffe0da;color:#a83b27}.rmw-perf-link{padding:0;border:0;background:none;color:var(--atlas);font:inherit;text-decoration:underline;cursor:pointer}.rmw-item-workspace .kiwi-modal,.rmw-item-workspace [role=dialog],.rmw-item-workspace.kiwi-modal,.rmw-item-workspace[role=dialog]{max-height:calc(100vh - 24px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}.rmw-item-workspace .kiwi-modal-body{min-height:0;overflow:auto;padding-bottom:28px}.rmw-item-workspace .kiwi-modal-foot{position:sticky;bottom:0;z-index:8;border-top:1px solid var(--n-200);background:color-mix(in srgb,var(--paper) 94%,transparent);backdrop-filter:blur(18px);box-shadow:0 -18px 38px -34px rgba(0,0,0,.7)}.rmw-formula-builder{gap:16px!important}.rmw-formula-picker-search svg{width:18px;height:18px;fill:currentColor}.rmw-formula-picker{margin-top:8px;overflow:hidden;border:1px solid var(--n-200);border-radius:16px;background:var(--surface);box-shadow:0 18px 44px -30px rgba(0,0,0,.48)}.rmw-formula-picker.is-floating{position:fixed;z-index:100005;max-height:min(460px,calc(100vh - 24px));margin:0;border-radius:18px;box-shadow:0 26px 80px -28px rgba(0,0,0,.78);backdrop-filter:blur(24px);animation:kiwi-picker-in .15s cubic-bezier(.2,.8,.2,1) both}@keyframes kiwi-picker-in{from{opacity:0;transform:translateY(-5px) scale(.985)}to{opacity:1;transform:none}}.rmw-formula-picker[hidden]{display:none}.rmw-formula-picker-search{position:sticky;top:0;z-index:2;padding:10px;border-bottom:1px solid var(--n-200);background:color-mix(in srgb,var(--surface) 94%,transparent);backdrop-filter:blur(14px)}.rmw-formula-picker-search label{height:39px;padding:0 11px;display:flex;align-items:center;gap:8px;border:1px solid var(--n-200);border-radius:11px;background:var(--paper-soft);color:var(--n-500)}.rmw-formula-picker-search input{width:100%;height:100%;padding:0;border:0;outline:0;background:transparent;color:var(--ink);font:500 12.5px var(--sans)}.rmw-formula-picker-results{max-height:292px;overflow:auto;padding:5px 7px 8px;scrollbar-width:thin;scrollbar-color:var(--n-300) transparent}.rmw-formula-picker-group{padding:5px 0 0}.rmw-formula-picker-group[hidden],.rmw-formula-picker-option[hidden]{display:none}.rmw-formula-picker-group-title{padding:7px 9px 5px;color:var(--n-500);font:700 9px var(--mono);letter-spacing:.1em;text-transform:uppercase}.rmw-formula-picker-option{width:100%;min-height:46px;padding:7px 9px;display:grid;grid-template-columns:minmax(0,1fr) auto 24px;align-items:center;gap:10px;border:0;border-radius:11px;background:transparent;color:var(--ink);text-align:start;cursor:pointer}.rmw-formula-picker-option:hover,.rmw-formula-picker-option:focus-visible{outline:0;background:color-mix(in srgb,var(--atlas) 10%,transparent)}.rmw-formula-picker-option-copy{min-width:0;display:grid;gap:2px}.rmw-formula-picker-option-copy strong{overflow:hidden;font:600 12.5px var(--sans);text-overflow:ellipsis;white-space:nowrap}.rmw-formula-picker-option-copy small{overflow:hidden;color:var(--n-500);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.rmw-formula-picker-price{color:var(--n-600);font:600 10.5px var(--mono);white-space:nowrap}.rmw-formula-picker-add{width:22px;height:22px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--atlas) 12%,transparent);color:var(--atlas)}.rmw-formula-picker-empty{padding:22px 14px;color:var(--n-500);font-size:11.5px;text-align:center}@media(max-width:700px){.rmw-formula-picker.is-floating{inset:auto 8px 8px!important;width:auto!important;max-height:72dvh}}@media(max-width:900px){.rmw-perf-kpis{grid-template-columns:1fr}.rmw-perf-quads{grid-template-columns:1fr 1fr}.rmw-perf-plot{height:300px}}@media(max-width:800px){.rmw-route{grid-template-columns:1fr}.rmw-recipe-card{grid-template-columns:1fr}.rmw-recipe-result{text-align:left}.rmw-perf-quads{grid-template-columns:1fr}/* #0150 · téléphone : la table 7 colonnes défilait la page entière au lieu de défiler dans son cadre ; l'axe Y pivoté du matrix sortait à gauche ; la grille des heures gardait un minimum trop large. */.mi-list-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}@media(max-width:700px){.rmw-perf-y{position:static;transform:none;width:auto;text-align:left;margin-bottom:10px}.rmw-perf-matrix{padding:18px}.rmw-hours-row{grid-template-columns:minmax(96px,140px) minmax(110px,1fr) 46px;gap:10px}}`;document.head.appendChild(s);}
  function nutritionStyle(){if($('#rmw-nutrition-css'))return;const s=document.createElement('style');s.id='rmw-nutrition-css';s.textContent=`
.rmw-nutrition-pill{margin-inline-start:6px;font-size:11px;white-space:nowrap}.mi-card-foot .rmw-nutrition-pill{display:inline-flex;vertical-align:middle}.rmw-recipe-result .rmw-nutrition-pill{margin-inline-start:6px}
.rmw-nutrition-state{display:grid;gap:10px;padding:14px 15px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface)}.rmw-nutrition-state.complete{border-color:color-mix(in srgb,var(--atlas) 30%,var(--n-200));background:color-mix(in srgb,var(--atlas) 6%,var(--surface))}.rmw-nutrition-state.incomplete{grid-template-columns:minmax(0,1fr) auto;align-items:center}.rmw-nutrition-state.incomplete>b{font-size:12px}.rmw-nutrition-values{display:flex;flex-wrap:wrap;gap:7px}.rmw-nutrition-values bdi{padding:6px 8px;border:1px solid var(--n-200);border-radius:8px;background:var(--paper-soft);font:650 11px var(--mono)}.rmw-nutrition-allergens{display:flex;flex-wrap:wrap;gap:7px;font-size:11.5px}.rmw-nutrition-allergens span,.rmw-nutrition-state small{color:var(--n-500)}
.rmw-nutrition-hide{display:flex;align-items:flex-start;gap:10px;padding:13px 15px;border:1px solid var(--n-200);border-radius:14px;background:var(--paper-soft);cursor:pointer}.rmw-nutrition-hide input{width:18px;height:18px;margin-top:1px;accent-color:var(--atlas)}.rmw-nutrition-hide span{display:grid;gap:3px}.rmw-nutrition-hide b{font-size:12.5px}.rmw-nutrition-hide small{color:var(--n-500);font-size:11px;line-height:1.4}
@media(max-width:620px){.rmw-nutrition-state.incomplete{grid-template-columns:1fr}.rmw-nutrition-state.incomplete .btn-slim{width:100%;justify-content:center}.mi-card-foot .rmw-nutrition-pill{display:none}}
.rmw-nutri-filters{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0 12px}.rmw-nutri-filters .mi-pill{display:inline-flex;align-items:center;gap:6px}.rmw-nutri-notice{margin-top:12px;padding:11px 13px;border:1px dashed var(--n-300);border-radius:12px;color:var(--n-500);font-size:12px;line-height:1.45}.rmw-recipe-card.rmw-nutri-row{grid-template-columns:minmax(170px,1fr) minmax(240px,1.4fr) auto}.rmw-nutri-values{display:grid;gap:6px;font-size:12px}.rmw-nutri-values .rmw-nutrition-values{gap:9px;font:600 12px var(--mono);color:var(--ink)}.rmw-nutri-allergens{display:flex;flex-wrap:wrap;gap:5px;font-size:11px}.rmw-nutri-allergens>span{padding:2px 7px;border:1px solid var(--n-200);border-radius:999px;color:var(--n-600)}.rmw-nutri-muted{color:var(--n-500);font-size:11.5px;line-height:1.45}.rmw-nutri-acts{display:flex;align-items:center;gap:8px;justify-self:end}.rmw-nutri-row.hidden{opacity:.72}@media(max-width:800px){.rmw-recipe-card.rmw-nutri-row{grid-template-columns:1fr}.rmw-nutri-acts{justify-self:start}}
.rmw-nutrition-state.empty,.rmw-nutrition-state.incomplete{grid-template-columns:minmax(0,1fr) auto;align-items:center}.rmw-nutri-head{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;min-width:0}.rmw-nutri-head .rmw-nutri-dot{font-weight:600;color:var(--ink)}.rmw-nutri-head-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.rmw-nutrition-state.complete .rmw-nutri-head{justify-content:space-between}.rmw-nutri-toggle{display:inline-flex;align-items:center;gap:7px;color:var(--n-500);font-size:11.5px;cursor:pointer;white-space:nowrap}.rmw-nutri-toggle input{width:15px;height:15px;margin:0;accent-color:var(--atlas)}
`;document.head.appendChild(s)}
  function shellStyle(){if($('#rmw-shell-css'))return;const s=document.createElement('style');s.id='rmw-shell-css';s.textContent=`
html body:not(#kno) .rmw-shell{overflow:visible!important}
html body:not(#kno) .rmw-layout{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;min-width:0}
html body:not(#kno) .rmw-main{display:flex;flex-direction:column;gap:10px;min-width:0}
html body:not(#kno) .rmw-msvg{width:20px;height:20px;fill:currentColor;flex:0 0 auto}
html body:not(#kno) .rmw-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
html body:not(#kno) .rmw-bar{position:sticky;top:var(--rmw-top,0px);z-index:8;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;margin:-6px 0 0;padding:6px 0 8px;background:linear-gradient(var(--surface),var(--surface)),var(--paper)}
html body:not(#kno) .rmw-bar .rmw-menu-search{width:100%;min-height:48px;padding:4px 10px 4px 6px;border-radius:14px;box-shadow:none}
html body:not(#kno) .rmw-bar .rmw-menu-search-icon{width:36px;height:36px}
html body:not(#kno) .rmw-add{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:48px!important;padding:0 18px 0 14px;border:0;border-radius:14px;background:var(--atlas);color:var(--paper);font:600 14px/1 var(--sans);white-space:nowrap}
html body:not(#kno) .rmw-add:hover{background:var(--riad)}
html body:not(#kno) .rmw-add-short{display:none}
html body:not(#kno) .rmw-list-head{display:flex;align-items:baseline;gap:8px;min-width:0;margin-top:4px}
html body:not(#kno) .rmw-list-head h3{margin:0;font:650 17px/1.25 var(--sans);letter-spacing:-.01em;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html body:not(#kno) .rmw-list-head small{font:500 12.5px/1.3 var(--sans);color:var(--n-500);white-space:nowrap}
html body:not(#kno) .rmw-rail{display:grid;grid-template-columns:minmax(0,1fr) 44px;align-items:center;gap:8px;min-width:0}
html body:not(#kno) .rmw-rail-head{display:contents}
html body:not(#kno) .rmw-rail-head>span,html body:not(#kno) .rmw-rail-add{display:none}
html body:not(#kno) .rmw-rail-acts{grid-column:2;grid-row:1;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--n-200);border-radius:12px;background:var(--surface);color:var(--ink)}
html body:not(#kno) .rmw-cats{grid-column:1;grid-row:1;display:flex;gap:6px;min-width:0;overflow-x:auto;scrollbar-width:none;padding:2px;margin:0;border:0;background:transparent}
html body:not(#kno) .rmw-cats::-webkit-scrollbar{display:none}
html body:not(#kno) .rmw-cats .mi-pill{flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 14px;border-radius:999px;white-space:nowrap}
html body:not(#kno) .rmw-cats .mi-pill small{font:600 11.5px/1 var(--sans);font-variant-numeric:tabular-nums;color:var(--n-500)}
html body:not(#kno) .rmw-cats.catalog-rail .mi-pill.on{color:var(--atlas)!important;font-weight:650}
html body:not(#kno) .rmw-cats .mi-pill.on small{color:var(--atlas)}
html body:not(#kno) .rmw-rows{display:flex;flex-direction:column;border:1px solid var(--n-200);border-radius:14px;background:var(--surface);overflow:hidden}
html body:not(#kno) .rmw-row{display:grid;grid-template-columns:minmax(0,1fr) auto 52px 52px 44px;align-items:center;gap:4px;min-height:64px;padding:0 6px 0 0;border-top:1px solid var(--n-200)}
html body:not(#kno) .rmw-row:first-child{border-top:0}
html body:not(#kno) .rmw-row-main{display:flex;align-items:center;gap:12px;min-width:0;min-height:64px!important;padding:10px 8px 10px 14px;border:0;background:transparent;color:var(--ink);text-align:start;font:inherit}
html body:not(#kno) .rmw-row-main:hover{background:var(--paper-soft)}
html body:not(#kno) .rmw-row-thumb{width:44px;height:44px;flex:0 0 auto;border-radius:10px;object-fit:cover;background:var(--paper-soft)}
html body:not(#kno) .rmw-row-text{display:flex;flex-direction:column;gap:3px;min-width:0}
html body:not(#kno) .rmw-row-name{font:600 14.5px/1.3 var(--sans);color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html body:not(#kno) .rmw-row .catalog-item-meta{max-width:100%}
html body:not(#kno) .rmw-row-state{font-weight:650;color:var(--warning)}
html body:not(#kno) .rmw-row-price{padding:0 8px;font:650 14.5px/1.2 var(--sans);font-variant-numeric:tabular-nums;color:var(--atlas);white-space:nowrap;unicode-bidi:isolate;text-align:end}
html[data-theme="dark"] body:not(#kno) .rmw-row-price{color:var(--ink)}
html body:not(#kno) .rmw-row-mods{display:inline-flex;align-items:center;justify-content:center;gap:3px;height:28px;border-radius:999px;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);font:650 12px/1 var(--sans);font-variant-numeric:tabular-nums}
html body:not(#kno) .rmw-row-mods .rmw-msvg{width:15px;height:15px}
html body:not(#kno) .rmw-row-mods.none{background:transparent;color:var(--n-400,var(--n-500))}
html body:not(#kno) .rmw-avail{position:relative;display:grid;place-items:center;width:52px;height:44px;padding:0;border:0;background:transparent}
html body:not(#kno) .rmw-avail>span{position:relative;width:40px;height:24px;border-radius:999px;background:var(--n-300);transition:background .18s ease}
html body:not(#kno) .rmw-avail>span::after{content:'';position:absolute;top:3px;inset-inline-start:3px;width:18px;height:18px;border-radius:50%;background:#F7F5F0;box-shadow:0 1px 3px rgba(10,15,13,.3);transition:transform .22s cubic-bezier(0.34,1.45,0.5,1)}
html body:not(#kno) .rmw-avail[aria-checked="true"]>span{background:var(--atlas)}
html body:not(#kno) .rmw-avail[aria-checked="true"]>span::after{transform:translateX(16px)}
html[dir="rtl"] body:not(#kno) .rmw-avail[aria-checked="true"]>span::after{transform:translateX(-16px)}
html body:not(#kno) .rmw-avail:disabled{opacity:.4;cursor:not-allowed}
html body:not(#kno) .rmw-row-more{width:44px;height:44px;padding:0;border:0;background:transparent;opacity:.65}
html body:not(#kno) .rmw-row.rmw-off :is(.rmw-row-name,.rmw-row-price,.rmw-row-thumb),html body:not(#kno) .rmw-row.rmw-archived :is(.rmw-row-name,.rmw-row-price,.rmw-row-thumb,.rmw-row-mods){opacity:.5}
html body:not(#kno) .rmw-shell .rmw-sec+.rmw-sec{margin-block-start:14px}
html body:not(#kno) .rmw-empty-note{display:flex;flex-direction:column;align-items:center;gap:12px;padding:36px 20px;border:1px dashed var(--n-300);border-radius:14px;color:var(--n-500);text-align:center;font-size:13.5px}
html body:not(#kno) .rmw-empty-note b{font-weight:600;color:var(--ink)}
@media(max-width:620px){
html body:not(#kno) .rmw-row{grid-template-columns:minmax(0,1fr) auto 52px 44px;grid-template-areas:"main price avail more" "main mods avail more";row-gap:0;padding:0}
html body:not(#kno) .rmw-row-main{grid-area:main;padding-inline-start:12px}
html body:not(#kno) .rmw-row-price{grid-area:price;align-self:end;padding:0 4px}
html body:not(#kno) .rmw-row-mods{grid-area:mods;align-self:start;justify-self:end;height:22px;padding:0 7px;margin:3px 4px 0}
html body:not(#kno) .rmw-avail{grid-area:avail}
html body:not(#kno) .rmw-row-more{grid-area:more}
html body:not(#kno) .rmw-add{padding:0 14px 0 10px}
html body:not(#kno) .rmw-add-long{display:none}
html body:not(#kno) .rmw-add-short{display:inline}
html body:not(#kno) .rmw-bar .rmw-menu-search-count{display:none}
}
@media(min-width:900px){
html body:not(#kno) .rmw-layout{grid-template-columns:clamp(180px,22%,240px) minmax(0,1fr);gap:20px;align-items:start}
html body:not(#kno) .rmw-rail{position:sticky;top:calc(var(--rmw-top,0px) + 8px);display:flex;flex-direction:column;align-items:stretch;gap:6px}
html body:not(#kno) .rmw-rail-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-inline-start:6px}
html body:not(#kno) .rmw-rail-head>span{display:block;font:650 12px/1.3 var(--sans);letter-spacing:.02em;color:var(--n-500)}
html body:not(#kno) .rmw-rail-acts{border:0;background:transparent}
html body:not(#kno) .rmw-cats{flex-direction:column;overflow:visible;gap:2px;padding:0}
html body:not(#kno) .rmw-cats .mi-pill{justify-content:space-between;width:100%;border-radius:12px;text-align:start}
html body:not(#kno) .rmw-cat-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
html body:not(#kno) .rmw-rail-add{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1px dashed var(--n-300);border-radius:12px;background:transparent;color:var(--n-600,var(--ink));font:600 13px/1 var(--sans)}
html body:not(#kno) .rmw-rail-add:hover{border-color:var(--atlas);color:var(--atlas)}
html body:not(#kno) [data-menu-root] .mi-filters>.mi-pill-row.catalog-rail{flex-wrap:wrap!important;overflow:visible!important}
}
`;document.head.appendChild(s)}
  function searchStyle(){if($('#rmw-menu-search-css'))return;const s=document.createElement('style');s.id='rmw-menu-search-css';s.textContent=`
.rmw-search-toolbar{padding:0!important;background:transparent!important;border:0!important}
.rmw-menu-search{width:min(100%,760px);min-height:54px;display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:11px;padding:7px 10px;border:1px solid var(--n-200);border-radius:16px;background:color-mix(in srgb,var(--surface) 92%,var(--paper-soft));box-shadow:0 1px 0 rgba(255,255,255,.04),0 12px 32px -30px rgba(0,0,0,.75);cursor:text;transition:border-color .16s ease,background .16s ease,box-shadow .16s ease,transform .16s ease}
.rmw-menu-search:hover{border-color:color-mix(in srgb,var(--atlas) 30%,var(--n-200));background:var(--surface)}
.rmw-menu-search:focus-within{border-color:color-mix(in srgb,var(--atlas) 72%,var(--n-200));background:var(--surface);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 13%,transparent),0 18px 42px -32px rgba(0,0,0,.75)}
.rmw-menu-search-icon{width:38px;height:38px;display:grid;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);transition:background .16s ease,transform .16s ease}
.rmw-menu-search:focus-within .rmw-menu-search-icon{background:color-mix(in srgb,var(--atlas) 16%,transparent);transform:scale(1.03)}
.rmw-menu-search-icon svg{width:19px;height:19px;fill:currentColor}
.rmw-menu-search input{min-width:0;width:100%;height:38px;padding:0;border:0!important;outline:0!important;background:transparent!important;color:var(--ink);font:550 14px var(--sans);letter-spacing:-.005em;box-shadow:none!important;-webkit-appearance:none;appearance:none}
.rmw-menu-search input::placeholder{color:var(--n-500);opacity:.8}
.rmw-menu-search input::-webkit-search-cancel-button{width:18px;height:18px;margin-inline:8px 2px;cursor:pointer;opacity:.62}
.rmw-menu-search-count{min-width:66px;display:grid;grid-template-columns:auto auto;align-items:baseline;justify-content:end;gap:4px;padding:7px 9px;border-radius:10px;background:var(--paper-soft);color:var(--n-500);white-space:nowrap;transition:background .16s ease,color .16s ease}
.rmw-menu-search-count strong{color:var(--ink);font:700 11px var(--mono)}
.rmw-menu-search-count small{font:600 9px var(--mono);letter-spacing:.02em}
.rmw-menu-search.has-query .rmw-menu-search-count{background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas)}
.rmw-menu-search.has-query .rmw-menu-search-count strong{color:var(--atlas)}
@media(max-width:620px){.rmw-menu-search{width:100%;grid-template-columns:36px minmax(0,1fr);min-height:50px;padding:6px 9px;border-radius:14px}.rmw-menu-search-icon{width:36px;height:36px}.rmw-menu-search-count{display:none}}
`;document.head.appendChild(s)}
  function recipeStyle(){if($('#rmw-recipe-css'))return;const s=document.createElement('style');s.id='rmw-recipe-css';s.textContent=`
.kiwi-backdrop.rmw-recipe-modal{background:color-mix(in srgb,#0A0F0D 46%,transparent)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.kiwi-backdrop.rmw-recipe-modal .kiwi-modal.kiwi-modal{--rx-bg:var(--paper);--rx-card:color-mix(in srgb,var(--paper) 55%,#fff);--rx-field:var(--paper);background:var(--rx-bg)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:1px solid var(--n-200);box-shadow:0 30px 80px -30px rgba(0,0,0,.5)}
html[data-theme="dark"] .kiwi-backdrop.rmw-recipe-modal .kiwi-modal.kiwi-modal{--rx-bg:#0F1512;--rx-card:#151C18;--rx-field:#0B100E}
.kiwi-backdrop.rmw-recipe-modal .kiwi-modal-foot.kiwi-modal-foot{background:var(--rx-bg)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-top:1px solid var(--n-200)}
.rmw-rx{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start;color:var(--ink)}
.rmw-rx-draft{grid-column:1/-1;display:grid;gap:3px;padding:11px 14px;border-radius:12px;background:color-mix(in srgb,#d49a25 14%,var(--rx-card));font-size:12.5px}
.rmw-rx-draft span{color:var(--n-600)}
.rmw-rx-main{display:grid;gap:18px;min-width:0}
.rmw-rx-sec{min-width:0;padding:18px;border:1px solid var(--n-200);border-radius:14px;background:var(--rx-card)}
.rmw-rx-sec-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
.rmw-rx-sec-head h4{margin:0;font:650 15px var(--sans);color:var(--ink)}
.rmw-rx-sec-head p{max-width:46ch;margin:4px 0 0;font-size:12px;line-height:1.45;color:var(--n-500)}
.rmw-rx-meta{display:flex;gap:10px;flex:0 0 auto}
.rmw-rx-meta label,.rmw-rx-notes label{display:grid;gap:5px;font-size:11.5px;font-weight:600;color:var(--n-600)}
.rmw-rx-meta .rmw-rx-in{width:84px}
.rmw-rx-in{box-sizing:border-box;width:100%;height:38px;padding:0 11px;border:1px solid var(--n-200);border-radius:10px;background:var(--rx-field);color:var(--ink);font:500 13.5px var(--sans);font-variant-numeric:tabular-nums;transition:border-color 140ms,box-shadow 140ms}
.rmw-rx-in:focus{outline:0;border-color:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 16%,transparent)}
textarea.rmw-rx-in{height:auto;min-height:92px;padding:10px 11px;line-height:1.5;resize:vertical}
.rmw-rx-suffix{position:relative;display:block}
.rmw-rx-suffix .rmw-rx-in{padding-inline-end:34px}
.rmw-rx-suffix i{position:absolute;inset-inline-end:10px;top:50%;transform:translateY(-50%);font:500 11.5px var(--sans);font-style:normal;color:var(--n-500);pointer-events:none}
.rmw-rx-cols,.rmw-rx-row{display:grid;grid-template-columns:minmax(0,1fr) 168px 92px 32px;gap:10px;align-items:start}
.rmw-rx-cols{padding:0 2px 6px;border-bottom:1px solid var(--n-200);font-size:11px;font-weight:600;color:var(--n-500)}
.rmw-rx-cols span:nth-child(3){text-align:end}
.rmw-rx-row{padding:9px 0;border-bottom:1px solid var(--n-200)}
.rmw-rx-name{display:grid;gap:4px;min-width:0}
.rmw-rx-name small{min-height:15px;font-size:11px;line-height:15px;color:var(--n-500)}
.rmw-rx-row[data-state="unlinked"] .rmw-rx-name small,.rmw-rx-row[data-state="noprice"] .rmw-rx-name small,.rmw-rx-row[data-state="unit"] .rmw-rx-name small,.rmw-rx-row[data-state="noqty"] .rmw-rx-name small{color:#a8730f}
.rmw-rx-row[data-state="unit"] .rmw-rx-unit,.rmw-rx-row[data-state="noqty"] .rmw-rx-qty .rmw-rx-in{border-color:color-mix(in srgb,#d49a25 60%,var(--n-200))}
.rmw-rx-qty{display:grid;grid-template-columns:minmax(0,1fr) 78px;gap:6px}
.rmw-rx-unit{box-sizing:border-box;width:100%;height:38px;padding:0 24px 0 9px;border:1px solid var(--n-200);border-radius:10px;background-color:var(--rx-field);color:var(--ink);font:500 13px var(--sans);appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--n-500) 50%),linear-gradient(135deg,var(--n-500) 50%,transparent 50%);background-position:calc(100% - 13px) 17px,calc(100% - 9px) 17px;background-size:4px 4px;background-repeat:no-repeat;cursor:pointer}
[dir="rtl"] .rmw-rx-unit{padding:0 9px 0 24px;background-position:13px 17px,9px 17px}
/* Vexel repaints every select with a background shorthand, which erases the chevron: restate it inside the sheet. */
.kiwi-backdrop.rmw-recipe-modal select.rmw-rx-unit{background-image:linear-gradient(45deg,transparent 50%,var(--n-500) 50%),linear-gradient(135deg,var(--n-500) 50%,transparent 50%)!important;background-position:calc(100% - 15px) 50%,calc(100% - 11px) 50%!important;background-size:4px 4px!important;background-repeat:no-repeat!important;padding-inline-end:28px!important}
[dir="rtl"] .kiwi-backdrop.rmw-recipe-modal select.rmw-rx-unit{background-position:15px 50%,11px 50%!important}
.rmw-rx-unit:focus{outline:0;border-color:var(--atlas);box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 16%,transparent)}
.rmw-rx-cost{height:38px;display:flex;align-items:center;justify-content:flex-end;font:600 13px var(--sans);font-variant-numeric:tabular-nums;color:var(--ink)}
.rmw-rx-del{width:32px;height:38px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:transparent;color:var(--n-500);cursor:pointer}
.rmw-rx-del svg,.rmw-rx-add svg{width:18px;height:18px}
.rmw-rx-del:hover,.rmw-rx-del:focus-visible{outline:0;background:color-mix(in srgb,var(--danger,#b94b38) 10%,transparent);color:var(--danger,#b94b38)}
.rmw-rx-add{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:8px 12px 8px 9px;border:1px dashed var(--n-300);border-radius:10px;background:transparent;color:var(--atlas);font:600 13px var(--sans);cursor:pointer}
.rmw-rx-add:hover{border-style:solid;background:color-mix(in srgb,var(--atlas) 6%,transparent)}
.rmw-rx-hint{margin:12px 0 0;font-size:12px;color:var(--n-500)}
.rmw-rx-notes{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rmw-rx-side{position:sticky;top:0;display:grid;gap:14px;padding:18px;border:1px solid var(--n-200);border-radius:14px;background:var(--rx-card)}
.rmw-rx-status{display:grid;gap:4px;padding:10px 12px;border-radius:10px;background:var(--rx-bg);font-size:12px;line-height:1.45;color:var(--n-600)}
.rmw-rx-status b{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--ink)}
.rmw-rx-status b:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--n-400,var(--n-500))}
.rmw-rx-status.ok b:before{background:var(--atlas)}.rmw-rx-status.watch b:before,.rmw-rx-status.todo b:before{background:#d49a25}.rmw-rx-status.gap b:before{background:#cb5238}
.rmw-rx-link{justify-self:start;padding:0;border:0;background:none;color:var(--atlas);font:600 12px var(--sans);text-decoration:underline;cursor:pointer}
.rmw-rx-hero{display:grid;gap:2px}
.rmw-rx-hero span{font-size:12px;font-weight:600;color:var(--n-500)}
.rmw-rx-hero b{font:650 30px/1.1 var(--sans);letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.rmw-rx-facts{display:grid;gap:0;margin:0}
.rmw-rx-facts>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--n-200)}
.rmw-rx-facts dt{font-size:12.5px;color:var(--n-600)}.rmw-rx-facts dt em{font-style:normal;font-size:11px;color:var(--n-500)}
.rmw-rx-facts dd{margin:0;font:600 13.5px var(--sans);font-variant-numeric:tabular-nums;text-align:end;color:var(--ink)}
.rmw-rx-facts dd small{display:block;max-width:150px;font:400 11px/1.35 var(--sans);color:var(--n-500)}
.rmw-rx-facts dd.neg{color:#cb5238}
.rmw-rx-hero.partial b{font-size:22px;color:var(--n-600)}.rmw-rx-hero small{font-size:11px;line-height:1.4;color:var(--n-500)}
.rmw-rx-side .rmw-nutrition-state{display:grid!important;grid-template-columns:1fr!important;gap:8px!important;padding:12px 0 0!important;border:0!important;border-top:1px solid var(--n-200)!important;border-radius:0!important;background:none!important}
.rmw-rx-side .rmw-nutri-head,.rmw-rx-side .rmw-nutri-head-acts{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:6px!important;width:100%}
.rmw-rx-side .rmw-nutri-head-acts .btn-slim{width:100%;justify-content:center}
.rmw-rx-side .rmw-nutri-muted{font-size:11.5px;line-height:1.4}
@media(max-width:900px){.rmw-rx{grid-template-columns:1fr}.rmw-rx-side{position:static;order:-1}.rmw-rx-draft{order:-2}}
@media(max-width:620px){.rmw-rx-sec{padding:14px}.rmw-rx-sec-head{flex-direction:column}.rmw-rx-cols{display:none}.rmw-rx-row{grid-template-columns:minmax(0,1fr) 32px;gap:8px}.rmw-rx-name{grid-column:1}.rmw-rx-del{grid-column:2;grid-row:1}.rmw-rx-qty{grid-column:1}.rmw-rx-cost{grid-column:2;grid-row:2;justify-content:flex-end;font-size:12px;height:38px}.rmw-rx-notes{grid-template-columns:1fr}}
`;document.head.appendChild(s);}
  function itemStyle(){if($('#rmw-item-css'))return;const s=document.createElement('style');s.id='rmw-item-css';s.textContent=`
.rmw-item-workspace .kiwi-modal-head{transition:box-shadow 160ms}
.rmw-item-workspace .kiwi-modal.rmw-scrolled .kiwi-modal-head{box-shadow:0 1px 0 var(--n-200)}
.rmw-item-workspace .rmw-it-archive{margin-inline-end:auto}
.rmw-it{display:grid;grid-template-columns:minmax(0,1fr) 284px;gap:20px;align-items:start;color:var(--ink)}
.rmw-it :is(input,select,textarea).rmw-rx-in,.rmw-it select.rmw-rx-unit{background-color:var(--rx-field)!important;border:1px solid var(--n-200)!important;border-radius:10px!important;box-shadow:none}
.rmw-it :is(input,select,textarea).rmw-rx-in:focus,.rmw-it select.rmw-rx-unit:focus{border-color:var(--atlas)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 16%,transparent)}
.rmw-it-grid{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:14px 12px;align-items:start}
.rmw-it-f{display:grid;gap:6px;align-content:start;min-width:0;font-size:12px;font-weight:600;color:var(--n-600)}
.rmw-it-full{grid-column:1/-1}
.rmw-it-f .rmw-rx-unit{height:40px}
.rmw-it-f .rmw-rx-in{height:40px;font-size:14px}
.rmw-it-f textarea.rmw-rx-in{height:auto;min-height:84px}
.rmw-it-f [data-name]{font-weight:600}
.rmw-it .rmw-it-f input.rmw-rx-in[aria-invalid="true"]{border-color:#cb5238!important;box-shadow:0 0 0 3px color-mix(in srgb,#cb5238 14%,transparent)!important}
.rmw-it-err{font:500 11.5px var(--sans);font-style:normal;color:#cb5238}
.rmw-it-chips{display:flex;flex-wrap:wrap;gap:8px}
.rmw-it-chip{position:relative;display:inline-flex;align-items:center;gap:9px;min-height:40px;padding:6px 14px 6px 8px;border:1px solid var(--n-200);border-radius:12px;background:var(--rx-field);cursor:pointer;transition:border-color 140ms,background-color 140ms}
.rmw-it-chip:hover{border-color:var(--n-300)}
.rmw-it-chip input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.rmw-it-chip-box{width:20px;height:20px;flex:0 0 auto;display:grid;place-items:center;border:1.5px solid var(--n-300);border-radius:6px;color:transparent;transition:background-color 140ms,border-color 140ms,color 140ms}
.rmw-it-chip-box svg{width:15px;height:15px;fill:currentColor}
.rmw-it-chip-txt{display:grid;gap:1px;line-height:1.2}
.rmw-it-chip-txt b{font:600 13px var(--sans);color:var(--ink)}
.rmw-it-chip-txt small{font-size:11px;color:var(--n-500)}
.rmw-it-chip:has(input:checked){border-color:color-mix(in srgb,var(--atlas) 45%,var(--n-200));background:color-mix(in srgb,var(--atlas) 7%,var(--rx-field))}
.rmw-it-chip input:checked+.rmw-it-chip-box{background:var(--atlas);border-color:var(--atlas);color:var(--paper)}
.rmw-it-chip:has(input:focus-visible){box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 20%,transparent)}
.rmw-it-tg{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;cursor:pointer}
.rmw-it-tg input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.rmw-it-tg-txt{display:grid;gap:3px;min-width:0}
.rmw-it-tg-txt b{font:600 13px var(--sans);color:var(--ink)}
.rmw-it-tg-txt small{font-size:11.5px;line-height:1.4;color:var(--n-500)}
.rmw-it-sw{position:relative;width:38px;height:22px;flex:0 0 auto;margin-top:1px;border-radius:999px;background:var(--n-300);transition:background-color 180ms}
.rmw-it-sw:after{content:'';position:absolute;top:3px;inset-inline-start:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform 310ms cubic-bezier(0.34,1.45,0.5,1)}
.rmw-it-tg input:checked+.rmw-it-sw{background:var(--atlas)}
.rmw-it-tg input:checked+.rmw-it-sw:after{transform:translateX(16px)}
[dir="rtl"] .rmw-it-tg input:checked+.rmw-it-sw:after{transform:translateX(-16px)}
.rmw-it-tg input:focus-visible+.rmw-it-sw{box-shadow:0 0 0 3px color-mix(in srgb,var(--atlas) 22%,transparent)}
.rmw-it-tg.bare{flex:0 0 auto;margin-top:2px}
.rmw-it-side{gap:12px}
.rmw-it-media{position:relative;aspect-ratio:4/3;overflow:hidden;display:grid;place-items:center;border-radius:12px;background:var(--rx-bg);border:1px solid var(--n-200)}
.rmw-it-media img,.rmw-it-media video{width:100%;height:100%;object-fit:cover;display:block}
.rmw-it-ph{display:grid;justify-items:center;gap:6px;color:var(--n-500)}
.rmw-it-ph svg{width:30px;height:30px;fill:currentColor;opacity:.7}
.rmw-it-ph small{font-size:11.5px}
.rmw-it-macts{display:flex;flex-wrap:wrap;gap:6px}
.rmw-it-mbtn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 11px;border:1px solid var(--n-200);border-radius:9px;background:var(--rx-field);color:var(--ink);font:600 12px var(--sans);cursor:pointer}
.rmw-it-mbtn svg{width:16px;height:16px;fill:currentColor;color:var(--atlas)}
.rmw-it-mbtn:hover{border-color:var(--n-300)}
.rmw-it-mbtn.ghost{border-color:transparent;background:transparent;color:var(--n-600)}
.rmw-it-mbtn.ghost:hover{color:#cb5238}
.rmw-it-mbtn[hidden]{display:none}
.rmw-it-mstatus{margin:-4px 0 0;min-height:0;font-size:11.5px;color:var(--n-500)}
.rmw-it-mstatus:empty{display:none}
.rmw-it-tgs{display:grid;gap:0;border-top:1px solid var(--n-200)}
.rmw-it-tgs .rmw-it-tg{padding:13px 0;border-bottom:1px solid var(--n-200)}
.rmw-it-tgs .rmw-it-tg:last-child{border-bottom:0;padding-bottom:0}
.rmw-it-builder{display:grid;gap:12px}
.rmw-it-builder[hidden]{display:none}
.rmw-it-tpl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
.rmw-it-tpl .rmw-rx-unit{height:38px}
.rmw-it-sbtn{height:38px;padding:0 14px;border:1px solid var(--n-200);border-radius:10px;background:var(--rx-field);color:var(--ink);font:600 12.5px var(--sans);cursor:pointer;white-space:nowrap}
.rmw-it-sbtn:hover{border-color:var(--atlas);color:var(--atlas)}
.rmw-it-steps{display:grid;gap:10px}
.rmw-it-formula-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rmw-it-formula-foot .rmw-rx-add{margin-top:0}
.rmw-it-formula-foot .rmw-rx-add svg{fill:currentColor}
.rmw-st{border:1px solid var(--n-200);border-radius:12px;background:var(--rx-bg);overflow:hidden}
.rmw-st.is-open{border-color:color-mix(in srgb,var(--atlas) 30%,var(--n-200))}
.rmw-st-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:12px 12px 12px 14px}
.rmw-st-kicker{font:600 11px var(--sans);letter-spacing:.02em;color:var(--atlas)}
.rmw-st-acts{grid-row:1/3;grid-column:2;display:flex;align-items:center;gap:4px;align-self:start}
.rmw-st-sum{margin-inline-end:6px;font-size:11.5px;color:var(--n-500);white-space:nowrap}
.rmw-st-btn{width:32px;height:32px;display:grid;place-items:center;padding:0;border:0;border-radius:9px;background:transparent;color:var(--n-500);cursor:pointer}
.rmw-st-btn svg{width:18px;height:18px;fill:currentColor;transition:transform 200ms}
.rmw-st-btn:hover{background:color-mix(in srgb,var(--ink) 6%,transparent);color:var(--ink)}
.rmw-st-btn.danger:hover{background:color-mix(in srgb,#cb5238 10%,transparent);color:#cb5238}
.rmw-st-btn[aria-expanded="true"] svg{transform:rotate(180deg)}
.rmw-it input.rmw-st-title{grid-column:1;width:100%;height:30px;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color:var(--ink);font:650 16px var(--sans)}
.rmw-it input.rmw-st-title:focus{outline:0;box-shadow:0 1px 0 var(--atlas)!important}
.rmw-st-rule{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--n-600)}
.rmw-it input.rmw-st-num{width:44px;height:30px;padding:0!important;border:1px solid var(--n-200)!important;border-radius:8px!important;background:var(--rx-field)!important;color:var(--ink);font:600 13px var(--sans);font-variant-numeric:tabular-nums;text-align:center;-moz-appearance:textfield}
.rmw-it input.rmw-st-num:focus{outline:0;border-color:var(--atlas)!important}
.rmw-it input.rmw-st-num::-webkit-inner-spin-button,.rmw-it .rmw-st-plus input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.rmw-st-body{border-top:1px solid var(--n-200);background:var(--rx-card)}
.rmw-st-body[hidden]{display:none}
.rmw-st-list{display:grid}
.rmw-st-choice{display:grid;grid-template-columns:24px minmax(0,1fr) auto 32px;gap:12px;align-items:center;padding:9px 12px 9px 14px;border-bottom:1px solid var(--n-200)}
.rmw-st-n{width:24px;height:24px;display:grid;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--atlas) 10%,transparent);color:var(--atlas);font:600 11px var(--sans);font-variant-numeric:tabular-nums}
.rmw-st-name{display:grid;gap:1px;min-width:0}
.rmw-st-name b{overflow:hidden;font:600 13px var(--sans);text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.rmw-st-name small{font-size:11px;color:var(--n-500);font-variant-numeric:tabular-nums}
.rmw-st-extra{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--n-500)}
.rmw-st-plus{width:104px}
.rmw-it .rmw-st-plus .rmw-rx-in{height:34px;padding-inline:22px 38px!important;text-align:end;font-size:13px}
.rmw-st-plus em{position:absolute;inset-inline-start:10px;top:50%;transform:translateY(-50%);font:500 12px var(--sans);font-style:normal;color:var(--n-500);pointer-events:none}
.rmw-st-choice .rmw-rx-del{height:32px}
.rmw-st-choice .rmw-rx-del svg{fill:currentColor}
.rmw-st-empty{margin:0;padding:12px 14px;font-size:12px;color:var(--n-500)}
.rmw-it-steps>.rmw-st-empty{padding:0}
.rmw-st-note{display:grid;gap:6px;justify-items:start;padding:12px 14px}
.rmw-st-note p{margin:0;font-size:12px;line-height:1.45;color:var(--n-600)}
.rmw-st-add{position:relative;padding:8px 10px}
.rmw-st-pick{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 10px 0 7px;border:0;border-radius:9px;background:transparent;color:var(--atlas);font:600 12.5px var(--sans);cursor:pointer}
.rmw-st-pick svg{width:18px;height:18px;fill:currentColor}
.rmw-st-pick:hover,.rmw-st-pick[aria-expanded="true"]{background:color-mix(in srgb,var(--atlas) 8%,transparent)}
.rmw-it .rmw-formula-picker-add svg{width:16px;height:16px;fill:currentColor}
.rmw-it .rmw-formula-picker.is-floating,.rmw-formula-picker.is-floating{background:var(--paper)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
html[data-theme="dark"] .rmw-formula-picker.is-floating{background:color-mix(in srgb,var(--ink) 7%,var(--paper))!important}
@media(max-width:900px){.rmw-it{grid-template-columns:1fr}
.rmw-it-side{position:static;order:-1;grid-template-columns:132px minmax(0,1fr);align-items:start}
.rmw-it-media{grid-row:1/3}
.rmw-it-tgs{grid-column:1/-1}}
@media(max-width:620px){.rmw-it-grid{grid-template-columns:1fr}
.rmw-it-side{order:1;grid-template-columns:1fr}
.rmw-it-media{grid-row:auto;aspect-ratio:16/9}
.rmw-it-media:has(.rmw-it-ph){aspect-ratio:auto;height:96px}
.rmw-st-choice{grid-template-columns:24px minmax(0,1fr) 32px;row-gap:8px}
.rmw-st-extra{grid-column:2;grid-row:2}
.rmw-st-choice .rmw-rx-del{grid-column:3;grid-row:1}
.rmw-it-tpl{grid-template-columns:1fr}}
`;document.head.appendChild(s);}
  function performanceStyle(){if($('#rmw-performance-css'))return;const s=document.createElement('style');s.id='rmw-performance-css';s.textContent=`
.rmw-perf-insights-sub{margin:-4px 0 12px;color:var(--n-500);font-size:12px}
.rmw-perf-insights ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.rmw-perf-insights li{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:12px 14px;border:1px solid var(--n-200);border-radius:12px;background:var(--surface);font-size:13px;line-height:1.45}
.rmw-perf-insights li p{margin:0;min-width:0}
.rmw-perf-insights li .rmw-perf-link{flex:0 0 auto;white-space:nowrap;font-size:12px}
.rmw-perf-insights-none{margin:0;color:var(--n-500);font-size:12.5px}
.rmw-perf-table td small.rmw-perf-est{color:var(--n-600)}
@media(max-width:620px){.rmw-perf-insights li{flex-direction:column;gap:6px}}
.rmw-performance{gap:16px}
.rmw-perf-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:2px 2px 0}
.rmw-perf-head h2{margin:0;font:650 26px/1.15 var(--sans);letter-spacing:-.025em;color:var(--ink)}
.rmw-perf-head p{margin:6px 0 0;font-size:13px;color:var(--n-500)}
.rmw-sum{display:grid;gap:14px;padding:18px 20px;border:1px solid var(--n-200);border-radius:16px;background:var(--surface)}
.rmw-sum-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.rmw-sum-kpis>div{display:flex;flex-direction:column;gap:5px;min-width:0;padding:0 18px;border-inline-start:1px solid var(--n-200)}
.rmw-sum-kpis>div:first-child{padding-inline-start:0;border:0}
.rmw-sum-kpis span{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500)}
.rmw-sum-kpis b{font:650 24px/1.15 var(--sans);letter-spacing:-.025em;font-variant-numeric:tabular-nums;color:var(--ink)}
.rmw-sum-kpis small{font-size:11.5px;line-height:1.4;color:var(--n-500)}
.rmw-sum-bar{display:block;height:4px;margin:2px 0;border-radius:99px;background:var(--n-200);overflow:hidden}
.rmw-sum-bar>i{display:block;height:100%;border-radius:inherit;background:var(--atlas)}
.rmw-sum-recon{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;padding-top:12px;border-top:1px solid var(--n-200);font-size:12.5px;color:var(--n-600)}
.rmw-sum-i{display:inline-flex;align-items:baseline;gap:5px}
.rmw-sum-recon b{font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums}
.rmw-sum-recon small{color:var(--n-500)}
.rmw-sum-recon>i{font-style:normal;color:var(--n-400,var(--n-500))}
.rmw-sum .rmw-perf-notes{margin:0}
.rmw-mx{padding:20px}
.rmw-mx-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}
.rmw-mx-head h3{margin:0;font:650 17px var(--sans);letter-spacing:-.01em;color:var(--ink)}
.rmw-mx-head p{max-width:64ch;margin:5px 0 0;font-size:12.5px;line-height:1.5;color:var(--n-500)}
.rmw-mx-key{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto;font-size:11.5px;color:var(--n-500)}
.rmw-mx-key>span{display:flex;align-items:center;gap:6px}
.rmw-mx-key i{display:inline-block;border-radius:50%;background:var(--n-300)}
.rmw-mx-body{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,1fr);gap:18px;align-items:stretch}
.rmw-mx-chart{display:flex;flex-direction:column;gap:7px;min-width:0;margin:0}
.rmw-mx-axis{font:600 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--n-500)}
.rmw-mx-axis.x{padding-top:12px;text-align:end}
.rmw-mx-plot{--z-r:13px;position:relative;flex:1;min-height:360px;border:1px solid var(--n-200);border-radius:14px;background:var(--surface)}
.rmw-mx-zones{position:absolute;inset:0;overflow:hidden;border-radius:var(--z-r)}
.rmw-mx-zone{position:absolute;background:color-mix(in srgb,var(--q) 9%,transparent)}
.rmw-mx-zone>em{position:absolute;font:700 9.5px var(--mono);font-style:normal;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb,var(--q) 78%,var(--ink))}
.rmw-mx-zone.puzzle>em{top:12px;left:14px}.rmw-mx-zone.star>em{top:12px;right:14px}.rmw-mx-zone.dog>em{bottom:12px;left:14px}.rmw-mx-zone.plow>em{bottom:12px;right:14px}
.rmw-mx-zone.star,.rmw-mx-q.star,.rmw-mx-dot.star{--q:#1d9c67}.rmw-mx-zone.puzzle,.rmw-mx-q.puzzle,.rmw-mx-dot.puzzle{--q:#357fad}.rmw-mx-zone.plow,.rmw-mx-q.plow,.rmw-mx-dot.plow{--q:#d49a25}.rmw-mx-zone.dog,.rmw-mx-q.dog,.rmw-mx-dot.dog{--q:#cb5238}
.rmw-mx-med,.rmw-mx-zero{position:absolute;z-index:1;border:0 dashed color-mix(in srgb,var(--ink) 24%,transparent)}
.rmw-mx-med.v{top:0;bottom:0;border-left-width:1px}.rmw-mx-med.h,.rmw-mx-zero{left:0;right:0;border-top-width:1px}.rmw-mx-zero{border-top-style:solid}
.rmw-mx-med>span,.rmw-mx-zero>span{position:absolute;padding:2px 8px;border:1px solid var(--n-200);border-radius:99px;background:var(--surface);font:600 10px/1.4 var(--mono);white-space:nowrap;color:var(--n-600)}
.rmw-mx-med.v>span{bottom:-11px;transform:translateX(-50%)}.rmw-mx-med.h>span{top:-11px;left:12px}.rmw-mx-zero>span{top:-11px;left:12px}
.rmw-mx-dot{position:absolute;width:var(--s);height:var(--s);padding:0;transform:translate(-50%,50%);border:2px solid var(--surface);border-radius:50%;background:var(--q);box-shadow:0 1px 4px rgba(0,0,0,.2);cursor:pointer;transition:transform 160ms ease,box-shadow 160ms ease}
.rmw-mx-dot:not([data-action]){cursor:default}
.rmw-mx-dot>b{position:absolute;inset:0;display:grid;place-items:center;font:700 10px var(--mono);color:#fff}
.rmw-mx-dot:hover,.rmw-mx-dot:focus-visible{z-index:60!important;transform:translate(-50%,50%) scale(1.14);outline:0;box-shadow:0 0 0 4px color-mix(in srgb,var(--q) 28%,transparent)}
.rmw-mx-lab{position:absolute;z-index:2;max-width:150px;overflow:hidden;padding:0 6px;border-radius:6px;background:color-mix(in srgb,var(--surface) 84%,transparent);font:600 11px/18px var(--sans);text-overflow:ellipsis;white-space:nowrap;color:var(--ink);pointer-events:none}
.rmw-mx-lab.r{transform:translate(calc(var(--r) + 5px),50%)}.rmw-mx-lab.l{transform:translate(calc(-100% - var(--r) - 5px),50%)}.rmw-mx-lab.t{transform:translate(-50%,calc(-1 * var(--r) - 4px))}.rmw-mx-lab.b{transform:translate(-50%,calc(100% + var(--r) + 4px))}
.rmw-mx-tip{display:none;position:absolute;bottom:calc(100% + 10px);left:50%;width:230px;padding:11px 12px;transform:translateX(-50%);border-radius:12px;background:#101612;color:#F7F5F0;text-align:start;font:12px/1.45 var(--sans);box-shadow:0 14px 36px rgba(0,0,0,.3);pointer-events:none}
.rmw-mx-dot.down>.rmw-mx-tip{top:calc(100% + 10px);bottom:auto}.rmw-mx-dot.end>.rmw-mx-tip{left:auto;right:-8px;transform:none}.rmw-mx-dot.start>.rmw-mx-tip{left:-8px;transform:none}
.rmw-mx-dot:hover>.rmw-mx-tip,.rmw-mx-dot:focus-visible>.rmw-mx-tip{display:grid;gap:8px}
.rmw-mx-tip>em{font:700 9px var(--mono);font-style:normal;letter-spacing:.1em;text-transform:uppercase;color:color-mix(in srgb,var(--q) 70%,#fff)}
.rmw-mx-tip>strong{font-size:12px}
.rmw-mx-tip-row{display:grid;gap:2px}.rmw-mx-tip-row b{font-size:13px}.rmw-mx-tip-row small{color:rgba(247,245,240,.66);font-size:11px;font-variant-numeric:tabular-nums}
.rmw-mx-quads{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:10px;min-width:0}
.rmw-mx-q{display:flex;flex-direction:column;gap:7px;min-width:0;padding:12px 14px;border:1px solid var(--n-200);border-top:3px solid var(--q);border-radius:12px;background:var(--surface)}
.rmw-mx-q header{display:flex;align-items:center;gap:7px}
.rmw-mx-q header i{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:var(--q)}
.rmw-mx-q header b{font:650 13px var(--sans);color:var(--ink)}
.rmw-mx-q header span{min-width:22px;margin-inline-start:auto;padding:1px 7px;border-radius:99px;background:color-mix(in srgb,var(--q) 14%,transparent);font:700 11px/1.5 var(--mono);text-align:center;color:color-mix(in srgb,var(--q) 80%,var(--ink))}
.rmw-mx-q>p{margin:0;font-size:11.5px;line-height:1.4;color:var(--n-500)}
.rmw-mx-q ul{display:grid;gap:6px;margin:2px 0 0;padding:0;list-style:none}
.rmw-mx-q li{display:flex;flex-direction:column;min-width:0}
.rmw-mx-q li button{overflow:hidden;padding:0;border:0;background:none;font:600 12.5px/1.35 var(--sans);text-align:start;text-overflow:ellipsis;white-space:nowrap;color:var(--ink);cursor:pointer}
.rmw-mx-q li button:hover,.rmw-mx-q li button:focus-visible{color:var(--atlas);text-decoration:underline}
.rmw-mx-q li small,.rmw-mx-q .more{font-size:11px;font-variant-numeric:tabular-nums;color:var(--n-500)}
.rmw-mx-q footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 10px;margin-top:auto;padding-top:8px;border-top:1px solid var(--n-200);font-size:11px;color:var(--n-500)}
.rmw-mx-q footer b{font-weight:650;color:var(--n-600)}
.rmw-mx-q .none{margin:auto 0;color:var(--n-500);font-size:12px}
.rmw-mx-few{padding:26px 18px;text-align:center;color:var(--n-500);font-size:13px}
.rmw-mx-few p{max-width:60ch;margin:0 auto;line-height:1.5}
@media(max-width:1100px){.rmw-mx-body{grid-template-columns:1fr}}
@media(max-width:900px){.rmw-sum-kpis{grid-template-columns:1fr 1fr;gap:16px 0}.rmw-sum-kpis>div:nth-child(3){padding-inline-start:0;border:0}}
@media(max-width:700px){.rmw-mx{padding:14px}.rmw-mx-head{flex-direction:column}.rmw-mx-key{align-items:flex-start}.rmw-mx-plot{min-height:270px}.rmw-mx-lab:not(.keep){display:none}.rmw-mx-zone>em{font-size:8.5px}.rmw-perf-head h2{font-size:22px}}
@media(max-width:480px){.rmw-mx-quads{grid-template-columns:1fr;grid-auto-rows:auto}.rmw-sum{padding:16px}.rmw-sum-kpis b{font-size:20px}}
`;document.head.appendChild(s);}
  function hoursStyle(){if($('#rmw-hours-css'))return;const s=document.createElement('style');s.id='rmw-hours-css';s.textContent=`
/* Analyse du menu : hors de .catalog-rail, la pastille active gardait le texte clair du dégradé sur la lentille claire. Même lecture que la rangée du menu. */
.rmw-analysis-panel .mi-pill-row[data-kw-lens] .mi-pill.on{color:var(--ink)!important;background:transparent!important;box-shadow:none!important}
.rmw-hours-page{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}.rmw-hours-page>*{min-width:0}.rmw-hours-pills{margin-top:16px}.rmw-hours-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.rmw-hours-kpis>div{display:grid;gap:7px;padding:17px 18px;background:var(--surface);border:1px solid var(--n-200);border-radius:13px}.rmw-hours-kpis span{font:10px var(--mono);letter-spacing:.07em;text-transform:uppercase;color:var(--n-500)}.rmw-hours-kpis b{font-size:24px;line-height:1.1;letter-spacing:-.03em}.rmw-hours-kpis>div:last-child b{font-size:18px}.rmw-hours-kpis small{color:var(--n-500)}.rmw-hours-list-title{margin:22px 0 12px;color:var(--n-500);font-size:11px}.rmw-hours-bars{display:grid;gap:9px}.rmw-hours-row{display:grid;grid-template-columns:minmax(120px,190px) minmax(180px,1fr) 55px;align-items:center;gap:14px}.rmw-hours-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.rmw-hours-track{height:12px;border-radius:4px;background:var(--n-100);overflow:hidden}.rmw-hours-track i{display:block;height:100%;min-width:3px;border-radius:4px;background:var(--atlas)}.rmw-hours-row>b{text-align:right;font:600 11px var(--mono)}.rmw-hours-insight{padding:22px 24px;border-radius:16px;background:#08100c;color:#fff;box-shadow:0 16px 38px rgba(4,9,6,.10)}.rmw-hours-insight>span{color:#73f0b2;font:600 9px var(--mono);letter-spacing:.12em}.rmw-hours-insight h3{margin:10px 0 7px;font-size:20px}.rmw-hours-insight p{max-width:780px;margin:0;color:rgba(255,255,255,.62);font-size:12px;line-height:1.6}.rmw-hours-notables{display:grid;gap:8px}.rmw-hours-notable{display:flex;gap:11px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--n-200)}.rmw-hours-notable:last-child{border-bottom:0}.rmw-hours-notable>i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--atlas);flex:0 0 auto}.rmw-hours-notable b,.rmw-hours-notable span{display:block}.rmw-hours-notable b{font-size:12.5px}.rmw-hours-notable span{margin-top:4px;color:var(--n-500);font-size:11.5px}@media(max-width:800px){.rmw-hours-kpis{grid-template-columns:1fr}.rmw-hours-row{grid-template-columns:110px minmax(120px,1fr) 42px}.rmw-hours-insight{padding:19px}}
`;document.head.appendChild(s);}
  /* /menu-part:styles */
  return {style, nutritionStyle, shellStyle, searchStyle, recipeStyle, itemStyle, performanceStyle, hoursStyle};
  };
})();
